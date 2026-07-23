// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, type Board, type BOMLine, type BOMLineInput, type Project, type ProjectAsset } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'
import { IBomViewer } from '../components/IBomViewer'
import { BoardThumb } from '../components/BoardThumb'

type Tab = 'info' | 'bom' | 'layout'

export function BoardDetailPage() {
  const { projectId = '', boardId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [ibom, setIbom] = useState<ProjectAsset | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  const tab: Tab = raw === 'bom' || raw === 'layout' ? raw : 'info'
  const setTab = (t: Tab) => setSearchParams(t === 'info' ? {} : { tab: t })

  const reload = useCallback(() => {
    api.getBoard(boardId).then(setBoard).catch(() => setNotFound(true))
  }, [boardId])

  useEffect(() => {
    reload()
    api.getProject(projectId).then(setProject).catch(() => undefined)
    api
      .listProjectAssets(projectId)
      .then((as) =>
        setIbom(
          as.find((a) => a.kind === 'ibom' && a.board_id === boardId) ??
            as.find((a) => a.kind === 'pcbrender' && a.board_id === boardId) ??
            null,
        ),
      )
      .catch(() => undefined)
  }, [projectId, boardId, reload])

  useRealtime(['projects', 'parts'], reload)

  if (notFound) {
    return (
      <div>
        <Link to={`/projects/${projectId}`} className="link">← Project</Link>
        <p className="mt-8 c-dim">Board not found.</p>
      </div>
    )
  }
  if (!board) return <p className="c-faint">Loading…</p>

  const isPanel = board.kind === 'panel'
  const copies = board.copies || 1
  const lines = board.lines ?? []
  const matched = lines.filter((l) => l.match_kind !== 'none').length
  const totalParts = lines.reduce((s, l) => s + l.quantity, 0) * copies

  return (
    <div>
      <Link to={`/projects/${projectId}`} className="btn sm" style={{ marginBottom: 14 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
        {project?.name ?? 'Project'}
      </Link>

      <div className="min-w-0">
        <span className="eyebrow">{isPanel ? 'Panel' : 'Board'}</span>
        <h1 className="c-text" style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-0.02em', margin: '4px 0 6px' }}>
          {board.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {board.revision && <span className="pill ghost">rev {board.revision}</span>}
          {board.source_filename && <span className="tag mono" style={{ fontSize: 11 }}>{board.source_filename}</span>}
          {isPanel && <span className="pill accent">{copies}-up</span>}
          <span className="pill ghost">{lines.length} lines · {num(totalParts)} parts</span>
          <span className={`pill ${matched === lines.length && lines.length > 0 ? 'ok' : 'low'}`}>{matched}/{lines.length} matched</span>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'info' ? 'on' : ''}`} onClick={() => setTab('info')}>Board info</button>
        <button className={`tab ${tab === 'bom' ? 'on' : ''}`} onClick={() => setTab('bom')}>Bill of materials</button>
        <button className={`tab ${tab === 'layout' ? 'on' : ''}`} onClick={() => setTab('layout')}>Board layout</button>
      </div>

      {tab === 'info' && <InfoTab board={board} ibom={ibom} matched={matched} totalParts={totalParts} />}
      {tab === 'bom' && <BomTab board={board} copies={copies} onChanged={reload} />}
      {tab === 'layout' && (
        <div>
          {ibom ? (
            <IBomViewer asset={ibom} inline showPlaced={false} />
          ) : (
            <div className="card">
              <p className="c-dim p-6 text-sm" style={{ lineHeight: 1.6 }}>
                No interactive BOM for this board. Upload a KiCad project zip that includes one to see the board layout.
                Generate it with the{' '}
                <a href="https://github.com/openscopeproject/InteractiveHtmlBom" target="_blank" rel="noreferrer" className="link">Interactive HTML BOM</a>{' '}
                KiCad plugin (its <span className="mono">bom/ibom.html</span> gets picked up automatically).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoTab({ board, ibom, matched, totalParts }: { board: Board; ibom: ProjectAsset | null; matched: number; totalParts: number }) {
  const lines = board.lines ?? []
  const [big, setBig] = useState(false)
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 320px) 1fr' }}>
      <div className="card" style={{ padding: 12 }}>
        <div style={{ aspectRatio: '4 / 3', borderRadius: 8, background: '#0b0e13', overflow: 'hidden' }}>
          {ibom ? (
            <button
              type="button"
              onClick={() => setBig(true)}
              title="Click to enlarge"
              style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in' }}
            >
              <BoardThumb assetId={ibom.id} kind={ibom.kind} />
            </button>
          ) : (
            <div className="grid place-items-center" style={{ height: '100%' }}><span className="c-faint text-sm">No render</span></div>
          )}
        </div>
      </div>
      {big && ibom && (
        <div className="overlay" onClick={() => setBig(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(90vw, 1000px)', height: 'min(85vh, 800px)', background: '#0b0e13', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}
          >
            <BoardThumb assetId={ibom.id} kind={ibom.kind} />
            <button
              className="icon-btn"
              onClick={() => setBig(false)}
              aria-label="Close"
              style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.4)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-h"><h2>Details</h2></div>
        <table className="tbl">
          <tbody>
            <Row k="Type" v={board.kind === 'panel' ? `Panel (${board.copies}-up)` : 'Board'} />
            <Row k="Revision" v={board.revision || '—'} />
            <Row k="Source file" v={board.source_filename || '—'} mono />
            <Row k="BOM lines" v={String(lines.length)} />
            <Row k="Total parts" v={num(totalParts)} />
            <Row k="Matched to inventory" v={`${matched} / ${lines.length}`} />
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <tr>
      <td className="c-dim" style={{ width: '42%' }}>{k}</td>
      <td className={`c-text ${mono ? 'mono' : ''}`} style={{ wordBreak: 'break-word' }}>{v}</td>
    </tr>
  )
}

function BomTab({ board, copies, onChanged }: { board: Board; copies: number; onChanged: () => void }) {
  const lines = board.lines ?? []
  const [editing, setEditing] = useState<BOMLine | 'new' | null>(null)

  const del = async (id: string) => {
    if (!confirm('Remove this BOM line?')) return
    await api.deleteBOMLine(id).catch(() => undefined)
    onChanged()
  }

  return (
    <section className="card" style={{ overflow: 'hidden' }}>
      <div className="card-h">
        <h2>Bill of materials</h2>
        <button className="btn sm primary" style={{ marginLeft: 'auto' }} onClick={() => setEditing('new')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
          Add part
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
      <table className="tbl">
        <thead>
          <tr>
            <th className="num" style={{ width: 52 }}>Qty</th>
            <th>References</th>
            <th>Value</th>
            <th>Footprint</th>
            <th>MPN</th>
            <th>Inventory</th>
            <th className="col-actions" style={{ width: 76 }}></th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr><td colSpan={7} className="c-faint" style={{ textAlign: 'center', padding: 20 }}>No parts yet. Add one, or upload a KiCad file.</td></tr>
          )}
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="num c-text">
                {l.quantity * copies}
                {copies > 1 && <span className="c-faint" style={{ fontSize: 10 }}> ({l.quantity}×{copies})</span>}
              </td>
              <td className="mono c-dim" style={{ fontSize: 12 }}><span className="cell-trunc" style={{ maxWidth: 180 }} title={l.refs}>{l.refs || '—'}</span></td>
              <td className="c-text"><span className="cell-trunc" title={l.value}>{l.value || <span className="c-faint">—</span>}</span></td>
              <td className="mono c-faint" style={{ fontSize: 11.5 }}><span className="cell-trunc" title={l.footprint}>{shortFootprint(l.footprint)}</span></td>
              <td className="mono c-faint" style={{ fontSize: 11.5 }}><span className="cell-trunc" style={{ maxWidth: 150 }} title={l.mpn}>{l.mpn || '—'}</span></td>
              <td>
                {l.part_id ? (
                  <span className="flex items-center gap-1" style={{ whiteSpace: 'nowrap' }}>
                    <Link to={`/parts/${l.part_id}`} className="pill ok">{l.part_name} ↗</Link>
                    <span className="c-faint" style={{ fontSize: 10 }} title={`matched by ${matchLabel(l.match_kind)}`}>{matchLabel(l.match_kind)}</span>
                  </span>
                ) : (
                  <button className="pill low" style={{ whiteSpace: 'nowrap', cursor: 'pointer', border: 'none' }} onClick={() => setEditing(l)} title="Pick a part">
                    no match · pick
                  </button>
                )}
              </td>
              <td className="col-actions">
                <div className="flex items-center gap-1 justify-end">
                  <button className="icon-btn sm" title="Edit" onClick={() => setEditing(l)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button className="icon-btn sm" title="Delete" onClick={() => del(l.id)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {editing && (
        <LineModal
          boardID={board.id}
          line={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged() }}
        />
      )}
    </section>
  )
}

function LineModal({ boardID, line, onClose, onSaved }: { boardID: string; line: BOMLine | null; onClose: () => void; onSaved: () => void }) {
  const [refs, setRefs] = useState(line?.refs ?? '')
  const [quantity, setQuantity] = useState(String(line?.quantity ?? 1))
  const [value, setValue] = useState(line?.value ?? '')
  const [footprint, setFootprint] = useState(line?.footprint ?? '')
  const [mpn, setMpn] = useState(line?.mpn ?? '')
  const [manufacturer, setManufacturer] = useState(line?.manufacturer ?? '')
  const [supplierSku, setSupplierSku] = useState(line?.supplier_sku ?? '')
  const [ipn, setIpn] = useState(line?.ipn ?? '')
  // Inventory match: null = auto-resolve; otherwise pinned to this part.
  const [pinned, setPinned] = useState<{ id: string; name: string } | null>(
    line && line.match_kind === 'manual' && line.part_id ? { id: line.part_id, name: line.part_name ?? 'part' } : null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    const body: BOMLineInput = {
      refs: refs.trim(),
      quantity: parseInt(quantity, 10) || 1,
      value: value.trim(),
      footprint: footprint.trim(),
      mpn: mpn.trim(),
      manufacturer: manufacturer.trim(),
      supplier_sku: supplierSku.trim(),
      ipn: ipn.trim(),
    }
    // Pinned → manual match; otherwise leave part_id off so the server re-resolves.
    if (pinned) body.part_id = pinned.id
    try {
      if (line) await api.updateBOMLine(line.id, body)
      else await api.addBOMLine(boardID, body)
      onSaved()
    } catch {
      setError('Could not save line')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{line ? 'Edit part' : 'Add part'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="modal-b space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <label className="fieldlabel" style={{ gridColumn: 'span 2' }}><span>References</span>
              <input className="input mono" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="R1, R2" />
            </label>
            <label className="fieldlabel"><span>Qty</span>
              <input type="number" min={1} className="input" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="fieldlabel"><span>Value</span>
              <input className="input" value={value} autoFocus onChange={(e) => setValue(e.target.value)} placeholder="10k" />
            </label>
            <label className="fieldlabel"><span>Footprint</span>
              <input className="input mono" value={footprint} onChange={(e) => setFootprint(e.target.value)} placeholder="0603" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="fieldlabel"><span>MPN</span>
              <input className="input mono" value={mpn} onChange={(e) => setMpn(e.target.value)} placeholder="Manufacturer part no." />
            </label>
            <label className="fieldlabel"><span>Manufacturer</span>
              <input className="input" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Yageo" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="fieldlabel"><span>Supplier SKU</span>
              <input className="input mono" value={supplierSku} onChange={(e) => setSupplierSku(e.target.value)} placeholder="LCSC / Digi-Key…" />
            </label>
            <label className="fieldlabel"><span>FireBin PN</span>
              <input className="input mono" value={ipn} onChange={(e) => setIpn(e.target.value)} placeholder="FB-…" />
            </label>
          </div>

          <div>
            <span className="eyebrow">Inventory match</span>
            {pinned ? (
              <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                <span className="pill ok">{pinned.name}</span>
                <span className="c-faint" style={{ fontSize: 12 }}>pinned manually</span>
                <button type="button" className="link" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={() => setPinned(null)}>
                  use auto-match
                </button>
              </div>
            ) : (
              <>
                <p className="c-faint" style={{ fontSize: 12, marginTop: 4 }}>
                  Auto: FireBin PN → MPN → supplier SKU → value + footprint. Or pin a specific part:
                </p>
                <PartPicker onPick={(p) => setPinned(p)} />
              </>
            )}
          </div>

          {error && <p className="c-crit text-sm">{error}</p>}
        </div>
        <div className="modal-f">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={save} disabled={busy} className="btn primary">{busy ? '…' : line ? 'Save' : 'Add part'}</button>
        </div>
      </div>
    </div>
  )
}

// PartPicker is a small search-and-select used to pin a BOM line to a specific
// inventory part (a manual substitution / override).
function PartPicker({ onPick }: { onPick: (p: { id: string; name: string }) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const s = q.trim()
    if (!s) { setResults([]); return }
    let live = true
    const t = setTimeout(() => {
      api.listParts({ search: s, topLevel: false })
        .then((ps) => { if (live) { setResults(ps.slice(0, 8).map((p) => ({ id: p.id, name: p.name }))); setOpen(true) } })
        .catch(() => { if (live) setResults([]) })
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  return (
    <div style={{ marginTop: 6 }}>
      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Search inventory…"
      />
      {open && results.length > 0 && (
        <div
          style={{
            marginTop: 4, border: '1px solid var(--border)', borderRadius: 8,
            overflow: 'hidden', maxHeight: 180, overflowY: 'auto',
          }}
        >
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPick(p); setOpen(false); setQ('') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--panel-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function shortFootprint(fp: string): string {
  if (!fp) return '—'
  const i = fp.indexOf(':')
  return i >= 0 ? fp.slice(i + 1) : fp
}

// matchLabel names how a BOM line resolved to inventory (shown beside the pill).
function matchLabel(kind: BOMLine['match_kind']): string {
  switch (kind) {
    case 'fbpn': return 'FireBin PN'
    case 'mpn': return 'MPN'
    case 'supplier': return 'supplier SKU'
    case 'value_footprint': return 'value + footprint'
    case 'manual': return 'manual'
    default: return ''
  }
}
