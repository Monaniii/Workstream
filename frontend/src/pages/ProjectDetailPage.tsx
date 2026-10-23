import { useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import {
  boardsApi,
  sprintsApi,
  issuesApi,
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
  on_track: "bg-green-100 text-green-700",
  at_risk: "bg-amber-100 text-amber-700",
  off_track: "bg-red-100 text-red-700",
}

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-gray-100 text-gray-700",
  active: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
}

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { activeWorkspace } = useAuth()
  const { projects, loading: projectsLoading, error: projectsError } =
    useProjects()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<any[]>([])
  const [sprints, setSprints] = useState<any[]>([])
  const [issues, setIssues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("overview")

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
        const boardsData =
          Array.isArray(results[0].value)
            ? results[0].value
            : results[0].value?.results ?? []
        setBoards(boardsData)
      } else {
        const err = results[0].reason
        errorMsg += `Failed to load boards: ${err?.response?.data?.detail || err?.message || "unknown error"}. `
      }

      // Sprints
      if (results[1].status === "fulfilled") {
        const sprintsData =
          Array.isArray(results[1].value)
            ? results[1].value
            : results[1].value?.results ?? []
        setSprints(sprintsData)
      } else {
        const err = results[1].reason
        errorMsg += `Failed to load sprints: ${err?.response?.data?.detail || err?.message || "unknown error"}. `
      }

      // Issues
      if (results[2].status === "fulfilled") {
        const issuesData =
          Array.isArray(results[2].value)
            ? results[2].value
            : results[2].value?.results ?? []
        setIssues(issuesData)
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
          className="mt-4 text-indigo-600 hover:underline"
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
        <p className="text-gray-500 mb-4">Project #{projectId} not found.</p>
        <Link
          to="/app/projects"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  const openIssues = issues.filter((i) => !i.status__is_final)
  const completedIssues = issues.filter((i) => i.status__is_final)
  const overdueIssues = issues.filter(
    (i) =>
      !i.status__is_final &&
      i.created_at &&
      new Date(i.created_at) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  )
  const completionRate =
    issues.length > 0
      ? Math.round((completedIssues.length / issues.length) * 100)
      : 0

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
          <p className="text-gray-500 text-sm">{project.key}</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/app/projects"
            className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
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
        <div className="flex border-b border-gray-200 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
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
          />
        )}
        {activeTab === "tasks" && (
          <TasksContent issues={issues} projectId={projectId} />
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
            onUpdate={() => setLoading(true)}
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
}: any) {
  const navigate = useNavigate()
  return (
    <div className="space-y-8">
      {/* Project Info Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-bold">{project.name}</h2>
            <p className="text-sm text-gray-500">{project.key}</p>
            {project.description && (
              <p className="mt-2 text-sm text-gray-600">
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
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-gray-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Start Date
              </p>
              <p className="text-sm font-medium">
                {project.start_date || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-gray-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Target Date
              </p>
              <p className="text-sm font-medium">
                {project.target_date || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-gray-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Owner
              </p>
              <p className="text-sm font-medium">
                {project.owner_name || project.owner_email || "Not set"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-gray-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Total Tasks
              </p>
              <h3 className="text-2xl font-bold">{issues.length}</h3>
            </div>
            <CheckCircle className="w-8 h-8 text-gray-400" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Completed
              </p>
              <h3 className="text-2xl font-bold text-green-600">
                {completedIssues.length}
              </h3>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Open Tasks
              </p>
              <h3 className="text-2xl font-bold text-amber-600">
                {openIssues.length}
              </h3>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">
                Overdue Tasks
              </p>
              <h3 className="text-2xl font-bold text-red-600">
                {overdueIssues.length}
              </h3>
            </div>
            <Clock className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">
            Project Progress
          </span>
          <span className="text-sm font-bold">{completionRate}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
            style={{ width: `${completionRate}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {completedIssues.length} of {issues.length} tasks completed
        </p>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Recent Activity</h3>
          <Link
            to="/app/activity"
            className="text-sm text-indigo-600 hover:underline"
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
                className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
              >
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                    {issue.key.charAt(0)}
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {issue.summary || issue.title}
                  </p>
                  <p className="text-xs text-gray-500">
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
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Kanban Boards</h3>
          {boards.length > 0 ? (
            <ul className="space-y-3">
              {boards.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/app/projects/${project.id}/board`)}>
                  <span className="text-sm">{b.name}</span>
                  <span className="text-xs text-gray-400">{b.columns?.length || 0} columns</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No boards yet.</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Sprints</h3>
          {sprints.length > 0 ? (
            <ul className="space-y-3">
              {sprints.map((s: any) => (
                <li key={s.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-50">
                  <span className="text-sm">{s.name}</span>
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      s.status === "active"
                        ? "bg-indigo-100 text-indigo-700"
                        : s.status === "completed"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">No sprints yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TasksContent({ issues, projectId }: any) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Tasks</h2>
          <Link
            to={`/app/projects/${projectId}/board`}
            className="text-sm text-indigo-600 hover:underline flex items-center gap-1"
          >
            <Layout className="w-3 h-3 mr-1" /> View Board
          </Link>
      </div>

      {issues.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <CheckCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No tasks yet
          </h3>
          <p className="text-gray-500">
            Create your first task to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Key
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Summary
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Status
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Priority
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Assignee
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase text-right">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue: any) => (
                <tr
                  key={issue.id}
                  className="border-b border-gray-50 hover:bg-gray-50 transition"
                >
                  <td className="py-3 text-sm font-medium text-gray-900">
                    {issue.key}
                  </td>
                  <td className="py-3 text-sm text-gray-900">
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
                  <td className="py-3 text-sm text-gray-600">
                    {issue.assignee_email || "Unassigned"}
                  </td>
                  <td className="py-3 text-sm text-gray-500 text-right">
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
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Layout className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No boards yet
          </h3>
          <p className="text-gray-500 mb-4">Create a board to start managing tasks.</p>
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
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
              onClick={() => navigate(`/app/projects/${projectId}/board`)}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                  {b.name.charAt(0)}
                </div>
                <span className="font-semibold">{b.name}</span>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {b.columns?.length || 0} columns
              </p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  Kanban Board
                </span>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamContent({ project, activeWorkspace }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Project Team</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Owner</h3>
          </div>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
              {project.owner_name?.charAt(0) || "U"}
            </div>
            <div>
              <p className="text-sm font-medium">{project.owner_name || project.owner_email}</p>
              <p className="text-xs text-gray-500">Project Owner</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">Manager</h3>
          <div className="p-4 rounded-lg">
            {project.manager_name ? (
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                  {project.manager_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium">{project.manager_name}</p>
                  <p className="text-xs text-gray-500">Project Manager</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-gray-500">
                <span>No manager assigned</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsContent({ project, activeWorkspace }: any) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Project Settings</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <h3 className="text-lg font-semibold mb-6">Project Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">
              Project Name
            </label>
            <input
              type="text"
              defaultValue={project.name}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Project Key
            </label>
            <input
              type="text"
              defaultValue={project.key}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Status
            </label>
            <select
              defaultValue={project.status}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled
            >
              {["planned", "active", "on_hold", "completed", "cancelled"].map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Priority
            </label>
            <select
              defaultValue={project.priority}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled
            >
              {["low", "normal", "high", "critical"].map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">
              Visibility
            </label>
            <select
              defaultValue={project.visibility}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled
            >
              {["public", "internal", "private"].map((v) => (
                <option key={v} value={v}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          Edit functionality coming soon. Contact your workspace admin to modify project settings.
        </p>
      </div>
    </div>
  )
}
