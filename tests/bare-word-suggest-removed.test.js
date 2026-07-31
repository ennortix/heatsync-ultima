/**
 * Regression coverage for the trigger-less "bare word pops emote suggestions"
 * removal (mellen's product call — Tab-completion is the only bare-word
 * completion path now; the ':' and '@' popups are unchanged since typing a
 * sigil is an explicit request).
 *
 * Two angles:
 *   1. source guards — the deleted symbols must never come back.
 *   2. behavior — getTriggerContext (the shared ':'/'@' dropdown logic) still
 *      resolves both real triggers correctly after the bareWord branch was
 *      cut out of its ternary chain.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const INPUT_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'input.js'), 'utf8')
const MAIN_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'main.js'), 'utf8')
const SETTINGS_SCHEMA_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'lib', 'settings-schema.js'), 'utf8')

describe('bare-word inline emote suggest — fully removed', () => {
  test('input.js no longer defines the bare-word popup functions', () => {
    expect(INPUT_SRC).not.toContain('function checkBareWordSuggest')
    expect(INPUT_SRC).not.toContain('function getBareWordContext')
  })

  test('input.js no longer carries the bareWord trigger regex or its suppress state', () => {
    expect(INPUT_SRC).not.toContain('bareWord')
    expect(INPUT_SRC).not.toContain('_bareSuppress')
  })

  test('emojiAcState no longer carries bare/navigated passive-preview flags', () => {
    expect(INPUT_SRC).not.toMatch(/emojiAcState\.bare\b/)
    expect(INPUT_SRC).not.toMatch(/emojiAcState\.navigated\b/)
  })

  test('main.js no longer declares the inlineSuggestEnabled runtime var or its bridge', () => {
    expect(MAIN_SRC).not.toContain('inlineSuggestEnabled')
  })

  test('the settings schema no longer offers an inline-emote-suggest toggle', () => {
    expect(SETTINGS_SCHEMA_SRC).not.toContain('inlineEmoteSuggest')
    expect(SETTINGS_SCHEMA_SRC).not.toContain('inlineSuggestEnabled')
  })
})

// ── getTriggerContext behavior (':'/'@' popups unaffected) ──────────────────
const start = INPUT_SRC.indexOf('const _hsTriggerContextRe = {')
const end = INPUT_SRC.indexOf('function showEmojiDropdown(')
if (start === -1 || end === -1 || end <= start) throw new Error('getTriggerContext carve markers not found')

function makeTriggerContext() {
  const factory = new Function(
    'wysiwygEnabled',
    `${INPUT_SRC.slice(start, end)}; return { getEmojiColonContext, getMentionContext }`,
  )
  return factory(false) // plain-text (<input>) path — reads input.value/selectionStart
}

function fakeInput(value, selectionStart = value.length) {
  return { value, selectionStart }
}

describe('getTriggerContext — colon and mention triggers still resolve', () => {
  test('":kap" at the caret resolves an emoji-colon context', () => {
    const { getEmojiColonContext } = makeTriggerContext()
    expect(getEmojiColonContext(fakeInput('hello :kap'))).toEqual({ query: 'kap' })
  })

  test('no trailing ":word" — no context', () => {
    const { getEmojiColonContext } = makeTriggerContext()
    expect(getEmojiColonContext(fakeInput('hello kap'))).toBeNull()
  })

  test('"@us" at the caret resolves a mention context', () => {
    const { getMentionContext } = makeTriggerContext()
    expect(getMentionContext(fakeInput('hey @us'))).toEqual({ query: 'us' })
  })

  test('a bare "@" alone resolves a mention context with an empty query (dropdown opens immediately)', () => {
    const { getMentionContext } = makeTriggerContext()
    expect(getMentionContext(fakeInput('@'))).toEqual({ query: '' })
  })

  test('a bare word with no sigil resolves NEITHER context — Tab-complete is the only path for it now', () => {
    const { getEmojiColonContext, getMentionContext } = makeTriggerContext()
    expect(getEmojiColonContext(fakeInput('hello world'))).toBeNull()
    expect(getMentionContext(fakeInput('hello world'))).toBeNull()
  })
})
