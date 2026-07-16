from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from .models import (
    Category, Inventory, LostInventoryItem, LostInventoryRecord, Product,
    PurchaseItem, PurchaseOrder, PurchaseReturn, PurchaseReturnItem,
    SavedPurchaseOrderPDF, Shelf, Supplier, SupplierPayment,
)
from .selectors import (
    get_available_purchase_items_for_fifo, get_category_by_id,
    get_product_by_id, get_purchase_item_by_id, get_purchase_order_by_id,
    get_purchase_return_by_id, get_shelf_by_id, get_supplier_by_id,
    get_supplier_payment_by_id,
)
from .utils import calculate_total_price


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _soft_delete(instance, user) -> None:
    """DRY soft delete — single place for this logic."""
    instance.is_deleted = True
    instance.deleted_at = timezone.now()
    instance.deleted_by = user
    instance.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


def _generate_order_number() -> str:
    """
    Generates sequential PO number: PO-2026-0001.
    Race-condition safe inside @transaction.atomic.
    """
    year   = timezone.now().year
    prefix = f"PO-{year}-"
    last   = (
        PurchaseOrder.all_objects
        .filter(order_number__startswith=prefix)
        .order_by("-order_number")
        .first()
    )
    seq = int(last.order_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


def _generate_supplier_payment_reference() -> str:
    """Generates sequential supplier payment reference: SPY-2026-0001."""
    year   = timezone.now().year
    prefix = f"SPY-{year}-"
    last   = (
        SupplierPayment.all_objects
        .filter(reference_number__startswith=prefix)
        .order_by("-reference_number")
        .first()
    )
    seq = int(last.reference_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


def _generate_purchase_return_reference() -> str:
    """Generates sequential purchase return reference: RTN-2026-0001."""
    year   = timezone.now().year
    prefix = f"RTN-{year}-"
    last   = (
        PurchaseReturn.all_objects
        .filter(reference_number__startswith=prefix)
        .order_by("-reference_number")
        .first()
    )
    seq = int(last.reference_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


def _generate_lost_inventory_reference() -> str:
    """Generates sequential lost inventory reference: LOSS-2026-0001."""
    year   = timezone.now().year
    prefix = f"LOSS-{year}-"
    last   = (
        LostInventoryRecord.all_objects
        .filter(reference_number__startswith=prefix)
        .order_by("-reference_number")
        .first()
    )
    seq = int(last.reference_number.split("-")[-1]) + 1 if last else 1
    return f"{prefix}{seq:04d}"


def _recalculate_order_totals(order: PurchaseOrder) -> None:
    """
    Recomputes PurchaseOrder header totals from all line items.
    Single source of truth — called after confirmation and returns.
    """
    gross = Decimal("0")
    gst   = Decimal("0")
    wht   = Decimal("0")
    net   = Decimal("0")

    for item in order.items.filter(is_deleted=False):
        gross += item.gross_amount
        gst   += item.gst_amount
        wht   += item.wht_amount
        net   += item.total_price

    order.gross_amount = gross
    order.gst_total    = gst
    order.wht_total    = wht
    order.net_payable  = net
    order.save(update_fields=["gross_amount", "gst_total", "wht_total", "net_payable"])


def _sync_order_payable(order: PurchaseOrder) -> None:
    """
    Recomputes payable_outstanding, total_paid, payment_status for a PurchaseOrder.
    Called after every SupplierPayment create/delete and after return acceptance.

    Logic (mirrors billing._sync_invoice_payment_summary):
        - On confirmation: payable_outstanding = net_payable (we owe full amount)
        - Each payment reduces payable_outstanding
        - Return credit notes (negative payments) reduce payable_outstanding further
        - payment_status = unpaid / partial / paid
    """
    payments = SupplierPayment.objects.filter(order=order, is_deleted=False)

    total_paid     = Decimal("0")
    return_credits = Decimal("0")

    for p in payments:
        if p.amount > 0:
            total_paid += p.amount
        else:
            return_credits += abs(p.amount)

    payable_outstanding = max(
        Decimal("0"),
        order.net_payable - total_paid - return_credits,
    )

    if payable_outstanding <= 0:
        payment_status = PurchaseOrder.PaymentStatus.PAID
    elif total_paid > 0 or return_credits > 0:
        payment_status = PurchaseOrder.PaymentStatus.PARTIAL
    else:
        payment_status = PurchaseOrder.PaymentStatus.UNPAID

    order.payable_outstanding = payable_outstanding
    order.total_paid          = total_paid
    order.payment_status      = payment_status
    order.save(update_fields=["payable_outstanding", "total_paid", "payment_status"])


def _sync_inventory(*, product: Product, quantity_delta: int, user) -> None:
    """
    Adjusts inventory quantity. delta > 0 = increase, delta < 0 = decrease.
    Floored at 0 — inventory never goes negative.
    """
    inventory, _ = Inventory.objects.get_or_create(product=product)
    inventory.quantity      = max(0, inventory.quantity + quantity_delta)
    inventory.last_updated_by = user
    inventory.save(update_fields=["quantity", "last_updated_at", "last_updated_by"])


# ---------------------------------------------------------------------------
# Category services
# ---------------------------------------------------------------------------

def create_category(*, name: str, description: str = "", user) -> Category:
    return Category.objects.create(name=name, description=description, created_by=user, updated_by=user)


def update_category(*, pk: int, name: str = None, description: str = None, user) -> Category:
    category = get_category_by_id(pk)
    if name is not None:
        category.name = name
    if description is not None:
        category.description = description
    category.updated_by = user
    category.save(update_fields=["name", "description", "updated_by", "updated_at"])
    return category


def delete_category(*, pk: int, user) -> None:
    _soft_delete(get_category_by_id(pk), user)


# ---------------------------------------------------------------------------
# Shelf services
# ---------------------------------------------------------------------------

def create_shelf(*, name: str, description: str = "", user) -> Shelf:
    return Shelf.objects.create(name=name, description=description, created_by=user, updated_by=user)


def update_shelf(*, pk: int, name: str = None, description: str = None, user) -> Shelf:
    shelf = get_shelf_by_id(pk)
    if name is not None:
        shelf.name = name
    if description is not None:
        shelf.description = description
    shelf.updated_by = user
    shelf.save(update_fields=["name", "description", "updated_by", "updated_at"])
    return shelf


def delete_shelf(*, pk: int, user) -> None:
    _soft_delete(get_shelf_by_id(pk), user)


# ---------------------------------------------------------------------------
# Supplier services
# ---------------------------------------------------------------------------

def create_supplier(*, name: str, code: str, user) -> Supplier:
    from rest_framework.exceptions import ValidationError
    if Supplier.objects.filter(code__iexact=code, is_deleted=False).exists():
        raise ValidationError({"code": "A supplier with this code already exists."})
    supplier = Supplier.objects.create(name=name, code=code.upper(), created_by=user, updated_by=user)

    # Auto-create empty ledger for this supplier
    from ledger.services import create_ledger_for_supplier
    create_ledger_for_supplier(supplier=supplier)

    return supplier


def update_supplier(*, pk: int, name: str = None, code: str = None, user) -> Supplier:
    from rest_framework.exceptions import ValidationError
    supplier = get_supplier_by_id(pk)
    if code:
        if Supplier.objects.filter(code__iexact=code, is_deleted=False).exclude(pk=pk).exists():
            raise ValidationError({"code": "A supplier with this code already exists."})
        supplier.code = code.upper()
    if name is not None:
        supplier.name = name
    supplier.updated_by = user
    supplier.save(update_fields=["name", "code", "updated_by", "updated_at"])
    return supplier


def delete_supplier(*, pk: int, user) -> None:
    _soft_delete(get_supplier_by_id(pk), user)


# ---------------------------------------------------------------------------
# Product services
# ---------------------------------------------------------------------------

def create_product(*, name: str, code: str, category_id: int, shelf_id: int, user) -> Product:
    get_category_by_id(category_id)
    get_shelf_by_id(shelf_id)
    return Product.objects.create(
        name=name, code=code, category_id=category_id,
        shelf_id=shelf_id, created_by=user, updated_by=user,
    )


def update_product(
    *, pk: int, name: str = None, code: str = None,
    category_id: int = None, shelf_id: int = None, user,
) -> Product:
    product = get_product_by_id(pk)
    if name is not None:
        product.name = name
    if code is not None:
        product.code = code
    if category_id is not None:
        get_category_by_id(category_id)
        product.category_id = category_id
    if shelf_id is not None:
        get_shelf_by_id(shelf_id)
        product.shelf_id = shelf_id
    product.updated_by = user
    product.save(update_fields=["name", "code", "category_id", "shelf_id", "updated_by", "updated_at"])
    return product


def delete_product(*, pk: int, user) -> None:
    _soft_delete(get_product_by_id(pk), user)


# ---------------------------------------------------------------------------
# PurchaseOrder — draft create / edit / delete
# ---------------------------------------------------------------------------


def _cancel_advance_payment(*, order, user) -> None:
    """
    Cancels any existing advance SupplierPayment on this order and restores cash.
    Also removes the linked ledger entry and recalculates snapshots.
    """
    advance_payment = SupplierPayment.objects.filter(
        order=order,
        note__startswith="Advance payment",
        amount__gt=0,
        is_deleted=False,
    ).first()
    if advance_payment:
        from cash_flow.services import sync_advance_payment_deleted
        sync_advance_payment_deleted(advance_amount=advance_payment.amount, user=user)

        # Remove ledger entry
        from ledger.services import remove_ledger_entry_for_payment
        remove_ledger_entry_for_payment(supplier_payment=advance_payment)

        advance_payment.is_deleted = True
        advance_payment.deleted_by = user
        advance_payment.deleted_at = timezone.now()
        advance_payment.save(update_fields=["is_deleted", "deleted_by", "deleted_at"])


def _update_advance_payment(*, order, old_amount: Decimal, new_amount: Decimal, user) -> None:
    """
    Updates the advance SupplierPayment record and adjusts cash_in_hand.
    Also updates the ledger entry amount so it stays in sync.
    """
    from ledger.models import SupplierLedgerEntry
    from ledger.services import _recalculate_snapshots_from, _get_year_month

    advance_payment = SupplierPayment.objects.filter(
        order=order,
        note__startswith="Advance payment",
        amount__gt=0,
        is_deleted=False,
    ).first()

    if advance_payment:
        # Update payment amount
        advance_payment.amount = new_amount
        advance_payment.save(update_fields=["amount"])

        # Update linked ledger entry amount
        ledger_entry = SupplierLedgerEntry.objects.filter(
            supplier_payment=advance_payment
        ).first()
        if ledger_entry:
            ledger_entry.debit = new_amount
            ledger_entry.save(update_fields=["debit"])
            # Recalculate snapshots from this entry's month forward
            from ledger.models import SupplierLedger
            ledger = ledger_entry.ledger
            _recalculate_snapshots_from(ledger, _get_year_month(ledger_entry.date))
    else:
        # No existing advance payment — create one with reference number + ledger entry
        adv_payment = SupplierPayment.objects.create(
            order=order,
            reference_number=_generate_supplier_payment_reference(),
            amount=new_amount,
            method=SupplierPayment.Method.CASH,
            payment_date=timezone.localtime(timezone.now()).date(),
            note="Advance payment on draft purchase order creation.",
            created_by=user,
            updated_by=user,
        )
        from ledger.services import add_advance_entry
        add_advance_entry(
            supplier=order.supplier,
            supplier_payment=adv_payment,
            amount=new_amount,
            date=timezone.localtime(timezone.now()).date(),
            user=user,
        )

    from cash_flow.services import sync_advance_payment_updated
    sync_advance_payment_updated(old_amount=old_amount, new_amount=new_amount, user=user)


@transaction.atomic
def create_purchase_order(
    *, supplier_id: int, items: list[dict], description: str = "",
    payment_type: str = "after_delivery", advance_amount: Decimal = Decimal("0"), user,
) -> PurchaseOrder:
    """
    Creates a DRAFT PurchaseOrder with line items.
    No inventory or debt effect at this stage.
    If payment_type=advance and advance_amount > 0:
        - advance_amount immediately deducted from cash_in_hand
        - A SupplierPayment record is auto-created for the advance
    """
    from rest_framework.exceptions import ValidationError

    get_supplier_by_id(supplier_id)

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    seen_products = set()
    for item in items:
        if item["product_id"] in seen_products:
            raise ValidationError({"items": f"Duplicate product id {item['product_id']}."})
        seen_products.add(item["product_id"])
        get_product_by_id(item["product_id"])  # validates existence

    # Validate advance_amount
    if payment_type == "after_delivery":
        advance_amount = Decimal("0")
    if advance_amount < 0:
        from rest_framework.exceptions import ValidationError
        raise ValidationError({"advance_amount": "Advance amount cannot be negative."})

    order = PurchaseOrder.objects.create(
        order_number=_generate_order_number(),
        supplier_id=supplier_id,
        status=PurchaseOrder.Status.DRAFT,
        description=description,
        payment_type=payment_type,
        advance_amount=advance_amount,
        created_by=user,
        updated_by=user,
    )

    # If advance payment: deduct from cash_in_hand and record in payment history
    if payment_type == "advance" and advance_amount > 0:
        adv_payment = SupplierPayment.objects.create(
            order=order,
            reference_number=_generate_supplier_payment_reference(),
            amount=advance_amount,
            method=SupplierPayment.Method.CASH,
            payment_date=timezone.localtime(timezone.now()).date(),
            note="Advance payment on draft purchase order creation.",
            created_by=user,
            updated_by=user,
        )
        from cash_flow.services import sync_advance_payment_created
        sync_advance_payment_created(advance_amount=advance_amount, user=user)

        # Ledger entry: advance debit
        from ledger.services import add_advance_entry
        add_advance_entry(
            supplier=order.supplier,
            supplier_payment=adv_payment,
            amount=advance_amount,
            date=timezone.localtime(timezone.now()).date(),
            user=user,
        )

    for item in items:
        PurchaseItem.objects.create(
            order=order,
            product_id=item["product_id"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            gst=item.get("gst", 0),
            wht=item.get("wht", 0),
            description=item.get("description", ""),
            created_by=user,
            updated_by=user,
        )

    return order


@transaction.atomic
def update_purchase_order_items(
    *, order_id: int, items: list[dict], description: str = None,
    payment_type: str = None, advance_amount: Decimal = None, user,
) -> PurchaseOrder:
    """
    Replaces all line items on a DRAFT order.
    Confirmed orders cannot be edited.
    payment_type and advance_amount can also be updated while in draft.
    advance_amount changes auto-adjust cash_in_hand.
    """
    from rest_framework.exceptions import ValidationError

    order = get_purchase_order_by_id(order_id)

    if order.status != PurchaseOrder.Status.DRAFT:
        raise ValidationError({"status": "Only draft purchase orders can be edited."})

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    seen_products = set()
    for item in items:
        if item["product_id"] in seen_products:
            raise ValidationError({"items": f"Duplicate product id {item['product_id']}."})
        seen_products.add(item["product_id"])
        get_product_by_id(item["product_id"])

    # Replace all items
    order.items.all().delete()
    for item in items:
        PurchaseItem.objects.create(
            order=order,
            product_id=item["product_id"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            gst=item.get("gst", 0),
            wht=item.get("wht", 0),
            description=item.get("description", ""),
            created_by=user,
            updated_by=user,
        )

    if description is not None:
        order.description = description

    # Handle payment_type change
    if payment_type is not None:
        old_payment_type = order.payment_type
        order.payment_type = payment_type
        # If switching from advance to after_delivery — refund advance
        if old_payment_type == "advance" and payment_type == "after_delivery":
            old_advance = order.advance_amount
            if old_advance > 0:
                _cancel_advance_payment(order=order, user=user)
                order.advance_amount = Decimal("0")

    # Handle advance_amount change
    if advance_amount is not None and order.payment_type == "advance":
        if advance_amount < 0:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"advance_amount": "Advance amount cannot be negative."})
        old_advance = order.advance_amount
        if advance_amount != old_advance:
            _update_advance_payment(order=order, old_amount=old_advance, new_amount=advance_amount, user=user)
            order.advance_amount = advance_amount

    order.updated_by = user
    order.save(update_fields=["description", "payment_type", "advance_amount", "updated_by", "updated_at"])
    return order


def delete_purchase_order(*, order_id: int, user) -> None:
    """Only DRAFT orders can be deleted. Refunds advance payment if applicable."""
    from rest_framework.exceptions import ValidationError
    order = get_purchase_order_by_id(order_id)
    if order.status != PurchaseOrder.Status.DRAFT:
        raise ValidationError({"status": "Only draft purchase orders can be deleted."})

    # Refund advance if this was an advance order
    if order.payment_type == "advance" and order.advance_amount > 0:
        from cash_flow.services import sync_advance_payment_deleted
        sync_advance_payment_deleted(advance_amount=order.advance_amount, user=user)

    _soft_delete(order, user)


# ---------------------------------------------------------------------------
# PurchaseOrder — confirm
# ---------------------------------------------------------------------------

@transaction.atomic
def confirm_purchase_order(*, order_id: int, user) -> PurchaseOrder:
    """
    Confirms a DRAFT PurchaseOrder:
    1. Recalculates all totals from line items
    2. Sets remaining_quantity = quantity on each item (FIFO ready)
    3. Adds to inventory
    4. Sets payable_outstanding = net_payable (we owe supplier full amount)
    5. Sets status = CONFIRMED
    """
    from rest_framework.exceptions import ValidationError

    order = get_purchase_order_by_id(order_id)
    if order.status != PurchaseOrder.Status.DRAFT:
        raise ValidationError({"status": "Only draft purchase orders can be confirmed."})

    items = order.items.filter(is_deleted=False)
    if not items.exists():
        raise ValidationError({"items": "Cannot confirm an order with no items."})

    # Set remaining_quantity and sync inventory
    for item in items:
        item.remaining_quantity = item.quantity
        item.save(update_fields=["remaining_quantity"])
        _sync_inventory(product=item.product, quantity_delta=item.quantity, user=user)

    _recalculate_order_totals(order)

    order.status       = PurchaseOrder.Status.CONFIRMED
    order.confirmed_by = user
    order.confirmed_at = timezone.now()
    order.updated_by   = user
    order.save(update_fields=["status", "confirmed_by", "confirmed_at", "updated_by", "updated_at"])

    # Reload fresh net_payable
    order.refresh_from_db(fields=["net_payable", "advance_amount", "payment_type"])
    advance = order.advance_amount if order.payment_type == "advance" else Decimal("0")

    # Cap advance at net_payable (safety guard)
    if advance > order.net_payable:
        advance = order.net_payable
        order.advance_amount = advance
        order.save(update_fields=["advance_amount"])

    remaining_payable = max(Decimal("0"), order.net_payable - advance)
    order.payable_outstanding = remaining_payable
    order.payment_status = (
        PurchaseOrder.PaymentStatus.PAID if remaining_payable == 0
        else PurchaseOrder.PaymentStatus.PARTIAL if advance > 0
        else PurchaseOrder.PaymentStatus.UNPAID
    )
    order.save(update_fields=["payable_outstanding", "payment_status"])

    # Sync CashFlow: outstanding = net_payable - advance (advance already in cash)
    from cash_flow.services import sync_purchase_order_confirmed
    sync_purchase_order_confirmed(net_payable=order.net_payable, advance_amount=advance, user=user)

    # Ledger entry: credit (we owe supplier net_payable)
    from ledger.services import add_purchase_entry
    add_purchase_entry(
        supplier=order.supplier,
        purchase_order=order,
        amount=order.net_payable,
        date=timezone.localtime(order.confirmed_at).date(),
        user=user,
    )

    return order


# ---------------------------------------------------------------------------
# Data-entry bootstrap orders (called from data_entry.services)
# ---------------------------------------------------------------------------

@transaction.atomic
def create_opening_balance_order(*, supplier, amount: Decimal, user) -> PurchaseOrder:
    """
    Creates a CONFIRMED, is_data_entry PurchaseOrder with no line items,
    net_payable = payable_outstanding = amount. Exists so normal supplier
    payment APIs can work against the opening balance. No inventory/ledger/
    cashflow here — the caller orchestrates those.
    """
    return PurchaseOrder.objects.create(
        order_number        = _generate_order_number(),
        supplier            = supplier,
        status              = PurchaseOrder.Status.CONFIRMED,
        is_data_entry       = True,
        description         = "Opening balance (data entry).",
        gross_amount        = amount,
        net_payable         = amount,
        payable_outstanding = amount,
        payment_status      = PurchaseOrder.PaymentStatus.UNPAID,
        confirmed_by        = user,
        confirmed_at        = timezone.now(),
        created_by          = user,
        updated_by          = user,
    )


@transaction.atomic
def create_opening_stock_order(*, supplier, items: list[dict], user) -> PurchaseOrder:
    """
    Creates a CONFIRMED, is_data_entry PurchaseOrder with line items for the
    system supplier. Sets remaining_quantity for FIFO and adds to inventory.
    No cashflow/ledger effect (system supplier is excluded from payable tracking).
    """
    order = PurchaseOrder.objects.create(
        order_number  = _generate_order_number(),
        supplier      = supplier,
        status        = PurchaseOrder.Status.CONFIRMED,
        is_data_entry = True,
        description   = "Opening stock (data entry).",
        confirmed_by  = user,
        confirmed_at  = timezone.now(),
        created_by    = user,
        updated_by    = user,
    )
    for item in items:
        pi = PurchaseItem.objects.create(
            order=order,
            product_id=item["product_id"],
            quantity=item["quantity"],
            unit_price=item["unit_price"],
            gst=item.get("gst", 0),
            wht=item.get("wht", 0),
            description=item.get("description", ""),
            created_by=user,
            updated_by=user,
        )  # .save() auto-computes gross/gst/wht/total
        pi.remaining_quantity = pi.quantity
        pi.save(update_fields=["remaining_quantity"])
        _sync_inventory(product=pi.product, quantity_delta=pi.quantity, user=user)

    _recalculate_order_totals(order)
    return order


# ---------------------------------------------------------------------------
# Supplier Payment services
# ---------------------------------------------------------------------------

def create_supplier_payment(
    *, order_id: int, amount: Decimal, method: str,
    payment_date, note: str = "", user,
) -> SupplierPayment:
    from rest_framework.exceptions import ValidationError

    order = get_purchase_order_by_id(order_id)
    if order.status == PurchaseOrder.Status.DRAFT:
        raise ValidationError({"order": "Cannot record payment on a draft purchase order."})

    order.refresh_from_db(fields=["payable_outstanding"])
    if amount > order.payable_outstanding:
        raise ValidationError({
            "amount": (
                f"Payment of {amount} exceeds outstanding payable. "
                f"Outstanding: {order.payable_outstanding}."
            )
        })

    payment = SupplierPayment.objects.create(
        order=order,
        reference_number=_generate_supplier_payment_reference(),
        amount=amount,
        method=method,
        payment_date=payment_date,
        note=note,
        created_by=user,
        updated_by=user,
    )
    _sync_order_payable(order)

    # Sync CashFlow: cash out, payable reduces, paid increases
    from cash_flow.services import sync_supplier_payment_made
    sync_supplier_payment_made(amount=amount, user=user)

    # Ledger entry: debit (we paid supplier)
    from ledger.services import add_payment_entry
    add_payment_entry(
        supplier=order.supplier,
        supplier_payment=payment,
        amount=amount,
        date=payment_date,
        user=user,
    )

    return payment


def delete_supplier_payment(*, payment_id: int, user) -> None:
    payment = get_supplier_payment_by_id(payment_id)
    order   = payment.order
    amount  = payment.amount
    _soft_delete(payment, user)
    _sync_order_payable(order)

    # Reverse CashFlow sync only for positive non-advance payments
    if amount > 0 and not payment.note.startswith("Advance payment"):
        from cash_flow.services import sync_supplier_payment_deleted
        sync_supplier_payment_deleted(amount=amount, user=user)


# ---------------------------------------------------------------------------
# Purchase Return services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_purchase_return(
    *, order_id: int, items: list[dict], note: str = "", user,
) -> PurchaseReturn:
    """
    Creates a PENDING return to supplier.
    items = [{"purchase_item_id": 1, "quantity": 5, "gst": 0, "wht": 0}, ...]
    Previous PurchaseOrder and PurchaseItems are untouched.
    No inventory or debt change yet — happens on acceptance.
    """
    from rest_framework.exceptions import ValidationError

    order = get_purchase_order_by_id(order_id)
    if order.status != PurchaseOrder.Status.CONFIRMED:
        raise ValidationError({"order": "Can only return items from confirmed purchase orders."})

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    return_record = PurchaseReturn.objects.create(
        order=order,
        reference_number=_generate_purchase_return_reference(),
        status=PurchaseReturn.Status.PENDING,
        note=note,
        created_by=user,
        updated_by=user,
    )

    for item_data in items:
        purchase_item = get_purchase_item_by_id(item_data["purchase_item_id"])

        if purchase_item.order_id != order.id:
            raise ValidationError({
                "purchase_item_id": f"Item {purchase_item.id} does not belong to this order."
            })
        if item_data["quantity"] > purchase_item.returnable_quantity:
            raise ValidationError({
                "quantity": (
                    f"Cannot return {item_data['quantity']} units of "
                    f"'{purchase_item.product.name}'. "
                    f"Returnable: {purchase_item.returnable_quantity}."
                )
            })

        PurchaseReturnItem.objects.create(
            return_record=return_record,
            purchase_item=purchase_item,
            quantity=item_data["quantity"],
            gst=item_data.get("gst", 0),
            wht=item_data.get("wht", 0),
        )

    return return_record


@transaction.atomic
def accept_purchase_return(*, return_id: int, user) -> PurchaseReturn:
    """
    Accepts a pending return:
    1. Snapshots unit_price from original purchase item
    2. Calculates return amounts using calculate_total_price (with return GST/WHT)
    3. Decreases remaining_quantity on purchase items (FIFO reversal)
    4. Decreases inventory
    5. Updates returned_quantity on purchase items
    6. Creates negative SupplierPayment entry (credit note — reduces our debt)
    7. Resyncs order payable
    """
    from rest_framework.exceptions import ValidationError

    return_record = get_purchase_return_by_id(return_id)
    if return_record.status != PurchaseReturn.Status.PENDING:
        raise ValidationError({"status": "Only pending returns can be accepted."})

    total_gross  = Decimal("0")
    total_gst    = Decimal("0")
    total_wht    = Decimal("0")
    total_amount = Decimal("0")

    for return_item in return_record.items.all():
        purchase_item = return_item.purchase_item
        qty           = return_item.quantity

        # Snapshot unit_price from original purchase item
        unit_price = purchase_item.unit_price

        # Calculate return financials using same formula as purchases
        calc = calculate_total_price(
            quantity=qty,
            unit_price=unit_price,
            gst=return_item.gst,
            wht=return_item.wht,
        )

        return_item.unit_price   = unit_price
        return_item.gross_amount = calc["gross_amount"]
        return_item.gst_amount   = calc["gst_amount"]
        return_item.wht_amount   = calc["wht_amount"]
        return_item.total_amount = calc["total_price"]
        return_item.save(update_fields=[
            "unit_price", "gross_amount", "gst_amount", "wht_amount", "total_amount"
        ])

        # FIFO reversal: restore remaining_quantity (oldest batch restored last)
        remaining_to_restore = qty
        fifo_items = PurchaseItem.objects.filter(
            order=purchase_item.order,
            product=purchase_item.product,
            is_deleted=False,
        ).order_by("-id")  # reverse order for FIFO reversal

        for fi in fifo_items:
            if remaining_to_restore <= 0:
                break
            restore = min(fi.remaining_quantity + qty, qty)
            # Restore up to original quantity cap
            max_restorable = fi.quantity - fi.remaining_quantity
            restore = min(remaining_to_restore, max_restorable)
            fi.remaining_quantity += restore
            fi.save(update_fields=["remaining_quantity"])
            remaining_to_restore -= restore

        # Update returned_quantity on purchase item
        purchase_item.returned_quantity += qty
        purchase_item.save(update_fields=["returned_quantity"])

        # Decrease inventory
        _sync_inventory(product=purchase_item.product, quantity_delta=-qty, user=user)

        total_gross  += calc["gross_amount"]
        total_gst    += calc["gst_amount"]
        total_wht    += calc["wht_amount"]
        total_amount += calc["total_price"]

    # Save return totals
    return_record.total_return_gross  = total_gross
    return_record.total_return_gst    = total_gst
    return_record.total_return_wht    = total_wht
    return_record.total_return_amount = total_amount
    return_record.status      = PurchaseReturn.Status.ACCEPTED
    return_record.accepted_by = user
    return_record.accepted_at = timezone.now()
    return_record.updated_by  = user
    return_record.save(update_fields=[
        "total_return_gross", "total_return_gst", "total_return_wht",
        "total_return_amount", "status", "accepted_by", "accepted_at", "updated_by", "updated_at",
    ])

    # Credit note: negative payment reduces our payable to supplier
    order = return_record.order
    SupplierPayment.objects.create(
        order=order,
        reference_number=_generate_supplier_payment_reference(),
        amount=-total_amount,
        method=SupplierPayment.Method.CASH,
        payment_date=timezone.localtime(timezone.now()).date(),
        note=f"Auto credit note for Return #{return_record.reference_number}",
        created_by=user,
        updated_by=user,
    )
    _sync_order_payable(order)

    # Sync CashFlow: payable_outstanding reduces, total_purchase_returns_value/cogs increase
    from cash_flow.services import sync_purchase_return_accepted
    sync_purchase_return_accepted(return_amount=total_amount, return_cogs=total_gross, user=user)

    # Ledger entry: return debit (supplier owes us back)
    from ledger.services import add_return_entry
    add_return_entry(
        supplier=return_record.order.supplier,
        purchase_return=return_record,
        amount=total_amount,
        date=timezone.localtime(return_record.accepted_at).date(),
        user=user,
    )

    return return_record


# ---------------------------------------------------------------------------
# Lost Inventory
# ---------------------------------------------------------------------------

def _consume_fifo_for_loss(*, product: Product, quantity: int) -> Decimal:
    """
    Consumes stock from purchase batches in FIFO order for a lost product.
    Mirrors billing._run_fifo — oldest batch first, tax-inclusive unit cost
    (total_price / quantity), decrements remaining_quantity on each batch.
    Returns the blended cost per unit for the consumed quantity.
    """
    from rest_framework.exceptions import ValidationError

    remaining_to_consume = quantity
    total_cost = Decimal("0")
    batches = get_available_purchase_items_for_fifo(product.id)

    for batch in batches:
        if remaining_to_consume <= 0:
            break

        consume = min(batch.remaining_quantity, remaining_to_consume)
        tax_inclusive_unit_cost = (
            batch.total_price / batch.quantity
            if batch.quantity > 0 else batch.unit_price
        )
        total_cost += consume * tax_inclusive_unit_cost

        batch.remaining_quantity -= consume
        batch.save(update_fields=["remaining_quantity"])

        remaining_to_consume -= consume

    if remaining_to_consume > 0:
        raise ValidationError({
            "quantity": f"Stock ran out mid-processing for '{product.name}'. Please refresh and try again."
        })

    return total_cost / Decimal(str(quantity))


def _validate_lost_stock(*, product: Product, requested_qty: int) -> None:
    """Guard: ensures enough FIFO stock exists before consuming it. Mirrors billing._validate_stock."""
    from rest_framework.exceptions import ValidationError

    batches = get_available_purchase_items_for_fifo(product.id)
    available = sum(b.remaining_quantity for b in batches)
    if available < requested_qty:
        raise ValidationError({
            "quantity": (
                f"Insufficient stock for '{product.name}'. "
                f"Requested: {requested_qty}, Available: {available}."
            )
        })


@transaction.atomic
def create_lost_inventory_record(*, items: list[dict], note: str = "", user) -> LostInventoryRecord:
    """
    Marks one or more products as lost from inventory in a single batch.
    items = [{"product_id": 1, "quantity": 5, "reason": "damaged"}, ...]

    For each item:
        1. Validates stock availability against FIFO purchase batches.
        2. Consumes stock FIFO-first, snapshotting the blended unit cost.
        3. Decreases live inventory by the lost quantity.
    Takes effect immediately — no pending/accept step.
    """
    from rest_framework.exceptions import ValidationError

    if not items:
        raise ValidationError({"items": "At least one item is required."})

    seen_products = set()
    for item in items:
        if item["product_id"] in seen_products:
            raise ValidationError({"items": f"Duplicate product id {item['product_id']}."})
        seen_products.add(item["product_id"])
        if item["quantity"] <= 0:
            raise ValidationError({"quantity": "Quantity must be greater than zero."})

    record = LostInventoryRecord.objects.create(
        reference_number=_generate_lost_inventory_reference(),
        note=note,
        created_by=user,
        updated_by=user,
    )

    total_lost_amount = Decimal("0")

    for item_data in items:
        product = get_product_by_id(item_data["product_id"])
        quantity = item_data["quantity"]

        _validate_lost_stock(product=product, requested_qty=quantity)
        unit_cost = _consume_fifo_for_loss(product=product, quantity=quantity)
        total_cost = unit_cost * Decimal(str(quantity))

        LostInventoryItem.objects.create(
            record=record,
            product=product,
            quantity=quantity,
            reason=item_data.get("reason", ""),
            unit_cost=unit_cost,
            total_cost=total_cost,
        )

        _sync_inventory(product=product, quantity_delta=-quantity, user=user)

        total_lost_amount += total_cost

    record.total_lost_amount = total_lost_amount
    record.save(update_fields=["total_lost_amount"])

    # Sync CashFlow: total_lost_inventory_worth increases by this batch's FIFO cost
    from cash_flow.services import sync_lost_inventory_created
    sync_lost_inventory_created(amount=total_lost_amount, user=user)

    return record