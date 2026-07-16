from django.urls import path

from .views import (
    CashCollectedReportView,
    ExpensesReportView,
    InvoicesReportView,
    LostInventoryReportView,
)

urlpatterns = [
    path("invoices/", InvoicesReportView.as_view(), name="report-invoices"),
    path("cash-collected/", CashCollectedReportView.as_view(), name="report-cash-collected"),
    path("expenses/", ExpensesReportView.as_view(), name="report-expenses"),
    path("lost-inventory/", LostInventoryReportView.as_view(), name="report-lost-inventory"),
]
