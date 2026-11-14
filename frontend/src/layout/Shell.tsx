import { FormEvent, useEffect, useRef, useState } from "react"
import { Link, useLocation, useNavigate, Outlet } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"
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
  Moon,
  Sun,
  CheckSquare,
} from "lucide-react"

const NAV_ITEMS = [
  { name: "Dashboard", href: "/app", icon: Layout },
  { name: "My Work", href: "/app/my-work", icon: CheckSquare },
  { name: "Projects", href: "/app/projects", icon: Briefcase },
  { name: "Reports", href: "/app/reports", icon: BarChart3 },
  { name: "Activity", href: "/app/activity", icon: ClipboardList },
  { name: "Calendar", href: "/app/calendar", icon: Calendar },
  { name: "Notifications", href: "/app/notifications", icon: Bell },
]

const SETTINGS_ITEMS = [
  { name: "Workspace", href: "/app/settings/general", icon: Settings },
]

export function Shell() {
  const { user, activeWorkspace, workspaces, logout, setActiveWorkspace } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [searchText, setSearchText] = useState("")
  const searchInput = useRef<HTMLInputElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchInput.current?.focus()
      }
    }
    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = searchText.trim()
    if (query) navigate(`/app/search?q=${encodeURIComponent(query)}`)
  }

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

  const isActive = (path: string) =>
    path === "/app"
      ? location.pathname === path
      : location.pathname === path || location.pathname.startsWith(`${path}/`)
  // Audit Log is restricted to platform superusers and workspace admins.
  const showAudit =
    Boolean(user?.is_superuser) || activeWorkspace?.current_user_role === "admin"
  const showBilling = activeWorkspace?.current_user_role === "admin"
  // Member roster is visible to admins and managers (managers need it to
  // staff their project teams). Onboarding inside it is admin-only.
  const showMembers = ["admin", "manager"].includes(
    activeWorkspace?.current_user_role || ""
  )
  const canManageProjects = ["admin", "manager"].includes(
    activeWorkspace?.current_user_role || ""
  )

  const initials = (name?: string | null) => {
    if (!name) return "U"
    return name
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("")
  }

  return (
    <div className="flex h-screen bg-canvas text-ink selection:bg-blue-200 dark:selection:bg-blue-900/60">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 flex h-full w-64 z-30 transform flex-col bg-[#0F172A] transition-transform duration-300 ${
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

        <div className="p-5 space-y-6 overflow-y-auto">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition ${
                    active
                      ? "bg-blue-500/15 text-blue-300 font-medium shadow-sm ring-1 ring-blue-400/20"
                      : "text-ink-subtle hover:text-white hover:bg-surface/5"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-white/10 pt-5">
            {showMembers && (
              <Link
                to="/app/settings/members"
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-ink-subtle hover:text-white hover:bg-surface/5`}
              >
                <User className="w-5 h-5 shrink-0" />
                Members
              </Link>
            )}
            {SETTINGS_ITEMS.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-ink-subtle hover:text-white hover:bg-surface/5`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {item.name}
              </Link>
            ))}
            {showBilling && (
              <Link
                to="/app/billing"
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-ink-subtle hover:text-white hover:bg-surface/5`}
              >
                <CreditCard className="w-5 h-5 shrink-0" />
                Billing
              </Link>
            )}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-ink-subtle hover:text-white hover:bg-surface/5"
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="w-5 h-5 shrink-0" />
              ) : (
                <Moon className="w-5 h-5 shrink-0" />
              )}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
            {showAudit && (
              <Link
                to="/app/audit"
                className={`flex items-center gap-3.5 px-3 py-3 rounded-xl text-sm transition text-ink-subtle hover:text-white hover:bg-surface/5`}
              >
                <Shield className="w-5 h-5 shrink-0" />
                Audit Log
              </Link>
            )}
          </div>
        </div>

        <div className="w-full shrink-0 p-5 border-t border-white/10 bg-[#0F172A]/80 backdrop-blur-md">
          <div className="flex items-center gap-3 px-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-blue-500/40">
              {initials(user?.username || user?.email)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">
                {user?.email}
              </p>
              <p className="text-[10px] text-ink-muted truncate">
                {activeWorkspace?.name ?? "No workspace"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-ink-subtle hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
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
        <button
          type="button"
          onClick={() => navigate("/app/search")}
          className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Search tasks and projects"
        >
          <Search className="h-5 w-5" />
        </button>
      </div>

      {/* Main content */}
      <div className={`flex-1 flex flex-col overflow-hidden ${sidebarOpen ? "md:ml-64" : ""}`}>
        {/* Top navigation */}
        <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-line">
          <div className="flex items-center justify-between px-6 py-3">
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 text-ink-muted hover:text-ink md:ml-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <form className="flex-1 relative max-w-md" onSubmit={submitSearch}>
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  ref={searchInput}
                  type="text"
                  placeholder="Search tasks and projects..."
                  aria-label="Search tasks and projects"
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  className="w-full pl-10 pr-4 py-1.5 text-sm border border-line rounded-lg bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-subtle">
                  Ctrl K
                </kbd>
              </form>
              {canManageProjects && (
                <Link
                  to="/app/projects/new"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition shadow-sm shadow-blue-500/20"
                >
                  <Briefcase className="w-4 h-4 mr-2" /> New project
                </Link>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleTheme}
                className="p-2 text-ink-muted hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition"
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? (
                  <Sun className="w-5 h-5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>
              <button
                className="p-2 text-ink-muted hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition relative"
                onClick={() => navigate("/app/notifications")}
                aria-label="Open notifications"
                title="Notifications"
              >
                <Bell className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 pl-4 border-l border-line">
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-ink">{user?.email}</p>
                  {activeWorkspace && (
                    <p className="text-xs text-ink-muted">{activeWorkspace.name}</p>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-blue-500/40">
                  {initials(user?.username || user?.email)}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-canvas p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Shell
