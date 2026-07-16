from rest_framework import generics

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_cash_collected_report_queryset,
    get_cash_collected_report_stats,
    get_expenses_report_queryset,
    get_expenses_report_stats,
    get_invoices_report_queryset,
    get_invoices_report_stats,
)
from .serializers import (
    ExpenseReportItemSerializer,
    InvoiceReportItemSerializer,
    PaymentReportItemSerializer,
    ReportDateFilterSerializer,
)


class InvoicesReportView(generics.ListAPIView):
    """
    GET /reports/invoices/
    Non-draft invoices, filtered by confirmed date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_invoices": int, "total_invoices_cash": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InvoiceReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_invoices_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        # stats are computed over the FULL filtered queryset, before pagination
        # slices it down to one page — the totals must reflect every matching
        # invoice, not just the ones shown on the current page.
        stats = get_invoices_report_stats(queryset)

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class CashCollectedReportView(generics.ListAPIView):
    """
    GET /reports/cash-collected/
    All payment collections (any method), filtered by payment date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_payments": int, "total_cash_collected": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = PaymentReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_cash_collected_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        # stats are computed over the FULL filtered queryset, before pagination
        # slices it down to one page.
        stats = get_cash_collected_report_stats(queryset)

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class ExpensesReportView(generics.ListAPIView):
    """
    GET /reports/expenses/
    All non-deleted expenses, filtered by expense date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_expenses": int, "total_expenses_cash": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = ExpenseReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_expenses_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        # stats are computed over the FULL filtered queryset, before pagination
        # slices it down to one page.
        stats = get_expenses_report_stats(queryset)

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response
