import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { Bell, LogOut } from "lucide-react"
import toast from "react-hot-toast"

export default function Navbar() {
  const { user, activeWorkspace, logout } = useAuth()

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
          <span className="text-xl">⟠</span> <span>Workstream</span>
        </Link>
      </div>
      <div className="flex items-center gap-4">
        <button
          className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-50 rounded-lg transition"
          onClick={() => toast.success("Notifications opened")}
        >
          <Bell className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 pl-4 border-l border-gray-200">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{user?.email}</p>
            {activeWorkspace && <p className="text-xs text-gray-500">{activeWorkspace.name}</p>}
          </div>
          <button
            onClick={logout}
            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </nav>
  )
}
