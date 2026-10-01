from rest_framework import serializers

from .models import PartnerRateAccess


class PartnerAccessSerializer(serializers.ModelSerializer):
    # decided_by is select_related by selectors.list_partner_requests; the
    # action views assign the user object directly, so neither path adds a query.
    decided_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = PartnerRateAccess
        fields = ["id", "partner_name", "status", "requested_at", "status_changed_at", "decided_by"]
        read_only_fields = fields


class SharedRateSerializer(serializers.Serializer):
    """The ONLY shape a partner ever receives for a product."""
    code = serializers.CharField()
    name = serializers.CharField()
    selling_price = serializers.DecimalField(max_digits=14, decimal_places=4, source="price")
