// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState, type FormEvent } from 'react'
import { api, type Category, type ParameterInput } from '../lib/api'

// NewPartModal creates a part. It can be a template (a grouping like
// "1k resistor") or a concrete/standalone part with a package and parameters.
export function NewPartModal({
  categories,
  variantOf,
  onClose,
  onCreated,
}: {
  categories: Category[]
  variantOf?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [categoryID, setCategoryID] = useState('')
  const [pkg, setPkg] = useState('')
  const [minimum, setMinimum] = useState('0')
  const [isTemplate, setIsTemplate] = useState(false)
  const [params, setParams] = useState<ParameterInput[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      const created = await api.createPart({
        name: name.trim(),
        category_id: categoryID || null,
        variant_of: variantOf ?? null,
        package: pkg || null,
        minimum_stock: parseFloat(minimum) || 0,
        is_template: isTemplate,
        parameters: params.filter((p) => p.name.trim() && p.value.trim()),
      })
      onCreated(created.id)
    } catch {
      setError('Could not create part')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{variantOf ? 'New variant' : 'New part'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-b space-y-4">
            <L label="Name">
              <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. 1kΩ 0603 1%" />
            </L>

            <div className="grid grid-cols-2 gap-4">
              <L label="Category">
                <select className="input" value={categoryID} onChange={(e) => setCategoryID(e.target.value)}>
                  <option value="">None</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Package / footprint">
                <input className="input" value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="0603" />
              </L>
            </div>

            {!variantOf && (
              <label className="flex items-center gap-2 text-sm c-dim">
                <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
                This is a template (a grouping that holds variants, e.g. “1k resistor”)
              </label>
            )}

            <L label="Minimum stock (low-stock alert threshold)">
              <input type="number" className="input" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
            </L>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="eyebrow">Parameters</span>
                <button type="button" onClick={addParam} className="link" style={{ fontSize: 12 }}>
                  + add parameter
                </button>
              </div>
              {params.length === 0 && (
                <p className="c-faint" style={{ fontSize: 12 }}>Any attribute you want — resistance, tolerance, voltage, etc.</p>
              )}
              <div className="space-y-2">
                {params.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <input className="input" placeholder="Name" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} />
                    <input className="input" placeholder="Value" value={p.value} onChange={(e) => setParam(i, { value: e.target.value })} />
                    <input className="input" style={{ width: 80 }} placeholder="Unit" value={p.units ?? ''} onChange={(e) => setParam(i, { units: e.target.value })} />
                    <button type="button" onClick={() => removeParam(i)} className="c-faint" style={{ padding: '0 4px', background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Remove">
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="c-crit text-sm">{error}</p>}
          </div>

          <div className="modal-f">
            <button type="button" onClick={onClose} className="btn">Cancel</button>
            <button type="submit" disabled={busy} className="btn primary">
              {busy ? '…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="fieldlabel">
      <span>{label}</span>
      {children}
    </label>
  )
}
