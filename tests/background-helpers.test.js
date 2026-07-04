/**
 * Unit tests for pure helpers embedded in chrome/background.js.
 *
 * background.js is NOT part of the src/ build pipeline — build.js copies it
 * into the package byte-for-byte (see build.js ~line 334), and it is a single
 * 10k-line non-ESM script that registers chrome.runtime.onMessage /
 * chrome.alarms listeners at the top level. It cannot be safely imported as a
 * module (doing so would require a large chrome.* stub harness and risks
 * false confidence from partially-stubbed init races), so per the task rules
 * it is not modified and not imported directly.
 *
 * A handful of its ~164 top-level functions are genuinely pure (or
 * near-pure, closing only over sibling constants also defined at top level)
 * and are NOT duplicated anywhere in src/ — unlike userKey/userSetMatches
 * and sanitizeUiSettings, which ARE canonically defined in src/lib/ and
 * already covered by tests/user-key.test.js + tests/sanitize-ui-settings.test.js
 * (background.js's copies are explicitly-commented duplicates for service-
 * worker bundling reasons, kept in sync by hand).
 *
 * For those background.js-only pure helpers (chKey/splitChKey composite key
 * round-trip, absUrl, sanitizeEmote/sanitizeEmoteList's CDN allowlist) this
 * file extracts their exact source text out of the real file via marker-
 * based slicing (never copy-pasted by hand) and evaluates it in an isolated
 * scope with `new Function`, mirroring the eval-harness pattern already used
 * in tests/cleanup.test.js and tests/error-reporter.test.js, and the same
 * marker-extraction technique build.js itself uses for the error-reporter
 * parity check. Every extractor throws loudly if its marker goes missing —
 * source drift fails the test suite instead of silently testing stale logic.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'

const BG_SRC = readFileSync(new URL('../chrome/background.js', import.meta.url), 'utf8')

/** Extract `function name(...) { ... }` up to its closing brace on its own line. */
function extractFn(name) {
  const marker = `function ${name}(`
  const start = BG_SRC.indexOf(marker)
  if (start === -1) {
    throw new Error(`extractFn: "${name}" not found in chrome/background.js — source drifted, update this test`)
  }
  const end = BG_SRC.indexOf('\n}', start)
  if (end === -1) throw new Error(`extractFn: "${name}" has no closing "\\n}" — source drifted, update this test`)
  return BG_SRC.slice(start, end + 2)
}

/** Extract a single-line `const NAME = ...` declaration. */
function extractConstLine(name) {
  const m = BG_SRC.match(new RegExp(`^const ${name}\\s*=.*$`, 'm'))
  if (!m) throw new Error(`extractConstLine: "${name}" not found in chrome/background.js`)
  return m[0]
}

/** Slice raw source between two literal markers (start inclusive, end exclusive). */
function sliceBetween(startMarker, endMarker) {
  const s = BG_SRC.indexOf(startMarker)
  if (s === -1) throw new Error(`sliceBetween: start marker not found: ${startMarker}`)
  const e = BG_SRC.indexOf(endMarker, s)
  if (e === -1) throw new Error(`sliceBetween: end marker not found: ${endMarker}`)
  return BG_SRC.slice(s, e)
}

// ── chKey / splitChKey ───────────────────────────────────────────────────────

const { chKey, splitChKey } = new Function(
  `${extractFn('chKey')}\n${extractFn('splitChKey')}\nreturn { chKey, splitChKey }`,
)()

describe('chKey (composite channelEmotesMap key)', () => {
  test('joins platform + lowercased channel with /', () => {
    expect(chKey('twitch', 'Alice')).toBe('twitch/alice')
  })
  test('defaults platform to "twitch" when falsy', () => {
    expect(chKey(null, 'Alice')).toBe('twitch/alice')
    expect(chKey('', 'Alice')).toBe('twitch/alice')
    expect(chKey(undefined, 'Alice')).toBe('twitch/alice')
  })
  test('defaults channel to empty string when falsy', () => {
    expect(chKey('kick', null)).toBe('kick/')
  })
  test('kick platform is preserved (not defaulted away)', () => {
    expect(chKey('kick', 'xqc')).toBe('kick/xqc')
  })
})

describe('splitChKey (inverse of chKey)', () => {
  test('splits platform/channel on the first slash', () => {
    expect(splitChKey('kick/xqc')).toEqual({ platform: 'kick', channel: 'xqc' })
  })
  test('round-trips through chKey for every platform', () => {
    for (const [platform, ch] of [
      ['twitch', 'alice'],
      ['kick', 'bob'],
      ['youtube', 'carol'],
    ]) {
      expect(splitChKey(chKey(platform, ch))).toEqual({ platform, channel: ch })
    }
  })
  test('a channel name that itself contains a slash only splits on the FIRST slash', () => {
    // real channel names can't contain slashes, but the split logic should still
    // be defensive: everything after the first slash is the channel, verbatim.
    expect(splitChKey('twitch/foo/bar')).toEqual({ platform: 'twitch', channel: 'foo/bar' })
  })
  test('no slash at all defaults to twitch with the whole string as channel', () => {
    expect(splitChKey('justachannel')).toEqual({ platform: 'twitch', channel: 'justachannel' })
  })
  test('non-string input is coerced to string first', () => {
    expect(splitChKey(123)).toEqual({ platform: 'twitch', channel: '123' })
  })
})

// ── absUrl ───────────────────────────────────────────────────────────────────

const { absUrl } = new Function(`${extractConstLine('API_URL')}\n${extractFn('absUrl')}\nreturn { absUrl }`)()

describe('absUrl (relative → absolute emote URL)', () => {
  test('relative path is prefixed with API_URL', () => {
    expect(absUrl('/uploads/foo.png')).toBe('https://heatsync.org/uploads/foo.png')
  })
  test('already-absolute URL passes through unchanged', () => {
    expect(absUrl('https://cdn.7tv.app/emote/x/1x.webp')).toBe('https://cdn.7tv.app/emote/x/1x.webp')
  })
  test('falsy input passes through unchanged (no crash on null/empty)', () => {
    expect(absUrl(null)).toBeNull()
    expect(absUrl('')).toBe('')
    expect(absUrl(undefined)).toBeUndefined()
  })
})

// ── sanitizeEmote / sanitizeEmoteList (CDN allowlist — security boundary) ───

const sanitizeEmoteSrc =
  sliceBetween('const EMOTE_CDN_PATTERN =', 'function sanitizeEmote(') +
  extractFn('sanitizeEmote') +
  '\n' +
  extractFn('sanitizeEmoteList') +
  '\nreturn { sanitizeEmote, sanitizeEmoteList }'
const { sanitizeEmote, sanitizeEmoteList } = new Function(sanitizeEmoteSrc)()

describe('sanitizeEmote (validates 3rd-party API emote objects before caching)', () => {
  test('valid emote from an allowlisted CDN passes through unchanged', () => {
    const e = { name: 'Kappa', url: 'https://cdn.7tv.app/emote/x/1x.webp' }
    expect(sanitizeEmote(e)).toBe(e)
  })
  test('every allowlisted CDN host is accepted', () => {
    const hosts = [
      'https://cdn.betterttv.net/e/1',
      'https://cdn.7tv.app/e/1',
      'https://cdn.frankerfacez.com/e/1',
      'https://static-cdn.jtvnw.net/e/1',
      'https://heatsync.org/e/1',
      'https://files.kick.com/e/1',
    ]
    for (const url of hosts) {
      expect(sanitizeEmote({ name: 'x', url })).not.toBeNull()
    }
  })
  test('rejects a non-allowlisted host (e.g. an attacker-controlled CDN)', () => {
    expect(sanitizeEmote({ name: 'Evil', url: 'https://evil.example.com/x.png' })).toBeNull()
  })
  test('rejects a host that merely CONTAINS an allowlisted substring (e.g. jtvnw.net.evil.com)', () => {
    expect(sanitizeEmote({ name: 'x', url: 'https://static-cdn.jtvnw.net.evil.com/x.png' })).toBeNull()
  })
  test('rejects non-https (protocol-relative or http downgrade)', () => {
    expect(sanitizeEmote({ name: 'x', url: 'http://cdn.7tv.app/e/1' })).toBeNull()
    expect(sanitizeEmote({ name: 'x', url: '//cdn.7tv.app/e/1' })).toBeNull()
  })
  test('rejects javascript: URLs outright (not an allowlisted host)', () => {
    expect(sanitizeEmote({ name: 'x', url: 'javascript:alert(1)' })).toBeNull()
  })
  test('rejects missing/non-string name or url', () => {
    expect(sanitizeEmote(null)).toBeNull()
    expect(sanitizeEmote({ url: 'https://cdn.7tv.app/e/1' })).toBeNull()
    expect(sanitizeEmote({ name: 'x' })).toBeNull()
    expect(sanitizeEmote({ name: 123, url: 'https://cdn.7tv.app/e/1' })).toBeNull()
  })
  test('rejects empty name', () => {
    expect(sanitizeEmote({ name: '', url: 'https://cdn.7tv.app/e/1' })).toBeNull()
  })
  test('rejects name longer than 100 chars', () => {
    expect(sanitizeEmote({ name: 'x'.repeat(101), url: 'https://cdn.7tv.app/e/1' })).toBeNull()
  })
  test('accepts name exactly 100 chars (boundary)', () => {
    expect(sanitizeEmote({ name: 'x'.repeat(100), url: 'https://cdn.7tv.app/e/1' })).not.toBeNull()
  })
})

describe('sanitizeEmoteList', () => {
  test('filters out invalid entries, keeps valid ones', () => {
    const list = [
      { name: 'Good', url: 'https://cdn.7tv.app/e/1' },
      { name: 'Bad', url: 'https://evil.example.com/x' },
      { name: '', url: 'https://cdn.7tv.app/e/2' },
    ]
    const out = sanitizeEmoteList(list)
    expect(out.length).toBe(1)
    expect(out[0].name).toBe('Good')
  })
  test('caps to MAX_EMOTES_PER_SOURCE (5000) — DoS guard on a malicious/buggy API response', () => {
    const huge = Array.from({ length: 6000 }, (_, i) => ({
      name: `e${i}`,
      url: 'https://cdn.7tv.app/e/1',
    }))
    expect(sanitizeEmoteList(huge).length).toBe(5000)
  })
  test('empty list → empty list', () => {
    expect(sanitizeEmoteList([])).toEqual([])
  })
})

// ── bgIrcParseLine / bgIrcRecordToExt: reply-parent-user-id parity ─────────
//
// background.js runs its OWN duplicate IRC-tag parser (bgIrcParseLine) and its
// own EventSub-record→ext converter (bgIrcRecordToExt) — separate from
// src/multichat/irc.js's parseIrcLine, which already threads
// reply-parent-user-id into replyTo.userId (see tests/irc-parser.test.js).
// These two background.js copies had drifted: both built a replyTo object
// that dropped the uid entirely, so a reply-context chip for a user unknown
// to knownUserIds at render time could never get data-uid, and so could never
// paint (live-verified: a.hs-mc-reply-user[data-uid] absent). Fixed by
// threading tags['reply-parent-user-id'] / rec.replyTo.userId through, same
// as parseIrcLine already does.

const { bgIrcParseLine, bgIrcRecordToExt } = new Function(
  `${extractConstLine('BG_IRC_COLOR_RE')}\n${extractFn('bgIrcParseTags')}\n${extractFn('bgIrcSanitizeColor')}\n${extractFn('bgIrcParseEmotesTag')}\n${extractFn('bgIrcParseLine')}\n${extractFn('bgIrcRecordToExt')}\nreturn { bgIrcParseLine, bgIrcRecordToExt }`,
)()

describe('bgIrcParseLine — reply-parent-user-id threading (background.js live IRC path)', () => {
  test('reply-parent tags build a replyTo object including userId', () => {
    const raw =
      '@display-name=Bob;reply-parent-display-name=Alice;reply-parent-msg-body=hello\\sthere;reply-parent-msg-id=m1;reply-parent-user-id=u1;reply-thread-parent-msg-id=t1 :bob!bob@bob.tmi.twitch.tv PRIVMSG #chan :reply text'
    const msg = bgIrcParseLine(raw, 'chan')
    expect(msg.replyTo).toEqual({
      user: 'Alice',
      text: 'hello there',
      id: 'm1',
      userId: 'u1',
      threadId: 't1',
    })
  })
  test('no reply-parent-user-id tag → replyTo.userId is empty string, never undefined', () => {
    const raw =
      '@display-name=Bob;reply-parent-display-name=Alice;reply-parent-msg-id=m1 :bob!bob@bob.tmi.twitch.tv PRIVMSG #chan :reply text'
    const msg = bgIrcParseLine(raw, 'chan')
    expect(msg.replyTo.userId).toBe('')
  })
  test('no reply tags at all → replyTo is null', () => {
    const raw = '@display-name=Bob :bob!bob@bob.tmi.twitch.tv PRIVMSG #chan :hi'
    expect(bgIrcParseLine(raw, 'chan').replyTo).toBeNull()
  })
})

// ── splitIncomingUiState (server ui-state fanout → sync vs overflow split) ──
//
// background.js's own duplicate of sanitizeUiSettings/UI_SYNC_BLOCKLIST/
// DEVICE_LOCAL_KEYS/OVERFLOW_MIRROR_KEYS/LARGE_KEY_SYNC_MAX (kept in parity
// with src/lib/utils.js by build.js's checkUiSyncBlocklistParity guard) feeds
// this splitter, used by the ui-state:update / settings:patch handlers to
// route large blocklist prefs (keywordHighlights/chatFilterRules) to their
// chrome.storage.local overflow keys instead of chrome.storage.sync.

const splitIncomingUiStateSrc =
  sliceBetween('const UI_SYNC_BLOCKLIST =', 'function splitIncomingUiState(') +
  extractFn('splitIncomingUiState') +
  '\nreturn { splitIncomingUiState }'
const { splitIncomingUiState } = new Function(splitIncomingUiStateSrc)()

describe('splitIncomingUiState', () => {
  test('ordinary sync-scope keys go to `sync`', () => {
    const { sync, overflow } = splitIncomingUiState({ zebra: true, timestamps: false })
    expect(sync).toEqual({ zebra: true, timestamps: false })
    expect(overflow).toEqual({})
  })

  test('keywordHighlights/chatFilterRules go to `overflow` under their mirror key names', () => {
    const { sync, overflow } = splitIncomingUiState({
      zebra: true,
      keywordHighlights: 'foo\nbar',
      chatFilterRules: '[]',
    })
    expect(sync).toEqual({ zebra: true })
    expect(overflow).toEqual({ keyword_highlights: 'foo\nbar', chat_filter_rules: '[]' })
  })

  test('platformFilters (device-local) is dropped entirely — not in sync or overflow', () => {
    const { sync, overflow } = splitIncomingUiState({ zebra: true, platformFilters: { tab1: { twitch: false } } })
    expect(sync).toEqual({ zebra: true })
    expect(overflow).toEqual({})
  })

  test('oversized large-key value is dropped, not adopted', () => {
    const { overflow } = splitIncomingUiState({ keywordHighlights: 'x'.repeat(32769) })
    expect(overflow).toEqual({})
  })

  test('value exactly at the 32768 cap is kept', () => {
    const { overflow } = splitIncomingUiState({ chatFilterRules: 'x'.repeat(32768) })
    expect(overflow).toEqual({ chat_filter_rules: 'x'.repeat(32768) })
  })

  test('non-object input returns empty sync/overflow (no throw)', () => {
    expect(splitIncomingUiState(null)).toEqual({ sync: {}, overflow: {} })
    expect(splitIncomingUiState('nope')).toEqual({ sync: {}, overflow: {} })
  })

  test('sync half is still sanitized (prototype pollution / numeric keys stripped)', () => {
    const { sync } = splitIncomingUiState({ zebra: true, __proto__: { evil: 1 }, 0: 'bad' })
    expect(Object.keys(sync)).toEqual(['zebra'])
  })
})

describe('bgIrcRecordToExt — reply-parent-user-id threading (server EventSub-relay path)', () => {
  test('rec.replyTo.userId is carried through to ext.replyTo.userId', () => {
    const ext = bgIrcRecordToExt(
      {
        type: 'privmsg',
        channel: 'chan',
        displayName: 'Bob',
        userId: '99',
        content: 'hi',
        replyTo: { username: 'Alice', content: 'parent text', messageId: 'm1', userId: 'u1', threadId: 't1' },
      },
      'chan',
    )
    expect(ext.replyTo).toEqual({ user: 'Alice', text: 'parent text', id: 'm1', userId: 'u1', threadId: 't1' })
  })
  test('rec.replyTo with no userId field → ext.replyTo.userId is empty string', () => {
    const ext = bgIrcRecordToExt(
      { type: 'privmsg', channel: 'chan', displayName: 'Bob', content: 'hi', replyTo: { username: 'Alice' } },
      'chan',
    )
    expect(ext.replyTo.userId).toBe('')
  })
  test('no rec.replyTo → ext.replyTo is null', () => {
    const ext = bgIrcRecordToExt({ type: 'privmsg', channel: 'chan', displayName: 'Bob', content: 'hi' }, 'chan')
    expect(ext.replyTo).toBeNull()
  })
})
