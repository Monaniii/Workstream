import { useState, useEffect, useCallback, useRef } from "react"
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom"
import {
  DndContext,
  closestCorners,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"
import { useAuth } from "../context/AuthContext"
import {
  issuesApi, boardsApi, statusesApi, commentsApi, attachmentsApi, projectsApi,
  Issue, IssueStatus, ProjectTeamMember,
} from "../services"
import { Plus, MessageSquare, Paperclip, ChevronRight, X, Copy, Lock, CircleDot, CalendarClock, GitBranch } from "lucide-react"
import toast from "react-hot-toast"
import { columnKeyFor, groupIssuesByColumn } from "./boardLogic"

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-surface-inset text-ink",
  medium: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  high: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  critical: "bg-red-500/15 text-red-600 dark:text-red-400",
}

const STATUS_COLORS: Record<string, string> = {
  todo: "bg-surface-inset text-ink",
  in_progress: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  in_review: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  done: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  blocked: "bg-red-500/15 text-red-600 dark:text-red-400",
}

function IssueCard({ issue, onOpen, canEdit }: any) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: issue.id })
  // @dnd-kit/utilities exposes Transform.toString(transform) — there is no
  // toCssString in the installed version, and calling it crashed every card.
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(canEdit ? listeners : {})}
      {...(canEdit ? attributes : {})}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(issue.id)
      }}
      className={`relative p-3 mb-3 rounded-lg border border-line bg-surface shadow-sm cursor-pointer transition hover:shadow-md group ${STATUS_COLORS[issue.status_key] || ""} ${canEdit ? "" : "cursor-default"}`}
    >
      <div className="flex items-start gap-2 mb-1">
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${PRIORITY_COLORS[issue.priority] || ""}`}>{issue.priority}</span>
        <span className="ml-auto text-xs font-mono text-ink-subtle">{issue.key}</span>
      </div>
      <h4 className="text-sm font-semibold text-ink mb-1 line-clamp-1">{issue.summary || issue.title}</h4>
      <div className="flex items-center gap-2 text-xs text-ink-muted mb-1">
        {issue.assignee_email && (
          <span className="flex items-center gap-1">
            <Copy className="w-3 h-3" /> {issue.assignee_email.split("@")[0]}
          </span>
        )}
        {issue.is_closed && (
          <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <Lock className="w-2.5 h-2.5" /> Closed
          </span>
        )}
      </div>
      {issue.due_date && (
        <div
          className={`flex items-center gap-1 text-[10px] font-medium ${
            issue.is_overdue ? "text-rose-500" : "text-ink-subtle"
          }`}
        >
          <CalendarClock className="w-3 h-3" />
          {issue.is_overdue ? "Overdue · " : "Due "}
          {new Date(`${issue.due_date}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </div>
      )}
      {((issue.subtasks?.length || 0) > 0 || (issue.blocked_by?.length || 0) > 0) && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-subtle">
          <GitBranch className="h-3 w-3" />
          {issue.subtasks?.length || 0} subtasks
          {issue.blocked_by?.length ? ` · blocked by ${issue.blocked_by.length}` : ""}
        </div>
      )}
      <div className="flex items-center gap-2 text-[10px] text-ink-subtle mt-2">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" /> {issue.comment_count ?? 0}
        </span>
      </div>
    </div>
  )
}

function ColumnCard({ column, issues, onMove, onOpen, canEdit }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${column.id}` })
  const items = [...issues].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return (
    <div className="flex flex-col min-w-[260px] flex-1">
      <div className="flex items-center justify-between px-3 py-2 rounded-t-lg bg-surface-inset border-b border-line">
        <span className="font-semibold text-ink">{column.name}</span>
        <span className="text-xs font-semibold text-ink-subtle">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 p-3 min-h-[400px] border-b border-line rounded-b-lg transition ${
          isOver ? "bg-indigo-500/10 ring-2 ring-inset ring-indigo-300" : "bg-surface-muted/50"
        }`}
      >
        {items.length === 0 ? (
          <div className="flex items-center justify-center h-full text-ink-subtle text-sm">
            Empty column
          </div>
        ) : (
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                onOpen={onOpen}
                canEdit={canEdit}
              />
            ))}
          </SortableContext>
        )}
        {canEdit && (
          <button
            onClick={() => onOpen("new", column.id)}
            className="w-full py-2 mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 rounded border border-dashed border-indigo-200 text-center"
          >
            <Plus className="w-3 h-3 mr-1" /> Add issue
          </button>
        )}
      </div>
    </div>
  )
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { activeWorkspace, user } = useAuth()
  const [columns, setColumns] = useState<any[]>([])
  const [board, setBoard] = useState<any>(null)
  const [statuses, setStatuses] = useState<IssueStatus[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [projectTeam, setProjectTeam] = useState<ProjectTeamMember[]>([])
  const [projectManagerId, setProjectManagerId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modal, setModal] = useState<{ open: boolean; issue: Issue | null; columnId?: string }>({ open: false, issue: null })
  const openedIssueId = useRef<number | null>(null)
  const role = activeWorkspace?.current_user_role || ""
  const isProjectMember =
    Boolean(user?.id) && projectTeam.some((member) => member.id === user?.id)
  const canEdit = role !== "viewer" && isProjectMember
  const canAssignTasks =
    isProjectMember &&
    (["admin", "manager"].includes(role) || projectManagerId === user?.id)
  const sensors = useSensors(useSensor(PointerSensor))

  const closeIssueModal = () => {
    setModal({ open: false, issue: null })
    if (searchParams.has("issue")) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete("issue")
      setSearchParams(nextParams, { replace: true })
    }
  }

  useEffect(() => {
    const requestedId = Number(searchParams.get("issue"))
    if (!requestedId) {
      openedIssueId.current = null
      return
    }
    if (openedIssueId.current === requestedId) return
    const requestedIssue = issues.find((issue) => issue.id === requestedId)
    if (requestedIssue) {
      openedIssueId.current = requestedId
      setModal({ open: true, issue: requestedIssue })
      return
    }
    if (!projectId) return
    openedIssueId.current = requestedId
    issuesApi.get(requestedId)
      .then((found) => {
        if (String(found.project) === projectId) {
          setModal({ open: true, issue: found })
        }
      })
      .catch(() => {
        openedIssueId.current = null
        toast.error("Could not open the requested task")
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete("issue")
        setSearchParams(nextParams, { replace: true })
      })
  }, [issues, projectId, searchParams, setSearchParams])

  const statusKeyById = (() => {
    const map: Record<string, string> = {}
    columns.forEach((column, index) => {
      const resolved = columnKeyFor(column, index, statuses)
      map[String(column.id)] = resolved.key
    })
    return map
  })()

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

      let statusList: IssueStatus[] = []
      if (statusesResult.status === "fulfilled") {
        const raw: any = statusesResult.value
        statusList = (Array.isArray(raw) ? raw : raw?.results ?? []).sort(
          (a: IssueStatus, b: IssueStatus) => (a.position ?? 0) - (b.position ?? 0)
        )
        setStatuses(statusList)
      }

      // Columns derived from the workspace workflow — the default board uses
      // exactly these ids, and they are the fallback when a board has none.
      const workflowColumns = statusList.map((s, idx) => ({
        id: s.key || `status-${s.id}`,
        name: s.name,
        color: s.color || "#6B7280",
        wip_limit: null,
        position: idx,
      }))

      if (boardsResult.status !== "fulfilled") {
        const err = boardsResult.reason
        setError(
          "Failed to load board: " +
            (err?.response?.data?.detail || err?.message || "unknown error")
        )
        setLoading(false)
        return
      }

      const boardsList: any[] = Array.isArray(boardsResult.value)
        ? (boardsResult.value as any[])
        : (boardsResult.value as any)?.results ?? []
      const boardData: any = boardsList[0]
      if (!boardData) {
        // No board provisioned yet: still show the workflow columns so the
        // page renders instead of bouncing back to the project.
        setColumns(
          workflowColumns.length > 0
            ? workflowColumns
            : [
                { id: "todo", name: "To Do", color: "#6B7280", wip_limit: null },
                { id: "in-progress", name: "In Progress", color: "#3B82F6", wip_limit: null },
                { id: "done", name: "Done", color: "#10B981", wip_limit: null },
              ]
        )
        setLoading(false)
        return
      }

      setBoard(boardData)
      const boardCols = boardData.columns || []
      setColumns(
        boardCols.length > 0
          ? boardCols
          : workflowColumns.length > 0
            ? workflowColumns
            : [
                { id: "todo", name: "To Do", color: "#6B7280", wip_limit: null },
                { id: "in-progress", name: "In Progress", color: "#3B82F6", wip_limit: null },
                { id: "done", name: "Done", color: "#10B981", wip_limit: null },
              ]
      )

      // Load issues for this board's project (use boardData, not stale state)
      return issuesApi
        .list({ project: String(boardData.project) })
        .then((raw: any) => {
          if (cancelled) return
          const issuesData = Array.isArray(raw) ? raw : raw?.results ?? []
          setIssues(issuesData)
        })
        .catch((err: any) => {
          if (cancelled) return
          // Keep the board usable even when tasks fail to load.
          console.error("Failed to load issues", err)
          toast.error(
            err?.response?.data?.detail || "Failed to load tasks for this board"
          )
          setIssues([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
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
    if (!canEdit) {
      toast.error("You have read-only access to this project")
      return
    }
    const activeIssue = issues.find((i) => i.id === Number(active.id))
    if (!activeIssue) return
    const overId = String(over.id)
    let targetColumn: any = null
    let targetIssue: Issue | undefined
    if (overId.startsWith("column-")) {
      targetColumn = columns.find((c) => `column-${c.id}` === overId)
    } else {
      targetIssue = issues.find((i) => i.id === Number(over.id))
      if (targetIssue) {
        targetColumn = columns.find((c) => String(c.id) === String(targetIssue!.column_id))
      }
    }
    if (!targetColumn) return
    const targetKey = statusKeyById[String(targetColumn.id)] || String(targetColumn.id)
    const sameColumn = String(activeIssue.column_id) === String(targetColumn.id)
    const targetPosition = targetIssue ? targetIssue.position : 0
    if (sameColumn && targetIssue && activeIssue.position === targetPosition) return
    const previous = issues
    setIssues((current) =>
      current.map((issue) =>
        issue.id === activeIssue.id
          ? {
              ...issue,
              column_id: String(targetColumn!.id),
              position: targetPosition,
              status_key: targetKey,
            }
          : issue
      )
    )
    try {
      await issuesApi.move(Number(active.id), String(targetColumn.id), targetPosition)
      const status = statuses.find((s) => s.key === targetKey)
      if (status && status.id !== activeIssue.status) {
        const updated = await issuesApi.transition(Number(active.id), status.id)
        setIssues((current) =>
          current.map((issue) => (issue.id === activeIssue.id ? updated : issue))
        )
      }
      toast.success("Issue moved")
    } catch (err: any) {
      setIssues(previous)
      toast.error(err.response?.data?.detail || "Failed to move issue")
    }
  }, [issues, columns, statuses, canEdit, statusKeyById])

  const loadIssues = useCallback(async () => {
    if (!board?.project) return
    try {
      const raw: any = await issuesApi.list({ project: String(board.project) })
      setIssues(Array.isArray(raw) ? raw : raw?.results ?? [])
    } catch {
      // Keep the current board contents on a transient failure.
    }
  }, [board?.project])

  const handleIssueClick = (id: number | string, columnId?: string) => {
    // "Add issue" on a column opens the create form pre-set to that column.
    if (id === "new") {
      setModal({ open: true, issue: null, columnId })
      return
    }
    const issue = issues.find((i) => i.id === Number(id))
    setModal({ open: true, issue: issue || null })
  }

  const handleNewIssueSubmit = async (draft: {
    title: string
    description: string
    issue_type: string
    priority: string
    assignee: string
    due_date?: string
    status?: string
    parent_issue?: string
    blocked_by?: string[]
  }) => {
    if (!board || !activeWorkspace) {
      toast.error("The project board is not ready to create a task.")
      return false
    }
    const statusKey =
      draft.status && statuses.some((s) => s.key === draft.status)
        ? draft.status
        : (modal.columnId
            ? statusKeyById[String(modal.columnId)]
            : undefined) ??
          statuses.find((s) => s.is_initial)?.key ??
          statuses.find((s) => !s.is_final)?.key ??
          statuses[0]?.key
    const columnIndex = columns.findIndex(
      (column, index) => columnKeyFor(column, index, statuses).key === statusKey
    )
    const column = columnIndex >= 0 ? columns[columnIndex] : columns[0]
    const status =
      statuses.find((s) => s.key === statusKey) ??
      (column
        ? statuses.find(
            (s) => s.key === columnKeyFor(column, columns.indexOf(column), statuses).key
          )
        : undefined)
    if (!column || !status) {
      toast.error("This board has no workflow columns yet.")
      return false
    }
    try {
      const created = await issuesApi.create({
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
        status: status.id,
        column_id: String(column.id),
        position: 0,
        due_date: draft.due_date || null,
        parent_issue: draft.parent_issue ? Number(draft.parent_issue) : null,
        blocked_by: (draft.blocked_by || []).map(Number),
      })
      setIssues((current) => [
        { ...created, column_id: String(column.id), status_key: status.key },
        ...current,
      ])
      setModal({ open: false, issue: null })
      toast.success("Issue created")
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
        <p className="text-ink-muted mb-4">This project doesn't have a board yet.</p>
        <Link to={`/app/projects/${projectId}`} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
          Back to project
        </Link>
      </div>
    )
  }

  const { issuesByColumn, unassignedIssues } = groupIssuesByColumn(
    columns,
    issues,
    statuses
  )
  const emptyBase = !loading && issues.length === 0
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Kanban Board</h1>
          <p className="text-ink-muted text-sm">
            {canEdit
              ? "Drag issues between columns to update status."
              : "Read-only view — only project team members can update issues."}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/app/projects/" + projectId)} className="px-3 py-2 text-sm border rounded hover:bg-surface-inset">Back</button>
          {canEdit && (
            <button onClick={() => setModal({ open: true, issue: null })} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 flex items-center">
              <Plus className="w-4 h-4 mr-2" /> New issue
            </button>
          )}
        </div>
      </div>

      {!isProjectMember && (
        <div className="mb-4 rounded-lg border-amber-200 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
          You are not on this project team. You can view the board and issues,
          but only project team members can update them.
        </div>
      )}

      {emptyBase && (
        <div className="mb-4 rounded-lg border-line bg-surface px-4 py-3 text-sm text-ink-muted">
          No tasks on this board yet.
          {canEdit ? " Use “New issue” to add the first task." : ""}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-4 md:flex-row min-h-[700px] overflow-x-auto">
          {columns.length === 0 ? (
            <div className="flex h-full items-center justify-center text-ink-subtle text-sm">
              No columns configured for this board.
            </div>
          ) : (
            columns.map((column: any) => (
              <ColumnCard
                key={column.id}
                column={column}
                issues={issuesByColumn.find((c: any) => String(c.id) === String(column.id))?.issues ?? []}
                boardId={board.id}
                onMove={handleDragEnd}
                onOpen={handleIssueClick}
                canEdit={canEdit}
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
              canEdit={false}
            />
          )}
        </div>
      </DndContext>

      <IssueModal
        open={modal.open}
        onClose={closeIssueModal}
        issue={modal.issue}
        onCreateIssue={handleNewIssueSubmit}
        statuses={statuses}
        teamMembers={projectTeam}
        relatedIssues={issues}
        canAssignTasks={canAssignTasks}
        readOnly={!canEdit}
        initialColumnId={modal.columnId}
        onCommentCreated={loadIssues}
        onChanged={(updated: Issue) => {
          setIssues((current) =>
            current.map((i) => (i.id === updated.id ? updated : i))
          )
          // A closed task may need to leave its column; reload to be safe.
          loadIssues()
        }}
      />
    </div>
  )
}

function IssueModal({
  open,
  onClose,
  issue,
  onCreateIssue,
  statuses,
  teamMembers,
  relatedIssues,
  canAssignTasks,
  readOnly,
  initialColumnId,
  onCommentCreated,
  onChanged,
}: any) {
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [attachments, setAttachments] = useState<any[]>([])
  const [togglingClosed, setTogglingClosed] = useState(false)
  const [postingComment, setPostingComment] = useState(false)
  const [draft, setDraft] = useState(issue
    ? { title: issue.summary || issue.title, description: issue.description, status: issue.status_key, priority: issue.priority, issue_type: issue.issue_type, assignee: String(issue.assignee || ""), due_date: issue.due_date || "", parent_issue: String(issue.parent_issue || ""), blocked_by: (issue.blocked_by || []).map(String) }
    : { title: "", description: "", status: "todo", priority: "medium", issue_type: "task", assignee: "", due_date: "", parent_issue: "", blocked_by: [] as string[] })
  const assignableTeamMembers = teamMembers.filter(
    (member: ProjectTeamMember) => member.role !== "viewer"
  )

  useEffect(() => {
    const initialKey =
      statuses.find((s: any) => s.is_initial)?.key ||
      statuses[0]?.key ||
      "todo"
    setDraft(issue
      ? { title: issue.summary || issue.title, description: issue.description, status: issue.status_key, priority: issue.priority, issue_type: issue.issue_type, assignee: String(issue.assignee || ""), due_date: issue.due_date || "", parent_issue: String(issue.parent_issue || ""), blocked_by: (issue.blocked_by || []).map(String) }
      : { title: "", description: "", status: initialColumnId || initialKey, priority: "medium", issue_type: "task", assignee: "", due_date: "", parent_issue: "", blocked_by: [] })
    setComments([])
    setAttachments([])
    setNewComment("")
    if (issue) {
      commentsApi.list(issue.id)
        .then(setComments)
        .catch(() => toast.error("Failed to load task comments"))
      attachmentsApi.list(issue.id)
        .then(setAttachments)
        .catch(() => toast.error("Failed to load task attachments"))
    }
  }, [issue, open, statuses, initialColumnId])

  const postComment = async () => {
    const body = newComment.trim()
    if (!issue || !body || readOnly) return
    setPostingComment(true)
    try {
      const comment = await commentsApi.create({ issue: issue.id, body })
      setComments((current) => [...current, comment])
      setNewComment("")
      onCommentCreated?.()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to post comment")
    } finally {
      setPostingComment(false)
    }
  }

  const toggleClosed = async () => {
    if (!issue) return
    setTogglingClosed(true)
    try {
      const updated = issue.is_closed
        ? await issuesApi.reopen(issue.id)
        : await issuesApi.close(issue.id)
      toast.success(updated.is_closed ? "Task closed" : "Task reopened")
      onChanged?.(updated)
      onClose()
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to update task")
    } finally {
      setTogglingClosed(false)
    }
  }

  const handleSave = async () => {
    if (readOnly) {
      onClose()
      return
    }
    try {
      if (issue) {
        let updated = await issuesApi.update(issue.id, {
          summary: draft.title,
          description: draft.description,
          priority: draft.priority,
          issue_type: draft.issue_type,
          due_date: draft.due_date || null,
          parent_issue: draft.parent_issue ? Number(draft.parent_issue) : null,
          blocked_by: draft.blocked_by.map(Number),
          ...(canAssignTasks
            ? { assignee: draft.assignee ? Number(draft.assignee) : null }
            : {}),
        })
        const status = statuses.find((s: any) => s.key === draft.status)
        if (status && status.id !== issue.status) {
          updated = await issuesApi.transition(issue.id, status.id)
        }
        onChanged?.(updated)
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
      <div className="bg-surface rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between p-4 border-b border-line">
            <h2 className="text-lg font-bold">{issue ? issue.key : "New issue"}</h2>
            <button onClick={onClose} className="text-ink-subtle hover:text-ink-muted"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {issue && (
              <div
                className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs font-medium ${
                  issue.is_closed
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  {issue.is_closed ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <CircleDot className="h-3.5 w-3.5" />
                  )}
                  {issue.is_closed ? "Closed" : "Open"}
                  {issue.is_closed && issue.closed_at
                    ? ` · ${new Date(issue.closed_at).toLocaleDateString()}`
                    : ""}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => toggleClosed()}
                    disabled={togglingClosed}
                    className="rounded-md px-2 py-1 font-semibold underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {togglingClosed
                      ? "Working..."
                      : issue.is_closed
                        ? "Reopen task"
                        : "Close task"}
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Title</label>
                <input className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} disabled={readOnly} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Status</label>
                <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })} disabled={readOnly}>
                  {(statuses || []).map((s: any) => <option key={s.id} value={s.key}>{s.name}</option>)}
                </select>
              </div>
            </div>
            {canAssignTasks && (
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Assign to project team member</label>
                <select
                  className="w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={draft.assignee}
                  onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
                  disabled={readOnly}
                >
                  <option value="">Unassigned</option>
                  {assignableTeamMembers.map((member: ProjectTeamMember) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name || member.email}
                    </option>
                  ))}
                </select>
                {assignableTeamMembers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    Add non-viewer project team members before assigning tasks.
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Priority</label>
                <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} disabled={readOnly}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-ink-muted mb-1">Type</label>
                <select className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" value={draft.issue_type} onChange={(e) => setDraft({ ...draft, issue_type: e.target.value })} disabled={readOnly}>
                  <option value="task">Task</option>
                  <option value="story">Story</option>
                  <option value="bug">Bug</option>
                  <option value="epic">Epic</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">
                Due date
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={draft.due_date}
                  onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
                  disabled={readOnly}
                  className="w-full rounded border-line bg-surface px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {draft.due_date && !readOnly && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, due_date: "" })}
                    className="shrink-0 rounded px-2 py-2 text-xs text-ink-muted hover:bg-surface-muted"
                  >
                    Clear
                  </button>
                )}
              </div>
              {issue?.is_overdue && (
                <p className="mt-1 text-xs font-semibold text-rose-500">
                  Overdue — this task is still open past its due date.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1">Description</label>
              <textarea className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} disabled={readOnly} />
            </div>

            <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">
                  Parent task
                </label>
                <select
                  className="w-full rounded border px-3 py-2 disabled:opacity-60"
                  value={draft.parent_issue}
                  disabled={readOnly}
                  onChange={(event) =>
                    setDraft({ ...draft, parent_issue: event.target.value })
                  }
                >
                  <option value="">No parent task</option>
                  {relatedIssues
                    .filter((candidate: Issue) => candidate.id !== issue?.id)
                    .map((candidate: Issue) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.key} · {candidate.summary}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-muted">
                  Blocked by
                </label>
                <select
                  multiple
                  aria-label="Tasks that block this task"
                  className="min-h-24 w-full rounded border px-3 py-2 disabled:opacity-60"
                  value={draft.blocked_by}
                  disabled={readOnly}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      blocked_by: Array.from(
                        event.target.selectedOptions,
                        (option) => option.value
                      ),
                    })
                  }
                >
                  {relatedIssues
                    .filter((candidate: Issue) => candidate.id !== issue?.id)
                    .map((candidate: Issue) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.key} · {candidate.summary}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] text-ink-subtle">
                  Use Ctrl or Command to select multiple tasks.
                </p>
              </div>
            </div>

            {issue && (issue.subtasks?.length || issue.blocked_by?.length) ? (
              <div className="rounded-lg bg-surface-muted p-3 text-xs text-ink-muted">
                {issue.subtasks?.length ? (
                  <p>Subtasks: {issue.subtasks.length}</p>
                ) : null}
                {issue.blocked_by?.length ? (
                  <p className="mt-1">
                    Blocked by: {issue.blocked_by
                      .map((id: number) => relatedIssues.find((task: Issue) => task.id === id)?.key || `#${id}`)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {issue && (
            <div className="pt-4 border-t border-line">
              <h3 className="text-sm font-semibold mb-2">Comments</h3>
              <p className="mb-2 text-xs text-ink-subtle">
                Mention project teammates with their email address, for example @teammate@company.com.
              </p>
              <div className="space-y-3">
                {comments.map((c: any) => (
                  <div key={c.id} className="p-3 rounded-lg bg-surface-muted text-sm">
                    <p className="text-ink mb-1">{c.body}</p>
                    <div className="flex items-center gap-2 text-xs text-ink-muted">
                      <span>{c.author_email}</span>
                      <span>·</span>
                      <span>{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              {!readOnly && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void postComment()
                  }}
                >
                  <input
                    className="flex-1 rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newComment}
                    onChange={(event) => setNewComment(event.target.value)}
                    placeholder="Write a comment or mention a teammate..."
                    aria-label="Write a comment"
                  />
                  <button
                    type="submit"
                    disabled={postingComment || !newComment.trim()}
                    className="rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {postingComment ? "Sending..." : "Send"}
                  </button>
                </form>
              )}
            </div>
            )}

            {issue && (
            <div className="pt-4 border-t border-line">
              <h3 className="text-sm font-semibold mb-2">Attachments</h3>
              <div className="space-y-2">
                {attachments.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <Paperclip className="w-4 h-4 text-ink-subtle" />
                    <a href={a.file_url} className="text-indigo-600 dark:text-indigo-400 hover:underline">{a.filename}</a>
                  </div>
                ))}
              </div>
            </div>
            )}
          </div>
          <div className="p-4 border-t border-line flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-ink-muted hover:bg-surface-inset rounded">Close</button>
            {!readOnly && (
              <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
                {issue ? "Save changes" : "Create task"}
              </button>
            )}
          </div>
      </div>
    </div>
  )
}
