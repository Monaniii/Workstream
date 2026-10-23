from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
import stripe
from django.conf import settings
from django.db import transaction
from .models import Subscription, Invoice, ProcessedStripeEvent
from tenants.models import Workspace
from audit.services import AuditService
from audit.models import AuditEvent


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookView(View):
    def post(self, request, *args, **kwargs):
        payload = request.body
        sig_header = request.headers.get("Stripe-Signature", "")
        endpoint_secret = settings.STRIPE_WEBHOOK_SECRET
        event = None
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        except (ValueError, stripe.error.SignatureVerificationError):
            return HttpResponse(status=400)

        # Idempotency: skip already-processed events
        stripe_event_id = event.get("id", "")
        if ProcessedStripeEvent.objects.filter(stripe_event_id=stripe_event_id).exists():
            return HttpResponse(status=200)

        event_type = event.get("type", "")

        try:
            with transaction.atomic():
                # Mark event as processed first (idempotency lock)
                ProcessedStripeEvent.objects.create(
                    stripe_event_id=stripe_event_id,
                    event_type=event_type,
                )

                if event_type == "checkout.session.completed":
                    self._handle_checkout_completed(event)
                elif event_type == "customer.subscription.updated":
                    self._handle_subscription_updated(event)
                elif event_type == "customer.subscription.deleted":
                    self._handle_subscription_deleted(event)
                elif event_type == "invoice.payment_succeeded":
                    self._handle_invoice_payment_succeeded(event)
        except Exception:
            # If processing fails, delete the idempotency record so the event
            # can be retried on the next webhook delivery
            ProcessedStripeEvent.objects.filter(
                stripe_event_id=stripe_event_id
            ).delete()
            raise

        return HttpResponse(status=200)

    def _handle_checkout_completed(self, event):
        session = event["data"]["object"]
        workspace_id = session.get("metadata", {}).get("workspace_id")
        if workspace_id:
            try:
                workspace = Workspace.objects.get(id=workspace_id)
                subscription = Subscription.objects.get(workspace=workspace)
                subscription.stripe_subscription_id = session.get("subscription")
                subscription.status = "active"
                subscription.save(
                    update_fields=["stripe_subscription_id", "status"]
                )
                AuditService.log_security_event(
                    actor=None,
                    workspace=workspace,
                    action="subscription_change",
                    module="billing",
                    resource_type="subscription",
                    resource_id=subscription.id,
                    resource_name=workspace.slug,
                    description=f"Subscription activated via Stripe checkout for {workspace.slug}",
                    outcome="success",
                    actor_type=AuditEvent.ActorType.SYSTEM,
                    metadata={"event_type": "checkout.session.completed"},
                )
            except (Workspace.DoesNotExist, Subscription.DoesNotExist):
                pass

    def _handle_subscription_updated(self, event):
        sub = event["data"]["object"]
        try:
            subscription = Subscription.objects.get(
                stripe_subscription_id=sub.get("id")
            )
            old_status = subscription.status
            subscription.status = sub.get("status", subscription.status)
            subscription.current_period_start = sub.get(
                "current_period_start", subscription.current_period_start
            )
            subscription.current_period_end = sub.get(
                "current_period_end", subscription.current_period_end
            )
            subscription.cancel_at_period_end = sub.get(
                "cancel_at_period_end", subscription.cancel_at_period_end
            )
            subscription.save(
                update_fields=[
                    "status",
                    "current_period_start",
                    "current_period_end",
                    "cancel_at_period_end",
                ]
            )
            workspace = subscription.workspace
            AuditService.log_security_event(
                actor=None,
                workspace=workspace,
                action="subscription_change",
                module="billing",
                resource_type="subscription",
                resource_id=subscription.id,
                resource_name=workspace.slug,
                description=(
                    f"Subscription updated via Stripe for {workspace.slug}: "
                    f"{old_status} -> {subscription.status}"
                ),
                outcome="success",
                actor_type=AuditEvent.ActorType.SYSTEM,
                changed_fields={
                    "status": {"from": old_status, "to": subscription.status}
                },
                metadata={"event_type": "customer.subscription.updated"},
            )
        except Subscription.DoesNotExist:
            pass

    def _handle_subscription_deleted(self, event):
        sub = event["data"]["object"]
        try:
            subscription = Subscription.objects.get(
                stripe_subscription_id=sub.get("id")
            )
            workspace = subscription.workspace
            subscription.status = "canceled"
            subscription.save(update_fields=["status"])
            AuditService.log_security_event(
                actor=None,
                workspace=workspace,
                action="subscription_change",
                module="billing",
                resource_type="subscription",
                resource_id=subscription.id,
                resource_name=workspace.slug,
                description=f"Subscription canceled via Stripe for {workspace.slug}",
                outcome="success",
                actor_type=AuditEvent.ActorType.SYSTEM,
                metadata={"event_type": "customer.subscription.deleted"},
            )
        except Subscription.DoesNotExist:
            pass

    def _handle_invoice_payment_succeeded(self, event):
        inv = event["data"]["object"]
        try:
            subscription = Subscription.objects.get(
                stripe_subscription_id=inv.get("subscription")
            )
            workspace = subscription.workspace
            Invoice.objects.update_or_create(
                stripe_invoice_id=inv.get("id"),
                defaults={
                    "workspace": subscription.workspace,
                    "subscription": subscription,
                    "amount": inv.get("amount_paid", 0),
                    "currency": inv.get("currency", "usd"),
                    "status": inv.get("status", ""),
                    "paid_at": (
                        inv.get("status_transitions", {}).get("paid_at")
                        if inv.get("status_transitions")
                        else None
                    ),
                },
            )
            AuditService.log_security_event(
                actor=None,
                workspace=workspace,
                action="invoice_paid",
                module="billing",
                resource_type="invoice",
                resource_id=inv.get("id", ""),
                resource_name=workspace.slug,
                description=f"Invoice paid via Stripe for {workspace.slug}",
                outcome="success",
                actor_type=AuditEvent.ActorType.SYSTEM,
                metadata={
                    "event_type": "invoice.payment_succeeded",
                    "amount": inv.get("amount_paid", 0),
                    "currency": inv.get("currency", "usd"),
                },
            )
        except Subscription.DoesNotExist:
            pass
