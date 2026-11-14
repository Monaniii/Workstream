import stripe
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from tenants.permissions import TenantAccessPermission, IsWorkspaceAdmin
from .models import SubscriptionPlan, Subscription, Invoice
from .serializers import (
    SubscriptionPlanSerializer,
    SubscriptionSerializer,
    InvoiceSerializer,
)
from audit.services import AuditService

stripe.api_key = settings.STRIPE_SECRET_KEY


class SubscriptionPlanViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SubscriptionPlan.objects.filter(is_active=True)
    serializer_class = SubscriptionPlanSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceAdmin]


class SubscriptionViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceAdmin]

    def list(self, request):
        tenant = getattr(request, "tenant", None)
        subscription = Subscription.objects.filter(workspace=tenant).first()
        if not subscription:
            return Response(
                {"detail": "No subscription."}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(SubscriptionSerializer(subscription).data)

    @action(detail=False, methods=["post"], url_path="checkout")
    def checkout(self, request):
        tenant = getattr(request, "tenant", None)
        price_id = request.data.get("price_id")
        if not price_id:
            return Response(
                {"error": "price_id required"}, status=status.HTTP_400_BAD_REQUEST
            )
        subscription = Subscription.objects.filter(workspace=tenant).first()
        customer_id = subscription.stripe_customer_id if subscription else None
        try:
            if not customer_id:
                customer = stripe.Customer.create(
                    email=request.user.email,
                    metadata={"workspace_id": tenant.id, "workspace_slug": tenant.slug},
                )
                customer_id = customer.id
                Subscription.objects.update_or_create(
                    workspace=tenant,
                    defaults={"stripe_customer_id": customer_id},
                )
                frontend_url = settings.FRONTEND_URL
                success_url = (
                    f"{frontend_url}/billing/success?session_id="
                    "{CHECKOUT_SESSION_ID}"
                )
                session = stripe.checkout.Session.create(
                    customer=customer_id,
                    payment_method_types=["card"],
                    line_items=[{"price": price_id, "quantity": 1}],
                    mode="subscription",
                    success_url=success_url,
                    cancel_url=f"{frontend_url}/billing/cancel",
                    metadata={"workspace_id": str(tenant.id)},
                )
            ctx = getattr(request, "audit_context", {}) or {}
            AuditService.log_event(
                actor=request.user,
                workspace=tenant,
                action="subscription_change",
                module="billing",
                resource_type="subscription",
                resource_id="",
                resource_name=tenant.slug if tenant else "",
                description=f"Subscription checkout initiated for {tenant.slug if tenant else 'workspace'}",
                outcome="success",
                request_id=ctx.get("request_id", ""),
                http_method=request.method,
                route=ctx.get("route", ""),
                ip_address=ctx.get("ip_address"),
                user_agent=ctx.get("user_agent", ""),
                metadata={"price_id": price_id, "session_id": session.id},
            )
            return Response({"checkout_url": session.url, "session_id": session.id})
        except stripe.error.StripeError as exc:
            ctx = getattr(request, "audit_context", {}) or {}
            AuditService.log_security_event(
                actor=request.user,
                workspace=tenant,
                action="subscription_change",
                module="billing",
                resource_type="subscription",
                resource_id="",
                description=f"Subscription checkout failed for {tenant.slug if tenant else 'workspace'}",
                outcome="failure",
                request_id=ctx.get("request_id", ""),
                http_method=request.method,
                route=ctx.get("route", ""),
                ip_address=ctx.get("ip_address"),
                user_agent=ctx.get("user_agent", ""),
                metadata={"price_id": price_id, "error": str(exc)[:200]},
            )
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=["post"], url_path="portal")
    def portal(self, request):
        tenant = getattr(request, "tenant", None)
        subscription = get_object_or_404(Subscription, workspace=tenant)
        try:
            session = stripe.billingportal.Session.create(
                customer=subscription.stripe_customer_id,
                return_url=f"{settings.FRONTEND_URL}/billing",
            )
            return Response({"portal_url": session.url})
        except stripe.error.StripeError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated, TenantAccessPermission, IsWorkspaceAdmin]

    def get_queryset(self):
        tenant = getattr(self.request, "tenant", None)
        return Invoice.objects.filter(workspace=tenant)
