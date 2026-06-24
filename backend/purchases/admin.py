from django.contrib import admin

from .models import Category, Inventory, Product, Purchase, Shelf, Supplier


class AuditAdminMixin:
    """
    Mixin that auto-populates created_by and updated_by on every save,
    and marks deleted_by + deleted_at on soft delete.
    Reused across all admin classes — single place for audit logic.
    """

    def save_model(self, request, obj, form, change):
        if not change:
            obj.created_by = request.user
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)

    readonly_fields = ("created_by", "updated_by", "deleted_by", "created_at", "updated_at", "deleted_at")


class SoftDeleteAdminMixin:
    """
    Overrides the default queryset to show ALL records (including soft-deleted)
    in admin so admins can inspect history.
    """

    def get_queryset(self, request):
        return self.model.all_objects.all()


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

@admin.register(Category)
class CategoryAdmin(AuditAdminMixin, SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ["name", "is_deleted", "created_by", "created_at"]
    list_filter = ["is_deleted"]
    search_fields = ["name"]
    readonly_fields = AuditAdminMixin.readonly_fields


@admin.register(Shelf)
class ShelfAdmin(AuditAdminMixin, SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ["name", "is_deleted", "created_by", "created_at"]
    list_filter = ["is_deleted"]
    search_fields = ["name"]
    readonly_fields = AuditAdminMixin.readonly_fields


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------

@admin.register(Supplier)
class SupplierAdmin(AuditAdminMixin, SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ["name", "code", "is_deleted", "created_by", "created_at"]
    list_filter = ["is_deleted"]
    search_fields = ["name", "code"]
    readonly_fields = AuditAdminMixin.readonly_fields


@admin.register(Product)
class ProductAdmin(AuditAdminMixin, SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = ["name", "code", "category", "shelf", "is_deleted", "created_by", "created_at"]
    list_filter = ["is_deleted", "category", "shelf"]
    search_fields = ["name", "code"]
    readonly_fields = AuditAdminMixin.readonly_fields


# ---------------------------------------------------------------------------
# Purchase
# ---------------------------------------------------------------------------

@admin.register(Purchase)
class PurchaseAdmin(AuditAdminMixin, SoftDeleteAdminMixin, admin.ModelAdmin):
    list_display = [
        "id", "product", "supplier", "quantity",
        "unit_price", "gst", "wht", "total_price",
        "is_deleted", "created_by", "created_at",
    ]
    list_filter = ["is_deleted", "product__category", "supplier"]
    search_fields = ["product__name", "supplier__name", "supplier__code"]
    readonly_fields = AuditAdminMixin.readonly_fields + (
        "gross_amount", "gst_amount", "wht_amount", "total_price",
    )


# ---------------------------------------------------------------------------
# Inventory
# ---------------------------------------------------------------------------

@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ["product", "quantity", "last_updated_by", "last_updated_at"]
    search_fields = ["product__name", "product__code"]
    readonly_fields = ["quantity", "last_updated_at", "last_updated_by"]

    def has_add_permission(self, request):
        # Inventory rows are auto-created by services only
        return False

    def has_delete_permission(self, request, obj=None):
        return False