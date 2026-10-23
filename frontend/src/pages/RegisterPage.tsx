import { useAuth } from "../context/AuthContext"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { UserPlus, Mail, Lock } from "lucide-react"

export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: "", username: "", password: "", first_name: "", last_name: "" })
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    try {
      await register(form)
      navigate("/")
    } catch (err: any) {
      setError(err.response?.data?.detail || Object.values(err.response?.data || {}).flat().join(" ") || "Registration failed")
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#FAFAFC]">
      <div className="flex flex-col lg:flex-row h-screen">
        {/* Left: brand panel */}
        <div className="lg:w-1/2 h-auto md:h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-12 flex flex-col items-center justify-center text-white relative overflow-hidden">
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
            Create your<br />
            account
          </h2>
          <p className="text-blue-100 text-sm max-w-md mb-10 leading-relaxed text-center">
            Join your workspace and start managing projects, tasks, and team
            collaboration in one place.
          </p>
          <div className="w-full flex items-center gap-3 text-blue-300 text-sm">
            <UserPlus className="w-4 h-4" />
            <span>New account</span>
          </div>
        </div>

        {/* Right: register form */}
        <div className="lg:w-1/2 flex items-center justify-center p-8 bg-[#FAFAFC]">
          <div className="w-full max-w-md space-y-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-700 flex items-center justify-center text-white text-sm">
                W
              </div>
              <span className="text-xl font-bold tracking-tight text-slate-900">Workstream</span>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-700 text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white transition"
                  value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name" required
                />
                <input
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white transition"
                  value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" required
                />
              </div>
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white transition"
                value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username" required
              />
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white transition"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="Work email" required
              />
              <input
                className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-white transition"
                value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="Password (min 8)" required
              />
              <button className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm shadow-blue-500/20">
                Create account
              </button>
            </form>
            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link to="/login" className="text-blue-600 hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
