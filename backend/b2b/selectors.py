from django.db.models import F, QuerySet

from backend.search import search_q
from rates.models import ProductRate

from .models import PartnerRateAccess


def get_partner_access(partner_name: str):
    """The access row for one partner, or None. One indexed (unique) lookup."""
    return PartnerRateAccess.objects.filter(partner_name=partner_name).first()


def list_partner_requests(*, status: str = None) -> QuerySet:
    """Approval list, newest request first. select_related feeds decided_by."""
    qs = PartnerRateAccess.objects.select_related("decided_by")
    if status and status in PartnerRateAccess.Status.values:
        qs = qs.filter(status=status)
    return qs


def get_shared_rate_list(*, search: str = None) -> QuerySet:
    """
    What an approved partner may see: priced, non-deleted products — and
    ONLY code, name and selling price. Nothing else about a product (ids,
    category, cost, audit users) ever leaves this software.

    Every ProductRate row is a priced product (unpriced ones live in
    rates.UnpricedProduct), so no extra "has a price" filter is needed.
    values() keeps it to one INNER JOIN and no model instantiation; the
    (name, code) index on Product serves the ordering.
    """
    qs = ProductRate.objects.filter(product__is_deleted=False)
    if search and search.strip():
        qs = qs.filter(search_q(search.strip(), "product__name", "product__code"))
    return (
        qs.annotate(code=F("product__code"), name=F("product__name"), price=F("selling_price"))
        .values("code", "name", "price")
        .order_by("name", "code")
    )
