// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { DecodeHintType, BarcodeFormat } from '@zxing/library'
import { api, type ScanResult, type StorageLocation } from '../lib/api'
import { num } from '../lib/format'

// The distributor bags we target are ECC-200 Data Matrix; keep Code128 + QR too.
function makeReader() {
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.DATA_MATRIX,
    BarcodeFormat.CODE_128,
    BarcodeFormat.QR_CODE,
  ])
  return new BrowserMultiFormatReader(hints)
}

export function ScanModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manual, setManual] = useState('')

  // Acquire the camera ourselves (so we control srcObject + play() explicitly),
  // then hand the already-playing <video> to ZXing. Each effect run owns its own
  // stream/controls and tears exactly those down, so React StrictMode's
  // setup→cleanup→setup can't leave a detached-but-live stream (green light on,
  // no feed).
  useEffect(() => {
    if (result) return // stop scanning once we have a hit
    const reader = makeReader()
    let stopped = false
    let stream: MediaStream | null = null
    let controls: IScannerControls | null = null

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
        controls = await reader.decodeFromVideoElement(v, (res) => {
          if (res && !stopped) handleCode(res.getText())
        })
        if (stopped) controls.stop()
      } catch {
        setCamError('No camera available — upload a photo or type/scan the code below.')
      }
    })()

    return () => {
      stopped = true
      controls?.stop()
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
      const url = URL.createObjectURL(file)
      const reader = makeReader()
      const res = await reader.decodeFromImageUrl(url)
      URL.revokeObjectURL(url)
      await handleCode(res.getText())
    } catch {
      setCamError('No barcode found in that image.')
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
  const [name, setName] = useState(parsed.mpn)
  const [locationID, setLocationID] = useState('')
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.listLocations().then(setLocations).catch(() => undefined)
  }, [])

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
    setBusy(true)
    try {
      const part = await api.createPart({ name: name.trim() || parsed.mpn })
      if (parsed.mpn) {
        await api.createManufacturerPart(part.id, { manufacturer: '', mpn: parsed.mpn })
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
          <p style={{ marginTop: 0, fontSize: 13.5 }} className="c-dim">
            No part with this MPN yet. Create one:
          </p>
          <label className="fieldlabel"><span>Part name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Part name" />
          </label>
          <div style={{ marginTop: 10 }}>
            <QtyLoc qty={qty} setQty={setQty} locationID={locationID} setLocationID={setLocationID} locations={locations} />
          </div>
          <div className="flex gap-2" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onRescan}>Scan again</button>
            <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={createNew}>
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
