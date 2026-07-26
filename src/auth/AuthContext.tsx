// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, tokenStore, type User } from '../lib/api'

interface AuthState {
  user: User | null
  loading: boolean
  // canWrite is false for viewer-role accounts, which the API rejects on any
  // mutation (RequireWriter middleware). The UI uses it to hide write controls
  // rather than let a viewer click a button that would 403.
  canWrite: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount, if we hold a token, resolve the current user (this also exercises
  // the refresh path if the access token has expired).
  useEffect(() => {
    let active = true
    if (!tokenStore.access) {
      setLoading(false)
      return
    }
    api
      .me()
      .then((u) => active && setUser(u))
      .catch(() => {
        tokenStore.clear()
        if (active) setUser(null)
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const login = async (username: string, password: string) => {
    const pair = await api.login(username, password)
    setUser(pair.user)
  }

  const register = async (username: string, password: string, email?: string) => {
    const pair = await api.register(username, password, email)
    setUser(pair.user)
  }

  const logout = async () => {
    await api.logout()
    setUser(null)
  }

  const canWrite = user != null && user.role !== 'viewer'

  return (
    <AuthContext.Provider value={{ user, loading, canWrite, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
