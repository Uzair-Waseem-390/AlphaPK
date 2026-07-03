from django.urls import path

from .views import (
    AllInvoicePaymentsView,
    AllOutstandingInvoicesView,
    ConfirmedInvoiceListView,
    CustomerListCreateView,
    CustomerOutstandingListView,
    CustomerOutstandingView,
    CustomerRetrieveUpdateDestroyView,
    DraftInvoiceListView,
    InvoiceConfirmView,
    InvoiceFilteredListView,
    InvoiceListCreateView,
    InvoicePaymentSummaryView,
    InvoicePrintView,
    InvoiceRetrieveUpdateDestroyView,
    InvoiceSavedPDFListView,
    InvoiceSavePDFView,
    PaymentDestroyView,
    PaymentListCreateView,
    ReturnAcceptView,
    ReturnListCreateView,
    SavedPDFDeleteView,
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
    path("payments/", AllInvoicePaymentsView.as_view(), name="payment-list-all"),
    path("payments/<int:pk>/", PaymentDestroyView.as_view(), name="payment-delete"),

    # Returns (nested under invoice + standalone accept)
    path("invoices/<int:invoice_id>/returns/", ReturnListCreateView.as_view(), name="return-list-create"),
    path("returns/<int:pk>/accept/", ReturnAcceptView.as_view(), name="return-accept"),

    # Payment summaries
    path("invoices/<int:pk>/payment-summary/", InvoicePaymentSummaryView.as_view(), name="invoice-payment-summary"),
    path("customers/outstanding/", CustomerOutstandingListView.as_view(), name="customer-outstanding-list"),
    path("customers/<int:pk>/outstanding/", CustomerOutstandingView.as_view(), name="customer-outstanding"),

    # Confirmed invoices (dedicated endpoint)
    path("invoices/confirmed/", ConfirmedInvoiceListView.as_view(), name="invoice-confirmed-list"),
    path("invoices/outstanding/", AllOutstandingInvoicesView.as_view(), name="invoice-outstanding-list"),

    # Master filter search
    path("invoices/search/", InvoiceFilteredListView.as_view(), name="invoice-search"),

    # PDF - print (no save)
    path("invoices/<int:pk>/print/", InvoicePrintView.as_view(), name="invoice-print"),

    # PDF - save to disk + list saved PDFs
    path("invoices/<int:pk>/pdf/save/", InvoiceSavePDFView.as_view(), name="invoice-pdf-save"),
    path("invoices/<int:pk>/pdf/", InvoiceSavedPDFListView.as_view(), name="invoice-pdf-list"),

    # Delete a saved PDF
    path("pdf/<int:saved_pdf_id>/", SavedPDFDeleteView.as_view(), name="pdf-delete"),
]