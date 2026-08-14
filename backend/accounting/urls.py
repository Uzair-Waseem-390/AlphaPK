from django.urls import path

from .views import (
    APAgingListView,
    ARAgingListView,
    BalanceSheetView,
    CashFlowStatementView,
    FixedAssetRegisterListView,
    IncomeStatementView,
)

urlpatterns = [
    path("ar-aging/", ARAgingListView.as_view(), name="ar-aging-list"),
    path("ap-aging/", APAgingListView.as_view(), name="ap-aging-list"),
    path("fixed-asset-register/", FixedAssetRegisterListView.as_view(), name="fixed-asset-register-list"),
    path("cash-flow-statement/", CashFlowStatementView.as_view(), name="cash-flow-statement"),
    path("income-statement/", IncomeStatementView.as_view(), name="income-statement"),
    path("balance-sheet/", BalanceSheetView.as_view(), name="balance-sheet"),
]
