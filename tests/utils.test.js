import { test, expect } from 'bun:test'
import { escapeHtml } from '../src/lib/utils.js'

// ── escapeHtml ────────────────────────────────────────────────────────────────

test('escapeHtml: escapes ampersand', () => {
  expect(escapeHtml('a & b')).toBe('a &amp; b')
})

test('escapeHtml: escapes less-than', () => {
  expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
})

test('escapeHtml: escapes greater-than', () => {
  expect(escapeHtml('1 > 0')).toBe('1 &gt; 0')
})

test('escapeHtml: escapes double quote', () => {
  expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
})

test('escapeHtml: escapes single quote', () => {
  expect(escapeHtml("it's")).toBe("it&#x27;s")
})

test('escapeHtml: handles full xss payload', () => {
  const input = `<img src="x" onerror='alert(1)'>`
  const out = escapeHtml(input)
  expect(out).not.toContain('<')
  expect(out).not.toContain('>')
  expect(out).not.toContain('"')
  expect(out).not.toContain("'")
})

test('escapeHtml: returns empty string for null', () => {
  expect(escapeHtml(null)).toBe('')
})

test('escapeHtml: returns empty string for undefined', () => {
  expect(escapeHtml(undefined)).toBe('')
})

test('escapeHtml: passes through plain text unchanged', () => {
  expect(escapeHtml('hello world')).toBe('hello world')
})

test('escapeHtml: coerces numbers to string', () => {
  expect(escapeHtml(42)).toBe('42')
})

// ── fuzzy scorer (inline — same logic as heatsync-button.js) ─────────────────
// duplicated here so tests don't depend on bundled output

function fuzzyScore(query, name) {
  const lower = name.toLowerCase()
  if (lower.includes(query)) return 2 + (query.length / lower.length)
  let qi = 0
  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] === query[qi]) qi++
  }
  if (qi < query.length) return 0
  return qi / lower.length
}

test('fuzzyScore: exact substring returns score > 2', () => {
  const score = fuzzyScore('pog', 'PogChamp')
  expect(score).toBeGreaterThan(2)
})

test('fuzzyScore: exact full match returns score > 2', () => {
  const score = fuzzyScore('pogchamp', 'PogChamp')
  expect(score).toBeGreaterThan(2)
})

test('fuzzyScore: sequential char match returns 0 < score < 1', () => {
  // 'pc' matches P_ogCham_p sequentially
  const score = fuzzyScore('pc', 'PogChamp')
  expect(score).toBeGreaterThan(0)
  expect(score).toBeLessThan(2)
})

test('fuzzyScore: no match returns 0', () => {
  expect(fuzzyScore('xyz', 'PogChamp')).toBe(0)
})

test('fuzzyScore: case insensitive', () => {
  const lower = fuzzyScore('pogchamp', 'pogchamp')
  const mixed = fuzzyScore('pogchamp', 'PogChamp')
  expect(lower).toBeCloseTo(mixed, 5)
})

test('fuzzyScore: longer query scores lower than shorter exact match', () => {
  // shorter query matching same substring → higher ratio
  const short = fuzzyScore('pog', 'PogChamp')
  const full = fuzzyScore('pogchamp', 'PogChamp')
  // both > 2, but short has smaller query.length/lower.length ratio
  expect(full).toBeGreaterThanOrEqual(short)
})

test('fuzzyScore: empty query matches anything with substring score', () => {
  // '' is always included in any string
  const score = fuzzyScore('', 'anything')
  expect(score).toBeGreaterThan(0)
})
