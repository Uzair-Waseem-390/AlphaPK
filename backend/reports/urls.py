from django.urls import path

from .views import (
    CashCollectedReportView,
    CustomerReturnsReportView,
    ExpensesReportView,
    InventoryValuationReportView,
    InvoicesReportView,
    LostInventoryReportView,
    ProfitMarginReportView,
    PurchaseReturnsReportView,
)

urlpatterns = [
    path("invoices/", InvoicesReportView.as_view(), name="report-invoices"),
    path("cash-collected/", CashCollectedReportView.as_view(), name="report-cash-collected"),
    path("expenses/", ExpensesReportView.as_view(), name="report-expenses"),
    path("lost-inventory/", LostInventoryReportView.as_view(), name="report-lost-inventory"),
    path("purchase-returns/", PurchaseReturnsReportView.as_view(), name="report-purchase-returns"),
    path("customer-returns/", CustomerReturnsReportView.as_view(), name="report-customer-returns"),
    path("profit-margin/", ProfitMarginReportView.as_view(), name="report-profit-margin"),
    path("inventory-valuation/", InventoryValuationReportView.as_view(), name="report-inventory-valuation"),
]
