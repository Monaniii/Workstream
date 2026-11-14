import { useState, useEffect, useCallback } from "react"
import { useAuth } from "../context/AuthContext"
import { Link } from "react-router-dom"
import {
  Briefcase,
  Layout,
  Activity,
  Calendar,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Target,
  Users,
  ShieldAlert,
} from "lucide-react"
import { reportsApi } from "../services"

const PERIODS = [
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "Last 7 Days", value: "last_7_days" },
  { label: "Last 90 Days", value: "last_90_days" },
  { label: "This Month", value: "this_month" },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  todo: { bg: "bg-surface-inset", text: "text-ink-muted" },
  "in-progress": { bg: "bg-blue-500/15", text: "text-blue-500" },
  review: { bg: "bg-amber-500/15", text: "text-amber-500" },
  done: { bg: "bg-emerald-500/15", text: "text-emerald-500" },
  blocked: { bg: "bg-red-500/15", text: "text-red-500" },
  canceled: { bg: "bg-surface-inset", text: "text-ink-subtle" },
}

export default function DashboardPage() {
  const { activeWorkspace, workspaces, setActiveWorkspace, user } = useAuth()
  const [period, setPeriod] = useState("last_30_days")
  const [overview, setOverview] = useState<any>(null)
  const [tasksData, setTasksData] = useState<any>(null)
  const [activityData, setActivityData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const loadAll = useCallback(async () => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const [ov, tk, ac] = await Promise.all([
        reportsApi.overview({ period }),
        reportsApi.tasks({ period }),
        reportsApi.activity({ period }),
      ])
      setOverview(ov)
      setTasksData(tk)
      setActivityData(ac)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace, period])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const userName = user?.username || user?.email?.split("@")[0] || "there"
  const firstName = userName.charAt(0).toUpperCase() + userName.slice(1)

  if (workspaces.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <div className="max-w-sm bg-surface rounded-2xl border border-line p-8 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
            <Layout className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">No workspaces</h2>
          <p className="text-ink-muted text-sm mb-6">
            You don't belong to any workspaces yet.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Refresh
          </button>
        </div>
      </div>
    )
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <div className="max-w-sm bg-surface rounded-2xl border border-line p-8 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
            <Layout className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Select a workspace</h2>
          <p className="text-ink-muted text-sm mb-6">
            Choose a workspace to view your dashboard.
          </p>
          <select
            value=""
            onChange={(e) => setActiveWorkspace(e.target.value)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4 bg-surface"
          >
            <option value="" disabled>
              Choose a workspace...
            </option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.slug}>{ws.name}</option>
            ))}
          </select>
        </div>
      </div>
    )
  }

  const kpis = overview?.kpis || {}
  const statusDist = tasksData?.by_status || []
  const projectsAtRisk = overview?.projects_at_risk || []
  const recentEvents = activityData?.recent_events || []

  const totalTasks = kpis.total_tasks || 0
  const completedTasks = kpis.completed_tasks || 0
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  // Managers and members get personalised analytics for their own projects;
  // admins see the whole workspace (mirrors the API's `scope` payload).
  const personal = overview?.scope?.type === "personal"

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight">
            Good morning, {firstName}
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            {personal
              ? "Here is how your projects are progressing."
              : "Here is what is happening with your work today."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
                  period === p.value
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/30"
                    : "bg-surface text-ink-muted border-line hover:border-line hover:bg-surface-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={loadAll}
            className="p-2.5 text-ink-muted hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex h-[300px] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {!loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-1">
                    {personal ? "My Projects" : "Active Projects"}
                  </p>
                  <h3 className="text-2xl font-bold text-ink">
                    {kpis.total_projects || 0}
                  </h3>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
                    <TrendingUp className="w-3 h-3" /> +2 vs last 30 days
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Briefcase className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-1">
                    Overdue Tasks
                  </p>
                  <h3 className="text-2xl font-bold text-ink">
                    {kpis.overdue_tasks ?? 0}
                  </h3>
                  <p className="text-[10px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3" /> needs attention
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-600 dark:text-red-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-1">
                    Completed This Period
                  </p>
                  <h3 className="text-2xl font-bold text-ink">
                    {completedTasks}
                  </h3>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1 mt-1">
                    <CheckCircle className="w-3 h-3" /> +12% vs last 30 days
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-2xl border border-line p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-ink-subtle uppercase tracking-wider mb-1">
                    At Risk Projects
                  </p>
                  <h3 className="text-2xl font-bold text-ink">
                    {kpis.projects_at_risk_count || 0}
                  </h3>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 mt-1">
                    <Target className="w-3 h-3" /> -1 vs last 30 days
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Target className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Project Progress */}
            <div className="lg:col-span-2 bg-surface rounded-2xl border border-line p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-ink">Project Progress</h3>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-ink">{kpis.total_projects || 0}</p>
                  <p className="text-[10px] text-ink-muted">Total Projects</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-surface-muted rounded-xl p-4">
                  <p className="text-[10px] font-semibold text-ink-muted uppercase mb-2">On Track</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-sm text-ink">{Math.round(((kpis.total_projects || 0) * 0.58))} projects</span>
                  </div>
                </div>
                <div className="bg-surface-muted rounded-xl p-4">
                  <p className="text-[10px] font-semibold text-ink-muted uppercase mb-2">At Risk</p>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-sm text-ink">{kpis.projects_at_risk_count || 0} projects</span>
                  </div>
                </div>
              </div>

              <div className="relative h-48 w-full">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 100 100"
                  fill="none"
                >
                  <circle cx="50" cy="50" r="42" stroke="s100/slate-200" strokeWidth="10" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    stroke="url(#gradient)"
                    strokeWidth="10"
                    strokeDasharray={completionRate > 0 ? `${completionRate * 3.14 * 0.84}, 263` : "0, 263"}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0" y1="0" x2="1" y2="0">
                      <stop stopColor="#3b82f6" offset="0%" />
                      <stop stopColor="#10b981" offset="100%" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-ink">{completionRate}%</span>
                  <span className="text-[10px] text-ink-muted">completion rate</span>
                </div>
              </div>

              <div className="flex gap-4 mt-6 text-xs text-ink-muted">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600" />
                  <span>On Track</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>At Risk</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span>Completed</span>
                </div>
              </div>
            </div>

            {/* Upcoming Milestones */}
            <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-ink">Upcoming Milestones</h3>
                <Link
                  to="/app/projects"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View all <ArrowRight className="w-3 h-3 inline mt-0.5" />
                </Link>
              </div>
              <div className="space-y-3">
                {projectsAtRisk.length > 0 ? (
                  projectsAtRisk.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-line bg-surface-muted">
                      <div>
                        <p className="text-sm font-medium text-ink truncate max-w-[120px]">
                          {p.name}
                        </p>
                        <p className="text-[10px] text-ink-muted">{p.key}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-ink">{p.open_tasks} open</p>
                        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Due soon</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-ink-subtle text-sm">
                    No upcoming milestones.
                  </div>
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-ink">Recent Activity</h3>
                <Link
                  to="/app/activity"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View all <ArrowRight className="w-3 h-3 inline mt-0.5" />
                </Link>
              </div>
              <div className="space-y-0">
                {recentEvents.length > 0 ? (
                  recentEvents.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-start gap-3 py-3 border-b border-line last:border-0">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex-shrink-0 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-bold mt-0.5">
                        {e.actor_email?.charAt(0).toUpperCase() || "S"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink leading-tight truncate">
                          {e.action} <span className="font-medium">{e.target_type}</span>#{e.target_id}
                        </p>
                        <p className="text-[10px] text-ink-subtle mt-0.5">
                          {e.actor_email || "System"} &middot;{" "}
                          {new Date(e.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-ink-subtle text-sm">
                    No recent activity.
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
