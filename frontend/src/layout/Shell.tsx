import { useState } from "react"
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import {
  Menu,
  X,
  Layout,
  Briefcase,
  Search,
  Bell,
  User,
  LogOut,
  ChevronLeft,
  BarChart3,
  Settings,
  CreditCard,
  ClipboardList,
  Calendar,
  Shield,
} from "lucide-react"

const NAV_ITEMS = [
  { name: "Dashboard", href: "/app", icon: Layout },
  { name: "Projects", href: "/app/projects", icon: Briefcase },
  { name: "Reports", href: "/app/reports", icon: BarChart3 },
  { name: "Team", href: "/app/settings/members", icon: User },
  { name: "Activity", href: "/app/activity", icon: ClipboardList },
  { name: "Calendar", href: "/app/calendar", icon: Calendar },
  { name: "Notifications", href: "/app/notifications", icon: Bell },
]

const SETTINGS_ITEMS = [
  { name: "Workspace", href: "/app/settings/general", icon: Settings },
  { name: "Members", href: "/app/settings/members", icon: User },
  { name: "Billing", href: "/app/billing", icon: CreditCard },
]

export function Shell({ children }: { children: React.ReactNode }) {
  const { user, activeWorkspace, workspaces, logout, setActiveWorkspace } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

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
  const showAudit = user?.is_superuser || user?.is_staff

  const initials = (name?: string | null) => {
    if (!name) return "U"
    return name
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("")
  }

  return (
    <div className="flex h-screen bg-[#FAFAFC] text-[#1F2937] selection:bg-blue-200">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full w-64 z-30 transform transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:relative md:translate-x-0`}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/10 bg-[#0F172A]">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-900 flex items-center justify-center text-white text-2xl shadow-xl shadow-blue-500/40">
              W
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-tight text-white italic">Workstream</span>
              <span className="text-[10px] font-medium text-blue-300 uppercase tracking-wider mt-0.5">
                Plan. Collaborate. Get It Done.
              </span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 text-white/70 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition ${
                    active
                      ? "bg-blue-50 text-blue-700 font-medium shadow-sm shadow-blue-100/50 border border-blue-100"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-100/50"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-slate-800/40 pt-5">
            {SETTINGS_ITEMS.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-slate-400 hover:text-white hover:bg-slate-800/50`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.name}
              </Link>
            ))}
            {showAudit && (
              <Link
                to="/app/audit"
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-slate-400 hover:text-white hover:bg-slate-800/50`}
              >
                <Shield className="w-5 h-5 shrink-0" />
                Audit Log
              </Link>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 w-full p-5 border-t border-white/10 bg-[#0F172A]/80 backdrop-blur-md">
          <div className="flex items-center gap-3 px-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-blue-500/40">
              {initials(user?.username || user?.email)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">
                {user?.email}
              </p>
              <p className="text-[10px] text-slate-500 truncate">
                {activeWorkspace?.name ?? "No workspace"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed left-0 top-0 h-12 border-b border-white/10 bg-[#0F172A] z-40 flex items-center px-4">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 text-white/70 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-blue-900 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-blue-500/30">
            W
          </div>
          <span className="font-bold text-sm truncate text-white">Workstream</span>
        </div>
      </div>

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden ${sidebarOpen ? "md:ml-64" : ""}`}>
        {/* Top navigation */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 text-slate-500 hover:text-slate-900 md:ml-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 relative max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search tasks, projects, people..."
                  className="w-full pl-10 pr-4 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white"
                />
              </div>
              <Link
                to="/app/projects/new"
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
              >
                <Briefcase className="w-4 h-4 mr-2" /> New project
              </Link>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition relative"
                onClick={() => navigate("/app/notifications")}
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
              </button>
              <div className="flex items-center gap-2 pl-4 border-l border-slate-200">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-slate-900">{user?.email}</p>
                  {activeWorkspace && (
                    <p className="text-xs text-slate-500">{activeWorkspace.name}</p>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-blue-500/40">
                  {initials(user?.username || user?.email)}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[#FAFAFC] p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Shell
