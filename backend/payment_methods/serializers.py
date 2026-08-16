from rest_framework import serializers

from .models import PaymentAllocation, PaymentMethod


class PaymentMethodReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = PaymentMethod
        fields = [
            "id", "name", "account_number", "balance", "is_protected",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class PaymentMethodWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = PaymentMethod
        fields = ["name", "account_number"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Method name cannot be blank.")
        return value.strip()


class PaymentAllocationReadSerializer(serializers.ModelSerializer):
    payment_method_name = serializers.CharField(source="payment_method.name", read_only=True)

    class Meta:
        model  = PaymentAllocation
        fields = [
            "id", "payment_method", "payment_method_name", "source_model", "source_id",
            "direction", "amount", "date", "created_at",
        ]
        read_only_fields = fields


class MethodAllocationInputSerializer(serializers.Serializer):
    """
    Shared input shape for "how was this transaction split across methods"
    — used by billing/purchases' payment and advance-payment write
    serializers. Resolves `payment_method` straight to the model instance
    so callers can pass `[(d["payment_method"], d["amount"]) for d in ...]`
    directly into payment_methods.services.record_allocations.
    """
    payment_method = serializers.PrimaryKeyRelatedField(
        queryset=PaymentMethod.objects.filter(is_deleted=False),
    )
    amount = serializers.DecimalField(max_digits=20, decimal_places=4)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
