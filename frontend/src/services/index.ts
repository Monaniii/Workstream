import axios from "axios"

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api"

export interface Workspace {
  id: number
  name: string
  slug: string
  plan: string
  member_count?: number
  current_user_role?: "admin" | "manager" | "member" | "viewer" | null
}

export interface Membership {
  id: number
  user: number
  user_email: string
  role: string
  must_change_password?: boolean
  email_sent?: boolean
}

export interface Project {
  id: number
  workspace: number
  name: string
  key: string
  description: string
  objectives?: string
  status?: string
  priority?: string
  owner?: number | null
  owner_email?: string
  owner_name?: string
  manager?: number | null
  manager_name?: string
  start_date?: string | null
  target_date?: string | null
  visibility?: string
  tags?: string[]
  progress_percentage?: number
  team_members?: number[]
  health?: string
}

export interface ProjectTeamMember {
  id: number
  email: string
  username: string
  full_name: string
  role?: string
}

export interface Board {
  id: number
  workspace: number
  project: number
  name: string
  columns: any[]
}

export interface Sprint {
  id: number
  workspace: number
  board: number
  name: string
  goal: string
  status: string
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface IssueStatus {
  id: number
  workspace: number
  name: string
  key: string
  color: string
  is_initial: boolean
  is_final: boolean
  position: number
}

export interface Issue {
  id: number
  workspace: number
  project: number
  project_key: string
  project_name: string
  board: number | null
  sprint: number | null
  parent_issue?: number | null
  subtasks?: number[]
  blocked_by?: number[]
  comment_count?: number
  key: string
  title: string
  summary: string
  description: string
  status: number
  status_name: string
  status_key: string
  status_is_final: boolean
  priority: string
  issue_type: string
  assignee: number | null
  assignee_email: string
  reporter: number | null
  reporter_email: string
  column_id: string
  position: number
  due_date?: string | null
  closed_at?: string | null
  is_closed?: boolean
  is_overdue?: boolean
}

export interface Comment {
  id: number
  issue: number
  author: number | null
  author_email: string
  body: string
  created_at: string
}

export interface Attachment {
  id: number
  issue: number
  filename: string
  file_url: string
  content_type: string
  size: number
}

export interface IssuePage {
  count: number
  next: string | null
  previous: string | null
  results: Issue[]
}

const axiosInstance = axios.create({ baseURL: API_BASE })

axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) config.headers.Authorization = `Token ${token}`
  const slug = localStorage.getItem("workspaceSlug")
  if (slug) config.headers["X-Tenant-Slug"] = slug
  return config
})

// Unwrap DRF paginated responses ({results, count, ...}) to plain arrays
axiosInstance.interceptors.response.use(
  (response) => {
    const data = response.data
    if (data && typeof data === "object" && Array.isArray(data.results)) {
      response.data = data.results
    }
    return response
  },
  (error) => Promise.reject(error)
)

export const authApi = {
  changePassword: (data: { current_password: string; new_password: string }) =>
    axiosInstance
      .post<{ token: string; user: any }>("/auth/change-password/", data)
      .then((r) => r.data),
}

export const workspacesApi = {
  list: () => axiosInstance.get<Workspace[]>("/tenants/workspaces/").then((r) => r.data),
  create: (data: { name: string; slug?: string; plan?: string }) =>
    axiosInstance.post<Workspace>("/tenants/workspaces/", data).then((r) => r.data),
  update: (id: number, data: { name?: string; slug?: string; plan?: string }) =>
    axiosInstance.patch<Workspace>(`/tenants/workspaces/${id}/`, data).then((r) => r.data),
  members: (id: number) =>
    axiosInstance.get<Membership[]>(`/tenants/workspaces/${id}/members/`).then((r) => r.data),
  addMember: (
    id: number,
    data: { email: string; role: string; first_name?: string; last_name?: string }
  ) =>
    axiosInstance
      .post<Membership & { email_sent?: boolean }>(`/tenants/workspaces/${id}/members/`, data)
      .then((r) => r.data),
  updateMemberRole: (id: number, memberId: number, role: string) =>
    axiosInstance.patch(`/tenants/workspaces/${id}/members/${memberId}/`, { role }).then((r) => r.data),
  removeMember: (id: number, memberId: number) =>
    axiosInstance.delete(`/tenants/workspaces/${id}/members/${memberId}/`),
}

export const projectsApi = {
  list: (params?: Record<string, string>) =>
    axiosInstance.get<Project[]>("/projects/", { params }).then((r) => r.data),
  create: (data: Partial<Project>) =>
    axiosInstance.post<Project>("/projects/", data).then((r) => r.data),
  get: (id: number) =>
    axiosInstance.get<Project>(`/projects/${id}/`).then((r) => r.data),
  update: (id: number, data: Partial<Project>) =>
    axiosInstance.patch<Project>(`/projects/${id}/`, data).then((r) => r.data),
  remove: (id: number) => axiosInstance.delete(`/projects/${id}/`),
  members: (id: number) =>
    axiosInstance.get<ProjectTeamMember[]>(`/projects/${id}/members/`).then((r) => r.data),
  updateMembers: (id: number, member_ids: number[]) =>
    axiosInstance.put<ProjectTeamMember[]>(`/projects/${id}/members/`, { member_ids }).then((r) => r.data),
}

export const boardsApi = {
  list: (params?: Record<string, string>) =>
    axiosInstance.get<Board[]>("/projects/boards/", { params }).then((r) => r.data),
  create: (data: Partial<Board>) =>
    axiosInstance.post<Board>("/projects/boards/", data).then((r) => r.data),
}

export const sprintsApi = {
  list: (params?: Record<string, string>) =>
    axiosInstance.get<Sprint[]>("/projects/sprints/", { params }).then((r) => r.data),
  create: (data: Partial<Sprint>) =>
    axiosInstance.post<Sprint>("/projects/sprints/", data).then((r) => r.data),
  update: (id: number, data: Partial<Sprint>) =>
    axiosInstance.patch<Sprint>(`/projects/sprints/${id}/`, data).then((r) => r.data),
  remove: (id: number) => axiosInstance.delete(`/projects/sprints/${id}/`),
}

export const statusesApi = {
  list: (params?: Record<string, string>) =>
    axiosInstance.get<IssueStatus[]>("/issues/statuses/", { params }).then((r) => r.data),
}

export const issuesApi = {
  list: (params?: Record<string, string>) =>
    axiosInstance.get<Issue[]>("/issues/", { params }).then((r) => r.data),
  create: (data: Partial<Issue>) =>
    axiosInstance.post<Issue>("/issues/", data).then((r) => r.data),
  update: (id: number, data: Partial<Issue>) =>
    axiosInstance.patch<Issue>(`/issues/${id}/`, data).then((r) => r.data),
  move: (id: number, column_id: string, position: number) =>
    axiosInstance.post<Issue>(`/issues/${id}/move/`, { column_id, position }).then((r) => r.data),
  transition: (id: number, status_id: number) =>
    axiosInstance.post<Issue>(`/issues/${id}/transition/`, { status_id }).then((r) => r.data),
  get: (id: number) =>
    axiosInstance.get<Issue>(`/issues/${id}/`).then((r) => r.data),
  remove: (id: number) => axiosInstance.delete(`/issues/${id}/`),
  close: (id: number) =>
    axiosInstance.post<Issue>(`/issues/${id}/close/`, {}).then((r) => r.data),
  reopen: (id: number) =>
    axiosInstance.post<Issue>(`/issues/${id}/reopen/`, {}).then((r) => r.data),
  myWork: (params?: Record<string, string>) =>
    axiosRaw.get<IssuePage>("/issues/my-work/", { params }).then((r) => r.data),
}

export const commentsApi = {
  list: (issueId: number) =>
    axiosInstance.get<Comment[]>("/issues/comments/", { params: { issue: issueId } }).then((r) => r.data),
  create: (data: { issue: number; body: string }) =>
    axiosInstance.post<Comment>("/issues/comments/", data).then((r) => r.data),
}

export const attachmentsApi = {
  list: (issueId: number) =>
    axiosInstance.get<Attachment[]>("/issues/attachments/", { params: { issue: issueId } }).then((r) => r.data),
  upload: (issueId: number, file: File) => {
    const form = new FormData()
    form.append("issue", String(issueId))
    form.append("file", file)
    return axiosInstance.post<Attachment>("/issues/attachments/", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data)
  },
}



export const reportsApi = {
  overview: (params?: Record<string, string>) =>
    axiosInstance.get<any>("/reports/overview/", { params }).then((r) => r.data),
  projects: (params?: Record<string, string>) =>
    axiosInstance.get<any>("/reports/projects/", { params }).then((r) => r.data),
  tasks: (params?: Record<string, string>) =>
    axiosInstance.get<any>("/reports/tasks/", { params }).then((r) => r.data),
  team: (params?: Record<string, string>) =>
    axiosInstance.get<any>("/reports/team/", { params }).then((r) => r.data),
  activity: (params?: Record<string, string>) =>
    axiosInstance.get<any>("/reports/activity/", { params }).then((r) => r.data),
  projectAnalytics: (projectId: number) =>
    axiosInstance
      .get<any>("/reports/project-analytics/", { params: { project: String(projectId) } })
      .then((r) => r.data),
  exportCsv: (data: {
    report_type: string
    start_date?: string
    end_date?: string
    period?: string
  }) =>
    axiosInstance
      .post<Blob>("/reports/export/csv/", data, {
        responseType: "blob",
      })
      .then((r) => r.data),
}

export const notificationsApi = {
  list: () => axiosInstance.get<any[]>("/notifications/notifications/").then((r) => r.data),
  markRead: (id: number) => axiosInstance.post(`/notifications/notifications/${id}/read/`),
  markAllRead: () => axiosInstance.post("/notifications/notifications/read-all/"),
}

export const billingApi = {
  plans: () => axiosInstance.get<any[]>("/billing/plans/").then((r) => r.data),
  subscription: () => axiosInstance.get<any>("/billing/subscription/").then((r) => r.data),
  createCheckout: (priceId: string) =>
    axiosInstance.post<{ checkout_url: string; session_id: string }>(
      "/billing/subscription/checkout/",
      { price_id: priceId }
    ).then((r) => r.data),
  portal: () =>
    axiosInstance.post<{ portal_url: string }>("/billing/subscription/portal/").then((r) => r.data),
  invoices: () => axiosInstance.get<any[]>("/billing/invoices/").then((r) => r.data),
}

export const webhooksApi = {
  list: () => axiosInstance.get<any[]>("/webhooks/endpoints/").then((r) => r.data),
  create: (data: { url: string; secret?: string; events: string[] }) =>
    axiosInstance.post("/webhooks/endpoints/", data).then((r) => r.data),
  deliveries: (endpointId: number) =>
    axiosInstance.get<any[]>("/webhooks/deliveries/", { params: { endpoint: endpointId } }).then((r) => r.data),
}

// Raw axios instance (no paginated-response unwrapping) for APIs whose views
// need pagination metadata.
const axiosRaw = axios.create({ baseURL: API_BASE })

axiosRaw.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) config.headers.Authorization = `Token ${token}`
  const slug = localStorage.getItem("workspaceSlug")
  if (slug) config.headers["X-Tenant-Slug"] = slug
  return config
})

export interface AuditEvent {
  id: string
  timestamp: string
  created_at: string
  actor: number | null
  actor_type: string
  actor_name: string
  actor_email: string
  workspace: number | null
  workspace_slug: string
  workspace_name: string
  action: string
  action_display: string
  module: string
  module_display: string
  resource_type: string
  resource_id: string
  resource_name: string
  description: string
  outcome: string
  outcome_display: string
  changed_fields: Record<string, any>
  request_id: string
  http_method: string
  route: string
  ip_address: string | null
  user_agent: string
  session_key: string
  metadata: Record<string, any>
}

export interface AuditStats {
  total_events: number
  successful_actions: number
  failed_actions: number
  denied_actions: number
  error_actions: number
  security_events: number
}

export interface AuditPage {
  count: number
  next: string | null
  previous: string | null
  results: AuditEvent[]
}

export const auditApi = {
  list: (params?: Record<string, string>) =>
    axiosRaw
      .get<AuditPage>("/audit/events/", { params })
      .then((r) => r.data),
  get: (id: string) =>
    axiosRaw.get<AuditEvent>(`/audit/events/${id}/`).then((r) => r.data),
  stats: () =>
    axiosRaw.get<AuditStats>("/audit/events/stats/").then((r) => r.data),
  exportCsv: (params?: Record<string, string>) =>
    axiosRaw
      .get<Blob>("/audit/events/export/csv/", { params, responseType: "blob" })
      .then((r) => r.data),
}

export default axiosInstance
