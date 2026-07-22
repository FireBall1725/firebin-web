// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type ManufacturerPart, type Supplier, type PriceBreak } from '../lib/api'

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [addMpn, setAddMpn] = useState(false)
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
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Manufacturer parts</h2>
        <button onClick={() => setAddMpn((v) => !v)} className="text-xs text-amber-600 hover:underline dark:text-amber-400">
          + add MPN
        </button>
      </div>

      {addMpn && (
        <div className="mb-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Manufacturer (e.g. Yageo)" value={mfg} onChange={(e) => setMfg(e.target.value)} />
            <input className={inputCls} placeholder="MPN (e.g. RC0603FR-071KL)" value={mpn} onChange={(e) => setMpn(e.target.value)} />
          </div>
          <input className={`${inputCls} mt-2`} placeholder="Datasheet URL (optional)" value={datasheet} onChange={(e) => setDatasheet(e.target.value)} />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setAddMpn(false)} className="rounded px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button onClick={createMpn} className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">
              Add MPN
            </button>
          </div>
        </div>
      )}

      {items.length === 0 && !addMpn && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400 dark:border-zinc-700">
          No manufacturer parts yet. Add an MPN, or scan a distributor bag (coming soon).
        </div>
      )}

      <div className="space-y-3">
        {items.map((mp) => (
          <MpnCard key={mp.id} mp={mp} suppliers={suppliers} onChanged={onChanged} />
        ))}
      </div>
    </section>
  )
}

function MpnCard({ mp, suppliers, onChanged }: { mp: ManufacturerPart; suppliers: Supplier[]; onChanged: () => void }) {
  const [addSku, setAddSku] = useState(false)

  return (
    <div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 dark:border-zinc-800">
        <div className="min-w-0">
          <span className="font-mono text-sm">{mp.mpn}</span>
          <span className="ml-2 text-xs text-zinc-500">{mp.manufacturer_name || 'Generic'}</span>
          {mp.datasheet_url && (
            <a href={mp.datasheet_url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-amber-600 hover:underline dark:text-amber-400">
              datasheet ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setAddSku((v) => !v)} className="text-xs text-amber-600 hover:underline dark:text-amber-400">
            + SKU
          </button>
          <button
            onClick={async () => {
              if (confirm(`Remove MPN ${mp.mpn}?`)) {
                await api.deleteManufacturerPart(mp.id)
                onChanged()
              }
            }}
            className="text-xs text-zinc-400 hover:text-red-500"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {mp.supplier_parts.length === 0 && !addSku && (
          <p className="px-4 py-3 text-xs text-zinc-400">No supplier SKUs.</p>
        )}
        {mp.supplier_parts.map((sp) => (
          <div key={sp.id} className="flex items-start justify-between px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm">
                <span className="font-medium">{sp.supplier_name}</span>
                <span className="ml-2 font-mono text-xs text-zinc-500">{sp.sku}</span>
                {sp.packaging && <span className="ml-2 text-xs text-zinc-400">{sp.packaging}</span>}
              </div>
              {sp.pricing.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-zinc-500">
                  {sp.pricing.map((b) => (
                    <span key={b.id ?? b.quantity}>
                      {b.quantity}: {formatPrice(b.price, b.currency)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={async () => {
                await api.deleteSupplierPart(sp.id)
                onChanged()
              }}
              className="text-xs text-zinc-400 hover:text-red-500"
            >
              ✕
            </button>
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
  const [breaks, setBreaks] = useState<PriceBreak[]>([{ quantity: 1, price: 0, currency: 'USD' }])

  const setBreak = (i: number, patch: Partial<PriceBreak>) =>
    setBreaks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const save = async () => {
    if (!supplierID || !sku.trim()) return
    await api.createSupplierPart(mfgPartID, {
      supplier_id: supplierID,
      sku: sku.trim(),
      packaging: packaging.trim() || null,
      pricing: breaks.filter((b) => b.quantity > 0),
    })
    onDone()
  }

  return (
    <div className="bg-zinc-50 px-4 py-3 dark:bg-zinc-800/40">
      <div className="grid grid-cols-3 gap-2">
        <select className={inputCls} value={supplierID} onChange={(e) => setSupplierID(e.target.value)}>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input className={inputCls} placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <input className={inputCls} placeholder="Packaging" value={packaging} onChange={(e) => setPackaging(e.target.value)} />
      </div>
      <div className="mt-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500">Price breaks</span>
          <button
            onClick={() => setBreaks((b) => [...b, { quantity: 0, price: 0, currency: 'USD' }])}
            className="text-xs text-amber-600 hover:underline dark:text-amber-400"
          >
            + break
          </button>
        </div>
        {breaks.map((b, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <input type="number" className={`${inputCls} w-24`} placeholder="Qty" value={b.quantity || ''} onChange={(e) => setBreak(i, { quantity: parseFloat(e.target.value) || 0 })} />
            <input type="number" step="0.0001" className={`${inputCls} w-28`} placeholder="Unit price" value={b.price || ''} onChange={(e) => setBreak(i, { price: parseFloat(e.target.value) || 0 })} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={onDone} className="rounded px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700">Cancel</button>
        <button onClick={save} className="rounded bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-600">Add SKU</button>
      </div>
    </div>
  )
}

function formatPrice(price: number, currency: string) {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : ''
  return sym ? `${sym}${price}` : `${price} ${currency}`
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800'
