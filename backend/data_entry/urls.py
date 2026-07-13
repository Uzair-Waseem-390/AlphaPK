from django.urls import path

from .views import (
    CustomerOpeningBalanceListCreateView,
    OpeningCashListCreateView,
    OpeningStockListCreateView,
    SupplierOpeningBalanceListCreateView,
)

urlpatterns = [
    path("supplier-opening-balance/", SupplierOpeningBalanceListCreateView.as_view(), name="supplier-opening-balance"),
    path("customer-opening-balance/", CustomerOpeningBalanceListCreateView.as_view(), name="customer-opening-balance"),
    path("opening-cash/",             OpeningCashListCreateView.as_view(),             name="opening-cash"),
    path("opening-stock/",            OpeningStockListCreateView.as_view(),            name="opening-stock"),
]
