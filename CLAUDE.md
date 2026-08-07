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
npm run lint      # eslint, same config as librarium-web
```

Lint errors fail CI; warnings do not. `react-hooks/set-state-in-effect` and
`react-refresh/only-export-components` are deliberately warnings because the
existing tree trips them broadly, and clearing them is its own piece of work.

Keep commits small and focused, and write a message that says what changed and why. Do not add `Co-Authored-By` or "Generated with" trailers; the commit is authored by the person who sent it.

## Releasing

Two channels, both run from Actions → Release → Run workflow. The version is
computed from the date and the last tag as `YY.M.revision`; nothing in the
source tree carries a version string.

- **rc** builds `YY.M.rev-rc.N` and pushes only that tag. `:latest` is left
  alone and the GitHub Release is marked as a pre-release. Use this to get a
  real image ArgoCD can deploy while a change is still being tested.
- **stable** builds `YY.M.rev`, moves `:latest`, and publishes a normal release.

An rc and the stable release that follows share a version number: cut
`26.8.0-rc.1`, `26.8.0-rc.2`, then release stable and you get `26.8.0`.

The two channels exist because there are two separate "is this released?"
signals and they have to agree. `/releases/latest` on GitHub excludes
pre-releases, and the `:latest` image tag only ever moves on a stable release,
so an update checker stays quiet until you actually ship.

`main` is the trunk. Work on a branch, open a PR, merge once CI is green, then
cut a release from `main`. There is no long-lived staging branch: an rc plus a
deployment pinned to it does the same job without two branches to keep in step.
