import { FormEvent, useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import {
  boardsApi,
  sprintsApi,
  issuesApi,
  projectsApi,
  workspacesApi,
  reportsApi,
  Membership,
  ProjectTeamMember,
} from "../services"
import {
  Briefcase,
  Layout,
  Users,
  AlertTriangle,
  FileText,
  Settings,
  Activity,
  Clock,
  CheckCircle,
  Plus,
  ArrowRight,
  RefreshCw,
} from "lucide-react"
import toast from "react-hot-toast"

const HEALTH_COLORS: Record<string, string> = {
  on_track: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  at_risk: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  off_track: "bg-red-500/15 text-red-600 dark:text-red-400",
}

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-surface-inset text-ink",
  active: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  on_hold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  cancelled: "bg-red-500/15 text-red-600 dark:text-red-400",
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-surface-inset text-ink",
  normal: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { activeWorkspace, user } = useAuth()
  const { projects, loading: projectsLoading, error: projectsError, load: loadProjects } =
    useProjects()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<any[]>([])
  const [sprints, setSprints] = useState<any[]>([])
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [analytics, setAnalytics] = useState<any>(null)

  const project =
    projects.find((p) => String(p.id) === projectId)

  useEffect(() => {
    if (!projectId || !activeWorkspace || !activeWorkspace.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false

    Promise.allSettled([
      boardsApi.list({ workspace: String(activeWorkspace.id), project: projectId }),
      sprintsApi.list({ workspace: String(activeWorkspace.id) }),
      issuesApi.list({ workspace: String(activeWorkspace.id), project: projectId }),
    ]).then((results) => {
      if (cancelled) return

      let errorMsg = ""

      // Boards
      if (results[0].status === "fulfilled") {
        setBoards(results[0].value)
      } else {
        const err = results[0].reason
        errorMsg += `Failed to load boards: ${err?.response?.data?.detail || err?.message || "unknown error"}. `
      }

      // Sprints
      if (results[1].status === "fulfilled") {
        setSprints(results[1].value)
      } else {
        const err = results[1].reason
        errorMsg += `Failed to load sprints: ${err?.response?.data?.detail || err?.message || "unknown error"}. `
      }

      // Issues
      if (results[2].status === "fulfilled") {
        setIssues(results[2].value)
      } else {
        const err = results[2].reason
        errorMsg += `Failed to load issues: ${err?.response?.data?.detail || err?.message || "unknown error"}. `
      }

      if (errorMsg) setError(errorMsg.trim())
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [projectId, activeWorkspace])

  useEffect(() => {
    if (!projectId || !activeWorkspace?.id) return
    // Only members of the project (or admins) get analytics; a 403 from the
    // API simply leaves this panel hidden.
    reportsApi
      .projectAnalytics(Number(projectId))
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
  }, [projectId, activeWorkspace])

  if (projectsLoading) {
    return <div className="p-8 text-center">Loading projects...</div>
  }

  if (loading) {
    return <div className="p-8 text-center">Loading project...</div>
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Error loading project</h2>
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Retry
        </button>
        <Link
          to="/app/projects"
          className="mt-4 text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Project not found</h2>
        <p className="text-ink-muted mb-4">Project #{projectId} not found.</p>
        <Link
          to="/app/projects"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  const openIssues = issues.filter((i) => !i.status_is_final)
  const completedIssues = issues.filter((i) => i.status_is_final)
  const overdueIssues = issues.filter((issue) => issue.is_overdue)
  const completionRate = project?.progress_percentage ?? (
    issues.length > 0
      ? Math.round((completedIssues.length / issues.length) * 100)
      : 0
  )

  const tabs = [
    { id: "overview", label: "Overview", icon: Briefcase },
    { id: "tasks", label: "Tasks", icon: CheckCircle },
    { id: "board", label: "Board", icon: Layout },
    { id: "team", label: "Team", icon: Users },
    { id: "settings", label: "Settings", icon: Settings },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <p className="text-ink-muted text-sm">{project.key}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/app/projects"
            className="px-4 py-2 text-sm border rounded hover:bg-surface-inset"
          >
            <ArrowRight className="w-3 h-3 mr-1" /> Back to projects
          </Link>
          <Link
            to={`/app/projects/${projectId}/board`}
            className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700"
          >
            Open board
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-col">
        <div className="flex border-b border-line mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-ink-muted hover:text-ink hover:bg-surface-muted"
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && (
          <OverviewContent
            project={project}
            openIssues={openIssues}
            completedIssues={completedIssues}
            overdueIssues={overdueIssues}
            completionRate={completionRate}
            boards={boards}
            sprints={sprints}
            issues={issues}
            analytics={analytics}
            currentUserId={user?.id}
          />
        )}
        {activeTab === "tasks" && (
          <TasksContent
            issues={issues}
            projectId={projectId}
            progressPercentage={completionRate}
          />
        )}
        {activeTab === "board" && (
          <BoardContent boards={boards} projectId={projectId} />
        )}
        {activeTab === "team" && (
          <TeamContent project={project} activeWorkspace={activeWorkspace} />
        )}
        {activeTab === "settings" && (
          <SettingsContent
            project={project}
            activeWorkspace={activeWorkspace}
            onSaved={loadProjects}
          />
        )}
      </div>
    </div>
  )
}

function OverviewContent({
  project,
  openIssues,
  completedIssues,
  overdueIssues,
  completionRate,
  boards,
  sprints,
  issues,
  analytics,
  currentUserId,
}: any) {
  const navigate = useNavigate()
  return (
    <div className="space-y-8">
      {/* Project Info Header */}
      <div className="bg-surface rounded-xl border border-line p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold">{project.name}</h2>
            <p className="text-sm text-ink-muted">{project.key}</p>
            {project.description && (
              <p className="mt-2 text-sm text-ink-muted">
                {project.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] || ""}`}
            >
              {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[project.priority] || ""}`}
            >
              {project.priority.charAt(0).toUpperCase() + project.priority.slice(1)}
            </span>
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium ${HEALTH_COLORS[project.health || "on_track"] || ""}`}
            >
              {project.health?.charAt(0).toUpperCase() + (project.health || "on_track").slice(1)} Health
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg">
            <div className="text-ink-subtle">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Start Date
              </p>
              <p className="text-sm font-medium">
                {project.start_date || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg">
            <div className="text-ink-subtle">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Target Date
              </p>
              <p className="text-sm font-medium">
                {project.target_date || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg">
            <div className="text-ink-subtle">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Owner
              </p>
              <p className="text-sm font-medium">
                {project.owner_name || project.owner_email || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg">
            <div className="text-ink-subtle">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Manager
              </p>
              <p className="text-sm font-medium">
                {project.manager_name || "Not set"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-surface rounded-xl border border-line p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Total Tasks
              </p>
              <h3 className="text-2xl font-bold">{issues.length}</h3>
            </div>
            <CheckCircle className="w-8 h-8 text-ink-subtle" />
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-line p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Completed
              </p>
              <h3 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {completedIssues.length}
              </h3>
            </div>
            <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-line p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Open Tasks
              </p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {openIssues.length}
              </h3>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
        </div>
        <div className="bg-surface rounded-xl border border-line p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-ink-subtle uppercase">
                Overdue Tasks
              </p>
              <h3 className="text-2xl font-bold text-red-600 dark:text-red-400">
                {overdueIssues.length}
              </h3>
            </div>
            <Clock className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-surface rounded-xl border border-line p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-ink">
            Project Progress
          </span>
          <span className="text-sm font-bold">{completionRate}%</span>
        </div>
        <div className="w-full bg-surface-inset rounded-full h-2">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          ></div>
        </div>
        <p className="text-xs text-ink-muted mt-2">
          {completedIssues.length} of {issues.length} tasks completed
        </p>
      </div>

      {/* Personal contribution — members see how much of the project they own. */}
      {analytics && analytics.is_member && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-ink">Your Contribution</h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Tasks assigned to you on {project.key}
              </p>
            </div>
            <span className="text-2xl font-bold text-blue-500">
              {analytics.kpis.my_completion_rate}%
            </span>
          </div>
          <div className="w-full bg-surface-inset rounded-full h-2">
            <div
              className="bg-gradient-to-r from-blue-600 to-emerald-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, analytics.kpis.my_completion_rate)}%` }}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
            <span>
              <strong className="text-ink">{analytics.kpis.my_tasks}</strong> assigned
            </span>
            <span>
              <strong className="text-emerald-500">{analytics.kpis.my_completed_tasks}</strong> completed
            </span>
            <span>
              <strong className="text-ink">{analytics.kpis.my_tasks - analytics.kpis.my_completed_tasks}</strong> remaining
            </span>
          </div>
          {(analytics.by_assignee || []).length > 1 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle mb-2">
                Team breakdown
              </p>
              <div className="space-y-2">
                {(analytics.by_assignee || []).map((a: any) => (
                  <div key={a.assignee} className="flex items-center gap-3">
                    <span className={`text-xs truncate flex-1 ${a.assignee === currentUserId ? "font-semibold text-ink" : "text-ink-muted"}`}>
                      {a.assignee__email}
                      {a.assignee === currentUserId ? " (you)" : ""}
                    </span>
                    <span className="text-[11px] text-ink-subtle w-14 text-right">
                      {a.completed}/{a.count}
                    </span>
                    <div className="w-24 bg-surface-inset rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${a.completion_rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-surface rounded-xl border border-line p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <Link
            to="/app/activity"
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="space-y-4">
          {issues
            .slice(0, 5)
            .map((issue: any) => (
              <div
                key={issue.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-surface-muted border border-line"
              >
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                    {issue.key.charAt(0)}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-ink">
                    {issue.summary || issue.title}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {issue.issue_type} • {issue.priority} •{" "}
                    {issue.assignee_email || "Unassigned"}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded ${STATUS_COLORS[issue.status_key] || ""}`}
                >
                  {issue.status_key}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Boards & Sprints Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface rounded-xl border border-line p-6">
          <h3 className="text-lg font-semibold mb-4">Kanban Boards</h3>
          {boards.length > 0 ? (
            <ul className="space-y-3">
              {boards.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between p-2 rounded hover:bg-surface-muted cursor-pointer" onClick={() => navigate(`/app/projects/${project.id}/board`)}>
                  <span className="text-sm">{b.name}</span>
                  <span className="text-xs text-ink-subtle">{b.columns?.length || 0} columns</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted text-sm">No boards yet.</p>
          )}
        </div>
        <div className="bg-surface rounded-xl border border-line p-6">
          <h3 className="text-lg font-semibold mb-4">Sprints</h3>
          {sprints.length > 0 ? (
            <ul className="space-y-3">
              {sprints.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between p-2 rounded hover:bg-surface-muted">
                  <span className="text-sm">{s.name}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      s.status === "active"
                        ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400"
                        : s.status === "completed"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : "bg-surface-inset text-ink-muted"
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted text-sm">No sprints yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TasksContent({ issues, projectId, progressPercentage }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Tasks</h2>
        <span className="text-sm font-medium text-ink-muted">
          Project complete: {progressPercentage}%
        </span>
          <Link
            to={`/app/projects/${projectId}/board`}
            className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <Layout className="w-3 h-3 mr-1" /> View Board
          </Link>
      </div>

      {issues.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <CheckCircle className="w-12 h-12 text-ink-subtle mx-auto mb-4" />
          <h3 className="text-lg font-medium text-ink mb-2">
            No tasks yet
          </h3>
          <p className="text-ink-muted">
            Create your first task to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Key
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Summary
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Status
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Priority
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Assignee
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase text-right">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue: any) => (
                <tr
                  key={issue.id}
                  className="border-b border-line hover:bg-surface-muted transition"
                >
                  <td className="py-3 text-sm font-medium text-ink">
                    {issue.key}
                  </td>
                  <td className="py-3 text-sm text-ink">
                    {issue.summary || issue.title}
                  </td>
                  <td className="py-3 text-sm">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${STATUS_COLORS[issue.status_key] || ""}`}
                    >
                      {issue.status_key}
                    </span>
                  </td>
                  <td className="py-3 text-sm">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${PRIORITY_COLORS[issue.priority] || ""}`}
                    >
                      {issue.priority}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-ink-muted">
                    {issue.assignee_email || "Unassigned"}
                  </td>
                  <td className="py-3 text-sm text-ink-muted text-right">
                    {issue.issue_type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BoardContent({ boards, projectId }: any) {
  const navigate = useNavigate()
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Kanban Boards</h2>
      {boards.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-xl border border-line">
          <Layout className="w-12 h-12 text-ink-subtle mx-auto mb-4" />
          <h3 className="text-lg font-medium text-ink mb-2">
            No boards yet
          </h3>
          <p className="text-ink-muted mb-4">Create a board to start managing tasks.</p>
          <Link
            to={`/app/projects/${projectId}/board`}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Create Board
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.map((b: any) => (
            <div
              key={b.id}
              className="bg-surface rounded-xl border border-line p-6 hover:shadow-md transition"
              onClick={() => navigate(`/app/projects/${projectId}/board`)}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                  {b.name.charAt(0)}
                </div>
                <span className="font-semibold">{b.name}</span>
              </div>
              <p className="text-sm text-ink-muted mb-4">
                {b.columns?.length || 0} columns
              </p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-ink-subtle uppercase">
                  Kanban Board
                </span>
                <ArrowRight className="w-4 h-4 text-ink-subtle" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamContent({ project, activeWorkspace }: any) {
  const canManageTeam = ["admin", "manager"].includes(
    activeWorkspace?.current_user_role || ""
  )
  const [team, setTeam] = useState<ProjectTeamMember[]>([])
  const [workspaceMembers, setWorkspaceMembers] = useState<Membership[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!activeWorkspace || !project?.id) return
    setLoading(true)
    const teamRequest = projectsApi.members(project.id)
    const membersRequest = canManageTeam
      ? workspacesApi.members(activeWorkspace.id)
      : Promise.resolve([] as Membership[])
    Promise.all([teamRequest, membersRequest])
      .then(([projectTeam, members]) => {
        setTeam(projectTeam)
        setSelectedIds(projectTeam.map((member) => member.id))
        setWorkspaceMembers(members)
      })
      .catch((err: any) => {
        toast.error(err.response?.data?.detail || "Failed to load project team")
      })
      .finally(() => setLoading(false))
  }, [activeWorkspace, canManageTeam, project?.id])

  const saveTeam = async () => {
    setSaving(true)
    try {
      const updatedTeam = await projectsApi.updateMembers(project.id, selectedIds)
      setTeam(updatedTeam)
      setSelectedIds(updatedTeam.map((member) => member.id))
      toast.success("Project team updated")
    } catch (err: any) {
      toast.error(
        err.response?.data?.member_ids ||
          err.response?.data?.detail ||
          "Failed to update project team"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Project Team</h2>
      <div className="bg-surface rounded-xl border border-line p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Owner</h3>
          </div>
        </div>
        <div className="p-4 bg-surface-muted rounded-lg">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
              {project.owner_name?.charAt(0) || "U"}
            </div>
            <div>
              <p className="text-sm font-medium">{project.owner_name || project.owner_email}</p>
              <p className="text-xs text-ink-muted">Project Owner</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Manager</h3>
          <div className="p-4 rounded-lg">
            {project.manager_name ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                  {project.manager_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{project.manager_name}</p>
                  <p className="text-xs text-ink-muted">Project Manager</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-ink-muted">
                <span>No manager assigned</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="bg-surface rounded-xl border border-line p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Team members</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Only project team members can be assigned its tasks.
            </p>
          </div>
          {canManageTeam && (
            <button
              type="button"
              onClick={saveTeam}
              disabled={saving || loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save team"}
            </button>
          )}
        </div>
        {loading ? (
          <p className="py-4 text-sm text-ink-muted">Loading project team...</p>
        ) : canManageTeam ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {workspaceMembers.map((member) => (
              <label key={member.user} className="flex items-center gap-3 rounded-lg border border-line p-3 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(member.user)}
                  onChange={() =>
                    setSelectedIds((ids) =>
                      ids.includes(member.user)
                        ? ids.filter((id) => id !== member.user)
                        : [...ids, member.user]
                    )
                  }
                  className="h-4 w-4 rounded border-line text-indigo-600 dark:text-indigo-400"
                />
                <span>
                  <span className="block font-medium text-ink">{member.user_email}</span>
                  <span className="text-xs text-ink-muted">{member.role}</span>
                </span>
              </label>
            ))}
            {workspaceMembers.length === 0 && (
              <p className="text-sm text-ink-muted">No workspace members available.</p>
            )}
          </div>
        ) : team.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {team.map((member) => (
              <div key={member.id} className="rounded-lg border border-line p-3">
                <p className="text-sm font-medium text-ink">
                  {member.full_name || member.email}
                </p>
                <p className="text-xs text-ink-muted">{member.email}</p>
                {member.role && (
                  <p className="mt-1 text-xs capitalize text-ink-muted">{member.role}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">No team members have been added yet.</p>
        )}
      </div>
    </div>
  )
}

function SettingsContent({ project, activeWorkspace, onSaved }: any) {
  const [form, setForm] = useState({
    name: project.name || "",
    description: project.description || "",
    objectives: project.objectives || "",
    status: project.status || "planned",
    priority: project.priority || "normal",
    visibility: project.visibility || "internal",
    start_date: project.start_date || "",
    target_date: project.target_date || "",
    tags: (project.tags || []).join(", "),
  })
  const [saving, setSaving] = useState(false)
  const canEdit = ["admin", "manager"].includes(
    activeWorkspace?.current_user_role || ""
  )

  useEffect(() => {
    setForm({
      name: project.name || "",
      description: project.description || "",
      objectives: project.objectives || "",
      status: project.status || "planned",
      priority: project.priority || "normal",
      visibility: project.visibility || "internal",
      start_date: project.start_date || "",
      target_date: project.target_date || "",
      tags: (project.tags || []).join(", "),
    })
  }, [project])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      await projectsApi.update(project.id, {
        name: form.name.trim(),
        description: form.description,
        objectives: form.objectives,
        status: form.status,
        priority: form.priority,
        visibility: form.visibility,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      })
      await onSaved()
      toast.success("Project settings saved")
    } catch (err: any) {
      const details = err.response?.data
      const message =
        details?.target_date ||
        details?.name ||
        details?.detail ||
        "Failed to save project settings"
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Project Settings</h2>
      <div className="bg-surface rounded-xl border border-line p-6 max-w-2xl">
        <form onSubmit={save} className="space-y-5">
          <div className="mb-6">
            <h3 className="text-lg font-semibold">Project Configuration</h3>
            <p className="mt-1 text-sm text-ink-muted">
              Update the project details and planning dates.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              maxLength={200}
              required
              disabled={!canEdit}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-1">Project Key</label>
              <input
                type="text"
                value={project.key}
                disabled
                className="w-full rounded border border-line bg-surface-muted px-3 py-2 text-ink-muted"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Status</label>
              <select
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
                disabled={!canEdit}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
              >
                {["planned", "active", "on_hold", "completed", "cancelled"].map((s) => (
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Description</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              disabled={!canEdit}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Objectives</label>
            <textarea
              rows={3}
              value={form.objectives}
              onChange={(event) => setForm({ ...form, objectives: event.target.value })}
              disabled={!canEdit}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
                disabled={!canEdit}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
              >
                {["low", "normal", "high", "critical"].map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Visibility</label>
              <select
                value={form.visibility}
                onChange={(event) => setForm({ ...form, visibility: event.target.value })}
                disabled={!canEdit}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
              >
                {["public", "internal", "private"].map((visibility) => (
                  <option key={visibility} value={visibility}>{visibility}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-1">Start date</label>
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => setForm({ ...form, start_date: event.target.value })}
                disabled={!canEdit}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Target date</label>
              <input
                type="date"
                value={form.target_date}
                onChange={(event) => setForm({ ...form, target_date: event.target.value })}
                disabled={!canEdit}
                className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">Tags</label>
            <input
              type="text"
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              placeholder="design, launch, engineering"
              disabled={!canEdit}
              className="w-full rounded border border-line bg-surface px-3 py-2 text-ink disabled:opacity-60"
            />
          </div>
          {canEdit ? (
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save project"}
            </button>
          ) : (
            <p className="text-sm text-ink-muted">
              Project settings are read-only for your workspace role.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
