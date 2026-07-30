// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Drag-and-drop label designer. The server renderer is element-based, so this
// edits the same {type,field,x,y,w,h,font,bold,align} elements (in PDF points)
// that the print endpoint consumes. react-rnd handles move/resize; we convert
// px <-> pt with a display scale.

import { useEffect, useRef, useState } from 'react'
import { api, type LabelMedia, type LabelTemplate, type LabelElement, type LabelField, type Part } from '../lib/api'
import { icon } from '../lib/icons'
import {
  mdiTrashCanOutline, mdiTextBox, mdiQrcode, mdiBarcode, mdiVectorLine, mdiRectangleOutline,
  mdiFormatBold, mdiFormatItalic, mdiFormatUnderline,
  mdiFormatAlignLeft, mdiFormatAlignCenter, mdiFormatAlignRight,
  mdiFormatVerticalAlignTop, mdiFormatVerticalAlignCenter, mdiFormatVerticalAlignBottom,
} from '@mdi/js'
import { renderLabelToCanvas } from '../lib/labelCanvas'
import { tapeGeomForMm, tapeWidthMmFromCode, dotsPerPt } from '../lib/brotherPtouch'

const FIELDS: { value: LabelField; label: string }[] = [
  { value: 'text', label: 'Literal text' },
  { value: 'name', label: 'Part name' },
  // Displayed as FBPN to sit parallel with MPN below, to match the `fbpn` field
  // the KiCad library server writes into a schematic, and because "IPN" means
  // nothing to someone looking for their FireBin part number. The value stays
  // 'ipn': saved templates persist the binding by name, and renaming it would
  // blank this field on every label anyone has already designed.
  { value: 'ipn', label: 'FBPN' },
  { value: 'package', label: 'Package' },
  { value: 'mpn', label: 'MPN' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'location', label: 'Location' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'description', label: 'Description' },
  { value: 'param', label: 'Parameter…' },
  { value: 'barcode', label: 'Barcode value' },
  { value: 'qr', label: 'QR deep link' },
]

const newText = (): LabelElement => ({ type: 'text', field: 'name', x: 6, y: 6, w: 90, h: 14, font: 9, align: 'L' })
const newQR = (): LabelElement => ({ type: 'qr', field: 'qr', x: 6, y: 6, w: 44, h: 44 })
const newBarcode = (): LabelElement => ({ type: 'barcode', field: 'ipn', x: 6, y: 6, w: 100, h: 26 })
const newLine = (): LabelElement => ({ type: 'line', field: '', x: 6, y: 6, w: 80, h: 6, thickness: 1 })
const newRect = (): LabelElement => ({ type: 'rect', field: '', x: 6, y: 6, w: 60, h: 30, thickness: 1, filled: false })

export function LabelBuilder() {
  const [media, setMedia] = useState<LabelMedia[]>([])
  const [mediaId, setMediaId] = useState('')
  const [templates, setTemplates] = useState<LabelTemplate[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [elements, setElements] = useState<LabelElement[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [snap, setSnap] = useState(true)
  const [grid, setGrid] = useState(4) // grid step in points
  const [parts, setParts] = useState<Part[]>([])
  const [paramNames, setParamNames] = useState<string[]>([])
  const [previewPart, setPreviewPart] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [tapePreview, setTapePreview] = useState<{ url: string; w: number; h: number } | null>(null)

  const loadTemplates = () => api.listLabelTemplates().then(setTemplates).catch(() => undefined)
  useEffect(() => {
    api.listLabelMedia().then((m) => { setMedia(m); setMediaId((id) => id || m[0]?.id || '') }).catch(() => undefined)
    api.listParts().then(setParts).catch(() => undefined)
    api.listParameterTemplates().then((ts) => setParamNames(ts.map((t) => t.name))).catch(() => undefined)
    loadTemplates()
  }, [])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const chosen = media.find((m) => m.id === mediaId)
  const isTape = chosen?.kind === 'roll'

  // buildTapeCanvas resolves the field bindings server-side, then renders the label
  // to a canvas at the tape's native dot resolution — the same pixels we print.
  const buildTapeCanvas = async () => {
    const resolved = await api.resolveLabel({ media_id: mediaId, part_id: previewPart, elements })
    const mm = tapeWidthMmFromCode(chosen!.code)
    const geom = tapeGeomForMm(Math.round(mm))
    const canvas = renderLabelToCanvas(resolved.elements, {
      widthDots: Math.round(resolved.label_w * dotsPerPt),
      heightDots: geom.printable,
      labelWpt: resolved.label_w,
      labelHpt: resolved.label_h,
    })
    return { canvas, mm }
  }

  const preview = async () => {
    if (!mediaId || !previewPart || !chosen) return
    setPreviewBusy(true); setMsg(null)
    try {
      if (chosen.kind === 'roll') {
        const { canvas } = await buildTapeCanvas()
        setTapePreview({ url: canvas.toDataURL(), w: canvas.width, h: canvas.height })
      } else {
        const blob = await api.previewLabel({ media_id: mediaId, part_id: previewPart, elements })
        setPreviewUrl(URL.createObjectURL(blob))
      }
    } catch {
      setMsg('Could not render preview')
    } finally {
      setPreviewBusy(false)
    }
  }

  // px per pt: fit the label to ~520px wide, but don't blow tiny labels up past 3.2.
  const scale = chosen ? Math.min(520 / chosen.label_w, 3.2) : 2

  const update = (i: number, patch: Partial<LabelElement>) =>
    setElements((els) => els.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const remove = (i: number) => { setElements((els) => els.filter((_, j) => j !== i)); setSel(null) }
  const add = (el: LabelElement) => { setElements((els) => [...els, el]); setSel(elements.length) }

  const loadTemplate = (id: string) => {
    if (!id) { newTemplate(); return }
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setEditingId(t.id)
    setName(t.name)
    setElements(t.elements ?? [])
    if (t.label_media_id) setMediaId(t.label_media_id)
    setSel(null)
    setMsg(null)
  }
  const newTemplate = () => { setEditingId(null); setName(''); setElements([]); setSel(null); setMsg(null) }
  // Clone: keep the current layout + size but detach from the saved template, so
  // the next Save creates a new one. Handy for basing a label on an existing one.
  const clone = () => { setEditingId(null); setName((n) => (n ? `${n} copy` : 'Copy')); setMsg(null) }

  const save = async () => {
    setMsg(null)
    if (!name.trim()) { setMsg('Give the template a name'); return }
    const body = { name: name.trim(), label_media_id: mediaId || null, elements }
    try {
      const saved = editingId ? await api.updateLabelTemplate(editingId, body) : await api.createLabelTemplate(body)
      setEditingId(saved.id)
      await loadTemplates()
      // Flash the Save button instead of adding a "Saved." line.
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1600)
    } catch {
      setMsg('Could not save template')
    }
  }
  const del = async () => {
    if (!editingId || !confirm('Delete this template?')) return
    await api.deleteLabelTemplate(editingId).catch(() => undefined)
    await loadTemplates()
    newTemplate()
  }

  const snapPt = (v: number) => (snap ? Math.round(v / grid) * grid : Math.round(v * 10) / 10)

  const selected = sel != null ? elements[sel] : null

  return (
    <div className="card">
      <div className="card-h"><h2>Label designer</h2></div>
      <div className="p-4 space-y-4">
        {/* Template + size controls */}
        <div className="flex flex-wrap items-end gap-3">
          <label className="fieldlabel" style={{ minWidth: 180 }}>
            <span>Template</span>
            <select className="input" value={editingId ?? ''} onChange={(e) => loadTemplate(e.target.value)}>
              <option value="">New template…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="fieldlabel" style={{ flex: 1, minWidth: 180 }}>
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Small drawer label" />
          </label>
          <label className="fieldlabel" style={{ minWidth: 200 }}>
            <span>Label size</span>
            <select className="input" value={mediaId} onChange={(e) => setMediaId(e.target.value)}>
              {media.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.code} — {m.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={`btn ${justSaved ? 'good' : 'primary'}`} onClick={save}>{justSaved ? 'Saved ✓' : 'Save'}</button>
          {editingId ? (
            <>
              <button className="btn" onClick={clone}>Duplicate</button>
              <button className="btn danger" onClick={del}>Delete</button>
            </>
          ) : (
            <button className="btn" onClick={newTemplate}>New</button>
          )}
        </div>
        {msg && <p className="text-sm c-crit">{msg}</p>}

        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn sm" onClick={() => add(newText())}>{icon(mdiTextBox)} Add text</button>
          <button className="btn sm" onClick={() => add(newQR())}>{icon(mdiQrcode)} Add QR</button>
          <button className="btn sm" onClick={() => add(newBarcode())}>{icon(mdiBarcode)} Add barcode</button>
          <button className="btn sm" onClick={() => add(newLine())}>{icon(mdiVectorLine)} Add line</button>
          <button className="btn sm" onClick={() => add(newRect())}>{icon(mdiRectangleOutline)} Add rectangle</button>
          <label className="flex items-center gap-2 text-sm c-dim" style={{ marginLeft: 'auto' }}>
            <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap to grid
          </label>
          <select className="input" style={{ width: 'auto', height: 30, padding: '0 8px' }} value={grid} onChange={(e) => setGrid(Number(e.target.value))} disabled={!snap}>
            <option value={2}>2 pt</option>
            <option value={4}>4 pt</option>
            <option value={8}>8 pt</option>
          </select>
        </div>

        <div className="flex flex-col gap-4">
          {/* Canvas */}
          {chosen ? (
            <div
              onMouseDown={(e) => { if (e.target === e.currentTarget) setSel(null) }}
              style={{
                position: 'relative',
                width: chosen.label_w * scale,
                height: chosen.label_h * scale,
                backgroundColor: 'var(--panel-2)',
                backgroundImage: snap
                  ? 'linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)'
                  : undefined,
                backgroundSize: `${grid * scale}px ${grid * scale}px`,
                border: '1px solid var(--border-strong)',
                borderRadius: chosen.corner_radius * scale,
                flex: 'none',
              }}
            >
              {elements.map((el, i) => (
                <MoveBox
                  key={i}
                  x={el.x * scale} y={el.y * scale} w={el.w * scale} h={el.h * scale}
                  selected={sel === i}
                  onSelect={() => setSel(i)}
                  onChange={(px) => update(i, { x: snapPt(px.x / scale), y: snapPt(px.y / scale), w: snapPt(px.w / scale), h: snapPt(px.h / scale) })}
                >
                  <ElPreview el={el} scale={scale} />
                </MoveBox>
              ))}
            </div>
          ) : (
            <p className="c-faint text-sm">Add a label size in “Label sheets” first.</p>
          )}

          {/* Properties — under the label */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, maxWidth: 560 }}>
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">{selected.type} element</span>
                  <button className="btn sm danger" onClick={() => remove(sel!)}>{icon(mdiTrashCanOutline)} Remove</button>
                </div>
                {selected.type !== 'line' && selected.type !== 'rect' && (
                  <label className="fieldlabel"><span>{selected.type === 'text' ? 'Content' : 'Encodes'}</span>
                    <select className="input" value={selected.field ?? 'text'} onChange={(e) => update(sel!, { field: e.target.value as LabelField })}>
                      {FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                )}
                {selected.type === 'text' && (selected.field ?? 'text') === 'text' && (
                  <label className="fieldlabel"><span>Text</span>
                    <input className="input" value={selected.value ?? ''} onChange={(e) => update(sel!, { value: e.target.value })} />
                  </label>
                )}
                {selected.field === 'param' && (
                  <label className="fieldlabel"><span>Parameter name</span>
                    <input className="input" list="param-names" placeholder="e.g. Tolerance"
                      value={selected.paramName ?? ''} onChange={(e) => update(sel!, { paramName: e.target.value })} />
                    <datalist id="param-names">{paramNames.map((n) => <option key={n} value={n} />)}</datalist>
                    <span className="c-faint text-sm" style={{ marginTop: 4 }}>Shows this part’s value for the parameter; blank if it has none.</span>
                  </label>
                )}
                {(selected.type === 'line' || (selected.type === 'rect' && !selected.filled)) && (
                  <label className="fieldlabel"><span>Thickness (pt)</span>
                    <input className="input" type="number" step="0.5" min="0.5" value={selected.thickness ?? 1} onChange={(e) => update(sel!, { thickness: Number(e.target.value) })} />
                  </label>
                )}
                {selected.type === 'rect' && (
                  <label className="flex items-center gap-2 text-sm c-dim">
                    <input type="checkbox" checked={!!selected.filled} onChange={(e) => update(sel!, { filled: e.target.checked })} /> Filled
                  </label>
                )}
                {(selected.type === 'text' || selected.type === 'qr' || selected.type === 'barcode') && (
                  <label className="flex items-center gap-2 text-sm c-dim">
                    <input type="checkbox" checked={!!selected.invert} onChange={(e) => update(sel!, { invert: e.target.checked })} /> Invert (white on black)
                  </label>
                )}
                {selected.type === 'text' && (
                  <>
                    <label className="fieldlabel"><span>Font size (pt)</span>
                      <input className="input" type="number" value={selected.font ?? 9} onChange={(e) => update(sel!, { font: Number(e.target.value) })} />
                    </label>
                    <div>
                      <div className="eyebrow" style={{ marginBottom: 6 }}>Text</div>
                      <div className="flex gap-1 flex-wrap items-center">
                        <ToolBtn icon={mdiFormatBold} title="Bold" active={!!selected.bold} onClick={() => update(sel!, { bold: !selected.bold })} />
                        <ToolBtn icon={mdiFormatItalic} title="Italic" active={!!selected.italic} onClick={() => update(sel!, { italic: !selected.italic })} />
                        <ToolBtn icon={mdiFormatUnderline} title="Underline" active={!!selected.underline} onClick={() => update(sel!, { underline: !selected.underline })} />
                        <span className="tool-sep" />
                        <ToolBtn icon={mdiFormatAlignLeft} title="Align left" active={(selected.align ?? 'L') === 'L'} onClick={() => update(sel!, { align: 'L' })} />
                        <ToolBtn icon={mdiFormatAlignCenter} title="Align centre" active={selected.align === 'C'} onClick={() => update(sel!, { align: 'C' })} />
                        <ToolBtn icon={mdiFormatAlignRight} title="Align right" active={selected.align === 'R'} onClick={() => update(sel!, { align: 'R' })} />
                        <span className="tool-sep" />
                        <ToolBtn icon={mdiFormatVerticalAlignTop} title="Align top" active={(selected.valign ?? 'T') === 'T'} onClick={() => update(sel!, { valign: 'T' })} />
                        <ToolBtn icon={mdiFormatVerticalAlignCenter} title="Align middle" active={selected.valign === 'M'} onClick={() => update(sel!, { valign: 'M' })} />
                        <ToolBtn icon={mdiFormatVerticalAlignBottom} title="Align bottom" active={selected.valign === 'B'} onClick={() => update(sel!, { valign: 'B' })} />
                      </div>
                      <p className="c-faint text-sm" style={{ marginTop: 6 }}>Aligns the text inside its box.</p>
                    </div>
                  </>
                )}
                <p className="c-faint text-sm">Drag to move, pull the corner to resize (hold Shift to keep proportions). Elements snap to the grid.</p>
              </div>
            ) : (
              <p className="c-faint text-sm">Add an element, or click one to edit it. Field-bound elements (like Part name) fill in per part when you print.</p>
            )}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <div className="flex flex-wrap items-end gap-3">
            <label className="fieldlabel" style={{ minWidth: 240 }}>
              <span>Preview with a part</span>
              <select className="input" value={previewPart} onChange={(e) => setPreviewPart(e.target.value)}>
                <option value="">Choose a part…</option>
                {parts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.ipn ? ` (${p.ipn})` : ''}</option>)}
              </select>
            </label>
            <button className="btn" onClick={preview} disabled={!previewPart || previewBusy}>{previewBusy ? '…' : 'Render preview'}</button>
            <span className="c-faint text-sm">
              {isTape
                ? 'Renders the exact tape label. Print it from the part’s Label button (Print to Brother).'
                : 'Renders your current layout with the real part data.'}
            </span>
          </div>
          {isTape && tapePreview && (() => {
            // Tape preview: the exact 1-bit bitmap that prints, scaled up crisp
            // (pixelated) so you can read the dots. Aspect follows the canvas.
            const dispW = Math.min(560, tapePreview.w * 2.5)
            const dispH = dispW * (tapePreview.h / tapePreview.w)
            return (
              <div style={{ marginTop: 12, display: 'inline-block', border: '1px solid var(--border)', background: '#fff', borderRadius: 6, overflow: 'hidden', lineHeight: 0 }}>
                <img
                  alt="Tape label preview"
                  src={tapePreview.url}
                  style={{ width: dispW, height: dispH, imageRendering: 'pixelated', display: 'block' }}
                />
              </div>
            )
          })()}
          {!isTape && previewUrl && chosen && (() => {
            // Show the label page fit-to-frame at its true aspect. The iframe is
            // sized to the label proportions and #view=Fit makes the PDF fill it,
            // so what you see is exactly the label (its edges = the frame edges).
            const dispW = Math.min(chosen.label_w * (4 / 3), 560)
            const dispH = dispW * (chosen.label_h / chosen.label_w)
            return (
              <div style={{ marginTop: 12, display: 'inline-block', border: '1px solid var(--border)', background: '#fff', borderRadius: 6, overflow: 'hidden', lineHeight: 0 }}>
                <iframe
                  title="Label preview"
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                  style={{ width: dispW, height: dispH, border: 'none', display: 'block' }}
                />
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// ToolBtn is a compact icon toggle for the text formatting toolbar (bold, italic,
// underline, alignment). Active state is shown with the primary button style.
function ToolBtn({ icon: d, title, active, onClick }: { icon: string; title: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`btn sm${active ? ' primary' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      style={{ padding: '4px 7px', display: 'inline-flex', alignItems: 'center' }}
    >
      {icon(d, { size: 16 })}
    </button>
  )
}

// MoveBox is a small drag + resize box built on pointer events (no dependency,
// so it's safe on React 19). All coordinates are display pixels; the parent
// converts to points. Drag the body to move, pull the corner handle to resize.
function MoveBox({ x, y, w, h, selected, onSelect, onChange, children }: {
  x: number; y: number; w: number; h: number
  selected: boolean
  onSelect: () => void
  onChange: (px: { x: number; y: number; w: number; h: number }) => void
  children: React.ReactNode
}) {
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
  const resize = useRef<{ px: number; py: number; ow: number; oh: number } | null>(null)

  const move = (e: React.PointerEvent) => {
    if (drag.current) {
      const d = drag.current
      onChange({ x: Math.max(0, d.ox + (e.clientX - d.px)), y: Math.max(0, d.oy + (e.clientY - d.py)), w, h })
    } else if (resize.current) {
      const r = resize.current
      let nw = Math.max(10, r.ow + (e.clientX - r.px))
      let nh = Math.max(8, r.oh + (e.clientY - r.py))
      if (e.shiftKey) {
        // Lock the aspect ratio: scale both axes by whichever the pointer moved more.
        const s = Math.max(nw / r.ow, nh / r.oh)
        nw = Math.max(10, r.ow * s)
        nh = Math.max(8, r.oh * s)
      }
      onChange({ x, y, w: nw, h: nh })
    }
  }
  const end = (e: React.PointerEvent) => {
    drag.current = null
    resize.current = null
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }

  return (
    <div
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box',
        border: selected ? '1.5px solid var(--accent)' : '1px dashed var(--border-strong)',
        background: selected ? 'var(--accent-soft)' : 'transparent',
        cursor: 'move', overflow: 'hidden', touchAction: 'none',
      }}
      onPointerDown={(e) => {
        e.stopPropagation(); onSelect()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { px: e.clientX, py: e.clientY, ox: x, oy: y }
      }}
      onPointerMove={move}
      onPointerUp={end}
    >
      {children}
      <div
        onPointerDown={(e) => {
          e.stopPropagation(); onSelect()
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          resize.current = { px: e.clientX, py: e.clientY, ow: w, oh: h }
        }}
        onPointerMove={move}
        onPointerUp={end}
        style={{ position: 'absolute', right: 0, bottom: 0, width: 11, height: 11, background: 'var(--accent)', cursor: 'nwse-resize', touchAction: 'none' }}
      />
    </div>
  )
}

function ElPreview({ el, scale }: { el: LabelElement; scale: number }) {
  if (el.type === 'line') {
    const t = Math.max(1, (el.thickness ?? 1) * scale)
    const horizontal = el.w >= el.h
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <div style={{
          position: 'absolute', background: 'var(--text)',
          ...(horizontal
            ? { left: 0, right: 0, top: '50%', height: t, transform: 'translateY(-50%)' }
            : { top: 0, bottom: 0, left: '50%', width: t, transform: 'translateX(-50%)' }),
        }} />
      </div>
    )
  }
  if (el.type === 'rect') {
    const t = Math.max(1, (el.thickness ?? 1) * scale)
    return (
      <div style={{
        width: '100%', height: '100%',
        background: el.filled ? 'var(--text)' : 'transparent',
        border: el.filled ? 'none' : `${t}px solid var(--text)`,
      }} />
    )
  }
  const inv = !!el.invert
  if (el.type === 'text') {
    const content = el.field && el.field !== 'text'
      ? (el.field === 'param' ? `{${el.paramName || 'parameter'}}` : `{${el.field}}`)
      : (el.value || 'text')
    const align = el.align === 'C' ? 'center' : el.align === 'R' ? 'right' : 'left'
    return (
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        fontSize: Math.max(7, (el.font ?? 9) * scale),
        fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : 'normal',
        textDecoration: el.underline ? 'underline' : 'none',
        background: inv ? 'var(--text)' : 'transparent', color: inv ? 'var(--panel)' : 'var(--text)',
        overflow: 'hidden', whiteSpace: 'nowrap', padding: '0 1px',
      }}>{content}</div>
    )
  }
  const label = el.type === 'qr' ? 'QR' : 'barcode'
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: inv ? 'var(--text)' : 'var(--panel)', color: inv ? 'var(--panel)' : 'var(--faint)',
      fontSize: 10, fontFamily: 'var(--mono)', textAlign: 'center', lineHeight: 1.2,
    }}>
      {label}<br />{el.field ? `{${el.field}}` : ''}
    </div>
  )
}
