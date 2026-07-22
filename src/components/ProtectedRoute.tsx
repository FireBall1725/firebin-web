// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="bg-app c-faint flex min-h-screen items-center justify-center">
        Loading…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}
