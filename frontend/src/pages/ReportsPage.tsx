import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { reportsApi } from "../services"
import { BarChart3, PieChart as PieChartIcon, Activity, RefreshCw } from "lucide-react"
import toast from "react-hot-toast"

const PERIODS = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "last_7_days" },
  { label: "Last 30 Days", value: "last_30_days" },
  { label: "Last 90 Days", value: "last_90_days" },
  { label: "This Month", value: "this_month" },
  { label: "Previous Month", value: "previous_month" },
]

export default function ReportsPage() {
  const { activeWorkspace } = useAuth()
  const [period, setPeriod] = useState("last_30_days")
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(false)

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

  const kpis = overview?.kpis || {}

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Reports &amp; Analytics</h1>
          <p className="text-gray-500 text-sm">
            Workspace performance, task analytics, team workload, and activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOverview}
            className="p-2 text-gray-500 hover:text-indigo-600 transition"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded text-sm border transition ${
              period === p.value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex h-[400px] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {!loading && overview && (
        <div className="space-y-8">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Active Projects
                  </p>
                  <h3 className="text-2xl font-bold">{kpis.total_projects || 0}</h3>
                </div>
                <BarChart3 className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Total Tasks
                  </p>
                  <h3 className="text-2xl font-bold">{kpis.total_tasks || 0}</h3>
                </div>
                <Activity className="w-8 h-8 text-indigo-600" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Open Tasks
                  </p>
                  <h3 className="text-2xl font-bold text-amber-600">
                    {kpis.open_tasks || 0}
                  </h3>
                </div>
                <PieChartIcon className="w-8 h-8 text-amber-600" />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase">
                    Completed Tasks
                  </p>
                  <h3 className="text-2xl font-bold text-green-600">
                    {kpis.completed_tasks || 0}
                  </h3>
                </div>
                <BarChart3 className="w-8 h-8 text-green-600" />
              </div>
            </div>
          </div>

          {/* Status Distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-6">Task Status Distribution</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
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
                      className="border-b border-gray-50 hover:bg-gray-50 transition"
                    >
                      <td className="py-3 text-sm text-gray-900">
                        {s.status__name}
                      </td>
                      <td className="py-3 text-sm text-right font-medium text-indigo-600">
                        {s.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Projects at Risk */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Projects at Risk</h3>
            </div>
            {(overview.projects_at_risk || []).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase">
                        Project
                      </th>
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase text-right">
                        Open Tasks
                      </th>
                      <th className="pb-3 text-xs font-semibold text-gray-500 uppercase text-right">
                        Total Tasks
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.projects_at_risk || []).map((p: any) => (
                      <tr
                        key={p.id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition"
                      >
                        <td className="py-3 text-sm text-gray-900">
                          {p.key} - {p.name}
                        </td>
                        <td className="py-3 text-sm text-right font-medium text-amber-600">
                          {p.open_tasks}
                        </td>
                        <td className="py-3 text-sm text-right text-gray-600">
                          {p.total_tasks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No projects at risk. All projects have healthy task completion.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
