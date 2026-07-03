/**
 * Paint spec — structured JSON schema + compiler for animated username paints.
 *
 * SYNCED COPY of the heatsync monorepo's client/utils/paint-spec.js — keep
 * byte-close to the source of truth. Cross-repo auto-apply rule: a change to
 * either copy should be mirrored in the other (see feedback_cross_repo_posts_chats
 * in project memory). Only bundling-related adaptations belong here, never a
 * behavior fork — the ext must compile the exact same CSS the site does for
 * the exact same spec, or a paint would render differently across surfaces.
 *
 * Bundled into the multichat overlay only (twitch/kick/youtube bundles) via
 * build.js's readMultichatModules — see the emoji-data.js-style embed there.
 * Not part of the universal src/lib readLib() bundle since no other content
 * script needs a CSS compiler.
 *
 * Replaces the old free-text `username_css` column (migration 078, removed).
 * A paint is authored as data (base gradient + up to 3 effect layers + glow),
 * never as a raw CSS string, so it is injection-impossible by construction:
 * every color is regex-validated hex, every number is range-clamped, every
 * effect id is looked up against a fixed enum table — nothing user-typed is
 * ever concatenated into the compiled CSS string.
 *
 * Pure-data module — no DOM, no fetch. Shared between client (live preview +
 * chat-tile renderer) and server (PUT /api/user/paint validation) by design,
 * mirroring the client/settings/registry.js pattern already used for
 * server-side settings validation.
 *
 * Effect catalog ported from docs/paint-lab.html (34-effect reference lab).
 * Phase 1 ships 20 of those — see EFFECTS below for the exact source line
 * each was ported from.
 *
 * ── layering model ──────────────────────────────────────────────────────
 * Every paint is at most 3 layers:
 *   - `base`   the resting gradient (solid / linear / conic). Always present.
 *   - `effects[]` 0-3 animated layers, each in one of two slots:
 *       'paint'  — owns the background/color. At most ONE active (they are
 *                  mutually exclusive: you can't pan AND matrix-rain the
 *                  same text at once).
 *       'motion' — owns transform/filter/text-shadow, layered on top of
 *                  whatever the paint slot (or plain base) already painted.
 *                  Up to TWO active, but two effects that would animate the
 *                  exact same CSS property on the exact same element (e.g.
 *                  two `transform`-on-self effects) silently clobber each
 *                  other in real browsers, so the validator also rejects
 *                  same-signature combos — see motionSignature() below.
 *   - `glow`   optional constant text-shadow, independent of any effect.
 *
 * ── paint-slot color sourcing (design decision, see final report) ────────
 * pan / conic / hue / glint / reveal are "generic animators" — they animate
 * the user's own `base` gradient (pan/conic force linear/conic rendering
 * respectively since they need a directional/rotational gradient; hue/glint/
 * reveal are orthogonal to gradient type and always honor base as-is).
 * chrome / gold / fire / matrix / holo are "themed presets" — faithful ports
 * of the lab's fixed palettes (that fixed palette IS the point of picking
 * "gold foil"), so they render their own built-in gradient and `base` is
 * visually superseded (still stored/validated normally so switching the
 * effect off reverts to the user's base).
 */

// ── enums ──────────────────────────────────────────────────────────────────

const BASE_TYPES = new Set(['solid', 'linear', 'conic'])
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const GLOW_STRENGTHS = new Set([1, 2])

const MIN_SPEED = 0.25
const MAX_SPEED = 3
const MAX_EFFECTS = 3
const MIN_STOPS = 1
const MAX_STOPS = 8
// WCAG 2.3.1 flashing-content guard, stricter than the 3Hz threshold: any
// effect that changes luminance must have a real-world animation period of
// at least 1s AFTER the user's speed multiplier is applied.
const MIN_LUMINANCE_PERIOD_S = 1

/**
 * Effect metadata table — the single source of truth for slot assignment,
 * luminance classification, base (speed=1) animation period, and whether an
 * effect needs its target text split into per-letter spans.
 *
 * `sig` (motion effects only) is the (target, property) pair the effect's
 * keyframes animate. Two motion effects picked together must have distinct
 * `sig` values, or one silently overrides the other's computed value every
 * frame (a real CSS limitation — animations on the same property/element
 * don't compose, the later one in the animation-name list wins outright).
 */
const EFFECTS = {
  // ── paint slot — mutually exclusive, at most 1 ──────────────────────────
  pan:    { slot: 'paint', luminance: false, basePeriod: 5,   letterSplit: false, label: 'gradient pan' },
  conic:  { slot: 'paint', luminance: false, basePeriod: 6,   letterSplit: false, label: 'conic sweep' },
  hue:    { slot: 'paint', luminance: true,  basePeriod: 8,   letterSplit: false, label: 'hue cycle' },
  glint:  { slot: 'paint', luminance: false, basePeriod: 3.4, letterSplit: false, label: 'shimmer glint' },
  chrome: { slot: 'paint', luminance: false, basePeriod: 4.5, letterSplit: false, label: 'liquid chrome' },
  gold:   { slot: 'paint', luminance: false, basePeriod: 5,   letterSplit: false, label: 'gold foil' },
  fire:   { slot: 'paint', luminance: false, basePeriod: 1.8, letterSplit: false, label: 'fire' },
  matrix: { slot: 'paint', luminance: false, basePeriod: 3.2, letterSplit: false, label: 'matrix rain' },
  holo:   { slot: 'paint', luminance: false, basePeriod: 2.8, letterSplit: false, label: 'hologram' },
  reveal: { slot: 'paint', luminance: false, basePeriod: 3,   letterSplit: false, label: 'mask reveal' },

  // ── motion/glow slot — up to 2, distinct sig required ───────────────────
  wave:   { slot: 'motion', luminance: false, basePeriod: 1.6, letterSplit: true,  label: 'letter wave',   sig: 'letter:transform' },
  ripple: { slot: 'motion', luminance: true,  basePeriod: 2.4, letterSplit: true,  label: 'rainbow ripple', sig: 'letter:filter' },
  coin:   { slot: 'motion', luminance: false, basePeriod: 5,   letterSplit: false, label: 'coin spin',     sig: 'self:transform' },
  heli:   { slot: 'motion', luminance: false, basePeriod: 2.2, letterSplit: false, label: 'helicopter',    sig: 'self:transform' },
  float:  { slot: 'motion', luminance: false, basePeriod: 5.5, letterSplit: false, label: 'zero-g float',  sig: 'self:transform' },
  heart:  { slot: 'motion', luminance: false, basePeriod: 1.3, letterSplit: false, label: 'heartbeat',     sig: 'self:transform' },
  wobble: { slot: 'motion', luminance: false, basePeriod: 2.8, letterSplit: false, label: 'wobble stretch', sig: 'self:transform' },
  swing:  { slot: 'motion', luminance: false, basePeriod: 2.6, letterSplit: false, label: 'pendulum',      sig: 'self:transform' },
  tumble: { slot: 'motion', luminance: false, basePeriod: 3.4, letterSplit: true,  label: 'letter tumble', sig: 'letter:transform' },
  neon:   { slot: 'motion', luminance: true,  basePeriod: 2.6, letterSplit: false, label: 'neon breathe',  sig: 'self:shadow' },
}

const EFFECT_IDS = new Set(Object.keys(EFFECTS))
const LETTER_SPLIT_IDS = new Set(Object.entries(EFFECTS).filter(([, m]) => m.letterSplit).map(([id]) => id))

// ── small pure helpers ───────────────────────────────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isIntInRange(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v) && v >= min && v <= max
}

function isNumInRange(v, min, max) {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
}

/** FNV-1a 32-bit hash, base36-encoded. Sync + dependency-free — stable
 * across processes/platforms, adequate for cosmetic CSS class/keyframe
 * naming (collisions are a visual dedup nit, not a security concern). */
function fnv1a(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Stable short hash of a spec — same spec (same key order irrelevant,
 * we JSON.stringify a normalized/sorted form) → same hash. */
export function hashPaintSpec(spec) {
  return fnv1a(JSON.stringify(normalizeForHash(spec)))
}

function normalizeForHash(spec) {
  // Deterministic shape regardless of input key order.
  return {
    v: spec?.v,
    base: spec?.base && {
      type: spec.base.type,
      angle: spec.base.angle,
      stops: Array.isArray(spec.base.stops) ? spec.base.stops.map(s => ({ color: s?.color, pos: s?.pos })) : [],
    },
    effects: Array.isArray(spec?.effects) ? spec.effects.map(e => ({ id: e?.id, speed: e?.speed })) : [],
    glow: spec?.glow ? { color: spec.glow.color, strength: spec.glow.strength } : null,
  }
}

// ── validation ───────────────────────────────────────────────────────────

/**
 * Validate a paint spec against v1 schema + safety rules.
 * @param {*} spec
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePaintSpec(spec) {
  const errors = []

  if (!isPlainObject(spec)) {
    return { ok: false, errors: ['spec must be an object'] }
  }
  if (spec.v !== 1) {
    errors.push('v must be exactly 1')
  }

  // ── base ──
  if (!isPlainObject(spec.base)) {
    errors.push('base must be an object')
  } else {
    const { type, angle, stops } = spec.base
    if (!BASE_TYPES.has(type)) {
      errors.push(`base.type must be one of solid|linear|conic, got ${JSON.stringify(type)}`)
    }
    if (!isIntInRange(angle, 0, 360)) {
      errors.push('base.angle must be an integer 0-360')
    }
    if (!Array.isArray(stops) || stops.length < MIN_STOPS || stops.length > MAX_STOPS) {
      errors.push(`base.stops must be an array of ${MIN_STOPS}-${MAX_STOPS} stops`)
    } else {
      stops.forEach((s, i) => {
        if (!isPlainObject(s) || typeof s.color !== 'string' || !HEX_RE.test(s.color)) {
          errors.push(`base.stops[${i}].color must match #rrggbb`)
        }
        if (!isIntInRange(s.pos, 0, 100)) {
          errors.push(`base.stops[${i}].pos must be an integer 0-100`)
        }
      })
      if (type === 'solid' && stops.length !== 1) {
        errors.push('base.type solid requires exactly 1 stop')
      }
    }
  }

  // ── effects ──
  if (!Array.isArray(spec.effects)) {
    errors.push('effects must be an array')
  } else if (spec.effects.length > MAX_EFFECTS) {
    errors.push(`effects must have at most ${MAX_EFFECTS} entries`)
  } else {
    const seenIds = new Set()
    let paintCount = 0
    const motionSigs = new Set()
    let motionCount = 0
    let structurallyValid = true

    spec.effects.forEach((e, i) => {
      if (!isPlainObject(e)) {
        errors.push(`effects[${i}] must be an object`)
        structurallyValid = false
        return
      }
      if (!EFFECT_IDS.has(e.id)) {
        errors.push(`effects[${i}].id unknown: ${JSON.stringify(e.id)}`)
        structurallyValid = false
        return
      }
      if (!isNumInRange(e.speed, MIN_SPEED, MAX_SPEED)) {
        errors.push(`effects[${i}].speed must be a number ${MIN_SPEED}-${MAX_SPEED}`)
        structurallyValid = false
      }
      if (seenIds.has(e.id)) {
        errors.push(`duplicate effect id: ${e.id}`)
      }
      seenIds.add(e.id)

      const meta = EFFECTS[e.id]
      if (meta.slot === 'paint') {
        paintCount++
      } else {
        motionCount++
        if (motionSigs.has(meta.sig)) {
          errors.push(`effects: "${e.id}" conflicts with another selected effect animating the same property (${meta.sig}) — pick effects with different motion targets`)
        }
        motionSigs.add(meta.sig)
      }
    })

    if (structurallyValid) {
      if (paintCount > 1) errors.push('at most 1 paint-slot effect allowed (pan/conic/hue/glint/chrome/gold/fire/matrix/holo/reveal are mutually exclusive)')
      if (motionCount > 2) errors.push('at most 2 motion-slot effects allowed')
    }
  }

  // ── glow ──
  if (spec.glow !== null && spec.glow !== undefined) {
    if (!isPlainObject(spec.glow)) {
      errors.push('glow must be null or an object')
    } else {
      if (typeof spec.glow.color !== 'string' || !HEX_RE.test(spec.glow.color)) {
        errors.push('glow.color must match #rrggbb')
      }
      if (!GLOW_STRENGTHS.has(spec.glow.strength)) {
        errors.push('glow.strength must be 1 or 2')
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

/** True if the spec's effects include any per-letter effect (wave/ripple/tumble). */
export function paintNeedsLetterSplit(spec) {
  if (!spec || !Array.isArray(spec.effects)) return false
  return spec.effects.some(e => LETTER_SPLIT_IDS.has(e?.id))
}

// ── compiler ─────────────────────────────────────────────────────────────

function safeHex(color) {
  return HEX_RE.test(color) ? color.toLowerCase() : '#e4e4e4'
}

function safeAngle(angle) {
  const n = Math.round(Number(angle))
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : 0
}

function safePos(pos) {
  const n = Math.round(Number(pos))
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

function safeSpeed(speed) {
  const n = Number(speed)
  return Number.isFinite(n) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, n)) : 1
}

function sortedStops(base) {
  const stops = Array.isArray(base?.stops) ? base.stops : []
  return stops
    .filter(s => isPlainObject(s) && HEX_RE.test(s?.color) && isIntInRange(s.pos, 0, 100))
    .map(s => ({ color: safeHex(s.color), pos: safePos(s.pos) }))
    .sort((a, b) => a.pos - b.pos)
}

/** duration in seconds for an effect at the given speed, with the WCAG
 * luminance floor applied when the effect changes luminance. */
function effectDuration(effectId, speed) {
  const meta = EFFECTS[effectId]
  const spd = safeSpeed(speed)
  let seconds = meta.basePeriod / spd
  if (meta.luminance) seconds = Math.max(MIN_LUMINANCE_PERIOD_S, seconds)
  return Math.round(seconds * 1000) / 1000
}

function gradientStopsCss(stops) {
  return stops.map(s => `${s.color} ${s.pos}%`).join(', ')
}

/** Build the CSS for the resting `base` paint. Returns { decl, isClipText }. */
function buildBaseCss(base, stops) {
  if (base.type === 'solid') {
    const color = stops[0]?.color || '#e4e4e4'
    return { decl: `color:${color};`, isClipText: false, cssImage: `linear-gradient(${color}, ${color})` }
  }
  const angle = safeAngle(base.angle)
  const image = base.type === 'linear'
    ? `linear-gradient(${angle}deg, ${gradientStopsCss(stops)})`
    : `conic-gradient(from ${angle}deg, ${gradientStopsCss(stops)})`
  return {
    decl: `background:${image};-webkit-background-clip:text;background-clip:text;color:transparent;`,
    isClipText: true,
    cssImage: image,
  }
}

// ── themed paint presets (fixed palettes, faithful port of paint-lab.html) ──

const THEMED_PAINT = {
  chrome: {
    gradient: 'linear-gradient(100deg, #6b7280, #e5e7eb 20%, #4b5563 38%, #f3f4f6 52%, #374151 70%, #d1d5db 88%, #6b7280)',
    size: '220% 100%',
    timing: 'ease-in-out',
    direction: 'alternate',
    keyframes: (name) => `@keyframes ${name}{to{background-position:120% 0;}}`,
  },
  gold: {
    gradient:
      'repeating-linear-gradient(115deg, transparent 0 3px, #ffffff2e 3px 4px), ' +
      'linear-gradient(90deg, #7a5900, #ffd700 30%, #fff3b0 50%, #ffd700 70%, #7a5900)',
    size: '100% 100%, 200% 100%',
    timing: 'ease-in-out',
    direction: 'alternate',
    keyframes: (name) => `@keyframes ${name}{to{background-position:0 0, 100% 0;}}`,
  },
  fire: {
    gradient: 'linear-gradient(0deg, #870000, #d70000 35%, #ff8700 65%, #ffd700 90%)',
    size: '100% 300%',
    timing: 'ease-in-out',
    direction: 'alternate',
    keyframes: (name) => `@keyframes ${name}{from{background-position:0 100%;transform:skewX(0);}to{background-position:0 40%;transform:skewX(-1.5deg);}}`,
  },
  matrix: {
    gradient: 'repeating-linear-gradient(0deg, #003300 0 6px, #00d700 6px 9px, #00ff87 9px 10px)',
    size: '100% 340%',
    timing: 'linear',
    direction: 'normal',
    keyframes: (name) => `@keyframes ${name}{to{background-position:0 340%;}}`,
  },
  holo: {
    gradient: 'repeating-linear-gradient(0deg, #00e5ff 0 2px, #007a88 2px 4px)',
    size: '100% 200%',
    timing: 'linear',
    direction: 'normal',
    keyframes: (name) => `@keyframes ${name}{to{background-position:0 200%;}}`,
  },
}

/** Build the CSS for a `paint`-slot effect. selector is the outer `.hsp-<hash>`. */
function buildPaintEffectCss(effectId, speed, base, stops, selector, hash) {
  const duration = effectDuration(effectId, speed)
  const animName = `hsp_${hash}_${effectId}`

  if (THEMED_PAINT[effectId]) {
    const t = THEMED_PAINT[effectId]
    const rule = `${selector}{background:${t.gradient};background-size:${t.size};-webkit-background-clip:text;background-clip:text;color:transparent;animation:${animName} ${duration}s ${t.timing} infinite ${t.direction};}`
    return rule + t.keyframes(animName)
  }

  if (effectId === 'pan') {
    // Force linear rendering — pan is a directional positional sweep, and
    // needs the gradient axis a linear-gradient provides. Append the first
    // stop again so the pan wraps without a visible seam.
    const angle = safeAngle(base.angle)
    const wrapStops = stops.length ? [...stops, { color: stops[0].color, pos: 100 }] : stops
    const image = `linear-gradient(${angle}deg, ${gradientStopsCss(wrapStops)})`
    const rule = `${selector}{background:${image};background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:${animName} ${duration}s linear infinite;}`
    const kf = `@keyframes ${animName}{to{background-position:300% 0;}}`
    return rule + kf
  }

  if (effectId === 'conic') {
    // Force conic rendering — rotates the whole wheel via a namespaced
    // @property angle custom prop so two users' paints never collide.
    const angleVar = `--hsp-${hash}-ang`
    const angle = safeAngle(base.angle)
    const wrapStops = stops.length ? [...stops, { color: stops[0].color, pos: 100 }] : stops
    const image = `conic-gradient(from calc(${angle}deg + var(${angleVar})), ${gradientStopsCss(wrapStops)})`
    const rule = `${selector}{background:${image};-webkit-background-clip:text;background-clip:text;color:transparent;animation:${animName} ${duration}s linear infinite;}`
    const kf = `@property ${angleVar}{syntax:"<angle>";initial-value:0deg;inherits:false;}` +
      `@keyframes ${animName}{to{${angleVar}:360deg;}}`
    return rule + kf
  }

  if (effectId === 'hue') {
    // Orthogonal to gradient type — filter applies post-render regardless
    // of how base painted the text.
    const baseCss = buildBaseCss(base, stops)
    const rule = `${selector}{${baseCss.decl}animation:${animName} ${duration}s linear infinite;}`
    const kf = `@keyframes ${animName}{to{filter:hue-rotate(360deg);}}`
    return rule + kf
  }

  if (effectId === 'glint') {
    const baseCss = buildBaseCss(base, stops)
    const image = `linear-gradient(115deg, transparent 38%, #ffffffcc 50%, transparent 62%) no-repeat, ${baseCss.cssImage}`
    const rule = `${selector}{background:${image};background-size:250% 100%, 100% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:${animName} ${duration}s ease-in-out infinite;}`
    const kf = `@keyframes ${animName}{0%{background-position:210% 0, 0 0;}100%{background-position:-110% 0, 0 0;}}`
    return rule + kf
  }

  if (effectId === 'reveal') {
    const baseCss = buildBaseCss(base, stops)
    const mask = 'linear-gradient(90deg, #000 30%, #0003 50%, #000 70%)'
    const rule = `${selector}{${baseCss.decl}-webkit-mask-image:${mask};mask-image:${mask};-webkit-mask-size:300% 100%;mask-size:300% 100%;animation:${animName} ${duration}s linear infinite;}`
    const kf = `@keyframes ${animName}{from{-webkit-mask-position:130% 0;mask-position:130% 0;}to{-webkit-mask-position:-130% 0;mask-position:-130% 0;}}`
    return rule + kf
  }

  return ''
}

/** Build the CSS for a `motion`-slot effect. Applies on top of whatever the
 * base/paint layer already painted — never touches color/background. */
function buildMotionEffectCss(effectId, speed, selector, hash, glow) {
  const duration = effectDuration(effectId, speed)
  const animName = `hsp_${hash}_${effectId}`

  switch (effectId) {
    case 'wave': {
      const rule = `${selector} span{animation:${animName} ${duration}s ease-in-out infinite;animation-delay:calc(var(--i) * ${(0.09 / safeSpeed(speed)).toFixed(4)}s);}`
      const kf = `@keyframes ${animName}{0%,100%{transform:translateY(0);}50%{transform:translateY(-4px);}}`
      return rule + kf
    }
    case 'ripple': {
      const rule = `${selector} span{animation:${animName} ${duration}s linear infinite;animation-delay:calc(var(--i) * -${(0.18 / safeSpeed(speed)).toFixed(4)}s);}`
      const kf = `@keyframes ${animName}{to{filter:hue-rotate(360deg);}}`
      return rule + kf
    }
    case 'coin': {
      const rule = `${selector}{animation:${animName} ${duration}s cubic-bezier(.6,0,.4,1) infinite;transform-style:preserve-3d;}`
      const kf = `@keyframes ${animName}{0%,55%{transform:rotateY(0);}75%{transform:rotateY(180deg);}95%,100%{transform:rotateY(360deg);}}`
      return rule + kf
    }
    case 'heli': {
      const rule = `${selector}{animation:${animName} ${duration}s linear infinite;}`
      const kf = `@keyframes ${animName}{to{transform:rotate(360deg);}}`
      return rule + kf
    }
    case 'float': {
      const rule = `${selector}{animation:${animName} ${duration}s ease-in-out infinite;}`
      const kf = `@keyframes ${animName}{0%,100%{transform:translateY(1.5px) rotate(-1.6deg);}50%{transform:translateY(-2.5px) rotate(1.6deg);}}`
      return rule + kf
    }
    case 'heart': {
      const rule = `${selector}{animation:${animName} ${duration}s ease-out infinite;}`
      const kf = `@keyframes ${animName}{0%,28%,100%{transform:scale(1);}10%{transform:scale(1.11);}20%{transform:scale(1.04);}}`
      return rule + kf
    }
    case 'wobble': {
      const rule = `${selector}{animation:${animName} ${duration}s ease-in-out infinite;}`
      const kf = `@keyframes ${animName}{0%,100%{transform:scaleX(1);}50%{transform:scaleX(1.09);}}`
      return rule + kf
    }
    case 'swing': {
      const rule = `${selector}{transform-origin:50% -60%;animation:${animName} ${duration}s ease-in-out infinite;}`
      const kf = `@keyframes ${animName}{0%,100%{transform:rotate(4.5deg);}50%{transform:rotate(-4.5deg);}}`
      return rule + kf
    }
    case 'tumble': {
      const rule = `${selector}{perspective:300px;}${selector} span{animation:${animName} ${duration}s cubic-bezier(.5,0,.5,1) infinite;animation-delay:calc(var(--i) * ${(0.12 / safeSpeed(speed)).toFixed(4)}s);transform-style:preserve-3d;}`
      const kf = `@keyframes ${animName}{0%,60%,100%{transform:rotateX(0);}75%{transform:rotateX(180deg);}90%{transform:rotateX(360deg);}}`
      return rule + kf
    }
    case 'neon': {
      const color = glow && HEX_RE.test(glow.color) ? safeHex(glow.color) : '#ff40af'
      const scale = glow && glow.strength === 2 ? 1.6 : 1
      const r1 = Math.round(4 * scale), r2 = Math.round(11 * scale)
      const r1b = Math.round(6 * scale), r2b = Math.round(22 * scale), r3b = Math.round(40 * scale)
      const rule = `${selector}{animation:${animName} ${duration}s ease-in-out infinite;}`
      const kf = `@keyframes ${animName}{0%,100%{text-shadow:0 0 ${r1}px ${color}80, 0 0 ${r2}px ${color}40;}50%{text-shadow:0 0 ${r1b}px ${color}cc, 0 0 ${r2b}px ${color}88, 0 0 ${r3b}px ${color}44;}}`
      return rule + kf
    }
    default:
      return ''
  }
}

function buildGlowCss(glow, selector) {
  if (!glow || !HEX_RE.test(glow.color)) return ''
  const color = safeHex(glow.color)
  const [r1, r2] = glow.strength === 2 ? [10, 26] : [6, 14]
  return `${selector}{text-shadow:0 0 ${r1}px ${color}cc, 0 0 ${r2}px ${color}66;}`
}

/**
 * Compile a validated paint spec to a CSS string scoped under `selector`
 * (e.g. `.hsp-<hash>`). Assumes `spec` already passed validatePaintSpec —
 * every value is still re-clamped/re-matched here for defense in depth, so
 * even a spec that reached this function unvalidated cannot inject anything:
 * unknown effect ids are silently skipped, non-hex colors fall back to a
 * neutral gray, out-of-range numbers are clamped.
 * @param {object} spec
 * @param {string} selector
 * @param {object} [opts]
 * @returns {string} css
 */
export function compilePaintCss(spec, selector, opts = {}) {
  if (!isPlainObject(spec) || typeof selector !== 'string' || !selector) return ''
  const hash = opts.hash || hashPaintSpec(spec)
  const base = isPlainObject(spec.base) ? spec.base : { type: 'solid', angle: 0, stops: [{ color: '#e4e4e4', pos: 0 }] }
  const stops = sortedStops(base)
  const effects = Array.isArray(spec.effects) ? spec.effects.filter(e => isPlainObject(e) && EFFECT_IDS.has(e.id)) : []
  const paintEffect = effects.find(e => EFFECTS[e.id].slot === 'paint')
  const motionEffects = effects.filter(e => EFFECTS[e.id].slot === 'motion')
  const needsLetterSplit = paintNeedsLetterSplit(spec)

  let css = `${selector}{display:inline-block;`
  if (needsLetterSplit) css += `` // spans get display:inline-block in their own rule below
  if (!paintEffect) {
    const baseCss = buildBaseCss(base, stops)
    css += baseCss.decl
  }
  css += '}'
  if (needsLetterSplit) css += `${selector} span{display:inline-block;}`

  if (paintEffect) {
    css += buildPaintEffectCss(paintEffect.id, paintEffect.speed, base, stops, selector, hash)
  }
  for (const e of motionEffects) {
    css += buildMotionEffectCss(e.id, e.speed, selector, hash, spec.glow)
  }

  // Static glow — skip if neon is active and sourced the same color (neon's
  // own keyframes already carry a shadow on every frame); otherwise layer
  // the constant shadow on so it doesn't require an active effect to show.
  const hasNeon = motionEffects.some(e => e.id === 'neon')
  if (spec.glow && !hasNeon) {
    css += buildGlowCss(spec.glow, selector)
  }

  return css
}

export { EFFECTS, EFFECT_IDS }
