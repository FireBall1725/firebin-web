// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Part, type Category } from '../lib/api'
import { PartFormModal } from '../components/PartForm'
import { useRealtime } from '../lib/useRealtime'
import { usePartsView } from '../lib/prefs'
import { PartsTable, PartsGrid, PartsListCards } from '../components/PartsViews'

export function PartsPage() {
  const navigate = useNavigate()
  const view = usePartsView()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

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

  const catName = useCallback(
    (p: Part) => categories.find((c) => c.id === p.category_id)?.name,
    [categories],
  )

  // Inline stepper: adjust the part's primary bin (optimistic; SSE reconciles).
  const adjust = useCallback((p: Part, d: number) => {
    setParts((prev) => prev.map((x) => (x.id === p.id ? { ...x, total_stock: Math.max(0, x.total_stock + d) } : x)))
    api
      .adjustStock(p.id, { kind: d > 0 ? 'add' : 'remove', quantity: 1, location_id: p.primary_location_id ?? null })
      .catch(load)
  }, [load])

  const isLow = (p: Part) => p.total_stock <= 0 || (p.minimum_stock > 0 && p.total_stock <= p.minimum_stock)
  const shown = useMemo(() => (lowOnly ? parts.filter(isLow) : parts), [parts, lowOnly])
  const open = (p: Part) => navigate(`/parts/${p.id}`)

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

        {/* Parts */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="search" style={{ marginLeft: 0, flex: 1, maxWidth: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parts, keywords, MPN…" />
            </div>
            <button className={`chipbtn ${lowOnly ? 'on' : ''}`} onClick={() => setLowOnly((v) => !v)}>
              <span className="pv-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
              Low stock
            </button>
          </div>

          {loading ? (
            <div className="card"><p className="c-faint" style={{ textAlign: 'center', padding: 40 }}>Loading…</p></div>
          ) : shown.length === 0 ? (
            <div className="card"><p className="c-faint" style={{ textAlign: 'center', padding: 40 }}>
              {parts.length === 0 ? 'No parts yet. Add your first with "New part".' : 'No parts match this filter.'}
            </p></div>
          ) : view === 'table' ? (
            <PartsTable parts={shown} catName={catName} onOpen={open} onAdjust={adjust} />
          ) : view === 'grid' ? (
            <PartsGrid parts={shown} catName={catName} onOpen={open} onAdjust={adjust} />
          ) : (
            <PartsListCards parts={shown} catName={catName} onOpen={open} onAdjust={adjust} />
          )}
        </div>
      </div>

      {showNew && (
        <PartFormModal
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
