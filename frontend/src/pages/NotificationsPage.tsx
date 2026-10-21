import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import { notificationsApi } from "../services"
import { Bell, RefreshCw, CheckCircle2, X } from "lucide-react"
import toast from "react-hot-toast"

export default function NotificationsPage() {
  const { activeWorkspace } = useAuth()
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const data = await notificationsApi.list()
      setNotifications(data)
    } catch (err: any) {
      toast.error("Failed to load notifications")
    } finally {
      setLoading(false)
    }
  }

  const markRead = async (id: number) => {
    try {
      await notificationsApi.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
    } catch (err: any) {
      toast.error("Failed to mark notification as read")
    }
  }

  const markAllRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      toast.success("All notifications marked as read")
    } catch (err: any) {
      toast.error("Failed to mark all notifications as read")
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      loadNotifications()
    }
  }, [activeWorkspace])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-gray-500 text-sm">
            Workspace notifications, mentions, and updates
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="px-3 py-1.5 text-sm border rounded text-indigo-600 border-indigo-600 hover:bg-indigo-50 transition"
            >
              Mark all as read
            </button>
          )}
          <button
            onClick={loadNotifications}
            className="p-2 text-gray-500 hover:text-indigo-600 transition"
            disabled={loading}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex h-[400px] items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {!loading && (
        <div className="space-y-4">
          {notifications.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No notifications
              </h3>
              <p className="text-gray-500">
                You&apos;re all caught up. New notifications will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`bg-white rounded-xl border border-gray-200 p-4 transition ${
                    !n.read ? "bg-indigo-50 border-indigo-100" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-semibold uppercase ${
                            n.type?.includes("issue") ? "text-indigo-600" : "text-gray-500"
                          }`}
                        >
                          {n.type?.split(".").pop() || "notification"}
                        </span>
                        {!n.read && (
                          <span className="w-2 h-2 bg-indigo-600 rounded-full" />
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">
                        {n.title}
                      </h3>
                      <p className="text-sm text-gray-600">{n.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => markRead(n.id)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 transition"
                    >
                      {!n.read ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <X className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {n.link && (
                    <a
                      href={n.link}
                      className="mt-3 inline-block text-sm text-indigo-600 hover:underline"
                    >
                      View details →
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
