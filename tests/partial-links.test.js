// linkifyPartialLinks / defangedToHost — partial "watch?v=" youtube refs and
// defanged "(dot)"-style domains, rendered as an html post-pass that must
// never touch existing tags/anchors or emit unsafe attributes.

import { describe, expect, test } from 'bun:test'
import utils from '../src/lib/utils.js'

const { linkifyPartialLinks, defangedToHost } = utils

const A = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer" class="hs-mc-link">${text}</a>`

describe('defangedToHost', () => {
  test('canonical forms → dotted host', () => {
    expect(defangedToHost('heatsync (dot) org')).toBe('heatsync.org')
    expect(defangedToHost('heatsync(dot)org')).toBe('heatsync.org')
    expect(defangedToHost('HEATSYNC (DOT) ORG')).toBe('heatsync.org')
    expect(defangedToHost('site[.]com')).toBe('site.com')
    expect(defangedToHost('site (.) com')).toBe('site.com')
    expect(defangedToHost('site {dot} com')).toBe('site.com')
    expect(defangedToHost('a dot b dot com')).toBe('a.b.com')
  })

  test('rejects non-TLD tails', () => {
    expect(defangedToHost('3 dot 5')).toBeNull()
    expect(defangedToHost('v1 (dot) 2')).toBeNull()
    expect(defangedToHost('single')).toBeNull()
  })
})

describe('linkifyPartialLinks — youtube watch refs', () => {
  test('bare watch?v= becomes a youtube link, display text verbatim', () => {
    expect(linkifyPartialLinks('check watch?v=l9i0hDNBdZM out')).toBe(
      `check ${A('https://www.youtube.com/watch?v=l9i0hDNBdZM', 'watch?v=l9i0hDNBdZM')} out`,
    )
  })

  test('does not fire inside a full url or an existing anchor', () => {
    const full = `<a href="https://www.youtube.com/watch?v=l9i0hDNBdZM" class="hs-mc-link">youtube.com/watch?v=l9i0hDNBdZM</a>`
    expect(linkifyPartialLinks(full)).toBe(full)
    expect(linkifyPartialLinks('youtube.com/watch?v=l9i0hDNBdZM')).toBe('youtube.com/watch?v=l9i0hDNBdZM')
  })

  test('rejects wrong-length ids', () => {
    expect(linkifyPartialLinks('watch?v=short')).toBe('watch?v=short')
  })
})

describe('linkifyPartialLinks — defanged domains', () => {
  test('mellen case: https://heatsync (DOT) org', () => {
    expect(linkifyPartialLinks('go to https://heatsync (DOT) org now')).toBe(
      `go to ${A('https://heatsync.org', 'https://heatsync (DOT) org')} now`,
    )
  })

  test('hxxps scheme is normalized in href, kept in display', () => {
    expect(linkifyPartialLinks('hxxps://evil[.]example')).toBe(A('https://evil.example', 'hxxps://evil[.]example'))
  })

  test('bare form with path', () => {
    expect(linkifyPartialLinks('heatsync(dot)org/emotes')).toBe(
      A('https://heatsync.org/emotes', 'heatsync(dot)org/emotes'),
    )
  })

  test('spaced dot word form', () => {
    expect(linkifyPartialLinks('join heatsync dot org today')).toBe(
      `join ${A('https://heatsync.org', 'heatsync dot org')} today`,
    )
  })

  test('number prose stays text', () => {
    expect(linkifyPartialLinks('rated 3 dot 5 stars')).toBe('rated 3 dot 5 stars')
  })

  test('never crosses tags — emote img splits the phrase', () => {
    const html = 'heatsync <img src="x.png"> (dot) org'
    expect(linkifyPartialLinks(html)).toBe(html)
  })

  test('painted-mention anchors with inner tags pass through whole', () => {
    const anchor = '<a href="https://heatsync.org/user/x" class="hs-mc-user"><span>x (dot) y</span></a>'
    expect(linkifyPartialLinks(anchor)).toBe(anchor)
  })

  test('escaped input stays attribute-safe', () => {
    const out = linkifyPartialLinks('&quot;heatsync (dot) org&quot;')
    expect(out).toContain(A('https://heatsync.org', 'heatsync (dot) org'))
    expect(out).not.toMatch(/href="[^"]*&quot;/)
  })
})
