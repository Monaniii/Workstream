import { FormEvent, useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { Briefcase, Search } from "lucide-react"
import { Issue, Project, issuesApi, projectsApi } from "../services"
import { useAuth } from "../context/AuthContext"

export default function SearchPage() {
  const { activeWorkspace } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get("q") || ""
  const [input, setInput] = useState(query)
  const [issues, setIssues] = useState<Issue[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => setInput(query), [query])

  useEffect(() => {
    if (!activeWorkspace || query.trim().length < 2) {
      setIssues([])
      setProjects([])
      setError("")
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")
    Promise.allSettled([
      issuesApi.list({ search: query.trim() }),
      projectsApi.list({ search: query.trim() }),
    ]).then(([issueResult, projectResult]) => {
      if (cancelled) return
      const failures: string[] = []
      if (issueResult.status === "fulfilled") {
        setIssues(Array.isArray(issueResult.value) ? issueResult.value : [])
      } else {
        setIssues([])
        failures.push("tasks")
      }
      if (projectResult.status === "fulfilled") {
        setProjects(Array.isArray(projectResult.value) ? projectResult.value : [])
      } else {
        setProjects([])
        failures.push("projects")
      }
      if (failures.length) {
        setError(`Could not search ${failures.join(" and ")}. Please try again.`)
      }
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [activeWorkspace, query])

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = input.trim()
    if (value.length >= 2) setSearchParams({ q: value })
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Search</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Find tasks and projects in your active workspace.
        </p>
      </div>

      <form onSubmit={submit} className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-subtle" />
        <input
          autoFocus
          aria-label="Search tasks and projects"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Search by task key, title, description, or project..."
          className="w-full rounded-xl border border-line bg-surface py-3 pl-12 pr-4 text-sm text-ink shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </form>

      {activeWorkspace && query.trim().length < 2 && (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
          Enter at least two characters to search.
        </p>
      )}
      {!activeWorkspace && (
        <p className="rounded-lg border border-line bg-surface p-5 text-sm text-ink-muted">
          Select a workspace before searching.
        </p>
      )}
      {loading && <p className="text-sm text-ink-muted">Searching...</p>}
      {error && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-500/10 p-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {!loading && query.trim().length >= 2 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink">Tasks ({issues.length})</h2>
            </div>
            <div className="divide-y divide-line">
              {issues.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/app/projects/${issue.project}/board?issue=${issue.id}`}
                  className="block px-5 py-4 transition hover:bg-surface-muted"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
                      {issue.key}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {issue.status_name}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {issue.summary}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {issue.project_key} · {issue.project_name}
                  </p>
                </Link>
              ))}
              {issues.length === 0 && (
                <p className="px-5 py-6 text-sm text-ink-muted">No matching tasks.</p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <h2 className="font-semibold text-ink">Projects ({projects.length})</h2>
            </div>
            <div className="divide-y divide-line">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  to={`/app/projects/${project.id}`}
                  className="flex items-start gap-3 px-5 py-4 transition hover:bg-surface-muted"
                >
                  <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{project.name}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {project.key}
                      {project.status ? ` · ${project.status.replace("_", " ")}` : ""}
                    </p>
                  </div>
                </Link>
              ))}
              {projects.length === 0 && (
                <p className="px-5 py-6 text-sm text-ink-muted">No matching projects.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
