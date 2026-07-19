/**
 * Regression tests for the "/op inside thread view silently posts a thread
 * reply" bug (multichat overlay).
 *
 * postFeedMessage(text, { topLevel }) destructured the flag and then ignored
 * it: `if (activeThread) body.reply_to = activeThread.id` ran for EVERY
 * caller. /op's whole purpose is an explicit top-level post, but with a
 * thread open its post silently became a reply to that thread — the caller's
 * explicit intent overridden with no feedback. Meanwhile the feed-tab plain
 * send WANTS the contextual behavior (typing in thread view = replying), so
 * the fix is a gate, not a removal: `if (activeThread && !topLevel)`, with
 * the feed-tab caller passing no flag (contextual) and /op passing
 * topLevel: true (input.js).
 *
 * Harness: extract postFeedMessage's source from social.js and eval it with
 * stubbed globals; capture the body handed to apiFetch. Tests the real
 * shipped source, same pattern as feed-quote-paint.test.js.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOCIAL_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'social.js'), 'utf8')
const INPUT_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'input.js'), 'utf8')

function sliceBetween(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker)
  if (s === -1) throw new Error(`sliceBetween: start marker not found: ${startMarker}`)
  const e = src.indexOf(endMarker, s)
  if (e === -1) throw new Error(`sliceBetween: end marker not found: ${endMarker}`)
  return src.slice(s, e)
}

const fnSrc = sliceBetween(
  SOCIAL_SRC,
  'async function postFeedMessage(text, { topLevel = false } = {}) {',
  '\nfunction startDiscoverPolling() {',
)

/** Build a fresh postFeedMessage with stubbed environment; returns the fn
 * plus a capture of every apiFetch call body. */
function harness({ activeThread = null } = {}) {
  const calls = []
  const stubs = {
    document: {
      getElementById: () => ({ value: 'x', dataset: {}, style: {} }),
    },
    hsAuthToken: 'tok',
    wysiwygEnabled: false,
    pendingMessage: '',
    activeThread,
    currentTab: 'feed',
    feedMessages: [],
    apiFetch: async (path, opts) => {
      calls.push({ path, body: opts.body })
      return { ok: true, data: {} }
    },
    updateCharCount: () => {},
    hideInputBar: () => {},
    updateInputPlaceholder: () => {},
    renderFeed: () => {},
    isOpMsg: () => false,
    t: (k) => k,
    cleanup: { setTimeout: () => {} },
    showToast: () => {},
  }
  const names = Object.keys(stubs)
  const factory = new Function(...names, `${fnSrc}\nreturn postFeedMessage`)
  return { postFeedMessage: factory(...names.map((n) => stubs[n])), calls }
}

describe('postFeedMessage — topLevel gate (the /op-in-thread-view regression)', () => {
  test('topLevel: true with an active thread posts TOP-LEVEL (no reply_to)', async () => {
    const { postFeedMessage, calls } = harness({ activeThread: { id: 'abc', replies: [] } })
    await postFeedMessage('hello', { topLevel: true })
    expect(calls.length).toBe(1)
    expect(calls[0].body.reply_to).toBeUndefined()
  })

  test('default (contextual) with an active thread posts a reply', async () => {
    const { postFeedMessage, calls } = harness({ activeThread: { id: 'abc', replies: [] } })
    await postFeedMessage('hello')
    expect(calls[0].body.reply_to).toBe('abc')
  })

  test('default with no thread posts top-level', async () => {
    const { postFeedMessage, calls } = harness()
    await postFeedMessage('hello')
    expect(calls[0].body.reply_to).toBeUndefined()
  })
})

describe('caller contracts (input.js source)', () => {
  test('/op passes topLevel: true', () => {
    const opBlock = sliceBetween(INPUT_SRC, "if (cmd === 'op') {", "if (cmd === 'w') {")
    expect(opBlock).toContain('postFeedMessage(rest.trim(), { topLevel: true })')
  })

  test('feed-tab plain send is contextual (no forced topLevel)', () => {
    const feedBlock = sliceBetween(
      INPUT_SRC,
      '// Feed tab: plain text + media paste posts directly to home feed.',
      '// Whispers/mentions',
    )
    expect(feedBlock).toContain('postFeedMessage(text)')
    expect(feedBlock).not.toContain('topLevel: true')
  })
})
