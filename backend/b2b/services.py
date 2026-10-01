from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from .models import PartnerRateAccess, PartnerRateAccessEvent

Status = PartnerRateAccess.Status

# A partner may ask again after being rejected or after sharing was stopped.
# Pending / approved requests are left untouched (the call is a no-op).
_REQUESTABLE_AGAIN = {Status.REJECTED, Status.REVOKED}

# action -> (statuses it may start from, status it leads to)
_TRANSITIONS = {
    "approve": ({Status.PENDING, Status.REJECTED}, Status.APPROVED),
    "reject": ({Status.PENDING}, Status.REJECTED),
    "revoke": ({Status.APPROVED}, Status.REVOKED),
}


def _move(access: PartnerRateAccess, to_status, actor, *, requested: bool = False) -> None:
    now = timezone.now()
    from_status = access.status
    access.status = to_status
    access.status_changed_at = now
    access.decided_by = actor
    update_fields = ["status", "status_changed_at", "decided_by"]
    if requested:
        access.requested_at = now
        update_fields.append("requested_at")
    access.save(update_fields=update_fields)
    PartnerRateAccessEvent.objects.create(
        access=access, from_status=from_status, to_status=to_status, actor=actor,
    )


def request_access(*, partner_name: str) -> PartnerRateAccess:
    """
    Partner asks for (or re-asks for) rate-list access. Idempotent: calling
    it while pending/approved changes nothing. The common no-op case is a
    plain read (no transaction, no row lock); only a first request or a
    re-request takes the locked path below.
    """
    existing = PartnerRateAccess.objects.filter(partner_name=partner_name).first()
    if existing is not None and existing.status not in _REQUESTABLE_AGAIN:
        return existing
    return _create_or_reopen(partner_name)


@transaction.atomic
def _create_or_reopen(partner_name: str) -> PartnerRateAccess:
    # get_or_create resolves the simultaneous-first-request race on the unique
    # partner_name itself, and select_for_update serializes concurrent
    # transitions of one row.
    access, created = PartnerRateAccess.objects.select_for_update().get_or_create(
        partner_name=partner_name,
    )
    if created:
        PartnerRateAccessEvent.objects.create(
            access=access, from_status="", to_status=Status.PENDING, actor=None,
        )
    elif access.status in _REQUESTABLE_AGAIN:
        _move(access, Status.PENDING, None, requested=True)
    return access


@transaction.atomic
def decide_access(*, access_id: int, action: str, user) -> PartnerRateAccess:
    """Admin approves / ignores (rejects) a request, or stops an approved share."""
    allowed_from, to_status = _TRANSITIONS[action]
    try:
        access = PartnerRateAccess.objects.select_for_update().get(pk=access_id)
    except PartnerRateAccess.DoesNotExist:
        raise NotFound("Request not found.")
    if access.status not in allowed_from:
        raise ValidationError({
            "status": f"Cannot {action} a request that is {access.get_status_display().lower()}."
        })
    _move(access, to_status, user)
    return access
