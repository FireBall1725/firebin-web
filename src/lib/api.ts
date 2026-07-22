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

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const access = tokenStore.access
  if (access) headers.set('Authorization', `Bearer ${access}`)

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

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
}
