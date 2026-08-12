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

import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { api, type Datasheet } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { PartPicker } from '../components/PartPicker'
import { icon } from '../lib/icons'
import {
  mdiArrowLeft,
  mdiDelete,
  mdiDownload,
  mdiLinkVariant,
  mdiOpenInNew,
} from '@mdi/js'

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
  const { url, error } = useDatasheetURL(id)

  const load = useCallback(() => {
    if (!id) return
    api.getDatasheet(id).then(setD).catch(() => setMissing(true))
  }, [id])
  useEffect(load, [load])

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

  return (
    <div className="ds-page">
      <div className="ds-page-head">
        <button className="btn sm" onClick={() => navigate('/datasheets')} title="Back to the library">
          {icon(mdiArrowLeft)}
          Datasheets
        </button>
        <div className="ds-page-title">
          <h1 title={title}>{title}</h1>
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

        <span className="ds-page-parts">
          {d.parts.length > 0 ? (
            d.parts.map((p) => (
              <Link className="pchip" key={p.part_id} to={`/parts/${p.part_id}`} title={`Open ${p.part_name}`}>
                {p.mpn || p.part_name}
              </Link>
            ))
          ) : (
            <span className="ds-page-unlinked">Not linked to a part{canWrite ? ' yet' : ''}</span>
          )}
        </span>
      </div>

      <div className="ds-page-stage">
        {error ? (
          <div className="empty">{error}</div>
        ) : url ? (
          // <object>, not <iframe>: an iframe pointed at a blob URL loads an
          // empty document instead of engaging the browser's PDF plugin, so the
          // panel renders blank with no error anywhere.
          <object className="ds-page-frame" type="application/pdf" data={url} title={title}>
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
