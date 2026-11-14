import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { workspacesApi } from "../services"
import { User, Plus, Trash2, RefreshCw } from "lucide-react"
import toast from "react-hot-toast"

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
]

export default function SettingsMembersPage() {
  const { user, activeWorkspace, fetchWorkspaces } = useAuth()
  // Managers can read the roster but not onboard users; that is admin work.
  const canOnboard =
    Boolean(user?.is_superuser) || activeWorkspace?.current_user_role === "admin"
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addingSubmit, setAddingSubmit] = useState(false)
  const [newMember, setNewMember] = useState({
    email: "",
    first_name: "",
    last_name: "",
    role: "member",
  })

  const loadMembers = async () => {
    if (!activeWorkspace) return
    setLoading(true)
    try {
      const data = await workspacesApi.members(activeWorkspace.id)
      setMembers(data)
    } catch (err: any) {
      toast.error("Failed to load members")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [activeWorkspace])

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeWorkspace) return
    setAddingSubmit(true)
    try {
      const created = await workspacesApi.addMember(activeWorkspace.id, {
        email: newMember.email.trim(),
        role: newMember.role,
        first_name: newMember.first_name.trim(),
        last_name: newMember.last_name.trim(),
      })
      setNewMember({ email: "", first_name: "", last_name: "", role: "member" })
      setAdding(false)
      loadMembers()
      if (created.email_sent === false) {
        toast.error(
          "Account created, but the credentials email could not be sent. Check the server email settings."
        )
      } else {
        toast.success(`Account created. Login details emailed to ${created.user_email}`)
      }
    } catch (err: any) {
      const data = err.response?.data
      const message =
        data?.email?.[0] ||
        data?.role?.[0] ||
        data?.detail ||
        "Failed to create the account"
      toast.error(message)
    } finally {
      setAddingSubmit(false)
    }
  }

  const handleRemoveMember = async (memberId: number) => {
    if (!activeWorkspace) return
    if (!window.confirm("Remove this member from the workspace?")) return
    try {
      await workspacesApi.removeMember(activeWorkspace.id, memberId)
      loadMembers()
      toast.success("Member removed")
    } catch (err: any) {
      toast.error("Failed to remove member")
    }
  }

  const handleRoleChange = async (memberId: number, role: string) => {
    if (!activeWorkspace) return
    try {
      await workspacesApi.updateMemberRole(activeWorkspace.id, memberId, role)
      loadMembers()
      await fetchWorkspaces()
      toast.success("Role updated")
    } catch (err: any) {
      toast.error("Failed to update role")
      loadMembers()
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Workspace Members</h1>
          <p className="text-ink-muted text-sm">
            {canOnboard
              ? "Manage team members, roles, and access"
              : "People in this workspace and their roles"}
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-line p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-semibold">Members</h2>
        </div>

        {!canOnboard && (
          <p className="mb-4 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
            You can view the roster and use these people on your project
            teams. Adding or removing accounts is handled by a workspace admin.
          </p>
        )}

        {canOnboard ? (
          adding ? (
          <form
            onSubmit={handleAddMember}
            className="mb-6 rounded-lg border-line bg-surface-muted p-4"
          >
            <p className="mb-3 text-xs text-ink-muted">
              Creates a new account. The person receives an email with their
              login details and sets their own password on first sign-in.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newMember.first_name}
                onChange={(e) => setNewMember({ ...newMember, first_name: e.target.value })}
                placeholder="First name"
              />
              <input
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={newMember.last_name}
                onChange={(e) => setNewMember({ ...newMember, last_name: e.target.value })}
                placeholder="Last name"
              />
              <input
                type="email"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                placeholder="Email address"
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <select
                value={newMember.role}
                onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="submit"
                disabled={addingSubmit}
                className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 disabled:opacity-60"
              >
                {addingSubmit ? "Creating..." : "Create account & email credentials"}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="px-4 py-2 rounded text-ink-muted hover:bg-surface-inset"
              >
                Cancel
              </button>
            </div>
          </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            >
              <Plus className="w-4 h-4" /> Create member account
            </button>
          )
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Member
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase">
                  Role
                </th>
                <th className="pb-3 text-xs font-semibold text-ink-muted uppercase text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-ink-muted">
                    Loading members...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-ink-muted">
                    No members found.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-line hover:bg-surface-muted transition"
                  >
                    <td className="py-3 text-sm text-ink">
                      {m.user_email || m.email || "Unknown"}
                      {m.must_change_password && (
                        <span className="ml-2 rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800">
                          Pending first sign-in
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-sm">
                      {canOnboard ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs capitalise text-ink">
                          {ROLES.find((r) => r.value === m.role)?.label ?? m.role}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-sm text-right">
                      {canOnboard && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="text-xs text-red-500 hover:text-red-600 dark:text-red-400 transition"
                        >
                          <Trash2 className="w-4 h-4" /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
