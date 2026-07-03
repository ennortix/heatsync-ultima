import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { escapeHtml } from '../src/lib/utils.js'
import {
  computeHsLetterSpans,
  evictOldestPaintEntry,
  partitionPaintBatch,
  splitHsLettersHtml,
} from '../src/multichat/paints.js'

// Only the pure/stateless helpers are unit-tested here — queuePaintLookup,
// flushHsPaintBatch, ensureHsPaintSheet etc. reach into the shared multichat
// bundle scope (cleanup, getSetting, safeSendMessage, document — all real
// globals once bundled into multichat-*.js, none of which exist when this
// file is imported standalone as an ES module for testing). That matches this
// repo's existing test convention (see filter-rules.test.js / mod-log.test.js)
// of unit-testing pure logic only, not the DOM/network-bound glue.
//
// splitHsLettersHtml DOES reach for one bundle-global (escapeHtml, from
// src/lib/utils.js) — stand it in on globalThis for the duration of this
// file (using the real implementation), same pattern as
// tests/user-notes.test.js does for its identity-graph globals.
beforeEach(() => {
  globalThis.escapeHtml = escapeHtml
})
afterEach(() => {
  globalThis.escapeHtml = undefined
})

describe('evictOldestPaintEntry — pure LRU-ish eviction (mirrors monorepo evictOldest)', () => {
  test('evicts the oldest (first-inserted) entry once at capacity', () => {
    const m = new Map([['a', 1], ['b', 2], ['c', 3]])
    evictOldestPaintEntry(m, 3)
    expect([...m.keys()]).toEqual(['b', 'c'])
  })

  test('does nothing below capacity', () => {
    const m = new Map([['a', 1]])
    evictOldestPaintEntry(m, 3)
    expect([...m.keys()]).toEqual(['a'])
  })

  test('no-ops on an empty map', () => {
    const m = new Map()
    expect(() => evictOldestPaintEntry(m, 3)).not.toThrow()
    expect(m.size).toBe(0)
  })
})

describe('partitionPaintBatch — pure batch/rest split, newest-queued first', () => {
  test('drains the newest N (end of insertion order) as the batch', () => {
    const { batch, rest } = partitionPaintBatch(['a', 'b', 'c', 'd', 'e'], 3)
    expect(batch).toEqual(['c', 'd', 'e'])
    expect(rest).toEqual(['a', 'b'])
  })

  test('returns everything as batch when under the cap', () => {
    const { batch, rest } = partitionPaintBatch(['a', 'b'], 50)
    expect(batch).toEqual(['a', 'b'])
    expect(rest).toEqual([])
  })

  test('accepts a Set as input (does not mutate it)', () => {
    const s = new Set(['x', 'y', 'z'])
    const { batch, rest } = partitionPaintBatch(s, 2)
    expect(batch).toEqual(['y', 'z'])
    expect(rest).toEqual(['x'])
    expect(s.size).toBe(3)
  })

  test('caps at the server\'s MAX_BATCH_IDS (50)', () => {
    const ids = Array.from({ length: 120 }, (_, i) => String(i))
    const { batch, rest } = partitionPaintBatch(ids, 50)
    expect(batch.length).toBe(50)
    expect(rest.length).toBe(70)
    // newest 50 (highest indices) go first
    expect(batch[0]).toBe('70')
    expect(batch[49]).toBe('119')
  })
})

describe('computeHsLetterSpans — pure per-letter split data', () => {
  test('computes 0-based index per letter and midpoint = (len-1)/2', () => {
    const { mid, letters } = computeHsLetterSpans('abcd')
    expect(mid).toBe(1.5)
    expect(letters).toEqual([
      { ch: 'a', i: 0 }, { ch: 'b', i: 1 }, { ch: 'c', i: 2 }, { ch: 'd', i: 3 },
    ])
  })

  test('handles a single character (mid = 0)', () => {
    const { mid, letters } = computeHsLetterSpans('x')
    expect(mid).toBe(0)
    expect(letters).toEqual([{ ch: 'x', i: 0 }])
  })

  test('handles empty string', () => {
    const { mid, letters } = computeHsLetterSpans('')
    expect(mid).toBe(-0.5)
    expect(letters).toEqual([])
  })

  test('handles null/undefined gracefully', () => {
    expect(computeHsLetterSpans(null).letters).toEqual([])
    expect(computeHsLetterSpans(undefined).letters).toEqual([])
  })

  test('includes the leading @ as its own letter for mention/reply anchors', () => {
    const { letters } = computeHsLetterSpans('@bob')
    expect(letters[0]).toEqual({ ch: '@', i: 0 })
    expect(letters.length).toBe(4)
  })
})

describe('splitHsLettersHtml — escapes each glyph individually', () => {
  test('wraps each character in a span with --i/--mid custom props', () => {
    const html = splitHsLettersHtml('ab')
    expect(html).toBe('<span style="--i:0;--mid:0.5">a</span><span style="--i:1;--mid:0.5">b</span>')
  })

  test('HTML-escapes glyphs that are themselves markup-shaped (defense in depth)', () => {
    const html = splitHsLettersHtml('<>')
    expect(html).not.toContain('<>')
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
  })
})

// ── ID-space guard: structural invariant, not a value-based check ───────────
//
// Paints are keyed by heatsync-side TWITCH user ids, which collide in value
// with kick/YouTube's own id spaces (see heatsync_userid_collision_kick_twitch
// in project memory — both are bare numeric, indistinguishable by shape). The
// safety here is architectural: queuePaintLookup must be called from exactly
// ONE place — queueMcCosmeticsLookup — the same already-audited choke point
// 7TV cosmetics uses, which only ever receives a RESOLVED twitch id (native
// for twitch chatters, linked-twitch-id for kick/YouTube via
// flushKickNameLookups/flushYtNameLookups). A second call site would be a
// silent way to reintroduce the collision trap, so this is asserted directly
// against the source rather than left to convention.
describe('paint lookup id-space guard — structural invariant', () => {
  const mainJs = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'main.js'), 'utf8')

  test('queuePaintLookup is called from exactly one place in main.js', () => {
    const calls = mainJs.match(/\bqueuePaintLookup\(/g) || []
    expect(calls.length).toBe(1)
  })

  test('that one call site is inside queueMcCosmeticsLookup, the same choke point 7TV cosmetics uses', () => {
    const fnStart = mainJs.indexOf('function queueMcCosmeticsLookup(')
    expect(fnStart).toBeGreaterThan(-1)
    const fnBody = mainJs.slice(fnStart, fnStart + 600)
    expect(fnBody).toContain('queuePaintLookup(userId)')
  })
})
