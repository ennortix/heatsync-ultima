/**
 * Composer auto-hide visibility bookkeeping (src/multichat/main.js).
 *
 * Regression anchor: "why is the input box not auto-hiding" — an empty
 * composer bar stranded on screen with auto-hide switched on.
 *
 * inputBarVisible is a CACHE of the hs-hidden class, and several paths write
 * the class directly: the log + profile-card views, the autoHide toggle, and
 * the container rebuild that mints a brand-new bar (twitch swaps the chat
 * container on navigation). A rebuild that happened while the flag was false —
 * i.e. right after an auto-hide — produced a fresh bar with NO hs-hidden class
 * and a flag still reading false, and that combination is terminal:
 * hideInputBar() bailed on `if (!inputBarVisible) return` every time, so the
 * empty bar stayed up until something typed into it. The mirror-image drift
 * (flag true, class present) killed the type-to-reveal handler instead.
 *
 * Both directions are now resolved from the DOM before any decision.
 *
 * Carved out of the non-module content-script bundle (same rationale as
 * tab-complete-stale.test.js).
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'main.js'), 'utf8')
const start = SRC.indexOf('  function syncInputBarVisible(')
const end = SRC.indexOf('  function createOverlay(')
if (start === -1 || end === -1 || end <= start) throw new Error('carve markers not found')
const CARVE = SRC.slice(start, end)

// Minimal element stand-in: the class set is the only state these functions read.
const fakeEl = () => {
  const classes = new Set()
  return {
    classes,
    style: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
  }
}

let bar
let overlay
let now
let opts

function build({ autoHide = true, visibleFlag = true, hidden = false, keepUntil = 0 } = {}) {
  bar = fakeEl()
  overlay = fakeEl()
  if (hidden) bar.classList.add('hs-hidden')
  now = 1000
  opts = { autoHide }
  const document = {
    getElementById: (id) => {
      if (id === 'hs-mc-inputbar') return bar
      if (id === 'hs-mc-overlay') return overlay
      if (id === 'hs-mc-input') return null // empty composer
      if (id === 'hs-mc-emote-picker') return null
      return null
    },
  }
  const timers = []
  const api = new Function(
    'document',
    'window',
    'performance',
    'cleanup',
    'autoHideEligible',
    'adjustOverlayForPicker',
    '_updateMcLayout',
    'initialVisible',
    'initialKeepUntil',
    'timers',
    `let inputBarVisible = initialVisible
     let _keepComposerOpenUntil = initialKeepUntil
     let _composerStickyUntil = 0
     const replyState = null
     ${CARVE}
     return {
       showInputBar,
       hideInputBar,
       syncInputBarVisible,
       get flag() { return inputBarVisible },
     }`,
  )(
    document,
    {},
    { now: () => now },
    { setTimeout: (fn, ms) => timers.push({ fn, at: now + ms }) },
    () => opts.autoHide,
    () => {},
    () => {},
    visibleFlag,
    keepUntil,
    timers,
  )
  return { api, timers }
}

beforeEach(() => {
  now = 1000
})

describe('hideInputBar', () => {
  test('hides a visible bar whose cached flag went stale (the stranded-bar bug)', () => {
    // Rebuild left the bar on screen with the flag still reading "hidden".
    const { api } = build({ visibleFlag: false, hidden: false })
    api.hideInputBar()
    expect(bar.classList.contains('hs-hidden')).toBe(true)
    expect(api.flag).toBe(false)
  })

  test('is a no-op when the bar is genuinely hidden already', () => {
    const { api } = build({ visibleFlag: true, hidden: true })
    api.hideInputBar()
    expect(bar.classList.contains('hs-hidden')).toBe(true)
  })

  test('never touches the bar when auto-hide is off', () => {
    const { api } = build({ autoHide: false, visibleFlag: false, hidden: false })
    api.hideInputBar()
    expect(bar.classList.contains('hs-hidden')).toBe(false)
  })

  test('retries instead of swallowing the hide inside the rapid-fire window', () => {
    const { api, timers } = build({ keepUntil: 1500 })
    api.hideInputBar()
    expect(bar.classList.contains('hs-hidden')).toBe(false)
    expect(timers.length).toBe(1)
    now = 1600
    timers[0].fn()
    expect(bar.classList.contains('hs-hidden')).toBe(true)
  })
})

describe('showInputBar', () => {
  test('reveals a hidden bar whose cached flag went stale (no way to type)', () => {
    const { api } = build({ visibleFlag: true, hidden: true })
    api.showInputBar()
    expect(bar.classList.contains('hs-hidden')).toBe(false)
    expect(api.flag).toBe(true)
  })
})
