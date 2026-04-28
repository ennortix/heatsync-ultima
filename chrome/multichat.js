(function() {
'use strict';

// === HEATSYNC LIB (auto-bundled) ===

// --- config.js ---
/**
 * Centralized configuration for heatsync extension.
 * All URLs, timing constants, limits, selectors, CSS classes, and z-index values.
 *
 * Bundled at IIFE scope into content scripts — use window.heatsyncConfig to access.
 */

const CONFIG = {

  // ─── API / WebSocket ────────────────────────────────────────────────────────

  API_URL: 'https://heatsync.org',
  WS_URL: 'wss://heatsync.org',      // /ws appended at connect time
  LINK_PREVIEW_API: 'https://heatsync.org/api/link-preview',
  LIVE_STATUS_API: 'https://heatsync.org/api/platform/live-status',

  // Third-party CDN / API base URLs
  CDN_7TV: 'https://cdn.7tv.app',
  CDN_BTTV: 'https://cdn.betterttv.net',
  API_7TV: 'https://7tv.io/v3',
  WS_7TV: 'wss://events.7tv.io/v3',
  API_BTTV: 'https://api.betterttv.net/3',
  API_FFZ: 'https://api.frankerfacez.com/v1',
  API_DECAPI: 'https://decapi.me/twitch',
  API_TWITCH_GQL: 'https://gql.twitch.tv/gql',
  API_TWITCH_HELIX: 'https://api.twitch.tv/helix',
  API_RECENT_MSGS: 'https://recent-messages.robotty.de/api/v2/recent-messages',
  WS_TWITCH_IRC: 'wss://irc-ws.chat.twitch.tv:443',

  // ─── Timing ─────────────────────────────────────────────────────────────────

  TIMING: {
    // Inventory + global emote refresh
    INVENTORY_REFRESH: 60000,             // 1 min — background.js setInterval
    GLOBAL_EMOTES_REFRESH: 86400000,      // 24 hr
    INVENTORY_REFRESH_DEBOUNCE: 2000,     // debounce WS-triggered inventory refresh
    INVENTORY_SKIP_THRESHOLD: 10000,      // skip fetch if last one was <10s ago

    // Cache TTLs (background.js)
    CHANNEL_EMOTES_TTL: 30 * 60 * 1000,  // 30 min
    CHANNEL_EMOTES_EMPTY_TTL: 5 * 60 * 1000, // 5 min for zero-result channels
    BADGES_TTL: 24 * 60 * 60 * 1000,     // 24 hr
    USER_COSMETICS_TTL: 30 * 60 * 1000,  // 30 min

    // WS / connection (background.js)
    WS_CONNECT_TIMEOUT: 10000,
    WS_HEARTBEAT_INTERVAL: 90000,        // well within server's 2 min idle timeout
    WS_RECONNECT_MAX_DELAY: 30000,
    WS_7TV_RECONNECT_MAX_DELAY: 30000,
    WS_7TV_RECONNECT_JITTER: 1000,
    WS_7TV_OFFLINE_TIMEOUT: 600000,      // stop reconnecting after 10 min offline
    SEVENTV_POLL_INTERVAL: 30000,

    // Message queue (background.js)
    MESSAGE_QUEUE_TTL: 30000,            // drop stale queued messages

    // Mute / prune
    MUTE_PRUNE_INTERVAL: 60000,

    // Content script timings (content.js)
    HEAT_CACHE_TTL: 120000,              // 2 min
    HEAT_BATCH_INTERVAL: 2000,           // debounce for heat batch fetches
    HEAT_CACHE_PRUNE_INTERVAL: 300000,   // 5 min
    COSMETICS_TTL: 30 * 60 * 1000,      // 30 min
    MSG_CACHE_TTL: 24 * 60 * 60 * 1000, // 24 hr
    MSG_CACHE_SAVE_DEBOUNCE: 5000,
    BROADCAST_TTL: 30000,               // drop duplicate broadcasts after 30s
    BROADCAST_PRUNE_INTERVAL: 30000,
    REPROCESS_DEBOUNCE: 200,
    TOAST_DURATION: 2500,
    USERNAME_RETRY_BASE_DELAY: 2000,    // backoff start for username detection
    USERNAME_RETRY_MAX_DELAY: 10000,
    PROFILE_TTL: 300000,                // 5 min
    PROFILE_CACHE_MAX_AGE: 60000,       // live channel profile TTL override: 60s
    FOLLOWAGE_CACHE_TTL: 300000,        // 5 min

    // Multichat (multichat.js)
    MC_CONNECT_TIMEOUT: 10000,
    MC_FETCH_TIMEOUT: 15000,
    MC_RETRY_DELAY_BASE: 1500,
    MC_IRC_HEARTBEAT: 30000,
    MC_IRC_ZOMBIE_THRESHOLD: 90000,     // silence before reconnect
    MC_IRC_RECONNECT_MAX_DELAY: 30000,
    MC_IRC_RECONNECT_INITIAL: 2000,
    MC_RECENT_MSGS_CACHE_TTL: 300000,   // 5 min
    MC_PROFILE_CACHE_TTL: 60000,
    MC_EMOTE_SCAN_INTERVAL: 10000,
    MC_AUTH_RECONNECT_INITIAL: 1000,
    MC_AUTH_RECONNECT_MAX_DELAY: 30000,
    MC_WHISPER_SEND_TIMEOUT: 8000,
    MC_SEARCH_DEBOUNCE: 300,            // not yet extracted, placeholder

    // General fetch default
    FETCH_TIMEOUT: 10000,
    LINK_PREVIEW_TIMEOUT: 6000,
    LIVE_STATUS_TIMEOUT: 6000,
    KICK_API_TIMEOUT: 5000,
  },

  // ─── Limits / caps ──────────────────────────────────────────────────────────

  LIMITS: {
    // Emote caches (background.js)
    MAX_EMOTE_NAME_LEN: 100,
    MAX_EMOTES_PER_SOURCE: 5000,
    USER_COSMETICS_MAX: 500,
    TWITCH_ID_CACHE_MAX: 200,
    MAX_YT_VIDEO_ENTRIES: 100,            // LRU cap for ytVideoToChannel map
    SEVENTV_MAX_RECONNECT_ATTEMPTS: 5,

    // Content script caches (content.js)
    MSG_CACHE_MAX: 2000,                  // matches website behavior
    HEAT_CACHE_MAX: 1000,
    COSMETICS_MAX: 500,
    PROFILE_CACHE_MAX: 50,
    MAX_USERNAME_ATTEMPTS: 30,            // prevent console spam on slow page loads

    // Multichat (multichat.js)
    MAX_SEND_QUEUE: 50,                   // IRC send queue cap
    MC_EMOTE_CACHE_MAX: 2000,
    MC_GLOBAL_EMOTE_CACHE_MAX: 5000,
    ACTIVITY_EVENTS_MAX: 500,
    STREAM_EVENTS_MAX: 200,
    MC_AVATAR_FETCH_BATCH: 5,
    MC_CHANNEL_MSG_BUFFER: 500,
    MC_RECENT_MSGS_LIMIT: 800,            // limit param for robotty recent-messages
    MC_FEED_PAGE_SIZE: 30,
    MC_MENTIONS_PAGE_SIZE: 20,
    MC_EMOTE_RENDER_CHUNK: 80,            // emotes rendered per animation frame
    HERMES_CHANNEL_ID_MAP_MAX: 200,       // early-inject-main.js

    // Chat width (multichat.js)
    MIN_CHAT_WIDTH: 300,
    MAX_CHAT_WIDTH: 800,
  },

  // ─── DOM selectors ──────────────────────────────────────────────────────────

  SELECTORS: {
    // Twitch chat containers
    TWITCH_CHAT_CONTAINER: '.chat-scrollable-area__message-container',
    TWITCH_CHAT_FALLBACK: '.chat-list--default',
    TWITCH_CHAT_MESSAGES: '.chat-line__message',
    TWITCH_CHAT_ROOM: '[data-test-selector="chat-room-component"]',
    TWITCH_CHAT_ROOM_CONTENT: '[class*="chat-room__content"]',

    // Twitch message parts
    TWITCH_USERNAME: '.chat-author__display-name',
    TWITCH_USERNAME_ALT: '[data-a-target="chat-message-username"]',
    TWITCH_MSG_TEXT: '[data-a-target="chat-message-text"]',
    TWITCH_MSG_MENTION: '.mention-fragment',
    TWITCH_MSG_MENTION_ALT: '[data-a-target="chat-message-mention"]',
    TWITCH_TEXT_FRAGMENT: '.text-fragment',
    TWITCH_USER_MENU: '[data-a-target="user-menu-toggle"]',
    TWITCH_CHAT_INPUT: '[data-a-target="chat-input"]',
    TWITCH_VIEWERS_COUNT: '[data-a-target="animated-channel-viewers-count"]',
    TWITCH_STREAM_TITLE: '[data-a-target="stream-title"]',
    TWITCH_CHAT_HEADER: '[data-a-target="chat-room-header-label"]',
    TWITCH_CHANNEL_LEADERBOARD: '[class*="channel-leaderboard"]',
    TWITCH_MARQUEE: '[class*="marquee-animation"]',

    // Kick chat containers
    KICK_CHAT_CONTAINER: '#chatroom-messages',
    KICK_CHAT_CONTAINER_INNER: '#chatroom-messages .no-scrollbar',
    KICK_CHAT_ROOM: '#channel-chatroom',
    KICK_CHAT_MESSAGES: '[data-index]',
    KICK_IDENTITY: '.chat-identity-name',

    // Native emote selectors (combined via COMBINED_EMOTE_SELECTOR in content.js)
    NATIVE_EMOTE_IMG: 'img[data-a-target="emote-name"]',
    NATIVE_EMOTE_BUTTON_IMG: 'button[data-a-target="emote-button"] img',
    NATIVE_EMOTE_CLASS: '[class*="emote"] img',

    // YouTube chat (live_chat iframe)
    YT_CHAT_CONTAINER: 'yt-live-chat-item-list-renderer #items',
    YT_MESSAGE: 'yt-live-chat-text-message-renderer',
    YT_USERNAME: '#author-name',
    YT_MESSAGE_TEXT: '#message',
    YT_CHAT_INPUT: 'yt-live-chat-text-input-field-renderer div#input[contenteditable]',
    YT_SEND_BUTTON: '#send-button button, yt-button-shape button',
    YT_INPUT_RENDERER: 'yt-live-chat-text-input-field-renderer',
    YT_EMOJI_BUTTON: '#emoji-suggestions-button, #picker-buttons yt-live-chat-icon-toggle-button-renderer',
  },

  // ─── CSS classes injected by HeatSync ───────────────────────────────────────

  CLASSES: {
    // Emote wrappers
    EMOTE_WRAPPER: 'heatsync-emote-wrapper',
    EMOTE_OVERLAY: 'heatsync-overlay',
    EMOTE_STACK: 'heatsync-emote-stack',
    EMOTE_IMG: 'heatsync-emote',
    EMOTE_PREVIEW: 'heatsync-emote-preview',
    EMOTE_PREVIEW_SINGLETON: 'heatsync-emote-preview-singleton',
    EMOTE_STYLES_ID: 'heatsync-emote-styles',
    EMOTE_PREVIEW_NAME: 'heatsync-emote-preview-name',
    WYSIWYG_EMOTE: 'wysiwig-chat-input-emote',

    // Emote overlay state
    OVERLAY_OWNED: 'emote-overlay-owned',
    OVERLAY_UNADDED: 'emote-overlay-unadded',
    OVERLAY_BLOCKED: 'emote-overlay-blocked',
    OVERLAY_GLOBAL: 'emote-overlay-global',

    // Chat line states
    MENTIONED: 'hs-mentioned',
    USER_MUTED: 'hs-user-muted',
    BACKFILL: 'heatsync-backfill',
    PREVIEW_ACTIVE: 'heatsync-preview-active',
    USERNAME_COLORED: 'hs-username-colored',
    MENTION_COLORED: 'hs-mention-colored',
    HEAT_BREATHE: 'hs-heat-breathe',     // animation class for tier 8+ emotes

    // Profile card
    PC_LOADING: 'hs-pc-loading',
    PC_AVATAR: 'hs-pc-avatar',
    PC_INFO: 'hs-pc-info',
    PC_HEADER_LINE: 'hs-pc-header-line',
    PC_PLATFORM: 'hs-pc-platform',
    PC_NAME: 'hs-pc-name',
    PC_ROLE: 'hs-pc-role',
    PC_VERIFIED: 'hs-pc-verified',
    PC_AGE: 'hs-pc-age',
    PC_LIVE: 'hs-pc-live',
    PC_BADGE_OP: 'hs-pc-badge-op',
    PC_OP: 'hs-pc-op',

    // Multichat container IDs / classes
    MC_CONTAINER: 'hs-mc-container',
    MC_OVERLAY: 'hs-mc-overlay',
    MC_INPUT: 'hs-mc-input',
    MC_TABBAR: 'hs-mc-tabbar',
    MC_EMOTE_PICKER: 'hs-mc-emote-picker',
    MC_INPUTBAR: 'hs-mc-inputbar',
    MC_USER: 'hs-mc-user',
    MC_LINK: 'hs-mc-link',
    MC_EMPTY: 'hs-mc-empty',
    MC_BADGE_IMG: 'hs-mc-badge-img',
    MC_REPLY_CTX: 'hs-mc-reply-ctx',
    NATIVE_HIDDEN: 'hs-native-hidden',
    FEED_AVATAR: 'hs-feed-avatar',
    FEED_USER: 'hs-feed-user',
    FEED_BODY: 'hs-feed-body',
    FEED_THREAD_LINK: 'hs-feed-thread-link',
    INPUT_STACK: 'hs-input-stack',
    KICK_RESIZE_HANDLE: 'hs-kick-resize-handle',

    // Tab layout variants
    TABS_TOP: 'hs-tabs-top',
    TABS_BOTTOM: 'hs-tabs-bottom',
    TABS_LEFT: 'hs-tabs-left',
    TABS_RIGHT: 'hs-tabs-right',

    // Collapsed state (persisted as hs_chat_collapsed)
    CHAT_COLLAPSED: 'hs-chat-collapsed',
  },

  // ─── Z-index layers ─────────────────────────────────────────────────────────

  Z_INDEX: {
    EMOTE_PREVIEW: 5000,        // emote hover preview panel
    TOAST: 5000,                // toast notifications
    DEBUG_BADGE: 10001,         // dev-mode debug overlay badge
    AUTOCOMPLETE: 10001,        // tab-completion dropdown
    MC_TOOLTIP: 1003,           // multichat inline tooltip
    MC_CONTEXT_MENU: 99999,     // right-click context menu
    MC_RESIZE_OVERLAY: 99999,   // drag-resize capture overlay
    MC_PANEL: 10000,            // multichat panel itself
    MC_EMOTE_PICKER: 10001,     // emote picker flyout
  },
}

// Global export — matches pattern of browser-api.js / utils.js
if (typeof window !== 'undefined') {
  window.heatsyncConfig = CONFIG
}



// --- cleanup.js ---
/**
 * Cleanup/lifecycle module — memory leak prevention for long streaming sessions.
 * Tracks intervals, timeouts, MutationObservers, and event listeners for bulk teardown.
 *
 * Usage:
 *   cleanup.setInterval(fn, ms)         → tracked interval id
 *   cleanup.clearInterval(id)           → clear + untrack
 *   cleanup.setTimeout(fn, ms)          → tracked timeout id (auto-untracked on fire)
 *   cleanup.clearTimeout(id)            → clear + untrack
 *   cleanup.trackObserver(obs)          → obs (disconnect on destroyAll)
 *   cleanup.untrackObserver(obs)        → disconnect + untrack
 *   cleanup.trackListener(t, ev, fn, opts?) → untrack on destroyAll
 *   cleanup.untrackListener(t, ev, fn) → removeEventListener + untrack
 *   cleanup.destroyAll()                → tear everything down (safe to call repeatedly)
 */

;(function() {
  'use strict'

  if (window.heatsyncCleanup) return

  // --- internal state ---
  const _intervals = new Set()
  const _timeouts = new Set()
  const _observers = new Set()
  // listeners: Array<{ target, event, handler, options }>
  const _listeners = []

  // --- intervals ---

  function _setInterval(fn, ms) {
    const id = setInterval(fn, ms)
    _intervals.add(id)
    return id
  }

  function _clearInterval(id) {
    clearInterval(id)
    _intervals.delete(id)
  }

  // --- timeouts ---

  function _setTimeout(fn, ms) {
    let id
    id = setTimeout(() => {
      _timeouts.delete(id)
      fn()
    }, ms)
    _timeouts.add(id)
    return id
  }

  function _clearTimeout(id) {
    clearTimeout(id)
    _timeouts.delete(id)
  }

  // --- observers ---

  function _trackObserver(observer) {
    _observers.add(observer)
    return observer
  }

  function _untrackObserver(observer) {
    if (!observer) return
    try { observer.disconnect() } catch (e) {}
    _observers.delete(observer)
  }

  // --- listeners ---

  function _trackListener(target, event, handler, options) {
    if (!target || !event || !handler) return
    target.addEventListener(event, handler, options)
    _listeners.push({ target, event, handler, options })
  }

  function _untrackListener(target, event, handler) {
    if (!target || !event || !handler) return
    for (let i = _listeners.length - 1; i >= 0; i--) {
      const l = _listeners[i]
      if (l.target === target && l.event === event && l.handler === handler) {
        target.removeEventListener(event, handler, l.options)
        _listeners.splice(i, 1)
      }
    }
  }

  // --- requestAnimationFrame ---

  const _rafs = new Set()

  function _raf(fn) {
    const id = requestAnimationFrame(() => {
      _rafs.delete(id)
      fn()
    })
    _rafs.add(id)
    return id
  }

  function _cancelRaf(id) {
    cancelAnimationFrame(id)
    _rafs.delete(id)
  }

  // --- nuclear ---

  function _destroyAll() {
    _intervals.forEach(id => clearInterval(id))
    _intervals.clear()

    _timeouts.forEach(id => clearTimeout(id))
    _timeouts.clear()

    _observers.forEach(obs => {
      try { obs.disconnect() } catch (e) {}
    })
    _observers.clear()

    _rafs.forEach(id => cancelAnimationFrame(id))
    _rafs.clear()

    for (let i = _listeners.length - 1; i >= 0; i--) {
      const l = _listeners[i]
      try { l.target.removeEventListener(l.event, l.handler, l.options) } catch (e) {}
    }
    _listeners.length = 0
  }

  window.heatsyncCleanup = {
    setInterval: _setInterval,
    clearInterval: _clearInterval,
    setTimeout: _setTimeout,
    clearTimeout: _clearTimeout,
    trackObserver: _trackObserver,
    untrackObserver: _untrackObserver,
    trackListener: _trackListener,
    untrackListener: _untrackListener,
    addEventListener: _trackListener,
    removeEventListener: _untrackListener,
    raf: _raf,
    cancelRaf: _cancelRaf,
    destroyAll: _destroyAll,
  }
})()


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
  DEBUG
}

// Global export
if (typeof window !== 'undefined') {
  window.heatsyncUtils = utils
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

let _ctxInvalidatedLogged = false

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
      // Extension context invalidated (common during updates) — log once per session
      if (err.message?.includes('Extension context invalidated')) {
        if (!_ctxInvalidatedLogged) {
          _ctxInvalidatedLogged = true
          console.warn('[heatsync] Extension context invalidated')
        }
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

/**
 * i18n helper — thin wrapper around chrome.i18n.getMessage
 */
function t(key, substitutions) {
  try {
    return rawApi?.i18n?.getMessage(key, substitutions) || key
  } catch { return key }
}

function hydrateI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]'))
    el.textContent = t(el.dataset.i18n) || el.textContent
  for (const el of root.querySelectorAll('[data-i18n-placeholder]'))
    el.placeholder = t(el.dataset.i18nPlaceholder) || el.placeholder
  for (const el of root.querySelectorAll('[data-i18n-title]'))
    el.title = t(el.dataset.i18nTitle) || el.title
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
const _pendingRafs = new Set()
mcSignal.addEventListener('abort', () => {
  _timers.intervals.forEach(clearInterval)
  _timers.timeouts.forEach(clearTimeout)
  _timers.observers.forEach(o => o.disconnect())
  _pendingRafs.forEach(cancelAnimationFrame); _pendingRafs.clear()
  if (irc) { irc.destroy(); }
  if (kickChat) { kickChat.destroy(); }
  cleanupAuthIrc(true)
  delete window._hsMcEmoteContextHandler
  delete window._hsMcEmoteClickHandler
  delete window._hsEmoteTooltipSetup
  delete window._hsMcSettingsListener
  delete window._hsMcTabHandler
  delete window._hsMcTypeRevealHandler
})
window.addEventListener('pagehide', () => lifecycle.abort())

const cleanup = {
  setInterval(fn, ms) { const id = setInterval(fn, ms); _timers.intervals.push(id); return id },
  clearInterval(id) { clearInterval(id); const i = _timers.intervals.indexOf(id); if (i !== -1) _timers.intervals.splice(i, 1) },
  setTimeout(fn, ms) {
    const id = setTimeout(() => {
      const idx = _timers.timeouts.indexOf(id)
      if (idx !== -1) _timers.timeouts.splice(idx, 1)
      fn()
    }, ms)
    _timers.timeouts.push(id)
    return id
  },
  clearTimeout(id) { clearTimeout(id); const i = _timers.timeouts.indexOf(id); if (i !== -1) _timers.timeouts.splice(i, 1) },
  addEventListener(target, event, handler) {
    target.addEventListener(event, handler, { signal: mcSignal })
  },
  trackObserver(obs) { _timers.observers.push(obs); return obs },
  untrackObserver(obs) {
    if (!obs) return
    try { obs.disconnect() } catch (e) {}
    const i = _timers.observers.indexOf(obs)
    if (i !== -1) _timers.observers.splice(i, 1)
  },
  raf(fn) {
    let id
    id = requestAnimationFrame(() => { _pendingRafs.delete(id); fn() })
    _pendingRafs.add(id)
    return id
  },
  cancelRaf(id) { cancelAnimationFrame(id); _pendingRafs.delete(id) },
}


// --- multichat/styles.js ---
// Styles - all CSS for multichat panel, tabs, messages, modals

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
      padding: 4px 6px;
      background: #000;
      border-bottom: 1px solid #808080;
      flex-shrink: 0;
      order: -1;
      z-index: 10;
      align-items: center;
      box-sizing: border-box;
    }

    /* Chatterino-style composable tab states: idle → has-new → active */
    .hs-mc-tab {
      padding: 2px 8px !important;
      background: #000 !important;
      color: #808080 !important;
      border: 1px solid #808080 !important;
      border-radius: 0 !important;
      cursor: pointer !important;
      font-family: inherit;
      font-size: 12px !important;
      line-height: 1 !important;
      font-weight: 400 !important;
      white-space: nowrap !important;
      transition: none;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      /* Auto-size to label content; cap so a long YT @handle can't blow out
         the row — the tab bar wraps to a second line as needed. !important
         beats the legacy .hs-mc-tab flex:1 rule lower in this file. */
      flex: 0 0 auto !important;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
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
    /* Wrapping section for channel tabs */
    .hs-mc-tabs-scroll {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      width: 100%;
      align-items: center;
    }
    /* Util row — always a single row of 4, fits container width */
    .hs-mc-util-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    .hs-mc-util-row .hs-mc-tab {
      min-width: 0 !important;
      padding: 2px 0 !important;
    }
    /* Util buttons — same size as tabs, flow inline and wrap naturally */
    .hs-mc-util-btn {
      font-weight: 700 !important;
    }
    /* Util row — gray frame for ui parity with heatsync.org chat-tile.
       Hover → white bg / black text per global hover rule. */
    .hs-mc-util-row .hs-mc-tab {
      color: #808080 !important;
      border-color: #808080 !important;
    }
    .hs-mc-util-row .hs-mc-tab:hover {
      background: #fff !important;
      color: #000 !important;
      border-color: #fff !important;
    }
    /* Settings ⚙ wraps to row 2; span full width so it doesn't sit as a
       lonely 1/4-cell square. */
    .hs-mc-util-row .hs-mc-tab[data-tab="settings"] {
      grid-column: 1 / -1;
    }
    /* Whisper conversation list */
    .hs-whisper-conv {
      padding: 6px 8px;
      cursor: pointer;
      border-bottom: 1px solid #000;
    }
    .hs-whisper-conv:hover {
      background: #fff;
      color: #000;
    }
    .hs-whisper-conv:hover .hs-whisper-preview,
    .hs-whisper-conv:hover .hs-whisper-time {
      color: #808080;
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
      border-bottom: 1px solid #808080;
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
    .hs-whisper-pending {
      opacity: 0.45;
    }
    .hs-whisper-pending .hs-whisper-status {
      color: #ffaf00;
    }
    .hs-whisper-failed {
      background: rgba(255, 0, 0, 0.10);
    }
    .hs-whisper-failed .hs-whisper-status {
      color: #ff5555;
      font-weight: 700;
    }
    .hs-whisper-retry {
      cursor: pointer;
      text-decoration: underline;
    }
    .hs-whisper-retry:hover {
      color: #ff8700;
    }
    .hs-whisper-relogin {
      display: inline-block;
      padding: 1px 6px;
      margin-left: 4px;
      background: #ff8700;
      color: #fff !important;
      border-radius: 3px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .hs-whisper-relogin:hover {
      background: #fff;
      color: #000 !important;
    }
    .hs-mc-bits-badge {
      display: inline-block;
      padding: 0 4px;
      margin-right: 3px;
      background: #9146ff;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      vertical-align: middle;
    }
    #hs-mc-multistream-banner {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: #1a1a1a;
      border-bottom: 1px solid #ff8700;
      font-size: 12px;
      color: #fff;
    }
    #hs-mc-multistream-banner[hidden] {
      display: none;
    }
    .hs-mc-multi-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hs-mc-multi-link {
      background: #ff8700;
      color: #fff;
      border: 0;
      padding: 2px 8px;
      font-weight: 700;
      font-size: 11px;
      cursor: pointer;
    }
    .hs-mc-multi-link:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-multi-dismiss {
      background: transparent;
      color: #888;
      border: 0;
      padding: 0 4px;
      font-size: 16px;
      cursor: pointer;
    }
    .hs-mc-multi-dismiss:hover {
      color: #fff;
    }
    /* Inline stream event notifications */
    .hs-mc-stream-event {
      padding: 2px 4px;
      font-size: 13px;
      line-height: 1.4;
      font-style: italic;
      background: rgba(128, 128, 0, 0.25);
      border-bottom: 1px solid #000;
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
      border-bottom: 1px solid #000;
      color: #fff;
    }
    .hs-mc-feed-inline .hs-mc-ts { margin-right: 4px; }
    .hs-mc-feed-inline .hs-feed-body { color: #fff; }
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

    /* Resize drag bar — convention: solid #ff8700, ≥6px, no labels.
       Always visible so user knows the edge is grab-able. */
    #hs-mc-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 6px;
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
    }
    #hs-mc-resize-handle:hover,
    #hs-mc-resize-handle:active {
      background: #ffaa33;
      opacity: 1;
    }

    /* YouTube resize handle — left edge of #secondary sidebar */
    #hs-yt-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 6px;
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
    }
    #hs-yt-resize-handle:hover,
    #hs-yt-resize-handle:active {
      background: #ffaa33;
      opacity: 1;
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

    /* Chat overlay banners (predictions + polls at top of messages) */
    .hs-mc-chat-banner {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: -8px -8px 6px -8px;
      padding: 0;
    }
    .hs-mc-chat-banner-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 600;
      transition: background 0.15s;
    }
    .hs-mc-chat-banner-item:hover {
      filter: brightness(1.2);
    }
    .hs-mc-chat-banner-pred {
      background: linear-gradient(90deg, rgba(56,122,255,0.2), rgba(245,0,155,0.15));
      border-bottom: 1px solid rgba(56,122,255,0.3);
      color: #a8c8ff;
    }
    .hs-mc-chat-banner-poll {
      background: linear-gradient(90deg, rgba(0,200,100,0.15), rgba(0,188,212,0.1));
      border-bottom: 1px solid rgba(0,200,100,0.25);
      color: #80e0a0;
    }
    .hs-mc-chat-banner-pin {
      background: linear-gradient(90deg, rgba(191,148,255,0.12), rgba(145,70,255,0.08));
      border-bottom: 1px solid rgba(191,148,255,0.2);
      color: #d4bfff;
    }
    .hs-mc-chat-banner-hype {
      background: linear-gradient(90deg, rgba(255,135,0,0.15), rgba(255,60,60,0.1));
      border-bottom: 1px solid rgba(255,135,0,0.3);
      color: #ffb060;
    }
    .hs-mc-chat-banner-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .hs-mc-chat-banner-title {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
    }
    .hs-mc-chat-banner-timer {
      font-family: 'SF Mono', 'Consolas', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #ff8700;
      background: rgba(0,0,0,0.4);
      padding: 1px 5px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .hs-mc-chat-banner-badge {
      font-size: 10px;
      font-weight: 700;
      color: #ff5050;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
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
      background: #ff0;
      color: #000;
      border: none;
      border-radius: 0;
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      z-index: 1005;
      transition: none;
    }
    #hs-mc-new-msgs:hover {
      background: #fff;
      color: #000;
    }
    .hs-arrow-down {
      font-size: 13px;
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
    .hs-native-hidden [class*="chat-room__content"] > *:not(.hs-pc-panel):not(.hs-profile-card) {
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
    .chat-shell.hs-native-hidden > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card),
    [class*="chat-shell"].hs-native-hidden > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card) {
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
      color: #808080;
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
    span.hs-mc-avatar.hs-mc-avatar-fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1;
      user-select: none;
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
      content-visibility: auto;
      contain-intrinsic-size: auto 28px;
    }
    .hs-mc-msg.hs-mc-zebra, .hs-feed-msg.hs-mc-zebra {
      background: rgba(255,255,255,0.04);
    }
    .hs-mc-msg:hover {
    }
    .hs-mc-msg.hs-mc-thread-highlight {
      background: #808000 !important;
      box-shadow: none !important;
      position: relative;
      z-index: 2;
    }
    /* Reply context text needs to be readable on the olive thread-highlight bg */
    .hs-mc-msg.hs-mc-thread-highlight .hs-mc-reply-ctx,
    .hs-mc-msg.hs-mc-thread-highlight .hs-mc-reply-user {
      color: #fff !important;
      border-left-color: #fff !important;
    }
    .hs-mc-feed-inline, .hs-mc-stream-event {
      content-visibility: auto;
      contain-intrinsic-size: auto 32px;
    }
    .hs-mc-msg[data-msg-id] {
      position: relative;
    }
    .hs-mc-reply-btn {
      display: none;
      position: absolute;
      top: 1px;
      right: 2px;
      background: #000;
      border: 1px solid #808080;
      color: #fff;
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
      background: #000;
      border-bottom: 1px solid #000;
      padding: 2px 6px;
      font-size: 11px;
      color: #fff;
    }
    #hs-mc-reply-indicator span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #hs-mc-reply-cancel {
      background: none;
      border: none;
      color: #808080;
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
    /* Event color palette — each notice class gets a distinct ANSI hue so the
       chat can be read at a glance. Using saturated 16-color anchors plus
       Twitch/HS conventions (purple = sub, orange = HS brand/raid). */
    /* Red is reserved for @-mentions. Ban keeps red (severe/permanent). Timeout =
       green (#008000) — visible mod-action marker so timeouts read at a glance
       (matches the heatsync site). Recovery (untimeout) keeps the same green. */
    .hs-mc-msg.hs-mc-notice-ban       { border-left-color: #ff0000 !important; background: rgba(255, 0, 0, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-ban       .hs-mc-system-text { color: #ff4040; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-timeout   { border-left-color: #008000 !important; background: rgba(0, 128, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-timeout   .hs-mc-system-text { color: #00cc44; }
    .hs-mc-msg.hs-mc-notice-unban     { border-left-color: #00ff00 !important; background: rgba(0, 255, 0, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-unban     .hs-mc-system-text { color: #00ff00; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-untimeout { border-left-color: #008000 !important; background: rgba(0, 128, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-untimeout .hs-mc-system-text { color: #00cc44; }
    /* Role grants (blue mod / pink VIP) */
    .hs-mc-msg.hs-mc-notice-mod-add     { border-left-color: #4080ff !important; background: rgba(64, 128, 255, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-mod-add     .hs-mc-system-text { color: #4080ff; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-mod-remove  { border-left-color: #c0c0c0 !important; background: rgba(192, 192, 192, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-mod-remove  .hs-mc-system-text { color: #c0c0c0; }
    .hs-mc-msg.hs-mc-notice-vip-add     { border-left-color: #ff00ff !important; background: rgba(255, 0, 255, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-vip-add     .hs-mc-system-text { color: #ff44ff; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-vip-remove  { border-left-color: #c0c0c0 !important; background: rgba(192, 192, 192, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-vip-remove  .hs-mc-system-text { color: #c0c0c0; }
    /* Single message delete = dark red (less severe than ban) */
    .hs-mc-msg.hs-mc-notice-delete    { border-left-color: #800000 !important; background: rgba(128, 0, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-delete    .hs-mc-system-text { color: #ff8080; }
    /* Room mode change = aqua */
    .hs-mc-msg.hs-mc-notice-mode      { border-left-color: #00ffff !important; background: rgba(0, 255, 255, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-mode      .hs-mc-system-text { color: #00ffff; font-weight: 600; }
    /* Sub events (Twitch convention = purple, gifts = brighter magenta variant) */
    .hs-mc-msg.hs-mc-notice-sub       { border-left-color: #9146ff !important; background: rgba(145, 70, 255, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-sub       .hs-mc-system-text { color: #b87aff; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-gift      { border-left-color: #cc44ff !important; background: rgba(204, 68, 255, 0.16) !important; }
    .hs-mc-msg.hs-mc-notice-gift      .hs-mc-system-text { color: #cc44ff; font-weight: 600; }
    /* Raid = HS brand orange */
    .hs-mc-msg.hs-mc-notice-raid      { border-left-color: #ff8700 !important; background: rgba(255, 135, 0, 0.18) !important; }
    .hs-mc-msg.hs-mc-notice-raid      .hs-mc-system-text { color: #ff8700; font-weight: 700; }
    /* Announcement = pure yellow (broadcaster speaking) */
    .hs-mc-msg.hs-mc-notice-announce  { border-left-color: #ffff00 !important; background: rgba(255, 255, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-announce  .hs-mc-system-text { color: #ffff00; font-weight: 600; }
    /* Bits = gold/amber (distinct from raid orange and announce yellow) */
    .hs-mc-msg.hs-mc-notice-bits      { border-left-color: #ffaa00 !important; background: rgba(255, 170, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-bits      .hs-mc-system-text { color: #ffd700; font-weight: 600; }
    /* Watch-streak milestone = teal (different from cyan mode change) */
    .hs-mc-msg.hs-mc-notice-milestone { border-left-color: #008080 !important; background: rgba(0, 128, 128, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-milestone .hs-mc-system-text { color: #00cccc; font-weight: 600; }
    /* Errors / rejections = dim maroon */
    .hs-mc-msg.hs-mc-notice-error     { border-left-color: #800000 !important; background: rgba(128, 0, 0, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-error     .hs-mc-system-text { color: #ff8080; }
    /* First-time chatter (Twitch first-msg=1) = HS brand orange */
    .hs-mc-msg.hs-mc-first-msg { border-left: 3px solid #ff8700; padding-left: 8px; background: rgba(255, 135, 0, 0.08); }
    .hs-mc-first-tag { display: inline-block; font-size: 10px; font-weight: 700; color: #000; background: #ff8700; padding: 0 4px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
    /* Cleared (timed out / banned / msg deleted) — Twitch-native dim + strikethrough.
       Username and badges stay visible so the reader can see who got hit; the body
       text and emotes get faded with a strikethrough. */
    .hs-mc-msg.hs-mc-msg-cleared { opacity: 0.45; }
    .hs-mc-msg.hs-mc-msg-cleared .hs-mc-emote,
    .hs-mc-msg.hs-mc-msg-cleared .hs-mc-emote-wrapper > img,
    .hs-mc-msg.hs-mc-msg-cleared .hs-mc-emote-stack img { filter: grayscale(1) brightness(0.7); }
    /* Strikethrough only the message body, not the user/badges/timestamp */
    .hs-mc-msg.hs-mc-msg-cleared > *:not(.hs-mc-ts):not(.hs-mc-user):not(.hs-mc-badge-img):not(.hs-mc-badge):not(.hs-mc-channel):not(.hs-mc-platform-badge):not(.hs-mc-reply-btn):not(.hs-mc-reply-ctx) { text-decoration: line-through; }
    .hs-mc-msg.hs-mc-redeemed {
      background: rgba(145, 71, 255, 0.15);
      border-left: 3px solid #9147ff;
      padding-left: 8px;
    }
    .hs-mc-msg.hs-mc-highlighted {
      background: rgba(255, 215, 0, 0.1);
      border-left: 3px solid #ffd700;
      padding-left: 8px;
    }
    .hs-mc-redeem-label {
      color: #9147ff;
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
    }
    .hs-mc-highlight-label {
      color: #ffd700;
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
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
      color: #fff;
      border-left-color: #fff;
    }
    .hs-mc-msg.hs-first-msg {
      box-shadow: inset 2px 0 0 #ff8700;
    }
    .hs-mc-msg.hs-kw-match {
      background: rgba(255, 135, 0, 0.18);
      box-shadow: inset 0 0 0 1px #ff8700;
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
      z-index: 100000;
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
    #hs-user-tooltip .hs-pc-bio-mention { color: #ff8700; cursor: pointer; }
    #hs-user-tooltip .hs-pc-bio-mention:hover { text-decoration: underline; }
    #hs-user-tooltip .hs-pc-bio-tag { color: #fff; text-decoration: none; }
    #hs-user-tooltip .hs-pc-bio-tag:hover { text-decoration: underline; }
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
    #hs-user-tooltip .hs-pc-stat.op {
      color: #ff0000;
      font-weight: 700;
      border-color: #ff0000;
    }
    #hs-user-tooltip .hs-pc-stat.op .hs-pc-num {
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-stat.mop {
      color: #ff00ff;
      font-weight: 700;
      border-color: #ff00ff;
    }
    #hs-user-tooltip .hs-pc-stat.mop .hs-pc-num {
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-stat.re {
      color: #00ffff;
      font-weight: 700;
      border-color: #00ffff;
    }
    #hs-user-tooltip .hs-pc-stat.re .hs-pc-num {
      color: #fff;
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
    #hs-user-tooltip .hs-pc-rel-badge.mutual-follow { background: #000; color: #fff; border: 1px solid #00aaaa; }
    #hs-user-tooltip .hs-pc-rel-badge.mutual-sub { background: #000; color: #fff; border: 1px solid #ff8700; }
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
      color: #808080;
      border: 1px solid #808080;
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
      display: inline-flex;
      align-items: center;
      position: relative;
      vertical-align: middle;
      /* Lock height so collapsed↔expanded toggle doesn't shift line height
         (expanded adds 2px vertical padding via pseudo-element). */
      height: 36px;
      box-sizing: border-box;
    }
    .hs-mc-emote-stack-emotes {
      display: inline-grid;
      place-items: center;
      position: relative;
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
    /* Expanded inner: gray bg via pseudo-element bleeding outward so the box
       layout doesn't grow vs collapsed (no line-height shift, no off-center). */
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes {
      border-radius: 0;
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes::after {
      content: '';
      position: absolute;
      inset: -2px -6px;
      background: #808080;
      z-index: -1;
      pointer-events: none;
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
    /* Hover: show solid color rect, hide image. Color from --hs-highlight-color
       (set by hover source) so cross-highlighted instances all match. */
    .hs-mc-emote-wrapper.hs-emote-highlight::before {
      opacity: 1;
      background: var(--hs-highlight-color, #00ff00) !important;
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

    /* Collapsed stack: unified hover ::before on the stack itself.
       Per-wrapper hover (cross-highlight) is suppressed — stack-level ::before
       paints one solid rectangle. Persistent blocked-dash per emote is kept
       as-is so users can see which specific emotes in the nest are blocked. */
    /* When the stack is hovered, hide ALL per-wrapper ::before indicators
       (incl. persistent blocked-dash on emotes that aren't the cross-highlight
       target) so only the unified stack rect shows. */
    .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight) .hs-mc-emote-wrapper::before {
      display: none !important;
    }
    .hs-mc-emote-stack:not(.expanded)::before {
      content: '';
      position: absolute;
      inset: 4px;
      opacity: 0;
      pointer-events: none;
      z-index: 3;
    }
    .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight)::before {
      opacity: 1;
      background: var(--hs-highlight-color, #00ff00);
      border: none;
    }
    .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight) > .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper > img {
      visibility: hidden;
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

    /* Badge hover tooltip - 4x preview */
    #hs-badge-tooltip {
      position: fixed;
      z-index: 100001;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    }
    #hs-badge-tooltip.visible {
      display: flex;
    }
    #hs-badge-tooltip img {
      object-fit: contain;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
    }
    #hs-badge-tooltip .tooltip-name {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    #hs-badge-tooltip .tooltip-source {
      font-size: 11px;
      padding: 2px 6px;
      margin: 2px -8px -8px;
      border-radius: 0;
      color: #fff;
      width: calc(100% + 16px);
      text-align: center;
      background: #808080;
    }

    /* Emote hover tooltip - 4x preview */
    #hs-emote-tooltip {
      position: fixed;
      z-index: 100001;
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
    #hs-emote-tooltip .tooltip-source.sub { background: #9146ff; color: #fff; }
    #hs-emote-tooltip .tooltip-source.blocked { background: #ff0000; color: #fff; }
    /* Per-provider source label colors (override .global/.channel) */
    #hs-emote-tooltip .tooltip-source.src-7tv { background: #29d8f6; color: #000; }
    #hs-emote-tooltip .tooltip-source.src-bttv { background: #d50014; color: #fff; }
    #hs-emote-tooltip .tooltip-source.src-ffz { background: #0086c8; color: #fff; }
    #hs-emote-tooltip .tooltip-source.src-twitch { background: #9146ff; color: #fff; }
    #hs-emote-tooltip .tooltip-source.src-kick { background: #53fc18; color: #000; }
    #hs-emote-tooltip .tooltip-source.src-heatsync { background: #ff8700; color: #000; }

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
      color: #fff;
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
      color: #808080;
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
    /* Emoji autocomplete dropdown */
    #hs-mc-emoji-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 8px;
      right: 8px;
      background: #000;
      border: 1px solid #808080;
      z-index: 1004;
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 2px;
    }
    .hs-mc-emoji-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 13px;
      color: #fff;
    }
    .hs-mc-emoji-row:hover,
    .hs-mc-emoji-row.selected {
      background: #808080;
    }
    .hs-mc-emoji-preview {
      font-size: 18px;
      width: 24px;
      text-align: center;
      font-variant-emoji: emoji;
    }
    .hs-mc-emoji-name {
      color: #808080;
      font-size: 12px;
    }
    .hs-mc-emoji-row.selected .hs-mc-emoji-name,
    .hs-mc-emoji-row:hover .hs-mc-emoji-name {
      color: #fff;
    }
    #hs-mc-slash-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 8px;
      right: 8px;
      background: #000;
      border: 1px solid #808080;
      z-index: 1004;
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 2px;
    }
    .hs-mc-slash-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 12px;
      color: #fff;
    }
    .hs-mc-slash-row:hover,
    .hs-mc-slash-row.selected {
      background: #808080;
    }
    .hs-mc-slash-name { color: #ff8700; font-weight: 700; }
    .hs-mc-slash-args { color: #aaa; flex-shrink: 0; }
    .hs-mc-slash-desc { color: #808080; font-size: 11px; margin-left: auto; }
    .hs-mc-slash-row:hover .hs-mc-slash-args,
    .hs-mc-slash-row.selected .hs-mc-slash-args,
    .hs-mc-slash-row:hover .hs-mc-slash-desc,
    .hs-mc-slash-row.selected .hs-mc-slash-desc { color: #fff; }
    .hs-mc-slash-row:hover .hs-mc-slash-name,
    .hs-mc-slash-row.selected .hs-mc-slash-name { color: #fff; }
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

    /* === Full-panel btop-style profile card === */
    .hs-pcard {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 14px 10px 8px 10px;
      color: #ddd;
      background: #000;
      font-size: 12px;
      line-height: 1.5;
      box-sizing: border-box;
    }
    .hs-pcard-section {
      border: 1px solid #555;
      margin-bottom: 10px;
      padding: 10px 10px 8px 10px;
      position: relative;
      box-sizing: border-box;
    }
    .hs-pcard-section-title {
      position: absolute;
      top: -8px;
      left: 8px;
      background: #000;
      padding: 0 6px;
      font-size: 10px;
      color: #aaa;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .hs-pcard-id { border-color: #ff8700; }
    .hs-pcard-id .hs-pcard-section-title { color: #ff8700; }
    .hs-pcard-stream { border-color: #f00; }
    .hs-pcard-stream .hs-pcard-section-title { color: #f00; }
    .hs-pcard-recent { border-color: #888; }
    .hs-pcard-actions { border-color: #444; }

    .hs-pcard-id-row { display: flex; gap: 12px; align-items: flex-start; }
    .hs-pcard-avatar {
      width: 56px; height: 56px; border-radius: 4px; object-fit: cover;
      border: 1px solid #444; flex-shrink: 0;
    }
    .hs-pcard-id-text { flex: 1; min-width: 0; }
    .hs-pcard-name { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .hs-pcard-livedot { color: #f00; animation: hs-pcard-pulse 1.5s infinite; }
    @keyframes hs-pcard-pulse { 50% { opacity: 0.35; } }
    .hs-pcard-pills { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
    .hs-pcard-pill {
      padding: 2px 6px; border: 1px solid; text-decoration: none;
      font-weight: 600; display: inline-flex; align-items: center; gap: 3px;
    }
    .hs-pcard-pill:hover { filter: brightness(1.3); }
    .hs-pcard-pill-twitch { color: #9146ff; border-color: #9146ff; }
    .hs-pcard-pill-kick { color: #53fc18; border-color: #53fc18; }
    .hs-pcard-pill-youtube { color: #ff0000; border-color: #ff0000; }
    .hs-pcard-pill-heatsync { color: #ff8700; border-color: #ff8700; }
    .hs-pcard-pill-live { color: #f00; }
    .hs-pcard-bio {
      margin-top: 8px; padding: 4px 0; color: #aaa;
      font-style: italic; font-size: 11px; border-top: 1px dashed #333;
      white-space: pre-wrap; word-break: break-word;
    }
    .hs-pcard-bio-mention { color: #ff8700; cursor: pointer; font-style: normal; }
    .hs-pcard-bio-mention:hover { text-decoration: underline; }
    .hs-pcard-bio-tag { color: #fff; text-decoration: none; font-style: normal; }
    .hs-pcard-bio-tag:hover { text-decoration: underline; }
    .hs-pcard-meta {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      margin-top: 4px; font-size: 10px; line-height: 1.4;
    }
    .hs-pcard-age { color: #808080; }
    .hs-pcard-role {
      padding: 0 4px; font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-pcard-role.partner { background: #ffaa00; color: #000; }
    .hs-pcard-role.affiliate { background: #808080; color: #fff; }
    .hs-pcard-verified {
      display: inline-flex; align-items: center; justify-content: center;
      width: 12px; height: 12px; font-size: 9px; font-weight: 700;
    }
    .hs-pcard-verified.twitch { background: #9146ff; color: #fff; }
    .hs-pcard-verified.kick { background: #53fc18; color: #000; }
    .hs-pcard-rel { color: #ff8700; font-weight: 600; margin-top: 4px; }
    .hs-pcard-link { color: #ff8700; text-decoration: none; font-weight: 700; }
    .hs-pcard-link:hover { text-decoration: underline; }
    .hs-pcard-msg {
      display: flex; gap: 6px; padding: 1px 0;
      font-size: 11px; align-items: baseline;
    }
    .hs-pcard-msg-ts { color: #666; flex-shrink: 0; font-size: 10px; }
    .hs-pcard-msg-plat {
      flex-shrink: 0; font-size: 9px; padding: 0 3px; border: 1px solid;
      font-weight: 700; line-height: 1.4;
    }
    .hs-pcard-msg-text {
      color: #ddd; word-break: break-word; overflow-wrap: anywhere;
    }
    .hs-pcard-action-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 4px;
    }
    .hs-pcard-action {
      background: #0a0a0a; color: #ddd; border: 1px solid #444;
      padding: 6px 8px; cursor: pointer; font-family: inherit; font-size: 11px;
      text-align: left; box-sizing: border-box;
    }
    .hs-pcard-action:hover:not(:disabled) { background: #fff; color: #000; }
    .hs-pcard-action:hover:not(:disabled) .hs-pcard-kbd { color: #000; }
    .hs-pcard-action:disabled { opacity: 0.4; cursor: not-allowed; }
    .hs-pcard-kbd { color: #ff8700; font-weight: 700; }

    /* Per-tab platform filter toggles (T/K/YT) — sits above util-row in tab bar */
    #hs-mc-platfilter {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    #hs-mc-platfilter:empty { display: none; }
    .hs-mc-pf-btn {
      background: transparent;
      border: 1px solid;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 0;
      cursor: pointer;
      font-family: inherit;
      line-height: 1;
      box-sizing: border-box;
      min-width: 0;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .hs-mc-pf-btn.hs-mc-pf-twitch { border-color: #9146ff; background: #9146ff; color: #fff; }
    .hs-mc-pf-btn.hs-mc-pf-kick { border-color: #53fc18; background: #53fc18; color: #000; }
    .hs-mc-pf-btn.hs-mc-pf-youtube { border-color: #ff0000; background: #ff0000; color: #fff; }
    .hs-mc-pf-btn.off {
      background: transparent !important;
      color: #555 !important;
      border-color: #333 !important;
    }
    .hs-mc-pf-btn:hover { filter: brightness(1.2); }
    .hs-mc-pf-btn.off:hover {
      background: rgba(255,255,255,0.06) !important;
      color: #aaa !important;
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
      left: 0;
      right: 0;
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
    .hs-mc-pred-title img,
    .hs-mc-pred-outcome-title img {
      height: 1.2em;
      vertical-align: -0.2em;
      margin: 0 1px;
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
      background: rgba(0,0,0,0.7);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      font-size: 11px;
      padding: 3px 8px;
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-bet-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-bet-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-pred-bet-btn:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-pred-bet-custom {
      width: 52px;
      background: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      color: #000;
      font-size: 11px;
      padding: 2px 6px;
      outline: none;
      font-family: inherit;
    }
    .hs-mc-pred-bet-custom:focus {
      border-color: #ff8700;
    }
    .hs-mc-pred-bet-custom:disabled {
      background: rgba(255,255,255,0.08);
      color: #808080;
      opacity: 0.3;
    }
    .hs-mc-pred-bet-custom::-webkit-inner-spin-button,
    .hs-mc-pred-bet-custom::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .hs-mc-pred-bet-go {
      background: rgba(0,0,0,0.7);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 3px 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-bet-go:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-bet-go:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-pred-bet-go:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
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
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 8px 12px;
      margin-bottom: 8px;
      border-radius: 4px;
      text-align: center;
    }
    .hs-mc-pred-result-amount {
      font-size: 18px;
      font-weight: 900;
      font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
      letter-spacing: -0.5px;
    }
    .hs-mc-pred-result-label {
      font-size: 12px;
      font-weight: 600;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 4px;
    }
    .hs-mc-pred-result-won {
      background: linear-gradient(135deg, rgba(0,200,100,0.15), rgba(255,135,0,0.1));
      color: #00e070;
      border: 1px solid rgba(0,200,100,0.3);
    }
    .hs-mc-pred-result-won .hs-mc-pred-result-amount {
      text-shadow: 0 0 12px rgba(0,224,112,0.4);
    }
    .hs-mc-pred-result-lost {
      background: rgba(255,60,60,0.08);
      color: #ff5050;
      border: 1px solid rgba(255,60,60,0.2);
    }
    .hs-mc-pred-result-refund {
      background: linear-gradient(135deg, rgba(255,135,0,0.1), rgba(255,191,0,0.08));
      color: #ff8700;
      border: 1px solid rgba(255,135,0,0.25);
    }
    .hs-mc-pred-result-neutral {
      font-size: 12px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
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

    /* ═══ Mod controls ═══ */
    .hs-mc-pred-mod-notice {
      font-size: 11px;
      color: #ff8700;
      background: rgba(255,135,0,0.08);
      border: 1px solid rgba(255,135,0,0.2);
      border-radius: 3px;
      padding: 5px 8px;
      margin-top: 6px;
      text-align: center;
    }
    .hs-mc-pred-resolve-yours {
      border-color: #ff8700 !important;
      color: #ff8700 !important;
    }
    .hs-mc-pred-resolve-yours:hover {
      background: #ff8700 !important;
      color: #000 !important;
    }
    .hs-mc-pred-mod-row {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .hs-mc-pred-mod-btn {
      font-size: 11px;
      padding: 4px 10px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-mod-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-mod-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-pred-mod-btn:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-pred-lock-btn:hover,
    .hs-mc-pred-cancel-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-resolve-btn {
      margin-top: 6px;
      width: 100%;
      color: var(--oc);
      border-color: var(--oc);
    }
    .hs-mc-pred-resolve-btn:hover {
      background: var(--oc);
      color: #000;
    }

    /* ═══ Create prediction form ═══ */
    .hs-mc-pred-create {
      margin-top: 10px;
    }
    .hs-mc-pred-create-toggle {
      width: 100%;
      text-align: center;
    }
    .hs-mc-pred-create-form {
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .hs-mc-pred-create-input {
      font-size: 12px;
      padding: 2px 8px;
      background: #fff;
      color: #000;
      border: none;
      font-family: inherit;
      outline: none;
    }
    .hs-mc-pred-create-input:focus {
      outline: 1px solid #ff8700;
    }
    .hs-mc-pred-create-dur-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .hs-mc-pred-create-dur-label {
      font-size: 11px;
      color: #808080;
      margin-right: 2px;
    }
    .hs-mc-pred-create-dur {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(0,0,0,0.7);
      color: #aaa;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-create-dur:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-create-dur-active {
      background: #ff8700;
      color: #000;
      border-color: #ff8700;
    }
    .hs-mc-pred-create-submit {
      background: rgba(0,0,0,0.7);
      color: #ff8700;
      border-color: #ff8700;
      font-weight: 600;
    }
    .hs-mc-pred-create-submit:hover {
      background: #ff8700;
      color: #000;
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
      color: #ff8700;
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
      font-family: inherit;
    }
    .hs-mc-poll-vote-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-poll-vote-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-poll-mod-row {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .hs-mc-poll-mod-btn {
      font-size: 11px;
      padding: 4px 10px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-poll-mod-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-poll-mod-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-poll-mod-btn:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-poll-empty {
      padding: 0 12px;
    }
    .hs-mc-poll-create {
      border-top: 1px solid rgba(255,255,255,0.06);
      padding-top: 8px;
      margin-top: 4px;
    }
    .hs-mc-poll-create-toggle {
      width: 100%;
      text-align: center;
    }
    .hs-mc-poll-create-form {
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .hs-mc-poll-create-input {
      font-size: 12px;
      padding: 2px 8px;
      background: #fff;
      color: #000;
      border: none;
      font-family: inherit;
      outline: none;
    }
    .hs-mc-poll-create-input:focus {
      outline: 1px solid #ff8700;
    }
    .hs-mc-poll-create-dur-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .hs-mc-poll-create-dur-label {
      font-size: 11px;
      color: #808080;
      margin-right: 2px;
    }
    .hs-mc-poll-create-dur {
      font-size: 10px;
      padding: 2px 6px;
      background: rgba(0,0,0,0.7);
      color: #808080;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-poll-create-dur:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-poll-create-dur-active {
      background: #ff8700;
      color: #000;
      border-color: #ff8700;
    }
    .hs-mc-poll-create-submit {
      width: 100%;
      text-align: center;
      background: rgba(0,0,0,0.7);
      color: #ff8700;
      border-color: #ff8700;
      font-weight: 600;
    }
    .hs-mc-poll-create-submit:hover {
      background: #ff8700;
      color: #000;
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
      color: #808080;
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
      gap: 8px !important;
      padding: 6px 14px !important;
      font-size: 12px !important;
      color: #fff !important;
      visibility: visible !important;
    }
    .hs-mc-setting-row.hs-mc-setting-row-split {
      justify-content: space-between !important;
    }
    .hs-mc-setting-row:nth-child(even) {
      background: rgba(255,255,255,0.03);
    }
    .hs-mc-setting-row:hover {
      background: rgba(255,255,255,0.06);
    }
    .hs-mc-setting-label {
      color: #fff !important;
      font-size: 13px !important;
      cursor: help;
      border-bottom: 1px dotted #808080;
    }
    #hs-settings-tip {
      position: fixed;
      z-index: 99999;
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      padding: 6px 8px;
      font-size: 11px;
      line-height: 1.4;
      max-width: 260px;
      pointer-events: none;
      display: none;
      font-family: 'Liberation Mono', monospace;
    }
    #hs-settings-tip.visible { display: block; }
    .hs-mc-setting-row.hs-mc-setting-row-block {
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
    }
    .hs-mc-setting-textarea {
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      font-family: 'Liberation Mono', monospace;
      font-size: 12px;
      padding: 4px 6px;
      resize: vertical;
      min-height: 48px;
      width: 100%;
      box-sizing: border-box;
    }
    .hs-mc-setting-textarea:focus {
      outline: none;
      border-color: #ff8700;
    }
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
      background: #cc0000;
      border: none;
      border-radius: 0;
      cursor: pointer;
      padding: 0;
      transition: none;
      flex-shrink: 0;
    }
    .hs-mc-toggle-pill.active {
      background: #00dd00;
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

    /* Rotation button — inherits from .hs-mc-util-btn */

    /* When input bar is hidden, overlay fills the gap */
    .hs-tabs-top:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay,
    .hs-tabs-right:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay,
    .hs-tabs-left:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay {
      bottom: 0 !important;
    }
    .hs-tabs-top:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker,
    .hs-tabs-right:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker,
    .hs-tabs-left:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker {
      bottom: 0 !important;
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
    .hs-tabs-right .hs-mc-tabs-scroll {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
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
      bottom: 44px;
      top: auto;
      padding: 3px 8px;
      border-top: 1px solid #fff;
      border-bottom: none;
      z-index: 1001;
    }
    .hs-tabs-bottom #hs-mc-inputbar {
      padding: 4px 8px;
    }
    .hs-tabs-bottom #hs-mc-overlay {
      top: 0;
      bottom: 75px; /* tab bar + input bar */
    }
    .hs-tabs-bottom #hs-mc-emote-picker {
      bottom: 75px; /* tab bar + input bar */
    }
    /* When inputbar is hidden, tabs flush to bottom */
    .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-tabbar {
      bottom: 0;
    }
    .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay {
      bottom: 31px !important; /* tab bar only — override generic rule */
    }
    .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker {
      bottom: 31px !important;
    }

    /* LEFT SIDE TABS LAYOUT - absolute position at left edge (matches right) */
    .hs-tabs-left #hs-mc-tabbar {
      position: absolute !important;
      left: 0 !important;
      right: auto !important;
      top: 0 !important;
      bottom: 0 !important;
      width: 90px;
      flex-direction: column;
      flex-shrink: 0;
      padding: 4px;
      gap: 2px;
      border-bottom: none;
      border-right: 1px solid #fff;
      border-radius: 0;
      background: #000;
      overflow-y: auto;
      z-index: 1001;
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
    .hs-tabs-left .hs-mc-tabs-scroll {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
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
      padding: 1px 6px;
      line-height: 1.4;
      font-size: 12px;
      word-wrap: break-word;
      word-break: break-word;
    }
    .hs-feed-avatar {
      width: 16px;
      height: 16px;
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
    /* Canonical heat number — used everywhere via heatSpanHtml/heatSpanEl. Tier color/glow is set inline. */
    .hs-heat-num {
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-weight: 900;
      line-height: 1;
    }
    .hs-feed-heat-breathe {
      animation: hs-feed-heat-breathe 2.5s ease-in-out infinite;
    }
    @keyframes hs-feed-heat-breathe {
      0%, 100% { background: rgba(60,20,0,0.15); }
      50% { background: rgba(80,25,0,0.25); }
    }
    @keyframes hs-heat-breathe {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.04); opacity: 0.9; }
    }
    .hs-post-link {
      color: #ffff00;
      font-weight: 700;
      cursor: pointer;
    }
    .hs-post-link:hover {
      text-decoration: underline;
    }
    @keyframes hs-post-highlight-pulse {
      0%   { outline-color: rgba(255, 255, 0, 1); background-color: rgba(255, 255, 0, 0.15); }
      100% { outline-color: rgba(255, 255, 0, 0); background-color: transparent; }
    }
    .hs-post-highlight {
      outline: 2px solid #ffff00;
      outline-offset: -2px;
      animation: hs-post-highlight-pulse 1s ease-out forwards;
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

    /* ---- MEDIA / EMBEDS ---- */
    .hs-feed-media {
      margin: 4px 0 2px;
      max-width: 100%;
    }
    .hs-feed-media img,
    .hs-feed-media video,
    .hs-feed-media-direct img,
    .hs-feed-media-direct video {
      max-width: 100%;
      max-height: 320px;
      display: block;
      border-radius: 3px;
      cursor: pointer;
      background: #000;
    }
    .hs-feed-media-multi {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 3px;
    }
    .hs-feed-media-multi .hs-feed-media-item {
      max-height: 180px;
      width: 100%;
      object-fit: cover;
      border-radius: 3px;
      background: #000;
    }
    .hs-feed-embed-container {
      position: relative;
      width: 100%;
      max-width: 480px;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 3px;
      overflow: hidden;
    }
    .hs-feed-embed-container iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .hs-feed-embed-spotify {
      aspect-ratio: auto;
      height: 152px;
    }
    .hs-feed-embed-soundcloud {
      aspect-ratio: auto;
      height: 166px;
    }
    .hs-feed-embed-twitter {
      aspect-ratio: auto;
      height: 380px;
      max-width: 480px;
      background: transparent;
    }
    .hs-feed-embed-imgur {
      aspect-ratio: auto;
      max-width: 480px;
      background: transparent;
    }
    .hs-feed-embed-tiktok {
      aspect-ratio: 9 / 16;
      max-width: 320px;
    }
    .hs-feed-link-card {
      margin: 4px 0 2px;
      padding: 4px 6px;
      background: rgba(255,255,255,0.04);
      border: 1px solid #333;
      border-radius: 3px;
      max-width: 480px;
    }
    .hs-feed-link-card-link {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ff8700;
      text-decoration: none;
      font-size: 11px;
    }
    .hs-feed-link-card-link:hover {
      text-decoration: underline;
    }
    .hs-feed-link-card-icon {
      color: #888;
      font-size: 10px;
      flex-shrink: 0;
    }
    .hs-feed-link-card-url {
      color: #aaa;
      word-break: break-all;
    }
    .hs-feed-media-deleted {
      padding: 6px 8px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #888;
      font-size: 11px;
      border-radius: 3px;
      max-width: 480px;
    }

    /* ---- ENGAGEMENT BAR ---- */
    .hs-feed-engage {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
      padding-left: 2px;
    }
    .hs-feed-heat-btn,
    .hs-feed-bm-btn {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background: none;
      border: none;
      padding: 1px 3px;
      cursor: pointer;
      color: #808080;
      font-size: 11px;
      font-family: inherit;
      line-height: 1;
    }
    .hs-feed-heat-btn:hover .hs-fe-icon path,
    .hs-feed-bm-btn:hover .hs-fe-icon path {
      stroke: #ff8700;
    }
    .hs-feed-heat-btn.active .hs-fe-count {
      color: #ff8700;
    }
    .hs-fe-count {
      font-size: 10px;
      color: #808080;
      min-width: 0;
    }
    .hs-fe-icon {
      display: block;
      flex-shrink: 0;
    }
    .hs-feed-react-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px;
    }
    .hs-feed-react-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background: rgba(255,255,255,0.05);
      border: 1px solid #444;
      padding: 1px 3px;
      cursor: pointer;
      font-size: 10px;
      color: #808080;
      font-family: inherit;
      line-height: 1;
    }
    .hs-feed-react-chip.active {
      border-color: #ff8700;
      color: #ff8700;
    }
    .hs-feed-react-chip:hover {
      border-color: #808080;
    }
    .hs-feed-react-img {
      width: 14px;
      height: 14px;
      vertical-align: middle;
    }
    .hs-feed-react-add {
      background: none;
      border: 1px solid #444;
      color: #808080;
      padding: 1px 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      line-height: 1;
    }
    .hs-feed-react-add:hover {
      border-color: #ff8700;
      color: #ff8700;
    }
    .hs-mc-react-picker {
      position: fixed;
      z-index: 99999;
      background: #111;
      border: 1px solid #808080;
      padding: 6px;
      width: 200px;
      max-height: 220px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .hs-mc-react-search {
      width: 100%;
      box-sizing: border-box;
      background: #000;
      border: 1px solid #808080;
      color: #fff;
      padding: 3px 5px;
      font-family: inherit;
      font-size: 11px;
    }
    .hs-mc-react-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      overflow-y: auto;
      max-height: 160px;
    }
    .hs-mc-react-emote {
      background: none;
      border: 1px solid transparent;
      padding: 2px;
      cursor: pointer;
    }
    .hs-mc-react-emote:hover {
      border-color: #ff8700;
    }
    .hs-mc-react-emote img {
      width: 28px;
      height: 28px;
      display: block;
    }

    /* ---- TEXT FORMATTING ---- */
    .hs-spoiler {
      background: #808080;
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
      background: #000;
      padding: 1px 4px;
      border-radius: 2px;
      font-family: monospace;
      font-size: 12px;
    }

    /* ---- TAB BADGE ---- */
    .hs-mc-tab .hs-badge {
      background: #ff6b35;
      color: #fff;
      border-radius: 2px;
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
    .hs-native-hidden#channel-chatroom > * {
      display: none !important;
    }
    /* Force Kick chatroom hidden — container (sibling) becomes the panel */
    .hs-native-hidden#channel-chatroom {
      display: none !important;
    }
    /* Container becomes the fixed side panel when native is hidden */
    .hs-native-hidden#channel-chatroom ~ #hs-mc-container {
      position: fixed !important;
      right: 0 !important;
      top: 0 !important;
      bottom: 0 !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: 100vh !important;
      z-index: 9999 !important;
      display: flex !important;
      background: #000 !important;
      transition: none !important;
    }
    /* Shrink Kick's main content to make room for HeatSync panel */
    body:has(.hs-native-hidden#channel-chatroom) main {
      margin-right: var(--hs-kick-chat-width, 340px) !important;
      transition: none !important;
    }
    /* On live tab (native chat showing), hide overlay + input but keep tabs visible */
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-overlay,
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-emote-picker,
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > .hs-mc-inputbar {
      display: none !important;
    }
    /* Keep tabbar visible over native chat — fixed panel, respects tab position */
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      position: fixed !important;
      z-index: 10000 !important;
      background: transparent !important;
      pointer-events: none;
      overflow: visible !important;
    }
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      pointer-events: auto;
      background: var(--hs-bg, #000) !important;
      position: relative !important;
    }
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-kick-resize-handle {
      pointer-events: auto;
    }
    /* Top tabs (default) — horizontal bar at top of chat */
    .hs-tabs-top #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      top: 0 !important; right: 0 !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: auto !important;
      flex-direction: column !important;
    }
    .hs-tabs-top #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      width: 100% !important;
    }
    /* Bottom tabs — horizontal bar at bottom of chat */
    .hs-tabs-bottom #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      bottom: 0 !important; right: 0 !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: auto !important;
      flex-direction: column-reverse !important;
    }
    .hs-tabs-bottom #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      width: 100% !important;
    }
    /* Right tabs — vertical bar on right edge */
    .hs-tabs-right #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      top: 0 !important; right: 0 !important; bottom: 0 !important;
      width: auto !important;
      height: 100% !important;
      flex-direction: row !important;
    }
    .hs-tabs-right #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: column !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      width: 90px !important;
      height: 100% !important;
      max-height: none !important;
      border-left: 1px solid #fff;
    }
    /* Left tabs — vertical bar on left edge of chat area */
    .hs-tabs-left #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      top: 0 !important; right: auto !important; bottom: 0 !important;
      left: calc(100vw - var(--hs-kick-chat-width, 340px)) !important;
      width: auto !important;
      height: 100% !important;
      flex-direction: row-reverse !important;
    }
    .hs-tabs-left #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: column !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      width: 90px !important;
      height: 100% !important;
      max-height: none !important;
      border-right: 1px solid #fff;
    }

    /* Kick resize handle — convention: solid #ff8700, always visible. */
    #hs-kick-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 6px;
      height: 100%;
      cursor: col-resize;
      z-index: 10000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
      pointer-events: auto;
    }
    #hs-kick-resize-handle:hover,
    body:has(#hs-resize-overlay) #hs-kick-resize-handle {
      background: #ffaa33;
      opacity: 1;
    }

    /* Boost Kick's popover/tooltip z-index above our panels */
    .z-popover, .z-tooltip, .z-modal, .z-dropdown,
    [data-radix-popper-content-wrapper] {
      z-index: 100000 !important;
    }

    /* Prevent channel accent color bleed on offline/home pages */
    .channel-root--home {
      background-color: #000 !important;
    }
    .root-scrollable__content {
      background: #000;
    }
    /* Collapsed chat rules moved to injectStyles() so they're always active */

    /* Mentions search bar */
    #hs-mc-search-bar {
      display: none;
      flex-shrink: 0;
      padding: 4px 6px;
      border-bottom: 1px solid #333;
      background: #000;
    }
    #hs-mc-search-bar.visible {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #hs-mc-search-input {
      flex: 1;
      padding: 5px 10px;
      background: #fff;
      color: #000;
      border: 1px solid #808080;
      border-radius: 0;
      font-size: 12px;
      font-family: inherit;
      outline: none;
    }
    #hs-mc-search-input:focus {
      border-color: #ff8700;
    }
    #hs-mc-search-input::placeholder {
      color: #808080;
    }
    #hs-mc-search-spinner {
      display: none;
      width: 14px;
      height: 14px;
      border: 2px solid #333;
      border-top-color: #ff8700;
      border-radius: 50%;
      animation: hs-spin 0.6s linear infinite;
      flex-shrink: 0;
    }
    #hs-mc-search-spinner.visible {
      display: block;
    }
    @keyframes hs-spin {
      to { transform: rotate(360deg); }
    }
    .hs-mc-search-result {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 5px 8px;
      border-bottom: 1px solid #1a1a1a;
      cursor: pointer;
      font-size: 12px;
    }
    .hs-mc-search-result:hover {
      background: #111;
    }
    .hs-mc-search-result:last-child {
      border-bottom: none;
    }
    .hs-mc-search-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #666;
      font-size: 11px;
    }
    .hs-mc-search-user {
      font-weight: bold;
      color: #ff8700;
    }
    .hs-mc-search-content {
      color: #ccc;
      word-break: break-word;
    }
    .hs-mc-search-empty {
      padding: 16px;
      text-align: center;
      color: #808080;
      font-size: 12px;
    }
    /* btop-style discover: bordered widgets, distinct accents per section */
    .hs-discover-root {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: -8px;
      padding: 6px;
    }
    .hs-discover-row1 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }
    @container (min-width: 460px) {
      .hs-discover-row1 {
        grid-template-columns: 1fr 1fr;
      }
    }
    .hs-discover-section {
      padding: 0;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,0,0,0.18);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .hs-discover-section + .hs-discover-section { margin-top: 0; }
    .hs-discover-heading {
      font-size: 12px;
      color: #ff8700;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin: 0;
      padding: 4px 8px;
      background: rgba(255,135,0,0.08);
      border-bottom: 1px solid rgba(255,135,0,0.2);
      line-height: 1.3;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
    }
    .hs-discover-heading-title {
      flex-shrink: 0;
    }
    .hs-discover-subtitle {
      font-size: 10px;
      color: #707070;
      padding: 2px 8px 3px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-style: italic;
      line-height: 1.2;
    }
    .hs-discover-section-body {
      padding: 1px 0;
    }
    .hs-discover-section-empty {
      padding: 8px;
      color: #555;
      font-size: 11px;
      font-style: italic;
      text-align: center;
    }
    .hs-discover-meta {
      color: #aaa;
      font-size: 11px;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .hs-discover-live-count {
      color: #ff3030;
      font-weight: 700;
      animation: hs-pulse-live 1.6s ease-in-out infinite;
    }
    @keyframes hs-pulse-live {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
    }
    .hs-discover-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      padding: 3px 8px;
      margin: 0;
    }
    .hs-discover-chip {
      display: inline-block;
      padding: 1px 7px;
      background: rgba(255,135,0,0.12);
      border: 1px solid rgba(255,135,0,0.4);
      color: #ff8700;
      font-size: 12px;
      text-decoration: none;
      cursor: pointer;
      border-radius: 0;
      line-height: 1.5;
      white-space: nowrap;
    }
    .hs-discover-chip:hover { background: #fff; color: #000; }
    .hs-discover-profile-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      text-decoration: none;
      cursor: pointer;
      line-height: 1.3;
      font-size: 13px;
      border-left: 2px solid transparent;
    }
    .hs-discover-profile-row:hover { background: rgba(255,135,0,0.07); }
    .hs-discover-profile-row.hs-discover-row-live { border-left-color: #ff3030; }
    .hs-discover-rank {
      color: #666;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      width: 18px;
      text-align: right;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-discover-row-live .hs-discover-rank { color: #aaa; }
    .hs-discover-live-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #ff3030;
      box-shadow: 0 0 5px #ff3030;
      animation: hs-pulse-live 1.6s ease-in-out infinite;
      flex-shrink: 0;
    }
    .hs-discover-live-spacer { width: 7px; flex-shrink: 0; }
    .hs-discover-avatar {
      width: 18px; height: 18px;
      flex-shrink: 0;
      border-radius: 0;
      object-fit: cover;
      background: #1a1a1a;
    }
    .hs-discover-avatar-empty { display: inline-block; }
    .hs-discover-profile-name {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 130px;
      flex-shrink: 1;
    }
    .hs-discover-platforms {
      display: inline-flex;
      gap: 2px;
      flex-shrink: 0;
    }
    .hs-discover-platforms .hs-plat {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 0 3px;
      line-height: 1.2;
      text-decoration: none;
      opacity: 0.6;
      transition: opacity 0.1s;
    }
    .hs-discover-platforms .hs-plat:hover { opacity: 1; }
    .hs-discover-platforms .hs-plat-live { opacity: 1; text-shadow: 0 0 4px currentColor; }
    .hs-discover-platforms .hs-plat-t { color: #9146ff; }
    .hs-discover-platforms .hs-plat-k { color: #53fc18; }
    .hs-discover-platforms .hs-plat-yt { color: #ff0000; }
    .hs-discover-platforms .hs-plat-h { color: #ff8700; }
    /* Post platform letters use same colors */
    .hs-discover-post-plat.hs-plat-t { color: #9146ff; }
    .hs-discover-post-plat.hs-plat-k { color: #53fc18; }
    .hs-discover-post-plat.hs-plat-yt { color: #ff0000; }
    .hs-discover-post-plat.hs-plat-h { color: #ff8700; }
    .hs-discover-bar {
      flex: 1;
      min-width: 28px;
      max-width: 90px;
      height: 5px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
      border-radius: 1px;
    }
    .hs-discover-bar > i {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, #ff8700, #ffaa33);
    }
    .hs-discover-row-live .hs-discover-bar > i {
      background: linear-gradient(90deg, #ff3030, #ff8700);
    }
    /* Heat number — color/glow comes from inline style via discoverHeatStyle (canonical tiers) */
    .hs-discover-heat {
      display: inline-block;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
      line-height: 1;
    }
    .hs-discover-viewers {
      font-size: 11px;
      color: #ff5050;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }

    /* Filter chips bar */
    .hs-discover-chips-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      padding: 5px 8px;
      background: rgba(0,0,0,0.25);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-discover-chips-label {
      color: #666;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 700;
      margin-right: -2px;
    }
    .hs-discover-chip-btn {
      padding: 2px 8px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      color: #aaa;
      cursor: pointer;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-weight: 600;
      border-radius: 0;
      line-height: 1.4;
      transition: color 0.1s, border-color 0.1s, background 0.1s;
    }
    .hs-discover-chip-btn:hover {
      color: #fff;
      border-color: #ff8700;
    }
    .hs-discover-chip-btn.hs-active {
      background: #ff8700;
      border-color: #ff8700;
      color: #000;
    }
    .hs-discover-chip-btn.hs-chip-plat-t.hs-active {
      background: #9146ff;
      border-color: #9146ff;
      color: #fff;
    }
    .hs-discover-chip-btn.hs-chip-plat-k.hs-active {
      background: #53fc18;
      border-color: #53fc18;
      color: #000;
    }
    .hs-discover-chip-btn.hs-chip-plat-yt.hs-active {
      background: #ff0000;
      border-color: #ff0000;
      color: #fff;
    }

    /* Section colour variants — distinct accent borders + headers per widget */
    .hs-discover-section-live {
      border-color: rgba(255,48,48,0.35);
    }
    .hs-discover-section-live > .hs-discover-heading {
      background: rgba(255,48,48,0.10);
      border-bottom-color: rgba(255,48,48,0.35);
      color: #ff5050;
    }
    .hs-discover-section-live > .hs-discover-heading .hs-discover-heading-title::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ff3030;
      box-shadow: 0 0 5px #ff3030;
      margin-right: 5px;
      vertical-align: middle;
      animation: hs-pulse-live 1.6s ease-in-out infinite;
    }
    .hs-discover-section-posts {
      border-color: rgba(255,135,0,0.3);
    }
    .hs-discover-section-posts > .hs-discover-heading {
      background: rgba(255,135,0,0.10);
      color: #ffaa44;
    }
    .hs-discover-section-trending {
      border-color: rgba(0,180,255,0.28);
    }
    .hs-discover-section-trending > .hs-discover-heading {
      background: rgba(0,180,255,0.08);
      color: #4dc6ff;
      border-bottom-color: rgba(0,180,255,0.3);
    }
    .hs-discover-section-tags {
      border-color: rgba(80,255,120,0.28);
    }
    .hs-discover-section-tags > .hs-discover-heading {
      background: rgba(80,255,120,0.08);
      color: #6dff8d;
      border-bottom-color: rgba(80,255,120,0.3);
    }

    /* Leaderboard multi-column when wide — fewer scrolls */
    .hs-discover-leaderboard-body .hs-discover-profile-row {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @container (min-width: 520px) {
      .hs-discover-leaderboard-body {
        columns: 2;
        column-gap: 0;
        column-rule: 1px solid rgba(255,255,255,0.05);
      }
    }
    @container (min-width: 800px) {
      .hs-discover-leaderboard-body {
        columns: 3;
      }
    }

    /* Post rows — 2-line: meta line + content snippet */
    .hs-discover-post-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 5px 8px;
      text-decoration: none;
      cursor: pointer;
      line-height: 1.35;
      border-left: 2px solid transparent;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .hs-discover-post-row:last-child { border-bottom: none; }
    .hs-discover-post-row:hover {
      background: rgba(255,135,0,0.07);
      border-left-color: rgba(255,135,0,0.4);
    }
    .hs-discover-post-meta {
      display: flex;
      align-items: baseline;
      gap: 5px;
      font-size: 11px;
    }
    .hs-discover-post-spacer { flex: 1; }
    .hs-discover-post-time {
      color: #666;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }
    .hs-discover-post-plat {
      flex-shrink: 0;
    }
    .hs-discover-post-user {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 1;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-discover-post-text {
      color: #c8c8c8;
      font-size: 12px;
      line-height: 1.4;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-wrap: break-word;
      word-break: break-word;
    }
    .hs-discover-post-row:hover .hs-discover-post-text { color: #fff; }
    .hs-discover-post-heat {
      flex-shrink: 0;
    }
    .hs-discover-post-replies {
      font-size: 11px;
      color: #808080;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }

    /* Tag chips with optional inline count */
    .hs-discover-chip-count {
      margin-left: 5px;
      color: rgba(255,135,0,0.6);
      font-variant-numeric: tabular-nums;
      font-size: 11px;
    }
    .hs-discover-chip:hover .hs-discover-chip-count { color: #000; }

    .hs-pinned-row {
      display: block;
      padding: 2px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      text-decoration: none;
      cursor: pointer;
      line-height: 1.4;
    }
    .hs-pinned-row:hover { background: rgba(255,135,0,0.07); }
    .hs-pinned-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      margin: 0;
    }
    .hs-pinned-channel { font-size: 10px; color: #ff8700; font-weight: 600; }
    .hs-pinned-user { font-size: 10px; color: #bbb; }
    .hs-pinned-time { font-size: 10px; color: #808080; margin-left: auto; }
    .hs-pinned-body {
      font-size: 11px;
      color: #ddd;
      word-break: break-word;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-pinned-row:hover .hs-pinned-body { color: #fff; }

    /* ---- YOUTUBE NATIVE CHAT HIDING ----
       Inline display:none on the iframe gets blown away when YT recreates
       <ytd-live-chat-frame> during ad transitions. CSS rule keyed off our
       container survives the swap. */
    body:has(#hs-mc-container) ytd-live-chat-frame#chat,
    body:has(#hs-mc-container) ytd-live-chat-frame {
      display: none !important;
    }

    /* ============================================
       UNIVERSAL HOVER — every interactive element inside the extension
       inverts to white-bg/black-text on hover and keyboard focus.
       Single rule, no per-class allowlist, descendants inherit.
       Same primitive as heatsync.org, scoped to .hs-mc-container so the
       host site's own buttons aren't touched.
       ============================================ */
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):hover,
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):focus-visible {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):hover *,
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):focus-visible * {
      color: #000 !important;
      fill: #000 !important;
      stroke: #000 !important;
      border-color: #000 !important;
    }

    /* ============================================
       C BUTTON — chat panel position around the player.
       Default 'right' = no override (existing native layout).
       For left/top/bottom: fixed-position #hs-mc-container at the chosen
       viewport edge, collapse the native chat sidebar's layout claim so
       the player can fill the freed space, and push the platform's content
       root with element-level padding (NOT body — body padding breaks
       sticky nav / fullscreen / scroll on every platform).

       Single source of truth: body classes drive everything.
         hs-platform-{twitch,kick,yt}
         hs-mode-{normal,theatre}
         hs-chat-{right,left,top,bottom}
       JS sets --hs-chat-w / --hs-chat-h CSS vars from settings.
       ============================================ */

    /* --- chat container: fixed-position at chosen edge --- */
    body.hs-chat-left #hs-mc-container,
    body.hs-chat-top #hs-mc-container,
    body.hs-chat-bottom #hs-mc-container {
      position: fixed !important;
      z-index: 9999 !important;
      background: #000 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
    }
    body.hs-chat-left #hs-mc-container {
      top: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      right: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: 100vh !important;
    }
    body.hs-chat-top #hs-mc-container {
      top: 0 !important;
      bottom: auto !important;
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-chat-bottom #hs-mc-container {
      top: auto !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
    }

    /* --- TWITCH: collapse .right-column to give the player back its space.
       width:0 + overflow:visible (not display:none) so #hs-mc-container
       inside chat-shell stays render-tree visible while the parent's
       layout box claims zero width. --- */
    body.hs-platform-twitch.hs-chat-left .right-column,
    body.hs-platform-twitch.hs-chat-top .right-column,
    body.hs-platform-twitch.hs-chat-bottom .right-column {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      flex: 0 0 0 !important;
      overflow: visible !important;
    }
    body.hs-platform-twitch.hs-chat-left .chat-shell,
    body.hs-platform-twitch.hs-chat-top .chat-shell,
    body.hs-platform-twitch.hs-chat-bottom .chat-shell,
    body.hs-platform-twitch.hs-chat-left [class*="chat-shell"],
    body.hs-platform-twitch.hs-chat-top [class*="chat-shell"],
    body.hs-platform-twitch.hs-chat-bottom [class*="chat-shell"] {
      overflow: visible !important;
    }
    body.hs-platform-twitch.hs-chat-left .channel-root {
      padding-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-twitch.hs-chat-top .channel-root {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-twitch.hs-chat-bottom .channel-root {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
    }
    /* Twitch theatre: persistent-player fills viewport via position:fixed —
       padding on .channel-root won't reach it. Inset the player itself. */
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-left .persistent-player,
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-left .video-player--theatre {
      left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-top .persistent-player,
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-top .video-player--theatre {
      top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-bottom .persistent-player,
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-bottom .video-player--theatre {
      bottom: var(--hs-chat-h, 35vh) !important;
    }

    /* --- KICK: #channel-chatroom IS the native chat shell (sibling of
       our #hs-mc-container). When chat moves, hide the shell entirely
       so it gives up its 320px sidebar width back to <main>. --- */
    body.hs-platform-kick.hs-chat-left #channel-chatroom,
    body.hs-platform-kick.hs-chat-top #channel-chatroom,
    body.hs-platform-kick.hs-chat-bottom #channel-chatroom {
      display: none !important;
    }
    body.hs-platform-kick.hs-chat-left main {
      padding-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-kick.hs-chat-top main {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-kick.hs-chat-bottom main {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
    }
    /* Kick theatre: main has data-theatre="true"; player fills viewport.
       Inset main directly so the chat strip doesn't overlay the video. */
    body.hs-platform-kick.hs-mode-theatre.hs-chat-top main {
      margin-top: var(--hs-chat-h, 35vh) !important;
      padding-top: 0 !important;
    }
    body.hs-platform-kick.hs-mode-theatre.hs-chat-bottom main {
      margin-bottom: var(--hs-chat-h, 35vh) !important;
      padding-bottom: 0 !important;
    }
    body.hs-platform-kick.hs-mode-theatre.hs-chat-left main {
      margin-left: var(--hs-chat-w, 340px) !important;
      padding-left: 0 !important;
    }

    /* --- YOUTUBE: collapse #secondary; pad #primary --- */
    body.hs-platform-yt.hs-chat-left #secondary,
    body.hs-platform-yt.hs-chat-top #secondary,
    body.hs-platform-yt.hs-chat-bottom #secondary {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      flex: 0 0 0 !important;
      overflow: visible !important;
    }
    body.hs-platform-yt.hs-chat-left #chat-container,
    body.hs-platform-yt.hs-chat-top #chat-container,
    body.hs-platform-yt.hs-chat-bottom #chat-container {
      overflow: visible !important;
    }
    body.hs-platform-yt.hs-chat-left #primary {
      margin-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-chat-top #primary {
      margin-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-yt.hs-chat-bottom #primary {
      margin-bottom: var(--hs-chat-h, 35vh) !important;
    }
    /* Tell YT how much vertical space is NOT available for the player so
       its own layout JS shrinks the player to fit. YT computes player
       height = viewport - --ytd-watch-flexy-non-player-height. Bumping
       that var by chat-strip height makes YT shrink the player itself,
       which keeps the 16:9 aspect ratio (no distortion, no clipping). */
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy {
      --ytd-watch-flexy-non-player-height: calc(56px + 12px + 92px + var(--hs-chat-h, 35vh)) !important;
      --ytd-watch-flexy-min-player-height: 200px !important;
    }
    /* Belt-and-braces: cap player container too, in case YT's JS doesn't
       re-read the var on every chat-height change. */
    body.hs-platform-yt.hs-chat-top #player-container,
    body.hs-platform-yt.hs-chat-top #player-container-outer,
    body.hs-platform-yt.hs-chat-bottom #player-container,
    body.hs-platform-yt.hs-chat-bottom #player-container-outer {
      max-height: calc(100vh - var(--hs-chat-h, 35vh) - 60px) !important;
    }
    /* Hide YT's #below stack (suggested thumbnails / video info / comments)
       when chat takes the screen — chat is the focus, the noise goes away.
       Center the player horizontally so it doesn't hug the left edge once
       the surrounding content is gone. */
    body.hs-platform-yt.hs-chat-top #below,
    body.hs-platform-yt.hs-chat-bottom #below,
    body.hs-platform-yt.hs-chat-left #below {
      display: none !important;
    }
    body.hs-platform-yt.hs-chat-top #primary-inner,
    body.hs-platform-yt.hs-chat-bottom #primary-inner,
    body.hs-platform-yt.hs-chat-left #primary-inner {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    body.hs-platform-yt.hs-chat-top #player,
    body.hs-platform-yt.hs-chat-bottom #player,
    body.hs-platform-yt.hs-chat-left #player {
      margin-left: auto !important;
      margin-right: auto !important;
    }
    /* YouTube theatre: ytd-watch-flexy[theater] makes the player full-row.
       The #full-bleed-container is what owns the player. Inset it. */
    body.hs-platform-yt.hs-mode-theatre.hs-chat-left ytd-watch-flexy[theater] #full-bleed-container,
    body.hs-platform-yt.hs-mode-theatre.hs-chat-left ytd-watch-flexy[theater] #player-full-bleed-container {
      padding-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-mode-theatre.hs-chat-top ytd-watch-flexy[theater] #full-bleed-container,
    body.hs-platform-yt.hs-mode-theatre.hs-chat-top ytd-watch-flexy[theater] #player-full-bleed-container {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-yt.hs-mode-theatre.hs-chat-bottom ytd-watch-flexy[theater] #full-bleed-container,
    body.hs-platform-yt.hs-mode-theatre.hs-chat-bottom ytd-watch-flexy[theater] #player-full-bleed-container {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
    }
  `;
  document.head.appendChild(style);
}


// --- multichat/automod.js ---
// Automod - client-side filter applied before pushing to buffers

let automodAllCaps = false
let automodCompiled = null

function compileAutomod(rawSettings) {
  automodAllCaps = !!rawSettings?.automodAllCaps
  const raw = (rawSettings?.automodRegex || '').trim()
  if (!raw) { automodCompiled = null; return }
  const patterns = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (patterns.length === 0) { automodCompiled = null; return }
  try {
    automodCompiled = new RegExp(patterns.join('|'), 'i')
  } catch (e) {
    const esc = patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    try { automodCompiled = new RegExp(esc, 'i') } catch { automodCompiled = null }
  }
}

async function loadAutomodSettings() {
  try {
    const stored = await chrome.storage.sync.get(['ui_settings'])
    compileAutomod(stored.ui_settings || {})
  } catch {}
}

function shouldAutomod(text) {
  if (!text) return false
  if (automodCompiled && automodCompiled.test(text)) return true
  if (automodAllCaps && text.length > 10) {
    const letters = text.replace(/[^A-Za-z]/g, '')
    if (letters.length >= 8) {
      const upper = letters.replace(/[^A-Z]/g, '').length
      if (upper / letters.length > 0.7) return true
    }
  }
  return false
}


// --- multichat/stream-stats.js ---
// Stream stats - per-channel message/mention/chatter/emote counters + summary card

// Stream stats (per channel, lowercase). Reset on stream:online; rendered on stream:offline.
// { msgCount, mentionCount, startedAt, chatters: Map<user,count>, emotes: Map<name,count> }
const streamStats = new Map()
const STREAM_STATS_TOP_N = 5
function getStats(channel) {
  if (!channel) return null
  const key = channel.toLowerCase()
  let s = streamStats.get(key)
  if (!s) {
    s = { msgCount: 0, mentionCount: 0, startedAt: Date.now(), chatters: new Map(), emotes: new Map() }
    streamStats.set(key, s)
    if (streamStats.size > 50) streamStats.delete(streamStats.keys().next().value)
  }
  return s
}
function bumpStreamStats(channel, msg, isMent) {
  const s = getStats(channel)
  if (!s || !msg) return
  s.msgCount++
  if (isMent) s.mentionCount++
  if (msg.user) {
    const u = msg.user
    s.chatters.set(u, (s.chatters.get(u) || 0) + 1)
    if (s.chatters.size > 5000) {
      // Keep top by trimming smallest
      const arr = [...s.chatters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1000)
      s.chatters = new Map(arr)
    }
  }
  const text = msg.text || ''
  if (text && typeof emoteCache !== 'undefined') {
    // count emote name occurrences via word scan
    for (const word of text.split(/\s+/)) {
      if (!word) continue
      if (emoteCache.has(word)) {
        s.emotes.set(word, (s.emotes.get(word) || 0) + 1)
      }
    }
    if (s.emotes.size > 2000) {
      const arr = [...s.emotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 500)
      s.emotes = new Map(arr)
    }
  }
}
function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}
function fmtDuration(ms) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}
function renderStreamSummary(channel) {
  const key = (channel || '').toLowerCase()
  const s = streamStats.get(key)
  if (!s || s.msgCount === 0) return
  const container = document.getElementById('hs-mc-container')
  if (!container) return
  const id = 'hs-mc-summary-' + key.replace(/[^a-z0-9]/gi, '')
  if (document.getElementById(id)) return
  const card = document.createElement('div')
  card.id = id
  card.className = 'hs-mc-stream-summary'
  card.style.cssText = 'background:#0a0a0a;color:#fff;border:1px solid #ff8700;font:11px/1.5 monospace;padding:10px 12px;margin:6px;display:flex;flex-direction:column;gap:6px;'
  const title = document.createElement('div')
  title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#ff8700;font-weight:700'
  const titleText = document.createElement('span')
  titleText.textContent = `${key} stream summary`
  const dismiss = document.createElement('span')
  dismiss.textContent = '×'
  dismiss.style.cssText = 'cursor:pointer;color:#808080;font-weight:700'
  dismiss.addEventListener('click', () => card.remove())
  title.append(titleText, dismiss)
  const stats = document.createElement('div')
  stats.style.color = '#c0c0c0'
  stats.textContent = `${s.msgCount} messages · ${s.chatters.size} chatters · ${s.mentionCount} mentions · ${fmtDuration(Date.now() - s.startedAt)}`
  card.append(title, stats)
  const top = (label, items) => {
    if (items.length === 0) return null
    const row = document.createElement('div')
    row.style.color = '#c0c0c0'
    const lbl = document.createElement('span')
    lbl.style.color = '#808080'
    lbl.textContent = label + ' '
    const list = document.createElement('span')
    list.textContent = items.map(([k, v]) => `${k} (${v})`).join(' · ')
    row.append(lbl, list)
    return row
  }
  const te = top('top emotes:', topN(s.emotes, STREAM_STATS_TOP_N))
  const tc = top('top chatters:', topN(s.chatters, STREAM_STATS_TOP_N))
  if (te) card.append(te)
  if (tc) card.append(tc)
  container.insertBefore(card, container.firstChild)
  // Keep stats around for 1h after offline so user can review on toggle/scroll
  cleanup.setTimeout(() => streamStats.delete(key), 60 * 60 * 1000)
}


// --- multichat/mentions.js ---
// Mentions/notifications - keyword detection, browser notifications, scan existing chat

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Aliases — kick + youtube usernames in addition to currentUsername (twitch).
// Populated by loadHsUsername() in social.js from user_info.kick_username etc.
let mentionAliases = new Set()
let _mentionReList = null
let _mentionReKey = ''

function getMentionTargets() {
  const out = []
  if (currentUsername) out.push(currentUsername)
  for (const a of mentionAliases) {
    if (a && a !== currentUsername) out.push(a)
  }
  return out
}

function isMention(msg) {
  const targets = getMentionTargets()
  if (!targets.length) return false
  const sender = msg.user?.toLowerCase()
  if (sender && targets.includes(sender)) return false
  const text = msg.text.toLowerCase()
  for (const t of targets) {
    if (text.includes('@' + t)) return true
  }
  const key = targets.join('|')
  if (_mentionReKey !== key) {
    _mentionReList = targets.map(t => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i'))
    _mentionReKey = key
  }
  for (const re of _mentionReList) {
    if (re.test(text)) return true
  }
  return false
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
if (!window._hsMcNotifStorageListener) {
  window._hsMcNotifStorageListener = true
  api.storage.onChanged.addListener((changes) => {
    if (changes.hs_notifications) {
      notificationsEnabled = changes.hs_notifications.newValue === true
      if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
        Notification.requestPermission().then(p => { notificationPermission = p })
      }
    }
  })
}

function fireNotification(title, body, tag) {
  if (!notificationsEnabled) return
  if (notificationPermission === 'denied') return
  try {
    const iconUrl = api.runtime.getURL('icon-48.png')
    const n = new Notification(title, { body, icon: iconUrl, tag, silent: false })
    n.onclick = () => { window.focus(); n.close() }
    cleanup.setTimeout(() => n.close(), 8000)
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
  const targets = getMentionTargets()
  if (!targets.length) {
    log('Cannot scan mentions - no username');
    return;
  }

  // Twitch + Kick message selectors
  const messages = document.querySelectorAll('[data-a-target="chat-line-message"], #chatroom-messages [data-index]');
  log('Scanning', messages.length, 'existing messages for mentions of', targets.join(','));

  let found = 0;
  const mentionRes = targets.map(t => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i'))
  messages.forEach(msgEl => {
    // Only check message text, not the full element (which includes sender name)
    const messageEl = msgEl.querySelector('[data-a-target="chat-message-text"], span.font-normal');
    const text = messageEl?.textContent || '';
    const textLower = text.toLowerCase();
    let matched = false
    for (const t of targets) {
      if (textLower.includes('@' + t)) { matched = true; break }
    }
    if (!matched) {
      for (const re of mentionRes) {
        if (re.test(textLower)) { matched = true; break }
      }
    }
    if (matched) {
      const usernameEl = msgEl.querySelector('[data-a-target="chat-message-username"], button.inline.font-bold');
      const username = usernameEl?.textContent || 'unknown';
      // Skip own messages
      if (targets.includes(username.toLowerCase())) return;

      mentionsBuffer.push({
        user: username,
        text: text,
        color: '#fff',
        channel: getCurrentChannel() || 'live',
        time: Date.now() - (messages.length - found) * 1000 // Approximate time
      });
      if (mentionsBuffer.length > MAX_BUFFER) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER);
      found++;
    }
  });

  if (found > 0) {
    log('Found', found, 'existing mentions');
    updateTabIndicator('mentions');
  }
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
        userId: tags['user-id'] || '',
        text: text,
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || privmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || '',
        replyTo: tags['reply-parent-display-name'] ? {
          user: decodeURIComponent(tags['reply-parent-display-name']),
          text: tags['reply-parent-msg-body'] ? decodeURIComponent(tags['reply-parent-msg-body'].replace(/\\s/g, ' ')) : '',
          id: tags['reply-parent-msg-id'] || '',
          threadId: tags['reply-thread-parent-msg-id'] || tags['reply-parent-msg-id'] || ''
        } : null
      }
      // Parse Twitch IRC emote positions → { name: url } map for rendering
      // Format: emoteId:start-end,start-end/emoteId:start-end
      if (tags.emotes) {
        const twitchEmotes = {}
        for (const part of tags.emotes.split('/')) {
          const [emoteId, posStr] = part.split(':')
          if (!emoteId || !posStr) continue
          const firstPos = posStr.split(',')[0]
          const [start, end] = firstPos.split('-').map(Number)
          if (isNaN(start) || isNaN(end)) continue
          const name = text.slice(start, end + 1)
          if (name && !twitchEmotes[name]) {
            twitchEmotes[name] = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`
          }
        }
        if (Object.keys(twitchEmotes).length > 0) msg.twitchEmotes = twitchEmotes
      }
      if (isAction) msg.isAction = true
      const bits = parseInt(tags.bits) || 0
      if (bits > 0) msg.bits = bits
      if (tags['custom-reward-id']) {
        msg.redeemed = true
        msg.rewardId = tags['custom-reward-id']
      }
      if (tags['msg-id'] === 'highlighted-message') msg.isHighlighted = true
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
      const subPlan = tags['msg-param-sub-plan'] || ''
      const tier = subPlan === '2000' ? '2' : subPlan === '3000' ? '3' : (subPlan === 'Prime' ? 'prime' : (subPlan ? '1' : ''))
      const months = parseInt(tags['msg-param-cumulative-months']) || parseInt(tags['msg-param-months']) || 0
      const giftCount = parseInt(tags['msg-param-mass-gift-count']) || 0
      const recipient = tags['msg-param-recipient-display-name'] ? decodeURIComponent(tags['msg-param-recipient-display-name'].replace(/\\s/g, ' ')) : ''
      const raidViewers = parseInt(tags['msg-param-viewerCount']) || 0
      const raidFrom = tags['msg-param-displayName'] ? decodeURIComponent(tags['msg-param-displayName'].replace(/\\s/g, ' ')) : ''
      const announceColor = tags['msg-param-color'] || ''
      const bitsTier = parseInt(tags['msg-param-threshold']) || 0
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
        subTier: tier,
        subMonths: months,
        giftCount,
        recipient,
        raidViewers,
        raidFrom,
        announceColor,
        bitsTier,
        id: tags.id || ''
      }
    }

    // NOTICE: @tags :tmi.twitch.tv NOTICE #channel :message
    // (also used by clearchatToNotice=true from recent-messages API)
    const notice = raw.match(/NOTICE #([^ ]+) :(.+)$/)
    if (notice) {
      const ch = channel || notice[1].toLowerCase()
      const time = parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now()
      const noticeType = tags['msg-id'] || ''
      // Deterministic ID when server doesn't provide one — same notice from live IRC
      // and robotty history dedupes correctly (both share tmi-sent-ts).
      const detId = `notice-${ch}-${time}-${notice[2].slice(0, 64)}`
      return {
        type: 'notice',
        noticeType,
        user: 'system',
        text: notice[2],
        color: '#808080',
        badges: '',
        channel: ch,
        time,
        id: tags.id || detId,
        systemMsg: notice[2]
      }
    }

    // ROOMSTATE: @tags :tmi.twitch.tv ROOMSTATE #channel
    // (slow/subs-only/emote-only/followers-only/r9k mode toggles + initial state on JOIN)
    const roomstate = raw.match(/ROOMSTATE #([^ ]+)/)
    if (roomstate) {
      const ch = channel || roomstate[1].toLowerCase()
      return {
        type: 'roomstate',
        channel: ch,
        time: Date.now(),
        slow: tags['slow'] != null ? parseInt(tags['slow']) : null,
        subsOnly: tags['subs-only'] != null ? tags['subs-only'] === '1' : null,
        emoteOnly: tags['emote-only'] != null ? tags['emote-only'] === '1' : null,
        followersOnly: tags['followers-only'] != null ? parseInt(tags['followers-only']) : null,
        r9k: tags['r9k'] != null ? tags['r9k'] === '1' : null
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
        : t('mc_irc_chat_cleared')
      const ch = channel || clearchat[1].toLowerCase()
      const time = parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now()
      // Deterministic ID — dedupes live CLEARCHAT vs robotty NOTICE replay of same event.
      const detId = `clearchat-${ch}-${target}-${duration || 'perma'}-${time}`
      return {
        type: 'notice',
        noticeType: duration ? 'timeout_success' : 'ban_success',
        user: 'system',
        text,
        color: '#808080',
        badges: '',
        channel: ch,
        time,
        id: tags.id || detId,
        systemMsg: text,
        targetUser: target,
        targetUserId: tags['target-user-id'] || '',
        banDuration: duration ? parseInt(duration) : 0
      }
    }

    // CLEARMSG: @tags :tmi.twitch.tv CLEARMSG #channel :deleted message text
    // (single message deletion)
    const clearmsg = raw.match(/CLEARMSG #([^ ]+) :(.+)$/)
    if (clearmsg) {
      const targetMsgId = tags['target-msg-id']
      return {
        type: 'notice',
        noticeType: 'delete_message_success',
        user: 'system',
        text: t('mc_irc_msg_deleted', [tags.login || 'unknown']),
        color: '#808080',
        badges: '',
        channel: channel || clearmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: targetMsgId || `clearmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: t('mc_irc_msg_deleted', [tags.login || 'unknown']),
        targetUser: tags.login || '',
        targetMsgId: targetMsgId || ''
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
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
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
    cleanup.clearTimeout(this._reconnectTimer);
    for (const id of Object.values(this._persistTimers)) cleanup.clearTimeout(id);
    this._persistTimers = {};
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = cleanup.setInterval(() => {
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
      cleanup.clearInterval(this._heartbeatTimer);
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
    cleanup.clearTimeout(this._reconnectTimer);
    const delay = Math.min(2000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    log('Reconnecting in', delay, 'ms (attempt', this._reconnectAttempts, ')');
    this._reconnectTimer = cleanup.setTimeout(() => {
      if (!this._destroyed) this.connect();
    }, delay);
  }

  parse(data) {
    this._lastData = Date.now();
    this.partial += data;
    // Cap partial buffer to prevent unbounded growth on malformed data
    if (this.partial.length > 65536) this.partial = ''
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
        if (msg.user) {
          usernameCache.add(msg.user);
          setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId);
        }
        if (usernameCache.size > 500) {
          const evicted = usernameCache.values().next().value;
          usernameCache.delete(evicted);
          knownColors.delete(evicted.toLowerCase());
        }
        fetchChannelBadges(ch);

        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.persistBuffer(ch);
          this.emit('message', msg);
        }
      } else if (msg && (msg.type === 'usernotice' || msg.type === 'notice')) {
        const ch = msg.channel;
        if (msg.user !== 'system') {
          if (msg.user) {
            usernameCache.add(msg.user)
            setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
          }
        }
        fetchChannelBadges(ch);
        // CLEARCHAT (ban/timeout) — flag the target's recent messages as cleared
        // so they render dimmed/struck-through (Twitch native behavior).
        if (msg.noticeType === 'ban_success' || msg.noticeType === 'timeout_success') {
          const targetLc = (msg.targetUser || '').toLowerCase()
          if (targetLc && this.channels.has(ch)) {
            const buffer = this.channels.get(ch)
            const all = buffer.getAll()
            for (const m of all) {
              if (m.user && m.user.toLowerCase() === targetLc && !m.cleared) {
                m.cleared = true
                m.clearedReason = msg.banDuration ? `timed out (${msg.banDuration}s)` : 'banned'
              }
            }
          }
        }
        // CLEARMSG — flag the single targeted message
        if (msg.noticeType === 'delete_message_success' && msg.targetMsgId) {
          const id = msg.targetMsgId
          if (this.channels.has(ch)) {
            const buffer = this.channels.get(ch)
            const all = buffer.getAll()
            for (const m of all) {
              if (m.id === id) { m.cleared = true; m.clearedReason = 'deleted'; break }
            }
          }
        }
        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.persistBuffer(ch);
          this.emit('message', msg);
        }
      } else if (msg && msg.type === 'roomstate') {
        // Diff against last-seen state to only emit on actual changes (skip the
        // initial JOIN dump which carries the full state).
        const ch = msg.channel
        if (!this._roomstates) this._roomstates = new Map()
        const prev = this._roomstates.get(ch) || {}
        const changes = []
        // null = field not present in this packet (only changed fields are sent)
        if (msg.slow != null && msg.slow !== prev.slow) {
          changes.push(msg.slow > 0 ? `slow mode on (${msg.slow}s)` : 'slow mode off')
        }
        if (msg.subsOnly != null && msg.subsOnly !== prev.subsOnly) {
          changes.push(msg.subsOnly ? 'sub-only mode on' : 'sub-only mode off')
        }
        if (msg.emoteOnly != null && msg.emoteOnly !== prev.emoteOnly) {
          changes.push(msg.emoteOnly ? 'emote-only mode on' : 'emote-only mode off')
        }
        if (msg.followersOnly != null && msg.followersOnly !== prev.followersOnly) {
          if (msg.followersOnly === -1) changes.push('follower-only mode off')
          else if (msg.followersOnly === 0) changes.push('follower-only mode on')
          else changes.push(`follower-only mode on (${msg.followersOnly}m)`)
        }
        if (msg.r9k != null && msg.r9k !== prev.r9k) {
          changes.push(msg.r9k ? 'unique-chat mode on' : 'unique-chat mode off')
        }
        // Update cached state with whatever fields were present
        const newState = { ...prev }
        for (const k of ['slow', 'subsOnly', 'emoteOnly', 'followersOnly', 'r9k']) {
          if (msg[k] != null) newState[k] = msg[k]
        }
        this._roomstates.set(ch, newState)
        // Only emit if there were diffs AND we already had a baseline (skip first JOIN dump)
        if (changes.length && Object.keys(prev).length) {
          for (const text of changes) {
            const evt = {
              type: 'notice',
              noticeType: 'mode_change',
              user: 'system',
              text,
              color: '#808080',
              badges: '',
              channel: ch,
              time: Date.now(),
              id: `mode-${ch}-${Date.now()}-${text.slice(0, 16)}`,
              systemMsg: text
            }
            if (this.channels.has(ch)) {
              this.channels.get(ch).push(evt)
              this.persistBuffer(ch)
              this.emit('message', evt)
            }
          }
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

  // Persist buffers to chrome.storage.local (debounced)
  _persistTimers = {}
  _PERSIST_MAX = 200
  _historyInFlight = new Set()

  persistBuffer(ch) {
    if (this._persistTimers[ch]) return
    this._persistTimers[ch] = cleanup.setTimeout(() => {
      try {
        delete this._persistTimers[ch]
        if (!chrome?.runtime?.id) return
        const buffer = this.channels.get(ch)
        if (!buffer) return
        const msgs = buffer.getAll().slice(-this._PERSIST_MAX).map(m => ({
          user: m.user, userId: m.userId, text: m.text, color: m.color,
          badges: m.badges, channel: m.channel, time: m.time, id: m.id,
          isAction: m.isAction || undefined, replyTo: m.replyTo || undefined,
          subMonths: m.subMonths || undefined, twitchEmotes: m.twitchEmotes || undefined,
          type: m.type || undefined, eventClass: m.eventClass || undefined,
          noticeType: m.noticeType || undefined, msgId: m.msgId || undefined,
          subTier: m.subTier || undefined, giftCount: m.giftCount || undefined,
          recipient: m.recipient || undefined, raidViewers: m.raidViewers || undefined,
          raidFrom: m.raidFrom || undefined, systemMsg: m.systemMsg || undefined,
          isFirstMsg: m.isFirstMsg || undefined, isHighlighted: m.isHighlighted || undefined,
          redeemed: m.redeemed || undefined, rewardId: m.rewardId || undefined,
          actor: m.actor || undefined,
          cleared: m.cleared || undefined, clearedReason: m.clearedReason || undefined,
          targetUser: m.targetUser || undefined, targetMsgId: m.targetMsgId || undefined,
          banDuration: m.banDuration || undefined
        }))
        const p = chrome.storage.local.set({ [`hs_irc_${ch}`]: { msgs, ts: Date.now() } })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }, 5000)
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch);
    if (!buffer) return;

    const cacheKey = `hs_chat_history_${ch}`;
    const storageKey = `hs_irc_${ch}`

    // 1. Try chrome.storage.local (own persisted messages — survives refresh reliably)
    try {
      const stored = await chrome.storage.local.get(storageKey)
      const data = stored[storageKey]
      if (data?.msgs?.length > 0 && Date.now() - data.ts < 86400000) {
        // Filter out 7TV emote change system messages that leaked into buffers
        // Normalize + dedup stream events that were saved multiple times
        const seenEventTexts = new Set()
        const filtered = data.msgs.filter(m => {
          const t = m.text || m.systemMsg || ''
          if (t.includes('removed from channel') || t.includes('added to channel') ||
              t.includes('removed 7TV emote') || t.includes('added 7TV emote')) return false
          // Normalize + dedup stream events by text
          // Detect stream events by type OR by text pattern (old persisted events may lack type)
          const isStreamEvent = m.type === 'stream-event' || (m.text && m.text.includes('\u25C6') && !m.user)
          if (isStreamEvent && m.text) {
            // Restore type if missing (old persisted events)
            if (!m.type) m.type = 'stream-event'
            // Normalize old "channel ◆" format to "[channel] ◆"
            if (!m.text.startsWith('[')) {
              const em = m.text.match(/^([a-zA-Z0-9_]+) \u25C6/)
              if (em) m.text = `[${em[1]}]` + m.text.slice(em[1].length)
            }
            if (seenEventTexts.has(m.text)) return false
            seenEventTexts.add(m.text)
          }
          return true
        })
        log('Storage hit:', filtered.length, 'msgs for', ch)
        for (const msg of filtered) {
          msg.isHistory = true
          if (msg.user) {
            usernameCache.add(msg.user)
            setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
          }
          if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths)
          buffer.push(msg)
        }
        if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
          renderMessages(currentTab)
        }
        // Refresh in background (robotty may have newer messages)
        this._fetchHistory(ch, buffer, cacheKey)
        return
      }
    } catch {}

    // 2. Try localStorage cache (robotty data from previous session)
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { messages, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 3600000 && messages?.length > 0) {
          log('Cache hit:', messages.length, 'msgs for', ch);
          for (const msg of messages) {
            if (msg.user) {

              usernameCache.add(msg.user)

              setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)

            }
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

    // 3. No valid cache — fetch synchronously from robotty
    await this._fetchHistory(ch, buffer, cacheKey);
  }

  async _fetchHistory(ch, buffer, cacheKey, attempt = 0) {
    if (attempt === 0) {
      if (this._historyInFlight.has(ch)) return
      this._historyInFlight.add(ch)
    }
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
        if (msg.user) {
          usernameCache.add(msg.user)
          setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
        }
        if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths);
        parsed.push(msg);
      }

      // Merge strategy: on background refresh, only ADD newer messages — never clear
      // On initial load (empty buffer), replace entirely
      const existingAll = buffer.getAll();
      if (existingAll.length === 0) {
        // Initial load — just fill the buffer
        for (const msg of parsed) buffer.push(msg);
        log('Loaded history for', ch, '- parsed:', parsed.length);
      } else {
        // Background refresh — only add messages newer than what we have
        const latestTime = Math.max(...existingAll.map(m => m.time || 0))
        const newer = parsed.filter(m => m.time > latestTime)
        const existingIds = new Set(existingAll.filter(m => m.id).map(m => m.id))
        const dedupedNewer = newer.filter(m => !m.id || !existingIds.has(m.id))
        if (dedupedNewer.length > 0) {
          for (const msg of dedupedNewer) buffer.push(msg)
          log('Background refresh for', ch, '- added', dedupedNewer.length, 'newer messages, total:', buffer.getAll().length)
        } else {
          log('Background refresh for', ch, '- no new messages from robotty')
        }
      }

      // Persist to chrome.storage.local for reliable refresh
      this.persistBuffer(ch);

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
      this._historyInFlight.delete(ch)
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
    this._persistTimers = {}
    this._PERSIST_MAX = 200
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
            user: d.replyTo.username || 'unknown',
            text: d.replyTo.content || '',
            id: d.replyTo.id || d.replyTo.message_id || '',
            threadId: d.replyTo.thread_id || d.replyTo.id || d.replyTo.message_id || ''
          } : null
        }
        this.channels.get(channel).push(msg)
        if (msg.user) {
          usernameCache.add(msg.user)
          setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
        }
        this.persistBuffer(channel)
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
        this.persistBuffer(channel)
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
        this.persistBuffer(channel)
        this.emit('message', msg)
      }
    }
    chrome.runtime?.onMessage?.addListener(this._listener)
    log('Kick chat listener registered (webhook mode)')
  }

  persistBuffer(ch) {
    if (this._persistTimers[ch]) return
    this._persistTimers[ch] = cleanup.setTimeout(() => {
      try {
        delete this._persistTimers[ch]
        if (!chrome?.runtime?.id) return
        const buffer = this.channels.get(ch)
        if (!buffer) return
        const msgs = buffer.getAll().slice(-this._PERSIST_MAX).map(m => ({
          user: m.user, text: m.text, color: m.color, badges: m.badges,
          channel: m.channel, time: m.time, platform: 'kick',
          type: m.type || undefined, systemMsg: m.systemMsg || undefined,
          replyTo: m.replyTo || undefined, kicksEvent: m.kicksEvent || undefined
        }))
        const p = chrome.storage.local.set({ [`hs_kick_${ch}`]: { msgs, ts: Date.now() } })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }, 5000)
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch)
    if (!buffer) return
    const storageKey = `hs_kick_${ch}`
    try {
      const stored = await chrome.storage.local.get(storageKey)
      const data = stored[storageKey]
      if (data?.msgs?.length > 0 && Date.now() - data.ts < 86400000) {
        // Filter out 7TV emote change system messages and dedup stream events
        const seenEventTexts = new Set()
        const filtered = data.msgs.filter(m => {
          const t = m.text || m.systemMsg || ''
          if (t.includes('removed from channel') || t.includes('added to channel') ||
              t.includes('removed 7TV emote') || t.includes('added 7TV emote')) return false
          const isStreamEvent = m.type === 'stream-event' || (m.text && m.text.includes('\u25C6') && !m.user)
          if (isStreamEvent && m.text) {
            if (!m.type) m.type = 'stream-event'
            if (!m.text.startsWith('[')) {
              const em = m.text.match(/^([a-zA-Z0-9_]+) \u25C6/)
              if (em) m.text = `[${em[1]}]` + m.text.slice(em[1].length)
            }
            if (seenEventTexts.has(m.text)) return false
            seenEventTexts.add(m.text)
          }
          return true
        })
        log('Kick storage hit:', filtered.length, 'msgs for', ch, data.msgs.length !== filtered.length ? `(pruned ${data.msgs.length - filtered.length} spam/dupes)` : '')
        for (const msg of filtered) {
          msg.isHistory = true
          if (msg.user) {
            usernameCache.add(msg.user)
            setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
          }
          buffer.push(msg)
        }
        if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
          renderMessages(currentTab)
        }
      }
    } catch {}
  }

  destroy() {
    this._destroyed = true
    if (this._listener) {
      chrome.runtime?.onMessage?.removeListener(this._listener)
      this._listener = null
    }
    for (const id of Object.values(this._persistTimers)) cleanup.clearTimeout(id);
    this._persistTimers = {};
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
    // Load persisted history before joining (so messages appear instantly)
    await this.loadHistory(kickUsername)
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
  if (authState.keepaliveTimer) { cleanup.clearInterval(authState.keepaliveTimer); authState.keepaliveTimer = null; }
  if (authState.reconnectTimer) { cleanup.clearTimeout(authState.reconnectTimer); authState.reconnectTimer = null; }
  const prevJoined = [...authState.joined];
  if (authState.ws) {
    authState.ws.onopen = null;
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
    // Whispers arrive via IRC WHISPER with twitch.tv/commands cap (same as Chatterino)
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
  authState.reconnectTimer = cleanup.setTimeout(async () => {
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
    // Release handshake closures (timeout/resolve/reject) before reassigning
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
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

async function sendIrcMessage(channel, text, token, replyParentId, overrideNick) {
  const nick = overrideNick || currentUsername || getCurrentUsername();
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
const KICK_CHANNEL_ID_CACHE_MAX = 200

async function resolveKickChannelId(slug) {
  if (kickChannelIdCache.has(slug)) return kickChannelIdCache.get(slug)
  const resp = await safeSendMessage({ type: 'kick_resolve_channel', slug })
  if (resp?.channelId) {
    if (kickChannelIdCache.size >= KICK_CHANNEL_ID_CACHE_MAX) {
      kickChannelIdCache.delete(kickChannelIdCache.keys().next().value)
    }
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
  const WS_RE = /^\s+$/
  const LINK_RE = /^(https?:\/\/\S+|[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*)/i

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
  const SECTION_ORDER = ['7tv', 'bttv', 'ffz', 'twitch', 'kick', 'heatsync']
  const SECTION_LABELS = {
    '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ',
    twitch: 'Twitch', kick: 'Kick', heatsync: 'Heatsync'
  }

  function groupEmotes(allEmotes) {
    const groups = {}
    for (const [name, emote] of allEmotes) {
      const key = emote.source
      if (!groups[key]) groups[key] = []
      groups[key].push([name, emote])
    }
    return SECTION_ORDER
      .filter(k => groups[k]?.length)
      .map(k => ({ key: k, label: SECTION_LABELS[k] || k, emotes: groups[k] }))
  }

  function renderEmoteSections(sections, emptyMsg = t('mc_emote_no_loaded')) {
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
  if (typeof mcSignal !== 'undefined') {
    mcSignal.addEventListener('abort', () => {
      if (_chunkedRafId) { cancelAnimationFrame(_chunkedRafId); _chunkedRafId = null }
    })
  }

  function emoteImgHtml([name, emote]) {
    const state = emote.state || 'global'
    return `<img src="${escapeHtml(emote.url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)} (${escapeHtml(emote.source)})" class="hs-mc-picker-emote hs-emote-${escapeHtml(emote.source)}" data-name="${escapeHtml(name)}" data-source="${escapeHtml(emote.source)}" data-state="${escapeHtml(state)}" loading="lazy">`
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
            <input type="text" id="hs-mc-emote-search" placeholder="${t('mc_emote_search_placeholder')}" autocomplete="off">
          </div>
        </div>
        <div class="hs-mc-picker-scroll" id="hs-mc-emote-grid">
          ${renderEmoteSections(sections)}
        </div>
      </div>
      <div class="hs-mc-tab-content" id="hs-mc-tab-twitch" style="display: ${pickerTab === 'twitch' ? 'flex' : 'none'}; flex-direction: column; padding: 8px 0;">
        <div class="hs-mc-pred-loading">${t('common_loading')}</div>
      </div>
      <div class="hs-mc-picker-tabs">
        <button class="hs-mc-picker-tab ${pickerTab === 'emotes' ? 'active' : ''}" data-tab="emotes">emotes</button>
        <button class="hs-mc-picker-tab ${pickerTab === 'twitch' ? 'active' : ''}" data-tab="twitch">${hostPlatform === 'kick' ? 'kick' : hostPlatform === 'yt' ? 'youtube' : 'twitch'}</button>
      </div>
    `;

    // Chunked render remaining emotes after initial paint
    const grid = document.getElementById('hs-mc-emote-grid');
    if (grid) chunkedRenderRemaining(sections, grid);

    // Search functionality (debounced)
    let _searchTimer = null;
    const searchInput = document.getElementById('hs-mc-emote-search');
    searchInput?.addEventListener('input', (e) => {
      cleanup.clearTimeout(_searchTimer);
      _searchTimer = cleanup.setTimeout(() => {
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
        grid.innerHTML = renderEmoteSections(filteredSections, t('common_no_matches'));
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
    cleanup.setTimeout(() => {
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
      cleanup.addEventListener(document, 'click', _pickerCloseHandler, 'mc-picker-close');
    }, 0);
  }

  /** Adjust overlay bottom to make room for picker panel */
  function adjustOverlayForPicker(open) {
    const overlay = document.getElementById('hs-mc-overlay');
    if (!overlay) return;
    // For vertical tabs (left/right), CSS handles overlay positioning — don't override
    if (tabPosition === 'left' || tabPosition === 'right') return;
    const hasBottomTabs = tabPosition === 'bottom';
    // Always reserve input bar space to prevent layout shift when it shows/hides
    const barBase = hasBottomTabs ? 90 : 52;
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

  // Diff-apply blocked changes from storage WITHOUT re-rendering the whole tab.
  // The full-rerender path in the storage onChanged listener was the source of
  // the right-click flicker (only at scroll-bottom, since renderMessages was
  // gated on !isScrolledUp) and could revert a fresh optimistic toggle if
  // storage hadn't caught up yet. This applies only the actual hash deltas.
  function applyBlockedHashDelta(newHashesArr) {
    const newSet = new Set(newHashesArr || []);
    const toBlock = [];
    for (const h of newSet) if (!blockedEmoteHashes.has(h)) toBlock.push(h);
    const toUnblock = [];
    for (const h of blockedEmoteHashes) if (!newSet.has(h)) toUnblock.push(h);
    if (toBlock.length === 0 && toUnblock.length === 0) return;

    for (const hash of toBlock) {
      const name = hashToName.get(hash);
      blockedEmoteHashes.add(hash);
      if (!name) continue;
      blockedEmoteNames.add(name);
      queryEmoteWrappers(name).forEach(w => {
        if (w.classList.contains('hs-state-blocked')) return;
        w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded', 'hs-emote-highlight');
        w.classList.add('hs-state-blocked');
        w.dataset.state = 'blocked';
        const img = w.querySelector('img');
        if (img) {
          img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded');
          img.classList.add('hs-emote-blocked');
          img.dataset.state = 'blocked';
        }
      });
    }

    for (const hash of toUnblock) {
      const name = hashToName.get(hash);
      blockedEmoteHashes.delete(hash);
      if (!name) continue;
      blockedEmoteNames.delete(name);
      const emote = lookupEmote(name);
      const realUrl = emote?.url || '';
      const newState = emote ? getEmoteState(name, emote.source) : 'global';
      queryEmoteWrappers(name).forEach(w => {
        if (w.classList.contains(`hs-state-${newState}`)) return;
        w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded', 'hs-emote-highlight');
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
    pendingEmoteOps.add(emoteName);
    try { await _removeEmoteFromInventory(emoteName, targetEl) }
    finally { pendingEmoteOps.delete(emoteName) }
  }
  async function _removeEmoteFromInventory(emoteName, targetEl) {
    // Try inventoryHashes first, then wrapper's data-emote-hash, then emoteHashes, then lookup
    const wrapper = targetEl?.closest?.('.hs-mc-emote-wrapper') || targetEl;
    const emoteHash = inventoryHashes.get(emoteName)
      || wrapper?.dataset?.emoteHash
      || emoteHashes.get(emoteName)
      || lookupEmote(emoteName)?.hash
      || emoteName;
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'remove_from_inventory',
          emoteHash,
          emoteName
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
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
      const isThirdParty = ['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(cachedEmote.source);
      if (isThirdParty) {
        cachedEmote.state = 'global';
      } else {
        // HeatSync emote — mark unadded then remove from cache so it stops rendering in new messages
        cachedEmote.state = 'unadded';
        emoteCache.delete(emoteName);
        for (const cache of Object.values(channelEmoteCaches)) {
          cache.delete(emoteName);
        }
      }
    } else {
      // Not found via lookupEmote but might still be in caches
      emoteCache.delete(emoteName);
      for (const cache of Object.values(channelEmoteCaches)) {
        cache.delete(emoteName);
      }
    }
    // Update all existing wrappers in DOM
    const newState = cachedEmote?.state || 'unadded';
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
    });
    // Refresh tooltip if visible (state text needs to update instantly)
    refreshEmoteTooltip(emoteName, newState);
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

    // Blocking and owning are mutually exclusive
    inventoryEmotes.delete(emoteName);
    inventoryHashes.delete(emoteName);

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
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded', 'hs-emote-highlight');
      w.classList.add('hs-state-blocked');
      w.dataset.state = 'blocked';
      const img = w.querySelector('img');
      if (img) {
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded');
        img.classList.add('hs-emote-blocked');
        img.dataset.state = 'blocked';
      }
    });

    refreshEmoteTooltip(emoteName, 'blocked');
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
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded', 'hs-emote-highlight');
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

    refreshEmoteTooltip(emoteName, newState);
    showToast(`unblocked: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-unblock');
  }

  // Add emote to inventory (click-to-add for unadded emotes)
  async function addEmoteToInventory(emoteName, emoteUrl, emoteSource, targetEl) {
    if (!emoteName) return;
    pendingEmoteOps.add(emoteName);
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
        // Adding and blocking are mutually exclusive
        blockedEmoteNames.delete(emoteName);
        const serverHash = response.hash || emoteHash;
        inventoryEmotes.add(emoteName);
        inventoryHashes.set(emoteName, serverHash);
        if (emoteCache.has(emoteName)) {
          const cached = emoteCache.get(emoteName);
          cached.state = 'owned';
          if (!cached.hash) cached.hash = serverHash;
        } else {
          emoteCache.set(emoteName, { url: emoteUrl, source: emoteSource || 'heatsync', state: 'owned', hash: serverHash });
          while (emoteCache.size > 2000) { emoteCache.delete(emoteCache.keys().next().value) }
        }
        // Update hash lookup maps (bounded to emoteCache size)
        emoteHashes.set(emoteName, serverHash);
        hashToName.set(serverHash, emoteName);
        while (emoteHashes.size > 2000) { emoteHashes.delete(emoteHashes.keys().next().value) }
        while (hashToName.size > 2000) { hashToName.delete(hashToName.keys().next().value) }

        // Update all wrappers in DOM (no full re-render)
        queryEmoteWrappers(emoteName).forEach(w => {
          w.classList.remove('hs-state-global', 'hs-state-unadded', 'hs-state-blocked');
          w.classList.add('hs-state-owned');
          w.dataset.state = 'owned';
        });

        refreshEmoteTooltip(emoteName, 'owned');
        showToast(`added: ${emoteName}`);
        flashAllEmotes(emoteName, 'hs-flash-add');
      } else {
        showToast(response?.error || `failed to add: ${emoteName}`);
      }
    } catch (e) {
      log('Add emote error:', e);
      showToast(`error adding: ${emoteName}`);
    } finally {
      pendingEmoteOps.delete(emoteName);
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
      }).catch(() => {});
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
          while (emoteCache.size > 2000) { emoteCache.delete(emoteCache.keys().next().value) }
          if (e.hash) registerHash(e.name, e.hash);
        }
      });

      // Add inventory emotes (definitely owned)
      (stored.emote_inventory || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || 'heatsync';
          emoteCache.set(e.name, { url: e.url, source, state: 'owned', zeroWidth: !!e.zeroWidth });
          while (emoteCache.size > 2000) { emoteCache.delete(emoteCache.keys().next().value) }
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
            // Channel cache → state 'channel' (unless user owns it in their heatsync inventory)
            const state = inventoryEmotes.has(e.name) ? 'owned' : 'channel';
            chCache.set(e.name, { url: e.url, source, state, zeroWidth: !!e.zeroWidth });
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

      // Native Twitch emotes — sub emotes carry e.owner (broadcaster login),
      // true Twitch globals do not. Distinguish so tooltips show "(broadcaster) sub" vs "global (Twitch)".
      (stored.native_twitch_emotes || []).forEach(e => {
        if (e.name && e.url && !emoteCache.has(e.name)) {
          const isSub = !!e.owner
          const entry = {
            url: e.url,
            source: 'twitch',
            state: isSub ? 'sub' : 'global'
          }
          if (isSub) {
            entry.owner = e.owner
            entry.ownerDisplay = e.ownerDisplay || e.owner
            if (e.tier) entry.tier = e.tier
          }
          emoteCache.set(e.name, entry);
          while (emoteCache.size > 2000) { emoteCache.delete(emoteCache.keys().next().value) }
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
        cache.set(name, { url, source, state: getEmoteState(name, source), zeroWidth: false });
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
  // extraCache: optional Map<name, emoteData> for per-message Twitch native
  // emotes (so they participate in the overlay stack pipeline)
  function processEmotes(text, channel, extraCache) {
    if (emoteCache.size === 0 && !channelEmoteCaches[channel] && !extraCache?.size) return text;

    // Split adjacent Kick emotes and text touching emotes (e.g. "word[emote:id:name]")
    // Also split unicode emoji from adjacent non-emoji chars so `🌆<3` becomes
    // `🌆` (rendered big) + `<3` (text). Preserves multi-codepoint emoji sequences:
    // skin tone modifiers, ZWJ joins, and VS16 variation selectors stay intact.
    const words = text
      .replace(/\]\[emote:/g, '] [emote:')
      .replace(/([^\s\[])\[emote:/g, '$1 [emote:')
      .replace(/\]([^\s\]])/g, '] $1')
      .replace(/([\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F])(?=[^\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D])/gu, '$1 ')
      .replace(/([^\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D])(?=\p{Extended_Pictographic})/gu, '$1 ')
      .split(/(\s+)/);
    const result = [];
    let pendingStack = null; // { base: html, overlays: [html...] }
    let pendingWhitespace = ''; // Accumulate whitespace - don't flush stack on spaces

    for (const word of words) {
      // Whitespace - accumulate, don't flush yet (overlays are space-separated)
      if (WS_RE.test(word)) {
        pendingWhitespace += word;
        continue;
      }

      // Kick emote format: [emote:ID:NAME] -> render as image from Kick CDN
      const kickEmoteMatch = word.match(/^\[emote:(\d+):([^\]]+)\]$/)
      if (kickEmoteMatch) {
        const [, emoteId, emoteName] = kickEmoteMatch
        const kickUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`
        const safeKickUrl = escapeHtml(kickUrl)
        const safeName = escapeHtml(emoteName)
        // Cross-reference caches to find real provider (7tv/bttv/ffz), fall back to kick
        const cached = emoteCache.get(emoteName) || (channel && channelEmoteCaches[channel]?.get(emoteName))
        const provider = cached?.source || 'kick'
        const imgHtml = `<span class="hs-mc-emote-wrapper hs-state-channel" data-emote-name="${safeName}" data-emote-url="${safeKickUrl}" data-state="channel" data-source="${escapeHtml(provider)}"><img src="${safeKickUrl}" alt="${safeName}" title="${safeName} (${escapeHtml(provider)} via kick)" class="hs-mc-emote hs-emote-channel" data-emote-name="${safeName}" data-state="channel" data-source="${escapeHtml(provider)}"></span>`
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
        emote = emoteCache.get(baseName) || (channel && channelEmoteCaches[channel]?.get(baseName)) || extraCache?.get(baseName)
        if (emote) isOverlayEmote = true
      }
      if (!emote) {
        emote = emoteCache.get(word) || (channel && channelEmoteCaches[channel]?.get(word)) || extraCache?.get(word)
        // Honor zero-width flag, OR fall back to the "name0" naming convention
        // when an uploader didn't set the flag despite naming the emote for overlay use.
        if (emote) isOverlayEmote = !!emote.zeroWidth || endsWithZero
      }
      if (emote) {
        const isBlocked = blockedEmoteNames.has(word);
        const state = isBlocked ? 'blocked' : (emote.state || 'global');
        const source = escapeHtml(emote.source || 'unknown');
        const imgSrc = escapeHtml(getChatResUrl(emote.url)); // Upgrade to 2x/4x based on emote size setting
        const safeHash = emote.hash ? escapeHtml(emote.hash) : '';
        const displayName = escapeHtml(word)
        const ownerAttr = emote.ownerDisplay ? ` data-owner="${escapeHtml(emote.ownerDisplay)}"` : ''
        const imgHtml = `<span class="hs-mc-emote-wrapper hs-state-${state}" data-emote-name="${displayName}" data-emote-url="${imgSrc}" data-state="${state}" data-source="${source}"${ownerAttr}${safeHash ? ` data-emote-hash="${safeHash}"` : ''}><img src="${imgSrc}" alt="${displayName}" title="${displayName}" class="hs-mc-emote hs-emote-${state}" data-emote-name="${displayName}" data-state="${state}" data-source="${source}"${ownerAttr}></span>`;

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
          const color = knownColors.get(name) || '#fff';
          result.push(`<a href="https://heatsync.org/user/${encodeURIComponent(name)}" target="_blank" class="hs-mc-user" data-username="${name}" style="color:${sanitizeColor(color)};font-weight:bold">${word}</a>`);
        } else if (linksEnabled && LINK_RE.test(word)) {
          // Validate URL protocol before creating link (block javascript:, data:, etc.)
          const hasProtocol = /^https?:\/\//i.test(word);
          const fullUrl = hasProtocol ? word : `https://${word}`;
          if (/^https?:\/\//i.test(fullUrl)) {
            result.push(`<a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" class="hs-mc-link">${escapeHtml(word)}</a>`);
          } else {
            result.push(escapeHtml(word));
          }
        } else {
          result.push(word);
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

  // Badge hover tooltip (4x preview with name)
  let badgeTooltip = null

  function ensureBadgeTooltip() {
    if (!badgeTooltip || !document.contains(badgeTooltip)) {
      badgeTooltip = document.createElement('div')
      badgeTooltip.id = 'hs-badge-tooltip'
      const img = document.createElement('img')
      const name = document.createElement('span')
      name.className = 'tooltip-name'
      const source = document.createElement('span')
      source.className = 'tooltip-source'
      badgeTooltip.appendChild(img)
      badgeTooltip.appendChild(name)
      badgeTooltip.appendChild(source)
      document.body.appendChild(badgeTooltip)
    }
    return badgeTooltip
  }

  function showBadgeTooltip(badgeImg, badgeName) {
    const tooltip = ensureBadgeTooltip()
    const img = tooltip.querySelector('img')
    img.src = badgeImg.src
    img.alt = badgeName
    img.style.width = '72px'
    img.style.height = '72px'
    tooltip.querySelector('.tooltip-name').textContent = badgeName
    // Detect source from URL
    const src = badgeImg.src
    const sourceLabel = src.includes('betterttv') ? 'BTTV'
      : src.includes('frankerfacez') ? 'FFZ'
      : src.includes('7tv') ? '7TV'
      : src.includes('jtvnw.net') ? 'Twitch'
      : src.includes('kick') ? 'Kick'
      : (src.includes('googleusercontent') || src.includes('ggpht')) ? 'YouTube'
      : ''
    const sourceEl = tooltip.querySelector('.tooltip-source')
    sourceEl.textContent = sourceLabel
    sourceEl.className = 'tooltip-source'

    tooltip.style.left = '-9999px'
    tooltip.style.top = '-9999px'
    tooltip.classList.add('visible')
    positionTooltipAtElement(tooltip, badgeImg)
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, badgeImg))
  }

  function hideBadgeTooltip() {
    if (badgeTooltip) badgeTooltip.classList.remove('visible')
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

  function showEmoteTooltip(e, emoteName, emoteUrl, state, source, hoveredImg, owner) {
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
      label = t('mc_emote_in_set');
    } else if (state === 'unadded') {
      label = t('mc_emote_click_add');
    } else if (state === 'blocked') {
      label = t('mc_emote_blocked');
    } else {
      // Global / channel / sub - show source with appropriate scope
      const sourceLabels = {
        '7tv': '7TV',
        'bttv': 'BTTV',
        'ffz': 'FFZ',
        'twitch': 'Twitch',
        'kick': 'Kick',
        'heatsync': 'Heatsync'
      };
      const sourceName = sourceLabels[source] || source || 'unknown';
      if (state === 'sub') {
        // Twitch sub emote — show broadcaster as scope so it's specific
        label = owner ? `${owner} sub (${sourceName})` : sourceName;
      } else {
        label = sourceName;
      }
    }
    stateEl.textContent = label;
    const srcClass = (state === 'global' || state === 'channel' || state === 'sub') && source ? ' src-' + source.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
    stateEl.className = 'tooltip-source ' + (state || 'global') + srcClass;

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

    stateEl.textContent = t('mc_tip_emoji')
    stateEl.className = 'tooltip-source'

    tooltip.style.left = '-9999px'
    tooltip.style.top = '-9999px'
    tooltip.classList.add('visible')
    positionTooltipAtElement(tooltip, targetEl)
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, targetEl))
  }

  // Refresh tooltip text/color if it's currently showing the given emote
  function refreshEmoteTooltip(emoteName, newState) {
    if (!emoteTooltip || !emoteTooltip.classList.contains('visible')) return;
    const nameEl = emoteTooltip.querySelector('.tooltip-name');
    if (nameEl?.textContent !== emoteName) return;
    const stateEl = emoteTooltip.querySelector('.tooltip-source');
    if (!stateEl) return;
    const labels = { owned: t('mc_emote_in_set'), unadded: t('mc_emote_click_add'), blocked: t('mc_emote_blocked') };
    stateEl.textContent = labels[newState] || newState;
    stateEl.className = 'tooltip-source ' + (newState || 'global');
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

      // Badge hover: show 4x preview with name
      const badgeImg = target.tagName === 'IMG' && target.classList.contains('hs-mc-badge-img') ? target : null
      if (badgeImg) {
        const badgeName = badgeImg.title || badgeImg.alt || ''
        if (badgeName) {
          showBadgeTooltip(badgeImg, badgeName)
        }
        return
      }

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
      const owner = wrapper?.dataset.owner || img?.dataset.owner || '';

      showEmoteTooltip(e, emoteName, emoteUrl, state, source, img, owner);

      // Cross-highlight: add highlight to all wrappers with same emote name.
      // For wrappers in collapsed stacks, derive color from the stack's worst
      // state (blocked > unadded > normal) so the same nest always shows the
      // same hover color regardless of which emote inside you happen to land on.
      const stack = wrapper?.closest?.('.hs-mc-emote-stack:not(.expanded)')
      let effectiveState = state
      if (stack) {
        if (stack.querySelector('.hs-mc-emote-wrapper.hs-state-blocked')) effectiveState = 'blocked'
        else if (stack.querySelector('.hs-mc-emote-wrapper.hs-state-unadded')) effectiveState = 'unadded'
        else effectiveState = 'normal'
      }
      const sourceColor = effectiveState === 'blocked' ? '#ff0000'
        : effectiveState === 'unadded' ? '#ff8700'
        : '#00ff00'
      document.body.style.setProperty('--hs-highlight-color', sourceColor)
      queryEmoteWrappers(emoteName).forEach(w => {
        w.classList.add('hs-emote-highlight');
      });
    }, 'mc-emote-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const target = e.target;

      // Badge mouseout
      if (target.tagName === 'IMG' && target.classList.contains('hs-mc-badge-img')) {
        hideBadgeTooltip()
        return
      }

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

    // Hide tooltip+highlight on any scroll (wheel/trackpad/drag — mouseout doesn't fire when elements scroll away)
    let _dismissRafPending = false
    function dismissAllTooltips() {
      if (_dismissRafPending) return
      _dismissRafPending = true
      requestAnimationFrame(() => {
        _dismissRafPending = false
        if (emoteTooltip?.classList.contains('visible')) {
          hideEmoteTooltip()
          document.querySelectorAll('.hs-emote-highlight').forEach(w => w.classList.remove('hs-emote-highlight'))
        }
        hideBadgeTooltip()
        if (linkTooltip?.classList.contains('visible')) hideLinkTooltip()
        if (userTooltip?.classList.contains('visible')) hideUserTooltip()
      })
    }
    cleanup.addEventListener(document, 'wheel', dismissAllTooltips, { passive: true })
    // scroll doesn't bubble — capture phase catches scroll on any child container
    document.addEventListener('scroll', dismissAllTooltips, { capture: true, passive: true, signal: mcSignal })

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
        const onBadge = target?.tagName === 'IMG' && target.classList?.contains('hs-mc-badge-img')

        // Kill badge tooltip if not on a badge
        if (badgeTooltip?.classList.contains('visible') && !onBadge) {
          hideBadgeTooltip()
        }

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
    while (channelMap.size > 500) channelMap.delete(channelMap.keys().next().value)
  }
  function formatSubTenure(months) {
    // Concise: drop months when years resolve. Matches content.js + formatAge.
    if (months >= 12) return `${Math.floor(months / 12)}y`
    return `${months}mo`
  }

  // User hover tooltip (profile preview)
  let userTooltip = null;
  const _profileCache = new Map(); // platform:username -> { profile, ts }
  const PROFILE_CACHE_TTL = 60000; // 60s
  let _profileGen = 0; // generation counter to prevent stale renders

  // Centralized cross-platform identity resolver. ALL identity lookups should go
  // through this. Wraps _profileCache + /api/profile, returns a unified shape.
  // Used by: pcAddAsChannel, renderAddChannelForm autofill, auto-multichat banner,
  // any future awareness feature.
  function shapeIdentity(profile) {
    if (!profile) return { ok: false };
    const identity = {
      heatsync: profile.username || null,
      twitch: profile.twitch_username || null,
      kick: profile.kick_username || null,
      youtube: profile.youtube_username || profile.youtube_channel_id || null,
    };
    const linked = [identity.twitch, identity.kick, identity.youtube].filter(Boolean);
    const liveOn = [];
    if (profile.twitch_is_live) liveOn.push('twitch');
    if (profile.kick_is_live) liveOn.push('kick');
    return {
      ok: true,
      profile,
      identity,
      linkedCount: linked.length,
      isLinked: linked.length >= 2,
      liveOn,
    };
  }

  async function resolveIdentity(name, opts = {}) {
    if (!name) return { ok: false, error: 'no name' };
    const platform = opts.platform || null;
    const cacheKey = `${platform || 'unknown'}:${String(name).toLowerCase()}`;
    if (!opts.bust) {
      const cached = _profileCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
        return shapeIdentity(cached.profile);
      }
    }
    try {
      const platParam = platform ? `?platform=${encodeURIComponent(platform)}` : '';
      const resp = await apiFetch(`/api/profile/${encodeURIComponent(name)}${platParam}`);
      if (!resp?.ok || !resp.data?.profile) {
        return { ok: false, error: resp?.error || 'not found', notFound: true };
      }
      const profile = resp.data.profile;
      _profileCache.set(cacheKey, { profile, ts: Date.now() });
      if (_profileCache.size > 100) {
        const oldest = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) _profileCache.delete(k);
      }
      return shapeIdentity(profile);
    } catch (e) {
      return { ok: false, error: e.message || 'fetch failed' };
    }
  }

  let _userTooltipTarget = null;
  let _userTooltipResizeObs = null;

  function ensureUserTooltip() {
    if (!userTooltip || !document.contains(userTooltip)) {
      userTooltip = document.createElement('div');
      userTooltip.id = 'hs-user-tooltip';
      document.body.appendChild(userTooltip);
      // Keep tooltip away from the hovered username even as content fills in async
      // (followage badge, sub tenure badge, lazy-loaded data — all change height)
      if (typeof ResizeObserver !== 'undefined') {
        _userTooltipResizeObs = new ResizeObserver(() => {
          if (_userTooltipTarget && userTooltip.classList.contains('visible') && document.contains(_userTooltipTarget)) {
            positionTooltipAtElement(userTooltip, _userTooltipTarget);
          }
        });
        cleanup.trackObserver(_userTooltipResizeObs);
        _userTooltipResizeObs.observe(userTooltip);
      }
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
    if (isNaN(d.getTime())) return null;
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
        const vc = Number(p.twitch_viewer_count) || 0;
        ttv += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + escapeHtml(formatCompact(vc)) : ''}</span>`;
      }
      platforms += ttv;
    }
    if (p.kick_username) {
      let kk = `<span class="hs-pc-platform kick">kick:${escapeHtml(p.kick_username)}</span>`;
      if (p.kick_verified) kk += ' <span class="hs-pc-verified" title="Kick Verified"><svg viewBox="0 0 16 16" fill="none" width="12" height="12" style="vertical-align:middle"><path d="M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z" fill="#53fc18"/><path d="M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z" fill="#000"/></svg></span>';
      if (p.kick_is_live) {
        const vc = Number(p.kick_viewer_count) || 0;
        kk += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + escapeHtml(formatCompact(vc)) : ''}</span>`;
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

    // Bio with @mention/#tag autolinks
    const bioHtml = p.bio ? String(p.bio).split(/(@[A-Za-z0-9_]{3,25}|#[A-Za-z0-9]{1,30})/g).map(s => {
      if (!s) return '';
      if (s[0] === '@' && s.length >= 4) return `<span class="hs-mc-user hs-pc-bio-mention" data-username="${escapeHtml(s.slice(1))}">@${escapeHtml(s.slice(1))}</span>`;
      if (s[0] === '#' && s.length >= 2) return `<a class="hs-pc-bio-tag" href="https://heatsync.org/tags/${encodeURIComponent(s.slice(1).toLowerCase())}" target="_blank" rel="noopener noreferrer">#${escapeHtml(s.slice(1))}</a>`;
      return escapeHtml(s);
    }).join('') : '';
    const bio = bioHtml ? `<div class="hs-pc-bio">${bioHtml}</div>` : '';

    // Stats
    const stats = p.stats || {};
    const heat = stats.total_heat || 0;
    const op = stats.op_count || p.opCount || 0;
    const mop = stats.mop_count || p.mopCount || 0;
    const re = stats.re_count || p.reCount || 0;
    const followers = Math.max(stats.followers || 0, p.twitch_followers || 0, p.kick_followers || 0);

    const statBadges = [];
    // Heat renders as the canonical bare glowing number (matches feed / discover / profile card)
    // — no badge wrapper, no hardcoded bg/border. Other stats below stay as pill badges.
    const heatHtml = heatSpanHtml(heat);
    if (heatHtml) statBadges.push(heatHtml);
    if (op > 0) statBadges.push(`<span class="hs-pc-stat op"><span class="hs-pc-num">${formatCompact(op)}</span> [OP]</span>`);
    if (mop > 0) statBadges.push(`<span class="hs-pc-stat mop"><span class="hs-pc-num">${formatCompact(mop)}</span> <span style="color:#ff00ff">[OP]</span></span>`);
    if (re > 0) statBadges.push(`<span class="hs-pc-stat re"><span class="hs-pc-num">${formatCompact(re)}</span> [RE]</span>`);
    if (followers > 0) statBadges.push(`<span class="hs-pc-stat hs-pc-stat-followers">${t('mc_tip_followers', [formatCompact(followers)])}</span>`);

    // Relationship — covers all four angles across Twitch and Kick
    const rel = p.relationship || {};
    const relBadges = [];
    // They → you (follow)
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick || rel.followsYou;
    if (followsYou) {
      const since = rel.profileFollowsViewerOnTwitchSince || rel.profileFollowsViewerOnKickSince || rel.followsYouSince;
      relBadges.push(`<span class="hs-pc-rel-badge mutual">follows you${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    // They → you (sub) — with tier
    const subsYou = rel.profileSubbedToViewerOnTwitch || rel.profileSubbedToViewerOnKick || rel.subscribesToYou;
    if (subsYou) {
      const since = rel.profileTwitchSubSince || rel.profileKickSubSince || rel.subscribesToYouSince;
      const rawTier = rel.profileTwitchSubTier || rel.profileKickSubTier || rel.subscribesToYouTier;
      const tierNum = typeof rawTier === 'string' ? Math.round(Number(rawTier) / 1000) : rawTier;
      const tierStr = tierNum && tierNum > 1 ? ' T' + tierNum : '';
      relBadges.push(`<span class="hs-pc-rel-badge supporter">subs to you${tierStr}${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    // You → them (follow) — ?? respects explicit false from canonical youFollow
    const youFollow = rel.youFollow ?? rel.isFollowing ?? rel.followsOnTwitch ?? rel.followsOnKick;
    if (youFollow) {
      const since = rel.youFollowSince || rel.followsOnTwitchSince || rel.followsOnKickSince || rel.followedAt;
      relBadges.push(`<span class="hs-pc-rel-badge following">following${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    // You → them (sub) — normalize tier
    const youSub = rel.youSub ?? rel.isSubscribed ?? rel.subscribedOnTwitch ?? rel.subscribedOnKick;
    if (youSub) {
      const rawTier = rel.twitchSubTier || rel.kickSubTier || rel.subTier;
      const tierNum = typeof rawTier === 'string' ? Math.round(Number(rawTier) / 1000) : rawTier;
      const tier = tierNum || 1;
      const since = rel.twitchSubSince || rel.kickSubSince || rel.subscribedAt;
      relBadges.push(`<span class="hs-pc-rel-badge subbed">you sub${tier > 1 ? ' T' + tier : ''}${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    // Mutual indicators when both directions present
    if (followsYou && youFollow) {
      relBadges.push(`<span class="hs-pc-rel-badge mutual-follow">mutual</span>`);
    }
    if (subsYou && youSub) {
      relBadges.push(`<span class="hs-pc-rel-badge mutual-sub">mutual sub</span>`);
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
  // userPlatform: the platform of the user being looked up (from data-platform)
  function getTooltipChannelContext(userPlatform) {
    // If looking up a Twitch user, always resolve to the Twitch channel name
    const wantTwitch = !userPlatform || userPlatform === 'twitch'
    // Live tab → current channel from URL or override
    if (currentTab === 'live') {
      if (wantTwitch && location.hostname.includes('kick.com')) {
        // On Kick live tab but need Twitch channel — find from config
        const liveCh = getLiveChannel()
        const ch = config.channels.find(c => {
          if (typeof c === 'string') return c === liveCh
          return c.kick === liveCh || c.id === liveCh
        })
        if (ch && typeof ch !== 'string' && ch.twitch) return ch.twitch
      }
      return getLiveChannel()
    }
    // Channel tab → look up from config
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
    if (ch) {
      if (typeof ch === 'string') return ch
      // For Twitch users, always return Twitch channel; for Kick users, Kick channel
      if (wantTwitch) return ch.twitch || ch.kick
      return ch.kick || ch.twitch
    }
    return getLiveChannel()
  }

  // NOTE: innerHTML usage is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
  // (escapeHtml converts &, <, >, ", ' to HTML entities before any innerHTML assignment)
  async function showUserTooltip(targetEl, username, color, platform) {
    const tooltip = ensureUserTooltip();
    const gen = ++_profileGen;
    _userTooltipTarget = targetEl;

    // Get channel from the message element for sub tenure lookup
    const msgChannel = targetEl.closest?.('.hs-mc-msg')?.dataset?.msgChannel

    // Show loading state immediately (username is escaped via escapeHtml)
    tooltip.innerHTML = `<div class="hs-pc-loading" style="color:${color || '#fff'}">${escapeHtml(username)}...</div>`;
    tooltip.classList.add('visible');
    positionTooltipAtElement(tooltip, targetEl);

    // Check cache (keyed by platform:username to avoid cross-platform collisions)
    const cacheKey = `${platform || 'unknown'}:${username.toLowerCase()}`
    const cached = _profileCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
      if (gen !== _profileGen) return;
      // NOTE: innerHTML is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
      tooltip.innerHTML = renderProfileCard(cached.profile);
      appendSubTenureBadge(tooltip, username, msgChannel);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen, platform);
      return;
    }

    // Fetch profile — pass platform so server can disambiguate same-name users across platforms
    const platParam = platform ? `?platform=${encodeURIComponent(platform)}` : ''
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}${platParam}`);
    if (gen !== _profileGen) return; // user moved away

    if (resp?.ok && resp.data?.profile) {
      const profile = resp.data.profile;
      _profileCache.set(cacheKey, { profile, ts: Date.now() });
      // Prune cache
      if (_profileCache.size > 100) {
        const oldest = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) _profileCache.delete(k);
      }
      // NOTE: innerHTML is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
      tooltip.innerHTML = renderProfileCard(profile);
      appendSubTenureBadge(tooltip, username, msgChannel);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen, platform);
    } else {
      // Fallback — show basic info (username sanitized via escapeHtml)
      tooltip.innerHTML = `<div class="hs-pc-info"><div class="hs-pc-header"><span class="hs-pc-name">${escapeHtml(username)}</span></div></div>`;
      appendSubTenureBadge(tooltip, username, msgChannel);
      fetchAndShowFollowage(tooltip, username, gen, platform);
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
    badge.textContent = t('mc_tip_subbed', [channelLogin, formatSubTenure(months)])
    header.appendChild(badge)
  }

  // Async followage fetch — appends to tooltip after profile renders (DOM methods, no innerHTML)
  async function fetchAndShowFollowage(tooltip, username, gen, userPlatform) {
    // Only show followage for Twitch users (followage API is Twitch-only)
    if (userPlatform && userPlatform !== 'twitch') return
    const channelLogin = getTooltipChannelContext(userPlatform)
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
      badge.textContent = t('mc_tip_following', [channelLogin, getCompactRelTime(result.followedAt).replace(' ago', '')])
    } else {
      badge.className = 'hs-pc-followage hs-pc-nofollow'
      badge.textContent = t('mc_tip_not_following', [channelLogin])
    }
    header.appendChild(badge)
    // "followed by {channel}" badge — streamer follows this user
    if (result.channelFollowedAt) {
      const cfBadge = document.createElement('span')
      cfBadge.className = 'hs-pc-channel-follows'
      cfBadge.textContent = t('mc_tip_followed_by', [channelLogin])
      header.appendChild(cfBadge)
    }
    // Update follower count from live data
    const statsEl = tooltip.querySelector('.hs-pc-stats')
    if (statsEl && result.followerCount != null) {
      // Update followers with live data
      const followerStat = statsEl.querySelector('.hs-pc-stat-followers')
      if (followerStat) {
        followerStat.textContent = t('mc_tip_followers', [formatCompact(result.followerCount)])
      } else {
        const el = document.createElement('span')
        el.className = 'hs-pc-stat hs-pc-stat-followers'
        el.textContent = t('mc_tip_followers', [formatCompact(result.followerCount)])
        statsEl.appendChild(el)
      }
    }
  }

  function positionTooltipAtElement(tooltip, targetEl) {
    const elRect = targetEl.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;       // visible separation so the hovered username is never touched
    const margin = 5;    // viewport edge margin

    const spaceTop = elRect.top - margin;
    const spaceBottom = vh - elRect.bottom - margin;
    const spaceLeft = elRect.left - margin;
    const spaceRight = vw - elRect.right - margin;
    const needV = tipRect.height + gap;
    const needH = tipRect.width + gap;

    let x, y, side;
    if (spaceTop >= needV) {
      side = 'top';
      y = elRect.top - tipRect.height - gap;
      x = elRect.left + elRect.width / 2 - tipRect.width / 2;
    } else if (spaceBottom >= needV) {
      side = 'bottom';
      y = elRect.bottom + gap;
      x = elRect.left + elRect.width / 2 - tipRect.width / 2;
    } else if (spaceRight >= needH) {
      side = 'right';
      x = elRect.right + gap;
      y = elRect.top + elRect.height / 2 - tipRect.height / 2;
    } else if (spaceLeft >= needH) {
      side = 'left';
      x = elRect.left - tipRect.width - gap;
      y = elRect.top + elRect.height / 2 - tipRect.height / 2;
    } else {
      // No side has full room — pick the largest and clamp; still nudge off the element
      const maxV = Math.max(spaceTop, spaceBottom);
      const maxH = Math.max(spaceLeft, spaceRight);
      if (maxV >= maxH) {
        side = spaceTop >= spaceBottom ? 'top' : 'bottom';
        y = side === 'top' ? margin : elRect.bottom + gap;
        x = elRect.left + elRect.width / 2 - tipRect.width / 2;
      } else {
        side = spaceRight >= spaceLeft ? 'right' : 'left';
        x = side === 'right' ? elRect.right + gap : Math.max(margin, elRect.left - tipRect.width - gap);
        y = elRect.top + elRect.height / 2 - tipRect.height / 2;
      }
    }

    // Clamp to viewport — but on the "long" axis only, so we don't push the tip back over the element
    if (side === 'top' || side === 'bottom') {
      x = Math.max(margin, Math.min(x, vw - tipRect.width - margin));
    } else {
      y = Math.max(margin, Math.min(y, vh - tipRect.height - margin));
    }

    tooltip.style.left = Math.round(x) + 'px';
    tooltip.style.top = Math.round(y) + 'px';
  }

  function hideUserTooltip() {
    _profileGen++;
    _userTooltipTarget = null;
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
        const platform = target.dataset.platform || null;
        showUserTooltip(target, username, color, platform);

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
    loadSpan.textContent = t('common_loading');
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
      while (_linkPreviewCache.size > 200) _linkPreviewCache.delete(_linkPreviewCache.keys().next().value);
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

function parsePoints(str) {
  if (!str) return 0
  str = str.trim().toLowerCase()
  const m = str.match(/^(\d+(?:\.\d+)?)\s*(k|m)?$/)
  if (!m) return parseInt(str) || 0
  const num = parseFloat(m[1])
  if (m[2] === 'k') return Math.floor(num * 1000)
  if (m[2] === 'm') return Math.floor(num * 1000000)
  return Math.floor(num)
}

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
  label.textContent = t('mc_chat_username_color')
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
  hexInput.placeholder = t('mc_chat_hex_placeholder')
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
        showToast('color failed: ' + (resp.error || 'color change failed'))
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
  label.textContent = t('mc_chat_modes')
  header.appendChild(label)
  section.appendChild(header)

  const modes = [
    { key: 'emote_mode', label: t('mc_chat_mode_emote_only'), field: 'emote_mode' },
    { key: 'follower_mode', label: t('mc_chat_mode_follower'), field: 'follower_mode' },
    { key: 'slow_mode', label: t('mc_chat_mode_slow'), field: 'slow_mode' },
    { key: 'subscriber_mode', label: t('mc_chat_mode_sub_only'), field: 'subscriber_mode' },
    { key: 'unique_chat_mode', label: t('mc_chat_mode_unique'), field: 'unique_chat_mode' },
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

function outcomeColor(color) {
  const map = { PINK: '#f5009b', BLUE: '#387aff', ORANGE: '#ff8700', GREEN: '#00c853', TEAL: '#00bcd4', PURPLE: '#9c27b0', YELLOW: '#fdd835', LIGHT_BLUE: '#4fc3f7', RED: '#e53935', BROWN: '#795548' }
  return map[color] || '#387aff'
}

function makePointIcon(size, cpImage) {
  if (cpImage) {
    const img = document.createElement('img')
    img.src = cpImage
    img.width = size
    img.height = size
    img.style.verticalAlign = '-2px'
    img.style.borderRadius = '50%'
    return img
  }
  return makeCoinSvg(size)
}

function renderPrediction(pred, balance, channelId, isMod, cpImage, cpName) {
  const frag = document.createDocumentFragment()
  const isLocked = pred.status === 'LOCKED'
  const isResolved = pred.status === 'RESOLVED'
  const isCanceled = pred.status === 'CANCELED'
  const isEnded = isResolved || isCanceled
  if (isEnded) _userBets.delete(pred.id)
  const totalPoints = pred.outcomes.reduce((s, o) => s + (o.totalPoints || 0), 0)
  const createdAt = new Date(pred.createdAt).getTime()
  const windowMs = (pred.predictionWindowSeconds || 120) * 1000
  const endsAt = createdAt + windowMs
  const userBet = _userBets.get(pred.id)
  const winningId = pred.winningOutcome?.id || null

  const wrapper = document.createElement('div')
  wrapper.className = 'hs-mc-prediction' + (isResolved ? ' hs-mc-pred-resolved' : '') + (isCanceled ? ' hs-mc-pred-canceled' : '')
  wrapper.dataset.eventId = pred.id
  if (channelId) wrapper.dataset.channelId = channelId

  // Header
  const header = document.createElement('div')
  header.className = 'hs-mc-pred-header'
  const title = document.createElement('div')
  title.className = 'hs-mc-pred-title'
  // Render emotes/emoji in prediction title — content sanitized via escapeHtml() then processEmotes()
  // This is the same pattern used for all chat messages in main.js (existing safe innerHTML pattern)
  title.innerHTML = typeof processEmotes === 'function' ? processEmotes(escapeHtml(pred.title), null) : escapeHtml(pred.title)
  header.appendChild(title)

  if (isCanceled) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-canceled'
    badge.textContent = t('mc_pred_refunded')
    header.appendChild(badge)
  } else if (isResolved) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-status hs-mc-pred-status-resolved'
    badge.textContent = t('mc_pred_ended')
    header.appendChild(badge)
  } else if (isLocked) {
    const badge = document.createElement('span')
    badge.className = 'hs-mc-pred-locked'
    badge.textContent = t('mc_pred_locked')
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
    bal.appendChild(makePointIcon(14, cpImage))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance) + (cpName ? ' ' + cpName : '')))
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
      banner.appendChild(makePointIcon(18, cpImage))
      const amt = document.createElement('span')
      amt.className = 'hs-mc-pred-result-amount'
      amt.textContent = ' +' + formatPoints(payout)
      banner.appendChild(amt)
      const label = document.createElement('span')
      label.className = 'hs-mc-pred-result-label'
      label.textContent = ' won'
      banner.appendChild(label)
    } else {
      const amt = document.createElement('span')
      amt.className = 'hs-mc-pred-result-amount'
      amt.textContent = '-' + formatPoints(userBet.points)
      banner.appendChild(amt)
      const label = document.createElement('span')
      label.className = 'hs-mc-pred-result-label'
      label.textContent = ' lost'
      banner.appendChild(label)
    }
    wrapper.appendChild(banner)
  } else if (isCanceled && userBet) {
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result hs-mc-pred-result-refund'
    banner.appendChild(makePointIcon(18, cpImage))
    const amt = document.createElement('span')
    amt.className = 'hs-mc-pred-result-amount'
    amt.textContent = ' +' + formatPoints(userBet.points)
    banner.appendChild(amt)
    const label = document.createElement('span')
    label.className = 'hs-mc-pred-result-label'
    label.textContent = ' ' + t('mc_pred_refunded')
    banner.appendChild(label)
    wrapper.appendChild(banner)
  } else if (isResolved && !userBet) {
    const banner = document.createElement('div')
    banner.className = 'hs-mc-pred-result hs-mc-pred-result-neutral'
    const winOutcome = pred.outcomes.find(o => o.id === winningId)
    banner.textContent = winOutcome ? '\u2713 ' + winOutcome.title : t('mc_pred_ended')
    wrapper.appendChild(banner)
  }

  // Outcomes
  const outcomesWrap = document.createElement('div')
  outcomesWrap.className = 'hs-mc-pred-outcomes'

  for (const outcome of pred.outcomes) {
    const pct = totalPoints > 0 ? Math.round((outcome.totalPoints / totalPoints) * 100) : 0
    const color = outcomeColor(outcome.color)
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
    // Render emotes/emoji in outcome title — sanitized via escapeHtml() + processEmotes() (same as chat messages)
    titleSpan.innerHTML = typeof processEmotes === 'function' ? processEmotes(escapeHtml(outcome.title), null) : escapeHtml(outcome.title)
    if (isWinner) {
      const winBadge = document.createElement('span')
      winBadge.className = 'hs-mc-pred-winner-badge'
      winBadge.textContent = t('mc_pred_winner')
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
    let statsText = formatPoints(points) + ' pts \u00b7 ' + userCount + ' bettor' + (userCount !== 1 ? 's' : '')
    if (isBetOn) statsText += ' \u00b7 your bet: ' + formatPoints(userBet.points)
    stats.textContent = statsText
    card.appendChild(stats)

    if (!isLocked && !isEnded && (!userBet || isBetOn)) {
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
      customInput.type = 'text'
      customInput.placeholder = 'amt'
      customInput.dataset.outcome = outcome.id
      if (balance != null && balance <= 0) customInput.disabled = true
      betRow.appendChild(customInput)

      const goBtn = document.createElement('button')
      goBtn.className = 'hs-mc-pred-bet-go'
      goBtn.dataset.outcome = outcome.id
      goBtn.style.setProperty('--oc', color)
      goBtn.textContent = 'bet'
      if (balance != null && balance <= 0) goBtn.disabled = true
      betRow.appendChild(goBtn)

      card.appendChild(betRow)
    }

    // Mod resolve button per outcome (when locked)
    if (isLocked && isMod) {
      const resolveBtn = document.createElement('button')
      resolveBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-resolve-btn'
      resolveBtn.dataset.outcome = outcome.id
      resolveBtn.style.setProperty('--oc', color)
      if (isBetOn) {
        resolveBtn.textContent = t('mc_pred_pick_winner_bet')
        resolveBtn.classList.add('hs-mc-pred-resolve-yours')
      } else {
        resolveBtn.textContent = t('mc_pred_pick_winner')
      }
      card.appendChild(resolveBtn)
    }

    outcomesWrap.appendChild(card)
  }

  wrapper.appendChild(outcomesWrap)

  // Mod conflict notice — mod bet on this prediction and needs to resolve it
  if (isLocked && isMod && userBet) {
    const notice = document.createElement('div')
    notice.className = 'hs-mc-pred-mod-notice'
    const betOutcome = pred.outcomes.find(o => o.id === userBet.outcomeId)
    notice.textContent = 'you bet ' + formatPoints(userBet.points) + ' on ' + (betOutcome?.title || '?') + ' \u2014 pick the actual winner'
    wrapper.appendChild(notice)
  }

  // Mod controls
  if (!isEnded && isMod) {
    const modRow = document.createElement('div')
    modRow.className = 'hs-mc-pred-mod-row'

    if (!isLocked) {
      const lockBtn = document.createElement('button')
      lockBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-lock-btn'
      lockBtn.textContent = t('mc_pred_lock_betting')
      modRow.appendChild(lockBtn)
    }

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-cancel-btn'
    cancelBtn.textContent = t('mc_pred_cancel_refund')
    modRow.appendChild(cancelBtn)

    wrapper.appendChild(modRow)
  }

  frag.appendChild(wrapper)
  return frag
}

function renderNoPrediction(balance, channelId, isMod, cpImage, cpName) {
  const wrap = document.createElement('div')
  wrap.className = 'hs-mc-pred-empty'
  if (channelId) wrap.dataset.channelId = channelId

  const text = document.createElement('div')
  text.className = 'hs-mc-pred-empty-text'
  text.textContent = t('mc_pred_no_active')
  wrap.appendChild(text)

  if (balance != null) {
    const bal = document.createElement('div')
    bal.className = 'hs-mc-pred-balance'
    bal.style.marginTop = '8px'
    bal.appendChild(makePointIcon(14, cpImage))
    bal.appendChild(document.createTextNode(' ' + formatPoints(balance) + (cpName ? ' ' + cpName : '')))
    wrap.appendChild(bal)
  }

  // Create prediction form (mod feature)
  if (!isMod) return wrap
  const createWrap = document.createElement('div')
  createWrap.className = 'hs-mc-pred-create'

  const toggle = document.createElement('button')
  toggle.className = 'hs-mc-pred-mod-btn hs-mc-pred-create-toggle'
  toggle.textContent = t('mc_pred_new')
  createWrap.appendChild(toggle)

  const form = document.createElement('div')
  form.className = 'hs-mc-pred-create-form'
  form.style.display = 'none'

  const titleInput = document.createElement('input')
  titleInput.className = 'hs-mc-pred-create-input'
  titleInput.placeholder = t('mc_pred_title')
  titleInput.maxLength = 45
  form.appendChild(titleInput)

  const opt1 = document.createElement('input')
  opt1.className = 'hs-mc-pred-create-input hs-mc-pred-create-outcome'
  opt1.placeholder = t('mc_pred_option1')
  opt1.maxLength = 25
  form.appendChild(opt1)

  const opt2 = document.createElement('input')
  opt2.className = 'hs-mc-pred-create-input hs-mc-pred-create-outcome'
  opt2.placeholder = t('mc_pred_option2')
  opt2.maxLength = 25
  form.appendChild(opt2)

  const durRow = document.createElement('div')
  durRow.className = 'hs-mc-pred-create-dur-row'
  const durLabel = document.createElement('span')
  durLabel.className = 'hs-mc-pred-create-dur-label'
  durLabel.textContent = t('mc_pred_duration')
  durRow.appendChild(durLabel)
  for (const secs of [30, 60, 120, 300, 600, 1800]) {
    const btn = document.createElement('button')
    btn.className = 'hs-mc-pred-create-dur' + (secs === 120 ? ' hs-mc-pred-create-dur-active' : '')
    btn.dataset.secs = secs
    btn.tabIndex = -1
    btn.textContent = secs < 60 ? secs + 's' : (secs / 60) + 'm'
    durRow.appendChild(btn)
  }
  form.appendChild(durRow)

  const submitBtn = document.createElement('button')
  submitBtn.className = 'hs-mc-pred-mod-btn hs-mc-pred-create-submit'
  submitBtn.tabIndex = -1
  submitBtn.textContent = t('mc_pred_create')
  form.appendChild(submitBtn)

  createWrap.appendChild(form)
  wrap.appendChild(createWrap)

  return wrap
}

function renderRewards(rewards, balance, channelId) {
  const section = document.createElement('div')
  section.className = 'hs-mc-rewards'

  const header = document.createElement('div')
  header.className = 'hs-mc-rewards-header'
  const label = document.createElement('span')
  label.className = 'hs-mc-rewards-label'
  label.textContent = t('mc_reward_rewards')
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
    empty.textContent = t('mc_reward_no_rewards')
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
      if (reward.isPaused) reason.textContent = t('mc_reward_paused')
      else if (!reward.isInStock) reason.textContent = t('mc_reward_out_of_stock')
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
        input.placeholder = card.dataset.prompt || t('mc_reward_enter_text')
        const btn = document.createElement('button')
        btn.className = 'hs-mc-reward-submit'
        btn.textContent = t('mc_reward_redeem')
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
            setTimeout(() => { btn.textContent = t('mc_reward_redeem'); btn.disabled = false; btn.title = '' }, 2000)
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
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
      const secs = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (secs <= 0) {
        _rewardsCache = null
        renderTwitchTab()
        cleanup.clearInterval(iv)
        return
      }
      el.textContent = secs > 60 ? `${Math.ceil(secs / 60)}m cooldown` : `${secs}s cooldown`
    }, 1000)
  })
}

// Optimistic UI update after a bet — patches DOM immediately without server round-trip
function optimisticBetUpdate(container, outcomeId, points) {
  // Find which card has this outcome by checking all data-outcome elements
  const allOutcomeEls = container.querySelectorAll('[data-outcome]')
  const targetCards = new Set()
  const otherCards = new Set()
  allOutcomeEls.forEach(el => {
    const card = el.closest('.hs-mc-pred-outcome')
    if (!card) return
    if (el.dataset.outcome === outcomeId) targetCards.add(card)
    else otherCards.add(card)
  })

  // Update target outcome stats
  targetCards.forEach(card => {
    const statsEl = card.querySelector('.hs-mc-pred-outcome-stats')
    if (!statsEl) return
    const text = statsEl.textContent
    const ptsMatch = text.match(/([\d,.]+[KMB]?)\s*pts/i)
    const voterMatch = text.match(/(\d+)\s*bettor/)
    const betMatch = text.match(/your bet:\s*([\d,.]+[KMB]?)/i)
    const currentPts = ptsMatch ? parsePoints(ptsMatch[1]) : 0
    const currentVoters = voterMatch ? parseInt(voterMatch[1]) : 0
    const existingBet = betMatch ? parsePoints(betMatch[1]) : 0

    const newPts = currentPts + points
    const newVoters = existingBet ? currentVoters : currentVoters + 1
    const newBet = existingBet + points

    let newText = formatPoints(newPts) + ' pts \u00b7 ' + newVoters + ' voter' + (newVoters !== 1 ? 's' : '')
    newText += ' \u00b7 your bet: ' + formatPoints(newBet)
    statsEl.textContent = newText
    card.classList.add('hs-mc-pred-outcome-yours')
  })

  // Hide bet rows on other outcomes
  otherCards.forEach(card => {
    if (targetCards.has(card)) return
    const betRow = card.querySelector('.hs-mc-pred-bet-row')
    if (betRow) betRow.style.display = 'none'
  })

  // Update bar percentages across all outcomes
  const pred = container.querySelector('.hs-mc-prediction')
  if (!pred) return
  const outcomes = pred.querySelectorAll('.hs-mc-pred-outcome')
  let total = 0
  const ptsArr = []
  outcomes.forEach(card => {
    const text = card.querySelector('.hs-mc-pred-outcome-stats')?.textContent || ''
    const m = text.match(/([\d,.]+[KMB]?)\s*pts/i)
    ptsArr.push(m ? parsePoints(m[1]) : 0)
    total += ptsArr[ptsArr.length - 1]
  })
  outcomes.forEach((card, i) => {
    const pct = total > 0 ? Math.round((ptsArr[i] / total) * 100) : 0
    const pctEl = card.querySelector('.hs-mc-pred-outcome-pct')
    if (pctEl) pctEl.textContent = pct + '%'
    const fill = card.querySelector('.hs-mc-pred-bar-fill')
    if (fill) fill.style.width = pct + '%'
  })

  // Update balance
  const balEl = pred.querySelector('.hs-mc-pred-balance')
  if (balEl && balEl.lastChild) {
    const currentBal = parsePoints(balEl.textContent.trim())
    balEl.lastChild.textContent = ' ' + formatPoints(Math.max(0, currentBal - points))
  }
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

  // Human-readable prediction error messages
  const predErrorMsg = (code) => {
    if (!code) return 'failed'
    const c = code.toUpperCase()
    if (c.includes('EVENT_MANAGER') || c.includes('OWNER')) return "can't bet on own"
    if (c.includes('ACCEPT') || c.includes('TOS')) return 'try again'
    if (c.includes('NOT_FOUND')) return 'prediction ended'
    if (c.includes('LOCKED')) return 'betting locked'
    if (c.includes('INSUFFICIENT') || c.includes('BALANCE')) return 'not enough points'
    if (c.includes('ALREADY')) return 'already bet'
    if (c.includes('FORBIDDEN')) return 'no permission'
    return code.toLowerCase().slice(0, 15)
  }

  // Bet button handlers
  container.querySelectorAll('.hs-mc-pred-bet-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) return
      btn.disabled = true
      btn.textContent = '...'
      const betPoints = parseInt(btn.dataset.points)
      const result = await placePredictionBet(eventId, btn.dataset.outcome, betPoints)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = formatPoints(betPoints); btn.disabled = false; btn.title = '' }, 4000)
      } else {
        btn.textContent = '\u2713'
        try {
          optimisticBetUpdate(container, btn.dataset.outcome, betPoints)
        } catch (e) {
          console.error('[hs-pred] optimistic update failed:', e)
        }
        setTimeout(() => refreshPredictionSlot(), 3000)
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
      const points = parsePoints(input?.value)
      if (!points || points < 1) return
      btn.disabled = true
      btn.textContent = '...'
      const result = await placePredictionBet(eventId, btn.dataset.outcome, points)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = 'bet'; btn.disabled = false; btn.title = '' }, 3000)
      } else {
        btn.textContent = '\u2713'
        optimisticBetUpdate(container, btn.dataset.outcome, points)
        input.value = ''
        setTimeout(() => refreshPredictionSlot(), 3000)
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

  // Mod: lock betting
  container.querySelectorAll('.hs-mc-pred-lock-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = btn.closest('.hs-mc-prediction')?.dataset.eventId
        || container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) { btn.textContent = 'no event'; return }
      btn.disabled = true
      btn.textContent = '...'
      const result = await lockPrediction(eventId)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_lock_betting'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        // Hide bet rows + lock button immediately, keep resolve/cancel
        const pred = btn.closest('.hs-mc-prediction') || container.querySelector('.hs-mc-prediction')
        if (pred) {
          pred.querySelectorAll('.hs-mc-pred-bet-row').forEach(el => el.remove())
          pred.querySelector('.hs-mc-pred-lock-btn')?.remove()
        }
        btn.textContent = '\u2713 ' + t('mc_pred_locked')
        setTimeout(() => refreshPredictionSlot(), 2000)
      }
    })
  })

  // Mod: resolve (pick winner)
  container.querySelectorAll('.hs-mc-pred-resolve-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = btn.closest('.hs-mc-prediction')?.dataset.eventId
        || container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) { btn.textContent = 'no event'; return }
      const outcomeId = btn.dataset.outcome
      if (!outcomeId) { btn.textContent = 'no outcome'; return }
      btn.disabled = true
      btn.textContent = '...'
      const result = await resolvePrediction(eventId, outcomeId)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_pick_winner'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        // Immediately clean up stale UI
        const pred = btn.closest('.hs-mc-prediction') || container.querySelector('.hs-mc-prediction')
        if (pred) {
          pred.querySelectorAll('.hs-mc-pred-mod-row, .hs-mc-pred-mod-notice, .hs-mc-pred-bet-row, .hs-mc-pred-resolve-btn').forEach(el => el.remove())
          pred.classList.add('hs-mc-pred-resolved')
        }
        btn.textContent = '\u2713 ' + t('mc_pred_ended')
        setTimeout(() => refreshPredictionSlot(), 2000)
      }
    })
  })

  // Mod: cancel (refund)
  container.querySelectorAll('.hs-mc-pred-cancel-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const eventId = btn.closest('.hs-mc-prediction')?.dataset.eventId
        || container.querySelector('.hs-mc-prediction')?.dataset.eventId
      if (!eventId) { btn.textContent = 'no event'; return }
      btn.disabled = true
      btn.textContent = '...'
      const result = await cancelPrediction(eventId)
      if (result.error) {
        btn.textContent = predErrorMsg(result.error)
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_cancel_refund'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        const pred = btn.closest('.hs-mc-prediction') || container.querySelector('.hs-mc-prediction')
        if (pred) {
          pred.querySelectorAll('.hs-mc-pred-mod-row, .hs-mc-pred-mod-notice, .hs-mc-pred-bet-row, .hs-mc-pred-resolve-btn').forEach(el => el.remove())
          pred.classList.add('hs-mc-pred-canceled')
        }
        btn.textContent = '\u2713 ' + t('mc_pred_refunded')
        setTimeout(() => refreshPredictionSlot(), 2000)
      }
    })
  })

  // Create form: Tab cycles inputs, Enter submits, Escape closes
  const createInputs = [...container.querySelectorAll('.hs-mc-pred-create-input')]
  createInputs.forEach((input, i) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        createInputs[(i + (e.shiftKey ? createInputs.length - 1 : 1)) % createInputs.length].focus()
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const submit = input.closest('.hs-mc-pred-create-form')?.querySelector('.hs-mc-pred-create-submit')
        if (submit && !submit.disabled) submit.click()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        const toggle = input.closest('.hs-mc-pred-create')?.querySelector('.hs-mc-pred-create-toggle')
        if (toggle) toggle.click()
      }
    })
  })

  // Create prediction form toggle + submit
  container.querySelectorAll('.hs-mc-pred-create-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const form = btn.parentElement.querySelector('.hs-mc-pred-create-form')
      if (form) {
        const showing = form.style.display !== 'none'
        form.style.display = showing ? 'none' : 'flex'
        btn.textContent = showing ? t('mc_pred_new') : t('mc_pred_cancel_form')
      }
    })
  })

  // Duration picker
  container.querySelectorAll('.hs-mc-pred-create-dur').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      container.querySelectorAll('.hs-mc-pred-create-dur').forEach(b => b.classList.remove('hs-mc-pred-create-dur-active'))
      btn.classList.add('hs-mc-pred-create-dur-active')
    })
  })

  // Create submit
  container.querySelectorAll('.hs-mc-pred-create-submit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const channelId = container.querySelector('[data-channel-id]')?.dataset.channelId
      if (!channelId) { btn.textContent = 'no channel'; return }
      const form = btn.closest('.hs-mc-pred-create-form')
      const inputs = form.querySelectorAll('.hs-mc-pred-create-input')
      const title = inputs[0]?.value?.trim()
      const outcomes = [...form.querySelectorAll('.hs-mc-pred-create-outcome')].map(i => i.value.trim()).filter(Boolean)
      if (!title) { inputs[0].focus(); return }
      if (outcomes.length < 2) { form.querySelectorAll('.hs-mc-pred-create-outcome')[outcomes.length]?.focus(); return }
      const durBtn = form.querySelector('.hs-mc-pred-create-dur-active')
      const secs = parseInt(durBtn?.dataset.secs || '120')
      btn.disabled = true
      btn.textContent = '...'
      const result = await createPrediction(channelId, title, secs, outcomes)
      if (result.error) {
        btn.textContent = '!'
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_pred_create'); btn.disabled = false; btn.title = '' }, 2000)
      } else {
        form.style.display = 'none'
        refreshPredictionSlot()
      }
    })
  })

  // Create prediction keyboard nav
  container.querySelectorAll('.hs-mc-pred-create-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const inputs = [...container.querySelectorAll('.hs-mc-pred-create-input')]
        const idx = inputs.indexOf(input)
        const next = inputs[(idx + 1) % inputs.length]
        next?.focus()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        container.querySelector('.hs-mc-pred-create-submit')?.click()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        container.querySelector('.hs-mc-pred-create-toggle')?.click()
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
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
      update()
    }, 1000)
  })
}

// ═══ Chat overlay banners (predictions + polls at top of messages) ═══

let _bannerTimers = []
let _lastPredResult = null
let _lastPollData = null
let _lastPinnedMsg = null
let _hypeTrainActive = null // { level, startedAt }
let _bannerFingerprint = '' // avoid rebuilding if nothing changed

function clearBannerTimers() {
  _bannerTimers.forEach(id => cleanup.clearInterval(id))
  _bannerTimers = []
}

function _startBannerTimer(el, endsAt) {
  const update = () => {
    const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
    if (remaining <= 0) { el.textContent = 'closing'; return }
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's'
  }
  update()
  _bannerTimers.push(cleanup.setInterval(() => {
    if (!el.isConnected) return
    update()
  }, 1000))
}

function updateChatBanners(predResult, pollData) {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl) return
  const t = typeof hermesToggles !== 'undefined' ? hermesToggles : {}

  const pred = predResult?.prediction
  const hasPred = t.pred !== false && pred && (pred.status === 'ACTIVE' || pred.status === 'LOCKED')
  const hasPoll = t.poll !== false && pollData && pollData.status === 'ACTIVE'
  const hasPin = t.pin !== false && _lastPinnedMsg
  const hasHype = t.hype !== false && _hypeTrainActive

  // Fingerprint to avoid unnecessary rebuilds (prevents flash on bet/refresh)
  const userBet = pred ? _userBets.get(pred.id) : null
  const fp = [
    hasPred ? pred.id + ':' + pred.status + ':' + (userBet?.points || 0) : '',
    hasPoll ? pollData.id + ':' + pollData.status : '',
    hasPin ? (_lastPinnedMsg.id || _lastPinnedMsg.message) : '',
    hasHype ? 'hype:' + _hypeTrainActive.level : ''
  ].join('|')

  if (fp === _bannerFingerprint) return
  _bannerFingerprint = fp

  const old = msgsEl.querySelector('.hs-mc-chat-banner')
  clearBannerTimers()

  if (!hasPred && !hasPoll && !hasPin && !hasHype) {
    if (old) old.remove()
    return
  }

  const banner = old || document.createElement('div')
  banner.className = 'hs-mc-chat-banner'
  banner.innerHTML = ''

  const goToTwitch = (e) => {
    const twitchTab = document.querySelector('[data-tab="live"]')
    if (twitchTab) twitchTab.click()
  }

  // Pinned message
  if (hasPin) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-pin'
    row.innerHTML = '<span class="hs-mc-chat-banner-icon">\u{1F4CC}</span>'
    const title = document.createElement('span')
    title.className = 'hs-mc-chat-banner-title'
    title.textContent = _lastPinnedMsg.message || ''
    row.appendChild(title)
    if (_lastPinnedMsg.sender) {
      const sender = document.createElement('span')
      sender.className = 'hs-mc-chat-banner-badge'
      sender.textContent = _lastPinnedMsg.sender
      sender.style.color = '#bf94ff'
      row.appendChild(sender)
    }
    banner.appendChild(row)
  }

  // Prediction with vital info
  if (hasPred) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-pred'
    row.style.cursor = 'pointer'
    row.addEventListener('click', goToTwitch)

    // Build: 🔮 title · outcome1 45% vs outcome2 55% · [your bet: 100] · 2:30
    row.innerHTML = '<span class="hs-mc-chat-banner-icon">\u{1F52E}</span>'

    const info = document.createElement('span')
    info.className = 'hs-mc-chat-banner-title'
    const totalPts = pred.outcomes.reduce((s, o) => s + (o.totalPoints || 0), 0)
    const parts = pred.outcomes.map(o => {
      const pct = totalPts > 0 ? Math.round((o.totalPoints / totalPts) * 100) : 0
      return o.title + ' ' + pct + '%'
    })
    let text = pred.title + ' \u00b7 ' + parts.join(' vs ')
    if (userBet) {
      const betOutcome = pred.outcomes.find(o => o.id === userBet.outcomeId)
      text += ' \u00b7 bet: ' + formatPoints(userBet.points) + (betOutcome ? ' ' + betOutcome.title : '')
    }
    info.textContent = text
    row.appendChild(info)

    if (pred.status === 'ACTIVE') {
      const timer = document.createElement('span')
      timer.className = 'hs-mc-chat-banner-timer'
      const createdAt = new Date(pred.createdAt).getTime()
      const windowMs = (pred.predictionWindowSeconds || 120) * 1000
      _startBannerTimer(timer, createdAt + windowMs)
      row.appendChild(timer)
    } else {
      const badge = document.createElement('span')
      badge.className = 'hs-mc-chat-banner-badge'
      badge.textContent = t('mc_pred_locked')
      row.appendChild(badge)
    }

    banner.appendChild(row)
  }

  // Poll with vital info
  if (hasPoll) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-poll'
    row.style.cursor = 'pointer'
    row.addEventListener('click', goToTwitch)

    row.innerHTML = '<span class="hs-mc-chat-banner-icon">\u{1F4CA}</span>'

    const info = document.createElement('span')
    info.className = 'hs-mc-chat-banner-title'
    const totalVotes = pollData.choices?.reduce((s, c) => s + (c.votes?.totalCount || c.totalVotes || 0), 0) || 0
    const choiceParts = pollData.choices?.slice(0, 4).map(c => {
      const votes = c.votes?.totalCount || c.totalVotes || 0
      const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
      return c.title + ' ' + pct + '%'
    }) || []
    info.textContent = pollData.title + (choiceParts.length ? ' \u00b7 ' + choiceParts.join(' vs ') : '')
    row.appendChild(info)

    const timer = document.createElement('span')
    timer.className = 'hs-mc-chat-banner-timer'
    const durMs = (pollData.durationSeconds || 60) * 1000
    const startTime = pollData.startedAt || pollData.createdAt
    const pollEndTime = startTime ? (new Date(startTime).getTime() + durMs) : (Date.now() + (pollData.remainingDurationMilliseconds || durMs))
    _startBannerTimer(timer, pollEndTime)
    row.appendChild(timer)

    banner.appendChild(row)
  }

  // Hype train
  if (hasHype) {
    const row = document.createElement('div')
    row.className = 'hs-mc-chat-banner-item hs-mc-chat-banner-hype'
    row.innerHTML = `<span class="hs-mc-chat-banner-icon">\u{1F682}</span><span class="hs-mc-chat-banner-title">${t('mc_chat_hype_train')}</span>`
    const badge = document.createElement('span')
    badge.className = 'hs-mc-chat-banner-badge'
    badge.textContent = t('mc_chat_hype_level', [String(_hypeTrainActive.level || 1)])
    badge.style.color = '#ff8700'
    row.appendChild(badge)
    banner.appendChild(row)
  }

  if (!old) msgsEl.prepend(banner)
}

// Called from main.js hermes event handler
function onHypeTrainStart(level) {
  _hypeTrainActive = { level: level || 1, startedAt: Date.now() }
  updateChatBanners(_lastPredResult, _lastPollData)
}
function onHypeTrainEnd() {
  _hypeTrainActive = null
  updateChatBanners(_lastPredResult, _lastPollData)
}
function onPinnedMessage(msg) {
  _lastPinnedMsg = msg
  updateChatBanners(_lastPredResult, _lastPollData)
}
function clearPinnedMessage() {
  _lastPinnedMsg = null
  updateChatBanners(_lastPredResult, _lastPollData)
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

  // YouTube/Kick: Twitch features (predictions, polls, rewards, color, clips) require
  // the Twitch page context (auth cookie + GQL proxy). Show what's available instead.
  if (hostPlatform === 'yt' || hostPlatform === 'kick') {
    container.textContent = ''
    const notice = document.createElement('div')
    notice.className = 'hs-mc-pred-empty'
    notice.style.cssText = 'padding:20px;text-align:center;'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = hostPlatform === 'yt'
      ? 'twitch features (predictions, polls, rewards, clips) are available when viewing on twitch'
      : 'some features require the twitch page'
    notice.appendChild(msg)
    container.appendChild(notice)
    // Popout chat still works — opens in new window
    if (channel) {
      container.appendChild(renderQuickLinks())
    }
    return
  }

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

  container.textContent = ''

  // Placeholder slots for progressive rendering
  const predSlot = document.createElement('div')
  predSlot.className = 'hs-mc-pred-loading'
  predSlot.dataset.predSlot = '1'
  predSlot.textContent = 'loading...'
  const pollSlot = document.createElement('div')
  pollSlot.dataset.pollSlot = '1'
  const rewardsSlot = document.createElement('div')
  container.appendChild(predSlot)
  container.appendChild(pollSlot)
  container.appendChild(rewardsSlot)

  // Color picker + links rendered immediately (no network needed)
  container.appendChild(renderColorPicker())
  const modesSlot = document.createElement('div')
  container.appendChild(modesSlot)
  container.appendChild(renderQuickLinks())
  attachColorHandlers()

  // Chat modes (non-blocking)
  renderChatModes(channel).then(modesEl => {
    if (modesEl) {
      modesSlot.appendChild(modesEl)
      attachModeHandlers()
    }
  })

  // Fetch all in parallel, render each as it arrives
  const modBefore = _twitchIsMod
  fetchPrediction(channel).then(result => {
    _lastPredResult = result
    updateChatBanners(_lastPredResult, _lastPollData)
    predSlot.textContent = ''
    predSlot.className = ''
    if (!result) {
      const empty = document.createElement('div')
      empty.className = 'hs-mc-pred-empty'
      const msg = document.createElement('div')
      msg.className = 'hs-mc-pred-empty-text'
      msg.textContent = t('mc_pred_load_failed')
      empty.appendChild(msg)
      predSlot.appendChild(empty)
    } else if (result.prediction) {
      predSlot.appendChild(renderPrediction(result.prediction, result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
    } else {
      predSlot.appendChild(renderNoPrediction(result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
    }
    attachPredictionHandlers()
    // If prediction fetch revealed mod status, refresh poll slot to show mod controls
    if (_twitchIsMod && !modBefore) refreshPollSlot()
  })

  fetchPoll(channel).then(pollResult => {
    _lastPollData = pollResult?.poll || pollResult
    updateChatBanners(_lastPredResult, _lastPollData)
    if (pollResult?.poll) {
      pollSlot.appendChild(renderPoll(pollResult.poll, pollResult.channelId, pollResult.isMod))
      attachPollHandlers()
    } else if (pollResult) {
      pollSlot.appendChild(renderNoPoll(pollResult.channelId, pollResult.isMod))
      attachPollHandlers()
    }
  })

  fetchChannelRewards(channel).then(rewardsResult => {
    if (rewardsResult?.availableClaim && rewardsResult.channelId) {
      claimCommunityPoints(rewardsResult.availableClaim, rewardsResult.channelId)
    }
    if (rewardsResult?.rewards?.length) {
      rewardsSlot.appendChild(renderRewards(rewardsResult.rewards, rewardsResult.balance, rewardsResult.channelId))
      attachRewardHandlers()
    }
  })

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
    // Don't refresh while create form is open
    if (container.querySelector('.hs-mc-pred-create-form[style*="flex"]')) return
    refreshPredictionSlot()
    refreshPollSlot()
  }, 15000)
}

// Refresh only the prediction slot without tearing down the whole Twitch tab
async function refreshPredictionSlot() {
  _predResultCache = null // always fetch fresh on explicit refresh
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return
  const channel = getActiveTwitchChannel()
  if (!channel) return

  const result = await fetchPrediction(channel)

  // Update chat overlay banner
  _lastPredResult = result
  updateChatBanners(_lastPredResult, _lastPollData)

  // Find the prediction slot — it's always a direct child of container marked with data-pred-slot
  let slot = container.querySelector('[data-pred-slot]')
  if (!slot) {
    // Fallback: find by class
    slot = container.querySelector('.hs-mc-prediction')
      || container.querySelector('.hs-mc-pred-empty')
      || container.querySelector('.hs-mc-pred-loading')
  }
  if (!slot) return

  const newSlot = document.createElement('div')
  newSlot.dataset.predSlot = '1'
  if (!result) {
    newSlot.className = 'hs-mc-pred-empty'
    const msg = document.createElement('div')
    msg.className = 'hs-mc-pred-empty-text'
    msg.textContent = t('mc_pred_load_failed')
    newSlot.appendChild(msg)
  } else if (result.prediction) {
    newSlot.appendChild(renderPrediction(result.prediction, result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
  } else {
    newSlot.appendChild(renderNoPrediction(result.balance, result.channelId, result.isMod, result.cpImage, result.cpName))
  }
  slot.replaceWith(newSlot)
  attachPredictionHandlers()
}

// Refresh only the poll slot without tearing down the whole Twitch tab
async function refreshPollSlot() {
  const container = document.getElementById('hs-mc-tab-twitch')
  if (!container) return
  const channel = getActiveTwitchChannel()
  if (!channel) return

  // Don't refresh while create form is open
  if (container.querySelector('.hs-mc-poll-create-form[style*="flex"]')) return
  const result = await fetchPoll(channel)
  _lastPollData = result?.poll || result
  updateChatBanners(_lastPredResult, _lastPollData)

  let slot = container.querySelector('[data-poll-slot]')
  if (!slot) {
    slot = container.querySelector('.hs-mc-poll')
      || container.querySelector('.hs-mc-poll-empty')
  }
  if (!slot) return

  const newSlot = document.createElement('div')
  newSlot.dataset.pollSlot = '1'
  if (result?.poll) {
    newSlot.appendChild(renderPoll(result.poll, result.channelId, result.isMod))
  } else if (result) {
    newSlot.appendChild(renderNoPoll(result.channelId, result.isMod))
  }
  slot.replaceWith(newSlot)
  attachPollHandlers()
}

function stopPredictionPoll() {
  if (_predictionPollTimer) {
    cleanup.clearInterval(_predictionPollTimer)
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
      if (Object.keys(_gqlDataCache).length > 50) {
        const oldest = Object.entries(_gqlDataCache).reduce((a, b) => a[1].ts < b[1].ts ? a : b)[0]
        delete _gqlDataCache[oldest]
      }
      // Auto-refresh individual slots when relevant GQL data arrives
      const container = document.getElementById('hs-mc-tab-twitch')
      if (container && container.style.display !== 'none') {
        const pollOps = ['ActivePoll', 'CreatePoll', 'ChannelPollContext']
        const predOps = ['ChannelPointsPredictionContext', 'MakePrediction']
        if (pollOps.includes(operation)) {
          refreshPollSlot()
        } else if (predOps.includes(operation)) {
          refreshPredictionSlot()
        } else {
          renderTwitchTab()
        }
      }
    }
  }
}, { signal: mcSignal })

// Send Helix API request through MAIN world (uses captured OAuth token)
// URL can contain {me} which resolves to the logged-in user's ID
function helixRequest(url, method, body) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.data?.type === 'heatsync-helix-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler, { signal })
    const msg = { type: 'heatsync-helix', id, url, method: method || 'GET', nonce: window.HS?.getMainWorldNonce?.() || null }
    if (body) msg.body = body
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      resolve({ error: 'helix timeout — refresh the page' })
    }, 15000)
  })
}

// Send GQL request through MAIN world proxy (uses captured hashes + integrity)
function gqlProxy(operation, variables, opts) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.data?.type === 'heatsync-gql-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.data)
      }
    }
    window.addEventListener('message', handler, { signal })
    const msg = { type: 'heatsync-gql-request', id, operation, variables, nonce: window.HS?.getMainWorldNonce?.() || null }
    if (opts?.rawQuery) msg.rawQuery = opts.rawQuery
    if (opts?.batch) msg.batch = opts.batch
    window.postMessage(msg, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      reject(new Error('GQL proxy timeout'))
    }, 4000)
  })
}

// Request cached data from MAIN world
function gqlGetCache(operations) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.data?.type === 'heatsync-gql-cache-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler, { signal })
    window.postMessage({ type: 'heatsync-gql-get-cache', id, operations }, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
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
let _twitchIsMod = false  // cached from fetchPrediction (most reliable isMod source)
let _twitchChannelId = null
const _userBets = new Map() // eventId → { outcomeId, points } (capped at 50)

// Rewards state
let _rewardsCache = null
let _rewardsCacheChannel = null

// Prediction result cache — avoids redundant GQL on quick tab switches
let _predResultCache = null // { result, channel, ts }
const PRED_CACHE_TTL = 5000 // 5s — fresh enough to feel instant, short enough to stay current

const PRED_FIELDS = 'id title status createdAt endedAt predictionWindowSeconds winningOutcome { id } outcomes { id title totalPoints totalUsers color } self { prediction { outcome { id } points } }'

// GQL call — tries direct fetch first (Chrome MV3), falls back to MAIN world proxy (Firefox MV2)
async function twitchGql(query, variables) {
  // Try direct fetch (works in Chrome MV3 content scripts with host_permissions)
  try {
    const token = getTwitchAuthToken()
    const hdrs = { 'Content-Type': 'application/json', 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }
    if (token) hdrs['Authorization'] = 'OAuth ' + token
    const body = variables ? { query, variables } : { query }
    const resp = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST', headers: hdrs, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) throw new Error('GQL ' + resp.status)
    return resp.json()
  } catch (directErr) {
    // Direct fetch failed (Firefox CORS) — fall back to MAIN world proxy
    try {
      const data = await gqlProxy('twitchGql', variables || {}, { rawQuery: query })
      const d = Array.isArray(data) ? data[0] : data
      // Proxy wraps in { data } or returns raw — normalize
      return d?.data ? d : { data: d }
    } catch (proxyErr) {
      throw new Error('GQL failed: direct=' + directErr.message + ' proxy=' + proxyErr.message)
    }
  }
}

async function fetchPrediction(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null

  // Return cached result if fresh (avoids GQL on quick tab switches)
  if (_predResultCache && _predResultCache.channel === safe && Date.now() - _predResultCache.ts < PRED_CACHE_TTL) {
    return _predResultCache.result
  }

  try {
    let predEvent = null
    let balance = null
    let channelId = null
    let isMod = false
    let cpImage = null
    let cpName = null

    // Single combined GQL query — predictions + balance + channel points settings
    try {
      const data = await twitchGql('{ user(login: "' + safe + '") { id self { isModerator } channel { activePredictionEvents { ' + PRED_FIELDS + ' } lockedPredictionEvents { ' + PRED_FIELDS + ' } resolvedPredictionEvents(first: 1) { edges { node { ' + PRED_FIELDS + ' } } } } } currentUser { id } channel(name: "' + safe + '") { communityPointsSettings { image { url url2x } name } self { communityPoints { balance } } } }')
      const ch = data?.data?.user?.channel
      const userId = data?.data?.user?.id
      const currentUserId = data?.data?.currentUser?.id
      if (userId) channelId = userId
      isMod = data?.data?.user?.self?.isModerator || (userId && currentUserId && userId === currentUserId)

      // Priority: ACTIVE > LOCKED > recently RESOLVED (< 5 min ago)
      const active = ch?.activePredictionEvents
      const locked = ch?.lockedPredictionEvents
      const resolved = ch?.resolvedPredictionEvents?.edges?.[0]?.node

      if (Array.isArray(active) && active.length) {
        predEvent = active.find(e => e.status === 'ACTIVE') || active[0]
      } else if (Array.isArray(locked) && locked.length) {
        predEvent = locked[0]
      } else if (resolved) {
        // Show resolved predictions briefly so users see the result
        const resolvedTime = resolved.endedAt || resolved.createdAt
        const resolvedAge = Date.now() - new Date(resolvedTime).getTime()
        if (resolvedAge < 300000) predEvent = resolved
      }

      // Populate _userBets from self.prediction
      if (predEvent?.self?.prediction) {
        const sp = predEvent.self.prediction
        if (sp.outcome?.id && sp.points) {
          if (_userBets.size > 50) _userBets.delete(_userBets.keys().next().value)
          _userBets.set(predEvent.id, { outcomeId: sp.outcome.id, points: sp.points })
        }
      }

      // Extract balance + channel points settings from same response
      const ch2 = data?.data?.channel
      balance = ch2?.self?.communityPoints?.balance ?? null
      cpImage = ch2?.communityPointsSettings?.image?.url2x || ch2?.communityPointsSettings?.image?.url || null
      cpName = ch2?.communityPointsSettings?.name || null
    } catch (e) {
      log('GQL prediction query failed:', e.message)
    }

    // Fallback: fetch balance via proxy if combined query didn't get it
    if (balance === null) {
      try {
        const data = await gqlProxy('CommunityPointsContext', { channelLogin: safe })
        const d = Array.isArray(data) ? data[0]?.data : (data?.data || data)
        balance = d?.community?.channel?.self?.communityPoints?.balance ?? null
      } catch {}
    }

    _twitchIsMod = isMod
    _twitchChannelId = channelId
    const result = { prediction: predEvent, balance, channelId, isMod, cpImage, cpName }
    _predResultCache = { result, channel: safe, ts: Date.now() }
    return result
  } catch (e) {
    log('Failed to fetch prediction:', e.message)
    return null
  }
}

// ═══ Mod prediction management (direct GQL — no MAIN world proxy) ═══

// Mod prediction mutations — try Apollo client (has integrity + correct hashes),
// fallback to raw query through MAIN world proxy (has integrity), final fallback direct fetch
async function predictionMutation(searchTerm, resultField, rawQuery, variables) {
  // Try Apollo client first (most reliable — uses Twitch's own persisted hashes)
  const apolloResult = await apolloMutate({ searchTerm, variables, resultField, rawQuery })
  if (apolloResult.ok) return { ok: true }
  // Apollo failed — try raw query through MAIN world proxy (has integrity)
  try {
    const data = await gqlMutation(rawQuery, variables)
    const err = data?.data?.[resultField]?.error
    if (err) return { error: err.code || resultField + ' failed' }
    return { ok: true }
  } catch (e) { return { error: apolloResult.error || e.message } }
}

async function lockPrediction(eventId) {
  return predictionMutation(
    'LockPredictionEvent', 'lockPredictionEvent',
    'mutation($input: LockPredictionEventInput!) { lockPredictionEvent(input: $input) { error { code } } }',
    { input: { id: eventId } }
  )
}

async function resolvePrediction(eventId, outcomeId) {
  return predictionMutation(
    'ResolvePredictionEvent', 'resolvePredictionEvent',
    'mutation($input: ResolvePredictionEventInput!) { resolvePredictionEvent(input: $input) { error { code } } }',
    { input: { eventID: eventId, outcomeID: outcomeId } }
  )
}

async function cancelPrediction(eventId) {
  return predictionMutation(
    'CancelPredictionEvent', 'cancelPredictionEvent',
    'mutation($input: CancelPredictionEventInput!) { cancelPredictionEvent(input: $input) { error { code } } }',
    { input: { id: eventId } }
  )
}

async function createPrediction(channelId, title, windowSeconds, outcomes) {
  const colors = ['BLUE', 'PINK', 'ORANGE', 'GREEN', 'TEAL', 'PURPLE', 'YELLOW', 'LIGHT_BLUE', 'RED', 'BROWN']
  return predictionMutation(
    'CreatePredictionEvent', 'createPredictionEvent',
    'mutation($input: CreatePredictionEventInput!) { createPredictionEvent(input: $input) { error { code } } }',
    { input: { channelID: channelId, title, predictionWindowSeconds: windowSeconds, outcomes: outcomes.map((t, i) => ({ title: t, color: colors[i] || colors[0] })) } }
  )
}

// Route a mutation through Twitch's own Apollo client in the MAIN world.
// searchTerm: string to find the webpack module (e.g. 'AcceptPredictionTerms')
// variables: GQL variables object
// resultField: the mutation's return field name (for error extraction)
// rawQuery: optional fallback raw query string
function apolloMutate({ searchTerm, variables, resultField, rawQuery }) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const ac = new AbortController()
    const signal = mcSignal ? AbortSignal.any([mcSignal, ac.signal]) : ac.signal
    const handler = (e) => {
      if (e.data?.type === 'heatsync-apollo-mutate-response' && e.data.id === id) {
        ac.abort()
        clearTimeout(timer)
        resolve(e.data.data || { error: 'no response' })
      }
    }
    window.addEventListener('message', handler, { signal })
    window.postMessage({
      type: 'heatsync-apollo-mutate', id, searchTerm, variables,
      resultField, rawQuery, nonce: window.HS?.getMainWorldNonce?.() || null
    }, location.origin)
    const timer = setTimeout(() => {
      ac.abort()
      resolve({ error: 'apollo mutation timeout' })
    }, 8000)
  })
}

async function acceptPredictionTerms() {
  const result = await apolloMutate({
    searchTerm: 'AcceptPredictionTerms',
    variables: { input: { hasAcceptedTOS: true } },
    resultField: 'updateUserPredictionSettings',
    rawQuery: 'mutation($input: UpdateUserPredictionSettingsInput!) { updateUserPredictionSettings(input: $input) { error { code } settings { hasAcceptedTOS } } }'
  })
  return !!result.ok
}

// Known working persisted query hashes (from Twitch's own client)
const TWITCH_HASHES = {
  MakePrediction: 'b44682ecc88358817009f20e69d75081b1e58825bb40aa53d5dbadcc17c881d8'
}

// Route mutation through MAIN world proxy (has integrity token) with direct fetch fallback
async function gqlMutation(query, variables) {
  try {
    const data = await gqlProxy('twitchGql', variables || {}, { rawQuery: query })
    const d = Array.isArray(data) ? data[0] : data
    return d?.data ? d : { data: d }
  } catch {
    return twitchGql(query, variables)
  }
}

// Use persisted query hash for MakePrediction — raw queries are dead for mutations
async function gqlPersistedMutation(operationName, variables) {
  const hash = TWITCH_HASHES[operationName]
  if (!hash) return gqlMutation('mutation ' + operationName + '($input: ' + operationName + 'Input!) { ' + operationName.replace(/^[A-Z]/, c => c.toLowerCase()) + '(input: $input) { error { code } } }', variables)
  const token = getTwitchAuthToken()
  const hdrs = { 'Content-Type': 'application/json', 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }
  if (token) hdrs['Authorization'] = 'OAuth ' + token
  try {
    const resp = await fetch('https://gql.twitch.tv/gql', {
      method: 'POST', headers: hdrs,
      body: JSON.stringify({
        operationName,
        variables,
        extensions: { persistedQuery: { version: 1, sha256Hash: hash } }
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (!resp.ok) throw new Error('GQL ' + resp.status)
    return resp.json()
  } catch (directErr) {
    // Firefox CORS fallback — route through MAIN world proxy with hash
    try {
      const data = await gqlProxy(operationName, variables)
      const d = Array.isArray(data) ? data[0] : data
      return d?.data ? d : { data: d }
    } catch {
      throw directErr
    }
  }
}

async function placePredictionBet(eventId, outcomeId, points, transactionId) {
  const token = getTwitchAuthToken()
  if (!token) return { error: 'not logged in' }
  try {
    const isTosError = (d) => {
      const msg = d?.errors?.[0]?.message || ''
      const code = d?.data?.makePrediction?.error?.code || ''
      return msg.includes('ACCEPT') || msg.includes('TOS') || code.includes('ACCEPT') || code.includes('TOS')
    }
    const tryBet = () => {
      const makeInput = { eventID: eventId, outcomeID: outcomeId, points, transactionID: crypto.randomUUID() }
      return gqlPersistedMutation('MakePrediction', { input: makeInput })
    }

    let data = await tryBet()
    if (isTosError(data)) {
      await acceptPredictionTerms()
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
        data = await tryBet()
        if (!isTosError(data)) break
      }
    }
    if (data?.errors?.length) return { error: data.errors[0].message }
    const mutError = data?.data?.makePrediction?.error
    if (mutError) return { error: mutError.code || 'bet failed' }
    if (_userBets.size > 50) _userBets.delete(_userBets.keys().next().value)
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
        signal: AbortSignal.timeout(5000),
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

// Persist active poll to storage (survives reloads; Twitch has no public poll query)
function _savePollToStorage(poll, channelId) {
  if (!poll?.id) return
  try {
    chrome.storage.local.set({ hs_active_poll: { poll, channelId, savedAt: Date.now() } })
  } catch {}
}
function _clearPollFromStorage() {
  try { chrome.storage.local.remove('hs_active_poll') } catch {}
}

// Recompute remainingDurationMilliseconds from startedAt + durationSeconds
function _refreshPollTiming(poll) {
  if (!poll?.startedAt || !poll?.durationSeconds) return poll
  const elapsed = Date.now() - new Date(poll.startedAt).getTime()
  const totalMs = poll.durationSeconds * 1000
  poll.remainingDurationMilliseconds = Math.max(0, totalMs - elapsed)
  // Auto-mark as completed if time expired
  if (poll.remainingDurationMilliseconds <= 0 && poll.status === 'ACTIVE') {
    poll.status = 'COMPLETED'
  }
  return poll
}

async function fetchPoll(channelLogin) {
  const safe = channelLogin.replace(/[^a-z0-9_]/g, '')
  if (!safe) return null
  try {
    // 1. Check GQL interception cache (from Twitch's own traffic)
    for (const key of ['ActivePoll', 'ChannelPollContext']) {
      const c = _gqlDataCache[key]
      if (c && Date.now() - c.ts < 15000) {
        const poll = c.data?.user?.activePoll || c.data?.channel?.activePoll || null
        if (poll) {
          _refreshPollTiming(poll)
          _savePollToStorage(poll, c.data?.user?.id || _twitchChannelId)
          const isMod = c.data?.user?.self?.isModerator || _twitchIsMod
          return { poll, channelId: c.data?.user?.id || _twitchChannelId, isMod }
        }
      }
    }
    // 2. Check persistent storage (survives reloads, no 15s TTL)
    //    activePoll is persisted-query-only — no public GQL query exists
    try {
      const stored = await chrome.storage.local.get('hs_active_poll')
      const entry = stored?.hs_active_poll
      if (entry?.poll && entry.channelId === _twitchChannelId) {
        const poll = _refreshPollTiming(entry.poll)
        // Clear expired/completed polls from storage
        if (poll.status === 'COMPLETED' || poll.status === 'ARCHIVED' || poll.status === 'TERMINATED') {
          _clearPollFromStorage()
        } else {
          return { poll, channelId: entry.channelId, isMod: _twitchIsMod }
        }
      }
    } catch {}
    return { poll: null, channelId: _twitchChannelId, isMod: _twitchIsMod }
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

const POLL_FIELDS = 'id title status durationSeconds remainingDurationMilliseconds startedAt choices { id title totalVoters } totalVoters'

async function createTwitchPoll(channelId, title, durationSeconds, choices) {
  const rawQuery = 'mutation($input: CreatePollInput!) { createPoll(input: $input) { poll { ' + POLL_FIELDS + ' } error { code } } }'
  const variables = { input: { ownedBy: channelId, title, choices: choices.map(t => ({ title: t })), durationSeconds } }
  try {
    const data = await gqlMutation(rawQuery, variables)
    const result = data?.data?.createPoll
    if (result?.error) return { error: result.error.code || 'create poll failed' }
    if (data?.errors?.length) return { error: data.errors[0].message || 'create poll failed' }
    const poll = result?.poll
    if (poll) {
      _gqlDataCache['ActivePoll'] = { data: { user: { activePoll: poll, id: channelId } }, ts: Date.now() }
      _savePollToStorage(poll, channelId)
    }
    return { ok: true, poll }
  } catch (e) {
    return { error: e.message }
  }
}

async function endTwitchPoll(pollId) {
  const rawQuery = 'mutation($input: TerminatePollInput!) { terminatePoll(input: $input) { poll { ' + POLL_FIELDS + ' } } }'
  const variables = { input: { pollID: pollId } }
  try {
    const data = await gqlMutation(rawQuery, variables)
    if (data?.errors?.length) return { error: data.errors[0].message || 'end poll failed' }
    const poll = data?.data?.terminatePoll?.poll
    if (poll) {
      _gqlDataCache['ActivePoll'] = { data: { user: { activePoll: poll, id: _twitchChannelId } }, ts: Date.now() }
    }
    _clearPollFromStorage()
    return { ok: true }
  } catch (e) {
    return { error: e.message }
  }
}

let _userPollVotes = new Map() // pollId → choiceId

function renderPoll(poll, channelId, isMod) {
  const section = document.createElement('div')
  section.className = 'hs-mc-poll'
  section.dataset.pollId = poll.id
  if (channelId) section.dataset.channelId = channelId

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
    badge.textContent = t('mc_poll_ended')
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

  // Mod controls — end poll
  if (!isCompleted && isMod) {
    const modRow = document.createElement('div')
    modRow.className = 'hs-mc-poll-mod-row'
    const endBtn = document.createElement('button')
    endBtn.className = 'hs-mc-poll-mod-btn hs-mc-poll-end-btn'
    endBtn.dataset.pollId = poll.id
    endBtn.textContent = t('mc_poll_end')
    modRow.appendChild(endBtn)
    section.appendChild(modRow)
  }

  return section
}

function renderNoPoll(channelId, isMod) {
  const wrap = document.createElement('div')
  wrap.className = 'hs-mc-poll-empty'
  if (!isMod) return wrap

  const createWrap = document.createElement('div')
  createWrap.className = 'hs-mc-poll-create'
  if (channelId) createWrap.dataset.channelId = channelId

  const toggle = document.createElement('button')
  toggle.className = 'hs-mc-poll-mod-btn hs-mc-poll-create-toggle'
  toggle.textContent = t('mc_poll_new')
  createWrap.appendChild(toggle)

  const form = document.createElement('div')
  form.className = 'hs-mc-poll-create-form'
  form.style.display = 'none'

  const titleInput = document.createElement('input')
  titleInput.className = 'hs-mc-poll-create-input'
  titleInput.placeholder = t('mc_poll_question')
  titleInput.maxLength = 60
  form.appendChild(titleInput)

  for (let i = 0; i < 4; i++) {
    const opt = document.createElement('input')
    opt.className = 'hs-mc-poll-create-input hs-mc-poll-create-choice'
    opt.placeholder = t('mc_poll_choice', [String(i + 1)]) + (i < 2 ? '' : ' (' + t('mc_poll_optional') + ')')
    opt.maxLength = 25
    form.appendChild(opt)
  }

  const durRow = document.createElement('div')
  durRow.className = 'hs-mc-poll-create-dur-row'
  const durLabel = document.createElement('span')
  durLabel.className = 'hs-mc-poll-create-dur-label'
  durLabel.textContent = t('mc_pred_duration')
  durRow.appendChild(durLabel)
  for (const secs of [30, 60, 120, 300, 600, 1800]) {
    const btn = document.createElement('button')
    btn.className = 'hs-mc-poll-create-dur' + (secs === 60 ? ' hs-mc-poll-create-dur-active' : '')
    btn.dataset.secs = secs
    btn.tabIndex = -1
    btn.textContent = secs < 60 ? secs + 's' : (secs / 60) + 'm'
    durRow.appendChild(btn)
  }
  form.appendChild(durRow)

  const submitBtn = document.createElement('button')
  submitBtn.className = 'hs-mc-poll-mod-btn hs-mc-poll-create-submit'
  submitBtn.tabIndex = -1
  submitBtn.textContent = t('mc_poll_create')
  form.appendChild(submitBtn)

  createWrap.appendChild(form)
  wrap.appendChild(createWrap)
  return wrap
}

// Optimistic UI update after voting — patch DOM immediately without round-trip
function optimisticPollVoteUpdate(pollSection, choiceId) {
  if (!pollSection) return
  const choices = pollSection.querySelectorAll('.hs-mc-poll-choice')
  const metaEl = pollSection.querySelector('.hs-mc-poll-meta')
  const totalMatch = metaEl?.textContent?.match(/(\d+)/)
  const oldTotal = totalMatch ? parseInt(totalMatch[1]) : 0

  // Reconstruct per-choice vote counts from percentages
  const entries = []
  for (const choice of choices) {
    const pctEl = choice.querySelector('.hs-mc-poll-choice-pct')
    const nameEl = choice.querySelector('.hs-mc-poll-choice-name')
    const voteBtn = choice.querySelector('.hs-mc-poll-vote-btn')
    const isTarget = voteBtn?.dataset?.choiceId === choiceId
    const oldPct = pctEl ? parseInt(pctEl.textContent) : 0
    let votes = oldTotal > 0 ? Math.round((oldPct / 100) * oldTotal) : 0
    if (isTarget) votes += 1
    entries.push({ choice, votes, pctEl, nameEl, voteBtn, isTarget })
  }

  const total = entries.reduce((s, v) => s + v.votes, 0) || 1
  if (metaEl) metaEl.textContent = total + ' vote' + (total !== 1 ? 's' : '')

  for (const { choice, votes, pctEl, nameEl, voteBtn, isTarget } of entries) {
    const pct = Math.round((votes / total) * 100)
    if (pctEl) pctEl.textContent = pct + '%'
    const fill = choice.querySelector('.hs-mc-poll-choice-fill')
    if (fill) fill.style.width = pct + '%'
    if (isTarget) {
      choice.classList.add('hs-mc-poll-choice-voted')
      if (nameEl && !nameEl.querySelector('.hs-mc-poll-voted-check')) {
        const check = document.createElement('span')
        check.className = 'hs-mc-poll-voted-check'
        check.textContent = ' \u2713'
        nameEl.appendChild(check)
      }
    }
    // Remove all vote buttons (user already voted)
    if (voteBtn) voteBtn.remove()
  }
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
        if (_userPollVotes.size > 50) _userPollVotes.delete(_userPollVotes.keys().next().value)
        _userPollVotes.set(btn.dataset.pollId, btn.dataset.choiceId)
        const pollSection = btn.closest('.hs-mc-poll')
        optimisticPollVoteUpdate(pollSection, btn.dataset.choiceId)
        setTimeout(() => refreshPollSlot(), 3000)
      }
    })
  })

  // End poll (mod)
  container.querySelectorAll('.hs-mc-poll-end-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      btn.disabled = true
      btn.textContent = '...'
      const result = await endTwitchPoll(btn.dataset.pollId)
      if (result.error) {
        btn.textContent = result.error
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_poll_end'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        btn.textContent = '\u2713'
        refreshPollSlot()
      }
    })
  })

  // Create poll toggle
  container.querySelectorAll('.hs-mc-poll-create-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const form = btn.parentElement.querySelector('.hs-mc-poll-create-form')
      if (form) {
        const showing = form.style.display !== 'none'
        form.style.display = showing ? 'none' : 'flex'
        btn.textContent = showing ? t('mc_poll_new') : t('mc_pred_cancel_form')
      }
    })
  })

  // Create poll duration picker
  container.querySelectorAll('.hs-mc-poll-create-dur').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      container.querySelectorAll('.hs-mc-poll-create-dur').forEach(b => b.classList.remove('hs-mc-poll-create-dur-active'))
      btn.classList.add('hs-mc-poll-create-dur-active')
    })
  })

  // Create poll submit
  container.querySelectorAll('.hs-mc-poll-create-submit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const createWrap = btn.closest('.hs-mc-poll-create')
      const channelId = createWrap?.dataset.channelId
      if (!channelId) { btn.textContent = 'no channel'; return }
      const form = btn.closest('.hs-mc-poll-create-form')
      const inputs = form.querySelectorAll('.hs-mc-poll-create-input')
      const title = inputs[0]?.value?.trim()
      const choices = [...form.querySelectorAll('.hs-mc-poll-create-choice')].map(i => i.value.trim()).filter(Boolean)
      if (!title) { inputs[0].focus(); return }
      if (choices.length < 2) { form.querySelectorAll('.hs-mc-poll-create-choice')[choices.length]?.focus(); return }
      const durBtn = form.querySelector('.hs-mc-poll-create-dur-active')
      const secs = parseInt(durBtn?.dataset.secs || '60')
      btn.disabled = true
      btn.textContent = '...'
      const result = await createTwitchPoll(channelId, title, secs, choices)
      if (result.error) {
        const errMap = { POLL_ALREADY_ACTIVE: t('mc_error_poll_active'), FORBIDDEN: t('mc_error_no_permission'), UNAUTHORIZED: t('mc_error_not_logged_in') }
        const msg = errMap[result.error] || result.error
        btn.textContent = msg
        btn.title = result.error
        setTimeout(() => { btn.textContent = t('mc_poll_create'); btn.disabled = false; btn.title = '' }, 3000)
      } else {
        // Close create form so refreshPollSlot's guard doesn't skip
        form.style.display = 'none'
        refreshPollSlot()
      }
    })
  })

  // Create poll keyboard nav
  container.querySelectorAll('.hs-mc-poll-create-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        const inputs = [...container.querySelectorAll('.hs-mc-poll-create-input')]
        const idx = inputs.indexOf(input)
        const next = inputs[(idx + 1) % inputs.length]
        next?.focus()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        container.querySelector('.hs-mc-poll-create-submit')?.click()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        container.querySelector('.hs-mc-poll-create-toggle')?.click()
      }
    })
  })

  // Poll timers
  container.querySelectorAll('.hs-mc-poll-timer').forEach(el => {
    const endsAt = parseInt(el.dataset.ends)
    const update = () => {
      const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      if (remaining <= 0) {
        el.textContent = t('mc_poll_ended')
        el.classList.add('hs-mc-poll-status-ended')
        return
      }
      const m = Math.floor(remaining / 60)
      const s = remaining % 60
      el.textContent = m > 0 ? m + ':' + String(s).padStart(2, '0') : s + 's'
    }
    update()
    const iv = cleanup.setInterval(() => {
      if (!el.isConnected) { cleanup.clearInterval(iv); return }
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
    for (const key of ffzBadgeKeys) {
      if (key.startsWith(`${oldest}:`)) ffzBadgeKeys.delete(key);
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
      fetch(`https://api.frankerfacez.com/v1/room/${safe}`, { credentials: 'omit', signal: AbortSignal.timeout(5000) })
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
      const label = BADGE_STYLES[name]?.label || name
      return `<img class="hs-mc-badge-img" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" title="${escapeHtml(label)}" style="width:18px;height:18px;${bgStyle}">`
    }
    // Text fallback
    const style = BADGE_STYLES[name]
    if (!style) return ''
    return `<span class="hs-mc-badge" style="background:${style.bg};color:${style.fg}" title="${escapeHtml(style.label)}">${style.label}</span>`
  }).join('')
}

function renderThirdPartyBadges(userId) {
  if (!userId) return ''
  let html = ''
  const bttv = mcBttvBadgeMap.get(userId)
  if (bttv) {
    html += `<img class="hs-mc-badge-img" src="${escapeHtml(bttv.url)}" alt="${escapeHtml(bttv.description)}" title="${escapeHtml(bttv.description)}" style="width:18px;height:18px;">`
  }
  const ffzList = mcFfzBadgeMap.get(userId)
  if (ffzList) {
    for (const b of ffzList) {
      const safeColor = /^#[0-9a-fA-F]{3,8}$/.test(b.color) ? b.color : ''
      html += `<img class="hs-mc-badge-img" src="${escapeHtml(b.url)}" alt="${escapeHtml(b.title)}" title="${escapeHtml(b.title)}" style="width:18px;height:18px;${safeColor ? 'background:' + safeColor + ';border-radius:2px;' : ''}">`
    }
  }
  const cosmetic = mcUserCosmetics.get(userId)
  if (cosmetic?.badge) {
    const files = cosmetic.badge.host?.files || []
    const file = files.find(f => f.name?.endsWith('.webp')) || files.find(f => f.name?.endsWith('.avif')) || files[0]
    if (file) {
      const base = cosmetic.badge.host?.url || ''
      // 7TV returns protocol-relative URLs (//cdn.7tv.app/...) — promote to https
      // before validation so safeUrl doesn't drop them.
      const absBase = base.startsWith('//') ? 'https:' + base : base
      const rawUrl = (absBase.endsWith('/') ? absBase : absBase + '/') + file.name
      const url = safeUrl(rawUrl)
      if (url) {
        // Class includes hs-mc-7tv-badge so updateCosmeticsInPlace's dedup
        // selector finds it and doesn't insert a duplicate when the async
        // cosmetic fetch resolves after the inline render.
        html += `<img class="hs-mc-badge-img hs-mc-7tv-badge" src="${escapeHtml(url)}" alt="7TV" title="${escapeHtml(cosmetic.badge.tooltip || '7TV')}" style="width:18px;height:18px;">`
      }
    }
  }
  return html
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


// --- multichat/feed-embed.js ---
// Feed media + embed rendering for the extension home tab.
// Mirrors heatsync client/embed/embed-parser.js + renderers/media-renderer.js
// All embeds always-enabled (extension has no per-platform toggles yet).
// Uses plain iframes (no facade) — feed virtual-scrolls so visible iframe count stays low.

function sanitizeEmbedId(id) {
  if (!id || typeof id !== 'string') return ''
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

function attr(s) {
  return escapeHtml(s)
}

function ytEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-youtube">
    <iframe src="https://www.youtube-nocookie.com/embed/${id}"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"></iframe>
  </div>`
}

function twitchClipEmbed(clipId) {
  const id = sanitizeEmbedId(clipId)
  if (!id) return ''
  const parent = location.hostname || 'localhost'
  return `<div class="hs-feed-embed-container hs-feed-embed-twitch">
    <iframe src="https://clips.twitch.tv/embed?clip=${id}&parent=${encodeURIComponent(parent)}"
      allowfullscreen loading="lazy"></iframe>
  </div>`
}

function kickClipEmbed(clipId) {
  const id = sanitizeEmbedId(clipId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-kick">
    <iframe src="https://player.kick.com/clips/${id}"
      allowfullscreen scrolling="no" loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe>
  </div>`
}

function streamableEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-streamable">
    <iframe src="https://streamable.com/e/${id}" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function vimeoEmbed(videoId) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-vimeo">
    <iframe src="https://player.vimeo.com/video/${id}"
      allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function spotifyEmbed(kind, id) {
  const safeKind = (kind || '').replace(/[^a-z]/g, '')
  const safeId = sanitizeEmbedId(id)
  if (!safeKind || !safeId) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-spotify">
    <iframe src="https://open.spotify.com/embed/${safeKind}/${safeId}"
      width="100%" height="152" allow="encrypted-media" loading="lazy"></iframe>
  </div>`
}

function soundcloudEmbed(url) {
  const safe = safeUrl(url)
  if (!safe || !/^https?:\/\/(www\.|m\.)?soundcloud\.com\//i.test(safe)) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-soundcloud">
    <iframe scrolling="no"
      src="https://w.soundcloud.com/player/?url=${encodeURIComponent(safe)}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=true"
      loading="lazy"></iframe>
  </div>`
}

function giphyEmbed(gifId) {
  const id = sanitizeEmbedId(gifId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-giphy">
    <iframe src="https://giphy.com/embed/${id}" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function tenorEmbed(gifId) {
  const id = sanitizeEmbedId(gifId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-tenor">
    <iframe src="https://tenor.com/embed/${id}" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function twitterEmbed(tweetId, url) {
  const id = sanitizeEmbedId(tweetId)
  if (!id) return ''
  // platform.twitter.com/embed/Tweet.html renders the tweet in an iframe with no
  // widgets.js needed (script tags injected via innerHTML never execute, so the
  // blockquote+script approach the website uses is broken in extension context).
  return `<div class="hs-feed-embed-container hs-feed-embed-twitter">
    <iframe src="https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true"
      allow="autoplay; clipboard-write" allowfullscreen loading="lazy"></iframe>
  </div>`
}

function imgurEmbed(imgurId) {
  const id = sanitizeEmbedId(imgurId)
  if (!id) return ''
  // Imgur embed needs script — fall back to direct image link approach
  return `<div class="hs-feed-embed-container hs-feed-embed-imgur" style="aspect-ratio:auto;max-width:480px">
    <a href="https://imgur.com/${id}" target="_blank" rel="noopener">
      <img src="https://i.imgur.com/${id}.jpg" alt="imgur"
        style="max-width:100%;height:auto;display:block"
        onerror="this.style.display='none'">
    </a>
  </div>`
}

function tiktokEmbed(videoId, url) {
  const id = sanitizeEmbedId(videoId)
  if (!id) return ''
  return `<div class="hs-feed-embed-container hs-feed-embed-tiktok">
    <iframe src="https://www.tiktok.com/embed/v2/${id}"
      allowfullscreen scrolling="no" loading="lazy"></iframe>
  </div>`
}

function redditEmbed(url) {
  const safe = safeUrl(url)
  if (!safe) return ''
  // Reddit blocks iframe embedding from arbitrary parents — show as link card.
  return `<div class="hs-feed-link-card">
    <a href="${attr(safe)}" target="_blank" rel="noopener" class="hs-feed-link-card-link">
      <span class="hs-feed-link-card-icon">[reddit]</span>
      <span class="hs-feed-link-card-url">${attr(safe.length > 60 ? safe.slice(0, 60) + '...' : safe)}</span>
    </a>
  </div>`
}

function instagramEmbed(url) {
  const safe = safeUrl(url)
  if (!safe) return ''
  return `<div class="hs-feed-link-card">
    <a href="${attr(safe)}" target="_blank" rel="noopener" class="hs-feed-link-card-link">
      <span class="hs-feed-link-card-icon">[ig]</span>
      <span class="hs-feed-link-card-url">${attr(safe.length > 60 ? safe.slice(0, 60) + '...' : safe)}</span>
    </a>
  </div>`
}

function vimeoUrlEmbed(url) {
  const m = url.match(/vimeo\.com\/(\d+)/)
  if (!m) return ''
  return vimeoEmbed(m[1])
}

// Convert a single URL → embed HTML, or '' if not embeddable
function parseFeedEmbed(url) {
  if (!url || typeof url !== 'string') return ''
  const cleanUrl = url.replace(/[.,;!?]+$/, '')

  // YouTube
  if (cleanUrl.includes('youtube.com/watch?v=') || cleanUrl.includes('youtu.be/')) {
    let videoId
    if (cleanUrl.includes('youtube.com/watch?v=')) {
      videoId = cleanUrl.split('v=')[1].split('&')[0]
    } else {
      videoId = cleanUrl.split('youtu.be/')[1].split('?')[0]
    }
    return ytEmbed(videoId)
  }

  // Twitch clips (clips.twitch.tv/...)
  if (cleanUrl.includes('clips.twitch.tv/')) {
    const clipId = cleanUrl.split('clips.twitch.tv/')[1].split(/[?#]/)[0]
    return twitchClipEmbed(clipId)
  }

  // Twitch clips alt format (twitch.tv/user/clip/id)
  if (cleanUrl.includes('twitch.tv/') && cleanUrl.includes('/clip/')) {
    const clipId = cleanUrl.split('/clip/')[1].split(/[?#]/)[0]
    return twitchClipEmbed(clipId)
  }

  // Kick clips
  if (cleanUrl.includes('kick.com/') && cleanUrl.includes('/clips/')) {
    const m = cleanUrl.match(/clips\/([a-zA-Z0-9_-]+)/)
    if (m) return kickClipEmbed(m[1])
  }

  // Streamable
  if (cleanUrl.includes('streamable.com/')) {
    const videoId = cleanUrl.split('streamable.com/')[1].split(/[?#]/)[0]
    if (videoId && !videoId.startsWith('test')) return streamableEmbed(videoId)
  }

  // Vimeo
  if (cleanUrl.includes('vimeo.com/')) {
    const m = cleanUrl.match(/vimeo\.com\/(\d+)/)
    if (m) return vimeoEmbed(m[1])
  }

  // Spotify
  if (cleanUrl.includes('open.spotify.com/')) {
    const parts = cleanUrl.split('spotify.com/')[1].split('/')
    const kind = parts[0]
    const id = parts[1]?.split('?')[0]
    if (kind && id) return spotifyEmbed(kind, id)
  }

  // SoundCloud
  if (cleanUrl.includes('soundcloud.com/')) {
    return soundcloudEmbed(cleanUrl)
  }

  // Twitter/X
  if (cleanUrl.includes('twitter.com/') || cleanUrl.includes('x.com/')) {
    const m = cleanUrl.match(/status\/(\d+)/)
    if (m) return twitterEmbed(m[1], cleanUrl)
  }

  // Giphy (gif page)
  if (cleanUrl.includes('giphy.com/gifs/')) {
    const m = cleanUrl.match(/gifs\/(?:.*-)?([a-zA-Z0-9]+)$/)
    if (m) return giphyEmbed(m[1])
  }

  // Tenor
  if (cleanUrl.includes('tenor.com/view/')) {
    const m = cleanUrl.match(/view\/.*-(\d+)$/)
    if (m) return tenorEmbed(m[1])
  }

  // TikTok
  if (cleanUrl.includes('tiktok.com/') && cleanUrl.includes('/video/')) {
    const m = cleanUrl.match(/video\/(\d+)/)
    if (m) return tiktokEmbed(m[1], cleanUrl)
  }

  // Imgur
  if (cleanUrl.includes('imgur.com/')) {
    const m = cleanUrl.match(/imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)/)
    if (m) return imgurEmbed(m[1])
  }

  // Reddit
  if (cleanUrl.includes('reddit.com/r/')) {
    return redditEmbed(cleanUrl)
  }

  // Instagram
  if (cleanUrl.includes('instagram.com/p/') || cleanUrl.includes('instagram.com/reel/')) {
    return instagramEmbed(cleanUrl)
  }

  // Direct media files
  if (/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(cleanUrl)) {
    const safe = safeUrl(cleanUrl)
    if (!safe) return ''
    return `<div class="hs-feed-media-direct">
      <img src="${attr(safe)}" alt=""
        onerror="this.outerHTML='<div class=\\'hs-feed-media-deleted\\'>image unavailable</div>'">
    </div>`
  }
  if (/\.(mp4|webm|mov)(\?.*)?$/i.test(cleanUrl)) {
    const safe = safeUrl(cleanUrl)
    if (!safe) return ''
    return `<div class="hs-feed-media-direct">
      <video controls muted preload="metadata" src="${attr(safe)}"></video>
    </div>`
  }

  return ''
}

// Extract first embeddable URL from message content (OP only, mirrors website)
function extractFeedEmbed(content) {
  if (!content || typeof content !== 'string') return ''
  // Same priority order as website _extractEmbed
  const priorityPatterns = [
    /https?:\/\/(?:www\.)?streamable\.com\/\w+/,
    /https?:\/\/(?:www\.)?youtu(?:\.be\/|be\.com\/watch\?v=)[\w-]+/,
    /https?:\/\/clips\.twitch\.tv\/[\w-]+/,
    /https?:\/\/(?:www\.)?twitch\.tv\/[\w_]+\/clip\/[\w-]+/,
    /https?:\/\/kick\.com\/[\w_-]+\/clips\/[\w-]+/,
    /https?:\/\/open\.spotify\.com\/(?:track|album|playlist)\/\w+/,
    /https?:\/\/(?:www\.)?vimeo\.com\/\d+/,
    /https?:\/\/(?:www\.)?giphy\.com\/gifs\/[\w-]+/,
    /https?:\/\/(?:www\.)?tenor\.com\/view\/[\w-]+-\d+/,
    /https?:\/\/(?:www\.)?tiktok\.com\/[@\w.]+\/video\/\d+/,
    /https?:\/\/(?:www\.)?imgur\.com\/(?:a\/|gallery\/)?[a-zA-Z0-9]+/,
    /https?:\/\/(?:twitter|x)\.com\/[\w_]+\/status\/\d+/,
    /https?:\/\/(?:www\.)?reddit\.com\/r\/\w+\/[\w/]+/,
    /https?:\/\/(?:www\.|m\.)?soundcloud\.com\/[\w-]+\/[\w-]+/,
    /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[\w-]+/,
    /https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|mp4|webm|mov)(?:\?[^\s]*)?/i,
  ]

  for (const p of priorityPatterns) {
    const m = content.match(p)
    if (m) {
      const html = parseFeedEmbed(m[0])
      if (html) return html
    }
  }
  return ''
}

// Main entry: build full media HTML for a feed message.
// Handles direct uploads (image/video), multi-image (media[]), and content-extracted embeds.
function buildFeedMediaHtml(m) {
  if (!m) return ''
  const isReply = !!m.reply_to
  const mediaUrl = m.media_url
  const mediaType = m.media_type
  const mediaArr = Array.isArray(m.media) ? m.media : []

  // Multi-item media (uploads)
  if (mediaArr.length > 1) {
    const items = mediaArr.map(med => {
      const url = safeUrl(med.url)
      if (!url) return ''
      if (med.type === 'video') {
        return `<video controls muted preload="metadata" src="${attr(url)}" class="hs-feed-media-item"></video>`
      }
      return `<img src="${attr(url)}" alt="" class="hs-feed-media-item">`
    }).filter(Boolean).join('')
    if (items) return `<div class="hs-feed-media hs-feed-media-multi">${items}</div>`
  }

  // Single direct upload
  if (mediaUrl) {
    const safe = safeUrl(mediaUrl)
    if (!safe) return ''

    const isVideo = mediaType === 'video' || (mediaType || '').startsWith('video/')
    const isEmbedType = mediaType === 'embed' ||
      /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|twitch\.tv|clips\.twitch\.tv|streamable\.com|vimeo\.com|twitter\.com|x\.com|kick\.com|tiktok\.com|open\.spotify\.com|soundcloud\.com|giphy\.com|tenor\.com|imgur\.com|reddit\.com|instagram\.com)/i.test(safe)
    const isImage = mediaType === 'image' || /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(safe)

    if (isEmbedType) {
      const embedHtml = parseFeedEmbed(safe)
      if (embedHtml) return `<div class="hs-feed-media">${embedHtml}</div>`
    }

    if (isVideo) {
      return `<div class="hs-feed-media"><video controls muted preload="metadata" src="${attr(safe)}"></video></div>`
    }

    if (isImage) {
      return `<div class="hs-feed-media"><img src="${attr(safe)}" alt="" class="hs-feed-media-img"></div>`
    }

    return ''
  }

  // No direct media — for OPs, scan content for embeddable URL
  if (!isReply && m.content) {
    const embedHtml = extractFeedEmbed(m.content)
    if (embedHtml) return `<div class="hs-feed-media">${embedHtml}</div>`
  }

  return ''
}


// --- multichat/social.js ---
// Social - feed, notifications, activity, heatsync API
let _autoYtVideoId = null  // videoId for this tab's __live_yt_auto__ subscription (cross-tab filter)

// Heat tier display — big scaling numbers + color glow + row effects, no emoji
// Matches website colors.js: #444 → #888 → #cc6600 → #ff8700 → #ffaa33 → #fff
function formatHeat(heat) {
  if (heat >= 1000) {
    const k = heat / 1000
    const f = k.toFixed(1)
    return f.endsWith('.0') ? f.slice(0, -2) + 'k' : f + 'k'
  }
  return String(heat)
}

function getHeatNumberStyle(heat, isReply) {
  let fontSize, color, textShadow, animation
  if (isReply) {
    if (heat > 500) fontSize = 20
    else if (heat > 100) fontSize = 18
    else if (heat > 50) fontSize = 16
    else if (heat > 10) fontSize = 14
    else fontSize = 12
  } else {
    if (heat > 500) fontSize = 32
    else if (heat > 100) fontSize = 26
    else if (heat > 50) fontSize = 22
    else if (heat > 10) fontSize = 18
    else fontSize = 14
  }
  if (heat > 500) {
    color = '#fff'
    textShadow = '0 0 6px rgba(255,255,255,1),0 0 15px rgba(255,200,100,1),0 0 30px rgba(255,135,0,0.9),0 0 50px rgba(255,80,0,0.6)'
    animation = 'hs-heat-breathe 2s ease-in-out infinite'
  } else if (heat > 100) {
    color = '#ffaa33'
    textShadow = '0 0 6px rgba(255,170,50,0.9),0 0 16px rgba(255,135,0,0.6),0 0 30px rgba(255,80,0,0.3)'
  } else if (heat > 50) {
    color = '#ff8700'
    textShadow = '0 0 6px rgba(255,135,0,0.7),0 0 14px rgba(255,135,0,0.3)'
  } else if (heat > 10) {
    color = heat > 30 ? '#cc6600' : '#888'
    textShadow = heat > 30 ? '0 0 4px rgba(204,102,0,0.3)' : undefined
  } else {
    color = '#444'
    textShadow = undefined
  }
  let style = `font-size:${fontSize}px;color:${color};font-weight:900;line-height:1;`
  if (textShadow) style += `text-shadow:${textShadow};`
  if (animation) style += `animation:${animation};`
  return style
}

function getHeatDisplay(heat) {
  if (!heat || heat <= 0) return null
  let border = '#444', borderWidth = 2, bg = ''
  if (heat >= 500) {
    border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'
  } else if (heat >= 100) {
    border = '#ffaa33'; borderWidth = 3
    bg = 'rgba(50,15,0,0.10)'
  } else if (heat >= 25) {
    border = '#ff8700'; borderWidth = 3
    bg = 'rgba(40,12,0,0.07)'
  } else if (heat >= 10) {
    border = '#ff8700'; borderWidth = 2
  } else {
    border = '#444'; borderWidth = 2
  }
  const suffix = heat >= 10 ? '°' : ''
  const breathe = heat >= 500
  return { suffix, border, borderWidth, bg, breathe }
}

// Feed & notifications state
let feedMessages = [];
let feedLoaded = false;
let feedLoading = false;
let feedPage = 1;
let feedHasMore = true;
let feedLastFetch = 0; // Timestamp of last feed fetch
const FEED_STALE_MS = 120000; // 2 minutes

// Virtual scroll state for feed
let _feedVirtualScrollHandler = null  // current scroll listener ref
let _feedVirtualResizeObserver = null // ResizeObserver on msgsEl
let _feedVirtualItemHeight = 32       // estimated item height (px), recalibrated after first render — tighter than before
let _feedVirtualScrollRaf = 0         // rAF handle for scroll debounce
let _feedVirtualLastStart = -1        // last rendered window start
let _feedVirtualLastEnd = -1          // last rendered window end
const FEED_VIRTUAL_OVERSCAN = 5       // extra items above/below visible window

// Engagement state — optimistic local cache
const feedLiked = new Set()     // base36_ids the user has liked
const feedBookmarked = new Set() // base36_ids the user has bookmarked
const feedReactionsCache = new Map() // base36_id → [{ emote_id, emote_url, emote_name, count, user_reacted }]
// Cap to prevent long-session unbounded growth; evict oldest insert when full.
const FEED_ENGAGE_CAP = 2000
function _capFeedEngage() {
  while (feedLiked.size > FEED_ENGAGE_CAP) feedLiked.delete(feedLiked.values().next().value)
  while (feedBookmarked.size > FEED_ENGAGE_CAP) feedBookmarked.delete(feedBookmarked.values().next().value)
  while (feedReactionsCache.size > FEED_ENGAGE_CAP) feedReactionsCache.delete(feedReactionsCache.keys().next().value)
}
// Stream events injected inline into per-channel buffers (no dedicated tab)
const activityEvents = [];
const ACTIVITY_EVENTS_MAX = 500;
function pushActivityEvent(evt) {
  if (activityEvents.some(m => m.text === evt.text)) return
  activityEvents.push(evt)
  if (activityEvents.length > ACTIVITY_EVENTS_MAX) activityEvents.splice(0, activityEvents.length - ACTIVITY_EVENTS_MAX)
}
let activeThread = null // { id, op, replies[] } — when set, feed shows thread view
let replyState = null; // { msgId, user, channel } when replying to a message
let hsAuthToken = null; // Heatsync auth state (loaded from storage)
let hsCurrentUsername = null; // Heatsync username (loaded from storage user_info)
let hsCurrentUserId = null; // Heatsync numeric user id (for reaction matching)

// Load + watch heatsync username for own-post detection (edit/delete UI)
async function loadHsUsername() {
  try {
    const data = await api.storage.local.get('user_info')
    const ui = data?.user_info
    hsCurrentUsername = ui?.username?.toLowerCase() || null
    hsCurrentUserId = ui?.id ? String(ui.id) : null
    // Cross-platform mention aliases: any name across Twitch/Kick/YT counts as
    // a mention of the user, even if the chat is on a different platform.
    mentionAliases = new Set()
    if (ui?.kick_username) mentionAliases.add(ui.kick_username.toLowerCase())
    if (ui?.youtube_username) mentionAliases.add(ui.youtube_username.toLowerCase())
    if (ui?.twitch_username) mentionAliases.add(ui.twitch_username.toLowerCase())
  } catch (e) { hsCurrentUsername = null; hsCurrentUserId = null }
}
function isOwnFeedPost(m) {
  return !!(hsCurrentUsername && m?.username && m.username.toLowerCase() === hsCurrentUsername)
}

const EDIT_WINDOW_MS = 10 * 60 * 1000 // 10 min — server enforces

// Inline edit UI for own feed posts
function showFeedEditUI(div, msg) {
  if (div.querySelector('.hs-feed-edit-form')) return
  const body = div.querySelector('.hs-feed-body')
  if (!body) return
  const original = msg.content || ''
  const form = document.createElement('div')
  form.className = 'hs-feed-edit-form'
  form.style.cssText = 'display:flex;gap:4px;align-items:flex-start;margin-top:4px;'
  const ta = document.createElement('textarea')
  ta.value = original
  ta.maxLength = 500
  ta.rows = 2
  ta.style.cssText = 'flex:1;background:#000;color:#fff;border:1px solid #808080;padding:4px;font-family:inherit;font-size:13px;resize:vertical;'
  const saveBtn = document.createElement('button')
  saveBtn.textContent = 'save'
  saveBtn.style.cssText = 'background:#ff8700;color:#000;border:none;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer;'
  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'cancel'
  cancelBtn.style.cssText = 'background:#000;color:#fff;border:1px solid #808080;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer;'
  const errEl = document.createElement('div')
  errEl.style.cssText = 'font-size:11px;color:#ff4444;margin-top:2px;'
  form.append(ta, saveBtn, cancelBtn)
  body.style.display = 'none'
  body.parentNode.insertBefore(form, body.nextSibling)
  body.parentNode.insertBefore(errEl, form.nextSibling)
  ta.focus()
  ta.select()

  const close = () => {
    body.style.display = ''
    form.remove()
    errEl.remove()
  }
  cancelBtn.addEventListener('click', close)
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveBtn.click() }
  })
  saveBtn.addEventListener('click', async () => {
    const newContent = ta.value.trim()
    if (!newContent) { errEl.textContent = 'content cannot be empty'; return }
    if (newContent === original) { close(); return }
    saveBtn.disabled = true
    saveBtn.textContent = 'saving...'
    errEl.textContent = ''
    const resp = await apiFetch(`/api/messages/${encodeURIComponent(msg.base36_id)}`, {
      method: 'PATCH',
      body: { content: newContent }
    })
    if (resp?.ok && resp.data?.success) {
      msg.content = resp.data.message?.content || newContent
      msg.edited_at = resp.data.message?.edited_at
      msg.edit_count = resp.data.message?.edit_count
      close()
      // Re-render entire feed to pick up sanitized content + emote refs
      if (typeof renderFeed === 'function') renderFeed()
    } else {
      errEl.textContent = resp?.data?.error || resp?.error || 'edit failed'
      saveBtn.disabled = false
      saveBtn.textContent = 'save'
    }
  })
}

async function deleteFeedPost(msg) {
  if (!confirm('delete this post?')) return
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msg.base36_id)}`, {
    method: 'DELETE'
  })
  if (resp?.ok) {
    const div = document.querySelector(`.hs-feed-msg[data-msg-id="${CSS.escape(msg.base36_id)}"]`)
    if (div) div.remove()
    const idx = feedMessages.findIndex(m => m.base36_id === msg.base36_id)
    if (idx >= 0) feedMessages.splice(idx, 1)
  }
}

function showFeedPostContextMenu(e, div, msg) {
  e.preventDefault()
  e.stopPropagation()
  document.getElementById('hs-mc-ctx-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'hs-mc-ctx-menu'
  menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #808080;border-radius:0;padding:4px 0;min-width:120px;font-size:12px;font-family:inherit;'

  const createdAt = new Date(msg.created_at).getTime()
  const elapsed = Date.now() - createdAt
  const remaining = EDIT_WINDOW_MS - elapsed
  const canEdit = remaining > 0

  const mkItem = (label, color, fn, disabled) => {
    const item = document.createElement('div')
    item.textContent = label
    item.style.cssText = `padding:6px 12px;cursor:${disabled ? 'not-allowed' : 'pointer'};color:${color};opacity:${disabled ? 0.5 : 1};`
    if (!disabled) {
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)')
      item.addEventListener('mouseleave', () => item.style.background = '')
      item.addEventListener('click', () => { menu.remove(); fn() })
    }
    menu.appendChild(item)
  }

  if (canEdit) {
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    mkItem(`edit (${mins}:${String(secs).padStart(2, '0')} left)`, '#fff', () => showFeedEditUI(div, msg))
  } else {
    mkItem('edit (window expired)', '#fff', () => {}, true)
  }
  mkItem('delete', '#ff4444', () => deleteFeedPost(msg))

  document.body.appendChild(menu)
  const mw = menu.offsetWidth, mh = menu.offsetHeight
  menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px'
  menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px'
  const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss) } }
  setTimeout(() => document.addEventListener('click', dismiss, { signal: mcSignal }), 0)
}

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
  loadHsUsername()

  // Watch for auth changes (login/logout on heatsync.org)
  if (!window._hsMcAuthWatcher) {
    window._hsMcAuthWatcher = true;
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.user_info) {
        const ui = changes.user_info.newValue
        hsCurrentUsername = ui?.username?.toLowerCase() || null
        hsCurrentUserId = ui?.id ? String(ui.id) : null
        mentionAliases = new Set()
        if (ui?.kick_username) mentionAliases.add(ui.kick_username.toLowerCase())
        if (ui?.youtube_username) mentionAliases.add(ui.youtube_username.toLowerCase())
        if (ui?.twitch_username) mentionAliases.add(ui.twitch_username.toLowerCase())
      }
      if (changes.auth_token_encrypted || changes.auth_token) {
        const wasAuthed = hsAuthToken;
        hsAuthToken = !!(
          changes.auth_token_encrypted?.newValue ||
          changes.auth_token?.newValue
        );
        if (wasAuthed !== hsAuthToken) {
          log('Auth state changed:', hsAuthToken ? 'logged in' : 'logged out');
          // On login, replay any whispers that failed with auth errors so the
          // user doesn't have to manually retry each one.
          if (!wasAuthed && hsAuthToken && typeof retryAuthFailedWhispers === 'function') {
            retryAuthFailedWhispers();
          }
          // Reset feed/discover/pinned data on auth change so the next
          // tab open re-fetches with new auth.
          feedLoaded = false;
          feedMessages = [];
          discoverLoaded = false;
          discoverLoading = false;
          discoverTags = [];
          discoverProfiles = [];
          pinnedLoaded = false;
          pinnedLoading = false;
          pinnedMessages = [];
          feedLiked.clear();
          feedBookmarked.clear();
          feedReactionsCache.clear();
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
      // Server-pushed Twitch whispers must route through handleIncomingWhisper
      // so the dedup key (whisper_id) matches the EventSub path. Using
      // handleIncomingDm here would produce a second timeline entry because
      // its dedup checks data.id (hs db row) != eventsub entry's id (whisper_id).
      if (msg.data.platform === 'twitch') {
        handleIncomingWhisper({
          user: msg.data.from_display_name || msg.data.from_twitch_login || 'unknown',
          userId: msg.data.from_twitch_id,
          text: msg.data.content,
          color: msg.data.from_color || '#fff',
          time: msg.data.created_at ? new Date(msg.data.created_at).getTime() : Date.now(),
          id: msg.data.external_message_id || msg.data.id || '',
        })
      } else {
        handleIncomingDm(msg.data)
      }
    }
    if (msg.type === 'message-edited' && msg.data) {
      const d = msg.data.message_id ? msg.data : msg.data.data
      const id = d?.message_id
      if (!id) return
      // Update feedMessages buffer
      const found = feedMessages.find(m => m.base36_id === id)
      if (found) {
        found.content = d.content
        found.subject = d.subject
        found.edited_at = d.edited_at
        found.edit_count = d.edit_count
      }
      // Update active thread if applicable
      if (activeThread) {
        if (activeThread.op?.base36_id === id) {
          activeThread.op.content = d.content
          activeThread.op.subject = d.subject
          activeThread.op.edited_at = d.edited_at
        }
        const reply = activeThread.replies?.find(r => r.base36_id === id)
        if (reply) {
          reply.content = d.content
          reply.edited_at = d.edited_at
        }
      }
      if (currentTab === 'feed') renderFeed()
    }
    if (msg.type === 'message-deleted' && msg.data) {
      const d = msg.data.message_id ? msg.data : msg.data.data
      const id = d?.message_id
      if (!id) return
      const idx = feedMessages.findIndex(m => m.base36_id === id)
      if (idx >= 0) feedMessages.splice(idx, 1)
      if (activeThread) {
        if (activeThread.op?.base36_id === id) {
          activeThread = null
        } else if (activeThread.replies) {
          const ri = activeThread.replies.findIndex(r => r.base36_id === id)
          if (ri >= 0) activeThread.replies.splice(ri, 1)
        }
      }
      if (currentTab === 'feed') renderFeed()
    }
    if (msg.type === 'youtube_chat_message') {
      const targetChannelId = msg.channelId
      // Filter __live_yt_auto__ messages: only accept if videoId matches this tab's subscription
      // (prevents cross-tab leaking — e.g., lofigirl YouTube showing on a Twitch tab)
      if (targetChannelId === '__live_yt_auto__') {
        if (!_autoYtVideoId) return  // no confirmed subscription yet — reject
        if (msg.videoId && msg.videoId !== _autoYtVideoId) return  // wrong video
      }
      // Dedup against message buffer (survives WS reconnects unlike 5s hash)
      if (targetChannelId && isYtDuplicate(msg.user, msg.text, targetChannelId)) return

      // Resolve a Twitch-channel name for emote lookup. YT-relayed messages
      // belong to a streamer who likely also has Twitch/Kick channel emotes
      // (BTTV/FFZ/7TV) configured under their Twitch handle. Without this
      // hint, processEmotes only sees globals + the user's heatsync inventory,
      // missing per-channel emotes for the linked streamer.
      let ytChannelHint = null
      if (targetChannelId && targetChannelId !== '__live_yt_auto__') {
        const linkedCh = config.channels.find(c => typeof c !== 'string' && c.id === targetChannelId)
        if (linkedCh) ytChannelHint = linkedCh.twitch || linkedCh.kick || null
      }

      const ytMsg = {
        user: msg.user,
        text: msg.text,
        color: msg.color || '#ff0000',
        channel: ytChannelHint || 'youtube',
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

      // Same pipeline as Twitch/Kick handlers: automod → mention → stats
      if (ytMsg.user?.toLowerCase() !== currentUsername?.toLowerCase() && shouldAutomod(ytMsg.text)) return
      const isMent = isMention(ytMsg)
      bumpStreamStats(ytMsg.channel, ytMsg, isMent)
      if (isMent) {
        mentionsBuffer.push(ytMsg)
        if (mentionsBuffer.length > MAX_BUFFER + 50) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER)
        notifyMention(ytMsg)
        if (currentTab === 'mentions') {
          mentionsSeenCount = mentionsBuffer.length
          if (!appendMessage(ytMsg, 'mentions')) renderMessages('mentions')
        } else {
          updateTabIndicator('mentions')
        }
      }

      if (targetChannelId && targetChannelId !== 'global') {
        // Auto-YouTube for live tab
        if (targetChannelId === '__live_yt_auto__') {
          if (!channelYtMessages.has(targetChannelId)) channelYtMessages.set(targetChannelId, [])
          const buf = channelYtMessages.get(targetChannelId)
          buf.push(ytMsg)
          if (buf.length > MAX_BUFFER + 50) buf.splice(0, buf.length - MAX_BUFFER)
          if (currentTab === 'live') {
            appendMessage(ytMsg, 'live') || renderMessages('live')
          } else {
            updateTabIndicator('live')
          }
        } else {
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
          // YT-only channel tabs: light up the live dot when traffic flows in.
          // updateLiveStatus() only checks Twitch helix, so without this
          // signal the dot stays dark even on a busy YT-only channel.
          try {
            const tabEl = document.querySelector(`#hs-mc-tabbar .hs-mc-tab[data-tab="${CSS.escape(targetChannelId)}"]`)
            if (tabEl && tabEl.dataset.live !== 'true') tabEl.dataset.live = 'true'
          } catch {}
        }
      }
    }
    if (msg.type === 'youtube_msg_deleted') {
      // Mark all rendered messages from this user (for the matching channel)
      // as cleared so they get the dim+strikethrough treatment that Twitch/Kick
      // moderator deletions already get.
      const u = (msg.user || '').toLowerCase()
      if (!u) return
      const msgsEl = document.getElementById('hs-mc-messages')
      if (msgsEl) {
        msgsEl.querySelectorAll('.hs-mc-msg[data-platform="yt"], .hs-mc-msg[data-platform="youtube"]').forEach(div => {
          const a = div.querySelector('.hs-mc-user')
          if (a && a.dataset.username === u) div.classList.add('hs-mc-msg-cleared')
        })
      }
      // Also flag in buffers so re-renders preserve the dim state
      const flagBuf = (buf) => {
        if (!Array.isArray(buf)) return
        for (let i = buf.length - 1; i >= 0; i--) {
          const m = buf[i]
          if (m.platform === 'youtube' && m.user?.toLowerCase() === u) {
            m.cleared = true
            m._renderedHtml = null  // force re-render with cleared class next time
          }
        }
      }
      channelYtMessages.forEach(buf => flagBuf(buf))
      flagBuf(mentionsBuffer)
    }
    if (msg.type === 'youtube_status') {
      const targetChannelId = msg.channelId
      // Track auto-YouTube videoId for cross-tab filtering
      if (targetChannelId === '__live_yt_auto__' && msg.status === 'connected' && msg.videoId) {
        _autoYtVideoId = msg.videoId
        log('Auto YouTube videoId:', msg.videoId)
      }
      if (targetChannelId && targetChannelId !== 'global') {
        // Per-channel YouTube status
        const link = youtubeLinks.get(targetChannelId) || { url: '', videoId: '', channelName: '' }
        if (msg.status === 'connected') {
          link.videoId = msg.videoId || ''
          link.channelName = msg.channelName || ''
          youtubeLinks.set(targetChannelId, link)
          log('YouTube connected for channel', targetChannelId, ':', link.channelName)
        }
        // Reflect status onto the channel tab button so YT-only channels get a
        // live dot and a human-readable label (otherwise YT-only tabs sit dark
        // forever and show the auto-generated yt-<timestamp> id).
        if (targetChannelId !== '__live_yt_auto__') {
          const tabEl = document.querySelector(`#hs-mc-tabbar .hs-mc-tab[data-tab="${CSS.escape(targetChannelId)}"]`)
          if (tabEl) {
            if (msg.status === 'connected') {
              tabEl.dataset.live = 'true'
              const ch = config.channels.find(c => typeof c !== 'string' && c.id === targetChannelId)
              const isYtOnly = ch && !ch.twitch && !ch.kick && ch.youtube
              if (isYtOnly && link.channelName && tabEl.textContent !== link.channelName) {
                tabEl.textContent = link.channelName
              }
            } else if (msg.status === 'ended' || msg.status === 'error') {
              tabEl.dataset.live = 'false'
            }
          }
        }
        // Show status in channel tab if viewing it. Dedup on a stable marker so
        // repeated youtube_status events (every WS reconnect, every retry) don't
        // append a fresh notice each time — that's what made the panel flicker:
        // notice appears, real messages push it out via trimChildren cap, next
        // event re-appends, cycle repeats.
        // Show the connect/end notice on the right tab — both per-channel
        // tabs AND the live tab (when this is the auto subscription).
        const isAutoForLive = targetChannelId === '__live_yt_auto__' && currentTab === 'live'
        if (currentTab === targetChannelId || isAutoForLive) {
          const msgsEl = document.getElementById('hs-mc-messages')
          const upsertNotice = (text, color) => {
            if (!msgsEl) return
            // Remove any existing yt-status notice — there should be at most one,
            // showing the latest state.
            for (const el of msgsEl.querySelectorAll('.hs-mc-empty[data-hs-yt-status]')) el.remove()
            const el = document.createElement('div')
            el.className = 'hs-mc-empty'
            el.dataset.hsYtStatus = '1'
            // Tag with the tab id this notice belongs to so renderMessages can
            // drop it on tab switch (otherwise the YT-offline notice from one
            // channel follows the user to other tabs and looks like a bug:
            // "stream is live, why does it say not live?").
            el.dataset.hsYtStatusTab = String(targetChannelId)
            el.textContent = text
            if (color) el.style.color = color
            msgsEl.appendChild(el)
            trimChildren(msgsEl, 150)
          }
          if (msg.status === 'connected') {
            // Drop any stale ended/error notice now that we're live; only show the
            // "waiting" placeholder if there really are no messages yet.
            if (msgsEl) {
              for (const el of msgsEl.querySelectorAll('.hs-mc-empty[data-hs-yt-status]')) el.remove()
              if (!(channelYtMessages.get(targetChannelId)?.length)) {
                upsertNotice('youtube connected: ' + (link.channelName || msg.videoId) + ' — waiting for messages...')
              }
            }
          } else if (msg.status === 'ended' || msg.status === 'error') {
            // Drop noise: rate-limit (transient ws-handler 5/min/socket) and
            // "stream not currently live / chat disabled" — the latter is the
            // expected state when the user added a YT URL but the streamer
            // isn't on YT right now, so showing it on every refresh is just
            // clutter at the bottom of chat.
            const errText = msg.error || ''
            const isNoise = msg.status === 'error' && (
              /too many requests/i.test(errText) ||
              /not currently live/i.test(errText) ||
              /chat is disabled/i.test(errText)
            )
            if (!isNoise) {
              // Always prefix with "youtube:" — without it, error text looks
              // like it's about whatever stream the user is watching, not
              // the YouTube subscription that actually failed.
              upsertNotice(
                msg.status === 'ended' ? 'youtube: stream ended' : `youtube: ${errText || 'connection error'}`,
                '#ff4444'
              )
            }
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
  });
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
        msgsEl.innerHTML = `<div class="hs-mc-empty">${resp.status === 401 ? t('mc_social_failed_feed_auth') : t('mc_social_failed_feed')}</div>`;
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
  // Async: check bookmark state for loaded messages (non-blocking)
  const ids = msgs.map(msg => msg.base36_id).filter(Boolean)
  checkFeedBookmarks(ids)
}

// Tear down virtual scroll state (called before re-setup or when leaving feed)
function _feedVirtualTeardown(msgsEl) {
  if (_feedVirtualScrollHandler && msgsEl) {
    msgsEl.removeEventListener('scroll', _feedVirtualScrollHandler)
  }
  _feedVirtualScrollHandler = null
  if (_feedVirtualResizeObserver) {
    cleanup.untrackObserver(_feedVirtualResizeObserver)
    _feedVirtualResizeObserver = null
  }
  if (_feedVirtualScrollRaf) {
    cancelAnimationFrame(_feedVirtualScrollRaf)
    _feedVirtualScrollRaf = 0
  }
  _feedVirtualLastStart = -1
  _feedVirtualLastEnd = -1
  // Reset item height — calibration from the previous session may not match
  // the new content (e.g. switching feed tab after thread expand changes heights)
  _feedVirtualItemHeight = 32
}

// Render only the visible slice of feedMessages into the virtual container.
// virtualContainer is absolutely positioned inside msgsEl; spacer sets scrollHeight.
function _feedVirtualRenderWindow(msgsEl, virtualContainer, items) {
  const scrollTop = msgsEl.scrollTop
  const viewHeight = msgsEl.clientHeight
  const h = _feedVirtualItemHeight

  const startIdx = Math.max(0, Math.floor(scrollTop / h) - FEED_VIRTUAL_OVERSCAN)
  const endIdx = Math.min(items.length, Math.ceil((scrollTop + viewHeight) / h) + FEED_VIRTUAL_OVERSCAN)

  // Skip identical window to avoid DOM thrashing
  if (startIdx === _feedVirtualLastStart && endIdx === _feedVirtualLastEnd) return
  _feedVirtualLastStart = startIdx
  _feedVirtualLastEnd = endIdx

  // Clear and rebuild visible window
  while (virtualContainer.firstChild) virtualContainer.removeChild(virtualContainer.firstChild)

  const frag = document.createDocumentFragment()
  let zebraCount = startIdx
  for (let i = startIdx; i < endIdx; i++) {
    const m = items[i]
    const div = buildFeedMessageDiv(m)
    if (zebraEnabled && ++zebraCount % 2 === 0) div.classList.add('hs-mc-zebra')
    div.style.position = 'absolute'
    div.style.top = `${i * h}px`
    div.style.left = '0'
    div.style.right = '0'
    frag.appendChild(div)
  }
  virtualContainer.appendChild(frag)

  // Recalibrate item height from first rendered item (once per render cycle)
  if (startIdx === 0 && virtualContainer.firstElementChild) {
    const measured = virtualContainer.firstElementChild.getBoundingClientRect().height
    if (measured > 10) _feedVirtualItemHeight = measured
  }
}

function renderFeed() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return;
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Update feed tab button text
  const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
  if (feedTabBtn) feedTabBtn.textContent = activeThread ? t('mc_social_back') : t('mc_tab_feed');

  // Thread view — show OP + replies, tear down virtual scroll
  if (activeThread) {
    _feedVirtualTeardown(msgsEl)
    renderThreadView(msgsEl);
    return;
  }

  // Feed list view
  const isStale = feedLoaded && (Date.now() - feedLastFetch > FEED_STALE_MS);
  if ((!feedLoaded || isStale) && !feedLoading) {
    _feedVirtualTeardown(msgsEl)
    msgsEl.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = t('mc_social_loading_feed');
    msgsEl.appendChild(loading);
    fetchFeed();
    return;
  }

  if (feedMessages.length === 0) {
    _feedVirtualTeardown(msgsEl)
    msgsEl.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = t('mc_social_no_posts');
    msgsEl.appendChild(empty);
    return;
  }

  // --- Virtual scroll setup ---
  _feedVirtualTeardown(msgsEl)

  const items = feedMessages  // reference — no slice cap

  const totalHeight = items.length * _feedVirtualItemHeight
  isProgrammaticScroll = true
  msgsEl.textContent = ''
  msgsEl.style.position = 'relative'  // needed for absolute children

  // Spacer sets the full scrollable height
  const spacer = document.createElement('div')
  spacer.className = 'hs-feed-virtual-spacer'
  spacer.style.cssText = `position:absolute;top:0;left:0;right:0;height:${totalHeight}px;pointer-events:none;`
  msgsEl.appendChild(spacer)

  // Virtual container holds only visible DOM nodes
  const virtualContainer = document.createElement('div')
  virtualContainer.className = 'hs-feed-virtual-container'
  virtualContainer.style.cssText = 'position:absolute;top:0;left:0;right:0;'
  msgsEl.appendChild(virtualContainer)

  // Infinite scroll loader at bottom
  if (feedHasMore) {
    const loader = document.createElement('div')
    loader.className = 'hs-mc-empty hs-feed-loader'
    loader.style.cssText = `position:absolute;top:${totalHeight}px;left:0;right:0;`
    loader.textContent = t('mc_social_scroll_more')
    msgsEl.appendChild(loader)
  }

  msgsEl.scrollTop = 0
  requestAnimationFrame(() => { isProgrammaticScroll = false; })

  // Initial window render
  _feedVirtualRenderWindow(msgsEl, virtualContainer, items)

  // Recalibrate spacer after measuring real item height
  requestAnimationFrame(() => {
    const newTotal = items.length * _feedVirtualItemHeight
    spacer.style.height = `${newTotal}px`
    if (feedHasMore) {
      const loader = msgsEl.querySelector('.hs-feed-loader')
      if (loader) loader.style.top = `${newTotal}px`
    }
  })

  // Scroll handler: rAF-throttled window recompute + infinite scroll trigger
  let _feedInfiniteTimer = null
  _feedVirtualScrollHandler = () => {
    if (mcSignal?.aborted) return
    if (_feedVirtualScrollRaf) return
    _feedVirtualScrollRaf = requestAnimationFrame(() => {
      _feedVirtualScrollRaf = 0
      _feedVirtualRenderWindow(msgsEl, virtualContainer, items)

      // Infinite scroll: near bottom
      if (currentTab === 'feed' && !feedLoading && feedHasMore) {
        if (!_feedInfiniteTimer) {
          _feedInfiniteTimer = cleanup.setTimeout(() => {
            _feedInfiniteTimer = null
            const { scrollTop, scrollHeight, clientHeight } = msgsEl
            if (scrollHeight - scrollTop - clientHeight < 100) fetchFeed(true)
          }, 200)
        }
      }
    })
  }
  msgsEl.addEventListener('scroll', _feedVirtualScrollHandler, { signal: mcSignal, passive: true })

  // ResizeObserver: recompute window on container resize
  _feedVirtualResizeObserver = cleanup.trackObserver(new ResizeObserver(() => {
    _feedVirtualLastStart = -1
    _feedVirtualLastEnd = -1
    _feedVirtualRenderWindow(msgsEl, virtualContainer, items)
  }))
  _feedVirtualResizeObserver.observe(msgsEl)
}

// ---- ENGAGEMENT: heat, bookmark, reactions ----

// Batch-check bookmark status for a list of ids after feed loads
async function checkFeedBookmarks(ids) {
  if (!ids.length || !hsAuthToken) return
  try {
    const resp = await apiFetch('/api/bookmarks/check', { method: 'POST', auth: true, body: { message_ids: ids } })
    if (!resp.ok) return
    // Server returns { bookmarked: { id1: true/false, id2: ... } } — an object map.
    const map = resp.data?.bookmarked || resp.bookmarked || {}
    feedBookmarked.clear()
    if (Array.isArray(map)) {
      for (const id of map) feedBookmarked.add(id)
    } else {
      for (const [id, isBookmarked] of Object.entries(map)) {
        if (isBookmarked) feedBookmarked.add(id)
      }
    }
    for (const id of ids) {
      const btn = document.querySelector(`.hs-feed-bm-btn[data-id="${CSS.escape(id)}"]`)
      if (btn) _applyBookmarkState(btn, feedBookmarked.has(id))
    }
  } catch (e) { /* silent */ }
}

function _makeSvg(pathD, filled, size) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size || 13))
  svg.setAttribute('height', String(size || 13))
  svg.setAttribute('class', 'hs-fe-icon')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', pathD)
  path.setAttribute('fill', filled ? '#ff8700' : 'none')
  path.setAttribute('stroke', filled ? '#ff8700' : '#808080')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

function _applyBookmarkState(btn, active) {
  btn.classList.toggle('active', active)
  btn.title = active ? 'remove bookmark' : 'bookmark'
  const path = btn.querySelector('path')
  if (path) {
    path.setAttribute('fill', active ? '#ff8700' : 'none')
    path.setAttribute('stroke', active ? '#ff8700' : '#808080')
  }
}

function _applyHeatState(btn, active, count) {
  btn.classList.toggle('active', active)
  const path = btn.querySelector('path')
  if (path) {
    path.setAttribute('fill', active ? '#ff8700' : 'none')
    path.setAttribute('stroke', active ? '#ff8700' : '#808080')
  }
  const countEl = btn.querySelector('.hs-fe-count')
  if (countEl) countEl.textContent = count > 0 ? String(count) : ''
}

async function toggleHeat(msgId, btn, m) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  // Server-side /api/messages/:id/like is one-way (no unlike route exists).
  if (feedLiked.has(msgId)) return
  const prevHeat = m.heat || 0
  feedLiked.add(msgId)
  m.heat = prevHeat + 1
  _applyHeatState(btn, true, m.heat)
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/like`, { method: 'POST', auth: true })
  if (!resp.ok) {
    feedLiked.delete(msgId)
    m.heat = prevHeat
    _applyHeatState(btn, false, m.heat)
  }
}

async function toggleBookmark(msgId, btn) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  const wasBookmarked = feedBookmarked.has(msgId)
  const newState = !wasBookmarked
  if (newState) feedBookmarked.add(msgId); else feedBookmarked.delete(msgId)
  _applyBookmarkState(btn, newState)
  const method = newState ? 'POST' : 'DELETE'
  const resp = await apiFetch(`/api/bookmarks/${encodeURIComponent(msgId)}`, { method, auth: true })
  if (!resp.ok) {
    if (newState) feedBookmarked.delete(msgId); else feedBookmarked.add(msgId)
    if (btn.isConnected) _applyBookmarkState(btn, wasBookmarked)
  }
}

async function loadReactions(msgId, engageEl) {
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/reactions`, { auth: true })
  if (!resp.ok) return
  const raw = resp.data?.reactions || resp.reactions || []
  // Server returns user_ids array; derive user_reacted client-side so chip "active" state works
  const reactions = raw.map(r => ({
    ...r,
    user_reacted: !!(r.user_reacted ?? (hsCurrentUserId && Array.isArray(r.user_ids) && r.user_ids.map(String).includes(hsCurrentUserId)))
  }))
  feedReactionsCache.set(msgId, reactions)
  _capFeedEngage()
  _renderReactionsIntoRow(engageEl, msgId, reactions)
}

function _makeReactChip(r, msgId, engageEl) {
  const chip = document.createElement('button')
  chip.className = 'hs-feed-react-chip' + (r.user_reacted ? ' active' : '')
  chip.title = r.emote_name || ''
  chip.dataset.emoteId = String(r.emote_id)
  const img = document.createElement('img')
  // Validate URL before assigning to img.src
  const rawUrl = r.emote_url || ''
  const validUrl = /^https:\/\//.test(rawUrl) ? rawUrl : ''
  img.src = validUrl
  img.alt = r.emote_name || ''
  img.className = 'hs-feed-react-img'
  const cnt = document.createElement('span')
  cnt.className = 'hs-fe-count'
  cnt.textContent = String(r.count)
  chip.appendChild(img)
  chip.appendChild(cnt)
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const row = chip.closest('.hs-feed-react-row')
    handleReactionChip(msgId, r, chip, row, engageEl)
  })
  return chip
}

function _renderReactionsIntoRow(engageEl, msgId, reactions) {
  let row = engageEl.querySelector('.hs-feed-react-row')
  if (!row) return
  // Remove old chips (keep the "+" add button at end)
  const addBtn = row.querySelector('.hs-feed-react-add')
  row.textContent = ''
  for (const r of reactions) row.appendChild(_makeReactChip(r, msgId, engageEl))
  if (addBtn) row.appendChild(addBtn)
}

async function handleReactionChip(msgId, reaction, chip, row, engageEl) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  // Snapshot pre-mutation values so rollback can restore exactly, no off-by-one drift
  const prevReacted = reaction.user_reacted
  const prevCount = reaction.count
  const wasReacted = prevReacted
  reaction.user_reacted = !wasReacted
  reaction.count = Math.max(0, (prevCount || 0) + (wasReacted ? -1 : 1))
  chip.classList.toggle('active', reaction.user_reacted)
  const countEl = chip.querySelector('.hs-fe-count')
  if (countEl) countEl.textContent = String(reaction.count)
  if (reaction.count <= 0) chip.remove()
  const method = wasReacted ? 'DELETE' : 'POST'
  const path = wasReacted
    ? `/api/messages/${encodeURIComponent(msgId)}/react/${encodeURIComponent(reaction.emote_id)}`
    : `/api/messages/${encodeURIComponent(msgId)}/react`
  const body = wasReacted ? undefined : { emote_id: reaction.emote_id }
  const resp = await apiFetch(path, { method, auth: true, body })
  if (!resp.ok) {
    reaction.user_reacted = prevReacted
    reaction.count = prevCount
    _renderReactionsIntoRow(engageEl, msgId, feedReactionsCache.get(msgId) || [])
  }
}

function openReactionPicker(e, msgId, engageEl) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  document.getElementById('hs-mc-react-picker')?.remove()
  const emotes = []
  if (typeof emoteCache !== 'undefined') {
    for (const [name, data] of emoteCache) {
      if (data.url && data.source === 'heatsync') emotes.push({ name, url: data.url, id: data.id || name })
    }
  }
  if (!emotes.length) { showToast('no emotes available'); return }

  const picker = document.createElement('div')
  picker.id = 'hs-mc-react-picker'
  picker.className = 'hs-mc-react-picker'

  const searchEl = document.createElement('input')
  searchEl.type = 'text'
  searchEl.className = 'hs-mc-react-search'
  searchEl.placeholder = 'search emotes'
  const grid = document.createElement('div')
  grid.className = 'hs-mc-react-grid'
  picker.appendChild(searchEl)
  picker.appendChild(grid)

  function fillGrid(filter) {
    grid.textContent = ''
    const q = filter.toLowerCase()
    const shown = q ? emotes.filter(em => em.name.toLowerCase().includes(q)).slice(0, 40) : emotes.slice(0, 40)
    for (const em of shown) {
      const btn = document.createElement('button')
      btn.className = 'hs-mc-react-emote'
      btn.title = em.name
      const img = document.createElement('img')
      img.src = em.url
      img.alt = em.name
      img.loading = 'lazy'
      btn.appendChild(img)
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation()
        picker.remove()
        if (!hsAuthToken) return
        const cached = feedReactionsCache.get(msgId) || []
        const existing = cached.find(r => String(r.emote_id) === String(em.id))
        if (existing) {
          const chip = engageEl.querySelector(`.hs-feed-react-chip[data-emote-id="${CSS.escape(String(em.id))}"]`)
          const row = engageEl.querySelector('.hs-feed-react-row')
          if (chip && row) handleReactionChip(msgId, existing, chip, row, engageEl)
          return
        }
        const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/react`, {
          method: 'POST', auth: true, body: { emote_id: em.id }
        })
        if (resp.ok) await loadReactions(msgId, engageEl)
      })
      grid.appendChild(btn)
    }
  }
  fillGrid('')
  searchEl.addEventListener('input', () => fillGrid(searchEl.value))

  document.body.appendChild(picker)
  const rect = e.target.getBoundingClientRect()
  const pw = picker.offsetWidth || 200
  const ph = picker.offsetHeight || 220
  picker.style.left = Math.min(rect.left, window.innerWidth - pw - 4) + 'px'
  picker.style.top = Math.max(rect.top - ph - 4, 4) + 'px'

  setTimeout(() => {
    const dismiss = (ev) => {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', dismiss) }
    }
    document.addEventListener('click', dismiss, { signal: mcSignal })
  }, 0)
  searchEl.focus()
}

function buildEngagementBar(m) {
  const bar = document.createElement('div')
  bar.className = 'hs-feed-engage'

  // Server returns user_heat (the heat the current user has given this msg);
  // any value > 0 means they've liked. user_liked may also be set by older
  // server versions.
  const liked = feedLiked.has(m.base36_id) || !!m.user_liked || (m.user_heat || 0) > 0
  const heatCount = m.heat || 0

  // Heat/like button — flame SVG
  const heatBtn = document.createElement('button')
  heatBtn.className = 'hs-feed-heat-btn' + (liked ? ' active' : '')
  heatBtn.title = liked ? 'already heated' : 'heat'
  heatBtn.dataset.id = m.base36_id
  heatBtn.appendChild(_makeSvg('M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z', liked))
  const heatCount2 = document.createElement('span')
  heatCount2.className = 'hs-fe-count'
  heatCount2.textContent = heatCount > 0 ? formatHeat(heatCount) : ''
  heatBtn.appendChild(heatCount2)

  // Bookmark button — ribbon SVG
  const bookmarked = feedBookmarked.has(m.base36_id)
  const bmBtn = document.createElement('button')
  bmBtn.className = 'hs-feed-bm-btn' + (bookmarked ? ' active' : '')
  bmBtn.title = bookmarked ? 'remove bookmark' : 'bookmark'
  bmBtn.dataset.id = m.base36_id
  bmBtn.appendChild(_makeSvg('M5 2h14a1 1 0 011 1v18l-8-5-8 5V3a1 1 0 011-1z', bookmarked))

  bar.appendChild(heatBtn)
  bar.appendChild(bmBtn)

  // Reactions row
  const reactRow = document.createElement('div')
  reactRow.className = 'hs-feed-react-row'
  const cached = feedReactionsCache.get(m.base36_id)
  if (cached?.length) {
    for (const r of cached) reactRow.appendChild(_makeReactChip(r, m.base36_id, bar))
  }
  const addReactBtn = document.createElement('button')
  addReactBtn.className = 'hs-feed-react-add'
  addReactBtn.title = 'react'
  addReactBtn.textContent = '+'
  reactRow.appendChild(addReactBtn)
  bar.appendChild(reactRow)

  return bar
}

function attachEngagementHandlers(div, m) {
  const bar = div.querySelector('.hs-feed-engage')
  if (!bar) return
  if (m.user_liked || (m.user_heat || 0) > 0) feedLiked.add(m.base36_id)

  const heatBtn = bar.querySelector('.hs-feed-heat-btn')
  if (heatBtn) heatBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHeat(m.base36_id, heatBtn, m) })

  const bmBtn = bar.querySelector('.hs-feed-bm-btn')
  if (bmBtn) bmBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmark(m.base36_id, bmBtn) })

  const addReactBtn = bar.querySelector('.hs-feed-react-add')
  if (addReactBtn) addReactBtn.addEventListener('click', (e) => { e.stopPropagation(); openReactionPicker(e, m.base36_id, bar) })
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
  const inThread = !!opUsername;
  const threadLink = inThread
    ? `<span class="hs-feed-thread-link hs-quote-insert" data-quote-id="${escapeHtml(shortId)}" style="color:#ffff00;cursor:pointer">${escapeHtml(shortId)}</span>`
    : `<span class="hs-feed-thread-link hs-thread-toggle" style="cursor:pointer">&gt;&gt;${escapeHtml(shortId)}</span>`;

  // Post type tag: [OP] red = original post, [OP] magenta = OP replying in own thread, [RE] = reply
  const isOp = m.is_op != null ? !!m.is_op : (!m.reply_to || m.reply_to === '');
  const isThreadOp = m.is_thread_op != null ? !!m.is_thread_op
    : (opUsername && m.reply_to && m.username?.toLowerCase() === opUsername.toLowerCase());
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
  const isReply = !!m.reply_to
  const heatStyle = hd ? getHeatNumberStyle(heat, isReply) : ''
  const heatSpan = hd ? `<span class="hs-feed-stat hs-feed-heat" style="${heatStyle}">${formatHeat(heat)}${hd.suffix}</span>` : ''
  const repliesSpan = replies > 0 ? `<span class="hs-feed-stat hs-feed-replies" title="replies">💬${replies}</span>` : '';
  const stats = [heatSpan, repliesSpan].filter(Boolean).join(' ')
  const statsHtml = stats ? ` ${stats}` : ''

  const anonAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="https://heatsync.org/anon.webp" alt="" loading="lazy">` : '';
  const userAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const userHtml = isAnon
    ? `${anonAvatar}<span class="hs-feed-user" style="color:#808080">Anonymous</span>`
    : `${userAvatar}<a href="https://heatsync.org/user/${encodeURIComponent(m.username)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml((m.username || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.user_color || '#fff')}">${escapeHtml(m.username || 'anon')}</a>`;

  // Media/embeds (img, video, iframe) — values inside are pre-sanitized via escapeHtml/safeUrl/sanitizeEmbedId
  const mediaHtml = buildFeedMediaHtml(m);
  div.innerHTML = `${timeHtml}${threadLink}${typeTag}${platBadge}${userHtml}${statsHtml}: <span class="hs-feed-body">${content}</span>${mediaHtml}`;

  // Click >>id to expand/collapse thread inline — never leaves the stream
  // If this post is a reply, open the parent thread and highlight this post
  const threadLinkEl = div.querySelector('.hs-thread-toggle');
  if (threadLinkEl) {
    threadLinkEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const threadId = m.reply_to || m.base36_id;
      const highlightId = m.reply_to ? m.base36_id : null;
      toggleThread(threadId, highlightId);
    });
  }
  const repliesEl = div.querySelector('.hs-feed-replies');
  if (repliesEl && replies > 0) {
    repliesEl.style.cursor = 'pointer';
    repliesEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThread(m.reply_to || m.base36_id);
    });
  }

  // Click >>id post-links in message content
  div.querySelectorAll('.hs-post-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = link.dataset.id;
      if (!targetId) return;
      // Find the target in feedMessages to determine its thread
      const target = feedMessages.find(f => f.base36_id === targetId);
      const threadId = target ? (target.reply_to || target.base36_id) : targetId;
      openThread(threadId, targetId);
    });
  });

  // Right-click own posts → edit/delete menu
  if (isOwnFeedPost(m)) {
    div.classList.add('hs-feed-own')
    div.addEventListener('contextmenu', (e) => {
      // Only handle right-click directly on the post (not on links/quotes inside)
      if (e.target.closest('a, .hs-feed-thread-link, .hs-quote-insert, .hs-post-link')) return
      showFeedPostContextMenu(e, div, m)
    })
  }
  // Show edited badge if message was edited
  if (m.edited_at && !div.querySelector('.hs-feed-edited')) {
    const body = div.querySelector('.hs-feed-body')
    if (body) {
      const badge = document.createElement('span')
      badge.className = 'hs-feed-edited'
      badge.textContent = ' (edited)'
      badge.style.cssText = 'color:#888;font-size:11px;font-style:italic;margin-left:4px;'
      body.appendChild(badge)
    }
  }

  // Click post ID in thread view → insert >>id into input
  const quoteEl = div.querySelector('.hs-quote-insert');
  if (quoteEl) {
    quoteEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const qid = quoteEl.dataset.quoteId;
      if (!qid) return;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;
      const quote = `>>${qid} `;
      if (wysiwygEnabled) {
        input.focus();
        document.execCommand('insertText', false, quote);
      } else {
        const pos = input.selectionStart || input.value.length;
        input.value = input.value.slice(0, pos) + quote + input.value.slice(pos);
        input.focus();
        input.selectionStart = input.selectionEnd = pos + quote.length;
      }
    });
  }

  // Engagement bar: heat, bookmark, reactions
  const engageBar = buildEngagementBar(m);
  div.appendChild(engageBar);
  attachEngagementHandlers(div, m);

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

const _feedEmoteRegexCache = new Map()
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
      part = part.replace(/(https?:\/\/[^\s<"]+)/gi, (match) => {
        const escaped = escapeHtml(match)
        return `<a href="${escaped}" target="_blank" rel="noopener" class="hs-mc-link">${escaped}</a>`
      })
      part = part.replace(/(?<!\/\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<"]*)/gi, (m) => {
        const escaped = escapeHtml(m)
        return `<a href="https://${escaped}" target="_blank" rel="noopener" class="hs-mc-link">${escaped}</a>`
      })
      return part
    }).join('')
  }
  // Parse >>id post-links (like website does)
  html = html.replace(/(?:&gt;&gt;|>>)(\w{1,6})/g, (match, id) => {
    const paddedId = id.padStart(6, '0');
    const displayId = id.replace(/^0+/, '') || '0';
    return `<span class="hs-post-link" data-id="${paddedId}" style="cursor:pointer">&gt;&gt;${displayId}</span>`;
  });

  // Render emote refs as inline images (AFTER linkification so img tags aren't corrupted)
  // emote_refs can be { name: url } or { name: { url, hash, name, provider } }
  if (emoteRefs && typeof emoteRefs === 'object') {
    for (const [name, val] of Object.entries(emoteRefs)) {
      const url = typeof val === 'string' ? val : val?.url
      if (!url || !/^https:\/\//.test(url)) continue
      const escaped = escapeHtml(name);
      const safeUrl = escapeHtml(url);
      const cacheKey = escaped
      let re = _feedEmoteRegexCache.get(cacheKey)
      if (!re) {
        re = new RegExp(`\\b${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
        _feedEmoteRegexCache.set(cacheKey, re)
        if (_feedEmoteRegexCache.size > 500) _feedEmoteRegexCache.delete(_feedEmoteRegexCache.keys().next().value)
      }
      html = html.replace(re, `<img class="hs-mc-emote" src="${safeUrl}" alt="${escaped}" title="${escaped}" loading="lazy">`);
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
async function openThread(msgId, highlightId) {
  // Find OP in feed or fetch it
  let op = feedMessages.find(m => m.base36_id === msgId);
  activeThread = { id: msgId, op: op || null, replies: [], loading: true, highlightId: highlightId || null };
  renderFeed();

  const resp = await apiFetch(`/api/messages/${msgId}/replies`);
  if (resp.ok) {
    activeThread.replies = resp.data?.replies || [];
  }
  activeThread.loading = false;
  renderFeed();

  // Scroll to and highlight the target post
  if (highlightId) {
    const msgsEl = document.getElementById('hs-mc-messages');
    const target = msgsEl?.querySelector(`[data-msg-id="${highlightId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'center' });
      target.classList.add('hs-post-highlight');
      setTimeout(() => target.classList.remove('hs-post-highlight'), 1000);
    }
  }
}

function closeThread() {
  activeThread = null;
  renderFeed();
}

function toggleThread(msgId, highlightId) {
  if (activeThread && activeThread.id === msgId && !highlightId) {
    closeThread();
  } else {
    openThread(msgId, highlightId);
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
    const opDiv = buildFeedMessageDiv(t.op, t.op?.username);
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
    empty.textContent = t('mc_social_no_replies');
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
      input.dataset.placeholder = t('mc_social_login_first');
    } else {
      input.placeholder = t('mc_social_login_first');
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
    const errMsg = resp.status === 401 ? t('mc_social_log_in_first')
      : resp.status === 429 ? t('mc_social_slow_down')
      : resp.status === 409 ? t('mc_social_duplicate')
      : t('mc_social_failed_post');
    showToast(errMsg);
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    log('Post failed:', resp.status || resp.error);
  }
}


// ============================================
// DISCOVER TAB (trending tags + profiles)
// ============================================

let discoverLoaded = false;
let discoverLoading = false;
let discoverPollTimer = null;
function startDiscoverPolling() {
  if (discoverPollTimer) return;
  // Auto-refresh while user is viewing the discover tab
  discoverPollTimer = cleanup.setInterval(() => {
    if (currentTab === 'discover' && !discoverLoading) {
      discoverLoaded = false;
      fetchDiscover();
    } else if (currentTab !== 'discover') {
      cleanup.clearInterval(discoverPollTimer);
      discoverPollTimer = null;
    }
  }, 20000);
}
let discoverTags = [];
let discoverProfiles = [];
let discoverPosts = [];
let discoverPlatformFilter = 'all';   // 'all' | 't' | 'k' | 'yt'

function _discoverSetLoading(msgsEl) {
  msgsEl.textContent = '';
  const el = document.createElement('div');
  el.className = 'hs-mc-empty';
  el.textContent = 'loading...';
  msgsEl.appendChild(el);
}

async function fetchDiscover() {
  if (discoverLoading) return;
  discoverLoading = true;

  const msgsEl = document.getElementById('hs-mc-messages');
  if (msgsEl && currentTab === 'discover') _discoverSetLoading(msgsEl);

  // Snapshot the tab user was on when fetch started — if they switched away and
  // back during the await, the .finally still re-renders correctly. If they
  // switched away and stayed, render is skipped (no clobbering other tab DOM).
  const tabAtFetch = currentTab;
  try {
    const [tagsResp, profilesResp, postsResp] = await Promise.all([
      apiFetch('/api/discover/trending-tags'),
      apiFetch('/api/profiles/trending'),
      apiFetch('/api/messages?sort=time&limit=40').catch(() => null),
    ]);

    // Server shape: { tags: [...] } and { profiles: [...] }.
    // api_fetch proxy wraps as { ok: true, data: {...} }, so unwrap one more level.
    const tagsData = tagsResp.ok ? (tagsResp.data || tagsResp) : {};
    const profilesData = profilesResp.ok ? (profilesResp.data || profilesResp) : {};
    discoverTags = Array.isArray(tagsData) ? tagsData : (tagsData.tags || []);
    discoverProfiles = Array.isArray(profilesData) ? profilesData : (profilesData.profiles || []);

    // Posts: pull recent feed, client-sort by heat, take top by heat>0
    const rawPosts = postsResp?.ok ? (postsResp.data?.messages || []) : [];
    discoverPosts = rawPosts
      .filter(m => m && m.username && m.username !== 'Anonymous' && (m.heat || 0) > 0)
      .sort((a, b) => (b.heat || 0) - (a.heat || 0))
      .slice(0, 8);

    discoverLoaded = true;
  } catch (e) {
    discoverTags = [];
    discoverProfiles = [];
    discoverPosts = [];
    discoverLoaded = true;
  } finally {
    discoverLoading = false;
    if (currentTab === 'discover') renderDiscoverTab();
    void tabAtFetch;
  }
}

// Compact number: 12345 -> "12.3k", 1200000 -> "1.2m"
function formatDiscoverCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// Compact heat tier styling — matches site canonical color tiers from getHeatNumberStyle,
// but with fixed (small) size so discover rows stay dense.
// Tiers: 0 → #444, 1-10 → #888, 10-30 → #888, 30-50 → #cc6600, 50-100 → #ff8700,
//        100-500 → #ffaa33, 500+ → #fff with breathe animation
function discoverHeatStyle(heat) {
  let color = '#444', textShadow = '', animation = '';
  if (heat > 500) {
    color = '#fff';
    textShadow = '0 0 4px rgba(255,255,255,1),0 0 10px rgba(255,200,100,0.9),0 0 18px rgba(255,135,0,0.6)';
    animation = 'hs-heat-breathe 2s ease-in-out infinite';
  } else if (heat > 100) {
    color = '#ffaa33';
    textShadow = '0 0 4px rgba(255,170,50,0.85),0 0 10px rgba(255,135,0,0.4)';
  } else if (heat > 50) {
    color = '#ff8700';
    textShadow = '0 0 3px rgba(255,135,0,0.55)';
  } else if (heat > 30) {
    color = '#cc6600';
  } else if (heat > 10) {
    color = '#888';
  }
  let style = `color:${color};font-weight:900;font-variant-numeric:tabular-nums;`;
  if (textShadow) style += `text-shadow:${textShadow};`;
  if (animation) style += `animation:${animation};`;
  return style;
}

// Apply canonical row-level heat effects (border, bg tint, breathe class)
function applyDiscoverHeatRowEffects(row, heat) {
  const hd = getHeatDisplay(heat);
  if (!hd) return;
  row.style.borderLeftColor = hd.border;
  row.style.borderLeftWidth = hd.borderWidth + 'px';
  if (hd.bg) row.style.background = hd.bg;
  if (hd.breathe) row.classList.add('hs-feed-heat-breathe');
}

// Canonical heat number — formatHeat + ° suffix at ≥ 10 + tier color/glow/breathe inline style.
// HTML-string variant for innerHTML callers (heat numeric + internally-built style is safe).
function heatSpanHtml(heat) {
  const h = Number(heat) || 0;
  if (h <= 0) return '';
  const style = discoverHeatStyle(h);
  const suffix = h >= 10 ? '°' : '';
  return `<span class="hs-heat-num" style="${style}">${formatHeat(h)}${suffix}</span>`;
}

// Same, returned as a DOM node for createElement callers.
function heatSpanEl(heat) {
  const h = Number(heat) || 0;
  if (h <= 0) return null;
  const span = document.createElement('span');
  span.className = 'hs-heat-num';
  span.setAttribute('style', discoverHeatStyle(h));
  const suffix = h >= 10 ? '°' : '';
  span.textContent = formatHeat(h) + suffix;
  return span;
}

function renderDiscoverProfileRow(profile, username, rank, maxHeat) {
  const row = document.createElement('a');
  row.className = 'hs-discover-profile-row';
  row.href = `https://heatsync.org/user/${encodeURIComponent(username)}`;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';

  const isLive = !!(profile.twitch_is_live || profile.kick_is_live);
  if (isLive) row.classList.add('hs-discover-row-live');

  const rankEl = document.createElement('span');
  rankEl.className = 'hs-discover-rank';
  rankEl.textContent = String(rank).padStart(2, '0');
  row.appendChild(rankEl);

  const dot = document.createElement('span');
  dot.className = isLive ? 'hs-discover-live-dot' : 'hs-discover-live-spacer';
  if (isLive) {
    const v = (profile.twitch_viewer_count || 0) + (profile.kick_viewer_count || 0);
    dot.title = v > 0 ? `live · ${v.toLocaleString()} viewer${v === 1 ? '' : 's'}` : 'live';
  }
  row.appendChild(dot);

  const avatarUrl = safeUrl(profile.avatarUrl || profile.avatar_url || profile.twitch_profile_pic || profile.kick_profile_pic || '');
  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'hs-discover-avatar';
    img.src = avatarUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() { this.style.visibility = 'hidden'; };
    row.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'hs-discover-avatar hs-discover-avatar-empty';
    row.appendChild(ph);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'hs-discover-profile-name';
  nameEl.style.color = sanitizeColor(profile.userColor || profile.user_color || '#fff');
  nameEl.textContent = profile.displayName || profile.display_name || username;
  row.appendChild(nameEl);

  const plats = document.createElement('span');
  plats.className = 'hs-discover-platforms';
  if (profile.twitch_username) {
    const t = document.createElement('a');
    t.className = 'hs-plat hs-plat-t';
    t.textContent = 't';
    t.href = `https://www.twitch.tv/${encodeURIComponent(profile.twitch_username)}`;
    t.target = '_blank';
    t.rel = 'noopener noreferrer';
    t.title = `twitch · @${profile.twitch_username}${profile.twitch_is_live ? ' · live' : ''}`;
    if (profile.twitch_is_live) t.classList.add('hs-plat-live');
    t.addEventListener('click', e => e.stopPropagation());
    plats.appendChild(t);
  }
  if (profile.kick_username) {
    const k = document.createElement('a');
    k.className = 'hs-plat hs-plat-k';
    k.textContent = 'k';
    k.href = `https://kick.com/${encodeURIComponent(profile.kick_username)}`;
    k.target = '_blank';
    k.rel = 'noopener noreferrer';
    k.title = `kick · @${profile.kick_username}${profile.kick_is_live ? ' · live' : ''}`;
    if (profile.kick_is_live) k.classList.add('hs-plat-live');
    k.addEventListener('click', e => e.stopPropagation());
    plats.appendChild(k);
  }
  if (plats.childNodes.length) row.appendChild(plats);

  const heat = Number(profile.stats?.total_heat ?? profile.heat ?? 0);
  const bar = document.createElement('span');
  bar.className = 'hs-discover-bar';
  const fill = document.createElement('i');
  const pct = maxHeat > 0 ? Math.max(2, Math.round((heat / maxHeat) * 100)) : 2;
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  row.appendChild(bar);

  // Canonical heat number — matches website / feed posts (formatHeat + ° suffix, tiered glow)
  const heatEl = document.createElement('span');
  heatEl.className = 'hs-discover-heat';
  heatEl.title = `${heat.toLocaleString()} heat`;
  heatEl.setAttribute('style', discoverHeatStyle(heat));
  const suffix = heat >= 10 ? '°' : '';
  heatEl.textContent = formatHeat(heat) + suffix;
  row.appendChild(heatEl);

  // Apply row-level heat tier effects ONLY when not live (live row has red border)
  if (!isLive) applyDiscoverHeatRowEffects(row, heat);

  if (isLive) {
    const v = (profile.twitch_viewer_count || 0) + (profile.kick_viewer_count || 0);
    if (v > 0) {
      const vEl = document.createElement('span');
      vEl.className = 'hs-discover-viewers';
      vEl.textContent = formatDiscoverCount(v);
      vEl.title = `${v.toLocaleString()} viewers`;
      row.appendChild(vEl);
    }
  }

  return row;
}

// Filter chips bar: sort + platform toggles, click rerenders
function renderDiscoverChipsBar() {
  const bar = document.createElement('div');
  bar.className = 'hs-discover-chips-bar';

  function makeChip(label, value, currentValue, setter, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hs-discover-chip-btn' + (extraClass ? ' ' + extraClass : '');
    if (value === currentValue) btn.classList.add('hs-active');
    btn.textContent = label;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setter(value);
      renderDiscoverTab();
    });
    return btn;
  }

  function makeLabel(text) {
    const l = document.createElement('span');
    l.className = 'hs-discover-chips-label';
    l.textContent = text;
    return l;
  }

  bar.appendChild(makeLabel('platform'));
  bar.appendChild(makeChip('all', 'all', discoverPlatformFilter, v => { discoverPlatformFilter = v; }));
  bar.appendChild(makeChip('t', 't', discoverPlatformFilter, v => { discoverPlatformFilter = v; }, 'hs-chip-plat-t'));
  bar.appendChild(makeChip('k', 'k', discoverPlatformFilter, v => { discoverPlatformFilter = v; }, 'hs-chip-plat-k'));
  bar.appendChild(makeChip('yt', 'yt', discoverPlatformFilter, v => { discoverPlatformFilter = v; }, 'hs-chip-plat-yt'));
  return bar;
}

function profileMatchesPlatformFilter(p) {
  if (discoverPlatformFilter === 'all') return true;
  if (discoverPlatformFilter === 't') return !!p.twitch_username;
  if (discoverPlatformFilter === 'k') return !!p.kick_username;
  if (discoverPlatformFilter === 'yt') return !!(p.youtube_username || p.youtube_channel_id);
  return true;
}

function postMatchesPlatformFilter(m) {
  if (discoverPlatformFilter === 'all') return true;
  if (discoverPlatformFilter === 't') return m.platform === 'twitch';
  if (discoverPlatformFilter === 'k') return m.platform === 'kick';
  if (discoverPlatformFilter === 'yt') return m.platform === 'youtube';
  return true;
}

function sortProfilesByHeat(a, b) {
  return (b.stats?.total_heat || 0) - (a.stats?.total_heat || 0);
}

function renderDiscoverPostRow(m) {
  const row = document.createElement('a');
  row.className = 'hs-discover-post-row';
  row.href = `https://heatsync.org/m/${encodeURIComponent(m.base36_id)}`;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';

  // Meta line: time · plat · user · spacer · heat · replies
  const meta = document.createElement('div');
  meta.className = 'hs-discover-post-meta';

  const time = document.createElement('span');
  time.className = 'hs-discover-post-time';
  time.textContent = formatRelativeTime(m.created_at);
  time.title = new Date(m.created_at).toLocaleString();
  meta.appendChild(time);

  if (m.platform) {
    const plat = document.createElement('span');
    const code = m.platform === 'twitch' ? 't' : m.platform === 'kick' ? 'k' : m.platform === 'youtube' ? 'yt' : 'h';
    plat.className = `hs-plat hs-plat-${code} hs-discover-post-plat`;
    plat.textContent = code;
    meta.appendChild(plat);
  }

  const user = document.createElement('span');
  user.className = 'hs-discover-post-user';
  user.style.color = sanitizeColor(m.user_color || '#fff');
  user.textContent = m.username;
  meta.appendChild(user);

  const spacer = document.createElement('span');
  spacer.className = 'hs-discover-post-spacer';
  meta.appendChild(spacer);

  const heat = Number(m.heat || 0);
  const heatEl = document.createElement('span');
  heatEl.className = 'hs-discover-heat hs-discover-post-heat';
  heatEl.title = `${heat.toLocaleString()} heat`;
  heatEl.setAttribute('style', discoverHeatStyle(heat));
  const suffix = heat >= 10 ? '°' : '';
  heatEl.textContent = formatHeat(heat) + suffix;
  meta.appendChild(heatEl);

  if ((m.reply_count || 0) > 0) {
    const rep = document.createElement('span');
    rep.className = 'hs-discover-post-replies';
    rep.title = `${m.reply_count} repl${m.reply_count === 1 ? 'y' : 'ies'}`;
    rep.textContent = `${m.reply_count}r`;
    meta.appendChild(rep);
  }

  row.appendChild(meta);

  // Content line: post body, full width, max 2 lines via line-clamp
  const txt = document.createElement('div');
  txt.className = 'hs-discover-post-text';
  const snippet = String(m.content || '').replace(/\s+/g, ' ').trim();
  txt.textContent = snippet || '(no text)';
  row.appendChild(txt);

  // Canonical row-level heat tier effects (border tier, bg, breathe at 500+)
  applyDiscoverHeatRowEffects(row, heat);

  return row;
}

function makeDiscoverSection(titleText, subtitleText, metaText, extraClass) {
  const section = document.createElement('section');
  section.className = 'hs-discover-section' + (extraClass ? ' ' + extraClass : '');
  const heading = document.createElement('div');
  heading.className = 'hs-discover-heading';

  const titleWrap = document.createElement('span');
  titleWrap.className = 'hs-discover-heading-title';
  titleWrap.textContent = titleText;
  heading.appendChild(titleWrap);

  if (metaText) {
    const meta = document.createElement('span');
    meta.className = 'hs-discover-meta';
    meta.textContent = metaText;
    heading.appendChild(meta);
  }
  section.appendChild(heading);

  if (subtitleText) {
    const sub = document.createElement('div');
    sub.className = 'hs-discover-subtitle';
    sub.textContent = subtitleText;
    section.appendChild(sub);
  }

  const body = document.createElement('div');
  body.className = 'hs-discover-section-body';
  section.appendChild(body);
  return { section, body };
}

function renderDiscoverTab() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return;
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  startDiscoverPolling();

  if (!discoverLoaded && !discoverLoading) {
    fetchDiscover();
    return;
  }
  if (discoverLoading) {
    _discoverSetLoading(msgsEl);
    return;
  }

  msgsEl.textContent = '';

  // Container query root — gives us responsive layout based on panel width, not viewport
  const root = document.createElement('div');
  root.className = 'hs-discover-root';

  const filteredProfiles = discoverProfiles.filter(profileMatchesPlatformFilter);
  const filteredPosts = discoverPosts.filter(postMatchesPlatformFilter);

  const liveProfiles = filteredProfiles
    .filter(p => p.twitch_is_live || p.kick_is_live)
    .sort((a, b) => {
      const av = (a.twitch_viewer_count || 0) + (a.kick_viewer_count || 0);
      const bv = (b.twitch_viewer_count || 0) + (b.kick_viewer_count || 0);
      if (av !== bv) return bv - av;
      return (b.stats?.total_heat || 0) - (a.stats?.total_heat || 0);
    });
  const restProfiles = filteredProfiles
    .filter(p => !p.twitch_is_live && !p.kick_is_live)
    .sort(sortProfilesByHeat);
  const maxHeat = Math.max(
    ...filteredProfiles.map(p => p.stats?.total_heat ?? p.heat ?? 0),
    1
  );

  // Filter chips
  root.appendChild(renderDiscoverChipsBar());

  // Top row — LIVE NOW + HOT POSTS side by side when wide
  const topRow = document.createElement('div');
  topRow.className = 'hs-discover-row1';

  // ● LIVE NOW
  {
    const { section, body } = makeDiscoverSection(
      'live now',
      'streaming right now — click t/k to watch',
      liveProfiles.length > 0 ? `${liveProfiles.length}` : '0',
      'hs-discover-section-live'
    );
    if (liveProfiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no streams live right now';
      body.appendChild(empty);
      // Contextual nudge — if the user follows few/no people on heatsync, the
      // section will always look empty. Surface twitch import right at the
      // point of pain. safeSendMessage→get_followed_users to gate the prompt.
      try {
        chrome.runtime.sendMessage({ type: 'get_followed_users' }).then(resp => {
          if ((resp?.users?.length || 0) >= 5) return;
          if (!body.isConnected) return;
          const nudge = document.createElement('div');
          nudge.className = 'hs-discover-section-empty hs-discover-import-nudge';
          const a = document.createElement('a');
          a.href = '#';
          a.textContent = '↳ import your follows from twitch';
          a.style.color = '#ff8700';
          a.style.textDecoration = 'none';
          a.addEventListener('click', async (e) => {
            e.preventDefault();
            a.textContent = 'syncing…';
            try {
              const r = await apiFetch('/api/sync-twitch-follows', { method: 'POST', auth: true });
              if (r?.ok && r?.data?.success) {
                a.textContent = `synced ${r.data.synced} ✓`;
                try { chrome.runtime.sendMessage({ type: 'refresh_followed_users' }); } catch {}
                setTimeout(() => renderDiscoverTab(), 1500);
              } else {
                a.textContent = (r?.error || r?.data?.error || 'failed').slice(0, 30);
              }
            } catch (err) {
              a.textContent = 'failed';
            }
          });
          nudge.appendChild(a);
          body.appendChild(nudge);
        }).catch(() => {});
      } catch {}
    } else {
      let rank = 1;
      for (const profile of liveProfiles) {
        const username = profile.username || profile.name || '';
        if (!username) continue;
        const row = renderDiscoverProfileRow(profile, username, rank++, maxHeat);
        if (row) body.appendChild(row);
      }
    }
    topRow.appendChild(section);
  }

  // HOT POSTS
  {
    const { section, body } = makeDiscoverSection(
      'hot posts',
      'top recent posts by heat — click to read',
      filteredPosts.length > 0 ? `${filteredPosts.length}` : '0',
      'hs-discover-section-posts'
    );
    if (filteredPosts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no hot posts in this filter';
      body.appendChild(empty);
    } else {
      for (const m of filteredPosts) {
        const row = renderDiscoverPostRow(m);
        if (row) body.appendChild(row);
      }
    }
    topRow.appendChild(section);
  }

  root.appendChild(topRow);

  // TAGS — always render, above the long leaderboard
  {
    const { section, body } = makeDiscoverSection(
      'tags',
      'trending tags across heatsync',
      `${discoverTags.length}`,
      'hs-discover-section-tags'
    );
    if (discoverTags.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no trending tags right now';
      body.appendChild(empty);
    } else {
      const chips = document.createElement('div');
      chips.className = 'hs-discover-chips';
      for (const tag of discoverTags) {
        const name = typeof tag === 'string' ? tag : (tag.name || tag.tag || '');
        if (!name) continue;
        const chip = document.createElement('a');
        chip.className = 'hs-discover-chip';
        chip.href = `https://heatsync.org/tags/${encodeURIComponent(name)}`;
        chip.target = '_blank';
        chip.rel = 'noopener noreferrer';
        chip.textContent = name;
        const count = typeof tag === 'object' ? (tag.count || tag.usage || 0) : 0;
        if (count > 0) {
          const c = document.createElement('span');
          c.className = 'hs-discover-chip-count';
          c.textContent = formatDiscoverCount(count);
          chip.appendChild(c);
        }
        chips.appendChild(chip);
      }
      body.appendChild(chips);
    }
    root.appendChild(section);
  }

  // LEADERBOARD — non-live profiles, multi-column when wide
  {
    const { section, body } = makeDiscoverSection(
      'leaderboard',
      'top non-live profiles by heat',
      `${restProfiles.length}`,
      'hs-discover-section-trending'
    );
    body.classList.add('hs-discover-leaderboard-body');
    if (restProfiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no profiles match this filter';
      body.appendChild(empty);
    } else {
      let rank = 1;
      for (const profile of restProfiles) {
        const username = profile.username || profile.name || '';
        if (!username) continue;
        const row = renderDiscoverProfileRow(profile, username, rank++, maxHeat);
        if (row) body.appendChild(row);
      }
    }
    root.appendChild(section);
  }

  msgsEl.appendChild(root);
}

// Pinned messages tab
let pinnedLoaded = false;
let pinnedLoading = false;
let pinnedPollTimer = null;
function startPinnedPolling() {
  if (pinnedPollTimer) return;
  pinnedPollTimer = cleanup.setInterval(() => {
    if (currentTab === 'pinned' && !pinnedLoading) {
      pinnedLoaded = false;
      fetchPinned();
    } else if (currentTab !== 'pinned') {
      cleanup.clearInterval(pinnedPollTimer);
      pinnedPollTimer = null;
    }
  }, 20000);
}
let pinnedMessages = [];

function _pinnedSetLoading(msgsEl) {
  msgsEl.textContent = '';
  const el = document.createElement('div');
  el.className = 'hs-mc-empty';
  el.textContent = 'loading...';
  msgsEl.appendChild(el);
}

async function fetchPinned() {
  if (pinnedLoading) return;
  pinnedLoading = true;

  const msgsEl = document.getElementById('hs-mc-messages');
  if (msgsEl && currentTab === 'pinned') _pinnedSetLoading(msgsEl);

  try {
    const resp = await apiFetch('/api/messages/pinned');
    // Server returns { messages: [...] }; api_fetch proxy wraps as { ok, data: { messages } }
    const data = resp.ok ? (resp.data || resp) : {};
    pinnedMessages = Array.isArray(data) ? data : (data.messages || []);
    pinnedLoaded = true;
  } catch (e) {
    pinnedMessages = [];
    pinnedLoaded = true;
  } finally {
    pinnedLoading = false;
    if (currentTab === 'pinned') renderPinnedTab();
  }
}

function renderPinnedTab() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return;
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Auto-refresh while viewing — no manual refresh button.
  startPinnedPolling();

  if (!pinnedLoaded && !pinnedLoading) {
    fetchPinned();
    return;
  }
  if (pinnedLoading) {
    _pinnedSetLoading(msgsEl);
    return;
  }

  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  if (pinnedMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'no pinned messages';
    frag.appendChild(empty);
    msgsEl.appendChild(frag);
    return;
  }

  for (const m of pinnedMessages) {
    const id = m.base36_id || m.id || '';
    const channel = escapeHtml(m.channel || '');
    const user = escapeHtml(m.user || m.username || m.display_name || '');
    const content = escapeHtml(m.content || m.text || '');
    const ts = m.ts || m.created_at || m.timestamp || '';
    const timeStr = ts ? escapeHtml(new Date(ts).toLocaleString()) : '';

    const row = document.createElement('a');
    row.className = 'hs-pinned-row';
    if (id) {
      const url = safeUrl(`https://heatsync.org/m/${encodeURIComponent(id)}`);
      if (url) {
        row.href = url;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
      }
    }

    const meta = document.createElement('div');
    meta.className = 'hs-pinned-meta';
    if (channel) {
      const channelSpan = document.createElement('span');
      channelSpan.className = 'hs-pinned-channel';
      channelSpan.textContent = channel;
      meta.appendChild(channelSpan);
    }
    if (user) {
      const userSpan = document.createElement('span');
      userSpan.className = 'hs-pinned-user';
      userSpan.textContent = user;
      meta.appendChild(userSpan);
    }
    if (timeStr) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'hs-pinned-time';
      timeSpan.textContent = timeStr;
      meta.appendChild(timeSpan);
    }
    row.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'hs-pinned-body';
    body.textContent = content;
    row.appendChild(body);

    frag.appendChild(row);
  }

  msgsEl.appendChild(frag);
}


// --- multichat/whispers.js ---
// Whispers — unified chronological timeline of all whispers + DMs

const whisperTimeline = [] // { user, text, color, time, self, platform, key, status?, id? }
const whisperUsers = new Map() // key → { platform, userId, displayName, color }
const WHISPER_USERS_MAX = 200
const WHISPER_TIMELINE_MAX_READ = 500 // hard cap on READ messages; unread are NEVER evicted
// O(1) dedup. Composite key = id when present, else user|time|text-prefix so IRC↔EventSub
// dual delivery still collapses even when one side lacks an ID.
const _whisperSeen = new Set()
const _WHISPER_SEEN_MAX = 2000
function _whisperDedupKey(platform, id, user, time, text) {
  if (id) return `${platform}:${id}`
  return `${platform}|${(user || '').toLowerCase()}|${time || 0}|${(text || '').slice(0, 64)}`
}
function _whisperMarkSeen(key) {
  if (_whisperSeen.has(key)) return true
  _whisperSeen.add(key)
  if (_whisperSeen.size > _WHISPER_SEEN_MAX) {
    // Drop the oldest insertion (Set preserves insertion order)
    const it = _whisperSeen.values().next()
    if (!it.done) _whisperSeen.delete(it.value)
  }
  return false
}

// Trim oldest READ messages once read-count exceeds cap. Unread (incoming msgs
// with time > whisperLastViewedTime) survive forever — that's the whole point.
// Self-sent messages count as read (we wrote them).
function trimWhisperTimeline() {
  let readCount = 0
  for (const m of whisperTimeline) {
    if (m.self || m.time <= whisperLastViewedTime) readCount++
  }
  let toRemove = readCount - WHISPER_TIMELINE_MAX_READ
  if (toRemove <= 0) return
  for (let i = 0; i < whisperTimeline.length && toRemove > 0; ) {
    const m = whisperTimeline[i]
    if (m.self || m.time <= whisperLastViewedTime) {
      whisperTimeline.splice(i, 1)
      toRemove--
    } else {
      i++
    }
  }
}
function whisperUsersSet(key, value) {
  whisperUsers.set(key, value)
  if (whisperUsers.size > WHISPER_USERS_MAX) {
    whisperUsers.delete(whisperUsers.keys().next().value)
  }
}
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
  if (_whisperSaveTimer) cleanup.clearTimeout(_whisperSaveTimer)
  _whisperSaveTimer = cleanup.setTimeout(saveWhispers, 500)
}

function saveWhispers() {
  const users = {}
  for (const [key, u] of whisperUsers) users[key] = u
  try {
    trimWhisperTimeline()
    chrome.storage.local.set({
      hs_whispers_v2: {
        timeline: whisperTimeline.slice(),
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
          whisperUsersSet(key, {
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
        trimWhisperTimeline()
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
  // O(1) dedup that also collapses dual IRC↔EventSub delivery when ID is missing
  if (_whisperMarkSeen(_whisperDedupKey('twitch', msg.id, msg.user, msg.time, msg.text))) return

  const key = `twitch:${msg.user.toLowerCase()}`
  whisperUsersSet(key, {
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
    key,
    id: msg.id || ''
  })
  trimWhisperTimeline()
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
  const time = data.created_at ? new Date(data.created_at).getTime() : Date.now()
  if (_whisperMarkSeen(_whisperDedupKey('heatsync', data.id, data.from_display_name, time, data.content))) return
  const key = `hs:${data.from_user_id}`
  whisperUsersSet(key, {
    platform: 'heatsync',
    userId: data.from_user_id,
    displayName: data.from_display_name,
    color: data.from_color || '#ff8700'
  })

  whisperTimeline.push({
    user: data.from_display_name,
    text: data.content,
    color: data.from_color || '#ff8700',
    time,
    self: false,
    platform: 'heatsync',
    key,
    id: data.id || ''
  })
  trimWhisperTimeline()
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

// Send Twitch whisper via heatsync server proxy (uses properly scoped OAuth tokens)
async function sendTwitchWhisper(toUserId, message) {
  try {
    const resp = await apiFetch('/api/twitch/whisper', {
      method: 'POST',
      body: { toUserId, message }
    })
    if (resp?.ok) return { ok: true }
    // 401 covers all auth failures from the proxy — missing JWT, JWT without
    // twitch_id, missing user:manage:whispers scope, or Helix rejecting phone-
    // unverified senders. All paths recover via re-running Twitch OAuth.
    if (resp?.status === 401) {
      showToast(t('mc_whisper_login'))
      return { ok: false, error: resp.error || 'not authenticated', errorKind: 'auth' }
    }
    showToast('whisper failed: ' + (resp?.error || 'unknown'))
    return { ok: false, error: resp?.error || 'unknown' }
  } catch (e) {
    showToast('whisper failed: ' + e.message)
    return { ok: false, error: e.message }
  }
}

async function sendWhisperMessage(key, text) {
  const userInfo = whisperUsers.get(key)
  if (!userInfo) { showToast('unknown user — whisper someone first'); return }

  // Optimistic: show message with pending status. Reference kept so we can
  // flip status to 'sent' or 'failed' once the network resolves.
  const sendId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const msg = {
    user: 'you',
    text,
    color: '#808080',
    time: Date.now(),
    self: true,
    platform: userInfo.platform,
    key,
    status: 'pending',
    sendId
  }
  whisperTimeline.push(msg)
  trimWhisperTimeline()
  lastWhisperKey = key

  if (currentTab === 'whispers') renderWhispersTab()
  whisperSaveDebounced()

  let ok = false
  let errMsg = ''
  let errorKind = ''
  try {
    if (key.startsWith('twitch:')) {
      const resp = await sendTwitchWhisper(userInfo.userId, text)
      ok = !!resp.ok
      errMsg = resp.error || ''
      errorKind = resp.errorKind || ''
    } else if (key.startsWith('hs:')) {
      const toUserId = key.slice(3)
      const resp = await apiFetch('/api/dm', { method: 'POST', body: { toUserId, content: text } })
      ok = !!resp.ok
      errMsg = resp.error || (ok ? '' : 'unknown error')
      if (!ok && resp?.status === 401) errorKind = 'auth'
    }
  } catch (e) {
    ok = false
    errMsg = e.message
  }

  // Mutate the original push (still referenced by sendId) so re-renders pick up state.
  msg.status = ok ? 'sent' : 'failed'
  if (!ok) {
    msg.error = errMsg
    if (errorKind) msg.errorKind = errorKind
  }
  if (currentTab === 'whispers') renderWhispersTab()
  whisperSaveDebounced()
}

// Auto-retry queued auth-failed whispers when auth comes back online.
// Bound to storage.onChanged on first call; safe to call repeatedly.
function retryAuthFailedWhispers() {
  const failed = whisperTimeline.filter(m => m.status === 'failed' && m.errorKind === 'auth' && m.sendId)
  if (!failed.length) return
  log(`[whispers] auth restored — retrying ${failed.length} queued send(s)`)
  // Stagger retries so we don't burst the helix endpoint.
  failed.forEach((m, i) => {
    cleanup.setTimeout(() => retryWhisperSend(m.sendId), i * 250)
  })
}

async function retryWhisperSend(sendId) {
  const idx = whisperTimeline.findIndex(m => m.sendId === sendId)
  if (idx < 0) return
  const old = whisperTimeline[idx]
  if (old.status !== 'failed') return
  // Remove the failed entry — sendWhisperMessage will push a fresh pending one.
  whisperTimeline.splice(idx, 1)
  await sendWhisperMessage(old.key, old.text)
}

function renderWhispersTab() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return
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
        whisperUsersSet(key, {
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
              color: isSelf ? '#808080' : (dm.other_color || '#ff8700'),
              time: t,
              self: isSelf,
              platform: 'heatsync',
              key
            })
            added = true
          }
          if (added) {
            whisperTimeline.sort((a, b) => a.time - b.time)
            trimWhisperTimeline()
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
    msgsEl.replaceChildren()
    const emptyDiv = document.createElement('div')
    emptyDiv.className = 'hs-mc-empty'
    emptyDiv.textContent = t('mc_whisper_hint')
    msgsEl.appendChild(emptyDiv)
    return
  }

  msgsEl.replaceChildren()
  const frag = document.createDocumentFragment()
  const toRender = whisperTimeline.slice(-150)
  let zebraCount = 0

  for (const m of toRender) {
    const div = document.createElement('div')
    let cls = m.self ? 'hs-mc-msg hs-whisper-self' : 'hs-mc-msg'
    if (m.status === 'pending') cls += ' hs-whisper-pending'
    else if (m.status === 'failed') cls += ' hs-whisper-failed'
    div.className = cls
    if (m.sendId) div.dataset.sendId = m.sendId
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

    let statusHtml = ''
    if (m.status === 'pending') {
      statusHtml = ` <span class="hs-whisper-status" title="sending">…</span>`
    } else if (m.status === 'failed') {
      const errSafe = escapeHtml(m.error || 'failed')
      const idSafe = escapeHtml(m.sendId || '')
      if (m.errorKind === 'auth') {
        statusHtml = ` <a href="https://heatsync.org/api/auth/login?return_to=%2Fhome%2Fhot" target="_blank" rel="noopener noreferrer" class="hs-whisper-status hs-whisper-relogin" title="${errSafe} — click to log in on heatsync">⚠ log in on heatsync to send</a>`
      } else {
        statusHtml = ` <span class="hs-whisper-status hs-whisper-retry" title="click to retry" data-retry="${idSafe}">⚠ ${errSafe} — retry</span>`
      }
    }

    // All dynamic values pass through escapeHtml/sanitizeColor — safe innerHTML (all values escaped above)
    div.innerHTML = `${tsHtml}<span style="color:${platColor};font-size:10px;font-weight:700">[${platTag}]</span> ${senderLink} <span style="color:#808080">-&gt;</span> ${recipientLink}: ${processEmotes(escapeHtml(m.text), null)}${statusHtml}`
    frag.appendChild(div)
  }

  msgsEl.appendChild(frag)
  msgsEl.scrollTop = msgsEl.scrollHeight

  msgsEl.querySelectorAll('.hs-whisper-retry').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const id = el.getAttribute('data-retry')
      if (id) retryWhisperSend(id)
    })
  })
}


// --- multichat/eventsub-whispers.js ---
// EventSub WebSocket — Twitch whisper reception.
// IRC WHISPER delivery is deprecated/silently dropped since Feb 2023;
// the only documented path is EventSub user.whisper.message.

const ESW_URL = 'wss://eventsub.wss.twitch.tv/ws'
const ESW_HELIX_SUBS = 'https://api.twitch.tv/helix/eventsub/subscriptions'
const ESW_HELIX_USERS = 'https://api.twitch.tv/helix/users'
const ESW_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

const eswState = {
  ws: null,
  sessionId: null,
  selfUserId: null,
  destroyed: false,
  connecting: false,
  subscribed: false,
  reconnectTimer: null,
  reconnectDelay: 1000,
  keepaliveTimer: null,
  keepaliveTimeoutMs: 30000,
  lastMessageTime: 0,
  seenIds: new Set(),
  seenIdOrder: [],
}
const ESW_SEEN_MAX = 200

function eswMarkSeen(id) {
  if (!id) return false
  if (eswState.seenIds.has(id)) return true
  eswState.seenIds.add(id)
  eswState.seenIdOrder.push(id)
  if (eswState.seenIdOrder.length > ESW_SEEN_MAX) {
    const old = eswState.seenIdOrder.shift()
    eswState.seenIds.delete(old)
  }
  return false
}

async function eswFetchSelfUserId(token) {
  if (eswState.selfUserId) return eswState.selfUserId
  try {
    const resp = await fetch(ESW_HELIX_USERS, {
      headers: { 'Client-Id': ESW_CLIENT_ID, 'Authorization': 'Bearer ' + token },
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) { log('EventSub: /helix/users failed', resp.status); return null }
    const data = await resp.json()
    const id = data?.data?.[0]?.id
    if (id) eswState.selfUserId = id
    return id || null
  } catch (e) {
    log('EventSub: self id fetch failed:', e.message)
    return null
  }
}

async function eswSubscribeWhispers(token) {
  if (!eswState.sessionId || !eswState.selfUserId) return false
  try {
    const resp = await fetch(ESW_HELIX_SUBS, {
      method: 'POST',
      headers: {
        'Client-Id': ESW_CLIENT_ID,
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'user.whisper.message',
        version: '1',
        condition: { user_id: eswState.selfUserId },
        transport: { method: 'websocket', session_id: eswState.sessionId },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (resp.status === 202) {
      eswState.subscribed = true
      log('EventSub: subscribed user.whisper.message')
      return true
    }
    const txt = await resp.text().catch(() => '')
    log('EventSub: subscribe failed', resp.status, txt.slice(0, 200))
    if (resp.status === 401 || resp.status === 403) {
      // Token lacks user:read:whispers — give up (don't reconnect-loop)
      eswState.destroyed = true
      eswCleanup(true)
    }
    return false
  } catch (e) {
    log('EventSub: subscribe error', e.message)
    return false
  }
}

function eswCleanup(destroy = false) {
  if (destroy) eswState.destroyed = true
  if (eswState.keepaliveTimer) { cleanup.clearInterval(eswState.keepaliveTimer); eswState.keepaliveTimer = null }
  if (eswState.reconnectTimer) { cleanup.clearTimeout(eswState.reconnectTimer); eswState.reconnectTimer = null }
  if (eswState.oldWsCloseTimer) { cleanup.clearTimeout(eswState.oldWsCloseTimer); eswState.oldWsCloseTimer = null }
  if (eswState.oldWs) { try { eswState.oldWs.close() } catch {} eswState.oldWs = null }
  if (eswState.ws) {
    eswState.ws.onopen = null; eswState.ws.onclose = null; eswState.ws.onerror = null; eswState.ws.onmessage = null
    try { eswState.ws.close() } catch {}
  }
  eswState.ws = null
  eswState.sessionId = null
  eswState.subscribed = false
  eswState.connecting = false
}

function eswScheduleReconnect(token) {
  if (eswState.destroyed) return
  if (eswState.reconnectTimer) return
  const delay = eswState.reconnectDelay
  eswState.reconnectDelay = Math.min(delay * 2, 30000)
  log(`EventSub reconnect in ${delay}ms`)
  eswState.reconnectTimer = cleanup.setTimeout(() => {
    eswState.reconnectTimer = null
    if (eswState.destroyed) return
    if (eswState.ws?.readyState === WebSocket.OPEN) return
    eswConnect(token)
  }, delay)
}

// Pull a known color for a userId from anywhere we've seen them (whisper history, IRC buffers).
function eswResolveUserColor(userId) {
  if (typeof whisperUsers !== 'undefined') {
    for (const [, u] of whisperUsers) {
      if (u?.userId === userId && u?.color) return u.color
    }
  }
  return null
}

function eswHandleNotification(msg) {
  if (msg.metadata?.subscription_type !== 'user.whisper.message') return
  const event = msg.payload?.event
  if (!event) return

  const msgId = msg.metadata?.message_id
  if (eswMarkSeen(msgId)) return

  const text = event.whisper?.text || ''
  if (!text) return

  // Shape matches handleIncomingWhisper (whispers.js:128)
  handleIncomingWhisper({
    user: event.from_user_name || event.from_user_login || 'unknown',
    userId: event.from_user_id,
    text,
    color: eswResolveUserColor(event.from_user_id) || '#fff',
    time: msg.metadata?.message_timestamp
      ? new Date(msg.metadata.message_timestamp).getTime()
      : Date.now(),
    id: event.whisper_id || msgId || '',
  })
}

function eswHandleMessage(token) {
  return (event) => {
    eswState.lastMessageTime = Date.now()
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    const type = msg.metadata?.message_type
    if (!type) return

    if (type === 'session_welcome') {
      eswState.sessionId = msg.payload?.session?.id
      const kt = msg.payload?.session?.keepalive_timeout_seconds
      if (typeof kt === 'number') eswState.keepaliveTimeoutMs = (kt + 5) * 1000
      log('EventSub session welcome:', eswState.sessionId)
      // Reconnect-flow welcome carries existing subs over — only subscribe on first connect
      if (!eswState.subscribed) eswSubscribeWhispers(token)
      if (eswState.keepaliveTimer) cleanup.clearInterval(eswState.keepaliveTimer)
      eswState.keepaliveTimer = cleanup.setInterval(() => {
        if (Date.now() - eswState.lastMessageTime > eswState.keepaliveTimeoutMs) {
          log('EventSub: keepalive timeout — reconnecting')
          eswCleanup()
          eswScheduleReconnect(token)
        }
      }, 5000)
      eswState.reconnectDelay = 1000
      return
    }
    if (type === 'session_keepalive') return
    if (type === 'notification') { eswHandleNotification(msg); return }
    if (type === 'session_reconnect') {
      const newUrl = msg.payload?.session?.reconnect_url
      if (newUrl) {
        log('EventSub: server requested reconnect')
        eswConnect(token, newUrl)
      }
      return
    }
    if (type === 'revocation') {
      log('EventSub: subscription revoked', msg.payload?.subscription?.status)
      eswState.subscribed = false
      eswCleanup()
      eswScheduleReconnect(token)
      return
    }
  }
}

async function eswConnect(token, urlOverride) {
  if (eswState.connecting) return false
  if (!token) return false
  if (!eswState.selfUserId) {
    const id = await eswFetchSelfUserId(token)
    if (!id) { log('EventSub: no self user id, abort'); return false }
  }
  eswState.connecting = true
  eswState.destroyed = false

  // Reconnect-URL flow: keep old socket open until new one welcomes,
  // but stop the old keepalive timer so it can't fire against the stale lastMessageTime.
  const oldWs = urlOverride ? eswState.ws : null
  if (urlOverride) {
    if (eswState.keepaliveTimer) { cleanup.clearInterval(eswState.keepaliveTimer); eswState.keepaliveTimer = null }
  } else {
    eswCleanup()
  }

  try {
    const ws = new WebSocket(urlOverride || ESW_URL)
    eswState.ws = ws
    ws.onopen = () => { eswState.lastMessageTime = Date.now() }
    ws.onmessage = eswHandleMessage(token)
    ws.onclose = () => {
      log('EventSub: socket closed')
      if (eswState.destroyed) return
      eswScheduleReconnect(token)
    }
    ws.onerror = () => {}
    if (oldWs) {
      eswState.oldWs = oldWs
      eswState.oldWsCloseTimer = cleanup.setTimeout(() => {
        eswState.oldWsCloseTimer = null
        if (eswState.oldWs === oldWs) eswState.oldWs = null
        try { oldWs.onmessage = null; oldWs.onclose = null; oldWs.onerror = null; oldWs.close() } catch {}
      }, 5000)
    }
    eswState.connecting = false
    return true
  } catch (e) {
    log('EventSub: connect failed', e.message)
    eswState.connecting = false
    eswScheduleReconnect(token)
    return false
  }
}

async function startEventSubWhispers() {
  // Async fetch reaches twitch cookies even on Kick/YouTube tabs (via background.js)
  const { token } = await getTwitchAuthTokenAsync()
  if (!token) { log('EventSub: no Twitch token, skipping whispers'); return }
  await eswConnect(token)
}

async function reconnectEventSubIfDead() {
  if (eswState.destroyed) return
  if (eswState.ws?.readyState === WebSocket.OPEN) return
  if (eswState.connecting) return
  const { token } = await getTwitchAuthTokenAsync()
  if (!token) return
  log('EventSub: reconnecting (visibility/wake)')
  eswConnect(token)
}


// --- multichat/input.js ---
// Input - chat input, autocomplete, send message, reply state

// Message history — up/down arrow recalls previously sent messages
const mcMessageHistory = []
const MC_HISTORY_MAX = 50
let mcHistoryIndex = -1
let mcHistoryDraft = ''

// Brief red flash on input to indicate message can't be sent from this tab
function flashInputError(input) {
  if (!input) return
  input.style.background = '#400000'
  input.style.borderColor = '#ff0000'
  setTimeout(() => {
    input.style.background = ''
    input.style.borderColor = ''
  }, 600)
}

// Per-emote operation lock to prevent race conditions from rapid clicking
const pendingEmoteOps = new Set();

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

// Emoji dropdown autocomplete state
let emojiAcState = {
  active: false,
  matches: [],
  index: 0,
  query: '',
  colonPos: -1,    // position of the triggering ':'
}
let _emojiAcDebounce = null

// Slash command autocomplete dropdown — shows command list when input begins
// with /<word>. Heatsync-owned + common pass-through Twitch/Kick mod commands.
const SLASH_COMMANDS = [
  { cmd: 'op',         args: '<text>',        desc: 'post to home feed' },
  { cmd: 'w',          args: '<user> <msg>',  desc: 'twitch whisper' },
  { cmd: 'dm',         args: '<user> <msg>',  desc: 'heatsync DM' },
  { cmd: 'r',          args: '<msg>',         desc: 'reply to last whisper' },
  { cmd: 'mute',       args: '<user>',        desc: 'local mute 24h' },
  { cmd: 'unmute',     args: '<user>',        desc: 'local unmute' },
  { cmd: 'shrug',      args: '[text]',        desc: 'append ¯\\_(ツ)_/¯' },
  { cmd: 'tableflip',  args: '[text]',        desc: 'append (╯°□°)╯︵ ┻━┻' },
  { cmd: 'unflip',     args: '[text]',        desc: 'append ┬─┬ノ( ゜-゜ノ)' },
  { cmd: 'lclear',     args: '',              desc: 'clear current tab locally' },
  { cmd: 'help',       args: '',              desc: 'list commands' },
  { cmd: 'me',         args: '<action>',      desc: 'twitch/kick action message' },
  { cmd: 'ban',        args: '<user>',        desc: 'twitch/kick ban (mod)' },
  { cmd: 'timeout',    args: '<user> [secs]', desc: 'twitch/kick timeout (mod)' },
  { cmd: 'unban',      args: '<user>',        desc: 'twitch/kick unban (mod)' },
  { cmd: 'untimeout',  args: '<user>',        desc: 'twitch/kick untimeout (mod)' },
  { cmd: 'color',      args: '<hex|name>',    desc: 'twitch chat color' },
  { cmd: 'mod',        args: '<user>',        desc: 'promote mod (broadcaster)' },
  { cmd: 'vip',        args: '<user>',        desc: 'add vip (broadcaster)' },
  { cmd: 'raid',       args: '<channel>',     desc: 'twitch raid (broadcaster)' },
  { cmd: 'slow',       args: '[secs]',        desc: 'slow mode (mod)' },
  { cmd: 'clear',      args: '',              desc: 'clear chat (mod)' },
  { cmd: 'followers',  args: '[mins]',        desc: 'followers-only (mod)' },
  { cmd: 'emoteonly',  args: '',              desc: 'emote-only mode (mod)' },
]
let slashAcState = { active: false, matches: [], index: 0 }
function rebuildInput() {
  const bar = document.getElementById('hs-mc-inputbar');
  if (!bar) return;

  // Save current text
  const oldInput = document.getElementById('hs-mc-input');
  const savedText = oldInput ? getInputText() : pendingMessage;

  // Remove old input and its wrap/highlight overlay (created by updateCharCount for plain <input>)
  const oldWrap = document.getElementById('hs-mc-input-wrap');
  if (oldWrap) oldWrap.remove();
  const oldHighlight = document.getElementById('hs-mc-input-highlight');
  if (oldHighlight) oldHighlight.remove();
  if (oldInput) oldInput.remove();

  // Create new input element
  const emoteBtn = bar.querySelector('#hs-mc-emote-btn');
  if (wysiwygEnabled) {
    const div = document.createElement('div');
    div.id = 'hs-mc-input';
    div.contentEditable = 'true';
    div.setAttribute('data-placeholder', t('mc_input_send_message'));
    div.spellcheck = false;
    if (emoteBtn) bar.insertBefore(div, emoteBtn);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'hs-mc-input';
    input.placeholder = t('mc_input_send_message');
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
    ? `<div id="hs-mc-input" contenteditable="true" data-placeholder="${t('mc_input_send_message')}" spellcheck="false"></div>`
    : `<input type="text" id="hs-mc-input" placeholder="${t('mc_input_send_message')}" autocomplete="off" spellcheck="false">`;

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
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-mc-user')) {
        // Bare-username mention chip: send as raw username
        text += node.dataset.username || node.textContent || ''
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
  // Sync highlight overlay scroll with input scroll (RAF-throttled)
  let _inputScrollRaf = null
  input.addEventListener('scroll', () => {
    if (_inputScrollRaf) return
    _inputScrollRaf = requestAnimationFrame(() => {
      _inputScrollRaf = null
      const hl = document.getElementById('hs-mc-input-highlight')
      if (hl) hl.scrollLeft = input.scrollLeft
    })
  }, { passive: true })
  input.addEventListener('input', () => {
    const hasText = (input.value || input.textContent || '').trim().length > 0
    if (hasText) showInputBar()
    else hideInputBar()
  });
  input.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 150)
    setTimeout(hideEmojiDropdown, 150)
    setTimeout(hideSlashDropdown, 150)
    // Hide input bar after blur if empty (delay to allow click-to-emote-picker)
    // Skip if window lost focus — prevents hiding when switching apps
    setTimeout(() => { if (document.hasFocus()) hideInputBar() }, 200)
  });
  sendBtn?.addEventListener('click', sendMessage);

  // Set up drag-drop handlers for media upload
  setupMediaDropHandlers();

  // Pasted image handler — applies in BOTH wysiwyg and plain modes
  input.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleMediaUpload(file);
          return;
        }
      }
    }
  });

  // WYSIWYG: handle paste to strip formatting
  if (wysiwygEnabled) {
    input.addEventListener('paste', (e) => {
      // If a previous handler already prevented default (image upload), skip
      if (e.defaultPrevented) return;
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

  // Global Tab key to focus input — only when multichat panel is active
  if (!window._hsMcTabHandler) {
    window._hsMcTabHandler = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (currentTab === 'add' || currentTab === 'settings') return;
      const active = document.activeElement;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;
      // Don't steal Tab from other inputs (except Twitch's chat input)
      if (active && active !== document.body && active.tagName === 'INPUT' && active.id !== 'hs-mc-input' && !active.dataset?.aTarget) return;
      if (active && active !== document.body && active.tagName === 'TEXTAREA' && active.id !== 'hs-mc-input') return;

      // If not already in our input, reveal bar and focus it
      if (active !== input) {
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
      if (currentTab === 'add' || currentTab === 'settings') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal focus from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      // Only printable chars — skip modifiers, nav, function keys
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length !== 1) return
      // Prevent platform shortcuts (Kick fullscreen "f", theater "t", etc.)
      e.preventDefault()
      e.stopImmediatePropagation()
      showInputBar()
      input.focus()
      // Manually insert the character since we prevented default
      if (input.isContentEditable) {
        document.execCommand('insertText', false, e.key)
      } else {
        input.value += e.key
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, { capture: true, signal: mcSignal })

    // Catch paste when input bar is hidden — reveal bar and insert text
    document.addEventListener('paste', (e) => {
      if (inputBarVisible) return
      if (currentTab === 'add') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal paste from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      // Check for pasted image first
      const items = e.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              e.preventDefault()
              handleMediaUpload(file)
              return
            }
          }
        }
      }
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

      // Prevent race conditions from rapid clicking
      if (pendingEmoteOps.has(emoteName)) return;

      if (state === 'blocked') {
        unblockEmote(emoteName);
      } else if (state === 'owned') {
        removeEmoteFromInventory(emoteName, e.target);
      } else {
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
        unblockEmote(emoteName);
      } else if (state === 'owned' || state === 'global' || state === 'channel') {
        // Paste to input (no lock needed — instant, no async)
        showInputBar();
        pasteEmoteToInput(emoteName);
        const input = document.getElementById('hs-mc-input');
        if (input) input.focus();
        flashAllEmotes(emoteName, 'hs-flash-paste');
      } else if (state === 'unadded') {
        if (pendingEmoteOps.has(emoteName)) return;
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

  // Right-click on message → mute/unmute user (synced across all tabs + devices via server WS)
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

      let wasUnmute = false;
      if (mutedUsers.has(username)) {
        mutedUsers.delete(username);
        wasUnmute = true;
        showToast(`unmuted ${username}`);
        // Sync: tell background to unmute (broadcasts to all tabs — server mute expires naturally)
        safeSendMessage({ type: 'unmute_user', username });
      } else {
        mutedUsers.add(username);
        showToast(`muted ${username} (24h)`);
        // Sync: tell background to mute with 24h expiry (broadcasts to all tabs + server)
        const expiresAt = Date.now() + 86400000;
        safeSendMessage({ type: 'mute_user', username, expiresAt });
      }
      // Also persist locally for offline/fallback
      chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] });
      // Strip destroys DOM irreversibly — drop those rows so renderMessages
      // rebuilds them from the buffer's _renderedHtml cache.
      if (wasUnmute) restoreMcUnmutedDom(username);
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
function restoreMcUnmutedDom(username) {
  // stripMcMutedMessage destroys content irreversibly. Remove those rows so the
  // next renderMessages() call rebuilds them from the buffer's _renderedHtml cache.
  const target = username?.toLowerCase()
  document.querySelectorAll('.hs-mc-msg.hs-mc-muted').forEach(msg => {
    const userEl = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
    const u = userEl?.textContent?.trim()?.toLowerCase()
    if (!target || u === target) msg.remove()
  })
}
function stripMcMutedMessage(msg) {
  msg.classList.add('hs-mc-muted');
  // Message content is raw text nodes on the div — CSS can't hide those
  [...msg.childNodes].forEach(node => {
    if (node.nodeType === 3) node.textContent = '';
  });
  // Mention links share .hs-mc-user (so they get color/hover) but live inside
  // the message body — strip them or they leak through the muted CSS.
  msg.querySelectorAll('.hs-mc-mention, .hs-mc-reply-ctx').forEach(el => el.remove());
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
    placeholder = t('mc_input_post_heatsync');
  } else if (currentTab === 'live') {
    const channel = getLiveChannel();
    placeholder = channel ? t('mc_input_send_channel', [channel]) : t('mc_input_send_message');
  } else if (currentTab === 'mentions') {
    const channel = getCurrentChannel();
    placeholder = channel ? t('mc_input_send_channel', [channel]) : t('mc_input_send_message');
  } else if (currentTab === 'whispers') {
    const lastUser = lastWhisperKey ? whisperUsers.get(lastWhisperKey) : null
    placeholder = lastUser ? `/r to reply to ${lastUser.displayName}` : t('mc_whisper_hint')
  } else if (currentTab === 'add') {
    placeholder = '';
  } else {
    // Channel tab — resolve display name for placeholder
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab);
    const chanName = typeof ch === 'string' ? ch : (ch?.twitch || ch?.kick || ch?.youtube?.replace(/^https?:\/\/(www\.)?youtube\.com\/@?/, '').replace(/\/.*/, '') || ch?.id);
    placeholder = t('mc_input_send_channel', [chanName]);
  }

  if (wysiwygEnabled) {
    input.dataset.placeholder = placeholder;
  } else {
    input.placeholder = placeholder;
  }
}
function handleInputKeydown(e) {
  const input = e.target;

  // Stop propagation so platform shortcuts (Kick theater "t", etc.) don't fire
  e.stopPropagation()

  // Slash dropdown navigation — intercept before emoji/tab/enter
  if (slashAcState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashAcState.index = (slashAcState.index + 1) % slashAcState.matches.length
      showSlashDropdown(slashAcState.matches, slashAcState.index)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashAcState.index = (slashAcState.index - 1 + slashAcState.matches.length) % slashAcState.matches.length
      showSlashDropdown(slashAcState.matches, slashAcState.index)
      return
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const sel = slashAcState.matches[slashAcState.index]
      if (sel) insertSlashCommand(sel)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideSlashDropdown()
      return
    }
  }

  // Emoji dropdown navigation — intercept before other handlers
  if (emojiAcState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      emojiAcState.index = (emojiAcState.index + 1) % emojiAcState.matches.length
      showEmojiDropdown(emojiAcState.matches, emojiAcState.index)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      emojiAcState.index = (emojiAcState.index - 1 + emojiAcState.matches.length) % emojiAcState.matches.length
      showEmojiDropdown(emojiAcState.matches, emojiAcState.index)
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const emojiMatch = emojiAcState.matches[emojiAcState.index]
      // Build full match list for Tab cycling (emotes + emojis matching the query)
      const allMatches = findEmoteMatches(':' + emojiAcState.query)
      insertEmojiFromDropdown(emojiMatch)
      // Set up acState so subsequent Tabs cycle through all matches
      if (e.key === 'Tab' && allMatches.length > 1) {
        acState.matches = allMatches
        // Find the inserted emoji's index in the full match list
        acState.index = allMatches.findIndex(m => m.type === 'emoji' && m.emoji === emojiMatch.emoji)
        if (acState.index === -1) acState.index = 0
        acState.active = true
        // For plain text input, set wordStart/afterText so cycling works
        if (!wysiwygEnabled && input.value !== undefined) {
          const val = input.value
          const cursor = input.selectionStart
          // The emoji was just inserted — find where it starts
          acState.wordStart = cursor - emojiMatch.emoji.length
          // afterText is everything after cursor
          acState.afterText = val.slice(cursor)
        }
        // For WYSIWYG, mark the inserted emoji span as cycling element
        if (wysiwygEnabled) {
          const input = document.getElementById('hs-mc-input')
          const sel = window.getSelection()
          if (sel?.rangeCount && input) {
            // Find the emoji text we just inserted and wrap it in cycling span
            const range = sel.getRangeAt(0)
            const node = range.startContainer
            if (node?.nodeType === Node.TEXT_NODE) {
              const text = node.textContent
              const emojiIdx = text.lastIndexOf(emojiMatch.emoji)
              if (emojiIdx >= 0) {
                const before = text.slice(0, emojiIdx)
                const after = text.slice(emojiIdx + emojiMatch.emoji.length)
                node.textContent = before
                const span = document.createElement('span')
                span.className = 'hs-cycling-text'
                span.textContent = emojiMatch.emoji
                span.dataset.completionName = emojiMatch.name
                const afterNode = document.createTextNode(after)
                const parent = node.parentNode
                const next = node.nextSibling
                if (next) {
                  parent.insertBefore(span, next)
                  parent.insertBefore(afterNode, next)
                } else {
                  parent.appendChild(span)
                  parent.appendChild(afterNode)
                }
                placeCaretAfter(afterNode.textContent ? afterNode : span)
              }
            }
          }
        }
        showCycleTooltip()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideEmojiDropdown()
      return
    }
  }

  // Message history navigation (ArrowUp/ArrowDown)
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && mcMessageHistory.length > 0) {
    const currentText = getInputText().trim()
    if (mcHistoryIndex >= 0 || (e.key === 'ArrowUp' && currentText.length === 0) || (e.key === 'ArrowUp' && mcMessageHistory.includes(currentText))) {
      e.preventDefault()
      if (e.key === 'ArrowUp') {
        if (mcHistoryIndex < 0) mcHistoryDraft = currentText
        mcHistoryIndex = Math.min(mcHistoryIndex + 1, mcMessageHistory.length - 1)
      } else {
        mcHistoryIndex--
      }
      const text = mcHistoryIndex < 0 ? mcHistoryDraft : mcMessageHistory[mcHistoryIndex]
      if (wysiwygEnabled) {
        input.textContent = text
      } else {
        input.value = text
      }
      mcHistoryIndex = Math.max(mcHistoryIndex, -1)
      return
    }
  }

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

  // Slash command autocomplete — synchronous, only matches "/word" at start
  checkSlashAutocomplete()

  // Debounced emoji dropdown autocomplete
  if (_emojiAcDebounce) cleanup.clearTimeout(_emojiAcDebounce)
  _emojiAcDebounce = cleanup.setTimeout(checkEmojiAutocomplete, 80)

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

function getRecencyMap() {
  // Returns Map<usernameLower, recencyRank> from current tab's chat buffer.
  // Lower rank = more recent. Caps at 50 unique users for sub-ms cost.
  const out = new Map()
  if (typeof smartCompletion === 'undefined' || !smartCompletion) return out
  if (typeof irc === 'undefined' || !irc?.channels) return out
  let ch = currentTab
  if (currentTab === 'live' && typeof getLiveChannel === 'function') ch = getLiveChannel()
  if (!ch) return out
  const buffer = irc.channels.get(typeof ch === 'string' ? ch.toLowerCase() : ch)
  if (!buffer?.getAll) return out
  const msgs = buffer.getAll()
  let rank = 0
  for (let i = msgs.length - 1; i >= 0 && rank < 50; i--) {
    const u = (msgs[i]?.user || '').toLowerCase()
    if (!u || out.has(u)) continue
    out.set(u, rank++)
  }
  return out
}

function findEmoteMatches(search) {
  const matches = [];

  // Check if searching for username (starts with @)
  const isUserSearch = search.startsWith('@');
  const searchTerm = isUserSearch ? search.slice(1) : search;
  const searchLower = searchTerm.toLowerCase();

  const recency = getRecencyMap()

  // Search usernames if @ prefix or if it could be a username
  if (isUserSearch || searchTerm.length >= 2) {
    for (const username of usernameCache) {
      if (!username) continue
      const userLower = username.toLowerCase();
      const color = (typeof knownColors !== 'undefined' && knownColors.get(userLower)) || '#fff'
      const recencyRank = recency.get(userLower)
      if (isUserSearch) {
        if (userLower.startsWith(searchLower)) {
          matches.push({ name: '@' + username, url: null, priority: 0, type: 'user', recencyRank });
        }
      } else {
        // No @ prefix: bare-name completion that renders as a styled mention chip
        if (userLower.startsWith(searchLower)) {
          matches.push({ name: username, url: null, priority: 0, type: 'user-bare', color, recencyRank });
        } else if (userLower.includes(searchLower)) {
          matches.push({ name: username, url: null, priority: 2, type: 'user-bare', color, recencyRank });
        }
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
      // Only tab-complete heatsync emotes you own (can't send emotes not in your set)
      if (emote.source === 'heatsync' && emote.state !== 'owned') continue;
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

  // Sort: prefix matches first, then by recency for username matches, then alphabetical
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ar = (a.recencyRank ?? Infinity)
    const br = (b.recencyRank ?? Infinity)
    if (ar !== br) return ar - br;
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

// Build a styled mention chip span for bare-username completion
function createUserMentionSpan(username, color) {
  const span = document.createElement('span')
  span.className = 'hs-mc-user hs-cycling-user'
  const lower = username.toLowerCase()
  span.dataset.username = lower
  span.dataset.completionType = 'user-bare'
  span.textContent = username
  const safeColor = (typeof sanitizeColor === 'function') ? sanitizeColor(color || '#fff') : (color || '#fff')
  span.style.color = safeColor
  span.style.fontWeight = 'bold'
  span.style.cursor = 'pointer'
  span.contentEditable = 'false'
  // Click opens user profile — contenteditable swallows anchor clicks, so use explicit handler
  span.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(`https://heatsync.org/user/${encodeURIComponent(lower)}`, '_blank', 'noopener,noreferrer')
  })
  return span
}

// WYSIWYG emote insertion
function insertCompletionWysiwyg(match) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  // Check if we're replacing an existing cycling element (emote img, text span, or user span)
  const existingEmote = input.querySelector('img.hs-cycling-emote');
  const existingText = input.querySelector('span.hs-cycling-text');
  const existingUser = input.querySelector('span.hs-cycling-user');
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
    } else if (match.type === 'user-bare') {
      const userSpan = createUserMentionSpan(match.name, match.color)
      existingEmote.replaceWith(userSpan)
      const space = userSpan.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(userSpan)
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
    } else if (match.type === 'user-bare') {
      const userSpan = createUserMentionSpan(match.name, match.color)
      existingText.replaceWith(userSpan)
      const space = userSpan.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(userSpan)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingText.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }
  if (existingUser) {
    if (match.url) {
      // Replace user span with emote img
      const img = document.createElement('img')
      img.src = match.url
      img.alt = match.name
      img.dataset.emoteName = match.name
      img.className = 'hs-input-emote hs-cycling-emote'
      img.draggable = false
      existingUser.replaceWith(img)
      const space = img.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(img)
    } else if (match.type === 'emoji') {
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.emoji
      span.dataset.completionName = match.name
      existingUser.replaceWith(span)
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else if (match.type === 'user-bare') {
      // Update existing user span in place
      existingUser.textContent = match.name
      existingUser.dataset.username = match.name.toLowerCase()
      const safeColor = (typeof sanitizeColor === 'function') ? sanitizeColor(match.color || '#fff') : (match.color || '#fff')
      existingUser.style.color = safeColor
      const space = existingUser.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingUser)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingUser.replaceWith(textNode)
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
  } else if (match.type === 'user-bare') {
    // Bare-name mention chip: colored, hoverable, clickable
    const userSpan = createUserMentionSpan(match.name, match.color)
    insertElement(userSpan)
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
    const cyclingUser = input?.querySelector('.hs-cycling-user');
    if (cyclingUser) {
      // Keep the styled mention span — just clear the cycling marker
      cyclingUser.classList.remove('hs-cycling-user');
    }
  }
}

// --- Emoji dropdown autocomplete ---

function getEmojiColonContext(input) {
  // Returns { query, colonPos } if user is typing :shortcode, else null
  if (wysiwygEnabled) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return null
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node?.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent
    const cursor = range.startOffset
    const before = text.slice(0, cursor)
    // Find last unmatched ':' — must not contain spaces or a closing ':'
    const match = before.match(/:([a-z0-9_]{2,})$/)
    if (!match) return null
    // Make sure this ':' isn't part of a completed :shortcode:
    const colonIdx = before.lastIndexOf(':')
    return { query: match[1], colonPos: colonIdx, textNode: node }
  }
  // Standard input
  const text = input.value
  const cursor = input.selectionStart
  const before = text.slice(0, cursor)
  const match = before.match(/:([a-z0-9_]{2,})$/)
  if (!match) return null
  const colonIdx = before.lastIndexOf(':')
  return { query: match[1], colonPos: colonIdx, textNode: null }
}

function filterEmoji(query) {
  if (_emojiMap.size === 0) return []
  const results = []
  const q = query.toLowerCase()
  for (const entry of EMOJI_DATA) {
    if (results.length >= 8) break
    if (entry.name.startsWith(q)) {
      results.push(entry)
    }
  }
  // If we have room, add substring matches
  if (results.length < 8) {
    for (const entry of EMOJI_DATA) {
      if (results.length >= 8) break
      if (!entry.name.startsWith(q) && entry.name.includes(q)) {
        results.push(entry)
      }
    }
  }
  return results
}

function showEmojiDropdown(matches, selectedIndex) {
  let dd = document.getElementById('hs-mc-emoji-dropdown')
  if (!dd) {
    dd = document.createElement('div')
    dd.id = 'hs-mc-emoji-dropdown'
    document.getElementById('hs-mc-inputbar')?.appendChild(dd)
  }
  dd.textContent = ''
  matches.forEach((entry, i) => {
    const row = document.createElement('div')
    row.className = 'hs-mc-emoji-row' + (i === selectedIndex ? ' selected' : '')
    row.dataset.index = i

    const emojiSpan = document.createElement('span')
    emojiSpan.className = 'hs-mc-emoji-preview'
    emojiSpan.textContent = entry.emoji

    const nameSpan = document.createElement('span')
    nameSpan.className = 'hs-mc-emoji-name'
    nameSpan.textContent = ':' + entry.name + ':'

    row.appendChild(emojiSpan)
    row.appendChild(nameSpan)

    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertEmojiFromDropdown(entry)
    })

    dd.appendChild(row)
  })
  dd.style.display = 'block'
}

function hideEmojiDropdown() {
  emojiAcState.active = false
  emojiAcState.matches = []
  emojiAcState.index = 0
  emojiAcState.query = ''
  emojiAcState.colonPos = -1
  const dd = document.getElementById('hs-mc-emoji-dropdown')
  if (dd) dd.style.display = 'none'
}

function insertEmojiFromDropdown(entry) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  if (wysiwygEnabled) {
    // Find the text node with the :query and replace it
    const sel = window.getSelection()
    if (!sel?.rangeCount) { hideEmojiDropdown(); return }
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node?.nodeType !== Node.TEXT_NODE) { hideEmojiDropdown(); return }
    const text = node.textContent
    const cursor = range.startOffset
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) { hideEmojiDropdown(); return }

    // Replace :query with emoji
    const newText = text.slice(0, colonIdx) + entry.emoji + text.slice(cursor)
    node.textContent = newText
    const newPos = colonIdx + entry.emoji.length
    const newRange = document.createRange()
    newRange.setStart(node, Math.min(newPos, node.textContent.length))
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  } else {
    const text = input.value
    const cursor = input.selectionStart
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) { hideEmojiDropdown(); return }

    input.value = text.slice(0, colonIdx) + entry.emoji + text.slice(cursor)
    const newPos = colonIdx + entry.emoji.length
    input.selectionStart = input.selectionEnd = newPos
  }

  pendingMessage = getInputText()
  updateCharCount()
  hideEmojiDropdown()
  input.focus()
}

function checkEmojiAutocomplete() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  if (typeof EMOJI_DATA === 'undefined') return

  const ctx = getEmojiColonContext(input)
  if (!ctx) {
    if (emojiAcState.active) hideEmojiDropdown()
    return
  }

  const matches = filterEmoji(ctx.query)
  if (matches.length === 0) {
    if (emojiAcState.active) hideEmojiDropdown()
    return
  }

  emojiAcState.active = true
  emojiAcState.matches = matches
  emojiAcState.query = ctx.query
  emojiAcState.colonPos = ctx.colonPos
  emojiAcState.index = 0
  showEmojiDropdown(matches, 0)
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
  label.textContent = '\u21a9 ' + t('mc_input_replying_to', [state.user])
  const cancel = document.createElement('button')
  cancel.id = 'hs-mc-reply-cancel'
  cancel.textContent = '✕'
  cancel.title = t('mc_input_cancel_reply')
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

// Async version — returns { token, username } for cross-platform Twitch posting
// Tries document.cookie first, falls back to background.js cookies API
async function getTwitchAuthTokenAsync() {
  const localToken = getTwitchAuthToken()
  if (localToken) return { token: localToken, username: null }
  // Cross-domain: ask background.js to read Twitch cookies
  try {
    const resp = await safeSendMessage({ type: 'get_twitch_auth_token' })
    return { token: resp?.token || null, username: resp?.username || null }
  } catch {}
  return { token: null, username: null }
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
  hideEmojiDropdown()
  hideSlashDropdown()
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
}

function checkSlashAutocomplete() {
  const text = (typeof getInputText === 'function' ? getInputText() : '') || ''
  const m = text.match(/^\/([a-z?]*)$/i)
  if (!m) { hideSlashDropdown(); return }
  const q = m[1].toLowerCase()
  const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(q)).slice(0, 8)
  if (matches.length === 0) { hideSlashDropdown(); return }
  if (!slashAcState.active || slashAcState.index >= matches.length) slashAcState.index = 0
  slashAcState.active = true
  slashAcState.matches = matches
  showSlashDropdown(matches, slashAcState.index)
}

function showSlashDropdown(matches, idx) {
  let dd = document.getElementById('hs-mc-slash-dropdown')
  if (!dd) {
    dd = document.createElement('div')
    dd.id = 'hs-mc-slash-dropdown'
    document.getElementById('hs-mc-inputbar')?.appendChild(dd)
  }
  dd.textContent = ''
  matches.forEach((c, i) => {
    const row = document.createElement('div')
    row.className = 'hs-mc-slash-row' + (i === idx ? ' selected' : '')
    row.dataset.index = i
    const name = document.createElement('span')
    name.className = 'hs-mc-slash-name'
    name.textContent = '/' + c.cmd
    const args = document.createElement('span')
    args.className = 'hs-mc-slash-args'
    args.textContent = c.args ? ' ' + c.args : ''
    const desc = document.createElement('span')
    desc.className = 'hs-mc-slash-desc'
    desc.textContent = c.desc
    row.appendChild(name)
    row.appendChild(args)
    row.appendChild(desc)
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertSlashCommand(c)
    })
    dd.appendChild(row)
  })
  dd.style.display = 'block'
}

function hideSlashDropdown() {
  slashAcState.active = false
  slashAcState.matches = []
  slashAcState.index = 0
  const dd = document.getElementById('hs-mc-slash-dropdown')
  if (dd) dd.style.display = 'none'
}

function insertSlashCommand(c) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  const inserted = '/' + c.cmd + (c.args ? ' ' : '')
  if (wysiwygEnabled) {
    input.textContent = inserted
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    if (sel) { sel.removeAllRanges(); sel.addRange(range) }
  } else {
    input.value = inserted
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(inserted.length, inserted.length)
    }
  }
  hideSlashDropdown()
  pendingMessage = inserted
  if (typeof updateCharCount === 'function') updateCharCount()
  input.focus()
}

// Slash commands we own. Anything not in here falls through to the platform
// (Twitch IRC / Kick) so /ban /timeout /mod /vip /raid /clear /slow /me etc
// just work for users with mod perms.
//
// Handler return contract:
//   true     -> consumed, do nothing else
//   string   -> rewrite the outgoing text to this and continue normal send
//   anything else -> not a slash command we handle, pass through unchanged
const SLASH_ALIASES = {
  post: 'op',
  whisper: 'w',
  re: 'r',
  reply: 'r',
  unban: null,        // pass through to platform
  untimeout: null,    // pass through to platform
  lc: 'lclear',
  '?': 'help',
}

async function handleSlashCommand(text, input) {
  const parts = text.match(/^\/(\w+|\?)\s*(.*)$/)
  if (!parts) return false
  let [, cmd, rest] = parts
  cmd = cmd.toLowerCase()
  if (SLASH_ALIASES[cmd] === null) return false  // explicit pass-through
  if (typeof SLASH_ALIASES[cmd] === 'string') cmd = SLASH_ALIASES[cmd]

  if (cmd === 'op') {
    if (!rest.trim()) { showToast('usage: /op <text>'); return true }
    await postFeedMessage(rest.trim(), { topLevel: true })
    return true
  }

  if (cmd === 'w') {
    const match = rest.match(/^@?(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /w <user> <message>'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('twitch', username, msg, input)
    return true
  }

  if (cmd === 'dm') {
    const match = rest.match(/^@?(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /dm <user> <message>'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('heatsync', username, msg, input)
    return true
  }

  if (cmd === 'r') {
    if (!rest.trim()) { showToast('usage: /r <message>'); return true }
    if (!lastWhisperKey) { showToast('no one to reply to'); return true }
    if (currentTab !== 'whispers') switchTab('whispers')
    await sendWhisperMessage(lastWhisperKey, rest.trim())
    clearInput(input)
    return true
  }

  if (cmd === 'mute') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) { showToast('usage: /mute <user>'); return true }
    if (mutedUsers.has(u)) { showToast(`${u} already muted`); return true }
    mutedUsers.add(u)
    chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
    safeSendMessage({ type: 'mute_user', username: u, expiresAt: Date.now() + 86400000 })
    showToast(`muted ${u} (24h)`)
    renderMessages(currentTab)
    return true
  }

  if (cmd === 'unmute') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) { showToast('usage: /unmute <user>'); return true }
    if (!mutedUsers.has(u)) { showToast(`${u} not muted`); return true }
    mutedUsers.delete(u)
    chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
    safeSendMessage({ type: 'unmute_user', username: u })
    showToast(`unmuted ${u}`)
    renderMessages(currentTab)
    return true
  }

  if (cmd === 'shrug') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '¯\\_(ツ)_/¯'
  }

  if (cmd === 'tableflip') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '(╯°□°)╯︵ ┻━┻'
  }

  if (cmd === 'unflip') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '┬─┬ノ( ゜-゜ノ)'
  }

  if (cmd === 'lclear') {
    let cleared = 0
    if (irc?.channels?.has(currentTab)) { irc.channels.get(currentTab).clear?.(); cleared++ }
    if (kickChat?.channels?.has(currentTab)) { kickChat.channels.get(currentTab).clear?.(); cleared++ }
    renderMessages(currentTab)
    showToast(cleared ? 'local buffer cleared' : 'nothing to clear here')
    clearInput(input)
    return true
  }

  if (cmd === 'help') {
    showSlashHelp()
    clearInput(input)
    return true
  }

  return false
}

const SLASH_HELP_LINES = [
  '/op <text>           — post to home',
  '/w <user> <msg>      — twitch whisper',
  '/dm <user> <msg>     — heatsync DM',
  '/r <msg>             — reply to last whisper',
  '/mute <user>         — local mute (24h)',
  '/unmute <user>       — local unmute',
  '/shrug [text]        — append ¯\\_(ツ)_/¯',
  '/tableflip [text]    — append (╯°□°)╯︵ ┻━┻',
  '/unflip [text]       — append ┬─┬ノ( ゜-゜ノ)',
  '/lclear              — clear current tab locally',
  '/help                — this list',
  '',
  'mod commands (/ban /timeout /unban /mod /vip /raid',
  '/slow /clear /followers /emoteonly /color /me etc.)',
  'pass through to twitch & kick when you have permission.',
]

function showSlashHelp() {
  // Reuse toast for short feedback — but the help list is multi-line, so build a
  // lightweight inline overlay instead.
  let panel = document.getElementById('hs-mc-slash-help')
  if (panel) { panel.remove(); return }
  panel = document.createElement('div')
  panel.id = 'hs-mc-slash-help'
  panel.style.cssText = 'position:fixed;bottom:60px;right:20px;z-index:99999;background:#000;border:2px solid #ff8700;padding:10px 14px;font:12px/1.4 monospace;color:#fff;white-space:pre;max-width:420px;box-shadow:0 0 12px rgba(255,135,0,0.5)'
  panel.textContent = SLASH_HELP_LINES.join('\n')
  panel.addEventListener('click', () => panel.remove())
  document.body.appendChild(panel)
  setTimeout(() => panel?.remove(), 12000)
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
          showToast(t('mc_whisper_user_not_found', [username]))
          return
        }
        whisperUsersSet(key, { platform: 'twitch', userId: body, displayName: username, color: '#fff' })
      } catch (e) {
        showToast(t('mc_whisper_resolve_failed'))
        return
      }
    }
  } else {
    // HeatSync DM — resolve username → user_id via profile API
    const profileResp = await apiFetch(`/api/profile/${encodeURIComponent(lowerUser)}`)
    if (!profileResp.ok || !profileResp.data?.profile?.user_id) {
      showToast(t('mc_whisper_hs_not_found', [username]))
      return
    }
    const userId = profileResp.data.profile.user_id
    key = `hs:${userId}`
    whisperUsersSet(key, {
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

  let text = convertEmojiShortcodes(getInputText().trim());
  if (!text) { console.warn('[HS] SEND BAIL: empty text'); return; }

  // Slash commands — work from any tab. Handler may return:
  //   true   -> consumed, exit
  //   string -> rewrite outgoing text and continue normal send
  //   else   -> not ours, pass raw text through to platform
  if (text.startsWith('/')) {
    const result = await handleSlashCommand(text, input)
    if (result === true) return
    if (typeof result === 'string') text = result
  }

  // Non-chat tabs — plain text not allowed, use slash commands
  if (currentTab === 'whispers' || currentTab === 'feed' || currentTab === 'mentions') {
    flashInputError(input)
    return
  }

  // Determine target channel + platform
  let targetChannel
  let ch = null
  if (currentTab === 'live') {
    targetChannel = getLiveChannel()
  } else if (currentTab === 'add' || currentTab === 'settings') {
    flashInputError(input)
    return
  } else {
    ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
    targetChannel = typeof ch === 'string' ? ch : ch?.twitch || ch?.kick || currentTab
  }

  if (!targetChannel) {
    flashInputError(input)
    return
  }

  // Resolve platform targets
  const kickSlug = typeof ch !== 'string' ? ch?.kick : null
  const twitchName = typeof ch === 'string' ? ch : ch?.twitch
  const isLiveKick = currentTab === 'live' && hostPlatform === 'kick'

  const sendToKick = !!kickSlug || isLiveKick
  const sendToTwitch = !!twitchName && !isLiveKick

  const ytUrl = typeof ch !== 'string' ? ch?.youtube : null
  const isLiveYt = currentTab === 'live' && hostPlatform === 'yt'
  const sendToYoutube = !!ytUrl || isLiveYt
  const isDualSend = sendToKick && sendToTwitch

  // Track for echo dedup (dual-send only — suppress second platform's duplicate)
  if (isDualSend) {
    trackSentMessage(text)
  }

  // Push to message history (dedup consecutive, cap at max)
  if (mcMessageHistory[0] !== text) {
    mcMessageHistory.unshift(text)
    if (mcMessageHistory.length > MC_HISTORY_MAX) mcMessageHistory.length = MC_HISTORY_MAX
  }
  mcHistoryIndex = -1

  const replyParentId = replyState?.msgId || null
  clearReplyState()

  // Clear input immediately
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
  hideInputBar()

  // --- Kick send path (single, dual, or triple including YT) ---
  if (sendToKick) {
    const slug = kickSlug || targetChannel
    const kickPromise = sendKickMessage(slug, text)
    const twitchPromise = sendToTwitch
      ? getTwitchAuthTokenAsync().then(({ token: tok, username: twitchNick }) =>
          sendIrcMessage(twitchName, text, tok, replyParentId, twitchNick))
      : Promise.resolve(null)

    // Best-effort YouTube — fire alongside Kick/Twitch so a triple-link
    // channel (twitch+kick+youtube) actually mirrors to all three.
    if (sendToYoutube) {
      sendYoutubeMessage(text).then(result => {
        if (result !== true && result !== 'no_youtube_tab') {
          showToast('youtube send failed')
        }
      })
    }

    Promise.all([kickPromise, twitchPromise]).then(([kickResult, twitchResult]) => {
      const kickOk = kickResult === true
      const twitchOk = twitchResult === true || twitchResult === null

      if (kickOk || twitchOk) {
        // Partial failure toasts for dual-send
        if (isDualSend && !twitchOk) showToast('sent to kick only — twitch failed')
        if (isDualSend && !kickOk) showToast('sent to twitch only — kick failed')
      } else {
        // Both failed (or single Kick failed)
        input.style.borderColor = '#f44'
        const msg = kickResult === 'kick_not_logged_in' ? t('mc_input_login_kick')
          : kickResult === 'no_kick_tab' ? t('mc_input_open_kick')
          : kickResult === 'no_channel' ? t('mc_input_kick_not_found')
          : t('mc_input_send_failed')
        if (wysiwygEnabled) input.dataset.placeholder = msg
        else input.placeholder = msg
        setTimeout(() => { input.style.borderColor = ''; updateInputPlaceholder() }, 2500)
      }
    })
    return
  }

  // --- YouTube-only send path (no Twitch, no Kick) ---
  if (sendToYoutube && !sendToKick && !sendToTwitch) {
    sendYoutubeMessage(text).then(result => {
      if (result !== true) {
        const errorMsg = result === 'no_youtube_tab' ? 'open youtube live chat first'
          : 'youtube send failed'
        showToast(errorMsg)
      }
    })
    return
  }
  // Twitch + YouTube (and no Kick) — fire YouTube as best-effort alongside Twitch send below
  if (sendToYoutube && sendToTwitch && !sendToKick) {
    sendYoutubeMessage(text).then(result => {
      if (result !== true && result !== 'no_youtube_tab') {
        showToast('youtube send failed')
      }
    })
    // fall through to Twitch path
  }

  // --- Twitch-only send path (existing behavior) ---
  const { token, username: twitchNick } = await getTwitchAuthTokenAsync()
  if (!token) {
    console.warn('[HS] SEND BAIL: no auth token (cookie missing)')
    if (wysiwygEnabled) input.dataset.placeholder = t('mc_input_not_logged_in')
    else input.placeholder = t('mc_input_not_logged_in')
    setTimeout(() => updateInputPlaceholder(), 2000)
    return
  }

  const wsState = authState.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][authState.ws.readyState] : 'null'
  log(`IRC SEND → #${targetChannel} ws=${wsState} ready=${authState.ready} queue=${authState.sendQueue.length}`)
  sendIrcMessage(targetChannel, text, token, replyParentId, twitchNick).then(result => {
    if (result === true) {
      if (wsState !== 'OPEN') {
        input.style.borderColor = '#ff0'
        setTimeout(() => { input.style.borderColor = '' }, 1500)
      }
    } else {
      input.style.borderColor = '#f44'
      const msg = result === 'no_user' ? t('mc_input_no_username')
        : result === 'auth_failed' ? t('mc_input_auth_failed')
        : result === 'connect_failed' ? t('mc_input_connection_failed')
        : t('mc_input_send_failed_retry')
      if (wysiwygEnabled) input.dataset.placeholder = msg
      else input.placeholder = msg
      setTimeout(() => { input.style.borderColor = ''; updateInputPlaceholder() }, 2500)
    }
  })
}

async function sendYoutubeMessage(text) {
  try {
    const resp = await safeSendMessage({ type: 'youtube_send_message', text })
    if (resp?.ok) return true
    return resp?.error || 'send_failed'
  } catch (e) {
    log('YouTube send error:', e.message)
    return 'send_failed'
  }
}

// ============================================
// MEDIA UPLOAD — paste image, drag-drop file
// ============================================

const MC_UPLOAD_MAX_IMG = 5 * 1024 * 1024   // 5MB
const MC_UPLOAD_MAX_VID = 50 * 1024 * 1024  // 50MB
let _mcUploading = false

function showUploadStatus(msg, isError) {
  const bar = document.getElementById('hs-mc-upload-status')
  if (msg) {
    if (bar) {
      bar.textContent = msg
      bar.style.color = isError ? '#ff4444' : '#ff8700'
      bar.style.display = 'block'
      return
    }
    const inputbar = document.getElementById('hs-mc-inputbar')
    if (!inputbar) return
    const el = document.createElement('div')
    el.id = 'hs-mc-upload-status'
    el.style.cssText = 'padding:2px 8px;font-size:11px;color:#ff8700;background:#000;border-top:1px solid #808080;'
    el.textContent = msg
    inputbar.insertBefore(el, inputbar.firstChild)
  } else if (bar) {
    bar.remove()
  }
}

async function uploadMediaFile(file) {
  if (_mcUploading) {
    showUploadStatus('upload in progress...', true)
    return null
  }
  if (!file) return null
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) {
    showUploadStatus('only images/videos allowed', true)
    setTimeout(() => showUploadStatus(null), 2500)
    return null
  }
  const maxSize = isImage ? MC_UPLOAD_MAX_IMG : MC_UPLOAD_MAX_VID
  if (file.size > maxSize) {
    showUploadStatus(`file too large (max ${maxSize / 1048576}MB)`, true)
    setTimeout(() => showUploadStatus(null), 2500)
    return null
  }
  _mcUploading = true
  showUploadStatus('uploading 0%...')
  try {
    const formData = new FormData()
    formData.append('file', file)
    const url = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          showUploadStatus(`uploading ${pct}%...`)
        }
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.success && data.url) resolve(data.url)
            else reject(new Error(data.error || 'upload failed'))
          } catch { reject(new Error('bad response')) }
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.error || `http ${xhr.status}`))
          } catch { reject(new Error(`http ${xhr.status}`)) }
        }
      })
      xhr.addEventListener('error', () => reject(new Error('network error')))
      xhr.addEventListener('abort', () => reject(new Error('cancelled')))
      xhr.open('POST', `${CONFIG.API_URL}/api/upload`)
      xhr.withCredentials = true
      xhr.send(formData)
    })
    showUploadStatus('upload done')
    setTimeout(() => showUploadStatus(null), 1500)
    return url
  } catch (e) {
    showUploadStatus(`upload failed: ${e.message}`, true)
    setTimeout(() => showUploadStatus(null), 3500)
    return null
  } finally {
    _mcUploading = false
  }
}

async function handleMediaUpload(file) {
  const url = await uploadMediaFile(file)
  if (!url) return
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  showInputBar()
  input.focus()
  if (input.isContentEditable) {
    if (!document.execCommand('insertText', false, url + ' ')) {
      input.textContent = (input.textContent || '') + url + ' '
    }
  } else {
    input.value = (input.value || '') + url + ' '
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

let _mcDropHandlersInstalled = false
function setupMediaDropHandlers() {
  if (_mcDropHandlersInstalled) return
  _mcDropHandlersInstalled = true
  const overlay = document.getElementById('hs-mc-overlay')
  if (!overlay) return

  let dragCounter = 0
  const showDropZone = () => {
    let dz = document.getElementById('hs-mc-drop-zone')
    if (!dz) {
      dz = document.createElement('div')
      dz.id = 'hs-mc-drop-zone'
      dz.style.cssText = 'position:absolute;inset:0;background:rgba(255,135,0,0.15);border:2px dashed #ff8700;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;z-index:99998;pointer-events:none;'
      dz.textContent = 'drop image/video to upload'
      overlay.appendChild(dz)
    }
  }
  const hideDropZone = () => {
    document.getElementById('hs-mc-drop-zone')?.remove()
    dragCounter = 0
  }

  overlay.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragCounter++
    showDropZone()
  }, { signal: mcSignal })
  overlay.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, { signal: mcSignal })
  overlay.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    dragCounter--
    if (dragCounter <= 0) hideDropZone()
  }, { signal: mcSignal })
  overlay.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return
    e.preventDefault()
    hideDropZone()
    const file = e.dataTransfer.files[0]
    handleMediaUpload(file)
  }, { signal: mcSignal })
}


// --- multichat/profile-card.js ---
// Full-panel btop-style profile card
// Triggered by clicking any username anywhere in the extension.
// Replaces #hs-mc-messages content. ESC, tab switch, or close button restores chat.

let activeProfileCard = null  // { username, platform, data, ts }

function isProfileCardOpen() {
  return !!activeProfileCard
}

async function openProfileCard(username, platform) {
  if (!username) return
  username = String(username).toLowerCase()

  // Hide input bar — typing makes no sense in card view
  const inputBar = document.getElementById('hs-mc-inputbar')
  if (inputBar) inputBar.classList.add('hs-hidden')

  activeProfileCard = { username, platform: platform || null, data: null, ts: Date.now() }
  renderProfileCardView()

  // Try cache first (shared with tooltip via _profileCache)
  const cacheKey = `${platform || 'unknown'}:${username}`
  const ttl = (typeof PROFILE_CACHE_TTL !== 'undefined') ? PROFILE_CACHE_TTL : 300000
  if (typeof _profileCache !== 'undefined') {
    const cached = _profileCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < ttl) {
      activeProfileCard.data = cached.profile
      renderProfileCardView()
      return
    }
  }

  try {
    const platParam = platform ? `?platform=${encodeURIComponent(platform)}` : ''
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}${platParam}`)
    if (!activeProfileCard || activeProfileCard.username !== username) return
    if (resp?.ok && resp.data?.profile) {
      activeProfileCard.data = resp.data.profile
      if (typeof _profileCache !== 'undefined') {
        _profileCache.set(cacheKey, { profile: resp.data.profile, ts: Date.now() })
      }
    } else {
      activeProfileCard.data = { error: true, username }
    }
    renderProfileCardView()
  } catch {
    if (!activeProfileCard) return
    activeProfileCard.data = { error: true, username }
    renderProfileCardView()
  }
}

function closeProfileCard() {
  if (!activeProfileCard) return
  activeProfileCard = null
  // renderMessages will redo input visibility logic via switchTab? No, switchTab not called here.
  // Restore input bar visibility based on currentTab
  const inputBar = document.getElementById('hs-mc-inputbar')
  if (inputBar) {
    const hideOnTabs = ['add', 'settings', 'discover', 'pinned']
    if (!hideOnTabs.includes(currentTab)) inputBar.classList.remove('hs-hidden')
  }
  renderMessages(currentTab)
}

function getRecentMessagesFromUser(username) {
  const lower = username.toLowerCase()
  const out = []
  try {
    if (typeof irc !== 'undefined' && irc?.channels) {
      for (const [, buf] of irc.channels) {
        for (const m of buf.getAll()) {
          if (m.user?.toLowerCase() === lower && m.text) out.push(m)
        }
      }
    }
    if (typeof kickChat !== 'undefined' && kickChat?.channels) {
      for (const [, buf] of kickChat.channels) {
        for (const m of buf.getAll()) {
          if (m.user?.toLowerCase() === lower && m.text) out.push(m)
        }
      }
    }
    if (typeof channelYtMessages !== 'undefined' && channelYtMessages) {
      for (const [, buf] of channelYtMessages) {
        for (const m of buf) {
          if (m.user?.toLowerCase() === lower && m.text) out.push(m)
        }
      }
    }
  } catch {}
  return out.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 12)
}

function pcFmt(n) {
  n = Number(n) || 0
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

// Tokenize bio text and append @mention/#tag/text nodes safely (no innerHTML).
// @mentions reuse `.hs-mc-user` so the existing capture-phase click handler
// opens the profile card. #tags link to heatsync.org/tags/<name> in a new tab.
function pcAppendBioWithAutolinks(parent, text) {
  const parts = String(text || '').split(/(@[A-Za-z0-9_]{3,25}|#[A-Za-z0-9]{1,30})/g)
  for (const p of parts) {
    if (!p) continue
    if (p[0] === '@' && p.length >= 4) {
      const name = p.slice(1)
      const span = document.createElement('span')
      span.className = 'hs-mc-user hs-pcard-bio-mention'
      span.dataset.username = name
      span.textContent = '@' + name
      parent.appendChild(span)
    } else if (p[0] === '#' && p.length >= 2) {
      const a = document.createElement('a')
      a.className = 'hs-pcard-bio-tag'
      a.href = 'https://heatsync.org/tags/' + encodeURIComponent(p.slice(1).toLowerCase())
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = '#' + p.slice(1)
      parent.appendChild(a)
    } else {
      parent.appendChild(document.createTextNode(p))
    }
  }
}

function pcMakeSection(title) {
  const sec = document.createElement('div')
  sec.className = 'hs-pcard-section'
  const t = document.createElement('div')
  t.className = 'hs-pcard-section-title'
  t.textContent = title
  sec.appendChild(t)
  return sec
}

function pcMakePill(plat, name, isLive) {
  const pill = document.createElement('a')
  pill.className = 'hs-pcard-pill hs-pcard-pill-' + plat
  pill.target = '_blank'
  pill.rel = 'noopener noreferrer'
  if (plat === 'twitch') pill.href = 'https://twitch.tv/' + encodeURIComponent(name)
  else if (plat === 'kick') pill.href = 'https://kick.com/' + encodeURIComponent(name)
  else if (plat === 'youtube') pill.href = 'https://youtube.com/@' + encodeURIComponent(name)
  else if (plat === 'heatsync') pill.href = 'https://heatsync.org/user/' + encodeURIComponent(name)
  const label = plat === 'twitch' ? 't' : plat === 'kick' ? 'k' : plat === 'youtube' ? 'y' : 'h'
  pill.textContent = `${label}:${name}`
  if (isLive) {
    const dot = document.createElement('span')
    dot.className = 'hs-pcard-pill-live'
    dot.textContent = '●'
    pill.prepend(dot)
  }
  // Don't intercept these clicks — they should follow the link in a new tab
  pill.dataset.pcardPill = '1'
  return pill
}

function renderProfileCardView() {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl || !activeProfileCard) return
  msgsEl.textContent = ''

  const { username, data } = activeProfileCard
  const card = document.createElement('div')
  card.className = 'hs-pcard'

  // === Identity section ===
  const idSec = pcMakeSection(data?.display_name || username)
  idSec.classList.add('hs-pcard-id')

  const idRow = document.createElement('div')
  idRow.className = 'hs-pcard-id-row'

  const avatar = document.createElement('img')
  avatar.className = 'hs-pcard-avatar'
  // For YT users with no heatsync profile, the heatsync API has no avatar,
  // so fall back to the avatar pulled off any recent YT message they sent.
  let ytAvatar = null
  if (!data?.twitch_profile_pic && !data?.kick_profile_pic && !data?.profile_image_url) {
    try {
      const recent = getRecentMessagesFromUser(username)
      const withAv = recent.find(m => m.avatar)
      if (withAv) ytAvatar = withAv.avatar
    } catch {}
  }
  avatar.src = data?.twitch_profile_pic || data?.kick_profile_pic || data?.profile_image_url || ytAvatar || 'https://heatsync.org/anon.webp'
  avatar.alt = ''
  avatar.referrerPolicy = 'no-referrer'
  idRow.appendChild(avatar)

  const idText = document.createElement('div')
  idText.className = 'hs-pcard-id-text'

  const nameLine = document.createElement('div')
  nameLine.className = 'hs-pcard-name'
  const isLive = !!(data?.twitch_is_live || data?.kick_is_live || data?.youtube_is_live)
  if (isLive) {
    const dot = document.createElement('span')
    dot.className = 'hs-pcard-livedot'
    dot.textContent = '●'
    nameLine.appendChild(dot)
  }
  nameLine.appendChild(document.createTextNode(' ' + (data?.display_name || username)))
  idText.appendChild(nameLine)

  // Platform pills
  const pills = document.createElement('div')
  pills.className = 'hs-pcard-pills'
  if (data?.twitch_username) pills.appendChild(pcMakePill('twitch', data.twitch_username, data.twitch_is_live))
  if (data?.kick_username) pills.appendChild(pcMakePill('kick', data.kick_username, data.kick_is_live))
  if (data?.youtube_username || data?.youtube_channel_id) {
    pills.appendChild(pcMakePill('youtube', data.youtube_username || username, !!data.youtube_is_live))
  } else if (activeProfileCard.platform === 'yt' || activeProfileCard.platform === 'youtube') {
    // YT-only chatter with no heatsync account — surface a YT pill anyway so
    // the user has a working link from the card to the YouTube channel.
    pills.appendChild(pcMakePill('youtube', username))
  }
  pills.appendChild(pcMakePill('heatsync', username))
  idText.appendChild(pills)

  if (data?.bio) {
    const bio = document.createElement('div')
    bio.className = 'hs-pcard-bio'
    pcAppendBioWithAutolinks(bio, data.bio)
    idText.appendChild(bio)
  }

  // Account age + verification + broadcaster type
  if (data) {
    const meta = document.createElement('div')
    meta.className = 'hs-pcard-meta'
    const dates = [data.twitch_created_at, data.kick_created_at]
      .filter(Boolean)
      .filter(d => !isNaN(new Date(d).getTime()))
    const oldest = dates.length ? dates.reduce((a, b) => new Date(b) < new Date(a) ? b : a) : null
    const age = (typeof getAccountAge === 'function') ? getAccountAge(oldest) : null
    if (age) {
      const ageEl = document.createElement('span')
      ageEl.className = 'hs-pcard-age'
      ageEl.textContent = age + ' old'
      meta.appendChild(ageEl)
    }
    const bt = data.twitch_broadcaster_type
    if (bt === 'partner' || bt === 'affiliate') {
      const r = document.createElement('span')
      r.className = 'hs-pcard-role ' + bt
      r.textContent = bt
      meta.appendChild(r)
    }
    if (data.twitch_verified) {
      const v = document.createElement('span')
      v.className = 'hs-pcard-verified twitch'
      v.title = 'Twitch Verified'
      v.textContent = '✓'
      meta.appendChild(v)
    }
    if (data.kick_verified) {
      const v = document.createElement('span')
      v.className = 'hs-pcard-verified kick'
      v.title = 'Kick Verified'
      v.textContent = '✓'
      meta.appendChild(v)
    }
    if (meta.children.length) idText.appendChild(meta)
  }

  idRow.appendChild(idText)
  idSec.appendChild(idRow)
  card.appendChild(idSec)

  // === Stats section ===
  const statsSec = pcMakeSection('stats')
  if (!data) {
    statsSec.appendChild(document.createTextNode('loading…'))
  } else if (data.error) {
    statsSec.appendChild(document.createTextNode('not registered on heatsync'))
  } else {
    const stats = data.stats || {}
    const heat = stats.total_heat || 0
    const posts = (stats.op_count || 0) + (stats.mop_count || 0) + (stats.re_count || 0)
    const followers = Math.max(stats.followers || 0, data.twitch_followers || 0, data.kick_followers || 0)

    const rel = data.relationship || {}
    const youFollow = rel.youFollow ?? rel.isFollowing ?? rel.followsOnTwitch ?? rel.followsOnKick
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick || rel.followsYou
    const youSub = rel.youSub ?? rel.isSubscribed ?? rel.subscribedOnTwitch ?? rel.subscribedOnKick
    const subsYou = rel.profileSubbedToViewerOnTwitch || rel.profileSubbedToViewerOnKick || rel.subscribesToYou

    const relParts = []
    if (youFollow && followsYou) relParts.push('mutual')
    else if (youFollow) relParts.push('you follow')
    else if (followsYou) relParts.push('follows you')
    if (youSub) relParts.push('you sub')
    if (subsYou) relParts.push('subs to you')

    // Stats line: heat uses canonical tier styling (formatHeat + ° + glow), others plain
    const heatNode = heat ? heatSpanEl(heat) : null
    const hasStats = heatNode || posts || followers
    if (hasStats) {
      const line = document.createElement('div')
      let needsSep = false
      if (heatNode) {
        line.appendChild(heatNode)
        line.appendChild(document.createTextNode(' heat'))
        needsSep = true
      }
      if (posts) {
        if (needsSep) line.appendChild(document.createTextNode(' · '))
        line.appendChild(document.createTextNode(`${pcFmt(posts)} posts`))
        needsSep = true
      }
      if (followers) {
        if (needsSep) line.appendChild(document.createTextNode(' · '))
        line.appendChild(document.createTextNode(`${pcFmt(followers)} followers`))
      }
      statsSec.appendChild(line)
    }
    if (relParts.length) {
      const rline = document.createElement('div')
      rline.className = 'hs-pcard-rel'
      rline.textContent = relParts.join(' · ')
      statsSec.appendChild(rline)
    }
    if (!hasStats && !relParts.length) {
      statsSec.appendChild(document.createTextNode('no stats yet'))
    }
  }
  card.appendChild(statsSec)

  // === Stream section (only when live) ===
  if (data && (data.twitch_is_live || data.kick_is_live || data.youtube_is_live)) {
    let plat, platName, vc, url
    if (data.twitch_is_live) {
      plat = 'twitch'
      platName = data.twitch_username
      vc = data.twitch_viewer_count || 0
      url = `https://twitch.tv/${platName}`
    } else if (data.kick_is_live) {
      plat = 'kick'
      platName = data.kick_username
      vc = data.kick_viewer_count || 0
      url = `https://kick.com/${platName}`
    } else {
      plat = 'youtube'
      platName = data.youtube_username || data.youtube_channel_id
      vc = data.youtube_viewer_count || 0
      url = data.youtube_username ? `https://youtube.com/@${data.youtube_username}/live`
        : data.youtube_channel_id ? `https://youtube.com/channel/${data.youtube_channel_id}/live`
        : 'https://youtube.com'
    }

    const ssec = pcMakeSection(plat + ' · live')
    ssec.classList.add('hs-pcard-stream')
    const line = document.createElement('div')
    if (vc) line.appendChild(document.createTextNode(`${pcFmt(vc)} viewers — `))
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'watch stream →'
    link.className = 'hs-pcard-link'
    link.dataset.pcardPill = '1'
    line.appendChild(link)
    ssec.appendChild(line)
    card.appendChild(ssec)
  }

  // === Recent messages section ===
  const recent = getRecentMessagesFromUser(username)
  if (recent.length > 0) {
    const rsec = pcMakeSection(`recent · ${recent.length} msg${recent.length === 1 ? '' : 's'}`)
    rsec.classList.add('hs-pcard-recent')
    for (const m of recent) {
      const row = document.createElement('div')
      row.className = 'hs-pcard-msg'
      const ts = m.time ? new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      const tsEl = document.createElement('span')
      tsEl.className = 'hs-pcard-msg-ts'
      tsEl.textContent = ts
      const platEl = document.createElement('span')
      const plat = m.platform || 'twitch'
      platEl.className = 'hs-pcard-msg-plat hs-pcard-pill-' + plat
      platEl.textContent = plat === 'kick' ? 'k' : plat === 'youtube' ? 'y' : 't'
      const textEl = document.createElement('span')
      textEl.className = 'hs-pcard-msg-text'
      textEl.textContent = m.text.length > 240 ? m.text.slice(0, 240) + '…' : m.text
      row.appendChild(tsEl)
      row.appendChild(platEl)
      row.appendChild(textEl)
      rsec.appendChild(row)
    }
    card.appendChild(rsec)
  }

  // === Actions section ===
  const asec = pcMakeSection('actions')
  asec.classList.add('hs-pcard-actions')
  const grid = document.createElement('div')
  grid.className = 'hs-pcard-action-grid'

  const isMuted = mutedUsers.has(username)
  const inChannels = config.channels.some(c => {
    const id = (typeof c === 'string' ? c : c.id)?.toLowerCase()
    const tw = (typeof c === 'string' ? c : c.twitch)?.toLowerCase()
    const ki = typeof c === 'string' ? null : c.kick?.toLowerCase()
    return id === username || tw === username || ki === username
  })

  const youFollow = !!(data?.relationship?.youFollow ?? data?.relationship?.isFollowing)
  const youBlock = !!(data?.relationship?.youBlock ?? data?.relationship?.isBlocked)
  const profileId = data?.id || data?.userId || null

  const actions = [
    { key: 't', label: 'twitch', fn: () => pcOpenExt('https://twitch.tv/' + (data?.twitch_username || username)) },
    { key: 'k', label: 'kick', fn: () => pcOpenExt('https://kick.com/' + (data?.kick_username || username)) },
    { key: 'y', label: 'youtube', fn: () => pcOpenExt('https://youtube.com/@' + (data?.youtube_username || username)) },
    { key: 'h', label: 'heatsync', fn: () => pcOpenExt('https://heatsync.org/user/' + username) },
    { key: 'f', label: youFollow ? 'unfollow' : 'follow', fn: () => pcToggleFollow(profileId, username, youFollow), disabled: !profileId },
    { key: 'w', label: 'whisper', fn: () => pcDoWhisper(username) },
    { key: 'd', label: 'dm', fn: () => pcDoDm(username) },
    { key: 'm', label: 'mention', fn: () => pcMention(data?.display_name || username) },
    { key: 'x', label: isMuted ? 'unmute' : 'mute', fn: () => pcToggleMute(username) },
    { key: 'b', label: youBlock ? 'unblock' : 'block', fn: () => pcToggleBlock(profileId, username, youBlock), disabled: !profileId },
    { key: '+', label: inChannels ? 'in channels' : 'add channel', fn: () => pcAddAsChannel(username), disabled: inChannels },
    { key: 'esc', label: 'close', fn: closeProfileCard },
  ]

  for (const a of actions) {
    const btn = document.createElement('button')
    btn.className = 'hs-pcard-action'
    if (a.disabled) btn.disabled = true
    btn.dataset.pcKey = a.key
    const kbd = document.createElement('span')
    kbd.className = 'hs-pcard-kbd'
    kbd.textContent = `[${a.key}]`
    const lab = document.createElement('span')
    lab.className = 'hs-pcard-actlabel'
    lab.textContent = ' ' + a.label
    btn.appendChild(kbd)
    btn.appendChild(lab)
    btn.addEventListener('click', a.fn)
    grid.appendChild(btn)
  }
  asec.appendChild(grid)
  card.appendChild(asec)

  msgsEl.appendChild(card)
}

function pcOpenExt(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function pcToggleMute(username) {
  username = username.toLowerCase()
  if (mutedUsers.has(username)) {
    mutedUsers.delete(username)
    safeSendMessage({ type: 'unmute_user', username })
  } else {
    mutedUsers.add(username)
    safeSendMessage({ type: 'mute_user', username, expiresAt: Date.now() + 86400000 })
  }
  chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
  renderProfileCardView()
}

// Heatsync follow/unfollow — POST/DELETE /api/follow/{userId}. Server returns
// 400 'Already following' / 'Not following' for no-op state which we treat as
// idempotent success. After success, ping background to refresh followedUsers
// so the new follow shows up in live notifications + badge immediately.
async function pcToggleFollow(profileId, username, currentlyFollowing) {
  if (!profileId) {
    if (typeof showToast === 'function') showToast('not registered on heatsync')
    return
  }
  const targetFollowing = !currentlyFollowing
  const method = targetFollowing ? 'POST' : 'DELETE'
  // Optimistic UI
  if (activeProfileCard?.data) {
    activeProfileCard.data.relationship = { ...(activeProfileCard.data.relationship || {}), youFollow: targetFollowing }
    renderProfileCardView()
  }
  try {
    const resp = await apiFetch(`/api/follow/${encodeURIComponent(profileId)}`, { method, auth: true })
    if (!resp?.ok) {
      const msg = String(resp?.error || '').toLowerCase()
      if (!msg.includes('already following') && !msg.includes('not following')) {
        // Real failure — revert optimistic state
        if (activeProfileCard?.data?.relationship) {
          activeProfileCard.data.relationship.youFollow = currentlyFollowing
          renderProfileCardView()
        }
        if (typeof showToast === 'function') showToast('follow failed: ' + (resp?.error || 'unknown'))
        return
      }
    }
    if (typeof showToast === 'function') showToast(targetFollowing ? `following ${username}` : `unfollowed ${username}`)
    // Tell background to refetch followedUsers — pollFollowedLive runs after,
    // so live notifications + badge include the new follow within ~60s.
    safeSendMessage({ type: 'refresh_followed_users' })
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youFollow = currentlyFollowing
      renderProfileCardView()
    }
    if (typeof showToast === 'function') showToast('follow failed: ' + (e?.message || 'unknown'))
  }
}

// Heatsync block/unblock — POST/DELETE /api/user/block/{userId}. Server's
// idempotent error responses ('User already blocked' / no record) are treated
// as success. After block, profile auto-unfollows server-side, so we mirror
// that in the relationship object.
async function pcToggleBlock(profileId, username, currentlyBlocked) {
  if (!profileId) {
    if (typeof showToast === 'function') showToast('not registered on heatsync')
    return
  }
  const targetBlocked = !currentlyBlocked
  // Optimistic UI
  if (activeProfileCard?.data) {
    const rel = { ...(activeProfileCard.data.relationship || {}) }
    rel.youBlock = targetBlocked
    rel.isBlocked = targetBlocked
    if (targetBlocked) {
      // Server auto-unfollows on block — mirror locally
      rel.youFollow = false
      rel.isFollowing = false
    }
    activeProfileCard.data.relationship = rel
    renderProfileCardView()
  }
  try {
    const path = `/api/user/block/${encodeURIComponent(profileId)}`
    const resp = targetBlocked
      ? await apiFetch(path, { method: 'POST', auth: true, body: {} })
      : await apiFetch(path + '?sync_twitch=0', { method: 'DELETE', auth: true })
    if (!resp?.ok) {
      const msg = String(resp?.error || '').toLowerCase()
      if (!msg.includes('already blocked') && !msg.includes('not blocked')) {
        // Real failure — revert optimistic state
        if (activeProfileCard?.data?.relationship) {
          activeProfileCard.data.relationship.youBlock = currentlyBlocked
          activeProfileCard.data.relationship.isBlocked = currentlyBlocked
          renderProfileCardView()
        }
        if (typeof showToast === 'function') showToast('block failed: ' + (resp?.error || 'unknown'))
        return
      }
    }
    if (typeof showToast === 'function') showToast(targetBlocked ? `blocked ${username}` : `unblocked ${username}`)
    // Block side-effects unfollow on server — re-fetch followedUsers in background
    safeSendMessage({ type: 'refresh_followed_users' })
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youBlock = currentlyBlocked
      activeProfileCard.data.relationship.isBlocked = currentlyBlocked
      renderProfileCardView()
    }
    if (typeof showToast === 'function') showToast('block failed: ' + (e?.message || 'unknown'))
  }
}

function pcDoWhisper(username) {
  closeProfileCard()
  switchTab('whispers')
  // Pre-fill input with /w <username> for quick start
  setTimeout(() => {
    const input = document.getElementById('hs-mc-input')
    if (input) {
      const cmd = `/w ${username} `
      if (input.tagName === 'INPUT') {
        input.value = cmd
        input.focus()
        input.setSelectionRange(cmd.length, cmd.length)
      } else {
        input.textContent = cmd
        input.focus()
      }
    }
  }, 50)
}

function setupProfileCardHandlers() {
  if (window._hsProfileCardSetup) return
  window._hsProfileCardSetup = true

  // Primary path — pcard-early.js (document_start) intercepts the click before
  // Twitch/Kick can react and dispatches this event.
  cleanup.addEventListener(document, 'hs-pcard-open', (e) => {
    const { username, platform } = e.detail || {}
    if (username) openProfileCard(username, platform || null)
  }, { signal: mcSignal })

  // Channel list changed (right-click remove, add via pill, server sync, etc.) —
  // re-render the open card so the [+] action reflects the new in-channels state.
  cleanup.addEventListener(document, 'hs-channels-changed', () => {
    if (activeProfileCard) renderProfileCardView()
  }, { signal: mcSignal })

  // Username click → open card. Capture phase so we beat Twitch/Kick native user-card handlers.
  // Allow ctrl/meta/shift/middle/alt to fall through to the <a target="_blank"> default nav.
  cleanup.addEventListener(document, 'click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const userEl = e.target.closest('.hs-mc-user')
    if (!userEl) return
    if (e.target.closest('[data-pcard-pill]')) return
    if (userEl.classList.contains('hs-mc-reply-user')) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    const username = (userEl.dataset.username || userEl.textContent.replace(/^@/, '')).trim()
    const platform = userEl.dataset.platform || null
    openProfileCard(username, platform)
  }, { capture: true, signal: mcSignal })

  // Twitch attaches mousedown handlers too — block those at capture so the native card never opens
  cleanup.addEventListener(document, 'mousedown', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const userEl = e.target.closest('.hs-mc-user')
    if (!userEl) return
    if (e.target.closest('[data-pcard-pill]')) return
    if (userEl.classList.contains('hs-mc-reply-user')) return
    e.stopPropagation()
    e.stopImmediatePropagation()
  }, { capture: true, signal: mcSignal })

  // ESC closes the card; single-letter hotkeys trigger actions while open
  cleanup.addEventListener(document, 'keydown', (e) => {
    if (!activeProfileCard) return
    // Ignore keys while typing in inputs/textareas
    const t = e.target
    const inEditable = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable
    if (inEditable) {
      if (e.key === 'Escape') { e.preventDefault(); closeProfileCard() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); closeProfileCard(); return }
    const key = e.key.toLowerCase()
    const map = { t: 't', k: 'k', y: 'y', h: 'h', w: 'w', m: 'm', x: 'x', '+': '+', '=': '+', c: 'c' }
    const target = map[key]
    if (!target) return
    const btn = document.querySelector(`.hs-pcard-action[data-pc-key="${target}"]`)
    if (btn && !btn.disabled) {
      e.preventDefault()
      btn.click()
    }
  }, 'mc-pcard-keys')
}

function pcMention(name) {
  closeProfileCard()
  // If on a non-chat tab, switch to live first
  const isChatTab = currentTab === 'live' || (typeof config !== 'undefined' && config.channels?.some(c => (typeof c === 'string' ? c : c.id) === currentTab))
  if (!isChatTab) switchTab('live')
  setTimeout(() => {
    const inputBar = document.getElementById('hs-mc-inputbar')
    if (inputBar) inputBar.classList.remove('hs-hidden')
    const input = document.getElementById('hs-mc-input')
    if (!input) return
    const tag = '@' + name + ' '
    if (input.tagName === 'INPUT') {
      const cur = input.value || ''
      const sep = cur && !cur.endsWith(' ') ? ' ' : ''
      input.value = cur + sep + tag
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    } else {
      const cur = input.textContent || ''
      const sep = cur && !cur.endsWith(' ') ? ' ' : ''
      input.textContent = cur + sep + tag
      input.focus()
      // Place caret at end
      const range = document.createRange()
      range.selectNodeContents(input)
      range.collapse(false)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, 60)
}

function pcDoDm(username) {
  closeProfileCard()
  switchTab('whispers')
  // Pre-fill input with /dm <username> for quick start (heatsync DM, not Twitch whisper)
  setTimeout(() => {
    const input = document.getElementById('hs-mc-input')
    if (input) {
      const cmd = `/dm ${username} `
      if (input.tagName === 'INPUT') {
        input.value = cmd
        input.focus()
        input.setSelectionRange(cmd.length, cmd.length)
      } else {
        input.textContent = cmd
        input.focus()
      }
    }
  }, 50)
}

async function pcAddAsChannel(username) {
  if (!config?.channels) return
  const id = username.toLowerCase()
  const exists = config.channels.some(c => {
    const cid = (typeof c === 'string' ? c : c.id)?.toLowerCase()
    return cid === id
  })
  if (exists) {
    closeProfileCard()
    switchTab(id)
    return
  }

  // Use cached profile on the active card if present (avoids round-trip).
  // Otherwise resolve via /api/profile so we populate ALL linked platforms.
  let res = null
  if (activeProfileCard?.data && !activeProfileCard.data.error) {
    res = shapeIdentity(activeProfileCard.data)
  } else if (typeof resolveIdentity === 'function') {
    res = await resolveIdentity(username)
  }

  // Fallback when no heatsync profile: assume the typed name is twitch (consistent
  // with prior behaviour when adding e.g. a Twitch-only channel from chat).
  const id2 = res?.identity?.heatsync?.toLowerCase() || id
  const channel = {
    id: id2,
    twitch: (res?.identity?.twitch || username).toLowerCase(),
    kick: (res?.identity?.kick || '').toLowerCase(),
    youtube: res?.identity?.youtube || '',
  }

  config.channels.push(channel)
  saveConfig()
  if (typeof updateTabBar === 'function') updateTabBar()
  if (channel.twitch) {
    irc?.join(channel.twitch)
    try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: channel.twitch }) } catch {}
  }
  if (channel.kick) kickChat?.join(channel.kick)
  if (channel.youtube) {
    youtubeLinks.set(channel.id, { url: channel.youtube, videoId: '', channelName: '' })
    try { chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: channel.youtube, channelId: channel.id }) } catch {}
  }
  closeProfileCard()
  switchTab(channel.id)
}

// === END MULTICHAT MODULES ===


const STORAGE_KEY = 'heatsync_multichat';
  const LOG_PREFIX = '[heatsync-mc]';

  // DEBUG: temporary marker to verify script injection on YouTube
  document.documentElement.dataset.hsMcLoaded = '1';

  const COLOR_RE = /^#[0-9a-fA-F]{3,6}$/

  // Reverse-lookup Map for config.channels — rebuilt on config changes
  let _channelLookup = null
  function getChannelLookup() {
    if (_channelLookup) return _channelLookup
    _channelLookup = { twitch: new Map(), kick: new Map() }
    for (const ch of config.channels) {
      const c = typeof ch === 'string' ? { twitch: ch } : ch
      if (c.twitch) _channelLookup.twitch.set(c.twitch, ch)
      if (c.kick) _channelLookup.kick.set(c.kick, ch)
    }
    return _channelLookup
  }

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
  let livePlatformMap = {};      // per-URL-channel platform overrides: { [urlCh]: { twitch, kick, youtube } }
  let liveChannelSet = new Set(); // channels currently live (lowercase twitch names)
  let irc = null;
  let kickChat = null;
  let currentUsername = null;
  let originalRender = null;
  let tabBarElement = null;
  let overlayElement = null;
  let inputBarElement = null;  // Separate input bar (always visible)
  let pendingMessage = '';     // Persists across tab switches
  let tabPosition = 'top'; // 'top', 'right', 'bottom', 'left'
  let resizeObserver = null; // Tracks overlay top sync observer
  let _updateMcLayout = () => {} // Set by ensureUIElements; callable from rotateTabPosition
  let _mcStorageListener = null;

  // Muted users (right-click to hide) — loaded async from chrome.storage.local
  let mutedUsers = new Set();

  // Per-tab platform filters: { [tabId]: { twitch, kick, youtube } }, defaults all true
  let platformFilters = {};


  // Channel point redeem title cache: rewardId → { title, cost }
  const redeemTitleMap = new Map();

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

  // Third-party cosmetics state (BTTV/FFZ badges, 7TV paints+badges)
  let mcBttvBadgeMap = new Map()
  let mcFfzBadgeMap = new Map()
  const mcUserCosmetics = new Map()
  const MC_COSMETICS_MAX = 500
  function setMcCosmetic(uid, c) {
    mcUserCosmetics.set(uid, c)
    if (mcUserCosmetics.size > MC_COSMETICS_MAX) {
      mcUserCosmetics.delete(mcUserCosmetics.keys().next().value)
    }
  }
  const MC_COSMETICS_PENDING_MAX = 500
  const mcCosmeticsPending = new Set()
  let mcCosmeticsTimer = null

  // Username cache for tab completion
  const usernameCache = new Set();
  // Username → color map for @mention coloring (LRU-bounded)
  const knownColors = new Map()
  // Username → Twitch userId for paint cosmetics on @mentions
  const knownUserIds = new Map()
  function setKnownColor(user, color, userId) {
    knownColors.set(user, color)
    if (knownColors.size > 2000) {
      const iter = knownColors.keys()
      for (let i = 0; i < 500; i++) knownColors.delete(iter.next().value)
    }
    if (userId) {
      knownUserIds.set(user, userId)
      if (knownUserIds.size > 2000) {
        const iter = knownUserIds.keys()
        for (let i = 0; i < 500; i++) knownUserIds.delete(iter.next().value)
      }
    }
  }
  // Avatar URL cache: username → CDN URL (fetched from decapi)
  const avatarCache = new Map()
  const avatarFetching = new Set() // prevent duplicate fetches
  let _activeAvatarFetches = 0
  const MAX_AVATAR_FETCHES = 5
  function fetchAvatar(username) {
    const key = username.toLowerCase()
    if (avatarCache.has(key) || avatarFetching.has(key)) return
    if (_activeAvatarFetches >= MAX_AVATAR_FETCHES) return
    avatarFetching.add(key)
    _activeAvatarFetches++
    fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(key)}`, { credentials: 'omit' })
      .then(r => r.ok ? r.text() : null)
      .then(url => {
        avatarFetching.delete(key)
        _activeAvatarFetches--
        const safe = safeUrl((url || '').trim())
        if (!safe) return
        avatarCache.set(key, safe)
        if (avatarCache.size > 500) {
          avatarCache.delete(avatarCache.keys().next().value)
        }
        // Update any visible avatar placeholders
        if (avatarsEnabled) {
          document.querySelectorAll(`.hs-mc-avatar[data-user="${CSS.escape(key)}"]`).forEach(img => {
            img.src = avatarCache.get(key)
            img.style.display = ''
          })
        }
      })
      .catch(() => { avatarFetching.delete(key); _activeAvatarFetches-- })
  }

  // YT-name → twitch_id resolver. YouTube chat doesn't expose channel IDs in
  // the DOM, so we look the user up on heatsync to get a twitchId, then feed
  // that into the existing 7TV cosmetics pipeline. The map caches both hits
  // (twitch_id) and misses (null) — LRU-evicted at YT_NAME_CACHE_MAX so a
  // long stream session can't grow it without bound.
  const ytNameToTwitchId = new Map()      // ytUserKey → twitchId | null
  const ytNameLookupPending = new Set()
  let ytNameLookupTimer = null
  const YT_NAME_BATCH = 8
  const YT_NAME_CACHE_MAX = 1000

  function evictYtNameCache() {
    if (ytNameToTwitchId.size >= YT_NAME_CACHE_MAX) {
      ytNameToTwitchId.delete(ytNameToTwitchId.keys().next().value)
    }
  }

  function ytNameKey(user) { return (user || '').toLowerCase().replace(/^@/, '') }

  function queueYtNameToTwitchId(user) {
    const key = ytNameKey(user)
    if (!key) return
    if (ytNameToTwitchId.has(key)) return
    if (ytNameLookupPending.has(key)) return
    ytNameLookupPending.add(key)
    if (ytNameLookupPending.size >= YT_NAME_BATCH) {
      if (ytNameLookupTimer) { cleanup.clearTimeout(ytNameLookupTimer); ytNameLookupTimer = null }
      flushYtNameLookups()
      return
    }
    if (!ytNameLookupTimer) {
      ytNameLookupTimer = cleanup.setTimeout(() => {
        ytNameLookupTimer = null
        flushYtNameLookups()
      }, 800)
    }
  }

  async function flushYtNameLookups() {
    if (!ytNameLookupPending.size) return
    const batch = [...ytNameLookupPending].slice(0, YT_NAME_BATCH)
    batch.forEach(k => ytNameLookupPending.delete(k))
    await Promise.all(batch.map(async (key) => {
      try {
        const resp = await safeSendMessage({
          type: 'api_fetch',
          path: '/api/profile/' + encodeURIComponent(key),
          method: 'GET'
        })
        const tid = resp?.data?.twitch_id || resp?.twitch_id || null
        evictYtNameCache()
        ytNameToTwitchId.set(key, tid ? String(tid) : null)
        if (tid) {
          const tidStr = String(tid)
          // Backfill: stamp data-uid on all currently-rendered YT msgs by this
          // user so updateCosmeticsInPlace can find them once cosmetics resolve.
          const container = document.getElementById('hs-mc-messages')
          if (container) {
            const sel = `.hs-mc-msg .hs-mc-user[data-platform="yt"][data-username="${CSS.escape('@' + key)}"], .hs-mc-msg .hs-mc-user[data-platform="yt"][data-username="${CSS.escape(key)}"]`
            for (const userEl of container.querySelectorAll(sel)) {
              const div = userEl.closest('.hs-mc-msg')
              if (div && !div.dataset.uid) div.dataset.uid = tidStr
            }
          }
          // Patch buffered messages so the next render picks up the userId and
          // walks the cosmetics-aware path (otherwise the cached _renderedHtml
          // keeps the paint-less version forever).
          const patchBuf = (buf) => {
            if (!Array.isArray(buf) && !(buf && typeof buf[Symbol.iterator] === 'function')) return
            for (const m of buf) {
              if (m && m.platform === 'youtube' && m.user) {
                const mk = m.user.toLowerCase().replace(/^@/, '')
                if (mk === key) { m.userId = tidStr; m._renderedHtml = null }
              }
            }
          }
          if (typeof channelYtMessages !== 'undefined') channelYtMessages.forEach(patchBuf)
          if (typeof mentionsBuffer !== 'undefined') patchBuf(mentionsBuffer)
          // Now feed through the existing cosmetics pipeline; it will resolve
          // 7TV paint/badge and call updateCosmeticsInPlace which paints by uid.
          if (!mcUserCosmetics.has(tidStr)) queueMcCosmeticsLookup(tidStr)
        }
      } catch {
        evictYtNameCache()
        ytNameToTwitchId.set(key, null)
      }
    }))
    if (ytNameLookupPending.size > 0 && !ytNameLookupTimer) {
      ytNameLookupTimer = cleanup.setTimeout(() => {
        ytNameLookupTimer = null
        flushYtNameLookups()
      }, 1500)
    }
  }

  // 7TV cosmetics queue — batch lookups to avoid per-message requests
  function queueMcCosmeticsLookup(userId) {
    if (!userId || mcUserCosmetics.has(userId)) return
    if (mcCosmeticsPending.size >= MC_COSMETICS_PENDING_MAX) return
    mcCosmeticsPending.add(userId)
    if (!mcCosmeticsTimer) {
      mcCosmeticsTimer = cleanup.setTimeout(() => {
        mcCosmeticsTimer = null
        flushMcCosmeticsBatch()
      }, 100)
    }
  }

  function flushMcCosmeticsBatch() {
    if (!mcCosmeticsPending.size) return
    const batch = [...mcCosmeticsPending].slice(0, 25)
    batch.forEach(id => mcCosmeticsPending.delete(id))
    safeSendMessage({ type: 'get_user_cosmetics', twitchIds: batch }).then(resp => {
      if (!resp?.cosmetics) return
      const changedIds = []
      for (const [uid, c] of Object.entries(resp.cosmetics)) {
        if (c) { setMcCosmetic(uid, c); changedIds.push(uid) }
      }
      if (changedIds.length) updateCosmeticsInPlace(changedIds)
    }).catch(() => {})
    if (mcCosmeticsPending.size > 0) {
      mcCosmeticsTimer = cleanup.setTimeout(() => { mcCosmeticsTimer = null; flushMcCosmeticsBatch() }, 500)
    }
  }

  // Update cosmetics (badges + paint) in-place without full re-render
  function updateCosmeticsInPlace(userIds) {
    const container = document.getElementById('hs-mc-messages')
    if (!container) return
    for (const uid of userIds) {
      const cosmetic = mcUserCosmetics.get(uid)
      if (!cosmetic) continue
      const paintStyle = getMcPaintStyle(uid)
      // Repaint inline @mentions of this user across all visible messages
      if (paintStyle) {
        for (const mention of container.querySelectorAll(`a.hs-mc-mention[data-uid="${uid}"]`)) {
          mention.setAttribute('style', paintStyle)
        }
      }
      const divs = container.querySelectorAll(`.hs-mc-msg[data-uid="${uid}"]`)
      for (const div of divs) {
        // Update paint on the SENDER's username link — exclude the reply
        // target (.hs-mc-reply-user) which also has .hs-mc-user but is a
        // different person and would get the wrong paint/badge.
        const userLink = div.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
        if (userLink) {
          if (paintStyle) {
            userLink.setAttribute('style', paintStyle)
          }
        }
        // Add 7TV badge if not already present and cosmetic has one
        if (cosmetic.badge && !div.querySelector('.hs-mc-7tv-badge')) {
          const files = cosmetic.badge.host?.files || []
          const file = files.find(f => f.name?.endsWith('.webp')) || files.find(f => f.name?.endsWith('.avif')) || files[0]
          if (file) {
            const base = cosmetic.badge.host?.url || ''
            // 7TV returns protocol-relative URLs (//cdn.7tv.app/...) — promote
            // to https before validation so safeUrl doesn't drop them.
            const absBase = base.startsWith('//') ? 'https:' + base : base
            const rawUrl = (absBase.endsWith('/') ? absBase : absBase + '/') + file.name
            const url = safeUrl(rawUrl)
            if (url) {
              const img = document.createElement('img')
              img.className = 'hs-mc-badge-img hs-mc-7tv-badge'
              img.src = url
              img.alt = '7TV'
              img.title = cosmetic.badge.tooltip || '7TV'
              img.style.cssText = 'width:18px;height:18px;'
              // Insert before the username link
              if (userLink) userLink.parentNode.insertBefore(img, userLink)
            }
          }
        }
      }
    }
  }

  // 7TV paint → CSS style string
  function getMcPaintStyle(userId) {
    const cosmetic = mcUserCosmetics.get(userId)
    const paint = cosmetic?.paint
    if (!paint || !paint.function) return ''
    const fn = paint.function.toLowerCase()
    if (fn === 'url' && paint.image_url) {
      if (!/^https:\/\//.test(paint.image_url)) return ''
      const safeCssUrl = paint.image_url.replace(/[()'"\\]/g, encodeURIComponent)
      let style = `background-image:url(${safeCssUrl});background-size:cover;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text`
      if (paint.shadows?.length) {
        style += ';filter:' + paint.shadows.map(s => {
          const r = (s.color >>> 24) & 0xff
          const g = (s.color >>> 16) & 0xff
          const b = (s.color >>> 8) & 0xff
          const a = (s.color & 0xff) / 255
          return `drop-shadow(${Number(s.x_offset) || 0}px ${Number(s.y_offset) || 0}px ${Number(s.radius) || 0}px rgba(${r},${g},${b},${a.toFixed(2)}))`
        }).join(' ')
      }
      return style
    }
    if ((fn === 'linear-gradient' || fn === 'radial-gradient' || fn === 'linear_gradient' || fn === 'radial_gradient') && paint.stops?.length) {
      const stops = paint.stops.map(s => {
        const r = (s.color >>> 24) & 0xff
        const g = (s.color >>> 16) & 0xff
        const b = (s.color >>> 8) & 0xff
        const a = (s.color & 0xff) / 255
        return `rgba(${r},${g},${b},${a.toFixed(2)}) ${Math.round(s.at * 100)}%`
      }).join(', ')
      const safeAngle = Number.isFinite(Number(paint.angle)) ? Number(paint.angle) : 0
      const safeShape = /^(circle|ellipse)$/.test(paint.shape) ? paint.shape : 'circle'
      const grad = (fn === 'linear-gradient' || fn === 'linear_gradient')
        ? `linear-gradient(${safeAngle}deg, ${stops})`
        : `radial-gradient(${safeShape}, ${stops})`
      let style = `background:${grad};-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text`
      if (paint.shadows?.length) {
        style += ';filter:' + paint.shadows.map(s => {
          const r = (s.color >>> 24) & 0xff
          const g = (s.color >>> 16) & 0xff
          const b = (s.color >>> 8) & 0xff
          const a = (s.color & 0xff) / 255
          return `drop-shadow(${Number(s.x_offset) || 0}px ${Number(s.y_offset) || 0}px ${Number(s.radius) || 0}px rgba(${r},${g},${b},${a.toFixed(2)}))`
        }).join(' ')
      }
      return style
    }
    if (paint.color) {
      const r = (paint.color >>> 24) & 0xff
      const g = (paint.color >>> 16) & 0xff
      const b = (paint.color >>> 8) & 0xff
      const a = (paint.color & 0xff) / 255
      return `color:rgba(${r},${g},${b},${a.toFixed(2)})`
    }
    return ''
  }

  // Stream event user colors — login → color (populated from server on connect)
  const streamColorMap = new Map();

  // One-time migration: copy ui_settings from storage.local to storage.sync
  async function migrateSettingsToSync() {
    try {
      const [syncData, localData] = await Promise.all([
        chrome.storage.sync.get(['ui_settings']),
        chrome.storage.local.get(['ui_settings']),
      ])
      if (!syncData.ui_settings && localData.ui_settings) {
        await chrome.storage.sync.set({ ui_settings: localData.ui_settings })
        log('Migrated ui_settings from local to sync')
      }
    } catch (e) {
      log('Settings migration error:', e)
    }
  }

  // Batched ui_settings writer — coalesces multiple saves into one read-modify-write
  let _pendingSettings = null
  let _settingsSaveTimer = null

  function saveUiSetting(key, value) {
    if (!_pendingSettings) _pendingSettings = {}
    _pendingSettings[key] = value
    if (_settingsSaveTimer) cleanup.clearTimeout(_settingsSaveTimer)
    _settingsSaveTimer = cleanup.setTimeout(() => {
      const pending = _pendingSettings
      _pendingSettings = null
      _settingsSaveTimer = null
      chrome.storage.sync.get(['ui_settings']).then(s => {
        chrome.storage.sync.set({ ui_settings: { ...s.ui_settings, ...pending } })
      })
    }, 100)
  }

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
      const isFollowEvent = evt.eventClass?.includes('event-follow')

      // Inject into the channel's own buffer
      if (injectToChat) {
        const buffer = irc?.channels?.get(ch)
        if (buffer) {
          const existing = buffer.getAll()
          const isDupe = existing.some(m => m.type === 'stream-event' && m.text === evt.text)
          if (!isDupe) { buffer.push(evt); added++ }
        }
      }

      // Follow events (went live, switched game) go into live buffer for all followed channels
      // Channel-specific events (redeems, raids, hype) only go to live buffer if channel matches
      if (injectToChat && liveBuffer) {
        const liveBufferMatch = isFollowEvent || ch === liveCh
        if (liveBufferMatch) {
          const chBuffer = irc?.channels?.get(ch)
          if (liveBuffer !== chBuffer) {
            const existing = liveBuffer.getAll()
            const isDupe = existing.some(m => m.type === 'stream-event' && m.text === evt.text)
            if (!isDupe) { liveBuffer.push(evt); added++ }
          }
        }
      }

      // Always push to activityEvents regardless of age
      pushActivityEvent(evt)
    }
    return added
  }

  // Normalize stream event text to [channel] ◆ format (old events may lack brackets)
  function normalizeStreamEventText(text, channel) {
    if (!text) return text
    // Already has brackets — keep as-is
    if (text.startsWith('[')) return text
    // Migrate: "channel ◆ ..." → "[channel] ◆ ..."
    if (channel && text.startsWith(channel + ' \u25C6')) {
      return `[${channel}] \u25C6` + text.slice(channel.length + 2)
    }
    // Try to extract channel from "channelname ◆ ..." pattern
    const m = text.match(/^([a-zA-Z0-9_]+) \u25C6/)
    if (m) return `[${m[1]}]` + text.slice(m[1].length)
    return text
  }

  async function loadStreamEvents() {
    try {
      const data = await api.storage.local.get(STREAM_EVENTS_KEY)
      const events = data[STREAM_EVENTS_KEY]
      if (!Array.isArray(events) || events.length === 0) return
      const cutoff = Date.now() - 86400000 // 24h expiry
      // Dedup by normalized text (multi-tab race can create duplicate entries in storage)
      const seenTexts = new Set()
      const valid = []
      for (const e of events) {
        if (e.time <= cutoff) continue
        // Prune 7TV emote change messages that were incorrectly saved as stream events
        const evtText = e.text || e.message || ''
        if (evtText.includes('removed from channel') || evtText.includes('added to channel') ||
            evtText.includes('removed 7TV emote') || evtText.includes('added 7TV emote')) continue
        // Normalize old unbracketed format to [channel] format
        e.text = normalizeStreamEventText(e.text, e.channel)
        if (e.text && seenTexts.has(e.text)) continue
        seenTexts.add(e.text)
        valid.push(e)
      }

      injectStreamEventsIntoBuffers(valid, true)

      // Seed dedup map so realtime handlers don't re-add loaded events
      if (!window._hsStreamEventDedup) window._hsStreamEventDedup = new Map()
      const now = Date.now()
      for (const e of valid) {
        if (e.text) window._hsStreamEventDedup.set(e.text, now)
      }

      // Prune expired + deduped from storage
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
    // Two sections: scrollable channel tabs + fixed utility buttons (always visible)
    // Static hardcoded buttons — all in one wrapping flow, no user input
    container.innerHTML = `
      <div class="hs-mc-tabs-scroll">
        <button class="hs-mc-tab active" data-tab="feed">${t('mc_tab_feed')}</button>
        <button class="hs-mc-tab" data-tab="whispers">${t('mc_tab_whispers')}</button>
        <button class="hs-mc-tab" data-tab="mentions">${t('mc_tab_mentions')}</button>
        <button class="hs-mc-tab" data-tab="discover">${t('mc_tab_discover')}</button>
        <button class="hs-mc-tab" data-tab="pinned">${t('mc_tab_pinned')}</button>
        <button class="hs-mc-tab" data-tab="live">${t('mc_tab_live')}</button>
        <button class="hs-mc-tab" data-tab="add">+</button>
      </div>
      <div id="hs-mc-platfilter"></div>
      <div class="hs-mc-util-row">
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-rotate-chat" data-tab="rotate-chat" title="${t('mc_btn_rotate_chat')}">C</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-rotate" data-tab="rotate" title="${t('mc_btn_rotate_tabs')}">T</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-font-btn" data-font-dir="-1" title="${t('mc_btn_smaller_text')}">F-</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-font-btn" data-font-dir="1" title="${t('mc_btn_larger_text')}">F+</button>
        <button class="hs-mc-tab hs-mc-util-btn" data-tab="settings" title="${t('mc_btn_settings')}">\u2699</button>
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
      } else if (tabId === 'rotate-chat') {
        rotateChatPosition();
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

    // Right-click tabs → mark as read + channel context menu
    container.addEventListener('contextmenu', (e) => {
      const tab = e.target.closest('.hs-mc-tab');
      if (!tab) return;
      const tabId = tab.dataset.tab;
      // Right-click any tab clears all unread indicators (mentions, new, stream-event)
      if (tab.classList.contains('has-mentions') || tab.classList.contains('has-new') || tab.classList.contains('has-stream-event')) {
        e.preventDefault();
        tab.classList.remove('has-mentions', 'has-new', 'has-stream-event');
        // Sync seen count so updateTabBadges doesn't re-add it
        if (tabId === 'mentions') mentionsSeenCount = mentionsBuffer.length;
        return;
      }

      // Live tab gets platform edit context menu
      if (tabId === 'live') {
        e.preventDefault();
        document.getElementById('hs-mc-ctx-menu')?.remove();
        const menu = document.createElement('div');
        menu.id = 'hs-mc-ctx-menu';
        menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #808080;border-radius:0;padding:4px 0;min-width:150px;font-size:12px;font-family:inherit;';
        const item = document.createElement('div');
        item.textContent = 'edit platforms';
        item.style.cssText = 'padding:6px 12px;cursor:pointer;color:#fff;';
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', () => { menu.remove(); showEditLivePlatforms(); });
        menu.appendChild(item);
        document.body.appendChild(menu);
        const mw = menu.offsetWidth, mh = menu.offsetHeight;
        menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px';
        const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
        cleanup.setTimeout(() => document.addEventListener('click', dismiss, { signal: mcSignal }), 0);
        return;
      }

      // Channel tabs get edit/remove context menu
      const reserved = ['feed', 'mentions', 'whispers', 'discover', 'pinned', 'add', 'rotate', 'settings'];
      if (reserved.includes(tabId)) return;
      e.preventDefault();

      // Remove any existing context menu
      document.getElementById('hs-mc-ctx-menu')?.remove();

      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
      const menu = document.createElement('div');
      menu.id = 'hs-mc-ctx-menu';
      menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #808080;border-radius:0;padding:4px 0;min-width:150px;font-size:12px;font-family:inherit;';

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
      cleanup.setTimeout(() => document.addEventListener('click', dismiss, { signal: mcSignal }), 0);
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
  let showOfflineEvents = false;

  // Auto-claim Twitch channel points bonus chest (default on)
  let autoClaimPoints = true;

  // Dim timed-out/banned messages instead of hiding (default on)
  let dimTimeouts = true;

  // Boost username color brightness for readability on black bg (default on)
  let readableNamesEnabled = true;

  // Input bar auto-hide — hidden when empty, shown on first keystroke
  let autoHideInput = false;
  let inputBarVisible = true;

  // Smart tab-completion ranking — recent chatters surface first (default on)
  let smartCompletion = true;

  // First-time chatter highlight — orange edge on first message from a user this session (default on)
  let firstChatterGlow = true;
  // channelLower → Set<usernameLower> seen this session
  const seenChattersByChannel = new Map();
  function markChatterSeen(channel, username) {
    if (!channel || !username) return false
    const ch = channel.toLowerCase()
    const u = username.toLowerCase()
    let set = seenChattersByChannel.get(ch)
    if (!set) { set = new Set(); seenChattersByChannel.set(ch, set) }
    if (set.has(u)) return false
    set.add(u)
    // LRU cap to 5000 per channel
    if (set.size > 5000) {
      const iter = set.values()
      for (let i = 0; i < 1000; i++) set.delete(iter.next().value)
    }
    return true
  }

  // Keyword highlights — newline-separated terms; messages containing any get an orange tint
  let keywordHighlights = '';
  let keywordHighlightsRegex = null;
  function rebuildKeywordRegex() {
    const terms = keywordHighlights.split(/\n/).map(s => s.trim()).filter(Boolean)
    if (!terms.length) { keywordHighlightsRegex = null; return }
    const escaped = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    try { keywordHighlightsRegex = new RegExp('\\b(' + escaped.join('|') + ')\\b', 'i') }
    catch { keywordHighlightsRegex = null }
  }

  // ═══ Inline notification routing ═══
  // Modular registry: each type can be toggled independently
  // Colors match website conventions
  const INLINE_NOTIF_TYPES = {
    op:      { tag: '[OP]', color: '#ff0000', borderColor: '#ff0000', defaultOn: true,  label: t('mc_settings_notif_op'),       desc: t('mc_settings_notif_op_desc') },
    mop:     { tag: '[OP]', color: '#ff00ff', borderColor: '#ff00ff', defaultOn: true,  label: t('mc_settings_notif_op_reply'), desc: t('mc_settings_notif_op_reply_desc') },
    re:      { tag: '[RE]', color: '#00ffff', borderColor: '#00ffff', defaultOn: false, label: t('mc_settings_notif_re'),       desc: t('mc_settings_notif_re_desc') },
    dm:      { tag: '[DM]', color: '#ffff00', borderColor: '#ffff00', defaultOn: false, label: t('mc_settings_notif_dm'),       desc: t('mc_settings_notif_dm_desc') },
  }
  // Runtime state: { op: true, re: false, dm: false, mention: true }
  const inlineNotifs = {}
  for (const [k, v] of Object.entries(INLINE_NOTIF_TYPES)) inlineNotifs[k] = v.defaultOn

  // Hermes event toggles (Twitch-native events: raids, hype trains, etc.)
  const HERMES_EVENT_TYPES = {
    raid:   { color: '#9146ff', defaultOn: true,  label: t('mc_settings_raids'),              desc: t('mc_settings_raids_desc') },
    hype:   { color: '#ff8700', defaultOn: false, label: t('mc_settings_hype_trains'),        desc: t('mc_settings_hype_trains_desc') },
    sub:    { color: '#00ff7f', defaultOn: true,  label: t('mc_settings_gift_subs'),          desc: t('mc_settings_gift_subs_desc') },
    redeem: { color: '#00bfff', defaultOn: true,  label: t('mc_settings_redeems'),            desc: t('mc_settings_redeems_desc') },
    pred:   { color: '#387aff', defaultOn: true,  label: t('mc_settings_prediction_banner'),  desc: t('mc_settings_prediction_banner_desc') },
    poll:   { color: '#00c853', defaultOn: true,  label: t('mc_settings_poll_banner'),        desc: t('mc_settings_poll_banner_desc') },
    pin:    { color: '#bf94ff', defaultOn: true,  label: t('mc_settings_pinned_messages'),    desc: t('mc_settings_pinned_messages_desc') },
  }
  const hermesToggles = {}
  for (const [k, v] of Object.entries(HERMES_EVENT_TYPES)) hermesToggles[k] = v.defaultOn

  function showInputBar() {
    if (inputBarVisible) return
    inputBarVisible = true
    const bar = document.getElementById('hs-mc-inputbar')
    if (bar) bar.classList.remove('hs-hidden')
    const overlay = document.getElementById('hs-mc-overlay')
    if (overlay) overlay.style.bottom = ''
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
  // YouTube enforces #primary { min-width: 640px } — never let chat encroach
  // on the video player. The +20px fudge covers column-gap and scrollbar
  // gutter so we don't trip a 1px viewport overflow at the boundary.
  const YT_MIN_PRIMARY_WIDTH = 660;

  // Compute the largest chat width that won't squash YouTube's video column.
  // Bases on the watch-flexy container width (the actual flex-row that holds
  // primary + secondary) when available, falling back to viewport. Keeps a
  // YT_MIN_PRIMARY_WIDTH gutter for the player.
  function getYtMaxChatWidth() {
    if (hostPlatform !== 'yt') return MAX_CHAT_WIDTH
    const flexy = document.querySelector('ytd-watch-flexy')
    const flexyW = flexy?.getBoundingClientRect?.().width || 0
    const vw = window.innerWidth || document.documentElement.clientWidth || 1280
    const available = flexyW > 0 ? Math.min(flexyW, vw) : vw
    return Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, available - YT_MIN_PRIMARY_WIDTH))
  }

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'hs-mc-overlay';
    // Static hardcoded layout — only static strings, no user input, safe innerHTML
    const searchPlaceholder = 'search messages…'
    overlay.innerHTML = `
      <div id="hs-mc-search-bar">
        <input id="hs-mc-search-input" type="text" placeholder="${searchPlaceholder}" autocomplete="off" spellcheck="false" />
        <div id="hs-mc-search-spinner"></div>
      </div>
      <div id="hs-mc-multistream-banner" hidden></div>
      <div id="hs-mc-messages">
        <div class="hs-mc-empty">${t('mc_no_messages')}</div>
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

      const isStaticTab = () => currentTab === 'feed' || currentTab === 'settings' || currentTab === 'discover' || currentTab === 'pinned';

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
          newBtn.innerHTML = newMessageCount > 0 ? `<span class="hs-arrow-down">▼</span> ${t('mc_new_messages', [String(newMessageCount)])}` : `<span class="hs-arrow-down">▼</span> ${t('mc_resume')}`;
          newBtn.style.display = 'flex';
        }
      });

      // Use wheel event to detect intentional user scrolling
      // Note: newBtn.innerHTML uses only static safe content (arrow + count), no user data
      let _wheelCheckTimer = null
      mcSignal.addEventListener('abort', () => {
        if (_wheelCheckTimer) { clearTimeout(_wheelCheckTimer); _wheelCheckTimer = null }
      })
      msgsEl.addEventListener('wheel', (e) => {
        if (isStaticTab()) {
          if (msgsEl.scrollTop <= 50) { newBtn.style.display = 'none'; newMessageCount = 0; }
        } else if (e.deltaY < 0) {
          // Scrolling up with wheel = user intent — only update DOM if state changes
          if (!isScrolledUp) {
            isScrolledUp = true
            newBtn.innerHTML = newMessageCount > 0 ? `<span class="hs-arrow-down">\u25BC</span> ${t('mc_new_messages', [String(newMessageCount)])}` : `<span class="hs-arrow-down">\u25BC</span> ${t('mc_resume')}`
            newBtn.style.display = 'flex'
          }
        }
        // Debounced scroll position check (covers both static and chat tabs)
        if (_wheelCheckTimer) cleanup.clearTimeout(_wheelCheckTimer)
        _wheelCheckTimer = cleanup.setTimeout(() => {
          _wheelCheckTimer = null
          if (isStaticTab()) {
            isScrolledUp = msgsEl.scrollTop > 50
          } else {
            const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 50
            if (atBottom) {
              isScrolledUp = false
              newMessageCount = 0
              newBtn.style.display = 'none'
            }
          }
        }, 50)
      }, { passive: true })

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

      // Hover-thread highlight — yellow border on related reply chain (mirrors website)
      let _threadHover = null
      const clearThreadHover = () => {
        if (!_threadHover) return
        for (const el of msgsEl.querySelectorAll('.hs-mc-thread-highlight')) {
          el.classList.remove('hs-mc-thread-highlight')
        }
        _threadHover = null
      }
      msgsEl.addEventListener('mouseover', (e) => {
        const msg = e.target.closest('.hs-mc-msg')
        if (!msg || msg === _threadHover) return
        const own = msg.dataset.msgId || ''
        const parent = msg.dataset.replyId || ''
        const root = msg.dataset.replyThreadId || ''
        if (!parent && !root) {
          // Not a reply — only highlight if it has children (other msgs replying to it)
          if (!own) return clearThreadHover()
          const childSel = `[data-reply-id="${CSS.escape(own)}"], [data-reply-thread-id="${CSS.escape(own)}"]`
          if (!msgsEl.querySelector(childSel)) return clearThreadHover()
        }
        clearThreadHover()
        _threadHover = msg
        const ids = new Set([own, parent, root].filter(Boolean))
        const sels = []
        for (const id of ids) {
          const safe = CSS.escape(id)
          sels.push(`[data-msg-id="${safe}"]`, `[data-reply-id="${safe}"]`, `[data-reply-thread-id="${safe}"]`)
        }
        for (const el of msgsEl.querySelectorAll(sels.join(','))) {
          el.classList.add('hs-mc-thread-highlight')
        }
      }, { passive: true, signal: mcSignal })
      msgsEl.addEventListener('mouseout', (e) => {
        if (!_threadHover) return
        if (_threadHover.contains(e.relatedTarget)) return
        const stillIn = e.relatedTarget && _threadHover === e.relatedTarget.closest?.('.hs-mc-msg')
        if (stillIn) return
        clearThreadHover()
      }, { passive: true, signal: mcSignal })
    }, 100);

    // Search bar wiring — debounce 250ms then call /api/search
    const searchInput = overlay.querySelector('#hs-mc-search-input')
    const searchSpinner = overlay.querySelector('#hs-mc-search-spinner')
    let _searchTimer = null
    let _searchActive = false

    if (searchInput && searchSpinner) {
      searchInput.addEventListener('input', () => {
        if (_searchTimer) { cleanup.clearTimeout(_searchTimer); _searchTimer = null }
        const q = searchInput.value.trim()
        if (!q) {
          _searchActive = false
          searchSpinner.classList.remove('visible')
          if (currentTab === 'mentions') renderMessages('mentions')
          return
        }
        _searchActive = true
        searchSpinner.classList.add('visible')
        _searchTimer = cleanup.setTimeout(async () => {
          _searchTimer = null
          if (!_searchActive) return
          const msgsEl = document.getElementById('hs-mc-messages')
          if (!msgsEl || currentTab !== 'mentions') return
          try {
            const resp = await apiFetch(`/api/search?q=${encodeURIComponent(q)}&mode=messages&limit=50`)
            if (!_searchActive || currentTab !== 'mentions') return
            searchSpinner.classList.remove('visible')
            const results = resp?.data?.results || resp?.results || []
            renderSearchResults(msgsEl, results, q)
          } catch (e) {
            searchSpinner.classList.remove('visible')
          }
        }, 250)
      })

      // Clear search state when input is cleared via keyboard
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          searchInput.value = ''
          _searchActive = false
          searchSpinner.classList.remove('visible')
          if (_searchTimer) { cleanup.clearTimeout(_searchTimer); _searchTimer = null }
          if (currentTab === 'mentions') renderMessages('mentions')
        }
      })
    }

    return overlay;
  }

  function renderSearchResults(msgsEl, results, query) {
    msgsEl.textContent = ''
    if (!results.length) {
      const empty = document.createElement('div')
      empty.className = 'hs-mc-search-empty'
      empty.textContent = 'no results'
      msgsEl.appendChild(empty)
      return
    }
    const frag = document.createDocumentFragment()
    for (const r of results) {
      const div = document.createElement('div')
      div.className = 'hs-mc-search-result'

      const ts = r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      const user = escapeHtml(r.display_name || r.username || '')
      const content = escapeHtml(r.content || '')
      const msgId = r.base36_id || ''
      const permalink = msgId ? `https://heatsync.org/m/${msgId}` : null

      const meta = document.createElement('div')
      meta.className = 'hs-mc-search-meta'
      if (ts) {
        const tsSpan = document.createElement('span')
        tsSpan.textContent = ts
        meta.appendChild(tsSpan)
      }
      const userSpan = document.createElement('span')
      userSpan.className = 'hs-mc-search-user'
      userSpan.innerHTML = user
      meta.appendChild(userSpan)

      const body = document.createElement('div')
      body.className = 'hs-mc-search-content'
      body.innerHTML = content

      div.appendChild(meta)
      div.appendChild(body)

      if (permalink) {
        div.addEventListener('click', () => window.open(permalink, '_blank', 'noopener'))
      }

      frag.appendChild(div)
    }
    msgsEl.appendChild(frag)
  }

  /**
   * Setup resize handle for dragging chat width
   *
   * Buttery-smooth strategy: during drag we DO NOT change rightCol's width.
   * Twitch packs ~2500 Layout-sc-* React components inside right-column, and
   * every width change triggers React reconciliation across all of them — that
   * was the lag. Instead, we render a fixed-positioned ghost div as a live
   * boundary preview. The ghost moves at compositor speed (no layout, no
   * reconciles, no mutations). On release we commit the real width once,
   * giving the player and Twitch's React tree exactly one reflow.
   */
  function setupResizeHandle() {
    const rightCol = document.querySelector('.right-column.right-column--beside')
    if (!rightCol || document.getElementById('hs-mc-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-mc-resize-handle'
    handle.style.touchAction = 'none'
    rightCol.insertBefore(handle, rightCol.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0
    let rafId = 0
    let pendingWidth = 0
    let lastGhostWidth = 0
    let activePointerId = -1
    let overlay = null
    let ghost = null
    const isVertical = () => tabPosition === 'left' || tabPosition === 'right'

    function applyResize() {
      rafId = 0
      if (pendingWidth === lastGhostWidth) return
      lastGhostWidth = pendingWidth
      chatWidth = pendingWidth
      // Compositor-only update — no layout, no React reconcile
      if (ghost) ghost.style.width = (pendingWidth + (isVertical() ? 90 : 0)) + 'px'
    }

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      isResizing = true
      activePointerId = e.pointerId
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      startX = e.clientX
      startWidth = chatWidth
      const rect = rightCol.getBoundingClientRect()
      const w0 = Math.round(rect.width)
      pendingWidth = chatWidth
      lastGhostWidth = w0

      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      // Live boundary preview — fixed-positioned, pointer-events:none, will-change:width
      // for the compositor. Visual: subtle orange tint with a 3px left edge.
      ghost = document.createElement('div')
      ghost.id = 'hs-resize-ghost'
      ghost.style.cssText = `position:fixed;top:${rect.top}px;right:0;height:${rect.height}px;width:${w0}px;background:rgba(255,135,0,0.06);border-left:3px solid #ff8700;pointer-events:none;z-index:99998;will-change:width;`
      document.body.appendChild(ghost)

      overlay = document.createElement('div')
      overlay.id = 'hs-resize-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:ew-resize'
      document.body.appendChild(overlay)
      e.preventDefault()
    })

    handle.addEventListener('pointermove', (e) => {
      if (!isResizing || e.pointerId !== activePointerId) return
      const delta = startX - e.clientX
      pendingWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    })

    function endDrag(e) {
      if (!isResizing || (e && e.pointerId !== activePointerId)) return
      isResizing = false
      activePointerId = -1
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      chatWidth = pendingWidth || chatWidth
      if (ghost) { ghost.remove(); ghost = null }
      // Single real width commit — player reflows exactly once here
      applyChatWidth(rightCol)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (overlay) { overlay.remove(); overlay = null }
      saveChatWidth()
    }
    handle.addEventListener('pointerup', endDrag)
    handle.addEventListener('pointercancel', endDrag)

    loadChatWidth()
    loadChatHeight()
  }

  function applyChatWidth(cachedRightCol) {
    const rightCol = cachedRightCol || document.querySelector('.right-column')
    if (!rightCol) return
    // C button took chat off the right edge — don't restore native width here
    // or the right-column reclaims its 340px and the player snaps back.
    if (chatPosition && chatPosition !== 'right') {
      rightCol.style.setProperty('width', '0', 'important')
      rightCol.style.setProperty('min-width', '0', 'important')
      rightCol.style.setProperty('max-width', '0', 'important')
      return
    }
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

    rightCol.style.setProperty('width', colWidth + 'px', 'important')
    rightCol.style.setProperty('min-width', colWidth + 'px', 'important')
    rightCol.style.setProperty('flex-shrink', '0', 'important')

    const innerCol = rightCol.querySelector('.channel-root__right-column')
    if (innerCol) {
      innerCol.style.setProperty('width', '100%', 'important')
    }
  }

  let _saveChatWidthTimer = null;
  function saveChatWidth() {
    if (_saveChatWidthTimer) cleanup.clearTimeout(_saveChatWidthTimer);
    _saveChatWidthTimer = cleanup.setTimeout(() => {
      _saveChatWidthTimer = null;
      chrome.storage.local.set({ hs_chat_width: chatWidth });
      log('Saved chat width:', chatWidth);
    }, 250);
  }

  // ============================================
  // CHAT HEIGHT — for top/bottom chatPosition. Persisted in chrome.storage
  // alongside chatWidth so the C button's drag handle survives reloads.
  // ============================================
  const MIN_CHAT_HEIGHT = 120;
  function getMaxChatHeight() { return Math.round(window.innerHeight * 0.7); }
  let chatHeight = Math.round(window.innerHeight * 0.35);
  let _saveChatHeightTimer = null;
  function saveChatHeight() {
    if (_saveChatHeightTimer) cleanup.clearTimeout(_saveChatHeightTimer);
    _saveChatHeightTimer = cleanup.setTimeout(() => {
      _saveChatHeightTimer = null;
      chrome.storage.local.set({ hs_chat_height: chatHeight });
      log('Saved chat height:', chatHeight);
    }, 250);
  }
  async function loadChatHeight() {
    try {
      const data = await chrome.storage.local.get(['hs_chat_height']);
      if (data.hs_chat_height) chatHeight = data.hs_chat_height;
    } catch (_) {}
  }

  // ============================================
  // UNIFIED CHAT RESIZE HANDLE — bulletproof across all 4 chatPosition
  // values × all 3 platforms × theatre mode. Single #hs-c-resize-handle on
  // body, position:fixed, repositioned by positionChatResizeHandle() which
  // is called from applyChatPosition. Drags chatWidth (left/right) or
  // chatHeight (top/bottom). Hides itself when chatPosition='right' and
  // delegates to existing per-platform handles for the default layout.
  // Orange #ff8700, 6px thick, no text — matches user's resize-handle rule.
  // ============================================
  let _isResizingC = false;
  function ensureChatResizeHandle() {
    let handle = document.getElementById('hs-c-resize-handle');
    if (handle) return handle;
    handle = document.createElement('div');
    handle.id = 'hs-c-resize-handle';
    Object.assign(handle.style, {
      position: 'fixed',
      background: '#ff8700',
      opacity: '0.55',
      zIndex: '100000',
      userSelect: 'none',
      touchAction: 'none',
      display: 'none',
      transition: 'opacity 0.12s'
    });
    document.body.appendChild(handle);
    handle.addEventListener('mouseenter', () => { handle.style.opacity = '1'; });
    handle.addEventListener('mouseleave', () => { if (!_isResizingC) handle.style.opacity = '0.55'; });

    // Ghost-preview drag: pointermove only re-positions the orange handle
    // (compositor-only, no layout). Real chatWidth/Height + applyChatPosition
    // commit fires once on pointerup. This kills the YT video lag where every
    // drag-frame triggered a video re-decode at the new resolution.
    let startX = 0, startY = 0, startW = 0, startH = 0, axis = 'x', activePid = -1;
    let pendingW = 0, pendingH = 0, overlay = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      _isResizingC = true;
      activePid = e.pointerId;
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      startX = e.clientX; startY = e.clientY;
      startW = chatWidth; startH = chatHeight;
      pendingW = chatWidth; pendingH = chatHeight;
      axis = (chatPosition === 'left' || chatPosition === 'right') ? 'x' : 'y';
      document.body.style.cursor = axis === 'x' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      handle.style.opacity = '1';
      // Full-viewport overlay: captures pointer events even when crossing
      // iframes (YT player iframe steals events otherwise).
      overlay = document.createElement('div');
      overlay.id = 'hs-c-resize-overlay';
      overlay.style.cssText = `position:fixed;inset:0;z-index:99998;cursor:${axis === 'x' ? 'col-resize' : 'row-resize'};`;
      document.body.appendChild(overlay);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!_isResizingC || e.pointerId !== activePid) return;
      if (chatPosition === 'right') {
        pendingW = Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, startW + (startX - e.clientX)));
        handle.style.right = pendingW + 'px';
      } else if (chatPosition === 'left') {
        pendingW = Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, startW + (e.clientX - startX)));
        handle.style.left = (pendingW - 3) + 'px';
      } else if (chatPosition === 'top') {
        pendingH = Math.max(MIN_CHAT_HEIGHT, Math.min(getMaxChatHeight(), startH + (e.clientY - startY)));
        handle.style.top = (pendingH - 3) + 'px';
      } else if (chatPosition === 'bottom') {
        pendingH = Math.max(MIN_CHAT_HEIGHT, Math.min(getMaxChatHeight(), startH + (startY - e.clientY)));
        handle.style.bottom = (pendingH - 3) + 'px';
      }
    });
    const endDrag = (e) => {
      if (!_isResizingC || (e && e.pointerId !== activePid)) return;
      _isResizingC = false;
      activePid = -1;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      handle.style.opacity = '0.55';
      if (overlay) { overlay.remove(); overlay = null; }
      // Single commit — chat panel + player + tabbar all reflow exactly once.
      if (axis === 'x') chatWidth = pendingW;
      else chatHeight = pendingH;
      applyChatPosition();
      saveChatWidth();
      saveChatHeight();
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
    return handle;
  }
  function positionChatResizeHandle() {
    const handle = ensureChatResizeHandle();
    ;['top','bottom','left','right','width','height'].forEach(p => handle.style.removeProperty(p));
    if (chatPosition === 'right' || !chatPosition) {
      // Default layout — let the existing per-platform handle (Twitch/Kick/YT)
      // own the right-edge drag. Their ghost-preview perf optimisations
      // for Twitch's React tree are worth keeping. Unified handle hides.
      handle.style.display = 'none';
      return;
    }
    handle.style.display = 'block';
    if (chatPosition === 'left') {
      handle.style.top = '0';
      handle.style.bottom = '0';
      handle.style.left = (chatWidth - 3) + 'px';
      handle.style.width = '6px';
      handle.style.cursor = 'col-resize';
    } else if (chatPosition === 'top') {
      handle.style.top = (chatHeight - 3) + 'px';
      handle.style.left = '0';
      handle.style.right = '0';
      handle.style.height = '6px';
      handle.style.cursor = 'row-resize';
    } else if (chatPosition === 'bottom') {
      handle.style.bottom = (chatHeight - 3) + 'px';
      handle.style.left = '0';
      handle.style.right = '0';
      handle.style.height = '6px';
      handle.style.cursor = 'row-resize';
    }
  }
  function hidePlatformResizeHandles(hide) {
    // hide=true: set display:none + mark as hidden-by-us. hide=false: only
    // restore display if we previously hid it (platforms like YT manage
    // their own display:none for theatre mode — don't clobber that).
    for (const id of ['hs-mc-resize-handle','hs-kick-resize-handle','hs-yt-resize-handle']) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (hide) {
        el.dataset._hsCHidden = '1';
        el.style.setProperty('display', 'none', 'important');
      } else if (el.dataset._hsCHidden === '1') {
        delete el.dataset._hsCHidden;
        el.style.removeProperty('display');
      }
    }
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
    chatWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, chatWidth))
    document.documentElement.style.setProperty('--hs-kick-chat-width', chatWidth + 'px')
    document.documentElement.style.setProperty('--chat-width', chatWidth + 'px')
    // C button took chat off the right edge — chatroom is hidden via CSS,
    // skip restoring its width (would un-hide it visually as the shell still
    // claims layout when display is intercepted by the cascade).
    if (chatPosition && chatPosition !== 'right') return
    chatroom.style.setProperty('width', chatWidth + 'px', 'important')
  }

  /**
   * Setup resize handle for Kick — left edge of fixed #channel-chatroom panel
   * Uses rAF batching, iframe overlay, and kills Kick's native transitions
   */
  function setupKickResizeHandle() {
    const chatroom = document.getElementById('channel-chatroom')
    const mcContainer = document.getElementById('hs-mc-container')
    if (!chatroom || !mcContainer || document.getElementById('hs-kick-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-kick-resize-handle'
    handle.style.touchAction = 'none'
    mcContainer.insertBefore(handle, mcContainer.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0
    let rafId = 0
    let pendingWidth = 0
    let lastGhostWidth = 0
    let activePointerId = -1
    let overlay = null
    let ghost = null

    function applyResize() {
      rafId = 0
      if (pendingWidth === lastGhostWidth) return
      lastGhostWidth = pendingWidth
      chatWidth = pendingWidth
      if (ghost) ghost.style.width = pendingWidth + 'px'
    }

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      isResizing = true
      activePointerId = e.pointerId
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      startX = e.clientX
      startWidth = chatWidth
      const rect = (chatroom.classList.contains('hs-native-hidden') ? mcContainer : chatroom).getBoundingClientRect()
      const w0 = Math.round(rect.width)
      pendingWidth = chatWidth
      lastGhostWidth = w0
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      ghost = document.createElement('div')
      ghost.id = 'hs-resize-ghost'
      ghost.style.cssText = `position:fixed;top:${rect.top}px;right:0;height:${rect.height}px;width:${w0}px;background:rgba(255,135,0,0.06);border-left:3px solid #ff8700;pointer-events:none;z-index:99998;will-change:width;`
      document.body.appendChild(ghost)

      overlay = document.createElement('div')
      overlay.id = 'hs-resize-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize'
      document.body.appendChild(overlay)
      e.preventDefault()
    })

    handle.addEventListener('pointermove', (e) => {
      if (!isResizing || e.pointerId !== activePointerId) return
      const delta = startX - e.clientX
      pendingWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    })

    function endDrag(e) {
      if (!isResizing || (e && e.pointerId !== activePointerId)) return
      isResizing = false
      activePointerId = -1
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      chatWidth = pendingWidth || chatWidth
      if (ghost) { ghost.remove(); ghost = null }
      applyKickChatWidth()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (overlay) { overlay.remove(); overlay = null }
      saveChatWidth()
    }
    handle.addEventListener('pointerup', endDrag)
    handle.addEventListener('pointercancel', endDrag)

    loadChatWidth().then(() => { applyKickChatWidth() })
    loadChatHeight()
  }

  /**
   * Apply chat width to YouTube's #secondary sidebar
   */
  function applyYouTubeChatWidth() {
    const secondary = document.querySelector('#secondary, ytd-watch-flexy #secondary')
    if (!secondary) return
    // C button took chat off the right edge — collapse #secondary to 0 so
    // the freed width goes back to the player; don't run the native width
    // sizer which would re-claim the sidebar.
    if (chatPosition && chatPosition !== 'right') {
      secondary.style.setProperty('width', '0', 'important')
      secondary.style.setProperty('min-width', '0', 'important')
      secondary.style.setProperty('max-width', '0', 'important')
      secondary.style.setProperty('flex', '0 0 0', 'important')
      const handle = document.getElementById('hs-yt-resize-handle')
      if (handle) handle.style.display = 'none'
      return
    }
    // Theater (cinema) and fullscreen mode rearrange the watch layout so that
    // #secondary sits BELOW the player at full row width. Our fixed-px width
    // would fight that reflow, so just clear our overrides and let YT's CSS
    // run unmodified. Also hide the left-edge resize handle since the panel
    // no longer has a left edge to drag against.
    const flexy = document.querySelector('ytd-watch-flexy')
    const isTheater = !!flexy?.hasAttribute('theater') || !!flexy?.hasAttribute('fullscreen')
    const handle = document.getElementById('hs-yt-resize-handle')
    if (isTheater) {
      secondary.style.removeProperty('width')
      secondary.style.removeProperty('min-width')
      secondary.style.removeProperty('max-width')
      secondary.style.removeProperty('flex')
      const container = document.getElementById('hs-mc-container')
      if (container) container.style.removeProperty('width')
      if (handle) handle.style.display = 'none'
      return
    }
    if (handle) handle.style.display = ''
    const ytMax = getYtMaxChatWidth()
    chatWidth = Math.min(ytMax, Math.max(MIN_CHAT_WIDTH, chatWidth))
    secondary.style.setProperty('width', chatWidth + 'px', 'important')
    secondary.style.setProperty('min-width', chatWidth + 'px', 'important')
    secondary.style.setProperty('max-width', chatWidth + 'px', 'important')
    secondary.style.setProperty('flex', 'none', 'important')
    // Also resize the hs-mc-container to fill
    const container = document.getElementById('hs-mc-container')
    if (container) container.style.setProperty('width', '100%', 'important')
  }

  // Re-apply layout whenever YT toggles theater/fullscreen so we release or
  // restore our width overrides at the right moment.
  function watchYtLayoutAttrs() {
    if (hostPlatform !== 'yt') return
    const flexy = document.querySelector('ytd-watch-flexy')
    if (!flexy) return
    const obs = new MutationObserver(() => applyYouTubeChatWidth())
    obs.observe(flexy, { attributes: true, attributeFilter: ['theater', 'fullscreen', 'is-two-columns_'] })
    cleanup.trackObserver(obs)
  }

  // Re-clamp chat width when viewport shrinks (window resize / devtools open).
  // Without this, a chat width persisted at a wider viewport pushes the video
  // off-screen on a smaller window and the resize handle's max can't catch up.
  let _ytViewportClampTimer = null
  function watchYtViewportClamp() {
    if (hostPlatform !== 'yt') return
    const onResize = () => {
      if (_ytViewportClampTimer) cleanup.clearTimeout(_ytViewportClampTimer)
      _ytViewportClampTimer = cleanup.setTimeout(() => {
        _ytViewportClampTimer = null
        applyYouTubeChatWidth()
      }, 80)
    }
    window.addEventListener('resize', onResize, { signal: mcSignal })
  }

  /**
   * Setup resize handle for YouTube — left edge of #secondary sidebar
   */
  function setupYouTubeResizeHandle() {
    const secondary = document.querySelector('#secondary, ytd-watch-flexy #secondary')
    const mcContainer = document.getElementById('hs-mc-container')
    if (!secondary || !mcContainer || document.getElementById('hs-yt-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-yt-resize-handle'
    handle.style.touchAction = 'none'
    secondary.style.position = 'relative'
    secondary.insertBefore(handle, secondary.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0
    let rafId = 0
    let pendingWidth = 0
    let lastGhostWidth = 0
    let activePointerId = -1
    let overlay = null
    let ghost = null

    function applyResize() {
      rafId = 0
      if (pendingWidth === lastGhostWidth) return
      lastGhostWidth = pendingWidth
      chatWidth = pendingWidth
      if (ghost) ghost.style.width = pendingWidth + 'px'
    }

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      isResizing = true
      activePointerId = e.pointerId
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      startX = e.clientX
      startWidth = chatWidth
      const rect = secondary.getBoundingClientRect()
      const w0 = Math.round(rect.width)
      pendingWidth = chatWidth
      lastGhostWidth = w0
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'

      ghost = document.createElement('div')
      ghost.id = 'hs-resize-ghost'
      ghost.style.cssText = `position:fixed;top:${rect.top}px;right:0;height:${rect.height}px;width:${w0}px;background:rgba(255,135,0,0.06);border-left:3px solid #ff8700;pointer-events:none;z-index:99998;will-change:width;`
      document.body.appendChild(ghost)

      overlay = document.createElement('div')
      overlay.id = 'hs-resize-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:ew-resize'
      document.body.appendChild(overlay)
      e.preventDefault()
    })

    handle.addEventListener('pointermove', (e) => {
      if (!isResizing || e.pointerId !== activePointerId) return
      const delta = startX - e.clientX
      // Use the viewport-aware cap so a small window can't be dragged past the
      // point where the video column gets crushed.
      const ytMax = getYtMaxChatWidth()
      pendingWidth = Math.min(ytMax, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    })

    function endDrag(e) {
      if (!isResizing || (e && e.pointerId !== activePointerId)) return
      isResizing = false
      activePointerId = -1
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      chatWidth = pendingWidth || chatWidth
      if (ghost) { ghost.remove(); ghost = null }
      applyYouTubeChatWidth()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (overlay) { overlay.remove(); overlay = null }
      saveChatWidth()
    }
    handle.addEventListener('pointerup', endDrag)
    handle.addEventListener('pointercancel', endDrag)

    loadChatWidth().then(() => { applyYouTubeChatWidth() })
    loadChatHeight()
    watchYtViewportClamp()
    watchYtLayoutAttrs()
  }

  // Emote size functions
  function setEmoteSize(size) {
    if ([1, 2, 4].includes(size)) {
      emoteSize = size;
      saveEmoteSize();
      applyEmoteSize();
    }
  }

  let _saveEmoteSizeTimer = null;
  function saveEmoteSize() {
    if (_saveEmoteSizeTimer) cleanup.clearTimeout(_saveEmoteSizeTimer);
    _saveEmoteSizeTimer = cleanup.setTimeout(() => {
      _saveEmoteSizeTimer = null;
      chrome.storage.local.set({ hs_emote_size: emoteSize });
    }, 250);
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
      const stored = await chrome.storage.sync.get(['ui_settings'])
      const saved = stored.ui_settings?.inlineNotifs
      if (saved) {
        for (const k of Object.keys(INLINE_NOTIF_TYPES)) {
          if (saved[k] !== undefined) inlineNotifs[k] = saved[k]
        }
      }
    } catch {}
  }

  function saveInlineNotifSettings() {
    saveUiSetting('inlineNotifs', { ...inlineNotifs })
  }

  async function loadHermesSettings() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings'])
      const saved = stored.ui_settings?.hermesEvents
      if (saved) {
        for (const k of Object.keys(HERMES_EVENT_TYPES)) {
          if (saved[k] !== undefined) hermesToggles[k] = saved[k]
        }
      }
    } catch {}
  }

  // (automod moved to automod.js)

  function saveHermesSettings() {
    saveUiSetting('hermesEvents', { ...hermesToggles })
  }

  // Inject an inline notification into active chat tabs
  function injectInlineNotif(notifType, msg) {
    if (!inlineNotifs[notifType]) return
    const typeDef = INLINE_NOTIF_TYPES[notifType]
    if (!typeDef) return

    msg.inlineNotifType = notifType
    msg.inlineNotifColor = typeDef.color
    msg.inlineNotifBorderColor = typeDef.borderColor
    msg.inlineNotifLabel = typeDef.tag

    // Persist into ALL channel buffers (IRC + Kick + YouTube) so notification appears on every tab
    for (const ch of config.channels) {
      const twitchName = typeof ch === 'string' ? ch : ch?.twitch
      const kickName = typeof ch === 'string' ? null : ch?.kick
      const chId = typeof ch === 'string' ? ch : ch?.id
      const buffer = (twitchName && irc?.channels?.get(twitchName)) ||
                     (kickName && kickChat?.channels?.get(kickName))
      if (buffer) buffer.push(msg)
      // Also inject into YouTube channel buffers
      const ytBuf = chId && channelYtMessages.get(chId)
      if (ytBuf) ytBuf.push(msg)
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
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.wysiwygEnabled !== undefined) {
        wysiwygEnabled = stored.ui_settings.wysiwygEnabled;
      }
    } catch (e) {
      log('Error loading WYSIWYG setting:', e);
    }
  }

  function saveWysiwygSetting() {
    saveUiSetting('wysiwygEnabled', wysiwygEnabled)
  }

  // Clickable links setting
  async function loadLinksSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.linksEnabled !== undefined) {
        linksEnabled = stored.ui_settings.linksEnabled;
      }
    } catch (e) {
      log('Error loading links setting:', e);
    }
  }

  function saveLinksSetting() {
    saveUiSetting('linksEnabled', linksEnabled)
  }

  // Vi mode setting
  async function loadViModeSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.viMode !== undefined) {
        viModeEnabled = stored.ui_settings.viMode;
      }
    } catch (e) {
      log('Error loading vi mode setting:', e);
    }
  }

  function saveViModeSetting() {
    saveUiSetting('viMode', viModeEnabled)
    // Sync to localStorage for vi-mode.js
    try {
      const ls = JSON.parse(localStorage.getItem('heatsync-extension-settings') || '{}')
      ls.viMode = viModeEnabled
      localStorage.setItem('heatsync-extension-settings', JSON.stringify(ls))
    } catch (_) {}
    // Notify vi-mode.js
    window.postMessage({ type: 'heatsync-settings-changed', settings: { viMode: viModeEnabled } }, location.origin)
  }

  // Platform badges setting
  async function loadPlatformBadgesSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
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
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.zebra !== undefined) {
        zebraEnabled = stored.ui_settings.zebra;
      }
    } catch {}
  }

  function saveZebraSetting() {
    saveUiSetting('zebra', zebraEnabled)
  }

  function toggleZebra() {
    zebraEnabled = !zebraEnabled;
    saveZebraSetting();
    // Re-render current tab to apply
    renderMessages(currentTab);
  }

  // Platform filters — per-tab toggle to mute Twitch/Kick/YT messages
  async function loadPlatformFilters() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.platformFilters) platformFilters = stored.ui_settings.platformFilters;
    } catch {}
  }

  function getPlatformFilter(tabId) {
    const f = platformFilters[tabId] || {};
    return { twitch: f.twitch !== false, kick: f.kick !== false, youtube: f.youtube !== false };
  }

  function togglePlatformFilter(tabId, plat) {
    const f = getPlatformFilter(tabId);
    f[plat] = !f[plat];
    platformFilters[tabId] = f;
    saveUiSetting('platformFilters', platformFilters);
  }

  function isPlatformFilterTab(tabId) {
    return tabId === 'live' || config.channels.some(c => (typeof c === 'string' ? c : c.id) === tabId);
  }

  function renderPlatformFilterButtons() {
    const group = document.getElementById('hs-mc-platfilter');
    if (!group) return;
    while (group.firstChild) group.removeChild(group.firstChild);
    const tab = currentTab;
    if (!isPlatformFilterTab(tab)) return; // empty container hides via :empty CSS

    // Determine which platforms apply to this tab
    let hasTwitch = true, hasKick = true, hasYt = true;
    if (tab !== 'live') {
      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tab);
      if (ch && typeof ch !== 'string') {
        hasTwitch = !!ch.twitch;
        hasKick = !!ch.kick;
        hasYt = !!ch.youtube;
      }
    }

    const filt = getPlatformFilter(tab);
    const meta = [
      { key: 'twitch', label: 'T', show: hasTwitch },
      { key: 'kick', label: 'K', show: hasKick },
      { key: 'youtube', label: 'YT', show: hasYt }
    ];

    for (const p of meta) {
      if (!p.show) continue;
      const btn = document.createElement('button');
      btn.className = 'hs-mc-pf-btn hs-mc-pf-' + p.key;
      btn.dataset.platform = p.key;
      btn.classList.toggle('off', !filt[p.key]);
      btn.textContent = p.label;
      btn.title = (filt[p.key] ? 'Hide ' : 'Show ') + p.key + ' messages';
      btn.addEventListener('click', () => {
        togglePlatformFilter(currentTab, p.key);
        const on = getPlatformFilter(currentTab)[p.key];
        btn.classList.toggle('off', !on);
        btn.title = (on ? 'Hide ' : 'Show ') + p.key + ' messages';
        renderMessages(currentTab);
      });
      group.appendChild(btn);
    }
  }


  // Auto-hide input setting
  async function loadAutoHideSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.autoHideEmpty !== undefined) {
        autoHideInput = stored.ui_settings.autoHideEmpty;
      }
      // Migrate: default changed to false — reset users who never explicitly toggled
      if (autoHideInput && !stored.ui_settings?._autoHideMigrated) {
        autoHideInput = false;
        saveUiSetting('autoHideEmpty', false)
        saveUiSetting('_autoHideMigrated', true)
      }
    } catch {}
  }

  function saveAutoHideSetting() {
    saveUiSetting('autoHideEmpty', autoHideInput)
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
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.timestamps !== undefined) {
        timestampsEnabled = stored.ui_settings.timestamps;
      }
      window._hsTimestampsEnabled = timestampsEnabled;
    } catch {}
  }

  function saveTimestampsSetting() {
    saveUiSetting('timestamps', timestampsEnabled)
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
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.showOfflineEvents !== undefined) {
        // migrate: old default was true, new default is false — clear stale stored value
        if (stored.ui_settings.showOfflineEvents === true && !stored.ui_settings._offlineDefaultMigrated) {
          saveUiSetting('showOfflineEvents', false)
          saveUiSetting('_offlineDefaultMigrated', true)
          showOfflineEvents = false
          return
        }
        showOfflineEvents = stored.ui_settings.showOfflineEvents;
      }
    } catch {}
  }

  function saveOfflineEventsSetting() {
    saveUiSetting('showOfflineEvents', showOfflineEvents)
  }

  function toggleOfflineEvents() {
    showOfflineEvents = !showOfflineEvents;
    saveOfflineEventsSetting();
  }

  // Avatars setting
  async function loadAvatarsSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.avatars !== undefined) {
        avatarsEnabled = stored.ui_settings.avatars;
      }
    } catch {}
  }

  function saveAvatarsSetting() {
    saveUiSetting('avatars', avatarsEnabled)
  }

  function toggleAvatars() {
    avatarsEnabled = !avatarsEnabled;
    saveAvatarsSetting();
    renderMessages(currentTab);
  }

  async function loadAutoClaimSetting() {
    try {
      const stored = await chrome.storage.local.get(['hs_auto_claim_points']);
      if (stored.hs_auto_claim_points !== undefined) {
        autoClaimPoints = stored.hs_auto_claim_points;
      }
    } catch {}
  }

  async function loadDimTimeoutsSetting() {
    try {
      const stored = await chrome.storage.local.get(['hs_dim_timeouts']);
      if (stored.hs_dim_timeouts !== undefined) {
        dimTimeouts = stored.hs_dim_timeouts;
      }
    } catch {}
  }

  function toggleDimTimeouts() {
    dimTimeouts = !dimTimeouts;
    chrome.storage.local.set({ hs_dim_timeouts: dimTimeouts });
  }

  async function loadReadableNamesSetting() {
    try {
      const stored = await chrome.storage.local.get(['hs_readable_names']);
      if (stored.hs_readable_names !== undefined) {
        readableNamesEnabled = stored.hs_readable_names;
      }
    } catch {}
  }

  function toggleReadableNames() {
    readableNamesEnabled = !readableNamesEnabled;
    chrome.storage.local.set({ hs_readable_names: readableNamesEnabled });
  }

  function toggleAutoClaim() {
    autoClaimPoints = !autoClaimPoints;
    chrome.storage.local.set({ hs_auto_claim_points: autoClaimPoints });
  }

  async function loadSmartCompletionSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.smartCompletion !== undefined) smartCompletion = !!stored.ui_settings.smartCompletion;
    } catch {}
  }
  function toggleSmartCompletion() {
    smartCompletion = !smartCompletion;
    saveUiSetting('smartCompletion', smartCompletion);
  }

  async function loadFirstChatterGlowSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.firstChatterGlow !== undefined) firstChatterGlow = !!stored.ui_settings.firstChatterGlow;
    } catch {}
  }
  function toggleFirstChatterGlow() {
    firstChatterGlow = !firstChatterGlow;
    saveUiSetting('firstChatterGlow', firstChatterGlow);
    renderMessages(currentTab);
  }

  async function loadKeywordHighlightsSetting() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (typeof stored.ui_settings?.keywordHighlights === 'string') keywordHighlights = stored.ui_settings.keywordHighlights;
    } catch {}
    rebuildKeywordRegex();
  }
  function saveKeywordHighlightsSetting() {
    saveUiSetting('keywordHighlights', keywordHighlights);
    rebuildKeywordRegex();
  }

  function renderSettingsTab() {
    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;

    // Tooltip descriptions for settings — all static strings, no user input
    const settingTips = {
      emoteSize: t('mc_settings_emote_size_desc'),
      wysiwyg: t('mc_settings_input_preview_desc'),
      links: t('mc_settings_clickable_links_desc'),
      vi: t('mc_settings_vi_mode_desc'),
      zebra: t('mc_settings_zebra_desc'),
      autohide: t('mc_settings_auto_hide_desc'),
      timestamps: t('mc_settings_timestamps_desc'),
      avatars: t('mc_settings_avatars_desc'),
    }
    // Static settings HTML — no user input, all tooltip values are hardcoded strings above
    msgsEl.innerHTML = `
      <div class="hs-mc-settings-panel">
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">${t('mc_settings_display')}</div>
          <div class="hs-mc-setting-row hs-mc-setting-row-split">
            <span class="hs-mc-setting-label" data-tip="${settingTips.emoteSize}">${t('mc_settings_emote_size')}</span>
            <div class="hs-mc-size-btns">
              <button class="hs-mc-size-btn ${emoteSize === 1 ? 'active' : ''}" data-size="1">1x</button>
              <button class="hs-mc-size-btn ${emoteSize === 2 ? 'active' : ''}" data-size="2">2x</button>
              <button class="hs-mc-size-btn ${emoteSize === 4 ? 'active' : ''}" data-size="4">4x</button>
            </div>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${wysiwygEnabled ? 'active' : ''}" data-setting="wysiwyg"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.wysiwyg}">${t('mc_settings_input_preview')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${linksEnabled ? 'active' : ''}" data-setting="links"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.links}">${t('mc_settings_clickable_links')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${viModeEnabled ? 'active' : ''}" data-setting="vi"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.vi}">${t('mc_settings_vi_mode')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${zebraEnabled ? 'active' : ''}" data-setting="zebra"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.zebra}">${t('mc_settings_zebra')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${autoHideInput ? 'active' : ''}" data-setting="autohide"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.autohide}">${t('mc_settings_auto_hide')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${timestampsEnabled ? 'active' : ''}" data-setting="timestamps"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.timestamps}">${t('mc_settings_timestamps')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${avatarsEnabled ? 'active' : ''}" data-setting="avatars"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${settingTips.avatars}">${t('mc_settings_avatars')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${smartCompletion ? 'active' : ''}" data-setting="smartcompletion"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${t('mc_settings_smart_completion_desc')}">${t('mc_settings_smart_completion')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${firstChatterGlow ? 'active' : ''}" data-setting="firstchatter"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${t('mc_settings_first_chatter_desc')}">${t('mc_settings_first_chatter')}</span>
          </div>
          <div class="hs-mc-setting-row hs-mc-setting-row-block">
            <span class="hs-mc-setting-label" data-tip="${t('mc_settings_keyword_highlights_desc')}">${t('mc_settings_keyword_highlights')}</span>
            <textarea class="hs-mc-setting-textarea" data-setting="keywordhighlights" placeholder="${t('mc_settings_keyword_highlights_placeholder')}" rows="3">${escapeHtml(keywordHighlights)}</textarea>
          </div>
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">${t('mc_settings_inline_notifs')}</div>
          ${Object.entries(INLINE_NOTIF_TYPES).map(([key, def]) => `
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${inlineNotifs[key] ? 'active' : ''}" data-setting="notif_${key}"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${escapeHtml(def.desc)}"><span style="color:${def.color}">${def.tag}</span> ${escapeHtml(def.label.replace(def.tag, '').trim())}</span>
          </div>`).join('')}
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">${t('mc_settings_twitch_events')}</div>
          ${Object.entries(HERMES_EVENT_TYPES).map(([key, def]) => `
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${hermesToggles[key] ? 'active' : ''}" data-setting="hermes_${key}"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${escapeHtml(def.desc)}"><span style="color:${def.color}">\u25C6</span> ${escapeHtml(def.label)}</span>
          </div>`).join('')}
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">${t('mc_settings_features')}</div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${autoClaimPoints ? 'active' : ''}" data-setting="autoclaim"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${t('mc_settings_auto_claim_desc')}">${t('mc_settings_auto_claim')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${dimTimeouts ? 'active' : ''}" data-setting="dimtimeouts"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="${t('mc_settings_dim_timeouts_desc')}">${t('mc_settings_dim_timeouts')}</span>
          </div>
          <div class="hs-mc-setting-row">
            <button class="hs-mc-toggle-pill ${readableNamesEnabled ? 'active' : ''}" data-setting="readablenames"><span class="hs-mc-toggle-knob"></span></button>
            <span class="hs-mc-setting-label" data-tip="brighten dim username colors so they're readable on the black bg">readable names</span>
          </div>
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">${t('mc_settings_muted_users')}</div>
          ${mutedUsers.size === 0
            ? `<div class="hs-mc-setting-row" style="color:#808080;font-size:11px">${t('mc_settings_no_muted')}</div>`
            : [...mutedUsers].sort().map(u => `
          <div class="hs-mc-setting-row hs-mc-setting-row-split">
            <span class="hs-mc-setting-label" style="font-size:11px">${escapeHtml(u)}</span>
            <button class="hs-mc-unmute-btn" data-username="${escapeHtml(u)}" style="background:none;border:1px solid #808080;color:#808080;font-size:11px;cursor:pointer;padding:1px 6px;line-height:1.4" title="${t('mc_settings_unmute')}">&#x2715;</button>
          </div>`).join('')
          }
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-setting-row" style="justify-content:flex-end">
            <button class="hs-mc-defaults-btn" style="background:#808080;border:2px outset #fff;padding:2px 10px;font-size:11px;font-weight:bold;cursor:pointer;font-family:'Liberation Mono',monospace;color:#000;box-shadow:1px 1px 0 #000">default</button>
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
          autoclaim: () => { toggleAutoClaim(); },
          dimtimeouts: () => { toggleDimTimeouts(); },
          readablenames: () => { toggleReadableNames(); },
          smartcompletion: () => { toggleSmartCompletion(); },
          firstchatter: () => { toggleFirstChatterGlow(); },
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
          // Sync to background (broadcasts to all tabs + server)
          safeSendMessage({ type: 'unmute_user', username });
          restoreMcUnmutedDom(username);
          renderMessages(currentTab);
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
        autoHideInput = false;
        timestampsEnabled = false;
        avatarsEnabled = false;
        platformBadgesEnabled = true;
        showOfflineEvents = false;
        autoClaimPoints = true;
        dimTimeouts = true;
        smartCompletion = true;
        firstChatterGlow = true;
        keywordHighlights = '';
        rebuildKeywordRegex();
        for (const [k, v] of Object.entries(INLINE_NOTIF_TYPES)) inlineNotifs[k] = v.defaultOn;
        for (const [k, v] of Object.entries(HERMES_EVENT_TYPES)) hermesToggles[k] = v.defaultOn;
        const settings = {
          wysiwygEnabled: false, linksEnabled: true, viMode: false,
          zebra: true, autoHideEmpty: false, timestamps: false,
          avatars: false, showPlatformBadges: true, showOfflineEvents: false,
          smartCompletion: true, firstChatterGlow: true, keywordHighlights: '',
          inlineNotifs: { ...inlineNotifs }, hermesEvents: { ...hermesToggles },
        };
        try {
          for (const [k, v] of Object.entries(settings)) saveUiSetting(k, v);
          chrome.storage.local.set({ hs_auto_claim_points: true });
        } catch {}
        renderSettingsTab();
        return;
      }
    };
    msgsEl.addEventListener('click', msgsEl._hsSettingsClick);

    // Keyword highlights textarea — debounced save on input
    if (!msgsEl._hsSettingsInput) {
      msgsEl._hsSettingsInput = true;
      let kwDebounce = null;
      msgsEl.addEventListener('input', (e) => {
        const ta = e.target.closest('textarea[data-setting="keywordhighlights"]');
        if (!ta) return;
        if (kwDebounce) cleanup.clearTimeout(kwDebounce);
        kwDebounce = cleanup.setTimeout(() => {
          keywordHighlights = ta.value;
          saveKeywordHighlightsSetting();
          renderMessages(currentTab);
        }, 400);
      });
    }

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
      }, { capture: true, signal: mcSignal });
      msgsEl.addEventListener('mouseleave', (e) => {
        const label = e.target.closest('.hs-mc-setting-label[data-tip]');
        if (label) { const t = document.getElementById('hs-settings-tip'); if (t) t.classList.remove('visible'); }
      }, { capture: true, signal: mcSignal });
    }
  }









  function updateTabBar() {
    if (!tabBarElement) return;

    // Clear existing channel tabs (keep built-in tabs)
    const existingChannelTabs = tabBarElement.querySelectorAll('.hs-mc-tab[data-tab]:not([data-tab="live"]):not([data-tab="feed"]):not([data-tab="mentions"]):not([data-tab="whispers"]):not([data-tab="discover"]):not([data-tab="pinned"]):not([data-tab="add"]):not([data-tab="rotate"]):not([data-tab="rotate-chat"]):not([data-tab="settings"])');
    existingChannelTabs.forEach(t => t.remove());

    // Add channel tabs before the + button in the scroll section
    const scrollSection = tabBarElement.querySelector('.hs-mc-tabs-scroll') || tabBarElement;
    const addBtn = scrollSection.querySelector('[data-tab="add"]');
    config.channels.forEach(ch => {
      const tab = document.createElement('button');
      tab.className = 'hs-mc-tab';
      const id = typeof ch === 'string' ? ch : ch.id;
      tab.dataset.tab = id;
      // Show best human-readable name. Order:
      //   1. ch.twitch / ch.kick if present
      //   2. resolved channelName from youtubeLinks (set by youtube_status)
      //   3. @handle parsed from the youtube URL
      //   4. ch.id when it looks like a real handle (i.e. user-named, not a
      //      generated `linked_<ts>` / `yt-<ts>` id)
      //   5. URL fallback (last resort — would have shown "watch?v=…" before)
      let label = id
      if (typeof ch !== 'string') {
        if (ch.twitch) label = ch.twitch
        else if (ch.kick) label = ch.kick
        else if (ch.youtube) {
          const linked = youtubeLinks.get(ch.id)
          const m = ch.youtube.match(/@([^/?]+)/)
          const looksAuto = !ch.id || /^(linked|yt|kick|twitch)[-_]\d+$/.test(ch.id)
          if (linked?.channelName) label = linked.channelName
          else if (m) label = m[1]
          else if (!looksAuto) label = ch.id
          else label = ch.youtube.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/\/.*$/, '')
        }
      }
      tab.textContent = label;
      // Restore live dot from cached liveChannelSet (survives tab recreate)
      if (liveChannelSet.size > 0) {
        const twitch = typeof ch === 'string' ? ch : ch.twitch || ch.id
        tab.dataset.live = String(liveChannelSet.has(twitch.toLowerCase()))
      }
      // YT-only tabs aren't in liveChannelSet (which is Twitch-only), so
      // re-derive live state from the resolved YouTube subscription. This
      // also wins the race when the youtube_status connected event arrived
      // before the tabbar was rendered.
      if (typeof ch !== 'string' && ch.youtube && !ch.twitch && !ch.kick) {
        const ytLink = youtubeLinks.get(ch.id)
        if (ytLink?.videoId) tab.dataset.live = 'true'
      }
      if (addBtn) addBtn.before(tab);
      else scrollSection.appendChild(tab);
    });

    // Update active state
    tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
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
         position:fixed on descendant elements (tab bar goes off-screen).
         Kill the transition too — without it Twitch's 500ms transform
         transition keeps interpolating to translateX(-340px) on every
         class flip, leaving the panel partially off-screen. */
      .channel-root__right-column--expanded {
        transform: none !important;
        transition: none !important;
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
        // Re-render after expand — container was display:none while collapsed
        const rightCol = document.querySelector('.right-column')
        if (rightCol && !rightCol.classList.contains('right-column--collapsed')) {
          ensureUIElements()
          renderMessages(currentTab)
        }
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
    // On Kick: insert as SIBLING of #channel-chatroom (not child!) to avoid
    // breaking Kick's React virtual scroll. React's reconciliation errors
    // corrupt native chat when our container is inside its managed tree.
    // On Twitch: insert into chat-shell (which has proper dimensions)
    // On YouTube: insert after the live chat frame in #chat-container or #secondary
    let parent
    if (hostPlatform === 'yt') {
      parent = chatRoom
      // Hide native YouTube chat iframe, replace with multichat
      const ytChatFrame = parent.querySelector('ytd-live-chat-frame#chat')
      if (ytChatFrame) {
        const frameHeight = ytChatFrame.offsetHeight || 500
        ytChatFrame.style.display = 'none'
        // Only set height inline — let CSS rules govern display/position/flex-direction
        // so .hs-tabs-left/right can flip flex-direction to row when needed.
        container.style.cssText = `height:${frameHeight}px;overflow:hidden;`
      }
      parent.appendChild(container)
      // If YouTube has its chat sidebar collapsed (#chat-container is 0-wide),
      // our panel inherits that and looks blank. Click "Show chat" to expand.
      // Also watch for the user toggling it off later and re-expand.
      const ensureYtChatExpanded = () => {
        if (parent.offsetWidth > 0) return
        const showBtn = document.querySelector('button[aria-label="Show chat"]')
        if (showBtn) showBtn.click()
      }
      ensureYtChatExpanded()
      const ytWidthObs = new MutationObserver(ensureYtChatExpanded)
      cleanup.trackObserver(ytWidthObs)
      ytWidthObs.observe(parent, { attributes: true, attributeFilter: ['style', 'class'] })
    } else if (isKick) {
      parent = chatRoom.parentElement
      chatRoom.after(container)
    } else {
      parent = document.querySelector('.chat-shell') || document.querySelector('[class*="chat-shell"]') || chatRoom.parentElement
      parent.appendChild(container)
    }
    log('Created #hs-mc-container in', parent.tagName + '.' + [...parent.classList].join('.'))
    return container
  }

  function ensureUIElements() {
    // Always watch for collapse/expand class changes so we can clean up
    // inline styles when the user clicks the expand arrow
    if (hostPlatform !== 'yt') startColumnClassWatcher();

    // Don't fight Twitch when chat is collapsed — let the native expand arrow work
    if (hostPlatform !== 'yt') {
      const rightCol = document.querySelector('.right-column')
      const collapsed = rightCol && rightCol.classList.contains('right-column--collapsed')
      if (collapsed) return
      // Make sure chat column is visible (only when expanded)
      ensureChatColumnVisible();
    }

    // Find the React-controlled chat room
    let chatRoom
    if (hostPlatform === 'yt') {
      chatRoom = document.querySelector('#chat-container') ||
                 document.querySelector('ytd-live-chat-frame#chat')?.parentElement ||
                 document.querySelector('#secondary')
    } else if (isKick) {
      chatRoom = document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]')
    } else {
      chatRoom = document.querySelector('[class*="chat-room__content"]') ||
                 document.querySelector('[data-a-target="chat-room-component"]') ||
                 document.querySelector('.chat-shell') ||
                 document.querySelector('[class*="stream-chat"]') ||
                 document.querySelector('.chat-room')
    }

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

    // Adjust overlay/inputbar/tabbar geometry based on actual tabbar+inputbar
    // dimensions — handles multi-row tabbar wrapping AND vertical tab columns.
    // Single source of truth so CSS hardcodes don't drift from real layout.
    _updateMcLayout = () => {
      if (!tabBarElement || !overlayElement) return
      const tabRect = tabBarElement.getBoundingClientRect()
      const tw = tabRect.width
      const th = tabRect.height
      const ih = inputBarElement ? inputBarElement.getBoundingClientRect().height : 0

      // Reset before re-applying to avoid stale rules between transitions
      for (const el of [overlayElement, inputBarElement, tabBarElement]) {
        if (!el) continue
        el.style.removeProperty('top')
        el.style.removeProperty('bottom')
        el.style.removeProperty('left')
        el.style.removeProperty('right')
      }

      if (tabPosition === 'top') {
        if (th > 0) overlayElement.style.top = th + 'px'
        overlayElement.style.bottom = ih + 'px'
      } else if (tabPosition === 'bottom') {
        overlayElement.style.top = '0px'
        overlayElement.style.bottom = (th + ih) + 'px'
        // Park tabbar directly above inputbar
        if (tabBarElement) tabBarElement.style.bottom = ih + 'px'
      } else if (tabPosition === 'right') {
        overlayElement.style.top = '0px'
        overlayElement.style.bottom = ih + 'px'
        if (tw > 0) {
          overlayElement.style.right = tw + 'px'
          if (inputBarElement) inputBarElement.style.right = tw + 'px'
        }
      } else if (tabPosition === 'left') {
        overlayElement.style.top = '0px'
        overlayElement.style.bottom = ih + 'px'
        if (tw > 0) {
          overlayElement.style.left = tw + 'px'
          if (inputBarElement) inputBarElement.style.left = tw + 'px'
        }
      }
    }

    if (tabBarElement && overlayElement && !resizeObserver) {
      resizeObserver = new ResizeObserver(_updateMcLayout)
      resizeObserver.observe(tabBarElement)
      if (inputBarElement) resizeObserver.observe(inputBarElement)
      cleanup.trackObserver(resizeObserver)
      _updateMcLayout()
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
    if (hostPlatform === 'yt') {
      setupYouTubeResizeHandle()
    } else if (isKick) {
      setupKickResizeHandle()
    } else {
      setupResizeHandle()
    }

    // Always ensure native chat is hidden when our UI is active
    setNativeChatHidden(true);
  }

  // ============================================
  // TAB/CHANNEL MANAGEMENT
  // ============================================

  function switchTab(id) {
    log('switchTab called:', id);
    editingChannel = false;
    // Tab switch closes profile card without re-rendering (we'll render the tab below)
    if (typeof activeProfileCard !== 'undefined' && activeProfileCard) activeProfileCard = null;

    // Clicking feed tab while in thread view → go back to feed, don't switch tabs
    if (id === 'feed' && currentTab === 'feed' && activeThread) {
      closeThread();
      return;
    }

    // Close thread view when leaving feed
    if (currentTab === 'feed' && id !== 'feed') {
      activeThread = null;
      const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
      if (feedTabBtn) feedTabBtn.textContent = t('mc_tab_feed');
    }
    currentTab = id;

    // Mark mentions as seen when switching to that tab
    if (id === 'mentions') {
      mentionsSeenCount = mentionsBuffer.length;
      updateTabBadges();
    }

    // Show/hide search bar on mentions tab
    const searchBar = document.getElementById('hs-mc-search-bar')
    if (searchBar) searchBar.classList.toggle('visible', id === 'mentions')

    // Discover/pinned refresh bars removed — auto-poll handles freshness

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
        saveUiSetting('activeTab', id)
        saveUiSetting('liveChannel', liveChannel)
      } catch (e) { /* context invalidated */ }
    }

    // Refresh platform filter buttons for the new tab
    renderPlatformFilterButtons();

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

    // Native chat always hidden — multichat handles all tabs including live on Kick

    // Hide input bar on add-channel form, or when auto-hide is on
    if (inputBarElement) {
      const pickerOpen = document.getElementById('hs-mc-emote-picker')?.classList.contains('visible');
      if (id === 'add' || id === 'settings' || id === 'discover' || id === 'pinned') {
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
      // Sync overlay bottom with input bar visibility — clear inline style when
      // input is back so the CSS bottom-padding-for-input-bar reapplies
      if (inputBarVisible) overlayElement.style.bottom = ''
      else overlayElement.style.bottom = '0'
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
      if (!showOfflineEvents && (m.eventClass || '').includes('event-offline')) return null
      const div = document.createElement('div')
      div.className = `hs-mc-stream-event ${m.eventClass || ''}`
      const tsVal = timestampsEnabled && m.time ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      // For redeems, the actor is the redeemer (m.actor). For other events the channel is the actor.
      const ch = m.actor || m.channel || ''
      const chLc = ch.toLowerCase()
      // Look up color: event data → color map → profile cache → IRC buffers → async fetch
      let userColor = m.color || ''
      if (!userColor) userColor = streamColorMap.get(chLc) || ''
      if (!userColor) {
        const cached = _profileCache.get(chLc)
        if (cached?.profile?.twitch_color) userColor = cached.profile.twitch_color
      }
      if (!userColor && chLc && irc?.channels) {
        for (const [, buf] of irc.channels) {
          const msgs = buf.getAll()
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].user?.toLowerCase() === chLc) {
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
      if (!userColor && chLc) {
        apiFetch(`/api/profile/${encodeURIComponent(chLc)}`).then(resp => {
          if (resp?.ok && resp.data?.profile) {
            const profile = resp.data.profile
            const color = profile.twitch_color
            if (color) {
              const el = div.querySelector('.hs-evt-user')
              if (el) el.style.color = sanitizeColor(color)
            }
            _profileCache.set(chLc, { profile, ts: Date.now() })
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
      // Canonical heat: formatHeat + ° suffix (≥10) + tier color/glow/breathe via heatSpanHtml
      const heatHtml = (m.heat || 0) > 0 ? ' ' + heatSpanHtml(m.heat) : ''
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
      if (m._renderedHtml == null) m._renderedHtml = processEmotes(escapeHtml(m.text), null)
      // All values already sanitized via escapeHtml/processEmotes — safe innerHTML (existing pattern)
      div.innerHTML = `${tsSpan}${label}${platBadge}${userName}: ${m._renderedHtml}`
      div.style.cursor = 'pointer'
      div.addEventListener('click', (e) => {
        if (e.target.closest('a, .hs-mc-emote')) return
        switchTab('whispers')
      })
      return div
    }

    // Guard against messages with no user (malformed IRC / system messages)
    if (!m.user) {
      if (m.text || m.systemMsg) {
        const div = document.createElement('div')
        div.className = 'hs-mc-msg hs-mc-system'
        div.textContent = m.systemMsg || m.text || ''
        return div
      }
      return null
    }

    const showChannel = tabId === 'mentions';
    const isSuperChat = m.platform === 'youtube' && (m.msgType === 'superchat' || m.msgType === 'supersticker')
    const isMembership = m.platform === 'youtube' && (m.msgType === 'membership' || m.msgType === 'giftpurchase' || m.msgType === 'giftredemption')
    const isKicksEvent = m.kicksEvent === true
    // Map noticeType / msgId to a semantic CSS modifier so each event class
    // (unban, ban, mod-add, mode-change, sub, raid, etc.) can have its own color/icon
    const noticeKind = (() => {
      if (m.type !== 'notice' && m.type !== 'usernotice') return ''
      const id = m.noticeType || m.msgId || ''
      if (!id) return ''
      // group related msg-ids into a single semantic class
      if (id === 'unban_success') return 'hs-mc-notice-unban'
      if (id === 'untimeout_success') return 'hs-mc-notice-untimeout'
      if (id === 'ban_success') return 'hs-mc-notice-ban'
      if (id === 'timeout_success') return 'hs-mc-notice-timeout'
      if (id === 'mod_success') return 'hs-mc-notice-mod-add'
      if (id === 'vip_success') return 'hs-mc-notice-vip-add'
      if (id === 'unmod_success') return 'hs-mc-notice-mod-remove'
      if (id === 'unvip_success') return 'hs-mc-notice-vip-remove'
      if (id === 'delete_message_success') return 'hs-mc-notice-delete'
      if (id === 'mode_change' || id === 'slow_on' || id === 'slow_off' ||
          id === 'subs_on' || id === 'subs_off' || id === 'emote_only_on' || id === 'emote_only_off' ||
          id === 'followers_on' || id === 'followers_on_zero' || id === 'followers_off' ||
          id === 'r9k_on' || id === 'r9k_off') return 'hs-mc-notice-mode'
      if (id === 'sub' || id === 'resub') return 'hs-mc-notice-sub'
      if (id === 'subgift' || id === 'anonsubgift' || id === 'submysterygift' ||
          id === 'giftpaidupgrade' || id === 'anongiftpaidupgrade') return 'hs-mc-notice-gift'
      if (id === 'raid' || id === 'unraid') return 'hs-mc-notice-raid'
      if (id === 'announcement') return 'hs-mc-notice-announce'
      if (id === 'bitsbadgetier') return 'hs-mc-notice-bits'
      if (id === 'viewermilestone') return 'hs-mc-notice-milestone'
      if (id === 'msg_banned' || id === 'msg_timedout' || id === 'no_permission' ||
          id.startsWith('bad_') || id.startsWith('usage_')) return 'hs-mc-notice-error'
      return ''
    })()
    const cls = tabId === 'mentions' ? 'hs-mc-msg mention' :
isKicksEvent ? 'hs-mc-msg hs-mc-system hs-mc-kicks' :
isMembership ? 'hs-mc-msg hs-mc-system' :
m.type === 'usernotice' || m.type === 'notice' ? `hs-mc-msg hs-mc-system ${noticeKind}`.trim() :
                m.isHighlighted ? 'hs-mc-msg hs-mc-highlighted' :
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
    // YT messages don't carry a Twitch ID — resolve via heatsync profile
    // lookup keyed by the YT @handle. If cached, hoist into m.userId so the
    // existing badge + cosmetics pipeline applies; if not, queue a lookup
    // and updateCosmeticsInPlace will repaint after backfill.
    if (!m.userId && m.platform === 'youtube' && m.user) {
      const ytKey = (m.user || '').toLowerCase().replace(/^@/, '')
      const cached = ytNameToTwitchId.get(ytKey)
      if (cached) m.userId = cached
      else if (cached === undefined) queueYtNameToTwitchId(m.user)
    }
    if (m.userId) {
      badges += renderThirdPartyBadges(m.userId)
      if (!mcUserCosmetics.has(m.userId)) queueMcCosmeticsLookup(m.userId)
    }
    const plat = m.platform === 'youtube' ? 'yt' : m.platform === 'kick' ? 'kick' : 'twitch'
    const platLabel = plat === 'yt' ? '[YT]' : plat === 'kick' ? '[K]' : '[T]'
    const platColors = { twitch: '#9146ff', kick: '#53fc18', yt: '#ff0000' }
    const platformBadge = (platformBadgesEnabled || plat !== hostPlatform) ? `<span class="hs-mc-platform-badge hs-mc-pb-${plat}" style="font-size:10px;margin-right:3px;font-weight:700;vertical-align:middle;color:${platColors[plat]}">${platLabel}</span>` : ''
    const safeScColor = sanitizeColor(m.scColor || '#ffd600')
    const scBadge = isSuperChat && m.amount ? `<span class="hs-mc-sc-badge" style="background:${safeScColor};color:#000;padding:0 4px;border-radius:0;font-size:10px;font-weight:700;margin-right:3px;">${escapeHtml(m.amount)}</span>` : ''
    const bitsBadge = m.bits ? `<span class="hs-mc-bits-badge" title="${m.bits} bits">${m.bits} bits</span>` : ''
    const paintStyle = m.userId ? getMcPaintStyle(m.userId) : ''
    // Build the channel link for the username. YouTube usernames arrive
    // prefixed with "@" so we strip it before concatenating to avoid
    // youtube.com/@/%40handle-style double-encoding.
    let userHref
    if (plat === 'kick') {
      userHref = `https://kick.com/${encodeURIComponent(m.user)}`
    } else if (plat === 'yt') {
      const ytHandle = (m.user || '').replace(/^@/, '')
      userHref = `https://youtube.com/@${encodeURIComponent(ytHandle)}`
    } else {
      userHref = `https://twitch.tv/${encodeURIComponent(m.user)}`
    }
    const userLink = `<a href="${userHref}" target="_blank" class="hs-mc-user" data-username="${escapeHtml(m.user.toLowerCase())}" data-platform="${plat}" style="${paintStyle || 'color:' + sanitizeColor(m.color || '#fff')}">${escapeHtml(m.user)}</a>`;
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
      } else if (!m.platform || m.platform === 'twitch') {
        // Only fetch from decapi for Twitch users (Kick/YouTube don't have decapi endpoints)
        avatarHtml = `<img class="hs-mc-avatar" data-user="${escapeHtml(userKey)}" src="" alt="" style="display:none" loading="lazy" decoding="async">`
        fetchAvatar(userKey)
      } else {
        // Kick/YouTube without a cached avatar — render a neutral initials
        // placeholder so the avatar column doesn't have an empty gap.
        const initial = (m.user || '?').charAt(0).toUpperCase()
        const palette = ['#5d3ad6','#1a8cff','#ff6b35','#10b981','#e11d48','#7c3aed','#f59e0b']
        const hue = palette[(userKey.charCodeAt(0) + (userKey.charCodeAt(1) || 0)) % palette.length]
        avatarHtml = `<span class="hs-mc-avatar hs-mc-avatar-fallback" style="background:${hue}">${escapeHtml(initial)}</span>`
      }
    }

    // Process text: heatsync/7TV/BTTV/FFZ emotes first, then YouTube native emoji
    // Cache rendered HTML on message object so re-renders preserve emote state at post time
    let processedText
    if (m._renderedHtml != null) {
      processedText = m._renderedHtml
    } else {
      // Pass Twitch native emotes (per-message IRC tags) into processEmotes so
      // they participate in the overlay-stack pipeline alongside 7TV emotes —
      // without this a 7TV zero-width emote following a Twitch sub emote would
      // render with whitespace between them instead of overlaying.
      let twitchExtra = null
      if (m.twitchEmotes) {
        twitchExtra = new Map()
        for (const [name, url] of Object.entries(m.twitchEmotes)) {
          twitchExtra.set(name, { url, source: 'twitch', state: 'global', zeroWidth: false })
        }
      }
      processedText = processEmotes(escapeHtml(m.text), m.channel, twitchExtra)
      if (m.emotes && m.emotes.length > 0) {
        processedText = processYtEmotes(processedText, m.emotes, true)
      }
      // Safety net: strip any remaining escaped HTML img tag fragments that leaked through
      // Matches &lt;img followed by escaped attributes, with or without closing &gt;
      if (processedText.includes('&lt;img')) {
        processedText = processedText.replace(/&lt;img\b[^<]*/g, '')
      }
      // Highlight @mentions and bare-name mentions for known chatters.
      // Run AFTER emote processing so emote names already replaced into <img> tags
      // (and thus inside HTML) won't be touched by the mention regex.
      processedText = highlightMentionsInHtml(processedText)
      m._renderedHtml = processedText
    }

    // Sticker for super stickers
    let stickerHtml = ''
    if (m.sticker && m.sticker.url) {
      stickerHtml = ` <img src="${escapeHtml(m.sticker.url)}" alt="${escapeHtml(m.sticker.alt || 'sticker')}" style="height:48px;vertical-align:middle;" />`
    }

    const div = document.createElement('div');
    div.className = cls;
    if (m.userId) div.dataset.uid = m.userId
    if (isSuperChat && m.scColor) {
      const safeBg = sanitizeColor(m.scColor)
      div.style.background = safeBg + '22'
      div.style.borderLeft = `3px solid ${safeBg}`
      div.style.paddingLeft = '4px'
    }
    // First-time chatter highlight (this session, per channel)
    if (firstChatterGlow && m.user && m.channel && !isMembership && !isKicksEvent && m.type !== 'usernotice' && m.type !== 'notice') {
      if (markChatterSeen(m.channel, m.user)) {
        div.classList.add('hs-first-msg')
      }
    }
    // Twitch first-msg flag — brand new user to the channel (not just this session)
    if (m.isFirstMsg) {
      div.classList.add('hs-mc-first-msg')
    }
    // Cleared by mod (timeout/ban/delete) — Twitch-native dim + strikethrough on offending content
    if (m.cleared) {
      div.classList.add('hs-mc-msg-cleared')
      if (m.clearedReason) div.title = m.clearedReason
    }
    // Keyword highlight — message text matches a user-defined term
    if (keywordHighlightsRegex && m.text && keywordHighlightsRegex.test(m.text)) {
      div.classList.add('hs-kw-match')
    }
    // Reply context bar (Chatterino-style) — all values escaped via escapeHtml
    const replyBar = m.replyTo ? `<div class="hs-mc-reply-ctx" title="${escapeHtml(m.replyTo.user)}: ${escapeHtml(m.replyTo.text || '')}">&#8618; Replying to <a href="https://heatsync.org/user/${encodeURIComponent(m.replyTo.user)}" target="_blank" class="hs-mc-user hs-mc-reply-user" data-username="${escapeHtml(m.replyTo.user.toLowerCase())}">@${escapeHtml(m.replyTo.user)}</a>${m.replyTo.text ? ': ' + escapeHtml(m.replyTo.text.length > 80 ? m.replyTo.text.slice(0, 80) + '...' : m.replyTo.text) : ''}</div>` : ''
    // Redeem label — look up reward title from Hermes cache
    let redeemLabel = ''
    if (m.redeemed && m.rewardId) {
      const reward = redeemTitleMap.get(m.rewardId)
      redeemLabel = reward
        ? `<span class="hs-mc-system-text hs-mc-redeem-label">\u25C6 ${escapeHtml(reward.title)} \u00B7 ${Number(reward.cost).toLocaleString()} pts</span>`
        : `<span class="hs-mc-system-text hs-mc-redeem-label">\u25C6 channel point redeem</span>`
    } else if (m.isHighlighted) {
      redeemLabel = `<span class="hs-mc-system-text hs-mc-highlight-label">\u2728 highlighted message</span>`
    }
    // USERNOTICE system line (all values go through escapeHtml — same pattern as existing innerHTML above)
    const systemLine = (m.systemMsg ? `<span class="hs-mc-system-text">${escapeHtml(m.systemMsg)}</span>` : '') + redeemLabel
    const ts = formatTimeFromTs(m.time);
    const showTs = timestampsEnabled || tabId === 'mentions';
    const tsHtml = ts && showTs ? `<span class="hs-mc-ts" data-ts="${m.time}">${ts}</span>` : '';
    const msgBody = (m.type === 'usernotice' || m.type === 'notice') && !m.text
      ? `${tsHtml}${systemLine}`
      : m.type === 'notice'
      ? `${tsHtml}${processedText}`
      : m.isAction
      ? `${tsHtml}${systemLine}${platformBadge}${scBadge}${bitsBadge}${badges}${avatarHtml}${userLink}${channelSpan} <span style="color:${sanitizeColor(m.color || '#fff')};font-style:italic">${processedText}</span>${stickerHtml}`
      : `${tsHtml}${systemLine}${platformBadge}${scBadge}${bitsBadge}${badges}${avatarHtml}${userLink}${channelSpan}: ${processedText}${stickerHtml}`
    div.innerHTML = `${replyBar}${msgBody}`;
    // Correct emote states based on current inventory + blocked (cached HTML may have stale states)
    for (const w of div.querySelectorAll('.hs-mc-emote-wrapper[data-source="heatsync"]')) {
      const name = w.dataset.emoteName;
      const newState = blockedEmoteNames.has(name) ? 'blocked'
        : inventoryEmotes.has(name) ? 'owned'
        : 'unadded';
      if (w.dataset.state !== newState) {
        w.classList.remove('hs-state-owned', 'hs-state-unadded', 'hs-state-blocked', 'hs-state-global', 'hs-state-channel');
        w.classList.add(`hs-state-${newState}`);
        w.dataset.state = newState;
      }
    }
    // Reply button for threading (Twitch/Kick — YT has no native thread id,
    // so we'd render an @-mention reply, but the YT message renderer reuses
    // videoId as id which collides across messages; suppress on YT for now).
    if (m.id && m.platform !== 'youtube') {
      div.dataset.msgId = m.id
      div.dataset.msgUser = m.user
      div.dataset.msgChannel = m.channel || ''
      div.dataset.msgPlatform = m.platform || ''
      const replyBtn = document.createElement('button')
      replyBtn.className = 'hs-mc-reply-btn'
      replyBtn.textContent = '↩'
      replyBtn.title = 'Reply'
      div.appendChild(replyBtn)
    }
    // Reply-thread linkage for hover highlight
    if (m.replyTo) {
      if (m.replyTo.id) div.dataset.replyId = m.replyTo.id
      if (m.replyTo.threadId) div.dataset.replyThreadId = m.replyTo.threadId
    }
    return div;
  }

  // Process YouTube emotes (inline emoji images from innertube)
  // preEscaped=true when input is already HTML-escaped (chained after processEmotes)
  function processYtEmotes(text, emotes, preEscaped) {
    if (!emotes || emotes.length === 0) return preEscaped ? text : escapeHtml(text)

    let result = preEscaped ? text : escapeHtml(text)

    // Build replacement map: escaped alt text → img HTML
    const replacements = new Map()
    const altPatterns = []
    for (const emote of emotes) {
      const url = typeof emote.url === 'string' ? emote.url.trim() : ''
      const alt = typeof emote.alt === 'string' ? emote.alt : ''
      if (!alt || !url || !(url.startsWith('http') || url.startsWith('//'))) continue
      // Don't skip names with `<` — escapeHtml() handles them correctly and emotes
      // like `<3`, `<3` need to render. (Alt is set via escaped attribute below.)
      const escaped = escapeHtml(alt)
      if (replacements.has(escaped)) continue
      const imgHtml = `<img src="${escapeHtml(url)}" alt="${escaped}" class="hs-mc-emote" style="height:1.2em;vertical-align:middle;" />`
      replacements.set(escaped, imgHtml)
      altPatterns.push(escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    }

    // Single-pass replacement that skips HTML tags — prevents matching inside
    // attributes of already-rendered emote/emoji spans from processEmotes
    if (altPatterns.length > 0) {
      const combined = new RegExp(`(<[^>]*>)|(${altPatterns.join('|')})`, 'g')
      result = result.replace(combined, (match, htmlTag) => {
        if (htmlTag) return htmlTag
        return replacements.get(match) || match
      })
    }

    // Clean up escaped HTML img tag fragments (from emotes with HTML alt text)
    if (result.includes('&lt;img')) {
      result = result.replace(/&lt;img\b(?:[^]*?(?:\/&gt;|&gt;)|[^<]*)/g, '')
    }
    return result
  }

  // Highlight @mentions and bare known usernames in rendered chat HTML.
  // Splits on tags so substitution only happens in text segments.
  // Applies 7TV paint cosmetics if the mentioned user's userId + paint are cached.
  function highlightMentionsInHtml(html) {
    if (!html || (!html.includes('@') && knownColors.size === 0)) return html
    const parts = html.split(/(<[^>]+>)/)
    for (let i = 0; i < parts.length; i += 2) {
      const seg = parts[i]
      if (!seg) continue
      parts[i] = seg.replace(
        /(^|[\s.,!?;:()\[\]"'])(@?)([A-Za-z0-9_]{3,25})(?=$|[\s.,!?;:()\[\]"'])/g,
        (m, lead, at, name) => {
          const lower = name.toLowerCase()
          const known = knownColors.has(lower)
          if (!at && !known) return m
          const color = sanitizeColor(knownColors.get(lower) || '#fff')
          const safeName = escapeHtml(name)
          const safeLower = escapeHtml(lower)
          const uid = knownUserIds.get(lower) || ''
          let style = `color:${color}`
          let uidAttr = ''
          if (uid) {
            uidAttr = ` data-uid="${escapeHtml(uid)}"`
            if (!mcUserCosmetics.has(uid)) queueMcCosmeticsLookup(uid)
            const paint = getMcPaintStyle(uid)
            if (paint) style = paint
          }
          return `${lead}<a href="https://heatsync.org/user/${encodeURIComponent(lower)}" target="_blank" class="hs-mc-user hs-mc-mention" data-username="${safeLower}"${uidAttr} style="${style}">${at}${safeName}</a>`
        }
      )
    }
    return parts.join('')
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
      cleanup.raf(() => { isProgrammaticScroll = false; });
    };

    const newBtn = document.getElementById('hs-mc-new-msgs');
    newMessageCount = 0;
    if (newBtn) newBtn.style.display = 'none';

    scrollToBottom();
    cleanup.raf(() => {
      scrollToBottom();
      cleanup.setTimeout(scrollToBottom, 50);
    });

    msgsEl.querySelectorAll('.hs-mc-emote').forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', scrollToBottom, { once: true });
      }
    });
  }

  // Incremental append for single messages on the active tab (hot path)
  // Returns true if handled, false if full rebuild needed
  // Check if a tab has multiple platform sources active (needs fair merge)
  let _multiPlatformRenderTimer = null
  function isMultiPlatformTab(tabId) {
    if (tabId === 'live') {
      const curCh = getLiveChannel()
      let count = 0
      if (curCh && irc?.getMessages(curCh)?.length) count++
      if (curCh && kickChat?.getMessages(curCh)?.length) count++
      if ((channelYtMessages.get('__live_yt_auto__')?.length) || 0) count++
      if (count < 2) {
        // Also check config-linked platforms
        const linked = config.channels.find(ch => typeof ch !== 'string' && (ch.twitch === curCh || ch.kick === curCh))
        if (linked?.kick && kickChat?.getMessages(linked.kick)?.length) count++
        if (linked?.youtube && channelYtMessages.get(linked.id)?.length) count++
      }
      return count > 1
    }
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId)
    if (!ch || typeof ch === 'string') return false
    let count = 0
    if (ch.twitch && irc?.getMessages(ch.twitch)?.length) count++
    if (ch.kick && kickChat?.getMessages(ch.kick)?.length) count++
    const ytMsgs = channelYtMessages.get(tabId)?.length || channelYtMessages.get('__live_yt_auto__')?.length || 0
    if (ytMsgs) count++
    return count > 1
  }

  function appendMessage(msg, tabId) {
    if (editingChannel) return false;
    // Skip live append while profile card is open — buffer keeps the msg, restored on close
    if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return true;
    if (isScrolledUp || currentTab !== tabId) return false;

    // Platform filter: skip messages for muted platforms (single-platform tab path)
    if (msg.platform && isPlatformFilterTab(tabId)) {
      const k = msg.platform === 'youtube' ? 'youtube' : msg.platform;
      if (getPlatformFilter(tabId)[k] === false) return true;
    }

    // Multi-platform tabs: skip appendMessage (trimChildren is platform-blind
    // and lets the fastest source push others out). Debounce to renderMessages
    // which has fair per-platform capping.
    if (isMultiPlatformTab(tabId)) {
      if (!_multiPlatformRenderTimer) {
        _multiPlatformRenderTimer = cleanup.raf(() => {
          _multiPlatformRenderTimer = null
          renderMessages(currentTab)
        })
      }
      return true // tell caller we handled it
    }

    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return false;

    // Remove "no messages" placeholder
    const empty = msgsEl.querySelector('.hs-mc-empty');
    if (empty) empty.remove();

    const div = buildMessageDiv(msg, tabId);
    if (!div) return false;
    // Tag with the same msgKey renderMessages uses, so a later tab switch into a
    // multi-platform view can prefix-match this DOM and avoid a one-shot rebuild.
    div.dataset.msgKey = `${_renderEpoch}:${msg.id || msg.base36_id || `${msg.user || ''}:${msg.time || ''}:${(msg.text || '').slice(0, 32)}`}`
    if (zebraEnabled && msg.type !== 'stream-event' && msg.type !== 'feed-post' && msg.type !== 'inline-dm') {
      if (!msgsEl._zebraCount) msgsEl._zebraCount = 0;
      msgsEl._zebraCount++;
      if (msgsEl._zebraCount % 2 === 0) div.classList.add('hs-mc-zebra');
    }
    msgsEl.appendChild(div);

    // Trim oldest messages beyond cap (500 with content-visibility virtualization)
    trimChildren(msgsEl, 500);

    // Apply mute to just this message — strip content for muted users
    // (use sender's link, not the reply-target link)
    const username = div.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')?.textContent?.trim()?.toLowerCase();
    if (username && mutedUsers.has(username)) {
      stripMcMutedMessage(div);
    }

    updateTabBadges();
    scrollMsgsToBottom(msgsEl);
    return true;
  }

  // Render epoch — bumps when external state invalidates already-rendered DOM
  // (emote data, settings that change visual output). Embedded in msgKey so the
  // diff-aware render in renderMessages forces a full rebuild after a bump
  // instead of treating identical content as already-rendered.
  let _renderEpoch = 0;

  // Full rebuild — used for tab switches, scroll resume, and initial load
  // Invalidate cached rendered HTML on all messages (when emote data changes)
  function clearRenderedHtmlCache() {
    const clearBuf = (msgs) => { for (const m of msgs) delete m._renderedHtml };
    if (irc?.channels) for (const [, buf] of irc.channels) clearBuf(buf.getAll());
    if (kickChat?.channels) for (const [, buf] of kickChat.channels) clearBuf(buf.getAll());
    clearBuf(mentionsBuffer);
    for (const msgs of channelYtMessages.values()) clearBuf(msgs);
    _renderEpoch++;
  }

  // Merge multiple platform sources into ~150 messages with proportional
  // interleaving. Each platform's messages maintain internal chronological
  // order, but platforms are woven together evenly so no single source
  // dominates any region of the output — even when their time ranges
  // don't overlap (e.g. IRC history from hours ago + YT from seconds ago).
  function fairMerge(sources) {
    log('fairMerge sources:', sources.map(s => s.length))
    const active = sources.filter(s => s.length > 0)
    if (active.length === 0) return []
    if (active.length === 1) return active[0]

    const limit = 500
    const perSource = Math.ceil(limit / active.length)
    // Take each platform's most recent messages (internally chronological)
    const slices = active.map(s => s.slice(-perSource))
    const total = slices.reduce((n, s) => n + s.length, 0)

    // Proportional interleave: distribute each source evenly across output
    // using Bresenham-style stepping so platforms are sprinkled throughout
    const result = new Array(total)
    const positions = slices.map(() => [])

    // Assign output positions to each source proportionally
    for (let si = 0; si < slices.length; si++) {
      const count = slices[si].length
      if (count === 0) continue
      const step = total / count
      for (let i = 0; i < count; i++) {
        positions[si].push(Math.floor(i * step + si * step / slices.length))
      }
    }

    // Fill result array — resolve collisions by finding next free slot
    const used = new Uint8Array(total)
    for (let si = 0; si < slices.length; si++) {
      for (let i = 0; i < slices[si].length; i++) {
        let pos = positions[si][i]
        while (pos < total && used[pos]) pos++
        if (pos >= total) { pos = 0; while (used[pos]) pos++ }
        result[pos] = slices[si][i]
        used[pos] = 1
      }
    }

    const merged = result.filter(Boolean).slice(-limit)

    // Tail-sort: the proportional stepping anchors each source at fixed end
    // positions (e.g. with 2 sources of 250 each, the last Kick msg always
    // lands at slot 499 and the last Twitch at 498), so new live messages
    // appear *above* a stuck older message instead of at the bottom. Sort
    // the most recent ~50 by time so newest always lands last regardless
    // of platform, while keeping fairMerge's interleave for the older bulk
    // (which handles non-overlapping time ranges).
    const tailSize = Math.min(50, merged.length)
    if (tailSize > 1) {
      const tail = merged.slice(-tailSize)
      tail.sort((a, b) => (a.time || 0) - (b.time || 0))
      for (let i = 0; i < tailSize; i++) merged[merged.length - tailSize + i] = tail[i]
    }
    return merged
  }

  // ─── Multistream auto-detect banner ─────────────────────────────────────
  // Tier 1: rely on heatsync server's resolveIdentity. If a streamer is live
  // on >=2 platforms and the user hasn't already linked them in config.channels,
  // surface a one-click "link channels" suggestion. Right-click dismisses
  // permanently for that channel pair.
  let _multistreamDismissed = null
  let _multistreamLastChecked = ''
  let _multistreamLastResult = '' // 'shown' | 'hidden' — sticky per channel/key
  async function loadMultistreamDismissed() {
    if (_multistreamDismissed) return _multistreamDismissed
    try {
      const data = await chrome.storage.local.get('hs_multistream_dismissed')
      _multistreamDismissed = new Set(data.hs_multistream_dismissed || [])
    } catch { _multistreamDismissed = new Set() }
    return _multistreamDismissed
  }
  function persistMultistreamDismissed() {
    try {
      chrome.storage.local.set({ hs_multistream_dismissed: [..._multistreamDismissed] })
    } catch {}
  }
  function hideMultistreamBanner() {
    const el = document.getElementById('hs-mc-multistream-banner')
    if (el) { el.hidden = true; el.replaceChildren() }
  }
  async function maybeShowMultistreamBanner(channelName, platform) {
    const el = document.getElementById('hs-mc-multistream-banner')
    if (!el) return
    if (!channelName) { hideMultistreamBanner(); return }
    const key = `${platform || 'auto'}:${channelName.toLowerCase()}`
    // Avoid redundant API calls when the user re-enters the same channel tab
    // — track last result per key so a 'hidden' decision sticks until channel changes.
    if (_multistreamLastChecked === key) {
      if (_multistreamLastResult === 'shown' && !el.hidden) return
      if (_multistreamLastResult === 'hidden') return
    }
    _multistreamLastChecked = key
    const dismissed = await loadMultistreamDismissed()
    if (dismissed.has(key)) { _multistreamLastResult = 'hidden'; hideMultistreamBanner(); return }
    if (typeof resolveIdentity !== 'function') { _multistreamLastResult = 'hidden'; hideMultistreamBanner(); return }
    const res = await resolveIdentity(channelName, platform ? { platform } : {})
    if (!res?.ok || !res.identity) { _multistreamLastResult = 'hidden'; hideMultistreamBanner(); return }
    const id = res.identity
    const liveOn = res.liveOn || []
    if (liveOn.length < 2) { _multistreamLastResult = 'hidden'; hideMultistreamBanner(); return }
    // Already linked in config? Skip.
    const lower = channelName.toLowerCase()
    const alreadyLinked = config.channels.some(ch => {
      if (typeof ch === 'string') return false
      const t = ch.twitch?.toLowerCase()
      const k = ch.kick?.toLowerCase()
      const matchesThis = (t === lower || k === lower ||
        (id.twitch && t === id.twitch.toLowerCase()) ||
        (id.kick && k === id.kick.toLowerCase()))
      if (!matchesThis) return false
      // Linked = at least 2 of {twitch,kick,youtube} populated
      let count = 0
      if (ch.twitch) count++
      if (ch.kick) count++
      if (ch.youtube) count++
      return count >= 2
    })
    if (alreadyLinked) { _multistreamLastResult = 'hidden'; hideMultistreamBanner(); return }
    // Build banner
    const platLabel = (p) => p === 'twitch' ? 'Twitch' : p === 'kick' ? 'Kick' : p === 'youtube' ? 'YouTube' : p
    const otherPlatforms = liveOn.filter(p => p !== platform)
    const display = res.profile?.display_name || channelName
    _multistreamLastResult = 'shown'
    el.replaceChildren()
    el.hidden = false
    const text = document.createElement('span')
    text.className = 'hs-mc-multi-text'
    text.textContent = `${display} is also live on ${otherPlatforms.map(platLabel).join(' + ')}`
    const linkBtn = document.createElement('button')
    linkBtn.className = 'hs-mc-multi-link'
    linkBtn.textContent = 'link channels'
    linkBtn.addEventListener('click', (e) => {
      e.preventDefault()
      const entry = { id: `linked_${Date.now()}` }
      if (id.twitch) entry.twitch = id.twitch
      if (id.kick) entry.kick = id.kick
      if (id.youtube) entry.youtube = id.youtube
      config.channels.push(entry)
      saveConfig()
      try { updateTabBar() } catch {}
      hideMultistreamBanner()
    })
    const dismissBtn = document.createElement('button')
    dismissBtn.className = 'hs-mc-multi-dismiss'
    dismissBtn.textContent = '×'
    dismissBtn.title = 'dismiss (right-click also works)'
    const dismissNow = () => {
      _multistreamDismissed.add(key)
      persistMultistreamDismissed()
      hideMultistreamBanner()
    }
    dismissBtn.addEventListener('click', dismissNow)
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); dismissNow() }, { once: true })
    el.append(text, linkBtn, dismissBtn)
  }

  function renderMessages(id) {
    if (editingChannel) return;
    // Profile card overrides normal tab content while open
    if (typeof activeProfileCard !== 'undefined' && activeProfileCard) {
      renderProfileCardView();
      return;
    }
    // Social tabs have their own renderers — banner doesn't apply there
    if (id === 'feed') { hideMultistreamBanner(); renderFeed(); return; }
    if (id === 'whispers') { hideMultistreamBanner(); renderWhispersTab(); return; }
    if (id === 'discover') { hideMultistreamBanner(); renderDiscoverTab(); return; }
    if (id === 'pinned') { hideMultistreamBanner(); renderPinnedTab(); return; }
    if (id === 'settings') { hideMultistreamBanner(); renderSettingsTab(); return; }
    if (id === 'mentions') { hideMultistreamBanner(); }
    // Banner: streamer-tab only (live or per-channel)
    if (id === 'live') {
      const liveCh = getLiveChannel()
      maybeShowMultistreamBanner(liveCh, hostPlatform)
    } else if (id && id !== 'add' && !['mentions','feed','whispers','discover','pinned','settings'].includes(id)) {
      // Per-channel tab — id may be a username or a linked-tab id; resolve from config
      const ch = config.channels.find(c => typeof c !== 'string' && c.id === id)
      // YT-only channels: extract handle from the youtube URL so the banner can
      // resolve identity ("foo is also live on Twitch + Kick") for them too.
      let ytHandle = null
      if (ch?.youtube && !ch.twitch && !ch.kick) {
        const m = ch.youtube.match(/@([^/?]+)/)
        if (m) ytHandle = m[1]
      }
      const channelName = (ch && (ch.twitch || ch.kick)) || ytHandle || id
      const platHint = ch?.twitch ? 'twitch' : ch?.kick ? 'kick' : ytHandle ? 'youtube' : null
      maybeShowMultistreamBanner(channelName, platHint)
    }

    // If search is active on mentions tab, don't clobber search results
    if (id === 'mentions') {
      const searchInput = document.getElementById('hs-mc-search-input')
      if (searchInput && searchInput.value.trim()) return
    }

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
      hideMultistreamBanner();
      renderAddChannelForm(msgsEl);
      return;
    } else if (id === 'live') {
      const curCh = getLiveChannel();
      const platNames = getLivePlatformNames()
      // Use platform-specific names (may differ from curCh if overridden)
      const twitchCh = platNames.twitch || curCh
      const kickCh = platNames.kick || curCh
      // Ensure channels are joined + history loaded
      if (twitchCh && irc && !irc.channels.has(twitchCh.toLowerCase())) irc.join(twitchCh)
      if (kickCh && kickChat && !kickChat.channels.has(kickCh.toLowerCase())) kickChat.join(kickCh)
      const ircMsgs = twitchCh ? (irc?.getMessages(twitchCh) || []) : []
      let kickMsgs = kickCh ? (kickChat?.getMessages(kickCh) || []) : []
      if (!kickMsgs.length && curCh) {
        // Check if any config entry links current channel to a Kick channel
        const linked = config.channels.find(ch => typeof ch !== 'string' && ch.twitch === curCh && ch.kick);
        if (linked) kickMsgs = kickChat?.getMessages(linked.kick) || [];
      }
      // On Kick, also pull messages from the URL channel (may differ from live override)
      if (!kickMsgs.length && hostPlatform === 'kick') {
        const urlCh = getCurrentChannel();
        if (urlCh && urlCh !== curCh) kickMsgs = kickChat?.getMessages(urlCh) || [];
      }
      // YouTube messages for live tab: auto-discovered or linked via config
      let ytMsgs = channelYtMessages.get('__live_yt_auto__') || [];
      if (!ytMsgs.length && curCh) {
        const linkedYt = config.channels.find(ch => typeof ch !== 'string' && (ch.twitch === curCh || ch.kick === curCh) && ch.youtube);
        if (linkedYt) ytMsgs = channelYtMessages.get(linkedYt.id) || [];
      }
      const filt = getPlatformFilter('live')
      msgs = fairMerge([
        filt.twitch ? ircMsgs : [],
        filt.kick ? kickMsgs : [],
        filt.youtube ? ytMsgs : []
      ])
    } else {
      // Channel tab — merge IRC + Kick + per-channel YouTube messages
      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === id);
      const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
      const kickName = typeof ch === 'string' ? null : ch?.kick;
      const ircMsgs = twitchName ? (irc?.getMessages(twitchName) || []) : [];
      const kickMsgs = kickName ? (kickChat?.getMessages(kickName) || []) : [];
      let ytMsgs = channelYtMessages.get(id) || [];
      // Also include auto-discovered YouTube messages if this channel matches live
      const autoYt = channelYtMessages.get('__live_yt_auto__') || []
      if (autoYt.length > 0 && isLiveChannelMessage({ channel: twitchName || kickName || id })) {
        if (ytMsgs.length > 0) {
          // Merge + dedup by user+text+time
          const seen = new Set(ytMsgs.map(m => `${m.user}:${m.text?.slice(0, 50)}:${m.time}`))
          const extra = autoYt.filter(m => !seen.has(`${m.user}:${m.text?.slice(0, 50)}:${m.time}`))
          if (extra.length > 0) ytMsgs = [...ytMsgs, ...extra]
        } else {
          ytMsgs = autoYt
        }
      }
      const filt = getPlatformFilter(id)
      msgs = fairMerge([
        filt.twitch ? ircMsgs : [],
        filt.kick ? kickMsgs : [],
        filt.youtube ? ytMsgs : []
      ])
    }

    // Merge follow stream events into every tab (went live, switched game, went offline)
    // Channel-specific events (redeems, raids, hype trains) stay in their own channel buffer
    // NOTE: append-only — do NOT re-sort, as msgs may be proportionally interleaved
    if (activityEvents.length > 0 && msgs.length > 0) {
      const existingTexts = new Set(msgs.filter(m => m.type === 'stream-event').map(m => m.text))
      const missing = activityEvents.filter(e =>
        e.eventClass?.includes('event-follow') && !existingTexts.has(e.text)
      )
      if (missing.length > 0) {
        // Insert stream events at their approximate chronological position
        // without re-sorting the entire array
        for (const evt of missing) {
          let inserted = false
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].time && msgs[i].time <= evt.time) {
              msgs.splice(i + 1, 0, evt)
              inserted = true
              break
            }
          }
          if (!inserted) msgs.unshift(evt)
        }
      }
    }

    updateTabBadges()

    if (msgs.length === 0) {
      msgsEl.textContent = ''
      const empty = document.createElement('div')
      empty.className = 'hs-mc-empty'
      empty.textContent = t('mc_no_messages')
      msgsEl.appendChild(empty)
      return
    }

    const toRender = msgs.slice(-500)
    isProgrammaticScroll = true;

    // Diff-aware render: keep DOM that already matches a prefix of `toRender` and
    // only build/append the truly-new tail. Multi-platform tabs hit this function
    // every rAF on busy streams (see appendMessage:isMultiPlatformTab branch) —
    // wipe-and-rebuild every frame is what made the whole chat panel flicker.
    const msgKey = (m) =>
      `${_renderEpoch}:${m.id || m.base36_id || `${m.user || ''}:${m.time || ''}:${(m.text || '').slice(0, 32)}`}`
    const desiredKeys = toRender.map(msgKey)

    // Detach yt-status notices (appended by social.js) before reconciling so the
    // diff doesn't treat them as "stale tail" and the next youtube_status event
    // doesn't re-add a fresh copy — that round-trip was the visible flicker.
    // Notices tagged for a different tab are dropped (don't follow user across
    // tabs — otherwise switching from a YT-offline channel to a live one keeps
    // the misleading "stream is not currently live" line). Other non-message
    // children (stale "no messages yet" placeholders, etc.) are dropped: once
    // `toRender` has content, those are leftover state.
    const detachedExtras = []
    for (let i = msgsEl.children.length - 1; i >= 0; i--) {
      const c = msgsEl.children[i]
      if (c.dataset?.msgKey) continue
      if (c.dataset?.hsYtStatus && c.dataset?.hsYtStatusTab === String(id)) {
        detachedExtras.unshift(c)
      }
      c.remove()
    }

    let prefixLen = 0
    while (
      prefixLen < msgsEl.children.length &&
      prefixLen < desiredKeys.length &&
      (msgsEl.children[prefixLen].dataset.msgKey || '') === desiredKeys[prefixLen]
    ) {
      prefixLen++
    }

    // DOM already matches desired exactly — re-attach extras and sync side-state.
    if (prefixLen === msgsEl.children.length && prefixLen === desiredKeys.length) {
      for (const ex of detachedExtras) msgsEl.appendChild(ex)
      applyMcMutes();
      cleanup.raf(() => { isProgrammaticScroll = false; });
      if (!isScrolledUp) scrollMsgsToBottom(msgsEl);
      return
    }

    // Capture expanded emote stacks ONLY in the tail we're about to remove —
    // the surviving prefix keeps its expansion state automatically.
    const expandedStacks = []
    for (let i = prefixLen; i < msgsEl.children.length; i++) {
      const msg = msgsEl.children[i]
      const mid = msg.dataset && msg.dataset.msgId
      if (!mid) continue
      const allStacks = [...msg.querySelectorAll('.hs-mc-emote-stack')]
      for (let s = 0; s < allStacks.length; s++) {
        if (allStacks[s].classList.contains('expanded')) expandedStacks.push([mid, s])
      }
    }

    // Drop the stale tail
    while (msgsEl.children.length > prefixLen) {
      msgsEl.lastElementChild.remove()
    }

    // Recompute zebra count from surviving prefix so striping stays consistent
    msgsEl._zebraCount = 0;
    for (let i = 0; i < prefixLen; i++) {
      if (msgsEl.children[i].classList.contains('hs-mc-zebra')) msgsEl._zebraCount = i + 1
    }

    // Build & append only the new tail
    const frag = document.createDocumentFragment();
    for (let i = prefixLen; i < toRender.length; i++) {
      const m = toRender[i]
      const div = buildMessageDiv(m, id);
      if (!div) continue;
      div.dataset.msgKey = desiredKeys[i]
      if (zebraEnabled && m.type !== 'stream-event' && m.type !== 'feed-post') {
        msgsEl._zebraCount++;
        if (msgsEl._zebraCount % 2 === 0) div.classList.add('hs-mc-zebra');
      }
      frag.appendChild(div);
    }
    msgsEl.appendChild(frag);

    // Re-attach the detached extras at the bottom so notices (yt-status etc.)
    // stay below the message list across renders without being churned.
    for (const ex of detachedExtras) msgsEl.appendChild(ex)

    for (const [mid, idx] of expandedStacks) {
      const msg = msgsEl.querySelector(`.hs-mc-msg[data-msg-id="${CSS.escape(mid)}"]`)
      if (!msg) continue
      const stacks = msg.querySelectorAll('.hs-mc-emote-stack')
      if (stacks[idx]) stacks[idx].classList.add('expanded')
    }

    applyMcMutes();

    cleanup.raf(() => { isProgrammaticScroll = false; });

    if (!isScrolledUp) {
      scrollMsgsToBottom(msgsEl);
    }
  }

  function sanitizeColor(color) {
    if (!COLOR_RE.test(color)) return '#ffffff'
    return readableNamesEnabled ? boostReadability(color) : color
  }





  function renderAddChannelForm(msgsEl) {
    msgsEl.textContent = ''
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#a8a8a8;font-size:13px;padding:20px;box-sizing:border-box;'

    const title = document.createElement('div')
    title.textContent = t('mc_add_channel')
    title.style.cssText = 'font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.5px;'
    wrapper.appendChild(title)

    const desc = document.createElement('div')
    desc.textContent = t('mc_enter_platform')
    desc.style.cssText = 'font-size:13px;color:#808080;margin-bottom:2px;'
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
      // Stop YouTube/Kick keyboard shortcuts from stealing keystrokes
      input.addEventListener('keydown', (e) => e.stopPropagation())
      row.appendChild(lbl)
      row.appendChild(input)
      return { row, input }
    }

    const twitch = makeRow('twitch', t('mc_username_placeholder'))
    const kick = makeRow('kick', t('mc_username_placeholder'))
    const yt = makeRow('youtube', t('mc_username_url_placeholder'))

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
        : 'background:transparent;color:#808080;border:1px solid #808080;'
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;'
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ffffff'; btn.style.color = '#000000'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent'
        btn.style.color = primary ? '#ffffff' : '#808080'
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
        showErr(t('mc_enter_platform'))
        return
      }

      const id = twitchVal || kickVal || ('yt-' + Date.now())
      const reserved = ['live', 'feed', 'mentions', 'whispers', 'discover', 'pinned', 'add', 'rotate', 'settings']
      if (reserved.includes(id)) {
        showErr(t('mc_reserved_name'))
        return
      }
      if (config.channels.some(c => (typeof c === 'string' ? c : c.id) === id)) {
        showErr(t('mc_channel_exists'))
        return
      }
      // Check duplicate Twitch/Kick username across channels
      if (twitchVal && config.channels.some(c => (typeof c === 'string' ? c : c.twitch) === twitchVal)) {
        showErr(t('mc_twitch_exists'))
        return
      }
      if (kickVal && config.channels.some(c => typeof c !== 'string' && c.kick === kickVal)) {
        showErr(t('mc_kick_exists'))
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
      // Track user edits per-field so autofill never overwrites typed input
      inp.addEventListener('input', () => { inp.dataset.userEdited = '1' })
    })

    // Heatsync linkage status indicator (between rows and error)
    const linkStatus = document.createElement('div')
    linkStatus.style.cssText = 'font-size:11px;color:#808080;min-height:14px;font-family:ui-monospace,monospace;'
    wrapper.insertBefore(linkStatus, errEl)

    // Debounced autofill — when user types in any field, look up that name on
    // heatsync and prefill the OTHER fields if they haven't been edited.
    let _autofillGen = 0
    let _autofillTimer = null
    const _autofillCancelable = (handler) => {
      if (_autofillTimer) cleanup.clearTimeout(_autofillTimer)
      _autofillTimer = cleanup.setTimeout(handler, 500)
    }

    async function autofillFromName(name, sourcePlatform) {
      if (!name) { linkStatus.textContent = ''; return }
      const gen = ++_autofillGen
      linkStatus.textContent = 'checking heatsync…'
      linkStatus.style.color = '#808080'
      const res = (typeof resolveIdentity === 'function')
        ? await resolveIdentity(name, { platform: sourcePlatform })
        : { ok: false }
      if (gen !== _autofillGen) return
      if (!res?.ok) {
        linkStatus.textContent = res?.notFound ? 'no heatsync profile — fill manually' : 'couldn\'t reach heatsync'
        linkStatus.style.color = '#666'
        return
      }
      const id = res.identity
      const platforms = []
      // Fill ONLY empty + non-user-edited fields
      const fillIfBlank = (input, value, label) => {
        if (!value) return
        if (input.dataset.userEdited === '1' && input.value.trim()) return
        if (input.value.trim()) return
        input.value = value
        platforms.push(label)
      }
      fillIfBlank(twitch.input, id.twitch, 't')
      fillIfBlank(kick.input, id.kick, 'k')
      fillIfBlank(yt.input, id.youtube, 'yt')
      const linkedLabels = []
      if (id.twitch) linkedLabels.push('t')
      if (id.kick) linkedLabels.push('k')
      if (id.youtube) linkedLabels.push('yt')
      const liveLabels = res.liveOn?.length ? ` · live on ${res.liveOn.map(p => p === 'twitch' ? 't' : p === 'kick' ? 'k' : p).join(',')}` : ''
      linkStatus.style.color = '#53fc18'
      linkStatus.textContent = `✓ matched ${id.heatsync || name} on heatsync — linked: ${linkedLabels.join(',') || 'none'}${liveLabels}${platforms.length ? ` · autofilled: ${platforms.join(',')}` : ''}`
    }

    twitch.input.addEventListener('input', () => {
      const v = twitch.input.value.trim().replace(/^@/, '')
      if (v.length >= 2) _autofillCancelable(() => autofillFromName(v, 'twitch'))
    })
    kick.input.addEventListener('input', () => {
      const v = kick.input.value.trim().replace(/^@/, '')
      if (v.length >= 2) _autofillCancelable(() => autofillFromName(v, 'kick'))
    })

    // Auto-focus twitch input
    cleanup.raf(() => twitch.input.focus())
  }

  function removeChannel(tabId) {
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
    config.channels = config.channels.filter(c => (typeof c === 'string' ? c : c.id) !== tabId);
    saveConfig();

    const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
    if (twitchName) irc?.part(twitchName);

    const kickName = typeof ch === 'string' ? null : ch?.kick;
    if (kickName) kickChat?.part(kickName);

    // Clean up per-channel sub tenure data to prevent stale map growth
    if (twitchName) subTenureMap.delete(twitchName.toLowerCase());
    if (kickName) subTenureMap.delete(kickName.toLowerCase());

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

    // Drop per-tab platform filter state so it can't leak across channel adds/removes
    if (platformFilters && platformFilters[tabId]) {
      delete platformFilters[tabId];
      saveUiSetting('platformFilters', platformFilters);
    }

    updateTabBar();
    if (currentTab === tabId) switchTab('live');
  }

  // Get platform overrides for the current live channel (or defaults from URL)
  function getLivePlatformNames() {
    const urlCh = getCurrentChannel()?.toLowerCase()
    if (!urlCh) return { twitch: '', kick: '', youtube: '' }
    const overrides = livePlatformMap[urlCh]
    return {
      twitch: overrides?.twitch ?? urlCh,
      kick: overrides?.kick ?? urlCh,
      youtube: overrides?.youtube ?? `https://youtube.com/@${urlCh}/live`
    }
  }

  function saveLivePlatformMap() {
    chrome.storage.local.set({ hs_live_platform_map: livePlatformMap })
  }

  async function loadLivePlatformMap() {
    try {
      const data = await chrome.storage.local.get('hs_live_platform_map')
      if (data.hs_live_platform_map) livePlatformMap = data.hs_live_platform_map
    } catch {}
  }

  // Apply live platform overrides — join the correct channels on each platform
  function applyLivePlatformOverrides() {
    const names = getLivePlatformNames()
    if (names.twitch) irc?.join(names.twitch)
    if (names.kick) kickChat?.join(names.kick)
    if (names.youtube) {
      chrome.runtime.sendMessage({
        type: 'youtube_ws_subscribe', url: names.youtube, channelId: '__live_yt_auto__'
      }).catch(() => {})
    }
    renderMessages(currentTab)
  }

  function showEditLivePlatforms() {
    const urlCh = getCurrentChannel()?.toLowerCase()
    if (!urlCh) return
    editingChannel = true
    const names = getLivePlatformNames()

    const msgsEl = document.getElementById('hs-mc-messages')
    if (!msgsEl) return
    msgsEl.textContent = ''

    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#a8a8a8;font-size:13px;padding:20px;box-sizing:border-box;'

    const title = document.createElement('div')
    title.textContent = `edit live — ${urlCh}`
    title.style.cssText = 'font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.5px;'
    wrapper.appendChild(title)

    const makeRow = (label, placeholder, value) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;max-width:300px;'
      const lbl = document.createElement('span')
      lbl.textContent = label
      lbl.style.cssText = 'font-size:13px;font-weight:600;min-width:56px;color:#949494;text-transform:lowercase;'
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = placeholder
      input.value = value || ''
      input.style.cssText = 'flex:1;background:#ffffff;color:#000000;border:1px solid #808080;padding:6px 10px;border-radius:0;font-size:14px;outline:none;font-family:inherit;'
      input.addEventListener('keydown', (e) => e.stopPropagation())
      row.appendChild(lbl)
      row.appendChild(input)
      return { row, input }
    }

    const twitch = makeRow('twitch', 'username', names.twitch)
    const kick = makeRow('kick', 'username', names.kick)
    const yt = makeRow('youtube', 'url or @handle', names.youtube)
    wrapper.appendChild(twitch.row)
    wrapper.appendChild(kick.row)
    wrapper.appendChild(yt.row)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;'

    const makeMcBtn = (text, primary) => {
      const btn = document.createElement('button')
      btn.textContent = text
      const base = primary
        ? 'background:transparent;color:#ffffff;border:1px solid #ffffff;'
        : 'background:transparent;color:#808080;border:1px solid #808080;'
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;'
      btn.addEventListener('mouseenter', () => { btn.style.background = '#ffffff'; btn.style.color = '#000000' })
      btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; btn.style.color = primary ? '#ffffff' : '#808080' })
      return btn
    }

    const saveBtn = makeMcBtn('save', true)
    const cancelBtn = makeMcBtn('cancel', false)
    const resetBtn = makeMcBtn('reset', false)
    btnRow.appendChild(saveBtn)
    btnRow.appendChild(cancelBtn)
    btnRow.appendChild(resetBtn)
    wrapper.appendChild(btnRow)
    msgsEl.appendChild(wrapper)

    cancelBtn.addEventListener('click', () => { editingChannel = false; switchTab('live') })

    resetBtn.addEventListener('click', () => {
      delete livePlatformMap[urlCh]
      saveLivePlatformMap()
      editingChannel = false
      applyLivePlatformOverrides()
      switchTab('live')
    })

    const doSave = () => {
      const tw = twitch.input.value.trim().toLowerCase().replace(/^@/, '')
      const ki = kick.input.value.trim().toLowerCase().replace(/^@/, '')
      const ytVal = yt.input.value.trim() ? normalizeYtUrl(yt.input.value.trim()) : ''

      livePlatformMap[urlCh] = { twitch: tw, kick: ki, youtube: ytVal }
      saveLivePlatformMap()
      editingChannel = false
      applyLivePlatformOverrides()
      switchTab('live')
    }

    saveBtn.addEventListener('click', doSave)
    // Enter in any input saves
    ;[twitch.input, kick.input, yt.input].forEach(inp => {
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSave() } })
    })
    // Esc cancels
    wrapper.addEventListener('keydown', (e) => { if (e.key === 'Escape') { editingChannel = false; switchTab('live') } })
    twitch.input.focus()
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
    title.textContent = t('mc_edit_channel', [tabId]);
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
      // Stop YouTube/Kick keyboard shortcuts from stealing keystrokes
      input.addEventListener('keydown', (e) => e.stopPropagation())
      row.appendChild(lbl);
      row.appendChild(input);
      return { row, input };
    };

    const twitch = makeRow('twitch', t('mc_username_placeholder'), ch.twitch);
    const kick = makeRow('kick', t('mc_username_placeholder'), ch.kick);
    const yt = makeRow('youtube', t('mc_username_url_placeholder'), ch.youtube);
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
        : 'background:transparent;color:#808080;border:1px solid #808080;';
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;';
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ffffff'; btn.style.color = '#000000';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = primary ? '#ffffff' : '#808080';
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
        showErr(t('mc_enter_platform'));
        return;
      }

      // Check duplicate twitch/kick (excluding self)
      if (twitchVal && config.channels.some(c => c !== ch && (typeof c === 'string' ? c : c.twitch) === twitchVal)) {
        showErr(t('mc_twitch_exists'));
        return;
      }
      if (kickVal && config.channels.some(c => c !== ch && typeof c !== 'string' && c.kick === kickVal)) {
        showErr(t('mc_kick_exists'));
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
    cleanup.raf(() => twitch.input.focus());
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
        // Twitch helix is the source of truth for Twitch channels. For
        // YT-only channels there's no twitch handle to query, so we leave
        // the dot alone — youtube_status / message-flow handlers own it.
        const isYtOnly = typeof ch !== 'string' && !ch.twitch && !ch.kick && ch.youtube
        if (tab && !isYtOnly) tab.dataset.live = String(liveSet.has(twitch.toLowerCase()));
      });

      // Update live tab's own red dot based on selected channel. On a YT
      // host page the "selected channel" is a videoId (e.g. jfKfPfyJRdk),
      // which is never in the Twitch live-set, so we'd always stamp 'false'
      // and clobber the chatframe-based detection. Defer to detectOfflineState.
      if (hostPlatform !== 'yt') {
        const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
        const curLive = getLiveChannel()?.toLowerCase();
        if (liveTab) liveTab.dataset.live = String(curLive && liveSet.has(curLive));
      }

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
    // YouTube: /@handle/live, /watch?v=, /live/videoId
    if (location.hostname.includes('youtube.com')) {
      const handleMatch = location.pathname.match(/^\/@([^/]+)/)
      if (handleMatch) return handleMatch[1].toLowerCase()
      const vParam = new URLSearchParams(location.search).get('v')
      if (vParam) return vParam
      const liveMatch = location.pathname.match(/^\/live\/([^/?]+)/)
      if (liveMatch) return liveMatch[1]
      return null
    }

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
    // On Kick, URL channel messages always belong to live tab
    || (hostPlatform === 'kick' && mc === getCurrentChannel()?.toLowerCase())
  }

  /** Update the live tab button label to show selected channel */
  function updateLiveTabLabel() {
    const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
    if (!liveTab) return;
    const ch = liveChannel;
    // Show channel name when overridden to a non-URL channel
    if (ch && ch !== getCurrentChannel()?.toLowerCase()) {
      liveTab.textContent = t('mc_tab_live_channel', [ch]);
    } else {
      liveTab.textContent = t('mc_tab_live');
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

  /**
   * Resolve a live candidate ({name, platform, youtubeUrl?}) to a real channel tab.
   * Auto-adds the channel to config.channels so 'live' is a launcher, never the sticky tab.
   */
  async function resolveLiveCandidateToTab({ name, platform, youtubeUrl }) {
    const lower = name.toLowerCase();
    const reserved = ['live', 'feed', 'mentions', 'whispers', 'discover', 'pinned', 'add', 'rotate', 'settings'];

    // Resolve all 3 platform identities up-front via /api/profile so the resulting
    // tab pulls Twitch + Kick + YouTube together — not just the platform we
    // anchored on. resolveIdentity is the same path pcAddAsChannel uses.
    let identity = null, profile = null
    if (typeof resolveIdentity === 'function') {
      try {
        const res = await resolveIdentity(name, platform ? { platform } : {})
        if (res?.ok && res.identity) { identity = res.identity; profile = res.profile }
      } catch {}
    }

    // Build canonical YouTube URL: prefer @handle, fall back to channel id.
    const buildYtUrl = () => {
      const handle = profile?.youtube_username
      const chanId = profile?.youtube_channel_id
      if (handle) return `https://www.youtube.com/@${String(handle).replace(/^@/, '')}/live`
      if (chanId) return `https://www.youtube.com/channel/${chanId}/live`
      // Fallback: identity.youtube may be either; UC-prefixed 24-char strings are channel ids.
      const yt = identity?.youtube
      if (!yt) return ''
      if (/^UC[\w-]{20,}$/.test(yt)) return `https://www.youtube.com/channel/${yt}/live`
      return `https://www.youtube.com/@${String(yt).replace(/^@/, '')}/live`
    }

    // Optimistic fallback: when heatsync has no linkage (shadow profile / unknown
     // streamer), assume the same username on every platform. Most streamers
     // use one handle everywhere; the user can edit the tab if the guess is wrong.
    const twitchName = (identity?.twitch || lower).toLowerCase()
    const kickName = (identity?.kick || lower).toLowerCase()
    const ytUrl = platform === 'youtube'
      ? (youtubeUrl || buildYtUrl() || `https://www.youtube.com/@${name}/live`)
      : (buildYtUrl() || `https://www.youtube.com/@${lower}/live`)
    const ytLower = ytUrl.toLowerCase()

    // Find existing channel tab matching any resolved platform.
    let entry = config.channels.find(c => {
      if (typeof c === 'string') return c.toLowerCase() === lower
      const tw = c.twitch?.toLowerCase()
      const ki = c.kick?.toLowerCase()
      const yt = c.youtube?.toLowerCase()
      if (twitchName && tw === twitchName) return true
      if (kickName && ki === kickName) return true
      if (ytUrl && yt === ytLower) return true
      if (yt) {
        const handleMatch = yt.match(/\/@([^/?]+)/)
        if (handleMatch?.[1] === lower) return true
      }
      return false
    })

    if (!entry) {
      let id = (identity?.heatsync || twitchName || kickName || lower).toLowerCase()
      if (reserved.includes(id) || config.channels.some(c => (typeof c === 'string' ? c : c.id) === id)) {
        id = platform === 'youtube' ? `yt_${Date.now()}` : `ch_${Date.now()}`
      }
      entry = { id, twitch: twitchName, kick: kickName, youtube: ytUrl }
      config.channels.push(entry)
      try { saveConfig() } catch {}

      if (entry.twitch) {
        try { irc?.join?.(entry.twitch) } catch {}
        try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: entry.twitch }) } catch {}
      }
      if (entry.kick) {
        try { kickChat?.join?.(entry.kick) } catch {}
      }
      if (entry.youtube) {
        try { youtubeLinks.set(entry.id, { url: entry.youtube, videoId: '', channelName: '' }) } catch {}
        try { chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: entry.youtube, channelId: entry.id }) } catch {}
      }

      try { updateTabBar() } catch {}
    } else if (typeof entry !== 'string') {
      // Backfill any platforms missing on the existing entry (don't overwrite).
      let mutated = false
      if (!entry.twitch && twitchName) {
        entry.twitch = twitchName; mutated = true
        try { irc?.join?.(twitchName) } catch {}
        try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchName }) } catch {}
      }
      if (!entry.kick && kickName) {
        entry.kick = kickName; mutated = true
        try { kickChat?.join?.(kickName) } catch {}
      }
      if (!entry.youtube && ytUrl) {
        entry.youtube = ytUrl; mutated = true
        try { youtubeLinks.set(entry.id, { url: ytUrl, videoId: '', channelName: '' }) } catch {}
        try { chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ytUrl, channelId: entry.id }) } catch {}
      }
      if (mutated) {
        try { saveConfig() } catch {}
        try { updateTabBar() } catch {}
      }
    }

    const tabId = typeof entry === 'string' ? entry : entry.id;
    // Reset liveChannel override — live is no longer the sticky tab.
    liveChannel = null;
    switchTab(tabId);
  }

  /** Show picker for choosing which live channel to view */
  async function showLiveChannelPicker(anchorEl) {
    document.getElementById('hs-mc-live-picker')?.remove();

    const urlCh = getCurrentChannel()?.toLowerCase();
    const watching = await getWatchingChannels();

    // Split watching by platform — API supports `channels` (twitch) + `kick_channels`
    const twitchNames = [];
    const kickNames = [];
    for (const w of watching) {
      if (w.platform === 'kick') kickNames.push(w.name);
      else if (w.platform === 'twitch') twitchNames.push(w.name);
    }
    if (urlCh && hostPlatform === 'twitch' && !twitchNames.includes(urlCh)) twitchNames.push(urlCh);
    if (urlCh && hostPlatform === 'kick' && !kickNames.includes(urlCh)) kickNames.push(urlCh);

    let twitchLive = liveChannelSet;
    let kickLive = new Set();
    if (twitchNames.length > 0 || kickNames.length > 0) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'fetch_live_status', channels: twitchNames, kickChannels: kickNames });
        if (resp?.live) twitchLive = new Set(resp.live.map(c => c.toLowerCase()));
        if (resp?.kickLive) kickLive = new Set(resp.kickLive.map(c => c.toLowerCase()));
      } catch (e) { /* use cached liveChannelSet */ }
    }

    // Only show channels that are actually live; dedupe same name across platforms (twitch > kick > youtube)
    const priority = { twitch: 3, kick: 2, youtube: 1 };
    const byName = new Map();
    for (const w of watching) {
      const ch = w.name.toLowerCase();
      let isLive = false;
      if (w.platform === 'twitch') isLive = twitchLive.has(ch);
      else if (w.platform === 'kick') isLive = kickLive.has(ch);
      else if (w.platform === 'youtube') isLive = true;
      if (!isLive) continue;
      const existing = byName.get(ch);
      if (!existing || priority[w.platform] > priority[existing.platform]) {
        byName.set(ch, { name: w.name, platform: w.platform, youtubeUrl: w.youtubeUrl, isCurrent: ch === urlCh });
      }
    }
    const channels = Array.from(byName.values());

    if (channels.length <= 1) {
      // Popout: navigate to channel's popout URL when picking a different channel.
      if (channels.length === 1 && document.body.classList.contains('hs-popout') && channels[0].name.toLowerCase() !== urlCh) {
        if (hostPlatform === 'twitch') location.href = `/popout/${channels[0].name}/chat?popout=`;
        else if (hostPlatform === 'kick') location.href = `/${channels[0].name}`;
        return;
      }
      if (channels.length === 1) {
        await resolveLiveCandidateToTab(channels[0]);
        return;
      }
      // 0 candidates — fall back to urlCh (auto-add) so something opens; else just sit on live.
      if (urlCh && (hostPlatform === 'twitch' || hostPlatform === 'kick')) {
        await resolveLiveCandidateToTab({ name: urlCh, platform: hostPlatform });
        return;
      }
      switchTab('live');
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'hs-mc-live-picker';
    const rect = anchorEl.getBoundingClientRect();
    menu.style.cssText = `position:fixed;z-index:99999;background:#000;border:1px solid #808080;padding:4px 0;min-width:130px;font-size:12px;font-family:inherit;left:${rect.left}px;top:${rect.bottom + 2}px;`;

    const curLive = getLiveChannel()?.toLowerCase();

    for (const ch of channels) {
      const item = document.createElement('div');
      const isActive = ch.name.toLowerCase() === curLive;

      // Red dot — all channels in picker are confirmed live
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;background:#f00;margin-right:6px;vertical-align:middle`;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(ch.name));

      const baseColor = isActive ? '#ff8700' : '#fff';
      item.style.cssText = `padding:6px 12px;cursor:pointer;color:${baseColor};white-space:nowrap;`;
      item.addEventListener('mouseenter', () => { item.style.background = '#fff'; item.style.color = '#000'; });
      item.addEventListener('mouseleave', () => { item.style.background = 'none'; item.style.color = baseColor; });
      item.addEventListener('click', async () => {
        menu.remove();
        // Popout mode keeps URL navigation — each popout window is locked to one channel.
        if (document.body.classList.contains('hs-popout') && ch.name.toLowerCase() !== urlCh) {
          try {
            const s = await chrome.storage.sync.get(['ui_settings'])
            await chrome.storage.sync.set({ ui_settings: { ...s.ui_settings, activeTab: 'live', liveChannel: ch.name } })
          } catch {}
          if (ch.platform === 'twitch' || hostPlatform === 'twitch') {
            location.href = `/popout/${ch.name}/chat?popout=`;
          } else if (ch.platform === 'kick' || hostPlatform === 'kick') {
            location.href = `/${ch.name}`;
          }
          return;
        }
        await resolveLiveCandidateToTab(ch);
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
    cleanup.setTimeout(() => document.addEventListener('click', dismiss, { capture: true, signal: mcSignal }), 0);
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


  // ============================================
  // STORAGE
  // ============================================

  async function loadConfig() {
    try {
      const s = await chrome.storage.local.get([STORAGE_KEY]);
      config = { channels: [], enabled: true, ...s[STORAGE_KEY] };
      _channelLookup = null
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

  let _skipNextConfigSync = false

  async function saveConfig() {
    _channelLookup = null
    // Notify any open UI (profile card, etc.) that channel list may have changed
    try { document.dispatchEvent(new CustomEvent('hs-channels-changed')) } catch {}
    try {
      _skipNextConfigSync = true
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
      // Sync to server for cross-device sync
      try {
        chrome.runtime.sendMessage({ type: 'ws_send', data: { type: 'multichat:sync', channels: config.channels } })
      } catch (e) { /* context invalidated */ }
    } catch (e) { console.warn('saveConfig failed:', e) }
  }

  // ============================================
  // TABS POSITION SETTING
  // ============================================

  async function loadTabsPosition() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      // Migration: tabsOnRight → tabPosition
      if (stored.ui_settings?.tabsOnRight !== undefined && stored.ui_settings?.tabPosition === undefined) {
        tabPosition = stored.ui_settings.tabsOnRight ? 'right' : 'top';
        stored.ui_settings.tabPosition = tabPosition;
        delete stored.ui_settings.tabsOnRight;
        await chrome.storage.sync.set({ ui_settings: stored.ui_settings });
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
  const BUILTIN_TABS = ['live', 'feed', 'mentions', 'discover', 'pinned', 'add'];
  async function loadActiveTab() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
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
    document.body.classList.add(`hs-tabs-${tabPosition}`);

    // Re-run dynamic layout — clears stale inline rules + applies fresh ones for new position.
    try { _updateMcLayout() } catch (_) {}

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

  function saveTabPosition() {
    saveUiSetting('tabPosition', tabPosition)
  }

  // ============================================
  // CHAT POSITION SETTING (C button)
  // Cycles which side of the player the chat panel docks to.
  // right (default) → bottom → left → top → right
  // Vertical-monitor parity: top/bottom horizontal strips matter when the
  // viewport is taller than wide.
  //
  // Single source of truth: 3 body classes are the ONLY layout signal.
  //   hs-platform-{twitch,kick,yt}  (set once at init)
  //   hs-mode-{normal,theatre}      (set by theatre observer)
  //   hs-chat-{right,left,top,bottom} (set by C button)
  // CSS in styles.js fully derives layout from these three dimensions.
  // ============================================
  let chatPosition = 'right'; // 'right', 'bottom', 'left', 'top'
  let theatreMode = false;
  let _theatreObserver = null;

  async function loadChatPosition() {
    try {
      const stored = await chrome.storage.sync.get(['ui_settings']);
      if (stored.ui_settings?.chatPosition !== undefined) {
        chatPosition = stored.ui_settings.chatPosition;
      }
      // Stamp the platform class once — never changes per-page
      const platformClass = `hs-platform-${hostPlatform === 'yt' ? 'yt' : (isKick ? 'kick' : 'twitch')}`;
      document.body.classList.add(platformClass);
      detectTheatreMode();
      setupTheatreObserver();
      applyChatPosition();
    } catch (e) {
      log('Error loading chat position:', e);
    }
  }

  // Detect platform-native theatre/cinema/expanded-player mode.
  // Twitch:  .right-column--theatre OR .video-player--theatre
  // Kick:    main[data-theatre="true"]
  // YouTube: ytd-watch-flexy[theater]
  function detectTheatreMode() {
    let next = false;
    if (hostPlatform === 'yt') {
      next = !!document.querySelector('ytd-watch-flexy[theater], ytd-watch-flexy[fullscreen]');
    } else if (isKick) {
      const m = document.querySelector('main[data-theatre-mode-container]');
      next = m?.dataset.theatre === 'true' || !!document.querySelector('main[data-theatre="true"]');
    } else {
      next = !!document.querySelector('.right-column--theatre, .video-player--theatre');
    }
    if (next !== theatreMode) {
      theatreMode = next;
      applyChatPosition();
    }
    return next;
  }

  function setupTheatreObserver() {
    if (_theatreObserver) { try { _theatreObserver.disconnect() } catch (_) {} _theatreObserver = null }
    const targets = [];
    if (hostPlatform === 'yt') {
      const flexy = document.querySelector('ytd-watch-flexy');
      if (flexy) targets.push(flexy);
    } else if (isKick) {
      const main = document.querySelector('main');
      if (main) targets.push(main);
    } else {
      // Twitch: theatre class lands on .right-column AND inside the player.
      // Watch the body — most-specific reliable observation point covers SPA navs.
      targets.push(document.body);
    }
    if (targets.length === 0) return;
    _theatreObserver = new MutationObserver(() => detectTheatreMode());
    for (const t of targets) {
      _theatreObserver.observe(t, { attributes: true, attributeFilter: ['class', 'data-theatre', 'theater', 'fullscreen'], subtree: true });
    }
    cleanup.trackObserver(_theatreObserver);
  }

  function applyChatPosition() {
    document.body.classList.remove('hs-chat-top', 'hs-chat-right', 'hs-chat-bottom', 'hs-chat-left');
    document.body.classList.add(`hs-chat-${chatPosition}`);
    document.body.classList.toggle('hs-mode-theatre', theatreMode);
    document.body.classList.toggle('hs-mode-normal', !theatreMode);
    // Push the chatWidth css var down so the per-position CSS can build offsets
    // off it (rather than chasing platform-specific selectors twice).
    document.documentElement.style.setProperty('--hs-chat-w', chatWidth + 'px');
    document.documentElement.style.setProperty('--hs-chat-h', chatHeight + 'px');
    // Apply inline-style overrides on platform-native elements that set
    // width/height with inline !important (CSS alone can't beat that).
    applyPlatformPositionOverrides();
    // Bulletproof orange resize handle — covers all 4 chat positions.
    positionChatResizeHandle();
    hidePlatformResizeHandles(chatPosition !== 'right');
    log('Chat position:', chatPosition, 'theatre:', theatreMode);
    // Reflow the multichat layout so input/overlay/picker re-anchor.
    try { _updateMcLayout?.() } catch (_) {}
    // YT computes player size in JS and caches it; nudge it to re-read
    // --ytd-watch-flexy-non-player-height by dispatching a resize event.
    if (hostPlatform === 'yt' && (chatPosition === 'top' || chatPosition === 'bottom')) {
      try { window.dispatchEvent(new Event('resize')) } catch (_) {}
    }
  }

  // Inline-style overrides keyed off chatPosition. These run AFTER class
  // toggling. They exist because Twitch/Kick/YT set inline width/height/
  // padding with !important that beats CSS rules — only inline can fight
  // inline. When chatPosition flips back to 'right' we restore the native
  // values (Twitch's chat-width JS will re-apply them on next tick).
  let _overrideObserver = null;
  function applyPlatformPositionOverrides() {
    const isRight = chatPosition === 'right';
    const w = `${chatWidth}px`;
    const h = `${chatHeight}px`;

    // The chat container itself: inline styles beat any platform-bundled CSS
    // (Twitch's chat-shell rules, Kick's existing hs-tabs-* rules etc.).
    // We only touch geometry when overriding; the platform's mount code
    // (getOrCreateHsContainer for YT) may set its own inline height/etc that
    // we must not blow away when chatPosition === 'right'.
    const container = document.getElementById('hs-mc-container');
    const GEOM_PROPS = ['top','bottom','left','right','width','min-width','max-width','height','position','z-index'];
    if (container) {
      if (isRight) {
        if (container.dataset._hsChatOverride === '1') {
          delete container.dataset._hsChatOverride;
          GEOM_PROPS.forEach(p => container.style.removeProperty(p));
          container.style.removeProperty('background');
          // Re-establish platform-natural geometry that we just blew away
          if (hostPlatform === 'yt') {
            try { applyYouTubeChatWidth() } catch (_) {}
          } else if (isKick) {
            try { applyKickChatWidth() } catch (_) {}
          }
        }
      } else {
        container.dataset._hsChatOverride = '1';
        GEOM_PROPS.forEach(p => container.style.removeProperty(p));
        container.style.setProperty('position', 'fixed', 'important');
        container.style.setProperty('z-index', '9999', 'important');
        container.style.setProperty('background', '#000', 'important');
        if (chatPosition === 'left') {
          container.style.setProperty('top', '0', 'important');
          container.style.setProperty('bottom', '0', 'important');
          container.style.setProperty('left', '0', 'important');
          container.style.setProperty('right', 'auto', 'important');
          container.style.setProperty('width', w, 'important');
          container.style.setProperty('height', '100vh', 'important');
        } else if (chatPosition === 'top') {
          container.style.setProperty('top', '0', 'important');
          container.style.setProperty('bottom', 'auto', 'important');
          container.style.setProperty('left', '0', 'important');
          container.style.setProperty('right', '0', 'important');
          container.style.setProperty('width', '100vw', 'important');
          container.style.setProperty('height', h, 'important');
        } else if (chatPosition === 'bottom') {
          container.style.setProperty('top', 'auto', 'important');
          container.style.setProperty('bottom', '0', 'important');
          container.style.setProperty('left', '0', 'important');
          container.style.setProperty('right', '0', 'important');
          container.style.setProperty('width', '100vw', 'important');
          container.style.setProperty('height', h, 'important');
        }
      }
    }

    if (hostPlatform === 'yt') {
      const sec = document.querySelector('#secondary');
      if (sec) {
        if (isRight) {
          sec.style.removeProperty('width');
          sec.style.removeProperty('min-width');
          sec.style.removeProperty('max-width');
          sec.style.removeProperty('flex');
          // applyYouTubeChatWidth will reset width on next reflow
        } else {
          sec.style.setProperty('width', '0', 'important');
          sec.style.setProperty('min-width', '0', 'important');
          sec.style.setProperty('max-width', '0', 'important');
          sec.style.setProperty('flex', '0 0 0', 'important');
        }
      }
      // chat-top/bottom: force aspect-preserved player size inline on EVERY
      // element in the player container chain. YT sizes the player from
      // multiple layers (player-container-outer/inner, ytd-player, player,
      // movie_player); missing any one means YT's cached size leaks through
      // and the player overflows the viewport.
      const ytSelectors = [
        '#player-container-outer',
        '#player-container-inner',
        '#player-container',
        '#player',
        'ytd-player#ytd-player',
        '#movie_player'
      ];
      const ytSizedEls = ytSelectors.map(s => document.querySelector(s)).filter(Boolean);
      const PLAYER_GEOM = ['width', 'height', 'max-width', 'max-height', 'min-height'];
      if (chatPosition === 'top' || chatPosition === 'bottom') {
        const NAV_H = 56, PRIMARY_PAD = 12;
        const availH = Math.max(200, innerHeight - chatHeight - NAV_H - PRIMARY_PAD);
        const aspectW = availH * 16 / 9;
        const maxW = innerWidth - 32;
        const finalW = Math.min(aspectW, maxW);
        const finalH = (finalW < aspectW) ? finalW * 9 / 16 : availH;
        const wPx = Math.round(finalW) + 'px';
        const hPx = Math.round(finalH) + 'px';
        for (const el of ytSizedEls) {
          el.dataset._hsCYtSized = '1';
          el.style.setProperty('width', wPx, 'important');
          el.style.setProperty('height', hPx, 'important');
          el.style.setProperty('max-width', wPx, 'important');
          el.style.setProperty('max-height', hPx, 'important');
          el.style.setProperty('min-height', '0', 'important');
        }
        // YT's resize observer fires async — re-apply after rAF to win against
        // any post-callback size restoration.
        requestAnimationFrame(() => {
          for (const el of ytSizedEls) {
            if (!el.dataset._hsCYtSized) continue;
            el.style.setProperty('width', wPx, 'important');
            el.style.setProperty('height', hPx, 'important');
            el.style.setProperty('max-width', wPx, 'important');
            el.style.setProperty('max-height', hPx, 'important');
          }
        });
      } else {
        for (const el of ytSizedEls) {
          if (el.dataset._hsCYtSized === '1') {
            delete el.dataset._hsCYtSized;
            PLAYER_GEOM.forEach(p => el.style.removeProperty(p));
          }
        }
      }
    } else if (isKick) {
      // Kick's #channel-chatroom is hidden via display:none CSS when chat
      // is non-right; nothing inline to override here. main padding is
      // handled by CSS.
    } else {
      // Twitch
      const rc = document.querySelector('.right-column');
      if (rc) {
        if (isRight) {
          // Restore: clear our overrides; Twitch's own width logic will
          // re-assert on next layout pass.
          rc.style.removeProperty('width');
          rc.style.removeProperty('min-width');
          rc.style.removeProperty('max-width');
          rc.style.removeProperty('flex-shrink');
        } else {
          rc.style.setProperty('width', '0', 'important');
          rc.style.setProperty('min-width', '0', 'important');
          rc.style.setProperty('max-width', '0', 'important');
        }
      }
      // .persistent-player has inline height:100%/max-height:100vh that
      // ignores any CSS bottom: inset. Override the player's geometry
      // directly so the chat strip doesn't sit on top of the video.
      const pp = document.querySelector('.persistent-player');
      if (pp) {
        if (isRight) {
          pp.style.removeProperty('top');
          pp.style.removeProperty('bottom');
          pp.style.removeProperty('left');
          pp.style.removeProperty('right');
          pp.style.removeProperty('max-height');
          pp.style.removeProperty('height');
          pp.style.removeProperty('width');
          // Twitch will re-apply its calc(100% - 34rem) on next tick
        } else {
          // For all non-right positions the player should fill the freed
          // space. Use top/bottom/left/right anchors and let the browser
          // compute width/height (clear those so anchors govern).
          pp.style.removeProperty('width');
          pp.style.removeProperty('height');
          pp.style.removeProperty('max-height');
          pp.style.setProperty('top', chatPosition === 'top' ? h : '0', 'important');
          pp.style.setProperty('bottom', chatPosition === 'bottom' ? h : '0', 'important');
          pp.style.setProperty('left', chatPosition === 'left' ? w : '0', 'important');
          pp.style.setProperty('right', chatPosition === 'right' ? w : '0', 'important');
          pp.style.setProperty('inset-inline-start', chatPosition === 'left' ? w : '0', 'important');
          pp.style.setProperty('inset-inline-end', chatPosition === 'right' ? w : '0', 'important');
        }
      }
    }

    // If the platform re-asserts its inline width/height (e.g. Twitch's
    // own chat-width JS on resize), we re-apply on the same hooks the
    // platform uses: window.resize + chat-width persistence. No observer
    // here — observers on style attrs loop on our own writes.
  }

  function rotateChatPosition() {
    const positions = ['right', 'bottom', 'left', 'top'];
    const idx = positions.indexOf(chatPosition);
    const prev = chatPosition;
    chatPosition = positions[(idx === -1 ? 0 : (idx + 1) % positions.length)];
    log('rotate-chat:', prev, '→', chatPosition);
    applyChatPosition();
    saveUiSetting('chatPosition', chatPosition);
  }

  // Render a small banner inside the multichat panel when an upstream API is unreachable.
  // Auto-removes when state flips back to 'up'. Only renders when our panel is mounted.
  function showApiStatusBanner(source, state) {
    const container = document.getElementById('hs-mc-container')
    if (!container) return
    const id = 'hs-mc-api-banner-' + (source || 'unknown').replace(/[^a-z0-9_-]/gi, '')
    const existing = document.getElementById(id)
    if (state === 'up') { existing?.remove(); return }
    if (existing) return
    const banner = document.createElement('div')
    banner.id = id
    banner.className = 'hs-mc-api-banner'
    banner.style.cssText = 'background:#ff8700;color:#000;font:600 11px/1.4 monospace;padding:6px 10px;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;'
    const label = source === 'heatsync' ? 'heatsync.org unreachable — reconnecting' : `${source} unreachable`
    const text = document.createElement('span')
    text.textContent = label
    const dismiss = document.createElement('span')
    dismiss.textContent = '×'
    dismiss.style.cssText = 'cursor:pointer;font-weight:700;padding:0 4px;'
    dismiss.addEventListener('click', () => banner.remove())
    banner.append(text, dismiss)
    container.insertBefore(banner, container.firstChild)
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
        if (msg.settings.chatPosition !== undefined && msg.settings.chatPosition !== chatPosition) {
          chatPosition = msg.settings.chatPosition;
          applyChatPosition();
        }
      }
      if (msg.type === 'debug_log' && MC_DEBUG) console.log('[hs-bg]', msg.msg)
      if (msg.type === 'api_status') {
        try { showApiStatusBanner(msg.source, msg.state) } catch (e) {}
      }
      if (msg.type === 'cosmetics_update') {
        mcBttvBadgeMap = new Map(Object.entries(msg.bttvBadges || {}))
        mcFfzBadgeMap = new Map(Object.entries(msg.ffzBadges || {}))
        renderMessages(currentTab)
      }
      // 7TV EventAPI pushed user.update / entitlement.* — drop our local
      // cosmetic cache and re-queue lookup so badges/paint show up fresh.
      if (msg.type === 'cosmetics_invalidated' && msg.twitchId) {
        mcUserCosmetics.delete(String(msg.twitchId))
        // Re-queue lookup; updateCosmeticsInPlace fires on response and adds
        // the badge to all existing messages with this uid.
        queueMcCosmeticsLookup(String(msg.twitchId))
      }
      // Listen for emote updates from background
      if (msg.type === 'global_emotes_update' || msg.type === 'channel_emotes_update') {
        log('received', msg.type, msg.channelOwner || '');
        // Defer cache invalidation + epoch bump until after loadEmotes resolves.
        // Bumping immediately caused 2-3 visible rebuilds on refresh because the
        // runtime msg + storage event paths both fire and any intermediate
        // renderMessages (rAF-debounced from new chat msgs) wipes the DOM.
        cleanup.clearTimeout(emoteReloadTimer);
        emoteReloadTimer = cleanup.setTimeout(() => {
          loadEmotes().then(() => {
            clearRenderedHtmlCache();
            renderMessages(currentTab);
          });
        }, 300);
      }
      // Inventory changes: update membership + ensure emotes are in cache for tab completion
      // Old messages keep their rendered emotes, new messages use updated inventory
      if (msg.type === 'inventory_update') {
        inventoryEmotes.clear();
        inventoryHashes.clear();
        (msg.emotes || []).forEach(e => {
          if (e.name) {
            inventoryEmotes.add(e.name);
            if (e.hash) inventoryHashes.set(e.name, e.hash);
            // Ensure emote is in cache for tab completion + rendering
            if (!emoteCache.has(e.name) && e.url) {
              emoteCache.set(e.name, { url: e.url, source: 'heatsync', state: 'owned', hash: e.hash });
            } else if (emoteCache.has(e.name)) {
              emoteCache.get(e.name).state = 'owned';
            }
          }
        });
        // Remove emotes no longer in inventory from cache (if heatsync source)
        for (const [name, emote] of emoteCache) {
          if (emote.source === 'heatsync' && !inventoryEmotes.has(name)) {
            emoteCache.delete(name);
          }
        }
        log('inventory_update:', inventoryEmotes.size, 'emotes');
      }

      // Cross-platform mute sync (from background.js — other tabs, server WS, or expiry)
      if (msg.type === 'user_muted') {
        const u = msg.username?.toLowerCase()
        if (u && !mutedUsers.has(u)) {
          mutedUsers.add(u)
          applyMcMutes()
        }
      }
      if (msg.type === 'user_unmuted') {
        const u = msg.username?.toLowerCase()
        if (u && mutedUsers.has(u)) {
          mutedUsers.delete(u)
          restoreMcUnmutedDom(u)
          renderMessages(currentTab)
        }
      }

      // 7TV emote add/remove — just reload emotes, don't spam chat
      if (msg.type === 'channel_emote_added' || msg.type === 'channel_emote_removed') {
        log('7TV emote change:', msg.message);
      }
    });

    // Also listen for storage changes (more reliable)
    // Remove previous storage listener to prevent accumulation on SPA nav
    if (_mcStorageListener) chrome.storage.onChanged.removeListener(_mcStorageListener)
    _mcStorageListener = (changes, area) => {
      // UI settings synced via storage.sync (cross-tab + cross-device)
      if (area === 'sync' && changes.ui_settings) {
        const ns = changes.ui_settings.newValue || {}
        log('Settings synced:', Object.keys(ns).join(', '))
        let needsRender = false

        if (ns.automodAllCaps !== undefined || ns.automodRegex !== undefined) {
          compileAutomod(ns)
        }

        if (ns.tabPosition !== undefined && ns.tabPosition !== tabPosition) {
          tabPosition = ns.tabPosition
          applyTabsPosition()
          needsRender = true
        }
        if (ns.chatPosition !== undefined && ns.chatPosition !== chatPosition) {
          chatPosition = ns.chatPosition
          applyChatPosition()
        }
        if (ns.showPlatformBadges !== undefined && ns.showPlatformBadges !== platformBadgesEnabled) {
          platformBadgesEnabled = ns.showPlatformBadges
          needsRender = true
        }
        if (ns.wysiwygEnabled !== undefined && ns.wysiwygEnabled !== wysiwygEnabled) {
          wysiwygEnabled = ns.wysiwygEnabled
          rebuildInput()
        }
        if (ns.linksEnabled !== undefined && ns.linksEnabled !== linksEnabled) {
          linksEnabled = ns.linksEnabled
          needsRender = true
        }
        if (ns.viMode !== undefined && ns.viMode !== viModeEnabled) {
          viModeEnabled = ns.viMode
          try {
            const ls = JSON.parse(localStorage.getItem('heatsync-extension-settings') || '{}')
            ls.viMode = viModeEnabled
            localStorage.setItem('heatsync-extension-settings', JSON.stringify(ls))
          } catch (_) {}
          window.postMessage({ type: 'heatsync-settings-changed', settings: { viMode: viModeEnabled } }, location.origin)
        }
        if (ns.zebra !== undefined && ns.zebra !== zebraEnabled) {
          zebraEnabled = ns.zebra
          needsRender = true
        }
        if (ns.autoHideEmpty !== undefined && ns.autoHideEmpty !== autoHideInput) {
          autoHideInput = ns.autoHideEmpty
          const bar = document.getElementById('hs-mc-inputbar')
          const pickerOpen = document.getElementById('hs-mc-emote-picker')?.classList.contains('visible') || false
          if (autoHideInput) {
            if (bar) bar.classList.add('hs-hidden')
            inputBarVisible = false
          } else {
            if (bar) bar.classList.remove('hs-hidden')
            inputBarVisible = true
          }
          adjustOverlayForPicker(pickerOpen)
        }
        if (ns.timestamps !== undefined && ns.timestamps !== timestampsEnabled) {
          timestampsEnabled = ns.timestamps
          window._hsTimestampsEnabled = timestampsEnabled
          needsRender = true
        }
        if (ns.avatars !== undefined && ns.avatars !== avatarsEnabled) {
          avatarsEnabled = ns.avatars
          needsRender = true
        }
        if (ns.showOfflineEvents !== undefined && ns.showOfflineEvents !== showOfflineEvents) {
          showOfflineEvents = ns.showOfflineEvents
        }
        if (ns.smartCompletion !== undefined && ns.smartCompletion !== smartCompletion) {
          smartCompletion = !!ns.smartCompletion
        }
        if (ns.firstChatterGlow !== undefined && ns.firstChatterGlow !== firstChatterGlow) {
          firstChatterGlow = !!ns.firstChatterGlow
          needsRender = true
        }
        if (typeof ns.keywordHighlights === 'string' && ns.keywordHighlights !== keywordHighlights) {
          keywordHighlights = ns.keywordHighlights
          rebuildKeywordRegex()
          needsRender = true
        }
        if (ns.inlineNotifs) {
          for (const k of Object.keys(INLINE_NOTIF_TYPES)) {
            if (ns.inlineNotifs[k] !== undefined) inlineNotifs[k] = ns.inlineNotifs[k]
          }
        }
        if (ns.hermesEvents) {
          for (const k of Object.keys(HERMES_EVENT_TYPES)) {
            if (ns.hermesEvents[k] !== undefined) hermesToggles[k] = ns.hermesEvents[k]
          }
        }

        if (needsRender) renderMessages(currentTab)
        // Update settings panel toggles if visible
        if (currentTab === 'settings') renderSettingsTab()
      }

      if (area !== 'local') return

      // Emote updates - reload when storage changes (debounced to avoid spam)
      if (changes.global_emotes || changes.channel_emotes_map || changes.emote_inventory || changes.native_twitch_emotes) {
        log('storage changed:', changes.channel_emotes_map ? 'channel_emotes_map' : '', changes.global_emotes ? 'global_emotes' : '', changes.emote_inventory ? 'emote_inventory' : '', changes.native_twitch_emotes ? 'native_twitch_emotes' : '');
        // Same deferral as the runtime msg path — bump epoch + invalidate
        // cache only once after loadEmotes resolves, otherwise back-to-back
        // bumps from multiple emote sources cause visible flicker on refresh.
        const needsBump = !!(changes.global_emotes || changes.channel_emotes_map || changes.native_twitch_emotes)
        cleanup.clearTimeout(emoteReloadTimer);
        emoteReloadTimer = cleanup.setTimeout(() => {
          loadEmotes().then(() => {
            if (needsBump) clearRenderedHtmlCache();
            if (!isScrolledUp) renderMessages(currentTab);
          });
        }, 300);
      }

      // Multichat config sync (cross-tab + cross-device)
      if (changes.heatsync_multichat) {
        if (_skipNextConfigSync) {
          _skipNextConfigSync = false
        } else {
          const newConfig = changes.heatsync_multichat.newValue || { channels: [], enabled: true }
          const oldChannels = config.channels || []
          const newChannels = newConfig.channels || []

          // Diff: find added and removed channels
          const oldIds = new Set(oldChannels.map(c => typeof c === 'string' ? c : c.id))
          const newIds = new Set(newChannels.map(c => typeof c === 'string' ? c : c.id))

          // Part removed channels
          for (const ch of oldChannels) {
            const id = typeof ch === 'string' ? ch : ch.id
            if (!newIds.has(id)) {
              const twitchName = typeof ch === 'string' ? ch : ch.twitch
              if (twitchName) irc?.part(twitchName)
              const kickName = typeof ch === 'string' ? null : ch.kick
              if (kickName) kickChat?.part(kickName)
              if (typeof ch !== 'string' && ch.youtube) {
                const link = youtubeLinks.get(id)
                chrome.runtime.sendMessage({
                  type: 'youtube_ws_unsubscribe',
                  videoId: link?.videoId || '',
                  url: ch.youtube,
                  channelId: id,
                }).catch(() => {})
                youtubeLinks.delete(id)
                channelYtMessages.delete(id)
              }
            }
          }

          // Join added channels
          for (const ch of newChannels) {
            const id = typeof ch === 'string' ? ch : ch.id
            if (!oldIds.has(id)) {
              const twitchName = typeof ch === 'string' ? ch : ch.twitch
              if (twitchName) {
                irc?.join(twitchName)
                try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchName }) } catch (e) {}
              }
              const kickName = typeof ch === 'string' ? null : ch.kick
              if (kickName) kickChat?.join(kickName)
              if (typeof ch !== 'string' && ch.youtube) {
                youtubeLinks.set(id, { url: ch.youtube, videoId: '', channelName: '' })
                chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ch.youtube, channelId: id }).catch(() => {})
              }
            }
          }

          // Update config and UI
          config.channels = newChannels
          _channelLookup = null
          config.enabled = newConfig.enabled !== undefined ? newConfig.enabled : config.enabled
          updateTabBar()
          // If current tab was removed, switch to live
          if (currentTab !== 'live' && currentTab !== 'feed' && currentTab !== 'mentions' && currentTab !== 'whispers' && !newIds.has(currentTab)) {
            switchTab('live')
          }
          log('Config synced from another tab/device:', newChannels.length, 'channels')
        }
      }

      // Blocked emotes — diff-apply only the hash changes. The previous code
      // reloaded the whole set from storage and re-rendered every message,
      // which caused chat-wide flicker on every block/unblock and could revert
      // optimistic toggles if storage lagged the user action.
      if (changes.blocked_emotes) {
        applyBlockedHashDelta(changes.blocked_emotes.newValue || []);
      }
    }
    chrome.storage.onChanged.addListener(_mcStorageListener)
  }

  // ============================================
  // OFFLINE DETECTION
  // ============================================

  function detectOfflineState() {
    // On Kick, detect live status from page and set the live tab dot
    if (isKick) {
      let kickLiveFound = false
      function checkKickLive() {
        const isLive = !!document.querySelector('video')
        const liveTab = tabBarElement?.querySelector('[data-tab="live"]')
        if (liveTab) liveTab.dataset.live = String(isLive)
        const curCh = getCurrentChannel()?.toLowerCase()
        if (curCh && isLive) liveChannelSet.add(curCh)
        if (isLive) kickLiveFound = true
      }
      checkKickLive()
      const fastPoll = cleanup.setInterval(() => {
        checkKickLive()
        if (kickLiveFound) { cleanup.clearInterval(fastPoll); cleanup.setInterval(checkKickLive, 10000) }
      }, 1000)
      return
    }
    // On YouTube, the live_chat iframe only loads on live streams; presence
    // there is the most reliable "is live" signal we can get without polling
    // the InnerTube API.
    if (hostPlatform === 'yt') {
      function checkYtLive() {
        const cf = document.getElementById('chatframe')
        const hasChatFrame = !!cf && (() => { try { return !!cf.contentDocument } catch { return false } })()
        const isLive = hasChatFrame || !!_autoYtVideoId
        const liveTab = tabBarElement?.querySelector('[data-tab="live"]')
        if (liveTab) liveTab.dataset.live = String(isLive)
        document.body.classList.toggle('hs-offline', !isLive)
      }
      checkYtLive()
      cleanup.setInterval(checkYtLive, 4000)
      return
    }
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
      if (++fastChecks >= 10) cleanup.clearInterval(fastId)
    }, 1000)

    // Steady-state polling
    cleanup.setInterval(checkOffline, 5000)

    // MutationObserver for instant transitions
    const root = document.querySelector('[class*="channel-root"]')
    if (root) {
      const observer = new MutationObserver(() => checkOffline())
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
      cleanup.trackObserver(observer)
    }
  }

  // ============================================
  // MAIN INITIALIZATION
  // ============================================

  let mcInitialized = false;
  async function init() {
    let isPopout = false;
    if (hostPlatform === 'yt') {
      // YouTube: run on watch pages, live pages, and @channel/live
      const isYtLive = !!location.pathname.match(/^\/@[^/]+\/live/) ||
                       !!location.pathname.match(/^\/watch/) ||
                       !!location.pathname.match(/^\/live\//)
      if (!isYtLive) return;
    } else if (isKick) {
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

    // Load muted users from background muted_users key (with expiry check)
    try {
      const stored = await chrome.storage.local.get(['muted_users']);
      if (stored.muted_users && Array.isArray(stored.muted_users)) {
        const now = Date.now()
        for (const entry of stored.muted_users) {
          const u = (typeof entry === 'string' ? entry : entry.username)?.toLowerCase()
          const exp = typeof entry === 'string' ? null : entry.expiresAt
          if (u && (!exp || exp > now)) mutedUsers.add(u)
        }
      }
    } catch (e) {
      log('Error loading muted users:', e);
    }

    injectStyles();
    detectOfflineState();
    await migrateSettingsToSync();
    await loadActiveTab();
    await loadTabsPosition();
    await loadChatPosition();
    await loadLivePlatformMap();
    await loadEmoteSize();
    await loadWysiwygSetting();
    await loadLinksSetting();
    await loadViModeSetting();
    await loadInlineNotifSettings();
    await loadHermesSettings();
    await loadAutomodSettings();
    await loadPlatformBadgesSetting();
    await loadZebraSetting();
    await loadPlatformFilters();
    await loadAutoHideSetting();
    await loadTimestampsSetting();
    await loadAvatarsSetting();
    await loadAutoClaimSetting();
    await loadDimTimeoutsSetting();
    await loadReadableNamesSetting();
    await loadSmartCompletionSetting();
    await loadFirstChatterGlowSetting();
    await loadKeywordHighlightsSetting();
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
    setupProfileCardHandlers();
    listenForSettingsChanges();

    // Request initial BTTV/FFZ badge maps from background
    safeSendMessage({ type: 'get_bulk_badges' }).then(resp => {
      if (resp?.bttvBadges) mcBttvBadgeMap = new Map(Object.entries(resp.bttvBadges))
      if (resp?.ffzBadges) mcFfzBadgeMap = new Map(Object.entries(resp.ffzBadges))
    }).catch(() => {})

    // Load heatsync auth state
    loadHsAuth();

    // Listen for social tab events from background
    listenForSocialEvents();

    // Load whisper conversations from storage
    loadWhispers();

    // Initialize IRC (runs on both Twitch and Kick — cross-platform relay)
    irc = new IRC();
    irc.connect();

    // Connect auth IRC eagerly so first send is instant (whispers no longer arrive over IRC)
    if (hostPlatform === 'twitch') {
      const token = getTwitchAuthToken()
      const nick = currentUsername || getCurrentUsername()
      if (token && nick) {
        connectAuthIrc(token, nick).then(ok => {
          if (ok === true) log('Auth IRC ready')
        })
      }
    }

    // Twitch deprecated WHISPER over IRC in Feb 2023 — receive via EventSub instead.
    // Works on any host (the ESW socket is independent of the chat IRC).
    startEventSubWhispers()

    // Initialize Kick chat (runs on both platforms — cross-platform relay)
    kickChat = new KickChat();
    kickChat.connect();

    // Auto-join current channel on all platforms (using overrides if set)
    const currentChannel = getCurrentChannel();
    if (currentChannel) {
      const platNames = getLivePlatformNames()
      const twitchCh = platNames.twitch || currentChannel
      const kickCh = platNames.kick || currentChannel
      const ytUrl = platNames.youtube || `https://youtube.com/@${currentChannel}/live`

      irc.join(twitchCh)
      kickChat.join(kickCh)
      // Also join the URL channel name if different (for native platform messages)
      if (twitchCh !== currentChannel) irc.join(currentChannel)
      if (kickCh !== currentChannel) kickChat.join(currentChannel)

      // Subscribe YouTube
      if (hostPlatform === 'yt' && currentChannel.length > 20) {
        // On YouTube watch page, use the video URL directly
        chrome.runtime.sendMessage({
          type: 'youtube_ws_subscribe',
          url: `https://youtube.com/watch?v=${currentChannel}`,
          channelId: '__live_yt_auto__'
        }).catch(() => {})
      } else {
        chrome.runtime.sendMessage({
          type: 'youtube_ws_subscribe', url: ytUrl, channelId: '__live_yt_auto__'
        }).catch(() => {})
      }
      log('Auto-joined current channel:', currentChannel, 'platforms:', twitchCh, kickCh, ytUrl);
    }

    // Ensure live channel override is also joined on all platforms
    const liveCh = getLiveChannel();
    if (liveCh && liveCh !== currentChannel) {
      irc?.join(liveCh);
      kickChat?.join(liveCh);
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
      // CLEARCHAT/CLEARMSG → live-dim already-rendered DOM rows from the offender.
      // Buffer entries were already flagged with `cleared=true` inside the IRC client,
      // so future re-renders pick it up via the renderer; this just patches the visible DOM.
      if (msg.type === 'notice' && (msg.noticeType === 'ban_success' || msg.noticeType === 'timeout_success') && msg.targetUser) {
        const targetLc = msg.targetUser.toLowerCase()
        const msgsEl = document.getElementById('hs-mc-messages')
        const rows = msgsEl?.querySelectorAll(`.hs-mc-msg[data-msg-user]`) || []
        for (const row of rows) {
          if ((row.dataset.msgUser || '').toLowerCase() === targetLc) {
            row.classList.add('hs-mc-msg-cleared')
            row.title = msg.banDuration ? `timed out (${msg.banDuration}s)` : 'banned'
          }
        }
      }
      if (msg.type === 'notice' && msg.noticeType === 'delete_message_success' && msg.targetMsgId) {
        const safe = (CSS.escape ? CSS.escape(msg.targetMsgId) : msg.targetMsgId.replace(/"/g, '\\"'))
        const msgsEl = document.getElementById('hs-mc-messages')
        const row = msgsEl?.querySelector(`.hs-mc-msg[data-msg-id="${safe}"]`)
        if (row) { row.classList.add('hs-mc-msg-cleared'); row.title = 'deleted' }
      }
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
      // Automod: drop messages matching user-defined filter or all-caps spam.
      // Don't filter own messages (you saw what you typed).
      if (msg.user?.toLowerCase() !== currentUsername?.toLowerCase() && shouldAutomod(msg.text)) return
      const isMent = isMention(msg)
      bumpStreamStats(msg.channel, msg, isMent)
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
      const chTabId = getChannelLookup().twitch.get(msg.channel);
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
      if (msg.user?.toLowerCase() !== currentUsername?.toLowerCase() && shouldAutomod(msg.text)) return
      const isMent = isMention(msg)
      bumpStreamStats(msg.channel, msg, isMent)
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
      const chConfig = getChannelLookup().kick.get(msg.channel);
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

    // Global dedup for stream events — prevents dupes from multiple sources
    // (Twitch EventSub + Kick webhook + follow poll can all fire for the same event)
    if (!window._hsStreamEventDedup) window._hsStreamEventDedup = new Map()
    const streamEventDedup = window._hsStreamEventDedup

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
          try { streamStats.delete((channel || '').toLowerCase()) } catch (e) {}
        } else if (msg.eventType === 'stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-offline';
          try { renderStreamSummary(channel) } catch (e) {}
        } else if (msg.eventType === 'stream:redeem') {
          if (!hermesToggles?.redeem) return;
          text = `\u25C6 redeemed "${escapeHtml(msg.title)}"`;
          if (msg.cost) text += ` (${msg.cost})`;
          eventClass = 'event-redeem';
        } else if (msg.eventType === 'stream:raid') {
          if (!hermesToggles?.raid) return;
          text = `[${channel}] \u25C6 raided ${escapeHtml(msg.target)} with ${msg.viewers || 0} viewers`;
          eventClass = 'event-raid';
        } else if (msg.eventType === 'stream:hype-start') {
          if (!hermesToggles?.hype) return;
          text = `[${channel}] \u25C6 hype train started`;
          eventClass = 'event-hype';
        } else if (msg.eventType === 'stream:hype-end') {
          if (!hermesToggles?.hype) return;
          text = `[${channel}] \u25C6 hype train ended at level ${msg.level || 0}`;
          eventClass = 'event-hype';
        } else if (msg.eventType === 'stream:sub-gift') {
          if (!hermesToggles?.sub) return;
          text = `[${channel}] \u25C6 ${escapeHtml(msg.user)} gifted ${msg.count || 0} subs`;
          eventClass = 'event-sub';
        }
        if (!text) return;

        // Dedup: skip if same text was shown in last 60s
        const now = Date.now()
        if (streamEventDedup.has(text) && now - streamEventDedup.get(text) < 60000) return
        streamEventDedup.set(text, now)
        // Prune old entries
        if (streamEventDedup.size > 100) {
          for (const [k, t] of streamEventDedup) { if (now - t > 60000) streamEventDedup.delete(k) }
        }

        log('[Stream]', channel, text);
        notifyStreamEvent(channel, msg.eventType, msg.game);
        const actor = msg.eventType === 'stream:redeem' ? msg.user : null;
        const evt = { type: 'stream-event', eventClass, text, channel, actor, time: Date.now() };

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

        // Render only on tabs whose channel matches this event
        const activeTab = currentTab;
        if (activeTab === 'live') {
          if (isLiveChannelMessage({ channel })) {
            if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
          }
        } else {
          const tabCh = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)
          if (tabCh) {
            const tw = (typeof tabCh === 'string' ? tabCh : tabCh.twitch)?.toLowerCase()
            const ki = (typeof tabCh === 'string' ? undefined : tabCh.kick)?.toLowerCase()
            if (tw === channel || ki === channel) {
              if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
            }
          }
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
        text = `[${escapeHtml(channel)}] \u25C6 raided ${escapeHtml(data.target)} with ${Number(data.viewers) || 0} viewers`
      } else if (eventType === 'hype-train-start') {
        toggleKey = 'hype'
        eventClass = 'event-hype'
        text = `[${escapeHtml(channel)}] \u25C6 hype train started`
        if (typeof onHypeTrainStart === 'function') onHypeTrainStart(data.level)
      } else if (eventType === 'hype-train-end') {
        toggleKey = 'hype'
        eventClass = 'event-hype'
        text = `[${escapeHtml(channel)}] \u25C6 hype train ended at level ${Number(data.level) || 0}`
        if (typeof onHypeTrainEnd === 'function') onHypeTrainEnd()
      } else if (eventType === 'sub-gift') {
        toggleKey = 'sub'
        eventClass = 'event-sub'
        text = `[${escapeHtml(channel)}] \u25C6 ${t('mc_irc_gift_subs', [escapeHtml(data.user), String(Number(data.count) || 0), escapeHtml(channel)])}`
      } else if (eventType === 'redeem') {
        toggleKey = 'redeem'
        eventClass = 'event-redeem'
        text = `\u25C6 redeemed "${escapeHtml(data.title)}"`
        if (data.rewardId) {
          redeemTitleMap.set(data.rewardId, { title: data.title, cost: data.cost })
          if (redeemTitleMap.size > 200) redeemTitleMap.delete(redeemTitleMap.keys().next().value)
        }
      } else if (eventType === 'pin') {
        if (typeof onPinnedMessage === 'function') onPinnedMessage({ message: data.message, sender: data.sender, id: data.id, channel })
        return
      } else if (eventType === 'unpin') {
        if (typeof clearPinnedMessage === 'function') clearPinnedMessage()
        return
      } else return

      if (!hermesToggles[toggleKey]) return

      const actor = eventType === 'redeem' ? data.user : null
      const evt = { type: 'stream-event', eventClass, text, channel, actor, time: Date.now() }

      // Push into relevant buffers — only the channel the event belongs to
      const liveChannel = getLiveChannel()
      const chBuffer = irc?.channels?.get(channel)
      if (chBuffer) {
        const existing = chBuffer.getAll()
        if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
          chBuffer.push(evt)
          saveStreamEvent(evt)
        }
      }
      // Also push into live buffer if this event's channel IS the live channel
      if (channel === liveChannel) {
        const liveBuffer = irc?.channels?.get(liveChannel)
        if (liveBuffer && liveBuffer !== chBuffer) {
          const existing = liveBuffer.getAll()
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            liveBuffer.push(evt)
          }
        }
      }
      pushActivityEvent(evt)

      // Render only on tabs whose channel matches this event
      const activeTab = currentTab
      if (activeTab === 'live') {
        if (isLiveChannelMessage({ channel })) {
          if (!appendMessage(evt, activeTab)) renderMessages(activeTab)
        }
      } else {
        const tabCh = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)
        if (tabCh) {
          const tw = (typeof tabCh === 'string' ? tabCh : tabCh.twitch)?.toLowerCase()
          const ki = (typeof tabCh === 'string' ? undefined : tabCh.kick)?.toLowerCase()
          if (tw === channel || ki === channel) {
            if (!appendMessage(evt, activeTab)) renderMessages(activeTab)
          }
        }
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

        // Dedup: skip if same text was shown in last 60s (same dedup map as stream_event)
        const now = Date.now()
        if (streamEventDedup.has(text) && now - streamEventDedup.get(text) < 60000) return
        streamEventDedup.set(text, now)

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

        // Render only on tabs whose channel matches this event
        const activeTab = currentTab;
        if (activeTab === 'live') {
          if (isLiveChannelMessage({ channel })) {
            if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
          }
        } else {
          const tabCh = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)
          if (tabCh) {
            const tw = (typeof tabCh === 'string' ? tabCh : tabCh.twitch)?.toLowerCase()
            const ki = (typeof tabCh === 'string' ? undefined : tabCh.kick)?.toLowerCase()
            if (tw === channel || ki === channel) {
              if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
            }
          }
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
      const now = Date.now()
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

        // Dedup against realtime events (same map as stream_event / follow_stream_event)
        if (streamEventDedup.has(text) && now - streamEventDedup.get(text) < 60000) continue
        streamEventDedup.set(text, now)

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
      if (streamColorMap.size > 500) streamColorMap.clear();
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

    // 4. Reconnect EventSub whispers on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      reconnectEventSubIfDead();
    }, { signal: mcSignal });

    if (hostPlatform === 'yt') {
      // YouTube: wait for chat container, then inject directly
      let ytAttempts = 0;
      const tryInjectYt = () => {
        if (mcSignal?.aborted) return;
        ytAttempts++;
        const chatContainer = document.getElementById('chat-container') ||
                              document.querySelector('ytd-live-chat-frame#chat')?.parentElement;
        if (chatContainer) {
          ensureUIElements();
          switchTab(_savedActiveTab || 'live');
          startLayoutWatcher();
        } else if (ytAttempts < 30) {
          cleanup.setTimeout(tryInjectYt, 500);
        } else {
          log('Failed to find YouTube chat container after 30 attempts');
        }
      };
      tryInjectYt();
    } else if (isKick) {
      // Kick: no React hook needed, just inject directly
      let kickAttempts = 0;
      const tryInjectKick = () => {
        if (mcSignal?.aborted) return;
        kickAttempts++;
        const chatroom = document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]');
        if (chatroom) {
          ensureUIElements();
          switchTab(_savedActiveTab || 'live');
          startLayoutWatcher();
        } else if (kickAttempts < 30) {
          cleanup.setTimeout(tryInjectKick, 500);
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
      if (mcSignal?.aborted) return;
      attempts++;

      // First, try to find and patch the chat room component
      const chatRoom = findChatRoomComponent();
      if (chatRoom) {
        log('Found chat room component');
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
        cleanup.setTimeout(tryHook, 500);
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
  let _layoutWatcherStarted = false
  function startLayoutWatcher() {
    if (_layoutWatcherStarted) return
    _layoutWatcherStarted = true
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
    }), 'layout-observer').observe(
      document.getElementById('hs-mc-container')?.parentElement || document.body,
      { childList: true }
    )
  }

  // ============================================
  // STARTUP
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { signal: mcSignal });
  } else {
    init();
  }

  // SPA navigation handler — event-driven via early-inject-main.js history hooks
  let lastPath = location.pathname;
  let spaReinitializing = false;
  function handleMcNav() {
    if (location.pathname === lastPath) return
    lastPath = location.pathname;
    log('Navigation detected, reinitializing...');

    // Flag prevents layout watcher from re-injecting elements we're about to remove
    spaReinitializing = true;
    _layoutWatcherStarted = false;

    // Unsubscribe auto-YouTube from previous channel AND every per-channel
    // YT subscription so init() can cleanly re-subscribe each. Otherwise the
    // server sees duplicate youtube:subscribe events on every SPA navigation
    // and may re-deliver buffered messages.
    chrome.runtime.sendMessage({
      type: 'youtube_ws_unsubscribe', channelId: '__live_yt_auto__'
    }).catch(() => {})
    channelYtMessages.delete('__live_yt_auto__')
    for (const ch of config.channels) {
      if (typeof ch === 'string' || !ch.youtube) continue
      const link = youtubeLinks.get(ch.id)
      chrome.runtime.sendMessage({
        type: 'youtube_ws_unsubscribe',
        channelId: ch.id,
        url: ch.youtube,
        videoId: link?.videoId || ''
      }).catch(() => {})
      youtubeLinks.delete(ch.id)
    }

    // Close old read-only IRC to prevent zombie WebSocket reconnect loops
    // NOTE: auth IRC (for sending) is NOT killed here — it survives SPA navigation
    if (irc) {
      irc.destroy();
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
    // Disconnect all tracked observers from previous channel to prevent accumulation
    _timers.observers.forEach(o => { try { o.disconnect() } catch {} })
    _timers.observers.length = 0
    mcInitialized = false; // Allow init() to run again

    // Reset social tab state (stale on nav)
    feedLoaded = false;
    feedLoading = false;
    feedMessages = [];
    feedPage = 1;
    feedHasMore = true;
    feedLastFetch = 0;
    activeThread = null;
    _autoYtVideoId = null;
    // Reset feed scroll listener flag (new DOM element)
    const oldMsgs = document.getElementById('hs-mc-messages');
    if (oldMsgs) oldMsgs._hsFeedScroll = false;

    // Reinitialize after short delay
    cleanup.setTimeout(() => {
      spaReinitializing = false;
      init();
    }, 1000, 'spa-reinit');
  }

  // Primary: instant notification from MAIN world history hooks
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return
    if (event.data?.type === 'heatsync-nav') handleMcNav()
  }, { signal: mcSignal })

  // YouTube SPA navigation
  if (hostPlatform === 'yt') {
    document.addEventListener('yt-navigate-finish', () => handleMcNav(), { signal: mcSignal })
  }

  // Fallback: polling in case MAIN world script didn't load
  cleanup.setInterval(() => handleMcNav(), 5000, 'spa-nav-fallback');


}
})();