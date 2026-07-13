from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404

from .models import Customer, Invoice, InvoiceItem, Payment, Return


# ---------------------------------------------------------------------------
# Customer
# ---------------------------------------------------------------------------

def get_all_customers(*, search: str = None) -> QuerySet:
    qs = Customer.objects.filter(is_deleted=False)
    if search:
        qs = qs.filter(
            Q(name__icontains=search) |
            Q(code__icontains=search) |
            Q(mobile__icontains=search)
        )
    return qs


def get_customer_by_id(pk: int) -> Customer:
    return get_object_or_404(Customer, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

def _invoice_qs():
    return Invoice.objects.select_related(
        "customer", "created_by", "updated_by", "confirmed_by", "deleted_by",
    ).prefetch_related(
        "items__product",
        "items__product__category",
        "items__product__shelf",
        "items__fifo_layers__purchase",
        "payments",
    )


def get_invoice_by_id(pk: int) -> Invoice:
    return get_object_or_404(_invoice_qs(), pk=pk, is_deleted=False)


def get_invoice_by_bill_number(bill_number: str) -> Invoice:
    return get_object_or_404(_invoice_qs(), bill_number=bill_number, is_deleted=False)


# ---------------------------------------------------------------------------
# Invoice Item
# ---------------------------------------------------------------------------

def get_invoice_item_by_id(pk: int) -> InvoiceItem:
    return get_object_or_404(
        InvoiceItem.objects.select_related(
            "invoice", "product",
        ),
        pk=pk,
    )


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

def get_payments_for_invoice(invoice_id: int, *, reference: str = None) -> QuerySet:
    qs = Payment.objects.filter(
        invoice_id=invoice_id, is_deleted=False
    ).select_related("created_by")
    if reference:
        qs = qs.filter(reference_number__icontains=reference.strip())
    return qs


def get_all_invoice_payments(
    *,
    reference     : str = None,
    customer_name : str = None,
    customer_code : str = None,
    method        : str = None,
    date_from     : str = None,
    date_to       : str = None,
) -> QuerySet:
    """Search billing payments across all invoices with full filter support."""
    qs = Payment.objects.filter(
        is_deleted=False, amount__gt=0,
    ).select_related("invoice__customer", "created_by").order_by("-payment_date")
    if _clean(reference):
        qs = qs.filter(reference_number__icontains=_clean(reference))
    if _clean(customer_name):
        qs = qs.filter(invoice__customer__name__icontains=_clean(customer_name))
    if _clean(customer_code):
        qs = qs.filter(invoice__customer__code__icontains=_clean(customer_code))
    if _clean(method):
        qs = qs.filter(method=_clean(method))
    if _clean(date_from):
        qs = qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(payment_date__lte=_clean(date_to))
    return qs


def get_payment_by_id(pk: int) -> Payment:
    return get_object_or_404(Payment, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Return
# ---------------------------------------------------------------------------

def get_returns_for_invoice(invoice_id: int) -> QuerySet:
    return Return.objects.filter(
        invoice_id=invoice_id, is_deleted=False,
    ).select_related("created_by", "accepted_by").prefetch_related(
        "items__invoice_item__product",
    )


def get_all_returns(
    *,
    reference: str = None,
    bill_number: str = None,
    customer_name: str = None,
    status: str = None,
    date_from: str = None,
    date_to: str = None,
) -> QuerySet:
    """Search all returns across all invoices with full filter support."""
    qs = Return.objects.filter(
        is_deleted=False,
    ).select_related("invoice__customer", "created_by", "accepted_by").prefetch_related(
        "items__invoice_item__product",
    ).order_by("-created_at")

    if _clean(reference):
        qs = qs.filter(reference_number__icontains=_clean(reference))
    if _clean(bill_number):
        qs = qs.filter(invoice__bill_number__icontains=_clean(bill_number))
    if _clean(customer_name):
        qs = qs.filter(invoice__customer__name__icontains=_clean(customer_name))
    if _clean(status):
        qs = qs.filter(status=_clean(status))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
        
    return qs


def get_return_by_id(pk: int) -> Return:
    return get_object_or_404(
        Return.objects.select_related(
            "invoice", "created_by", "accepted_by",
        ).prefetch_related("items__invoice_item__product"),
        pk=pk,
        is_deleted=False,
    )


# ---------------------------------------------------------------------------
# FIFO helper — used exclusively by services
# ---------------------------------------------------------------------------

def get_available_purchase_batches(product_id: int) -> QuerySet:
    """
    Returns confirmed PurchaseItems for a product that still have remaining stock,
    ordered oldest-confirmed first (FIFO order). Excludes soft-deleted items.
    Uses PurchaseItem (renamed from Purchase) from the purchases app.
    """
    from purchases.selectors import get_available_purchase_items_for_fifo
    return get_available_purchase_items_for_fifo(product_id)


# ---------------------------------------------------------------------------
# Payment summary selectors
# ---------------------------------------------------------------------------

def get_invoice_payment_summary(invoice_id: int) -> Invoice:
    """
    Returns a single invoice with full payment breakdown.
    cash_received, credit_outstanding, total_paid, remaining_amount
    are stored fields updated on every payment event.
    """
    return get_object_or_404(
        Invoice.objects.select_related("customer").prefetch_related(
            "payments", "items__product",
        ),
        pk=invoice_id,
        is_deleted=False,
    )


def get_customer_outstanding(customer_id: int) -> dict:
    """
    Returns a payment summary across ALL non-draft invoices for a customer.
    Excludes DRAFT invoices — only invoices that have been confirmed count.

    Uses grand_total (tax-inclusive) as the billing amount.
    If grand_total is 0 on old records (migrated before this field was added),
    falls back to subtotal so results are never misleadingly zero.
    """
    from django.db.models import Sum, Case, When, F
    from decimal import Decimal

    invoices = Invoice.objects.filter(
        customer_id=customer_id,
        is_deleted=False,
        is_data_entry=False,
    ).exclude(status=Invoice.Status.DRAFT)

    agg = invoices.aggregate(
        total_billed             = Sum("grand_total"),
        total_cash_received      = Sum("cash_received"),
        total_credit_outstanding = Sum("credit_outstanding"),
        total_paid               = Sum("total_paid"),
        total_remaining          = Sum("remaining_amount"),
    )

    return {
        "customer_id"              : customer_id,
        "total_billed"             : agg["total_billed"]             or Decimal("0"),
        "total_cash_received"      : agg["total_cash_received"]      or Decimal("0"),
        "total_credit_outstanding" : agg["total_credit_outstanding"] or Decimal("0"),
        "total_paid"               : agg["total_paid"]               or Decimal("0"),
        "total_remaining"          : agg["total_remaining"]          or Decimal("0"),
    }


def get_customers_with_outstanding(
    *,
    search          : str = None,
    customer_name   : str = None,
    customer_code   : str = None,
    payment_status  : str = None,
    min_outstanding : str = None,
    max_outstanding : str = None,
) -> "QuerySet":
    """
    Lists customers with credit_outstanding > 0, with full filter support.

    Filter params:
        search          : combined name OR code partial match
        customer_name   : name partial match (separate from code)
        customer_code   : code partial match (separate from name)
        payment_status  : unpaid | partial
        min_outstanding : minimum total outstanding
        max_outstanding : maximum total outstanding

    Note: search, customer_name, customer_code can be combined freely.
    """
    from django.db.models import Sum, Q
    from django.db.models.functions import Coalesce
    from django.db.models import DecimalField, Value

    invoice_filter = Q(
        invoices__is_deleted=False,
        invoices__is_data_entry=False,
        invoices__status__in=[
            Invoice.Status.CONFIRMED,
            Invoice.Status.PARTIAL,
            Invoice.Status.RETURNED,
        ],
    )
    if _clean(payment_status):
        invoice_filter &= Q(invoices__payment_status=_clean(payment_status))

    qs = Customer.objects.filter(is_deleted=False).annotate(
        outstanding=Coalesce(
            Sum("invoices__credit_outstanding", filter=invoice_filter),
            Value(0, output_field=DecimalField()),
        )
    ).filter(outstanding__gt=0)

    # Apply name/code filters AFTER annotation so outstanding is still correct
    if _clean(search):
        qs = qs.filter(
            Q(name__icontains=_clean(search)) |
            Q(code__icontains=_clean(search))
        )
    if _clean(customer_name):
        qs = qs.filter(name__icontains=_clean(customer_name))
    if _clean(customer_code):
        qs = qs.filter(code__icontains=_clean(customer_code))
    if _clean(min_outstanding):
        qs = qs.filter(outstanding__gte=_clean(min_outstanding))
    if _clean(max_outstanding):
        qs = qs.filter(outstanding__lte=_clean(max_outstanding))

    return qs.order_by("-outstanding")


# ---------------------------------------------------------------------------
# Invoice filtering selectors
# ---------------------------------------------------------------------------

def _clean(value):
    """Returns None if value is None or empty/whitespace string, else stripped value."""
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped if stripped else None


def get_filtered_invoices(
    *,
    status         : str  = None,
    customer_id    : int  = None,
    customer_name  : str  = None,
    customer_code  : str  = None,
    bill_number    : str  = None,
    date           : str  = None,
    date_from      : str  = None,
    date_to        : str  = None,
    payment_status : str  = None,
    min_amount     : str  = None,
    max_amount     : str  = None,
) -> "QuerySet":
    """
    Master invoice filter selector — all list views use this.
    Every parameter is optional; combining them narrows results.
    _clean() ensures empty strings from query params don't slip through.
    """
    qs = _invoice_qs().filter(is_deleted=False, is_data_entry=False)

    if _clean(status):
        qs = qs.filter(status=_clean(status))
    if _clean(customer_id):
        qs = qs.filter(customer_id=_clean(customer_id))
    if _clean(customer_name):
        qs = qs.filter(customer__name__icontains=_clean(customer_name))
    if _clean(customer_code):
        qs = qs.filter(customer__code__icontains=_clean(customer_code))
    if _clean(bill_number):
        qs = qs.filter(bill_number__icontains=_clean(bill_number))
    if _clean(date):
        qs = qs.filter(created_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(payment_status):
        qs = qs.filter(payment_status=_clean(payment_status))
    if _clean(min_amount):
        qs = qs.filter(grand_total__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(grand_total__lte=_clean(max_amount))

    return qs


def get_all_outstanding_invoices(
    *,
    customer_name  : str = None,
    customer_code  : str = None,
    payment_status : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_outstanding: str = None,
    max_outstanding: str = None,
) -> "QuerySet":
    """
    Returns all confirmed invoices with credit_outstanding > 0.
    Supports full filtering. Sorted by highest outstanding first.

    Query params:
        customer_name   : partial match
        customer_code   : partial match
        payment_status  : unpaid | partial
        date_from       : YYYY-MM-DD
        date_to         : YYYY-MM-DD
        min_outstanding : minimum credit_outstanding
        max_outstanding : maximum credit_outstanding
    """
    qs = _invoice_qs().filter(
        is_deleted=False,
        is_data_entry=False,
        credit_outstanding__gt=0,
    ).exclude(status=Invoice.Status.DRAFT)

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
    if _clean(min_outstanding):
        qs = qs.filter(credit_outstanding__gte=_clean(min_outstanding))
    if _clean(max_outstanding):
        qs = qs.filter(credit_outstanding__lte=_clean(max_outstanding))

    return qs.order_by("-credit_outstanding")