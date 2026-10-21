from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProjectViewSet, BoardViewSet, SprintViewSet

router = DefaultRouter()
router.register(r"boards", BoardViewSet, basename="board")
router.register(r"sprints", SprintViewSet, basename="sprint")
router.register(r"", ProjectViewSet, basename="project")

urlpatterns = [
    path("", include(router.urls)),
]
