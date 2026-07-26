# Contributing to firebin-web

This guide is for anyone opening a pull request here, including people driving the change through Claude. Read it before you write code; it is short on purpose.

## What this client is

The FireBin web app. React 19, TypeScript, Vite 8, Tailwind 4. It renders the API and stores nothing itself; every part, bin, and price comes from `firebin-api` over `/api/v1`.

## Layout

- `src/lib/api.ts` is the one door to the backend. Every request goes through it; there is no generated SDK and no stray `fetch` calls in components.
- `src/auth/AuthContext.tsx` holds the session. `useAuth()` returns the user and `canWrite` (false for the viewer role).
- `src/pages/` holds routed screens, `src/components/` holds the shared pieces.
- `src/lib/useRealtime.ts` subscribes to the `/api/events` SSE stream so a view refetches when another user changes stock.
- Locale strings live in `src/i18n/en.json`, reached with `t('dotted.key')`.

## Conventions that matter

- Talk to the API only through `src/lib/api.ts`. Add a method there rather than a `fetch` in a component.
- Gate every write control behind `canWrite` from `useAuth()`. A viewer should not see a button the API will reject.
- User-facing text goes through `t()` with a key in `en.json`, not a hardcoded string.
- Adding an npm dependency means adding a row to `WEB_LIBS` in `src/components/AboutSettings.tsx`. That list is the Licences page, and it is maintained by hand for AGPL compliance.
- The camera scanner and WebUSB printer need a secure origin. Guard them on `window.isSecureContext` rather than assuming HTTPS.

## Before you open a pull request

Run what CI runs:

```sh
npm ci
npm run build     # tsc -b type-checks, then vite build. A type error fails here.
npm run lint      # oxlint
```

Keep commits small and focused, and write a message that says what changed and why. Do not add `Co-Authored-By` or "Generated with" trailers; the commit is authored by the person who sent it.
