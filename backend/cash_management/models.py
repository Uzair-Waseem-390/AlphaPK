from django.conf import settings
from django.db import models


# ---------------------------------------------------------------------------
# CashAdjustment  (ledger — lost/found cash reconciliation, mirrors taxes.TaxPayment)
# ---------------------------------------------------------------------------

class CashAdjustment(models.Model):
    """
    A physical cash discrepancy — lost (theft, miscount, misplaced) or found
    (recovered, surprise cash discovered during counting). Confirmed
    immediately on creation — no draft state. Lost deducts from
    CashFlow.cash_in_hand, found adds to it. Full audit trail via
    created_by/updated_by/deleted_by.

    Lost and found entries are independent — a found entry is never linked
    to or capped by a specific prior lost entry (matches how cash counting
    actually works: you often can't tie a recovery to a specific loss).
    """

    class AdjustmentType(models.TextChoices):
        LOST  = "lost", "Lost"
        FOUND = "found", "Found"

    amount          = models.DecimalField(max_digits=18, decimal_places=4)
    adjustment_type = models.CharField(max_length=10, choices=AdjustmentType.choices)
    adjustment_date = models.DateField(db_index=True)
    reason          = models.TextField(blank=True, default="")

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="cash_adjustments_created",
    )
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="cash_adjustments_updated",
    )
    deleted_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="cash_adjustments_deleted",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    deleted_at  = models.DateTimeField(null=True, blank=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)

    objects     = models.Manager()

    class Meta:
        verbose_name        = "Cash Adjustment"
        verbose_name_plural  = "Cash Adjustments"
        ordering             = ["-adjustment_date", "-created_at"]

    def __str__(self):
        return f"{self.get_adjustment_type_display()} — {self.amount} on {self.adjustment_date}"


# ---------------------------------------------------------------------------
# Investor  (one row per investor — stored running totals, O(1) reads)
# ---------------------------------------------------------------------------

class Investor(models.Model):
    """
    One row per investor. total_invested/total_withdrawn/net_stake are
    stored fields, recalculated and saved by InvestorTransaction services on
    every investment/withdrawal — never computed at read time.

    net_stake is what this investor currently has invested in the business
    (total_invested - total_withdrawn). Reserved for future profit-sharing
    calculations once "actual" (net, not just gross) profit is tracked — see
    cash_management/README.md.
    """

    name           = models.CharField(max_length=255)
    contact_number = models.CharField(max_length=50, blank=True, default="")
    email          = models.EmailField(blank=True, default="")
    note           = models.TextField(blank=True, default="")

    total_invested  = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                           help_text="Total ever invested by this investor (gross, only ever increases).")
    total_withdrawn = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                           help_text="Total ever withdrawn by this investor (gross, only ever increases).")
    net_stake       = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                           help_text="total_invested - total_withdrawn. What this investor currently has in the business.")

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="investors_created",
    )
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="investors_updated",
    )
    deleted_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="investors_deleted",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    deleted_at  = models.DateTimeField(null=True, blank=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)

    objects     = models.Manager()

    class Meta:
        verbose_name        = "Investor"
        verbose_name_plural  = "Investors"
        ordering             = ["name"]

    def __str__(self):
        return f"{self.name} (stake: {self.net_stake})"


# ---------------------------------------------------------------------------
# InvestorTransaction  (ledger — mirrors taxes.TaxPayment)
# ---------------------------------------------------------------------------

class InvestorTransaction(models.Model):
    """
    One investment or withdrawal event for an investor. Confirmed
    immediately on creation — no draft state. Investment adds to
    CashFlow.cash_in_hand, withdrawal deducts from it. A withdrawal is
    rejected if it would exceed the investor's current net_stake.
    """

    class TransactionType(models.TextChoices):
        INVESTMENT = "investment", "Investment"
        WITHDRAWAL = "withdrawal", "Withdrawal"

    investor         = models.ForeignKey(Investor, on_delete=models.PROTECT, related_name="transactions")
    transaction_type = models.CharField(max_length=12, choices=TransactionType.choices)
    amount           = models.DecimalField(max_digits=18, decimal_places=4)
    transaction_date = models.DateField(db_index=True)
    note             = models.TextField(blank=True, default="")

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="investor_transactions_created",
    )
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="investor_transactions_updated",
    )
    deleted_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="investor_transactions_deleted",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    deleted_at  = models.DateTimeField(null=True, blank=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)

    objects     = models.Manager()

    class Meta:
        verbose_name        = "Investor Transaction"
        verbose_name_plural  = "Investor Transactions"
        ordering             = ["-transaction_date", "-created_at"]

    def __str__(self):
        return f"{self.get_transaction_type_display()} — {self.amount} ({self.investor.name})"


# ---------------------------------------------------------------------------
# OwnerTransaction  (ledger — owner drawings/contributions, mirrors InvestorTransaction)
# ---------------------------------------------------------------------------

class OwnerTransaction(models.Model):
    """
    One contribution or drawing event for the business owner. Distinct from
    Investor/InvestorTransaction (external investor equity) and from
    CashAdjustment (unexplained physical cash discrepancies) — this is the
    owner deliberately putting personal money in, or deliberately taking
    money out for personal use. Confirmed immediately on creation — no draft
    state. Contribution adds to CashFlow.cash_in_hand, drawing deducts from
    it.

    Unlike InvestorTransaction, a drawing is NOT capped by net_owner_capital
    — a sole owner can draw out more than they've contributed (financed by
    the business's profits), same as any real owner's drawing account. It's
    normal for net_owner_capital to go negative.

    Only one implicit "owner" for now (no separate Owner model, unlike
    Investor) — this store has a single owner. If that ever changes,
    this would need to grow an Owner FK the same way InvestorTransaction has one.
    """

    class TransactionType(models.TextChoices):
        CONTRIBUTION = "contribution", "Contribution"
        DRAWING      = "drawing", "Drawing"

    transaction_type = models.CharField(max_length=12, choices=TransactionType.choices)
    amount           = models.DecimalField(max_digits=18, decimal_places=4)
    transaction_date = models.DateField(db_index=True)
    note             = models.TextField(blank=True, default="")

    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="owner_transactions_created",
    )
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="owner_transactions_updated",
    )
    deleted_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="owner_transactions_deleted",
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)
    deleted_at  = models.DateTimeField(null=True, blank=True)
    is_deleted  = models.BooleanField(default=False, db_index=True)

    objects     = models.Manager()

    class Meta:
        verbose_name        = "Owner Transaction"
        verbose_name_plural  = "Owner Transactions"
        ordering             = ["-transaction_date", "-created_at"]

    def __str__(self):
        return f"{self.get_transaction_type_display()} — {self.amount} on {self.transaction_date}"


# ---------------------------------------------------------------------------
# CashManagementFlow  (singleton — mirrors cash_flow.CashFlow / taxes.TaxFlow)
# ---------------------------------------------------------------------------

class CashManagementFlow(models.Model):
    """
    Single live record — O(1) dashboard reads. Never created manually —
    managed exclusively via cash_management.services. Updated atomically
    whenever a CashAdjustment or InvestorTransaction is created/deleted.

    net_cash_lost / net_investor_capital are stored fields, recalculated and
    SAVED (not just computed on read) on every sync — same discipline as
    taxes.TaxFlow.net_sales_tax_payable.
    """

    total_cash_lost      = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                help_text="Total cash ever recorded as lost, all-time (gross, only ever increases).")
    total_cash_recovered = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                help_text="Total cash ever recorded as found/recovered, all-time (gross, only ever increases).")
    net_cash_lost         = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                help_text="total_cash_lost - total_cash_recovered, floored at 0. Stored, recalculated on every sync.")

    total_investor_capital   = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                   help_text="Total ever invested by all investors, all-time (gross, only ever increases).")
    total_investor_withdrawn = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                   help_text="Total ever withdrawn by all investors, all-time (gross, only ever increases).")
    net_investor_capital     = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                   help_text="total_investor_capital - total_investor_withdrawn. Current total equity capital in the business. Stored, recalculated on every sync.")

    total_owner_contributions   = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                       help_text="Total cash the owner has deposited into the business, all-time (gross, only ever increases).")
    total_owner_drawings        = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                       help_text="Total cash the owner has withdrawn for personal use, all-time (gross, only ever increases).")
    total_owner_contributions_count = models.PositiveIntegerField(default=0,
                                       help_text="Count of owner contribution transactions, all-time (only ever increases).")
    total_owner_withdrawals_count = models.PositiveIntegerField(default=0,
                                       help_text="Count of owner drawing transactions, all-time (only ever increases).")
    net_owner_capital            = models.DecimalField(max_digits=20, decimal_places=4, default=0,
                                       help_text="total_owner_contributions - total_owner_drawings. NOT floored at 0 — "
                                                  "a sole owner can draw out more than they've deposited, financed by "
                                                  "the business's profits, same as any real owner's drawing account.")

    last_updated_at = models.DateTimeField(auto_now=True)
    last_updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
        related_name="cash_management_flow_updates",
    )

    class Meta:
        verbose_name        = "Cash Management Flow"
        verbose_name_plural  = "Cash Management Flow"

    def __str__(self):
        return f"CashManagementFlow — net_cash_lost: {self.net_cash_lost}, net_investor_capital: {self.net_investor_capital}"

    @classmethod
    def get_instance(cls):
        """Always returns the single CashManagementFlow record, creating it if needed."""
        instance, _ = cls.objects.get_or_create(pk=1)
        return instance
