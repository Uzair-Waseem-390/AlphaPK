from decimal import Decimal

from rest_framework import serializers

from .models import Customer, Invoice, InvoiceItem, Payment, Return, ReturnItem


# ---------------------------------------------------------------------------
# Draft preview helper — pure read, zero DB writes
# ---------------------------------------------------------------------------

def _build_draft_preview(invoice: Invoice) -> dict | None:
    """
    Computes a live price preview for DRAFT invoices only.
    Reads current rate list price and oldest available purchase cost (FIFO peek).
    Never writes anything — purely informational.
    Returns None for non-draft invoices (confirmed invoices have real numbers).
    """
    if invoice.status != Invoice.Status.DRAFT:
        return None

    from purchases.models import PurchaseItem

    preview_items     = []
    total_subtotal    = Decimal("0")
    total_cogs        = Decimal("0")
    has_missing_rate  = False
    has_missing_stock = False

    for item in invoice.items.all():
        product = item.product

        # --- Selling price from rate list ---
        try:
            selling_price = product.rate.selling_price
        except Exception:
            selling_price    = None
            has_missing_rate = True

        # --- FIFO peek: blended cost from oldest batches (read-only) ---
        batches = (
            PurchaseItem.objects
            .filter(product=product, is_deleted=False, remaining_quantity__gt=0)
            .order_by("created_at")
        )
        available_qty  = sum(b.remaining_quantity for b in batches)
        qty_to_consume = item.quantity
        remaining      = qty_to_consume
        total_cost     = Decimal("0")
        stock_ok       = available_qty >= qty_to_consume

        if not stock_ok:
            has_missing_stock = True
            cogs_per_unit     = None
        else:
            for batch in batches:
                if remaining <= 0:
                    break
                consume = min(batch.remaining_quantity, remaining)
                # Tax-inclusive unit cost mirrors _run_fifo: total_price / quantity
                tax_inclusive = (
                    batch.total_price / batch.quantity
                    if batch.quantity > 0 else batch.unit_price
                )
                total_cost += consume * tax_inclusive
                remaining  -= consume
            cogs_per_unit = (
                total_cost / Decimal(str(qty_to_consume))
                if qty_to_consume else Decimal("0")
            )

        # --- Line totals ---
        if selling_price is not None and cogs_per_unit is not None:
            line_total      = selling_price * item.quantity
            line_cogs       = cogs_per_unit * item.quantity
            line_profit     = line_total - line_cogs
            total_subtotal += line_total
            total_cogs     += line_cogs
        else:
            line_total = line_cogs = line_profit = None

        p = Decimal("0.0001")
        preview_items.append({
            "invoice_item_id"    : item.id,
            "product_name"       : product.name,
            "product_code"       : product.code,
            "quantity"           : item.quantity,
            "available_stock"    : available_qty,
            "selling_price"      : str(selling_price) if selling_price is not None else None,
            "cogs_per_unit"      : str(cogs_per_unit.quantize(p)) if cogs_per_unit is not None else None,
            "line_total"         : str(line_total.quantize(p)) if line_total is not None else None,
            "line_cogs"          : str(line_cogs.quantize(p)) if line_cogs is not None else None,
            "line_profit"        : str(line_profit.quantize(p)) if line_profit is not None else None,
            "rate_missing"       : selling_price is None,
            "stock_insufficient" : not stock_ok,
        })

    p = Decimal("0.0001")
    return {
        "items"        : preview_items,
        "subtotal"     : str(total_subtotal.quantize(p)),
        "total_cogs"   : str(total_cogs.quantize(p)),
        "gross_profit" : str((total_subtotal - total_cogs).quantize(p)),
        "warnings"     : {
            "missing_rate" : has_missing_rate,
            "missing_stock": has_missing_stock,
        },
        "note": "Preview only — no stock reserved, no prices committed. Confirm to finalise.",
    }


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
    product_name        = serializers.CharField(source="product.name", read_only=True)
    product_code        = serializers.CharField(source="product.code", read_only=True)
    returnable_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            "id", "product", "product_name", "product_code",
            "quantity", "returned_quantity", "returnable_quantity",
            # User-supplied per line
            "discount", "gst", "wht",
            # Computed at confirmation
            "selling_price", "effective_price", "cogs_per_unit",
            "line_gross", "line_gst_amount", "line_wht_amount",
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
    customer               = CustomerReadSerializer(read_only=True)
    items                  = InvoiceItemReadSerializer(many=True, read_only=True)
    created_by             = serializers.StringRelatedField(read_only=True)
    updated_by             = serializers.StringRelatedField(read_only=True)
    confirmed_by           = serializers.StringRelatedField(read_only=True)
    deleted_by             = serializers.StringRelatedField(read_only=True)
    draft_preview          = serializers.SerializerMethodField()
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "bill_number", "customer", "status",
            "subtotal", "gst_total", "wht_total", "grand_total",
            "total_cogs", "gross_profit",
            # payment summary inline on every invoice response
            "cash_received", "credit_outstanding", "total_paid",
            "remaining_amount", "payment_status", "payment_status_display",
            "draft_preview",
            "items",
            "confirmed_by", "confirmed_at",
            "created_by", "updated_by", "deleted_by",
            "created_at", "updated_at", "deleted_at",
        ]
        read_only_fields = fields

    def get_draft_preview(self, obj):
        return _build_draft_preview(obj)


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
    created_by     = serializers.StringRelatedField(read_only=True)
    method_display = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id", "invoice", "reference_number", "amount", "method", "method_display",
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

    def validate_method(self, value):
        valid = ["cash", "jazzcash", "easypaisa", "bank"]
        if value not in valid:
            raise serializers.ValidationError(
                f"Invalid method. Choose from: {', '.join(valid)}."
            )
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
    items               = ReturnItemReadSerializer(many=True, read_only=True)
    created_by          = serializers.StringRelatedField(read_only=True)
    accepted_by         = serializers.StringRelatedField(read_only=True)
    invoice_bill_number = serializers.CharField(source="invoice.bill_number", read_only=True)

    class Meta:
        model = Return
        fields = [
            "id", "invoice", "invoice_bill_number", "reference_number", "status",
            "total_return_amount", "total_return_cogs",
            "items", "note",
            "accepted_by", "accepted_at",
            "created_by", "created_at", "updated_at",
        ]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Payment summary serializers
# ---------------------------------------------------------------------------

class InvoicePaymentSummarySerializer(serializers.ModelSerializer):
    """
    Full payment breakdown for a single invoice.
    Shows what was paid in cash, what in credit, what remains.
    """
    customer_name       = serializers.CharField(source="customer.name", read_only=True)
    customer_code       = serializers.CharField(source="customer.code", read_only=True)
    payment_status_display = serializers.CharField(source="get_payment_status_display", read_only=True)
    payments            = PaymentReadSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id", "bill_number", "customer_name", "customer_code",
            "status", "subtotal",
            "cash_received", "credit_outstanding", "total_paid", "remaining_amount",
            "payment_status", "payment_status_display",
            "payments",
            "confirmed_at", "created_at",
        ]
        read_only_fields = fields


class CustomerOutstandingSerializer(serializers.Serializer):
    """Summary of what a customer owes across all their invoices."""
    customer_id          = serializers.IntegerField()
    total_billed         = serializers.DecimalField(max_digits=18, decimal_places=4)
    total_cash_received  = serializers.DecimalField(max_digits=18, decimal_places=4)
    total_credit_outstanding = serializers.DecimalField(max_digits=18, decimal_places=4)
    total_paid           = serializers.DecimalField(max_digits=18, decimal_places=4)
    total_remaining      = serializers.DecimalField(max_digits=18, decimal_places=4)


class CustomerWithOutstandingSerializer(serializers.ModelSerializer):
    """Used in the customer outstanding list — includes annotated outstanding field."""
    outstanding = serializers.DecimalField(max_digits=18, decimal_places=4, read_only=True)

    class Meta:
        model = Customer
        fields = ["id", "name", "code", "mobile", "address", "outstanding"]
        read_only_fields = fields


# ---------------------------------------------------------------------------
# Saved PDF serializers
# ---------------------------------------------------------------------------

class SavedInvoicePDFSerializer(serializers.ModelSerializer):
    saved_by   = serializers.StringRelatedField(read_only=True)
    deleted_by = serializers.StringRelatedField(read_only=True)
    file_url   = serializers.SerializerMethodField()

    class Meta:
        from .models import SavedInvoicePDF
        model  = SavedInvoicePDF
        fields = [
            "id", "invoice", "file_name", "file_url", "is_draft",
            "saved_by", "created_at", "deleted_by", "deleted_at", "is_deleted",
        ]
        read_only_fields = fields

    def get_file_url(self, obj):
        request = self.context.get("request")
        if request and obj.file_path:
            from django.conf import settings
            url = f"{settings.MEDIA_URL}{obj.file_path}"
            return request.build_absolute_uri(url)
        return None


class SavePDFRequestSerializer(serializers.Serializer):
    """
    Only confirmed invoices can be saved.
    Draft invoices can only be printed (use /print/?is_draft=true).
    """
    file_name = serializers.CharField(
        max_length=255, required=False,
        help_text="Custom file name. Defaults to bill number if not provided.",
    )

    def validate_file_name(self, value):
        return value.strip() if value else value