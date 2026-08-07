// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readBarcodes, prepareZXingModule, type ReaderOptions } from 'zxing-wasm/reader'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import { api, type ScanResult, type StorageLocation, type EnrichedPart, type PriceBreak, type Category, type AdjustKind } from '../lib/api'
import { num } from '../lib/format'
import { parseFirebinPartLink, resolveFirebinPart, parseFirebinStockLink, resolveFirebinStock, parseFirebinLocationLink, resolveFirebinLocation } from '../lib/deepLink'
import { useBarcodeScanner } from '../lib/useBarcodeScanner'
import { PartForm, type PartDraft, type DraftSupplier } from './PartForm'
import { icon } from '../lib/icons'
import { mdiClose, mdiBarcodeScan } from '@mdi/js'

// Only import supplier SKUs from these major distributors on enrichment — skip
// the long tail of obscure brokers Octopart lists.
const MAJOR_DISTRIBUTORS = /digi-?key|mouser|lcsc|arrow|newark|element14|farnell|avnet|\btme\b/i

// Point the WASM loader at the bundled, same-origin wasm (self-hosted / offline
// safe — no CDN). zxing-cpp reads Data Matrix reliably, unlike the JS port.
prepareZXingModule({ overrides: { locateFile: () => wasmUrl } })

// Distributor bags carry the EIGP data in a Data Matrix; the Code128 1-D codes
// on the same label are the distributor's internal refs (not the MPN), so we
// deliberately don't scan for them — otherwise the reader locks onto the wrong
// barcode. QR is kept for the rare label that uses it.
const READ_OPTS: ReaderOptions = {
  formats: ['DataMatrix', 'QRCode'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 1,
}

// preprocess converts a frame to grayscale and stretches its contrast in place.
// Phone captures of distributor bags often have a heavy colour cast (pink/purple
// white balance) and low contrast that defeats the decoder even though the code
// looks clear; greyscale + contrast-stretch is what makes it lock in. Uses a
// small percentile clip so a glare highlight doesn't blow out the range.
function preprocess(img: ImageData): void {
  const d = img.data
  const n = d.length / 4
  const lum = new Uint8Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
    lum[j] = g
    hist[g]++
  }
  // 2% / 98% percentile bounds for a robust stretch.
  const clip = Math.floor(n * 0.02)
  let lo = 0
  let hi = 255
  let acc = 0
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > clip) { lo = v; break } }
  acc = 0
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > clip) { hi = v; break } }
  const range = Math.max(1, hi - lo)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    let v = ((lum[j] - lo) * 255) / range
    v = v < 0 ? 0 : v > 255 ? 255 : v
    d[i] = d[i + 1] = d[i + 2] = v | 0
  }
}

// Decode the raw bytes (preserving the GS/RS control chars EIGP 114 relies on).
function resultText(r: { bytes: Uint8Array; text: string }): string {
  try {
    return new TextDecoder().decode(r.bytes)
  } catch {
    return r.text
  }
}

export function ScanModal({ onClose, initialCode, mode = 'camera', onResolvedPart, onResolvedLot }: { onClose: () => void; initialCode?: string; mode?: 'camera' | 'scanner'; onResolvedPart?: (id: string) => void; onResolvedLot?: (id: string) => void }) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<HTMLInputElement>(null)
  const [camError, setCamError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manual, setManual] = useState('')

  // Acquire the camera ourselves (control srcObject + play() explicitly), then
  // scan frames on a throttled loop with zxing-wasm. Each effect run owns and
  // tears down only its own stream, so React StrictMode can't leave a
  // detached-but-live stream (green light on, no feed).
  useEffect(() => {
    if (result || initialCode || mode === 'scanner') return // handed a code, or scanner mode — no camera
    let stopped = false
    let stream: MediaStream | null = null
    let timer: number | undefined
    const canvas = document.createElement('canvas')

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Request a high-res feed so a small, dense Data Matrix has enough
          // pixels to decode.
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
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
            // Decode only the centre reticle region (matches the on-screen box):
            // it isolates the Data Matrix from other label barcodes and gives it
            // more effective resolution than scanning the whole frame.
            const iw = vid.videoWidth
            const ih = vid.videoHeight
            const cw = Math.round(iw * 0.6)
            const ch = Math.round(ih * 0.64)
            const sx = Math.round((iw - cw) / 2)
            const sy = Math.round((ih - ch) / 2)
            canvas.width = cw
            canvas.height = ch
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(vid, sx, sy, cw, ch, 0, 0, cw, ch)
              const frame = ctx.getImageData(0, 0, cw, ch)
              preprocess(frame) // greyscale + contrast-stretch to beat colour cast
              try {
                const results = await readBarcodes(frame, READ_OPTS)
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

  // Function declaration, not a const arrow: the camera loop above and the
  // initial-code effect both call this before this line is reached. A hoisted
  // declaration has no temporal dead zone, and the binding is never
  // reassigned, so there is no stale-closure hazard either.
  async function handleCode(raw: string) {
    // FireBin's own label QR: jump straight to the part instead of the
    // distributor-barcode lookup.
    const link = parseFirebinPartLink(raw)
    if (link != null) {
      setBusy(true)
      const id = await resolveFirebinPart(link)
      setBusy(false)
      if (id) {
        // Prefer the scan action menu (quick add/remove/move); fall back to nav.
        if (onResolvedPart) onResolvedPart(id)
        else { onClose(); navigate(`/parts/${id}`) }
        return
      }
      setCamError('That FireBin code did not match a part.')
      return
    }
    const lotLink = parseFirebinStockLink(raw)
    if (lotLink != null) {
      setBusy(true)
      const lot = await resolveFirebinStock(lotLink)
      setBusy(false)
      if (lot && onResolvedLot) { onResolvedLot(lot.id); return }
      if (lot) { onClose(); navigate(`/parts/${lot.part_id}`); return }
      setCamError('That FireBin code did not match a lot.')
      return
    }
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

  // A code handed in (e.g. from a USB keyboard-wedge scanner) is processed once
  // on open, skipping the camera.
  const started = useRef(false)
  useEffect(() => {
    if (initialCode && !started.current) {
      started.current = true
      handleCode(initialCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode])

  // Scanner mode: keep the capture field focused so a wedge scanner types into it.
  useEffect(() => {
    if (mode === 'scanner' && !result) scannerRef.current?.focus()
  }, [mode, result])

  const onFile = async (file: File) => {
    setBusy(true)
    setCamError(null)
    try {
      // Try a greyscale + contrast-stretched version first (beats the colour
      // cast phone photos of bags have), then fall back to the raw image.
      let results: Awaited<ReturnType<typeof readBarcodes>> = []
      try {
        const bmp = await createImageBitmap(file)
        const c = document.createElement('canvas')
        c.width = bmp.width
        c.height = bmp.height
        const cx = c.getContext('2d')
        if (cx) {
          cx.drawImage(bmp, 0, 0)
          const img = cx.getImageData(0, 0, c.width, c.height)
          preprocess(img)
          results = await readBarcodes(img, READ_OPTS)
        }
      } catch {
        // fall through to raw decode
      }
      if (!results.length) results = await readBarcodes(file, READ_OPTS)
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
    <div className="overlay">
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>{mode === 'scanner' ? 'Scan with scanner' : 'Scan intake'}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>

        {result ? (
          <ScanResultView
            result={result}
            onClose={onClose}
            onRescan={() => { setResult(null); setManual('') }}
            navigate={navigate}
          />
        ) : mode === 'scanner' ? (
          <div className="modal-b">
            <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 2px' }}>
              {icon(mdiBarcodeScan, { size: 46, style: { color: 'var(--accent)' } })}
            </div>
            <p className="c-dim" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 4 }}>
              Scan the barcode with your USB or Bluetooth scanner — it types the code and presses Enter.
            </p>
            <input
              ref={scannerRef}
              className="input mono"
              style={{ marginTop: 12, textAlign: 'center', fontSize: 15, padding: '12px' }}
              value={manual}
              placeholder="Waiting for scan…"
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) handleCode(manual.trim()) }}
            />
            {busy && <p className="c-dim" style={{ fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>Reading…</p>}
            {camError && <p className="c-dim" style={{ fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{camError}</p>}
            <p className="c-faint" style={{ fontSize: 12, marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
              Nothing happening? Click the field above first, then scan. You can also type the code and press Enter.
            </p>
          </div>
        ) : (
          <div className="modal-b">
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
          </div>
        )}
      </div>
    </div>
  )
}

// Common part families mapped to a clean, pluralized category name. Octopart's
// raw category ("Multilayer Ceramic Capacitors MLCC") is too specific to store,
// so we collapse it to a tidy bucket.
const CATEGORY_FAMILIES: [RegExp, string][] = [
  [/capacitor/i, 'Capacitors'],
  [/resistor/i, 'Resistors'],
  [/inductor|choke/i, 'Inductors'],
  [/ferrite/i, 'Ferrite Beads'],
  [/\bled\b/i, 'LEDs'],
  [/diode/i, 'Diodes'],
  [/transistor|mosfet|\bbjt\b/i, 'Transistors'],
  [/crystal|resonator/i, 'Crystals'],
  [/oscillator/i, 'Oscillators'],
  [/regulator|\bpmic\b|\bldo\b/i, 'Voltage Regulators'],
  [/microcontroller|\bmcu\b/i, 'Microcontrollers'],
  [/connector|header|socket|\bjack\b/i, 'Connectors'],
  [/switch/i, 'Switches'],
  [/relay/i, 'Relays'],
  [/fuse/i, 'Fuses'],
  [/module/i, 'Modules'],
  [/sensor/i, 'Sensors'],
]

// suggestCategory turns an enriched category string into a category name to
// pre-fill: first an existing category whose base word appears in it (so we
// reuse "Capacitors" rather than making a near-duplicate), then a known family,
// else blank for the user to type.
function suggestCategory(enrichedCat: string, existing: Category[]): string {
  const c = enrichedCat.toLowerCase()
  if (!c) return ''
  for (const cat of existing) {
    const base = cat.name.toLowerCase().replace(/s$/, '')
    if (base.length > 2 && c.includes(base)) return cat.name
  }
  for (const [re, label] of CATEGORY_FAMILIES) {
    if (re.test(enrichedCat)) return label
  }
  return ''
}

// decodedCard renders the read-only "what the barcode said" summary shown above
// both the match and create branches.
function decodedCard(parsed: ScanResult['parsed'], style?: React.CSSProperties) {
  return (
    <div className="card" style={{ boxShadow: 'none', ...style }}>
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
  const [categories, setCategories] = useState<Category[]>([])
  const [enriched, setEnriched] = useState<EnrichedPart | null>(null)
  const [enriching, setEnriching] = useState(!match && !!parsed.mpn)

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  // On a no-match scan, look the MPN up (Nexar/Octopart) to pre-fill the create
  // form. Silently no-ops if enrichment isn't configured or finds nothing.
  useEffect(() => {
    if (match || !parsed.mpn) return
    setEnriching(true)
    api
      .enrich(parsed.mpn)
      .then((r) => setEnriched(r.found && r.part ? r.part : null))
      .catch(() => undefined)
      .finally(() => setEnriching(false))
  }, [match, parsed.mpn])

  const note = `scan${parsed.customer_part ? ' · ' + parsed.customer_part : ''}`

  // ── Match: one-tap add-to-stock ────────────────────────────────────────────
  if (match) {
    return (
      <MatchView
        match={match}
        parsed={parsed}
        note={note}
        onRescan={onRescan}
        onDone={(id) => { onClose(); navigate(`/parts/${id}`) }}
      />
    )
  }

  // ── No match: the same create form the manual "Add item" uses, pre-filled ───
  if (enriching) {
    return (
      <div className="modal-b">
        {decodedCard(parsed, { marginBottom: 14 })}
        <p style={{ marginTop: 0, fontSize: 13 }} className="c-dim">Looking up part data…</p>
      </div>
    )
  }

  // Build the supplier SKUs to import: the distributor we scanned from
  // (authoritative) plus the major distributors Octopart lists (with prices).
  const suppliers: DraftSupplier[] = []
  const seen = new Set<string>()
  const push = (supplier: string, sku: string, pricing: PriceBreak[], url?: string, packaging?: string) => {
    const key = `${supplier.toLowerCase()}|${sku.toLowerCase()}`
    if (!supplier || !sku || seen.has(key)) return
    seen.add(key)
    suppliers.push({ supplier, sku, url, packaging, pricing })
  }
  if (parsed.distributor && parsed.customer_part) push(parsed.distributor, parsed.customer_part, [])
  for (const s of enriched?.suppliers ?? []) {
    if (MAJOR_DISTRIBUTORS.test(s.name)) push(s.name, s.sku, s.prices, s.url, s.packaging)
  }

  const draft: PartDraft = {
    name: enriched?.name ?? '',
    category: suggestCategory(enriched?.category || '', categories),
    package: enriched?.package || '',
    description: enriched?.description || '',
    parameters: enriched?.parameters?.map((p) => ({ name: p.name, value: p.value, units: p.units })) ?? [],
    mpn: parsed.mpn || '',
    manufacturer: enriched?.manufacturer || '',
    datasheet_url: enriched?.datasheet_url || '',
    quantity: parsed.quantity > 0 ? String(parsed.quantity) : '',
    suppliers,
  }

  const header = (
    <>
      {decodedCard(parsed)}
      {enriched ? (
        <p className="c-dim" style={{ fontSize: 12.5, margin: 0 }}>
          Auto-filled from Octopart. Review and adjust, then create.
        </p>
      ) : (
        <p className="c-dim" style={{ fontSize: 12.5, margin: 0 }}>
          No part with this MPN yet. Name it — the MPN becomes a manufacturer part under it.
        </p>
      )}
    </>
  )

  return (
    <PartForm
      categories={categories}
      initial={draft}
      header={header}
      note={note}
      submitLabel="Create part & add stock"
      onCancel={onRescan}
      onCreated={(id) => { onClose(); navigate(`/parts/${id}`) }}
    />
  )
}

// MatchView: the scanned MPN already exists — just book stock into it.
function MatchView({
  match,
  parsed,
  note,
  onRescan,
  onDone,
}: {
  match: NonNullable<ScanResult['match']>
  parsed: ScanResult['parsed']
  note: string
  onRescan: () => void
  onDone: (partID: string) => void
}) {
  // A matched scan is an inventory action, not just a receive: add stock from a
  // bag, remove when pulling parts (the "scan the bin label to draw down" case),
  // or count to set an absolute quantity. No API/enrichment call — the part is
  // already known.
  const [kind, setKind] = useState<AdjustKind>('add')
  const [qty, setQty] = useState(parsed.quantity > 0 ? String(parsed.quantity) : '')
  const [locationID, setLocationID] = useState('')
  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.listLocations().then(setLocations).catch(() => undefined)
  }, [])

  // A wedge scanner firing a location label on this screen would otherwise type
  // its barcode into the quantity box. Intercept scans and resolve a known
  // location as the destination instead; ignore anything that isn't a location
  // so a stray part or bag scan is harmless. Manual typing is slower than a
  // scan burst, so the hook leaves it alone.
  useBarcodeScanner(async (code) => {
    const link = parseFirebinLocationLink(code)
    let loc: StorageLocation | null
    try {
      loc = link != null ? await resolveFirebinLocation(link) : await api.scanLocation(code)
    } catch {
      loc = null
    }
    if (!loc) return
    const resolved = loc
    setLocations((prev) => (prev.some((l) => l.id === resolved.id) ? prev : [...prev, resolved]))
    setLocationID(resolved.id)
  })

  const apply = async () => {
    const q = parseFloat(qty)
    if (isNaN(q) || q < 0) return
    setBusy(true)
    try {
      await api.adjustStock(match.part_id, { kind, quantity: q, location_id: locationID || null, note })
      onDone(match.part_id)
    } finally {
      setBusy(false)
    }
  }

  const btnLabel =
    kind === 'add' ? `Add ${qty || '0'} to stock`
    : kind === 'remove' ? `Remove ${qty || '0'} from stock`
    : `Set stock to ${qty || '0'}`

  return (
    <div className="modal-b">
      {decodedCard(parsed, { marginBottom: 14 })}
      <p style={{ marginTop: 0, fontSize: 13.5 }}>
        Matches <span style={{ fontWeight: 600 }}>{match.part_name}</span> in your inventory.
      </p>
      <div className="seg" style={{ marginBottom: 10 }}>
        {(['add', 'remove', 'count'] as AdjustKind[]).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={`seg-btn ${kind === k ? 'on' : ''}`}>{k}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="fieldlabel"><span>{kind === 'count' ? 'Counted quantity' : 'Quantity'}</span>
          <input type="number" className="input" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </label>
        <label className="fieldlabel"><span>Location</span>
          <select className="input" value={locationID} onChange={(e) => setLocationID(e.target.value)}>
            <option value="">No location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button className="btn" onClick={onRescan}>Scan again</button>
        <button className="btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !qty} onClick={apply}>
          {busy ? '…' : btnLabel}
        </button>
      </div>
    </div>
  )
}
