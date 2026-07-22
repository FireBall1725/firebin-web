// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Part, type Category } from '../lib/api'
import { NewPartModal } from '../components/NewPartModal'
import { num } from '../lib/format'
import { useRealtime } from '../lib/useRealtime'

export function PartsPage() {
  const navigate = useNavigate()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, Part[] | 'loading'>>({})

  const load = useCallback(() => {
    setLoading(true)
    api
      .listParts({ search: search || undefined, category, topLevel: true })
      .then(setParts)
      .catch(() => setParts([]))
      .finally(() => setLoading(false))
  }, [search, category])

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // Debounce search/category changes.
  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  // Live-refresh when anyone changes parts or stock elsewhere.
  useRealtime(['parts', 'stock'], load)
  useRealtime(['categories'], () => {
    api.listCategories().then(setCategories).catch(() => undefined)
  })

  const toggle = async (p: Part) => {
    if (expanded[p.id]) {
      setExpanded((e) => {
        const next = { ...e }
        delete next[p.id]
        return next
      })
      return
    }
    setExpanded((e) => ({ ...e, [p.id]: 'loading' }))
    const full = await api.getPart(p.id).catch(() => null)
    setExpanded((e) => ({ ...e, [p.id]: full?.variants ?? [] }))
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <span className="eyebrow">Inventory</span>
          <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 0' }}>
            Parts
          </h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          New part
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,200px) 1fr' }}>
        {/* Category rail */}
        <aside className="card self-start" style={{ position: 'sticky', top: 84 }}>
          <div className="card-h"><h2>Categories</h2></div>
          <button onClick={() => setCategory(undefined)} className={`cat ${category === undefined ? 'on' : ''}`}>
            <span>All parts</span>
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} className={`cat ${category === c.id ? 'on' : ''}`}>
              <span>{c.name}</span>
            </button>
          ))}
        </aside>

        {/* Table */}
        <div className="min-w-0">
          <div className="search mb-3" style={{ marginLeft: 0, width: '100%', maxWidth: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parts, keywords, MPN…" />
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Part / variant</th>
                  <th>Package</th>
                  <th className="num">Variants</th>
                  <th className="num">In stock</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="c-faint" style={{ textAlign: 'center', padding: '32px' }}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && parts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="c-faint" style={{ textAlign: 'center', padding: '32px' }}>
                      No parts yet. Add your first with “New part”.
                    </td>
                  </tr>
                )}
                {!loading &&
                  parts.map((p) => {
                    const isTemplate = (p.variant_count ?? 0) > 0
                    const rows = [
                      <PartRow
                        key={p.id}
                        part={p}
                        isTemplate={isTemplate}
                        expanded={!!expanded[p.id]}
                        onToggle={() => toggle(p)}
                        onOpen={() => navigate(`/parts/${p.id}`)}
                      />,
                    ]
                    const kids = expanded[p.id]
                    if (kids === 'loading') {
                      rows.push(
                        <tr key={p.id + '-l'}>
                          <td colSpan={4} className="c-faint" style={{ paddingLeft: 40, fontSize: 12 }}>
                            Loading variants…
                          </td>
                        </tr>,
                      )
                    } else if (Array.isArray(kids)) {
                      kids.forEach((v) =>
                        rows.push(
                          <PartRow key={v.id} part={v} variant onOpen={() => navigate(`/parts/${v.id}`)} />,
                        ),
                      )
                    }
                    return rows
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <NewPartModal
          categories={categories}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false)
            navigate(`/parts/${id}`)
          }}
        />
      )}
    </div>
  )
}

function PartRow({
  part,
  isTemplate,
  variant,
  expanded,
  onToggle,
  onOpen,
}: {
  part: Part
  isTemplate?: boolean
  variant?: boolean
  expanded?: boolean
  onToggle?: () => void
  onOpen: () => void
}) {
  const low = part.total_stock <= 0 || (part.minimum_stock > 0 && part.total_stock <= part.minimum_stock)
  return (
    <tr className={isTemplate ? 'tmpl-row' : 'hoverable'}>
      <td style={variant ? { paddingLeft: 34 } : undefined}>
        <div className="flex items-center gap-1.5">
          {isTemplate ? (
            <button
              onClick={onToggle}
              className="chev"
              style={{ border: 'none', background: 'none', cursor: 'pointer' }}
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span style={{ display: 'inline-block', width: 14 }} />
          )}
          <button onClick={onOpen} className="c-text" style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit' }}>
            {part.name}
          </button>
        </div>
      </td>
      <td>{part.package ? <span className="tag">{part.package}</span> : <span className="c-faint">—</span>}</td>
      <td className="num c-faint">{isTemplate ? part.variant_count : ''}</td>
      <td className="num">
        {isTemplate ? (
          <span className="c-dim">{num(part.total_stock)}</span>
        ) : (
          <span className={low ? 'c-crit' : 'c-text'} style={{ fontWeight: low ? 600 : 400 }}>{num(part.total_stock)}</span>
        )}
      </td>
    </tr>
  )
}
