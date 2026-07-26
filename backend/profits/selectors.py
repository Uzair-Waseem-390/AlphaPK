from decimal import Decimal


def get_business_worth() -> dict:
    """
    Total Business Worth — a live net-worth (balance-sheet) read, not a
    stored/synced figure. Every component is either already an O(1)
    singleton field on another app's Flow model, or a bounded live
    computation (Inventory Valuation — cost scales with today's distinct
    product count, not history size, same reasoning as the existing
    Inventory Valuation Report). No new sync wiring needed anywhere.

    Assets:
        + cash_in_hand                  (CashFlow)
        + inventory_value               (live FIFO cost, reports selectors)
        + assets_current_worth          (AssetFlow)
        + customer_outstanding          (CashFlow — accounts receivable)
    Liabilities (subtracted):
        - supplier_payable_outstanding  (CashFlow — accounts payable)
        - sales_tax_outstanding         (TaxFlow — GST owed to FBR)
        - wht_outstanding               (TaxFlow — WHT withheld from suppliers, not yet deposited)
        - recurring_expense_pending     (RecurringExpenseFlow — assigned but unpaid dues)
    """
    from assets.models import AssetFlow
    from cash_flow.models import CashFlow
    from recurring_expenses.models import RecurringExpenseFlow
    from reports.selectors import get_inventory_valuation_report_data, get_inventory_valuation_report_stats
    from taxes.models import TaxFlow

    cf   = CashFlow.get_instance()
    af   = AssetFlow.get_instance()
    tf   = TaxFlow.get_instance()
    ref  = RecurringExpenseFlow.get_instance()

    inventory_rows  = get_inventory_valuation_report_data()
    inventory_stats = get_inventory_valuation_report_stats(inventory_rows)
    inventory_value = inventory_stats["total_inventory_value"]

    cash_in_hand                 = cf.cash_in_hand
    assets_current_worth         = af.total_current_worth
    customer_outstanding         = cf.customer_outstanding
    supplier_payable_outstanding = cf.supplier_payable_outstanding
    sales_tax_outstanding        = tf.sales_tax_outstanding
    wht_outstanding              = tf.wht_outstanding
    recurring_expense_pending    = ref.total_pending_amount

    total_business_worth = (
        cash_in_hand
        + inventory_value
        + assets_current_worth
        + customer_outstanding
        - supplier_payable_outstanding
        - sales_tax_outstanding
        - wht_outstanding
        - recurring_expense_pending
    )

    return {
        "cash_in_hand"                 : cash_in_hand,
        "inventory_value"              : inventory_value,
        "assets_current_worth"         : assets_current_worth,
        "customer_outstanding"         : customer_outstanding,
        "supplier_payable_outstanding" : supplier_payable_outstanding,
        "sales_tax_outstanding"        : sales_tax_outstanding,
        "wht_outstanding"              : wht_outstanding,
        "recurring_expense_pending"    : recurring_expense_pending,
        "total_business_worth"         : total_business_worth,
    }


def get_ownership_split() -> dict:
    """
    Splits total_business_worth between investors (by their theoretical,
    growth-compounded current_worth) and the owner (the residual). Never
    netted or capped — if investors' combined current_worth exceeds actual
    business worth, owner_share_percent goes negative on purpose (mirrors
    CashManagementFlow.net_owner_capital, which is already allowed to go
    negative for the same reason).
    """
    from cash_management.models import CashManagementFlow, Investor

    worth = get_business_worth()
    total_business_worth = worth["total_business_worth"]

    cmf = CashManagementFlow.get_instance()
    total_investor_net_worth = cmf.total_investor_net_worth

    investors_qs = Investor.objects.filter(is_deleted=False).order_by("name")

    def _share_percent(amount: Decimal) -> Decimal:
        if total_business_worth == 0:
            return Decimal("0")
        return (amount / total_business_worth) * Decimal("100")

    investors = [
        {
            "id"             : inv.id,
            "name"           : inv.name,
            "current_worth"  : inv.current_worth,
            "share_percent"  : _share_percent(inv.current_worth),
        }
        for inv in investors_qs
    ]

    owner_worth         = total_business_worth - total_investor_net_worth
    owner_share_percent = Decimal("100") - _share_percent(total_investor_net_worth)

    return {
        **worth,
        "total_investor_net_worth" : total_investor_net_worth,
        "investors"                 : investors,
        "owner_worth"                : owner_worth,
        "owner_share_percent"        : owner_share_percent,
    }


# ---------------------------------------------------------------------------
# Monthly Profit — every read path runs catch-up first (no cron), same
# pattern as assets/recurring_expenses (see services.catch_up_monthly_profits)
# ---------------------------------------------------------------------------

def get_all_monthly_profits():
    from .models import MonthlyProfit
    from .services import catch_up_monthly_profits

    catch_up_monthly_profits()
    return MonthlyProfit.objects.order_by("-period")


def get_monthly_profit_by_period(period: str):
    from django.shortcuts import get_object_or_404
    from .models import MonthlyProfit
    from .services import catch_up_monthly_profits

    catch_up_monthly_profits()
    return get_object_or_404(
        MonthlyProfit.objects.prefetch_related("investor_shares__payouts", "investor_shares__investor"),
        period=period,
    )


def get_current_month_profit() -> dict:
    """
    Live, provisional figures for the current, still-open month — never
    stored, always recomputed, clearly flagged so the caller never confuses
    it with a finalized MonthlyProfit row.
    """
    from django.utils import timezone
    from .services import (
        _compute_depreciation, _compute_disposal_gain_loss, _compute_expenses_paid,
        _compute_gst_paid, _compute_lost_cash_net, _compute_lost_inventory_net,
        _compute_recurring_expenses_paid, _compute_wht_paid, _month_bounds,
    )

    today = timezone.localdate()
    period = f"{today.year:04d}-{today.month:02d}"
    first_day, _ = _month_bounds(period)
    last_day = today  # only up to today — the month itself isn't over yet

    from cash_flow.selectors import get_gross_profit_trend
    row = get_gross_profit_trend(date_from=first_day.isoformat(), date_to=last_day.isoformat())[0]

    expenses_paid           = _compute_expenses_paid(first_day, last_day)
    recurring_expenses_paid = _compute_recurring_expenses_paid(first_day, last_day)
    gst_paid                 = _compute_gst_paid(first_day, last_day)
    wht_paid                 = _compute_wht_paid(first_day, last_day)
    lost_inventory_net       = _compute_lost_inventory_net(first_day, last_day)
    lost_cash_net            = _compute_lost_cash_net(first_day, last_day)
    depreciation             = _compute_depreciation(period)
    disposal_gain_loss       = _compute_disposal_gain_loss(first_day, last_day)

    net_profit = (
        row["net_gross_profit"]
        - expenses_paid - recurring_expenses_paid - gst_paid - wht_paid
        - lost_inventory_net - lost_cash_net - depreciation
        + disposal_gain_loss
    )

    # Live preview only — informational, never stored, no settle actions
    # possible against it. Applying today's ownership % to a still-moving
    # net_profit would make any payout amount potentially wrong once the
    # month actually finalizes, so this is read-only by design.
    split = get_ownership_split()
    investors_preview = [
        {
            "id"            : inv["id"],
            "name"          : inv["name"],
            "share_percent" : inv["share_percent"],
            "share_amount"  : (net_profit * inv["share_percent"] / Decimal("100")).quantize(Decimal("0.0001")),
        }
        for inv in split["investors"]
    ]
    investor_preview_sum = sum((inv["share_amount"] for inv in investors_preview), Decimal("0"))
    owner_preview_amount = net_profit - investor_preview_sum

    return {
        "period"                   : period,
        "is_provisional"           : True,
        "gross_revenue"            : row["revenue"],
        "gross_cogs"                : row["cogs"],
        "gross_profit"              : row["gross_profit"],
        "net_revenue"               : row["net_revenue"],
        "net_cogs"                  : row["net_cogs"],
        "net_gross_profit"          : row["net_gross_profit"],
        "expenses_paid"             : expenses_paid,
        "recurring_expenses_paid"   : recurring_expenses_paid,
        "gst_paid"                   : gst_paid,
        "wht_paid"                   : wht_paid,
        "lost_inventory_net"         : lost_inventory_net,
        "lost_cash_net"              : lost_cash_net,
        "depreciation"                : depreciation,
        "disposal_gain_loss"          : disposal_gain_loss,
        "net_profit"                  : net_profit,
        "investors_preview"             : investors_preview,
        "owner_share_percent"           : split["owner_share_percent"],
        "owner_share_amount_preview"    : owner_preview_amount,
    }


def get_net_profit_trend(*, months: int = 12) -> list:
    """
    Cheap read straight off stored MonthlyProfit rows (catch-up already
    keeps them current) — powers the dashboard's Net Profit Trend chart,
    no live aggregation needed at all.
    """
    from .models import MonthlyProfit
    from .services import catch_up_monthly_profits

    catch_up_monthly_profits()
    rows = MonthlyProfit.objects.order_by("-period")[:months]
    return [
        {
            "month"        : r.period,
            "gross_profit" : r.gross_profit,
            "net_gross_profit" : r.net_gross_profit,
            "net_profit"   : r.net_profit,
        }
        for r in reversed(list(rows))
    ]


def get_profit_flow_stats() -> dict:
    from .models import ProfitFlow
    from .services import catch_up_monthly_profits

    catch_up_monthly_profits()
    pf = ProfitFlow.get_instance()
    return {
        "total_net_profit"              : pf.total_net_profit,
        "total_investor_profit_share"   : pf.total_investor_profit_share,
        "total_owner_profit_share"      : pf.total_owner_profit_share,
        "total_paid_out_to_investors"   : pf.total_paid_out_to_investors,
        "total_reinvested_by_investors" : pf.total_reinvested_by_investors,
        "months_finalized_count"        : pf.months_finalized_count,
    }


def get_investor_profit_payout_by_id(pk: int):
    from django.shortcuts import get_object_or_404
    from .models import InvestorProfitPayout

    return get_object_or_404(
        InvestorProfitPayout.objects.select_related("share__monthly_profit", "share__investor"),
        pk=pk, is_deleted=False,
    )


def get_all_investor_profit_payouts():
    """
    Every profit settlement (payout or reinvest) ever recorded, across every
    investor and every month, newest-created first. Deliberately does NOT
    include capital withdrawals (cash_management.InvestorTransaction,
    WITHDRAWAL type) — those are a completely different concept (return of
    capital, not a profit distribution) and live in a different model
    entirely, so they're naturally excluded here just by querying this one.
    """
    from .models import InvestorProfitPayout

    return InvestorProfitPayout.objects.filter(is_deleted=False).select_related(
        "share__investor", "share__monthly_profit", "created_by",
    ).order_by("-created_at")


def get_investor_monthly_shares(investor_id: int):
    """
    One investor's profit share across every finalized month they had a
    stake in, newest month first — feeds the per-investor profit page
    (stats header + month-by-month settle list), separate from
    cash_management's investor CRUD/withdrawal pages.
    """
    from .models import MonthlyProfitInvestorShare
    from .services import catch_up_monthly_profits

    catch_up_monthly_profits()
    return MonthlyProfitInvestorShare.objects.filter(
        investor_id=investor_id,
    ).select_related("monthly_profit").order_by("-monthly_profit__period")
