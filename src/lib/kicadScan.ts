// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// Browser-side equivalent of the kicad-index CLI, using the File System Access
// API. Same output, same upload endpoints; the difference is that nothing has
// to be installed.
//
// One thing the CLI can do that this cannot: follow a library table's URIs to
// wherever they point. A directory handle only grants access to what the user
// picked, so this reads the tables purely to recover library *nicknames* and
// walks the directories it was given for the files themselves.

export interface ScanItem {
  kind: 'symbol' | 'footprint'
  lib: string
  name: string
  source: string
}

export interface ScanProgress {
  phase: 'walking' | 'reading' | 'uploading' | 'done'
  files: number
  items: number
  bytes: number
  uploaded: number
  label: string
}

// Minimal File System Access typings; TS's DOM lib does not ship them yet.
interface FSHandle {
  kind: 'file' | 'directory'
  name: string
}
interface FSFileHandle extends FSHandle {
  kind: 'file'
  getFile(): Promise<File>
}
interface FSDirHandle extends FSHandle {
  kind: 'directory'
  values(): AsyncIterableIterator<FSFileHandle | FSDirHandle>
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FSDirHandle>
  }
}

export function browserScanSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickDirectory(): Promise<FSDirHandle | null> {
  if (!window.showDirectoryPicker) return null
  try {
    return await window.showDirectoryPicker({ mode: 'read', id: 'kicad-libraries' })
  } catch {
    return null // the user cancelled
  }
}

/** A symbol declaration at any indentation. Which of them are top level is
 *  decided by nesting depth, not by the whitespace in front of them. */
const SYMBOL_LINE = /^\s*\(symbol "([^"]+)"/

/** Counts parentheses on a line, ignoring any inside a quoted string.
 *
 *  Property values carry brackets all the time ("Cap (0603)", "R (1%)"), and
 *  counting those would throw the depth off for the rest of the file. */
function parenDelta(line: string): number {
  let depth = 0
  let inString = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '(') depth++
    else if (c === ')') depth--
  }
  return depth
}

/** Splits a .kicad_sym file into its top-level symbols.
 *
 *  Depth decides what is top level, not indentation. This used to match a tab
 *  followed by "(symbol", which is how KiCad's own libraries are written and is
 *  not how everyone else writes them: a library exported with two-space indents
 *  produced zero symbols, silently, and the upload that followed replaced the
 *  whole index with the footprints alone.
 *
 *  Nested unit sub-symbols ("R_0_1") sit a level deeper and must not become
 *  entries of their own, or the index fills with thousands of phantom parts. */
export function splitSymbols(text: string, lib: string): ScanItem[] {
  const out: ScanItem[] = []
  let name = ''
  let buf: string[] = []
  let depth = 0
  const flush = () => {
    if (name) out.push({ kind: 'symbol', lib, name, source: buf.join('\n') })
  }
  for (const line of text.split('\n')) {
    // A top-level symbol opens at depth 1: inside (kicad_symbol_lib, nothing
    // else. A unit opens at depth 2.
    const m = depth === 1 ? SYMBOL_LINE.exec(line) : null
    if (m) {
      flush()
      name = m[1]
      buf = [line]
      depth += parenDelta(line)
      continue
    }
    if (name) buf.push(line)
    depth += parenDelta(line)
  }
  flush()
  return out
}

/** Maps a library file's basename to the nickname KiCad knows it by.
 *
 *  This matters more than it looks. A PCM library lives in a file called
 *  SparkFun-Resistor.kicad_sym but is registered as "PCM_SparkFun-Resistor",
 *  and a symbol served under the wrong nickname will not resolve in KiCad. The
 *  file stem alone is only correct for the stock libraries. */
export function nicknamesFromLibTable(text: string): Map<string, string> {
  const out = new Map<string, string>()
  const re = /\(lib\s+\(name\s+"([^"]*)"\)\s*\(type\s+"([^"]*)"\)\s*\(uri\s+"([^"]*)"\)/g
  for (const m of text.matchAll(re)) {
    const [, nickname, type, uri] = m
    if (type.toLowerCase() === 'table') continue
    const base = uri.split('/').pop() ?? ''
    if (base) out.set(base, nickname)
  }
  return out
}

async function* walk(
  dir: FSDirHandle,
  path: string[] = [],
): AsyncGenerator<{ handle: FSFileHandle; path: string[]; parent: string }> {
  for await (const entry of dir.values()) {
    if (entry.kind === 'directory') {
      yield* walk(entry as FSDirHandle, [...path, entry.name])
    } else {
      yield { handle: entry as FSFileHandle, path, parent: path[path.length - 1] ?? '' }
    }
  }
}

/** Reads library tables out of a directory, if it holds any. */
export async function readLibTables(dir: FSDirHandle): Promise<Map<string, string>> {
  const nick = new Map<string, string>()
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file') continue
    if (entry.name !== 'sym-lib-table' && entry.name !== 'fp-lib-table') continue
    const text = await (entry as FSFileHandle).getFile().then((f) => f.text())
    for (const [k, v] of nicknamesFromLibTable(text)) nick.set(k, v)
  }
  return nick
}

/** Walks a directory tree collecting every symbol and footprint. */
export async function scanDirectory(
  dir: FSDirHandle,
  nicknames: Map<string, string>,
  onProgress: (p: Partial<ScanProgress>) => void,
): Promise<ScanItem[]> {
  const out: ScanItem[] = []
  let files = 0
  let bytes = 0

  for await (const { handle, parent } of walk(dir)) {
    const isSym = handle.name.endsWith('.kicad_sym')
    const isFp = handle.name.endsWith('.kicad_mod')
    if (!isSym && !isFp) continue

    files++
    const file = await handle.getFile()
    const text = await file.text()
    bytes += text.length

    if (isSym) {
      const stem = handle.name.replace(/\.kicad_sym$/, '')
      out.push(...splitSymbols(text, nicknames.get(handle.name) ?? stem))
    } else {
      // A .kicad_mod's library is the enclosing .pretty directory.
      const stem = parent.replace(/\.pretty$/, '')
      out.push({
        kind: 'footprint',
        lib: nicknames.get(parent) ?? stem,
        name: handle.name.replace(/\.kicad_mod$/, ''),
        source: text,
      })
    }

    if (files % 25 === 0) {
      onProgress({ phase: 'reading', files, items: out.length, bytes, label: handle.name })
    }
  }

  onProgress({ phase: 'reading', files, items: out.length, bytes, label: '' })
  return out
}

/** Bounded by bytes, not item count: symbol blocks range from about 1 KB to
 *  hundreds, so a fixed count sails through the passives and then exceeds the
 *  server's body cap on the connector libraries. */
const BATCH_BYTES = 6 * 1024 * 1024

export function* batches(items: ScanItem[]): Generator<ScanItem[]> {
  let start = 0
  while (start < items.length) {
    let end = start
    let size = 0
    while (end < items.length) {
      const n = items[end].source.length + items[end].lib.length + items[end].name.length + 64
      if (end > start && size + n > BATCH_BYTES) break
      size += n
      end++
    }
    yield items.slice(start, end)
    start = end
  }
}

export function newScanID(): string {
  return crypto.randomUUID()
}
