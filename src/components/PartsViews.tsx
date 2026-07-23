// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The three selectable parts views (dense table, card grid, list cards). They
// share the category glyph, low-stock bar, and inline stock stepper. The view is
// a user preference chosen in Settings (see lib/prefs).

import type { Part } from '../lib/api'
import { num } from '../lib/format'

// ── Category identity (colour + glyph) ───────────────────────────────────────
type CatKind = 'res' | 'cap' | 'mod' | 'con' | 'reg' | 'def'
const GLYPH: Record<CatKind, string> = {
  res: 'M3 12h3l2-5 3 10 3-8 2 3h5',
  cap: 'M10 4v16M14 4v16M3 12h7M14 12h7',
  mod: 'M5 5h14v14H5zM8 3v2M12 3v2M16 3v2M8 19v2M12 19v2M16 19v2M3 8h2M3 12h2M3 16h2M19 8h2M19 12h2M19 16h2',
  con: 'M3 8h18v8H3zM7 8V6M12 8V6M17 8V6',
  reg: 'M6 4h12v16H6zM9 20v2M12 20v2M15 20v2',
  def: 'M4 4h16v16H4zM4 9h16',
}
function catKind(catName: string | undefined, partName: string): CatKind {
  const s = `${catName ?? ''} ${partName}`.toLowerCase()
  if (/resistor/.test(s)) return 'res'
  if (/capacitor|\bcap\b/.test(s)) return 'cap'
  if (/regulator|\bldo\b|diode|transistor/.test(s)) return 'reg'
  if (/module|esp32|esp8266|mcu|microcontroller/.test(s)) return 'mod'
  if (/connector|jack|header|socket|\busb\b|receptacle/.test(s)) return 'con'
  return 'def'
}
const catColor = (k: CatKind) => `var(--cat-${k})`

function Glyph({ kind }: { kind: CatKind }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={catColor(kind)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={GLYPH[kind]} />
    </svg>
  )
}

export function PartThumb({ part, catName, size }: { part: Part; catName?: string; size: number }) {
  const kind = catKind(catName, part.name)
  return (
    <span
      className="pv-thumb"
      style={{
        width: size, height: size,
        background: `color-mix(in srgb, ${catColor(kind)} 15%, var(--panel-2))`,
        borderColor: `color-mix(in srgb, ${catColor(kind)} 30%, var(--border))`,
      }}
    >
      <Glyph kind={kind} />
    </span>
  )
}

const isLow = (p: Part) => p.total_stock <= 0 || (p.minimum_stock > 0 && p.total_stock <= p.minimum_stock)

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

function CatChip({ catName, kind }: { catName: string; kind: CatKind }) {
  return (
    <span className="pv-catchip" style={{ color: catColor(kind), borderColor: `color-mix(in srgb, ${catColor(kind)} 45%, transparent)` }}>
      {catName}
    </span>
  )
}

function LocTag({ part }: { part: Part }) {
  if (!part.primary_location) return <span className="c-faint" style={{ fontSize: 12 }}>—</span>
  return (
    <span className="pv-loc">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>
      {part.primary_location}
    </span>
  )
}

export interface ViewProps {
  parts: Part[]
  catName: (p: Part) => string | undefined
  onOpen: (p: Part) => void
  onAdjust: (p: Part, d: number) => void
}

// ── Grid ─────────────────────────────────────────────────────────────────────
export function PartsGrid({ parts, catName, onOpen, onAdjust }: ViewProps) {
  return (
    <div className="pv pv-grid">
      {parts.map((p) => {
        const kind = catKind(catName(p), p.name)
        return (
          <button key={p.id} className="pv-card" onClick={() => onOpen(p)}>
            <div className="art" style={{ background: `color-mix(in srgb, ${catColor(kind)} 15%, var(--panel-2))` }}>
              <Glyph kind={kind} />
              {!p.is_template && (p.variant_count ?? 0) === 0 && <span className="qa"><Stepper part={p} onAdjust={onAdjust} /></span>}
            </div>
            <div className="b">
              <div className="nm truncate">{p.name}</div>
              <div className="flex items-center gap-2" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                {p.package && <span className="pill ghost">{p.package}</span>}
                {p.ipn && <span className="mono c-faint" style={{ fontSize: 11 }}>{p.ipn}</span>}
              </div>
              <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                <span className="mono c-dim" style={{ fontSize: 11 }}>{p.primary_mpn || (p.variant_count ? `${p.variant_count} variants` : '')}</span>
                <span className={`pill ${isLow(p) ? 'low' : 'ok'}`}>{num(p.total_stock)}</span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── List cards ───────────────────────────────────────────────────────────────
export function PartsListCards({ parts, catName, onOpen, onAdjust }: ViewProps) {
  return (
    <div className="pv pv-list">
      {parts.map((p) => {
        const cn = catName(p)
        const kind = catKind(cn, p.name)
        const isTemplate = p.is_template || (p.variant_count ?? 0) > 0
        return (
          <div key={p.id} className="pv-lc" onClick={() => onOpen(p)}>
            <span style={{ width: 4 }} />
            <PartThumb part={p} catName={cn} size={52} />
            <div className="min-w-0">
              <div className="nm truncate">{p.name}{isTemplate && <span className="c-faint" style={{ fontSize: 12, fontWeight: 400 }}> · {p.variant_count} variants</span>}</div>
              <div className="l2">
                {cn && <CatChip catName={cn} kind={kind} />}
                {p.ipn && <span className="mono">{p.ipn}</span>}
                {p.primary_mpn && <><span className="c-faint">·</span><span className="mono" style={{ fontSize: 11.5 }}>{p.primary_mpn}</span></>}
                {p.primary_manufacturer && <span className="c-dim">{p.primary_manufacturer}</span>}
                {p.package && <><span className="c-faint">·</span><span className="pill ghost">{p.package}</span></>}
                <LocTag part={p} />
              </div>
            </div>
            <div className="stk">
              <div className={`big ${isLow(p) ? 'low' : ''}`}>{num(p.total_stock)}</div>
              {!isTemplate && <LowBar part={p} width={110} />}
              {!isTemplate ? <Stepper part={p} onAdjust={onAdjust} /> : <span className="c-faint" style={{ fontSize: 11 }}>across variants</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Dense table ──────────────────────────────────────────────────────────────
export function PartsTable({ parts, catName, onOpen, onAdjust }: ViewProps) {
  return (
    <div className="pv card" style={{ overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 40 }}></th>
              <th>Part</th>
              <th>MPN / manufacturer</th>
              <th>Pkg</th>
              <th>Location</th>
              <th className="num" style={{ width: 180 }}>In stock</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((p) => {
              const cn = catName(p)
              const isTemplate = p.is_template || (p.variant_count ?? 0) > 0
              return (
                <tr key={p.id} className="hoverable" onClick={() => onOpen(p)}>
                  <td onClick={(e) => e.stopPropagation()}><PartThumb part={p} catName={cn} size={26} /></td>
                  <td>
                    <div style={{ fontWeight: 550 }}>{p.name}{isTemplate && <span className="c-faint" style={{ fontSize: 11 }}> · {p.variant_count} variants</span>}</div>
                    {p.ipn && <div className="mono c-faint" style={{ fontSize: 11 }}>{p.ipn}</div>}
                  </td>
                  <td>
                    {p.primary_mpn ? <><span className="mono" style={{ fontSize: 12 }}>{p.primary_mpn}</span><div className="c-dim" style={{ fontSize: 12 }}>{p.primary_manufacturer}</div></> : <span className="c-faint">—</span>}
                  </td>
                  <td>{p.package ? <span className="pill ghost">{p.package}</span> : <span className="c-faint">—</span>}</td>
                  <td><LocTag part={p} /></td>
                  <td className="num" onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
                      {!isTemplate && <LowBar part={p} width={70} />}
                      {!isTemplate ? <Stepper part={p} onAdjust={onAdjust} /> : <span className="c-dim mono" style={{ fontSize: 12.5 }}>{num(p.total_stock)}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
