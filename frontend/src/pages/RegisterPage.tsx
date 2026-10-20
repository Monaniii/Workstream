import { useAuth } from "../context/AuthContext"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { UserPlus, Mail, Lock, Bot as BotIcon } from "lucide-react"

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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 text-indigo-600">
          <BotIcon className="w-6 h-6" /> <span className="text-xl font-bold">MultiTii</span>
        </div>
        <h2 className="text-2xl font-bold">Create account</h2>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <input
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="First name" required
            />
            <input
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Last name" required
            />
          </div>
          <input
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username" required
          />
          <input
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="Work email" required
          />
          <input
            className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} type="password" placeholder="Password (min 8)" required
          />
          <button className="w-full bg-indigo-600 text-white py-2 rounded font-medium hover:bg-indigo-700">Create account</button>
        </form>
        <p className="text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-indigo-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
