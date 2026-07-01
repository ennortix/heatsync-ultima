import { expect, test } from 'bun:test'
import { userKey, userSetMatches } from '../src/multichat/user-key.js'

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
