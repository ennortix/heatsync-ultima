/**
 * Inline feed rows in chat ([OP]/[RE]).
 *
 * Two bugs this pins:
 *  1. The whole websocket new-message handler bailed on `if (!feedLoaded)
 *     return`, and feedLoaded only flips after the FEED TAB is opened. A
 *     session that stayed in chat therefore never saw a single [OP] or [RE]
 *     from anyone — the "replies don't work" report.
 *  2. Your own post now echoes locally the moment it posts, so it reaches the
 *     row builder twice (local echo + the ws broadcast of the same post).
 *     Only OPs land in feedMessages, so the buffer dedup never covered
 *     replies — a reply you sent would render twice.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'social.js'), 'utf8')

function sliceBetween(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker)
  if (s === -1) throw new Error(`start marker not found: ${startMarker}`)
  const e = src.indexOf(endMarker, s)
  if (e === -1) throw new Error(`end marker not found: ${endMarker}`)
  return src.slice(s, e)
}

const fnSrc = sliceBetween(SRC, 'let lastInlineFeedOpId = null', '\nasync function fetchFeed(')

function harness() {
  const factory = new Function('isOpMsg', `${fnSrc}\nreturn { buildFeedInlineNotif, lastOp: () => lastInlineFeedOpId }`)
  return factory((m) => (m.is_op != null ? !!m.is_op : !m.reply_to || m.reply_to === ''))
}

const row = (over = {}) => ({
  base36_id: '00002p',
  created_at: '2026-07-30T19:00:00Z',
  content: 'hi',
  username: 'mellen',
  ...over,
})

describe('buildFeedInlineNotif', () => {
  test('an OP builds an [OP] row and becomes the /opr target', () => {
    const { buildFeedInlineNotif, lastOp } = harness()
    const built = buildFeedInlineNotif(row())
    expect(built.notifType).toBe('op')
    expect(lastOp()).toBe('00002p')
  })

  test('a reply builds an [RE] row and does NOT become the reply target', () => {
    const { buildFeedInlineNotif, lastOp } = harness()
    buildFeedInlineNotif(row())
    const built = buildFeedInlineNotif(row({ base36_id: '00002q', reply_to: '00002p' }))
    expect(built.notifType).toBe('re')
    // still the thread root — consecutive /opr keeps replying to the thread
    expect(lastOp()).toBe('00002p')
  })

  test('the same id never builds a second row (local echo + ws broadcast)', () => {
    const { buildFeedInlineNotif } = harness()
    expect(buildFeedInlineNotif(row())).toBeTruthy()
    expect(buildFeedInlineNotif(row())).toBeNull()
  })

  test('dedup covers replies too — they never hit the feedMessages buffer', () => {
    const { buildFeedInlineNotif } = harness()
    const reply = row({ base36_id: '00002q', reply_to: '00002p' })
    expect(buildFeedInlineNotif(reply)).toBeTruthy()
    expect(buildFeedInlineNotif(reply)).toBeNull()
  })

  test('different posts still each get a row', () => {
    const { buildFeedInlineNotif } = harness()
    expect(buildFeedInlineNotif(row())).toBeTruthy()
    expect(buildFeedInlineNotif(row({ base36_id: '00002r' }))).toBeTruthy()
  })

  test('a row with an unusable timestamp is skipped, not rendered blank', () => {
    const { buildFeedInlineNotif } = harness()
    expect(buildFeedInlineNotif(row({ created_at: 'not-a-date' }))).toBeNull()
  })
})

describe('websocket handler no longer hides rows behind the feed tab', () => {
  const handler = sliceBetween(SRC, "if (msg.type === 'new-message' && msg.data) {", "if (msg.type === 'dm_new'")

  test('the inline row is built without requiring feedLoaded', () => {
    // the early bail is gone; feedLoaded now only guards buffer maintenance
    expect(handler).not.toContain('if (!feedLoaded) return')
    expect(handler).toContain('buildFeedInlineNotif(msg.data)')
  })

  test('buffer maintenance is still gated on a loaded feed', () => {
    expect(handler).toContain('if (feedLoaded && !alreadyBuffered) {')
  })
})
