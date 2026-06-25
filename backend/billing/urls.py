from django.urls import path

from .views import (
    CustomerListCreateView,
    CustomerRetrieveUpdateDestroyView,
    DraftInvoiceListView,
    InvoiceConfirmView,
    InvoiceListCreateView,
    InvoiceRetrieveUpdateDestroyView,
    PaymentDestroyView,
    PaymentListCreateView,
    ReturnAcceptView,
    ReturnListCreateView,
)

urlpatterns = [
    # Customers
    path("customers/", CustomerListCreateView.as_view(), name="customer-list-create"),
    path("customers/<int:pk>/", CustomerRetrieveUpdateDestroyView.as_view(), name="customer-detail"),

    # Invoices
    path("invoices/", InvoiceListCreateView.as_view(), name="invoice-list-create"),
    path("invoices/drafts/", DraftInvoiceListView.as_view(), name="invoice-drafts"),
    path("invoices/<int:pk>/", InvoiceRetrieveUpdateDestroyView.as_view(), name="invoice-detail"),
    path("invoices/<int:pk>/confirm/", InvoiceConfirmView.as_view(), name="invoice-confirm"),

    # Payments (nested under invoice)
    path("invoices/<int:invoice_id>/payments/", PaymentListCreateView.as_view(), name="payment-list-create"),
    path("payments/<int:pk>/", PaymentDestroyView.as_view(), name="payment-delete"),

    # Returns (nested under invoice + standalone accept)
    path("invoices/<int:invoice_id>/returns/", ReturnListCreateView.as_view(), name="return-list-create"),
    path("returns/<int:pk>/accept/", ReturnAcceptView.as_view(), name="return-accept"),
]