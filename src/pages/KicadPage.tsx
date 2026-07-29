// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  api,
  type KicadIndexStatus,
  type KicadLibraryItem,
  type KicadLibrarySummary,
  type KicadUsage,
} from '../lib/api'
import { KicadDrawingView } from '../components/KicadDrawingView'
import { num } from '../lib/format'

type Kind = 'symbol' | 'footprint'

function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Browse the uploaded copy of the user's KiCad libraries: what was imported,
 *  where it came from, what each item looks like, and which parts use it. */
export function KicadPage() {
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

  useEffect(() => {
    api.kicadIndexStatus().then(setStatus).catch(() => setStatus({ scanned: false }))
  }, [])

  useEffect(() => {
    setLib(null)
    setItems([])
    setSelected(null)
    api.listKicadLibraries(kind).then(setLibs).catch(() => setLibs([]))
  }, [kind])

  useEffect(() => {
    if (!lib) return
    setLoadingItems(true)
    setSelected(null)
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
        </div>
      </div>
    )
  }

  return (
    <div>
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

      <div className="tabs" style={{ marginBottom: 14 }}>
        {(['symbol', 'footprint'] as Kind[]).map((k) => (
          <button key={k} className={`tab ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>
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
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {!lib && <p className="c-dim" style={{ padding: 12, fontSize: 13 }}>Choose a library on the left.</p>}
            {lib && loadingItems && <p className="c-dim" style={{ padding: 12, fontSize: 13 }}>Loading…</p>}
            {shownItems.map((it) => {
              const libID = `${it.lib}:${it.name}`
              return (
                <button
                  key={libID}
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
