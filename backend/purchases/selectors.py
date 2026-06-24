from django.shortcuts import get_object_or_404

from .models import Category, Inventory, Product, Purchase, Shelf, Supplier


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

def get_all_categories():
    return Category.objects.all()


def get_category_by_id(pk: int) -> Category:
    return get_object_or_404(Category, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Shelf
# ---------------------------------------------------------------------------

def get_all_shelves():
    return Shelf.objects.all()


def get_shelf_by_id(pk: int) -> Shelf:
    return get_object_or_404(Shelf, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------

def get_all_suppliers():
    return Supplier.objects.all()


def get_supplier_by_id(pk: int) -> Supplier:
    return get_object_or_404(Supplier, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

def get_all_products():
    return Product.objects.select_related("category", "shelf").all()


def get_product_by_id(pk: int) -> Product:
    return get_object_or_404(
        Product.objects.select_related("category", "shelf"),
        pk=pk,
        is_deleted=False,
    )


# ---------------------------------------------------------------------------
# Purchase
# ---------------------------------------------------------------------------

def get_all_purchases():
    return Purchase.objects.select_related(
        "product", "product__category", "product__shelf",
        "supplier", "created_by", "updated_by",
    ).all()


def get_purchase_by_id(pk: int) -> Purchase:
    return get_object_or_404(
        Purchase.objects.select_related(
            "product", "product__category", "product__shelf",
            "supplier", "created_by", "updated_by",
        ),
        pk=pk,
        is_deleted=False,
    )


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

def get_all_inventory():
    return Inventory.objects.select_related(
        "product", "product__category", "product__shelf", "last_updated_by",
    ).all()


def get_inventory_by_product_id(product_id: int) -> Inventory:
    return get_object_or_404(
        Inventory.objects.select_related("product"),
        product_id=product_id,
    )