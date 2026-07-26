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
  return usePref(getPartsView)
}

// ── Parts page size ──────────────────────────────────────────────────────────
export const PAGE_SIZES = [25, 50, 100, 200] as const
const PAGE_KEY = 'firebin.partsPageSize'

export function getPageSize(): number {
  const v = parseInt(localStorage.getItem(PAGE_KEY) || '')
  return PAGE_SIZES.includes(v as (typeof PAGE_SIZES)[number]) ? v : 50
}
export function setPageSize(n: number) {
  localStorage.setItem(PAGE_KEY, String(n))
  window.dispatchEvent(new CustomEvent(EVENT))
}
export function usePageSize(): number {
  return usePref(getPageSize)
}

// ── Hardware (keyboard-wedge) barcode scanner ────────────────────────────────
const HW_KEY = 'firebin.hardwareScanner'

export function getHardwareScanner(): boolean {
  return localStorage.getItem(HW_KEY) !== 'off' // on by default
}
export function setHardwareScanner(on: boolean) {
  localStorage.setItem(HW_KEY, on ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent(EVENT))
}
export function useHardwareScanner(): boolean {
  return usePref(getHardwareScanner)
}

const CAM_KEY = 'firebin.cameraScan'

export function getCameraScan(): boolean {
  return localStorage.getItem(CAM_KEY) !== 'off' // on by default
}
export function setCameraScan(on: boolean) {
  localStorage.setItem(CAM_KEY, on ? 'on' : 'off')
  window.dispatchEvent(new CustomEvent(EVENT))
}
export function useCameraScan(): boolean {
  return usePref(getCameraScan)
}

// usePref subscribes any getter to the prefs-changed + storage events.
function usePref<T>(get: () => T): T {
  const [v, setV] = useState<T>(get)
  useEffect(() => {
    const update = () => setV(get())
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT, update)
      window.removeEventListener('storage', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return v
}
