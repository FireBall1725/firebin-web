// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

export function DashboardPage() {
  const { user } = useAuth()
  const [health, setHealth] = useState<{ version: string } | null>(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-1 text-zinc-500">
        Signed in as <span className="font-medium">{user?.username}</span>
        {user?.is_instance_admin && (
          <span className="ml-2 rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
            admin
          </span>
        )}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Stat label="Parts" value="—" hint="coming next" />
        <Stat label="Locations" value="—" hint="coming next" />
        <Stat label="Low stock" value="—" hint="coming next" />
      </div>

      <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Backend
        </h2>
        <dl className="mt-2 space-y-1 text-sm text-zinc-500">
          <div className="flex justify-between">
            <dt>API</dt>
            <dd className="text-green-600 dark:text-green-400">connected</dd>
          </div>
          <div className="flex justify-between">
            <dt>API version</dt>
            <dd className="font-mono">{health?.version ?? '…'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Web version</dt>
            <dd className="font-mono">{__APP_VERSION__}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-400">{hint}</div>}
    </div>
  )
}
