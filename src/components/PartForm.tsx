// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import {
  api,
  type Category,
  type ParameterInput,
  type PriceBreak,
  type StorageLocation,
} from '../lib/api'

// A supplier SKU captured from a scan/enrichment, imported silently on create.
export interface DraftSupplier {
  supplier: string
  sku: string
  pricing: PriceBreak[]
}

// PartDraft pre-fills the form. A blank draft is a plain manual add; a scan
// fills the same shape so the create screen is identical either way.
export interface PartDraft {
  name?: string
  category?: string
  package?: string
  ipn?: string
  description?: string
  variant_of?: string
  is_template?: boolean
  minimum_stock?: number
  parameters?: ParameterInput[]
  // Commercial: an MPN turns into a manufacturer part (+ supplier SKUs) on save.
  mpn?: string
  manufacturer?: string
  datasheet_url?: string
  // Initial stock to book in.
  quantity?: string
  location_id?: string
  suppliers?: DraftSupplier[]
}

// PartForm is the one create-a-part surface used by both the "Add item" menu and
// the scan-to-add flow. Scanning just hands it a filled-in draft. It owns the
// whole create sequence: part → manufacturer part → supplier SKUs → initial
// stock, so the two entry points stay in lockstep.
export function PartForm({
  categories,
  initial,
  header,
  note,
  submitLabel = 'Create',
  onCancel,
  onCreated,
}: {
  categories: Category[]
  initial?: PartDraft
  header?: ReactNode
  note?: string | null
  submitLabel?: string
  onCancel: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [pkg, setPkg] = useState(initial?.package ?? '')
  const [ipn, setIpn] = useState(initial?.ipn ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [isTemplate, setIsTemplate] = useState(initial?.is_template ?? false)
  const [minimum, setMinimum] = useState(String(initial?.minimum_stock ?? 0))
  const [params, setParams] = useState<ParameterInput[]>(initial?.parameters ?? [])
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '')
  const [mpn, setMpn] = useState(initial?.mpn ?? '')
  const [datasheet, setDatasheet] = useState(initial?.datasheet_url ?? '')
  const [qty, setQty] = useState(initial?.quantity ?? '')
  const [locationID, setLocationID] = useState(initial?.location_id ?? '')
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [paramNames, setParamNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const suppliers = initial?.suppliers ?? []
  // Unique datalist ids so multiple mounts don't collide.
  const uid = useId()
  const catListID = `cat-${uid}`
  const paramListID = `param-${uid}`

  useEffect(() => {
    api.listLocations().then(setLocations).catch(() => setLocations([]))
    // Known parameter names power the add-parameter typeahead so users reuse
    // "Voltage Rating" instead of coining a misspelled variant.
    api
      .listParameterTemplates()
      .then((t) => setParamNames(t.map((x) => x.name)))
      .catch(() => setParamNames([]))
  }, [])

  const addParam = () => setParams((p) => [...p, { name: '', value: '', units: '' }])
  const setParam = (i: number, patch: Partial<ParameterInput>) =>
    setParams((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const removeParam = (i: number) => setParams((p) => p.filter((_, j) => j !== i))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    try {
      // Resolve the typed category to an id, creating it if it's new. Matching
      // an existing name (case-insensitive) avoids duplicate categories.
      let categoryID: string | null = null
      const catName = category.trim()
      if (catName) {
        const existing = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase())
        categoryID = existing ? existing.id : (await api.createCategory(catName)).id
      }

      const part = await api.createPart({
        name: name.trim(),
        category_id: categoryID,
        variant_of: initial?.variant_of ?? null,
        ipn: ipn.trim() || null,
        package: pkg || null,
        description: description || null,
        is_template: isTemplate,
        minimum_stock: parseFloat(minimum) || 0,
        parameters: params.filter((p) => p.name.trim() && p.value.trim()),
      })

      // A template groups variants; it holds no MPN or stock of its own.
      if (!isTemplate && mpn.trim()) {
        const mp = await api.createManufacturerPart(part.id, {
          manufacturer: manufacturer.trim(),
          mpn: mpn.trim(),
          datasheet_url: datasheet.trim() || null,
        })
        const seen = new Set<string>()
        for (const s of suppliers) {
          const key = `${s.supplier.toLowerCase()}|${s.sku.toLowerCase()}`
          if (!s.sku || seen.has(key)) continue
          seen.add(key)
          await api
            .createSupplierPart(mp.id, { supplier: s.supplier, sku: s.sku, pricing: s.pricing })
            .catch(() => undefined)
        }
      }

      const q = parseFloat(qty)
      if (!isTemplate && !isNaN(q) && q > 0) {
        await api.adjustStock(part.id, {
          kind: 'add',
          quantity: q,
          location_id: locationID || null,
          note: note ?? null,
        })
      }
      onCreated(part.id)
    } catch {
      setError('Could not create part')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="modal-b space-y-4">
        {header}

        <L label="Name">
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 4.7µF Capacitor 1206"
          />
        </L>

        <div className="grid grid-cols-2 gap-4">
          <L label="Category">
            <input
              className="input"
              list={catListID}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Type or pick…"
            />
            <datalist id={catListID}>
              {categories.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </L>
          <L label="Package / footprint">
            <input className="input" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="0603" />
          </L>
        </div>

        {!isTemplate && (
          <L label="FireBin PN (your internal part number, used first when matching a BOM)">
            <input
              className="input mono"
              value={ipn}
              onChange={(e) => setIpn(e.target.value)}
              placeholder="e.g. FB-R-0603-1K"
            />
          </L>
        )}

        <L label="Description">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </L>

        {!initial?.variant_of && (
          <label className="flex items-center gap-2 text-sm c-dim">
            <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
            This is a template (a grouping that holds variants, e.g. “1k resistor”)
          </label>
        )}

        {!isTemplate && (
          <>
            {/* Commercial: MPN creates a manufacturer part; a scan fills these. */}
            <div className="grid grid-cols-2 gap-4">
              <L label="Manufacturer">
                <input
                  className="input"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g. Samsung"
                />
              </L>
              <L label="MPN">
                <input
                  className="input mono"
                  value={mpn}
                  onChange={(e) => setMpn(e.target.value)}
                  placeholder="Manufacturer part no."
                />
              </L>
            </div>
            {(datasheet || mpn) && (
              <L label="Datasheet URL">
                <input
                  className="input"
                  value={datasheet}
                  onChange={(e) => setDatasheet(e.target.value)}
                  placeholder="https://…"
                />
              </L>
            )}
          </>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="eyebrow">Parameters</span>
            <button type="button" onClick={addParam} className="link" style={{ fontSize: 12 }}>
              + add parameter
            </button>
          </div>
          {params.length === 0 && (
            <p className="c-faint" style={{ fontSize: 12 }}>
              Any attribute you want — resistance, tolerance, voltage, etc.
            </p>
          )}
          <div className="space-y-2">
            {params.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input className="input" list={paramListID} placeholder="Name" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} />
                <input className="input" placeholder="Value" value={p.value} onChange={(e) => setParam(i, { value: e.target.value })} />
                <input className="input" style={{ width: 80 }} placeholder="Unit" value={p.units ?? ''} onChange={(e) => setParam(i, { units: e.target.value })} />
                <button
                  type="button"
                  onClick={() => removeParam(i)}
                  className="c-faint"
                  style={{ padding: '0 4px', background: 'none', border: 'none', cursor: 'pointer' }}
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <datalist id={paramListID}>
            {paramNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>

        {!isTemplate && (
          <div>
            <span className="eyebrow">Initial stock</span>
            <div className="grid grid-cols-2 gap-4" style={{ marginTop: 6 }}>
              <L label="Quantity">
                <input type="number" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
              </L>
              <L label="Location">
                <select className="input" value={locationID} onChange={(e) => setLocationID(e.target.value)}>
                  <option value="">No location</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </L>
            </div>
          </div>
        )}

        <L label="Minimum stock (low-stock alert threshold)">
          <input type="number" className="input" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
        </L>

        {!isTemplate && suppliers.length > 0 && (
          <p className="c-faint" style={{ fontSize: 12 }}>
            {suppliers.length} supplier {suppliers.length === 1 ? 'SKU' : 'SKUs'} will be imported:{' '}
            {suppliers.map((s) => s.supplier).join(', ')}.
          </p>
        )}

        {error && <p className="c-crit text-sm">{error}</p>}
      </div>

      <div className="modal-f">
        <button type="button" onClick={onCancel} className="btn">
          Cancel
        </button>
        <button type="submit" disabled={busy || !name.trim()} className="btn primary">
          {busy ? '…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// PartFormModal wraps PartForm in modal chrome for the standalone "Add item"
// entry point. The scan flow renders PartForm directly inside its own modal.
export function PartFormModal({
  categories,
  initial,
  title = 'Add item',
  onClose,
  onCreated,
}: {
  categories: Category[]
  initial?: PartDraft
  title?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <PartForm categories={categories} initial={initial} onCancel={onClose} onCreated={onCreated} />
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="fieldlabel">
      <span>{label}</span>
      {children}
    </label>
  )
}
