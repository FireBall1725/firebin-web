// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The in-app datasheet reader.
//
// The PDF is rendered by the browser's own viewer inside an <iframe>, the same
// approach PrintLabelModal and LabelBuilder already take with generated label
// sheets. That is a deliberate choice over pdf.js: it costs no dependency, and
// the built-in viewer already has search, zoom, rotate, print and page
// navigation that would otherwise have to be rebuilt. The trade is that we
// cannot render a page thumbnail, which is why the library is a table.

import { useEffect, useState } from 'react'
import { api, type Datasheet } from '../lib/api'
import { icon } from '../lib/icons'
import { mdiClose, mdiDownload, mdiOpenInNew } from '@mdi/js'
import { useAuth } from '../auth/AuthContext'

/** useDatasheetURL loads the PDF as an object URL, revoking it on unmount.
 *  The content route is authenticated, so the bytes have to come through the
 *  API client rather than a bare src. */
function useDatasheetURL(id: string): { url: string | null; error: string | null } {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
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

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** DatasheetViewer shows one stored PDF full-screen with its metadata. */
export function DatasheetViewer({ datasheet, onClose }: { datasheet: Datasheet; onClose: () => void }) {
  const { url, error } = useDatasheetURL(datasheet.id)
  const { canWrite } = useAuth()
  const title = datasheet.title || datasheet.filename

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal ds-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3 title={title}>{title}</h3>
          <div className="ds-v-actions">
            {url && (
              <>
                <a className="btn sm" href={url} download={datasheet.filename} title="Download a copy">
                  {icon(mdiDownload)}
                  Download
                </a>
                <a className="btn sm" href={url} target="_blank" rel="noreferrer" title="Open in a new tab">
                  {icon(mdiOpenInNew)}
                  Open in tab
                </a>
              </>
            )}
            <button className="icon-btn" onClick={onClose} title="Close" aria-label="Close">
              {icon(mdiClose)}
            </button>
          </div>
        </div>

        <div className="ds-v-meta">
          <span className="tag">{prettyBytes(datasheet.size_bytes)}</span>
          {datasheet.page_count ? <span className="tag">{datasheet.page_count} pages</span> : null}
          {datasheet.language && datasheet.language !== 'en' ? (
            <span className="tag ds-lang">{datasheet.language.toUpperCase()}</span>
          ) : null}
          <span className="tag">{datasheet.origin === 'mirror' ? 'Mirrored' : 'Uploaded'}</span>
          {datasheet.parts.length > 0 ? (
            <span className="ds-v-parts">
              {datasheet.parts.map((p) => (
                <span className="pchip" key={p.part_id}>
                  {p.mpn || p.part_name}
                </span>
              ))}
            </span>
          ) : (
            <span className="ds-v-unlinked">Not linked to a part{canWrite ? ' yet' : ''}</span>
          )}
        </div>

        <div className="ds-v-stage">
          {error ? (
            <div className="empty">{error}</div>
          ) : url ? (
            <iframe className="ds-v-frame" src={url} title={title} />
          ) : (
            <div className="empty">Loading the datasheet…</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** DatasheetViewerById fetches the metadata first, for callers that only hold
 *  an id (the command palette, a deep link). */
export function DatasheetViewerById({ id, onClose }: { id: string; onClose: () => void }) {
  const [ds, setDs] = useState<Datasheet | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    api
      .getDatasheet(id)
      .then((d) => !cancelled && setDs(d))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [id])

  if (failed) return null
  if (!ds) return null
  return <DatasheetViewer datasheet={ds} onClose={onClose} />
}
