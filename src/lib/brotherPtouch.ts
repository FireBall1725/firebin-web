/// <reference types="w3c-web-usb" />
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Direct WebUSB printing to a Brother PT-P710BT P-touch label printer.
//
// The P710BT has no macOS/Windows print driver of its own — Brother routes all
// computer printing through P-touch Editor, which talks to the device over raw
// USB. That same rawness is what lets us drive it from the browser: because no
// system driver claims the printer-class interface, WebUSB can claim interface 0
// and speak Brother's raster command language directly. (If the device is added
// as a system printer or P-touch Editor is holding it, claimInterface fails.)
//
// Protocol corroborated against robby-cornelissen/pt-p710bt-label-maker,
// treideme/brother_pt, and ryankurte/rust-ptouch. We send RAW raster (no PackBits)
// because it is the simplest path all three agree works.

const BROTHER_VID = 0x04f9
const P710_PID = 0x20af

const IFACE = 0
const EP_OUT = 2 // bulk OUT endpoint address 0x02
const EP_IN = 1 // bulk IN endpoint address 0x81
const HEAD_PINS = 128 // print head width in dots
const LINE_BYTES = HEAD_PINS / 8 // 16 bytes per raster line
const USB_CHUNK = 64 // the device wants writes split into 64-byte packets
const DOTS_PER_PT = 180 / 72 // 180 dpi ÷ 72 pt/inch = 2.5

// Tape geometry keyed by the media width in mm the printer reports (status[10]).
// printable = printable dots high; offset = unused pins on each side, so
// offset + printable + offset = 128. From the corroborated per-tape table; 12mm
// (29/70/29) is unambiguous across sources.
export interface TapeGeom {
  printable: number
  offset: number
}
export const TAPE: Record<number, TapeGeom> = {
  3: { printable: 24, offset: 52 }, // 3.5mm may report as 3 or 4
  4: { printable: 24, offset: 52 },
  6: { printable: 32, offset: 48 },
  9: { printable: 50, offset: 39 },
  12: { printable: 70, offset: 29 },
  18: { printable: 112, offset: 8 },
  24: { printable: 128, offset: 0 },
}

// tapeGeomForMm returns the geometry for a tape width, falling back to the nearest
// known width so an odd report (or a 3.5mm rounding) still prints somewhere sane.
export function tapeGeomForMm(mm: number): TapeGeom {
  if (TAPE[mm]) return TAPE[mm]
  const widths = Object.keys(TAPE).map(Number)
  const nearest = widths.reduce((a, b) => (Math.abs(b - mm) < Math.abs(a - mm) ? b : a))
  return TAPE[nearest]
}

export const dotsPerPt = DOTS_PER_PT

// tapeWidthMmFromCode pulls the tape width out of a roll medium's code ("TZe12-40").
export function tapeWidthMmFromCode(code: string): number {
  const m = /tze\s*(\d+(?:\.\d+)?)/i.exec(code)
  return m ? Number(m[1]) : 12
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator
}

// A monochrome bitmap: width dots along the tape length, height dots across the
// tape (the printable window). dark(x, y) is true where a dot should burn.
export interface Bitmap {
  width: number
  height: number
  dark: (x: number, y: number) => boolean
}

export interface PrinterStatus {
  mediaWidthMm: number
  mediaType: number
  error1: number
  error2: number
  raw: Uint8Array
}

export interface PrintResult {
  status: PrinterStatus
  lines: number
}

// requestPrinter prompts the user to pick the Brother printer (Chrome shows the
// native device chooser). Filtered to the P710BT, then any Brother device as a
// fallback so a close cousin still appears.
export async function requestPrinter(): Promise<USBDevice> {
  const usb = (navigator as Navigator & { usb?: USB }).usb
  if (!usb) throw new Error('WebUSB is not available in this browser. Use Chrome or Edge.')
  return usb.requestDevice({
    filters: [
      { vendorId: BROTHER_VID, productId: P710_PID },
      { vendorId: BROTHER_VID },
    ],
  })
}

// getGrantedPrinter returns an already-authorized Brother device without prompting,
// so a return visit can print without re-picking.
export async function getGrantedPrinter(): Promise<USBDevice | null> {
  const usb = (navigator as Navigator & { usb?: USB }).usb
  if (!usb) return null
  const devices = await usb.getDevices()
  return devices.find((d) => d.vendorId === BROTHER_VID) ?? null
}

function statusError(s: PrinterStatus): string | null {
  if (s.error1 & 0x01 || s.mediaWidthMm === 0) return 'No tape loaded (or the cover is open).'
  if (s.error1 & 0x04) return 'The cutter is jammed.'
  if (s.error1 & 0x08) return 'The battery is too weak to print. Connect USB power.'
  if (s.error2 & 0x10) return 'The tape cover is open.'
  if (s.error2 & 0x20) return 'The printer is overheating. Let it cool down.'
  if (s.error2 & 0x01) return 'The loaded tape does not match this label.'
  return null
}

function parseStatus(buf: Uint8Array): PrinterStatus {
  return {
    error1: buf[8] ?? 0,
    error2: buf[9] ?? 0,
    mediaWidthMm: buf[10] ?? 0,
    mediaType: buf[11] ?? 0,
    raw: buf,
  }
}

async function writeOut(dev: USBDevice, bytes: Uint8Array): Promise<void> {
  for (let i = 0; i < bytes.length; i += USB_CHUNK) {
    // Copy the slice into a fresh ArrayBuffer — transferOut needs a standalone
    // buffer, and a subarray would share (and mis-offset) the parent.
    const chunk = bytes.slice(i, i + USB_CHUNK)
    const res = await dev.transferOut(EP_OUT, chunk)
    if (res.status !== 'ok') throw new Error(`USB write failed: ${res.status}`)
  }
}

async function readStatus(dev: USBDevice, timeoutMs = 5000): Promise<PrinterStatus> {
  // WebUSB transferIn has no timeout of its own and blocks until data arrives, so
  // race it against a timer — otherwise a silent printer hangs the print forever.
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timed out waiting for the printer status.')), timeoutMs)
  })
  const read = (async () => {
    for (;;) {
      const res = await dev.transferIn(EP_IN, 32)
      if (res.data && res.data.byteLength >= 32) {
        return parseStatus(new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength))
      }
      // A short/empty packet just means keep reading.
    }
  })()
  try {
    return await Promise.race([read, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

// Little building blocks for the command stream.
const ESC = 0x1b

function u32le(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]
}

// buildRaster turns a bitmap into the per-line raster commands. Each raster line
// runs ACROSS the tape (the 128 pins); the tape feeds along the bitmap width, so
// bitmap column x becomes raster line x. The across-tape resolution is fixed at
// 180 dpi (`pins` printable dots), so the bitmap's height is DOWNSAMPLED onto the
// pins — the bitmap may be taller than `pins` (high-res isotropic render). Length
// resolution rides on how many columns the bitmap has (more columns = 360 dpi).
// MSB = first pin = one tape edge.
function buildRaster(bmp: Bitmap, offset: number, pins: number): { bytes: number[]; lines: number } {
  const out: number[] = []
  for (let x = 0; x < bmp.width; x++) {
    const line = new Uint8Array(LINE_BYTES)
    let any = false
    for (let i = 0; i < pins; i++) {
      const pin = offset + i
      if (pin < 0 || pin >= HEAD_PINS) continue
      // Sample the bitmap row this pin covers (1:1 when bmp.height === pins).
      const row = Math.min(bmp.height - 1, Math.floor((i * bmp.height) / pins))
      if (!bmp.dark(x, row)) continue
      line[pin >> 3] |= 1 << (7 - (pin & 7))
      any = true
    }
    if (!any) {
      out.push(0x5a) // 'Z' — blank line shortcut
    } else {
      out.push(0x47, LINE_BYTES, 0x00, ...line) // 'G' + 16-bit LE length + raw bytes
    }
  }
  return { bytes: out, lines: bmp.width }
}

export interface PrintOptions {
  // Fallback tape width (mm) if the printer does not report one; the design's tape.
  tapeWidthMm: number
  // High-resolution printing: 360 dpi in the tape-feed direction (advanced-mode
  // bit 0x40). The caller must render the bitmap at 2× length so it carries twice
  // the raster lines — the printer does not interpolate.
  highRes?: boolean
  onStage?: (stage: string) => void
}

// printBitmap runs the full connect → status → raster → print → confirm sequence
// against an opened (or openable) Brother device. Throws with a friendly message
// on any printer error so the caller can surface it.
export async function printBitmap(
  dev: USBDevice,
  bmp: Bitmap,
  opts: PrintOptions,
): Promise<PrintResult> {
  const stage = (s: string) => opts.onStage?.(s)

  stage('Connecting')
  if (!dev.opened) await dev.open()
  if (dev.configuration === null) await dev.selectConfiguration(1)
  await dev.claimInterface(IFACE)

  try {
    // Reset the parser, initialize, then ask for status to learn the loaded tape.
    stage('Reading tape')
    await writeOut(dev, new Uint8Array(100)) // 100 × 0x00 invalidate
    await writeOut(dev, new Uint8Array([ESC, 0x40])) // ESC @  initialize
    await writeOut(dev, new Uint8Array([ESC, 0x69, 0x53])) // ESC i S  status request
    const status = await readStatus(dev)
    const err = statusError(status)
    if (err) throw new Error(err)

    // Prefer the width the printer reports; fall back to the design's tape.
    const widthMm = TAPE[status.mediaWidthMm] ? status.mediaWidthMm : opts.tapeWidthMm
    const geom = tapeGeomForMm(widthMm)
    const { bytes: raster, lines } = buildRaster(bmp, geom.offset, geom.printable)

    stage('Sending')
    await writeOut(dev, new Uint8Array(pageHeader({ widthMm, lines, firstPage: true, highRes: opts.highRes })))
    await writeOut(dev, new Uint8Array(raster))
    await writeOut(dev, new Uint8Array([0x1a])) // Ctrl-Z → print with feed

    stage('Printing')
    await waitForCompletion(dev)
    return { status, lines }
  } finally {
    try {
      await dev.releaseInterface(IFACE)
    } catch {
      // best effort — the print already happened
    }
  }
}

// pageHeader builds the per-page command prefix (raster mode → print-info → mode
// bytes → raw compression). Advanced-mode bit 0x08 ("no chain printing") is ALWAYS
// set so the job feeds and cuts after its final page — otherwise the last label
// never ejects, waiting for a continuation job. Butting labels together within a
// job is done by the 0x0C page terminators, not by clearing this bit.
function pageHeader(o: { widthMm: number; lines: number; firstPage: boolean; highRes?: boolean }): number[] {
  // ESC i K advanced mode: 0x08 = chain printing OFF (feed+cut at job end),
  // 0x40 = high-resolution.
  let advanced = 0x08
  if (o.highRes) advanced |= 0x40
  return [
    ESC, 0x69, 0x61, 0x01, // ESC i a 01  → raster mode
    ESC, 0x69, 0x21, 0x00, // ESC i !  00  → status notifications on
    // ESC i z  print info: flags, media type, width mm, length(0), line count
    // (32-bit LE), starting-page (0 first / 1 continuation), 0
    ESC, 0x69, 0x7a, 0x84, 0x00, o.widthMm & 0xff, 0x00, ...u32le(o.lines), o.firstPage ? 0x00 : 0x01, 0x00,
    ESC, 0x69, 0x4d, 0x40, // ESC i M 40  → auto-cut on, no mirror
    ESC, 0x69, 0x4b, advanced, // ESC i K  → chain-printing bit
    ESC, 0x69, 0x64, 0x00, 0x00, // ESC i d  → no extra feed margin
    0x4d, 0x00, // M 00  → no compression (raw raster)
  ]
}

// waitForCompletion reads status messages until the printer reports done (type
// 0x01) or errors (0x02). The print byte is already sent, so a read timeout here
// doesn't mean failure — swallow it.
async function waitForCompletion(dev: USBDevice): Promise<void> {
  try {
    const deadline = Date.now() + 30000
    for (;;) {
      const s = await readStatus(dev, 8000)
      const type = s.raw[18] ?? 0
      if (type === 0x01) break // printing completed
      if (type === 0x02) {
        const e = statusError(s)
        if (e) throw new Error(e)
      }
      if (Date.now() > deadline) break
    }
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith('Timed out'))) throw e
  }
}

// printChain prints several labels as ONE job so the leading tape (the "nub" the
// printer feeds before printing) appears once, not before every label. Pages are
// joined with 0x0C (print, no feed/cut); the last uses 0x1A (feed + final cut), so
// the labels come out as one strip you separate — Brother's "chain printing".
export async function printChain(
  dev: USBDevice,
  bitmaps: Bitmap[],
  opts: PrintOptions,
): Promise<PrintResult> {
  if (bitmaps.length === 0) return { status: { mediaWidthMm: 0, mediaType: 0, error1: 0, error2: 0, raw: new Uint8Array(32) }, lines: 0 }
  const stage = (s: string) => opts.onStage?.(s)

  stage('Connecting')
  if (!dev.opened) await dev.open()
  if (dev.configuration === null) await dev.selectConfiguration(1)
  await dev.claimInterface(IFACE)

  try {
    stage('Reading tape')
    await writeOut(dev, new Uint8Array(100))
    await writeOut(dev, new Uint8Array([ESC, 0x40]))
    await writeOut(dev, new Uint8Array([ESC, 0x69, 0x53]))
    const status = await readStatus(dev)
    const err = statusError(status)
    if (err) throw new Error(err)

    const widthMm = TAPE[status.mediaWidthMm] ? status.mediaWidthMm : opts.tapeWidthMm
    const geom = tapeGeomForMm(widthMm)

    stage('Sending')
    for (let i = 0; i < bitmaps.length; i++) {
      const { bytes: raster, lines } = buildRaster(bitmaps[i], geom.offset, geom.printable)
      await writeOut(dev, new Uint8Array(pageHeader({ widthMm, lines, firstPage: i === 0, highRes: opts.highRes })))
      await writeOut(dev, new Uint8Array(raster))
      // 0x0C = print without feeding (chains to the next page); 0x1A = final print
      // with feed so the finished strip clears the cutter.
      await writeOut(dev, new Uint8Array([i === bitmaps.length - 1 ? 0x1a : 0x0c]))
    }

    stage('Printing')
    await waitForCompletion(dev)
    return { status, lines: bitmaps.length }
  } finally {
    try {
      await dev.releaseInterface(IFACE)
    } catch {
      // best effort — the print already happened
    }
  }
}
