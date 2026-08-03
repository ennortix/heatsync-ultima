/**
 * Emote right-click routing — plain right-click is ALWAYS block/unblock;
 * remove-from-inventory lives ONLY in the shift menu.
 *
 * Regression anchor (2026-08-03): the old 3-way routing sent owned emotes to
 * removeEmoteFromInventory on plain right-click — a silent server-side set
 * mutation on the most common gesture, and blocking an owned emote took two
 * right-clicks (or zero, when the removed name stopped resolving anywhere).
 * Block is deliberately NOT an inventory mutation (unblock returns the emote
 * to "in set"), so always-block loses nothing. The handler is a document-level
 * capture listener wired into the bundle — pinned at source level like the
 * other reader-loop wiring tests.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const INPUT_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'input.js'), 'utf8')
const SCHEMA_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'lib', 'settings-schema.js'), 'utf8')
const EN_LOCALE = readFileSync(join(import.meta.dir, '..', 'src', '_locales', 'en', 'messages.json'), 'utf8')

// Carve the global contextmenu handler (plain right-click routing).
const handlerStart = INPUT_SRC.indexOf('// Global right-click handler for ALL emotes')
const handlerEnd = INPUT_SRC.indexOf('{ capture: true, signal: mcSignal }', handlerStart)
const HANDLER = INPUT_SRC.slice(handlerStart, handlerEnd)

// Carve the shift menu builder.
const menuStart = INPUT_SRC.indexOf('function openEmoteCtxMenu(')
const menuEnd = INPUT_SRC.indexOf('function openEmojiCtxMenu(', menuStart)
const MENU = INPUT_SRC.slice(menuStart, menuEnd)

describe('plain right-click: 2-way block/unblock only', () => {
  test('carve markers found', () => {
    expect(handlerStart).toBeGreaterThan(-1)
    expect(handlerEnd).toBeGreaterThan(handlerStart)
    expect(menuStart).toBeGreaterThan(-1)
    expect(menuEnd).toBeGreaterThan(menuStart)
  })

  test('blocked → unblock, everything else → block', () => {
    expect(HANDLER).toContain("if (state === 'blocked')")
    expect(HANDLER).toContain('unblockEmote(emoteName)')
    expect(HANDLER).toContain('blockEmote(emoteName, emoteUrl, source)')
  })

  test('no inventory mutation on plain right-click', () => {
    expect(HANDLER).not.toContain('removeEmoteFromInventory')
  })

  test('load-bearing guards survived: stack expand, emoji menu, race guard, shift menu', () => {
    expect(HANDLER).toContain('.hs-mc-emote-stack:not(.expanded)')
    expect(HANDLER).toContain('openEmojiCtxMenu')
    expect(HANDLER).toContain('pendingEmoteOps.has(emoteName)')
    expect(HANDLER).toContain('openEmoteCtxMenu(e.clientX, e.clientY')
  })
})

describe('shift menu owns removal + block parity', () => {
  test('remove from set gated to genuine inventory emotes', () => {
    expect(MENU).toContain("state === 'owned' && inventoryEmotes.has(emoteName)")
    expect(MENU).toContain("label: 'remove from set'")
    expect(MENU).toContain('removeEmoteFromInventory(emoteName, targetEl)')
  })

  test('block/unblock reachable from the menu too', () => {
    expect(MENU).toContain("label: 'block'")
    expect(MENU).toContain("label: 'unblock'")
  })

  test('handler passes the clicked element through for picker-tile cleanup', () => {
    expect(HANDLER).toContain('targetEl: e.target')
  })
})

describe('dead right-click-block toggle fully removed', () => {
  test('gone from settings schema', () => {
    expect(SCHEMA_SRC).not.toContain('right-click-block')
  })
  test('gone from en locale', () => {
    expect(EN_LOCALE).not.toContain('sub_right_click_block')
  })
})
