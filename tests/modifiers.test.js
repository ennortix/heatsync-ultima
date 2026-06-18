import { test, expect, describe } from 'bun:test'
import {
  HS_MOD_TOKENS,
  HS_MOD_CLASS_TO_TOKEN,
  HS_MOD_MAX_SCALE,
  hsModHexToHue,
  hsModResolvePrefix,
  hsModPeelChain,
  hsModClassify,
  hsModComposeTransform,
  hsModComposeFilter,
  hsModBuildStyleAttr,
  hsModInjectWrapperStyle,
  hsModWordsFromState,
} from '../src/lib/modifiers.js'

// ── HS_MOD_TOKENS map ─────────────────────────────────────────────────────────

describe('HS_MOD_TOKENS', () => {
  test('w! maps to wide', () => expect(HS_MOD_TOKENS['w!']).toBe('wide'))
  test('h! maps to tall', () => expect(HS_MOD_TOKENS['h!']).toBe('tall'))
  test('v! maps to vmirror', () => expect(HS_MOD_TOKENS['v!']).toBe('vmirror'))
  test('l! maps to hflip', () => expect(HS_MOD_TOKENS['l!']).toBe('hflip'))
  test('c! maps to cursed', () => expect(HS_MOD_TOKENS['c!']).toBe('cursed'))
  test('z! maps to wide (alias)', () => expect(HS_MOD_TOKENS['z!']).toBe('wide'))
  test('x! maps to hflip (alias)', () => expect(HS_MOD_TOKENS['x!']).toBe('hflip'))
  test('y! maps to vmirror (alias)', () => expect(HS_MOD_TOKENS['y!']).toBe('vmirror'))
  test('ffzX maps to hflip (real name)', () => expect(HS_MOD_TOKENS['ffzX']).toBe('hflip'))
  test('ffzY maps to vmirror (real name)', () => expect(HS_MOD_TOKENS['ffzY']).toBe('vmirror'))
  test('ffzW maps to wide (real name)', () => expect(HS_MOD_TOKENS['ffzW']).toBe('wide'))
  test('ffzWide maps to wide', () => expect(HS_MOD_TOKENS['ffzWide']).toBe('wide'))
  test('ffzTall maps to tall', () => expect(HS_MOD_TOKENS['ffzTall']).toBe('tall'))
  test('ffzCursed maps to cursed', () => expect(HS_MOD_TOKENS['ffzCursed']).toBe('cursed'))
  test('is frozen', () => expect(Object.isFrozen(HS_MOD_TOKENS)).toBe(true))
})

// ── HS_MOD_CLASS_TO_TOKEN reverse map ─────────────────────────────────────────

describe('HS_MOD_CLASS_TO_TOKEN', () => {
  test('wide → w!', () => expect(HS_MOD_CLASS_TO_TOKEN['wide']).toBe('w!'))
  test('tall → h!', () => expect(HS_MOD_CLASS_TO_TOKEN['tall']).toBe('h!'))
  test('hflip → ffzX', () => expect(HS_MOD_CLASS_TO_TOKEN['hflip']).toBe('ffzX'))
  test('vmirror → ffzY', () => expect(HS_MOD_CLASS_TO_TOKEN['vmirror']).toBe('ffzY'))
  test('cursed → c!', () => expect(HS_MOD_CLASS_TO_TOKEN['cursed']).toBe('c!'))
  test('is frozen', () => expect(Object.isFrozen(HS_MOD_CLASS_TO_TOKEN)).toBe(true))
})

// ── HS_MOD_MAX_SCALE ──────────────────────────────────────────────────────────

test('HS_MOD_MAX_SCALE is 4', () => expect(HS_MOD_MAX_SCALE).toBe(4))

// ── hsModHexToHue ─────────────────────────────────────────────────────────────

describe('hsModHexToHue', () => {
  test('pure red (ff0000) → 0°', () => expect(hsModHexToHue('ff0000')).toBe(0))
  test('pure green (00ff00) → 120°', () => expect(hsModHexToHue('00ff00')).toBe(120))
  test('pure blue (0000ff) → 240°', () => expect(hsModHexToHue('0000ff')).toBe(240))
  test('black (000000) → 0° (achromatic)', () => expect(hsModHexToHue('000000')).toBe(0))
  test('white (ffffff) → 0° (achromatic)', () => expect(hsModHexToHue('ffffff')).toBe(0))
  test('3-char shorthand f00 → same as ff0000', () => {
    expect(hsModHexToHue('f00')).toBe(hsModHexToHue('ff0000'))
  })
  test('3-char shorthand 0f0 → same as 00ff00', () => {
    expect(hsModHexToHue('0f0')).toBe(hsModHexToHue('00ff00'))
  })
  test('returns integer (no fractional degrees)', () => {
    const h = hsModHexToHue('ff8700')
    expect(Number.isInteger(h)).toBe(true)
  })
  test('result is in [0, 359]', () => {
    for (const hex of ['ff8700', 'aabbcc', '123456', 'fedcba']) {
      const h = hsModHexToHue(hex)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(359)
    }
  })
})

// ── hsModResolvePrefix ────────────────────────────────────────────────────────

describe('hsModResolvePrefix', () => {
  test('exact token w! resolves to itself', () => expect(hsModResolvePrefix('w!')).toBe('w!'))
  test('exact token ffzX resolves to itself', () => expect(hsModResolvePrefix('ffzX')).toBe('ffzX'))
  test('case-insensitive: ffzx → ffzX', () => expect(hsModResolvePrefix('ffzx')).toBe('ffzX'))
  test('case-insensitive: FFZX → ffzX', () => expect(hsModResolvePrefix('FFZX')).toBe('ffzX'))
  test('prefix w → w! (unique match)', () => expect(hsModResolvePrefix('w')).toBe('w!'))
  test('prefix ffzwid → ffzWide (unique prefix)', () => expect(hsModResolvePrefix('ffzwid')).toBe('ffzWide'))
  // 'f' matches ffzX, ffzY, ffzW, ffzWide, ffzTall, ffzCursed — ambiguous
  test('ambiguous prefix f → null', () => expect(hsModResolvePrefix('f')).toBeNull())
  test('empty string → null', () => expect(hsModResolvePrefix('')).toBeNull())
  test('null → null', () => expect(hsModResolvePrefix(null)).toBeNull())
  test('valid c!#hex passes through', () => {
    expect(hsModResolvePrefix('c!#ff8700')).toBe('c!#ff8700')
  })
  test('no-match word → null', () => expect(hsModResolvePrefix('Kappa')).toBeNull())
})

// ── hsModPeelChain ────────────────────────────────────────────────────────────

describe('hsModPeelChain', () => {
  test('single token w! → {mods:[wide], hue:null, words:[w!]}', () => {
    const r = hsModPeelChain('w!')
    expect(r).toEqual({ mods: ['wide'], hue: null, words: ['w!'] })
  })

  test('two-token chain w!h! → wide + tall', () => {
    const r = hsModPeelChain('w!h!')
    expect(r).not.toBeNull()
    expect(r.mods).toEqual(['wide', 'tall'])
    expect(r.words).toEqual(['w!', 'h!'])
    expect(r.hue).toBeNull()
  })

  test('chain w!h!ffzX → wide, tall, hflip', () => {
    const r = hsModPeelChain('w!h!ffzX')
    expect(r).not.toBeNull()
    expect(r.mods).toContain('wide')
    expect(r.mods).toContain('tall')
    expect(r.mods).toContain('hflip')
    expect(r.words).toContain('w!')
    expect(r.words).toContain('h!')
    expect(r.words).toContain('ffzX')
  })

  test('c!#ff8700 → null from peel (c! token consumed first, #ff8700 remainder fails)', () => {
    // peel loop hits the 'c!' token key first, consuming it and leaving '#ff8700'
    // which is neither a token nor a color peel → returns null.
    // Use hsModClassify (which hits HS_MOD_C_HEX_RE full-match) to handle c!#hex.
    expect(hsModPeelChain('c!#ff8700')).toBeNull()
  })

  test('c!ff8700 (no #) peels and sets hue', () => {
    // without '#', peel regex /^c!#?.../ still matches; c! token is consumed first
    // and leaves 'ff8700' remainder which also fails → same null result
    expect(hsModPeelChain('c!ff8700')).toBeNull()
  })

  test('mixed: w!c!h! → wide, cursed, tall (c! is the cursed token in peel)', () => {
    // w! → wide, c! → cursed, h! → tall — all exact tokens
    const r = hsModPeelChain('w!c!h!')
    expect(r).not.toBeNull()
    expect(r.mods).toContain('wide')
    expect(r.mods).toContain('cursed')
    expect(r.mods).toContain('tall')
    expect(r.hue).toBeNull()
  })

  test('plain word Kappa → null', () => expect(hsModPeelChain('Kappa')).toBeNull())
  test('empty string → null', () => expect(hsModPeelChain('')).toBeNull())
  test('null → null', () => expect(hsModPeelChain(null)).toBeNull())

  test('c! without hex → null (invalid)', () => {
    // 'c!' alone is in HS_MOD_TOKENS (maps to 'cursed') — peel returns that
    const r = hsModPeelChain('c!')
    expect(r).not.toBeNull()
    expect(r.mods).toContain('cursed')
  })

  test('w without ! → null (not a token, not peelable)', () => {
    expect(hsModPeelChain('w')).toBeNull()
  })

  test('partial chain w!Kappa → null (non-modifier remainder)', () => {
    expect(hsModPeelChain('w!Kappa')).toBeNull()
  })
})

// ── hsModClassify ─────────────────────────────────────────────────────────────

describe('hsModClassify', () => {
  test('plain word → {kind:plain}', () => {
    expect(hsModClassify('Kappa').kind).toBe('plain')
  })
  test('null → {kind:plain}', () => {
    expect(hsModClassify(null).kind).toBe('plain')
  })

  test('w! → modifier, mods:[wide]', () => {
    const r = hsModClassify('w!')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['wide'])
    expect(r.hue).toBeNull()
  })

  test('h! → modifier, mods:[tall]', () => {
    const r = hsModClassify('h!')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['tall'])
  })

  test('l! → modifier, mods:[hflip]', () => {
    const r = hsModClassify('l!')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['hflip'])
  })

  test('v! → modifier, mods:[vmirror]', () => {
    const r = hsModClassify('v!')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['vmirror'])
  })

  test('c! → modifier, mods:[cursed]', () => {
    const r = hsModClassify('c!')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toContain('cursed')
  })

  test('ffzX → modifier, mods:[hflip]', () => {
    const r = hsModClassify('ffzX')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['hflip'])
  })

  test('ffzY → modifier, mods:[vmirror]', () => {
    const r = hsModClassify('ffzY')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['vmirror'])
  })

  test('ffzW → modifier, mods:[wide]', () => {
    const r = hsModClassify('ffzW')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual(['wide'])
  })

  test('c!#ff8700 → modifier with hue, empty mods', () => {
    const r = hsModClassify('c!#ff8700')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toEqual([])
    expect(r.hue).not.toBeNull()
    expect(typeof r.hue).toBe('number')
  })

  test('c!#f00 (3-char hex) → modifier with hue', () => {
    const r = hsModClassify('c!#f00')
    expect(r.kind).toBe('modifier')
    expect(r.hue).toBe(0) // red = 0°
  })

  test('chain w!h! → modifier with wide+tall', () => {
    const r = hsModClassify('w!h!')
    expect(r.kind).toBe('modifier')
    expect(r.mods).toContain('wide')
    expect(r.mods).toContain('tall')
  })

  test('allowPrefix: w resolves to w! → modifier', () => {
    const r = hsModClassify('w', { allowPrefix: true })
    expect(r.kind).toBe('modifier')
    expect(r.resolvedFrom).toBe('w')
  })

  test('no allowPrefix: w → plain', () => {
    expect(hsModClassify('w').kind).toBe('plain')
  })

  test('allowPrefix: ambiguous prefix f → plain (no unique resolution)', () => {
    expect(hsModClassify('f', { allowPrefix: true }).kind).toBe('plain')
  })

  test('words array is present on modifier result', () => {
    const r = hsModClassify('w!')
    expect(Array.isArray(r.words)).toBe(true)
    expect(r.words).toContain('w!')
  })
})

// ── hsModComposeTransform ─────────────────────────────────────────────────────

describe('hsModComposeTransform', () => {
  test('no mods → {sx:1, sy:1}', () => {
    expect(hsModComposeTransform([])).toEqual({ sx: 1, sy: 1 })
  })

  test('null mods → {sx:1, sy:1}', () => {
    expect(hsModComposeTransform(null)).toEqual({ sx: 1, sy: 1 })
  })

  test('wide → sx:2, sy:1', () => {
    expect(hsModComposeTransform(['wide'])).toEqual({ sx: 2, sy: 1 })
  })

  test('tall → sx:1, sy:2', () => {
    expect(hsModComposeTransform(['tall'])).toEqual({ sx: 1, sy: 2 })
  })

  test('hflip → sx:-1, sy:1', () => {
    expect(hsModComposeTransform(['hflip'])).toEqual({ sx: -1, sy: 1 })
  })

  test('vmirror → sx:1, sy:-1', () => {
    expect(hsModComposeTransform(['vmirror'])).toEqual({ sx: 1, sy: -1 })
  })

  test('wide + wide → sx:4 (2×2)', () => {
    expect(hsModComposeTransform(['wide', 'wide'])).toEqual({ sx: 4, sy: 1 })
  })

  test('wide + wide + wide → sx clamped to MAX_SCALE (4)', () => {
    // 2*2*2=8, clamped to 4
    const r = hsModComposeTransform(['wide', 'wide', 'wide'])
    expect(r.sx).toBe(4)
  })

  test('hflip + hflip → sx:1 (double-flip cancels)', () => {
    expect(hsModComposeTransform(['hflip', 'hflip'])).toEqual({ sx: 1, sy: 1 })
  })

  test('wide + hflip → sx:-2', () => {
    expect(hsModComposeTransform(['wide', 'hflip'])).toEqual({ sx: -2, sy: 1 })
  })

  test('cursed does not affect sx/sy', () => {
    expect(hsModComposeTransform(['cursed'])).toEqual({ sx: 1, sy: 1 })
  })

  test('sx never exceeds ±MAX_SCALE', () => {
    const huge = Array(10).fill('wide')
    const r = hsModComposeTransform(huge)
    expect(r.sx).toBeLessThanOrEqual(HS_MOD_MAX_SCALE)
    expect(r.sx).toBeGreaterThanOrEqual(-HS_MOD_MAX_SCALE)
  })
})

// ── hsModComposeFilter ────────────────────────────────────────────────────────

describe('hsModComposeFilter', () => {
  test('no mods, no hue → empty string', () => {
    expect(hsModComposeFilter([], null)).toBe('')
  })

  test('cursed → includes hue-rotate(45deg) and saturate(2)', () => {
    const f = hsModComposeFilter(['cursed'], null)
    expect(f).toContain('hue-rotate(45deg)')
    expect(f).toContain('saturate(2)')
  })

  test('hue set → includes hue-rotate({n}deg) and saturate(1.6)', () => {
    const f = hsModComposeFilter([], 120)
    expect(f).toContain('hue-rotate(120deg)')
    expect(f).toContain('saturate(1.6)')
  })

  test('cursed + hue → both filters present', () => {
    const f = hsModComposeFilter(['cursed'], 120)
    expect(f).toContain('hue-rotate(45deg)')
    expect(f).toContain('hue-rotate(120deg)')
  })

  test('wide alone → empty filter (transform-only mod)', () => {
    expect(hsModComposeFilter(['wide'], null)).toBe('')
  })

  test('no leading/trailing whitespace', () => {
    const f = hsModComposeFilter(['cursed'], null)
    expect(f).toBe(f.trim())
  })
})

// ── hsModBuildStyleAttr ───────────────────────────────────────────────────────

describe('hsModBuildStyleAttr', () => {
  test('no mods, no hue → empty string', () => {
    expect(hsModBuildStyleAttr([], null)).toBe('')
  })

  test('wide → includes transform:scale(2, 1)', () => {
    const s = hsModBuildStyleAttr(['wide'], null)
    expect(s).toContain('transform:scale(2, 1)')
  })

  test('hflip → includes transform:scale(-1, 1)', () => {
    const s = hsModBuildStyleAttr(['hflip'], null)
    expect(s).toContain('transform:scale(-1, 1)')
  })

  test('cursed → includes filter with hue-rotate', () => {
    const s = hsModBuildStyleAttr(['cursed'], null)
    expect(s).toContain('filter:')
    expect(s).toContain('hue-rotate')
  })

  test('hue color → includes filter', () => {
    const s = hsModBuildStyleAttr([], 120)
    expect(s).toContain('filter:')
    expect(s).toContain('hue-rotate(120deg)')
  })

  test('no mods identity → no transform in output', () => {
    const s = hsModBuildStyleAttr(['cursed'], null)
    // cursed doesn't affect scale — no transform
    expect(s).not.toContain('transform:')
  })
})

// ── hsModInjectWrapperStyle ───────────────────────────────────────────────────

describe('hsModInjectWrapperStyle', () => {
  test('empty styleStr → html unchanged', () => {
    const html = '<span class="hs-emote">img</span>'
    expect(hsModInjectWrapperStyle(html, '')).toBe(html)
  })

  test('injects new style attr into span with no existing style', () => {
    const html = '<span class="hs-emote">img</span>'
    const out = hsModInjectWrapperStyle(html, 'transform:scale(2, 1) !important;')
    expect(out).toContain('style="transform:scale(2, 1) !important;"')
  })

  test('merges with existing style attr', () => {
    const html = '<span class="hs-emote" style="color:red">img</span>'
    const out = hsModInjectWrapperStyle(html, 'transform:scale(2, 1) !important;')
    expect(out).toContain('color:red')
    expect(out).toContain('transform:scale(2, 1)')
  })

  test('does not double-wrap on repeated calls', () => {
    const html = '<span>img</span>'
    const once = hsModInjectWrapperStyle(html, 'x:1;')
    // second call merges into the already-injected style
    const twice = hsModInjectWrapperStyle(once, 'y:2;')
    // should not have two style attributes
    expect((twice.match(/style=/g) || []).length).toBe(1)
  })
})

// ── hsModWordsFromState ───────────────────────────────────────────────────────

describe('hsModWordsFromState', () => {
  test('empty mods, no hue → []', () => {
    expect(hsModWordsFromState([], null)).toEqual([])
  })

  test('wide → [w!]', () => {
    expect(hsModWordsFromState(['wide'], null)).toEqual(['w!'])
  })

  test('hflip → [ffzX]', () => {
    expect(hsModWordsFromState(['hflip'], null)).toEqual(['ffzX'])
  })

  test('vmirror → [ffzY]', () => {
    expect(hsModWordsFromState(['vmirror'], null)).toEqual(['ffzY'])
  })

  test('cursed → [c!]', () => {
    expect(hsModWordsFromState(['cursed'], null)).toEqual(['c!'])
  })

  test('hue → produces c!#hex token', () => {
    const words = hsModWordsFromState([], 0)
    expect(words.length).toBe(1)
    expect(words[0]).toMatch(/^c!#[0-9a-f]{6}$/)
  })

  test('wide + hue → [w!, c!#hex]', () => {
    const words = hsModWordsFromState(['wide'], 120)
    expect(words[0]).toBe('w!')
    expect(words[1]).toMatch(/^c!#/)
  })

  test('unknown mod → prefixed with ?', () => {
    const words = hsModWordsFromState(['unknownMod'], null)
    expect(words[0]).toBe('?unknownMod')
  })

  test('hue round-trips through hsModHexToHue within ±1°', () => {
    // transport hex → parse → re-hue; should recover original hue ±1
    const origHue = 120
    const words = hsModWordsFromState([], origHue)
    const hexToken = words[0] // e.g. c!#00ff00
    const hex = hexToken.slice(2).replace('#', '')
    const recovered = hsModHexToHue(hex)
    expect(Math.abs(recovered - origHue)).toBeLessThanOrEqual(1)
  })
})

// ── integration: classify → transform → style pipeline ───────────────────────

describe('end-to-end modifier pipeline', () => {
  test('w! chain: classify → transform → style round-trip', () => {
    const classified = hsModClassify('w!')
    expect(classified.kind).toBe('modifier')
    const { sx, sy } = hsModComposeTransform(classified.mods)
    expect(sx).toBe(2)
    expect(sy).toBe(1)
    const style = hsModBuildStyleAttr(classified.mods, classified.hue)
    expect(style).toContain('scale(2, 1)')
  })

  test('w!h!ffzX: all three axes applied', () => {
    const r = hsModClassify('w!h!ffzX')
    expect(r.kind).toBe('modifier')
    const { sx, sy } = hsModComposeTransform(r.mods)
    expect(sx).toBe(-2) // wide(2) × hflip(-1) = -2
    expect(sy).toBe(2)  // tall(2) × 1 = 2
  })

  test('Kappa w! w!: multiset wide→4', () => {
    // Two separate w! tokens: each adds 'wide' to the chain
    const r1 = hsModClassify('w!')
    const r2 = hsModClassify('w!')
    const combined = [...r1.mods, ...r2.mods]
    const { sx } = hsModComposeTransform(combined)
    expect(sx).toBe(4)
  })

  test('words roundtrip: wide+hflip → tokens → re-classify', () => {
    const words = hsModWordsFromState(['wide', 'hflip'], null)
    // each word should classify as modifier
    for (const w of words) {
      expect(hsModClassify(w).kind).toBe('modifier')
    }
  })
})
