from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView


class IsAdminOrSuperuser(BasePermission):
    """Same rule as every app's own permissions.py — kept local here since
    this view is project-level (backend/backend/), not owned by one app."""
    message = "Only admins or superusers can perform this action."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.is_staff
        )


class TriggerAllCatchUpsView(APIView):
    """
    GET /api/system/catch-up/

    Triggers every "catch-up on read" calculation in the project in one
    call, so their freshness never depends on which specific dashboard
    pages/hooks happen to be wired up. Returns only a small confirmation
    object — no dashboard data lives here on purpose.

    There are exactly three such mechanisms in the whole codebase (verified
    by two independent sweeps across every app — nothing else uses this
    pattern; every other Flow singleton is kept current at write time,
    event-driven, and needs no trigger):

        1. assets      — depreciation catch-up, one entry per active asset
        2. cash_management — investor growth catch-up, one entry per investor
        3. profits     — monthly profit finalization catch-up (global)

    Order matters: assets and investors run first because profits reads
    both of their outputs (asset depreciation for the deduction breakdown,
    investor current_worth for the ownership split) when finalizing a month.

    Each phase is isolated in its own try/except — one app's failure never
    blocks the other two (same defensive-import discipline already used for
    cross-app reads elsewhere in this project, e.g. cash_flow's breakdown
    functions).
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        assets_processed, assets_error = self._run_asset_catchup()
        investors_processed, investors_error = self._run_investor_catchup()
        months_finalized, profits_error = self._run_profits_catchup(user=request.user)

        return Response({
            "assets_processed": assets_processed,
            "assets_error": assets_error,
            "investors_processed": investors_processed,
            "investors_error": investors_error,
            "months_finalized": months_finalized,
            "profits_error": profits_error,
        })

    def _run_asset_catchup(self):
        """Reuses assets.selectors.get_asset_stats(), which already loops
        every active, non-disposed asset and catches up its depreciation —
        same call every Assets page read already makes."""
        try:
            from assets.models import Asset
            from assets.selectors import get_asset_stats

            get_asset_stats()
            count = Asset.objects.filter(is_deleted=False, is_disposed=False).count()
            return count, None
        except Exception as exc:
            return 0, str(exc)

    def _run_investor_catchup(self):
        """Reuses cash_management.selectors.get_cash_management_stats(),
        which already loops every non-deleted investor and catches up their
        growth — same call every Cash Management page read already makes."""
        try:
            from cash_management.models import Investor
            from cash_management.selectors import get_cash_management_stats

            get_cash_management_stats()
            count = Investor.objects.filter(is_deleted=False).count()
            return count, None
        except Exception as exc:
            return 0, str(exc)

    def _run_profits_catchup(self, *, user):
        """Runs last — depends on assets/investors already being current."""
        try:
            from profits.models import ProfitFlow
            from profits.services import catch_up_monthly_profits

            before = ProfitFlow.get_instance().months_finalized_count
            catch_up_monthly_profits(user=user)
            after = ProfitFlow.get_instance().months_finalized_count
            return after - before, None
        except Exception as exc:
            return 0, str(exc)
