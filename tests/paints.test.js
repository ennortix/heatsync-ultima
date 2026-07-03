import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { compilePaintCss, hashPaintSpec, paintNeedsLetterSplit } from '../src/lib/paint-spec.js'
import { escapeHtml } from '../src/lib/utils.js'
import {
  applyHsPaintToElement,
  computeHsLetterSpans,
  evictOldestPaintEntry,
  getHsPaintClass,
  partitionPaintBatch,
  setHsPaintEntry,
  splitHsLettersHtml,
} from '../src/multichat/paints.js'

// Most of this file unit-tests pure/stateless helpers only — queuePaintLookup,
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
//
// applyHsPaintToElement/setHsPaintEntry ARE exercised below (the "in-place
// application" describe block) — they need a `document` for the injected
// paint stylesheet, so a minimal fake stands in (a style-tag look-alike +
// a no-op head), and compilePaintCss/hashPaintSpec/paintNeedsLetterSplit
// (normally bundle-globals from lib/paint-spec.js, per build.js's
// readMultichatModules) are the REAL implementations. The DOM elements
// applyHsPaintToElement itself operates on are duck-typed fakes (a real
// jsdom/happy-dom isn't a repo dependency) — just enough surface
// (classList/dataset/hasAttribute/removeAttribute/innerHTML/textContent)
// to prove the hardening behavior, no visual rendering involved.
beforeEach(() => {
  globalThis.escapeHtml = escapeHtml
  globalThis.compilePaintCss = compilePaintCss
  globalThis.hashPaintSpec = hashPaintSpec
  globalThis.paintNeedsLetterSplit = paintNeedsLetterSplit
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    head: { appendChild: () => {} },
  }
})
afterEach(() => {
  globalThis.escapeHtml = undefined
  globalThis.compilePaintCss = undefined
  globalThis.hashPaintSpec = undefined
  globalThis.paintNeedsLetterSplit = undefined
  globalThis.document = undefined
})

// Minimal duck-typed stand-in for an Anchor element — only the surface
// applyHsPaintToElement actually touches.
function fakeAnchor(textContent, { existingClasses = [], style = null, splitAttr } = {}) {
  const classes = new Set(existingClasses)
  const dataset = {}
  if (splitAttr) dataset.hsPaintSplit = splitAttr
  return {
    textContent,
    innerHTML: textContent,
    dataset,
    _style: style,
    classList: {
      contains: (c) => classes.has(c),
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      [Symbol.iterator]: () => classes[Symbol.iterator](),
    },
    hasAttribute(name) {
      return name === 'style' && this._style != null
    },
    removeAttribute(name) {
      if (name === 'style') this._style = null
    },
  }
}

const WAVE_SPEC = {
  base: { type: 'solid', angle: 0, stops: [{ color: '#ff8700', pos: 0 }] },
  effects: [{ id: 'wave', speed: 1 }],
}
const SOLID_SPEC = { base: { type: 'solid', angle: 0, stops: [{ color: '#ff8700', pos: 0 }] }, effects: [] }

describe('applyHsPaintToElement — in-place DOM application (BUG #3 hardening)', () => {
  const UID = 'u1'

  test('splits letter-per-span and marks dataset.hsPaintSplit for a needs-split (wave) paint', () => {
    setHsPaintEntry(UID, WAVE_SPEC)
    const cls = getHsPaintClass(UID)
    const el = fakeAnchor('@mellen')
    applyHsPaintToElement(el, UID)
    expect(el.classList.contains(cls)).toBe(true)
    expect(el.dataset.hsPaintSplit).toBe('1')
    expect(el.innerHTML).toContain('<span')
    expect(el.innerHTML.replace(/<[^>]+>/g, '')).toBe('@mellen')
  })

  test('does NOT split (no per-letter spans) for a solid paint that needs no split', () => {
    setHsPaintEntry(UID, SOLID_SPEC)
    const el = fakeAnchor('@mellen')
    applyHsPaintToElement(el, UID)
    expect(el.classList.contains(getHsPaintClass(UID))).toBe(true)
    expect(el.dataset.hsPaintSplit).toBeUndefined()
    expect(el.innerHTML).toBe('@mellen')
  })

  test('clears a pre-existing inline style attribute (precedence: class-based paint must win)', () => {
    setHsPaintEntry(UID, SOLID_SPEC)
    const el = fakeAnchor('@mellen', { style: 'color:#fff' })
    expect(el.hasAttribute('style')).toBe(true)
    applyHsPaintToElement(el, UID)
    expect(el.hasAttribute('style')).toBe(false)
  })

  test('no-ops entirely when el is null/undefined', () => {
    setHsPaintEntry(UID, WAVE_SPEC)
    expect(() => applyHsPaintToElement(null, UID)).not.toThrow()
  })

  test('no-ops when the uid has no resolved paint', () => {
    setHsPaintEntry(UID, null)
    const el = fakeAnchor('@mellen')
    applyHsPaintToElement(el, UID)
    expect(el.innerHTML).toBe('@mellen')
    expect([...el.classList].length).toBe(0)
  })

  test('BUG #3: never innerHTML-assigns when textContent is already empty — a split of "" must never permanently wipe a node', () => {
    setHsPaintEntry(UID, WAVE_SPEC)
    const el = fakeAnchor('') // textContent already empty at apply-time (e.g. some other race emptied it first)
    applyHsPaintToElement(el, UID)
    // Class still applies (that part is safe/idempotent either way)...
    expect(el.classList.contains(getHsPaintClass(UID))).toBe(true)
    // ...but the node is NEVER marked "split" over empty content, and innerHTML
    // is left untouched — so a later real repaint (once text is actually
    // present) can still run the split instead of being permanently skipped.
    expect(el.dataset.hsPaintSplit).toBeUndefined()
    expect(el.innerHTML).toBe('')
  })

  test('is idempotent — calling twice on an already-split element does not re-split or double-escape', () => {
    setHsPaintEntry(UID, WAVE_SPEC)
    const el = fakeAnchor('@mellen')
    applyHsPaintToElement(el, UID)
    const firstHtml = el.innerHTML
    applyHsPaintToElement(el, UID)
    expect(el.innerHTML).toBe(firstHtml)
  })
})

describe('evictOldestPaintEntry — pure LRU-ish eviction (mirrors monorepo evictOldest)', () => {
  test('evicts the oldest (first-inserted) entry once at capacity', () => {
    const m = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
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

  test("caps at the server's MAX_BATCH_IDS (50)", () => {
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
      { ch: 'a', i: 0 },
      { ch: 'b', i: 1 },
      { ch: 'c', i: 2 },
      { ch: 'd', i: 3 },
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
