// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { ScanModal } from './ScanModal'
import { ScanActionMenu } from './ScanActionMenu'
import { BatchScanModal } from './BatchScanModal'
import { LotActionMenu } from './LotActionMenu'
import { FireBinIcon } from './FireBinIcon'
import { CommandPalette } from './CommandPalette'
import { AppFooter } from './AppFooter'
import { icon } from '../lib/icons'
import { PartFormModal } from './PartForm'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AssistantPopup } from './AssistantPopup'

// useAssistantAvailable reports whether the assistant can answer anything.
//
// The feature ships off, so showing it in the sidebar and floating a button on
// every page before anyone has configured it advertises something that cannot
// work. Asked once per mount rather than per page, and failure counts as off:
// an older server has no such endpoint, and a missing assistant is the right
// reading of that.
function useAssistantAvailable(): boolean {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let active = true
    api.assistantStatus()
      .then((s) => active && setAvailable(s.enabled))
      .catch(() => active && setAvailable(false))
    return () => { active = false }
  }, [])
  return available
}
import { useAuth } from '../auth/AuthContext'
import { useTranslation } from 'react-i18next'
import { api, type Category } from '../lib/api'
import { parseFirebinPartLink, resolveFirebinPart, parseFirebinLocationLink, resolveFirebinLocation, parseFirebinStockLink, resolveFirebinStock } from '../lib/deepLink'
import { mdiCommentQuestionOutline, mdiBarcodeScan, mdiCameraOutline, mdiChevronDown, mdiCogOutline, mdiFileDocumentOutline, mdiFolderOutline, mdiFormatListBulletedSquare, mdiFormatListChecks, mdiMagnify, mdiMapMarkerOutline, mdiMenu, mdiPlus, mdiVectorSquare, mdiViewDashboardOutline, mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js'
import { useBarcodeScanner } from '../lib/useBarcodeScanner'
import { useHardwareScanner, useCameraScan } from '../lib/prefs'
import { currentMode, toggleMode } from '../lib/themes'

type NavDef = { to: string; labelKey: string; end?: boolean; icon: React.ReactNode }

// navFor builds the sidebar. Assistant appears only when it is switched on:
// a nav item that leads to a page saying the feature is off is worse than no
// nav item.
function navFor(assistant: boolean): NavDef[] {
  if (!assistant) return nav
  const out = [...nav]
  out.splice(out.length - 1, 0,
    { to: '/assistant', labelKey: 'nav.assistant', icon: icon(mdiCommentQuestionOutline) })
  return out
}

const nav: NavDef[] = [
  { to: '/', labelKey: 'nav.dashboard', end: true, icon: icon(mdiViewDashboardOutline) },
  { to: '/parts', labelKey: 'nav.parts', icon: icon(mdiFormatListBulletedSquare) },
  { to: '/datasheets', labelKey: 'nav.datasheets', icon: icon(mdiFileDocumentOutline) },
  { to: '/locations', labelKey: 'nav.locations', icon: icon(mdiMapMarkerOutline) },
  { to: '/projects', labelKey: 'nav.projects', icon: icon(mdiFolderOutline) },
  { to: '/kicad', labelKey: 'nav.kicad', icon: icon(mdiVectorSquare) },
  { to: '/settings', labelKey: 'nav.settings', icon: icon(mdiCogOutline) },
]

// Page title + eyebrow keyed off the current route.
function crumbFor(path: string): [string, string] {
  if (path === '/') return ['Workspace', 'Dashboard']
  if (path.startsWith('/parts/')) return ['Inventory · Parts', 'Part']
  if (path.startsWith('/parts')) return ['Inventory', 'Parts']
  if (path.startsWith('/datasheets')) return ['Inventory', 'Datasheets']
  if (path.startsWith('/locations')) return ['Inventory', 'Locations']
  if (path.startsWith('/projects/')) return ['Projects · Boards', 'Project']
  if (path.startsWith('/projects')) return ['Workspace', 'Projects']
  if (path.startsWith('/kicad')) return ['Workspace', 'KiCad libraries']
  if (path.startsWith('/settings')) return ['Workspace', 'Settings']
  return ['Workspace', 'FireBin']
}

export function Layout() {
  const { t } = useTranslation()
  const { user, logout, canWrite } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [sideOpen, setSideOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanMode, setScanMode] = useState<'camera' | 'scanner'>('camera')
  const [scanCode, setScanCode] = useState<string | null>(null)
  const [actionPart, setActionPart] = useState<string | null>(null)
  const [actionLot, setActionLot] = useState<string | null>(null)
  const [moveSignal, setMoveSignal] = useState<{ locationId: string; name: string; n: number } | null>(null)
  const moveNonce = useRef(0)
  const assistantAvailable = useAssistantAvailable()
  const [batchOpen, setBatchOpen] = useState(false)
  const batchScanFn = useRef<((code: string) => void) | null>(null)
  const [alphaHidden, setAlphaHidden] = useState(() => localStorage.getItem('firebin.alphaDismissed') === '1')
  const openScan = (m: 'camera' | 'scanner') => { setScanMode(m); setScanCode(null); setScanOpen(true) }
  const [addOpen, setAddOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])

  // Global palette shortcut: "/" (when not typing in a field) or Cmd/Ctrl+K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
        return
      }
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [mode, setMode] = useState<'light' | 'dark'>(currentMode)
  useEffect(() => {
    const on = () => setMode(currentMode())
    window.addEventListener('firebin:theme', on)
    return () => window.removeEventListener('firebin:theme', on)
  }, [])

  // A USB keyboard-wedge scanner: a physical scan anywhere opens the scan flow
  // pre-loaded with the code (paused while the scan modal is already open). A scan
  // of FireBin's own deep-link QR (firebin://p/<code>) jumps straight to the part
  // instead of the distributor-barcode flow.
  const hwScanner = useHardwareScanner()
  const cameraScan = useCameraScan()
  const scanInto = (code: string) => { setScanMode('camera'); setScanCode(code); setScanOpen(true) }
  const handleScan = (code: string) => {
    // Batch scan mode swallows every scan into its on-screen list.
    if (batchScanFn.current) { batchScanFn.current(code); return }
    // Viewer-role accounts get read-only scanning: a FireBin QR opens the part,
    // lot, or location, but the write flows (action menu, distributor add, batch)
    // stay off since the API would reject the mutation anyway.
    const partCode = parseFirebinPartLink(code)
    if (partCode != null) {
      resolveFirebinPart(partCode).then((id) => {
        if (!id) { if (canWrite) scanInto(code); return }
        if (canWrite) setActionPart(id)
        else navigate(`/parts/${id}`)
      })
      return
    }
    const stockCode = parseFirebinStockLink(code)
    if (stockCode != null) {
      resolveFirebinStock(stockCode).then((lot) => {
        if (!lot) return
        if (canWrite) setActionLot(lot.id)
        else navigate(`/parts/${lot.part_id}`)
      })
      return
    }
    const locCode = parseFirebinLocationLink(code)
    if (locCode != null) {
      // A location scan while the part action menu is open = move the part there;
      // otherwise just jump to the locations page.
      resolveFirebinLocation(locCode).then((loc) => {
        if (!loc) return
        if (canWrite && actionPart) setMoveSignal({ locationId: loc.id, name: loc.name, n: ++moveNonce.current })
        else navigate(`/locations/${loc.id}`)
      })
      return
    }
    if (canWrite) scanInto(code)
  }
  useBarcodeScanner(handleScan, { enabled: hwScanner && !scanOpen })

  // The command palette opens batch scan by firing this event.
  useEffect(() => {
    const on = () => setBatchOpen(true)
    window.addEventListener('firebin:batchscan', on)
    return () => window.removeEventListener('firebin:batchscan', on)
  }, [])

  // Categories power the manual "Add item" form; load once for the whole shell.
  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  const [eyebrow, title] = crumbFor(location.pathname)


  return (
    <div className="app-grid">
      <aside className={`side ${sideOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-lockup" style={{ fontSize: 30, gap: 13 }}>
            <FireBinIcon size={44} className="brand-ico" />
            <span className="brand-name">Fire<b>Bin</b></span>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label eyebrow">Workspace</div>
          {navFor(assistantAvailable).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSideOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              {item.icon}
              {t(item.labelKey)}
            </NavLink>
          ))}
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

      <div className="flex min-w-0 flex-col h-screen overflow-hidden">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setSideOpen((v) => !v)} aria-label="Menu">
            {icon(mdiMenu)}
          </button>
          <div className="crumb">
            <span className="eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
          </div>

          <button className="search" onClick={() => setPaletteOpen(true)} aria-label="Open search (press /)">
            {icon(mdiMagnify)}
            <span className="search-ph">Search MPN, part, bin…</span>
            <span className="kbd">/</span>
          </button>

          <div className="scan-split">
            <button className="scan-btn" onClick={() => openScan(cameraScan ? 'camera' : 'scanner')}>
              {icon(mdiBarcodeScan)}
              Scan
            </button>
            <button
              className="scan-caret"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More add options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              {icon(mdiChevronDown)}
            </button>
            {menuOpen && (
              <>
                <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
                <div className="scan-menu" role="menu">
                  {cameraScan && (
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); openScan('camera') }}
                    >
                      {icon(mdiCameraOutline)}
                      Scan barcode (camera)
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); openScan('scanner') }}
                  >
                    {icon(mdiBarcodeScan)}
                    Scan barcode (scanner)
                  </button>
                  {canWrite && (
                    <button
                      role="menuitem"
                      onClick={() => { setMenuOpen(false); setBatchOpen(true) }}
                    >
                      {icon(mdiFormatListChecks)}
                      Batch scan
                    </button>
                  )}
                  {canWrite && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        setAddOpen(true)
                      }}
                    >
                      {icon(mdiPlus)}
                      Add item manually
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <button className="icon-btn" onClick={toggleMode} aria-label="Toggle light/dark">
            {mode === 'dark' ? icon(mdiWhiteBalanceSunny) : icon(mdiWeatherNight)}
          </button>
        </header>

        <main className="flex-1 min-h-0 overflow-auto">
          {!alphaHidden && (
            <div className="alpha-banner">
              <span>FireBin is in <b>alpha</b> — expect rough edges and breaking changes. Keep a backup (Settings → Data).</span>
              <button className="alpha-x" aria-label="Dismiss" onClick={() => { localStorage.setItem('firebin.alphaDismissed', '1'); setAlphaHidden(true) }}>×</button>
            </div>
          )}
          <div className="mx-auto w-full max-w-6xl px-6 py-7">
            <Outlet />
          </div>
        </main>

        {/* Mounted once here rather than on each page, so every screen has it
            and no new page has to remember to add it. */}
        {assistantAvailable && <AssistantPopup />}

        <AppFooter />
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {scanOpen && (
        <ScanModal
          mode={scanMode}
          initialCode={scanCode ?? undefined}
          onClose={() => { setScanOpen(false); setScanCode(null) }}
          onResolvedPart={(id) => { setScanOpen(false); setScanCode(null); setActionPart(id) }}
          onResolvedLot={(id) => { setScanOpen(false); setScanCode(null); setActionLot(id) }}
        />
      )}
      {actionPart && (
        <ScanActionMenu
          partId={actionPart}
          moveSignal={moveSignal}
          onClose={() => { setActionPart(null); setMoveSignal(null) }}
          onOpenPart={(id) => { setActionPart(null); setMoveSignal(null); navigate(`/parts/${id}`) }}
        />
      )}
      {batchOpen && (
        <BatchScanModal
          registerScan={(fn) => { batchScanFn.current = fn }}
          onClose={() => setBatchOpen(false)}
        />
      )}
      {actionLot && (
        <LotActionMenu
          lotId={actionLot}
          onClose={() => setActionLot(null)}
          onOpenPart={(id) => { setActionLot(null); navigate(`/parts/${id}`) }}
        />
      )}
      {addOpen && (
        <PartFormModal
          categories={categories}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false)
            navigate(`/parts/${id}`)
          }}
        />
      )}
    </div>
  )
}

