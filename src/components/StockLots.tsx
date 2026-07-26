// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Per-part stock broken out by lot. A lot is a stock item at a location; a lot with
// a name/barcode is a distinct physical unit (a mini spool cut off a reel). From
// here you can cut a new lot off, move a whole lot to another bin (no scanner
// needed), merge a lot back, and print a lot's label.

import { useState } from 'react'
import { api, type StockItem, type StorageLocation } from '../lib/api'
import { num } from '../lib/format'
import { PrintLabelModal } from './PrintLabelModal'

export function StockLots({ partName, stock, locations, onChanged, canWrite = true }: {
  partName: string
  stock: StockItem[]
  locations: StorageLocation[]
  onChanged: () => void
  canWrite?: boolean
}) {
  const [split, setSplit] = useState<StockItem | null>(null)
  const [move, setMove] = useState<StockItem | null>(null)
  const [merge, setMerge] = useState<StockItem | null>(null)
  const [labelId, setLabelId] = useState<string | null>(null)

  // Only show lots that actually hold stock; moves/removes leave empty lots behind.
  const lots = stock.filter((s) => s.quantity > 0)

  if (lots.length === 0) {
    return <div className="p-4 c-faint text-sm">No stock recorded. Use “Adjust stock” to add some.</div>
  }

  return (
    <>
      <table className="tbl">
        <thead>
          <tr>
            <th>Location</th>
            <th>Lot</th>
            <th className="num">Quantity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lots.map((s) => {
            const isLot = !!(s.name || s.barcode || s.split_from)
            return (
              <tr key={s.id}>
                <td className="c-text">{s.location_name || <span className="c-faint">unassigned</span>}</td>
                <td>
                  {isLot
                    ? <span className="tag">{s.name || 'Lot'}</span>
                    : <span className="c-faint">bulk</span>}
                </td>
                <td className="num c-text">{num(s.quantity)}</td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>
                  {canWrite && <><button className="btn sm" onClick={() => setSplit(s)}>Split</button>{' '}
                  <button className="btn sm" onClick={() => setMove(s)}>Move</button>{' '}</>}
                  <button className="btn sm" onClick={() => setLabelId(s.id)}>Label</button>
                  {canWrite && lots.length > 1 && <>{' '}<button className="btn sm" onClick={() => setMerge(s)}>Merge</button></>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {split && <SplitDialog lot={split} locations={locations} onClose={() => setSplit(null)} onDone={() => { setSplit(null); onChanged() }} />}
      {move && <MoveDialog lot={move} locations={locations} onClose={() => setMove(null)} onDone={() => { setMove(null); onChanged() }} />}
      {merge && <MergeDialog lot={merge} others={lots.filter((x) => x.id !== merge.id)} onClose={() => setMerge(null)} onDone={() => { setMerge(null); onChanged() }} />}
      {labelId && <PrintLabelModal stockIDs={[labelId]} title={partName} onClose={() => setLabelId(null)} />}
    </>
  )
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h"><h3>{title}</h3></div>
        <div className="modal-b">{children}</div>
      </div>
    </div>
  )
}

// Cut a quantity off a lot into a new barcoded lot (a mini spool).
function SplitDialog({ lot, locations, onClose, onDone }: {
  lot: StockItem; locations: StorageLocation[]; onClose: () => void; onDone: (newId: string) => void
}) {
  const [qty, setQty] = useState('100')
  const [name, setName] = useState('')
  const [toLoc, setToLoc] = useState(lot.location_id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    const q = parseFloat(qty)
    if (isNaN(q) || q <= 0) { setErr('Enter a quantity'); return }
    setBusy(true); setErr(null)
    try {
      const created = await api.splitStock({ source_id: lot.id, quantity: q, to_location_id: toLoc || null, name: name.trim() || null })
      onDone(created.id)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not split')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Cut off a new lot" onClose={onClose}>
      <p className="c-faint text-sm" style={{ marginTop: 0 }}>From {num(lot.quantity)} in {lot.location_name || 'unassigned'}. Same part, its own barcode.</p>
      <label className="fieldlabel"><span>Quantity to cut off</span>
        <input className="input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
      </label>
      <label className="fieldlabel" style={{ marginTop: 10 }}><span>Lot name (optional)</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mini spool #1" />
      </label>
      <label className="fieldlabel" style={{ marginTop: 10 }}><span>Location</span>
        <select className="input" value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
          <option value="">Unassigned</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {err && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{err}</p>}
      <div className="flex gap-2" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? '…' : 'Cut off lot'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  )
}

// Move a whole lot to another location (relocate, keeping its identity). No scanner.
function MoveDialog({ lot, locations, onClose, onDone }: {
  lot: StockItem; locations: StorageLocation[]; onClose: () => void; onDone: () => void
}) {
  const [toLoc, setToLoc] = useState(lot.location_id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setBusy(true); setErr(null)
    try {
      await api.relocateStock({ stock_item_id: lot.id, to_location_id: toLoc || null })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not move')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Move this lot" onClose={onClose}>
      <p className="c-faint text-sm" style={{ marginTop: 0 }}>{num(lot.quantity)}{lot.name ? ` (${lot.name})` : ''} from {lot.location_name || 'unassigned'}.</p>
      <label className="fieldlabel"><span>Move to</span>
        <select className="input" value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
          <option value="">Unassigned</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {err && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{err}</p>}
      <div className="flex gap-2" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy} onClick={go}>{busy ? '…' : 'Move'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  )
}

// Pour a lot into another lot of the same part (e.g. spool back into the reel).
function MergeDialog({ lot, others, onClose, onDone }: {
  lot: StockItem; others: StockItem[]; onClose: () => void; onDone: () => void
}) {
  const [target, setTarget] = useState(others[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    if (!target) return
    setBusy(true); setErr(null)
    try {
      await api.mergeStock({ source_id: lot.id, target_id: target })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not merge')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Merge lot into another" onClose={onClose}>
      <p className="c-faint text-sm" style={{ marginTop: 0 }}>Pour {num(lot.quantity)}{lot.name ? ` (${lot.name})` : ''} into another lot; this one is removed.</p>
      <label className="fieldlabel"><span>Merge into</span>
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          {others.map((o) => <option key={o.id} value={o.id}>{(o.name || o.location_name || 'unassigned')} — {num(o.quantity)}</option>)}
        </select>
      </label>
      {err && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{err}</p>}
      <div className="flex gap-2" style={{ marginTop: 14 }}>
        <button className="btn primary" disabled={busy || !target} onClick={go}>{busy ? '…' : 'Merge'}</button>
        <button className="btn" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  )
}
