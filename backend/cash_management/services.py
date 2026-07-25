from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import CashAdjustment, CashManagementFlow, Investor, InvestorTransaction, OwnerTransaction


# ---------------------------------------------------------------------------
# Internal atomic CashManagementFlow adjuster — NEVER call from outside this module
# ---------------------------------------------------------------------------

def _adjust_cash_management_flow(
    *,
    total_cash_lost_delta               : Decimal = Decimal("0"),
    total_cash_recovered_delta          : Decimal = Decimal("0"),
    total_investor_capital_delta        : Decimal = Decimal("0"),
    total_investor_withdrawn_delta      : Decimal = Decimal("0"),
    total_owner_contributions_delta     : Decimal = Decimal("0"),
    total_owner_drawings_delta          : Decimal = Decimal("0"),
    total_owner_withdrawals_count_delta : int = 0,
    user,
) -> CashManagementFlow:
    """
    Atomically adjusts the CashManagementFlow singleton by the given deltas,
    then recalculates and SAVES the derived fields (net_cash_lost,
    net_investor_capital, net_owner_capital) so nothing downstream ever has
    to sum rows at request time. Positive delta = increase. Negative delta =
    decrease. This is the ONLY function that writes to CashManagementFlow.
    """
    with transaction.atomic():
        cmf = CashManagementFlow.objects.select_for_update().get_or_create(pk=1)[0]

        cmf.total_cash_lost = max(
            Decimal("0"), cmf.total_cash_lost + total_cash_lost_delta
        )
        cmf.total_cash_recovered = max(
            Decimal("0"), cmf.total_cash_recovered + total_cash_recovered_delta
        )
        cmf.total_investor_capital = max(
            Decimal("0"), cmf.total_investor_capital + total_investor_capital_delta
        )
        cmf.total_investor_withdrawn = max(
            Decimal("0"), cmf.total_investor_withdrawn + total_investor_withdrawn_delta
        )
        cmf.total_owner_contributions = max(
            Decimal("0"), cmf.total_owner_contributions + total_owner_contributions_delta
        )
        cmf.total_owner_drawings = max(
            Decimal("0"), cmf.total_owner_drawings + total_owner_drawings_delta
        )
        cmf.total_owner_withdrawals_count = max(
            0, cmf.total_owner_withdrawals_count + total_owner_withdrawals_count_delta
        )

        # Derived fields — recomputed and stored on every sync, not on read.
        cmf.net_cash_lost = max(
            Decimal("0"), cmf.total_cash_lost - cmf.total_cash_recovered
        )
        cmf.net_investor_capital = cmf.total_investor_capital - cmf.total_investor_withdrawn
        # NOT floored — a sole owner can draw out more than they've deposited.
        cmf.net_owner_capital = cmf.total_owner_contributions - cmf.total_owner_drawings

        cmf.last_updated_by = user
        cmf.save()
        return cmf


# ---------------------------------------------------------------------------
# CashAdjustment services (lost/found cash)
# ---------------------------------------------------------------------------

@transaction.atomic
def create_cash_adjustment(
    *, amount: Decimal, adjustment_type: str, adjustment_date, reason: str = "", user,
) -> CashAdjustment:
    """
    Records a lost or found cash adjustment. Lost deducts from
    CashFlow.cash_in_hand, found adds to it. Independent entries — a found
    entry is never linked to or capped by a specific prior lost entry.
    """
    from rest_framework.exceptions import ValidationError

    if amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    if adjustment_type not in (CashAdjustment.AdjustmentType.LOST, CashAdjustment.AdjustmentType.FOUND):
        raise ValidationError({"adjustment_type": "Must be 'lost' or 'found'."})

    adjustment = CashAdjustment.objects.create(
        amount=amount,
        adjustment_type=adjustment_type,
        adjustment_date=adjustment_date,
        reason=reason,
        created_by=user,
        updated_by=user,
    )

    from cash_flow.services import sync_cash_found, sync_cash_lost

    if adjustment_type == CashAdjustment.AdjustmentType.LOST:
        _adjust_cash_management_flow(total_cash_lost_delta=+amount, user=user)
        sync_cash_lost(amount=amount, user=user)
    else:
        _adjust_cash_management_flow(total_cash_recovered_delta=+amount, user=user)
        sync_cash_found(amount=amount, user=user)

    return adjustment


@transaction.atomic
def delete_cash_adjustment(*, pk: int, user) -> None:
    """Soft-deletes a cash adjustment and reverses its cash_in_hand effect."""
    from django.shortcuts import get_object_or_404

    adjustment = get_object_or_404(CashAdjustment, pk=pk, is_deleted=False)
    amount     = adjustment.amount

    adjustment.is_deleted = True
    adjustment.deleted_at = timezone.now()
    adjustment.deleted_by = user
    adjustment.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])

    from cash_flow.services import sync_cash_found, sync_cash_lost

    if adjustment.adjustment_type == CashAdjustment.AdjustmentType.LOST:
        _adjust_cash_management_flow(total_cash_lost_delta=-amount, user=user)
        sync_cash_found(amount=amount, user=user)  # reverse: restore cash_in_hand
    else:
        _adjust_cash_management_flow(total_cash_recovered_delta=-amount, user=user)
        sync_cash_lost(amount=amount, user=user)  # reverse: remove cash_in_hand again


# ---------------------------------------------------------------------------
# Investor services
# ---------------------------------------------------------------------------

def create_investor(
    *, name: str, contact_number: str = "", email: str = "", note: str = "", user,
) -> Investor:
    from rest_framework.exceptions import ValidationError

    if not name.strip():
        raise ValidationError({"name": "Investor name cannot be blank."})

    return Investor.objects.create(
        name=name.strip(),
        contact_number=contact_number,
        email=email,
        note=note,
        created_by=user,
        updated_by=user,
    )


def update_investor(
    *, pk: int, name: str = None, contact_number: str = None,
    email: str = None, note: str = None, user,
) -> Investor:
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    investor = get_object_or_404(Investor, pk=pk, is_deleted=False)

    if name is not None:
        if not name.strip():
            raise ValidationError({"name": "Investor name cannot be blank."})
        investor.name = name.strip()
    if contact_number is not None:
        investor.contact_number = contact_number
    if email is not None:
        investor.email = email
    if note is not None:
        investor.note = note

    investor.updated_by = user
    investor.save(update_fields=["name", "contact_number", "email", "note", "updated_by", "updated_at"])
    return investor


def delete_investor(*, pk: int, user) -> None:
    """
    Soft-deletes an investor. Blocked if they have any non-deleted
    transactions — deleting the investor would orphan real financial
    history; delete/reverse the transactions first if that's truly intended.
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    investor = get_object_or_404(Investor, pk=pk, is_deleted=False)

    if investor.transactions.filter(is_deleted=False).exists():
        raise ValidationError({
            "detail": "Cannot delete an investor with recorded transactions. Delete their transactions first."
        })

    investor.is_deleted = True
    investor.deleted_at = timezone.now()
    investor.deleted_by = user
    investor.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


# ---------------------------------------------------------------------------
# InvestorTransaction services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_investor_transaction(
    *, investor_id: int, transaction_type: str, amount: Decimal,
    transaction_date, note: str = "", user,
) -> InvestorTransaction:
    """
    Records an investment or withdrawal for an investor. Investment adds to
    CashFlow.cash_in_hand and the investor's net_stake; withdrawal deducts
    from both. A withdrawal is rejected if it would exceed the investor's
    current net_stake.
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    if amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    if transaction_type not in (InvestorTransaction.TransactionType.INVESTMENT, InvestorTransaction.TransactionType.WITHDRAWAL):
        raise ValidationError({"transaction_type": "Must be 'investment' or 'withdrawal'."})

    investor = get_object_or_404(Investor.objects.select_for_update(), pk=investor_id, is_deleted=False)

    if transaction_type == InvestorTransaction.TransactionType.WITHDRAWAL and amount > investor.net_stake:
        raise ValidationError({
            "amount": (
                f"Cannot withdraw {amount} — {investor.name} only has "
                f"{investor.net_stake} currently invested."
            )
        })

    txn = InvestorTransaction.objects.create(
        investor=investor,
        transaction_type=transaction_type,
        amount=amount,
        transaction_date=transaction_date,
        note=note,
        created_by=user,
        updated_by=user,
    )

    from cash_flow.services import sync_investor_investment, sync_investor_withdrawal

    if transaction_type == InvestorTransaction.TransactionType.INVESTMENT:
        investor.total_invested += amount
        investor.net_stake      += amount
        investor.save(update_fields=["total_invested", "net_stake"])
        _adjust_cash_management_flow(total_investor_capital_delta=+amount, user=user)
        sync_investor_investment(amount=amount, user=user)
    else:
        investor.total_withdrawn += amount
        investor.net_stake       -= amount
        investor.save(update_fields=["total_withdrawn", "net_stake"])
        _adjust_cash_management_flow(total_investor_withdrawn_delta=+amount, user=user)
        sync_investor_withdrawal(amount=amount, user=user)

    return txn


@transaction.atomic
def delete_investor_transaction(*, pk: int, user) -> None:
    """
    Soft-deletes an investor transaction and reverses its effects on the
    investor's balance, CashManagementFlow, and cash_in_hand. Deleting an
    investment is rejected if it would push the investor's net_stake
    negative (i.e. a later withdrawal already relied on this investment).
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    txn = get_object_or_404(InvestorTransaction, pk=pk, is_deleted=False)
    investor = get_object_or_404(Investor.objects.select_for_update(), pk=txn.investor_id)
    amount = txn.amount

    from cash_flow.services import sync_investor_investment, sync_investor_withdrawal

    if txn.transaction_type == InvestorTransaction.TransactionType.INVESTMENT:
        if investor.net_stake - amount < 0:
            raise ValidationError({
                "detail": (
                    f"Cannot delete this investment — {investor.name}'s net stake would go "
                    f"negative (a later withdrawal already relies on this money)."
                )
            })
        investor.total_invested -= amount
        investor.net_stake      -= amount
        investor.save(update_fields=["total_invested", "net_stake"])
        _adjust_cash_management_flow(total_investor_capital_delta=-amount, user=user)
        sync_investor_withdrawal(amount=amount, user=user)  # reverse: remove cash_in_hand again
    else:
        investor.total_withdrawn -= amount
        investor.net_stake       += amount
        investor.save(update_fields=["total_withdrawn", "net_stake"])
        _adjust_cash_management_flow(total_investor_withdrawn_delta=-amount, user=user)
        sync_investor_investment(amount=amount, user=user)  # reverse: restore cash_in_hand

    txn.is_deleted = True
    txn.deleted_at = timezone.now()
    txn.deleted_by = user
    txn.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


# ---------------------------------------------------------------------------
# OwnerTransaction services (owner drawings/contributions)
# ---------------------------------------------------------------------------

@transaction.atomic
def create_owner_transaction(
    *, transaction_type: str, amount: Decimal, transaction_date, note: str = "", user,
) -> OwnerTransaction:
    """
    Records an owner contribution or drawing. Contribution adds to
    CashFlow.cash_in_hand, drawing deducts from it. Unlike investor
    withdrawals, a drawing is NOT capped by net_owner_capital — the owner
    can draw more than they've contributed.
    """
    from rest_framework.exceptions import ValidationError

    if amount <= 0:
        raise ValidationError({"amount": "Amount must be greater than zero."})
    if transaction_type not in (OwnerTransaction.TransactionType.CONTRIBUTION, OwnerTransaction.TransactionType.DRAWING):
        raise ValidationError({"transaction_type": "Must be 'contribution' or 'drawing'."})

    txn = OwnerTransaction.objects.create(
        transaction_type=transaction_type,
        amount=amount,
        transaction_date=transaction_date,
        note=note,
        created_by=user,
        updated_by=user,
    )

    from cash_flow.services import sync_owner_contribution, sync_owner_drawing

    if transaction_type == OwnerTransaction.TransactionType.CONTRIBUTION:
        _adjust_cash_management_flow(total_owner_contributions_delta=+amount, user=user)
        sync_owner_contribution(amount=amount, user=user)
    else:
        _adjust_cash_management_flow(
            total_owner_drawings_delta=+amount,
            total_owner_withdrawals_count_delta=+1,
            user=user,
        )
        sync_owner_drawing(amount=amount, user=user)

    return txn


@transaction.atomic
def delete_owner_transaction(*, pk: int, user) -> None:
    """Soft-deletes an owner transaction and reverses its effects."""
    from django.shortcuts import get_object_or_404

    txn = get_object_or_404(OwnerTransaction, pk=pk, is_deleted=False)
    amount = txn.amount

    from cash_flow.services import sync_owner_contribution, sync_owner_drawing

    if txn.transaction_type == OwnerTransaction.TransactionType.CONTRIBUTION:
        _adjust_cash_management_flow(total_owner_contributions_delta=-amount, user=user)
        sync_owner_drawing(amount=amount, user=user)  # reverse: remove cash_in_hand again
    else:
        _adjust_cash_management_flow(
            total_owner_drawings_delta=-amount,
            total_owner_withdrawals_count_delta=-1,
            user=user,
        )
        sync_owner_contribution(amount=amount, user=user)  # reverse: restore cash_in_hand

    txn.is_deleted = True
    txn.deleted_at = timezone.now()
    txn.deleted_by = user
    txn.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])
