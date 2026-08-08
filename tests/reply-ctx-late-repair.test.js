/**
 * Regression: someone else's reply to you must keep its reply context even when
 * the transport that carried it lost the dedup race.
 *
 * The same twitch message arrives twice — once over IRC (carries the
 * reply-parent tags) and once from the native DOM tap (best-effort extraction
 * off an undocumented twitch internal shape the file itself warns "drifts
 * across twitch builds"). Whichever lands FIRST claims the id and the other
 * copy was dropped whole (irc.js `_handleMsg`). When the tap won, reply context
 * vanished: no "replying to" bar — and since a native reply to you counts as a
 * mention, no red either.
 *
 * A repair for this already existed but was gated on `sentHost`, i.e. it only
 * ever fired for messages YOU sent, never for someone else's reply to you,
 * which is the reported case.
 *
 * These are source-text invariants (house pattern — main.js has top-level side
 * effects and cannot be imported).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const IRC_SRC = readFileSync(new URL('../src/multichat/irc.js', import.meta.url), 'utf8')
const MAIN_SRC = readFileSync(new URL('../src/multichat/main.js', import.meta.url), 'utf8')

describe('duplicate carrying reply context is not silently discarded', () => {
  test('irc dedup emits reply-ctx instead of dropping the richer copy', () => {
    const dedup = IRC_SRC.slice(IRC_SRC.indexOf('_handleMsg(msg)'))
    const guard = dedup.slice(0, dedup.indexOf('userstate'))
    expect(guard).toMatch(/emit\('reply-ctx'/)
  })

  test('it only emits when there is actually reply context to hand over', () => {
    // Emitting on every duplicate would put a message on the bus for every
    // deduped line in chat — pure overhead on the hottest path there is.
    expect(IRC_SRC).toMatch(/if \(msg\.replyTo\?\.user\) this\.emit\('reply-ctx'/)
  })

  test('main subscribes to it', () => {
    expect(MAIN_SRC).toMatch(/irc\.on\('reply-ctx'/)
  })
})

describe('the repair actually repaints', () => {
  const handler = (() => {
    const start = MAIN_SRC.indexOf("irc.on('reply-ctx'")
    expect(start, 'reply-ctx handler missing').toBeGreaterThan(-1)
    return MAIN_SRC.slice(start, MAIN_SRC.indexOf("irc.on('message'", start))
  })()

  test('clears the cached html so the row re-renders', () => {
    expect(handler).toMatch(/_renderedHtml = null/)
  })

  test('never overwrites reply context the winning copy already had', () => {
    expect(handler).toMatch(/if \(m\.replyTo\?\.user\) return/)
  })

  test('every function the handler calls actually exists in main.js', () => {
    // The near-miss this pins: the handler first called `scheduleRender()`,
    // which does not exist — the real name is scheduleRenderMessages. Guarded
    // by `typeof x === 'function'` it would have silently done nothing forever,
    // which is precisely the class of bug this whole repair is fixing.
    // Strip comments first — prose mentioning a function name is not a call,
    // and the fix's own comment names isMention() deliberately.
    const code = handler.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    const called = [...code.matchAll(/\b([a-zA-Z_$][\w$]*)\s*\(/g)]
      .map((m) => m[1])
      .filter((n) => !['if', 'for', 'return', 'catch', 'try', 'typeof', 'Array'].includes(n))
    const missing = called.filter((n) => {
      if (/^(isArray|values|getMessages)$/.test(n)) return false // member calls
      const declared = new RegExp(String.raw`(function\s+${n}\b|const\s+${n}\s*=|let\s+${n}\s*=)`)
      return !declared.test(MAIN_SRC)
    })
    expect(missing).toEqual([])
  })
})
