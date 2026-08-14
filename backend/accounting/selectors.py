from calendar import monthrange
from datetime import date as date_cls
from decimal import Decimal

from django.db.models import Subquery, Sum
from django.utils import timezone

from billing.models import Invoice
from purchases.models import PurchaseOrder
from assets.models import Asset

# ---------------------------------------------------------------------------
# Aging buckets — shared by A/R and A/P aging
# ---------------------------------------------------------------------------
# "current" = not yet past due. Everything else buckets by how many days
# past due. Both reports are bounded to rows with a nonzero outstanding
# balance (never all invoice/order history) — the same "live snapshot
# report" exception architecture.md carves out for Inventory Valuation.

AGING_BUCKETS = ("current", "1_30", "31_60", "61_90", "over_90")


def _bucket_for_days_overdue(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "current"
    if days_overdue <= 30:
        return "1_30"
    if days_overdue <= 60:
        return "31_60"
    if days_overdue <= 90:
        return "61_90"
    return "over_90"


def _empty_bucket_totals() -> dict:
    return {bucket: {"count": 0, "total": 0} for bucket in AGING_BUCKETS}


# ---------------------------------------------------------------------------
# A/R Aging — customers who owe us money, bucketed by invoice due date
# ---------------------------------------------------------------------------

def get_ar_aging_rows(*, bucket: str = None) -> list:
    """
    One row per outstanding invoice, newest-due-first is NOT the point here —
    ordered oldest-overdue-first (worst first) since that's what an aging
    report is for. Bounded to confirmed/partial invoices with
    credit_outstanding > 0 — see idx_invoice_outstanding partial index.

    `bucket`, when given, narrows to just that aging bucket (e.g. the AR
    Aging page's summary cards are clickable) — applied in Python after
    bucketing since the bucket itself is derived, not a stored column.
    """
    today = timezone.localdate()
    qs = (
        Invoice.objects
        .filter(
            status__in=[Invoice.Status.CONFIRMED, Invoice.Status.PARTIAL],
            is_data_entry=False,
            credit_outstanding__gt=0,
        )
        .select_related("customer")
        .only(
            "id", "bill_number", "confirmed_at", "payment_due_date",
            "credit_outstanding", "customer_id", "customer__name", "customer__code",
        )
    )

    rows = []
    for inv in qs:
        due = inv.payment_due_date or (
            timezone.localtime(inv.confirmed_at).date() if inv.confirmed_at else today
        )
        days_overdue = (today - due).days
        rows.append({
            "invoice_id": inv.id,
            "bill_number": inv.bill_number,
            "customer_id": inv.customer_id,
            "customer_name": inv.customer.name,
            "customer_code": inv.customer.code,
            "due_date": due,
            "days_overdue": days_overdue,
            "bucket": _bucket_for_days_overdue(days_overdue),
            "outstanding": inv.credit_outstanding,
        })

    rows.sort(key=lambda r: r["days_overdue"], reverse=True)
    if bucket:
        rows = [r for r in rows if r["bucket"] == bucket]
    return rows


def get_ar_aging_summary(rows: list = None) -> dict:
    rows = get_ar_aging_rows() if rows is None else rows
    totals = _empty_bucket_totals()
    grand_total = 0
    for row in rows:
        bucket = totals[row["bucket"]]
        bucket["count"] += 1
        bucket["total"] += row["outstanding"]
        grand_total += row["outstanding"]
    return {"buckets": totals, "grand_total": grand_total, "invoice_count": len(rows)}


# ---------------------------------------------------------------------------
# A/P Aging — what we owe suppliers, bucketed by purchase-order age
# ---------------------------------------------------------------------------
# purchases.PurchaseOrder has no due-date field (suppliers here are paid on
# whatever informal terms exist, not a tracked due date) — so "overdue" is
# approximated by age since confirmation, same convention as this report
# would use for any supplier with no stated credit terms. Documented here
# rather than silently treated as equivalent to a real due date.

def get_ap_aging_rows(*, bucket: str = None) -> list:
    """`bucket`, when given, narrows to just that aging bucket — see
    get_ar_aging_rows's docstring for the same convention."""
    today = timezone.localdate()
    qs = (
        PurchaseOrder.objects
        .filter(
            status=PurchaseOrder.Status.CONFIRMED,
            is_data_entry=False,
            payable_outstanding__gt=0,
        )
        .select_related("supplier")
        .only(
            "id", "order_number", "confirmed_at",
            "payable_outstanding", "supplier_id", "supplier__name", "supplier__code",
        )
    )

    rows = []
    for order in qs:
        confirmed_date = (
            timezone.localtime(order.confirmed_at).date() if order.confirmed_at else today
        )
        days_overdue = (today - confirmed_date).days
        rows.append({
            "order_id": order.id,
            "order_number": order.order_number,
            "supplier_id": order.supplier_id,
            "supplier_name": order.supplier.name,
            "supplier_code": order.supplier.code,
            "confirmed_date": confirmed_date,
            "days_overdue": days_overdue,
            "bucket": _bucket_for_days_overdue(days_overdue),
            "outstanding": order.payable_outstanding,
        })

    rows.sort(key=lambda r: r["days_overdue"], reverse=True)
    if bucket:
        rows = [r for r in rows if r["bucket"] == bucket]
    return rows


def get_ap_aging_summary(rows: list = None) -> dict:
    rows = get_ap_aging_rows() if rows is None else rows
    totals = _empty_bucket_totals()
    grand_total = 0
    for row in rows:
        bucket = totals[row["bucket"]]
        bucket["count"] += 1
        bucket["total"] += row["outstanding"]
        grand_total += row["outstanding"]
    return {"buckets": totals, "grand_total": grand_total, "order_count": len(rows)}


# ---------------------------------------------------------------------------
# Fixed Asset Register
# ---------------------------------------------------------------------------
# Reads only already-stored O(1) fields (Asset.cost/current_worth) — no
# AssetValuationEntry aggregation needed, accumulated depreciation is just
# cost - current_worth for depreciation-method assets.

def get_fixed_asset_register_rows(*, include_disposed: bool = False) -> list:
    qs = (
        Asset.objects
        .filter(is_deleted=False)
        .select_related("category", "disposal")
    )
    if not include_disposed:
        qs = qs.filter(is_disposed=False)

    rows = []
    for asset in qs:
        accumulated_depreciation = (
            asset.cost - asset.current_worth
            if asset.category.valuation_method == asset.category.ValuationMethod.DEPRECIATION
            else 0
        )
        disposal = getattr(asset, "disposal", None)
        rows.append({
            "asset_id": asset.id,
            "name": asset.name,
            "category": asset.category.name,
            "valuation_method": asset.category.valuation_method,
            "acquisition_date": asset.acquisition_date,
            "cost": asset.cost,
            "accumulated_depreciation": accumulated_depreciation,
            "net_book_value": asset.current_worth,
            "is_disposed": asset.is_disposed,
            "disposal_date": disposal.disposal_date if disposal else None,
            "disposal_type": disposal.disposal_type if disposal else None,
            "gain_loss_on_disposal": disposal.gain_loss if disposal else None,
        })
    return rows


def get_fixed_asset_register_summary(rows: list = None) -> dict:
    rows = get_fixed_asset_register_rows() if rows is None else rows
    return {
        "asset_count": len(rows),
        "total_cost": sum((r["cost"] for r in rows), 0),
        "total_accumulated_depreciation": sum((r["accumulated_depreciation"] for r in rows), 0),
        "total_net_book_value": sum((r["net_book_value"] for r in rows), 0),
    }


# ---------------------------------------------------------------------------
# Cash Flow Statement — classifies cash_flow.CashMovement into the standard
# Operating / Investing / Financing activities, aggregated over a date range.
# ---------------------------------------------------------------------------
# opening_cash is a one-time data-entry bootstrap event (the pre-existing
# balance registered at go-live) — not a real activity within any reporting
# period, so it's excluded from all three buckets rather than force-fit into
# one.

OPERATING_MOVEMENT_TYPES = {
    "invoice_payment", "advance_payment", "expense", "supplier_payment",
    "tax_payment", "wht_payment", "cash_lost", "cash_found",
    "recurring_expense_payment",
}
INVESTING_MOVEMENT_TYPES = {"asset_purchase", "asset_sold"}
FINANCING_MOVEMENT_TYPES = {
    "investor_investment", "investor_withdrawal", "owner_contribution",
    "owner_drawing", "investor_profit_payout", "owner_profit_payout",
}

_BUCKET_BY_MOVEMENT_TYPE = {
    **{mt: "operating" for mt in OPERATING_MOVEMENT_TYPES},
    **{mt: "investing" for mt in INVESTING_MOVEMENT_TYPES},
    **{mt: "financing" for mt in FINANCING_MOVEMENT_TYPES},
}

_MOVEMENT_TYPE_LABELS = {
    "invoice_payment": "Invoice Payments Received",
    "advance_payment": "Advance Payments",
    "expense": "Expenses Paid",
    "supplier_payment": "Supplier Payments",
    "tax_payment": "GST Payments to FBR",
    "wht_payment": "WHT Payments to FBR",
    "cash_lost": "Cash Lost",
    "cash_found": "Cash Found",
    "recurring_expense_payment": "Recurring Expense Payments",
    "asset_purchase": "Fixed Asset Purchases",
    "asset_sold": "Fixed Asset Sale Proceeds",
    "investor_investment": "Investor Contributions",
    "investor_withdrawal": "Investor Withdrawals",
    "owner_contribution": "Owner Contributions",
    "owner_drawing": "Owner Drawings",
    "investor_profit_payout": "Investor Profit Payouts",
    "owner_profit_payout": "Owner Profit Payouts",
}


def get_cash_flow_statement(*, date_from: str, date_to: str) -> dict:
    """
    One indexed GROUP BY query (movement_type, direction) over CashMovement's
    date range — never a per-row Python merge. Opening/closing cash balance
    is only included when date_to is today: closing = CashFlow.cash_in_hand
    (already O(1)), opening = closing - net_change. For any range that ends
    in the past, computing an opening balance would mean summing all
    CashMovement history before the range started — unbounded, so it's
    simply omitted rather than silently shipped as an O(n) query.
    """
    from cash_flow.models import CashFlow, CashMovement

    rows = (
        CashMovement.objects
        .filter(is_deleted=False, date__gte=date_from, date__lte=date_to)
        .exclude(movement_type="opening_cash")
        .values("movement_type", "direction")
        .annotate(total=Sum("amount"))
    )

    buckets = {"operating": [], "investing": [], "financing": []}
    bucket_totals = {"operating": Decimal("0"), "investing": Decimal("0"), "financing": Decimal("0")}
    for row in rows:
        bucket = _BUCKET_BY_MOVEMENT_TYPE.get(row["movement_type"])
        if bucket is None:
            continue
        signed = row["total"] if row["direction"] == CashMovement.Direction.INFLOW else -row["total"]
        buckets[bucket].append({
            "label": _MOVEMENT_TYPE_LABELS.get(row["movement_type"], row["movement_type"]),
            "amount": signed,
        })
        bucket_totals[bucket] += signed

    net_change = bucket_totals["operating"] + bucket_totals["investing"] + bucket_totals["financing"]

    result = {
        "date_from": date_from,
        "date_to": date_to,
        "operating": {"lines": buckets["operating"], "net": bucket_totals["operating"]},
        "investing": {"lines": buckets["investing"], "net": bucket_totals["investing"]},
        "financing": {"lines": buckets["financing"], "net": bucket_totals["financing"]},
        "net_change_in_cash": net_change,
        "opening_cash": None,
        "closing_cash": None,
    }

    if str(date_to) == timezone.localdate().isoformat():
        closing = CashFlow.get_instance().cash_in_hand
        result["closing_cash"] = closing
        result["opening_cash"] = closing - net_change

    return result


# ---------------------------------------------------------------------------
# Income Statement — reshapes profits.MonthlyProfit (finished months) or
# profits.selectors.get_current_month_profit() (current month, provisional)
# into standard statement layout, plus a per-category expense breakdown
# bounded to that one period.
# ---------------------------------------------------------------------------

def _period_bounds(period: str) -> tuple:
    year, month = int(period[:4]), int(period[5:7])
    first_day = date_cls(year, month, 1)
    last_day = date_cls(year, month, monthrange(year, month)[1])
    return first_day, last_day


def _get_expense_category_breakdown(period: str) -> list:
    """Bounded to ONE month's Expense/RecurringExpenseAssignmentPayment rows
    — never all history. Both source fields (expense_date, payment_date) are
    plain DateFields, already indexed."""
    from cash_flow.models import Expense
    from recurring_expenses.models import RecurringExpenseAssignmentPayment

    first_day, last_day = _period_bounds(period)

    expense_rows = (
        Expense.objects
        .filter(is_deleted=False, expense_date__gte=first_day, expense_date__lte=last_day)
        .values("category__name")
        .annotate(total=Sum("amount"))
    )
    recurring_rows = (
        RecurringExpenseAssignmentPayment.objects
        .filter(is_deleted=False, payment_date__gte=first_day, payment_date__lte=last_day)
        .values("assignment__category_name_snapshot")
        .annotate(total=Sum("amount"))
    )

    breakdown = [{"category": r["category__name"], "amount": r["total"]} for r in expense_rows]
    breakdown += [
        {"category": r["assignment__category_name_snapshot"], "amount": r["total"]}
        for r in recurring_rows
    ]
    return breakdown


def get_income_statement(*, period: str = None) -> dict:
    """
    period=None, or the current calendar month, returns the LIVE provisional
    figures (profits.get_current_month_profit) — never stored, always
    recomputed. Any other period reads the frozen profits.MonthlyProfit row
    for that period; raises MonthlyProfit.DoesNotExist if it was never
    finalized (same convention the Profits page already uses — the caller
    surfaces that as a 404, not a silent zero-filled statement).
    """
    from profits.models import MonthlyProfit
    from profits.selectors import get_current_month_net_profit_only

    today = timezone.localdate()
    current_period = f"{today.year:04d}-{today.month:02d}"

    if period is None or period == current_period:
        data = get_current_month_net_profit_only()
        resolved_period = current_period
    else:
        mp = MonthlyProfit.objects.get(period=period)
        data = {
            "period": mp.period,
            "is_provisional": False,
            "gross_revenue": mp.gross_revenue,
            "gross_cogs": mp.gross_cogs,
            "gross_profit": mp.gross_profit,
            "net_revenue": mp.net_revenue,
            "net_cogs": mp.net_cogs,
            "net_gross_profit": mp.net_gross_profit,
            "expenses_paid": mp.expenses_paid,
            "recurring_expenses_paid": mp.recurring_expenses_paid,
            "gst_paid": mp.gst_paid,
            "wht_paid": mp.wht_paid,
            "lost_cash": mp.lost_cash,
            "found_cash": mp.found_cash,
            "lost_inventory": mp.lost_inventory,
            "found_inventory": mp.found_inventory,
            "depreciation": mp.depreciation,
            "disposal_gain_loss": mp.disposal_gain_loss,
            "net_profit": mp.net_profit,
        }
        resolved_period = period

    data["expense_breakdown"] = _get_expense_category_breakdown(resolved_period)
    return data


# ---------------------------------------------------------------------------
# Balance Sheet
# ---------------------------------------------------------------------------
# "As of today" is live — every figure already lives in an O(1) singleton
# somewhere (CashFlow/AssetFlow/TaxFlow/CashManagementFlow/ProfitFlow),
# collapsed into ONE query via Subquery annotations instead of one round
# trip per singleton. Inventory value is the one exception (not a singleton
# — reuses the existing bounded Inventory Valuation query, 2 more queries).
# "As of a finished month" reads the frozen accounting.BalanceSheetSnapshot
# row for that period instead (see services.catch_up_balance_sheet_snapshots).

def _compute_opening_balance_equity() -> Decimal:
    """
    Net offset for go-live bootstrap data — sourced ENTIRELY from billing/
    purchases/cash_flow/cash_management, NEVER from data_entry.models. The
    data_entry app is a one-time bootstrap tool meant to be retired after
    go-live (per its own services.py docstrings, e.g. create_opening_stock:
    "Stored ... in cash_management ... so the record survives if this app
    is ever removed post-go-live") — every real bootstrap record already
    lives in the app it actually belongs to; data_entry.services only
    orchestrates writes to them. Importing data_entry.models here would
    make the ENTIRE Balance Sheet break the moment that app is removed, so
    this deliberately never does — verified by grepping for `is_data_entry`
    across the whole backend to enumerate every bootstrap path, not just
    the ones already known about.

    Five paths, each an asset OR liability/equity change with nothing
    offsetting it elsewhere — the first three were found by tracing a real
    Rs 1000 mismatch back to exactly this gap; the other two were added
    after being asked to specifically audit every data_entry edge case:
      + Customer Opening Balance    (billing.Invoice, receivable asset)
      + Opening Stock                (purchases.PurchaseOrder, inventory asset)
      + Opening Cash                  (cash_flow.CashMovement, cash asset)
      - Supplier Opening Balance        (purchases.PurchaseOrder, payable liability)
      - Opening Investor Investment       (cash_management.InvestorTransaction —
        inflates CashManagementFlow.net_investor_capital, which feeds this
        Balance Sheet's investor_capital, with NO cash asset behind it BY
        DESIGN — cash_management.services.create_investor_transaction's
        is_data_entry branch deliberately skips the cash_in_hand sync,
        since "the cash isn't actually sitting in the till". Without
        subtracting this, a business that recorded pre-existing investor
        capital this way would show equity exceeding assets by exactly
        that amount.)

    Each PO/Invoice/transaction query filters is_deleted=False defensively
    even though these rows are described as "permanently locked after
    creation" in data_entry.services — cheap insurance, not load-bearing.
    """
    from django.db.models import Exists, OuterRef
    from billing.models import Invoice
    from cash_flow.models import CashMovement
    from cash_management.models import InvestorTransaction
    from purchases.models import PurchaseItem, PurchaseOrder

    zero = Decimal("0")

    customer_ob_total = (
        Invoice.objects
        .filter(is_data_entry=True, is_deleted=False)
        .aggregate(t=Sum("grand_total"))["t"]
    ) or zero

    has_items = PurchaseItem.objects.filter(order=OuterRef("pk"), is_deleted=False)
    data_entry_orders = PurchaseOrder.objects.filter(
        is_data_entry=True, is_deleted=False, status=PurchaseOrder.Status.CONFIRMED,
    )
    # "Opening stock" POs have real line items; pure "opening balance" POs
    # never do — the same structural distinction as before, now applied to
    # BOTH sides instead of only the asset side.
    opening_stock_total = (
        data_entry_orders.filter(Exists(has_items)).aggregate(t=Sum("net_payable"))["t"]
    ) or zero
    supplier_ob_total = (
        data_entry_orders.exclude(Exists(has_items)).aggregate(t=Sum("net_payable"))["t"]
    ) or zero

    opening_cash_total = (
        CashMovement.objects
        .filter(movement_type="opening_cash", is_deleted=False)
        .aggregate(t=Sum("amount"))["t"]
    ) or zero

    opening_investor_investment_total = (
        InvestorTransaction.objects
        .filter(
            is_data_entry=True, is_deleted=False,
            transaction_type=InvestorTransaction.TransactionType.INVESTMENT,
        )
        .aggregate(t=Sum("amount"))["t"]
    ) or zero

    return (
        customer_ob_total + opening_stock_total + opening_cash_total
        - supplier_ob_total - opening_investor_investment_total
    )


def _assemble_balance_sheet(*, cash_in_hand, accounts_receivable, accounts_payable,
                              inventory_value, fixed_assets_nbv, gst_payable,
                              wht_payable, owner_capital, investor_capital,
                              opening_balance_equity, retained_earnings) -> dict:
    total_assets = cash_in_hand + accounts_receivable + inventory_value + fixed_assets_nbv
    total_liabilities = accounts_payable + gst_payable + wht_payable
    total_equity = owner_capital + investor_capital + opening_balance_equity + retained_earnings
    balance_check = total_assets - (total_liabilities + total_equity)

    return {
        "assets": {
            "cash_in_hand": cash_in_hand,
            "accounts_receivable": accounts_receivable,
            "inventory_value": inventory_value,
            "fixed_assets_nbv": fixed_assets_nbv,
            "total": total_assets,
        },
        "liabilities": {
            "accounts_payable": accounts_payable,
            "gst_payable": gst_payable,
            "wht_payable": wht_payable,
            "total": total_liabilities,
        },
        "equity": {
            "owner_capital": owner_capital,
            "investor_capital": investor_capital,
            "opening_balance_equity": opening_balance_equity,
            "retained_earnings": retained_earnings,
            "total": total_equity,
        },
        "balance_check": balance_check,
        "is_balanced": abs(balance_check) < Decimal("0.01"),
    }


def get_balance_sheet_live() -> dict:
    """
    ProfitFlow.total_net_profit only updates when a month is FINALIZED (the
    monthly catch-up), but inventory/receivables already move the instant an
    invoice is confirmed — so for the current, still-open month, Assets
    would silently outrun Equity by exactly that month's unrecognized
    profit if retained_earnings only counted finalized months. Adding
    get_current_month_profit()'s live provisional net_profit here (the same
    number the Profits page already shows) is what keeps this balanced —
    caught by the balance-check test itself before this fix, not assumed.
    """
    from cash_flow.models import CashFlow
    from assets.models import AssetFlow
    from taxes.models import TaxFlow
    from cash_management.models import CashManagementFlow
    from profits.models import ProfitFlow
    from profits.selectors import get_current_month_net_profit_only
    from reports.selectors import get_inventory_valuation_report_data, get_inventory_valuation_report_stats

    # CashFlow.get_instance() (get_or_create), NOT a bare .filter(pk=1) —
    # a business that's only ever used the Data Entry app's "Opening
    # Investor Investment" so far (deliberately skips cash_in_hand, see
    # _compute_opening_balance_equity's docstring) never triggers CashFlow's
    # creation any other way. A bare filter().first() would then return
    # None, `row` would fall back to {}, and EVERY field below — not just
    # the ones actually related to cash — would silently read as zero.
    # Found by a real test with only an investor investment and nothing
    # else, which should never happen for a value this load-bearing.
    CashFlow.get_instance()

    row = (
        CashFlow.objects.filter(pk=1)
        .annotate(
            _fixed_assets_nbv=Subquery(AssetFlow.objects.filter(pk=1).values("total_current_worth")[:1]),
            _gst_payable=Subquery(TaxFlow.objects.filter(pk=1).values("sales_tax_outstanding")[:1]),
            _wht_payable=Subquery(TaxFlow.objects.filter(pk=1).values("wht_outstanding")[:1]),
            _owner_capital=Subquery(CashManagementFlow.objects.filter(pk=1).values("net_owner_capital")[:1]),
            _investor_capital=Subquery(CashManagementFlow.objects.filter(pk=1).values("net_investor_capital")[:1]),
            _total_net_profit=Subquery(ProfitFlow.objects.filter(pk=1).values("total_net_profit")[:1]),
            _total_paid_investors=Subquery(ProfitFlow.objects.filter(pk=1).values("total_paid_out_to_investors")[:1]),
            _total_paid_owner=Subquery(ProfitFlow.objects.filter(pk=1).values("total_paid_out_to_owner")[:1]),
            _total_reinvested_investors=Subquery(ProfitFlow.objects.filter(pk=1).values("total_reinvested_by_investors")[:1]),
            _total_reinvested_owner=Subquery(ProfitFlow.objects.filter(pk=1).values("total_reinvested_by_owner")[:1]),
        )
        .values(
            "cash_in_hand", "customer_outstanding", "supplier_payable_outstanding",
            "_fixed_assets_nbv", "_gst_payable", "_wht_payable",
            "_owner_capital", "_investor_capital", "_total_net_profit",
            "_total_paid_investors", "_total_paid_owner",
            "_total_reinvested_investors", "_total_reinvested_owner",
        )
        .first()
    ) or {}

    zero = Decimal("0")
    current_month_net_profit = get_current_month_net_profit_only()["net_profit"]
    retained_earnings = (
        (row.get("_total_net_profit") or zero)
        + current_month_net_profit
        - (row.get("_total_paid_investors") or zero)
        - (row.get("_total_paid_owner") or zero)
        - (row.get("_total_reinvested_investors") or zero)
        - (row.get("_total_reinvested_owner") or zero)
    )

    inventory_rows = get_inventory_valuation_report_data()
    inventory_value = get_inventory_valuation_report_stats(inventory_rows)["total_inventory_value"]

    return _assemble_balance_sheet(
        cash_in_hand=row.get("cash_in_hand") or zero,
        accounts_receivable=row.get("customer_outstanding") or zero,
        accounts_payable=row.get("supplier_payable_outstanding") or zero,
        inventory_value=inventory_value,
        fixed_assets_nbv=row.get("_fixed_assets_nbv") or zero,
        gst_payable=row.get("_gst_payable") or zero,
        wht_payable=row.get("_wht_payable") or zero,
        owner_capital=row.get("_owner_capital") or zero,
        investor_capital=row.get("_investor_capital") or zero,
        opening_balance_equity=_compute_opening_balance_equity(),
        retained_earnings=retained_earnings,
    )


def get_balance_sheet_for_period(period: str) -> dict:
    """Reads the frozen snapshot — raises BalanceSheetSnapshot.DoesNotExist
    if that month was never caught up (same convention as
    get_income_statement's MonthlyProfit lookup)."""
    from .models import BalanceSheetSnapshot

    snap = BalanceSheetSnapshot.objects.get(period=period)
    return _assemble_balance_sheet(
        cash_in_hand=snap.cash_in_hand,
        accounts_receivable=snap.accounts_receivable,
        accounts_payable=snap.accounts_payable,
        inventory_value=snap.inventory_value,
        fixed_assets_nbv=snap.fixed_assets_nbv,
        gst_payable=snap.gst_payable,
        wht_payable=snap.wht_payable,
        owner_capital=snap.owner_capital,
        investor_capital=snap.investor_capital,
        opening_balance_equity=snap.opening_balance_equity,
        retained_earnings=snap.retained_earnings,
    )
