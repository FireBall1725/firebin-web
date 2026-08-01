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
import { KicadDrawingView } from '../components/KicadDrawingView'
import { PartFormModal, partToDraft } from '../components/PartForm'
import { PartThumb, CatChip } from '../components/PartsViews'
import { isLow, isReference } from '../lib/stockState'
import { ManufacturerParts } from '../components/ManufacturerParts'
import { PrintLabelModal } from '../components/PrintLabelModal'
import { StockLots } from '../components/StockLots'
import { num } from '../lib/format'
import { useRealtime } from '../lib/useRealtime'
import { icon } from '../lib/icons'
import { mdiChevronLeft } from '@mdi/js'
import { useAuth } from '../auth/AuthContext'

export function PartDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const [part, setPart] = useState<Part | null>(null)
  const [stock, setStock] = useState<StockItem[]>([])
  const [history, setHistory] = useState<StockTransaction[]>([])
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [notFound, setNotFound] = useState(false)
  const [addVariant, setAddVariant] = useState(false)
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<'overview' | 'stock' | 'suppliers' | 'history' | 'kicad'>('overview')
  const [printing, setPrinting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null)
  const [providers, setProviders] = useState<{ provider: string; label: string }[]>([])
  const [pickOpen, setPickOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSel = (name: string) =>
    setSelected((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else n.add(name); return n })

  const reload = useCallback(() => {
    api.getPart(id).then(setPart).catch(() => setNotFound(true))
    api.listPartStock(id).then(setStock).catch(() => setStock([]))
    api.listPartHistory(id).then(setHistory).catch(() => setHistory([]))
    // Refresh categories too, so a just-created category resolves for the chip
    // and thumbnail without a manual page reload.
    api.listCategories().then(setCategories).catch(() => undefined)
  }, [id])

  useEffect(() => {
    reload()
    api.listLocations().then(setLocations).catch(() => setLocations([]))
    api.listCategories().then(setCategories).catch(() => setCategories([]))
    api.enrichStatus().then((s) => {
      const cfg = s.providers.filter((p) => p.configured)
      setProviders(cfg.map((p) => ({ provider: p.provider, label: p.label })))
      setSelected(new Set(cfg.map((p) => p.provider)))
    }).catch(() => undefined)
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
  // A part recorded but not owned is never low: there is no shortfall in
  // something you decided not to stock. Shared with the list views so the two
  // cannot disagree about the same part.
  const reference = isReference(part)
  const low = isLow(part)

  const del = async () => {
    if (!confirm(`Delete "${part.name}"? This removes its variants and stock.`)) return
    await api.deletePart(part.id).catch(() => undefined)
    navigate('/parts')
  }

  // Refresh parameters, datasheet, and supplier pricing from the metadata
  // provider, looked up by the part's primary MPN. Applied server-side (the same
  // path the bulk refresh uses) so single + bulk never diverge.
  const updateFromProvider = async (names?: string[]) => {
    const mpn = part.manufacturer_parts?.[0]?.mpn || part.primary_mpn
    if (!mpn) {
      setEnrichMsg('Add an MPN first — the provider looks the part up by manufacturer part number.')
      return
    }
    setEnriching(true)
    setEnrichMsg(null)
    try {
      const r = await api.enrichPart(part.id, names)
      setEnrichMsg(`Updated from ${r.source || 'the provider'} — parameters, datasheet, and pricing.`)
      reload()
    } catch {
      setEnrichMsg('Update failed — check the MPN, or that enrichment is configured in Settings.')
    } finally {
      setEnriching(false)
    }
  }

  return (
    <div>
      <Link to="/parts" className="btn sm" style={{ marginBottom: 14 }}>
        {icon(mdiChevronLeft)}
        Parts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <PartThumb part={part} catName={categories.find((c) => c.id === part.category_id)?.name} size={44} />
          <div className="min-w-0">
          <span className="eyebrow">
            {part.variant_of ? 'Variant' : isTemplate ? 'Template' : 'Part'}
          </span>
          <h1 className="c-text" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
            {part.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {(() => {
              const cn = categories.find((c) => c.id === part.category_id)?.name
              return cn ? <CatChip catName={cn} partName={part.name} /> : null
            })()}
            {part.ipn && <span className="tag mono" title="FireBin part number">{part.ipn}</span>}
            {part.package && <span className="tag">{part.package}</span>}
            {isTemplate && (
              <span className="pill accent">
                {part.variant_count ?? part.variants?.length ?? 0} variants
              </span>
            )}
            {!isTemplate && reference && (
              <span className="pill ghost" title="Recorded for reference; you do not stock this">
                reference only
              </span>
            )}
            {!isTemplate && !reference && (
              <span className={`pill ${low ? 'low' : 'ok'}`}>
                {num(part.total_stock)} {low ? 'low' : 'in stock'}
              </span>
            )}
            {part.barcode && <span className="tag">{part.barcode}</span>}
          </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div style={{ textAlign: 'right' }}>
            {/* "In stock: 0" is the wrong headline for a part you never
                stocked: it reads as sold out. */}
            <div className="eyebrow">{reference ? 'Not stocked' : 'In stock'}</div>
            {reference ? (
              <div className="c-faint" style={{ fontSize: 13, maxWidth: 150, lineHeight: 1.4 }}>
                Recorded for reference
              </div>
            ) : (
              <div className={`mono ${low ? 'c-crit' : 'c-text'}`} style={{ fontSize: 24, fontWeight: 700 }}>
                {num(part.total_stock)}
              </div>
            )}
          </div>
          {canWrite && <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex' }}>
              <button
                onClick={() => { setPickOpen(false); updateFromProvider() }}
                disabled={enriching}
                className="btn sm"
                title="Refresh parameters, datasheet & pricing from all configured providers by MPN"
                style={providers.length > 1 ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : undefined}
              >
                {enriching ? 'Updating…' : 'Update'}
              </button>
              {providers.length > 1 && (
                <button
                  onClick={() => setPickOpen((v) => !v)}
                  disabled={enriching}
                  className="btn sm"
                  aria-label="Choose enrichment sources"
                  style={{ marginLeft: -1, padding: '0 8px', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                >
                  ▾
                </button>
              )}
            </div>
            {pickOpen && (
              <>
                <div onClick={() => setPickOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 31,
                    minWidth: 190, padding: 10, borderRadius: 11,
                    background: 'var(--panel)', border: '1px solid var(--border)',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.28)',
                  }}
                >
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Enrichment sources</div>
                  {providers.map((p) => (
                    <label key={p.provider} className="flex items-center gap-2" style={{ padding: '4px 2px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={selected.has(p.provider)} onChange={() => toggleSel(p.provider)} />
                      <span className="c-text">{p.label}</span>
                    </label>
                  ))}
                  <button
                    className="btn sm primary"
                    style={{ width: '100%', marginTop: 8 }}
                    disabled={enriching || selected.size === 0}
                    onClick={() => { setPickOpen(false); updateFromProvider([...selected]) }}
                  >
                    Update from selected
                  </button>
                </div>
              </>
            )}
          </div>}
          <button onClick={() => setPrinting(true)} className="btn sm">Label</button>
          {canWrite && <button onClick={() => setEditing(true)} className="btn sm">Edit</button>}
          {canWrite && <button onClick={del} className="btn sm danger">Delete</button>}
        </div>
      </div>

      {enrichMsg && (
        <div className="banner" style={{ marginTop: 12, fontSize: 13 }}>{enrichMsg}</div>
      )}

      {printing && (
        <PrintLabelModal partIDs={[part.id]} title={part.name} onClose={() => setPrinting(false)} />
      )}

      {editing && (
        <PartFormModal
          categories={categories}
          title="Edit part"
          editId={part.id}
          initial={partToDraft(part, categories)}
          onClose={() => setEditing(false)}
          onCreated={() => { setEditing(false); reload() }}
        />
      )}

      <div className="tabs" style={{ marginTop: 20 }}>
        {([
          { id: 'overview', label: 'Overview' },
          ...(!isTemplate ? [{ id: 'stock' as const, label: 'Stock' }] : []),
          { id: 'suppliers', label: 'Suppliers & pricing' },
          { id: 'history', label: 'History' },
          { id: 'kicad', label: 'KiCad' },
        ] as { id: typeof tab; label: string }[]).map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (<>
      <div className="grid gap-4 lg:grid-cols-2">
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
              canWrite ? (
                <button onClick={() => setAddVariant(true)} className="link" style={{ fontSize: 12 }}>
                  + add variant
                </button>
              ) : undefined
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
        ) : canWrite ? (
          <Section title="Adjust stock" pad>
            <AdjustStock partID={part.id} locations={locations} onDone={reload} />
          </Section>
        ) : null}
      </div>

      </>)}

      {/* Stock by bin + lots (split / move / merge / label) */}
      {tab === 'stock' && !isTemplate && (
        <Section title="Stock by location" flush>
          <StockLots partName={part.name} stock={stock} locations={locations} onChanged={reload} canWrite={canWrite} />
        </Section>
      )}

      {tab === 'suppliers' && (<>
      {/* Commercial tree: MPNs → supplier SKUs → price breaks */}
      <div>
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

      </>)}


      {tab === 'kicad' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Symbol">
            <KicadDrawingView kind="symbol" libID={part.kicad_symbol} height={260} />
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
              <div className="c-dim" style={{ fontSize: 12 }}>Library ID</div>
              <div className="mono" style={{ wordBreak: 'break-all' }}>
                {part.kicad_symbol || <span className="c-dim">not set</span>}
              </div>
            </div>
          </Section>

          <Section title="Footprint">
            <KicadDrawingView kind="footprint" libID={part.kicad_footprint} height={260} />
            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
              <div className="c-dim" style={{ fontSize: 12 }}>Library ID</div>
              <div className="mono" style={{ wordBreak: 'break-all' }}>
                {part.kicad_footprint || <span className="c-dim">not set</span>}
              </div>
            </div>
          </Section>

          {(!part.kicad_symbol || !part.kicad_footprint) && (
            <div className="banner" style={{ gridColumn: '1 / -1', fontSize: 13 }}>
              {/* Unmapped parts still reach KiCad, they just cannot be placed, so
                  say what the consequence is rather than only what is missing. */}
              This part appears in the KiCad library but cannot be placed until both
              IDs are set. Use Edit to add them.
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
      <Section title="Stock history">
        {history.length > 0 ? (
          <div>
            {history.map((t) => {
              const isMove = t.kind === 'move'
              const transfer = isMove
                ? `${t.from_location_name || 'Unassigned'} → ${t.to_location_name || 'Unassigned'}`
                : ''
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-2.5 bd-b">
                  <span className="c-dim text-sm">
                    <span className="mono" style={{ fontSize: 11, textTransform: 'uppercase' }}>{t.kind}</span>
                    {isMove ? ` · ${transfer}` : t.note ? ` · ${t.note}` : ''}
                  </span>
                  <span className="flex items-center gap-4 mono" style={{ fontSize: 12 }}>
                    {isMove ? (
                      <span className="c-dim">{num(Math.abs(t.delta))}</span>
                    ) : (
                      <span className={t.delta >= 0 ? 'c-good' : 'c-crit'}>
                        {t.delta >= 0 ? '+' : ''}
                        {num(t.delta)}
                      </span>
                    )}
                    <span className="c-faint">{new Date(t.created_at).toLocaleDateString()}</span>
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="p-4"><Empty>No movements yet.</Empty></div>
        )}
      </Section>
      )}

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
