// chrome.i18n.getMessage returns '' — not the message — when any substitution is
// null/undefined or a non-string. t()'s old `|| key` then rendered the raw key
// into the UI: "mc_input_send_channel" was sitting in the composer placeholder
// on 2026-07-21. One caller passing an unresolved value could do that to any
// string, so t() sanitizes centrally.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const SRC = readFileSync(join(ROOT, 'src', 'lib', 'browser-api.js'), 'utf8')
const INPUT = readFileSync(join(ROOT, 'src', 'multichat', 'input.js'), 'utf8')

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`)
  const end = src.indexOf('\n}', start)
  return src.slice(start, end + 2)
}

// Faithful stand-in for chrome.i18n: returns '' if any sub is not a string.
function makeT({ messages, override = null }) {
  const rawApi = {
    i18n: {
      getMessage(key, subs) {
        const m = messages[key]
        if (m == null) return ''
        if (subs !== undefined) {
          if (!Array.isArray(subs) || subs.some((s) => typeof s !== 'string')) return ''
          const need = (m.match(/\$[A-Z0-9_]+\$/g) || []).length
          if (subs.length !== need) return ''
          let out = m
          subs.forEach((s) => {
            out = out.replace(/\$[A-Z0-9_]+\$/, s)
          })
          return out
        }
        return m
      },
    },
  }
  return new Function(
    'rawApi',
    '_i18nOverride',
    '_i18nApplyPlaceholders',
    `${extractFn(SRC, '_i18nSubs')}\n${extractFn(SRC, 't')}\nreturn t`,
  )(rawApi, override, () => '')
}

const MESSAGES = { greet: 'hi $NAME$', plain: 'just text' }

describe('t() never renders a raw key', () => {
  const t = makeT({ messages: MESSAGES })

  test('normal substitution works', () => {
    expect(t('greet', ['mellen'])).toBe('hi mellen')
  })

  // The exact live bug.
  test('an undefined substitution does not leak the key', () => {
    const out = t('greet', [undefined])
    expect(out).not.toBe('greet')
    expect(out).toBe('hi ')
  })

  test('a null substitution does not leak the key', () => {
    expect(t('greet', [null])).not.toBe('greet')
  })

  test('a non-string substitution is coerced, not dropped', () => {
    expect(t('greet', [42])).toBe('hi 42')
  })

  test('a bare (non-array) substitution still works', () => {
    expect(t('greet', 'solo')).toBe('hi solo')
  })

  // Wrong COUNT can't be fixed by coercion — fall back to real copy, not a key.
  test('too many substitutions falls back to the template, never the key', () => {
    const out = t('greet', ['a', 'b'])
    expect(out).not.toBe('greet')
    expect(out).toBe('hi $NAME$')
  })

  test('a genuinely missing key still returns the key (nothing better exists)', () => {
    expect(t('no_such_key')).toBe('no_such_key')
  })

  test('messages without placeholders are untouched', () => {
    expect(t('plain')).toBe('just text')
  })

  test('empty key returns empty string', () => {
    expect(t('')).toBe('')
  })
})

describe('the caller that triggered it', () => {
  test('composer placeholder guards an unresolved channel name', () => {
    expect(INPUT).toContain("chanName ? t('mc_input_send_channel', [chanName]) : t('mc_input_no_channel')")
  })
})
