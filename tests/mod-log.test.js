import { expect, test } from 'bun:test'
import { isModNotice, MOD_NOTICE_TYPES, modLogEntryFromNotice, pushModLogEntry } from '../src/multichat/mod-log.js'

function notice(overrides = {}) {
  return {
    type: 'notice',
    noticeType: 'ban_success',
    targetUser: 'Bob',
    channel: 'AlphaChan',
    banDuration: 0,
    systemMsg: 'mod banned Bob',
    time: 1000,
    id: 'n1',
    ...overrides,
  }
}

// ── isModNotice ───────────────────────────────────────────────────────────
test('isModNotice: true only for notice type + a mod noticeType', () => {
  expect(isModNotice(notice())).toBe(true)
  expect(isModNotice(notice({ noticeType: 'timeout_success' }))).toBe(true)
  expect(isModNotice(notice({ noticeType: 'delete_message_success' }))).toBe(true)
  expect(isModNotice(notice({ type: 'privmsg' }))).toBe(false)
  expect(isModNotice(notice({ noticeType: 'sub' }))).toBe(false)
  expect(isModNotice(null)).toBe(false)
  expect(isModNotice(undefined)).toBe(false)
  expect(isModNotice({})).toBe(false)
})

test('MOD_NOTICE_TYPES covers all four mod actions (+ untimeout)', () => {
  for (const t of ['ban_success', 'timeout_success', 'unban_success', 'untimeout_success', 'delete_message_success']) {
    expect(MOD_NOTICE_TYPES.has(t)).toBe(true)
  }
})

// ── modLogEntryFromNotice ─────────────────────────────────────────────────
test('modLogEntryFromNotice: maps noticeType → action', () => {
  expect(modLogEntryFromNotice(notice({ noticeType: 'ban_success' })).action).toBe('ban')
  expect(modLogEntryFromNotice(notice({ noticeType: 'timeout_success' })).action).toBe('timeout')
  expect(modLogEntryFromNotice(notice({ noticeType: 'unban_success' })).action).toBe('unban')
  expect(modLogEntryFromNotice(notice({ noticeType: 'untimeout_success' })).action).toBe('untimeout')
  expect(modLogEntryFromNotice(notice({ noticeType: 'delete_message_success' })).action).toBe('delete')
})

test('modLogEntryFromNotice: lowercases target + channel, carries fields', () => {
  const e = modLogEntryFromNotice(notice({ noticeType: 'timeout_success', banDuration: 600, platform: 'kick' }))
  expect(e.target).toBe('bob')
  expect(e.channel).toBe('alphachan')
  expect(e.durationSec).toBe(600)
  expect(e.platform).toBe('kick')
  expect(e.text).toBe('mod banned Bob')
  expect(e.time).toBe(1000)
  expect(e.id).toBe('n1')
})

test('modLogEntryFromNotice: synthesizes a stable id when msg.id is absent', () => {
  const e = modLogEntryFromNotice(notice({ id: undefined }))
  expect(e.id).toBe('ban_success:alphachan:bob:1000')
})

test('modLogEntryFromNotice: returns null for non-mod messages', () => {
  expect(modLogEntryFromNotice(notice({ type: 'privmsg' }))).toBeNull()
  expect(modLogEntryFromNotice(notice({ noticeType: 'sub' }))).toBeNull()
  expect(modLogEntryFromNotice(null)).toBeNull()
})

test('modLogEntryFromNotice: defaults platform to twitch, duration to 0', () => {
  const e = modLogEntryFromNotice(notice({ platform: undefined, banDuration: undefined }))
  expect(e.platform).toBe('twitch')
  expect(e.durationSec).toBe(0)
})

// ── pushModLogEntry ───────────────────────────────────────────────────────
test('pushModLogEntry: appends entries', () => {
  const log = []
  pushModLogEntry(log, modLogEntryFromNotice(notice({ id: 'a' })))
  pushModLogEntry(log, modLogEntryFromNotice(notice({ id: 'b' })))
  expect(log.map((e) => e.id)).toEqual(['a', 'b'])
})

test('pushModLogEntry: dedupes by id (last-id short-circuit + scan)', () => {
  const log = []
  pushModLogEntry(log, modLogEntryFromNotice(notice({ id: 'a' })))
  pushModLogEntry(log, modLogEntryFromNotice(notice({ id: 'a' }))) // consecutive dup
  pushModLogEntry(log, modLogEntryFromNotice(notice({ id: 'b' })))
  pushModLogEntry(log, modLogEntryFromNotice(notice({ id: 'a' }))) // non-consecutive dup
  expect(log.map((e) => e.id)).toEqual(['a', 'b'])
})

test('pushModLogEntry: null entry is a no-op', () => {
  const log = []
  pushModLogEntry(log, null)
  pushModLogEntry(log, modLogEntryFromNotice(notice({ type: 'privmsg' }))) // returns null
  expect(log.length).toBe(0)
})

test('pushModLogEntry: caps at max, trimming oldest first', () => {
  const log = []
  for (let i = 0; i < 10; i++) pushModLogEntry(log, modLogEntryFromNotice(notice({ id: `e${i}` })), 5)
  expect(log.length).toBe(5)
  expect(log[0].id).toBe('e5')
  expect(log[4].id).toBe('e9')
})
