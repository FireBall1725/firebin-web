// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The "/" command palette: one box to jump to anything. Free text searches parts
// (name, MPN, IPN, description, footprint, keywords, category), locations, and
// projects; typed text that matches a known footprint/type/bin can be pinned as a
// facet chip, so you can lock "footprint: 0603" and then type "resistor" or "1k".
// Parts, locations and projects are matched client-side over the already-loaded
// lists — fast, and smarter than the backend's name/MPN-only search. KiCad
// symbols and footprints are the exception: there are tens of thousands of them,
// so those are searched server-side and debounced.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  api,
  type Part,
  type Category,
  type StorageLocation,
  type Project,
  type KicadLibraryItem,
  type Datasheet,
} from '../lib/api'
import { catStyle } from '../lib/symbols'
import { PartGraphic } from './SymbolPicker'
import { DatasheetViewer } from './DatasheetViewer'
import { stockLabel } from '../lib/stockState'
import { icon } from '../lib/icons'
import { mdiArchiveOutline, mdiArrowRight, mdiClose, mdiFilePdfBox, mdiFolderOutline, mdiMagnify, mdiTagOutline, mdiVectorSquare } from '@mdi/js'

type FacetKind = 'footprint' | 'type' | 'location'
type Facet = { kind: FacetKind; value: string }

const FACET_LABEL: Record<FacetKind, string> = { footprint: 'Footprint', type: 'Type', location: 'Bin' }

type Item =
  | { kind: 'facet'; id: string; facet: Facet }
  | { kind: 'part'; id: string; part: Part; catName?: string }
  | { kind: 'location'; id: string; loc: StorageLocation }
  | { kind: 'project'; id: string; project: Project }
  | { kind: 'command'; id: string; label: string; run: () => void }
  | { kind: 'kicadlib'; id: string; item: KicadLibraryItem }

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
  // KiCad libraries are searched server-side. There are tens of thousands of
  // them, so unlike parts and locations they cannot be preloaded and filtered
  // in the browser.
  const [kicad, setKicad] = useState<KicadLibraryItem[]>([])
  // The part whose datasheet is open. Set by the PDF badge on a part row; the
  // viewer sits above the palette rather than replacing it, so closing the PDF
  // returns you to your search instead of losing it.
  const [datasheetPart, setDatasheetPart] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    api.listParts().then(setParts).catch(() => undefined)
    api.listCategories().then(setCategories).catch(() => undefined)
    api.listLocations().then(setLocations).catch(() => undefined)
    api.listProjects().then(setProjects).catch(() => undefined)
  }, [])

  // Debounced so a fast typist issues one query per pause, not one per keystroke.
  useEffect(() => {
    const q = text.trim()
    if (q.length < 2) {
      setKicad([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      Promise.all([
        api.searchKicadLibrary('symbol', q).catch(() => []),
        api.searchKicadLibrary('footprint', q).catch(() => []),
      ]).then(([sym, fp]) => {
        if (cancelled) return
        // Interleave so one kind cannot crowd the other out of the cap below.
        const out: KicadLibraryItem[] = []
        for (let i = 0; i < Math.max(sym.length, fp.length) && out.length < 6; i++) {
          if (sym[i]) out.push(sym[i])
          if (fp[i] && out.length < 6) out.push(fp[i])
        }
        setKicad(out)
      })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [text])

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

    // KiCad symbols and footprints, from the server-side index.
    kicad.forEach((it) =>
      out.push({ kind: 'kicadlib', id: `kicad-${it.kind}-${it.lib}:${it.name}`, item: it }),
    )

    // Commands: navigation shortcuts, shown when empty or matching.
    const commands: { label: string; run: () => void }[] = [
      { label: 'Batch scan', run: () => window.dispatchEvent(new Event('firebin:batchscan')) },
      { label: 'Go to Parts', run: () => navigate('/parts') },
      { label: 'Go to Datasheets', run: () => navigate('/datasheets') },
      { label: 'Go to Locations', run: () => navigate('/locations') },
      { label: 'Go to Projects', run: () => navigate('/projects') },
      { label: 'Go to Dashboard', run: () => navigate('/') },
      { label: 'Open Settings', run: () => navigate('/settings') },
    ]
    commands
      .filter((c) => !t || c.label.toLowerCase().includes(t))
      .forEach((c, i) => out.push({ kind: 'command', id: `cmd-${i}`, label: c.label, run: c.run }))

    return out
    // `kicad` belongs here: it lands asynchronously after the debounced search
    // resolves, so leaving it out froze the rows at the empty first render.
  }, [text, facets, parts, categories, locations, projects, packages, kicad])

  useEffect(() => { setSel(0) }, [text, facets])

  const activate = (item: Item) => {
    switch (item.kind) {
      case 'facet': addFacet(item.facet); break
      case 'part': navigate(`/parts/${item.part.id}`); onClose(); break
      case 'location': navigate('/locations'); onClose(); break
      case 'project': navigate(`/projects/${item.project.id}`); onClose(); break
      case 'command': item.run(); onClose(); break
      case 'kicadlib':
        navigate(`/kicad?kind=${item.item.kind}&lib_id=${encodeURIComponent(`${item.item.lib}:${item.item.name}`)}`)
        onClose()
        break
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
    // Must sit here, not at the end: rows are numbered in the order this array
    // is walked, and `sel` indexes the `items` array, where KiCad hits are
    // pushed after projects and before the commands. A group out of place here
    // highlights one row and opens another.
    { kind: 'kicadlib', label: 'KiCad library' },
    { kind: 'command', label: 'Go to' },
  ]
  // Built here rather than inside the JSX. Walking the groups and bumping a
  // running index inside the render output made every handler defined in that
  // map look like render-time work to react-hooks/refs, which activate() trips
  // by focusing inputRef. Same shape, computed before the return.
  let running = -1
  const sections = order.flatMap(({ kind, label }) => {
    const group = items.filter((it) => it.kind === kind)
    if (!group.length) return []
    return [{ kind, label, rows: group.map((item) => ({ item, index: (running += 1) })) }]
  })

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
            sections.map(({ kind, label, rows }) => (
              <div key={kind}>
                <div className="cmdk-sec">{label}</div>
                {rows.map(({ item, index }) => (
                  <div
                    key={item.id}
                    className={`cmdk-row ${index === sel ? 'on' : ''}`}
                    onMouseMove={() => setSel(index)}
                    // activate -> addFacet focuses inputRef. The rule follows
                    // that chain from a reference made in render and can't see
                    // that the handler only ever runs on a click, never during
                    // the render that created it. The alternative is routing
                    // the focus through a counter and an effect, which is more
                    // machinery than the false positive is worth.
                    // eslint-disable-next-line react-hooks/refs
                    onClick={() => activate(item)}
                  >
                    <Row item={item} onDatasheet={setDatasheetPart} />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="cmdk-foot">
          <span><b>↑↓</b> navigate</span>
          <span><b>enter</b> open · pin filter</span>
          <span><b>esc</b> close</span>
        </div>
      </div>

      {datasheetPart && (
        <PartDatasheetViewer partID={datasheetPart} onClose={() => setDatasheetPart(null)} />
      )}
    </div>
  )
}

// PartDatasheetViewer opens the datasheet linked to a part.
//
// The palette row only knows that a part HAS one (the has_datasheet flag from
// the list query), not which, so the document is resolved on click. That keeps
// the parts list one query instead of joining every datasheet into it.
function PartDatasheetViewer({ partID, onClose }: { partID: string; onClose: () => void }) {
  const [sheet, setSheet] = useState<Datasheet | null>(null)
  useEffect(() => {
    let cancelled = false
    api
      .listDatasheets({ part: partID })
      .then((list) => {
        if (cancelled) return
        if (list.length === 0) onClose()
        else setSheet(list[0])
      })
      .catch(() => !cancelled && onClose())
    return () => {
      cancelled = true
    }
  }, [partID, onClose])

  if (!sheet) return null
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DatasheetViewer datasheet={sheet} onClose={onClose} />
    </div>
  )
}

function Row({ item, onDatasheet }: { item: Item; onDatasheet: (partID: string) => void }) {
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
        <span className="meta">
          {item.part.has_datasheet && (
            // stopPropagation so the badge reads the datasheet instead of
            // navigating to the part, which is what the row itself does.
            <button
              className="cmdk-pdf"
              title="Read the datasheet"
              aria-label={`Read the datasheet for ${item.part.name}`}
              onClick={(e) => {
                e.stopPropagation()
                onDatasheet(item.part.id)
              }}
            >
              {icon(mdiFilePdfBox, { size: 14 })}
            </button>
          )}
          {stockLabel(item.part)}
        </span>
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
  if (item.kind === 'kicadlib') {
    return (
      <>
        {icon(mdiVectorSquare)}
        <div className="main">
          {/* Library first, dimmed: the name is what was searched for, the
              library is context. Matches how the picker lists them. */}
          <div className="title mono" style={{ fontSize: 13 }}>
            <span className="c-dim">{item.item.lib}:</span>{item.item.name}
          </div>
        </div>
        <span className="meta">KiCad {item.item.kind}</span>
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
