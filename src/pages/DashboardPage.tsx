// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type BoardFill, type DayCount, type Stats, type Part, type StockTransaction } from '../lib/api'
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

  // A board is ready when the shelf covers every matched line and no line is
  // unmatched. Leaving unmatched out would call a board buildable on the
  // strength of the lines someone happened to match.
  const boards = stats?.boards ?? []
  const ready = boards.filter((b) => b.short === 0 && b.unmatched === 0).length
  const toOrder = (stats?.low_stock_count ?? 0) + (stats?.not_stocked_count ?? 0)

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          dot="var(--good)"
          label="Ready to build"
          value={stats ? `${num(ready)} of ${num(boards.length)}` : '…'}
          delta={
            boards.length === 0
              ? 'No boards yet'
              : blockedSummary(boards)
          }
          crit={!!stats && boards.length > 0 && ready === 0}
        />
        <Stat
          dot="var(--crit)"
          label="Unmatched BOM lines"
          value={stats ? num(stats.unmatched_bom_lines) : '…'}
          delta={
            stats && stats.unmatched_bom_lines > 0
              ? 'Skipped by the pick list'
              : 'Every line resolves to a part'
          }
          crit={!!stats && stats.unmatched_bom_lines > 0}
        />
        <Stat
          dot="var(--warn)"
          label="To order"
          value={stats ? num(toOrder) : '…'}
          delta={
            stats
              ? `${num(stats.low_stock_count)} low · ${num(stats.not_stocked_count)} not stocked`
              : ''
          }
          crit={!!stats && toOrder > 0}
        />
        <Stat
          dot="var(--accent)"
          label="Movement"
          value={stats ? num(stats.moves_30d) : '…'}
          delta="last 30 days"
          spark={stats?.movement}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <div className="card-h">
            <h2>Boards</h2>
            {boards.length > 0 && (
              <span className="pill ghost" style={{ marginLeft: 'auto' }}>
                {num(ready)} ready
              </span>
            )}
          </div>
          {boards.length > 0 ? (
            <div>
              {boards.map((b) => {
                const blocked = b.short + b.unmatched
                const pct = b.lines > 0 ? Math.round(((b.lines - blocked) / b.lines) * 100) : 0
                return (
                  <div key={b.board_id} className="flex items-center justify-between px-4 py-2.5 bd-b" style={{ gap: 12 }}>
                    <Link
                      to={`/projects/${b.project_id}/boards/${b.board_id}`}
                      className="c-text min-w-0 truncate text-sm"
                    >
                      {b.name}
                    </Link>
                    <span className="flex shrink-0 items-center" style={{ gap: 10 }}>
                      {/* .bar-track is flex:1 with a min-width, written for a
                          table cell. Pinned to a fixed width here and forced to
                          block, since an inline span ignores the height. */}
                      <span className="bar-track" style={{ display: 'block', flex: 'none', width: 96, minWidth: 0 }}>
                        <span
                          className={`bar-fill ${blocked > 0 ? 'low' : ''}`}
                          style={{ display: 'block', width: `${pct}%` }}
                        />
                      </span>
                      <span
                        className="mono"
                        style={{ fontSize: 11.5, minWidth: 74, textAlign: 'right', color: blocked > 0 ? 'var(--warn)' : 'var(--good)' }}
                      >
                        {blocked === 0 ? 'buildable' : boardBlockedLabel(b)}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-4">
              <p className="c-faint text-sm">No boards with a bill of materials yet.</p>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-h">
            <h2>To order</h2>
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

      </div>

      <div className="mt-4 grid gap-4">
        <div className="card">
          <div className="card-h">
            <h2>Recent activity</h2>
            <span className="eyebrow" style={{ marginLeft: 'auto' }}>Live</span>
          </div>
          {recent.length > 0 ? (
            <div>
              {recent.map((t) => {
                const isMove = t.kind === 'move'
                const from = t.from_location_name || 'Unassigned'
                const to = t.to_location_name || 'Unassigned'
                return (
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
                      {isMove && (
                        <span className="mono" style={{ marginLeft: 8, fontSize: 11, color: 'var(--dim)' }}>
                          {from} → {to}
                        </span>
                      )}
                    </span>
                    {isMove ? (
                      <span className="mono shrink-0 c-dim" style={{ fontSize: 12, marginLeft: 12 }}>
                        {num(Math.abs(t.delta))}
                      </span>
                    ) : (
                      <span className={`mono shrink-0 ${t.delta >= 0 ? 'c-good' : 'c-crit'}`} style={{ fontSize: 12, marginLeft: 12 }}>
                        {t.delta >= 0 ? '+' : ''}
                        {num(t.delta)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="p-4">
              <p className="c-faint text-sm">No stock movements yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* The counts that used to be tiles. They are in the sidebar already and
          do not change week to week, so they sit here instead of taking a slot
          from something you act on. */}
      <div className="mt-4 card flex flex-wrap items-center" style={{ gap: 22, padding: '12px 16px' }}>
        <span className="mono c-dim" style={{ fontSize: 12 }}>{stats ? num(stats.parts_count) : '…'} parts</span>
        <span className="mono c-dim" style={{ fontSize: 12 }}>{stats ? num(stats.total_units) : '…'} units</span>
        <span className="mono c-dim" style={{ fontSize: 12 }}>{stats ? num(stats.locations_count) : '…'} bins</span>
        {!!stats && stats.parts_without_symbol > 0 && (
          <Link to="/kicad" className="mono" style={{ fontSize: 12, color: 'var(--warn)' }}>
            {num(stats.parts_without_symbol)} without a KiCad symbol
          </Link>
        )}
      </div>

      <div className="mt-6 flex items-center gap-2">
        <span className="live-dot" />
        <span className="eyebrow">Live — updates automatically when inventory changes</span>
      </div>
    </div>
  )
}

// blockedSummary says what is standing between the boards and buildable, rather
// than repeating the count above it. "1 of 2" with "1 board short 3 parts"
// underneath answers the next question without a click.
function blockedSummary(boards: BoardFill[]): string {
  const blocked = boards.filter((b) => b.short > 0 || b.unmatched > 0)
  if (blocked.length === 0) return 'Every board can be built'
  if (blocked.length === 1) return `${blocked[0].name} ${boardBlockedLabel(blocked[0])}`
  return `${num(blocked.length)} boards blocked`
}

// A board can be blocked two ways at once, and they are not interchangeable:
// short means buy something, unmatched means the BOM is not finished. Naming
// both beats one combined number that hides which problem you have.
function boardBlockedLabel(b: BoardFill): string {
  const parts: string[] = []
  if (b.short > 0) parts.push(`short ${num(b.short)}`)
  if (b.unmatched > 0) parts.push(`${num(b.unmatched)} unmatched`)
  return parts.join(' · ')
}

// Sparkline draws the movement series as an area with an emphasised last point.
//
// Scaled to its own maximum, so the shape is the signal and not the absolute
// height; the number beside it carries the magnitude. A run of zeros stays flat
// on the baseline rather than disappearing, which is the whole reason the series
// includes empty days.
function Sparkline({ data, width = 132, height = 30 }: { data: DayCount[]; width?: number; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(1, ...data.map((d) => d.count))
  const step = width / (data.length - 1)
  const y = (n: number) => height - 1 - (n / max) * (height - 3)
  const pts = data.map((d, i) => [i * step, y(d.count)] as const)
  const line = pts.map(([x, py], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      style={{ display: 'block', overflow: 'visible' }}
    >
      <path d={area} fill="var(--accent-soft)" />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="var(--accent)" />
    </svg>
  )
}

function Stat({
  dot,
  label,
  value,
  delta,
  crit,
  spark,
}: {
  dot: string
  label: string
  value: string
  delta?: string
  crit?: boolean
  spark?: DayCount[]
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
      {spark && spark.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <Sparkline data={spark} />
        </div>
      )}
      {delta && <div className="delta">{delta}</div>}
    </div>
  )
}
