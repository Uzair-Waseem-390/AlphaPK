from django.urls import path

from .views import (
    TaxPaymentListCreateView,
    TaxPaymentRetrieveDestroyView,
    TaxStatsView,
)

urlpatterns = [
    path("stats/", TaxStatsView.as_view(), name="tax-stats"),

    path("payments/",      TaxPaymentListCreateView.as_view(),     name="tax-payment-list-create"),
    path("payments/<int:pk>/", TaxPaymentRetrieveDestroyView.as_view(), name="tax-payment-detail"),
]
