from django.contrib import admin

from .models import PartnerRateAccess, PartnerRateAccessEvent


@admin.register(PartnerRateAccess)
class PartnerRateAccessAdmin(admin.ModelAdmin):
    list_display = ("partner_name", "status", "requested_at", "status_changed_at", "decided_by")
    list_filter = ("status",)
    search_fields = ("partner_name",)
    readonly_fields = ("partner_name", "status", "requested_at", "status_changed_at", "decided_by")


@admin.register(PartnerRateAccessEvent)
class PartnerRateAccessEventAdmin(admin.ModelAdmin):
    list_display = ("access", "from_status", "to_status", "actor", "at")
    readonly_fields = ("access", "from_status", "to_status", "actor", "at")
