from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from .models import (
    Category, Inventory, Product, PurchaseItem, PurchaseOrder,
    PurchaseReturn, PurchaseReturnItem, SavedPurchaseOrderPDF,
    Shelf, Supplier, SupplierPayment,
)
from .selectors import (
    get_category_by_id, get_product_by_id, get_purchase_item_by_id,
    get_purchase_order_by_id, get_purchase_return_by_id,
    get_shelf_by_id, get_supplier_by_id, get_supplier_payment_by_id,
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
    return Supplier.objects.create(name=name, code=code.upper(), created_by=user, updated_by=user)


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

@transaction.atomic
def create_purchase_order(
    *, supplier_id: int, items: list[dict], description: str = "",
    payment_type: str = "after_delivery", user,
) -> PurchaseOrder:
    """
    Creates a DRAFT PurchaseOrder with line items.
    No inventory or debt effect at this stage.
    payment_type: "advance" or "after_delivery" — stored for future automation.
    items = [{"product_id": 1, "quantity": 10, "unit_price": 80, "gst": 18, "wht": 1, "description": ""}, ...]
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

    order = PurchaseOrder.objects.create(
        order_number=_generate_order_number(),
        supplier_id=supplier_id,
        status=PurchaseOrder.Status.DRAFT,
        description=description,
        payment_type=payment_type,
        created_by=user,
        updated_by=user,
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
    payment_type: str = None, user,
) -> PurchaseOrder:
    """
    Replaces all line items on a DRAFT order.
    Confirmed orders cannot be edited.
    payment_type can also be updated while in draft.
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
    if payment_type is not None:
        order.payment_type = payment_type
    order.updated_by = user
    order.save(update_fields=["description", "payment_type", "updated_by", "updated_at"])
    return order


def delete_purchase_order(*, order_id: int, user) -> None:
    """Only DRAFT orders can be deleted."""
    from rest_framework.exceptions import ValidationError
    order = get_purchase_order_by_id(order_id)
    if order.status != PurchaseOrder.Status.DRAFT:
        raise ValidationError({"status": "Only draft purchase orders can be deleted."})
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

    # Auto-set full net_payable as outstanding debt to supplier
    order.refresh_from_db(fields=["net_payable"])
    order.payable_outstanding = order.net_payable
    order.payment_status      = PurchaseOrder.PaymentStatus.UNPAID
    order.save(update_fields=["payable_outstanding", "payment_status"])

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
        amount=amount,
        method=method,
        payment_date=payment_date,
        note=note,
        created_by=user,
        updated_by=user,
    )
    _sync_order_payable(order)
    return payment


def delete_supplier_payment(*, payment_id: int, user) -> None:
    payment = get_supplier_payment_by_id(payment_id)
    order   = payment.order
    _soft_delete(payment, user)
    _sync_order_payable(order)


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
        amount=-total_amount,
        method=SupplierPayment.Method.CASH,
        payment_date=timezone.now().date(),
        note=f"Auto credit note for Return #{return_record.id}",
        created_by=user,
        updated_by=user,
    )
    _sync_order_payable(order)

    return return_record