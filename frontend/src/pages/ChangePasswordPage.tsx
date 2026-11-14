import { useState } from "react"
import { ShieldCheck } from "lucide-react"
import toast from "react-hot-toast"
import { useAuth } from "../context/AuthContext"
import { authApi } from "../services"

export default function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match")
      return
    }
    if (newPassword.length < 8) {
      toast.error("Use at least 8 characters")
      return
    }
    setSaving(true)
    try {
      const data = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      })
      localStorage.setItem("token", data.token)
      setUser({ ...user!, ...data.user, must_change_password: false })
      toast.success("Password updated")
    } catch (err: any) {
      const d = err.response?.data
      toast.error(
        d?.current_password?.[0] ||
          d?.new_password?.[0] ||
          d?.detail ||
          "Could not update password"
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink">Set a new password</h1>
            <p className="text-xs text-ink-muted">
              You signed in with a temporary password.
            </p>
          </div>
        </div>

        <p className="mb-5 rounded-lg bg-blue-500/10 px-3 py-2 text-xs text-blue-800">
          Choose your own password to continue. Your temporary password was sent
          by email and should no longer be used.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">
              Temporary password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-xl border border-line px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              required
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Update password and continue"}
          </button>
        </form>

        <button
          onClick={logout}
          className="mt-4 w-full text-center text-xs text-ink-muted hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
