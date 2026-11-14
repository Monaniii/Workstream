import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { reportsApi } from "../services"
import {
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  RefreshCw,
  Download,
  Briefcase,
  TrendingUp,
  Eye,
  FileSpreadsheet,
  X,
  CircleAlert,
} from "lucide-react"
import toast from "react-hot-toast"
import jsPDF from "jspdf"

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "last_7_days" },
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "Last 90 Days", value: "last_90_days" },
  { label: "This Month", value: "this_month" },
  { label: "Previous Month", value: "previous_month" },
]

const PERIOD_LABELS: Record<string, string> = {
  today: "Today",
  last_7_days: "Last 7 Days",
  last_30_days: "Last 30 Days",
  last_90_days: "Last 90 Days",
  this_month: "This Month",
  previous_month: "Previous Month",
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="h-1.5 w-full rounded-full bg-surface-inset overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

export default function ReportsPage() {
  const { activeWorkspace } = useAuth()
  const [period, setPeriod] = useState("last_30_days")
  const [overview, setOverview] = useState<any>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [csvLoading, setCsvLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  const loadOverview = async () => {
    setLoading(true)
    setOverviewError(null)
    try {
      const data = await reportsApi.overview({ period })
      setOverview(data)
    } catch (err: any) {
      setOverview(null)
      setOverviewError("We couldn’t load this report. Check your connection and try again.")
      toast.error("Failed to load report overview")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      loadOverview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace, period])

  const generatePDF = (preview = false) => {
    setPdfLoading(true)
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const pageW = doc.internal.pageSize.getWidth()
      const pageH = doc.internal.pageSize.getHeight()
      const margin = 15
      const contentW = pageW - 2 * margin

      const kpis = overview?.kpis || {}
      const periodLabel = PERIOD_LABELS[period] ?? period
      const now = new Date()
      const scopeLabel =
        overview?.scope?.type === "personal" ? " · My projects" : ""

      let y = 0

      const newPage = () => {
        doc.addPage()
        y = margin
      }

      const header = () => {
        doc.setFillColor(99, 102, 241)
        doc.rect(0, 0, pageW, 30, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(20)
        doc.text("Workstream — Reports", margin, 16)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(11)
        doc.setTextColor(220, 220, 240)
        doc.text(
          `Generated ${now.toLocaleDateString()}  •  ${activeWorkspace?.name ?? "Workspace"
          }${scopeLabel}`,
          margin,
          26
        )
      }

      const section = (title: string) => {
        if (y + 14 > pageH - margin) newPage()
        doc.setTextColor(99, 102, 241)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(12.5)
        doc.text(title, margin, y)
        y += 8
        doc.setDrawColor(229, 231, 235)
        doc.setFillColor(249, 250, 251)
        doc.rect(margin, y, contentW, 1, "F")
        y += 12
      }

      const kpiRow = () => {
        if (y + 46 > pageH - margin) newPage()
        const cards: { label: string; value: number; color: [number, number, number] }[] = [
          { label: "Projects", value: kpis.total_projects ?? 0, color: [99, 102, 241] },
          { label: "Total Tasks", value: kpis.total_tasks ?? 0, color: [99, 102, 241] },
          { label: "Open Tasks", value: kpis.open_tasks ?? 0, color: [245, 158, 11] },
          { label: "Completed", value: kpis.completed_tasks ?? 0, color: [34, 197, 94] },
        ]
        const gap = 8
        const cardW = (contentW - gap * 3) / 4
        const cardH = 34
        cards.forEach((card, i) => {
          const x = margin + i * (cardW + gap)
          doc.setFillColor(249, 250, 251)
          doc.setDrawColor(229, 231, 235)
          doc.roundedRect(x, y, cardW, cardH, 4, 4, "FD")
          doc.setFillColor(card.color[0], card.color[1], card.color[2])
          doc.rect(x, y, cardW, 4.5, "F")
          doc.setTextColor(74, 85, 104)
          doc.setFont("helvetica", "bold")
          doc.setFontSize(7.5)
          doc.text(card.label, x + 8, y + 12.5)
          doc.setTextColor(17, 24, 39)
          doc.setFont("helvetica", "bold")
          doc.setFontSize(21)
          doc.text(String(card.value), x + 8, y + 27)
        })
        y += cardH + 16
      }

      const table = ({
        title,
        headers,
        rows,
        colWidths,
        alignRight = false,
      }: {
        title: string
        headers: string[]
        rows: any[][]
        colWidths: number[]
        alignRight?: boolean
      }) => {
        if (!rows || rows.length === 0) return
        const headerH = 8
        const rowH = 7
        const needed = headerH + rows.length * rowH + 14
        if (y + needed > pageH - margin) newPage()
        section(title)
        const totalW = colWidths.reduce((a, b) => a + b, 0)
        const startX = margin + (contentW - totalW) / 2
        let x = startX
        doc.setFillColor(99, 102, 241)
        doc.rect(startX, y, totalW, headerH, "F")
        doc.setTextColor(255, 255, 255)
        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        headers.forEach((h, i) => {
          const tx = x + (alignRight ? colWidths[i] - 4 : 4)
          doc.text(h, tx, y + 5.5)
          x += colWidths[i]
        })
        y += headerH
        rows.forEach((row, i) => {
          if (i % 2 === 0) {
            doc.setFillColor(255, 255, 255)
          } else {
            doc.setFillColor(249, 250, 251)
          }
          doc.rect(startX, y, totalW, rowH, "F")
          doc.setDrawColor(229, 231, 235)
          doc.rect(startX, y, totalW, rowH, "S")
          doc.setTextColor(17, 24, 39)
          doc.setFont("helvetica", "normal")
          doc.setFontSize(8)
          x = startX
          row.forEach((cell, i) => {
            const tx = x + (alignRight ? colWidths[i] - 4 : 4)
            doc.text(String(cell ?? ""), tx, y + 5)
            x += colWidths[i]
          })
          y += rowH
        })
        y += 10
      }

      header()
      y = 44

      if (Object.values(kpis).length > 0) {
        section("Key Metrics")
        kpiRow()
      }

      const summary = overview?.projects_summary
      if (summary && summary.length > 0) {
        table({
          title: "Project Completion",
          headers: ["Project", "Completed", "Total", "Progress"],
          rows: summary.map((p: any) => [
            `${p.key} - ${p.name}`,
            p.completed_tasks,
            p.total_tasks,
            `${p.completion_rate}%`,
          ]),
          colWidths: [85, 25, 20, 30],
          alignRight: true,
        })
      }

      const statusDist = overview?.status_distribution
      if (statusDist && statusDist.length > 0) {
        table({
          title: "Task Status Distribution",
          headers: ["Status", "Count"],
          rows: statusDist.map((s: any) => [s.status__name, s.count]),
          colWidths: [130, 50],
        })
      }

      const projectsAtRisk = overview?.projects_at_risk
      if (projectsAtRisk && projectsAtRisk.length > 0) {
        table({
          title: "Projects at Risk",
          headers: ["Project", "Open Tasks", "Total Tasks"],
          rows: projectsAtRisk.map((p: any) => [
            `${p.key} - ${p.name}`,
            p.open_tasks,
            p.total_tasks,
          ]),
          colWidths: [95, 40, 45],
          alignRight: true,
        })
      }

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setTextColor(156, 163, 175)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin - 30, pageH - 8)
        doc.text("Workstream — Confidential", margin, pageH - 8)
      }

      const fileName = `workstream-report-${periodLabel
        .toLowerCase()
        .split(" ")
        .join("-")}.pdf`
      const pdfBlob = doc.output("blob")
      if (preview) {
        setPreviewUrl(URL.createObjectURL(pdfBlob))
        setPreviewOpen(true)
        toast.success("PDF preview ready")
      } else {
        const url = URL.createObjectURL(pdfBlob)
        const link = document.createElement("a")
        link.href = url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        toast.success("Report downloaded as PDF")
      }
    } catch (err: any) {
      console.error("PDF report generation failed", err)
      const message = err instanceof Error ? `: ${err.message}` : ""
      toast.error(
        `${preview ? "Failed to preview PDF" : "Failed to generate PDF"}${message}`
      )
    } finally {
      setPdfLoading(false)
    }
  }

  const downloadCSV = async () => {
    setCsvLoading(true)
    try {
      const blob = await reportsApi.exportCsv({
        report_type: "overview",
        period,
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `workstream-report-${period.replaceAll("_", "-")}.csv`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success("Report downloaded as CSV")
    } catch (err: any) {
      toast.error(
        err.response?.data?.detail || "Failed to download CSV report"
      )
    } finally {
      setCsvLoading(false)
    }
  }

  const kpis = overview?.kpis || {}
  const personal = overview?.scope?.type === "personal"
  const projectsSummary = overview?.projects_summary || []
  const statusDist = overview?.status_distribution || []
  const projectsAtRisk = overview?.projects_at_risk || []
  const maxStatus = Math.max(1, ...statusDist.map((s: any) => s.count))
  const roleLabel = overview?.scope?.role
    ? String(overview.scope.role).charAt(0).toUpperCase() +
    String(overview.scope.role).slice(1)
    : null

  const kpiCards = [
    {
      label: personal ? "My Projects" : "Active Projects",
      value: kpis.total_projects || 0,
      icon: Briefcase,
      accent: "text-blue-500 bg-blue-500/10",
      rule: "bg-blue-500",
    },
    {
      label: "Tasks created",
      value: kpis.tasks_created_in_period || 0,
      icon: Activity,
      accent: "text-amber-600 bg-amber-500/10",
      rule: "bg-amber-500",
    },
    {
      label: "Open Tasks",
      value: kpis.open_tasks || 0,
      icon: PieChartIcon,
      accent: "text-amber-500 bg-amber-500/10",
      rule: "bg-amber-500",
    },
    {
      label: "Completed Tasks",
      value: kpis.completed_tasks || 0,
      icon: BarChart3,
      accent: "text-emerald-500 bg-emerald-500/10",
      rule: "bg-emerald-500",
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
            Workspace intelligence
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-[2.1rem]">
            Reports &amp; analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            {personal
              ? "A focused view of the projects you’re part of and your own workload."
              : roleLabel === "Viewer"
                ? "A read-only view of workspace performance and project health."
                : "A clear view of workspace performance, task flow, and project health."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted">
              <Briefcase className="h-3.5 w-3.5 text-blue-500" />
              {personal ? "Personal project scope" : activeWorkspace?.name ?? "Workspace"}
            </span>
            {roleLabel && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-500">
                <TrendingUp className="h-3.5 w-3.5" />
                {roleLabel} access
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end">
          <button
            type="button"
            onClick={loadOverview}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2.5 text-xs font-medium leading-tight text-ink-muted transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} />
            <span className="min-w-0">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => generatePDF(true)}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2.5 text-xs font-medium leading-tight text-ink-muted transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
            disabled={pdfLoading || loading || !overview}
          >
            <Eye className="h-4 w-4 shrink-0" />
            <span className="min-w-0 text-center">Preview PDF</span>
          </button>
          <button
            type="button"
            onClick={() => generatePDF()}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-2.5 text-xs font-semibold leading-tight text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
            disabled={pdfLoading || loading || !overview}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="min-w-0 text-center">Download PDF</span>
          </button>
          <button
            type="button"
            onClick={downloadCSV}
            className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2.5 text-xs font-medium leading-tight text-ink-muted transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm"
            disabled={csvLoading || loading || !overview}
          >
            <FileSpreadsheet className="h-4 w-4 shrink-0" />
            <span className="min-w-0 text-center">
              {csvLoading ? "Preparing CSV..." : "Download CSV"}
            </span>
          </button>
        </div>
      </header>

      <section
        className="ws-card-sm flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Report period"
      >
        <div className="flex shrink-0 items-center gap-2 px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-subtle">
            Reporting period
          </span>
          <span className="text-xs text-ink-muted">·</span>
          <span className="text-sm font-semibold text-ink">
            {PERIOD_LABELS[period]}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
              className={`ws-tab ${period === p.value ? "ws-tab-active" : "ws-tab-idle"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {overviewError && (
        <div
          className="ws-card flex flex-col gap-3 border-amber-500/40 bg-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-ink">Report unavailable</p>
              <p className="mt-1 text-sm text-ink-muted">{overviewError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadOverview}
            disabled={loading}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div
          className="ws-card flex min-h-80 flex-col items-center justify-center gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/20 border-t-blue-500" />
          <p className="text-sm text-ink-muted">Preparing your report…</p>
        </div>
      )}

      {!loading && overview && (
        <div className="space-y-6">
          <section className="ws-card overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-blue-500">
                    <Activity className="h-3.5 w-3.5" />
                    Report snapshot
                  </span>
                  <span className="text-xs text-ink-subtle">
                    {activeWorkspace?.name ?? "Current workspace"}
                  </span>
                </div>
                <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {PERIOD_LABELS[period]} overview
                </h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">
                  {personal
                    ? `Your current scope includes ${kpis.total_projects || 0} project${(kpis.total_projects || 0) === 1 ? "" : "s"}.`
                    : `A summary of ${kpis.total_projects || 0} project${(kpis.total_projects || 0) === 1 ? "" : "s"} in your workspace scope.`}
                </p>
                <div className="mt-6 flex items-start gap-3 border-t border-line pt-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
                    <TrendingUp className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-xs leading-5 text-ink-muted">
                    The selected period applies to tasks created. Completion,
                    status mix, and project risk reflect your full project scope.
                  </p>
                </div>
              </div>

              <div className="relative flex flex-col justify-center overflow-hidden border-t border-line bg-surface-muted p-6 sm:p-8 lg:border-l lg:border-t-0">
                <span
                  aria-hidden="true"
                  className="absolute -right-6 -top-10 select-none font-mono text-[10rem] font-bold leading-none text-ink/[0.035]"
                >
                  %
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                  {personal ? "Your completion rate" : "Workspace completion"}
                </p>
                <div className="mt-2 flex items-end gap-2">
                  <span className="relative text-5xl font-bold tracking-tight text-ink sm:text-6xl">
                    {kpis.completion_rate || 0}
                  </span>
                  <span className="relative pb-1.5 text-xl font-semibold text-emerald-600 dark:text-emerald-400">%</span>
                </div>
                <div className="mt-5">
                  <ProgressBar value={kpis.completion_rate || 0} />
                </div>
                <p className="mt-3 text-sm text-ink-muted">
                  <span className="font-semibold text-ink">
                    {kpis.completed_tasks || 0}
                  </span>{" "}
                  of {kpis.total_tasks || 0} scoped tasks complete
                </p>
                {personal && (
                  <p className="mt-1 text-xs text-ink-subtle">
                    Across your {kpis.total_projects || 0} projects
                  </p>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="report-metrics-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="report-metrics-heading" className="text-base font-semibold text-ink">
                  Scope at a glance
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                  Full scope, except tasks created in the selected period.
                </p>
              </div>
            </div>
            <div className="ws-card overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-y divide-line lg:grid-cols-4 lg:divide-y-0">
              {kpiCards.map((card, index) => (
                <article key={card.label} className="relative min-w-0 p-4 sm:p-5">
                  <span
                    className={`absolute inset-x-0 top-0 h-0.5 ${card.rule}`}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
                        0{index + 1} ·{" "}
                        {card.label}
                      </p>
                      <p className="mt-2 break-words text-2xl font-bold tracking-tight text-ink">
                        {card.value}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        {card.label === "Tasks created"
                          ? PERIOD_LABELS[period]
                          : "Full project scope"}
                      </p>
                    </div>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.accent}`}
                    >
                      <card.icon className="h-4 w-4" />
                    </span>
                  </div>
                </article>
              ))}
              </div>
            </div>
          </section>

          <section className="ws-card p-5 sm:p-6" aria-labelledby="project-completion-heading">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="project-completion-heading" className="text-lg font-semibold text-ink">
                  {personal ? "My projects" : "Project completion"}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Progress across every project in your current scope.
                </p>
              </div>
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted">
                {projectsSummary.length} project{projectsSummary.length === 1 ? "" : "s"}
              </span>
            </div>
            {projectsSummary.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">
                {personal
                  ? "You are not part of any projects in this workspace yet."
                  : "No projects in this workspace yet."}
              </p>
            ) : (
              <div className="space-y-5">
                {projectsSummary.map((p: any) => (
                  <div key={p.id}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 rounded bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink-subtle">
                          {p.key}
                        </span>
                        <span className="truncate text-sm font-medium text-ink">
                          {p.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-xs text-ink-muted">
                          {p.completed_tasks}/{p.total_tasks}
                        </span>
                        <span className="w-12 text-right text-sm font-semibold tabular-nums text-ink">
                          {p.completion_rate}%
                        </span>
                      </div>
                    </div>
                    <ProgressBar value={p.completion_rate} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="ws-card p-5 sm:p-6" aria-labelledby="status-distribution-heading">
              <div className="mb-6">
                <h2 id="status-distribution-heading" className="text-lg font-semibold text-ink">
                  Task status distribution
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Issue mix across the full project scope.
                </p>
              </div>
              {statusDist.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">
                  No tasks yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {statusDist.map((s: any) => (
                    <div key={s.status__key || s.status__name}>
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="min-w-0 break-words text-sm text-ink">{s.status__name}</span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-muted">
                          {s.count}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-inset">
                        <div
                          role="progressbar"
                          aria-label={`${s.status__name} tasks`}
                          aria-valuemin={0}
                          aria-valuemax={maxStatus}
                          aria-valuenow={s.count}
                          className={`h-full rounded-full transition-all duration-500 ${s.status__is_final ? "bg-emerald-500" : "bg-blue-500"}`}
                          style={{
                            width: `${Math.round((s.count / maxStatus) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="ws-card p-5 sm:p-6" aria-labelledby="projects-at-risk-heading">
              <div className="mb-6">
                <h2 id="projects-at-risk-heading" className="text-lg font-semibold text-ink">
                  Projects at risk
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  Projects with open work needing attention.
                </p>
              </div>
              {projectsAtRisk.length > 0 ? (
                <div className="space-y-2.5">
                  {projectsAtRisk.map((p: any) => (
                    <div
                      key={p.id}
                      className="ws-card-sm flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">
                          {p.name}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">
                          {p.key}
                        </p>
                      </div>
                      <div className="max-w-[45%] shrink-0 text-right">
                        <p className="text-sm font-semibold text-amber-500">
                          {p.open_tasks} open
                        </p>
                        <p className="text-[11px] text-ink-subtle">
                          of {p.total_tasks} tasks
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-ink">
                    No projects at risk
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    All projects have healthy task completion.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {previewOpen && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-label="PDF report preview"
          onClick={() => {
            setPreviewOpen(false)
            setPreviewUrl(null)
          }}
        >
          <div
            className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div>
                <h2 className="font-semibold text-ink">Report preview</h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {PERIOD_LABELS[period]} · {activeWorkspace?.name ?? "Workspace"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => generatePDF()}
                  disabled={pdfLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewOpen(false)
                    setPreviewUrl(null)
                  }}
                  className="rounded-lg p-2 text-ink-muted transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Close preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <iframe
              title="PDF report preview"
              src={previewUrl}
              className="min-h-0 flex-1 bg-surface-muted"
            />
          </div>
        </div>
      )}
    </div>
  )
}
