// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Part, type Category } from '../lib/api'
import { NewPartModal } from '../components/NewPartModal'
import { stockClass } from '../lib/format'
import { useRealtime } from '../lib/useRealtime'

export function PartsPage() {
  const navigate = useNavigate()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, Part[] | 'loading'>>({})

  const load = useCallback(() => {
    setLoading(true)
    api
      .listParts({ search: search || undefined, category, topLevel: true })
      .then(setParts)
      .catch(() => setParts([]))
      .finally(() => setLoading(false))
  }, [search, category])

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // Debounce search/category changes.
  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  // Live-refresh when anyone changes parts or stock elsewhere.
  useRealtime(['parts', 'stock'], load)
  useRealtime(['categories'], () => {
    api.listCategories().then(setCategories).catch(() => undefined)
  })

  const toggle = async (p: Part) => {
    if (expanded[p.id]) {
      setExpanded((e) => {
        const next = { ...e }
        delete next[p.id]
        return next
      })
      return
    }
    setExpanded((e) => ({ ...e, [p.id]: 'loading' }))
    const full = await api.getPart(p.id).catch(() => null)
    setExpanded((e) => ({ ...e, [p.id]: full?.variants ?? [] }))
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Parts</h1>
        <button
          onClick={() => setShowNew(true)}
          className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          + New part
        </button>
      </div>

      <div className="mt-6 flex gap-6">
        {/* Category rail */}
        <aside className="w-44 shrink-0">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Categories
          </div>
          <button
            onClick={() => setCategory(undefined)}
            className={railClass(category === undefined)}
          >
            All parts
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)} className={railClass(category === c.id)}>
              {c.name}
            </button>
          ))}
        </aside>

        {/* Table */}
        <div className="min-w-0 flex-1">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parts, keywords, MPN…"
            className="mb-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 dark:border-zinc-700 dark:bg-zinc-800"
          />

          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Package</th>
                  <th className="px-4 py-2 text-right font-medium">Variants</th>
                  <th className="px-4 py-2 text-right font-medium">In stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && parts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-400">
                      No parts yet. Add your first with “New part”.
                    </td>
                  </tr>
                )}
                {!loading &&
                  parts.map((p) => {
                    const isTemplate = (p.variant_count ?? 0) > 0
                    const rows = [
                      <PartRow
                        key={p.id}
                        part={p}
                        isTemplate={isTemplate}
                        expanded={!!expanded[p.id]}
                        onToggle={() => toggle(p)}
                        onOpen={() => navigate(`/parts/${p.id}`)}
                      />,
                    ]
                    const kids = expanded[p.id]
                    if (kids === 'loading') {
                      rows.push(
                        <tr key={p.id + '-l'}>
                          <td colSpan={4} className="px-4 py-2 pl-12 text-xs text-zinc-400">
                            Loading variants…
                          </td>
                        </tr>,
                      )
                    } else if (Array.isArray(kids)) {
                      kids.forEach((v) =>
                        rows.push(
                          <PartRow
                            key={v.id}
                            part={v}
                            variant
                            onOpen={() => navigate(`/parts/${v.id}`)}
                          />,
                        ),
                      )
                    }
                    return rows
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <NewPartModal
          categories={categories}
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false)
            navigate(`/parts/${id}`)
          }}
        />
      )}
    </div>
  )
}

function PartRow({
  part,
  isTemplate,
  variant,
  expanded,
  onToggle,
  onOpen,
}: {
  part: Part
  isTemplate?: boolean
  variant?: boolean
  expanded?: boolean
  onToggle?: () => void
  onOpen: () => void
}) {
  return (
    <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
      <td className={`px-4 py-2 ${variant ? 'pl-12' : ''}`}>
        <div className="flex items-center gap-1.5">
          {isTemplate ? (
            <button
              onClick={onToggle}
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? '▾' : '▸'}
            </button>
          ) : (
            <span className="inline-block w-5" />
          )}
          <button onClick={onOpen} className="text-left hover:text-amber-600 dark:hover:text-amber-400">
            {part.name}
          </button>
        </div>
      </td>
      <td className="px-4 py-2 font-mono text-xs text-zinc-500">{part.package || '—'}</td>
      <td className="px-4 py-2 text-right font-mono text-xs text-zinc-500">
        {isTemplate ? part.variant_count : ''}
      </td>
      <td className={`px-4 py-2 text-right font-mono ${stockClass(part.total_stock, part.minimum_stock)}`}>
        {part.total_stock}
      </td>
    </tr>
  )
}

function railClass(active: boolean) {
  return `mb-0.5 block w-full truncate rounded px-2 py-1.5 text-left text-sm ${
    active
      ? 'bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400'
      : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'
  }`
}
