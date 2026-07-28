// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type Part } from '../lib/api'

// PartPicker is a small search-and-select for choosing an inventory part (pin a
// BOM line, or match a line during upload).
//
// Every row shows the detail needed to tell near-identical parts apart. An
// inventory holding both a 10 µF 25V and a 10 µF 6.3V has two parts with the
// same name, and picking the wrong one when matching a BOM puts an
// under-rated capacitor on the board. Name alone can't distinguish them, so
// the second line carries the description, the internal part number and the
// manufacturer part number.
export function PartPicker({ onPick, placeholder = 'Search inventory…' }: { onPick: (p: { id: string; name: string }) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Part[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const s = q.trim()
    if (!s) { setResults([]); return }
    let live = true
    const t = setTimeout(() => {
      api.listParts({ search: s, topLevel: false })
        .then((ps) => { if (live) { setResults(ps.slice(0, 8)); setOpen(true) } })
        .catch(() => { if (live) setResults([]) })
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  return (
    <div style={{ marginTop: 6 }}>
      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
      />
      {open && results.length > 0 && (
        <div style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPick(p); setOpen(false); setQ('') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                {p.package && (
                  <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--dim)', fontFamily: 'var(--mono)' }}>{p.package}</span>
                )}
                {/* Stock is what stops you matching a BOM line to a part you
                    have none of; zero is called out rather than hidden. */}
                <span
                  style={{ flexShrink: 0, fontSize: 11, fontFamily: 'var(--mono)', color: p.total_stock > 0 ? 'var(--good)' : 'var(--crit)' }}
                  title={p.primary_location ?? undefined}
                >
                  ×{p.total_stock}
                </span>
              </div>
              {detailLine(p) && (
                <div style={{ marginTop: 2, fontSize: 11, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {detailLine(p)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// detailLine builds the disambiguating second row: the internal part number
// first (it is the one the user assigned), then the description, which is
// where the rating that separates two same-named parts lives, then the MPN.
function detailLine(p: Part): string {
  return [p.ipn, p.description, p.primary_mpn].filter(Boolean).join(' · ')
}
