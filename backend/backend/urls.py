from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from users.urls import auth_urlpatterns, user_urlpatterns
 
urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/",      include((auth_urlpatterns, "auth"))),
    path("api/users/",     include((user_urlpatterns, "users"))),
    path("api/",           include("purchases.urls")),     # categories, shelves, suppliers, products, orders, inventory
    path("api/rates/",     include("rates.urls")),
    path("api/billing/",   include("billing.urls")),
    path("api/cash-flow/", include("cash_flow.urls")),
    path("api/ledger/",    include("ledger.urls")),
    path("api/reports/",   include("reports.urls")),
    path("api/data-entry/", include("data_entry.urls")),
]
 
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)