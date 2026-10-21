import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta

from tenants.models import Workspace, WorkspaceMember, MembershipRole
from projects.models import Project, Board, Sprint, SprintStatus
from issues.models import IssueStatus, Issue, IssuePriority, IssueType, IssueComment, IssueAttachment
from billing.models import SubscriptionPlan, Subscription, SubscriptionStatus, Invoice
from django.core.files.base import ContentFile

User = get_user_model()
print("=== Seeding Acme Corporation demo data ===")

# Get or create Acme workspace
acme, created = Workspace.objects.get_or_create(
    slug="acme-corp",
    defaults={"name": "Acme Corporation", "owner": User.objects.get(email="sarah@acme.com"), "plan": "business"},
)
if created:
    print("Created Acme Corporation workspace")
else:
    print("Using existing Acme Corporation workspace")

# Ensure Sarah is admin
sarah = User.objects.get(email="sarah@acme.com")
WorkspaceMember.objects.get_or_create(user=sarah, workspace=acme, defaults={"role": MembershipRole.ADMIN})

# Add more users to Acme to reach 8-13 members per project
acme_emails = [
    ("sarah@acme.com", "sarah_connor", "Sarah", "Connor", MembershipRole.ADMIN),
    ("mike@acme.com", "mike_ross", "Mike", "Ross", MembershipRole.MANAGER),
    ("jessica@acme.com", "jessica_jones", "Jessica", "Jones", MembershipRole.MEMBER),
    ("david@acme.com", "david_chen", "David", "Chen", MembershipRole.MEMBER),
    ("lisa@acme.com", "lisa_simpson", "Lisa", "Simpson", MembershipRole.VIEWER),
    ("helen@acme.com", "helen_w", "Helen", "Wilson", MembershipRole.MEMBER),
    ("oscar@acme.com", "oscar_g", "Oscar", "Garcia", MembershipRole.MEMBER),
    ("rachel@acme.com", "rachel_g", "Rachel", "Green", MembershipRole.VIEWER),
    ("alex@acme.com", "alex_dev", "Alex", "Developer", MembershipRole.MEMBER),
    ("maya@acme.com", "maya_patel", "Maya", "Patel", MembershipRole.MEMBER),
    ("omar@acme.com", "omar_k", "Omar", "Khan", MembershipRole.MEMBER),
    ("zara@acme.com", "zara_ali", "Zara", "Ali", MembershipRole.MEMBER),
    ("leo@acme.com", "leo_stark", "Leo", "Stark", MembershipRole.MANAGER),
]

acme_users = []
for email, username, first, last, role in acme_emails:
    try:
        u = User.objects.get(email=email)
    except User.DoesNotExist:
        try:
            u = User.objects.get(username=username)
            u.email = email
            u.first_name = first
            u.last_name = last
            u.save()
        except User.DoesNotExist:
            u = User.objects.create_user(
                email=email,
                username=username,
                first_name=first,
                last_name=last,
                password="DemoPass123!",
            )
    acme_users.append(u)
    WorkspaceMember.objects.get_or_create(user=u, workspace=acme, defaults={"role": role})

print(f"Acme members: {WorkspaceMember.objects.filter(workspace=acme).count()}")

# Create projects for Acme (each project uses workspace members as its "team")
projects_data = [
    ("Website Redesign", "WEB", "Full corporate website overhaul", sarah),
    ("Mobile App v2", "MOB", "Next-gen mobile application", acme_users[1]),
    ("API Gateway", "API", "Unified API gateway service", acme_users[3]),
    ("Data Migration", "DAT", "Legacy data migration to cloud", acme_users[2]),
    ("Customer Portal", "CUS", "Self-service customer portal", sarah),
    ("Analytics Dashboard", "ANL", "Business intelligence dashboard", acme_users[9]),
    ("Payment Integration", "PAY", "Stripe/PayPal integration", acme_users[10]),
    ("Knowledge Base", "KB", "Internal documentation portal", acme_users[6]),
]

projects = []
for name, key, desc, created_by in projects_data:
    p, created = Project.objects.get_or_create(
        workspace=acme, key=key,
        defaults={"name": name, "description": desc, "created_by": created_by},
    )
    projects.append(p)
    if created:
        print(f"Created project: {p.key} - {p.name}")

# Create issue statuses for Acme
status_templates = [
    ("To Do", "todo", "#6B7280", True, False, 0),
    ("In Progress", "in-progress", "#3B82F6", False, False, 1),
    ("In Review", "in-review", "#8B5CF6", False, False, 2),
    ("Done", "done", "#10B981", False, True, 3),
    ("Blocked", "blocked", "#EF4444", False, False, 4),
]
for name, key, color, is_initial, is_final, pos in status_templates:
    IssueStatus.objects.get_or_create(
        workspace=acme, key=key,
        defaults={"name": name, "color": color, "is_initial": is_initial, "is_final": is_final, "position": pos},
    )
statuses = list(IssueStatus.objects.filter(workspace=acme).order_by("position"))

# Create boards for each project
boards = []
columns_template = [
    {"id": "todo", "name": "To Do", "color": "#6B7280", "wip_limit": None},
    {"id": "in-progress", "name": "In Progress", "color": "#3B82F6", "wip_limit": 3},
    {"id": "in-review", "name": "In Review", "color": "#8B5CF6", "wip_limit": 2},
    {"id": "done", "name": "Done", "color": "#10B981", "wip_limit": None},
    {"id": "blocked", "name": "Blocked", "color": "#EF4444", "wip_limit": 1},
]
for p in projects:
    b, created = Board.objects.get_or_create(
        project=p, name=f"{p.name} Board",
        defaults={"workspace": acme, "columns": columns_template},
    )
    boards.append(b)
    if created:
        print(f"Created board: {b.name}")

# Create sprints
now = timezone.now()
sprints_data = [
    ("Sprint 1 - Foundation", "Planning core architecture", boards[0], SprintStatus.ACTIVE, now - timedelta(days=14), now + timedelta(days=14)),
    ("Sprint 2 - MVP Features", "Building core MVP features", boards[1], SprintStatus.ACTIVE, now - timedelta(days=7), now + timedelta(days=21)),
    ("Sprint 3 - API Hardening", "Security and performance", boards[2], SprintStatus.PLANNING, now + timedelta(days=7), now + timedelta(days=35)),
    ("Sprint 4 - Data Migration", "Export and validate legacy data", boards[3], SprintStatus.COMPLETED, now - timedelta(days=28), now - timedelta(days=14)),
    ("Sprint 5 - Portal Beta", "Customer portal beta", boards[4], SprintStatus.PLANNING, now + timedelta(days=14), now + timedelta(days=42)),
    ("Sprint 6 - Analytics", "BI dashboard development", boards[5], SprintStatus.PLANNING, now + timedelta(days=21), now + timedelta(days=49)),
]
sprints = []
for name, goal, board, status, start, end in sprints_data:
    s, created = Sprint.objects.get_or_create(
        board=board, name=name,
        defaults={"workspace": acme, "goal": goal, "status": status, "start_date": start, "end_date": end},
    )
    sprints.append(s)
    if created:
        print(f"Created sprint: {s.name}")

# Create issues (40 issues across all projects)
issue_templates = [
    ("Fix login redirect loop", "bug", "high", "Users redirected back to login after auth.", "todo"),
    ("Add dark mode toggle", "task", "medium", "Implement dark mode in settings.", "in-progress"),
    ("Update API documentation", "task", "low", "Refresh OpenAPI spec.", "todo"),
    ("Database connection timeout", "bug", "critical", "Intermittent timeouts under load.", "in-progress"),
    ("Export to CSV feature", "story", "medium", "Allow CSV export of reports.", "todo"),
    ("Unit test coverage > 80%", "task", "medium", "Increase test coverage.", "done"),
    ("CI pipeline flaky builds", "bug", "high", "Flaky tests causing failures.", "in-review"),
    ("Add Slack notifications", "story", "medium", "Post issue updates to Slack.", "todo"),
    ("Performance: slow dashboard", "bug", "high", "Dashboard takes >5s cold start.", "in-progress"),
    ("Two-factor authentication", "story", "critical", "Add 2FA for accounts.", "todo"),
    ("Redis cache invalidation", "task", "medium", "Fix stale cache after profile updates.", "done"),
    ("GDPR data export", "task", "high", "Allow personal data download.", "in-review"),
    ("Mobile app crash on iOS 17", "bug", "critical", "Crash opening settings on iOS 17.", "blocked"),
    ("Keyboard shortcuts", "task", "low", "Add keyboard shortcuts.", "todo"),
    ("Search bar autocomplete", "story", "medium", "Autocomplete in global search.", "todo"),
    ("Invoice PDF generation", "bug", "medium", "PDF missing line items.", "done"),
    ("Webhook retry logic", "task", "medium", "Exponential backoff for webhooks.", "in-progress"),
    ("Role-based access audit", "task", "high", "Audit RBAC across modules.", "todo"),
    ("Image upload compression", "task", "medium", "Compress images on upload.", "done"),
    ("Email verification flow", "story", "high", "Email verification on signup.", "in-progress"),
    ("Report scheduling", "story", "medium", "Schedule recurring reports.", "todo"),
    ("Accessibility audit", "task", "high", "WCAG 2.1 AA compliance.", "todo"),
    ("Multi-currency support", "story", "medium", "Multiple currency display.", "todo"),
    ("Audit log retention", "task", "medium", "Log retention policy.", "done"),
    ("SAML SSO integration", "story", "critical", "SAML SSO for enterprise.", "todo"),
    ("Dark mode for mobile", "task", "low", "Dark mode on mobile.", "todo"),
    ("API rate limiting", "task", "medium", "Per-user rate limiting.", "in-review"),
    ("Sprint burndown chart", "story", "medium", "Burndown chart on board.", "todo"),
    ("Dependency graph view", "task", "low", "Visualize dependencies.", "todo"),
    ("Bulk issue edit", "story", "high", "Edit multiple issues at once.", "todo"),
    ("Time tracking", "task", "medium", "Time tracking on issues.", "todo"),
    ("Custom fields", "story", "medium", "Custom fields per project.", "todo"),
    ("Sprint capacity planning", "task", "medium", "Plan sprint capacity.", "todo"),
    ("Email digest", "task", "low", "Daily/weekly digests.", "todo"),
    ("Data retention policy", "task", "high", "Define data retention.", "todo"),
]

issue_count = 0
for i, (summary, itype, priority, desc, status_key) in enumerate(issue_templates):
    project = projects[i % len(projects)]
    board = boards[i % len(boards)]
    sprint = sprints[i % len(sprints)] if sprints else None
    status = next((s for s in statuses if s.key == status_key), statuses[0])
    assignee = acme_users[i % len(acme_users)]
    reporter = acme_users[(i + 1) % len(acme_users)]
    col = status.key

    key = f"{project.key}-{i + 1}"
    issue, created = Issue.objects.get_or_create(
        key=key,
        defaults={
            "workspace": acme,
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
    if created:
        issue_count += 1
print(f"Created {issue_count} issues (total: {Issue.objects.filter(workspace=acme).count()})")

# Create comments on some issues
all_issues = list(Issue.objects.filter(workspace=acme))
comment_bodies = [
    "Looking into this, will update shortly.",
    "Can we get more details on reproduction steps?",
    "Resolved in latest build, ready for QA.",
    "Attached screenshot for reference.",
    "Assign to frontend team.",
    "Blocking release, needs immediate attention.",
    "Works on my machine, investigating.",
    "PR updated with fix, ready for review.",
    "Duplicates #123, closing as duplicate.",
    "Needs design sign-off before implementation.",
    "QA verified fix on staging.",
    "Included in next week's release.",
    "Customer reported on production, high priority.",
    "Refactoring complete, tests passing.",
    "Pending stakeholder feedback.",
    "Moved to next sprint due to capacity.",
    "Added automated regression test.",
    "Documentation updated.",
    "Deployed to production, monitoring.",
    "Discussed in stand-up, owner is @mike.",
]
for i in range(min(20, len(all_issues))):
    issue = all_issues[i]
    author = acme_users[i % len(acme_users)]
    IssueComment.objects.get_or_create(
        issue=issue,
        author=author,
        body=comment_bodies[i],
        defaults={"created_at": now - timedelta(days=i)},
    )
print(f"Comments: {IssueComment.objects.filter(issue__workspace=acme).count()}")

# Create attachments
attachment_files = [
    ("screenshot-login.png", "image/png"),
    ("api-spec.yaml", "text/yaml"),
    ("error-logs.txt", "text/plain"),
    ("design-mockup.pdf", "application/pdf"),
    ("database-schema.sql", "application/sql"),
    ("performance-report.pdf", "application/pdf"),
    ("wireframe-home.png", "image/png"),
    ("qa-test-plan.xlsx", "application/vnd.ms-excel"),
    ("postman-collection.json", "application/json"),
    ("release-notes.md", "text/markdown"),
]
for i in range(min(10, len(all_issues))):
    issue = all_issues[i]
    uploaded_by = acme_users[i % len(acme_users)]
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
print(f"Attachments: {IssueAttachment.objects.filter(issue__workspace=acme).count()}")

# Billing: subscription for Acme
plan, _ = SubscriptionPlan.objects.get_or_create(
    slug="business",
    defaults={
        "name": "Business",
        "amount": 7900,
        "currency": "usd",
        "interval": "month",
        "max_users": 50,
        "max_projects": 50,
        "max_boards": 50,
        "features": ["10 workspaces", "50 projects", "Priority support", "SAML SSO"],
        "is_active": True,
    },
)
sub, _ = Subscription.objects.get_or_create(
    workspace=acme,
    defaults={
        "plan": plan,
        "status": SubscriptionStatus.ACTIVE,
        "stripe_customer_id": "cus_acme_demo",
        "stripe_subscription_id": "sub_acme_demo",
        "current_period_start": now - timedelta(days=30),
        "current_period_end": now + timedelta(days=335),
    },
)
print(f"Subscription: {sub.plan.name} - {sub.status}")

# Invoices
invoice_statuses = ["paid", "paid", "open", "past_due"]
for i in range(5):
    Invoice.objects.get_or_create(
        workspace=acme,
        subscription=sub,
        stripe_invoice_id=f"inv_acme_{i:04d}",
        defaults={
            "amount": plan.amount,
            "currency": "usd",
            "status": invoice_statuses[i % len(invoice_statuses)],
            "due_date": now + timedelta(days=15 + i),
            "paid_at": now - timedelta(days=i) if i % 3 == 0 else None,
        },
    )
print(f"Invoices: {Invoice.objects.filter(workspace=acme).count()}")

print("\n=== Acme Corporation seeding complete ===")
print(f"Members: {WorkspaceMember.objects.filter(workspace=acme).count()}")
print(f"Projects: {Project.objects.filter(workspace=acme).count()}")
print(f"Boards: {Board.objects.filter(workspace=acme).count()}")
print(f"Sprints: {Sprint.objects.filter(workspace=acme).count()}")
print(f"Issues: {Issue.objects.filter(workspace=acme).count()}")
print(f"Comments: {IssueComment.objects.filter(issue__workspace=acme).count()}")
print(f"Attachments: {IssueAttachment.objects.filter(issue__workspace=acme).count()}")
print(f"Invoices: {Invoice.objects.filter(workspace=acme).count()}")
