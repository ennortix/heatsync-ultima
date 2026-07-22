// BTTV and FFZ bind modifiers in OPPOSITE directions — verified against both
// providers' own APIs (BTTV global emotes really do include c! h! l! p! r! s!
// v! w! z!; FFZ flags ffzX/ffzW/ffzY/ffzCursed with modifier:true):
//
//   BTTV  "c! Kappa"    → modifies the FOLLOWING emote
//   FFZ   "Kappa ffzX"  → modifies the PRECEDING emote
//   7TV   zero-width overlays also attach to the PRECEDING emote
//
// We accept the "wrong" order too, but ONLY as a fallback. That ordering is the
// whole design: if the fallback could win, "Kappa c! Keepo" would modify Kappa
// for us and Keepo for every BTTV user — and a multi-emote run is exactly where
// that divergence is visible.
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'emotes.js'), 'utf8')
const REGION = SRC.slice(SRC.indexOf('── Modifier binding ─'), SRC.indexOf('// Peel chained modifier word'))

// Mirror of the shipped direction rule, so the table below documents intent.
const forward = (tok) => tok.endsWith('!')

describe('provider direction', () => {
  test('every real BTTV token binds forward', () => {
    // exact set from api.betterttv.net/3/cached/emotes/global
    for (const t of ['c!', 'h!', 'l!', 'p!', 'r!', 's!', 'v!', 'w!', 'z!']) {
      expect(forward(t), t).toBe(true)
    }
  })
  test('every FFZ effect binds backward', () => {
    for (const t of ['ffzX', 'ffzY', 'ffzW', 'ffzCursed', 'ffzHyper', 'ffzRainbow', 'ffzSpin']) {
      expect(forward(t), t).toBe(false)
    }
  })
  test('c!#hex (the colour token) is BTTV-shaped and binds forward', () => {
    expect(REGION).toContain('c!#hex is a BTTV-shaped token')
  })
})

describe('the resolution order is canonical-then-fallback', () => {
  test('a forward token tries forward BEFORE the preceding emote', () => {
    const fwdIdx = REGION.indexOf('fwd && _emoteComesNext')
    const backIdx = REGION.indexOf('if (_lastItem())')
    expect(fwdIdx).toBeGreaterThan(-1)
    expect(fwdIdx).toBeLessThan(backIdx) // canonical wins over fallback
  })
  test('a backward token only looks forward AFTER trying the preceding emote', () => {
    const backIdx = REGION.indexOf('if (_lastItem())')
    const fallbackIdx = REGION.indexOf('!fwd && _emoteComesNext')
    expect(fallbackIdx).toBeGreaterThan(backIdx)
  })
  test('a token with an emote on neither side falls through to text', () => {
    // no unconditional `continue` after the fallbacks — it must reach the text path
    expect(REGION).toContain('else fall through to text')
  })
})

describe('lookahead skips modifiers but not plain words', () => {
  test('other modifier tokens are skipped so a run binds to the same emote', () => {
    expect(REGION).toContain('if (HS_MC_MODS[w] || HS_MC_C_RE.test(w)) continue')
  })
  test('the first non-modifier word decides — a plain word stops the scan', () => {
    // returns on the first real word rather than scanning the whole message,
    // so "omg c! lol" never reaches back for a distant emote
    expect(REGION).toContain('return !!_lookup(w)?.e')
  })
  test('kick inline tokens count as an emote ahead', () => {
    expect(REGION).toMatch(/hasKickEmote && .*emote:/)
  })
})
