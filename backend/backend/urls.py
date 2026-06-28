from django.contrib import admin
from django.urls import path, include
from users.urls import auth_urlpatterns, user_urlpatterns

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/auth/", include((auth_urlpatterns, "auth"))),
    path("api/users/", include((user_urlpatterns, "users"))),
    path("api/", include("purchases.urls")),
    path("api/rates/", include("rates.urls")),
    path("api/billing/", include("billing.urls")),
]


# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)