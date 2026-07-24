// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 FireBall1725
//
// i18n bootstrap. English is the source language and the only one shipped today;
// adding a language is dropping a `locales/<lang>.json` and listing it here.
// See LOCALIZATION.md. Route every user-facing string through the translation
// hook so it stays translatable (crowd-sourced via Weblate against these JSON
// catalogs).

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'

// Languages offered in the UI. Add new codes here once their catalog exists.
export const SUPPORTED_LANGUAGES = ['en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  // React already escapes, so i18next must not double-escape interpolations.
  interpolation: { escapeValue: false },
  // Missing/empty keys fall back to the key or English, never a blank string.
  returnEmptyString: false,
})

export default i18n
