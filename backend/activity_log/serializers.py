from rest_framework import serializers

from .models import ActivityEvent, ActivityStatsFlow


class ActivityEventReadSerializer(serializers.ModelSerializer):
    user_email     = serializers.CharField(source="user.email", read_only=True, default=None)
    user_name      = serializers.CharField(source="user.full_name", read_only=True, default=None)
    action_display = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = ActivityEvent
        fields = [
            "id", "user_email", "user_name", "action", "action_display",
            "app_label", "model_name", "object_id", "object_repr",
            "description", "changed_fields", "metadata", "created_at",
        ]
        read_only_fields = fields


class ActivityStatsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityStatsFlow
        fields = [
            "total_events", "total_creates", "total_updates",
            "total_deletes", "total_state_changes", "last_event_at",
        ]
        read_only_fields = fields
