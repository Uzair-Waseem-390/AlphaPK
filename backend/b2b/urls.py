from django.urls import path

from .views import (
    AccessRequestActionView,
    AccessRequestListView,
    PartnerRateListView,
    PartnerRequestView,
)

urlpatterns = [
    # Partner-facing (signed requests from another software)
    path("partner/request/", PartnerRequestView.as_view(), name="b2b-partner-request"),
    path("partner/rate-list/", PartnerRateListView.as_view(), name="b2b-partner-rate-list"),

    # Admin-facing (JWT, admin / superuser)
    path("requests/", AccessRequestListView.as_view(), name="b2b-request-list"),
    path("requests/<int:pk>/approve/", AccessRequestActionView.as_view(action="approve"), name="b2b-request-approve"),
    path("requests/<int:pk>/reject/", AccessRequestActionView.as_view(action="reject"), name="b2b-request-reject"),
    path("requests/<int:pk>/revoke/", AccessRequestActionView.as_view(action="revoke"), name="b2b-request-revoke"),
]
