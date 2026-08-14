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
