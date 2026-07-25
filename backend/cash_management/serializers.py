from rest_framework import serializers

from .models import CashAdjustment, Investor, InvestorTransaction, OwnerTransaction


class CashManagementStatsSerializer(serializers.Serializer):
    """Read-only serializer for the 10 cash-management stats."""
    total_cash_lost               = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_cash_recovered          = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_cash_lost                 = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_investor_capital        = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_investor_withdrawn      = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_investor_capital          = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_owner_contributions     = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_owner_drawings          = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_owner_withdrawals_count = serializers.IntegerField()
    net_owner_capital             = serializers.DecimalField(max_digits=20, decimal_places=4)


# ---------------------------------------------------------------------------
# CashAdjustment
# ---------------------------------------------------------------------------

class CashAdjustmentReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = CashAdjustment
        fields = [
            "id", "amount", "adjustment_type", "adjustment_date", "reason",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class CashAdjustmentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = CashAdjustment
        fields = ["amount", "adjustment_type", "adjustment_date", "reason"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


# ---------------------------------------------------------------------------
# Investor
# ---------------------------------------------------------------------------

class InvestorReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = Investor
        fields = [
            "id", "name", "contact_number", "email", "note",
            "total_invested", "total_withdrawn", "net_stake",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class InvestorWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Investor
        fields = ["name", "contact_number", "email", "note"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Investor name cannot be blank.")
        return value.strip()


# ---------------------------------------------------------------------------
# InvestorTransaction
# ---------------------------------------------------------------------------

class InvestorTransactionReadSerializer(serializers.ModelSerializer):
    investor_name = serializers.CharField(source="investor.name", read_only=True)
    created_by    = serializers.StringRelatedField(read_only=True)
    updated_by    = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = InvestorTransaction
        fields = [
            "id", "investor", "investor_name", "transaction_type", "amount",
            "transaction_date", "note",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class InvestorTransactionWriteSerializer(serializers.ModelSerializer):
    investor = serializers.PrimaryKeyRelatedField(queryset=Investor.objects.filter(is_deleted=False))

    class Meta:
        model  = InvestorTransaction
        fields = ["investor", "transaction_type", "amount", "transaction_date", "note"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


# ---------------------------------------------------------------------------
# OwnerTransaction
# ---------------------------------------------------------------------------

class OwnerTransactionReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = OwnerTransaction
        fields = [
            "id", "transaction_type", "amount", "transaction_date", "note",
            "created_by", "updated_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


class OwnerTransactionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model  = OwnerTransaction
        fields = ["transaction_type", "amount", "transaction_date", "note"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value
