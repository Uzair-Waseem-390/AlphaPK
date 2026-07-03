from rest_framework import generics, status
from rest_framework.response import Response

from .models import Invoice
from .permissions import IsAdminOrSuperuser, IsAdminOrSuperuserOrReadOnly, IsAuthenticated
from .selectors import (
    get_all_customers,
    get_all_invoices,
    get_customer_by_id,
    get_draft_invoices,
    get_invoice_by_id,
    get_payment_by_id,
    get_payments_for_invoice,
    get_return_by_id,
    get_returns_for_invoice,
)
from .serializers import (
    CustomerReadSerializer,
    CustomerWriteSerializer,
    InvoiceCreateSerializer,
    InvoiceReadSerializer,
    InvoiceUpdateSerializer,
    PaymentReadSerializer,
    PaymentWriteSerializer,
    ReturnCreateSerializer,
    ReturnReadSerializer,
)
from .services import (
    accept_return,
    confirm_invoice,
    create_customer,
    create_invoice,
    create_payment,
    create_return,
    delete_customer,
    delete_invoice,
    delete_payment,
    update_customer,
    update_invoice_items,
)


# ---------------------------------------------------------------------------
# Customer
# ---------------------------------------------------------------------------

class CustomerListCreateView(generics.ListCreateAPIView):
    """
    GET  /billing/customers/       — list all customers (search: ?search=)
    POST /billing/customers/       — create customer (all authenticated)
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return CustomerWriteSerializer if self.request.method == "POST" else CustomerReadSerializer

    def get_queryset(self):
        return get_all_customers(search=self.request.query_params.get("search"))

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        customer = create_customer(
            name=d["name"], code=d["code"],
            address=d["address"], mobile=d.get("mobile", ""),
            user=request.user,
        )
        return Response(CustomerReadSerializer(customer).data, status=status.HTTP_201_CREATED)


class CustomerRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /billing/customers/<pk>/
    PATCH  /billing/customers/<pk>/
    DELETE /billing/customers/<pk>/
    """
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete"]

    def get_serializer_class(self):
        return CustomerWriteSerializer if self.request.method == "PATCH" else CustomerReadSerializer

    def get_object(self):
        return get_customer_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        customer = update_customer(pk=self.kwargs["pk"], user=request.user, **serializer.validated_data)
        return Response(CustomerReadSerializer(customer).data)

    def destroy(self, request, *args, **kwargs):
        delete_customer(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Customer deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Invoice — list + create
# ---------------------------------------------------------------------------

class InvoiceListCreateView(generics.ListCreateAPIView):
    """
    GET  /billing/invoices/         — all invoices (?status=draft|confirmed|returned|partial, ?customer_id=)
    POST /billing/invoices/         — create draft (all authenticated)
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return InvoiceCreateSerializer if self.request.method == "POST" else InvoiceReadSerializer

    def get_queryset(self):
        return get_all_invoices(
            status=self.request.query_params.get("status"),
            customer_id=self.request.query_params.get("customer_id"),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        invoice = create_invoice(
            customer_id=d["customer_id"],
            items=d["items"],
            user=request.user,
        )
        return Response(InvoiceReadSerializer(invoice).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Draft invoices — separate endpoint as per instructions
# ---------------------------------------------------------------------------

class DraftInvoiceListView(generics.ListAPIView):
    """
    GET /billing/invoices/drafts/   — all draft invoices (all authenticated)
    """
    permission_classes = [IsAuthenticated]
    serializer_class = InvoiceReadSerializer

    def get_queryset(self):
        return get_draft_invoices()


# ---------------------------------------------------------------------------
# Invoice — retrieve + update + delete
# ---------------------------------------------------------------------------

class InvoiceRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET    /billing/invoices/<pk>/  — anyone authenticated
    PATCH  /billing/invoices/<pk>/  — update items on DRAFT only (anyone)
    DELETE /billing/invoices/<pk>/  — soft delete DRAFT only (anyone)
    """
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "delete"]

    def get_serializer_class(self):
        return InvoiceUpdateSerializer if self.request.method == "PATCH" else InvoiceReadSerializer

    def get_object(self):
        return get_invoice_by_id(self.kwargs["pk"])

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invoice = update_invoice_items(
            invoice_id=self.kwargs["pk"],
            items=serializer.validated_data["items"],
            user=request.user,
        )
        return Response(InvoiceReadSerializer(invoice).data)

    def destroy(self, request, *args, **kwargs):
        delete_invoice(invoice_id=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Invoice deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Confirm Invoice (admin/superuser only)
# ---------------------------------------------------------------------------

class InvoiceConfirmView(generics.UpdateAPIView):
    """
    POST /billing/invoices/<pk>/confirm/
    Confirms a draft — releases stock, runs FIFO, snapshots prices.
    Admin + superuser only.
    """
    permission_classes = [IsAdminOrSuperuser]
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        invoice = confirm_invoice(invoice_id=self.kwargs["pk"], user=request.user)
        return Response(InvoiceReadSerializer(invoice).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------

class PaymentListCreateView(generics.ListCreateAPIView):
    """
    GET  /billing/invoices/<invoice_id>/payments/
    POST /billing/invoices/<invoice_id>/payments/
    """
    permission_classes = [IsAdminOrSuperuserOrReadOnly]

    def get_serializer_class(self):
        return PaymentWriteSerializer if self.request.method == "POST" else PaymentReadSerializer

    def get_queryset(self):
        return get_payments_for_invoice(self.kwargs["invoice_id"])

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        payment = create_payment(
            invoice_id=self.kwargs["invoice_id"],
            amount=d["amount"],
            method=d["method"],
            payment_date=d["payment_date"],
            note=d.get("note", ""),
            user=request.user,
        )
        return Response(PaymentReadSerializer(payment).data, status=status.HTTP_201_CREATED)


class PaymentDestroyView(generics.DestroyAPIView):
    """
    DELETE /billing/payments/<pk>/
    Soft-deletes a payment. Admin + superuser only.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get_object(self):
        return get_payment_by_id(self.kwargs["pk"])

    def destroy(self, request, *args, **kwargs):
        delete_payment(payment_id=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Payment deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Return
# ---------------------------------------------------------------------------

class ReturnListCreateView(generics.ListCreateAPIView):
    """
    GET  /billing/invoices/<invoice_id>/returns/  — list returns for invoice
    POST /billing/invoices/<invoice_id>/returns/  — create return request (all authenticated)
    """
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return ReturnCreateSerializer if self.request.method == "POST" else ReturnReadSerializer

    def get_queryset(self):
        return get_returns_for_invoice(self.kwargs["invoice_id"])

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        return_record = create_return(
            invoice_id=self.kwargs["invoice_id"],
            items=d["items"],
            note=d.get("note", ""),
            user=request.user,
        )
        return Response(ReturnReadSerializer(return_record).data, status=status.HTTP_201_CREATED)


class ReturnAcceptView(generics.UpdateAPIView):
    """
    POST /billing/returns/<pk>/accept/
    Accepts a pending return — reverses FIFO, restores inventory, credits balance.
    Admin + superuser only.
    """
    permission_classes = [IsAdminOrSuperuser]
    http_method_names = ["post"]

    def post(self, request, *args, **kwargs):
        return_record = accept_return(return_id=self.kwargs["pk"], user=request.user)
        return Response(ReturnReadSerializer(return_record).data, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# Payment summary views
# ---------------------------------------------------------------------------

from .selectors import (
    get_invoice_payment_summary,
    get_customer_outstanding,
    get_customers_with_outstanding,
)
from .serializers import (
    CustomerOutstandingSerializer,
    CustomerWithOutstandingSerializer,
    InvoicePaymentSummarySerializer,
)


class InvoicePaymentSummaryView(generics.RetrieveAPIView):
    """
    GET /billing/invoices/<pk>/payment-summary/
    Returns full payment breakdown for a single invoice:
      - subtotal, cash_received, credit_outstanding, total_paid,
        remaining_amount, payment_status, all payment records.
    Accessible to all authenticated users.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = InvoicePaymentSummarySerializer

    def get_object(self):
        return get_invoice_payment_summary(self.kwargs["pk"])


class CustomerOutstandingView(generics.RetrieveAPIView):
    """
    GET /billing/customers/<pk>/outstanding/
    Returns total outstanding balance for a specific customer
    across all their confirmed invoices.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        summary = get_customer_outstanding(customer_id=self.kwargs["pk"])
        serializer = CustomerOutstandingSerializer(summary)
        return Response(serializer.data)


class CustomerOutstandingListView(generics.ListAPIView):
    """
    GET /billing/customers/outstanding/
    Lists all customers who have credit_outstanding > 0.

    Query params:
        search          : customer name or code (partial match)
        payment_status  : unpaid | partial
        min_outstanding : minimum total outstanding
        max_outstanding : maximum total outstanding
    """
    permission_classes = [IsAuthenticated]
    serializer_class = CustomerWithOutstandingSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_customers_with_outstanding(
            search          = p.get("search"),
            customer_name   = p.get("customer_name"),
            customer_code   = p.get("customer_code"),
            payment_status  = p.get("payment_status"),
            min_outstanding = p.get("min_outstanding"),
            max_outstanding = p.get("max_outstanding"),
        )


# ---------------------------------------------------------------------------
# Invoice filtering
# ---------------------------------------------------------------------------

from .selectors import get_filtered_invoices


class InvoiceFilteredListView(generics.ListAPIView):
    """
    GET /billing/invoices/search/
    Master invoice list with all filters combined.

    Query params:
        status          : draft | confirmed | returned | partial
        customer_name   : partial match
        customer_code   : partial match
        bill_number     : partial match
        date            : YYYY-MM-DD  (exact day)
        date_from       : YYYY-MM-DD
        date_to         : YYYY-MM-DD
        payment_status  : unpaid | partial | paid
        min_amount      : minimum grand_total
        max_amount      : maximum grand_total
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = InvoiceReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_filtered_invoices(
            status         = p.get("status"),
            customer_name  = p.get("customer_name"),
            customer_code  = p.get("customer_code"),
            bill_number    = p.get("bill_number"),
            date           = p.get("date"),
            date_from      = p.get("date_from"),
            date_to        = p.get("date_to"),
            payment_status = p.get("payment_status"),
            min_amount     = p.get("min_amount"),
            max_amount     = p.get("max_amount"),
        )


class ConfirmedInvoiceListView(generics.ListAPIView):
    """
    GET /billing/invoices/confirmed/
    Dedicated confirmed invoices endpoint with same filter params.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = InvoiceReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_filtered_invoices(
            status         = Invoice.Status.CONFIRMED,
            customer_name  = p.get("customer_name"),
            customer_code  = p.get("customer_code"),
            bill_number    = p.get("bill_number"),
            date           = p.get("date"),
            date_from      = p.get("date_from"),
            date_to        = p.get("date_to"),
            payment_status = p.get("payment_status"),
            min_amount     = p.get("min_amount"),
            max_amount     = p.get("max_amount"),
        )


# ---------------------------------------------------------------------------
# PDF views
# ---------------------------------------------------------------------------

from django.http import HttpResponse, FileResponse
from rest_framework.views import APIView

from .pdf_service import (
    delete_saved_pdf,
    generate_invoice_pdf_bytes,
    get_saved_pdfs_for_invoice,
    save_invoice_pdf,
)
from .serializers import SavedInvoicePDFSerializer, SavePDFRequestSerializer


class InvoicePrintView(APIView):
    """
    GET /billing/invoices/<pk>/print/?is_draft=true|false

    Streams the PDF directly to the client — nothing saved to disk.
    - is_draft=true  → shows DRAFT watermark (all authenticated users)
    - is_draft=false → clean invoice (admin/superuser only)

    Browser/Postman receives the PDF bytes; print dialog is triggered
    client-side by setting Content-Disposition: inline.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        is_draft_param = request.query_params.get("is_draft", "false").lower() == "true"

        # Normal users can ONLY print draft-watermarked version
        if not is_draft_param and not request.user.is_staff:
            return Response(
                {"detail": "Normal users can only print the draft version."},
                status=status.HTTP_403_FORBIDDEN,
            )

        pdf_bytes, filename = generate_invoice_pdf_bytes(
            invoice_id=pk,
            is_draft=is_draft_param,
        )
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        # inline = browser shows it / triggers print dialog; not a download
        response["Content-Disposition"] = f'inline; filename="{filename}"'
        return response


class InvoiceSavePDFView(generics.CreateAPIView):
    """
    POST /billing/invoices/<pk>/pdf/save/
    Saves the PDF to disk and creates a SavedInvoicePDF record.
    Admin + superuser only.

    Body:
        file_name : string (optional, defaults to bill number)
        is_draft  : bool   (default false)

    Returns the SavedInvoicePDF record with file_url.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = SavePDFRequestSerializer

    def create(self, request, pk):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data

        # Default file name = bill number
        from .selectors import get_invoice_by_id as _get
        invoice   = _get(pk)
        file_name = d.get("file_name") or invoice.bill_number

        saved = save_invoice_pdf(
            invoice_id=pk,
            file_name=file_name,
            is_draft=False,   # save always produces clean confirmed PDF
            user=request.user,
        )
        return Response(
            SavedInvoicePDFSerializer(saved, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class InvoiceSavedPDFListView(generics.ListAPIView):
    """
    GET /billing/invoices/<pk>/pdf/
    Lists all saved PDFs for an invoice. Admin + superuser only.
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = SavedInvoicePDFSerializer

    def get_queryset(self):
        return get_saved_pdfs_for_invoice(self.kwargs["pk"])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["request"] = self.request
        return ctx


class SavedPDFDeleteView(generics.DestroyAPIView):
    """
    DELETE /billing/pdf/<saved_pdf_id>/
    Soft-deletes the record and removes the file from disk.
    Admin + superuser only.
    """
    permission_classes = [IsAdminOrSuperuser]

    def destroy(self, request, saved_pdf_id):
        delete_saved_pdf(saved_pdf_id=saved_pdf_id, user=request.user)
        return Response({"detail": "PDF deleted."}, status=status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# All outstanding invoices
# ---------------------------------------------------------------------------

from .selectors import get_all_outstanding_invoices


class AllOutstandingInvoicesView(generics.ListAPIView):
    """
    GET /billing/invoices/outstanding/
    All invoices with credit_outstanding > 0, across ALL customers.

    Query params:
        customer_name   : partial match on customer name
        customer_code   : partial match on customer code
        payment_status  : unpaid | partial
        date_from       : YYYY-MM-DD
        date_to         : YYYY-MM-DD
        min_outstanding : minimum credit_outstanding
        max_outstanding : maximum credit_outstanding

    Results sorted by highest outstanding first.
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = InvoiceReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_all_outstanding_invoices(
            customer_name   = p.get("customer_name"),
            customer_code   = p.get("customer_code"),
            payment_status  = p.get("payment_status"),
            date_from       = p.get("date_from"),
            date_to         = p.get("date_to"),
            min_outstanding = p.get("min_outstanding"),
            max_outstanding = p.get("max_outstanding"),
        )


# ---------------------------------------------------------------------------
# Global billing payment search
# ---------------------------------------------------------------------------

from .selectors import get_all_invoice_payments


class AllInvoicePaymentsView(generics.ListAPIView):
    """
    GET /billing/payments/
    Search all billing payments across all invoices.

    Query params:
        reference     : PAY reference number (partial match)
        customer_name : partial match
        customer_code : partial match
        method        : cash | jazzcash | easypaisa | bank
        date_from     : YYYY-MM-DD
        date_to       : YYYY-MM-DD
    """
    permission_classes = [IsAuthenticated]
    serializer_class   = PaymentReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_all_invoice_payments(
            reference     = p.get("reference"),
            customer_name = p.get("customer_name"),
            customer_code = p.get("customer_code"),
            method        = p.get("method"),
            date_from     = p.get("date_from"),
            date_to       = p.get("date_to"),
        )