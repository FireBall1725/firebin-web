# Localization

FireBin ships in English today. The i18n framework is wired so a second language
is a catalog file plus a one-line registration, not a refactor. English is the
source language and the only one shipped now.

## What gets localized

UI text only: labels, buttons, and messages. Not user data (part and project
names), and not enrichment data (component descriptions keep their source
language).

## How it works

- `i18next` + `react-i18next`, set up in `src/i18n/index.ts`.
- English strings live in `src/i18n/locales/en.json`, keyed by dotted
  identifiers (`nav.dashboard`, `common.save`).
- Components read strings through the hook:

  ```tsx
  import { useTranslation } from 'react-i18next'

  function Toolbar() {
    const { t } = useTranslation()
    return <button>{t('common.save')}</button>
  }
  ```

## Rules for new strings

1. Every user-facing string goes through `t('scope.key')`. No hardcoded English
   in JSX.
2. Add the English text to `en.json` under the key. Or pass an inline default so
   it renders before the catalog is filled: `t('nav.dashboard', 'Dashboard')`.
3. Never build a sentence by concatenation. Use interpolation with named
   variables: `t('board.lineCount', { count })` with
   `"lineCount": "{{count}} lines"`.
4. Use i18next plural keys for counts (`key_one` / `key_other`) instead of
   hand-written `if (n === 1)` logic.
5. Keep keys grouped by area (`nav.*`, `common.*`, `projects.*`, `board.*`).

Existing screens still hold hardcoded strings. Migrate them to `t()` as you
touch them; there is no need for one big rewrite.

## Keeping the catalog in sync

`i18next-parser` scans the source for `t('...')` calls and writes any missing
keys into `en.json`:

```bash
npm run i18n:extract
```

It preserves hand-authored English and leaves new keys empty for you to fill.

## Adding a language (later)

1. Copy `en.json` to `src/i18n/locales/<lang>.json` and translate the values.
2. Register it in `src/i18n/index.ts`: add the code to `SUPPORTED_LANGUAGES` and
   the file to `resources`.
3. Add a language switcher that calls `i18n.changeLanguage(code)`.

## Crowd-sourced translation

The catalogs are plain JSON, which the common translation platforms read and
write. The self-hosted option is [Weblate](https://weblate.org) (libre, runs on
the homelab): point it at this repo, translators work in its web UI, and it opens
pull requests that update the `locales/*.json` files. Because English is the
source catalog, translators always work from current text.

## Server messages

API errors carry a stable `code` alongside the English `error` message (see
`respond.ErrorCode` in the API). The client can map a code to a localized string
and fall back to the server text when a code is missing. UI localization stays
on the client.
