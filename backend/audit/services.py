import re
from django.db import transaction
from django.utils import timezone

from .models import AuditEvent


# Field names whose values must never be stored in an audit record.
SENSITIVE_FIELD_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in [
        r"password",
        r"passwd",
        r"\bpwd\b",
        r"secret",
        r"token",
        r"api.?key",
        r"authorization",
        r"credential",
        r"private.?key",
        r"access.?token",
        r"refresh.?token",
        r"session.?id",
        r"csrf",
        r"cookie",
        r"stripe.?secret",
    ]
]

# Maximum serialized size (bytes) for a single metadata blob.
MAX_METADATA_SIZE = 10 * 1024


def is_sensitive_field(name):
    """Return True if a field name matches a sensitive-value pattern."""
    if not isinstance(name, str):
        return False
    return any(pattern.search(name) for pattern in SENSITIVE_FIELD_PATTERNS)


def redact_scalar(value):
    """Redact a single scalar value when its field is sensitive."""
    return "[REDACTED]"


def redact_value(field_name, value):
    """Return a sanitized representation of ``value`` for ``field_name``."""
    if is_sensitive_field(field_name):
        return "[REDACTED]"
    if isinstance(value, dict):
        return redact_dict(value)
    if isinstance(value, list):
        return redact_list(value)
    return value


def redact_list(items, depth=0):
    if depth > 3:
        return "[TRUNCATED]"
    if not isinstance(items, list):
        return items
    out = []
    for item in items[:50]:
        if isinstance(item, dict):
            out.append(redact_dict(item, depth + 1))
        elif isinstance(item, list):
            out.append(redact_list(item, depth + 1))
        else:
            out.append(item)
    return out


def redact_dict(data, depth=0):
    """Recursively redact sensitive fields from a metadata/changes dict."""
    if depth > 3:
        return "[TRUNCATED]"
    if not isinstance(data, dict):
        return data
    result = {}
    for key, value in data.items():
        if is_sensitive_field(key):
            result[key] = "[REDACTED]"
            continue
        if isinstance(value, dict):
            # Handle before/after change summaries: {"from": ..., "to": ...}.
            if set(value.keys()) <= {"from", "to"} and len(value) <= 2:
                result[key] = {
                    sub_key: redact_value(sub_key, sub_value)
                    for sub_key, sub_value in value.items()
                }
            else:
                result[key] = redact_dict(value, depth + 1)
        elif isinstance(value, list):
            result[key] = redact_list(value, depth + 1)
        else:
            result[key] = value
    return result


def truncate_metadata(metadata):
    """Bound metadata size so oversized payloads cannot bloat the audit store."""
    if not isinstance(metadata, dict):
        return {}
    import json

    try:
        serialized = json.dumps(metadata, default=str)
    except (TypeError, ValueError):
        return {}
    if len(serialized) <= MAX_METADATA_SIZE:
        return metadata
    return {"_truncated": True, "note": "metadata exceeded size limit"}


class AuditService:
    """Central interface for recording audit events.

    Application layers call ``log_event`` to record an outcome once it is
    known. For database mutations observed inside a transaction, callers
    should schedule recording with ``log_on_commit`` so a rolled-back
    transaction never produces a misleading successful-change event.
    Security-critical events (e.g. access denied) should be recorded with
    ``log_security_event`` in an independent transaction so they survive a
    business-transaction rollback.
    """

    @classmethod
    def log_event(cls, *, actor=None, actor_type=None, actor_name="",
                  actor_email="", workspace=None, action, module,
                  resource_type="", resource_id="", resource_name="",
                  description="", outcome=AuditEvent.Outcome.SUCCESS,
                  changed_fields=None, request_id="", http_method="",
                  route="", ip_address=None, user_agent="", session_key="",
                  metadata=None):
        """Create and return an :class:`AuditEvent` record."""
        changed_fields = redact_dict(changed_fields or {})
        metadata = truncate_metadata(redact_dict(metadata or {}))

        if actor is not None and actor_type is None:
            actor_type = AuditEvent.ActorType.USER
        elif actor is None and actor_type is None:
            actor_type = AuditEvent.ActorType.SYSTEM

        if actor is not None and not actor_name:
            actor_name = (
                getattr(actor, "get_full_name", lambda: actor.email)()
                or getattr(actor, "email", "")
                or str(actor)
            )
        if actor is not None and not actor_email:
            actor_email = getattr(actor, "email", "") or ""

        event = AuditEvent.objects.create(
            actor=actor,
            actor_type=actor_type,
            actor_name=actor_name[:255],
            actor_email=actor_email[:254],
            workspace=workspace,
            action=action,
            module=module,
            resource_type=resource_type[:100],
            resource_id=str(resource_id)[:255] if resource_id is not None else "",
            resource_name=resource_name[:255],
            description=description[:1000],
            outcome=outcome,
            changed_fields=changed_fields,
            request_id=request_id[:255],
            http_method=http_method[:10],
            route=route[:500],
            ip_address=ip_address,
            user_agent=user_agent[:500],
            session_key=session_key[:255],
            metadata=metadata,
        )
        return event

    @classmethod
    def log_on_commit(cls, func, *args, **kwargs):
        """Schedule ``func`` to run only when the current transaction commits.

        If no transaction is active, the function runs immediately.
        """

        def record():
            return func(*args, **kwargs)

        transaction.on_commit(record)

    @classmethod
    def log_security_event(cls, *, actor=None, workspace=None, action, module,
                           resource_type="", resource_id="", resource_name="",
                           description="", outcome=AuditEvent.Outcome.DENIED,
                           changed_fields=None, request_id="", http_method="",
                           route="", ip_address=None, user_agent="",
                           session_key="", metadata=None,
                           actor_type=AuditEvent.ActorType.USER,
                           actor_name="", actor_email=""):
        """Record a security-critical event in its own transaction.

        The record is persisted independently of any enclosing business
        transaction so it survives rollback.
        """
        with transaction.atomic():
            return cls.log_event(
                actor=actor,
                actor_type=actor_type,
                actor_name=actor_name,
                actor_email=actor_email,
                workspace=workspace,
                action=action,
                module=module,
                resource_type=resource_type,
                resource_id=resource_id,
                resource_name=resource_name,
                description=description,
                outcome=outcome,
                changed_fields=changed_fields,
                request_id=request_id,
                http_method=http_method,
                route=route,
                ip_address=ip_address,
                user_agent=user_agent,
                session_key=session_key,
                metadata=metadata,
            )
