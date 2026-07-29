// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { api, type KicadSuggestion, type KicadSuggestions } from '../lib/api'
import { KicadDrawingView } from './KicadDrawingView'
import { icon } from '../lib/icons'
import { mdiClose } from '@mdi/js'

// Suggestions are shown with the evidence behind them and applied one at a
// time. The server ranks them but does not choose, because the strength of a
// candidate depends on knowing the part: a footprint lifted from a board you
// shipped is fact, while a package-derived one is a guess about geometry from a
// string that describes what you ordered.

const SOURCE_LABEL: Record<KicadSuggestion['source'], string> = {
  bom: 'from your design',
  mpn: 'MPN name match',
  category: 'category rule',
  package: 'package rule',
}

function SourceBadge({ s }: { s: KicadSuggestion }) {
  const strong = s.source === 'bom'
  return (
    <span
      className="tag"
      title={s.detail || undefined}
      style={
        strong
          ? { borderColor: 'var(--ok, #4a7)', color: 'var(--ok, #4a7)' }
          : undefined
      }
    >
      {SOURCE_LABEL[s.source]}
    </span>
  )
}

function Row({
  kind,
  s,
  onUse,
}: {
  kind: 'symbol' | 'footprint'
  s: KicadSuggestion
  onUse: () => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr auto',
        gap: 12,
        alignItems: 'center',
        padding: '10px 12px',
        borderTop: '1px solid var(--border)',
      }}
    >
      <div style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
        <KicadDrawingView kind={kind} libID={s.lib_id} height={78} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{s.lib_id}</div>
        <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <SourceBadge s={s} />
          {s.detail && (
            <span className="c-dim" style={{ fontSize: 12 }}>{s.detail}</span>
          )}
        </div>
      </div>
      <button type="button" className="btn sm" onClick={onUse}>Use</button>
    </div>
  )
}

export function KicadSuggestModal({
  partID,
  onApply,
  onClose,
}: {
  partID: string
  onApply: (kind: 'symbol' | 'footprint', libID: string) => void
  onClose: () => void
}) {
  const [data, setData] = useState<KicadSuggestions | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .kicadSuggestions(partID)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError('Could not load suggestions.'))
    return () => {
      cancelled = true
    }
  }, [partID])

  const empty = data && data.symbols.length === 0 && data.footprints.length === 0

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Suggested KiCad mappings</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>

        <div className="modal-b" style={{ display: 'grid', gap: 16 }}>
          {!data && !error && <p className="c-dim" style={{ fontSize: 13 }}>Looking…</p>}
          {error && <p className="c-dim" style={{ fontSize: 13 }}>{error}</p>}

          {empty && (
            <p className="c-dim" style={{ fontSize: 13 }}>
              Nothing to suggest. This part has not appeared on a board yet, its MPN does
              not match a symbol name, and its category is not one where a rule is safe.
              Use Browse to pick manually.
            </p>
          )}

          {data && data.symbols.length > 0 && (
            <section>
              <div className="eyebrow">Symbol</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, borderTop: 'none' }}>
                {data.symbols.map((s) => (
                  <Row key={s.lib_id} kind="symbol" s={s} onUse={() => onApply('symbol', s.lib_id)} />
                ))}
              </div>
            </section>
          )}

          {data && data.footprints.length > 0 && (
            <section>
              <div className="eyebrow">Footprint</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, borderTop: 'none' }}>
                {data.footprints.map((s) => (
                  <Row key={s.lib_id} kind="footprint" s={s} onUse={() => onApply('footprint', s.lib_id)} />
                ))}
              </div>
            </section>
          )}

          {data?.notes?.length ? (
            <div className="banner" style={{ fontSize: 12.5 }}>
              {/* Withheld candidates are stated, not dropped silently: a missing
                  suggestion otherwise reads as "we found nothing". */}
              {data.notes.map((n) => (
                <div key={n}>{n}</div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="modal-f">
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
