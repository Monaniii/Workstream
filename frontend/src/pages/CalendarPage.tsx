import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import { projectsApi, sprintsApi, boardsApi, issuesApi, Project, Sprint, Issue } from "../services"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Rocket,
  Timer,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ListChecks,
} from "lucide-react"
import toast from "react-hot-toast"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

type EventKind =
  | "project_start"
  | "project_due"
  | "sprint_start"
  | "sprint_end"
  | "task_due"

interface CalEvent {
  id: string
  kind: EventKind
  date: Date
  title: string
  subtitle: string
  projectId?: number
  projectKey?: string
  status?: string
}

const KIND_META: Record<
  EventKind,
  { label: string; dot: string; chip: string; stripe: string; icon: any }
> = {
  project_due: {
    label: "Project deadline",
    dot: "bg-rose-500",
    chip: "bg-rose-500/12 text-rose-600 dark:text-rose-400 ring-rose-500/20",
    stripe: "from-rose-500 to-orange-400",
    icon: Flag,
  },
  project_start: {
    label: "Project kickoff",
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
    stripe: "from-emerald-500 to-teal-400",
    icon: Rocket,
  },
  sprint_end: {
    label: "Sprint end",
    dot: "bg-amber-500",
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400 ring-amber-500/20",
    stripe: "from-amber-500 to-yellow-400",
    icon: CheckCircle2,
  },
  sprint_start: {
    label: "Sprint start",
    dot: "bg-blue-500",
    chip: "bg-blue-500/12 text-blue-600 dark:text-blue-400 ring-blue-500/20",
    stripe: "from-blue-500 to-indigo-400",
    icon: Timer,
  },
  task_due: {
    label: "Task due",
    dot: "bg-violet-500",
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-400 ring-violet-500/20",
    stripe: "from-violet-500 to-fuchsia-400",
    icon: ListChecks,
  },
}

/** Parse a YYYY-MM-DD or ISO string to a local-midnight Date (or null). */
function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

function daysBetween(a: Date, b: Date) {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000)
}

function monthLabel(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export default function CalendarPage() {
  const { activeWorkspace, user } = useAuth()
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [projects, setProjects] = useState<Project[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [boards, setBoards] = useState<{ id: number; project: number }[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [filters, setFilters] = useState<Record<EventKind, boolean>>({
    project_due: true,
    project_start: true,
    sprint_start: true,
    sprint_end: true,
    task_due: true,
  })

  const load = useCallback(async () => {
    if (!activeWorkspace?.id) return
    setLoading(true)
    try {
      const [projectList, sprintList, boardList, issueList] = await Promise.all([
        projectsApi.list({ workspace: String(activeWorkspace.id) }),
        sprintsApi.list({ workspace: String(activeWorkspace.id) }).catch(() => []),
        boardsApi.list({ workspace: String(activeWorkspace.id) }).catch(() => []),
        issuesApi.list({ workspace: String(activeWorkspace.id) }).catch(() => []),
      ])
      // The axios interceptor already unwraps paginated responses to arrays.
      setProjects(Array.isArray(projectList) ? projectList : [])
      setSprints(Array.isArray(sprintList) ? sprintList : [])
      setBoards(Array.isArray(boardList) ? boardList : [])
      setIssues(Array.isArray(issueList) ? issueList : [])
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "Failed to load calendar")
    } finally {
      setLoading(false)
    }
  }, [activeWorkspace?.id])

  useEffect(() => {
    load()
  }, [load])

  // ---- build events from real project + sprint dates --------------------
  const allEvents = useMemo<CalEvent[]>(() => {
    const events: CalEvent[] = []
    projects.forEach((p) => {
      const start = parseDate(p.start_date)
      const due = parseDate(p.target_date)
      if (start) {
        events.push({
          id: `ps-${p.id}`,
          kind: "project_start",
          date: start,
          title: p.name,
          subtitle: `${p.key} · kickoff`,
          projectId: p.id,
          projectKey: p.key,
          status: p.status,
        })
      }
      if (due) {
        events.push({
          id: `pd-${p.id}`,
          kind: "project_due",
          date: due,
          title: p.name,
          subtitle: `${p.key} · deadline`,
          projectId: p.id,
          projectKey: p.key,
          status: p.status,
        })
      }
    })

    const projectById = new Map(projects.map((p) => [p.id, p]))
    // A sprint stores a `board`, and a board belongs to a project. The sprint
    // API does not expose `project`, so resolve it through the board id.
    const boardToProject = new Map<number, Project>()
    boards.forEach((b: any) => {
      const project = projectById.get(b.project)
      if (project) boardToProject.set(b.id, project)
    })
    sprints.forEach((s: any) => {
      const project = boardToProject.get(s.board)
      const sStart = parseDate(s.start_date)
      const sEnd = parseDate(s.end_date)
      if (sStart) {
        events.push({
          id: `ss-${s.id}`,
          kind: "sprint_start",
          date: sStart,
          title: s.name,
          subtitle: project ? `${project.key} · sprint starts` : "Sprint starts",
          projectId: project?.id,
          projectKey: project?.key,
        })
      }
      if (sEnd) {
        events.push({
          id: `se-${s.id}`,
          kind: "sprint_end",
          date: sEnd,
          title: s.name,
          subtitle: project ? `${project.key} · sprint ends` : "Sprint ends",
          projectId: project?.id,
          projectKey: project?.key,
        })
      }
    })

    // Task deadlines. Closed tasks are skipped: a finished task's past due date
    // is not a live deadline, and showing it would mislead the calendar.
    issues.forEach((i) => {
      if (!i.due_date || i.is_closed) return
      const due = parseDate(i.due_date)
      if (!due) return
      const project = projectById.get(i.project)
      events.push({
        id: `td-${i.id}`,
        kind: "task_due",
        date: due,
        title: i.summary || i.key,
        subtitle: `${i.key} · task due${project ? ` · ${project.key}` : ""}`,
        projectId: project?.id,
        projectKey: project?.key,
        status: i.status_key,
      })
    })

    return events
  }, [projects, sprints, boards, issues])

  const visibleEvents = useMemo(
    () => allEvents.filter((e) => filters[e.kind]),
    [allEvents, filters]
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalEvent[]>()
    visibleEvents.forEach((e) => {
      const key = dateKey(e.date)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    })
    map.forEach((list) =>
      list.sort((a, b) => a.title.localeCompare(b.title))
    )
    return map
  }, [visibleEvents])

  // ---- month grid (Monday-first, whole weeks) ---------------------------
  const grid = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const first = new Date(year, month, 1)
    // JS: 0=Sun..6=Sat -> Monday-first offset
    const lead = (first.getDay() + 6) % 7
    const start = new Date(year, month, 1 - lead)
    const cells: Date[] = []
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
    }
    // Trim a trailing week that is entirely next month.
    while (
      cells.length > 35 &&
      cells.slice(-7).every((d) => d.getMonth() !== month)
    ) {
      cells.splice(-7, 7)
    }
    return cells
  }, [viewDate])

  const today = startOfDay(new Date())
  const todayKey = dateKey(today)
  const selectedEvents = selected ? eventsByDay.get(selected) ?? [] : []
  const selectedDate = selected ? parseDate(selected) : null

  // Upcoming feed: next 6 events at/after today
  const upcoming = useMemo(
    () =>
      visibleEvents
        .filter((e) => daysBetween(today, e.date) >= 0)
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .slice(0, 6),
    [visibleEvents, today]
  )

  // KPI strip
  const monthEvents = visibleEvents.filter(
    (e) =>
      e.date.getMonth() === viewDate.getMonth() &&
      e.date.getFullYear() === viewDate.getFullYear()
  )
  const dueThisMonth = monthEvents.filter(
    (e) => e.kind === "project_due" || e.kind === "task_due"
  ).length
  const overdue = visibleEvents.filter(
    (e) =>
      (e.kind === "project_due" || e.kind === "task_due") &&
      daysBetween(today, e.date) < 0
  ).length
  const nextDue = upcoming.find(
    (e) => e.kind === "project_due" || e.kind === "task_due"
  )

  const goToday = () => {
    const now = new Date()
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelected(todayKey)
  }
  const shift = (delta: number) =>
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1))

  const stats = [
    {
      label: `${MONTHS[viewDate.getMonth()]} events`,
      value: monthEvents.length,
      icon: CalendarDays,
      accent: "text-blue-500 bg-blue-500/10",
    },
    {
      label: `Deadlines in ${MONTHS[viewDate.getMonth()].slice(0, 3)}`,
      value: dueThisMonth,
      icon: Flag,
      accent: "text-rose-500 bg-rose-500/10",
    },
    {
      label: "Overdue projects",
      value: overdue,
      icon: AlertTriangle,
      accent: "text-amber-500 bg-amber-500/10",
    },
    {
      label: nextDue ? `Next: ${nextDue.projectKey ?? nextDue.title}` : "Next deadline",
      value: nextDue
        ? daysBetween(today, nextDue.date) === 0
          ? "Today"
          : `in ${daysBetween(today, nextDue.date)}d`
        : "—",
      icon: Timer,
      accent: "text-emerald-500 bg-emerald-500/10",
    },
  ]

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-8 flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">Calendar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Project deadlines, kickoff dates and sprint milestones for{" "}
            {activeWorkspace?.name ?? "your workspace"}
            {user?.email ? ` · ${user.email}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={goToday}
            className="ws-tab ws-tab-idle"
            title="Jump to today"
          >
            Today
          </button>
          <div className="flex items-center overflow-hidden rounded-lg border-line bg-surface">
            <button
              onClick={() => shift(-1)}
              className="p-2 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[8.5rem] px-2 text-center text-sm font-semibold text-ink">
              {monthLabel(viewDate)}
            </span>
            <button
              onClick={() => shift(1)}
              className="p-2 text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-2.5 text-ink-muted transition hover:bg-blue-500/10 hover:text-blue-500 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mb-6 grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="ws-card p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="mb-1 truncate text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  {s.label}
                </p>
                <p className="text-xl font-bold text-ink">{s.value}</p>
              </div>
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.accent}`}
              >
                <s.icon className="h-4 w-4" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend / filters */}
      <div className="mb-4 flex-wrap items-center gap-2">
        {(Object.keys(KIND_META) as EventKind[]).map((kind) => {
          const meta = KIND_META[kind]
          const on = filters[kind]
          return (
            <button
              key={kind}
              onClick={() => setFilters((f) => ({ ...f, [kind]: !f[kind] }))}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${on
                  ? "border-line bg-surface text-ink"
                  : "border-transparent bg-surface-muted text-ink-subtle line-through"
                }`}
              aria-pressed={on}
            >
              <span
                className={`h-2 w-2 rounded-full ${meta.dot} ${on ? "" : "opacity-40"}`}
              />
              {meta.label}
            </button>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_20rem]">
        {/* ---------- Month grid ---------- */}
        <div className="ws-card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-surface-muted/60">
            {DOW.map((d) => (
              <div
                key={d}
                className="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-subtle"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {grid.map((day, i) => {
              const key = dateKey(day)
              const dayEvents = eventsByDay.get(key) ?? []
              const inMonth = day.getMonth() === viewDate.getMonth()
              const isToday = key === todayKey
              const isSelected = key === selected
              const isWeekend = day.getDay() === 0 || day.getDay() === 6
              const hasDeadline = dayEvents.some((e) => e.kind === "project_due")
              return (
                <button
                  key={key + i}
                  onClick={() => setSelected(isSelected ? null : key)}
                  className={`group relative min-h-[104px] border-b border-r border-line p-1.5 text-left align-top transition
                    ${i % 7 === 6 ? "border-r-0" : ""}
                    ${isSelected
                      ? "bg-blue-500/10 ring-1 ring-inset ring-blue-500/40"
                      : inMonth
                        ? isWeekend
                          ? "bg-surface-muted/40 hover:bg-surface-muted"
                          : "bg-surface hover:bg-surface-muted"
                        : "bg-canvas/60"
                    }`}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold
                        ${isToday
                          ? "bg-blue-600 text-white shadow-sm shadow-blue-500/40"
                          : inMonth
                            ? "text-ink"
                            : "text-ink-subtle/60"
                        }`}
                    >
                      {day.getDate()}
                    </span>
                    {dayEvents.length > 2 && (
                      <span className="text-[10px] font-semibold text-ink-subtle">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((e) => {
                      const meta = KIND_META[e.kind]
                      return (
                        <div
                          key={e.id}
                          className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium ring-1 ring-inset ${meta.chip}`}
                          title={`${meta.label}: ${e.title}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${meta.dot}`} />
                          <span className="truncate">{e.title}</span>
                        </div>
                      )
                    })}
                    {dayEvents.length > 2 && (
                      <div className="px-1 text-[10px] text-ink-subtle">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>

                  {hasDeadline && (
                    <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
                  )}
                </button>
              )
            })}
          </div>

          {!loading && visibleEvents.length === 0 && (
            <div className="border-t border-line px-6 py-4 text-center text-xs text-ink-muted">
              No dated milestones yet. Add a start or target date to a project, or
              schedule a sprint, and it will appear here.
            </div>
          )}
        </div>

        {/* ---------- Day detail + upcoming ---------- */}
        <div className="flex flex-col gap-6">
          <div className="ws-card p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-sm font-bold text-ink">
                  {selectedDate
                    ? selectedDate.toLocaleDateString(undefined, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                    : "Select a day"}
                </h2>
                <p className="mt-0.5 text-[11px] text-ink-muted">
                  {selectedDate
                    ? `${selectedEvents.length} event${selectedEvents.length === 1 ? "" : "s"
                    }`
                    : "Click any day to see its milestones"}
                </p>
              </div>
              {selectedDate && (
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold ${selected === todayKey
                      ? "bg-blue-600 text-white"
                      : "bg-surface-inset text-ink"
                    }`}
                >
                  {selectedDate.getDate()}
                </span>
              )}
            </div>

            {selectedDate && selectedEvents.length === 0 && (
              <p className="rounded-lg bg-surface-muted px-3 py-4 text-center text-xs text-ink-muted">
                Nothing scheduled.
              </p>
            )}

            <div className="space-y-2">
              {selectedEvents.map((e) => {
                const meta = KIND_META[e.kind]
                const days = daysBetween(today, e.date)
                return (
                  <div
                    key={e.id}
                    className="overflow-hidden rounded-xl border-line bg-surface"
                  >
                    <div className={`h-1 bg-gradient-to-r ${meta.stripe}`} />
                    <div className="p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                        <meta.icon className="h-3 w-3" />
                        {meta.label}
                      </div>
                      <p className="text-sm font-semibold text-ink">{e.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-ink-muted">{e.subtitle}</p>
                        {e.projectId && (
                          <Link
                            to={`/app/projects/${e.projectId}`}
                            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Open <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      {e.kind === "project_due" && (
                        <p
                          className={`mt-1.5 text-[11px] font-semibold ${days < 0
                              ? "text-rose-500"
                              : days === 0
                                ? "text-amber-500"
                                : "text-ink-muted"
                            }`}
                        >
                          {days < 0
                            ? `${-days} day${-days === 1 ? "" : "s"} overdue`
                            : days === 0
                              ? "Due today"
                              : `Due in ${days} day${days === 1 ? "" : "s"}`}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="ws-card p-5">
            <h2 className="mb-3 text-sm font-bold text-ink">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-xs text-ink-muted">Nothing coming up.</p>
            ) : (
              <ul className="space-y-3">
                {upcoming.map((e) => {
                  const meta = KIND_META[e.kind]
                  const days = daysBetween(today, e.date)
                  return (
                    <li key={e.id} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${meta.chip}`}
                      >
                        <meta.icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-ink">
                          {e.title}
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          {e.date.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          · {days === 0 ? "today" : `in ${days}d`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
