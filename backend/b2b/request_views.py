import uuid as uuidlib
from functools import cached_property

from rest_framework import generics, status as http
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import SignedPartnerAuthentication
from .models import PartnerRateAccess
from .permissions import IsAdminOrSuperuser, IsSignedPartner
from .request_selectors import (
    get_current_prices, get_purchase_request, get_requests_for_partner,
    get_stock_levels, list_purchase_requests,
)
from .request_serializers import (
    AcceptRequestSerializer, DecisionSerializer, PurchaseRequestDetailSerializer,
    PurchaseRequestListSerializer, RequestableProductSerializer, SubmitRequestSerializer,
)
from .request_services import (
    accept_purchase_request, cancel_purchase_request, deny_purchase_request,
    submit_purchase_request,
)
from .selectors import get_partner_access, get_shared_rate_list
from .views import ProviderOnlyMixin

MAX_DECISION_LOOKUP = 100


# ---------------------------------------------------------------------------
# Partner-facing — signed requests from another software (no user login)
# ---------------------------------------------------------------------------

class PartnerProductSearchView(generics.ListAPIView):
    """
    GET /b2b/partner/products/?search=&page=&page_size=
    The products a partner may put in a purchase request: PRICED, non-deleted
    products only (code + name; never any quantity). The selling price is only
    included when this partner's rate-list access is approved — otherwise null.
    """
    authentication_classes = [SignedPartnerAuthentication]
    permission_classes = [IsSignedPartner]
    serializer_class = RequestableProductSerializer

    def get_queryset(self):
        return get_shared_rate_list(search=self.request.query_params.get("search"))

    @cached_property
    def rates_allowed(self):
        access = get_partner_access(self.request.user.partner_name)
        return bool(access and access.status == PartnerRateAccess.Status.APPROVED)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["rates_allowed"] = self.rates_allowed
        return context

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        response.data["rates_allowed"] = self.rates_allowed
        return response


class PartnerPurchaseRequestsView(APIView):
    """
    POST /b2b/partner/purchase-requests/   submit (safe to repeat for the same request_uuid)
    GET  /b2b/partner/purchase-requests/?uuids=a,b,c   the decisions the partner is waiting on
    """
    authentication_classes = [SignedPartnerAuthentication]
    permission_classes = [IsSignedPartner]

    def post(self, request):
        serializer = SubmitRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        purchase_request, created = submit_purchase_request(
            partner_name=request.user.partner_name,
            request_uuid=data["request_uuid"], note=data["note"], items=data["items"],
        )
        return Response(
            {"request_uuid": str(purchase_request.request_uuid), "status": purchase_request.status},
            status=http.HTTP_201_CREATED if created else http.HTTP_200_OK,
        )


class PartnerDecisionsView(generics.ListAPIView):
    authentication_classes = [SignedPartnerAuthentication]
    permission_classes = [IsSignedPartner]
    serializer_class = DecisionSerializer

    def get_queryset(self):
        raw = (self.request.query_params.get("uuids") or "").split(",")
        parsed = []
        for part in raw[:MAX_DECISION_LOOKUP]:
            try:
                parsed.append(uuidlib.UUID(part.strip()))
            except ValueError:
                continue
        return get_requests_for_partner(self.request.user.partner_name, parsed)


class PartnerCancelRequestView(APIView):
    """POST /b2b/partner/purchase-requests/<uuid>/cancel/ — only a still-pending request cancels."""
    authentication_classes = [SignedPartnerAuthentication]
    permission_classes = [IsSignedPartner]

    def post(self, request, request_uuid):
        purchase_request = cancel_purchase_request(
            partner_name=request.user.partner_name, request_uuid=request_uuid,
        )
        return Response({"status": purchase_request.status if purchase_request else "not_found"})


# ---------------------------------------------------------------------------
# Admin-facing
# ---------------------------------------------------------------------------

class PurchaseRequestListView(ProviderOnlyMixin, generics.ListAPIView):
    """GET /b2b/purchase-requests/?status= — incoming requests, newest first (cancelled ones hidden)."""
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = PurchaseRequestListSerializer

    def get_queryset(self):
        return list_purchase_requests(status=self.request.query_params.get("status"))


class PurchaseRequestDetailView(ProviderOnlyMixin, APIView):
    """
    GET /b2b/purchase-requests/<id>/
    Everything the partner sent EXCEPT shelves (those never leave the partner),
    plus — while pending — our live stock and current price per item.
    """
    permission_classes = [IsAdminOrSuperuser]

    def get(self, request, pk):
        purchase_request = get_purchase_request(pk)
        if purchase_request is None:
            raise NotFound("Request not found.")
        context = {}
        if purchase_request.status == purchase_request.Status.PENDING:
            product_ids = [item.product_id for item in purchase_request.items.all()]
            context = {"stock": get_stock_levels(product_ids), "prices": get_current_prices(product_ids)}
        return Response(PurchaseRequestDetailSerializer(purchase_request, context=context).data)


class PurchaseRequestAcceptView(ProviderOnlyMixin, APIView):
    """POST /b2b/purchase-requests/<id>/accept/ — quantities + shelves per item; all or nothing."""
    permission_classes = [IsAdminOrSuperuser]

    def post(self, request, pk):
        serializer = AcceptRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        accept_purchase_request(request_id=pk, items=serializer.validated_data["items"], user=request.user)
        purchase_request = get_purchase_request(pk)
        return Response(PurchaseRequestDetailSerializer(purchase_request).data)


class PurchaseRequestDenyView(ProviderOnlyMixin, APIView):
    """POST /b2b/purchase-requests/<id>/deny/"""
    permission_classes = [IsAdminOrSuperuser]

    def post(self, request, pk):
        deny_purchase_request(request_id=pk, user=request.user)
        return Response(PurchaseRequestDetailSerializer(get_purchase_request(pk)).data)
