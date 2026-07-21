// Kick celebration events (subs, gift subs, KICKs) off the Pusher tap.
//
// Three contracts are load-bearing and each one has failed silently before:
//   1. the tap's broadcast shape must equal the server webhook relay's, or the
//      overlay renders two different things depending on which transport won
//   2. the notice id must be one main.js's noticeKind() actually styles — it
//      was written against the server's long event names, and the short form
//      the relay sends matched nothing
//   3. a channel with BOTH transports must not render every celebration twice
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const BG = readFileSync(join(ROOT, 'chrome', 'background.js'), 'utf8')
const IRC = readFileSync(join(ROOT, 'src', 'multichat', 'irc.js'), 'utf8')
const MAIN = readFileSync(join(ROOT, 'src', 'multichat', 'main.js'), 'utf8')

function extractFn(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`extractFn: "${name}" not found — source drifted, update this test`)
  const end = src.indexOf('\n}', start)
  if (end === -1) throw new Error(`extractFn: "${name}" has no closing brace`)
  return src.slice(start, end + 2)
}

// Rebuild the BG handlers against stubs: a fixed chatroom→slug table and a
// broadcast sink. Keeps the test on the parsing/shaping logic, which is the
// part kick can break from their side.
function makeBg() {
  const sent = []
  const api = new Function(`
    const _kpEventStats = { subs: 0, gifts: 0, dropped: 0 }
    const sent = []
    function broadcastToTabs(m) { sent.push(m) }
    function _kpSlugForChatroom(id) { return id === 1279951 ? 'chessbrah' : null }
    ${extractFn(BG, '_kpEventParse')}
    ${extractFn(BG, '_kpEventSlug')}
    ${extractFn(BG, '_kpHandleSubEvent')}
    ${extractFn(BG, '_kpHandleGiftSubEvent')}
    return { _kpHandleSubEvent, _kpHandleGiftSubEvent, sent, stats: _kpEventStats }
  `)()
  api.sent.push = api.sent.push.bind(api.sent)
  return { ...api, sink: sent }
}

const frame = (data, channel = 'chatrooms.1279951.v2') => ({ channel, data: JSON.stringify(data) })

describe('_kpHandleSubEvent', () => {
  test('a first-month sub broadcasts eventType new', () => {
    const bg = makeBg()
    bg._kpHandleSubEvent(frame({ chatroom_id: 1279951, username: 'Glezzy1', months: 1 }))
    expect(bg.sent).toHaveLength(1)
    expect(bg.sent[0]).toMatchObject({
      type: 'kick_sub_event',
      channel: 'chessbrah',
      eventType: 'new',
      username: 'Glezzy1',
      message: 'Glezzy1 subscribed!',
    })
  })

  test('months > 1 is a renewal and says so', () => {
    const bg = makeBg()
    bg._kpHandleSubEvent(frame({ username: 'Glezzy1', months: 14 }))
    expect(bg.sent[0].eventType).toBe('renewal')
    expect(bg.sent[0].months).toBe(14)
    expect(bg.sent[0].message).toBe('Glezzy1 resubscribed for 14 months!')
  })

  test('a nested user object still resolves a username', () => {
    const bg = makeBg()
    bg._kpHandleSubEvent(frame({ user: { username: 'Nested' } }))
    expect(bg.sent[0].username).toBe('Nested')
  })

  test('no username → dropped and counted, never announced as "someone"', () => {
    const bg = makeBg()
    bg._kpHandleSubEvent(frame({ months: 3 }))
    expect(bg.sent).toHaveLength(0)
    expect(bg.stats.dropped).toBe(1)
  })

  test('an unknown chatroom is ignored (never leaks into another channel)', () => {
    const bg = makeBg()
    bg._kpHandleSubEvent(frame({ username: 'x' }, 'chatrooms.999.v2'))
    expect(bg.sent).toHaveLength(0)
  })

  test('the v1 chatroom channel resolves too', () => {
    const bg = makeBg()
    bg._kpHandleSubEvent(frame({ username: 'x' }, 'chatrooms.1279951'))
    expect(bg.sent).toHaveLength(1)
  })

  test('a malformed payload is swallowed, not thrown', () => {
    const bg = makeBg()
    expect(() => bg._kpHandleSubEvent({ channel: 'chatrooms.1279951.v2', data: '{oops' })).not.toThrow()
    expect(bg.sent).toHaveLength(0)
  })
})

describe('_kpHandleGiftSubEvent', () => {
  test('gifted_usernames drives both the count and the giftee list', () => {
    const bg = makeBg()
    bg._kpHandleGiftSubEvent(frame({ gifter_username: 'Big', gifted_usernames: ['a', 'b', 'c'] }))
    expect(bg.sent[0]).toMatchObject({
      type: 'kick_sub_event',
      eventType: 'gift',
      username: 'Big',
      gifter: 'Big',
      message: 'Big gifted 3 subs!',
    })
    expect(bg.sent[0].giftees).toEqual(['a', 'b', 'c'])
  })

  test('one gift is singular', () => {
    const bg = makeBg()
    bg._kpHandleGiftSubEvent(frame({ gifter_username: 'Big', gifted_usernames: ['solo'] }))
    expect(bg.sent[0].message).toBe('Big gifted 1 sub!')
  })

  test('giftees given as objects are flattened', () => {
    const bg = makeBg()
    bg._kpHandleGiftSubEvent(frame({ gifter: { username: 'Obj' }, giftees: [{ username: 'a' }, { username: 'b' }] }))
    expect(bg.sent[0].username).toBe('Obj')
    expect(bg.sent[0].giftees).toEqual(['a', 'b'])
  })

  test('an unknown gifter is anonymous, not a dropped event', () => {
    const bg = makeBg()
    bg._kpHandleGiftSubEvent(frame({ gifted_usernames: ['a'] }))
    expect(bg.sent[0].username).toBe('anonymous')
  })

  test('a gift we cannot size is dropped rather than announced as 0 subs', () => {
    const bg = makeBg()
    bg._kpHandleGiftSubEvent(frame({ gifter_username: 'Big', amount: 5 }))
    expect(bg.sent).toHaveLength(0)
    expect(bg.stats.dropped).toBe(1)
  })
})

describe('celebration dedup', () => {
  const { kickCelebrationFresh } = new Function(`
    ${IRC.slice(IRC.indexOf('const KICK_CELEBRATION_DEDUP_MS'), IRC.indexOf('const KICK_SUB_NOTICE_ID'))}
    return { kickCelebrationFresh }
  `)()

  test('the same celebration from both transports renders once', () => {
    const key = `s|chessbrah|gift|Big|0|3`
    expect(kickCelebrationFresh(key)).toBe(true)
    expect(kickCelebrationFresh(key)).toBe(false)
  })

  test('a different celebration in the same window still renders', () => {
    expect(kickCelebrationFresh('s|chessbrah|new|Alice|1|0')).toBe(true)
    expect(kickCelebrationFresh('s|chessbrah|new|Bob|1|0')).toBe(true)
  })
})

describe('notice id mapping', () => {
  const { KICK_SUB_NOTICE_ID } = new Function(
    `${IRC.slice(IRC.indexOf('const KICK_SUB_NOTICE_ID'), IRC.indexOf('}', IRC.indexOf('const KICK_SUB_NOTICE_ID')) + 1)}\nreturn { KICK_SUB_NOTICE_ID }`,
  )()

  // The bug this guards: main.js styles kick subs off the long webhook names,
  // the relay sends the short ones, so nothing matched and every kick sub
  // notice rendered with default styling.
  test('every mapped id is one main.js actually styles', () => {
    for (const id of Object.values(KICK_SUB_NOTICE_ID)) {
      expect(MAIN.includes(`'${id}'`)).toBe(true)
    }
  })

  test('covers all three relay event types', () => {
    expect(Object.keys(KICK_SUB_NOTICE_ID).sort()).toEqual(['gift', 'new', 'renewal'])
  })
})
