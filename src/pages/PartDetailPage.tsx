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
import { NewPartModal } from '../components/NewPartModal'
import { stockClass, num } from '../lib/format'

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

  if (notFound) {
    return (
      <div>
        <Link to="/parts" className="text-sm text-amber-600 hover:underline dark:text-amber-400">
          ← Parts
        </Link>
        <p className="mt-8 text-zinc-500">Part not found.</p>
      </div>
    )
  }
  if (!part) return <p className="text-zinc-400">Loading…</p>

  const isTemplate = part.is_template || (part.variant_count ?? 0) > 0

  const del = async () => {
    if (!confirm(`Delete "${part.name}"? This removes its variants and stock.`)) return
    await api.deletePart(part.id).catch(() => undefined)
    navigate('/parts')
  }

  return (
    <div>
      <Link to="/parts" className="text-sm text-amber-600 hover:underline dark:text-amber-400">
        ← Parts
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{part.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-zinc-500">
            {part.package && (
              <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800">
                {part.package}
              </span>
            )}
            {isTemplate && (
              <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                template · {part.variant_count ?? part.variants?.length ?? 0} variants
              </span>
            )}
            {part.variant_of && <span className="text-xs">variant</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-zinc-400">In stock</div>
            <div className={`font-mono text-2xl ${stockClass(part.total_stock, part.minimum_stock)}`}>
              {num(part.total_stock)}
            </div>
          </div>
          <button onClick={del} className="self-start text-sm text-zinc-400 hover:text-red-500">
            Delete
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {/* Parameters */}
        <Section title="Parameters">
          {part.parameters && part.parameters.length > 0 ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {part.parameters.map((p) => (
                  <tr key={p.id}>
                    <td className="py-1.5 text-zinc-500">{p.template_name}</td>
                    <td className="py-1.5 text-right font-mono">
                      {p.value}
                      {p.units ? ` ${p.units}` : ''}
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
              <button onClick={() => setAddVariant(true)} className="text-xs text-amber-600 hover:underline dark:text-amber-400">
                + add variant
              </button>
            }
          >
            {part.variants && part.variants.length > 0 ? (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/60">
                {part.variants.map((v) => (
                  <li key={v.id}>
                    <Link
                      to={`/parts/${v.id}`}
                      className="flex items-center justify-between py-2 hover:text-amber-600 dark:hover:text-amber-400"
                    >
                      <span>{v.name}</span>
                      <span className="font-mono text-xs text-zinc-500">{v.package || ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No variants yet.</Empty>
            )}
          </Section>
        ) : (
          <Section title="Adjust stock">
            <AdjustStock partID={part.id} locations={locations} onDone={reload} />
          </Section>
        )}
      </div>

      {/* Stock by bin */}
      {!isTemplate && (
        <Section title="Stock by location" className="mt-8">
          {stock.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <tr>
                    <th className="px-4 py-2 font-medium">Location</th>
                    <th className="px-4 py-2 font-medium">Batch</th>
                    <th className="px-4 py-2 text-right font-medium">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {stock.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2">{s.location_name || <span className="text-zinc-400">unassigned</span>}</td>
                      <td className="px-4 py-2 font-mono text-xs text-zinc-500">{s.batch || '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{num(s.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No stock recorded. Use “Adjust stock” to add some.</Empty>
          )}
        </Section>
      )}

      {/* Manufacturer / supplier — endpoints not built yet */}
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <Section title="Manufacturer parts">
          <Empty>MPNs and datasheets land with the enrichment piece.</Empty>
        </Section>
        <Section title="Suppliers & pricing">
          <Empty>Distributor SKUs and price breaks land with the enrichment piece.</Empty>
        </Section>
      </div>

      {/* History */}
      <Section title="Stock history" className="mt-8">
        {history.length > 0 ? (
          <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/60">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2">
                <span className="text-zinc-500">
                  <span className="font-mono text-xs uppercase">{t.kind}</span>
                  {t.note ? ` · ${t.note}` : ''}
                </span>
                <span className="flex items-center gap-4 font-mono text-xs">
                  <span className={t.delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                    {t.delta >= 0 ? '+' : ''}
                    {num(t.delta)}
                  </span>
                  <span className="text-zinc-400">→ {num(t.resulting_quantity)}</span>
                  <span className="text-zinc-400">{new Date(t.created_at).toLocaleDateString()}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No movements yet.</Empty>
        )}
      </Section>

      {addVariant && (
        <NewPartModal
          categories={categories}
          variantOf={part.id}
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
      <div className="flex gap-1 rounded-md bg-zinc-100 p-1 text-sm dark:bg-zinc-800">
        {(['add', 'remove', 'count'] as AdjustKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`flex-1 rounded px-3 py-1 capitalize ${
              kind === k ? 'bg-white font-medium shadow-sm dark:bg-zinc-700' : 'text-zinc-500'
            }`}
          >
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
          className={inputCls}
        />
        <select value={locationID} onChange={(e) => setLocationID(e.target.value)} className={inputCls}>
          <option value="">No location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className={inputCls} />
      <button
        onClick={apply}
        disabled={busy || !qty}
        className="w-full rounded-md bg-amber-500 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
      >
        {busy ? '…' : `Apply ${kind}`}
      </button>
    </div>
  )
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800'

function Section({
  title,
  action,
  className = '',
  children,
}: {
  title: string
  action?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
        {action}
      </div>
      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-400">{children}</p>
}
