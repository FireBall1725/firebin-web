// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// One datasheet, full page.
//
// A page rather than a modal so the assistant is reachable while you read. The
// popup lives in Layout and works out its subject from the route, so a real
// /datasheets/:id URL is what lets you ask a question about the document in
// front of you. An overlay covered the popup and told the assistant nothing.
//
// It also means a datasheet has a URL: linkable, bookmarkable, and survives a
// refresh.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { api, type Category, type Datasheet, type DatasheetPartLink } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { PartPicker } from '../components/PartPicker'
import { registerDatasheetViewer } from '../lib/datasheetViewer'
import { icon } from '../lib/icons'
import {
  mdiArrowLeft,
  mdiCheck,
  mdiClose,
  mdiDelete,
  mdiDownload,
  mdiLinkVariant,
  mdiOpenInNew,
  mdiPencil,
} from '@mdi/js'

// How long the way back stays on screen after an unlink.
//
// Ten seconds because the mistake this exists for is not noticed at the moment
// it is made: the pointer was somewhere else, the chip vanished, and what makes
// you look is the row a beat later. Long enough to read and act on, short
// enough that the header is not carrying stale offers.
const undoWindowMS = 10_000

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** Loads the PDF as an object URL, revoking it on unmount. The content route is
 *  authenticated, so the bytes come through the API client rather than a src. */
function useDatasheetURL(id: string | undefined): { url: string | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    let objectURL = ''
    setUrl(null)
    setError(null)
    api
      .datasheetBlob(id)
      .then((blob) => {
        if (cancelled) return
        objectURL = URL.createObjectURL(blob)
        setUrl(objectURL)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'could not load the datasheet')
      })
    return () => {
      cancelled = true
      if (objectURL) URL.revokeObjectURL(objectURL)
    }
  }, [id])
  return { url, error }
}

export function DatasheetPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useAuth()
  const [d, setD] = useState<Datasheet | null>(null)
  const [missing, setMissing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  // Null when not editing. An empty string is a real state (the title cleared
  // back to the filename), so the two cannot share a value.
  const [draftTitle, setDraftTitle] = useState<string | null>(null)
  // Links removed in the last few seconds, each with its own way back. A list
  // rather than one slot: tidying up a wrongly-linked document is several
  // clicks in a row, and the second unlink must not silently make the first
  // one permanent.
  const [undos, setUndos] = useState<{ key: string; link: DatasheetPartLink }[]>([])
  // A counter, not a timestamp: unlinking the same part twice in one session
  // needs two distinct keys, and Date.now() in a component body is flagged as
  // impure whether or not it only ever runs from a click.
  const undoSeq = useRef(0)
  const { url, error } = useDatasheetURL(id)
  // The page the assistant last sent us to. null is "wherever the reader left
  // it", which is not the same as page 1: re-rendering the object at #page=1
  // every time anything else on the page changed would yank the document back
  // to the top mid-read.
  //
  // The counter is not decoration. The fragment is applied by remounting the
  // object, and clicking the same citation twice after scrolling away produces
  // the same fragment, so the page number alone would not change the key and
  // the second click would do nothing.
  const [jump, setJump] = useState<{ page: number; nonce: number } | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // ?page=51 is how a citation on the assistant page arrives here, and it is
  // also what makes a jump worth linking to someone else.
  const [params, setParams] = useSearchParams()
  const wanted = Number(params.get('page')) || 0

  const load = useCallback(() => {
    if (!id) return
    api.getDatasheet(id).then(setD).catch(() => setMissing(true))
  }, [id])
  useEffect(load, [load])

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // Offer this document to the answer text. Registered only once the PDF is in
  // hand, because a link that cannot go anywhere yet is a link that does
  // nothing when clicked.
  const pageCount = d?.page_count ?? 0
  useEffect(() => {
    if (!id || !url) return
    return registerDatasheetViewer({
      datasheetID: id,
      pageCount,
      jump: (page) => {
        setJump((prev) => ({ page, nonce: (prev?.nonce ?? 0) + 1 }))
        // The answer that named the page can be well below the document on a
        // short window, and jumping a pane you cannot see reads as nothing
        // happening.
        stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      },
    })
  }, [id, url, pageCount])

  // Apply ?page= once the PDF is loaded. Keyed on the number rather than run
  // on mount, so following a second citation to a different page in the same
  // document moves the viewer instead of doing nothing.
  useEffect(() => {
    if (!url || wanted < 1) return
    setJump((prev) => (prev?.page === wanted ? prev : { page: wanted, nonce: (prev?.nonce ?? 0) + 1 }))
  }, [url, wanted])

  // And the other way round, so the URL says where the reader actually is: a
  // reload lands on the same page and the address bar is worth sending to
  // someone. Replaced rather than pushed, or following three citations would
  // cost three presses of Back to leave the document.
  useEffect(() => {
    if (jump && jump.page !== wanted) setParams({ page: String(jump.page) }, { replace: true })
  }, [jump, wanted, setParams])

  if (missing) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <p className="c-faint" style={{ margin: 0 }}>That datasheet no longer exists.</p>
        <Link className="link" to="/datasheets" style={{ display: 'inline-block', marginTop: 10 }}>Back to datasheets</Link>
      </div>
    )
  }
  if (!d) return <div className="card" style={{ padding: 40 }}><p className="c-faint" style={{ margin: 0 }}>Loading…</p></div>

  const title = d.title || d.filename

  const remove = async () => {
    if (!confirm(`Delete ${title}?\n\nThe PDF and its extracted text are removed from the server.`)) return
    try {
      await api.deleteDatasheet(d.id)
      navigate('/datasheets')
    } catch {
      // Stay put; the list would be a confusing place to land on a failure.
    }
  }

  const linkTo = async (partID: string) => {
    try {
      await api.linkDatasheetPart(d.id, partID)
      setLinking(false)
      load()
    } catch {
      setLinking(false)
    }
  }

  // Unlinking leaves the document in place with one fewer link, which is the
  // whole point: a datasheet attached to the wrong part should lose the link,
  // not the file. With the last link gone it lands in Unlinked.
  //
  // Undo rather than a confirmation. A dialog on every correction costs more
  // than the mistake does, but the bare version was worse than it looked: the
  // chip simply vanished, and a stray click on a small target left no trace
  // until you noticed the row saying Unlinked some time later. This keeps the
  // click instant and leaves the way back in the slot the chip just left.
  const unlink = async (p: DatasheetPartLink) => {
    try {
      await api.unlinkDatasheetPart(d.id, p.part_id)
      // The manufacturer part goes into the undo too. Restoring the part alone
      // would put the link back pointing at no MPN, which is a quieter kind of
      // data loss than the one being undone.
      const key = `${p.part_id}-${(undoSeq.current += 1)}`
      setUndos((u) => [...u, { key, link: p }])
      // Scheduled here rather than in an effect on the list: an effect would
      // rebuild every timer whenever the list changed, quietly restarting the
      // clock on offers that were already half expired.
      setTimeout(() => setUndos((u) => u.filter((x) => x.key !== key)), undoWindowMS)
      load()
    } catch {
      // The chip is still there, which is the honest state after a failure.
    }
  }

  const undoUnlink = async (key: string, p: DatasheetPartLink) => {
    setUndos((u) => u.filter((x) => x.key !== key))
    try {
      await api.linkDatasheetPart(d.id, p.part_id, p.manufacturer_part_id)
      load()
    } catch {
      load()
    }
  }

  const saveTitle = async () => {
    const next = (draftTitle ?? '').trim()
    setDraftTitle(null)
    if (next === (d.title ?? '')) return
    try {
      // Empty clears it, so the filename takes over again rather than the
      // document being called "".
      setD(await api.updateDatasheet(d.id, { title: next || null }))
    } catch {
      load()
    }
  }

  const setCategory = async (categoryID: string) => {
    try {
      setD(await api.updateDatasheet(d.id, { category_id: categoryID || null }))
    } catch {
      load()
    }
  }

  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <button className="btn sm" onClick={() => navigate('/datasheets')} title="Back to the library">
          {icon(mdiArrowLeft)}
          Datasheets
        </button>
        <div className="ds-page-title">
          {draftTitle !== null ? (
            <div className="ds-title-edit">
              <input
                className="input"
                autoFocus
                value={draftTitle}
                placeholder={d.filename}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveTitle()
                  if (e.key === 'Escape') setDraftTitle(null)
                }}
              />
              <button className="btn sm" onClick={() => void saveTitle()} title="Save">{icon(mdiCheck, { size: 15 })}</button>
              <button className="btn sm ghost" onClick={() => setDraftTitle(null)} title="Cancel">{icon(mdiClose, { size: 15 })}</button>
            </div>
          ) : (
            <h1 title={title}>
              {title}
              {canWrite && (
                <button
                  className="ds-title-pencil"
                  title="Rename this datasheet"
                  aria-label="Rename this datasheet"
                  onClick={() => setDraftTitle(d.title ?? '')}
                >
                  {icon(mdiPencil, { size: 14 })}
                </button>
              )}
            </h1>
          )}
          <div className="ds-page-sub mono">{d.filename}</div>
        </div>
        <div className="ds-page-acts">
          {url && (
            <>
              <a className="btn sm" href={url} download={d.filename} title="Download a copy">
                {icon(mdiDownload)}
                Download
              </a>
              <a className="btn sm" href={url} target="_blank" rel="noreferrer" title="Open in a new tab">
                {icon(mdiOpenInNew)}
                Open in tab
              </a>
            </>
          )}
          {canWrite && (
            <>
              <button className="btn sm" onClick={() => setLinking(true)} title="Link this datasheet to a part">
                {icon(mdiLinkVariant)}
                Link a part
              </button>
              <button className="btn sm danger" onClick={remove} title="Delete this datasheet">
                {icon(mdiDelete)}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="ds-page-meta">
        <span className="tag">{prettyBytes(d.size_bytes)}</span>
        {d.page_count ? <span className="tag">{d.page_count} pages</span> : null}
        <span className="tag">{d.origin === 'mirror' ? 'Mirrored' : 'Uploaded'}</span>
        {d.language && d.language !== 'en' && <span className="tag ds-lang">{d.language.toUpperCase()}</span>}
        {d.text_status === 'ok' && <span className="pill ok">readable</span>}
        {d.text_status === 'no_text_layer' && (
          <span className="pill warn" title="A scan with no text layer, so the assistant cannot read it">image-only</span>
        )}
        {d.text_status === 'pending' && <span className="pill ghost">reading…</span>}
        {d.text_status === 'failed' && <span className="pill low">unreadable</span>}

        {/* A category of its own. Worth setting even on a linked document, but
            it is the only way to file one that has no parts to borrow from. */}
        {canWrite ? (
          <select
            className="input ds-cat-pick"
            value={d.category_id ?? ''}
            title="File this datasheet under a category"
            onChange={(e) => void setCategory(e.target.value)}
          >
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : d.category_id ? (
          <span className="tag">{categories.find((c) => c.id === d.category_id)?.name ?? 'Category'}</span>
        ) : null}

        <span className="ds-page-parts">
          {/* In the slot the chip just left, so the way back is under the
              pointer that removed it rather than in a corner of the window. */}
          {undos.map(({ key, link }) => (
            <span className="pchip-undo" key={key}>
              <s>{link.mpn || link.part_name}</s> unlinked
              <button onClick={() => void undoUnlink(key, link)}>Undo</button>
            </span>
          ))}
          {d.parts.length > 0 ? (
            d.parts.map((p) => (
              // The chip opens the part; the × beside it drops the link. Two
              // targets in one control, so the × is its own button rather than a
              // click handler on the link that has to guess which was meant.
              <span className="pchip-wrap" key={p.part_id}>
                <Link className={`pchip ${canWrite ? 'has-x' : ''}`} to={`/parts/${p.part_id}`} title={`Open ${p.part_name}`}>
                  {p.mpn || p.part_name}
                </Link>
                {canWrite && (
                  <button
                    className="pchip-x"
                    title={`Unlink from ${p.mpn || p.part_name}`}
                    aria-label={`Unlink from ${p.mpn || p.part_name}`}
                    onClick={() => void unlink(p)}
                  >
                    {icon(mdiClose, { size: 12 })}
                  </button>
                )}
              </span>
            ))
          ) : undos.length > 0 ? null : (
            // Suppressed while an undo is showing: that pill already says the
            // document has just been detached, and both at once reads as two
            // separate facts about the same thing.
            <span className="ds-page-unlinked">Not linked to a part{canWrite ? ' yet' : ''}</span>
          )}
        </span>
      </div>

      <div className="ds-page-stage" ref={stageRef}>
        {error ? (
          <div className="empty">{error}</div>
        ) : url ? (
          // <object>, not <iframe>: an iframe pointed at a blob URL loads an
          // empty document instead of engaging the browser's PDF plugin, so the
          // panel renders blank with no error anywhere.
          //
          // #page=N is read by the browser's own viewer when the plugin starts,
          // so a jump means a fresh element rather than a changed attribute:
          // the fragment on an already-loaded object is ignored. The key forces
          // that. Reloading costs nothing here because the source is a blob
          // already in memory.
          <object
            key={jump ? `p${jump.page}-${jump.nonce}` : 'start'}
            className="ds-page-frame"
            type="application/pdf"
            data={jump ? `${url}#page=${jump.page}` : url}
            title={title}
          >
            <div className="empty">
              This browser will not display PDFs inline.{' '}
              <a className="link" href={url} download={d.filename}>Download {d.filename}</a>.
            </div>
          </object>
        ) : (
          <div className="empty">Loading the datasheet…</div>
        )}
      </div>

      {linking && (
        <div className="overlay" onClick={() => setLinking(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-h"><h3>Link {title}</h3></div>
            <div className="modal-b">
              <p className="c-faint" style={{ fontSize: 12.5, marginTop: 0 }}>
                A datasheet can cover several parts, so linking one does not unlink the others.
              </p>
              <PartPicker onPick={(p) => linkTo(p.id)} placeholder="Search parts…" />
            </div>
            <div className="modal-f">
              <button className="btn sm ghost" onClick={() => setLinking(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
