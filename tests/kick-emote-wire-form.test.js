// Kick-native emotes only exist on the wire as [emote:<id>:<name>]. Sending the
// bare name posts literal text to every kick client — and HeatSync's own
// renderer paints bare names, so the sender saw an emote and nobody else did.
// Proven live 2026-07-21: a pool emote sent from the composer archived as the
// plain word with no emote ref.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const EMOTES = readFileSync(join(ROOT, 'src', 'multichat', 'emotes.js'), 'utf8')
const INPUT = readFileSync(join(ROOT, 'src', 'multichat', 'input.js'), 'utf8')

function extractFn(src, name) {
  const marker = `function ${name}(`
  const start = src.indexOf(marker)
  if (start === -1) throw new Error(`extractFn: "${name}" not found — source drifted`)
  const end = src.indexOf('\n}', start)
  return src.slice(start, end + 2)
}

// pool: name -> entry, standing in for lookupEmoteRenderOrder's resolution.
function make(pool) {
  return new Function(
    'pool',
    `const KICK_EMOTE_ID_RE = ${String(EMOTES.match(/const KICK_EMOTE_ID_RE = (.+)/)[1])}
     const KICK_MAX_MESSAGE = 500
     const lookupEmoteRenderOrder = (n) => pool[n] || null
     ${extractFn(EMOTES, 'kickifyEmoteText')}
     return kickifyEmoteText`,
  )(pool)
}

const KICK = { source: 'kick', url: 'https://files.kick.com/emotes/37226/fullsize' }
const SEVENTV = { source: '7tv', url: 'https://cdn.7tv.app/emote/abc/2x.webp' }

describe('kickifyEmoteText', () => {
  const f = make({ KEKW: KICK, catJAM: SEVENTV })

  test('a kick emote becomes its wire token', () => {
    expect(f('hello KEKW')).toBe('hello [emote:37226:KEKW]')
  })

  test('non-kick emotes are left as words — they have no kick id', () => {
    expect(f('hello catJAM')).toBe('hello catJAM')
  })

  test('plain text is untouched', () => {
    expect(f('just a sentence')).toBe('just a sentence')
  })

  test('an already-written token is not double-wrapped', () => {
    expect(f('[emote:37226:KEKW] KEKW')).toBe('[emote:37226:KEKW] [emote:37226:KEKW]')
  })

  test('punctuation-attached names stay words (they are not emote names)', () => {
    expect(f('KEKW, yes')).toBe('KEKW, yes')
  })

  test('spacing is preserved exactly', () => {
    expect(f('a  KEKW   b')).toBe('a  [emote:37226:KEKW]   b')
  })

  test('empty and non-string inputs pass through', () => {
    expect(f('')).toBe('')
    expect(f(null)).toBe(null)
  })

  // Tokens are much longer than names — expanding must never turn a sendable
  // message into one kick rejects for length.
  test('expansion that would breach kick 500-char limit falls back to words', () => {
    const long = 'KEKW '.repeat(90).trim()
    expect(long.length).toBeLessThanOrEqual(500)
    const out = f(long)
    expect(out).toBe(long)
  })

  test('a message already over the limit is still expanded (kick rejects either way)', () => {
    const huge = ('KEKW ' + 'y'.repeat(100) + ' ').repeat(6).trim()
    expect(huge.length).toBeGreaterThan(500)
    expect(f(huge)).toContain('[emote:37226:KEKW]')
  })
})

describe('wiring', () => {
  test('only the kick leg is rewritten', () => {
    expect(INPUT).toContain('sendKickMessage(slug, kickifyEmoteText(restText), kickReply)')
    // twitch keeps the bare body (wrapped in CTCP ACTION for /me)
    expect(INPUT).toContain('const twitchText = meMatch ? `\\x01ACTION ${restText}\\x01` : text')
  })
})
