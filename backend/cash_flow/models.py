from django.conf import settings
from django.db import models


# ---------------------------------------------------------------------------
# Expense Category
# ---------------------------------------------------------------------------

class ExpenseCategory(models.Model):
    name        = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, default="")
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="expense_categories_created",
    )
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name        = "Expense Category"
        verbose_name_plural = "Expense Categories"
        ordering            = ["name"]

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Expense
# ---------------------------------------------------------------------------

class Expense(models.Model):
    """
    Confirmed immediately on creation — no draft state.
    Amount auto-deducted from CashFlow.cash_in_hand on create.
    On edit: cash_in_hand adjusted by difference (old - new).
    On delete: cash_in_hand restored by current amount.
    Full audit trail via created_by/updated_by/deleted_by.
    """

    name         = models.CharField(max_length=255)
    category     = models.ForeignKey(
        ExpenseCategory, on_delete=models.PROTECT, related_name="expenses",
    )
    description  = models.TextField(blank=True, default="")
    amount       = models.DecimalField(max_digits=18, decimal_places=4)
    expense_date = models.DateField(db_index=True)

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="expenses_created",
    )
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="expenses_updated",
    )
    deleted_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="expenses_deleted",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    deleted_at  = models.DateTimeField(null=True, blank=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)

    objects     = models.Manager()

    class Meta:
        verbose_name        = "Expense"
        verbose_name_plural = "Expenses"
        ordering            = ["-expense_date", "-created_at"]

    def __str__(self):
        return f"{self.name} — {self.amount}"


# ---------------------------------------------------------------------------
# CashFlow  (singleton — one live record, auto-synced)
# ---------------------------------------------------------------------------

class CashFlow(models.Model):
    """
    Single live record representing the current state of business finances.
    Never created manually — managed exclusively via CashFlowService.
    Updated atomically on every transaction event.

    cash_in_hand:
        + invoice payments received (all methods)
        - expenses created
        - advance supplier payments (on draft PO creation)
        Adjusts on edits and deletes.

    customer_outstanding:
        + invoice confirmed (full grand_total)
        - invoice payment received
        - invoice return credit note

    supplier_payable_outstanding:
        + purchase order confirmed (full net_payable)
        - supplier payment made
        - purchase return credit note
        - advance amount (already paid on draft creation)

    total_lost_inventory_worth:
        + lost inventory record created (FIFO cost of the batch)
        Only ever increases — this is the GROSS all-time-lost figure.

    total_lost_inventory_recovered:
        + previously-lost product marked "found" again (mark_lost_inventory_found)
        Only ever increases too (it's a gross running total, same as every
        other field here) — it does NOT decrement total_lost_inventory_worth.
        The dashboard's displayed "Lost Inventory Worth" is the NET figure
        (total_lost_inventory_worth - total_lost_inventory_recovered),
        computed in get_cashflow_stats(), mirroring how supplier_payable_
        outstanding (net) already sits alongside total_paid_payables (gross).

    total_purchase_returns_value / total_purchase_returns_cogs /
    total_customer_returns_value / total_customer_returns_cogs:
        + purchase/customer return accepted
        No reversal path exists — these fields only ever increase.

    total_invoice_revenue / total_invoice_cogs / total_gross_profit:
        + invoice confirmed (grand_total / total_cogs / gross_profit at that moment)
        Returns do NOT reduce these — confirmed by tracing _recalculate_invoice_totals,
        which sums unreduced InvoiceItem fields regardless of returned_quantity.
        So confirm_invoice is the only place these are ever set — only ever increase.
    """

    # ---- Receivables (from customers) ----
    cash_in_hand             = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                   help_text="Actual cash available: invoice receipts - expenses - supplier payments.")
    customer_outstanding     = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                   help_text="Amount customers still owe us.")
    total_invoices_cash      = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                   help_text="Total cash ever collected from invoice payments (gross, never reduced).")

    # ---- Payables (to suppliers) ----
    total_paid_payables          = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                       help_text="Total cash ever paid to suppliers.")
    supplier_payable_outstanding = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                       help_text="Amount we still owe suppliers.")
    total_purchases_cash         = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                       help_text="Total purchase value: paid + outstanding.")

    # ---- Expenses ----
    total_expenses_amount = models.DecimalField(max_digits=20, decimal_places=4, default=0)

    # ---- Lost inventory ----
    total_lost_inventory_worth = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                     help_text="Total FIFO cost of all products ever marked lost (gross, only ever increases).")
    total_lost_inventory_recovered = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                     help_text="Total FIFO cost of lost products later marked found (gross, only ever increases). Dashboard shows worth minus this as the net figure.")

    # ---- Returns ----
    total_purchase_returns_value = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                        help_text="Total value of accepted returns to suppliers. Only ever increases.")
    total_purchase_returns_cogs  = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                        help_text="Total pre-tax cost portion (total_return_gross) of accepted returns to suppliers — mirrors total_customer_returns_cogs for dashboard symmetry. Only ever increases.")
    total_customer_returns_value = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                        help_text="Total value of accepted returns from customers. Only ever increases.")
    total_customer_returns_cogs  = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                        help_text="Total COGS reversed via accepted customer returns. Only ever increases.")

    # ---- Profit / margin ----
    total_invoice_revenue = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                help_text="Total grand_total across all confirmed invoices (invoiced amount, not cash received). Only ever increases.")
    total_invoice_cogs    = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                help_text="Total COGS across all confirmed invoices. Only ever increases.")
    total_gross_profit    = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                help_text="Total gross profit across all confirmed invoices. Only ever increases.")

    # ---- Last sync metadata ----
    last_updated_at = models.DateTimeField(auto_now=True)
    last_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="cashflow_updates",
    )

    class Meta:
        verbose_name        = "Cash Flow"
        verbose_name_plural = "Cash Flow"

    def __str__(self):
        return f"CashFlow — cash_in_hand: {self.cash_in_hand}"

    @classmethod
    def get_instance(cls):
        """Always returns the single CashFlow record, creating it if needed."""
        instance, _ = cls.objects.get_or_create(pk=1)
        return instance