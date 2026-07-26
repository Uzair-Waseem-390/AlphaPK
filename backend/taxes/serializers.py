from rest_framework import serializers

from .models import TaxPayment, WHTPayment


class TaxStatsSerializer(serializers.Serializer):
    """Read-only serializer for the 9 tax-position stats."""
    total_input_tax_paid              = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_output_tax_collected        = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_sales_tax_payable             = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_sales_tax_paid              = serializers.DecimalField(max_digits=20, decimal_places=4)
    sales_tax_outstanding             = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_wht_withheld_from_suppliers = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_wht_withheld_by_customers   = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_wht_paid                    = serializers.DecimalField(max_digits=20, decimal_places=4)
    wht_outstanding                   = serializers.DecimalField(max_digits=20, decimal_places=4)


class TaxPaymentReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = TaxPayment
        fields = [
            "id", "amount", "payment_date", "note",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class TaxPaymentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TaxPayment
        fields = ["amount", "payment_date", "note"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class WHTPaymentReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = WHTPayment
        fields = [
            "id", "amount", "payment_date", "note",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class WHTPaymentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = WHTPayment
        fields = ["amount", "payment_date", "note"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
