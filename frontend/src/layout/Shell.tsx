import { useState } from "react"
import { Link, useLocation, useNavigate, useParams, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import {
  Menu,
  X,
  Layout,
  Briefcase,
  Calendar,
  Search,
  Bell,
  User,
  Settings,
  LogOut,
  ChevronLeft,
  BarChart3,
  ClipboardList,
  CreditCard,
} from "lucide-react"
import toast from "react-hot-toast"

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, activeWorkspace, workspaces, logout, setActiveWorkspace } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { workspaceSlug } = useParams<{ workspaceSlug?: string }>()

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  const handleWorkspaceSelect = (slug: string) => {
    const ws = workspaces.find((w) => w.slug === slug)
    if (ws) {
      setActiveWorkspace(slug)
      setMobileMenuOpen(false)
    }
  }

  const isActive = (path: string) => location.pathname.startsWith(path)

  const navItems = [
    { name: "Overview", href: "/app/overview", icon: Layout },
    { name: "Projects", href: "/app/projects", icon: Briefcase },
    { name: "Board", href: "/app/board", icon: Layout },
    { name: "Backlog", href: "/app/backlog", icon: ClipboardList },
    { name: "Calendar", href: "/app/calendar", icon: Calendar },
    { name: "Reports", href: "/app/reports", icon: BarChart3 },
    { name: "Activity", href: "/app/activity", icon: ClipboardList },
    { name: "Notifications", href: "/app/notifications", icon: Bell },
  ]

  const settingsItems = [
    { name: "General", href: "/app/settings/general", icon: Settings },
    { name: "Members", href: "/app/settings/members", icon: User },
    { name: "Billing", href: "/app/billing", icon: CreditCard },
  ]

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 border-r border-gray-200 bg-white z-30 transform transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:relative md:translate-x-0`}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Layout className="w-6 h-6 text-indigo-600" />
            <span className="font-bold text-lg tracking-tight">MultiTii</span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Workspace
            </h3>
            <select
              value={activeWorkspace?.slug ?? ""}
              onChange={(e) => handleWorkspaceSelect(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
              disabled={!activeWorkspace}
            >
              <option value="" disabled>
                Select workspace
              </option>
              {workspaces.map((ws) => (
                <option key={ws.id} value={ws.slug}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>

          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Navigation
          </h3>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                    active
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="absolute bottom-0 w-full p-4 border-t border-gray-200">
          <div className="space-y-1">
            {settingsItems.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${isActive(item.href) ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <item.icon className="w-5 h-5" />
                {item.name}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 transition"
            >
              <LogOut className="w-5 h-5" /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <div className="md:hidden fixed left-0 top-0 h-12 border-b border-gray-200 bg-white z-40 flex items-center px-4">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 text-gray-500 hover:text-gray-700"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <Layout className="w-5 h-5 text-indigo-600" />
          <span className="font-bold text-sm truncate">MultiTii</span>
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden ${
        sidebarOpen ? "md:ml-64" : ""
      }`}>
        {/* Top navigation */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 text-gray-500 hover:text-gray-700 md:ml-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search issues, projects..."
                  className="w-full pl-10 pr-4 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
              >
                <Layout className="w-4 h-4 mr-2" /> New project
              </button>
            </div>

            <div className="flex items-center gap-4">
              <button
                className="p-2 text-gray-500 hover:text-indigo-600 relative"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </button>
              <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium">{user?.email}</p>
                  {activeWorkspace && (
                    <p className="text-xs text-gray-500">{activeWorkspace.name}</p>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-medium text-xs">
                  {user?.username?.charAt(0).toUpperCase() || "U"}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-gray-50 p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Shell