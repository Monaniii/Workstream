import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import { Link } from "react-router-dom"
import { Plus, Briefcase, Layout } from "lucide-react"

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  planning: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  on_hold: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  completed: "bg-surface-inset text-ink",
  archived: "bg-surface-inset text-ink-muted",
}

export default function ProjectListPage() {
  const { activeWorkspace, setActiveWorkspace, workspaces } = useAuth()
  const { projects, loading, error } = useProjects()
  const [tab, setTab] = useState("all")

  if (!activeWorkspace) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <div className="max-w-sm bg-surface rounded-2xl border border-line p-8 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
            <Layout className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Select a workspace</h2>
          <p className="text-ink-muted text-sm mb-6">
            Choose a workspace to view your projects.
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

  const canManageProjects = ["admin", "manager"].includes(
    activeWorkspace.current_user_role || ""
  )
  const filtered = projects.filter((p) => {
    if (tab === "all") return true
    return p.status === tab
  })

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-ink tracking-tight">
            {activeWorkspace.name}
          </h1>
          <p className="text-ink-muted text-sm mt-1">
            Plan: {activeWorkspace.plan}
          </p>
        </div>
        <Link
          to="/app/billing"
          className="text-sm text-ink-muted hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
        >
          Manage billing
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {[
            { label: "All", value: "all" },
            { label: "Active", value: "active" },
            { label: "Planning", value: "planning" },
            { label: "On Hold", value: "on_hold" },
            { label: "Completed", value: "completed" },
          ].map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
                tab === t.value
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/30"
                  : "bg-surface text-ink-muted border-line hover:border-line hover:bg-surface-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {canManageProjects && (
          <Link
            to="/app/projects/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm shadow-blue-500/20 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New project
          </Link>
        )}
      </div>

      {loading && <div className="text-center py-16 text-ink-subtle text-sm">Loading projects...</div>}
      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-surface-inset flex items-center justify-center text-ink-subtle mb-4">
            <Briefcase className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-ink mb-2">No projects yet</h3>
          <p className="text-ink-muted text-sm mb-6">
            {canManageProjects
              ? "Create your first project to get started."
              : "There are no projects in this workspace yet."}
          </p>
          {canManageProjects && (
            <Link
              to="/app/projects/new"
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Create project
            </Link>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-line bg-surface-muted">
                  <th className="px-6 py-4 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-ink-subtle uppercase tracking-wider text-right">
                    Progress
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-ink-subtle uppercase tracking-wider text-right">
                    Due Date
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-ink-subtle uppercase tracking-wider text-right">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-surface-muted transition group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shadow-sm">
                          {p.key.charAt(0)}
                        </div>
                        <div>
                          <Link
                            to={`/app/projects/${p.id}`}
                            className="text-sm font-medium text-ink hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {p.name}
                          </Link>
                          <p className="text-[10px] text-ink-muted">{p.description || "No description"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || "bg-surface-inset text-ink"}`}>
                        {p.status.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="w-32 h-1.5 bg-surface-inset rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${p.progress_percentage || 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-medium text-ink-muted text-right mt-1">
                        {(p.progress_percentage || 0).toFixed(0)}%
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm text-ink">{p.target_date || "Not set"}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-6 h-6 rounded-full bg-surface-inset flex items-center justify-center text-ink-muted text-xs font-bold">
                          {(p.owner_name || p.owner_email || p.key).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-ink">
                          {p.owner_name || p.owner_email || "Unassigned"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
