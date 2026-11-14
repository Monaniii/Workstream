import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useAuth } from "./context/AuthContext"
import { Shell } from "./layout/Shell"
import LoginPage from "./pages/LoginPage"
import ChangePasswordPage from "./pages/ChangePasswordPage"
import DashboardPage from "./pages/DashboardPage"
import ProjectListPage from "./pages/ProjectListPage"
import ProjectCreatePage from "./pages/ProjectCreatePage"
import ProjectDetailPage from "./pages/ProjectDetailPage"
import BoardPage from "./pages/BoardPage"
import ReportsPage from "./pages/ReportsPage"
import ActivityPage from "./pages/ActivityPage"
import CalendarPage from "./pages/CalendarPage"
import NotificationsPage from "./pages/NotificationsPage"
import SettingsGeneralPage from "./pages/SettingsGeneralPage"
import SettingsMembersPage from "./pages/SettingsMembersPage"
import BillingPage from "./pages/BillingPage"
import AuditLogPage from "./pages/AuditLogPage"
import SearchPage from "./pages/SearchPage"
import MyWorkPage from "./pages/MyWorkPage"

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  // Accounts provisioned by an admin must replace their temporary password first.
  if (user.must_change_password) return <Navigate to="/change-password" replace />
  return <>{children}</>
}

function RequirePasswordChange({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (!user.must_change_password) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** Audit Log is restricted to superusers and workspace admins (mirrors the API). */
function RequireAuditAccess({ children }: { children: React.ReactNode }) {
  const { user, activeWorkspace, isLoading } = useAuth()
  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  const allowed =
    Boolean(user?.is_superuser) || activeWorkspace?.current_user_role === "admin"
  if (!allowed) return <Navigate to="/app" replace />
  return <>{children}</>
}

/** Billing is limited to workspace admins, matching the billing API. */
function RequireBillingAccess({ children }: { children: React.ReactNode }) {
  const { activeWorkspace, isLoading } = useAuth()
  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  if (activeWorkspace?.current_user_role !== "admin") {
    return <Navigate to="/app" replace />
  }
  return <>{children}</>
}

/** Member roster: admins and managers. Onboarding inside the page is admin-only. */
function RequireMemberRosterAccess({ children }: { children: React.ReactNode }) {
  const { user, activeWorkspace, isLoading } = useAuth()
  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  const allowed =
    Boolean(user?.is_superuser) ||
    ["admin", "manager"].includes(activeWorkspace?.current_user_role || "")
  if (!allowed) return <Navigate to="/app" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/change-password"
        element={
          <RequirePasswordChange>
            <ChangePasswordPage />
          </RequirePasswordChange>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="my-work" element={<MyWorkPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<ProjectCreatePage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/board" element={<BoardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings/general" element={<SettingsGeneralPage />} />
        <Route
          path="settings/members"
          element={
            <RequireMemberRosterAccess>
              <SettingsMembersPage />
            </RequireMemberRosterAccess>
          }
        />
        <Route
          path="billing"
          element={
            <RequireBillingAccess>
              <BillingPage />
            </RequireBillingAccess>
          }
        />
        <Route
          path="audit"
          element={
            <RequireAuditAccess>
              <AuditLogPage />
            </RequireAuditAccess>
          }
        />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
