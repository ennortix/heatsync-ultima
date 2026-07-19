import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// selectTabSources (src/multichat/tab-messages.js). No import/export — it's
// concatenated into the multichat bundle as a global; loaded here via
// new Function so the test exercises the real source (same pattern as
// send-targets.test.js).
function load() {
  const src = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'tab-messages.js'), 'utf8')
  return new Function(`${src}; return { selectTabSources }`)()
}
const { selectTabSources } = load()

const T = [{ p: 't1' }, { p: 't2' }]
const K = [{ p: 'k1' }]
const Y = [{ p: 'y1' }, { p: 'y2' }, { p: 'y3' }]

test('no filter = every platform included (undefined keys default ON)', () => {
  const r = selectTabSources({ twitch: T, kick: K, youtube: Y }, undefined)
  expect(r.included).toEqual([T, K, Y])
  expect(r.hiddenByFilter).toBe(false)
  expect(r.hiddenCount).toBe(0)
  expect(r.filter).toEqual({ twitch: true, kick: true, youtube: true })
})

test('empty filter object still defaults every platform ON', () => {
  const r = selectTabSources({ twitch: T, kick: K, youtube: Y }, {})
  expect(r.included).toEqual([T, K, Y])
  expect(r.hiddenByFilter).toBe(false)
})

test('filtering one platform excludes only its array', () => {
  const r = selectTabSources({ twitch: T, kick: K, youtube: Y }, { youtube: false })
  expect(r.included).toEqual([T, K, []])
  expect(r.hiddenByFilter).toBe(false) // twitch+kick still show
  expect(r.hiddenCount).toBe(3) // the 3 youtube msgs
})

// THE bug that ate a debugging night: a tab whose only populated source is
// filtered off must be flagged, not silently blanked.
test('youtube-only tab with Y filtered off = hiddenByFilter, NOT a silent blank', () => {
  const r = selectTabSources({ twitch: [], kick: [], youtube: Y }, { youtube: false })
  expect(r.included).toEqual([[], [], []]) // merge would be empty…
  expect(r.hiddenByFilter).toBe(true) // …but we KNOW it's the filter, not "no chat"
  expect(r.hiddenCount).toBe(3)
  expect(r.availablePlatforms).toEqual(['youtube'])
})

test('youtube-only tab with Y ON renders youtube', () => {
  const r = selectTabSources({ twitch: [], kick: [], youtube: Y }, { youtube: true })
  expect(r.included).toEqual([[], [], Y])
  expect(r.hiddenByFilter).toBe(false)
})

test('genuinely empty tab is NOT hiddenByFilter (nothing to hide)', () => {
  const r = selectTabSources({ twitch: [], kick: [], youtube: [] }, { youtube: false, twitch: false })
  expect(r.hiddenByFilter).toBe(false)
  expect(r.hiddenCount).toBe(0)
  expect(r.availablePlatforms).toEqual([])
})

test('all platforms present but ALL filtered off = hiddenByFilter', () => {
  const r = selectTabSources({ twitch: T, kick: K, youtube: Y }, { twitch: false, kick: false, youtube: false })
  expect(r.hiddenByFilter).toBe(true)
  expect(r.hiddenCount).toBe(6)
  expect(r.availablePlatforms).toEqual(['twitch', 'kick', 'youtube'])
})

test('robust to missing/nonarray source keys', () => {
  const r = selectTabSources({ youtube: Y }, undefined)
  expect(r.included).toEqual([[], [], Y])
  expect(r.hiddenByFilter).toBe(false)
  const r2 = selectTabSources(null, null)
  expect(r2.included).toEqual([[], [], []])
  expect(r2.hiddenByFilter).toBe(false)
})
