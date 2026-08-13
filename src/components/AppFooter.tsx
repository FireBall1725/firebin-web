// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The always-at-the-bottom credit + version bar. Shows on the app shell and the
// login screen. Server version comes from the public /health endpoint, so it
// works before sign-in too.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

// The flag, drawn rather than typed.
//
// It used to be the 🇨🇦 emoji, which is a pair of regional indicator letters the
// font is expected to substitute with a flag. Windows never has: Segoe UI Emoji
// ships no flag glyphs, so every Windows user saw two boxed letters reading CA
// where the flag should be.
//
// Geometry from the Wikimedia Commons Flag_of_Canada.svg, which is public
// domain — the leaf is 11 points on a defined grid and eyeballing it produces
// something that reads as a snowflake. The white band and the leaf are one
// path: the leaf is a subpath wound the other way, so it is a hole and the red
// beneath shows through.
function CanadaFlag({ height = 11 }: { height?: number }) {
  return (
    <svg
      width={height * 2}
      height={height}
      viewBox="0 0 9600 4800"
      role="img"
      aria-label="Canada"
      // The white band would disappear into a pale footer without it.
      style={{ border: '1px solid var(--border)', borderRadius: 1 }}
    >
      <title>Canada</title>
      <path fill="#f00" d="m0 0h2400l99 99h4602l99-99h2400v4800h-2400l-99-99h-4602l-99 99H0z" />
      <path
        fill="#fff"
        d="m2400 0h4800v4800h-4800zm2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z"
      />
    </svg>
  )
}

export function AppFooter() {
  const [serverVersion, setServerVersion] = useState<string | null>(null)

  useEffect(() => {
    api.health().then((h) => setServerVersion(h.version)).catch(() => undefined)
  }, [])

  return (
    <footer className="appfoot">
      <a className="left" href="https://fireball1725.ca" target="_blank" rel="noreferrer noopener">
        <img src="/fireball-logo.png" alt="FireBall1725" width={16} height={16} style={{ objectFit: 'contain' }} />
        Created by FireBall1725 in Ontario, Canada
        <CanadaFlag />
      </a>
      <div className="right">
        <span title="Web client version">App {__APP_VERSION__}</span>
        <span title="API server version">Server {serverVersion ?? '…'}</span>
        <Link to="/settings?section=about">Licences</Link>
      </div>
    </footer>
  )
}
