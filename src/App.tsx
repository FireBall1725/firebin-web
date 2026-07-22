// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TokensPage } from './pages/TokensPage'
import { PlaceholderPage } from './pages/PlaceholderPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route
            path="parts"
            element={
              <PlaceholderPage
                title="Parts"
                note="Part browsing lands with the API domain CRUD (next piece)."
              />
            }
          />
          <Route
            path="locations"
            element={
              <PlaceholderPage
                title="Locations"
                note="Storage location tree lands with the API domain CRUD (next piece)."
              />
            }
          />
          <Route path="tokens" element={<TokensPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
