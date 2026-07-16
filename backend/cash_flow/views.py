from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_all_expense_categories,
    get_all_expenses,
    get_cash_in_hand_breakdown,
    get_cashflow_stats,
    get_customer_outstanding_breakdown,
    get_customer_returns_breakdown,
    get_expense_by_id,
    get_expense_category_by_id,
    get_gross_profit_trend,
    get_invoice_payments_breakdown,
    get_invoices_breakdown,
    get_lost_inventory_breakdown,
    get_profit_breakdown,
    get_purchase_returns_breakdown,
    get_purchases_breakdown,
    get_supplier_payable_outstanding_breakdown,
    get_supplier_payments_breakdown,
)
from .serializers import (
    CashFlowStatsSerializer,
    CustomerOutstandingBreakdownSerializer,
    CustomerReturnBreakdownSerializer,
    ExpenseCategoryReadSerializer,
    ExpenseCategoryWriteSerializer,
    ExpenseReadSerializer,
    ExpenseWriteSerializer,
    InvoiceBreakdownSerializer,
    InvoicePaymentBreakdownSerializer,
    LostInventoryBreakdownSerializer,
    ProfitBreakdownSerializer,
    PurchaseBreakdownSerializer,
    PurchaseReturnBreakdownSerializer,
    SupplierOutstandingBreakdownSerializer,
    SupplierPaymentBreakdownSerializer,
)
from .services import (
    create_expense,
    create_expense_category,
    delete_expense,
    delete_expense_category,
    update_expense,
    update_expense_category,
)


# ---------------------------------------------------------------------------
# Dashboard stats
# ---------------------------------------------------------------------------

class CashFlowStatsView(APIView):
    """
    GET /cash-flow/stats/
    Returns all 10 dashboard stats from the live CashFlow model.
    No runtime aggregation — reads from pre-synced model.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        stats = get_cashflow_stats()
        serializer = CashFlowStatsSerializer(stats)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# ExpenseCategory
# ---------------------------------------------------------------------------

class ExpenseCategoryListCreateView(generics.ListCreateAPIView):
    """
    GET  /cash-flow/expense-categories/
    POST /cash-flow/expense-categories/
    """
    permission_classes = [IsAdminOrSuperuser]

    def get_serializer_class(self):
        return ExpenseCategoryWriteSerializer if self.request.method == "POST" else ExpenseCategoryReadSerializer

    def get_queryset(self):
        return get_all_expense_categories()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        obj = create_expense_category(**serializer.validated_data, user=request.user)
        return Response(ExpenseCategoryReadSerializer(obj).data, status=status.HTTP_201_CREATED)


class ExpenseCategoryRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /cash-flow/expense-categories/<pk>/
    PATCH  /cash-flow/expense-categories/<pk>/
    DELETE /cash-flow/expense-categories/<pk>/
    """
    permission_classes = [IsAdminOrSuperuser]
    http_method_names  = ["get", "patch", "delete"]

    def get_serializer_class(self):
        return ExpenseCategoryWriteSerializer if self.request.method == "PATCH" else ExpenseCategoryReadSerializer

    def get_object(self):
        return get_expense_category_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        obj = update_expense_category(pk=self.kwargs["pk"], user=request.user, **serializer.validated_data)
        return Response(ExpenseCategoryReadSerializer(obj).data)

    def destroy(self, request, *args, **kwargs):
        delete_expense_category(pk=self.kwargs["pk"])
        return Response({"detail": "Expense category deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Expense
# ---------------------------------------------------------------------------

class ExpenseListCreateView(generics.ListCreateAPIView):
    """
    GET  /cash-flow/expenses/
    POST /cash-flow/expenses/

    Filter params for GET:
        search      : name or description
        category    : category id
        date_from   : YYYY-MM-DD
        date_to     : YYYY-MM-DD
        min_amount  : minimum amount
        max_amount  : maximum amount
    """
    permission_classes = [IsAdminOrSuperuser]

    def get_serializer_class(self):
        return ExpenseWriteSerializer if self.request.method == "POST" else ExpenseReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_all_expenses(
            search      = p.get("search"),
            category_id = p.get("category"),
            date_from   = p.get("date_from"),
            date_to     = p.get("date_to"),
            min_amount  = p.get("min_amount"),
            max_amount  = p.get("max_amount"),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        obj = create_expense(
            name         = d["name"],
            category_id  = d["category"].pk,
            amount       = d["amount"],
            expense_date = d["expense_date"],
            description  = d.get("description", ""),
            user         = request.user,
        )
        return Response(ExpenseReadSerializer(obj).data, status=status.HTTP_201_CREATED)


class ExpenseRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /cash-flow/expenses/<pk>/
    PATCH  /cash-flow/expenses/<pk>/
    DELETE /cash-flow/expenses/<pk>/
    """
    permission_classes = [IsAdminOrSuperuser]
    http_method_names  = ["get", "patch", "delete"]

    def get_serializer_class(self):
        return ExpenseWriteSerializer if self.request.method == "PATCH" else ExpenseReadSerializer

    def get_object(self):
        return get_expense_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        obj = update_expense(
            pk           = self.kwargs["pk"],
            name         = d.get("name"),
            category_id  = d["category"].pk if "category" in d else None,
            amount       = d.get("amount"),
            expense_date = d.get("expense_date"),
            description  = d.get("description"),
            user         = request.user,
        )
        return Response(ExpenseReadSerializer(obj).data)

    def destroy(self, request, *args, **kwargs):
        delete_expense(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Expense deleted and cash in hand adjusted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Breakdown views (drill-down from dashboard)
# ---------------------------------------------------------------------------

class BreakdownTotalsMixin:
    """
    Injects an exact `totals` block into every breakdown response, computed
    via Sum() over the FULL filtered queryset — before pagination slices it
    down to one page — so the drawer can show the precise total matching the
    stat card the user clicked, not just a sum of the 25 visible rows.

    Subclasses set `totals_fields = {"response_key": "model_field_name"}`.
    """
    totals_fields = {}

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())

        # One combined aggregate() call computes every sum in a single query —
        # calling .aggregate() once per field (the original version of this
        # mixin) issued N separate queries for a view with N totals_fields.
        if self.totals_fields:
            aggregate_kwargs = {
                key: Coalesce(Sum(field), Decimal("0"))
                for key, field in self.totals_fields.items()
            }
            totals = queryset.aggregate(**aggregate_kwargs)
        else:
            totals = {}
        totals["count"] = queryset.count()

        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page, many=True)
        response = self.get_paginated_response(serializer.data)
        response.data["totals"] = totals
        return response


class CashInHandBreakdownView(APIView):
    """
    GET /cash-flow/breakdown/cash-in-hand/
    ALL cash movements affecting cash_in_hand (inflows AND outflows).

    Filter params:
        date_from     : YYYY-MM-DD
        date_to       : YYYY-MM-DD
        movement_type : inflow | outflow

    Each entry shows direction (inflow/outflow), type, date,
    description, reference, amount, method.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        p = request.query_params
        movements = get_cash_in_hand_breakdown(
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
            movement_type = p.get("movement_type"),
        )
        total_inflow  = sum((m["amount"] for m in movements if m["direction"] == "inflow"), Decimal("0"))
        total_outflow = sum((m["amount"] for m in movements if m["direction"] == "outflow"), Decimal("0"))
        return Response({
            "count"        : len(movements),
            "total_pages"  : 1,
            "current_page" : 1,
            "page_size"    : len(movements),
            "results"      : movements,
            "totals": {
                "total_inflow"  : total_inflow,
                "total_outflow" : total_outflow,
                "net"           : total_inflow - total_outflow,
            },
        })


class TotalInvoicesCashBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/invoices-cash/
    All invoice payments received from customers (gross collection).
    This is the total_invoices_cash breakdown.

    Filter params:
        customer_name, customer_code, date_from, date_to,
        min_amount, max_amount, method
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InvoicePaymentBreakdownSerializer
    totals_fields      = {"total_amount": "amount"}

    def get_queryset(self):
        p = self.request.query_params
        return get_invoice_payments_breakdown(
            customer_name = p.get("customer_name"),
            customer_code = p.get("customer_code"),
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
            min_amount    = p.get("min_amount"),
            max_amount    = p.get("max_amount"),
            method        = p.get("method"),
        )


class CustomerOutstandingBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/customer-outstanding/
    All invoices with outstanding balance.

    Filter params:
        customer_name, customer_code, payment_status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = CustomerOutstandingBreakdownSerializer
    totals_fields      = {"total_outstanding": "credit_outstanding"}

    def get_queryset(self):
        p = self.request.query_params
        return get_customer_outstanding_breakdown(
            customer_name  = p.get("customer_name"),
            customer_code  = p.get("customer_code"),
            payment_status = p.get("payment_status"),
            date_from      = p.get("date_from"),
            date_to        = p.get("date_to"),
            min_amount     = p.get("min_amount"),
            max_amount     = p.get("max_amount"),
        )


class TotalPaidPayablesBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/paid-payables/
    All supplier payments made.

    Filter params:
        supplier_name, supplier_code, date_from, date_to,
        min_amount, max_amount, method
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = SupplierPaymentBreakdownSerializer
    totals_fields      = {"total_amount": "amount"}

    def get_queryset(self):
        p = self.request.query_params
        return get_supplier_payments_breakdown(
            supplier_name = p.get("supplier_name"),
            supplier_code = p.get("supplier_code"),
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
            min_amount    = p.get("min_amount"),
            max_amount    = p.get("max_amount"),
            method        = p.get("method"),
        )


class SupplierOutstandingBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/supplier-outstanding/
    All purchase orders with outstanding payable.

    Filter params:
        supplier_name, supplier_code, payment_status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = SupplierOutstandingBreakdownSerializer
    totals_fields      = {"total_outstanding": "payable_outstanding"}

    def get_queryset(self):
        p = self.request.query_params
        return get_supplier_payable_outstanding_breakdown(
            supplier_name  = p.get("supplier_name"),
            supplier_code  = p.get("supplier_code"),
            payment_status = p.get("payment_status"),
            date_from      = p.get("date_from"),
            date_to        = p.get("date_to"),
            min_amount     = p.get("min_amount"),
            max_amount     = p.get("max_amount"),
        )


class InvoicesBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/invoices/
    All confirmed invoices (total_number_of_invoices drill-down).

    Filter params:
        customer_name, customer_code, payment_status, status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InvoiceBreakdownSerializer
    totals_fields      = {"total_amount": "grand_total"}

    def get_queryset(self):
        p = self.request.query_params
        return get_invoices_breakdown(
            customer_name  = p.get("customer_name"),
            customer_code  = p.get("customer_code"),
            payment_status = p.get("payment_status"),
            status         = p.get("status"),
            date_from      = p.get("date_from"),
            date_to        = p.get("date_to"),
            min_amount     = p.get("min_amount"),
            max_amount     = p.get("max_amount"),
        )


class PurchasesBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/purchases/
    All confirmed purchase orders (total_number_of_purchases drill-down).

    Filter params:
        supplier_name, supplier_code, payment_status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = PurchaseBreakdownSerializer
    totals_fields      = {"total_amount": "net_payable"}

    def get_queryset(self):
        p = self.request.query_params
        return get_purchases_breakdown(
            supplier_name  = p.get("supplier_name"),
            supplier_code  = p.get("supplier_code"),
            payment_status = p.get("payment_status"),
            date_from      = p.get("date_from"),
            date_to        = p.get("date_to"),
            min_amount     = p.get("min_amount"),
            max_amount     = p.get("max_amount"),
        )


class ExpensesBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/expenses/
    All expenses (total_expenses_amount drill-down).
    Same filters as main expense list.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = ExpenseReadSerializer
    totals_fields      = {"total_amount": "amount"}

    def get_queryset(self):
        p = self.request.query_params
        return get_all_expenses(
            search      = p.get("search"),
            category_id = p.get("category"),
            date_from   = p.get("date_from"),
            date_to     = p.get("date_to"),
            min_amount  = p.get("min_amount"),
            max_amount  = p.get("max_amount"),
        )


class LostInventoryBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/lost-inventory/
    All lost inventory line items (total_lost_inventory_worth drill-down).

    Filter params:
        search      : reference number (partial match)
        product_id  : filter by product
        date_from   : YYYY-MM-DD
        date_to     : YYYY-MM-DD
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = LostInventoryBreakdownSerializer
    totals_fields      = {"total_amount": "total_cost"}

    def get_queryset(self):
        p = self.request.query_params
        return get_lost_inventory_breakdown(
            search     = p.get("search"),
            product_id = p.get("product_id"),
            date_from  = p.get("date_from"),
            date_to    = p.get("date_to"),
        )


# ---------------------------------------------------------------------------
# Purchase returns breakdown
# ---------------------------------------------------------------------------

class PurchaseReturnsBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/purchase-returns/
    All accepted returns to suppliers (total_purchase_returns_value/cogs drill-down).

    Filter params:
        supplier_name, supplier_code, date_from, date_to
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = PurchaseReturnBreakdownSerializer
    totals_fields      = {"total_value": "total_return_amount", "total_cogs": "total_return_gross"}

    def get_queryset(self):
        p = self.request.query_params
        return get_purchase_returns_breakdown(
            supplier_name = p.get("supplier_name"),
            supplier_code = p.get("supplier_code"),
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
        )


# ---------------------------------------------------------------------------
# Customer returns breakdown
# ---------------------------------------------------------------------------

class CustomerReturnsBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/customer-returns/
    All accepted returns from customers (total_customer_returns_value/cogs drill-down).

    Filter params:
        customer_name, customer_code, date_from, date_to
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = CustomerReturnBreakdownSerializer
    totals_fields      = {"total_value": "total_return_amount", "total_cogs": "total_return_cogs"}

    def get_queryset(self):
        p = self.request.query_params
        return get_customer_returns_breakdown(
            customer_name = p.get("customer_name"),
            customer_code = p.get("customer_code"),
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
        )


# ---------------------------------------------------------------------------
# Profit breakdown
# ---------------------------------------------------------------------------

class ProfitBreakdownView(BreakdownTotalsMixin, generics.ListAPIView):
    """
    GET /cash-flow/breakdown/profit/
    All confirmed invoices with revenue/COGS/profit
    (total_invoice_revenue/cogs/total_gross_profit drill-down).

    Filter params:
        customer_name, customer_code, date_from, date_to
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = ProfitBreakdownSerializer
    totals_fields      = {
        "total_revenue": "grand_total",
        "total_cogs": "total_cogs",
        "total_gross_profit": "gross_profit",
    }

    def get_queryset(self):
        p = self.request.query_params
        return get_profit_breakdown(
            customer_name = p.get("customer_name"),
            customer_code = p.get("customer_code"),
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
        )


# ---------------------------------------------------------------------------
# Gross profit trend (dashboard graph)
# ---------------------------------------------------------------------------

class GrossProfitTrendView(APIView):
    """
    GET /cash-flow/gross-profit-trend/
    Revenue/COGS/gross profit grouped by month, for the dashboard graph.
    Defaults to the last 6 months. Bounded to one row per month in range
    regardless of how many invoices exist — safe for multi-year ranges.

    Filter params:
        date_from : YYYY-MM-DD
        date_to   : YYYY-MM-DD
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        p = request.query_params
        trend = get_gross_profit_trend(
            date_from = p.get("date_from"),
            date_to   = p.get("date_to"),
        )
        return Response(trend)