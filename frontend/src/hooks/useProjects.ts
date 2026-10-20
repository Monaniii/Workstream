import { useState, useCallback, useEffect } from "react"
import { projectsApi, Project } from "../services"

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await projectsApi.list()
      setProjects(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const createProject = useCallback(async (data: Partial<Project>) => {
    const created = await projectsApi.create(data)
    setProjects((prev) => [...prev, created])
    return created
  }, [])

  return { projects, loading, load, createProject }
}
