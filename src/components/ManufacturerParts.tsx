// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type ManufacturerPart, type Supplier, type PriceBreak } from '../lib/api'
import { useAuth } from '../auth/AuthContext'

// ManufacturerParts renders and edits a part's commercial tree: MPNs (brand +
// datasheet) → supplier SKUs → price breaks.
export function ManufacturerParts({
  partID,
  items,
  onChanged,
}: {
  partID: string
  items: ManufacturerPart[]
  onChanged: () => void
}) {
  const { canWrite } = useAuth()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [addMpn, setAddMpn] = useState(false)
  const [extended, setExtended] = useState(false) // show unit price vs. quantity × unit
  const [qty, setQty] = useState('') // when set, show each seller's price at this quantity
  const qtyNum = Math.max(0, parseFloat(qty) || 0)
  const [mfg, setMfg] = useState('')
  const [mpn, setMpn] = useState('')
  const [datasheet, setDatasheet] = useState('')

  useEffect(() => {
    api.listSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
  }, [])

  const createMpn = async () => {
    if (!mpn.trim()) return
    await api.createManufacturerPart(partID, {
      manufacturer: mfg.trim(),
      mpn: mpn.trim(),
      datasheet_url: datasheet.trim() || null,
    })
    setMfg('')
    setMpn('')
    setDatasheet('')
    setAddMpn(false)
    onChanged()
  }

  return (
    <section className="card">
      <div className="card-h">
        <h2>Suppliers &amp; pricing</h2>
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
          <input
            className="input" type="number" min={0} placeholder="qty" value={qty}
            onChange={(e) => setQty(e.target.value)}
            title="Show each seller's price at this quantity"
            style={{ width: 80 }}
          />
          <div className="seg">
            <button className={`seg-btn ${!extended ? 'on' : ''}`} onClick={() => setExtended(false)} title="Price per unit">Unit</button>
            <button className={`seg-btn ${extended ? 'on' : ''}`} onClick={() => setExtended(true)} title={qtyNum > 0 ? 'Total for the quantity' : 'Price × break quantity'}>{qtyNum > 0 ? 'Total' : 'Extended'}</button>
          </div>
          {canWrite && <button onClick={() => setAddMpn((v) => !v)} className="link" style={{ fontSize: 12 }}>+ add MPN</button>}
        </div>
      </div>

      <div className="p-4">
        {addMpn && (
          <div className="bd bg-panel2 mb-3" style={{ borderRadius: 11, padding: 12 }}>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Manufacturer (e.g. Yageo)" value={mfg} onChange={(e) => setMfg(e.target.value)} />
              <input className="input" placeholder="MPN (e.g. RC0603FR-071KL)" value={mpn} onChange={(e) => setMpn(e.target.value)} />
            </div>
            <input className="input mt-2" placeholder="Datasheet URL (optional)" value={datasheet} onChange={(e) => setDatasheet(e.target.value)} />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setAddMpn(false)} className="btn sm ghost">Cancel</button>
              <button onClick={createMpn} className="btn sm primary">Add MPN</button>
            </div>
          </div>
        )}

        {items.length === 0 && !addMpn && (
          <div className="empty">No manufacturer parts yet. Add an MPN, or scan a distributor bag (coming soon).</div>
        )}

        <div className="space-y-3">
          {items.map((mp) => (
            <MpnCard key={mp.id} mp={mp} suppliers={suppliers} onChanged={onChanged} extended={extended} qty={qtyNum} canWrite={canWrite} />
          ))}
        </div>
      </div>
    </section>
  )
}

// priceAt returns the price break that applies to a quantity (the highest break ≤
// qty, or the smallest break if qty is below the first).
function priceAt(breaks: PriceBreak[], q: number): PriceBreak | null {
  if (breaks.length === 0) return null
  const at = breaks.filter((b) => b.quantity <= q).sort((a, b) => b.quantity - a.quantity)[0]
  return at ?? [...breaks].sort((a, b) => a.quantity - b.quantity)[0]
}

function MpnCard({ mp, suppliers, onChanged, extended, qty, canWrite }: { mp: ManufacturerPart; suppliers: Supplier[]; onChanged: () => void; extended: boolean; qty: number; canWrite: boolean }) {
  const [addSku, setAddSku] = useState(false)
  const [editing, setEditing] = useState(false)
  const [mfg, setMfg] = useState(mp.manufacturer_name ?? '')
  const [mpnV, setMpnV] = useState(mp.mpn)
  const [ds, setDs] = useState(mp.datasheet_url ?? '')

  const saveEdit = async () => {
    if (!mpnV.trim()) return
    await api.updateManufacturerPart(mp.id, { manufacturer: mfg.trim(), mpn: mpnV.trim(), datasheet_url: ds.trim() || null })
    setEditing(false)
    onChanged()
  }

  return (
    <div className="bd" style={{ borderRadius: 11, overflow: 'hidden' }}>
      {editing ? (
        <div className="bd-b bg-panel2 px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Manufacturer" value={mfg} onChange={(e) => setMfg(e.target.value)} />
            <input className="input mono" placeholder="MPN" value={mpnV} onChange={(e) => setMpnV(e.target.value)} />
          </div>
          <input className="input mt-2" placeholder="Datasheet URL" value={ds} onChange={(e) => setDs(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit() }} />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setEditing(false)} className="btn sm ghost">Cancel</button>
            <button onClick={saveEdit} className="btn sm primary">Save</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between bd-b bg-panel2 px-4 py-2.5">
          <div className="min-w-0">
            <span className="mono c-text" style={{ fontSize: 13, fontWeight: 600 }}>{mp.mpn}</span>
            <span className="c-dim" style={{ marginLeft: 8, fontSize: 12 }}>{mp.manufacturer_name || 'Generic'}</span>
            {mp.datasheet_url ? (
              <a href={mp.datasheet_url} target="_blank" rel="noreferrer" className="link" style={{ marginLeft: 8, fontSize: 12 }}>datasheet ↗</a>
            ) : canWrite ? (
              <button onClick={() => setEditing(true)} className="link" style={{ marginLeft: 8, fontSize: 12 }}>+ datasheet</button>
            ) : null}
          </div>
          {canWrite && (
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(true)} className="link" style={{ fontSize: 12 }}>edit</button>
              <button onClick={() => setAddSku((v) => !v)} className="link" style={{ fontSize: 12 }}>+ SKU</button>
              <button
                onClick={async () => {
                  if (confirm(`Remove MPN ${mp.mpn}?`)) {
                    await api.deleteManufacturerPart(mp.id)
                    onChanged()
                  }
                }}
                className="c-faint"
                style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Remove MPN"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        {mp.supplier_parts.length === 0 && !addSku && (
          <p className="c-faint px-4 py-3" style={{ fontSize: 12 }}>No supplier SKUs.</p>
        )}
        {mp.supplier_parts.map((sp) => (
          <div key={sp.id} className="flex items-start justify-between bd-b px-4 py-2.5">
            <div className="min-w-0">
              <div style={{ fontSize: 13 }}>
                <span className="c-text" style={{ fontWeight: 600 }}>{sp.supplier_name}</span>
                {sp.url ? (
                  <a href={sp.url} target="_blank" rel="noreferrer" className="mono link" style={{ marginLeft: 8, fontSize: 12 }}>{sp.sku} ↗</a>
                ) : (
                  <span className="mono c-dim" style={{ marginLeft: 8, fontSize: 12 }}>{sp.sku}</span>
                )}
                {sp.packaging && (
                  <span className="c-faint" style={{ marginLeft: 6, fontSize: 12 }}>
                    ({sp.packaging.replace(/\s*\([^)]*\)\s*$/, '') || sp.packaging})
                  </span>
                )}
              </div>
              {sp.pricing.length > 0 && (
                <div className="mono c-faint mt-1 flex flex-wrap" style={{ gap: '2px 12px', fontSize: 12 }}>
                  {qty > 0 ? (() => {
                    const b = priceAt(sp.pricing, qty)
                    if (!b) return null
                    return <span>@{qty}: <span className="c-dim">{formatPrice(extended ? b.price * qty : b.price, b.currency, extended)}</span></span>
                  })() : sp.pricing.map((b) => (
                    <span key={b.id ?? b.quantity}>
                      {b.quantity}: <span className="c-dim">{formatPrice(extended ? b.price * b.quantity : b.price, b.currency, extended)}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
            {canWrite && (
              <button
                onClick={async () => {
                  await api.deleteSupplierPart(sp.id)
                  onChanged()
                }}
                className="c-faint"
                style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer' }}
                aria-label="Remove SKU"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {addSku && (
          <AddSku mfgPartID={mp.id} suppliers={suppliers} onDone={() => { setAddSku(false); onChanged() }} />
        )}
      </div>
    </div>
  )
}

function AddSku({ mfgPartID, suppliers, onDone }: { mfgPartID: string; suppliers: Supplier[]; onDone: () => void }) {
  const [supplierID, setSupplierID] = useState(suppliers[0]?.id ?? '')
  const [sku, setSku] = useState('')
  const [packaging, setPackaging] = useState('')
  const [url, setUrl] = useState('')
  const [breaks, setBreaks] = useState<PriceBreak[]>([{ quantity: 1, price: 0, currency: 'USD' }])

  const setBreak = (i: number, patch: Partial<PriceBreak>) =>
    setBreaks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    if (!supplierID || !sku.trim()) return
    await api.createSupplierPart(mfgPartID, {
      supplier_id: supplierID,
      sku: sku.trim(),
      packaging: packaging.trim() || null,
      url: url.trim() || null,
      pricing: breaks.filter((b) => b.quantity > 0),
    })
    onDone()
  }

  return (
    <div className="bg-panel2 px-4 py-3">
      <div className="grid grid-cols-3 gap-2">
        <select className="input" value={supplierID} onChange={(e) => setSupplierID(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input className="input" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <input className="input" placeholder="Packaging" value={packaging} onChange={(e) => setPackaging(e.target.value)} />
      </div>
      <input className="input mt-2" placeholder="Vendor product URL (optional)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="eyebrow">Price breaks</span>
          <button onClick={() => setBreaks((b) => [...b, { quantity: 0, price: 0, currency: 'USD' }])} className="link" style={{ fontSize: 12 }}>
            + break
          </button>
        </div>
        {breaks.map((b, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <input type="number" className="input" style={{ width: 96 }} placeholder="Qty" value={b.quantity || ''} onChange={(e) => setBreak(i, { quantity: parseFloat(e.target.value) || 0 })} />
            <input type="number" step="0.0001" className="input" style={{ width: 112 }} placeholder="Unit price" value={b.price || ''} onChange={(e) => setBreak(i, { price: parseFloat(e.target.value) || 0 })} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onDone} className="btn sm ghost">Cancel</button>
        <button onClick={save} className="btn sm primary">Add SKU</button>
      </div>
    </div>
  )
}

// fixed2 = true for line totals (always 2 decimals, e.g. 0.40); unit prices stay
// full-precision (e.g. 0.00531).
function formatPrice(price: number, currency: string, fixed2 = false) {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  const n = fixed2 ? price.toFixed(2) : String(price)
  return sym ? `${sym}${n}` : `${n} ${currency}`
}
