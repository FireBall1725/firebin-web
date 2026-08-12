// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The datasheet library: every stored PDF in one place.
//
// Laid out like PartsPage — sticky rail plus a content column — because it
// answers the same kind of question and should not need learning twice.
//
// A table rather than a grid of covers. Nothing in the pure-Go backend
// rasterizes a PDF, so there is no page thumbnail to show; a grid of identical
// file icons would be a worse list, not a prettier one. The page-count badge on
// the icon carries the size cue instead.
//
// Unlinked documents stay in THIS table, tinted, rather than moving to a
// separate inbox. A loose upload is a staging state, not a mistake, and putting
// it in its own list would make it feel like one; the rail's Unlinked count is
// the nudge.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Category, type Datasheet, type DatasheetStats } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { useRealtime } from '../lib/useRealtime'
import { usePageSize, setPageSize } from '../lib/prefs'
import { Pager } from '../components/Pager'
import { PartPicker } from '../components/PartPicker'
import { DatasheetViewer } from '../components/DatasheetViewer'
import { icon } from '../lib/icons'
import {
  mdiDelete,
  mdiDownload,
  mdiFilePdfBox,
  mdiLinkVariant,
  mdiMagnify,
  mdiUpload,
} from '@mdi/js'

/** Bucket is the rail selection. Categories are a fourth, keyed by id. */
type Bucket = 'all' | 'unlinked' | 'mirror'

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** Text extraction state, said in words the reader can act on. `no_text_layer`
 *  is a scan, which is normal for a mechanical drawing and not a failure. */
function TextStatus({ d }: { d: Datasheet }) {
  switch (d.text_status) {
    case 'ok':
      return <span className="pill ok">readable</span>
    case 'no_text_layer':
      return <span className="pill warn" title="A scan with no text layer, so the assistant cannot read it">image-only</span>
    case 'failed':
      return <span className="pill low" title="Text extraction failed for this document">unreadable</span>
    default:
      return <span className="pill ghost">reading…</span>
  }
}

export function DatasheetsPage() {
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const pageSize = usePageSize()

  const [sheets, setSheets] = useState<Datasheet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stats, setStats] = useState<DatasheetStats | null>(null)
  const [bucket, setBucket] = useState<Bucket>('all')
  const [category, setCategory] = useState<string | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<Datasheet | null>(null)
  const [linking, setLinking] = useState<Datasheet | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api
      .listDatasheets({
        search: search || undefined,
        category,
        unlinked: bucket === 'unlinked' || undefined,
      })
      .then(setSheets)
      .catch(() => setSheets([]))
      .finally(() => setLoading(false))
    api.datasheetStats().then(setStats).catch(() => undefined)
  }, [search, category, bucket])

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  useRealtime(['datasheets'], load)

  // Any filter change starts again at page one; staying on page 4 of a list that
  // just became three rows long shows an empty table for no visible reason.
  useEffect(() => {
    setPage(1)
  }, [search, category, bucket, pageSize])

  const totalPages = Math.max(1, Math.ceil(sheets.length / pageSize))
  const pageNo = Math.min(page, totalPages)
  useEffect(() => {
    if (page !== pageNo) setPage(pageNo)
  }, [page, pageNo])
  const shown = useMemo(
    () => sheets.slice((pageNo - 1) * pageSize, pageNo * pageSize),
    [sheets, pageNo, pageSize],
  )

  const pickBucket = (b: Bucket) => {
    setBucket(b)
    setCategory(undefined)
  }
  const pickCategory = (id: string) => {
    setCategory(id)
    setBucket('all')
  }

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (list.length === 0) {
      setMsg('Only PDFs can be added to the library.')
      return
    }
    setBusy(true)
    setMsg(`Uploading ${list.length} file${list.length > 1 ? 's' : ''}…`)
    let ok = 0
    for (const f of list) {
      try {
        await api.uploadDatasheet(f)
        ok++
      } catch (e) {
        setMsg(e instanceof Error ? e.message : `Could not upload ${f.name}`)
      }
    }
    setBusy(false)
    if (ok === list.length) setMsg(`Added ${ok} datasheet${ok > 1 ? 's' : ''}. Link them to a part whenever you like.`)
    load()
  }

  // Mirroring the backlog is one click that can pull hundreds of PDFs onto the
  // volume, so it confirms with the count first. This is the same reason
  // auto-mirror ships off: the download should be a decision, not a side effect.
  const mirrorMissing = async () => {
    const n = stats?.mirror_candidates ?? 0
    if (n === 0) return
    if (!confirm(`Download a copy of ${n} datasheet${n > 1 ? 's' : ''}?\n\nThey are fetched from the vendor links already on those parts, and land on the attachments volume. Datasheets are often 1-20 MB each, and some will be in languages you may not want.`)) {
      return
    }
    setBusy(true)
    try {
      const { task_id, targets } = await api.bulkMirrorDatasheets()
      if (!task_id) {
        setMsg('Nothing to download; every part with a link already has its copy.')
        setBusy(false)
        return
      }
      setMsg(`Downloading ${targets} datasheets…`)
      for (let i = 0; i < 900; i++) {
        await new Promise((r) => setTimeout(r, 600))
        const t = await api.getTask(task_id)
        setMsg(`Downloading datasheets… ${t.progress_done ?? 0}/${t.progress_total ?? targets}`)
        if (t.status === 'completed') {
          const res = (t.result ?? {}) as { stored?: number; skipped?: number }
          setMsg(`Downloaded ${res.stored ?? 0}, skipped ${res.skipped ?? 0}. Skipped ones are usually dead links.`)
          break
        }
        if (t.status === 'failed' || t.status === 'cancelled') {
          setMsg('The download stopped. See Settings → Activity for the log.')
          break
        }
      }
    } catch {
      setMsg('Could not start the download.')
    }
    setBusy(false)
    load()
  }

  const remove = async (d: Datasheet) => {
    if (!confirm(`Delete ${d.title || d.filename}?\n\nThe PDF and its extracted text are removed from the server.`)) return
    try {
      await api.deleteDatasheet(d.id)
      load()
    } catch {
      setMsg('Could not delete that datasheet.')
    }
  }

  const linkTo = async (partID: string) => {
    if (!linking) return
    try {
      await api.linkDatasheetPart(linking.id, partID)
      setLinking(null)
      load()
    } catch {
      setMsg('Could not link that datasheet.')
    }
  }

  const emptyText = search || category || bucket !== 'all'
    ? 'No datasheets match this filter.'
    : 'No datasheets yet. Upload a PDF, or save a copy from a part that already has a datasheet link.'

  return (
    <section
      onDragOver={(e) => {
        if (!canWrite) return
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!canWrite) return
        e.preventDefault()
        setDragging(false)
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files)
      }}
    >
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>Datasheets</h1>
          {stats && (
            <div className="c-faint mono" style={{ fontSize: 12, marginTop: 2 }}>
              {stats.count} document{stats.count === 1 ? '' : 's'} · {prettyBytes(stats.total_bytes)} on disk
            </div>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
          {canWrite && !!stats?.mirror_candidates && (
            <button className="btn" onClick={mirrorMissing} disabled={busy} title="Download a copy for every part that has a datasheet link but no stored file">
              {icon(mdiDownload)}
              Mirror missing ({stats.mirror_candidates})
            </button>
          )}
          {canWrite && (
            <label className="btn primary" style={{ cursor: 'pointer' }}>
              {icon(mdiUpload)}
              Upload
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files
                  if (f?.length) void upload(f)
                  e.target.value = ''
                }}
              />
            </label>
          )}
        </div>
      </div>

      {msg && (
        <div className="banner" style={{ marginBottom: 12, fontSize: 13 }}>
          {msg}
          <button className="link" style={{ marginLeft: 10, fontSize: 12 }} onClick={() => setMsg(null)}>dismiss</button>
        </div>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0,200px) 1fr' }}>
        <aside className="card self-start" style={{ position: 'sticky', top: 84, paddingBottom: 6 }}>
          <div className="card-h"><h2>Filter</h2></div>
          <button onClick={() => pickBucket('all')} className={`cat ${bucket === 'all' && !category ? 'on' : ''}`}>
            <span>All datasheets</span>
            {!!stats && <span className="cat-count">{stats.count}</span>}
          </button>
          <button onClick={() => pickBucket('unlinked')} className={`cat ${bucket === 'unlinked' ? 'on' : ''}`} title="Documents not linked to a part yet">
            <span>Unlinked</span>
            {!!stats?.unlinked && <span className="cat-count">{stats.unlinked}</span>}
          </button>
          {!!stats?.mirror_candidates && (
            <button onClick={mirrorMissing} className="cat" disabled={busy} title="Parts with a datasheet link but no stored copy">
              <span>Needs mirroring</span>
              <span className="cat-count">{stats.mirror_candidates}</span>
            </button>
          )}
          {/* Only when there is something under it: a lone heading over empty
              space reads as a list that failed to load. */}
          {categories.length > 0 && (
            <>
              <div className="ds-rail-sep" />
              <div className="ds-rail-lbl">By category</div>
              {categories.map((c) => (
                <button key={c.id} onClick={() => pickCategory(c.id)} className={`cat ${category === c.id ? 'on' : ''}`}>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </>
          )}
        </aside>

        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <div className="search" style={{ marginLeft: 0, flex: 1, maxWidth: 'none' }}>
              {icon(mdiMagnify)}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, filename, part, or MPN…" />
            </div>
          </div>

          {loading ? (
            <div className="card"><p className="c-faint" style={{ textAlign: 'center', padding: 40 }}>Loading…</p></div>
          ) : sheets.length === 0 ? (
            <div className="card"><p className="c-faint" style={{ textAlign: 'center', padding: 40 }}>{emptyText}</p></div>
          ) : (
            <div className="card">
              <div className="ds-tblwrap">
                <table className="ds-table">
                  {/* Fixed layout needs declared widths; Document is the one
                      column with none, so it absorbs whatever is left. */}
                  <colgroup>
                    <col />
                    <col className="ds-c-linked" />
                    <col className="ds-c-size" />
                    <col className="ds-c-source" />
                    <col className="ds-c-ai" />
                    <col className="ds-c-act" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Document</th>
                      <th>Linked to</th>
                      {/* No Pages column: the count already rides on the file
                          icon, and a second copy cost the width that pushed the
                          Link-to-part button off the card. */}
                      <th style={{ textAlign: 'right' }}>Size</th>
                      <th>Source</th>
                      <th>Assistant</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((d) => {
                      const unlinked = d.parts.length === 0
                      return (
                        <tr key={d.id} className={unlinked ? 'ds-unlinked' : ''} onClick={() => setViewing(d)}>
                          <td>
                            <div className="ds-fcell">
                              <span className={`ds-fico ${unlinked ? 'loose' : ''}`}>
                                {icon(mdiFilePdfBox, { size: 17 })}
                                {!!d.page_count && <span className="ds-pgs">{d.page_count}</span>}
                              </span>
                              <span className="min-w-0">
                                <span className="ds-ftitle">{d.title || d.filename}</span>
                                <span className="ds-fname mono">{d.filename}</span>
                              </span>
                            </div>
                          </td>
                          <td>
                            {unlinked ? (
                              <span className="ds-loose-note">not linked to a part</span>
                            ) : (
                              <span className="ds-chips">
                                {d.parts.slice(0, 2).map((p) => (
                                  <button
                                    key={p.part_id}
                                    className="pchip"
                                    title={`Open ${p.part_name}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigate(`/parts/${p.part_id}`)
                                    }}
                                  >
                                    {p.mpn || p.part_name}
                                  </button>
                                ))}
                                {d.parts.length > 2 && <span className="c-faint" style={{ fontSize: 11 }}>+{d.parts.length - 2}</span>}
                              </span>
                            )}
                          </td>
                          <td className="ds-num">{prettyBytes(d.size_bytes)}</td>
                          <td>
                            <span className="tag">{d.origin === 'mirror' ? 'Mirrored' : 'Upload'}</span>
                            {d.language && d.language !== 'en' && (
                              <span className="tag ds-lang" style={{ marginLeft: 4 }}>{d.language.toUpperCase()}</span>
                            )}
                          </td>
                          <td><TextStatus d={d} /></td>
                          <td>
                            <div className="ds-rowacts" onClick={(e) => e.stopPropagation()}>
                              {canWrite && unlinked ? (
                                <button className="btn sm ds-link-btn" onClick={() => setLinking(d)}>Link to part</button>
                              ) : canWrite ? (
                                <button className="ds-iact" title="Link another part" aria-label="Link another part" onClick={() => setLinking(d)}>
                                  {icon(mdiLinkVariant, { size: 15 })}
                                </button>
                              ) : null}
                              {canWrite && (
                                <button className="ds-iact danger" title="Delete" aria-label="Delete" onClick={() => remove(d)}>
                                  {icon(mdiDelete, { size: 15 })}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {canWrite && (
                <div className={`ds-drop ${dragging ? 'on' : ''}`}>
                  Drop a PDF here to add it. <b>Unlinked is fine</b> — link it to a part whenever you like.
                </div>
              )}

              <Pager
                page={pageNo}
                totalPages={totalPages}
                total={sheets.length}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
                noun="documents"
              />
            </div>
          )}
        </div>
      </div>

      {viewing && <DatasheetViewer datasheet={viewing} onClose={() => setViewing(null)} />}

      {linking && (
        <div className="overlay" onClick={() => setLinking(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Link {linking.title || linking.filename}</h3></div>
            <div className="modal-b">
              <p className="c-faint" style={{ fontSize: 12.5, marginTop: 0 }}>
                A datasheet can cover several parts, so linking one does not unlink the others.
              </p>
              <PartPicker onPick={(p) => linkTo(p.id)} placeholder="Search parts…" />
            </div>
            <div className="modal-f">
              <button className="btn sm ghost" onClick={() => setLinking(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
