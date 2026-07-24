from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsAdminOrSuperuser
from .selectors import get_all_tax_payments, get_tax_payment_by_id, get_tax_stats
from .serializers import (
    TaxPaymentReadSerializer,
    TaxPaymentWriteSerializer,
    TaxStatsSerializer,
)
from .services import create_tax_payment, delete_tax_payment


# ---------------------------------------------------------------------------
# Tax position stats
# ---------------------------------------------------------------------------

class TaxStatsView(APIView):
    """
    GET /taxes/stats/
    Returns the store's current sales-tax (GST) and withholding-tax (WHT)
    position. No runtime aggregation — reads from the pre-synced TaxFlow model.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request):
        stats = get_tax_stats()
        serializer = TaxStatsSerializer(stats)
        return Response(serializer.data)


# ---------------------------------------------------------------------------
# TaxPayment
# ---------------------------------------------------------------------------

class TaxPaymentListCreateView(generics.ListCreateAPIView):
    """
    GET  /taxes/payments/  — all GST payments made to FBR, newest first
    POST /taxes/payments/  — record a new GST payment (deducts cash_in_hand)

    Filter params for GET:
        search, date_from, date_to, min_amount, max_amount
    """
    permission_classes = [IsAdminOrSuperuser]

    def get_serializer_class(self):
        return TaxPaymentWriteSerializer if self.request.method == "POST" else TaxPaymentReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_all_tax_payments(
            search     = p.get("search"),
            date_from  = p.get("date_from"),
            date_to    = p.get("date_to"),
            min_amount = p.get("min_amount"),
            max_amount = p.get("max_amount"),
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        obj = create_tax_payment(
            amount       = d["amount"],
            payment_date = d["payment_date"],
            note         = d.get("note", ""),
            user         = request.user,
        )
        return Response(TaxPaymentReadSerializer(obj).data, status=status.HTTP_201_CREATED)


class TaxPaymentRetrieveDestroyView(generics.RetrieveDestroyAPIView):
    """
    GET    /taxes/payments/<pk>/
    DELETE /taxes/payments/<pk>/
    """
    permission_classes = [IsAdminOrSuperuser]
    serializer_class   = TaxPaymentReadSerializer

    def get_object(self):
        return get_tax_payment_by_id(self.kwargs["pk"])

    def destroy(self, request, *args, **kwargs):
        delete_tax_payment(pk=self.kwargs["pk"], user=request.user)
        return Response({"detail": "Tax payment deleted and cash in hand restored."}, status=status.HTTP_200_OK)
