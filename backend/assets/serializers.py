from rest_framework import serializers

from .models import Asset, AssetCategory, AssetDisposal, AssetValuationEntry


class AssetStatsSerializer(serializers.Serializer):
    """Read-only serializer for the 6 asset stats."""
    total_asset_cost               = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_current_worth            = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_accumulated_depreciation = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_disposed_count           = serializers.IntegerField()
    total_gain_on_disposal         = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_loss_on_disposal         = serializers.DecimalField(max_digits=20, decimal_places=4)


# ---------------------------------------------------------------------------
# AssetCategory
# ---------------------------------------------------------------------------

class AssetCategoryReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = AssetCategory
        fields = ["id", "name", "valuation_method", "depreciation_rate", "created_by", "created_at", "updated_at"]
        read_only_fields = fields


class AssetCategoryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AssetCategory
        fields = ["name", "valuation_method", "depreciation_rate"]


class AssetCategoryUpdateSerializer(serializers.Serializer):
    """No valuation_method field — permanently locked after creation."""
    name              = serializers.CharField(max_length=255, required=False)
    depreciation_rate = serializers.DecimalField(max_digits=5, decimal_places=4, required=False)


# ---------------------------------------------------------------------------
# Asset
# ---------------------------------------------------------------------------

class AssetReadSerializer(serializers.ModelSerializer):
    category_name      = serializers.CharField(source="category.name", read_only=True)
    valuation_method    = serializers.CharField(source="category.valuation_method", read_only=True)
    created_by          = serializers.StringRelatedField(read_only=True)
    updated_by          = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = Asset
        fields = [
            "id", "name", "category", "category_name", "valuation_method",
            "acquisition_type", "cost", "acquisition_date", "current_worth",
            "note", "is_disposed",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class AssetCreateSerializer(serializers.Serializer):
    name              = serializers.CharField(max_length=255)
    category           = serializers.PrimaryKeyRelatedField(queryset=AssetCategory.objects.all())
    acquisition_type    = serializers.ChoiceField(choices=Asset.AcquisitionType.choices)
    cost                = serializers.DecimalField(max_digits=18, decimal_places=4)
    acquisition_date    = serializers.DateField()
    note                = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# AssetValuationEntry
# ---------------------------------------------------------------------------

class AssetValuationEntryReadSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = AssetValuationEntry
        fields = [
            "id", "asset", "asset_name", "entry_type", "period", "rate_applied",
            "worth_before", "worth_after", "amount", "note",
            "created_by", "created_at",
        ]
        read_only_fields = fields


class AssetRevalueSerializer(serializers.Serializer):
    new_worth         = serializers.DecimalField(max_digits=18, decimal_places=4)
    revaluation_date  = serializers.DateField()
    note              = serializers.CharField(required=False, allow_blank=True, default="")


# ---------------------------------------------------------------------------
# AssetDisposal
# ---------------------------------------------------------------------------

class AssetDisposalReadSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source="asset.name", read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = AssetDisposal
        fields = [
            "id", "asset", "asset_name", "disposal_type", "disposal_date",
            "sale_amount", "worth_at_disposal", "gain_loss", "reason",
            "created_by", "created_at",
        ]
        read_only_fields = fields


class AssetDisposeSerializer(serializers.Serializer):
    disposal_type  = serializers.ChoiceField(choices=AssetDisposal.DisposalType.choices)
    disposal_date  = serializers.DateField()
    sale_amount    = serializers.DecimalField(max_digits=18, decimal_places=4, required=False, allow_null=True)
    reason         = serializers.CharField(required=False, allow_blank=True, default="")
