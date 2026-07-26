from django.urls import path

from .views import BusinessWorthView

urlpatterns = [
    path("business-worth/", BusinessWorthView.as_view(), name="business-worth"),
]
