# Workstream — Enterprise Work Management Platform

A premium project management platform where each company gets its own isolated workspace with boards, sprints, and billing. Built with **Django REST Framework**, **React**, **PostgreSQL**, **Celery**, **Stripe Billing**, **Docker**, and **GitHub Actions**.

## Architecture

```
+----------------+      HTTPS       +----------------------------+
|   React Frontend| <--------------> |   Django / DRF (Gunicorn)   |
|  (Vite, port 5173) |               |   (port 6000)                |
+----------------+      API          +----------------------------+
                                                 |
                                                 | X-Tenant-Slug header
                                                 v
                                       +----------------------------+
                                       |  TenantMiddleware (slug)   |
                                       +----------------------------+
                                                 |
          +------------------+  +------------------+  +------------------+
          |   Tenants        |  |   Projects       |  |   Issues         |
          | (Workspace,      |  | (Project, Board, |  | (Issue, Comment, |
          |  Membership,     |  |  Sprint)         |  |  Attachment,     |
          |  Invitation)     |  +------------------+  |  AuditLog)       |
          +------------------+                       +------------------+
                                                 |
                                       +----------------------------+
                                       |          Billing           |
                                       | (SubscriptionPlan,         |
                                       |  Subscription, Invoice,    |
                                       |  ProcessedStripeEvent)     |
                                       +----------------------------+
                                                 |
                                       +----------------------------+
                                       |   Webhooks                 |
                                       | (Endpoint, Delivery)       |
                                       +----------------------------+
                                                 |
                                       +----------------------------+
                                       |   Notifications (Celery)   |
                                       +----------------------------+
                                                 |
                                     +------------+------------+
                                     |            |            |
                               PostgreSQL      Redis (Celery)   Stripe (test mode)
                               (port 5432)     (port 6379)      (Billing webhooks)
```

### Tenant isolation

Shared-schema, `workspace_id` on every entity. Requests resolve the active workspace via the `X-Tenant-Slug` header (`TenantMiddleware`). All querysets are filtered to `workspace = request.tenant`, so one workspace can never read or write another workspace's data.

### Roles

| Role | Can |
|------|-----|
| Admin | Full workspace control: manage members, plans, billing, delete workspace; create projects and manage project teams |
| Manager | Create/update projects, manage project teams, assign tasks to project team members; manage boards, sprints, and issues |
| Member | Create/update issues, comment, attach files, drag-and-drop on Kanban |
| Viewer | Read-only access |

### Member accounts
There is no public sign-up. A workspace **admin** creates the account from
**Settings → Members → Create member account**, supplying the person's email and
role. The account is created with a generated temporary password, and the user
receives an email containing their login credentials. On first sign-in they are
forced to **Set a new password** before they can use the workspace. Members
added this way show as *Pending first sign-in* until they do.

Administrators are responsible for the people in their workspace, so only an
admin can create accounts — managers and members cannot.

### Project onboarding

Workspace admins and managers create projects from **Projects → New project**, where
they can set the project details, manager, dates, priority, and initial project team.
Project creation also provisions the project's default board, reusing the workspace
workflow or creating the default statuses when the workspace has none.
The project team can be changed from the project **Team** tab; task assignees must
be non-viewer workspace members on that project team. Workspace admins/managers
and the project's assigned manager can assign or change task assignees. Project
completion percentage is calculated from completed tasks and shown on the project
overview and project list.

### Billing entitlements

Plan limits are enforced server-side:

| Plan | Max Users | Max Projects | Max Boards |
|------|-----------|--------------|------------|
| Free | 5 | 3 | 3 |
| Starter | 15 | 10 | 10 |
| Business | 50 | 50 | 50 |
| Enterprise | Unlimited | Unlimited | Unlimited |

## Tech Stack

- **Backend**: Django 6, Django REST Framework, drf-spectacular (OpenAPI)
- **Database**: PostgreSQL (SQLite for local/CI tests)
- **Async**: Celery + Redis (notifications, reminders, cleanup)
- **Payments**: Stripe Billing (test mode) — Checkout, Customer Portal, webhooks with idempotency
- **Frontend**: React 18, Vite, Tailwind CSS, `@dnd-kit` drag-and-drop Kanban
- **DevOps**: Docker, Docker Compose, GitHub Actions

## Getting Started

### Prerequisites
- Python 3.12+
- Node 22+
- Docker & Docker Compose (for the full stack including Postgres/Redis)

### Option 1: Docker Compose (recommended)

```bash
# Copy environment variables
cp backend/.env.example backend/.env
# Edit backend/.env with your Stripe test keys

# Start everything
docker compose up --build

# Services:
#   Backend API:  http://localhost:6000
#   API docs:     http://localhost:6000/api/docs/
#   Frontend:     http://localhost:5173
#   Postgres:     localhost:5432
#   Redis:        localhost:6379
```

### Option 2: Manual (backend)

```bash
cd backend
python -m venv .venv
# activate .venv
pip install -r requirements.txt

cp .env.example .env   # set STRIPE keys if testing billing

python manage.py migrate
python manage.py runserver 6000
```

### Option 3: Manual (frontend)

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## API Endpoints

Auth (`Token` authentication, header `Authorization: Token <token>`):

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register/` | Disabled (403) — accounts are admin-provisioned |
| POST | `/api/auth/login/` | Login (returns token) |
| GET | `/api/auth/me/` | Current user |
| POST | `/api/auth/change-password/` | Change password (clears `must_change_password`) |
| GET/POST | `/api/tenants/workspaces/` | List/create workspaces |
| GET/PUT/DELETE | `/api/tenants/workspaces/{id}/` | Workspace detail |
| GET/POST | `/api/tenants/workspaces/{id}/members/` | List members / create account (admin only) |
| PATCH/DELETE | `/api/tenants/workspaces/{id}/members/{mid}/` | Update role / remove member |

Projects & Boards:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/projects/` | List/create projects (tenant-scoped) |
| GET/PUT/DELETE | `/api/projects/{id}/` | Project detail |
| GET/POST | `/api/projects/boards/` | List/create boards |
| GET/PUT/DELETE | `/api/projects/boards/{id}/` | Board detail |
| GET/POST | `/api/projects/sprints/` | List/create sprints |
| GET/PUT/DELETE | `/api/projects/sprints/{id}/` | Sprint detail |

Issues:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/issues/` | List/create issues |
| GET/PUT/DELETE | `/api/issues/{id}/` | Issue detail |
| GET | `/api/issues/my-work/?bucket={all\|open\|due_soon\|overdue\|completed}` | Paginated tasks assigned to the current user |
| POST | `/api/issues/{id}/move/` | Drag-and-drop (`column_id`, `position`) |
| POST | `/api/issues/{id}/transition/` | Change status (`status_id`) |
| GET/POST | `/api/issues/comments/?issue={id}` | Issue comments |
| GET/POST | `/api/issues/attachments/?issue={id}` | Issue attachments |
| GET | `/api/issues/statuses/?workspace={id}` | Workflow statuses |

Issues can also have a same-project parent task, nested subtasks, and blocking
dependencies. Dependency cycles and cross-project/workspace relationships are
rejected by the API. Comments can mention project teammates by email (for
example, `@teammate@example.com`) to create a targeted notification.

Billing:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/plans/` | Subscription plans |
| GET | `/api/billing/subscription/` | Current subscription |
| POST | `/api/billing/subscription/checkout/` | Start Stripe Checkout (`price_id`) |
| POST | `/api/billing/subscription/portal/` | Customer Portal |
| GET | `/api/billing/invoices/` | Invoice history |
| POST | `/api/billing/webhook/` | Stripe webhook |

Webhooks:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/webhooks/endpoints/` | Outgoing webhook endpoints |
| GET | `/api/webhooks/deliveries/?endpoint={id}` | Delivery history |

Notifications:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications/notifications/` | User notifications |
| POST | `/api/notifications/notifications/{id}/read/` | Mark as read |
| POST | `/api/notifications/notifications/read-all/` | Mark all as read |

OpenAPI docs: `http://localhost:6000/api/docs/` (Swagger) or `/api/redoc/`.

## Running Tests

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate --noinput

# PostgreSQL for tests
export DJANGO_SETTINGS_MODULE=config.settings   # (bash)
$env:DJANGO_SETTINGS_MODULE="config.settings"   # (PowerShell)

python -m pytest tests/ -v
```

All 23 backend tests pass, including:
- Registration/login
- Workspace RBAC
- **Cross-tenant isolation** (Company A cannot access Company B's data)
- **Billing entitlement enforcement** (plan limits)
- **Stripe webhook idempotency** (no duplicate processing)
- **Invitation creation and acceptance**
- Project CRUD scoped to workspace
- Issue creation with auto-generated keys (`PROJ-1`)

## Lint & Format

```bash
# backend
python -m flake8 backend --max-line-length=100 --ignore=E203,W503 --exclude=migrations
python -m black --check backend

# frontend
cd frontend
npm run lint
npm run build  # vite build + type-check
```

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR:

1. **lint** — flake8 + black (backend), ESLint (frontend)
2. **test** — Django migrations + pytest with PostgreSQL + Redis services
3. **frontend** — `npm ci` + `npm run lint` + `npm run build`
4. **migrations** — `makemigrations --check --dry-run` (no drift)
5. **docker** (main/master only) — build backend & frontend images, validate `docker compose config`

## Database / Data Model

Core models (shared schema, `workspace_id` tenant isolation):

- `User` — email-based authentication
- `Workspace` — tenant (company) with owner + plan
- `WorkspaceMember` — user ↔ workspace with role (admin/manager/member/viewer)
- `Invitation` — workspace email invitations with UUID tokens
- `Project` — belongs to a workspace, has a `key` (e.g. `PROJ`)
- `Board` — Kanban board with configurable columns (JSON)
- `Sprint` — planning/active/completed/archived
- `IssueStatus` — custom workflow statuses per workspace (To Do, In Progress, Done…)
- `Issue` — key (`PROJ-42`), summary, status, priority, type, assignee, reporter, column/position for Kanban ordering
- `IssueComment` / `IssueAttachment`
- `AuditLog` — who did what, when, on which target
- `SubscriptionPlan`, `Subscription`, `Invoice` — Stripe-backed billing
- `ProcessedStripeEvent` — webhook idempotency tracking
- `WebhookEndpoint`, `WebhookDelivery` — outgoing webhooks with retry

## Seed Data

Optional seed script creates 27 users, 10 workspaces, 19 projects, 20 boards, 20 sprints, 36 issues, and billing data across all modules:

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate
python seed_demo.py
```

Demo credentials:

| Email | Password | Role |
|-------|----------|------|
| eliezer@example.com | EliezerPass123! | Superuser, Admin all workspaces |
| sarah@acme.com | DemoPass123! | Admin, Acme Corp |
| alex@techstart.io | DemoPass123! | Admin, TechStart Labs |
| leo@globex.com | DemoPass123! | Admin, Globex Industries |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DEBUG` | Debug mode | `False` |
| `SECRET_KEY` | Django secret key | `dev-secret-key-change-me` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://multiii:multiii@localhost:5432/multiii` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `ALLOWED_HOSTS` | Allowed hostnames | `` |
| `FRONTEND_URL` | Frontend origin for CORS/CSRF | `http://localhost:5173` |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode) | `` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | `` |
| `EMAIL_BACKEND` | Django email backend | console backend |
| `DEFAULT_FROM_EMAIL` | From email address | `noreply@multiii.local` |

## Migrations

All migrations are additive and safe to apply:

- `tenants.0002_invitation` — Adds Invitation model
- `billing.0003_processedstripeevent` — Adds webhook idempotency tracking

Run `python manage.py migrate` to apply.

## License

MIT