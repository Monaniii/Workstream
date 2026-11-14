import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../context/AuthContext"
import {
  auditApi,
  AuditEvent,
  AuditStats,
  AuditPage,
} from "../services"
import {
  Shield,
  Clock,
  User as UserIcon,
  Activity,
  Box,
  AlertCircle,
  CheckCircle,
  Search,
  Filter,
  Download,
  ChevronRight,
  ExternalLink,
  ArrowUpDown,
  MoreHorizontal,
} from "lucide-react"
import toast from "react-hot-toast"

const ACTIONS = [
  "create",
  "read",
  "update",
  "delete",
  "login",
  "logout",
  "export",
  "invite",
  "permission_change",
  "access_denied",
  "auth_failure",
  "archive",
  "unarchive",
  "transition",
  "assign",
  "comment",
  "attachment_add",
  "membership_add",
  "membership_remove",
  "subscription_change",
  "invoice_paid",
  "system",
]

const MODULES = ["auth", "projects", "issues", "teams", "reports", "billing", "webhooks", "notifications", "system", "audit"]

const OUTCOMES = ["success", "failure", "denied", "error"]

export default function AuditLogPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [page, setPage] = useState<{
    count: number
    next: string | null
    previous: string | null
    results: AuditEvent[]
  } | null>(null)
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filters, setFilters] = useState({
    start_date: "",
    end_date: "",
    actor: "",
    module: "",
    action: "",
    outcome: "",
    resource_type: "",
    search: "",
    page: "1",
  })

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const data = await auditApi.stats()
      setStats(data)
    } catch (err: any) {
      setError("Failed to load audit summary")
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await auditApi.list({
        ...filters,
        page: filters.page,
      })
      setPage(data)
      setEvents(data.results)
    } catch (err: any) {
      if (err.response?.status === 403 || err.response?.status === 401) {
        setError("Access denied: you do not have permission to view audit logs.")
      } else {
        setError("Failed to load audit events")
      }
      setEvents([])
      setPage(null)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents, filters.page])

  const handleExport = async () => {
    if (!user) return
    try {
      const blob = await auditApi.exportCsv({
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        module: filters.module || undefined,
        action: filters.action || undefined,
        outcome: filters.outcome || undefined,
        resource_type: filters.resource_type || undefined,
        search: filters.search || undefined,
        page: filters.page,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "workstream_audit_log.csv"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Audit log exported")
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error("Export not permitted")
      } else {
        toast.error("Export failed")
      }
    }
  }

  const canAccess = Boolean(user && (user.is_superuser || user.is_staff))

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-ink-muted">
        <Shield className="w-12 h-12 mb-3 text-ink-subtle" />
        <h2 className="text-lg font-medium">Access Denied</h2>
        <p className="text-sm">
          Audit logs are restricted to administrators and superusers.
        </p>
      </div>
    )
  }

  const outcomeBadge = (outcome: string) => {
    const variants: Record<string, string> = {
      success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-green-100",
      failure: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-100",
      denied: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-100",
      error: "bg-surface-muted text-ink border-line",
    }
    return variants[outcome] || "bg-surface-muted text-ink-muted border-line"
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-ink-muted text-sm">
            Security audit trail — who did what, when, where, and with what
            outcome.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEvents}
            className="p-2 text-ink-muted hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            disabled={loading}
          >
            <Clock className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-line rounded-md text-ink hover:bg-surface-muted transition disabled:opacity-50"
            disabled={loading || page?.count === 0}
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-md bg-red-500/10 border border-red-100 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Summary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-surface rounded-xl border border-line p-6">
          <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
            Total Events
          </p>
          <h3 className="text-2xl font-bold text-ink">
            {stats?.total_events ?? page?.count ?? 0}
          </h3>
        </div>
        <div className="bg-surface rounded-xl border border-line p-6">
          <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
            Successful
          </p>
          <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats?.successful_actions ?? 0}
          </h3>
        </div>
        <div className="bg-surface rounded-xl border border-line p-6">
          <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
            Failed / Denied
          </p>
          <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">
            {(stats?.failed_actions ?? 0) + (stats?.denied_actions ?? 0)}
          </h3>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl border border-line p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink">Filters</h3>
          <button
            onClick={() => {
              setFilters({
                start_date: "",
                end_date: "",
                actor: "",
                module: "",
                action: "",
                outcome: "",
                resource_type: "",
                search: "",
                page: "1",
              })
            }}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">From date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) =>
                setFilters({ ...filters, start_date: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">To date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) =>
                setFilters({ ...filters, end_date: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">Module</label>
            <select
              value={filters.module}
              onChange={(e) =>
                setFilters({ ...filters, module: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">Action</label>
            <select
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">Outcome</label>
            <select
              value={filters.outcome}
              onChange={(e) =>
                setFilters({ ...filters, outcome: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">Resource type</label>
            <input
              value={filters.resource_type}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  resource_type: e.target.value,
                  page: "1",
                })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. project"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">Actor (email/name)</label>
            <input
              value={filters.actor}
              onChange={(e) =>
                setFilters({ ...filters, actor: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Search actor..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-ink-muted">Keyword</label>
            <input
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500"
              placeholder="Search description..."
            />
          </div>
        </div>
      </div>

      {/* Events table */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line bg-surface-muted">
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">
                  Actor
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">
                  Action
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">
                  Module
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">
                  Resource
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase text-right">
                  Outcome
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-muted uppercase text-right">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-muted">
                    Loading audit events…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-ink-muted">
                    No audit events match the current filters.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => setSelected(event)}
                    className="border-b border-line hover:bg-surface-muted transition cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-sm text-ink-muted">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-ink-subtle" />
                        <span>{event.actor_name || "System"}</span>
                      </div>
                      <div className="text-xs text-ink-subtle">
                        {event.actor_email || "system"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                      {event.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted">{event.module}</td>
                    <td className="px-4 py-3 text-sm text-ink">
                      {event.resource_type}{event.resource_id && (
                        <span className="ml-1 text-xs text-ink-subtle">#{event.resource_id}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${outcomeBadge(event.outcome)}`}
                      >
                        {event.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink-muted truncate max-w-[300px]">
                      {event.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <ChevronRight className="w-3 h-3 text-ink-subtle group-hover:text-indigo-600 dark:hover:text-indigo-400" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {page && page.count > 0 && (
          <div className="px-4 py-3 border-t border-line flex items-center justify-between">
            <div className="text-xs text-ink-muted">
              Showing {events.length} of {page.count} events
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const prev = page.previous
                  if (!prev) return
                  const url = new URL(prev)
                  setFilters({ ...filters, page: url.searchParams.get("page") || "1" })
                }}
                disabled={!page.previous}
                className="px-3 py-1.5 text-sm rounded border text-ink hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 text-xs text-ink-muted">
                Page {filters.page}
              </span>
              <button
                onClick={() => {
                  const next = page.next
                  if (!next) return
                  const url = new URL(next)
                  setFilters({ ...filters, page: url.searchParams.get("page") || "1" })
                }}
                disabled={!page.next}
                className="px-3 py-1.5 text-sm rounded border text-ink hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Event detail */}
      {selected && (
        <div className="mt-8 bg-surface rounded-xl border border-line p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Event Detail</h3>
            <button
              onClick={() => setSelected(null)}
              className="p-2 text-ink-muted hover:text-ink"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-surface-muted p-3 rounded">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Timestamp
              </p>
              <p className="text-sm text-ink">{new Date(selected.timestamp).toLocaleString()}</p>
            </div>
            <div className="bg-surface-muted p-3 rounded">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Actor
              </p>
              <p className="text-sm text-ink">
                {selected.actor_name || "System"}
                {selected.actor_email && (
                  <span className="ml-2 text-xs text-ink-muted">({selected.actor_email})</span>
                )}
              </p>
            </div>
            <div className="bg-surface-muted p-3 rounded">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Action / Module
              </p>
              <p className="text-sm text-ink">
                {selected.action} · {selected.module}
              </p>
            </div>
            <div className="bg-surface-muted p-3 rounded">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Outcome
              </p>
              <p className={`text-sm font-medium ${outcomeBadge(selected.outcome).replace("bg-", "text-").replace("-100", "-700")}`}>
                {selected.outcome}
              </p>
            </div>
            <div className="bg-surface-muted p-3 rounded">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Resource
              </p>
              <p className="text-sm text-ink">
                {selected.resource_type}{selected.resource_id && ` #${selected.resource_id}`}
              </p>
            </div>
            <div className="bg-surface-muted p-3 rounded">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Workspace
              </p>
              <p className="text-sm text-ink">
                {selected.workspace_name || "—"}
              </p>
            </div>
          </div>
          <div className="bg-surface-muted p-4 rounded mb-4">
            <p className="text-xs font-semibold text-ink-subtle uppercase mb-2">
              Description
            </p>
            <p className="text-sm text-ink whitespace-pre-wrap">
              {selected.description}
            </p>
          </div>
          {selected.changed_fields && Object.keys(selected.changed_fields).length > 0 && (
            <div className="bg-surface-muted p-4 rounded mb-4">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-2">
                Changed Fields
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 text-xs font-semibold text-ink-muted">Field</th>
                    <th className="py-2 text-xs font-semibold text-ink-muted">From</th>
                    <th className="py-2 text-xs font-semibold text-ink-muted">To</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selected.changed_fields).map(([field, change]) => (
                    <tr key={field} className="border-b border-line">
                      <td className="py-2 text-ink font-mono">{field}</td>
                      <td className="py-2 text-ink-muted">
                        {typeof change === "object" && change !== null && "from" in change
                          ? String((change as any).from)
                          : "—"}
                      </td>
                      <td className="py-2 text-ink-muted">
                        {typeof change === "object" && change !== null && "to" in change
                          ? String((change as any).to)
                          : String(change)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected.request_id && (
            <div className="text-xs text-ink-muted mb-2">
              Request ID: <span className="font-mono">{selected.request_id}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
