from django.urls import path

from .views import (
    BusinessWorthView,
    CurrentMonthProfitView,
    InvestorMonthlySharesListView,
    InvestorProfitPayoutCreateView,
    InvestorProfitPayoutListView,
    InvestorProfitPayoutRetrieveDestroyView,
    MonthlyProfitDetailView,
    MonthlyProfitListView,
    NetProfitTrendView,
    ProfitFlowStatsView,
)

urlpatterns = [
    path("business-worth/", BusinessWorthView.as_view(), name="business-worth"),

    path("stats/", ProfitFlowStatsView.as_view(), name="profit-flow-stats"),
    path("net-profit-trend/", NetProfitTrendView.as_view(), name="net-profit-trend"),

    # IMPORTANT: static "current/" path before the dynamic <str:period>/ path
    path("monthly/current/", CurrentMonthProfitView.as_view(), name="monthly-profit-current"),
    path("monthly/", MonthlyProfitListView.as_view(), name="monthly-profit-list"),
    path("monthly/<str:period>/", MonthlyProfitDetailView.as_view(), name="monthly-profit-detail"),
    path("monthly/shares/<int:share_id>/payouts/", InvestorProfitPayoutCreateView.as_view(), name="investor-profit-payout-create"),

    # IMPORTANT: static "payouts/" list before the dynamic "payouts/<pk>/" detail
    path("payouts/", InvestorProfitPayoutListView.as_view(), name="investor-profit-payout-list"),
    path("payouts/<int:pk>/", InvestorProfitPayoutRetrieveDestroyView.as_view(), name="investor-profit-payout-detail"),

    path("investors/<int:investor_id>/shares/", InvestorMonthlySharesListView.as_view(), name="investor-monthly-shares"),
]
