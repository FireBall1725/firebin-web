// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api, onSessionExpired, resumeSession, tokenStore, type User } from '../lib/api'

interface AuthState {
  user: User | null
  loading: boolean
  // canWrite is false for viewer-role accounts, which the API rejects on any
  // mutation (RequireWriter middleware). The UI uses it to hide write controls
  // rather than let a viewer click a button that would 403.
  canWrite: boolean
  // setupRequired is true on a fresh install with no accounts yet. It drives the
  // first-run wizard: the first account created becomes the instance admin.
  setupRequired: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)

  // On mount, if we hold a token, resolve the current user (this also exercises
  // the refresh path if the access token has expired). With no token, check
  // whether the instance still needs its first account so we can show the wizard.
  // A session that dies mid-use has to take the user back to the login screen.
  // Clearing the user is enough: ProtectedRoute redirects on it.
  useEffect(() => {
    onSessionExpired(() => setUser(null))
  }, [])

  useEffect(() => {
    let active = true
    // An expired access token with a live refresh token is a session worth
    // resuming, not a signed-out user. Without this the app showed the login
    // screen while holding a perfectly good refresh token.
    void (async () => {
      if (!tokenStore.access && tokenStore.refresh) await resumeSession()
      if (!active) return
      bootstrap()
    })()

    function bootstrap() {
    if (!tokenStore.access) {
      api
        .getSetupStatus()
        .then((s) => active && setSetupRequired(s.setup_required))
        .catch(() => undefined)
        .finally(() => active && setLoading(false))
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
    }

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
    setSetupRequired(false)
    setUser(pair.user)
  }

  const logout = async () => {
    await api.logout()
    setUser(null)
  }

  const canWrite = user != null && user.role !== 'viewer'

  return (
    <AuthContext.Provider value={{ user, loading, canWrite, setupRequired, login, register, logout }}>
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
