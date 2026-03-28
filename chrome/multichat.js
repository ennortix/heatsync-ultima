(function() {
'use strict';

// === HEATSYNC LIB (auto-bundled) ===

// --- config.js ---
/**
 * Centralized configuration and constants for heatsync extension.
 * No more magic numbers scattered throughout the codebase.
 */

// ============================================
// API ENDPOINTS
// ============================================

const API_URL = 'https://heatsync.org'
const WS_URL = 'wss://heatsync.org'

// ============================================
// TIMING CONSTANTS
// ============================================

const TIMING = {
  // Polling intervals
  EMOTE_SCAN_INTERVAL: 10000,     // Scan for new emotes
  HEALTH_CHECK_INTERVAL: 30000,   // Background health check
  RETRY_INTERVAL: 2000,           // Retry failed operations
  URL_CHECK_INTERVAL: 1000,       // SPA navigation detection

  // Debounce/throttle
  SCROLL_THROTTLE: 16,            // ~60fps for scroll handlers
  RESIZE_DEBOUNCE: 100,           // Resize handler debounce
  INPUT_DEBOUNCE: 150,            // Input handler debounce
  HOVER_DEBOUNCE: 100,            // Hover state debounce

  // Timeouts
  API_TIMEOUT: 10000,             // API request timeout
  ELEMENT_WAIT_TIMEOUT: 5000,     // Wait for DOM element
  RECONNECT_DELAY: 5000,          // WebSocket reconnect delay
  INIT_DELAY: 500,                // Initial setup delay

  // Animation
  TOOLTIP_DELAY: 200,             // Tooltip show delay
  FADE_DURATION: 150,             // Fade in/out duration
}

// ============================================
// LIMITS
// ============================================

const LIMITS = {
  // Cache sizes
  MAX_CACHED_USERS: 200,          // Username autocomplete cache
  MAX_CACHED_EMOTES: 1000,        // Emote cache
  MAX_PROFILE_CACHE: 100,         // Profile preview cache

  // Message limits
  MAX_MESSAGE_LENGTH: 500,        // Chat message max length
  MAX_MESSAGES_BUFFER: 500,       // Circular buffer size

  // Performance
  MAX_DOM_BATCH: 50,              // Max DOM mutations per frame
  MAX_FIBER_DEPTH: 50,            // React fiber traversal depth
}

// ============================================
// DOM SELECTORS
// ============================================

const SELECTORS = {
  // Twitch chat
  TWITCH_CHAT_CONTAINER: [
    '[class*="chat-room__content"]',
    '[data-test-selector="chat-room-component"]',
    '[class*="stream-chat"]',
    '.chat-shell',
    '.chat-room'
  ].join(', '),

  TWITCH_CHAT_INPUT: '[data-a-target="chat-input"]',
  TWITCH_CHAT_MESSAGES: '[class*="chat-scrollable-area__message-container"]',
  TWITCH_USERNAME: '.chat-author__display-name',

  // Kick chat
  KICK_CHAT_CONTAINER: '#channel-chatroom',
  KICK_CHAT_INPUT: 'div.editor-input',
  KICK_CHAT_MESSAGES: '#chatroom-messages',

  // Profile elements
  PROFILE_AVATAR: '[class*="avatar"]',
  PROFILE_CARD: '[class*="viewer-card"]',
}

// ============================================
// CSS CLASSES
// ============================================

const CLASSES = {
  // Injected elements
  HEATSYNC_BUTTON: 'heatsync-emote-button',
  HEATSYNC_PANEL: 'heatsync-emote-panel',
  HEATSYNC_TOOLTIP: 'heatsync-tooltip',
  HEATSYNC_EMOTE: 'heatsync-emote',
  HEATSYNC_BADGE: 'heatsync-badge',

  // States
  ACTIVE: 'heatsync-active',
  LOADING: 'heatsync-loading',
  ERROR: 'heatsync-error',
  HIDDEN: 'heatsync-hidden',
}

// ============================================
// Z-INDEX LAYERS
// ============================================

const Z_INDEX = {
  TOOLTIP: 10000,
  POPUP: 10001,
  PANEL: 10002,
  MODAL: 10003,
  OVERLAY: 10004,
}

// ============================================
// EMOTE PROVIDERS
// ============================================

const EMOTE_PROVIDERS = {
  HEATSYNC: 'heatsync',
  BTTV: 'bttv',
  FFZ: 'ffz',
  SEVENTV: '7tv',
  TWITCH: 'twitch',
  KICK: 'kick',
}

// Export all as default config object
const config = {
  API_URL,
  WS_URL,
  TIMING,
  LIMITS,
  SELECTORS,
  CLASSES,
  Z_INDEX,
  EMOTE_PROVIDERS,
}

// Global export
if (typeof window !== 'undefined') {
  window.heatsyncConfig = config
}



// --- utils.js ---
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
 * Escape string for use in HTML attribute
 * @param {string} str
 * @returns {string}
 */
function escapeAttr(str) {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Sanitize URL - only allow http/https/data URIs
 * @param {string} url
 * @returns {string} Safe URL or empty string
 */
function sanitizeUrl(url) {
  if (!url) return ''
  const str = String(url).trim()
  const lower = str.toLowerCase()
  // Allow http, https, safe data image types, and relative URLs
  if (lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('/') ||
      lower.startsWith('./')) {
    return str
  }
  // Only allow safe raster image data URIs (no SVG — can execute JS)
  if (lower.startsWith('data:image/') &&
      !lower.startsWith('data:image/svg')) {
    return str
  }
  return ''
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

/**
 * Set innerHTML safely with escaped content
 * @param {HTMLElement} el
 * @param {string} html - Already sanitized HTML (use escapeHtml for user content)
 */
function setInnerHTML(el, html) {
  el.innerHTML = html
}

// ============================================
// DEBOUNCE / THROTTLE
// ============================================

/**
 * Debounce function - delays execution until no calls for `wait` ms
 * @param {Function} fn
 * @param {number} wait - Milliseconds
 * @returns {Function}
 */
function debounce(fn, wait) {
  let timeoutId = null
  return function(...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), wait)
  }
}

/**
 * Throttle function - executes at most once per `wait` ms
 * @param {Function} fn
 * @param {number} wait - Milliseconds
 * @returns {Function}
 */
function throttle(fn, wait) {
  let lastCall = 0
  let timeoutId = null
  return function(...args) {
    const now = Date.now()
    const remaining = wait - (now - lastCall)

    if (remaining <= 0) {
      clearTimeout(timeoutId)
      lastCall = now
      fn.apply(this, args)
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now()
        timeoutId = null
        fn.apply(this, args)
      }, remaining)
    }
  }
}

/**
 * Throttle using requestAnimationFrame (for visual updates)
 * @param {Function} fn
 * @returns {Function}
 */
function rafThrottle(fn) {
  let rafId = null
  return function(...args) {
    if (rafId) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      fn.apply(this, args)
    })
  }
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

/**
 * Wait for element to appear in DOM
 * @param {string} selector
 * @param {number} [timeout=5000]
 * @param {Element} [parent=document]
 * @returns {Promise<Element>}
 */
function waitForElement(selector, timeout = 5000, parent = document) {
  return new Promise((resolve, reject) => {
    const el = parent.querySelector(selector)
    if (el) {
      resolve(el)
      return
    }

    const observer = new MutationObserver((mutations, obs) => {
      const el = parent.querySelector(selector)
      if (el) {
        obs.disconnect()
        resolve(el)
      }
    })

    const observeTarget = parent === document ? (document.body || document.documentElement) : parent
    observer.observe(observeTarget, {
      childList: true,
      subtree: true
    })

    setTimeout(() => {
      observer.disconnect()
      reject(new Error(`Timeout waiting for ${selector}`))
    }, timeout)
  })
}

/**
 * Check if element is in viewport
 * @param {Element} el
 * @returns {boolean}
 */
function isInViewport(el) {
  const rect = el.getBoundingClientRect()
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  )
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

/**
 * Get React props from element
 * @param {Element} el
 * @returns {object|null}
 */
function getReactProps(el) {
  if (!el) return null
  const key = Object.keys(el).find(k => k.startsWith('__reactProps$'))
  return key ? el[key] : null
}

// ============================================
// LOGGING
// ============================================

const DEBUG = typeof window !== 'undefined' &&
  (window.HEATSYNC_DEBUG || localStorage.getItem('heatsync_debug') === 'true')

/**
 * Debug log (only when HEATSYNC_DEBUG is true)
 */
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
// MISC
// ============================================

/**
 * Sleep for ms
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate unique ID
 * @param {string} [prefix='hs']
 * @returns {string}
 */
function uid(prefix = 'hs') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Parse JSON safely
 * @param {string} str
 * @param {*} fallback
 * @returns {*}
 */
function parseJson(str, fallback = null) {
  try {
    return JSON.parse(str)
  } catch (e) {
    return fallback
  }
}

// ============================================
// TRUSTED ORIGINS
// ============================================

const TRUSTED_ORIGINS = [
  'https://www.twitch.tv',
  'https://twitch.tv',
  'https://kick.com',
  'https://www.kick.com',
  'https://heatsync.org',
  'https://www.heatsync.org'
]

/**
 * Check if origin is trusted
 * @param {string} origin
 * @returns {boolean}
 */
function isTrustedOrigin(origin) {
  return TRUSTED_ORIGINS.includes(origin) || origin === window.location.origin
}

// Export
const utils = {
  // XSS
  escapeHtml,
  escapeAttr,
  sanitizeUrl,
  createElement,
  setInnerHTML,

  // Timing
  debounce,
  throttle,
  rafThrottle,
  sleep,

  // DOM
  $,
  $$,
  waitForElement,
  isInViewport,

  // React
  getFiber,
  findComponent,
  getReactProps,

  // Logging
  log,
  warn,
  error,
  DEBUG,

  // Misc
  uid,
  parseJson,
  isTrustedOrigin,
  TRUSTED_ORIGINS
}

// Global export
if (typeof window !== 'undefined') {
  window.heatsyncUtils = utils
}



// --- cleanup.js ---
/**
 * Centralized cleanup system for intervals, timeouts, observers, and event listeners.
 * Prevents memory leaks during 8hr+ streaming sessions.
 *
 * Usage:
 *   import { cleanup } from './lib/cleanup.js'
 *
 *   // Track interval
 *   cleanup.setInterval(() => { ... }, 1000, 'emote-scanner')
 *
 *   // Track observer
 *   cleanup.observe(observer, element, options, 'chat-watcher')
 *
 *   // Track event listener
 *   cleanup.addEventListener(element, 'click', handler, 'panel-click')
 *
 *   // Clear specific
 *   cleanup.clear('emote-scanner')
 *
 *   // Clear all (called automatically on unload)
 *   cleanup.clearAll()
 */

const registry = {
  intervals: new Map(),    // name -> intervalId
  timeouts: new Map(),     // name -> timeoutId
  observers: new Map(),    // name -> MutationObserver
  listeners: new Map(),    // name -> { element, event, handler, options }
  animationFrames: new Map() // name -> rafId
}

// Stats for debugging
let stats = {
  intervalsCreated: 0,
  intervalsCleaned: 0,
  observersCreated: 0,
  observersCleaned: 0,
  listenersCreated: 0,
  listenersCleaned: 0
}

/**
 * Create a tracked setInterval
 * @param {Function} callback
 * @param {number} delay
 * @param {string} name - Unique identifier for this interval
 * @returns {number} intervalId
 */
function trackedSetInterval(callback, delay, name) {
  // Clear existing if same name
  if (registry.intervals.has(name)) {
    clearInterval(registry.intervals.get(name))
    stats.intervalsCleaned++
  }

  const id = setInterval(callback, delay)
  registry.intervals.set(name, id)
  stats.intervalsCreated++
  return id
}

/**
 * Create a tracked setTimeout
 * @param {Function} callback
 * @param {number} delay
 * @param {string} name - Unique identifier for this timeout
 * @returns {number} timeoutId
 */
function trackedSetTimeout(callback, delay, name) {
  // Clear existing if same name
  if (registry.timeouts.has(name)) {
    clearTimeout(registry.timeouts.get(name))
  }

  const id = setTimeout(() => {
    registry.timeouts.delete(name)
    callback()
  }, delay)
  registry.timeouts.set(name, id)
  return id
}

/**
 * Track and start a MutationObserver
 * @param {MutationObserver} observer
 * @param {Element} target
 * @param {MutationObserverInit} options
 * @param {string} name - Unique identifier
 * @returns {MutationObserver}
 */
function trackedObserve(observer, target, options, name) {
  // Disconnect existing if same name
  if (registry.observers.has(name)) {
    try {
      registry.observers.get(name).disconnect()
      stats.observersCleaned++
    } catch (e) {}
  }

  observer.observe(target, options)
  registry.observers.set(name, observer)
  stats.observersCreated++
  return observer
}

/**
 * Create a tracked MutationObserver (convenience wrapper)
 * @param {MutationCallback} callback
 * @param {Element} target
 * @param {MutationObserverInit} options
 * @param {string} name
 * @returns {MutationObserver}
 */
function createTrackedObserver(callback, target, options, name) {
  const observer = new MutationObserver(callback)
  return trackedObserve(observer, target, options, name)
}

/**
 * Track an existing observer (call .observe() yourself)
 * Drop-in replacement for old trackObserver() pattern
 * @param {MutationObserver} observer
 * @param {string} name
 * @returns {MutationObserver}
 */
function trackObserver(observer, name) {
  // Disconnect existing if same name
  if (registry.observers.has(name)) {
    try {
      registry.observers.get(name).disconnect()
      stats.observersCleaned++
    } catch (e) {}
  }
  registry.observers.set(name, observer)
  stats.observersCreated++
  return observer
}

/**
 * Track an event listener
 * @param {EventTarget} element
 * @param {string} event
 * @param {Function} handler
 * @param {string} name - Unique identifier
 * @param {AddEventListenerOptions} [options]
 * @returns {Function} handler (for chaining)
 */
function trackedAddEventListener(element, event, handler, name, options) {
  // Remove existing if same name
  if (registry.listeners.has(name)) {
    const existing = registry.listeners.get(name)
    try {
      existing.element.removeEventListener(existing.event, existing.handler, existing.options)
      stats.listenersCleaned++
    } catch (e) {}
  }

  element.addEventListener(event, handler, options)
  registry.listeners.set(name, { element, event, handler, options })
  stats.listenersCreated++
  return handler
}

/**
 * Track a requestAnimationFrame
 * @param {Function} callback
 * @param {string} name
 * @returns {number} rafId
 */
function trackedRAF(callback, name) {
  if (registry.animationFrames.has(name)) {
    cancelAnimationFrame(registry.animationFrames.get(name))
  }

  const id = requestAnimationFrame(() => {
    registry.animationFrames.delete(name)
    callback()
  })
  registry.animationFrames.set(name, id)
  return id
}

/**
 * Clear a specific tracked item by name
 * @param {string} name
 */
function clear(name) {
  if (registry.intervals.has(name)) {
    clearInterval(registry.intervals.get(name))
    registry.intervals.delete(name)
    stats.intervalsCleaned++
  }
  if (registry.timeouts.has(name)) {
    clearTimeout(registry.timeouts.get(name))
    registry.timeouts.delete(name)
  }
  if (registry.observers.has(name)) {
    try {
      registry.observers.get(name).disconnect()
    } catch (e) {}
    registry.observers.delete(name)
    stats.observersCleaned++
  }
  if (registry.listeners.has(name)) {
    const l = registry.listeners.get(name)
    try {
      l.element.removeEventListener(l.event, l.handler, l.options)
    } catch (e) {}
    registry.listeners.delete(name)
    stats.listenersCleaned++
  }
  if (registry.animationFrames.has(name)) {
    cancelAnimationFrame(registry.animationFrames.get(name))
    registry.animationFrames.delete(name)
  }
}

/**
 * Clear all tracked items (called on page unload)
 */
function clearAll() {
  // Clear intervals
  for (const [name, id] of registry.intervals) {
    clearInterval(id)
    stats.intervalsCleaned++
  }
  registry.intervals.clear()

  // Clear timeouts
  for (const [name, id] of registry.timeouts) {
    clearTimeout(id)
  }
  registry.timeouts.clear()

  // Disconnect observers
  for (const [name, obs] of registry.observers) {
    try { obs.disconnect() } catch (e) {}
    stats.observersCleaned++
  }
  registry.observers.clear()

  // Remove listeners
  for (const [name, l] of registry.listeners) {
    try {
      l.element.removeEventListener(l.event, l.handler, l.options)
    } catch (e) {}
    stats.listenersCleaned++
  }
  registry.listeners.clear()

  // Cancel animation frames
  for (const [name, id] of registry.animationFrames) {
    cancelAnimationFrame(id)
  }
  registry.animationFrames.clear()
}

/**
 * Get debug stats
 */
function getStats() {
  return {
    ...stats,
    active: {
      intervals: registry.intervals.size,
      timeouts: registry.timeouts.size,
      observers: registry.observers.size,
      listeners: registry.listeners.size,
      animationFrames: registry.animationFrames.size
    }
  }
}

/**
 * List all active tracked items (for debugging)
 */
function listActive() {
  return {
    intervals: [...registry.intervals.keys()],
    timeouts: [...registry.timeouts.keys()],
    observers: [...registry.observers.keys()],
    listeners: [...registry.listeners.keys()],
    animationFrames: [...registry.animationFrames.keys()]
  }
}

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', clearAll)

  // Also cleanup on SPA navigation (Twitch/Kick are SPAs)
  // Use a lightweight title observer instead of subtree:true on body
  let lastUrl = location.href
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      // Don't clear everything on SPA nav, just notify
      // Individual modules should handle their own cleanup
      window.dispatchEvent(new CustomEvent('heatsync:navigation'))
    }
  })
  // Observe <head> title changes (lightweight) + body childList (for pushState nav)
  if (document.head) urlObserver.observe(document.head, { childList: true, subtree: true })
  else urlObserver.observe(document.body, { childList: true, subtree: false })
  // Disconnect on pagehide alongside clearAll
  window.addEventListener('pagehide', () => urlObserver.disconnect())
}

// Export as both module and global
const cleanup = {
  setInterval: trackedSetInterval,
  setTimeout: trackedSetTimeout,
  observe: trackedObserve,
  createObserver: createTrackedObserver,
  trackObserver: trackObserver,
  addEventListener: trackedAddEventListener,
  raf: trackedRAF,
  clear,
  clearAll,
  getStats,
  listActive
}

// Global export for non-module scripts
if (typeof window !== 'undefined') {
  window.heatsyncCleanup = cleanup

  // Console debug helper
  window.hsDebug = () => {
    const s = cleanup.getStats()
    const a = cleanup.listActive()
    console.log('%c[heatsync] Cleanup Stats', 'color: #9147ff; font-weight: bold')
    console.log(`  Created: ${s.intervalsCreated} intervals, ${s.observersCreated} observers, ${s.listenersCreated} listeners`)
    console.log(`  Cleaned: ${s.intervalsCleaned} intervals, ${s.observersCleaned} observers, ${s.listenersCleaned} listeners`)
    console.log(`  Active: ${s.active.intervals} intervals, ${s.active.observers} observers, ${s.active.listeners} listeners`)
    console.table(a)
    return s
  }
}



// --- browser-api.js ---
/**
 * Unified browser API wrapper for Chrome/Firefox compatibility.
 * Handles chrome.* vs browser.* API differences.
 *
 * Usage:
 *   import { api } from './lib/browser-api.js'
 *
 *   // Storage
 *   await api.storage.local.get('key')
 *   await api.storage.local.set({ key: value })
 *
 *   // Runtime messaging
 *   api.runtime.sendMessage({ type: 'foo' })
 *   api.runtime.onMessage.addListener(handler)
 */

// Detect browser environment
const isFirefox = typeof browser !== 'undefined'
const isChrome = typeof chrome !== 'undefined' && !isFirefox

// Get the raw API object
const rawApi = isFirefox ? browser : (typeof chrome !== 'undefined' ? chrome : null)

/**
 * Promisify Chrome callback-based APIs
 * Firefox's browser.* APIs are already Promise-based
 */
function promisify(fn) {
  if (isFirefox) return fn // Already returns promises

  return function(...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (result) => {
        if (rawApi?.runtime?.lastError) {
          reject(new Error(rawApi.runtime.lastError.message))
        } else {
          resolve(result)
        }
      })
    })
  }
}

/**
 * Storage API wrapper
 */
const storage = {
  local: {
    get: async (keys) => {
      if (!rawApi?.storage?.local) {
        console.warn('[heatsync] Storage API not available')
        return {}
      }
      if (isFirefox) {
        return rawApi.storage.local.get(keys)
      }
      return promisify(rawApi.storage.local.get.bind(rawApi.storage.local))(keys)
    },
    set: async (items) => {
      if (!rawApi?.storage?.local) {
        console.warn('[heatsync] Storage API not available')
        return
      }
      if (isFirefox) {
        return rawApi.storage.local.set(items)
      }
      return promisify(rawApi.storage.local.set.bind(rawApi.storage.local))(items)
    },
    remove: async (keys) => {
      if (!rawApi?.storage?.local) return
      if (isFirefox) {
        return rawApi.storage.local.remove(keys)
      }
      return promisify(rawApi.storage.local.remove.bind(rawApi.storage.local))(keys)
    },
    clear: async () => {
      if (!rawApi?.storage?.local) return
      if (isFirefox) {
        return rawApi.storage.local.clear()
      }
      return promisify(rawApi.storage.local.clear.bind(rawApi.storage.local))()
    }
  },
  sync: {
    get: async (keys) => {
      if (!rawApi?.storage?.sync) return {}
      if (isFirefox) {
        return rawApi.storage.sync.get(keys)
      }
      return promisify(rawApi.storage.sync.get.bind(rawApi.storage.sync))(keys)
    },
    set: async (items) => {
      if (!rawApi?.storage?.sync) return
      if (isFirefox) {
        return rawApi.storage.sync.set(items)
      }
      return promisify(rawApi.storage.sync.set.bind(rawApi.storage.sync))(items)
    }
  },
  onChanged: {
    addListener: (callback) => {
      if (rawApi?.storage?.onChanged) {
        rawApi.storage.onChanged.addListener(callback)
      }
    },
    removeListener: (callback) => {
      if (rawApi?.storage?.onChanged) {
        rawApi.storage.onChanged.removeListener(callback)
      }
    }
  }
}

/**
 * Runtime API wrapper
 */
const runtime = {
  sendMessage: async (message) => {
    if (!rawApi?.runtime?.sendMessage) {
      console.warn('[heatsync] Runtime API not available')
      return null
    }
    try {
      if (isFirefox) {
        return await rawApi.runtime.sendMessage(message)
      }
      return promisify(rawApi.runtime.sendMessage.bind(rawApi.runtime))(message)
    } catch (err) {
      // Extension context invalidated (common during updates)
      if (err.message?.includes('Extension context invalidated')) {
        return null
      }
      throw err
    }
  },
  onMessage: {
    addListener: (callback) => {
      if (rawApi?.runtime?.onMessage) {
        rawApi.runtime.onMessage.addListener(callback)
      }
    },
    removeListener: (callback) => {
      if (rawApi?.runtime?.onMessage) {
        rawApi.runtime.onMessage.removeListener(callback)
      }
    }
  },
  getURL: (path) => {
    if (rawApi?.runtime?.getURL) {
      return rawApi.runtime.getURL(path)
    }
    return path
  },
  get id() {
    return rawApi?.runtime?.id || 'heatsync-extension'
  },
  get lastError() {
    return rawApi?.runtime?.lastError
  }
}

/**
 * Tabs API wrapper (for background scripts)
 */
const tabs = {
  query: async (queryInfo) => {
    if (!rawApi?.tabs?.query) return []
    if (isFirefox) {
      return rawApi.tabs.query(queryInfo)
    }
    return promisify(rawApi.tabs.query.bind(rawApi.tabs))(queryInfo)
  },
  sendMessage: async (tabId, message) => {
    if (!rawApi?.tabs?.sendMessage) return null
    try {
      if (isFirefox) {
        return await rawApi.tabs.sendMessage(tabId, message)
      }
      return promisify(rawApi.tabs.sendMessage.bind(rawApi.tabs))(tabId, message)
    } catch (err) {
      // Tab may have closed
      return null
    }
  },
  create: async (createProperties) => {
    if (!rawApi?.tabs?.create) return null
    if (isFirefox) {
      return rawApi.tabs.create(createProperties)
    }
    return promisify(rawApi.tabs.create.bind(rawApi.tabs))(createProperties)
  }
}

/**
 * Check if extension context is valid
 */
function isContextValid() {
  try {
    return !!rawApi?.runtime?.id
  } catch (e) {
    return false
  }
}

/**
 * Get platform info
 */
const platform = {
  isFirefox,
  isChrome,
  manifestVersion: isFirefox ? 2 : 3,
  name: isFirefox ? 'firefox' : 'chrome'
}

// Export unified API
const api = {
  storage,
  runtime,
  tabs,
  platform,
  isContextValid,
  raw: rawApi
}

// Global export for non-module scripts
if (typeof window !== 'undefined') {
  window.heatsyncApi = api
}


// === END HEATSYNC LIB ===


{
// === MULTICHAT MODULES (auto-bundled) ===

// --- multichat/bootstrap.js ---
// Bootstrap - lifecycle controller, cleanup utilities, debug log

const MC_DEBUG = false
function log(...args) {
  if (MC_DEBUG) console.log(LOG_PREFIX, ...args)
}

// Lifecycle controller — abort() tears down ALL listeners, timers, observers
const lifecycle = new AbortController()
const mcSignal = lifecycle.signal
const _timers = { intervals: [], timeouts: [], observers: [] }
mcSignal.addEventListener('abort', () => {
  _timers.intervals.forEach(clearInterval)
  _timers.timeouts.forEach(clearTimeout)
  _timers.observers.forEach(o => o.disconnect())
  if (irc) { irc.destroy(); }
  if (kickChat) { kickChat.destroy(); }
  delete window._hsMcEmoteContextHandler
  delete window._hsMcEmoteClickHandler
  delete window._hsEmoteTooltipSetup
  delete window._hsMcSettingsListener
})
window.addEventListener('pagehide', () => lifecycle.abort())

const cleanup = {
  setInterval(fn, ms) { const id = setInterval(fn, ms); _timers.intervals.push(id); return id },
  setTimeout(fn, ms) { const id = setTimeout(fn, ms); _timers.timeouts.push(id); return id },
  addEventListener(target, event, handler) {
    target.addEventListener(event, handler, { signal: mcSignal })
  },
  trackObserver(obs) { _timers.observers.push(obs); return obs },
  raf(fn) { return requestAnimationFrame(fn) },
}


// --- multichat/irc.js ---
// IRC - read-only IRC client, message parsing, CircularBuffer

function parseTags(tagStr) {
  const tags = {}
  for (const part of tagStr.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) { tags[part] = ''; continue }
    tags[part.slice(0, eq)] = part.slice(eq + 1) || ''
  }
  return tags
}

function parseIrcLine(raw, channel) {
  try {
    const tagsMatch = raw.match(/^@([^ ]+)/)
    if (!tagsMatch) return null
    const tags = parseTags(tagsMatch[1])

    // PRIVMSG: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    const privmsg = raw.match(/PRIVMSG #([^ ]+) :(.+)$/)
    if (privmsg) {
      const displayName = tags['display-name'] || 'anonymous'
      // /me sends as \x01ACTION text\x01
      let text = privmsg[2]
      let isAction = false
      if (text.charCodeAt(0) === 1 && text.startsWith('\x01ACTION ')) {
        text = text.slice(8, text.endsWith('\x01') ? -1 : undefined)
        isAction = true
      }
      const msg = {
        user: displayName,
        text: text,
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || privmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || '',
        replyTo: tags['reply-parent-display-name'] ? {
          user: decodeURIComponent(tags['reply-parent-display-name']),
          text: tags['reply-parent-msg-body'] ? decodeURIComponent(tags['reply-parent-msg-body'].replace(/\\s/g, ' ')) : ''
        } : null
      }
      if (isAction) msg.isAction = true
      if (tags['custom-reward-id']) msg.redeemed = true
      if (tags['first-msg'] === '1') msg.isFirstMsg = true
      // Extract sub tenure from badge-info (subscriber/N = cumulative months)
      const badgeInfo = tags['badge-info']
      if (badgeInfo) {
        const subMatch = badgeInfo.match(/subscriber\/(\d+)/)
        if (subMatch) msg.subMonths = parseInt(subMatch[1])
      }
      return msg
    }

    // USERNOTICE: @tags :tmi.twitch.tv USERNOTICE #channel :optional message
    const usernotice = raw.match(/USERNOTICE #([^ ]+)(?: :(.+))?$/)
    if (usernotice) {
      const displayName = tags['display-name'] || 'system'
      return {
        user: displayName,
        text: usernotice[2] || '',
        systemMsg: decodeURIComponent((tags['system-msg'] || '').replace(/\\s/g, ' ')),
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || usernotice[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        type: 'usernotice',
        msgId: tags['msg-id'] || '',
        id: tags.id || ''
      }
    }

    // NOTICE: @tags :tmi.twitch.tv NOTICE #channel :message
    // (also used by clearchatToNotice=true from recent-messages API)
    const notice = raw.match(/NOTICE #([^ ]+) :(.+)$/)
    if (notice) {
      return {
        type: 'notice',
        user: 'system',
        text: notice[2],
        color: '#999',
        badges: '',
        channel: channel || notice[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: notice[2]
      }
    }

    // CLEARCHAT: @tags :tmi.twitch.tv CLEARCHAT #channel :username
    // (timeout/ban of a user)
    const clearchat = raw.match(/CLEARCHAT #([^ ]+)(?: :(.+))?$/)
    if (clearchat) {
      const target = clearchat[2] || ''
      const duration = tags['ban-duration']
      const text = target
        ? (duration ? `${target} timed out for ${duration}s` : `${target} was permanently banned`)
        : 'Chat was cleared'
      return {
        type: 'notice',
        user: 'system',
        text,
        color: '#999',
        badges: '',
        channel: channel || clearchat[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || `clearchat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: text
      }
    }

    // CLEARMSG: @tags :tmi.twitch.tv CLEARMSG #channel :deleted message text
    // (single message deletion)
    const clearmsg = raw.match(/CLEARMSG #([^ ]+) :(.+)$/)
    if (clearmsg) {
      const targetMsgId = tags['target-msg-id']
      return {
        type: 'notice',
        user: 'system',
        text: `Message from ${tags.login || 'unknown'} deleted`,
        color: '#999',
        badges: '',
        channel: channel || clearmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: targetMsgId || `clearmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: `Message from ${tags.login || 'unknown'} deleted`
      }
    }

    // WHISPER: @tags :user!user@user.tmi.twitch.tv WHISPER yourname :message
    const whisper = raw.match(/WHISPER \S+ :(.+)$/)
    if (whisper) {
      return {
        type: 'whisper',
        user: tags['display-name'] || 'anonymous',
        userId: tags['user-id'],
        text: whisper[1],
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags['message-id'] || ''
      }
    }

    return null
  } catch (e) {
    return null
  }
}

// ============================================
// CIRCULAR BUFFER FOR CHANNEL MESSAGES
// ============================================
class CircularBuffer {
  constructor(cap = 1500) {
    this.buf = new Array(cap);
    this.cap = cap;
    this.head = 0;
    this.size = 0;
  }
  push(item) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }
  getAll() {
    if (this.size === 0) return [];
    if (this.size < this.cap) return this.buf.slice(0, this.size);
    // Concat instead of spread — avoids 2 temporary arrays
    return this.buf.slice(this.head).concat(this.buf.slice(0, this.head));
  }
  clear() {
    this.buf = new Array(this.cap);
    this.head = 0;
    this.size = 0;
  }
}

// ============================================
// TWITCH IRC CLIENT (READ-ONLY)
// ============================================
class IRC {
  constructor() {
    this.ws = null;
    this.channels = new Map();
    this.handlers = new Map();
    this.partial = '';
    this.nick = `justinfan${Math.floor(Math.random() * 99999)}`;
    this._destroyed = false;
    this._lastData = 0;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._ac = new AbortController();
    // Reconnect when tab becomes visible after silence
    document.addEventListener('visibilitychange', () => {
      if (this._destroyed) return;
      if (document.visibilityState === 'visible' && this.channels.size > 0) {
        const silence = Date.now() - this._lastData;
        if (silence > 60000 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          log('Tab visible after', Math.round(silence / 1000), 's silence, reconnecting');
          this._forceReconnect();
          // Reload history to fill gap from sleep
          for (const ch of this.channels.keys()) {
            this.loadHistory(ch);
          }
        }
      }
    }, { signal: this._ac.signal });
  }

  connect() {
    if (this._destroyed) return;
    this._stopHeartbeat();
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      try { this.ws.onclose = null; this.ws.close(); } catch {}
      this.ws = null;
    }
    this.partial = '';

    const connectTimeout = setTimeout(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        log('IRC connect timeout');
        try { this.ws.close(); } catch {}
      }
    }, 10000);

    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    this.ws.onopen = () => {
      clearTimeout(connectTimeout);
      log('IRC connected');
      this._reconnectAttempts = 0;
      this._lastData = Date.now();
      this.ws.send(`NICK ${this.nick}\r\n`);
      this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      for (const ch of this.channels.keys()) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(`JOIN #${ch}\r\n`);
      }
      this._startHeartbeat();
      fetchGlobalBadges();
      const currentCh = getCurrentChannel();
      if (currentCh) fetchChannelBadges(currentCh);
    };
    this.ws.onmessage = (e) => this.parse(e.data);
    this.ws.onerror = () => { clearTimeout(connectTimeout); };
    this.ws.onclose = () => {
      clearTimeout(connectTimeout);
      this._stopHeartbeat();
      if (this._destroyed) return;
      this._scheduleReconnect();
    };
  }

  destroy() {
    this._destroyed = true;
    this._ac?.abort();
    this._stopHeartbeat();
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this._stopHeartbeat();
        if (!this._destroyed) this._scheduleReconnect();
        return;
      }
      const silence = Date.now() - this._lastData;
      if (silence > 90000) {
        log('Zombie detected —', Math.round(silence / 1000), 's silence');
        this._forceReconnect();
        return;
      }
      try { this.ws.send('PING :heatsync\r\n'); } catch {
        this._forceReconnect();
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _forceReconnect() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this._reconnectAttempts = 0;
    if (!this._destroyed) this.connect();
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    clearTimeout(this._reconnectTimer);
    const delay = Math.min(2000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    log('Reconnecting in', delay, 'ms (attempt', this._reconnectAttempts, ')');
    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed) this.connect();
    }, delay);
  }

  parse(data) {
    this._lastData = Date.now();
    this.partial += data;
    const lines = this.partial.split('\r\n');
    this.partial = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('PING')) {
        try { this.ws.send('PONG :tmi.twitch.tv\r\n'); } catch {}
        continue;
      }
      if (line.startsWith(':tmi.twitch.tv PONG') || line.startsWith('PONG')) continue;
      if (line.includes('RECONNECT')) {
        log('Server requested RECONNECT');
        this._forceReconnect();
        return;
      }
      const msg = parseIrcLine(line);
      if (msg && !msg.type) {
        // PRIVMSG
        const ch = msg.channel;
        usernameCache.add(msg.user);
        knownColors.set(msg.user.toLowerCase(), msg.color);
        if (usernameCache.size > 500) {
          usernameCache.delete(usernameCache.values().next().value);
          const oldest = knownColors.keys().next().value;
          knownColors.delete(oldest);
        }
        fetchChannelBadges(ch);

        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.emit('message', msg);
        }
      } else if (msg && (msg.type === 'usernotice' || msg.type === 'notice')) {
        const ch = msg.channel;
        if (msg.user !== 'system') {
          usernameCache.add(msg.user);
          knownColors.set(msg.user.toLowerCase(), msg.color);
        }
        fetchChannelBadges(ch);
        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.emit('message', msg);
        }
      }
    }
  }

  join(ch) {
    ch = ch.toLowerCase();
    if (this.channels.has(ch)) return;
    this.channels.set(ch, new CircularBuffer(1500));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`JOIN #${ch}\r\n`);
    }
    log('Joined', ch);
    // Load message history
    this.loadHistory(ch);
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch);
    if (!buffer) return;

    const cacheKey = `hs_chat_history_${ch}`;
    const CACHE_TTL = 300000; // 5 min

    // 1. Try localStorage cache for instant render
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { messages, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL && messages?.length > 0) {
          log('Cache hit:', messages.length, 'msgs for', ch);
          for (const msg of messages) {
            usernameCache.add(msg.user);
            knownColors.set(msg.user.toLowerCase(), msg.color);
            if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths);
            buffer.push(msg);
          }
          if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
            renderMessages(currentTab);
          }
          // Refresh in background
          this._fetchHistory(ch, buffer, cacheKey);
          return;
        }
      }
    } catch {}

    // 2. No valid cache — fetch synchronously
    await this._fetchHistory(ch, buffer, cacheKey);
  }

  async _fetchHistory(ch, buffer, cacheKey, attempt = 0) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      log('Fetching history for', ch, attempt > 0 ? `(retry ${attempt})` : '');
      const resp = await fetch(
        `https://recent-messages.robotty.de/api/v2/recent-messages/${ch}?limit=800&hide_moderation_messages=false&hide_moderated_messages=false&clearchatToNotice=true`,
        { signal: ctrl.signal, credentials: 'omit' }
      );
      if (!resp.ok) {
        log('History fetch failed:', resp.status);
        if (attempt < 2) {
          clearTimeout(timer);
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          return this._fetchHistory(ch, buffer, cacheKey, attempt + 1);
        }
        return;
      }
      const data = await resp.json();
      if (!data.messages?.length) return;

      await fetchChannelBadges(ch);

      // Dedup only against live messages (not cached history we're replacing)
      const liveMessages = buffer.getAll().filter(m => !m.isHistory);
      const liveIds = new Set();
      for (const m of liveMessages) {
        if (m.id) liveIds.add(m.id);
      }

      const parsed = [];
      for (const line of data.messages) {
        const msg = parseIrcLine(line, ch);
        if (!msg) continue;
        msg.isHistory = true;
        if (msg.id && liveIds.has(msg.id)) continue;
        usernameCache.add(msg.user);
        knownColors.set(msg.user.toLowerCase(), msg.color);
        if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths);
        parsed.push(msg);
      }

      // Merge: clear buffer, add history first, then any live messages on top
      buffer.clear();
      for (const msg of parsed) buffer.push(msg);
      for (const msg of liveMessages) buffer.push(msg);

      log('Loaded history for', ch, '- parsed:', parsed.length, 'total:', buffer.getAll().length);

      // Cache for next time
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          messages: parsed,
          timestamp: Date.now()
        }));
      } catch {}

      if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
        renderMessages(currentTab);
      }
    } catch (e) {
      log('Failed to load history for', ch, e.message);
      clearTimeout(timer);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        return this._fetchHistory(ch, buffer, cacheKey, attempt + 1);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  part(ch) {
    ch = ch.toLowerCase();
    if (!this.channels.has(ch)) return;
    this.channels.delete(ch);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`PART #${ch}\r\n`);
    }
    log('Parted', ch);
  }

  getMessages(ch) {
    return this.channels.get(ch?.toLowerCase())?.getAll() || [];
  }

  on(e, fn) {
    if (!this.handlers.has(e)) this.handlers.set(e, new Set());
    this.handlers.get(e).add(fn);
  }

  emit(e, d) {
    this.handlers.get(e)?.forEach(fn => fn(d));
  }
}

// ============================================
// KICK CHAT CLIENT (VIA HEATSYNC WEBHOOK)
// ============================================
class KickChat {
  constructor() {
    this.channels = new Map() // kickUsername → CircularBuffer
    this.handlers = new Map()
    this._destroyed = false
    this._listener = null
  }

  connect() {
    if (this._destroyed) return
    if (this._listener) return

    // Listen for kick chat messages relayed from background.js
    this._listener = (message) => {
      if (message.type === 'kick_chat_message' && message.data) {
        const d = message.data
        const channel = d.channel?.toLowerCase()
        if (!channel || !this.channels.has(channel)) return
        // Convert Kick badge objects [{name,version}] to Twitch-style "name/version" string
        const badgeStr = Array.isArray(d.badges)
          ? d.badges.map(b => `${b.name || 'badge'}/${b.version || '1'}`).join(',')
          : ''
        const msg = {
          user: d.username || 'unknown',
          text: d.content || '',
          color: d.color || '#53fc18',
          badges: badgeStr,
          channel,
          time: d.timestamp || Date.now(),
          platform: 'kick',
          replyTo: d.replyTo ? {
            user: d.replyTo.username,
            text: d.replyTo.content || ''
          } : null
        }
        this.channels.get(channel).push(msg)
        this.emit('message', msg)
      }

      // KICKs gifted events (Kick's equivalent of Twitch Bits)
      if (message.type === 'kick_kicks_event') {
        const channel = message.channel?.toLowerCase()
        if (!channel || !this.channels.has(channel)) return
        const msg = {
          user: message.username || 'anonymous',
          text: message.message || '',
          systemMsg: `${message.username || 'Anonymous'} gifted ${message.amount} KICKs${message.giftName ? ' (' + message.giftName + ')' : ''}!`,
          color: '#ffd600',
          badges: '',
          channel,
          time: Date.now(),
          type: 'usernotice',
          msgId: 'kicks_gifted',
          platform: 'kick',
          kicksEvent: true,
          id: ''
        }
        this.channels.get(channel).push(msg)
        this.emit('message', msg)
      }

      // Kick subscription events (new sub, resub, gift subs)
      if (message.type === 'kick_sub_event') {
        const channel = message.channel?.toLowerCase()
        if (!channel || !this.channels.has(channel)) return
        const msg = {
          user: message.username || 'system',
          text: '',
          systemMsg: message.message || '',
          color: '#53fc18',
          badges: '',
          channel,
          time: Date.now(),
          type: 'usernotice',
          msgId: message.eventType || '',
          platform: 'kick',
          id: ''
        }
        this.channels.get(channel).push(msg)
        this.emit('message', msg)
      }
    }
    chrome.runtime?.onMessage?.addListener(this._listener)
    log('Kick chat listener registered (webhook mode)')
  }

  destroy() {
    this._destroyed = true
    if (this._listener) {
      chrome.runtime?.onMessage?.removeListener(this._listener)
      this._listener = null
    }
    // Leave all channels
    for (const username of this.channels.keys()) {
      safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: username } })
    }
    this.channels.clear()
  }

  async join(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (this.channels.has(kickUsername)) return
    this.channels.set(kickUsername, new CircularBuffer(1500))
    // Tell background to join kick channel via HeatSync WS
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:join', platform: 'kick', channel: kickUsername } })
    log('Kick joined', kickUsername, '(webhook mode)')
  }

  part(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (!this.channels.has(kickUsername)) return
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: kickUsername } })
    this.channels.delete(kickUsername)
    log('Kick parted', kickUsername)
  }

  getMessages(kickUsername) {
    return this.channels.get(kickUsername?.toLowerCase())?.getAll() || []
  }

  on(e, fn) {
    if (!this.handlers.has(e)) this.handlers.set(e, new Set())
    this.handlers.get(e).add(fn)
  }

  emit(e, d) {
    this.handlers.get(e)?.forEach(fn => fn(d))
  }
}


// --- multichat/auth-irc.js ---
// Auth IRC - authenticated Twitch IRC connection for sending messages

const authState = {
  ws: null,
  ready: false,
  connecting: false,
  destroyed: false,
  joined: new Set(),
  joinWaiters: new Map(),
  lastData: 0,
  pongPending: false,
  token: null,
  nick: null,
  keepaliveTimer: null,
  reconnectTimer: null,
  reconnectDelay: 1000,
  sendQueue: [], // Capped at 50 — drop oldest if full
}
const MAX_SEND_QUEUE = 50

function authIrcAlive() {
  return authState.ws?.readyState === WebSocket.OPEN && authState.ready
}

function cleanupAuthIrc(destroy = false) {
  if (destroy) authState.destroyed = true;
  if (authState.keepaliveTimer) { clearInterval(authState.keepaliveTimer); authState.keepaliveTimer = null; }
  if (authState.reconnectTimer) { clearTimeout(authState.reconnectTimer); authState.reconnectTimer = null; }
  const prevJoined = [...authState.joined];
  if (authState.ws) {
    authState.ws.onclose = null;
    authState.ws.onerror = null;
    authState.ws.onmessage = null;
    try { authState.ws.close(); } catch {}
  }
  authState.ws = null;
  authState.ready = false;
  authState.connecting = false;
  authState.lastData = 0;
  authState.pongPending = false;
  authState.joined.clear();
  for (const [, w] of authState.joinWaiters) {
    clearTimeout(w.timer);
    w.resolve(false);
  }
  authState.joinWaiters.clear();
  return prevJoined;
}

function handleAuthIrcMessage(event) {
  authState.lastData = Date.now();
  for (const line of event.data.split('\r\n')) {
    if (!line) continue;
    if (line.startsWith('PING')) {
      try { authState.ws.send(line.replace('PING', 'PONG') + '\r\n'); } catch {}
      continue;
    }
    if (line.includes('PONG')) { authState.pongPending = false; continue; }

    const joinMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv JOIN #(\w+)/);
    if (joinMatch) {
      const ch = joinMatch[2].toLowerCase();
      authState.joined.add(ch);
      const w = authState.joinWaiters.get(ch);
      if (w) { clearTimeout(w.timer); w.resolve(true); authState.joinWaiters.delete(ch); }
      continue;
    }
    const partMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PART #(\w+)/);
    if (partMatch) { authState.joined.delete(partMatch[2].toLowerCase()); continue; }
    if (line.includes('NOTICE') && MC_DEBUG) console.warn('[HS] Auth IRC NOTICE:', line.slice(0, 200));
    if (line.includes('RECONNECT')) {
      log('Auth IRC: Twitch sent RECONNECT');
      const prev = cleanupAuthIrc();
      scheduleReconnect(prev);
      return;
    }
    if (line.includes('WHISPER')) {
      const msg = parseIrcLine(line)
      if (msg?.type === 'whisper') handleIncomingWhisper(msg)
      continue
    }
    if (line.includes(' 353 ') || line.includes(' 366 ') || line.includes('ROOMSTATE')) continue;
    if (MC_DEBUG) console.warn('[HS] IRC ←', line.slice(0, 200));
  }
}

function scheduleReconnect(prevChannels) {
  if (authState.destroyed || !authState.token || !authState.nick) return;
  if (authState.reconnectTimer) return;
  const delay = authState.reconnectDelay;
  authState.reconnectDelay = Math.min(delay * 2, 30000);
  log(`Auth IRC reconnect in ${delay}ms...`);
  authState.reconnectTimer = setTimeout(async () => {
    authState.reconnectTimer = null;
    if (authState.destroyed || authIrcAlive()) return;
    const ok = await connectAuthIrc(authState.token, authState.nick);
    if (ok === true) {
      for (const ch of (prevChannels || [])) await joinChannel(ch);
      drainSendQueue();
      log('Auth IRC reconnected, rejoined:', (prevChannels || []).join(', ') || '(none)');
    } else if (ok !== 'auth_failed') {
      scheduleReconnect(prevChannels);
    }
  }, delay);
}

async function connectAuthIrc(token, nick) {
  if (authState.connecting) {
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (authIrcAlive()) return true;
      if (!authState.connecting) break;
    }
    return authIrcAlive();
  }
  cleanupAuthIrc();
  authState.connecting = true;
  authState.token = token;
  authState.nick = nick;
  authState.destroyed = false;
  try {
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    authState.ws = ws;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
      ws.onopen = () => {
        ws.send(`PASS oauth:${token}\r\n`);
        ws.send(`NICK ${nick}\r\n`);
        ws.send('CAP REQ :twitch.tv/commands twitch.tv/tags\r\n');
      };
      ws.onmessage = (event) => {
        if (event.data.includes(' 001 ')) {
          authState.ready = true;
          authState.lastData = Date.now();
          authState.reconnectDelay = 1000;
          clearTimeout(timeout);
          resolve();
        }
        if (event.data.includes('Login authentication failed') || event.data.includes('Login unsuccessful')) {
          clearTimeout(timeout);
          reject(new Error('auth_failed'));
        }
        for (const l of event.data.split('\r\n')) {
          if (l.startsWith('PING')) try { ws.send(l.replace('PING', 'PONG') + '\r\n'); } catch {}
        }
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('ws_error')); };
      ws.onclose = () => { clearTimeout(timeout); reject(new Error('ws_closed')); };
    });
    ws.onmessage = handleAuthIrcMessage;
    ws.onclose = () => {
      log('Auth IRC disconnected');
      const prev = cleanupAuthIrc();
      scheduleReconnect(prev);
    };
    ws.onerror = () => {};
    // Keepalive PING every 30s — detect dead sockets fast
    authState.keepaliveTimer = cleanup.setInterval(() => {
      if (!authState.ws || authState.ws.readyState !== WebSocket.OPEN) return;
      if (authState.pongPending) {
        log('Auth IRC: PONG timeout, reconnecting');
        const prev = cleanupAuthIrc();
        scheduleReconnect(prev);
        return;
      }
      authState.pongPending = true;
      try { authState.ws.send('PING :hs\r\n'); } catch {}
    }, 30000);
    authState.connecting = false;
    // Pre-join current channel so first send is instant
    const ch = getCurrentChannel()?.toLowerCase();
    if (ch) joinChannel(ch);
    return true;
  } catch (e) {
    log('Auth IRC connect failed:', e.message);
    authState.connecting = false;
    cleanupAuthIrc();
    return e.message === 'auth_failed' ? 'auth_failed' : false;
  }
}

function joinChannel(channel) {
  channel = channel.toLowerCase();
  if (authState.joined.has(channel)) return Promise.resolve(true);
  if (!authIrcAlive()) return Promise.resolve(false);
  try { authState.ws.send(`JOIN #${channel}\r\n`); } catch { return Promise.resolve(false); }
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      authState.joinWaiters.delete(channel);
      authState.joined.add(channel);
      resolve(true);
    }, 500);
    authState.joinWaiters.set(channel, { resolve, timer });
  });
}

function drainSendQueue() {
  while (authState.sendQueue.length && authIrcAlive()) {
    const { channel, text } = authState.sendQueue.shift();
    try {
      authState.ws.send(`PRIVMSG #${channel} :${text}\r\n`);
      log('Drained queued msg to #' + channel);
    } catch {
      authState.sendQueue.unshift({ channel, text });
      break;
    }
  }
}

async function sendIrcMessage(channel, text, token, replyParentId) {
  const nick = currentUsername || getCurrentUsername();
  if (!nick) { console.warn('[HS] SEND FAIL: no username'); return 'no_user'; }
  channel = channel.toLowerCase();
  const prefix = replyParentId ? `@reply-parent-msg-id=${replyParentId} ` : ''

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!authIrcAlive()) {
        const result = await connectAuthIrc(token, nick);
        if (result === 'auth_failed') return 'auth_failed';
        if (!result) {
          if (attempt < 2) continue;
          if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
          scheduleReconnect([channel]);
          log('Queued message for reconnect');
          return true;
        }
      }
      if (!authState.joined.has(channel)) await joinChannel(channel);
      if (!authIrcAlive()) {
        if (attempt < 2) { cleanupAuthIrc(); continue; }
        if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
        scheduleReconnect([channel]);
        return true;
      }
      authState.ws.send(`${prefix}PRIVMSG #${channel} :${text}\r\n`);
      if (MC_DEBUG) console.warn('[HS] IRC SEND →', `#${channel}`, `nick=${nick}`, replyParentId ? `reply=${replyParentId}` : '', text.slice(0, 40));
      return true;
    } catch (e) {
      log('Send error attempt', attempt, ':', e.message || e);
      cleanupAuthIrc();
      if (attempt === 2) {
        if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
        scheduleReconnect([channel]);
        return true;
      }
    }
  }
  return 'send_error';
}


// --- multichat/kick-send.js ---
// Kick chat sending — routes through background.js → kick.com tab content script

const kickChannelIdCache = new Map()

async function resolveKickChannelId(slug) {
  if (kickChannelIdCache.has(slug)) return kickChannelIdCache.get(slug)
  const resp = await safeSendMessage({ type: 'kick_resolve_channel', slug })
  if (resp?.channelId) {
    kickChannelIdCache.set(slug, resp.channelId)
    return resp.channelId
  }
  return null
}

async function sendKickMessage(kickSlug, text) {
  const channelId = await resolveKickChannelId(kickSlug)
  if (!channelId) return 'no_channel'
  try {
    const resp = await safeSendMessage({ type: 'kick_send_message', channelId, content: text })
    if (resp?.ok) return true
    return resp?.error || 'send_failed'
  } catch (e) {
    log('Kick send error:', e.message)
    return 'send_failed'
  }
}


// --- multichat/emotes.js ---
// Emotes - cache, lookup, processing, picker, block/inventory

  const UNICODE_EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]+$/u;

  // Emote size (1, 2, or 4)
  let emoteSize = 1;

  // Upgrade emote URL to match current emote size setting
  function getChatResUrl(url) {
    if (!url || emoteSize === 1) return url;
    if (emoteSize === 2) {
      if (url.includes('cdn.7tv.app')) return url.replace('/1x', '/2x');
      if (url.includes('cdn.betterttv.net')) return url.replace('/1x', '/2x');
      if (url.includes('cdn.frankerfacez.com')) return url.replace(/\/1(?=\.|$)/, '/2');
      if (url.includes('static-cdn.jtvnw.net')) return url.replace('/1.0', '/2.0');
    } else if (emoteSize === 4) {
      if (url.includes('cdn.7tv.app')) return url.replace('/1x', '/4x').replace('/2x', '/4x');
      if (url.includes('cdn.betterttv.net')) return url.replace('/1x', '/3x').replace('/2x', '/3x');
      if (url.includes('cdn.frankerfacez.com')) return url.replace(/\/[12](?=\.|$)/, '/4');
      if (url.includes('static-cdn.jtvnw.net')) return url.replace(/\/[12]\.0/, '/3.0');
    }
    return url;
  }

  // Upgrade emote URL to highest resolution for tooltip
  function getHighResUrl(url) {
    if (!url) return url;
    // 7TV: /1x → /4x
    if (url.includes('cdn.7tv.app')) {
      return url.replace('/1x', '/4x').replace('/2x', '/4x').replace('/3x', '/4x');
    }
    // BTTV: /1x → /3x (max)
    if (url.includes('cdn.betterttv.net')) {
      return url.replace('/1x', '/3x').replace('/2x', '/3x');
    }
    // FFZ: /1 → /4
    if (url.includes('cdn.frankerfacez.com')) {
      return url.replace(/\/1(?=\.|$)/, '/4').replace(/\/2(?=\.|$)/, '/4');
    }
    // Twitch: /1.0 → /3.0 (max)
    if (url.includes('static-cdn.jtvnw.net')) {
      return url.replace('/1.0', '/3.0').replace('/2.0', '/3.0');
    }
    return url;
  }

  /**
   * Group emotes by state+source into ordered sections
   */
  const SECTION_ORDER = [
    'channel-7tv', 'channel-bttv', 'channel-ffz', 'channel-twitch',
    '7tv', 'bttv', 'ffz', 'twitch', 'heatsync'
  ]
  const SECTION_LABELS = {
    'channel-7tv': 'channel 7tv', 'channel-bttv': 'channel bttv',
    'channel-ffz': 'channel ffz', 'channel-twitch': 'channel twitch',
    '7tv': '7tv global', 'bttv': 'bttv global', 'ffz': 'ffz global',
    'twitch': 'twitch global', 'heatsync': 'heatsync'
  }

  function groupEmotes(allEmotes) {
    const groups = {}
    for (const [name, emote] of allEmotes) {
      const key = emote.state === 'channel' ? `channel-${emote.source}` : emote.source
      if (!groups[key]) groups[key] = []
      groups[key].push([name, emote])
    }
    return SECTION_ORDER
      .filter(k => groups[k]?.length)
      .map(k => ({ key: k, label: SECTION_LABELS[k] || k, emotes: groups[k] }))
  }

  function renderEmoteSections(sections, emptyMsg = 'no emotes loaded') {
    if (!sections.length) return `<div class="hs-mc-picker-empty">${escapeHtml(emptyMsg)}</div>`
    // Only render section headers + first CHUNK_SIZE emotes per section for instant open
    // Rest gets appended via chunkedRenderRemaining()
    return sections.map(s => {
      const initial = s.emotes.slice(0, EMOTE_CHUNK_SIZE)
      return `
      <div class="hs-mc-picker-section" data-section-key="${escapeHtml(s.key)}">
        <div class="hs-mc-picker-section-header">${escapeHtml(s.label)} <span class="hs-mc-picker-section-count">${s.emotes.length}</span></div>
        <div class="hs-mc-picker-section-grid">${initial.map(emoteImgHtml).join('')}</div>
      </div>`
    }).join('')
  }

  const EMOTE_CHUNK_SIZE = 80
  let _chunkedRafId = null

  function emoteImgHtml([name, emote]) {
    return `<img src="${escapeHtml(emote.url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)} (${escapeHtml(emote.source)})" class="hs-mc-picker-emote hs-emote-${escapeHtml(emote.source)}" data-name="${escapeHtml(name)}" data-source="${escapeHtml(emote.source)}" loading="lazy">`
  }

  /** Append remaining emotes in rAF chunks so the picker opens instantly */
  function chunkedRenderRemaining(sections, container) {
    if (_chunkedRafId) cancelAnimationFrame(_chunkedRafId)
    // Build queue of {gridEl, emotes} for sections with remaining emotes
    const queue = []
    for (const s of sections) {
      if (s.emotes.length <= EMOTE_CHUNK_SIZE) continue
      const gridEl = container.querySelector(`[data-section-key="${CSS.escape(s.key)}"] .hs-mc-picker-section-grid`)
      if (!gridEl) continue
      queue.push({ gridEl, emotes: s.emotes.slice(EMOTE_CHUNK_SIZE), offset: 0 })
    }
    function renderNext() {
      const item = queue[0]
      if (!item) return
      const chunk = item.emotes.slice(item.offset, item.offset + EMOTE_CHUNK_SIZE)
      if (!chunk.length) { queue.shift(); renderNext(); return }
      // Use DocumentFragment for minimal reflows
      const frag = document.createDocumentFragment()
      for (const entry of chunk) {
        const tmp = document.createElement('template')
        tmp.innerHTML = emoteImgHtml(entry)
        frag.appendChild(tmp.content)
      }
      item.gridEl.appendChild(frag)
      item.offset += EMOTE_CHUNK_SIZE
      if (item.offset >= item.emotes.length) queue.shift()
      if (queue.length) _chunkedRafId = requestAnimationFrame(renderNext)
    }
    _chunkedRafId = requestAnimationFrame(renderNext)
  }

  /**
   * Create emote picker popup
   */
  let pickerTab = 'emotes'; // 'emotes' or 'twitch'
  let _pickerCloseHandler = null; // Tracked to prevent duplicate close handlers

  function showEmotePicker(tab = null) {
    const picker = document.getElementById('hs-mc-emote-picker');
    if (!picker) return;

    // If tab specified, switch to it; otherwise toggle
    if (tab) {
      pickerTab = tab;
    } else if (picker.classList.contains('visible')) {
      picker.classList.remove('visible');
      adjustOverlayForPicker(false);
      hideInputBar();
      if (_chunkedRafId) { cancelAnimationFrame(_chunkedRafId); _chunkedRafId = null; }
      return;
    }

    // Build tabbed UI — merge channel emotes first (so they keep 'channel' state), then globals
    // Note: all emote names/urls are pre-sanitized via escapeHtml in render helpers
    const allEmotes = new Map();
    const chCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
    if (chCache) for (const [k, v] of chCache) allEmotes.set(k, v);
    for (const [k, v] of emoteCache) if (!allEmotes.has(k)) allEmotes.set(k, v);
    const sections = groupEmotes(allEmotes);
    picker.innerHTML = `
      <div class="hs-mc-tab-content" id="hs-mc-tab-emotes" style="display: ${pickerTab === 'emotes' ? 'flex' : 'none'}; flex-direction: column;">
        <div class="hs-mc-picker-header">
          <div class="hs-mc-search-wrap">
            <svg class="hs-mc-search-icon" width="14" height="14" viewBox="0 0 20 20"><path fill="#000" d="M13.74 12.33l4.04 4.04a1 1 0 01-1.42 1.42l-4.04-4.04a7 7 0 111.42-1.42zM9 14A5 5 0 109 4a5 5 0 000 10z"/></svg>
            <input type="text" id="hs-mc-emote-search" placeholder="search emotes..." autocomplete="off">
          </div>
        </div>
        <div class="hs-mc-picker-scroll" id="hs-mc-emote-grid">
          ${renderEmoteSections(sections)}
        </div>
      </div>
      <div class="hs-mc-tab-content" id="hs-mc-tab-twitch" style="display: ${pickerTab === 'twitch' ? 'flex' : 'none'}; flex-direction: column; padding: 8px 0;">
        <div class="hs-mc-pred-loading">loading...</div>
      </div>
      <div class="hs-mc-picker-tabs">
        <button class="hs-mc-picker-tab ${pickerTab === 'emotes' ? 'active' : ''}" data-tab="emotes">emotes</button>
        <button class="hs-mc-picker-tab ${pickerTab === 'twitch' ? 'active' : ''}" data-tab="twitch">twitch</button>
      </div>
    `;

    // Chunked render remaining emotes after initial paint
    const grid = document.getElementById('hs-mc-emote-grid');
    if (grid) chunkedRenderRemaining(sections, grid);

    // Search functionality (debounced)
    let _searchTimer = null;
    const searchInput = document.getElementById('hs-mc-emote-search');
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        const grid = document.getElementById('hs-mc-emote-grid');
        if (!grid) return;

        const searchEmotes = new Map();
        const searchChCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
        if (searchChCache) for (const [k, v] of searchChCache) searchEmotes.set(k, v);
        for (const [k, v] of emoteCache) if (!searchEmotes.has(k)) searchEmotes.set(k, v);
        const filtered = new Map();
        for (const [name, emote] of searchEmotes) {
          if (name.toLowerCase().includes(query)) filtered.set(name, emote);
        }
        const filteredSections = groupEmotes(filtered);
        grid.innerHTML = renderEmoteSections(filteredSections, 'no matches');
        chunkedRenderRemaining(filteredSections, grid);
      }, 150);
    });

    // Emote size controls
    picker.querySelectorAll('.hs-mc-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = parseInt(btn.dataset.size, 10);
        setEmoteSize(size);
        // Update active state
        picker.querySelectorAll('.hs-mc-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Tab switching
    picker.querySelectorAll('.hs-mc-picker-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const newTab = tabBtn.dataset.tab;
        const oldTab = pickerTab;
        pickerTab = newTab;
        picker.querySelectorAll('.hs-mc-picker-tab').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        picker.querySelectorAll('.hs-mc-tab-content').forEach(c => c.style.display = 'none');
        const display = (newTab === 'emotes' || newTab === 'settings' || newTab === 'twitch') ? 'flex' : 'block';
        document.getElementById(`hs-mc-tab-${newTab}`).style.display = display;
        if (newTab === 'twitch') renderTwitchTab();
        if (oldTab === 'twitch' && newTab !== 'twitch') stopPredictionPoll();
      });
    });

    // Event delegation for emote clicks (single handler, works for chunked rendering)
    if (!picker._hsDelegated) {
      picker._hsDelegated = true;
      picker.addEventListener('click', (e) => {
        const img = e.target.closest('.hs-mc-picker-emote');
        if (!img) return;
        const name = img.dataset.name;
        const input = document.getElementById('hs-mc-input');
        if (!input || !name) return;
        if (wysiwygEnabled || !('value' in input)) {
          // WYSIWYG: insert emote image (with zero-width stacking)
          pasteEmoteToInput(name)
        } else {
          const pos = input.selectionStart || input.value.length;
          const before = input.value.slice(0, pos);
          const after = input.value.slice(pos);
          const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
          input.value = before + space + name + ' ' + after;
          pendingMessage = input.value;
        }
        input.focus();
        picker.classList.remove('visible');
        adjustOverlayForPicker(false);
      });
    }

    picker.classList.add('visible');
    // Position picker flush above input bar (or at bottom if hidden)
    const bar = document.getElementById('hs-mc-inputbar');
    const barHeight = (bar && inputBarVisible) ? bar.offsetHeight : 0;
    picker.style.bottom = barHeight + 'px';
    adjustOverlayForPicker(true);

    if (pickerTab === 'twitch') renderTwitchTab();

    // Close when clicking outside (remove any previous handler first)
    if (_pickerCloseHandler) document.removeEventListener('click', _pickerCloseHandler);
    setTimeout(() => {
      _pickerCloseHandler = (e) => {
        if (mcSignal?.aborted) { document.removeEventListener('click', _pickerCloseHandler); _pickerCloseHandler = null; return; }
        if (!picker.contains(e.target) && !e.target.closest('#hs-mc-emote-btn')) {
          picker.classList.remove('visible');
          adjustOverlayForPicker(false);
          hideInputBar();
          stopPredictionPoll();
          document.removeEventListener('click', _pickerCloseHandler);
          _pickerCloseHandler = null;
        }
      };
      document.addEventListener('click', _pickerCloseHandler);
    }, 0);
  }

  /** Adjust overlay bottom to make room for picker panel */
  function adjustOverlayForPicker(open) {
    const overlay = document.getElementById('hs-mc-overlay');
    if (!overlay) return;
    const container = document.getElementById('hs-mc-container');
    const hasBottomTabs = container?.classList.contains('hs-tabs-bottom');
    const barBase = inputBarVisible ? (hasBottomTabs ? 90 : 52) : 0;
    const pickerEl = document.getElementById('hs-mc-emote-picker');
    const pickerHeight = open && pickerEl ? pickerEl.offsetHeight : 0;
    overlay.style.bottom = (barBase + pickerHeight) + 'px';
  }

  // Blocked emotes: stored by HASH (matches background.js/server)
  // blockedEmoteHashes = Set of hashes from storage
  // blockedEmoteNames = Set of names (derived via hashToName lookup, for processEmotes)
  let blockedEmoteHashes = new Set();
  let blockedEmoteNames = new Set();

  function rebuildBlockedNames() {
    blockedEmoteNames.clear();
    for (const hash of blockedEmoteHashes) {
      const name = hashToName.get(hash);
      if (name) blockedEmoteNames.add(name);
    }
    log('Blocked names rebuilt:', blockedEmoteNames.size, 'from', blockedEmoteHashes.size, 'hashes');
  }

  async function loadBlockedEmotes() {
    try {
      const data = await chrome.storage.local.get(['blocked_emotes']);
      blockedEmoteHashes = new Set(data.blocked_emotes || []);
      rebuildBlockedNames();
      log('Loaded', blockedEmoteHashes.size, 'blocked emote hashes');
    } catch (e) {
      log('Error loading blocked emotes:', e);
    }
  }

  // Flash all wrappers for a given emote name
  function flashAllEmotes(emoteName, flashClass) {
    const wrappers = queryEmoteWrappers(emoteName)
    if (wrappers.length === 0) return
    // Batch read/write to avoid per-element reflow
    for (const w of wrappers) {
      w.classList.remove('hs-flash-paste', 'hs-flash-add', 'hs-flash-block', 'hs-flash-unblock', 'hs-flash-remove');
    }
    // Single reflow trigger for all elements
    void document.body.offsetWidth
    for (const w of wrappers) {
      w.classList.add(flashClass);
      w.addEventListener('animationend', () => w.classList.remove(flashClass), { once: true });
    }
  }

  // Create emote <img> for WYSIWYG input
  function createInputEmoteImg(emoteName) {
    const emote = lookupEmote(emoteName)
    if (!emote) return null
    const img = document.createElement('img')
    img.className = 'hs-input-emote'
    img.src = getChatResUrl(emote.url)
    img.alt = emoteName
    img.dataset.emoteName = emoteName
    img.draggable = false
    if (emote.zeroWidth) img.dataset.zeroWidth = '1'
    return img
  }

  // Stack a zero-width emote onto a base emote/stack in the input
  function stackInputEmote(baseEl, overlayImg) {
    if (baseEl.classList.contains('hs-input-stack')) {
      baseEl.appendChild(overlayImg)
      return baseEl
    }
    const stack = document.createElement('span')
    stack.className = 'hs-input-stack'
    baseEl.parentNode.insertBefore(stack, baseEl)
    stack.appendChild(baseEl)
    stack.appendChild(overlayImg)
    return stack
  }

  // Find last emote element (img or stack) walking backwards, skipping whitespace
  function findLastInputEmote(input) {
    let node = input.lastChild
    while (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '') {
        node = node.previousSibling
        continue
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && node.classList.contains('hs-input-emote')) return node
        if (node.classList?.contains('hs-input-stack')) return node
      }
      break
    }
    return null
  }

  // Move cursor to end of input
  function cursorToEnd(input) {
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Paste emote name to input
  function pasteEmoteToInput(emoteName) {
    const input = document.getElementById('hs-mc-input');
    if (!input) return;
    if (wysiwygEnabled || !('value' in input)) {
      const img = createInputEmoteImg(emoteName)
      if (img) {
        const emote = lookupEmote(emoteName)
        const isZeroWidth = emote && !!emote.zeroWidth

        if (isZeroWidth) {
          const target = findLastInputEmote(input)
          if (target) {
            // Remove trailing whitespace between target and end
            let next = target.nextSibling
            while (next) {
              if (next.nodeType === Node.TEXT_NODE && next.textContent.trim() === '') {
                const rm = next
                next = next.nextSibling
                rm.remove()
              } else break
            }
            stackInputEmote(target, img)
            input.appendChild(document.createTextNode('\u00A0'))
            cursorToEnd(input)
            pendingMessage = getInputText()
            input.focus()
            return
          }
        }

        // Regular emote: append img + space
        input.appendChild(img)
        input.appendChild(document.createTextNode('\u00A0'))
        cursorToEnd(input)
      } else {
        // Fallback: emote not in cache, insert as text
        const text = input.textContent || ''
        const space = text.length > 0 && !text.endsWith(' ') ? ' ' : ''
        input.textContent = text + space + emoteName + ' '
        cursorToEnd(input)
      }
      pendingMessage = getInputText()
    } else {
      const pos = input.selectionStart || input.value.length;
      const before = input.value.slice(0, pos);
      const after = input.value.slice(pos);
      const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
      input.value = before + space + emoteName + ' ' + after;
      pendingMessage = input.value;
      input.selectionStart = input.selectionEnd = pos + space.length + emoteName.length + 1;
    }
    input.focus();
  }

  // Remove emote from inventory via background.js
  async function removeEmoteFromInventory(emoteName, targetEl) {
    if (!emoteName) return;
    const hash = inventoryHashes.get(emoteName);
    if (!hash) {
      // Fallback: generate from emote URL
      const emote = lookupEmote(emoteName);
      const fallbackHash = emote?.url ? btoa(emote.url).slice(0, 32) : emoteName;
      try {
        const response = await new Promise((resolve) => {
          chrome.runtime.sendMessage({
            type: 'remove_from_inventory',
            emoteHash: fallbackHash,
            emoteName
          }, resolve);
        });
        if (response?.success) handleRemoveSuccess(emoteName, targetEl);
        else showToast(response?.error || `failed to remove: ${emoteName}`);
      } catch (e) {
        showToast(`error removing: ${emoteName}`);
      }
      return;
    }
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'remove_from_inventory',
          emoteHash: hash,
          emoteName
        }, resolve);
      });
      if (response?.success) handleRemoveSuccess(emoteName, targetEl);
      else showToast(response?.error || `failed to remove: ${emoteName}`);
    } catch (e) {
      showToast(`error removing: ${emoteName}`);
    }
  }

  function handleRemoveSuccess(emoteName, targetEl) {
    inventoryEmotes.delete(emoteName);
    inventoryHashes.delete(emoteName);
    const cachedEmote = lookupEmote(emoteName);
    if (cachedEmote) {
      cachedEmote.state = ['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(cachedEmote.source) ? 'global' : 'unadded';
    }
    // Update all wrappers in DOM
    const newState = cachedEmote?.state || 'unadded';
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
    });
    showToast(`removed: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-remove');
  }

  function blockAllEmotesInStack(stack) {
    const wrappers = stack.querySelectorAll('.hs-mc-emote-wrapper');
    let count = 0;
    wrappers.forEach(w => {
      const name = w.dataset.emoteName;
      if (name && w.dataset.state !== 'blocked') {
        blockEmote(name);
        count++;
      }
    });
    if (count > 0) showToast(`blocked ${count} emotes`);
    stack.classList.remove('expanded');
    stack.setAttribute('title', 'expand');
  }

  function blockEmote(emoteName) {
    if (!emoteName) return;

    // Update local name-based tracking
    blockedEmoteNames.add(emoteName);

    // Get hash for API - prefer known hash, fallback to URL-derived
    const hash = emoteHashes.get(emoteName) ||
      (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
    blockedEmoteHashes.add(hash);

    // Sync to heatsync.org API via background.js (it handles storage)
    syncBlockToAPI(emoteName, true);

    // Instant DOM update - CSS visibility:hidden hides the img, no src swap needed
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded');
      w.classList.add('hs-state-blocked');
      w.dataset.state = 'blocked';
      const img = w.querySelector('img');
      if (img) {
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded');
        img.classList.add('hs-emote-blocked');
        img.dataset.state = 'blocked';
      }
    });

    showToast(`blocked: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-block');
  }

  function unblockEmote(emoteName) {
    if (!emoteName) return;

    // Update local tracking
    blockedEmoteNames.delete(emoteName);
    const hash = emoteHashes.get(emoteName) ||
      (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
    blockedEmoteHashes.delete(hash);

    // Sync to heatsync.org API via background.js
    syncBlockToAPI(emoteName, false);

    // Instant DOM update - restore images
    const emote = lookupEmote(emoteName);
    const realUrl = emote?.url || '';
    const newState = emote ? getEmoteState(emoteName, emote.source) : 'global';
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
      w.style.outline = '';
      const img = w.querySelector('img');
      if (img && realUrl) {
        img.src = realUrl;
        img.style.width = '';
        img.style.height = '';
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-blocked', 'hs-emote-unadded');
        img.classList.add(`hs-emote-${newState}`);
        img.dataset.state = newState;
      }
    });

    showToast(`unblocked: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-unblock');
  }

  // Add emote to inventory (click-to-add for unadded emotes)
  async function addEmoteToInventory(emoteName, emoteUrl, emoteSource, targetEl) {
    if (!emoteName) return;

    try {
      // Generate a hash from the URL for the API
      const emoteHash = emoteUrl ? btoa(emoteUrl).slice(0, 32) : emoteName;

      // Send to background script for API call with auth
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'add_to_inventory',
          emoteName: emoteName,
          emoteHash: emoteHash,
          emoteUrl: emoteUrl
        }, resolve);
      });

      if (response?.success) {
        // Update local cache - change from unadded to owned
        inventoryEmotes.add(emoteName);
        if (response.hash) inventoryHashes.set(emoteName, response.hash);
        if (emoteCache.has(emoteName)) {
          const emote = emoteCache.get(emoteName);
          emote.state = 'owned';
          emoteCache.set(emoteName, emote);
        }

        // Update all wrappers in DOM (no full re-render)
        queryEmoteWrappers(emoteName).forEach(w => {
          w.classList.remove('hs-state-global', 'hs-state-unadded', 'hs-state-blocked');
          w.classList.add('hs-state-owned');
          w.dataset.state = 'owned';
        });

        showToast(`added: ${emoteName}`);
        flashAllEmotes(emoteName, 'hs-flash-add');
      } else {
        showToast(response?.error || `failed to add: ${emoteName}`);
      }
    } catch (e) {
      log('Add emote error:', e);
      showToast(`error adding: ${emoteName}`);
    }
  }

  // Sync block/unblock to heatsync.org API via background script
  async function syncBlockToAPI(emoteName, block) {
    try {
      // Background script expects message.hash - use emoteHashes (most complete mapping)
      const hash = emoteHashes.get(emoteName) ||
        (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
      chrome.runtime.sendMessage({
        type: block ? 'block_emote' : 'unblock_emote',
        hash: hash,
        emoteName: emoteName
      });
      log('Synced', block ? 'block' : 'unblock', emoteName, '(hash:', hash.substring(0, 8) + '...) to API');
    } catch (e) {
      log('API sync error:', e);
    }
  }

  // Emote cache (loaded from storage)
  // Format: Map<name, {url, source, state}>
  // States: 'owned' (in inventory), 'global' (third-party), 'unadded' (heatsync, not owned)
  let emoteCache = new Map(); // Global + inventory emotes (no channel emotes!)
  let channelEmoteCaches = {}; // Per-channel emotes: { channelName: Map<name, emoteData> }
  let inventoryEmotes = new Set(); // Names of emotes in user's inventory

  // Look up emote from global cache + current channel cache
  function lookupEmote(name) {
    return emoteCache.get(name) || channelEmoteCaches[currentTab]?.get(name) || channelEmoteCaches[getLiveChannel()]?.get(name) || channelEmoteCaches[getCurrentChannel()]?.get(name);
  }
  let inventoryHashes = new Map(); // name → hash for remove_from_inventory
  let emoteHashes = new Map(); // name → hash for ALL emotes (block/unblock API)
  let hashToName = new Map(); // hash → name (reverse lookup for loading blocked from storage)

  // Detect emote source from URL
  function detectEmoteSource(url, hint = null) {
    if (!url) return hint || 'unknown';
    if (url.includes('cdn.7tv.app')) return '7tv';
    if (url.includes('cdn.betterttv.net')) return 'bttv';
    if (url.includes('cdn.frankerfacez.com')) return 'ffz';
    if (url.includes('static-cdn.jtvnw.net')) return 'twitch';
    if (url.includes('kick.com') || url.includes('kick-static')) return 'kick';
    if (url.includes('heatsync.org')) return 'heatsync';
    return hint || 'unknown';
  }

  // Determine emote state: owned > global > unadded
  function getEmoteState(name, source) {
    if (inventoryEmotes.has(name)) return 'owned';
    // Third-party emotes are always "global" (can't add to heatsync inventory)
    if (['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(source)) return 'global';
    // Heatsync emotes not in inventory are "unadded"
    return 'unadded';
  }

  async function loadEmotes() {
    try {
      const stored = await chrome.storage.local.get(['global_emotes', 'emote_inventory', 'channel_emotes_map', 'native_twitch_emotes']);
      emoteCache.clear();
      channelEmoteCaches = {};
      inventoryEmotes.clear();
      inventoryHashes.clear();
      emoteHashes.clear();
      hashToName.clear();

      // Helper to register hash<->name mapping
      const registerHash = (name, hash) => {
        if (name && hash) {
          emoteHashes.set(name, hash);
          hashToName.set(hash, name);
        }
      };

      // First, build inventory set (emotes user owns)
      (stored.emote_inventory || []).forEach(e => {
        if (e.name) {
          inventoryEmotes.add(e.name);
          if (e.hash) {
            inventoryHashes.set(e.name, e.hash);
            registerHash(e.name, e.hash);
          }
        }
      });

      // Add global emotes (heatsync globals - may or may not be in inventory)
      (stored.global_emotes || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || detectEmoteSource(e.url, 'heatsync');
          const state = getEmoteState(e.name, source);
          emoteCache.set(e.name, { url: e.url, source, state, zeroWidth: !!e.zeroWidth });
          if (e.hash) registerHash(e.name, e.hash);
        }
      });

      // Add inventory emotes (definitely owned)
      (stored.emote_inventory || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || 'heatsync';
          emoteCache.set(e.name, { url: e.url, source, state: 'owned', zeroWidth: !!e.zeroWidth });
        }
      });

      // Load per-channel emotes into separate caches (prevents cross-channel leaking)
      const map = stored.channel_emotes_map || {};
      log('loadEmotes channel_emotes_map:', Object.entries(map).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : v}`).join(', ') || '(empty)');
      for (const [ch, emotes] of Object.entries(map)) {
        if (!Array.isArray(emotes)) continue; // skip 'loading' sentinels
        const chCache = new Map();
        emotes.forEach(e => {
          if (e.name && e.url) {
            const source = e.source || detectEmoteSource(e.url, '7tv');
            chCache.set(e.name, { url: e.url, source, state: 'channel', zeroWidth: !!e.zeroWidth });
            if (e.hash) registerHash(e.name, e.hash);
          }
        });
        channelEmoteCaches[ch] = chCache;
        log('channel emote cache for', ch, ':', chCache.size, 'emotes, sample:', Array.from(chCache.keys()).slice(0, 5).join(', '));
      }
      // Evict oldest channel emote caches if exceeds 20
      const channelKeys = Object.keys(channelEmoteCaches);
      if (channelKeys.length > 20) {
        for (const old of channelKeys.slice(0, channelKeys.length - 20)) {
          delete channelEmoteCaches[old];
        }
      }
      log('Channel emote caches:', Object.entries(channelEmoteCaches).map(([c, m]) => `${c}: ${m.size}`).join(', '));

      // Native Twitch emotes (sub emotes) — available in ALL channels
      (stored.native_twitch_emotes || []).forEach(e => {
        if (e.name && e.url && !emoteCache.has(e.name)) {
          emoteCache.set(e.name, { url: e.url, source: 'twitch', state: 'global' });
          if (e.hash) registerHash(e.name, e.hash);
        }
      });

      // Rebuild blockedEmoteNames from loaded hashes
      rebuildBlockedNames();

      log('Loaded', emoteCache.size, 'emotes (inventory:', inventoryEmotes.size, ', hashes:', emoteHashes.size, ')');
    } catch (e) {
      log('Error loading emotes:', e);
    }

    // Also scan DOM for third-party emotes (BTTV, FFZ, 7TV)
    scanDomForEmotes();
  }

  // Scan DOM for emotes rendered in chat — route to the current channel's cache, not global
  function scanDomForEmotes() {
    const ch = getCurrentChannel();
    if (!ch) return;

    // Ensure channel cache exists
    if (!channelEmoteCaches[ch]) channelEmoteCaches[ch] = new Map();
    // Evict oldest if exceeds 20
    const chKeys = Object.keys(channelEmoteCaches);
    if (chKeys.length > 20) {
      delete channelEmoteCaches[chKeys[0]];
    }
    const cache = channelEmoteCaches[ch];

    // Cap per-channel to prevent unbounded growth
    if (cache.size >= 5000) return;

    // Single combined selector — one DOM scan instead of 7 separate querySelectorAll calls
    const combinedSelector = '.chat-line__message img[alt], [class*="chat-line"] img[alt], .seventv-emote, .bttv-emote, .ffz-emote, img.emote, img[data-a-target="emote-name"]';

    let found = 0;
    for (const img of document.querySelectorAll(combinedSelector)) {
      if (cache.size >= 5000) break;
      const name = img.alt || img.getAttribute('data-emote-name');
      const url = img.src;
      if (name && url && !cache.has(name) && !emoteCache.has(name)) {
        const source = detectEmoteSource(url);
        cache.set(name, { url, source, state: 'channel', zeroWidth: false });
        found++;
      }
    }

    if (found > 0) {
      log('Scanned', found, 'emotes from DOM ->', ch, ', total:', cache.size);
    }
  }

  // Periodically scan for new emotes
  cleanup.setInterval(scanDomForEmotes, 10000, 'emote-scan');

  // Process text and replace emote codes with images
  // Supports 7TV zero-width (overlay) emotes that stack on base emotes
  function processEmotes(text, channel) {
    if (emoteCache.size === 0 && !channelEmoteCaches[channel]) return escapeHtml(text);

    // Split adjacent Kick emotes and text touching emotes (e.g. "word[emote:id:name]")
    const words = text.replace(/\]\[emote:/g, '] [emote:').replace(/([^\s\[])\[emote:/g, '$1 [emote:').replace(/\]([^\s\]])/g, '] $1').split(/(\s+)/);
    const result = [];
    let pendingStack = null; // { base: html, overlays: [html...] }
    let pendingWhitespace = ''; // Accumulate whitespace - don't flush stack on spaces

    for (const word of words) {
      // Whitespace - accumulate, don't flush yet (overlays are space-separated)
      if (/^\s+$/.test(word)) {
        pendingWhitespace += word;
        continue;
      }

      // Kick emote format: [emote:ID:NAME] -> render as image from Kick CDN
      const kickEmoteMatch = word.match(/^\[emote:(\d+):([^\]]+)\]$/)
      if (kickEmoteMatch) {
        const [, emoteId, emoteName] = kickEmoteMatch
        const kickUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`
        const safeUrl = escapeHtml(kickUrl)
        const safeName = escapeHtml(emoteName)
        // Cross-reference caches to find real provider (7tv/bttv/ffz), fall back to kick
        const cached = emoteCache.get(emoteName) || (channel && channelEmoteCaches[channel]?.get(emoteName))
        const provider = cached?.source || 'kick'
        const imgHtml = `<span class="hs-mc-emote-wrapper hs-state-channel" data-emote-name="${safeName}" data-emote-url="${safeUrl}" data-state="channel" data-source="${escapeHtml(provider)}"><img src="${safeUrl}" alt="${safeName}" title="${safeName} (${escapeHtml(provider)} via kick)" class="hs-mc-emote hs-emote-channel" data-emote-name="${safeName}" data-state="channel" data-source="${escapeHtml(provider)}"></span>`
        if (pendingStack) {
          result.push(renderEmoteStack(pendingStack))
        }
        if (pendingWhitespace) {
          result.push(pendingWhitespace)
          pendingWhitespace = ''
        }
        pendingStack = { base: imgHtml, overlays: [] }
        continue
      }

      // Try name0 overlay convention: "fire0" -> look up "fire" as overlay
      let emote = null
      let isOverlayEmote = false
      const endsWithZero = word.endsWith('0') && word.length > 1
      if (endsWithZero) {
        const baseName = word.slice(0, -1)
        emote = emoteCache.get(baseName) || (channel && channelEmoteCaches[channel]?.get(baseName))
        if (emote) isOverlayEmote = true
      }
      if (!emote) {
        emote = emoteCache.get(word) || (channel && channelEmoteCaches[channel]?.get(word))
        if (emote) isOverlayEmote = !!emote.zeroWidth
      }
      if (emote) {
        const isBlocked = blockedEmoteNames.has(word);
        const state = isBlocked ? 'blocked' : (emote.state || 'global');
        const source = escapeHtml(emote.source || 'unknown');
        const imgSrc = escapeHtml(getChatResUrl(emote.url)); // Upgrade to 2x/4x based on emote size setting
        const safeHash = emote.hash ? escapeHtml(emote.hash) : '';
        const displayName = escapeHtml(endsWithZero && isOverlayEmote ? word : word)
        const imgHtml = `<span class="hs-mc-emote-wrapper hs-state-${state}" data-emote-name="${displayName}" data-emote-url="${imgSrc}" data-state="${state}" data-source="${source}"${safeHash ? ` data-emote-hash="${safeHash}"` : ''}><img src="${imgSrc}" alt="${displayName}" title="${displayName}" class="hs-mc-emote hs-emote-${state}" data-emote-name="${displayName}" data-state="${state}" data-source="${source}"></span>`;

        if (isOverlayEmote) {
          // Overlay emote - stack on previous base (discard whitespace between)
          log('FOUND zeroWidth emote:', word, '| hasBase:', !!pendingStack);
          if (pendingStack) {
            pendingStack.overlays.push(imgHtml);
            pendingWhitespace = '';
          } else {
            // No base to stack on - render standalone
            if (pendingWhitespace) {
              result.push(pendingWhitespace);
              pendingWhitespace = '';
            }
            result.push(imgHtml);
          }
        } else {
          // Base emote - flush previous stack, start new one
          if (pendingStack) {
            result.push(renderEmoteStack(pendingStack));
          }
          if (pendingWhitespace) {
            result.push(pendingWhitespace);
            pendingWhitespace = '';
          }
          pendingStack = { base: imgHtml, overlays: [] };
        }
      } else {
        // Check for emoji :shortcode: — treat as stackable base
        if (typeof EMOJI_BY_NAME !== 'undefined' && word.startsWith(':') && word.endsWith(':') && word.length > 2) {
          const emojiName = word.slice(1, -1)
          const emojiEntry = EMOJI_BY_NAME.get(emojiName)
          if (emojiEntry) {
            if (pendingStack) {
              result.push(renderEmoteStack(pendingStack))
            }
            if (pendingWhitespace) {
              result.push(pendingWhitespace)
              pendingWhitespace = ''
            }
            const emojiHtml = `<span class="hs-mc-emoji" title=":${escapeHtml(emojiName)}:">${emojiEntry.emoji}</span>`
            pendingStack = { base: emojiHtml, overlays: [] }
            continue
          }
        }
        // Check for Unicode emoji — treat as stackable base
        if (UNICODE_EMOJI_RE.test(word)) {
          if (pendingStack) {
            result.push(renderEmoteStack(pendingStack))
          }
          if (pendingWhitespace) {
            result.push(pendingWhitespace)
            pendingWhitespace = ''
          }
          const emojiHtml = `<span class="hs-mc-emoji">${escapeHtml(word)}</span>`
          pendingStack = { base: emojiHtml, overlays: [] }
          continue
        }
        // Text - flush stack and add text
        if (pendingStack) {
          result.push(renderEmoteStack(pendingStack));
          pendingStack = null;
        }
        if (pendingWhitespace) {
          result.push(pendingWhitespace);
          pendingWhitespace = '';
        }
        // Color @mentions — always hoverable for profile cards
        if (word.startsWith('@') && word.length > 1) {
          const name = word.slice(1).replace(/[,.:!?]+$/, '').toLowerCase();
          const color = knownColors.get(name) || '#dedede';
          result.push(`<a href="https://heatsync.org/user/${encodeURIComponent(name)}" target="_blank" class="hs-mc-user" data-username="${escapeHtml(name)}" style="color:${sanitizeColor(color)};font-weight:bold">${escapeHtml(word)}</a>`);
        } else if (linksEnabled && /^(https?:\/\/\S+|[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*)/i.test(word)) {
          // Validate URL protocol before creating link (block javascript:, data:, etc.)
          const hasProtocol = /^https?:\/\//i.test(word);
          const fullUrl = hasProtocol ? word : `https://${word}`;
          if (/^https?:\/\//i.test(fullUrl)) {
            const safeUrl = escapeHtml(word);
            const safeHref = escapeHtml(fullUrl);
            result.push(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="hs-mc-link">${safeUrl}</a>`);
          } else {
            result.push(escapeHtml(word));
          }
        } else {
          result.push(escapeHtml(word));
        }
      }
    }

    // Flush any remaining stack
    if (pendingStack) {
      result.push(renderEmoteStack(pendingStack));
    }
    if (pendingWhitespace) {
      result.push(pendingWhitespace);
    }

    return result.join('');
  }

  // Render an emote stack (base + overlays)
  function renderEmoteStack(stack) {
    if (stack.overlays.length === 0) {
      return stack.base;
    }
    const overlayHtml = stack.overlays.map(o =>
      o.replace('class="hs-mc-emote ', 'class="hs-mc-emote hs-mc-overlay-emote ')
    ).join('');
    const count = stack.overlays.length + 1;
    return `<span class="hs-mc-emote-stack" data-stack-count="${count}" title="expand"><span class="hs-mc-emote-stack-emotes">${stack.base}${overlayHtml}</span><span class="hs-mc-stack-collapse" title="collapse">\u00d7</span><span class="hs-mc-stack-block-all" title="block all">\u2298</span></span>`;
  }


// --- multichat/tooltips.js ---
// Tooltips - toast, emote tooltip, user profile card, link preview
// Note: all innerHTML usage passes content through escapeHtml() first (see src/lib/utils.js)

  function showToast(msg) {
    const existing = document.getElementById('hs-mc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'hs-mc-toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 20px;
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      padding: 6px 14px;
      border-radius: 0;
      font: bold 12px monospace;
      z-index: 5000;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
  }

  // Emote hover tooltip (4x preview with source color)
  let emoteTooltip = null;

  function ensureEmoteTooltip() {
    if (!emoteTooltip || !document.contains(emoteTooltip)) {
      emoteTooltip = document.createElement('div');
      emoteTooltip.id = 'hs-emote-tooltip';
      emoteTooltip.innerHTML = `
        <img src="" alt="">
        <span class="tooltip-name"></span>
        <span class="tooltip-source"></span>
      `;
      document.body.appendChild(emoteTooltip);
    }
    return emoteTooltip;
  }

  function showEmoteTooltip(e, emoteName, emoteUrl, state, source, hoveredImg) {
    const tooltip = ensureEmoteTooltip();
    const img = tooltip.querySelector('img');
    const nameEl = tooltip.querySelector('.tooltip-name');
    const stateEl = tooltip.querySelector('.tooltip-source');

    // Show 1x immediately (no stale image), upgrade to hi-res in background
    const w4 = (hoveredImg?.offsetWidth || 28) * 4;
    const h4 = (hoveredImg?.offsetHeight || 28) * 4;
    img.style.width = w4 + 'px';
    img.style.height = h4 + 'px';
    img.src = emoteUrl;
    img.alt = emoteName;
    // Try loading hi-res - swap in if it works, keep 1x if it fails
    const hiResUrl = getHighResUrl(emoteUrl);
    if (hiResUrl !== emoteUrl) {
      const hiRes = new Image();
      hiRes.onload = () => { if (img.alt === emoteName) img.src = hiResUrl; };
      hiRes.src = hiResUrl;
    }
    nameEl.textContent = emoteName;

    // Show state with source for globals
    let label;
    if (state === 'owned') {
      label = 'in your set';
    } else if (state === 'unadded') {
      label = 'click to add';
    } else if (state === 'blocked') {
      label = 'blocked (click to unblock)';
    } else {
      // Global or channel - show source
      const sourceLabels = {
        '7tv': '7TV',
        'bttv': 'BTTV',
        'ffz': 'FFZ',
        'twitch': 'Twitch',
        'kick': 'Kick',
        'heatsync': 'Heatsync'
      };
      const sourceName = sourceLabels[source] || source || 'unknown';
      const scope = state === 'channel' ? 'channel' : 'global';
      label = `${scope} (${sourceName})`;
    }
    stateEl.textContent = label;
    stateEl.className = 'tooltip-source ' + (state || 'global');

    // Position: anchor above the emote element
    const anchorEl = hoveredImg || e.target;
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    tooltip.classList.add('visible');
    // Double-position: first pass gets approximate, rAF gets exact after layout
    positionTooltipAtElement(tooltip, anchorEl);
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, anchorEl));
  }

  function showEmojiTooltip(targetEl, emoji, name) {
    const tooltip = ensureEmoteTooltip()
    const img = tooltip.querySelector('img')
    const nameEl = tooltip.querySelector('.tooltip-name')
    const stateEl = tooltip.querySelector('.tooltip-source')

    // Hide the image, show emoji character at 4x instead
    img.style.display = 'none'

    // Build emoji preview using safe DOM methods
    nameEl.textContent = ''
    const emojiChar = document.createElement('span')
    Object.assign(emojiChar.style, { fontSize: '64px', lineHeight: '1', fontVariantEmoji: 'emoji', display: 'block', textAlign: 'center' })
    emojiChar.textContent = emoji
    const label = document.createElement('span')
    Object.assign(label.style, { display: 'block', marginTop: '4px' })
    label.textContent = ':' + name + ':'
    nameEl.appendChild(emojiChar)
    nameEl.appendChild(label)

    stateEl.textContent = 'emoji'
    stateEl.className = 'tooltip-source'

    tooltip.style.left = '-9999px'
    tooltip.style.top = '-9999px'
    tooltip.classList.add('visible')
    positionTooltipAtElement(tooltip, targetEl)
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, targetEl))
  }

  function hideEmoteTooltip() {
    if (emoteTooltip) {
      emoteTooltip.classList.remove('visible');
      // Reset img display for next emote hover
      const img = emoteTooltip.querySelector('img')
      if (img) img.style.display = ''
    }
  }

  function setupEmoteTooltipHandlers() {
    if (window._hsEmoteTooltipSetup) return;
    window._hsEmoteTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const target = e.target;

      // Emoji hover: show 4x preview
      const emojiSpan = target.closest('.hs-mc-emoji');
      if (emojiSpan) {
        const name = emojiSpan.dataset.emojiName || emojiSpan.title?.replace(/:/g, '') || '';
        showEmojiTooltip(emojiSpan, emojiSpan.textContent, name);
        return;
      }

      // Check wrapper first, then IMG
      const wrapper = target.closest('.hs-mc-emote-wrapper');
      const img = wrapper ? wrapper.querySelector('img') : (
        target.tagName === 'IMG' && (target.classList.contains('hs-mc-emote') || target.classList.contains('hs-mc-picker-emote')) ? target : null
      );
      if (!img && !wrapper) return;

      const emoteName = wrapper?.dataset.emoteName || img?.alt || img?.dataset.emoteName || img?.title?.split(' ')[0];
      if (!emoteName) return;

      const emoteUrl = wrapper?.dataset.emoteUrl || img?.src;
      const state = wrapper?.dataset.state || img?.dataset.state || 'global';
      const source = wrapper?.dataset.source || img?.dataset.source || detectEmoteSource(emoteUrl);

      showEmoteTooltip(e, emoteName, emoteUrl, state, source, img);

      // Cross-highlight: add highlight to all wrappers with same emote name
      queryEmoteWrappers(emoteName).forEach(w => {
        w.classList.add('hs-emote-highlight');
      });
    }, 'mc-emote-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const target = e.target;
      const wrapper = target.closest('.hs-mc-emote-wrapper');
      const img = wrapper ? wrapper.querySelector('img') : (
        target.tagName === 'IMG' && (target.classList.contains('hs-mc-emote') || target.classList.contains('hs-mc-picker-emote')) ? target : null
      );
      if (!img && !wrapper) return;

      hideEmoteTooltip();

      // Remove cross-highlight from all wrappers
      const emoteName = wrapper?.dataset.emoteName || img?.alt || img?.dataset.emoteName;
      if (emoteName) {
        queryEmoteWrappers(emoteName).forEach(w => {
          w.classList.remove('hs-emote-highlight');
        });
      }
    }, 'mc-emote-tooltip-mouseout');

    let _tooltipRafPending = false
    cleanup.addEventListener(document, 'mousemove', (e) => {
      // RAF-batch tooltip position updates to avoid per-mousemove style writes
      if (_tooltipRafPending) return
      _tooltipRafPending = true
      const target = e.target
      requestAnimationFrame(() => {
        _tooltipRafPending = false
        const onEmote = target?.closest?.('.hs-mc-emote-wrapper') ||
          (target?.tagName === 'IMG' && (target.classList?.contains('hs-mc-emote') || target.classList?.contains('hs-mc-picker-emote')))
        const onUser = target?.closest?.('.hs-mc-user')

        // Kill emote tooltip instantly if not on an emote
        if (emoteTooltip?.classList.contains('visible')) {
          if (!onEmote) {
            hideEmoteTooltip()
            document.querySelectorAll('.hs-emote-highlight').forEach(w => w.classList.remove('hs-emote-highlight'))
          }
          // Don't reposition — stays anchored to element
        }

        // Kill user tooltip instantly if not on a username
        if (userTooltip?.classList.contains('visible')) {
          if (!onUser && !target?.closest?.('#hs-user-tooltip')) {
            hideUserTooltip()
          }
          // Don't reposition — stays anchored to element like website
        }

        // Kill link tooltip if not on a link
        const onLink = target?.closest?.('.hs-mc-link')
        if (linkTooltip?.classList.contains('visible')) {
          if (!onLink) {
            hideLinkTooltip()
          }
          // Don't reposition — stays anchored to element
        }
      })
    }, 'mc-tooltip-mousemove');
  }

  // Sub tenure tracking — populated from IRC badge-info (subscriber/N = cumulative months)
  const subTenureMap = new Map() // channel -> Map<usernameLC, months>
  function trackSubTenure(channel, username, months) {
    if (!channel || !username || !months) return
    let channelMap = subTenureMap.get(channel)
    if (!channelMap) {
      channelMap = new Map()
      subTenureMap.set(channel, channelMap)
    }
    channelMap.set(username.toLowerCase(), months)
    // LRU per channel
    if (channelMap.size > 500) {
      let evicted = 0
      for (const k of channelMap.keys()) {
        if (evicted >= 200) break
        channelMap.delete(k)
        evicted++
      }
    }
  }
  function formatSubTenure(months) {
    if (months >= 12) {
      const y = Math.floor(months / 12)
      const m = months % 12
      return m > 0 ? `${y}y ${m}M` : `${y}y`
    }
    return `${months}M`
  }

  // User hover tooltip (profile preview)
  let userTooltip = null;
  const _profileCache = new Map(); // username -> { profile, ts }
  const PROFILE_CACHE_TTL = 60000; // 60s
  let _profileGen = 0; // generation counter to prevent stale renders

  function ensureUserTooltip() {
    if (!userTooltip || !document.contains(userTooltip)) {
      userTooltip = document.createElement('div');
      userTooltip.id = 'hs-user-tooltip';
      document.body.appendChild(userTooltip);
    }
    return userTooltip;
  }

  function getHeatColor() {
    return '#ff8700';
  }

  function formatCompact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function getAccountAge(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const y = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    const days = now.getDate() - d.getDate();
    if (y > 0) return y + 'y';
    if (m > 0) return m + 'm';
    return Math.max(0, days) + 'd';
  }

  function getCompactRelTime(dateStr) {
    if (!dateStr) return '';
    const ms = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(ms / 86400000);
    if (d > 365) return Math.floor(d / 365) + 'y ago';
    if (d > 30) return Math.floor(d / 30) + 'mo ago';
    if (d > 0) return d + 'd ago';
    const h = Math.floor(ms / 3600000);
    if (h > 0) return h + 'h ago';
    return 'just now';
  }

  function renderProfileCard(p) {
    const pfp = p.twitch_profile_pic || p.kick_profile_pic || p.profile_image_url || 'https://heatsync.org/anon.webp';
    const displayName = p.display_name || p.username || 'unknown';

    // Platform badges
    let platforms = '';
    if (p.twitch_username) {
      let ttv = `<span class="hs-pc-platform twitch">ttv:${escapeHtml(p.twitch_username)}</span>`;
      if (p.twitch_verified) ttv += ' <span class="hs-pc-verified" title="Twitch Verified"><svg viewBox="0 0 16 16" fill="none" width="12" height="12" style="vertical-align:middle"><path d="M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z" fill="#9146ff"/><path d="M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z" fill="#fff"/></svg></span>';
      if (p.twitch_is_live) {
        const vc = p.twitch_viewer_count || 0;
        ttv += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + formatCompact(vc) : ''}</span>`;
      }
      platforms += ttv;
    }
    if (p.kick_username) {
      let kk = `<span class="hs-pc-platform kick">kick:${escapeHtml(p.kick_username)}</span>`;
      if (p.kick_verified) kk += ' <span class="hs-pc-verified" title="Kick Verified"><svg viewBox="0 0 16 16" fill="none" width="12" height="12" style="vertical-align:middle"><path d="M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z" fill="#53fc18"/><path d="M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z" fill="#000"/></svg></span>';
      if (p.kick_is_live) {
        const vc = p.kick_viewer_count || 0;
        kk += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + formatCompact(vc) : ''}</span>`;
      }
      platforms += kk;
    }
    if (!platforms) {
      platforms = `<span class="hs-pc-name">${escapeHtml(displayName)}</span>`;
    }

    // Role badge
    let role = '';
    const bt = p.twitch_broadcaster_type;
    if (bt === 'partner') role = '<span class="hs-pc-role partner">partner</span>';
    else if (bt === 'affiliate') role = '<span class="hs-pc-role affiliate">affiliate</span>';
    else if (p.role === 'admin') role = '<span class="hs-pc-role admin">admin</span>';
    else if (p.role === 'staff') role = '<span class="hs-pc-role staff">staff</span>';

    // Account age
    const dates = [p.twitch_created_at, p.kick_created_at].filter(Boolean);
    const oldest = dates.length ? dates.reduce((a, b) => new Date(b) < new Date(a) ? b : a) : null;
    const age = getAccountAge(oldest);
    const ageHtml = age ? `<span class="hs-pc-age">${age}</span>` : '';

    // Bio
    const bio = p.bio ? `<div class="hs-pc-bio">${escapeHtml(p.bio)}</div>` : '';

    // Stats
    const stats = p.stats || {};
    const heat = stats.total_heat || 0;
    const op = stats.op_count || p.opCount || 0;
    const mop = stats.mop_count || p.mopCount || 0;
    const re = stats.re_count || p.reCount || 0;
    const followers = Math.max(stats.followers || 0, p.twitch_followers || 0, p.kick_followers || 0);

    const statBadges = [];
    const hd = getHeatDisplay(heat)
    const heatColor = hd ? hd.color : '#808080'
    const heatEmoji = hd?.emoji || ''
    const heatGlow = hd?.glow ? ';text-shadow:0 0 6px rgba(255,135,0,0.8)' : ''
    statBadges.push(`<span class="hs-pc-stat heat" style="color:${heatColor};border-color:${heatColor};font-weight:700${heatGlow}">${heatEmoji}<span class="hs-pc-num">${formatCompact(heat)}</span>°</span>`);
    if (op > 0) statBadges.push(`<span class="hs-pc-stat op"><span class="hs-pc-num">${formatCompact(op)}</span> [OP]</span>`);
    if (mop > 0) statBadges.push(`<span class="hs-pc-stat mop"><span class="hs-pc-num">${formatCompact(mop)}</span> <span style="color:#ff00ff">[OP]</span></span>`);
    if (re > 0) statBadges.push(`<span class="hs-pc-stat re"><span class="hs-pc-num">${formatCompact(re)}</span> [RE]</span>`);
    if (followers > 0) statBadges.push(`<span class="hs-pc-stat hs-pc-stat-followers">${formatCompact(followers)} followers</span>`);

    // Relationship
    const rel = p.relationship || {};
    const relBadges = [];
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick || rel.followsYou;
    if (followsYou) {
      const since = rel.profileFollowsViewerOnTwitchSince || rel.followsYouSince;
      relBadges.push(`<span class="hs-pc-rel-badge mutual">follows you${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    if (rel.profileSubbedToViewerOnTwitch || rel.subscribesToYou) {
      const since = rel.profileTwitchSubSince || rel.subscribesToYouSince;
      relBadges.push(`<span class="hs-pc-rel-badge supporter">subs to you${since ? ' ' + getCompactRelTime(since) : ''}</span>`);
    }
    // Viewer follows profile
    if (rel.isFollowing || rel.followsOnTwitch) {
      const since = rel.followsOnTwitchSince || rel.followedAt;
      relBadges.push(`<span class="hs-pc-rel-badge following">following${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    // Viewer subbed to profile
    if (rel.isSubscribed || rel.subscribedOnTwitch) {
      const tier = rel.twitchSubTier || rel.subTier || 1;
      const since = rel.twitchSubSince || rel.subscribedAt;
      relBadges.push(`<span class="hs-pc-rel-badge subbed">you sub${tier > 1 ? ' T' + tier : ''}${since ? ' ' + getCompactRelTime(since) : ''}</span>`);
    }

    return `
      ${pfp ? `<img class="hs-pc-avatar" src="${escapeHtml(pfp)}" alt="${escapeHtml(displayName)}">` : ''}
      <div class="hs-pc-info">
        <div class="hs-pc-header">${platforms} ${role} ${ageHtml}</div>
        ${bio}
        ${statBadges.length ? `<div class="hs-pc-stats">${statBadges.join('')}</div>` : ''}
        ${relBadges.length ? `<div class="hs-pc-rel">${relBadges.join(' ')}</div>` : ''}
      </div>`;
  }

  // Determine Twitch channel context for followage lookups
  function getTooltipChannelContext() {
    if (!location.hostname.includes('twitch.tv')) return null
    // Live tab → current channel from URL or override
    if (currentTab === 'live') return getLiveChannel()
    // Channel tab → look up twitch name from config
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
    if (ch) return typeof ch === 'string' ? ch : ch.twitch
    return getLiveChannel()
  }

  // NOTE: innerHTML usage is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
  // (escapeHtml converts &, <, >, ", ' to HTML entities before any innerHTML assignment)
  async function showUserTooltip(targetEl, username, color) {
    const tooltip = ensureUserTooltip();
    const gen = ++_profileGen;

    // Get channel from the message element for sub tenure lookup
    const msgChannel = targetEl.closest?.('.hs-mc-msg')?.dataset?.msgChannel

    // Show loading state immediately (username is escaped via escapeHtml)
    tooltip.innerHTML = `<div class="hs-pc-loading" style="color:${color || '#fff'}">${escapeHtml(username)}...</div>`;
    tooltip.classList.add('visible');
    positionTooltipAtElement(tooltip, targetEl);

    // Check cache
    const cached = _profileCache.get(username.toLowerCase());
    if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
      if (gen !== _profileGen) return;
      // NOTE: innerHTML is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
      tooltip.innerHTML = renderProfileCard(cached.profile);
      appendSubTenureBadge(tooltip, username, msgChannel);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen);
      return;
    }

    // Fetch profile
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}`);
    if (gen !== _profileGen) return; // user moved away

    if (resp?.ok && resp.data?.profile) {
      const profile = resp.data.profile;
      _profileCache.set(username.toLowerCase(), { profile, ts: Date.now() });
      // Prune cache
      if (_profileCache.size > 100) {
        const oldest = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) _profileCache.delete(k);
      }
      // NOTE: innerHTML is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
      tooltip.innerHTML = renderProfileCard(profile);
      appendSubTenureBadge(tooltip, username, msgChannel);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen);
    } else {
      // Fallback — show basic info (username sanitized via escapeHtml)
      tooltip.innerHTML = `<div class="hs-pc-info"><div class="hs-pc-header"><span class="hs-pc-name">${escapeHtml(username)}</span></div></div>`;
      appendSubTenureBadge(tooltip, username, msgChannel);
      fetchAndShowFollowage(tooltip, username, gen);
    }
  }

  // Append sub tenure badge from local IRC data (sync, no fetch)
  function appendSubTenureBadge(tooltip, username, msgChannel) {
    // Try message's channel first, fall back to tooltip channel context
    const channelLogin = msgChannel || getTooltipChannelContext()
    if (!channelLogin) return
    const channelMap = subTenureMap.get(channelLogin)
    if (!channelMap) return
    const months = channelMap.get(username.toLowerCase())
    if (!months) return
    const header = tooltip.querySelector('.hs-pc-header')
    if (!header) return
    const badge = document.createElement('span')
    badge.className = 'hs-pc-sub-tenure'
    badge.textContent = 'subbed ' + channelLogin + ' ' + formatSubTenure(months)
    header.appendChild(badge)
  }

  // Async followage fetch — appends to tooltip after profile renders (DOM methods, no innerHTML)
  async function fetchAndShowFollowage(tooltip, username, gen) {
    const channelLogin = getTooltipChannelContext()
    if (!channelLogin) return
    if (typeof lookupFollowage !== 'function') return
    const result = await lookupFollowage(username, channelLogin)
    if (gen !== _profileGen || !result) return
    const header = tooltip.querySelector('.hs-pc-header')
    if (!header) return
    // Followage badge
    const existing = header.querySelector('.hs-pc-followage')
    if (existing) existing.remove()
    const badge = document.createElement('span')
    if (result.followedAt) {
      badge.className = 'hs-pc-followage'
      badge.textContent = 'following ' + channelLogin + ' ' + getCompactRelTime(result.followedAt).replace(' ago', '')
    } else {
      badge.className = 'hs-pc-followage hs-pc-nofollow'
      badge.textContent = 'not following ' + channelLogin
    }
    header.appendChild(badge)
    // "followed by {channel}" badge — streamer follows this user
    if (result.channelFollowedAt) {
      const cfBadge = document.createElement('span')
      cfBadge.className = 'hs-pc-channel-follows'
      cfBadge.textContent = 'followed by ' + channelLogin
      header.appendChild(cfBadge)
    }
    // Update follower count from live data
    const statsEl = tooltip.querySelector('.hs-pc-stats')
    if (statsEl && result.followerCount != null) {
      // Update followers with live data
      const followerStat = statsEl.querySelector('.hs-pc-stat-followers')
      if (followerStat) {
        followerStat.textContent = formatCompact(result.followerCount) + ' followers'
      } else {
        const el = document.createElement('span')
        el.className = 'hs-pc-stat hs-pc-stat-followers'
        el.textContent = formatCompact(result.followerCount) + ' followers'
        statsEl.appendChild(el)
      }
    }
  }

  function positionTooltipAtElement(tooltip, targetEl) {
    // Anchor to element like website hover cards — centered above
    const elRect = targetEl.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();

    // Position directly above if room, otherwise below (no gap, like website)
    let y;
    if (elRect.top - tipRect.height > 0) {
      y = elRect.top - tipRect.height;
    } else {
      y = elRect.bottom;
    }

    // Center horizontally over element, clamp to viewport
    let x = elRect.left + (elRect.width / 2) - (tipRect.width / 2);
    x = Math.min(x, window.innerWidth - tipRect.width - 10);

    tooltip.style.left = Math.max(5, x) + 'px';
    tooltip.style.top = Math.max(5, y) + 'px';
  }

  function hideUserTooltip() {
    _profileGen++;
    if (userTooltip) {
      userTooltip.classList.remove('visible');
    }
  }

  function setupUserTooltipHandlers() {
    if (window._hsUserTooltipSetup) return;
    window._hsUserTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const target = e.target.closest('.hs-mc-user');
      if (target) {
        const username = target.dataset.username || target.textContent.replace(/^@/, '');
        const color = target.style.color;
        showUserTooltip(target, username, color);

        // Highlight all matching usernames
        const name = target.dataset.username;
        if (name) {
          const overlay = document.getElementById('hs-mc-overlay');
          if (overlay) {
            overlay.querySelectorAll(`.hs-mc-user[data-username="${CSS.escape(name)}"]`).forEach(el => {
              el.classList.add('hs-user-highlight');
            });
          }
        }
      }
    }, 'mc-user-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const target = e.target.closest('.hs-mc-user');
      if (target) {
        hideUserTooltip();

        // Remove all username highlights
        const overlay = document.getElementById('hs-mc-overlay');
        if (overlay) {
          overlay.querySelectorAll('.hs-user-highlight').forEach(el => {
            el.classList.remove('hs-user-highlight');
          });
        }
      }
    }, 'mc-user-tooltip-mouseout');
  }

  // Link preview tooltip (Chatterino-style)
  let linkTooltip = null;
  const _linkPreviewCache = new Map(); // url -> { title, description, image } | null
  let _linkHoverUrl = null;

  function ensureLinkTooltip() {
    if (linkTooltip) return linkTooltip;
    linkTooltip = document.createElement('div');
    linkTooltip.id = 'hs-link-tooltip';
    document.body.appendChild(linkTooltip);
    return linkTooltip;
  }

  let _linkTargetEl = null;

  function showLinkTooltip(e, url) {
    if (!linksEnabled || !url) return;
    _linkHoverUrl = url;
    _linkTargetEl = e.target.closest('.hs-mc-link') || e.target;
    const tip = ensureLinkTooltip();
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    // Show loading state immediately
    const loadWrap = document.createElement('div');
    loadWrap.className = 'link-text';
    const loadSpan = document.createElement('span');
    loadSpan.className = 'link-loading';
    loadSpan.textContent = 'loading...';
    const domainSpan = document.createElement('span');
    domainSpan.className = 'link-domain';
    domainSpan.textContent = hostname;
    loadWrap.appendChild(loadSpan);
    loadWrap.appendChild(domainSpan);
    tip.replaceChildren(loadWrap);
    tip.classList.add('visible');
    positionTooltipAtElement(tip, _linkTargetEl);

    // Check cache
    if (_linkPreviewCache.has(url)) {
      const cached = _linkPreviewCache.get(url);
      if (_linkHoverUrl === url) renderLinkPreview(tip, cached, url);
      return;
    }

    // Fetch from background
    safeSendMessage({ type: 'fetch_link_preview', url }).then(data => {
      _linkPreviewCache.set(url, data);
      if (_linkHoverUrl === url && tip.classList.contains('visible')) {
        renderLinkPreview(tip, data, url);
      }
    });
  }

  function renderLinkPreview(tip, data, url) {
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { hostname = url; }
    tip.replaceChildren(); // clear
    let hasContent = false;
    const textWrap = document.createElement('div');
    textWrap.className = 'link-text';
    if (data) {
      if (data.image && /^https?:\/\//i.test(data.image)) {
        const img = document.createElement('img');
        img.src = data.image;
        img.alt = '';
        img.loading = 'lazy';
        tip.appendChild(img);
        hasContent = true;
      }
      if (data.title) {
        const t = document.createElement('span');
        t.className = 'link-title';
        t.textContent = data.title;
        textWrap.appendChild(t);
        hasContent = true;
      }
      if (data.description) {
        const d = document.createElement('span');
        d.className = 'link-desc';
        d.textContent = data.description;
        textWrap.appendChild(d);
        hasContent = true;
      }
    }
    // If no og data at all, show full URL instead of just domain
    const dom = document.createElement('span');
    dom.className = 'link-domain';
    dom.textContent = hasContent ? hostname : url;
    textWrap.appendChild(dom);
    tip.appendChild(textWrap);
    // Reposition after content changed size
    if (_linkTargetEl) positionTooltipAtElement(tip, _linkTargetEl);
  }

  function hideLinkTooltip() {
    _linkHoverUrl = null;
    if (linkTooltip) linkTooltip.classList.remove('visible');
  }

  function setupLinkTooltipHandlers() {
    if (window._hsLinkTooltipSetup) return;
    window._hsLinkTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const link = e.target.closest('.hs-mc-link');
      if (link) showLinkTooltip(e, link.href);
    }, 'mc-link-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const link = e.target.closest('.hs-mc-link');
      if (link) hideLinkTooltip();
    }, 'mc-link-tooltip-mouseout');
  }


// --- multichat/twitch-api.js ---
// Twitch API - GQL proxy, badges, predictions, rewards, polls, Twitch tab UI

// ═══ Predictions & Betting ═══

function formatPoints(n) {
  if (n == null) return '?'
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(n)
}

function renderQuickLinks() {
  const links = document.createElement('div')
  links.className = 'hs-mc-pred-links'

  const items = [
    { action: 'clip', accent: '#bf94ff', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M18 7h-2V5a2 2 0 00-2-2H6a2 2 0 00-2 2v2H2v4l8 6 8-6V7zM6 5h8v2H6V5z"/></svg>', label: 'create clip' },
    { action: 'popout', accent: '#4a90d9', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M4 4h6v2H6v8h8v-4h2v6H4V4zm8 0h4v4h-2V6.41l-4.3 4.3-1.4-1.42L12.58 6H11V4z"></path></svg>', label: 'popout chat' },
    { action: 'mod', accent: '#00c8af', icon: '<svg width="16" height="16" viewBox="0 0 20 20"><path fill="currentColor" d="M10 2l6 2.7V9c0 4.4-2.5 8.3-6 10-3.5-1.7-6-5.6-6-10V4.7L10 2z"/></svg>', label: 'mod view' }
  ]

  for (const item of items) {
    const el = document.createElement('div')
    el.className = 'hs-mc-menu-item hs-mc-pred-link'
    el.dataset.action = item.action
    el.style.setProperty('--menu-accent', item.accent)
    // Static HTML with SVG icons only — no dynamic values, safe innerHTML
    el.innerHTML = `<div class="hs-mc-menu-icon">${item.icon}</div><div class="hs-mc-menu-text"><div class="hs-mc-menu-title">${item.label}</div></div><svg class="hs-mc-menu-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
    links.appendChild(el)
  }
  return links
}

// ═══ Chat Color Picker ═══

const TWITCH_COLORS = [
  { name: 'Red', hex: '#FF0000' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Green', hex: '#00FF00' },
  { name: 'FireBrick', hex: '#B22222' },
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'YellowGreen', hex: '#9ACD32' },
  { name: 'OrangeRed', hex: '#FF4500' },
  { name: 'SeaGreen', hex: '#2E8B57' },
  { name: 'GoldenRod', hex: '#DAA520' },
  { name: 'Chocolate', hex: '#D2691E' },
  { name: 'CadetBlue', hex: '#5F9EA0' },
  { name: 'DodgerBlue', hex: '#1E90FF' },
  { name: 'HotPink', hex: '#FF69B4' },
  { name: 'BlueViolet', hex: '#8A2BE2' },
  { name: 'SpringGreen', hex: '#00FF7F' },
]

function renderColorPicker() {
  const section = document.createElement('div')
  section.className = 'hs-mc-color-picker'

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = 'chat color'
  header.appendChild(label)

  const currentEl = document.createElement('span')
  currentEl.className = 'hs-mc-color-current'
  currentEl.id = 'hs-mc-current-color'
  header.appendChild(currentEl)
  section.appendChild(header)

  const grid = document.createElement('div')
  grid.className = 'hs-mc-color-grid'

  for (const c of TWITCH_COLORS) {
    const swatch = document.createElement('div')
    swatch.className = 'hs-mc-color-swatch'
    swatch.style.backgroundColor = c.hex
    swatch.title = c.name
    swatch.dataset.color = c.name
    grid.appendChild(swatch)
  }

  // Custom hex input
  const custom = document.createElement('div')
  custom.className = 'hs-mc-color-custom'
  const hexInput = document.createElement('input')
  hexInput.type = 'text'
  hexInput.placeholder = '#hex (turbo/sub)'
  hexInput.className = 'hs-mc-color-hex'
  hexInput.id = 'hs-mc-color-hex-input'
  hexInput.maxLength = 7
  custom.appendChild(hexInput)
  const hexBtn = document.createElement('div')
  hexBtn.className = 'hs-mc-color-apply'
  hexBtn.textContent = 'set'
  hexBtn.id = 'hs-mc-color-hex-btn'
  custom.appendChild(hexBtn)

  section.appendChild(grid)
  section.appendChild(custom)
  return section
}

function attachColorHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  // Fetch current color
  helixRequest('https://api.twitch.tv/helix/chat/color?user_id={me}').then(resp => {
    if (resp.ok && resp.data?.data?.[0]?.color) {
      const el = document.getElementById('hs-mc-current-color')
      if (el) {
        el.style.backgroundColor = resp.data.data[0].color
        el.title = resp.data.data[0].color
      }
    }
  })

  // Preset swatches
  container.querySelectorAll('.hs-mc-color-swatch').forEach(swatch => {
    swatch.addEventListener('click', async () => {
      const color = swatch.dataset.color
      const resp = await helixRequest(`https://api.twitch.tv/helix/chat/color?user_id={me}&color=${encodeURIComponent(color)}`, 'PUT')
      if (resp.ok) {
        showToast('color: ' + color)
        const el = document.getElementById('hs-mc-current-color')
        if (el) { el.style.backgroundColor = swatch.style.backgroundColor; el.title = color }
      } else {
        showToast('color failed: ' + (resp.error || 'unknown'))
      }
    })
  })

  // Custom hex
  const hexBtn = document.getElementById('hs-mc-color-hex-btn')
  const hexInput = document.getElementById('hs-mc-color-hex-input')
  if (hexBtn && hexInput) {
    hexBtn.addEventListener('click', async () => {
      const color = hexInput.value.trim()
      if (!/^#[0-9a-f]{6}$/i.test(color)) { showToast('invalid hex — use #RRGGBB'); return }
      const resp = await helixRequest(`https://api.twitch.tv/helix/chat/color?user_id={me}&color=${encodeURIComponent(color)}`, 'PUT')
      if (resp.ok) {
        showToast('color: ' + color)
        const el = document.getElementById('hs-mc-current-color')
        if (el) { el.style.backgroundColor = color; el.title = color }
      } else {
        showToast('color failed: ' + (resp.error || 'turbo/sub only for custom hex'))
      }
    })
  }
}

// ═══ Chat Modes (mod/broadcaster) ═══

async function renderChatModes(channel) {
  const section = document.createElement('div')
  section.className = 'hs-mc-chat-modes'
  section.id = 'hs-mc-chat-modes'

  // Resolve broadcaster ID
  const userResp = await helixRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`)
  if (!userResp.ok || !userResp.data?.data?.[0]) return null
  const broadcasterId = userResp.data.data[0].id

  // Fetch current settings (fails with 403 if not mod — that's expected)
  const settingsResp = await helixRequest(`https://api.twitch.tv/helix/chat/settings?broadcaster_id=${broadcasterId}&moderator_id={me}`)
  if (!settingsResp.ok || !settingsResp.data?.data?.[0]) return null
  const s = settingsResp.data.data[0]

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = 'chat modes'
  header.appendChild(label)
  section.appendChild(header)

  const modes = [
    { key: 'emote_mode', label: 'emote only', field: 'emote_mode' },
    { key: 'follower_mode', label: 'follower', field: 'follower_mode' },
    { key: 'slow_mode', label: 'slow', field: 'slow_mode' },
    { key: 'subscriber_mode', label: 'sub only', field: 'subscriber_mode' },
    { key: 'unique_chat_mode', label: 'unique', field: 'unique_chat_mode' },
  ]

  const grid = document.createElement('div')
  grid.className = 'hs-mc-modes-grid'

  for (const mode of modes) {
    const btn = document.createElement('div')
    btn.className = 'hs-mc-mode-btn' + (s[mode.field] ? ' active' : '')
    btn.textContent = mode.label
    btn.dataset.mode = mode.key
    btn.dataset.broadcasterId = broadcasterId
    btn.dataset.active = s[mode.field] ? '1' : '0'
    grid.appendChild(btn)
  }

  section.appendChild(grid)
  return section
}

function attachModeHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  container.querySelectorAll('.hs-mc-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode
      const broadcasterId = btn.dataset.broadcasterId
      const newVal = btn.dataset.active !== '1'
      const body = { [mode]: newVal }
      if (mode === 'slow_mode' && newVal) body.slow_mode_wait_time = 3
      if (mode === 'follower_mode' && newVal) body.follower_mode_duration = 10

      const resp = await helixRequest(
        `https://api.twitch.tv/helix/chat/settings?broadcaster_id=${broadcasterId}&moderator_id={me}`,
        'PATCH', body
      )
      if (resp.ok) {
        btn.dataset.active = newVal ? '1' : '0'
        btn.classList.toggle('active', newVal)
      } else {
        showToast('mode failed: ' + (resp.error || 'unknown'))
      }
    })
  })
}

function makeCoinSvg(size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.style.verticalAlign = '-2px'
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('fill', '#ffbf00')
  path.setAttribute('d', 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 110 16 8 8 0 010-16z')
  svg.appendChild(path)
  return svg
}

function renderPrediction(pred, balance) {
  const frag = document.createDocumentFragment()
  const isLocked = pred.status === 'LOCKED'
  const isResolved = pred.status === 'RESOLVED'
  const isCanceled = pred.status === 'CANCELED'
  const isEnded = isResolved || isCanceled
  const totalPoints = pred.outcomes.reduce((s, o) => s + (o.totalPoints || 0), 0)
  const createdAt = new Date(pred.createdAt).getTime()
  const windowMs = (pred.predictionWindowSeconds || 120) * 1000
  const endsAt = createdAt + windowMs
  const userBet = _userBets.get(pred.id)
  const winningId = pred.winningOutcome?.id || null

  const wrapper = document.createElement('div')
  wrapper.className = 'hs-mc-prediction' + (isResolved ? ' hs-mc-pred-resolved' : '') + (isCanceled ? ' hs-mc-pred-canceled' : '')
  wrapper.dataset.eventId = pred.id

  // Header
  const header = document.createElement('div')
  header.className = 'hs-mc-pred-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-pred-title'
  title.textContent = pred.title
  header.appendChild(title)

  if (isCanceled) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-canceled'
    badge.textContent = 'refunded'
    header.appendChild(badge)
  } else if (isResolved) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-resolved'
    badge.textContent = 'ended'
    header.appendChild(badge)
  } else if (isLocked) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-locked'
    badge.textContent = 'locked'
    header.appendChild(badge)
  } else {
    const timer = document.createElement('span')
    timer.className = 'hs-mc-pred-timer'
    timer.dataset.ends = endsAt
    header.appendChild(timer)
  }
  wrapper.appendChild(header)

  // Balance
  if (balance != null && !isEnded) {
    const bal = document.createElement('div')
    bal.className = 'hs-mc-pred-balance'
    bal.appendChild(makeCoinSvg(14))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance)))
    wrapper.appendChild(bal)
  }

  // User bet result banner
  if (isResolved && userBet && winningId) {
    const won = userBet.outcomeId === winningId
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result ' + (won ? 'hs-mc-pred-result-won' : 'hs-mc-pred-result-lost')
    if (won) {
      const winOutcome = pred.outcomes.find(o => o.id === winningId)
      const pct = totalPoints > 0 && winOutcome ? (winOutcome.totalPoints / totalPoints) : 1
      const payout = pct > 0 ? Math.floor(userBet.points / pct) : userBet.points
      banner.textContent = 'you won +' + formatPoints(payout)
    } else {
      banner.textContent = 'you lost ' + formatPoints(userBet.points)
    }
    wrapper.appendChild(banner)
  } else if (isCanceled && userBet) {
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result hs-mc-pred-result-refund'
    banner.textContent = formatPoints(userBet.points) + ' returned'
    wrapper.appendChild(banner)
  }

  // Outcomes
  const outcomesWrap = document.createElement('div')
  outcomesWrap.className = 'hs-mc-pred-outcomes'

  for (const outcome of pred.outcomes) {
    const pct = totalPoints > 0 ? Math.round((outcome.totalPoints / totalPoints) * 100) : 0
    const color = outcome.color === 'PINK' ? '#f5009b' : '#387aff'
    const userCount = outcome.totalUsers || 0
    const points = outcome.totalPoints || 0
    const isWinner = winningId === outcome.id
    const isLoser = isResolved && !isWinner
    const isBetOn = userBet?.outcomeId === outcome.id

    const card = document.createElement('div')
    card.className = 'hs-mc-pred-outcome'
      + (isWinner ? ' hs-mc-pred-outcome-won' : '')
      + (isLoser ? ' hs-mc-pred-outcome-lost' : '')
      + (isBetOn ? ' hs-mc-pred-outcome-yours' : '')
    card.style.setProperty('--oc', color)

    const head = document.createElement('div')
    head.className = 'hs-mc-pred-outcome-head'
    const titleSpan = document.createElement('span')
    titleSpan.className = 'hs-mc-pred-outcome-title'
    titleSpan.textContent = outcome.title
    if (isWinner) {
      const winBadge = document.createElement('span')
      winBadge.className = 'hs-mc-pred-winner-badge'
      winBadge.textContent = 'winner'
      titleSpan.appendChild(document.createTextNode(' '))
      titleSpan.appendChild(winBadge)
    }
    const pctSpan = document.createElement('span')
    pctSpan.className = 'hs-mc-pred-outcome-pct'
    pctSpan.textContent = pct + '%'
    head.appendChild(titleSpan)
    head.appendChild(pctSpan)
    card.appendChild(head)

    const track = document.createElement('div')
    track.className = 'hs-mc-pred-bar-track'
    const fill = document.createElement('div')
    fill.className = 'hs-mc-pred-bar-fill'
    fill.style.width = pct + '%'
    track.appendChild(fill)
    card.appendChild(track)

    const stats = document.createElement('div')
    stats.className = 'hs-mc-pred-outcome-stats'
    let statsText = formatPoints(points) + ' pts \u00b7 ' + userCount + ' voter' + (userCount !== 1 ? 's' : '')
    if (isBetOn) statsText += ' \u00b7 your bet: ' + formatPoints(userBet.points)
    stats.textContent = statsText
    card.appendChild(stats)

    if (!isLocked && !isEnded) {
      const betRow = document.createElement('div')
      betRow.className = 'hs-mc-pred-bet-row'
      for (const amt of [100, 1000, 5000]) {
        const btn = document.createElement('button')
        btn.className = 'hs-mc-pred-bet-btn'
        btn.dataset.outcome = outcome.id
        btn.dataset.points = amt
        btn.style.setProperty('--oc', color)
        if (balance != null && balance < amt) btn.disabled = true
        btn.textContent = formatPoints(amt)
        betRow.appendChild(btn)
      }

      // Max button
      if (balance != null && balance > 0) {
        const maxBtn = document.createElement('button')
        maxBtn.className = 'hs-mc-pred-bet-btn hs-mc-pred-bet-max'
        maxBtn.dataset.outcome = outcome.id
        maxBtn.dataset.points = balance
        maxBtn.style.setProperty('--oc', color)
        maxBtn.textContent = 'max'
        betRow.appendChild(maxBtn)
      }

      const customInput = document.createElement('input')
      customInput.className = 'hs-mc-pred-bet-custom'
      customInput.type = 'number'
      customInput.min = '1'
      if (balance != null) customInput.max = String(balance)
      customInput.placeholder = 'amt'
      customInput.dataset.outcome = outcome.id
      betRow.appendChild(customInput)

      const goBtn = document.createElement('button')
      goBtn.className = 'hs-mc-pred-bet-go'
      goBtn.dataset.outcome = outcome.id
      goBtn.style.setProperty('--oc', color)
      goBtn.textContent = 'bet'
      betRow.appendChild(goBtn)

      card.appendChild(betRow)
    }

    outcomesWrap.appendChild(card)
  }

  wrapper.appendChild(outcomesWrap)
  frag.appendChild(wrapper)
  return frag
}

function renderNoPrediction(balance) {
  const wrap = document.createElement('div')
  wrap.className = 'hs-mc-pred-empty'
  const text = document.createElement('div')
  text.className = 'hs-mc-pred-empty-text'
  text.textContent = 'no active prediction'
  wrap.appendChild(text)
  if (balance != null) {
    const bal = document.createElement('div')
    bal.className = 'hs-mc-pred-balance'
    bal.style.marginTop = '8px'
    bal.appendChild(makeCoinSvg(14))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance)))
    wrap.appendChild(bal)
  }
  return wrap
}

function renderRewards(rewards, balance, channelId) {
  const section = document.createElement('div')
  section.className = 'hs-mc-rewards'

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = 'rewards'
  header.appendChild(label)
  if (balance != null) {
    const bal = document.createElement('span')
    bal.className = 'hs-mc-rewards-balance'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '12')
    svg.setAttribute('height', '12')
    svg.setAttribute('viewBox', '0 0 20 20')
    svg.style.verticalAlign = '-1px'
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('fill', '#ffbf00')
    path.setAttribute('d', 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 110 16 8 8 0 010-16z')
    svg.appendChild(path)
    bal.appendChild(svg)
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance)))
    header.appendChild(bal)
  }
  section.appendChild(header)

  if (!rewards.length) {
    const empty = document.createElement('div')
    empty.className = 'hs-mc-rewards-empty'
    empty.textContent = 'no rewards available'
    section.appendChild(empty)
    return section
  }

  const grid = document.createElement('div')
  grid.className = 'hs-mc-rewards-grid'

  for (const reward of rewards) {
    const now = Date.now()
    const onCooldown = reward.cooldownExpiresAt && new Date(reward.cooldownExpiresAt).getTime() > now
    const available = !reward.isPaused && reward.isInStock && !onCooldown
    const card = document.createElement('div')
    card.className = 'hs-mc-reward-card' + (available ? '' : ' hs-mc-reward-unavailable')
    card.dataset.rewardId = reward.id
    card.dataset.cost = reward.cost
    card.dataset.title = reward.title
    card.dataset.channelId = channelId
    if (reward.isUserInputRequired) card.dataset.textRequired = '1'
    if (reward.prompt) card.dataset.prompt = reward.prompt
    card.style.setProperty('--rc', reward.backgroundColor || '#9147ff')

    const imgUrl = reward.image?.url || reward.defaultImage?.url || ''
    if (imgUrl) {
      const img = document.createElement('img')
      img.className = 'hs-mc-reward-img'
      img.src = imgUrl
      img.width = 28
      img.height = 28
      card.appendChild(img)
    }

    const info = document.createElement('div')
    info.className = 'hs-mc-reward-info'
    const titleEl = document.createElement('div')
    titleEl.className = 'hs-mc-reward-title'
    titleEl.textContent = reward.title
    info.appendChild(titleEl)

    const costEl = document.createElement('div')
    costEl.className = 'hs-mc-reward-cost'
    const costSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    costSvg.setAttribute('width', '10')
    costSvg.setAttribute('height', '10')
    costSvg.setAttribute('viewBox', '0 0 20 20')
    costSvg.style.verticalAlign = '-1px'
    const costPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    costPath.setAttribute('fill', '#ffbf00')
    costPath.setAttribute('d', 'M10 6a4 4 0 100 8 4 4 0 000-8zm0-4a8 8 0 110 16 8 8 0 010-16z')
    costSvg.appendChild(costPath)
    costEl.appendChild(costSvg)
    costEl.appendChild(document.createTextNode(' ' + formatPoints(reward.cost)))
    info.appendChild(costEl)

    if (!available) {
      const reason = document.createElement('div')
      reason.className = 'hs-mc-reward-reason'
      if (reward.isPaused) reason.textContent = 'paused'
      else if (!reward.isInStock) reason.textContent = 'out of stock'
      else if (onCooldown) {
        const secs = Math.ceil((new Date(reward.cooldownExpiresAt).getTime() - now) / 1000)
        reason.textContent = secs > 60 ? `${Math.ceil(secs / 60)}m cooldown` : `${secs}s cooldown`
        reason.dataset.cooldownEnds = new Date(reward.cooldownExpiresAt).getTime()
      }
      info.appendChild(reason)
    }

    card.appendChild(info)
    grid.appendChild(card)
  }

  section.appendChild(grid)
  return section
}

function attachRewardHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  container.querySelectorAll('.hs-mc-reward-card:not(.hs-mc-reward-unavailable)').forEach(card => {
    card.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (card.querySelector('.hs-mc-reward-input-row')) return

      if (card.dataset.textRequired === '1') {
        const existing = card.parentElement.querySelector('.hs-mc-reward-input-row')
        if (existing) existing.remove()
        const row = document.createElement('div')
        row.className = 'hs-mc-reward-input-row'
        const input = document.createElement('input')
        input.className = 'hs-mc-reward-input'
        input.type = 'text'
        input.placeholder = card.dataset.prompt || 'enter text...'
        const btn = document.createElement('button')
        btn.className = 'hs-mc-reward-submit'
        btn.textContent = 'redeem'
        row.appendChild(input)
        row.appendChild(btn)
        card.after(row)
        input.focus()

        btn.addEventListener('click', async (ev) => {
          ev.stopPropagation()
          const text = input.value.trim()
          if (!text) return
          btn.disabled = true
          btn.textContent = '...'
          const result = await redeemChannelReward(card.dataset.channelId, card.dataset.rewardId, parseInt(card.dataset.cost), card.dataset.title, text)
          if (result.error) {
            btn.textContent = '!'
            btn.title = result.error
            setTimeout(() => { btn.textContent = 'redeem'; btn.disabled = false; btn.title = '' }, 2000)
          } else {
            btn.textContent = '\u2713'
            _rewardsCache = null
            setTimeout(() => renderTwitchTab(), 500)
          }
        })
        return
      }

      const titleEl = card.querySelector('.hs-mc-reward-title')
      const origText = titleEl.textContent
      titleEl.textContent = '...'
      card.style.pointerEvents = 'none'
      const result = await redeemChannelReward(card.dataset.channelId, card.dataset.rewardId, parseInt(card.dataset.cost), card.dataset.title)
      if (result.error) {
        titleEl.textContent = '!'
        card.title = result.error
        setTimeout(() => { titleEl.textContent = origText; card.style.pointerEvents = ''; card.title = '' }, 2000)
      } else {
        titleEl.textContent = '\u2713'
        _rewardsCache = null
        setTimeout(() => renderTwitchTab(), 500)
      }
    })
  })

  // Cooldown timers
  container.querySelectorAll('.hs-mc-reward-reason[data-cooldown-ends]').forEach(el => {
    const endsAt = parseInt(el.dataset.cooldownEnds)
    const iv = cleanup.setInterval(() => {
      if (!el.isConnected) { clearInterval(iv); return }
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (secs <= 0) {
        _rewardsCache = null
        renderTwitchTab()
        clearInterval(iv)
        return
      }
      el.textContent = secs > 60 ? `${Math.ceil(secs / 60)}m cooldown` : `${secs}s cooldown`
    }, 1000)
  })
}

function attachPredictionHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  // Quick link handlers
  container.querySelectorAll('.hs-mc-pred-link').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation()
      triggerTwitchFeature(item.dataset.action)
    })
  })

  // Bet button handlers
  container.querySelectorAll('.hs-mc-pred-bet-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) return
      btn.disabled = true
      btn.textContent = '...'
      const result = await placePredictionBet(eventId, btn.dataset.outcome, parseInt(btn.dataset.points))
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = formatPoints(parseInt(btn.dataset.points)); btn.disabled = false; btn.title = '' }, 2000)
      } else {
        btn.textContent = '\u2713'
        setTimeout(() => renderTwitchTab(), 500)
      }
    })
  })

  // Custom bet "go" buttons
  container.querySelectorAll('.hs-mc-pred-bet-go').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) return
      const input = container.querySelector(`.hs-mc-pred-bet-custom[data-outcome="${btn.dataset.outcome}"]`)
      const points = parseInt(input?.value)
      if (!points || points < 1) return
      btn.disabled = true
      btn.textContent = '...'
      const result = await placePredictionBet(eventId, btn.dataset.outcome, points)
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = 'bet'; btn.disabled = false; btn.title = '' }, 2000)
      } else {
        btn.textContent = '\u2713'
        input.value = ''
        setTimeout(() => renderTwitchTab(), 500)
      }
    })
  })

  // Enter key in custom input triggers bet
  container.querySelectorAll('.hs-mc-pred-bet-custom').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        const goBtn = container.querySelector(`.hs-mc-pred-bet-go[data-outcome="${input.dataset.outcome}"]`)
        if (goBtn && !goBtn.disabled) goBtn.click()
      }
    })
  })

  // Start countdown timers
  container.querySelectorAll('.hs-mc-pred-timer').forEach(el => {
    const endsAt = parseInt(el.dataset.ends)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (remaining <= 0) {
        el.textContent = 'closing...'
        el.classList.add('hs-mc-pred-locked')
        return
      }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      el.textContent = m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
    }
    update()
    const iv = cleanup.setInterval(() => {
      if (!el.isConnected) { clearInterval(iv); return }
      update()
    }, 1000)
  })
}

// Get Twitch channel for the active multichat tab (channel tab → twitch name, live → URL channel)
function getActiveTwitchChannel() {
  if (currentTab === 'live' || currentTab === 'feed' || currentTab === 'mentions' || currentTab === 'whispers') {
    return getLiveChannel()
  }
  const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
  if (!ch) return getLiveChannel()
  return typeof ch === 'string' ? ch : ch.twitch || ch.id
}

async function renderTwitchTab() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  const channel = getActiveTwitchChannel()
  if (!channel) {
    container.textContent = ''
    const empty = document.createElement('div')
    empty.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = 'no channel detected'
    empty.appendChild(msg)
    container.appendChild(empty)
    container.appendChild(renderQuickLinks())
    return
  }

  _predictionChannel = channel

  if (!container.querySelector('.hs-mc-prediction, .hs-mc-pred-empty')) {
    container.textContent = ''
    const loading = document.createElement('div')
    loading.className = 'hs-mc-pred-loading'
    loading.textContent = 'loading...'
    container.appendChild(loading)
  }

  const [result, rewardsResult, pollResult] = await Promise.all([
    fetchPrediction(channel),
    fetchChannelRewards(channel),
    fetchPoll(channel)
  ])

  container.textContent = ''

  // Auto-claim bonus points
  if (rewardsResult?.availableClaim && rewardsResult.channelId) {
    claimCommunityPoints(rewardsResult.availableClaim, rewardsResult.channelId)
  }

  if (!result) {
    const empty = document.createElement('div')
    empty.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = "couldn't load predictions"
    empty.appendChild(msg)
    container.appendChild(empty)
  } else if (result.prediction) {
    container.appendChild(renderPrediction(result.prediction, result.balance))
  } else {
    container.appendChild(renderNoPrediction(result.balance))
  }

  // Poll
  if (pollResult) {
    container.appendChild(renderPoll(pollResult))
  }

  if (rewardsResult?.rewards?.length) {
    container.appendChild(renderRewards(rewardsResult.rewards, rewardsResult.balance, rewardsResult.channelId))
  }

  // Color picker
  container.appendChild(renderColorPicker())

  // Chat modes (only renders if user is mod/broadcaster — fails silently otherwise)
  renderChatModes(channel).then(modesEl => {
    if (modesEl) {
      const linksEl = container.querySelector('.hs-mc-pred-links')
      if (linksEl) container.insertBefore(modesEl, linksEl)
      else container.appendChild(modesEl)
      attachModeHandlers()
    }
  })

  container.appendChild(renderQuickLinks())
  attachPredictionHandlers()
  attachPollHandlers()
  attachRewardHandlers()
  attachColorHandlers()
  startPredictionPoll()
}

function startPredictionPoll() {
  stopPredictionPoll()
  _predictionPollTimer = cleanup.setInterval(() => {
    const container = document.getElementById('hs-mc-tab-twitch')
    if (!container || container.style.display === 'none') {
      stopPredictionPoll()
      return
    }
    renderTwitchTab()
  }, 15000)
}

function stopPredictionPoll() {
  if (_predictionPollTimer) {
    clearInterval(_predictionPollTimer)
    _predictionPollTimer = null
  }
}

function triggerTwitchFeature(action) {
  const channel = getActiveTwitchChannel() || getCurrentChannel();
  if (!channel) return false;

  if (action === 'clip') {
    // Create clip via Helix API
    ;(async () => {
      const userResp = await helixRequest(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channel)}`)
      if (!userResp.ok || !userResp.data?.data?.[0]) { showToast('could not resolve channel'); return }
      const broadcasterId = userResp.data.data[0].id
      const resp = await helixRequest(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, 'POST')
      if (resp.ok && resp.data?.data?.[0]) {
        const editUrl = resp.data.data[0].edit_url
        const clipId = resp.data.data[0].id
        showToast('clip created! ' + clipId)
        // Copy clip URL to clipboard
        try { await navigator.clipboard.writeText(editUrl || `https://clips.twitch.tv/${clipId}`) } catch {}
      } else {
        showToast('clip failed: ' + (resp.error || 'stream must be live'))
      }
    })()
    return true
  }

  const actions = {
    popout: { url: `https://www.twitch.tv/popout/${channel}/chat?popout=`, opts: 'width=400,height=600' },
    mod:    { url: `https://www.twitch.tv/moderator/${channel}`, opts: 'width=1200,height=800' },
  };

  const cfg = actions[action];
  if (!cfg) return false;

  window.open(cfg.url, '_blank', cfg.opts || '');
  return true;
}

// Twitch IRC badge rendering
const BADGE_STYLES = {
  broadcaster: { label: 'LIVE', bg: '#e91916', fg: '#fff' },
  moderator: { label: 'MOD', bg: '#00ad03', fg: '#fff' },
  vip: { label: 'VIP', bg: '#e005b9', fg: '#fff' },
  subscriber: { label: 'SUB', bg: '#8205b4', fg: '#fff' },
  predictions: { label: 'PRED', bg: '#1f69ff', fg: '#fff' },
  premium: { label: 'PRIME', bg: '#0d6efd', fg: '#fff' },
  admin: { label: 'ADMIN', bg: '#faaf19', fg: '#000' },
  staff: { label: 'STAFF', bg: '#faaf19', fg: '#000' },
  global_mod: { label: 'GMOD', bg: '#00ad03', fg: '#fff' },
  partner: { label: '✓', bg: '#9147ff', fg: '#fff' },
  'bits-leader': { label: 'BITS', bg: '#ffd700', fg: '#000' },
  'sub-gifter': { label: 'GIFT', bg: '#8205b4', fg: '#fff' },
  artist: { label: 'ART', bg: '#ff6b35', fg: '#fff' },
  turbo: { label: 'T+', bg: '#6441a5', fg: '#fff' },
  founder: { label: 'FND', bg: '#8205b4', fg: '#fff' },
  // Kick badges (underscore variants)
  sub_gifter: { label: 'GIFT', bg: '#8205b4', fg: '#fff' },
  og: { label: 'OG', bg: '#53fc18', fg: '#000' },
  verified: { label: '✓', bg: '#53fc18', fg: '#000' },
}

// Twitch badge image URLs: "setID/version" → image_url
const twitchBadgeUrls = new Map()
const ffzBadgeKeys = new Set() // tracks which channel:badgeName entries are FFZ (need bg color)
const badgesFetchedChannels = new Set()
let globalBadgesFetched = false
const TWITCH_GQL = 'https://gql.twitch.tv/gql'
const TWITCH_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

// ═══ GQL Proxy — routes calls through MAIN world to use fresh hashes ═══
// Twitch rotates persisted query hashes; the MAIN world fetch interceptor
// captures them from Twitch's own code so we never hardcode stale hashes.

// Cache for intercepted GQL data pushed from MAIN world
const _gqlDataCache = {} // operationName → { data, ts }

// Listen for passively intercepted GQL data from MAIN world
window.addEventListener('message', (e) => {
  if (e.origin !== location.origin) return
  if (e.data?.type === 'heatsync-gql-data') {
    const { operation, data, errors } = e.data
    if (data && !errors?.length) {
      _gqlDataCache[operation] = { data, ts: Date.now() }
      // Auto-refresh Twitch tab if prediction/poll data arrives while tab is visible
      const container = document.getElementById('hs-mc-tab-twitch')
      if (container && container.style.display !== 'none') {
        renderTwitchTab()
      }
    }
  }
})

// Send Helix API request through MAIN world (uses captured OAuth token)
// URL can contain {me} which resolves to the logged-in user's ID
function helixRequest(url, method, body) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-helix-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler)
    const msg = { type: 'heatsync-helix', id, url, method: method || 'GET' }
    if (body) msg.body = body
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({ error: 'helix timeout — refresh the page' })
    }, 15000)
  })
}

// Send GQL request through MAIN world proxy (uses captured hashes + integrity)
function gqlProxy(operation, variables, opts) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-gql-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.data)
      }
    }
    window.addEventListener('message', handler)
    const msg = { type: 'heatsync-gql-request', id, operation, variables }
    if (opts?.rawQuery) msg.rawQuery = opts.rawQuery
    if (opts?.batch) msg.batch = opts.batch
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      reject(new Error('GQL proxy timeout'))
    }, 10000)
  })
}

// Request cached data from MAIN world
function gqlGetCache(operations) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-gql-cache-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler)
    window.postMessage({ type: 'heatsync-gql-get-cache', id, operations }, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({ data: {}, hashes: [] })
    }, 3000)
  })
}

async function fetchGlobalBadges() {
  if (globalBadgesFetched) return
  globalBadgesFetched = true
  try {
    const resp = await fetch(TWITCH_GQL, {
      method: 'POST',
      headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ badges { imageURL(size: NORMAL) setID version } }' }),
      signal: AbortSignal.timeout(5000)
    })
    if (!resp.ok) return
    const data = await resp.json()
    const badges = data?.data?.badges
    if (!badges) return
    for (const b of badges) {
      twitchBadgeUrls.set(`${b.setID}/${b.version}`, b.imageURL)
    }
    log('Loaded global badges:', twitchBadgeUrls.size)
    renderMessages(currentTab)
  } catch (e) {
    globalBadgesFetched = false
    log('Failed to fetch global badges:', e.message)
  }
}

// Prediction state
let _predictionPollTimer = null
let _predictionChannel = null
const _userBets = new Map() // eventId → { outcomeId, points }

// Rewards state
let _rewardsCache = null
let _rewardsCacheChannel = null

async function fetchPrediction(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  try {
    // First check MAIN world cache (intercepted from Twitch's own calls)
    const cached = await gqlGetCache(['ChannelPointsPredictionContext', 'CommunityPointsContext'])
    const predCache = cached.data?.ChannelPointsPredictionContext
    const pointsCache = cached.data?.CommunityPointsContext

    let predEvent = null
    let balance = null

    if (predCache && Date.now() - predCache.ts < 30000) {
      predEvent = predCache.data?.user?.activePredictionEvent || null
    }
    if (pointsCache && Date.now() - pointsCache.ts < 30000) {
      balance = pointsCache.data?.community?.channel?.self?.communityPoints?.balance ?? null
    }

    // If cache miss, try proxy call with captured hashes
    if (!predCache || Date.now() - predCache.ts >= 30000) {
      try {
        const data = await gqlProxy('ChannelPointsPredictionContext', { channelLogin: safe })
        if (Array.isArray(data)) {
          predEvent = data[0]?.data?.user?.activePredictionEvent || null
          balance = data[1]?.data?.community?.channel?.self?.communityPoints?.balance ?? balance
        } else {
          predEvent = data?.data?.user?.activePredictionEvent || data?.user?.activePredictionEvent || null
        }
      } catch (e) {
        log('GQL proxy prediction failed:', e.message)
      }
    }
    if (balance == null && (!pointsCache || Date.now() - pointsCache.ts >= 30000)) {
      try {
        const data = await gqlProxy('CommunityPointsContext', { channelLogin: safe })
        const d = Array.isArray(data) ? data[0]?.data : (data?.data || data)
        balance = d?.community?.channel?.self?.communityPoints?.balance ?? null
      } catch (e) {
        log('GQL proxy points failed:', e.message)
      }
    }

    return { prediction: predEvent, balance }
  } catch (e) {
    log('Failed to fetch prediction:', e.message)
    return null
  }
}

async function placePredictionBet(eventId, outcomeId, points, transactionId) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    const data = await gqlProxy('MakePrediction', {
      input: {
        eventID: eventId,
        outcomeID: outcomeId,
        points: points,
        transactionID: transactionId || crypto.randomUUID()
      }
    })
    const d = Array.isArray(data) ? data[0] : data
    if (d?.errors?.length) return { error: d.errors[0].message }
    _userBets.set(eventId, { outcomeId, points })
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
}

async function fetchChannelRewards(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  if (_rewardsCacheChannel === safe && _rewardsCache && Date.now() - _rewardsCache.fetchedAt < 60000) {
    return _rewardsCache
  }
  const token = getTwitchAuthToken()
  if (!token) return null
  try {
    // Try proxy with captured ChannelPointsContext hash first
    const data = await gqlProxy('ChannelPointsContext', { channelLogin: safe }).catch(() => null)
    let user = null
    if (data) {
      const d = Array.isArray(data) ? data[0] : data
      user = d?.data?.community?.channel || d?.data?.user || d?.community?.channel || d?.user
    }
    // Fallback: try raw GQL (may work for some fields)
    if (!user) {
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': `OAuth ${token}`
        },
        body: JSON.stringify({
          query: `{
            user(login: "${safe}") {
              id
              communityPointsSettings {
                customRewards {
                  id title cost backgroundColor isEnabled isPaused isInStock
                  isUserInputRequired cooldownExpiresAt prompt
                  globalCooldownSetting { globalCooldownSeconds isEnabled }
                  image { url }
                  defaultImage { url }
                }
              }
              self {
                communityPoints {
                  balance
                  availableClaim { id }
                }
              }
            }
          }`
        })
      })
      if (resp.ok) {
        const raw = await resp.json()
        user = raw?.data?.user
      }
    }
    if (!user) return null
    const settings = user.communityPointsSettings || user.communityPointsSetting || {}
    const rewards = (settings.customRewards || []).filter(r => r.isEnabled)
    const self = user.self || {}
    const cp = self.communityPoints || {}
    const balance = cp.balance ?? null
    const availableClaim = cp.availableClaim?.id ?? null
    _rewardsCache = { rewards, balance, availableClaim, channelId: user.id, fetchedAt: Date.now() }
    _rewardsCacheChannel = safe
    return _rewardsCache
  } catch (e) {
    log('Failed to fetch rewards:', e.message)
    return null
  }
}

async function redeemChannelReward(channelId, rewardId, cost, title, textInput) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    const input = {
      channelID: channelId,
      rewardID: rewardId,
      cost,
      title,
      transactionID: crypto.randomUUID()
    }
    if (textInput) input.textInput = textInput
    // Try proxy first (uses captured hash + integrity)
    try {
      const data = await gqlProxy('RedeemCommunityPointsCustomReward', { input })
      const d = Array.isArray(data) ? data[0] : data
      if (d?.errors?.length) return { error: d.errors[0].message }
      const err = d?.data?.redeemCommunityPointsCustomReward?.error
      if (err) return { error: err.code || 'redemption failed' }
      return { ok: true }
    } catch(proxyErr) {
      // Fallback to raw GQL mutation
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': `OAuth ${token}`
        },
        body: JSON.stringify({
          query: `mutation($input: RedeemCommunityPointsCustomRewardInput!) {
            redeemCommunityPointsCustomReward(input: $input) {
              redemption { id }
              error { code }
            }
          }`,
          variables: { input }
        })
      })
      if (!resp.ok) return { error: `HTTP ${resp.status}` }
      const data = await resp.json()
      if (data?.errors?.length) return { error: data.errors[0].message }
      const err = data?.data?.redeemCommunityPointsCustomReward?.error
      if (err) return { error: err.code || 'redemption failed' }
      return { ok: true }
    }
  } catch (e) {
    return { error: e.message }
  }
}

async function claimCommunityPoints(claimId, channelId) {
  const token = getTwitchAuthToken()
  if (!token) return
  try {
    await gqlProxy('ClaimCommunityPoints', {
      input: { claimID: claimId, channelID: channelId }
    }).catch(async () => {
      // Fallback to raw GQL
      await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': `OAuth ${token}`
        },
        body: JSON.stringify({
          query: `mutation($input: ClaimCommunityPointsInput!) {
            claimCommunityPoints(input: $input) { claim { id } }
          }`,
          variables: { input: { claimID: claimId, channelID: channelId } }
        })
      })
    })
  } catch (e) {
    log('Failed to claim bonus points:', e.message)
  }
}

async function fetchPoll(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  try {
    // Try MAIN world cache first (intercepted from Twitch's own calls)
    const cached = await gqlGetCache(['ActivePoll', 'ChannelPollContext'])
    for (const key of ['ActivePoll', 'ChannelPollContext']) {
      const c = cached.data?.[key]
      if (c && Date.now() - c.ts < 15000) {
        const poll = c.data?.user?.activePoll || c.data?.channel?.activePoll || null
        if (poll) return poll
      }
    }
    // Try proxy with captured hash
    try {
      const data = await gqlProxy('ActivePoll', { channelLogin: safe })
      const d = Array.isArray(data) ? data[0] : data
      return d?.data?.user?.activePoll || d?.user?.activePoll || null
    } catch(e) {
      log('GQL proxy poll failed:', e.message)
    }
    // Fallback to raw GQL
    const token = getTwitchAuthToken()
    const headers = { 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = 'OAuth ' + token
    const resp = await fetch(TWITCH_GQL, {
      method: 'POST', headers,
      body: JSON.stringify({
        query: '{ user(login: "' + safe + '") { activePoll { id title status durationSeconds remainingDurationMilliseconds startedAt choices { id title totalVoters } totalVoters } } }'
      })
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.data?.user?.activePoll || null
  } catch (e) {
    log('Failed to fetch poll:', e.message)
    return null
  }
}

async function votePoll(pollId, choiceId) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    // Try proxy first
    try {
      const data = await gqlProxy('VotePoll', {
        input: { pollID: pollId, choiceID: choiceId }
      })
      const d = Array.isArray(data) ? data[0] : data
      if (d?.errors?.length) return { error: d.errors[0].message }
      const err = d?.data?.votePoll?.error
      if (err) return { error: err.code || 'vote failed' }
      return { ok: true }
    } catch(proxyErr) {
      // Fallback to raw GQL
      const resp = await fetch(TWITCH_GQL, {
        method: 'POST',
        headers: {
          'Client-Id': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json',
          'Authorization': 'OAuth ' + token
        },
        body: JSON.stringify({
          query: 'mutation($input: VotePollInput!) { votePoll(input: $input) { error { code } } }',
          variables: { input: { pollID: pollId, choiceID: choiceId } }
        })
      })
      if (!resp.ok) return { error: 'HTTP ' + resp.status }
      const data = await resp.json()
      if (data?.errors?.length) return { error: data.errors[0].message }
      const err = data?.data?.votePoll?.error
      if (err) return { error: err.code || 'vote failed' }
      return { ok: true }
    }
  } catch (e) {
    return { error: e.message }
  }
}

let _userPollVotes = new Map() // pollId → choiceId

function renderPoll(poll) {
  const section = document.createElement('div')
  section.className = 'hs-mc-poll'
  section.dataset.pollId = poll.id

  const isCompleted = poll.status === 'COMPLETED' || poll.status === 'ARCHIVED'
  const totalVotes = poll.totalVoters || poll.choices.reduce((s, c) => s + (c.totalVoters || 0), 0)
  const userVote = _userPollVotes.get(poll.id)

  // Header
  const header = document.createElement('div')
  header.className = 'hs-mc-poll-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-poll-title'
  title.textContent = poll.title
  header.appendChild(title)

  if (isCompleted) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-poll-status hs-mc-poll-status-ended'
    badge.textContent = 'ended'
    header.appendChild(badge)
  } else if (poll.remainingDurationMilliseconds != null) {
    const timer = document.createElement('span')
    timer.className = 'hs-mc-poll-timer'
    timer.dataset.ends = Date.now() + poll.remainingDurationMilliseconds
    header.appendChild(timer)
  }
  section.appendChild(header)

  // Total votes
  const meta = document.createElement('div')
  meta.className = 'hs-mc-poll-meta'
  meta.textContent = totalVotes + ' vote' + (totalVotes !== 1 ? 's' : '')
  section.appendChild(meta)

  // Choices
  const choicesWrap = document.createElement('div')
  choicesWrap.className = 'hs-mc-poll-choices'

  // Find top choice for winner highlight
  let topVotes = 0
  for (const c of poll.choices) {
    if ((c.totalVoters || 0) > topVotes) topVotes = c.totalVoters || 0
  }

  for (const choice of poll.choices) {
    const votes = choice.totalVoters || 0
    const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
    const isTop = isCompleted && votes === topVotes && topVotes > 0
    const isVoted = userVote === choice.id

    const row = document.createElement('div')
    row.className = 'hs-mc-poll-choice' + (isTop ? ' hs-mc-poll-choice-top' : '') + (isVoted ? ' hs-mc-poll-choice-voted' : '')

    const track = document.createElement('div')
    track.className = 'hs-mc-poll-choice-track'
    const fill = document.createElement('div')
    fill.className = 'hs-mc-poll-choice-fill'
    fill.style.width = pct + '%'
    track.appendChild(fill)

    const label = document.createElement('div')
    label.className = 'hs-mc-poll-choice-label'

    const nameSpan = document.createElement('span')
    nameSpan.className = 'hs-mc-poll-choice-name'
    nameSpan.textContent = choice.title
    if (isVoted) {
      const check = document.createElement('span')
      check.className = 'hs-mc-poll-voted-check'
      check.textContent = ' \u2713'
      nameSpan.appendChild(check)
    }
    label.appendChild(nameSpan)

    const pctSpan = document.createElement('span')
    pctSpan.className = 'hs-mc-poll-choice-pct'
    pctSpan.textContent = pct + '%'
    label.appendChild(pctSpan)

    track.appendChild(label)
    row.appendChild(track)

    if (!isCompleted && !userVote) {
      const voteBtn = document.createElement('button')
      voteBtn.className = 'hs-mc-poll-vote-btn'
      voteBtn.dataset.pollId = poll.id
      voteBtn.dataset.choiceId = choice.id
      voteBtn.textContent = 'vote'
      row.appendChild(voteBtn)
    }

    choicesWrap.appendChild(row)
  }

  section.appendChild(choicesWrap)
  return section
}

function attachPollHandlers() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return

  container.querySelectorAll('.hs-mc-poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      btn.disabled = true
      btn.textContent = '...'
      const result = await votePoll(btn.dataset.pollId, btn.dataset.choiceId)
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = 'vote'; btn.disabled = false; btn.title = '' }, 2000)
      } else {
        _userPollVotes.set(btn.dataset.pollId, btn.dataset.choiceId)
        btn.textContent = '\u2713'
        setTimeout(() => renderTwitchTab(), 500)
      }
    })
  })

  // Poll timers
  container.querySelectorAll('.hs-mc-poll-timer').forEach(el => {
    const endsAt = parseInt(el.dataset.ends)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (remaining <= 0) {
        el.textContent = 'ended'
        el.classList.add('hs-mc-poll-status-ended')
        return
      }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's'
    }
    update()
    const iv = cleanup.setInterval(() => {
      if (!el.isConnected) { clearInterval(iv); return }
      update()
    }, 1000)
  })
}

async function fetchChannelBadges(channelLogin) {
  if (!channelLogin || badgesFetchedChannels.has(channelLogin)) return
  // Sanitize: Twitch logins are alphanumeric + underscore only
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return
  badgesFetchedChannels.add(channelLogin)
  // Evict oldest channel if cache exceeds 20
  if (badgesFetchedChannels.size > 20) {
    const oldest = badgesFetchedChannels.values().next().value;
    badgesFetchedChannels.delete(oldest);
    // Remove that channel's badge entries
    for (const key of twitchBadgeUrls.keys()) {
      if (key.startsWith(`${oldest}:`)) twitchBadgeUrls.delete(key);
    }
  }
  try {
    // Fetch Twitch GQL + FFZ badges in parallel
    const [twitchResp, ffzResp] = await Promise.allSettled([
      fetch(TWITCH_GQL, {
        method: 'POST',
        headers: { 'Client-Id': TWITCH_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ user(login: "${safe}") { broadcastBadges { imageURL(size: NORMAL) setID version } } }` }),
        signal: AbortSignal.timeout(5000)
      }),
      fetch(`https://api.frankerfacez.com/v1/room/${safe}`, { signal: AbortSignal.timeout(5000) })
    ])

    // Twitch channel badges
    if (twitchResp.status === 'fulfilled' && twitchResp.value.ok) {
      const data = await twitchResp.value.json()
      const badges = data?.data?.user?.broadcastBadges
      if (badges) {
        for (const b of badges) {
          twitchBadgeUrls.set(`${channelLogin}:${b.setID}/${b.version}`, b.imageURL)
        }
      }
    }

    // FFZ custom mod/VIP badges — override Twitch versions
    if (ffzResp.status === 'fulfilled' && ffzResp.value.ok) {
      const ffz = await ffzResp.value.json()
      const room = ffz?.room
      if (room) {
        // Custom mod badge
        const modUrl = room.mod_urls?.['2'] || room.mod_urls?.['1'] || room.moderator_badge
        if (modUrl) {
          const src = modUrl.startsWith('//') ? 'https:' + modUrl : modUrl
          twitchBadgeUrls.set(`${channelLogin}:moderator/1`, src)
          ffzBadgeKeys.add(`${channelLogin}:moderator`)
        }
        // Custom VIP badge
        const vipUrl = room.vip_badge?.['2'] || room.vip_badge?.['1']
        if (vipUrl) {
          const src = vipUrl.startsWith('//') ? 'https:' + vipUrl : vipUrl
          twitchBadgeUrls.set(`${channelLogin}:vip/1`, src)
          ffzBadgeKeys.add(`${channelLogin}:vip`)
        }
      }
    }

    log('Loaded channel badges for', channelLogin)
    renderMessages(currentTab)
  } catch (e) {
    badgesFetchedChannels.delete(channelLogin)
    log('Failed to fetch channel badges:', e.message)
  }
}

function renderBadges(badgesStr, channel) {
  if (!badgesStr) return ''
  return badgesStr.split(',').map(badge => {
    const [name, version] = badge.split('/')
    // Channel-specific first, then global fallback
    const url = (channel && twitchBadgeUrls.get(`${channel}:${name}/${version}`))
      || twitchBadgeUrls.get(`${name}/${version}`)
      || twitchBadgeUrls.get(`${name}/1`)
    if (url) {
      // FFZ custom badges are white icons on transparent bg — add badge-type background
      const ffzKey = channel && `${channel}:${name}/`
      const isFFZ = ffzKey && ffzBadgeKeys.has(`${channel}:${name}`)
      const bgStyle = isFFZ && BADGE_STYLES[name] ? `background:${BADGE_STYLES[name].bg};padding:1px;border-radius:2px;` : ''
      return `<img class="hs-mc-badge-img" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" style="width:18px;height:18px;${bgStyle}">`
    }
    // Text fallback
    const style = BADGE_STYLES[name]
    if (!style) return ''
    return `<span class="hs-mc-badge" style="background:${style.bg};color:${style.fg}" title="${escapeHtml(name)}">${style.label}</span>`
  }).join('')
}

// ═══ Followage Lookup ═══

const _followageCache = new Map() // "user:channel" → { result, ts }
const FOLLOWAGE_CACHE_TTL = 300000 // 5min

async function lookupFollowage(username, channelLogin) {
  if (!username || !channelLogin) return null
  if (username.toLowerCase() === channelLogin.toLowerCase()) return null
  const key = `${username.toLowerCase()}:${channelLogin.toLowerCase()}`
  const cached = _followageCache.get(key)
  if (cached && Date.now() - cached.ts < FOLLOWAGE_CACHE_TTL) return cached.result

  try {
    // Try server-side API first (works everywhere, including multichat on heatsync.org)
    const resp = typeof apiFetch === 'function'
      ? await apiFetch(`/api/twitch/followage?user=${encodeURIComponent(username)}&channel=${encodeURIComponent(channelLogin)}`)
      : null
    if (resp?.ok && resp.data) {
      const d = resp.data
      const result = {
        followedAt: d.followedAt || null,
        followerCount: d.followerCount ?? null,
        channelFollowedAt: d.channelFollowedAt || null,
      }
      _followageCache.set(key, { result, ts: Date.now() })
      if (_followageCache.size > 500) {
        _followageCache.delete(_followageCache.keys().next().value)
      }
      return result
    }

    // Fallback: direct GQL proxy (works on Twitch tabs with MAIN world script)
    const safeUser = username.replace(/[^a-z0-9_]/gi, '')
    const safeChan = channelLogin.replace(/[^a-z0-9_]/gi, '')
    const data = await gqlProxy(null, null, {
      rawQuery: `{ user(login: "${safeUser}") { follow(targetLogin: "${safeChan}") { followedAt } followers { totalCount } } channel: user(login: "${safeChan}") { follow(targetLogin: "${safeUser}") { followedAt } } }`
    })
    const user = data?.data?.user
    const result = {
      followedAt: user?.follow?.followedAt || null,
      followerCount: user?.followers?.totalCount ?? null,
      channelFollowedAt: data?.data?.channel?.follow?.followedAt || null,
    }
    _followageCache.set(key, { result, ts: Date.now() })
    if (_followageCache.size > 500) {
      _followageCache.delete(_followageCache.keys().next().value)
    }
    return result
  } catch {
    return null
  }
}


// --- multichat/social.js ---
// Social - feed, notifications, activity, heatsync API

// Heat tier display — number + color glow + row effects, no emoji
function getHeatDisplay(heat) {
  if (!heat || heat <= 0) return null
  let color, glow = false, border = '#555', borderWidth = 2, bg = ''
  if (heat >= 5000) {
    color = '#fff'; glow = true; border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'; // + breathing animation applied separately
  } else if (heat >= 500) {
    color = '#fff'; glow = true; border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'
  } else if (heat >= 100) {
    color = '#ffaa00'; border = '#ffaa00'; borderWidth = 3
    bg = 'rgba(50,15,0,0.10)'
  } else if (heat >= 25) {
    color = '#ff8700'; border = '#ff8700'; borderWidth = 3
    bg = 'rgba(40,12,0,0.07)'
  } else if (heat >= 10) {
    color = '#ff8700'; border = '#ff8700'; borderWidth = 2
  } else if (heat >= 1) {
    color = '#666'; border = '#555'; borderWidth = 2
  } else {
    color = '#444'
  }
  const suffix = heat >= 10 ? '°' : ''
  const breathe = heat >= 500
  return { color, glow, suffix, border, borderWidth, bg, breathe }
}

// Feed & notifications state
let feedMessages = [];
let feedLoaded = false;
let feedLoading = false;
let feedPage = 1;
let feedHasMore = true;
let feedLastFetch = 0; // Timestamp of last feed fetch
const FEED_STALE_MS = 120000; // 2 minutes
let notifications = { mentions: 0, op_replies: 0, re_replies: 0, total: 0 };
let notifMessages = []; // Actual notification messages for display
let notifLoaded = false;
let unreadNotifCount = 0;
const activityEvents = []; // Stream events for activity tab
const ACTIVITY_EVENTS_MAX = 500;
function pushActivityEvent(evt) {
  if (activityEvents.some(m => m.text === evt.text)) return
  activityEvents.push(evt)
  if (activityEvents.length > ACTIVITY_EVENTS_MAX) activityEvents.splice(0, activityEvents.length - ACTIVITY_EVENTS_MAX)
}
let activeThread = null // { id, op, replies[] } — when set, feed shows thread view
let replyState = null; // { msgId, user, channel } when replying to a message
let hsAuthToken = null; // Heatsync auth state (loaded from storage)

// ============================================
// SOCIAL TABS (FEED & NOTIFICATIONS)
// ============================================

// API proxy — routes through background.js to bypass CORS + attach auth
async function apiFetch(path, opts = {}) {
  try {
    const resp = await api.runtime.sendMessage({
      type: 'api_fetch',
      path,
      method: opts.method || 'GET',
      auth: opts.auth !== false,
      body: opts.body
    })
    return resp || { ok: false, error: 'no response' }
  } catch (e) {
    return { ok: false, error: 'context invalidated' }
  }
}

// Load heatsync auth state from storage
async function loadHsAuth() {
  try {
    const data = await api.storage.local.get(['auth_token_encrypted', 'auth_token']);
    hsAuthToken = !!(data.auth_token_encrypted || data.auth_token);
    log('Heatsync auth:', hsAuthToken ? 'logged in' : 'anonymous');
  } catch (e) {
    hsAuthToken = false;
  }

  // Watch for auth changes (login/logout on heatsync.org)
  if (!window._hsMcAuthWatcher) {
    window._hsMcAuthWatcher = true;
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.auth_token_encrypted || changes.auth_token) {
        const wasAuthed = hsAuthToken;
        hsAuthToken = !!(
          changes.auth_token_encrypted?.newValue ||
          changes.auth_token?.newValue
        );
        if (wasAuthed !== hsAuthToken) {
          log('Auth state changed:', hsAuthToken ? 'logged in' : 'logged out');
          // Reset feed/notif data on auth change
          feedLoaded = false;
          feedMessages = [];
          notifLoaded = false;
          notifMessages = [];
          unreadNotifCount = 0;
          updateNotifBadge();
          if (currentTab === 'feed') {
            renderMessages(currentTab);
          }
        }
      }
    });
  }
}

// Listen for social events from background (new messages, notifications)
function listenForSocialEvents() {
  // Guard: only register once (survives SPA reinit via chrome listener persistence)
  if (window._hsMcSocialListener) return;
  window._hsMcSocialListener = true;

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg.type === 'new-message' && msg.data) {
      if (!feedLoaded) return;
      // Dedup: skip if already in feed
      const id = msg.data.base36_id;
      if (id && feedMessages.some(m => m.base36_id === id)) return;

      if (msg.data.username === 'Anonymous') return
      feedMessages.unshift(msg.data);
      if (feedMessages.length > 150) feedMessages.pop();

      // Real-time thread update: if reply to the active thread, append it
      const replyTo = msg.data.reply_to;
      if (replyTo && activeThread && activeThread.id === replyTo) {
        if (!activeThread.replies.some(r => r.base36_id === id)) {
          activeThread.replies.push(msg.data);
          if (activeThread.op) activeThread.op.reply_count = (activeThread.op.reply_count || 0) + 1;
        }
      }
      // Update OP reply count in feed data
      if (replyTo) {
        const parent = feedMessages.find(m => m.base36_id === replyTo);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
      }

      if (currentTab === 'feed') {
        renderFeed();
      } else {
        updateTabIndicator('feed');
        // Inline notification in chat (routed through toggle system)
        const f = msg.data;
        const t = new Date(f.created_at).getTime();
        if (!isNaN(t)) {
          const notifType = f.is_thread_op ? 'mop' : (f.is_op != null ? !!f.is_op : !f.reply_to) ? 'op' : 're'
          injectInlineNotif(notifType, {
            type: 'feed-post',
            base36_id: f.base36_id,
            feedUser: f.username || f.display_name || 'anon',
            text: f.content || '',
            color: f.user_color || '#fff',
            time: t,
            heat: f.heat || 0,
            reply_to: f.reply_to,
            emote_refs: f.emote_refs,
            is_op: f.is_op,
            is_thread_op: f.is_thread_op
          })
        }
      }
    }
    if (msg.type === 'dm_new' && msg.data) {
      handleIncomingDm(msg.data)
    }
    if (msg.type === 'youtube_chat_message') {
      const targetChannelId = msg.channelId
      // Dedup against message buffer (survives WS reconnects unlike 5s hash)
      if (targetChannelId && isYtDuplicate(msg.user, msg.text, targetChannelId)) return

      const ytMsg = {
        user: msg.user,
        text: msg.text,
        color: msg.color || '#ff0000',
        channel: 'youtube',
        time: msg.time,
        platform: 'youtube',
        emotes: msg.emotes || [],
        msgType: msg.msgType || 'text',
        amount: msg.amount || '',
        scColor: msg.scColor || '',
        sticker: msg.sticker || null,
        avatar: msg.avatar || undefined,
        badges: msg.badges || undefined,
        systemMsg: msg.systemMsg || undefined,
      }

      if (targetChannelId && targetChannelId !== 'global') {
        // Per-channel YouTube → route to that channel tab
        if (!channelYtMessages.has(targetChannelId)) channelYtMessages.set(targetChannelId, [])
        const buf = channelYtMessages.get(targetChannelId)
        buf.push(ytMsg)
        if (buf.length > MAX_BUFFER + 50) buf.splice(0, buf.length - MAX_BUFFER)
        if (currentTab === targetChannelId) {
          appendMessage(ytMsg, targetChannelId) || renderMessages(currentTab)
        } else {
          updateTabIndicator(targetChannelId)
        }
      }
    }
    if (msg.type === 'youtube_status') {
      const targetChannelId = msg.channelId
      if (targetChannelId && targetChannelId !== 'global') {
        // Per-channel YouTube status
        const link = youtubeLinks.get(targetChannelId) || { url: '', videoId: '', channelName: '' }
        if (msg.status === 'connected') {
          link.videoId = msg.videoId || ''
          link.channelName = msg.channelName || ''
          youtubeLinks.set(targetChannelId, link)
          log('YouTube connected for channel', targetChannelId, ':', link.channelName)
        }
        // Show status in channel tab if viewing it
        if (currentTab === targetChannelId) {
          const msgsEl = document.getElementById('hs-mc-messages')
          if (msgsEl && msg.status === 'connected' && !(channelYtMessages.get(targetChannelId)?.length)) {
            const el = document.createElement('div')
            el.className = 'hs-mc-empty'
            el.textContent = 'youtube connected: ' + (link.channelName || msg.videoId) + ' — waiting for messages...'
            msgsEl.appendChild(el)
            trimChildren(msgsEl, 150)
          } else if (msgsEl && (msg.status === 'ended' || msg.status === 'error')) {
            const el = document.createElement('div')
            el.className = 'hs-mc-empty'
            el.textContent = msg.status === 'ended' ? 'youtube stream ended' : (msg.error || 'youtube connection error')
            el.style.color = '#ff4444'
            msgsEl.appendChild(el)
            trimChildren(msgsEl, 150)
          }
        }
      }
    }
    if (msg.type === 'message-updated' && msg.data) {
      const uid = msg.data.base36_id;
      const idx = feedMessages.findIndex(m => m.base36_id === uid);
      if (idx >= 0) Object.assign(feedMessages[idx], msg.data);
      if (activeThread && activeThread.op && activeThread.op.base36_id === uid) {
        Object.assign(activeThread.op, msg.data);
      }
    }
    if (msg.type === 'notification:new') {
      unreadNotifCount++;
      updateNotifBadge();
    }
  });
}

// Update notif tab badge (reuse existing element to avoid DOM churn)
function updateNotifBadge() {
  if (!tabBarElement) return
  const tab = tabBarElement.querySelector('[data-tab="activity"]')
  if (!tab) return
  // Remove any legacy badge element
  const badge = tab.querySelector('.hs-badge')
  if (badge) badge.remove()
  // Just use color indicator — no counter
  tab.classList.toggle('has-new', unreadNotifCount > 0)
}

// ---- FEED ----

async function fetchFeed(append = false) {
  if (feedLoading) return;
  feedLoading = true;
  const page = append ? feedPage + 1 : 1;
  const resp = await apiFetch(`/api/messages?sort=time&limit=30&page=${page}&following=true`, { auth: true });
  feedLoading = false;
  if (!resp.ok) {
    console.error('[heatsync-mc] Feed fetch failed — full resp:', JSON.stringify(resp));
    if (currentTab === 'feed') {
      const msgsEl = document.getElementById('hs-mc-messages');
      if (msgsEl && feedMessages.length === 0) {
        msgsEl.innerHTML = `<div class="hs-mc-empty">failed to load feed${resp.status === 401 ? ' — log in at heatsync.org' : ''}</div>`;
      }
    }
    return;
  }
  const msgs = (resp.data?.messages || []).filter(m => m.username !== 'Anonymous')
  if (append) {
    feedMessages.push(...msgs);
    feedPage = page;
  } else {
    feedMessages = msgs;
    feedPage = 1;
  }
  feedHasMore = resp.data?.pagination?.hasMore ?? msgs.length >= 30;
  feedLoaded = true;
  feedLastFetch = Date.now();
  if (currentTab === 'feed') renderFeed();
}

function renderFeed() {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Update feed tab button text
  const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
  if (feedTabBtn) feedTabBtn.textContent = activeThread ? '<- back' : 'feed';

  // Thread view — show OP + replies
  if (activeThread) {
    renderThreadView(msgsEl);
    return;
  }

  // Feed list view
  const isStale = feedLoaded && (Date.now() - feedLastFetch > FEED_STALE_MS);
  if ((!feedLoaded || isStale) && !feedLoading) {
    msgsEl.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = 'loading following feed...';
    msgsEl.appendChild(loading);
    fetchFeed();
    return;
  }

  if (feedMessages.length === 0) {
    msgsEl.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'no posts yet';
    msgsEl.appendChild(empty);
    return;
  }

  isProgrammaticScroll = true;
  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();
  const feedToRender = feedMessages.slice(-150);
  let zebraCount = 0;
  for (const m of feedToRender) {
    const msgDiv = buildFeedMessageDiv(m);
    if (zebraEnabled && ++zebraCount % 2 === 0) msgDiv.classList.add('hs-mc-zebra');
    frag.appendChild(msgDiv);
  }
  if (feedHasMore) {
    const loader = document.createElement('div');
    loader.className = 'hs-mc-empty hs-feed-loader';
    loader.textContent = 'scroll for more...';
    frag.appendChild(loader);
  }
  msgsEl.appendChild(frag);

  isProgrammaticScroll = true;
  msgsEl.scrollTop = 0;
  requestAnimationFrame(() => { isProgrammaticScroll = false; });

  // Setup infinite scroll
  if (!msgsEl._hsFeedScroll) {
    msgsEl._hsFeedScroll = true;
    let feedScrollTimer = null
    msgsEl.addEventListener('scroll', () => {
      if (mcSignal?.aborted) return;
      if (currentTab !== 'feed' || feedLoading || !feedHasMore) return;
      if (feedScrollTimer) return // Throttle: one check per 200ms
      feedScrollTimer = cleanup.setTimeout(() => {
        feedScrollTimer = null
        const { scrollTop, scrollHeight, clientHeight } = msgsEl;
        if (scrollHeight - scrollTop - clientHeight < 100) {
          fetchFeed(true);
        }
      }, 200)
    });
  }
}

function buildFeedMessageDiv(m, opUsername) {
  const div = document.createElement('div');
  div.className = 'hs-feed-msg';
  div.dataset.msgId = m.base36_id;

  const time = formatRelativeTime(m.created_at);
  const avatarUrl = `https://heatsync.org/api/avatar/${encodeURIComponent(m.username)}`;
  const heat = m.heat || 0;
  const replies = m.reply_count || 0;
  // renderFeedContent sanitizes via escapeHtml + emote ref escaping
  const content = renderFeedContent(m.content, m.emote_refs);

  // Thread link: >>id — always expands thread inline (never navigates away)
  const shortId = (m.base36_id || '').replace(/^0+/, '') || '0';
  const threadLink = `<span class="hs-feed-thread-link hs-thread-toggle" style="cursor:pointer">&gt;&gt;${escapeHtml(shortId)}</span>`;

  // Post type tag: [OP] red = original post, [OP] magenta = OP replying in own thread, [RE] = reply
  const isOp = m.is_op != null ? !!m.is_op : (!m.reply_to || m.reply_to === '');
  const isThreadOp = !!m.is_thread_op;
  const typeTag = isThreadOp
    ? '<span class="hs-feed-tag hs-feed-tag-mop">[OP]</span>'
    : isOp
      ? '<span class="hs-feed-tag hs-feed-tag-op">[OP]</span>'
      : '<span class="hs-feed-tag hs-feed-tag-re">[RE]</span>';

  const isAnon = !m.platform || m.username === 'Anonymous';

  // Platform badge: [T]/[K]/[YT] (hidden for anonymous)
  const platLabel = m.platform === 'kick' ? '[K]' : m.platform === 'youtube' ? '[YT]' : m.platform === 'twitch' ? '[T]' : '';
  const platColors = { twitch: '#9146ff', kick: '#53fc18', youtube: '#ff0000' };
  const platBadge = platLabel ? `<span class="hs-feed-tag" style="color:${platColors[m.platform]}">${platLabel}</span>` : '';

  const timeHtml = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(time)}</span>` : '';

  // All dynamic values sanitized: avatarUrl via encodeURIComponent,
  // username/time via escapeHtml, color via sanitizeColor, content via renderFeedContent
  const hd = getHeatDisplay(heat)
  if (hd) {
    let rowStyle = `border-left:${hd.borderWidth}px solid ${hd.border};`
    if (hd.bg) rowStyle += `background:${hd.bg};`
    if (hd.breathe) div.className += ' hs-feed-heat-breathe'
    div.setAttribute('style', rowStyle)
  }
  const heatSpan = hd ? `<span class="hs-feed-stat hs-feed-heat" style="font-weight:700;color:${hd.color}${hd.glow ? ';text-shadow:0 0 8px #ff8700,0 0 16px rgba(255,135,0,0.6)' : ''}">${heat}${hd.suffix}</span>` : ''
  const repliesSpan = replies > 0 ? `<span class="hs-feed-stat hs-feed-replies" title="replies">💬${replies}</span>` : '';
  const stats = [heatSpan, repliesSpan].filter(Boolean).join(' ')
  const statsHtml = stats ? ` ${stats}` : ''

  const anonAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="https://heatsync.org/anon.webp" alt="" loading="lazy">` : '';
  const userAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="${avatarUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const userHtml = isAnon
    ? `${anonAvatar}<span class="hs-feed-user" style="color:#808080">Anonymous</span>`
    : `${userAvatar}<a href="https://heatsync.org/user/${encodeURIComponent(m.username)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml((m.username || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.user_color || '#fff')}">${escapeHtml(m.username || 'anon')}</a>`;

  div.innerHTML = `${timeHtml}${threadLink}${typeTag}${platBadge}${userHtml}${statsHtml}: <span class="hs-feed-body">${content}</span>`;

  // Click >>id to expand/collapse thread inline — never leaves the stream
  const threadLinkEl = div.querySelector('.hs-thread-toggle');
  if (threadLinkEl) {
    threadLinkEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleThread(m.base36_id);
    });
  }
  const repliesEl = div.querySelector('.hs-feed-replies');
  if (repliesEl && replies > 0) {
    repliesEl.style.cursor = 'pointer';
    repliesEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThread(m.base36_id);
    });
  }

  return div;
}

// Format text with markdown-style syntax (matches heatsync.org rendering)
// Must be called AFTER escapeHtml — operates on escaped HTML strings
function formatText(html) {
  // Greentext: >text< (escaped as &gt;text&lt;)
  html = html.replace(/(&gt;)([^<>&]+)(&lt;)/g, '<span class="hs-greentext">&gt;$2&lt;</span>')
  // Inline code: `text`
  html = html.replace(/`([^`]+)`/g, '<code class="hs-inline-code">$1</code>')
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  // Italic: *text* or _text_ (not if part of bold)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Spoilers: ||text||
  html = html.replace(/\|\|(.+?)\|\|/g, '<span class="hs-spoiler">$1</span>')
  return html
}

function renderFeedContent(content, emoteRefs) {
  if (!content) return '';
  let html = escapeHtml(String(content));
  // Text formatting (bold, italic, spoilers, etc.)
  html = formatText(html)
  // Linkify URLs BEFORE emote replacement (avoids corrupting img src attributes)
  // Split by HTML tags to only linkify text segments (like heatsync.org does)
  if (linksEnabled) {
    const parts = html.split(/(<[^>]+>)/)
    html = parts.map((part, i) => {
      if (i % 2 === 1) return part // skip HTML tags
      part = part.replace(/(https?:\/\/[^\s<"]+)/gi, '<a href="$1" target="_blank" rel="noopener" class="hs-mc-link">$1</a>')
      part = part.replace(/(?<!\/\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<"]*)/gi, (m) => {
        return `<a href="https://${m}" target="_blank" rel="noopener" class="hs-mc-link">${m}</a>`
      })
      return part
    }).join('')
  }
  // Render emote refs as inline images (AFTER linkification so img tags aren't corrupted)
  // emote_refs can be { name: url } or { name: { url, hash, name, provider } }
  if (emoteRefs && typeof emoteRefs === 'object') {
    for (const [name, val] of Object.entries(emoteRefs)) {
      const url = typeof val === 'string' ? val : val?.url
      if (!url) continue
      const escaped = escapeHtml(name);
      const safeUrl = escapeHtml(url);
      html = html.replace(
        new RegExp(`\\b${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
        `<img class="hs-mc-emote" src="${safeUrl}" alt="${escaped}" title="${escaped}" loading="lazy">`
      );
    }
  }
  return html;
}

function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  return formatRelativeMs(Date.now() - new Date(isoDate).getTime());
}

function formatRelativeMs(diff) {
  if (diff < 0) return 'now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTimeFromTs(ts) {
  if (!ts) return '';
  return formatRelativeMs(Date.now() - ts);
}

// Refresh timestamps every 30s — lightweight DOM-only update, no rebuild
cleanup.setInterval(() => {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;
  const now = Date.now();
  for (const el of msgsEl.querySelectorAll('.hs-mc-ts[data-ts]')) {
    const ts = parseInt(el.dataset.ts);
    if (ts) {
      const newText = formatRelativeMs(now - ts);
      if (el.textContent !== newText) el.textContent = newText;
    }
  }
}, 30000);

// Open thread view — replaces feed with OP + replies + reply input
async function openThread(msgId) {
  // Find OP in feed or fetch it
  let op = feedMessages.find(m => m.base36_id === msgId);
  activeThread = { id: msgId, op: op || null, replies: [], loading: true };
  renderFeed();

  const resp = await apiFetch(`/api/messages/${msgId}/replies`);
  if (resp.ok) {
    activeThread.replies = resp.data?.replies || [];
  }
  activeThread.loading = false;
  renderFeed();
}

function closeThread() {
  activeThread = null;
  renderFeed();
}

function toggleThread(msgId) {
  if (activeThread && activeThread.id === msgId) {
    closeThread();
  } else {
    openThread(msgId);
  }
}

// Render the thread view (OP + replies + back button)
function renderThreadView(msgsEl) {
  const t = activeThread;
  isProgrammaticScroll = true;
  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  // OP message
  if (t.op) {
    const opDiv = buildFeedMessageDiv(t.op);
    opDiv.classList.add('hs-thread-op');
    frag.appendChild(opDiv);
  }

  // Thread container with replies
  const container = document.createElement('div');
  container.className = 'hs-thread-container';
  container.dataset.thread = t.id;

  if (t.loading) {
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = 'loading...';
    loading.style.fontSize = '11px';
    container.appendChild(loading);
  } else if (t.replies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'no replies yet';
    empty.style.fontSize = '11px';
    container.appendChild(empty);
  } else {
    for (const r of t.replies) {
      const replyDiv = buildFeedMessageDiv(r, t.op?.username);
      replyDiv.classList.add('hs-thread-reply');
      if (r.is_thread_op) replyDiv.classList.add('is-thread-op');
      container.appendChild(replyDiv);
    }
  }
  frag.appendChild(container);
  msgsEl.appendChild(frag);

  isProgrammaticScroll = true;
  msgsEl.scrollTop = 0;
  requestAnimationFrame(() => { isProgrammaticScroll = false; });
}

async function postFeedMessage(text, { topLevel = false } = {}) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  if (!hsAuthToken) {
    if (wysiwygEnabled) {
      input.dataset.placeholder = 'log in at heatsync.org first';
    } else {
      input.placeholder = 'log in at heatsync.org first';
    }
    setTimeout(() => updateInputPlaceholder(), 2000);
    return;
  }

  const body = { content: text };
  // In thread view, global input posts as a reply to the active thread
  if (activeThread) {
    body.reply_to = activeThread.id;
  }

  const resp = await apiFetch('/api/messages', { method: 'POST', auth: true, body });
  if (resp.ok) {
    if (wysiwygEnabled) {
      input.innerHTML = '';
    } else {
      input.value = '';
    }
    pendingMessage = '';
    updateCharCount();
    hideInputBar();
    // Insert own post immediately from response (fetchFeed unreliable — service worker gets killed)
    const posted = resp.data?.message
    if (posted) {
      if (!feedMessages.some(f => f.base36_id === posted.base36_id)) {
        feedMessages.unshift(posted)
        if (feedMessages.length > 150) feedMessages.pop()
      }
      // If in thread view, append reply to the thread
      if (activeThread && activeThread.id === posted.reply_to) {
        if (!activeThread.replies.some(r => r.base36_id === posted.base36_id)) {
          activeThread.replies.push(posted)
        }
        // Update OP reply count
        if (activeThread.op) activeThread.op.reply_count = (activeThread.op.reply_count || 0) + 1;
        const parent = feedMessages.find(m => m.base36_id === activeThread.id);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
      }
    }
    if (currentTab === 'feed') renderFeed()
  } else {
    input.style.borderColor = '#f44';
    const errMsg = resp.status === 401 ? 'log in first'
      : resp.status === 429 ? 'slow down'
      : resp.status === 409 ? 'duplicate message'
      : 'failed to post';
    showToast(errMsg);
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    log('Post failed:', resp.status || resp.error);
  }
}

// ---- NOTIFICATIONS ----

async function fetchNotifications() {
  try {
    const resp = await apiFetch('/api/notifications');
    if (resp.ok) {
      notifications = resp.data || { mentions: 0, op_replies: 0, re_replies: 0, total: 0 };
      unreadNotifCount = notifications.total || 0;
      updateNotifBadge();
    } else if (resp.status === 401) {
      notifLoaded = true;
      return; // Not logged in
    }
    // Fetch actual notification messages (mentions, op replies, re replies)
    const msgResp = await apiFetch('/api/messages?filter_type=mentions&limit=20');
    if (msgResp.ok) {
      notifMessages = msgResp.data?.messages || [];
    }
  } catch (e) {
    log('Notification fetch error:', e);
  }
  notifLoaded = true;
}

function renderActivity() {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Hide resume button on initial render (shown only when new content arrives while scrolled)
  if (!isScrolledUp) {
    const newBtn = document.getElementById('hs-mc-new-msgs');
    if (newBtn) newBtn.style.display = 'none';
  }

  if (!hsAuthToken && activityEvents.length === 0) {
    msgsEl.innerHTML = '<div class="hs-mc-empty">log in at <a href="https://heatsync.org" target="_blank" style="color:#ff6b35">heatsync.org</a> to see activity</div>';
    return;
  }

  if (hsAuthToken && !notifLoaded) {
    msgsEl.innerHTML = '<div class="hs-mc-empty">loading...</div>';
    fetchNotifications().then(() => {
      if (currentTab === 'activity') renderActivity();
    });
    return;
  }

  // Mark notifs as read when viewing
  if (unreadNotifCount > 0) {
    apiFetch('/api/notifications/mark-read', { method: 'POST', body: { type: 'all' } });
    unreadNotifCount = 0;
    updateNotifBadge();
    try { chrome.runtime.sendMessage({ type: 'notifs_viewed' }); } catch (e) {}
  }

  // Merge notifMessages + activityEvents, sort descending by time
  const normalized = [
    ...notifMessages.map(m => ({ ...m, _time: new Date(m.created_at).getTime(), _src: 'notif' })),
    ...activityEvents.map(m => ({ ...m, _time: m.time, _src: 'event' }))
  ];
  normalized.sort((a, b) => b._time - a._time);
  const merged = normalized.slice(0, 150);

  if (merged.length === 0) {
    msgsEl.innerHTML = '<div class="hs-mc-empty">no activity yet</div>';
    return;
  }

  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  // Summary header (notifs only)
  if (notifications.total > 0) {
    const header = document.createElement('div');
    header.className = 'hs-notif-header';
    const parts = [];
    if (notifications.mentions > 0) parts.push(`${notifications.mentions} mention${notifications.mentions > 1 ? 's' : ''}`);
    if (notifications.op_replies > 0) parts.push(`${notifications.op_replies} OP repl${notifications.op_replies > 1 ? 'ies' : 'y'}`);
    if (notifications.re_replies > 0) parts.push(`${notifications.re_replies} RE repl${notifications.re_replies > 1 ? 'ies' : 'y'}`);
    header.textContent = parts.join(', ');
    frag.appendChild(header);
  }

  for (const m of merged) {
    if (m._src === 'event') {
      const div = document.createElement('div');
      div.className = `hs-mc-stream-event ${m.eventClass || ''}`;
      const ts = formatRelativeMs(Date.now() - m.time);
      const tsSpan = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(ts)}</span>` : '';
      // Show channel name in magenta for activity context
      // Strip [channel] prefix from follow events (we add our own #channel)
      let evtText = m.text
      if (m.channel) evtText = evtText.replace(new RegExp(`^\\[${m.channel}\\]\\s*`), '')
      const chanColor = _profileCache.get(m.channel?.toLowerCase())?.profile?.twitch_color || '#fff';
      const chanLabel = m.channel ? `<a href="https://heatsync.org/twitch/${encodeURIComponent(m.channel)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml(m.channel.toLowerCase())}" style="color:${sanitizeColor(chanColor)};font-weight:bold">${escapeHtml(m.channel)}</a> ` : '';
      let evtHtml = escapeHtml(evtText)
      evtHtml = evtHtml.replace(/(switched to |went live \u2014 )(.+)$/, '$1<span style="color:#fff">$2</span>')
      div.innerHTML = `${tsSpan}${chanLabel}${evtHtml}`;
      frag.appendChild(div);
    } else {
      frag.appendChild(buildNotifDiv(m));
    }
  }
  msgsEl.appendChild(frag);
}

function buildNotifDiv(m) {
  const div = document.createElement('div');
  div.className = 'hs-notif';
  const time = formatRelativeTime(m.created_at);
  // Safe: renderFeedContent escapes via escapeHtml first, then adds safe formatting tags
  const content = renderFeedContent(m.content, m.emote_refs);

  // Safe: username through escapeHtml+encodeURIComponent, time through escapeHtml, content through renderFeedContent (which escapes via escapeHtml then adds safe formatting)
  const tsHtml = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(time)}</span>` : '';
  div.innerHTML = `${tsHtml}<a href="https://heatsync.org/user/${encodeURIComponent(m.username)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml((m.username || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.user_color || '#fff')}">${escapeHtml(m.username || 'anon')}</a>: <span class="hs-feed-body">${content}</span>`;

  // Click to switch to feed and show this thread (but not if clicking interactive content)
  div.addEventListener('click', (e) => {
    const spoiler = e.target.closest('.hs-spoiler')
    if (spoiler) { spoiler.classList.toggle('revealed'); return }
    if (e.target.closest('a, .hs-mc-emote, .hs-mc-link')) return
    const threadId = m.reply_to || m.base36_id;
    switchTab('feed');
    openThread(threadId);
  });

  return div;
}



// --- multichat/whispers.js ---
// Whispers — unified chronological timeline of all whispers + DMs

const whisperTimeline = [] // { user, text, color, time, self, platform, key }
const whisperUsers = new Map() // key → { platform, userId, displayName, color }
let lastWhisperKey = null // for /r — last person involved in a whisper
let whisperTotalUnread = 0
let whisperLastViewedTime = 0
let whisperDmsLoaded = false
let selfWhisperColor = null // current user's Twitch color

// Resolve own color from IRC buffers, chat DOM, or Twitch cookie color
function resolveSelfColor() {
  if (selfWhisperColor) return
  const me = (currentUsername || '').toLowerCase()
  if (!me) return
  // Check IRC message buffers for our own messages (they contain our color)
  if (typeof irc !== 'undefined' && irc?.channels) {
    for (const [, buf] of irc.channels) {
      const msgs = buf.getAll ? buf.getAll() : []
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].user?.toLowerCase() === me && msgs[i].color) {
          selfWhisperColor = msgs[i].color
          return
        }
      }
    }
  }
  // Check DOM for our username color
  try {
    const el = document.querySelector(`.chat-author__display-name[data-a-user="${me}"]`)
    if (el) { selfWhisperColor = el.style.color || getComputedStyle(el).color; return }
  } catch {}
}

let _whisperSaveTimer = null
function whisperSaveDebounced() {
  if (_whisperSaveTimer) clearTimeout(_whisperSaveTimer)
  _whisperSaveTimer = setTimeout(saveWhispers, 500)
}

function saveWhispers() {
  const users = {}
  for (const [key, u] of whisperUsers) users[key] = u
  try {
    chrome.storage.local.set({
      hs_whispers_v2: {
        timeline: whisperTimeline.slice(-200),
        users,
        lastKey: lastWhisperKey,
        lastViewed: whisperLastViewedTime
      }
    })
  } catch {}
}

function loadWhispers() {
  try {
    chrome.storage.local.get(['hs_whispers_v2', 'hs_whispers']).then(stored => {
      // Load v2 format (timeline)
      const data = stored.hs_whispers_v2
      if (data) {
        if (Array.isArray(data.timeline)) {
          for (const msg of data.timeline) {
            if (!whisperTimeline.some(m => m.time === msg.time && m.text === msg.text)) {
              whisperTimeline.push(msg)
            }
          }
        }
        if (data.users) {
          for (const [key, u] of Object.entries(data.users)) {
            if (!whisperUsers.has(key)) whisperUsers.set(key, u)
          }
        }
        if (data.lastKey) lastWhisperKey = data.lastKey
        if (data.lastViewed) whisperLastViewedTime = data.lastViewed
      }

      // Migrate v1 format (per-conversation) into timeline
      const v1 = stored.hs_whispers
      if (v1 && typeof v1 === 'object' && !v1.timeline) {
        for (const [key, conv] of Object.entries(v1)) {
          if (!conv || !conv.msgs) continue
          whisperUsers.set(key, {
            platform: conv.platform || (key.startsWith('hs:') ? 'heatsync' : 'twitch'),
            userId: conv.userId,
            displayName: conv.displayName,
            color: conv.color || '#fff'
          })
          for (const m of conv.msgs) {
            if (whisperTimeline.some(e => e.time === m.time && e.text === m.text)) continue
            whisperTimeline.push({
              user: m.self ? 'you' : m.user,
              text: m.text,
              color: m.color || '#fff',
              time: m.time,
              self: !!m.self,
              platform: conv.platform || (key.startsWith('hs:') ? 'heatsync' : 'twitch'),
              key
            })
          }
        }
        whisperTimeline.sort((a, b) => a.time - b.time)
        if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
        // Clean up v1
        try { chrome.storage.local.remove('hs_whispers') } catch {}
        whisperSaveDebounced()
      }

      whisperTotalUnread = whisperTimeline.filter(m => !m.self && m.time > whisperLastViewedTime).length
      updateWhisperBadge()
    }).catch(() => {})
  } catch {}
}

function updateWhisperBadge() {
  if (!tabBarElement) return
  const tab = tabBarElement.querySelector('[data-tab="whispers"]')
  if (tab) tab.classList.toggle('has-new', whisperTotalUnread > 0)
}

function handleIncomingWhisper(msg) {
  const key = `twitch:${msg.user.toLowerCase()}`
  whisperUsers.set(key, {
    platform: 'twitch',
    userId: msg.userId,
    displayName: msg.user,
    color: msg.color
  })

  whisperTimeline.push({
    user: msg.user,
    text: msg.text,
    color: msg.color,
    time: msg.time,
    self: false,
    platform: 'twitch',
    key
  })
  if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
  lastWhisperKey = key

  if (currentTab === 'whispers') {
    whisperLastViewedTime = Date.now()
    renderWhispersTab()
  } else {
    whisperTotalUnread++
    updateWhisperBadge()
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: msg.user,
      text: msg.text,
      color: msg.color,
      time: msg.time,
      platform: 'twitch'
    })
  }
  whisperSaveDebounced()
}

function handleIncomingDm(data) {
  const key = `hs:${data.from_user_id}`
  whisperUsers.set(key, {
    platform: 'heatsync',
    userId: data.from_user_id,
    displayName: data.from_display_name,
    color: data.from_color || '#ff8700'
  })

  const time = data.created_at ? new Date(data.created_at).getTime() : Date.now()
  whisperTimeline.push({
    user: data.from_display_name,
    text: data.content,
    color: data.from_color || '#ff8700',
    time,
    self: false,
    platform: 'heatsync',
    key
  })
  if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
  lastWhisperKey = key

  if (currentTab === 'whispers') {
    whisperLastViewedTime = Date.now()
    renderWhispersTab()
  } else {
    whisperTotalUnread++
    updateWhisperBadge()
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: data.from_display_name,
      text: data.content,
      color: data.from_color || '#ff8700',
      time,
      platform: 'heatsync'
    })
  }
  whisperSaveDebounced()
}

// Send Twitch whisper via heatsync server (Helix proxy — bypasses CORS + Kasada)
async function sendTwitchWhisper(toUserId, message) {
  try {
    const resp = await apiFetch('/api/twitch/whisper', {
      method: 'POST',
      body: { toUserId, message }
    })
    if (resp?.ok) return { ok: true }
    return { ok: false, error: resp?.error || 'unknown error' }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

async function sendWhisperMessage(key, text) {
  const userInfo = whisperUsers.get(key)
  if (!userInfo) { showToast('unknown user — whisper someone first'); return }

  // Optimistic: show message immediately
  whisperTimeline.push({
    user: 'you',
    text,
    color: '#aaa',
    time: Date.now(),
    self: true,
    platform: userInfo.platform,
    key
  })
  if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
  lastWhisperKey = key

  if (currentTab === 'whispers') renderWhispersTab()
  whisperSaveDebounced()

  if (key.startsWith('twitch:')) {
    try {
      const resp = await sendTwitchWhisper(userInfo.userId, text)
      if (!resp.ok) {
        log('Whisper send failed:', resp.error)
        showToast('whisper failed: ' + resp.error)
      }
    } catch (e) {
      log('Whisper send failed:', e.message)
      showToast('whisper failed: ' + e.message)
    }
  } else if (key.startsWith('hs:')) {
    const toUserId = key.slice(3)
    const resp = await apiFetch('/api/dm', {
      method: 'POST',
      body: { toUserId, content: text }
    })
    if (!resp.ok) {
      log('DM send failed:', resp.error)
      showToast('dm failed: ' + (resp.error || 'unknown error'))
    }
  }
}

function renderWhispersTab() {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl) return
  resolveSelfColor()

  // Fetch HS DMs on first render to backfill timeline
  if (!whisperDmsLoaded && hsAuthToken) {
    whisperDmsLoaded = true
    apiFetch('/api/dm').then(resp => {
      if (!resp.ok || !Array.isArray(resp.data)) return
      for (const dm of resp.data) {
        const key = `hs:${dm.other_user_id}`
        whisperUsers.set(key, {
          platform: 'heatsync',
          userId: dm.other_user_id,
          displayName: dm.other_display_name,
          color: dm.other_color || '#ff8700'
        })
        // Fetch recent messages for each conversation
        apiFetch(`/api/dm/${dm.other_user_id}`).then(resp2 => {
          if (!resp2.ok || !Array.isArray(resp2.data)) return
          let added = false
          for (const m of resp2.data) {
            const t = new Date(m.created_at).getTime()
            if (whisperTimeline.some(e => Math.abs(e.time - t) < 1000 && e.text === m.content && e.platform === 'heatsync')) continue
            const isSelf = m.from_user_id !== dm.other_user_id
            whisperTimeline.push({
              user: isSelf ? 'you' : dm.other_display_name,
              text: m.content,
              color: isSelf ? '#aaa' : (dm.other_color || '#ff8700'),
              time: t,
              self: isSelf,
              platform: 'heatsync',
              key
            })
            added = true
          }
          if (added) {
            whisperTimeline.sort((a, b) => a.time - b.time)
            if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
            if (currentTab === 'whispers') renderWhispersTab()
            whisperSaveDebounced()
          }
        })
      }
    })
  }

  // Mark as read
  whisperLastViewedTime = Date.now()
  whisperTotalUnread = 0
  updateWhisperBadge()
  whisperSaveDebounced()

  if (whisperTimeline.length === 0) {
    // All dynamic values below are string literals — safe innerHTML
    msgsEl.innerHTML = '<div class="hs-mc-empty">/w user msg \u00b7 /dm user msg \u00b7 /r msg</div>'
    return
  }

  msgsEl.textContent = ''
  const frag = document.createDocumentFragment()
  const toRender = whisperTimeline.slice(-150)
  let zebraCount = 0

  for (const m of toRender) {
    const div = document.createElement('div')
    div.className = m.self ? 'hs-mc-msg hs-whisper-self' : 'hs-mc-msg'
    if (zebraEnabled && ++zebraCount % 2 === 0) div.classList.add('hs-mc-zebra')

    const ts = formatTimeFromTs(m.time)
    const tsHtml = ts ? `<span class="hs-mc-ts" data-ts="${m.time}">${ts}</span>` : ''
    const platColor = m.platform === 'twitch' ? '#9146ff' : '#ff8700'
    const platTag = m.platform === 'twitch' ? 'T' : 'HS'
    const arrow = m.self ? '\u2192' : '\u2190'

    // Show sender -> recipient for both directions
    const target = whisperUsers.get(m.key)
    const me = currentUsername || 'you'
    const myColor = sanitizeColor(selfWhisperColor || '#fff')
    const them = target?.displayName || m.user || m.key
    const theirColor = target ? sanitizeColor(target.color) : sanitizeColor(m.color)
    const theirUsername = (target?.displayName || m.user || '').toLowerCase()

    // Build username links with hs-mc-user class for tooltip + click
    function userLink(name, color, username) {
      const safe = escapeHtml(name)
      const safeUser = escapeHtml(username.toLowerCase())
      const href = m.platform === 'heatsync'
        ? `https://heatsync.org/user/${encodeURIComponent(username)}`
        : `https://heatsync.org/twitch/${encodeURIComponent(username)}`
      return `<a href="${href}" target="_blank" class="hs-mc-user" data-username="${safeUser}" style="color:${color};font-weight:600">${safe}</a>`
    }

    const senderLink = m.self ? userLink(me, myColor, me) : userLink(them, theirColor, theirUsername)
    const recipientLink = m.self ? userLink(them, theirColor, theirUsername) : userLink(me, myColor, me)

    // All dynamic values pass through escapeHtml/sanitizeColor — safe innerHTML (all values escaped above)
    div.innerHTML = `${tsHtml}<span style="color:${platColor};font-size:10px;font-weight:700">[${platTag}]</span> ${senderLink} <span style="color:#666">-&gt;</span> ${recipientLink}: ${processEmotes(escapeHtml(m.text), null)}`
    frag.appendChild(div)
  }

  msgsEl.appendChild(frag)
  msgsEl.scrollTop = msgsEl.scrollHeight
}


// --- multichat/input.js ---
// Input - chat input, autocomplete, send message, reply state

// Cache own badge string from IRC messages for optimistic display
let _ownBadges = ''

// Echo dedup — suppress own message echoes from IRC/KickChat relay
// Uses a Set of {text, time} to handle rapid sends without overwriting
const _recentSentMessages = []
const SENT_DEDUP_WINDOW = 10000 // 10s

function trackSentMessage(text) {
  _recentSentMessages.push({ text, time: Date.now() })
  // Prune old entries
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  while (_recentSentMessages.length > 0 && _recentSentMessages[0].time < cutoff) {
    _recentSentMessages.shift()
  }
}

function isSentEcho(msgText) {
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  for (let i = _recentSentMessages.length - 1; i >= 0; i--) {
    const entry = _recentSentMessages[i]
    if (entry.time < cutoff) break
    if (entry.text === msgText) {
      // Dual-send only: first echo displays, second is suppressed
      entry.suppressed = (entry.suppressed || 0) + 1
      if (entry.suppressed >= 2) {
        _recentSentMessages.splice(i, 1)
        return true
      }
      return false
    }
  }
  return false
}

// Autocomplete state (Tab-only cycling, no dropdown)
let acState = {
matches: [],
index: 0,
active: false,  // true when cycling through matches
wordStart: 0,   // Position where the completion word starts
afterText: ''   // Text after the completion
};
function rebuildInput() {
  const bar = document.getElementById('hs-mc-inputbar');
  if (!bar) return;

  // Save current text
  const oldInput = document.getElementById('hs-mc-input');
  const savedText = oldInput ? getInputText() : pendingMessage;

  // Remove old input
  if (oldInput) oldInput.remove();

  // Create new input element
  const emoteBtn = bar.querySelector('#hs-mc-emote-btn');
  if (wysiwygEnabled) {
    const div = document.createElement('div');
    div.id = 'hs-mc-input';
    div.contentEditable = 'true';
    div.setAttribute('data-placeholder', 'send a message...');
    div.spellcheck = false;
    if (emoteBtn) bar.insertBefore(div, emoteBtn);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'hs-mc-input';
    input.placeholder = 'send a message...';
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (emoteBtn) bar.insertBefore(input, emoteBtn);
  }

  // Restore text and reinit
  const newInput = document.getElementById('hs-mc-input');
  if (newInput && savedText) {
    if (wysiwygEnabled) {
      newInput.textContent = savedText;
    } else {
      newInput.value = savedText;
    }
  }
  initInput();
  updateCharCount();
}

/**
 * Create unified input bar - ALWAYS visible, text persists across tabs
 */
function createInputBar() {
  const bar = document.createElement('div');
  bar.id = 'hs-mc-inputbar';
  const iconUrl = chrome.runtime.getURL('icon-48.png');
  const iconBlackUrl = chrome.runtime.getURL('icon-48-black.png');

  const inputHtml = wysiwygEnabled
    ? `<div id="hs-mc-input" contenteditable="true" data-placeholder="send a message..." spellcheck="false"></div>`
    : `<input type="text" id="hs-mc-input" placeholder="send a message..." autocomplete="off" spellcheck="false">`;

  bar.innerHTML = `
    ${inputHtml}
    <button id="hs-mc-emote-btn"><img src="${iconUrl}" data-src="${iconUrl}" data-src-black="${iconBlackUrl}" alt="hs"></button>
  `;

  // Initialize input after DOM insertion
  setTimeout(() => {
    initInput();
    const btn = bar.querySelector('#hs-mc-emote-btn');
    const img = btn?.querySelector('img');
    if (btn && img) {
      btn.addEventListener('mouseenter', () => { img.src = img.dataset.srcBlack })
      btn.addEventListener('mouseleave', () => { img.src = img.dataset.src })
    }
  }, 0);
  return bar;
}
// Get text from input (handles both input and contenteditable)
function getInputText() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return '';
  if (wysiwygEnabled) {
    // Convert emote images, stacks, and cycling spans back to text
    let text = '';
    const extractNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
        text += node.dataset.emoteName || node.alt || ''
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-input-stack')) {
        // Stack: extract each child emote name, space-separated
        for (const child of node.children) {
          if (child.tagName === 'IMG') {
            if (text && !text.endsWith(' ')) text += ' '
            text += child.dataset.emoteName || child.alt || ''
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += node.textContent || ''
      }
    }
    for (const node of input.childNodes) extractNode(node)
    return text.replace(/\u00A0/g, ' ');
  }
  return input.value || '';
}
function initInput() {
  const input = document.getElementById('hs-mc-input');
  const sendBtn = document.getElementById('hs-mc-send');
  log('🎯 initInput called, input found:', !!input);
  if (!input) {
    log('❌ Input not found in DOM yet, retrying...');
    setTimeout(initInput, 100);
    return;
  }
  // Mark input as initialized to avoid duplicate handlers
  if (input._hsInitialized) {
    log('⚠️ Input already initialized');
    return;
  }
  input._hsInitialized = true;
  log('✅ Initializing input handlers, WYSIWYG:', wysiwygEnabled);

  // Restore pending message
  if (pendingMessage) {
    if (wysiwygEnabled) {
      input.textContent = pendingMessage;
    } else {
      input.value = pendingMessage;
    }
  }

  input.addEventListener('keydown', handleInputKeydown);
  input.addEventListener('input', handleInputChange);
  input.addEventListener('input', updateCharCount);
  // Sync highlight overlay scroll with input scroll
  input.addEventListener('scroll', () => {
    const hl = document.getElementById('hs-mc-input-highlight');
    if (hl) hl.scrollLeft = input.scrollLeft;
  });
  input.addEventListener('input', () => {
    const hasText = (input.value || input.textContent || '').trim().length > 0
    if (hasText) showInputBar()
    else hideInputBar()
  });
  input.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 150)
    // Hide input bar after blur if empty (delay to allow click-to-emote-picker)
    // Skip if window lost focus — prevents hiding when switching apps
    setTimeout(() => { if (document.hasFocus()) hideInputBar() }, 200)
  });
  sendBtn?.addEventListener('click', sendMessage);

  // WYSIWYG: handle paste to strip formatting
  if (wysiwygEnabled) {
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      if (!document.execCommand('insertText', false, text)) {
        // Fallback: insert via Selection/Range API
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  }

  // Initialize character counter
  updateCharCount();

  // Emote picker button (includes twitch features in tabs)
  const emoteBtn = document.getElementById('hs-mc-emote-btn');
  if (emoteBtn && !emoteBtn._hsInitialized) {
    emoteBtn._hsInitialized = true;
    emoteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const picker = document.getElementById('hs-mc-emote-picker');
      if (picker?.classList.contains('visible')) {
        picker.classList.remove('visible');
        adjustOverlayForPicker(false);
        hideInputBar();
        if (_pickerCloseHandler) {
          document.removeEventListener('click', _pickerCloseHandler);
          _pickerCloseHandler = null;
        }
      } else {
        showEmotePicker();
      }
    });
  }

  // Update placeholder based on current tab
  updateInputPlaceholder();

  // Global Tab key to focus input from anywhere
  if (!window._hsMcTabHandler) {
    window._hsMcTabHandler = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (currentTab === 'add') return;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;

      // If not already in our input, reveal bar and focus it
      if (document.activeElement !== input) {
        e.preventDefault();
        showInputBar();
        input.focus();
      }
    }, { capture: true, signal: mcSignal });
  }

  // Auto-reveal input bar when user starts typing anywhere
  if (!window._hsMcTypeRevealHandler) {
    window._hsMcTypeRevealHandler = true
    document.addEventListener('keydown', (e) => {
      if (inputBarVisible) return
      if (currentTab === 'add') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal focus from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      // Only printable chars — skip modifiers, nav, function keys
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length !== 1) return
      showInputBar()
      input.focus()
      // Character will flow into the now-focused input naturally
    }, { signal: mcSignal })

    // Catch paste when input bar is hidden — reveal bar and insert text
    document.addEventListener('paste', (e) => {
      if (inputBarVisible) return
      if (currentTab === 'add') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal paste from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      const text = e.clipboardData?.getData('text/plain')
      if (!text) return
      e.preventDefault()
      showInputBar()
      input.focus()
      // Insert pasted text into the input
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        input.value = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        document.execCommand('insertText', false, text)
      }
    }, { signal: mcSignal })
  }

  // Helper: find emote wrapper or img from event target
  function findEmoteTarget(target) {
    // Check wrapper first (our emotes)
    const wrapper = target.closest('.hs-mc-emote-wrapper');
    if (wrapper) {
      return {
        wrapper,
        emoteName: wrapper.dataset.emoteName || wrapper.querySelector('img')?.alt || 'emote',
        state: wrapper.dataset.state || 'global',
        emoteUrl: wrapper.dataset.emoteUrl || wrapper.querySelector('img')?.src || '',
        source: wrapper.dataset.source || 'unknown'
      };
    }
    // Fallback: direct IMG (Twitch/7TV/BTTV native emotes, picker emotes)
    if (target.tagName === 'IMG' && !target.classList.contains('hs-mc-badge-img') && (
      target.classList.contains('hs-mc-emote') ||
      target.classList.contains('hs-mc-picker-emote') ||
      target.classList.contains('chat-line__message--emote') ||
      target.classList.contains('chat-image') ||
      target.src?.includes('7tv.app') ||
      target.src?.includes('betterttv.net') ||
      (target.src?.includes('frankerfacez') && !target.src?.includes('room-badge/')) ||
      target.src?.includes('static-cdn.jtvnw.net/emoticons')
    )) {
      return {
        wrapper: null,
        emoteName: target.alt || target.dataset.emoteName || target.title?.split(' ')[0] || 'emote',
        state: target.dataset.state || 'global',
        emoteUrl: target.src || '',
        source: target.dataset.source || 'unknown'
      };
    }
    return null;
  }

  // Global right-click handler for ALL emotes
  if (!window._hsMcEmoteContextHandler) {
    window._hsMcEmoteContextHandler = true;
    document.addEventListener('contextmenu', (e) => {
      // Stack expand on right-click
      const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)');
      if (collapsedStack) {
        e.preventDefault();
        e.stopPropagation();
        collapsedStack.classList.add('expanded');
        collapsedStack.removeAttribute('title');
        return;
      }

      const emoteInfo = findEmoteTarget(e.target);
      if (!emoteInfo) return;
      log('Emote right-click:', emoteInfo.emoteName, emoteInfo.state);

      e.preventDefault();
      e.stopPropagation();

      const { emoteName, state } = emoteInfo;

      if (state === 'blocked') {
        // Blocked → unblock + yellow flash
        unblockEmote(emoteName);
      } else if (state === 'owned') {
        // Owned → remove from inventory + white flash
        removeEmoteFromInventory(emoteName, e.target);
      } else {
        // Global or unadded → block + red flash
        blockEmote(emoteName);
      }
    }, { capture: true, signal: mcSignal });
  }

  // Global left-click handler for ALL emotes
  if (!window._hsMcEmoteClickHandler) {
    window._hsMcEmoteClickHandler = true;
    document.addEventListener('click', (e) => {
      // Stack collapse button
      if (e.target.closest('.hs-mc-stack-collapse')) {
        e.preventDefault();
        e.stopPropagation();
        const stack = e.target.closest('.hs-mc-emote-stack');
        if (stack) {
          stack.classList.remove('expanded');
          stack.setAttribute('title', 'expand');
        }
        return;
      }
      // Stack block-all button
      if (e.target.closest('.hs-mc-stack-block-all')) {
        e.preventDefault();
        e.stopPropagation();
        const stack = e.target.closest('.hs-mc-emote-stack');
        if (stack) blockAllEmotesInStack(stack);
        return;
      }
      // Collapsed stack left-click → paste all emote names to input
      const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)');
      if (collapsedStack) {
        e.preventDefault();
        e.stopPropagation();
        const names = [...collapsedStack.querySelectorAll('.hs-mc-emote-wrapper[data-emote-name]')]
          .map(w => w.dataset.emoteName)
          .filter(Boolean);
        if (names.length > 0) {
          showInputBar();
          for (const name of names) pasteEmoteToInput(name);
          const input = document.getElementById('hs-mc-input');
          if (input) input.focus();
          flashAllEmotes(names[0], 'hs-flash-paste');
        }
        return;
      }

      const emoteInfo = findEmoteTarget(e.target);
      if (!emoteInfo) return;

      e.preventDefault();
      e.stopPropagation();

      const { emoteName, state, emoteUrl, source } = emoteInfo;

      if (state === 'blocked') {
        // Blocked → unblock + yellow flash
        unblockEmote(emoteName);
      } else if (state === 'owned' || state === 'global' || state === 'channel') {
        // Owned, global, or channel → paste to input + white flash
        showInputBar();
        pasteEmoteToInput(emoteName);
        const input = document.getElementById('hs-mc-input');
        if (input) input.focus();
        flashAllEmotes(emoteName, 'hs-flash-paste');
      } else if (state === 'unadded') {
        // Unadded → add to inventory + green flash
        addEmoteToInventory(emoteName, emoteUrl, source, e.target);
        flashAllEmotes(emoteName, 'hs-flash-add');
      }
    }, { capture: true, signal: mcSignal });
  }

  // Spoiler click → toggle revealed
  if (!window._hsMcSpoilerHandler) {
    window._hsMcSpoilerHandler = true
    document.addEventListener('click', (e) => {
      const spoiler = e.target.closest('.hs-spoiler')
      if (!spoiler) return
      e.stopPropagation()
      spoiler.classList.toggle('revealed')
    }, { signal: mcSignal })
  }

  // Reply button click → set reply state and focus input
  if (!window._hsMcReplyHandler) {
    window._hsMcReplyHandler = true
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.hs-mc-reply-btn')
      if (!btn) return
      const msg = btn.closest('.hs-mc-msg')
      if (!msg?.dataset.msgId) return
      setReplyState({
        msgId: msg.dataset.msgId,
        user: msg.dataset.msgUser,
        channel: msg.dataset.msgChannel
      })
    }, { signal: mcSignal })
  }

  // Right-click on message → mute/unmute user
  if (!window._hsMcMsgContextHandler) {
    window._hsMcMsgContextHandler = true;
    document.addEventListener('contextmenu', (e) => {
      const msg = e.target.closest('.hs-mc-msg');
      if (!msg) return;
      // Don't intercept if clicking an emote (let emote handler handle it)
      if (findEmoteTarget(e.target)) return;

      e.preventDefault();
      const userEl = msg.querySelector('.hs-mc-user');
      const username = userEl?.textContent?.trim()?.toLowerCase();
      if (!username) return;

      if (mutedUsers.has(username)) {
        mutedUsers.delete(username);
        showToast(`unmuted ${username}`);
      } else {
        mutedUsers.add(username);
        showToast(`muted ${username}`);
      }
      chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] });
      renderMessages(currentTab);
    }, { signal: mcSignal });
  }
}
function applyMcMutes() {
  document.querySelectorAll('.hs-mc-msg').forEach(msg => {
    const userEl = msg.querySelector('.hs-mc-user');
    const username = userEl?.textContent?.trim()?.toLowerCase();
    if (username && mutedUsers.has(username)) {
      stripMcMutedMessage(msg);
    } else {
      msg.classList.remove('hs-mc-muted');
    }
  });
}
function stripMcMutedMessage(msg) {
  msg.classList.add('hs-mc-muted');
  // Message content is raw text nodes on the div — CSS can't hide those
  [...msg.childNodes].forEach(node => {
    if (node.nodeType === 3) node.textContent = '';
  });
  // Remove emote images and other content (not user/badge/timestamp/platform)
  msg.querySelectorAll('img:not(.hs-mc-badge-img), .heatsync-emote-wrapper, .hs-mc-emote').forEach(el => {
    if (!el.closest('.hs-mc-user') && !el.classList.contains('hs-mc-badge-img') && !el.classList.contains('hs-mc-platform-badge')) {
      el.remove();
    }
  });
}

function updateInputPlaceholder() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  let placeholder;
  if (currentTab === 'feed') {
    placeholder = 'post to heatsync...';
  } else if (currentTab === 'live') {
    const channel = getLiveChannel();
    placeholder = channel ? `send to #${channel}` : 'send a message...';
  } else if (currentTab === 'mentions') {
    const channel = getCurrentChannel();
    placeholder = channel ? `send to #${channel}` : 'send a message...';
  } else if (currentTab === 'whispers') {
    const lastUser = lastWhisperKey ? whisperUsers.get(lastWhisperKey) : null
    placeholder = lastUser ? `/r to reply to ${lastUser.displayName}` : '/w user msg · /dm user msg'
  } else if (currentTab === 'add') {
    placeholder = '';
  } else {
    // Channel tab — resolve twitch name for placeholder
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab);
    const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
    placeholder = twitchName ? `send to #${twitchName}` : `send to #${currentTab}`;
  }

  if (wysiwygEnabled) {
    input.dataset.placeholder = placeholder;
  } else {
    input.placeholder = placeholder;
  }
}
function handleInputKeydown(e) {
  const input = e.target;

  // Tab - cycle through emote completions
  if (e.key === 'Tab') {
    e.preventDefault();

    if (acState.active && acState.matches.length > 0) {
      // Already cycling - next (Tab) or previous (Shift+Tab)
      const len = acState.matches.length;
      acState.index = (acState.index + (e.shiftKey ? len - 1 : 1)) % len;
      insertCompletionKeepOpen(acState.matches[acState.index]);
      showCycleTooltip();
    } else {
      // First Tab - find matches
      const word = getCurrentWord(input);
      if (word.length >= 2) {
        const matches = findEmoteMatches(word);
        if (matches.length > 0) {
          // Save state for cycling (WYSIWYG handles positions internally)
          acState.matches = matches;
          acState.index = 0;
          acState.active = true;

          if (!wysiwygEnabled && input.value !== undefined) {
            // Calculate positions for text input cycling (textarea only)
            const text = input.value;
            const pos = input.selectionStart;
            const before = text.slice(0, pos);
            const wordStart = before.search(/\S+$/);
            acState.wordStart = wordStart >= 0 ? wordStart : pos;
            // Skip past rest of word after cursor
            let wordEnd = pos;
            while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++;
            acState.afterText = text.slice(wordEnd);
          }

          insertCompletionKeepOpen(matches[0]);
          showCycleTooltip();
        }
      }
    }
    return;
  }

  // Any other key resets autocomplete cycling (ignore modifier keys)
  if (acState.active && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
    hideAutocomplete();
  }

  // Enter - send message
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
    return;
  }

  // Escape - cancel reply state and hide autocomplete
  if (e.key === 'Escape') {
    if (replyState) clearReplyState()
    hideAutocomplete();
    return;
  }
}

function handleInputChange(e) {
  // Save pending message (persists across tab switches)
  pendingMessage = getInputText();

  // Reset autocomplete cycling on any text change
  if (acState.active) {
    hideAutocomplete();
  }

  // Live emoji conversion in contenteditable: :shortcode: → emoji span
  if (wysiwygEnabled && _emojiMap.size > 0) {
    const input = document.getElementById('hs-mc-input')
    if (input?.isContentEditable) {
      const sel = window.getSelection()
      if (!sel?.rangeCount) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node?.nodeType !== Node.TEXT_NODE) return
      const text = node.textContent
      const cursorOffset = range.startOffset
      // Look for :shortcode: ending at cursor
      const before = text.slice(0, cursorOffset)
      const match = before.match(/:([a-z0-9_]+):$/)
      if (match) {
        const emoji = _emojiMap.get(match[1])
        if (emoji) {
          const start = cursorOffset - match[0].length
          // Replace the :shortcode: text with emoji span
          const span = document.createElement('span')
          span.className = 'hs-mc-emoji'
          span.textContent = emoji
          span.title = ':' + match[1] + ':'
          span.setAttribute('data-emoji-name', match[1])
          const beforeNode = document.createTextNode(text.slice(0, start))
          const afterNode = document.createTextNode(text.slice(cursorOffset))
          const parent = node.parentNode
          parent.insertBefore(beforeNode, node)
          parent.insertBefore(span, node)
          parent.insertBefore(afterNode, node)
          parent.removeChild(node)
          // Place cursor after emoji
          const newRange = document.createRange()
          newRange.setStart(afterNode, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          pendingMessage = getInputText()
          return
        }
      }
    }
  }

  // Live emote replacement: "emoteName " → <img> (triggered on space after emote name)
  if (wysiwygEnabled) {
    const input = document.getElementById('hs-mc-input')
    if (input?.isContentEditable) {
      const sel = window.getSelection()
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node?.nodeType === Node.TEXT_NODE) {
          const text = node.textContent
          const cursor = range.startOffset
          const before = text.slice(0, cursor)
          const match = before.match(/(\S+)\s$/)
          if (match) {
            const word = match[1]
            const emote = lookupEmote(word)
            if (emote) {
              const img = createInputEmoteImg(word)
              if (img) {
                const wordStart = cursor - match[0].length
                const beforeText = text.slice(0, wordStart)
                const afterText = text.slice(cursor)
                const parent = node.parentNode
                const isZeroWidth = !!emote.zeroWidth

                // Zero-width: stack onto previous emote if possible
                if (isZeroWidth && beforeText.trim() === '') {
                  // Look for emote element before this text node
                  let prev = node.previousSibling
                  while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                    prev = prev.previousSibling
                  }
                  if (prev && (
                    (prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
                    prev.classList?.contains('hs-input-stack')
                  )) {
                    // Remove whitespace text nodes between prev and current
                    let ws = prev.nextSibling
                    while (ws && ws !== node) {
                      const rm = ws
                      ws = ws.nextSibling
                      rm.remove()
                    }
                    stackInputEmote(prev, img)
                    node.textContent = afterText || '\u00A0'
                    const newRange = document.createRange()
                    newRange.setStart(node, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    pendingMessage = getInputText()
                    return
                  }
                }

                // Regular emote: replace text with img
                const beforeNode = beforeText ? document.createTextNode(beforeText) : null
                const afterNode = document.createTextNode(afterText || '\u00A0')
                if (beforeNode) parent.insertBefore(beforeNode, node)
                parent.insertBefore(img, node)
                parent.insertBefore(afterNode, node)
                parent.removeChild(node)
                const newRange = document.createRange()
                newRange.setStart(afterNode, 0)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                pendingMessage = getInputText()
              }
            }
          }
        }
      }
    }
  }
}

function updateCharCount() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;
  const text = getInputText();
  const len = text.length;
  const over = len > 500;
  input.classList.toggle('over-limit', over);

  // Highlight overflow chars for plain <input> using overlay div
  if (input.tagName === 'INPUT') {
    let wrap = document.getElementById('hs-mc-input-wrap');
    // Wrap input in container on first use
    if (!wrap && input.parentElement) {
      wrap = document.createElement('div');
      wrap.id = 'hs-mc-input-wrap';
      input.parentElement.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    let hl = document.getElementById('hs-mc-input-highlight');
    if (over) {
      if (!hl && wrap) {
        hl = document.createElement('div');
        hl.id = 'hs-mc-input-highlight';
        wrap.appendChild(hl);
      }
      if (hl) {
        // Build overlay using safe DOM methods
        hl.textContent = '';
        const safeSpan = document.createElement('span');
        safeSpan.className = 'hl-safe';
        safeSpan.textContent = text.slice(0, 500);
        const overSpan = document.createElement('span');
        overSpan.className = 'hl-over';
        overSpan.textContent = text.slice(500);
        hl.appendChild(safeSpan);
        hl.appendChild(overSpan);
        hl.scrollLeft = input.scrollLeft;
        hl.style.display = '';
      }
      // Make real input text transparent so overlay shows through
      input.style.color = 'transparent';
      input.style.caretColor = '#000';
    } else {
      if (hl) hl.style.display = 'none';
      input.style.color = '';
      input.style.caretColor = '';
    }
  }
}

function getCurrentWord(input) {
  if (!input) return ''
  if (input.contentEditable === 'true') {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    let container = range.startContainer;
    let offset = range.startOffset;
    if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const child = container.childNodes[offset - 1];
      if (child?.nodeType === Node.TEXT_NODE) {
        container = child;
        offset = child.textContent.length;
      }
    }
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent;
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      const beforeMatch = before.match(/(\S+)$/);
      const afterMatch = after.match(/^(\S+)/);
      if (beforeMatch) return beforeMatch[1] + (afterMatch ? afterMatch[1] : '');
    }
    return '';
  }
  const text = input.value;
  const pos = input.selectionStart;
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const beforeMatch = before.match(/(\S+)$/);
  const afterMatch = after.match(/^(\S+)/);
  if (beforeMatch) return beforeMatch[1] + (afterMatch ? afterMatch[1] : '');
  return '';
}

function findEmoteMatches(search) {
  const matches = [];

  // Check if searching for username (starts with @)
  const isUserSearch = search.startsWith('@');
  const searchTerm = isUserSearch ? search.slice(1) : search;
  const searchLower = searchTerm.toLowerCase();

  // Search usernames if @ prefix or if it could be a username
  if (isUserSearch || searchTerm.length >= 2) {
    for (const username of usernameCache) {
      const userLower = username.toLowerCase();
      if (userLower.startsWith(searchLower)) {
        matches.push({ name: '@' + username, url: null, priority: isUserSearch ? 0 : 2, type: 'user' });
      } else if (!isUserSearch && userLower.includes(searchLower)) {
        matches.push({ name: '@' + username, url: null, priority: 3, type: 'user' });
      }
    }
  }

  // Search emote cache (unless explicitly searching users with @)
  if (!isUserSearch) {
    // Search global + channel emotes for current tab
    const acEmotes = new Map(emoteCache);
    const acChCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
    if (acChCache) for (const [k, v] of acChCache) acEmotes.set(k, v);
    for (const [name, emote] of acEmotes) {
      if (name.toLowerCase().startsWith(searchLower)) {
        matches.push({ name, url: emote.url, source: emote.source, priority: 0, type: 'emote' });
      } else if (name.toLowerCase().includes(searchLower)) {
        matches.push({ name, url: emote.url, source: emote.source, priority: 1, type: 'emote' });
      }
    }
  }

  // Emoji shortcodes when typing :prefix
  if (search.startsWith(':') && typeof EMOJI_DATA !== 'undefined') {
    const emojiPrefix = search.slice(1).toLowerCase();
    if (emojiPrefix.length > 0) {
      for (const entry of EMOJI_DATA) {
        if (matches.length >= 50) break;
        const emojiMatch = { name: `:${entry.name}:`, url: null, priority: entry.name.startsWith(emojiPrefix) ? 1 : 2, type: 'emoji', emoji: entry.emoji };
        if (entry.name.startsWith(emojiPrefix)) {
          matches.push(emojiMatch);
        } else if (entry.name.includes(emojiPrefix)) {
          emojiMatch.priority = 2;
          matches.push(emojiMatch);
        }
      }
    }
  }

  // Sort: prefix matches first, then alphabetical
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.name.localeCompare(b.name);
  });

  return matches;
}

// Insert completion and keep cycling state
function insertCompletionKeepOpen(match) {
  const input = document.getElementById('hs-mc-input');
  if (!input || !match) return;

  if (wysiwygEnabled) {
    insertCompletionWysiwyg(match);
    return;
  }

  // Use saved positions from acState for consistent cycling
  const beforeWord = input.value.slice(0, acState.wordStart);
  const insertText = match.type === 'emoji' ? match.emoji : match.name;
  const newValue = beforeWord + insertText + ' ' + acState.afterText;

  input.value = newValue;
  pendingMessage = input.value;

  // Position cursor after the inserted word
  const newPos = beforeWord.length + insertText.length + 1;
  input.selectionStart = input.selectionEnd = newPos;
  input.focus();

  updateCharCount();
}

// WYSIWYG emote insertion
function insertCompletionWysiwyg(match) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  // Check if we're replacing an existing cycling element (emote img or text span)
  const existingEmote = input.querySelector('img.hs-cycling-emote');
  const existingText = input.querySelector('span.hs-cycling-text');
  if (existingEmote) {
    if (match.url) {
      existingEmote.src = match.url;
      existingEmote.alt = match.name;
      existingEmote.dataset.emoteName = match.name;
    } else if (match.type === 'emoji') {
      // Replace emote img with emoji span
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.emoji
      span.dataset.completionName = match.name
      existingEmote.replaceWith(span)
      // Place caret after the span's trailing space
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else {
      const textNode = document.createTextNode(match.name + ' ');
      existingEmote.replaceWith(textNode);
      placeCaretAfter(textNode);
    }
    pendingMessage = getInputText();
    updateCharCount();
    return;
  }
  if (existingText) {
    if (match.url) {
      // Replace text span with emote img
      const img = document.createElement('img')
      img.src = match.url
      img.alt = match.name
      img.dataset.emoteName = match.name
      img.className = 'hs-input-emote hs-cycling-emote'
      img.draggable = false
      existingText.replaceWith(img)
      const space = img.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(img)
    } else if (match.type === 'emoji') {
      existingText.textContent = match.emoji
      existingText.dataset.completionName = match.name
      const space = existingText.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingText)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingText.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }

  // First Tab: replace word with emote image
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.startContainer;
  let rangeOffset = range.startOffset;
  // Resolve element boundary to preceding text node
  if (container.nodeType === Node.ELEMENT_NODE && rangeOffset > 0) {
    const child = container.childNodes[rangeOffset - 1];
    if (child?.nodeType === Node.TEXT_NODE) {
      container = child;
      rangeOffset = child.textContent.length;
    }
  }
  if (container.nodeType !== Node.TEXT_NODE) return;

  const textNode = container;
  const offset = rangeOffset;
  const text = textNode.textContent;

  // Find word start
  let wordStart = offset;
  while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) wordStart--;

  // Find word end (skip past rest of word after cursor)
  let wordEnd = offset;
  while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++;

  // Split text: before | word | after
  const before = text.slice(0, wordStart);
  const after = text.slice(wordEnd);

  // Save afterText for cycling
  acState.afterText = after;

  // Helper: insert element after textNode with before/after text
  const insertElement = (el) => {
    textNode.textContent = before;
    const space = document.createTextNode('\u00A0' + after);
    const parent = textNode.parentNode;
    const nextSibling = textNode.nextSibling;
    if (nextSibling) {
      parent.insertBefore(el, nextSibling);
      parent.insertBefore(space, nextSibling);
    } else {
      parent.appendChild(el);
      parent.appendChild(space);
    }
    placeCaretAfter(space, 1);
  }

  if (match.url) {
    // Create emote image
    const img = document.createElement('img');
    img.src = match.url;
    img.alt = match.name;
    img.dataset.emoteName = match.name;
    img.className = 'hs-input-emote hs-cycling-emote';
    img.draggable = false;
    insertElement(img);
  } else if (match.type === 'emoji') {
    // Create emoji tracking span
    const span = document.createElement('span')
    span.className = 'hs-cycling-text'
    span.textContent = match.emoji
    span.dataset.completionName = match.name
    insertElement(span)
  } else {
    // User/text completion - just insert text
    const newText = before + match.name + ' ' + after;
    textNode.textContent = newText;
    const newPos = before.length + match.name.length + 1;
    range.setStart(textNode, newPos);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  pendingMessage = getInputText();
  updateCharCount();
  input.focus();
}

function placeCaretAfter(node, offset = 0) {
  const sel = window.getSelection();
  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(offset, node.length));
  } else {
    range.setStartAfter(node);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}


function showCycleTooltip() {
  let tt = document.getElementById('hs-mc-cycle-tooltip');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = 'hs-mc-cycle-tooltip';
    tt.style.cssText = 'position:absolute;bottom:100%;left:8px;background:#000;color:#fff;padding:4px 8px;font-size:12px;border-radius: 0;z-index:1003;margin-bottom:4px;';
    document.getElementById('hs-mc-inputbar')?.appendChild(tt);
  }
  const m = acState.matches[acState.index];
  const label = m.type === 'emoji' ? `${m.emoji} ${m.name}` : m.name;
  tt.textContent = `${acState.index + 1}/${acState.matches.length} ${label}`;
  tt.style.display = 'block';
}

function hideCycleTooltip() {
  const tt = document.getElementById('hs-mc-cycle-tooltip');
  if (tt) tt.style.display = 'none';
}

function hideAutocomplete() {
  acState.active = false;
  acState.matches = [];
  acState.index = 0;
  acState.wordStart = 0;
  acState.afterText = '';
  hideCycleTooltip();

  // WYSIWYG: finalize cycling elements (remove cycling class so they're permanent)
  if (wysiwygEnabled) {
    const input = document.getElementById('hs-mc-input');
    const cyclingEmote = input?.querySelector('.hs-cycling-emote');
    if (cyclingEmote) {
      cyclingEmote.classList.remove('hs-cycling-emote');
    }
    const cyclingText = input?.querySelector('.hs-cycling-text');
    if (cyclingText) {
      // Replace span with plain text node
      const textNode = document.createTextNode(cyclingText.textContent);
      cyclingText.replaceWith(textNode);
    }
  }
}

// Reply state management
function setReplyState(state) {
  replyState = state
  showInputBar()
  const bar = document.getElementById('hs-mc-inputbar')
  if (!bar) return
  // Remove existing indicator
  document.getElementById('hs-mc-reply-indicator')?.remove()
  const indicator = document.createElement('div')
  indicator.id = 'hs-mc-reply-indicator'
  const label = document.createElement('span')
  label.textContent = `↩ Replying to @${state.user}`
  const cancel = document.createElement('button')
  cancel.id = 'hs-mc-reply-cancel'
  cancel.textContent = '✕'
  cancel.title = 'Cancel reply'
  cancel.addEventListener('click', clearReplyState)
  indicator.appendChild(label)
  indicator.appendChild(cancel)
  bar.insertBefore(indicator, bar.firstChild)
  document.getElementById('hs-mc-input')?.focus()
}

function clearReplyState() {
  replyState = null
  document.getElementById('hs-mc-reply-indicator')?.remove()
  hideInputBar()
}

// Get Twitch auth token from cookie
function getTwitchAuthToken() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf('=');
    if (eqIdx === -1) continue;
    const key = cookie.slice(0, eqIdx).trim();
    const value = cookie.slice(eqIdx + 1).trim();
    if (key === 'auth-token' && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

// Send message to current tab's channel
// Build emoji lookup map (once)
const _emojiMap = new Map()
if (typeof EMOJI_DATA !== 'undefined') {
  for (const e of EMOJI_DATA) _emojiMap.set(e.name, e.emoji)
}

// Replace :shortcode: patterns with emoji characters
function convertEmojiShortcodes(text) {
  if (_emojiMap.size === 0) return text
  return text.replace(/:([a-z0-9_]+):/g, (match, name) => _emojiMap.get(name) || match)
}

function clearInput(input) {
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
}

async function handleSlashCommand(text, input) {
  const parts = text.match(/^\/(\w+)\s*(.*)$/)
  if (!parts) return false
  const [, cmd, rest] = parts

  if (cmd === 'op') {
    if (!rest.trim()) { showToast('usage: /op message'); return true }
    await postFeedMessage(rest.trim(), { topLevel: true })
    return true
  }

  if (cmd === 'w' || cmd === 'whisper') {
    const match = rest.match(/^(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /w username message'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('twitch', username, msg, input)
    return true
  }

  if (cmd === 'dm') {
    const match = rest.match(/^(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /dm username message'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('heatsync', username, msg, input)
    return true
  }

  if (cmd === 'r' || cmd === 'reply') {
    if (!rest.trim()) { showToast('usage: /r message'); return true }
    if (!lastWhisperKey) { showToast('no one to reply to'); return true }
    if (currentTab !== 'whispers') switchTab('whispers')
    await sendWhisperMessage(lastWhisperKey, rest.trim())
    clearInput(input)
    return true
  }

  return false
}

async function sendSlashWhisper(platform, username, text, input) {
  const lowerUser = username.toLowerCase()
  let key

  if (platform === 'twitch') {
    key = `twitch:${lowerUser}`
    if (!whisperUsers.has(key)) {
      // Resolve username → Twitch ID via decapi
      try {
        const resp = await fetch(`https://decapi.me/twitch/id/${encodeURIComponent(lowerUser)}`, { credentials: 'omit' })
        const body = (await resp.text()).trim()
        if (!resp.ok || !/^\d+$/.test(body)) {
          showToast(`twitch user "${username}" not found`)
          return
        }
        whisperUsers.set(key, { platform: 'twitch', userId: body, displayName: username, color: '#fff' })
      } catch (e) {
        showToast('failed to resolve twitch user')
        return
      }
    }
  } else {
    // HeatSync DM — resolve username → user_id via profile API
    const profileResp = await apiFetch(`/api/profile/${encodeURIComponent(lowerUser)}`)
    if (!profileResp.ok || !profileResp.data?.profile?.user_id) {
      showToast(`heatsync user "${username}" not found`)
      return
    }
    const userId = profileResp.data.profile.user_id
    key = `hs:${userId}`
    whisperUsers.set(key, {
      platform: 'heatsync',
      userId,
      displayName: profileResp.data.profile.display_name || username,
      color: profileResp.data.profile.user_color || '#fff'
    })
  }

  if (currentTab !== 'whispers') switchTab('whispers')
  await sendWhisperMessage(key, text)
  clearInput(input)
}

async function sendMessage() {
  const input = document.getElementById('hs-mc-input');
  if (!input) { console.warn('[HS] SEND BAIL: no input element'); return; }

  const text = convertEmojiShortcodes(getInputText().trim());
  if (!text) { console.warn('[HS] SEND BAIL: empty text'); return; }

  // Slash commands — work from any tab
  if (text.startsWith('/')) {
    const handled = await handleSlashCommand(text, input)
    if (handled) return
  }

  // Whispers tab → plain text acts as /r (reply to last)
  if (currentTab === 'whispers') {
    if (!lastWhisperKey) { showToast('no one to reply to — use /w or /dm first'); return }
    sendWhisperMessage(lastWhisperKey, text)
    clearInput(input)
    return
  }

  // Feed/notifs tab → post to heatsync API
  if (currentTab === 'feed') {
    postFeedMessage(text);
    return;
  }

  // Determine target channel + platform
  let targetChannel
  let ch = null
  if (currentTab === 'live') {
    targetChannel = getLiveChannel()
  } else if (currentTab === 'mentions') {
    targetChannel = getCurrentChannel()
  } else if (currentTab === 'add') {
    if (MC_DEBUG) console.warn('[HS] SEND BAIL: on add tab')
    return
  } else {
    ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
    targetChannel = typeof ch === 'string' ? ch : ch?.twitch || ch?.kick || currentTab
  }

  if (!targetChannel) {
    console.warn('[HS] SEND BAIL: no target channel, currentTab=' + currentTab)
    return
  }

  // Resolve platform targets
  const kickSlug = typeof ch !== 'string' ? ch?.kick : null
  const twitchName = typeof ch === 'string' ? ch : ch?.twitch
  const isLiveKick = currentTab === 'live' && hostPlatform === 'kick'

  const sendToKick = !!kickSlug || isLiveKick
  const sendToTwitch = !!twitchName && !isLiveKick
  const isDualSend = sendToKick && sendToTwitch

  // Track for echo dedup (dual-send only — suppress second platform's duplicate)
  if (isDualSend) {
    trackSentMessage(text)
  }

  const replyParentId = replyState?.msgId || null
  clearReplyState()

  // Clear input immediately
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
  hideInputBar()

  // --- Kick send path (single or dual) ---
  if (sendToKick) {
    const slug = kickSlug || targetChannel
    const kickPromise = sendKickMessage(slug, text)
    const twitchPromise = sendToTwitch
      ? sendIrcMessage(twitchName, text, getTwitchAuthToken(), replyParentId)
      : Promise.resolve(null)

    Promise.all([kickPromise, twitchPromise]).then(([kickResult, twitchResult]) => {
      const kickOk = kickResult === true
      const twitchOk = twitchResult === true || twitchResult === null

      if (kickOk || twitchOk) {

        // Partial failure toast
        if (isDualSend && !kickOk) showToast('sent to twitch only — ' + (kickResult || 'kick failed'))
        else if (isDualSend && !twitchOk) showToast('sent to kick only — twitch failed')
      } else {
        // Both failed (or single Kick failed)
        input.style.borderColor = '#f44'
        const msg = kickResult === 'kick_not_logged_in' ? 'log in to kick.com first'
          : kickResult === 'no_kick_tab' ? 'open kick.com in a tab'
          : kickResult === 'no_channel' ? 'kick channel not found'
          : 'send failed'
        if (wysiwygEnabled) input.dataset.placeholder = msg
        else input.placeholder = msg
        setTimeout(() => { input.style.borderColor = ''; updateInputPlaceholder() }, 2500)
      }
    })
    return
  }

  // --- Twitch-only send path (existing behavior) ---
  const token = getTwitchAuthToken()
  if (!token) {
    console.warn('[HS] SEND BAIL: no auth token (cookie missing)')
    if (wysiwygEnabled) input.dataset.placeholder = 'not logged in'
    else input.placeholder = 'not logged in'
    setTimeout(() => updateInputPlaceholder(), 2000)
    return
  }

  const wsState = authState.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][authState.ws.readyState] : 'null'
  log(`IRC SEND → #${targetChannel} ws=${wsState} ready=${authState.ready} queue=${authState.sendQueue.length}`)
  sendIrcMessage(targetChannel, text, token, replyParentId).then(result => {
    if (result === true) {
      if (wsState !== 'OPEN') {
        input.style.borderColor = '#ff0'
        setTimeout(() => { input.style.borderColor = '' }, 1500)
      }
    } else {
      input.style.borderColor = '#f44'
      const msg = result === 'no_user' ? 'no username detected'
        : result === 'auth_failed' ? 'auth failed — re-login to twitch'
        : result === 'connect_failed' ? 'connection failed — try again'
        : 'send failed — try again'
      if (wysiwygEnabled) input.dataset.placeholder = msg
      else input.placeholder = msg
      setTimeout(() => { input.style.borderColor = ''; updateInputPlaceholder() }, 2500)
    }
  })
}

// === END MULTICHAT MODULES ===


const STORAGE_KEY = 'heatsync_multichat';
  const LOG_PREFIX = '[heatsync-mc]';

  // Safe runtime.sendMessage wrapper (context invalidation guard, Firefox-compatible)
  function safeSendMessage(message) {
    try {
      return api.runtime.sendMessage(message).catch(e => {
        log('sendMessage failed:', e.message)
        return { ok: false, error: e.message }
      })
    } catch (e) {
      log('sendMessage failed:', e.message)
      return Promise.resolve({ ok: false, error: 'context invalidated' })
    }
  }

  // State
  let config = { channels: [], enabled: true };
  let currentTab = 'feed';
  let liveChannel = null;        // override channel for live tab (null = use URL channel)
  let liveChannelSet = new Set(); // channels currently live (lowercase twitch names)
  let irc = null;
  let kickChat = null;
  let currentUsername = null;
  let chatRoomComponent = null;
  let originalRender = null;
  let tabBarElement = null;
  let overlayElement = null;
  let inputBarElement = null;  // Separate input bar (always visible)
  let pendingMessage = '';     // Persists across tab switches
  let isHooked = false;
  let tabPosition = 'top'; // 'top', 'right', 'bottom', 'left'
  let resizeObserver = null; // Tracks overlay top sync observer

  // Muted users (right-click to hide) — loaded async from chrome.storage.local
  let mutedUsers = new Set();

  // Buffers
  const mentionsBuffer = [];
  const MAX_BUFFER = 500;

  let isKick = location.hostname.includes('kick.com');
  const hostPlatform = isKick ? 'kick' : location.hostname.includes('youtube.com') ? 'yt' : 'twitch';

  // Scoped emote wrapper query (avoids full-document scan)
  function queryEmoteWrappers(emoteName) {
    const scope = document.getElementById('hs-mc-overlay') || document
    return scope.querySelectorAll(`.hs-mc-emote-wrapper[data-emote-name="${CSS.escape(emoteName)}"]`)
  }

  // Batch-remove excess children using a Range (single reflow instead of N)
  function trimChildren(el, limit) {
    const excess = el.children.length - limit
    if (excess > 0) {
      const range = document.createRange()
      range.setStartBefore(el.firstChild)
      range.setEndBefore(el.children[excess])
      range.deleteContents()
    }
  }

  let mentionsSeenCount = 0; // Track how many mentions user has seen

  // Per-channel YouTube: messages and links
  const channelYtMessages = new Map();  // channelTabId → message[]
  const youtubeLinks = new Map();       // channelTabId → { url, videoId, channelName }

  // YouTube global state (per-channel only now — global removed)


  // Username cache for tab completion
  const usernameCache = new Set();
  // Username → color map for @mention coloring (LRU-bounded)
  const knownColors = new Map();
  // Avatar URL cache: username → CDN URL (fetched from decapi)
  const avatarCache = new Map()
  const avatarFetching = new Set() // prevent duplicate fetches
  function fetchAvatar(username) {
    const key = username.toLowerCase()
    if (avatarCache.has(key) || avatarFetching.has(key)) return
    avatarFetching.add(key)
    fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(key)}`, { credentials: 'omit' })
      .then(r => r.ok ? r.text() : null)
      .then(url => {
        avatarFetching.delete(key)
        if (!url || !url.startsWith('https://')) return
        avatarCache.set(key, url.trim())
        if (avatarCache.size > 500) {
          avatarCache.delete(avatarCache.keys().next().value)
        }
        // Update any visible avatar placeholders
        if (avatarsEnabled) {
          document.querySelectorAll(`.hs-mc-avatar[data-user="${CSS.escape(key)}"]`).forEach(img => {
            img.src = avatarCache.get(key)
          })
        }
      })
      .catch(() => avatarFetching.delete(key))
  }

  // Stream event user colors — login → color (populated from server on connect)
  const streamColorMap = new Map();


  // Stream events persistence — survives tab switches AND page refresh
  const STREAM_EVENTS_KEY = 'hs_stream_events';
  const STREAM_EVENTS_MAX = 200;
  let streamEventsLoaded = false;

  // Inject stream events into IRC buffers + activityEvents (deduped)
  // recentOnly: only inject events <15min old into chat buffers (on reload)
  function injectStreamEventsIntoBuffers(events, recentOnly = false) {
    const liveCh = getLiveChannel()
    const liveBuffer = liveCh ? irc?.channels?.get(liveCh) : null
    const chatCutoff = recentOnly ? Date.now() - 900000 : 0 // 15min
    let added = 0

    for (const evt of events) {
      const ch = evt.channel
      if (!ch) continue

      const injectToChat = !recentOnly || (evt.time && evt.time > chatCutoff)

      // Inject into live buffer only if recent enough
      if (injectToChat && liveBuffer) {
        const existing = liveBuffer.getAll()
        const isDupe = existing.some(m => m.type === 'stream-event' && m.text === evt.text)
        if (!isDupe) { liveBuffer.push(evt); added++ }
      }

      // Also inject into the matching channel buffer if different from live
      if (injectToChat && ch !== liveCh) {
        const buffer = irc?.channels?.get(ch)
        if (buffer) {
          const existing = buffer.getAll()
          const isDupe = existing.some(m => m.type === 'stream-event' && m.text === evt.text)
          if (!isDupe) buffer.push(evt)
        }
      }

      // Always push to activityEvents regardless of age
      pushActivityEvent(evt)
    }
    return added
  }

  async function loadStreamEvents() {
    try {
      const data = await api.storage.local.get(STREAM_EVENTS_KEY)
      const events = data[STREAM_EVENTS_KEY]
      if (!Array.isArray(events) || events.length === 0) return
      const cutoff = Date.now() - 86400000 // 24h expiry
      const valid = events.filter(e => e.time > cutoff)

      injectStreamEventsIntoBuffers(valid, true)

      // Prune expired from storage
      if (valid.length < events.length) {
        await api.storage.local.set({ [STREAM_EVENTS_KEY]: valid })
      }
      streamEventsLoaded = true
    } catch {}
  }

  // Queued storage writer — prevents concurrent read-modify-write races
  let saveQueue = Promise.resolve()

  async function saveStreamEvent(evt) {
    saveQueue = saveQueue.then(async () => {
      try {
        const data = await api.storage.local.get(STREAM_EVENTS_KEY)
        const events = data[STREAM_EVENTS_KEY] || []
        // Dedup by text before saving
        if (!events.some(e => e.text === evt.text)) {
          events.push(evt)
        }
        // Prune old events (keep last STREAM_EVENTS_MAX)
        if (events.length > STREAM_EVENTS_MAX) events.splice(0, events.length - STREAM_EVENTS_MAX)
        await api.storage.local.set({ [STREAM_EVENTS_KEY]: events })
      } catch {}
    })
    return saveQueue
  }

  async function saveStreamEventsBatch(evts) {
    saveQueue = saveQueue.then(async () => {
      try {
        const data = await api.storage.local.get(STREAM_EVENTS_KEY)
        const events = data[STREAM_EVENTS_KEY] || []
        const existingTexts = new Set(events.map(e => e.text))
        for (const evt of evts) {
          if (!existingTexts.has(evt.text)) {
            events.push(evt)
            existingTexts.add(evt.text)
          }
        }
        if (events.length > STREAM_EVENTS_MAX) events.splice(0, events.length - STREAM_EVENTS_MAX)
        await api.storage.local.set({ [STREAM_EVENTS_KEY]: events })
      } catch {}
    })
    return saveQueue
  }


  // Dedup: track recent server-sourced YouTube messages to skip content-script duplicates

  // Normalize YouTube URL — accepts full URLs or bare username
  const normalizeYtUrl = (raw) => {
    // Bare username (no slashes, no dots) → /@name/live
    if (/^@?[\w-]+$/.test(raw)) {
      const name = raw.startsWith('@') ? raw.slice(1) : raw
      return 'https://www.youtube.com/@' + name + '/live'
    }
    try {
      const u = new URL(raw)
      const v = u.searchParams.get('v')
      if (v) return 'https://www.youtube.com/watch?v=' + v
      const liveMatch = raw.match(/\/live\/([^?&\/]+)/)
      if (liveMatch) return 'https://www.youtube.com/live/' + liveMatch[1]
      const shortMatch = raw.match(/youtu\.be\/([^?&]+)/)
      if (shortMatch) return 'https://www.youtube.com/watch?v=' + shortMatch[1]
    } catch {}
    return raw
  }

  // ============================================
  // REACT UTILITIES (FFZ-STYLE)
  // ============================================

  /**
   * Find the chat room container component
   */
  function findChatRoomComponent() {
    // Try multiple starting points (including popout chat selectors)
    const selectors = [
      '[class*="chat-room"]',
      '[class*="stream-chat"]',
      '[data-test-selector="chat-room-component"]',
      '[data-a-target="chat-room-component"]',
      '[class*="chat-shell"]',
      '.chat-room'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;

      // Look for component with render method and chat-related props
      const result = findComponent(el, (inst, fiber) => {
        // Check if this is a class component with render
        if (typeof inst?.render !== 'function') return false;

        // Check fiber type name for chat-related components
        const typeName = fiber?.type?.displayName || fiber?.type?.name || '';
        if (typeName.toLowerCase().includes('chat')) return true;

        // Check for chat-related props
        if (inst.props) {
          const propStr = JSON.stringify(Object.keys(inst.props));
          if (propStr.includes('channel') || propStr.includes('room')) return true;
        }

        return false;
      }, 30);

      if (result) return result;
    }

    return null;
  }

  // ============================================
  // UI CREATION (React-compatible elements)
  // ============================================

  function createTabBar() {
    const container = document.createElement('div');
    container.id = 'hs-mc-tabbar';
    // Static hardcoded tab buttons — no user input, safe innerHTML
    container.innerHTML = `
      <button class="hs-mc-tab active" data-tab="feed">feed</button>
      <button class="hs-mc-tab" data-tab="whispers">whispers</button>
      <button class="hs-mc-tab" data-tab="mentions">mentions</button>
      <button class="hs-mc-tab" data-tab="live">live</button>
      <button class="hs-mc-tab" data-tab="add">+</button>
      <div class="hs-mc-tab-utils">
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-rotate" data-tab="rotate" title="rotate tabs (T)">T</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-font-btn" data-font-dir="-1" title="smaller text">A-</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-font-btn" data-font-dir="1" title="larger text">A+</button>
        <button class="hs-mc-tab hs-mc-util-btn" data-tab="settings" title="settings">\u2699</button>
      </div>
    `;

    // Event delegation for tab clicks
    container.addEventListener('click', (e) => {
      const tab = e.target.closest('.hs-mc-tab');
      if (!tab || tab.classList.contains('hs-mc-font-btn')) return;

      const tabId = tab.dataset.tab;
      log('Tab clicked:', tabId);
      if (tabId === 'add') {
        switchTab('add');
      } else if (tabId === 'rotate') {
        rotateTabPosition();
      } else if (tabId === 'live') {
        showLiveChannelPicker(tab);
      } else {
        switchTab(tabId);
      }
    });

    // Font size controls
    container.addEventListener('click', (e) => {
      const fontBtn = e.target.closest('.hs-mc-font-btn');
      if (!fontBtn) return;
      const dir = parseInt(fontBtn.dataset.fontDir);
      const msgsEl = document.getElementById('hs-mc-messages');
      if (!msgsEl) return;
      const current = parseInt(getComputedStyle(msgsEl).fontSize) || 13;
      const next = Math.max(10, Math.min(22, current + dir));
      msgsEl.style.setProperty('--hs-chat-font', next + 'px');
      localStorage.setItem('heatsync-chat-font-size', next);
    });

    // Right-click channel tabs → context menu (edit youtube / remove)
    container.addEventListener('contextmenu', (e) => {
      const tab = e.target.closest('.hs-mc-tab');
      if (!tab) return;
      const tabId = tab.dataset.tab;
      const reserved = ['live', 'feed', 'mentions', 'whispers', 'add', 'rotate', 'settings'];
      if (reserved.includes(tabId)) return;
      e.preventDefault();

      // Remove any existing context menu
      document.getElementById('hs-mc-ctx-menu')?.remove();

      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
      const menu = document.createElement('div');
      menu.id = 'hs-mc-ctx-menu';
      menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #444;border-radius:0;padding:4px 0;min-width:150px;font-size:12px;font-family:inherit;';

      const mkItem = (label, color, fn) => {
        const item = document.createElement('div');
        item.textContent = label;
        item.style.cssText = `padding:6px 12px;cursor:pointer;color:${color};`;
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', () => { menu.remove(); fn(); });
        menu.appendChild(item);
      };

      mkItem('edit', '#fff', () => showEditChannelForm(tabId));
      mkItem('remove', '#ff4444', () => removeChannel(tabId));

      // Append then clamp to viewport so it doesn't overflow off-screen
      document.body.appendChild(menu);
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px';

      const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
      setTimeout(() => document.addEventListener('click', dismiss), 0);
    });

    return container;
  }


  // Edit form active — block renders while editing channel config
  let editingChannel = false;

  // Track scroll state for "new messages" button
  let isScrolledUp = false;
  let emoteReloadTimer = null;
  let newMessageCount = 0;
  let isProgrammaticScroll = false; // Flag to ignore programmatic scrolls

  // WYSIWYG mode (inline emote images in input)
  let wysiwygEnabled = false;

  // Clickable links in chat messages (default on)
  let linksEnabled = true;

  // Vi mode for chat input (default off)
  let viModeEnabled = false;

  // Platform badges [T]/[K]/[YT] on messages (default on)
  let platformBadgesEnabled = true;

  // Zebra striping — alternate row backgrounds (default on)
  let zebraEnabled = true;

  // Timestamps on messages (default off)
  let timestampsEnabled = false;
  window._hsTimestampsEnabled = false;
  let avatarsEnabled = false;

  // Show offline stream events (default off)
  let showOfflineEvents = true;

  // Input bar auto-hide — hidden when empty, shown on first keystroke
  let autoHideInput = true;
  let inputBarVisible = true;

  // ═══ Inline notification routing ═══
  // Modular registry: each type can be toggled independently
  // Colors match website conventions
  const INLINE_NOTIF_TYPES = {
    op:      { label: '[OP]',  color: '#ff0000', borderColor: '#ff0000', defaultOn: true,  desc: 'original posts' },
    mop:     { label: '[OP]',  color: '#ff00ff', borderColor: '#ff00ff', defaultOn: true,  desc: 'OP replies in own thread' },
    re:      { label: '[RE]',  color: '#00ffff', borderColor: '#00ffff', defaultOn: false, desc: 'replies' },
    dm:      { label: '[DM]',  color: '#ffff00', borderColor: '#ffff00', defaultOn: false, desc: 'whispers & DMs' },
  }
  // Runtime state: { op: true, re: false, dm: false, mention: true }
  const inlineNotifs = {}
  for (const [k, v] of Object.entries(INLINE_NOTIF_TYPES)) inlineNotifs[k] = v.defaultOn

  // Hermes event toggles (Twitch-native events: raids, hype trains, etc.)
  const HERMES_EVENT_TYPES = {
    raid:   { color: '#9146ff', defaultOn: true,  desc: 'raids' },
    hype:   { color: '#ff8700', defaultOn: true,  desc: 'hype trains' },
    sub:    { color: '#00ff7f', defaultOn: true,  desc: 'gift subs' },
    redeem: { color: '#00bfff', defaultOn: false, desc: 'channel point redeems' },
  }
  const hermesToggles = {}
  for (const [k, v] of Object.entries(HERMES_EVENT_TYPES)) hermesToggles[k] = v.defaultOn

  function showInputBar() {
    if (inputBarVisible) return
    inputBarVisible = true
    const bar = document.getElementById('hs-mc-inputbar')
    if (bar) bar.classList.remove('hs-hidden')
    const picker = document.getElementById('hs-mc-emote-picker')
    adjustOverlayForPicker(picker?.classList.contains('visible') || false)
  }

  function hideInputBar() {
    if (!autoHideInput) return
    if (!inputBarVisible) return
    const input = document.getElementById('hs-mc-input')
    const hasText = input ? (input.value || input.textContent || '').trim().length > 0 : false
    const hasContent = hasText || (input && input.querySelector('img, span.hs-mc-emoji'))
    if (hasContent) return
    // Don't hide while emote picker is open
    const picker = document.getElementById('hs-mc-emote-picker')
    if (picker?.classList.contains('visible')) return
    // Don't hide while reply is active
    if (replyState) return
    inputBarVisible = false
    const bar = document.getElementById('hs-mc-inputbar')
    if (bar) bar.classList.add('hs-hidden')
    const overlay = document.getElementById('hs-mc-overlay')
    if (overlay) overlay.style.bottom = '0'
  }

  // Chat width state
  let chatWidth = 340; // Default width
  const DEFAULT_CHAT_WIDTH = 340;
  const MIN_CHAT_WIDTH = 300;
  const MAX_CHAT_WIDTH = 800;

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'hs-mc-overlay';
    // Static hardcoded layout — no user input, safe innerHTML
    overlay.innerHTML = `
      <div id="hs-mc-messages">
        <div class="hs-mc-empty">no messages yet</div>
      </div>
      <button id="hs-mc-new-msgs" style="display:none"></button>
    `;

    // Apply saved font size
    const savedFontSize = localStorage.getItem('heatsync-chat-font-size');
    if (savedFontSize) {
      const msgsDiv = overlay.querySelector('#hs-mc-messages');
      if (msgsDiv) msgsDiv.style.setProperty('--hs-chat-font', savedFontSize + 'px');
    }

    // Setup scroll detection after DOM insertion
    cleanup.setTimeout(() => {
      const msgsEl = document.getElementById('hs-mc-messages');
      const newBtn = document.getElementById('hs-mc-new-msgs');
      if (!msgsEl || !newBtn) return;

      const isStaticTab = () => currentTab === 'feed' || currentTab === 'settings';

      // scroll event only used for scrollbar drag detection (not wheel — wheel has its own handler)
      msgsEl.addEventListener('scrollend', () => {
        if (isProgrammaticScroll) return;
        if (isStaticTab()) {
          // Static tabs: newest at top — "scrolled away" = scrollTop > 0
          isScrolledUp = msgsEl.scrollTop > 50;
          if (!isScrolledUp) { newBtn.style.display = 'none'; newMessageCount = 0; }
          return;
        }
        const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 50;
        if (atBottom) {
          isScrolledUp = false;
          newMessageCount = 0;
          newBtn.style.display = 'none';
        } else {
          isScrolledUp = true;
          newBtn.innerHTML = newMessageCount > 0 ? `<span class="hs-arrow-down">▼</span> ${newMessageCount} new` : '<span class="hs-arrow-down">▼</span> resume';
          newBtn.style.display = 'flex';
        }
      });

      // Use wheel event to detect intentional user scrolling
      msgsEl.addEventListener('wheel', (e) => {
        if (isStaticTab()) {
          // Static tabs: track scroll position but don't show button from scrolling alone
          setTimeout(() => { isScrolledUp = msgsEl.scrollTop > 50; }, 50);
          if (msgsEl.scrollTop <= 50) { newBtn.style.display = 'none'; newMessageCount = 0; }
          return;
        }
        if (e.deltaY < 0) {
          // Scrolling up with wheel = user intent
          isScrolledUp = true;
          newBtn.innerHTML = newMessageCount > 0 ? `<span class="hs-arrow-down">▼</span> ${newMessageCount} new` : '<span class="hs-arrow-down">▼</span> resume';
          newBtn.style.display = 'flex';
        } else if (e.deltaY > 0) {
          // Scrolling down - check if we're now at bottom to re-lock
          setTimeout(() => {
            const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 50;
            if (atBottom) {
              isScrolledUp = false;
              newMessageCount = 0;
              newBtn.style.display = 'none';
            }
          }, 50); // Small delay to let scroll finish
        }
      });

      newBtn.addEventListener('click', () => {
        isScrolledUp = false;
        newMessageCount = 0;
        newBtn.style.display = 'none';
        if (isStaticTab()) {
          // Static tabs: re-render then scroll to top (newest content)
          renderMessages(currentTab);
          msgsEl.scrollTop = 0;
        } else {
          // Chat tabs: re-render to catch up on skipped messages
          renderMessages(currentTab);
        }
      });
    }, 100);

    return overlay;
  }

  /**
   * Setup resize handle for dragging chat width
   */
  function setupResizeHandle() {
    // Create handle on the left edge of the right column
    const rightCol = document.querySelector('.right-column.right-column--beside')
    if (!rightCol || document.getElementById('hs-mc-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-mc-resize-handle'
    rightCol.insertBefore(handle, rightCol.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0

    handle.addEventListener('mousedown', (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = chatWidth
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    })

    cleanup.addEventListener(document, 'mousemove', (e) => {
      if (!isResizing) return
      // Dragging left = bigger chat, dragging right = smaller chat
      const delta = startX - e.clientX
      const newWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      chatWidth = newWidth
      applyChatWidth()
    })

    cleanup.addEventListener(document, 'mouseup', () => {
      if (isResizing) {
        isResizing = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        saveChatWidth()
      }
    })

    // Load saved width
    loadChatWidth()
  }

  function applyChatWidth() {
    const rightCol = document.querySelector('.right-column')
    if (!rightCol) return
    const collapsed = rightCol.classList.contains('right-column--collapsed')

    if (collapsed) {
      rightCol.style.removeProperty('width')
      rightCol.style.removeProperty('min-width')
      rightCol.style.removeProperty('flex-shrink')
      // Force parent wrapper (Twitch sets inline width: fit-content) to 0
      // overflow must be visible so the collapse/expand arrow can render
      const parent = rightCol.parentElement
      if (parent && parent !== document.body) {
        parent.style.setProperty('width', '0px', 'important')
        parent.style.setProperty('min-width', '0px', 'important')
        parent.style.setProperty('overflow', 'visible', 'important')
      }
      return
    }

    // Restore parent when expanded
    const parent = rightCol.parentElement
    if (parent && parent !== document.body) {
      parent.style.removeProperty('width')
      parent.style.removeProperty('min-width')
      parent.style.removeProperty('overflow')
    }

    const isVertical = tabPosition === 'left' || tabPosition === 'right'
    const colWidth = chatWidth + (isVertical ? 90 : 0)

    // Parent is display:block, so flex-basis alone won't work — need inline width.
    // Don't override display — Twitch's native display:block works correctly.
    // Setting display:flex breaks internal child layout (flex-direction:row default).
    // Player sizing fix is handled by CSS rule in injected-message.css.
    rightCol.style.setProperty('width', colWidth + 'px', 'important')
    rightCol.style.setProperty('min-width', colWidth + 'px', 'important')
    rightCol.style.setProperty('flex-shrink', '0', 'important')

    // Vertical tabs: widen the inner column chain so .stream-chat fills the
    // wider .right-column. The bottleneck is .channel-root__right-column
    // (position:absolute, Twitch sizes it to default chat width).
    const innerCol = rightCol.querySelector('.channel-root__right-column')
    if (innerCol) {
      if (isVertical) {
        innerCol.style.setProperty('width', '100%', 'important')
      } else {
        innerCol.style.removeProperty('width')
      }
    }
  }

  function saveChatWidth() {
    chrome.storage.local.set({ hs_chat_width: chatWidth });
    log('Saved chat width:', chatWidth);
  }

  async function loadChatWidth() {
    try {
      const data = await chrome.storage.local.get(['hs_chat_width']);
      if (data.hs_chat_width) {
        chatWidth = data.hs_chat_width;
        applyChatWidth();
        log('Loaded chat width:', chatWidth);
      }
    } catch (e) {
      log('Error loading chat width:', e);
    }
  }

  /**
   * Apply chat width to Kick's fixed #channel-chatroom panel
   */
  function applyKickChatWidth() {
    const chatroom = document.getElementById('channel-chatroom')
    if (!chatroom) return
    chatroom.style.setProperty('width', chatWidth + 'px', 'important')
    document.documentElement.style.setProperty('--hs-kick-chat-width', chatWidth + 'px')
  }

  /**
   * Setup resize handle for Kick — left edge of fixed #channel-chatroom panel
   * Uses rAF batching, iframe overlay, and kills Kick's native transitions
   */
  function setupKickResizeHandle() {
    const chatroom = document.getElementById('channel-chatroom')
    if (!chatroom || document.getElementById('hs-kick-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-kick-resize-handle'
    chatroom.insertBefore(handle, chatroom.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0
    let rafId = 0
    let pendingWidth = 0
    let overlay = null

    function applyResize() {
      rafId = 0
      chatWidth = pendingWidth
      chatroom.style.setProperty('width', chatWidth + 'px', 'important')
      document.documentElement.style.setProperty('--hs-kick-chat-width', chatWidth + 'px')
    }

    handle.addEventListener('mousedown', (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = chatWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      // Kill transitions during drag
      chatroom.style.setProperty('transition', 'none', 'important')
      const main = document.querySelector('main')
      if (main) main.style.setProperty('transition', 'none', 'important')
      // Transparent overlay catches mouse over iframes/video
      overlay = document.createElement('div')
      overlay.id = 'hs-resize-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize'
      document.body.appendChild(overlay)
      e.preventDefault()
    })

    cleanup.addEventListener(document, 'mousemove', (e) => {
      if (!isResizing) return
      const delta = startX - e.clientX
      pendingWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    })

    cleanup.addEventListener(document, 'mouseup', () => {
      if (!isResizing) return
      isResizing = false
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      // Apply final width
      chatWidth = pendingWidth || chatWidth
      applyKickChatWidth()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Remove overlay
      if (overlay) { overlay.remove(); overlay = null }
      // Restore transitions
      chatroom.style.removeProperty('transition')
      const main = document.querySelector('main')
      if (main) main.style.removeProperty('transition')
      saveChatWidth()
    })

    loadChatWidth().then(() => { applyKickChatWidth() })
  }

  // Emote size functions
  function setEmoteSize(size) {
    if ([1, 2, 4].includes(size)) {
      emoteSize = size;
      saveEmoteSize();
      applyEmoteSize();
    }
  }

  function saveEmoteSize() {
    chrome.storage.local.set({ hs_emote_size: emoteSize });
  }

  async function loadEmoteSize() {
    try {
      const data = await chrome.storage.local.get(['hs_emote_size']);
      if (data.hs_emote_size) {
        emoteSize = data.hs_emote_size;
        applyEmoteSize();
      }
    } catch (e) {
      log('Error loading emote size:', e);
    }
  }

  function applyEmoteSize() {
    const targets = [document.documentElement, document.getElementById('hs-mc-messages')].filter(Boolean);
    const baseEmote = 32;
    // Only scale emote images and badges — font size stays independent (A-/A+ controls it)
    const vars = {
      '--hs-emote-size': (baseEmote * emoteSize) + 'px',
      '--hs-time-font': (10 * emoteSize) + 'px',
      '--hs-badge-size': (18 * emoteSize) + 'px',
      '--hs-badge-font': (10 * emoteSize) + 'px',
      '--hs-stat-badge-font': (9 * emoteSize) + 'px',
      '--hs-stat-badge-line': (16 * emoteSize) + 'px',
      '--hs-badge-img': (18 * emoteSize) + 'px',
    };
    for (const el of targets) {
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    }
    renderMessages(currentTab);
  }


  // Inline notification settings
  async function loadInlineNotifSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const saved = stored.ui_settings?.inlineNotifs
      if (saved) {
        for (const k of Object.keys(INLINE_NOTIF_TYPES)) {
          if (saved[k] !== undefined) inlineNotifs[k] = saved[k]
        }
      }
    } catch {}
  }

  async function saveInlineNotifSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const settings = stored.ui_settings || {}
      settings.inlineNotifs = { ...inlineNotifs }
      await chrome.storage.local.set({ ui_settings: settings })
    } catch {}
  }

  async function loadHermesSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const saved = stored.ui_settings?.hermesEvents
      if (saved) {
        for (const k of Object.keys(HERMES_EVENT_TYPES)) {
          if (saved[k] !== undefined) hermesToggles[k] = saved[k]
        }
      }
    } catch {}
  }

  async function saveHermesSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const settings = stored.ui_settings || {}
      settings.hermesEvents = { ...hermesToggles }
      await chrome.storage.local.set({ ui_settings: settings })
    } catch {}
  }

  // Inject an inline notification into active chat tabs
  function injectInlineNotif(notifType, msg) {
    if (!inlineNotifs[notifType]) return
    const typeDef = INLINE_NOTIF_TYPES[notifType]
    if (!typeDef) return

    msg.inlineNotifType = notifType
    msg.inlineNotifColor = typeDef.color
    msg.inlineNotifBorderColor = typeDef.borderColor
    msg.inlineNotifLabel = typeDef.label

    // Persist into ALL channel buffers (IRC + Kick) so notification appears on every tab
    for (const ch of config.channels) {
      const twitchName = typeof ch === 'string' ? ch : ch?.twitch
      const kickName = typeof ch === 'string' ? null : ch?.kick
      const buffer = (twitchName && irc?.channels?.get(twitchName)) ||
                     (kickName && kickChat?.channels?.get(kickName))
      if (buffer) buffer.push(msg)
    }

    // Live-append to current tab if it's a chat tab
    const active = currentTab
    const isChatTab = active === 'live' || active === 'mentions' ||
      config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)
    if (isChatTab) appendMessage(msg, active)
  }

  // WYSIWYG setting
  async function loadWysiwygSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.wysiwygEnabled !== undefined) {
        wysiwygEnabled = stored.ui_settings.wysiwygEnabled;
      }
    } catch (e) {
      log('Error loading WYSIWYG setting:', e);
    }
  }

  async function saveWysiwygSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.wysiwygEnabled = wysiwygEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch (e) {
      log('Error saving WYSIWYG setting:', e);
    }
  }

  function toggleWysiwyg() {
    wysiwygEnabled = !wysiwygEnabled;
    saveWysiwygSetting();
    rebuildInput();
    log('WYSIWYG:', wysiwygEnabled ? 'enabled' : 'disabled');
  }

  // Clickable links setting
  async function loadLinksSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.linksEnabled !== undefined) {
        linksEnabled = stored.ui_settings.linksEnabled;
      }
    } catch (e) {
      log('Error loading links setting:', e);
    }
  }

  async function saveLinksSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.linksEnabled = linksEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch (e) {
      log('Error saving links setting:', e);
    }
  }

  function toggleLinks() {
    linksEnabled = !linksEnabled;
    saveLinksSetting();
    log('Links:', linksEnabled ? 'enabled' : 'disabled');
  }

  // Vi mode setting
  async function loadViModeSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.viMode !== undefined) {
        viModeEnabled = stored.ui_settings.viMode;
      }
    } catch (e) {
      log('Error loading vi mode setting:', e);
    }
  }

  async function saveViModeSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.viMode = viModeEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
      // Sync to localStorage for vi-mode.js
      try {
        const ls = JSON.parse(localStorage.getItem('heatsync-extension-settings') || '{}')
        ls.viMode = viModeEnabled
        localStorage.setItem('heatsync-extension-settings', JSON.stringify(ls))
      } catch (_) {}
      // Notify vi-mode.js
      window.postMessage({ type: 'heatsync-settings-changed', settings: { ...settings } }, location.origin);
    } catch (e) {
      log('Error saving vi mode setting:', e);
    }
  }

  function toggleViMode() {
    viModeEnabled = !viModeEnabled;
    saveViModeSetting();
    log('Vi mode:', viModeEnabled ? 'enabled' : 'disabled');
  }

  // Platform badges setting
  async function loadPlatformBadgesSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.showPlatformBadges !== undefined) {
        platformBadgesEnabled = stored.ui_settings.showPlatformBadges;
      }
    } catch (e) {
      log('Error loading platform badges setting:', e);
    }
  }


  // Zebra striping setting
  async function loadZebraSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.zebra !== undefined) {
        zebraEnabled = stored.ui_settings.zebra;
      }
    } catch {}
  }

  async function saveZebraSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.zebra = zebraEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleZebra() {
    zebraEnabled = !zebraEnabled;
    saveZebraSetting();
    // Re-render current tab to apply
    renderMessages(currentTab);
  }


  // Auto-hide input setting
  async function loadAutoHideSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.autoHideEmpty !== undefined) {
        autoHideInput = stored.ui_settings.autoHideEmpty;
      }
    } catch {}
  }

  async function saveAutoHideSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.autoHideEmpty = autoHideInput;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleAutoHide() {
    autoHideInput = !autoHideInput;
    saveAutoHideSetting();
    const bar = document.getElementById('hs-mc-inputbar');
    const picker = document.getElementById('hs-mc-emote-picker');
    const pickerOpen = picker?.classList.contains('visible') || false;
    if (autoHideInput) {
      // Force-hide bar (bypass picker check)
      if (bar) bar.classList.add('hs-hidden');
      inputBarVisible = false;
    } else {
      if (bar) bar.classList.remove('hs-hidden');
      inputBarVisible = true;
    }
    adjustOverlayForPicker(pickerOpen);
  }

  // Timestamps setting
  async function loadTimestampsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.timestamps !== undefined) {
        timestampsEnabled = stored.ui_settings.timestamps;
      }
      window._hsTimestampsEnabled = timestampsEnabled;
    } catch {}
  }

  async function saveTimestampsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.timestamps = timestampsEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleTimestamps() {
    timestampsEnabled = !timestampsEnabled;
    window._hsTimestampsEnabled = timestampsEnabled;
    saveTimestampsSetting();
    renderMessages(currentTab);
  }

  // Offline events setting
  async function loadOfflineEventsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.showOfflineEvents !== undefined) {
        showOfflineEvents = stored.ui_settings.showOfflineEvents;
      }
    } catch {}
  }

  async function saveOfflineEventsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.showOfflineEvents = showOfflineEvents;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleOfflineEvents() {
    showOfflineEvents = !showOfflineEvents;
    saveOfflineEventsSetting();
  }

  // Avatars setting
  async function loadAvatarsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.avatars !== undefined) {
        avatarsEnabled = stored.ui_settings.avatars;
      }
    } catch {}
  }

  async function saveAvatarsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.avatars = avatarsEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleAvatars() {
    avatarsEnabled = !avatarsEnabled;
    saveAvatarsSetting();
    renderMessages(currentTab);
  }

  function renderSettingsTab() {
    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;

    // Tooltip descriptions for settings — all static strings, no user input
    const settingTips = {
      emoteSize: 'Resolution multiplier for emotes in chat. 1x is crisp and compact, 2x is the sweet spot for most displays, 4x is for when you want to see every pixel of that emote art.',
      wysiwyg: 'Shows emotes as images directly in the input box as you type, instead of plain text names. What you see is what you send.',
      links: "Turns URLs in chat messages into clickable hyperlinks. Disable if you prefer to copy-paste or just don't trust strangers on the internet.",
      vi: 'Vim-style keybindings for chat navigation. j/k to scroll, g/G for top/bottom, / to search. For people who think mice are for casuals.',
      zebra: 'Alternating row shading on chat messages. Makes it easier to track long messages across the window, especially during fast chat.',
      autohide: "Hides the input bar when you're not actively composing a message. Click or start typing to bring it back. Maximizes chat viewing space.",
      timestamps: 'Shows the time each message was sent, right next to the username. Useful for catching up on what happened while you were AFK.',
      avatars: 'Displays profile pictures next to usernames in chat. Makes it easier to visually identify regulars at a glance, costs a bit of vertical space.',
    }
    const notifTips = {
      op: 'Notification in your active chat tab when someone creates a new original post on the feed. Keeps you in the loop without switching tabs.',
      mop: 'Notification when the original poster replies in their own thread. Useful for tracking when an OP responds to discussion.',
      re: 'Notification for every reply posted to any thread on the feed. Can get noisy during active discussions.',
      dm: 'Notification when you receive a whisper or DM. You probably want this on unless you are intentionally ignoring someone.',
    }

    // Static settings HTML — no user input, all tooltip values are hardcoded strings above
    msgsEl.innerHTML = `
      <div class="hs-mc-settings-panel">
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">display</div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.emoteSize}">emote size</span>
            <div class="hs-mc-size-btns">
              <button class="hs-mc-size-btn ${emoteSize === 1 ? 'active' : ''}" data-size="1">1x</button>
              <button class="hs-mc-size-btn ${emoteSize === 2 ? 'active' : ''}" data-size="2">2x</button>
              <button class="hs-mc-size-btn ${emoteSize === 4 ? 'active' : ''}" data-size="4">4x</button>
            </div>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.wysiwyg}">input preview</span>
            <button class="hs-mc-toggle-pill ${wysiwygEnabled ? 'active' : ''}" data-setting="wysiwyg"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.links}">clickable links</span>
            <button class="hs-mc-toggle-pill ${linksEnabled ? 'active' : ''}" data-setting="links"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.vi}">vi mode</span>
            <button class="hs-mc-toggle-pill ${viModeEnabled ? 'active' : ''}" data-setting="vi"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.zebra}">zebra striping</span>
            <button class="hs-mc-toggle-pill ${zebraEnabled ? 'active' : ''}" data-setting="zebra"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.autohide}">auto-hide input</span>
            <button class="hs-mc-toggle-pill ${autoHideInput ? 'active' : ''}" data-setting="autohide"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.timestamps}">timestamps</span>
            <button class="hs-mc-toggle-pill ${timestampsEnabled ? 'active' : ''}" data-setting="timestamps"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.avatars}">avatars</span>
            <button class="hs-mc-toggle-pill ${avatarsEnabled ? 'active' : ''}" data-setting="avatars"><span class="hs-mc-toggle-knob"></span></button>
          </div>
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">inline notifications</div>
          ${Object.entries(INLINE_NOTIF_TYPES).map(([key, def]) => `
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${notifTips[key] || def.desc}"><span style="color:${def.color}">${def.label}</span> ${def.desc}</span>
            <button class="hs-mc-toggle-pill ${inlineNotifs[key] ? 'active' : ''}" data-setting="notif_${key}"><span class="hs-mc-toggle-knob"></span></button>
          </div>`).join('')}
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">twitch events</div>
          ${Object.entries(HERMES_EVENT_TYPES).map(([key, def]) => `
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${def.desc}"><span style="color:${def.color}">\u25C6</span> ${def.desc}</span>
            <button class="hs-mc-toggle-pill ${hermesToggles[key] ? 'active' : ''}" data-setting="hermes_${key}"><span class="hs-mc-toggle-knob"></span></button>
          </div>`).join('')}
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">muted users</div>
          ${mutedUsers.size === 0
            ? `<div class="hs-mc-setting-row" style="color:#666;font-size:11px">no muted users</div>`
            : [...mutedUsers].sort().map(u => `
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" style="font-size:11px">${u}</span>
            <button class="hs-mc-unmute-btn" data-username="${u}" style="background:none;border:1px solid #444;color:#999;font-size:11px;cursor:pointer;padding:1px 6px;line-height:1.4" title="unmute">&#x2715;</button>
          </div>`).join('')
          }
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-setting-row" style="justify-content:flex-end">
            <button class="hs-mc-defaults-btn" style="background:#c0c0c0;border:2px outset #fff;padding:2px 10px;font-size:11px;font-weight:bold;cursor:pointer;font-family:'Liberation Mono',monospace;color:#000;box-shadow:1px 1px 0 #000">default</button>
          </div>
        </div>
      </div>
    `;

    // Wire up toggles via event delegation
    if (msgsEl._hsSettingsClick) msgsEl.removeEventListener('click', msgsEl._hsSettingsClick);
    msgsEl._hsSettingsClick = function settingsClick(e) {
      const toggle = e.target.closest('.hs-mc-toggle-pill[data-setting]');
      if (toggle) {
        const setting = toggle.dataset.setting;
        // Inline notification toggles (notif_op, notif_re, etc.)
        if (setting.startsWith('notif_')) {
          const notifKey = setting.slice(6)
          if (INLINE_NOTIF_TYPES[notifKey] !== undefined) {
            inlineNotifs[notifKey] = !inlineNotifs[notifKey]
            saveInlineNotifSettings()
            toggle.classList.toggle('active')
          }
          return
        }
        // Hermes event toggles (hermes_raid, hermes_hype, etc.)
        if (setting.startsWith('hermes_')) {
          const key = setting.slice(7)
          if (HERMES_EVENT_TYPES[key] !== undefined) {
            hermesToggles[key] = !hermesToggles[key]
            saveHermesSettings()
            toggle.classList.toggle('active')
          }
          return
        }
        const toggleMap = {
          wysiwyg: () => { wysiwygEnabled = !wysiwygEnabled; saveWysiwygSetting(); rebuildInput(); },
          links: () => { linksEnabled = !linksEnabled; saveLinksSetting(); },
          vi: () => { viModeEnabled = !viModeEnabled; saveViModeSetting(); },
          zebra: () => { toggleZebra(); },
          autohide: () => { toggleAutoHide(); },
          timestamps: () => { toggleTimestamps(); },
          avatars: () => { toggleAvatars(); },
        };
        if (toggleMap[setting]) {
          toggleMap[setting]();
          toggle.classList.toggle('active');
        }
        return;
      }

      const sizeBtn = e.target.closest('.hs-mc-size-btn[data-size]');
      if (sizeBtn) {
        const size = parseInt(sizeBtn.dataset.size);
        if (size) {
          setEmoteSize(size);
          msgsEl.querySelectorAll('.hs-mc-size-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size) === size));
        }
        return;
      }

      const unmuteBtn = e.target.closest('.hs-mc-unmute-btn[data-username]');
      if (unmuteBtn) {
        const username = unmuteBtn.dataset.username;
        if (username) {
          mutedUsers.delete(username);
          try { chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] }); } catch {}
          applyMcMutes();
          renderSettingsTab();
        }
        return;
      }

      const defaultsBtn = e.target.closest('.hs-mc-defaults-btn');
      if (defaultsBtn) {
        wysiwygEnabled = false;
        linksEnabled = true;
        viModeEnabled = false;
        zebraEnabled = true;
        autoHideInput = true;
        timestampsEnabled = false;
        avatarsEnabled = false;
        platformBadgesEnabled = true;
        showOfflineEvents = true;
        for (const [k, v] of Object.entries(INLINE_NOTIF_TYPES)) inlineNotifs[k] = v.defaultOn;
        for (const [k, v] of Object.entries(HERMES_EVENT_TYPES)) hermesToggles[k] = v.defaultOn;
        const settings = {
          wysiwygEnabled: false, linksEnabled: true, viMode: false,
          zebra: true, autoHideInput: true, timestamps: false,
          avatars: false, showPlatformBadges: true, showOfflineEvents: true,
          inlineNotifs: { ...inlineNotifs }, hermesEvents: { ...hermesToggles },
        };
        try { chrome.storage.local.get(['ui_settings']).then(s => chrome.storage.local.set({ ui_settings: { ...s.ui_settings, ...settings } })); } catch {}
        renderSettingsTab();
        return;
      }
    };
    msgsEl.addEventListener('click', msgsEl._hsSettingsClick);

    // Custom tooltip for settings labels (native title doesn't work in content scripts)
    let tip = document.getElementById('hs-settings-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'hs-settings-tip';
      document.body.appendChild(tip);
    }
    if (!msgsEl._hsSettingsTipBound) {
      msgsEl._hsSettingsTipBound = true;
      msgsEl.addEventListener('mouseenter', (e) => {
        const label = e.target.closest('.hs-mc-setting-label[data-tip]');
        if (!label) return;
        const t = document.getElementById('hs-settings-tip');
        if (!t) return;
        t.textContent = label.dataset.tip;
        const rect = label.getBoundingClientRect();
        t.style.left = rect.left + 'px';
        t.style.top = (rect.bottom + 4) + 'px';
        t.classList.add('visible');
      }, true);
      msgsEl.addEventListener('mouseleave', (e) => {
        const label = e.target.closest('.hs-mc-setting-label[data-tip]');
        if (label) { const t = document.getElementById('hs-settings-tip'); if (t) t.classList.remove('visible'); }
      }, true);
    }
  }









  function updateTabBar() {
    if (!tabBarElement) return;

    // Clear existing channel tabs (keep built-in tabs)
    const existingChannelTabs = tabBarElement.querySelectorAll('.hs-mc-tab[data-tab]:not([data-tab="live"]):not([data-tab="feed"]):not([data-tab="mentions"]):not([data-tab="whispers"]):not([data-tab="add"]):not([data-tab="rotate"]):not([data-tab="settings"])');
    existingChannelTabs.forEach(t => t.remove());

    // Add channel tabs before the + button (or append if no + button, e.g. Kick)
    const addBtn = tabBarElement.querySelector('[data-tab="add"]');
    const rotateBtn = tabBarElement.querySelector('[data-tab="rotate"]');
    const insertBefore = addBtn || rotateBtn;
    config.channels.forEach(ch => {
      const tab = document.createElement('button');
      tab.className = 'hs-mc-tab';
      const id = typeof ch === 'string' ? ch : ch.id;
      tab.dataset.tab = id;
      tab.textContent = id;
      if (insertBefore) insertBefore.before(tab);
      else tabBarElement.appendChild(tab);
    });

    // Update active state
    tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
  }

  // ============================================
  // STYLES (injected once)
  // ============================================

  function injectStyles() {
    if (document.getElementById('hs-mc-styles')) return;

    const style = document.createElement('style');
    style.id = 'hs-mc-styles';
    style.textContent = `
      /* Tab bar - positioned at top of chat via render injection */
      #hs-mc-tabbar {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 6px 10px;
        background: #000;
        border-bottom: 1px solid #fff;
        flex-shrink: 0;
        order: -1;
        z-index: 10;
      }

      /* Chatterino-style composable tab states: idle → has-new → active */
      .hs-mc-tab {
        padding: 3px 8px !important;
        background: #000 !important;
        color: #808080 !important;
        border: 1px solid #808080 !important;
        border-radius: 0 !important;
        cursor: pointer !important;
        font-family: inherit;
        font-size: 12px !important;
        line-height: 1 !important;
        transition: none;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      /* Idle hover — subtle brighten */
      .hs-mc-tab:not(.active):not(.has-new):hover {
        background: #fff !important;
        color: #000 !important;
      }
      /* New messages — activity indicator */
      .hs-mc-tab.has-new {
        background: #000 !important;
        color: #fff !important;
        border-color: #808080 !important;
      }
      /* Has-new hover */
      .hs-mc-tab.has-new:not(.active):hover {
        background: #fff !important;
        color: #000 !important;
      }
      /* Mentions — red when unseen */
      .hs-mc-tab.has-mentions {
        color: #ff0000 !important;
      }
      .hs-mc-tab.has-mentions:not(.active):hover {
        background: #fff !important;
        color: #ff0000 !important;
      }
      /* Active — focused tab */
      .hs-mc-tab.active {
        background: #fff !important;
        color: #000 !important;
        border-color: #fff !important;
        font-weight: 600;
      }
      /* Active ignores hover */
      .hs-mc-tab.active:hover {
        background: #fff !important;
        color: #000 !important;
      }
      .hs-mc-tab.has-new.active {
        color: #000 !important;
      }
      /* Stream event — yellow tab text (game switch) */
      .hs-mc-tab.has-stream-event {
        background: #000 !important;
        color: #ffff00 !important;
        border-color: #808080 !important;
      }
      .hs-mc-tab.has-stream-event:not(.active):hover {
        background: #fff !important;
        color: #000 !important;
      }
      .hs-mc-tab.has-stream-event.active {
        color: #000 !important;
      }
      /* Utility button row (T, A, A, ⚙) */
      .hs-mc-tab-utils {
        display: flex;
        gap: 4px;
        width: 100%;
      }
      .hs-mc-util-btn {
        flex: 1 !important;
        min-width: 0 !important;
        padding: 4px 0 !important;
        font-size: 13px !important;
        font-weight: 700 !important;
      }
      /* Whisper conversation list */
      .hs-whisper-conv {
        padding: 6px 8px;
        cursor: pointer;
        border-bottom: 1px solid #222;
      }
      .hs-whisper-conv:hover {
        background: #fff;
        color: #000;
      }
      .hs-whisper-conv:hover .hs-whisper-preview,
      .hs-whisper-conv:hover .hs-whisper-time {
        color: #444;
      }
      .hs-whisper-preview {
        color: #808080;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }
      .hs-whisper-time {
        color: #808080;
        font-size: 10px;
        float: right;
      }
      .hs-whisper-unread {
        background: #ff8700;
        color: #000;
        font-size: 10px;
        font-weight: 700;
        padding: 0 4px;
        border-radius: 0;
        margin-left: 4px;
      }
      .hs-whisper-header {
        padding: 6px 8px;
        border-bottom: 1px solid #444;
        font-size: 13px;
        position: sticky;
        top: 0;
        background: #000;
        z-index: 1;
      }
      .hs-whisper-back {
        cursor: pointer;
        margin-right: 6px;
        font-size: 14px;
      }
      .hs-whisper-back:hover {
        color: #ff8700;
      }
      .hs-whisper-self {
        opacity: 0.7;
      }
      /* Inline stream event notifications */
      .hs-mc-stream-event {
        padding: 2px 4px;
        font-size: 13px;
        line-height: 1.4;
        font-style: italic;
        background: rgba(128, 128, 0, 0.25);
        border-bottom: 1px solid #333;
        color: #ffff00;
      }
      .hs-mc-stream-event .hs-mc-user { text-decoration: none; font-weight: bold; }
      .hs-mc-stream-event .hs-mc-user:hover { text-decoration: underline; }
      .hs-mc-stream-event .hs-evt-game { color: #fff; font-style: normal; }
      .hs-mc-stream-event.event-online { color: #f44; }
      .hs-mc-stream-event.event-online .hs-evt-game { color: #fff; }
      .hs-mc-stream-event.event-offline { color: #808080; opacity: 1; }
      .hs-mc-stream-event.event-raid { color: #9146ff; }
      .hs-mc-stream-event.event-hype { color: #ff8700; }
      .hs-mc-stream-event.event-sub { color: #00ff7f; }
      .hs-mc-stream-event.event-redeem { color: #00bfff; }
      /* Inline feed posts in chat timeline */
      .hs-mc-feed-inline {
        padding: 2px 8px;
        font-size: 13px;
        border-left: 3px solid #ff0000;
        border-bottom: 1px solid #333;
        color: #ccc;
      }
      .hs-mc-feed-inline .hs-mc-ts { margin-right: 4px; }
      .hs-mc-feed-inline .hs-feed-body { color: #ddd; }
      .hs-mc-feed-inline .hs-feed-thread-link {
        color: #ffff00; text-decoration: none; font-size: 10px; margin-right: 4px;
      }
      .hs-mc-feed-inline .hs-feed-thread-link:hover { text-decoration: underline; }
      .hs-mc-dm-inline {
        border-left-color: #ffff00;
      }
      /* Live dot — red indicator, composes with any state */
      .hs-mc-tab {
        position: relative !important;
      }
      .hs-mc-tab[data-live="true"]::after {
        content: '';
        position: absolute;
        top: 2px;
        right: 2px;
        width: 6px;
        height: 6px;
        background: #f00;
        border-radius: 50%;
        pointer-events: none;
      }
      .hs-mc-tab.active[data-live="true"]::after {
        background: #cc0000;
      }

      /* Overlay - fills chat container (below tab bar, above input bar) */
      #hs-mc-overlay {
        position: absolute;
        top: 38px; /* Default; dynamically adjusted by ResizeObserver */
        left: 0;
        right: 0;
        bottom: 52px; /* Leave room for input bar */
        background: #000;
        z-index: 1000;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      #hs-mc-overlay.visible {
        display: flex;
      }

      /* Resize drag bar on left edge of chat column */
      #hs-mc-resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 5px;
        height: 100%;
        cursor: ew-resize;
        z-index: 2000;
        background: transparent;
        transition: none;
      }
      #hs-mc-resize-handle:hover,
      #hs-mc-resize-handle:active {
        background: #9147ff;
      }

      #hs-mc-messages {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px;
        font-size: var(--hs-chat-font, 13px) !important;
        line-height: 1.4 !important;
        word-wrap: break-word;
        word-break: break-word;
        max-width: 100%;
        box-sizing: border-box;
      }

      /* New messages button - floats above messages */
      #hs-mc-new-msgs {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 4px;
        background: rgba(255, 255, 0, 0.95);
        color: #000;
        border: none;
        border-radius: 0;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        z-index: 1005;
        box-shadow: 0 2px 12px rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        transition: none;
      }
      #hs-mc-new-msgs:hover {
        background: #fff;
        color: #000;
      }
      .hs-arrow-down {
        font-size: 18px;
        line-height: 0;
        position: relative;
        top: -1px;
      }

      /* UNIFIED INPUT BAR - always visible at bottom */
      #hs-mc-inputbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        gap: 6px;
        padding: 8px;
        background: #000;
        border-top: 1px solid #808080;
        z-index: 1002;
        box-sizing: border-box;
      }

      /* NUKE native Twitch chat when our overlay is active (FFZ-style class toggle) */
      /* Hide native chat messages container */
      .hs-native-hidden [class*="chat-scrollable-area__message-container"],
      .hs-native-hidden [class*="chat-list--default"],
      .hs-native-hidden [class*="chat-list--other"],
      .hs-native-hidden [data-a-target="chat-scroller"] {
        display: none !important;
      }
      /* Hide native chat input area */
      .hs-native-hidden [class*="chat-input-container"],
      .hs-native-hidden [data-a-target="chat-input"] {
        display: none !important;
      }
      /* Hide native chat header/room content — our elements are in #hs-mc-container (sibling) */
      .hs-native-hidden [class*="chat-room__content"] > * {
        display: none !important;
      }
      /* Collapse the native chat container itself so #hs-mc-container gets flex space */
      [class*="chat-room__content"].hs-native-hidden {
        display: none !important;
      }
      /* HeatSync container — sibling of React's chat-room__content, outside React's tree */
      #hs-mc-container {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        min-height: 0;
        overflow: hidden;
        background: #000;
        font-family: 'Courier New', Courier, monospace;
      }

      /* Vertical tabs: container gets row direction */
      .hs-tabs-left #hs-mc-container,
      .hs-tabs-right #hs-mc-container {
        flex-direction: row;
      }
      /* Keep chat-shell visible (our #hs-mc-container lives inside it) but hide native children */
      .chat-shell.hs-native-hidden,
      [class*="chat-shell"].hs-native-hidden {
        display: flex !important;
        flex-direction: column !important;
        height: 100% !important;
        min-width: 0 !important;
        background: #000 !important;
      }
      .chat-shell.hs-native-hidden > *:not(#hs-mc-container),
      [class*="chat-shell"].hs-native-hidden > *:not(#hs-mc-container) {
        display: none !important;
      }
      /* Ensure stream-chat ancestor also stays sized */
      [class*="stream-chat"].hs-native-hidden {
        display: flex !important;
        flex-direction: column !important;
        height: 100% !important;
      }
      .hs-native-hidden {
        background: #000 !important;
      }

      /* Never hide Twitch's native collapse/expand arrows — user needs them.
         Hide HS UI when chat is collapsed so it doesn't interfere with layout. */
      .right-column--collapsed #hs-mc-container {
        display: none !important;
      }
      /* Collapsed chat: width 0 but overflow visible so the toggle arrow
         (which is a grandchild) can still render outside the box */
      .right-column--collapsed {
        width: 0px !important;
        min-width: 0px !important;
        overflow: visible !important;
      }
      .right-column--collapsed > *:not(:has(.right-column__toggle-visibility)) {
        overflow: hidden !important;
        width: 0px !important;
        min-width: 0px !important;
      }
      .right-column--collapsed > *:has(.right-column__toggle-visibility) {
        overflow: visible !important;
      }
      .right-column--collapsed .right-column__toggle-visibility {
        transform: none !important;
        left: -32px !important;
        z-index: 50 !important;
      }
      div:has(> .right-column--collapsed) {
        width: 0px !important;
        min-width: 0px !important;
        overflow: visible !important;
      }
      /* Force collapse/expand arrow to white — Twitch light theme leaks
         into the toggle wrapper, making it black on dark background */
      .right-column__toggle-visibility button {
        color: #fff !important;
      }
      .right-column__toggle-visibility svg {
        fill: #fff !important;
      }

      /* Ensure our elements are visible */
      #hs-mc-tabbar {
        display: flex !important;
      }
      #hs-mc-inputbar {
        display: flex !important;
      }
      #hs-mc-inputbar.hs-hidden {
        display: none !important;
      }

      .hs-mc-ts {
        color: #555;
        font-size: 10px;
        margin-right: 4px;
        font-variant-numeric: tabular-nums;
      }
      .hs-mc-avatar {
        width: 18px;
        height: 18px;
        border-radius: 3px;
        vertical-align: middle;
        margin-right: 3px;
        object-fit: cover;
      }
      .hs-mc-msg {
        padding: 2px 4px;
        border-radius: 0;
        font-size: var(--hs-chat-font, 13px) !important;
        line-height: 1.4 !important;
        word-wrap: break-word;
        word-break: break-word;
        overflow-wrap: anywhere;
        overflow: hidden;
        max-width: 100%;
        box-sizing: border-box;
        color: #ffffff;
      }
      .hs-mc-msg.hs-mc-zebra, .hs-feed-msg.hs-mc-zebra {
        background: #111;
      }
      .hs-mc-msg:hover {
      }
      .hs-mc-msg[data-msg-id] {
        position: relative;
      }
      .hs-mc-reply-btn {
        display: none;
        position: absolute;
        top: 1px;
        right: 2px;
        background: #222;
        border: 1px solid #444;
        color: #aaa;
        font-size: 11px;
        padding: 0 4px;
        cursor: pointer;
        line-height: 18px;
        z-index: 10;
      }
      .hs-mc-reply-btn:hover {
        color: #000;
        background: #fff;
      }
      .hs-mc-msg[data-msg-id]:hover .hs-mc-reply-btn {
        display: block;
      }
      #hs-mc-reply-indicator {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #111;
        border-bottom: 1px solid #333;
        padding: 2px 6px;
        font-size: 11px;
        color: #aaa;
      }
      #hs-mc-reply-indicator span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #hs-mc-reply-cancel {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 13px;
        padding: 0 2px;
        line-height: 1;
      }
      #hs-mc-reply-cancel:hover {
        color: #000;
        background: #fff;
      }
      .hs-mc-muted {
        user-select: none;
      }
      .hs-mc-muted .hs-mc-user {
        color: #808080 !important;
        animation: none !important;
        background: none !important;
        -webkit-text-fill-color: #808080 !important;
      }
      .hs-mc-muted > :not(.hs-mc-user):not(.hs-mc-badge-img):not(.hs-mc-timestamp) {
        display: none !important;
      }
      .hs-mc-msg.hs-mc-system {
        border-left: 3px solid #9147ff;
        padding-left: 8px;
        background: rgba(145, 71, 255, 0.08);
      }
      .hs-mc-msg.hs-mc-kicks {
        border-left: 3px solid #ffd600;
        padding-left: 8px;
        background: rgba(255, 214, 0, 0.1);
      }
      .hs-mc-kicks .hs-mc-system-text {
        color: #ffd600;
        font-weight: 700;
      }
      .hs-mc-system-text {
        color: #b0b0b0;
        font-size: 12px;
        font-style: italic;
        display: block;
      }
      .hs-mc-msg.hs-mc-redeemed {
        background: rgba(145, 71, 255, 0.15);
        border-left: 3px solid #9147ff;
        padding-left: 8px;
      }
      .hs-mc-reply-ctx {
        font-size: 11px;
        color: #808080;
        padding: 1px 0 1px 8px;
        border-left: 2px solid #808080;
        margin-bottom: 1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-mc-reply-user {
        color: #808080;
        font-weight: 600;
      }
      .hs-mc-msg.mention {
        background: #800000;
      }
      .hs-mc-msg.mention .hs-mc-reply-ctx,
      .hs-mc-msg.mention .hs-mc-reply-user {
        color: #ccc;
        border-left-color: #ccc;
      }
      .hs-mc-msg.tweet {
        background: rgba(212, 73, 73, 0.3);
      }
      .hs-mc-user {
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      .hs-mc-link {
        color: #8080ff;
        text-decoration: none;
        word-break: break-all;
        position: relative;
      }
      .hs-mc-link:hover {
        text-decoration: underline;
      }
      .hs-mc-user.hs-user-highlight {
        background: #fff !important;
        color: #000 !important;
        -webkit-text-fill-color: #000 !important;
        border-radius: 2px;
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
      }
      .hs-mc-platform-badge {
        font-size: var(--hs-badge-font, 10px);
        margin-right: 3px;
        font-weight: 700;
        vertical-align: middle;
      }
      .hs-mc-platform-badge.hs-mc-pb-twitch { color: #9146ff; }
      .hs-mc-platform-badge.hs-mc-pb-kick { color: #53fc18; }
      .hs-mc-platform-badge.hs-mc-pb-yt { color: #ff0000; }
      .hs-mc-badge {
        display: inline-block;
        font-size: var(--hs-stat-badge-font, 9px);
        padding: 0 3px;
        border-radius: 0;
        margin-right: 2px;
        font-weight: 700;
        vertical-align: middle;
        line-height: var(--hs-stat-badge-line, 16px);
        letter-spacing: 0.3px;
        cursor: default;
      }
      .hs-mc-badge-img {
        display: inline !important;
        width: var(--hs-badge-img, 18px);
        height: var(--hs-badge-img, 18px);
        vertical-align: middle;
        margin-right: 2px;
        cursor: default;
      }

      /* Username hover tooltip - profile preview */
      #hs-user-tooltip {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #00ff00;
        border-radius: 0;
        padding: 10px 6px 6px 6px;
        display: none;
        min-width: 240px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      }
      #hs-user-tooltip.visible {
        display: flex;
      }
      #hs-user-tooltip .hs-pc-avatar {
        width: 32px;
        height: 32px;
        min-width: 32px;
        border: 1px solid #000;
        object-fit: cover;
        flex-shrink: 0;
        align-self: flex-start;
      }
      #hs-user-tooltip .hs-pc-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-left: 6px;
      }
      #hs-user-tooltip .hs-pc-header {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        line-height: 1.2;
      }
      #hs-user-tooltip .hs-pc-platform {
        font-size: 10px;
        padding: 1px 2px;
        font-weight: 900;
        border: 1px solid #000;
        white-space: nowrap;
        letter-spacing: 0.2px;
      }
      #hs-user-tooltip .hs-pc-platform.twitch {
        background: #9146ff;
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-platform.kick {
        background: #53fc18;
        color: #000;
      }
      #hs-user-tooltip .hs-pc-name {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        background: #fff;
        border: 1px solid #000;
        padding: 2px 3px;
        color: #000;
      }
      #hs-user-tooltip .hs-pc-role {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        border: 1px solid #000;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-role.admin { background: #ff0000; color: #fff; }
      #hs-user-tooltip .hs-pc-role.staff { background: #ff8800; color: #000; }
      #hs-user-tooltip .hs-pc-role.partner { background: #ffaa00; color: #000; }
      #hs-user-tooltip .hs-pc-role.affiliate { background: #808080; color: #fff; }
      #hs-user-tooltip .hs-pc-age {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        border: 1px solid #ffff00;
        background: transparent;
        color: #ffff00;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-bio {
        font-size: 12px;
        color: #fff;
        line-height: 1.3;
        margin: 2px 0;
        word-break: break-word;
      }
      #hs-user-tooltip .hs-pc-stats {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 10px;
        color: #fff;
        line-height: 1.2;
      }
      #hs-user-tooltip .hs-pc-stat {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        font-size: 11px;
        font-weight: 500;
        border: 1px solid #fff;
        background: transparent;
        color: #fff;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-stat.heat {
        background: #000;
        border: 1px solid #ff8700;
        padding: 2px 8px;
        font-size: 12px;
      }
      #hs-user-tooltip .hs-pc-stat.heat .hs-pc-num {
        font-weight: 900;
        font-size: 13px;
      }
      #hs-user-tooltip .hs-pc-stat.op {
        color: #ff0000;
        font-weight: 700;
        border-color: #ff0000;
      }
      #hs-user-tooltip .hs-pc-stat.mop {
        color: #ff00ff;
        font-weight: 700;
        border-color: #ff00ff;
      }
      #hs-user-tooltip .hs-pc-stat.re {
        color: #00ffff;
        font-weight: 700;
        border-color: #00ffff;
      }
      #hs-user-tooltip .hs-pc-rel {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 10px;
        line-height: 1.2;
      }
      #hs-user-tooltip .hs-pc-rel-badge {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-rel-badge.mutual { background: #00aaaa; color: #fff; }
      #hs-user-tooltip .hs-pc-rel-badge.supporter { background: #ff8700; color: #000; }
      #hs-user-tooltip .hs-pc-rel-badge.following { background: #0099ff; color: #fff; }
      #hs-user-tooltip .hs-pc-rel-badge.subbed { background: #9146ff; color: #fff; }
      #hs-user-tooltip .hs-pc-followage {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
        background: #00aa00;
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-followage.hs-pc-nofollow {
        background: transparent;
        color: #666;
        border: 1px solid #444;
      }
      #hs-user-tooltip .hs-pc-channel-follows {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
        background: #daa520;
        color: #000;
      }
      #hs-user-tooltip .hs-pc-sub-tenure {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
        background: #e91e8c;
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-loading {
        color: #808080;
        font-size: 11px;
      }
      .hs-mc-channel {
        color: #808080;
        font-size: 11px;
        margin-left: 4px;
      }
      .hs-mc-time {
        color: #808080;
        font-size: var(--hs-time-font, 10px);
        margin-right: 4px;
      }
      .hs-mc-empty {
        color: #808080;
        padding: 20px;
        text-align: center;
      }
      .hs-mc-emote {
        height: var(--hs-emote-size, 32px);
        width: auto;
        vertical-align: middle;
        margin: 0 2px;
        padding: 4px;
        border-radius: 0;
        transition: none;
        cursor: pointer;
        box-sizing: content-box;
      }
      .hs-mc-picker-emote {
        height: auto;
        max-height: 32px;
        max-width: 96px;
        width: auto;
        vertical-align: middle;
        margin: 0;
        padding: 4px;
        border-radius: 0;
        transition: none;
        cursor: pointer;
        box-sizing: content-box;
        object-fit: contain;
      }

      /* Emojis — double-size, stackable as overlay base */
      .hs-mc-emoji {
        font-size: 2em;
        line-height: 1;
        vertical-align: middle;
        display: inline-block;
      }

      /* 7TV ZERO-WIDTH OVERLAY EMOTE STACKING */
      .hs-mc-emote-stack {
        display: inline-block;
        position: relative;
        vertical-align: middle;
      }
      .hs-mc-emote-stack-emotes {
        display: inline-grid;
        place-items: center;
      }
      .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper,
      .hs-mc-emote-stack-emotes > .hs-mc-emoji {
        grid-area: 1 / 1;
      }
      .hs-mc-emote-stack-emotes > :first-child {
        z-index: 1;
      }
      .hs-mc-emote-stack-emotes > :not(:first-child) {
        z-index: 2;
        pointer-events: auto;
      }
      /* Overlay emote at native size, not constrained to base */
      .hs-mc-overlay-emote {
        height: auto !important;
        margin: 0 !important;
        pointer-events: auto;
      }

      /* EMOTE STACK EXPAND/COLLAPSE */
      .hs-mc-stack-collapse,
      .hs-mc-stack-block-all {
        display: none;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 0 2px;
        user-select: none;
      }
      .hs-mc-emote-stack.expanded {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes {
        background: #808080;
        border-radius: 0;
        padding: 2px 6px;
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .hs-mc-emote-stack.expanded > .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper {
        grid-area: auto;
      }
      .hs-mc-emote-stack.expanded .hs-mc-stack-collapse,
      .hs-mc-emote-stack.expanded .hs-mc-stack-block-all {
        display: inline-block;
      }
      .hs-mc-stack-collapse:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-stack-block-all:hover {
        background: #fff;
        color: #000;
      }

      /* STATE-BASED EMOTE COLORS (website parity) */
      /* Wrapper spans for solid color hover rectangles */
      .hs-mc-emote-wrapper {
        display: inline-block;
        position: relative;
        vertical-align: middle;
        cursor: pointer;
        line-height: 0;
        font-size: 0;
      }
      .hs-mc-emote-wrapper > img {
        display: block;
      }
      .hs-mc-emote-wrapper::before {
        content: '';
        position: absolute;
        inset: 4px;
        border-radius: 0;
        opacity: 0;
        transition: none;
        z-index: 1;
        pointer-events: none;
      }
      /* Hover: show solid color rect, hide image */
      .hs-mc-emote-wrapper.hs-emote-highlight::before {
        opacity: 1;
      }
      .hs-mc-emote-wrapper.hs-emote-highlight > img {
        visibility: hidden;
      }

      /* State colors via ::before */
      .hs-mc-emote-wrapper.hs-state-global::before { background: #00ff00; }
      .hs-mc-emote-wrapper.hs-state-owned::before { background: #00ff00; }
      .hs-mc-emote-wrapper.hs-state-unadded::before { background: #ff8700; }
      .hs-mc-emote-wrapper.hs-state-channel::before { background: #00ff00; }
      .hs-mc-emote-wrapper.hs-state-blocked::before { background: #ff0000; }

      /* Blocked emotes: hide img (keeps natural dimensions), dashed line via ::before */
      .hs-mc-emote-wrapper.hs-state-blocked > img {
        visibility: hidden;
      }
      .hs-mc-emote-wrapper.hs-state-blocked::before {
        opacity: 1;
        background: none;
        border: 2px dashed #808080;
      }
      .hs-mc-emote-stack.expanded .hs-mc-emote-wrapper.hs-state-blocked::before {
        border-color: #fff;
      }
      .hs-mc-emote-wrapper.hs-state-blocked.hs-emote-highlight::before {
        background: #ff0000;
        border: none;
      }

      /* Flash animations */
      @keyframes hs-flash-paste { 0% { box-shadow: 0 0 12px 4px #fff; } 100% { box-shadow: none; } }
      @keyframes hs-flash-add { 0% { box-shadow: 0 0 12px 4px #00ff00; } 100% { box-shadow: none; } }
      @keyframes hs-flash-block { 0% { box-shadow: 0 0 12px 4px #ff0000; } 100% { box-shadow: none; } }
      @keyframes hs-flash-unblock { 0% { box-shadow: 0 0 12px 4px #ffff00; } 100% { box-shadow: none; } }
      @keyframes hs-flash-remove { 0% { box-shadow: 0 0 12px 4px #fff; } 100% { box-shadow: none; } }
      .hs-flash-paste { animation: hs-flash-paste 0.4s ease-out; }
      .hs-flash-add { animation: hs-flash-add 0.4s ease-out; }
      .hs-flash-block { animation: hs-flash-block 0.4s ease-out; }
      .hs-flash-unblock { animation: hs-flash-unblock 0.4s ease-out; }
      .hs-flash-remove { animation: hs-flash-remove 0.4s ease-out; }

      /* Legacy img classes (for picker, tooltips) */
      .hs-mc-emote, .hs-mc-picker-emote {
        position: relative;
      }

      /* Emote hover tooltip - 4x preview */
      #hs-emote-tooltip {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #808080;
        border-radius: 0;
        padding: 8px;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      }
      #hs-emote-tooltip.visible {
        display: flex;
      }
      #hs-emote-tooltip img {
        object-fit: contain;
        image-rendering: pixelated;
      }
      #hs-emote-tooltip .tooltip-name {
        color: #fff;
        font-size: 13px;
        font-weight: 600;
      }
      #hs-emote-tooltip .tooltip-source {
        font-size: 11px;
        padding: 2px 6px;
        margin: 2px -8px -8px;
        border-radius: 0;
        color: #fff;
        width: calc(100% + 16px);
        text-align: center;
      }
      #hs-emote-tooltip .tooltip-source.owned { background: #00ff00; color: #000; }
      #hs-emote-tooltip .tooltip-source.unadded { background: #ff8700; color: #000; }
      #hs-emote-tooltip .tooltip-source.global { background: #00ff00; color: #000; }
      #hs-emote-tooltip .tooltip-source.channel { background: #00ff00; color: #000; }
      #hs-emote-tooltip .tooltip-source.blocked { background: #ff0000; color: #fff; }

      #hs-link-tooltip {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #808080;
        border-radius: 0;
        padding: 8px;
        display: none;
        flex-direction: row;
        gap: 8px;
        max-width: 350px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      }
      #hs-link-tooltip.visible { display: flex; }
      #hs-link-tooltip img {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 0;
        flex-shrink: 0;
      }
      #hs-link-tooltip .link-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        justify-content: center;
      }
      #hs-link-tooltip .link-title {
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      #hs-link-tooltip .link-desc {
        color: #aaa;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      #hs-link-tooltip .link-domain {
        color: #8080ff;
        font-size: 10px;
      }
      #hs-link-tooltip .link-loading {
        color: #888;
        font-size: 11px;
      }

      /* Input styles (used in #hs-mc-inputbar) */
      #hs-mc-input {
        flex: 1;
        padding: 8px 12px;
        background: #fff;
        color: #000;
        border: 1px solid #808080;
        border-radius: 0;
        font-size: 13px;
        font-family: inherit;
        outline: none;
      }
      #hs-mc-input:focus {
        border-color: #9147ff;
      }
      #hs-mc-input::placeholder {
        color: #808080;
      }
      /* Contenteditable placeholder */
      #hs-mc-input[contenteditable]:empty::before {
        content: attr(data-placeholder);
        color: #808080;
        pointer-events: none;
      }
      /* WYSIWYG emote images in input */
      #hs-mc-input .hs-input-emote {
        height: var(--hs-emote-size, 32px);
        vertical-align: middle;
        margin: 0 2px;
      }
      /* WYSIWYG zero-width emote stacking in input */
      #hs-mc-input .hs-input-stack {
        display: inline-grid;
        place-items: center;
        vertical-align: middle;
        margin: 0 2px;
      }
      #hs-mc-input .hs-input-stack > img {
        grid-area: 1 / 1;
        margin: 0;
      }
      #hs-mc-input .hs-input-stack > img:first-child { z-index: 1; }
      #hs-mc-input .hs-input-stack > img:not(:first-child) { z-index: 2; }
      .hs-mc-emoji {
        font-variant-emoji: emoji;
      }
      /* Toggle button */
      .hs-mc-toggle-btn {
        padding: 4px 10px;
        background: #000;
        color: #808080;
        border: none;
        border-radius: 0;
        font-size: 11px;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-toggle-btn:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-toggle-btn.active {
        background: #9147ff;
        color: #fff;
      }
      #hs-mc-input.over-limit {
        /* text color handled by highlight overlay */
      }
      /* Wrapper to position overlay over the input */
      #hs-mc-input-wrap {
        position: relative;
        flex: 1;
        display: flex;
      }
      #hs-mc-input-wrap #hs-mc-input { flex: 1; }
      /* Overlay that mirrors input text with overflow highlighting */
      #hs-mc-input-highlight {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        padding: 8px 12px;
        font-size: 13px;
        font-family: inherit;
        white-space: pre;
        overflow: hidden;
        pointer-events: none;
        border: 1px solid transparent;
      }
      #hs-mc-input-highlight .hl-safe { color: #000; }
      #hs-mc-input-highlight .hl-over { color: #ff4444; }
      #hs-mc-send {
        padding: 8px 12px;
        background: #9147ff;
        color: #fff;
        border: none;
        border-radius: 0;
        cursor: pointer;
        font-size: 14px;
      }
      #hs-mc-send:hover {
        background: #fff;
        color: #000;
      }

      /* Heatsync button */
      #hs-mc-emote-btn {
        padding: 4px;
        background: #000;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: none;
      }
      #hs-mc-emote-btn img {
        width: 24px;
        height: 24px;
        display: block;
      }
      #hs-mc-emote-btn:hover {
        background: #fff;
      }

      /* Emote picker panel — full-width section above inputbar */
      #hs-mc-emote-picker {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: min(400px, 60vh);
        background: #000;
        border-top: 1px solid #808080;
        z-index: 1003;
        overflow: hidden;
        flex-direction: column;
        font-family: inherit;
        box-sizing: border-box;
      }
      #hs-mc-emote-picker.visible {
        display: flex;
      }

      /* Picker tabs — pinned to bottom */
      #hs-mc-emote-picker .hs-mc-picker-tabs {
        display: flex !important;
        border-top: 1px solid #808080;
        flex-shrink: 0 !important;
        min-height: 0 !important;
        margin-top: auto !important;
        visibility: visible !important;
        opacity: 1 !important;
        background: #000 !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab {
        flex: 1 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        padding: 6px 4px !important;
        background: transparent !important;
        color: #808080 !important;
        border: none !important;
        cursor: pointer;
        font-size: 12px !important;
        font-weight: 600 !important;
        line-height: 1 !important;
        text-align: center;
        visibility: visible !important;
        opacity: 1 !important;
        height: auto !important;
        width: auto !important;
        overflow: visible !important;
        position: relative !important;
        transition: none;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab:hover {
        background: #fff !important;
        color: #000 !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab.active {
        color: #ff6b35 !important;
        background: transparent !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab.active:hover {
        background: #fff !important;
        color: #000 !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab.active::after {
        content: '';
        position: absolute;
        top: 0;
        left: 20%;
        right: 20%;
        height: 2px;
        background: #ff6b35;
      }
      .hs-mc-tab {
        flex: 1;
        padding: 12px;
        background: transparent;
        color: #808080;
        border: none;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        transition: none;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .hs-mc-tab:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-tab.active {
        color: #fff;
        background: #9147ff;
        border-bottom: 2px solid #9147ff;
        margin-bottom: -1px;
      }
      .hs-mc-tab-content {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        max-height: calc(min(400px, 60vh) - 42px) !important;
        overflow-y: auto !important;
      }
      /* Custom scrollbar — Chrome + Firefox */
      .hs-mc-tab-content,
      .hs-mc-picker-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.12) transparent;
      }
      .hs-mc-tab-content::-webkit-scrollbar,
      .hs-mc-picker-scroll::-webkit-scrollbar {
        width: 4px;
      }
      .hs-mc-tab-content::-webkit-scrollbar-track,
      .hs-mc-picker-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .hs-mc-tab-content::-webkit-scrollbar-thumb,
      .hs-mc-picker-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 0;
      }
      .hs-mc-tab-content::-webkit-scrollbar-thumb:hover,
      .hs-mc-picker-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.2);
      }
      .hs-mc-picker-scroll {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .hs-mc-picker-section-header {
        display: none;
      }
      .hs-mc-picker-section-count {
        color: #808080;
        font-size: 10px;
        background: rgba(255,255,255,0.06);
        padding: 1px 5px;
        border-radius: 0;
      }
      .hs-mc-picker-section-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
        padding: 6px;
      }
      .hs-mc-picker-header {
        padding: 8px !important;
        border-bottom: 1px solid rgba(255,255,255,0.08) !important;
        display: block !important;
        visibility: visible !important;
        background: #000 !important;
      }
      .hs-mc-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .hs-mc-search-icon {
        position: absolute;
        left: 10px;
        pointer-events: none;
        opacity: 0.4;
      }
      #hs-mc-emote-search {
        width: 100%;
        padding: 4px 8px 4px 28px;
        background: #fff;
        color: #000;
        border: 1px solid #808080;
        border-radius: 0;
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
        transition: none;
      }
      #hs-mc-emote-search:focus {
        border-color: #ff6b35;
      }
      #hs-mc-emote-search::placeholder {
        color: #808080;
      }
      .hs-mc-picker-emote {
        width: auto !important;
        height: auto !important;
        max-width: 96px !important;
        max-height: 32px !important;
        object-fit: contain !important;
        cursor: pointer !important;
        border-radius: 0 !important;
        padding: 4px !important;
        transition: none;
        display: inline-block !important;
        visibility: visible !important;
      }
      .hs-mc-picker-emote:hover {
      }
      .hs-mc-picker-empty {
        padding: 32px !important;
        text-align: center !important;
        color: #808080 !important;
        font-size: 13px !important;
        visibility: visible !important;
      }
      .hs-mc-picker-divider {
        height: 1px;
        background: rgba(255,255,255,0.06);
        margin: 4px 0;
      }

      /* Emote sizing default */
      :root {
        --hs-emote-size: 32px;
      }

      /* ═══ Twitch menu ═══ */
      .hs-mc-menu-item {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 10px 14px !important;
        cursor: pointer !important;
        color: #fff !important;
        transition: none;
        visibility: visible !important;
        border-left: 3px solid transparent;
        margin: 0 6px;
      }
      .hs-mc-menu-item:hover {
        background: #fff !important;
        border-left-color: #000;
      }
      .hs-mc-menu-item:active {
        background: #fff !important;
      }
      .hs-mc-menu-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,107,53,0.12);
        background: color-mix(in srgb, var(--menu-accent, #ff6b35) 12%, transparent);
        color: var(--menu-accent, #ff6b35);
        flex-shrink: 0;
        transition: none;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-icon {
        background: #000;
        color: #fff;
        transform: scale(1.08);
      }
      .hs-mc-menu-text {
        flex: 1;
        min-width: 0;
      }
      .hs-mc-menu-title {
        font-size: 13px;
        font-weight: 500;
        color: #fff;
        line-height: 1.3;
      }
      .hs-mc-menu-desc {
        font-size: 11px;
        color: #808080;
        line-height: 1.3;
        margin-top: 1px;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-title {
        color: #000;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-desc {
        color: #000;
      }
      .hs-mc-menu-arrow {
        color: #808080;
        flex-shrink: 0;
        transition: none;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-arrow {
        color: #000;
        transform: translateX(2px);
      }
      .hs-mc-menu-divider {
        height: 1px;
        background: rgba(255,255,255,0.06);
        margin: 4px 20px;
      }

      /* ═══ Predictions ═══ */
      .hs-mc-pred-loading {
        padding: 20px;
        text-align: center;
        color: #808080;
        font-size: 13px;
      }
      .hs-mc-pred-empty {
        padding: 20px;
        text-align: center;
      }
      .hs-mc-pred-empty-text {
        color: #808080;
        font-size: 13px;
      }
      .hs-mc-prediction {
        padding: 10px 12px;
      }
      .hs-mc-pred-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .hs-mc-pred-title {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        line-height: 1.3;
        flex: 1;
      }
      .hs-mc-pred-locked {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 0;
        background: rgba(255,255,255,0.1);
        color: #808080;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hs-mc-pred-timer {
        font-size: 12px;
        color: #ff6b35;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hs-mc-pred-balance {
        font-size: 12px;
        color: #808080;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .hs-mc-pred-outcomes {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .hs-mc-pred-outcome {
        background: rgba(255,255,255,0.04);
        border-radius: 0;
        padding: 8px 10px;
        border-left: 3px solid var(--oc, #387aff);
      }
      .hs-mc-pred-outcome-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .hs-mc-pred-outcome-title {
        font-size: 12px;
        color: #fff;
        font-weight: 500;
      }
      .hs-mc-pred-outcome-pct {
        font-size: 13px;
        font-weight: 700;
        color: var(--oc, #387aff);
        font-variant-numeric: tabular-nums;
      }
      .hs-mc-pred-bar-track {
        height: 4px;
        background: rgba(255,255,255,0.08);
        border-radius: 0;
        overflow: hidden;
        margin-bottom: 4px;
      }
      .hs-mc-pred-bar-fill {
        height: 100%;
        background: var(--oc, #387aff);
        border-radius: 0;
        transition: width 0.3s ease;
      }
      .hs-mc-pred-outcome-stats {
        font-size: 10px;
        color: #808080;
        margin-bottom: 6px;
      }
      .hs-mc-pred-bet-row {
        display: flex;
        gap: 4px;
        align-items: center;
        flex-wrap: wrap;
      }
      .hs-mc-pred-bet-btn {
        background: rgba(255,255,255,0.08);
        border: none;
        color: #808080;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-pred-bet-btn:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-pred-bet-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .hs-mc-pred-bet-custom {
        width: 52px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #808080;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 0;
        outline: none;
      }
      .hs-mc-pred-bet-custom:focus {
        border-color: var(--oc, #387aff);
      }
      .hs-mc-pred-bet-custom::-webkit-inner-spin-button,
      .hs-mc-pred-bet-custom::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .hs-mc-pred-bet-go {
        background: var(--oc, #387aff);
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-pred-bet-go:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-pred-bet-go:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .hs-mc-pred-bet-max {
        font-weight: 600;
        color: #ff8700;
      }
      .hs-mc-pred-bet-max:hover {
        background: #ff8700;
        color: #000;
      }

      /* Prediction states */
      .hs-mc-pred-status {
        font-size: 10px;
        padding: 2px 6px;
        white-space: nowrap;
        flex-shrink: 0;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hs-mc-pred-status-resolved {
        background: rgba(0,200,100,0.15);
        color: #00c864;
      }
      .hs-mc-pred-status-canceled {
        background: rgba(255,255,255,0.08);
        color: #808080;
      }

      /* Result banners */
      .hs-mc-pred-result {
        font-size: 13px;
        font-weight: 700;
        padding: 6px 10px;
        margin-bottom: 8px;
        text-align: center;
      }
      .hs-mc-pred-result-won {
        background: rgba(0,200,100,0.12);
        color: #00c864;
        border-left: 3px solid #00c864;
      }
      .hs-mc-pred-result-lost {
        background: rgba(255,60,60,0.1);
        color: #ff3c3c;
        border-left: 3px solid #ff3c3c;
      }
      .hs-mc-pred-result-refund {
        background: rgba(255,255,255,0.06);
        color: #808080;
        border-left: 3px solid #808080;
      }

      /* Outcome states */
      .hs-mc-pred-outcome-won {
        border-left-color: #00c864;
        background: rgba(0,200,100,0.08);
      }
      .hs-mc-pred-outcome-lost {
        opacity: 0.45;
      }
      .hs-mc-pred-outcome-yours {
        box-shadow: inset 0 0 0 1px rgba(255,135,0,0.3);
      }
      .hs-mc-pred-winner-badge {
        font-size: 9px;
        padding: 1px 5px;
        background: #00c864;
        color: #000;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        vertical-align: middle;
        margin-left: 4px;
      }

      /* ═══ Polls ═══ */
      .hs-mc-poll {
        padding: 10px 12px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .hs-mc-poll-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }
      .hs-mc-poll-title {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        line-height: 1.3;
        flex: 1;
      }
      .hs-mc-poll-status {
        font-size: 10px;
        padding: 2px 6px;
        white-space: nowrap;
        flex-shrink: 0;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hs-mc-poll-status-ended {
        background: rgba(255,255,255,0.08);
        color: #808080;
      }
      .hs-mc-poll-timer {
        font-size: 12px;
        color: #ff6b35;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hs-mc-poll-meta {
        font-size: 11px;
        color: #808080;
        margin-bottom: 8px;
      }
      .hs-mc-poll-choices {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hs-mc-poll-choice {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .hs-mc-poll-choice-track {
        flex: 1;
        height: 28px;
        background: rgba(255,255,255,0.06);
        position: relative;
        overflow: hidden;
      }
      .hs-mc-poll-choice-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: rgba(145,71,255,0.35);
        transition: width 0.3s ease;
      }
      .hs-mc-poll-choice-top .hs-mc-poll-choice-fill {
        background: rgba(145,71,255,0.6);
      }
      .hs-mc-poll-choice-voted .hs-mc-poll-choice-track {
        box-shadow: inset 0 0 0 1px rgba(255,135,0,0.3);
      }
      .hs-mc-poll-choice-label {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px;
        height: 28px;
      }
      .hs-mc-poll-choice-name {
        font-size: 12px;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-mc-poll-choice-pct {
        font-size: 12px;
        font-weight: 700;
        color: #9147ff;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        margin-left: 8px;
      }
      .hs-mc-poll-choice-top .hs-mc-poll-choice-pct {
        color: #bf8fff;
      }
      .hs-mc-poll-voted-check {
        color: #ff8700;
        font-weight: 700;
      }
      .hs-mc-poll-vote-btn {
        background: rgba(145,71,255,0.3);
        border: none;
        color: #bf8fff;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        cursor: pointer;
        white-space: nowrap;
        transition: none;
      }
      .hs-mc-poll-vote-btn:hover {
        background: #9147ff;
        color: #fff;
      }
      .hs-mc-poll-vote-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .hs-mc-pred-links {
        border-top: 1px solid rgba(255,255,255,0.06);
        margin-top: 8px;
        padding-top: 4px;
      }
      .hs-mc-pred-links .hs-mc-menu-item {
        padding: 6px 14px !important;
      }
      .hs-mc-pred-links .hs-mc-menu-icon {
        width: 28px;
        height: 28px;
      }

      /* ═══ Rewards ═══ */
      .hs-mc-rewards {
        border-top: 1px solid rgba(255,255,255,0.06);
        margin-top: 8px;
        padding-top: 8px;
      }
      .hs-mc-rewards-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 14px 6px;
      }
      .hs-mc-rewards-label {
        font-size: 10px;
        font-weight: 600;
        color: #808080;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hs-mc-rewards-balance {
        font-size: 11px;
        color: #808080;
      }
      .hs-mc-rewards-empty {
        font-size: 11px;
        color: #555;
        padding: 8px 14px;
      }
      .hs-mc-rewards-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 0 14px;
      }
      .hs-mc-reward-card {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: rgba(255,255,255,0.04);
        border-left: 2px solid var(--rc, #9147ff);
        cursor: pointer;
        transition: none;
      }
      .hs-mc-reward-card:hover {
        background: rgba(255,255,255,0.08);
      }
      .hs-mc-reward-unavailable {
        opacity: 0.4;
        cursor: default;
      }
      .hs-mc-reward-unavailable:hover {
        background: rgba(255,255,255,0.04);
      }
      .hs-mc-reward-img {
        flex-shrink: 0;
        object-fit: contain;
      }
      .hs-mc-reward-info {
        min-width: 0;
        overflow: hidden;
      }
      .hs-mc-reward-title {
        font-size: 11px;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-mc-reward-cost {
        font-size: 10px;
        color: #808080;
      }
      .hs-mc-reward-reason {
        font-size: 9px;
        color: #f5009b;
        margin-top: 1px;
      }
      .hs-mc-reward-input-row {
        grid-column: 1 / -1;
        display: flex;
        gap: 4px;
        padding: 4px 0;
      }
      .hs-mc-reward-input {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #fff;
        font-size: 11px;
        padding: 4px 6px;
        border-radius: 0;
        outline: none;
      }
      .hs-mc-reward-input:focus {
        border-color: #9147ff;
      }
      .hs-mc-reward-submit {
        background: #9147ff;
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-reward-submit:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-reward-submit:disabled {
        opacity: 0.5;
        cursor: default;
      }

      /* ═══ Chat Color Picker ═══ */
      .hs-mc-color-picker {
        margin-top: 4px;
      }
      .hs-mc-color-current {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 2px;
        vertical-align: -2px;
        margin-left: 6px;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .hs-mc-color-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        padding: 4px 14px;
      }
      .hs-mc-color-swatch {
        width: 20px;
        height: 20px;
        border-radius: 2px;
        cursor: pointer;
        border: 1px solid transparent;
        transition: none;
      }
      .hs-mc-color-swatch:hover {
        border-color: #fff;
        transform: scale(1.2);
      }
      .hs-mc-color-custom {
        display: flex;
        gap: 4px;
        padding: 4px 14px;
      }
      .hs-mc-color-hex {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #fff;
        font-size: 11px;
        padding: 3px 6px;
        font-family: inherit;
        border-radius: 0;
      }
      .hs-mc-color-hex:focus {
        border-color: #9147ff;
        outline: none;
      }
      .hs-mc-color-apply {
        background: #9147ff;
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        cursor: pointer;
      }
      .hs-mc-color-apply:hover {
        background: #fff;
        color: #000;
      }

      /* ═══ Chat Modes ═══ */
      .hs-mc-chat-modes {
        margin-top: 4px;
      }
      .hs-mc-modes-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 14px;
      }
      .hs-mc-mode-btn {
        font-size: 10px;
        padding: 3px 8px;
        background: rgba(255,255,255,0.06);
        color: #808080;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,0.08);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .hs-mc-mode-btn:hover {
        background: rgba(255,255,255,0.12);
        color: #fff;
      }
      .hs-mc-mode-btn.active {
        background: rgba(0,200,175,0.15);
        color: #00c8af;
        border-color: rgba(0,200,175,0.3);
      }

      /* ═══ Settings tab ═══ */
      .hs-mc-settings-group {
        padding: 4px 0;
      }
      .hs-mc-settings-group + .hs-mc-settings-group {
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .hs-mc-settings-group-title {
        font-size: 10px;
        font-weight: 600;
        color: #808080;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 10px 14px 4px;
      }
      .hs-mc-setting-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 6px 14px !important;
        font-size: 12px !important;
        color: #fff !important;
        visibility: visible !important;
      }
      .hs-mc-setting-row:nth-child(even) {
        background: rgba(255,255,255,0.03);
      }
      .hs-mc-setting-row:hover {
        background: rgba(255,255,255,0.06);
      }
      .hs-mc-setting-label {
        color: #ccc !important;
        font-size: 13px !important;
        cursor: help;
        border-bottom: 1px dotted #666;
      }
      #hs-settings-tip {
        position: fixed;
        z-index: 99999;
        background: #1a1a1a;
        color: #ddd;
        border: 1px solid #555;
        padding: 6px 8px;
        font-size: 11px;
        line-height: 1.4;
        max-width: 260px;
        pointer-events: none;
        display: none;
        font-family: 'Liberation Mono', monospace;
      }
      #hs-settings-tip.visible { display: block; }
      .hs-mc-setting-row .hs-mc-toggle-pill,
      .hs-mc-setting-row .hs-mc-size-btns {
        flex-shrink: 0;
      }
      .hs-mc-size-btns {
        display: flex;
        gap: 2px;
        background: #000;
        padding: 2px;
      }
      .hs-mc-size-btn {
        padding: 4px 10px !important;
        background: transparent !important;
        color: #808080 !important;
        border: none !important;
        border-radius: 0 !important;
        font-size: 11px !important;
        cursor: pointer !important;
        display: inline-block !important;
        visibility: visible !important;
        transition: none;
      }
      .hs-mc-size-btn:hover {
        background: #fff !important;
        color: #000 !important;
      }
      .hs-mc-size-btn.active {
        background: #ff6b35 !important;
        color: #fff !important;
      }
      .hs-mc-toggle-pill {
        width: 16px;
        height: 16px;
        background: #f00;
        border: none;
        border-radius: 0;
        cursor: pointer;
        padding: 0;
        transition: none;
        flex-shrink: 0;
      }
      .hs-mc-toggle-pill.active {
        background: #0f0;
      }
      .hs-mc-toggle-knob {
        display: none;
      }


      /* Ensure parent has relative positioning for overlay */
      .chat-scrollable-area__message-container {
        position: relative !important;
      }

      /* Parent of scrollable area needs proper sizing for absolute overlay */
      [class*="chat-room"] [class*="scrollable-area"] {
        position: relative !important;
      }

      /* Hide Twitch's native tab arrows when our tabs are present */
      #hs-mc-tabbar ~ [class*="tabs-buttons"],
      [class*="chat-header__tabs-buttons"],
      [class*="tabs__scroll-button"],
      .chat-room__content [class*="scroll-button"] {
        display: none !important;
      }

      /* Hide leaderboard carousel arrows */
      [aria-label="Previous leaderboard set"],
      [aria-label="Next leaderboard set"],
      .channel-leaderboard-header-rotating__users ~ button,
      [class*="channel-leaderboard"] button[aria-label*="leaderboard"] {
        display: none !important;
      }

      /* Rotation button styling */
      .hs-mc-rotate {
        margin-left: auto;
        background: #000 !important;
        font-weight: bold;
      }
      .hs-mc-rotate:hover {
        background: #fff !important;
        color: #000 !important;
      }

      /* RIGHT SIDE TABS LAYOUT - absolute position at right edge */
      .hs-tabs-right #hs-mc-tabbar {
        position: absolute !important;
        left: auto !important;
        right: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 90px;
        flex-direction: column;
        flex-shrink: 0;
        padding: 4px;
        gap: 2px;
        border-bottom: none;
        border-left: 1px solid #fff;
        border-radius: 0;
        background: #000;
        overflow-y: auto;
        z-index: 1001;
      }
      .hs-tabs-right .hs-mc-tab {
        padding: 4px 6px;
        font-size: 11px;
        min-width: auto;
        width: 100%;
        text-align: center;
        box-sizing: border-box;
        flex: 0 0 auto;
      }
      .hs-tabs-right .hs-mc-rotate {
        margin-left: 0;
        margin-top: auto;
      }
      .hs-tabs-right #hs-mc-overlay {
        top: 0;
        left: 0;
        right: 90px;
        bottom: 52px;
      }
      .hs-tabs-right #hs-mc-inputbar {
        left: 0;
        right: 90px;
        z-index: 1002;
      }
      .hs-tabs-right #hs-mc-emote-picker {
        left: 0;
        right: 90px;
      }

      /* BOTTOM TABS LAYOUT */
      .hs-tabs-bottom #hs-mc-tabbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 52px;
        top: auto;
        padding: 6px 10px;
        border-top: 1px solid #fff;
        border-bottom: none;
        z-index: 1001;
      }
      .hs-tabs-bottom #hs-mc-overlay {
        top: 0;
        bottom: 90px; /* tab bar + input bar */
      }
      .hs-tabs-bottom #hs-mc-emote-picker {
        bottom: 90px; /* tab bar + input bar */
      }

      /* LEFT SIDE TABS LAYOUT - flex child, no fixed positioning */
      .hs-tabs-left #hs-mc-tabbar {
        position: relative !important;
        left: auto !important;
        right: auto !important;
        top: auto !important;
        bottom: auto !important;
        width: 90px;
        flex-direction: column;
        flex-shrink: 0;
        order: -1;
        padding: 4px;
        gap: 2px;
        border-bottom: none;
        border-right: 1px solid #fff;
        border-radius: 0;
        background: #000;
        overflow-y: auto;
      }
      .hs-tabs-left .hs-mc-tab {
        padding: 4px 6px;
        font-size: 11px;
        min-width: auto;
        width: 100%;
        text-align: center;
        box-sizing: border-box;
        flex: 0 0 auto;
      }
      .hs-tabs-left .hs-mc-rotate {
        margin-left: 0;
        margin-top: auto;
      }
      .hs-tabs-left #hs-mc-overlay {
        top: 0;
        left: 90px;
        right: 0;
        bottom: 52px;
      }
      .hs-tabs-left #hs-mc-inputbar {
        left: 90px;
        right: 0;
        z-index: 1002;
      }
      .hs-tabs-left #hs-mc-emote-picker {
        left: 90px;
        right: 0;
      }

      /* Popout mode - full width (respects tab bar position) */
      .hs-popout #hs-mc-overlay {
        left: 0 !important;
        right: 0 !important;
        width: auto !important;
      }
      .hs-popout #hs-mc-inputbar {
        left: 0 !important;
        right: 0 !important;
        width: auto !important;
      }
      .hs-popout #hs-mc-resize-handle {
        display: none !important;
      }
      .hs-popout #hs-mc-emote-picker {
        left: 0 !important;
        right: 0 !important;
      }
      /* Popout with tabs on right - adjust for tab bar */
      .hs-popout.hs-tabs-right #hs-mc-overlay {
        right: 90px !important;
      }
      .hs-popout.hs-tabs-right #hs-mc-inputbar {
        right: 90px !important;
      }
      .hs-popout.hs-tabs-right #hs-mc-emote-picker {
        right: 90px !important;
      }
      /* Popout with tabs on left */
      .hs-popout.hs-tabs-left #hs-mc-overlay {
        left: 90px !important;
      }
      .hs-popout.hs-tabs-left #hs-mc-inputbar {
        left: 90px !important;
      }
      .hs-popout.hs-tabs-left #hs-mc-emote-picker {
        left: 90px !important;
      }

      /* ---- FEED MESSAGE CARDS ---- */
      .hs-feed-msg {
        padding: 2px 6px;
        line-height: 1.4;
        font-size: 13px;
        word-wrap: break-word;
        word-break: break-word;
      }
      .hs-feed-avatar {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        vertical-align: middle;
        margin-right: 3px;
      }
      .hs-feed-user {
        font-weight: 600;
        font-size: 13px;
        color: #fff;
        text-decoration: none;
      }
      .hs-feed-user:hover {
        background: #fff;
        color: #000 !important;
        text-decoration: none;
      }
      .hs-feed-time {
        font-size: 11px;
        color: #808080;
        margin: 0 3px;
      }
      .hs-feed-body {
        color: #fff;
      }
      .hs-feed-stat {
        font-size: 11px;
        margin: 0 2px;
        cursor: default;
      }
      .hs-feed-replies {
        cursor: pointer !important;
      }
      .hs-feed-thread-link {
        color: #ff0;
        font-size: 11px;
        font-weight: 700;
        margin-right: 3px;
        text-decoration: none;
      }
      .hs-feed-thread-link:hover {
        background: #fff;
        color: #000;
        text-decoration: none;
      }
      .hs-feed-replies:hover {
        background: #fff;
        color: #000 !important;
      }
      .hs-feed-tag {
        font-size: 10px;
        font-weight: 700;
        margin-right: 3px;
        vertical-align: middle;
      }
      .hs-feed-tag-op {
        color: #ff0000;
      }
      .hs-feed-tag-mop {
        color: #ff00ff;
      }
      .hs-feed-tag-re {
        color: #00ffff;
      }
      .hs-feed-heat-breathe {
        animation: hs-feed-heat-breathe 2.5s ease-in-out infinite;
      }
      @keyframes hs-feed-heat-breathe {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      .hs-thread-op {
        border-bottom: 1px solid #ff8700;
        padding-bottom: 4px;
        margin-bottom: 4px;
      }
      .hs-thread-container {
        margin-left: 12px;
        border-left: 2px solid #ff8700;
        padding-left: 8px;
        margin-bottom: 4px;
      }
      .hs-thread-reply {
        padding: 1px 4px;
        line-height: 1.3;
        font-size: 12px;
      }
      .hs-thread-reply.is-thread-op {
        border-left: 2px solid #ff00ff;
        margin-left: -2px;
        padding-left: 10px;
      }
      .hs-feed-loader {
        cursor: default;
        font-size: 12px;
      }

      /* ---- TEXT FORMATTING ---- */
      .hs-spoiler {
        background: #aaa;
        color: transparent;
        cursor: pointer;
        border-radius: 2px;
        padding: 0 2px;
        transition: none;
      }
      .hs-spoiler.revealed {
        background: transparent;
        color: inherit;
      }
      .hs-greentext {
        color: #789922;
      }
      .hs-inline-code {
        background: #2a2a2a;
        padding: 1px 4px;
        border-radius: 2px;
        font-family: monospace;
        font-size: 12px;
      }

      /* ---- NOTIFICATIONS ---- */
      .hs-notif {
        padding: 10px 12px;
        border-bottom: 1px solid #808080;
        cursor: pointer;
        transition: none;
      }
      .hs-notif:hover {
        background: #fff;
      }
      .hs-notif:hover,
      .hs-notif:hover *:not(.hs-spoiler:not(.revealed)) {
        color: #000 !important;
      }
      .hs-notif-header {
        padding: 8px 12px;
        font-size: 12px;
        color: #ff6b35;
        border-bottom: 1px solid #808080;
      }

      /* ---- TAB BADGE ---- */
      .hs-mc-tab .hs-badge {
        background: #ff6b35;
        color: #fff;
        border-radius: 50%;
        font-size: 10px;
        min-width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 0 3px;
      }

      /* ---- KICK NATIVE CHAT HIDING ---- */
      .hs-native-hidden #chatroom-messages,
      .hs-native-hidden [class*="chatroom-footer"],
      .hs-native-hidden [class*="chat-input"],
      .hs-native-hidden div.editor-input {
        display: none !important;
      }
      .hs-native-hidden#channel-chatroom > *:not(#hs-mc-container):not(#hs-kick-resize-handle) {
        display: none !important;
      }
      /* Force Kick chatroom into a fixed side panel — Kick stacks chat below video
         which collapses to ~0px. Override to fixed right panel like Twitch. */
      .hs-native-hidden#channel-chatroom {
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: var(--hs-kick-chat-width, 340px) !important;
        height: 100vh !important;
        z-index: 9999 !important;
        display: flex !important;
        flex-direction: column !important;
        background: #000 !important;
        transition: none !important;
      }
      /* Shrink Kick's main content to make room for HeatSync panel */
      body:has(.hs-native-hidden#channel-chatroom) main {
        margin-right: var(--hs-kick-chat-width, 340px) !important;
        transition: none !important;
      }
      /* On live tab (native chat showing), hide overlay + input but keep tabs visible */
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-overlay,
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-emote-picker,
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > .hs-mc-inputbar,
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-kick-resize-handle {
        display: none !important;
      }
      /* Keep tabbar visible over native chat — fixed panel, same width as HS chat */
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        width: var(--hs-kick-chat-width, 340px) !important;
        height: auto !important;
        z-index: 10000 !important;
        background: transparent !important;
        pointer-events: none;
        overflow: visible !important;
        flex-direction: column !important;
      }
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-tabbar {
        pointer-events: auto;
        background: var(--hs-bg, #18181b) !important;
        position: relative !important;
        flex-direction: row !important;
        overflow: visible !important;
        height: auto !important;
        width: 100% !important;
        flex-wrap: wrap;
      }

      /* Kick resize handle — left edge of fixed chat panel
         8px hit zone, 2px visible bar on hover */
      #hs-kick-resize-handle {
        position: absolute;
        top: 0;
        left: -4px;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        z-index: 10000;
        background: transparent;
      }
      #hs-kick-resize-handle::after {
        content: '';
        position: absolute;
        top: 0;
        left: 3px;
        width: 2px;
        height: 100%;
        background: transparent;
        transition: background 0.15s;
      }
      #hs-kick-resize-handle:hover::after {
        background: #ff8700;
      }
      body:has(#hs-resize-overlay) #hs-kick-resize-handle::after {
        background: #ff8700;
      }

      /* Prevent channel accent color bleed on offline/home pages */
      .channel-root--home {
        background-color: #000 !important;
      }
      .root-scrollable__content {
        background: #000;
      }
      /* Collapsed chat rules moved to injectStyles() so they're always active */
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // RENDER PATCHING (FFZ-STYLE CORE)
  // ============================================

  /**
   * Patch a component's render method to inject our UI
   * This is the FFZ approach - modify render output, don't manipulate DOM
   */
  function patchChatRoomRender(component) {
    if (!component?.instance?.render) {
      log('Cannot patch - no render method');
      return false;
    }

    const inst = component.instance;
    if (inst._hs_multichat_patched) {
      log('Already patched');
      return true;
    }

    originalRender = inst.render.bind(inst);

    inst.render = function() {
      const result = originalRender();

      // If result is null or not an object, return as-is
      if (!result || typeof result !== 'object') return result;

      // Clone the result to avoid mutating React's internals
      // We'll inject our tab bar at the top level
      // Elements are in #hs-mc-container (outside React's tree)
      // so no need to re-inject on every render

      return result;
    };

    inst._hs_multichat_patched = true;
    log('✅ Patched chat room render');

    // Force initial re-render
    if (typeof inst.forceUpdate === 'function') {
      inst.forceUpdate();
    }

    return true;
  }

  /**
   * FFZ-style: Fix chat column transform bug
   * Twitch applies translateX(-34rem) even when --expanded class is set
   * We fix this persistently via multiple layers
   */

  // Layer 1: CSS override (always active, catches most cases)
  function injectTransformOverrideCss() {
    if (document.getElementById('hs-chat-transform-fix')) return;
    const style = document.createElement('style');
    style.id = 'hs-chat-transform-fix';
    style.textContent = `
      /* Fix inner column transform — must be 'none', not translateX(0),
         because any transform value creates a containing block that breaks
         position:fixed on descendant elements (tab bar goes off-screen) */
      .channel-root__right-column--expanded {
        transform: none !important;
      }
      /* Fix collapse/expand arrow — Twitch applies translateX(-340px) to
         slide it with the chat panel animation, but our layout changes make
         the transform wrong. Kill both transform and its transition (the
         transition fights !important by interpolating from the old value). */
      .right-column__toggle-visibility {
        transform: none !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
    log('✅ Injected chat column CSS fixes');
  }

  // Fix inline transform that Twitch's CSS-in-JS sets on the inner column.
  // CSS rule handles the class-based override; this catches inline style overrides.
  function fixChatTransform() {
    const expanded = document.querySelector('.channel-root__right-column--expanded');
    if (!expanded) return false;

    const transform = expanded.style.transform || getComputedStyle(expanded).transform;
    if (transform && transform !== 'none') {
      expanded.style.setProperty('transform', 'none', 'important');
      return true;
    }
    return false;
  }

  // Layer 3: Watch for class/style changes on BOTH column elements
  let columnObserver = null;
  function startColumnClassWatcher() {
    if (columnObserver) return; // Already watching

    const inner = document.querySelector('.channel-root__right-column');
    const outer = document.querySelector('.right-column.right-column--beside');

    if (!inner && !outer) return;

    columnObserver = cleanup.trackObserver(new MutationObserver(() => {
      // When class/style changes, fix both elements
      cleanup.raf(() => {
        fixChatTransform();
        applyChatWidth()
      }, 'column-transform-fix');
    }), 'column-class-watcher');

    const config = { attributes: true, attributeFilter: ['class', 'style'] };

    if (inner) columnObserver.observe(inner, config);
    if (outer) columnObserver.observe(outer, config);

    log('✅ Started column watchers (inner + outer)');
  }

  // Polling removed — CSS rule + MutationObserver handle all cases.
  // The 500ms polling was redundant and caused layout fighting.

  function ensureChatColumnVisible() {
    // CSS override + observer (no polling, no parent walking)
    injectTransformOverrideCss();
    startColumnClassWatcher();

    // One-time fix for current state
    fixChatTransform();

    // Return the chat column for injection purposes
    return document.querySelector('[data-a-target="right-column-chat-bar"]') ||
           document.querySelector('.channel-root__right-column');
  }

  /**
   * Alternative approach: Use MutationObserver + strategic element injection
   * This is more reliable than render patching for layout elements
   */
  /**
   * Get or create the HeatSync container OUTSIDE React's DOM tree.
   * Placed as a sibling of chatRoom so React can't destroy our elements.
   */
  function getOrCreateHsContainer(chatRoom) {
    let container = document.getElementById('hs-mc-container')
    if (container && document.contains(container)) return container
    container = document.createElement('div')
    container.id = 'hs-mc-container'
    // On Kick: append directly to #channel-chatroom (must be direct child for CSS rules)
    // On Twitch: insert into chat-shell (which has proper dimensions)
    const parent = isKick
      ? chatRoom
      : (document.querySelector('.chat-shell') || document.querySelector('[class*="chat-shell"]') || chatRoom.parentElement)
    parent.appendChild(container)
    log('Created #hs-mc-container in', parent.tagName + '.' + [...parent.classList].join('.'))
    return container
  }

  function ensureUIElements() {
    // Always watch for collapse/expand class changes so we can clean up
    // inline styles when the user clicks the expand arrow
    startColumnClassWatcher();

    // Don't fight Twitch when chat is collapsed — let the native expand arrow work
    const rightCol = document.querySelector('.right-column')
    const collapsed = rightCol && rightCol.classList.contains('right-column--collapsed')

    if (collapsed) return

    // Make sure chat column is visible (only when expanded)
    ensureChatColumnVisible();

    // Find the React-controlled chat room
    const chatRoom = isKick
      ? (document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]'))
      : (document.querySelector('[class*="chat-room__content"]') ||
         document.querySelector('[data-a-target="chat-room-component"]') ||
         document.querySelector('.chat-shell') ||
         document.querySelector('[class*="stream-chat"]') ||
         document.querySelector('.chat-room'));

    if (!chatRoom) return;

    // Transform fix handled by CSS (#hs-chat-transform-fix) + MutationObserver.
    // No parent tree walking — it displaced the collapse arrow.

    // Get our container outside React's tree
    const container = getOrCreateHsContainer(chatRoom)

    // Ensure tab bar exists
    if (!tabBarElement || !document.contains(tabBarElement)) {
      const existing = document.getElementById('hs-mc-tabbar');
      if (existing) {
        tabBarElement = existing;
        log('Reclaimed existing tab bar');
      } else {
        tabBarElement = createTabBar();
        updateTabBar();
        if (!liveStatusInterval) startLiveStatusPolling();
        log('Created tab bar');
      }
    }
    if (!container.contains(tabBarElement)) {
      container.insertBefore(tabBarElement, container.firstChild);
      log('Inserted tab bar into container');
    }

    // Ensure overlay exists
    if (!overlayElement || !document.contains(overlayElement)) {
      const existing = document.getElementById('hs-mc-overlay');
      if (existing) {
        overlayElement = existing;
        log('Reclaimed existing overlay');
      } else {
        overlayElement = createOverlay();
        log('Created overlay');
      }
    }
    if (!container.contains(overlayElement)) {
      container.appendChild(overlayElement);
      log('Injected overlay into container');
    }

    // Ensure emote picker panel exists (between overlay and inputbar)
    let pickerEl = document.getElementById('hs-mc-emote-picker');
    if (!pickerEl) {
      pickerEl = document.createElement('div');
      pickerEl.id = 'hs-mc-emote-picker';
    }
    if (!container.contains(pickerEl)) {
      container.appendChild(pickerEl);
    }

    // Ensure input bar exists
    if (!inputBarElement || !document.contains(inputBarElement)) {
      inputBarElement = createInputBar();
      // Start hidden — typing reveals it
      if (autoHideInput) {
        inputBarElement.classList.add('hs-hidden')
        inputBarVisible = false
      }
      log('Created input bar');
    }
    if (!container.contains(inputBarElement)) {
      container.appendChild(inputBarElement);
      log('Injected input bar into container');

      // Restore pending message if any
      const input = document.getElementById('hs-mc-input');
      if (input && pendingMessage) {
        input.value = pendingMessage;
      }
    }

    // Sync overlay top with tabbar height (handles wrapped tabs)
    // Skip for vertical tabs — CSS handles positioning
    if (tabBarElement && overlayElement && !resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        if (!tabBarElement || !overlayElement) return
        if (tabPosition === 'left' || tabPosition === 'right') {
          overlayElement.style.top = '0';
          return;
        }
        const h = tabBarElement.getBoundingClientRect().height;
        if (h > 0) overlayElement.style.top = h + 'px';
      });
      resizeObserver.observe(tabBarElement);
      cleanup.trackObserver(resizeObserver);
      if (tabPosition !== 'left' && tabPosition !== 'right') {
        const h = tabBarElement.getBoundingClientRect().height;
        if (h > 0) overlayElement.style.top = h + 'px';
      }
    }

    // Auto-show overlay if not already visible
    if (overlayElement && !overlayElement.classList.contains('visible')) {
      overlayElement.classList.add('visible');
      if (!currentTab) {
        currentTab = 'live';
        if (tabBarElement) {
          tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === 'live');
          });
        }
      }
      renderMessages(currentTab);
      log('Auto-showed overlay on load');
    }

    // Ensure resize handle exists on left edge of chat panel
    if (isKick) {
      setupKickResizeHandle()
    } else {
      setupResizeHandle()
    }

    // Always ensure native chat is hidden when our UI is active
    if (!(isKick && currentTab === 'live')) {
      setNativeChatHidden(true);
    }
  }

  // ============================================
  // TAB/CHANNEL MANAGEMENT
  // ============================================

  function switchTab(id) {
    log('switchTab called:', id);
    editingChannel = false;

    // Clicking feed tab while in thread view → go back to feed, don't switch tabs
    if (id === 'feed' && currentTab === 'feed' && activeThread) {
      closeThread();
      return;
    }

    // Close thread view when leaving feed
    if (currentTab === 'feed' && id !== 'feed') {
      activeThread = null;
    }
    currentTab = id;

    // Mark mentions as seen when switching to that tab
    if (id === 'mentions') {
      mentionsSeenCount = mentionsBuffer.length;
      updateTabBadges();
    }

    // Clear whisper unread when switching to whispers tab
    if (id === 'whispers') {
      whisperLastViewedTime = Date.now()
      whisperTotalUnread = 0
      updateWhisperBadge()
      whisperSaveDebounced()
    }

    // Persist active tab across refreshes/popouts (skip transient tabs)
    if (id !== 'add') {
      try {
        chrome.storage.local.get(['ui_settings']).then(stored => {
          try {
            const settings = stored.ui_settings || {};
            settings.activeTab = id;
            settings.liveChannel = liveChannel;
            chrome.storage.local.set({ ui_settings: settings });
          } catch (e) { /* context invalidated */ }
        }).catch(() => {});
      } catch (e) { /* context invalidated */ }
    }

    // Update tab bar active state
    if (tabBarElement) {
      const liveCh = getLiveChannel()?.toLowerCase()
      tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === id);
        if (t.dataset.tab === id) {
          t.classList.remove('has-new');
          t.classList.remove('has-stream-event');
          t.classList.remove('has-mentions');
        }
        // Switching to live also clears the matching channel tab's indicators
        if (id === 'live' && liveCh && t.dataset.tab !== 'live') {
          const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === t.dataset.tab)
          if (ch) {
            const tw = (typeof ch === 'string' ? ch : ch.twitch)?.toLowerCase()
            const ki = (typeof ch === 'string' ? undefined : ch.kick)?.toLowerCase()
            if (tw === liveCh || ki === liveCh) {
              t.classList.remove('has-new', 'has-stream-event', 'has-mentions')
            }
          }
        }
        // Switching to a channel tab that matches live clears the live tab too
        if (id !== 'live' && liveCh && t.dataset.tab === 'live') {
          const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === id)
          if (ch) {
            const tw = (typeof ch === 'string' ? ch : ch.twitch)?.toLowerCase()
            const ki = (typeof ch === 'string' ? undefined : ch.kick)?.toLowerCase()
            if (tw === liveCh || ki === liveCh) {
              t.classList.remove('has-new', 'has-stream-event', 'has-mentions')
            }
          }
        }
      });
    }

    // Update live tab label when switching to it
    if (id === 'live') updateLiveTabLabel();

    // Reset scroll state BEFORE rendering - always start at bottom when switching tabs
    isScrolledUp = false;
    newMessageCount = 0;
    const newBtn = document.getElementById('hs-mc-new-msgs');
    if (newBtn) newBtn.style.display = 'none';

    // Kick live tab: show native chat only when viewing the page's own channel
    if (isKick && id === 'live' && (!liveChannel || liveChannel === getCurrentChannel()?.toLowerCase())) {
      setNativeChatHidden(false);
      if (overlayElement) overlayElement.classList.remove('visible');
      if (inputBarElement) inputBarElement.classList.add('hs-hidden');
      return;
    }

    // Hide input bar on add-channel form, or when auto-hide is on
    if (inputBarElement) {
      const pickerOpen = document.getElementById('hs-mc-emote-picker')?.classList.contains('visible');
      if (id === 'add') {
        inputBarElement.classList.add('hs-hidden');
        inputBarVisible = false;
      } else if (autoHideInput && !pickerOpen) {
        const input = document.getElementById('hs-mc-input')
        const hasContent = input && ((input.value || input.textContent || '').trim().length > 0 || input.querySelector('img, span.hs-mc-emoji'))
        if (hasContent) {
          inputBarElement.classList.remove('hs-hidden')
          inputBarVisible = true
        } else {
          inputBarElement.classList.add('hs-hidden')
          inputBarVisible = false
        }
      } else {
        inputBarElement.classList.remove('hs-hidden');
        inputBarVisible = true;
      }
    }

    if (overlayElement) {
      overlayElement.classList.add('visible');
      // Sync overlay bottom with input bar visibility
      if (!inputBarVisible) overlayElement.style.bottom = '0'
      renderMessages(id);
    } else {
      log('No overlay element to show!');
    }

    // Update input placeholder for new tab
    updateInputPlaceholder();

    // Hide native chat when our overlay is active
    setNativeChatHidden(true);
  }

  /**
   * Toggle native Twitch chat visibility (FFZ-style)
   * Adds class to parent container rather than relying on :has() selector
   */
  function setNativeChatHidden(hidden) {
    if (isKick) {
      // Kick selectors
      const chatroom = document.getElementById('channel-chatroom') ||
                       document.querySelector('[id*="chatroom"]');
      if (chatroom) chatroom.classList.toggle('hs-native-hidden', hidden);
      return;
    }

    // Twitch: Add class to chat-shell (outermost container)
    const chatShell = document.querySelector('.chat-shell') ||
                      document.querySelector('[class*="chat-shell"]');
    if (chatShell) {
      chatShell.classList.toggle('hs-native-hidden', hidden);
    }

    // Add class to chat-room__content (where our elements are injected)
    const chatRoom = document.querySelector('[class*="chat-room__content"]') ||
                     document.querySelector('[data-a-target="chat-room-component"]');
    if (chatRoom) {
      chatRoom.classList.toggle('hs-native-hidden', hidden);
    }

    // Also try stream-chat for popout mode
    const streamChat = document.querySelector('.stream-chat') ||
                       document.querySelector('[class*="stream-chat"]');
    if (streamChat) {
      streamChat.classList.toggle('hs-native-hidden', hidden);
    }
  }

  function updateTabBadges() {
    if (!tabBarElement) return;
    const mentionsTab = tabBarElement.querySelector('[data-tab="mentions"]');
    if (mentionsTab) {
      const unseenMentions = mentionsBuffer.length - mentionsSeenCount;
      mentionsTab.textContent = 'mentions';
      mentionsTab.classList.toggle('has-mentions', unseenMentions > 0);
    }
  }



  // Dedup helper: check against actual message buffers (survives WS reconnects)
  function isYtDuplicate(user, text, channelId) {
    const buf = channelYtMessages.get(channelId)
    if (!buf || buf.length === 0) return false
    // check last 200 messages in buffer (matches server recentMessages cap)
    const start = Math.max(0, buf.length - 200)
    const needle = `${user}:${text.slice(0, 50)}`
    for (let i = buf.length - 1; i >= start; i--) {
      const m = buf[i]
      if (`${m.user}:${m.text.slice(0, 50)}` === needle) return true
    }
    return false
  }

  // Build a message div element (shared by full rebuild and incremental append)
  // Note: innerHTML here is safe — badges/emotes are from extension data, user text
  // goes through escapeHtml() and processEmotes() which sanitize content
  function buildMessageDiv(m, tabId) {
    // Stream event — render as magenta inline notification
    if (m.type === 'stream-event') {
      const div = document.createElement('div')
      div.className = `hs-mc-stream-event ${m.eventClass || ''}`
      const tsVal = timestampsEnabled && m.time ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      const ch = m.channel || ''
      // Look up color: event data → color map → profile cache → IRC buffers → async fetch
      let userColor = m.color || ''
      if (!userColor) userColor = streamColorMap.get(ch) || ''
      if (!userColor) {
        const cached = _profileCache.get(ch)
        if (cached?.profile?.twitch_color) userColor = cached.profile.twitch_color
      }
      if (!userColor && ch && irc?.channels) {
        for (const [, buf] of irc.channels) {
          const msgs = buf.getAll()
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].user?.toLowerCase() === ch) {
              userColor = msgs[i].color || ''
              break
            }
          }
          if (userColor) break
        }
      }
      // Build structured HTML: [username] ◆ action game
      if (!userColor) userColor = '#fff'
      const colorStyle = `color:${sanitizeColor(userColor)}`
      const userLink = `<a href="https://twitch.tv/${encodeURIComponent(ch)}" target="_blank" class="hs-mc-user hs-evt-user" data-username="${escapeHtml(ch)}" style="${colorStyle}">${escapeHtml(ch)}</a>`
      const textAfterChannel = escapeHtml(m.text).replace(/^\[[^\]]+\]\s*/, '')
      const actionHtml = textAfterChannel.replace(/(switched to |now playing |went live \u2014 )(.+)$/, '$1<span class="hs-evt-game">$2</span>')
      div.innerHTML = `${tsSpan}${userLink} ${actionHtml}`
      // Async fetch color if not cached
      if (!userColor && ch) {
        apiFetch(`/api/profile/${encodeURIComponent(ch)}`).then(resp => {
          if (resp?.ok && resp.data?.profile) {
            const profile = resp.data.profile
            const color = profile.twitch_color
            if (color) {
              const el = div.querySelector('.hs-evt-user')
              if (el) el.style.color = sanitizeColor(color)
            }
            _profileCache.set(ch, { profile, ts: Date.now() })
          }
        })
      }
      return div
    }

    // Inline feed post — uses notification type colors from registry
    if (m.type === 'feed-post') {
      const div = document.createElement('div')
      div.className = 'hs-mc-feed-inline'
      div.dataset.msgId = m.base36_id || ''
      const isOp = m.is_op != null ? !!m.is_op : (!m.reply_to || m.reply_to === '')
      const isThreadOp = !!m.is_thread_op
      const notifType = isThreadOp ? 'mop' : isOp ? 'op' : 're'
      const typeDef = INLINE_NOTIF_TYPES[notifType]
      const borderColor = m.inlineNotifBorderColor || typeDef?.borderColor || '#ff8700'
      div.style.borderLeftColor = borderColor
      const tsVal = timestampsEnabled ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      const tagColor = typeDef?.color || '#ff0000'
      const tagLabel = isThreadOp || isOp ? '[OP]' : '[RE]'
      const typeTag = `<span class="hs-feed-tag" style="color:${tagColor};font-size:10px;margin-right:3px">${tagLabel}</span>`
      const shortId = (m.base36_id || '').replace(/^0+/, '') || '0'
      const threadLink = `<a href="https://heatsync.org/post/${encodeURIComponent(m.base36_id)}" target="_blank" class="hs-feed-thread-link">&gt;&gt;${escapeHtml(shortId)}</a>`
      const userLink = `<a href="https://heatsync.org/user/${encodeURIComponent(m.feedUser)}" target="_blank" class="hs-mc-user" data-username="${escapeHtml((m.feedUser || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.color || '#fff')}">${escapeHtml(m.feedUser || 'anon')}</a>`
      const content = renderFeedContent(m.text, m.emote_refs)
      const hd = getHeatDisplay(m.heat)
      const heatHtml = hd ? ` <span style="font-weight:700;color:${hd.color}${hd.glow ? ';text-shadow:0 0 6px rgba(255,135,0,0.8)' : ''}">${hd.emoji || ''}${m.heat}</span>` : ''
      // All values sanitized — safe innerHTML (heat is numeric, emoji/color are hardcoded)
      div.innerHTML = `${tsSpan}${threadLink}${typeTag}${userLink}${heatHtml}: <span class="hs-feed-body">${content}</span>`
      div.addEventListener('click', (e) => {
        const spoiler = e.target.closest('.hs-spoiler')
        if (spoiler) { spoiler.classList.toggle('revealed'); return }
        if (e.target.closest('a, .hs-mc-emote, .hs-mc-link')) return
        switchTab('feed')
        openThread(m.reply_to || m.base36_id)
      })
      return div
    }

    // Inline DM/whisper notification
    if (m.type === 'inline-dm') {
      const div = document.createElement('div')
      div.className = 'hs-mc-feed-inline hs-mc-dm-inline'
      const borderColor = m.inlineNotifBorderColor || INLINE_NOTIF_TYPES.dm.borderColor
      div.style.borderLeftColor = borderColor
      const tsVal = timestampsEnabled ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      const labelColor = m.inlineNotifColor || INLINE_NOTIF_TYPES.dm.color
      const label = `<span style="color:${labelColor};font-size:10px;font-weight:700;margin-right:3px">[DM]</span>`
      const platBadge = m.platform === 'twitch'
        ? '<span style="color:#9146ff;font-size:10px;font-weight:700;margin-right:3px">[T]</span>'
        : '<span style="color:#ff8700;font-size:10px;font-weight:700;margin-right:3px">[HS]</span>'
      const userName = `<span style="color:${sanitizeColor(m.color)};font-weight:600">${escapeHtml(m.user)}</span>`
      // All values sanitized — safe innerHTML
      div.innerHTML = `${tsSpan}${label}${platBadge}${userName}: ${processEmotes(escapeHtml(m.text), null)}`
      div.style.cursor = 'pointer'
      div.addEventListener('click', (e) => {
        if (e.target.closest('a, .hs-mc-emote')) return
        switchTab('whispers')
      })
      return div
    }

    const showChannel = tabId === 'mentions';
    const isSuperChat = m.platform === 'youtube' && (m.msgType === 'superchat' || m.msgType === 'supersticker')
    const isMembership = m.platform === 'youtube' && m.msgType === 'membership'
    const isKicksEvent = m.kicksEvent === true
    const cls = tabId === 'mentions' ? 'hs-mc-msg mention' :
isKicksEvent ? 'hs-mc-msg hs-mc-system hs-mc-kicks' :
isMembership ? 'hs-mc-msg hs-mc-system' :
m.type === 'usernotice' || m.type === 'notice' ? 'hs-mc-msg hs-mc-system' :
                m.redeemed ? 'hs-mc-msg hs-mc-redeemed' :
                isSuperChat ? 'hs-mc-msg hs-mc-superchat' :
                isMention(m) ? 'hs-mc-msg mention' : 'hs-mc-msg';
    const channelSpan = showChannel && m.channel ? `<span class="hs-mc-channel">${escapeHtml(m.channel)}</span>` : '';
    // Render badges — YouTube sends array of {type,label,url}, Twitch/Kick send IRC badge string
    let badges = ''
    if (m.platform === 'youtube' && Array.isArray(m.badges)) {
      badges = m.badges.map(b => {
        if (b.url) {
          return `<img class="hs-mc-badge-img" src="${escapeHtml(b.url)}" alt="${escapeHtml(b.label)}" title="${escapeHtml(b.label)}" style="width:18px;height:18px;">`
        }
        // Text fallback for owner/mod without image
        const ytBadgeStyles = { owner: { bg: '#ffd600', fg: '#000', label: '\u2606' }, moderator: { bg: '#5e84f1', fg: '#fff', label: '\u2694' } }
        const style = ytBadgeStyles[b.type]
        if (style) return `<span class="hs-mc-badge" style="background:${style.bg};color:${style.fg}" title="${escapeHtml(b.label)}">${style.label}</span>`
        return ''
      }).join('')
    } else {
      badges = renderBadges(m.badges, m.channel)
    }
    const plat = m.platform === 'youtube' ? 'yt' : m.platform === 'kick' ? 'kick' : 'twitch'
    const platLabel = plat === 'yt' ? '[YT]' : plat === 'kick' ? '[K]' : '[T]'
    const platColors = { twitch: '#9146ff', kick: '#53fc18', yt: '#ff0000' }
    const platformBadge = (platformBadgesEnabled || plat !== hostPlatform) ? `<span class="hs-mc-platform-badge hs-mc-pb-${plat}" style="font-size:10px;margin-right:3px;font-weight:700;vertical-align:middle;color:${platColors[plat]}">${platLabel}</span>` : ''
    const safeScColor = sanitizeColor(m.scColor || '#ffd600')
    const scBadge = isSuperChat && m.amount ? `<span class="hs-mc-sc-badge" style="background:${safeScColor};color:#000;padding:0 4px;border-radius:0;font-size:10px;font-weight:700;margin-right:3px;">${escapeHtml(m.amount)}</span>` : ''
    const userLink = `<a href="https://heatsync.org/${plat === 'yt' ? 'user' : plat}/${encodeURIComponent(m.user)}" target="_blank" class="hs-mc-user" data-username="${escapeHtml(m.user.toLowerCase())}" style="color:${sanitizeColor(m.color || '#fff')}">${escapeHtml(m.user)}</a>`;
    let avatarHtml = ''
    if (avatarsEnabled) {
      const userKey = m.user.toLowerCase()
      // YouTube messages carry avatar URL directly — cache it and skip decapi
      if (m.avatar && m.platform === 'youtube') {
        avatarCache.set(userKey, m.avatar)
      }
      const cachedUrl = avatarCache.get(userKey)
      if (cachedUrl) {
        avatarHtml = `<img class="hs-mc-avatar" src="${escapeHtml(cachedUrl)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
      } else if (m.platform !== 'youtube') {
        // Only fetch from decapi for Twitch users
        avatarHtml = `<img class="hs-mc-avatar" data-user="${escapeHtml(userKey)}" src="" alt="" style="display:none" loading="lazy" decoding="async">`
        fetchAvatar(userKey)
      }
    }

    // Process text: heatsync/7TV/BTTV/FFZ emotes first, then YouTube native emoji
    let processedText = processEmotes(m.text, m.channel)
    if (m.emotes && m.emotes.length > 0) {
      processedText = processYtEmotes(processedText, m.emotes, true)
    }

    // Sticker for super stickers
    let stickerHtml = ''
    if (m.sticker && m.sticker.url) {
      stickerHtml = ` <img src="${escapeHtml(m.sticker.url)}" alt="${escapeHtml(m.sticker.alt || 'sticker')}" style="height:48px;vertical-align:middle;" />`
    }

    const div = document.createElement('div');
    div.className = cls;
    if (isSuperChat && m.scColor) {
      const safeBg = sanitizeColor(m.scColor)
      div.style.background = safeBg + '22'
      div.style.borderLeft = `3px solid ${safeBg}`
      div.style.paddingLeft = '4px'
    }
    // Reply context bar (Chatterino-style) — all values escaped via escapeHtml
    const replyBar = m.replyTo ? `<div class="hs-mc-reply-ctx">&#8618; Replying to <a href="https://heatsync.org/user/${encodeURIComponent(m.replyTo.user)}" target="_blank" class="hs-mc-user hs-mc-reply-user" data-username="${escapeHtml(m.replyTo.user.toLowerCase())}">@${escapeHtml(m.replyTo.user)}</a>${m.replyTo.text ? ': ' + escapeHtml(m.replyTo.text.length > 80 ? m.replyTo.text.slice(0, 80) + '...' : m.replyTo.text) : ''}</div>` : ''
    // USERNOTICE system line (all values go through escapeHtml — same pattern as existing innerHTML above)
    const systemLine = m.systemMsg ? `<span class="hs-mc-system-text">${escapeHtml(m.systemMsg)}</span>` : ''
    const ts = formatTimeFromTs(m.time);
    const showTs = timestampsEnabled || tabId === 'mentions';
    const tsHtml = ts && showTs ? `<span class="hs-mc-ts" data-ts="${m.time}">${ts}</span>` : '';
    const msgBody = (m.type === 'usernotice' || m.type === 'notice') && !m.text
      ? `${tsHtml}${systemLine}`
      : m.type === 'notice'
      ? `${tsHtml}${processedText}`
      : m.isAction
      ? `${tsHtml}${systemLine}${platformBadge}${scBadge}${badges}${avatarHtml}${userLink}${channelSpan} <span style="color:${sanitizeColor(m.color || '#fff')};font-style:italic">${processedText}</span>${stickerHtml}`
      : `${tsHtml}${systemLine}${platformBadge}${scBadge}${badges}${avatarHtml}${userLink}${channelSpan}: ${processedText}${stickerHtml}`
    div.innerHTML = `${replyBar}${msgBody}`;
    // Reply button for threading (Twitch/Kick — needs valid msg id)
    if (m.id && m.platform !== 'youtube') {
      div.dataset.msgId = m.id
      div.dataset.msgUser = m.user
      div.dataset.msgChannel = m.channel || ''
      const replyBtn = document.createElement('button')
      replyBtn.className = 'hs-mc-reply-btn'
      replyBtn.textContent = '↩'
      replyBtn.title = 'Reply'
      div.appendChild(replyBtn)
    }
    return div;
  }

  // Process YouTube emotes (inline emoji images from innertube)
  // preEscaped=true when input is already HTML-escaped (chained after processEmotes)
  function processYtEmotes(text, emotes, preEscaped) {
    if (!emotes || emotes.length === 0) return preEscaped ? text : escapeHtml(text)

    // Build result by replacing emoji alt text with img tags
    let result = preEscaped ? text : escapeHtml(text)
    for (const emote of emotes) {
      const url = typeof emote.url === 'string' ? emote.url.trim() : ''
      const alt = typeof emote.alt === 'string' ? emote.alt : ''
      if (!alt || !url || !(url.startsWith('http') || url.startsWith('//'))) continue
      const escaped = escapeHtml(alt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(escaped, 'g')
      result = result.replace(re, () => `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="hs-mc-emote" style="height:1.2em;vertical-align:middle;" />`)
    }
    return result
  }

  // Show "new" button for static tabs (activity/feed) — points up since newest is at top
  function showStaticNewButton() {
    const newBtn = document.getElementById('hs-mc-new-msgs');
    if (!newBtn) return;
    newMessageCount++;
    newBtn.innerHTML = `<span class="hs-arrow-down" style="transform:rotate(180deg)">▼</span> ${newMessageCount} new`;
    newBtn.style.display = 'flex';
  }

  // Scroll helper — reused by both renderMessages and appendMessage
  function scrollMsgsToBottom(msgsEl) {
    const scrollToBottom = () => {
      if (isScrolledUp) return;
      isProgrammaticScroll = true;
      msgsEl.scrollTop = msgsEl.scrollHeight + 10000;
      requestAnimationFrame(() => { isProgrammaticScroll = false; });
    };

    const newBtn = document.getElementById('hs-mc-new-msgs');
    newMessageCount = 0;
    if (newBtn) newBtn.style.display = 'none';

    scrollToBottom();
    requestAnimationFrame(() => {
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
    });

    msgsEl.querySelectorAll('.hs-mc-emote').forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', scrollToBottom, { once: true });
      }
    });
  }

  // Incremental append for single messages on the active tab (hot path)
  // Returns true if handled, false if full rebuild needed
  function appendMessage(msg, tabId) {
    if (editingChannel) return false;
    if (isScrolledUp || currentTab !== tabId) return false;
    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return false;

    // Remove "no messages" placeholder
    const empty = msgsEl.querySelector('.hs-mc-empty');
    if (empty) empty.remove();

    const div = buildMessageDiv(msg, tabId);
    if (zebraEnabled && msg.type !== 'stream-event' && msg.type !== 'feed-post' && msg.type !== 'inline-dm') {
      if (!msgsEl._zebraCount) msgsEl._zebraCount = 0;
      msgsEl._zebraCount++;
      if (msgsEl._zebraCount % 2 === 0) div.classList.add('hs-mc-zebra');
    }
    msgsEl.appendChild(div);

    // Trim oldest messages beyond 150
    trimChildren(msgsEl, 150);

    // Apply mute to just this message — strip content for muted users
    const username = div.querySelector('.hs-mc-user')?.textContent?.trim()?.toLowerCase();
    if (username && mutedUsers.has(username)) {
      stripMcMutedMessage(div);
    }

    updateTabBadges();
    scrollMsgsToBottom(msgsEl);
    return true;
  }

  // Full rebuild — used for tab switches, scroll resume, and initial load
  function renderMessages(id) {
    if (editingChannel) return;
    // Social tabs have their own renderers
    if (id === 'feed') { renderFeed(); return; }
    if (id === 'whispers') { renderWhispersTab(); return; }
    if (id === 'settings') { renderSettingsTab(); return; }

    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;

    const newBtn = document.getElementById('hs-mc-new-msgs');

    if (isScrolledUp) {
      newMessageCount++;
      if (newBtn) {
        newBtn.innerHTML = `<span class="hs-arrow-down">▼</span> ${newMessageCount} new`;
        newBtn.style.display = 'flex';
      }
      return;
    }

    let msgs = [];

    if (id === 'mentions') {
      msgs = mentionsBuffer;
    } else if (id === 'add') {
      renderAddChannelForm(msgsEl);
      return;
    } else if (id === 'live') {
      const curCh = getLiveChannel();
      // Ensure channel is joined + history loaded (handles picker overrides, SPA nav)
      if (curCh && irc && !irc.channels.has(curCh.toLowerCase())) irc.join(curCh);
      const ircMsgs = curCh ? (irc?.getMessages(curCh) || []) : [];
      // Kick messages for live tab: same channel name, or linked via config
      let kickMsgs = curCh ? (kickChat?.getMessages(curCh) || []) : [];
      if (!kickMsgs.length && curCh) {
        // Check if any config entry links current channel to a Kick channel
        const linked = config.channels.find(ch => typeof ch !== 'string' && ch.twitch === curCh && ch.kick);
        if (linked) kickMsgs = kickChat?.getMessages(linked.kick) || [];
      }
      if (kickMsgs.length > 0) {
        msgs = [...ircMsgs, ...kickMsgs].sort((a, b) => a.time - b.time);
      } else {
        msgs = ircMsgs;
      }
    } else {
      // Channel tab — merge IRC + Kick + per-channel YouTube messages
      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === id);
      const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
      const kickName = typeof ch === 'string' ? null : ch?.kick;
      const ircMsgs = twitchName ? (irc?.getMessages(twitchName) || []) : [];
      const kickMsgs = kickName ? (kickChat?.getMessages(kickName) || []) : [];
      const ytMsgs = channelYtMessages.get(id) || [];
      const extraMsgs = [...kickMsgs, ...ytMsgs];
      if (extraMsgs.length > 0) {
        msgs = [...ircMsgs, ...extraMsgs].sort((a, b) => a.time - b.time);
      } else {
        msgs = ircMsgs;
      }
    }

    // Merge global stream events into every tab (game changes, online/offline)
    // Only include events within the time range of existing messages so old events
    // don't pile up as a wall before chat history starts
    if (activityEvents.length > 0 && msgs.length > 0) {
      const oldestMsg = msgs.reduce((min, m) => m.time < min ? m.time : min, msgs[0].time)
      const existingTexts = new Set(msgs.filter(m => m.type === 'stream-event').map(m => m.text))
      const missing = activityEvents.filter(e => !existingTexts.has(e.text) && e.time >= oldestMsg)
      if (missing.length > 0) {
        msgs = [...msgs, ...missing].sort((a, b) => a.time - b.time)
      }
    }

    updateTabBadges()

    if (msgs.length === 0) {
      msgsEl.textContent = ''
      const empty = document.createElement('div')
      empty.className = 'hs-mc-empty'
      empty.textContent = 'no messages yet'
      msgsEl.appendChild(empty)
      return
    }

    const toRender = msgs.slice(-150)
    isProgrammaticScroll = true;
    msgsEl.textContent = '';
    msgsEl._zebraCount = 0;
    const frag = document.createDocumentFragment();
    for (const m of toRender) {
      const div = buildMessageDiv(m, id);
      if (zebraEnabled && m.type !== 'stream-event' && m.type !== 'feed-post') {
        msgsEl._zebraCount++;
        if (msgsEl._zebraCount % 2 === 0) div.classList.add('hs-mc-zebra');
      }
      frag.appendChild(div);
    }
    msgsEl.appendChild(frag);
    applyMcMutes();

    requestAnimationFrame(() => { isProgrammaticScroll = false; });

    if (!isScrolledUp) {
      scrollMsgsToBottom(msgsEl);
    }
  }

  function sanitizeColor(color) {
    return /^#[0-9a-fA-F]{3,6}$/.test(color) ? color : '#ffffff';
  }





  function renderAddChannelForm(msgsEl) {
    msgsEl.textContent = ''
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#a8a8a8;font-size:13px;padding:20px;box-sizing:border-box;'

    const title = document.createElement('div')
    title.textContent = 'add channel'
    title.style.cssText = 'font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.5px;'
    wrapper.appendChild(title)

    const desc = document.createElement('div')
    desc.textContent = 'enter at least one platform'
    desc.style.cssText = 'font-size:13px;color:#626262;margin-bottom:2px;'
    wrapper.appendChild(desc)

    const makeRow = (label, placeholder) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;max-width:300px;'
      const lbl = document.createElement('span')
      lbl.textContent = label
      lbl.style.cssText = 'font-size:13px;font-weight:600;min-width:56px;color:#949494;text-transform:lowercase;'
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = placeholder
      input.style.cssText = 'flex:1;background:#ffffff;color:#000000;border:1px solid #808080;padding:6px 10px;border-radius:0;font-size:14px;outline:none;font-family:inherit;'
      row.appendChild(lbl)
      row.appendChild(input)
      return { row, input }
    }

    const twitch = makeRow('twitch', 'username')
    const kick = makeRow('kick', 'username')
    const yt = makeRow('youtube', 'username or url')

    wrapper.appendChild(twitch.row)
    wrapper.appendChild(kick.row)
    wrapper.appendChild(yt.row)

    // Error message (between inputs and buttons)
    const errEl = document.createElement('div')
    errEl.style.cssText = 'font-size:13px;color:#ff0000;display:none;'
    errEl.setAttribute('role', 'alert')
    wrapper.appendChild(errEl)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;'

    const makeMcBtn = (text, primary) => {
      const btn = document.createElement('button')
      btn.textContent = text
      const base = primary
        ? 'background:transparent;color:#ffffff;border:1px solid #ffffff;'
        : 'background:transparent;color:#626262;border:1px solid #444444;'
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;'
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ffffff'; btn.style.color = '#000000'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent'
        btn.style.color = primary ? '#ffffff' : '#626262'
      })
      return btn
    }

    const addBtn = makeMcBtn('add', true)
    const cancelBtn = makeMcBtn('cancel', false)

    btnRow.appendChild(addBtn)
    btnRow.appendChild(cancelBtn)
    wrapper.appendChild(btnRow)

    msgsEl.appendChild(wrapper)

    cancelBtn.addEventListener('click', () => switchTab('live'))

    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; }

    const doAdd = () => {
      errEl.style.display = 'none'
      const twitchVal = twitch.input.value.trim().toLowerCase().replace(/^@/, '')
      const kickVal = kick.input.value.trim().toLowerCase().replace(/^@/, '')
      const ytVal = yt.input.value.trim() ? normalizeYtUrl(yt.input.value.trim()) : ''

      if (!twitchVal && !kickVal && !ytVal) {
        showErr('enter at least one platform')
        return
      }

      const id = twitchVal || kickVal || ('yt-' + Date.now())
      const reserved = ['live', 'feed', 'mentions', 'whispers', 'add', 'rotate', 'settings']
      if (reserved.includes(id)) {
        showErr('reserved name')
        return
      }
      if (config.channels.some(c => (typeof c === 'string' ? c : c.id) === id)) {
        showErr('channel already exists')
        return
      }
      // Check duplicate Twitch username across channels
      if (twitchVal && config.channels.some(c => (typeof c === 'string' ? c : c.twitch) === twitchVal)) {
        showErr('twitch channel already added')
        return
      }

      const channel = { id, twitch: twitchVal, kick: kickVal, youtube: ytVal }
      config.channels.push(channel)
      saveConfig()

      if (twitchVal) {
        irc?.join(twitchVal)
        try {
          chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchVal })
        } catch (e) { /* context invalidated */ }
      }
      if (kickVal) {
        kickChat?.join(kickVal)
      }
      if (ytVal) {
        youtubeLinks.set(id, { url: ytVal, videoId: '', channelName: '' })
        chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ytVal, channelId: id }).catch(() => {})
      }

      updateTabBar()
      switchTab(id)
    }

    addBtn.addEventListener('click', doAdd)
    // Tab cycles inputs, Enter submits, Escape cancels
    const inputs = [twitch.input, kick.input, yt.input]
    inputs.forEach((inp, i) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault()
          inputs[(i + (e.shiftKey ? inputs.length - 1 : 1)) % inputs.length].focus()
        }
        if (e.key === 'Enter') doAdd()
        if (e.key === 'Escape') switchTab('live')
      })
    })

    // Auto-focus twitch input
    requestAnimationFrame(() => twitch.input.focus())
  }

  function removeChannel(tabId) {
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
    config.channels = config.channels.filter(c => (typeof c === 'string' ? c : c.id) !== tabId);
    saveConfig();

    const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
    if (twitchName) irc?.part(twitchName);

    const kickName = typeof ch === 'string' ? null : ch?.kick;
    if (kickName) kickChat?.part(kickName);

    // Unsubscribe per-channel YouTube (pass URL as fallback if videoId not yet received)
    if (ch && typeof ch !== 'string' && ch.youtube) {
      const link = youtubeLinks.get(tabId);
      chrome.runtime.sendMessage({
        type: 'youtube_ws_unsubscribe',
        videoId: link?.videoId || '',
        url: ch.youtube,
        channelId: tabId,
      }).catch(() => {});
      youtubeLinks.delete(tabId);
      channelYtMessages.delete(tabId);
    }

    updateTabBar();
    if (currentTab === tabId) switchTab('live');
  }

  function showEditChannelForm(tabId) {
    let ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
    if (!ch) return;
    editingChannel = true;
    // Normalize legacy string format
    if (typeof ch === 'string') {
      const idx = config.channels.indexOf(ch);
      ch = { id: ch, twitch: ch, kick: '', youtube: '' };
      config.channels[idx] = ch;
    }

    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;
    msgsEl.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#a8a8a8;font-size:13px;padding:20px;box-sizing:border-box;';

    const title = document.createElement('div');
    title.textContent = 'edit ' + tabId;
    title.style.cssText = 'font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.5px;';
    wrapper.appendChild(title);

    const makeRow = (label, placeholder, value) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;max-width:300px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'font-size:13px;font-weight:600;min-width:56px;color:#949494;text-transform:lowercase;';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = value || '';
      input.style.cssText = 'flex:1;background:#ffffff;color:#000000;border:1px solid #808080;padding:6px 10px;border-radius:0;font-size:14px;outline:none;font-family:inherit;';
      row.appendChild(lbl);
      row.appendChild(input);
      return { row, input };
    };

    const twitch = makeRow('twitch', 'username', ch.twitch);
    const kick = makeRow('kick', 'username', ch.kick);
    const yt = makeRow('youtube', 'username or url', ch.youtube);
    wrapper.appendChild(twitch.row);
    wrapper.appendChild(kick.row);
    wrapper.appendChild(yt.row);

    const errEl = document.createElement('div');
    errEl.style.cssText = 'font-size:13px;color:#ff0000;display:none;';
    errEl.setAttribute('role', 'alert');
    wrapper.appendChild(errEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

    const makeMcBtn = (text, primary) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      const base = primary
        ? 'background:transparent;color:#ffffff;border:1px solid #ffffff;'
        : 'background:transparent;color:#626262;border:1px solid #444444;';
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;';
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ffffff'; btn.style.color = '#000000';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = primary ? '#ffffff' : '#626262';
      });
      return btn;
    };

    const saveBtn = makeMcBtn('save', true);
    const cancelBtn = makeMcBtn('cancel', false);
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    wrapper.appendChild(btnRow);
    msgsEl.appendChild(wrapper);

    cancelBtn.addEventListener('click', () => switchTab(tabId));
    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

    const doSave = () => {
      errEl.style.display = 'none';
      const twitchVal = twitch.input.value.trim().toLowerCase().replace(/^@/, '');
      const kickVal = kick.input.value.trim().toLowerCase().replace(/^@/, '');
      const ytVal = yt.input.value.trim() ? normalizeYtUrl(yt.input.value.trim()) : '';

      if (!twitchVal && !kickVal && !ytVal) {
        showErr('enter at least one platform');
        return;
      }

      // Check duplicate twitch (excluding self)
      if (twitchVal && config.channels.some(c => c !== ch && (typeof c === 'string' ? c : c.twitch) === twitchVal)) {
        showErr('twitch channel already added');
        return;
      }

      // Part old channels if changed
      const oldTwitch = ch.twitch;
      const oldKick = ch.kick;
      const oldYt = ch.youtube;

      if (oldTwitch && oldTwitch !== twitchVal) irc?.part(oldTwitch);
      if (oldKick && oldKick !== kickVal) kickChat?.part(oldKick);

      // Unsubscribe old YouTube if changed
      if (oldYt && oldYt !== ytVal) {
        const oldLink = youtubeLinks.get(tabId);
        chrome.runtime.sendMessage({
          type: 'youtube_ws_unsubscribe',
          videoId: oldLink?.videoId || '',
          url: oldYt,
          channelId: tabId,
        }).catch(() => {});
        youtubeLinks.delete(tabId);
        channelYtMessages.delete(tabId);
      }

      // Update channel config
      ch.twitch = twitchVal;
      ch.kick = kickVal;
      ch.youtube = ytVal;

      // Update id to match primary platform
      const newId = twitchVal || kickVal || ch.id;
      if (newId !== ch.id) {
        // Migrate maps keyed by old id
        const ytData = youtubeLinks.get(tabId);
        const ytMsgs = channelYtMessages.get(tabId);
        if (ytData) { youtubeLinks.delete(tabId); youtubeLinks.set(newId, ytData); }
        if (ytMsgs) { channelYtMessages.delete(tabId); channelYtMessages.set(newId, ytMsgs); }
        ch.id = newId;
      }
      saveConfig();

      // Join new channels if changed
      if (twitchVal && twitchVal !== oldTwitch) {
        irc?.join(twitchVal);
        try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchVal }); } catch (e) {}
      }
      if (kickVal && kickVal !== oldKick) kickChat?.join(kickVal);
      if (ytVal && ytVal !== oldYt) {
        youtubeLinks.set(newId, { url: ytVal, videoId: '', channelName: '' });
        chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ytVal, channelId: newId }).catch(() => {});
      }

      updateTabBar();
      switchTab(newId);
    };

    saveBtn.addEventListener('click', doSave);
    const inputs = [twitch.input, kick.input, yt.input];
    inputs.forEach((inp, i) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          inputs[(i + (e.shiftKey ? inputs.length - 1 : 1)) % inputs.length].focus();
        }
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') switchTab(tabId);
      });
    });
    requestAnimationFrame(() => twitch.input.focus());
  }

  function updateTabIndicator(tabId) {
    const tab = tabBarElement?.querySelector(`[data-tab="${tabId}"]`);
    if (!tab || currentTab === tabId) return;

    // Don't light up duplicate tabs showing the same channel
    // If on live, suppress channel tab indicator for the live channel
    // If on a channel tab, suppress live tab indicator for the same channel
    const liveCh = getLiveChannel()?.toLowerCase();
    if (liveCh) {
      if (currentTab === 'live' && tabId !== 'feed' && tabId !== 'mentions') {
        const chConfig = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === tabId);
        if (chConfig) {
          const tw = (typeof chConfig === 'string' ? chConfig : chConfig.twitch)?.toLowerCase();
          const ki = (typeof chConfig === 'string' ? undefined : chConfig.kick)?.toLowerCase();
          if (tw === liveCh || ki === liveCh) return;
        }
      }
      if (tabId === 'live') {
        const curConfig = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === currentTab);
        if (curConfig) {
          const tw = (typeof curConfig === 'string' ? curConfig : curConfig.twitch)?.toLowerCase();
          const ki = (typeof curConfig === 'string' ? undefined : curConfig.kick)?.toLowerCase();
          if (tw === liveCh || ki === liveCh) return;
        }
      }
    }

    tab.classList.add('has-new');
    if (tabId === 'mentions') tab.classList.add('has-mentions');
  }

  function updateTabMentionIndicator(tabId) {
    const tab = tabBarElement?.querySelector(`[data-tab="${tabId}"]`)
    if (tab && currentTab !== tabId) {
      tab.classList.add('has-new', 'has-mentions')
    }
  }

  // ============================================
  // LIVE STATUS POLLING
  // ============================================

  let liveStatusInterval = null;

  function startLiveStatusPolling() {
    updateLiveStatus();
    liveStatusInterval = cleanup.setInterval(updateLiveStatus, 30000);
  }

  async function updateLiveStatus() {
    if (!tabBarElement) return;
    const channels = config.channels
      .map(ch => typeof ch === 'string' ? ch : ch.twitch || ch.id)
      .filter(Boolean);
    // Also check URL channel (for popout / non-config channels)
    const urlCh = getCurrentChannel();
    if (urlCh && !channels.some(c => c.toLowerCase() === urlCh.toLowerCase())) {
      channels.push(urlCh);
    }
    if (channels.length === 0) return;

    try {
      const data = await chrome.runtime.sendMessage({ type: 'fetch_live_status', channels });
      if (!data?.live) return;
      const liveSet = new Set(data.live.map(c => c.toLowerCase()));
      liveChannelSet = liveSet;

      config.channels.forEach(ch => {
        const id = typeof ch === 'string' ? ch : ch.id;
        const twitch = typeof ch === 'string' ? ch : ch.twitch || ch.id;
        const tab = tabBarElement?.querySelector(`[data-tab="${id}"]`);
        if (tab) tab.dataset.live = String(liveSet.has(twitch.toLowerCase()));
      });

      // Update live tab's own red dot based on selected channel
      const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
      const curLive = getLiveChannel()?.toLowerCase();
      if (liveTab) liveTab.dataset.live = String(curLive && liveSet.has(curLive));

      // If override channel went offline, fall back to URL channel or first live
      if (liveChannel && !liveSet.has(liveChannel)) {
        liveChannel = null;
        updateLiveTabLabel();
        if (currentTab === 'live') renderMessages('live');
      }

      // Auto-select if no override and URL channel isn't live but others are
      if (!liveChannel && urlCh && !liveSet.has(urlCh.toLowerCase()) && liveSet.size > 0) {
        // Don't auto-override — user can pick via the menu
      }
    } catch (e) { /* network error, skip */ }
  }

  // ============================================
  // USERNAME & MENTIONS
  // ============================================

  /**
   * Get current channel from URL
   */
  function getCurrentChannel() {
    // Match /username or /popout/username/chat or /embed/username/chat
    const match = location.pathname.match(/^\/(?:popout\/|embed\/)?([a-zA-Z0-9_]+)/);
    if (match && match[1]) {
      const channel = match[1].toLowerCase();
      // Skip non-channel pages
      if (['directory', 'settings', 'videos', 'moderator', 'subscriptions'].includes(channel)) {
        return null;
      }
      return channel;
    }
    return null;
  }

  /** Channel the live tab is currently showing (override or URL fallback) */
  function getLiveChannel() {
    return liveChannel || getCurrentChannel();
  }

  // Check if a message belongs to the live tab — direct match OR paired via config
  // e.g., on twitch.tv/asmongold with config {twitch:"zackrawrr", kick:"asmongold"}
  // → shows both zackrawrr Twitch messages AND asmongold Kick messages
  function isLiveChannelMessage(msg) {
    const curCh = getLiveChannel()?.toLowerCase()
    if (!curCh) return false
    const mc = msg.channel?.toLowerCase()
    if (mc === curCh) return true
    // Check configured channel pairs — either side can be the live channel
    return config.channels.some(ch => {
      if (typeof ch === 'string') return false
      const tw = ch.twitch?.toLowerCase()
      const ki = ch.kick?.toLowerCase()
      return (tw === curCh && ki === mc) || (ki === curCh && tw === mc)
    })
  }

  /** Update the live tab button label to show selected channel */
  function updateLiveTabLabel() {
    const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
    if (!liveTab) return;
    const ch = liveChannel;
    // Show channel name when overridden to a non-URL channel
    if (ch && ch !== getCurrentChannel()?.toLowerCase()) {
      liveTab.textContent = `live \u00b7 ${ch}`;
    } else {
      liveTab.textContent = 'live';
    }
  }

  /** Query background script for all channels the user has open tabs for */
  async function getWatchingChannels() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'get_watching_channels' });
      return resp?.channels || [];
    } catch (e) {
      return [];
    }
  }

  /** Show picker for choosing which live channel to view */
  async function showLiveChannelPicker(anchorEl) {
    document.getElementById('hs-mc-live-picker')?.remove();

    const urlCh = getCurrentChannel()?.toLowerCase();
    const watching = await getWatchingChannels();

    // Check which watching channels are actually live
    const watchNames = watching.map(w => w.name);
    if (urlCh && !watchNames.includes(urlCh)) watchNames.push(urlCh);
    let liveSet = liveChannelSet;
    if (watchNames.length > 0) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'fetch_live_status', channels: watchNames });
        if (resp?.live) liveSet = new Set(resp.live.map(c => c.toLowerCase()));
      } catch (e) { /* use cached liveChannelSet */ }
    }

    // Only show channels that are actually live
    const channels = [];
    const seen = new Set();
    for (const w of watching) {
      const ch = w.name.toLowerCase();
      if (seen.has(ch) || !liveSet.has(ch)) continue;
      seen.add(ch);
      channels.push({ name: ch, platform: w.platform, isCurrent: ch === urlCh });
    }

    if (channels.length <= 1) {
      // 0 or 1 live channel — just switch to live normally
      if (channels.length === 1 && document.body.classList.contains('hs-popout') && channels[0].name !== urlCh) {
        if (hostPlatform === 'twitch') location.href = `/popout/${channels[0].name}/chat?popout=`;
        else if (hostPlatform === 'kick') location.href = `/${channels[0].name}`;
        return;
      }
      switchTab('live');
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'hs-mc-live-picker';
    const rect = anchorEl.getBoundingClientRect();
    menu.style.cssText = `position:fixed;z-index:99999;background:#111;border:1px solid #444;padding:4px 0;min-width:130px;font-size:12px;font-family:inherit;left:${rect.left}px;top:${rect.bottom + 2}px;`;

    const curLive = getLiveChannel()?.toLowerCase();

    for (const ch of channels) {
      const item = document.createElement('div');
      const isActive = ch.name === curLive;

      // Red dot — all channels in picker are confirmed live
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;background:#f00;margin-right:6px;vertical-align:middle`;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(ch.name));

      item.style.cssText = `padding:6px 12px;cursor:pointer;color:${isActive ? '#ff8700' : '#fff'};white-space:nowrap;`;
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
      item.addEventListener('mouseleave', () => item.style.background = 'none');
      item.addEventListener('click', () => {
        menu.remove();
        // In popout mode, navigate to the channel's popout URL
        if (document.body.classList.contains('hs-popout')) {
          if (ch.platform === 'twitch' || hostPlatform === 'twitch') {
            location.href = `/popout/${ch.name}/chat?popout=`;
          } else if (ch.platform === 'kick' || hostPlatform === 'kick') {
            location.href = `/${ch.name}`;
          }
          return;
        }
        liveChannel = ch.name;
        updateLiveTabLabel();
        switchTab('live');
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    // Clamp position so menu stays fully visible
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = Math.max(0, window.innerWidth - menuRect.width - 4) + 'px';
    }
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = Math.max(0, rect.top - menuRect.height - 2) + 'px';
    }

    // Dismiss on outside click
    const dismiss = (e) => {
      if (!menu.contains(e.target) && e.target !== anchorEl) {
        menu.remove();
        document.removeEventListener('click', dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  function getCurrentUsername() {
    // Method 1: localStorage displayName
    try {
      const displayName = localStorage.getItem('twilight.user.displayName');
      if (displayName) {
        const name = displayName.replace(/"/g, '').trim();
        if (name && name.length > 0 && name.length < 30) {
          return name.toLowerCase();
        }
      }
    } catch (e) {}

    // Method 2: localStorage user object
    try {
      const twilight = localStorage.getItem('twilight.user');
      if (twilight) {
        const data = JSON.parse(twilight);
        if (data?.displayName) return data.displayName.toLowerCase();
      }
    } catch (e) {}

    // Method 3: Twitch 'name' cookie (works in popout chat)
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === 'name' && value) {
          const name = decodeURIComponent(value).toLowerCase();
          if (name.length > 0 && name.length < 30) {
            log('Found username from cookie:', name);
            return name;
          }
        }
      }
    } catch (e) {}

    // Kick methods
    if (hostPlatform === 'kick') {
      // Method K1: Kick profile link in sidebar/nav
      try {
        const profileLink = document.querySelector('a[href^="/profile"]');
        if (profileLink) {
          const match = profileLink.getAttribute('href')?.match(/\/profile\/([^/?]+)/);
          if (match?.[1]) return match[1].toLowerCase();
        }
      } catch (e) {}
      // Method K2: Kick sidebar username
      try {
        const userEl = document.querySelector('.sidebar-username, nav [class*="username"]');
        if (userEl?.textContent?.trim()) {
          const name = userEl.textContent.trim();
          if (name.length > 0 && name.length < 30 && /^[a-zA-Z0-9_]+$/.test(name)) return name.toLowerCase();
        }
      } catch (e) {}
    }

    return null;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  let _mentionRe = null
  let _mentionReUser = null
  function isMention(msg) {
    if (!currentUsername) return false
    if (msg.user && msg.user.toLowerCase() === currentUsername) return false
    const text = msg.text.toLowerCase()
    if (text.includes('@' + currentUsername)) return true
    if (_mentionReUser !== currentUsername) {
      _mentionRe = new RegExp(`\\b${escapeRegex(currentUsername)}\\b`, 'i')
      _mentionReUser = currentUsername
    }
    return _mentionRe.test(text)
  }

  // Browser notifications (gated by hs_notifications setting)
  let notificationsEnabled = false
  let notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  api.storage.local.get('hs_notifications').then(data => {
    notificationsEnabled = data.hs_notifications === true
    // Request permission on Firefox (Chrome extensions get it automatically)
    if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
      Notification.requestPermission().then(p => { notificationPermission = p })
    }
  })
  api.storage.onChanged.addListener((changes) => {
    if (changes.hs_notifications) {
      notificationsEnabled = changes.hs_notifications.newValue === true
      if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
        Notification.requestPermission().then(p => { notificationPermission = p })
      }
    }
  })

  function fireNotification(title, body, tag) {
    if (!notificationsEnabled) return
    if (notificationPermission === 'denied') return
    try {
      const iconUrl = api.runtime.getURL('icon-48.png')
      const n = new Notification(title, { body, icon: iconUrl, tag, silent: false })
      n.onclick = () => { window.focus(); n.close() }
      setTimeout(() => n.close(), 8000)
    } catch {}
  }

  function notifyMention(msg) {
    if (!notificationsEnabled) return
    if (document.hasFocus()) return
    const channel = msg.channel ? ` in #${msg.channel}` : ''
    const title = `${msg.user}${channel}`
    const body = msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text
    fireNotification(title, body, 'hs-mention-' + Date.now())
  }

  function notifyStreamEvent(channel, eventType, game) {
    if (!notificationsEnabled) return
    if (document.hasFocus()) return
    let title, body
    if (eventType === 'stream:online') {
      title = `${channel} went live`
      body = game || ''
    } else if (eventType === 'stream:update') {
      title = `${channel} switched game`
      body = game || ''
    } else {
      return
    }
    fireNotification(title, body, `hs-stream-${channel}-${Date.now()}`)
  }

  /**
   * Scan existing chat messages in DOM for mentions (on load)
   */
  function scanExistingMentions() {
    if (!currentUsername) {
      log('Cannot scan mentions - no username');
      return;
    }

    // Twitch + Kick message selectors
    const messages = document.querySelectorAll('[data-a-target="chat-line-message"], #chatroom-messages [data-index]');
    log('Scanning', messages.length, 'existing messages for mentions of', currentUsername);

    let found = 0;
    const escaped = escapeRegex(currentUsername)
    const mentionRe = new RegExp(`\\b${escaped}\\b`, 'i')
    messages.forEach(msgEl => {
      // Only check message text, not the full element (which includes sender name)
      const messageEl = msgEl.querySelector('[data-a-target="chat-message-text"], span.font-normal');
      const text = messageEl?.textContent || '';
      const textLower = text.toLowerCase();
      if (textLower.includes('@' + currentUsername) || mentionRe.test(textLower)) {
        const usernameEl = msgEl.querySelector('[data-a-target="chat-message-username"], button.inline.font-bold');
        const username = usernameEl?.textContent || 'unknown';
        // Skip own messages
        if (username.toLowerCase() === currentUsername) return;

        mentionsBuffer.push({
          user: username,
          text: text,
          color: '#fff',
          channel: getCurrentChannel() || 'live',
          time: Date.now() - (messages.length - found) * 1000 // Approximate time
        });
        found++;
      }
    });

    if (found > 0) {
      log('Found', found, 'existing mentions');
      updateTabIndicator('mentions');
    }
  }

  // ============================================
  // STORAGE
  // ============================================

  async function loadConfig() {
    try {
      const s = await chrome.storage.local.get([STORAGE_KEY]);
      config = { channels: [], enabled: true, ...s[STORAGE_KEY] };
      // Migrate old string channels to object format
      let needsSave = false;
      if (config.channels.some(c => typeof c === 'string')) {
        config.channels = config.channels.map(ch =>
          typeof ch === 'string' ? { id: ch, twitch: ch, kick: '', youtube: '' } : ch
        );
        needsSave = true;
      }
      if (needsSave) saveConfig();
      // Subscribe per-channel YouTube links
      for (const ch of config.channels) {
        if (typeof ch !== 'string' && ch.youtube) {
          youtubeLinks.set(ch.id, { url: ch.youtube, videoId: '', channelName: '' });
          chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ch.youtube, channelId: ch.id }).catch(() => {});
        }
      }
    } catch (e) {}
  }

  async function saveConfig() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
    } catch (e) {}
  }

  // ============================================
  // TABS POSITION SETTING
  // ============================================

  async function loadTabsPosition() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      // Migration: tabsOnRight → tabPosition
      if (stored.ui_settings?.tabsOnRight !== undefined && stored.ui_settings?.tabPosition === undefined) {
        tabPosition = stored.ui_settings.tabsOnRight ? 'right' : 'top';
        stored.ui_settings.tabPosition = tabPosition;
        delete stored.ui_settings.tabsOnRight;
        await chrome.storage.local.set({ ui_settings: stored.ui_settings });
        log('Migrated tabsOnRight to tabPosition:', tabPosition);
      } else if (stored.ui_settings?.tabPosition !== undefined) {
        tabPosition = stored.ui_settings.tabPosition;
      }
      applyTabsPosition();
    } catch (e) {
      log('Error loading tabs position:', e);
    }
  }

  let _savedActiveTab = null;
  const BUILTIN_TABS = ['live', 'feed', 'mentions', 'add'];
  async function loadActiveTab() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const saved = stored.ui_settings?.activeTab || 'live';
      // Validate: must be a built-in tab or a configured channel (never restore 'add')
      const channelIds = config.channels.map(c => typeof c === 'string' ? c : c.id);
      _savedActiveTab = (saved !== 'add' && (BUILTIN_TABS.includes(saved) || channelIds.includes(saved)))
        ? saved : 'live';
      // Restore live channel override
      if (stored.ui_settings?.liveChannel) {
        liveChannel = stored.ui_settings.liveChannel;
      }
    } catch (e) {
      _savedActiveTab = 'live';
    }
  }

  let _applyingPosition = false
  function applyTabsPosition() {
    if (_applyingPosition) return
    _applyingPosition = true
    try { _applyTabsPositionInner() } finally { _applyingPosition = false }
  }
  function _applyTabsPositionInner() {
    document.body.classList.remove('hs-tabs-top', 'hs-tabs-right', 'hs-tabs-bottom', 'hs-tabs-left');
    if (tabPosition !== 'top') {
      document.body.classList.add(`hs-tabs-${tabPosition}`);
    }

    // Re-apply column width (accounts for vertical tab offset)
    applyChatWidth()

    log('Tabs position:', tabPosition);
  }

  function rotateTabPosition() {
    const positions = ['top', 'right', 'bottom', 'left'];
    const currentIndex = positions.indexOf(tabPosition);
    const prev = tabPosition
    tabPosition = positions[(currentIndex + 1) % positions.length];
    log('rotate:', prev, '→', tabPosition)

    applyTabsPosition();
    saveTabPosition();
    renderMessages(currentTab);
  }

  async function saveTabPosition() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.tabPosition = tabPosition;
      delete settings.tabsOnRight; // Remove old setting
      await chrome.storage.local.set({ ui_settings: settings });
    } catch (e) {
      log('Error saving tab position:', e);
    }
  }

  function listenForSettingsChanges() {
    if (window._hsMcSettingsListener) return;
    window._hsMcSettingsListener = true;

    // Listen for messages from popup
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg.type === 'ui_settings_changed' && msg.settings) {
        log('Settings changed via message:', msg.settings);
        if (msg.settings.tabPosition !== undefined && msg.settings.tabPosition !== tabPosition) {
          tabPosition = msg.settings.tabPosition;
          applyTabsPosition();
        }
      }
      if (msg.type === 'debug_log') console.log('[hs-bg]', msg.msg);
      // Listen for emote updates from background
      if (msg.type === 'global_emotes_update' || msg.type === 'channel_emotes_update') {
        log('received', msg.type, msg.channelOwner || '');
        clearTimeout(emoteReloadTimer);
        emoteReloadTimer = setTimeout(() => {
          loadEmotes().then(() => renderMessages(currentTab));
        }, 300);
      }

      // 7TV emote add/remove → persistent stream-event in chat
      if (msg.type === 'channel_emote_added' || msg.type === 'channel_emote_removed') {
        const text = msg.message;
        if (text) {
          const eventClass = msg.type === 'channel_emote_added' ? 'event-online' : 'event-offline';
          const evt = { type: 'stream-event', eventClass, text, channel: '7tv', time: Date.now() };

          const liveChannel = getLiveChannel();
          const liveBuffer = liveChannel ? irc?.channels?.get(liveChannel) : null;
          if (liveBuffer) {
            const existing = liveBuffer.getAll();
            if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
              liveBuffer.push(evt);
              saveStreamEvent(evt);
            }
          }
          if (irc?.channels) {
            for (const [ch, buf] of irc.channels) {
              if (ch === liveChannel) continue;
              const existing = buf.getAll();
              if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
                buf.push(evt);
              }
            }
          }
          renderMessages(currentTab);
        }
      }
    });

    // Also listen for storage changes (more reliable)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      // UI settings
      if (changes.ui_settings) {
        const newSettings = changes.ui_settings.newValue || {};
        log('Settings changed via storage:', newSettings);
        if (newSettings.tabPosition !== undefined && newSettings.tabPosition !== tabPosition) {
          tabPosition = newSettings.tabPosition;
          applyTabsPosition();
        }
        if (newSettings.showPlatformBadges !== undefined) {
          platformBadgesEnabled = newSettings.showPlatformBadges;
        }
      }

      // Emote updates - reload when storage changes (debounced to avoid spam)
      if (changes.global_emotes || changes.channel_emotes_map || changes.emote_inventory || changes.native_twitch_emotes) {
        log('storage changed:', changes.channel_emotes_map ? 'channel_emotes_map' : '', changes.global_emotes ? 'global_emotes' : '', changes.emote_inventory ? 'emote_inventory' : '');
        clearTimeout(emoteReloadTimer);
        emoteReloadTimer = setTimeout(() => {
          loadEmotes().then(() => {
            if (!isScrolledUp) renderMessages(currentTab);
          });
        }, 300);
      }

      // Blocked emotes
      if (changes.blocked_emotes) {
        loadBlockedEmotes().then(() => {
          if (!isScrolledUp) {
            renderMessages(currentTab);
          }
        });
      }
    });
  }

  // ============================================
  // OFFLINE DETECTION
  // ============================================

  function detectOfflineState() {
    if (isKick) return
    // Popout chat has no video — don't mark as offline
    if (location.pathname.match(/^\/(popout|embed)\//)) return

    let wasOffline = null

    function checkOffline() {
      const playerOffline = !!document.querySelector('.channel-root__player--offline')
      const isLive = !playerOffline && !!document.querySelector(
        '[class*="stream-type-indicator"], [data-a-target="player-overlay-click-handler"] video, .video-player video'
      )
      const isOffline = !isLive
      document.body.classList.toggle('hs-offline', isOffline)
      // On state change, recalculate player width
      if (wasOffline !== null && wasOffline !== isOffline) {
        applyChatWidth()
      }
      wasOffline = isOffline
    }

    // Immediate check
    checkOffline()

    // Fast polling for first 10s (covers React paint delay)
    let fastChecks = 0
    const fastId = cleanup.setInterval(() => {
      checkOffline()
      if (++fastChecks >= 10) clearInterval(fastId)
    }, 1000)

    // Steady-state polling
    cleanup.setInterval(checkOffline, 5000)

    // MutationObserver for instant transitions
    const root = document.querySelector('[class*="channel-root"]') || document.body
    const observer = new MutationObserver(() => checkOffline())
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    cleanup.trackObserver(observer)
  }

  // ============================================
  // MAIN INITIALIZATION
  // ============================================

  let mcInitialized = false;
  async function init() {
    let isPopout = false;
    if (isKick) {
      // Kick: run on channel pages (/<channel>) or popout
      const isKickChannel = location.pathname.match(/^\/[a-zA-Z0-9_-]+\/?$/);
      if (!isKickChannel) return;
      const kickPath = location.pathname.replace(/\/$/, '').slice(1).toLowerCase();
      if (['categories', 'following', 'search', 'settings'].includes(kickPath)) return;
    } else {
      // Twitch: Run on channel pages AND popout chat
      const isChannelPage = location.pathname.match(/^\/[a-zA-Z0-9_]+\/?$/);
      isPopout = !!location.pathname.match(/^\/(popout|embed)\/[a-zA-Z0-9_]+\/chat/);
      if (!isChannelPage && !isPopout) return;
      const pathName = location.pathname.replace(/\/$/, '').slice(1).toLowerCase();
      if (['directory', 'settings', 'videos', 'moderator', 'subscriptions', 'downloads', 'search'].includes(pathName)) return;

    }
    if (mcInitialized) return;
    mcInitialized = true;

    await loadConfig();
    if (!config.enabled) return;

    log('Initializing...');

    // Add popout class to body for CSS targeting
    if (isPopout) {
      document.body.classList.add('hs-popout');
    }

    currentUsername = getCurrentUsername();
    // Fallback: get username from HeatSync user_info in storage
    if (!currentUsername) {
      try {
        const ui = await chrome.storage.local.get('user_info')
        if (ui.user_info?.username) currentUsername = ui.user_info.username.toLowerCase()
      } catch {}
    }
    log('Username:', currentUsername);

    // Load muted users from chrome.storage.local
    try {
      const stored = await chrome.storage.local.get(['heatsync_mc_muted']);
      if (stored.heatsync_mc_muted && Array.isArray(stored.heatsync_mc_muted)) {
        mutedUsers = new Set(stored.heatsync_mc_muted);
      }
    } catch (e) {
      log('Error loading muted users:', e);
    }

    injectStyles();
    detectOfflineState();
    await loadActiveTab();
    await loadTabsPosition();
    await loadEmoteSize();
    await loadWysiwygSetting();
    await loadLinksSetting();
    await loadViModeSetting();
    await loadInlineNotifSettings();
    await loadHermesSettings();
    await loadPlatformBadgesSetting();
    await loadZebraSetting();
    await loadAutoHideSetting();
    await loadTimestampsSetting();
    await loadAvatarsSetting();
    await loadOfflineEventsSetting();
    await loadBlockedEmotes();
    await loadEmotes();

    // Request background to re-send channel emotes (may have been fetched before we loaded)
    try {
      chrome.runtime.sendMessage({ type: 'get_channel_emotes' });
    } catch (e) { /* context invalidated */ }

    setupEmoteTooltipHandlers();
    setupUserTooltipHandlers();
    setupLinkTooltipHandlers();
    listenForSettingsChanges();

    // Load heatsync auth state
    loadHsAuth();

    // Listen for social tab events from background
    listenForSocialEvents();

    // Load whisper conversations from storage
    loadWhispers();

    // Initialize IRC (runs on both Twitch and Kick — cross-platform relay)
    irc = new IRC();
    irc.connect();

    // Connect auth IRC eagerly for whisper reception
    // Whispers arrive via IRC WHISPER command on authenticated connections
    // (twitch.tv/commands cap). Without this, auth IRC only connects on first send.
    if (hostPlatform === 'twitch') {
      const token = getTwitchAuthToken()
      const nick = currentUsername || getCurrentUsername()
      if (token && nick) {
        connectAuthIrc(token, nick).then(ok => {
          if (ok === true) log('Auth IRC ready (whispers enabled)')
        })
      }
    }

    // Initialize Kick chat (runs on both platforms — cross-platform relay)
    kickChat = new KickChat();
    kickChat.connect();

    // Auto-join current channel on native platform
    const currentChannel = getCurrentChannel();
    if (currentChannel) {
      if (hostPlatform === 'twitch') {
        irc.join(currentChannel);
        kickChat.join(currentChannel); // Join same-name Kick channel if it exists
      } else if (hostPlatform === 'kick') {
        kickChat.join(currentChannel);
      }
      log('Auto-joined current channel:', currentChannel);
    }

    // Ensure live channel override is also joined (may differ from URL channel)
    const liveCh = getLiveChannel();
    if (liveCh && liveCh !== currentChannel && hostPlatform === 'twitch') {
      irc.join(liveCh);
      log('Auto-joined live channel override:', liveCh);
    }

    config.channels.forEach(ch => {
      const twitchName = typeof ch === 'string' ? ch : ch.twitch;
      const kickName = typeof ch === 'string' ? null : ch.kick;
      if (twitchName) {
        irc.join(twitchName);
        try {
          log('sending join_channel for:', twitchName);
          chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchName });
        } catch (e) { log('join_channel failed:', e.message); }
      }
      if (kickName) {
        kickChat.join(kickName);
      }
    });

    // Restore persisted stream events into buffers
    loadStreamEvents().then(() => {
      if (streamEventsLoaded) {
        const active = currentTab;
        if (active === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)) {
          renderMessages(active);
        }
      }
    });

    // Scan existing chat for mentions (before IRC catches new ones)
    cleanup.setTimeout(() => scanExistingMentions(), 2000);

    // Handle incoming IRC messages
    irc.on('message', (msg) => {
      // Track sub tenure from IRC badge-info
      if (msg.subMonths && msg.channel) {
        trackSubTenure(msg.channel, msg.user, msg.subMonths)
      }
      // Cache own badges for optimistic display
      if (msg.user?.toLowerCase() === currentUsername?.toLowerCase() && msg.badges) {
        _ownBadges = msg.badges
      }
      // Suppress echo of own sent messages (dedup dual-send)
      if (isSentEcho(msg.text)) return
      const isMent = isMention(msg)
      if (isMent) {
        mentionsBuffer.push(msg);
        if (mentionsBuffer.length > MAX_BUFFER + 50) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER);
        notifyMention(msg);

        if (currentTab === 'mentions') {
          mentionsSeenCount = mentionsBuffer.length;
          if (!appendMessage(msg, 'mentions')) renderMessages('mentions');
        } else {
          updateTabIndicator('mentions');
        }
      }

      // Channel tab routing
      const chTabId = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.twitch) === msg.channel);
      const tabId = typeof chTabId === 'string' ? chTabId : chTabId?.id;
      if (tabId && currentTab === tabId) {
        if (!appendMessage(msg, tabId)) renderMessages(tabId);
      } else if (tabId) {
        updateTabIndicator(tabId);
        if (isMent) updateTabMentionIndicator(tabId)
      }

      // Live tab: show if this channel matches live OR is paired via config
      if (isLiveChannelMessage(msg)) {
        if (currentTab === 'live') {
          if (!appendMessage(msg, 'live')) renderMessages('live');
        } else {
          updateTabIndicator('live');
          if (isMent) updateTabMentionIndicator('live')
        }
      }
    });

    // Handle incoming Kick messages
    kickChat.on('message', (msg) => {
      // Suppress echo of own sent messages (dedup dual-send)
      if (isSentEcho(msg.text)) return
      const isMent = isMention(msg)
      if (isMent) {
        mentionsBuffer.push(msg);
        if (mentionsBuffer.length > MAX_BUFFER + 50) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER);
        notifyMention(msg);

        if (currentTab === 'mentions') {
          mentionsSeenCount = mentionsBuffer.length;
          if (!appendMessage(msg, 'mentions')) renderMessages('mentions');
        } else {
          updateTabIndicator('mentions');
        }
      }

      // Channel tab routing — find config entry where ch.kick matches
      const chConfig = config.channels.find(ch => typeof ch !== 'string' && ch.kick === msg.channel);
      const tabId = chConfig?.id;
      if (tabId && currentTab === tabId) {
        if (!appendMessage(msg, tabId)) renderMessages(tabId);
      } else if (tabId) {
        updateTabIndicator(tabId);
        if (isMent) updateTabMentionIndicator(tabId)
      }

      // Live tab: show if this channel matches live OR is paired via config
      if (isLiveChannelMessage(msg)) {
        if (currentTab === 'live') {
          if (!appendMessage(msg, 'live')) renderMessages('live');
        } else {
          updateTabIndicator('live');
          if (isMent) updateTabMentionIndicator('live')
        }
      }
    });

    // Handle stream events (game switch, online/offline) from HeatSync WS
    if (!window._hsMcStreamEventListener) {
      window._hsMcStreamEventListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'stream_event') return;
        const channel = msg.channel?.toLowerCase();
        if (!channel) return;

        // Build inline notification
        let text = '', eventClass = '';
        if (msg.eventType === 'stream:update' && msg.game && msg.prevGame !== msg.game) {
          text = msg.prevGame
            ? `[${channel}] \u25C6 switched to ${msg.game}`
            : `[${channel}] \u25C6 now playing ${msg.game}`;
          eventClass = 'event-update';
        } else if (msg.eventType === 'stream:online') {
          text = msg.game ? `[${channel}] \u25C6 went live \u2014 ${msg.game}` : `[${channel}] \u25C6 went live`;
          eventClass = 'event-online';
        } else if (msg.eventType === 'stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-offline';
        }
        if (!text) return;

        log('[Stream]', channel, text);
        notifyStreamEvent(channel, msg.eventType, msg.game);
        const evt = { type: 'stream-event', eventClass, text, channel, time: Date.now() };

        // Push into the live channel buffer (dedup by text to prevent doubles on reload)
        const liveChannel = getLiveChannel();
        const liveBuffer = liveChannel ? (irc?.channels?.get(liveChannel) || kickChat?.channels?.get(liveChannel)) : null;
        if (liveBuffer) {
          const existing = liveBuffer.getAll();
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            liveBuffer.push(evt);
            saveStreamEvent(evt);
          }
        }

        // Also push into the matching channel buffer if different from live
        if (channel !== liveChannel) {
          const chBuffer = irc?.channels?.get(channel) || kickChat?.channels?.get(channel);
          if (chBuffer) {
            const existing = chBuffer.getAll();
            if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
              chBuffer.push(evt);
              if (!liveBuffer) saveStreamEvent(evt);
            }
          }
        }
        pushActivityEvent(evt);

        // Yellow tab highlight only for game changes, and only when not viewing that channel
        // (live tab and its matching channel tab are equivalent — viewing either counts)
        if (msg.eventType === 'stream:update') {
          const viewingChannel = currentTab === 'live' || config.channels.some(ch => {
            const tw = (typeof ch === 'string' ? ch : ch.twitch)?.toLowerCase()
            const ki = (typeof ch !== 'string' ? ch.kick : null)?.toLowerCase()
            return currentTab === (typeof ch === 'string' ? ch : ch.id) && (tw === channel || ki === channel)
          })
          if (!viewingChannel) {
            // Only yellow the live tab if this event is for the live channel
            const isLiveEvent = isLiveChannelMessage({ channel })
            if (isLiveEvent) {
              const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
              if (liveTab) liveTab.classList.add('has-stream-event');
            }
            // Yellow the matching channel tab
            for (const ch of config.channels) {
              const twName = typeof ch === 'string' ? ch : ch.twitch;
              const kickName = typeof ch !== 'string' ? ch.kick : null;
              const tabId = typeof ch === 'string' ? ch : ch.id;
              if ((twName === channel || kickName === channel) && currentTab !== tabId) {
                const tab = tabBarElement?.querySelector(`[data-tab="${tabId}"]`);
                if (tab) tab.classList.add('has-stream-event');
              }
            }
          }
        }

        // Render on whatever tab is active (game changes are always relevant)
        const activeTab = currentTab;
        if (activeTab === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)) {
          if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
        }
      });
    }

    // Handle Hermes events (raids, hype trains, redeems, sub gifts) from MAIN world
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'heatsync-hermes-event') return
      const { eventType, channel, data } = e.data
      if (!eventType || !channel) return

      // Map eventType to toggle key and eventClass
      let toggleKey, eventClass, text
      if (eventType === 'raid') {
        toggleKey = 'raid'
        eventClass = 'event-raid'
        text = `[${channel}] \u25C6 raided ${escapeHtml(data.target)} with ${data.viewers} viewers`
      } else if (eventType === 'hype-train-start') {
        toggleKey = 'hype'
        eventClass = 'event-hype'
        text = `[${channel}] \u25C6 hype train started`
      } else if (eventType === 'hype-train-end') {
        toggleKey = 'hype'
        eventClass = 'event-hype'
        text = `[${channel}] \u25C6 hype train ended at level ${data.level}`
      } else if (eventType === 'sub-gift') {
        toggleKey = 'sub'
        eventClass = 'event-sub'
        text = `[${channel}] \u25C6 ${escapeHtml(data.user)} gifted ${data.count} subs`
      } else if (eventType === 'redeem') {
        toggleKey = 'redeem'
        eventClass = 'event-redeem'
        text = `[${channel}] \u25C6 ${escapeHtml(data.user)} redeemed "${escapeHtml(data.title)}"`
      } else return

      if (!hermesToggles[toggleKey]) return

      const evt = { type: 'stream-event', eventClass, text, channel, time: Date.now() }

      // Push into relevant buffers (same pattern as stream_event handler)
      const liveChannel = getLiveChannel()
      const liveBuffer = liveChannel ? irc?.channels?.get(liveChannel) : null
      if (liveBuffer) {
        const existing = liveBuffer.getAll()
        if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
          liveBuffer.push(evt)
          saveStreamEvent(evt)
        }
      }
      if (channel !== liveChannel) {
        const chBuffer = irc?.channels?.get(channel)
        if (chBuffer) {
          const existing = chBuffer.getAll()
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            chBuffer.push(evt)
            if (!liveBuffer) saveStreamEvent(evt)
          }
        }
      }
      pushActivityEvent(evt)

      // Render
      const activeTab = currentTab
      if (activeTab === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)) {
        if (!appendMessage(evt, activeTab)) renderMessages(activeTab)
      }
    }, { signal: mcSignal })

    // Handle follow-driven stream events (from followed channels not currently viewed)
    if (!window._hsMcFollowStreamEventListener) {
      window._hsMcFollowStreamEventListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'follow_stream_event') return;
        const channel = msg.channel?.toLowerCase();
        if (!channel) return;

        // Skip channels already in config — they get stream_event, avoid duplicates
        if (config.channels.some(ch => {
          const id = (typeof ch === 'string' ? ch : ch.id)?.toLowerCase()
          const tw = (typeof ch === 'string' ? null : ch.twitch)?.toLowerCase()
          return id === channel || tw === channel
        })) return;

        // Build inline notification
        let text = '', eventClass = '';
        if (msg.eventType === 'stream:update' && msg.game && msg.prevGame !== msg.game) {
          text = msg.prevGame
            ? `[${channel}] \u25C6 switched to ${msg.game}`
            : `[${channel}] \u25C6 now playing ${msg.game}`;
          eventClass = 'event-follow event-update';
        } else if (msg.eventType === 'stream:online') {
          text = msg.game ? `[${channel}] \u25C6 went live \u2014 ${msg.game}` : `[${channel}] \u25C6 went live`;
          eventClass = 'event-follow event-online';
        } else if (msg.eventType === 'stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-follow event-offline';
        }
        if (!text) return;

        log('[FollowStream]', channel, text);
        notifyStreamEvent(channel, msg.eventType, msg.game);
        const evt = { type: 'stream-event', eventClass, text, channel, time: Date.now(), color: msg.color || '' };

        // Push into the live channel buffer (dedup by text)
        const liveChannel = getLiveChannel();
        const liveBuffer = liveChannel ? irc?.channels?.get(liveChannel) : null;
        if (liveBuffer) {
          const existing = liveBuffer.getAll();
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            liveBuffer.push(evt);
            saveStreamEvent(evt);
          }
        }

        // Also push into matching channel buffer if different from live
        if (channel !== liveChannel) {
          const chBuffer = irc?.channels?.get(channel);
          if (chBuffer) {
            const existing = chBuffer.getAll();
            if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
              chBuffer.push(evt);
              if (!liveBuffer) saveStreamEvent(evt);
            }
          }
        }
        pushActivityEvent(evt);

        // Yellow tab highlight only for game changes on the live channel, only when not viewing live
        if (msg.eventType === 'stream:update' && currentTab !== 'live' && isLiveChannelMessage({ channel })) {
          const tab = tabBarElement?.querySelector('[data-tab="live"]');
          if (tab) tab.classList.add('has-stream-event');
        }

        // Render on whatever tab is active
        const activeTab = currentTab;
        if (activeTab === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)) {
          if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
        }
      });
    }

    // Handle color map from server (for persisted stream event history)
    if (!window._hsMcFollowColorsListener) {
      window._hsMcFollowColorsListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'follow_colors') return;
        processFollowColors(msg.colors);
      });
    }

    // Process follow history events (shared by listener + on-demand request)
    function processFollowHistory(events) {
      if (!Array.isArray(events) || events.length === 0) return;

      const builtEvents = [];
      for (const e of events) {
        const channel = e.channel?.toLowerCase();
        if (!channel) continue;

        // Skip channels already in config — they get stream_event directly
        if (config.channels.some(ch => {
          const id = (typeof ch === 'string' ? ch : ch.id)?.toLowerCase()
          const tw = (typeof ch === 'string' ? null : ch.twitch)?.toLowerCase()
          return id === channel || tw === channel
        })) continue;

        let text = '', eventClass = '';
        if (e.type === 'follow:stream:update' && e.game) {
          text = e.prevGame
            ? `[${channel}] \u25C6 switched to ${e.game}`
            : `[${channel}] \u25C6 now playing ${e.game}`;
          eventClass = 'event-follow event-update';
        } else if (e.type === 'follow:stream:online') {
          text = e.game ? `[${channel}] \u25C6 went live \u2014 ${e.game}` : `[${channel}] \u25C6 went live`;
          eventClass = 'event-follow event-online';
        } else if (e.type === 'follow:stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-follow event-offline';
        }
        if (!text) continue;

        const evt = { type: 'stream-event', eventClass, text, channel, time: e.time, color: e.color || '' };
        builtEvents.push(evt)
      }

      const added = injectStreamEventsIntoBuffers(builtEvents, true)
      if (builtEvents.length > 0) saveStreamEventsBatch(builtEvents)

      if (added > 0) {
        log('[FollowHistory]', added, 'events loaded');
        const active = currentTab;
        if (active === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)) {
          renderMessages(active);
        }
      }
    }

    // Process follow colors (shared by listener + on-demand request)
    function processFollowColors(colors) {
      if (!colors || typeof colors !== 'object') return;
      for (const [login, color] of Object.entries(colors)) {
        if (color) streamColorMap.set(login.toLowerCase(), color);
      }
      log('[FollowColors]', streamColorMap.size, 'colors received');
      const active = currentTab;
      if (active === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)) {
        renderMessages(active);
      }
    }

    // Handle real-time follow_history from background broadcast
    if (!window._hsMcFollowHistoryListener) {
      window._hsMcFollowHistoryListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'follow_history') return;
        processFollowHistory(msg.events);
      });
    }

    // Request cached follow history from background (handles race condition on load)
    safeSendMessage({ type: 'get_follow_history' }).then(resp => {
      if (resp?.colors) processFollowColors(resp.colors);
      if (resp?.history) processFollowHistory(resp.history);
    });

    // === BULLETPROOF CONNECTION MAINTENANCE ===

    // 1. Detect extension context invalidation → auto-reload page
    // When Chrome restarts the service worker or updates the extension,
    // content scripts become orphaned. Detect and reload.
    cleanup.setInterval(() => {
      try {
        if (!chrome.runtime?.id) throw new Error('dead');
        // Ping background to verify it's alive
        chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {
          log('Background unreachable, reloading page...');
          location.reload();
        });
      } catch {
        log('Extension context invalidated, reloading page...');
        location.reload();
      }
    }, 30000, 'context-health');

    // 2. Reconnect auth IRC on tab focus (for sending messages)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (authState.ws && authState.ws.readyState === WebSocket.OPEN) return;
      // Auth IRC is dead — reconnect if we have credentials
      const token = getTwitchAuthToken();
      const nick = currentUsername || getCurrentUsername();
      if (token && nick && !authState.connecting) {
        log('Tab visible, auth IRC dead — reconnecting');
        const prev = [...authState.joined];
        connectAuthIrc(token, nick).then(ok => {
          if (ok === true) {
            for (const ch of prev) joinChannel(ch);
            drainSendQueue();
          }
        });
      }
    }, { signal: mcSignal });

    // 3. Reconnect Kick chat on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (kickChat && (!kickChat.ws || kickChat.ws.readyState !== WebSocket.OPEN)) {
        log('Tab visible, Kick chat dead — reconnecting');
        kickChat.connect();
      }
    }, { signal: mcSignal });

    if (isKick) {
      // Kick: no React hook needed, just inject directly
      let kickAttempts = 0;
      const tryInjectKick = () => {
        kickAttempts++;
        const chatroom = document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]');
        if (chatroom) {
          ensureUIElements();
          switchTab(_savedActiveTab || 'live');
          startLayoutWatcher();
        } else if (kickAttempts < 30) {
          setTimeout(tryInjectKick, 500);
        } else {
          log('Failed to find Kick chatroom after 30 attempts');
        }
      };
      tryInjectKick();
    } else {
      // Twitch: try to hook into React, fall back to MutationObserver
      tryHookReact();
    }
  }

  /**
   * Attempt to hook React components, with fallback
   */
  function tryHookReact() {
    let attempts = 0;
    const maxAttempts = 30;

    const tryHook = () => {
      attempts++;

      // First, try to find and patch the chat room component
      const chatRoom = findChatRoomComponent();
      if (chatRoom) {
        log('Found chat room component');
        chatRoomComponent = chatRoom;
        patchChatRoomRender(chatRoom);
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
        return;
      }

      // Fallback: just inject elements directly (support popout chat)
      const chatContainer = document.querySelector('[class*="chat-room__content"]') ||
                           document.querySelector('[data-a-target="chat-room-component"]') ||
                           document.querySelector('.chat-shell') ||
                           document.querySelector('[class*="stream-chat"]') ||
                           document.querySelector('.chat-room');

      if (chatContainer) {
        log('Using fallback DOM injection');
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(tryHook, 500);
      } else {
        log('Failed to find chat components after', maxAttempts, 'attempts');
      }
    };

    tryHook();
  }

  /**
   * Watch for layout changes and re-inject elements if needed
   * This handles theatre mode, popouts, SPA navigation
   */
  function startLayoutWatcher() {
    // Periodic check — only needed for container removal (rare, SPA nav)
    cleanup.setInterval(() => {
      if (spaReinitializing) return;
      if (!document.getElementById('hs-mc-container')) {
        log('Container missing, re-injecting...');
        tabBarElement = null;
        overlayElement = null;
        inputBarElement = null;
        resizeObserver = null;
        ensureUIElements();
        updateTabBar();
        renderMessages(currentTab);
      }
    }, 1000, 'layout-check');

    // MutationObserver — only watch for container removal
    cleanup.trackObserver(new MutationObserver((mutations) => {
      if (spaReinitializing) return;
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node.id === 'hs-mc-container' && !document.contains(node)) {
            log('Container removed, re-injecting...');
            tabBarElement = null;
            overlayElement = null;
            inputBarElement = null;
            resizeObserver = null;
            cleanup.setTimeout(() => {
              ensureUIElements();
              updateTabBar();
              renderMessages(currentTab);
            }, 100, 'container-reinject');
            return;
          }
        }
      }
    }), 'layout-observer').observe(document.body, { childList: true, subtree: true });
  }

  // ============================================
  // STARTUP
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { signal: mcSignal });
  } else {
    init();
  }

  // SPA navigation handler
  let lastPath = location.pathname;
  let spaReinitializing = false;
  cleanup.setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      log('Navigation detected, reinitializing...');

      // Flag prevents layout watcher from re-injecting elements we're about to remove
      spaReinitializing = true;

      // Close old read-only IRC to prevent zombie WebSocket reconnect loops
      // NOTE: auth IRC (for sending) is NOT killed here — it survives SPA navigation
      if (irc?.ws) {
        irc.ws.onclose = null; // prevent auto-reconnect
        irc.ws.close();
      }
      irc = null;

      // Destroy old KickChat to prevent stale message listeners
      if (kickChat) {
        kickChat.destroy();
        kickChat = null;
      }

      // Clean up — remove entire container (our elements are inside it)
      document.getElementById('hs-mc-container')?.remove();
      tabBarElement = null;
      overlayElement = null;
      inputBarElement = null;
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      isHooked = false;
      mcInitialized = false; // Allow init() to run again

      // Reset social tab state (stale on nav)
      feedLoaded = false;
      feedLoading = false;
      feedMessages = [];
      feedPage = 1;
      feedHasMore = true;
      feedLastFetch = 0;
      notifLoaded = false;
      notifMessages = [];
      activeThread = null;
      // Reset feed scroll listener flag (new DOM element)
      const oldMsgs = document.getElementById('hs-mc-messages');
      if (oldMsgs) oldMsgs._hsFeedScroll = false;

      // Reinitialize after short delay
      cleanup.setTimeout(() => {
        spaReinitializing = false;
        init();
      }, 1000, 'spa-reinit');
    }
  }, 500, 'spa-nav-check');


}
})();