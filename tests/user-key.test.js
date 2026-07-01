import { expect, test } from 'bun:test'
import { userKey, userSetMatches } from '../src/lib/user-key.js'

test('userKey: platform-scoped, lowercased, @-stripped', () => {
  expect(userKey('Alice', 'twitch')).toBe('twitch:alice')
  expect(userKey('@Bob', 'youtube')).toBe('youtube:bob')
  expect(userKey('CarolCat', 'kick')).toBe('kick:carolcat')
})

test('userKey: null/empty platform → bare (legacy-global) key', () => {
  expect(userKey('alice', null)).toBe('alice')
  expect(userKey('alice', undefined)).toBe('alice')
  expect(userKey('alice', '')).toBe('alice')
})

test('userKey: empty/nullish username → empty string', () => {
  expect(userKey('', 'twitch')).toBe('')
  expect(userKey(null, 'twitch')).toBe('')
  expect(userKey(undefined, 'twitch')).toBe('')
})

test('no cross-platform collision: blocking twitch alice does NOT match kick alice', () => {
  const set = new Set([userKey('alice', 'twitch')])
  expect(userSetMatches(set, 'alice', 'twitch')).toBe(true)
  expect(userSetMatches(set, 'alice', 'kick')).toBe(false) // the bug this fixes
  expect(userSetMatches(set, 'alice', 'youtube')).toBe(false)
})

test('legacy bare entry matches on every platform (backward compat, no migration)', () => {
  const set = new Set(['alice']) // pre-namespace stored value
  expect(userSetMatches(set, 'alice', 'twitch')).toBe(true)
  expect(userSetMatches(set, 'alice', 'kick')).toBe(true)
  expect(userSetMatches(set, 'alice', null)).toBe(true)
})

test('linked cross-platform identity matches via aliasKeys', () => {
  // kick "alice" is 7TV-linked to twitch "alicetw"; blocking her fanned out to
  // both namespaced keys. A check on the kick side supplies the twitch alias key.
  const set = new Set([userKey('alicetw', 'twitch')])
  expect(userSetMatches(set, 'alice', 'kick', [userKey('alicetw', 'twitch')])).toBe(true)
  // unrelated kick user with no linked identity is unaffected
  expect(userSetMatches(set, 'alice', 'kick', [userKey('alice', 'kick')])).toBe(false)
})

test('empty set / empty username → no match (hot-path short-circuit safe)', () => {
  expect(userSetMatches(new Set(), 'alice', 'twitch')).toBe(false)
  expect(userSetMatches(null, 'alice', 'twitch')).toBe(false)
  expect(userSetMatches(new Set(['twitch:alice']), '', 'twitch')).toBe(false)
})

test('@-prefixed lookup normalizes to stored key (youtube handles)', () => {
  const set = new Set([userKey('bob', 'youtube')])
  expect(userSetMatches(set, '@bob', 'youtube')).toBe(true)
  expect(userSetMatches(set, 'bob', 'youtube')).toBe(true)
})

// Block-specific scenarios (overlay → content.js propagation)

test('block scenario: overlay block (twitch:alice) hides message on twitch content.js', () => {
  // Overlay sends block_user with namespaced key; content.js stores it and checks
  // via userSetMatches with the page platform.
  const blockedUsers = new Set([userKey('alice', 'twitch')]) // stored by content.js receiver
  const lowerUser = 'alice'
  const pagePlatform = 'twitch'
  expect(userSetMatches(blockedUsers, lowerUser, pagePlatform, [])).toBe(true)
})

test('block scenario: twitch block does NOT hide unrelated kick user of same name', () => {
  const blockedUsers = new Set([userKey('alice', 'twitch')])
  expect(userSetMatches(blockedUsers, 'alice', 'kick', [])).toBe(false)
})

test('block scenario: legacy bare block still hides on all platforms (global-match)', () => {
  const blockedUsers = new Set(['alice']) // pre-namespace entry from old storage
  expect(userSetMatches(blockedUsers, 'alice', 'twitch', [])).toBe(true)
  expect(userSetMatches(blockedUsers, 'alice', 'kick', [])).toBe(true)
})

test('mute scenario: overlay mute key (kick:bob) reaches kick native chat', () => {
  const mutedUsers = new Set([userKey('bob', 'kick')])
  expect(userSetMatches(mutedUsers, 'bob', 'kick', [])).toBe(true)
  expect(userSetMatches(mutedUsers, 'bob', 'twitch', [])).toBe(false)
})

test('unblock scenario: deleting namespaced key removes block', () => {
  const blockedUsers = new Set([userKey('alice', 'twitch')])
  blockedUsers.delete(userKey('alice', 'twitch'))
  expect(userSetMatches(blockedUsers, 'alice', 'twitch', [])).toBe(false)
})

test('legacy unblock: deleting both namespaced + bare clears pre-namespace entry', () => {
  const blockedUsers = new Set(['alice']) // legacy bare
  const key = userKey('alice', 'twitch')
  blockedUsers.delete(key) // namespaced delete → no-op on legacy
  blockedUsers.delete('alice') // bare delete → clears it
  expect(userSetMatches(blockedUsers, 'alice', 'twitch', [])).toBe(false)
})
