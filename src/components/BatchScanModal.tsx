// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Batch scan mode: scan part after part to build a list on screen, then apply one
// action to the whole list at once — move them all to a bin, add/remove stock, or
// drop them into a project's BOM. While open it captures the wedge scanner (see
// Layout.registerScan) so scans land here instead of the single-part action menu.

import { useEffect, useRef, useState } from 'react'
import { api, type Part, type StorageLocation, type Project, type Board, type AdjustKind } from '../lib/api'
import { parseFirebinPartLink, resolveFirebinPart, parseFirebinLocationLink, resolveFirebinLocation, parseFirebinStockLink, resolveFirebinStock } from '../lib/deepLink'
import { PartGraphic } from './SymbolPicker'
import { catStyle } from '../lib/symbols'
import { icon } from '../lib/icons'
import { mdiClose, mdiTrashCanOutline, mdiBarcodeScan } from '@mdi/js'

type Action = 'move' | 'add' | 'remove' | 'project'

export function BatchScanModal({ registerScan, onClose }: {
  registerScan: (fn: ((code: string) => void) | null) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<{ part: Part; qty: number }[]>([])
  const [action, setAction] = useState<Action>('move')
  const [locId, setLocId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [boardId, setBoardId] = useState('')
  const [boards, setBoards] = useState<Board[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [manual, setManual] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => {
    api.listLocations().then(setLocations).catch(() => undefined)
    api.listProjects().then(setProjects).catch(() => undefined)
  }, [])

  // Load the chosen project's boards (BOM lines attach to a board).
  useEffect(() => {
    if (!projectId) { setBoards([]); setBoardId(''); return }
    api.getProject(projectId).then((p) => {
      const bs = p.boards ?? []
      setBoards(bs)
      setBoardId(bs[0]?.id ?? '')
    }).catch(() => { setBoards([]); setBoardId('') })
  }, [projectId])

  // Move every list item to a location: min(row qty, its largest OTHER source).
  // Row qty is the scanned count, or the whole bag for an intake barcode. Clears on
  // success. Used by the Move button AND by scanning a destination bin.
  const runMove = async (dest: string, destName?: string) => {
    if (items.length === 0) return
    setBusy(true); setMsg(null); setDone(null)
    try {
      let moved = 0
      for (const { part, qty } of items) {
        const stock = await api.listPartStock(part.id)
        const src = stock.filter((s) => s.location_id !== dest && s.quantity > 0).sort((a, b) => b.quantity - a.quantity)[0]
        if (src) { await api.moveStock({ stock_item_id: src.id, to_location_id: dest, quantity: Math.min(qty, src.quantity) }); moved++ }
      }
      setDone(`Moved ${moved} part${moved === 1 ? '' : 's'}${destName ? ` to ${destName}` : ''}`)
      setItems([])
    } catch {
      setMsg('Some items may not have moved.')
    } finally {
      setBusy(false)
    }
  }

  // Resolve a scanned code to a part and add it (or bump its qty).
  const add = async (code: string) => {
    setMsg(null); setDone(null)
    // Scanning a location sets the destination (and switches to Move), so you can
    // scan all the parts, then scan the bin they go into.
    const locCode = parseFirebinLocationLink(code)
    if (locCode != null) {
      const loc = await resolveFirebinLocation(locCode)
      if (!loc) { setMsg('Unknown location scanned'); return }
      setLocId(loc.id)
      setAction('move')
      // Scan the parts, then scan the destination bin to commit the move. With no
      // parts yet, it just sets the destination for the Move button.
      if (items.length > 0) await runMove(loc.id, loc.name)
      else setDone(`Destination set: ${loc.name}`)
      return
    }
    // Scanning a lot (mini spool) adds its part with the whole-lot quantity.
    const stockCode = parseFirebinStockLink(code)
    if (stockCode != null) {
      const lot = await resolveFirebinStock(stockCode)
      if (!lot) { setMsg('Unknown lot scanned'); return }
      try {
        const part = await api.getPart(lot.part_id)
        const want = lot.quantity || 1
        setItems((prev) => {
          const i = prev.findIndex((x) => x.part.id === part.id)
          if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: Math.max(n[i].qty, want) }; return n }
          return [...prev, { part, qty: want }]
        })
      } catch { setMsg('Could not load the scanned lot.') }
      return
    }
    const partCode = parseFirebinPartLink(code)
    let partId: string | null
    let intakeQty = 0 // >0 = an intake/distributor bag barcode that states a quantity
    if (partCode) {
      partId = await resolveFirebinPart(partCode)
    } else {
      try {
        const r = await api.scan(code)
        partId = r.match?.part_id ?? null
        intakeQty = r.parsed?.quantity ?? 0
      } catch { partId = null }
    }
    if (!partId) { setMsg(`No match for "${code.slice(0, 32)}"`); return }
    try {
      const part = await api.getPart(partId)
      setItems((prev) => {
        const i = prev.findIndex((x) => x.part.id === part.id)
        if (intakeQty > 0) {
          // Whole bag: take the greater of the barcode's quantity and everything in
          // stock (guards against inventory drift — you're carrying the bag off).
          const want = Math.max(intakeQty, part.total_stock || 0)
          if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: Math.max(n[i].qty, want) }; return n }
          return [...prev, { part, qty: want }]
        }
        // A part QR (or a code with no stated quantity): count one more.
        if (i >= 0) { const n = [...prev]; n[i] = { ...n[i], qty: n[i].qty + 1 }; return n }
        return [...prev, { part, qty: 1 }]
      })
    } catch {
      setMsg('Could not load the scanned part.')
    }
  }

  // Keep this modal registered as the scan sink while it's mounted.
  const addRef = useRef(add)
  // Updated in an effect rather than during render: writing a ref while
  // rendering is not safe under concurrent rendering, and the sink below only
  // reads it when a scan actually arrives.
  useEffect(() => {
    addRef.current = add
  }, [add])
  useEffect(() => {
    registerScan((code) => addRef.current(code))
    return () => registerScan(null)
  }, [registerScan])

  const setQty = (id: string, q: number) => setItems((prev) => prev.map((x) => (x.part.id === id ? { ...x, qty: Math.max(1, q || 1) } : x)))
  const removeItem = (id: string) => setItems((prev) => prev.filter((x) => x.part.id !== id))

  const submitManual = async () => {
    const code = manual.trim()
    if (!code) return
    setManual('')
    await add(code)
  }

  const targetReady = action === 'project' ? !!boardId : action === 'move' ? !!locId : true
  const canApply = items.length > 0 && !busy && targetReady

  const apply = async () => {
    if (action === 'move') { await runMove(locId); return }
    setBusy(true); setMsg(null); setDone(null)
    try {
      for (const { part, qty } of items) {
        if (action === 'add' || action === 'remove') {
          await api.adjustStock(part.id, { kind: action as AdjustKind, quantity: qty, location_id: locId || null })
        } else if (action === 'project') {
          await api.addBOMLine(boardId, { part_id: part.id, quantity: qty, ipn: part.ipn, description: part.name })
        }
      }
      const verb = action === 'add' ? 'Added stock for' : action === 'remove' ? 'Removed stock for' : 'Added to project:'
      setDone(`${verb} ${items.length} part${items.length === 1 ? '' : 's'}`)
      setItems([])
    } catch {
      setMsg('Something did not go through. Some items may have applied.')
    } finally {
      setBusy(false)
    }
  }

  const applyLabel = action === 'move' ? 'Move all' : action === 'add' ? 'Add stock' : action === 'remove' ? 'Remove stock' : 'Add to project'

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3 className="flex items-center gap-2">{icon(mdiBarcodeScan, { size: 18 })} Batch scan</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">{icon(mdiClose)}</button>
        </div>
        <div className="modal-b">
          <p className="c-faint text-sm" style={{ marginTop: 0 }}>
            Scan parts to build the list, then apply one action to all of them. {items.length > 0 && <b>{items.length} in list</b>}
          </p>

          {/* Scanned list */}
          <div style={{ maxHeight: 300, overflowY: 'auto', margin: '10px 0', border: '1px solid var(--border)', borderRadius: 10 }}>
            {items.length === 0 ? (
              <div style={{ padding: 22, textAlign: 'center' }} className="c-faint text-sm">
                Scan a part’s QR to start. Nothing here yet.
              </div>
            ) : (
              items.map(({ part, qty }) => {
                const { key, color } = catStyle(undefined, part.name)
                return (
                  <div key={part.id} className="flex items-center gap-3" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    <PartGraphic src={part.image_path || `/symbols/${key}.svg`} color={color} size={30} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{part.name}</div>
                      {part.ipn && <div className="c-faint text-sm">{part.ipn}</div>}
                    </div>
                    <input
                      type="number" min={1} className="input" style={{ width: 70 }}
                      value={qty} onChange={(e) => setQty(part.id, parseInt(e.target.value) || 1)}
                    />
                    <button className="icon-btn" aria-label="Remove" onClick={() => removeItem(part.id)}>{icon(mdiTrashCanOutline)}</button>
                  </div>
                )
              })
            )}
          </div>

          {/* Manual add (type or paste a code / MPN) */}
          <div className="flex gap-2" style={{ marginBottom: 12 }}>
            <input
              className="input" style={{ flex: 1 }} placeholder="Or type a code / MPN and press Enter"
              value={manual} onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual() } }}
            />
            <button className="btn" onClick={submitManual} disabled={!manual.trim()}>Add</button>
          </div>

          {/* Action bar */}
          <div className="seg" style={{ marginBottom: 10 }}>
            {(['move', 'add', 'remove', 'project'] as Action[]).map((a) => (
              <button key={a} className={`seg-btn ${action === a ? 'on' : ''}`} onClick={() => setAction(a)}>
                {a === 'project' ? 'to project' : a}
              </button>
            ))}
          </div>

          {action === 'project' ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="fieldlabel"><span>Project</span>
                <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">Choose a project…</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="fieldlabel"><span>Board</span>
                <select className="input" value={boardId} onChange={(e) => setBoardId(e.target.value)} disabled={boards.length === 0}>
                  {boards.length === 0 ? <option value="">No boards</option> : boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </label>
            </div>
          ) : (
            <label className="fieldlabel"><span>{action === 'move' ? 'Destination location' : 'Location'}</span>
              <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
                <option value="">{action === 'move' ? 'Choose a location…' : 'Unassigned'}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}

          {msg && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{msg}</p>}
          {done && <p className="c-good text-sm" style={{ marginTop: 8 }}>{done} ✓</p>}

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={!canApply} onClick={apply}>{busy ? 'Working…' : applyLabel}</button>
            {items.length > 0 && <button className="btn" onClick={() => setItems([])} disabled={busy}>Clear list</button>}
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}
