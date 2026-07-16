from rest_framework import generics

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_cash_collected_report_queryset,
    get_cash_collected_report_stats,
    get_cash_collected_report_stats_all_time,
    get_customer_returns_report_queryset,
    get_customer_returns_report_stats,
    get_customer_returns_report_stats_all_time,
    get_expenses_report_queryset,
    get_expenses_report_stats,
    get_expenses_report_stats_all_time,
    get_inventory_valuation_report_data,
    get_inventory_valuation_report_stats,
    get_invoices_report_queryset,
    get_invoices_report_stats,
    get_invoices_report_stats_all_time,
    get_lost_inventory_report_queryset,
    get_lost_inventory_report_stats,
    get_lost_inventory_report_stats_all_time,
    get_profit_margin_report_queryset,
    get_profit_margin_report_stats,
    get_profit_margin_report_stats_all_time,
    get_purchase_returns_report_queryset,
    get_purchase_returns_report_stats,
    get_purchase_returns_report_stats_all_time,
)
from .serializers import (
    CustomerReturnReportItemSerializer,
    ExpenseReportItemSerializer,
    InventoryValuationReportItemSerializer,
    InvoiceReportItemSerializer,
    LostInventoryReportItemSerializer,
    PaymentReportItemSerializer,
    ProfitMarginReportItemSerializer,
    PurchaseReturnReportItemSerializer,
    ReportDateFilterSerializer,
)


def _has_date_filter(request) -> bool:
    """
    True if the caller supplied any date/date_from/date_to query param.
    When false, views read stats from the pre-synced CashFlow totals instead
    of aggregating the full table — see reports/selectors.py's
    get_<name>_report_stats_all_time() functions.
    """
    p = request.query_params
    return bool(p.get("date") or p.get("date_from") or p.get("date_to"))


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
        # No filter → read the pre-synced CashFlow total (instant at any scale).
        # Filtered → stats computed over the FULL filtered queryset, before
        # pagination slices it down to one page.
        if _has_date_filter(request):
            stats = get_invoices_report_stats(queryset)
        else:
            stats = get_invoices_report_stats_all_time()

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
        if _has_date_filter(request):
            stats = get_cash_collected_report_stats(queryset)
        else:
            stats = get_cash_collected_report_stats_all_time()

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
        if _has_date_filter(request):
            stats = get_expenses_report_stats(queryset)
        else:
            stats = get_expenses_report_stats_all_time()

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class LostInventoryReportView(generics.ListAPIView):
    """
    GET /reports/lost-inventory/
    Every product lost in a batch, filtered by the batch's record date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_lost_items": int, "total_lost_cash": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = LostInventoryReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_lost_inventory_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if _has_date_filter(request):
            stats = get_lost_inventory_report_stats(queryset)
        else:
            stats = get_lost_inventory_report_stats_all_time()

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class PurchaseReturnsReportView(generics.ListAPIView):
    """
    GET /reports/purchase-returns/
    Accepted returns to suppliers, filtered by accepted date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_returns": int, "total_return_value": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = PurchaseReturnReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_purchase_returns_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if _has_date_filter(request):
            stats = get_purchase_returns_report_stats(queryset)
        else:
            stats = get_purchase_returns_report_stats_all_time()

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class CustomerReturnsReportView(generics.ListAPIView):
    """
    GET /reports/customer-returns/
    Accepted returns from customers, filtered by accepted date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_returns": int, "total_return_value": decimal, "total_return_cogs": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = CustomerReturnReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_customer_returns_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if _has_date_filter(request):
            stats = get_customer_returns_report_stats(queryset)
        else:
            stats = get_customer_returns_report_stats_all_time()

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class ProfitMarginReportView(generics.ListAPIView):
    """
    GET /reports/profit-margin/
    Non-draft invoices with revenue/COGS/profit, filtered by confirmed date.

    Query params (mutually exclusive with each other where noted):
        date      : YYYY-MM-DD — exact day
        date_from : YYYY-MM-DD — range start
        date_to   : YYYY-MM-DD — range end

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_invoices": int, "total_revenue": decimal,
                    "total_cogs": decimal, "total_gross_profit": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = ProfitMarginReportItemSerializer

    def get_queryset(self):
        filters = ReportDateFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        return get_profit_margin_report_queryset(**filters.validated_data)

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        if _has_date_filter(request):
            stats = get_profit_margin_report_stats(queryset)
        else:
            stats = get_profit_margin_report_stats_all_time()

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response


class InventoryValuationReportView(generics.ListAPIView):
    """
    GET /reports/inventory-valuation/
    Live snapshot of current stock valued at FIFO cost. No date filtering —
    this answers "what is my stock worth right now", not a period report.

    Query params:
        search : product name/code (partial match, optional)

    Response (paginated):
        {"count": int, "total_pages": int, "current_page": int, "page_size": int,
         "stats": {"total_products": int, "total_quantity_on_hand": int,
                    "total_inventory_value": decimal},
         "results": [...]}
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InventoryValuationReportItemSerializer

    def get_queryset(self):
        return get_inventory_valuation_report_data(search=self.request.query_params.get("search"))

    def list(self, request, *args, **kwargs):
        rows = self.get_queryset()
        stats = get_inventory_valuation_report_stats(rows)

        page = self.paginate_queryset(rows)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["stats"] = stats
        return response
