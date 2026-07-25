from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404

from .models import CashAdjustment, CashManagementFlow, Investor, InvestorTransaction


def _clean(value):
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


# ---------------------------------------------------------------------------
# CashManagementFlow stats
# ---------------------------------------------------------------------------

def get_cash_management_stats() -> dict:
    """
    Returns the store's current cash-reconciliation and investor-capital
    position, straight off the CashManagementFlow singleton — zero
    aggregation queries, same O(1) pattern as cash_flow.get_cashflow_stats().
    """
    cmf = CashManagementFlow.get_instance()
    return {
        "total_cash_lost"          : cmf.total_cash_lost,
        "total_cash_recovered"     : cmf.total_cash_recovered,
        "net_cash_lost"            : cmf.net_cash_lost,
        "total_investor_capital"   : cmf.total_investor_capital,
        "total_investor_withdrawn" : cmf.total_investor_withdrawn,
        "net_investor_capital"     : cmf.net_investor_capital,
    }


# ---------------------------------------------------------------------------
# CashAdjustment
# ---------------------------------------------------------------------------

def get_all_cash_adjustments(
    *,
    adjustment_type : str = None,
    search          : str = None,
    date_from       : str = None,
    date_to         : str = None,
    min_amount      : str = None,
    max_amount      : str = None,
) -> QuerySet:
    """Returns all non-deleted cash adjustments with full filter support."""
    qs = CashAdjustment.objects.filter(is_deleted=False).select_related(
        "created_by", "updated_by",
    )

    if _clean(adjustment_type):
        qs = qs.filter(adjustment_type=_clean(adjustment_type))
    if _clean(search):
        qs = qs.filter(Q(reason__icontains=_clean(search)))
    if _clean(date_from):
        qs = qs.filter(adjustment_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(adjustment_date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(amount__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(amount__lte=_clean(max_amount))

    return qs.order_by("-adjustment_date", "-created_at")


def get_cash_adjustment_by_id(pk: int) -> CashAdjustment:
    return get_object_or_404(CashAdjustment, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# Investor
# ---------------------------------------------------------------------------

def get_all_investors(*, search: str = None) -> QuerySet:
    """Returns all non-deleted investors, optionally filtered by name/email/phone."""
    qs = Investor.objects.filter(is_deleted=False)

    if _clean(search):
        s = _clean(search)
        qs = qs.filter(
            Q(name__icontains=s) | Q(email__icontains=s) | Q(contact_number__icontains=s)
        )

    return qs.order_by("name")


def get_investor_by_id(pk: int) -> Investor:
    return get_object_or_404(Investor, pk=pk, is_deleted=False)


# ---------------------------------------------------------------------------
# InvestorTransaction
# ---------------------------------------------------------------------------

def get_all_investor_transactions(
    *,
    investor_id      : str = None,
    transaction_type : str = None,
    search           : str = None,
    date_from        : str = None,
    date_to          : str = None,
    min_amount       : str = None,
    max_amount       : str = None,
) -> QuerySet:
    """Returns all non-deleted investor transactions with full filter support."""
    qs = InvestorTransaction.objects.filter(is_deleted=False).select_related(
        "investor", "created_by", "updated_by",
    )

    if _clean(investor_id):
        qs = qs.filter(investor_id=_clean(investor_id))
    if _clean(transaction_type):
        qs = qs.filter(transaction_type=_clean(transaction_type))
    if _clean(search):
        qs = qs.filter(Q(note__icontains=_clean(search)) | Q(investor__name__icontains=_clean(search)))
    if _clean(date_from):
        qs = qs.filter(transaction_date__gte=_clean(date_from))
    if _clean(date_to):
        qs = qs.filter(transaction_date__lte=_clean(date_to))
    if _clean(min_amount):
        qs = qs.filter(amount__gte=_clean(min_amount))
    if _clean(max_amount):
        qs = qs.filter(amount__lte=_clean(max_amount))

    return qs.order_by("-transaction_date", "-created_at")


def get_investor_transaction_by_id(pk: int) -> InvestorTransaction:
    return get_object_or_404(InvestorTransaction, pk=pk, is_deleted=False)
