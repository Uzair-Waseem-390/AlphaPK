from django.conf import settings
from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Shared soft-delete infrastructure (mirrors purchases.models pattern)
# ---------------------------------------------------------------------------

class SoftDeleteManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class AllObjectsManager(models.Manager):
    def get_queryset(self):
        return super().get_queryset()


class AuditMixin(models.Model):
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="%(class)s_created",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="%(class)s_updated",
    )
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
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
# Customer
# ---------------------------------------------------------------------------

class Customer(AuditMixin):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=100, unique=True)
    address = models.TextField()
    mobile = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        verbose_name = "Customer"
        verbose_name_plural = "Customers"
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.code})"


# ---------------------------------------------------------------------------
# Invoice (Bill)
# ---------------------------------------------------------------------------

class Invoice(AuditMixin):

    class Status(models.TextChoices):
        DRAFT     = "draft",     "Draft"
        CONFIRMED = "confirmed", "Confirmed"
        RETURNED  = "returned",  "Returned"       # fully returned
        PARTIAL   = "partial",   "Partially Returned"

    # Auto-generated bill number: BILL-2026-0001
    bill_number = models.CharField(max_length=30, unique=True, editable=False)
    customer    = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="invoices",
    )
    status      = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True,
    )
    confirmed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="confirmed_invoices",
    )
    confirmed_at = models.DateTimeField(null=True, blank=True)

    # Totals — computed and stored on confirmation
    subtotal      = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    total_cogs    = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    gross_profit  = models.DecimalField(max_digits=18, decimal_places=4, default=0)

    class Meta:
        verbose_name = "Invoice"
        verbose_name_plural = "Invoices"
        ordering = ["-created_at"]

    def __str__(self):
        return self.bill_number


# ---------------------------------------------------------------------------
# Invoice Line Item
# ---------------------------------------------------------------------------

class InvoiceItem(models.Model):
    """
    One row per product per invoice.
    Selling price is snapshotted from rate list at confirmation time.
    COGS (blended FIFO cost) is snapshotted at confirmation time.
    Both are immutable after confirmation.
    """

    invoice       = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    product       = models.ForeignKey(
        "purchases.Product", on_delete=models.PROTECT, related_name="invoice_items",
    )
    quantity      = models.PositiveIntegerField()

    # Snapshotted at confirmation — never change after that
    selling_price = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    cogs_per_unit = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    line_total    = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    line_cogs     = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    line_profit   = models.DecimalField(max_digits=18, decimal_places=4, default=0)

    # Tracks how much of this line has been returned
    returned_quantity = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Invoice Item"
        verbose_name_plural = "Invoice Items"
        unique_together = [("invoice", "product")]   # one line per product per bill

    def __str__(self):
        return f"{self.invoice.bill_number} — {self.product.name}"

    @property
    def returnable_quantity(self):
        return self.quantity - self.returned_quantity


# ---------------------------------------------------------------------------
# FIFO Ledger — tracks which purchase batches were consumed per invoice item
# ---------------------------------------------------------------------------

class FIFOLedger(models.Model):
    """
    Append-only record of which purchase batch supplied which invoice item.
    Created at confirmation time. Never edited or deleted.
    On return: a reverse entry is created (quantity negative) and
    remaining_quantity is restored on the purchase batch.
    """

    invoice_item = models.ForeignKey(
        InvoiceItem, on_delete=models.PROTECT, related_name="fifo_layers",
    )
    purchase     = models.ForeignKey(
        "purchases.Purchase", on_delete=models.PROTECT, related_name="fifo_consumed",
    )
    quantity     = models.IntegerField(
        help_text="Positive = consumed. Negative = returned."
    )
    unit_cost    = models.DecimalField(max_digits=14, decimal_places=4)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "FIFO Ledger"
        verbose_name_plural = "FIFO Ledger Entries"
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.invoice_item} ← Purchase#{self.purchase_id} × {self.quantity}"


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

class Payment(AuditMixin):

    class Method(models.TextChoices):
        CASH   = "cash",   "Cash"
        CREDIT = "credit", "Credit"

    invoice      = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    amount       = models.DecimalField(max_digits=18, decimal_places=4)
    method       = models.CharField(max_length=10, choices=Method.choices)
    payment_date = models.DateField()
    note         = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        verbose_name = "Payment"
        verbose_name_plural = "Payments"
        ordering = ["-payment_date"]

    def __str__(self):
        return f"{self.invoice.bill_number} — {self.method} {self.amount}"


# ---------------------------------------------------------------------------
# Return
# ---------------------------------------------------------------------------

class Return(AuditMixin):
    """
    One return record per return event (whole bill or partial).
    Accepted only by admin/superuser.
    On acceptance: inventory incremented, FIFO ledger reversed, payment adjusted.
    """

    class Status(models.TextChoices):
        PENDING  = "pending",  "Pending"
        ACCEPTED = "accepted", "Accepted"

    invoice     = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="returns")
    status      = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True,
    )
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="accepted_returns",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    note        = models.CharField(max_length=255, blank=True, default="")

    # Totals — computed on acceptance
    total_return_amount = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    total_return_cogs   = models.DecimalField(max_digits=18, decimal_places=4, default=0)

    class Meta:
        verbose_name = "Return"
        verbose_name_plural = "Returns"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Return for {self.invoice.bill_number}"


# ---------------------------------------------------------------------------
# Return Item
# ---------------------------------------------------------------------------

class ReturnItem(models.Model):
    """
    One row per product being returned in a Return event.
    """

    return_record = models.ForeignKey(Return, on_delete=models.CASCADE, related_name="items")
    invoice_item  = models.ForeignKey(InvoiceItem, on_delete=models.PROTECT, related_name="return_items")
    quantity      = models.PositiveIntegerField()

    # Snapshotted from original invoice item at acceptance
    selling_price = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    cogs_per_unit = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    line_total    = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    line_cogs     = models.DecimalField(max_digits=18, decimal_places=4, default=0)

    class Meta:
        verbose_name = "Return Item"
        verbose_name_plural = "Return Items"
        unique_together = [("return_record", "invoice_item")]

    def __str__(self):
        return f"{self.return_record} — {self.invoice_item.product.name} × {self.quantity}"