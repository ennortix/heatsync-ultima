// @ts-check
/**
 * Shared utilities for heatsync extension.
 * XSS prevention, DOM helpers, debouncing, etc.
 */

// ============================================
// XSS PREVENTION (CRITICAL)
// ============================================

/**
 * Escape HTML entities to prevent XSS
 * @param {string} str - Untrusted string
 * @returns {string} Escaped string safe for innerHTML
 */
function escapeHtml(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Validate URL — only http/https protocols allowed.
 * Returns the URL string if safe, empty string otherwise.
 * Use before assigning user/third-party data to img.src or a.href.
 *
 * Defense-in-depth: explicit deny-list before URL() parsing to guard against
 * browser quirks where new URL('javascript:...') returns that protocol cleanly.
 * @param {string} url
 * @returns {string}
 */
// Invisible/zero-width chars that trim() misses but can prefix a dangerous scheme:
// U+200B zero-width space, U+200C zero-width non-joiner, U+200D zero-width joiner,
// U+2060 word joiner, U+FEFF BOM/zero-width no-break space, U+00AD soft hyphen.
// ASCII controls (0x00–0x1F and 0x7F) are also stripped — trim() only removes
// whitespace (0x09–0x0D, 0x20), leaving null bytes and other controls intact.
const _INVISIBLE_RE = /[\x00-\x1F\x7F­​‌‍⁠﻿]/g

function safeUrl(url) {
  if (typeof url !== 'string' || !url) return ''
  const clean = url.replace(_INVISIBLE_RE, '')
  const head = clean.trim().slice(0, 32).toLowerCase()
  if (
    head.startsWith('javascript:') ||
    head.startsWith('data:') ||
    head.startsWith('vbscript:') ||
    head.startsWith('blob:') ||
    head.startsWith('file:') ||
    head.startsWith('about:')
  )
    return ''
  try {
    const u = new URL(clean.trim())
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''
  } catch {
    return ''
  }
}

/**
 * Create element with safe text content (no innerHTML)
 * @param {string} tag
 * @param {string} text
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function createElement(tag, text, className) {
  const el = document.createElement(tag)
  if (text) el.textContent = text
  if (className) el.className = className
  return el
}

// ============================================
// DOM HELPERS
// ============================================

/**
 * Query selector (first match)
 * @param {string} selector
 * @param {Element|Document} [parent=document]
 * @returns {Element|null}
 */
function $(selector, parent = document) {
  return parent.querySelector(selector)
}

/**
 * Query selector all
 * @param {string} selector
 * @param {Element|Document} [parent=document]
 * @returns {NodeListOf<Element>}
 */
function $$(selector, parent = document) {
  return parent.querySelectorAll(selector)
}

// ============================================
// REACT FIBER HELPERS (FFZ-style)
// ============================================

/**
 * Get React fiber from DOM element
 * @param {Element} el
 * @returns {object|null}
 */
function getFiber(el) {
  if (!el) return null
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'))
  return key ? el[key] : null
}

/**
 * Find React component by walking fiber tree
 * @param {Element} startEl
 * @param {Function} predicate - (instance, fiber) => boolean
 * @param {number} [maxDepth=50]
 * @returns {{ instance: object, fiber: object } | null}
 */
function findComponent(startEl, predicate, maxDepth = 50) {
  let fiber = getFiber(startEl)
  let depth = 0
  while (fiber && depth < maxDepth) {
    try {
      const inst = fiber.stateNode
      if (inst && predicate(inst, fiber)) {
        return { instance: inst, fiber }
      }
    } catch (e) {}
    fiber = fiber.return
    depth++
  }
  return null
}

// ============================================
// LOGGING
// ============================================

// localStorage can be absent (service worker) or throw on access (sandboxed
// iframe, privacy mode → SecurityError). Guard the global independently of
// `window` so a debug-flag read never crashes module init.
function safeLocalStorageGet(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  } catch {
    return null
  }
}

const DEBUG =
  (typeof window !== 'undefined' && !!window.HEATSYNC_DEBUG) || safeLocalStorageGet('heatsync_debug') === 'true'

// ============================================
// READABLE NAME COLOR (luminance boost)
// ============================================

/**
 * Boost a hex color so it's readable on a dark/black bg.
 * Uses WCAG relative luminance — catches pure blue (#0000ff) which has
 * HSL L=0.5 but perceptual L≈0.07, invisible on black.
 * Raises HSL L (preserving hue + saturation) until relL clears threshold.
 * @param {string} hex - "#rgb" or "#rrggbb"
 * @param {number} [minRelL=0.25] - minimum WCAG relative luminance (0..1)
 * @returns {string}
 */
function boostReadability(hex, minRelL = 0.25) {
  if (typeof hex !== 'string') return hex
  const m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return hex
  let h6 = m[1]
  if (h6.length === 3) h6 = h6[0] + h6[0] + h6[1] + h6[1] + h6[2] + h6[2]
  const r = parseInt(h6.slice(0, 2), 16) / 255
  const g = parseInt(h6.slice(2, 4), 16) / 255
  const b = parseInt(h6.slice(4, 6), 16) / 255
  const relL = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (relL >= minRelL) return hex
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  let h,
    s,
    l = (max + min) / 2
  if (max === min) {
    h = 0
    s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const rgbAt = (ll) => {
    const q = ll < 0.5 ? ll * (1 + s) : ll + s - ll * s
    const p = 2 * ll - q
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)]
  }
  let lT = Math.max(l, 0.5)
  let rr, gg, bb
  for (let i = 0; i < 9; i++) {
    ;[rr, gg, bb] = rgbAt(lT)
    if (0.2126 * rr + 0.7152 * gg + 0.0722 * bb >= minRelL) break
    if (lT >= 0.85) break
    lT = Math.min(0.85, lT + 0.05)
  }
  const toByte = (x) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return '#' + toByte(rr) + toByte(gg) + toByte(bb)
}

function log(...args) {
  if (DEBUG) {
    console.log('[heatsync]', ...args)
  }
}

/**
 * Warning log (always shown)
 */
function warn(...args) {
  console.warn('[heatsync]', ...args)
}

/**
 * Error log (always shown)
 */
function error(...args) {
  console.error('[heatsync]', ...args)
}

// ============================================
// RATE LIMITING
// ============================================

/**
 * Throttle — fires at most once per `ms`, trailing call guaranteed.
 * @param {Function} fn
 * @param {number} [ms=16]
 * @returns {Function}
 */
function throttle(fn, ms = 16) {
  let last = 0
  let timer = null
  let lastArgs = null
  return function (...args) {
    const now = Date.now()
    const remaining = ms - (now - last)
    lastArgs = args
    if (remaining <= 0) {
      last = now
      timer = null
      fn.apply(this, args)
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now()
        timer = null
        fn.apply(this, lastArgs)
      }, remaining)
    }
  }
}

/**
 * Debounce — delays `fn` until `ms` ms after last call.
 * @param {Function} fn
 * @param {number} [ms=100]
 * @returns {Function}
 */
function debounce(fn, ms = 100) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), ms)
  }
}

// ============================================
// YOUTUBE LIVE CHAT EVENT CLASSIFICATION
// ============================================
// Pure parsing helpers for yt-live-chat's special renderers — shared between
// chrome/youtube-content.js (DOM extraction) and the multichat overlay (event
// banner dispatch in social.js) so tag-name → type and text-pattern → subtype
// logic lives in exactly one place.

/**
 * Map a yt-live-chat-*-renderer tag name to our internal message type.
 * @param {string} tagName - element.tagName (DOM tagName is already uppercase)
 * @returns {string}
 */
function classifyYtRendererType(tagName) {
  switch (tagName) {
    case 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER':
      return 'superchat'
    case 'YT-LIVE-CHAT-PAID-STICKER-RENDERER':
      return 'supersticker'
    case 'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER':
      return 'membership'
    case 'YT-LIVE-CHAT-SPONSORSHIPS-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER':
      return 'giftpurchase'
    case 'YT-LIVE-CHAT-SPONSORSHIPS-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER':
      return 'giftredemption'
    case 'YT-LIVE-CHAT-SPONSORSHIPS-HEADER-RENDERER':
      return 'giftheader'
    default:
      return 'text'
  }
}

/**
 * A membership-item-renderer covers two distinct events under one tag: a
 * brand-new member joining ("Welcome to <tier>!") vs an existing member's
 * renewal milestone ("Member for 11 months"). YouTube exposes no separate
 * attribute for this, so classify from the renderer's own header text.
 * @param {string} systemText - header text (headerPrimaryText/headerSubtext)
 * @returns {'join'|'milestone'}
 */
function classifyYtMembership(systemText) {
  const s = (systemText || '').trim()
  if (!s) return 'join'
  if (/^welcome\b/i.test(s)) return 'join'
  if (/member for\b/i.test(s) || /\b\d+\s*(month|months|year|years)\b/i.test(s)) return 'milestone'
  return 'join'
}

/**
 * Extract the gift count from a gift-membership purchase announcement's
 * header text ("<name> gifted 5 Channel memberships"). Falls back to 1 for
 * the singular phrasing some locales render ("gifted a membership").
 * @param {string} systemText
 * @returns {number}
 */
function parseYtGiftCount(systemText) {
  const s = systemText || ''
  const m = s.match(/gifted\s+(\d+)/i) || s.match(/(\d+)/)
  const n = m ? Number.parseInt(m[1], 10) : 1
  return Number.isFinite(n) && n > 0 ? n : 1
}

// ============================================
// UI SETTINGS SANITIZATION
// ============================================

// Keys that must NEVER be stored in chrome.storage.sync — they're either
// unbounded (per-tab maps, free-form text) or simply too large for the
// 8 KB QUOTA_BYTES_PER_ITEM ceiling. These move to chrome.storage.local
// (we hold the unlimitedStorage permission) and are not part of cross-
// device sync. Server-backed sync (ws ui-state:sync) also excludes them.
const UI_SYNC_BLOCKLIST = new Set(['platformFilters', 'keywordHighlights', 'chatFilterRules'])

/**
 * Sanitize a ui_settings-shaped object before merging into chrome.storage.sync
 * or echoing into localStorage. Strips:
 *   - numeric-string keys (corruption marker)
 *   - prototype pollution keys
 *   - blocklist keys (platformFilters, keywordHighlights — too big for sync)
 *   - oversized strings (>4 KB) and oversized values (JSON >6 KB)
 *   - non-data values (function/symbol)
 * Returns a fresh plain object — never mutates input.
 * @param {*} obj
 * @returns {object}
 */
function sanitizeUiSettings(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out = {}
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) continue
    if (/^\d+$/.test(key)) continue
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    if (key.length === 0 || key.length > 64) continue
    if (UI_SYNC_BLOCKLIST.has(key)) continue
    const v = obj[key]
    const t = typeof v
    if (t === 'function' || t === 'symbol') continue
    if (t === 'string' && v.length > 4096) continue
    if (t === 'object' && v !== null) {
      try {
        if (JSON.stringify(v).length > 6144) continue
      } catch {
        continue
      }
    }
    out[key] = v
  }
  return out
}

// Export
const utils = {
  // XSS
  escapeHtml,
  safeUrl,
  createElement,

  // DOM
  $,
  $$,

  // React
  getFiber,
  findComponent,

  // Color
  boostReadability,

  // YouTube live chat event classification
  classifyYtRendererType,
  classifyYtMembership,
  parseYtGiftCount,

  // Rate limiting
  throttle,
  debounce,

  // Logging
  log,
  warn,
  error,
  DEBUG,

  // Storage hygiene
  sanitizeUiSettings,
  UI_SYNC_BLOCKLIST,
}

// Global export
if (typeof window !== 'undefined') {
  window.heatsyncUtils = utils
}

export {
  $,
  $$,
  boostReadability,
  classifyYtMembership,
  classifyYtRendererType,
  createElement,
  debounce,
  error,
  escapeHtml,
  findComponent,
  getFiber,
  log,
  parseYtGiftCount,
  safeUrl,
  sanitizeUiSettings,
  throttle,
  UI_SYNC_BLOCKLIST,
  warn,
}
export default utils
