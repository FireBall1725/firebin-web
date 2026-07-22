// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Stats, type Part, type StockTransaction } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'

export function DashboardPage() {
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

  const fmtValue = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          dot="var(--accent)"
          label="Total parts"
          value={stats ? num(stats.parts_count) : '…'}
          delta={stats ? `${num(stats.variants_count)} variants` : ''}
        />
        <Stat
          dot="var(--dim)"
          label="Storage bins"
          value={stats ? num(stats.locations_count) : '…'}
        />
        <Stat
          dot="var(--crit)"
          label="Low stock"
          value={stats ? num(stats.low_stock_count) : '…'}
          crit={!!stats && stats.low_stock_count > 0}
        />
        <Stat
          dot="var(--good)"
          label="Inventory value"
          value={stats ? fmtValue(stats.inventory_value) : '…'}
          delta={stats ? `${num(stats.total_units)} units on hand` : ''}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-h">
            <h2>Reorder soon</h2>
            {low.length > 0 && <span className="pill low" style={{ marginLeft: 'auto' }}>{low.length} parts</span>}
          </div>
          {low.length > 0 ? (
            <div className="tbl-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th className="num">On hand</th>
                    <th className="num">Min</th>
                    <th>Level</th>
                  </tr>
                </thead>
                <tbody>
                  {low.map((p) => {
                    const pct = p.minimum_stock > 0 ? Math.min(100, Math.round((p.total_stock / p.minimum_stock) * 100)) : 0
                    const crit = p.total_stock <= 0 || pct <= 50
                    return (
                      <tr key={p.id} className="hoverable">
                        <td>
                          <Link to={`/parts/${p.id}`} className="c-text">
                            {p.name}
                            {p.package && <span className="tag" style={{ marginLeft: 8 }}>{p.package}</span>}
                          </Link>
                        </td>
                        <td className={`num ${crit ? 'c-crit' : 'c-warn'}`}>{num(p.total_stock)}</td>
                        <td className="num c-faint">{num(p.minimum_stock)}</td>
                        <td style={{ width: 140 }}>
                          <div className="bars">
                            <div className="bar-track">
                              <div className={`bar-fill ${crit ? 'low' : ''}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="mono" style={{ fontSize: 11, color: crit ? 'var(--crit)' : 'var(--warn)' }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <p className="c-faint text-sm">Nothing below its minimum. Nice.</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h2>Recent activity</h2>
            <span className="eyebrow" style={{ marginLeft: 'auto' }}>Live</span>
          </div>
          {recent.length > 0 ? (
            <div>
              {recent.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5 bd-b">
                  <span className="min-w-0 truncate text-sm">
                    {t.part_id ? (
                      <Link to={`/parts/${t.part_id}`} className="c-text">
                        {t.part_name}
                      </Link>
                    ) : (
                      <span className="c-text">{t.part_name}</span>
                    )}
                    <span className="mono" style={{ marginLeft: 8, fontSize: 11, textTransform: 'uppercase', color: 'var(--faint)' }}>{t.kind}</span>
                  </span>
                  <span className={`mono shrink-0 ${t.delta >= 0 ? 'c-good' : 'c-crit'}`} style={{ fontSize: 12, marginLeft: 12 }}>
                    {t.delta >= 0 ? '+' : ''}
                    {num(t.delta)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <p className="c-faint text-sm">No stock movements yet.</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2">
        <span className="live-dot" />
        <span className="eyebrow">Live — updates automatically when inventory changes</span>
      </div>
    </div>
  )
}

function Stat({
  dot,
  label,
  value,
  delta,
  crit,
}: {
  dot: string
  label: string
  value: string
  delta?: string
  crit?: boolean
}) {
  return (
    <div className="card stat">
      <div className="eyebrow">
        <span className="dot" style={{ background: dot }} />
        {label}
      </div>
      <div className="val" style={crit ? { color: 'var(--crit)' } : undefined}>
        {value}
      </div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  )
}
