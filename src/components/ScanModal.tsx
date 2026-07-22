// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readBarcodes, prepareZXingModule, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { api, type ScanResult, type StorageLocation, type EnrichedPart } from '../lib/api'
import { num } from '../lib/format'

// Point the WASM loader at the bundled, same-origin wasm (self-hosted / offline
// safe — no CDN). zxing-cpp reads Data Matrix reliably, unlike the JS port.
prepareZXingModule({ overrides: { locateFile: () => wasmUrl } })

const READ_OPTS: ReaderOptions = {
  formats: ['DataMatrix', 'Code128', 'QRCode'],
  tryHarder: true,
  maxNumberOfSymbols: 1,
}

// Decode the raw bytes (preserving the GS/RS control chars EIGP 114 relies on).
function resultText(r: { bytes: Uint8Array; text: string }): string {
  try {
    return new TextDecoder().decode(r.bytes)
  } catch {
    return r.text
  }
}

export function ScanModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manual, setManual] = useState('')

  // Acquire the camera ourselves (control srcObject + play() explicitly), then
  // scan frames on a throttled loop with zxing-wasm. Each effect run owns and
  // tears down only its own stream, so React StrictMode can't leave a
  // detached-but-live stream (green light on, no feed).
  useEffect(() => {
    if (result) return
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    const canvas = document.createElement('canvas')

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        const v = videoRef.current
        if (stopped || !v) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        v.srcObject = stream
        await v.play().catch(() => undefined)

        const tick = async () => {
          if (stopped || !videoRef.current) return
          const vid = videoRef.current
          if (vid.videoWidth > 0) {
            canvas.width = vid.videoWidth
            canvas.height = vid.videoHeight
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(vid, 0, 0)
              try {
                const results = await readBarcodes(
                  ctx.getImageData(0, 0, canvas.width, canvas.height),
                  READ_OPTS,
                )
                if (results.length && !stopped) {
                  handleCode(resultText(results[0]))
                  return
                }
              } catch {
                // frame miss — keep scanning
              }
            }
          }
          if (!stopped) timer = window.setTimeout(tick, 250)
        }
        tick()
      } catch {
        setCamError('No camera available — upload a photo or type/scan the code below.')
      }
    })()

    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const handleCode = async (raw: string) => {
    setBusy(true)
    try {
      const r = await api.scan(raw)
      setResult(r)
    } catch {
      setCamError('Could not read that code. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File) => {
    setBusy(true)
    setCamError(null)
    try {
      const results = await readBarcodes(file, READ_OPTS)
      if (results.length) {
        await handleCode(resultText(results[0]))
      } else {
        setCamError('No barcode found in that image.')
      }
    } catch {
      setCamError('Could not read that image.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Scan intake</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="modal-b">
          {!result ? (
            <>
              <p className="c-dim" style={{ fontSize: 13, marginTop: 0 }}>
                Point the camera at a distributor bag's Data&nbsp;Matrix, or upload a photo.
              </p>
              <div
                style={{
                  position: 'relative', borderRadius: 12, overflow: 'hidden',
                  background: '#000', aspectRatio: '4 / 3', border: '1px solid var(--border)',
                }}
              >
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div style={{
                  position: 'absolute', inset: '18% 22%', border: '2px solid var(--accent)',
                  borderRadius: 8, boxShadow: '0 0 0 100vmax rgba(0,0,0,0.35)',
                }} />
              </div>

              {busy && <p className="c-dim" style={{ fontSize: 12.5, marginTop: 10 }}>Reading…</p>}
              {camError && <p className="c-dim" style={{ fontSize: 12.5, marginTop: 10 }}>{camError}</p>}

              <div className="flex gap-2" style={{ marginTop: 12 }}>
                <label className="btn" style={{ flex: 1, justifyContent: 'center' }}>
                  Upload photo
                  <input
                    type="file" accept="image/*" capture="environment" hidden
                    onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                  />
                </label>
              </div>

              <div style={{ marginTop: 12 }}>
                <span className="eyebrow">Or paste / USB-scan</span>
                <div className="flex gap-2" style={{ marginTop: 6 }}>
                  <input
                    className="input mono" value={manual} placeholder="1P… or raw code"
                    onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) handleCode(manual.trim()) }}
                  />
                  <button className="btn primary" disabled={!manual.trim() || busy} onClick={() => handleCode(manual.trim())}>
                    Decode
                  </button>
                </div>
              </div>
            </>
          ) : (
            <ScanResultView
              result={result}
              onClose={onClose}
              onRescan={() => { setResult(null); setManual('') }}
              navigate={navigate}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function ScanResultView({
  result,
  onClose,
  onRescan,
  navigate,
}: {
  result: ScanResult
  onClose: () => void
  onRescan: () => void
  navigate: (to: string) => void
}) {
  const { parsed, match } = result
  const [qty, setQty] = useState(parsed.quantity > 0 ? String(parsed.quantity) : '')
  const [name, setName] = useState('')
  const [locationID, setLocationID] = useState('')
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [busy, setBusy] = useState(false)
  const [enriched, setEnriched] = useState<EnrichedPart | null>(null)
  const [enriching, setEnriching] = useState(false)

  useEffect(() => {
    api.listLocations().then(setLocations).catch(() => undefined)
  }, [])

  // On a no-match scan, look the MPN up (Nexar/Octopart) to auto-name and fill
  // parameters. Silently no-ops if enrichment isn't configured or finds nothing.
  useEffect(() => {
    if (match || !parsed.mpn) return
    setEnriching(true)
    api
      .enrich(parsed.mpn)
      .then((r) => {
        if (r.found && r.part) {
          setEnriched(r.part)
          setName(r.part.name)
        }
      })
      .catch(() => undefined)
      .finally(() => setEnriching(false))
  }, [match, parsed.mpn])

  const note = `scan${parsed.customer_part ? ' · ' + parsed.customer_part : ''}`

  const addToExisting = async () => {
    if (!match) return
    setBusy(true)
    try {
      const q = parseFloat(qty)
      if (!isNaN(q) && q > 0) {
        await api.adjustStock(match.part_id, { kind: 'add', quantity: q, location_id: locationID || null, note })
      }
      onClose()
      navigate(`/parts/${match.part_id}`)
    } finally {
      setBusy(false)
    }
  }

  const createNew = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      const part = await api.createPart({
        name: name.trim(),
        package: enriched?.package || null,
        description: enriched?.description || null,
        parameters: enriched?.parameters.map((p) => ({ name: p.name, value: p.value })) ?? [],
      })
      if (parsed.mpn) {
        await api.createManufacturerPart(part.id, {
          manufacturer: enriched?.manufacturer || '',
          mpn: parsed.mpn,
          datasheet_url: enriched?.datasheet_url || null,
        })
      }
      const q = parseFloat(qty)
      if (!isNaN(q) && q > 0) {
        await api.adjustStock(part.id, { kind: 'add', quantity: q, location_id: locationID || null, note })
      }
      onClose()
      navigate(`/parts/${part.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ boxShadow: 'none', marginBottom: 14 }}>
        <div style={{ padding: 14 }}>
          <span className="eyebrow">Decoded</span>
          <div className="mono" style={{ fontSize: 15, marginTop: 4 }}>{parsed.mpn || <span className="c-faint">no MPN</span>}</div>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
            {parsed.quantity > 0 && <span className="pill ghost">qty {num(parsed.quantity)}</span>}
            {parsed.distributor && <span className="pill ghost">{parsed.distributor}</span>}
            {parsed.customer_part && <span className="tag">{parsed.customer_part}</span>}
            {parsed.date_code && <span className="tag">DC {parsed.date_code}</span>}
            {parsed.country_of_origin && <span className="tag">{parsed.country_of_origin}</span>}
          </div>
        </div>
      </div>

      {match ? (
        <div>
          <p style={{ marginTop: 0, fontSize: 13.5 }}>
            Matches <span style={{ fontWeight: 600 }}>{match.part_name}</span> in your inventory.
          </p>
          <QtyLoc qty={qty} setQty={setQty} locationID={locationID} setLocationID={setLocationID} locations={locations} />
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onRescan}>Scan again</button>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={addToExisting}>
              Add {qty || '0'} to stock
            </button>
          </div>
        </div>
      ) : (
        <div>
          {enriching && (
            <p style={{ marginTop: 0, fontSize: 13 }} className="c-dim">Looking up part data…</p>
          )}
          {enriched ? (
            <div className="card" style={{ boxShadow: 'none', marginTop: 0, marginBottom: 12 }}>
              <div style={{ padding: 12 }}>
                <span className="eyebrow">Auto-filled from Octopart</span>
                <div className="flex flex-wrap gap-2" style={{ marginTop: 6 }}>
                  {enriched.manufacturer && <span className="pill ghost">{enriched.manufacturer}</span>}
                  {enriched.category && <span className="tag">{enriched.category}</span>}
                  {enriched.package && <span className="tag">{enriched.package}</span>}
                  {enriched.parameters.length > 0 && <span className="tag">{enriched.parameters.length} params</span>}
                  {enriched.datasheet_url && (
                    <a href={enriched.datasheet_url} target="_blank" rel="noreferrer" className="tag" style={{ color: 'var(--accent)' }}>datasheet ↗</a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            !enriching && (
              <p style={{ marginTop: 0, fontSize: 13.5 }} className="c-dim">
                No part with this MPN yet. Name it — <span className="mono">{parsed.mpn}</span> becomes a manufacturer part under it.
              </p>
            )
          )}
          <label className="fieldlabel"><span>Part name</span>
            <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. 4.7µF Capacitor 1206" />
          </label>
          <div style={{ marginTop: 10 }}>
            <QtyLoc qty={qty} setQty={setQty} locationID={locationID} setLocationID={setLocationID} locations={locations} />
          </div>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onRescan}>Scan again</button>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !name.trim()} onClick={createNew}>
              Create part &amp; add stock
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function QtyLoc({
  qty, setQty, locationID, setLocationID, locations,
}: {
  qty: string; setQty: (v: string) => void
  locationID: string; setLocationID: (v: string) => void
  locations: StorageLocation[]
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="fieldlabel"><span>Quantity</span>
        <input type="number" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
      </label>
      <label className="fieldlabel"><span>Location</span>
        <select className="input" value={locationID} onChange={(e) => setLocationID(e.target.value)}>
          <option value="">No location</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
    </div>
  )
}
