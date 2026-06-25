from django.conf import settings
from django.db import models

from .utils import calculate_total_price


class SoftDeleteManager(models.Manager):
    """Returns only non-deleted records by default."""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class AllObjectsManager(models.Manager):
    """Returns all records including soft-deleted ones (for admin/audit use)."""

    def get_queryset(self):
        return super().get_queryset()


class AuditMixin(models.Model):
    """
    Abstract mixin — adds full audit trail + soft delete to any model.
    Every create/update/delete records who did it and when.
    """

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="%(class)s_updated",
    )
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="%(class)s_deleted",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    objects = SoftDeleteManager()
    all_objects = AllObjectsManager()

    class Meta:
        abstract = True


# ---------------------------------------------------------------------------
# Lookup tables
# ---------------------------------------------------------------------------

class Category(AuditMixin):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Category"
        verbose_name_plural = "Categories"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Shelf(AuditMixin):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Shelf"
        verbose_name_plural = "Shelves"
        ordering = ["name"]

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Core entities
# ---------------------------------------------------------------------------

class Supplier(AuditMixin):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)

    class Meta:
        verbose_name = "Supplier"
        verbose_name_plural = "Suppliers"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


class Product(AuditMixin):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name="products",
    )
    shelf = models.ForeignKey(
        Shelf,
        on_delete=models.PROTECT,
        related_name="products",
    )

    class Meta:
        verbose_name = "Product"
        verbose_name_plural = "Products"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


# ---------------------------------------------------------------------------
# Purchase
# ---------------------------------------------------------------------------

class Purchase(AuditMixin):
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchases",
    )
    quantity = models.PositiveIntegerField()
    remaining_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Units still available in inventory for FIFO consumption.",
    )
    unit_price = models.DecimalField(max_digits=14, decimal_places=4)
    gst = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="GST percentage e.g. 18.5 means 18.5%",
    )
    wht = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="WHT percentage e.g. 1.5 means 1.5%",
    )
    # Auto-calculated breakdown — stored for reporting, never entered by user
    gross_amount = models.DecimalField(max_digits=18, decimal_places=4, editable=False)
    gst_amount = models.DecimalField(max_digits=18, decimal_places=4, editable=False)
    wht_amount = models.DecimalField(max_digits=18, decimal_places=4, editable=False)
    total_price = models.DecimalField(max_digits=18, decimal_places=4, editable=False)

    class Meta:
        verbose_name = "Purchase"
        verbose_name_plural = "Purchases"
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        result = calculate_total_price(
            quantity=self.quantity,
            unit_price=self.unit_price,
            gst=self.gst,
            wht=self.wht,
        )
        self.gross_amount = result["gross_amount"]
        self.gst_amount = result["gst_amount"]
        self.wht_amount = result["wht_amount"]
        self.total_price = result["total_price"]

        # On first save only, remaining = quantity
        if not self.pk:
            self.remaining_quantity = self.quantity

        super().save(*args, **kwargs)

    def __str__(self):
        return f"Purchase #{self.pk} — {self.product.name}"


# ---------------------------------------------------------------------------
# Inventory (auto-managed aggregate — never written to directly by views)
# ---------------------------------------------------------------------------

class Inventory(models.Model):
    """
    One row per product. Quantity is the running total driven entirely
    by purchase services. No soft delete — inventory is a live aggregate.
    The audit trail lives in the purchases that drove each change.
    """

    product = models.OneToOneField(
        Product,
        on_delete=models.PROTECT,
        related_name="inventory",
    )
    quantity = models.PositiveIntegerField(default=0)
    last_updated_at = models.DateTimeField(auto_now=True)
    last_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="inventory_updates",
    )

    class Meta:
        verbose_name = "Inventory"
        verbose_name_plural = "Inventories"
        ordering = ["product__name"]

    def __str__(self):
        return f"{self.product.name} — qty: {self.quantity}"