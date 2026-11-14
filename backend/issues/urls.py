from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    IssueAttachmentViewSet,
    IssueCommentViewSet,
    IssueStatusViewSet,
    IssueViewSet,
)

router = DefaultRouter()
# Register the more specific "statuses" prefix first: the empty-prefix
# detail route (^(?P<pk>[^/.]+)/$) would otherwise swallow /statuses/.
router.register(r"statuses", IssueStatusViewSet, basename="issue-status")
router.register(r"comments", IssueCommentViewSet, basename="issue-comment")
router.register(r"attachments", IssueAttachmentViewSet, basename="issue-attachment")
router.register(r"", IssueViewSet, basename="issue")

urlpatterns = [
    path("", include(router.urls)),
]
