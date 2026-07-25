from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404

from .models import Asset, AssetCategory, AssetDisposal, AssetFlow, AssetValuationEntry
from .services import _catch_up_asset_depreciation


def _clean(value):
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


# ---------------------------------------------------------------------------
# AssetCategory
# ---------------------------------------------------------------------------

def get_all_asset_categories(*, search: str = None) -> QuerySet:
    qs = AssetCategory.objects.all()
    if _clean(search):
        qs = qs.filter(name__icontains=_clean(search))
    return qs.order_by("name")


def get_asset_category_by_id(pk: int) -> AssetCategory:
    return get_object_or_404(AssetCategory, pk=pk)


# ---------------------------------------------------------------------------
# Asset — every read path runs catch-up first, so results are always current
# without any background job (see assets.services._catch_up_asset_depreciation).
# ---------------------------------------------------------------------------

def get_all_assets(
    *,
    category_id      : str = None,
    acquisition_type : str = None,
    is_disposed      : str = None,
    search           : str = None,
) -> QuerySet:
    qs = Asset.objects.filter(is_deleted=False).select_related("category")

    if _clean(category_id):
        qs = qs.filter(category_id=_clean(category_id))
    if _clean(acquisition_type):
        qs = qs.filter(acquisition_type=_clean(acquisition_type))
    if is_disposed is not None and _clean(is_disposed) is not None:
        qs = qs.filter(is_disposed=_clean(is_disposed).lower() == "true")
    if _clean(search):
        qs = qs.filter(Q(name__icontains=_clean(search)))

    qs = qs.order_by("-acquisition_date", "-created_at")

    for asset in qs:
        _catch_up_asset_depreciation(asset)

    return qs


def get_asset_by_id(pk: int) -> Asset:
    asset = get_object_or_404(Asset.objects.select_related("category"), pk=pk, is_deleted=False)
    _catch_up_asset_depreciation(asset)
    asset.refresh_from_db()
    return asset


# ---------------------------------------------------------------------------
# AssetValuationEntry — read-only history
# ---------------------------------------------------------------------------

def get_asset_valuation_entries(
    *, asset_id: str = None, entry_type: str = None,
) -> QuerySet:
    qs = AssetValuationEntry.objects.select_related("asset", "created_by")

    if _clean(asset_id):
        qs = qs.filter(asset_id=_clean(asset_id))
    if _clean(entry_type):
        qs = qs.filter(entry_type=_clean(entry_type))

    return qs.order_by("-period", "-created_at")


# ---------------------------------------------------------------------------
# AssetDisposal
# ---------------------------------------------------------------------------

def get_all_asset_disposals(*, disposal_type: str = None, category_id: str = None) -> QuerySet:
    qs = AssetDisposal.objects.select_related("asset", "asset__category", "created_by")
    if _clean(disposal_type):
        qs = qs.filter(disposal_type=_clean(disposal_type))
    if _clean(category_id):
        qs = qs.filter(asset__category_id=_clean(category_id))
    return qs.order_by("-disposal_date", "-created_at")


# ---------------------------------------------------------------------------
# AssetFlow stats
# ---------------------------------------------------------------------------

def get_asset_stats() -> dict:
    """
    Runs catch-up for every active asset (cheap at real-world scale — a
    store has dozens of fixed assets, not thousands), then reads the
    AssetFlow singleton — O(1) after catch-up, always current, no cron.
    """
    for asset in Asset.objects.filter(is_deleted=False, is_disposed=False).select_related("category"):
        _catch_up_asset_depreciation(asset)

    af = AssetFlow.get_instance()
    return {
        "total_asset_cost"               : af.total_asset_cost,
        "total_current_worth"            : af.total_current_worth,
        "total_accumulated_depreciation" : af.total_accumulated_depreciation,
        "total_disposed_count"           : af.total_disposed_count,
        "total_gain_on_disposal"         : af.total_gain_on_disposal,
        "total_loss_on_disposal"         : af.total_loss_on_disposal,
    }
