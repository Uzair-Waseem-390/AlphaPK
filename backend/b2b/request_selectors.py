"""Reads for purchase requests (see models.PurchaseRequest). All reads live here."""

from django.db.models import Count, IntegerField, OuterRef, Prefetch, QuerySet, Subquery
from django.db.models.functions import Coalesce

from purchases.models import Inventory
from rates.models import ProductRate

from .models import PurchaseRequest, PurchaseRequestItem

Status = PurchaseRequest.Status


def list_purchase_requests(*, status: str = None) -> QuerySet:
    """
    Admin list, newest first. Cancelled requests never show here (they are kept
    in the table, just hidden). One query: select_related feeds decided_by and
    the item count is a single GROUP BY, not a count per row.
    """
    qs = (
        PurchaseRequest.objects.exclude(status=Status.CANCELLED)
        .select_related("decided_by")
        .annotate(item_count=Coalesce(Subquery(
            PurchaseRequestItem.objects.filter(request=OuterRef("pk"))
            .order_by().values("request").annotate(n=Count("pk")).values("n"),
            output_field=IntegerField(),
        ), 0))
    )
    if status and status in Status.values:
        qs = qs.filter(status=status)
    return qs


def get_purchase_request(pk: int):
    """One request with its items (single prefetch). None when it doesn't exist."""
    return (
        PurchaseRequest.objects.select_related("decided_by")
        .prefetch_related("items")
        .filter(pk=pk)
        .first()
    )


def get_stock_levels(product_ids) -> dict:
    """{product_id: on-hand quantity} for the admin screen only — one query for all items."""
    return dict(Inventory.objects.filter(product_id__in=product_ids).values_list("product_id", "quantity"))


def get_current_prices(product_ids) -> dict:
    """{product_id: selling price} — one query for all items."""
    return dict(ProductRate.objects.filter(product_id__in=product_ids).values_list("product_id", "selling_price"))


def get_requests_for_partner(partner_name: str, request_uuids) -> QuerySet:
    """
    The partner's own requests by id (the decisions it is waiting on). Accepted
    lines are filtered INSIDE the prefetch (architecture rule: never re-filter a
    prefetched relation in the serializer).
    """
    return (
        PurchaseRequest.objects.filter(partner_name=partner_name, request_uuid__in=request_uuids)
        .prefetch_related(
            Prefetch("items", queryset=PurchaseRequestItem.objects.filter(accepted_quantity__gt=0))
        )
    )
