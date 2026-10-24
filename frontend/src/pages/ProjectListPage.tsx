import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import { Link } from "react-router-dom"
import { Plus, Briefcase, Layout } from "lucide-react"

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  planning: "bg-blue-100 text-blue-700",
  on_hold: "bg-amber-100 text-amber-700",
  completed: "bg-slate-100 text-slate-700",
  archived: "bg-slate-100 text-slate-500",
}

export default function ProjectListPage() {
  const { activeWorkspace, setActiveWorkspace, workspaces } = useAuth()
  const { projects, loading, error } = useProjects()
  const [tab, setTab] = useState("all")

  if (!activeWorkspace) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <div className="max-w-sm bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 mb-4">
            <Layout className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Select a workspace</h2>
          <p className="text-slate-500 text-sm mb-6">
            Choose a workspace to view your projects.
          </p>
          <select
            value=""
            onChange={(e) => setActiveWorkspace(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4 bg-white"
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {activeWorkspace.name}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Plan: {activeWorkspace.plan}
          </p>
        </div>
        <Link
          to="/app/billing"
          className="text-sm text-slate-500 hover:text-blue-600 hover:underline"
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
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
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

      {loading && <div className="text-center py-16 text-slate-400 text-sm">Loading projects...</div>}
      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
            <Briefcase className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-slate-900 mb-2">No projects yet</h3>
          <p className="text-slate-500 text-sm mb-6">
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                    Progress
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                    Due Date
                  </th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
                    Owner
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50 transition group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 font-bold shadow-sm">
                          {p.key.charAt(0)}
                        </div>
                        <div>
                          <Link
                            to={`/app/projects/${p.id}`}
                            className="text-sm font-medium text-slate-900 hover:text-blue-700"
                          >
                            {p.name}
                          </Link>
                          <p className="text-[10px] text-slate-500">{p.description || "No description"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] || "bg-slate-100 text-slate-700"}`}>
                        {p.status.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600"
                          style={{ width: `${p.progress_percentage || 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 text-right mt-1">
                        {(p.progress_percentage || 0).toFixed(0)}%
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="text-sm text-slate-900">{p.target_date || "Not set"}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold">
                          {(p.owner_name || p.owner_email || p.key).charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-slate-700">
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
