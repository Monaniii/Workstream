import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import toast from "react-hot-toast"
import { ArrowLeft, Briefcase, Loader2 } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import { Membership, projectsApi, workspacesApi } from "../services"

export default function ProjectCreatePage() {
  const { activeWorkspace, user } = useAuth()
  const navigate = useNavigate()
  const [members, setMembers] = useState<Membership[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    name: "",
    key: "",
    description: "",
    objectives: "",
    status: "planned",
    priority: "normal",
    owner: "",
    manager: "",
    start_date: "",
    target_date: "",
    visibility: "internal",
    tags: "",
  })
  const [teamMemberIds, setTeamMemberIds] = useState<number[]>([])

  const canManageProjects = ["admin", "manager"].includes(
    activeWorkspace?.current_user_role || ""
  )

  useEffect(() => {
    if (!activeWorkspace || !canManageProjects) return
    setMembersLoading(true)
    workspacesApi.members(activeWorkspace.id)
      .then(setMembers)
      .catch((err: Error) => setError(err.message))
      .finally(() => setMembersLoading(false))
  }, [activeWorkspace, canManageProjects])

  if (!activeWorkspace) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">Select a workspace</h1>
        <p className="mt-2 text-sm text-slate-500">
          Choose a workspace before creating a project.
        </p>
        <Link to="/app/projects" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to projects
        </Link>
      </div>
    )
  }

  if (!canManageProjects) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <h1 className="text-xl font-bold text-slate-900">Project creation is restricted</h1>
        <p className="mt-2 text-sm text-slate-500">
          Only workspace managers and admins can create projects.
        </p>
        <Link to="/app/projects" className="mt-4 inline-block text-blue-600 hover:underline">
          Back to projects
        </Link>
      </div>
    )
  }

  const toggleTeamMember = (userId: number) => {
    setTeamMemberIds((selected) =>
      selected.includes(userId)
        ? selected.filter((id) => id !== userId)
        : [...selected, userId]
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const project = await projectsApi.create({
        ...form,
        workspace: activeWorkspace.id,
        key: form.key.trim().toUpperCase(),
        owner: form.owner ? Number(form.owner) : user?.id || null,
        manager: form.manager ? Number(form.manager) : null,
        start_date: form.start_date || null,
        target_date: form.target_date || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        team_members: teamMemberIds,
      })
      toast.success("Project created")
      navigate(`/app/projects/${project.id}`)
    } catch (err: any) {
      const data = err.response?.data
      const message =
        data?.detail ||
        (typeof data === "string" ? data : JSON.stringify(data || "Could not create project."))
      setError(message)
      toast.error("Could not create project")
    } finally {
      setSaving(false)
    }
  }

  const workspaceManagers = members.filter((member) =>
    ["admin", "manager"].includes(member.role)
  )

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        to="/app/projects"
        className="mb-5 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </Link>

      <div className="mb-6">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
          <Briefcase className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Create a project</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set up the project, choose its manager and add its initial team.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <section className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Project name
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="Website redesign"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Project key
            <input
              required
              maxLength={10}
              value={form.key}
              onChange={(event) => setForm({ ...form, key: event.target.value.toUpperCase() })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 uppercase"
              placeholder="WEB"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={3}
              placeholder="What is this project working toward?"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Objectives
            <textarea
              value={form.objectives}
              onChange={(event) => setForm({ ...form, objectives: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              placeholder="What outcomes should this project deliver?"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Project owner
            <select
              value={form.owner}
              onChange={(event) => setForm({ ...form, owner: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Me ({user?.email || "current user"})</option>
              {members.map((member) => (
                <option key={member.user} value={member.user}>
                  {member.user_email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Project manager
            <select
              value={form.manager}
              onChange={(event) => setForm({ ...form, manager: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="">Assign later</option>
              {workspaceManagers.map((member) => (
                <option key={member.user} value={member.user}>
                  {member.user_email} ({member.role})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="on_hold">On hold</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Priority
            <select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Start date
            <input
              type="date"
              value={form.start_date}
              onChange={(event) => setForm({ ...form, start_date: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Target date
            <input
              type="date"
              min={form.start_date || undefined}
              value={form.target_date}
              onChange={(event) => setForm({ ...form, target_date: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Visibility
            <select
              value={form.visibility}
              onChange={(event) => setForm({ ...form, visibility: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            >
              <option value="internal">Internal</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Tags
            <input
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder="engineering, launch"
            />
          </label>
        </section>

        <section className="border-t border-slate-100 pt-5">
          <div className="mb-3">
            <h2 className="font-semibold text-slate-900">Initial project team</h2>
            <p className="text-sm text-slate-500">
              The creator, selected owner, and selected manager are automatically included.
            </p>
          </div>
          {membersLoading ? (
            <p className="text-sm text-slate-500">Loading workspace members...</p>
          ) : members.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {members.map((member) => (
                <label key={member.user} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={teamMemberIds.includes(member.user)}
                    onChange={() => toggleTeamMember(member.user)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{member.user_email}</span>
                    <span className="text-xs text-slate-500">{member.role}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700">
              No workspace members were found. The project creator will be added automatically.
            </p>
          )}
        </section>

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-5">
          <Link to="/app/projects" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || membersLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  )
}
