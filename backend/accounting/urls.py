from django.urls import path

from .views import APAgingListView, ARAgingListView, FixedAssetRegisterListView

urlpatterns = [
    path("ar-aging/", ARAgingListView.as_view(), name="ar-aging-list"),
    path("ap-aging/", APAgingListView.as_view(), name="ap-aging-list"),
    path("fixed-asset-register/", FixedAssetRegisterListView.as_view(), name="fixed-asset-register-list"),
]
