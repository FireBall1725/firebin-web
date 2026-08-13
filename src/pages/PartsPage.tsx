// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type Part, type Category, type StorageLocation, type Tag } from '../lib/api'
import { chipClass } from '../lib/tags'
import { isLow } from '../lib/stockState'
import { PartFormModal } from '../components/PartForm'
import { PrintLabelModal } from '../components/PrintLabelModal'
import { BulkActionsModal, type BulkAction } from '../components/BulkActionsModal'
import { useRealtime } from '../lib/useRealtime'
import { usePartsView, usePageSize, setPageSize } from '../lib/prefs'
import { PartsTable, PartsGrid, PartsListCards, groupByName } from '../components/PartsViews'
import { Pager } from '../components/Pager'
import { comparePartNames } from '../lib/partSort'
import { icon } from '../lib/icons'
import { mdiPlus, mdiClose, mdiMagnify, mdiTune } from '@mdi/js'
import { useAuth } from '../auth/AuthContext'

export function PartsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const view = usePartsView()
  const pageSize = usePageSize()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [tagVocab, setTagVocab] = useState<Tag[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  // The tag filter lives in the URL, not in component state, so a tag chip on a
  // part page is a real link: shareable, bookmarkable, and survivable by the
  // back button.
  const [params, setParams] = useSearchParams()
  const tag = params.get('tag') ?? ''
  const clearTag = () => {
    const next = new URLSearchParams(params)
    next.delete('tag')
    setParams(next, { replace: true })
  }
  const [specOpen, setSpecOpen] = useState(false)
  const [pkg, setPkg] = useState('')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [page, setPage] = useState(1)

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)

  // Two different questions, two different endpoints. Spec search joins
  // part_parameters and compares units on the server, which the catalogue
  // listing neither does nor needs. It also returns variants rather than only
  // top-level parts, because a variant is usually the thing that carries the
  // spec being asked for.
  const load = useCallback(() => {
    setLoading(true)
    const bySpec = pkg.trim() !== '' || value.trim() !== ''
    const req = bySpec
      ? api.searchParts({
          search: search || undefined,
          category,
          package: pkg.trim() || undefined,
          value: value.trim() || undefined,
        })
      : api.listParts({
          search: search || undefined,
          category,
          tag: tag || undefined,
          // A tag filter drops the top-level restriction. Tagging one variant
          // and then being told nothing carries the tag is the wrong answer;
          // the whole point of asking is to see every part that has it.
          topLevel: !tag,
        })
    req
      .then(setParts)
      .catch(() => setParts([]))
      .finally(() => setLoading(false))
  }, [search, category, pkg, value, tag])

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
    api.listLocations().then(setLocations).catch(() => setLocations([]))
    api.listTags().then(setTagVocab).catch(() => setTagVocab([]))
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

  const shown = useMemo(() => (lowOnly ? parts.filter(isLow) : parts), [parts, lowOnly])

  // Group by name, then paginate whole groups (so a group never splits a page).
  const groups = useMemo(
    () => groupByName([...shown].sort((a, b) => comparePartNames(a.name, b.name))),
    [shown],
  )
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize))
  const pageNo = Math.min(page, totalPages)
  useEffect(() => { if (page !== pageNo) setPage(pageNo) }, [page, pageNo])
  useEffect(() => { setPage(1) }, [search, category, lowOnly, pageSize, pkg, value, tag])

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

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setBulkMsg(null); setBulkOpen(false) }
  const sel = [...selected]

  // Every part id across the current filter (all pages), for select-all.
  const allIds = useMemo(() => groups.flatMap((g) => g.parts.map((p) => p.id)), [groups])
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id))
  const toggleAll = () => setSelected((s) => {
    if (allSelected) { const n = new Set(s); allIds.forEach((id) => n.delete(id)); return n }
    return new Set([...s, ...allIds])
  })

  // The parts behind the current selection, for the modal's summary and so a
  // future action can reason about what it is changing.
  const selParts = useMemo(
    () => groups.flatMap((g) => g.parts).filter((p) => selected.has(p.id)),
    [groups, selected],
  )

  // Dispatch for the bulk modal. A discriminated union means a new action added
  // to BulkActionsModal fails to compile here until it is handled.
  const runBulk = (action: BulkAction) => {
    setBulkOpen(false)
    switch (action.kind) {
      case 'move': void doMove(action.locationID); break
      case 'minimumStock': void doSetMinimum(action.minimum); break
      case 'refresh': void doRefresh(); break
      case 'labels': setPrintOpen(true); break
    }
  }

  const doMove = async (locationID: string | null) => {
    if (!sel.length) return
    setBulkBusy(true)
    setBulkMsg(null)
    try {
      const r = await api.bulkMoveParts(sel, locationID)
      const dest = locationID ? (locations.find((l) => l.id === locationID)?.name ?? 'location') : 'Unassigned'
      setBulkMsg(`Moved ${r.moved} part${r.moved === 1 ? '' : 's'} to ${dest}${r.failed ? ` (${r.failed} failed)` : ''}.`)
      setSelected(new Set())
      load()
    } catch {
      setBulkMsg('Move failed.')
    } finally {
      setBulkBusy(false)
    }
  }

  // Set the reorder threshold across the selection. Zero is a clear, not a
  // threshold of zero, because the low-stock list filters on minimum_stock > 0;
  // the confirmation says which of the two happened so nobody has to remember.
  const doSetMinimum = async (n: number) => {
    if (!sel.length) return
    setBulkBusy(true)
    setBulkMsg(null)
    try {
      const r = await api.bulkSetMinimumStock(sel, n)
      const what = n === 0
        ? `Cleared the reorder point on ${r.updated} part${r.updated === 1 ? '' : 's'}; they no longer appear in low stock.`
        : `Set the reorder point to ${n} on ${r.updated} part${r.updated === 1 ? '' : 's'}.`
      setBulkMsg(`${what}${r.missing ? ` ${r.missing} could not be found; reload and try again.` : ''}`)
      setSelected(new Set())
      load()
    } catch {
      setBulkMsg('Could not set the reorder point.')
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
              {/* Only the selection state and one action live here. Every bulk
                  action is a segment inside BulkActionsModal, so the bar stays
                  this size however many actions exist. */}
              <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
                <button className="btn sm ghost" disabled={!sel.length} onClick={() => setSelected(new Set())}>Clear</button>
                <button
                  className="btn sm primary"
                  disabled={!sel.length || bulkBusy}
                  onClick={() => setBulkOpen(true)}
                >
                  {bulkBusy ? 'Working…' : `Bulk actions${sel.length ? ` (${sel.length})` : ''}`}
                </button>
              </div>
            </div>
          )}
          {bulkMsg && <div className="banner" style={{ marginBottom: 12, fontSize: 13 }}>{bulkMsg}</div>}

          <div className="flex items-center gap-2 mb-3">
            <div className="search" style={{ marginLeft: 0, flex: 1, maxWidth: 'none' }}>
              {icon(mdiMagnify)}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search parts, keywords, MPN…" />
            </div>
            <button
              className={`chipbtn ${specOpen || pkg || value ? 'on' : ''}`}
              onClick={() => {
                // Closing the panel clears its filters, so a hidden package or
                // value can never keep filtering the list from out of view.
                if (specOpen) { setPkg(''); setValue('') }
                setSpecOpen((v) => !v)
              }}
            >
              {icon(mdiTune)}
              By spec
            </button>
            <button className={`chipbtn crit ${lowOnly ? 'on' : ''}`} onClick={() => setLowOnly((v) => !v)}>
              <span className="pv-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--crit)', display: 'inline-block' }} />
              Low stock
            </button>
          </div>

          {/* An active tag filter has to be visible and removable. The URL is
              the only other place it shows, and a filter you cannot see is how
              "half my parts disappeared" happens. */}
          {tag && (
            <div className="flex items-center gap-2 mb-3">
              <span className="c-faint" style={{ fontSize: 13 }}>Tagged</span>
              <span className={chipClass(tagVocab.find((t) => t.slug === tag)?.colour)}>
                {tagVocab.find((t) => t.slug === tag)?.name ?? tag}
                <button type="button" className="x" onClick={clearTag} aria-label="Clear tag filter">
                  {icon(mdiClose, { size: 12 })}
                </button>
              </span>
            </div>
          )}

          {specOpen && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="c-faint" style={{ fontSize: 13, minWidth: 56 }}>Package</label>
                <input
                  className="input"
                  style={{ flex: '1 1 140px', minWidth: 120 }}
                  value={pkg}
                  onChange={(e) => setPkg(e.target.value)}
                  placeholder="0603"
                />
                <label className="c-faint" style={{ fontSize: 13, minWidth: 40 }}>Value</label>
                <input
                  className="input"
                  style={{ flex: '1 1 160px', minWidth: 140 }}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="220 ohm, 4.7uF, X7R…"
                />
              </div>
              <p className="c-faint" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                Package matches on part of the name, so 0603 finds 0603 (1608 Metric).
                A value with a unit compares as a real quantity, so 220 ohm never
                matches 220 pF and 100 ohm never matches 100 kΩ. A bare number
                matches the value printed on the part, whatever its unit.
              </p>
            </div>
          )}

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
      {bulkOpen && (
        <BulkActionsModal
          parts={selParts}
          locations={locations}
          canWrite={canWrite}
          onApply={runBulk}
          onClose={() => setBulkOpen(false)}
        />
      )}
      {printOpen && (
        <PrintLabelModal partIDs={sel} title={`${sel.length} parts`} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  )
}
