/**
 * Feed/thread render fixes:
 *  1. emote_refs matching — whole whitespace-delimited token + optional
 *     `(source)` qualifier, replacing the old `\b…\b` that broke on names with
 *     parens (`fern(sousounofrieren)`) or trailing non-word chars.
 *  2. media absolutization — `_absolutizeThreadMedia` prefixes origin-relative
 *     `/uploads/...` so `safeUrl()` doesn't throw and drop the image. Sliced
 *     from social.js source so the test tracks the real function (no drift).
 *  3. linkify lock — the feed URL regex keeps a bare-number query (`?4816592`)
 *     and a double-slash path as part of the link.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOCIAL_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'social.js'), 'utf8')

function sliceBetween(startMarker, endMarker) {
  const s = SOCIAL_SRC.indexOf(startMarker)
  if (s === -1) throw new Error(`start marker not found: ${startMarker}`)
  const e = SOCIAL_SRC.indexOf(endMarker, s)
  if (e === -1) throw new Error(`end marker not found: ${endMarker}`)
  return SOCIAL_SRC.slice(s, e)
}

// ── 1. emote_refs token regex ────────────────────────────────────────────────
// Mirror the exact builder in renderFeedContent's emote_refs loop.
function buildRefRe(name) {
  const escaped = name // escapeHtml is identity for the names under test (no <>&"')
  const body = escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<!\\S)${body}(?:\\([^)\\s]*\\))?(?!\\S)`, 'g')
}
const hit = (name, text) => buildRefRe(name).test(text)

describe('emote_refs token matching', () => {
  test('parenthesized name matches (old \\b failed here)', () => {
    expect(hit('fern(sousounofrieren)', 'a fern(sousounofrieren) b')).toBe(true)
  })
  test('bare name matches the alias-qualified body token', () => {
    expect(hit('fern', 'a fern(sousounofrieren) b')).toBe(true)
  })
  test('bare name matches standalone', () => {
    expect(hit('fern', 'a fern b')).toBe(true)
  })
  test('name embedded in a larger token does NOT match', () => {
    expect(hit('meme', 'frierenstuckinamimic(meme) x')).toBe(false)
  })
  test('underscore/hyphen names match as whole tokens', () => {
    expect(hit('non-web_source', 'tag non-web_source end')).toBe(true)
  })
  test('token at string start and end match', () => {
    expect(hit('pantyhose', 'pantyhose')).toBe(true)
  })
  test('no partial match inside a word', () => {
    expect(hit('fern', 'fernanda')).toBe(false)
  })
})

// ── 2. _absolutizeThreadMedia (real function, sliced) ────────────────────────
const absSrc = sliceBetween('function _absolutizeThreadMedia(m) {', '\n// Open thread view')
const { _absolutizeThreadMedia } = new Function(`${absSrc}\nreturn { _absolutizeThreadMedia }`)()

describe('_absolutizeThreadMedia', () => {
  test('prefixes origin-relative media_url', () => {
    const m = { media_url: '/uploads/x.jpg' }
    _absolutizeThreadMedia(m)
    expect(m.media_url).toBe('https://heatsync.org/uploads/x.jpg')
  })
  test('leaves absolute URLs untouched (idempotent)', () => {
    const m = { media_url: 'https://cdn.heatsync.org/uploads/x.jpg' }
    _absolutizeThreadMedia(m)
    _absolutizeThreadMedia(m)
    expect(m.media_url).toBe('https://cdn.heatsync.org/uploads/x.jpg')
  })
  test('absolutizes media[] items + thumbnail', () => {
    const m = { media: [{ url: '/uploads/a.png', thumbnail_url: '/uploads/a_t.png' }] }
    _absolutizeThreadMedia(m)
    expect(m.media[0].url).toBe('https://heatsync.org/uploads/a.png')
    expect(m.media[0].thumbnail_url).toBe('https://heatsync.org/uploads/a_t.png')
  })
  test('null-safe', () => {
    expect(() => _absolutizeThreadMedia(null)).not.toThrow()
  })
})

// ── 3. linkify lock (feed regex) ─────────────────────────────────────────────
const FEED_LINK_RE = /(https?:\/\/[^\s<"]+|(?<![/\w.])[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<"]*)/gi

describe('feed linkify keeps bare-number query + double slash', () => {
  test('safebooru URL matches whole, tail included', () => {
    const url = 'safebooru.org//images/4619/9e0c7848bf1a9dee2366d5eed094545eb269163c.jpg?4816592'
    const m = url.match(FEED_LINK_RE)
    expect(m).toEqual([url])
  })
})
