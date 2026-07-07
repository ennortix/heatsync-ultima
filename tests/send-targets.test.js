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
  const fn = new Function(`${src}; return { resolveSendTargets, nextSendTargets }`)
  return fn()
}

const { resolveSendTargets, nextSendTargets } = loadSendTargets()

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
  expect(nextSendTargets({ twitch: false, kick: true }, { twitch: true, kick: true, youtube: false }, 'kick', false)).toBeNull()
})

test('nextSendTargets ignores a toggle on a platform that is not linked', () => {
  expect(nextSendTargets({ twitch: true }, { twitch: true, kick: false, youtube: false }, 'kick', true)).toEqual({
    twitch: true,
  })
})

test('nextSendTargets allows re-enabling a previously disabled platform', () => {
  expect(nextSendTargets({ twitch: false, kick: true }, { twitch: true, kick: true, youtube: false }, 'twitch', true)).toEqual({
    twitch: true,
    kick: true,
  })
})
