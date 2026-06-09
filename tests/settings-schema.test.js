import { test, expect } from 'bun:test'
import { SETTINGS, validateSettingValue, coerceSettingValue, lintSettings } from '../src/lib/settings-schema.js'
import { UI_SYNC_BLOCKLIST } from '../src/lib/utils.js'

// ── registry lint (same check the build runs) ────────────────────────────────

test('lintSettings: registry is clean', () => {
  expect(lintSettings(UI_SYNC_BLOCKLIST)).toEqual([])
})

test('every default validates and coerces to itself (round-trip)', () => {
  for (const def of SETTINGS) {
    expect(validateSettingValue(def, def.default)).toBe(true)
    expect(coerceSettingValue(def, def.default)).toEqual(def.default)
  }
})

test('storage keys are verbatim legacy keys (no renames)', () => {
  // spot-check the load-bearing ones — renaming any of these would orphan
  // existing users' synced settings
  const keys = new Set(SETTINGS.map(d => d.key))
  for (const k of [
    'wysiwygEnabled', 'linksEnabled', 'linkPreviewsEnabled', 'viMode',
    'zebra', 'autoHideEmpty', 'timestamps', 'avatars', 'showPlatformBadges',
    'firstChatterGlow', 'keywordHighlights', 'hiddenTabs', 'crashTelemetry',
    'fontFamily', 'fontSize', 'customFontName', 'mentionTitleFlash',
    'mentionSoundVolume', 'crossFollowKick', 'automodAllCaps', 'automodRegex',
    'hs_emote_size', 'hs_emoji_size', 'hs_auto_claim_points',
    'hs_dim_timeouts', 'hs_readable_names', 'hs_notifications',
  ]) {
    expect(keys.has(k)).toBe(true)
  }
})

// ── validateSettingValue ──────────────────────────────────────────────────────

const boolDef = SETTINGS.find(d => d.key === 'zebra')
const enumDef = SETTINGS.find(d => d.key === 'hs_emote_size')
const rangeDef = SETTINGS.find(d => d.key === 'mentionSoundVolume')
const textDef = SETTINGS.find(d => d.key === 'customFontName')
const multiDef = SETTINGS.find(d => d.key === 'hiddenTabs')

test('validate: bool rejects non-booleans', () => {
  expect(validateSettingValue(boolDef, true)).toBe(true)
  expect(validateSettingValue(boolDef, 'true')).toBe(false)
  expect(validateSettingValue(boolDef, 1)).toBe(false)
})

test('validate: enum rejects values outside options', () => {
  expect(validateSettingValue(enumDef, 2)).toBe(true)
  expect(validateSettingValue(enumDef, 3)).toBe(false)
  expect(validateSettingValue(enumDef, '2')).toBe(false)
})

test('validate: range enforces bounds and finiteness', () => {
  expect(validateSettingValue(rangeDef, 0)).toBe(true)
  expect(validateSettingValue(rangeDef, 1)).toBe(true)
  expect(validateSettingValue(rangeDef, 1.5)).toBe(false)
  expect(validateSettingValue(rangeDef, -0.1)).toBe(false)
  expect(validateSettingValue(rangeDef, NaN)).toBe(false)
  expect(validateSettingValue(rangeDef, '0.5')).toBe(false)
})

test('validate: text enforces maxLen', () => {
  expect(validateSettingValue(textDef, 'Iosevka')).toBe(true)
  expect(validateSettingValue(textDef, 'x'.repeat(65))).toBe(false)
  expect(validateSettingValue(textDef, 42)).toBe(false)
})

test('validate: multiselect rejects unknown members', () => {
  expect(validateSettingValue(multiDef, ['pinned', 'feed'])).toBe(true)
  expect(validateSettingValue(multiDef, ['bogus'])).toBe(false)
  expect(validateSettingValue(multiDef, 'pinned')).toBe(false)
})

// ── coerceSettingValue ────────────────────────────────────────────────────────

test('coerce: bool truthy/falsy normalization', () => {
  expect(coerceSettingValue(boolDef, 1)).toBe(true)
  expect(coerceSettingValue(boolDef, 0)).toBe(false)
  expect(coerceSettingValue(boolDef, null)).toBe(undefined)
})

test('coerce: enum tolerates string/number mismatch from DOM datasets', () => {
  expect(coerceSettingValue(enumDef, '2')).toBe(2)
  expect(coerceSettingValue(enumDef, 4)).toBe(4)
  expect(coerceSettingValue(enumDef, '3')).toBe(undefined)
})

test('coerce: range clamps and parses', () => {
  expect(coerceSettingValue(rangeDef, 2)).toBe(1)
  expect(coerceSettingValue(rangeDef, -1)).toBe(0)
  expect(coerceSettingValue(rangeDef, '0.5')).toBe(0.5)
  expect(coerceSettingValue(rangeDef, 'abc')).toBe(undefined)
})

test('coerce: text truncates to maxLen', () => {
  expect(coerceSettingValue(textDef, 'x'.repeat(100))).toBe('x'.repeat(64))
})

test('coerce: multiselect drops unknown members', () => {
  expect(coerceSettingValue(multiDef, ['pinned', 'bogus'])).toEqual(['pinned'])
  expect(coerceSettingValue(multiDef, 'pinned')).toBe(undefined)
})

test('coerce: rejects unknown def and nullish values', () => {
  expect(coerceSettingValue(null, true)).toBe(undefined)
  expect(coerceSettingValue(boolDef, undefined)).toBe(undefined)
})

// ── lint catches real mistakes ───────────────────────────────────────────────

test('lint: flags a duplicate key', () => {
  const dup = [...SETTINGS, SETTINGS[0]]
  const orig = SETTINGS.splice(0, SETTINGS.length, ...dup)
  try {
    expect(lintSettings(UI_SYNC_BLOCKLIST).some(p => p.startsWith('duplicate key'))).toBe(true)
  } finally {
    SETTINGS.splice(0, SETTINGS.length, ...orig)
  }
})

test('lint: flags a sync key on the blocklist', () => {
  const bad = new Set([...UI_SYNC_BLOCKLIST, 'zebra'])
  expect(lintSettings(bad).some(p => p.includes('UI_SYNC_BLOCKLIST'))).toBe(true)
})
