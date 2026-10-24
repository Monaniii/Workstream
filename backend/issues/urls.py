from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import IssueViewSet, IssueStatusViewSet

router = DefaultRouter()
# Register the more specific "statuses" prefix first: the empty-prefix
# detail route (^(?P<pk>[^/.]+)/$) would otherwise swallow /statuses/.
router.register(r"statuses", IssueStatusViewSet, basename="issue-status")
router.register(r"", IssueViewSet, basename="issue")

urlpatterns = [
    path("", include(router.urls)),
]
