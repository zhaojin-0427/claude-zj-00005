import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api } from './api'
import { User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (payload: Record<string, unknown>) => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState>(null as unknown as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    if (!localStorage.getItem('gym_token')) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      const { data } = await api.get<User>('/auth/me')
      setUser(data)
    } catch {
      localStorage.removeItem('gym_token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const login = async (username: string, password: string) => {
    const form = new URLSearchParams({ username, password })
    const { data } = await api.post('/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    localStorage.setItem('gym_token', data.access_token)
    setUser(data.user)
    await refresh()
  }

  const register = async (payload: Record<string, unknown>) => {
    const { data } = await api.post('/auth/register', payload)
    localStorage.setItem('gym_token', data.access_token)
    setUser(data.user)
    await refresh()
  }

  const logout = () => {
    localStorage.removeItem('gym_token')
    setUser(null)
    location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
