/**
 * Heatsync Chat Button - FFZ-style button injection
 *
 * Injects a Heatsync button next to Twitch's emote picker button.
 * Opens panel for: importing channel emotes, quick picker, settings.
 *
 * Reference: FrankerFaceZ/src/sites/twitch-twilight/modules/chat/input.jsx
 */
(function() {
  'use strict';

  const DEBUG = false;
  const log = DEBUG ? console.log.bind(console, '[heatsync-btn]') : () => {};

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c])
  }

  // Wait for shared-utils.js to expose window.HS before starting
  function waitForHS(cb, attempts = 0) {
    if (window.HS) return cb()
    if (attempts >= 50) return // give up after 5s
    setTimeout(() => waitForHS(cb, attempts + 1), 100)
  }

  waitForHS(() => {
  // Kill previous instance on extension reload
  if (window.__heatsyncBtnLifecycle) {
    try { window.__heatsyncBtnLifecycle.abort() } catch (_) {}
  }

  // Lifecycle controller — delegates to shared window.HS.createLifecycle
  const { signal: btnSignal, cleanup, abort: _abortLifecycle } = window.HS.createLifecycle()
  window.__heatsyncBtnLifecycle = { abort: _abortLifecycle }

  const BUTTON_ID = 'heatsync-chat-button';
  const PANEL_ID = 'heatsync-panel';
  const API_URL = 'https://heatsync.org';

  // bidi direction for the user's locale — resolved per-mount so manual locale override applies
  function HS_BTN_DIR() {
    try { return (typeof bidiDir === 'function' ? bidiDir() : (chrome?.i18n?.getMessage?.('@@bidi_dir'))) || 'ltr' } catch { return 'ltr' }
  }

  let buttonInjected = false;
  let panelOpen = false;
  let currentChannel = null;
  let channelEmotesCache = [];
  let cachedAuthToken = null;
  let inventoryEmotesCache = [];
  let _inventoryNames = new Set()
  let _inventoryHashes = new Set()
  let _inventoryIds = new Set()
  function rebuildInventoryIndex() {
    _inventoryNames = new Set(inventoryEmotesCache.map(e => e.name))
    _inventoryHashes = new Set(inventoryEmotesCache.filter(e => e.hash).map(e => e.hash))
    _inventoryIds = new Set(inventoryEmotesCache.filter(e => e.id).map(e => e.id))
  }
  let globalEmotesCache = [];
  let currentTab = 'channel';
  let searchQuery = '';
  let emotesPreloaded = false;
  let preloadingInProgress = false;
  let recentEmotes = []; // LRU list of recently-used emote names
  const RECENT_MAX = 20;
  let focusedEmoteIndex = -1; // keyboard nav tracking

  // Virtual scroll state
  let _virtualPickerEmotes = [] // current filtered emote list for virtual scroll
  let _virtualRecentCount = 0 // number of recent emotes rendered (non-virtualized)
  let _virtualScrollHandler = null // scroll listener reference
  let _virtualGridDelegated = false // whether event delegation is set up

  // Load recent emotes from storage
  chrome.storage.local.get('recent_emotes', (r) => {
    if (r.recent_emotes) recentEmotes = r.recent_emotes
  })

  function recordRecentEmote(emote) {
    const key = emote.isEmoji ? `:${emote.name}:` : emote.name
    recentEmotes = recentEmotes.filter(r => r.key !== key)
    recentEmotes.unshift({ key, name: emote.name, url: emote.url, emoji: emote.emoji, isEmoji: emote.isEmoji, provider: emote.provider, hash: emote.hash })
    if (recentEmotes.length > RECENT_MAX) recentEmotes.length = RECENT_MAX
    chrome.storage.local.set({ recent_emotes: recentEmotes })
  }

  // Fuzzy match scorer: sequential character match
  function fuzzyScore(query, name) {
    const lower = name.toLowerCase()
    if (lower.includes(query)) return 2 + (query.length / lower.length) // exact substring bonus
    let qi = 0
    for (let i = 0; i < lower.length && qi < query.length; i++) {
      if (lower[i] === query[qi]) qi++
    }
    if (qi < query.length) return 0 // not all chars matched
    return qi / lower.length // partial sequential match
  }

  // Error and loading state tracking
  // Keys MUST match currentTab values ('channel', 'global', 'mine', 'sets') so renderEmoteGrid()
  // can read state via loadErrors[currentTab].
  let loadErrors = {
    channel: null,
    global: null,
    mine: null,
    sets: null,
    history: null,
    discover: null
  };
  let isLoading = {
    channel: false,
    global: false,
    mine: false,
    sets: false,
    history: false,
    discover: false
  };
  let isOffline = false;
  let usingCachedData = {
    channel: false,
    global: false,
    mine: false,
    sets: false,
    history: false,
    discover: false
  };

  // Removed emotes history — lazy-loaded on first 'history' tab open
  let removedEmotesCache = []
  let historyLoaded = false

  // Saved emote sets — list of { id, name, emote_count, starred, source_type, source_username }
  // Loaded lazy on first 'sets' tab open via api_fetch through background.
  let savedSetsCache = []
  let setsLoaded = false

  // Discover/trending — lazy-loaded on first 'discover' tab open
  let discoverEmotesCache = []
  let discoverLoaded = false
  let discoverShareUrl = null

  // IndexedDB cache for emote metadata
  const DB_NAME = 'heatsync-emote-cache';
  const DB_VERSION = 2; // Bumped to clear old cache
  const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
  let dbInstance = null;

  async function openDB() {
    if (dbInstance) return dbInstance;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Clear old store on upgrade
        if (db.objectStoreNames.contains('emotes')) {
          db.deleteObjectStore('emotes');
        }
        db.createObjectStore('emotes', { keyPath: 'key' });
      };
    });
  }

  async function getCachedEmotes(key) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('emotes', 'readonly');
        const store = tx.objectStore('emotes');
        const request = store.get(key);
        request.onsuccess = () => {
          const result = request.result;
          if (result && Date.now() - result.timestamp < CACHE_TTL) {
            resolve(result.data);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async function setCachedEmotes(key, data) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('emotes', 'readwrite');
        const store = tx.objectStore('emotes');
        store.put({ key, data, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  }

  // Prune expired IndexedDB entries (prevents unbounded storage growth)
  async function pruneExpiredCache() {
    try {
      const db = await openDB()
      const tx = db.transaction('emotes', 'readwrite')
      const store = tx.objectStore('emotes')
      const request = store.openCursor()
      const now = Date.now()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (now - cursor.value.timestamp > CACHE_TTL) {
          cursor.delete()
        }
        cursor.continue()
      }
    } catch {}
  }
  // Prune on load and every 5 minutes
  pruneExpiredCache()
  cleanup.setInterval(pruneExpiredCache, 300000)

  // Read auth token from DOM bridge (set by content script, no postMessage leak)
  function getAuthToken() {
    return new Promise((resolve) => {
      const readBridge = () => {
        const bridge = document.getElementById('__heatsync_auth_bridge')
        if (bridge?.dataset.ready === '1') {
          cachedAuthToken = bridge.dataset.token || null
          resolve(cachedAuthToken)
          return true
        }
        return false
      }
      // Bridge may already be ready
      if (readBridge()) return
      // Poll briefly — content script creates it on load
      let attempts = 0
      const interval = setInterval(() => {
        if (readBridge() || ++attempts >= 20) {
          clearInterval(interval)
          if (attempts >= 20) resolve(cachedAuthToken)
        }
      }, 50)
      btnSignal?.addEventListener('abort', () => clearInterval(interval), { once: true })
    })
  }

  // Get extension icon URL (works in content script context)
  const getIconUrl = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        return chrome.runtime.getURL('icon-48.png');
      }
      if (typeof browser !== 'undefined' && browser.runtime?.getURL) {
        return browser.runtime.getURL('icon-48.png');
      }
    } catch (_) {}
    return null;
  };

  // Detect current channel from URL
  function detectChannel() {
    const path = window.location.pathname;
    const platform = window.heatsyncPlatform?.detectPlatform() || 'unknown';

    if (platform === 'kick') {
      // Handle popout/embed: /popout/channel/chat or /embed/channel/chat
      const popoutMatch = path.match(/^\/(popout|embed)\/([a-zA-Z0-9_-]+)/);
      if (popoutMatch) return popoutMatch[2].toLowerCase();
      // Kick channel pages: /channelname or /channelname/chatroom
      const match = path.match(/^\/([a-zA-Z0-9_-]+)/);
      if (match && !['categories', 'following', 'settings', 'browse', 'search', 'dashboard', 'popout', 'embed'].includes(match[1])) {
        return match[1].toLowerCase();
      }
      return null;
    }

    // Twitch
    // Handle popout chat: /popout/{channel}/chat
    const popoutMatch = path.match(/^\/popout\/([a-zA-Z0-9_]+)/);
    if (popoutMatch) {
      return popoutMatch[1].toLowerCase();
    }

    // Handle embed: /embed/{channel}/chat
    const embedMatch = path.match(/^\/embed\/([a-zA-Z0-9_]+)/);
    if (embedMatch) {
      return embedMatch[1].toLowerCase();
    }

    // Standard channel page: /{channel}
    const match = path.match(/^\/([a-zA-Z0-9_]+)/);
    if (match && !['directory', 'settings', 'subscriptions', 'inventory', 'wallet', 'drops', 'popout', 'embed'].includes(match[1])) {
      return match[1].toLowerCase();
    }
    return null;
  }

  // Create the Heatsync button element
  function createButton() {
    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.className = 'heatsync-chat-btn';
    btn.removeAttribute('aria-label');
    btn.setAttribute('data-a-target', 'heatsync-button');
    btn.title = '';

    // Use extension logo — swap to black variant on hover
    const iconUrl = getIconUrl();
    const iconBlackUrl = (() => {
      try { return chrome?.runtime?.getURL?.('icon-48-black.png') } catch(_) {}
      try { return browser?.runtime?.getURL?.('icon-48-black.png') } catch(_) {}
      return null
    })();
    if (iconUrl) {
      const img = document.createElement('img');
      img.src = iconUrl;
      img.alt = 'heatsync';
      img.style.cssText = 'width: 20px; height: 20px; object-fit: contain;';
      btn.appendChild(img);
      if (iconBlackUrl) {
        btn.addEventListener('mouseenter', () => { img.src = iconBlackUrl }, { signal: btnSignal });
        btn.addEventListener('mouseleave', () => { img.src = iconUrl }, { signal: btnSignal });
      }
    } else {
      // Fallback: simple H
      btn.textContent = 'H';
      btn.style.fontWeight = 'bold';
    }

    btn.addEventListener('click', handleButtonClick, { signal: btnSignal });
    btn.addEventListener('contextmenu', handleRightClick, { signal: btnSignal });

    return btn;
  }

  // Inject styles for button and panel
  function injectStyles() {
    if (document.getElementById('heatsync-button-styles')) return;

    const style = document.createElement('style');
    style.id = 'heatsync-button-styles';
    style.textContent = `
      /* Button - matches Twitch's exact button style */
      .heatsync-chat-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--button-size-default, 3.2rem);
        height: var(--button-size-default, 3.2rem);
        padding: 0;
        margin: 0;
        background: var(--color-background-button-text-default, transparent);
        border: none;
        border-radius: var(--border-radius-rounded, 9000px);
        color: var(--color-fill-button-icon, #fff);
        cursor: pointer;
        user-select: none;
        vertical-align: middle;
        font-weight: var(--font-weight-semibold, 600);
        overflow: hidden;
        position: relative;
      }

      .heatsync-chat-btn:hover {
        background-color: #fff;
        color: #000;
      }

      .heatsync-chat-btn:active {
        background-color: var(--color-background-button-text-active, rgba(128, 128, 128, 0.55));
      }

      .heatsync-chat-btn img {
        width: 20px;
        height: 20px;
        object-fit: contain;
      }

      /* Panel - Full emote picker */
      .heatsync-panel {
        position: absolute;
        bottom: 100%;
        right: 0;
        width: 420px;
        max-height: 500px;
        height: auto;
        margin-bottom: 8px;
        background: #000;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 0;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        z-index: 4999;
        overflow: hidden;
        font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
        display: flex;
        flex-direction: column;
      }

      .heatsync-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #000;
        border-bottom: 1px solid rgba(255,255,255,0.12);
      }

      .heatsync-panel-title {
        font-size: 14px;
        font-weight: 600;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .heatsync-panel-title img {
        width: 16px;
        height: 16px;
        object-fit: contain;
      }

      .heatsync-panel-close {
        background: none;
        border: none;
        color: #808080;
        cursor: pointer;
        padding: 4px;
        border-radius: 0;
      }

      .heatsync-panel-close:hover {
        background: #fff;
        color: #000;
      }

      .heatsync-header-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .heatsync-header-btn {
        background: none;
        border: 1px solid rgba(255,255,255,0.12);
        color: #808080;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 0;
        font-size: 12px;
        transition: none;
      }

      .heatsync-header-btn:hover {
        background: #fff;
        border-color: #fff;
        color: #000;
      }

      .heatsync-header-btn.active {
        background: rgba(255, 107, 53, 0.2);
        border-color: #ff6b35;
        color: #ff6b35;
      }

      /* Bottom section with search + footer */
      .heatsync-panel-bottom {
        flex-shrink: 0;
        background: #000;
        border-top: 1px solid rgba(255,255,255,0.12);
      }

      .heatsync-panel-bottom .heatsync-search {
        padding: 8px 12px 4px;
        border-bottom: none;
      }

      /* Footer with settings + size buttons */
      .heatsync-panel-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        flex-shrink: 0;
      }

      .heatsync-settings-cog {
        background: none;
        border: 1px solid rgba(255,255,255,0.12);
        color: #808080;
        cursor: pointer;
        padding: 6px;
        border-radius: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: none;
      }

      .heatsync-settings-cog:hover,
      .heatsync-settings-cog.active {
        background: #fff;
        border-color: #fff;
        color: #000;
      }

      .heatsync-settings-cog:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }

      .heatsync-settings-cog.hs-flash-err {
        border-color: #e53935;
        color: #e53935;
        background: none;
      }

      .heatsync-size-buttons {
        display: flex;
        gap: 4px;
      }

      .heatsync-size-btn {
        background: none;
        border: 1px solid rgba(255,255,255,0.12);
        color: #808080;
        cursor: pointer;
        padding: 6px 10px;
        border-radius: 0;
        font-size: 12px;
        min-width: 32px;
        transition: none;
      }

      .heatsync-size-btn:hover {
        background: #fff;
        border-color: #fff;
        color: #000;
      }

      .heatsync-size-btn.active {
        background: #ff6b35;
        border-color: #ff6b35;
        color: #fff;
      }

      .heatsync-panel-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* Search bar */
      .heatsync-search {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.12);
      }

      .heatsync-search input {
        width: 100%;
        padding: 8px 12px;
        background: #000;
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 0;
        color: #fff;
        font-size: 13px;
        outline: none;
      }

      .heatsync-search input:focus {
        border-color: #ff6b35;
      }

      .heatsync-search input::placeholder {
        color: #808080;
      }

      /* Tabs */
      .heatsync-tabs {
        display: flex;
        border-bottom: 1px solid rgba(255,255,255,0.12);
        background: #000;
      }

      .heatsync-tab {
        flex: 1;
        padding: 10px 8px;
        background: none;
        border: none;
        color: #808080;
        font-size: 12px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: none;
      }

      .heatsync-tab:hover {
        background: #fff;
        color: #000;
      }

      .heatsync-tab.active {
        color: #fff;
        border-bottom-color: #ff6b35;
      }

      .heatsync-tab-count {
        font-size: 10px;
        color: #808080;
        margin-left: 4px;
      }

      /* Emote grid - virtual scrolling container */
      .heatsync-emote-grid {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        contain: strict;
        min-height: 300px;
      }

      /* Settings view - no min height, compact */
      .heatsync-emote-grid:has(.heatsync-settings) {
        min-height: auto;
        contain: none;
      }

      .heatsync-emote-row {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .heatsync-emote-grid img {
        height: 32px;
        width: auto;
        cursor: pointer;
        border-radius: 0;
        display: block;
      }

      /* Emote size variants */
      .heatsync-emote-grid.size-1x img { height: 32px; }
      .heatsync-emote-grid.size-2x img { height: 56px; }
      .heatsync-emote-grid.size-4x img { height: 112px; }

      .heatsync-emote-grid.size-1x .heatsync-emote-wrap { min-width: 32px; min-height: 32px; }
      .heatsync-emote-grid.size-2x .heatsync-emote-wrap { min-width: 56px; min-height: 56px; }
      .heatsync-emote-grid.size-4x .heatsync-emote-wrap { min-width: 112px; min-height: 112px; }

      /* Emote wrapper - simple background hover */
      .heatsync-emote-wrap {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 0;
        cursor: pointer;
        flex-shrink: 0;
      }

      /* Keyboard focus highlight */
      .heatsync-emote-wrap.hs-kb-focus {
        outline: 2px solid #ff8700;
        outline-offset: -2px;
      }

      /* Unadded = slightly dimmed */
      .heatsync-emote-wrap.unadded img {
        opacity: 0.7;
      }

      /* Hover: hide image, show background color */
      .heatsync-emote-wrap:hover img {
        visibility: hidden;
      }

      /* background-color cross-fades 0.25s so block↔unblock under cursor
         flows between legend colors. ease-out front-loads the change so
         hover-in still feels immediate. */
      .heatsync-emote-wrap {
        transition: background-color 0.25s ease-out;
      }

      /* Usable = green (inventory + global + channel) */
      .heatsync-emote-wrap:hover {
        background: #00ff00;
      }

      /* Available but not added = orange */
      .heatsync-emote-wrap.unadded:hover {
        background: #ff8700;
      }

      /* Blocked emotes: dashed outline on the wrap (so the image's opacity
         doesn't drag the outline into invisibility), image hidden via
         visibility so the slot keeps its 32×32 layout. */
      .heatsync-emote-wrap.blocked {
        outline: 2px dashed #808080 !important;
        outline-offset: -2px !important;
      }
      .heatsync-emote-wrap.blocked img {
        visibility: hidden !important;
      }
      .heatsync-emote-wrap.blocked:hover {
        background: #ff0000;
      }

      /* Provider section headers */
      .heatsync-provider-section {
        width: 100%;
        margin-top: 8px;
        margin-bottom: 4px;
      }

      .heatsync-provider-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 8px;
        background: #000;
        border-radius: 0;
        margin-bottom: 6px;
      }

      .heatsync-provider-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        text-transform: lowercase;
        letter-spacing: 0.3px;
      }

      .heatsync-provider-label.seventv,
      .heatsync-provider-label.bttv,
      .heatsync-provider-label.ffz { color: #29b6f6; }

      .heatsync-provider-count {
        font-size: 10px;
        color: #808080;
        font-weight: normal;
      }

      .heatsync-add-all-btn {
        padding: 3px 8px;
        background: transparent;
        border: 1px solid #808080;
        border-radius: 0;
        color: #808080;
        font-size: 10px;
        cursor: pointer;
        transition: none;
      }

      .heatsync-add-all-btn:hover {
        background: #fff;
        border-color: #fff;
        color: #000;
      }

      .heatsync-add-all-btn.added {
        border-color: #00cc66;
        color: #00cc66;
      }

      .heatsync-add-all-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Not logged in message */
      .heatsync-login-msg {
        padding: 20px;
        text-align: center;
        color: #808080;
        font-size: 13px;
      }

      .heatsync-login-msg a {
        color: #9147ff;
        text-decoration: none;
      }

      .heatsync-login-msg a:hover {
        background: #fff;
        color: #000;
        text-decoration: none;
      }

      /* Provider emotes container */
      .heatsync-provider-emotes {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .heatsync-size-toggle {
        background: none;
        border: 1px solid #808080;
        border-radius: 0;
        color: #808080;
        font-size: 11px;
        padding: 2px 6px;
        cursor: pointer;
        margin-right: 8px;
      }

      .heatsync-size-toggle:hover {
        background: #fff;
        border-color: #fff;
        color: #000;
      }

      .heatsync-empty {
        padding: 40px 20px;
        text-align: center;
        color: #a0a0a0;
        font-size: 13px;
      }

      /* Saved emote sets list */
      .heatsync-sets-list {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
      }
      .heatsync-set-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 2px 8px;
        background: transparent;
        border: none;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        line-height: 1.3;
      }
      .heatsync-set-item:hover {
        background: rgba(255,135,0,0.07);
      }
      .heatsync-set-info {
        display: flex;
        flex-direction: row;
        gap: 6px;
        align-items: baseline;
        min-width: 0;
        flex: 1;
      }
      .heatsync-set-name {
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 1;
      }
      .heatsync-set-meta {
        font-size: 10px;
        color: #808080;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .heatsync-set-apply-btn {
        background: transparent;
        color: #ff8700;
        border: 1px solid #ff8700;
        padding: 0 6px;
        font: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        text-transform: lowercase;
        flex-shrink: 0;
        line-height: 1.4;
      }
      .heatsync-set-apply-btn:hover {
        background: #fff;
        color: #000;
        border-color: #fff;
      }
      .heatsync-set-apply-btn.confirming {
        background: #ff8700;
        color: #000;
        border-color: #ff8700;
      }
      .heatsync-set-apply-btn.applying {
        opacity: 0.6;
        cursor: wait;
      }
      .heatsync-set-apply-btn.applied {
        background: #00cc66;
        color: #000;
        border-color: #00cc66;
      }
      .heatsync-set-apply-btn.failed {
        background: #ff4444;
        color: #fff;
        border-color: #ff4444;
      }

      /* Removed emotes history list */
      .heatsync-history-list {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
      }
      .heatsync-history-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 1px 8px;
        background: transparent;
        border: none;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        line-height: 1.3;
      }
      .heatsync-history-item:hover {
        background: rgba(255,135,0,0.07);
      }
      .heatsync-history-thumb {
        width: 18px;
        height: 18px;
        object-fit: contain;
        flex-shrink: 0;
        image-rendering: pixelated;
      }
      .heatsync-history-info {
        display: flex;
        flex-direction: row;
        gap: 6px;
        align-items: baseline;
        min-width: 0;
        flex: 1;
      }
      .heatsync-history-name {
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 1;
      }
      .heatsync-history-meta {
        font-size: 10px;
        color: #808080;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .heatsync-restore-btn {
        background: transparent;
        color: #ff8700;
        border: 1px solid #ff8700;
        padding: 0 6px;
        font: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        text-transform: lowercase;
        flex-shrink: 0;
        line-height: 1.4;
      }
      .heatsync-restore-btn:hover {
        background: #fff;
        color: #000;
        border-color: #fff;
      }
      .heatsync-restore-btn.confirming {
        background: #ff8700;
        color: #000;
        border-color: #ff8700;
      }
      .heatsync-restore-btn.restoring {
        opacity: 0.6;
        cursor: wait;
      }
      .heatsync-restore-btn.restored {
        background: #00cc66;
        color: #000;
        border-color: #00cc66;
      }
      .heatsync-restore-btn.failed {
        background: #ff4444;
        color: #fff;
        border-color: #ff4444;
      }

      .heatsync-loading {
        padding: 4px 8px;
        background: #000;
        border-radius: 0;
        color: #fff;
        font-size: 11px;
        margin-bottom: 4px;
      }

      /* Import section */
      .heatsync-import-section {
        margin-bottom: 16px;
      }

      .heatsync-import-btn {
        width: 100%;
        padding: 10px 16px;
        background: linear-gradient(135deg, #ff6b35 0%, #f7931a 100%);
        border: none;
        border-radius: 0;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: none;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .heatsync-import-btn:hover {
        background: #fff !important;
        color: #000 !important;
      }

      .heatsync-import-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .heatsync-import-btn svg {
        width: 16px;
        height: 16px;
      }

      .heatsync-channel-name {
        color: #bf94ff;
        font-weight: 700;
      }

      /* Emote preview grid */
      .heatsync-import-preview {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 4px;
        margin-top: 12px;
        padding: 8px;
        background: #000;
        border-radius: 0;
        max-height: 150px;
        overflow-y: auto;
      }

      .heatsync-import-preview img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }

      .heatsync-import-preview img:hover {
      }

      /* Status messages */
      .heatsync-status {
        text-align: center;
        padding: 16px;
        color: #808080;
        font-size: 13px;
      }

      .heatsync-status.loading::after {
        content: '';
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-left: 8px;
        border: 2px solid #808080;
        border-top-color: transparent;
        border-radius: 50%;
        animation: heatsync-spin 0.8s linear infinite;
      }

      @keyframes heatsync-spin {
        to { transform: rotate(360deg); }
      }

      /* Links section */
      .heatsync-links {
        display: flex;
        gap: 8px;
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,0.12);
      }

      .heatsync-link {
        flex: 1;
        padding: 8px;
        background: rgba(255,255,255,0.08);
        border: none;
        border-radius: 0;
        color: #808080;
        font-size: 12px;
        cursor: pointer;
        text-align: center;
        text-decoration: none;
        transition: none;
      }

      .heatsync-link:hover {
        background: #fff;
        color: #000;
      }

      /* Emote count badge */
      .heatsync-emote-count {
        display: inline-block;
        padding: 2px 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 0;
        font-size: 12px;
        color: #808080;
        margin-left: 8px;
      }

      /* Provider badges */
      .heatsync-provider {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 0;
        font-size: 10px;
        font-weight: 600;
        margin-right: 4px;
      }

      .heatsync-provider.seventv { background: #29b6f6; color: #000; }
      .heatsync-provider.bttv { background: #d50014; color: #fff; }
      .heatsync-provider.ffz { background: #6b54ff; color: #fff; }

      /* Section titles */
      .heatsync-section-title {
        font-size: 11px;
        font-weight: 600;
        color: #808080;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      .heatsync-inventory-section {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(255,255,255,0.12);
      }

      /* Settings view - compact */
      .heatsync-settings {
        padding: 12px;
        overflow-y: auto;
      }

      .heatsync-setting-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }

      .heatsync-setting-row:last-child {
        border-bottom: none;
      }

      .heatsync-setting-label {
        color: #fff;
        font-size: 13px;
      }

      .heatsync-toggle {
        position: relative;
        width: 40px;
        height: 22px;
        background: rgba(255,255,255,0.06);
        border-radius: 0;
        cursor: pointer;
        transition: none;
        flex-shrink: 0;
      }

      .heatsync-toggle.active {
        background: #ff6b35;
      }

      .heatsync-toggle::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 2px;
        width: 18px;
        height: 18px;
        background: #fff;
        border-radius: 0;
        transition: none;
      }

      .heatsync-toggle.active::after {
        transform: translateX(18px);
      }

      /* Emote hover preview tooltip */
      .heatsync-emote-hover-preview {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #ff6b35;
        border-radius: 0;
        padding: 8px;
      }

      .heatsync-emote-hover-preview img {
        display: block;
        max-width: 256px;
        max-height: 128px;
        width: auto;
        height: auto;
        object-fit: contain;
      }

      .heatsync-emote-hover-preview-name {
        text-align: center;
        font-size: 11px;
        color: #fff;
        margin-top: 4px;
        font-weight: 600;
      }

      .heatsync-settings-section {
        margin-bottom: 20px;
      }

      .heatsync-settings-section-title {
        color: #ff6b35;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }

      /* Auth banner - shown when not logged in */
      .heatsync-auth-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: rgba(145, 71, 255, 0.15);
        border-bottom: 1px solid #9147ff;
        color: #bf94ff;
        font-size: 12px;
      }

      .heatsync-auth-banner a {
        color: #9147ff;
        font-weight: 600;
        text-decoration: none;
      }

      .heatsync-auth-banner a:hover {
        background: #fff;
        color: #000;
        text-decoration: none;
      }

      /* Error state */
      .heatsync-error-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 20px;
        text-align: center;
        color: #808080;
      }

      .heatsync-error-icon {
        font-size: 32px;
        margin-bottom: 12px;
      }

      .heatsync-error-msg {
        font-size: 14px;
        margin-bottom: 16px;
        color: #ff6b6b;
      }

      .heatsync-retry-btn {
        padding: 8px 16px;
        background: rgba(255,255,255,0.06);
        border: none;
        border-radius: 0;
        color: #fff;
        font-size: 13px;
        cursor: pointer;
        transition: none;
      }

      .heatsync-retry-btn:hover {
        background: #fff;
        color: #000;
      }

      /* Cached data indicator */
      .heatsync-cached-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        background: rgba(255, 204, 0, 0.2);
        border-radius: 0;
        color: #ffcc00;
        font-size: 10px;
        margin-left: 8px;
      }

      /* Connection status in header */
      .heatsync-connection-status {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: #808080;
      }

      .heatsync-status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
      }

      .heatsync-status-dot.connected { background: #00cc66; }
      .heatsync-status-dot.disconnected { background: #ffcc00; }
      .heatsync-status-dot.error { background: #ff4444; }

      /* Disabled add buttons when not logged in */
      .heatsync-add-all-btn.disabled {
        opacity: 0.4;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* Emote context menu */
      .hs-emote-ctx {
        position: fixed;
        z-index: 5001;
        background: #000;
        border: 1px solid #808080;
        border-radius: 4px;
        padding: 4px 0;
        min-width: 160px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
        font-size: 13px;
      }
      .hs-emote-ctx-item {
        display: block;
        width: 100%;
        padding: 6px 12px;
        background: none;
        border: none;
        color: #fff;
        text-align: left;
        cursor: pointer;
        font-size: 13px;
        white-space: nowrap;
      }
      .hs-emote-ctx-item:hover {
        background: #fff;
        color: #000;
      }
      .hs-emote-ctx-sep {
        height: 1px;
        background: #808080;
        margin: 4px 0;
      }

      /* Context menu inline input (rename/move) */
      .hs-emote-ctx-input {
        display: block;
        width: calc(100% - 16px);
        margin: 4px 8px;
        padding: 5px 8px;
        background: #1a1a1a;
        border: 1px solid #808080;
        border-radius: 2px;
        color: #fff;
        font-size: 12px;
        outline: none;
      }
      .hs-emote-ctx-input:focus { border-color: #ff8700; }
      .hs-emote-ctx-confirm {
        display: block;
        width: calc(100% - 16px);
        margin: 2px 8px 6px;
        padding: 4px 8px;
        background: #ff8700;
        border: none;
        border-radius: 2px;
        color: #000;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
      }
      .hs-emote-ctx-confirm:hover { background: #fff; }

      /* Import-channel button above channel emote grid */
      .hs-import-channel-bar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 8px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        flex-shrink: 0;
      }
      .hs-import-channel-btn {
        flex: 1;
        padding: 5px 10px;
        background: none;
        border: 1px solid #ff8700;
        color: #ff8700;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        border-radius: 0;
      }
      .hs-import-channel-btn:hover { background: #ff8700; color: #000; }
      .hs-import-channel-btn:disabled { opacity: 0.4; cursor: wait; }

      /* Discover tab list */
      .hs-discover-list {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 0;
      }
      .hs-discover-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 1px 8px;
        background: transparent;
        border: none;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        line-height: 1.3;
      }
      .hs-discover-item:hover { background: #fff; color: #000; }
      .hs-discover-item:hover * { color: #000 !important; }
      .hs-discover-thumb {
        width: 18px;
        height: 18px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .hs-discover-name {
        flex: 1;
        font-size: 11px;
        color: #fff;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hs-discover-add-btn {
        background: none;
        border: 1px solid #ff8700;
        color: #ff8700;
        font-size: 10px;
        font-weight: 600;
        padding: 0 6px;
        cursor: pointer;
        flex-shrink: 0;
        border-radius: 0;
        line-height: 1.4;
      }
      .hs-discover-add-btn:hover { background: #ff8700; color: #000; }
      .hs-discover-add-btn.added { border-color: #00cc66; color: #00cc66; background: none; cursor: default; }
      .hs-discover-add-btn:disabled { opacity: 0.4; cursor: wait; }

    `;
    document.head.appendChild(style);
  }

  // UI hiding CSS (Chatterino-style)
  let uiHidingStyle = null;

  function applyUiHidingSettings(settings) {
    log(' applyUiHidingSettings called with:', settings);

    // Remove existing style (check both variable AND DOM in case of extension reload)
    if (uiHidingStyle) {
      uiHidingStyle.remove();
      uiHidingStyle = null;
    }
    // Also remove by ID in case variable was reset on reload
    document.getElementById('heatsync-ui-hiding-btn')?.remove();

    const rules = [];

    // hideChatHeader is handled by content.js - don't duplicate here
    // This prevents CSS conflicts and layout bugs

    // hideStreamTitle and hideViewerCount are handled by content.js:applyUiSettings()

    if (settings.compactChatInput) {
      // Compact chat input - inline useful buttons, hide useless ones
      const nuke = 'display: none !important; visibility: hidden !important; height: 0 !important; width: 0 !important; margin: 0 !important; padding: 0 !important;';

      // Hide emote picker button (we have our own fire button)
      rules.push('[data-a-target="emote-picker-button"] { ' + nuke + ' }');

      // Hide chat pause button (useless)
      rules.push('[data-a-target="chat-pause-button"] { ' + nuke + ' }');

      // Hide the entire second row of buttons below input (waste of space)
      rules.push('.chat-input__buttons-container { ' + nuke + ' }');
      rules.push('[data-a-target="chat-input-buttons-container"] { ' + nuke + ' }');

      // Make the input buttons container inline and compact
      rules.push('.chat-input { padding: 4px 0 !important; }');
      rules.push('[class*="chat-input-buttons"] { display: inline-flex !important; flex-direction: row !important; align-items: center !important; gap: 4px !important; }');

      // Make bits button compact and inline
      rules.push('[data-a-target="bits-button"] { margin: 0 2px !important; padding: 2px 6px !important; font-size: 12px !important; }');

      // Make settings button compact
      rules.push('[data-a-target="chat-settings"] { margin: 0 2px !important; padding: 2px !important; }');

      // Ensure our fire button stays on far right
      rules.push('#heatsync-fire-button { order: 999 !important; margin-left: auto !important; }');
    }

    if (settings.highlightMentions) {
      // Chatterino-style: Red background on ENTIRE message line when mentioned
      log(' 🔴 INJECTING RED BACKGROUND CSS FOR MENTIONS');

      // Primary rule: entire message line gets red bg
      rules.push('.chat-line__message.hs-mentioned { background-color: #7f0000 !important; }');
      rules.push('.hs-mentioned.chat-line__message { background-color: #7f0000 !important; }');

      // All children must be transparent so red shows through
      rules.push('.chat-line__message.hs-mentioned * { background-color: transparent !important; background: transparent !important; }');

      // Generic fallback if class is on wrong element
      rules.push('.hs-mentioned { background-color: #7f0000 !important; }');
      rules.push('.hs-mentioned * { background-color: transparent !important; background: transparent !important; }');
    }

    // ALWAYS kill Twitch's ugly white mention backgrounds (even if highlight disabled)
    // These rules must be outside the if block to always apply
    rules.push('.mention-fragment { background-color: transparent !important; background: none !important; }');
    rules.push('[data-a-target="chat-message-mention"] { background-color: transparent !important; background: none !important; }');
    rules.push('[class*="mention-fragment"] { background-color: transparent !important; background: none !important; }');
    rules.push('.chat-line__message .mention-fragment { background: none !important; background-color: transparent !important; }');

    log(' CSS rules to apply:', rules.length);

    if (rules.length > 0) {
      uiHidingStyle = document.createElement('style');
      uiHidingStyle.id = 'heatsync-ui-hiding-btn';
      uiHidingStyle.textContent = rules.join('\n');
      document.head.appendChild(uiHidingStyle);
      log(' Applied UI hiding:', rules.length, 'rules');
    } else {
      log(' No rules to apply (all settings false)');
    }

  }

  // Cached settings (loaded async on init, updated on change)
  let cachedSettings = {
    emoteWysiwyg: true,
    emoteSpaceAfter: true,
    hideChatHeader: true,
    hideStreamTitle: false,
    hideViewerCount: false,
    compactChatInput: true,
    highlightMentions: true,
    emotePlaceholderMode: false, // Show colored rectangles instead of emote images
    viMode: false,               // Vim keybindings for chat input
    showPlatformBadges: true,    // Show [T]/[K]/[YT] badges on messages
    // 'instant'=block on right-click (default), 'menu'=show block/cancel popup, 'off'=disabled
    rightClickBlockMode: 'instant',
  };

  // Get extension settings (sync - returns cached)
  function getExtensionSettings() {
    return { ...cachedSettings };
  }

  // Load settings from chrome.storage.local (async)
  async function loadExtensionSettings() {
    try {
      const stored = await chrome.storage.sync.get('ui_settings');
      if (stored.ui_settings) {
        cachedSettings = { ...cachedSettings, ...sanitizeUiSettings(stored.ui_settings) };
      }
      // ALSO sync to localStorage for autocomplete-hook.js (page context)
      try {
        localStorage.setItem('heatsync-extension-settings', JSON.stringify(cachedSettings));
      } catch (err) {
        console.error('[heatsync-button] Failed to sync to localStorage:', err);
      }
      log('Loaded settings from storage:', cachedSettings);
    } catch (e) {
      log('Failed to load extension settings:', e);
    }
    return cachedSettings;
  }

  // Save extension settings to chrome.storage.local
  function saveExtensionSettings(settings) {
    log(' saveExtensionSettings called with:', settings);
    try {
      cachedSettings = { ...sanitizeUiSettings(settings) };
      // Save to chrome.storage.local (same key as popup.js)
      chrome.storage.sync.set({ ui_settings: cachedSettings }).then(() => {
        log(' Settings saved to storage');
      }).catch(err => {
        console.error('[heatsync-button] Failed to save to storage:', err);
      });
      // ALSO save to localStorage so autocomplete-hook.js (page context) can read it
      try {
        localStorage.setItem('heatsync-extension-settings', JSON.stringify(settings));
      } catch (err) {
        console.error('[heatsync-button] Failed to save to localStorage:', err);
      }
      // Notify autocomplete-hook.js of settings change (postMessage crosses content/page boundary)
      window.postMessage({ type: 'heatsync-settings-changed', settings: settings }, location.origin);
      // Apply UI hiding immediately
      applyUiHidingSettings(settings);
      log('Saved settings:', settings);
    } catch (e) {
      console.error('[heatsync-button] Failed to save extension settings:', e);
      log('Failed to save extension settings:', e);
    }
  }

  // Listen for settings changes from popup.js or other tabs.
  // Settings are stored in chrome.storage.sync (browser-account synced),
  // not local — gate area check accordingly.
  function _onStorageChanged(changes, area) {
    if (area === 'sync' && changes.ui_settings) {
      const newSettings = changes.ui_settings.newValue;
      if (newSettings) {
        cachedSettings = { ...cachedSettings, ...sanitizeUiSettings(newSettings) };
        // ALSO sync to localStorage for autocomplete-hook.js (page context)
        try {
          localStorage.setItem('heatsync-extension-settings', JSON.stringify(cachedSettings));
        } catch (err) {
          console.error('[heatsync-button] Failed to sync to localStorage:', err);
        }
        applyUiHidingSettings(cachedSettings);
        log('Settings updated from storage:', cachedSettings);
      }
    }
  }
  chrome.storage.onChanged.addListener(_onStorageChanged);
  btnSignal.addEventListener('abort', () => {
    chrome.storage.onChanged.removeListener(_onStorageChanged);
  });

  // Render settings view
  function renderSettings() {
    log(' renderSettings called');
    const grid = document.getElementById('heatsync-emote-grid');
    if (!grid) {
      log(' Grid not found!');
      return;
    }

    const settings = getExtensionSettings();
    log(' Rendering settings with:', settings);

    grid.innerHTML = `
      <div class="heatsync-settings">
        <div class="heatsync-settings-section">
          <div class="heatsync-settings-section-title">${t('btn_settings_tab_completion')}</div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_wysiwyg')}</div>
            </div>
            <div class="heatsync-toggle ${settings.emoteWysiwyg ? 'active' : ''}" data-setting="emoteWysiwyg"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_space_after')}</div>
            </div>
            <div class="heatsync-toggle ${settings.emoteSpaceAfter ? 'active' : ''}" data-setting="emoteSpaceAfter"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_placeholder_mode')}</div>
              <div class="heatsync-setting-desc">${t('btn_settings_placeholder_desc')}</div>
            </div>
            <div class="heatsync-toggle ${settings.emotePlaceholderMode ? 'active' : ''}" data-setting="emotePlaceholderMode"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">right-click block</div>
              <div class="heatsync-setting-desc">instant blocks immediately · menu shows block/cancel · off disables it</div>
            </div>
            <div class="heatsync-rcb-segmented" style="display:inline-flex;border:1px solid #808080;font-family:'CozetteVector',monospace;font-size:12px">
              ${['instant','menu','off'].map(v => `<button type="button" class="heatsync-rcb-opt" data-rcb="${v}" style="background:${(settings.rightClickBlockMode||'instant')===v?'#fff':'transparent'};color:${(settings.rightClickBlockMode||'instant')===v?'#000':'#fff'};border:none;cursor:pointer;padding:4px 10px;font-family:inherit;font-size:12px">${v}</button>`).join('')}
            </div>
          </div>
        </div>

        <div class="heatsync-settings-section">
          <div class="heatsync-settings-section-title">${t('btn_settings_chat_ui')}</div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_hide_header')} <span style="color:#808080;font-size:11px">${t('btn_settings_always_popout')}</span></div>
            </div>
            <div class="heatsync-toggle ${settings.hideChatHeader ? 'active' : ''}" data-setting="hideChatHeader"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_compact_input')}</div>
            </div>
            <div class="heatsync-toggle ${settings.compactChatInput ? 'active' : ''}" data-setting="compactChatInput"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_highlight_mentions')}</div>
            </div>
            <div class="heatsync-toggle ${settings.highlightMentions ? 'active' : ''}" data-setting="highlightMentions"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_platform_badges')}</div>
              <div class="heatsync-setting-desc">${t('btn_settings_platform_badges_desc')}</div>
            </div>
            <div class="heatsync-toggle ${settings.showPlatformBadges ? 'active' : ''}" data-setting="showPlatformBadges"></div>
          </div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_cosmetics')}</div>
              <div class="heatsync-setting-desc">${t('btn_settings_cosmetics_desc')}</div>
            </div>
            <div class="heatsync-toggle ${settings.showCosmetics !== false ? 'active' : ''}" data-setting="showCosmetics"></div>
          </div>
        </div>

        <div class="heatsync-settings-section">
          <div class="heatsync-settings-section-title">${t('btn_settings_input')}</div>

          <div class="heatsync-setting-row">
            <div>
              <div class="heatsync-setting-label">${t('btn_settings_vi_mode')}</div>
              <div class="heatsync-setting-desc">${t('btn_settings_vi_mode_desc')}</div>
            </div>
            <div class="heatsync-toggle ${settings.viMode ? 'active' : ''}" data-setting="viMode"></div>
          </div>
        </div>
      </div>
    `;

    // Add click handlers for toggles
    const toggles = grid.querySelectorAll('.heatsync-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const settingKey = toggle.dataset.setting;
        const currentSettings = getExtensionSettings();
        currentSettings[settingKey] = !currentSettings[settingKey];
        saveExtensionSettings(currentSettings);
        toggle.classList.toggle('active');
        log(' Setting changed:', settingKey, '=', currentSettings[settingKey]);
      });
    });

    // Right-click block segmented control
    const rcbButtons = grid.querySelectorAll('.heatsync-rcb-opt');
    rcbButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const value = btn.dataset.rcb;
        const currentSettings = getExtensionSettings();
        currentSettings.rightClickBlockMode = value;
        saveExtensionSettings(currentSettings);
        rcbButtons.forEach(b => {
          const sel = b.dataset.rcb === value;
          b.style.background = sel ? '#fff' : 'transparent';
          b.style.color = sel ? '#000' : '#fff';
        });
        log(' rightClickBlockMode →', value);
      });
    });
  }

  // Handle button click - toggle panel
  function handleButtonClick(e) {
    e.preventDefault();
    e.stopPropagation();

    if (panelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  // Handle right-click - open heatsync website
  function handleRightClick(e) {
    e.preventDefault();
    window.open('https://heatsync.org', '_blank');
  }

  // Open the panel
  async function openPanel() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;

    // Hydrate blocked set from background — fire-and-forget so the panel
    // opens instantly even when the SW is cold (this awaited 100s+ of ms after sleep).
    chrome.runtime.sendMessage({ type: 'get_inventory' })
      .then(inv => {
        if (!inv?.blocked) return
        const next = new Set(inv.blocked)
        // Re-render only if the set actually changed and panel is still open
        const same = next.size === _blockedHashSet.size && [...next].every(h => _blockedHashSet.has(h))
        _blockedHashSet = next
        if (!same && panelOpen) renderEmoteGrid()
      })
      .catch(() => {})

    // Check if panel already exists (reuse for cached images)
    let panel = document.getElementById(PANEL_ID);
    const channel = detectChannel();

    if (panel) {
      // Reuse existing panel
      panel.style.display = 'flex';
      panelOpen = true;

      // Smart positioning: flip to bottom if button is too high
      const btnRect = btn.getBoundingClientRect();
      const spaceAbove = btnRect.top;
      const spaceBelow = window.innerHeight - btnRect.bottom;
      const panelHeight = 500; // max-height from CSS

      if (spaceAbove < panelHeight && spaceBelow > spaceAbove) {
        // Not enough space above, show below instead
        panel.style.bottom = 'auto';
        panel.style.top = '100%';
        panel.style.marginBottom = '0';
        panel.style.marginTop = '8px';
      } else {
        // Reset to default (above)
        panel.style.bottom = '100%';
        panel.style.top = 'auto';
        panel.style.marginBottom = '8px';
        panel.style.marginTop = '0';
      }

      // Only reload if channel changed
      if (channel !== currentChannel) {
        currentChannel = channel;
        await loadChannelEmotes(channel);
        if (currentTab === 'channel') renderEmoteGrid();
      }

      setTimeout(() => {
        document.removeEventListener('click', handleClickOutside);
        document.addEventListener('click', handleClickOutside, { signal: btnSignal });
      }, 10);
      return;
    }

    // Create new panel
    const container = btn.parentElement;
    if (!container) return;

    container.style.position = 'relative';

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'heatsync-panel';
    panel.dir = HS_BTN_DIR();

    // Smart positioning: flip to bottom if button is too high
    const btnRect = btn.getBoundingClientRect();
    const spaceAbove = btnRect.top;
    const spaceBelow = window.innerHeight - btnRect.bottom;
    const panelHeight = 500; // max-height from CSS

    if (spaceAbove < panelHeight && spaceBelow > spaceAbove) {
      // Not enough space above, show below instead
      panel.style.bottom = 'auto';
      panel.style.top = '100%';
      panel.style.marginBottom = '0';
      panel.style.marginTop = '8px';
    }

    currentChannel = channel;
    searchQuery = '';
    log(' Panel opened, detected channel:', channel, 'URL:', window.location.pathname);

    const iconUrl = getIconUrl();
    const isLoggedIn = cachedAuthToken !== null;

    panel.innerHTML = `
      <div class="heatsync-panel-header">
        <div class="heatsync-panel-title">
          ${iconUrl ? `<img src="${iconUrl}" alt="heatsync">` : '🔥'}
          <span>heatsync</span>
        </div>
        <button class="heatsync-panel-close" aria-label="Close">✕</button>
      </div>
      ${!isLoggedIn ? `
      <div class="heatsync-auth-banner">
        <span>🔑</span>
        <span><a href="https://heatsync.org" target="_blank">${t('btn_auth_login')}</a> ${t('btn_auth_save_emotes')}</span>
      </div>
      ` : ''}
      <div class="heatsync-panel-content">
        <div class="heatsync-tabs">
          <button class="heatsync-tab active" data-tab="channel">
            ${t('btn_tab_channel')}<span class="heatsync-tab-count" id="count-channel">...</span>
          </button>
          <button class="heatsync-tab" data-tab="global">
            ${t('btn_tab_global')}<span class="heatsync-tab-count" id="count-global">...</span>
          </button>
          <button class="heatsync-tab" data-tab="mine">
            ${t('btn_tab_mine')}<span class="heatsync-tab-count" id="count-mine">...</span>
          </button>
          <button class="heatsync-tab" data-tab="sets">
            ${t('btn_tab_sets') || 'sets'}<span class="heatsync-tab-count" id="count-sets">...</span>
          </button>
          <button class="heatsync-tab" data-tab="history">
            history<span class="heatsync-tab-count" id="count-history">...</span>
          </button>
          <button class="heatsync-tab" data-tab="emoji">
            ${t('btn_tab_emoji')}<span class="heatsync-tab-count" id="count-emoji">...</span>
          </button>
          <button class="heatsync-tab" data-tab="discover">
            discover<span class="heatsync-tab-count" id="count-discover"></span>
          </button>
        </div>
        <div class="heatsync-emote-grid" id="heatsync-emote-grid">
          <div class="heatsync-empty">${t('common_loading')}</div>
        </div>
      </div>
      <div class="heatsync-panel-bottom">
        <div class="heatsync-search">
          <input type="text" id="heatsync-search" placeholder="${t('btn_search_placeholder')}" autocomplete="off">
        </div>
        <div class="heatsync-panel-footer">
          <div class="heatsync-size-buttons">
            <button class="heatsync-size-btn" data-size="1x">${t('btn_size_1x')}</button>
            <button class="heatsync-size-btn" data-size="2x">${t('btn_size_2x')}</button>
            <button class="heatsync-size-btn active" data-size="4x">${t('btn_size_4x')}</button>
          </div>
          <div style="display:flex;gap:4px;align-items:center;">
            <button class="heatsync-settings-cog" id="heatsync-undo-btn" title="Undo" disabled>
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
            </button>
            <button class="heatsync-settings-cog" id="heatsync-redo-btn" title="Redo" disabled>
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
            </button>
            <button class="heatsync-settings-cog" id="heatsync-rotate-btn" title="${t('btn_rotate_title')}">
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.88-1.6-1.01-2.47zM7.1 18.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1l-4 4 4 4V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>
            </button>
            <button class="heatsync-settings-cog" id="heatsync-rotate-chat-btn" title="rotate chat panel (C)" style="font-weight:700;font-size:13px;font-family:monospace;">C</button>
            <button class="heatsync-settings-cog" id="heatsync-settings-btn" title="${t('btn_settings_title')}">
              <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(panel);
    panelOpen = true;

    // Close button handler
    panel.querySelector('.heatsync-panel-close').addEventListener('click', closePanel);

    // Size buttons handler
    const grid = document.getElementById('heatsync-emote-grid');
    let currentSize = localStorage.getItem('heatsync-emote-size') || '1x';
    grid.classList.add(`size-${currentSize}`);

    // Set initial active state on correct button
    panel.querySelectorAll('.heatsync-size-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === currentSize);
    });

    panel.querySelectorAll('.heatsync-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentSize = btn.dataset.size;
        grid.classList.remove('size-1x', 'size-2x', 'size-4x');
        grid.classList.add(`size-${currentSize}`);
        panel.querySelectorAll('.heatsync-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        localStorage.setItem('heatsync-emote-size', currentSize);
        // Re-render to load appropriate resolution images
        if (currentTab !== 'settings') {
          renderEmoteGrid();
        }
      });
    });

    // Settings button handler (in header)
    const settingsBtn = panel.querySelector('#heatsync-settings-btn');
    settingsBtn.addEventListener('click', () => {
      // Toggle settings view
      if (currentTab === 'settings') {
        // Go back to previous tab (default to channel)
        currentTab = 'channel';
        panel.querySelectorAll('.heatsync-tab').forEach(t => t.classList.remove('active'));
        panel.querySelector('.heatsync-tab[data-tab="channel"]').classList.add('active');
        settingsBtn.classList.remove('active');
        renderEmoteGrid();
      } else {
        currentTab = 'settings';
        panel.querySelectorAll('.heatsync-tab').forEach(t => t.classList.remove('active'));
        settingsBtn.classList.add('active');
        renderSettings();
      }
    });

    // Undo/redo buttons
    const undoBtn = panel.querySelector('#heatsync-undo-btn')
    const redoBtn = panel.querySelector('#heatsync-redo-btn')

    async function fetchHistoryStatus() {
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'api_fetch',
          path: '/api/user/emotes/history-status',
          method: 'GET',
          auth: true
        })
        if (!resp || resp.ok === false) return
        const data = resp.data || resp
        undoBtn.disabled = !data.canUndo
        redoBtn.disabled = !data.canRedo
      } catch (_) {}
    }

    function flashErr(btn) {
      btn.classList.add('hs-flash-err')
      setTimeout(() => btn.classList.remove('hs-flash-err'), 800)
    }

    async function doUndoRedo(path, btn) {
      const wasUndoDisabled = undoBtn.disabled
      const wasRedoDisabled = redoBtn.disabled
      undoBtn.disabled = true
      redoBtn.disabled = true
      try {
        const resp = await chrome.runtime.sendMessage({
          type: 'api_fetch',
          path,
          method: 'POST',
          auth: true
        })
        if (!resp || resp.ok === false) {
          flashErr(btn)
          undoBtn.disabled = wasUndoDisabled
          redoBtn.disabled = wasRedoDisabled
          return
        }
        await loadInventoryEmotes()
        await fetchHistoryStatus()
        renderEmoteGrid()
      } catch (_) {
        flashErr(btn)
        undoBtn.disabled = wasUndoDisabled
        redoBtn.disabled = wasRedoDisabled
      }
    }

    undoBtn.addEventListener('click', () => doUndoRedo('/api/user/emotes/undo', undoBtn))
    redoBtn.addEventListener('click', () => doUndoRedo('/api/user/emotes/redo', redoBtn))

    // Fetch initial history state
    fetchHistoryStatus()

    // Rotate tab position button (T) — fallback path that works even when
    // the chat-tabbar is not reachable (extreme drag, weird layout state).
    const rotateBtn = panel.querySelector('#heatsync-rotate-btn');
    rotateBtn.addEventListener('click', () => {
      window.postMessage({ type: 'heatsync-rotate-tabs' }, location.origin);
    });

    // Rotate chat panel position button (C) — same fallback purpose.
    const rotateChatBtn = panel.querySelector('#heatsync-rotate-chat-btn');
    rotateChatBtn?.addEventListener('click', () => {
      window.postMessage({ type: 'heatsync-rotate-chat' }, location.origin);
    });

    // Tab handlers
    panel.querySelectorAll('.heatsync-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        currentTab = tab.dataset.tab;
        focusedEmoteIndex = -1;
        // Clear search input when switching to tabs that don't use searchQuery
        // (sets/history/discover have their own search). Avoids stale filter UI.
        if (['sets', 'history', 'discover'].includes(currentTab)) {
          const si = panel.querySelector('#heatsync-search');
          if (si && si.value) { si.value = ''; searchQuery = ''; }
        }
        panel.querySelectorAll('.heatsync-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        settingsBtn.classList.remove('active');
        renderEmoteGrid();
      });
    });

    // Search handler (debounced 150ms)
    let _searchDebounce = null
    const searchInput = panel.querySelector('#heatsync-search');
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase();
      focusedEmoteIndex = -1;
      clearTimeout(_searchDebounce)
      _searchDebounce = setTimeout(() => renderEmoteGrid(), 150)
    });

    // Close on click outside
    setTimeout(() => {
      document.removeEventListener('click', handleClickOutside);
      document.addEventListener('click', handleClickOutside, { signal: btnSignal });
    }, 10);

    // Retry event listener for error states
    window.addEventListener('heatsync-retry', async (e) => {
      const tab = e.detail;
      log(' Retrying load for tab:', tab);
      if (tab === 'channel') {
        await loadChannelEmotes(currentChannel);
      } else if (tab === 'global') {
        await loadGlobalEmotes();
      } else if (tab === 'mine' || tab === 'inventory') {
        await loadInventoryEmotes();
      } else if (tab === 'sets') {
        setsLoaded = false
        loadErrors.sets = null
        await loadSets();
      } else if (tab === 'history') {
        historyLoaded = false
        loadErrors.history = null
        await loadHistory();
      } else if (tab === 'discover') {
        discoverLoaded = false
        loadErrors.discover = null
        await loadDiscover();
      }
      renderEmoteGrid();
    }, { signal: btnSignal });

    // Kick off independent loads — each tab repaints when its data lands.
    // No await: the panel renders the loading state immediately and stale IDB data
    // (if any) paints inside loadAllEmotesFromBackground.
    currentTab = 'channel';
    loadAllEmotesFromBackground(channel);
    // Set emoji count (synchronous, no fetch)
    if (typeof EMOJI_DATA !== 'undefined') {
      const countEl = document.getElementById('count-emoji')
      if (countEl) countEl.textContent = EMOJI_DATA.length
    }
    renderEmoteGrid();
  }

  // Return URL as-is (upgrading causes CORS/ORB issues in content scripts)
  function getAnimatedUrl(url) {
    return url;
  }

  // Get URL with appropriate resolution for current size setting
  function getResolutionUrl(url, size) {
    if (!url) return url;

    // Fix relative URLs from heatsync API
    if (url.startsWith('/')) {
      url = 'https://heatsync.org' + url;
    }

    // Map size to resolution multiplier
    const resMap = { '1x': '1', '2x': '2', '4x': '4' };
    const res = resMap[size] || '1';

    // BTTV: /1x.webp -> /2x.webp or /3x.webp (max 3x)
    if (url.includes('cdn.betterttv.net')) {
      const bttvRes = res === '4' ? '3' : res;
      return url.replace(/\/[1-3]x\./, `/${bttvRes}x.`);
    }

    // 7TV: /1x.webp -> /2x.webp, /3x.webp, /4x.webp
    if (url.includes('cdn.7tv.app')) {
      return url.replace(/\/[1-4]x\./, `/${res}x.`);
    }

    // FFZ: /1 -> /2 or /4
    if (url.includes('cdn.frankerfacez.com')) {
      return url.replace(/\/emote\/(\d+)\/[124]$/, `/emote/$1/${res}`);
    }

    // Twitch: /1.0 -> /2.0 or /3.0 (max 3.0)
    if (url.includes('static-cdn.jtvnw.net')) {
      const twitchRes = res === '4' ? '3' : res;
      return url.replace(/\/[123]\.0$/, `/${twitchRes}.0`);
    }

    return url;
  }

  // Picker-specific URL: routes animated 7TV emotes through the _static
  // variant which is ~15× smaller and decodes single-frame. Other CDNs
  // and non-animated 7TV emotes pass through getResolutionUrl unchanged
  // (their _static variants 404, so we'd need an onerror fallback otherwise).
  function pickerUrlFor(e, size) {
    const base = getResolutionUrl(getAnimatedUrl(e.url), size)
    if (!base) return base
    if (e.animated && base.includes('cdn.7tv.app')) {
      return base.replace(/\/([1-4]x)\.webp$/, '/$1_static.webp')
    }
    return base
  }

  // Render the emote grid based on current tab and search
  let renderBatchTimeout = null;

  // Check if emote is in user's inventory
  function isInInventory(emote) {
    if (!inventoryEmotesCache || inventoryEmotesCache.length === 0) return false
    return _inventoryNames.has(emote.name) ||
      (emote.hash && _inventoryHashes.has(emote.hash)) ||
      (emote.id && _inventoryIds.has(emote.id))
  }

  // Get provider class name
  function getProviderClass(provider) {
    if (!provider) return 'provider-unknown';
    const p = provider.toLowerCase();
    if (p.includes('7tv') || p === 'seventv') return 'provider-7tv';
    if (p.includes('bttv') || p === 'betterttv') return 'provider-bttv';
    if (p.includes('ffz') || p === 'frankerfacez') return 'provider-ffz';
    return 'provider-unknown';
  }

  function renderEmoteGrid(opts) {
    const grid = document.getElementById('heatsync-emote-grid');
    if (!grid) return;

    // Save scrollTop when this render is triggered by a background broadcast
    // (progressive channel_emotes_update arrivals). Without this the user gets
    // teleported to the top mid-scroll because clearing the grid shrinks its
    // scrollHeight to ~0 and the browser clamps scrollTop to 0. User-initiated
    // re-renders (tab switch, search) pass no opts so scroll resets normally.
    const preserveScroll = !!(opts && opts.preserveScroll)
    const savedScrollTop = preserveScroll ? grid.scrollTop : 0

    // Check login state
    const isLoggedIn = cachedAuthToken !== null;

    // Check for errors first
    const currentError = loadErrors[currentTab];
    const currentLoading = isLoading[currentTab];
    const isCached = usingCachedData[currentTab];

    if (currentError && !currentLoading) {
      _virtualPickerEmotes = []
      _virtualRecentCount = 0
      grid.innerHTML = `
        <div class="heatsync-error-state">
          <div class="heatsync-error-icon">⚠️</div>
          <div class="heatsync-error-msg">${escapeHtml(currentError)}</div>
          <button class="heatsync-retry-btn" onclick="window.dispatchEvent(new CustomEvent('heatsync-retry', {detail: '${escapeHtml(currentTab)}'}))">
            ${t('common_retry')}
          </button>
        </div>
      `;
      return;
    }

    if (currentLoading) {
      _virtualPickerEmotes = []
      _virtualRecentCount = 0
      grid.innerHTML = `<div class="heatsync-empty">${t('common_loading')}</div>`;
      return;
    }

    if (currentTab === 'sets') {
      _virtualPickerEmotes = []
      _virtualRecentCount = 0
      renderSetsList(grid, isLoggedIn)
      return
    }

    if (currentTab === 'history') {
      _virtualPickerEmotes = []
      _virtualRecentCount = 0
      renderHistoryList(grid, isLoggedIn)
      return
    }

    if (currentTab === 'discover') {
      _virtualPickerEmotes = []
      _virtualRecentCount = 0
      renderDiscoverList(grid, isLoggedIn)
      return
    }

    let emotes = [];
    if (currentTab === 'channel') {
      emotes = channelEmotesCache;
    } else if (currentTab === 'global') {
      // Channel emotes shadow globals — same name in both means channel wins.
      // Hide from the global tab so users find it under "channel".
      const channelNames = new Set(channelEmotesCache.map(e => e.name))
      emotes = globalEmotesCache.filter(e => !channelNames.has(e.name))
    } else if (currentTab === 'mine') {
      emotes = inventoryEmotesCache;
    } else if (currentTab === 'emoji') {
      // Use EMOJI_DATA from emoji-data.js
      if (typeof EMOJI_DATA !== 'undefined') {
        emotes = EMOJI_DATA.map(e => ({
          name: e.name,
          emoji: e.emoji,
          category: e.category,
          url: null,
          isEmoji: true
        }))
      }
    }

    // Filter by search (fuzzy matching)
    if (searchQuery) {
      emotes = emotes
        .map(e => ({ ...e, _score: fuzzyScore(searchQuery, e.name) }))
        .filter(e => e._score > 0)
        .sort((a, b) => b._score - a._score)
    }

    if (emotes.length === 0) {
      _virtualPickerEmotes = []
      _virtualRecentCount = 0
      if (currentTab === 'mine' && !isLoggedIn) {
        grid.innerHTML = `<div class="heatsync-login-msg">${t('btn_login_save_emotes')}</div>`;
      } else {
        grid.innerHTML = `<div class="heatsync-empty">${searchQuery ? t('common_no_matches') : t('btn_no_emotes')}</div>`;
      }
      return;
    }

    // Show cached badge if using stale data
    if (isCached) {
      const countEl = document.getElementById(`count-${currentTab}`);
      if (countEl && !countEl.querySelector('.heatsync-cached-badge')) {
        countEl.innerHTML += `<span class="heatsync-cached-badge">${t('btn_cached')}</span>`;
      }
    }

    // Get current size for resolution
    const currentSize = localStorage.getItem('heatsync-emote-size') || '1x';

    // Prepare emotes with resolution-appropriate URLs.
    // For animated 7TV emotes use the static-frame variant in the picker —
    // it's ~15× smaller (e.g. RainTime: 13.6KB animated vs 0.9KB static)
    // and decodes a single frame instead of 15. Hover preview still uses
    // the animated 4x for recognition.
    const pickerEmotes = emotes.map(e => ({
      ...e,
      pickerUrl: pickerUrlFor(e, currentSize)
    }));

    while (grid.firstChild) grid.removeChild(grid.firstChild)

    // Import-channel bar (channel tab only, logged-in users)
    if (currentTab === 'channel' && isLoggedIn && currentChannel) {
      const bar = document.createElement('div')
      bar.className = 'hs-import-channel-bar'
      const importBtn = document.createElement('button')
      importBtn.className = 'hs-import-channel-btn'
      importBtn.textContent = 'import all channel emotes'
      importBtn.addEventListener('click', async () => {
        importBtn.disabled = true
        importBtn.textContent = 'importing…'
        try {
          const platform = window.heatsyncPlatform?.detectPlatform() || 'twitch'
          const resp = await chrome.runtime.sendMessage({
            type: 'api_fetch',
            path: '/api/user/emotes/import-channel',
            method: 'POST',
            auth: true,
            body: { channel: currentChannel, platform }
          })
          if (resp && resp.ok !== false) {
            const n = resp.data?.imported ?? resp.imported ?? resp.data?.count ?? '?'
            importBtn.textContent = `imported ${n}`
            importBtn.style.borderColor = '#00cc66'
            importBtn.style.color = '#00cc66'
            await loadInventoryEmotes()
            fetchHistoryStatus()
            // Re-enable so the user can import again (e.g. after broadcaster adds emotes)
            setTimeout(() => {
              importBtn.textContent = 'import all channel emotes'
              importBtn.style.borderColor = ''
              importBtn.style.color = ''
              importBtn.disabled = false
            }, 2000)
          } else {
            importBtn.textContent = resp?.error || 'failed'
            importBtn.style.borderColor = '#ff4444'
            importBtn.style.color = '#ff4444'
            setTimeout(() => {
              importBtn.textContent = 'import all channel emotes'
              importBtn.style.borderColor = ''
              importBtn.style.color = ''
              importBtn.disabled = false
            }, 2000)
          }
        } catch (err) {
          importBtn.textContent = 'failed'
          importBtn.style.borderColor = '#ff4444'
          importBtn.style.color = '#ff4444'
          setTimeout(() => {
            importBtn.textContent = 'import all channel emotes'
            importBtn.style.borderColor = ''
            importBtn.style.color = ''
            importBtn.disabled = false
          }, 2000)
        }
      })
      bar.appendChild(importBtn)
      grid.appendChild(bar)
    }

    // --- Virtual scroll helpers ---
    const GAP = 4
    const sizeMap = { '1x': 32, '2x': 56, '4x': 112 }
    const emoteSize = sizeMap[currentSize] || 32
    const gridPadding = 8 // padding on .heatsync-emote-grid

    function getItemsPerRow() {
      const gridWidth = grid.clientWidth - gridPadding * 2
      return Math.max(1, Math.floor((gridWidth + GAP) / (emoteSize + GAP)))
    }

    // Lazy image loader — only assigns src when the <img> intersects the
    // visible viewport. Native `loading="lazy"` is unreliable inside a
    // nested scroll container; an explicit IntersectionObserver rooted on
    // the grid itself is bulletproof. The 96px rootMargin gives a small
    // preload window so images fade in before they're visually in frame.
    if (grid._hsImgObserver) grid._hsImgObserver.disconnect()
    const imgObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const img = entry.target
        const src = img.dataset.src
        if (src && !img.src) img.src = src
        imgObserver.unobserve(img)
      }
    }, { root: grid, rootMargin: '96px 0px', threshold: 0 })
    grid._hsImgObserver = imgObserver
    function observeImg(wrap) {
      const img = wrap.querySelector('img')
      if (img && img.dataset.src) imgObserver.observe(img)
    }

    // Create emote element — no click/contextmenu listeners (delegated on grid)
    function createEmoteElement(e, index) {
      const wrap = document.createElement('div')
      const providerClass = getProviderClass(e.provider)
      const inInventory = isInInventory(e)
      const isGlobal = currentTab === 'global'

      wrap.className = `heatsync-emote-wrap ${providerClass}`
      wrap.style.minWidth = '32px'
      wrap.style.minHeight = '32px'
      wrap.dataset.index = index

      if (!isGlobal && !inInventory && currentTab !== 'mine') {
        wrap.classList.add('unadded')
      }

      // Mark blocked: keeps the emote in its slot with the dashed-outline style
      // (CSS at .heatsync-emote-wrap.blocked img). Without this, blockEmote
      // filtered the cache and surrounding emotes shifted into the empty slot.
      const _hash = e.hash || e.id || (e.url ? btoa(e.url || e.pickerUrl || '').slice(0, 24) : null)
      if (_hash && _blockedHashSet.has(_hash)) {
        wrap.classList.add('blocked')
        wrap.dataset.blockedHash = _hash
      }

      // Hover preview — must be per-element for positioning
      let previewTooltip = null
      wrap.addEventListener('mouseenter', () => {
        previewTooltip = document.createElement('div')
        previewTooltip.className = 'heatsync-emote-hover-preview'

        if (e.isEmoji) {
          const emojiPreview = document.createElement('span')
          emojiPreview.className = 'heatsync-emoji-preview'
          emojiPreview.textContent = e.emoji
          emojiPreview.style.fontSize = '48px'
          emojiPreview.style.lineHeight = '1'

          const nameLabel = document.createElement('div')
          nameLabel.className = 'heatsync-emote-hover-preview-name'
          nameLabel.textContent = `:${e.name}:`

          previewTooltip.appendChild(emojiPreview)
          previewTooltip.appendChild(nameLabel)
          document.body.appendChild(previewTooltip)

          const rect = wrap.getBoundingClientRect()
          const tooltipRect = previewTooltip.getBoundingClientRect()
          let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2)
          let top = rect.top - tooltipRect.height - 8
          if (left < 8) left = 8
          if (left + tooltipRect.width > window.innerWidth - 8) left = window.innerWidth - tooltipRect.width - 8
          if (top < 8) top = rect.bottom + 8
          previewTooltip.style.left = `${left}px`
          previewTooltip.style.top = `${top}px`
          return
        }

        const previewImg = document.createElement('img')
        previewImg.referrerPolicy = 'no-referrer'
        const previewUrl = safeUrl(getResolutionUrl(getAnimatedUrl(e.url), '4x'))
        if (previewUrl) previewImg.src = previewUrl
        previewImg.alt = e.name

        const nameLabel = document.createElement('div')
        nameLabel.className = 'heatsync-emote-hover-preview-name'
        nameLabel.textContent = e.name

        previewTooltip.appendChild(previewImg)
        previewTooltip.appendChild(nameLabel)
        document.body.appendChild(previewTooltip)

        previewImg.onload = () => {
          if (!previewTooltip?.isConnected) return
          const rect = wrap.getBoundingClientRect()
          const tooltipRect = previewTooltip.getBoundingClientRect()
          let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2)
          let top = rect.top - tooltipRect.height - 8
          const padding = 8
          if (left < padding) left = padding
          else if (left + tooltipRect.width > window.innerWidth - padding) left = window.innerWidth - tooltipRect.width - padding
          if (top < padding) top = rect.bottom + 8
          previewTooltip.style.left = `${left}px`
          previewTooltip.style.top = `${top}px`
        }

        const rect = wrap.getBoundingClientRect()
        previewTooltip.style.left = `${rect.left}px`
        previewTooltip.style.top = `${rect.top - 20}px`
      })

      wrap.addEventListener('mouseleave', () => {
        if (previewTooltip && previewTooltip.parentNode) {
          previewTooltip.remove()
          previewTooltip = null
        }
      })

      return wrap
    }

    function appendEmoteContent(wrap, e) {
      if (e.isEmoji) {
        const emojiSpan = document.createElement('span')
        emojiSpan.className = 'heatsync-emoji-cell'
        emojiSpan.textContent = e.emoji
        emojiSpan.title = `:${e.name}:`
        wrap.appendChild(emojiSpan)
      } else {
        const img = document.createElement('img')
        img.referrerPolicy = 'no-referrer'
        img.decoding = 'async'
        // Defer src until the emote actually intersects the visible viewport.
        // Without this, mounting the ±4 buffer rows fires ~150 simultaneous
        // image requests — and 7TV's CDN serves animated webp at 1x that's
        // both slower to fetch and slower to decode, jamming the pipeline.
        // The IntersectionObserver below promotes data-src → src on intersect.
        const url = safeUrl(e.pickerUrl) || ''
        img.dataset.src = url
        // One-shot fallback for 7TV _static.webp 404s (e.g. metadata wrongly
        // flags a static-source emote as animated). Retry the non-static URL.
        if (url.includes('cdn.7tv.app') && url.includes('_static.webp')) {
          img.addEventListener('error', () => {
            const fallback = url.replace('_static.webp', '.webp')
            if (img.src !== fallback) img.src = fallback
          }, { once: true })
        }
        img.alt = e.name
        img.title = e.name
        wrap.appendChild(img)
      }
    }

    // Store emotes for event delegation
    _virtualPickerEmotes = pickerEmotes

    // --- Set up event delegation on grid (once) ---
    if (!_virtualGridDelegated) {
      _virtualGridDelegated = true

      // Click delegation
      grid.addEventListener('click', (evt) => {
        const wrap = evt.target.closest('.heatsync-emote-wrap')
        if (!wrap) return
        const idx = parseInt(wrap.dataset.index, 10)
        if (isNaN(idx)) return

        // Determine which emote list this index refers to
        let e
        if (idx < _virtualRecentCount) {
          e = recentEmotes[idx]
          if (!e) return
          e = { ...e, pickerUrl: e.url ? getResolutionUrl(getAnimatedUrl(e.url), localStorage.getItem('heatsync-emote-size') || '1x') : null }
        } else {
          e = _virtualPickerEmotes[idx - _virtualRecentCount]
          if (!e) return
        }

        const inInventory = isInInventory(e)
        const isGlobal = currentTab === 'global'
        const isLoggedIn = cachedAuthToken !== null
        recordRecentEmote(e)
        if (e.isEmoji) {
          insertEmoteIntoChat(`:${e.name}:`)
        } else if (!isGlobal && !inInventory && isLoggedIn && currentTab !== 'mine') {
          addEmoteToInventorySilent(e).then(() => insertEmoteIntoChat(e.name)).catch(() => insertEmoteIntoChat(e.name))
        } else {
          insertEmoteIntoChat(e.name)
        }
      })

      // Context menu delegation — branches on rightClickBlockMode:
      //   'menu'    → existing block/cancel popup (default)
      //   'instant' → block immediately, no menu
      //   'off'     → preventDefault, do nothing (no native browser menu either)
      grid.addEventListener('contextmenu', (evt) => {
        const wrap = evt.target.closest('.heatsync-emote-wrap')
        if (!wrap) return
        const idx = parseInt(wrap.dataset.index, 10)
        if (isNaN(idx)) return

        let e
        if (idx < _virtualRecentCount) {
          e = recentEmotes[idx]
          if (!e) return
        } else {
          e = _virtualPickerEmotes[idx - _virtualRecentCount]
          if (!e) return
        }

        const mode = (cachedSettings.rightClickBlockMode || 'instant')
        if (mode === 'off') {
          evt.preventDefault()
          return
        }
        if (mode === 'instant' && currentTab !== 'mine') {
          evt.preventDefault()
          const hash = e.hash || e.id || btoa(e.url || e.pickerUrl || '').slice(0, 24)
          if (_blockedHashSet.has(hash)) {
            chrome.runtime.sendMessage({ type: 'unblock_emote', hash })
              .then(result => {
                if (result?.success) {
                  _blockedHashSet.delete(hash); renderEmoteGrid(); showPickerToast(t('btn_toast_unblocked'))
                } else {
                  showPickerToast(result?.error || 'unblock failed')
                }
              })
              .catch(err => log('Unblock failed:', err.message))
          } else {
            blockEmote(e)
            showPickerToast(t('btn_toast_blocked'))
          }
          return
        }
        showContextMenu(evt, e, currentTab)
      })
    }

    // --- Recent emotes section (non-virtualized, always small) ---
    const recentContainer = document.createElement('div')
    recentContainer.className = 'heatsync-recent-section'
    recentContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; align-content: start;'
    let globalIndex = 0
    _virtualRecentCount = 0

    if (!searchQuery && recentEmotes.length > 0 && (currentTab === 'channel' || currentTab === 'global' || currentTab === 'mine')) {
      const header = document.createElement('div')
      header.className = 'heatsync-section-header'
      header.textContent = t('btn_recent') || 'recent'
      header.style.cssText = 'width: 100%; font-size: 11px; color: #808080; padding: 2px 4px; margin-bottom: 2px;'
      recentContainer.appendChild(header)

      for (const r of recentEmotes) {
        const recentEmote = { ...r, pickerUrl: r.url ? getResolutionUrl(getAnimatedUrl(r.url), currentSize) : null }
        const wrap = createEmoteElement(recentEmote, globalIndex)
        appendEmoteContent(wrap, recentEmote)
        recentContainer.appendChild(wrap)
        observeImg(wrap)
        globalIndex++
      }
      _virtualRecentCount = recentEmotes.length

      const divider = document.createElement('div')
      divider.style.cssText = 'width: 100%; border-top: 1px solid #333; margin: 4px 0;'
      recentContainer.appendChild(divider)
    }

    grid.appendChild(recentContainer)

    // --- Virtual scroll container for main emotes ---
    let itemsPerRow = getItemsPerRow()
    let totalRows = Math.ceil(pickerEmotes.length / itemsPerRow)
    const rowHeight = emoteSize + GAP
    let totalHeight = totalRows * rowHeight

    const virtualContainer = document.createElement('div')
    virtualContainer.className = 'heatsync-virtual-container'
    virtualContainer.style.cssText = `position: relative; width: 100%; height: ${totalHeight}px;`
    grid.appendChild(virtualContainer)

    // Incremental rendering: keep a Map<emoteIndex, HTMLElement> of currently
    // mounted wraps. On scroll, only ADD new rows entering the viewport and
    // REMOVE rows leaving it — never touch elements that stay visible.
    // Recreating <img> nodes triggers re-decode and visible "unloaded" flicker
    // even on HTTP cache hits, which was the symptom the user saw.
    const mounted = new Map()
    let _renderedItemsPerRow = itemsPerRow
    // Wider buffer than before (was ±2). 4 rows of slack means small scrolls
    // (mouse wheel ticks) usually don't trigger any DOM mutation at all.
    const BUFFER_ROWS = 4

    function placeWrap(wrap, i) {
      const row = Math.floor(i / itemsPerRow)
      const col = i % itemsPerRow
      wrap.style.position = 'absolute'
      wrap.style.top = `${row * rowHeight}px`
      wrap.style.left = `${col * (emoteSize + GAP)}px`
      wrap.style.width = `${emoteSize}px`
      wrap.style.height = `${emoteSize}px`
    }

    function renderVisibleEmotes() {
      // Recompute itemsPerRow lazily — if the panel was resized, all mounted
      // wraps need repositioning. Cheap to detect, only acts when changed.
      const newItemsPerRow = getItemsPerRow()
      if (newItemsPerRow !== _renderedItemsPerRow) {
        itemsPerRow = newItemsPerRow
        _renderedItemsPerRow = newItemsPerRow
        totalRows = Math.ceil(pickerEmotes.length / itemsPerRow)
        totalHeight = totalRows * rowHeight
        virtualContainer.style.height = `${totalHeight}px`
        for (const [i, wrap] of mounted) placeWrap(wrap, i)
      }

      const scrollTop = grid.scrollTop - recentContainer.offsetHeight
      const viewHeight = grid.clientHeight
      const clampedScroll = Math.max(0, scrollTop)

      const startRow = Math.max(0, Math.floor(clampedScroll / rowHeight) - BUFFER_ROWS)
      const endRow = Math.min(totalRows, Math.ceil((clampedScroll + viewHeight) / rowHeight) + BUFFER_ROWS)
      const startIdx = startRow * itemsPerRow
      const endIdx = Math.min(endRow * itemsPerRow, pickerEmotes.length)

      // Drop wraps that scrolled out of the buffer window
      for (const [i, wrap] of mounted) {
        if (i < startIdx || i >= endIdx) {
          wrap.remove()
          mounted.delete(i)
        }
      }

      // Add wraps for indices that entered the buffer window
      const newWraps = []
      const fragment = document.createDocumentFragment()
      for (let i = startIdx; i < endIdx; i++) {
        if (mounted.has(i)) continue
        const e = pickerEmotes[i]
        const wrap = createEmoteElement(e, i + _virtualRecentCount)
        placeWrap(wrap, i)
        appendEmoteContent(wrap, e)
        mounted.set(i, wrap)
        fragment.appendChild(wrap)
        newWraps.push(wrap)
      }
      if (fragment.childNodes.length) {
        virtualContainer.appendChild(fragment)
        // Observe AFTER attach so layout is computed and IO can determine intersection
        for (const w of newWraps) observeImg(w)
      }
    }

    // Restore scroll BEFORE the initial render so renderVisibleEmotes mounts
    // the correct buffer window (the one matching what the user was looking at).
    // The browser clamps to the new scrollHeight automatically if the list shrank.
    if (preserveScroll && savedScrollTop > 0) grid.scrollTop = savedScrollTop

    // Initial render
    renderVisibleEmotes()

    // Remove old scroll handler, attach new one
    if (_virtualScrollHandler) {
      grid.removeEventListener('scroll', _virtualScrollHandler)
    }
    let _scrollRaf = 0
    _virtualScrollHandler = () => {
      if (_scrollRaf) return
      _scrollRaf = requestAnimationFrame(() => {
        _scrollRaf = 0
        renderVisibleEmotes()
      })
    }
    grid.addEventListener('scroll', _virtualScrollHandler, { passive: true });
  }

  // ===== Saved Sets =====
  // Render the user's saved emote sets as a list with apply buttons.
  // Uses safe DOM construction (no innerHTML with user content).
  function renderSetsList(grid, isLoggedIn) {
    while (grid.firstChild) grid.removeChild(grid.firstChild)

    if (!isLoggedIn) {
      const msg = document.createElement('div')
      msg.className = 'heatsync-login-msg'
      msg.textContent = t('btn_login_save_emotes')
      grid.appendChild(msg)
      return
    }

    if (!setsLoaded && !isLoading.sets) {
      isLoading.sets = true
      const loadingEl = document.createElement('div')
      loadingEl.className = 'heatsync-empty'
      loadingEl.textContent = t('common_loading')
      grid.appendChild(loadingEl)
      loadSets().finally(() => {
        isLoading.sets = false
        if (currentTab === 'sets') renderEmoteGrid()
      })
      return
    }

    if (loadErrors.sets) {
      const err = document.createElement('div')
      err.className = 'heatsync-empty'
      err.textContent = loadErrors.sets
      grid.appendChild(err)
      return
    }

    if (!savedSetsCache.length) {
      const empty = document.createElement('div')
      empty.className = 'heatsync-empty'
      empty.textContent = 'no saved sets — create one on heatsync.org'
      grid.appendChild(empty)
      return
    }

    // Delegate click once on the grid for the apply-button confirm flow
    if (!grid.dataset.hsSetsDelegated) {
      grid.dataset.hsSetsDelegated = '1'
      grid.addEventListener('click', handleSetApplyClick)
    }

    const list = document.createElement('div')
    list.className = 'heatsync-sets-list'
    for (const s of savedSetsCache) {
      const item = document.createElement('div')
      item.className = 'heatsync-set-item'

      const info = document.createElement('div')
      info.className = 'heatsync-set-info'
      const name = document.createElement('div')
      name.className = 'heatsync-set-name'
      name.textContent = (s.starred ? '★ ' : '') + (s.name || '(unnamed)')
      info.appendChild(name)

      const meta = document.createElement('div')
      meta.className = 'heatsync-set-meta'
      const count = s.emote_count || 0
      let metaText = `${count} ${count === 1 ? 'emote' : 'emotes'}`
      if (s.source_username) metaText += ` · from ${s.source_username}`
      meta.textContent = metaText
      info.appendChild(meta)

      item.appendChild(info)

      const applyBtn = document.createElement('button')
      applyBtn.className = 'heatsync-set-apply-btn'
      applyBtn.type = 'button'
      applyBtn.textContent = 'apply'
      applyBtn.dataset.setId = String(s.id)
      applyBtn.dataset.setName = s.name || '(unnamed)'
      applyBtn.dataset.setCount = String(count)
      item.appendChild(applyBtn)

      list.appendChild(item)
    }
    grid.appendChild(list)
  }

  async function handleSetApplyClick(e) {
    const btn = e.target.closest('.heatsync-set-apply-btn')
    if (!btn) return
    e.stopPropagation()
    if (btn.disabled) return

    if (!btn.classList.contains('confirming')) {
      btn.classList.add('confirming')
      btn.textContent = `replace ${btn.dataset.setCount} emotes?`
      const timer = setTimeout(() => {
        btn.classList.remove('confirming')
        btn.textContent = 'apply'
      }, 4000)
      btn.dataset.confirmTimer = String(timer)
      return
    }

    clearTimeout(parseInt(btn.dataset.confirmTimer || '0'))
    btn.classList.remove('confirming')
    btn.classList.add('applying')
    btn.disabled = true
    btn.textContent = 'applying…'
    const ok = await applySet(btn.dataset.setId)
    if (ok) {
      btn.classList.remove('applying')
      btn.classList.add('applied')
      btn.textContent = 'applied'
      // Show success state for ~1.5s, then refresh the list
      setTimeout(() => {
        if (currentTab === 'sets') renderEmoteGrid()
      }, 1500)
    } else {
      btn.classList.remove('applying')
      btn.classList.add('failed')
      btn.textContent = 'failed'
      setTimeout(() => {
        btn.classList.remove('failed')
        btn.disabled = false
        btn.textContent = 'apply'
      }, 2000)
    }
  }

  async function loadSets() {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: '/api/user/sets',
        method: 'GET',
        auth: true
      })
      if (!resp || resp.ok === false) {
        loadErrors.sets = resp?.error || 'failed to load sets'
        savedSetsCache = []
        return
      }
      const data = resp.data || resp
      savedSetsCache = Array.isArray(data?.sets) ? data.sets : []
      setsLoaded = true
      loadErrors.sets = null
      const countEl = document.getElementById('count-sets')
      if (countEl) countEl.textContent = String(savedSetsCache.length)
    } catch (err) {
      loadErrors.sets = 'failed to load sets'
      savedSetsCache = []
    }
  }

  async function applySet(setId) {
    // NOTE: do NOT call renderEmoteGrid() inside this function — the caller
    // handleSetApplyClick mutates the apply button's classes/text after the
    // promise resolves. Re-rendering here destroys the button before the
    // 'applied' state is shown. Caller is responsible for refresh.
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: `/api/user/sets/${encodeURIComponent(setId)}/apply`,
        method: 'POST',
        auth: true
      })
      if (!resp || resp.ok === false) return false
      // Refresh inventory + sets list data (DOM not re-rendered yet)
      await Promise.all([loadInventoryEmotes(), loadSets()])
      return true
    } catch (err) {
      log(' applySet error:', err?.message)
      return false
    }
  }

  // ===== Removed Emotes History =====
  // Render list of removed emotes with inline confirm restore.
  function renderHistoryList(grid, isLoggedIn) {
    while (grid.firstChild) grid.removeChild(grid.firstChild)

    if (!isLoggedIn) {
      const msg = document.createElement('div')
      msg.className = 'heatsync-login-msg'
      msg.textContent = 'log in to view removed emotes'
      grid.appendChild(msg)
      return
    }

    if (!historyLoaded && !isLoading.history) {
      isLoading.history = true
      const loadingEl = document.createElement('div')
      loadingEl.className = 'heatsync-empty'
      loadingEl.textContent = t('common_loading')
      grid.appendChild(loadingEl)
      loadHistory().finally(() => {
        isLoading.history = false
        if (currentTab === 'history') renderEmoteGrid()
      })
      return
    }

    if (loadErrors.history) {
      const err = document.createElement('div')
      err.className = 'heatsync-empty'
      err.textContent = loadErrors.history
      grid.appendChild(err)
      return
    }

    if (!removedEmotesCache.length) {
      const empty = document.createElement('div')
      empty.className = 'heatsync-empty'
      empty.textContent = 'no removed emotes'
      grid.appendChild(empty)
      return
    }

    if (!grid.dataset.hsHistoryDelegated) {
      grid.dataset.hsHistoryDelegated = '1'
      grid.addEventListener('click', handleRestoreClick)
    }

    const list = document.createElement('div')
    list.className = 'heatsync-history-list'
    for (const e of removedEmotesCache) {
      const item = document.createElement('div')
      item.className = 'heatsync-history-item'

      // Server returns custom_name (snake_case) and url which may be relative
      const displayName = e.custom_name || e.name || '(unnamed)'
      const rawUrl = e.url || ''
      const absUrl = rawUrl.startsWith('/') ? `https://heatsync.org${rawUrl}` : rawUrl
      const imgUrl = safeUrl(absUrl)
      if (imgUrl) {
        const img = document.createElement('img')
        img.className = 'heatsync-history-thumb'
        img.src = imgUrl
        img.alt = displayName
        img.loading = 'lazy'
        img.referrerPolicy = 'no-referrer'
        item.appendChild(img)
      }

      const info = document.createElement('div')
      info.className = 'heatsync-history-info'

      const name = document.createElement('div')
      name.className = 'heatsync-history-name'
      name.textContent = displayName
      info.appendChild(name)

      const meta = document.createElement('div')
      meta.className = 'heatsync-history-meta'
      const removedAt = e.removed_at ? new Date(e.removed_at).toLocaleDateString() : ''
      meta.textContent = removedAt ? `removed ${removedAt}` : 'removed'
      info.appendChild(meta)

      item.appendChild(info)

      const restoreBtn = document.createElement('button')
      restoreBtn.className = 'heatsync-restore-btn'
      restoreBtn.type = 'button'
      restoreBtn.textContent = 'restore'
      restoreBtn.dataset.emoteId = String(e.id)
      restoreBtn.dataset.emoteName = displayName
      item.appendChild(restoreBtn)

      list.appendChild(item)
    }
    grid.appendChild(list)
  }

  async function handleRestoreClick(e) {
    const btn = e.target.closest('.heatsync-restore-btn')
    if (!btn) return
    e.stopPropagation()
    if (btn.disabled) return

    if (!btn.classList.contains('confirming')) {
      btn.classList.add('confirming')
      btn.textContent = 'restore?'
      const timer = setTimeout(() => {
        btn.classList.remove('confirming')
        btn.textContent = 'restore'
      }, 4000)
      btn.dataset.confirmTimer = String(timer)
      return
    }

    clearTimeout(parseInt(btn.dataset.confirmTimer || '0'))
    btn.classList.remove('confirming')
    btn.classList.add('restoring')
    btn.disabled = true
    btn.textContent = 'restoring…'
    const ok = await restoreEmote(btn.dataset.emoteId)
    if (ok) {
      btn.classList.remove('restoring')
      btn.classList.add('restored')
      btn.textContent = 'restored'
      // Remove from local cache so it disappears from list
      const id = parseInt(btn.dataset.emoteId)
      removedEmotesCache = removedEmotesCache.filter(x => x.id !== id)
      const countEl = document.getElementById('count-history')
      if (countEl) countEl.textContent = String(removedEmotesCache.length)
      // Refresh inventory so the emote shows up in mine tab
      loadInventoryEmotes()
      fetchHistoryStatus()
    } else {
      btn.classList.remove('restoring')
      btn.classList.add('failed')
      btn.textContent = 'failed'
      setTimeout(() => {
        btn.classList.remove('failed')
        btn.disabled = false
        btn.textContent = 'restore'
      }, 2000)
    }
  }

  async function loadHistory() {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: '/api/user/emotes/removed',
        method: 'GET',
        auth: true
      })
      if (!resp || resp.ok === false) {
        loadErrors.history = resp?.error || 'failed to load history'
        removedEmotesCache = []
        return
      }
      const data = resp.data || resp
      removedEmotesCache = Array.isArray(data?.emotes) ? data.emotes : (Array.isArray(data) ? data : [])
      historyLoaded = true
      loadErrors.history = null
      const countEl = document.getElementById('count-history')
      if (countEl) countEl.textContent = String(removedEmotesCache.length)
    } catch (err) {
      loadErrors.history = 'failed to load history'
      removedEmotesCache = []
    }
  }

  async function restoreEmote(emoteId) {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: `/api/user/emotes/removed/${encodeURIComponent(emoteId)}/restore`,
        method: 'POST',
        auth: true
      })
      return !!(resp && resp.ok !== false)
    } catch (err) {
      log(' restoreEmote error:', err?.message)
      return false
    }
  }

  // ===== Discover / Trending =====
  function renderDiscoverList(grid, isLoggedIn) {
    while (grid.firstChild) grid.removeChild(grid.firstChild)

    if (!discoverLoaded && !isLoading.discover) {
      isLoading.discover = true
      const loadingEl = document.createElement('div')
      loadingEl.className = 'heatsync-empty'
      loadingEl.textContent = t('common_loading')
      grid.appendChild(loadingEl)
      loadDiscover().finally(() => {
        isLoading.discover = false
        if (currentTab === 'discover') renderEmoteGrid()
      })
      return
    }

    if (loadErrors.discover) {
      const err = document.createElement('div')
      err.className = 'heatsync-empty'
      err.textContent = loadErrors.discover
      grid.appendChild(err)
      return
    }

    if (!discoverEmotesCache.length) {
      const empty = document.createElement('div')
      empty.className = 'heatsync-empty'
      empty.textContent = 'no trending emotes found'
      grid.appendChild(empty)
      return
    }

    const list = document.createElement('div')
    list.className = 'hs-discover-list'

    for (const e of discoverEmotesCache) {
      const item = document.createElement('div')
      item.className = 'hs-discover-item'

      // Server can return relative paths like '/uploads/abc.webp' — absolutize
      const rawUrl = e.url || e.animated_url || ''
      const absUrl = rawUrl.startsWith('/') ? `https://heatsync.org${rawUrl}` : rawUrl
      const imgUrl = safeUrl(absUrl)
      if (imgUrl) {
        const img = document.createElement('img')
        img.className = 'hs-discover-thumb'
        img.src = imgUrl
        img.alt = escapeHtml(e.name)
        img.loading = 'lazy'
        img.referrerPolicy = 'no-referrer'
        item.appendChild(img)
      }

      const nameEl = document.createElement('div')
      nameEl.className = 'hs-discover-name'
      nameEl.textContent = e.name || ''
      item.appendChild(nameEl)

      const addBtn = document.createElement('button')
      addBtn.className = 'hs-discover-add-btn'
      addBtn.type = 'button'
      const alreadyIn = isInInventory(e)
      if (alreadyIn) {
        addBtn.textContent = 'added'
        addBtn.classList.add('added')
        addBtn.disabled = true
      } else {
        addBtn.textContent = '+ add'
        addBtn.addEventListener('click', async () => {
          if (!cachedAuthToken) {
            showPickerToast('log in to add emotes')
            return
          }
          addBtn.disabled = true
          addBtn.textContent = '…'
          try {
            await addEmoteToInventorySilent(e)
            addBtn.textContent = 'added'
            addBtn.classList.add('added')
          } catch (_) {
            addBtn.textContent = 'failed'
            addBtn.style.borderColor = '#ff4444'
            addBtn.style.color = '#ff4444'
            setTimeout(() => {
              addBtn.textContent = '+ add'
              addBtn.style.borderColor = ''
              addBtn.style.color = ''
              addBtn.disabled = false
            }, 1500)
          }
        })
      }
      item.appendChild(addBtn)
      list.appendChild(item)
    }

    grid.appendChild(list)
  }

  async function loadDiscover() {
    try {
      // /api/emotes/hot is the canonical trending endpoint.
      // /api/emotes/trending does NOT exist (returns 404). The analytics
      // variant lives at /api/analytics/emotes/trending with a different shape.
      let resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: '/api/emotes/hot',
        method: 'GET',
        auth: false
      })
      if (!resp || resp.ok === false) {
        loadErrors.discover = resp?.error || 'failed to load trending emotes'
        discoverEmotesCache = []
        return
      }
      const data = resp.data || resp
      discoverEmotesCache = Array.isArray(data?.emotes) ? data.emotes : (Array.isArray(data) ? data : [])
      discoverLoaded = true
      loadErrors.discover = null
      const countEl = document.getElementById('count-discover')
      if (countEl) countEl.textContent = String(discoverEmotesCache.length)
    } catch (err) {
      loadErrors.discover = 'failed to load trending emotes'
      discoverEmotesCache = []
    }
  }

  // Silent add to inventory (no UI feedback, used for click-to-use)
  async function addEmoteToInventorySilent(emote) {
    try {
      const token = await getAuthToken();
      if (!token) return;
      // Absolutize relative urls like '/uploads/...' that the server returns
      // for own-hosted emotes — import endpoint expects fully-qualified URLs.
      const rawUrl = emote.url || emote.pickerUrl || '';
      const url = rawUrl.startsWith('/') ? `https://heatsync.org${rawUrl}` : rawUrl;

      const resp = await HS.apiFetch('/api/user/emotes/import', {
        method: 'POST',
        auth: true,
        body: {
          emotes: [{
            name: emote.name,
            url,
            provider: emote.provider || 'imported',
            id: emote.id || emote.hash || ''
          }],
          source: `picker:click`
        }
      });

      // Surface server-side failures so callers can show 'failed' UI instead of
      // misleading 'added'. apiFetch returns the raw JSON; ok:false means error.
      if (resp && resp.ok === false) {
        throw new Error(resp.error || 'import failed');
      }

      // Refresh inventory
      await loadInventoryEmotes();
      fetchHistoryStatus();
    } catch (err) {
      throw err;
    }
  }

  // Update tab counts
  function updateTabCounts() {
    const countChannel = document.getElementById('count-channel');
    const countGlobal = document.getElementById('count-global');
    const countMine = document.getElementById('count-mine');
    if (countChannel) countChannel.textContent = channelEmotesCache.length || '0';
    if (countGlobal) {
      const channelNames = new Set(channelEmotesCache.map(e => e.name))
      const dedupedGlobal = globalEmotesCache.filter(e => !channelNames.has(e.name))
      countGlobal.textContent = dedupedGlobal.length || '0';
    }
    if (countMine) countMine.textContent = inventoryEmotesCache.length || '0';
  }

  // Block emote (hide from view)
  async function blockEmote(emote) {
    try {
      const hash = emote.hash || emote.id || btoa(emote.url || emote.pickerUrl).slice(0, 24);

      // Send message to background script (handles both logged in and anonymous)
      const result = await chrome.runtime.sendMessage({
        type: 'block_emote',
        hash: hash
      });

      if (!result || !result.success) {
        throw new Error(result?.error || 'Block failed');
      }

      if (result.local) {
        log('Blocked emote locally (not logged in):', emote.name);
      } else {
        log('Blocked emote:', emote.name);
      }

      // Keep the emote in the cache — let the renderer apply the .blocked class
      // so it stays in place with a dashed outline instead of shifting siblings.
      _blockedHashSet.add(hash);

      updateTabCounts();
      renderEmoteGrid();

    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) {
        const toast = document.createElement('div');
        toast.textContent = t('common_extension_updated');
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f44;color:#fff;padding:8px 16px;border-radius:4px;z-index:99999;font-size:14px;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
      }
      log('Failed to block emote:', err.message);
    }
  }

  // --- Context menu ---
  let _ctxMenu = null;
  let _blockedHashSet = new Set();

  function dismissContextMenu() {
    if (!_ctxMenu) return;
    _ctxMenu.remove();
    _ctxMenu = null;
  }

  function showPickerToast(msg) {
    // Prefer dropping the toast into multichat's message stream when it's open,
    // but always show SOMETHING so users get feedback for context-menu actions
    // even when multichat is closed.
    const msgsEl = document.getElementById('hs-mc-messages');
    if (msgsEl) {
      const div = document.createElement('div');
      div.className = 'hs-mc-msg hs-mc-system';
      div.textContent = msg;
      msgsEl.appendChild(div);
      const excess = msgsEl.children.length - 150
      if (excess > 0) {
        const range = document.createRange()
        range.setStartBefore(msgsEl.firstChild)
        range.setEndBefore(msgsEl.children[excess])
        range.deleteContents()
      }
      requestAnimationFrame(() => { msgsEl.scrollTop = msgsEl.scrollHeight })
      return;
    }
    // Fallback: floating toast in the picker panel itself
    const panel = document.querySelector('#heatsync-emote-grid')?.closest('div');
    const host = panel || document.body;
    if (!host) return;
    let toast = host.querySelector('.heatsync-floating-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'heatsync-floating-toast';
      toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#000;color:#fff;border:1px solid #ff8700;padding:8px 14px;font-size:12px;z-index:99999;pointer-events:none;opacity:0;transition:opacity 0.15s';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0' }, 2200);
  }

  function showContextMenu(evt, emote, tab) {
    evt.preventDefault();
    evt.stopPropagation();
    dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'hs-emote-ctx';
    _ctxMenu = menu;

    const hash = emote.hash || emote.id || btoa(emote.url || emote.pickerUrl || '').slice(0, 24);
    const inInv = isInInventory(emote);
    const isBlocked = _blockedHashSet.has(hash);

    // Block / unblock
    if (tab !== 'mine') {
      const blockBtn = document.createElement('button');
      blockBtn.className = 'hs-emote-ctx-item';
      blockBtn.textContent = isBlocked ? t('btn_ctx_unblock') : t('btn_ctx_block');
      blockBtn.addEventListener('click', async () => {
        dismissContextMenu();
        if (isBlocked) {
          try {
            const result = await chrome.runtime.sendMessage({ type: 'unblock_emote', hash });
            if (result?.success) {
              _blockedHashSet.delete(hash);
              renderEmoteGrid();
              showPickerToast(t('btn_toast_unblocked'));
            } else {
              showPickerToast(result?.error || 'unblock failed');
            }
          } catch (err) {
            if (err.message?.includes('Extension context invalidated')) {
              const toast = document.createElement('div');
              toast.textContent = t('common_extension_updated');
              toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f44;color:#fff;padding:8px 16px;border-radius:4px;z-index:99999;font-size:14px;';
              document.body.appendChild(toast);
              setTimeout(() => toast.remove(), 5000);
            }
            log('Unblock failed:', err.message);
          }
        } else {
          blockEmote(emote);
          _blockedHashSet.add(hash);
          showPickerToast(t('btn_toast_blocked'));
        }
      });
      menu.appendChild(blockBtn);
    }

    // Add / remove from inventory
    if (tab === 'mine' || inInv) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'hs-emote-ctx-item';
      removeBtn.textContent = t('btn_ctx_remove_inventory');
      removeBtn.addEventListener('click', async () => {
        dismissContextMenu();
        try {
          await chrome.runtime.sendMessage({ type: 'remove_from_inventory', emoteHash: hash, emoteName: emote.name });
          showPickerToast(t('btn_toast_removed'));
          if (tab === 'mine') {
            inventoryEmotesCache = inventoryEmotesCache.filter(e => e.name !== emote.name);
            rebuildInventoryIndex()
            updateTabCounts();
            renderEmoteGrid();
          }
          fetchHistoryStatus();
        } catch (err) {
          if (err.message?.includes('Extension context invalidated')) {
            const toast = document.createElement('div');
            toast.textContent = t('common_extension_updated');
            toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#f44;color:#fff;padding:8px 16px;border-radius:4px;z-index:99999;font-size:14px;';
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
          }
          log('Remove failed:', err.message);
        }
      });
      menu.appendChild(removeBtn);
    } else if (cachedAuthToken) {
      const addBtn = document.createElement('button');
      addBtn.className = 'hs-emote-ctx-item';
      addBtn.textContent = t('btn_ctx_add_inventory');
      addBtn.addEventListener('click', () => {
        dismissContextMenu();
        addEmoteToInventorySilent(emote);
        showPickerToast(t('btn_toast_added'));
      });
      menu.appendChild(addBtn);
    }

    // Rename / move / share set — mine tab + logged-in only
    if (tab === 'mine' && cachedAuthToken) {
      const sep0 = document.createElement('div');
      sep0.className = 'hs-emote-ctx-sep';
      menu.appendChild(sep0);

      // Rename
      const renameBtn = document.createElement('button');
      renameBtn.className = 'hs-emote-ctx-item';
      renameBtn.textContent = 'rename';
      renameBtn.addEventListener('click', () => {
        // Swap button row with inline input
        renameBtn.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'hs-emote-ctx-input';
        input.value = emote.name;
        input.setAttribute('autocomplete', 'off');
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'hs-emote-ctx-confirm';
        confirmBtn.textContent = 'save';
        menu.insertBefore(input, renameBtn.nextSibling);
        menu.insertBefore(confirmBtn, input.nextSibling);
        input.focus();
        input.select();
        confirmBtn.addEventListener('click', async () => {
          const newName = input.value.trim();
          if (!newName || newName === emote.name) { dismissContextMenu(); return; }
          // Use the emote's actual slot_number (mapped to .slot in background) —
          // findIndex returns array position which may not equal slot when there
          // are gaps from deleted emotes.
          const slot = emote.slot ?? inventoryEmotesCache.find(e => e.hash === hash)?.slot;
          if (slot == null) { dismissContextMenu(); return; }
          dismissContextMenu();
          try {
            const resp = await chrome.runtime.sendMessage({
              type: 'api_fetch',
              path: `/api/user/emotes/${slot}/rename`,
              method: 'PUT',
              auth: true,
              body: { newName }
            });
            if (resp && resp.ok !== false) {
              showPickerToast(`renamed to ${newName}`);
              await loadInventoryEmotes();
              renderEmoteGrid();
              fetchHistoryStatus();
            } else {
              showPickerToast(resp?.error || 'rename failed');
            }
          } catch (_) { showPickerToast('rename failed'); }
        });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') confirmBtn.click();
          if (ev.key === 'Escape') dismissContextMenu();
          ev.stopPropagation();
        });
      });
      menu.appendChild(renameBtn);

      // Move to slot
      const moveBtn = document.createElement('button');
      moveBtn.className = 'hs-emote-ctx-item';
      moveBtn.textContent = 'move to slot…';
      moveBtn.addEventListener('click', () => {
        moveBtn.style.display = 'none';
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.className = 'hs-emote-ctx-input';
        input.placeholder = 'slot number';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'hs-emote-ctx-confirm';
        confirmBtn.textContent = 'move';
        menu.insertBefore(input, moveBtn.nextSibling);
        menu.insertBefore(confirmBtn, input.nextSibling);
        input.focus();
        // Use emote.slot (server slot_number); array index can drift from slot.
        const fromSlot = emote.slot ?? inventoryEmotesCache.find(e => e.hash === hash)?.slot;
        confirmBtn.addEventListener('click', async () => {
          const toSlot = parseInt(input.value, 10);
          if (isNaN(toSlot) || fromSlot == null) { dismissContextMenu(); return; }
          dismissContextMenu();
          try {
            const resp = await chrome.runtime.sendMessage({
              type: 'api_fetch',
              path: `/api/user/emotes/${fromSlot}/move`,
              method: 'PUT',
              auth: true,
              body: { toSlot }
            });
            if (resp && resp.ok !== false) {
              showPickerToast(`moved to slot ${toSlot}`);
              await loadInventoryEmotes();
              renderEmoteGrid();
              fetchHistoryStatus();
            } else {
              showPickerToast(resp?.error || 'move failed');
            }
          } catch (_) { showPickerToast('move failed'); }
        });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') confirmBtn.click();
          if (ev.key === 'Escape') dismissContextMenu();
          ev.stopPropagation();
        });
      });
      menu.appendChild(moveBtn);

      // Share set / unshare
      const shareBtn = document.createElement('button');
      shareBtn.className = 'hs-emote-ctx-item';
      shareBtn.textContent = discoverShareUrl ? 'unshare set' : 'share set';
      shareBtn.addEventListener('click', async () => {
        dismissContextMenu();
        if (discoverShareUrl) {
          // Unshare
          try {
            await chrome.runtime.sendMessage({
              type: 'api_fetch',
              path: '/api/user/emotes/share',
              method: 'DELETE',
              auth: true
            });
            discoverShareUrl = null;
            showPickerToast('set unshared');
          } catch (_) { showPickerToast('unshare failed'); }
        } else {
          // Share
          try {
            const resp = await chrome.runtime.sendMessage({
              type: 'api_fetch',
              path: '/api/user/emotes/share',
              method: 'POST',
              auth: true,
              body: {}
            });
            if (resp && resp.ok !== false) {
              const shortId = resp.data?.shortId || resp.shortId;
              if (shortId) {
                discoverShareUrl = `https://heatsync.org/s/${shortId}`;
                navigator.clipboard.writeText(discoverShareUrl).catch(() => {});
                showPickerToast(`share link copied: ${discoverShareUrl}`);
              } else {
                showPickerToast('share failed');
              }
            } else {
              showPickerToast(resp?.error || 'share failed');
            }
          } catch (_) { showPickerToast('share failed'); }
        }
      });
      menu.appendChild(shareBtn);
    }

    // Separator
    const sep = document.createElement('div');
    sep.className = 'hs-emote-ctx-sep';
    menu.appendChild(sep);

    // Copy name
    const copyName = document.createElement('button');
    copyName.className = 'hs-emote-ctx-item';
    copyName.textContent = t('btn_ctx_copy_name');
    copyName.addEventListener('click', () => {
      dismissContextMenu();
      navigator.clipboard.writeText(emote.name).catch(() => {});
      showPickerToast(t('btn_toast_copied'));
    });
    menu.appendChild(copyName);

    // Copy URL
    const copyUrl = document.createElement('button');
    copyUrl.className = 'hs-emote-ctx-item';
    copyUrl.textContent = t('btn_ctx_copy_url');
    copyUrl.addEventListener('click', () => {
      dismissContextMenu();
      navigator.clipboard.writeText(emote.url || emote.pickerUrl || '').catch(() => {});
      showPickerToast(t('btn_toast_copied'));
    });
    menu.appendChild(copyUrl);

    document.body.appendChild(menu);

    // Position — clamp to viewport
    const rect = menu.getBoundingClientRect();
    let x = evt.clientX;
    let y = evt.clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  // Dismiss on click-outside or Escape (gated on menu existing)
  document.addEventListener('click', (e) => {
    if (_ctxMenu && !_ctxMenu.contains(e.target)) dismissContextMenu();
  }, { signal: btnSignal });
  document.addEventListener('keydown', (e) => {
    if (_ctxMenu && e.key === 'Escape') { dismissContextMenu(); return }

    // Keyboard navigation in emote picker
    if (!panelOpen) return
    const grid = document.getElementById('heatsync-emote-grid')
    if (!grid) return

    if (e.key === 'Escape') { closePanel(); e.preventDefault(); return }

    const totalEmotes = _virtualRecentCount + _virtualPickerEmotes.length
    if (totalEmotes === 0) return

    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      e.preventDefault()

      if (e.key === 'Enter' && focusedEmoteIndex >= 0 && focusedEmoteIndex < totalEmotes) {
        const focusedWrap = grid.querySelector(`.heatsync-emote-wrap[data-index="${focusedEmoteIndex}"]`)
        if (focusedWrap) focusedWrap.click()
        return
      }

      // Calculate items per row from grid width
      const sizeMap = { '1x': 32, '2x': 56, '4x': 112 }
      const emoteSize = sizeMap[localStorage.getItem('heatsync-emote-size') || '1x'] || 32
      const gridPadding = 8
      const gridWidth = grid.clientWidth - gridPadding * 2
      const itemsPerRow = Math.max(1, Math.floor((gridWidth + 4) / (emoteSize + 4)))

      let newIdx = focusedEmoteIndex
      if (e.key === 'ArrowRight') newIdx = Math.min(newIdx + 1, totalEmotes - 1)
      else if (e.key === 'ArrowLeft') newIdx = Math.max(newIdx - 1, 0)
      else if (e.key === 'ArrowDown') newIdx = Math.min(newIdx + itemsPerRow, totalEmotes - 1)
      else if (e.key === 'ArrowUp') newIdx = Math.max(newIdx - itemsPerRow, 0)

      if (newIdx < 0) newIdx = 0

      // Remove old focus
      const oldFocused = grid.querySelector('.hs-kb-focus')
      if (oldFocused) oldFocused.classList.remove('hs-kb-focus')
      focusedEmoteIndex = newIdx

      // For virtualized emotes, scroll to ensure the target is rendered
      if (newIdx >= _virtualRecentCount) {
        const virtualIdx = newIdx - _virtualRecentCount
        const rowHeight = emoteSize + 4
        const row = Math.floor(virtualIdx / itemsPerRow)
        const recentSection = grid.querySelector('.heatsync-recent-section')
        const recentHeight = recentSection ? recentSection.offsetHeight : 0
        const targetTop = recentHeight + row * rowHeight
        const targetBottom = targetTop + rowHeight

        // Scroll grid to show the target row
        if (targetTop < grid.scrollTop) {
          grid.scrollTop = targetTop
        } else if (targetBottom > grid.scrollTop + grid.clientHeight) {
          grid.scrollTop = targetBottom - grid.clientHeight
        }
      }

      // Find and focus the element (may need a frame for virtual scroll to render it)
      requestAnimationFrame(() => {
        const newFocused = grid.querySelector(`.heatsync-emote-wrap[data-index="${focusedEmoteIndex}"]`)
        if (newFocused) {
          newFocused.classList.add('hs-kb-focus')
          newFocused.scrollIntoView({ block: 'nearest' })
        }
      })
    }
  }, { signal: btnSignal });

  // Sync blocked hash set from content.js
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'heatsync-blocked-sync' && Array.isArray(event.data.hashes)) {
      _blockedHashSet = new Set(event.data.hashes);
    }
  }, { signal: btnSignal });

  // Independent loads for channel/global and inventory.
  // Inventory is in-memory in the background and resolves <50ms; channel/global
  // can wait on third-party APIs. Gating inventory on the picker fetch made the
  // "mine" tab show "loading…" for seconds even though 2k+ emotes were ready.
  // Each tab paints stale IDB data immediately, then re-renders when fresh data lands.
  function loadAllEmotesFromBackground(channel) {
    // Paint stale IDB data immediately (parallel reads, fire-and-forget render)
    ;(async () => {
      const [staleChannel, staleGlobal, staleInventory] = await Promise.all([
        channel ? getCachedEmotes(`channel:${channel}`) : Promise.resolve(null),
        getCachedEmotes('global'),
        getCachedEmotes('inventory')
      ])
      let painted = false
      if (staleChannel)   { channelEmotesCache   = staleChannel;   usingCachedData.channel = true; painted = true }
      if (staleGlobal)    { globalEmotesCache    = staleGlobal;    usingCachedData.global  = true; painted = true }
      if (staleInventory) { inventoryEmotesCache = staleInventory; usingCachedData.mine    = true; rebuildInventoryIndex(); painted = true }
      if (painted) {
        updateTabCounts()
        renderEmoteGrid({ preserveScroll: true })
      }
    })()

    // Loading flags only block the UI when we have NO stale data — otherwise the
    // tab keeps showing the stale grid until fresh arrives (no flicker).
    isLoading.channel = true
    isLoading.global  = true
    isLoading.mine    = true

    // --- Inventory load (fast, independent) ---
    chrome.runtime.sendMessage({ type: 'get_inventory' })
      .then(invResp => {
        inventoryEmotesCache = invResp?.emotes || []
        rebuildInventoryIndex()
        usingCachedData.mine = false
        loadErrors.mine = null
        if (inventoryEmotesCache.length > 0) setCachedEmotes('inventory', inventoryEmotesCache)
      })
      .catch(err => {
        log(' inventory load failed:', err?.message)
        // Keep stale IDB data if we had it; only flag error on cold-empty
        if (!inventoryEmotesCache.length) loadErrors.mine = 'failed to load your emotes'
      })
      .finally(() => {
        isLoading.mine = false
        updateTabCounts()
        if (currentTab === 'mine') renderEmoteGrid({ preserveScroll: true })
      })

    // --- Picker load (channel + global, may wait on 7TV/FFZ/BTTV) ---
    chrome.runtime.sendMessage({
      type: 'get_picker_emotes',
      channel: channel || null,
      platform: window.heatsyncPlatform?.detectPlatform() || 'unknown'
    })
      .then(pickerResp => {
        const ch = pickerResp?.channelEmotes
        const gl = pickerResp?.globalEmotes
        const channelStillLoading = !!pickerResp?.channelLoading
        if (Array.isArray(ch)) {
          channelEmotesCache = ch
          usingCachedData.channel = false
          loadErrors.channel = null
          if (channel && ch.length > 0) setCachedEmotes(`channel:${channel}`, ch)
        }
        if (Array.isArray(gl)) {
          globalEmotesCache = gl
          usingCachedData.global = false
          loadErrors.global = null
          if (gl.length > 0) setCachedEmotes('global', gl)
        }
        // Keep channel loading flag set if background just kicked off fetch —
        // the channel_emotes_update broadcast listener will clear it on arrival.
        isLoading.channel = channelStillLoading
        isLoading.global  = false
        updateTabCounts()
        if (currentTab === 'channel' || currentTab === 'global') renderEmoteGrid({ preserveScroll: true })
        // Watchdog: clear channel loading after 12s if the broadcast never
        // arrives (e.g. fetchChannelOwnerEmotes hit an exception path).
        if (channelStillLoading) {
          cleanup.setTimeout(() => {
            if (isLoading.channel) {
              isLoading.channel = false
              if (!channelEmotesCache.length) loadErrors.channel = 'channel emotes unavailable'
              updateTabCounts()
              if (currentTab === 'channel') renderEmoteGrid({ preserveScroll: true })
            }
          }, 12000)
        }
      })
      .catch(err => {
        log(' picker load failed:', err?.message)
        if (!channelEmotesCache.length) loadErrors.channel = 'failed to load channel emotes'
        if (!globalEmotesCache.length)  loadErrors.global  = 'failed to load global emotes'
        isLoading.channel = false
        isLoading.global  = false
        updateTabCounts()
        if (currentTab === 'channel' || currentTab === 'global') renderEmoteGrid({ preserveScroll: true })
      })
  }

  // Load user's inventory emotes — delegates to background cache via get_inventory
  // (kept as separate function so retry handlers and addEmoteToInventorySilent can call it).
  // Writes to IDB on success so cold opens after SW sleep paint stale instantly.
  async function loadInventoryEmotes() {
    isLoading.mine = true;
    loadErrors.mine = null;
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'get_inventory' });
      inventoryEmotesCache = resp?.emotes || [];
      rebuildInventoryIndex()
      loadErrors.mine = null;
      usingCachedData.mine = false;
      if (inventoryEmotesCache.length > 0) setCachedEmotes('inventory', inventoryEmotesCache)
      updateTabCounts();
    } catch (err) {
      // Don't wipe cached data on transient failure
      if (!inventoryEmotesCache.length) {
        rebuildInventoryIndex()
        loadErrors.mine = 'failed to load your emotes';
      }
      updateTabCounts();
    } finally {
      isLoading.mine = false;
    }
  }

  // Load channel emotes — reads from background's in-memory cache (no direct API fetch)
  // Falls back to IndexedDB stale data while background loads, then updates once ready.
  async function loadChannelEmotes(channel) {
    if (!channel) {
      channelEmotesCache = [];
      loadErrors.channel = null;
      updateTabCounts();
      return;
    }

    const cacheKey = `channel:${channel}`;
    isLoading.channel = true;
    loadErrors.channel = null;
    usingCachedData.channel = false;

    // Show IndexedDB stale data immediately while background fetches
    const stale = await getCachedEmotes(cacheKey);
    if (stale) {
      channelEmotesCache = stale;
      usingCachedData.channel = true;
      log(' Loaded', channelEmotesCache.length, 'channel emotes (stale idb)');
      updateTabCounts();
    }

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'get_picker_emotes',
        channel,
        platform: window.heatsyncPlatform?.detectPlatform() || 'unknown'
      });
      const fresh = resp?.channelEmotes || [];
      channelEmotesCache = fresh;
      usingCachedData.channel = false;
      loadErrors.channel = null;
      log(' Updated', channelEmotesCache.length, 'channel emotes (background cache)');
      updateTabCounts();
      // persist to IndexedDB so next open is instant
      if (fresh.length > 0) setCachedEmotes(cacheKey, fresh);
    } catch (err) {
      if (!stale) {
        channelEmotesCache = [];
        loadErrors.channel = 'failed to load channel emotes';
        updateTabCounts();
      }
    } finally {
      isLoading.channel = false;
    }
  }

  // Load global emotes — reads from background's in-memory cache (no direct API fetch)
  async function loadGlobalEmotes() {
    const cacheKey = 'global';
    isLoading.global = true;
    loadErrors.global = null;
    usingCachedData.global = false;

    // Show IndexedDB stale data immediately
    const stale = await getCachedEmotes(cacheKey);
    if (stale) {
      globalEmotesCache = stale;
      usingCachedData.global = true;
      log(' Loaded', globalEmotesCache.length, 'global emotes (stale idb)');
      updateTabCounts();
    }

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'get_picker_emotes',
        channel: null,
        platform: window.heatsyncPlatform?.detectPlatform() || 'unknown'
      });
      const fresh = resp?.globalEmotes || [];
      globalEmotesCache = fresh;
      usingCachedData.global = false;
      loadErrors.global = null;
      log(' Updated', globalEmotesCache.length, 'global emotes (background cache)');
      updateTabCounts();
      if (fresh.length > 0) setCachedEmotes(cacheKey, fresh);
    } catch (err) {
      if (!stale) {
        globalEmotesCache = [];
        loadErrors.global = 'failed to load global emotes';
        updateTabCounts();
      }
    } finally {
      isLoading.global = false;
    }
  }

  // Insert emote name into Twitch chat input
  function insertEmoteIntoChat(emoteName) {
    const platform = window.heatsyncPlatform?.detectPlatform() || 'unknown';

    let chatInput;
    if (platform === 'youtube') {
      chatInput = document.querySelector('yt-live-chat-text-input-field-renderer div#input[contenteditable]')
    } else if (platform === 'kick') {
      // Kick uses a regular input or textarea
      chatInput = document.querySelector('div.editor-input');
    } else {
      // Twitch uses contenteditable
      chatInput = document.querySelector('[data-a-target="chat-input"]');
    }

    if (!chatInput) {
      return;
    }

    if (platform === 'youtube') {
      // YouTube: delegate to youtube-content.js via message (execCommand deprecated)
      chrome.runtime.sendMessage({ type: 'youtube_insert_emote', emoteName })
    } else {
      // Twitch/Kick: contenteditable. Slate keeps phantom <p><br></p> blocks
      // when visually empty — textContent is "" but cursor sits in a later
      // paragraph, so plain insertText leaves a blank line above.
      const currentText = chatInput.textContent || '';
      chatInput.focus();
      if (currentText.trim() === '') {
        document.execCommand('selectAll');
        document.execCommand('insertText', false, emoteName + ' ');
      } else {
        const needsSpace = !currentText.endsWith(' ');
        document.execCommand('insertText', false, (needsSpace ? ' ' : '') + emoteName + ' ');
      }
    }

    // Close panel after inserting
    closePanel();
  }

  // Close the panel (hide, don't destroy - keeps images cached)
  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) panel.style.display = 'none';
    panelOpen = false;
    document.removeEventListener('click', handleClickOutside);
  }

  // Handle click outside panel
  function handleClickOutside(e) {
    const panel = document.getElementById(PANEL_ID);
    const btn = document.getElementById(BUTTON_ID);
    if (panel && !panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      closePanel();
    }
  }

  // Inject button into chat
  function injectButton() {
    if (buttonInjected && document.getElementById(BUTTON_ID)) return;

    // Don't inject if already present
    if (document.getElementById(BUTTON_ID)) {
      buttonInjected = true;
      return;
    }

    // Find Twitch's emote picker button directly
    let anchor = document.querySelector('[data-a-target="emote-picker-button"]');
    let insertAfter = true;

    // Kick fallback — anchor near the chat input area
    if (!anchor && window.location.hostname.includes('kick.com')) {
      anchor = document.querySelector('.editor-input')?.parentElement ||
               document.querySelector('[class*="editor-input"]')?.parentElement ||
               document.querySelector('[class*="chatroom-footer"]') ||
               document.querySelector('.chat-footer') ||
               document.querySelector('[class*="chat-input"]')?.parentElement ||
               document.querySelector('#message-input')?.parentElement;
      insertAfter = false; // append inside the container on Kick
    }

    // YouTube live chat iframe — inject near the chat input
    if (!anchor && window.location.hostname.includes('youtube.com')) {
      anchor = document.querySelector('yt-live-chat-text-input-field-renderer #buttons') ||
               document.querySelector('yt-live-chat-text-input-field-renderer') ||
               document.querySelector('#chat-messages')?.closest('yt-live-chat-renderer')?.querySelector('#input-panel')
      insertAfter = false // append inside container
    }

    if (!anchor) {
      log(' Anchor element not found yet');
      return;
    }

    const btn = createButton();

    if (insertAfter) {
      // Twitch: insert right AFTER the emote button (keep both)
      anchor.parentElement.insertBefore(btn, anchor.nextSibling);
    } else {
      // Kick: append inside the chat footer/input area
      anchor.appendChild(btn);
    }

    buttonInjected = true;
    log(' 🔥 Button added next to emote picker');

    // Start preloading emotes in background once button is injected
    if (!emotesPreloaded && !preloadingInProgress) {
      preloadEmotesInBackground();
    }
  }

  // Preload all emotes in background when page loads
  async function preloadEmotesInBackground() {
    if (emotesPreloaded || preloadingInProgress) return;
    preloadingInProgress = true;

    const channel = detectChannel();
    if (!channel) {
      preloadingInProgress = false;
      return;
    }

    currentChannel = channel;
    log(' 🔄 Background preloading emotes for', channel);

    try {
      // Load all emote sources in parallel (uses IndexedDB cache)
      await loadAllEmotesFromBackground(channel);

      const totalEmotes = channelEmotesCache.length + globalEmotesCache.length + inventoryEmotesCache.length;
      log(' ✅ Preloaded', totalEmotes, 'emotes metadata');

      // Preloading disabled (ORB blocks, browser handles natively)
      emotesPreloaded = true;

    } catch (err) {
    }

    preloadingInProgress = false;
  }

  // Inject preconnect hints for CDN domains
  function injectPreconnectHints() {
    const domains = [
      'https://cdn.7tv.app',
      'https://cdn.betterttv.net',
      'https://cdn.frankerfacez.com'
    ];
    domains.forEach(href => {
      if (!document.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
        const link = document.createElement('link');
        link.rel = 'preconnect';
        link.href = href;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      }
    });
    log(' Preconnect hints injected');
  }

  // Cleanup orphaned elements from previous extension loads
  function cleanupOrphanedElements() {
    // Remove any duplicate style elements
    document.querySelectorAll('#heatsync-ui-hiding-btn').forEach((el, i) => {
      if (i > 0) el.remove(); // Keep first, remove rest
    });
    document.querySelectorAll('#heatsync-button-styles').forEach((el, i) => {
      if (i > 0) el.remove();
    });
    // Remove ALL loading indicators (feature disabled)
    document.querySelectorAll('#heatsync-loading-status').forEach(el => el.remove());
  }

  // Initialize
  async function init() {
    log(' 🔥 Initializing button module on:', window.location.href);
    cleanupOrphanedElements();
    injectPreconnectHints();
    injectStyles();

    // Load and apply UI hiding settings on load (async)
    const settings = await loadExtensionSettings();
    applyUiHidingSettings(settings);

    // Start background preloading immediately (don't wait for button)
    setTimeout(() => {
      if (!emotesPreloaded && !preloadingInProgress) {
        preloadEmotesInBackground();
      }
    }, 100);

    // Try to inject immediately
    injectButton();

    // Re-try periodically (chat might load later)
    cleanup.setInterval(() => {
      if (!document.getElementById(BUTTON_ID)) {
        buttonInjected = false;
      }
      injectButton();
    }, 2000, 'button-retry');

    log(' Retry interval started');

    // SPA navigation — event-driven via early-inject-main.js history hooks
    let lastUrl = location.href;
    function handleButtonNav() {
      if (location.href === lastUrl) return
      lastUrl = location.href;
      buttonInjected = false;
      emotesPreloaded = false;
      closePanel();
      cleanup.setTimeout(injectButton, 500);
    }
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin) return
      if (event.data?.type === 'heatsync-nav') handleButtonNav()
    }, { signal: btnSignal })
    cleanup.setInterval(() => handleButtonNav(), 5000, 'button-nav-fallback');

    // Listen for inventory updates from content script - refresh panel if open (debounced)
    let inventoryRefreshTimeout = null;
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin) return;
      if (event.data?.type === 'heatsync-inventory-update' && panelOpen) {
        // Debounce: only refresh once per 2 seconds
        if (inventoryRefreshTimeout) return;
        inventoryRefreshTimeout = cleanup.setTimeout(() => {
          inventoryRefreshTimeout = null;
        }, 2000);
        log(' 📦 Inventory updated, refreshing panel');
        loadInventoryEmotes();
      }
    }, { signal: btnSignal });

    // Live picker updates from background: channel emotes arrive progressively
    // (BTTV/FFZ/7TV/Twitch coalesced at 40ms), inventory updates broadcast on
    // every emote add/remove/sub. Listen directly — content script's isolated
    // world has chrome.runtime access, no postMessage bridge needed.
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((msg) => {
        if (!msg?.type) return
        // preserveScroll prevents background-driven re-renders from teleporting
        // a mid-scroll user back to the top of the grid.
        const opts = { preserveScroll: true }
        if (msg.type === 'channel_emotes_update' && Array.isArray(msg.emotes)) {
          const owner = (msg.channelOwner || '').toLowerCase()
          if (currentChannel && owner && owner !== currentChannel) return
          channelEmotesCache = msg.emotes
          usingCachedData.channel = false
          isLoading.channel = false
          loadErrors.channel = null
          if (currentChannel && channelEmotesCache.length > 0) setCachedEmotes(`channel:${currentChannel}`, channelEmotesCache)
          updateTabCounts()
          if (panelOpen && currentTab === 'channel') renderEmoteGrid(opts)
        } else if (msg.type === 'global_emotes_update' && Array.isArray(msg.emotes)) {
          globalEmotesCache = msg.emotes
          usingCachedData.global = false
          isLoading.global = false
          loadErrors.global = null
          if (globalEmotesCache.length > 0) setCachedEmotes('global', globalEmotesCache)
          updateTabCounts()
          if (panelOpen && currentTab === 'global') renderEmoteGrid(opts)
        } else if (msg.type === 'inventory_update' && Array.isArray(msg.emotes)) {
          inventoryEmotesCache = msg.emotes
          rebuildInventoryIndex()
          usingCachedData.mine = false
          isLoading.mine = false
          loadErrors.mine = null
          if (inventoryEmotesCache.length > 0) setCachedEmotes('inventory', inventoryEmotesCache)
          updateTabCounts()
          if (panelOpen && currentTab === 'mine') renderEmoteGrid(opts)
        } else if (msg.type === 'blocked_update' && Array.isArray(msg.blocked)) {
          _blockedHashSet = new Set(msg.blocked)
          if (panelOpen) renderEmoteGrid(opts)
        }
      })
    }

    log(' 🔥 Button module initialized');
  }

  // Start when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { signal: btnSignal });
  } else {
    init();
  }
  }) // end waitForHS
})();
