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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">{variantOf ? 'New variant' : 'New part'}</h2>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <L label="Name">
            <input className={inputCls} value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. 1kΩ 0603 1%" />
          </L>

          <div className="grid grid-cols-2 gap-4">
            <L label="Category">
              <select className={inputCls} value={categoryID} onChange={(e) => setCategoryID(e.target.value)}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </L>
            <L label="Package / footprint">
              <input className={inputCls} value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="0603" />
            </L>
          </div>

          {!variantOf && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
              This is a template (a grouping that holds variants, e.g. “1k resistor”)
            </label>
          )}

          <L label="Minimum stock (low-stock alert threshold)">
            <input type="number" className={inputCls} value={minimum} onChange={(e) => setMinimum(e.target.value)} />
          </L>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Parameters</span>
              <button type="button" onClick={addParam} className="text-xs text-amber-600 hover:underline dark:text-amber-400">
                + add parameter
              </button>
            </div>
            {params.length === 0 && (
              <p className="text-xs text-zinc-400">Any attribute you want — resistance, tolerance, voltage, etc.</p>
            )}
            <div className="space-y-2">
              {params.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input className={inputCls} placeholder="Name" value={p.name} onChange={(e) => setParam(i, { name: e.target.value })} />
                  <input className={inputCls} placeholder="Value" value={p.value} onChange={(e) => setParam(i, { value: e.target.value })} />
                  <input className={`${inputCls} w-20`} placeholder="Unit" value={p.units ?? ''} onChange={(e) => setParam(i, { units: e.target.value })} />
                  <button type="button" onClick={() => removeParam(i)} className="px-1 text-zinc-400 hover:text-red-500">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-md px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
              {busy ? '…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800'

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      {children}
    </label>
  )
}
