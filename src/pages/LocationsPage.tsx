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
      <div className="mb-5 flex items-center justify-between">
        <div>
          <span className="eyebrow">Inventory</span>
          <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 0' }}>
            Locations
          </h1>
        </div>
        <button onClick={() => setShowNew(true)} className="btn primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          New location
        </button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,280px) 1fr' }}>
        {/* Bin list */}
        <aside className="card self-start">
          <div className="card-h"><h2>Storage tree</h2></div>
          {locations.length === 0 && <p className="c-faint p-4 text-sm">No locations yet.</p>}
          {locations.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelected(l)}
              className={`cat ${selected?.id === l.id ? 'on' : ''}`}
              style={{ justifyContent: 'space-between' }}
            >
              <span className="flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16l-1 13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" /><path d="M9 7V4h6v3" /></svg>
                {l.name}
              </span>
              {l.barcode && <span className="mono c-faint" style={{ fontSize: 11 }}>{l.barcode}</span>}
            </button>
          ))}
        </aside>

        {/* Contents */}
        <div className="min-w-0">
          {selected ? (
            <BinContents location={selected} contents={contents} onChanged={loadLocations} onDeselect={() => setSelected(null)} />
          ) : (
            <p className="c-faint text-sm">Select a location to see its contents.</p>
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
    <div className="card">
      <div className="card-h">
        <div className="min-w-0">
          <span className="eyebrow">Bin</span>
          <h2 className="mono" style={{ color: 'var(--accent)', fontSize: 15, marginTop: 1 }}>{location.name}</h2>
        </div>
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
          {location.barcode && <span className="tag">{location.barcode}</span>}
          <span className="pill ghost">{contents.length} parts · {num(total)} units</span>
          <button onClick={() => setEdit(true)} className="btn sm">Edit</button>
          <button onClick={del} className="btn sm danger">Delete</button>
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th>Part</th>
            <th>Batch</th>
            <th className="num">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {contents.length === 0 && (
            <tr>
              <td colSpan={3} className="c-faint" style={{ textAlign: 'center', padding: 24 }}>
                This bin is empty.
              </td>
            </tr>
          )}
          {contents.map((s) => (
            <tr key={s.id} className="hoverable">
              <td>
                <Link to={`/parts/${s.part_id}`} className="c-text">{s.part_name}</Link>
              </td>
              <td className="mono c-faint">{s.batch || '—'}</td>
              <td className="num c-text">{num(s.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{existing ? 'Edit location' : 'New location'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="modal-b space-y-3">
          <label className="fieldlabel">
            <span>Name</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="A3-04" />
          </label>
          <label className="fieldlabel">
            <span>Barcode (optional)</span>
            <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="FB-A304" />
          </label>
          {error && <p className="c-crit text-sm">{error}</p>}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={busy} className="btn primary">
            {busy ? '…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
