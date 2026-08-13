// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// What was actually sent to the model, and what came back.
//
// Built because three separate AI failures in one morning could not be
// diagnosed from anything the app showed: a prompt silently truncated by a
// missing provider option, a model emitting a malformed tool call, and a model
// that ran the right tools and then answered nothing. All three are obvious the
// moment you can read the exchange, and invisible until then.
//
// Collapsed by default throughout. This is for the times something looks wrong,
// not something to read on the way past.

import { useState } from 'react'
import type { AssistantRoundLog } from '../lib/api'

function prettyJSON(raw: string | undefined): string {
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    // A streamed response is newline-delimited frames, not one document, and a
    // provider error body may not be JSON at all. Show it as it came.
    return raw
  }
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`
  return `${Math.round(n / 1024)} KB`
}

/** One collapsible block of raw text. */
function Block({ label, body, tone }: { label: string; body: string; tone?: 'crit' }) {
  const [open, setOpen] = useState(false)
  if (!body) return null
  return (
    <div className="ai-log-block">
      <button className={`ai-log-toggle ${tone === 'crit' ? 'c-crit' : ''}`} onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} {label}
        <span className="c-faint" style={{ marginLeft: 6, fontWeight: 400 }}>{bytes(body.length)}</span>
      </button>
      {open && <pre className="ai-log-pre">{body}</pre>}
    </div>
  )
}

/** RoundLog renders one provider call. */
export function RoundLogRow({ log }: { log: AssistantRoundLog }) {
  const failed = !!log.error || (log.status !== undefined && log.status !== 0 && log.status >= 400)
  return (
    <div className={`ai-log-round ${failed ? 'failed' : ''}`}>
      <div className="ai-log-head">
        <span className="ai-log-num">Round {log.round}</span>
        <span className="tag">{log.model}</span>
        {!!log.status && <span className={`tag ${failed ? 'ds-lang' : ''}`}>HTTP {log.status}</span>}
        <span className="c-faint mono" style={{ fontSize: 11 }}>
          {log.input_tokens.toLocaleString()} in · {log.output_tokens.toLocaleString()} out
          {log.duration_ms > 0 && ` · ${(log.duration_ms / 1000).toFixed(1)}s`}
        </span>
      </div>

      {log.error && <div className="ai-log-err">{log.error}</div>}

      {/* Reasoning first: when an answer is wrong, this is usually where the
          wrongness is visible, and it is the part that used to be discarded. */}
      <Block label="Thinking" body={log.thinking ?? ''} />
      <Block label="Sent" body={prettyJSON(log.request)} />
      <Block label="Returned" body={prettyJSON(log.response)} tone={failed ? 'crit' : undefined} />
    </div>
  )
}

/** RoundLogs renders a whole turn's worth, with a note when there are none. */
export function RoundLogs({ logs }: { logs: AssistantRoundLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="c-faint" style={{ fontSize: 12, margin: '6px 0 0' }}>
        No calls recorded for this conversation. Logs are kept for seven days.
      </p>
    )
  }
  const inTok = logs.reduce((n, l) => n + l.input_tokens, 0)
  return (
    <div className="ai-log-list">
      <div className="c-faint mono" style={{ fontSize: 11, marginBottom: 6 }}>
        {logs.length} call{logs.length === 1 ? '' : 's'} · {inTok.toLocaleString()} tokens sent in total
        {logs.length > 1 && ' · each round re-sends the whole conversation, so this grows fast'}
      </div>
      {logs.map((l) => (
        <RoundLogRow key={l.id} log={l} />
      ))}
    </div>
  )
}
