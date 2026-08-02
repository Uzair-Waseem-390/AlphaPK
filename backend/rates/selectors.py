from decimal import Decimal

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import ProductRate, ProductRateHistory


# ---------------------------------------------------------------------------
# ProductRate selectors
# ---------------------------------------------------------------------------

def _clean(value):
    """Returns None if value is None or empty/whitespace, else stripped string."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


# ProductRateReadSerializer nests the full ProductReadSerializer (which in
# turn nests category/shelf with their audit users) — everything here is
# serialized; without the user relations each row costs up to 6 extra
# queries (N+1).
_RATE_RELATED = (
    "product", "product__category", "product__shelf",
    "product__created_by", "product__updated_by",
    "product__category__created_by", "product__category__updated_by",
    "product__shelf__created_by", "product__shelf__updated_by",
    "updated_by", "created_by",
)


def get_all_rates(
    *,
    search      : str = None,
    category_id : str = None,
    shelf_id    : str = None,
    min_price   : str = None,
    max_price   : str = None,
) -> QuerySet:
    """
    Returns current active rates with optional filtering and searching.

    Search  : product name or product code (case-insensitive, partial match)
    Filters : category id, shelf id, min/max selling price
    """
    from django.db.models import Q

    qs = ProductRate.objects.select_related(*_RATE_RELATED).filter(
        product__is_deleted=False,
    )

    if _clean(search):
        qs = qs.filter(
            Q(product__name__icontains=_clean(search)) |
            Q(product__code__icontains=_clean(search))
        )
    if _clean(category_id):
        qs = qs.filter(product__category_id=_clean(category_id))
    if _clean(shelf_id):
        qs = qs.filter(product__shelf_id=_clean(shelf_id))
    if _clean(min_price):
        qs = qs.filter(selling_price__gte=_clean(min_price))
    if _clean(max_price):
        qs = qs.filter(selling_price__lte=_clean(max_price))

    return qs


def get_rate_by_id(pk: int) -> ProductRate:
    return get_object_or_404(
        ProductRate.objects.select_related(*_RATE_RELATED),
        pk=pk,
        product__is_deleted=False,
    )


def get_rate_by_product_id(product_id: int) -> ProductRate:
    return get_object_or_404(
        ProductRate.objects.select_related(*_RATE_RELATED),
        product_id=product_id,
        product__is_deleted=False,
    )


# ---------------------------------------------------------------------------
# ProductRateHistory selectors
# ---------------------------------------------------------------------------

def get_history_for_product(product_id: int) -> QuerySet:
    """Full price change log for a single product, newest first."""
    return ProductRateHistory.objects.select_related(
        "product", "changed_by"
    ).filter(product_id=product_id)


def get_price_at_date(product_id: int, at: timezone.datetime) -> ProductRateHistory | None:
    """
    Returns the most recent history entry for a product at or before
    the given datetime. Used by billing to snapshot the correct price.
    Returns None if no price was set before that date.
    """
    return (
        ProductRateHistory.objects
        .filter(product_id=product_id, changed_at__lte=at)
        .order_by("-changed_at")
        .first()
    )