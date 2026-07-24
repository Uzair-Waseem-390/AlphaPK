from django.urls import path

from .views import (
    CashCollectedReportView,
    CustomerReturnsReportView,
    ExpensesReportView,
    InputTaxReportView,
    InventoryValuationReportView,
    InvoicesReportView,
    LostInventoryReportView,
    OutputTaxReportView,
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
    path("sales-tax/input/", InputTaxReportView.as_view(), name="report-sales-tax-input"),
    path("sales-tax/output/", OutputTaxReportView.as_view(), name="report-sales-tax-output"),
]
