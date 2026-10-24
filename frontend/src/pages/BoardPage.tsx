import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate, Link } from "react-router-dom"
import {
  DndContext,
  closestCorners,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useAuth } from "../context/AuthContext"
import {
  issuesApi, boardsApi, statusesApi, commentsApi, attachmentsApi, projectsApi,
  Issue, IssueStatus, ProjectTeamMember,
} from "../services"
import { Plus, MessageSquare, Paperclip, ChevronRight, X, Copy } from "lucide-react"
import toast from "react-hot-toast"

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
}

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  in_review: "bg-purple-100 text-purple-700",
  done: "bg-green-100 text-green-700",
  blocked: "bg-red-100 text-red-700",
}

function IssueCard({ issue, columnId, onMove, onOpen }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: issue.id })
  const style = { transform: CSS.Transform.toCssString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(issue.id)
      }}
      className={`relative p-3 mb-3 rounded-lg border border-gray-200 bg-white shadow-sm cursor-pointer transition hover:shadow-md group ${STATUS_COLORS[issue.status_key] || ""}`}
    >
      <div className="flex items-start gap-2 mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${PRIORITY_COLORS[issue.priority] || ""}`}>{issue.priority}</span>
        <span className="ml-auto text-xs font-mono text-gray-400">{issue.key}</span>
      </div>
      <h4 className="text-sm font-semibold text-gray-900 mb-1 line-clamp-1">{issue.summary || issue.title}</h4>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        {issue.assignee_email && (
          <span className="flex items-center gap-1">
            <Copy className="w-3 h-3" /> {issue.assignee_email.split("@")[0]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-2">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> 0
        </span>
      </div>
    </div>
  )
}

function ColumnCard({ column, issues, onMove, onOpen }: any) {
  const items = [...issues].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return (
    <div className="flex flex-col min-w-[260px]">
      <div className="flex items-center justify-between px-3 py-2 rounded-t-lg bg-gray-100 border-b border-gray-200">
        <span className="font-semibold text-gray-700">{column.name}</span>
        <span className="text-xs font-semibold text-gray-400">{items.length}</span>
      </div>
      <div className="flex-1 p-3 min-h-[400px] bg-gray-50/50 border-b border-gray-200 rounded-b-lg">
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Empty column
          </div>
        ) : (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                columnId={column.id}
                onMove={onMove}
                onOpen={onOpen}
              />
            ))}
          </SortableContext>
        )}
        <button
          onClick={() => onOpen("new", column.id)}
          className="w-full py-2 mt-2 text-xs text-indigo-600 hover:bg-indigo-50 rounded border border-dashed border-indigo-200 text-center"
        >
          <Plus className="w-3 h-3 mr-1" /> Add issue
        </button>
      </div>
    </div>
  )
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { activeWorkspace, user } = useAuth()
  const [columns, setColumns] = useState<any[]>([])
  const [board, setBoard] = useState<any>(null)
  const [statuses, setStatuses] = useState<IssueStatus[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [projectTeam, setProjectTeam] = useState<ProjectTeamMember[]>([])
  const [projectManagerId, setProjectManagerId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; issue: Issue | null }>({ open: false, issue: null })
  const canAssignTasks =
    ["admin", "manager"].includes(activeWorkspace?.current_user_role || "") ||
    projectManagerId === user?.id
  const sensors = useSensors(useSensor(PointerSensor))

  useEffect(() => {
    if (!projectId || !activeWorkspace || !activeWorkspace.id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    let cancelled = false

    Promise.allSettled([
      boardsApi.list({ workspace: String(activeWorkspace.id), project: projectId }),
      statusesApi.list({ workspace: String(activeWorkspace.id) }),
    ]).then((results) => {
      if (cancelled) return

      const boardsResult = results[0]
      const statusesResult = results[1]

      let boardData: any = null

      if (boardsResult.status === "fulfilled") {
        const boardsList = Array.isArray(boardsResult.value) ? boardsResult.value : boardsResult.value?.results ?? []
        if (boardsList.length === 0) {
          navigate(`/app/projects/${projectId}`)
          setLoading(false)
          return
        }
        boardData = boardsList[0]
        setBoard(boardData)
        // Fallback: if board has no columns, generate them from issue statuses
        const boardCols = boardData.columns || []
        if (boardCols.length > 0) {
          setColumns(boardCols)
        } else if (statusesResult.status === "fulfilled") {
          const statusList = Array.isArray(statusesResult.value) ? statusesResult.value : statusesResult.value?.results ?? []
          const defaultCols = statusList.map((s: any, idx: number) => ({
            id: s.key || `status-${s.id}`,
            name: s.name,
            color: s.color || "#6B7280",
            wip_limit: null,
            position: idx,
          }))
          setColumns(defaultCols)
        } else {
          // Hardcoded fallback columns
          setColumns([
            { id: "todo", name: "To Do", color: "#6B7280", wip_limit: null },
            { id: "in-progress", name: "In Progress", color: "#3B82F6", wip_limit: null },
            { id: "done", name: "Done", color: "#10B981", wip_limit: null },
          ])
        }
      } else {
        const err = boardsResult.reason
        setError("Failed to load boards: " + (err?.response?.data?.detail || err?.message || "unknown error"))
        setLoading(false)
        return
      }

      if (statusesResult.status === "fulfilled") {
        const statusesData = Array.isArray(statusesResult.value) ? statusesResult.value : statusesResult.value?.results ?? []
        setStatuses(statusesData)
      }

      // Now load issues for this project (use boardData, not stale state)
      return issuesApi.list({ project: String(boardData.project) })
    }).then((result) => {
      if (cancelled) return
      if (result && result.status === "fulfilled") {
        const issuesData = Array.isArray(result.value) ? result.value : result.value?.results ?? []
        setIssues(issuesData)
      } else if (result && result.status === "rejected") {
        const err = result.reason
        setError("Failed to load issues: " + (err?.response?.data?.detail || err?.message || "unknown error"))
      }
      setLoading(false)
    }).catch((err) => {
      if (cancelled) return
      console.error("Board load error:", err)
      setError("Failed to load board: " + (err?.message || "unknown error"))
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [projectId, activeWorkspace])

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      projectsApi.members(Number(projectId)),
      projectsApi.get(Number(projectId)),
    ])
      .then(([team, project]) => {
        setProjectTeam(team)
        setProjectManagerId(project.manager ?? null)
      })
      .catch((err: any) => {
        toast.error(err.response?.data?.detail || "Failed to load project team")
      })
  }, [projectId])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeIssue = issues.find((i) => i.id === Number(active.id))
    const overIssue = issues.find((i) => i.id === Number(over.id))
    if (!activeIssue || !overIssue) return
    try {
      await issuesApi.move(Number(active.id), overIssue.column_id, overIssue.position)
      setIssues(issues.map((i) => i.id === Number(active.id) ? { ...i, column_id: overIssue.column_id, position: overIssue.position } : i))
      toast.success("Issue moved")
    } catch (err: any) {
      toast.error("Failed to move issue")
    }
  }, [issues])

  const handleIssueClick = (id: number) => {
    const issue = issues.find((i) => i.id === id)
    setModal({ open: true, issue: issue || null })
  }

  const handleNewIssueSubmit = async (draft: {
    title: string
    description: string
    issue_type: string
    priority: string
    assignee: string
  }) => {
    const firstCol = columns[0]
    if (!firstCol || !board || !activeWorkspace) {
      toast.error("The project board is not ready to create a task.")
      return false
    }
    const defaultStatus =
      statuses.find((s) => s.is_initial)?.id ??
      statuses.find((s) => !s.is_final)?.id ??
      statuses[0]?.id
    try {
      await issuesApi.create({
        project: board.project,
        board: board.id,
        summary: draft.title,
        title: draft.title,
        description: draft.description,
        issue_type: draft.issue_type,
        priority: draft.priority,
        ...(canAssignTasks
          ? { assignee: draft.assignee ? Number(draft.assignee) : null }
          : {}),
        status: defaultStatus,
        column_id: String(firstCol.id),
        position: 0,
      })
      setModal({ open: false, issue: null })
      toast.success("Issue created")
      window.location.reload()
      return true
    } catch (err: any) {
      const data = err.response?.data
      toast.error(data?.assignee || data?.detail || "Failed to create issue")
      return false
    }
  }

  if (loading) return <div className="p-8 text-center">Loading board...</div>

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">Error loading board</h2>
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!board) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center">
        <h2 className="text-xl font-bold mb-2">No board found</h2>
        <p className="text-gray-500 mb-4">This project doesn't have a board yet.</p>
        <Link to={`/app/projects/${projectId}`} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
          Back to project
        </Link>
      </div>
    )
  }

  const columnIdSet = new Set(columns.map((c) => String(c.id)))
  const issuesByColumn = columns.map((c: any) => ({
    ...c,
    issues: issues.filter((i) => columnIdSet.has(String(i.column_id)) && String(i.column_id) === String(c.id)),
  }))
  const unassignedIssues = issues.filter((i) => !columnIdSet.has(String(i.column_id)))

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Kanban Board</h1>
          <p className="text-gray-500 text-sm">Drag issues between columns to update status.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/app/projects/" + projectId)} className="px-3 py-2 text-sm border rounded hover:bg-gray-100">Back</button>
          <button onClick={() => setModal({ open: true, issue: null })} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> New issue
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-4 md:flex-row min-h-[700px] overflow-x-auto">
          {columns.length === 0 ? (
            <div className="flex h-full items-center justify-center text-gray-400 text-sm">
              No columns configured for this board.
            </div>
          ) : (
            columns.map((column: any) => (
              <ColumnCard
                key={column.id}
                column={column}
                issues={issuesByColumn.find((c: any) => c.id === column.id)?.issues ?? []}
                boardId={board.id}
                onMove={handleDragEnd}
                onOpen={handleIssueClick}
              />
            ))
          )}
          {unassignedIssues.length > 0 && (
            <ColumnCard
              column={{ id: "unassigned", name: "Unassigned", color: "#9CA3AF" }}
              issues={unassignedIssues}
              boardId={board.id}
              onMove={handleDragEnd}
              onOpen={handleIssueClick}
            />
          )}
        </div>
      </DndContext>

      <IssueModal
        open={modal.open}
        onClose={() => setModal({ open: false, issue: null })}
        issue={modal.issue}
        onIssueCreated={() => window.location.reload()}
        onCreateIssue={handleNewIssueSubmit}
        statuses={statuses}
        teamMembers={projectTeam}
        canAssignTasks={canAssignTasks}
      />
    </div>
  )
}

function IssueModal({
  open,
  onClose,
  issue,
  onIssueCreated,
  onCreateIssue,
  statuses,
  teamMembers,
  canAssignTasks,
}: any) {
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [attachments, setAttachments] = useState<any[]>([])
  const [draft, setDraft] = useState(issue
    ? { title: issue.summary || issue.title, description: issue.description, status: issue.status_key, priority: issue.priority, issue_type: issue.issue_type, assignee: String(issue.assignee || "") }
    : { title: "", description: "", status: "todo", priority: "medium", issue_type: "task", assignee: "" })
  const assignableTeamMembers = teamMembers.filter(
    (member: ProjectTeamMember) => member.role !== "viewer"
  )

  useEffect(() => {
    setDraft(issue
      ? { title: issue.summary || issue.title, description: issue.description, status: issue.status_key, priority: issue.priority, issue_type: issue.issue_type, assignee: String(issue.assignee || "") }
      : { title: "", description: "", status: statuses.find((s: any) => s.is_initial)?.key || "todo", priority: "medium", issue_type: "task", assignee: "" })
    setComments([])
    setAttachments([])
    if (issue) {
      commentsApi.list(issue.id).then(setComments)
      attachmentsApi.list(issue.id).then(setAttachments)
    }
  }, [issue, open, statuses])

  const handleSave = async () => {
    try {
      if (issue) {
        await issuesApi.update(issue.id, {
          summary: draft.title,
          description: draft.description,
          priority: draft.priority,
          issue_type: draft.issue_type,
          ...(canAssignTasks
            ? { assignee: draft.assignee ? Number(draft.assignee) : null }
            : {}),
        })
        const status = statuses.find((s: any) => s.key === draft.status)
        if (status) await issuesApi.transition(issue.id, status.id)
        toast.success("Saved")
      } else {
        if (!draft.title.trim()) {
          toast.error("Task title is required")
          return
        }
        const created = await onCreateIssue(draft)
        if (!created) return
      }
      onClose()
      if (issue) onIssueCreated()
    } catch (err: any) {
      const data = err.response?.data
      toast.error(
        data?.assignee || data?.detail || "Failed to save changes"
      )
    }
  }

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-bold">{issue ? issue.key : "New issue"}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Title</label>
                <input className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
                  {(statuses || []).map((s: any) => <option key={s.id} value={s.key}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {canAssignTasks && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Assign to project team member</label>
                <select
                  className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={draft.assignee}
                  onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {assignableTeamMembers.map((member: ProjectTeamMember) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
                {assignableTeamMembers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Add non-viewer project team members before assigning tasks.
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
                <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Type</label>
                <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={draft.issue_type} onChange={(e) => setDraft({ ...draft, issue_type: e.target.value })}>
                  <option value="task">Task</option>
                  <option value="story">Story</option>
                  <option value="bug">Bug</option>
                  <option value="epic">Epic</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <textarea className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>

            {issue && (
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold mb-2">Comments</h3>
              <div className="space-y-3">
                {comments.map((c: any) => (
                  <div key={c.id} className="p-3 rounded-lg bg-gray-50 text-sm">
                    <p className="text-gray-800 mb-1">{c.body}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{c.author_email}</span>
                      <span>·</span>
                      <span>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." />
                <button disabled className="px-4 py-2 bg-gray-200 text-gray-600 rounded disabled:opacity-50">Send</button>
              </div>
            </div>
            )}

            {issue && (
            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold mb-2">Attachments</h3>
              <div className="space-y-2">
                {attachments.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <a href={a.file_url} className="text-indigo-600 hover:underline">{a.filename}</a>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Close</button>
            <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
              {issue ? "Save changes" : "Create task"}
            </button>
          </div>
      </div>
    </div>
  )
}
