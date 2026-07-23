// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api, type Board, type BOMLine, type BOMLineInput, type PickEntry, type PickList, type Project, type ProjectAsset } from '../lib/api'
import { useRealtime } from '../lib/useRealtime'
import { num } from '../lib/format'
import { IBomViewer } from '../components/IBomViewer'
import { BoardThumb } from '../components/BoardThumb'
import { AssetThumb, ImageViewer } from '../components/AssetImage'
import { PartPicker } from '../components/PartPicker'

type Tab = 'info' | 'bom' | 'layout' | 'assemble'

export function BoardDetailPage() {
  const { projectId = '', boardId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [board, setBoard] = useState<Board | null>(null)
  const [assets, setAssets] = useState<ProjectAsset[]>([])
  const [notFound, setNotFound] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('tab')
  const tab: Tab = raw === 'bom' || raw === 'layout' || raw === 'assemble' ? raw : 'info'
  const setTab = (t: Tab) => setSearchParams(t === 'info' ? {} : { tab: t })

  const reload = useCallback(() => {
    api.getBoard(boardId).then(setBoard).catch(() => setNotFound(true))
  }, [boardId])

  const reloadAssets = useCallback(() => {
    api
      .listProjectAssets(projectId)
      .then((as) => setAssets(as.filter((a) => a.board_id === boardId)))
      .catch(() => undefined)
  }, [projectId, boardId])

  useEffect(() => {
    reload()
    api.getProject(projectId).then(setProject).catch(() => undefined)
    reloadAssets()
  }, [projectId, boardId, reload, reloadAssets])

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

  // Board files: a real iBOM (if any) drives the layout; else the generated
  // render. Images are extra renders/previews. pcbrender is internal (not shown).
  const ibomAsset = assets.find((a) => a.kind === 'ibom') ?? null
  const layoutAsset = ibomAsset ?? assets.find((a) => a.kind === 'pcbrender') ?? null
  const images = assets.filter((a) => a.kind === 'image')

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
        <button className={`tab ${tab === 'assemble' ? 'on' : ''}`} onClick={() => setTab('assemble')}>Assemble</button>
      </div>

      {tab === 'info' && (
        <InfoTab
          board={board}
          boardID={boardId}
          layoutAsset={layoutAsset}
          ibomAsset={ibomAsset}
          images={images}
          matched={matched}
          totalParts={totalParts}
          onChanged={reloadAssets}
        />
      )}
      {tab === 'bom' && <BomTab board={board} copies={copies} onChanged={reload} />}
      {tab === 'layout' && <LayoutTab asset={layoutAsset} onGoToFiles={() => setTab('info')} />}
      {tab === 'assemble' && <AssembleTab boardID={boardId} board={board} onGoToBom={() => setTab('bom')} />}
    </div>
  )
}

function InfoTab({
  board, boardID, layoutAsset, ibomAsset, images, matched, totalParts, onChanged,
}: {
  board: Board
  boardID: string
  layoutAsset: ProjectAsset | null
  ibomAsset: ProjectAsset | null
  images: ProjectAsset[]
  matched: number
  totalParts: number
  onChanged: () => void
}) {
  const lines = board.lines ?? []
  const [big, setBig] = useState(false)
  const [viewImage, setViewImage] = useState<ProjectAsset | null>(null)
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 320px) 1fr' }}>
      <div className="card" style={{ padding: 12 }}>
        <div style={{ aspectRatio: '4 / 3', borderRadius: 8, background: '#0b0e13', overflow: 'hidden' }}>
          {layoutAsset ? (
            <button
              type="button"
              onClick={() => setBig(true)}
              title="Click to enlarge"
              style={{ display: 'block', width: '100%', height: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in' }}
            >
              <BoardThumb assetId={layoutAsset.id} kind={layoutAsset.kind} />
            </button>
          ) : (
            <div className="grid place-items-center" style={{ height: '100%' }}><span className="c-faint text-sm">No render</span></div>
          )}
        </div>
      </div>
      {big && layoutAsset && (
        <div className="overlay" onClick={() => setBig(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(90vw, 1000px)', height: 'min(85vh, 800px)', background: '#0b0e13', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', position: 'relative' }}
          >
            <BoardThumb assetId={layoutAsset.id} kind={layoutAsset.kind} />
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

      <div style={{ gridColumn: '1 / -1' }}>
        <FilesCard boardID={boardID} ibom={ibomAsset} images={images} onChanged={onChanged} onView={setViewImage} />
      </div>
      {viewImage && <ImageViewer asset={viewImage} onClose={() => setViewImage(null)} />}
    </div>
  )
}

// FilesCard is the single place to manage a board's files: upload an interactive
// BOM (drives the layout) or images, and delete any of them.
function FilesCard({
  boardID, ibom, images, onChanged, onView,
}: {
  boardID: string
  ibom: ProjectAsset | null
  images: ProjectAsset[]
  onChanged: () => void
  onView: (a: ProjectAsset) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (files: File[]) => {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      for (const f of files) await api.uploadBoardAsset(boardID, f)
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not upload that file')
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (busy) return
    upload(Array.from(e.dataTransfer.files))
  }

  const del = async (a: ProjectAsset) => {
    const isIbom = a.kind === 'ibom'
    const msg = isIbom
      ? 'Delete this interactive BOM? The board layout reverts to the render FireBin generated on upload.'
      : `Delete "${a.name}"?`
    if (!confirm(msg)) return
    await api.deleteAsset(a.id).catch(() => undefined)
    onChanged()
  }

  const empty = !ibom && images.length === 0

  return (
    <div
      className="card"
      style={{ position: 'relative', outline: dragging ? '2px dashed var(--accent)' : 'none', outlineOffset: -2 }}
      onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
      onDrop={onDrop}
    >
      <div className="card-h">
        <h2>Files</h2>
        <button className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => inputRef.current?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4M7 9l5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".html,.htm,.png,.jpg,.jpeg,.gif,.webp,.svg,.bmp"
          hidden
          onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = '' }}
        />
      </div>
      {error && <p className="c-crit text-sm" style={{ padding: '0 12px' }}>{error}</p>}
      {empty ? (
        <p className="c-faint text-sm" style={{ padding: 16, lineHeight: 1.6 }}>
          No files yet. Drag files here or use Upload: an interactive BOM (<span className="mono">.html</span> from the{' '}
          <a href="https://github.com/openscopeproject/InteractiveHtmlBom" target="_blank" rel="noreferrer" className="link">Interactive HTML BOM</a>{' '}
          plugin) to drive the board layout, or images (renders, photos).
        </p>
      ) : (
        <div className="tiles" style={{ padding: 12 }}>
          {ibom && (
            <FileTile label="Interactive BOM" sub="drives the board layout" onDelete={() => del(ibom)}>
              <BoardThumb assetId={ibom.id} kind={ibom.kind} />
            </FileTile>
          )}
          {images.map((a) => (
            <FileTile key={a.id} label={a.name} onOpen={() => onView(a)} onDelete={() => del(a)}>
              <AssetThumb asset={a} />
            </FileTile>
          ))}
        </div>
      )}
      {dragging && (
        <div
          className="grid place-items-center"
          style={{ position: 'absolute', inset: 0, borderRadius: 12, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', zIndex: 3 }}
        >
          <span className="c-text text-sm" style={{ fontWeight: 600 }}>Drop files to upload</span>
        </div>
      )}
    </div>
  )
}

// FileTile is a file thumbnail with a hover delete button (and optional open).
function FileTile({ label, sub, onOpen, onDelete, children }: { label: string; sub?: string; onOpen?: () => void; onDelete: () => void; children: ReactNode }) {
  return (
    <div className="tile" style={{ position: 'relative', cursor: onOpen ? 'pointer' : 'default' }}>
      <button
        className="icon-btn sm"
        title="Delete"
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, background: 'rgba(0,0,0,0.5)' }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
      </button>
      <div className="tile-art" onClick={onOpen}>{children}</div>
      <div className="tile-name truncate" onClick={onOpen}>{label}</div>
      {sub && <div className="tile-sub"><span className="c-faint" style={{ fontSize: 11 }}>{sub}</span></div>}
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

// LayoutTab shows the board layout: the uploaded iBOM when present, else the
// render FireBin generated on upload. Files are managed on the Board info tab.
function LayoutTab({ asset, onGoToFiles }: { asset: ProjectAsset | null; onGoToFiles: () => void }) {
  if (asset) return <IBomViewer key={asset.id} asset={asset} inline showPlaced={false} />
  return (
    <div className="card">
      <p className="c-dim p-6 text-sm" style={{ lineHeight: 1.6 }}>
        No board layout yet. Add an interactive BOM on the{' '}
        <button className="link" onClick={onGoToFiles} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Board info</button>{' '}
        tab (upload the <span className="mono">bom/ibom.html</span> from the{' '}
        <a href="https://github.com/openscopeproject/InteractiveHtmlBom" target="_blank" rel="noreferrer" className="link">Interactive HTML BOM</a>{' '}
        plugin), or upload a KiCad board so FireBin can render its own layout.
      </p>
    </div>
  )
}

const pickedKey = (boardID: string) => `firebin.picked.${boardID}`
const entryKey = (e: PickEntry) => `${e.stock_item_id}:${e.part_id}`
const qtyFmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

// AssembleTab turns a build quantity into a pick list: what to pull from which
// bin (walk order), with shortfalls and unpickable (unmatched) lines, plus a
// print view and check-off tracking.
function AssembleTab({ boardID, board, onGoToBom }: { boardID: string; board: Board; onGoToBom: () => void }) {
  const [qty, setQty] = useState(1)
  const [pick, setPick] = useState<PickList | null>(null)
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(pickedKey(boardID)) || '[]')
      if (Array.isArray(s)) setPicked(new Set(s))
    } catch { /* ignore */ }
  }, [boardID])

  useEffect(() => {
    let live = true
    setLoading(true)
    const t = setTimeout(() => {
      api.getPickList(boardID, qty)
        .then((p) => { if (live) setPick(p) })
        .catch(() => { if (live) setPick(null) })
        .finally(() => { if (live) setLoading(false) })
    }, 150)
    return () => { live = false; clearTimeout(t) }
  }, [boardID, qty])

  const toggle = (k: string) => setPicked((prev) => {
    const n = new Set(prev)
    n.has(k) ? n.delete(k) : n.add(k)
    try { localStorage.setItem(pickedKey(boardID), JSON.stringify([...n])) } catch { /* ignore */ }
    return n
  })

  const groups = useMemo(() => {
    const m = new Map<string, PickEntry[]>()
    for (const e of pick?.entries ?? []) {
      const loc = e.location_name || 'No bin'
      const arr = m.get(loc) ?? []
      arr.push(e)
      m.set(loc, arr)
    }
    return [...m.entries()]
  }, [pick])

  const entries = pick?.entries ?? []
  const done = entries.filter((e) => picked.has(entryKey(e))).length

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr', maxWidth: 760 }}>
      <div className="card">
        <div className="card-h" style={{ gap: 12 }}>
          <h2>Assemble</h2>
          <label className="flex items-center gap-2 text-sm c-dim" style={{ marginLeft: 'auto' }}>
            Build
            <input
              type="number"
              min={1}
              className="input"
              style={{ width: 72 }}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
            {board.kind === 'panel' ? `panels (${board.copies}-up)` : 'boards'}
          </label>
          <button className="btn sm" disabled={!pick || entries.length === 0} onClick={() => pick && printPickList(pick)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" /></svg>
            Print
          </button>
        </div>
        <div className="c-dim text-sm" style={{ padding: '10px 14px' }}>
          {loading && !pick ? 'Calculating…' : pick ? (
            <>
              {qtyFmt(pick.total_units)} parts to pick across {entries.length} bin pulls
              {board.kind === 'panel' && <> · {qty}×{board.copies} = {qty * board.copies} boards</>}
              {' · '}<span className={done === entries.length && entries.length > 0 ? 'c-ok' : ''}>{done}/{entries.length} picked</span>
            </>
          ) : 'Could not calculate the pick list.'}
        </div>
      </div>

      {pick && pick.shortfalls.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--crit)' }}>
          <div className="card-h"><h2 className="c-crit">Short of stock</h2></div>
          <table className="tbl">
            <tbody>
              {pick.shortfalls.map((s) => (
                <tr key={s.part_id}>
                  <td className="c-text"><Link to={`/parts/${s.part_id}`} className="link">{s.part_name}</Link></td>
                  <td className="num c-dim">need {qtyFmt(s.required)}</td>
                  <td className="num c-dim">have {qtyFmt(s.available)}</td>
                  <td className="num c-crit">short {qtyFmt(s.short)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pick && entries.length > 0 ? (
        <div className="card">
          <div className="card-h"><h2>Pick list</h2><span className="c-faint text-sm" style={{ marginLeft: 'auto' }}>walk order by bin</span></div>
          {groups.map(([loc, es]) => (
            <div key={loc}>
              <div className="eyebrow" style={{ padding: '10px 14px 4px' }}>{loc}</div>
              <table className="tbl">
                <tbody>
                  {es.map((e) => {
                    const k = entryKey(e)
                    const on = picked.has(k)
                    return (
                      <tr key={k} className={on ? 'placed' : ''} style={{ cursor: 'pointer' }} onClick={() => toggle(k)}>
                        <td style={{ width: 34 }} onClick={(ev) => ev.stopPropagation()}>
                          <input type="checkbox" checked={on} onChange={() => toggle(k)} aria-label={`Picked ${e.part_name}`} />
                        </td>
                        <td className="num c-text" style={{ width: 60, fontWeight: 600 }}>{qtyFmt(e.quantity)}×</td>
                        <td className="c-text" style={{ textDecoration: on ? 'line-through' : 'none', opacity: on ? 0.55 : 1 }}>
                          <Link to={`/parts/${e.part_id}`} className="link" onClick={(ev) => ev.stopPropagation()}>{e.part_name}</Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : !loading && pick && entries.length === 0 && (
        <div className="card">
          <p className="c-dim p-6 text-sm" style={{ lineHeight: 1.6 }}>
            Nothing to pick. {pick.unmatched.length > 0
              ? <>None of the BOM lines are matched to stocked parts yet; match them on the <button className="link" onClick={onGoToBom} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Bill of materials</button> tab.</>
              : 'This board has no BOM lines.'}
          </p>
        </div>
      )}

      {pick && pick.unmatched.length > 0 && (
        <div className="card">
          <div className="card-h"><h2>Not picked <span className="c-faint" style={{ fontWeight: 400, fontSize: 13 }}>(no inventory match)</span></h2></div>
          <table className="tbl">
            <tbody>
              {pick.unmatched.map((u, i) => (
                <tr key={i}>
                  <td className="num c-dim" style={{ width: 60 }}>{u.quantity}×</td>
                  <td className="c-text">{u.value || <span className="c-faint">—</span>}</td>
                  <td className="mono c-faint" style={{ fontSize: 12 }}>{u.refs}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="c-faint text-sm" style={{ padding: '0 14px 12px' }}>
            Match these on the <button className="link" onClick={onGoToBom} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Bill of materials</button> tab to include them.
          </p>
        </div>
      )}
    </div>
  )
}

// printPickList opens a clean, print-friendly pick list in a new window.
function printPickList(pick: PickList) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
  const byLoc = new Map<string, PickEntry[]>()
  for (const e of pick.entries) {
    const loc = e.location_name || 'No bin'
    const arr = byLoc.get(loc) ?? []
    arr.push(e)
    byLoc.set(loc, arr)
  }
  const rows = [...byLoc.entries()].map(([loc, es]) => `
    <tr class="loc"><td colspan="3">${esc(loc)}</td></tr>
    ${es.map((e) => `<tr><td class="chk">☐</td><td class="qty">${qtyFmt(e.quantity)}×</td><td>${esc(e.part_name)}</td></tr>`).join('')}
  `).join('')
  const short = pick.shortfalls.length === 0 ? '' : `
    <h2 class="short">Short of stock</h2>
    <table>${pick.shortfalls.map((s) => `<tr><td>${esc(s.part_name)}</td><td class="qty">need ${qtyFmt(s.required)}</td><td class="qty">have ${qtyFmt(s.available)}</td><td class="qty">short ${qtyFmt(s.short)}</td></tr>`).join('')}</table>`
  const unmatched = pick.unmatched.length === 0 ? '' : `
    <h2>Not picked (no inventory match)</h2>
    <table>${pick.unmatched.map((u) => `<tr><td class="qty">${u.quantity}×</td><td>${esc(u.value)}</td><td class="refs">${esc(u.refs)}</td></tr>`).join('')}</table>`
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pick list — ${esc(pick.board_name)}</title>
    <style>
      @page { size: letter; margin: 16mm; }
      body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #111; }
      h1 { font-size: 20px; margin: 0 0 2px; }
      .sub { color: #555; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      td { padding: 5px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
      tr.loc td { background: #f2f2f2; font-weight: 700; border-bottom: 1px solid #bbb; }
      .chk { width: 22px; font-size: 15px; }
      .qty { width: 64px; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
      .refs { color: #666; font-family: ui-monospace, monospace; font-size: 11px; }
      h2 { font-size: 14px; margin: 18px 0 6px; }
      h2.short { color: #b00; }
    </style></head><body>
    <h1>Pick list — ${esc(pick.board_name)}</h1>
    <p class="sub">Build ${pick.quantity}${pick.copies > 1 ? ` panel(s), ${pick.copies}-up` : ' board(s)'} · ${qtyFmt(pick.total_units)} parts</p>
    <table>${rows || '<tr><td>Nothing to pick.</td></tr>'}</table>
    ${short}${unmatched}
    </body></html>`
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 250)
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
  // Inventory match: null = auto-resolve; otherwise pinned to this part (a
  // project match rule, or a per-line manual pin).
  const [pinned, setPinned] = useState<{ id: string; name: string } | null>(
    line && (line.match_kind === 'project' || line.match_kind === 'manual') && line.part_id
      ? { id: line.part_id, name: line.part_name ?? 'part' }
      : null,
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
                <span className="c-faint" style={{ fontSize: 12 }}>pinned for this project</span>
                <button type="button" className="link" style={{ fontSize: 12, marginLeft: 'auto' }} onClick={() => setPinned(null)}>
                  use auto-match
                </button>
              </div>
            ) : (
              <>
                <p className="c-faint" style={{ fontSize: 12, marginTop: 4 }}>
                  Auto: FireBin PN → project rule → MPN → supplier SKU → value + footprint. Pinning a part applies to every board in this project:
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

function shortFootprint(fp: string): string {
  if (!fp) return '—'
  const i = fp.indexOf(':')
  return i >= 0 ? fp.slice(i + 1) : fp
}

// matchLabel names how a BOM line resolved to inventory (shown beside the pill).
function matchLabel(kind: BOMLine['match_kind']): string {
  switch (kind) {
    case 'fbpn': return 'FireBin PN'
    case 'project': return 'project match'
    case 'mpn': return 'MPN'
    case 'supplier': return 'supplier SKU'
    case 'value_footprint': return 'value + footprint'
    case 'manual': return 'manual'
    default: return ''
  }
}
