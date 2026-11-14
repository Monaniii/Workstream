import { useAuth } from "../context/AuthContext"
import { useTheme } from "../context/ThemeContext"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { LogIn, Lock, Moon, Sun } from "lucide-react"

export default function LoginPage() {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      await login(email, password)
      navigate("/")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed")
    }
  }

  return (
    <div className="min-h-screen w-full bg-canvas text-ink">
      <button
        onClick={toggleTheme}
        className="fixed right-5 top-5 z-50 rounded-xl border-line bg-surface p-2.5 text-ink-muted shadow-sm transition hover:text-blue-500"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      <div className="flex flex-col lg:flex-row h-screen">
        {/* Left: brand panel */}
        <div className="lg:w-1/2 h-auto md:h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-12 flex-col items-center justify-center text-white relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <pattern id="waves" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M0 10 Q 5 0 10 10 T 20 10" stroke="currentColor" strokeWidth="1" fill="none" />
                </pattern>
              </defs>
              <rect width="100" height="100" fill="url(#waves)" />
            </svg>
          </div>
          <div className="relative z-10 flex items-center gap-2 mb-10">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white text-2xl shadow-2xl shadow-blue-500/40">
              W
            </div>
            <div className="flex flex-col">
              <span className="text-3xl font-extrabold tracking-tight italic">Workstream</span>
              <span className="text-xs font-medium text-blue-200 uppercase tracking-wider mt-0.5">Plan. Collaborate. Get It Done.</span>
            </div>
          </div>
          <h2 className="text-4xl font-bold mb-6 leading-tight">
            Sign in to your<br />
            workspace
          </h2>
          <p className="text-blue-100 text-sm max-w-md mb-10 leading-relaxed text-center">
            Welcome back. Enter your credentials to access your projects and
            team activity.
          </p>
          <div className="w-full flex items-center gap-3 text-blue-300 text-sm">
            <Lock className="w-4 h-4" />
            <span>Secure login</span>
          </div>
        </div>

        {/* Right: login form */}
        <div className="lg:w-1/2 flex items-center justify-center p-8 bg-canvas">
          <div className="w-full max-w-md space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white text-sm">
                W
              </div>
              <span className="text-xl font-bold tracking-tight text-ink">Workstream</span>
            </div>
            {error && (
              <div className="bg-red-500/10 border-red-500/20 rounded-xl px-4 py-3 text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-ink mb-1.5">
                  Work email
                </label>
                <input
                  className="w-full border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-surface transition"
                  value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@company.com"
                />
              </div>
              <div className="relative">
                <label className="block text-sm font-semibold text-ink mb-1.5">
                  Password
                </label>
                <input
                  className="w-full border-line rounded-xl px-4 py-3 text-ink focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-surface transition pr-10"
                  value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
                />
                <Lock className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-ink-muted cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 rounded border-line text-blue-600 dark:text-blue-400 focus:ring-blue-500" />
                  Remember me
                </label>
                <span className="text-sm text-ink-muted" title="Ask your workspace admin to reset it">
                  Forgot password?
                </span>
              </div>
              <button
                type="submit"
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition shadow-sm shadow-blue-500/20"
                disabled={!email || !password}
              >
                <LogIn className="w-4 h-4 mr-2" /> Sign in
              </button>
            </form>
            <p className="text-center text-sm text-ink-muted">
              Accounts are created by your workspace admin. Check your email for
              your login details.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
