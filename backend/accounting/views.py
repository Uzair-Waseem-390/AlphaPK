from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_ap_aging_rows,
    get_ap_aging_summary,
    get_ar_aging_rows,
    get_ar_aging_summary,
    get_balance_sheet_for_period,
    get_balance_sheet_live,
    get_cash_flow_statement,
    get_fixed_asset_register_rows,
    get_fixed_asset_register_summary,
    get_income_statement,
)
from .serializers import (
    APAgingRowSerializer,
    ARAgingRowSerializer,
    BalanceSheetSerializer,
    CashFlowStatementSerializer,
    FixedAssetRegisterRowSerializer,
    IncomeStatementSerializer,
)


# ---------------------------------------------------------------------------
# A/R Aging
# ---------------------------------------------------------------------------

class ARAgingListView(generics.ListAPIView):
    """
    GET /accounting/ar-aging/ — paginated, oldest-overdue-first.

    Response (paginated): {..., "summary": {"buckets": {...}, "grand_total":
    decimal, "invoice_count": int}, "results": [...]} — summary always
    reflects the FULL bounded result set (every outstanding invoice), same
    convention as reports.views's stats merging. Pass `?bucket=1_30` (etc,
    matching accounting.selectors.AGING_BUCKETS) to narrow `results` to just
    that bucket — the summary itself does NOT narrow, so the cards stay a
    stable reference point while the table filters underneath them.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = ARAgingRowSerializer

    def list(self, request, *args, **kwargs):
        rows = get_ar_aging_rows()
        summary = get_ar_aging_summary(rows)

        bucket = request.query_params.get("bucket")
        if bucket:
            rows = [r for r in rows if r["bucket"] == bucket]

        page = self.paginate_queryset(rows)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["summary"] = summary
        return response


# ---------------------------------------------------------------------------
# A/P Aging
# ---------------------------------------------------------------------------

class APAgingListView(generics.ListAPIView):
    """GET /accounting/ap-aging/?bucket=1_30 — same shape as ARAgingListView."""
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = APAgingRowSerializer

    def list(self, request, *args, **kwargs):
        rows = get_ap_aging_rows()
        summary = get_ap_aging_summary(rows)

        bucket = request.query_params.get("bucket")
        if bucket:
            rows = [r for r in rows if r["bucket"] == bucket]

        page = self.paginate_queryset(rows)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["summary"] = summary
        return response


# ---------------------------------------------------------------------------
# Cash Flow Statement
# ---------------------------------------------------------------------------

class CashFlowStatementView(APIView):
    """
    GET /accounting/cash-flow-statement/?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
    Defaults to current-month-to-date when either param is omitted.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        today = timezone.localdate()
        date_from = request.query_params.get("date_from") or today.replace(day=1).isoformat()
        date_to = request.query_params.get("date_to") or today.isoformat()

        data = get_cash_flow_statement(date_from=date_from, date_to=date_to)
        return Response(CashFlowStatementSerializer(data).data)


# ---------------------------------------------------------------------------
# Income Statement
# ---------------------------------------------------------------------------

class IncomeStatementView(APIView):
    """GET /accounting/income-statement/?period=YYYY-MM — defaults to the current month (provisional)."""
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        from profits.models import MonthlyProfit

        period = request.query_params.get("period")
        try:
            data = get_income_statement(period=period)
        except MonthlyProfit.DoesNotExist:
            return Response(
                {"detail": f"No finalized Income Statement exists for period '{period}'."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(IncomeStatementSerializer(data).data)


# ---------------------------------------------------------------------------
# Balance Sheet
# ---------------------------------------------------------------------------

class BalanceSheetView(APIView):
    """GET /accounting/balance-sheet/?period=YYYY-MM — omit `period` for the live "as of today" view."""
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        from .models import BalanceSheetSnapshot

        period = request.query_params.get("period")
        if period:
            try:
                data = get_balance_sheet_for_period(period)
            except BalanceSheetSnapshot.DoesNotExist:
                return Response(
                    {"detail": f"No Balance Sheet snapshot exists for period '{period}'. "
                               f"Only the most recently finished month gets snapshotted automatically."},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            data = get_balance_sheet_live()
        return Response(BalanceSheetSerializer(data).data)


# ---------------------------------------------------------------------------
# Fixed Asset Register
# ---------------------------------------------------------------------------

class FixedAssetRegisterListView(generics.ListAPIView):
    """
    GET /accounting/fixed-asset-register/?include_disposed=true — paginated.
    Excludes disposed assets by default (mirrors the Assets page convention).
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = FixedAssetRegisterRowSerializer

    def get_queryset(self):
        include_disposed = self.request.query_params.get("include_disposed") == "true"
        return get_fixed_asset_register_rows(include_disposed=include_disposed)

    def list(self, request, *args, **kwargs):
        rows = self.get_queryset()
        summary = get_fixed_asset_register_summary(rows)
        page = self.paginate_queryset(rows)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["summary"] = summary
        return response
