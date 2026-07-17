// automod-queue.js pure mappers — twitch AutoMod hold payload → row model,
// resolution status → display text, and the dedupe/escape helpers that back
// them. Same extraction technique as tests/kick-native-tap.test.js: pull the
// function source directly out of the real file (not a hand-copied fixture)
// so drift in the shipped code fails the test instead of the test silently
// testing a stale copy.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'automod-queue.js'), 'utf8')
const UTILS_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'lib', 'utils.js'), 'utf8')

function extractFn(source, name) {
  const marker = `function ${name}(`
  const start = source.indexOf(marker)
  if (start === -1) throw new Error(`extractFn: "${name}" not found — source drifted, update this test`)
  const end = source.indexOf('\n}', start)
  if (end === -1) throw new Error(`extractFn: "${name}" has no closing brace`)
  return source.slice(start, end + 2)
}

function extractConst(source, name) {
  const re = new RegExp(`const ${name}\\s*=[^\\n]+`)
  const m = source.match(re)
  if (!m) throw new Error(`extractConst: "${name}" not found — source drifted, update this test`)
  return m[0]
}

const {
  automodHoldToRowModel,
  automodReasonChipText,
  automodStatusText,
  buildAutomodHoldContentHtml,
  shouldProcessAutomodHold,
} = new Function(
  `${extractConst(SRC, 'AUTOMOD_HOLD_DEDUPE_TTL_MS')}
${extractFn(UTILS_SRC, 'escapeHtml')}
${extractFn(SRC, 'automodHoldToRowModel')}
${extractFn(SRC, 'automodReasonChipText')}
${extractFn(SRC, 'automodStatusText')}
${extractFn(SRC, 'buildAutomodHoldContentHtml')}
${extractFn(SRC, 'shouldProcessAutomodHold')}
return { automodHoldToRowModel, automodReasonChipText, automodStatusText, buildAutomodHoldContentHtml, shouldProcessAutomodHold }`,
)()

describe('automodHoldToRowModel', () => {
  const basePayload = {
    broadcasterId: '123',
    broadcasterLogin: 'SomeStreamer',
    msgId: 'abc-123',
    senderId: '456',
    senderLogin: 'Chatter1',
    senderName: 'Chatter1',
    text: 'hello world',
    heldAt: 1752700000000,
    reason: 'automod',
    category: 'profanity',
    level: 2,
    terms: null,
  }

  test('maps a full automod hold', () => {
    const row = automodHoldToRowModel(basePayload)
    expect(row).toEqual({
      type: 'automod-hold',
      msgId: 'abc-123',
      broadcasterId: '123',
      broadcasterLogin: 'somestreamer',
      senderId: '456',
      senderLogin: 'chatter1',
      senderName: 'Chatter1',
      text: 'hello world',
      heldAt: 1752700000000,
      reason: 'automod',
      category: 'profanity',
      level: 2,
      terms: null,
      status: 'pending',
      resolvedBy: null,
      errorText: null,
      id: 'automod-abc-123',
      time: 1752700000000,
      user: 'Chatter1',
      channel: 'somestreamer',
      platform: 'twitch',
    })
  })

  test('blocked_term reason keeps and lowercases nothing about terms, caps at 10', () => {
    const terms = Array.from({ length: 15 }, (_, i) => `term${i}`)
    const row = automodHoldToRowModel({ ...basePayload, reason: 'blocked_term', terms })
    expect(row.reason).toBe('blocked_term')
    expect(row.terms).toHaveLength(10)
    expect(row.terms[0]).toBe('term0')
  })

  test('unrecognized reason falls back to automod', () => {
    const row = automodHoldToRowModel({ ...basePayload, reason: 'something_else' })
    expect(row.reason).toBe('automod')
  })

  test('null category and no terms is preserved as null (not empty string/array)', () => {
    const row = automodHoldToRowModel({ ...basePayload, category: null, terms: [] })
    expect(row.category).toBeNull()
    expect(row.terms).toBeNull()
  })

  test('missing senderName falls back to senderLogin', () => {
    const row = automodHoldToRowModel({ ...basePayload, senderName: '' })
    expect(row.senderName).toBe('Chatter1')
    expect(row.user).toBe('Chatter1')
  })

  test('rejects payloads missing msgId or broadcasterLogin', () => {
    expect(automodHoldToRowModel({ ...basePayload, msgId: '' })).toBeNull()
    expect(automodHoldToRowModel({ ...basePayload, broadcasterLogin: '' })).toBeNull()
    expect(automodHoldToRowModel(null)).toBeNull()
    expect(automodHoldToRowModel('nope')).toBeNull()
  })
})

describe('automodReasonChipText', () => {
  test('blocked_term with a term', () => {
    expect(automodReasonChipText({ reason: 'blocked_term', terms: ['badword'] })).toBe('blocked term: badword')
  })
  test('blocked_term with no terms falls back to generic label', () => {
    expect(automodReasonChipText({ reason: 'blocked_term', terms: null })).toBe('blocked term')
  })
  test('automod with category + level', () => {
    expect(automodReasonChipText({ reason: 'automod', category: 'profanity', level: 3 })).toBe('profanity (level 3)')
  })
  test('automod with category but no level', () => {
    expect(automodReasonChipText({ reason: 'automod', category: 'swearing', level: 0 })).toBe('swearing')
  })
  test('automod with no category at all', () => {
    expect(automodReasonChipText({ reason: 'automod', category: null, level: 0 })).toBe('automod')
  })
  test('null row', () => {
    expect(automodReasonChipText(null)).toBe('')
  })
})

describe('automodStatusText', () => {
  test('approved with mod', () => {
    expect(automodStatusText('approved', 'somemod')).toBe('allowed by somemod')
  })
  test('denied with mod', () => {
    expect(automodStatusText('denied', 'somemod')).toBe('denied by somemod')
  })
  test('approved without mod', () => {
    expect(automodStatusText('approved', '')).toBe('allowed')
  })
  test('expired ignores modLogin', () => {
    expect(automodStatusText('expired', 'somemod')).toBe('expired')
  })
  test('unknown status returns empty string', () => {
    expect(automodStatusText('bogus', 'somemod')).toBe('')
  })
})

describe('buildAutomodHoldContentHtml — escaping', () => {
  test('escapes sender name, message text and terms-derived chip', () => {
    const row = {
      senderName: '<script>alert(1)</script>',
      text: '<img src=x onerror=alert(2)>',
      reason: 'blocked_term',
      terms: ['<b>bad</b>'],
    }
    const { senderHtml, textHtml, reasonHtml } = buildAutomodHoldContentHtml(row)
    expect(senderHtml).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(textHtml).toBe('&lt;img src=x onerror=alert(2)&gt;')
    expect(reasonHtml).toBe('blocked term: &lt;b&gt;bad&lt;/b&gt;')
    expect(senderHtml).not.toContain('<script>')
    expect(textHtml).not.toContain('<img')
  })

  test('escapes an automod category in the reason chip', () => {
    const row = { reason: 'automod', category: '<b>evil</b>', level: 0 }
    const { reasonHtml } = buildAutomodHoldContentHtml(row)
    expect(reasonHtml).toBe('&lt;b&gt;evil&lt;/b&gt;')
    expect(reasonHtml).not.toContain('<b>')
  })

  test('quotes and ampersands are escaped (attribute-breakout safety)', () => {
    const row = { senderName: `"onmouseover="x`, text: `a & b " c ' d`, reason: 'automod', category: null }
    const { senderHtml, textHtml } = buildAutomodHoldContentHtml(row)
    expect(senderHtml).toBe('&quot;onmouseover=&quot;x')
    expect(textHtml).toBe('a &amp; b &quot; c &#x27; d')
  })

  test('null row returns empty strings, not a throw', () => {
    expect(buildAutomodHoldContentHtml(null)).toEqual({ senderHtml: '', textHtml: '', reasonHtml: '' })
  })
})

describe('shouldProcessAutomodHold — dedupe TTL', () => {
  test('first sighting of a msgId is processed', () => {
    const seen = new Map()
    expect(shouldProcessAutomodHold(seen, 'm1', 1000)).toBe(true)
    expect(seen.get('m1')).toBe(1000)
  })

  test('repeat msgId within TTL is skipped', () => {
    const seen = new Map([['m1', 1000]])
    expect(shouldProcessAutomodHold(seen, 'm1', 1000 + 60_000)).toBe(false)
  })

  test('repeat msgId after TTL expiry is processed again and re-stamped', () => {
    const seen = new Map([['m1', 1000]])
    const now = 1000 + 10 * 60 * 1000 + 1
    expect(shouldProcessAutomodHold(seen, 'm1', now)).toBe(true)
    expect(seen.get('m1')).toBe(now)
  })

  test('prunes unrelated stale entries while checking a new one', () => {
    const seen = new Map([
      ['old1', 0],
      ['old2', 5000],
    ])
    const now = 10 * 60 * 1000 + 5001
    shouldProcessAutomodHold(seen, 'new', now)
    expect(seen.has('old1')).toBe(false)
    expect(seen.has('old2')).toBe(false)
    expect(seen.has('new')).toBe(true)
  })

  test('missing map or msgId returns false', () => {
    expect(shouldProcessAutomodHold(null, 'm1', 1000)).toBe(false)
    expect(shouldProcessAutomodHold(new Map(), '', 1000)).toBe(false)
  })
})
