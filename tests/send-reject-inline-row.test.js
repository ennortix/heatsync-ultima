/**
 * Send-rejection NOTICEs must leave a PERSISTENT inline row, not just a toast
 * (src/multichat/auth-irc.js).
 *
 * Regression anchor (2026-07-20): twitch ate a send (automod / duplicate /
 * slow-mode class) and the only feedback was a ~2s toast — easy to miss, so
 * the message simply "never appeared" with no trace. The NOTICE branch now
 * also feeds the real tagged NOTICE line through parseIrcLine → _handleMsg
 * (the same path /testnotices raw uses), marked isSynthetic so it never
 * relays to the archive.
 *
 * parseIrcLine is exercised directly with a realistic tagged NOTICE to prove
 * the parse half; the wiring inside the socket line-loop is pinned at source
 * level (it's embedded in the reader loop, not separately callable).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AUTH_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'auth-irc.js'), 'utf8')
const IRC_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'irc.js'), 'utf8')

describe('parse half — a real tagged reject NOTICE parses into a renderable row', () => {
  // Carve parseIrcLine + its tag helper out of irc.js.
  const start = IRC_SRC.indexOf('function parseIrcLine(')
  const end = IRC_SRC.indexOf('\nclass ', start)
  const tagStart = IRC_SRC.indexOf('function parseTags(')
  const tagEnd = IRC_SRC.indexOf('\nfunction', tagStart + 10)
  if ([start, end, tagStart, tagEnd].some((n) => n === -1)) throw new Error('irc carve markers not found')
  // Trailing newline before the return — the slice can end on a // comment
  // line, which would otherwise swallow the appended return.
  const carved = `${IRC_SRC.slice(tagStart, tagEnd)}\n${IRC_SRC.slice(start, end)}\n;return parseIrcLine`
  const parseIrcLine = new Function('unescapeIrcTag', carved)((s) =>
    String(s ?? '')
      .replace(/\\s/g, ' ')
      .replace(/\\:/g, ';')
      .replace(/\\\\/g, '\\'),
  )

  test('duplicate-message NOTICE becomes a notice row with channel + reason text', () => {
    const line =
      '@msg-id=msg_duplicate :tmi.twitch.tv NOTICE #nl_kripp :Your message was not sent because it is identical to the previous one you sent, less than 30 seconds ago.'
    const msg = parseIrcLine(line)
    expect(msg?.type).toBe('notice')
    expect(msg.channel).toBe('nl_kripp')
    expect(msg.noticeType).toBe('msg_duplicate')
    expect(msg.text).toContain('identical to the previous one')
  })

  test('automod rejection NOTICE parses the same way', () => {
    const line =
      '@msg-id=msg_rejected_mandatory :tmi.twitch.tv NOTICE #nl_kripp :Your message wasn’t posted due to conflicts with the channel’s moderation settings.'
    const msg = parseIrcLine(line)
    expect(msg?.type).toBe('notice')
    expect(msg.noticeType).toBe('msg_rejected_mandatory')
  })
})

describe('wiring half — the auth-irc NOTICE branch feeds the pipeline', () => {
  const branchStart = AUTH_SRC.indexOf("if (line.includes(' NOTICE '))")
  const branchEnd = AUTH_SRC.indexOf('continue', branchStart)
  const branch = AUTH_SRC.slice(branchStart, branchEnd)

  test('reject NOTICEs go through parseIrcLine into irc._handleMsg', () => {
    expect(branch).toMatch(/parseIrcLine\(line\)/)
    expect(branch).toMatch(/_handleMsg/)
  })

  test('injected rows are synthetic — never relayed to the archive', () => {
    expect(branch).toMatch(/isSynthetic = true/)
  })

  test('the toast remains — inline row is in ADDITION, not a replacement', () => {
    expect(branch).toMatch(/showToast/)
  })

  test('every reject id twitch documents for sends is still mapped', () => {
    for (const id of [
      'msg_duplicate',
      'msg_rejected',
      'msg_rejected_mandatory',
      'msg_slowmode',
      'msg_followersonly',
      'msg_subsonly',
      'msg_banned',
      'msg_timedout',
    ]) {
      expect(AUTH_SRC).toContain(`'${id}'`)
    }
  })
})
