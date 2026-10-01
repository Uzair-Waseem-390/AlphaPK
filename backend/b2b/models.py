from django.conf import settings
from django.db import models
from django.utils import timezone


class PartnerRateAccess(models.Model):
    """
    One row per partner software that has asked to see this software's rate
    list. The partner_name is the caller's COMPANY_NAME, and only names that
    exist in B2B_PARTNER_SECRETS can ever create a row, so the table stays
    as small as the number of partner softwares.

    Rows are never deleted — a withdrawn share is status=REVOKED, which keeps
    the history and lets the partner request again.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        REVOKED = "revoked", "Sharing stopped"

    partner_name = models.CharField(max_length=255, unique=True)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True,
    )
    # Time of the latest (re-)request — the approval list is newest-first on this.
    requested_at = models.DateTimeField(default=timezone.now, db_index=True)
    status_changed_at = models.DateTimeField(default=timezone.now)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    class Meta:
        verbose_name = "Partner Rate Access"
        verbose_name_plural = "Partner Rate Accesses"
        ordering = ["-requested_at"]

    def __str__(self):
        return f"{self.partner_name} — {self.status}"


class PartnerRateAccessEvent(models.Model):
    """Audit trail: every status change of a PartnerRateAccess, newest last."""

    access = models.ForeignKey(
        PartnerRateAccess, on_delete=models.PROTECT, related_name="events",
    )
    from_status = models.CharField(max_length=10, blank=True)
    to_status = models.CharField(max_length=10)
    # Null when the partner itself triggered the change (a request / re-request).
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self):
        return f"{self.access.partner_name}: {self.from_status or '-'} -> {self.to_status}"
