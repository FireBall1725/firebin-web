// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type StorageLocation, type StockItem } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'

export function LocationsPage() {
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [selected, setSelected] = useState<StorageLocation | null>(null)
  const [contents, setContents] = useState<StockItem[]>([])
  const [showNew, setShowNew] = useState(false)

  const loadLocations = useCallback(() => {
    api.listLocations().then((ls) => {
      setLocations(ls)
      setSelected((cur) => cur ?? ls[0] ?? null)
    }).catch(() => undefined)
  }, [])

  const loadContents = useCallback((id: string) => {
    api.listLocationStock(id).then(setContents).catch(() => setContents([]))
  }, [])

  useEffect(loadLocations, [loadLocations])
  useEffect(() => {
    if (selected) loadContents(selected.id)
  }, [selected, loadContents])

  useRealtime(['locations'], loadLocations)
  useRealtime(['stock', 'parts'], () => {
    if (selected) loadContents(selected.id)
  })

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Locations</h1>
        <button onClick={() => setShowNew(true)} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600">
          + New location
        </button>
      </div>

      <div className="mt-6 flex gap-6">
        {/* Bin list */}
        <aside className="w-64 shrink-0">
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            {locations.length === 0 && <p className="p-4 text-sm text-zinc-400">No locations yet.</p>}
            {locations.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelected(l)}
                className={`flex w-full items-center justify-between border-b border-zinc-100 px-4 py-2.5 text-left text-sm last:border-0 dark:border-zinc-800/60 ${
                  selected?.id === l.id ? 'bg-amber-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                }`}
              >
                <span>{l.name}</span>
                {l.barcode && <span className="font-mono text-xs text-zinc-400">{l.barcode}</span>}
              </button>
            ))}
          </div>
        </aside>

        {/* Contents */}
        <div className="min-w-0 flex-1">
          {selected ? (
            <BinContents location={selected} contents={contents} onChanged={loadLocations} onDeselect={() => setSelected(null)} />
          ) : (
            <p className="text-sm text-zinc-400">Select a location to see its contents.</p>
          )}
        </div>
      </div>

      {showNew && (
        <LocationModal
          onClose={() => setShowNew(false)}
          onSaved={(l) => {
            setShowNew(false)
            loadLocations()
            setSelected(l)
          }}
        />
      )}
    </div>
  )
}

function BinContents({
  location,
  contents,
  onChanged,
  onDeselect,
}: {
  location: StorageLocation
  contents: StockItem[]
  onChanged: () => void
  onDeselect: () => void
}) {
  const [edit, setEdit] = useState(false)
  const total = contents.reduce((s, c) => s + c.quantity, 0)

  const del = async () => {
    if (!confirm(`Delete location "${location.name}"? Stock there becomes unassigned.`)) return
    await api.deleteLocation(location.id).catch(() => undefined)
    onDeselect()
    onChanged()
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{location.name}</h2>
          <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
            {location.barcode && (
              <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800">{location.barcode}</span>
            )}
            <span>{contents.length} distinct parts · {num(total)} units</span>
          </div>
        </div>
        <div className="flex gap-3 text-sm">
          <button onClick={() => setEdit(true)} className="text-zinc-500 hover:text-amber-600 dark:hover:text-amber-400">
            Edit
          </button>
          <button onClick={del} className="text-zinc-400 hover:text-red-500">
            Delete
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <tr>
              <th className="px-4 py-2 font-medium">Part</th>
              <th className="px-4 py-2 font-medium">Batch</th>
              <th className="px-4 py-2 text-right font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {contents.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-400">
                  This bin is empty.
                </td>
              </tr>
            )}
            {contents.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                <td className="px-4 py-2">
                  <Link to={`/parts/${s.part_id}`} className="hover:text-amber-600 dark:hover:text-amber-400">
                    {s.part_name}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-zinc-500">{s.batch || '—'}</td>
                <td className="px-4 py-2 text-right font-mono">{num(s.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <LocationModal
          existing={location}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false)
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function LocationModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: StorageLocation
  onClose: () => void
  onSaved: (l: StorageLocation) => void
}) {
  const [name, setName] = useState(existing?.name ?? '')
  const [barcode, setBarcode] = useState(existing?.barcode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setBusy(true)
    try {
      const body = { name: name.trim(), barcode: barcode.trim() || null }
      const l = existing ? await api.updateLocation(existing.id, body) : await api.createLocation(body)
      onSaved(l)
    } catch {
      setError('Could not save (duplicate name or barcode?)')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{existing ? 'Edit location' : 'New location'}</h2>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Name</span>
            <input className={inputCls} value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="A3-04" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Barcode (optional)</span>
            <input className={inputCls} value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="FB-A304" />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button onClick={save} disabled={busy} className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
              {busy ? '…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800'
