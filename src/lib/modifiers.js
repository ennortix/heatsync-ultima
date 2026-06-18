// FFZ/BTTV-style modifier system — single source of truth.
// Bundled into every content script via build.js readLib(). No exports.
//
// Surfaces consuming this module:
//   chrome/content.js          (Twitch native chat output + input preview)
//   src/multichat/emotes.js    (multichat overlay chat output)
//   src/multichat/input.js     (multichat overlay input box)
//
// Semantics:
// - A modifier token attaches to the IMMEDIATELY PRECEDING emote (base or overlay)
// - Multiset compounding: "Kappa w! w!" → 4x wide
// - Each axis clamped to ±MAX_SCALE (chat layout breaks past)
// - Chained shorthand: "w!h!ffzX" peels into [wide, tall, hflip]
// - Color: "c!#ff8700" tints via hue-rotate (peel-friendly: "w!c!#ff8700h!")
// - Prefix completion: "w" → "w!", "ffzx" → "ffzX"

const HS_MOD_TOKENS = Object.freeze({
  'w!': 'wide',
  'h!': 'tall',
  'v!': 'vmirror',
  'l!': 'hflip',
  'c!': 'cursed',
  'z!': 'wide',
  'x!': 'hflip',
  'y!': 'vmirror',
  'ffzX': 'hflip',
  'ffzY': 'vmirror',
  'ffzW': 'wide',
  'ffzWide': 'wide',
  'ffzTall': 'tall',
  'ffzCursed': 'cursed'
})

const HS_MOD_TOKEN_KEYS = Object.keys(HS_MOD_TOKENS)
const HS_MOD_KEYS_BY_LEN = HS_MOD_TOKEN_KEYS.slice().sort((a, b) => b.length - a.length)

// Reverse map (mod-class → preferred wire token for serialization)
const HS_MOD_CLASS_TO_TOKEN = Object.freeze({
  wide: 'w!',
  tall: 'h!',
  hflip: 'ffzX',
  vmirror: 'ffzY',
  cursed: 'c!'
})

const HS_MOD_C_HEX_RE = /^c!#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const HS_MOD_C_HEX_PEEL_RE = /^c!#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/
const HS_MOD_MAX_SCALE = 4

// Convert hex (3 or 6 chars, with or without #) to hue degrees [0, 359]
function hsModHexToHue(hex) {
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return Math.round(h)
}

// Resolve a possibly-partial typed shorthand to its canonical token.
// "w" → "w!", "ffzx" → "ffzX", "ffzwide" → "ffzWide". Null if ambiguous.
function hsModResolvePrefix(word) {
  if (!word) return null
  if (HS_MOD_TOKENS[word]) return word
  if (HS_MOD_C_HEX_RE.test(word)) return word
  const lower = word.toLowerCase()
  for (const tok of HS_MOD_TOKEN_KEYS) {
    if (tok.toLowerCase() === lower) return tok
  }
  const matches = HS_MOD_TOKEN_KEYS.filter(k => k.toLowerCase().startsWith(lower))
  return matches.length === 1 ? matches[0] : null
}

// Peel concatenated chain like "w!h!ffzX" → { mods, hue, words } or null
function hsModPeelChain(word) {
  if (!word) return null
  const mods = []
  const words = []
  let hue = null
  let rem = word
  while (rem.length > 0) {
    let matched = false
    for (const k of HS_MOD_KEYS_BY_LEN) {
      if (rem.startsWith(k)) {
        mods.push(HS_MOD_TOKENS[k])
        words.push(k)
        rem = rem.slice(k.length)
        matched = true
        break
      }
    }
    if (matched) continue
    const cm = rem.match(HS_MOD_C_HEX_PEEL_RE)
    if (cm) {
      hue = hsModHexToHue(cm[1])
      words.push(cm[0])
      rem = rem.slice(cm[0].length)
      continue
    }
    return null
  }
  return (mods.length || hue != null) ? { mods, hue, words } : null
}

// Universal classifier — combines exact, color, peel, optional prefix logic.
// Returns: { kind: 'modifier', mods: [...], hue: number|null, words: [...] }
//        | { kind: 'plain' }
function hsModClassify(word, opts) {
  if (!word) return { kind: 'plain' }
  const allowPrefix = opts && opts.allowPrefix
  const exact = HS_MOD_TOKENS[word]
  if (exact) return { kind: 'modifier', mods: [exact], hue: null, words: [word] }
  const cm = word.match(HS_MOD_C_HEX_RE)
  if (cm) return { kind: 'modifier', mods: [], hue: hsModHexToHue(cm[1]), words: [word] }
  const peeled = hsModPeelChain(word)
  if (peeled) return { kind: 'modifier', ...peeled }
  if (allowPrefix) {
    const resolved = hsModResolvePrefix(word)
    if (resolved && resolved !== word) {
      const r2 = hsModClassify(resolved)
      if (r2.kind === 'modifier') return Object.assign({}, r2, { resolvedFrom: word })
    }
  }
  return { kind: 'plain' }
}

// Multiset compose → transform { sx, sy }, clamped to ±MAX_SCALE
function hsModComposeTransform(mods) {
  let sx = 1, sy = 1
  if (mods) for (const m of mods) {
    if (m === 'wide') sx *= 2
    else if (m === 'tall') sy *= 2
    else if (m === 'hflip') sx *= -1
    else if (m === 'vmirror') sy *= -1
  }
  sx = Math.min(Math.max(sx, -HS_MOD_MAX_SCALE), HS_MOD_MAX_SCALE)
  sy = Math.min(Math.max(sy, -HS_MOD_MAX_SCALE), HS_MOD_MAX_SCALE)
  return { sx, sy }
}

// CSS filter string from mods + hue
function hsModComposeFilter(mods, hue) {
  let f = ''
  if (mods && mods.includes('cursed')) f += ' hue-rotate(45deg) saturate(2)'
  if (hue != null) f += ` hue-rotate(${hue}deg) saturate(1.6)`
  return f.trim()
}

// Read accumulated mod state from a DOM element's dataset
function hsModRead(el) {
  if (!el || !el.dataset) return { mods: [], hue: null, words: [] }
  return {
    mods: el.dataset.hsMods ? el.dataset.hsMods.split(',').filter(Boolean) : [],
    hue: el.dataset.hsHue != null && el.dataset.hsHue !== '' ? Number(el.dataset.hsHue) : null,
    words: el.dataset.hsWords ? el.dataset.hsWords.split(/\s+/).filter(Boolean) : []
  }
}

// Apply mods/hue/words to an img element — sets dataset + inline transform/filter.
// additive (default true): append to existing instead of replacing.
function hsModApplyToImg(img, addMods, addHue, addWords, opts) {
  if (!img) return
  const additive = !opts || opts.additive !== false
  const cur = hsModRead(img)
  const finalMods = additive ? cur.mods.concat(addMods || []) : (addMods || [])
  const finalWords = additive ? cur.words.concat(addWords || []) : (addWords || [])
  let finalHue = addHue
  if (finalHue == null && additive) finalHue = cur.hue
  img.dataset.hsMods = finalMods.join(',')
  img.dataset.hsWords = finalWords.join(' ')
  if (finalHue != null) img.dataset.hsHue = String(finalHue); else delete img.dataset.hsHue
  const { sx, sy } = hsModComposeTransform(finalMods)
  const filter = hsModComposeFilter(finalMods, finalHue)
  if (sx !== 1 || sy !== 1) {
    img.style.setProperty('transform', `scale(${sx}, ${sy})`, 'important')
    img.style.setProperty('transform-origin', 'center', 'important')
    const fx = Math.abs(sx), fy = Math.abs(sy)
    img.style.setProperty('margin', `0 calc(0.5em * ${Math.max(0, fx - 1)})`, 'important')
  } else {
    img.style.removeProperty('transform')
    img.style.removeProperty('transform-origin')
    img.style.removeProperty('margin')
  }
  if (filter) img.style.setProperty('filter', filter, 'important')
  else img.style.removeProperty('filter')
}

// Build inline style attribute string for HTML-rendered emotes (multichat output)
function hsModBuildStyleAttr(mods, hue) {
  const { sx, sy } = hsModComposeTransform(mods)
  const filter = hsModComposeFilter(mods, hue)
  let style = ''
  if (sx !== 1 || sy !== 1) {
    style += `transform:scale(${sx}, ${sy}) !important;transform-origin:center !important;`
    const fx = Math.abs(sx), fy = Math.abs(sy)
    if (fx > 1) {
      const halfX = `calc(var(--hs-emote-width,28px) * ${(fx - 1) / 2})`
      style += `margin-left:${halfX} !important;margin-right:${halfX} !important;`
    }
    if (fy > 1) {
      const halfY = `calc(var(--hs-emote-height,28px) * ${(fy - 1) / 2})`
      style += `margin-top:${halfY} !important;margin-bottom:${halfY} !important;`
    }
  }
  if (filter) style += `filter:${filter} !important;`
  return style
}

// Inject a style attribute into the OUTERMOST <span ...> in an HTML string.
// Used by multichat string-render to attach modifier styles to emote wrappers.
function hsModInjectWrapperStyle(html, styleStr) {
  if (!styleStr) return html
  return html.replace(/^(<span[^>]*?)(\sstyle="([^"]*)")?(>)/, (m, p1, _full, existing, gt) => {
    if (existing) return `${p1} style="${existing};${styleStr}"${gt}`
    return `${p1} style="${styleStr}"${gt}`
  })
}

export {
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
}

// Convert mod-class array back to wire tokens for sending. Hue lossy → c!#hex
// can't recover original hex (we only stored degrees). Recipient still tints.
function hsModWordsFromState(mods, hue) {
  const out = []
  for (const m of (mods || [])) {
    out.push(HS_MOD_CLASS_TO_TOKEN[m] || ('?' + m))
  }
  if (hue != null) {
    // Convert hue degrees back to a hex (saturation/lightness fixed) for transport
    const h = ((hue % 360) + 360) % 360
    const c = 1
    const x = 1 - Math.abs(((h / 60) % 2) - 1)
    let r = 0, g = 0, b = 0
    if (h < 60)       { r = c; g = x; b = 0 }
    else if (h < 120) { r = x; g = c; b = 0 }
    else if (h < 180) { r = 0; g = c; b = x }
    else if (h < 240) { r = 0; g = x; b = c }
    else if (h < 300) { r = x; g = 0; b = c }
    else              { r = c; g = 0; b = x }
    const hex = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
    out.push('c!' + hex)
  }
  return out
}
