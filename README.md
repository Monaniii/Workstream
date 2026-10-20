# MultiTii — Multi-Tenant SaaS Project Management Platform

A Jira-like product where each company gets its own isolated workspace with boards, sprints, and billing. Built with **Django REST Framework**, **React**, **PostgreSQL**, **Celery**, **Stripe Billing**, **Docker**, and **GitHub Actions**.

## Architecture

```
+----------------+      HTTPS       +----------------------------+
|   React Frontend| <--------------> |   Django / DRF (Gunicorn)   |
|  (Vite, port 5173) |               |   (port 8000)                |
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
         |  Membership)     |  |  Sprint)         |  |  Attachment,     |
         +------------------+  |   AuditLog)      |  |  AuditLog)       |
         +------------------+  +------------------+  +------------------+
                                                |
                  +-----------------------------+
                  |          Billing            |
                  | (SubscriptionPlan,          |
                  |  Subscription, Invoice)     |
                  +-----------------------------+
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
Shared-schema, `tenant_id` (`workspace_id`) on every entity. Requests resolve the active workspace via the `X-Tenant-Slug` header (`TenantMiddleware`). All querysets are filtered to `workspace = request.tenant`, so one workspace can never read or write another workspace's data.

### Roles
| Role | Can |
|------|-----|
| Admin | Full workspace control: manage members, plans, billing, delete workspace |
| Manager | Create/update projects, boards, sprints, issues; manage members (non-admin) |
| Member | Create/update issues, comment, attach files, drag-and-drop on Kanban |
| Viewer | Read-only access |

## Tech Stack

- **Backend**: Django 6, Django REST Framework, drf-spectacular (OpenAPI)
- **Database**: PostgreSQL (SQLite for local/CI tests)
- **Async**: Celery + Redis (webhook delivery, notifications, reports)
- **Payments**: Stripe Billing (test mode) — Checkout, Customer Portal, webhooks
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
#   Backend API:  http://localhost:8000
#   API docs:     http://localhost:8000/api/docs/
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
python manage.py runserver
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
| POST | `/api/auth/register/` | Register user |
| POST | `/api/auth/login/` | Login (returns token) |
| GET | `/api/auth/me/` | Current user |
| GET/POST | `/api/tenants/workspaces/` | List/create workspaces |
| GET/PUT/DELETE | `/api/tenants/workspaces/{id}/` | Workspace detail |
| GET/POST | `/api/tenants/workspaces/{id}/members/` | List/add members |
| PATCH/DELETE | `/api/tenants/workspaces/{id}/members/{mid}/` | Update role / remove member |

Projects & Boards:

| Method | Endpoint |
|--------|----------|
| GET/POST | `/api/projects/` |
| GET/PUT/DELETE | `/api/projects/{id}/` |
| GET/POST | `/api/boards/` |
| GET/PUT/DELETE | `/api/boards/{id}/` |
| GET/POST | `/api/sprints/` |
| GET/PUT/DELETE | `/api/sprints/{id}/` |

Issues:

| Method | Endpoint |
|--------|----------|
| GET/POST | `/api/issues/` |
| GET/PUT/DELETE | `/api/issues/{id}/` |
| POST | `/api/issues/{id}/move/` — drag-and-drop (`column_id`, `position`) |
| POST | `/api/issues/{id}/transition/` — change status (`status_id`) |
| GET/POST | `/api/issues/comments/?issue={id}` |
| GET/POST | `/api/issues/attachments/?issue={id}` |
| GET | `/api/issues/audit-logs/` |
| GET | `/api/issues/statuses/?workspace={id}` |

Billing:

| Method | Endpoint |
|--------|----------|
| GET | `/api/billing/plans/` |
| GET | `/api/billing/subscription/` |
| POST | `/api/billing/subscription/checkout/` (`price_id`) |
| POST | `/api/billing/subscription/portal/` |
| GET | `/api/billing/invoices/` |
| POST | `/api/billing/webhook/` (Stripe) |

Webhooks:

| Method | Endpoint |
|--------|----------|
| GET/POST | `/api/webhooks/endpoints/` |
| GET | `/api/webhooks/deliveries/?endpoint={id}` |

Notifications:

| Method | Endpoint |
|--------|----------|
| GET | `/api/notifications/notifications/` |
| POST | `/api/notifications/notifications/{id}/read/` |
| POST | `/api/notifications/notifications/read-all/` |

OpenAPI docs: `http://localhost:8000/api/docs/` (Swagger) or `/api/redoc/`.

## Running Tests

```bash
cd backend
pip install -r requirements.txt
python manage.py migrate --run-syncdb   # or use pytest-django test DB
$env:DJANGO_SETTINGS_MODULE="config.settings"   # (PowerShell)
export DJANGO_SETTINGS_MODULE=config.settings   # (bash)
python -m pytest backend/tests/ -v
```

All 8 backend tests pass: registration/login, workspace RBAC, tenant isolation, project CRUD scoped to workspace, issue creation with auto-generated keys (`PROJ-1`), and drag-and-drop issue moves.

## Lint & Format

```bash
# backend
python -m flake8 backend --max-line-length=100 --ignore=E203,W503 --exclude=migrations
python -m black backend

# frontend
cd frontend
npm run lint   # eslint
npm run build  # vite build + type-check
```

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR:

1. **lint** — flake8 + black
2. **test** — Django migrations + pytest (Redis service)
3. **frontend** — `npm ci` + `npm run build`
4. **docker** (main/master only) — build backend & frontend images, validate `docker compose config`

## Database / Data Model

Core models (shared schema, `workspace_id` tenant isolation):

- `User` — email-based authentication
- `Workspace` — tenant (company) with owner + plan
- `WorkspaceMember` — user ↔ workspace with role (admin/manager/member/viewer)
- `Project` — belongs to a workspace, has a `key` (e.g. `PROJ`)
- `Board` — Kanban board with configurable columns (JSON)
- `Sprint` — planning/active/completed/archived
- `IssueStatus` — custom workflow statuses per workspace (To Do, In Progress, Done…)
- `Issue` — key (`PROJ-42`), summary, status, priority, type, assignee, reporter, column/position for Kanban ordering
- `IssueComment` / `IssueAttachment`
- `AuditLog` — who did what, when, on which target
- `SubscriptionPlan`, `Subscription`, `Invoice` — Stripe-backed billing
- `WebhookEndpoint`, `WebhookDelivery` — outgoing webhooks with retry

## Seed Data

Optional seed with Faker:

```bash
cd backend
pip install faker factory-boy
# see backend/tests/test_api.py for example factory usage
```

## License

MIT
