// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Shown when you scan a stock lot's QR (firebin://s/…) — a mini spool cut off a
// reel. Lot-precise: remove/add/count THIS lot, move the whole lot to a bin, merge
// it back into another lot, or open the part.

import { useEffect, useState } from 'react'
import { api, type StockItem, type StorageLocation } from '../lib/api'
import { num } from '../lib/format'
import { icon } from '../lib/icons'
import { mdiClose, mdiMinus, mdiPlus } from '@mdi/js'

export function LotActionMenu({ lotId, onClose, onOpenPart }: {
  lotId: string
  onClose: () => void
  onOpenPart: (partId: string) => void
}) {
  const [lot, setLot] = useState<StockItem | null>(null)
  const [others, setOthers] = useState<StockItem[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [tab, setTab] = useState<'remove' | 'add' | 'count' | 'move' | 'merge'>('remove')
  const [qty, setQty] = useState('1')
  const [toLoc, setToLoc] = useState('')
  const [mergeTarget, setMergeTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const reload = async () => {
    const l = await api.getStockItem(lotId)
    setLot(l)
    setToLoc((c) => c || l.location_id || '')
    const all = await api.listPartStock(l.part_id)
    setOthers(all.filter((x) => x.id !== lotId))
  }
  useEffect(() => {
    setQty('1'); setFlash(null); setErr(null)
    reload().catch(() => setErr('Could not load the lot.'))
    api.listLocations().then(setLocations).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId])

  const flashDone = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1800) }

  const adjust = async (kind: 'add' | 'remove' | 'count', q: number) => {
    if (isNaN(q) || q < 0) return
    setBusy(true); setErr(null)
    try {
      await api.adjustStockLot({ stock_item_id: lotId, kind, quantity: q })
      await reload()
      flashDone(kind === 'add' ? `Added ${num(q)}` : kind === 'remove' ? `Removed ${num(q)}` : `Set to ${num(q)}`)
    } catch { setErr('That did not go through.') } finally { setBusy(false) }
  }

  const apply = async () => {
    if (tab === 'move') {
      setBusy(true); setErr(null)
      try { await api.relocateStock({ stock_item_id: lotId, to_location_id: toLoc || null }); await reload(); flashDone('Moved') }
      catch { setErr('Move did not go through.') } finally { setBusy(false) }
      return
    }
    if (tab === 'merge') {
      if (!mergeTarget) return
      setBusy(true); setErr(null)
      try { await api.mergeStock({ source_id: lotId, target_id: mergeTarget }); onClose() }
      catch { setErr('Merge did not go through.') } finally { setBusy(false) }
      return
    }
    await adjust(tab, parseFloat(qty))
  }

  const applyLabel = tab === 'move' ? 'Move lot' : tab === 'merge' ? 'Merge' : tab === 'add' ? 'Add' : tab === 'remove' ? 'Remove' : 'Set count'

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Scanned lot</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">{icon(mdiClose)}</button>
        </div>
        <div className="modal-b">
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600 }}>{lot?.part_name ?? '…'}</div>
            <div className="c-faint text-sm">
              {lot?.name ? lot.name + ' · ' : ''}{lot ? num(lot.quantity) : '—'} on this lot{lot?.location_name ? ` at ${lot.location_name}` : ''}
            </div>
          </div>

          <div className="flex gap-2" style={{ marginBottom: 14 }}>
            <button className="btn flex items-center justify-center gap-1" style={{ flex: 1 }} disabled={busy} onClick={() => adjust('remove', 1)}>{icon(mdiMinus, { size: 16 })} Remove 1</button>
            <button className="btn flex items-center justify-center gap-1" style={{ flex: 1 }} disabled={busy} onClick={() => adjust('add', 1)}>{icon(mdiPlus, { size: 16 })} Add 1</button>
          </div>

          <div className="seg" style={{ marginBottom: 10 }}>
            {(['remove', 'add', 'count', 'move', 'merge'] as const).map((k) => (
              <button key={k} className={`seg-btn ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{k}</button>
            ))}
          </div>

          {tab === 'move' ? (
            <label className="fieldlabel"><span>Move lot to</span>
              <select className="input" value={toLoc} onChange={(e) => setToLoc(e.target.value)}>
                <option value="">Unassigned</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          ) : tab === 'merge' ? (
            <label className="fieldlabel"><span>Merge into</span>
              <select className="input" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                <option value="">Choose a lot…</option>
                {others.map((o) => <option key={o.id} value={o.id}>{(o.name || o.location_name || 'unassigned')} — {num(o.quantity)}</option>)}
              </select>
            </label>
          ) : (
            <label className="fieldlabel"><span>{tab === 'count' ? 'Counted quantity' : 'Quantity'}</span>
              <input className="input" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
            </label>
          )}

          {err && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{err}</p>}
          {flash && <p className="c-good text-sm" style={{ marginTop: 8 }}>{flash} ✓</p>}

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={busy || (tab === 'merge' && !mergeTarget)} onClick={apply}>{applyLabel}</button>
            {lot && <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => onOpenPart(lot.part_id)}>Open part</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
