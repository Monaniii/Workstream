import { useAuth } from "../context/AuthContext"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { LogIn, Mail, Lock, UserPlus, Bot } from "lucide-react"

export default function LoginPage() {
  const { login } = useAuth()
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md space-y-6 p-8 bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="flex items-center gap-2 text-indigo-600">
          <Bot className="w-6 h-6" /> <span className="text-xl font-bold">MultiTii</span>
        </div>
        <h2 className="text-2xl font-bold">Sign in</h2>
        {error && <div className="text-red-500 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Work email</label>
            <input
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
            />
          </div>
          <button
            className="w-full bg-indigo-600 text-white py-2 rounded font-medium hover:bg-indigo-700 disabled:opacity-60"
            disabled={!email || !password}
          >
            <LogIn className="w-4 h-4 mr-2" /> Sign in
          </button>
        </form>
        <p className="text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link to="/register" className="text-indigo-600 hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  )
}
