from django.urls import path

from .views import ActivityEventListView, ActivityStatsView

urlpatterns = [
    path("events/", ActivityEventListView.as_view(), name="activity-event-list"),
    path("stats/", ActivityStatsView.as_view(), name="activity-stats"),
]
