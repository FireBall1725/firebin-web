// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type AssistantUsage, type Conversation } from '../lib/api'
import { AssistantChat } from '../components/AssistantChat'

// costLine says what the questions cost, and distinguishes the three cases that
// all render as "$0.00" otherwise: a local model that genuinely costs nothing, a
// model with no published price, and a real charge.
function costLine(u: AssistantUsage): string {
  if (u.unpriced_turns === u.turns) return 'This model has no published price, so cost is not tracked.'
  if (u.cost_usd === 0) return 'No charge: this runs on your own hardware.'
  const rest = u.unpriced_turns > 0
    ? ` (${u.unpriced_turns} more on a model with no published price)`
    : ''
  return `About $${u.cost_usd.toFixed(4)}${rest}.`
}

// The assistant's own page: past conversations down the left, the current one
// on the right. Conversations opened from a popup on a part or a project land
// here too, so there is one log rather than two.
export function AssistantPage() {
  const [params, setParams] = useSearchParams()
  const active = params.get('c') ?? undefined
  const [list, setList] = useState<Conversation[]>([])
  // Bumped only when the user deliberately changes conversation. The chat view
  // is keyed on this rather than on the conversation id, because the id also
  // changes when the view itself starts a new thread mid-answer, and keying on
  // that would remount the component and wipe the reply being streamed.
  const [view, setView] = useState(0)
  const [usage, setUsage] = useState<AssistantUsage | null>(null)
  // A bookmark can reach this page with the feature off, so it says so rather
  // than showing an ask box whose every question would be refused.
  const [available, setAvailable] = useState<boolean | null>(null)
  useEffect(() => {
    api.assistantStatus().then((s) => setAvailable(s.enabled)).catch(() => setAvailable(false))
  }, [])

  const reload = useCallback(() => {
    api.listConversations().then(setList).catch(() => setList([]))
    api.assistantUsage().then(setUsage).catch(() => setUsage(null))
  }, [])
  useEffect(reload, [reload])

  const open = (id?: string) => setParams(id ? { c: id } : {}, { replace: true })

  // Switching to another conversation, or starting a fresh one, resets the view.
  const openFresh = (id?: string) => { setView((v) => v + 1); open(id) }

  const remove = async (id: string) => {
    await api.deleteConversation(id).catch(() => undefined)
    if (id === active) openFresh(undefined)
    reload()
  }

  if (available === false) {
    return (
      <div>
        <span className="eyebrow">Workspace</span>
        <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 20px' }}>
          Assistant
        </h1>
        <div className="card">
          <p className="c-faint" style={{ padding: 20, margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            The assistant is switched off. An instance admin can turn it on under
            Settings, Assistant, and choose which provider answers.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <span className="eyebrow">Workspace</span>
      <h1 className="c-text" style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-0.02em', margin: '2px 0 20px' }}>
        Assistant
      </h1>

      <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>
        <div style={{ width: 260, flexShrink: 0 }}>
          <button className="btn" style={{ width: '100%', marginBottom: 10 }} onClick={() => openFresh(undefined)}>
            New conversation
          </button>
          <div className="card" style={{ padding: 6 }}>
            {list.length === 0 && (
              <p className="c-faint" style={{ fontSize: 13, padding: 10, margin: 0 }}>Nothing asked yet.</p>
            )}
            {list.map((c) => (
              <div key={c.id} className="flex items-center gap-1" style={{ padding: 2 }}>
                <button
                  className={`set-nav-item ${c.id === active ? 'on' : ''}`}
                  style={{ flex: 1, textAlign: 'left' }}
                  onClick={() => openFresh(c.id)}
                >
                  {c.title || 'Untitled'}
                  <small>
                    {c.message_count} message{c.message_count === 1 ? '' : 's'}
                    {c.subject_kind ? ` · from a ${c.subject_kind}` : ''}
                  </small>
                </button>
                <button
                  className="btn ghost"
                  title="Delete this conversation"
                  style={{ padding: '4px 8px' }}
                  onClick={() => void remove(c.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {usage && usage.turns > 0 && (
            <p className="c-faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>
              {usage.turns} question{usage.turns === 1 ? '' : 's'} asked
              {usage.failed_turns > 0 && `, ${usage.failed_turns} of which failed`}.{' '}
              {(usage.input_tokens + usage.output_tokens).toLocaleString()} tokens.{' '}
              {costLine(usage)}
            </p>
          )}
        </div>

        {/* Bounded to the window rather than left to grow. With an auto height
            the chat's own "height: 100%" resolved against nothing, so the log
            never scrolled: the card just got taller with every message and the
            ask box slid off the bottom of the page. */}
        <div
          className="card"
          style={{
            flex: 1, minWidth: 0, padding: 16,
            height: 'calc(100vh - 230px)', minHeight: 360,
          }}
        >
          <AssistantChat
            key={view}
            conversationId={active}
            onConversation={(id) => { open(id); reload() }}
          />
        </div>
      </div>
    </div>
  )
}
