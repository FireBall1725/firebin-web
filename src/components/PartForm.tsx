// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { KicadPicker } from './KicadPicker'
import {
  api,
  type Category,
  type EnrichedPart,
  type ParameterInput,
  type PriceBreak,
  type StorageLocation,
} from '../lib/api'
import { SymbolPicker, PartGraphic } from './SymbolPicker'
import { catStyle, symbolSrc, CATEGORY_SUGGESTIONS } from '../lib/symbols'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

// A distributor SKU isn't an MPN, so a direct lookup misses. Strip Digi-Key's
// "-ND" and a trailing cut-tape/reel code so "RMCF0603JT100RCT-ND" → the real
// MPN "RMCF0603JT100R" as a second attempt.
function cleanDistributorSKU(q: string): string {
  return q.replace(/-ND$/i, '').replace(/(CT|TR|DKR)$/i, '')
}

// A supplier SKU captured from a scan/enrichment, imported silently on create.
export interface DraftSupplier {
  supplier: string
  sku: string
  url?: string
  packaging?: string
  pricing: PriceBreak[]
}

// PartDraft pre-fills the form. A blank draft is a plain manual add; a scan
// fills the same shape so the create screen is identical either way.
export interface PartDraft {
  name?: string
  category?: string
  package?: string
  kicad_symbol?: string
  kicad_footprint?: string
  ipn?: string
  description?: string
  image_path?: string
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
  submitLabel,
  editId,
  onCancel,
  onCreated,
}: {
  categories: Category[]
  initial?: PartDraft
  header?: ReactNode
  note?: string | null
  submitLabel?: string
  // When set, the form edits that part (PATCH) instead of creating one, and the
  // commercial/stock creation sections are hidden (those are managed elsewhere).
  editId?: string
  onCancel: () => void
  onCreated: (id: string) => void
}) {
  const editing = !!editId
  const saveLabel = submitLabel ?? (editing ? 'Save changes' : 'Create')
  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [pkg, setPkg] = useState(initial?.package ?? '')
  const [kicadSymbol, setKicadSymbol] = useState(initial?.kicad_symbol ?? '')
  const [kicadFootprint, setKicadFootprint] = useState(initial?.kicad_footprint ?? '')
  const [picking, setPicking] = useState<'symbol' | 'footprint' | null>(null)
  const [ipn, setIpn] = useState(initial?.ipn ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [minimum, setMinimum] = useState(String(initial?.minimum_stock ?? 0))
  const [params, setParams] = useState<ParameterInput[]>(initial?.parameters ?? [])
  const [imagePath, setImagePath] = useState<string | null>(initial?.image_path ?? null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '')
  const [mpn, setMpn] = useState(initial?.mpn ?? '')
  const [datasheet, setDatasheet] = useState(initial?.datasheet_url ?? '')
  const [qty, setQty] = useState(initial?.quantity ?? '')
  const [locationID, setLocationID] = useState(initial?.location_id ?? '')
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [paramNames, setParamNames] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [suppliers, setSuppliers] = useState<DraftSupplier[]>(initial?.suppliers ?? [])

  // Manual "look up a part" (blank add only): enrich by MPN and prefill.
  const [lookup, setLookup] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupMsg, setLookupMsg] = useState<string | null>(null)
  const showLookup = !editing && !initial?.mpn
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

  // Local object-URL preview for a not-yet-uploaded image file.
  const [filePreview, setFilePreview] = useState<string | null>(null)
  useEffect(() => {
    if (!imageFile) { setFilePreview(null); return }
    const url = URL.createObjectURL(imageFile)
    setFilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [imageFile])

  const clearGraphic = () => { setImagePath(null); setImageFile(null) }

  const applyEnriched = (e: EnrichedPart) => {
    if (e.name) setName(e.name)
    if (e.category) setCategory(e.category)
    if (e.package) setPkg(e.package)
    if (e.description) setDescription(e.description)
    if (e.parameters?.length) setParams(e.parameters.map((p) => ({ name: p.name, value: p.value, units: p.units })))
    if (e.manufacturer) setManufacturer(e.manufacturer)
    if (e.mpn) setMpn(e.mpn)
    if (e.datasheet_url) setDatasheet(e.datasheet_url)
    if (e.suppliers?.length) setSuppliers(e.suppliers.map((s) => ({ supplier: s.name, sku: s.sku, url: s.url, packaging: s.packaging, pricing: s.prices })))
  }

  const doLookup = async () => {
    const q = lookup.trim()
    if (!q) return
    setLookupBusy(true)
    setLookupMsg(null)
    try {
      let r = await api.enrich(q)
      const cleaned = cleanDistributorSKU(q)
      if ((!r.found || !r.part) && cleaned !== q) r = await api.enrich(cleaned)
      if (r.found && r.part) {
        applyEnriched(r.part)
        setLookupMsg(`Filled from ${r.part.source || 'lookup'}. Review and save.`)
      } else {
        setLookupMsg('No match — enter the details manually below.')
      }
    } catch {
      setLookupMsg('Lookup failed. Check enrichment is configured in Settings.')
    } finally {
      setLookupBusy(false)
    }
  }

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

      // Edit: patch the part's core fields + parameters. Manufacturer parts,
      // suppliers, and stock are managed on the detail page, not here.
      if (editId) {
        await api.updatePart(editId, {
          name: name.trim(),
          category_id: categoryID,
          variant_of: initial?.variant_of ?? null,
          ipn: ipn.trim() || null,
          package: pkg || null,
          kicad_symbol: kicadSymbol.trim() || null,
          kicad_footprint: kicadFootprint.trim() || null,
          description: description || null,
          image_path: imagePath,
          is_template: false,
          minimum_stock: parseFloat(minimum) || 0,
          parameters: params.filter((p) => p.name.trim() && p.value.trim()),
        })
        if (imageFile) await api.uploadPartImage(editId, imageFile)
        onCreated(editId)
        return
      }

      const part = await api.createPart({
        name: name.trim(),
        category_id: categoryID,
        variant_of: initial?.variant_of ?? null,
        ipn: ipn.trim() || null,
        package: pkg || null,
        kicad_symbol: kicadSymbol.trim() || null,
        kicad_footprint: kicadFootprint.trim() || null,
        description: description || null,
        image_path: imageFile ? null : imagePath,
        is_template: false,
        minimum_stock: parseFloat(minimum) || 0,
        parameters: params.filter((p) => p.name.trim() && p.value.trim()),
      })

      if (imageFile) await api.uploadPartImage(part.id, imageFile)

      // A template groups variants; it holds no MPN or stock of its own.
      if (mpn.trim()) {
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
            .createSupplierPart(mp.id, { supplier: s.supplier, sku: s.sku, url: s.url ?? null, packaging: s.packaging ?? null, pricing: s.pricing })
            .catch(() => undefined)
        }
      }

      const q = parseFloat(qty)
      if (!isNaN(q) && q > 0) {
        await api.adjustStock(part.id, {
          kind: 'add',
          quantity: q,
          location_id: locationID || null,
          note: note ?? null,
        })
      }
      onCreated(part.id)
    } catch {
      setError(editing ? 'Could not save changes' : 'Could not create part')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="modal-b space-y-4">
        {header}

        {showLookup && (
          <div style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 11, padding: 12 }}>
            <span className="eyebrow">Look up a part</span>
            <div className="flex gap-2" style={{ marginTop: 6 }}>
              <input
                className="input mono"
                value={lookup}
                placeholder="MPN or distributor part no."
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doLookup() } }}
              />
              <button type="button" className="btn primary" disabled={lookupBusy || !lookup.trim()} onClick={doLookup}>
                {lookupBusy ? '…' : 'Look up'}
              </button>
            </div>
            {lookupMsg && <p className="c-dim" style={{ fontSize: 12, marginTop: 8 }}>{lookupMsg}</p>}
            <p className="c-faint" style={{ fontSize: 11.5, marginTop: 6 }}>
              Fills name, parameters, datasheet, and pricing from the MPN — or just fill the form in yourself.
            </p>
          </div>
        )}

        <L label="Name">
          <input
            className="input"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 4.7µF Capacitor 1206"
          />
        </L>

        <div>
          <span className="eyebrow">Symbol</span>
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            <div className="sym-preview">
              {filePreview ? (
                <img src={filePreview} alt="" />
              ) : imagePath ? (
                <PartGraphic src={imagePath} color={catStyle(category, name).color} size={36} />
              ) : (
                // No explicit symbol: show the category default so the box isn't blank.
                <PartGraphic src={symbolSrc(catStyle(category, name).key)} color={catStyle(category, name).color} size={36} />
              )}
            </div>
            <button type="button" className="btn sm" onClick={() => setPickerOpen(true)}>
              {imagePath || imageFile ? 'Change' : 'Choose symbol / image'}
            </button>
            {(imagePath || imageFile) && (
              <button type="button" className="btn sm" onClick={clearGraphic}>Remove</button>
            )}
          </div>
        </div>

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
              {(() => {
                // The user's real categories first, then the curated starter list
                // for any name they don't already have (case-insensitive dedup).
                const have = new Set(categories.map((c) => c.name.toLowerCase()))
                const extra = CATEGORY_SUGGESTIONS.filter((s) => !have.has(s.toLowerCase()))
                return (
                  <>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                    {extra.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </>
                )
              })()}
            </datalist>
          </L>
          <L label="Package / footprint">
            <input className="input" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="0603" />
          </L>
        </div>

        {/* KiCad library IDs. These are what the HTTP library serves to KiCad so
            the part can be placed from the Symbol Chooser; both must name a
            library already installed on the machine running KiCad. Leaving them
            blank is fine — the part still shows up, flagged as unmapped.

            The field stays editable for pasting, but the Browse button is the
            path that works: these identifiers are long, exact, and impossible to
            recall, and a typo degrades silently to a placeholder in KiCad. */}
        <div className="grid grid-cols-2 gap-4">
          <L label="KiCad symbol (library ID)">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                style={{ flex: 1, minWidth: 0 }}
                value={kicadSymbol}
                onChange={(e) => setKicadSymbol(e.target.value)}
                placeholder="Device:R"
              />
              <button type="button" className="btn" onClick={() => setPicking('symbol')}>Browse…</button>
            </div>
          </L>
          <L label="KiCad footprint (library ID)">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input mono"
                style={{ flex: 1, minWidth: 0 }}
                value={kicadFootprint}
                onChange={(e) => setKicadFootprint(e.target.value)}
                placeholder="Resistor_SMD:R_0603_1608Metric"
              />
              <button type="button" className="btn" onClick={() => setPicking('footprint')}>Browse…</button>
            </div>
          </L>
        </div>

        {picking && (
          <KicadPicker
            kind={picking}
            initial={picking === 'symbol' ? kicadSymbol : kicadFootprint}
            onClose={() => setPicking(null)}
            onPick={(libID) => {
              if (picking === 'symbol') setKicadSymbol(libID)
              else setKicadFootprint(libID)
              setPicking(null)
            }}
          />
        )}

        <L label="FireBin PN (your internal part number, used first when matching a BOM)">
          <input
            className="input mono"
            value={ipn}
            onChange={(e) => setIpn(e.target.value)}
            placeholder="e.g. FB-R-0603-1K"
          />
        </L>

        <L label="Description">
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </L>

        {!editing && (
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

        {!editing && (
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

        {!editing && suppliers.length > 0 && (
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
          {busy ? '…' : saveLabel}
        </button>
      </div>

      {pickerOpen && (
        <SymbolPicker
          onPick={(src) => { setImagePath(src); setImageFile(null) }}
          onUpload={(file) => { setImageFile(file); setImagePath(null) }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </form>
  )
}

// PartFormModal wraps PartForm in modal chrome for the standalone "Add item"
// entry point. The scan flow renders PartForm directly inside its own modal.
export function PartFormModal({
  categories,
  initial,
  title = 'Add item',
  editId,
  onClose,
  onCreated,
}: {
  categories: Category[]
  initial?: PartDraft
  title?: string
  editId?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  return (
    <div className="overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{title}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>
        <PartForm categories={categories} initial={initial} editId={editId} onCancel={onClose} onCreated={onCreated} />
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
