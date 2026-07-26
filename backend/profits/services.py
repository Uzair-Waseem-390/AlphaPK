from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import InvestorProfitPayout, MonthlyProfit, MonthlyProfitInvestorShare, ProfitFlow


# ---------------------------------------------------------------------------
# Small date helpers — no external date libraries needed
# ---------------------------------------------------------------------------

def _add_months(year: int, month: int, delta: int) -> tuple:
    total = (year * 12 + (month - 1)) + delta
    return total // 12, (total % 12) + 1


def _month_bounds(period: str) -> tuple:
    y, m = (int(p) for p in period.split("-"))
    first_day = date(y, m, 1)
    ny, nm = _add_months(y, m, 1)
    last_day = date(ny, nm, 1) - timedelta(days=1)
    return first_day, last_day


def _earliest_period():
    """The month of the earliest confirmed, non-draft, non-data-entry invoice — nothing to report before this."""
    from billing.models import Invoice

    first = (
        Invoice.objects.filter(is_deleted=False, is_data_entry=False)
        .exclude(status=Invoice.Status.DRAFT)
        .order_by("confirmed_at")
        .values_list("confirmed_at", flat=True)
        .first()
    )
    if not first:
        return None
    return f"{first.year:04d}-{first.month:02d}"


# ---------------------------------------------------------------------------
# Per-month deduction computations — each scoped to [first_day, last_day]
# ---------------------------------------------------------------------------

def _compute_expenses_paid(first_day, last_day) -> Decimal:
    from cash_flow.models import Expense

    total = Expense.objects.filter(
        is_deleted=False, expense_date__gte=first_day, expense_date__lte=last_day,
    ).aggregate(total=Sum("amount"))["total"]
    return total or Decimal("0")


def _compute_recurring_expenses_paid(first_day, last_day) -> Decimal:
    from recurring_expenses.models import RecurringExpenseAssignmentPayment

    total = RecurringExpenseAssignmentPayment.objects.filter(
        is_deleted=False, payment_date__gte=first_day, payment_date__lte=last_day,
    ).aggregate(total=Sum("amount"))["total"]
    return total or Decimal("0")


def _compute_gst_paid(first_day, last_day) -> Decimal:
    from taxes.models import TaxPayment

    total = TaxPayment.objects.filter(
        is_deleted=False, payment_date__gte=first_day, payment_date__lte=last_day,
    ).aggregate(total=Sum("amount"))["total"]
    return total or Decimal("0")


def _compute_wht_paid(first_day, last_day) -> Decimal:
    from taxes.models import WHTPayment

    total = WHTPayment.objects.filter(
        is_deleted=False, payment_date__gte=first_day, payment_date__lte=last_day,
    ).aggregate(total=Sum("amount"))["total"]
    return total or Decimal("0")


def _compute_lost_cash_net(first_day, last_day) -> Decimal:
    from cash_management.models import CashAdjustment

    lost = CashAdjustment.objects.filter(
        is_deleted=False, adjustment_type=CashAdjustment.AdjustmentType.LOST,
        adjustment_date__gte=first_day, adjustment_date__lte=last_day,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    found = CashAdjustment.objects.filter(
        is_deleted=False, adjustment_type=CashAdjustment.AdjustmentType.FOUND,
        adjustment_date__gte=first_day, adjustment_date__lte=last_day,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    return lost - found


def _compute_lost_inventory_net(first_day, last_day) -> Decimal:
    """
    Lost items whose batch (LostInventoryRecord) was created this month,
    net of each item's found_quantity AS OF right now. See MonthlyProfit's
    docstring for the known limitation this implies.
    """
    from purchases.models import LostInventoryRecord

    records = LostInventoryRecord.objects.filter(
        is_deleted=False, created_at__date__gte=first_day, created_at__date__lte=last_day,
    ).prefetch_related("items")

    total_net = Decimal("0")
    for record in records:
        for item in record.items.all():
            total_net += item.net_amount
    return total_net


def _compute_depreciation(period: str) -> Decimal:
    """Assumes assets.services catch-up has already run for this period — see catch_up_monthly_profits."""
    from assets.models import AssetValuationEntry

    total = AssetValuationEntry.objects.filter(
        entry_type=AssetValuationEntry.EntryType.DEPRECIATION, period=period,
    ).aggregate(total=Sum("amount"))["total"] or Decimal("0")
    return abs(total)  # stored negative for depreciation entries


def _compute_disposal_gain_loss(first_day, last_day) -> Decimal:
    from assets.models import AssetDisposal

    total = AssetDisposal.objects.filter(
        disposal_type=AssetDisposal.DisposalType.SOLD,
        disposal_date__gte=first_day, disposal_date__lte=last_day,
    ).aggregate(total=Sum("gain_loss"))["total"]
    return total or Decimal("0")


def _compute_share_status(share: MonthlyProfitInvestorShare) -> str:
    settled = share.amount_paid_out + share.amount_reinvested
    if settled <= 0:
        return MonthlyProfitInvestorShare.PaymentStatus.UNPAID
    if settled >= share.share_amount:
        return MonthlyProfitInvestorShare.PaymentStatus.PAID
    return MonthlyProfitInvestorShare.PaymentStatus.PARTIAL


# ---------------------------------------------------------------------------
# Internal atomic ProfitFlow adjuster — NEVER call from outside this module
# ---------------------------------------------------------------------------

def _adjust_profitflow(
    *,
    total_gross_profit_delta             : Decimal = Decimal("0"),
    total_net_gross_profit_delta         : Decimal = Decimal("0"),
    total_net_profit_delta               : Decimal = Decimal("0"),
    total_investor_profit_share_delta    : Decimal = Decimal("0"),
    total_owner_profit_share_delta       : Decimal = Decimal("0"),
    total_paid_out_to_investors_delta    : Decimal = Decimal("0"),
    total_reinvested_by_investors_delta  : Decimal = Decimal("0"),
    months_finalized_count_delta         : int = 0,
    user,
) -> ProfitFlow:
    with transaction.atomic():
        pf = ProfitFlow.objects.select_for_update().get_or_create(pk=1)[0]

        # Not floored — lifetime profit can legitimately go negative.
        pf.total_gross_profit           += total_gross_profit_delta
        pf.total_net_gross_profit       += total_net_gross_profit_delta
        pf.total_net_profit             += total_net_profit_delta
        pf.total_investor_profit_share  += total_investor_profit_share_delta
        pf.total_owner_profit_share     += total_owner_profit_share_delta
        pf.total_paid_out_to_investors   = max(Decimal("0"), pf.total_paid_out_to_investors + total_paid_out_to_investors_delta)
        pf.total_reinvested_by_investors = max(Decimal("0"), pf.total_reinvested_by_investors + total_reinvested_by_investors_delta)
        pf.months_finalized_count        = max(0, pf.months_finalized_count + months_finalized_count_delta)

        pf.last_updated_by = user
        pf.save()
        return pf


# ---------------------------------------------------------------------------
# Finalization — catch-up on read, no cron (mirrors assets/recurring_expenses)
# ---------------------------------------------------------------------------

@transaction.atomic
def _finalize_month(period: str, user=None) -> MonthlyProfit:
    """Idempotent — a period that already has a row is returned as-is, never recomputed."""
    existing = MonthlyProfit.objects.filter(period=period).first()
    if existing:
        return existing

    first_day, last_day = _month_bounds(period)

    from cash_flow.selectors import get_gross_profit_trend
    row = get_gross_profit_trend(date_from=first_day.isoformat(), date_to=last_day.isoformat())[0]

    expenses_paid            = _compute_expenses_paid(first_day, last_day)
    recurring_expenses_paid  = _compute_recurring_expenses_paid(first_day, last_day)
    gst_paid                  = _compute_gst_paid(first_day, last_day)
    wht_paid                  = _compute_wht_paid(first_day, last_day)
    lost_inventory_net        = _compute_lost_inventory_net(first_day, last_day)
    lost_cash_net             = _compute_lost_cash_net(first_day, last_day)
    depreciation              = _compute_depreciation(period)
    disposal_gain_loss        = _compute_disposal_gain_loss(first_day, last_day)

    net_profit = (
        row["net_gross_profit"]
        - expenses_paid - recurring_expenses_paid - gst_paid - wht_paid
        - lost_inventory_net - lost_cash_net - depreciation
        + disposal_gain_loss
    )

    mp = MonthlyProfit.objects.create(
        period=period,
        gross_revenue=row["revenue"], gross_cogs=row["cogs"], gross_profit=row["gross_profit"],
        net_revenue=row["net_revenue"], net_cogs=row["net_cogs"], net_gross_profit=row["net_gross_profit"],
        expenses_paid=expenses_paid, recurring_expenses_paid=recurring_expenses_paid,
        gst_paid=gst_paid, wht_paid=wht_paid,
        lost_inventory_net=lost_inventory_net, lost_cash_net=lost_cash_net,
        depreciation=depreciation, disposal_gain_loss=disposal_gain_loss,
        net_profit=net_profit,
    )

    # Snapshot the ownership split AT THIS MOMENT — frozen forever on the
    # share rows, never recalculated even if current ownership % later moves.
    from profits.selectors import get_ownership_split
    split = get_ownership_split()

    from cash_management.models import Investor

    investor_amounts_sum   = Decimal("0")
    total_investor_percent = Decimal("0")
    for inv in split["investors"]:
        total_investor_percent += inv["share_percent"]
        if inv["current_worth"] <= 0:
            continue  # a fully-exited investor gets no share row for this month
        share_amount = (net_profit * inv["share_percent"] / Decimal("100")).quantize(Decimal("0.0001"))
        investor_amounts_sum += share_amount
        MonthlyProfitInvestorShare.objects.create(
            monthly_profit=mp,
            investor=Investor.objects.get(pk=inv["id"]),
            investor_name_snapshot=inv["name"],
            share_percent_snapshot=inv["share_percent"],
            share_amount=share_amount,
        )

    # Owner gets the exact remainder — guarantees investor + owner amounts
    # always sum to net_profit exactly, no rounding drift.
    owner_share_amount = net_profit - investor_amounts_sum

    mp.total_investor_share_percent = total_investor_percent
    mp.total_investor_share_amount  = investor_amounts_sum
    mp.owner_share_percent          = split["owner_share_percent"]
    mp.owner_share_amount           = owner_share_amount
    mp.save(update_fields=[
        "total_investor_share_percent", "total_investor_share_amount",
        "owner_share_percent", "owner_share_amount",
    ])

    _adjust_profitflow(
        total_gross_profit_delta=row["gross_profit"],
        total_net_gross_profit_delta=row["net_gross_profit"],
        total_net_profit_delta=net_profit,
        total_investor_profit_share_delta=investor_amounts_sum,
        total_owner_profit_share_delta=owner_share_amount,
        months_finalized_count_delta=1,
        user=user,
    )

    return mp


def catch_up_monthly_profits(user=None) -> None:
    """
    Creates any missing FINISHED month rows, from the month after the latest
    existing one (or the earliest confirmed invoice's month, if none exist
    yet) up to — but never including — the current, still-open month. Called
    from every profits.selectors read path, same as assets/recurring_expenses
    catch-up. A no-op most of the time (single query, zero iterations).
    """
    today = timezone.localdate()
    current_period = f"{today.year:04d}-{today.month:02d}"

    last_row = MonthlyProfit.objects.order_by("-period").first()
    if last_row:
        y, m = (int(p) for p in last_row.period.split("-"))
        next_y, next_m = _add_months(y, m, 1)
    else:
        earliest = _earliest_period()
        if not earliest:
            return  # no confirmed invoices at all yet — nothing to report
        next_y, next_m = (int(p) for p in earliest.split("-"))

    next_period = f"{next_y:04d}-{next_m:02d}"
    if next_period >= current_period:
        return  # already caught up

    # Depreciation is posted by assets' own catch-up, which only runs when
    # something reads the assets app — make sure it's current before we
    # read AssetValuationEntry rows below for every period we're about to finalize.
    from assets.selectors import get_asset_stats
    get_asset_stats()

    while next_period < current_period:
        _finalize_month(next_period, user=user)
        next_y, next_m = _add_months(next_y, next_m, 1)
        next_period = f"{next_y:04d}-{next_m:02d}"


# ---------------------------------------------------------------------------
# InvestorProfitPayout services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_investor_profit_payout(
    *, share_id: int, amount: Decimal, action_type: str, payout_date, note: str = "", user,
) -> InvestorProfitPayout:
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    if amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    if action_type not in (InvestorProfitPayout.ActionType.PAYOUT, InvestorProfitPayout.ActionType.REINVEST):
        raise ValidationError({"action_type": "Must be 'payout' or 'reinvest'."})

    share = get_object_or_404(
        MonthlyProfitInvestorShare.objects.select_for_update().select_related("investor", "monthly_profit"),
        pk=share_id,
    )

    remaining = share.amount_remaining
    if amount > remaining:
        raise ValidationError({
            "amount": f"Amount exceeds this investor's remaining share balance. Remaining: {remaining}."
        })

    payout = InvestorProfitPayout.objects.create(
        share=share, amount=amount, payout_date=payout_date, action_type=action_type,
        note=note, created_by=user, updated_by=user,
    )

    # Always: real cash leaves for this share, regardless of what happens next.
    from cash_flow.services import sync_investor_profit_payout_made
    sync_investor_profit_payout_made(amount=amount, user=user)

    if action_type == InvestorProfitPayout.ActionType.PAYOUT:
        share.amount_paid_out += amount
        _adjust_profitflow(total_paid_out_to_investors_delta=+amount, user=user)
    else:
        # Reinvest: the same amount immediately comes back in as a genuine
        # new investment — real capital growth, not a payout-in-disguise.
        from cash_management.models import InvestorTransaction
        from cash_management.services import create_investor_transaction

        txn = create_investor_transaction(
            investor_id=share.investor_id,
            transaction_type=InvestorTransaction.TransactionType.INVESTMENT,
            amount=amount,
            transaction_date=payout_date,
            note=f"Reinvested profit share — {share.monthly_profit.period} (payout #{payout.id})",
            user=user,
        )
        payout.linked_investor_transaction = txn
        payout.save(update_fields=["linked_investor_transaction"])

        share.amount_reinvested += amount
        _adjust_profitflow(total_reinvested_by_investors_delta=+amount, user=user)

    share.payment_status = _compute_share_status(share)
    share.save(update_fields=["amount_paid_out", "amount_reinvested", "payment_status"])

    return payout


@transaction.atomic
def delete_investor_profit_payout(*, pk: int, user) -> None:
    from django.shortcuts import get_object_or_404

    payout = get_object_or_404(InvestorProfitPayout, pk=pk, is_deleted=False)
    share  = MonthlyProfitInvestorShare.objects.select_for_update().get(pk=payout.share_id)
    amount = payout.amount

    payout.is_deleted = True
    payout.deleted_at = timezone.now()
    payout.deleted_by = user
    payout.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])

    # Reverse the outflow every payout action performed, regardless of type.
    from cash_flow.services import sync_investor_profit_payout_reversed
    sync_investor_profit_payout_reversed(amount=amount, user=user)

    if payout.action_type == InvestorProfitPayout.ActionType.PAYOUT:
        share.amount_paid_out = max(Decimal("0"), share.amount_paid_out - amount)
        _adjust_profitflow(total_paid_out_to_investors_delta=-amount, user=user)
    else:
        if payout.linked_investor_transaction_id:
            from cash_management.services import delete_investor_transaction
            delete_investor_transaction(pk=payout.linked_investor_transaction_id, user=user)
        share.amount_reinvested = max(Decimal("0"), share.amount_reinvested - amount)
        _adjust_profitflow(total_reinvested_by_investors_delta=-amount, user=user)

    share.payment_status = _compute_share_status(share)
    share.save(update_fields=["amount_paid_out", "amount_reinvested", "payment_status"])
