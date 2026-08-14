from rest_framework import serializers


# ---------------------------------------------------------------------------
# A/R Aging
# ---------------------------------------------------------------------------

class ARAgingRowSerializer(serializers.Serializer):
    invoice_id     = serializers.IntegerField()
    bill_number    = serializers.CharField()
    customer_id    = serializers.IntegerField()
    customer_name  = serializers.CharField()
    customer_code  = serializers.CharField()
    due_date       = serializers.DateField()
    days_overdue   = serializers.IntegerField()
    bucket         = serializers.CharField()
    outstanding    = serializers.DecimalField(max_digits=18, decimal_places=4)


# ---------------------------------------------------------------------------
# A/P Aging
# ---------------------------------------------------------------------------

class APAgingRowSerializer(serializers.Serializer):
    order_id        = serializers.IntegerField()
    order_number    = serializers.CharField()
    supplier_id     = serializers.IntegerField()
    supplier_name   = serializers.CharField()
    supplier_code   = serializers.CharField()
    confirmed_date  = serializers.DateField()
    days_overdue    = serializers.IntegerField()
    bucket          = serializers.CharField()
    outstanding     = serializers.DecimalField(max_digits=18, decimal_places=4)


# ---------------------------------------------------------------------------
# Fixed Asset Register
# ---------------------------------------------------------------------------

class FixedAssetRegisterRowSerializer(serializers.Serializer):
    asset_id                   = serializers.IntegerField()
    name                       = serializers.CharField()
    category                   = serializers.CharField()
    valuation_method           = serializers.CharField()
    acquisition_date           = serializers.DateField()
    cost                       = serializers.DecimalField(max_digits=18, decimal_places=4)
    accumulated_depreciation   = serializers.DecimalField(max_digits=18, decimal_places=4)
    net_book_value             = serializers.DecimalField(max_digits=18, decimal_places=4)
    is_disposed                = serializers.BooleanField()
    disposal_date              = serializers.DateField(allow_null=True)
    disposal_type              = serializers.CharField(allow_null=True)
    gain_loss_on_disposal      = serializers.DecimalField(max_digits=18, decimal_places=4, allow_null=True)
