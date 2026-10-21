import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { Calendar as CalendarIcon, RefreshCw } from "lucide-react"
import toast from "react-hot-toast"

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

export default function CalendarPage() {
  const { activeWorkspace } = useAuth()
  const [viewDate, setViewDate] = useState(new Date())
  const [loading, setLoading] = useState(false)

  const month = viewDate.getMonth()
  const year = viewDate.getFullYear()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const prevMonth = () => {
    setViewDate(new Date(year, month - 1, 1))
  }
  const nextMonth = () => {
    setViewDate(new Date(year, month + 1, 1))
  }

  const loadCalendar = async () => {
    setLoading(true)
    try {
      // Calendar data would come from issues with due dates
      // Issue model currently has no due_date field; show placeholder structure
    } catch (err: any) {
      toast.error("Failed to load calendar")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCalendar()
  }, [])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-gray-500 text-sm">
            Project deadlines, sprint dates, and upcoming milestones
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 text-gray-500 hover:text-indigo-600 transition"
          >
            <RefreshCw className="w-4 h-4 rotate-180" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 text-gray-500 hover:text-indigo-600 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">
            {MONTHS[month]} {year}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <th
                    key={day}
                    className="pb-3 text-xs font-semibold text-gray-400 uppercase"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                {/* Empty cells before first day */}
                {[...Array(firstDay)].map((_, i) => (
                  <td key={i} className="h-24 bg-gray-50" />
                ))}
                {/* Days */}
                {[...Array(daysInMonth)].map((_, i) => {
                  const day = i + 1
                  const isToday =
                    day === new Date().getDate() &&
                    month === new Date().getMonth() &&
                    year === new Date().getFullYear()
                  return (
                    <td
                      key={day}
                      className={`h-24 border-b border-gray-50 p-2 text-sm ${
                        isToday
                          ? "bg-indigo-50 border-indigo-200 text-indigo-600 font-semibold"
                          : "hover:bg-gray-50 text-gray-600 transition"
                      }`}
                    >
                      {day}
                    </td>
                  )
                })}
                {/* Empty cells after last day */}
                {[...Array(7 - ((firstDay + daysInMonth) % 7) || 7)].map(
                  (_, i) => (
                    <td key={`end-${i}`} className="h-24 bg-gray-50" />
                  )
                )}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-sm text-gray-500">
          <p>
            Calendar events are derived from issue due dates and sprint schedules.
            The Issue model currently does not include a due_date field. Add due
            dates to issues to populate this calendar.
          </p>
        </div>
      </div>
    </div>
  )
}
