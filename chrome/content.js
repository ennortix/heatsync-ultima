// Content script - Inject into Twitch/Kick chat
(function() {
  'use strict';

// Debug logging - set to false for production
const HEATSYNC_DEBUG = false;
const log = HEATSYNC_DEBUG ? console.log.bind(console, '[heatsync]') : () => {};
const warn = HEATSYNC_DEBUG ? console.warn.bind(console, '[heatsync]') : () => {};

log('🚀 Script loaded on:', window.location.href);

const isKick = window.location.hostname.includes('kick.com');

// Chrome compatibility - use 'browser' namespace like Firefox
// Firefox uses native browser API

const API_URL = 'https://heatsync.org'; // Production server

// Native emote selectors for stackAdjacentOverlayEmotes — pre-joined to avoid per-call allocation
const NATIVE_EMOTE_SELECTORS = [
  'img.chat-line__message--emote',           // Classic Twitch
  'img[data-a-target="emote-name"]',         // Data attribute variant
  '.chat-image__container',                   // Container variant
  'img.chat-image',                           // Simple chat image
  '.emote-button img',                        // Button wrapped
  '[class*="emote"] img',                     // Any class containing "emote"
  'img[alt][src*="static-cdn.jtvnw.net"]',   // Twitch CDN emotes by URL
  'img[alt][src*="emoticons"]',              // Emoticons URL pattern
  'img[alt][src*="files.kick.com"]',         // Kick CDN emotes
  'img[alt][src*="kick-emote"]',             // Kick emote variant
].join(', ')

// Combined selector for stackAdjacentOverlayEmotes (heatsync + native, single querySelectorAll)
const COMBINED_EMOTE_SELECTOR = '.heatsync-emote-wrapper, ' + NATIVE_EMOTE_SELECTORS

// Lifecycle controller — abort() tears down ALL listeners, timers, observers
const lifecycle = new AbortController()
const { signal } = lifecycle
const _timers = { intervals: [], timeouts: [], observers: [] }
signal.addEventListener('abort', () => {
  _timers.intervals.forEach(clearInterval)
  _timers.timeouts.forEach(clearTimeout)
  _timers.observers.forEach(o => o.disconnect())
  chrome.runtime.onMessage.removeListener(_onMessageMain)
  chrome.runtime.onMessage.removeListener(_onMessageKickRelay)
  chrome.storage.onChanged.removeListener(_onStorageChanged)
})
window.addEventListener('pagehide', () => lifecycle.abort())

// Helpers matching old cleanup API but wired to AbortController
const cleanup = {
  setInterval(fn, ms) { const id = setInterval(fn, ms); _timers.intervals.push(id); return id },
  clearInterval(id) { clearInterval(id); const idx = _timers.intervals.indexOf(id); if (idx !== -1) _timers.intervals.splice(idx, 1) },
  setTimeout(fn, ms) {
    const id = setTimeout(() => {
      const idx = _timers.timeouts.indexOf(id)
      if (idx !== -1) _timers.timeouts.splice(idx, 1)
      fn()
    }, ms)
    _timers.timeouts.push(id)
    return id
  },
  addEventListener(target, event, handler) {
    target.addEventListener(event, handler, { signal })
  },
  trackObserver(obs) { _timers.observers.push(obs); return obs },
}

// HTML escaping for safe interpolation into innerHTML templates
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// React fiber walking — use shared-utils if available, inline fallback
const getFiber = window.HS?.getFiber || function(el) {
  if (!el) return null
  const key = Object.keys(el).find(k =>
    k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  )
  return key ? el[key] : null
}

// Track if extension context is still valid
let extensionContextValid = true;

// Cached allEmotes map — rebuilt only when emote data changes
let cachedAllEmotes = null
let allEmotesDirty = true
let emoteGeneration = 0

// Emote display size
let hsEmoteSize = 1
const HS_EMOTE_BASE_PX = 28
function applyEmoteSize() {
  document.documentElement.style.setProperty('--hs-emote-height', (HS_EMOTE_BASE_PX * hsEmoteSize) + 'px')
}

// Safe wrapper for chrome.runtime.sendMessage - handles context invalidation
async function safeSendMessage(message, _retry = 0) {
  if (!extensionContextValid) {
    warn(' Extension context invalidated - please refresh the page');
    return { success: false, error: 'Extension context invalidated' };
  }
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (err) {
    if (err.message?.includes('Extension context invalidated') ||
        err.message?.includes('context invalidated')) {
      extensionContextValid = false;
      warn(' ⚠️ Extension was reloaded - please refresh this page');
      showToast(t('common_extension_updated'), 'warning');
    } else if (_retry < 5 && (err.message?.includes('Receiving end does not exist') ||
               err.message?.includes('Could not establish connection'))) {
      // Service worker waking up — retry with backoff (200, 400, 800, 1600, 3200ms)
      await new Promise(r => setTimeout(r, 200 * Math.pow(2, _retry)));
      return safeSendMessage(message, _retry + 1);
    }
    throw err;
  }
}

// Auth token exchange: DOM-based (no postMessage token leak)
// Content script writes token to a hidden DOM element only it controls.
// MAIN-world scripts read the data attribute. No token broadcast on the wire.
const AUTH_ELEMENT_ID = '__heatsync_auth_bridge'
function getOrCreateAuthBridge() {
  let el = document.getElementById(AUTH_ELEMENT_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = AUTH_ELEMENT_ID
    el.style.display = 'none'
    ;(document.documentElement || document.body).appendChild(el)
  }
  return el
}

async function updateAuthBridge() {
  try {
    const stored = await chrome.storage.local.get(['auth_token', 'auth_token_encrypted'])
    const bridge = getOrCreateAuthBridge()
    bridge.dataset.token = stored.auth_token || (stored.auth_token_encrypted ? 'encrypted' : '')
    bridge.dataset.ready = '1'
  } catch {
    const bridge = getOrCreateAuthBridge()
    bridge.dataset.token = ''
    bridge.dataset.ready = '1'
  }
}
updateAuthBridge()

// Keep bridge in sync when token changes
function _onStorageChanged(changes) {
  if (changes.auth_token || changes.auth_token_encrypted) updateAuthBridge()
  if (changes.hs_emote_size != null) {
    hsEmoteSize = parseFloat(changes.hs_emote_size.newValue) || 1
    applyEmoteSize()
  }
}
chrome.storage.onChanged.addListener(_onStorageChanged)

// Non-sensitive postMessage handlers (no tokens)
cleanup.addEventListener(window, 'message', async (event) => {
  if (event.source !== window) return
  if (event.origin !== window.location.origin) return

  if (event.data?.type === 'heatsync-notifs-viewed') {
    safeSendMessage({ type: 'notifs_viewed' })
  }

  if (event.data?.type === 'heatsync-settings-changed' && event.data.settings) {
    log(' Settings changed via postMessage:', event.data.settings)
    applyUiSettings(event.data.settings)
  }

  // Native Twitch emotes from autocomplete-hook.js (MAIN world) — store for multichat
  if (event.data?.type === 'heatsync-native-emotes' && Array.isArray(event.data.emotes)) {
    const emotes = event.data.emotes
    log(' Received', emotes.length, 'native Twitch emotes from MAIN world')
    chrome.storage.local.set({ native_twitch_emotes: emotes })
  }
}, 'auth-message-handler');

// Inject CSS for emote hover effects (full emote background like website)
const style = document.createElement('style');
style.id = 'heatsync-emote-styles';
style.textContent = `
  /* Backfilled messages — slightly dimmed to distinguish from live */
  .heatsync-backfill {
    opacity: 0.85 !important;
    padding: 5px 20px !important;
    line-height: 20px !important;
    font-size: 13px !important;
  }
  .heatsync-backfill .chat-author__display-name {
    font-weight: 700 !important;
    font-size: 13px !important;
  }
  .heatsync-backfill .text-fragment {
    font-size: 13px !important;
    color: #fff !important;
  }

  /* Heatsync emote base styles */
  .heatsync-emote-wrapper {
    position: relative !important;
    display: inline-block !important;
    vertical-align: middle !important;
    line-height: 0 !important;
    font-size: 0 !important;
  }
  .heatsync-emote-wrapper > img {
    display: block !important;
    width: auto !important;
    height: var(--hs-emote-height, 28px) !important;
    max-width: none !important;
    max-height: none !important;
  }
  .heatsync-emote-wrapper.heatsync-overlay > img {
    height: auto !important;
  }

  /* Emote cursor */
  img[src*="cdn.7tv.app"],
  img[src*="cdn.betterttv.net"],
  img[src*="cdn.frankerfacez.com"] {
    cursor: pointer !important;
  }

  /* Blocked emotes - gray outline always visible */
  img[data-heatsync-state="blocked"] {
    outline: 2px solid #7f7f7f !important;
    outline-offset: -2px !important;
  }

  /* Blocked emotes - subtle gray outline normally */
  /* Outline is INSIDE the emote bounds using inset box-shadow (no layout shift) */
  .heatsync-emote-wrapper.emote-overlay-blocked > img.heatsync-emote {
    opacity: 0 !important;
    outline: 2px dashed #7f7f7f !important;
    outline-offset: -2px !important;
  }

  /* Blocked emotes - white outline when expanded (managing) */
  .heatsync-emote-stack.expanded .heatsync-emote-wrapper.emote-overlay-blocked > img.heatsync-emote {
    outline-color: #fff !important;
  }

  /* Emote preview tooltip - OUR ONLY TOOLTIP (minimal Chatterino style) */
  .heatsync-emote-preview {
    position: fixed !important;
    z-index: 5000 !important;
    pointer-events: none !important;
    background: #000000 !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 6px !important;
    box-shadow: 0 2px 8px rgba(0,0,0,0.6) !important;
    max-width: none !important;
    max-height: none !important;
    overflow: visible !important;
    display: none !important; /* Hidden by default, shown on hover */
  }

  .heatsync-emote-preview img {
    display: block !important;
    object-fit: contain !important;
    margin: 0 auto !important;
    image-rendering: pixelated !important;
  }

  .heatsync-emote-preview-name {
    color: #fff !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-align: center !important;
    margin-top: 4px !important;
    font-family: Inter, -apple-system, system-ui, sans-serif !important;
  }

  /* Stacked emotes preview - horizontal layout */
  .heatsync-stacked-preview {
    display: flex !important;
    flex-direction: row !important;
    gap: 12px !important;
    align-items: flex-start !important;
  }

  .heatsync-stacked-emote-item {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
  }

  .heatsync-stacked-emote-item img {
    display: block !important;
    max-width: 128px !important;
    max-height: 128px !important;
    width: auto !important;
    height: auto !important;
    object-fit: contain !important;
  }

  /* ============================================ */
  /* HEAT MESSAGE BORDERS (by heat tier)          */
  /* ============================================ */
  @keyframes hs-heat-breathe {
    0%, 100% { box-shadow: 0 0 20px rgba(255, 200, 0, 0.4); }
    50% { box-shadow: 0 0 30px rgba(255, 100, 0, 0.7), inset 0 0 30px rgba(255, 100, 0, 0.15); }
  }

  /* ============================================ */
  /* PROFILE CARD (username click)               */
  /* ============================================ */
  .hs-profile-card {
    position: fixed !important;
    z-index: 5000 !important;
    background: #808080 !important;
    border: 1px solid #404040 !important;
    border-radius: 0 !important;
    padding: 10px 6px 6px 6px !important;
    display: flex !important;
    align-items: flex-start !important;
    gap: 6px !important;
    font-family: 'Courier New', Courier, monospace !important;
    font-size: 12px !important;
    color: #fff !important;
    max-width: 400px !important;
    min-width: 200px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.6) !important;
    transition: none !important;
    cursor: grab !important;
  }
  .hs-profile-card:active { cursor: grabbing !important; }
  .hs-profile-card a, .hs-profile-card button { cursor: pointer !important; }

  .hs-pc-close {
    position: absolute !important;
    top: 2px !important;
    right: 4px !important;
    background: none !important;
    border: none !important;
    color: #fff !important;
    font-size: 14px !important;
    cursor: pointer !important;
    padding: 0 4px !important;
    line-height: 1 !important;
    font-family: monospace !important;
  }

  .hs-pc-avatar {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    min-height: 32px !important;
    border-radius: 0 !important;
    border: 1px solid #000 !important;
    object-fit: cover !important;
    flex-shrink: 0 !important;
  }

  .hs-pc-info {
    flex: 1 !important;
    min-width: 0 !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
  }

  .hs-pc-header-line,
  .hs-pc-stats-line,
  .hs-pc-actions {
    display: flex !important;
    align-items: center !important;
    gap: 4px !important;
    flex-wrap: wrap !important;
    line-height: 1.2 !important;
  }

  .hs-pc-platform {
    padding: 1px 2px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
    white-space: nowrap !important;
  }
  .hs-pc-platform.twitch {
    background: #9146ff !important;
    color: #fff !important;
    border: 1px solid #000 !important;
  }
  .hs-pc-platform.kick {
    background: #53fc18 !important;
    color: #000 !important;
    border: 1px solid #000 !important;
  }

  .hs-pc-name {
    font-size: 14px !important;
    font-weight: 600 !important;
    background: #fff !important;
    color: #000 !important;
    border: 1px solid #000 !important;
    padding: 2px 3px !important;
    border-radius: 0 !important;
    box-shadow: 0 1px 1px rgba(0,0,0,0.3) !important;
    white-space: nowrap !important;
  }

  .hs-pc-role {
    padding: 2px 3px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
    white-space: nowrap !important;
  }
  .hs-pc-role.admin { background: #ff0000 !important; color: #fff !important; border: 1px solid #000 !important; }
  .hs-pc-role.staff { background: #ff8800 !important; color: #000 !important; border: 1px solid #000 !important; }
  .hs-pc-role.partner { background: #000 !important; color: #fff !important; border: 1px solid #fff !important; }
  .hs-pc-role.affiliate { background: #404040 !important; color: #fff !important; border: 1px solid #fff !important; }

  .hs-pc-age {
    padding: 2px 3px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    background: #ffff00 !important;
    color: #000 !important;
    border: 1px solid #000 !important;
    letter-spacing: 0.3px !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
    white-space: nowrap !important;
  }

  .hs-pc-verified {
    display: inline-block !important;
    width: 14px !important;
    height: 14px !important;
    vertical-align: middle !important;
    margin-left: 2px !important;
    background: none !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
  .hs-pc-verified svg {
    width: 14px !important;
    height: 14px !important;
    display: block !important;
  }

  .hs-pc-live {
    background: #ff0000 !important;
    color: #fff !important;
    padding: 2px 3px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    border: 1px solid #000 !important;
    letter-spacing: 0.3px !important;
    box-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
    white-space: nowrap !important;
  }
  .hs-pc-live-kick {
    background: #53fc18 !important;
    color: #000 !important;
  }

  .hs-pc-subbed {
    background: #9146ff !important;
    color: #fff !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }

  .hs-pc-follows-you {
    background: #00aaaa !important;
    color: #fff !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }
  .hs-pc-following {
    background: #0099ff !important;
    color: #fff !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }
  .hs-pc-subs-you {
    background: #ff8700 !important;
    color: #000 !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }
  .hs-pc-followage {
    background: #00aa00 !important;
    color: #fff !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }
  .hs-pc-followage.hs-pc-nofollow {
    background: transparent !important;
    color: #808080 !important;
    border: 1px solid #000 !important;
  }
  .hs-pc-channel-follows {
    background: #daa520 !important;
    color: #000 !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }
  .hs-pc-sub-tenure {
    background: #e91e8c !important;
    color: #fff !important;
    padding: 2px 4px !important;
    border-radius: 0 !important;
    font-size: 10px !important;
    font-weight: 900 !important;
    letter-spacing: 0.3px !important;
    white-space: nowrap !important;
  }
  .hs-pc-bio {
    color: #fff !important;
    font-size: 11px !important;
    margin-top: 4px !important;
    max-width: 250px !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
  }

  .hs-pc-heat {
    background: #000 !important;
    border: 1px solid #ff8700 !important;
    font-weight: 900 !important;
    font-size: 12px !important;
    padding: 2px 6px !important;
    border-radius: 0 !important;
    white-space: nowrap !important;
  }

  .hs-pc-op, .hs-pc-re {
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    background: transparent !important;
    color: #fff !important;
    padding: 0 6px !important;
    height: 20px !important;
    border-radius: 0 !important;
    font-size: 11px !important;
    font-weight: 500 !important;
    white-space: nowrap !important;
    letter-spacing: 0.3px !important;
  }
  .hs-pc-op { border: 1px solid #ff0000 !important; }
  .hs-pc-re { border: 1px solid #00ffff !important; }
  .hs-pc-badge-op { color: #ff0000 !important; }
  .hs-pc-badge-re { color: #00ffff !important; }

  .hs-pc-followers {
    background: #000 !important;
    color: #fff !important;
    border: 1px solid #808080 !important;
    padding: 2px 6px !important;
    border-radius: 0 !important;
    font-size: 11px !important;
    font-weight: 700 !important;
    white-space: nowrap !important;
  }

  .hs-pc-actions {
    margin-top: 4px !important;
    gap: 6px !important;
  }

  .hs-pc-actions a {
    color: #ffff00 !important;
    font-size: 10px !important;
    text-decoration: none !important;
    font-family: monospace !important;
  }
  .hs-pc-actions a:hover { background: #fff !important; color: #000 !important; }

  .hs-pc-actions button {
    background: #808080 !important;
    color: #fff !important;
    border: 1px solid #808080 !important;
    border-radius: 0 !important;
    padding: 1px 6px !important;
    font-size: 10px !important;
    font-family: monospace !important;
    cursor: pointer !important;
    transition: none !important;
  }
  .hs-pc-actions button:hover { background: #fff !important; color: #000 !important; }

  .hs-pc-loading {
    color: #fff !important;
    font-style: italic !important;
    font-size: 11px !important;
    padding: 4px !important;
  }

  /* NUCLEAR: Kill ALL native Twitch tooltips on heatsync emotes */
  .heatsync-emote-wrapper,
  .heatsync-emote-wrapper * {
    pointer-events: none !important;
  }

  /* But wrapper itself needs pointer events for our hover */
  .heatsync-emote-wrapper {
    pointer-events: auto !important;
  }

  /* NUCLEAR: Hide ALL Twitch tooltips when our preview is active - but ONLY inside chat message area */
  body.heatsync-preview-active .chat-scrollable-area__message-container .tw-tooltip-layer,
  body.heatsync-preview-active .chat-scrollable-area__message-container .tw-tooltip,
  body.heatsync-preview-active .chat-scrollable-area__message-container [class*="balloon"],
  body.heatsync-preview-active .chat-scrollable-area__message-container [class*="Tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container [class*="tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container [role="tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container .ScTokenTooltip-sc-,
  body.heatsync-preview-active .chat-scrollable-area__message-container [data-a-target*="tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container [class*="emote-tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container [class*="chat-image-tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container .Layout-sc-1xcs6mc-0[role="tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container [class*="ScTokenTooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container .InjectLayout-sc-1i43xsx-0[role="tooltip"],
  body.heatsync-preview-active .chat-scrollable-area__message-container div[data-popper-placement] {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    width: 0 !important;
    height: 0 !important;
    overflow: hidden !important;
    position: absolute !important;
    left: -9999px !important;
  }

  /* Scoped: only hide tooltip layer inside chat area when our preview is active */
  body.heatsync-preview-active .chat-scrollable-area__message-container .tw-tooltip-layer,
  body.heatsync-preview-active .chat-scrollable-area__message-container .tw-tooltip-layer * {
    display: none !important;
    visibility: hidden !important;
  }

  /* Suppress ALL hover backgrounds on heatsync emotes */
  .heatsync-emote-wrapper:hover,
  .heatsync-emote-wrapper *:hover,
  .chat-image__container:has(.heatsync-emote-wrapper):hover,
  .chat-line__message--emote-button:has(.heatsync-emote-wrapper):hover,
  [class*="emote"]:has(.heatsync-emote-wrapper):hover {
    background: transparent !important;
    background-color: transparent !important;
  }


  /* Wide emotes in chat input - force left alignment and no clipping */
  .wysiwig-chat-input-emote {
    overflow: visible !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
  }

  .wysiwig-chat-input-emote .chat-image__container {
    overflow: visible !important;
    overflow-x: visible !important;
    overflow-y: visible !important;
    display: inline-flex !important;
    justify-content: flex-start !important;
    align-items: center !important;
    width: max-content !important;
  }

  /* Wide emotes: span/container must expand to fit image, left-aligned */
  .wysiwig-chat-input-emote {
    width: max-content !important;
    min-width: max-content !important;
    display: inline-block !important;
    overflow: visible !important;
    text-align: left !important;
  }
  .wysiwig-chat-input-emote img[data-heatsync-fixed="true"] {
    display: block !important;
    max-width: none !important;
    width: auto !important;
    height: 28px !important;
    margin: 0 !important;
    padding: 0 !important;
    transform: none !important;
    position: static !important;
    object-fit: contain !important;
    object-position: 0% 50% !important;
    float: none !important;
  }

  /* Hide the emote name label div inside input emotes (adds invisible height) */
  .wysiwig-chat-input-emote > div:last-child {
    display: none !important;
  }

  /* Loading indicator with coggers */
  #heatsync-loading-indicator {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: none; /* Hidden by default, shown via JS */
    align-items: center;
    gap: 8px;
    background: #000;
    border: 1px solid #fff;
    border-radius: 0;
    padding: 6px 14px;
    font: bold 12px monospace;
    color: #fff;
    z-index: 5000;
    animation: heatsync-fade-in 0.2s ease-out;
  }
  @keyframes heatsync-fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  #heatsync-loading-indicator img {
    width: 28px;
    height: 28px;
  }
  #heatsync-loading-indicator .loading-text {
    color: #808080;
  }

  /* Mention highlight - Chatterino-style dark red background on entire message */
  .chat-line__message.hs-mentioned,
  .hs-mentioned,
  div.hs-mentioned,
  [class*="chat-line"].hs-mentioned,
  .chat-scrollable-area__message-container .hs-mentioned {
    background-color: #7f0000 !important;
    background: #7f0000 !important;
  }

  /* Emojis — double-size, stackable as overlay base */
  .heatsync-emoji {
    font-size: 2em !important;
    line-height: 1 !important;
    vertical-align: middle !important;
    display: inline-block !important;
  }

  /* Emote overlay stacking (7TV zero-width emotes) */
  .heatsync-emote-stack {
    display: inline-flex !important;
    position: relative !important;
    vertical-align: middle !important;
    align-items: center !important;
    justify-content: center !important;
    overflow: visible !important;
  }

  /* Force overflow visible on Twitch emote containers inside stacks */
  .heatsync-emote-stack .chat-line__message--emote-button,
  .heatsync-emote-stack .chat-line__message--emote-button *,
  .heatsync-emote-stack [class*="emote-button"],
  .heatsync-emote-stack [class*="emote-button"] * {
    overflow: visible !important;
  }

  /* Base emote in stack - sets the size */
  /* Note: collapse button (×) is first-child, so use :not(.heatsync-overlay) for base */
  .heatsync-emote-stack > .heatsync-emote-wrapper:not(.heatsync-overlay) {
    position: relative !important;
    z-index: 1 !important;
  }

  /* Overlay emotes - absolute positioned, centered on base */
  .heatsync-emote-stack > .heatsync-overlay,
  .heatsync-emote-stack > .heatsync-emote-wrapper.heatsync-overlay {
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: auto !important;
    height: auto !important;
    z-index: 2 !important;
    /* pointer-events: auto so wide overlays can be hovered directly */
    pointer-events: auto !important;
  }

  /* Overlay images keep native 1x size, no constraints */
  .heatsync-emote-stack > .heatsync-overlay img,
  .heatsync-emote-stack > .heatsync-emote-wrapper.heatsync-overlay img {
    width: auto !important;
    height: auto !important;
    max-width: none !important;
    max-height: none !important;
    object-fit: none !important;
  }

  /* Emote hover color status indicator via ::before */
  .heatsync-emote-wrapper::before {
    content: '' !important;
    position: absolute !important;
    inset: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
    z-index: 1 !important;
    transition: opacity 0.1s !important;
  }
  .heatsync-emote-wrapper:hover::before {
    opacity: 1 !important;
  }
  .heatsync-emote-wrapper:hover > img {
    visibility: hidden !important;
  }
  .heatsync-emote-wrapper.emote-overlay-owned::before { background: #00ff00 !important; }
  .heatsync-emote-wrapper.emote-overlay-global::before { background: #808080 !important; }
  .heatsync-emote-wrapper.emote-overlay-unadded::before { background: #ff8700 !important; }
  .heatsync-emote-wrapper.emote-overlay-blocked::before { background: #ff0000 !important; }

  /* ============================================ */
  /* EMOTE STACK EXPAND/COLLAPSE (website parity) */
  /* ============================================ */

  /* Clickable indicator on collapsed stacks */
  .heatsync-emote-stack {
    cursor: pointer !important;
  }

  /* COLLAPSED STACK HOVER - highlight ALL emotes instantly when hovering anywhere on stack */
  /* Method 1: Direct stack hover */
  .heatsync-emote-stack:not(.expanded):hover .heatsync-emote-wrapper::before {
    opacity: 1 !important;
  }
  .heatsync-emote-stack:not(.expanded):hover .heatsync-emote-wrapper > img.heatsync-emote {
    opacity: 0 !important;
  }
  .heatsync-emote-stack:not(.expanded):hover .heatsync-emote-wrapper > img:not(.heatsync-emote) {
    opacity: 0 !important;
  }
  /* Method 2: Hover on wide overlay that extends beyond stack bounds - use :has() */
  .heatsync-emote-stack:not(.expanded):has(.heatsync-emote-wrapper:hover) .heatsync-emote-wrapper::before {
    opacity: 1 !important;
  }
  .heatsync-emote-stack:not(.expanded):has(.heatsync-emote-wrapper:hover) .heatsync-emote-wrapper > img {
    opacity: 0 !important;
  }

  /* Expanded state - spread emotes horizontally */
  .heatsync-emote-stack.expanded {
    display: inline-flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    align-items: center !important;
    gap: 6px !important;
    background: #000000 !important;
    border-radius: 0 !important;
    padding: 4px 8px !important;
  }

  /* When expanded, overlays become relative (side-by-side) */
  .heatsync-emote-stack.expanded > .heatsync-overlay,
  .heatsync-emote-stack.expanded > .heatsync-emote-wrapper.heatsync-overlay {
    position: relative !important;
    top: auto !important;
    left: auto !important;
    transform: none !important;
    pointer-events: auto !important;
  }


  /* Collapse button (×) - hidden by default */
  .heatsync-stack-collapse {
    display: none !important;
  }
  /* Show collapse button when expanded */
  .heatsync-emote-stack.expanded .heatsync-stack-collapse {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 16px !important;
    height: 16px !important;
    background: rgba(255,255,255,0.12) !important;
    color: #fff !important;
    border-radius: 50% !important;
    font-size: 12px !important;
    cursor: pointer !important;
    margin-right: 4px !important;
    flex-shrink: 0 !important;
    z-index: 10 !important;
    pointer-events: auto !important;
  }
  .heatsync-emote-stack.expanded .heatsync-stack-collapse:hover {
    background: #fff !important;
    color: #000 !important;
  }

  /* Block all button (⊘) - hidden by default */
  .heatsync-stack-block-all {
    display: none !important;
  }
  /* Show block-all button when expanded */
  .heatsync-emote-stack.expanded .heatsync-stack-block-all {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 16px !important;
    height: 16px !important;
    background: #7f0000 !important;
    color: #fff !important;
    border-radius: 50% !important;
    font-size: 10px !important;
    cursor: pointer !important;
    margin-left: 4px !important;
    flex-shrink: 0 !important;
    z-index: 10 !important;
    pointer-events: auto !important;
  }
  .heatsync-emote-stack.expanded .heatsync-stack-block-all:hover {
    background: #fff !important;
    color: #000 !important;
  }

  /* Username mention links — hover underline */
  .hs-username-colored,
  .hs-mention-colored {
    text-decoration: none !important;
    transition: text-decoration 0.1s !important;
  }
  .hs-username-colored:hover,
  .hs-mention-colored:hover {
    text-decoration: underline !important;
  }

  /* Muted users — grey username, content stripped by JS */
  .hs-user-muted .chat-author__display-name,
  .hs-user-muted [data-a-target="chat-message-username"],
  .hs-user-muted button.inline.font-bold {
    color: #808080 !important;
    background: none !important;
    -webkit-background-clip: unset !important;
    -webkit-text-fill-color: #808080 !important;
    animation: none !important;
    text-shadow: none !important;
  }

  /* Third-party cosmetic badges (BTTV/FFZ/7TV) */
  .hs-cosmetic-badge {
    display: inline-block;
    width: 18px;
    height: 18px;
    vertical-align: middle;
    margin-right: 2px;
  }
`;
document.head.appendChild(style);
log(' 🎨 CSS injected for emote hover effects');

// =============================================================================
// EMOTE HOVER OVERLAY (solid colored rectangle on hover)
// Uses event delegation - survives React re-renders
// =============================================================================

let activeOverlay = null;

function isEmoteImage(el) {
  if (el.tagName !== 'IMG') return false;
  if (el.classList.contains('pfp') || el.classList.contains('cluster-pfp-img')) return false;
  if (el.classList.contains('hs-mc-badge-img')) return false;
  if (el.closest('#emote-picker-btn')) return false;
  const src = el.src || '';
  // Exclude icon images (not emotes)
  if (src.includes('/icons/')) return false;
  // Exclude FFZ badge images (room mod/vip badges use cdn.frankerfacez.com/room-badge/)
  if (src.includes('cdn.frankerfacez.com/room-badge/')) return false;
  return src.includes('cdn.7tv.app') ||
         src.includes('cdn.betterttv.net') ||
         src.includes('cdn.frankerfacez.com') ||
         src.includes('heatsync.org') ||
         src.includes('static-cdn.jtvnw.net/emoticons');
}

function getEmoteColor(img) {
  const state = img.dataset?.heatsyncState;
  if (state === 'unadded') return '#ff8700';
  if (state === 'blocked') return '#ff0000';
  // Fallback: read wrapper class from website
  const wrapper = img.closest?.('.emote-hover-wrapper');
  if (wrapper?.classList.contains('neutral')) return '#ff8700';
  if (wrapper?.classList.contains('blocked')) return '#ff0000';
  // Default: green for usable (owned + global + channel)
  return '#00ff00';
}

function showEmoteOverlay(img) {
  if (activeOverlay) activeOverlay.remove();

  // Use the rendered content dimensions (excludes CSS padding/border)
  // For <img>, clientWidth/Height includes padding, so subtract it
  const rect = img.getBoundingClientRect();
  const cs = getComputedStyle(img);
  const padT = parseFloat(cs.paddingTop) || 0;
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;
  const bT = parseFloat(cs.borderTopWidth) || 0;
  const bL = parseFloat(cs.borderLeftWidth) || 0;
  const bR = parseFloat(cs.borderRightWidth) || 0;
  const bB = parseFloat(cs.borderBottomWidth) || 0;
  const contentW = rect.width - padL - padR - bL - bR;
  const contentH = rect.height - padT - padB - bT - bB;
  const contentX = rect.left + padL + bL;
  const contentY = rect.top + padT + bT;
  const color = getEmoteColor(img);

  const overlay = document.createElement('div');
  overlay.className = 'heatsync-hover-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: ${contentY}px;
    left: ${contentX}px;
    width: ${contentW}px;
    height: ${contentH}px;
    background: ${color};
    pointer-events: none;
    z-index: 4999;
  `;

  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Store reference on img for cleanup
  img._heatsyncOverlay = overlay;
}

function hideEmoteOverlay(img) {
  if (img._heatsyncOverlay) {
    img._heatsyncOverlay.remove();
    img._heatsyncOverlay = null;
  }
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}

// Event delegation for emote hover
document.addEventListener('mouseover', (e) => {
  if (isEmoteImage(e.target)) {
    showEmoteOverlay(e.target);
  }
}, { capture: true, signal });

document.addEventListener('mouseout', (e) => {
  if (isEmoteImage(e.target)) {
    hideEmoteOverlay(e.target);
  }
}, { capture: true, signal });

// Fallback: mousemove killswitch — if mouse isn't over an emote img, nuke the overlay
document.addEventListener('mousemove', (e) => {
  if (!activeOverlay) return;
  if (!isEmoteImage(e.target)) {
    activeOverlay.remove();
    activeOverlay = null;
  }
}, { signal });

// Emote preloading removed — browser caches images natively after first render.
// Firefox ORB blocks moz-extension:// origin preloads anyway.

// UI hiding settings (Chatterino-style)
let uiHidingStyle = null;

// =============================================================================
// SIMPLE HEADER/LEADERBOARD HIDING
// Dead simple CSS injection - no React patching complexity
// =============================================================================

let headerHidingStyle = null;

function enableHeaderHiding() {
  if (headerHidingStyle) return; // Already enabled

  log(' Enabling header hiding...');

  headerHidingStyle = document.createElement('style');
  headerHidingStyle.id = 'heatsync-hide-header-css';

  // Target chat header AND leaderboard/banners
  headerHidingStyle.textContent = `
    /* Main chat header - "Stream Chat" bar */
    .stream-chat-header,
    [class*="stream-chat-header"],
    [data-a-target="chat-room-header-label"],
    [class*="chat-header"],
    [class*="ChatHeader"] {
      display: none !important;
    }

    /* Channel leaderboard - the marquee ticker at top of chat */
    .channel-leaderboard,
    [class*="channel-leaderboard"],
    [class*="marquee-animation"],
    [class*="LeaderboardFlex"],
    [class*="leaderboard-flex"] {
      display: none !important;
    }

    /* Pinned cheers, community highlights, hype trains — intentionally NOT hidden.
       These are live event UIs that users and streamers rely on. */
  `;

  document.head.appendChild(headerHidingStyle);
  log(' Header hiding CSS injected');
}

function disableHeaderHiding() {
  if (!headerHidingStyle) return; // Already disabled

  log(' Disabling header hiding...');

  headerHidingStyle.remove();
  headerHidingStyle = null;
  log(' Header hiding CSS removed');
}

// =============================================================================
// END HEADER HIDING
// =============================================================================

function applyUiSettings(settings) {
  if (!settings) return;

  log(' Applying UI hiding settings:', settings);

  // Remove existing UI hiding style
  if (uiHidingStyle) {
    uiHidingStyle.remove();
    uiHidingStyle = null;
  }

  // Also remove any old hide-header style
  document.getElementById('heatsync-hide-header')?.remove();

  // Build CSS for enabled settings
  const rules = [];

  // Popout: always hide (no collapse arrow, bar is useless)
  // Normal: default to hidden (collapse arrow is separate DOM element, survives)
  // Only show header if user explicitly set hideChatHeader to false
  const isPopout = /^\/(popout|embed)\//.test(location.pathname)
  if (isPopout || settings.hideChatHeader !== false) {
    enableHeaderHiding();
  } else {
    disableHeaderHiding();
  }

  if (settings.hideStreamTitle) {
    // Twitch stream info/title bar
    rules.push('[data-a-target="stream-title"] { display: none !important; }');
    rules.push('.channel-info-content { display: none !important; }');
    // Kick
    rules.push('.stream-username-wrapper { display: none !important; }');
  }

  if (settings.hideViewerCount) {
    // Twitch viewer count
    rules.push('[data-a-target="animated-channel-viewers-count"] { display: none !important; }');
    rules.push('.tw-animated-number { display: none !important; }');
    // Kick
    rules.push('.viewer-count { display: none !important; }');
  }

  if (rules.length > 0) {
    uiHidingStyle = document.createElement('style');
    uiHidingStyle.id = 'heatsync-ui-hiding';
    uiHidingStyle.textContent = rules.join('\n');
    document.head.appendChild(uiHidingStyle);
    log(' Applied UI hiding CSS:', rules.length, 'rules');
  }

  // Cosmetics toggle
  if (settings.showCosmetics === false) {
    cosmeticsEnabled = false
    // Remove existing cosmetic badges from DOM
    document.querySelectorAll('.hs-cosmetic-badge').forEach(b => b.remove())
    document.querySelectorAll('[data-hs-paint-applied]').forEach(el => {
      el.style.removeProperty('background-image')
      el.style.removeProperty('background-size')
      el.style.removeProperty('-webkit-background-clip')
      el.style.removeProperty('-webkit-text-fill-color')
      el.style.removeProperty('background-clip')
      el.style.removeProperty('filter')
      delete el.dataset.hsPaintApplied
    })
  } else {
    cosmeticsEnabled = true
  }
}

// Load and apply UI settings on startup
(async function loadUiSettings() {
  try {
    const stored = await chrome.storage.local.get('ui_settings');
    const settings = stored.ui_settings || {}
    // Always run applyUiSettings so popout auto-hides header even with no stored settings
    applyUiSettings(settings)
  } catch (err) {
    warn(' Failed to load UI settings:', err);
  }
})();

// Load emote size setting
;(async function loadEmoteSize() {
  try {
    const stored = await chrome.storage.local.get('hs_emote_size')
    if (stored.hs_emote_size != null) {
      hsEmoteSize = parseFloat(stored.hs_emote_size) || 1
    }
    applyEmoteSize()
  } catch { applyEmoteSize() }
})()

// Loading indicator with coggers emote
const COGGERS_URL = chrome.runtime.getURL('COGGERS-1x.webp');
let loadingIndicator = null;

function showLoadingStatus(text) {
  log(' showLoadingStatus:', text);
  if (!document.body) {
    warn(' No document.body yet');
    return;
  }
  // Reuse existing element if script reinitialized
  if (!loadingIndicator) {
    loadingIndicator = document.getElementById('heatsync-loading-indicator');
  }
  if (!loadingIndicator) {
    loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'heatsync-loading-indicator';
    loadingIndicator.innerHTML = `
      <span class="loading-text"></span>
      <img src="${COGGERS_URL}" alt="COGGERS">
    `;
    document.body.appendChild(loadingIndicator);
    log(' Loading indicator created');
  }
  loadingIndicator.querySelector('.loading-text').textContent = text;
  loadingIndicator.style.display = 'flex';
}

function hideLoadingStatus() {
  // Also check DOM directly in case script reinitialized
  if (!loadingIndicator) {
    loadingIndicator = document.getElementById('heatsync-loading-indicator');
  }
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
}

let emoteInventory = [];
let globalEmotes = [];
let channelEmotes = []; // Channel owner's emotes (for THIS tab's channel only)
let currentChannelOwner = null; // Track channel owner for emote filtering

// Get channel name from current page URL
function getPageChannel() {
  const url = window.location.href;
  if (url.includes('twitch.tv')) {
    const match = url.match(/\/popout\/([^\/]+)\/chat/) || url.match(/twitch\.tv\/([^\/\?]+)/);
    const ch = match ? match[1]?.toLowerCase() : null;
    const excluded = ['directory', 'settings', 'videos', 'moderator', 'subscriptions', 'search', 'downloads', 'inventory'];
    return (ch && !excluded.includes(ch)) ? ch : null;
  }
  if (url.includes('kick.com')) {
    // Handle popout/embed URLs: /popout/channel/chat or /embed/channel/chat
    const popoutMatch = url.match(/kick\.com\/(?:popout|embed)\/([^\/\?]+)/);
    if (popoutMatch) return popoutMatch[1]?.toLowerCase() || null;
    const match = url.match(/kick\.com\/([^\/\?]+)/);
    const ch = match ? match[1]?.toLowerCase() : null;
    const kickExcluded = ['categories', 'following', 'settings', 'browse', 'search', 'dashboard', 'category', 'password', 'popout', 'embed'];
    return (ch && !kickExcluded.includes(ch)) ? ch : null;
  }
  return null;
}
let _mentionRegex = null; // Cached mention regex (rebuilt on username change)
let _mentionUser = null; // Username the regex was built for
let blockedEmotes = new Set();
let mutedUsers = new Set();
let blockedUsers = new Set();
let followedByCurrentUser = new Set();
let pendingEmoteBroadcasts = new Map(); // "username:emoteName" -> { ...emoteData, addedAt }
// Secondary index: username (lowercase) -> Set of emote names (for O(1) lookup in processMessage)
const pendingBroadcastsByUser = new Map()
function _addBroadcast(key, data) {
  pendingEmoteBroadcasts.set(key, data)
  const colon = key.indexOf(':')
  if (colon !== -1) {
    const user = key.slice(0, colon)
    const emoteName = key.slice(colon + 1)
    if (!pendingBroadcastsByUser.has(user)) pendingBroadcastsByUser.set(user, new Map())
    pendingBroadcastsByUser.get(user).set(emoteName, data)
  }
}
function _deleteBroadcast(key) {
  pendingEmoteBroadcasts.delete(key)
  const colon = key.indexOf(':')
  if (colon !== -1) {
    const user = key.slice(0, colon)
    const emoteName = key.slice(colon + 1)
    const userMap = pendingBroadcastsByUser.get(user)
    if (userMap) {
      userMap.delete(emoteName)
      if (userMap.size === 0) pendingBroadcastsByUser.delete(user)
    }
  }
}
cleanup.setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of pendingEmoteBroadcasts) {
    if (now - entry.addedAt > 30000) _deleteBroadcast(key)
  }
}, 30000);
let pendingOperations = new Set(); // Track in-flight operations to prevent double-clicks
let pendingRemovals = new Set(); // Emote names pending removal — suppress inventory_update re-adds
// O(1) lookup sets — rebuilt when arrays change (via allEmotesDirty flag)
let inventoryHashSet = new Set();
let cachedEmotesByHash = new Map(); // hash → emote, O(1) lookup for hover previews
let inventoryNameSet = new Set();
let globalNameSet = new Set();

// Toast — use shared-utils if available, inline fallback
const showToast = window.HS?.showToast || function(msg) {
  const el = document.getElementById('heatsync-toast')
  if (el) el.remove()
  const t = document.createElement('div')
  t.id = 'heatsync-toast'
  t.textContent = msg
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#000;color:#fff;border:1px solid #fff;padding:6px 14px;font:bold 12px monospace;z-index:10001;border-radius:0;'
  document.body.appendChild(t)
  cleanup.setTimeout(() => t.remove(), 2500)
}

// If on heatsync site, send auth token to background
const isHeatsyncSite =
  window.location.hostname === 'heatsync.org' ||
  window.location.hostname.endsWith('.heatsync.org');

if (isHeatsyncSite) {
  log(' 🔍 Content script running on', window.location.hostname);

  // Check URL for auth_token parameter (from OAuth redirect)
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('auth_token');

  if (urlToken && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(urlToken)) {
    log(' ✓ Found auth_token in URL, sending to background (length:', urlToken.length, ')');
    safeSendMessage({ type: 'set_auth_token', token: urlToken }).catch(() => {});
    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Website handles its own emotes/chat — don't run Twitch/Kick handlers here
  return
}

// Normalize emote URL - fix URLs that got saved with wrong base domain
function normalizeEmoteUrl(url) {
  if (!url) return url;
  // Fix URLs that were resolved to wrong domain (e.g., twitch.tv, kick.com)
  const wrongDomains = ['twitch.tv', 'kick.com', 'localhost'];
  for (const domain of wrongDomains) {
    if (url.includes(domain) && (url.includes('/emotes/') || url.includes('/uploads/'))) {
      // Extract the path after /emotes/ or /uploads/
      const match = url.match(/\/(emotes|uploads)\/.+$/);
      if (match) {
        return `${API_URL}${match[0]}`;
      }
    }
  }
  // If relative URL, add API_URL
  if (url.startsWith('/emotes/') || url.startsWith('/uploads/')) {
    return `${API_URL}${url}`;
  }
  return url;
}

// Request inventory - try storage first, then message
async function loadInventory() {
  const loadStart = performance.now();
  showLoadingStatus('loading emotes...');

  // Try storage first (instant access)
  try {
    const storageStart = performance.now();
    const stored = await chrome.storage.local.get(['global_emotes', 'emote_inventory', 'blocked_emotes', 'channel_emotes_map', 'blocked_users']);
    log(` ⏱️ Storage read took ${(performance.now() - storageStart).toFixed(0)}ms`);

    if (stored.global_emotes && stored.global_emotes.length > 0) {
      globalEmotes = stored.global_emotes;
      // Normalize URLs when loading from storage
      emoteInventory = (stored.emote_inventory || []).map(e => ({
        ...e,
        url: normalizeEmoteUrl(e.url)
      }));
      blockedEmotes = new Set(stored.blocked_emotes || []);
      if (stored.blocked_users) blockedUsers = new Set(stored.blocked_users);
      // Load only THIS channel's emotes from the per-channel map
      const myChannel = getPageChannel();
      const myEmotes = myChannel && stored.channel_emotes_map ? (stored.channel_emotes_map[myChannel] || []) : [];
      channelEmotes = myEmotes.map(e => ({
        ...e,
        url: normalizeEmoteUrl(e.url)
      }));
      currentChannelOwner = myChannel;

      log(` ✅ Loaded from storage in ${(performance.now() - loadStart).toFixed(0)}ms:`, emoteInventory.length, 'personal,', globalEmotes.length, 'global,', channelEmotes.length, 'channel');
      hideLoadingStatus();
      debouncedProcessExistingMessages();
      updateEmoteBridge(); // Update Twitch autocomplete hook
      return;
    }
  } catch (err) {
    warn(' Storage read failed:', err);
  }

  // Fallback: message passing with retry (service worker will wait for init)
  log(' Storage empty, trying message passing...');
  showLoadingStatus('fetching emotes...');
  let attempts = 0;
  const maxAttempts = 10; // More retries for MV3 service worker wakeup
  const baseDelay = 300;

  while (attempts < maxAttempts) {
    try {
      showLoadingStatus(`loading emotes... (${attempts + 1}/${maxAttempts})`);
      const response = await safeSendMessage({ type: 'get_inventory' });

      if (response) {
        emoteInventory = response.emotes || [];
        globalEmotes = response.globalEmotes || [];
        blockedEmotes = new Set(response.blocked || []);
        window.postMessage({ type: 'heatsync-blocked-sync', hashes: Array.from(blockedEmotes) }, location.origin);

        // Fetch followed users for profile card
        safeSendMessage({ type: 'get_followed_users' }).then(r => {
          if (r?.users) followedByCurrentUser = new Set(r.users);
        }).catch(() => {});

        // Fetch bulk BTTV/FFZ badges
        safeSendMessage({ type: 'get_bulk_badges' }).then(resp => {
          if (resp?.bttvBadges) bttvBadgeMap = new Map(Object.entries(resp.bttvBadges))
          if (resp?.ffzBadges) ffzBadgeMap = new Map(Object.entries(resp.ffzBadges))
          log(' Initial cosmetics: BTTV', bttvBadgeMap.size, 'FFZ', ffzBadgeMap.size)
          reapplyBadgesToExistingMessages()
        }).catch(() => {})

        // Fetch HeatSync API colors for followed users + current user
        safeSendMessage({ type: 'get_follow_history' }).then(resp => {
          if (resp?.colors && typeof resp.colors === 'object') {
            for (const [login, color] of Object.entries(resp.colors)) {
              if (color) heatsyncColorMap.set(login.toLowerCase(), color)
            }
          }
          // Also load current user's own HeatSync color from storage
          chrome.storage.local.get('user_info').then(data => {
            if (data.user_info?.color && data.user_info?.username) {
              heatsyncColorMap.set(data.user_info.username.toLowerCase(), data.user_info.color)
            }
            log(' HeatSync colors loaded:', heatsyncColorMap.size)
            applyHeatsyncColorsToExisting()
          }).catch(() => {
            log(' HeatSync colors loaded:', heatsyncColorMap.size)
            applyHeatsyncColorsToExisting()
          })
        }).catch(() => {})

        log(' Received inventory via message:', emoteInventory.length, 'personal,', globalEmotes.length, 'global');

        if (globalEmotes.length > 0) {
          log(' Sample global emotes:', globalEmotes.slice(0, 5).map(e => e.name));
          hideLoadingStatus();
          debouncedProcessExistingMessages();
          updateEmoteBridge(); // Update Twitch autocomplete hook
          return;
        }

      }
    } catch (err) {
    }

    attempts++;
    if (attempts < maxAttempts) {
      // Exponential backoff: 300, 450, 675, 1012, etc (capped at 2s)
      const delay = Math.min(baseDelay * Math.pow(1.5, attempts - 1), 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  hideLoadingStatus();
  log(' Will receive emotes when service worker broadcasts them');

  // Safety net: if emotes arrive late via broadcast, we need to ensure existing messages get processed.
  // Set up a one-shot listener that fires processExistingMessages on first emote data arrival.
  const _lateEmoteHandler = (msg) => {
    if (msg.type === 'inventory_update' || msg.type === 'global_emotes_update') {
      chrome.runtime.onMessage.removeListener(_lateEmoteHandler)
      // Emote data just arrived — make sure observer is running and reprocess
      watchForNewMessages()
      setupUsernameColoringObserver()
    }
  }
  chrome.runtime.onMessage.addListener(_lateEmoteHandler)
  // Also clean up if emotes never come (don't leak listener forever)
  cleanup.setTimeout(() => chrome.runtime.onMessage.removeListener(_lateEmoteHandler), 120000)
}

// Create emote bridge BEFORE loading inventory so updateEmoteBridge() works
if (window.location.hostname.includes('twitch.tv')) {
  injectTwitchAutocompleteHook();
}

loadInventory();

// Listen for updates from background script
// Named function + remove-before-add prevents listener stacking on extension reload
function _onMessageMain(message) {
  // Validate message
  if (!message || typeof message !== 'object' || !message.type) {
    warn(' Invalid message received:', message);
    return;
  }

  log(' Received message:', message.type, message);

  try {
  switch(message.type) {
    case 'loading_status':
      if (message.done) {
        hideLoadingStatus();
      } else {
        showLoadingStatus(message.text);
      }
      break;

    case 'inventory_update': {
      // Normalize URLs when receiving inventory update
      let newInv = (message.emotes || []).map(e => ({
        ...e,
        url: normalizeEmoteUrl(e.url)
      }));
      // Filter out emotes pending removal (race: fetchEmoteInventory runs before DELETE completes)
      if (pendingRemovals.size > 0) {
        const serverNames = new Set(newInv.map(e => e.name));
        // Clear pendingRemovals for emotes confirmed gone from server
        for (const name of pendingRemovals) {
          if (!serverNames.has(name)) pendingRemovals.delete(name);
        }
        // Filter any still-pending (server hasn't caught up yet)
        if (pendingRemovals.size > 0) {
          newInv = newInv.filter(e => !pendingRemovals.has(e.name));
        }
      }
      emoteInventory = newInv;
      allEmotesDirty = true
      emoteGeneration++
      _tabEmoteMapDirty = true
      log(' Inventory updated:', emoteInventory.length, 'emotes');
      log(' Sample inventory:', emoteInventory.slice(0, 3).map(e => ({ name: e.name, hash: e.hash?.substring(0, 8) })));


      // If on own channel, sync channel emotes with inventory (remove stale ones)
      // Channel emotes for owner = their personal inventory, so keep them in sync
      if (channelEmotes.length > 0) {
        const inventoryHashes = new Set(emoteInventory.map(e => e.hash));
        const before = channelEmotes.length;
        channelEmotes = channelEmotes.filter(e => inventoryHashes.has(e.hash));
        if (channelEmotes.length !== before) {
          log(' 🔄 Synced channel emotes with inventory:', before, '→', channelEmotes.length);
        }
      }

      debouncedProcessExistingMessages();
      updateEmoteBridge(); // Update Twitch autocomplete hook
      // Notify MAIN world (heatsync-button.js) to refresh panel if open
      window.postMessage({ type: 'heatsync-inventory-update', count: emoteInventory.length }, location.origin);
      break;
    }

    case 'emote_added':
      // Emote was successfully added to your set
      pendingRemovals.delete(message.emoteName);
      allEmotesDirty = true
      emoteGeneration++
      log(' ✅ Emote added to your set:', message.emoteName);
      emoteInventory.push({
        name: message.emoteName,
        hash: message.hash,
        url: message.url
      });
      updateEmoteState(message.hash, message.emoteName, 'added');
      updateEmoteBridge(); // Update Twitch autocomplete hook
      // Notify MAIN world (heatsync-button.js) to refresh panel if open
      window.postMessage({ type: 'heatsync-inventory-update', count: emoteInventory.length }, location.origin);
      break;

    case 'emote_removing':
      // Background is about to remove this emote — suppress it in new messages immediately
      pendingRemovals.add(message.emoteName);
      emoteInventory = emoteInventory.filter(e => e.name !== message.emoteName);
      allEmotesDirty = true
      _tabEmoteMapDirty = true
      log(' ⏳ Emote removal starting:', message.emoteName);
      break;

    case 'emote_removing_cancel':
      // Removal failed — allow emote again
      pendingRemovals.delete(message.emoteName);
      allEmotesDirty = true
      _tabEmoteMapDirty = true
      log(' ↩️ Emote removal cancelled:', message.emoteName);
      break;

    case 'emote_removed':
      // Emote was successfully removed from your set
      pendingRemovals.add(message.emoteName);
      allEmotesDirty = true
      emoteGeneration++
      _tabEmoteMapDirty = true
      log(' ✅ Emote removed from your set:', message.emoteName);
      emoteInventory = emoteInventory.filter(e => e.hash !== message.hash && e.name !== message.emoteName);
      // Clear any stale broadcasts for this emote
      for (const key of pendingEmoteBroadcasts.keys()) {
        if (key.endsWith(`:${message.emoteName}`)) {
          _deleteBroadcast(key);
        }
      }
      updateEmoteState(message.hash, message.emoteName, 'neutral');
      updateEmoteBridge();
      window.postMessage({ type: 'heatsync-inventory-update', count: emoteInventory.length }, location.origin);
      break;

    case 'global_emotes_update':
      globalEmotes = message.emotes;
      allEmotesDirty = true
      emoteGeneration++
      log(' Global emotes updated:', globalEmotes.length);
      if (globalEmotes.length > 0) {
        log(' Sample global emotes:', globalEmotes.slice(0, 5).map(e => e.name));
      }
      debouncedProcessExistingMessages(); // Re-process existing messages with new globals
      updateEmoteBridge(); // Update Twitch autocomplete hook
      break;

    case 'channel_emotes_update': {
      // Only accept emotes for THIS tab's channel
      const myChannel = getPageChannel();
      const emoteOwner = (message.channelOwner || '').toLowerCase();
      if (myChannel && emoteOwner && emoteOwner !== myChannel) {
        log(' Ignoring channel emotes for', emoteOwner, '(this tab is', myChannel + ')');
        break;
      }
      channelEmotes = (message.emotes || []).map(e => ({
        ...e,
        url: normalizeEmoteUrl(e.url)
      }));
      allEmotesDirty = true
      emoteGeneration++
      currentChannelOwner = emoteOwner || null;
      log(' Channel owner emotes updated:', channelEmotes.length, 'for channel:', currentChannelOwner);
      if (channelEmotes.length > 0) {
        log(' Sample channel emotes:', channelEmotes.slice(0, 5).map(e => e.name));
      }
      debouncedProcessExistingMessages();
      updateEmoteBridge();
      break;
    }

    case 'emote_blocked':
      log(' 🚫 Blocking emote, hash:', message.hash?.substring(0, 8));
      blockedEmotes.add(message.hash);
      log(' Blocked emotes Set now has:', blockedEmotes.size, 'items');
      hideBlockedEmote(message.hash);
      window.postMessage({ type: 'heatsync-blocked-sync', hashes: Array.from(blockedEmotes) }, location.origin);
      break;

    case 'emote_unblocked':
      log(' ✅ Unblocking emote, hash:', message.hash?.substring(0, 8));
      blockedEmotes.delete(message.hash);
      log(' Blocked emotes Set now has:', blockedEmotes.size, 'items');
      showUnblockedEmote(message.hash);
      window.postMessage({ type: 'heatsync-blocked-sync', hashes: Array.from(blockedEmotes) }, location.origin);
      break;

    case 'followed_users_updated':
      followedByCurrentUser = new Set(message.users || []);
      log(' Followed users updated:', followedByCurrentUser.size);
      break;

    case 'emote_add_failed':
      log(' ❌ Failed to add emote:', message.emoteName, message.error);
      showToast(t('content_toast_failed_add', [message.emoteName, String(message.error)]), 'error');
      // Clear pending operation
      pendingOperations.delete(`add:${message.emoteName}`);
      break;

    case 'emote_remove_failed':
      log(' ❌ Failed to remove emote:', message.emoteName, message.error);
      showToast(t('content_toast_failed_remove', [message.emoteName, String(message.error)]), 'error');
      // Rollback optimistic removal - re-add to local inventory
      // (actual rollback happens on next inventory sync)
      pendingOperations.delete(`remove:${message.emoteName}`);
      break;

    case 'user_muted':
      mutedUsers.add(message.username);
      muteUser(message.username);
      break;

    case 'user_unmuted':
      mutedUsers.delete(message.username);
      unmuteUser(message.username);
      break;

    case 'user_blocked':
      blockedUsers.add(message.username);
      hideBlockedUser(message.username);
      break;

    case 'user_unblocked':
      blockedUsers.delete(message.username);
      unhideBlockedUser(message.username);
      break;

    case 'channel_emote_added':
      // Handled by multichat.js as a persistent stream-event
      break;

    case 'channel_emote_removed':
      // Handled by multichat.js as a persistent stream-event
      break;

    case 'emote_removed_broadcast':
      // Another user removed an emote, clear their pending broadcast
      const removeKey = `${message.username.toLowerCase()}:${message.emoteName}`;
      if (pendingEmoteBroadcasts.has(removeKey)) {
        log(' 🗑️ Clearing broadcast (user removed emote):', removeKey);
        _deleteBroadcast(removeKey);
      }
      break;

    case 'emote_broadcast':
      // Reject broadcasts for emotes we're actively removing (WS echo race condition)
      if (pendingRemovals.has(message.emoteName)) {
        log(' 🚫 Rejecting broadcast for removed emote:', message.emoteName);
        break;
      }
      // Another user sent an emote, store for upcoming message
      const broadcastKey = `${message.username.toLowerCase()}:${message.emoteName}`;
      log(' 📥 RECEIVED BROADCAST:', {
        username: message.username,
        emoteName: message.emoteName,
        key: broadcastKey,
        emoteUrl: message.emoteData?.url,
        pendingCount: pendingEmoteBroadcasts.size
      });
      _addBroadcast(broadcastKey, { ...message.emoteData, addedAt: Date.now() });

      // Retroactively process recent messages from this user
      retroactivelyProcessBroadcast(message.username, message.emoteName, message.emoteData);

      // Clear after 10 seconds - long enough for race conditions, short enough to prevent stale renders
      cleanup.setTimeout(() => {
        if (pendingEmoteBroadcasts.has(broadcastKey)) {
          log(' ⏰ Broadcast expired:', broadcastKey);
          _deleteBroadcast(broadcastKey);
        }
      }, 10000);
      break;

    case 'ui_settings_changed':
      applyUiSettings(message.settings);
      break;

    case 'cosmetics_update':
      bttvBadgeMap = new Map(Object.entries(message.bttvBadges || {}))
      ffzBadgeMap = new Map(Object.entries(message.ffzBadges || {}))
      log(' Cosmetics loaded: BTTV', bttvBadgeMap.size, 'FFZ', ffzBadgeMap.size)
      reapplyBadgesToExistingMessages()
      break

    case 'follow_colors':
      if (message.colors && typeof message.colors === 'object') {
        for (const [login, color] of Object.entries(message.colors)) {
          if (color) heatsyncColorMap.set(login.toLowerCase(), color)
        }
        log(' HeatSync colors loaded:', heatsyncColorMap.size)
        applyHeatsyncColorsToExisting()
      }
      break

    default:
      log(' Unknown message type:', message.type);
  }
  } catch (err) {
    console.error('[heatsync] onMessage handler error:', err)
  }
}
chrome.runtime.onMessage.removeListener(_onMessageMain)
chrome.runtime.onMessage.addListener(_onMessageMain)

// Kick send relay — only active on kick.com tabs
// Separate listener because it needs async sendResponse (return true)
function _onMessageKickRelay(message, sender, sendResponse) {
  if (message.type !== 'kick_send_relay') return
  fetch(`https://kick.com/api/v2/messages/send/${message.channelId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-XSRF-TOKEN': decodeURIComponent(message.xsrfToken)
    },
    credentials: 'include',
    body: JSON.stringify({ content: message.content, type: 'message' })
  })
  .then(r => {
    if (r.ok) sendResponse({ ok: true })
    else r.text().then(t => sendResponse({ ok: false, error: `${r.status}: ${t}` })).catch(() => sendResponse({ ok: false, error: `${r.status}` }))
  })
  .catch(e => sendResponse({ ok: false, error: e.message }))
  return true // async sendResponse
}
if (window.location.hostname.includes('kick.com')) {
  chrome.runtime.onMessage.removeListener(_onMessageKickRelay)
  chrome.runtime.onMessage.addListener(_onMessageKickRelay)
}

// Debounce reprocessing so rapid emote updates only trigger one pass
let reprocessDebounce = null;
function debouncedProcessExistingMessages() {
  clearTimeout(reprocessDebounce);
  reprocessDebounce = cleanup.setTimeout(() => processExistingMessages(), 200);
}

// Collect chatters from a message without full processing (for two-pass approach)
function collectChatterFromMessage(messageElement) {
  const usernameElement = messageElement.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"], button.inline.font-bold');
  if (!usernameElement) return;

  const username = usernameElement.textContent?.trim().toLowerCase();
  if (!username || username.length === 0 || username.length > 30) return;

  // Skip if already known (don't override with potentially different computed color)
  if (knownChatters.has(username)) return;

  const color = usernameElement.style.color || '#ffffff';
  knownChatters.set(username, color);
}

// Process existing chat messages
function processExistingMessages() {
  const startTime = performance.now();
  const chatContainer = findChatContainer();
  log(' 🔍 processExistingMessages: chatContainer=', chatContainer ? 'FOUND' : 'NULL');
  if (!chatContainer) return;

  const gen = emoteGeneration;

  // Twitch messages (regular + system notices like subs, raids, gifts)
  let messages = chatContainer.querySelectorAll('.chat-line__message, .user-notice-line');

  // Kick messages (if Twitch selector didn't work)
  if (messages.length === 0) {
    messages = chatContainer.querySelectorAll('[data-index]');
  }

  log(' 📨 Found', messages.length, 'messages to process');

  // TWO-PASS APPROACH for username coloring (Chatterino-style):
  // Pass 1: Collect ALL chatters first so we know everyone who has spoken
  const messageArray = Array.from(messages);
  for (const msg of messageArray) {
    collectChatterFromMessage(msg);
  }
  log(` 👥 Collected ${knownChatters.size} chatters for username coloring`);
  if (knownChatters.size > 0 && knownChatters.size <= 20) {
    log(' Known chatters:', [...knownChatters.keys()].join(', '));
  }

  // Pass 2: Process messages (now username coloring will work for all known chatters)
  // PRIORITIZE VISIBLE MESSAGES - process them first for instant load
  // Filter by generation: messages from older generations need reprocessing
  const unprocessed = messageArray.filter(msg => msg.dataset.heatsyncGeneration != gen);
  const visibleMessages = [];
  const hiddenMessages = [];

  if (unprocessed.length > 0) {
    const containerTop = chatContainer.offsetTop;
    const containerBottom = containerTop + chatContainer.offsetHeight;
    for (const msg of unprocessed) {
      const msgTop = msg.offsetTop;
      const msgBottom = msgTop + msg.offsetHeight;
      if (msgTop < containerBottom && msgBottom > containerTop) {
        visibleMessages.push(msg);
      } else {
        hiddenMessages.push(msg);
      }
    }
  }

  // Process visible messages first (instant)
  visibleMessages.forEach(msg => processMessage(msg));

  // Process hidden messages after a short delay (don't block UI)
  if (hiddenMessages.length > 0) {
    cleanup.setTimeout(() => {
      hiddenMessages.forEach(msg => processMessage(msg));
      log(` ⏱️ Processed ${messages.length} messages (${visibleMessages.length} visible, ${hiddenMessages.length} hidden) in ${(performance.now() - startTime).toFixed(0)}ms`);
    }, 50);
  } else {
    log(` ⏱️ Processed ${visibleMessages.length} visible messages in ${(performance.now() - startTime).toFixed(0)}ms`);
  }
}

// ============================================================
// Chat message cache — persist messages across page reloads
// Matches website behavior: 2000 msgs/channel, 24h TTL, debounced saves
// ============================================================
const MSG_CACHE_MAX = 2000
const MSG_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours
let msgCacheBuffer = [] // in-memory buffer of {id, user, text, color, ts}
let msgCacheSaveTimer = null
let msgCacheChannel = null

function getMsgCacheKey(channel) {
  return `hs_msg_cache_${channel}`
}

// Extract serializable data from a DOM message element
function serializeMessage(el) {
  const id = el.getAttribute('data-msg-id') || ''
  const user = getUsername(el)
  if (!user) return null
  const textEl = el.querySelector('[data-a-target="chat-message-text"], .text-fragment, span.font-normal')
  const text = textEl?.textContent?.trim() || ''
  if (!text) return null
  const nameEl = el.querySelector('.chat-author__display-name, button.inline.font-bold')
  const color = nameEl?.style?.color || '#ffffff'
  return { id, user, text, color, ts: Date.now() }
}

// Capture a message into the cache buffer (called from MutationObserver)
function captureMessageToCache(el) {
  if (!msgCacheChannel) return
  const msg = serializeMessage(el)
  if (!msg) return
  // Dedup by id
  if (msg.id && msgCacheBuffer.some(m => m.id === msg.id)) return
  msgCacheBuffer.push(msg)
  // Trim to cap
  if (msgCacheBuffer.length > MSG_CACHE_MAX) {
    msgCacheBuffer = msgCacheBuffer.slice(-MSG_CACHE_MAX)
  }
  // Debounced save
  scheduleMsgCacheSave()
}

function scheduleMsgCacheSave() {
  if (msgCacheSaveTimer) return
  msgCacheSaveTimer = cleanup.setTimeout(() => {
    msgCacheSaveTimer = null
    saveMsgCache()
  }, 5000) // 5s debounce
}

function saveMsgCache() {
  if (!msgCacheChannel || msgCacheBuffer.length === 0) return
  try {
    const key = getMsgCacheKey(msgCacheChannel)
    localStorage.setItem(key, JSON.stringify({
      messages: msgCacheBuffer.slice(-MSG_CACHE_MAX),
      channel: msgCacheChannel,
      savedAt: Date.now()
    }))
  } catch (e) {
    // localStorage full — evict oldest channel caches
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('hs_msg_cache_')) keys.push(k)
      }
      if (keys.length > 5) {
        // Remove oldest 3
        const sorted = keys.map(k => {
          try { return { k, t: JSON.parse(localStorage.getItem(k)).savedAt || 0 } } catch { return { k, t: 0 } }
        }).sort((a, b) => a.t - b.t)
        for (let i = 0; i < 3 && i < sorted.length; i++) localStorage.removeItem(sorted[i].k)
        // Retry save
        localStorage.setItem(getMsgCacheKey(msgCacheChannel), JSON.stringify({
          messages: msgCacheBuffer.slice(-MSG_CACHE_MAX),
          channel: msgCacheChannel,
          savedAt: Date.now()
        }))
      }
    } catch {}
  }
}

// Load cached messages and render them into the chat container
function restoreMsgCache(channel, chatContainer) {
  // Skip on Kick — injecting Twitch-classed DOM into React virtual scroll corrupts it
  if (isKick) return 0
  try {
    const raw = localStorage.getItem(getMsgCacheKey(channel))
    if (!raw) return 0
    const data = JSON.parse(raw)
    if (!data.messages?.length) return 0
    // Check TTL
    if (Date.now() - (data.savedAt || 0) > MSG_CACHE_TTL) {
      localStorage.removeItem(getMsgCacheKey(channel))
      return 0
    }

    // Collect existing message IDs from DOM for dedup
    const existingIds = new Set()
    const existingTexts = new Set()
    chatContainer.querySelectorAll('[data-msg-id]').forEach(el => existingIds.add(el.dataset.msgId))
    chatContainer.querySelectorAll('.chat-line__message').forEach(el => {
      const user = el.querySelector('.chat-author__display-name')?.textContent?.trim()
      const text = el.querySelector('[data-a-target="chat-message-text"]')?.textContent?.trim()
      if (user && text) existingTexts.add(`${user.toLowerCase()}:${text.substring(0, 80)}`)
    })

    const fragment = document.createDocumentFragment()
    let inserted = 0

    for (const msg of data.messages) {
      if (msg.id && existingIds.has(msg.id)) continue
      const dedupKey = `${msg.user.toLowerCase()}:${msg.text.substring(0, 80)}`
      if (existingTexts.has(dedupKey)) continue
      existingTexts.add(dedupKey)

      const div = document.createElement('div')
      div.className = 'chat-line__message heatsync-cached'
      div.setAttribute('data-heatsync-cached', 'true')
      if (msg.id) div.setAttribute('data-msg-id', msg.id)

      const nameSpan = document.createElement('span')
      nameSpan.className = 'chat-author__display-name'
      nameSpan.setAttribute('data-a-target', 'chat-message-username')
      nameSpan.style.color = msg.color
      nameSpan.textContent = msg.user

      const colonSpan = document.createElement('span')
      colonSpan.setAttribute('aria-hidden', 'true')
      colonSpan.textContent = ': '

      const textSpan = document.createElement('span')
      textSpan.className = 'text-fragment'
      textSpan.setAttribute('data-a-target', 'chat-message-text')
      textSpan.textContent = msg.text

      div.appendChild(nameSpan)
      div.appendChild(colonSpan)
      div.appendChild(textSpan)
      fragment.appendChild(div)
      inserted++
    }

    if (inserted > 0) {
      chatContainer.insertBefore(fragment, chatContainer.firstChild)
      log(` 💾 Restored ${inserted} cached messages`)
      // Seed the in-memory buffer with cached data
      msgCacheBuffer = data.messages
    }
    return inserted
  } catch (e) {
    log(' Cache restore error:', e)
    return 0
  }
}

// Initialize cache for current channel
function initMsgCache(channel) {
  msgCacheChannel = channel
  if (msgCacheBuffer.length === 0) {
    // Load existing cache into memory buffer
    try {
      const raw = localStorage.getItem(getMsgCacheKey(channel))
      if (raw) {
        const data = JSON.parse(raw)
        if (data.messages?.length && Date.now() - (data.savedAt || 0) < MSG_CACHE_TTL) {
          msgCacheBuffer = data.messages
        }
      }
    } catch {}
  }
}

// Backfill chat history from robotty recent-messages API
// Fires once per channel join, fetches ~500 recent messages, deduplicates against
// native Twitch messages, and inserts missing ones at the top of the chat container.
async function backfillChatHistory() {
  const chatContainer = findChatContainer()
  if (!chatContainer) return
  if (chatContainer.dataset.heatsyncBackfilled) return
  chatContainer.dataset.heatsyncBackfilled = 'true'

  // Extract channel name from URL
  const match = window.location.href.match(/\/popout\/([^\/]+)\/chat/) ||
                window.location.href.match(/twitch\.tv\/([^\/\?]+)/)
  const channel = match?.[1]?.toLowerCase()
  if (!channel) return

  const excludedPaths = ['oauth2', 'directory', 'settings', 'downloads', 'p', 'videos', 'search', 'subscriptions', 'inventory', 'wallet', 'drops', 'prime', 'turbo', 'products', 'bits', 'u', 'moderator', 'broadcast', 'clip']
  if (excludedPaths.includes(channel)) return

  log(' 📜 Backfilling chat history for', channel)

  try {
    const resp = await fetch(`https://recent-messages.robotty.de/api/v2/recent-messages/${channel}?limit=500`)
    if (!resp.ok) {
      log(' Backfill fetch failed:', resp.status)
      return
    }
    const data = await resp.json()
    if (!data.messages?.length) return

    // Collect existing message IDs from DOM for dedup
    const existingIds = new Set()
    const existingTexts = new Set()
    chatContainer.querySelectorAll('[data-msg-id]').forEach(el => {
      existingIds.add(el.dataset.msgId)
    })
    // Fallback dedup: collect username+text combos from visible messages
    chatContainer.querySelectorAll('.chat-line__message').forEach(el => {
      const user = el.querySelector('.chat-author__display-name')?.textContent?.trim()
      const text = el.querySelector('[data-a-target="chat-message-text"]')?.textContent?.trim()
      if (user && text) existingTexts.add(`${user.toLowerCase()}:${text.substring(0, 80)}`)
    })

    const fragment = document.createDocumentFragment()
    let inserted = 0

    for (const line of data.messages) {
      // Parse PRIVMSG
      const m = line.match(/@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #(\w+) :(.+)/)
      if (!m) continue

      const tags = {}
      m[1].split(';').forEach(t => { const [k, v] = t.split('='); tags[k] = v })
      const msgId = tags.id || ''
      const username = tags['display-name'] || m[2]
      const text = m[4]
      const color = tags.color || '#ffffff'

      // Dedup: skip if message ID already in DOM
      if (msgId && existingIds.has(msgId)) continue
      // Dedup: skip if username+text matches (fallback)
      const dedupKey = `${username.toLowerCase()}:${text.substring(0, 80)}`
      if (existingTexts.has(dedupKey)) continue
      existingTexts.add(dedupKey) // prevent dupes within backfill batch too

      // Build DOM element matching Twitch chat structure
      const div = document.createElement('div')
      div.className = 'chat-line__message heatsync-backfill'
      div.setAttribute('data-heatsync-backfill', 'true')
      if (msgId) div.setAttribute('data-msg-id', msgId)

      const nameSpan = document.createElement('span')
      nameSpan.className = 'chat-author__display-name'
      nameSpan.setAttribute('data-a-target', 'chat-message-username')
      nameSpan.style.color = color
      nameSpan.textContent = username

      const colonSpan = document.createElement('span')
      colonSpan.setAttribute('aria-hidden', 'true')
      colonSpan.textContent = ': '

      const textSpan = document.createElement('span')
      textSpan.className = 'text-fragment'
      textSpan.setAttribute('data-a-target', 'chat-message-text')
      textSpan.textContent = text // textContent is safe, no innerHTML

      div.appendChild(nameSpan)
      div.appendChild(colonSpan)
      div.appendChild(textSpan)
      fragment.appendChild(div)
      inserted++
    }

    if (inserted > 0) {
      // Insert at top of chat container
      chatContainer.insertBefore(fragment, chatContainer.firstChild)
      log(` 📜 Backfilled ${inserted} messages`)
      // Process emotes in backfilled messages
      processExistingMessages()
    }

    // Capture all native Twitch messages into cache (ones that were already in DOM)
    if (msgCacheChannel) {
      chatContainer.querySelectorAll('.chat-line__message:not([data-heatsync-cached]):not([data-heatsync-backfill])').forEach(el => {
        captureMessageToCache(el)
      })
      saveMsgCache() // Force save after initial capture
    }
  } catch (e) {
    log(' Backfill error:', e)
  }
}

// Find Twitch or Kick chat container
function findChatContainer() {
  // Twitch popout chat
  if (window.location.hostname.includes('twitch.tv')) {
    return document.querySelector('.chat-scrollable-area__message-container') ||
           document.querySelector('.chat-list--default');
  }

  // Kick chat
  if (window.location.hostname.includes('kick.com')) {
    return document.querySelector('#chatroom-messages .no-scrollbar') ||
           document.querySelector('#chatroom-messages') ||
           document.querySelector('#channel-chatroom');
  }

  return null;
}

// Cache username once detected
let cachedUsername = null;
let usernameDetectionAttempts = 0;
const MAX_USERNAME_ATTEMPTS = 30; // More attempts to handle slow page loads
let usernameDetectionRetryTimer = null;

// Track all chatters who have sent messages (for username coloring)
// LRU Map: re-insert on get to maintain access order, evict oldest when > 500
const knownChatters = new class extends Map {
  get(k) {
    if (!this.has(k)) return undefined
    const v = super.get(k)
    super.delete(k)
    super.set(k, v)
    return v
  }
}()

// Sub tenure tracking — extracted from Twitch badge alt text (subscriber badge)
const subTenureMap = new Map() // usernameLC -> months

function formatSubTenure(months) {
  if (months >= 12) {
    const y = Math.floor(months / 12)
    const m = months % 12
    return m > 0 ? `${y}y ${m}M` : `${y}y`
  }
  return `${months}M`
}

// ============================================
// HEAT CACHE + BATCH FETCHER
// ============================================
const HEAT_CACHE_MAX = 1000
const HEAT_CACHE_TTL = 120000 // 2 min
const HEAT_BATCH_INTERVAL = 2000 // 2s debounce for subsequent batches
const heatCache = new Map() // username -> { heat, op, re, fetchedAt }
// Periodic cleanup — prune stale entries every 5 min
cleanup.setInterval(() => {
  const now = Date.now()
  for (const [k, v] of heatCache) {
    if (now - v.fetchedAt > HEAT_CACHE_TTL) heatCache.delete(k)
  }
}, 300000)
const heatPending = new Set() // usernames awaiting batch fetch
let heatBatchTimer = null
let heatFirstBatch = true // first batch fires immediately

// Third-party cosmetics
let bttvBadgeMap = new Map()
let ffzBadgeMap = new Map()
const heatsyncColorMap = new Map() // username → HeatSync API color (from follow:colors)
let cosmeticsEnabled = true // toggle for BTTV/FFZ/7TV cosmetics
const cosmeticsCache = new Map()
const COSMETICS_TTL = 30 * 60 * 1000
const COSMETICS_MAX = 500
const cosmeticsPending = new Set()
let cosmeticsBatchTimer = null

// Kick cosmetics (7TV paints/badges by username)
const kickCosmeticsCache = new Map()  // username → { paint, badge, fetchedAt }
const kickCosmeticsPending = new Set()
let kickCosmeticsBatchTimer = null

// Heat tier config — matches client/config/colors.js
const HEAT_GRADIENT = [
  '#808080', '#cc6e00', '#ff8700', '#ff9900', '#ff6600',
  '#ff0000', '#ff2200', '#ff9900', '#ffcc00', '#ffffff'
]

function getHeatTier(heat) {
  if (heat >= 5000) return 9
  if (heat >= 1000) return 8
  if (heat >= 500) return 7
  if (heat >= 200) return 6
  if (heat >= 100) return 5
  if (heat >= 50) return 4
  if (heat >= 20) return 3
  if (heat >= 5) return 2
  if (heat >= 1) return 1
  return 0
}

function getHeatColor(heat) {
  return HEAT_GRADIENT[getHeatTier(heat)]
}

function queueHeatLookup(username) {
  const key = username.toLowerCase()
  if (heatCache.has(key) && Date.now() - heatCache.get(key).fetchedAt < HEAT_CACHE_TTL) return
  heatPending.add(key)

  if (heatFirstBatch) {
    // First batch fires immediately after initial chat load
    heatFirstBatch = false
    cleanup.setTimeout(() => flushHeatBatch(), 0)
  } else if (!heatBatchTimer) {
    heatBatchTimer = cleanup.setTimeout(() => {
      heatBatchTimer = null
      flushHeatBatch()
    }, HEAT_BATCH_INTERVAL)
  }
}

async function flushHeatBatch() {
  if (heatPending.size === 0) return
  const batch = [...heatPending].slice(0, 100)
  batch.forEach(u => heatPending.delete(u))

  try {
    const data = await HS.apiFetch('/api/users/heat', {
      method: 'POST',
      body: { usernames: batch }
    })
    if (!data) return

    const users = data.users
    const now = Date.now()
    for (const [name, data] of Object.entries(users)) {
      if (heatCache.size >= HEAT_CACHE_MAX) {
        heatCache.delete(heatCache.keys().next().value)
      }
      heatCache.set(name, { ...data, fetchedAt: now })
    }
    // Mark users not in response as 0 heat (they exist but no posts)
    for (const name of batch) {
      if (!heatCache.has(name) || heatCache.get(name).fetchedAt !== now) {
        if (heatCache.size >= HEAT_CACHE_MAX) {
          heatCache.delete(heatCache.keys().next().value)
        }
        heatCache.set(name, { heat: 0, op: 0, re: 0, fetchedAt: now })
      }
    }

    applyHeatBorders()
  } catch (err) {
    log(' Heat batch fetch failed:', err.message)
  }

  // If more pending, schedule another batch
  if (heatPending.size > 0 && !heatBatchTimer) {
    heatBatchTimer = cleanup.setTimeout(() => {
      heatBatchTimer = null
      flushHeatBatch()
    }, HEAT_BATCH_INTERVAL)
  }
}

function applyHeatBorderToElement(messageElement, heat) {
  if (heat < 5) return // no visual for low heat
  const tier = getHeatTier(heat)
  const color = HEAT_GRADIENT[tier]

  // Border width scales with tier
  const borderWidth = tier >= 8 ? 6 : tier >= 5 ? 5 : tier >= 3 ? 4 : 3
  messageElement.style.borderLeft = `${borderWidth}px solid ${color}`

  // Glow for tier 5+ (100+ heat)
  if (tier >= 5) {
    const glowAlpha = Math.min(0.3 + (tier - 5) * 0.1, 0.7)
    messageElement.style.boxShadow = `0 0 ${10 + (tier - 5) * 3}px rgba(${parseInt(color.slice(1,3),16)}, ${parseInt(color.slice(3,5),16)}, ${parseInt(color.slice(5,7),16)}, ${glowAlpha})`
  }

  // Breathing animation for tier 8+ (1000+ heat)
  if (tier >= 8) {
    messageElement.style.animation = 'hs-heat-breathe 2s ease-in-out infinite'
  }

  messageElement.dataset.hsHeatApplied = '1'
}

function applyHeatBorders() {
  const chatContainer = findChatContainer()
  if (!chatContainer) return

  const messages = chatContainer.querySelectorAll('.chat-line__message:not([data-hs-heat-applied]), [data-index]:not([data-hs-heat-applied])')
  for (const msg of messages) {
    const username = getUsername(msg)
    if (!username) continue
    const cached = heatCache.get(username.toLowerCase())
    if (cached) {
      applyHeatBorderToElement(msg, cached.heat)
    }
  }
}

// Get current user's username from Twitch DOM
function getCurrentUsername() {
  // Return cached value if we already found it
  if (cachedUsername) {
    return cachedUsername;
  }

  // Stop trying after MAX_USERNAME_ATTEMPTS (prevent console spam)
  if (usernameDetectionAttempts >= MAX_USERNAME_ATTEMPTS) {
    return null;
  }

  usernameDetectionAttempts++;

  // Try multiple methods to find username
  let username = null;

  // Method 1: localStorage JSON object (most reliable - works everywhere)
  try {
    const twitchUserJson = localStorage.getItem('twilight.user');
    if (twitchUserJson) {
      const parsed = JSON.parse(twitchUserJson);
      username = parsed?.displayName || parsed?.login;
      if (username && username.length > 0 && username.length < 30) {
        log(' ✅ Found username from localStorage JSON:', username);
        cachedUsername = username.toLowerCase();
        return cachedUsername;
      }
    }
  } catch (e) {
    // JSON parse might fail
  }

  // Method 2: localStorage displayName string
  try {
    const twitchStorage = localStorage.getItem('twilight.user.displayName');
    if (twitchStorage) {
      username = twitchStorage.replace(/"/g, '').trim();
      if (username && username.length > 0 && username.length < 30) {
        log(' ✅ Found username from localStorage displayName:', username);
        cachedUsername = username.toLowerCase();
        return cachedUsername;
      }
    }
  } catch (e) {
    // localStorage access might fail
  }

  // Method 3: User menu button
  const userButton = document.querySelector('[data-a-target="user-menu-toggle"]');
  if (userButton) {
    const ariaLabel = userButton.getAttribute('aria-label');
    if (ariaLabel) {
      // Try different patterns
      username = ariaLabel.replace('User Menu. The user name is ', '')
                          .replace('User menu: ', '')
                          .replace('User Menu ', '')
                          .trim();
      if (username && username.length > 0 && username.length < 30 && !username.includes(' ')) {
        log(' ✅ Found username from user menu button:', username);
        cachedUsername = username.toLowerCase();
        return cachedUsername;
      }
    }
  }

  // Method 4: Figure element
  const figure = document.querySelector('[data-a-target="user-menu-toggle"] figure[aria-label]');
  if (figure) {
    username = figure.getAttribute('aria-label');
    if (username && username.length > 0 && username.length < 30 && !username.includes(' ')) {
      log(' ✅ Found username from figure:', username);
      cachedUsername = username.toLowerCase();
      return cachedUsername;
    }
  }

  // Method 5: Chat input data attribute
  const chatInput = document.querySelector('[data-a-target="chat-input"]');
  if (chatInput) {
    username = chatInput.getAttribute('data-a-user');
    if (username && username.length > 0 && username.length < 30) {
      log(' ✅ Found username from chat input:', username);
      cachedUsername = username.toLowerCase();
      return cachedUsername;
    }
  }

  // Method 6: Cookie fallback - look for twilight-user or name cookie
  try {
    const cookies = document.cookie;
    // Twitch stores username in 'name' cookie
    const nameMatch = cookies.match(/(?:^|;\s*)name=([^;]+)/);
    if (nameMatch) {
      username = decodeURIComponent(nameMatch[1]).replace(/"/g, '');
      // Validate: must be alphanumeric/underscore, not a timestamp
      if (username && username.length > 0 && username.length < 30 &&
          /^[a-zA-Z0-9_]+$/.test(username)) {
        log(' ✅ Found username from name cookie:', username);
        cachedUsername = username.toLowerCase();
        return cachedUsername;
      }
    }
  } catch (e) {
    // Cookie access might fail
  }

  // Kick methods
  if (window.location.hostname.includes('kick.com')) {
    // Method K1: Kick stores session data in localStorage
    try {
      const kickSession = localStorage.getItem('kick-session')
      if (kickSession) {
        const session = JSON.parse(kickSession)
        const name = session?.user?.username || session?.username
        if (name && /^[a-zA-Z0-9_]+$/.test(name)) {
          log(' ✅ Found Kick username from session storage:', name)
          cachedUsername = name.toLowerCase()
          return cachedUsername
        }
      }
    } catch {}
    // Method K2: Kick nav bar username link (current DOM)
    const kickUserLink = document.querySelector('a[href*="/dashboard"], nav a[href^="/"]')
    if (kickUserLink) {
      const href = kickUserLink.getAttribute('href')
      const match = href?.match(/^\/([a-zA-Z0-9_]+)(?:\/|$)/)
      if (match?.[1] && !['categories', 'following', 'settings', 'search', 'dashboard'].includes(match[1].toLowerCase())) {
        log(' ✅ Found Kick username from nav link:', match[1])
        cachedUsername = match[1].toLowerCase()
        return cachedUsername
      }
    }
    // Method K3: Kick chat input identity — look for "Send a message" placeholder owner
    const kickChatIdentity = document.querySelector('.chat-identity-name, [class*="chat-identity"] span')
    if (kickChatIdentity?.textContent?.trim()) {
      const name = kickChatIdentity.textContent.trim()
      if (name.length > 0 && name.length < 30 && /^[a-zA-Z0-9_]+$/.test(name)) {
        log(' ✅ Found Kick username from chat identity:', name)
        cachedUsername = name.toLowerCase()
        return cachedUsername
      }
    }
  }

  // Schedule retry if we haven't found it yet and attempts < MAX
  if (usernameDetectionAttempts < MAX_USERNAME_ATTEMPTS && !usernameDetectionRetryTimer) {
    usernameDetectionRetryTimer = cleanup.setTimeout(() => {
      usernameDetectionRetryTimer = null;
      const found = getCurrentUsername();
      if (found) {
        log(' ✅ Username found on retry:', found);
      }
    }, 1000);
  }

  // Only log failure on first and every 10th attempt (reduce spam)
  if (usernameDetectionAttempts === 1 || usernameDetectionAttempts % 10 === 0) {
    log(' ⚠️ Could not find username after', usernameDetectionAttempts, 'attempts');
  }

  return null;
}

// Highlight messages that mention the current user ONLY
function highlightUserMentions(messageElement) {
  const currentUser = getCurrentUsername();
  if (!currentUser) {
    return; // Skip if username not detected yet
  }
  // Cache mention regex — only rebuild when username changes
  if (currentUser !== _mentionUser) {
    _mentionRegex = new RegExp('\\b' + currentUser + '\\b', 'i');
    _mentionUser = currentUser;
  }

  // CRITICAL: Skip messages sent BY the current user (don't highlight your own messages)
  const authorElement = messageElement.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"], button.inline.font-bold');
  const messageAuthor = authorElement?.textContent?.toLowerCase()?.trim();
  if (messageAuthor === currentUser) {
    return; // Don't highlight your own messages
  }

  let shouldHighlight = false;

  // Check explicit @mention elements (Twitch has .mention-fragment, Kick uses inline text)
  const mentions = messageElement.querySelectorAll('.mention-fragment, [data-a-target="chat-message-mention"]');

  // Check each mention to see if it matches current user
  for (const mention of mentions) {
    const mentionText = mention.textContent.toLowerCase().replace('@', '').trim();
    if (mentionText === currentUser) {
      shouldHighlight = true;
      break;
    }
  }

  // Also check if username appears as standalone word in message BODY (not author)
  if (!shouldHighlight) {
    // Get just the message text, not the author name
    const textFragments = messageElement.querySelectorAll('.text-fragment, [data-a-target="chat-message-text"], span.font-normal');
    for (const frag of textFragments) {
      const fragText = frag.textContent.toLowerCase();
      if (_mentionRegex && _mentionRegex.test(fragText)) {
        shouldHighlight = true;
        break;
      }
    }
  }

  if (shouldHighlight) {
    // FFZ-style: Just add a CSS class - let the stylesheet handle it
    log(' 🔴 FOUND MENTION OF YOU! Adding .hs-mentioned class');

    // Find the parent message element (Twitch: .chat-line__message, Kick: [data-index])
    let parent = messageElement;
    while (parent && !parent.classList.contains('chat-line__message') && !parent.hasAttribute('data-index')) {
      parent = parent.parentElement;
    }

    const targetElement = (parent && (parent.classList.contains('chat-line__message') || parent.hasAttribute('data-index'))) ? parent : messageElement;

    // Add the class (CSS handles the rest with high specificity)
    targetElement.classList.add('hs-mentioned');

    log(' 🔴 Added .hs-mentioned class to:', targetElement.className);

    // Notify background for browser notification (if hs_notifications enabled)
    const msgText = Array.from(
      messageElement.querySelectorAll('.text-fragment, [data-a-target="chat-message-text"], .mention-fragment, span.font-normal')
    ).map(el => el.textContent).join(' ').trim()
    safeSendMessage({
      type: 'mention_detected',
      username: messageAuthor || '',
      text: msgText.slice(0, 200)
    }).catch(() => {})
  }
}

// Color @username mentions AND any username from known chatters (Chatterino-style)
// Uses inline span injection - called repeatedly by MutationObserver
function colorUsernameMentions(messageElement) {
  // Find all text fragments in the message
  const textFragments = messageElement.querySelectorAll('.text-fragment, [data-a-target="chat-message-text"], span.font-normal');

  for (const fragment of textFragments) {
    // Skip if already has our colored spans (check for our marker class)
    if (fragment.querySelector('.hs-username-colored')) continue;

    // Skip if text already contains our spans (React may have re-wrapped)
    const text = fragment.textContent;
    if (!text) continue;

    // Split text into words while preserving structure
    const words = text.split(/(\s+)/); // Keep whitespace
    const newNodes = [];
    let hasMatch = false;

    for (const word of words) {
      const cleanWord = word.replace(/[@,.:!?]/g, '').trim().toLowerCase();

      // Check if this word is a known chatter
      if (cleanWord && knownChatters.has(cleanWord)) {
        const color = knownChatters.get(cleanWord);
        const span = document.createElement('span');
        span.className = 'hs-username-colored';
        const safeColor = /^(#[0-9a-f]{3,8}|rgb\(.+\)|[a-z]+)$/i.test(color) ? color : '#ffffff';
        span.style.cssText = `color: ${safeColor} !important; font-weight: bold !important; cursor: pointer !important;`;
        span.textContent = word;
        span.dataset.hsUsername = cleanWord;
        newNodes.push(span);
        hasMatch = true;
      } else {
        newNodes.push(document.createTextNode(word));
      }
    }

    // Only modify DOM if we found matches
    if (!hasMatch) continue;

    // Validate fragment is still in DOM
    if (!document.contains(fragment)) continue;

    try {
      fragment.replaceChildren(...newNodes);
    } catch (e) {
      // Silently skip on React conflict
    }
  }

  // Also color @mention elements (Twitch's explicit mentions)
  // Always make mentions hoverable for profile cards, even if user hasn't chatted yet
  const mentions = messageElement.querySelectorAll('.mention-fragment, [data-a-target="chat-message-mention"]');
  for (const mention of mentions) {
    if (mention.classList.contains('hs-mention-colored')) continue;
    const username = mention.textContent.replace('@', '').trim().toLowerCase();
    if (!username) continue;
    const color = knownChatters.get(username) || '#fff';
    mention.style.cssText = `color: ${color} !important; font-weight: bold !important; cursor: pointer !important; pointer-events: auto !important;`;
    mention.classList.add('hs-mention-colored');
    mention.dataset.hsUsername = username;
  }
}

// MutationObserver for persistent username coloring (survives React re-renders)
let usernameColoringObserver = null;
let usernameClickHandlerInstalled = false;

function setupUsernameColoringObserver() {
  log(' setupUsernameColoringObserver called');

  // ALWAYS install click handler first (before any early returns)
  // NOTE: Profile card click handler in setupProfileCard() handles username clicks now.
  // This handler only prevents default navigation on colored usernames.
  if (!usernameClickHandlerInstalled) {
    usernameClickHandlerInstalled = true;
    log(' ✅ Username click handler deferred to profile card');

    // Emote stack expand/collapse handlers (LEFT CLICK)
    document.addEventListener('click', (e) => {
      // Handle collapse button (×)
      const collapseBtn = e.target.closest('.heatsync-stack-collapse');
      if (collapseBtn) {
        e.preventDefault();
        e.stopPropagation();
        const stack = collapseBtn.closest('.heatsync-emote-stack');
        if (stack) {
          stack.classList.remove('expanded');
          log(' ✅ Stack collapsed via × button');
        }
        return;
      }

      // Handle block-all / show-all toggle button (⊘ ↔ ◉)
      const blockAllBtn = e.target.closest('.heatsync-stack-block-all');
      if (blockAllBtn) {
        e.preventDefault();
        e.stopPropagation();
        const stack = blockAllBtn.closest('.heatsync-emote-stack');
        if (stack) {
          const emoteWrappers = stack.querySelectorAll('.heatsync-emote-wrapper');

          // Check if all emotes are currently blocked
          const allBlocked = Array.from(emoteWrappers).every(wrapper =>
            wrapper.classList.contains('emote-overlay-blocked')
          );

          if (allBlocked) {
            // SHOW ALL - unblock all emotes in stack
            emoteWrappers.forEach(wrapper => {
              const hash = wrapper.dataset.emoteHash;
              const name = wrapper.dataset.emoteName;
              if (hash || name) {
                blockedEmotes.delete(hash || name);
                wrapper.classList.remove('emote-overlay-blocked');
                // Restore appropriate class based on inventory status
                const inInventory = inventoryHashSet.has(hash) || inventoryNameSet.has(name);
                if (inInventory) {
                  wrapper.classList.add('emote-overlay-owned');
                } else {
                  wrapper.classList.add('emote-overlay-unadded');
                }
              }
            });
            blockAllBtn.textContent = '⊘';
            blockAllBtn.title = t('btn_block_all');
            log(' ✅ Unblocked all emotes in stack');
          } else {
            // BLOCK ALL - block all emotes in stack
            emoteWrappers.forEach(wrapper => {
              const hash = wrapper.dataset.emoteHash;
              const name = wrapper.dataset.emoteName;
              if (hash || name) {
                blockedEmotes.add(hash || name);
                wrapper.classList.add('emote-overlay-blocked');
                wrapper.classList.remove('emote-overlay-owned', 'emote-overlay-unadded', 'emote-overlay-global');
              }
            });
            blockAllBtn.textContent = '◉';
            blockAllBtn.title = t('btn_show_all');
            log(' 🚫 Blocked all emotes in stack');
          }

          // Save blocked emotes
          chrome.storage.local.set({ blocked_emotes: Array.from(blockedEmotes) });
          stack.classList.remove('expanded');
        }
        return;
      }

      // Click on collapsed stack → Expand (left click)
      const stack = e.target.closest('.heatsync-emote-stack');
      if (stack && !stack.classList.contains('expanded')) {
        e.preventDefault();
        e.stopPropagation();
        stack.classList.add('expanded');
        log(' ✅ Stack expanded via left click');
        return;
      }

      // If stack is expanded and clicking on emote, let normal emote handling work (don't stop)
    }, { capture: true, signal });

    // Right-click on collapsed stack → Expand (same as left click)
    document.addEventListener('contextmenu', (e) => {
      const stack = e.target.closest('.heatsync-emote-stack');
      if (stack && !stack.classList.contains('expanded')) {
        e.preventDefault();
        e.stopPropagation();
        stack.classList.add('expanded');
        log(' ✅ Stack expanded via right click');
        return;
      }
      // If expanded, let normal right-click handling work (block emote)
    }, { capture: true, signal });

    log(' ✅ Emote stack expand/collapse handler installed');
  }

  if (usernameColoringObserver) {
    log(' Observer already setup, skipping');
    return;
  }

  const chatContainer = findChatContainer();
  if (!chatContainer) {
    log(' ❌ No chat container found for observer');
    return;
  }

  usernameColoringObserver = cleanup.trackObserver(new MutationObserver((mutations) => {
    // Collect new chat messages from addedNodes directly — avoid full container scan
    const newMessages = []
    const cosmeticRefresh = []
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue
        if (node.classList?.contains('chat-line__message') || node.hasAttribute?.('data-index')) {
          if (!node.dataset.heatsyncUsernamesColored) newMessages.push(node)
        } else if (node.querySelectorAll) {
          for (const msg of node.querySelectorAll('.chat-line__message:not([data-heatsync-usernames-colored]), [data-index]:not([data-heatsync-usernames-colored])')) {
            newMessages.push(msg)
          }
          // Detect React re-rendering username elements inside already-processed messages
          // When React replaces a username span, the paint styles are lost
          const msgParent = node.closest?.('.chat-line__message, [data-index]')
          if (msgParent?.dataset.hsCosmeticDone === '1') {
            const nameEl = msgParent.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"]')
            if (nameEl && !nameEl.dataset.hsPaintApplied) {
              cosmeticRefresh.push(msgParent)
            }
          }
        }
      }
    }

    // Re-apply cosmetics to messages where React replaced the username element
    if (cosmeticRefresh.length > 0) {
      requestAnimationFrame(() => {
        for (const msg of cosmeticRefresh) {
          delete msg.dataset.hsCosmeticDone
          const uid = msg.dataset.hsCosmeticUserId
          const kickUser = msg.dataset.hsCosmeticKickUser
          if (uid) applyCosmeticsToMessage(msg, uid)
          else if (kickUser) applyKickCosmeticsToMessage(msg, kickUser)
        }
      })
    }

    if (newMessages.length === 0) return

    // Debounce - only process once per animation frame
    if (usernameColoringObserver._pending) {
      // Stash nodes for next frame
      usernameColoringObserver._queued = (usernameColoringObserver._queued || []).concat(newMessages)
      return
    }
    usernameColoringObserver._pending = true
    usernameColoringObserver._queued = newMessages

    requestAnimationFrame(() => {
      usernameColoringObserver._pending = false
      const batch = usernameColoringObserver._queued || []
      usernameColoringObserver._queued = null

      // Use cached emote map (rebuilt on dirty flag in processMessage)
      const allEmotes = cachedAllEmotes || new Map()

      const vh = window.innerHeight
      for (const msg of batch) {
        if (msg.dataset.heatsyncUsernamesColored) continue
        const rect = msg.getBoundingClientRect()
        if (rect.top < vh && rect.bottom > 0) {
          msg.dataset.heatsyncUsernamesColored = '1'
          highlightUserMentions(msg)
          colorUsernameMentions(msg)
          // Only stack if processMessage hasn't already done it
          if (msg.dataset.heatsyncGeneration != emoteGeneration) {
            stackAdjacentOverlayEmotes(msg, allEmotes)
          }
        }
      }
    })
  }), 'username-coloring');

  usernameColoringObserver.observe(chatContainer, {
    childList: true,
    subtree: true
  });

  log(' ✅ Username coloring observer active');
}

// Process individual message for emote replacement
function processMessage(messageElement) {
  if (!messageElement || !document.contains(messageElement)) return
  if (messageElement.dataset.heatsyncGeneration == emoteGeneration) return

  messageElement.dataset.heatsyncGeneration = emoteGeneration

  const textElements = messageElement.querySelectorAll('.text-fragment, span.font-normal')
  if (textElements.length === 0) return

  const username = getUsername(messageElement)

  // Add to known chatters (for username coloring) - extract their Twitch color
  // Priority: HeatSync API color > Twitch native color > white fallback
  if (username) {
    const lowerUser = username.toLowerCase()
    const usernameElement = messageElement.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"]')
    const hsColor = heatsyncColorMap.get(lowerUser)
    if (hsColor) {
      // HeatSync API color takes priority — apply it to the DOM element too
      if (usernameElement) usernameElement.style.color = hsColor
      knownChatters.set(lowerUser, hsColor)
    } else if (!knownChatters.has(lowerUser)) {
      const color = usernameElement?.style.color || '#ffffff'
      knownChatters.set(lowerUser, color)
      while (knownChatters.size > 500) knownChatters.delete(knownChatters.keys().next().value)
    }
  }

  // Extract sub tenure from Twitch subscriber badge alt text
  if (username) {
    const lowerUser = username.toLowerCase()
    if (!subTenureMap.has(lowerUser)) {
      const badgeImgs = messageElement.querySelectorAll('[data-a-target="chat-badge"] img, .chat-badge img')
      for (const img of badgeImgs) {
        const alt = img.alt || img.getAttribute('aria-label') || ''
        const match = alt.match(/(\d+)-Month Subscriber/i)
        if (match) {
          subTenureMap.set(lowerUser, parseInt(match[1]))
          while (subTenureMap.size > 500) subTenureMap.delete(subTenureMap.keys().next().value)
          break
        }
      }
    }
  }

  // Heat border — apply from cache or queue for batch fetch
  if (username) {
    const lowerUser = username.toLowerCase()
    const cached = heatCache.get(lowerUser)
    if (cached && Date.now() - cached.fetchedAt < HEAT_CACHE_TTL) {
      applyHeatBorderToElement(messageElement, cached.heat)
    } else {
      queueHeatLookup(lowerUser)
    }
  }

  // Apply third-party cosmetics (BTTV/FFZ badges + 7TV paints/badges)
  if (cosmeticsEnabled) {
    if (isKick) {
      if (username) {
        const kickSlug = username.toLowerCase()
        messageElement.dataset.hsCosmeticKickUser = kickSlug
        applyKickCosmeticsToMessage(messageElement, kickSlug)
        queueKickCosmeticsLookup(kickSlug)
      }
    } else {
      const userId = getTwitchUserId(messageElement)
      if (userId) {
        messageElement.dataset.hsCosmeticUserId = userId
        applyCosmeticsToMessage(messageElement, userId)
        queueCosmeticsLookup(userId)
      }
    }
  }

  // Check if user is blocked (hard hide)
  if (blockedUsers.has(username)) {
    messageElement.style.display = 'none';
    return;
  }

  // Check if user is muted — strip content, gray username
  if (mutedUsers.has(username)) {
    stripMutedMessage(messageElement);
    return;
  }

  // Highlight mentions of current user (FFZ-style red background on entire line)
  highlightUserMentions(messageElement);

  // Build combined emote map (cached, rebuilt only when emote data changes)
  if (allEmotesDirty || !cachedAllEmotes) {
    allEmotesDirty = false // Set early to prevent redundant rebuilds in same batch
    cachedAllEmotes = new Map()

    // Add global emotes
    globalEmotes.forEach(emote => {
      cachedAllEmotes.set(emote.name, Object.assign({}, emote, { hash: emote.hash || btoa(emote.url), isGlobal: true }))
    })

    // Add inventory emotes
    emoteInventory.forEach(emote => {
      cachedAllEmotes.set(emote.name, Object.assign({}, emote, {
        url: emote.url?.startsWith('http') ? emote.url : `${API_URL}${emote.url}`
      }))
    })

    // Add channel emotes (third-party only — BTTV/FFZ/7TV/Twitch)
    // HeatSync emotes render via emoteInventory (own set) or pendingEmoteBroadcasts (others)
    channelEmotes.forEach(emote => {
      if (!emote.source) return
      cachedAllEmotes.set(emote.name, Object.assign({}, emote, {
        url: emote.url?.startsWith('http') ? emote.url : `${API_URL}${emote.url}`
      }))
    })

    // Rebuild O(1) lookup sets
    inventoryHashSet = new Set()
    for (const e of emoteInventory) inventoryHashSet.add(e.hash)
    inventoryNameSet = new Set()
    for (const e of emoteInventory) inventoryNameSet.add(e.name)
    globalNameSet = new Set()
    for (const e of globalEmotes) globalNameSet.add(e.name)
    cachedEmotesByHash = new Map()
    for (const e of cachedAllEmotes.values()) {
      if (e.hash) cachedEmotesByHash.set(e.hash, e)
    }
  }

  // 2-tier lookup: cached base + per-user broadcast emotes (avoids cloning entire Map)
  // Fast path: skip broadcast scan when no broadcasts pending (common case)
  // For our own messages, skip broadcasts — our inventory is authoritative
  let allEmotes
  const currentUser = getCurrentUsername()
  const isOwnMessage = currentUser && username && username.toLowerCase() === currentUser.toLowerCase()
  if (pendingEmoteBroadcasts.size === 0 || !username || isOwnMessage) {
    allEmotes = cachedAllEmotes
  } else {
    const userKey = username.toLowerCase()
    const userBroadcastMap = pendingBroadcastsByUser.get(userKey)
    if (!userBroadcastMap || userBroadcastMap.size === 0) {
      allEmotes = cachedAllEmotes
    } else {
      const userBroadcasts = new Map()
      for (const [emoteName, emoteData] of userBroadcastMap) {
        // Skip emotes we're actively removing
        if (pendingRemovals.has(emoteName)) continue
        userBroadcasts.set(emoteName, {
          name: emoteName,
          url: emoteData.url?.startsWith('http') ? emoteData.url : `${API_URL}${emoteData.url}`,
          hash: emoteData.hash,
          width: emoteData.width,
          height: emoteData.height
        })
      }
      if (userBroadcasts.size === 0) {
        allEmotes = cachedAllEmotes
      } else {
        allEmotes = {
          get(name) { return userBroadcasts.get(name) || cachedAllEmotes.get(name) },
          has(name) { return userBroadcasts.has(name) || cachedAllEmotes.has(name) },
          get size() { return cachedAllEmotes.size + userBroadcasts.size }
        }
      }
    }
  }

  // Process ALL text fragments with overlay stacking support
  for (const textElement of textElements) {
    // Skip if already processed or removed from DOM
    if (!document.contains(textElement)) continue
    if (textElement.querySelector('.heatsync-emote-wrapper')) continue

    replaceEmotesWithStacking(textElement, allEmotes)
  }

  // Also wrap any existing heatsync emote images (from tab completion)
  wrapExistingHeatsyncEmotes(messageElement, allEmotes);

  // Post-process: Stack overlay emotes that are adjacent to base emotes
  stackAdjacentOverlayEmotes(messageElement, allEmotes);

  // Color all @username mentions (Chatterino-style) - AFTER emote replacement
  // so replaceChildren() doesn't wipe out the colored spans
  colorUsernameMentions(messageElement);

}

// Check if an emote is a zero-width/overlay emote
// Checks: 7TV zeroWidth property, flags bitmask, and "0" suffix convention
function isZeroWidthEmote(emoteName, emoteData, allEmotes) {
  if (!emoteName) return false;

  // Method 1: Check zeroWidth property (direct from 7TV API)
  if (emoteData?.zeroWidth === true) return true;

  // Method 2: Check flags bitmask
  // 7TV: bit 0 (1) = private/zw override, bit 8 (256) = zero-width
  if (typeof emoteData?.flags === 'number' && (emoteData.flags & 257)) return true;

  // Method 3: "0" suffix convention (channel overlay emotes)
  // If emote name ends with "0" and the base name (without "0") exists as an emote
  if (emoteName.endsWith('0') && emoteName.length > 1) {
    const baseName = emoteName.slice(0, -1);
    if (allEmotes && allEmotes.has(baseName)) {
      return true;
    }
  }

  return false;
}

// Post-process message to stack overlay emotes on adjacent base emotes
function stackAdjacentOverlayEmotes(messageElement, allEmotes) {
  // Find ALL emotes: heatsync wrappers AND native Twitch/platform emotes
  // Use comprehensive selectors for different Twitch DOM versions
  // Single querySelectorAll preserves DOM order — no sort needed
  const allEmoteElements = [...messageElement.querySelectorAll(COMBINED_EMOTE_SELECTOR)]
    .filter(el => !el.closest('.heatsync-emote-stack'))

  log(' 🔍 stackAdjacentOverlayEmotes: combined=' + allEmoteElements.length);

  if (allEmoteElements.length < 2) {
    log(' 🔍 Not enough emotes to stack:', allEmoteElements.length);
    return;
  }

  log(' 🔍 stackAdjacentOverlayEmotes: found', allEmoteElements.length, 'emotes (heatsync + native)');

  // Simple logic: start at index 1, check if current is overlay, stack on previous
  for (let i = 1; i < allEmoteElements.length; i++) {
    const currentElement = allEmoteElements[i];
    const prevElement = allEmoteElements[i - 1];

    // Skip if current already in a stack
    if (currentElement.closest('.heatsync-emote-stack')) continue;

    // Get emote name - different for heatsync vs native
    let currentEmoteName;
    if (currentElement.classList.contains('heatsync-emote-wrapper')) {
      currentEmoteName = currentElement.dataset.emoteName;
    } else {
      const img = currentElement.tagName === 'IMG' ? currentElement : currentElement.querySelector('img');
      currentEmoteName = img?.alt || img?.getAttribute('data-a-target')?.replace('emote-name-', '');
    }

    const currentEmote = allEmotes.get(currentEmoteName);

    // Check if current emote is an overlay/zero-width emote
    const isOverlay = isZeroWidthEmote(currentEmoteName, currentEmote, allEmotes);

    if (!isOverlay) {
      log(' 🔍 NOT overlay:', currentEmoteName);
      continue;
    }

    log(' 🔍 Overlay found:', currentEmoteName);

    // Find base: check if previous emote is in a stack, otherwise use it directly as base
    const existingStack = prevElement.closest('.heatsync-emote-stack');
    const baseElement = existingStack ? null : prevElement;
    const targetStack = existingStack || null;

    // Check adjacency - only whitespace should separate them
    const checkElement = existingStack || prevElement;
    if (!checkElement) continue;

    // Walk siblings between checkElement and currentElement — skip if any non-whitespace
    let onlyWhitespace = true
    let node = checkElement.nextSibling
    while (node && node !== currentElement) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.trim() !== '') { onlyWhitespace = false; break }
      } else { onlyWhitespace = false; break }
      node = node.nextSibling
    }
    const textBetween = onlyWhitespace ? '' : 'non-empty'

    log(' 🔍 Text between:', JSON.stringify(textBetween));

    // Only stack if there's just whitespace between them
    if (!onlyWhitespace) continue;

    // Wrap current element if it's a native emote (not already a heatsync wrapper)
    let currentWrapper = currentElement;
    if (!currentElement.classList.contains('heatsync-emote-wrapper')) {
      currentWrapper = document.createElement('span');
      // Native emotes get emote-overlay-global (gray) since they're platform emotes
      currentWrapper.className = 'heatsync-emote-wrapper heatsync-overlay emote-overlay-global';
      currentWrapper.dataset.emoteName = currentEmoteName;
      // Use outermost emote container to escape overflow:hidden from Twitch button structure
      const outerContainer = currentElement.closest('.chat-line__message--emote-button')
        || currentElement.closest('[class*="emote-button"]')
        || currentElement;
      if (!outerContainer.parentNode) continue;
      outerContainer.parentNode.insertBefore(currentWrapper, outerContainer);
      currentWrapper.appendChild(outerContainer);
    } else {
      currentWrapper.classList.add('heatsync-overlay');
    }

    // Force overlay positioning — use overflow: visible so wide overlays aren't clipped
    currentWrapper.style.cssText = 'position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: auto !important; height: auto !important; display: flex !important; align-items: center !important; justify-content: center !important; z-index: 2 !important; pointer-events: auto !important; overflow: visible !important;';
    // Ensure overlay image renders at native resolution, centered
    const overlayImgEl = currentWrapper.querySelector('img');
    if (overlayImgEl) {
      overlayImgEl.style.cssText = 'display: block !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important;';
    }

    if (existingStack) {
      // Add to existing stack (insert before block-all button if present)
      log(' ✅ Adding to existing stack:', currentEmoteName);
      const blockAllBtn = existingStack.querySelector('.heatsync-stack-block-all');
      if (blockAllBtn) {
        existingStack.insertBefore(currentWrapper, blockAllBtn);
      } else {
        existingStack.appendChild(currentWrapper);
      }
      // Update stack count
      const count = existingStack.querySelectorAll('.heatsync-emote-wrapper').length;
      existingStack.dataset.stackCount = String(count);
    } else if (baseElement) {
      // Wrap base element if it's a native emote
      let baseWrapper = baseElement;
      if (!baseElement.classList.contains('heatsync-emote-wrapper')) {
        baseWrapper = document.createElement('span');
        // Native emotes get emote-overlay-global (gray) since they're platform emotes
        baseWrapper.className = 'heatsync-emote-wrapper emote-overlay-global';
        const img = baseElement.tagName === 'IMG' ? baseElement : baseElement.querySelector('img');
        baseWrapper.dataset.emoteName = img?.alt || 'native';
        // Use outermost emote container to escape overflow:hidden from Twitch button structure
        const outerContainer = baseElement.closest('.chat-line__message--emote-button')
          || baseElement.closest('[class*="emote-button"]')
          || baseElement;
        if (!outerContainer.parentNode) continue;
        outerContainer.parentNode.insertBefore(baseWrapper, outerContainer);
        baseWrapper.appendChild(outerContainer);
      }

      log(' ✅ Creating stack:', baseWrapper.dataset.emoteName, '+', currentEmoteName);

      const stackContainer = document.createElement('span');
      stackContainer.className = 'heatsync-emote-stack';
      stackContainer.dataset.stackCount = '2'; // Will be updated when more overlays added
      stackContainer.title = t('btn_click_expand');

      // Add collapse button (×)
      const collapseBtn = document.createElement('span');
      collapseBtn.className = 'heatsync-stack-collapse';
      collapseBtn.textContent = '×';
      collapseBtn.title = t('btn_collapse');
      stackContainer.appendChild(collapseBtn);

      // Insert stack container before baseWrapper
      if (!baseWrapper.parentNode) continue;
      baseWrapper.parentNode.insertBefore(stackContainer, baseWrapper);

      // Move baseWrapper into stack (as base)
      stackContainer.appendChild(baseWrapper);

      // Move overlay into stack
      stackContainer.appendChild(currentWrapper);

      // Add block-all button (⊘)
      const blockAllBtn = document.createElement('span');
      blockAllBtn.className = 'heatsync-stack-block-all';
      blockAllBtn.textContent = '⊘';
      blockAllBtn.title = t('btn_block_all');
      stackContainer.appendChild(blockAllBtn);

      log('[hs-overlay] Stack HTML:', stackContainer.outerHTML.substring(0, 500));

      // Force overlay re-center when images load (fixes centering on first render)
      const imgs = stackContainer.querySelectorAll('img');
      imgs.forEach(img => {
        if (!img.complete) {
          img.onload = () => {
            if (!stackContainer.isConnected) return
            // Double rAF ensures paint is complete before re-centering
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                if (!stackContainer.isConnected) return
                const overlays = stackContainer.querySelectorAll('.heatsync-overlay');
                overlays.forEach(overlay => {
                  overlay.style.transform = 'none';
                  void overlay.offsetHeight;
                  overlay.style.transform = '';
                });
              });
            });
          };
        }
      });
    }
  }

  // Clean up empty containers left by emote replacement (only heatsync-created ones)
  const emptyContainers = messageElement.querySelectorAll('.text-fragment:empty, span.font-normal:empty');
  emptyContainers.forEach(el => {
    if (!el.closest('.heatsync-emote-stack') && !el.classList.contains('heatsync-emote-stack')) {
      el.remove();
    }
  });
}

// Wrap existing heatsync emote images (from tab completion) with our overlay wrapper
function wrapExistingHeatsyncEmotes(messageElement, allEmotes) {
  if (!messageElement.querySelector('img')) return
  // Find all images in the message that aren't already wrapped
  const images = messageElement.querySelectorAll('img:not(.heatsync-emote)');

  for (const img of images) {
    if (img.closest('.heatsync-emote-wrapper')) continue

    const src = img.src || ''
    const alt = img.alt || ''

    // Wrap emotes from known CDNs — but only wrap native Twitch emotes if they're
    // in our emote map (otherwise we break Twitch's animated emote rendering)
    const isHeatsyncCdn = src.includes('heatsync.org')
    const isThirdPartyEmoteCdn = src.includes('cdn.7tv.app') ||
                       src.includes('cdn.betterttv.net') ||
                       src.includes('cdn.frankerfacez.com')
    const isNativeTwitch = src.includes('static-cdn.jtvnw.net/emoticons')

    if (!isHeatsyncCdn && !isThirdPartyEmoteCdn && !isNativeTwitch) continue

    const matchedEmote = allEmotes.get(alt);

    // Never wrap native Twitch emotes — reparenting breaks animated emote rendering
    if (isNativeTwitch) continue

    // Use matched emote or create placeholder data
    const emote = matchedEmote || { name: alt, hash: alt, url: src };

    const blocked = blockedEmotes.has(emote.hash);
    const inInventory = inventoryHashSet.has(emote.hash) || inventoryNameSet.has(emote.name);

    // Third-party CDN emotes (7tv, bttv, ffz, twitch) are all "global" - can only block, not add to inventory
    // Only heatsync.org emotes can be added to inventory (blue)
    const isCdnEmote = isThirdPartyEmoteCdn || isNativeTwitch;

    let overlayClass = '';
    if (blocked) overlayClass = 'emote-overlay-blocked';
    else if (inInventory) overlayClass = 'emote-overlay-owned';
    else if (isCdnEmote) overlayClass = 'emote-overlay-global'; // gold - non-ownable
    else overlayClass = 'emote-overlay-unadded'; // blue - can be added (heatsync.org)

    // Create wrapper and move image into it
    const wrapper = document.createElement('span');
    wrapper.className = `heatsync-emote-wrapper ${overlayClass}`;
    wrapper.dataset.emoteName = emote.name;
    wrapper.dataset.emoteHash = emote.hash || '';
    wrapper.dataset.inInventory = String(inInventory);
    wrapper.style.cssText = 'display: inline-block; vertical-align: middle; cursor: pointer; position: relative; line-height: 0; font-size: 0;';

    // Add heatsync-emote class to img and remove any width constraints
    img.classList.add('heatsync-emote');
    img.dataset.emoteName = emote.name;
    img.dataset.emoteHash = emote.hash || '';

    // Remove title to prevent native browser tooltip (we have our own)
    img.removeAttribute('title');

    // Native size - remove any constraints from other extensions
    img.style.height = 'auto';
    img.style.width = 'auto';
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';

    // Insert wrapper before image, then move image into wrapper
    if (!img.parentNode) {
      log(' ❌ SKIP - img has no parentNode:', emote.name);
      continue;
    }
    img.parentNode.insertBefore(wrapper, img);
    wrapper.appendChild(img);

    // Verify it's actually in DOM
    const inDOM = document.contains(wrapper);
    log(' ✅ WRAPPED emote:', emote.name, 'inDOM:', inDOM, 'parent:', wrapper.parentNode?.tagName);
  }
}


// Unicode emoji detection — matches emoji sequences (presentation + ZWJ combos)
const UNICODE_EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]+$/u

// Replace emotes with overlay stacking support (emotes ending in 0 stack on previous)
// Using DOM nodes instead of innerHTML to avoid React conflicts
function replaceEmotesWithStacking(element, allEmotes) {
  const text = element.textContent
  const words = text.split(/(\s+)/)

  // Process words to find emotes and group overlays
  // Key insight: whitespace between emotes should be absorbed into stack
  // "4Head TriHard0" should stack TriHard on 4Head despite the space
  const resultNodes = [];
  let currentStack = [];
  let pendingWhitespace = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const trimmed = word.trim();

    // Whitespace - accumulate, don't flush yet
    if (!trimmed) {
      pendingWhitespace += word;
      continue;
    }

    // Check if word ends with 0 - potential overlay (e.g., "TriHard0" → use "TriHard")
    const endsWithZero = trimmed.endsWith('0') && trimmed.length > 1;
    const strippedName = endsWithZero ? trimmed.slice(0, -1) : trimmed;

    // Try stripped name first (for overlay), then full name
    let emote = null;
    let isOverlay = false;

    if (endsWithZero) {
      emote = allEmotes.get(strippedName);
      if (emote) isOverlay = true;
    }

    // Fallback to full word if no overlay match
    if (!emote) {
      emote = allEmotes.get(trimmed);
      // Use isZeroWidthEmote() for comprehensive overlay detection:
      // - zeroWidth property from 7TV API
      // - flags bitmask (7TV uses flag 1 for zero-width)
      // - KNOWN_OVERLAY_EMOTES list (withcoffee, rain, fog, etc.)
      // - name ends with '0' and base exists
      if (emote) {
        isOverlay = isZeroWidthEmote(trimmed, emote, allEmotes)
      }
    }

    if (emote && isOverlay && currentStack.length > 0) {
      // Overlay emote with existing base - add to stack, discard pending whitespace
      currentStack.push({ emote, isOverlay: true, originalWord: trimmed });
      pendingWhitespace = '';
    } else if (emote && isOverlay && currentStack.length === 0) {
      // Overlay emote but NO base in our emote map (base might be native Twitch emote)
      // Output as standalone overlay - stackAdjacentOverlayEmotes will handle stacking with native emotes
      if (pendingWhitespace) {
        resultNodes.push(document.createTextNode(pendingWhitespace));
        pendingWhitespace = '';
      }
      // Mark as overlay so stackAdjacentOverlayEmotes knows to stack it
      resultNodes.push(generateEmoteElement(emote, true));
    } else if (emote) {
      // Non-overlay emote - flush previous stack first
      if (currentStack.length > 0) {
        resultNodes.push(flushEmoteStack(currentStack));
        currentStack = [];
      }
      // Add accumulated whitespace before this emote
      if (pendingWhitespace) {
        resultNodes.push(document.createTextNode(pendingWhitespace));
        pendingWhitespace = '';
      }
      currentStack.push({ emote, isOverlay: false, originalWord: trimmed });
    } else {
      // Check for emoji :shortcode:
      if (typeof EMOJI_BY_NAME !== 'undefined' && trimmed.startsWith(':') && trimmed.endsWith(':') && trimmed.length > 2) {
        const emojiName = trimmed.slice(1, -1)
        const emojiEntry = EMOJI_BY_NAME.get(emojiName)
        if (emojiEntry) {
          // Treat emoji as stackable base (overlays can sit on top)
          if (currentStack.length > 0) {
            resultNodes.push(flushEmoteStack(currentStack))
            currentStack = []
          }
          if (pendingWhitespace) {
            resultNodes.push(document.createTextNode(pendingWhitespace))
            pendingWhitespace = ''
          }
          currentStack.push({ emoji: emojiEntry.emoji, emojiName, isOverlay: false, isEmoji: true, originalWord: trimmed })
          continue
        }
      }
      // Check for Unicode emoji (🏙️, 💵, etc.) — stackable base
      if (UNICODE_EMOJI_RE.test(trimmed)) {
        if (currentStack.length > 0) {
          resultNodes.push(flushEmoteStack(currentStack))
          currentStack = []
        }
        if (pendingWhitespace) {
          resultNodes.push(document.createTextNode(pendingWhitespace))
          pendingWhitespace = ''
        }
        currentStack.push({ emoji: trimmed, isOverlay: false, isEmoji: true, originalWord: trimmed })
        continue
      }
      // Not an emote - flush stack and add word
      if (currentStack.length > 0) {
        resultNodes.push(flushEmoteStack(currentStack));
        currentStack = [];
      }
      // Add accumulated whitespace
      if (pendingWhitespace) {
        resultNodes.push(document.createTextNode(pendingWhitespace));
        pendingWhitespace = '';
      }
      resultNodes.push(document.createTextNode(word));
    }
  }

  // Flush any remaining stack
  if (currentStack.length > 0) {
    resultNodes.push(flushEmoteStack(currentStack));
  }
  // Add any trailing whitespace
  if (pendingWhitespace) {
    resultNodes.push(document.createTextNode(pendingWhitespace));
  }

  // Use replaceChildren() instead of innerHTML (React-safe)
  // CRITICAL: Validate element is still in DOM before modification
  if (!element || !document.contains(element)) {
    log('⚠️ Element removed from DOM, skipping emote replacement');
    return;
  }

  try {
    element.replaceChildren(...resultNodes);
  } catch (e) {
    log('⚠️ replaceChildren failed (likely React conflict), skipping:', e.message);
  }

  // Helper to flush emote stack to DOM node
  function generateEmojiElement(emoji, title) {
    const span = document.createElement('span')
    span.className = 'heatsync-emoji'
    span.textContent = emoji
    if (title) span.title = `:${title}:`
    span.style.cssText = 'display: inline-block; vertical-align: middle; position: relative; z-index: 1;'
    return span
  }

  function flushEmoteStack(stack) {
    if (stack.length === 0) return document.createTextNode('');
    if (stack.length === 1) {
      const entry = stack[0]
      if (entry.isEmoji) return generateEmojiElement(entry.emoji, entry.emojiName)
      return generateEmoteElement(entry.emote, entry.isOverlay);
    }
    // Multiple emotes - wrap in stack container with buttons
    const stackContainer = document.createElement('span');
    stackContainer.className = 'heatsync-emote-stack';
    stackContainer.dataset.stackCount = String(stack.length);
    stackContainer.title = t('btn_click_expand');

    // Add collapse button (×)
    const collapseBtn = document.createElement('span');
    collapseBtn.className = 'heatsync-stack-collapse';
    collapseBtn.textContent = '×';
    collapseBtn.title = t('btn_collapse');
    stackContainer.appendChild(collapseBtn);

    // Add emotes and emojis
    stack.forEach((entry) => {
      if (entry.isEmoji) {
        stackContainer.appendChild(generateEmojiElement(entry.emoji, entry.emojiName))
      } else {
        stackContainer.appendChild(generateEmoteElement(entry.emote, entry.isOverlay))
      }
    });

    // Add block-all button (⊘)
    const blockAllBtn = document.createElement('span');
    blockAllBtn.className = 'heatsync-stack-block-all';
    blockAllBtn.textContent = '⊘';
    blockAllBtn.title = 'block all';
    stackContainer.appendChild(blockAllBtn);

    // Force overlay re-center when images load (fixes centering on first render)
    const imgs = stackContainer.querySelectorAll('img');
    imgs.forEach(img => {
      if (!img.complete) {
        img.onload = () => {
          if (!stackContainer.isConnected) return
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!stackContainer.isConnected) return
              const overlays = stackContainer.querySelectorAll('.heatsync-overlay');
              overlays.forEach(overlay => {
                overlay.style.transform = 'none';
                void overlay.offsetHeight;
                overlay.style.transform = '';
              });
            });
          });
        };
      }
    });

    return stackContainer;
  }
}

// Generate DOM element for a single emote (React-safe, no innerHTML)
function generateEmoteElement(emote, isOverlay) {
    const blocked = blockedEmotes.has(emote.hash);
    const inInventory = inventoryHashSet.has(emote.hash) || inventoryNameSet.has(emote.name);

    // Third-party CDN emotes are all "global" (gray) - can only block, not add to inventory
    const url = emote.url || '';
    const isThirdPartyCdn = url.includes('cdn.7tv.app') ||
                            url.includes('cdn.betterttv.net') ||
                            url.includes('cdn.frankerfacez.com') ||
                            url.includes('static-cdn.jtvnw.net');

    // Determine overlay class based on state
    let overlayClass = '';
    if (blocked) {
      overlayClass = 'emote-overlay-blocked';
    } else if (inInventory) {
      overlayClass = 'emote-overlay-owned';
    } else if (isThirdPartyCdn) {
      overlayClass = 'emote-overlay-global'; // gold - non-ownable
    } else {
      overlayClass = 'emote-overlay-unadded'; // blue - can be added
    }

    const cssClasses = ['heatsync-emote'];
    if (blocked) cssClasses.push('emote-blocked');
    else if (inInventory) cssClasses.push('emote-in-set');
    else if (isThirdPartyCdn) cssClasses.push('emote-global');

    const overlayWrapperClass = isOverlay ? ' heatsync-overlay' : '';

    // Create wrapper span
    const wrapper = document.createElement('span');
    wrapper.className = `heatsync-emote-wrapper ${overlayClass}${overlayWrapperClass}`;
    wrapper.dataset.emoteHash = emote.hash;
    wrapper.dataset.emoteName = emote.name;
    wrapper.dataset.inInventory = String(inInventory);
    if (isOverlay) {
      // Overlay wrapper: absolute positioned, centered on base emote
      wrapper.style.cssText = 'position: absolute !important; top: 50% !important; left: 50% !important; transform: translate(-50%, -50%) !important; width: auto !important; height: auto !important; display: inline-block !important; z-index: 2 !important; pointer-events: auto !important; overflow: visible !important; cursor: pointer;';
    } else {
      wrapper.style.cssText = 'display: inline-block; vertical-align: middle; cursor: pointer; position: relative; line-height: 0; font-size: 0;';
    }

    // Overlay emotes render at 1x native size (their designed display size)
    const imgSrc = emote.url;

    // Create image - native size, no constraints
    const img = document.createElement('img');
    img.src = imgSrc;
    img.alt = emote.name;
    img.style.cssText = `display: block !important; width: auto !important; height: ${isOverlay ? 'auto' : 'var(--hs-emote-height, 28px)'} !important; max-width: none !important; max-height: none !important; ${blocked ? 'opacity: 0;' : ''} cursor: pointer;`;
    // Force overlay images to render at native 1x dimensions once loaded
    if (isOverlay && !blocked) {
      img.onload = function() {
        const nw = this.naturalWidth, nh = this.naturalHeight
        this.style.setProperty('width', nw + 'px', 'important')
        this.style.setProperty('height', nh + 'px', 'important')
        this.style.setProperty('min-width', nw + 'px', 'important')
        this.style.setProperty('min-height', nh + 'px', 'important')
        if (HEATSYNC_DEBUG) {
          // Debug: walk up DOM and log what might constrain us
          let el = this, chain = []
          for (let i = 0; i < 8 && el; i++) {
            const cs = getComputedStyle(el)
            chain.push(`${el.tagName}.${el.className.split(' ')[0] || ''}: ${el.clientWidth}x${el.clientHeight} ow=${cs.overflow} mw=${cs.maxWidth} mh=${cs.maxHeight}`)
            el = el.parentElement
          }
          log(' 📐 Overlay', emote.name, `natural=${nw}x${nh} rendered=${this.clientWidth}x${this.clientHeight}`)
          log(' 📐 DOM chain:', chain.join(' → '))
        }
      }
    }
    // For blocked emotes, lock dimensions on load so outline matches exactly
    if (blocked) {
      img.onload = function() {
        this.style.width = this.naturalWidth + 'px'
        this.style.height = this.naturalHeight + 'px'
      }
    }
    img.className = cssClasses.join(' ');
    img.dataset.emoteHash = emote.hash;
    img.dataset.emoteName = emote.name;

    wrapper.appendChild(img);
    log(' 🎯 generateEmoteElement:', emote.name, 'class:', wrapper.className);
    return wrapper;
}

// Retroactive emote replacement — DOM-based (no innerHTML round-trip)
// Walks text nodes only, splits on emote name, inserts DOM elements directly.
function replaceEmoteInText(element, emote) {
  const regex = createEmoteRegex(emote.name)
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const matches = []

  // Collect matching text nodes first (mutating during walk is unsafe)
  let node
  while ((node = walker.nextNode())) {
    if (regex.test(node.textContent)) {
      matches.push(node)
      regex.lastIndex = 0
    }
  }

  for (const textNode of matches) {
    const parts = textNode.textContent.split(regex)
    if (parts.length <= 1) continue

    const frag = document.createDocumentFragment()
    for (let i = 0; i < parts.length; i++) {
      if (parts[i]) frag.appendChild(document.createTextNode(parts[i]))
      if (i < parts.length - 1) {
        // Use generateEmoteElement if available, otherwise build manually
        const emoteEl = generateEmoteElement(emote)
        frag.appendChild(emoteEl)
      }
    }
    if (textNode.parentNode) {
      textNode.parentNode.replaceChild(frag, textNode)
    }
  }
}

// Setup event delegation for all emote clicks (ONE listener for all emotes)
function setupEmoteClickHandlers() {
  cleanup.addEventListener(document, 'click', async (e) => {
    const wrapper = e.target.closest('.heatsync-emote-wrapper');
    if (!wrapper) return;

    e.preventDefault();
    e.stopPropagation();

    const hash = wrapper.dataset.emoteHash || '';
    const emoteName = wrapper.dataset.emoteName;
    const operationKey = `click:${hash || emoteName}`;

    // Prevent double-clicks while operation in progress
    if (pendingOperations.has(operationKey)) {
      log(' ⏳ Operation already in progress:', emoteName);
      return;
    }

    const isBlocked = hash ? blockedEmotes.has(hash) : blockedEmotes.has(emoteName);
    log(' LEFT CLICK - emote:', emoteName, 'hash:', hash, 'blocked:', isBlocked);

    if (isBlocked) {
      // BLOCKED → UNBLOCK
      pendingOperations.add(operationKey);
      try {
        const result = await safeSendMessage({ type: 'unblock_emote', hash });
        if (result?.success) {
          blockedEmotes.delete(hash);
          updateEmoteState(hash, emoteName, 'neutral');
          log(' ✅ Unblocked:', emoteName);
          showToast(t('content_toast_unblocked', [emoteName]), 'success');
        } else {
          showToast(t('content_toast_failed_unblock', [String(result?.error || 'Unknown error')]), 'error');
        }
      } finally {
        pendingOperations.delete(operationKey);
      }
    } else {
      // NOT BLOCKED → INSERT into chat via Slate (postMessage to autocomplete-hook)
      log(' INSERTING EMOTE via Slate:', emoteName);
      // Get emote URL and hash for Slate insertion
      const imgEl = wrapper.querySelector('img');
      const emoteUrl = imgEl?.src || '';
      window.postMessage({
        type: 'heatsync-insert-emote',
        name: emoteName,
        hash: hash || emoteName,
        url: emoteUrl
      }, location.origin);
      log(' 💬 Sent insert request for:', emoteName);
    }
  }, 'emote-click');

  cleanup.addEventListener(document, 'contextmenu', async (e) => {
    const wrapper = e.target.closest('.heatsync-emote-wrapper');
    if (!wrapper) return;

    e.preventDefault();
    e.stopPropagation();

    const hash = wrapper.dataset.emoteHash;
    const emoteName = wrapper.dataset.emoteName;
    const operationKey = `rightclick:${hash}`;

    // Prevent double-clicks while operation in progress
    if (pendingOperations.has(operationKey)) {
      log(' ⏳ Operation already in progress:', emoteName);
      return;
    }

    const isBlocked = blockedEmotes.has(hash);
    const inInventory = inventoryHashSet.has(hash) || inventoryNameSet.has(emoteName);
    // Check if this is a global emote - globals can only be blocked, not added/removed from your set
    const isGlobalEmote = wrapper.classList.contains('emote-overlay-global') ||
                          globalNameSet.has(emoteName);

    if (isBlocked) {
      // BLOCKED → NEUTRAL (unblock)
      pendingOperations.add(operationKey);
      try {
        const result = await safeSendMessage({ type: 'unblock_emote', hash });
        if (result?.success) {
          blockedEmotes.delete(hash);
          updateEmoteState(hash, emoteName, isGlobalEmote ? 'global' : 'neutral');
          log(' ✅ Unblocked:', emoteName);
        } else {
          showToast(t('content_toast_failed_unblock', [String(result?.error || 'Unknown error')]), 'error');
        }
      } finally {
        pendingOperations.delete(operationKey);
      }
    } else if (inInventory && !isGlobalEmote) {
      // ADDED → NEUTRAL (remove from your set) - only for non-global emotes
      pendingOperations.add(operationKey);
      log(' ➖ Removing from your set:', emoteName);

      // Show loading state
      wrapper.style.opacity = '0.5';

      // Optimistically update UI first
      const previousInventory = [...emoteInventory];
      emoteInventory = emoteInventory.filter(e => e.hash !== hash && e.name !== emoteName);
      pendingRemovals.add(emoteName);
      allEmotesDirty = true
      emoteGeneration++
      _tabEmoteMapDirty = true
      updateEmoteState(hash, emoteName, 'neutral');

      try {
        const result = await safeSendMessage({
          type: 'remove_from_inventory',
          emoteHash: hash,
          emoteName: emoteName
        });

        wrapper.style.opacity = '';

        if (result?.success) {
          // Don't clear pendingRemovals here — wait for inventory_update to confirm server-side deletion
          showToast(t('content_toast_removed', [emoteName]), 'success');
          // Clear any pending broadcasts for this emote
          for (const key of pendingEmoteBroadcasts.keys()) {
            if (key.endsWith(`:${emoteName}`)) {
              log(' 🗑️ Clearing stale broadcast:', key);
              _deleteBroadcast(key);
            }
          }
        } else {
          // Rollback optimistic update on failure
          pendingRemovals.delete(emoteName);
          emoteInventory = previousInventory;
          allEmotesDirty = true
          emoteGeneration++
          _tabEmoteMapDirty = true
          updateEmoteState(hash, emoteName, 'added');
          showToast(t('content_toast_failed_remove', [emoteName, String(result?.error || 'Unknown error')]), 'error');
        }
      } catch (err) {
        wrapper.style.opacity = '';
        if (!extensionContextValid) return; // Don't rollback/show error if context invalidated
        // Rollback on error
        pendingRemovals.delete(emoteName);
        emoteInventory = previousInventory;
        allEmotesDirty = true
        emoteGeneration++
        _tabEmoteMapDirty = true
        updateEmoteState(hash, emoteName, 'added');
        showToast(t('content_toast_failed_remove', [emoteName, String(err.message)]), 'error');
      } finally {
        pendingOperations.delete(operationKey);
      }
    } else {
      // NEUTRAL → BLOCKED
      pendingOperations.add(operationKey);

      // Optimistically block
      blockedEmotes.add(hash);
      updateEmoteState(hash, emoteName, 'blocked');

      try {
        const result = await safeSendMessage({ type: 'block_emote', hash });
        if (result?.success) {
          log(' 🚫 Blocked:', emoteName);
          showToast(t('content_toast_blocked', [emoteName]), 'info');
        } else {
          // Rollback on failure
          blockedEmotes.delete(hash);
          updateEmoteState(hash, emoteName, 'neutral');
          showToast(t('content_toast_failed_block', [String(result?.error || 'Unknown error')]), 'error');
        }
      } catch (err) {
        if (!extensionContextValid) return; // Don't rollback/show error if context invalidated
        // Rollback on error
        blockedEmotes.delete(hash);
        updateEmoteState(hash, emoteName, 'neutral');
        showToast(t('content_toast_failed_block', [String(err.message)]), 'error');
      } finally {
        pendingOperations.delete(operationKey);
      }
    }
  }, 'emote-contextmenu');

  log(' ✅ Event delegation setup for emote clicks');
}

// Update visual state of all instances of an emote
function updateEmoteState(hash, emoteName, state) {
  log(` Updating emote "${emoteName}" to state: ${state}, hash: ${hash}`);

  // Query by hash OR name (handles old vs normalized hash mismatch)
  const selector = `[data-emote-hash="${hash}"], [data-emote-name="${emoteName}"]`;
  const elements = (findChatContainer() || document).querySelectorAll(selector);
  log(` updateEmoteState found ${elements.length} elements for selector:`, selector);

  elements.forEach(el => {
    // Handle both wrapper divs and direct img elements
    const img = el.tagName === 'IMG' ? el : el.querySelector('.heatsync-emote');
    if (!img) {
      warn(' No img found for hash:', hash);
      return;
    }

    const wrapper = el.tagName === 'IMG' ? el.parentElement : el;
    const emoteUrl = wrapper?.dataset?.emoteUrl || img?.src || '';

    // Check if third-party CDN emote (7TV, BTTV, FFZ, Twitch native)
    const isThirdPartyCdn = emoteUrl.includes('cdn.7tv.app') ||
                            emoteUrl.includes('cdn.betterttv.net') ||
                            emoteUrl.includes('cdn.frankerfacez.com') ||
                            emoteUrl.includes('static-cdn.jtvnw.net');

    // Third-party emotes can only be blocked or global (gray) - never unadded (purple)
    let effectiveState = state;
    if (isThirdPartyCdn && (state === 'neutral' || state === 'unadded')) {
      effectiveState = 'global';
    }

    // Remove all state classes
    img.classList.remove('emote-blocked', 'emote-in-set');

    // Update based on new state (overlay classes)
    if (wrapper) {
      wrapper.classList.remove('emote-overlay-blocked', 'emote-overlay-owned', 'emote-overlay-unadded', 'emote-overlay-global');
    }

    switch(effectiveState) {
      case 'blocked':
        if (wrapper) wrapper.classList.add('emote-overlay-blocked');
        // Lock dimensions so outline matches the emote exactly (even wide ones like 96x32)
        if (img.naturalWidth) {
          img.style.width = img.naturalWidth + 'px'
          img.style.height = img.naturalHeight + 'px'
        }
        img.style.opacity = '0';
        img.classList.add('emote-blocked');
        break;

      case 'added':
        if (wrapper) wrapper.classList.add('emote-overlay-owned');
        img.style.opacity = '';
        img.classList.add('emote-in-set');
        log(' Applied emote-overlay-owned to:', emoteName);
        break;

      case 'global':
        if (wrapper) wrapper.classList.add('emote-overlay-global');
        img.style.opacity = '';
        log(' Applied emote-overlay-global to:', emoteName);
        break;

      case 'neutral':
      default:
        if (wrapper) wrapper.classList.add('emote-overlay-unadded');
        img.style.opacity = '';
        break;
    }
  });
}

// BULLETPROOF emote hover preview - uses stored emote data, not URL parsing
(function setupEmoteHoverPreview() {
  // Single global preview element
  const previewEl = document.createElement('div');
  previewEl.className = 'heatsync-emote-preview';
  previewEl.id = 'heatsync-emote-preview-singleton';
  document.body.appendChild(previewEl);

  let currentWrapper = null;
  let hideTimeout = null;

  function showPreview(wrapper) {
    if (currentWrapper === wrapper) return;
    currentWrapper = wrapper;
    clearTimeout(hideTimeout);

    // Check if this emote is in a stack - if so, show all stacked emotes
    const stack = wrapper.closest('.heatsync-emote-stack');
    const emotesToShow = [];

    // upgradeUrl upgrades the img src directly to max resolution
    // (no hash lookup — hash can match wrong emote)
    function upgradeUrl(url) {
      if (!url) return url;
      if (url.includes('cdn.7tv.app'))
        return url.includes('.webp') ? url.replace(/\/[123]x\.webp/, '/4x.webp') : url.replace(/\/[123]x$/, '/4x');
      if (url.includes('cdn.betterttv.net'))
        return url.includes('.webp') ? url.replace(/\/[12]x\.webp/, '/3x.webp') : url.replace(/\/[12]x/, '/3x');
      if (url.includes('cdn.frankerfacez.com'))
        return url.replace(/\/[123]$/, '/4').replace(/\/[123]\?/, '/4?');
      if (url.includes('static-cdn.jtvnw.net'))
        return url.replace(/\/[12]\.0/, '/3.0');
      return url;
    }

    if (stack) {
      const stackedWrappers = stack.querySelectorAll('.heatsync-emote-wrapper');
      stackedWrappers.forEach(w => {
        const wImg = w.querySelector('img');
        const wName = w.dataset.emoteName || (wImg && wImg.alt) || '';
        const wSrc = wImg ? wImg.src : '';
        if (wSrc) {
          const w4 = (wImg?.offsetWidth || 28) * 4;
          const h4 = (wImg?.offsetHeight || 28) * 4;
          emotesToShow.push({ name: wName, src: wSrc, hiRes: upgradeUrl(wSrc), w: w4, h: h4 });
        }
      });
    } else {
      const img = wrapper.querySelector('img');
      const emoteName = wrapper.dataset.emoteName || (img && img.alt) || '';
      const src = img ? img.src : '';
      if (src) {
        const w4 = (img?.offsetWidth || 28) * 4;
        const h4 = (img?.offsetHeight || 28) * 4;
        emotesToShow.push({ name: emoteName, src: src, hiRes: upgradeUrl(src), w: w4, h: h4 });
      }
    }

    if (emotesToShow.length === 0) return;

    log(' Preview:', emotesToShow.length, 'emotes');

    // Aggressively strip ALL tooltip attributes from wrapper, img, AND parent elements
    const img = wrapper.querySelector('img');
    wrapper.removeAttribute('aria-describedby');
    wrapper.removeAttribute('data-a-target');
    wrapper.removeAttribute('title');
    if (img) {
      img.removeAttribute('title');
      img.removeAttribute('aria-label');
      img.removeAttribute('aria-describedby');
      img.removeAttribute('data-a-target');
    }
    // Also strip from parent containers that Twitch might use
    let parent = wrapper.parentElement;
    for (let i = 0; i < 5 && parent; i++) {
      parent.removeAttribute('aria-describedby');
      parent.removeAttribute('title');
      if (parent.matches('[data-a-target*="emote"]')) {
        parent.removeAttribute('data-a-target');
      }
      parent = parent.parentElement;
    }

    // Build HTML for all emotes — 4x the displayed size
    const emotesHtml = emotesToShow.map(e => `
      <div class="heatsync-stacked-emote-item">
        <img src="${escapeHtml(e.src)}" alt="${escapeHtml(e.name)}" style="width:${e.w}px;height:${e.h}px;">
        <div class="heatsync-emote-preview-name">${escapeHtml(e.name)}</div>
      </div>
    `).join('');

    previewEl.innerHTML = emotesToShow.length > 1
      ? `<div class="heatsync-stacked-preview">${emotesHtml}</div>`
      : `<img src="${escapeHtml(emotesToShow[0].src)}" alt="${escapeHtml(emotesToShow[0].name)}" style="width:${emotesToShow[0].w}px;height:${emotesToShow[0].h}px;">
         <div class="heatsync-emote-preview-name">${escapeHtml(emotesToShow[0].name)}</div>`;

    // Show immediately but position later (after image loads)
    previewEl.style.setProperty('display', 'block', 'important');

    // Initial positioning (will adjust after image loads)
    const rect = wrapper.getBoundingClientRect();
    previewEl.style.left = `${rect.left + rect.width / 2}px`;
    previewEl.style.top = `${rect.top - 8}px`;
    previewEl.style.transform = 'translate(-50%, -100%)';

    // Reposition after image loads (accurate dimensions for wide emotes)
    const previewImg = previewEl.querySelector('img');
    function repositionPreview() {
      const tooltipRect = previewEl.getBoundingClientRect();
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      let top = rect.top - tooltipRect.height - 8;
      const pad = 8;
      if (left < pad) left = pad;
      else if (left + tooltipRect.width > window.innerWidth - pad)
        left = window.innerWidth - tooltipRect.width - pad;
      if (top < pad) top = rect.bottom + 8;
      previewEl.style.left = `${left}px`;
      previewEl.style.top = `${top}px`;
      previewEl.style.transform = 'none';
    }
    if (previewImg) {
      previewImg.onload = () => {
        if (!previewEl.isConnected) return
        repositionPreview()
      }
      // Try hi-res upgrade — swap in silently if it loads
      const e0 = emotesToShow[0];
      if (e0.hiRes && e0.hiRes !== e0.src) {
        const probe = new Image();
        probe.onload = () => {
          if (!previewEl.isConnected) return
          previewEl.querySelectorAll('img').forEach((img, i) => {
            const hi = emotesToShow[i]?.hiRes;
            if (hi) { img.src = hi; repositionPreview(); }
          });
        };
        probe.src = e0.hiRes;
      }
    }

    // Add body class to suppress ALL native tooltips
    document.body.classList.add('heatsync-preview-active');

    // NUCLEAR: Hide any visible Twitch tooltips immediately
    document.querySelectorAll('.tw-tooltip, [role="tooltip"], .ReactModal__Overlay').forEach(el => {
      if (!el.closest('.heatsync-emote-preview')) {
        el.style.display = 'none';
      }
    });
  }

  function hidePreview() {
    clearTimeout(hideTimeout);
    currentWrapper = null;
    previewEl.style.setProperty('display', 'none', 'important');
    document.body.classList.remove('heatsync-preview-active');
  }

  // Tooltip hiding disabled - was causing issues with chat identity badge

  // Event delegation - capture phase to fire before Twitch handlers
  cleanup.addEventListener(document, 'mouseover', (e) => {
    const wrapper = e.target.closest('.heatsync-emote-wrapper');
    if (wrapper) {
      showPreview(wrapper);
    } else if (currentWrapper && !e.target.closest('.heatsync-emote-preview')) {
      hidePreview();
    }
  }, 'emote-hover-mouseover', true);

  cleanup.addEventListener(document, 'mouseout', (e) => {
    const wrapper = e.target.closest('.heatsync-emote-wrapper');
    if (wrapper) {
      const related = e.relatedTarget;
      if (!related || !wrapper.contains(related)) {
        hidePreview();
      }
    }
  }, 'emote-hover-mouseout', true);

  // BULLETPROOF: mousemove kills preview if not on an emote — no lingering, no delay
  cleanup.addEventListener(document, 'mousemove', (e) => {
    if (!currentWrapper) return
    const target = e.target
    if (!target || !target.closest) return
    if (target.closest('.heatsync-emote-wrapper') || target.closest('.heatsync-emote-preview')) return
    hidePreview()
  }, 'emote-hover-mousemove-kill')

  log(' ✅ Emote hover preview setup');
})();

// Profile card on username click — matches website profile-card-pro style
(function setupProfileCard() {
  let cardEl = null
  let cardPollInterval = null
  const profileCache = new Map()
  const PROFILE_TTL = 300000 // 5 min
  const PROFILE_CACHE_MAX = 50

  // Username selectors for click interception (capture phase)
  const usernameSelectors = [
    '.chat-author__display-name',
    '[data-a-target="chat-message-username"]',
    '.chat-line__username',
    '.hs-username-colored',
    '.hs-mention-colored',
    '[data-hs-username]',
    '.hs-mc-user' // multichat usernames
  ].join(', ')

  // XSS helpers — all user data goes through esc() before insertion
  function esc(str) {
    const d = document.createElement('div')
    d.textContent = str
    return d.innerHTML
  }

  function safeUrl(url) {
    if (!url) return ''
    try {
      const u = new URL(url)
      return ['https:', 'http:'].includes(u.protocol) ? u.href : ''
    } catch { return '' }
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
    return String(n)
  }

  function formatAge(dateStr) {
    if (!dateStr) return null
    const ms = Date.now() - new Date(dateStr).getTime()
    const years = Math.floor(ms / (365.25 * 86400000))
    const months = Math.floor((ms % (365.25 * 86400000)) / (30.44 * 86400000))
    if (years > 0) return `${years}y ${months}m`
    if (months > 0) return `${months}m`
    const days = Math.floor(ms / 86400000)
    return `${days}d`
  }

  function formatRelTime(dateStr) {
    if (!dateStr) return ''
    const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
    if (d > 365) return ' ' + Math.floor(d / 365) + 'y'
    if (d > 30) return ' ' + Math.floor(d / 30) + 'mo'
    if (d > 0) return ' ' + d + 'd'
    return ''
  }

  // Detect current platform
  function getPlatform() {
    if (window.location.hostname.includes('kick.com')) return 'kick'
    return 'twitch'
  }

  // Get current channel login from URL
  function getChannelLogin() {
    if (!window.location.hostname.includes('twitch.tv')) return null
    const match = window.location.pathname.match(/^\/(?:popout\/|embed\/)?([a-zA-Z0-9_]+)/)
    if (!match) return null
    const ch = match[1].toLowerCase()
    const excluded = ['directory', 'settings', 'videos', 'moderator', 'subscriptions', 'search', 'downloads', 'p']
    return excluded.includes(ch) ? null : ch
  }

  // Followage + follow counts lookup via Twitch GQL (MAIN world proxy)
  const followageCache = new Map()
  const FOLLOWAGE_TTL = 300000
  async function lookupFollowage(username, channelLogin) {
    if (!username || !channelLogin) return undefined
    if (username.toLowerCase() === channelLogin.toLowerCase()) return undefined
    const key = `${username.toLowerCase()}:${channelLogin.toLowerCase()}`
    const cached = followageCache.get(key)
    if (cached) {
      if (Date.now() - cached.ts >= FOLLOWAGE_TTL) { followageCache.delete(key) }
      else return cached.result
    }

    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2)
      const handler = (e) => {
        if (e.data?.type === 'heatsync-gql-response' && e.data.id === id) {
          window.removeEventListener('message', handler)
          clearTimeout(timer)
          const user = e.data.data?.data?.user
          const result = {
            followedAt: user?.follow?.followedAt || null,
            followingCount: user?.follows?.totalCount ?? null,
            followerCount: user?.followers?.totalCount ?? null,
            channelFollowedAt: e.data.data?.data?.channel?.follow?.followedAt || null,
          }
          followageCache.set(key, { result, ts: Date.now() })
          while (followageCache.size > 500) followageCache.delete(followageCache.keys().next().value)
          resolve(result)
        }
      }
      window.addEventListener('message', handler)
      const safeUser = username.replace(/[^a-z0-9_]/gi, '')
      const safeChan = channelLogin.replace(/[^a-z0-9_]/gi, '')
      window.postMessage({
        type: 'heatsync-gql-request',
        id,
        operation: null,
        variables: {},
        rawQuery: `{ user(login: "${safeUser}") { follow(targetLogin: "${safeChan}") { followedAt } follows { totalCount } followers { totalCount } } channel: user(login: "${safeChan}") { follow(targetLogin: "${safeUser}") { followedAt } } }`
      }, location.origin)
      const timer = setTimeout(() => {
        window.removeEventListener('message', handler)
        resolve(undefined)
      }, 5000)
    })
  }

  // Fetch profile (cached)
  async function fetchProfile(username, force = false) {
    const key = username.toLowerCase()
    const cached = profileCache.get(key)
    if (!force) {
      if (cached) {
        const ttl = cached.data?.twitch_is_live || cached.data?.kick_is_live ? 60000 : PROFILE_TTL
        if (Date.now() - cached.ts >= ttl) { profileCache.delete(key) }
        else return cached.data
      }
    }

    try {
      const data = await HS.apiFetch(`/api/profile/${encodeURIComponent(username)}`, { auth: true })
      const profile = data.profile || data
      profileCache.set(key, { data: profile, ts: Date.now() })
      while (profileCache.size > PROFILE_CACHE_MAX) profileCache.delete(profileCache.keys().next().value)
      return profile
    } catch (err) {
      log(' Profile fetch failed:', username, err.message)
      return null
    }
  }

  // Build card DOM safely — no innerHTML with user data
  function buildCardDOM(profile, username) {
    const frag = document.createDocumentFragment()

    if (!profile) {
      const msg = document.createElement('div')
      msg.className = 'hs-pc-loading'
      msg.textContent = t('common_user_not_found')
      frag.appendChild(msg)
      return frag
    }

    const avatarUrl = safeUrl(profile.profile_image_url || profile.twitch_profile_pic || profile.kick_profile_pic || '')
    const displayName = profile.display_name || profile.username || username
    const stats = profile.stats || {}
    const heat = stats.total_heat || 0
    const op = stats.op_count || 0
    const re = stats.re_count || 0
    const twitchFollowers = profile.twitch_followers || 0
    const hsFollowers = stats.followers || 0
    const followers = hsFollowers || twitchFollowers
    const platform = getPlatform()
    const role = profile.role || (profile.is_admin ? 'admin' : null)
    const broadcasterType = profile.twitch_broadcaster_type

    // Account age
    const dates = [profile.account_created_at, profile.twitch_created_at, profile.created_at].filter(Boolean)
    const age = dates.length > 0 ? formatAge(new Date(Math.min(...dates.map(d => new Date(d).getTime()))).toISOString()) : null

    // Avatar
    if (avatarUrl) {
      const img = document.createElement('img')
      img.className = 'hs-pc-avatar'
      img.src = avatarUrl
      img.alt = ''
      frag.appendChild(img)
    }

    // Info container
    const info = document.createElement('div')
    info.className = 'hs-pc-info'

    // ROW 1: Identity
    const row1 = document.createElement('div')
    row1.className = 'hs-pc-header-line'

    const platSpan = document.createElement('span')
    platSpan.className = `hs-pc-platform ${platform}`
    platSpan.textContent = platform
    row1.appendChild(platSpan)

    const nameSpan = document.createElement('span')
    nameSpan.className = 'hs-pc-name'
    nameSpan.textContent = displayName
    row1.appendChild(nameSpan)

    if (role) {
      const roleSpan = document.createElement('span')
      roleSpan.className = `hs-pc-role ${role}`
      roleSpan.textContent = role
      row1.appendChild(roleSpan)
    }
    if (broadcasterType === 'partner') {
      const pSpan = document.createElement('span')
      pSpan.className = 'hs-pc-role partner'
      pSpan.textContent = t('content_card_partner')
      row1.appendChild(pSpan)
    } else if (broadcasterType === 'affiliate') {
      const aSpan = document.createElement('span')
      aSpan.className = 'hs-pc-role affiliate'
      aSpan.textContent = t('content_card_affiliate')
      row1.appendChild(aSpan)
    }
    if (profile.twitch_verified) {
      const vSpan = document.createElement('span')
      vSpan.className = 'hs-pc-verified'
      vSpan.title = t('content_card_twitch_verified')
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 16 16')
      svg.setAttribute('fill', 'none')
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      bg.setAttribute('d', 'M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z')
      bg.setAttribute('fill', '#9146ff')
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      check.setAttribute('d', 'M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z')
      check.setAttribute('fill', '#fff')
      svg.appendChild(bg)
      svg.appendChild(check)
      vSpan.appendChild(svg)
      row1.appendChild(vSpan)
    }
    if (profile.kick_verified) {
      const vSpan = document.createElement('span')
      vSpan.className = 'hs-pc-verified'
      vSpan.title = t('content_card_kick_verified')
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('viewBox', '0 0 16 16')
      svg.setAttribute('fill', 'none')
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      bg.setAttribute('d', 'M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z')
      bg.setAttribute('fill', '#53fc18')
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      check.setAttribute('d', 'M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z')
      check.setAttribute('fill', '#000')
      svg.appendChild(bg)
      svg.appendChild(check)
      vSpan.appendChild(svg)
      row1.appendChild(vSpan)
    }
    if (age) {
      const ageSpan = document.createElement('span')
      ageSpan.className = 'hs-pc-age'
      ageSpan.textContent = age
      row1.appendChild(ageSpan)
    }
    // Live status
    if (profile.twitch_is_live) {
      const liveSpan = document.createElement('span')
      liveSpan.className = 'hs-pc-live'
      liveSpan.textContent = t('content_card_live', [String(profile.twitch_viewer_count > 0 ? formatNum(profile.twitch_viewer_count) : '')])
      if (profile.twitch_game) liveSpan.title = profile.twitch_game
      row1.appendChild(liveSpan)
    }
    if (profile.kick_is_live) {
      const liveSpan = document.createElement('span')
      liveSpan.className = 'hs-pc-live hs-pc-live-kick'
      liveSpan.textContent = t('content_card_live', [String(profile.kick_viewer_count > 0 ? formatNum(profile.kick_viewer_count) : '')])
      if (profile.kick_category) liveSpan.title = profile.kick_category
      row1.appendChild(liveSpan)
    }

    // Relationship badges
    const rel = profile.relationship || {}
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick || rel.followsYou
    if (followsYou) {
      const since = rel.profileFollowsViewerOnTwitchSince || rel.followsYouSince
      const fySpan = document.createElement('span')
      fySpan.className = 'hs-pc-follows-you'
      fySpan.textContent = t('content_card_follows_you') + formatRelTime(since)
      row1.appendChild(fySpan)
    }
    if (rel.profileSubbedToViewerOnTwitch || rel.subscribesToYou) {
      const since = rel.profileTwitchSubSince || rel.subscribesToYouSince
      const subSpan = document.createElement('span')
      subSpan.className = 'hs-pc-subs-you'
      subSpan.textContent = t('content_card_subs_to_you') + formatRelTime(since)
      row1.appendChild(subSpan)
    }
    if (rel.isFollowing || rel.followsOnTwitch) {
      const since = rel.followsOnTwitchSince || rel.followedAt
      const fgSpan = document.createElement('span')
      fgSpan.className = 'hs-pc-following'
      fgSpan.textContent = t('content_card_you_follow') + formatRelTime(since)
      row1.appendChild(fgSpan)
    }
    if (rel.subscribedOnTwitch || rel.isSubscribed) {
      const since = rel.subscribedAt
      const tier = rel.twitchSubTier || rel.subTier
      const subSpan = document.createElement('span')
      subSpan.className = 'hs-pc-subbed'
      subSpan.textContent = (tier && tier > 1 ? t('content_card_you_sub_tier', [String(tier)]) : t('content_card_you_sub')) + formatRelTime(since)
      row1.appendChild(subSpan)
    }
    // Sub tenure from chat badge data (how long they've been subbed to this channel)
    const subMonths = subTenureMap.get(username.toLowerCase())
    if (subMonths) {
      const channelLogin = getChannelLogin()
      const stSpan = document.createElement('span')
      stSpan.className = 'hs-pc-sub-tenure'
      stSpan.textContent = t('content_card_subbed', [channelLogin || '', formatSubTenure(subMonths)])
      row1.appendChild(stSpan)
    }
    info.appendChild(row1)

    // Bio
    if (profile.bio) {
      const bioDiv = document.createElement('div')
      bioDiv.className = 'hs-pc-bio'
      bioDiv.textContent = profile.bio
      info.appendChild(bioDiv)
    }

    // ROW 2: Stats
    const hasStats = heat > 0 || op > 0 || re > 0 || followers > 0
    if (hasStats) {
      const row2 = document.createElement('div')
      row2.className = 'hs-pc-stats-line'

      if (heat > 0) {
        const heatSpan = document.createElement('span')
        heatSpan.className = 'hs-pc-heat'
        heatSpan.style.color = getHeatColor(heat)
        heatSpan.textContent = `${heat}\u00B0`
        row2.appendChild(heatSpan)
      }
      if (op > 0) {
        const opSpan = document.createElement('span')
        opSpan.className = 'hs-pc-op'
        const opNum = document.createElement('span')
        opNum.textContent = op
        const opBadge = document.createElement('span')
        opBadge.className = 'hs-pc-badge-op'
        opBadge.textContent = '[OP]'
        opSpan.append(opNum, opBadge)
        row2.appendChild(opSpan)
      }
      if (re > 0) {
        const reSpan = document.createElement('span')
        reSpan.className = 'hs-pc-re'
        const reNum = document.createElement('span')
        reNum.textContent = re
        const reBadge = document.createElement('span')
        reBadge.className = 'hs-pc-badge-re'
        reBadge.textContent = '[RE]'
        reSpan.append(reNum, reBadge)
        row2.appendChild(reSpan)
      }
      if (followers > 0) {
        const fSpan = document.createElement('span')
        fSpan.className = 'hs-pc-followers'
        fSpan.textContent = t('content_card_followers', [String(formatNum(followers))])
        row2.appendChild(fSpan)
      }
      info.appendChild(row2)
    }

    // ROW 3: Actions
    const row3 = document.createElement('div')
    row3.className = 'hs-pc-actions'

    const link = document.createElement('a')
    link.href = `https://heatsync.org/${platform}/${encodeURIComponent(username)}/posts`
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = t('content_view_on_heatsync')
    row3.appendChild(link)

    const actions = [
      { action: 'timeout', label: '10m' },
      { action: 'ban', label: 'ban' },
      { action: 'unban', label: 'unban' },
      { action: 'block', label: 'block' }
    ]
    for (const { action, label } of actions) {
      const btn = document.createElement('button')
      btn.className = 'hs-pc-action'
      btn.dataset.action = action
      btn.dataset.user = username
      btn.textContent = label
      row3.appendChild(btn)
    }
    info.appendChild(row3)

    frag.appendChild(info)

    // Close button
    const closeBtn = document.createElement('button')
    closeBtn.className = 'hs-pc-close'
    closeBtn.textContent = '\u00D7'
    closeBtn.addEventListener('mousedown', (ev) => {
      ev.stopPropagation()
      ev.preventDefault()
      closeCard()
    })
    frag.appendChild(closeBtn)

    return frag
  }

  // Position card near click, bounded to viewport
  function positionCard(card, e) {
    card.style.display = 'flex'
    const rect = card.getBoundingClientRect()
    let x = e.clientX + 10
    let y = e.clientY - 10
    if (x + rect.width > window.innerWidth - 10) x = e.clientX - rect.width - 10
    if (y + rect.height > window.innerHeight - 10) y = window.innerHeight - rect.height - 10
    if (x < 10) x = 10
    if (y < 10) y = 10
    card.style.left = x + 'px'
    card.style.top = y + 'px'
  }

  let cardDragAC = null
  function closeCard() {
    if (cardPollInterval) { clearInterval(cardPollInterval); cardPollInterval = null }
    if (cardDragAC) { cardDragAC.abort(); cardDragAC = null }
    if (cardEl) {
      cardEl.remove()
      cardEl = null
    }
  }

  // Inject chat command into Twitch input
  function injectChatCommand(command) {
    if (!extensionContextValid) return
    const chatInput = document.querySelector('[data-a-target="chat-input"]')
    if (!chatInput) return

    chatInput.focus()
    // Clear existing text and insert command without touching clipboard
    document.execCommand('selectAll')
    document.execCommand('insertText', false, command)
    cleanup.setTimeout(() => {
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true })
      chatInput.dispatchEvent(enterEvent)
    }, 100)
  }

  // Handle action button clicks
  function handleAction(action, username) {
    switch (action) {
      case 'timeout':
        injectChatCommand(`/timeout ${username} 600`)
        break
      case 'ban':
        injectChatCommand(`/ban ${username}`)
        break
      case 'unban':
        injectChatCommand(`/unban ${username}`)
        break
      case 'block':
        safeSendMessage({ type: 'block_user', username: username.toLowerCase() }).catch(() => {})
        closeCard()
        break
    }
  }

  // Show card on username click
  async function showCard(target, e) {
    try {
      const username = target.dataset?.hsUsername ||
                       target.dataset?.username ||
                       target.textContent?.replace(/^@/, '').trim()
      if (!username) return

      if (!cardEl) {
        cardEl = document.createElement('div')
        cardEl.className = 'hs-profile-card'
        document.body.appendChild(cardEl)

        // Drag support — AbortController cleans up if card closes mid-drag
        let dragX, dragY
        cardEl.addEventListener('mousedown', (ev) => {
          if (ev.target.closest('a, button')) return
          ev.preventDefault()
          if (cardDragAC) cardDragAC.abort()
          cardDragAC = new AbortController()
          dragX = ev.clientX - cardEl.offsetLeft
          dragY = ev.clientY - cardEl.offsetTop
          const onMove = (me) => {
            cardEl.style.left = (me.clientX - dragX) + 'px'
            cardEl.style.top = (me.clientY - dragY) + 'px'
          }
          const onUp = () => {
            if (cardDragAC) { cardDragAC.abort(); cardDragAC = null }
          }
          document.addEventListener('mousemove', onMove, { signal: cardDragAC.signal })
          document.addEventListener('mouseup', onUp, { signal: cardDragAC.signal })
        })

        // Close card when mouse leaves it (unless moving to a username)
        cardEl.addEventListener('mouseleave', (ev) => {
          const related = ev.relatedTarget
          if (related && related.closest(usernameSelectors)) return
          closeCard()
        })
      }

      // Show loading
      cardEl.textContent = ''
      const loadingDiv = document.createElement('div')
      loadingDiv.className = 'hs-pc-loading'
      loadingDiv.textContent = t('common_loading')
      cardEl.appendChild(loadingDiv)
      cardEl.style.display = 'flex'
      positionCard(cardEl, e)

      const profile = await fetchProfile(username)
      cardEl.textContent = ''
      cardEl.appendChild(buildCardDOM(profile, username))
      positionCard(cardEl, e)

      // Fetch followage + live follow counts async and append to card
      const channelLogin = getChannelLogin()
      if (channelLogin && getPlatform() === 'twitch') {
        lookupFollowage(username, channelLogin).then(result => {
          if (!result || !cardEl || cardEl.style.display === 'none') return
          const headerLine = cardEl.querySelector('.hs-pc-header-line')
          if (!headerLine) return
          // Followage badge
          const existing = headerLine.querySelector('.hs-pc-followage')
          if (existing) existing.remove()
          const badge = document.createElement('span')
          if (result.followedAt) {
            badge.className = 'hs-pc-followage'
            badge.textContent = t('content_card_following', [channelLogin, formatAge(result.followedAt)])
          } else if (result.followedAt === null) {
            badge.className = 'hs-pc-followage hs-pc-nofollow'
            badge.textContent = t('content_card_not_following', [channelLogin])
          }
          if (badge.textContent) headerLine.appendChild(badge)
          // "followed by {channel}" badge
          if (result.channelFollowedAt) {
            const cfBadge = document.createElement('span')
            cfBadge.className = 'hs-pc-channel-follows'
            cfBadge.textContent = t('content_card_followed_by', [channelLogin])
            headerLine.appendChild(cfBadge)
          }
          // Update following count with live GQL data
          const statsLine = cardEl.querySelector('.hs-pc-stats-line')
          if (statsLine && result.followingCount != null) {
            let followingEl = statsLine.querySelector('.hs-pc-following-count')
            if (!followingEl) {
              followingEl = document.createElement('span')
              followingEl.className = 'hs-pc-following-count'
              statsLine.appendChild(followingEl)
            }
            followingEl.textContent = t('content_card_following_count', [String(formatNum(result.followingCount))])
          }
          // Update followers with live data
          if (statsLine && result.followerCount != null) {
            const followersEl = statsLine.querySelector('.hs-pc-followers')
            if (followersEl) {
              followersEl.textContent = t('content_card_followers', [String(formatNum(result.followerCount))])
            }
          }
        })
      }

      // Live-poll viewer count every 10s while card is visible (lightweight endpoint)
      if (cardPollInterval) { clearInterval(cardPollInterval); cardPollInterval = null }
      if (profile && (profile.twitch_is_live || profile.kick_is_live)) {
        cardPollInterval = cleanup.setInterval(async () => {
          if (!cardEl) { clearInterval(cardPollInterval); cardPollInterval = null; return }
          try {
            const fresh = await HS.apiFetch(`/api/profile/${encodeURIComponent(username)}/live`)
            if (!fresh || !cardEl) return
            // Update twitch live span
            const twitchLive = cardEl.querySelector('.hs-pc-live:not(.hs-pc-live-kick)')
            if (twitchLive && fresh.twitch_is_live) {
              twitchLive.textContent = t('content_card_live', [String(fresh.twitch_viewer_count > 0 ? formatNum(fresh.twitch_viewer_count) : '')])
            } else if (twitchLive && !fresh.twitch_is_live) {
              twitchLive.remove()
            }
            // Update kick live span
            const kickLive = cardEl.querySelector('.hs-pc-live-kick')
            if (kickLive && fresh.kick_is_live) {
              kickLive.textContent = t('content_card_live', [String(fresh.kick_viewer_count > 0 ? formatNum(fresh.kick_viewer_count) : '')])
            } else if (kickLive && !fresh.kick_is_live) {
              kickLive.remove()
            }
          } catch (err) {
            // Silently ignore poll failures
          }
        }, 10000)
      }
    } catch (err) {
      warn(' showCard error:', err)
      if (cardEl) {
        cardEl.textContent = ''
        cardEl.style.display = 'none'
      }
    }
  }

  // Hover/click listeners (signal-bound — cleaned up on abort)

  // Hover handler — instant show on mouseenter for HS-colored usernames
  document.addEventListener('mouseover', (e) => {
      const target = e.target.closest(usernameSelectors)
      if (!target) return
      const isHsMention = target.classList.contains('hs-username-colored') || target.classList.contains('hs-mention-colored')
      if (isHsMention) {
        showCard(target, e)
      }
    }, { signal })

    // Mouseleave — close card when mouse leaves both the trigger and the card
    document.addEventListener('mouseout', (e) => {
      if (!cardEl) return
      const related = e.relatedTarget
      // Stay open if mouse moved into the card itself or another username
      if (related && (related.closest('.hs-profile-card') || related.closest(usernameSelectors))) return
      closeCard()
    }, { signal })

    // Keep card open while hovering it, close when leaving
    // (applied per-card in showCard via cardEl mouseleave)

    // Click handler — capture phase to intercept before Twitch
    // Alt+click = HS card on native (non-colored) usernames
    document.addEventListener('click', (e) => {
      // Anything inside the card — stop propagation so Twitch doesn't steal it
      if (cardEl && e.target.closest('.hs-profile-card')) {
        e.stopPropagation()
        e.preventDefault()
        if (e.target.closest('.hs-pc-close')) {
          closeCard()
        } else {
          const actionBtn = e.target.closest('.hs-pc-action')
          if (actionBtn) handleAction(actionBtn.dataset.action, actionBtn.dataset.user)
        }
        return
      }

      const target = e.target.closest(usernameSelectors)
      if (target) {
        const isHsMention = target.classList.contains('hs-username-colored') || target.classList.contains('hs-mention-colored')
        if (isHsMention) {
          // Already handled by hover — click is a no-op for colored mentions
          e.stopPropagation()
          e.preventDefault()
          return
        }
        if (e.altKey) {
          e.stopPropagation()
          e.preventDefault()
          showCard(target, e)
        } else if (cardEl) {
          closeCard()
        }
        return
      }

      // Close on click outside
      if (cardEl) {
        closeCard()
      }
    }, { capture: true, signal }) // capture phase, tied to lifecycle

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && cardEl) {
        closeCard()
      }
    }, { signal })

  log(' ✅ Profile card (click) setup')
})();

// Retroactively process messages when broadcast arrives
function retroactivelyProcessBroadcast(username, emoteName, emoteData) {
  log(' 🔄 Retroactively processing messages for:', username, emoteName);

  const chatContainer = findChatContainer();
  if (!chatContainer) {
    log(' ⚠️ Chat container not found for retroactive processing');
    return;
  }

  // Get only the LAST message - retroactive is just for race condition where message
  // appears a split second before broadcast arrives. Old messages should not be replaced.
  let messages = chatContainer.querySelectorAll('.chat-line__message');
  if (messages.length === 0) {
    messages = chatContainer.querySelectorAll('[data-index]');
  }

  // Process last 5 messages - handles fast chats where message appears after broadcast
  const recentMessages = Array.from(messages).slice(-5);
  let processedCount = 0;

  recentMessages.forEach(messageElement => {
    const messageUsername = getUsername(messageElement);
    if (messageUsername.toLowerCase() !== username.toLowerCase()) return;

    const textElement = messageElement.querySelector('.text-fragment') ||
                        messageElement.querySelector('span.font-normal') ||
                        messageElement.querySelector('[class*="message"]');

    if (!textElement) return;

    // Skip if emote already replaced (check for existing img with this hash)
    const alreadyReplaced = textElement.querySelector(`img[data-emote-hash="${emoteData.hash}"]`);
    if (alreadyReplaced) return;

    // Get text-only content (avoid matching alt text in existing imgs)
    const textContent = Array.from(textElement.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('');

    const regex = createEmoteRegex(emoteName);

    if (textContent.match(regex)) {
      log(' ✅ RETROACTIVE REPLACE:', {
        username,
        emoteName,
        messageText: textElement.textContent.substring(0, 50)
      });

      replaceEmoteInText(textElement, {
        name: emoteName,
        url: emoteData.url.startsWith('http') ? emoteData.url : `${API_URL}${emoteData.url}`,
        hash: emoteData.hash,
        width: emoteData.width,
        height: emoteData.height
      });
      processedCount++;
    }
  });

  log(' Retroactively processed', processedCount, 'message(s)');
}

// Get username from message element
function getUsername(messageElement) {
  const usernameEl = messageElement.querySelector(
    '.chat-author__display-name, .chat-line__username, button.inline.font-bold'
  )

  return usernameEl ? usernameEl.textContent.trim() : '';
}

// Get Twitch user ID from message element via React fiber
function getTwitchUserId(messageElement) {
  if (isKick) return null
  // Read data-user-id stamped by early-inject-main.js (MAIN world)
  // Content scripts can't access __reactFiber$ (isolated world)
  return messageElement.getAttribute('data-user-id') || null
}

// Apply 7TV paint gradient to a username element
function applyPaintToElement(el, paint) {
  if (!paint) return
  const fn = (paint.function || '').toLowerCase()
  if (fn === 'url' && paint.image_url) {
    el.style.backgroundImage = `url(${paint.image_url})`
    el.style.backgroundSize = 'cover'
  } else if ((fn === 'linear-gradient' || fn === 'radial-gradient') && paint.stops?.length) {
    const stops = paint.stops.map(s => {
      const r = (s.color >>> 24) & 0xff
      const g = (s.color >>> 16) & 0xff
      const b = (s.color >>> 8) & 0xff
      const a = (s.color & 0xff) / 255
      return `rgba(${r},${g},${b},${a.toFixed(2)}) ${Math.round(s.at * 100)}%`
    }).join(', ')
    if (fn === 'linear-gradient') {
      el.style.backgroundImage = `linear-gradient(${paint.angle || 0}deg, ${stops})`
    } else {
      el.style.backgroundImage = `radial-gradient(${paint.shape || 'circle'}, ${stops})`
    }
  } else if (paint.color) {
    const r = (paint.color >>> 24) & 0xff
    const g = (paint.color >>> 16) & 0xff
    const b = (paint.color >>> 8) & 0xff
    const a = (paint.color & 0xff) / 255
    el.style.color = `rgba(${r},${g},${b},${a.toFixed(2)})`
    return
  } else {
    return
  }
  el.style.webkitBackgroundClip = 'text'
  el.style.webkitTextFillColor = 'transparent'
  el.style.backgroundClip = 'text'
  if (paint.shadows?.length) {
    el.style.filter = paint.shadows.map(s => {
      const r = (s.color >>> 24) & 0xff
      const g = (s.color >>> 16) & 0xff
      const b = (s.color >>> 8) & 0xff
      const a = (s.color & 0xff) / 255
      return `drop-shadow(${s.x_offset || 0}px ${s.y_offset || 0}px ${s.radius || 0}px rgba(${r},${g},${b},${a.toFixed(2)}))`
    }).join(' ')
  }
  el.dataset.hsPaintApplied = '1'
}

// Get the best URL from a 7TV badge host object
function get7TVBadgeUrl(badge) {
  if (!badge?.host) return ''
  const files = badge.host.files || []
  const file = files.find(f => f.name?.endsWith('.webp')) || files.find(f => f.name?.endsWith('.avif')) || files[0]
  if (!file) return ''
  const base = badge.host.url || ''
  return (base.endsWith('/') ? base : base + '/') + file.name
}

// Apply BTTV/FFZ badges and 7TV paints/badges to a message element
function applyCosmeticsToMessage(el, userId) {
  if (!userId) return
  // Detect recycled DOM node — clear stale cosmetics if userId changed
  const prevUserId = el.dataset.hsCosmeticAppliedFor
  if (prevUserId && prevUserId !== userId) {
    el.querySelectorAll('.hs-cosmetic-badge').forEach(b => b.remove())
    delete el.dataset.hsCosmeticDone
    const nameEl = el.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"]')
    if (nameEl) {
      delete nameEl.dataset.hsPaintApplied
      nameEl.style.removeProperty('background-image')
      nameEl.style.removeProperty('background-size')
      nameEl.style.removeProperty('-webkit-background-clip')
      nameEl.style.removeProperty('-webkit-text-fill-color')
      nameEl.style.removeProperty('background-clip')
      nameEl.style.removeProperty('filter')
    }
  }
  el.dataset.hsCosmeticAppliedFor = userId
  const nameEl = el.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"]')
  if (!nameEl) return

  // BTTV badge
  if (bttvBadgeMap.has(userId) && !el.querySelector('.hs-bttv-badge')) {
    const b = bttvBadgeMap.get(userId)
    const img = document.createElement('img')
    img.className = 'hs-bttv-badge hs-cosmetic-badge'
    img.src = b.url
    img.title = b.description
    img.alt = b.description
    nameEl.parentNode.insertBefore(img, nameEl)
  }

  // FFZ badges
  if (ffzBadgeMap.has(userId) && !el.querySelector('.hs-ffz-badge')) {
    for (const b of ffzBadgeMap.get(userId)) {
      const img = document.createElement('img')
      img.className = 'hs-ffz-badge hs-cosmetic-badge'
      img.src = b.url
      img.title = b.title
      img.alt = b.title
      if (b.color) img.style.backgroundColor = b.color
      nameEl.parentNode.insertBefore(img, nameEl)
    }
  }

  // 7TV cosmetics
  const cosmetic = cosmeticsCache.get(userId)
  if (cosmetic) {
    if (cosmetic.badge && !el.querySelector('.hs-7tv-badge')) {
      const url = get7TVBadgeUrl(cosmetic.badge)
      if (url) {
        const img = document.createElement('img')
        img.className = 'hs-7tv-badge hs-cosmetic-badge'
        img.src = url
        img.title = cosmetic.badge.tooltip || cosmetic.badge.name || '7TV'
        img.alt = '7TV'
        nameEl.parentNode.insertBefore(img, nameEl)
      }
    }
    if (cosmetic.paint && !nameEl.dataset.hsPaintApplied) {
      applyPaintToElement(nameEl, cosmetic.paint)
    }
    el.dataset.hsCosmeticDone = '1'
  }
}

// Queue a Twitch user ID for 7TV cosmetics batch fetch
function queueCosmeticsLookup(userId) {
  if (isKick || !userId) return
  const cached = cosmeticsCache.get(userId)
  if (cached && Date.now() - cached.fetchedAt < COSMETICS_TTL) return
  cosmeticsPending.add(userId)
  if (!cosmeticsBatchTimer) {
    cosmeticsBatchTimer = cleanup.setTimeout(() => {
      cosmeticsBatchTimer = null
      flushCosmeticsBatch()
    }, 500)
  }
}

async function flushCosmeticsBatch() {
  if (cosmeticsPending.size === 0) return
  const batch = [...cosmeticsPending].slice(0, 10)
  batch.forEach(id => cosmeticsPending.delete(id))
  try {
    const resp = await safeSendMessage({ type: 'get_user_cosmetics', twitchIds: batch })
    if (!resp?.cosmetics) return
    const now = Date.now()
    for (const [userId, cosmetic] of Object.entries(resp.cosmetics)) {
      if (cosmeticsCache.size >= COSMETICS_MAX) {
        cosmeticsCache.delete(cosmeticsCache.keys().next().value)
      }
      cosmeticsCache.set(userId, { ...(cosmetic || { paint: null, badge: null }), fetchedAt: now })
    }
    applyPendingCosmetics(Object.keys(resp.cosmetics))
  } catch (e) {
    log(' flushCosmeticsBatch failed:', e?.message)
  }
  if (cosmeticsPending.size > 0 && !cosmeticsBatchTimer) {
    cosmeticsBatchTimer = cleanup.setTimeout(() => {
      cosmeticsBatchTimer = null
      flushCosmeticsBatch()
    }, 2000)
  }
}

function applyPendingCosmetics(userIds) {
  const container = findChatContainer()
  if (!container) return
  const idSet = new Set(userIds)
  container.querySelectorAll('[data-hs-cosmetic-user-id]').forEach(el => {
    if (el.dataset.hsCosmeticDone === '1') return
    const uid = el.dataset.hsCosmeticUserId
    if (idSet.has(uid)) applyCosmeticsToMessage(el, uid)
  })
}

// Apply HeatSync API colors to existing messages in the chat container
function applyHeatsyncColorsToExisting() {
  const container = findChatContainer()
  if (!container) return
  container.querySelectorAll('.chat-line__message, [data-index]').forEach(el => {
    const nameEl = el.querySelector('.chat-author__display-name, [data-a-target="chat-message-username"]')
    if (!nameEl) return
    const username = nameEl.textContent?.trim().toLowerCase()
    if (!username) return
    const hsColor = heatsyncColorMap.get(username)
    if (hsColor && !nameEl.dataset.hsPaintApplied) {
      nameEl.style.color = hsColor
      knownChatters.set(username, hsColor)
    }
  })
}

// Re-apply BTTV/FFZ badges to messages that were processed before badge maps loaded
function reapplyBadgesToExistingMessages() {
  if (bttvBadgeMap.size === 0 && ffzBadgeMap.size === 0) return
  const container = findChatContainer()
  if (!container) return
  container.querySelectorAll('[data-hs-cosmetic-user-id]').forEach(el => {
    const uid = el.dataset.hsCosmeticUserId
    if (!uid) return
    const needsBttv = bttvBadgeMap.has(uid) && !el.querySelector('.hs-bttv-badge')
    const needsFfz = ffzBadgeMap.has(uid) && !el.querySelector('.hs-ffz-badge')
    if (needsBttv || needsFfz) applyCosmeticsToMessage(el, uid)
  })
}

// =============================================================================
// KICK COSMETICS (7TV paints + badges by username)
// =============================================================================
// BTTV/FFZ badges use Twitch user IDs — not available on Kick.
// 7TV supports Kick natively via /v3/users/kick/{username}.

function applyKickCosmeticsToMessage(el, kickSlug) {
  if (!kickSlug) return
  const prevSlug = el.dataset.hsCosmeticAppliedFor
  if (prevSlug && prevSlug !== kickSlug) {
    el.querySelectorAll('.hs-cosmetic-badge').forEach(b => b.remove())
    delete el.dataset.hsCosmeticDone
    const nameEl = el.querySelector('button.inline.font-bold')
    if (nameEl) {
      delete nameEl.dataset.hsPaintApplied
      nameEl.style.removeProperty('background-image')
      nameEl.style.removeProperty('background-size')
      nameEl.style.removeProperty('-webkit-background-clip')
      nameEl.style.removeProperty('-webkit-text-fill-color')
      nameEl.style.removeProperty('background-clip')
      nameEl.style.removeProperty('filter')
    }
  }
  el.dataset.hsCosmeticAppliedFor = kickSlug
  const nameEl = el.querySelector('button.inline.font-bold')
  if (!nameEl) return

  const cosmetic = kickCosmeticsCache.get(kickSlug)
  if (!cosmetic) return

  // 7TV badge
  if (cosmetic.badge && !el.querySelector('.hs-7tv-badge')) {
    const url = get7TVBadgeUrl(cosmetic.badge)
    if (url) {
      const img = document.createElement('img')
      img.className = 'hs-7tv-badge hs-cosmetic-badge'
      img.src = url
      img.title = cosmetic.badge.tooltip || cosmetic.badge.name || '7TV'
      img.alt = '7TV'
      nameEl.parentNode.insertBefore(img, nameEl)
    }
  }

  // 7TV paint
  if (cosmetic.paint && !nameEl.dataset.hsPaintApplied) {
    applyPaintToElement(nameEl, cosmetic.paint)
  }
  el.dataset.hsCosmeticDone = '1'
}

function queueKickCosmeticsLookup(kickSlug) {
  if (!isKick || !kickSlug) return
  const cached = kickCosmeticsCache.get(kickSlug)
  if (cached && Date.now() - cached.fetchedAt < COSMETICS_TTL) return
  kickCosmeticsPending.add(kickSlug)
  if (!kickCosmeticsBatchTimer) {
    kickCosmeticsBatchTimer = cleanup.setTimeout(() => {
      kickCosmeticsBatchTimer = null
      flushKickCosmeticsBatch()
    }, 500)
  }
}

async function flushKickCosmeticsBatch() {
  if (kickCosmeticsPending.size === 0) return
  const batch = [...kickCosmeticsPending].slice(0, 10)
  batch.forEach(slug => kickCosmeticsPending.delete(slug))
  try {
    const resp = await safeSendMessage({ type: 'get_kick_user_cosmetics', kickUsernames: batch })
    if (!resp?.cosmetics) return
    const now = Date.now()
    for (const [slug, cosmetic] of Object.entries(resp.cosmetics)) {
      if (kickCosmeticsCache.size >= COSMETICS_MAX) {
        kickCosmeticsCache.delete(kickCosmeticsCache.keys().next().value)
      }
      kickCosmeticsCache.set(slug, { ...(cosmetic || { paint: null, badge: null }), fetchedAt: now })
    }
    applyPendingKickCosmetics(Object.keys(resp.cosmetics))
  } catch (e) {
    log(' flushKickCosmeticsBatch failed:', e?.message)
  }
  if (kickCosmeticsPending.size > 0 && !kickCosmeticsBatchTimer) {
    kickCosmeticsBatchTimer = cleanup.setTimeout(() => {
      kickCosmeticsBatchTimer = null
      flushKickCosmeticsBatch()
    }, 2000)
  }
}

function applyPendingKickCosmetics(slugs) {
  const container = findChatContainer()
  if (!container) return
  const slugSet = new Set(slugs)
  container.querySelectorAll('[data-hs-cosmetic-kick-user]').forEach(el => {
    if (el.dataset.hsCosmeticDone === '1') return
    const slug = el.dataset.hsCosmeticKickUser
    if (slugSet.has(slug)) applyKickCosmeticsToMessage(el, slug)
  })
}

// Right-click on chat message or username → instant 24h mute
function setupMessageContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    // Don't intercept emote right-clicks
    if (e.target.closest('.heatsync-emote-wrapper')) return;

    const msgEl = e.target.closest('.chat-line__message, #chatroom-messages [data-index]');
    if (!msgEl) return;

    const username = getUsername(msgEl);
    if (!username) return;

    e.preventDefault();

    if (mutedUsers.has(username)) {
      mutedUsers.delete(username);
      safeSendMessage({ type: 'unmute_user', username }).catch(() => {});
      unmuteUser(username);
      showToast(t('content_toast_unmuted', [username]));
    } else {
      mutedUsers.add(username);
      safeSendMessage({ type: 'mute_user', username, expiresAt: Date.now() + 86400000 }).catch(() => {});
      muteUser(username);
      showToast(t('content_toast_muted_24h', [username]));
    }
  }, { signal });
}

// Hide all messages from a blocked user
function hideBlockedUser(username) {
  (findChatContainer() || document).querySelectorAll('.chat-line__message, [data-index]').forEach(msg => {
    if (getUsername(msg) === username) msg.style.display = 'none';
  });
}

// Unhide all messages from an unblocked user
function unhideBlockedUser(username) {
  (findChatContainer() || document).querySelectorAll('.chat-line__message, [data-index]').forEach(msg => {
    if (getUsername(msg) === username) msg.style.display = '';
  });
}

// Undo mute — can't restore stripped DOM, just remove class for future messages
function unmuteUser(username) {
  (findChatContainer() || document).querySelectorAll('.hs-user-muted').forEach(msg => {
    if (getUsername(msg) === username) {
      msg.classList.remove('hs-user-muted');
    }
  });
}

// Hide blocked emote everywhere
function hideBlockedEmote(hash) {
  log(' hideBlockedEmote called for hash:', hash?.substring(0, 8));
  const elements = document.querySelectorAll(`[data-emote-hash="${hash}"]`);
  log(' Found', elements.length, 'elements to hide');

  elements.forEach(wrapper => {
    wrapper.classList.remove('emote-overlay-owned', 'emote-overlay-unadded', 'emote-overlay-global');
    wrapper.classList.add('emote-overlay-blocked');
    const img = wrapper.querySelector('.heatsync-emote');
    if (img) {
      img.style.opacity = '0';
      img.classList.add('emote-blocked');
      img.classList.remove('emote-in-set');
      log(' Hid emote:', img.dataset.emoteName);
    }
  });
}

// Show unblocked emote everywhere
function showUnblockedEmote(hash) {
  log(' showUnblockedEmote called for hash:', hash?.substring(0, 8));
  const elements = document.querySelectorAll(`[data-emote-hash="${hash}"]`);
  log(' Found', elements.length, 'elements to show');

  elements.forEach(wrapper => {
    const img = wrapper.querySelector('.heatsync-emote');
    const emoteName = wrapper.dataset.emoteName;
    const emoteUrl = wrapper.dataset.emoteUrl || img?.src || '';

    // Check if third-party CDN emote (7TV, BTTV, FFZ, Twitch native)
    const isThirdPartyCdn = emoteUrl.includes('cdn.7tv.app') ||
                            emoteUrl.includes('cdn.betterttv.net') ||
                            emoteUrl.includes('cdn.frankerfacez.com') ||
                            emoteUrl.includes('static-cdn.jtvnw.net');

    // Check if in your set or global
    const inInventory = inventoryHashSet.has(hash) || inventoryNameSet.has(emoteName);
    const isGlobalEmote = globalNameSet.has(emoteName);

    wrapper.classList.remove('emote-overlay-blocked', 'emote-overlay-owned', 'emote-overlay-unadded', 'emote-overlay-global');

    if (inInventory) {
      wrapper.classList.add('emote-overlay-owned');
    } else if (isThirdPartyCdn || isGlobalEmote) {
      // Third-party emotes (7TV, BTTV, FFZ, Twitch) always get gray - can't add to inventory
      wrapper.classList.add('emote-overlay-global');
    } else {
      wrapper.classList.add('emote-overlay-unadded');
    }

    if (img) {
      img.style.opacity = '';
      img.classList.remove('emote-blocked');

      if (inInventory) {
        img.classList.add('emote-in-set');
        log(' Showed emote (in your set):', emoteName);
      } else if (isThirdPartyCdn || isGlobalEmote) {
        img.classList.remove('emote-in-set');
        log(' Showed emote (global/third-party):', emoteName);
      } else {
        img.classList.remove('emote-in-set');
        log(' Showed emote (unadded):', emoteName);
      }
    }
  });
}

// Hide muted user content, gray username
function muteUser(username) {
  (findChatContainer() || document).querySelectorAll('.chat-line__message, [data-index]').forEach(msg => {
    if (getUsername(msg) === username) {
      stripMutedMessage(msg);
    }
  });
}

// Strip all content from a muted user's message, leaving only username + badges
function stripMutedMessage(messageElement) {
  messageElement.classList.add('hs-user-muted');
  // Remove message body (native Twitch)
  const body = messageElement.querySelector('[data-a-target="chat-line-message-body"]');
  if (body) { body.textContent = ''; }
  // Remove text fragments (backfill + Kick + any remaining)
  messageElement.querySelectorAll('.text-fragment, .mention-fragment, .heatsync-emote-wrapper, .link-fragment, a[href]').forEach(el => el.remove());
  // Remove the colon separator after username
  const usernameContainer = messageElement.querySelector('.chat-line__username-container');
  if (usernameContainer) {
    let node = usernameContainer.nextSibling;
    while (node) {
      const next = node.nextSibling;
      // Keep the (now-empty) message body span for layout, remove colon and others
      if (node !== body) node.parentNode.removeChild(node);
      node = next;
    }
  }
  // Backfill messages: flat structure — remove siblings after display-name
  if (messageElement.classList.contains('heatsync-backfill')) {
    const nameEl = messageElement.querySelector('.chat-author__display-name');
    if (nameEl) {
      let node = nameEl.nextSibling;
      while (node) {
        const next = node.nextSibling;
        node.parentNode.removeChild(node);
        node = next;
      }
    }
  }
  // Kick: remove content after username button
  const kickUser = messageElement.querySelector('button.inline.font-bold');
  if (kickUser) {
    messageElement.querySelectorAll('span.font-normal').forEach(el => el.remove());
  }
}

// Escape regex special characters
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Create emote matching regex that handles both word and non-word character emotes
// \b doesn't work for emotes like ")))" since ) is not a word character
function createEmoteRegex(emoteName) {
  const escaped = escapeRegex(emoteName);
  // Check if emote contains any word characters
  const hasWordChars = /\w/.test(emoteName);
  if (hasWordChars) {
    // Use word boundaries for emotes with letters/numbers
    return new RegExp(`\\b${escaped}\\b`, 'g');
  } else {
    // Use whitespace/boundary lookahead for symbol-only emotes like ")))"
    return new RegExp(`(?<=^|\\s)${escaped}(?=\\s|$)`, 'g');
  }
}

// Watch for new messages (MutationObserver)
let messageObserver = null;
let observedContainer = null;
let watchRetryCount = 0;
function watchForNewMessages() {
  const chatContainer = findChatContainer();
  if (!chatContainer) {
    if (++watchRetryCount > 60) return;
    const delay = watchRetryCount <= 30 ? 1000 : 2000
    log(' ⏳ watchForNewMessages: no container found, retrying in', delay, 'ms (attempt', watchRetryCount, ')');
    cleanup.setTimeout(watchForNewMessages, delay);
    return;
  }
  watchRetryCount = 0;

  log(' ✅ watchForNewMessages: found container:', chatContainer.className?.substring(0, 100));

  // Disconnect existing observer if any
  if (messageObserver) {
    messageObserver.disconnect();
    log(' 🔌 Disconnected previous message observer');
  }

  // Batch processing queue to avoid React conflicts
  let processingQueue = [];
  let processingScheduled = false;

  messageObserver = cleanup.trackObserver(new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === 1) {
          // Twitch chat message
          if (node.classList.contains('chat-line__message')) {
            processingQueue.push(node);
          }
          // Kick chat message
          // Kick chat message (div with data-index inside #chatroom-messages)
          else if (node.hasAttribute?.('data-index') && node.closest?.('#chatroom-messages')) {
            processingQueue.push(node);
          }
          // Check if it has chat-line__message inside
          else if (node.querySelector && node.querySelector('.chat-line__message')) {
            node.querySelectorAll('.chat-line__message').forEach(msg => processingQueue.push(msg));
          }
        }
      });
    });

    // Defer processing to let React settle (prevents DOM conflicts)
    if (!processingScheduled && processingQueue.length > 0) {
      processingScheduled = true;
      log(' 📬 Queued', processingQueue.length, 'messages for processing');
      requestAnimationFrame(() => {
        cleanup.setTimeout(() => {
          const batch = processingQueue.splice(0); // Copy and clear queue
          log(' 🔄 Processing batch of', batch.length, 'messages');

          try {
            batch.forEach(msg => {
              processMessage(msg)
              // Capture to localStorage cache (skip our own cached/backfilled msgs)
              if (!msg.dataset.heatsyncCached && !msg.dataset.heatsyncBackfill) {
                captureMessageToCache(msg)
              }
            });
          } catch (e) {
            log(' ❌ processMessage error:', e.message);
          } finally {
            processingScheduled = false;
          }
        }, 16); // Wait one frame for React to settle (animated emotes need this)
      });
    }
  }), 'message-observer');

  observedContainer = chatContainer;
  messageObserver.observe(chatContainer, { childList: true, subtree: true });
  log(' 👁️ Watching for new messages in chat container');
}

// Extract Twitch channel ID from page (needed for 7TV API)
function getTwitchChannelId() {
  try {
    // Method 1: Check __NEXT_DATA__ for channel ID
    const nextData = document.getElementById('__NEXT_DATA__');
    if (nextData) {
      const data = JSON.parse(nextData.textContent);
      const channelId = data?.props?.pageProps?.channelId ||
                        data?.props?.relayEnvironment?.store?.['client:root']?.channel?.id;
      if (channelId) return channelId;
    }

    // Method 2: Look for it in window object (Twitch sometimes exposes it)
    if (window.__twilight_client__?.store) {
      const state = window.__twilight_client__.store.getState();
      const channelId = state?.channel?.currentChannelID;
      if (channelId) return channelId;
    }

    // Method 3: Parse from any script containing channel data
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const text = script.textContent;
      if (text.includes('"channelId"') || text.includes('"channel_id"')) {
        const match = text.match(/"channel_?[iI]d"\s*:\s*"?(\d+)"?/);
        if (match) return match[1];
      }
    }
  } catch (e) {
    log(' Error getting Twitch channel ID:', e);
  }
  return null;
}

// Detect channel and join room
function detectAndJoinChannel() {
  const url = window.location.href;
  let platform, channelName, channelId;

  if (url.includes('twitch.tv')) {
    platform = 'twitch';
    // Extract channel from URL: /popout/CHANNEL/chat or just /CHANNEL
    const match = url.match(/\/popout\/([^\/]+)\/chat/) || url.match(/twitch\.tv\/([^\/\?]+)/);
    channelName = match ? match[1] : null;
    // Exclude system paths that aren't actual channels
    const excludedPaths = ['oauth2', 'directory', 'settings', 'downloads', 'p', 'videos', 'search', 'subscriptions', 'inventory', 'wallet', 'drops', 'prime', 'turbo', 'products', 'bits', 'u', 'moderator', 'broadcast', 'clip'];
    if (channelName && excludedPaths.includes(channelName.toLowerCase())) {
      log(' Skipping system path:', channelName);
      channelName = null;
    }
    // Try to get channel ID for 7TV API
    channelId = getTwitchChannelId();
    if (channelId) {
      log(' Got Twitch channel ID:', channelId);
    }
  } else if (url.includes('kick.com')) {
    platform = 'kick';
    // Handle popout/embed URLs: /popout/channel/chat or /embed/channel/chat
    const popoutMatch = url.match(/kick\.com\/(?:popout|embed)\/([^\/\?]+)/);
    if (popoutMatch) {
      channelName = popoutMatch[1]?.toLowerCase() || null;
    } else {
      const match = url.match(/kick\.com\/([^\/\?]+)/);
      const slug = match ? match[1]?.toLowerCase() : null;
      const kickExcluded = ['categories', 'following', 'settings', 'browse', 'search', 'dashboard', 'category', 'password', 'popout', 'embed'];
      channelName = (slug && !kickExcluded.includes(slug)) ? slug : null;
    }
  }

  if (platform && channelName) {
    log(' Detected channel:', platform, channelName);
    safeSendMessage({
      type: 'join_channel',
      platform,
      channel: channelName,
      channelId: channelId || null
    }).then(response => {
      log(' ✅ join_channel sent, response:', response);
    }).catch(err => {
      if (!extensionContextValid) return;
    });
  }
}

// =============================================================================
// TAB COMPLETION FOR EMOTES
// =============================================================================
// Works like heatsync.org: type partial emote name, Tab to complete/cycle
// Shows preview popup with emote image and counter (1/5)
// Arrow keys navigate, Escape cancels

let tabCompleteState = {
  active: false,
  matches: [],
  index: 0,
  startPos: 0,
  originalWord: '',
  lastInserted: '', // Track what we last inserted for cycling
  inputElement: null,
  completing: false // Prevent re-entry during completion
};

// Build combined emote map for searching (inventory + globals)
let _tabEmoteMap = null
let _tabEmoteMapDirty = true
function buildEmoteMap() {
  if (_tabEmoteMap && !_tabEmoteMapDirty && !allEmotesDirty) return _tabEmoteMap
  _tabEmoteMapDirty = false
  const map = new Map();

  // Add inventory emotes first (higher priority)
  emoteInventory.forEach(emote => {
    map.set(emote.name.toLowerCase(), {
      name: emote.name,
      url: emote.url?.startsWith('http') ? emote.url : `${API_URL}${emote.url}`,
      hash: emote.hash,
      provider: 'inventory'
    });
  });

  // Add global emotes (BTTV, FFZ, 7TV)
  globalEmotes.forEach(emote => {
    const key = emote.name.toLowerCase();
    if (!map.has(key)) { // Don't override inventory emotes
      map.set(key, {
        name: emote.name,
        url: emote.url,
        hash: emote.hash || btoa(emote.url),
        provider: emote.source || 'global'
      });
    }
  });

  // Add channel emotes (third-party only — HeatSync emotes come from inventory)
  channelEmotes.forEach(emote => {
    if (!emote.source) return
    const key = emote.name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, {
        name: emote.name,
        url: emote.url?.startsWith('http') ? emote.url : `${API_URL}${emote.url}`,
        hash: emote.hash,
        provider: 'channel'
      });
    }
  });

  _tabEmoteMap = map
  return map;
}

// Get text and cursor position from contenteditable or textarea
function getInputState(element) {
  const isContentEditable = element.getAttribute('contenteditable') === 'true';

  if (isContentEditable) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return { text: '', cursorPos: 0 };

    const range = selection.getRangeAt(0);
    // Use textContent - innerText adds newlines in contenteditable
    const text = (element.textContent || '').replace(/\n/g, '');

    // Calculate cursor position by walking through text nodes
    let cursorPos = 0;
    const treeWalker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = treeWalker.nextNode())) {
      if (node === range.startContainer) {
        cursorPos += range.startOffset;
        break;
      }
      cursorPos += node.textContent.length;
    }

    return { text, cursorPos, isContentEditable: true };
  } else {
    return {
      text: element.value || '',
      cursorPos: element.selectionStart || 0,
      isContentEditable: false
    };
  }
}

// Find matches for partial emote name
function findEmoteMatches(partialWord) {
  const emoteMap = buildEmoteMap();
  const matches = [];
  const partial = partialWord.toLowerCase();

  log(` 🔍 Searching for "${partial}" in ${emoteMap.size} emotes (inv: ${emoteInventory.length}, global: ${globalEmotes.length}, channel: ${channelEmotes.length})`);

  for (const [name, emote] of emoteMap.entries()) {
    if (name.includes(partial)) {
      matches.push(emote);
    }
  }

  // Add emoji matches for :prefix style (Discord/Slack)
  if (partialWord.startsWith(':') && partial.length >= 3) {
    const emojiSearch = partial.slice(1)
    if (typeof EMOJI_DATA !== 'undefined') {
      let emojiCount = 0
      for (const entry of EMOJI_DATA) {
        if (entry.name.includes(emojiSearch)) {
          matches.push({
            name: entry.emoji,
            url: '',
            provider: 'emoji',
            emojiName: entry.name,
          })
          if (++emojiCount >= 10) break
        }
      }
    }
  }

  // Sort: inventory first, then emotes, then emoji, then alphabetically
  matches.sort((a, b) => {
    if (a.provider === 'inventory' && b.provider !== 'inventory') return -1;
    if (a.provider !== 'inventory' && b.provider === 'inventory') return 1;
    if (a.provider === 'emoji' && b.provider !== 'emoji') return 1;
    if (a.provider !== 'emoji' && b.provider === 'emoji') return -1;
    return (a.emojiName || a.name).localeCompare(b.emojiName || b.name);
  });

  return matches;
}

// Show TAB COMPLETION preview popup (different from hover preview!)
function showEmotePreview(emote, currentIndex, totalCount) {
  const isTwitch = window.location.hostname.includes('twitch.tv');
  let preview = document.getElementById('heatsync-tab-preview');

  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'heatsync-tab-preview';
    preview.style.cssText = `
      position: fixed;
      bottom: 120px;
      left: 20px;
      background: #000000;
      border: 1px solid rgba(255,0,0,0.4);
      padding: 4px 8px;
      z-index: 10001;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      pointer-events: none;
      font-family: Inter, -apple-system, sans-serif;
    `;

    const counter = document.createElement('div');
    counter.id = 'heatsync-tab-counter';
    counter.style.cssText = 'color: #fff; font-size: 11px; font-weight: bold;';

    const img = document.createElement('img');
    img.id = 'heatsync-tab-img';
    img.style.cssText = 'max-width: 64px; max-height: 28px;';

    const name = document.createElement('div');
    name.id = 'heatsync-tab-name';
    name.style.cssText = 'color: #808080; font-size: 11px;';

    const hint = document.createElement('div');
    hint.id = 'heatsync-tab-hint';
    hint.style.cssText = 'color: #9147ff; font-size: 10px; margin-left: 4px;';

    preview.appendChild(counter);
    preview.appendChild(img);
    preview.appendChild(name);
    preview.appendChild(hint);
    document.body.appendChild(preview);
  }

  const counter = preview.querySelector('#heatsync-tab-counter');
  const img = preview.querySelector('#heatsync-tab-img');
  const nameEl = preview.querySelector('#heatsync-tab-name');
  const hint = preview.querySelector('#heatsync-tab-hint');

  if (counter) counter.textContent = `${currentIndex}/${totalCount}`;
  if (emote.provider === 'emoji') {
    if (img) { img.style.display = 'none' }
    if (nameEl) nameEl.textContent = `${emote.name} :${emote.emojiName}:`
  } else {
    if (img) { img.src = emote.url; img.style.display = '' }
    if (nameEl) nameEl.textContent = emote.name;
  }
  if (hint) hint.textContent = isTwitch ? 'Ctrl+V' : '';

  preview.style.display = 'flex';
}

// Hide TAB COMPLETION preview popup
function hideEmotePreview() {
  const preview = document.getElementById('heatsync-tab-preview');
  if (preview) preview.style.display = 'none';
}

// FFZ Inline Tab Completion style - intercepts Tab, uses setValue()
// Based on https://github.com/FrankerFaceZ/Add-Ons/blob/master/src/inline-tab-completion/index.jsx
function injectTwitchAutocompleteHook() {
  // MV3: autocomplete-hook.js is loaded via manifest in MAIN world
  // We just need to create the data bridge div
  if (document.getElementById('heatsync-emote-bridge')) return;

  const bridge = document.createElement('div');
  bridge.id = 'heatsync-emote-bridge';
  bridge.style.display = 'none';
  bridge.dataset.emotes = '[]';
  document.documentElement.appendChild(bridge);

  log(' Emote bridge created for autocomplete-hook.js');
}

// Update emotes in the bridge for the injected script
let _emoteBridgeDebounce = null
function updateEmoteBridgeImmediate() {
  const bridge = document.getElementById('heatsync-emote-bridge');
  if (!bridge) return;
  // Combine all emote sources: personal inventory + global + channel
  const allEmotes = [];
  const seen = new Set();

  // Personal inventory first (highest priority)
  for (const e of emoteInventory) {
    if (!seen.has(e.name)) {
      seen.add(e.name);
      allEmotes.push({ name: e.name, hash: e.hash, url: e.url, zeroWidth: e.zeroWidth });
    }
  }

  // Channel emotes
  for (const e of channelEmotes) {
    if (!seen.has(e.name)) {
      seen.add(e.name);
      allEmotes.push({ name: e.name, hash: e.hash, url: e.url, zeroWidth: e.zeroWidth });
    }
  }

  // Global emotes
  for (const e of globalEmotes) {
    if (!seen.has(e.name)) {
      seen.add(e.name);
      allEmotes.push({ name: e.name, hash: e.hash, url: e.url, zeroWidth: e.zeroWidth });
    }
  }

  log(' Updating emote bridge:', allEmotes.length, 'total emotes');
  bridge.dataset.emotes = JSON.stringify(allEmotes);
  bridge.dispatchEvent(new Event('heatsync-emotes-updated'));

  // Populate window.__heatsyncEmoteUrls for early-inject interceptor via postMessage
  const urlMap = {};
  for (const e of allEmotes) {
    if (e.hash && e.url) urlMap[e.hash] = e.url;
  }
  // Use postMessage to communicate with MAIN world (early-inject.js)
  window.postMessage({ type: 'heatsync-url-map', urlMap }, location.origin);
}

function updateEmoteBridge() {
  clearTimeout(_emoteBridgeDebounce)
  _emoteBridgeDebounce = cleanup.setTimeout(() => updateEmoteBridgeImmediate(), 100)
}

// NOTE: injectTwitchAutocompleteHook() is called earlier, before loadInventory()

// Complete emote in input (Kick only - textarea)
// NOTE: Twitch uses FFZ-style native autocomplete, not this function
function completeEmoteInInput(element, emote, startPos) {
  const emoteName = emote.name;
  const wordToReplace = tabCompleteState.lastInserted || tabCompleteState.originalWord || '';

  const replaceLen = wordToReplace.length;
  const textToInsert = emoteName + ' ';

  if (element.isContentEditable) {
    // Kick: contenteditable div.editor-input
    const sel = window.getSelection();
    const text = element.textContent || '';
    const beforeText = text.substring(0, startPos);
    const afterText = text.substring(startPos + replaceLen);
    element.textContent = beforeText + textToInsert + afterText;
    const newPos = startPos + textToInsert.length;
    const newNode = element.firstChild;
    if (newNode) {
      const range = document.createRange();
      range.setStart(newNode, Math.min(newPos, newNode.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    // Fallback for textarea
    const beforeText = element.value.substring(0, startPos);
    const afterText = element.value.substring(startPos + replaceLen);
    element.value = beforeText + textToInsert + afterText;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    const newCursorPos = startPos + textToInsert.length;
    element.setSelectionRange(newCursorPos, newCursorPos);
  }
  tabCompleteState.lastInserted = textToInsert;
}

// Reset tab completion state
function resetTabComplete() {
  tabCompleteState.active = false;
  tabCompleteState.matches = [];
  tabCompleteState.index = 0;
  tabCompleteState.lastInserted = '';
  tabCompleteState.startAnchor = null;
  hideEmotePreview();
}

// Setup tab completion on chat input
// NOTE: For Twitch, we use FFZ-style hooking into native autocomplete (see injectTwitchAutocompleteHook)
// This custom handler is only for Kick (which uses regular textarea)
function setupTabCompletion() {
  // Only run on Kick - Twitch uses native autocomplete with our hooked emotes
  if (!window.location.hostname.includes('kick.com')) {
    log(' Skipping custom tab handler - using Twitch native autocomplete');
    return;
  }

  // Remove old handler if extension reloaded (DOM persists, JS context is fresh)
  if (window._heatsyncTabHandler) {
    document.removeEventListener('keydown', window._heatsyncTabHandler, true);
  }

  log(' ✅ Tab completion handler installed for Kick');

  const findChatInput = () => {
    return document.querySelector('div.editor-input') || // Kick
           document.querySelector('.chat-input textarea');
  };

  // Document-level capture to intercept Tab before Twitch
  const tabHandler = (e) => {
    const chatInput = findChatInput();
    if (!chatInput) return;

    // Only handle if focus is in/near chat input
    const activeEl = document.activeElement;
    const isInChat = activeEl === chatInput ||
                     chatInput.contains(activeEl) ||
                     activeEl?.closest('[data-a-target="chat-input"]') ||
                     activeEl?.closest('.chat-input');

    if (!isInChat) return;

    // Don't capture when Twitch modals are open (predictions, polls, rewards, dialogs)
    if (document.querySelector('[class*="prediction"], [class*="reward-queue"], [role="dialog"], [class*="poll-overlay"]')) return;

    // Handle active autocomplete navigation
    if (tabCompleteState.active && tabCompleteState.matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        tabCompleteState.index = (tabCompleteState.index + 1) % tabCompleteState.matches.length;
        const emote = tabCompleteState.matches[tabCompleteState.index];
        showEmotePreview(emote, tabCompleteState.index + 1, tabCompleteState.matches.length);
        completeEmoteInInput(chatInput, emote, tabCompleteState.startPos);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        tabCompleteState.index = tabCompleteState.index <= 0
          ? tabCompleteState.matches.length - 1
          : tabCompleteState.index - 1;
        const emote = tabCompleteState.matches[tabCompleteState.index];
        showEmotePreview(emote, tabCompleteState.index + 1, tabCompleteState.matches.length);
        completeEmoteInInput(chatInput, emote, tabCompleteState.startPos);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        resetTabComplete();
        return;
      } else if (e.key === 'Enter') {
        // Confirm selection and reset
        resetTabComplete();
        // Don't prevent default - let Enter submit the message
        return;
      }
    }

    // Tab key - start or cycle autocomplete
    if (e.key === 'Tab') {
      // Prevent re-entry during completion
      if (tabCompleteState.completing) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      log(' 🎯 Tab pressed, active:', tabCompleteState.active, 'matches:', tabCompleteState.matches.length);

      // If cycling through existing matches - just cycle, don't re-read input
      if (tabCompleteState.active && tabCompleteState.matches.length > 0) {
        tabCompleteState.completing = true;
        const len = tabCompleteState.matches.length;
        tabCompleteState.index = (tabCompleteState.index + (e.shiftKey ? len - 1 : 1)) % len;
        const emote = tabCompleteState.matches[tabCompleteState.index];
        log(' Cycling to:', emote.name, '(', tabCompleteState.index + 1, '/', len, ')');
        showEmotePreview(emote, tabCompleteState.index + 1, len);
        completeEmoteInInput(chatInput, emote, tabCompleteState.startPos);
        tabCompleteState.completing = false;
        return;
      }

      // New autocomplete session - read input state
      const { text, cursorPos } = getInputState(chatInput);
      log(' Input state:', { text: text.substring(0, 50), cursorPos, len: text.length });
      const textBeforeCursor = text.substring(0, cursorPos);
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
      const wordStart = lastSpaceIndex + 1;
      const currentWord = textBeforeCursor.substring(wordStart);
      const partialWord = currentWord.trim();
      log(' Partial word:', JSON.stringify(partialWord), 'from', JSON.stringify(currentWord));

      if (!partialWord) {
        log(' No partial word, aborting');
        return;
      }

      // Find matches
      const matches = findEmoteMatches(partialWord);
      log(` New session: "${partialWord}" → ${matches.length} matches`);

      if (matches.length > 0) {
        tabCompleteState.completing = true;
        tabCompleteState.active = true;
        tabCompleteState.matches = matches;
        tabCompleteState.index = 0;
        tabCompleteState.startPos = wordStart;
        tabCompleteState.originalWord = partialWord;

        const emote = matches[0];
        showEmotePreview(emote, 1, matches.length);
        completeEmoteInInput(chatInput, emote, wordStart);
        tabCompleteState.completing = false;
      }
    } else if (!['ArrowUp', 'ArrowDown', 'Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) {
      // Any other key (except modifiers) resets autocomplete
      if (tabCompleteState.active) {
        resetTabComplete();
      }
    }
  };

  // Store reference for cleanup on extension reload
  window._heatsyncTabHandler = tabHandler;
  document.addEventListener('keydown', tabHandler, { capture: true, signal }); // CAPTURE phase - runs before Twitch handlers

  log(' Tab completion ready');
}

// Intercept message input to detect emote usage
let interceptRetryCount = 0;
function interceptMessageSending() {
  // Only run on Twitch/Kick
  if (!window.location.hostname.includes('twitch.tv') && !window.location.hostname.includes('kick.com')) {
    return;
  }

  const chatInput = document.querySelector('[data-a-target="chat-input"]') || // Twitch
                    document.querySelector('div.editor-input') || // Kick
                    document.querySelector('textarea');

  if (!chatInput) {
    if (++interceptRetryCount > 30) return;
    log(' ⏳ Chat input not found, retrying in 1s...');
    cleanup.setTimeout(interceptMessageSending, 1000);
    return;
  }
  interceptRetryCount = 0;

  // Prevent stacking listeners on SPA re-navigation
  if (chatInput._hsInterceptBound) return;
  chatInput._hsInterceptBound = true;

  log(' 📝 Found chat input:', chatInput.tagName, chatInput.className);

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // textarea uses .value, contenteditable uses .innerText
      const message = (chatInput.isContentEditable ? chatInput.innerText : chatInput.value || chatInput.innerText || '').trim();
      log(' 📤 Enter pressed, message:', message);
      if (!message) return;

      // Check if message contains any of MY emotes (use cached regex from createEmoteRegex)
      emoteInventory.forEach(emote => {
        if (!emote._outgoingRegex) {
          emote._outgoingRegex = new RegExp(`\\b${escapeRegex(emote.name)}\\b`);
        }
        if (emote._outgoingRegex.test(message)) {
          // Notify background script to broadcast
          safeSendMessage({
            type: 'emote_sent',
            emoteName: emote.name,
            emoteHash: emote.hash
          }).then(response => {
            if (response && response.success) {
              log(' ✅ Emote broadcast sent successfully');
            } else {
              warn(' ⚠️ Emote broadcast FAILED:', response);
            }
          }).catch(err => {
            if (!extensionContextValid) return;
          });
        }
      });
    }
  }, { signal });

  log(' Message interceptor attached');
}

// SPA navigation handler — event-driven via early-inject-main.js history hooks
let lastChatUrl = location.href;
function handleNavigation() {
  if (location.href === lastChatUrl) return
  log(' 🔄 URL changed from', lastChatUrl, 'to', location.href);
  lastChatUrl = location.href;
  channelEmotes = []
  msgCacheBuffer = []
  subTenureMap.clear()
  allEmotesDirty = true
  detectAndJoinChannel();
  cleanup.setTimeout(() => {
    watchForNewMessages();
    setupUsernameColoringObserver();
    if (emoteInventory.length > 0 || globalEmotes.length > 0) {
      processExistingMessages();
    }
    // Backfill new channel after native messages load
    cleanup.setTimeout(() => backfillChatHistory(), 500);
  }, 500, 'url-change-rescan');
}

// Primary: instant notification from MAIN world history hooks
window.addEventListener('message', (event) => {
  if (event.origin !== location.origin) return
  if (event.data?.type === 'heatsync-nav') handleNavigation()
}, { signal })

// Fallback: polling in case MAIN world script didn't load (e.g. Firefox edge cases)
cleanup.setInterval(() => handleNavigation(), 5000, 'url-watcher-fallback');

// Check if observed container was replaced by React (e.g. after sending a message)
// Always compare against live DOM — old container may still be isConnected but orphaned from React tree
cleanup.setInterval(() => {
  const freshContainer = findChatContainer();
  if (freshContainer && freshContainer !== observedContainer) {
    log(' 🔄 Chat container changed, re-hooking observer');
    watchForNewMessages();
    if (usernameColoringObserver) {
      usernameColoringObserver.disconnect();
      usernameColoringObserver = null;
    }
    setupUsernameColoringObserver();
  } else if (!freshContainer && observedContainer && !observedContainer.isConnected) {
    log(' ⚠️ Chat container removed from DOM, clearing observer');
    if (messageObserver) { messageObserver.disconnect(); messageObserver = null; }
    observedContainer = null;
  }
}, 2000, 'observer-health-check');

// Periodic re-scan to catch messages that might have been missed (10s — observer handles most)
cleanup.setInterval(() => {
  if (emoteInventory.length > 0 || globalEmotes.length > 0) {
    processExistingMessages();
  }
}, 10000, 'periodic-rescan');

// Flush message cache on page unload so we don't lose the last 5s
window.addEventListener('beforeunload', () => {
  if (msgCacheSaveTimer) { clearTimeout(msgCacheSaveTimer); msgCacheSaveTimer = null }
  saveMsgCache()
})

// Auto-claim Twitch channel points bonus
let autoClaimObserver = null
let autoClaimEnabled = true

function setupAutoClaimPoints() {
  if (autoClaimObserver) { autoClaimObserver.disconnect(); autoClaimObserver = null }
  if (!autoClaimEnabled || !location.hostname.includes('twitch.tv')) return

  function tryClaimBonus(container) {
    if (!container) return
    // The main button has aria-label "Bits and Points Balances" — any other button is the claim
    const buttons = container.querySelectorAll('button')
    for (const btn of buttons) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase()
      if (label.includes('bits and points') || label.includes('balance')) continue
      // Also skip buttons that are part of dropdowns/menus
      if (btn.closest('[role="dialog"]') || btn.closest('[role="menu"]')) continue
      // This is likely the bonus claim button
      log(' 🎁 Auto-claiming channel points bonus')
      btn.click()
      return
    }
    // Fallback: look for any claimable-bonus element
    const claimable = container.querySelector('[class*="claimable"], [class*="click-claim"]')
    if (claimable) {
      log(' 🎁 Auto-claiming channel points bonus (fallback)')
      claimable.click()
    }
  }

  function attachObserver() {
    const container = document.querySelector('[data-test-selector="community-points-summary"]')
    if (!container) {
      cleanup.setTimeout(attachObserver, 3000)
      return
    }

    // Check immediately in case bonus is already showing
    tryClaimBonus(container)

    autoClaimObserver = cleanup.trackObserver(new MutationObserver(() => {
      tryClaimBonus(container)
    }))
    autoClaimObserver.observe(container, { childList: true, subtree: true })
    log(' 💰 Auto-claim channel points observer active')
  }

  attachObserver()
}

// Load auto-claim setting and start
;(async function loadAutoClaimSetting() {
  try {
    const stored = await chrome.storage.local.get('hs_auto_claim_points')
    autoClaimEnabled = stored.hs_auto_claim_points !== false // default ON
  } catch { /* default on */ }
  setupAutoClaimPoints()
})()

// React to setting changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.hs_auto_claim_points) {
    autoClaimEnabled = changes.hs_auto_claim_points.newValue !== false
    setupAutoClaimPoints()
  }
})

// Initialize
setupEmoteClickHandlers();
detectAndJoinChannel();
setupMessageContextMenu();
watchForNewMessages();
interceptMessageSending();
setupTabCompletion();
log(' Extension loaded');

// Process any chat history that's already loaded in the DOM
// (Twitch loads recent messages on page load, but we need to process them with emotes)
cleanup.setTimeout(() => {
  log(' Processing chat history from page load...');
  const channel = getPageChannel()

  // Restore cached messages FIRST for instant render (before robotty backfill)
  if (channel) {
    initMsgCache(channel)
    const chatContainer = findChatContainer()
    if (chatContainer) {
      const restored = restoreMsgCache(channel, chatContainer)
      if (restored > 0) processExistingMessages()
    }
  }

  processExistingMessages();
  setupUsernameColoringObserver(); // Start persistent username coloring
  // Backfill after a short delay so native Twitch messages are loaded for dedup
  cleanup.setTimeout(() => backfillChatHistory(), 500);
}, 1000);

// Expose knownChatters for autocomplete-hook.js username completion
window.heatsyncKnownChatters = knownChatters;

})();
