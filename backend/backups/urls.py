from django.urls import path

from .views import (
    FullLocalBackupView,
    IncrementalLocalBackupView,
    FullRemoteBackupView,
    IncrementalRemoteBackupView,
)

urlpatterns = [
    path("full/local/",        FullLocalBackupView.as_view(),        name="backup-full-local"),
    path("incremental/local/", IncrementalLocalBackupView.as_view(), name="backup-incremental-local"),
    path("full/remote/",       FullRemoteBackupView.as_view(),       name="backup-full-remote"),
    path("incremental/remote/", IncrementalRemoteBackupView.as_view(), name="backup-incremental-remote"),
]
