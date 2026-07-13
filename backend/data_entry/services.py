from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    CustomerOpeningBalance, OpeningCashEntry, SupplierOpeningBalance,
)


# ---------------------------------------------------------------------------
# Feature 1 — Supplier Opening Balance
# ---------------------------------------------------------------------------

@transaction.atomic
def create_supplier_opening_balance(*, supplier_id: int, amount: Decimal, note: str = "", user) -> SupplierOpeningBalance:
    """
    One-time opening balance for a supplier (what we owed before go-live).
    Permanently locked after creation. Touches:
        - PurchaseOrder  : confirmed, is_data_entry=True, net_payable=amount
        - CashFlow       : supplier_payable_outstanding += amount, total_purchases_cash += amount
        - SupplierLedger : ONE opening_balance credit entry
        - SupplierOpeningBalance record
    """
    from purchases.selectors import get_supplier_by_id
    from purchases.services import create_opening_balance_order
    from cash_flow.services import sync_data_entry_supplier_opening_balance
    from ledger.services import add_opening_balance_entry

    supplier = get_supplier_by_id(supplier_id)   # 404 if missing / soft-deleted

    if amount is None or amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    if SupplierOpeningBalance.objects.filter(supplier=supplier).exists():
        raise ValidationError({"supplier": "This supplier already has an opening balance."})

    order = create_opening_balance_order(supplier=supplier, amount=amount, user=user)

    sync_data_entry_supplier_opening_balance(amount=amount, user=user)

    add_opening_balance_entry(
        supplier=supplier,
        amount=amount,
        date=timezone.localtime(timezone.now()).date(),
        reference=f"OB-{supplier.code}",
        details="Opening Balance",
        user=user,
    )

    return SupplierOpeningBalance.objects.create(
        supplier=supplier, amount=amount, note=note or "",
        purchase_order=order, created_by=user,
    )


# ---------------------------------------------------------------------------
# Feature 2 — Customer Opening Balance
# ---------------------------------------------------------------------------

@transaction.atomic
def create_customer_opening_balance(*, customer_id: int, amount: Decimal, note: str = "", user) -> CustomerOpeningBalance:
    """
    One-time opening balance for a customer (what they owed before go-live).
    Permanently locked after creation. Touches:
        - Invoice  : confirmed, is_data_entry=True, grand_total=amount, credit_outstanding=amount
        - CashFlow : customer_outstanding += amount ONLY (no cash received)
        - CustomerOpeningBalance record

    NOTE: create_opening_balance_invoice() creates the Invoice directly and does
    NOT run any CashFlow sync. The single CashFlow adjustment is performed here
    via sync_data_entry_customer_opening_balance().
    """
    from billing.selectors import get_customer_by_id
    from billing.services import create_opening_balance_invoice
    from cash_flow.services import sync_data_entry_customer_opening_balance

    customer = get_customer_by_id(customer_id)   # 404 if missing / soft-deleted

    if amount is None or amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    if CustomerOpeningBalance.objects.filter(customer=customer).exists():
        raise ValidationError({"customer": "This customer already has an opening balance."})

    invoice = create_opening_balance_invoice(customer=customer, amount=amount, user=user)

    sync_data_entry_customer_opening_balance(amount=amount, user=user)

    return CustomerOpeningBalance.objects.create(
        customer=customer, amount=amount, note=note or "",
        invoice=invoice, created_by=user,
    )


# ---------------------------------------------------------------------------
# Feature 3 — Opening Cash
# ---------------------------------------------------------------------------

@transaction.atomic
def create_opening_cash(*, amount: Decimal, user) -> OpeningCashEntry:
    """
    Seeds starting cash on hand. Can be called multiple times.
        - CashFlow : cash_in_hand += amount, total_invoices_cash += amount
        - OpeningCashEntry record (shown in cash-in-hand breakdown as an inflow)
    """
    from cash_flow.services import sync_data_entry_opening_cash

    if amount is None or amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})

    entry = OpeningCashEntry.objects.create(amount=amount, added_by=user)
    sync_data_entry_opening_cash(amount=amount, user=user)
    return entry


# ---------------------------------------------------------------------------
# Feature 4 — Opening Stock
# ---------------------------------------------------------------------------

@transaction.atomic
def create_opening_stock(*, items: list, user):
    """
    Adds opening stock for multiple products via the system supplier.
    Can be called multiple times.
        - PurchaseOrder : confirmed, is_data_entry=True, supplier=SYS-OPENING
        - PurchaseItem  : one per product, remaining_quantity=quantity (FIFO ready)
        - Inventory     : quantity += amount per product
        - CashFlow      : NO change (not a financial transaction)
    """
    from purchases.models import Supplier
    from purchases.selectors import get_product_by_id
    from purchases.services import create_opening_stock_order

    system_supplier = Supplier.objects.filter(code="SYS-OPENING", is_deleted=False).first()
    if not system_supplier:
        raise ValidationError({
            "system_supplier": "System supplier not found. Run "
                               "`python manage.py create_system_supplier` first.",
        })

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    seen_products = set()
    for item in items:
        product_id = item["product_id"]
        if product_id in seen_products:
            raise ValidationError({"items": f"Duplicate product id {product_id}."})
        seen_products.add(product_id)
        get_product_by_id(product_id)   # 404 if missing / soft-deleted
        if item["quantity"] <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})
        if item["unit_price"] <= 0:
            raise ValidationError({"unit_price": "Unit price must be greater than zero."})

    return create_opening_stock_order(supplier=system_supplier, items=items, user=user)
