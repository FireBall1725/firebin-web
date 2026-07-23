// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Small client-side UI preferences, stored in localStorage like the theme.
// Set in Settings, read by the pages they affect. Changes broadcast a custom
// event so an open page updates without a reload.

import { useEffect, useState } from 'react'

export type PartsView = 'table' | 'grid' | 'list'
export const PARTS_VIEWS: { value: PartsView; label: string }[] = [
  { value: 'list', label: 'List cards' },
  { value: 'table', label: 'Dense table' },
  { value: 'grid', label: 'Card grid' },
]

const KEY = 'firebin.partsView'
const EVENT = 'firebin:prefs'

export function getPartsView(): PartsView {
  const v = localStorage.getItem(KEY)
  return v === 'table' || v === 'grid' || v === 'list' ? v : 'list'
}

export function setPartsView(v: PartsView) {
  localStorage.setItem(KEY, v)
  window.dispatchEvent(new CustomEvent(EVENT))
}

// usePartsView reads the preference and re-renders when it changes (here or in
// another tab).
export function usePartsView(): PartsView {
  const [view, setView] = useState<PartsView>(getPartsView)
  useEffect(() => {
    const update = () => setView(getPartsView())
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return view
}
