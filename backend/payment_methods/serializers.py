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
    class Meta:
        model  = PaymentAllocation
        fields = [
            "id", "payment_method", "source_model", "source_id",
            "direction", "amount", "date", "created_at",
        ]
        read_only_fields = fields
