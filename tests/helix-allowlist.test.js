/**
 * Unit tests for the HELIX_ALLOW endpoint+method allowlist in
 * chrome/early-inject-main.js (`heatsync-helix` message handler).
 *
 * This gate is the only thing standing between a forged `heatsync-helix`
 * postMessage (the MAIN-world nonce can't be a true secret — this realm is
 * shared with the page, see the comment right above HELIX_ALLOW) and an
 * arbitrary Helix call riding the user's real OAuth token. It fails closed:
 * anything not an exact [METHOD, pathname] match against
 * 'https://api.twitch.tv' is rejected.
 *
 * The predicate is inline in a large async try-block (network calls, log(),
 * postMessage side effects) — not its own function — so this file slices the
 * *exact* declarations + condition text out of the real source and evaluates
 * them via `new Function`, the same source-slicing harness used elsewhere in
 * this suite (see tests/feed-quote-paint.test.js). That means these tests
 * exercise the real HELIX_ALLOW list and the real condition, not a
 * hand-copied re-implementation that could quietly drift from the source.
 * If chrome/early-inject-main.js's HELIX_ALLOW block is ever refactored, the
 * marker strings below must be updated to match or this file throws loudly
 * at import time (sliceBetween throws on a missing marker) instead of
 * silently testing stale logic.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(import.meta.dir, '..', 'chrome', 'early-inject-main.js'), 'utf8')

// Declarations: the HELIX_ALLOW list, the reqUrl parse (fail-closed to null
// on an unparseable URL), and the reqMethod normalization.
const DECLS_START = 'const HELIX_ALLOW = ['
const DECLS_END_MARKER = "const reqMethod = (req.method || 'GET').toUpperCase()"
const declsStart = SRC.indexOf(DECLS_START)
if (declsStart === -1) throw new Error(`marker not found: ${DECLS_START}`)
const declsEndIdx = SRC.indexOf(DECLS_END_MARKER, declsStart)
if (declsEndIdx === -1) throw new Error(`marker not found: ${DECLS_END_MARKER}`)
const decls = SRC.slice(declsStart, declsEndIdx + DECLS_END_MARKER.length)

// The reject condition itself — sliced as a bare expression (no `if (` / `{`)
// so it can be dropped straight into `return !( ... )` below without any
// stray control-flow from the surrounding `if` statement.
const COND_START_MARKER = 'if (\n            !reqUrl ||'
const COND_END_MARKER = '!HELIX_ALLOW.some(([m, p]) => m === reqMethod && reqUrl.pathname === p)\n          )'
const condStartIdx = SRC.indexOf(COND_START_MARKER, declsEndIdx)
if (condStartIdx === -1) throw new Error(`marker not found: ${COND_START_MARKER}`)
const condInnerStart = condStartIdx + 'if (\n'.length
const condEndIdx = SRC.indexOf(COND_END_MARKER, condInnerStart)
if (condEndIdx === -1) throw new Error(`marker not found: ${COND_END_MARKER}`)
const condExpr = SRC.slice(
  condInnerStart,
  condEndIdx + '!HELIX_ALLOW.some(([m, p]) => m === reqMethod && reqUrl.pathname === p)'.length,
)

// isHelixAllowed(req) === true  ⇔  the real handler would proceed past the gate
const isHelixAllowed = new Function(
  'req',
  `
  ${decls}
  return !(${condExpr})
  `,
)

describe('HELIX_ALLOW — exact endpoint+method allowlist (chrome/early-inject-main.js)', () => {
  test('allowed method+path+origin passes', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/chat/color' })).toBe(true)
    expect(isHelixAllowed({ method: 'PUT', url: 'https://api.twitch.tv/helix/chat/color' })).toBe(true)
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/users' })).toBe(true)
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/chat/settings' })).toBe(true)
    expect(isHelixAllowed({ method: 'PATCH', url: 'https://api.twitch.tv/helix/chat/settings' })).toBe(true)
    expect(isHelixAllowed({ method: 'POST', url: 'https://api.twitch.tv/helix/clips' })).toBe(true)
  })

  test('method is case-insensitive and defaults to GET when omitted', () => {
    expect(isHelixAllowed({ method: 'get', url: 'https://api.twitch.tv/helix/users' })).toBe(true)
    expect(isHelixAllowed({ url: 'https://api.twitch.tv/helix/users' })).toBe(true)
  })

  test('a legitimate query string on an allowed path still passes (pathname match ignores query)', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/users?login=mellen' })).toBe(true)
  })

  test('wrong method for an otherwise-allowed path is rejected', () => {
    expect(isHelixAllowed({ method: 'PUT', url: 'https://api.twitch.tv/helix/users' })).toBe(false)
    expect(isHelixAllowed({ method: 'DELETE', url: 'https://api.twitch.tv/helix/chat/color' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/clips' })).toBe(false)
  })

  test('subpath of an allowed path is rejected (exact pathname match only, no prefix match)', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/users/extra' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/chat/color/foo' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/users/' })).toBe(false)
  })

  test('an allowed path smuggled only in the query string (not the real pathname) is rejected', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/bans?x=/helix/users' })).toBe(false)
  })

  test('off-origin requests are rejected — wrong host, wrong scheme, and lookalike subdomain', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'https://evil.com/helix/users' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: 'http://api.twitch.tv/helix/users' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv.evil.com/helix/users' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: 'https://evil.com/?u=https://api.twitch.tv/helix/users' })).toBe(false)
  })

  test('off-list endpoints are rejected even with a valid method+origin', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'https://api.twitch.tv/helix/bans' })).toBe(false)
    expect(isHelixAllowed({ method: 'DELETE', url: 'https://api.twitch.tv/helix/moderation/bans' })).toBe(false)
    expect(isHelixAllowed({ method: 'PATCH', url: 'https://api.twitch.tv/helix/channels' })).toBe(false)
  })

  test('an unparseable URL fails closed', () => {
    expect(isHelixAllowed({ method: 'GET', url: 'not a url' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: '' })).toBe(false)
    expect(isHelixAllowed({ method: 'GET', url: undefined })).toBe(false)
  })
})
