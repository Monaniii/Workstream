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
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <Shield className="w-12 h-12 mb-3 text-gray-300" />
        <h2 className="text-lg font-medium">Access Denied</h2>
        <p className="text-sm">
          Audit logs are restricted to administrators and superusers.
        </p>
      </div>
    )
  }

  const outcomeBadge = (outcome: string) => {
    const variants: Record<string, string> = {
      success: "bg-green-50 text-green-700 border-green-100",
      failure: "bg-amber-50 text-amber-700 border-amber-100",
      denied: "bg-red-50 text-red-700 border-red-100",
      error: "bg-gray-50 text-gray-700 border-gray-100",
    }
    return variants[outcome] || "bg-gray-50 text-gray-600 border-gray-100"
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Audit Log</h1>
          <p className="text-gray-500 text-sm">
            Security audit trail — who did what, when, where, and with what
            outcome.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchEvents}
            className="p-2 text-gray-500 hover:text-indigo-600 transition"
            disabled={loading}
          >
            <Clock className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            disabled={loading || page?.count === 0}
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-md bg-red-50 border border-red-100 text-red-800 text-sm">
          {error}
        </div>
      )}

      {/* Summary metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
            Total Events
          </p>
          <h3 className="text-2xl font-bold text-gray-900">
            {stats?.total_events ?? page?.count ?? 0}
          </h3>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
            Successful
          </p>
          <h3 className="text-2xl font-bold text-green-700">
            {stats?.successful_actions ?? 0}
          </h3>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
            Failed / Denied
          </p>
          <h3 className="text-2xl font-bold text-red-700">
            {(stats?.failed_actions ?? 0) + (stats?.denied_actions ?? 0)}
          </h3>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
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
            className="text-xs text-indigo-600 hover:text-indigo-800"
          >
            Reset
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">From date</label>
            <input
              type="date"
              value={filters.start_date}
              onChange={(e) =>
                setFilters({ ...filters, start_date: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">To date</label>
            <input
              type="date"
              value={filters.end_date}
              onChange={(e) =>
                setFilters({ ...filters, end_date: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">Module</label>
            <select
              value={filters.module}
              onChange={(e) =>
                setFilters({ ...filters, module: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
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
            <label className="text-xs font-medium text-gray-500">Action</label>
            <select
              value={filters.action}
              onChange={(e) =>
                setFilters({ ...filters, action: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
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
            <label className="text-xs font-medium text-gray-500">Outcome</label>
            <select
              value={filters.outcome}
              onChange={(e) =>
                setFilters({ ...filters, outcome: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
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
            <label className="text-xs font-medium text-gray-500">Resource type</label>
            <input
              value={filters.resource_type}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  resource_type: e.target.value,
                  page: "1",
                })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
              placeholder="e.g. project"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">Actor (email/name)</label>
            <input
              value={filters.actor}
              onChange={(e) =>
                setFilters({ ...filters, actor: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
              placeholder="Search actor..."
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-gray-500">Keyword</label>
            <input
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value, page: "1" })
              }
              className="px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-indigo-500"
              placeholder="Search description..."
            />
          </div>
        </div>
      </div>

      {/* Events table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Timestamp
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Actor
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Action
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Module
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Resource
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">
                  Outcome
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-500">
                    Loading audit events…
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-gray-500">
                    No audit events match the current filters.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr
                    key={event.id}
                    onClick={() => setSelected(event)}
                    className="border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer group"
                  >
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(event.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span>{event.actor_name || "System"}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {event.actor_email || "system"}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-indigo-600 font-medium">
                      {event.action}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{event.module}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {event.resource_type}{event.resource_id && (
                        <span className="ml-1 text-xs text-gray-400">#{event.resource_id}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${outcomeBadge(event.outcome)}`}
                      >
                        {event.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-[300px]">
                      {event.description}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <ChevronRight className="w-3 h-3 text-gray-400 group-hover:text-indigo-600" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {page && page.count > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-500">
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
                className="px-3 py-1.5 text-sm rounded border text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <span className="px-2 text-xs text-gray-600">
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
                className="px-3 py-1.5 text-sm rounded border text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Event detail */}
      {selected && (
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Event Detail</h3>
            <button
              onClick={() => setSelected(null)}
              className="p-2 text-gray-500 hover:text-gray-900"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Timestamp
              </p>
              <p className="text-sm text-gray-900">{new Date(selected.timestamp).toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Actor
              </p>
              <p className="text-sm text-gray-900">
                {selected.actor_name || "System"}
                {selected.actor_email && (
                  <span className="ml-2 text-xs text-gray-500">({selected.actor_email})</span>
                )}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Action / Module
              </p>
              <p className="text-sm text-gray-900">
                {selected.action} · {selected.module}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Outcome
              </p>
              <p className={`text-sm font-medium ${outcomeBadge(selected.outcome).replace("bg-", "text-").replace("-100", "-700")}`}>
                {selected.outcome}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Resource
              </p>
              <p className="text-sm text-gray-900">
                {selected.resource_type}{selected.resource_id && ` #${selected.resource_id}`}
              </p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Workspace
              </p>
              <p className="text-sm text-gray-900">
                {selected.workspace_name || "—"}
              </p>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
              Description
            </p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">
              {selected.description}
            </p>
          </div>
          {selected.changed_fields && Object.keys(selected.changed_fields).length > 0 && (
            <div className="bg-gray-50 p-4 rounded mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                Changed Fields
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 text-xs font-semibold text-gray-500">Field</th>
                    <th className="py-2 text-xs font-semibold text-gray-500">From</th>
                    <th className="py-2 text-xs font-semibold text-gray-500">To</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selected.changed_fields).map(([field, change]) => (
                    <tr key={field} className="border-b border-gray-50">
                      <td className="py-2 text-gray-900 font-mono">{field}</td>
                      <td className="py-2 text-gray-600">
                        {typeof change === "object" && change !== null && "from" in change
                          ? String((change as any).from)
                          : "—"}
                      </td>
                      <td className="py-2 text-gray-600">
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
            <div className="text-xs text-gray-500 mb-2">
              Request ID: <span className="font-mono">{selected.request_id}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
