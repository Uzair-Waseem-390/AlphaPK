from rest_framework import serializers

from billing.models import Invoice, Payment
from cash_flow.models import Expense
from purchases.models import LostInventoryItem


# ---------------------------------------------------------------------------
# Shared query-param validation — used by both report views (DRY)
# ---------------------------------------------------------------------------

class ReportDateFilterSerializer(serializers.Serializer):
    """
    Validates the date filters accepted by every report endpoint.
    Either a single `date`, or a `date_from`/`date_to` range — not both.
    """
    date      = serializers.DateField(required=False, allow_null=True)
    date_from = serializers.DateField(required=False, allow_null=True)
    date_to   = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        date      = attrs.get("date")
        date_from = attrs.get("date_from")
        date_to   = attrs.get("date_to")

        if date and (date_from or date_to):
            raise serializers.ValidationError(
                "Use either `date` or `date_from`/`date_to`, not both."
            )
        if date_from and date_to and date_from > date_to:
            raise serializers.ValidationError(
                "`date_from` cannot be after `date_to`."
            )
        return attrs


# ---------------------------------------------------------------------------
# Invoices report — lightweight list item (not the full InvoiceReadSerializer)
# ---------------------------------------------------------------------------

class InvoiceReportItemSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "bill_number", "customer_name",
            "grand_total", "payment_status", "confirmed_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Cash collected report — lightweight list item
# ---------------------------------------------------------------------------

class PaymentReportItemSerializer(serializers.ModelSerializer):
    invoice_bill_number = serializers.CharField(source="invoice.bill_number", read_only=True)
    customer_name       = serializers.CharField(source="invoice.customer.name", read_only=True)
    method_display       = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "reference_number", "invoice_bill_number", "customer_name",
            "amount", "method", "method_display", "payment_date",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Expenses report — lightweight list item
# ---------------------------------------------------------------------------

class ExpenseReportItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Expense
        fields = ["id", "name", "category_name", "amount", "expense_date"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Lost inventory report — lightweight list item
# ---------------------------------------------------------------------------

class LostInventoryReportItemSerializer(serializers.ModelSerializer):
    reference_number = serializers.CharField(source="record.reference_number", read_only=True)
    product_name      = serializers.CharField(source="product.name", read_only=True)
    product_code      = serializers.CharField(source="product.code", read_only=True)
    created_at        = serializers.DateTimeField(source="record.created_at", read_only=True)

    class Meta:
        model = LostInventoryItem
        fields = [
            "id", "reference_number", "product_name", "product_code",
            "quantity", "reason", "unit_cost", "total_cost", "created_at",
        ]
        read_only_fields = fields
