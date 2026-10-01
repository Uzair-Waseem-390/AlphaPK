from rest_framework import generics
from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from . import config
from .authentication import SignedPartnerAuthentication
from .models import PartnerRateAccess
from .permissions import IsAdminOrSuperuser, IsSignedPartner
from .selectors import get_partner_access, get_shared_rate_list, list_partner_requests
from .serializers import PartnerAccessSerializer, SharedRateSerializer
from .services import decide_access, request_access

NOT_REQUESTED = "not_requested"


class ProviderOnlyMixin:
    """The whole provider half is switched off (404) unless B2B_PROVIDER_ENABLED."""

    def initial(self, request, *args, **kwargs):
        if not config.provider_enabled():
            raise NotFound()
        super().initial(request, *args, **kwargs)


# ---------------------------------------------------------------------------
# Partner-facing — signed requests from another software (no user login)
# ---------------------------------------------------------------------------

class PartnerRequestView(APIView):
    """
    POST /b2b/partner/request/
    Partner asks (or asks again after a rejection / stopped share) for access
    to this software's rate list. Idempotent — returns the current status.
    """
    authentication_classes = [SignedPartnerAuthentication]
    permission_classes = [IsSignedPartner]

    def post(self, request):
        access = request_access(partner_name=request.user.partner_name)
        return Response({"status": access.status})


class PartnerRateListView(generics.ListAPIView):
    """
    GET /b2b/partner/rate-list/?search=&page=&page_size=
    One call returns the partner's current status and, only when approved, a
    page of priced products (code, name, selling price — nothing else).
    """
    authentication_classes = [SignedPartnerAuthentication]
    permission_classes = [IsSignedPartner]
    serializer_class = SharedRateSerializer

    def get_queryset(self):
        return get_shared_rate_list(search=self.request.query_params.get("search"))

    def list(self, request, *args, **kwargs):
        access = get_partner_access(request.user.partner_name)
        current = access.status if access else NOT_REQUESTED
        if current != PartnerRateAccess.Status.APPROVED:
            return Response({
                "status": current, "count": 0, "total_pages": 0,
                "current_page": 1, "page_size": self.paginator.get_page_size(request),
                "results": [],
            })
        response = super().list(request, *args, **kwargs)
        response.data["status"] = current
        return response


# ---------------------------------------------------------------------------
# Admin-facing — this software's admins manage who may see the rate list
# ---------------------------------------------------------------------------

class AccessRequestListView(ProviderOnlyMixin, generics.ListAPIView):
    """GET /b2b/requests/?status= — partner requests, newest first."""
    permission_classes = [IsAdminOrSuperuser]
    serializer_class = PartnerAccessSerializer

    def get_queryset(self):
        return list_partner_requests(status=self.request.query_params.get("status"))


class AccessRequestActionView(ProviderOnlyMixin, APIView):
    """POST /b2b/requests/<pk>/approve|reject|revoke/"""
    permission_classes = [IsAdminOrSuperuser]
    action = None  # set per route in urls.py

    def post(self, request, pk):
        access = decide_access(access_id=pk, action=self.action, user=request.user)
        return Response(PartnerAccessSerializer(access).data)
