// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// The always-at-the-bottom credit + version bar. Shows on the app shell and the
// login screen. Server version comes from the public /health endpoint, so it
// works before sign-in too.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'

export function AppFooter() {
  const [serverVersion, setServerVersion] = useState<string | null>(null)

  useEffect(() => {
    api.health().then((h) => setServerVersion(h.version)).catch(() => undefined)
  }, [])

  return (
    <footer className="appfoot">
      <a className="left" href="https://fireball1725.ca" target="_blank" rel="noreferrer noopener">
        <img src="/fireball-logo.png" alt="FireBall1725" width={16} height={16} style={{ objectFit: 'contain' }} />
        Created by FireBall1725 in Ontario, Canada <span aria-label="Canada" title="Ontario, Canada">🇨🇦</span>
      </a>
      <div className="right">
        <span title="Web client version">App {__APP_VERSION__}</span>
        <span title="API server version">Server {serverVersion ?? '…'}</span>
        <Link to="/settings?section=about">Licences</Link>
      </div>
    </footer>
  )
}
