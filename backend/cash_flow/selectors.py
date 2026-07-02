from decimal import Decimal

from django.db.models import Q, QuerySet, Sum, Count
from django.shortcuts import get_object_or_404

from .models import CashFlow, Expense, ExpenseCategory


# ---------------------------------------------------------------------------
# CashFlow stats (dashboard)
# ---------------------------------------------------------------------------

def get_cashflow_stats() -> dict:
    """
    Returns all 10 dashboard stats from the CashFlow singleton.
    Counts use .count() on the source models — never summed in runtime.
    """
    from billing.models import Invoice
    from purchases.models import PurchaseOrder

    cf = CashFlow.get_instance()

    return {
        # Receivables
        "cash_in_hand"              : cf.cash_in_hand,
        "customer_outstanding"      : cf.customer_outstanding,
        "total_invoices_cash"       : cf.total_invoices_cash,
        "total_number_of_invoices"  : Invoice.objects.filter(
                                          is_deleted=False
                                      ).exclude(status="draft").count(),

        # Payables
        "total_paid_payables"           : cf.total_paid_payables,
        "total_outstanding_payable"     : cf.supplier_payable_outstanding,
        "total_purchases_cash"          : cf.total_purchases_cash,
        "total_number_of_purchases"     : PurchaseOrder.objects.filter(
                                              is_deleted=False,
                                              status="confirmed",
                                          ).count(),

        # Expenses
        "total_expenses_amount"     : cf.total_expenses_amount,
        "total_number_of_expenses"  : Expense.objects.filter(is_deleted=False).count(),
    }


# ---------------------------------------------------------------------------
# Expense Category
# ---------------------------------------------------------------------------

def get_all_expense_categories() -> QuerySet:
    return ExpenseCategory.objects.all().order_by("name")


def get_expense_category_by_id(pk: int) -> ExpenseCategory:
    return get_object_or_404(ExpenseCategory, pk=pk)


# ---------------------------------------------------------------------------
# Expense
# ---------------------------------------------------------------------------

def get_all_expenses(
    *,
    category_id  : int = None,
    date_from    : str = None,
    date_to      : str = None,
    min_amount   : str = None,
    max_amount   : str = None,
    search       : str = None,
) -> QuerySet:
    """
    Returns all non-deleted expenses with full filter support.
    """
    qs = Expense.objects.filter(is_deleted=False).select_related(
        "category", "created_by", "updated_by"
    )

    if _clean(search):
        qs = qs.filter(
            Q(name__icontains=_clean(search)) |
            Q(description__icontains=_clean(search))
        )
    if category_id:
        qs = qs.filter(category_id=category_id)
    if _clean(date_from):
        qs = qs.filter(expense_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(expense_date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(amount__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(amount__lte=_clean(max_amount))

    return qs.order_by("-expense_date", "-created_at")


def get_expense_by_id(pk: int) -> Expense:
    return get_object_or_404(Expense, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Breakdown selectors — for dashboard drill-down
# ---------------------------------------------------------------------------

def get_invoice_payments_breakdown(
    *,
    customer_name  : str = None,
    customer_code  : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
    method         : str = None,
) -> QuerySet:
    """
    Breakdown of all positive invoice payments (cash received from customers).
    Supports full filtering for cash_in_hand and customer_outstanding drill-down.
    """
    from billing.models import Payment

    qs = Payment.objects.filter(
        is_deleted=False,
        amount__gt=0,
        invoice__is_deleted=False,
    ).select_related("invoice__customer", "created_by").exclude(
        invoice__status="draft"
    )

    if _clean(customer_name):
        qs = qs.filter(invoice__customer__name__icontains=_clean(customer_name))
    if _clean(customer_code):
        qs = qs.filter(invoice__customer__code__icontains=_clean(customer_code))
    if _clean(date_from):
        qs = qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(payment_date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(amount__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(amount__lte=_clean(max_amount))
    if _clean(method):
        qs = qs.filter(method=_clean(method))

    return qs.order_by("-payment_date")


def get_customer_outstanding_breakdown(
    *,
    customer_name  : str = None,
    customer_code  : str = None,
    payment_status : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
) -> QuerySet:
    """
    Breakdown of all invoices with outstanding balance (customer_outstanding drill-down).
    """
    from billing.models import Invoice

    qs = Invoice.objects.filter(
        is_deleted=False,
        credit_outstanding__gt=0,
    ).exclude(status="draft").select_related("customer")

    if _clean(customer_name):
        qs = qs.filter(customer__name__icontains=_clean(customer_name))
    if _clean(customer_code):
        qs = qs.filter(customer__code__icontains=_clean(customer_code))
    if _clean(payment_status):
        qs = qs.filter(payment_status=_clean(payment_status))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(credit_outstanding__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(credit_outstanding__lte=_clean(max_amount))

    return qs.order_by("-credit_outstanding")


def get_supplier_payments_breakdown(
    *,
    supplier_name : str = None,
    supplier_code : str = None,
    date_from     : str = None,
    date_to       : str = None,
    min_amount    : str = None,
    max_amount    : str = None,
    method        : str = None,
) -> QuerySet:
    """
    Breakdown of all supplier payments made (total_paid_payables drill-down).
    """
    from purchases.models import SupplierPayment

    qs = SupplierPayment.objects.filter(
        is_deleted=False,
        amount__gt=0,
    ).select_related("order__supplier", "created_by")

    if _clean(supplier_name):
        qs = qs.filter(order__supplier__name__icontains=_clean(supplier_name))
    if _clean(supplier_code):
        qs = qs.filter(order__supplier__code__icontains=_clean(supplier_code))
    if _clean(date_from):
        qs = qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(payment_date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(amount__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(amount__lte=_clean(max_amount))
    if _clean(method):
        qs = qs.filter(method=_clean(method))

    return qs.order_by("-payment_date")


def get_supplier_payable_outstanding_breakdown(
    *,
    supplier_name  : str = None,
    supplier_code  : str = None,
    payment_status : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
) -> QuerySet:
    """
    Breakdown of all purchase orders with outstanding payable
    (supplier_payable_outstanding drill-down).
    """
    from purchases.models import PurchaseOrder

    qs = PurchaseOrder.objects.filter(
        is_deleted=False,
        status="confirmed",
        payable_outstanding__gt=0,
    ).select_related("supplier")

    if _clean(supplier_name):
        qs = qs.filter(supplier__name__icontains=_clean(supplier_name))
    if _clean(supplier_code):
        qs = qs.filter(supplier__code__icontains=_clean(supplier_code))
    if _clean(payment_status):
        qs = qs.filter(payment_status=_clean(payment_status))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(payable_outstanding__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(payable_outstanding__lte=_clean(max_amount))

    return qs.order_by("-payable_outstanding")


def get_invoices_breakdown(
    *,
    customer_name  : str = None,
    customer_code  : str = None,
    payment_status : str = None,
    status         : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
) -> QuerySet:
    """
    Full invoice breakdown for the total_number_of_invoices drill-down.
    """
    from billing.models import Invoice

    qs = Invoice.objects.filter(
        is_deleted=False,
    ).exclude(status="draft").select_related("customer")

    if _clean(customer_name):
        qs = qs.filter(customer__name__icontains=_clean(customer_name))
    if _clean(customer_code):
        qs = qs.filter(customer__code__icontains=_clean(customer_code))
    if _clean(payment_status):
        qs = qs.filter(payment_status=_clean(payment_status))
    if _clean(status):
        qs = qs.filter(status=_clean(status))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(grand_total__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(grand_total__lte=_clean(max_amount))

    return qs.order_by("-created_at")


def get_purchases_breakdown(
    *,
    supplier_name  : str = None,
    supplier_code  : str = None,
    payment_status : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
) -> QuerySet:
    """
    Full purchase order breakdown for total_number_of_purchases drill-down.
    """
    from purchases.models import PurchaseOrder

    qs = PurchaseOrder.objects.filter(
        is_deleted=False,
        status="confirmed",
    ).select_related("supplier")

    if _clean(supplier_name):
        qs = qs.filter(supplier__name__icontains=_clean(supplier_name))
    if _clean(supplier_code):
        qs = qs.filter(supplier__code__icontains=_clean(supplier_code))
    if _clean(payment_status):
        qs = qs.filter(payment_status=_clean(payment_status))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(net_payable__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(net_payable__lte=_clean(max_amount))

    return qs.order_by("-created_at")


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _clean(value):
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped if stripped else None