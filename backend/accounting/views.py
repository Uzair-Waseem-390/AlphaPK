from rest_framework import generics

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_ap_aging_rows,
    get_ap_aging_summary,
    get_ar_aging_rows,
    get_ar_aging_summary,
    get_fixed_asset_register_rows,
    get_fixed_asset_register_summary,
)
from .serializers import (
    APAgingRowSerializer,
    ARAgingRowSerializer,
    FixedAssetRegisterRowSerializer,
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
