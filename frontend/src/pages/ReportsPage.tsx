import { useState, useEffect, useRef } from "react"
import { useAuth } from "../context/AuthContext"
import { reportsApi } from "../services"
import { BarChart3, PieChart as PieChartIcon, Activity, RefreshCw, Download } from "lucide-react"
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

export default function ReportsPage() {
  const { activeWorkspace } = useAuth()
  const [period, setPeriod] = useState("last_30_days")
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const loadOverview = async () => {
    setLoading(true)
    try {
      const data = await reportsApi.overview({
        period,
      })
      setOverview(data)
    } catch (err: any) {
      toast.error("Failed to load report overview")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      loadOverview()
    }
  }, [activeWorkspace, period])

  const generatePDF = () => {
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
        doc.text(`Generated ${now.toLocaleDateString()}  •  ${activeWorkspace?.name ?? "Workspace"}`, margin, 26)
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
        const cards = [
          { label: "Active Projects", value: kpis.total_projects ?? 0, color: [99, 102, 241] },
          { label: "Total Tasks", value: kpis.total_tasks ?? 0, color: [99, 102, 241] },
          { label: "Open Tasks", value: kpis.open_tasks ?? 0, color: [245, 158, 11] },
          { label: "Completed Tasks", value: kpis.completed_tasks ?? 0, color: [34, 197, 94] },
        ]
        const gap = 8
        const cardW = (contentW - gap * 3) / 4
        const cardH = 34
        cards.forEach((card, i) => {
          const x = margin + i * (cardW + gap)
          doc.setFillColor(249, 250, 251)
          doc.setDrawColor(229, 231, 235)
          doc.roundedRect(x, y, cardW, cardH, 4, 4, "FS")
          doc.setFillColor(...card.color)
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

      const table = ({ title, headers, rows, colWidths, alignRight = false }) => {
        if (!rows || rows.length === 0) return
        const headerH = 8
        const rowH = 7
        const needed = headerH + rows.length * rowH + 14
        if (y + needed > pageH - margin) newPage()
        section(title)
        const totalW = colWidths.reduce((a, b) => a + b, 0)
        const startX = margin + (contentW - totalW) / 2
        let x = startX
        // header
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
        // body
        rows.forEach((row: any[], i) => {
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

      // ---------- build ----------
      header()
      y = 44

      const kpiValues = Object.values(kpis)
      if (kpiValues.length > 0) {
        section("Key Metrics")
        kpiRow()
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
          rows: projectsAtRisk.map((p: any) => [`${p.key} - ${p.name}`, p.open_tasks, p.total_tasks]),
          colWidths: [95, 40, 45],
          alignRight: true,
        })
      }

      // footer page numbers
      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setTextColor(156, 163, 175)
        doc.setFont("helvetica", "normal")
        doc.setFontSize(8)
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin - 30, pageH - 8)
        doc.text("Workstream — Confidential", margin, pageH - 8)
      }

      const fileName = `workstream-report-${periodLabel.toLowerCase().split(" ").join("-")}.pdf`
      doc.save(fileName)
      toast.success("Report downloaded as PDF")
    } catch (err: any) {
      toast.error("Failed to generate PDF")
    } finally {
      setPdfLoading(false)
    }
  }

  const kpis = overview?.kpis || {}

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reports &amp; Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">
            Workspace performance, task analytics, team workload, and activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOverview}
            className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={generatePDF}
            className="p-2.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={pdfLoading || loading || !overview}
            title="Download PDF"
          >
            {pdfLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
              period === p.value
                ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/30"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

          {loading && (
            <div className="flex h-[400px] items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          )}

          {!loading && overview && (
            <div className="space-y-8">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Active Projects
                      </p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {kpis.total_projects || 0}
                      </h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Total Tasks
                      </p>
                      <h3 className="text-2xl font-bold text-slate-900">
                        {kpis.total_tasks || 0}
                      </h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                      <Activity className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Open Tasks
                      </p>
                      <h3 className="text-2xl font-bold text-amber-600">
                        {kpis.open_tasks || 0}
                      </h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                      <PieChartIcon className="w-5 h-5" />
                    </div>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Completed Tasks
                      </p>
                      <h3 className="text-2xl font-bold text-green-600">
                        {kpis.completed_tasks || 0}
                      </h3>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Distribution */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Task Status Distribution</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                      Status
                    </th>
                    <th className="pb-3 text-xs font-semibold text-gray-500 uppercase text-right">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(overview.status_distribution || []).map((s: any) => (
                      <tr
                        key={s.status__key}
                        className="border-b border-slate-100 hover:bg-slate-50 transition"
                      >
                        <td className="py-3 text-sm text-slate-900">{s.status__name}</td>
                        <td className="py-3 text-sm text-right font-medium text-blue-600">
                          {s.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Projects at Risk */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900">Projects at Risk</h3>
              </div>
              {(overview.projects_at_risk || []).length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="pb-3 text-xs font-semibold text-slate-500 uppercase">
                          Project
                        </th>
                        <th className="pb-3 text-xs font-semibold text-slate-500 uppercase text-right">
                          Open Tasks
                        </th>
                        <th className="pb-3 text-xs font-semibold text-slate-500 uppercase text-right">
                          Total Tasks
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview.projects_at_risk || []).map((p: any) => (
                        <tr
                          key={p.id}
                          className="border-b border-slate-100 hover:bg-slate-50 transition"
                        >
                          <td className="py-3 text-sm text-slate-900">
                            {p.key} - {p.name}
                          </td>
                          <td className="py-3 text-sm text-right font-medium text-amber-600">
                            {p.open_tasks}
                          </td>
                          <td className="py-3 text-sm text-right text-slate-600">
                            {p.total_tasks}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  No projects at risk. All projects have healthy task completion.
                </div>
              )}
            </div>
          </div>
      )}
    </div>
  )
}
