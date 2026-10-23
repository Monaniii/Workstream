from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IssueViewSet, IssueStatusViewSet

router = DefaultRouter()
router.register(r"", IssueViewSet, basename="issue")
router.register(r"statuses", IssueStatusViewSet, basename="issue-status")

urlpatterns = [
    path("", include(router.urls)),
]
