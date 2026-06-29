import { beforeEach, expect, test } from 'bun:test'
import { compileFilterRules, evaluateFilterRules } from '../src/multichat/filter-rules.js'

// helpers
function makeMsg(overrides = {}) {
  return {
    text: 'hello world',
    user: 'testuser',
    badges: '',
    platform: 'twitch',
    isFirstMsg: false,
    isAction: false,
    bits: null,
    replyTo: null,
    ...overrides,
  }
}

function rule(overrides = {}) {
  return {
    id: Math.random().toString(36).slice(2),
    enabled: true,
    scope: 'all',
    match: { type: 'keyword', value: 'hello', caseSensitive: false },
    action: 'highlight',
    color: '#ff0000',
    ...overrides,
  }
}

// reset state between tests
beforeEach(() => {
  compileFilterRules([])
})

// ── compile ───────────────────────────────────────────────────────────────────

test('compileFilterRules: empty array clears rules', () => {
  compileFilterRules([rule()])
  compileFilterRules([])
  const res = evaluateFilterRules(makeMsg({ text: 'hello' }), null)
  expect(res.hide).toBe(false)
  expect(res.highlight).toBe(null)
})

test('compileFilterRules: null/undefined treated as empty', () => {
  compileFilterRules(null)
  expect(evaluateFilterRules(makeMsg(), null).hide).toBe(false)
  compileFilterRules(undefined)
  expect(evaluateFilterRules(makeMsg(), null).hide).toBe(false)
})

test('compileFilterRules: disabled rules are skipped', () => {
  compileFilterRules([rule({ enabled: false, action: 'hide' })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.hide).toBe(false)
})

test('compileFilterRules: rules with empty value are skipped', () => {
  compileFilterRules([rule({ match: { type: 'keyword', value: '' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello' }), null)
  expect(res.highlight).toBe(null)
})

test('compileFilterRules: rules with unknown match type are skipped', () => {
  compileFilterRules([rule({ match: { type: 'bogus', value: 'x' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'x' }), null)
  expect(res.highlight).toBe(null)
})

// ── keyword match ──────────────────────────────────────────────────────────────

test('keyword: matches substring within word boundaries', () => {
  compileFilterRules([rule({ match: { type: 'keyword', value: 'hello' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.highlight).toBe('#ff0000')
})

test('keyword: case-insensitive by default', () => {
  compileFilterRules([rule({ match: { type: 'keyword', value: 'HELLO' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.highlight).toBe('#ff0000')
})

test('keyword: case-sensitive when set', () => {
  compileFilterRules([rule({ match: { type: 'keyword', value: 'HELLO', caseSensitive: true } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.highlight).toBe(null)
})

test('keyword: no match on unrelated text', () => {
  compileFilterRules([rule({ match: { type: 'keyword', value: 'goodbye' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.highlight).toBe(null)
})

// ── regex match ───────────────────────────────────────────────────────────────

test('regex: matches user-supplied pattern', () => {
  compileFilterRules([rule({ match: { type: 'regex', value: 'hel+o' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.highlight).toBe('#ff0000')
})

test('regex: dangerous pattern falls back gracefully (no hang)', () => {
  // catastrophic backtracking pattern — must compile to literal or safe fallback
  compileFilterRules([rule({ match: { type: 'regex', value: '(a+)+' } })])
  const msg = makeMsg({ text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' })
  // must complete without hanging; result either way is valid
  const res = evaluateFilterRules(msg, null)
  expect(typeof res.hide).toBe('boolean')
  expect(res.highlight === null || typeof res.highlight === 'string').toBe(true)
})

test('regex: alternation catastrophic pattern falls back (no hang)', () => {
  compileFilterRules([rule({ match: { type: 'regex', value: '(a|a)+' } })])
  const msg = makeMsg({ text: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!' })
  const res = evaluateFilterRules(msg, null)
  expect(typeof res.hide).toBe('boolean')
})

test('regex: brace-quantified nested quantifier falls back (no hang)', () => {
  // (a+){30} bypassed old guard but causes ~33s backtracking — must be blocked
  compileFilterRules([rule({ match: { type: 'regex', value: '(a+){30}' } })])
  const msg = makeMsg({ text: 'a'.repeat(32) + '!' })
  const res = evaluateFilterRules(msg, null)
  expect(typeof res.hide).toBe('boolean')
})

test('regex: brace-quantified alternation falls back (no hang)', () => {
  compileFilterRules([rule({ match: { type: 'regex', value: '(a|ab){20}' } })])
  const msg = makeMsg({ text: 'a'.repeat(25) + '!' })
  const res = evaluateFilterRules(msg, null)
  expect(typeof res.hide).toBe('boolean')
})

test('regex: overlong source pattern is rejected (no hang)', () => {
  const longPat = 'a'.repeat(600)
  compileFilterRules([rule({ match: { type: 'regex', value: longPat } })])
  const msg = makeMsg({ text: 'hello world' })
  const res = evaluateFilterRules(msg, null)
  expect(typeof res.hide).toBe('boolean')
})

test('regex: case-insensitive by default', () => {
  compileFilterRules([rule({ match: { type: 'regex', value: 'HELLO' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.highlight).toBe('#ff0000')
})

// ── user match ────────────────────────────────────────────────────────────────

test('user: exact case-insensitive match', () => {
  compileFilterRules([rule({ match: { type: 'user', value: 'TestUser' } })])
  const res = evaluateFilterRules(makeMsg({ user: 'testuser' }), null)
  expect(res.highlight).toBe('#ff0000')
})

test('user: no match on different user', () => {
  compileFilterRules([rule({ match: { type: 'user', value: 'other' } })])
  const res = evaluateFilterRules(makeMsg({ user: 'testuser' }), null)
  expect(res.highlight).toBe(null)
})

test('user: case-sensitive match', () => {
  compileFilterRules([rule({ match: { type: 'user', value: 'TestUser', caseSensitive: true } })])
  expect(evaluateFilterRules(makeMsg({ user: 'TestUser' }), null).highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ user: 'testuser' }), null).highlight).toBe(null)
})

// ── badge match ───────────────────────────────────────────────────────────────

test('badge: matches when badge present in comma-separated list', () => {
  compileFilterRules([rule({ match: { type: 'badge', value: 'moderator' } })])
  const res = evaluateFilterRules(makeMsg({ badges: 'moderator/1,subscriber/12' }), null)
  expect(res.highlight).toBe('#ff0000')
})

test('badge: no match when badge absent', () => {
  compileFilterRules([rule({ match: { type: 'badge', value: 'vip' } })])
  const res = evaluateFilterRules(makeMsg({ badges: 'moderator/1' }), null)
  expect(res.highlight).toBe(null)
})

test('badge: case-insensitive badge name', () => {
  compileFilterRules([rule({ match: { type: 'badge', value: 'MODERATOR' } })])
  const res = evaluateFilterRules(makeMsg({ badges: 'moderator/1' }), null)
  expect(res.highlight).toBe('#ff0000')
})

// ── msgtype match ─────────────────────────────────────────────────────────────

test('msgtype: first-message matches isFirstMsg=true', () => {
  compileFilterRules([rule({ match: { type: 'msgtype', value: 'first-message' } })])
  expect(evaluateFilterRules(makeMsg({ isFirstMsg: true }), null).highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ isFirstMsg: false }), null).highlight).toBe(null)
})

test('msgtype: action matches isAction=true', () => {
  compileFilterRules([rule({ match: { type: 'msgtype', value: 'action' } })])
  expect(evaluateFilterRules(makeMsg({ isAction: true }), null).highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ isAction: false }), null).highlight).toBe(null)
})

test('msgtype: reply matches when replyTo present', () => {
  compileFilterRules([rule({ match: { type: 'msgtype', value: 'reply' } })])
  expect(evaluateFilterRules(makeMsg({ replyTo: { user: 'someone', text: 'hi' } }), null).highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ replyTo: null }), null).highlight).toBe(null)
})

test('msgtype: cheer matches when bits > 0', () => {
  compileFilterRules([rule({ match: { type: 'msgtype', value: 'cheer' } })])
  expect(evaluateFilterRules(makeMsg({ bits: 100 }), null).highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ bits: null }), null).highlight).toBe(null)
})

// ── hide action ───────────────────────────────────────────────────────────────

test('hide: returns hide=true on match', () => {
  compileFilterRules([rule({ action: 'hide', match: { type: 'keyword', value: 'badword' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'badword incoming' }), null)
  expect(res.hide).toBe(true)
})

test('hide: short-circuits — no highlight collected after hide', () => {
  compileFilterRules([
    rule({ action: 'hide', match: { type: 'keyword', value: 'bad' } }),
    rule({ action: 'highlight', color: '#00ff00', match: { type: 'keyword', value: 'bad' } }),
  ])
  const res = evaluateFilterRules(makeMsg({ text: 'bad word' }), null)
  expect(res.hide).toBe(true)
  expect(res.highlight).toBe(null)
})

test('no match: hide=false, highlight=null', () => {
  compileFilterRules([rule({ action: 'hide', match: { type: 'keyword', value: 'xyz' } })])
  const res = evaluateFilterRules(makeMsg({ text: 'hello world' }), null)
  expect(res.hide).toBe(false)
  expect(res.highlight).toBe(null)
})

// ── scope bucketing ───────────────────────────────────────────────────────────

test('scope: all-scope rule fires regardless of channelKey', () => {
  compileFilterRules([rule({ scope: 'all' })])
  expect(evaluateFilterRules(makeMsg({ text: 'hello world' }), null).highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ text: 'hello world' }), 'xqc').highlight).toBe('#ff0000')
})

test('scope: channel-scoped rule only fires for matching channelKey', () => {
  compileFilterRules([rule({ scope: 'xqc' })])
  expect(evaluateFilterRules(makeMsg({ text: 'hello world' }), 'xqc').highlight).toBe('#ff0000')
  expect(evaluateFilterRules(makeMsg({ text: 'hello world' }), 'other').highlight).toBe(null)
  expect(evaluateFilterRules(makeMsg({ text: 'hello world' }), null).highlight).toBe(null)
})

test('scope: all-scope + channel-scope both apply on matching channel', () => {
  compileFilterRules([
    rule({ id: 'a1', scope: 'all', action: 'highlight', color: '#ff0000' }),
    rule({ id: 'a2', scope: 'xqc', action: 'highlight', color: '#00ff00' }),
  ])
  // all-scope fires for non-matching channel (first highlight wins)
  expect(evaluateFilterRules(makeMsg({ text: 'hello' }), 'other').highlight).toBe('#ff0000')
  // both fire for matching channel — first (all-scope) wins
  expect(evaluateFilterRules(makeMsg({ text: 'hello' }), 'xqc').highlight).toBe('#ff0000')
})

// ── first highlight wins (not last) ──────────────────────────────────────────

test('highlight: first matching rule wins', () => {
  compileFilterRules([
    rule({ id: 'r1', color: '#ff0000', match: { type: 'keyword', value: 'hello' } }),
    rule({ id: 'r2', color: '#00ff00', match: { type: 'keyword', value: 'hello' } }),
  ])
  const res = evaluateFilterRules(makeMsg({ text: 'hello' }), null)
  expect(res.highlight).toBe('#ff0000')
})

// ── additive: does not affect shouldAutomod / keywordHighlights ───────────────

test('additive: evaluateFilterRules has no side-effects on outside state', () => {
  compileFilterRules([rule({ action: 'hide', match: { type: 'keyword', value: 'test' } })])
  // Calling evaluateFilterRules multiple times is idempotent
  const m = makeMsg({ text: 'test' })
  const r1 = evaluateFilterRules(m, null)
  const r2 = evaluateFilterRules(m, null)
  expect(r1.hide).toBe(r2.hide)
  expect(r1.highlight).toBe(r2.highlight)
})
