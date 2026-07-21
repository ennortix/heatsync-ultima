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

// ─── Kick side ──────────────────────────────────────────────────────────────
// Route found read-only: GET /api/v1/chatrooms/<id> answers 405 "Supported
// methods: PUT". Read-back oracle: GET /api/v2/channels/<slug>/chatroom, whose
// live shape is { slow_mode:{enabled,message_interval},
// followers_mode:{enabled,min_duration}, subscribers_mode:{enabled},
// emotes_mode:{enabled} }. Body mirrors it; read-back keeps a wrong guess honest.
describe('kick chat modes', () => {
  const KICK = readFileSync(join(ROOT, 'src', 'multichat', 'kick-send.js'), 'utf8')
  const api = new Function(`
    ${KICK.slice(KICK.indexOf('const KICK_CHAT_MODE_KEYS'), KICK.indexOf('async function setKickChatMode'))}
    return { kickChatModeBody, kickChatModeMatches }
  `)()

  test('slow on carries seconds', () => {
    expect(api.kickChatModeBody('slow', 10)).toEqual({ slow_mode: { enabled: true, message_interval: 10 } })
  })
  test('slow off disables', () => {
    expect(api.kickChatModeBody('slow', 0)).toEqual({ slow_mode: { enabled: false, message_interval: 0 } })
  })
  test('followers off maps twitch -1 onto kick enabled:false', () => {
    expect(api.kickChatModeBody('followers', -1)).toEqual({ followers_mode: { enabled: false, min_duration: 0 } })
  })
  test('followers 0 is ON with no age gate, not off', () => {
    expect(api.kickChatModeBody('followers', 0)).toEqual({ followers_mode: { enabled: true, min_duration: 0 } })
  })
  test('boolean modes', () => {
    expect(api.kickChatModeBody('emoteonly', true)).toEqual({ emotes_mode: { enabled: true } })
    expect(api.kickChatModeBody('subscribers', false)).toEqual({ subscribers_mode: { enabled: false } })
  })
  test('unique-chat has no kick equivalent', () => {
    expect(api.kickChatModeBody('unique', true)).toBeNull()
  })

  // Shapes below are copied from a real live read of kick.com/mellen.
  const LIVE_OFF = {
    id: 84407,
    slow_mode: { enabled: false, message_interval: 0 },
    subscribers_mode: { enabled: false },
    followers_mode: { enabled: false, min_duration: 0 },
    emotes_mode: { enabled: false },
  }
  test('confirms against the real read shape', () => {
    expect(api.kickChatModeMatches('slow', 0, LIVE_OFF)).toBe(true)
    expect(api.kickChatModeMatches('slow', 10, LIVE_OFF)).toBe(false)
    expect(api.kickChatModeMatches('followers', -1, LIVE_OFF)).toBe(true)
    expect(api.kickChatModeMatches('followers', 0, LIVE_OFF)).toBe(false)
    expect(api.kickChatModeMatches('emoteonly', false, LIVE_OFF)).toBe(true)
    expect(api.kickChatModeMatches('emoteonly', true, LIVE_OFF)).toBe(false)
  })
  test('slow on confirms only at the right interval', () => {
    const on = { ...LIVE_OFF, slow_mode: { enabled: true, message_interval: 10 } }
    expect(api.kickChatModeMatches('slow', 10, on)).toBe(true)
    expect(api.kickChatModeMatches('slow', 30, on)).toBe(false)
  })
  test('a missing node never counts as a match', () => {
    expect(api.kickChatModeMatches('slow', 0, {})).toBe(false)
    expect(api.kickChatModeMatches('emoteonly', false, null)).toBe(false)
  })
  test('setKickChatMode only reports ok after a confirming read', () => {
    const fn = KICK.slice(KICK.indexOf('async function setKickChatMode'))
    const idx = fn.indexOf('ok: true')
    expect(fn.slice(0, idx)).toContain('kickChatModeMatches')
    expect(fn).toContain('kick did not apply it')
  })
  test('composer refuses unique-chat on a kick-only channel instead of no-oping', () => {
    expect(INPUT).toContain('mc_input_mode_kick_unsupported')
    expect(INPUT).toContain("KICK_MODE_CMDS = new Set(['slow', 'followers', 'subscribers', 'emoteonly'])")
  })
})
