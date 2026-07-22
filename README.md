# firebin-web

Web client for **FireBin**, a self-hosted electronics component inventory.
React 19 + TypeScript + Vite + Tailwind v4. Talks to `firebin-api` over REST at
`/api/v1` (proxied to the backend by Vite in dev, by nginx in production).

Part of the FireLabs line. Sibling to Librarium.

## Develop

```
npm install
npm run dev            # http://localhost:5173, proxies /api → http://localhost:8080
```

Point the proxy elsewhere with `VITE_API_PROXY_TARGET` (see `.env.example`).
Run `firebin-api` (or the `local/` docker-compose stack) alongside it.

## Build

```
npm run build          # tsc -b && vite build → dist/
npm run preview
```

## Docker

Builds to a small nginx image serving the SPA on port 3000 and proxying `/api`
to the `firebin-api` service. `FIREBIN_VERSION` build-arg stamps the displayed
version (defaults to `YY.M.DEV`).

## Structure

| Path | Purpose |
|---|---|
| `src/lib/api.ts` | Hand-written REST client, token storage, refresh-on-401 |
| `src/auth/AuthContext.tsx` | Auth state + login/register/logout |
| `src/components/` | App shell (`Layout`), route guard |
| `src/pages/` | Dashboard, Parts, Locations, Tokens, Login |

Parts and Locations are placeholders until the API domain CRUD lands.
