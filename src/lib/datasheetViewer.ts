// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// A one-slot registry so an answer can point at the document beside it.
//
// The assistant panel is rendered by Layout, not by the datasheet page, so the
// two are siblings in the tree and React context cannot reach across. Rather
// than hoist the viewer's state into Layout, where nothing else needs it, the
// open viewer registers itself here and the Markdown renderer looks for it.
//
// One slot, because only one datasheet is ever on screen. A second registration
// replaces the first, and unmounting clears it, so a page reference in an answer
// you are reading somewhere else is plain text again.

import { createContext, useContext, useSyncExternalStore } from 'react'

export type DatasheetViewer = {
  datasheetID: string
  /** 0 when the page count is not known yet; used to reject nonsense citations. */
  pageCount: number
  jump: (page: number) => void
}

let current: DatasheetViewer | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

/** Claim the slot. Returns the function that releases it. */
export function registerDatasheetViewer(v: DatasheetViewer): () => void {
  current = v
  notify()
  return () => {
    // Guarded: on a route change the next viewer mounts before this one's
    // cleanup runs, and an unguarded release would clear the new registration.
    if (current === v) {
      current = null
      notify()
    }
  }
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

const snapshot = () => current

export function useDatasheetViewer(): DatasheetViewer | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

// The document a conversation is about, when it is not the one on screen.
//
// The assistant page shows a conversation started from a datasheet, and its
// answers cite pages of a document that page does not display. Nothing to jump,
// but there is somewhere to go: the citation opens the datasheet at that page.
//
// A context rather than the registry above, because this is a property of the
// conversation being read and several could be on screen in principle. The
// navigation is supplied by the provider so this module stays clear of the
// router, which keeps the Markdown renderer testable on its own.
export type DatasheetSubject = {
  datasheetID: string
  /** 0 when unknown, which is the usual case here; no page is rejected then. */
  pageCount: number
  open: (page: number) => void
}

const SubjectContext = createContext<DatasheetSubject | null>(null)

export const DatasheetSubjectProvider = SubjectContext.Provider

export function useDatasheetSubject(): DatasheetSubject | null {
  return useContext(SubjectContext)
}
