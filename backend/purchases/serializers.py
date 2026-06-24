from rest_framework import serializers

from .models import Category, Inventory, Product, Purchase, Shelf, Supplier


# ---------------------------------------------------------------------------
# Audit field mixin — reused across all read serializers
# ---------------------------------------------------------------------------

class AuditReadMixin(serializers.Serializer):
    """
    Injects audit fields into any read serializer.
    Using a Serializer mixin (not ModelSerializer) keeps it generic.
    """
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


# ---------------------------------------------------------------------------
# Category
# ---------------------------------------------------------------------------

class CategoryReadSerializer(AuditReadMixin, serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "description", "created_by", "updated_by", "created_at", "updated_at"]


class CategoryWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["name", "description"]

    def validate_name(self, value):
        qs = Category.objects.filter(name__iexact=value.strip(), is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value.strip()


# ---------------------------------------------------------------------------
# Shelf
# ---------------------------------------------------------------------------

class ShelfReadSerializer(AuditReadMixin, serializers.ModelSerializer):
    class Meta:
        model = Shelf
        fields = ["id", "name", "description", "created_by", "updated_by", "created_at", "updated_at"]


class ShelfWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shelf
        fields = ["name", "description"]

    def validate_name(self, value):
        qs = Shelf.objects.filter(name__iexact=value.strip(), is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A shelf with this name already exists.")
        return value.strip()


# ---------------------------------------------------------------------------
# Supplier
# ---------------------------------------------------------------------------

class SupplierReadSerializer(AuditReadMixin, serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "name", "code", "created_by", "updated_by", "created_at", "updated_at"]


class SupplierWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["name", "code"]

    def validate_code(self, value):
        qs = Supplier.objects.filter(code__iexact=value.strip(), is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A supplier with this code already exists.")
        return value.strip().upper()

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Supplier name cannot be blank.")
        return value.strip()


# ---------------------------------------------------------------------------
# Product
# ---------------------------------------------------------------------------

class ProductReadSerializer(AuditReadMixin, serializers.ModelSerializer):
    category = CategoryReadSerializer(read_only=True)
    shelf = ShelfReadSerializer(read_only=True)

    class Meta:
        model = Product
        fields = ["id", "name", "code", "category", "shelf", "created_by", "updated_by", "created_at", "updated_at"]


class ProductWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ["name", "code", "category", "shelf"]

    def validate_code(self, value):
        qs = Product.objects.filter(code__iexact=value.strip(), is_deleted=False)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A product with this code already exists.")
        return value.strip().upper()

    def validate_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Product name cannot be blank.")
        return value.strip()

    def validate_category(self, value):
        if value.is_deleted:
            raise serializers.ValidationError("Selected category has been deleted.")
        return value

    def validate_shelf(self, value):
        if value.is_deleted:
            raise serializers.ValidationError("Selected shelf has been deleted.")
        return value


# ---------------------------------------------------------------------------
# Purchase
# ---------------------------------------------------------------------------

class PurchaseReadSerializer(AuditReadMixin, serializers.ModelSerializer):
    product = ProductReadSerializer(read_only=True)
    supplier = SupplierReadSerializer(read_only=True)
    deleted_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Purchase
        fields = [
            "id", "product", "supplier",
            "quantity", "unit_price", "gst", "wht",
            "gross_amount", "gst_amount", "wht_amount", "total_price",
            "created_by", "updated_by", "deleted_by",
            "created_at", "updated_at", "deleted_at",
        ]
        read_only_fields = fields


class PurchaseWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Purchase
        fields = ["product", "supplier", "quantity", "unit_price", "gst", "wht"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_price(self, value):
        if value <= 0:
            raise serializers.ValidationError("Unit price must be greater than zero.")
        return value

    def validate_gst(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("GST must be between 0 and 100.")
        return value

    def validate_wht(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("WHT must be between 0 and 100.")
        return value

    def validate_product(self, value):
        if value.is_deleted:
            raise serializers.ValidationError("Selected product has been deleted.")
        return value

    def validate_supplier(self, value):
        if value.is_deleted:
            raise serializers.ValidationError("Selected supplier has been deleted.")
        return value


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

class InventoryReadSerializer(serializers.ModelSerializer):
    product = ProductReadSerializer(read_only=True)
    last_updated_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Inventory
        fields = ["id", "product", "quantity", "last_updated_at", "last_updated_by"]
        read_only_fields = fields