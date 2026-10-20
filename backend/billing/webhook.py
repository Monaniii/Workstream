from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.views import View
import stripe
from django.conf import settings
from .models import Subscription, Invoice
from tenants.models import Workspace


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

        if event.type == "checkout.session.completed":
            session = event.data.object
            workspace_id = session.metadata.get("workspace_id")
            if workspace_id:
                try:
                    workspace = Workspace.objects.get(id=workspace_id)
                    subscription = Subscription.objects.get(workspace=workspace)
                    subscription.stripe_subscription_id = session.subscription
                    subscription.status = "active"
                    subscription.save(
                        update_fields=["stripe_subscription_id", "status"]
                    )
                except (Workspace.DoesNotExist, Subscription.DoesNotExist):
                    pass

        elif event.type == "customer.subscription.updated":
            sub = event.data.object
            try:
                subscription = Subscription.objects.get(stripe_subscription_id=sub.id)
                subscription.status = sub.status
                subscription.current_period_start = sub.current_period_start
                subscription.current_period_end = sub.current_period_end
                subscription.cancel_at_period_end = sub.cancel_at_period_end
                subscription.save(
                    update_fields=[
                        "status",
                        "current_period_start",
                        "current_period_end",
                        "cancel_at_period_end",
                    ]
                )
            except Subscription.DoesNotExist:
                pass

        elif event.type == "customer.subscription.deleted":
            sub = event.data.object
            try:
                subscription = Subscription.objects.get(stripe_subscription_id=sub.id)
                subscription.status = "canceled"
                subscription.save(update_fields=["status"])
            except Subscription.DoesNotExist:
                pass

        elif event.type == "invoice.payment_succeeded":
            inv = event.data.object
            try:
                subscription = Subscription.objects.get(
                    stripe_subscription_id=inv.subscription
                )
                Invoice.objects.update_or_create(
                    stripe_invoice_id=inv.id,
                    defaults={
                        "workspace": subscription.workspace,
                        "subscription": subscription,
                        "amount": inv.amount_paid,
                        "currency": inv.currency,
                        "status": inv.status,
                        "paid_at": (
                            inv.status_transitions.paid_at
                            if inv.status_transitions
                            else None
                        ),
                    },
                )
            except Subscription.DoesNotExist:
                pass

        return HttpResponse(status=200)
