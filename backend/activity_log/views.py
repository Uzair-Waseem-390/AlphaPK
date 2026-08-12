from rest_framework import generics
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsSuperuserOnly
from .selectors import get_activity_events, get_activity_stats
from .serializers import ActivityEventReadSerializer, ActivityStatsSerializer


class ActivityEventListView(generics.ListAPIView):
    """
    GET /activity-log/events/
    Filters: user_id, action, app_label, model_name, search, date_from,
    date_to, high_risk=true. Superuser only.
    """
    permission_classes = [IsSuperuserOnly]
    serializer_class = ActivityEventReadSerializer

    def get_queryset(self):
        p = self.request.query_params
        return get_activity_events(
            user_id    = p.get("user_id"),
            action     = p.get("action"),
            app_label  = p.get("app_label"),
            model_name = p.get("model_name"),
            search     = p.get("search"),
            date_from  = p.get("date_from"),
            date_to    = p.get("date_to"),
            high_risk  = p.get("high_risk") in ("true", "1", "True"),
        )


class ActivityStatsView(APIView):
    """GET /activity-log/stats/ — O(1) singleton read. Superuser only."""
    permission_classes = [IsSuperuserOnly]

    def get(self, request):
        stats = get_activity_stats()
        return Response(ActivityStatsSerializer(stats).data)
