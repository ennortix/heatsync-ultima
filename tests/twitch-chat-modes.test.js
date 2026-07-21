// Twitch chat modes all go through ONE mutation — updateChatSettings. Schema-
// probed live 2026-07-21: the field exists, its input type is
// UpdateChatSettingsInput!, channelID is a required String!.
//
// The load-bearing fact: twitch's GQL silently ACCEPTS unknown input fields, so
// a typo'd field name returns no error and changes nothing. A blind "didn't
// error ⇒ success" would therefore lie on every mod command. setTwitchChatMode
// reads the mode back and only claims success when the channel really changed.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const API = readFileSync(join(ROOT, 'src', 'multichat', 'twitch-api.js'), 'utf8')
const INPUT = readFileSync(join(ROOT, 'src', 'multichat', 'input.js'), 'utf8')
const EN = JSON.parse(readFileSync(join(ROOT, 'src', '_locales', 'en', 'messages.json'), 'utf8'))

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`)
  const end = src.indexOf('\n}', start)
  return src.slice(start, end + 2)
}

const matches = new Function(`${extractFn(API, '_twitchChatModeMatches')}\nreturn _twitchChatModeMatches`)()

describe('read-back comparison', () => {
  // Duration modes report "off" as null, so our off encodings must accept null.
  test('followers off (-1) matches a null read-back', () => {
    expect(matches('followers', -1, null)).toBe(true)
  })
  test('followers "any follower" (0) needs a real 0, not null', () => {
    expect(matches('followers', 0, 0)).toBe(true)
    expect(matches('followers', 0, null)).toBe(false)
  })
  test('followers N minutes must match exactly', () => {
    expect(matches('followers', 30, 30)).toBe(true)
    expect(matches('followers', 30, 10)).toBe(false)
  })
  test('slow off (0) matches null or 0', () => {
    expect(matches('slow', 0, null)).toBe(true)
    expect(matches('slow', 0, 0)).toBe(true)
  })
  test('slow N seconds must match exactly', () => {
    expect(matches('slow', 10, 10)).toBe(true)
    expect(matches('slow', 10, null)).toBe(false)
  })
  test('boolean modes compare truthiness', () => {
    for (const m of ['emoteonly', 'subscribers', 'unique']) {
      expect(matches(m, true, true)).toBe(true)
      expect(matches(m, false, false)).toBe(true)
      expect(matches(m, true, false)).toBe(false)
      // the silent-accept failure mode: asked for on, channel still off
      expect(matches(m, true, null)).toBe(false)
    }
  })
})

describe('mutation shape', () => {
  const fn = extractFn(API, 'setTwitchChatMode')
  test('uses the schema-verified mutation and input type', () => {
    expect(fn).toContain('$input: UpdateChatSettingsInput!')
    expect(fn).toContain('updateChatSettings(input: $input)')
  })
  test('never returns ok without a matching read-back', () => {
    // the only `ok: true` in the function is inside the verification loop
    const okLines = fn.split('\n').filter((l) => l.includes('ok: true'))
    expect(okLines).toHaveLength(1)
    const idx = fn.indexOf('ok: true')
    expect(fn.slice(0, idx)).toContain('_twitchChatModeMatches')
  })
  test('a silent no-op is reported as failure, not success', () => {
    expect(fn).toContain('twitch did not apply it')
  })
  test('resolve failures keep the transient distinction', () => {
    expect(fn).toContain('twitch unreachable — try again')
  })
  test('all five modes have an input field', () => {
    const map = new Function(
      `${API.slice(API.indexOf('const TWITCH_CHAT_MODE_FIELDS'), API.indexOf('}', API.indexOf('const TWITCH_CHAT_MODE_FIELDS')) + 1)}\nreturn TWITCH_CHAT_MODE_FIELDS`,
    )()
    expect(Object.keys(map).sort()).toEqual(['emoteonly', 'followers', 'slow', 'subscribers', 'unique'])
  })
  test('the followers wrapper still exists for its old callers', () => {
    expect(API).toContain('async function setTwitchFollowersMode(channelLogin, minutes)')
  })
})

describe('composer wiring', () => {
  test('the "not wired" stub is gone', () => {
    expect(INPUT).not.toContain('mc_input_mode_not_wired')
  })
  test('every mode routes through setTwitchChatMode', () => {
    expect(INPUT).toContain('setTwitchChatMode(twitchTarget, cmd, value)')
  })
  test('copy keys exist in the default locale', () => {
    for (const k of [
      'mc_input_mode_on',
      'mc_input_mode_off',
      'mc_input_mode_on_dur',
      'mc_input_mode_failed',
      'mc_input_usage_mode',
    ]) {
      expect(EN[k]?.message, k).toBeTruthy()
    }
  })
})
