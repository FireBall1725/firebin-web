// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

import { useEffect, useMemo, useState } from 'react'
import { api, type LabelMedia, type LabelTemplate, type LabelElement } from '../lib/api'
import { icon } from '../lib/icons'
import { mdiClose, mdiPrinterOutline } from '@mdi/js'
import { renderLabelToCanvas, canvasBitmap } from '../lib/labelCanvas'
import {
  isWebUsbSupported, getGrantedPrinter, requestPrinter, printBitmap, printChain,
  tapeWidthMmFromCode, dotsPerPt, type Bitmap,
} from '../lib/brotherPtouch'

// canvasDims returns the isotropic render size for a tape label. High quality
// renders at 2× (360 dpi both axes); the driver downsamples the height onto the
// tape's 180-dpi pins, and the doubled width becomes the 2× raster lines the
// printer's high-resolution mode requires.
function canvasDims(labelW: number, labelH: number, quality: 'standard' | 'high') {
  const q = quality === 'high' ? 2 : 1
  return {
    widthDots: Math.round(labelW * dotsPerPt * q),
    heightDots: Math.round(labelH * dotsPerPt * q),
    labelWpt: labelW,
    labelHpt: labelH,
  }
}

// PrintLabelModal generates a PDF (or WebUSB tape print) of barcode/QR labels for
// the given parts OR locations on a chosen sheet, letting the user mark already-used
// cells so a partially-used sheet prints in the right spots.
export function PrintLabelModal({ partIDs, locationIDs, stockIDs, title, onClose }: { partIDs?: string[]; locationIDs?: string[]; stockIDs?: string[]; title?: string; onClose: () => void }) {
  // Parts, locations, or stock lots. Locations and lots have no dedicated designer,
  // so they offer a built-in layout; part labels require a saved template.
  const kind: 'part' | 'location' | 'stock' = locationIDs ? 'location' : stockIDs ? 'stock' : 'part'
  const ids = locationIDs ?? stockIDs ?? partIDs ?? []
  const builtinAllowed = kind !== 'part'
  const subjectNoun = kind === 'location' ? 'location' : kind === 'stock' ? 'lot' : 'part'
  const [media, setMedia] = useState<LabelMedia[]>([])
  const [mediaId, setMediaId] = useState('')
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [used, setUsed] = useState<Set<number>>(new Set())
  const [copies, setCopies] = useState(1)
  const [chain, setChain] = useState(true) // print multiple as one strip (no leader per label)
  const [quality, setQuality] = useState<'standard' | 'high'>('standard')
  const [busy, setBusy] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [printing, setPrinting] = useState<string | null>(null)
  const [printDone, setPrintDone] = useState<string | null>(null)
  const [tapePreview, setTapePreview] = useState<{ url: string; w: number; h: number } | null>(null)

  useEffect(() => {
    api.listLabelMedia().then((m) => {
      setMedia(m)
      const def = m.find((x) => x.code === '5163') ?? m[0]
      if (def) setMediaId(def.id)
    }).catch(() => setErr('Could not load label media.'))
    api.listLabelTemplates().then(setTemplates).catch(() => undefined)
  }, [])

  const sel = useMemo(() => media.find((m) => m.id === mediaId) ?? null, [media, mediaId])
  const isTape = sel?.kind === 'roll'

  // Subject-aware resolve (fill field values) and PDF print.
  const resolveOne = (mediaId: string, id: string, elements: LabelElement[]) =>
    kind === 'location' ? api.resolveLocationLabel({ media_id: mediaId, location_id: id, elements })
      : kind === 'stock' ? api.resolveStockLabel({ media_id: mediaId, stock_item_id: id, elements })
        : api.resolveLabel({ media_id: mediaId, part_id: id, elements })
  const printPdf = (mediaId: string, template_id: string | undefined, copies: number, used_cells: number[]) =>
    kind === 'location' ? api.printLocationLabels({ media_id: mediaId, template_id, location_ids: ids, copies, used_cells })
      : kind === 'stock' ? api.printStockLabels({ media_id: mediaId, template_id, stock_item_ids: ids, copies, used_cells })
        : api.printLabels({ media_id: mediaId, template_id: template_id!, part_ids: ids, copies, used_cells })

  // Layouts for the chosen sheet: templates designed for this media, plus any that
  // aren't bound to a specific size. You pick the sheet first, then its layouts.
  const layouts = useMemo(
    () => templates.filter((t) => !t.label_media_id || t.label_media_id === mediaId),
    [templates, mediaId],
  )

  // Reset used cells + clear any preview when the media changes.
  useEffect(() => { setUsed(new Set()); setPdfUrl(null); setTapePreview(null); setPrintDone(null) }, [mediaId])

  // Keep the layout valid for the current sheet: default to its first layout, and
  // clear the selection if the chosen layout doesn't fit this sheet.
  useEffect(() => {
    setPdfUrl(null)
    // Locations default to the built-in layout (''); parts to their first template.
    setTemplateId((id) => (layouts.some((t) => t.id === id) ? id : (builtinAllowed ? '' : layouts[0]?.id ?? '')))
  }, [layouts, builtinAllowed])

  // Revoke the object URL when it is replaced or the modal unmounts.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  // Auto-render the tape preview whenever the sheet, layout, or part changes — the
  // canvas is client-side and cheap, so there's no reason to make you click Print.
  useEffect(() => {
    if (!isTape || !sel || ids.length === 0 || (!builtinAllowed && !templateId)) { setTapePreview(null); return }
    let cancelled = false
    ;(async () => {
      try {
        const tmplEls = layouts.find((t) => t.id === templateId)?.elements ?? []
        const resolved = await resolveOne(sel.id, ids[0], tmplEls)
        const canvas = renderLabelToCanvas(resolved.elements, canvasDims(resolved.label_w, resolved.label_h, quality))
        if (!cancelled) setTapePreview({ url: canvas.toDataURL(), w: canvas.width, h: canvas.height })
      } catch {
        if (!cancelled) setTapePreview(null)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTape, sel, templateId, layouts, kind, ids[0], ids.length, quality])

  const toggle = (i: number) => setUsed((s) => {
    const n = new Set(s)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })

  const generate = async () => {
    if (!sel || (!builtinAllowed && !templateId)) return
    setBusy(true)
    setErr(null)
    try {
      const blob = await printPdf(sel.id, templateId || undefined, copies, [...used])
      setPdfUrl(URL.createObjectURL(blob))
    } catch {
      setErr('Could not generate labels.')
    } finally {
      setBusy(false)
    }
  }

  // Print straight to a Brother P-touch over WebUSB (tape media only). Resolves
  // each part's label with the chosen layout, rasterizes it, and prints it copies×.
  const printToBrother = async () => {
    if (!sel || (!builtinAllowed && !templateId)) return
    if (!isWebUsbSupported()) { setErr('Print to Brother needs Chrome or Edge (WebUSB).'); return }
    setBusy(true); setErr(null); setPrintDone(null); setPrinting('Connecting')
    try {
      // Grab the device before any slower async work so requestDevice still has the
      // click's user activation.
      let dev = await getGrantedPrinter()
      if (!dev) dev = await requestPrinter()
      const tmplEls = layouts.find((t) => t.id === templateId)?.elements ?? []
      const mm = tapeWidthMmFromCode(sel.code)
      const reps = Math.max(1, copies)
      // Render every label bitmap first (resolve once per subject, reuse for copies).
      const bitmaps: Bitmap[] = []
      for (const sid of ids) {
        const resolved = await resolveOne(sel.id, sid, tmplEls)
        const canvas = renderLabelToCanvas(resolved.elements, canvasDims(resolved.label_w, resolved.label_h, quality))
        if (bitmaps.length === 0) setTapePreview({ url: canvas.toDataURL(), w: canvas.width, h: canvas.height })
        const bmp = canvasBitmap(canvas)
        for (let c = 0; c < reps; c++) bitmaps.push(bmp)
      }
      const total = bitmaps.length
      const stageOpts = { tapeWidthMm: Math.round(mm), highRes: quality === 'high' }
      if (chain && total > 1) {
        // One continuous job: a single leader, labels as a strip you separate.
        await printChain(dev, bitmaps, { ...stageOpts, onStage: setPrinting })
      } else {
        // Independent labels: each feeds + cuts on its own (a leader per label).
        let n = 0
        for (const bmp of bitmaps) {
          n++
          await printBitmap(dev, bmp, {
            ...stageOpts,
            onStage: (s) => setPrinting(total > 1 ? `${s} ${n}/${total}` : s),
          })
        }
      }
      setPrintDone(`Printed ${total} label${total === 1 ? '' : 's'} ✓`)
    } catch (e) {
      // The device chooser throws NotFoundError when the user cancels — ignore it.
      if (!(e instanceof DOMException && e.name === 'NotFoundError')) {
        setErr(e instanceof Error ? e.message : 'Print failed')
      }
    } finally {
      setBusy(false); setPrinting(null)
    }
  }

  const perSheet = sel ? sel.cols * sel.rows : 0
  const free = perSheet - used.size
  const need = ids.length * Math.max(1, copies)

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-h">
          <h3>Print labels{title ? ` — ${title}` : ''}</h3>
          <button className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            {icon(mdiClose)}
          </button>
        </div>

        <div className="modal-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {/* Left: controls + sheet grid */}
          <div>
            <label className="fieldlabel"><span>Label sheet</span>
              <select className="input" value={mediaId} onChange={(e) => setMediaId(e.target.value)}>
                {media.map((m) => (
                  <option key={m.id} value={m.id}>{m.brand} {m.code} — {m.name}</option>
                ))}
              </select>
            </label>
            <label className="fieldlabel" style={{ marginTop: 10 }}><span>Layout</span>
              <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={!builtinAllowed && layouts.length === 0}>
                {builtinAllowed && <option value="">Built-in {subjectNoun} label</option>}
                {!builtinAllowed && layouts.length === 0 && <option value="">No layouts for this sheet</option>}
                {layouts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {!builtinAllowed && layouts.length === 0 && (
              <p className="c-faint" style={{ fontSize: 12, marginTop: 6 }}>
                Design a layout for this sheet in the Label designer first.
              </p>
            )}

            <label className="fieldlabel" style={{ marginTop: 10 }}><span>Copies per {subjectNoun}</span>
              <input type="number" min={1} className="input" value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))} />
            </label>

            {sel && isTape && (
              <>
                <p className="c-faint" style={{ fontSize: 12, marginTop: 12 }}>
                  {need} label{need === 1 ? '' : 's'} to print · Brother P-touch, {tapeWidthMmFromCode(sel.code)}mm tape.
                </p>
                {need > 1 && (
                  <label className="flex items-center gap-2 text-sm c-dim" style={{ marginTop: 8 }}>
                    <input type="checkbox" checked={chain} onChange={(e) => setChain(e.target.checked)} />
                    Chain printing (one strip, no leader between labels)
                  </label>
                )}
                <label className="fieldlabel" style={{ marginTop: 10, maxWidth: 240 }}><span>Print quality</span>
                  <select className="input" value={quality} onChange={(e) => setQuality(e.target.value as 'standard' | 'high')}>
                    <option value="standard">Standard — 180 dpi</option>
                    <option value="high">High — 360 dpi (sharper, slower)</option>
                  </select>
                </label>
              </>
            )}

            {sel && !isTape && (
              <div style={{ marginTop: 12 }}>
                <span className="eyebrow">Sheet — click cells already used</span>
                <div
                  style={{
                    marginTop: 6,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${sel.cols}, 1fr)`,
                    gap: 4,
                    maxWidth: 260,
                  }}
                >
                  {Array.from({ length: perSheet }, (_, i) => {
                    const isUsed = used.has(i)
                    return (
                      <button
                        key={i}
                        onClick={() => toggle(i)}
                        title={isUsed ? 'Used — click to free' : 'Free — click to mark used'}
                        style={{
                          aspectRatio: `${sel.label_w} / ${sel.label_h}`,
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                          background: isUsed ? 'var(--panel-2)' : 'var(--panel)',
                          color: 'var(--faint)',
                          cursor: 'pointer',
                          fontSize: 10,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: isUsed ? 0.55 : 1,
                        }}
                      >
                        {isUsed ? '✕' : ''}
                      </button>
                    )
                  })}
                </div>
                <p className="c-faint" style={{ fontSize: 12, marginTop: 8 }}>
                  {need} label{need === 1 ? '' : 's'} to print · {free} free on this sheet
                  {need > free ? ` · spills onto ${Math.ceil((need - free) / perSheet) + 1} sheets` : ''}
                </p>
              </div>
            )}

            {err && <p className="c-crit" style={{ fontSize: 13, marginTop: 10 }}>{err}</p>}
            {printDone && <p style={{ fontSize: 13, marginTop: 10 }}>{printDone}</p>}

            <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
              {isTape && (
                <button className="btn primary flex items-center gap-1" disabled={busy || !sel || (!builtinAllowed && !templateId)} onClick={printToBrother}>
                  {icon(mdiPrinterOutline, { size: 16 })}
                  {printing ?? 'Print to Brother'}
                </button>
              )}
              <button className={isTape ? 'btn' : 'btn primary'} disabled={busy || !sel || (!builtinAllowed && !templateId)} onClick={generate}>
                {busy && !printing ? 'Generating…' : isTape ? 'Save PDF' : 'Generate PDF'}
              </button>
              {pdfUrl && (
                <a className="btn" href={pdfUrl} target="_blank" rel="noreferrer">Open in new tab</a>
              )}
            </div>
          </div>

          {/* Right: preview */}
          <div>
            <span className="eyebrow">Preview</span>
            {isTape ? (
              tapePreview ? (
                <div style={{ marginTop: 6, padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}>
                  <img
                    alt="Tape label preview"
                    src={tapePreview.url}
                    style={{
                      width: Math.min(340, tapePreview.w * 2.5),
                      height: Math.min(340, tapePreview.w * 2.5) * (tapePreview.h / tapePreview.w),
                      imageRendering: 'pixelated', display: 'block',
                    }}
                  />
                </div>
              ) : (
                <div style={{ height: 380, marginTop: 6, borderRadius: 10, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="c-faint" style={{ fontSize: 13 }}>Choose a sheet and layout to preview.</span>
                </div>
              )
            ) : pdfUrl ? (
              <iframe
                title="Label preview"
                src={pdfUrl}
                style={{ width: '100%', height: 380, marginTop: 6, border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }}
              />
            ) : (
              <div
                style={{
                  height: 380, marginTop: 6, borderRadius: 10, border: '1px dashed var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span className="c-faint" style={{ fontSize: 13 }}>Generate to preview the sheet.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
