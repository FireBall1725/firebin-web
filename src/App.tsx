// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { Routes, Route } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TokensPage } from './pages/TokensPage'
import { PartsPage } from './pages/PartsPage'
import { PartDetailPage } from './pages/PartDetailPage'
import { LocationsPage } from './pages/LocationsPage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="parts" element={<PartsPage />} />
          <Route path="parts/:id" element={<PartDetailPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="tokens" element={<TokensPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
