// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { api, type Datasheet, type ManufacturerPart, type Supplier, type PriceBreak } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { DatasheetViewer } from './DatasheetViewer'
import { icon } from '../lib/icons'
import { mdiDownload, mdiFilePdfBox, mdiUpload } from '@mdi/js'

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

  // Stored datasheets for this part, so each MPN row knows whether a local copy
  // exists. Fetched once for the part rather than per MPN: a family PDF is
  // linked to the part, and several MPNs commonly share it.
  const [sheets, setSheets] = useState<Datasheet[]>([])
  const [viewing, setViewing] = useState<Datasheet | null>(null)

  const loadSheets = () => {
    api
      .listDatasheets({ part: partID })
      .then(setSheets)
      .catch(() => setSheets([]))
  }

  useEffect(() => {
    api.listSuppliers().then(setSuppliers).catch(() => setSuppliers([]))
  }, [])

  useEffect(loadSheets, [partID])

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
            <MpnCard
              key={mp.id}
              mp={mp}
              suppliers={suppliers}
              onChanged={onChanged}
              extended={extended}
              qty={qtyNum}
              canWrite={canWrite}
              sheet={sheetFor(sheets, mp)}
              onView={setViewing}
              onSheetsChanged={loadSheets}
            />
          ))}
        </div>
      </div>

      {viewing && <DatasheetViewer datasheet={viewing} onClose={() => setViewing(null)} />}
    </section>
  )
}

// sheetFor picks the stored datasheet to offer on an MPN row.
//
// Prefers one linked to this exact MPN, then falls back to any datasheet on the
// part. The fallback is the common case, not a compromise: one PDF covers a
// whole family, so every MPN of the ESP32-C6 series should offer the series
// datasheet rather than only the one row that happened to trigger the download.
function sheetFor(sheets: Datasheet[], mp: ManufacturerPart): Datasheet | undefined {
  return (
    sheets.find((d) => d.parts.some((p) => p.manufacturer_part_id === mp.id)) ??
    sheets[0]
  )
}

// priceAt returns the price break that applies to a quantity (the highest break ≤
// qty, or the smallest break if qty is below the first).
function priceAt(breaks: PriceBreak[], q: number): PriceBreak | null {
  if (breaks.length === 0) return null
  const at = breaks.filter((b) => b.quantity <= q).sort((a, b) => b.quantity - a.quantity)[0]
  return at ?? [...breaks].sort((a, b) => a.quantity - b.quantity)[0]
}

// DatasheetControl is the three-state button beside an MPN's datasheet link.
//
// Which of the three appears IS the feature:
//   a stored copy      → Read here    (opens the in-app viewer)
//   only a vendor URL  → Save a copy  (mirrors it, then polls the task)
//   neither            → Upload a PDF
//
// "Read here" stays available to viewers; the two that write do not.
function DatasheetControl({
  mp,
  sheet,
  canWrite,
  onView,
  onChanged,
}: {
  mp: ManufacturerPart
  sheet: Datasheet | undefined
  canWrite: boolean
  onView: (d: Datasheet) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  if (sheet) {
    return (
      <button className="ds-btn on" onClick={() => onView(sheet)} title={`${sheet.filename} — read it here`}>
        {icon(mdiFilePdfBox, { size: 14 })}
        Read here
      </button>
    )
  }
  if (!canWrite) return null

  // Mirroring is a background job: enqueue, then poll until the task finishes.
  // Same shape as the bulk refresh on the parts page.
  const save = async () => {
    setBusy('Saving…')
    try {
      const { task_id } = await api.mirrorDatasheet(mp.id)
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 600))
        const t = await api.getTask(task_id)
        if (t.status === 'completed') {
          setBusy('')
          onChanged()
          return
        }
        if (t.status === 'failed' || t.status === 'cancelled') {
          setBusy('Could not save it')
          return
        }
      }
      setBusy('Still running — check Activity')
    } catch {
      setBusy('Could not save it')
    }
  }

  const upload = async (f: File) => {
    setBusy('Uploading…')
    try {
      await api.uploadDatasheet(f, { partID: mp.part_id, manufacturerPartID: mp.id })
      setBusy('')
      onChanged()
    } catch (e) {
      setBusy(e instanceof Error ? e.message : 'Upload failed')
    }
  }

  return (
    <>
      {mp.datasheet_url ? (
        <button className="ds-btn" onClick={save} disabled={!!busy} title="Download a copy so it survives the link going dead">
          {icon(mdiDownload, { size: 14 })}
          {busy || 'Save a copy'}
        </button>
      ) : (
        <button className="ds-btn" onClick={() => fileRef.current?.click()} disabled={!!busy} title="Upload a PDF for this MPN">
          {icon(mdiUpload, { size: 14 })}
          {busy || 'Upload a PDF'}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = '' // let the same file be picked again after a failure
          if (f) void upload(f)
        }}
      />
    </>
  )
}

function MpnCard({ mp, suppliers, onChanged, extended, qty, canWrite, sheet, onView, onSheetsChanged }: { mp: ManufacturerPart; suppliers: Supplier[]; onChanged: () => void; extended: boolean; qty: number; canWrite: boolean; sheet: Datasheet | undefined; onView: (d: Datasheet) => void; onSheetsChanged: () => void }) {
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
            ) : canWrite && !sheet ? (
              <button onClick={() => setEditing(true)} className="link" style={{ marginLeft: 8, fontSize: 12 }}>+ datasheet</button>
            ) : null}
            <DatasheetControl
              mp={mp}
              sheet={sheet}
              canWrite={canWrite}
              onView={onView}
              onChanged={onSheetsChanged}
            />
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
