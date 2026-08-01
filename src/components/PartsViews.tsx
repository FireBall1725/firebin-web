// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The three selectable parts views (dense table, card grid, list cards). They
// share the category glyph, low-stock bar, and inline stock stepper. The view is
// a user preference chosen in Settings (see lib/prefs).

import { useMemo, useState } from 'react'
import type { Part } from '../lib/api'
import { allReference, isLow, isReference } from '../lib/stockState'
import { num } from '../lib/format'
import { PartGraphic } from './SymbolPicker'
import { catStyle } from '../lib/symbols'
import { icon } from '../lib/icons'
import { mdiChevronRight, mdiArchiveOutline } from '@mdi/js'

// A part's graphic src: its chosen symbol/image, else the category default symbol.
const graphicSrc = (part: Part, key: string) => part.image_path || `/symbols/${key}.svg`

// Parts that share a name are one logical part with variants (different MPN /
// footprint / value). Group them so the list shows a single expandable entry.
export interface PartGroup { name: string; parts: Part[]; total: number }
export function groupByName(parts: Part[]): PartGroup[] {
  const map = new Map<string, Part[]>()
  for (const p of parts) {
    const k = p.name.trim().toLowerCase()
    const arr = map.get(k)
    if (arr) arr.push(p)
    else map.set(k, [p])
  }
  return [...map.values()].map((ps) => ({
    name: ps[0].name,
    parts: ps,
    total: ps.reduce((s, p) => s + p.total_stock, 0),
  }))
}

// A variant's own label — what distinguishes it within the group.
const variantLabel = (p: Part) => p.primary_mpn || p.ipn || p.package || '—'

function useExpanded() {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (name: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(name)) n.delete(name)
      else n.add(name)
      return n
    })
  return { open, toggle }
}

function Chevron({ open }: { open: boolean }) {
  return icon(mdiChevronRight, {
    size: 15,
    style: { flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: 'var(--dim)' },
  })
}

export function PartThumb({ part, catName, size }: { part: Part; catName?: string; size: number }) {
  const { key, color } = catStyle(catName, part.name)
  return (
    <span
      className="pv-thumb"
      style={{
        width: size, height: size,
        background: `color-mix(in srgb, ${color} 15%, var(--panel-2))`,
        borderColor: `color-mix(in srgb, ${color} 30%, var(--border))`,
      }}
    >
      <PartGraphic src={graphicSrc(part, key)} color={color} size={Math.round(size * 0.62)} />
    </span>
  )
}


// ReferenceTag is what a part you do not own shows instead of a stock figure.
//
// A bare "0" is the same thing the app shows for something you have run out of,
// which is the one distinction this flag exists to make. The words matter more
// than the styling: "reference" alone still invites reading the 0 next to it.
function ReferenceTag() {
  return (
    <span className="pill ghost" title="Recorded for reference; you do not stock this">
      not stocked
    </span>
  )
}

function LowBar({ part, width }: { part: Part; width: number }) {
  const denom = (part.minimum_stock > 0 ? part.minimum_stock : 10) * 4
  const pct = Math.max(6, Math.min(100, Math.round((part.total_stock / denom) * 100)))
  return (
    <div className={`pv-bar ${isLow(part) ? 'low' : ''}`} style={{ width }}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

// Stepper: inline +/- for a leaf part. Templates hold no stock of their own, so
// they show the rolled-up number without controls.
function Stepper({ part, onAdjust }: { part: Part; onAdjust: (p: Part, d: number) => void }) {
  return (
    <span className="pv-stepper" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onAdjust(part, -1)} disabled={part.total_stock <= 0} aria-label="Remove one">−</button>
      <span className="v">{num(part.total_stock)}</span>
      <button onClick={() => onAdjust(part, 1)} aria-label="Add one">+</button>
    </span>
  )
}

export function CatChip({ catName, partName }: { catName: string; partName: string }) {
  const { color } = catStyle(catName, partName)
  return (
    <span className="pv-catchip" style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)` }}>
      {catName}
    </span>
  )
}

function LocTag({ part }: { part: Part }) {
  if (!part.primary_location) return <span className="c-faint" style={{ fontSize: 12 }}>—</span>
  return (
    <span className="pv-loc">
      {icon(mdiArchiveOutline)}
      {part.primary_location}
    </span>
  )
}

export interface ViewProps {
  parts: Part[]
  catName: (p: Part) => string | undefined
  onOpen: (p: Part) => void
  onAdjust: (p: Part, d: number) => void
  selectMode?: boolean
  selected?: Set<string>
  onToggleSelect?: (ids: string[]) => void
}

// Selection state for a row/group: how many of its part ids are picked.
function selState(ids: string[], selected?: Set<string>) {
  const n = selected ? ids.filter((id) => selected.has(id)).length : 0
  return { on: n > 0 && n === ids.length, ind: n > 0 && n < ids.length }
}

function Check({ on, ind, overlay }: { on: boolean; ind?: boolean; overlay?: boolean }) {
  return (
    <span className={`pv-check ${on ? 'on' : ''} ${ind ? 'ind' : ''} ${overlay ? 'ovl' : ''}`} aria-hidden>
      {on ? '✓' : ind ? '–' : ''}
    </span>
  )
}

// RowSel is the per-row selection handle threaded into each view when bulk-select
// mode is on.
type RowSel = { selected: Set<string>; toggle: (ids: string[]) => void }
const makeSel = (p: ViewProps): RowSel | undefined =>
  p.selectMode ? { selected: p.selected ?? new Set(), toggle: p.onToggleSelect ?? (() => {}) } : undefined

// ── Grid ─────────────────────────────────────────────────────────────────────
function GridCard({ p, cn, onOpen, onAdjust, variant = false, sel }: {
  p: Part; cn?: string; onOpen: (p: Part) => void; onAdjust: (p: Part, d: number) => void; variant?: boolean; sel?: RowSel
}) {
  const { key, color } = catStyle(cn, p.name)
  const on = sel?.selected.has(p.id) ?? false
  return (
    <button className={`pv-card${variant ? ' pv-variant' : ''}${on ? ' pv-selected' : ''}`} onClick={() => (sel ? sel.toggle([p.id]) : onOpen(p))}>
      {sel && <Check on={on} overlay />}
      <div className="art" style={{ background: `color-mix(in srgb, ${color} 15%, var(--panel-2))` }}>
        <PartGraphic src={graphicSrc(p, key)} color={color} size={40} />
        <span className="qa"><Stepper part={p} onAdjust={onAdjust} /></span>
      </div>
      <div className="b">
        <div className="nm truncate">{variant ? variantLabel(p) : p.name}</div>
        <div className="meta flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          {p.package && <span className="pill ghost">{p.package}</span>}
          {p.ipn && <span className="mono c-faint" style={{ fontSize: 11 }}>{p.ipn}</span>}
        </div>
        <div className="foot flex items-center justify-between">
          <span className="mono c-dim truncate" style={{ fontSize: 11, maxWidth: '62%' }}>{variant ? p.primary_manufacturer : p.primary_mpn}</span>
          {isReference(p)
            ? <ReferenceTag />
            : <span className={`pill ${isLow(p) ? 'low' : 'ok'}`}>{num(p.total_stock)}</span>}
        </div>
      </div>
    </button>
  )
}

export function PartsGrid(props: ViewProps) {
  const { parts, catName, onOpen, onAdjust } = props
  const sel = makeSel(props)
  const groups = useMemo(() => groupByName(parts), [parts])
  const { open, toggle } = useExpanded()
  return (
    <div className="pv pv-grid">
      {groups.flatMap((g) => {
        if (g.parts.length === 1) {
          const p = g.parts[0]
          return [<GridCard key={p.id} p={p} cn={catName(p)} onOpen={onOpen} onAdjust={onAdjust} sel={sel} />]
        }
        const isOpen = open.has(g.name)
        const { key, color } = catStyle(catName(g.parts[0]), g.name)
        const ids = g.parts.map((p) => p.id)
        const gs = selState(ids, sel?.selected)
        if (!isOpen) {
          return [
            <button key={g.name} className={`pv-card pv-group${gs.on ? ' pv-selected' : ''}`} onClick={() => (sel ? sel.toggle(ids) : toggle(g.name))}>
              {sel && <Check on={gs.on} ind={gs.ind} overlay />}
              <div className="art" style={{ background: `color-mix(in srgb, ${color} 15%, var(--panel-2))` }}>
                <PartGraphic src={graphicSrc(g.parts[0], key)} color={color} size={40} />
                <span className="qa pv-count">{g.parts.length}×</span>
              </div>
              <div className="b">
                <div className="nm truncate">{g.name}</div>
                <div className="meta"><span className="c-faint" style={{ fontSize: 11 }}>{g.parts.length} variants</span></div>
                <div className="foot flex items-center justify-between">
                  <span className="c-dim" style={{ fontSize: 11 }}>{sel ? 'Select all' : 'Show variants'}</span>
                  {allReference(g.parts)
                    ? <ReferenceTag />
                    : <span className={`pill ${g.total <= 0 ? 'low' : 'ok'}`}>{num(g.total)}</span>}
                </div>
              </div>
            </button>,
          ]
        }
        return [
          <div key={g.name} className="pv-groupbox">
            <div className="pv-groupbox-head" onClick={() => (sel ? sel.toggle(ids) : toggle(g.name))}>
              {sel ? <Check on={gs.on} ind={gs.ind} /> : <Chevron open />}
              <span className="pv-thumb" style={{ width: 34, height: 34, background: `color-mix(in srgb, ${color} 15%, var(--panel-2))`, borderColor: `color-mix(in srgb, ${color} 30%, var(--border))` }}>
                <PartGraphic src={graphicSrc(g.parts[0], key)} color={color} size={22} />
              </span>
              <div className="min-w-0" style={{ flex: 1 }}>
                <div className="nm truncate" style={{ fontWeight: 600 }}>{g.name}</div>
                <div className="c-faint" style={{ fontSize: 11.5 }}>
                  {g.parts.length} variants · {allReference(g.parts) ? 'not stocked' : `${num(g.total)} total`}
                </div>
              </div>
              <span className="c-dim" style={{ fontSize: 11.5 }}>{sel ? 'Select all' : 'Hide variants'}</span>
            </div>
            <div className="pv-groupbox-grid">
              {g.parts.map((p) => <GridCard key={p.id} p={p} cn={catName(p)} onOpen={onOpen} onAdjust={onAdjust} variant sel={sel} />)}
            </div>
          </div>,
        ]
      })}
    </div>
  )
}

// ── List cards ───────────────────────────────────────────────────────────────
// One list row. `variant` styles it as an indented child under a group header
// and titles it by its distinguishing value (MPN) instead of the shared name.
function LcRow({ p, cn, onOpen, onAdjust, variant = false, sel }: {
  p: Part; cn?: string; onOpen: (p: Part) => void; onAdjust: (p: Part, d: number) => void; variant?: boolean; sel?: RowSel
}) {
  const on = sel?.selected.has(p.id) ?? false
  return (
    <div className={`pv-lc${variant ? ' pv-variant' : ''}${on ? ' pv-selected' : ''}`} onClick={() => (sel ? sel.toggle([p.id]) : onOpen(p))}>
      {sel ? <Check on={on} /> : variant ? <span className="pv-vbar" /> : <span />}
      <PartThumb part={p} catName={cn} size={52} />
      <div className="min-w-0">
        <div className="nm truncate">{variant ? variantLabel(p) : p.name}</div>
        <div className="l2">
          {!variant && cn && <CatChip catName={cn} partName={p.name} />}
          {p.ipn && <span className="mono">{p.ipn}</span>}
          {!variant && p.primary_mpn && <><span className="c-faint">·</span><span className="mono" style={{ fontSize: 11.5 }}>{p.primary_mpn}</span></>}
          {p.primary_manufacturer && <span className="c-dim">{p.primary_manufacturer}</span>}
          {p.package && <><span className="c-faint">·</span><span className="pill ghost">{p.package}</span></>}
          <LocTag part={p} />
        </div>
      </div>
      <div className="stk">
        {isReference(p) ? (
          // No number, no bar, no stepper: each of those is a statement about
          // a quantity, and the point is that there is not one.
          <ReferenceTag />
        ) : (
          <>
            <div className={`big ${isLow(p) ? 'low' : ''}`}>{num(p.total_stock)}</div>
            <LowBar part={p} width={110} />
            <Stepper part={p} onAdjust={onAdjust} />
          </>
        )}
      </div>
    </div>
  )
}

export function PartsListCards(props: ViewProps) {
  const { parts, catName, onOpen, onAdjust } = props
  const sel = makeSel(props)
  const groups = useMemo(() => groupByName(parts), [parts])
  const { open, toggle } = useExpanded()
  return (
    <div className="pv pv-list">
      {groups.map((g) => {
        if (g.parts.length === 1) {
          const p = g.parts[0]
          return <LcRow key={p.id} p={p} cn={catName(p)} onOpen={onOpen} onAdjust={onAdjust} sel={sel} />
        }
        const cn = catName(g.parts[0])
        const isOpen = open.has(g.name)
        const ids = g.parts.map((p) => p.id)
        const gs = selState(ids, sel?.selected)
        return (
          <div key={g.name} className="pv-grp">
            <div className={`pv-lc pv-group${gs.on ? ' pv-selected' : ''}`} onClick={() => (sel ? sel.toggle(ids) : toggle(g.name))}>
              {sel ? <Check on={gs.on} ind={gs.ind} /> : <Chevron open={isOpen} />}
              <PartThumb part={g.parts[0]} catName={cn} size={52} />
              <div className="min-w-0">
                <div className="nm truncate">{g.name}<span className="c-faint" style={{ fontSize: 12, fontWeight: 400 }}> · {g.parts.length} variants</span></div>
                <div className="l2">
                  {cn && <CatChip catName={cn} partName={g.name} />}
                  <span className="c-dim truncate">{g.parts.map(variantLabel).join(', ')}</span>
                </div>
              </div>
              <div className="stk">
                {allReference(g.parts)
                  ? <ReferenceTag />
                  : (
                    <>
                      <div className={`big ${g.total <= 0 ? 'low' : ''}`}>{num(g.total)}</div>
                      <span className="c-faint" style={{ fontSize: 11 }}>across variants</span>
                    </>
                  )}
              </div>
            </div>
            {isOpen && g.parts.map((p) => (
              <LcRow key={p.id} p={p} cn={catName(p)} onOpen={onOpen} onAdjust={onAdjust} variant sel={sel} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Dense table ──────────────────────────────────────────────────────────────
function TableRow({ p, cn, onOpen, onAdjust, variant = false, sel }: {
  p: Part; cn?: string; onOpen: (p: Part) => void; onAdjust: (p: Part, d: number) => void; variant?: boolean; sel?: RowSel
}) {
  const on = sel?.selected.has(p.id) ?? false
  return (
    <tr className={`hoverable${on ? ' pv-selected' : ''}`} onClick={() => (sel ? sel.toggle([p.id]) : onOpen(p))}>
      {sel && <td onClick={(e) => { e.stopPropagation(); sel.toggle([p.id]) }}><Check on={on} /></td>}
      <td onClick={(e) => e.stopPropagation()}><PartThumb part={p} catName={cn} size={26} /></td>
      <td style={variant ? { paddingLeft: 22 } : undefined}>
        <div className="truncate" style={{ fontWeight: variant ? 450 : 550 }}>{variant ? variantLabel(p) : p.name}</div>
        {!variant && p.ipn && <div className="mono c-faint truncate" style={{ fontSize: 11 }}>{p.ipn}</div>}
      </td>
      <td>
        {variant ? (
          <span className="c-dim truncate" style={{ display: 'block', fontSize: 12 }}>{p.primary_manufacturer || '—'}</span>
        ) : p.primary_mpn ? (
          <><span className="mono truncate" style={{ display: 'block', fontSize: 12 }}>{p.primary_mpn}</span><div className="c-dim truncate" style={{ fontSize: 12 }}>{p.primary_manufacturer}</div></>
        ) : <span className="c-faint">—</span>}
      </td>
      <td>{p.package ? <span className="pill ghost">{p.package}</span> : <span className="c-faint">—</span>}</td>
      <td><LocTag part={p} /></td>
      <td className="num" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {isReference(p) ? <ReferenceTag /> : <Stepper part={p} onAdjust={onAdjust} />}
        </div>
      </td>
    </tr>
  )
}

export function PartsTable(props: ViewProps) {
  const { parts, catName, onOpen, onAdjust } = props
  const sel = makeSel(props)
  const groups = useMemo(() => groupByName(parts), [parts])
  const { open, toggle } = useExpanded()
  return (
    <div className="pv card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl pv-tbl">
          <thead>
            <tr>
              {sel && <th style={{ width: 34 }}></th>}
              <th style={{ width: 44 }}></th>
              <th>Part</th>
              <th>MPN / manufacturer</th>
              <th style={{ width: 66 }}>Pkg</th>
              <th style={{ width: 116 }}>Location</th>
              <th className="num" style={{ width: 184 }}>In stock</th>
            </tr>
          </thead>
          <tbody>
            {groups.flatMap((g) => {
              if (g.parts.length === 1) {
                const p = g.parts[0]
                return [<TableRow key={p.id} p={p} cn={catName(p)} onOpen={onOpen} onAdjust={onAdjust} sel={sel} />]
              }
              const isOpen = open.has(g.name)
              const ids = g.parts.map((p) => p.id)
              const gs = selState(ids, sel?.selected)
              const rows = [
                <tr key={g.name} className={`hoverable${gs.on ? ' pv-selected' : ''}`} onClick={() => (sel ? sel.toggle(ids) : toggle(g.name))}>
                  {sel && <td onClick={(e) => { e.stopPropagation(); sel.toggle(ids) }}><Check on={gs.on} ind={gs.ind} /></td>}
                  <td onClick={(e) => e.stopPropagation()}><PartThumb part={g.parts[0]} catName={catName(g.parts[0])} size={26} /></td>
                  <td>
                    <div style={{ fontWeight: 550, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{!sel && <Chevron open={isOpen} />}{g.name}<span className="c-faint" style={{ fontSize: 11 }}> · {g.parts.length} variants</span></div>
                  </td>
                  <td className="c-faint">{g.parts.length} MPNs</td>
                  <td></td>
                  <td></td>
                  <td className="num mono c-dim" style={{ fontSize: 12.5 }}>
                    {allReference(g.parts) ? 'not stocked' : num(g.total)}
                  </td>
                </tr>,
              ]
              if (isOpen) for (const p of g.parts) rows.push(<TableRow key={p.id} p={p} cn={catName(p)} onOpen={onOpen} onAdjust={onAdjust} variant sel={sel} />)
              return rows
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
