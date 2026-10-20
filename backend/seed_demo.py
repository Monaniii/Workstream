import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.utils.text import slugify
from django.core.files.base import ContentFile
from django.utils import timezone
from datetime import timedelta

from tenants.models import Workspace, WorkspaceMember, MembershipRole
from projects.models import Project, Board, Sprint, SprintStatus
from issues.models import (
    IssueStatus, Issue, IssuePriority, IssueType, IssueComment,
    IssueAttachment, AuditLog,
)
from billing.models import SubscriptionPlan, SubscriptionStatus, Subscription, Invoice
from notifications.models import Notification, NotificationType
from webhooks.models import WebhookEndpoint, WebhookEvent, WebhookDelivery

User = get_user_model()

print("=== Seeding demo data ===")

# ---------------------------------------------------------------------------
# 1. USERS (20)
# ---------------------------------------------------------------------------
users_data = [
    ("eliezer@example.com", "eliezer", "Eliezer", "Cohen", True, True),
    ("sarah@acme.com", "sarah_connor", "Sarah", "Connor", False, True),
    ("mike@acme.com", "mike_ross", "Mike", "Ross", False, False),
    ("jessica@acme.com", "jessica_jones", "Jessica", "Jones", False, False),
    ("david@acme.com", "david_chen", "David", "Chen", False, False),
    ("lisa@acme.com", "lisa_simpson", "Lisa", "Simpson", False, False),
    ("alex@techstart.io", "alex_dev", "Alex", "Developer", False, True),
    ("maya@techstart.io", "maya_patel", "Maya", "Patel", False, False),
    ("omar@techstart.io", "omar_k", "Omar", "Khan", False, False),
    ("zara@techstart.io", "zara_ali", "Zara", "Ali", False, False),
    ("leo@globex.com", "leo_stark", "Leo", "Stark", False, True),
    ("nina@globex.com", "nina_rolls", "Nina", "Rolls", False, False),
    ("carlos@globex.com", "carlos_m", "Carlos", "Mendez", False, False),
    ("fiona@globex.com", "fiona_g", "Fiona", "Gomez", False, False),
    ("brian@globex.com", "brian_t", "Brian", "Taylor", False, False),
    ("helen@acme.com", "helen_w", "Helen", "Wilson", False, False),
    ("oscar@acme.com", "oscar_g", "Oscar", "Garcia", False, False),
    ("priya@techstart.io", "priya_s", "Priya", "Sharma", False, False),
    ("mohammed@globex.com", "mohammed_a", "Mohammed", "Al-Farsi", False, False),
    ("rachel@acme.com", "rachel_g", "Rachel", "Green", False, False),
]

users = []
for email, username, first, last, is_staff, is_superuser in users_data:
    u, created = User.objects.get_or_create(
        email=email,
        defaults={
            "username": username,
            "first_name": first,
            "last_name": last,
            "is_staff": is_staff,
            "is_superuser": is_superuser,
        },
    )
    if created:
        u.set_password("DemoPass123!")
        u.save()
    users.append(u)

print(f"Users: {User.objects.count()}")

# ---------------------------------------------------------------------------
# 2. WORKSPACES + MEMBERSHIPS
# ---------------------------------------------------------------------------
workspaces_data = [
    ("Acme Corporation", "acme-corp", "enterprise", users[0]),
    ("TechStart Labs", "techstart-labs", "business", users[6]),
    ("Globex Industries", "globex-industries", "starter", users[10]),
    ("Initech Solutions", "initech-solutions", "free", users[15]),
]

workspaces = []
for name, slug, plan, owner in workspaces_data:
    ws, created = Workspace.objects.get_or_create(
        slug=slug,
        defaults={"name": name, "owner": owner, "plan": plan},
    )
    workspaces.append(ws)

print(f"Workspaces: {Workspace.objects.count()}")

# Memberships - assign users to workspaces with roles
membership_map = [
    # Acme Corp members
    (users[0], workspaces[0], MembershipRole.ADMIN),
    (users[1], workspaces[0], MembershipRole.ADMIN),
    (users[2], workspaces[0], MembershipRole.MANAGER),
    (users[3], workspaces[0], MembershipRole.MEMBER),
    (users[4], workspaces[0], MembershipRole.MEMBER),
    (users[5], workspaces[0], MembershipRole.VIEWER),
    (users[15], workspaces[0], MembershipRole.MEMBER),
    (users[16], workspaces[0], MembershipRole.MEMBER),
    (users[19], workspaces[0], MembershipRole.VIEWER),
    # TechStart members
    (users[6], workspaces[1], MembershipRole.ADMIN),
    (users[7], workspaces[1], MembershipRole.MANAGER),
    (users[8], workspaces[1], MembershipRole.MEMBER),
    (users[9], workspaces[1], MembershipRole.MEMBER),
    (users[17], workspaces[1], MembershipRole.MEMBER),
    # Globex members
    (users[10], workspaces[2], MembershipRole.ADMIN),
    (users[11], workspaces[2], MembershipRole.MANAGER),
    (users[12], workspaces[2], MembershipRole.MEMBER),
    (users[13], workspaces[2], MembershipRole.MEMBER),
    (users[14], workspaces[2], MembershipRole.MEMBER),
    (users[18], workspaces[2], MembershipRole.VIEWER),
    # Initech members
    (users[15], workspaces[3], MembershipRole.ADMIN),
    (users[16], workspaces[3], MembershipRole.MEMBER),
]

for user, ws, role in membership_map:
    WorkspaceMember.objects.get_or_create(user=user, workspace=ws, defaults={"role": role})

print(f"WorkspaceMembers: {WorkspaceMember.objects.count()}")

# ---------------------------------------------------------------------------
# 3. PROJECTS (20)
# ---------------------------------------------------------------------------
projects_data = [
    # Acme Corp
    ("Website Redesign", "WEB", "Full corporate website overhaul", workspaces[0], users[1]),
    ("Mobile App v2", "MOB", "Next-gen mobile application", workspaces[0], users[2]),
    ("API Gateway", "API", "Unified API gateway service", workspaces[0], users[4]),
    ("Data Migration", "DAT", "Legacy data migration to cloud", workspaces[0], users[3]),
    ("Customer Portal", "CUS", "Self-service customer portal", workspaces[0], users[1]),
    # TechStart
    ("SaaS Dashboard", "SDS", "Analytics dashboard for SaaS metrics", workspaces[1], users[6]),
    ("Auth Service", "AUTH", "Authentication and authorization service", workspaces[1], users[7]),
    ("Payment Integration", "PAY", "Stripe/PayPal integration", workspaces[1], users[8]),
    ("Real-time Chat", "CHT", "WebSocket chat module", workspaces[1], users[9]),
    ("Notification Service", "NOT", "Push notification service", workspaces[1], users[17]),
    # Globex
    ("Inventory System", "INV", "Warehouse inventory management", workspaces[2], users[10]),
    ("HR Portal", "HRP", "Human resources internal portal", workspaces[2], users[11]),
    ("Expense Tracker", "EXP", "Employee expense tracking", workspaces[2], users[12]),
    ("Vendor Portal", "VEN", "External vendor management portal", workspaces[2], users[13]),
    ("Compliance Dashboard", "CMP", "Regulatory compliance reporting", workspaces[2], users[14]),
    # Initech
    ("TPS Reports", "TPS", "TPS report generation system", workspaces[3], users[15]),
    ("Cover Sheet Tool", "CSV", "TPS cover sheet generator", workspaces[3], users[16]),
    ("Office Supply Tracker", "OST", "Office supply inventory", workspaces[3], users[15]),
    ("Employee Onboarding", "ONB", "New hire onboarding workflow", workspaces[3], users[16]),
]

projects = []
for name, key, desc, ws, created_by in projects_data:
    p, _ = Project.objects.get_or_create(
        workspace=ws, key=key,
        defaults={"name": name, "description": desc, "created_by": created_by},
    )
    projects.append(p)

print(f"Projects: {Project.objects.count()}")

# ---------------------------------------------------------------------------
# 4. ISSUE STATUSES (4 per workspace)
# ---------------------------------------------------------------------------
status_templates = [
    ("To Do", "todo", "#6B7280", True, False, 0),
    ("In Progress", "in-progress", "#3B82F6", False, False, 1),
    ("In Review", "in-review", "#8B5CF6", False, False, 2),
    ("Done", "done", "#10B981", False, True, 3),
]

for ws in workspaces:
    for name, key, color, is_initial, is_final, pos in status_templates:
        IssueStatus.objects.get_or_create(
            workspace=ws, key=key,
            defaults={"name": name, "color": color, "is_initial": is_initial,
                      "is_final": is_final, "position": pos},
        )

print(f"IssueStatuses: {IssueStatus.objects.count()}")

# ---------------------------------------------------------------------------
# 5. BOARDS (20)
# ---------------------------------------------------------------------------
boards_data = [
    ("Main Board", projects[0]),
    ("Backlog Board", projects[0]),
    ("Mobile Sprint Board", projects[1]),
    ("API Backlog", projects[2]),
    ("Release Board", projects[2]),
    ("Migration Kanban", projects[3]),
    ("Portal Features", projects[4]),
    ("Dashboard Views", projects[5]),
    ("Auth Flow", projects[6]),
    ("Payments Board", projects[7]),
    ("Chat Channels", projects[8]),
    ("Notification Templates", projects[9]),
    ("Inventory Kanban", projects[10]),
    ("HR Dashboard", projects[11]),
    ("Expense Board", projects[12]),
    ("Vendor Management", projects[13]),
    ("Compliance Tracker", projects[14]),
    ("TPS Board", projects[15]),
    ("Cover Sheet Board", projects[16]),
    ("Onboarding Board", projects[18]),
]

columns_template = [
    {"id": "todo", "name": "To Do", "color": "#6B7280", "wip_limit": None},
    {"id": "in-progress", "name": "In Progress", "color": "#3B82F6", "wip_limit": 3},
    {"id": "in-review", "name": "In Review", "color": "#8B5CF6", "wip_limit": 2},
    {"id": "done", "name": "Done", "color": "#10B981", "wip_limit": None},
]

boards = []
for name, project in boards_data:
    b, _ = Board.objects.get_or_create(
        project=project,
        name=name,
        defaults={
            "workspace": project.workspace,
            "columns": columns_template,
        },
    )
    boards.append(b)

print(f"Boards: {Board.objects.count()}")

# ---------------------------------------------------------------------------
# 6. SPRINTS (20)
# ---------------------------------------------------------------------------
now = timezone.now()
sprints_data = [
    ("Sprint 1 - Foundation", "Planning the core architecture", boards[0], SprintStatus.ACTIVE, now - timedelta(days=14), now + timedelta(days=14)),
    ("Sprint 2 - MVP Features", "Building core MVP features", boards[1], SprintStatus.COMPLETED, now - timedelta(days=28), now - timedelta(days=14)),
    ("Mobile Launch Sprint", "Prepare mobile app launch", boards[2], SprintStatus.ACTIVE, now - timedelta(days=7), now + timedelta(days=21)),
    ("API v2 Development", "Second version of API", boards[3], SprintStatus.PLANNING, now + timedelta(days=7), now + timedelta(days=35)),
    ("API Security Sprint", "Security hardening", boards[4], SprintStatus.PLANNING, now + timedelta(days=35), now + timedelta(days=49)),
    ("Data Migration Phase 1", "Export legacy data", boards[5], SprintStatus.COMPLETED, now - timedelta(days=42), now - timedelta(days=28)),
    ("Data Migration Phase 2", "Import and validate", boards[5], SprintStatus.ACTIVE, now - timedelta(days=10), now + timedelta(days=4)),
    ("Portal Beta", "Customer portal beta", boards[6], SprintStatus.PLANNING, now + timedelta(days=14), now + timedelta(days=42)),
    ("Dashboard Alpha", "Analytics dashboard alpha", boards[7], SprintStatus.ACTIVE, now - timedelta(days=5), now + timedelta(days=25)),
    ("Auth Sprint", "Authentication flow", boards[8], SprintStatus.COMPLETED, now - timedelta(days=30), now - timedelta(days=16)),
    ("Payment Integration", "Stripe integration", boards[9], SprintStatus.ACTIVE, now - timedelta(days=3), now + timedelta(days=27)),
    ("Chat MVP", "Real-time chat MVP", boards[10], SprintStatus.PLANNING, now + timedelta(days=21), now + timedelta(days=49)),
    ("Notification Templates", "Email templates", boards[11], SprintStatus.PLANNING, now + timedelta(days=28), now + timedelta(days=56)),
    ("Inventory Kanban", "Warehouse board", boards[12], SprintStatus.ACTIVE, now - timedelta(days=2), now + timedelta(days=28)),
    ("HR Portal Setup", "HR system setup", boards[13], SprintStatus.COMPLETED, now - timedelta(days=35), now - timedelta(days=21)),
    ("Expense Tracker v1", "Expense tracking MVP", boards[14], SprintStatus.PLANNING, now + timedelta(days=10), now + timedelta(days=38)),
    ("Vendor Onboarding", "Vendor portal onboarding", boards[15], SprintStatus.ACTIVE, now - timedelta(days=1), now + timedelta(days=29)),
    ("Compliance Q1", "Q1 compliance reporting", boards[16], SprintStatus.PLANNING, now + timedelta(days=14), now + timedelta(days=42)),
    ("TPS Quarterly", "Quarterly TPS reports", boards[17], SprintStatus.ACTIVE, now - timedelta(days=4), now + timedelta(days=26)),
    ("Onboarding Sprint", "New hire onboarding", boards[18], SprintStatus.ACTIVE, now - timedelta(days=6), now + timedelta(days=24)),
]

sprints = []
for name, goal, board, status, start, end in sprints_data:
    s, _ = Sprint.objects.get_or_create(
        board=board, name=name,
        defaults={
            "workspace": board.workspace,
            "goal": goal,
            "status": status,
            "start_date": start,
            "end_date": end,
        },
    )
    sprints.append(s)

print(f"Sprints: {Sprint.objects.count()}")

# ---------------------------------------------------------------------------
# 7. ISSUES (~40)
# ---------------------------------------------------------------------------
issue_templates = [
    # (summary, issue_type, priority, desc_prefix)
    ("Fix login redirect loop", "bug", "high", "Users are redirected back to login after successful auth."),
    ("Add dark mode toggle", "task", "medium", "Implement dark mode toggle in settings."),
    ("Update API documentation", "task", "low", "Refresh OpenAPI spec for new endpoints."),
    ("Database connection timeout", "bug", "critical", "Intermittent timeouts under high load."),
    ("Export to CSV feature", "story", "medium", "Allow users to export reports as CSV."),
    ("Unit test coverage > 80%", "task", "medium", "Increase test coverage across services."),
    ("CI pipeline flaky builds", "bug", "high", "Flaky tests in CI causing false failures."),
    ("Add Slack notifications", "story", "medium", "Post issue updates to Slack channel."),
    ("Performance: slow dashboard load", "bug", "high", "Dashboard takes >5s to load on cold start."),
    ("Two-factor authentication", "story", "critical", "Add 2FA for user accounts."),
    ("Redis cache invalidation", "task", "medium", "Fix stale cache after profile updates."),
    ("GDPR data export", "task", "high", "Allow users to download their personal data."),
    ("Mobile app crash on iOS 17", "bug", "critical", "Crash when opening settings on iOS 17."),
    ("Keyboard shortcuts", "task", "low", "Add keyboard shortcuts for common actions."),
    ("Search bar autocomplete", "story", "medium", "Autocomplete suggestions in global search."),
    ("Invoice PDF generation", "bug", "medium", "PDF invoices missing line items."),
    ("Webhook retry logic", "task", "medium", "Add exponential backoff for failed webhooks."),
    ("Role-based access audit", "task", "high", "Audit RBAC across all modules."),
    ("Image upload compression", "task", "medium", "Compress images on upload to save storage."),
    ("Email verification flow", "story", "high", "Implement email verification on signup."),
    ("Report scheduling", "story", "medium", "Allow scheduling recurring reports."),
    ("Legacy browser support", "bug", "low", "Fix layout issues in IE11 fallback."),
    ("Accessibility audit", "task", "high", "WCAG 2.1 AA compliance review."),
    ("Multi-currency support", "story", "medium", "Support displaying amounts in multiple currencies."),
    ("Audit log retention", "task", "medium", "Implement log retention policy."),
    ("SAML SSO integration", "story", "critical", "Integrate SAML-based SSO for enterprise clients."),
    ("Dark mode for mobile", "task", "low", "Extend dark mode to mobile app."),
    ("API rate limiting", "task", "medium", "Add per-user rate limiting on API."),
    ("Sprint burndown chart", "story", "medium", "Add burndown chart to board view."),
    ("Dependency graph view", "task", "low", "Visualize issue dependencies."),
    ("Bulk issue edit", "story", "high", "Allow editing multiple issues at once."),
    ("Time tracking", "task", "medium", "Add time tracking to issues."),
    ("Custom fields", "story", "medium", "Allow custom fields per project."),
    ("Sprint capacity planning", "task", "medium", "Plan capacity per sprint."),
    ("Email digest", "task", "low", "Send daily/weekly email digests."),
    ("Data retention policy", "task", "high", "Define and enforce data retention."),
]

issue_count = 0
status_by_ws = {ws.pk: list(IssueStatus.objects.filter(workspace=ws)) for ws in workspaces}
users_by_ws = {
    ws.pk: list(User.objects.filter(workspace_memberships__workspace=ws)) for ws in workspaces
}

for i, (summary, itype, priority, desc) in enumerate(issue_templates):
    # Cycle through workspaces/projects
    ws = workspaces[i % len(workspaces)]
    ws_projects = [p for p in projects if p.workspace_id == ws.pk]
    if not ws_projects:
        continue
    project = ws_projects[i % len(ws_projects)]
    ws_boards = [b for b in boards if b.project_id == project.pk]
    board = ws_boards[i % len(ws_boards)] if ws_boards else None
    ws_sprints = [s for s in sprints if s.board_id == board.pk] if board else []
    sprint = ws_sprints[i % len(ws_sprints)] if ws_sprints else None
    statuses = status_by_ws[ws.pk]
    status = statuses[i % len(statuses)]
    ws_users = users_by_ws[ws.pk]
    assignee = ws_users[i % len(ws_users)] if ws_users else None
    reporter = ws_users[(i + 1) % len(ws_users)] if ws_users else None
    col = status.key

    key = f"{project.key}-{i + 1}"
    Issue.objects.get_or_create(
        key=key,
        defaults={
            "workspace": ws,
            "project": project,
            "board": board,
            "sprint": sprint,
            "summary": summary,
            "description": desc,
            "status": status,
            "priority": priority,
            "issue_type": itype,
            "assignee": assignee,
            "reporter": reporter,
            "column_id": col,
            "position": i,
        },
    )
    issue_count += 1

print(f"Issues: {Issue.objects.count()}")

# ---------------------------------------------------------------------------
# 8. ISSUE COMMENTS (20)
# ---------------------------------------------------------------------------
all_issues = list(Issue.objects.all())
comment_bodies = [
    "Looking into this, will update shortly.",
    "Can we get more details on the steps to reproduce?",
    "This is now resolved in the latest build.",
    "I've attached a screenshot for reference.",
    "Please assign this to the frontend team.",
    "Blocking the release, needs immediate attention.",
    "Works on my machine, investigating further.",
    "Updated the PR with the fix, ready for review.",
    "This duplicates #123, closing as duplicate.",
    "Needs design sign-off before implementation.",
    "QA has verified the fix on staging.",
    "Will be included in next week's release.",
    "Customer reported this on production, high priority.",
    "Refactoring complete, tests are passing.",
    "Pending stakeholder feedback on requirements.",
    "Moved to next sprint due to capacity constraints.",
    "Added automated regression test for this case.",
    "Documentation updated accordingly.",
    "Deployed to production, monitoring closely.",
    "Discussed in stand-up, owner is @mike.",
]

for i in range(20):
    issue = all_issues[i % len(all_issues)]
    ws_users = users_by_ws[issue.workspace_id]
    author = ws_users[i % len(ws_users)] if ws_users else users[0]
    IssueComment.objects.get_or_create(
        issue=issue,
        author=author,
        body=comment_bodies[i],
        defaults={"created_at": now - timedelta(days=i)},
    )

print(f"IssueComments: {IssueComment.objects.count()}")

# ---------------------------------------------------------------------------
# 9. ISSUE ATTACHMENTS (20)
# ---------------------------------------------------------------------------
attachment_files = [
    ("screenshot-login.png", "image/png"),
    ("api-spec.yaml", "text/yaml"),
    ("error-logs.txt", "text/plain"),
    ("design-mockup.pdf", "application/pdf"),
    ("database-schema.sql", "application/sql"),
    ("performance-report.pdf", "application/pdf"),
    ("user-flow-diagram.drawio", "application/xml"),
    ("test-results.xml", "application/xml"),
    ("accessibility-audit.pdf", "application/pdf"),
    ("wireframe-home.png", "image/png"),
    ("architecture-diagram.vsdx", "application/vnd.visio"),
    ("qa-test-plan.xlsx", "application/vnd.ms-excel"),
    ("ci-build-log.txt", "text/plain"),
    ("mock-data.json", "application/json"),
    ("postman-collection.json", "application/json"),
    ("release-notes.md", "text/markdown"),
    ("risk-assessment.pdf", "application/pdf"),
    ("stakeholder-signoff.pdf", "application/pdf"),
    ("training-manual.pdf", "application/pdf"),
    ("security-scan-report.pdf", "application/pdf"),
]

for i in range(20):
    issue = all_issues[i % len(all_issues)]
    ws_users = users_by_ws[issue.workspace_id]
    uploaded_by = ws_users[i % len(ws_users)] if ws_users else users[0]
    fname, ctype = attachment_files[i]
    content = f"Demo attachment content for {fname}"
    IssueAttachment.objects.get_or_create(
        issue=issue,
        filename=fname,
        defaults={
            "uploaded_by": uploaded_by,
            "file": ContentFile(content.encode(), name=fname),
            "content_type": ctype,
            "size": len(content),
        },
    )

print(f"IssueAttachments: {IssueAttachment.objects.count()}")

# ---------------------------------------------------------------------------
# 10. AUDIT LOGS (20)
# ---------------------------------------------------------------------------
audit_actions = ["create", "update", "delete", "transition", "comment", "assign"]
audit_targets = ["issue", "comment", "project", "board", "workspace"]

for i in range(20):
    ws = workspaces[i % len(workspaces)]
    ws_users = users_by_ws[ws.pk]
    actor = ws_users[i % len(ws_users)] if ws_users else users[0]
    target_type = audit_targets[i % len(audit_targets)]
    AuditLog.objects.create(
        workspace=ws,
        actor=actor,
        action=audit_actions[i % len(audit_actions)],
        target_type=target_type,
        target_id=str(i + 1),
        changes={"field": "status", "from": "todo", "to": "in-progress"} if i % 2 == 0 else {},
    )

print(f"AuditLogs: {AuditLog.objects.count()}")

# ---------------------------------------------------------------------------
# 11. BILLING: PLANS, SUBSCRIPTIONS, INVOICES
# ---------------------------------------------------------------------------
plans_data = [
    ("Free", "free", 0, "usd", "month", 5, 3, 3, ["1 workspace", "3 projects", "Community support"]),
    ("Starter", "starter", 1900, "usd", "month", 15, 10, 10, ["3 workspaces", "10 projects", "Email support"]),
    ("Business", "business", 7900, "usd", "month", 50, 50, 50, ["10 workspaces", "50 projects", "Priority support", "SAML SSO"]),
    ("Enterprise", "enterprise", 19900, "usd", "month", 9999, 9999, 9999, ["Unlimited", "Dedicated support", "Custom SLA", "Audit logs"]),
]

plans = []
for name, slug, amount, currency, interval, max_users, max_projects, max_boards, features in plans_data:
    p, _ = SubscriptionPlan.objects.get_or_create(
        slug=slug,
        defaults={
            "name": name, "amount": amount, "currency": currency, "interval": interval,
            "max_users": max_users, "max_projects": max_projects, "max_boards": max_boards,
            "features": features, "is_active": True,
        },
    )
    plans.append(p)

print(f"SubscriptionPlans: {SubscriptionPlan.objects.count()}")

# One subscription per workspace
subs = []
for i, ws in enumerate(workspaces):
    plan = plans[i % len(plans)]
    status = SubscriptionStatus.ACTIVE if i < 2 else SubscriptionStatus.TRIALING
    s, _ = Subscription.objects.get_or_create(
        workspace=ws,
        defaults={
            "plan": plan,
            "status": status,
            "current_period_start": now - timedelta(days=30),
            "current_period_end": now + timedelta(days=335),
            "stripe_customer_id": f"cus_demo_{i}",
            "stripe_subscription_id": f"sub_demo_{i}",
        },
    )
    subs.append(s)

print(f"Subscriptions: {Subscription.objects.count()}")

# Invoices (20)
invoice_statuses = ["paid", "paid", "paid", "open", "open", "past_due"]
for i in range(20):
    sub = subs[i % len(subs)]
    Invoice.objects.create(
        workspace=sub.workspace,
        subscription=sub,
        stripe_invoice_id=f"inv_demo_{i:04d}",
        amount=plans[i % len(plans)].amount,
        currency="usd",
        status=invoice_statuses[i % len(invoice_statuses)],
        due_date=now + timedelta(days=15 + i),
        paid_at=now - timedelta(days=i) if i % 3 == 0 else None,
    )

print(f"Invoices: {Invoice.objects.count()}")

# ---------------------------------------------------------------------------
# 12. NOTIFICATIONS (20)
# ---------------------------------------------------------------------------
notification_types = list(NotificationType.choices)
for i in range(20):
    ws = workspaces[i % len(workspaces)]
    ws_users = users_by_ws[ws.pk]
    user = ws_users[i % len(ws_users)] if ws_users else users[0]
    nt = notification_types[i % len(notification_types)]
    Notification.objects.create(
        workspace=ws,
        user=user,
        type=nt[0],
        title=f"Demo notification {i + 1}",
        message=f"This is a sample {nt[1].lower()} notification for demonstration purposes.",
        read=(i % 3 == 0),
        link=f"/board/1",
    )

print(f"Notifications: {Notification.objects.count()}")

# ---------------------------------------------------------------------------
# 13. WEBHOOKS: ENDPOINTS + DELIVERIES (20)
# ---------------------------------------------------------------------------
webhook_events_list = [
    [WebhookEvent.ISSUE_CREATED, WebhookEvent.ISSUE_UPDATED],
    [WebhookEvent.COMMENT_ADDED],
    [WebhookEvent.ISSUE_TRANSITIONED, WebhookEvent.ISSUE_DELETED],
    [WebhookEvent.SUBSCRIPTION_UPDATED, WebhookEvent.INVOICE_PAID],
]

endpoints = []
for i in range(8):
    ws = workspaces[i % len(workspaces)]
    e, _ = WebhookEndpoint.objects.get_or_create(
        workspace=ws,
        url=f"https://hooks.example.com/demo/{i}",
        defaults={
            "secret": f"whsec_demo_{i}",
            "events": webhook_events_list[i % len(webhook_events_list)],
            "is_active": True,
        },
    )
    endpoints.append(e)

print(f"WebhookEndpoints: {WebhookEndpoint.objects.count()}")

for i in range(20):
    ep = endpoints[i % len(endpoints)]
    WebhookDelivery.objects.create(
        endpoint=ep,
        event=list(WebhookEvent.choices)[i % len(WebhookEvent.choices)][0],
        payload={"issue_id": i + 1, "status": "demo"},
        status_code=200 if i % 4 != 3 else 500,
        response_body="OK" if i % 4 != 3 else "Internal Server Error",
    )

print(f"WebhookDeliveries: {WebhookDelivery.objects.count()}")

print("\n=== Seeding complete ===")
print(f"Users: {User.objects.count()}")
print(f"Workspaces: {Workspace.objects.count()}")
print(f"WorkspaceMembers: {WorkspaceMember.objects.count()}")
print(f"IssueStatuses: {IssueStatus.objects.count()}")
print(f"Projects: {Project.objects.count()}")
print(f"Boards: {Board.objects.count()}")
print(f"Sprints: {Sprint.objects.count()}")
print(f"Issues: {Issue.objects.count()}")
print(f"IssueComments: {IssueComment.objects.count()}")
print(f"IssueAttachments: {IssueAttachment.objects.count()}")
print(f"AuditLogs: {AuditLog.objects.count()}")
print(f"SubscriptionPlans: {SubscriptionPlan.objects.count()}")
print(f"Subscriptions: {Subscription.objects.count()}")
print(f"Invoices: {Invoice.objects.count()}")
print(f"Notifications: {Notification.objects.count()}")
print(f"WebhookEndpoints: {WebhookEndpoint.objects.count()}")
print(f"WebhookDeliveries: {WebhookDelivery.objects.count()}")
