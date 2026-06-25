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


def get_all_invoices(*, status: str = None, customer_id: int = None) -> QuerySet:
    qs = _invoice_qs().filter(is_deleted=False)
    if status:
        qs = qs.filter(status=status)
    if customer_id:
        qs = qs.filter(customer_id=customer_id)
    return qs


def get_draft_invoices() -> QuerySet:
    return _invoice_qs().filter(is_deleted=False, status=Invoice.Status.DRAFT)


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

def get_payments_for_invoice(invoice_id: int) -> QuerySet:
    return Payment.objects.filter(
        invoice_id=invoice_id, is_deleted=False
    ).select_related("created_by")


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
    Returns purchase batches for a product that still have remaining stock,
    ordered oldest first (FIFO order). Excludes soft-deleted purchases.
    """
    from purchases.models import Purchase
    return (
        Purchase.objects
        .filter(
            product_id=product_id,
            is_deleted=False,
            remaining_quantity__gt=0,
        )
        .order_by("created_at")   # oldest first = FIFO
    )