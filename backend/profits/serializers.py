from rest_framework import serializers

from .models import InvestorProfitPayout, MonthlyProfit, MonthlyProfitInvestorShare


class InvestorShareSerializer(serializers.Serializer):
    id            = serializers.IntegerField()
    name          = serializers.CharField()
    current_worth = serializers.DecimalField(max_digits=20, decimal_places=4)
    share_percent = serializers.DecimalField(max_digits=10, decimal_places=4)


class OwnershipSplitSerializer(serializers.Serializer):
    # Business worth breakdown — every component broken out so the total is
    # explainable, not a black box.
    cash_in_hand                 = serializers.DecimalField(max_digits=20, decimal_places=4)
    inventory_value              = serializers.DecimalField(max_digits=20, decimal_places=4)
    assets_current_worth         = serializers.DecimalField(max_digits=20, decimal_places=4)
    customer_outstanding         = serializers.DecimalField(max_digits=20, decimal_places=4)
    supplier_payable_outstanding = serializers.DecimalField(max_digits=20, decimal_places=4)
    sales_tax_outstanding        = serializers.DecimalField(max_digits=20, decimal_places=4)
    wht_outstanding              = serializers.DecimalField(max_digits=20, decimal_places=4)
    recurring_expense_pending    = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_business_worth         = serializers.DecimalField(max_digits=20, decimal_places=4)

    # Ownership split
    total_investor_net_worth = serializers.DecimalField(max_digits=20, decimal_places=4)
    investors                 = InvestorShareSerializer(many=True)
    owner_worth                = serializers.DecimalField(max_digits=20, decimal_places=4)
    owner_share_percent        = serializers.DecimalField(max_digits=10, decimal_places=4)


# ---------------------------------------------------------------------------
# Monthly Profit
# ---------------------------------------------------------------------------

class InvestorProfitPayoutReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model  = InvestorProfitPayout
        fields = [
            "id", "amount", "payout_date", "action_type", "note",
            "linked_investor_transaction", "created_by", "created_at",
        ]
        read_only_fields = fields


class InvestorProfitPayoutWriteSerializer(serializers.Serializer):
    amount       = serializers.DecimalField(max_digits=18, decimal_places=4)
    action_type  = serializers.ChoiceField(choices=InvestorProfitPayout.ActionType.choices)
    payout_date  = serializers.DateField()
    note         = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class MonthlyProfitInvestorShareSerializer(serializers.ModelSerializer):
    amount_settled   = serializers.DecimalField(max_digits=20, decimal_places=4, read_only=True)
    amount_remaining = serializers.DecimalField(max_digits=20, decimal_places=4, read_only=True)
    payouts          = InvestorProfitPayoutReadSerializer(many=True, read_only=True)

    class Meta:
        model  = MonthlyProfitInvestorShare
        fields = [
            "id", "investor", "investor_name_snapshot", "share_percent_snapshot",
            "share_amount", "amount_paid_out", "amount_reinvested",
            "amount_settled", "amount_remaining", "payment_status", "payouts",
        ]
        read_only_fields = fields

    def to_representation(self, instance):
        rep = super().to_representation(instance)
        # payouts relation only includes non-deleted rows for display
        rep["payouts"] = InvestorProfitPayoutReadSerializer(
            instance.payouts.filter(is_deleted=False).order_by("-payout_date", "-created_at"), many=True,
        ).data
        return rep


class MonthlyProfitListSerializer(serializers.ModelSerializer):
    class Meta:
        model  = MonthlyProfit
        fields = ["period", "gross_profit", "net_gross_profit", "net_profit", "computed_at"]
        read_only_fields = fields


class MonthlyProfitDetailSerializer(serializers.ModelSerializer):
    investor_shares = MonthlyProfitInvestorShareSerializer(many=True, read_only=True)

    class Meta:
        model  = MonthlyProfit
        fields = [
            "period",
            "gross_revenue", "gross_cogs", "gross_profit",
            "net_revenue", "net_cogs", "net_gross_profit",
            "expenses_paid", "recurring_expenses_paid", "gst_paid", "wht_paid",
            "lost_inventory_net", "lost_cash_net", "depreciation", "disposal_gain_loss",
            "net_profit",
            "total_investor_share_percent", "total_investor_share_amount",
            "owner_share_percent", "owner_share_amount",
            "computed_at", "investor_shares",
        ]
        read_only_fields = fields


class InvestorSharePreviewSerializer(serializers.Serializer):
    id            = serializers.IntegerField()
    name          = serializers.CharField()
    share_percent = serializers.DecimalField(max_digits=10, decimal_places=4)
    share_amount  = serializers.DecimalField(max_digits=20, decimal_places=4)


class CurrentMonthProfitSerializer(serializers.Serializer):
    period                    = serializers.CharField()
    is_provisional             = serializers.BooleanField()
    gross_revenue              = serializers.DecimalField(max_digits=20, decimal_places=4)
    gross_cogs                  = serializers.DecimalField(max_digits=20, decimal_places=4)
    gross_profit                = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_revenue                 = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_cogs                    = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_gross_profit            = serializers.DecimalField(max_digits=20, decimal_places=4)
    expenses_paid                = serializers.DecimalField(max_digits=20, decimal_places=4)
    recurring_expenses_paid      = serializers.DecimalField(max_digits=20, decimal_places=4)
    gst_paid                      = serializers.DecimalField(max_digits=20, decimal_places=4)
    wht_paid                      = serializers.DecimalField(max_digits=20, decimal_places=4)
    lost_inventory_net            = serializers.DecimalField(max_digits=20, decimal_places=4)
    lost_cash_net                 = serializers.DecimalField(max_digits=20, decimal_places=4)
    depreciation                   = serializers.DecimalField(max_digits=20, decimal_places=4)
    disposal_gain_loss             = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_profit                     = serializers.DecimalField(max_digits=20, decimal_places=4)

    # Live preview only — informational, matches the same % Business Worth
    # uses today. Never stored, no settle actions apply to it.
    investors_preview           = InvestorSharePreviewSerializer(many=True)
    owner_share_percent          = serializers.DecimalField(max_digits=10, decimal_places=4)
    owner_share_amount_preview   = serializers.DecimalField(max_digits=20, decimal_places=4)


class NetProfitTrendItemSerializer(serializers.Serializer):
    month             = serializers.CharField()
    gross_profit      = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_gross_profit  = serializers.DecimalField(max_digits=20, decimal_places=4)
    net_profit        = serializers.DecimalField(max_digits=20, decimal_places=4)


class ProfitFlowStatsSerializer(serializers.Serializer):
    total_net_profit               = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_investor_profit_share    = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_owner_profit_share       = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_paid_out_to_investors    = serializers.DecimalField(max_digits=20, decimal_places=4)
    total_reinvested_by_investors  = serializers.DecimalField(max_digits=20, decimal_places=4)
    months_finalized_count         = serializers.IntegerField()
