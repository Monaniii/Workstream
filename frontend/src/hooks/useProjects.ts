import { useState, useCallback, useEffect } from "react"
import { projectsApi, Project } from "../services"

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await projectsApi.list()
      const items = Array.isArray(data) ? data : data?.results ?? []
      setProjects(items)
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load projects")
    } finally {
      setLoading(false)
    }
  }, [])

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
