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


def get_allocations_for_source(source):
    """Every active PaymentAllocation row for one transaction (a Payment,
    SupplierPayment, ...) — the real split, for read serializers to show
    alongside the derived legacy `method` label."""
    from .services import _source_label
    return PaymentAllocation.objects.filter(
        source_model=_source_label(source), source_id=source.pk, is_deleted=False,
    ).select_related("payment_method").order_by("id")
