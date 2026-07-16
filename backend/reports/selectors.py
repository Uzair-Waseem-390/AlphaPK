from decimal import Decimal

from django.db.models import Count, QuerySet, Sum
from django.db.models.functions import Coalesce

from billing.models import Invoice, Payment
from cash_flow.models import Expense
from purchases.models import LostInventoryItem


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
