// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  api,
  type Part,
  type StockItem,
  type StockTransaction,
  type StorageLocation,
  type Category,
  type AdjustKind,
} from '../lib/api'
import { PartFormModal } from '../components/PartForm'
import { ManufacturerParts } from '../components/ManufacturerParts'
import { num } from '../lib/format'
import { useRealtime } from '../lib/useRealtime'

export function PartDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [part, setPart] = useState<Part | null>(null)
  const [stock, setStock] = useState<StockItem[]>([])
  const [history, setHistory] = useState<StockTransaction[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [notFound, setNotFound] = useState(false)
  const [addVariant, setAddVariant] = useState(false)

  const reload = useCallback(() => {
    api.getPart(id).then(setPart).catch(() => setNotFound(true))
    api.listPartStock(id).then(setStock).catch(() => setStock([]))
    api.listPartHistory(id).then(setHistory).catch(() => setHistory([]))
  }, [id])

  useEffect(() => {
    reload()
    api.listLocations().then(setLocations).catch(() => setLocations([]))
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [reload])

  useRealtime(['parts', 'stock'], reload)

  if (notFound) {
    return (
      <div>
        <Link to="/parts" className="link">← Parts</Link>
        <p className="mt-8 c-dim">Part not found.</p>
      </div>
    )
  }
  if (!part) return <p className="c-faint">Loading…</p>

  const isTemplate = part.is_template || (part.variant_count ?? 0) > 0
  const low = part.total_stock <= 0 || (part.minimum_stock > 0 && part.total_stock <= part.minimum_stock)

  const del = async () => {
    if (!confirm(`Delete "${part.name}"? This removes its variants and stock.`)) return
    await api.deletePart(part.id).catch(() => undefined)
    navigate('/parts')
  }

  return (
    <div>
      <Link to="/parts" className="btn sm" style={{ marginBottom: 14 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        Parts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="eyebrow">
            {part.variant_of ? 'Variant' : isTemplate ? 'Template' : 'Part'}
          </span>
          <h1 className="c-text" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
            {part.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {part.ipn && <span className="tag mono" title="FireBin part number">{part.ipn}</span>}
            {part.package && <span className="tag">{part.package}</span>}
            {isTemplate && (
              <span className="pill accent">
                {part.variant_count ?? part.variants?.length ?? 0} variants
              </span>
            )}
            {!isTemplate && (
              <span className={`pill ${low ? 'low' : 'ok'}`}>
                {num(part.total_stock)} {low ? 'low' : 'in stock'}
              </span>
            )}
            {part.barcode && <span className="tag">{part.barcode}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow">In stock</div>
            <div className={`mono ${low ? 'c-crit' : 'c-text'}`} style={{ fontSize: 24, fontWeight: 700 }}>
              {num(part.total_stock)}
            </div>
          </div>
          <button onClick={del} className="btn sm danger">Delete</button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Parameters */}
        <Section title="Parameters">
          {part.parameters && part.parameters.length > 0 ? (
            <table className="tbl">
              <tbody>
                {part.parameters.map((p) => (
                  <tr key={p.id}>
                    <td className="c-dim" style={{ width: '45%' }}>{p.template_name}</td>
                    <td className="num c-text" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                      {p.value}
                      {p.units && !p.value.trim().endsWith(p.units) ? ` ${p.units}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>No parameters. Edit the part to add resistance, tolerance, etc.</Empty>
          )}
        </Section>

        {/* Variants (templates) or Stock adjust (concrete parts) */}
        {isTemplate ? (
          <Section
            title="Variants"
            action={
              <button onClick={() => setAddVariant(true)} className="link" style={{ fontSize: 12 }}>
                + add variant
              </button>
            }
          >
            {part.variants && part.variants.length > 0 ? (
              <div>
                {part.variants.map((v) => (
                  <Link key={v.id} to={`/parts/${v.id}`} className="flex items-center justify-between px-4 py-2.5 bd-b hoverable-link">
                    <span className="c-text">{v.name}</span>
                    <span className="mono c-faint" style={{ fontSize: 12 }}>{v.package || ''}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty>No variants yet.</Empty>
            )}
          </Section>
        ) : (
          <Section title="Adjust stock" pad>
            <AdjustStock partID={part.id} locations={locations} onDone={reload} />
          </Section>
        )}
      </div>

      {/* Stock by bin */}
      {!isTemplate && (
        <Section title="Stock by location" className="mt-4" flush>
          {stock.length > 0 ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Batch</th>
                  <th className="num">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.id}>
                    <td className="c-text">{s.location_name || <span className="c-faint">unassigned</span>}</td>
                    <td className="mono c-faint">{s.batch || '—'}</td>
                    <td className="num c-text">{num(s.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4"><Empty>No stock recorded. Use “Adjust stock” to add some.</Empty></div>
          )}
        </Section>
      )}

      {/* Commercial tree: MPNs → supplier SKUs → price breaks */}
      <div className="mt-4">
        <ManufacturerParts partID={part.id} items={part.manufacturer_parts ?? []} onChanged={reload} />
      </div>

      {/* Alternatives (from Octopart), linked to inventory when we stock them */}
      {part.alternatives && part.alternatives.length > 0 && (
        <Section title="Alternatives" className="mt-4" flush>
          <div>
            {part.alternatives.map((a) => (
              <div key={a.mpn} className="flex items-center justify-between px-4 py-2.5 bd-b">
                <div className="min-w-0">
                  <span className="mono text-sm">{a.mpn}</span>
                  {a.manufacturer && (
                    <span className="c-dim" style={{ marginLeft: 8, fontSize: 12 }}>{a.manufacturer}</span>
                  )}
                  {a.description && (
                    <div className="c-faint" style={{ fontSize: 11, marginTop: 2 }}>{a.description}</div>
                  )}
                </div>
                {a.part_id ? (
                  <Link to={`/parts/${a.part_id}`} className="pill ok" style={{ whiteSpace: 'nowrap' }}>
                    in stock ↗
                  </Link>
                ) : (
                  <span className="c-faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>not stocked</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* History */}
      <Section title="Stock history" className="mt-4">
        {history.length > 0 ? (
          <div>
            {history.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-2.5 bd-b">
                <span className="c-dim text-sm">
                  <span className="mono" style={{ fontSize: 11, textTransform: 'uppercase' }}>{t.kind}</span>
                  {t.note ? ` · ${t.note}` : ''}
                </span>
                <span className="flex items-center gap-4 mono" style={{ fontSize: 12 }}>
                  <span className={t.delta >= 0 ? 'c-good' : 'c-crit'}>
                    {t.delta >= 0 ? '+' : ''}
                    {num(t.delta)}
                  </span>
                  <span className="c-faint">→ {num(t.resulting_quantity)}</span>
                  <span className="c-faint">{new Date(t.created_at).toLocaleDateString()}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4"><Empty>No movements yet.</Empty></div>
        )}
      </Section>

      {addVariant && (
        <PartFormModal
          categories={categories}
          title="New variant"
          initial={{ variant_of: part.id }}
          onClose={() => setAddVariant(false)}
          onCreated={() => {
            setAddVariant(false)
            reload()
          }}
        />
      )}
    </div>
  )
}

function AdjustStock({
  partID,
  locations,
  onDone,
}: {
  partID: string
  locations: StorageLocation[]
  onDone: () => void
}) {
  const [kind, setKind] = useState<AdjustKind>('add')
  const [qty, setQty] = useState('')
  const [locationID, setLocationID] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    const q = parseFloat(qty)
    if (isNaN(q)) return
    setBusy(true)
    try {
      await api.adjustStock(partID, {
        kind,
        quantity: q,
        location_id: locationID || null,
        note: note || null,
      })
      setQty('')
      setNote('')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="seg">
        {(['add', 'remove', 'count'] as AdjustKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`seg-btn ${kind === k ? 'on' : ''}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder={kind === 'count' ? 'Counted quantity' : 'Quantity'}
          className="input"
        />
        <select value={locationID} onChange={(e) => setLocationID(e.target.value)} className="input">
          <option value="">No location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input" />
      <button onClick={apply} disabled={busy || !qty} className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
        {busy ? '…' : `Apply ${kind}`}
      </button>
    </div>
  )
}

function Section({
  title,
  action,
  className = '',
  pad,
  flush,
  children,
}: {
  title: string
  action?: React.ReactNode
  className?: string
  pad?: boolean
  flush?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={className}>
      <div className="card">
        <div className="card-h">
          <h2>{title}</h2>
          {action && <div style={{ marginLeft: 'auto' }}>{action}</div>}
        </div>
        <div className={pad ? 'p-4' : flush ? '' : ''}>{children}</div>
      </div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="c-faint text-sm">{children}</p>
}
