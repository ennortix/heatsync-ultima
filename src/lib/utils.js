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
 * Query selector with caching
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

/**
 * Debug log (only when HEATSYNC_DEBUG is true)
 */
// ============================================
// READABLE NAME COLOR (luminance boost)
// ============================================

/**
 * Boost the lightness of a hex color so it's readable on a dark/black bg.
 * Preserves hue and saturation; only raises L (HSL) when below threshold.
 * Returns the input unchanged if already readable, malformed, or non-hex.
 * @param {string} hex - "#rgb" or "#rrggbb"
 * @param {number} [minL=0.5] - minimum lightness (0..1)
 * @returns {string}
 */
function boostReadability(hex, minL = 0.5) {
  if (typeof hex !== 'string') return hex
  let m = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return hex
  let h6 = m[1]
  if (h6.length === 3) h6 = h6[0]+h6[0]+h6[1]+h6[1]+h6[2]+h6[2]
  const r = parseInt(h6.slice(0,2), 16) / 255
  const g = parseInt(h6.slice(2,4), 16) / 255
  const b = parseInt(h6.slice(4,6), 16) / 255
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
  if (l >= minL) return hex
  l = minL
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q-p)*6*t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q-p)*(2/3-t)*6
    return p
  }
  const q = l < 0.5 ? l*(1+s) : l+s-l*s
  const p = 2*l - q
  const toByte = (x) => Math.round(hue2rgb(p,q,x)*255).toString(16).padStart(2,'0')
  return '#' + toByte(h+1/3) + toByte(h) + toByte(h-1/3)
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

// Export
const utils = {
  // XSS
  escapeHtml,
  createElement,

  // DOM
  $,
  $$,

  // React
  getFiber,
  findComponent,

  // Color
  boostReadability,

  // Logging
  log,
  warn,
  error,
  DEBUG
}

// Global export
if (typeof window !== 'undefined') {
  window.heatsyncUtils = utils
}

export {
  escapeHtml,
  createElement,
  $,
  $$,
  getFiber,
  findComponent,
  boostReadability,
  log,
  warn,
  error
}
export default utils
