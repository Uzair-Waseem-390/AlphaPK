from django.urls import path

from .request_views import (
    PartnerCancelRequestView,
    PartnerDecisionsView,
    PartnerProductSearchView,
    PartnerPurchaseRequestsView,
    PurchaseRequestAcceptView,
    PurchaseRequestDenyView,
    PurchaseRequestDetailView,
    PurchaseRequestListView,
)
from .views import (
    AccessRequestActionView,
    AccessRequestListView,
    PartnerPingView,
    PartnerRateListView,
    PartnerRequestView,
    PartnerWakeView,
)

urlpatterns = [
    # Partner-facing (signed requests from another software)
    path("partner/request/", PartnerRequestView.as_view(), name="b2b-partner-request"),
    path("partner/rate-list/", PartnerRateListView.as_view(), name="b2b-partner-rate-list"),
    path("partner/ping/", PartnerPingView.as_view(), name="b2b-partner-ping"),
    path("partner/products/", PartnerProductSearchView.as_view(), name="b2b-partner-products"),
    path("partner/purchase-requests/", PartnerPurchaseRequestsView.as_view(), name="b2b-partner-purchase-requests"),
    path("partner/purchase-requests/decisions/", PartnerDecisionsView.as_view(), name="b2b-partner-decisions"),
    path("partner/purchase-requests/<uuid:request_uuid>/cancel/", PartnerCancelRequestView.as_view(), name="b2b-partner-cancel"),

    # Admin-facing (JWT, admin / superuser)
    path("partners/<str:partner>/wake/", PartnerWakeView.as_view(), name="b2b-partner-wake"),
    path("requests/", AccessRequestListView.as_view(), name="b2b-request-list"),
    path("requests/<int:pk>/approve/", AccessRequestActionView.as_view(action="approve"), name="b2b-request-approve"),
    path("requests/<int:pk>/reject/", AccessRequestActionView.as_view(action="reject"), name="b2b-request-reject"),
    path("requests/<int:pk>/revoke/", AccessRequestActionView.as_view(action="revoke"), name="b2b-request-revoke"),

    path("purchase-requests/", PurchaseRequestListView.as_view(), name="b2b-purchase-request-list"),
    path("purchase-requests/<int:pk>/", PurchaseRequestDetailView.as_view(), name="b2b-purchase-request-detail"),
    path("purchase-requests/<int:pk>/accept/", PurchaseRequestAcceptView.as_view(), name="b2b-purchase-request-accept"),
    path("purchase-requests/<int:pk>/deny/", PurchaseRequestDenyView.as_view(), name="b2b-purchase-request-deny"),
]
