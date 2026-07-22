// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

type NavDef = { to: string; label: string; end?: boolean; icon: React.ReactNode }

const nav: NavDef[] = [
  { to: '/', label: 'Dashboard', end: true, icon: icon('M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z') },
  { to: '/parts', label: 'Parts', icon: icon('M4 7h16M4 12h16M4 17h16') },
  { to: '/locations', label: 'Locations', icon: icon('M3 3h18v18H3zM3 9h18M9 9v12') },
  { to: '/tokens', label: 'API Tokens', icon: icon('M15 7a4 4 0 1 0-3.5 6H14v3h3v-3h2l2-2-2-2z M7 13v4h3') },
]

// Page title + eyebrow keyed off the current route.
function crumbFor(path: string): [string, string] {
  if (path === '/') return ['Workspace', 'Dashboard']
  if (path.startsWith('/parts/')) return ['Inventory · Parts', 'Part']
  if (path.startsWith('/parts')) return ['Inventory', 'Parts']
  if (path.startsWith('/locations')) return ['Inventory', 'Locations']
  if (path.startsWith('/tokens')) return ['Settings', 'API Tokens']
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

      {scanOpen && <ScanStub onClose={() => setScanOpen(false)} />}
    </div>
  )
}

// Placeholder scan modal. The real EIGP 114 barcode intake flow is wired later;
// this shows the intended entry point without faking a result.
function ScanStub({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          {icon('M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8v8M11 8v8M15 8v8')}
          <h3>Scan intake</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon('M18 6 6 18M6 6l12 12')}
          </button>
        </div>
        <div className="modal-b">
          <div className="empty">
            Point a scanner (or the phone camera on mobile) at a Digi-Key / Mouser / LCSC bag. The
            EIGP&nbsp;114 Data Matrix decodes to an MPN and quantity, then enriches and adds stock in
            one tap.
            <div className="eyebrow" style={{ marginTop: 12 }}>Wiring in progress</div>
          </div>
        </div>
        <div className="modal-f">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
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
