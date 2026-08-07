// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// Direct dependencies and their licences, read from the installed packages.
const WEB_LIBS: [string, string][] = [
  ['React · React DOM', 'MIT'],
  ['React Router', 'MIT'],
  ['i18next · react-i18next', 'MIT'],
  ['Material Design Icons (@mdi/js)', 'Apache-2.0'],
  ['zxing-wasm', 'MIT'],
  ['qrcode-generator', 'MIT'],
  ['lz-string', 'MIT'],
  ['Prism (prismjs)', 'MIT'],
  ['Vite', 'MIT'],
  ['Tailwind CSS', 'MIT'],
  ['TypeScript', 'Apache-2.0'],
  ['ESLint', 'MIT'],
]

const API_LIBS: [string, string][] = [
  ['pgx (PostgreSQL driver)', 'MIT'],
  ['River (job queue)', 'MPL-2.0'],
  ['golang-migrate', 'MIT'],
  ['golang-jwt', 'MIT'],
  ['google/uuid', 'BSD-3-Clause'],
  ['go-pdf/fpdf', 'MIT'],
  ['boombuler/barcode', 'MIT'],
  ['golang.org/x/crypto', 'BSD-3-Clause'],
  ['golang.org/x/image and the Go fonts', 'BSD-3-Clause'],
]

function LibList({ title, libs }: { title: string; libs: [string, string][] }) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {libs.map(([name, licence]) => (
          <div
            key={name}
            className="flex items-center justify-between"
            style={{ padding: '7px 0', borderBottom: '1px solid var(--border)', gap: 12 }}
          >
            <span className="c-dim text-sm" style={{ minWidth: 0 }}>{name}</span>
            <span className="tag mono" style={{ flex: 'none' }}>{licence}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AboutSettings() {
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-h"><h2>Licences</h2></div>
        <div className="p-4">
          <p className="c-faint text-sm" style={{ marginBottom: 16 }}>
            FireBin is free and open source under the GNU AGPL-3.0; its component symbols are original
            artwork, also AGPL-3.0. It is built on the projects below, listed so the required notices
            stay in one place. Each keeps its own copyright.
          </p>
          <div className="grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <LibList title="Web client" libs={WEB_LIBS} />
            <LibList title="API server" libs={API_LIBS} />
          </div>
        </div>
      </div>
    </div>
  )
}
