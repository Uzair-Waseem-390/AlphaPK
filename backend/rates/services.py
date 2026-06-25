from decimal import Decimal

from purchases.models import Product
from purchases.selectors import get_product_by_id

from .models import ProductRate, ProductRateHistory
from .selectors import get_rate_by_id


# ---------------------------------------------------------------------------
# Internal helper — always called after any price change
# ---------------------------------------------------------------------------

def _log_rate_history(*, product: Product, selling_price: Decimal, user, note: str = "") -> None:
    """
    Append a new row to ProductRateHistory.
    Private — only called from within this service module.
    This is the single place responsible for keeping the audit log intact.
    """
    ProductRateHistory.objects.create(
        product=product,
        selling_price=selling_price,
        changed_by=user,
        note=note,
    )


# ---------------------------------------------------------------------------
# Public services
# ---------------------------------------------------------------------------

def create_rate(*, product_id: int, selling_price: Decimal, user, note: str = "") -> ProductRate:
    """
    Create a new ProductRate for a product.
    Raises ValidationError if a rate already exists for this product
    (use update_rate instead).
    """
    product = get_product_by_id(product_id)

    if ProductRate.objects.filter(product=product).exists():
        from rest_framework.exceptions import ValidationError
        raise ValidationError(
            {"product": f"A rate already exists for '{product.name}'. Use PATCH to update it."}
        )

    rate = ProductRate.objects.create(
        product=product,
        selling_price=selling_price,
        created_by=user,
        updated_by=user,
    )
    # Log the initial price setting as first history entry
    _log_rate_history(product=product, selling_price=selling_price, user=user, note=note or "Initial price set.")
    return rate


def update_rate(*, pk: int, selling_price: Decimal, user, note: str = "") -> ProductRate:
    """
    Update the current selling price of an existing ProductRate.
    Always logs the old→new change into ProductRateHistory before saving.
    """
    rate = get_rate_by_id(pk)

    rate.selling_price = selling_price
    rate.updated_by = user
    rate.save(update_fields=["selling_price", "updated_by", "updated_at"])

    _log_rate_history(
        product=rate.product,
        selling_price=selling_price,
        user=user,
        note=note,
    )
    return rate


def update_rate_by_product(*, product_id: int, selling_price: Decimal, user, note: str = "") -> ProductRate:
    """
    Convenience service: update rate using product_id instead of rate pk.
    Useful for bulk update flows where only product IDs are available.
    Delegates to update_rate to keep logic DRY.
    """
    from .selectors import get_rate_by_product_id
    rate = get_rate_by_product_id(product_id)
    return update_rate(pk=rate.pk, selling_price=selling_price, user=user, note=note)