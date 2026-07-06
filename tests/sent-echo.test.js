import { expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Echo-dedup tests — isSentEcho (src/multichat/input.js).
 *
 * Regression anchor: sending the same text twice within 10s dropped the 2nd
 * own message. The old newest-first scan locked both echoes onto ONE entry,
 * so the 2nd send's only echo counted as the 1st send's dual-send duplicate
 * and was suppressed. Fix: FIFO — the oldest send whose expected echo count
 * (one per target platform) isn't exhausted claims the echo.
 *
 * isSentEcho lives in the non-module content-script bundle, so it's carved
 * out of the source and evaluated standalone (same rationale as
 * mod-dedup.test.js / tab-complete-order.test.js).
 */
function loadIsSentEcho() {
  const src = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'input.js'), 'utf8')
  const start = src.indexOf('function isSentEcho')
  if (start < 0) throw new Error('isSentEcho not found in input.js')
  let i = src.indexOf('{', start)
  let depth = 0
  let end = -1
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  const body = src.slice(start, end)
  // Bind the module-scoped state the function closes over.
  return (entries) =>
    new Function('_recentSentMessages', 'SENT_DEDUP_WINDOW', `${body}; return isSentEcho`)(entries, 10000)
}

const makeIsSentEcho = loadIsSentEcho()
const now = () => Date.now()

test('single send: first echo renders', () => {
  const entries = [{ text: 'hello', time: now(), synthId: 'a', echoes: 1 }]
  const isSentEcho = makeIsSentEcho(entries)
  expect(isSentEcho('hello', 'twitch')).toBe(false)
})

test('dual-send: first echo renders, duplicate suppressed, third-party copy renders', () => {
  const entries = [{ text: 'hello', time: now(), synthId: 'a', echoes: 2 }]
  const isSentEcho = makeIsSentEcho(entries)
  expect(isSentEcho('hello', 'twitch')).toBe(false) // twitch echo
  expect(isSentEcho('hello', 'kick')).toBe(true) // kick duplicate
  expect(isSentEcho('hello', 'twitch')).toBe(false) // another user, same text
})

test('REGRESSION: same text sent twice within 10s — BOTH echoes render', () => {
  const t = now()
  const entries = [
    { text: 'hello', time: t - 200, synthId: 'a', echoes: 1 },
    { text: 'hello', time: t - 100, synthId: 'b', echoes: 1 },
  ]
  const isSentEcho = makeIsSentEcho(entries)
  expect(isSentEcho('hello', 'twitch')).toBe(false) // send #1's echo
  expect(isSentEcho('hello', 'twitch')).toBe(false) // send #2's echo — was dropped pre-fix
  expect(isSentEcho('hello', 'twitch')).toBe(false) // third-party copy still renders
})

test('dual-send twice: exactly two copies render out of four echoes', () => {
  const t = now()
  const entries = [
    { text: 'gg', time: t - 200, synthId: 'a', echoes: 2 },
    { text: 'gg', time: t - 100, synthId: 'b', echoes: 2 },
  ]
  const isSentEcho = makeIsSentEcho(entries)
  const results = ['twitch', 'kick', 'twitch', 'kick'].map((p) => isSentEcho('gg', p))
  expect(results.filter((suppressed) => !suppressed).length).toBe(2)
})

test('entries outside the 10s window are ignored', () => {
  const entries = [{ text: 'hello', time: now() - 60000, synthId: 'a', echoes: 2 }]
  const isSentEcho = makeIsSentEcho(entries)
  expect(isSentEcho('hello', 'twitch')).toBe(false)
  expect(entries[0].suppressed).toBeUndefined()
})

test('stale entry early in the array does not abort the scan (cross-tab merge disorder)', () => {
  const entries = [
    { text: 'hello', time: now() - 60000, synthId: 'old', echoes: 2 },
    { text: 'hello', time: now(), synthId: 'fresh', echoes: 2 },
  ]
  const isSentEcho = makeIsSentEcho(entries)
  expect(isSentEcho('hello', 'twitch')).toBe(false)
  expect(isSentEcho('hello', 'kick')).toBe(true) // claimed by the fresh entry
})

test('legacy entry without echoes field defaults to 1', () => {
  const entries = [{ text: 'hello', time: now(), synthId: 'a' }]
  const isSentEcho = makeIsSentEcho(entries)
  expect(isSentEcho('hello', 'twitch')).toBe(false)
  expect(isSentEcho('hello', 'twitch')).toBe(false) // exhausted → renders, not suppressed
})

test('exhausted entries stay in the array for peekSentHost badge attribution', () => {
  const entries = [{ text: 'hello', time: now(), synthId: 'a', echoes: 2 }]
  const isSentEcho = makeIsSentEcho(entries)
  isSentEcho('hello', 'twitch')
  isSentEcho('hello', 'kick')
  expect(entries.length).toBe(1)
  expect(entries[0].suppressed).toBe(2)
})
