from django.utils.deprecation import MiddlewareMixin

# Path prefixes whose requests are never audited by middleware to avoid
# recording audit-store traffic or noisy internal traffic.
AUDIT_IGNORE_PATH_PREFIXES = (
    "/api/audit/",
    "/api/schema/",
    "/api/docs/",
    "/api/redoc/",
    "/admin/",
    "/static/",
    "/media/",
    "/favicon.ico",
)


class AuditMiddleware(MiddlewareMixin):
    """Attach a lightweight audit context to each request.

    The context (correlation id, client IP, user agent, method, route) is
    consumed by view-layer audit logging calls. Middleware itself does not
    write audit records to avoid duplicating events observed at the service
    layer.
    """

    def process_request(self, request):
        request.audit_context = {
            "request_id": request.headers.get("X-Request-ID") or "",
            "ip_address": self._client_ip(request),
            "user_agent": request.headers.get("User-Agent", "")[:500],
            "http_method": request.method or "",
            "route": self._sanitize_route(request.get_full_path())[:500],
        }
        return None

    @staticmethod
    def _client_ip(request):
        x_forwarded_for = request.headers.get("X-Forwarded-For")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip() or None
        remote = getattr(request, "META", {}).get("REMOTE_ADDR")
        return remote or None

    @staticmethod
    def _sanitize_route(path):
        """Drop common query parameters that may carry sensitive data."""
        if not path:
            return ""
        return path.split("?")[0]
