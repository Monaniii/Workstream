import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import { Briefcase } from "lucide-react"
import toast from "react-hot-toast"

export default function DashboardPage() {
  const { activeWorkspace, workspaces, logout } = useAuth()
  const { projects, loading, error, createProject } = useProjects()
  const [newProject, setNewProject] = useState({ name: "", key: "" })

  if (workspaces.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">No workspaces</h2>
        <p className="text-gray-500">You don't belong to any workspaces yet.</p>
      </div>
    )
  }

  if (!activeWorkspace) {
    return (
      <div className="flex h-screen flex-col items-center justify-center">
        <div className="max-w-md w-full p-8 bg-white rounded-xl border border-gray-200 shadow-sm">
          <h2 className="text-xl font-bold mb-6">Select a workspace</h2>
          <div className="space-y-3">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => setActiveWorkspace(ws.slug)}
                className="w-full border rounded px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:bg-gray-50 transition"
              >
                {ws.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Error loading projects</h2>
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await createProject({
        workspace: activeWorkspace.id,
        name: newProject.name,
        key: newProject.key.toUpperCase(),
      })
      setNewProject({ name: "", key: "" })
      toast.success("Project created")
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create project")
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-indigo-600" />
          <span className="font-bold text-lg tracking-tight">Workstream</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => logout()} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">
            Sign out
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-8">
        <button
          onClick={() => document.getElementById("new-project")?.scrollIntoView()}
          className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <span className="w-4 h-4">+</span> New project
        </button>
      </div>

      {loading && <div className="text-center py-8">Loading projects...</div>}

      {!loading && projects.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-4">Create your first project to get started.</p>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
              onClick={() => {
                // navigate handled by link wrapper in parent context
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                  {p.key.charAt(0)}
                </div>
                <span className="font-semibold">{p.name}</span>
              </div>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                {p.description || "No description"}
              </p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-400 uppercase">
                  {p.key}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <form
        id="new-project"
        onSubmit={handleCreate}
        className="flex gap-3 mb-8 max-w-lg"
      >
        <input
          id="proj-name"
          className="flex-1 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Project name"
          value={newProject.name}
          onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
          required
        />
        <input
          id="proj-key"
          className="w-24 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
          placeholder="KEY"
          value={newProject.key}
          onChange={(e) => setNewProject({ ...newProject, key: e.target.value })}
          required
          maxLength="10"
        />
        <button className="bg-indigo-600 text-white px-5 py-2 rounded font-medium hover:bg-indigo-700">
          Create
        </button>
      </form>
    </div>
  )
}
