from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import PaymentMethod

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
