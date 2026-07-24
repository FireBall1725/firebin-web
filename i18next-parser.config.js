// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// Extracts t('key') calls from the source into the English catalog so it never
// drifts from the code. Run: `npm run i18n:extract`. See LOCALIZATION.md.

export default {
  locales: ['en'],
  input: ['src/**/*.{ts,tsx}'],
  output: 'src/i18n/locales/$LOCALE.json',
  keySeparator: '.',
  // Single default namespace; keys are dotted identifiers like "nav.dashboard".
  namespaceSeparator: false,
  // Preserve hand-authored English and keys not (yet) referenced in code.
  keepRemoved: true,
  sort: true,
  // New keys land empty in en.json for a human to fill with the English text
  // (or pass an inline default: t('key', 'English')).
  defaultValue: '',
}
