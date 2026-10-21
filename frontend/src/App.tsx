import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useAuth } from "./context/AuthContext"
import { Shell } from "./layout/Shell"
import LoginPage from "./pages/LoginPage"
import RegisterPage from "./pages/RegisterPage"
import DashboardPage from "./pages/DashboardPage"
import ProjectListPage from "./pages/ProjectListPage"
import ProjectDetailPage from "./pages/ProjectDetailPage"
import BoardPage from "./pages/BoardPage"
import ReportsPage from "./pages/ReportsPage"
import ActivityPage from "./pages/ActivityPage"
import CalendarPage from "./pages/CalendarPage"
import NotificationsPage from "./pages/NotificationsPage"
import SettingsGeneralPage from "./pages/SettingsGeneralPage"
import SettingsMembersPage from "./pages/SettingsMembersPage"
import BillingPage from "./pages/BillingPage"

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  if (isLoading) return <div className="p-8 text-center">Loading...</div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/new" element={<ProjectListPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/board" element={<BoardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings/general" element={<SettingsGeneralPage />} />
        <Route path="settings/members" element={<SettingsMembersPage />} />
        <Route path="billing" element={<BillingPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
