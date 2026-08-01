// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { mdiClose, mdiCommentQuestionOutline } from '@mdi/js'
import { AssistantChat } from './AssistantChat'

const icon = (path: string) => (
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden><path d={path} fill="currentColor" /></svg>
)

// useFooterHeight tracks how tall the footer currently is.
//
// Measured rather than hardcoded: the footer is content-height and wraps to two
// lines on a narrow window, so any fixed offset is wrong at some width. A
// hardcoded value left the button sitting on top of the Licences link.
function useFooterHeight() {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const footer = document.querySelector('.appfoot')
    if (!footer) return
    const measure = () => setHeight(footer.getBoundingClientRect().height)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(footer)
    return () => observer.disconnect()
  }, [])
  return height
}

// Ask about whatever page you are on, without leaving it.
//
// Mounted once in the layout rather than per page, so every screen gets it and
// no page has to remember to add it. What it knows about the page comes from
// the route, which is the one thing already true everywhere.
export function AssistantPopup() {
  const [open, setOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const location = useLocation()
  const navigate = useNavigate()
  const footerHeight = useFooterHeight()
  const bottom = footerHeight + 16


  // A new page is a new subject, so the popup starts a fresh conversation
  // rather than continuing one about a different part.
  useEffect(() => { setConversationId(undefined) }, [location.pathname])

  const subject = subjectFor(location.pathname)
  // Whether the assistant exists at all is decided by the layout, which only
  // mounts this when it is switched on. Here it is just about not floating a
  // button over the page that already is the assistant.
  if (location.pathname.startsWith('/assistant')) return null

  return (
    <>
      {!open && (
        <button
          className="btn"
          title="Ask about this page"
          onClick={() => setOpen(true)}
          style={{ position: 'fixed', right: 20, bottom, zIndex: 40, borderRadius: 999, padding: '10px 14px' }}
        >
          {icon(mdiCommentQuestionOutline)}
        </button>
      )}

      {open && (
        <div
          className="card"
          style={{
            position: 'fixed', right: 20, bottom, zIndex: 41,
            // Never taller than the space above the footer, so a long
            // conversation scrolls inside the panel instead of running off the
            // top of the window.
            maxHeight: `calc(100vh - ${bottom + 16}px)`,
            overflowY: 'auto',
            width: 'min(420px, calc(100vw - 40px))', padding: 0,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
          }}
        >
          <div className="card-h">
            <h2 style={{ fontSize: 14 }}>Assistant</h2>
            {subject && <span className="pill ghost" style={{ marginLeft: 8 }}>{subject.kind}</span>}
            <button
              className="btn ghost"
              style={{ marginLeft: 'auto', padding: '2px 8px' }}
              onClick={() => setOpen(false)}
              title="Close"
            >
              {icon(mdiClose)}
            </button>
          </div>
          <div style={{ padding: 12 }}>
            <AssistantChat
              compact
              conversationId={conversationId}
              onConversation={setConversationId}
              subjectKind={subject?.kind}
              subjectId={subject?.id}
              context={subject ? `the ${subject.kind} page, id ${subject.id}` : undefined}
            />
            {conversationId && (
              // The popup writes to the same log as the page, so there is
              // somewhere to go back to.
              <button
                className="btn ghost"
                style={{ marginTop: 8, fontSize: 12 }}
                onClick={() => { setOpen(false); navigate(`/assistant?c=${conversationId}`) }}
              >
                Open in the assistant page
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// subjectFor reads what the user is looking at out of the route. Only the
// detail pages have a subject; a list page is not about any one thing.
function subjectFor(path: string): { kind: string; id: string } | null {
  const part = /^\/parts\/([0-9a-f-]{36})/i.exec(path)
  if (part) return { kind: 'part', id: part[1] }
  const board = /^\/projects\/[0-9a-f-]{36}\/boards\/([0-9a-f-]{36})/i.exec(path)
  if (board) return { kind: 'board', id: board[1] }
  const project = /^\/projects\/([0-9a-f-]{36})/i.exec(path)
  if (project) return { kind: 'project', id: project[1] }
  return null
}
