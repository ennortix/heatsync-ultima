import { expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * resolveSendTargets / nextSendTargets (src/multichat/send-targets.js).
 *
 * The file has no import/export — it's concatenated into the multichat
 * bundle (see build.js MULTICHAT_MODULES) as plain global function
 * declarations, same rationale as sent-echo.test.js / tab-complete-order.test.js.
 * Loaded here via new Function so the test exercises the real source.
 */
function loadSendTargets() {
  const src = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'send-targets.js'), 'utf8')
  const fn = new Function(
    `${src}; return { resolveSendTargets, nextSendTargets, extractYoutubeVideoId, youtubeSendErrorMessage }`
  )
  return fn()
}

const { resolveSendTargets, nextSendTargets, extractYoutubeVideoId, youtubeSendErrorMessage } = loadSendTargets()

test('resolveSendTargets defaults every linked platform on when absent', () => {
  expect(resolveSendTargets(undefined, { twitch: true, kick: true, youtube: false })).toEqual({
    twitch: true,
    kick: true,
    youtube: false,
  })
})

test('resolveSendTargets defaults every linked platform on when null', () => {
  expect(resolveSendTargets(null, { twitch: true, kick: false, youtube: true })).toEqual({
    twitch: true,
    kick: false,
    youtube: true,
  })
})

test('resolveSendTargets respects an explicit false on a linked platform', () => {
  expect(resolveSendTargets({ kick: false }, { twitch: true, kick: true, youtube: false })).toEqual({
    twitch: true,
    kick: false,
    youtube: false,
  })
})

test('resolveSendTargets cannot enable a platform that is not linked', () => {
  expect(resolveSendTargets({ youtube: true }, { twitch: true, kick: false, youtube: false })).toEqual({
    twitch: true,
    kick: false,
    youtube: false,
  })
})

test('resolveSendTargets falls back to all-linked-on if resolution would disable every target', () => {
  expect(resolveSendTargets({ twitch: false, kick: false }, { twitch: true, kick: true, youtube: false })).toEqual({
    twitch: true,
    kick: true,
    youtube: false,
  })
})

test('nextSendTargets seeds from linked platforms on first toggle', () => {
  expect(nextSendTargets(undefined, { twitch: true, kick: true, youtube: false }, 'twitch', false)).toEqual({
    twitch: false,
    kick: true,
  })
})

test('nextSendTargets refuses to disable the last active linked target', () => {
  expect(
    nextSendTargets({ twitch: false, kick: true }, { twitch: true, kick: true, youtube: false }, 'kick', false),
  ).toBeNull()
})

test('nextSendTargets ignores a toggle on a platform that is not linked', () => {
  expect(nextSendTargets({ twitch: true }, { twitch: true, kick: false, youtube: false }, 'kick', true)).toEqual({
    twitch: true,
  })
})

test('nextSendTargets allows re-enabling a previously disabled platform', () => {
  expect(
    nextSendTargets({ twitch: false, kick: true }, { twitch: true, kick: true, youtube: false }, 'twitch', true),
  ).toEqual({
    twitch: true,
    kick: true,
  })
})

// ─── extractYoutubeVideoId ────────────────────────────────────────────────────
// Only a CONCRETE 11-char video id may come back — a channel-only url must
// yield '' so background never auto-opens (and sends to) the wrong stream.

test('extractYoutubeVideoId pulls id from watch?v= url', () => {
  expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
})

test('extractYoutubeVideoId pulls id from watch url with extra params', () => {
  expect(extractYoutubeVideoId('https://www.youtube.com/watch?list=RD&v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ')
})

test('extractYoutubeVideoId handles /live/<id>, youtu.be, /shorts/, /embed/', () => {
  expect(extractYoutubeVideoId('https://www.youtube.com/live/abcdefghijk')).toBe('abcdefghijk')
  expect(extractYoutubeVideoId('https://youtu.be/abcdefghijk')).toBe('abcdefghijk')
  expect(extractYoutubeVideoId('https://www.youtube.com/shorts/abcdefghijk')).toBe('abcdefghijk')
  expect(extractYoutubeVideoId('https://www.youtube.com/embed/abcdefghijk')).toBe('abcdefghijk')
})

test('extractYoutubeVideoId returns "" for channel-only urls (no fixed stream)', () => {
  expect(extractYoutubeVideoId('https://www.youtube.com/@somehandle')).toBe('')
  expect(extractYoutubeVideoId('https://www.youtube.com/@somehandle/live')).toBe('')
  expect(extractYoutubeVideoId('https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv')).toBe('')
  expect(extractYoutubeVideoId('')).toBe('')
  expect(extractYoutubeVideoId(null)).toBe('')
  expect(extractYoutubeVideoId(undefined)).toBe('')
})

test('extractYoutubeVideoId rejects too-short / too-long ids at the boundary', () => {
  expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=tooshort')).toBe('')
  // 12+ id chars: the strict-boundary regex refuses a partial match
  expect(extractYoutubeVideoId('https://www.youtube.com/live/abcdefghijklmnop')).toBe('')
})

// ─── youtubeSendErrorMessage ──────────────────────────────────────────────────

test('youtubeSendErrorMessage maps known codes to actionable lines', () => {
  expect(youtubeSendErrorMessage('no_youtube_tab')).toBe('open the youtube stream to send')
  expect(youtubeSendErrorMessage('no_video')).toBe('open the youtube stream to send')
  expect(youtubeSendErrorMessage('chat_disabled')).toBe('log into youtube to send')
  expect(youtubeSendErrorMessage('no_input')).toBe('youtube chat still loading — try again')
  expect(youtubeSendErrorMessage('bridge_timeout')).toBe('couldn’t reach youtube chat — try again')
})

test('youtubeSendErrorMessage falls back for unknown/undefined codes', () => {
  expect(youtubeSendErrorMessage('send_failed')).toBe('youtube send failed')
  expect(youtubeSendErrorMessage(undefined)).toBe('youtube send failed')
})
