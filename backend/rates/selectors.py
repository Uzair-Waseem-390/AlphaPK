from decimal import Decimal

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import ProductRate, ProductRateHistory


# ---------------------------------------------------------------------------
# ProductRate selectors
# ---------------------------------------------------------------------------

def get_all_rates(
    *,
    search: str = None,
    category_id: int = None,
    shelf_id: int = None,
    min_price: Decimal = None,
    max_price: Decimal = None,
) -> QuerySet:
    """
    Returns current active rates with optional filtering and searching.

    Search  : product name, product code (case-insensitive, partial match)
    Filters : category, shelf, selling price range
    """
    qs = ProductRate.objects.select_related(
        "product",
        "product__category",
        "product__shelf",
        "updated_by",
        "created_by",
    ).filter(
        product__is_deleted=False,   # hide rates for soft-deleted products
    )

    if search:
        from django.db.models import Q
        qs = qs.filter(
            Q(product__name__icontains=search) |
            Q(product__code__icontains=search)
        )

    if category_id is not None:
        qs = qs.filter(product__category_id=category_id)

    if shelf_id is not None:
        qs = qs.filter(product__shelf_id=shelf_id)

    if min_price is not None:
        qs = qs.filter(selling_price__gte=min_price)

    if max_price is not None:
        qs = qs.filter(selling_price__lte=max_price)

    return qs


def get_rate_by_id(pk: int) -> ProductRate:
    return get_object_or_404(
        ProductRate.objects.select_related(
            "product",
            "product__category",
            "product__shelf",
            "updated_by",
            "created_by",
        ),
        pk=pk,
        product__is_deleted=False,
    )


def get_rate_by_product_id(product_id: int) -> ProductRate:
    return get_object_or_404(
        ProductRate.objects.select_related(
            "product",
            "product__category",
            "product__shelf",
            "updated_by",
        ),
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