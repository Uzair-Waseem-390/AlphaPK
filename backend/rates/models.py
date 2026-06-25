from django.conf import settings
from django.db import models


class ProductRate(models.Model):
    """
    One row per product — always holds the current active selling price.
    Never deleted. Updated in-place whenever the price changes.
    Every update is logged to ProductRateHistory automatically via service.
    """

    product = models.OneToOneField(
        "purchases.Product",
        on_delete=models.PROTECT,
        related_name="rate",
    )
    selling_price = models.DecimalField(max_digits=14, decimal_places=4)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="rate_updates",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="rate_creates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Product Rate"
        verbose_name_plural = "Product Rates"
        ordering = ["product__name"]

    def __str__(self):
        return f"{self.product.name} — {self.selling_price}"


class ProductRateHistory(models.Model):
    """
    Append-only audit log. A new row is inserted on every price change.
    Never updated or deleted — pure historical record.
    Billing uses this to snapshot the price at the time of invoice creation.
    """

    product = models.ForeignKey(
        "purchases.Product",
        on_delete=models.PROTECT,
        related_name="rate_history",
    )
    selling_price = models.DecimalField(max_digits=14, decimal_places=4)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="rate_history_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)
    note = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Optional reason for price change.",
    )

    class Meta:
        verbose_name = "Product Rate History"
        verbose_name_plural = "Product Rate Histories"
        ordering = ["-changed_at"]
        indexes = [
            # Speeds up billing lookup: "price of product X on date Y"
            models.Index(fields=["product", "-changed_at"], name="idx_rate_history_product_date"),
        ]

    def __str__(self):
        return f"{self.product.name} — {self.selling_price} @ {self.changed_at:%Y-%m-%d %H:%M}"