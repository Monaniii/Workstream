import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { reportsApi } from "../services"
import { ClipboardList, RefreshCw } from "lucide-react"
import toast from "react-hot-toast"

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "last_7_days" },
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "Last 90 Days", value: "last_90_days" },
  { label: "This Month", value: "this_month" },
  { label: "Previous Month", value: "previous_month" },
]

export default function ActivityPage() {
  const { activeWorkspace } = useAuth()
  const [period, setPeriod] = useState("last_30_days")
  const [activity, setActivity] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadActivity = async () => {
    setLoading(true)
    try {
      const data = await reportsApi.activity({
        period,
      })
      setActivity(data)
    } catch (err: any) {
      toast.error("Failed to load activity report")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      loadActivity()
    }
  }, [activeWorkspace, period])

  const data = activity || {}

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Activity &amp; Audit</h1>
          <p className="text-ink-muted text-sm">
            Workspace activity history, task changes, and administrative actions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadActivity}
            className="p-2 text-ink-muted hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded text-sm border transition ${
              period === p.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-surface text-ink-muted border-line hover:border-indigo-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex h-[400px] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {!loading && data && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-surface rounded-xl border border-line p-6">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Total Events
              </p>
              <h3 className="text-2xl font-bold">{data.total_events || 0}</h3>
            </div>
            <div className="bg-surface rounded-xl border border-line p-6">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Action Types
              </p>
              <h3 className="text-2xl font-bold">
                {(data.by_action || []).length}
              </h3>
            </div>
            <div className="bg-surface rounded-xl border border-line p-6">
              <p className="text-xs font-semibold text-ink-subtle uppercase mb-1">
                Target Types
              </p>
              <h3 className="text-2xl font-bold">
                {(data.by_target || []).length}
              </h3>
            </div>
          </div>

          {/* By Action */}
          <div className="bg-surface rounded-xl border border-line p-6">
            <h3 className="text-lg font-semibold mb-6">Events by Action Type</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                      Action
                    </th>
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase text-right">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data.by_action || []).map((a: any) => (
                    <tr
                      key={a.action}
                      className="border-b border-line hover:bg-surface-muted transition"
                    >
                      <td className="py-3 text-sm text-ink">{a.action}</td>
                      <td className="py-3 text-sm text-right font-medium text-indigo-600 dark:text-indigo-400">
                        {a.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Events */}
          <div className="bg-surface rounded-xl border border-line p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Recent Events</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                      Time
                    </th>
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                      Actor
                    </th>
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                      Action
                    </th>
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                      Target
                    </th>
                    <th className="pb-3 text-xs font-semibold text-ink-muted uppercase text-right">
                      Target ID
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data.recent_events || []).map((e: any) => (
                    <tr
                      key={e.id}
                      className="border-b border-line hover:bg-surface-muted transition"
                    >
                      <td className="py-3 text-sm text-ink-muted">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 text-sm text-ink">
                        {e.actor_email || "System"}
                      </td>
                      <td className="py-3 text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                        {e.action}
                      </td>
                      <td className="py-3 text-sm text-ink-muted">
                        {e.target_type}
                      </td>
                      <td className="py-3 text-sm text-right text-ink-muted">
                        {e.target_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
