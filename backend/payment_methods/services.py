from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import PaymentAllocation, PaymentMethod

# ---------------------------------------------------------------------------
# Phase 1 scope only: create/edit/soft-delete PaymentMethod rows themselves.
# No balance-moving logic here — that's the Phase 2 allocation engine
# (record_allocations/reverse_allocations/refresh_allocations) and the
# Phase 6 transfer service.
# ---------------------------------------------------------------------------


def create_method(*, name: str, account_number: str = "", user) -> PaymentMethod:
    name = name.strip()
    if not name:
        raise ValidationError({"name": "Method name cannot be blank."})
    if PaymentMethod.objects.filter(name__iexact=name).exists():
        raise ValidationError({"name": f"A method named '{name}' already exists."})

    return PaymentMethod.objects.create(
        name=name,
        account_number=account_number,
        created_by=user,
        updated_by=user,
    )


def update_method(
    *, pk: int, name: str = None, account_number: str = None, user,
) -> PaymentMethod:
    method = get_object_or_404(PaymentMethod, pk=pk, is_deleted=False)

    if method.is_protected:
        raise ValidationError({"detail": f"'{method.name}' is a protected method and cannot be edited."})

    if name is not None:
        name = name.strip()
        if not name:
            raise ValidationError({"name": "Method name cannot be blank."})
        if PaymentMethod.objects.filter(name__iexact=name).exclude(pk=method.pk).exists():
            raise ValidationError({"name": f"A method named '{name}' already exists."})
        method.name = name

    if account_number is not None:
        method.account_number = account_number

    method.updated_by = user
    method.save(update_fields=["name", "account_number", "updated_by", "updated_at"])
    return method


def soft_delete_method(*, pk: int, user) -> None:
    method = get_object_or_404(PaymentMethod, pk=pk, is_deleted=False)

    if method.is_protected:
        raise ValidationError({"detail": f"'{method.name}' is a protected method and cannot be deleted."})
    if method.balance != 0:
        raise ValidationError({
            "detail": (
                f"Cannot delete '{method.name}' — it still holds a balance of "
                f"{method.balance}. Move or clear the balance first."
            )
        })

    method.is_deleted = True
    method.deleted_at = timezone.now()
    method.deleted_by = user
    method.save(update_fields=["is_deleted", "deleted_at", "deleted_by"])


# ---------------------------------------------------------------------------
# Allocation engine — the ONLY functions allowed to write PaymentAllocation
# rows or adjust PaymentMethod.balance. Mirrors cash_flow.services'
# _adjust_cashflow + record_cash_movement/refresh_cash_movement/
# reverse_cash_movement pattern: `source` is the model instance that caused
# the transaction, (source_model, source_id) derived the same way.
# ---------------------------------------------------------------------------

def _source_label(source) -> str:
    return f"{source._meta.app_label}.{source._meta.model_name}"


def _lock_methods(method_ids):
    """select_for_update, always sorted by pk — every caller locks methods
    in the same order, so two concurrent multi-method transactions can
    never deadlock on each other. Returns {pk: locked PaymentMethod}."""
    locked = PaymentMethod.objects.select_for_update().filter(
        pk__in=method_ids,
    ).order_by("pk")
    return {m.pk: m for m in locked}


@transaction.atomic
def record_allocations(
    source, *, direction: str, splits, total_amount: Decimal, date, user,
) -> list:
    """
    Records how a single inflow/outflow was split across one or more
    payment methods. `splits` is [(payment_method, amount), ...] — resolved
    PaymentMethod instances, not raw ids. Validates the split before
    writing anything; an outflow that would take any method negative is
    rejected in full, with every short method named, not just the first.
    """
    if total_amount is None or total_amount <= 0:
        raise ValidationError({"total_amount": "Total amount must be greater than zero."})
    if not splits:
        raise ValidationError({"splits": "At least one method must be selected."})
    if direction not in (PaymentAllocation.Direction.INFLOW, PaymentAllocation.Direction.OUTFLOW):
        raise ValidationError({"direction": "Must be 'inflow' or 'outflow'."})

    method_ids = [m.pk for m, _ in splits]
    if len(set(method_ids)) != len(method_ids):
        raise ValidationError({"splits": "The same method cannot be selected more than once."})

    for _, amount in splits:
        if amount is None or amount <= 0:
            raise ValidationError({"splits": "Every method's amount must be greater than zero."})

    split_total = sum(amount for _, amount in splits)
    if split_total != total_amount:
        raise ValidationError({
            "splits": f"Split amounts total {split_total}, which doesn't match the transaction amount {total_amount}."
        })

    locked = _lock_methods(method_ids)

    if direction == PaymentAllocation.Direction.OUTFLOW:
        shortfalls = [
            f"{locked[m.pk].name} only has {locked[m.pk].balance}, this outflow needs {amount} from it."
            for m, amount in splits
            if amount > locked[m.pk].balance
        ]
        if shortfalls:
            raise ValidationError({"splits": shortfalls})

    created = []
    for method, amount in splits:
        locked_method = locked[method.pk]
        if direction == PaymentAllocation.Direction.INFLOW:
            locked_method.balance += amount
        else:
            locked_method.balance -= amount
        locked_method.save(update_fields=["balance"])

        created.append(PaymentAllocation.objects.create(
            payment_method=locked_method,
            source_model=_source_label(source),
            source_id=source.pk,
            direction=direction,
            amount=amount,
            date=date,
        ))

    return created


@transaction.atomic
def reverse_allocations(source) -> None:
    """
    Soft-deletes every active allocation for this source and undoes its
    balance effect. No balance-floor check here — reversing a past inflow
    is allowed to take a method negative (the money was already spent
    elsewhere before the entry got deleted; that's honest information, the
    same "don't clamp, don't hide" reasoning cash_flow._adjust_cashflow
    already applies to cash_in_hand). No-op if nothing to reverse.
    """
    allocations = list(PaymentAllocation.objects.filter(
        source_model=_source_label(source), source_id=source.pk, is_deleted=False,
    ))
    if not allocations:
        return

    locked = _lock_methods(sorted({a.payment_method_id for a in allocations}))

    for allocation in allocations:
        method = locked[allocation.payment_method_id]
        if allocation.direction == PaymentAllocation.Direction.INFLOW:
            method.balance -= allocation.amount
        else:
            method.balance += allocation.amount

    for method in locked.values():
        method.save(update_fields=["balance"])

    PaymentAllocation.objects.filter(
        pk__in=[a.pk for a in allocations],
    ).update(is_deleted=True)


@transaction.atomic
def refresh_allocations(
    source, *, direction: str, splits, total_amount: Decimal, date, user,
) -> list:
    """
    For edits that change how a transaction was split (e.g. an advance
    capped at confirmation). Reverses the old split first so the new
    split's balance check runs fairly against money that's already back.
    """
    reverse_allocations(source)
    return record_allocations(
        source, direction=direction, splits=splits, total_amount=total_amount,
        date=date, user=user,
    )
