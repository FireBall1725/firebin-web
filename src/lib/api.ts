// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// Thin REST client for the FireBin API. Talks to `/api/v1`, which Vite proxies
// to the Go backend in dev and nginx proxies in production. No generated SDK —
// the OpenAPI contract is the source of truth and this mirrors it by hand.

export type UserRole = 'admin' | 'member' | 'viewer'

export interface User {
  id: string
  username: string
  email?: string
  display_name?: string
  role: UserRole
  is_instance_admin: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  user: User
}

export interface APIToken {
  id: string
  user_id: string
  name: string
  token_suffix: string
  scopes: string[]
  last_used_at?: string
  expires_at?: string
  revoked_at?: string
  created_at: string
}

export interface CreatedPAT {
  token: string
  meta: APIToken
}

export interface KicadLibrarySettings {
  enabled: boolean
  /** What goes in a generated .kicad_httplib. Empty until an admin saves one. */
  root_url: string
  /** Where the KiCad routes are mounted, e.g. "/api/kicad-lib". Appended to the
   *  browser's origin to suggest a root_url, so the path is not duplicated here. */
  route_path: string
}

/** One KiCad workstation's credential. The secret is never returned; token_suffix
 *  is what distinguishes rows in the list. */
export interface KicadLibraryToken {
  id: string
  name: string
  token_suffix: string
  created_by?: string
  last_used_at?: string
  revoked_at?: string
  created_at: string
}

export interface CreatedKicadLibraryToken {
  /** Shown once and never recoverable; only its hash is stored. */
  token: string
  meta: KicadLibraryToken
  route_path: string
  /** The finished .kicad_httplib as text. Write it out byte for byte.
   *
   *  Deliberately a string rather than an object: parsing and re-serialising it
   *  here would emit `"version": 1` where KiCad is given `1.0`, because
   *  JavaScript numbers cannot represent the difference. */
  config_file: string
}

export interface Category {
  id: string
  parent_id?: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  part_count: number
}

// ── Assistant conversations ─────────────────────────────────────────────────
export interface ConversationMessage {
  id: string
  seq: number
  role: 'user' | 'assistant'
  content: string
  // The tool calls and their results, kept so an answer's numbers can be traced
  // back to what was actually read.
  tool_calls?: unknown
  tool_results?: unknown
  created_at: string
}

export interface Conversation {
  id: string
  title: string
  subject_kind?: string
  subject_id?: string
  message_count: number
  messages?: ConversationMessage[]
  created_at: string
  updated_at: string
}

export interface AssistantStep {
  tool: string
  input: string
  output: string
  is_error?: boolean
}

export interface AssistantTurn {
  text: string
  steps?: AssistantStep[]
  usage: {
    model_id: string
    input_tokens: number
    output_tokens: number
    estimated_cost_usd: number
    cost_known: boolean
  }
  rounds: number
  hit_round_limit?: boolean
}

export interface AssistantReply {
  conversation_id: string
  title?: string
  turn?: AssistantTurn
  // Present when the turn failed. The turn is still returned when there is one,
  // because the tools it managed are worth seeing.
  error?: string
}

export interface AssistantUsage {
  turns: number
  failed_turns: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  unpriced_turns: number
}

// ── AI assistant ────────────────────────────────────────────────────────────
// The settings page renders whatever fields a provider declares, so adding a
// provider on the server needs no change on this side.
export interface AIConfigField {
  key: string
  label: string
  type: 'password' | 'text' | 'url' | 'model'
  required: boolean
  placeholder?: string
  help_text?: string
  options?: string[]
}

export interface AIProviderStatus {
  name: string
  display_name: string
  description: string
  help_text?: string
  help_url?: string
  local: boolean
  config_fields: AIConfigField[]
  // Saved values, with any secret replaced by "***". Never send that value
  // back: an untouched secret is sent by omitting the field entirely.
  config: Record<string, string>
  // enabled means it has what it needs to run. Which provider answers is the
  // active selection, not this.
  enabled: boolean
  active: boolean
  has_secret: boolean
  can_list_models: boolean
}

export interface AISettings {
  enabled: boolean
  active_provider: string
  providers: AIProviderStatus[]
}

export interface AITestResult {
  ok: boolean
  model: string
  reply?: string
  error?: string
  tokens?: number
  cost_usd?: string
}

// PartMatch is a part from a specification search, carrying the parameters that
// satisfied the query so the UI can show why it came back.
export interface PartMatch extends Part {
  matched_parameters: PartParameter[]
}

export interface PartParameter {
  id: string
  template_id: string
  template_name: string
  units?: string
  value: string
}

export interface ParameterTemplate {
  id: string
  name: string
  units?: string
}

export interface Project {
  id: string
  name: string
  description?: string
  tags: string[]
  boards?: Board[]
  board_count: number
  created_at: string
  updated_at: string
  cover_asset_id?: string
  cover_asset_kind?: string
}

export interface Board {
  id: string
  project_id: string
  name: string
  description?: string
  revision?: string
  source_filename?: string
  source_format: string
  kind: 'board' | 'panel'
  copies: number
  position: number
  lines?: BOMLine[]
  line_count: number
  created_at: string
  updated_at: string
}

export interface ProjectAsset {
  id: string
  project_id: string
  board_id?: string
  name: string
  kind: 'ibom' | 'image' | 'pcbrender' | 'other'
  mime: string
  size: number
  created_at: string
}

export interface BoardPreview {
  format: string
  name: string
  revision: string
  line_count: number
  matched: number
  unmatched: PreviewUnmatched[]
  panels: { name: string; copies: number }[]
  ibom: string
  renders: string[]
}

export interface PreviewUnmatched {
  key: string
  refs: string
  value: string
  footprint: string
  mpn: string
}

export interface BOMLineInput {
  refs?: string
  quantity: number
  value?: string
  footprint?: string
  mpn?: string
  manufacturer?: string
  supplier_sku?: string
  ipn?: string
  description?: string
  // Pin the line to a specific inventory part ("none" clears the match). Absent
  // leaves the match to auto-resolution.
  part_id?: string
}

export interface UploadBoardOpts {
  name?: string
  revision?: string
  keepPanels?: boolean
  keepRenders?: boolean
  attachIbom?: boolean
}

export type MatchKind = 'fbpn' | 'project' | 'mpn' | 'supplier' | 'value_footprint' | 'manual' | 'none'

export interface BOMLine {
  id: string
  board_id: string
  refs: string
  quantity: number
  value: string
  footprint: string
  mpn?: string
  manufacturer?: string
  supplier_sku?: string
  ipn?: string
  description?: string
  part_id?: string
  part_name?: string
  match_kind: MatchKind
  position: number
}

export interface PickEntry {
  stock_item_id: string
  part_id: string
  part_name: string
  location_id?: string
  location_name: string
  quantity: number
}
export interface PickShortfall {
  part_id: string
  part_name: string
  required: number
  available: number
  short: number
}
export interface PickUnmatched {
  refs: string
  value: string
  quantity: number
}
export interface PickList {
  board_id: string
  board_name: string
  quantity: number
  copies: number
  total_units: number
  entries: PickEntry[]
  shortfalls: PickShortfall[]
  unmatched: PickUnmatched[]
}

export interface Part {
  id: string
  category_id?: string
  variant_of?: string
  name: string
  description?: string
  ipn?: string
  package?: string
  kicad_symbol?: string
  kicad_footprint?: string
  keywords?: string
  barcode?: string
  image_path?: string
  is_template: boolean
  is_component: boolean
  is_assembly: boolean
  is_purchaseable: boolean
  is_trackable: boolean
  /** Recorded but not owned. Distinct from total_stock 0, which only says the
   *  count is zero and cannot say whether the part was ever on the shelf. */
  reference_only: boolean
  minimum_stock: number
  default_location_id?: string
  created_at: string
  updated_at: string
  total_stock: number
  variant_count?: number
  parameters?: PartParameter[]
  variants?: Part[]
  manufacturer_parts?: ManufacturerPart[]
  alternatives?: PartAlternative[]
  primary_mpn?: string
  primary_manufacturer?: string
  primary_location?: string
  primary_location_id?: string
  /** True when a stored PDF is linked to this part. Set by the list endpoints
   *  only, so the palette can show a PDF badge without a per-row fetch. */
  has_datasheet?: boolean
}

export interface DatasheetPartLink {
  part_id: string
  part_name: string
  manufacturer_part_id?: string
  mpn?: string
  category_id?: string
  category_name?: string
}

/** text_status is what the assistant can do with the document.
 *  'no_text_layer' means it is a scan (mechanical drawings usually are), which
 *  is a normal outcome rather than a failure. */
export type DatasheetTextStatus = 'pending' | 'ok' | 'no_text_layer' | 'failed'

export interface Datasheet {
  id: string
  sha256: string
  filename: string
  title?: string
  mime: string
  size_bytes: number
  page_count?: number
  source_url?: string
  origin: 'upload' | 'mirror'
  language?: string
  text_status: DatasheetTextStatus
  extracted_at?: string
  created_at: string
  updated_at: string
  /** Empty for a document not linked to a part yet, which is allowed. */
  parts: DatasheetPartLink[]
}

export interface DatasheetStats {
  count: number
  total_bytes: number
  unlinked: number
  mirror_candidates: number
}

export interface DatasheetSettings {
  auto_mirror: boolean
  extract_text: boolean
  max_bytes: number
  storage_path: string
  count: number
  total_bytes: number
  unlinked: number
  mirror_candidates: number
}

export interface PartAlternative {
  mpn: string
  manufacturer?: string
  description?: string
  part_id?: string
  part_name?: string
}

export interface ParameterInput {
  name: string
  units?: string
  value: string
}

export interface Manufacturer {
  id: string
  name: string
  website?: string
}

export interface Supplier {
  id: string
  key: string
  name: string
  website?: string
  is_distributor: boolean
}

export interface PriceBreak {
  id?: string
  quantity: number
  price: number
  currency: string
}

export interface SupplierPart {
  id: string
  manufacturer_part_id: string
  supplier_id: string
  supplier_name: string
  sku: string
  packaging?: string
  moq?: number
  url?: string
  pricing: PriceBreak[]
}

export interface ManufacturerPart {
  id: string
  part_id: string
  manufacturer_id?: string
  manufacturer_name?: string
  mpn: string
  description?: string
  datasheet_url?: string
  created_at: string
  supplier_parts: SupplierPart[]
}

export interface PartInput {
  name: string
  /** Recorded but not owned. Omit on PATCH to leave it as it is. */
  reference_only?: boolean
  category_id?: string | null
  variant_of?: string | null
  description?: string | null
  ipn?: string | null
  package?: string | null
  kicad_symbol?: string | null
  kicad_footprint?: string | null
  keywords?: string | null
  image_path?: string | null
  is_template?: boolean
  minimum_stock?: number
  parameters?: ParameterInput[]
}

export interface StorageLocation {
  id: string
  parent_id?: string
  name: string
  description?: string
  barcode?: string
  created_at: string
  updated_at: string
}

export interface StockItem {
  id: string
  part_id: string
  part_name?: string
  category_name?: string
  image_path?: string
  location_id?: string
  location_name?: string
  supplier_part_id?: string
  quantity: number
  batch?: string
  serial?: string
  purchase_price?: number
  status: string
  note?: string
  barcode?: string // a barcoded lot (mini spool cut off a reel)
  name?: string // human label for the lot ("Mini spool #1")
  split_from?: string
  added_at: string
  updated_at: string
}

/** One day of the movement sparkline. Days with no movement are present with a
 *  zero, so a quiet stretch reads as a flat run rather than closing up. */
export interface DayCount {
  day: string
  count: number
}

/** How close one board is to buildable, for one of each.
 *
 *  Two numbers because they fail differently: `short` is matched parts the shelf
 *  cannot cover, `unmatched` is lines that resolve to no part at all. A board
 *  with nothing short and six unmatched is not ready, and only the second number
 *  says so. */
export interface BoardFill {
  board_id: string
  project_id: string
  name: string
  lines: number
  short: number
  unmatched: number
}

export interface Stats {
  parts_count: number
  variants_count: number
  locations_count: number
  low_stock_count: number
  total_units: number
  not_stocked_count: number
  unmatched_bom_lines: number
  parts_without_symbol: number
  moves_30d: number
  movement: DayCount[]
  boards: BoardFill[]
}

export interface StockTransaction {
  id: string
  stock_item_id: string
  part_id?: string
  part_name?: string
  kind: string
  delta: number
  resulting_quantity: number
  from_location_id?: string
  to_location_id?: string
  from_location_name?: string
  to_location_name?: string
  note?: string
  user_id?: string
  created_at: string
}

export type AdjustKind = 'add' | 'remove' | 'count' | 'adjust'

export interface EigpParsed {
  mpn: string
  quantity: number
  customer_part: string
  distributor_part: string
  sales_order: string
  invoice: string
  packing_list: string
  customer_po: string
  date_code: string
  lot_code: string
  country_of_origin: string
  distributor: string
  fields: Record<string, string>
}

export interface ScanResult {
  parsed: EigpParsed
  is_eigp: boolean
  match?: { part_id: string; part_name: string }
  raw_code: string
}

export interface EnrichedPart {
  mpn: string
  name: string
  description: string
  manufacturer: string
  category: string
  package: string
  datasheet_url: string
  image_url: string
  parameters: { name: string; value: string; units?: string }[]
  suppliers: { name: string; sku: string; url?: string; packaging?: string; prices: PriceBreak[] }[]
  source: string
}

export interface ProviderSettings {
  provider: string
  label: string
  configured: boolean
  enabled: boolean
  client_id: string
  secret_set: boolean
  from_env: boolean
  scope?: string // nexar only
  // Providers that authenticate with a single API key and have no client id
  // (Mouser). The card renders one field instead of two.
  key_only?: boolean
}

export interface EnrichmentSettings {
  providers: ProviderSettings[]
  currency: string
}

// LabelMedia is a label sheet geometry (Avery-compatible or custom). All lengths
// are in PDF points (1pt = 1/72").
export interface LabelMedia {
  id: string
  brand: string
  code: string
  name: string
  page_w: number
  page_h: number
  label_w: number
  label_h: number
  corner_radius: number
  cols: number
  rows: number
  x0: number
  y0: number
  pitch_x: number
  pitch_y: number
  cut_guides: boolean
  kind: string
  builtin: boolean
}

// A field a label element can bind to; '' or 'text' means a literal Value.
export type LabelField =
  | '' | 'text' | 'name' | 'ipn' | 'package' | 'mpn' | 'manufacturer'
  | 'location' | 'quantity' | 'description' | 'barcode' | 'qr' | 'param'

export interface LabelElement {
  type: 'text' | 'qr' | 'barcode' | 'line' | 'rect'
  field?: LabelField
  x: number
  y: number
  w: number
  h: number
  value?: string
  font?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'L' | 'C' | 'R' // horizontal text alignment within the box
  valign?: 'T' | 'M' | 'B' // vertical text alignment within the box
  thickness?: number // line / rect stroke weight (pt)
  filled?: boolean // rect: solid fill vs outline
  invert?: boolean // text / qr / barcode: white-on-black
  paramName?: string // for field='param': which part parameter to show
}

export interface LabelTemplate {
  id: string
  name: string
  label_media_id?: string
  elements: LabelElement[]
  created_at: string
  updated_at: string
}

// ResolvedLabel is a label with its field bindings filled for a specific part,
// plus the media geometry — everything the client needs to render it to a canvas.
export interface ResolvedLabel {
  label_w: number
  label_h: number
  kind: string
  code: string
  elements: LabelElement[]
}

// LabelCatalogEntry is a known label product from the bundled catalogue (not yet
// in the user's list). Same geometry shape as LabelMedia, minus id/flags.
export interface LabelCatalogEntry {
  brand: string
  code: string
  name: string
  page_size: string
  page_w: number
  page_h: number
  label_w: number
  label_h: number
  corner_radius: number
  cols: number
  rows: number
  x0: number
  y0: number
  pitch_x: number
  pitch_y: number
}

// JobTask is a background job's client-facing record.
export interface JobTask {
  id: string
  type: string
  status: 'queued' | 'running' | 'retrying' | 'completed' | 'failed' | 'cancelling' | 'cancelled'
  progress_done: number
  progress_total: number
  result?: { updated?: number; skipped?: number } & Record<string, unknown>
  error?: string
  created_at: string
}

// JobLog is one line in a task's timeline.
export interface JobLog {
  id: number
  task_id: string
  ts: string
  level: string
  message: string
}

const BASE = '/api/v1'
const ACCESS_KEY = 'firebin.access'
const REFRESH_KEY = 'firebin.refresh'

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set(pair: { access_token: string; refresh_token: string }) {
    localStorage.setItem(ACCESS_KEY, pair.access_token)
    localStorage.setItem(REFRESH_KEY, pair.refresh_token)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function parseError(res: Response): Promise<never> {
  let msg = res.statusText
  try {
    const body = await res.json()
    if (body?.error) msg = body.error
  } catch {
    // non-JSON error body; keep statusText
  }
  throw new ApiError(res.status, msg)
}

// Single-flight refresh so concurrent 401s don't fire multiple refreshes.
let refreshing: Promise<boolean> | null = null

// Called once when a session is gone for good: a 401 that a refresh could not
// rescue. Without it the tokens were cleared and nothing else happened, so the
// app carried on rendering as though signed in and every request failed with a
// message about that request rather than about the session. The session layer
// knows; the router has to be told.
let sessionExpired: (() => void) | null = null

export function onSessionExpired(fn: () => void) {
  sessionExpired = fn
}

function endSession() {
  tokenStore.clear()
  const notify = sessionExpired
  // Cleared first, so a listener that re-renders and refetches cannot loop back
  // through here.
  sessionExpired = null
  notify?.()
}

// resumeSession attempts to get back a usable access token from a stored
// refresh token, for the case where only the access token is gone. Callers that
// have neither get false and belong on the login screen.
export async function resumeSession(): Promise<boolean> {
  if (tokenStore.access) return true
  if (!tokenStore.refresh) return false
  return tryRefresh()
}

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing
  const refresh = tokenStore.refresh
  if (!refresh) return false
  refreshing = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      })
      if (!res.ok) {
        tokenStore.clear()
        return false
      }
      const pair: TokenPair = await res.json()
      tokenStore.set(pair)
      return true
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

// requestBlob fetches raw bytes (asset content, generated PDFs) with auth +
// refresh, for rendering via object URLs (auth headers can't ride on an
// <img>/<iframe> src).
async function requestBlob(path: string, options: RequestInit = {}, retry = true): Promise<Blob> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const access = tokenStore.access
  if (access) headers.set('Authorization', `Bearer ${access}`)
  const res = await fetch(`${BASE}${path}`, { ...options, headers, cache: 'no-store' })
  if (res.status === 401 && retry) {
    if (tokenStore.refresh && await tryRefresh()) return requestBlob(path, options, false)
    endSession()
  }
  if (!res.ok) return parseError(res)
  return res.blob()
}


// streamAssistantMessage reads a streamed answer as it is written.
//
// Not EventSource: that can only issue a GET, which would put the question in
// the query string where it lands in access logs and browser history. A POST
// whose body is read as a stream keeps the question in the body and still
// arrives a fragment at a time.
//
// onEvent is called for every frame. The caller decides what to render; this
// only parses the wire format.
export async function streamAssistantMessage(
  body: {
    question: string
    conversation_id?: string
    subject_kind?: string
    subject_id?: string
    context?: string
  },
  onEvent: (event: string, data: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const access = tokenStore.access
  if (access) headers.set('Authorization', `Bearer ${access}`)

  const res = await fetch(`${BASE}/assistant/messages/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    signal,
  })
  // Everything refusable is refused before the stream opens, so a non-2xx here
  // still has a JSON body worth reading.
  if (res.status === 401) endSession()
  if (!res.ok) return parseError(res)
  if (!res.body) throw new ApiError(500, 'the server sent no stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // Frames are separated by a blank line. A partial frame stays in the
    // buffer until the rest of it arrives, which is the whole reason this is
    // not a naive split on newline.
    let sep = buffer.indexOf('\n\n')
    while (sep !== -1) {
      const frame = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      let event = 'message'
      const dataLines: string[] = []
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length > 0) {
        try {
          onEvent(event, JSON.parse(dataLines.join('\n')))
        } catch {
          // A frame that will not parse is skipped rather than killing the
          // stream: the rest of the answer is still worth having.
        }
      }
      sep = buffer.indexOf('\n\n')
    }
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers)
  // FormData sets its own multipart Content-Type (with boundary); only default
  // to JSON for other bodies.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const access = tokenStore.access
  if (access) headers.set('Authorization', `Bearer ${access}`)

  const res = await fetch(`${BASE}${path}`, { ...options, headers, cache: 'no-store' })

  if (res.status === 401 && retry) {
    if (tokenStore.refresh && await tryRefresh()) {
      return request<T>(path, options, false)
    }
    // The refresh is gone or was rejected, so this is not a failed request, it
    // is the end of the session.
    endSession()
  }
  if (!res.ok) return parseError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}


// ── KiCad libraries ───────────────────────────────────────────────────────────

export interface KicadLibraryItem {
  kind: 'symbol' | 'footprint'
  lib: string
  name: string
  has_source: boolean
}

export interface KicadLibrarySummary {
  kind: 'symbol' | 'footprint'
  lib: string
  count: number
  with_source: number
  /** When this library last arrived, and from where. Null means the import
   *  predates imports being recorded. A full KiCad install is 438 libraries,
   *  so this is how the one you just added is findable. */
  imported_at: string | null
  source: string
}

export interface KicadIndexStatus {
  scanned: boolean
  meta?: {
    source: string
    kicad_version?: string
    scanned_at: string
    symbol_count: number
    footprint_count: number
    bytes_stored: number
  }
}

/** One primitive of a rendered symbol or footprint. Already in screen space
 *  (Y down), with arcs and rectangles flattened to polylines by the server. */
export interface KicadDrawItem {
  type: 'line' | 'circle' | 'pad'
  points?: [number, number][]
  center?: [number, number]
  r?: number
  w?: number
  size?: [number, number]
  shape?: string
  angle?: number
  layer?: string
  drill?: number
  fill?: string
}

export interface KicadSuggestion {
  lib_id: string
  /** Where the candidate came from: a shipped board, an MPN name match, or a
   *  category/package rule. Determines how much it can be trusted. */
  source: 'bom' | 'mpn' | 'category' | 'package'
  detail?: string
  confidence: number
}

export interface KicadSuggestions {
  symbols: KicadSuggestion[]
  footprints: KicadSuggestion[]
  /** Anything deliberately withheld, and why. */
  notes?: string[]
}

export interface KicadUsage {
  part_id: string
  part_name: string
  category?: string
}

export interface KicadDrawing {
  kind: 'symbol' | 'footprint'
  bbox: { minx: number; miny: number; maxx: number; maxy: number }
  items: KicadDrawItem[]
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  getSetupStatus() {
    return request<{ setup_required: boolean }>('/auth/setup')
  },
  async register(username: string, password: string, email?: string) {
    const pair = await request<TokenPair>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, email: email || undefined }),
    })
    tokenStore.set(pair)
    return pair
  },
  async login(username: string, password: string) {
    const pair = await request<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    tokenStore.set(pair)
    return pair
  },
  async logout() {
    const refresh = tokenStore.refresh
    if (refresh) {
      await request('/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: refresh }),
      }).catch(() => undefined)
    }
    tokenStore.clear()
  },
  me() {
    return request<User>('/me')
  },

  // ── Personal access tokens ──────────────────────────────────────────────────
  listTokens() {
    return request<APIToken[]>('/tokens')
  },
  createToken(name: string, scopes: string[] = []) {
    return request<CreatedPAT>('/tokens', {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    })
  },
  revokeToken(id: string) {
    return request<{ status: string }>(`/tokens/${id}`, { method: 'DELETE' })
  },
  /** Removes an already-revoked token's record. Revoking is what stops the
   *  credential working; this only tidies the list afterwards, and the API
   *  refuses it on a token that is still live. */
  deleteToken(id: string) {
    return request<{ status: string }>(`/tokens/${id}?purge=true`, { method: 'DELETE' })
  },

  // ── Categories ──────────────────────────────────────────────────────────────
  listCategories() {
    return request<Category[]>('/categories')
  },
  createCategory(name: string, parentID?: string) {
    return request<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: parentID ?? null }),
    })
  },
  deleteCategory(id: string) {
    return request<{ status: string }>(`/categories/${id}`, { method: 'DELETE' })
  },

  // ── Projects & boards ───────────────────────────────────────────────────────
  listProjects() {
    return request<Project[]>('/projects')
  },
  createProject(body: { name: string; description?: string; tags?: string[] }) {
    return request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) })
  },
  getProject(id: string) {
    return request<Project>(`/projects/${id}`)
  },
  updateProject(id: string, body: { name: string; description?: string; tags?: string[] }) {
    return request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteProject(id: string) {
    return request<{ status: string }>(`/projects/${id}`, { method: 'DELETE' })
  },
  uploadProjectCover(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<ProjectAsset>(`/projects/${id}/cover`, { method: 'POST', body: form })
  },
  removeProjectCover(id: string) {
    return request<{ status: string }>(`/projects/${id}/cover`, { method: 'DELETE' })
  },
  previewBoard(projectID: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<BoardPreview>(`/projects/${projectID}/boards/preview`, { method: 'POST', body: form })
  },
  setProjectMatch(projectID: string, matchKey: string, partID: string) {
    return request<{ status: string }>(`/projects/${projectID}/matches`, {
      method: 'POST',
      body: JSON.stringify({ match_key: matchKey, part_id: partID }),
    })
  },
  createBlankBoard(projectID: string, body: { name: string; revision?: string }) {
    return request<Board>(`/projects/${projectID}/boards/blank`, { method: 'POST', body: JSON.stringify(body) })
  },
  addBOMLine(boardID: string, body: BOMLineInput) {
    return request<BOMLine>(`/boards/${boardID}/lines`, { method: 'POST', body: JSON.stringify(body) })
  },
  updateBOMLine(lineID: string, body: BOMLineInput) {
    return request<BOMLine>(`/lines/${lineID}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteBOMLine(lineID: string) {
    return request<{ status: string }>(`/lines/${lineID}`, { method: 'DELETE' })
  },
  uploadBoard(projectID: string, file: File, opts: UploadBoardOpts = {}) {
    const form = new FormData()
    form.append('file', file)
    if (opts.name) form.append('name', opts.name)
    if (opts.revision) form.append('revision', opts.revision)
    if (opts.keepPanels === false) form.append('keep_panels', 'false')
    if (opts.keepRenders === false) form.append('keep_renders', 'false')
    if (opts.attachIbom === false) form.append('attach_ibom', 'false')
    return request<Board>(`/projects/${projectID}/boards`, { method: 'POST', body: form })
  },
  getBoard(id: string) {
    return request<Board>(`/boards/${id}`)
  },
  getPickList(boardID: string, quantity: number) {
    return request<PickList>(`/boards/${boardID}/pick-list?quantity=${quantity}`)
  },
  uploadBoardAsset(boardID: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<ProjectAsset>(`/boards/${boardID}/assets`, { method: 'POST', body: form })
  },
  uploadPartImage(partID: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<Part>(`/parts/${partID}/image`, { method: 'POST', body: form })
  },
  updateBoard(id: string, body: { name?: string; revision?: string; copies?: number }) {
    return request<Board>(`/boards/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteBoard(id: string) {
    return request<{ status: string }>(`/boards/${id}`, { method: 'DELETE' })
  },
  listProjectAssets(projectID: string) {
    return request<ProjectAsset[]>(`/projects/${projectID}/assets`)
  },
  assetBlob(id: string) {
    return requestBlob(`/assets/${id}`)
  },
  deleteAsset(id: string) {
    return request<{ status: string }>(`/assets/${id}`, { method: 'DELETE' })
  },

  // ── Datasheets ──────────────────────────────────────────────────────────────
  listDatasheets(opts: { search?: string; category?: string; part?: string; unlinked?: boolean } = {}) {
    const q = new URLSearchParams()
    if (opts.search) q.set('search', opts.search)
    if (opts.category) q.set('category', opts.category)
    if (opts.part) q.set('part', opts.part)
    if (opts.unlinked) q.set('unlinked', 'true')
    const qs = q.toString()
    return request<Datasheet[]>(`/datasheets${qs ? `?${qs}` : ''}`)
  },
  datasheetStats() {
    return request<DatasheetStats>('/datasheets/stats')
  },
  getDatasheet(id: string) {
    return request<Datasheet>(`/datasheets/${id}`)
  },
  /** The PDF itself. Fetched as an authenticated blob rather than pointed at
   *  with a bare src, because the content route requires a token. */
  datasheetBlob(id: string) {
    return requestBlob(`/datasheets/${id}/content`)
  },
  uploadDatasheet(file: File, opts: { partID?: string; manufacturerPartID?: string; title?: string } = {}) {
    const form = new FormData()
    form.append('file', file)
    if (opts.partID) form.append('part_id', opts.partID)
    if (opts.manufacturerPartID) form.append('manufacturer_part_id', opts.manufacturerPartID)
    if (opts.title) form.append('title', opts.title)
    return request<Datasheet>('/datasheets', { method: 'POST', body: form })
  },
  updateDatasheet(id: string, body: { title?: string | null }) {
    return request<Datasheet>(`/datasheets/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteDatasheet(id: string) {
    return request<void>(`/datasheets/${id}`, { method: 'DELETE' })
  },
  linkDatasheetPart(id: string, partID: string, manufacturerPartID?: string) {
    return request<Datasheet>(`/datasheets/${id}/parts`, {
      method: 'POST',
      body: JSON.stringify({ part_id: partID, manufacturer_part_id: manufacturerPartID ?? null }),
    })
  },
  unlinkDatasheetPart(id: string, partID: string) {
    return request<void>(`/datasheets/${id}/parts/${partID}`, { method: 'DELETE' })
  },
  /** Save a local copy of one MPN's datasheet. Returns a task to poll. */
  mirrorDatasheet(manufacturerPartID: string) {
    return request<{ task_id: string }>(`/manufacturer-parts/${manufacturerPartID}/datasheet/mirror`, {
      method: 'POST',
    })
  },
  /** Backfill every part that has a datasheet URL and no stored copy.
   *  task_id is null when there was nothing to do. */
  bulkMirrorDatasheets() {
    return request<{ task_id: string | null; targets: number }>('/datasheets/bulk/mirror', { method: 'POST' })
  },
  /** Read the text out of every datasheet still pending. task_id is null when
   *  there was nothing left to do. */
  extractPendingDatasheets() {
    return request<{ task_id: string | null; datasheets: number }>('/datasheets/bulk/extract', { method: 'POST' })
  },
  extractDatasheet(id: string) {
    return request<{ task_id: string | null; datasheets: number }>(`/datasheets/${id}/extract`, { method: 'POST' })
  },
  getDatasheetSettings() {
    return request<DatasheetSettings>('/settings/datasheets')
  },
  updateDatasheetSettings(body: { auto_mirror?: boolean; extract_text?: boolean; max_bytes?: number }) {
    return request<DatasheetSettings>('/settings/datasheets', { method: 'PUT', body: JSON.stringify(body) })
  },

  // ── Parts ───────────────────────────────────────────────────────────────────
  listParameterTemplates() {
    return request<ParameterTemplate[]>('/parameter-templates')
  },
  listParts(opts: { search?: string; category?: string; topLevel?: boolean } = {}) {
    const q = new URLSearchParams()
    if (opts.search) q.set('search', opts.search)
    if (opts.category) q.set('category', opts.category)
    q.set('top_level', String(opts.topLevel ?? true))
    return request<Part[]>(`/parts?${q.toString()}`)
  },
  // searchParts asks by specification instead of by name: package and parameter
  // value, with unit-aware matching on the server. Kept separate from listParts
  // because it returns a different shape and joins part_parameters, which the
  // catalogue listing has no use for.
  searchParts(opts: {
    search?: string
    category?: string
    package?: string
    parameter?: string
    value?: string
    limit?: number
  }) {
    const q = new URLSearchParams()
    if (opts.search) q.set('search', opts.search)
    if (opts.category) q.set('category', opts.category)
    if (opts.package) q.set('package', opts.package)
    if (opts.parameter) q.set('parameter', opts.parameter)
    if (opts.value) q.set('value', opts.value)
    if (opts.limit) q.set('limit', String(opts.limit))
    return request<PartMatch[]>(`/parts/search?${q.toString()}`)
  },
  getPart(id: string) {
    return request<Part>(`/parts/${id}`)
  },
  createPart(input: PartInput) {
    return request<Part>('/parts', { method: 'POST', body: JSON.stringify(input) })
  },
  updatePart(id: string, input: PartInput) {
    return request<Part>(`/parts/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  },
  deletePart(id: string) {
    return request<{ status: string }>(`/parts/${id}`, { method: 'DELETE' })
  },


  // ── Assistant ─────────────────────────────────────────────────────────────
  // Whether the assistant is switched on and has a usable provider. Readable by
  // any signed-in user, unlike the settings it reflects.
  assistantStatus() {
    return request<{ enabled: boolean; ready: boolean }>('/assistant/status')
  },
  listConversations() {
    return request<Conversation[]>('/assistant/conversations')
  },
  getConversation(id: string) {
    return request<Conversation>(`/assistant/conversations/${id}`)
  },
  deleteConversation(id: string) {
    return request<{ status: string }>(`/assistant/conversations/${id}`, { method: 'DELETE' })
  },
  // Omit conversation_id to start a new thread. subject_* and context describe
  // the page a popup was opened from.
  sendAssistantMessage(body: {
    question: string
    conversation_id?: string
    subject_kind?: string
    subject_id?: string
    context?: string
  }) {
    return request<AssistantReply>('/assistant/messages', { method: 'POST', body: JSON.stringify(body) })
  },
  assistantUsage() {
    return request<AssistantUsage>('/assistant/usage')
  },

  // ── AI assistant ──────────────────────────────────────────────────────────
  getAISettings() {
    return request<AISettings>('/settings/ai')
  },
  // Every field is optional and an omitted one is left alone, so a section can
  // be saved without the caller having to restate the rest.
  updateAISettings(body: {
    enabled?: boolean
    active_provider?: string
    provider?: string
    config?: Record<string, string>
  }) {
    return request<AISettings>('/settings/ai', { method: 'PUT', body: JSON.stringify(body) })
  },
  testAIProvider(name: string) {
    return request<AITestResult>(`/settings/ai/${encodeURIComponent(name)}/test`, { method: 'POST' })
  },
  listAIModels(name: string) {
    return request<{ models: string[]; error?: string }>(`/settings/ai/${encodeURIComponent(name)}/models`)
  },

  // ── KiCad libraries ─────────────────────────────────────────────────────────
  kicadIndexStatus() {
    return request<KicadIndexStatus>('/kicad/libraries/status')
  },
  listKicadLibraries(kind?: 'symbol' | 'footprint') {
    return request<KicadLibrarySummary[]>(`/kicad/libraries${kind ? `?kind=${kind}` : ''}`)
  },
  listKicadLibraryItems(kind: 'symbol' | 'footprint', lib: string) {
    return request<KicadLibraryItem[]>(
      `/kicad/libraries/items?kind=${kind}&lib=${encodeURIComponent(lib)}`,
    )
  },
  searchKicadLibrary(kind: 'symbol' | 'footprint', q: string) {
    return request<KicadLibraryItem[]>(
      `/kicad/libraries/search?kind=${kind}&q=${encodeURIComponent(q)}`,
    )
  },
  uploadKicadBatch(
    scanID: string,
    items: { kind: string; lib: string; name: string; source?: string }[],
    overwrite = false,
  ) {
    return request<{ stored: number; skipped: number }>('/kicad/libraries/batch', {
      method: 'POST',
      body: JSON.stringify({ scan_id: scanID, items, overwrite }),
    })
  },
  renameKicadLibrary(kind: 'symbol' | 'footprint', lib: string, name: string) {
    return request<{ moved: number }>('/kicad/libraries/rename', {
      method: 'POST',
      body: JSON.stringify({ kind, lib, name }),
    })
  },
  deleteKicadLibrary(kind: 'symbol' | 'footprint', lib: string) {
    return request<{ deleted: number }>(
      `/kicad/libraries?kind=${kind}&lib=${encodeURIComponent(lib)}`,
      { method: 'DELETE' },
    )
  },
  deleteKicadLibraryItem(kind: 'symbol' | 'footprint', lib: string, name: string) {
    return request<{ deleted: number }>(
      `/kicad/libraries?kind=${kind}&lib=${encodeURIComponent(lib)}&name=${encodeURIComponent(name)}`,
      { method: 'DELETE' },
    )
  },
  finishKicadScan(scanID: string, source: string, kicadVersion?: string) {
    return request<KicadIndexStatus['meta']>('/kicad/libraries/finish', {
      method: 'POST',
      body: JSON.stringify({ scan_id: scanID, source, kicad_version: kicadVersion ?? '' }),
    })
  },
  kicadUsage(kind: 'symbol' | 'footprint', libID: string) {
    return request<KicadUsage[]>(
      `/kicad/libraries/usage?kind=${kind}&lib_id=${encodeURIComponent(libID)}`,
    )
  },
  kicadSuggestions(partID: string) {
    return request<KicadSuggestions>(`/parts/${partID}/kicad/suggestions`)
  },
  kicadDrawing(kind: 'symbol' | 'footprint', libID: string) {
    return request<KicadDrawing>(
      `/kicad/libraries/drawing?kind=${kind}&lib_id=${encodeURIComponent(libID)}`,
    )
  },

  // ── Stock ───────────────────────────────────────────────────────────────────
  listPartStock(partID: string) {
    return request<StockItem[]>(`/parts/${partID}/stock`)
  },
  listPartHistory(partID: string) {
    return request<StockTransaction[]>(`/parts/${partID}/stock/history`)
  },
  adjustStock(
    partID: string,
    body: { kind: AdjustKind; quantity: number; location_id?: string | null; note?: string | null },
  ) {
    return request<StockItem>(`/parts/${partID}/stock/adjust`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  moveStock(body: { stock_item_id: string; to_location_id?: string | null; quantity: number; note?: string | null }) {
    return request<{ status: string }>('/stock/move', { method: 'POST', body: JSON.stringify(body) })
  },

  // ── Stock lots (barcoded units, e.g. a mini spool cut off a reel) ────────────
  getStockItem(id: string) {
    return request<StockItem>(`/stock-items/${id}`)
  },
  scanStockItem(barcode: string) {
    return request<StockItem>(`/stock/scan?barcode=${encodeURIComponent(barcode)}`)
  },
  splitStock(body: { source_id: string; quantity: number; to_location_id?: string | null; name?: string | null; barcode?: string | null }) {
    return request<StockItem>('/stock/split', { method: 'POST', body: JSON.stringify(body) })
  },
  mergeStock(body: { source_id: string; target_id: string }) {
    return request<{ status: string }>('/stock/merge', { method: 'POST', body: JSON.stringify(body) })
  },
  relocateStock(body: { stock_item_id: string; to_location_id?: string | null }) {
    return request<StockItem>('/stock/relocate', { method: 'POST', body: JSON.stringify(body) })
  },
  adjustStockLot(body: { stock_item_id: string; kind: 'add' | 'remove' | 'count'; quantity: number }) {
    return request<StockItem>('/stock/lot-adjust', { method: 'POST', body: JSON.stringify(body) })
  },
  printStockLabels(body: { media_id: string; template_id?: string; stock_item_ids: string[]; copies?: number; used_cells?: number[] }) {
    return requestBlob('/stock/labels/print', { method: 'POST', body: JSON.stringify(body) })
  },
  resolveStockLabel(body: { media_id: string; stock_item_id: string; elements: LabelElement[] }) {
    return request<ResolvedLabel>('/stock/labels/resolve', { method: 'POST', body: JSON.stringify(body) })
  },

  // ── Locations ───────────────────────────────────────────────────────────────
  listLocations() {
    return request<StorageLocation[]>('/locations')
  },
  createLocation(input: { name: string; parent_id?: string | null; barcode?: string | null; description?: string | null }) {
    return request<StorageLocation>('/locations', { method: 'POST', body: JSON.stringify(input) })
  },
  updateLocation(id: string, input: { name: string; parent_id?: string | null; barcode?: string | null; description?: string | null }) {
    return request<StorageLocation>(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  },
  deleteLocation(id: string) {
    return request<{ status: string }>(`/locations/${id}`, { method: 'DELETE' })
  },
  getLocation(id: string) {
    return request<StorageLocation>(`/locations/${id}`)
  },
  scanLocation(barcode: string) {
    return request<StorageLocation>(`/locations/scan?barcode=${encodeURIComponent(barcode)}`)
  },
  listLocationStock(id: string) {
    return request<StockItem[]>(`/locations/${id}/stock`)
  },

  // ── System ──────────────────────────────────────────────────────────────────
  health() {
    return request<{ status: string; service: string; version: string }>('/health')
  },

  // ── Users (admin) + self password ─────────────────────────────────────────────
  listUsers() {
    return request<User[]>('/users')
  },
  createUser(input: { username: string; password: string; role: UserRole; email?: string; display_name?: string }) {
    return request<User>('/users', { method: 'POST', body: JSON.stringify(input) })
  },
  updateUser(id: string, input: { role: UserRole; is_active: boolean; display_name?: string | null }) {
    return request<User>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  },
  resetUserPassword(id: string, password: string) {
    return request<{ status: string }>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
  },
  deleteUser(id: string) {
    return request<{ status: string }>(`/users/${id}`, { method: 'DELETE' })
  },
  changeMyPassword(current_password: string, new_password: string) {
    return request<{ status: string }>('/users/me/password', { method: 'PATCH', body: JSON.stringify({ current_password, new_password }) })
  },

  // ── Scan & enrichment ───────────────────────────────────────────────────────
  scan(code: string) {
    return request<ScanResult>('/scan', { method: 'POST', body: JSON.stringify({ code }) })
  },
  enrichStatus() {
    return request<{ configured: boolean; providers: { provider: string; label: string; configured: boolean }[] }>('/enrich/status')
  },
  enrich(mpn: string, opts?: { refresh?: boolean; providers?: string[] }) {
    const q = new URLSearchParams({ mpn })
    if (opts?.refresh) q.set('refresh', '1')
    if (opts?.providers?.length) q.set('providers', opts.providers.join(','))
    return request<{ found: boolean; cached?: boolean; part?: EnrichedPart }>(`/enrich?${q.toString()}`)
  },
  // Refresh one part from its MPN, applied server-side (same path as bulk).
  enrichPart(id: string, providers?: string[]) {
    return request<{ source: string }>(`/parts/${id}/enrich`, { method: 'POST', body: JSON.stringify({ providers: providers ?? [] }) })
  },
  exportData() {
    return requestBlob('/export')
  },
  importData(data: unknown, mode: 'merge' | 'replace' = 'merge') {
    return request<{ imported: number; by_table: Record<string, number>; replaced: boolean }>(`/import?mode=${mode}`, { method: 'POST', body: JSON.stringify(data) })
  },
  getEnrichmentSettings() {
    return request<EnrichmentSettings>('/settings/enrichment')
  },
  updateEnrichmentSettings(body: { provider?: string; client_id?: string; client_secret?: string; scope?: string; currency?: string; enabled?: boolean }) {
    return request<EnrichmentSettings>('/settings/enrichment', { method: 'PUT', body: JSON.stringify(body) })
  },
  testEnrichment(provider: string) {
    return request<{ ok: boolean; provider: string }>('/settings/enrichment/test', { method: 'POST', body: JSON.stringify({ provider }) })
  },
  getStockSettings() {
    return request<{ delete_empty_lots: boolean; empty_lot_count: number }>('/settings/stock')
  },
  updateStockSettings(body: { delete_empty_lots: boolean }) {
    return request<{ delete_empty_lots: boolean; empty_lot_count: number }>('/settings/stock', { method: 'PUT', body: JSON.stringify(body) })
  },
  cleanupEmptyLots() {
    return request<{ enabled: boolean; deleted: number }>('/stock/cleanup-empty', { method: 'POST' })
  },

  // ── KiCad library server ────────────────────────────────────────────────
  getKicadLibrarySettings() {
    return request<KicadLibrarySettings>('/settings/kicad-library')
  },
  updateKicadLibrarySettings(body: { enabled?: boolean; root_url?: string }) {
    return request<KicadLibrarySettings>('/settings/kicad-library', {
      method: 'PUT',
      body: JSON.stringify(body),
    })
  },
  listKicadLibraryTokens() {
    return request<KicadLibraryToken[]>('/settings/kicad-library/tokens')
  },
  createKicadLibraryToken(name: string) {
    return request<CreatedKicadLibraryToken>('/settings/kicad-library/tokens', {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  },
  revokeKicadLibraryToken(id: string) {
    return request<{ status: string }>(`/settings/kicad-library/tokens/${id}`, { method: 'DELETE' })
  },
  /** Removes an already-revoked workstation's record. Refused while it is live. */
  deleteKicadLibraryToken(id: string) {
    return request<{ status: string }>(`/settings/kicad-library/tokens/${id}?purge=true`, {
      method: 'DELETE',
    })
  },

  // ── Bulk part actions ───────────────────────────────────────────────────────
  bulkMoveParts(partIDs: string[], locationID: string | null) {
    return request<{ moved: number; failed: number }>('/parts/bulk/move', {
      method: 'POST', body: JSON.stringify({ part_ids: partIDs, location_id: locationID }),
    })
  },
  bulkEnrichParts(partIDs: string[]) {
    // Enqueues a background job; returns a task id to watch.
    return request<{ task_id: string }>('/parts/bulk/enrich', {
      method: 'POST', body: JSON.stringify({ part_ids: partIDs }),
    })
  },
  // Sets the reorder threshold on many parts at once. A minimum of 0 clears the
  // threshold rather than meaning "reorder at zero": the low-stock list filters
  // on minimum_stock > 0. `missing` counts ids the server did not find, which
  // happens when the selection went stale behind another edit.
  bulkSetMinimumStock(partIDs: string[], minimumStock: number) {
    return request<{ updated: number; missing: number }>('/parts/bulk/minimum-stock', {
      method: 'POST', body: JSON.stringify({ part_ids: partIDs, minimum_stock: minimumStock }),
    })
  },
  getTask(id: string) {
    return request<JobTask>(`/tasks/${id}`)
  },
  listTasks(params: { status?: string; type?: string; limit?: number } = {}) {
    const q = new URLSearchParams()
    if (params.status) q.set('status', params.status)
    if (params.type) q.set('type', params.type)
    if (params.limit) q.set('limit', String(params.limit))
    return request<JobTask[]>(`/tasks?${q.toString()}`)
  },
  getTaskLogs(id: string, afterId = 0) {
    return request<JobLog[]>(`/tasks/${id}/logs?after_id=${afterId}`)
  },
  cancelTask(id: string) {
    return request<{ status: string }>(`/tasks/${id}/cancel`, { method: 'POST' })
  },
  retryTask(id: string) {
    return request<{ task_id: string }>(`/tasks/${id}/retry`, { method: 'POST' })
  },
  clearFinishedTasks() {
    return request<{ cleared: number }>('/tasks', { method: 'DELETE' })
  },

  // ── Labels ──────────────────────────────────────────────────────────────────
  listLabelMedia() {
    return request<LabelMedia[]>('/labels/media')
  },
  searchLabelCatalog(q: string, limit = 60) {
    return request<LabelCatalogEntry[]>(`/labels/catalog?q=${encodeURIComponent(q)}&limit=${limit}`)
  },
  createLabelMedia(body: Partial<LabelMedia>) {
    return request<LabelMedia>('/labels/media', { method: 'POST', body: JSON.stringify(body) })
  },
  deleteLabelMedia(id: string) {
    return request<{ status: string }>(`/labels/media/${id}`, { method: 'DELETE' })
  },
  printLabels(body: {
    media_id: string
    template?: string
    template_id?: string
    part_ids: string[]
    copies?: number
    used_cells?: number[]
  }) {
    return requestBlob('/labels/print', { method: 'POST', body: JSON.stringify(body) })
  },
  previewLabel(body: { media_id: string; part_id: string; elements: LabelElement[] }) {
    return requestBlob('/labels/preview', { method: 'POST', body: JSON.stringify(body) })
  },
  // resolveLabel fills each element's field binding with the part's value and
  // returns the concrete elements + media geometry, for client-side canvas
  // rendering (tape / WebUSB printing). Field resolution stays server-authoritative.
  resolveLabel(body: { media_id: string; part_id: string; elements: LabelElement[] }) {
    return request<ResolvedLabel>('/labels/resolve', { method: 'POST', body: JSON.stringify(body) })
  },
  printLocationLabels(body: { media_id: string; template_id?: string; location_ids: string[]; copies?: number; used_cells?: number[] }) {
    return requestBlob('/locations/labels/print', { method: 'POST', body: JSON.stringify(body) })
  },
  resolveLocationLabel(body: { media_id: string; location_id: string; elements: LabelElement[] }) {
    return request<ResolvedLabel>('/locations/labels/resolve', { method: 'POST', body: JSON.stringify(body) })
  },
  listLabelTemplates() {
    return request<LabelTemplate[]>('/labels/templates')
  },
  createLabelTemplate(body: { name: string; label_media_id?: string | null; elements: LabelElement[] }) {
    return request<LabelTemplate>('/labels/templates', { method: 'POST', body: JSON.stringify(body) })
  },
  updateLabelTemplate(id: string, body: { name: string; label_media_id?: string | null; elements: LabelElement[] }) {
    return request<LabelTemplate>(`/labels/templates/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteLabelTemplate(id: string) {
    return request<{ status: string }>(`/labels/templates/${id}`, { method: 'DELETE' })
  },

  // ── Manufacturer / supplier parts ───────────────────────────────────────────
  listManufacturers() {
    return request<Manufacturer[]>('/manufacturers')
  },
  listSuppliers() {
    return request<Supplier[]>('/suppliers')
  },
  createManufacturerPart(partID: string, body: { manufacturer: string; mpn: string; datasheet_url?: string | null }) {
    return request<ManufacturerPart>(`/parts/${partID}/manufacturer-parts`, { method: 'POST', body: JSON.stringify(body) })
  },
  updateManufacturerPart(id: string, body: { manufacturer: string; mpn: string; datasheet_url?: string | null }) {
    return request<{ status: string }>(`/manufacturer-parts/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteManufacturerPart(id: string) {
    return request<{ status: string }>(`/manufacturer-parts/${id}`, { method: 'DELETE' })
  },
  createSupplierPart(
    mfgPartID: string,
    body: { supplier_id?: string; supplier?: string; sku: string; packaging?: string | null; moq?: number | null; url?: string | null; pricing: PriceBreak[] },
  ) {
    return request<{ id: string }>(`/manufacturer-parts/${mfgPartID}/supplier-parts`, { method: 'POST', body: JSON.stringify(body) })
  },
  deleteSupplierPart(id: string) {
    return request<{ status: string }>(`/supplier-parts/${id}`, { method: 'DELETE' })
  },

  // ── Dashboard ───────────────────────────────────────────────────────────────
  getStats() {
    return request<Stats>('/stats')
  },
  listLowStock() {
    return request<Part[]>('/parts/low-stock')
  },
  recentActivity() {
    return request<StockTransaction[]>('/stock/recent')
  },
}

// ── Real-time (SSE) ───────────────────────────────────────────────────────────
// One persistent stream for the whole app, started on first subscribe and kept
// open for the tab's lifetime (React StrictMode mount/unmount churn would kill a
// ref-counted connection, so we deliberately never tear it down — subscribers
// just add/remove from the listener set). Uses fetch-streaming rather than
// EventSource so we can send the Bearer header. Auto-reconnects with backoff.
// Change signals are coarse resource names ("parts"/"stock"/"locations"/"categories").
type EventListener = (resource: string) => void
const listeners = new Set<EventListener>()
let streamStarted = false

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function runStream() {
  for (;;) {
    try {
      const res = await fetch(`${BASE}/events`, {
        headers: tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {},
      })
      if (res.status === 401 && tokenStore.refresh) {
        await tryRefresh()
        continue
      }
      if (!res.ok || !res.body) {
        await sleep(2000)
        continue
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let sep: number
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          for (const line of frame.split('\n')) {
            if (line.startsWith('data:')) {
              try {
                const ev = JSON.parse(line.slice(5).trim())
                if (ev?.resource) listeners.forEach((l) => l(ev.resource))
              } catch {
                // ignore malformed frame
              }
            }
          }
        }
      }
    } catch {
      // network error / stream closed — reconnect after a short backoff
    }
    await sleep(2000)
  }
}

export function subscribeEvents(fn: EventListener): () => void {
  listeners.add(fn)
  if (!streamStarted) {
    streamStarted = true
    runStream()
  }
  return () => {
    listeners.delete(fn)
  }
}
