// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { api, type KicadLibraryItem } from '../lib/api'
import { KicadDrawingView } from './KicadDrawingView'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

// Modelled on KiCad's own Symbol Chooser: a search box, a results list, and a
// live preview of whatever is highlighted. Picking a footprint by reading
// "Package_SO:TSSOP-24_4.4x7.8mm_P0.65mm" is guesswork; seeing the pads is not.

/** Debounce keystrokes so a fast typist issues one query, not eight. */
function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return out
}

export function KicadPicker({
  kind,
  initial,
  onPick,
  onClose,
}: {
  kind: 'symbol' | 'footprint'
  initial?: string
  onPick: (libID: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(initial ?? '')
  const [results, setResults] = useState<KicadLibraryItem[]>([])
  const [selected, setSelected] = useState<string | null>(initial || null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounced = useDebounced(query, 200)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .searchKicadLibrary(kind, debounced)
      .then((r) => {
        if (cancelled) return
        setResults(r)
        setSearched(true)
        // Keep the current pick if it survived the new search, otherwise
        // preview the top hit so the panel is never blank.
        setSelected((cur) => (cur && r.some((i) => `${i.lib}:${i.name}` === cur) ? cur : r[0] ? `${r[0].lib}:${r[0].name}` : null))
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kind, debounced])

  const confirm = (libID?: string) => {
    const pick = libID ?? selected
    if (pick) onPick(pick)
  }

  // Arrow keys move through results without leaving the search box, the way
  // every other chooser behaves.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
    if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
      return
    }
    e.preventDefault()
    const idx = results.findIndex((i) => `${i.lib}:${i.name}` === selected)
    const next = e.key === 'ArrowDown' ? idx + 1 : idx - 1
    const item = results[Math.max(0, Math.min(results.length - 1, next))]
    if (item) setSelected(`${item.lib}:${item.name}`)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Choose KiCad {kind}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>

        <div className="modal-b" style={{ display: 'grid', gap: 14 }}>
          <input
            ref={inputRef}
            className="input mono"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={kind === 'symbol' ? 'e.g. Device:R, or ESP32' : 'e.g. 0603, or TSSOP-24'}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, minHeight: 320 }}>
            <div
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                overflowY: 'auto',
                maxHeight: 340,
              }}
            >
              {loading && results.length === 0 ? (
                <p className="c-dim" style={{ padding: 14, fontSize: 13 }}>Searching…</p>
              ) : results.length === 0 ? (
                <p className="c-dim" style={{ padding: 14, fontSize: 13 }}>
                  {searched
                    ? 'No matches. All terms have to appear in the library ID.'
                    : 'Type to search.'}
                </p>
              ) : (
                results.map((it) => {
                  const libID = `${it.lib}:${it.name}`
                  const on = libID === selected
                  return (
                    <button
                      key={libID}
                      type="button"
                      onClick={() => setSelected(libID)}
                      onDoubleClick={() => confirm(libID)}
                      className="mono"
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '7px 11px',
                        fontSize: 12.5,
                        border: 'none',
                        cursor: 'pointer',
                        background: on ? 'var(--accent-soft, rgba(200,140,60,0.16))' : 'transparent',
                        color: on ? 'var(--text)' : 'var(--text-dim)',
                      }}
                    >
                      <span className="c-dim">{it.lib}:</span>
                      {it.name}
                      {!it.has_source && (
                        <span className="c-dim" title="Indexed by name only; no preview available">
                          {' '}·
                        </span>
                      )}
                    </button>
                  )
                })
              )}
              {results.length >= 50 && (
                // The API caps a search at 50 rows. Saying so beats letting
                // someone conclude their part is not in the library.
                <p className="c-dim" style={{ padding: '8px 11px', fontSize: 12 }}>
                  Showing the first 50. Add another term to narrow it.
                </p>
              )}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 10, display: 'grid', gridTemplateRows: '1fr auto' }}>
              <KicadDrawingView kind={kind} libID={selected} height={296} />
              <div style={{ padding: '9px 12px', borderTop: '1px solid var(--border)', minHeight: 44 }}>
                <div className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {selected || <span className="c-dim">nothing selected</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!selected} onClick={() => confirm()}>
            Use this {kind}
          </button>
        </div>
      </div>
    </div>
  )
}
