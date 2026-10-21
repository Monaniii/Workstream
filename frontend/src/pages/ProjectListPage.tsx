import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { useProjects } from "../hooks/useProjects"
import { Link, useNavigate } from "react-router-dom"
import { Plus, Briefcase, ArrowRight } from "lucide-react"
import toast from "react-hot-toast"

export default function ProjectListPage() {
  const { activeWorkspace, setActiveWorkspace, workspaces } = useAuth()
  const { projects, loading, error, createProject } = useProjects()
  const [newProject, setNewProject] = useState({ name: "", key: "" })
  const navigate = useNavigate()
  if (!activeWorkspace) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Select a workspace</h2>
        <p className="text-gray-500 mb-6">Choose a workspace to view projects.</p>
        <select
          value=""
          onChange={(e) => setActiveWorkspace(e.target.value)}
          className="w-full max-w-md border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        >
          <option value="" disabled>
            Choose a workspace...
          </option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.slug}>{ws.name}</option>
          ))}
        </select>
        <button
          onClick={() => {
            const ws = workspaces.find((w) => w.slug)
            if (ws) setActiveWorkspace(ws.slug)
          }}
          className="bg-indigo-600 text-white px-5 py-2 rounded font-medium hover:bg-indigo-700"
        >
          Continue
        </button>
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
        <div>
          <h1 className="text-2xl font-bold">{activeWorkspace.name}</h1>
          <p className="text-gray-500 text-sm">Plan: {activeWorkspace.plan}</p>
        </div>
        <Link
          to="/app/billing"
          className="text-sm text-indigo-600 hover:underline"
        >
          Manage billing
        </Link>
      </div>

      <div className="flex gap-4 mb-8">
        <Link
          to="/app/projects/new"
          className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New project
        </Link>
      </div>

      {loading && <div className="text-center py-8">Loading projects...</div>}

      {!loading && projects.length === 0 && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
          <p className="text-gray-500 mb-4">Create your first project to get started.</p>
          <Link
            to="/app/projects/new"
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            Create project
          </Link>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <Link
              key={p.id}
              to={`/app/projects/${p.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition"
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
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
