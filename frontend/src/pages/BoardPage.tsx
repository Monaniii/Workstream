import { useState, useEffect, useCallback } from "react"
import { useParams, useNavigate } from "react-router-dom"
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
  issuesApi, boardsApi, statusesApi, commentsApi, attachmentsApi,
  Issue, IssueStatus,
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

function ColumnCard({ column, issues, boardId, onMove, onOpen }: any) {
  const items = [...issues].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  return (
    <div className="flex flex-col min-w-[260px]">
      <div className="flex items-center justify-between px-3 py-2 rounded-t-lg bg-gray-100 border-b border-gray-200">
        <span className="font-semibold text-gray-700">{column.name}</span>
        <span className="text-xs font-semibold text-gray-400">{items.length}</span>
      </div>
      <div className="flex-1 p-3 min-h-[400px] bg-gray-50/50 border-b border-gray-200 rounded-b-lg">
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
  const { boardId } = useParams<{ boardId: string }>()
  const navigate = useNavigate()
  const { activeWorkspace } = useAuth()
  const [columns, setColumns] = useState<any[]>([])
  const [board, setBoard] = useState<any>(null)
  const [statuses, setStatuses] = useState<IssueStatus[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; issue: Issue | null }>({ open: false, issue: null })
  const [newIssue, setNewIssue] = useState({ title: "", description: "", issue_type: "task", priority: "medium" })

  useEffect(() => {
    if (!boardId || !activeWorkspace) return
    setLoading(true)
    boardsApi.list({ workspace: String(activeWorkspace.id) })
      .then((boards) => {
        const b = boards.find((b) => b.id === Number(boardId))
        if (!b) { navigate("/"); return }
        setBoard(b)
        setColumns(b.columns || [])
        return issuesApi.list({ project: String(b.project) })
      })
      .then((data) => {
        setIssues(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    statusesApi.list({ workspace: String(activeWorkspace.id) }).then(setStatuses)
  }, [boardId, activeWorkspace])

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

  const handleNewIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const firstCol = columns[0]
    if (!firstCol || !board || !activeWorkspace) return
    // default status: first non-final status
    const defaultStatus = statuses.find((s) => !s.is_final)?.id ?? statuses[0]?.id
    try {
      await issuesApi.create({
        project: board.project,
        board: board.id,
        summary: newIssue.title,
        title: newIssue.title,
        description: newIssue.description,
        issue_type: newIssue.issue_type,
        priority: newIssue.priority,
        status: defaultStatus,
        column_id: String(firstCol.id),
        position: 0,
      })
      setModal({ open: false, issue: null })
      setNewIssue({ title: "", description: "", issue_type: "task", priority: "medium" })
      toast.success("Issue created")
      window.location.reload()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to create issue")
    }
  }

  if (loading) return <div className="p-8 text-center">Loading board...</div>

  const issuesByColumn = columns.map((c: any) => ({
    ...c,
    issues: issues.filter((i) => i.column_id === String(c.id)),
  }))

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Kanban Board</h1>
          <p className="text-gray-500 text-sm">Drag issues between columns to update status.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate("/")} className="px-3 py-2 text-sm border rounded hover:bg-gray-100">Back</button>
          <button onClick={() => setModal({ open: true, issue: null })} className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> New issue
          </button>
        </div>
      </div>

      <DndContext sensors={useSensors(useSensor(PointerSensor))} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-4 md:flex-row min-h-[700px] overflow-x-auto">
          {issuesByColumn.map((column: any) => (
            <ColumnCard
              key={column.id}
              column={column}
              issues={column.issues}
              boardId={boardId}
              onMove={handleDragEnd}
              onOpen={handleIssueClick}
            />
          ))}
        </div>
      </DndContext>

      <IssueModal open={modal.open} onClose={() => setModal({ open: false, issue: null })} issue={modal.issue} onIssueCreated={() => window.location.reload()} statuses={statuses} />
    </div>
  )
}

function IssueModal({ open, onClose, issue, onIssueCreated, statuses }: any) {
  const [comments, setComments] = useState<any[]>([])
  const [newComment, setNewComment] = useState("")
  const [attachments, setAttachments] = useState<any[]>([])
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(issue
    ? { title: issue.summary || issue.title, description: issue.description, status: issue.status_key, priority: issue.priority, issue_type: issue.issue_type }
    : { title: "", description: "", status: "todo", priority: "medium", issue_type: "task" })

  useEffect(() => {
    if (issue) {
      commentsApi.list(issue.id).then(setComments)
      attachmentsApi.list(issue.id).then(setAttachments)
    }
  }, [issue])

  const handleSave = async () => {
    if (!issue) return
    try {
      await issuesApi.update(issue.id, {
        summary: draft.title,
        description: draft.description,
        priority: draft.priority,
        issue_type: draft.issue_type,
      })
      const status = statuses.find((s: any) => s.key === draft.status)
      if (status) await issuesApi.transition(issue.id, status.id)
      toast.success("Saved")
      onClose()
      onIssueCreated()
    } catch (err: any) {
      toast.error("Failed to save changes")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      {!open && null}
      {open && (
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
          </div>
          <div className="p-4 border-t border-gray-200 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Close</button>
            <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save changes</button>
          </div>
        </div>
      )}
    </div>
  )
}
