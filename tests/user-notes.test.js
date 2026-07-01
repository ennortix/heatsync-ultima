import { afterEach, beforeEach, expect, test } from 'bun:test'
import {
  _hsNoteResetForTest,
  HS_NOTE_MAX,
  hsNoteDelete,
  hsNoteGet,
  hsNoteHas,
  hsNoteSave,
} from '../src/multichat/user-notes.js'

// The module resolves a chatter to their alias set via the (bundle-global)
// identity helpers. In tests we inject them on globalThis to simulate the
// cross-platform identity graph, and clear them so files stay order-independent.
function setIdentity(map) {
  // map: primaryHandle -> full lowercased alias array
  const lookup = (u) => {
    const k = String(u).toLowerCase()
    for (const [, aliases] of Object.entries(map)) {
      if (aliases.includes(k)) return aliases
    }
    return [k]
  }
  globalThis.getUserAliases = (u) => lookup(u)
  globalThis.expandUserAliases = async (u) => lookup(u)
}

beforeEach(() => {
  _hsNoteResetForTest()
  globalThis.getUserAliases = undefined
  globalThis.expandUserAliases = undefined
})
afterEach(() => {
  globalThis.getUserAliases = undefined
  globalThis.expandUserAliases = undefined
})

test('save + get roundtrip (single handle, no identity graph)', async () => {
  await hsNoteSave('Bob', 'twitch', 'greifer, watch him')
  const n = hsNoteGet('bob', 'twitch')
  expect(n?.text).toBe('greifer, watch him')
  expect(hsNoteHas('bob', 'twitch')).toBe(true)
})

test('no note → get null, has false', () => {
  expect(hsNoteGet('nobody', 'twitch')).toBeNull()
  expect(hsNoteHas('nobody', 'twitch')).toBe(false)
})

test('note follows a person across platforms via the alias graph', async () => {
  setIdentity({ person: ['bob', 'bob_kick', 'bobtube'] })
  await hsNoteSave('bob', 'twitch', 'same guy everywhere')
  // Looked up from a DIFFERENT platform handle → same note.
  expect(hsNoteGet('bob_kick', 'kick')?.text).toBe('same guy everywhere')
  expect(hsNoteGet('bobtube', 'youtube')?.text).toBe('same guy everywhere')
  expect(hsNoteHas('bob_kick', 'kick')).toBe(true)
})

test('notes made from two platforms merge to one canonical record', async () => {
  // First noted before the graph linked them (only self-alias known).
  await hsNoteSave('bob', 'twitch', 'first')
  // Later the identity graph links the handles; a re-save from kick must not fork.
  setIdentity({ person: ['bob', 'bob_kick'] })
  await hsNoteSave('bob_kick', 'kick', 'updated')
  expect(hsNoteGet('bob', 'twitch')?.text).toBe('updated')
  expect(hsNoteGet('bob_kick', 'kick')?.text).toBe('updated')
})

test('empty / whitespace text deletes the note', async () => {
  await hsNoteSave('bob', 'twitch', 'temp')
  expect(hsNoteHas('bob', 'twitch')).toBe(true)
  await hsNoteSave('bob', 'twitch', '   ')
  expect(hsNoteGet('bob', 'twitch')).toBeNull()
})

test('delete removes across every alias', async () => {
  setIdentity({ person: ['bob', 'bob_kick'] })
  await hsNoteSave('bob', 'twitch', 'gone soon')
  await hsNoteDelete('bob_kick', 'kick')
  expect(hsNoteGet('bob', 'twitch')).toBeNull()
  expect(hsNoteGet('bob_kick', 'kick')).toBeNull()
})

test('text is trimmed and capped at HS_NOTE_MAX', async () => {
  await hsNoteSave('bob', 'twitch', '  padded  ')
  expect(hsNoteGet('bob', 'twitch')?.text).toBe('padded')
  await hsNoteSave('big', 'twitch', 'a'.repeat(HS_NOTE_MAX + 500))
  expect(hsNoteGet('big', 'twitch')?.text.length).toBe(HS_NOTE_MAX)
})

test('updatedAt is recorded (explicit clock for determinism)', async () => {
  await hsNoteSave('bob', 'twitch', 'stamped', 12345)
  expect(hsNoteGet('bob', 'twitch')?.updatedAt).toBe(12345)
})

test('save is case-insensitive on the handle', async () => {
  await hsNoteSave('BoB', 'twitch', 'mixedcase')
  expect(hsNoteGet('bob', 'twitch')?.text).toBe('mixedcase')
  expect(hsNoteGet('BOB', 'twitch')?.text).toBe('mixedcase')
})
