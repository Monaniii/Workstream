from django.urls import path, include
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
    path("api/auth/", include("tenants.urls")),
    path("api/tenants/", include("tenants.urls")),
    path("api/projects/", include("projects.urls")),
    path("api/issues/", include("issues.urls")),
    path("api/billing/", include("billing.urls")),
    path("api/webhooks/", include("webhooks.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/reports/", include("reports.urls")),
    path("api/audit/", include("audit.urls")),
]
