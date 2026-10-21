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
  const { activeWorkspace, setActiveWorkspace, workspaces } = useAuth()
  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberRole, setNewMemberRole] = useState("member")

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
    setAdding(true)
    try {
      await workspacesApi.addMember(activeWorkspace.id, {
        user: 0, // placeholder - real implementation would look up user by email
        role: newMemberRole,
      })
      setNewMemberEmail("")
      loadMembers()
      toast.success("Member added")
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to add member")
    } finally {
      setAdding(false)
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
      setActiveWorkspace({
        ...activeWorkspace,
        members: members.map((m) =>
          m.id === memberId ? { ...m, role } : m
        ),
      })
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
          <p className="text-gray-500 text-sm">
            Manage team members, roles, and access
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">Members</h2>
        </div>

        {adding ? (
          <form onSubmit={handleAddMember} className="flex gap-3 mb-6">
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="Email address"
              className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={adding}
              className="bg-indigo-600 text-white px-4 py-2 rounded font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 transition"
          >
            <Plus className="w-4 h-4" /> Add member
          </button>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Member
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                  Role
                </th>
                <th className="pb-3 text-xs font-semibold text-gray-500 uppercase text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="3" className="py-8 text-center text-gray-500">
                    Loading members...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan="3" className="py-8 text-center text-gray-500">
                    No members found.
                  </td>
                </tr>
              ) : (
                members.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-gray-50 hover:bg-gray-50 transition"
                  >
                    <td className="py-3 text-sm text-gray-900">
                      {m.user_email || m.email || "Unknown"}
                    </td>
                    <td className="py-3 text-sm">
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-sm text-right">
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        className="text-xs text-red-500 hover:text-red-700 transition"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
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
