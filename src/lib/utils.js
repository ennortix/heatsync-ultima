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
 * @param {string} url
 * @returns {string}
 */
function safeUrl(url) {
  if (typeof url !== 'string' || !url) return ''
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) return ''
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    return trimmed
  } catch { return '' }
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
 * @param {Element} [parent=document]
 * @returns {Element|null}
 */
function $(selector, parent = document) {
  return parent.querySelector(selector)
}

/**
 * Query selector all
 * @param {string} selector
 * @param {Element} [parent=document]
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
  const key = Object.keys(el).find(k =>
    k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  )
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

const DEBUG = typeof window !== 'undefined' &&
  (window.HEATSYNC_DEBUG || localStorage.getItem('heatsync_debug') === 'true')

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
  let m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return hex
  let h6 = m[1]
  if (h6.length === 3) h6 = h6[0]+h6[0]+h6[1]+h6[1]+h6[2]+h6[2]
  const r = parseInt(h6.slice(0,2), 16) / 255
  const g = parseInt(h6.slice(2,4), 16) / 255
  const b = parseInt(h6.slice(4,6), 16) / 255
  const relL = 0.2126*r + 0.7152*g + 0.0722*b
  if (relL >= minRelL) return hex
  const max = Math.max(r,g,b), min = Math.min(r,g,b)
  let h, s, l = (max+min)/2
  if (max === min) { h = 0; s = 0 }
  else {
    const d = max - min
    s = l > 0.5 ? d / (2-max-min) : d / (max+min)
    switch (max) {
      case r: h = (g-b)/d + (g<b ? 6 : 0); break
      case g: h = (b-r)/d + 2; break
      default: h = (r-g)/d + 4
    }
    h /= 6
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q-p)*6*t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q-p)*(2/3-t)*6
    return p
  }
  const rgbAt = (ll) => {
    const q = ll < 0.5 ? ll*(1+s) : ll+s-ll*s
    const p = 2*ll - q
    return [hue2rgb(p,q,h+1/3), hue2rgb(p,q,h), hue2rgb(p,q,h-1/3)]
  }
  let lT = Math.max(l, 0.5)
  let rr, gg, bb
  for (let i = 0; i < 9; i++) {
    [rr,gg,bb] = rgbAt(lT)
    if (0.2126*rr + 0.7152*gg + 0.0722*bb >= minRelL) break
    if (lT >= 0.85) break
    lT = Math.min(0.85, lT + 0.05)
  }
  const toByte = (x) => Math.round(x*255).toString(16).padStart(2,'0')
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
  return function(...args) {
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
  return function(...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), ms)
  }
}

// ============================================
// UI SETTINGS SANITIZATION
// ============================================

// Keys that must NEVER be stored in chrome.storage.sync — they're either
// unbounded (per-tab maps, free-form text) or simply too large for the
// 8 KB QUOTA_BYTES_PER_ITEM ceiling. These move to chrome.storage.local
// (we hold the unlimitedStorage permission) and are not part of cross-
// device sync. Server-backed sync (ws ui-state:sync) also excludes them.
const UI_SYNC_BLOCKLIST = new Set(['platformFilters', 'keywordHighlights'])

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
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
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
      } catch { continue }
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
  escapeHtml,
  safeUrl,
  createElement,
  $,
  $$,
  getFiber,
  findComponent,
  boostReadability,
  throttle,
  debounce,
  log,
  warn,
  error,
  sanitizeUiSettings,
  UI_SYNC_BLOCKLIST,
}
export default utils
