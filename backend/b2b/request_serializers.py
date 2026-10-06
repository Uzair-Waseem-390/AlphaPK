from decimal import Decimal

from rest_framework import serializers

from . import config
from .models import PurchaseRequest, PurchaseRequestItem


# ---------------------------------------------------------------------------
# Partner-facing
# ---------------------------------------------------------------------------

class RequestableProductSerializer(serializers.Serializer):
    """
    One searchable product. NEVER any stock figure. The price is only filled in
    when the partner's rate-list access is approved (view passes rates_allowed).
    """
    code = serializers.CharField()
    name = serializers.CharField()
    selling_price = serializers.SerializerMethodField()

    def get_selling_price(self, row):
        if not self.context.get("rates_allowed"):
            return None
        return str(Decimal(row["price"]).quantize(Decimal("0.0001")))


class SubmitItemSerializer(serializers.Serializer):
    product_code = serializers.CharField(max_length=100)
    product_name = serializers.CharField(max_length=255)
    quantity = serializers.IntegerField(min_value=1, max_value=1_000_000)
    discount = serializers.DecimalField(max_digits=10, decimal_places=4, default=Decimal("0"))
    gst = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, default=Decimal("0"))
    wht = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, default=Decimal("0"))


class SubmitRequestSerializer(serializers.Serializer):
    request_uuid = serializers.UUIDField()
    note = serializers.CharField(max_length=500, allow_blank=True, default="")
    items = SubmitItemSerializer(many=True, allow_empty=False)

    def validate_items(self, items):
        if len(items) > config.MAX_REQUEST_ITEMS:
            raise serializers.ValidationError(f"At most {config.MAX_REQUEST_ITEMS} items per request.")
        return items


class DecisionItemSerializer(serializers.ModelSerializer):
    """An accepted line as the partner needs it to build its own order."""
    quantity = serializers.IntegerField(source="accepted_quantity")
    unit_price = serializers.DecimalField(source="effective_price", max_digits=14, decimal_places=4)

    class Meta:
        model = PurchaseRequestItem
        fields = ["product_code", "quantity", "unit_price", "gst", "wht"]


class DecisionSerializer(serializers.ModelSerializer):
    items = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = ["request_uuid", "status", "items"]

    def get_items(self, request):
        # Read as prefetched (selector already limited it to accepted > 0 lines).
        if request.status != PurchaseRequest.Status.ACCEPTED:
            return []
        return DecisionItemSerializer(request.items.all(), many=True).data


# ---------------------------------------------------------------------------
# Admin-facing
# ---------------------------------------------------------------------------

class PurchaseRequestListSerializer(serializers.ModelSerializer):
    decided_by = serializers.StringRelatedField(read_only=True)
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseRequest
        fields = [
            "id", "partner_name", "request_uuid", "status", "note", "requested_at",
            "decided_at", "decided_by", "invoice_number", "item_count",
        ]
        read_only_fields = fields


class PurchaseRequestItemDetailSerializer(serializers.ModelSerializer):
    # Filled from context maps the view builds with ONE query each (stock / rates).
    available_quantity = serializers.SerializerMethodField()
    current_price = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequestItem
        fields = [
            "id", "product", "product_code", "product_name", "requested_quantity",
            "accepted_quantity", "discount", "gst", "wht", "effective_price",
            "available_quantity", "current_price",
        ]
        read_only_fields = fields

    def get_available_quantity(self, item):
        stock = self.context.get("stock")
        return None if stock is None else stock.get(item.product_id, 0)

    def get_current_price(self, item):
        prices = self.context.get("prices")
        if prices is None or item.product_id not in prices:
            return None
        return str(Decimal(prices[item.product_id]).quantize(Decimal("0.0001")))


class PurchaseRequestDetailSerializer(serializers.ModelSerializer):
    decided_by = serializers.StringRelatedField(read_only=True)
    items = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = [
            "id", "partner_name", "request_uuid", "status", "note", "requested_at",
            "decided_at", "decided_by", "invoice", "invoice_number", "items",
        ]
        read_only_fields = fields

    def get_items(self, request):
        return PurchaseRequestItemDetailSerializer(
            request.items.all(), many=True, context=self.context,
        ).data


class ShelfAllocationInputSerializer(serializers.Serializer):
    shelf_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class AcceptItemInputSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1)
    accepted_quantity = serializers.IntegerField(min_value=0, max_value=1_000_000)
    shelf_allocations = ShelfAllocationInputSerializer(many=True, required=False, default=list)


class AcceptRequestSerializer(serializers.Serializer):
    items = AcceptItemInputSerializer(many=True, allow_empty=False)
