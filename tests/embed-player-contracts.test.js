/**
 * The in-place embed player's per-provider postMessage contracts.
 *
 * Every shape here was verified LIVE by read-back (set a volume, ask the
 * player what its volume is) against real provider iframes — youtube answered
 * `infoDelivery {volume:23}`, vimeo and soundcloud answered `getVolume`, and
 * streamable answered player.js `getVolume`. Spotify's embed has no volume
 * command at all, which is why it declares `volume: false` instead of
 * pretending. If someone "fixes" a shape from memory, these fail.
 *
 * Carves the table out of feed-embed.js (non-module bundle), same approach as
 * slash-alias-complete.test.js.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'feed-embed.js'), 'utf8')

function slice(start, end) {
  const s = SRC.indexOf(start)
  const e = SRC.indexOf(end, s)
  if (s === -1 || e === -1) throw new Error(`markers not found: ${start} .. ${end}`)
  return SRC.slice(s, e)
}

const tableSrc = slice('const _AUDIO_PROVIDERS = [', '\nfunction _audioProviderFor')
// frameUrl calls the bundle's sanitizeEmbedId/safeUrl — stub them with the
// same contract (pass through what the real ones accept).
const PROVIDERS = new Function(
  'sanitizeEmbedId',
  'safeUrl',
  `${tableSrc}\nreturn _AUDIO_PROVIDERS`,
)(
  (id) => (/^[\w-]+$/.test(String(id || '')) ? id : ''),
  (u) => String(u || ''),
)

const byId = (id) => PROVIDERS.find((p) => p.id === id)

describe('embed provider volume contracts (live-probed)', () => {
  test('youtube: command envelope, 0-100', () => {
    expect(byId('youtube').setVolume(0.5)).toEqual({ event: 'command', func: 'setVolume', args: [50] })
  })

  test('youtube needs the listening handshake — it answers nothing without it', () => {
    expect(byId('youtube').hello).toEqual({ event: 'listening', id: 1, channel: 'widget' })
    expect(byId('youtube').json).toBe(true)
  })

  test('vimeo: 0-1 float', () => {
    expect(byId('vimeo').setVolume(0.23)).toEqual({ method: 'setVolume', value: 0.23 })
  })

  test('soundcloud: 0-100', () => {
    expect(byId('soundcloud').setVolume(0.23)).toEqual({ method: 'setVolume', value: 23 })
  })

  test('streamable: player.js envelope, 0-100', () => {
    const p = byId('streamable')
    expect(p.setVolume(0.23)).toEqual({ method: 'setVolume', value: 23 })
    expect(p.stamp.context).toBe('player.js')
    expect(p.json).toBe(true)
  })

  test('spotify declares no volume rather than faking one', () => {
    const p = byId('spotify')
    expect(p.volume).toBe(false)
    expect(p.setVolume).toBeUndefined()
    expect(p.play).toEqual({ command: 'play' })
  })

  test('every provider can build a frame url from a real chat link', () => {
    const cases = {
      youtube: 'https://www.youtube.com/shorts/e2B1_DNpsV4',
      vimeo: 'https://vimeo.com/76979871',
      streamable: 'https://streamable.com/moo',
      spotify: 'https://open.spotify.com/track/740gNyGWKk98gy8nJLhHrv?si=x',
      soundcloud: 'https://soundcloud.com/artist/track-name',
    }
    for (const [id, url] of Object.entries(cases)) {
      const p = byId(id)
      expect(p.test.test(url)).toBe(true)
      expect(p.frameUrl(url)).toMatch(/^https:\/\//)
    }
  })

  test('each frame url targets the origin its messages are posted to', () => {
    for (const p of PROVIDERS) expect(p.origin).toMatch(/^https:\/\/[\w.-]+$/)
    expect(byId('youtube').frameUrl('https://youtu.be/jNQXAC9IVRw')).toContain('enablejsapi=1')
  })

  test('only video providers mount over the card; audio stays hidden', () => {
    expect(byId('youtube').video).toBe(true)
    expect(byId('vimeo').video).toBe(true)
    expect(byId('streamable').video).toBe(true)
    expect(byId('spotify').video).toBeUndefined()
    expect(byId('soundcloud').video).toBeUndefined()
  })
})
