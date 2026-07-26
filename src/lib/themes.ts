// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Theme registry + apply/persist. A theme is a block of CSS-variable overrides
// under `:root[data-theme='<slug>']` (see themes.css). 'auto' clears the attribute
// so the app follows the OS light/dark (the FireBin palette). The header toggle
// flips between a theme's light/dark pair when it has one.

export type Mode = 'light' | 'dark'
export interface Theme { slug: string; label: string; mode: Mode; pair?: string }

export const THEMES: Theme[] = [
  { slug: 'auto', label: 'Auto · follows system', mode: 'dark' },
  { slug: 'light', label: 'FireBin Light', mode: 'light', pair: 'dark' },
  { slug: 'dark', label: 'FireBin Dark', mode: 'dark', pair: 'light' },
  { slug: 'solarized-light', label: 'Solarized Light', mode: 'light', pair: 'solarized-dark' },
  { slug: 'solarized-dark', label: 'Solarized Dark', mode: 'dark', pair: 'solarized-light' },
  { slug: 'nord', label: 'Nord', mode: 'dark' },
  { slug: 'dracula', label: 'Dracula', mode: 'dark' },
  { slug: 'tokyo-night', label: 'Tokyo Night', mode: 'dark' },
  { slug: 'gruvbox', label: 'Gruvbox', mode: 'dark' },
  { slug: 'catppuccin', label: 'Catppuccin Mocha', mode: 'dark' },
  { slug: 'rose-pine', label: 'Rosé Pine', mode: 'dark' },
  { slug: 'onedark', label: 'One Dark', mode: 'dark' },
  { slug: 'kanagawa-wave', label: 'Kanagawa Wave', mode: 'dark', pair: 'kanagawa-lotus' },
  { slug: 'kanagawa-dragon', label: 'Kanagawa Dragon', mode: 'dark', pair: 'kanagawa-lotus' },
  { slug: 'kanagawa-lotus', label: 'Kanagawa Lotus', mode: 'light', pair: 'kanagawa-wave' },
]

const KEY = 'theme'
// Remember the last theme picked in each mode, so the header day/night toggle can
// return to the exact dark (or light) theme you were on — even with several darks
// like Kanagawa Wave and Dragon, where a single `pair` can't capture the choice.
const LAST_LIGHT = 'theme.lastLight'
const LAST_DARK = 'theme.lastDark'
const bySlug = (s: string | null) => THEMES.find((t) => t.slug === s)

export function getTheme(): string {
  const v = localStorage.getItem(KEY)
  return bySlug(v) ? (v as string) : 'auto'
}

export function applyTheme(slug: string): void {
  const root = document.documentElement
  if (slug === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', slug)
  try {
    localStorage.setItem(KEY, slug)
    // Record the concrete theme as the remembered light/dark for its mode.
    const t = bySlug(slug)
    if (t && slug !== 'auto') localStorage.setItem(t.mode === 'dark' ? LAST_DARK : LAST_LIGHT, slug)
  } catch {
    // storage unavailable; theme still applied for this session
  }
  window.dispatchEvent(new CustomEvent('firebin:theme'))
}

// The last theme picked in a mode (validated), or null if none/invalid.
function storedFor(mode: Mode): string | null {
  try {
    const stored = localStorage.getItem(mode === 'dark' ? LAST_DARK : LAST_LIGHT)
    if (stored && bySlug(stored)?.mode === mode) return stored
  } catch {
    // ignore
  }
  return null
}

// The currently-effective light/dark mode (for the header sun/moon icon).
export function currentMode(): Mode {
  const slug = getTheme()
  if (slug === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  return bySlug(slug)?.mode ?? 'dark'
}

// Header day/night toggle.
//  • dark → light: go to this theme's declared light pair first (so both Kanagawa
//    darks land on the one Lotus), else the last light you used, else FireBin Light.
//  • light → dark: return to the exact dark you last used (so Lotus → back to
//    Dragon if that's where you were), else this theme's dark pair, else FireBin Dark.
export function toggleMode(): void {
  const cur = bySlug(getTheme())
  if (currentMode() === 'dark') {
    const pair = cur?.pair && bySlug(cur.pair)?.mode === 'light' ? cur.pair : null
    applyTheme(pair ?? storedFor('light') ?? 'light')
  } else {
    const pair = cur?.pair && bySlug(cur.pair)?.mode === 'dark' ? cur.pair : null
    applyTheme(storedFor('dark') ?? pair ?? 'dark')
  }
}

// Apply the saved theme as early as possible (called before render in main).
export function initTheme(): void {
  const slug = getTheme()
  if (slug !== 'auto') document.documentElement.setAttribute('data-theme', slug)
}
