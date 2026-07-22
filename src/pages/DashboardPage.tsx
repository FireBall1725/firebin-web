// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Stats, type Part, type StockTransaction } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { useRealtime } from '../lib/useRealtime'
import { num, stockClass } from '../lib/format'

export function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [low, setLow] = useState<Part[]>([])
  const [recent, setRecent] = useState<StockTransaction[]>([])

  const load = useCallback(() => {
    api.getStats().then(setStats).catch(() => undefined)
    api.listLowStock().then(setLow).catch(() => undefined)
    api.recentActivity().then(setRecent).catch(() => undefined)
  }, [])

  useEffect(load, [load])
  useRealtime(['parts', 'stock', 'locations'], load)

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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Parts" value={stats ? num(stats.parts_count) : '…'} hint={stats ? `${stats.variants_count} variants` : ''} />
        <Stat label="Locations" value={stats ? num(stats.locations_count) : '…'} />
        <Stat
          label="Low stock"
          value={stats ? num(stats.low_stock_count) : '…'}
          accent={stats ? stats.low_stock_count > 0 : false}
        />
        <Stat label="Units on hand" value={stats ? num(stats.total_units) : '…'} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Panel title="Low stock">
          {low.length > 0 ? (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/60">
              {low.map((p) => (
                <li key={p.id}>
                  <Link to={`/parts/${p.id}`} className="flex items-center justify-between py-2 hover:text-amber-600 dark:hover:text-amber-400">
                    <span>
                      {p.name}
                      {p.package && <span className="ml-2 font-mono text-xs text-zinc-400">{p.package}</span>}
                    </span>
                    <span className="font-mono text-xs">
                      <span className={stockClass(p.total_stock, p.minimum_stock)}>{num(p.total_stock)}</span>
                      <span className="text-zinc-400"> / {num(p.minimum_stock)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">Nothing below its minimum. Nice.</p>
          )}
        </Panel>

        <Panel title="Recent activity">
          {recent.length > 0 ? (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/60">
              {recent.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2">
                  <span className="min-w-0 truncate">
                    {t.part_id ? (
                      <Link to={`/parts/${t.part_id}`} className="hover:text-amber-600 dark:hover:text-amber-400">
                        {t.part_name}
                      </Link>
                    ) : (
                      t.part_name
                    )}
                    <span className="ml-2 font-mono text-xs uppercase text-zinc-400">{t.kind}</span>
                  </span>
                  <span className={`ml-3 shrink-0 font-mono text-xs ${t.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {t.delta >= 0 ? '+' : ''}
                    {num(t.delta)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No stock movements yet.</p>
          )}
        </Panel>
      </div>

      <div className="mt-8 flex items-center gap-2 text-xs text-zinc-400">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        Live — updates automatically when inventory changes
      </div>
    </div>
  )
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-sm text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-3xl font-semibold ${accent ? 'text-amber-600 dark:text-amber-400' : ''}`}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-zinc-400">{hint}</div>}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">{children}</div>
    </section>
  )
}
