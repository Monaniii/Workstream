import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import axios from "axios"

export interface User {
  id: number
  email: string
  username: string
  avatar_url: string
  is_staff: boolean
  is_superuser: boolean
}

export interface Workspace {
  id: number
  name: string
  slug: string
  plan: string
  member_count?: number
}

interface AuthContextType {
  user: User | null
  token: string | null
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  login: (email: string, password: string) => Promise<void>
  register: (data: Record<string, unknown>) => Promise<void>
  logout: () => void
  setActiveWorkspace: (slug: string | null) => void
  fetchWorkspaces: () => Promise<void>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"))
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const base = import.meta.env.VITE_API_BASE_URL || "/api"

  useEffect(() => {
    if (token) {
      fetch(`${base}/auth/me/`, { headers: { Authorization: `Token ${token}` } })
        .then((r) => {
          if (!r.ok) throw new Error("Failed to load user")
          return r.json()
        })
        .then(async (data: User) => {
          setUser(data)
          await fetchWorkspaces().catch((err) => {
            console.error("fetchWorkspaces failed", err)
          })
        })
        .catch((err) => {
          console.error("Auth load failed", err)
          setUser(null)
          setToken(null)
          localStorage.removeItem("token")
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [token, base])

  const fetchWorkspaces = async () => {
    if (!token) return
    const res = await axios.get(`${base}/tenants/workspaces/`, {
      headers: { Authorization: `Token ${token}` },
    })
    const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
    setWorkspaces(data)
    const slug = localStorage.getItem("workspaceSlug")
    if (slug) {
      const ws = data.find((w: Workspace) => w.slug === slug)
      if (ws) {
        setActiveWorkspaceState(ws)
      } else {
        localStorage.removeItem("workspaceSlug")
      }
    }
  }

  const login = async (email: string, password: string) => {
    const res = await axios.post(`${base}/auth/login/`, { email, password })
    setToken(res.data.token)
    localStorage.setItem("token", res.data.token)
    const me = await axios.get(`${base}/auth/me/`, {
      headers: { Authorization: `Token ${res.data.token}` },
    })
    setUser(me.data)
    await fetchWorkspaces()
  }

  const register = async (data: Record<string, unknown>) => {
    const res = await axios.post(`${base}/auth/register/`, data)
    setToken(res.data.token)
    localStorage.setItem("token", res.data.token)
    const me = await axios.get(`${base}/auth/me/`, {
      headers: { Authorization: `Token ${res.data.token}` },
    })
    setUser(me.data)
    await fetchWorkspaces()
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    setActiveWorkspaceState(null)
    setWorkspaces([])
    localStorage.removeItem("token")
    localStorage.removeItem("workspaceSlug")
  }

  const setActiveWorkspace = (slug: string | null) => {
    if (!slug) {
      setActiveWorkspaceState(null)
      localStorage.removeItem("workspaceSlug")
      return
    }
    const ws = workspaces.find((w) => w.slug === slug)
    if (ws) {
      setActiveWorkspaceState(ws)
      localStorage.setItem("workspaceSlug", slug)
    }
  }

  const value = {
    user, token, workspaces, activeWorkspace,
    login, register, logout, setActiveWorkspace, fetchWorkspaces, isLoading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
