// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type StorageLocation, type StockItem } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'
import { icon } from '../lib/icons'
import { comparePartNames } from '../lib/partSort'
import { usePageSize, setPageSize } from '../lib/prefs'
import { Pager } from '../components/Pager'
import { PartGraphic } from '../components/SymbolPicker'
import { PrintLabelModal } from '../components/PrintLabelModal'
import { catStyle } from '../lib/symbols'
import { mdiPlus, mdiArchiveOutline, mdiClose } from '@mdi/js'
import { useAuth } from '../auth/AuthContext'

export function LocationsPage() {
  const { canWrite } = useAuth()
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [selected, setSelected] = useState<StorageLocation | null>(null)
  const [contents, setContents] = useState<StockItem[]>([])
  const [showNew, setShowNew] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [selecting, setSelecting] = useState(false)
  const [bulkLabel, setBulkLabel] = useState(false)

  const stopSelecting = () => { setSelecting(false); setChecked(new Set()) }

  const toggle = (id: string) => setChecked((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const allChecked = locations.length > 0 && checked.size === locations.length
  const toggleAll = () => setChecked((s) => (s.size === locations.length ? new Set() : new Set(locations.map((l) => l.id))))

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

  // Select the location named in the URL (/locations/:id) — e.g. after scanning a
  // location's QR when no part action menu is open.
  const { id: routeId } = useParams()
  useEffect(() => {
    if (!routeId) return
    const l = locations.find((x) => x.id === routeId)
    if (l) setSelected(l)
  }, [routeId, locations])

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
        {canWrite && (
          <button onClick={() => setShowNew(true)} className="btn primary">
            {icon(mdiPlus)}
            New location
          </button>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,280px) 1fr' }}>
        {/* Bin list */}
        <aside className="card self-start">
          <div className="card-h" style={{ justifyContent: 'space-between' }}>
            <h2>Storage Locations</h2>
            {locations.length > 0 && !selecting && (
              <button className="btn sm" onClick={() => setSelecting(true)}>Print labels</button>
            )}
          </div>
          {locations.length === 0 && <p className="c-faint p-4 text-sm">No locations yet.</p>}
          {selecting && locations.length > 0 && (
            <div className="flex items-center gap-2" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
              <label className="flex items-center gap-2 text-sm c-dim" style={{ whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={allChecked} onChange={toggleAll} /> All
              </label>
              <div style={{ flex: 1 }} />
              <button className="btn sm primary" disabled={checked.size === 0} onClick={() => setBulkLabel(true)}>
                Print{checked.size ? ` (${checked.size})` : ''}
              </button>
              <button className="btn sm" onClick={stopSelecting}>Cancel</button>
            </div>
          )}
          {locations.map((l) => (
            <div key={l.id} className="cat-row">
              <button
                onClick={() => setSelected(l)}
                className={`cat ${selected?.id === l.id ? 'on' : ''}`}
                style={{ justifyContent: 'space-between', ...(selecting ? { paddingLeft: 36 } : null) }}
              >
                <span className="flex items-center gap-2">
                  {icon(mdiArchiveOutline, { size: 15 })}
                  {l.name}
                </span>
                {l.barcode && <span className="mono c-faint" style={{ fontSize: 11 }}>{l.barcode}</span>}
              </button>
              {selecting && (
                <input
                  type="checkbox"
                  checked={checked.has(l.id)}
                  onChange={() => toggle(l.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}
                />
              )}
            </div>
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

      {bulkLabel && (
        <PrintLabelModal
          locationIDs={[...checked]}
          title={`${checked.size} location${checked.size === 1 ? '' : 's'}`}
          onClose={() => { setBulkLabel(false); stopSelecting() }}
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
  const { canWrite } = useAuth()
  const [edit, setEdit] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = usePageSize()
  const total = contents.reduce((s, c) => s + c.quantity, 0)

  // Reset to the first page when the selected location changes.
  useEffect(() => { setPage(1) }, [location.id])

  // Order with the same natural + SI-prefix sort the Parts page uses
  // (1Ω → 100Ω → 1kΩ, 1nF → 1F).
  const rows = useMemo(
    () => [...contents].sort((a, b) => comparePartNames(a.part_name ?? '', b.part_name ?? '')),
    [contents],
  )

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageNo = Math.min(page, totalPages)
  const shown = rows.slice((pageNo - 1) * pageSize, pageNo * pageSize)

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
          {canWrite && <button onClick={() => setEdit(true)} className="btn sm">Edit</button>}
          {canWrite && <button onClick={del} className="btn sm danger">Delete</button>}
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 1 }}></th>
            <th>Part</th>
            <th>Batch</th>
            <th className="num">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="c-faint" style={{ textAlign: 'center', padding: 24 }}>
                This bin is empty.
              </td>
            </tr>
          )}
          {shown.map((s) => {
            const { key, color } = catStyle(s.category_name, s.part_name ?? '')
            return (
              <tr key={s.id} className="hoverable">
                <td style={{ width: 1, paddingRight: 0 }}>
                  <PartGraphic src={s.image_path || `/symbols/${key}.svg`} color={color} size={18} />
                </td>
                <td>
                  <Link to={`/parts/${s.part_id}`} className="c-text">{s.part_name}</Link>
                </td>
                <td className="mono c-faint">{s.batch || '—'}</td>
                <td className="num c-text">{num(s.quantity)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {rows.length > 0 && (
        <Pager
          page={pageNo}
          totalPages={totalPages}
          total={rows.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => { setPageSize(n); setPage(1) }}
          noun="parts"
        />
      )}

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
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{existing ? 'Edit location' : 'New location'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
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
