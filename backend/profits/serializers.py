from rest_framework import serializers


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
