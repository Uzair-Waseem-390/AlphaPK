from django.utils import timezone

from .models import Category, Inventory, Product, Purchase, Shelf, Supplier
from .selectors import get_category_by_id, get_shelf_by_id, get_supplier_by_id, get_product_by_id, get_purchase_by_id


# ---------------------------------------------------------------------------
# Internal inventory helper — never called directly from views
# ---------------------------------------------------------------------------

def _sync_inventory(*, product: Product, quantity_delta: int, user) -> None:
    """
    Atomically adjust inventory quantity for a product by delta.
    delta > 0 → stock increase (purchase created / quantity increased)
    delta < 0 → stock decrease (purchase deleted / quantity decreased)

    get_or_create ensures one inventory row per product always exists.
    """
    inventory, _ = Inventory.objects.get_or_create(product=product)
    inventory.quantity = max(0, inventory.quantity + quantity_delta)
    inventory.last_updated_by = user
    inventory.save(update_fields=["quantity", "last_updated_at", "last_updated_by"])


# ---------------------------------------------------------------------------
# Soft delete helper — DRY, reused across all models
# ---------------------------------------------------------------------------

def _soft_delete(instance, user) -> None:
    instance.is_deleted = True
    instance.deleted_at = timezone.now()
    instance.deleted_by = user
    instance.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


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
    category = get_category_by_id(pk)
    _soft_delete(category, user)


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
    shelf = get_shelf_by_id(pk)
    _soft_delete(shelf, user)


# ---------------------------------------------------------------------------
# Supplier services
# ---------------------------------------------------------------------------

def create_supplier(*, name: str, code: str, user) -> Supplier:
    return Supplier.objects.create(name=name, code=code, created_by=user, updated_by=user)


def update_supplier(*, pk: int, name: str = None, code: str = None, user) -> Supplier:
    supplier = get_supplier_by_id(pk)
    if name is not None:
        supplier.name = name
    if code is not None:
        supplier.code = code
    supplier.updated_by = user
    supplier.save(update_fields=["name", "code", "updated_by", "updated_at"])
    return supplier


def delete_supplier(*, pk: int, user) -> None:
    supplier = get_supplier_by_id(pk)
    _soft_delete(supplier, user)


# ---------------------------------------------------------------------------
# Product services
# ---------------------------------------------------------------------------

def create_product(*, name: str, code: str, category_id: int, shelf_id: int, user) -> Product:
    # Validate FKs exist before creating — raises 404 if not found
    get_category_by_id(category_id)
    get_shelf_by_id(shelf_id)
    return Product.objects.create(
        name=name,
        code=code,
        category_id=category_id,
        shelf_id=shelf_id,
        created_by=user,
        updated_by=user,
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
        get_category_by_id(category_id)  # validate FK
        product.category_id = category_id
    if shelf_id is not None:
        get_shelf_by_id(shelf_id)  # validate FK
        product.shelf_id = shelf_id
    product.updated_by = user
    product.save(update_fields=["name", "code", "category_id", "shelf_id", "updated_by", "updated_at"])
    return product


def delete_product(*, pk: int, user) -> None:
    product = get_product_by_id(pk)
    _soft_delete(product, user)


# ---------------------------------------------------------------------------
# Purchase services  (inventory sync happens here exclusively)
# ---------------------------------------------------------------------------

def create_purchase(
    *,
    product_id: int,
    supplier_id: int,
    quantity: int,
    unit_price,
    gst,
    wht,
    user,
) -> Purchase:
    product = get_product_by_id(product_id)
    get_supplier_by_id(supplier_id)  # validate FK

    purchase = Purchase.objects.create(
        product_id=product_id,
        supplier_id=supplier_id,
        quantity=quantity,
        unit_price=unit_price,
        gst=gst,
        wht=wht,
        created_by=user,
        updated_by=user,
    )
    # Auto-sync inventory: increase by purchased quantity
    _sync_inventory(product=product, quantity_delta=quantity, user=user)
    return purchase


def update_purchase(
    *,
    pk: int,
    product_id: int = None,
    supplier_id: int = None,
    quantity: int = None,
    unit_price=None,
    gst=None,
    wht=None,
    user,
) -> Purchase:
    purchase = get_purchase_by_id(pk)
    old_quantity = purchase.quantity
    old_product = purchase.product

    if product_id is not None:
        get_product_by_id(product_id)
        purchase.product_id = product_id
    if supplier_id is not None:
        get_supplier_by_id(supplier_id)
        purchase.supplier_id = supplier_id
    if quantity is not None:
        purchase.quantity = quantity
    if unit_price is not None:
        purchase.unit_price = unit_price
    if gst is not None:
        purchase.gst = gst
    if wht is not None:
        purchase.wht = wht

    purchase.updated_by = user
    purchase.save()  # triggers recalculation in model.save()

    # Sync inventory: handle product change and/or quantity change
    new_product = purchase.product
    new_quantity = purchase.quantity

    if old_product.pk != new_product.pk:
        # Product changed: roll back old product's stock, add to new product's stock
        _sync_inventory(product=old_product, quantity_delta=-old_quantity, user=user)
        _sync_inventory(product=new_product, quantity_delta=new_quantity, user=user)
    else:
        # Same product: apply the quantity difference
        delta = new_quantity - old_quantity
        if delta != 0:
            _sync_inventory(product=new_product, quantity_delta=delta, user=user)

    return purchase


def delete_purchase(*, pk: int, user) -> None:
    purchase = get_purchase_by_id(pk)
    product = purchase.product
    quantity = purchase.quantity

    _soft_delete(purchase, user)

    # Roll back inventory by the deleted purchase's quantity
    _sync_inventory(product=product, quantity_delta=-quantity, user=user)