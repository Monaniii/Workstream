import { useState, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import {
  useProjects,
} from "../hooks/useProjects"
import { boardsApi, sprintsApi } from "../services"
import {
  Briefcase,
  Board,
  Calendar,
  ArrowRight,
  ClipboardList,
  Plus,
} from "lucide-react"
import toast from "react-hot-toast"

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { activeWorkspace } = useAuth()
  const { projects, loading: projectsLoading, error: projectsError } = useProjects()
  const navigate = useNavigate()
  const [boards, setBoards] = useState<any[]>([])
  const [sprints, setSprints] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const project = projects.find((p) => String(p.id) === projectId)

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
    ]).then((results) => {
      if (cancelled) return

      let errorMsg = ""
      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          const data = result.value
          const items = Array.isArray(data) ? data : data?.results ?? []
          if (index === 0) setBoards(items)
          if (index === 1) setSprints(items)
        } else {
          const err = result.reason
          const status = err.response?.status || "unknown"
          const detail = err.response?.data?.detail || err.response?.data || err.message || "unknown error"
          console.error(`API ${index} failed (status ${status}):`, detail)
          errorMsg += index === 0 ? `Boards failed (${status}). ` : `Sprints failed (${status}). `
        }
      })
      if (errorMsg) setError(errorMsg.trim())
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [projectId, activeWorkspace])

  if (projectsLoading) {
    return <div className="p-8 text-center">Loading project list...</div>
  }

  if (!project) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Project not found</h2>
        <p className="text-gray-500 mb-4">Project #{projectId} not found in your workspace.</p>
        <Link
          to="/app/projects"
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Back to projects
        </Link>
      </div>
    )
  }

  if (loading) {
    return <div className="p-8 text-center">Loading project...</div>
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Error loading project data</h2>
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

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <Briefcase className="w-6 h-6 text-indigo-600" />
          <h1 className="text-2xl font-bold">{project.name}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to="/app/projects"
            className="px-4 py-2 text-sm border rounded hover:bg-gray-100"
          >
            Back to projects
          </Link>
          <Link
            to={`/app/projects/${projectId}/board`}
            className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700"
          >
            Open board
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Boards</h3>
          <p className="text-2xl font-bold">{boards.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Sprints</h3>
          <p className="text-2xl font-bold">{sprints.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Issues</h3>
          <p className="text-2xl font-bold">0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Kanban Boards</h3>
            <Link
              to={`/app/projects/${projectId}/board`}
              className="text-sm text-indigo-600 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {boards.length > 0 ? (
              boards.map((b) => (
                <Link
                  key={b.id}
                  to={`/app/projects/${projectId}/board`}
                  className="flex items-center justify-between p-3 rounded border border-gray-100 hover:bg-indigo-50 transition"
                >
                  <span>{b.name}</span>
                  <ArrowRight className="w-3 h-3 text-gray-400" />
                </Link>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No boards yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Sprints</h3>
            <Link
              to={`/app/projects/${projectId}/board`}
              className="text-sm text-indigo-600 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {sprints.length > 0 ? (
              sprints.map((s) => (
                <div key={s.id} className="p-3 rounded border border-gray-100 hover:bg-indigo-50 transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{s.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        s.status === "active"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{s.goal || "No goal"}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">No sprints yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
