from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSuperuser
from .selectors import (
    get_all_expense_categories,
    get_all_expenses,
    get_cashflow_stats,
    get_customer_outstanding_breakdown,
    get_expense_by_id,
    get_expense_category_by_id,
    get_invoice_payments_breakdown,
    get_invoices_breakdown,
    get_purchases_breakdown,
    get_supplier_payable_outstanding_breakdown,
    get_supplier_payments_breakdown,
)
from .serializers import (
    CashFlowStatsSerializer,
    CustomerOutstandingBreakdownSerializer,
    ExpenseCategoryReadSerializer,
    ExpenseCategoryWriteSerializer,
    ExpenseReadSerializer,
    ExpenseWriteSerializer,
    InvoiceBreakdownSerializer,
    InvoicePaymentBreakdownSerializer,
    PurchaseBreakdownSerializer,
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

class CashInHandBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/cash-in-hand/
    All invoice payments received (positive amounts only).

    Filter params:
        customer_name, customer_code, date_from, date_to,
        min_amount, max_amount, method (cash/jazzcash/easypaisa/bank)
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InvoicePaymentBreakdownSerializer

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


class CustomerOutstandingBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/customer-outstanding/
    All invoices with outstanding balance.

    Filter params:
        customer_name, customer_code, payment_status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = CustomerOutstandingBreakdownSerializer

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


class TotalPaidPayablesBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/paid-payables/
    All supplier payments made.

    Filter params:
        supplier_name, supplier_code, date_from, date_to,
        min_amount, max_amount, method
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = SupplierPaymentBreakdownSerializer

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


class SupplierOutstandingBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/supplier-outstanding/
    All purchase orders with outstanding payable.

    Filter params:
        supplier_name, supplier_code, payment_status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = SupplierOutstandingBreakdownSerializer

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


class InvoicesBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/invoices/
    All confirmed invoices (total_number_of_invoices drill-down).

    Filter params:
        customer_name, customer_code, payment_status, status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = InvoiceBreakdownSerializer

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


class PurchasesBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/purchases/
    All confirmed purchase orders (total_number_of_purchases drill-down).

    Filter params:
        supplier_name, supplier_code, payment_status,
        date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = PurchaseBreakdownSerializer

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


class ExpensesBreakdownView(generics.ListAPIView):
    """
    GET /cash-flow/breakdown/expenses/
    All expenses (total_expenses_amount drill-down).
    Same filters as main expense list.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = ExpenseReadSerializer

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