import { createContext, useContext, useState, useEffect, ReactNode } from "react"
import axios from "axios"

export interface User {
  id: number
  email: string
  username: string
  first_name?: string
  last_name?: string
  avatar_url: string
  is_staff: boolean
  is_superuser: boolean
  must_change_password?: boolean
}

export interface Workspace {
  id: number
  name: string
  slug: string
  plan: string
  member_count?: number
  current_user_role?: "admin" | "manager" | "member" | "viewer" | null
}

interface AuthContextType {
  user: User | null
  token: string | null
  workspaces: Workspace[]
  activeWorkspace: Workspace | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: User | null) => void
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

  const fetchWorkspaces = async (authToken: string | null = token) => {
    if (!authToken) return
    const res = await axios.get(`${base}/tenants/workspaces/`, {
      headers: { Authorization: `Token ${authToken}` },
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
    // Pass the token explicitly: state has not re-rendered yet, so the
    // closure's `token` is still null here and the request would be sent
    // unauthenticated (401), leaving the user with no workspaces.
    await fetchWorkspaces(res.data.token)
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
    login, logout, setUser, setActiveWorkspace, fetchWorkspaces, isLoading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
