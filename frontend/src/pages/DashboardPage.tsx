import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import { Plus, Workflow, LayoutList, Briefcase } from "lucide-react"
import toast from "react-hot-toast"

export default function DashboardPage() {
  const { user, activeWorkspace, setActiveWorkspace, workspaces, logout } = useAuth()
  const { projects, loading, error, createProject } = useProjects()
  const [newProject, setNewProject] = useState({ name: "", key: "" })
  const [selectedSlug, setSelectedSlug] = useState("")

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
          <select
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
          >
            <option value="" disabled>
              Choose a workspace...
            </option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.slug}>{ws.name}</option>
            ))}
          </select>
          <button
            onClick={() => setActiveWorkspace(selectedSlug || null)}
            className="w-full bg-indigo-600 text-white py-2 rounded font-medium hover:bg-indigo-700 disabled:opacity-60"
            disabled={!selectedSlug}
          >
            Continue
          </button>
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
      await createProject({ workspace: activeWorkspace.id, name: newProject.name, key: newProject.key.toUpperCase() })
      setNewProject({ name: "", key: "" })
      toast.success("Project created")
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create project")
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-6 flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-indigo-600" />
          <span className="font-bold text-lg">MultiTii</span>
        </div>
        <div className="p-4 border-b border-gray-100">
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Workspace</label>
          <select
            value={activeWorkspace.slug}
            onChange={(e) => setActiveWorkspace(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.slug}>{ws.name}</option>
            ))}
          </select>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <div className="flex items-center gap-3 px-3 py-3 bg-indigo-50 rounded-lg text-indigo-700 font-medium">
            <LayoutList className="w-5 h-5" /> Projects
          </div>
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 cursor-pointer group" onClick={() => {}}>
              <div className="w-8 h-8 rounded flex items-center justify-center bg-gray-200 text-gray-700 font-bold text-xs">
                {p.key.charAt(0)}
              </div>
              <span className="text-sm">{p.name}</span>
            </div>
          ))}
          <button
            onClick={() => { document.getElementById("new-project")?.scrollIntoView() }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <Plus className="w-4 h-4" /> New project
          </button>
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-50 p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">{activeWorkspace.name}</h1>
            <p className="text-gray-500 text-sm">Plan: {activeWorkspace.plan}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => logout()} className="px-4 py-2 text-sm border rounded hover:bg-gray-100">Sign out</button>
          </div>
        </div>

        <form id="new-project" onSubmit={handleCreate} className="flex gap-3 mb-8 max-w-lg">
          <input
            id="proj-name"
            className="flex-1 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Project name" value={newProject.name}
            onChange={(e) => setNewProject({ ...newProject, name: e.target.value })} required
          />
          <input
            id="proj-key"
            className="w-24 border rounded px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
            placeholder="KEY" value={newProject.key}
            onChange={(e) => setNewProject({ ...newProject, key: e.target.value })} required maxLength="10"
          />
          <button className="bg-indigo-600 text-white px-5 py-2 rounded font-medium hover:bg-indigo-700">Create</button>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                  {p.key.charAt(0)}
                </div>
                <span className="font-semibold">{p.name}</span>
              </div>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2">{p.description || "No description"}</p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-400 uppercase">{p.key}</span>
                <button className="text-sm text-indigo-600 hover:underline font-medium">Open board →</button>
              </div>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="col-span-3 text-center py-16 bg-white rounded-xl border border-gray-200">
              <p className="text-gray-500">No projects yet. Create your first project above.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
