import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { workspacesApi } from "../services"
import { Settings, Save, User } from "lucide-react"
import toast from "react-hot-toast"

export default function SettingsGeneralPage() {
  const { activeWorkspace, fetchWorkspaces, workspaces } = useAuth()
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [plan, setPlan] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name)
      setSlug(activeWorkspace.slug)
      setPlan(activeWorkspace.plan)
    }
  }, [activeWorkspace])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkspace) return
    setSaving(true)
    try {
      const updated = await workspacesApi.update(activeWorkspace.id, {
        name,
        slug,
        plan,
      })
      localStorage.setItem("workspaceSlug", updated.slug)
      await fetchWorkspaces()
      toast.success("Workspace settings saved")
    } catch (err: any) {
      toast.error("Failed to save workspace settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Workspace Settings</h1>
          <p className="text-ink-muted text-sm">
            Manage workspace profile, name, and plan details
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-line p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-semibold">General</h2>
        </div>
        <p className="text-ink-muted text-sm mb-6">
          Configure your workspace identity and billing plan.
        </p>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Workspace Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Workspace name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Slug (URL identifier)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="workspace-slug"
              required
            />
            <p className="text-xs text-ink-muted mt-1">
              Used in URLs and API references. Changing this may break existing
              links.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Plan
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-indigo-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {saving ? <Save className="w-4 h-4 mr-2" /> : null} Save Changes
          </button>
        </form>
      </div>

      <div className="bg-surface rounded-xl border border-line p-6 max-w-2xl mt-6">
        <div className="flex items-center gap-3 mb-2">
          <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-semibold">Current Workspace</h2>
        </div>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Name</dt>
            <dd className="font-medium">{activeWorkspace?.name || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Slug</dt>
            <dd className="font-medium text-indigo-600 dark:text-indigo-400">
              {activeWorkspace?.slug || "—"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Plan</dt>
            <dd className="font-medium">{activeWorkspace?.plan || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Members</dt>
            <dd className="font-medium">
              {workspaces.find((w) => w.id === activeWorkspace?.id)
                ?.member_count || 0}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
