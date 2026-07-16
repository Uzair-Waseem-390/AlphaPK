from decimal import Decimal

from django.db.models import Count, Q, QuerySet, Sum
from django.db.models.functions import Coalesce

from billing.models import Invoice, Payment, Return
from cash_flow.models import CashFlow, Expense
from purchases.models import Inventory, LostInventoryItem, PurchaseItem, PurchaseOrder, PurchaseReturn


def _clean(value):
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


# ---------------------------------------------------------------------------
# Invoices report
# ---------------------------------------------------------------------------

def get_invoices_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    Non-draft invoices (confirmed/partial/returned — all real, finalized
    invoices), filtered by their confirmed_at date. `__date` lookups are
    evaluated in settings.TIME_ZONE (Asia/Karachi), so this already matches
    the local calendar day shown in the UI.
    """
    qs = Invoice.objects.filter(is_deleted=False, is_data_entry=False).exclude(
        status=Invoice.Status.DRAFT,
    ).select_related("customer").order_by("-confirmed_at")

    if _clean(date):
        qs = qs.filter(confirmed_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(confirmed_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(confirmed_at__date__lte=_clean(date_to))

    return qs


def get_invoices_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_invoices     = Count("id"),
        total_invoices_cash = Coalesce(Sum("grand_total"), Decimal("0")),
    )


def get_invoices_report_stats_all_time() -> dict:
    """
    No-filter case — reads the pre-synced CashFlow total instead of scanning
    the full invoice history. Count stays a live .count() (cheap regardless
    of table size, same reasoning already applied to the dashboard's
    total_number_of_invoices).
    """
    cf = CashFlow.get_instance()
    return {
        "total_invoices": Invoice.objects.filter(
            is_deleted=False, is_data_entry=False,
        ).exclude(status=Invoice.Status.DRAFT).count(),
        "total_invoices_cash": cf.total_invoice_revenue,
    }


# ---------------------------------------------------------------------------
# Cash collected report
# ---------------------------------------------------------------------------

def get_cash_collected_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    All payment collections (any method) — money that actually came in.
    Filtered by payment_date.
    """
    qs = Payment.objects.filter(
        is_deleted=False, amount__gt=0,
    ).select_related("invoice__customer").order_by("-payment_date")

    if _clean(date):
        qs = qs.filter(payment_date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(payment_date__lte=_clean(date_to))

    return qs


def get_cash_collected_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_payments        = Count("id"),
        total_cash_collected  = Coalesce(Sum("amount"), Decimal("0")),
    )


def get_cash_collected_report_stats_all_time() -> dict:
    """No-filter case — reads the pre-synced CashFlow total (payments received)."""
    cf = CashFlow.get_instance()
    return {
        "total_payments": Payment.objects.filter(is_deleted=False, amount__gt=0).count(),
        "total_cash_collected": cf.total_invoices_cash,
    }


# ---------------------------------------------------------------------------
# Expenses report
# ---------------------------------------------------------------------------

def get_expenses_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    All non-deleted expenses, filtered by expense_date.
    """
    qs = Expense.objects.filter(is_deleted=False).select_related("category").order_by("-expense_date")

    if _clean(date):
        qs = qs.filter(expense_date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(expense_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(expense_date__lte=_clean(date_to))

    return qs


def get_expenses_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_expenses      = Count("id"),
        total_expenses_cash = Coalesce(Sum("amount"), Decimal("0")),
    )


def get_expenses_report_stats_all_time() -> dict:
    """No-filter case — reads the pre-synced CashFlow total."""
    cf = CashFlow.get_instance()
    return {
        "total_expenses": Expense.objects.filter(is_deleted=False).count(),
        "total_expenses_cash": cf.total_expenses_amount,
    }


# ---------------------------------------------------------------------------
# Lost inventory report
# ---------------------------------------------------------------------------

def get_lost_inventory_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    Every product lost in a batch (LostInventoryItem), flattened to one row
    per product per batch. Filtered by the parent record's created_at date —
    LostInventoryItem itself has no date field.
    """
    qs = LostInventoryItem.objects.filter(record__is_deleted=False).select_related(
        "record", "product",
    ).order_by("-record__created_at")

    if _clean(date):
        qs = qs.filter(record__created_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(record__created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(record__created_at__date__lte=_clean(date_to))

    return qs


def get_lost_inventory_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_lost_items = Count("id"),
        total_lost_cash   = Coalesce(Sum("total_cost"), Decimal("0")),
    )


def get_lost_inventory_report_stats_all_time() -> dict:
    """No-filter case — reads the pre-synced CashFlow total."""
    cf = CashFlow.get_instance()
    return {
        "total_lost_items": LostInventoryItem.objects.filter(record__is_deleted=False).count(),
        "total_lost_cash": cf.total_lost_inventory_worth,
    }


# ---------------------------------------------------------------------------
# Purchase returns report
# ---------------------------------------------------------------------------

def get_purchase_returns_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    Accepted returns to suppliers, filtered by accepted_at. Pending returns
    are excluded — their financial fields are still 0 until acceptance.
    """
    qs = PurchaseReturn.objects.filter(
        is_deleted=False, status=PurchaseReturn.Status.ACCEPTED,
    ).select_related("order__supplier").order_by("-accepted_at")

    if _clean(date):
        qs = qs.filter(accepted_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(accepted_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(accepted_at__date__lte=_clean(date_to))

    return qs


def get_purchase_returns_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_returns      = Count("id"),
        total_return_value = Coalesce(Sum("total_return_amount"), Decimal("0")),
        total_return_cogs  = Coalesce(Sum("total_return_gross"), Decimal("0")),
    )


def get_purchase_returns_report_stats_all_time() -> dict:
    """No-filter case — reads the pre-synced CashFlow totals."""
    cf = CashFlow.get_instance()
    return {
        "total_returns": PurchaseReturn.objects.filter(
            is_deleted=False, status=PurchaseReturn.Status.ACCEPTED,
        ).count(),
        "total_return_value": cf.total_purchase_returns_value,
        "total_return_cogs": cf.total_purchase_returns_cogs,
    }


# ---------------------------------------------------------------------------
# Customer returns report
# ---------------------------------------------------------------------------

def get_customer_returns_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    Accepted returns from customers, filtered by accepted_at. Pending returns
    are excluded — their financial fields are still 0 until acceptance.
    """
    qs = Return.objects.filter(
        is_deleted=False, status=Return.Status.ACCEPTED,
    ).select_related("invoice__customer").order_by("-accepted_at")

    if _clean(date):
        qs = qs.filter(accepted_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(accepted_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(accepted_at__date__lte=_clean(date_to))

    return qs


def get_customer_returns_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_returns      = Count("id"),
        total_return_value = Coalesce(Sum("total_return_amount"), Decimal("0")),
        total_return_cogs  = Coalesce(Sum("total_return_cogs"), Decimal("0")),
    )


def get_customer_returns_report_stats_all_time() -> dict:
    """No-filter case — reads the pre-synced CashFlow totals."""
    cf = CashFlow.get_instance()
    return {
        "total_returns": Return.objects.filter(
            is_deleted=False, status=Return.Status.ACCEPTED,
        ).count(),
        "total_return_value": cf.total_customer_returns_value,
        "total_return_cogs": cf.total_customer_returns_cogs,
    }


# ---------------------------------------------------------------------------
# Profit / margin report
# ---------------------------------------------------------------------------

def get_profit_margin_report_queryset(
    *,
    date      : str = None,
    date_from : str = None,
    date_to   : str = None,
) -> QuerySet:
    """
    Non-draft invoices, filtered by confirmed_at. Revenue/COGS/profit are
    already stored per invoice (grand_total/total_cogs/gross_profit), kept
    in sync by return acceptance, so no per-item aggregation is needed.
    """
    qs = Invoice.objects.filter(is_deleted=False, is_data_entry=False).exclude(
        status=Invoice.Status.DRAFT,
    ).select_related("customer").order_by("-confirmed_at")

    if _clean(date):
        qs = qs.filter(confirmed_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(confirmed_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(confirmed_at__date__lte=_clean(date_to))

    return qs


def get_profit_margin_report_stats(queryset: QuerySet) -> dict:
    return queryset.aggregate(
        total_invoices     = Count("id"),
        total_revenue      = Coalesce(Sum("grand_total"), Decimal("0")),
        total_cogs         = Coalesce(Sum("total_cogs"), Decimal("0")),
        total_gross_profit = Coalesce(Sum("gross_profit"), Decimal("0")),
    )


def get_profit_margin_report_stats_all_time() -> dict:
    """No-filter case — reads the pre-synced CashFlow totals."""
    cf = CashFlow.get_instance()
    return {
        "total_invoices": Invoice.objects.filter(
            is_deleted=False, is_data_entry=False,
        ).exclude(status=Invoice.Status.DRAFT).count(),
        "total_revenue": cf.total_invoice_revenue,
        "total_cogs": cf.total_invoice_cogs,
        "total_gross_profit": cf.total_gross_profit,
    }


# ---------------------------------------------------------------------------
# Inventory valuation report — live snapshot, no date filtering
# ---------------------------------------------------------------------------

def get_inventory_valuation_report_data(*, search: str = None) -> list[dict]:
    """
    One row per product currently in stock, valued at FIFO cost from its
    remaining purchase batches. Point-in-time — no date filter applies.
    Mirrors the batch-walk math in purchases.selectors.get_fifo_cost_preview.

    Fetches every product's batches in ONE bulk query instead of one query
    per product (get_available_purchase_items_for_fifo called in a loop) —
    that N+1 pattern scaled with the size of the product catalog on every
    request; this is now 2 queries total regardless of catalog size.
    """
    inventory_qs = Inventory.objects.filter(quantity__gt=0).select_related(
        "product", "product__category",
    ).order_by("product__name")

    if _clean(search):
        inventory_qs = inventory_qs.filter(
            Q(product__name__icontains=_clean(search)) | Q(product__code__icontains=_clean(search))
        )

    inventories = list(inventory_qs)
    product_ids = [inv.product_id for inv in inventories]

    batches_by_product = {}
    batches = PurchaseItem.objects.filter(
        product_id__in=product_ids,
        is_deleted=False,
        order__status=PurchaseOrder.Status.CONFIRMED,
        remaining_quantity__gt=0,
    ).order_by("product_id", "order__confirmed_at")
    for batch in batches:
        batches_by_product.setdefault(batch.product_id, []).append(batch)

    rows = []
    for inv in inventories:
        total_value = Decimal("0")
        for batch in batches_by_product.get(inv.product_id, []):
            unit_cost = batch.total_price / batch.quantity if batch.quantity else batch.unit_price
            total_value += batch.remaining_quantity * unit_cost

        rows.append({
            "product_id": inv.product_id,
            "product_name": inv.product.name,
            "product_code": inv.product.code,
            "category_name": inv.product.category.name,
            "quantity_on_hand": inv.quantity,
            "avg_unit_cost": (total_value / inv.quantity) if inv.quantity else Decimal("0"),
            "total_value": total_value,
        })

    return rows


def get_inventory_valuation_report_stats(rows: list) -> dict:
    return {
        "total_products":         len(rows),
        "total_quantity_on_hand": sum((r["quantity_on_hand"] for r in rows), 0),
        "total_inventory_value":  sum((r["total_value"] for r in rows), Decimal("0")),
    }
