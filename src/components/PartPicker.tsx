// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// PartPicker is a small search-and-select for choosing an inventory part (pin a
// BOM line, or match a line during upload).
export function PartPicker({ onPick, placeholder = 'Search inventory…' }: { onPick: (p: { id: string; name: string }) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const s = q.trim()
    if (!s) { setResults([]); return }
    let live = true
    const t = setTimeout(() => {
      api.listParts({ search: s, topLevel: false })
        .then((ps) => { if (live) { setResults(ps.slice(0, 8).map((p) => ({ id: p.id, name: p.name }))); setOpen(true) } })
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
        <div style={{ marginTop: 4, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 180, overflowY: 'auto' }}>
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPick(p); setOpen(false); setQ('') }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
