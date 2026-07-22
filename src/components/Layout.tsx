// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState } from 'react'
import { ScanModal } from './ScanModal'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type NavDef = { to: string; label: string; end?: boolean; icon: React.ReactNode }

const nav: NavDef[] = [
  { to: '/', label: 'Dashboard', end: true, icon: icon('M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z') },
  { to: '/parts', label: 'Parts', icon: icon('M4 7h16M4 12h16M4 17h16') },
  { to: '/locations', label: 'Locations', icon: icon('M3 3h18v18H3zM3 9h18M9 9v12') },
  { to: '/tokens', label: 'API Tokens', icon: icon('M15 7a4 4 0 1 0-3.5 6H14v3h3v-3h2l2-2-2-2z M7 13v4h3') },
  { to: '/settings', label: 'Settings', icon: icon('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4.6 15H4.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.2 1z') },
]

// Page title + eyebrow keyed off the current route.
function crumbFor(path: string): [string, string] {
  if (path === '/') return ['Workspace', 'Dashboard']
  if (path.startsWith('/parts/')) return ['Inventory · Parts', 'Part']
  if (path.startsWith('/parts')) return ['Inventory', 'Parts']
  if (path.startsWith('/locations')) return ['Inventory', 'Locations']
  if (path.startsWith('/tokens')) return ['Settings', 'API Tokens']
  if (path.startsWith('/settings')) return ['Settings', 'Connections']
  return ['Workspace', 'FireBin']
}

function currentTheme(): 'light' | 'dark' {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'light' || attr === 'dark') return attr
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sideOpen, setSideOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(currentTheme)

  const [eyebrow, title] = crumbFor(location.pathname)

  const toggleTheme = () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      // storage unavailable; theme still applied for this session
    }
    setTheme(next)
  }

  return (
    <div className="app-grid">
      <aside className={`side ${sideOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src="/firelabs-mark.png" alt="FireLabs" className="hex" />
          <div className="brand-name">
            Fire<b>Bin</b>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label eyebrow">Workspace</div>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSideOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
          <button className="nav-item" onClick={() => setScanOpen(true)}>
            {icon('M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8')}
            Scan intake
          </button>
        </nav>

        <div className="side-foot">
          <div className="user">
            <div className="avatar">{(user?.username ?? '?').slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0">
              <div className="user-name truncate">{user?.username}</div>
              <button onClick={() => logout()} className="eyebrow hover-accent" style={{ cursor: 'pointer' }}>
                {user?.is_instance_admin ? 'Admin · ' : ''}Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {sideOpen && <div className="scrim" onClick={() => setSideOpen(false)} />}

      <div className="flex min-w-0 flex-col">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSideOpen((v) => !v)} aria-label="Menu">
            {icon('M4 6h16M4 12h16M4 18h16')}
          </button>
          <div className="crumb">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>

          <div className="search">
            {icon('M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M21 21l-4.3-4.3')}
            <input placeholder="Search MPN, part, bin…" aria-label="Search" />
            <span className="kbd">/</span>
          </div>

          <button className="scan-btn" onClick={() => setScanOpen(true)}>
            {icon('M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8')}
            Scan
          </button>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark'
              ? icon('M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8')
              : icon('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z')}
          </button>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-6xl px-6 py-7">
            <Outlet />
          </div>
        </main>
      </div>

      {scanOpen && <ScanModal onClose={() => setScanOpen(false)} />}
    </div>
  )
}

// icon renders a 24x24 stroked path in the current colour.
function icon(d: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
