import { useState, useCallback, useEffect } from "react"
import { projectsApi, Project } from "../services"
import { useAuth } from "../context/AuthContext"

export function useProjects() {
  const { activeWorkspace } = useAuth()
  const workspaceId = activeWorkspace?.id
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!workspaceId) {
      setProjects([])
      setError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const items = await projectsApi.list({
        workspace: String(workspaceId),
      })
      setProjects(items)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    load()
  }, [load])

  const createProject = useCallback(async (data: Partial<Project>) => {
    try {
      const created = await projectsApi.create(data)
      setProjects((prev) => [...prev, created])
      return created
    } catch (err: any) {
      throw err
    }
  }, [])

  return { projects, loading, error, load, createProject }
}
