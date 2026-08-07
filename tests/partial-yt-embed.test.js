/**
 * Host-less youtube refs get a chat embed card, not just an anchor.
 *
 * "[T]wollip: watch?v=Gz0fAz9n_Os Listening" rendered as a bare link: chats drop
 * the domain constantly (platforms throttle links for non-subs), linkifyPartialLinks
 * already anchored it, but extractChatEmbed only ever matched `https?://…` — so
 * the only way to watch it was to leave chat. firstPartialYtUrl is the bridge,
 * built on the SAME regex as the linkifier so "linkifies" and "embeds" can't drift.
 */

import { describe, expect, test } from 'bun:test'
import utils from '../src/lib/utils.js'

const { firstPartialYtUrl, linkifyPartialLinks } = utils

describe('firstPartialYtUrl', () => {
  test('the reported message', () => {
    expect(firstPartialYtUrl('watch?v=Gz0fAz9n_Os Listening')).toBe('https://www.youtube.com/watch?v=Gz0fAz9n_Os')
  })

  test('every host-less fragment shape normalizes to watch?v=', () => {
    // shorts/live/embed/v all name the same video id, and watch?v= is the shape
    // every embed builder parses.
    for (const frag of ['watch?v=', 'shorts/', 'live/', 'embed/', 'v/']) {
      expect(firstPartialYtUrl(`look at ${frag}Gz0fAz9n_Os`)).toBe('https://www.youtube.com/watch?v=Gz0fAz9n_Os')
    }
  })

  test('leading slash and query tail are tolerated, tail is dropped', () => {
    expect(firstPartialYtUrl('/watch?v=Gz0fAz9n_Os&t=30s')).toBe('https://www.youtube.com/watch?v=Gz0fAz9n_Os')
    // pre-escaped html form reaches this too (&amp;)
    expect(firstPartialYtUrl('watch?v=Gz0fAz9n_Os&amp;t=30s')).toBe('https://www.youtube.com/watch?v=Gz0fAz9n_Os')
  })

  test('first match wins', () => {
    expect(firstPartialYtUrl('watch?v=Gz0fAz9n_Os then shorts/aaaaaaaaaaa')).toBe(
      'https://www.youtube.com/watch?v=Gz0fAz9n_Os',
    )
  })

  test('a fragment inside a real url is left alone (the linkifier owns that)', () => {
    expect(firstPartialYtUrl('https://www.youtube.com/watch?v=Gz0fAz9n_Os')).toBe('')
  })

  test('prose and non-ids never produce a url', () => {
    for (const s of ['shorts/summer', 'watch?v=short', 'nothing here', '', null, undefined]) {
      expect(firstPartialYtUrl(/** @type {string} */ (s))).toBe('')
    }
  })

  test('does not carry regex lastIndex between calls', () => {
    const t = 'watch?v=Gz0fAz9n_Os'
    expect(firstPartialYtUrl(t)).toBe(firstPartialYtUrl(t))
  })
})

test('anything that linkifies as a youtube ref also yields an embed url', () => {
  // The contract that keeps the two paths from drifting apart.
  for (const frag of ['watch?v=', 'shorts/', 'live/', 'embed/', 'v/']) {
    const text = `${frag}Gz0fAz9n_Os`
    expect(linkifyPartialLinks(text)).toContain('<a href="https://www.youtube.com/')
    expect(firstPartialYtUrl(text)).toBe('https://www.youtube.com/watch?v=Gz0fAz9n_Os')
  }
})
