// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { ApiError, api, streamAssistantMessage, type AssistantStep, type Conversation, type ConversationMessage } from '../lib/api'
import { Markdown } from './Markdown'
import { AssistantStatus } from './AssistantStatus'

// The conversation view, shared by the sidebar page and the popup so a question
// asked from a part page behaves the same as one asked from the page, and both
// land in the same log.
export function AssistantChat({
  conversationId,
  onConversation,
  subjectKind,
  subjectId,
  context,
  compact,
}: {
  conversationId?: string
  onConversation?: (id: string) => void
  subjectKind?: string
  subjectId?: string
  // A short description of what the user is looking at, sent with the question
  // so "is this one cheap enough" means something.
  context?: string
  compact?: boolean
}) {
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [steps, setSteps] = useState<AssistantStep[] | null>(null)
  // The answer as it arrives. Kept apart from the stored messages so the two
  // never disagree: this is discarded and replaced by what the server saved.
  const [streaming, setStreaming] = useState<string | null>(null)
  // What the assistant is doing between fragments. A turn spends most of its
  // time in lookups, and a cursor that stops for twenty seconds with nothing
  // said reads as a hang.
  const [activity, setActivity] = useState<string | null>(null)
  // Running totals, reported by the server as each round finishes. Never
  // estimated: a token count that turns out wrong is worse than one that
  // arrives a few seconds late.
  const [tokens, setTokens] = useState({ in: 0, out: 0 })
  const logRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  // Conversations this component started itself. Their id arrives mid-stream,
  // and refetching then would replace the answer being written with the empty
  // row the server has so far.
  const ownRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!conversationId) { setMessages([]); return }
    if (ownRef.current.has(conversationId)) return
    api.getConversation(conversationId)
      .then((c: Conversation) => setMessages(c.messages ?? []))
      .catch(() => setErr('Could not load that conversation.'))
  }, [conversationId])

  // Scroll the log itself rather than calling scrollIntoView on its last child.
  // scrollIntoView moves whatever ancestor it has to, including the page, and
  // it lines the target up with the bottom of the viewport: the ask box sits
  // below the log and outside it, so the page ended up scrolled just past the
  // box the user was about to type in. Setting scrollTop moves only the log and
  // leaves the page where it was.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, busy, streaming, activity])

  const send = async () => {
    const q = question.trim()
    if (!q || busy) return
    setBusy(true); setErr(null); setSteps(null); setStreaming(''); setActivity(null)
    setTokens({ in: 0, out: 0 })
    // Show the question straight away. Waiting for the round trip to echo it
    // back leaves the box empty and the screen unchanged, which reads as
    // nothing having happened.
    const pending: ConversationMessage = {
      id: 'pending', seq: -1, role: 'user', content: q, created_at: new Date().toISOString(),
    }
    setMessages((m) => [...m, pending])
    setQuestion('')

    const withdraw = () => {
      setMessages((m) => m.filter((x) => x.id !== 'pending'))
      setQuestion(q)
      setStreaming(null)
    }

    let conversation = conversationId
    let failed: string | null = null
    try {
      await streamAssistantMessage(
        {
          question: q,
          conversation_id: conversationId,
          subject_kind: conversationId ? undefined : subjectKind,
          subject_id: conversationId ? undefined : subjectId,
          context,
        },
        (event, data) => {
          switch (event) {
            case 'start':
              conversation = String(data.conversation_id ?? '')
              if (!conversationId && conversation) {
                ownRef.current.add(conversation)
                onConversation?.(conversation)
              }
              break
            case 'text':
              setActivity(null)
              setStreaming((prev) => (prev ?? '') + String(data.text ?? ''))
              break
            case 'tool':
              setActivity(`Looking up ${String(data.tool ?? 'something')}…`)
              break
            case 'usage': {
              const u = data.usage as { input_tokens?: number; output_tokens?: number } | undefined
              if (u) setTokens({ in: u.input_tokens ?? 0, out: u.output_tokens ?? 0 })
              break
            }
            case 'round':
              // Cleared rather than set: with no tool running there is nothing
              // true to say, so the status line falls back to its own word.
              setActivity(null)
              break
            case 'error':
              failed = String(data.error ?? 'the answer could not be completed')
              setSteps(((data.turn as { steps?: AssistantStep[] } | undefined)?.steps) ?? null)
              break
            case 'done':
              setSteps(((data.turn as { steps?: AssistantStep[] } | undefined)?.steps) ?? null)
              break
          }
        },
      )
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'The assistant could not be reached.')
      withdraw()
      setBusy(false)
      return
    }

    if (failed) {
      setErr(failed)
      withdraw()
      setBusy(false)
      return
    }

    // Replace the streamed text with what was stored. The two should match, and
    // showing the stored copy means what is on screen is what a reload gives.
    try {
      if (conversation) {
        const c = await api.getConversation(conversation)
        setMessages(c.messages ?? [])
      }
    } catch {
      // The answer is on screen either way; a failed refetch is not worth
      // taking it away.
    }
    setStreaming(null)
    setActivity(null)
    setBusy(false)
  }

  // The box grows with what is typed, up to a point, then scrolls. Measured
  // rather than set from a line count, because a wrapped line is as tall as a
  // typed one and counting newlines would miss it.
  const resize = () => {
    const el = boxRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }
  useEffect(resize, [question])

  // Tool traffic is not shown as conversation. It is machinery, and reading it
  // as dialogue makes a two-line answer look like twenty.
  const visible = messages.filter((m) => m.content.trim() !== '')

  return (
    <div className="flex flex-col" style={{ height: compact ? 420 : '100%', minHeight: 0 }}>
      <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: compact ? 12 : 4 }}>
        {visible.length === 0 && !busy && (
          <div className="c-faint" style={{ fontSize: 13, lineHeight: 1.6, padding: compact ? 4 : 16 }}>
            <p style={{ marginTop: 0 }}>Ask about what you have, where it is, or what it would cost to buy more.</p>
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              <li>Do I have an 0603 220 Ω resistor?</li>
              <li>What am I low on?</li>
              <li>Can I build the alarm beeper board?</li>
            </ul>
          </div>
        )}
        {visible.map((m) => (
          <div key={m.id} style={{ marginBottom: 14 }}>
            <div className="c-faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {m.role === 'user' ? 'You' : 'Assistant'}
            </div>
            {/* A question is rendered as Markdown too, so a code fence someone
                typed comes out as a code block rather than three backticks.
                With breaks on, because a newline in a chat box was pressed on
                purpose and Markdown would otherwise fold it into a space. */}
            <Markdown text={m.content} breaks={m.role === 'user'} />
          </div>
        ))}
        {streaming !== null && streaming !== '' && (
          <div style={{ marginBottom: 14 }}>
            <div className="c-faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              Assistant
            </div>
            <Markdown text={streaming} />
          </div>
        )}
        {busy && (
          <AssistantStatus activity={activity} inputTokens={tokens.in} outputTokens={tokens.out} />
        )}
        {err && <div className="banner" style={{ fontSize: 13, marginTop: 8 }}>{err}</div>}
        {steps && steps.length > 0 && (
          // Shown collapsed, because an answer about your own data should be
          // checkable without taking the assistant's word for it.
          <details style={{ marginTop: 8 }}>
            <summary className="c-faint" style={{ fontSize: 12, cursor: 'pointer' }}>
              {steps.length === 1 ? 'Looked at 1 thing' : `Looked at ${steps.length} things`}
              {/* Said on the summary, not just inside. A lookup that failed
                  changes how much the answer above is worth, and nobody expands
                  a panel that gives no reason to. */}
              {steps.some((s) => s.is_error) && (
                <span className="c-crit"> · {steps.filter((s) => s.is_error).length} failed</span>
              )}
            </summary>
            <div style={{ marginTop: 6 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ fontSize: 12, marginBottom: 6 }}>
                  <code className="md-code">{s.tool}</code>
                  <span className="c-faint"> {s.input}</span>
                  {s.is_error && <span className="c-crit"> (failed)</span>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="flex gap-2" style={{ paddingTop: 10, alignItems: 'flex-end' }}>
        {/* A textarea, not an input: an input cannot hold a newline at all, so
            shift-enter had nothing to do. Enter still sends, because that is
            what a chat box is for; shift-enter is the escape hatch for a
            question worth laying out over several lines. */}
        <textarea
          ref={boxRef}
          className="input"
          rows={1}
          style={{ flex: 1, resize: 'none', overflowY: 'auto', lineHeight: 1.5, minHeight: 38 }}
          value={question}
          disabled={busy}
          placeholder="Ask about your parts…    (shift-enter for a new line)"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
        />
        <button className="btn" onClick={() => void send()} disabled={busy || question.trim() === ''}>
          {busy ? 'Asking…' : 'Ask'}
        </button>
      </div>
    </div>
  )
}
