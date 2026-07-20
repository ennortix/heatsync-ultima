/**
 * Cleared tab highlights must survive a reload (src/multichat/seen-state.js).
 *
 * Regression anchor (2026-07-20): mentions / whispers / following lit up as
 * unread on EVERY extension reload and page refresh no matter how many times
 * they'd been cleared. bumpSeen() persisted both halves of the state, but
 * loadSeenState() restored only `latestAt` — `seenAt` silently reset to 0 while
 * latestAt came back at real event times, so hasUnseen() (latestAt > seenAt)
 * was true for all three surfaces forever. Anonymous users never reach the
 * server GET, so the local cache is their only record; logged-in users could
 * also lose the race against the fire-and-forget loadHsAuth() (hsAuthToken
 * starts null) and take the anonymous fast-path, skipping the sync entirely.
 *
 * Source-level assertions: the module is deeply entangled with the content
 * script bundle (chrome.*, cleanup, apiFetch, tab DOM), so this pins the two
 * invariants that actually broke rather than re-implementing the module.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'seen-state.js'), 'utf8')

function loadSeenStateBody() {
  const start = SRC.indexOf('async function loadSeenState()')
  if (start === -1) throw new Error('loadSeenState not found')
  const end = SRC.indexOf('\nasync function', start + 10)
  const tail = SRC.indexOf('\nfunction', start + 10)
  const stop = [end, tail].filter((n) => n > start).sort((a, b) => a - b)[0] ?? SRC.length
  return SRC.slice(start, stop)
}

describe('loadSeenState restores BOTH halves of the cache', () => {
  const body = loadSeenStateBody()

  test('restores latestAt from the local cache', () => {
    expect(body).toMatch(/data\.latestAt\[k\]/)
    expect(body).toMatch(/latestAt\[k\] = data\.latestAt\[k\]/)
  })

  test('restores seenAt from the local cache — the cleared marks', () => {
    // The bug: this half was written by _saveSeenLocal but never read back.
    expect(body).toMatch(/data\.seenAt\[k\]/)
    expect(body).toMatch(/seenAt\[k\] = data\.seenAt\[k\]/)
  })

  test('bails to local-only ONLY on a known-anonymous token, not an unresolved one', () => {
    // hsAuthToken starts null (unknown). A plain `!hsAuthToken` treated that as
    // anonymous and skipped the cross-device sync for the whole session.
    expect(body).toMatch(/hsAuthToken === false/)
    expect(body).not.toMatch(/&&\s*!hsAuthToken\b/)
  })
})

describe('the writer still persists what the reader now expects', () => {
  test('_saveSeenLocal writes both latestAt and seenAt under one key', () => {
    const start = SRC.indexOf('function _saveSeenLocal()')
    const body = SRC.slice(start, SRC.indexOf('\nasync function', start))
    expect(body).toMatch(/latestAt:/)
    expect(body).toMatch(/seenAt:/)
  })

  test('all three surfaces round-trip', () => {
    expect(SRC).toMatch(/SEEN_SURFACES = \['mentions', 'whispers', 'live'\]/)
  })
})

describe('hasUnseen contract', () => {
  test('unread is strictly latestAt > seenAt', () => {
    const start = SRC.indexOf('function hasUnseen(')
    const body = SRC.slice(start, start + 200)
    expect(body).toMatch(/latestAt\[surface\] > seenAt\[surface\]/)
  })
})
