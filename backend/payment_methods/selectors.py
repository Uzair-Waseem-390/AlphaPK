from django.shortcuts import get_object_or_404

from .models import PaymentAllocation, PaymentMethod


def get_all_payment_methods(*, search: str = None):
    qs = PaymentMethod.objects.all()
    if search:
        qs = qs.filter(name__icontains=search.strip())
    return qs


def get_payment_method_by_id(pk: int) -> PaymentMethod:
    return get_object_or_404(PaymentMethod, pk=pk, is_deleted=False)


def get_payment_method_allocations(*, payment_method_id: int):
    """Read-only transaction history for one method — every active
    PaymentAllocation row that method has ever been part of, newest first."""
    return PaymentAllocation.objects.filter(
        payment_method_id=payment_method_id, is_deleted=False,
    ).order_by("-date", "-created_at")
