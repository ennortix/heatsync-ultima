/**
 * Highlight My Message send (twitch Bits power-up).
 *
 * sendHighlightedTwitchMessage fires the SendHighlightedChatMessage GQL
 * mutation (proxy-first, raw-fetch fallback) that posts + highlights in one
 * call, spending the user's Bits. We verify, against the REAL carved function
 * body: input construction, the {ok,balance}/{error} contract, the raw-fetch
 * fallback when the proxy throws, and the server kill switch.
 *
 * Source-slice harness (marker pattern: tests/cw-render-placeholder.test.js) —
 * the fn is in the non-module twitch-api bundle, not independently importable.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'twitch-api.js'), 'utf8')

function slice(startMarker, endMarker) {
  const s = SRC.indexOf(startMarker)
  if (s === -1) throw new Error(`start marker not found: ${startMarker}`)
  const e = SRC.indexOf(endMarker, s)
  if (e === -1) throw new Error(`end marker not found: ${endMarker}`)
  return SRC.slice(s, e)
}

// Carve the kill-switch helper + the send fn (both between these markers).
const body = slice('function _isHighlightSendKilled(', '// Best-effort Bits balance')

// Build a runnable factory. Deps are injected as params so each test controls
// the environment (proxy result, token, health flags) without globals leaking.
function makeSender({ health = null, token = 'tok', gqlProxy, fetchImpl } = {}) {
  const factory = new Function(
    'window',
    'getTwitchAuthToken',
    'gqlProxy',
    'fetch',
    'crypto',
    'console',
    'TWITCH_GQL',
    'TWITCH_CLIENT_ID',
    `${body}\nreturn sendHighlightedTwitchMessage`,
  )
  return factory(
    { __hsHealth: health },
    () => token,
    gqlProxy || (async () => ({ data: { sendHighlightedChatMessage: { balance: 500, error: null } } })),
    fetchImpl ||
      (async () => ({
        ok: true,
        json: async () => ({ data: { sendHighlightedChatMessage: { balance: 400, error: null } } }),
      })),
    { randomUUID: () => 'uuid-fixed' },
    { warn() {} },
    'https://gql.twitch.tv/gql',
    'kimne78kx3ncx6brgo4mv6wki5h1ko',
  )
}

describe('sendHighlightedTwitchMessage', () => {
  test('happy path via proxy returns ok + balance', async () => {
    let captured
    const send = makeSender({
      gqlProxy: async (op, vars) => {
        captured = { op, vars }
        return { data: { sendHighlightedChatMessage: { balance: 500, error: null } } }
      },
    })
    const r = await send('12345', 'hello world', null, null)
    expect(r).toEqual({ ok: true, balance: 500 })
    expect(captured.op).toBe('SendHighlightedChatMessage')
    expect(captured.vars.input.channelID).toBe('12345')
    expect(captured.vars.input.message).toBe('hello world')
    // nonce + transactionID are always populated (dedup + idempotency)
    expect(captured.vars.input.nonce).toBeTruthy()
    expect(captured.vars.input.transactionID).toBeTruthy()
    // no reply → no replyParentMessageID key
    expect('replyParentMessageID' in captured.vars.input).toBe(false)
  })

  test('reply id is threaded into the input', async () => {
    let captured
    const send = makeSender({
      gqlProxy: async (op, vars) => (
        (captured = vars), { data: { sendHighlightedChatMessage: { balance: 1, error: null } } }
      ),
    })
    await send('9', 'yo', 'nonce-x', 'parent-42')
    expect(captured.input.replyParentMessageID).toBe('parent-42')
    expect(captured.input.nonce).toBe('nonce-x') // explicit nonce preserved
  })

  test('server error code surfaces as {error}', async () => {
    const send = makeSender({
      gqlProxy: async () => ({
        data: { sendHighlightedChatMessage: { balance: null, error: { code: 'INSUFFICIENT_BITS' } } },
      }),
    })
    expect(await send('1', 'hi', null, null)).toEqual({ error: 'INSUFFICIENT_BITS' })
  })

  test('proxy throw → raw fetch fallback still delivers', async () => {
    let fetched = false
    const send = makeSender({
      gqlProxy: async () => {
        throw new Error('no hash')
      },
      fetchImpl: async () => {
        fetched = true
        return { ok: true, json: async () => ({ data: { sendHighlightedChatMessage: { balance: 400, error: null } } }) }
      },
    })
    const r = await send('1', 'hi', null, null)
    expect(fetched).toBe(true)
    expect(r).toEqual({ ok: true, balance: 400 })
  })

  test('raw fetch HTTP error → {error HTTP nnn}', async () => {
    const send = makeSender({
      gqlProxy: async () => {
        throw new Error('boom')
      },
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    })
    expect(await send('1', 'hi', null, null)).toEqual({ error: 'HTTP 503' })
  })

  test('kill switch (disabled includes highlight_send) refuses without spending', async () => {
    let proxyCalled = false
    const send = makeSender({
      health: { disabled: ['highlight_send'] },
      gqlProxy: async () => {
        proxyCalled = true
        return {}
      },
    })
    expect(await send('1', 'hi', null, null)).toEqual({ error: 'highlight disabled by server' })
    expect(proxyCalled).toBe(false)
  })

  test('global kill flag also refuses', async () => {
    const send = makeSender({ health: { kill: true } })
    expect((await send('1', 'hi', null, null)).error).toBe('highlight disabled by server')
  })

  test('not logged in → refuses before any network', async () => {
    let proxyCalled = false
    const send = makeSender({
      token: null,
      gqlProxy: async () => {
        proxyCalled = true
        return {}
      },
    })
    expect(await send('1', 'hi', null, null)).toEqual({ error: 'not logged in' })
    expect(proxyCalled).toBe(false)
  })

  test('missing channelId → refuses (no malformed spend)', async () => {
    const send = makeSender()
    expect(await send('', 'hi', null, null)).toEqual({ error: 'channel not resolved' })
  })
})
