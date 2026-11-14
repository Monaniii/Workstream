import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { Bell, LogOut } from "lucide-react"

export default function Navbar() {
  const { user, activeWorkspace, logout } = useAuth()

  return (
    <nav className="bg-surface border-b border-line px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
          <span className="text-xl">⟠</span> <span>Workstream</span>
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <Link
          to="/app/notifications"
          className="p-2 text-ink-muted hover:text-blue-500 hover:bg-surface-muted rounded-lg transition"
          aria-label="Open notifications"
          title="Notifications"
        >
          <Bell className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-3 pl-4 border-l border-line">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user?.email}</p>
            {activeWorkspace && <p className="text-xs text-ink-muted">{activeWorkspace.name}</p>}
          </div>
          <button
            onClick={logout}
            className="text-sm text-ink-muted hover:text-ink flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
