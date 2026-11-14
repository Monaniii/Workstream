import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { CalendarClock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { IssuePage, issuesApi } from "../services"

const BUCKETS = [
  { label: "All assigned", value: "all" },
  { label: "Open", value: "open" },
  { label: "Due soon", value: "due_soon" },
  { label: "Overdue", value: "overdue" },
  { label: "Completed", value: "completed" },
]
const PAGE_SIZE = 20

export default function MyWorkPage() {
  const { activeWorkspace, user } = useAuth()
  const [bucket, setBucket] = useState("all")
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState<IssuePage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!activeWorkspace || !user) {
      setResult(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError("")
    issuesApi.myWork({ bucket, page: String(page) })
      .then((data) => {
        if (!cancelled) setResult(data)
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err.response?.data?.detail || "Failed to load your tasks.")
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeWorkspace, user, bucket, page, refreshKey])

  const changeBucket = (value: string) => {
    setBucket(value)
    setPage(1)
  }

  const pageCount = result ? Math.max(1, Math.ceil(result.count / PAGE_SIZE)) : 1

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">My Work</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Your assigned tasks, deadlines, and current progress.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-muted hover:bg-surface-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => changeBucket(item.value)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              bucket === item.value
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-line bg-surface text-ink-muted hover:bg-surface-muted"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-500/10 p-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {!activeWorkspace && (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
          Select a workspace to see your assigned tasks.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">
            {loading ? "Loading tasks..." : `${result?.count || 0} assigned tasks`}
          </h2>
          <span className="text-xs text-ink-muted">
            Page {page} of {pageCount}
          </span>
        </div>
        <div className="divide-y divide-line">
          {result?.results.map((issue) => (
            <Link
              key={issue.id}
              to={`/app/projects/${issue.project}/board?issue=${issue.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {issue.key}
                  </span>
                  <span className="text-xs text-ink-muted">{issue.project_name}</span>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-ink">
                  {issue.summary}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {issue.status_name} · {issue.priority}
                </p>
              </div>
              {issue.due_date && (
                <span className={`inline-flex items-center gap-1 text-xs ${
                  issue.is_overdue ? "font-semibold text-red-600 dark:text-red-400" : "text-ink-muted"
                }`}>
                  <CalendarClock className="h-3.5 w-3.5" />
                  {issue.is_overdue ? "Overdue · " : "Due "}
                  {new Date(`${issue.due_date}T00:00:00`).toLocaleDateString()}
                </span>
              )}
            </Link>
          ))}
          {!loading && !error && result?.results.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              No tasks match this view.
            </p>
          )}
          {loading && (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-5 w-5 animate-spin text-blue-600" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-ink-muted hover:bg-surface-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => current + 1)}
            disabled={page >= pageCount || loading}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-ink-muted hover:bg-surface-muted disabled:opacity-40"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
