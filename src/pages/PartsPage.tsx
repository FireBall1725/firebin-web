// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Part, type Category, type StorageLocation } from '../lib/api'
import { PartFormModal } from '../components/PartForm'
import { PrintLabelModal } from '../components/PrintLabelModal'
import { useRealtime } from '../lib/useRealtime'
import { usePartsView, usePageSize, setPageSize } from '../lib/prefs'
import { PartsTable, PartsGrid, PartsListCards, groupByName } from '../components/PartsViews'
import { Pager } from '../components/Pager'
import { comparePartNames } from '../lib/partSort'
import { icon } from '../lib/icons'
import { mdiPlus, mdiClose, mdiMagnify } from '@mdi/js'
import { useAuth } from '../auth/AuthContext'

export function PartsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const view = usePartsView()
  const pageSize = usePageSize()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [page, setPage] = useState(1)

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [moveLoc, setMoveLoc] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

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
    api.listLocations().then(setLocations).catch(() => setLocations([]))
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  useRealtime(['parts', 'stock'], load)
  useRealtime(['categories'], () => {
    api.listCategories().then(setCategories).catch(() => undefined)
  })

  const catName = useCallback(
    (p: Part) => categories.find((c) => c.id === p.category_id)?.name,
    [categories],
  )

  const delCategory = async (c: Category) => {
    if (!confirm(`Delete the empty category "${c.name}"?`)) return
    if (category === c.id) setCategory(undefined)
    setCategories((cs) => cs.filter((x) => x.id !== c.id))
    await api.deleteCategory(c.id).catch(() => api.listCategories().then(setCategories))
  }

  const adjust = useCallback((p: Part, d: number) => {
    setParts((prev) => prev.map((x) => (x.id === p.id ? { ...x, total_stock: Math.max(0, x.total_stock + d) } : x)))
    api
      .adjustStock(p.id, { kind: d > 0 ? 'add' : 'remove', quantity: 1, location_id: p.primary_location_id ?? null })
      .catch(load)
  }, [load])

  const isLow = (p: Part) => p.total_stock <= 0 || (p.minimum_stock > 0 && p.total_stock <= p.minimum_stock)
  const shown = useMemo(() => (lowOnly ? parts.filter(isLow) : parts), [parts, lowOnly])

  // Group by name, then paginate whole groups (so a group never splits a page).
  const groups = useMemo(
    () => groupByName([...shown].sort((a, b) => comparePartNames(a.name, b.name))),
    [shown],
  )
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize))
  const pageNo = Math.min(page, totalPages)
  useEffect(() => { if (page !== pageNo) setPage(pageNo) }, [page, pageNo])
  useEffect(() => { setPage(1) }, [search, category, lowOnly, pageSize])

  const pageGroups = groups.slice((pageNo - 1) * pageSize, pageNo * pageSize)
  const pageParts = useMemo(() => pageGroups.flatMap((g) => g.parts), [pageGroups])

  const open = (p: Part) => navigate(`/parts/${p.id}`)

  const toggleSelect = useCallback((ids: string[]) => {
    setSelected((s) => {
      const n = new Set(s)
      const allOn = ids.every((id) => n.has(id))
      for (const id of ids) { if (allOn) n.delete(id); else n.add(id) }
      return n
    })
  }, [])

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setBulkMsg(null); setMoveLoc('') }
  const sel = [...selected]

  // Every part id across the current filter (all pages), for select-all.
  const allIds = useMemo(() => groups.flatMap((g) => g.parts.map((p) => p.id)), [groups])
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const toggleAll = () => setSelected((s) => {
    if (allSelected) { const n = new Set(s); allIds.forEach((id) => n.delete(id)); return n }
    return new Set([...s, ...allIds])
  })

  const doMove = async () => {
    if (!sel.length) return
    setBulkBusy(true)
    setBulkMsg(null)
    try {
      const r = await api.bulkMoveParts(sel, moveLoc || null)
      const dest = moveLoc ? (locations.find((l) => l.id === moveLoc)?.name ?? 'location') : 'Unassigned'
      setBulkMsg(`Moved ${r.moved} part${r.moved === 1 ? '' : 's'} to ${dest}${r.failed ? ` (${r.failed} failed)` : ''}.`)
      setSelected(new Set())
      load()
    } catch {
      setBulkMsg('Move failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  // Enqueue the refresh as a background job and follow the task to completion,
  // showing live progress in the bulk bar. The work runs server-side now.
  const doRefresh = async () => {
    if (!sel.length) return
    setBulkBusy(true)
    setBulkMsg('Queuing refresh…')
    try {
      const { task_id } = await api.bulkEnrichParts(sel)
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
      for (let i = 0; i < 900; i++) {
        await sleep(600)
        const t = await api.getTask(task_id)
        if (t.status === 'queued' || t.status === 'running' || t.status === 'retrying') {
          setBulkMsg(`Refreshing metadata… ${t.progress_done}/${t.progress_total}`)
          continue
        }
        if (t.status === 'completed') {
          const u = t.result?.updated ?? 0
          const s = t.result?.skipped ?? 0
          setBulkMsg(`Refreshed ${u} part${u === 1 ? '' : 's'}${s ? ` · ${s} skipped (no MPN or lookup)` : ''}.`)
        } else if (t.status === 'cancelled') {
          setBulkMsg(`Refresh cancelled at ${t.progress_done}/${t.progress_total}.`)
        } else {
          setBulkMsg(`Refresh ${t.status}${t.error ? `: ${t.error}` : ''}.`)
        }
        break
      }
      load()
    } catch {
      setBulkMsg('Refresh failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  const viewProps = { parts: pageParts, catName, onOpen: open, onAdjust: adjust, selectMode, selected, onToggleSelect: toggleSelect }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <span className="eyebrow">Inventory</span>
          <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 0' }}>
            Parts
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => (selectMode ? exitSelect() : setSelectMode(true))} className={`btn ${selectMode ? 'primary' : ''}`}>
            {selectMode ? 'Done' : 'Select'}
          </button>
          {canWrite && (
            <button onClick={() => setShowNew(true)} className="btn primary">
              {icon(mdiPlus)}
              New part
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,200px) 1fr' }}>
        <aside className="card self-start" style={{ position: 'sticky', top: 84 }}>
          <div className="card-h"><h2>Categories</h2></div>
          <button onClick={() => setCategory(undefined)} className={`cat ${category === undefined ? 'on' : ''}`}>
            <span>All parts</span>
          </button>
          {categories.map((c) => (
            <div key={c.id} className="cat-row">
              <button onClick={() => setCategory(c.id)} className={`cat ${category === c.id ? 'on' : ''}`}>
                <span className="truncate">{c.name}</span>
                {c.part_count > 0 && <span className="cat-count">{c.part_count}</span>}
              </button>
              {c.part_count === 0 && canWrite && (
                <button className="cat-del" title="Delete empty category" aria-label={`Delete ${c.name}`} onClick={() => delCategory(c)}>
                  {icon(mdiClose)}
                </button>
              )}
            </div>
          ))}
        </aside>

        <div className="min-w-0">
          {selectMode && (
            <div className="bulkbar">
              <span className="c-text" style={{ fontSize: 13.5, fontWeight: 600 }}>{sel.length} selected</span>
              <button className="btn sm" disabled={!allIds.length} onClick={toggleAll}>
                {allSelected ? 'Deselect all' : `Select all ${allIds.length}`}
              </button>
              <div className="flex items-center gap-2" style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
                {canWrite && (
                  <select className="input" style={{ width: 150 }} value={moveLoc} onChange={(e) => setMoveLoc(e.target.value)}>
                    <option value="">Unassigned</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
                {canWrite && <button className="btn sm" disabled={!sel.length || bulkBusy} onClick={doMove}>Move</button>}
                {canWrite && <button className="btn sm" disabled={!sel.length || bulkBusy} onClick={doRefresh}>Refresh metadata</button>}
                <button className="btn sm" disabled={!sel.length} onClick={() => setPrintOpen(true)}>Print labels</button>
                <button className="btn sm ghost" disabled={!sel.length} onClick={() => setSelected(new Set())}>Clear</button>
              </div>
            </div>
          )}
          {bulkMsg && <div className="banner" style={{ marginBottom: 12, fontSize: 13 }}>{bulkMsg}</div>}

          <div className="flex items-center gap-2 mb-3">
            <div className="search" style={{ marginLeft: 0, flex: 1, maxWidth: 'none' }}>
              {icon(mdiMagnify)}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parts, keywords, MPN…" />
            </div>
            <button className={`chipbtn crit ${lowOnly ? 'on' : ''}`} onClick={() => setLowOnly((v) => !v)}>
              <span className="pv-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
              Low stock
            </button>
          </div>

          {loading ? (
            <div className="card"><p className="c-faint" style={{ textAlign: 'center', padding: 40 }}>Loading…</p></div>
          ) : groups.length === 0 ? (
            <div className="card"><p className="c-faint" style={{ textAlign: 'center', padding: 40 }}>
              {parts.length === 0 ? 'No parts yet. Add your first with "New part".' : 'No parts match this filter.'}
            </p></div>
          ) : (
            <>
              {view === 'table' ? <PartsTable {...viewProps} />
                : view === 'grid' ? <PartsGrid {...viewProps} />
                : <PartsListCards {...viewProps} />}
              <Pager
                page={pageNo}
                totalPages={totalPages}
                total={groups.length}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="groups"
              />
            </>
          )}
        </div>
      </div>

      {showNew && (
        <PartFormModal
          categories={categories}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); navigate(`/parts/${id}`) }}
        />
      )}
      {printOpen && (
        <PrintLabelModal partIDs={sel} title={`${sel.length} parts`} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  )
}
