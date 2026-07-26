// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The quick action sheet shown after scanning a part you already have: pull one,
// add one, move stock between bins, set an exact count, or open the full part
// page. Beats jumping to the part page for hands-on inventory work.

import { useEffect, useState } from 'react'
import { api, type Part, type StockItem, type StorageLocation, type AdjustKind } from '../lib/api'
import { PartGraphic } from './SymbolPicker'
import { catStyle } from '../lib/symbols'
import { num } from '../lib/format'
import { icon } from '../lib/icons'
import { mdiClose, mdiMinus, mdiPlus } from '@mdi/js'

export function ScanActionMenu({ partId, moveSignal, onClose, onOpenPart }: {
  partId: string
  moveSignal?: { locationId: string; name: string; n: number } | null
  onClose: () => void
  onOpenPart: (id: string) => void
}) {
  const [part, setPart] = useState<Part | null>(null)
  const [stock, setStock] = useState<StockItem[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [tab, setTab] = useState<'remove' | 'add' | 'count' | 'move'>('remove')
  const [qty, setQty] = useState('1')
  const [locId, setLocId] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const reload = async () => {
    const [p, s] = await Promise.all([api.getPart(partId), api.listPartStock(partId)])
    setPart(p)
    setStock(s)
    setLocId((c) => c || p.primary_location_id || s[0]?.location_id || '')
    setFromId((c) => (s.some((x) => x.id === c) ? c : s[0]?.id ?? ''))
  }
  useEffect(() => {
    setQty('1'); setFlash(null); setErr(null)
    reload().catch(() => setErr('Could not load the part.'))
    api.listLocations().then(setLocations).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId])

  const flashDone = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 1800) }

  // Scanning a location while this menu is open moves the part there: consolidate
  // every stock item into the scanned bin. Fetches fresh stock to avoid staleness.
  useEffect(() => {
    if (!moveSignal) return
    let cancelled = false
    ;(async () => {
      setBusy(true); setErr(null)
      try {
        const fresh = await api.listPartStock(partId)
        const items = fresh.filter((s) => s.location_id !== moveSignal.locationId && s.quantity > 0)
        if (items.length === 0) { if (!cancelled) flashDone(`Already at ${moveSignal.name}`); return }
        for (const s of items) {
          await api.moveStock({ stock_item_id: s.id, to_location_id: moveSignal.locationId, quantity: s.quantity })
        }
        await reload()
        if (!cancelled) flashDone(`Moved to ${moveSignal.name}`)
      } catch {
        if (!cancelled) setErr('Move did not go through.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveSignal?.n])

  const adjust = async (kind: AdjustKind, q: number, location: string) => {
    if (isNaN(q) || q < 0) return
    setBusy(true); setErr(null)
    try {
      await api.adjustStock(partId, { kind, quantity: q, location_id: location || null })
      await reload()
      flashDone(kind === 'add' ? `Added ${num(q)}` : kind === 'remove' ? `Removed ${num(q)}` : `Set to ${num(q)}`)
    } catch {
      setErr('That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    const q = parseFloat(qty)
    if (isNaN(q) || q < 0) return
    if (tab !== 'move') { await adjust(tab, q, locId); return }
    setBusy(true); setErr(null)
    try {
      await api.moveStock({ stock_item_id: fromId, to_location_id: toId || null, quantity: q })
      await reload()
      flashDone(`Moved ${num(q)}`)
    } catch {
      setErr('Move did not go through.')
    } finally {
      setBusy(false)
    }
  }

  const total = part?.total_stock ?? stock.reduce((s, x) => s + x.quantity, 0)
  const { key, color } = catStyle(undefined, part?.name ?? '')
  const thumb = part?.image_path || `/symbols/${key}.svg`
  const applyLabel = tab === 'move' ? 'Move' : tab === 'add' ? 'Add' : tab === 'remove' ? 'Remove' : 'Set count'

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Scanned part</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">{icon(mdiClose)}</button>
        </div>
        <div className="modal-b">
          <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
            <PartGraphic src={thumb} color={color} size={40} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{part?.name ?? '…'}</div>
              <div className="c-faint text-sm">
                {part?.ipn ? part.ipn + ' · ' : ''}In stock: {num(total)}{part?.primary_location ? ` at ${part.primary_location}` : ''}
              </div>
            </div>
          </div>

          <div className="flex gap-2" style={{ marginBottom: 14 }}>
            <button className="btn flex items-center justify-center gap-1" style={{ flex: 1 }} disabled={busy} onClick={() => adjust('remove', 1, locId)}>
              {icon(mdiMinus, { size: 16 })} Remove 1
            </button>
            <button className="btn flex items-center justify-center gap-1" style={{ flex: 1 }} disabled={busy} onClick={() => adjust('add', 1, locId)}>
              {icon(mdiPlus, { size: 16 })} Add 1
            </button>
          </div>

          <div className="seg" style={{ marginBottom: 10 }}>
            {(['remove', 'add', 'count', 'move'] as const).map((k) => (
              <button key={k} className={`seg-btn ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{k}</button>
            ))}
          </div>

          {tab === 'move' ? (
            <div className="space-y-2">
              <label className="fieldlabel"><span>From</span>
                <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)}>
                  {stock.length === 0 && <option value="">No stock to move</option>}
                  {stock.map((s) => <option key={s.id} value={s.id}>{s.location_name ?? 'Unassigned'} ({num(s.quantity)})</option>)}
                </select>
              </label>
              <label className="fieldlabel"><span>To</span>
                <select className="input" value={toId} onChange={(e) => setToId(e.target.value)}>
                  <option value="">Choose a location…</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <label className="fieldlabel"><span>Quantity</span>
                <input className="input" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="fieldlabel"><span>{tab === 'count' ? 'Counted quantity' : 'Quantity'}</span>
                <input className="input" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
              </label>
              <label className="fieldlabel"><span>Location</span>
                <select className="input" value={locId} onChange={(e) => setLocId(e.target.value)}>
                  <option value="">Unassigned</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            </div>
          )}

          {err && <p className="c-crit text-sm" style={{ marginTop: 8 }}>{err}</p>}
          {flash && <p className="c-good text-sm" style={{ marginTop: 8 }}>{flash} ✓</p>}

          <div className="flex gap-2" style={{ marginTop: 14 }}>
            <button className="btn primary" disabled={busy || (tab === 'move' && (!toId || !fromId))} onClick={apply}>{applyLabel}</button>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => onOpenPart(partId)}>Open part page</button>
          </div>
        </div>
      </div>
    </div>
  )
}
