// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  api,
  type KicadIndexStatus,
  type KicadLibraryItem,
  type KicadLibrarySummary,
  type KicadUsage,
} from '../lib/api'
import { KicadDrawingView } from '../components/KicadDrawingView'
import { KicadScanModal } from '../components/KicadScanModal'
import { useAuth } from '../auth/AuthContext'
import { num } from '../lib/format'

type Kind = 'symbol' | 'footprint'

function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Browse the uploaded copy of the user's KiCad libraries: what was imported,
 *  where it came from, what each item looks like, and which parts use it. */
export function KicadPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [scanning, setScanning] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [status, setStatus] = useState<KicadIndexStatus | null>(null)
  const [kind, setKind] = useState<Kind>('symbol')
  const [libs, setLibs] = useState<KicadLibrarySummary[]>([])
  const [libFilter, setLibFilter] = useState('')
  const [lib, setLib] = useState<string | null>(null)
  const [items, setItems] = useState<KicadLibraryItem[]>([])
  const [itemFilter, setItemFilter] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [usage, setUsage] = useState<KicadUsage[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const itemsRef = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()

  // Deep link: /kicad?kind=symbol&lib_id=Device:R. Lets the command palette
  // hand off straight to a preview instead of dropping the user on an empty
  // three-pane page to find it again.
  useEffect(() => {
    const k = params.get('kind')
    const libID = params.get('lib_id')
    if (k !== 'symbol' && k !== 'footprint') return
    if (!libID || !libID.includes(':')) return
    setKind(k)
    setLib(libID.slice(0, libID.indexOf(':')))
    setSelected(libID)
    // Consume the params so a later manual click is not overridden by a stale
    // URL on the next render.
    setParams({}, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    api.kicadIndexStatus().then(setStatus).catch(() => setStatus({ scanned: false }))
  }, [reloadKey])

  // Deliberately does not clear `lib`/`selected`: switching kind does, but a
  // deep link sets kind and selection together and must survive this.
  useEffect(() => {
    api.listKicadLibraries(kind).then(setLibs).catch(() => setLibs([]))
  }, [kind, reloadKey])

  useEffect(() => {
    if (!lib) return
    setLoadingItems(true)
    // Clear the selection only when it belongs to another library. A deep link
    // sets `lib` and `selected` in one commit, so clearing unconditionally here
    // wiped the selection before the preview could ever load.
    setSelected((s) => (s?.startsWith(`${lib}:`) ? s : null))
    api
      .listKicadLibraryItems(kind, lib)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoadingItems(false))
  }, [kind, lib])

  useEffect(() => {
    if (!selected) {
      setUsage([])
      return
    }
    api.kicadUsage(kind, selected).then(setUsage).catch(() => setUsage([]))
  }, [kind, selected])

  const shownLibs = useMemo(() => {
    const q = libFilter.trim().toLowerCase()
    return q ? libs.filter((l) => l.lib.toLowerCase().includes(q)) : libs
  }, [libs, libFilter])

  // Libraries run to thousands of items, so filtering happens here rather than
  // rendering every row and letting the browser struggle.
  const shownItems = useMemo(() => {
    const q = itemFilter.trim().toLowerCase()
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items
    return list.slice(0, 400)
  }, [items, itemFilter])

  // Arrow keys walk the item list from anywhere on the page, so a preview can be
  // stepped through without reaching for the mouse. The handler sits on the page
  // container rather than the list: clicking a row moves focus to that button,
  // and a list-scoped handler would stop firing the moment it did.
  const onPageKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    // Leave the filter inputs alone — there, arrows mean caret movement.
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (shownItems.length === 0) return
    e.preventDefault()
    const idx = shownItems.findIndex((i) => `${i.lib}:${i.name}` === selected)
    const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
    const it = shownItems[Math.max(0, Math.min(shownItems.length - 1, next))]
    if (it) setSelected(`${it.lib}:${it.name}`)
  }

  // Keep the keyboard-selected row visible; without this the highlight walks off
  // the bottom of the scroll box.
  useEffect(() => {
    if (!selected) return
    itemsRef.current
      ?.querySelector<HTMLElement>(`[data-libid="${CSS.escape(selected)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    // `shownItems` is a dependency because a deep link sets `selected` before
    // the item fetch resolves. Keyed on `selected` alone, the row does not exist
    // in the DOM yet and the list stays parked at the top.
  }, [selected, shownItems])

  if (status && !status.scanned) {
    return (
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 650, margin: '0 0 10px' }}>KiCad libraries</h1>
        <div className="card" style={{ padding: 18 }}>
          <p className="c-dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>
            Nothing imported yet. Run the <span className="mono">kicad-index</span> tool on a
            machine with KiCad installed and it will upload your symbol and footprint
            libraries here.
            <br />
            <br />
            It reads your library tables, not just the stock directories, so third-party and
            custom libraries come across too. Those are the ones worth having: a KiCad install
            can always be reinstalled, your own footprints cannot.
          </p>
          {isAdmin && (
            <button className="btn primary" style={{ marginTop: 14 }} onClick={() => setScanning(true)}>
              Import from this browser instead
            </button>
          )}
        </div>
        {scanning && (
          <KicadScanModal onClose={() => setScanning(false)} onDone={() => setReloadKey((k) => k + 1)} />
        )}
      </div>
    )
  }

  return (
    // tabIndex makes the container focusable so it receives key events even
    // before anything inside it has been clicked.
    <div onKeyDown={onPageKeyDown} tabIndex={-1} style={{ outline: 'none' }}>
      <div className="flex flex-wrap items-end justify-between gap-4" style={{ marginBottom: 16 }}>
        <div>
          <span className="eyebrow">Workspace</span>
          <h1 style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 0' }}>
            KiCad libraries
          </h1>
        </div>
        {status?.meta && (
          <div className="c-dim" style={{ fontSize: 12.5, textAlign: 'right', lineHeight: 1.7 }}>
            <div>
              <span className="mono c-text">{num(status.meta.symbol_count)}</span> symbols ·{' '}
              <span className="mono c-text">{num(status.meta.footprint_count)}</span> footprints ·{' '}
              <span className="mono c-text">{mb(status.meta.bytes_stored)}</span>
            </div>
            {/* Provenance is what distinguishes "that library is not installed"
                from "you scanned from the wrong machine". */}
            <div>
              scanned from <span className="mono">{status.meta.source}</span>
              {status.meta.kicad_version ? ` (KiCad ${status.meta.kicad_version})` : ''} on{' '}
              {new Date(status.meta.scanned_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button className="btn sm" onClick={() => setScanning(true)}>Re-import…</button>
        </div>
      )}

      {scanning && (
        <KicadScanModal onClose={() => setScanning(false)} onDone={() => setReloadKey((k) => k + 1)} />
      )}

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['symbol', 'footprint'] as Kind[]).map((k) => (
          <button
            key={k}
            className={`tab ${kind === k ? 'on' : ''}`}
            onClick={() => { setKind(k); setLib(null); setItems([]); setSelected(null) }}
          >
            {k === 'symbol' ? 'Symbols' : 'Footprints'}
          </button>
        ))}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '260px 300px 1fr', alignItems: 'start' }}>
        {/* Libraries */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input
              className="input"
              value={libFilter}
              onChange={(e) => setLibFilter(e.target.value)}
              placeholder={`Filter ${libs.length} libraries`}
            />
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {shownLibs.map((l) => (
              <button
                key={l.lib}
                onClick={() => setLib(l.lib)}
                style={{
                  display: 'flex',
                  width: '100%',
                  gap: 8,
                  justifyContent: 'space-between',
                  padding: '7px 11px',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 12.5,
                  background: l.lib === lib ? 'rgba(200,140,60,0.16)' : 'transparent',
                  color: l.lib === lib ? 'var(--text)' : 'var(--text-dim)',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.lib}</span>
                <span className="c-dim mono" style={{ fontSize: 11.5 }}>{l.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Items in the selected library */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
            <input
              className="input"
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              placeholder={lib ? `Filter ${items.length} items` : 'Pick a library'}
              disabled={!lib}
            />
          </div>
          <div ref={itemsRef} style={{ maxHeight: 520, overflowY: 'auto' }}>
            {!lib && <p className="c-dim" style={{ padding: 12, fontSize: 13 }}>Choose a library on the left.</p>}
            {lib && loadingItems && <p className="c-dim" style={{ padding: 12, fontSize: 13 }}>Loading…</p>}
            {shownItems.map((it) => {
              const libID = `${it.lib}:${it.name}`
              return (
                <button
                  key={libID}
                  data-libid={libID}
                  onClick={() => setSelected(libID)}
                  className="mono"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 11px',
                    fontSize: 12,
                    border: 'none',
                    cursor: 'pointer',
                    background: libID === selected ? 'rgba(200,140,60,0.16)' : 'transparent',
                    color: libID === selected ? 'var(--text)' : 'var(--text-dim)',
                  }}
                >
                  {it.name}
                </button>
              )
            })}
            {/* Truncation is stated. A list that quietly stops reads as the
                whole library, and someone concludes their part is missing. */}
            {items.length > shownItems.length && (
              <p className="c-dim" style={{ padding: '8px 11px', fontSize: 12 }}>
                Showing {shownItems.length} of {items.length}. Filter to narrow.
              </p>
            )}
          </div>
        </div>

        {/* Preview + usage */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)' }}>
            <div className="mono" style={{ fontSize: 13, wordBreak: 'break-all' }}>
              {selected || <span className="c-dim">Select an item to preview it</span>}
            </div>
          </div>
          <KicadDrawingView kind={kind} libID={selected} height={360} />
          {selected && (
            <div style={{ padding: '11px 14px', borderTop: '1px solid var(--border)' }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Used by {usage.length} {usage.length === 1 ? 'part' : 'parts'}
              </div>
              {usage.length === 0 ? (
                <p className="c-dim" style={{ margin: 0, fontSize: 12.5 }}>
                  No inventory part maps to this yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {usage.map((u) => (
                    <Link key={u.part_id} to={`/parts/${u.part_id}`} className="tag">
                      {u.part_name}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
