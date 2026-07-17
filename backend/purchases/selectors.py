from decimal import Decimal

from django.db.models import Q, QuerySet, Sum
from django.db.models.functions import Coalesce
from django.db.models import DecimalField, Value
from django.shortcuts import get_object_or_404

from .models import (
    Category, Inventory, LostInventoryItem, LostInventoryRecord, Product,
    PurchaseItem, PurchaseOrder, PurchaseReturn, Shelf, Supplier,
)


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

def get_all_categories():
    return Category.objects.filter(is_deleted=False)

def get_category_by_id(pk: int) -> Category:
    return get_object_or_404(Category, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Shelf
# ---------------------------------------------------------------------------

def get_all_shelves():
    return Shelf.objects.filter(is_deleted=False)

def get_shelf_by_id(pk: int) -> Shelf:
    return get_object_or_404(Shelf, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------

def get_all_suppliers(*, search: str = None) -> QuerySet:
    # SYS-OPENING is the internal system supplier for opening stock — never shown to users.
    qs = Supplier.objects.filter(is_deleted=False).exclude(code="SYS-OPENING")
    if search:
        qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search))
    return qs

def get_supplier_by_id(pk: int) -> Supplier:
    return get_object_or_404(Supplier, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

def get_all_products():
    return Product.objects.select_related("category", "shelf").filter(is_deleted=False)

def get_product_by_id(pk: int) -> Product:
    return get_object_or_404(
        Product.objects.select_related("category", "shelf"),
        pk=pk, is_deleted=False,
    )


# ---------------------------------------------------------------------------
# PurchaseOrder
# ---------------------------------------------------------------------------

def _order_qs():
    return PurchaseOrder.objects.select_related(
        "supplier", "created_by", "updated_by", "confirmed_by", "deleted_by",
    ).prefetch_related(
        "items__product",
        "items__product__category",
        "items__product__shelf",
        "payments",
        "returns__items__purchase_item__product",
    )


def _clean(value):
    """Returns None if value is None or empty/whitespace string, else stripped value."""
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped if stripped else None


def get_all_purchase_orders(
    *,
    status         : str = None,
    supplier_name  : str = None,
    supplier_code  : str = None,
    order_number   : str = None,
    date           : str = None,
    date_from      : str = None,
    date_to        : str = None,
    payment_status : str = None,
    payment_type   : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
) -> QuerySet:
    """
    Master filter selector — every list view uses this.
    All params are optional. Only non-empty values are applied.
    _clean() ensures empty strings from query params don't slip through.
    """
    # Opening-balance orders (real suppliers) ARE shown — they are real
    # outstanding payables that must be tracked and settled. Only opening-STOCK
    # orders (the internal SYS-OPENING supplier) are hidden.
    qs = _order_qs().filter(is_deleted=False).exclude(supplier__code="SYS-OPENING")

    if _clean(status):
        qs = qs.filter(status=_clean(status))
    if _clean(supplier_name):
        qs = qs.filter(supplier__name__icontains=_clean(supplier_name))
    if _clean(supplier_code):
        qs = qs.filter(supplier__code__icontains=_clean(supplier_code))
    if _clean(order_number):
        qs = qs.filter(order_number__icontains=_clean(order_number))
    if _clean(date):
        qs = qs.filter(created_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(payment_status):
        qs = qs.filter(payment_status=_clean(payment_status))
    if _clean(payment_type):
        qs = qs.filter(payment_type=_clean(payment_type))
    if _clean(min_amount):
        qs = qs.filter(net_payable__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(net_payable__lte=_clean(max_amount))

    return qs


def get_draft_purchase_orders() -> QuerySet:
    # Data-entry orders are always confirmed, so drafts are naturally unaffected.
    return _order_qs().filter(is_deleted=False, status=PurchaseOrder.Status.DRAFT)


def get_confirmed_purchase_orders(
    *,
    supplier_name  : str = None,
    supplier_code  : str = None,
    date_from      : str = None,
    date_to        : str = None,
    payment_status : str = None,
    min_amount     : str = None,
    max_amount     : str = None,
) -> QuerySet:
    return get_all_purchase_orders(
        status="confirmed",
        supplier_name=supplier_name,
        supplier_code=supplier_code,
        date_from=date_from,
        date_to=date_to,
        payment_status=payment_status,
        min_amount=min_amount,
        max_amount=max_amount,
    )


def get_purchase_order_by_id(pk: int) -> PurchaseOrder:
    return get_object_or_404(_order_qs(), pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# PurchaseItem
# ---------------------------------------------------------------------------

def get_purchase_item_by_id(pk: int) -> PurchaseItem:
    return get_object_or_404(
        PurchaseItem.objects.select_related("order", "product"),
        pk=pk, is_deleted=False,
    )


def get_available_purchase_items_for_fifo(product_id: int) -> QuerySet:
    """
    Returns confirmed purchase items with remaining stock, oldest first (FIFO).
    Used by billing app to consume stock.
    """
    return (
        PurchaseItem.objects
        .filter(
            product_id=product_id,
            is_deleted=False,
            order__status=PurchaseOrder.Status.CONFIRMED,
            remaining_quantity__gt=0,
        )
        .order_by("order__confirmed_at")
    )


# ---------------------------------------------------------------------------
# PurchaseReturn
# ---------------------------------------------------------------------------

def get_returns_for_order(order_id: int) -> QuerySet:
    return PurchaseReturn.objects.filter(
        order_id=order_id, is_deleted=False,
    ).select_related("created_by", "accepted_by").prefetch_related(
        "items__purchase_item__product",
    )


def get_purchase_return_by_id(pk: int) -> PurchaseReturn:
    return get_object_or_404(
        PurchaseReturn.objects.select_related(
            "order", "created_by", "accepted_by",
        ).prefetch_related("items__purchase_item__product"),
        pk=pk, is_deleted=False,
    )


def get_all_returns(
    *,
    status        : str = None,
    supplier_name : str = None,
    supplier_code : str = None,
    order_number  : str = None,
    date_from     : str = None,
    date_to       : str = None,
) -> QuerySet:
    qs = PurchaseReturn.objects.select_related(
        "order__supplier", "created_by", "accepted_by",
    ).prefetch_related("items__purchase_item__product").filter(is_deleted=False)

    if _clean(status):
        qs = qs.filter(status=_clean(status))
    if _clean(supplier_name):
        qs = qs.filter(order__supplier__name__icontains=_clean(supplier_name))
    if _clean(supplier_code):
        qs = qs.filter(order__supplier__code__icontains=_clean(supplier_code))
    if _clean(order_number):
        qs = qs.filter(order__order_number__icontains=_clean(order_number))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))

    return qs.order_by("-created_at")


# ---------------------------------------------------------------------------
# Supplier Payment
# ---------------------------------------------------------------------------

def get_payments_for_order(order_id: int, *, reference: str = None) -> QuerySet:
    from .models import SupplierPayment
    qs = SupplierPayment.objects.filter(
        order_id=order_id, is_deleted=False,
    ).select_related("created_by").order_by("-payment_date")
    if _clean(reference):
        qs = qs.filter(reference_number__icontains=_clean(reference))
    return qs


def get_all_supplier_payments(
    *,
    reference     : str = None,
    supplier_name : str = None,
    supplier_code : str = None,
    method        : str = None,
    date_from     : str = None,
    date_to       : str = None,
) -> QuerySet:
    """Search supplier payments across all orders with full filter support."""
    from .models import SupplierPayment
    qs = SupplierPayment.objects.filter(
        is_deleted=False, amount__gt=0,
    ).select_related("order__supplier", "created_by").order_by("-payment_date")
    if _clean(reference):
        qs = qs.filter(reference_number__icontains=_clean(reference))
    if _clean(supplier_name):
        qs = qs.filter(order__supplier__name__icontains=_clean(supplier_name))
    if _clean(supplier_code):
        qs = qs.filter(order__supplier__code__icontains=_clean(supplier_code))
    if _clean(method):
        qs = qs.filter(method=_clean(method))
    if _clean(date_from):
        qs = qs.filter(payment_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(payment_date__lte=_clean(date_to))
    return qs


def get_supplier_payment_by_id(pk: int):
    from .models import SupplierPayment
    return get_object_or_404(SupplierPayment, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Supplier outstanding (aggregate)
# ---------------------------------------------------------------------------

def get_supplier_payable_summary(supplier_id: int) -> dict:
    """
    Aggregate payable summary for one supplier across all confirmed orders.
    Shows total we owe, total we paid, total outstanding.
    """
    orders = PurchaseOrder.objects.filter(
        supplier_id=supplier_id,
        is_deleted=False,
        status=PurchaseOrder.Status.CONFIRMED,
    )
    agg = orders.aggregate(
        total_net_payable       = Sum("net_payable"),
        total_paid              = Sum("total_paid"),
        total_payable_outstanding = Sum("payable_outstanding"),
    )
    return {
        "supplier_id"              : supplier_id,
        "total_net_payable"        : agg["total_net_payable"]          or Decimal("0"),
        "total_paid"               : agg["total_paid"]                 or Decimal("0"),
        "total_payable_outstanding": agg["total_payable_outstanding"]  or Decimal("0"),
    }


def get_suppliers_with_outstanding(
    *,
    search          : str = None,
    payment_status  : str = None,
    min_outstanding : str = None,
    max_outstanding : str = None,
) -> QuerySet:
    """
    Lists suppliers with their total payable_outstanding annotated.
    Supports full filtering:
        search         : supplier name or code (partial match)
        payment_status : filter by order-level payment_status
                         (partial = at least one partial order,
                          unpaid  = at least one fully unpaid order)
        min_outstanding: minimum total outstanding amount
        max_outstanding: maximum total outstanding amount

    NOTE: payment_status here filters the ORDERS being summed, not the supplier.
    e.g. ?payment_status=partial shows suppliers who have at least one partial order.
    """
    # Build the order filter for annotation
    order_filter = Q(
        purchase_orders__is_deleted=False,
        purchase_orders__status=PurchaseOrder.Status.CONFIRMED,
    )
    if _clean(payment_status):
        order_filter &= Q(purchase_orders__payment_status=_clean(payment_status))

    qs = Supplier.objects.filter(is_deleted=False).exclude(code="SYS-OPENING").annotate(
        outstanding=Coalesce(
            Sum(
                "purchase_orders__payable_outstanding",
                filter=order_filter,
            ),
            Value(0, output_field=DecimalField()),
        )
    ).filter(outstanding__gt=0)

    if _clean(search):
        qs = qs.filter(
            Q(name__icontains=_clean(search)) |
            Q(code__icontains=_clean(search))
        )
    if _clean(min_outstanding):
        qs = qs.filter(outstanding__gte=_clean(min_outstanding))
    if _clean(max_outstanding):
        qs = qs.filter(outstanding__lte=_clean(max_outstanding))

    return qs.order_by("-outstanding")


def get_order_payment_summary(order_id: int) -> PurchaseOrder:
    """Full payment breakdown for a single purchase order."""
    return get_object_or_404(
        PurchaseOrder.objects.select_related("supplier").prefetch_related("payments", "items__product"),
        pk=order_id, is_deleted=False,
    )


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

def get_all_inventory(
    *,
    search      : str = None,
    category_id : str = None,
    shelf_id    : str = None,
) -> QuerySet:
    """
    Returns inventory with optional filters:
        search      : product name or product code (partial, case-insensitive)
        category_id : filter by category id
        shelf_id    : filter by shelf id
    """
    qs = Inventory.objects.select_related(
        "product", "product__category", "product__shelf", "last_updated_by",
    ).filter(product__is_deleted=False)

    if _clean(search):
        qs = qs.filter(
            Q(product__name__icontains=_clean(search)) |
            Q(product__code__icontains=_clean(search))
        )
    if _clean(category_id):
        qs = qs.filter(product__category_id=_clean(category_id))
    if _clean(shelf_id):
        qs = qs.filter(product__shelf_id=_clean(shelf_id))

    return qs.order_by("product__name")


def get_inventory_by_product_id(product_id: int) -> Inventory:
    return get_object_or_404(
        Inventory.objects.select_related("product"),
        product_id=product_id,
    )


def get_outstanding_orders_for_supplier(supplier_id: int) -> QuerySet:
    """
    Returns all confirmed PurchaseOrders for a supplier that still have
    payable_outstanding > 0. Order-level breakdown of what we owe.
    Supports the "supplier bill-wise outstanding" view.
    """
    return (
        _order_qs()
        .filter(
            supplier_id=supplier_id,
            is_deleted=False,
            status=PurchaseOrder.Status.CONFIRMED,
            payable_outstanding__gt=0,
        )
        .order_by("created_at")
    )


def get_all_lost_inventory_records(
    *,
    search        : str = None,
    product_id    : str = None,
    product_name  : str = None,
    product_code  : str = None,
    reason        : str = None,
    date          : str = None,
    date_from     : str = None,
    date_to       : str = None,
    min_amount    : str = None,
    max_amount    : str = None,
) -> QuerySet:
    """
    Master filter selector for lost inventory records — mirrors the
    PurchaseOrder filter set (get_all_purchase_orders) wherever an
    equivalent field exists on lost inventory.
        search       : reference number (partial match)
        product_id   : filter records containing a specific product
        product_name : partial match on any item's product name
        product_code : partial match on any item's product code
        reason       : partial match on any item's reason
        date         : exact created_at date
        date_from / date_to : created_at date range
        min_amount / max_amount : total_lost_amount range
    """
    qs = LostInventoryRecord.objects.filter(is_deleted=False).select_related(
        "created_by", "updated_by",
    ).prefetch_related("items__product")

    if _clean(search):
        qs = qs.filter(reference_number__icontains=_clean(search))
    if _clean(product_id):
        qs = qs.filter(items__product_id=_clean(product_id))
    if _clean(product_name):
        qs = qs.filter(items__product__name__icontains=_clean(product_name))
    if _clean(product_code):
        qs = qs.filter(items__product__code__icontains=_clean(product_code))
    if _clean(reason):
        qs = qs.filter(items__reason__icontains=_clean(reason))
    if _clean(date):
        qs = qs.filter(created_at__date=_clean(date))
    if _clean(date_from):
        qs = qs.filter(created_at__date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(created_at__date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(total_lost_amount__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(total_lost_amount__lte=_clean(max_amount))

    if any(_clean(v) for v in (product_id, product_name, product_code, reason)):
        qs = qs.distinct()

    return qs.order_by("-created_at")


def get_lost_inventory_record_by_id(pk: int) -> LostInventoryRecord:
    return get_object_or_404(
        LostInventoryRecord.objects.select_related(
            "created_by", "updated_by",
        ).prefetch_related("items__product", "items__fifo_consumptions__purchase_item"),
        pk=pk, is_deleted=False,
    )


def get_lost_inventory_item_by_id(pk: int) -> LostInventoryItem:
    return get_object_or_404(
        LostInventoryItem.objects.select_related("product", "record"),
        pk=pk,
    )


def get_fifo_cost_preview(*, product_id: int, quantity: int) -> dict:
    """
    Read-only preview of the blended FIFO unit cost for a product/quantity,
    without consuming any stock. Used by the lost-inventory page to show the
    expected cost before submission. Mirrors the walk in
    purchases.services._consume_fifo_for_loss, but never writes.
    """
    batches   = get_available_purchase_items_for_fifo(product_id)
    remaining = quantity
    total_cost = Decimal("0")
    available  = 0

    for batch in batches:
        available += batch.remaining_quantity
        if remaining <= 0:
            continue
        consume = min(batch.remaining_quantity, remaining)
        tax_inclusive_unit_cost = (
            batch.total_price / batch.quantity if batch.quantity > 0 else batch.unit_price
        )
        total_cost += consume * tax_inclusive_unit_cost
        remaining  -= consume

    consumed  = quantity - remaining
    unit_cost = (total_cost / Decimal(str(consumed))) if consumed > 0 else Decimal("0")

    return {
        "product_id"        : product_id,
        "quantity"          : quantity,
        "available_quantity": available,
        "unit_cost"         : unit_cost,
        "total_cost"        : total_cost,
        "sufficient_stock"  : remaining <= 0,
    }


def get_all_outstanding_orders(
    *,
    supplier_name  : str = None,
    supplier_code  : str = None,
    payment_status : str = None,
    date_from      : str = None,
    date_to        : str = None,
    min_outstanding: str = None,
    max_outstanding: str = None,
) -> QuerySet:
    """
    Returns ALL confirmed orders with payable_outstanding > 0,
    across all suppliers. Full filter support.
    Supports the "all outstanding bills" view.
    """
    from django.db.models import Q
    qs = (
        _order_qs()
        .filter(
            is_deleted=False,
            status=PurchaseOrder.Status.CONFIRMED,
            payable_outstanding__gt=0,
        )
    )

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
    if _clean(min_outstanding):
        qs = qs.filter(payable_outstanding__gte=_clean(min_outstanding))
    if _clean(max_outstanding):
        qs = qs.filter(payable_outstanding__lte=_clean(max_outstanding))

    return qs.order_by("-payable_outstanding")