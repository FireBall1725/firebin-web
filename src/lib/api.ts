// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725

// Thin REST client for the FireBin API. Talks to `/api/v1`, which Vite proxies
// to the Go backend in dev and nginx proxies in production. No generated SDK —
// the OpenAPI contract is the source of truth and this mirrors it by hand.

export interface User {
  id: string
  username: string
  email?: string
  display_name?: string
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

export interface Category {
  id: string
  parent_id?: string
  name: string
  description?: string
  created_at: string
  updated_at: string
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
  boards?: Board[]
  board_count: number
  created_at: string
  updated_at: string
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
  panels: { name: string; copies: number }[]
  ibom: string
  renders: string[]
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

export type MatchKind = 'fbpn' | 'mpn' | 'supplier' | 'value_footprint' | 'manual' | 'none'

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

export interface Part {
  id: string
  category_id?: string
  variant_of?: string
  name: string
  description?: string
  ipn?: string
  package?: string
  keywords?: string
  barcode?: string
  image_path?: string
  is_template: boolean
  is_component: boolean
  is_assembly: boolean
  is_purchaseable: boolean
  is_trackable: boolean
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
  category_id?: string | null
  variant_of?: string | null
  description?: string | null
  ipn?: string | null
  package?: string | null
  keywords?: string | null
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
  location_id?: string
  location_name?: string
  supplier_part_id?: string
  quantity: number
  batch?: string
  serial?: string
  purchase_price?: number
  status: string
  note?: string
  added_at: string
  updated_at: string
}

export interface Stats {
  parts_count: number
  variants_count: number
  locations_count: number
  low_stock_count: number
  total_units: number
  inventory_value: number
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
  suppliers: { name: string; sku: string; prices: PriceBreak[] }[]
  source: string
}

export interface EnrichmentSettings {
  provider: string
  configured: boolean
  client_id: string
  secret_set: boolean
  scope: string
  from_env: boolean
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

// requestBlob fetches raw bytes (asset content) with auth + refresh, for
// rendering via object URLs (auth headers can't ride on an <img>/<iframe> src).
async function requestBlob(path: string, retry = true): Promise<Blob> {
  const headers = new Headers()
  const access = tokenStore.access
  if (access) headers.set('Authorization', `Bearer ${access}`)
  const res = await fetch(`${BASE}${path}`, { headers, cache: 'no-store' })
  if (res.status === 401 && retry && tokenStore.refresh) {
    if (await tryRefresh()) return requestBlob(path, false)
  }
  if (!res.ok) return parseError(res)
  return res.blob()
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

  if (res.status === 401 && retry && tokenStore.refresh) {
    if (await tryRefresh()) {
      return request<T>(path, options, false)
    }
  }
  if (!res.ok) return parseError(res)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
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
  health() {
    return request<{ status: string; service: string; version: string }>('/health')
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

  // ── Projects & boards ───────────────────────────────────────────────────────
  listProjects() {
    return request<Project[]>('/projects')
  },
  createProject(body: { name: string; description?: string }) {
    return request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) })
  },
  getProject(id: string) {
    return request<Project>(`/projects/${id}`)
  },
  updateProject(id: string, body: { name: string; description?: string }) {
    return request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
  },
  deleteProject(id: string) {
    return request<{ status: string }>(`/projects/${id}`, { method: 'DELETE' })
  },
  previewBoard(projectID: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return request<BoardPreview>(`/projects/${projectID}/boards/preview`, { method: 'POST', body: form })
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
  updateBoard(id: string, body: { name?: string; copies?: number }) {
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
  scanLocation(barcode: string) {
    return request<StorageLocation>(`/locations/scan?barcode=${encodeURIComponent(barcode)}`)
  },
  listLocationStock(id: string) {
    return request<StockItem[]>(`/locations/${id}/stock`)
  },

  // ── Scan & enrichment ───────────────────────────────────────────────────────
  scan(code: string) {
    return request<ScanResult>('/scan', { method: 'POST', body: JSON.stringify({ code }) })
  },
  enrichStatus() {
    return request<{ configured: boolean; provider: string }>('/enrich/status')
  },
  enrich(mpn: string) {
    return request<{ found: boolean; part?: EnrichedPart }>(`/enrich?mpn=${encodeURIComponent(mpn)}`)
  },
  getEnrichmentSettings() {
    return request<EnrichmentSettings>('/settings/enrichment')
  },
  updateEnrichmentSettings(body: { client_id?: string; client_secret?: string; scope?: string }) {
    return request<EnrichmentSettings>('/settings/enrichment', { method: 'PUT', body: JSON.stringify(body) })
  },
  testEnrichment() {
    return request<{ ok: boolean }>('/settings/enrichment/test', { method: 'POST' })
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
