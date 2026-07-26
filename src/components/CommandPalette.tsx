// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The "/" command palette: one box to jump to anything. Free text searches parts
// (name, MPN, IPN, description, footprint, keywords, category), locations, and
// projects; typed text that matches a known footprint/type/bin can be pinned as a
// facet chip, so you can lock "footprint: 0603" and then type "resistor" or "1k".
// All client-side over the already-loaded lists — fast, and smarter than the
// backend's name/MPN-only search.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Part, type Category, type StorageLocation, type Project } from '../lib/api'
import { catStyle } from '../lib/symbols'
import { PartGraphic } from './SymbolPicker'
import { icon } from '../lib/icons'
import {
  mdiMagnify,
  mdiClose,
  mdiArchiveOutline,
  mdiFolderOutline,
  mdiArrowRight,
  mdiTagOutline,
} from '@mdi/js'

type FacetKind = 'footprint' | 'type' | 'location'
type Facet = { kind: FacetKind; value: string }

const FACET_LABEL: Record<FacetKind, string> = { footprint: 'Footprint', type: 'Type', location: 'Bin' }

type Item =
  | { kind: 'facet'; id: string; facet: Facet }
  | { kind: 'part'; id: string; part: Part; catName?: string }
  | { kind: 'location'; id: string; loc: StorageLocation }
  | { kind: 'project'; id: string; project: Project }
  | { kind: 'command'; id: string; label: string; run: () => void }

const uniq = (xs: string[]) => Array.from(new Set(xs))

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [text, setText] = useState('')
  const [facets, setFacets] = useState<Facet[]>([])
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    api.listParts().then(setParts).catch(() => undefined)
    api.listCategories().then(setCategories).catch(() => undefined)
    api.listLocations().then(setLocations).catch(() => undefined)
    api.listProjects().then(setProjects).catch(() => undefined)
  }, [])

  const catById = useMemo(() => {
    const m = new Map<string, string>()
    categories.forEach((c) => m.set(c.id, c.name))
    return m
  }, [categories])
  const catName = (p: Part) => (p.category_id ? catById.get(p.category_id) : undefined)

  const packages = useMemo(() => uniq(parts.map((p) => p.package ?? '').filter(Boolean)).sort(), [parts])

  const hasFacet = (kind: FacetKind, value: string) =>
    facets.some((f) => f.kind === kind && f.value.toLowerCase() === value.toLowerCase())
  const addFacet = (facet: Facet) => {
    if (!hasFacet(facet.kind, facet.value)) setFacets((f) => [...f, facet])
    setText('')
    setSel(0)
    inputRef.current?.focus()
  }
  const removeFacet = (i: number) => setFacets((f) => f.filter((_, j) => j !== i))

  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean)

  const partMatches = (p: Part): boolean => {
    for (const f of facets) {
      if (f.kind === 'footprint' && !(p.package ?? '').toLowerCase().includes(f.value.toLowerCase())) return false
      if (f.kind === 'type' && (catName(p) ?? '').toLowerCase() !== f.value.toLowerCase()) return false
      if (f.kind === 'location' && (p.primary_location ?? '').toLowerCase() !== f.value.toLowerCase()) return false
    }
    if (!words.length) return facets.length > 0
    const hay = [p.name, p.primary_mpn, p.ipn, p.description, p.package, p.keywords, catName(p)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return words.every((w) => hay.includes(w))
  }

  // Assemble the selectable rows, in display order.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    const t = text.trim().toLowerCase()

    // Facet suggestions from the typed text.
    if (t) {
      const sug: Facet[] = []
      for (const pk of packages) if (pk.toLowerCase().includes(t) && !hasFacet('footprint', pk)) sug.push({ kind: 'footprint', value: pk })
      for (const c of categories) if (c.name.toLowerCase().includes(t) && !hasFacet('type', c.name)) sug.push({ kind: 'type', value: c.name })
      for (const l of locations) if (l.name.toLowerCase().includes(t) && !hasFacet('location', l.name)) sug.push({ kind: 'location', value: l.name })
      sug.slice(0, 4).forEach((f, i) => out.push({ kind: 'facet', id: `facet-${f.kind}-${f.value}-${i}`, facet: f }))
    }

    // Parts.
    if (words.length || facets.length) {
      parts.filter(partMatches).slice(0, 8).forEach((p) => out.push({ kind: 'part', id: `part-${p.id}`, part: p, catName: catName(p) }))
    }

    // Locations + projects (free-text only).
    if (t) {
      locations
        .filter((l) => l.name.toLowerCase().includes(t) || (l.barcode ?? '').toLowerCase().includes(t))
        .slice(0, 5)
        .forEach((l) => out.push({ kind: 'location', id: `loc-${l.id}`, loc: l }))
      projects
        .filter((p) => p.name.toLowerCase().includes(t) || (p.description ?? '').toLowerCase().includes(t) || p.tags.some((tag) => tag.toLowerCase().includes(t)))
        .slice(0, 5)
        .forEach((p) => out.push({ kind: 'project', id: `proj-${p.id}`, project: p }))
    }

    // Commands: navigation shortcuts, shown when empty or matching.
    const commands: { label: string; run: () => void }[] = [
      { label: 'Batch scan', run: () => window.dispatchEvent(new Event('firebin:batchscan')) },
      { label: 'Go to Parts', run: () => navigate('/parts') },
      { label: 'Go to Locations', run: () => navigate('/locations') },
      { label: 'Go to Projects', run: () => navigate('/projects') },
      { label: 'Go to Dashboard', run: () => navigate('/') },
      { label: 'Open Settings', run: () => navigate('/settings') },
    ]
    commands
      .filter((c) => !t || c.label.toLowerCase().includes(t))
      .forEach((c, i) => out.push({ kind: 'command', id: `cmd-${i}`, label: c.label, run: c.run }))

    return out
  }, [text, facets, parts, categories, locations, projects, packages])

  useEffect(() => { setSel(0) }, [text, facets])

  const activate = (item: Item) => {
    switch (item.kind) {
      case 'facet': addFacet(item.facet); break
      case 'part': navigate(`/parts/${item.part.id}`); onClose(); break
      case 'location': navigate('/locations'); onClose(); break
      case 'project': navigate(`/projects/${item.project.id}`); onClose(); break
      case 'command': item.run(); onClose(); break
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); return }
    if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) activate(items[sel]); return }
    if (e.key === 'Backspace' && text === '' && facets.length) { e.preventDefault(); removeFacet(facets.length - 1) }
  }

  // Group items for display while keeping a running index for the highlight.
  const order: { kind: Item['kind']; label: string }[] = [
    { kind: 'facet', label: 'Filters' },
    { kind: 'part', label: 'Parts' },
    { kind: 'location', label: 'Locations' },
    { kind: 'project', label: 'Projects' },
    { kind: 'command', label: 'Go to' },
  ]
  let idx = -1

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '11vh', background: 'rgba(6,10,16,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input-row">
          {icon(mdiMagnify)}
          {facets.map((f, i) => (
            <span key={`${f.kind}-${f.value}`} className="cmdk-chip">
              <span className="k">{FACET_LABEL[f.kind]}:</span> {f.value}
              <button onClick={() => removeFacet(i)} aria-label="Remove filter">{icon(mdiClose, { size: 13 })}</button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={facets.length ? 'Narrow further…' : 'Search parts, footprints, bins…'}
            aria-label="Command palette search"
          />
        </div>

        <div className="cmdk-results">
          {items.length === 0 ? (
            <div className="cmdk-empty">No matches. Try a part name, MPN, footprint, or bin.</div>
          ) : (
            order.map(({ kind, label }) => {
              const group = items.filter((it) => it.kind === kind)
              if (!group.length) return null
              return (
                <div key={kind}>
                  <div className="cmdk-sec">{label}</div>
                  {group.map((it) => {
                    idx += 1
                    const on = idx === sel
                    const myIdx = idx
                    return (
                      <div
                        key={it.id}
                        className={`cmdk-row ${on ? 'on' : ''}`}
                        onMouseMove={() => setSel(myIdx)}
                        onClick={() => activate(it)}
                      >
                        <Row item={it} />
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="cmdk-foot">
          <span><b>↑↓</b> navigate</span>
          <span><b>enter</b> open · pin filter</span>
          <span><b>esc</b> close</span>
        </div>
      </div>
    </div>
  )
}

function Row({ item }: { item: Item }) {
  if (item.kind === 'facet') {
    return (
      <>
        {icon(mdiTagOutline)}
        <div className="main">
          <div className="title">Filter {FACET_LABEL[item.facet.kind].toLowerCase()}: <b>{item.facet.value}</b></div>
        </div>
        <span className="meta">pin</span>
      </>
    )
  }
  if (item.kind === 'part') {
    const { key, color } = catStyle(item.catName, item.part.name)
    return (
      <>
        <PartGraphic src={item.part.image_path || `/symbols/${key}.svg`} color={color} size={20} />
        <div className="main">
          <div className="title">{item.part.name}</div>
          <div className="sub">
            {[item.catName, item.part.package, item.part.primary_mpn].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
        <span className="meta">{item.part.total_stock > 0 ? `${item.part.total_stock} in stock` : 'no stock'}</span>
      </>
    )
  }
  if (item.kind === 'location') {
    return (
      <>
        {icon(mdiArchiveOutline)}
        <div className="main"><div className="title">{item.loc.name}</div></div>
        {item.loc.barcode && <span className="meta">{item.loc.barcode}</span>}
      </>
    )
  }
  if (item.kind === 'project') {
    return (
      <>
        {icon(mdiFolderOutline)}
        <div className="main">
          <div className="title">{item.project.name}</div>
          {item.project.board_count > 0 && <div className="sub">{item.project.board_count} boards</div>}
        </div>
      </>
    )
  }
  return (
    <>
      {icon(mdiArrowRight)}
      <div className="main"><div className="title">{item.label}</div></div>
    </>
  )
}
