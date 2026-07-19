/**
 * Inventory-time render gate (_sGate in processEmotes) — a heatsync sender
 * emote renders only in messages sent while the sender owned it:
 * addedAt − skew ≤ msgTime < removedAt. History is frozen at send-time truth:
 * a fresh collect never retro-imagifies older messages, an uncollect never
 * retro-textifies rows rendered while owned.
 *
 * Same bundle-global stub pattern as emote-precedence.test.js.
 */

import { describe, expect, test } from 'bun:test'
import * as mods from '../src/lib/modifiers.js'
import { escapeHtml, unescapeHtml } from '../src/lib/utils.js'

globalThis.escapeHtml = escapeHtml
globalThis.unescapeHtml = unescapeHtml

globalThis.cleanup = { setIntervalIfVisible: () => {}, persistInterval: () => {} }
globalThis.HS_MOD_TOKENS = mods.HS_MOD_TOKENS
globalThis.hsModClassify = mods.hsModClassify
globalThis.hsModBuildStyleAttr = mods.hsModBuildStyleAttr
globalThis.hsModInjectWrapperStyle = mods.hsModInjectWrapperStyle
globalThis.hsModComposeFilter = mods.hsModComposeFilter
globalThis.hsModHexToHue = mods.hsModHexToHue
globalThis.HS_MOD_C_HEX_RE = /^c!#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
globalThis.currentTab = 'chan-a'
globalThis.getCurrentChannel = () => 'chan-a'
globalThis.getLiveChannel = () => 'chan-a'

const { processEmotes } = await import('../src/multichat/emotes.js')

const SKEW = 120000 // EMOTE_ADDED_SKEW_MS
const T = 1700000000000 // arbitrary fixed epoch ms
const URL = 'https://cdn.heatsync.org/uploads/akdj.webp'

const sender = (extra = {}) =>
  new Map([['AKDJvibe', { url: URL, source: 'heatsync', state: 'global', ...extra }]])

const rendered = (out) => out.includes('<img')

describe('inventory-time render gate', () => {
  test('message BEFORE addedAt stays raw text (no retro-imagify)', () => {
    const out = processEmotes('AKDJvibe', 'chan-x', null, sender({ addedAt: T }), T - 3600000)
    expect(rendered(out)).toBe(false)
    expect(out).toContain('AKDJvibe')
  })

  test('message AFTER addedAt renders', () => {
    expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, sender({ addedAt: T }), T + 5000))).toBe(true)
  })

  test('collect-then-send inside the skew window renders (clock drift)', () => {
    expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, sender({ addedAt: T }), T - SKEW / 2))).toBe(true)
  })

  test('no msgTime → fail-open (old behavior preserved)', () => {
    expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, sender({ addedAt: T }), null))).toBe(true)
  })

  test('no addedAt stamp (7TV/BTTV/pre-stamp cache) → ungated', () => {
    expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, sender(), T - 3600000))).toBe(true)
  })

  test('tombstone: message after removedAt stays text, before it keeps rendering', () => {
    const s = sender({ addedAt: T, removedAt: T + 1000000 })
    expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, s, T + 2000000))).toBe(false)
    expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, s, T + 500000))).toBe(true)
  })

  test('gated sender entry falls through to the global pool if present', async () => {
    const { emoteCache } = await import('../src/multichat/emotes.js')
    emoteCache.set('AKDJvibe', { url: URL, source: 'heatsync', state: 'global' })
    try {
      expect(rendered(processEmotes('AKDJvibe', 'chan-x', null, sender({ addedAt: T }), T - 3600000))).toBe(true)
    } finally {
      emoteCache.delete('AKDJvibe')
    }
  })
})
