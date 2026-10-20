class TenantMiddleware:
    """Attach the current workspace (tenant) to the request based on header."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.tenant = None
        slug = request.headers.get("X-Tenant-Slug")
        if slug:
            from .models import Workspace

            try:
                workspace = Workspace.objects.get(slug=slug)
                request.tenant = workspace
            except Workspace.DoesNotExist:
                request.tenant = None
        response = self.get_response(request)
        return response
