from django.urls import path

from .views import (
    PaymentMethodAllocationListView,
    PaymentMethodListCreateView,
    PaymentMethodRetrieveUpdateDestroyView,
)

urlpatterns = [
    path("", PaymentMethodListCreateView.as_view(), name="payment-method-list-create"),
    path("<int:pk>/", PaymentMethodRetrieveUpdateDestroyView.as_view(), name="payment-method-detail"),
    path("<int:pk>/allocations/", PaymentMethodAllocationListView.as_view(), name="payment-method-allocations"),
]
