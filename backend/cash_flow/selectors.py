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
        # cash_in_hand: actual cash available after expenses and supplier payments
        "cash_in_hand"              : cf.cash_in_hand,
        # customer_outstanding: what customers still owe us
        "customer_outstanding"      : cf.customer_outstanding,
        # total_invoices_cash: GROSS collected from customers (never reduced by expenses/payments)
        "total_invoices_cash"       : cf.total_invoices_cash,
        "total_number_of_invoices"  : Invoice.objects.filter(
                                          is_deleted=False, is_data_entry=False,
                                      ).exclude(status="draft").count(),

        # Payables
        # total_paid_payables: total cash ever paid to suppliers
        "total_paid_payables"           : cf.total_paid_payables,
        # total_outstanding_payable: what we still owe suppliers
        "total_outstanding_payable"     : cf.supplier_payable_outstanding,
        # total_purchases_cash: total purchase value confirmed (paid + outstanding)
        "total_purchases_cash"          : cf.total_purchases_cash,
        "total_number_of_purchases"     : PurchaseOrder.objects.filter(
                                              is_deleted=False,
                                              is_data_entry=False,
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
    Breakdown of all POSITIVE invoice payments received from customers.
    This is the total_invoices_cash breakdown (gross collections only).
    For full cash_in_hand movements (expenses, supplier payments) use get_cash_in_hand_breakdown().
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


def get_cash_in_hand_breakdown(
    *,
    date_from    : str = None,
    date_to      : str = None,
    movement_type: str = None,
) -> list:
    """
    Full cash_in_hand breakdown — ALL movements (inflows AND outflows):
      + Invoice payments received      (inflow)
      - Expenses paid                  (outflow)
      - Supplier payments made         (outflow)
      - Advance payments to suppliers  (outflow)

    movement_type: inflow | outflow (optional filter)
    Returns sorted list of dicts, newest first.
    """
    from billing.models import Payment
    from purchases.models import SupplierPayment
    from .models import Expense, OpeningCashEntry

    movements = []

    # --- Inflows: opening cash (data-entry bootstrap) ---
    oc_qs = OpeningCashEntry.objects.all()
    if _clean(date_from):
        oc_qs = oc_qs.filter(added_at__date__gte=_clean(date_from))
    if _clean(date_to):
        oc_qs = oc_qs.filter(added_at__date__lte=_clean(date_to))

    for e in oc_qs:
        movements.append({
            "direction"  : "inflow",
            "type"       : "opening_cash",
            "date"       : str(e.added_at.date()),
            "description": "Opening cash — data entry",
            "reference"  : f"OCE-{e.id}",
            "amount"     : e.amount,
            "method"     : None,
        })

    # --- Inflows: positive invoice payments ---
    inv_qs = Payment.objects.filter(
        is_deleted=False, amount__gt=0,
        invoice__is_deleted=False,
    ).exclude(invoice__status="draft").select_related("invoice__customer")

    if _clean(date_from):
        inv_qs = inv_qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        inv_qs = inv_qs.filter(payment_date__lte=_clean(date_to))

    for p in inv_qs:
        movements.append({
            "direction"  : "inflow",
            "type"       : "invoice_payment",
            "date"       : str(p.payment_date),
            "description": f"Received from {p.invoice.customer.name} ({p.invoice.bill_number})",
            "reference"  : p.reference_number,
            "amount"     : p.amount,
            "method"     : p.method,
        })

    # --- Outflows: expenses ---
    exp_qs = Expense.objects.filter(is_deleted=False)
    if _clean(date_from):
        exp_qs = exp_qs.filter(expense_date__gte=_clean(date_from))
    if _clean(date_to):
        exp_qs = exp_qs.filter(expense_date__lte=_clean(date_to))

    for e in exp_qs:
        movements.append({
            "direction"  : "outflow",
            "type"       : "expense",
            "date"       : str(e.expense_date),
            "description": f"Expense: {e.name} ({e.category.name})",
            "reference"  : f"EXP-{e.id}",
            "amount"     : e.amount,
            "method"     : None,
        })

    # --- Outflows: supplier payments ---
    sup_qs = SupplierPayment.objects.filter(
        is_deleted=False, amount__gt=0,
    ).select_related("order__supplier")
    if _clean(date_from):
        sup_qs = sup_qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        sup_qs = sup_qs.filter(payment_date__lte=_clean(date_to))

    for p in sup_qs:
        ptype = "advance_payment" if p.note.startswith("Advance payment") else "supplier_payment"
        movements.append({
            "direction"  : "outflow",
            "type"       : ptype,
            "date"       : str(p.payment_date),
            "description": f"Paid to {p.order.supplier.name} ({p.order.order_number})",
            "reference"  : p.reference_number,
            "amount"     : p.amount,
            "method"     : p.method,
        })

    # Filter by direction if requested
    if _clean(movement_type):
        movements = [m for m in movements if m["direction"] == _clean(movement_type)]

    # Sort newest first
    movements.sort(key=lambda x: x["date"], reverse=True)
    return movements


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
        is_data_entry=False,
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
        is_data_entry=False,
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
        is_data_entry=False,
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
        is_data_entry=False,
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