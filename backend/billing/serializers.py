from rest_framework import serializers

from .models import Customer, Invoice, InvoiceItem, Payment, Return, ReturnItem


# ---------------------------------------------------------------------------
# Customer
# ---------------------------------------------------------------------------

class CustomerReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Customer
        fields = ["id", "name", "code", "address", "mobile", "created_by", "updated_by", "created_at", "updated_at"]
        read_only_fields = ["id", "created_by", "updated_by", "created_at", "updated_at"]


class CustomerWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["name", "code", "address", "mobile"]

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Customer name cannot be blank.")
        return value.strip()

    def validate_mobile(self, value):
        if value and not value.replace("+", "").replace("-", "").replace(" ", "").isdigit():
            raise serializers.ValidationError("Enter a valid mobile number.")
        return value


# ---------------------------------------------------------------------------
# Invoice Item — nested inside invoice
# ---------------------------------------------------------------------------

class InvoiceItemReadSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_code = serializers.CharField(source="product.code", read_only=True)
    returnable_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            "id", "product", "product_name", "product_code",
            "quantity", "returned_quantity", "returnable_quantity",
            "selling_price", "cogs_per_unit",
            "line_total", "line_cogs", "line_profit",
        ]
        read_only_fields = fields


class InvoiceItemWriteSerializer(serializers.Serializer):
    """Used inside invoice create/update — not a standalone endpoint."""
    product_id = serializers.IntegerField()
    quantity   = serializers.IntegerField(min_value=1)


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------

class InvoiceReadSerializer(serializers.ModelSerializer):
    customer    = CustomerReadSerializer(read_only=True)
    items       = InvoiceItemReadSerializer(many=True, read_only=True)
    created_by  = serializers.StringRelatedField(read_only=True)
    updated_by  = serializers.StringRelatedField(read_only=True)
    confirmed_by = serializers.StringRelatedField(read_only=True)
    deleted_by  = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "bill_number", "customer", "status",
            "subtotal", "total_cogs", "gross_profit",
            "items",
            "confirmed_by", "confirmed_at",
            "created_by", "updated_by", "deleted_by",
            "created_at", "updated_at", "deleted_at",
        ]
        read_only_fields = fields


class InvoiceCreateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField()
    items       = InvoiceItemWriteSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value


class InvoiceUpdateSerializer(serializers.Serializer):
    """Only items can be changed on a draft invoice."""
    items = InvoiceItemWriteSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required.")
        return value


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

class PaymentReadSerializer(serializers.ModelSerializer):
    created_by = serializers.StringRelatedField(read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice", "amount", "method", "method_display",
            "payment_date", "note", "created_by", "created_at",
        ]
        read_only_fields = fields


class PaymentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["invoice", "amount", "method", "payment_date", "note"]

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be greater than zero.")
        return value


# ---------------------------------------------------------------------------
# Return
# ---------------------------------------------------------------------------

class ReturnItemWriteSerializer(serializers.Serializer):
    invoice_item_id = serializers.IntegerField()
    quantity        = serializers.IntegerField(min_value=1)


class ReturnCreateSerializer(serializers.Serializer):
    invoice_id = serializers.IntegerField()
    items      = ReturnItemWriteSerializer(many=True)
    note       = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("At least one item is required for a return.")
        return value


class ReturnItemReadSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="invoice_item.product.name", read_only=True)
    product_code = serializers.CharField(source="invoice_item.product.code", read_only=True)

    class Meta:
        model = ReturnItem
        fields = [
            "id", "product_name", "product_code",
            "quantity", "selling_price", "cogs_per_unit",
            "line_total", "line_cogs",
        ]
        read_only_fields = fields


class ReturnReadSerializer(serializers.ModelSerializer):
    items       = ReturnItemReadSerializer(many=True, read_only=True)
    created_by  = serializers.StringRelatedField(read_only=True)
    accepted_by = serializers.StringRelatedField(read_only=True)
    invoice_bill_number = serializers.CharField(source="invoice.bill_number", read_only=True)

    class Meta:
        model = Return
        fields = [
            "id", "invoice", "invoice_bill_number", "status",
            "total_return_amount", "total_return_cogs",
            "items", "note",
            "accepted_by", "accepted_at",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = fields