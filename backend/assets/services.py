from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone

from .models import Asset, AssetCategory, AssetDisposal, AssetFlow, AssetValuationEntry


def _add_months(year: int, month: int, delta: int) -> tuple:
    """Month-only arithmetic, no external date libraries needed. Mirrors
    cash_flow.selectors._add_months exactly."""
    total = (year * 12 + (month - 1)) + delta
    return total // 12, (total % 12) + 1


# ---------------------------------------------------------------------------
# Internal atomic AssetFlow adjuster — NEVER call from outside this module
# ---------------------------------------------------------------------------

def _adjust_asset_flow(
    *,
    total_asset_cost_delta               : Decimal = Decimal("0"),
    total_current_worth_delta            : Decimal = Decimal("0"),
    total_accumulated_depreciation_delta : Decimal = Decimal("0"),
    total_disposed_count_delta           : int = 0,
    total_gain_on_disposal_delta         : Decimal = Decimal("0"),
    total_loss_on_disposal_delta         : Decimal = Decimal("0"),
    user,
) -> AssetFlow:
    """
    Atomically adjusts the AssetFlow singleton by the given deltas.
    Positive delta = increase. Negative delta = decrease (e.g. disposal
    removing an asset's cost/worth from the totals). This is the ONLY
    function that writes to AssetFlow.
    """
    with transaction.atomic():
        af = AssetFlow.objects.select_for_update().get_or_create(pk=1)[0]

        af.total_asset_cost = max(
            Decimal("0"), af.total_asset_cost + total_asset_cost_delta
        )
        af.total_current_worth = max(
            Decimal("0"), af.total_current_worth + total_current_worth_delta
        )
        af.total_accumulated_depreciation = max(
            Decimal("0"), af.total_accumulated_depreciation + total_accumulated_depreciation_delta
        )
        af.total_disposed_count = max(
            0, af.total_disposed_count + total_disposed_count_delta
        )
        af.total_gain_on_disposal = max(
            Decimal("0"), af.total_gain_on_disposal + total_gain_on_disposal_delta
        )
        af.total_loss_on_disposal = max(
            Decimal("0"), af.total_loss_on_disposal + total_loss_on_disposal_delta
        )

        af.last_updated_by = user
        af.save()
        return af


# ---------------------------------------------------------------------------
# Catch-up depreciation — the core "no cron" mechanism
# ---------------------------------------------------------------------------

def _catch_up_asset_depreciation(asset: Asset, user=None) -> None:
    """
    Posts any AssetValuationEntry rows that should already exist for this
    asset, up to and including the current month, using reducing-balance
    depreciation. Called from every read path (asset detail, asset list,
    stats) as well as right after creating an 'existing' asset (to back-fill
    its full history) — this is what replaces a scheduled job: the "tick"
    happens whenever anyone actually looks, not on a timer.

    No-op for revaluation/none-method categories, disposed assets, or a
    zero/unset rate.
    """
    if asset.is_disposed:
        return
    if asset.category.valuation_method != AssetCategory.ValuationMethod.DEPRECIATION:
        return

    rate = asset.category.depreciation_rate
    if rate <= 0:
        return

    today = timezone.localdate()
    current_month_start = date(today.year, today.month, 1)

    last_entry = AssetValuationEntry.objects.filter(
        asset=asset, entry_type=AssetValuationEntry.EntryType.DEPRECIATION,
    ).order_by("-period").first()

    if last_entry:
        ly, lm = (int(p) for p in last_entry.period.split("-"))
        ny, nm = _add_months(ly, lm, 1)
    else:
        # First-ever entry starts the month AFTER acquisition — the
        # acquisition month itself isn't a completed period of ownership.
        ny, nm = _add_months(asset.acquisition_date.year, asset.acquisition_date.month, 1)

    next_date = date(ny, nm, 1)
    precision = Decimal("0.0001")

    while next_date <= current_month_start:
        months_since_acquisition = (
            (next_date.year - asset.acquisition_date.year) * 12
            + (next_date.month - asset.acquisition_date.month)
        )
        asset_year_index = (months_since_acquisition - 1) // 12  # 0-indexed 12-month block
        book_value_start_of_year = asset.cost * (Decimal("1") - rate) ** asset_year_index
        annual_depreciation = book_value_start_of_year * rate
        monthly_depreciation = (annual_depreciation / Decimal("12")).quantize(
            precision, rounding=ROUND_HALF_UP
        )

        worth_before = asset.current_worth
        worth_after = worth_before - monthly_depreciation
        period_str = f"{next_date.year:04d}-{next_date.month:02d}"

        AssetValuationEntry.objects.create(
            asset=asset,
            entry_type=AssetValuationEntry.EntryType.DEPRECIATION,
            period=period_str,
            rate_applied=rate,
            worth_before=worth_before,
            worth_after=worth_after,
            amount=-monthly_depreciation,
            note="Auto-posted monthly depreciation (catch-up)",
            created_by=user,
        )

        asset.current_worth = worth_after
        asset.save(update_fields=["current_worth"])

        _adjust_asset_flow(
            total_current_worth_delta=-monthly_depreciation,
            total_accumulated_depreciation_delta=+monthly_depreciation,
            user=user,
        )

        ny2, nm2 = _add_months(next_date.year, next_date.month, 1)
        next_date = date(ny2, nm2, 1)


# ---------------------------------------------------------------------------
# AssetCategory services
# ---------------------------------------------------------------------------

def create_asset_category(
    *, name: str, valuation_method: str, depreciation_rate: Decimal = Decimal("0"), user,
) -> AssetCategory:
    from rest_framework.exceptions import ValidationError

    if not name.strip():
        raise ValidationError({"name": "Category name cannot be blank."})
    if AssetCategory.objects.filter(name__iexact=name.strip()).exists():
        raise ValidationError({"name": "An asset category with this name already exists."})
    if valuation_method not in AssetCategory.ValuationMethod.values:
        raise ValidationError({"valuation_method": "Must be 'depreciation', 'revaluation', or 'none'."})
    if valuation_method == AssetCategory.ValuationMethod.DEPRECIATION and depreciation_rate <= 0:
        raise ValidationError({"depreciation_rate": "Depreciation rate must be greater than zero for a depreciation-method category."})

    return AssetCategory.objects.create(
        name=name.strip(),
        valuation_method=valuation_method,
        depreciation_rate=depreciation_rate if valuation_method == AssetCategory.ValuationMethod.DEPRECIATION else Decimal("0"),
        created_by=user,
    )


def update_asset_category(
    *, pk: int, name: str = None, depreciation_rate: Decimal = None, user,
) -> AssetCategory:
    """
    Deliberately has NO valuation_method parameter — it is permanently
    locked at creation. depreciation_rate is editable, but only affects
    AssetValuationEntry rows posted after this change (see
    _catch_up_asset_depreciation, which snapshots rate_applied per entry).
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    category = get_object_or_404(AssetCategory, pk=pk)

    if name is not None:
        if not name.strip():
            raise ValidationError({"name": "Category name cannot be blank."})
        category.name = name.strip()

    if depreciation_rate is not None:
        if category.valuation_method != AssetCategory.ValuationMethod.DEPRECIATION:
            raise ValidationError({"depreciation_rate": "Only depreciation-method categories have a rate."})
        if depreciation_rate <= 0:
            raise ValidationError({"depreciation_rate": "Depreciation rate must be greater than zero."})
        category.depreciation_rate = depreciation_rate

    category.save(update_fields=["name", "depreciation_rate", "updated_at"])
    return category


# ---------------------------------------------------------------------------
# Asset services
# ---------------------------------------------------------------------------

@transaction.atomic
def create_asset(
    *, name: str, category_id: int, acquisition_type: str, cost: Decimal,
    acquisition_date, note: str = "", user,
) -> Asset:
    """
    existing: no cash movement; catch-up immediately back-fills every
              historical AssetValuationEntry from acquisition_date to today.
    new     : cash_in_hand decreases by cost (real cash left the business);
              catch-up runs too but finds nothing to post yet.
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    if cost <= 0:
        raise ValidationError({"cost": "Cost must be greater than zero."})
    if acquisition_type not in Asset.AcquisitionType.values:
        raise ValidationError({"acquisition_type": "Must be 'existing' or 'new'."})

    category = get_object_or_404(AssetCategory, pk=category_id)

    asset = Asset.objects.create(
        name=name,
        category=category,
        acquisition_type=acquisition_type,
        cost=cost,
        acquisition_date=acquisition_date,
        current_worth=cost,
        note=note,
        created_by=user,
        updated_by=user,
    )

    _adjust_asset_flow(
        total_asset_cost_delta=+cost,
        total_current_worth_delta=+cost,
        user=user,
    )

    if acquisition_type == Asset.AcquisitionType.NEW:
        from cash_flow.services import record_cash_movement, sync_asset_purchased
        sync_asset_purchased(amount=cost, user=user)
        record_cash_movement(asset)

    _catch_up_asset_depreciation(asset, user=user)

    return asset


@transaction.atomic
def revalue_asset(
    *, asset_id: int, new_worth: Decimal, revaluation_date, note: str = "", user,
) -> AssetValuationEntry:
    """Manual revaluation — only for revaluation-method categories (e.g. Land)."""
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    if new_worth < 0:
        raise ValidationError({"new_worth": "New worth cannot be negative."})

    asset = get_object_or_404(
        Asset.objects.select_for_update().select_related("category"),
        pk=asset_id, is_deleted=False, is_disposed=False,
    )

    if asset.category.valuation_method != AssetCategory.ValuationMethod.REVALUATION:
        raise ValidationError({
            "detail": f"'{asset.category.name}' is not a revaluation-method category — only revaluation-method assets can be revalued."
        })

    worth_before = asset.current_worth
    amount = new_worth - worth_before
    period = f"{revaluation_date.year:04d}-{revaluation_date.month:02d}"

    entry = AssetValuationEntry.objects.create(
        asset=asset,
        entry_type=AssetValuationEntry.EntryType.REVALUATION,
        period=period,
        rate_applied=None,
        worth_before=worth_before,
        worth_after=new_worth,
        amount=amount,
        note=note,
        created_by=user,
    )

    asset.current_worth = new_worth
    asset.updated_by = user
    asset.save(update_fields=["current_worth", "updated_by", "updated_at"])

    _adjust_asset_flow(total_current_worth_delta=amount, user=user)

    return entry


@transaction.atomic
def dispose_asset(
    *, asset_id: int, disposal_type: str, disposal_date, sale_amount: Decimal = None,
    reason: str = "", user,
) -> AssetDisposal:
    """
    scrapped: no cash movement, just an audit record. worth/cost removed
              from AssetFlow totals.
    sold    : cash_in_hand increases by sale_amount; gain_loss computed
              against worth_at_disposal (after running catch-up, so the
              comparison uses an up-to-date book value).
    """
    from django.shortcuts import get_object_or_404
    from rest_framework.exceptions import ValidationError

    if disposal_type not in AssetDisposal.DisposalType.values:
        raise ValidationError({"disposal_type": "Must be 'scrapped' or 'sold'."})
    if disposal_type == AssetDisposal.DisposalType.SOLD and (not sale_amount or sale_amount <= 0):
        raise ValidationError({"sale_amount": "Sale amount is required and must be greater than zero when selling an asset."})

    asset = get_object_or_404(
        Asset.objects.select_for_update().select_related("category"),
        pk=asset_id, is_deleted=False, is_disposed=False,
    )

    _catch_up_asset_depreciation(asset, user=user)

    worth_at_disposal = asset.current_worth
    is_depreciable = asset.category.valuation_method == AssetCategory.ValuationMethod.DEPRECIATION
    accumulated_depreciation_for_asset = (asset.cost - asset.current_worth) if is_depreciable else Decimal("0")

    disposal = AssetDisposal.objects.create(
        asset=asset,
        disposal_type=disposal_type,
        disposal_date=disposal_date,
        sale_amount=sale_amount if disposal_type == AssetDisposal.DisposalType.SOLD else None,
        worth_at_disposal=worth_at_disposal,
        reason=reason,
        created_by=user,
    )

    flow_kwargs = dict(
        total_asset_cost_delta=-asset.cost,
        total_current_worth_delta=-asset.current_worth,
        total_accumulated_depreciation_delta=-accumulated_depreciation_for_asset,
        total_disposed_count_delta=+1,
        user=user,
    )

    if disposal_type == AssetDisposal.DisposalType.SOLD:
        gain_loss = sale_amount - worth_at_disposal
        disposal.gain_loss = gain_loss
        disposal.save(update_fields=["gain_loss"])

        if gain_loss >= 0:
            flow_kwargs["total_gain_on_disposal_delta"] = gain_loss
        else:
            flow_kwargs["total_loss_on_disposal_delta"] = -gain_loss

        from cash_flow.services import record_cash_movement, sync_asset_sold
        sync_asset_sold(amount=sale_amount, user=user)
        record_cash_movement(disposal)

    _adjust_asset_flow(**flow_kwargs)

    asset.is_disposed = True
    asset.updated_by = user
    asset.save(update_fields=["is_disposed", "updated_by", "updated_at"])

    return disposal
