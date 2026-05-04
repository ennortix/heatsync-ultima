// Background script - Fetch emote inventory and manage WebSocket

// Chrome compatibility - Firefox uses 'browser', Chrome uses 'chrome'
const browser = globalThis.browser || chrome;

// Debug logging - set to false for production
const DEBUG = false;
const log = DEBUG ? console.log.bind(console, '[heatsync]') : () => {};

log('🔥 BACKGROUND SCRIPT LOADING...');

// Keepalive alarm — prevent Chrome from killing the service worker.
// Chrome minimum alarm period is 0.5 minutes (30s), which resets the inactivity timer.
// IMPORTANT: alarms.create() resets the period each call, so calling it on every SW
// wake makes long-period alarms (refresh-global-emotes 1440min) effectively never fire.
// Only create if not already registered.
async function ensureAlarm(name, opts) {
  try {
    const existing = await browser.alarms?.get?.(name)
    if (!existing) browser.alarms?.create?.(name, opts)
  } catch { browser.alarms?.create?.(name, opts) }
}
ensureAlarm('keepalive', { periodInMinutes: 0.5 });
ensureAlarm('refresh-global-emotes', { periodInMinutes: 1440 });
ensureAlarm('refresh-emote-inventory', { periodInMinutes: 1 });
ensureAlarm('prune-expired-mutes', { periodInMinutes: 1 });
ensureAlarm('live-poll', { periodInMinutes: 1 });
browser.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    // Just existing is enough to keep the worker alive
  } else if (alarm.name === 'refresh-global-emotes') {
    fetchGlobalEmotes().catch(() => {})
  } else if (alarm.name === 'refresh-emote-inventory') {
    if (typeof fetchEmoteInventory === 'function') {
      try { const p = fetchEmoteInventory(); if (p?.catch) p.catch(() => {}) } catch (e) {}
    }
  } else if (alarm.name === 'prune-expired-mutes') {
    if (typeof pruneExpiredMutes === 'function') {
      try { pruneExpiredMutes() } catch (e) {}
    }
  } else if (alarm.name === 'live-poll') {
    if (typeof pollFollowedLive === 'function') {
      try { pollFollowedLive().catch(() => {}) } catch {}
    }
  }
});

// Link preview via heatsync.org server proxy (avoids CORS)
const LINK_PREVIEW_API = 'https://heatsync.org/api/link-preview'

// Show welcome page on first install, clear stale intervals on update
browser.runtime.onInstalled.addListener((details) => {
  log(' 📦 onInstalled - extension installed/updated', details.reason);
  // Clear any stale intervals from previous version
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals.clear();
  // Clear channel emote cache (in-memory + storage) so stale data doesn't block refetches
  channelEmotesMap = {};
  channelEmotesFetchedAt = {};
  browser.storage.local.remove('channel_emotes_map').catch(() => {})
  browser.storage.local.remove('channel_emotes_fetched_at').catch(() => {})
  if (details.reason === 'update') {
    browser.tabs.query({ url: ['*://*.twitch.tv/*', '*://*.kick.com/*', '*://*.youtube.com/*'] }).then(tabs => {
      for (const tab of tabs) {
        browser.scripting?.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => {})
      }
    }).catch(() => {})
  }
  if (details.reason === 'install') {
    browser.tabs.create({
      url: browser.runtime.getURL('welcome.html')
    });
  }
});

// One-time migration: ensure clean state
browser.storage.local.get('migrated_to_prod_v2').then(async (data) => {
  if (!data.migrated_to_prod_v2) {
    await browser.storage.local.set({ migrated_to_prod_v2: true });
    log(' Migration v2 complete');
  }
}).catch(err => log(' Migration check failed:', err?.message));

// Migrate old single channel_emotes to per-channel map
browser.storage.local.get(['channel_emotes', 'channel_emotes_owner']).then(async (data) => {
  if (data.channel_emotes && data.channel_emotes_owner) {
    const map = { [data.channel_emotes_owner]: data.channel_emotes };
    await browser.storage.local.set({ channel_emotes_map: map });
    await browser.storage.local.remove(['channel_emotes', 'channel_emotes_owner']);
    log(' Migrated channel_emotes to per-channel map');
  }
}).catch(err => log(' Channel emotes migration failed:', err?.message));

let emoteInventory = [];
let globalEmotes = []; // BTTV, FFZ, 7TV global emotes
let channelEmotesMap = {}; // Per-channel emotes: { channelName: emotes[] }
let channelEmotesFetchedAt = {}; // channelName → timestamp of last successful fetch

function getStorableChannelEmotes() {
  const map = {}
  for (const [ch, data] of Object.entries(channelEmotesMap)) {
    if (data !== 'loading') map[ch] = data
  }
  return map
}
const CHANNEL_EMOTES_TTL = 30 * 60 * 1000 // 30 minutes
const CHANNEL_EMOTES_EMPTY_TTL = 5 * 60 * 1000 // 5 minutes for zero-result channels
const tabChannels = new Map() // tabId → { channel, channelOwner }
// Channels joined via ws_send from content scripts (e.g. multichat extras).
// tabChannels only tracks the primary tab channel — multichat adds many more.
// On WS reconnect (incl. server restart) these must be re-joined or messages drop silently.
const joinedExtraChannels = new Set() // "platform/channel" keys

// Get the most recently set channel owner from any tab
function getActiveChannelOwner() {
  let latest = null
  for (const entry of tabChannels.values()) {
    if (entry.channelOwner) latest = entry.channelOwner
  }
  return latest
}

// Get the channel string for a specific tab
function getTabChannel(tabId) {
  return tabChannels.get(tabId)?.channel || null
}

// Persist tabChannels to session storage (survives worker restarts, not browser restarts)
function saveTabChannels() {
  const data = Object.fromEntries(tabChannels)
  browser.storage.session?.set({ tab_channels: data }).catch(() => {})
}

function saveJoinedExtraChannels() {
  // Local (not session) — extension reload clears session storage, which
  // would orphan kick channel subscriptions on every "reload extension"
  // click and never resubscribe until the user manually edits a channel.
  // Local survives reloads, only cleared by explicit unjoin or storage wipe.
  browser.storage.local.set({ joined_extra_channels: [...joinedExtraChannels] }).catch(() => {})
}

// Clean up tab tracking on close
browser.tabs.onRemoved.addListener((tabId) => {
  tabChannels.delete(tabId)
  saveTabChannels()
  _cachedTabs = null // Invalidate tab cache
})

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  _cachedTabs = null // Invalidate tab cache on navigation/load
  if (tabChannels.has(tabId) && changeInfo.url && !/twitch\.tv|kick\.com|youtube\.com/.test(changeInfo.url)) {
    tabChannels.delete(tabId)
    saveTabChannels()
  }
})
let current7TVEmoteSetId = null; // Track current 7TV emote set ID for EventAPI
let seventvEmoteSetIds = new Map(); // channelName → 7TV emote set ID
let blockedEmotes = new Set();
let localBlockedEmotes = new Set(); // Local blocks for anonymous users
let mutedUsers = new Map(); // username -> expiresAt (null = permanent)
let blockedUsers = new Set();

// Third-party cosmetics (BTTV/FFZ badges, 7TV paints+badges)
let bttvBadgeMap = new Map()    // twitchUserId → { description, url }
let ffzBadgeMap = new Map()     // twitchUserId → [{ title, color, url }]
let chatterinoBadgeMap = new Map()  // twitchUserId → { tooltip, url }
const userCosmeticsCache = new Map() // twitchUserId → { paint, badge, fetchedAt }
let badgesFetchedAt = 0 // persisted to storage in fetchBulkBadges, restored in initialize()
const BADGES_TTL = 24 * 60 * 60 * 1000
const USER_COSMETICS_TTL = 30 * 60 * 1000
// Shorter TTL for negative results (no paint+badge) so newly-added cosmetics
// pick up within 5 min instead of being masked for 30.
const COSMETICS_NEGATIVE_TTL = 5 * 60 * 1000
const USER_COSMETICS_MAX = 500
let followedUsers = []; // Users the current user follows
let currentUsername = null; // Logged-in user's username
let socket = null;
let lastBroadcastWasEmpty = false // Track to prevent spamming 0-emote broadcasts
// Tracks the last user-initiated block/unblock per hash so late-arriving WS
// echoes can't reverse a recent toggle. Server broadcasts our own actions back
// to us; if HTTP completes faster than the WS echo, the WS handler sees stale
// state and "re-blocks" what we just unblocked (or vice versa). 5s window is
// enough for any realistic broadcast delay.
const recentBlockToggle = new Map(); // hash -> { state: 'blocked'|'unblocked', at: ms }
const BLOCK_TOGGLE_GRACE_MS = 5000;
function markBlockToggle(hash, state) {
  if (!hash) return;
  recentBlockToggle.set(hash, { state, at: Date.now() });
  if (recentBlockToggle.size > 200) {
    const cutoff = Date.now() - BLOCK_TOGGLE_GRACE_MS;
    for (const [h, e] of recentBlockToggle) if (e.at < cutoff) recentBlockToggle.delete(h);
  }
}
function recentBlockToggleState(hash) {
  const e = recentBlockToggle.get(hash);
  if (!e) return null;
  if (Date.now() - e.at > BLOCK_TOGGLE_GRACE_MS) {
    recentBlockToggle.delete(hash);
    return null;
  }
  return e.state;
}
let lastInventoryFetch = 0 // Timestamp of last successful inventory fetch
let inventoryRefreshTimer = null // Debounce WS-triggered inventory refreshes
let inventoryFetchPromise = null // In-flight guard for fetchEmoteInventory
let pendingUserInfoToPersist = null // Buffered for batched init write
let globalEmotesFetchPromise = null // In-flight guard for fetchGlobalEmotes

function scheduleInventoryRefresh() {
  if (inventoryRefreshTimer) clearTimeout(inventoryRefreshTimer)
  inventoryRefreshTimer = setTimeout(() => {
    inventoryRefreshTimer = null
    fetchEmoteInventory()
  }, 2000)
}
let unreadNotifCount = 0; // Unread notification count for extension badge
let cachedFollowHistory = null; // Cache follow:history for late-loading content scripts
const wsStreamEventDedup = new Map(); // Dedup stream events across stream:* and follow:stream:*
let cachedFollowColors = null; // Cache follow:colors for late-loading content scripts
let activeYoutubeVideoId = null; // Currently subscribed YouTube videoId (for WS reconnect)
const ytVideoToChannel = new Map(); // videoId → channelId (for per-channel YouTube routing)
const youtubeChannelUrls = {} // channelId → url (in-memory source of truth, persisted to storage)
// Pending subscriptions whose URL doesn't carry a videoId (e.g. https://youtube.com/@user/live).
// We can't pre-populate ytVideoToChannel for these, so we track them here. When the WS server
// echoes back a youtube:status connected event without a channelId field, we attribute the
// videoId to the most-recent pending entry — without this fallback the status broadcasts as
// channelId='global' and every chat message that follows gets dropped by the receiving tab.
const pendingYtSubscribes = []  // [{ channelId, url, ts }] LIFO, capped, ts for staleness
const ytChannelHandleCache = new Map() // videoId → channel handle (oEmbed lookup, session-scoped)
async function getYtChannelHandle(videoId) {
  if (!videoId) return null
  if (ytChannelHandleCache.has(videoId)) return ytChannelHandleCache.get(videoId)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`
    const r = await fetch(oembedUrl, { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return null
    const data = await r.json()
    let handle = null
    if (data.author_url) {
      const m = data.author_url.match(/\/@([^/?]+)/)
      if (m) handle = m[1]
    }
    if (!handle && data.author_name) handle = data.author_name.replace(/\s+/g, '')
    if (handle) {
      ytChannelHandleCache.set(videoId, handle)
      // LRU cap — long sessions watching many YT channels would otherwise grow unbounded.
      if (ytChannelHandleCache.size > 100) {
        ytChannelHandleCache.delete(ytChannelHandleCache.keys().next().value)
      }
    }
    return handle
  } catch (e) { return null }
}
const MAX_YT_VIDEO_ENTRIES = 100; // LRU cap — evict oldest when full
let _ytVideoMapPersistTimer = null
function persistYtVideoMap() {
  // Debounce burst writes (re-subscribe loops fire many sets in <50ms)
  if (_ytVideoMapPersistTimer) return
  _ytVideoMapPersistTimer = setTimeout(() => {
    _ytVideoMapPersistTimer = null
    browser.storage.local.set({ yt_video_to_channel: Object.fromEntries(ytVideoToChannel) }).catch(() => {})
  }, 500)
}
function setYtVideoChannel(videoId, channelId) {
  ytVideoToChannel.delete(videoId) // Re-insert for LRU ordering
  ytVideoToChannel.set(videoId, channelId)
  if (ytVideoToChannel.size > MAX_YT_VIDEO_ENTRIES) {
    const oldest = ytVideoToChannel.keys().next().value
    ytVideoToChannel.delete(oldest)
  }
  persistYtVideoMap()
}
function deleteYtVideoChannel(videoId) {
  if (ytVideoToChannel.delete(videoId)) persistYtVideoMap()
}

let authToken = null; // Will be set by content script or loaded from storage
let initPromise = null; // Track init completion for message handlers
let authFailedBlock = false; // Prevent reconnect loop after authentication_failed

// Auto-detect login/logout via httpOnly cookie changes
browser.cookies.onChanged.addListener((changeInfo) => {
  try {
    const c = changeInfo.cookie
    if (c.name !== 'auth' || !c.domain.includes('heatsync.org')) return

    // changeInfo.removed fires both for actual deletion AND for overwrite
    // (when the server sets a new auth cookie that replaces the old one).
    // Only treat as logout for true deletion — overwrite is followed by a
    // 'set' event that re-establishes auth.
    if (changeInfo.removed && changeInfo.cause !== 'overwrite') {
      log(' Auth cookie removed — logging out')
      unsubscribeFromPush(authToken).catch(err => log(' unsubscribeFromPush failed:', err?.message))
      authToken = null
      emoteInventory = []
      blockedEmotes = new Set()
      followedUsers = []
      browser.storage.local.remove(['emote_inventory', 'blocked_emotes', 'auth_token_encrypted', 'auth_token', 'user_info']).catch(err => log(' storage remove failed:', err?.message))
      broadcastToTabs({ type: 'auth_changed', loggedIn: false })
    } else {
      log(' Auth cookie set — logging in')
      authToken = c.value
      authFailedBlock = false
      storeToken(c.value).catch(err => log(' storeToken failed:', err?.message))
      fetchEmoteInventory().catch(err => log(' fetchEmoteInventory failed:', err?.message))
      fetchBlockedEmotes().catch(err => log(' fetchBlockedEmotes failed:', err?.message))
      fetchFollowedUsers().catch(err => log(' fetchFollowedUsers failed:', err?.message))
      fetchUserInfo().catch(err => log(' fetchUserInfo failed:', err?.message))
      connectWebSocket().catch(err => log(' connectWebSocket failed:', err?.message))
      subscribeToPush(c.value).catch(err => log(' subscribeToPush failed:', err?.message))
      broadcastToTabs({ type: 'auth_changed', loggedIn: true })
    }
  } catch (err) {
    log(' cookies.onChanged error:', err?.message)
  }
})
const API_URL = 'https://heatsync.org'; // Production
const WS_URL = 'wss://heatsync.org'; // Production WebSocket

// Normalize relative emote URLs to absolute (API returns /uploads/... paths)
function absUrl(url) {
  if (!url) return url
  return url.startsWith('/') ? API_URL + url : url
}

// Track intervals for cleanup (memory leak prevention)
const activeIntervals = new Set();
function trackInterval(id) {
  activeIntervals.add(id);
  return id;
}
function untrackInterval(id) {
  clearInterval(id);
  activeIntervals.delete(id);
}

// Fetch with 10s timeout to prevent hung requests
function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => ctrl.abort())
  }
  // Default credentials: 'omit' for third-party APIs (no cookie leakage to 7TV/FFZ/BTTV/etc).
  // heatsync.org calls override with credentials: 'include' explicitly.
  const isHeatsync = typeof url === 'string' && /^https?:\/\/(www\.)?heatsync\.org/.test(url)
  const credentials = opts.credentials ?? (isHeatsync ? 'include' : 'omit')
  return fetch(url, { ...opts, credentials, signal: ctrl.signal }).finally(() => clearTimeout(timer))
}

// ============================================
// TOKEN ENCRYPTION (SubtleCrypto)
// ============================================
// Encrypts auth tokens at rest using a random per-user salt
// Salt is generated on first use and persisted in local storage

async function getOrCreateEncryptionSalt() {
  const stored = await browser.storage.local.get('encryption_salt')
  if (stored.encryption_salt) {
    // hex → Uint8Array
    const hex = stored.encryption_salt
    const arr = new Uint8Array(hex.length / 2)
    for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    return arr
  }
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('')
  await browser.storage.local.set({ encryption_salt: hex })
  return salt
}

async function getEncryptionKey(salt) {
  const extensionId = browser.runtime.id || 'heatsync-default'
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(extensionId + '-heatsync-token-key'),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptToken(token) {
  if (!token) return null
  try {
    const salt = await getOrCreateEncryptionSalt()
    const key = await getEncryptionKey(salt)
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoder = new TextEncoder()
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(token)
    )
    // Store as base64: iv + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encrypted), iv.length)
    return btoa(String.fromCharCode(...combined))
  } catch (err) {
    log(' Encryption failed:', err.message)
    return null
  }
}

async function decryptToken(encryptedBase64) {
  if (!encryptedBase64) return null
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const encrypted = combined.slice(12)

  // Try with random per-user salt first
  try {
    const salt = await getOrCreateEncryptionSalt()
    const key = await getEncryptionKey(salt)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)
    return new TextDecoder().decode(decrypted)
  } catch {
    // Migration: token may have been encrypted with old hardcoded salt — try it
    try {
      const encoder = new TextEncoder()
      const oldKey = await getEncryptionKey(encoder.encode('heatsync-salt'))
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, oldKey, encrypted)
      const token = new TextDecoder().decode(decrypted)
      log(' Migrating token from static salt to random salt')
      // Re-encrypt with new random salt (getOrCreateEncryptionSalt already wrote it above)
      const newEncrypted = await encryptToken(token)
      if (newEncrypted) await browser.storage.local.set({ auth_token_encrypted: newEncrypted })
      return token
    } catch (err) {
      log(' Decryption failed:', err.message)
      return null
    }
  }
}

// Secure token storage helpers
async function storeToken(token) {
  const encrypted = await encryptToken(token);
  if (encrypted) {
    await browser.storage.local.set({ auth_token_encrypted: encrypted });
    // Remove old unencrypted token if exists
    await browser.storage.local.remove('auth_token');
  }
}

async function retrieveToken() {
  const data = await browser.storage.local.get(['auth_token_encrypted', 'auth_token']);
  // Try encrypted first
  if (data.auth_token_encrypted) {
    const token = await decryptToken(data.auth_token_encrypted);
    if (token) return token;
  }
  // Fallback to unencrypted (migration) and re-encrypt
  if (data.auth_token) {
    log(' Migrating unencrypted token to encrypted storage');
    await storeToken(data.auth_token);
    return data.auth_token;
  }
  return null;
}

// Map of hash -> real emote URL (populated when emotes are loaded)
const emoteUrlMap = new Map();

// Intercept requests to Twitch CDN with our FFZ-style IDs and redirect to real URLs
// Format: __FFZ__999999::HASH__FFZ__ (numeric set ID for Twitch validation)
// NOTE: This only works in Firefox (MV2). Chrome MV3 doesn't support blocking webRequest.
try {
  if (browser.webRequest?.onBeforeRequest) {
    browser.webRequest.onBeforeRequest.addListener(
      (details) => {
        const url = details.url;
        const match = url.match(/__FFZ__999999::([a-f0-9]+)__FFZ__/);
        if (!match) return;

        const hash = match[1];
        const realUrl = emoteUrlMap.get(hash);
        log(' 🎯 webRequest intercepted:', hash.substring(0, 12), '-> found:', !!realUrl);

        if (realUrl) {
          return { redirectUrl: realUrl };
        }
        return {};
      },
      { urls: ['*://static-cdn.jtvnw.net/emoticons/v2/__FFZ__999999*'] },
      ['blocking']
    );
    log(' 🔄 WebRequest interceptor installed (Firefox)');
  }
} catch (e) {
  // Chrome MV3 doesn't support blocking webRequest - that's OK
  log('[heatsync] webRequest not available (Chrome MV3) - using direct URLs');
}

// Update the emote URL map (capped at 10K entries to prevent memory growth)
const MAX_EMOTE_URL_ENTRIES = 10000
function updateEmoteUrlMap() {
  emoteUrlMap.clear();
  // Inventory + globals first (always kept)
  for (const emote of emoteInventory) {
    if (emote.hash && emote.url) emoteUrlMap.set(emote.hash, emote.url)
  }
  for (const emote of globalEmotes) {
    if (emote.hash && emote.url) emoteUrlMap.set(emote.hash, emote.url)
  }
  // Channel emotes fill remaining capacity
  for (const emotes of Object.values(channelEmotesMap)) {
    if (!Array.isArray(emotes)) continue
    for (const emote of emotes) {
      if (emoteUrlMap.size >= MAX_EMOTE_URL_ENTRIES) break
      if (emote.hash && emote.url) emoteUrlMap.set(emote.hash, emote.url)
    }
    if (emoteUrlMap.size >= MAX_EMOTE_URL_ENTRIES) break
  }
  log(' 📍 Updated emoteUrlMap:', emoteUrlMap.size, 'entries');
}

// Get auth token (read from memory, storage, or httpOnly cookie via cookies API)
async function getAuthCookie() {
  if (authToken) {
    log(' Using auth token from memory')
    return authToken
  }

  // Read fresh cookie FIRST. Encrypted storage was preferred before, but a
  // stale stored token (from a logout/re-login on heatsync.org while the SW
  // was suspended) would silently reauth with the dead value, the server
  // would reply authentication_failed, and authFailedBlock would pin us in
  // a no-reconnect state. The browser's cookie store is the source of truth.
  try {
    const cookie = await browser.cookies.get({ url: 'https://heatsync.org', name: 'auth' })
    if (cookie?.value) {
      log(' ✓ Read auth cookie via cookies API')
      authToken = cookie.value
      await storeToken(cookie.value)
      return cookie.value
    }
  } catch (err) {
    log(' cookies.get failed:', err.message)
  }

  // Fallback: encrypted storage (cookie may be unavailable — third-party
  // contexts, restricted profiles).
  try {
    const stored = await retrieveToken()
    if (stored) {
      log(' Read auth token from encrypted storage')
      authToken = stored
      return stored
    }
  } catch (err) {
    console.error('[HS] retrieveToken error:', err)
  }

  log(' No auth token available')
  return null
}

// Fetch user's emote inventory via HTTP
function fetchEmoteInventory() {
  // Skip if fetched within 10s (WS events already deliver fresh data)
  if (Date.now() - lastInventoryFetch < 10000) {
    log(' Inventory fetch skipped — last fetch was', Math.round((Date.now() - lastInventoryFetch) / 1000) + 's ago')
    return Promise.resolve()
  }
  if (inventoryFetchPromise) return inventoryFetchPromise
  inventoryFetchPromise = (async () => {
  try {
    const authToken = await getAuthCookie()
    if (!authToken) {
      log(' No auth token for inventory fetch');
      emoteInventory = [];
      // Only broadcast empty once to prevent spam (every 60s poll was flooding console)
      if (!lastBroadcastWasEmpty) {
        broadcastToTabs({ type: 'inventory_update', emotes: emoteInventory });
        lastBroadcastWasEmpty = true;
      }
      return;
    }

    log(' Fetching user inventory from API');
    const response = await fetchWithTimeout(`${API_URL}/api/user/emotes`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      response.body?.cancel()
      emoteInventory = [];
      // Only broadcast empty once
      if (!lastBroadcastWasEmpty) {
        broadcastToTabs({ type: 'inventory_update', emotes: emoteInventory });
        lastBroadcastWasEmpty = true;
      }
      return;
    }

    const data = await response.json();
    log(' API response:', data);
    log(' 🔍 API emotes array length:', data.emotes ? data.emotes.length : 'undefined');
    log(' 🔍 First emote from API:', data.emotes ? data.emotes[0] : 'none');

    // Transform the API response to match extension format
    // Backend returns 'custom_name', extension expects 'name'
    const inventoryEmotes = (data.emotes || []).map(emote => ({
      name: emote.custom_name,  // Map custom_name to name
      url: absUrl(emote.url),
      hash: emote.hash,
      width: emote.width,
      height: emote.height,
      slot: emote.slot_number,
      usage_count: emote.usage_count
    }));
    log(' 🔍 Transformed inventory length:', inventoryEmotes.length);
    log(' 🔍 First transformed emote:', inventoryEmotes[0]);

    // Transform subscription emotes
    const subEmotes = (data.subscriptionEmotes || []).map(emote => ({
      name: emote.custom_name,
      url: absUrl(emote.url),
      hash: emote.hash,
      width: emote.width || 28,
      height: emote.height || 28,
      tier: emote.tier,
      broadcaster: emote.broadcaster_name
    }));

    // Combine inventory + subscription emotes
    emoteInventory = sanitizeEmoteList([...inventoryEmotes, ...subEmotes]);
    updateEmoteUrlMap();

    log(' Loaded', inventoryEmotes.length, 'inventory emotes');
    log(' Loaded', subEmotes.length, 'subscription emotes');
    if (emoteInventory.length > 0) {
      log(' Sample emotes:', emoteInventory.slice(0, 3).map(e => e.name));
    }
    lastBroadcastWasEmpty = false // Reset - we have real emotes now
    lastInventoryFetch = Date.now()
    broadcastToTabs({ type: 'inventory_update', emotes: emoteInventory })
  } catch (error) {
    console.error('[heatsync] fetchEmoteInventory failed:', error.message || error)
    emoteInventory = [];
    // Only broadcast empty once
    if (!lastBroadcastWasEmpty) {
      broadcastToTabs({ type: 'inventory_update', emotes: emoteInventory });
      lastBroadcastWasEmpty = true;
    }
  } finally {
    inventoryFetchPromise = null
  }
  })()
  return inventoryFetchPromise
}

// Fetch blocked emotes
async function fetchBlockedEmotes() {
  try {
    const authToken = await getAuthCookie();
    if (!authToken) {
      // Not logged in - load local blocks only
      await loadLocalBlockedEmotes();
      return;
    }

    const response = await fetchWithTimeout(`${API_URL}/api/user/emotes/blocked`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) { response.body?.cancel(); return; }

    const data = await response.json();
    // Server returns blocked_emotes array with hash property
    blockedEmotes = new Set((data.blocked_emotes || []).map(b => b.hash));

    // Also load local blocks and merge them
    await loadLocalBlockedEmotes();
    const allBlocked = new Set([...blockedEmotes, ...localBlockedEmotes]);

    broadcastToTabs({ type: 'blocked_update', blocked: Array.from(allBlocked) });
  } catch (error) {
    console.error('[heatsync] fetchBlockedEmotes failed:', error.message || error)
  }
}

// Load local blocked emotes from storage (for anonymous users)
async function loadLocalBlockedEmotes() {
  try {
    const stored = await browser.storage.local.get('local_blocked_emotes');
    if (stored.local_blocked_emotes && Array.isArray(stored.local_blocked_emotes)) {
      localBlockedEmotes = new Set(stored.local_blocked_emotes);
      log(' Loaded', localBlockedEmotes.size, 'local blocked emotes');
    }
  } catch (error) {
    log(' Failed to load local blocked emotes:', error.message);
  }
}

// Save local blocked emotes to storage
async function saveLocalBlockedEmotes() {
  try {
    await browser.storage.local.set({
      local_blocked_emotes: Array.from(localBlockedEmotes)
    });
    log(' Saved', localBlockedEmotes.size, 'local blocked emotes');
  } catch (error) {
    log(' Failed to save local blocked emotes:', error.message);
  }
}

// Fetch followed users
async function fetchFollowedUsers() {
  try {
    const authToken = await getAuthCookie();
    if (!authToken) {
      followedUsers = [];
      return;
    }

    const response = await fetchWithTimeout(`${API_URL}/api/user/following`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      response.body?.cancel()
      followedUsers = [];
      return;
    }

    const data = await response.json();
    followedUsers = (data.following || []).map(f => f.username);
    log(' Followed users loaded:', followedUsers.length);
    broadcastToTabs({ type: 'followed_users_updated', users: followedUsers });
    // Refresh live status immediately so the badge populates without waiting
    // for the next 1-min alarm tick.
    if (typeof pollFollowedLive === 'function') pollFollowedLive().catch(() => {})
  } catch (error) {
    console.error('[heatsync] fetchFollowedUsers failed:', error.message || error)
    followedUsers = [];
  }
}

// =============================================================================
// LIVE-FOLLOWED CREATOR TRACKING — cross-platform live status awareness.
// Polls every minute, fires desktop notifications on off→on transitions, drives
// the extension badge count. Works for Twitch + Kick simultaneously (and YouTube
// once profiles track yt_is_live). No competitor offers cross-platform live
// notifications — Twitch app is Twitch only, Kick app is Kick only.
// =============================================================================
const LIVE_STATE_KEY = 'hs_live_status_state'
const LIVE_NOTIFY_THROTTLE_MS = 30 * 60 * 1000 // 30 min between notifications for same creator
const LIVE_FETCH_TIMEOUT_MS = 8000
const LIVE_FETCH_CONCURRENCY = 5
let _liveFollowedCount = 0
let _liveStatusInitialized = false
let _liveStatusState = { lastSeenLive: {}, lastNotifiedAt: {} }
const _liveNotificationUrls = new Map() // notification id → url for click handler
let _livePollInflight = false

async function loadLiveStatusState() {
  try {
    const data = await browser.storage.local.get(LIVE_STATE_KEY)
    if (data?.[LIVE_STATE_KEY]) {
      _liveStatusState = {
        lastSeenLive: data[LIVE_STATE_KEY].lastSeenLive || {},
        lastNotifiedAt: data[LIVE_STATE_KEY].lastNotifiedAt || {},
      }
      _liveStatusInitialized = !!data[LIVE_STATE_KEY].initialized
    }
  } catch {}
}

async function saveLiveStatusState() {
  _liveStatusInitialized = true
  try {
    await browser.storage.local.set({
      [LIVE_STATE_KEY]: { ..._liveStatusState, initialized: true }
    })
  } catch {}
}

// Cached snapshot of currently-live followed streams (for badge tooltip + popup
// + future "next channel" suggestion). Refreshed on every poll cycle.
let _liveFollowedSnapshot = [] // [{username, platform, viewers, displayName, profileImageUrl, key, profile}]

async function pollFollowedLive() {
  if (_livePollInflight) return
  _livePollInflight = true
  try {
    const authToken = await getAuthCookie()
    if (!authToken) {
      _liveFollowedCount = 0
      _liveFollowedSnapshot = []
      recomputeBadge()
      updateLiveBadgeTooltip()
      return
    }

    if (!_liveStatusInitialized) await loadLiveStatusState()
    const wasFirstPoll = !_liveStatusInitialized

    // ONE call to /api/live/following replaces the per-user /api/profile loop.
    // Server returns one row per (user, platform) live combination so a creator
    // streaming on twitch+kick simultaneously appears twice — that's correct,
    // we want both rows for accurate platform-aware notifications.
    let streams = []
    try {
      const resp = await fetchWithTimeout(
        `${API_URL}/api/live/following`,
        { headers: { 'Authorization': `Bearer ${authToken}` } },
        LIVE_FETCH_TIMEOUT_MS
      )
      if (resp.ok) {
        const body = await resp.json()
        streams = body?.streams || body?.data?.streams || []
      } else {
        resp.body?.cancel()
      }
    } catch (e) {
      console.warn('[heatsync] /api/live/following failed:', e?.message)
      return
    }

    const transitions = [] // { username, platform, stream }
    const seen = new Set()
    const snapshot = []

    for (const s of streams) {
      const username = String(s?.username || '').toLowerCase()
      const platform = String(s?.platform || '').toLowerCase()
      if (!username || !platform) continue
      const key = `${platform}:${username}`
      seen.add(key)
      const wasLive = !!_liveStatusState.lastSeenLive?.[key]
      _liveStatusState.lastSeenLive[key] = true

      const viewers = Number(s.viewerCount || s.viewer_count || 0) || 0
      snapshot.push({
        username,
        platform,
        viewers,
        displayName: s.heatsyncDisplayName || s.displayName || s.display_name || username,
        profileImageUrl: s.profileImageUrl || s.profile_image_url || '',
        key,
        stream: s,
      })

      // Off→on transition: fire notification (skipping cold-start)
      if (!wasFirstPoll && !wasLive) {
        const lastNotif = _liveStatusState.lastNotifiedAt?.[key] || 0
        if (Date.now() - lastNotif > LIVE_NOTIFY_THROTTLE_MS) {
          transitions.push({ username, platform, stream: s })
          _liveStatusState.lastNotifiedAt[key] = Date.now()
        }
      }
    }

    // Anything in lastSeenLive but not in current snapshot: stream ended.
    // Mark not-live in state but don't fire anything (not a transition we notify on).
    for (const k of Object.keys(_liveStatusState.lastSeenLive)) {
      if (!seen.has(k)) {
        _liveStatusState.lastSeenLive[k] = false
      }
    }
    // Prune lastNotifiedAt entries older than throttle window so memory doesn't grow
    const cutoff = Date.now() - LIVE_NOTIFY_THROTTLE_MS
    for (const k of Object.keys(_liveStatusState.lastNotifiedAt)) {
      if ((_liveStatusState.lastNotifiedAt[k] || 0) < cutoff) {
        delete _liveStatusState.lastNotifiedAt[k]
      }
    }

    await saveLiveStatusState()

    // Dedupe live count by username (a creator on twitch+kick = 1 person live)
    const uniqueLiveUsers = new Set(snapshot.map(s => s.username))
    _liveFollowedCount = uniqueLiveUsers.size
    _liveFollowedSnapshot = snapshot.sort((a, b) => b.viewers - a.viewers)

    recomputeBadge()
    updateLiveBadgeTooltip()
    broadcastToTabs({ type: 'live_followed_updated', snapshot: _liveFollowedSnapshot })

    for (const t of transitions) fireLiveNotificationFromStream(t.stream, t.username, t.platform)
  } catch (e) {
    console.warn('[heatsync] pollFollowedLive failed:', e?.message || e)
  } finally {
    _livePollInflight = false
  }
}

// Set browser action title (icon hover tooltip) — top live followed names.
function updateLiveBadgeTooltip() {
  if (!badgeApi) return
  const live = _liveFollowedSnapshot || []
  if (live.length === 0) {
    badgeApi.setTitle?.({ title: 'heatsync' })?.catch?.(() => {})
    return
  }
  const top = live.slice(0, 5).map(s => s.displayName || s.username).join(', ')
  const more = live.length > 5 ? ` +${live.length - 5} more` : ''
  const title = `heatsync · ${live.length} live: ${top}${more}`
  try { badgeApi.setTitle({ title }) } catch {}
}

function fireLiveNotificationFromStream(stream, username, platform) {
  if (!browser.notifications?.create) return
  const display = stream.heatsyncDisplayName || stream.displayName || stream.display_name || username
  const viewers = Number(stream.viewerCount || stream.viewer_count || 0) || 0
  const platName = platform === 'twitch' ? 'Twitch' : platform === 'kick' ? 'Kick' : platform === 'youtube' ? 'YouTube' : platform
  const slug = (platform === 'twitch'
    ? (stream.twitch_username || username)
    : platform === 'kick'
      ? (stream.kick_username || username)
      : (stream.youtube_username || stream.youtube_channel_id || username))
  const url = platform === 'twitch'
    ? `https://www.twitch.tv/${slug}`
    : platform === 'kick'
      ? `https://kick.com/${slug}`
      : platform === 'youtube'
        ? `https://www.youtube.com/${slug?.startsWith('UC') ? 'channel/' + slug : '@' + slug}`
        : null
  if (!url) return

  const viewerStr = viewers > 0 ? ` · ${viewers.toLocaleString()} viewers` : ''
  const id = `hs-live-${platform}-${username}-${Date.now()}`
  _liveNotificationUrls.set(id, url)
  if (_liveNotificationUrls.size > 50) {
    const oldest = _liveNotificationUrls.keys().next().value
    _liveNotificationUrls.delete(oldest)
  }
  try {
    browser.notifications.create(id, {
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: `${display} is live`,
      message: `${platName}${viewerStr}`,
      contextMessage: 'heatsync',
      priority: 1,
    })
  } catch (e) {
    console.warn('[heatsync] fireLiveNotification failed:', e?.message)
  }
}

if (browser.notifications?.onClicked) {
  browser.notifications.onClicked.addListener((id) => {
    const url = _liveNotificationUrls.get(id)
    if (url) {
      browser.tabs.create({ url }).catch(() => {})
      _liveNotificationUrls.delete(id)
      try { browser.notifications.clear(id) } catch {}
    }
  })
}

// Fetch user profile info for popup display
async function fetchUserInfo() {
  try {
    const authToken = await getAuthCookie()
    if (!authToken) {
      browser.storage.local.remove('user_info')
      return
    }

    const response = await fetchWithTimeout(`${API_URL}/api/auth/me`, {
      credentials: 'include',
      headers: { 'Authorization': `Bearer ${authToken}` }
    })

    if (!response.ok) {
      response.body?.cancel()
      browser.storage.local.remove('user_info')
      return
    }

    const user = await response.json()
    if (!user) {
      browser.storage.local.remove('user_info')
      return
    }

    const userInfo = {
      display_name: user.display_name || user.twitch_username || user.kick_username || '',
      username: user.username || user.twitch_username || '',
      twitch_username: user.twitch_username || '',
      kick_username: user.kick_username || '',
      youtube_username: user.youtube_username || '',
      youtube_channel_id: user.youtube_channel_id || '',
      avatar_url: user.twitch_profile_pic || user.kick_profile_pic || user.profile_image_url || '',
      heat: user.heat || 0,
      color: user.color || ''
    }
    pendingUserInfoToPersist = userInfo
    currentUsername = userInfo.username
    log(' User info loaded:', userInfo.display_name)
  } catch (error) {
    console.error('[heatsync] fetchUserInfo failed:', error.message || error)
  }
}

// Validate emote objects from third-party APIs to bound string sizes and URL patterns
const EMOTE_CDN_PATTERN = /^https:\/\/(cdn\.(betterttv\.net|7tv\.app|frankerfacez\.com)|static-cdn\.jtvnw\.net|heatsync\.org|files\.kick\.com)\//
const MAX_EMOTE_NAME_LEN = 100
const MAX_EMOTES_PER_SOURCE = 5000
function sanitizeEmote(e) {
  if (!e || typeof e.name !== 'string' || typeof e.url !== 'string') return null
  if (e.name.length > MAX_EMOTE_NAME_LEN || e.name.length === 0) return null
  if (!EMOTE_CDN_PATTERN.test(e.url)) return null
  return e
}
function sanitizeEmoteList(emotes) {
  return emotes.slice(0, MAX_EMOTES_PER_SOURCE).map(sanitizeEmote).filter(Boolean)
}

// Fetch BTTV channel emotes
async function fetchBTTVChannelEmotes(channelName, channelId = null) {
  try {
    // BTTV API requires numeric Twitch user ID, not username
    let twitchId = channelId
    if (!twitchId) {
      twitchId = await lookupTwitchUserId(channelName)
      if (!twitchId) {
        log(' BTTV: Could not resolve Twitch ID for', channelName)
        return null // transient: ID lookup failed, retry next time
      }
    }
    const userResponse = await fetchWithTimeout(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`);
    if (userResponse.status === 404) { userResponse.body?.cancel(); return [] } // genuine: user has no BTTV
    if (!userResponse.ok) { userResponse.body?.cancel(); return null } // transient: 5xx etc.

    const userData = await userResponse.json();
    const emotes = [...(userData.channelEmotes || []), ...(userData.sharedEmotes || [])];

    return sanitizeEmoteList(emotes.map(e => ({
      name: e.code,
      url: `https://cdn.betterttv.net/emote/${e.id}/1x.webp`,
      source: 'bttv',
      hash: e.id
    })));
  } catch (error) {
    log(' BTTV channel emotes error for:', channelName, error?.message);
    return null // transient: network/timeout
  }
}

// Fetch FFZ channel emotes
async function fetchFFZChannelEmotes(channelName) {
  try {
    const response = await fetchWithTimeout(`https://api.frankerfacez.com/v1/room/${channelName}`);
    if (response.status === 404) { response.body?.cancel(); return [] } // genuine: channel has no FFZ
    if (!response.ok) { response.body?.cancel(); return null } // transient: 5xx etc.

    const data = await response.json();
    const emotes = [];

    for (const setId in data.sets) {
      const set = data.sets[setId];
      for (const emote of (set.emoticons || [])) {
        const rawUrl = emote.urls['1'] || emote.urls['2'] || emote.urls['4']
        emotes.push({
          name: emote.name,
          url: rawUrl.startsWith('https:') ? rawUrl : `https:${rawUrl}`,
          source: 'ffz',
          hash: `ffz-${emote.id}`
        });
      }
    }
    return sanitizeEmoteList(emotes);
  } catch (error) {
    log(' FFZ channel emotes error for:', channelName, error?.message);
    return null // transient
  }
}

// Cache Twitch user IDs to avoid repeated decapi lookups (especially for polling)
const twitchIdCache = new Map();
const TWITCH_ID_CACHE_MAX = 200;
const kickChannelIdCache = new Map();

// Lookup Twitch user ID from username — try Twitch GQL first (fast, no rate limit), decapi fallback
async function lookupTwitchUserId(username) {
  const cached = twitchIdCache.get(username);
  if (cached) { twitchIdCache.delete(username); twitchIdCache.set(username, cached); return cached; }
  try {
    // Twitch GQL — same client ID used by the website, no auth needed
    const gqlResp = await fetchWithTimeout('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: { 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ user(login: "${username.replace(/[^a-z0-9_]/gi, '')}") { id } }` })
    });
    if (gqlResp.ok) {
      const gqlData = await gqlResp.json();
      const id = gqlData?.data?.user?.id;
      if (id) {
        if (twitchIdCache.size >= TWITCH_ID_CACHE_MAX) {
          twitchIdCache.delete(twitchIdCache.keys().next().value);
        }
        twitchIdCache.set(username, id);
        log('[hs-bg] GQL lookup', username, '→', id)
        return id;
      }
    }
  } catch (e) {
    log(' GQL user lookup failed, trying decapi:', e.message);
  }
  // Fallback to decapi.me
  try {
    const response = await fetchWithTimeout(`https://decapi.me/twitch/id/${encodeURIComponent(username)}`, {}, 2000);
    if (!response.ok) { response.body?.cancel(); return null; }
    const text = await response.text();
    if (/^\d+$/.test(text.trim())) {
      const id = text.trim();
      if (twitchIdCache.size >= TWITCH_ID_CACHE_MAX) {
        twitchIdCache.delete(twitchIdCache.keys().next().value);
      }
      twitchIdCache.set(username, id);
      return id;
    }
    return null;
  } catch (e) {
    log(' Failed to lookup Twitch user ID:', e);
    return null;
  }
}

// Fetch 7TV channel emotes
// Supports Twitch (user ID or username) and Kick (username) lookups
async function fetch7TVChannelEmotes(channelName, channelId = null, platform = 'twitch') {
  try {
    let response, data, identifier;

    if (platform === 'kick') {
      // Kick: 7TV requires numeric user ID, not slug — resolve via GQL search
      log(' 7TV: Fetching Kick channel emotes for:', channelName);
      let kickId = channelId // may already be numeric from content script
      if (!kickId) {
        try {
          const gqlResp = await fetchWithTimeout('https://7tv.io/v3/gql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: `query { users(query: "${channelName.replace(/[^a-z0-9_]/gi, '')}") { connections { platform id username } } }`
            })
          })
          if (gqlResp.ok) {
            const gqlData = await gqlResp.json()
            const users = gqlData?.data?.users || []
            for (const u of users) {
              const conn = u.connections?.find(c => c.platform === 'KICK' && c.username?.toLowerCase() === channelName.toLowerCase())
              if (conn) { kickId = conn.id; break }
            }
          }
        } catch (e) { log(' 7TV: GQL Kick lookup failed:', e.message) }
      }
      if (!kickId) {
        log(' 7TV: Could not resolve Kick user ID for', channelName);
        return null // transient: ID lookup failed
      }
      identifier = kickId;
      response = await fetchWithTimeout(`https://7tv.io/v3/users/kick/${kickId}`);
      if (response.status === 404) { response.body?.cancel(); return [] } // genuine: user has no 7TV
      if (!response.ok) {
        response.body?.cancel()
        log(' 7TV: Kick lookup failed (' + response.status + ')');
        return null // transient: 5xx etc.
      }
      data = await response.json();
      log(' ✅ 7TV: Kick lookup succeeded (id:', kickId + ')');
    } else {
      // Twitch: use channelId if available, otherwise lookup via decapi.me
      identifier = channelId;
      if (!identifier) {
        log(' 7TV: No channelId provided, looking up via decapi.me...');
        identifier = await lookupTwitchUserId(channelName);
        if (identifier) {
          log(' 7TV: Got user ID from decapi:', identifier);
        }
      }

      // Final fallback to username (rarely works but try anyway)
      if (!identifier) {
        identifier = channelName;
      }

      log(' 7TV: Fetching with identifier:', identifier, '(channelId:', channelId, ')');

      // Try Twitch ID lookup first — large channels (kripp, xqc) can be slow,
      // give 7TV 15s before timing out.
      const sevenTvUrl = `https://7tv.io/v3/users/twitch/${identifier}`;
      response = await fetchWithTimeout(sevenTvUrl, {}, 15000);
      if (DEBUG) broadcastToTabs({ type: 'debug_log', msg: `7TV fetch ${channelName}: ${sevenTvUrl} → ${response.status}` })

      if (!response.ok) {
        const firstStatus = response.status
        response.body?.cancel()
        log(' 7TV: Twitch ID lookup failed (' + firstStatus + '), trying username fallback...');

        // Fallback to username-based lookup
        response = await fetchWithTimeout(`https://7tv.io/v3/users/${channelName}`, {}, 15000);
        if (response.status === 404) {
          response.body?.cancel()
          // Both Twitch ID and username 404 = user genuinely has no 7TV account
          if (firstStatus === 404) return []
          return null // mixed: first was 5xx, second was 404 — treat as transient
        }
        if (!response.ok) {
          response.body?.cancel()
          log(' 7TV: Username lookup also failed (' + response.status + ')');
          return null // transient: 5xx etc.
        }

        data = await response.json();
        log(' ✅ 7TV: Username fallback succeeded!');
      } else {
        data = await response.json();
        log(' ✅ 7TV: Twitch ID lookup succeeded');
      }
    }

    const emoteSet = data.emote_set;
    if (!emoteSet) {
      log(' 7TV: No emote set found for', identifier);
      return [] // genuine: user has no emote set
    }

    const emoteList = emoteSet.emotes || [];
    log(' 7TV: Found', emoteList.length, 'emotes for', identifier, '(set ID:', emoteSet.id + ')');

    const emotes = sanitizeEmoteList(emoteList.map(e => ({
      name: e.name,
      url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
      source: '7tv',
      hash: e.id,
      flags: e.flags || e.data?.flags || 0,
      zeroWidth: !!((e.flags & 257) || (e.data?.flags & 257))
    })));
    const cosmeticIds = extract7TVCosmeticIds(data)
    // Resolve cosmetics async — dont block emote return
    if (cosmeticIds && channelId) {
      resolve7TVCosmeticIds(cosmeticIds).then(cosmetic => {
        if (cosmetic) setUserCosmetic(String(channelId), cosmetic)
      }).catch(() => {})
    }
    return { emotes, setId: emoteSet.id }
  } catch (error) {
    // Aborts (timeouts) are expected for slow channels; demote to log so the
    // console isn't spammed with red errors during normal operation.
    const isAbort = error?.name === 'AbortError' || /aborted/i.test(error?.message || '')
    if (isAbort) {
      log(' 7TV: timeout for', channelName, '(will retry on next fetch)')
    } else {
      console.error('[hs-bg] 7TV FETCH ERROR for', channelName, ':', error?.message || error);
    }
    if (DEBUG) broadcastToTabs({ type: 'debug_log', msg: `7TV ERROR ${channelName}: ${error?.message || error}` })
    return null // transient: network/timeout
  }
}

// Cache of resolved 7TV cosmetic objects by ID (paint_id/badge_id → full object)
const cosmeticObjectCache = new Map()

function extract7TVCosmeticIds(data) {
  const style = data?.user?.style || data?.style
  if (!style) return null
  // Old API returned full objects; new API returns IDs only
  if (style.paint || style.badge) return { paint: style.paint || null, badge: style.badge || null }
  const paintId = style.paint_id || null
  const badgeId = style.badge_id || null
  if (!paintId && !badgeId) return null
  return { paintId, badgeId }
}

async function resolve7TVCosmeticIds(ids) {
  if (!ids) return null
  // Already resolved (old API format)
  if (ids.paint !== undefined && ids.badge !== undefined && !ids.paintId) return ids

  const toFetch = []
  const result = { paint: null, badge: null }

  // Check cache first
  if (ids.paintId) {
    const cached = cosmeticObjectCache.get(ids.paintId)
    if (cached) {
      // Move to end for LRU ordering
      cosmeticObjectCache.delete(ids.paintId)
      cosmeticObjectCache.set(ids.paintId, cached)
      result.paint = cached
    } else { toFetch.push(ids.paintId) }
  }
  if (ids.badgeId) {
    const cached = cosmeticObjectCache.get(ids.badgeId)
    if (cached) {
      // Move to end for LRU ordering
      cosmeticObjectCache.delete(ids.badgeId)
      cosmeticObjectCache.set(ids.badgeId, cached)
      result.badge = cached
    } else { toFetch.push(ids.badgeId) }
  }
  if (toFetch.length === 0) return result

  try {
    const query = `query($list:[ObjectID!]){cosmetics(list:$list){paints{id name function color stops{at color}angle shape image_url repeat shadows{x_offset y_offset radius color}}badges{id name tooltip tag host{url files{name format width height}}}}}`
    const resp = await fetchWithTimeout('https://7tv.io/v3/gql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { list: toFetch } })
    })
    if (!resp.ok) return result
    const data = await resp.json()
    const paints = data?.data?.cosmetics?.paints || []
    const badges = data?.data?.cosmetics?.badges || []
    for (const p of paints) { cosmeticObjectCache.set(p.id, p); if (p.id === ids.paintId) result.paint = p }
    for (const b of badges) { cosmeticObjectCache.set(b.id, b); if (b.id === ids.badgeId) result.badge = b }
    // Cap cache
    if (cosmeticObjectCache.size > 200) {
      let count = 0
      for (const key of cosmeticObjectCache.keys()) {
        if (count++ >= 50) break
        cosmeticObjectCache.delete(key)
      }
    }
  } catch (e) {
    log(' resolve7TVCosmeticIds failed:', e?.message)
  }
  return result
}

let cosmeticsSaveTimer = null
let cosmeticsLastFlushAt = 0
const COSMETICS_STORAGE_MAX = USER_COSMETICS_MAX // match in-memory cap so eviction doesn't lose data
const COSMETICS_FORCE_FLUSH_INTERVAL = 30000 // when at-cap, flush at most every 30s

function flushCosmeticsToStorage() {
  cosmeticsLastFlushAt = Date.now()
  const entries = [...userCosmeticsCache.entries()]
    .filter(([, v]) => Date.now() - v.fetchedAt < USER_COSMETICS_TTL)
    .slice(-COSMETICS_STORAGE_MAX)
  browser.storage.local.set({
    // Persist twitchId so Kick→Twitch ID linkage survives SW restart;
    // otherwise BTTV/FFZ badge lookup falls back to no-op until the 30min
    // TTL forces a refetch from 7TV.
    user_cosmetics_cache: entries.map(([k, v]) => [k, { paint: v.paint, badge: v.badge, twitchId: v.twitchId, fetchedAt: v.fetchedAt }])
  }).catch(() => {})
}

function debounceSaveCosmetics() {
  if (cosmeticsSaveTimer) clearTimeout(cosmeticsSaveTimer)
  cosmeticsSaveTimer = setTimeout(() => {
    cosmeticsSaveTimer = null
    flushCosmeticsToStorage()
  }, 5000)
}

function setUserCosmetic(twitchId, cosmetic) {
  if (userCosmeticsCache.size >= USER_COSMETICS_MAX) {
    userCosmeticsCache.delete(userCosmeticsCache.keys().next().value)
    // At-cap path: flush immediately (rate-limited) so eviction can't lose data
    // before the 5s debounce fires.
    if (Date.now() - cosmeticsLastFlushAt > COSMETICS_FORCE_FLUSH_INTERVAL) {
      if (cosmeticsSaveTimer) { clearTimeout(cosmeticsSaveTimer); cosmeticsSaveTimer = null }
      userCosmeticsCache.set(twitchId, { ...(cosmetic || { paint: null, badge: null }), fetchedAt: Date.now() })
      flushCosmeticsToStorage()
      return
    }
  }
  userCosmeticsCache.set(twitchId, { ...(cosmetic || { paint: null, badge: null }), fetchedAt: Date.now() })
  debounceSaveCosmetics()
}

async function fetchBulkBadges() {
  const mapsPopulated = ffzBadgeMap.size > 0 || bttvBadgeMap.size > 0 || chatterinoBadgeMap.size > 0
  if (mapsPopulated && Date.now() - badgesFetchedAt < BADGES_TTL) return
  badgesFetchedAt = Date.now()
  try {
    const [bttvResp, ffzResp, chatterinoResp] = await Promise.allSettled([
      fetchWithTimeout('https://api.betterttv.net/3/cached/badges'),
      fetchWithTimeout('https://api.frankerfacez.com/v1/badges/ids'),
      fetchWithTimeout('https://api.chatterino.com/badges')
    ])
    if (bttvResp.status === 'fulfilled' && bttvResp.value.ok) {
      const data = await bttvResp.value.json()
      bttvBadgeMap.clear()
      for (const entry of data) {
        let url = entry.badge?.svg || entry.badge?.png
        if (url && !url.startsWith('https://')) url = url.startsWith('//') ? 'https:' + url : null
        if (entry.providerId && url) {
          bttvBadgeMap.set(entry.providerId, { description: entry.badge.description || 'BTTV', url })
        }
      }
      log(' BTTV badges loaded:', bttvBadgeMap.size)
    }
    if (ffzResp.status === 'fulfilled' && ffzResp.value.ok) {
      const data = await ffzResp.value.json()
      ffzBadgeMap.clear()
      const badgeById = {}
      for (const b of (data.badges || [])) badgeById[b.id] = b
      const users = data.users || {}
      for (const [badgeId, userIds] of Object.entries(users)) {
        const badge = badgeById[badgeId]
        if (!badge) continue
        const url = badge.urls?.['2'] || badge.urls?.['1'] || badge.urls?.['4']
        if (!url) continue
        const normalizedUrl = url.startsWith('//') ? 'https:' + url : url
        if (!/^https:\/\//.test(normalizedUrl)) continue
        const normalized = { title: badge.title || 'FFZ', color: badge.color || null, url: normalizedUrl }
        for (const uid of userIds) {
          const uidStr = String(uid)
          if (!ffzBadgeMap.has(uidStr)) ffzBadgeMap.set(uidStr, [])
          ffzBadgeMap.get(uidStr).push(normalized)
        }
      }
      log(' FFZ badges loaded:', ffzBadgeMap.size, 'users')
    }
    if (chatterinoResp.status === 'fulfilled' && chatterinoResp.value.ok) {
      const data = await chatterinoResp.value.json()
      chatterinoBadgeMap.clear()
      for (const badge of (data.badges || [])) {
        const url = badge.image2 || badge.image1
        if (!url || !badge.users || !/^https:\/\//.test(url)) continue
        for (const uid of badge.users) {
          chatterinoBadgeMap.set(String(uid), { tooltip: badge.tooltip || 'Chatterino', url })
        }
      }
      log(' Chatterino badges loaded:', chatterinoBadgeMap.size, 'users')
    }
    broadcastBadgeMaps()
    // Persist badge maps + timestamp so they survive MV3 service worker restarts
    const bttvObj = {}
    for (const [k, v] of bttvBadgeMap) bttvObj[k] = v
    const ffzObj = {}
    for (const [k, v] of ffzBadgeMap) ffzObj[k] = v
    const chatterinoObj = {}
    for (const [k, v] of chatterinoBadgeMap) chatterinoObj[k] = v
    browser.storage.local.set({
      badges_fetched_at: badgesFetchedAt,
      bttv_badge_map: bttvObj,
      ffz_badge_map: ffzObj,
      chatterino_badge_map: chatterinoObj
    }).catch(() => {})
  } catch (e) {
    log(' fetchBulkBadges failed:', e.message)
    badgesFetchedAt = 0
  }
}

function broadcastBadgeMaps() {
  const bttvObj = {}
  for (const [k, v] of bttvBadgeMap) bttvObj[k] = v
  const ffzObj = {}
  for (const [k, v] of ffzBadgeMap) ffzObj[k] = v
  const chatterinoObj = {}
  for (const [k, v] of chatterinoBadgeMap) chatterinoObj[k] = v
  broadcastToTabs({ type: 'cosmetics_update', bttvBadges: bttvObj, ffzBadges: ffzObj, chatterinoBadges: chatterinoObj })
}

// Fetch channel owner's emotes (public API) + third-party channel emotes
async function fetchChannelOwnerEmotes(channelName, channelId = null, platform = 'twitch') {
  // Skip if already fetched, or currently loading (sentinel prevents race)
  const cached = channelEmotesMap[channelName]
  if (cached === 'loading') {
    log(' Channel emotes currently loading for', channelName, '- skipping')
    return
  }
  if (Array.isArray(cached)) {
    const age = Date.now() - (channelEmotesFetchedAt[channelName] || 0)
    const ttl = cached.length > 0 ? CHANNEL_EMOTES_TTL : CHANNEL_EMOTES_EMPTY_TTL
    // Always broadcast cached data immediately — content script needs emotes NOW
    broadcastToTabs({ type: 'channel_emotes_update', emotes: cached, channelOwner: channelName });
    if (age < ttl) {
      log(' Channel emotes already fetched for', channelName, '- skipping (', cached.length, 'emotes,', Math.round(age / 1000) + 's old)')
      return
    }
    log(' Channel emotes stale for', channelName, '(', Math.round(age / 1000) + 's) - refetching in background')
  }
  channelEmotesMap[channelName] = 'loading';

  try {
    log(' 📺 Fetching channel emotes for:', channelName, 'id:', channelId, 'platform:', platform);

    // Show loading indicator
    broadcastToTabs({ type: 'loading_status', text: 'loading channel emotes...' });

    // Fetch heatsync emotes + resolve Twitch ID in PARALLEL (both needed before third-party fetch)
    const [heatsyncResult, resolvedChannelId] = await Promise.all([
      fetchWithTimeout(`${API_URL}/api/emotes/user/${encodeURIComponent(channelName)}`).catch(() => null),
      (platform !== 'kick' && !channelId) ? lookupTwitchUserId(channelName) : Promise.resolve(channelId)
    ]);
    let heatsyncEmotes = [];
    if (heatsyncResult?.status === 429) {
      console.warn('[heatsync] fetchChannelOwnerEmotes: rate limited (429) for', channelName, '- skipping, will retry on next channel join')
      heatsyncResult.body?.cancel()
      // Clear sentinel so retry is possible on next join, but don't store empty result
      delete channelEmotesMap[channelName]
      broadcastToTabs({ type: 'loading_status', done: true })
      return
    } else if (heatsyncResult?.ok) {
      const data = await heatsyncResult.json();
      heatsyncEmotes = (data.emotes || []).map(e => ({
        name: e.name,
        url: absUrl(e.url),
        hash: e.hash || e.name,
        provider: e.provider || 'upload'
      }));
    }
    channelId = resolvedChannelId;

    // Fetch third-party emotes in PARALLEL — broadcast progressively as each provider
    // returns so the user sees BTTV/FFZ instantly while 7TV resolves (avoids "no emotes
    // until everything's done"). Keep slots fixed so priority order is stable.
    broadcastToTabs({ type: 'loading_status', text: 'fetching third-party emotes...' });
    const slots = { bttv: [], ffz: [], sevenTV: [], twitch: [] }
    const failed = { bttv: false, ffz: false, sevenTV: false, twitch: false }
    let sevenTVResult = null
    let coalesceTimer = null
    const broadcastCurrent = () => {
      clearTimeout(coalesceTimer)
      coalesceTimer = setTimeout(() => {
        coalesceTimer = null
        const partial = [...heatsyncEmotes, ...slots.bttv, ...slots.ffz, ...slots.sevenTV, ...slots.twitch]
        broadcastToTabs({ type: 'channel_emotes_update', emotes: partial, channelOwner: channelName })
      }, 40)
    }

    const tasks = []
    if (platform !== 'kick') {
      tasks.push(fetchBTTVChannelEmotes(channelName, channelId).then(e => { if (e === null) failed.bttv = true; slots.bttv = e || []; broadcastCurrent() }).catch(() => { failed.bttv = true }))
      tasks.push(fetchFFZChannelEmotes(channelName).then(e => { if (e === null) failed.ffz = true; slots.ffz = e || []; broadcastCurrent() }).catch(() => { failed.ffz = true }))
      tasks.push(fetchTwitchChannelEmotes(channelName).then(e => { if (e === null) failed.twitch = true; slots.twitch = e || []; broadcastCurrent() }).catch(() => { failed.twitch = true }))
    }
    tasks.push(fetch7TVChannelEmotes(channelName, channelId, platform).then(r => {
      if (r === null) { failed.sevenTV = true; slots.sevenTV = []; broadcastCurrent(); return }
      sevenTVResult = r
      slots.sevenTV = r?.emotes || (Array.isArray(r) ? r : []) || []
      broadcastCurrent()
    }).catch(() => { failed.sevenTV = true }))

    await Promise.all(tasks);
    // Final consolidated broadcast (force-flush any pending coalesce)
    if (coalesceTimer) { clearTimeout(coalesceTimer); coalesceTimer = null }
    const sevenTVEmotes = slots.sevenTV
    const sevenTVSetId = sevenTVResult?.setId || null
    const bttvEmotes = slots.bttv
    const ffzEmotes = slots.ffz
    const twitchChannelEmotes = slots.twitch
    if (DEBUG) broadcastToTabs({ type: 'debug_log', msg: `${channelName} BTTV:${bttvEmotes.length} FFZ:${ffzEmotes.length} 7TV:${sevenTVEmotes.length} Twitch:${twitchChannelEmotes.length} HS:${heatsyncEmotes.length}` })

    // Store emotes for this specific channel (prune old entries to bound memory)
    const emotes = [...heatsyncEmotes, ...bttvEmotes, ...ffzEmotes, ...sevenTVEmotes, ...twitchChannelEmotes];
    const anyFailed = failed.bttv || failed.ffz || failed.sevenTV || failed.twitch
    channelEmotesMap[channelName] = emotes;
    // If any provider had a transient failure, backdate fetchedAt so the next
    // channel join refetches within ~60s (regardless of empty/non-empty TTL).
    channelEmotesFetchedAt[channelName] = anyFailed ? (Date.now() - CHANNEL_EMOTES_TTL + 60000) : Date.now();
    if (anyFailed) log(' ⚠️ Channel emotes fetched with failures', failed, '— will retry in ~60s')
    const channelKeys = Object.keys(channelEmotesMap).filter(k => channelEmotesMap[k] !== 'loading');
    if (channelKeys.length > 20) {
      for (const old of channelKeys.slice(0, channelKeys.length - 20)) {
        if (old !== channelName) { delete channelEmotesMap[old]; delete channelEmotesFetchedAt[old]; seventvEmoteSetIds.delete(old); seventvPolledChannels.delete(old); }
      }
    }
    updateEmoteUrlMap();

    // Update channelOwner in all tab entries that match this channel
    let ownerUpdated = false
    for (const [tabId, entry] of tabChannels) {
      if (entry.channel?.endsWith('/' + channelName)) {
        entry.channelOwner = channelName
        ownerUpdated = true
      }
    }
    if (ownerUpdated) saveTabChannels()
    log(' ✅ Channel emotes loaded for', channelName + ':', emotes.length,
      `(heatsync: ${heatsyncEmotes.length}, bttv: ${bttvEmotes.length}, ffz: ${ffzEmotes.length}, 7tv: ${sevenTVEmotes.length})`);

    // Hide loading indicator
    broadcastToTabs({ type: 'loading_status', done: true });

    // Broadcast to content scripts (include channel owner name for filtering)
    broadcastToTabs({ type: 'channel_emotes_update', emotes, channelOwner: channelName });

    // Save per-channel map to storage for persistence (filter out 'loading' sentinels)
    await browser.storage.local.set({ channel_emotes_map: getStorableChannelEmotes(), channel_emotes_fetched_at: channelEmotesFetchedAt });

    // Store 7TV set ID per channel and subscribe on shared EventAPI connection
    if (sevenTVSetId) {
      seventvEmoteSetIds.set(channelName, sevenTVSetId)
      current7TVEmoteSetId = sevenTVSetId
      subscribe7TVEmoteSet(sevenTVSetId)
      start7TVPolling()
      // Persist so all channels survive service worker restart
      browser.storage.local.set({ seventv_emote_set_ids: Object.fromEntries(seventvEmoteSetIds) }).catch(() => {})
    }
  } catch (error) {
    log(' ❌ Channel emotes fetch failed:', error.message || error);
    broadcastToTabs({ type: 'loading_status', done: true });
    // Clear sentinel so retry works on next join_channel
    delete channelEmotesMap[channelName];
    seventvEmoteSetIds.delete(channelName);
  }
}

// Fetch BTTV global emotes
async function fetchBTTVEmotes() {
  try {
    const response = await fetchWithTimeout('https://api.betterttv.net/3/cached/emotes/global');
    if (!response.ok) { response.body?.cancel(); return []; }

    const emotes = await response.json();
    return sanitizeEmoteList(emotes.map(e => ({
      name: e.code,
      url: `https://cdn.betterttv.net/emote/${e.id}/1x.webp`,
      source: 'bttv',
      hash: e.id
    })));
  } catch (error) {
    return [];
  }
}

// Fetch FFZ global emotes
async function fetchFFZEmotes() {
  try {
    const response = await fetchWithTimeout('https://api.frankerfacez.com/v1/set/global');
    if (!response.ok) { response.body?.cancel(); return []; }

    const data = await response.json();
    const emotes = [];

    for (const set of Object.values(data?.sets || {})) {
      if (data.default_sets.includes(set.id)) {
        for (const emote of (set.emoticons || [])) {
          const rawUrl = emote.urls['1'] || emote.urls['2'] || emote.urls['4']
          emotes.push({
            name: emote.name,
            url: rawUrl.startsWith('https:') ? rawUrl : `https:${rawUrl}`,
            source: 'ffz',
            hash: `ffz-${emote.id}`
          });
        }
      }
    }

    return sanitizeEmoteList(emotes);
  } catch (error) {
    return [];
  }
}

// Fetch 7TV global emotes
async function fetch7TVEmotes() {
  try {
    const response = await fetchWithTimeout('https://7tv.io/v3/emote-sets/global');
    if (!response.ok) { response.body?.cancel(); return []; }

    const data = await response.json();
    return sanitizeEmoteList((data?.emotes || []).map(e => ({
      name: e.name,
      url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
      source: '7tv',
      hash: e.id,
      flags: e.flags || e.data?.flags || 0,
      zeroWidth: !!((e.flags & 257) || (e.data?.flags & 257))
    })));
  } catch (error) {
    return [];
  }
}

// Fetch Twitch native global emotes (Kappa, PogChamp, etc.)
async function fetchTwitchGlobalEmotes() {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/emotes/twitch/global`);
    if (!response.ok) {
      response.body?.cancel()
      log('⚠️ Twitch global emotes failed:', response.status);
      return [];
    }

    const data = await response.json();
    const emotes = (data?.emotes || []).map(e => ({
      name: e.name,
      url: e.url,
      url_2x: e.url_2x,
      url_4x: e.url_4x,
      source: 'twitch',
      hash: e.id
    }));

    const validated = sanitizeEmoteList(emotes)
    log('✅ Loaded', validated.length, 'Twitch global emotes from server');
    return validated;
  } catch (error) {
    log('❌ Twitch global emotes error:', error);
    return [];
  }
}

// Fetch Twitch channel emotes (subscriber, follower, bits tier)
async function fetchTwitchChannelEmotes(channelName) {
  try {
    const response = await fetchWithTimeout(`${API_URL}/api/emotes/twitch/channel/${channelName}`);
    if (response.status === 404) { response.body?.cancel(); return [] } // genuine: channel has no twitch emotes
    if (!response.ok) {
      response.body?.cancel()
      log(' Twitch channel emotes failed for', channelName, ':', response.status);
      return null // transient: 5xx etc.
    }

    const data = await response.json();
    log(' Loaded', data.count, 'Twitch channel emotes for', channelName);

    return sanitizeEmoteList((data?.emotes || []).map(e => ({
      name: e.name,
      url: e.url,
      source: 'twitch',
      hash: e.id,
      url_2x: e.url_2x,
      url_4x: e.url_4x,
      tier: e.tier,
      emote_type: e.emote_type
    })));
  } catch (error) {
    log(' Twitch channel emotes error for', channelName, ':', error?.message);
    return null // transient
  }
}

function fetchGlobalEmotes() {
  if (globalEmotesFetchPromise) return globalEmotesFetchPromise
  globalEmotesFetchPromise = (async () => {
  try {
    log(' Fetching global emotes from', `${API_URL}/api/emotes`);
    // Try server API first (has all providers cached)
    const response = await fetchWithTimeout(`${API_URL}/api/emotes`);
    log(' Global emotes response:', response.status, response.ok);
    if (response.ok) {
      const data = await response.json();
      globalEmotes = sanitizeEmoteList((data?.emotes || []).map(e => ({
        name: e.name,
        url: e.url,
        source: e.provider,
        hash: e.hash,
        zeroWidth: !!e.zeroWidth
      })));
      updateEmoteUrlMap();
      log(' Loaded', globalEmotes.length, 'global emotes from server');
      log(' Sample global emotes:', globalEmotes.slice(0, 5).map(e => e.name));

      // ALWAYS fetch Twitch + 7TV global emotes separately (server cache may be stale)
      log('📥 Fetching Twitch + 7TV globals separately...');
      const [twitchGlobals, seventvGlobals] = await Promise.all([
        fetchTwitchGlobalEmotes(),
        fetch7TVEmotes()
      ]);

      // Rebuild merged array (prevents duplicate accumulation on reconnects)
      // 7TV globals override server emotes (server cache lacks zeroWidth flags)
      const seen = new Set()
      const merged = []
      // 7TV first (has authoritative zeroWidth flags), then Twitch, then server emotes
      for (const e of seventvGlobals) { if (!seen.has(e.name)) { seen.add(e.name); merged.push(e) } }
      for (const e of twitchGlobals) { if (!seen.has(e.name)) { seen.add(e.name); merged.push(e) } }
      for (const e of globalEmotes) { if (!seen.has(e.name)) { seen.add(e.name); merged.push(e) } }
      globalEmotes = merged
      log('✅ Merged globals:', globalEmotes.length, '(twitch:', twitchGlobals.length, '7tv:', seventvGlobals.length, ')')

      updateEmoteUrlMap();
      log('📊 Total global emotes:', globalEmotes.length);

      broadcastToTabs({ type: 'global_emotes_update', emotes: globalEmotes });
      return;
    }
    log(' Server API failed, trying fallback');

    // Fallback: fetch directly from APIs
    const [bttv, ffz, sevenTV, twitchGlobal] = await Promise.all([
      fetchBTTVEmotes(),
      fetchFFZEmotes(),
      fetch7TVEmotes(),
      fetchTwitchGlobalEmotes()
    ]);

    globalEmotes = [...bttv, ...ffz, ...sevenTV, ...twitchGlobal];
    updateEmoteUrlMap();
    log(' Loaded', globalEmotes.length, 'global emotes (fallback)');
    broadcastToTabs({ type: 'global_emotes_update', emotes: globalEmotes });
  } catch (error) {
    console.error('[heatsync] fetchGlobalEmotes failed:', error.message || error)
  } finally {
    globalEmotesFetchPromise = null
  }
  })()
  return globalEmotesFetchPromise
}

// ========== 7TV EventAPI WebSocket for Real-Time Emote Updates ==========
// Single shared connection, multiple subscriptions (one per channel's emote set).
// 7TV allows up to 500 subs per connection.
let seventvWebSocket = null;
let seventvReconnectAttempts = 0;
let seventvReconnectTimer = null;
let seventvLastData = 0
let seventvZombieTimer = null
let seventvSubscribedSets = new Set(); // Track which set IDs we've subscribed to
let seventvPendingSubs = new Set(); // Queued while connection is opening
const SEVENTV_MAX_RECONNECT_ATTEMPTS = 5;

function ensure7TVConnection() {
  if (seventvWebSocket && seventvWebSocket.readyState !== WebSocket.CLOSED) {
    return; // Already connected, connecting, or closing
  }

  clearTimeout(seventvReconnectTimer);
  seventvReconnectTimer = null;
  seventvSubscribedSets.clear();
  // Drop any stale handler refs from a prior socket before creating a new one
  if (seventvWebSocket) {
    try {
      seventvWebSocket.onopen = null
      seventvWebSocket.onmessage = null
      seventvWebSocket.onerror = null
      seventvWebSocket.onclose = null
    } catch {}
    seventvWebSocket = null
  }
  if (seventvZombieTimer) { untrackInterval(seventvZombieTimer); seventvZombieTimer = null }

  log(' 7TV EventAPI: Connecting...');

  try {
    seventvWebSocket = new WebSocket('wss://events.7tv.io/v3');

    seventvWebSocket.onopen = () => {
      log(' 7TV EventAPI: Connected');
      seventvReconnectAttempts = 0;
      seventvLastData = Date.now()
      // Zombie detection: force close if no data for 3 minutes
      if (seventvZombieTimer) { untrackInterval(seventvZombieTimer); seventvZombieTimer = null }
      seventvZombieTimer = trackInterval(setInterval(() => {
        if (seventvLastData && Date.now() - seventvLastData > 180000) {
          log(' 7TV EventAPI: Zombie detected, forcing reconnect')
          if (seventvWebSocket) { try { seventvWebSocket.close() } catch {} }
          if (seventvZombieTimer) { untrackInterval(seventvZombieTimer); seventvZombieTimer = null }
        }
      }, 60000))

      // Subscribe all pending emote sets
      for (const setId of seventvPendingSubs) {
        send7TVSubscribe(setId);
      }
      seventvPendingSubs.clear();
      // Re-subscribe all known user cosmetic subs on (re)connect
      seventvUserSubs.clear()
      for (const userId of pendingUserSubs) {
        send7TVUserSubscribe(userId)
      }
      pendingUserSubs.clear()
      for (const userId of seventvToTwitchId.keys()) {
        send7TVUserSubscribe(userId)
      }
    };

    seventvWebSocket.onmessage = (event) => {
      seventvLastData = Date.now()
      try {
        const message = JSON.parse(event.data);

        if (message.op === 0) {
          // Dispatch event
          const eventData = message.d;
          log(' 7TV EventAPI: Received event:', eventData.type);
          if (eventData.type === 'emote_set.update') {
            handle7TVEmoteSetUpdate(eventData.body);
          } else if (eventData.type === 'user.update' || eventData.type === 'user.create' ||
                     eventData.type === 'cosmetic.create' || eventData.type === 'entitlement.create' ||
                     eventData.type === 'entitlement.delete') {
            // User's cosmetics changed (badge/paint granted/revoked).
            // Bust the cache for that user so next lookup refetches fresh.
            handle7TVUserUpdate(eventData.body);
          }
        } else if (message.op === 1) {
          log(' 7TV EventAPI: Hello received, session:', message.d.session_id);
        } else if (message.op === 2) {
          // Server heartbeat — no response needed
        } else if (message.op === 5) {
          const subType = message.d?.data?.type;
          const subId = message.d?.data?.condition?.object_id;
          log(' 7TV EventAPI: Subscription acknowledged for', subId?.slice(0, 12));
        }
      } catch (err) {
        console.error('[heatsync] 7TV EventAPI: Parse error:', err);
      }
    };

    seventvWebSocket.onerror = () => {
      log(' 7TV EventAPI: WebSocket error (will reconnect)');
    };

    seventvWebSocket.onclose = (closeEvent) => {
      log(' 7TV EventAPI: Connection closed');
      const closing = closeEvent?.target;
      if (closing) {
        try { closing.onopen = null; closing.onmessage = null; closing.onerror = null; closing.onclose = null } catch {}
      }
      seventvWebSocket = null;
      seventvSubscribedSets.clear();
      seventvUserSubs.clear();
      if (seventvZombieTimer) { untrackInterval(seventvZombieTimer); seventvZombieTimer = null }

      if (seventvReconnectAttempts < SEVENTV_MAX_RECONNECT_ATTEMPTS && seventvEmoteSetIds.size > 0) {
        const jitter7tv = Math.random() * 1000;
        const delay = Math.min(1000 * Math.pow(2, seventvReconnectAttempts), 30000) + jitter7tv;
        seventvReconnectAttempts++;
        log(` 7TV EventAPI: Reconnecting in ${Math.round(delay)}ms (attempt ${seventvReconnectAttempts}/${SEVENTV_MAX_RECONNECT_ATTEMPTS})`);
        clearTimeout(seventvReconnectTimer);
        seventvReconnectTimer = setTimeout(() => {
          seventvReconnectTimer = null;
          // Re-subscribe all known sets on reconnect
          for (const setId of seventvEmoteSetIds.values()) {
            subscribe7TVEmoteSet(setId);
          }
        }, delay);
      } else if (seventvReconnectAttempts >= SEVENTV_MAX_RECONNECT_ATTEMPTS) {
        log(' 7TV EventAPI: Max reconnect attempts reached, giving up. Will retry in 10 minutes.');
        clearTimeout(seventvReconnectTimer);
        seventvReconnectAttempts = 0;
        seventvWebSocket = null;
        seventvReconnectTimer = setTimeout(() => {
          seventvReconnectTimer = null;
          ensure7TVConnection();
        }, 600000);
      }
    };
  } catch (err) {
    console.error('[heatsync] 7TV EventAPI: Connection failed:', err);
  }
}

function send7TVSubscribe(setId) {
  if (!seventvWebSocket || seventvWebSocket.readyState !== WebSocket.OPEN) return;
  if (seventvSubscribedSets.has(setId)) return;

  seventvWebSocket.send(JSON.stringify({
    op: 35,
    d: { type: 'emote_set.*', condition: { object_id: setId } }
  }));
  seventvSubscribedSets.add(setId);
  log(' 7TV EventAPI: Subscribed to', setId.slice(0, 12));
}

// Track per-user 7TV subscriptions so we get real-time badge/paint changes
// for users we care about (logged-in user, currently-watched broadcaster, etc).
const seventvUserSubs = new Set() // 7TV user IDs subscribed for cosmetics
const pendingUserSubs = new Set() // queued while WS is opening

function send7TVUserSubscribe(seventvUserId) {
  if (!seventvWebSocket || seventvWebSocket.readyState !== WebSocket.OPEN) {
    pendingUserSubs.add(seventvUserId)
    return
  }
  if (seventvUserSubs.has(seventvUserId)) return
  seventvWebSocket.send(JSON.stringify({
    op: 35,
    d: { type: 'user.*', condition: { object_id: seventvUserId } }
  }))
  seventvUserSubs.add(seventvUserId)
  log(' 7TV EventAPI: Subscribed to user', seventvUserId.slice(0, 12))
}

// Map: twitchId → 7tvUserId. Populated when a content script registers a twitch ID
// and we resolve it via the 7TV API. Used to bust cache on user.update events.
const twitchToSeventvId = new Map()
const seventvToTwitchId = new Map()

async function ensureSelfCosmeticSub(twitchId) {
  if (!twitchId) return
  // First time we see this twitch ID this session — force a fresh cosmetic
  // fetch (busts any stale negative cache from before they got their badge).
  if (!twitchToSeventvId.has(twitchId)) {
    userCosmeticsCache.delete(String(twitchId))
    broadcastToTabs({ type: 'cosmetics_invalidated', twitchId: String(twitchId) })
  } else {
    return // already subscribed
  }
  try {
    const resp = await fetchWithTimeout(`https://7tv.io/v3/users/twitch/${twitchId}`)
    if (!resp.ok) { resp.body?.cancel?.(); return }
    const data = await resp.json()
    const seventvId = data?.user?.id
    if (!seventvId) return
    twitchToSeventvId.set(String(twitchId), seventvId)
    seventvToTwitchId.set(seventvId, String(twitchId))
    ensure7TVConnection()
    send7TVUserSubscribe(seventvId)
  } catch {}
}

function handle7TVUserUpdate(body) {
  const seventvId = body?.id || body?.object?.id || body?.user?.id || body?.user_id
  if (!seventvId) return
  const twitchId = seventvToTwitchId.get(seventvId)
  if (!twitchId) return
  // Bust cosmetics cache so next get_user_cosmetics refetches fresh data
  userCosmeticsCache.delete(twitchId)
  log(' 7TV: User cosmetic update for twitchId', twitchId, '— cache busted')
  // Tell tabs to drop their local cosmetic cache for this user and reapply
  broadcastToTabs({ type: 'cosmetics_invalidated', twitchId })
}

function subscribe7TVEmoteSet(setId) {
  if (!setId) return;

  ensure7TVConnection()

  if (seventvWebSocket && seventvWebSocket.readyState === WebSocket.OPEN) {
    send7TVSubscribe(setId)
  } else {
    // Queue for when connection opens
    seventvPendingSubs.add(setId)
  }
}

function handle7TVEmoteSetUpdate(updateData) {
  // updateData.id is the emote set ID — look up which channel it belongs to
  const setId = updateData.id;
  let channelName = null;
  for (const [ch, id] of seventvEmoteSetIds) {
    if (id === setId) { channelName = ch; break; }
  }
  if (!channelName) {
    log(' 7TV: Received update for unknown set:', setId);
    return;
  }

  log(' 7TV: Emote set update for', channelName);

  let updated = false;
  const actor = updateData.actor?.display_name || updateData.actor?.username || '';

  // Handle added emotes
  if (updateData.pushed && updateData.pushed.length > 0) {
    // Large batch = likely initial sync on subscription, not real additions — suppress per-emote spam
    const isBulkSync = updateData.pushed.length > 3;
    for (const item of updateData.pushed) {
      const emote = item.value;
      if (!/^[a-f0-9]{24}$/.test(emote.id)) continue
      const newEmote = {
        name: String(emote.name || '').slice(0, 100),
        url: `https://cdn.7tv.app/emote/${emote.id}/1x.webp`,
        source: '7tv',
        hash: emote.id
      };

      const chEmotes = Array.isArray(channelEmotesMap[channelName]) ? channelEmotesMap[channelName] : [];
      if (!chEmotes.some(e => e.hash === emote.id)) {
        chEmotes.push(newEmote);
        channelEmotesMap[channelName] = chEmotes;
        updated = true;

        if (!isBulkSync) {
          log(' 7TV: Added emote:', emote.name, 'to', channelName);
          const msg = actor ? `${actor} added 7TV emote ${emote.name}` : `${emote.name} added to channel`;
          broadcastToTabs({
            type: 'channel_emote_added',
            emote: newEmote,
            message: msg
          });
        }
      }
    }
    if (isBulkSync) {
      log(' 7TV: Bulk sync — added', updateData.pushed.length, 'emotes to', channelName, '(notifications suppressed)');
    }
  }

  // Handle removed emotes
  if (updateData.pulled && updateData.pulled.length > 0) {
    const isBulkRemoval = updateData.pulled.length > 3;
    let removedCount = 0;
    for (const item of updateData.pulled) {
      const emote = item.old_value;
      const chEmotes = channelEmotesMap[channelName] || [];
      const index = chEmotes.findIndex(e => e.hash === emote.id);

      if (index !== -1) {
        chEmotes.splice(index, 1);
        channelEmotesMap[channelName] = chEmotes;
        updated = true;
        removedCount++;

        if (!isBulkRemoval) {
          log(' 7TV: Removed emote:', emote.name, 'from', channelName);
          const msg = actor ? `${actor} removed 7TV emote ${emote.name}` : `${emote.name} removed from channel`;
          broadcastToTabs({
            type: 'channel_emote_removed',
            emoteName: emote.name,
            emoteHash: emote.id,
            message: msg
          });
        }
      }
    }
    if (isBulkRemoval && removedCount > 0) {
      log(' 7TV: Bulk removal —', removedCount, 'emotes removed from', channelName, '(notifications suppressed)');
      broadcastToTabs({
        type: 'channel_emote_removed',
        emoteName: null,
        emoteHash: null,
        message: `${removedCount} 7TV emotes removed from channel (set changed)`
      });
    }
  }

  if (updated) {
    updateEmoteUrlMap();

    const updatedEmotes = Array.isArray(channelEmotesMap[channelName]) ? channelEmotesMap[channelName] : [];
    broadcastToTabs({
      type: 'channel_emotes_update',
      emotes: updatedEmotes,
      channelOwner: channelName
    });

    browser.storage.local.set({ channel_emotes_map: getStorableChannelEmotes(), channel_emotes_fetched_at: channelEmotesFetchedAt }).catch(() => {});
    log(' 7TV: Channel emotes updated for', channelName, '(now', updatedEmotes.length, 'total)');
  }
}

// ========== 7TV Polling Fallback ==========
// EventAPI works but can be unreliable. Poll as backup — both paths diff against
// channelEmotesMap so they naturally deduplicate (no double-fire).
let seventvPollTimer = null;
const SEVENTV_POLL_INTERVAL = 30000;
// Track channels that have completed their first poll in this session
// Prevents spammy "removed" notifications when diffing stale cache on startup
const seventvPolledChannels = new Set();

function start7TVPolling() {
  stop7TVPolling()
  if (seventvEmoteSetIds.size === 0) return
  log(' 7TV Poll: Starting for', seventvEmoteSetIds.size, 'channel(s)')
  seventvPollTimer = trackInterval(setInterval(poll7TVEmoteSet, SEVENTV_POLL_INTERVAL))
}

function stop7TVPolling() {
  if (seventvPollTimer) {
    untrackInterval(seventvPollTimer);
    seventvPollTimer = null;
  }
}

async function poll7TVEmoteSet() {
  // Poll ALL channels that have an active 7TV emote set ID
  const channels = Array.from(seventvEmoteSetIds.keys())
  if (channels.length === 0) return

  for (const channelName of channels) {
    // Find the platform from any tab tracking this channel owner
    let platform = 'twitch'
    for (const entry of tabChannels.values()) {
      if (entry.channelOwner === channelName && entry.channel) {
        platform = entry.channel.split('/')[0] || 'twitch'
        break
      }
    }

    try {
      let response
      if (platform === 'kick') {
        response = await fetchWithTimeout(`https://7tv.io/v3/users/kick/${channelName}`)
      } else {
        const channelId = await lookupTwitchUserId(channelName)
        if (!channelId) continue
        response = await fetchWithTimeout(`https://7tv.io/v3/users/twitch/${channelId}`)
      }
      if (!response.ok) continue
      const data = await response.json()

      const emoteSet = data.emote_set
      if (!emoteSet?.emotes) continue

      // Check if emote set ID changed (user recreated their set)
      const knownSetId = seventvEmoteSetIds.get(channelName)
      if (emoteSet.id !== knownSetId) {
        log(' 7TV Poll: Emote set ID changed for', channelName, ':', knownSetId, '→', emoteSet.id)
        seventvEmoteSetIds.set(channelName, emoteSet.id)
        if (channelName === getActiveChannelOwner()) current7TVEmoteSetId = emoteSet.id
        subscribe7TVEmoteSet(emoteSet.id)
      }

      // Build current 7TV emote map from fetched data
      const fetchedEmotes = new Map()
      for (const e of emoteSet.emotes) {
        fetchedEmotes.set(e.id, {
          name: e.name,
          url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
          source: '7tv',
          hash: e.id,
          flags: e.flags || e.data?.flags || 0,
          zeroWidth: !!((e.flags & 257) || (e.data?.flags & 257))
        })
      }

      // Get existing 7TV emotes for this channel
      const chEmotes = Array.isArray(channelEmotesMap[channelName]) ? channelEmotesMap[channelName] : []
      const existing7TV = new Map()
      for (const e of chEmotes) {
        if (e.source === '7tv') existing7TV.set(e.hash, e)
      }

      // Diff: find added and removed
      const added = []
      const removed = []
      for (const [id, emote] of fetchedEmotes) {
        if (!existing7TV.has(id)) added.push(emote)
      }
      for (const [id, emote] of existing7TV) {
        if (!fetchedEmotes.has(id)) removed.push(emote)
      }

      if (added.length === 0 && removed.length === 0) continue

      log(' 7TV Poll: Detected changes for', channelName, '— added:', added.length, 'removed:', removed.length)

      // Apply changes to channelEmotesMap
      let updatedEmotes = chEmotes.filter(e => e.source !== '7tv' || fetchedEmotes.has(e.hash))
      updatedEmotes.push(...added)
      channelEmotesMap[channelName] = updatedEmotes
      updateEmoteUrlMap()

      // Only broadcast individual notifications after first successful poll this session
      // Prevents spammy "removed" notifications when diffing stale cache on startup
      if (seventvPolledChannels.has(channelName)) {
        const isBulk = added.length > 3 || removed.length > 3
        if (isBulk) {
          log(' 7TV Poll: Bulk set change for', channelName, '—', added.length, 'added,', removed.length, 'removed (notifications suppressed)')
          if (added.length > 0) {
            broadcastToTabs({
              type: 'channel_emote_added',
              emote: null,
              message: `${added.length} 7TV emotes added to channel (set changed)`
            })
          }
          if (removed.length > 0) {
            broadcastToTabs({
              type: 'channel_emote_removed',
              emoteName: null,
              emoteHash: null,
              message: `${removed.length} 7TV emotes removed from channel (set changed)`
            })
          }
        } else {
          for (const emote of added) {
            log(' 7TV Poll: Added emote:', emote.name, 'to', channelName)
            broadcastToTabs({
              type: 'channel_emote_added',
              emote,
              message: `${emote.name} added to channel (7TV)`
            })
          }
          for (const emote of removed) {
            log(' 7TV Poll: Removed emote:', emote.name, 'from', channelName)
            broadcastToTabs({
              type: 'channel_emote_removed',
              emoteName: emote.name,
              emoteHash: emote.hash,
              message: `${emote.name} removed from channel (7TV)`
            })
          }
        }
      } else {
        log(' 7TV Poll: Skipping notifications for initial load of', channelName, '(' + added.length + ' added,', removed.length, 'removed)')
        seventvPolledChannels.add(channelName)
      }

      // Broadcast full update
      broadcastToTabs({
        type: 'channel_emotes_update',
        emotes: updatedEmotes,
        channelOwner: channelName
      })

      browser.storage.local.set({ channel_emotes_map: getStorableChannelEmotes(), channel_emotes_fetched_at: channelEmotesFetchedAt }).catch(() => {})
      log(' 7TV Poll: Channel emotes updated for', channelName, '(now', updatedEmotes.length, 'total)')
    } catch (err) {
      // Silent fail — poll will retry next interval
    }
  }
}

// Block emote via HTTP - returns success/failure
async function blockEmote(hash) {
  // Server stores blocks by hash only — silently 404s for empty/null hashes.
  // Reject early to prevent corrupting blockedEmotes Set with undefined entries.
  if (!hash || typeof hash !== 'string') return { success: false, error: 'no hash' };
  try {
    const authToken = await getAuthCookie();
    if (!authToken) {
      // Not logged in - use local storage
      localBlockedEmotes.add(hash);
      markBlockToggle(hash, 'blocked');
      await saveLocalBlockedEmotes();

      const allBlocked = new Set([...blockedEmotes, ...localBlockedEmotes]);
      broadcastToTabs({ type: 'blocked_update', blocked: Array.from(allBlocked) });
      broadcastToTabs({ type: 'emote_blocked', hash });
      return { success: true, local: true };
    }

    // Optimistically add to blockedEmotes BEFORE HTTP request
    // Prevents race where WS emote:blocked arrives before HTTP response
    // and triggers inventory_update → emoteGeneration++ → stack rebuild
    blockedEmotes.add(hash);
    markBlockToggle(hash, 'blocked');

    const response = await fetchWithTimeout(`${API_URL}/api/user/emotes/block`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ emote_hash: hash })
    });

    if (!response.ok) {
      // Rollback optimistic add
      blockedEmotes.delete(hash);
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: error.error || `HTTP ${response.status}` };
    }

    // Also remove from local inventory if present (server does this too)
    const removedEmote = emoteInventory.find(e => e.hash === hash);
    if (removedEmote) {
      emoteInventory = emoteInventory.filter(e => e.hash !== hash);
      log(' Removed blocked emote from local inventory:', removedEmote.name);
    }

    // Persist updated blocked set so a page refresh doesn't restore stale state.
    // Overwrite any stale `blocked_update` snapshot in the debounce queue too —
    // otherwise a queued flush from a prior broadcast can clobber this fresh
    // direct write 5s later, re-blocking what the user just unblocked.
    const blockedArr = Array.from(blockedEmotes)
    _broadcastStorageQueue.set('blocked_emotes', blockedArr)
    browser.storage.local.set({ blocked_emotes: blockedArr }).catch(() => {})
    broadcastToTabs({ type: 'emote_blocked', hash });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || 'Network error' };
  }
}

// Unblock emote via HTTP - returns success/failure
async function unblockEmote(hash) {
  // Same hash-validity guard as blockEmote — silent 404 corrupts state otherwise.
  if (!hash || typeof hash !== 'string') return { success: false, error: 'no hash' };
  try {
    const authToken = await getAuthCookie();
    if (!authToken) {
      // Not logged in - use local storage
      localBlockedEmotes.delete(hash);
      markBlockToggle(hash, 'unblocked');
      await saveLocalBlockedEmotes();

      // Broadcast update
      const allBlocked = new Set([...blockedEmotes, ...localBlockedEmotes]);
      broadcastToTabs({ type: 'blocked_update', blocked: Array.from(allBlocked) });
      broadcastToTabs({ type: 'emote_unblocked', hash });

      log(' 🔓 Unblocked emote locally (not logged in):', hash);
      return { success: true, local: true };
    }

    // Optimistically remove from blockedEmotes BEFORE HTTP request
    // Prevents race where WS emote:unblocked arrives before HTTP response
    blockedEmotes.delete(hash);
    markBlockToggle(hash, 'unblocked');

    const response = await fetchWithTimeout(`${API_URL}/api/user/emotes/blocked/${hash}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    if (!response.ok) {
      // Rollback optimistic delete
      blockedEmotes.add(hash);
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return { success: false, error: error.error || `HTTP ${response.status}` };
    }

    // Persist updated blocked set so a page refresh doesn't restore stale state.
    // Same rationale as blockEmote: keep the debounced queue snapshot in sync
    // so a 5s-later flush can't re-add the hash the user just unblocked.
    const blockedArr = Array.from(blockedEmotes)
    _broadcastStorageQueue.set('blocked_emotes', blockedArr)
    browser.storage.local.set({ blocked_emotes: blockedArr }).catch(() => {})
    broadcastToTabs({ type: 'emote_unblocked', hash });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message || 'Network error' };
  }
}

// Extension badge — combined source: live followed creators (red, priority) +
// unread heatsync notifications (orange, fallback). Whichever is non-zero wins,
// live wins when both. One number on the icon, colour disambiguates the source.
// Firefox MV2 uses browserAction, Chrome MV3 uses action.
const badgeApi = browser.action || browser.browserAction
function recomputeBadge() {
  if (!badgeApi) return
  const live = _liveFollowedCount || 0
  const notifs = unreadNotifCount || 0
  if (live > 0) {
    badgeApi.setBadgeText({ text: String(live) }).catch(() => {})
    badgeApi.setBadgeBackgroundColor({ color: '#ff3030' }).catch(() => {})
  } else if (notifs > 0) {
    badgeApi.setBadgeText({ text: String(notifs) }).catch(() => {})
    badgeApi.setBadgeBackgroundColor({ color: '#ff6b35' }).catch(() => {})
  } else {
    badgeApi.setBadgeText({ text: '' }).catch(() => {})
  }
}
function updateExtensionBadge() { recomputeBadge() }

// Persist muted users to storage as { username, expiresAt } objects
function persistMutedUsers() {
  const arr = Array.from(mutedUsers.entries()).map(([username, expiresAt]) => ({ username, expiresAt }));
  browser.storage.local.set({ muted_users: arr }).catch(() => {})
}

// Remove expired mutes and broadcast unmutes
function pruneExpiredMutes() {
  const now = Date.now();
  const expired = [];
  for (const [username, expiresAt] of mutedUsers) {
    if (expiresAt !== null && expiresAt <= now) {
      expired.push(username);
    }
  }
  if (expired.length > 0) {
    expired.forEach(u => {
      mutedUsers.delete(u);
      broadcastToTabs({ type: 'user_unmuted', username: u });
    });
    persistMutedUsers();
    log(' Pruned', expired.length, 'expired mutes');
  }
}

// Prune expired mutes — driven by chrome.alarms 'prune-expired-mutes' (MV3 SW survives across wakeups)

// Cached tab list to avoid repeated browser.tabs.query IPC on burst broadcasts
let _cachedTabs = null
let _cachedTabsAt = 0
const TAB_CACHE_TTL = 2000 // 2 seconds

async function getMatchingTabs() {
  const now = Date.now()
  if (_cachedTabs && now - _cachedTabsAt < TAB_CACHE_TTL) return _cachedTabs
  _cachedTabs = await browser.tabs.query({ url: ['*://*.twitch.tv/*', '*://*.kick.com/*', '*://*.youtube.com/*', '*://*.heatsync.org/*', '*://heatsync.org/*'] })
  _cachedTabsAt = now
  return _cachedTabs
}

// Coalesce per-key persistence so high-frequency broadcasts don't write storage 1-2x/sec.
// Latest payload wins; flush after a short idle window.
const _broadcastStorageQueue = new Map() // key -> latest value
let _broadcastStorageTimer = null
const BROADCAST_STORAGE_DEBOUNCE = 5000
function _scheduleBroadcastStorageFlush() {
  if (_broadcastStorageTimer) return
  _broadcastStorageTimer = setTimeout(() => {
    _broadcastStorageTimer = null
    if (!_broadcastStorageQueue.size) return
    const payload = {}
    for (const [k, v] of _broadcastStorageQueue) payload[k] = v
    _broadcastStorageQueue.clear()
    browser.storage.local.set(payload).catch(() => {})
  }, BROADCAST_STORAGE_DEBOUNCE)
}

// Broadcast updates to all content scripts AND update storage
async function broadcastToTabs(message) {
  // Coalesce storage writes — burst broadcasts collapse to one set() per 5s window
  if (message.type === 'inventory_update') {
    _broadcastStorageQueue.set('emote_inventory', message.emotes)
    _scheduleBroadcastStorageFlush()
  } else if (message.type === 'global_emotes_update') {
    _broadcastStorageQueue.set('global_emotes', message.emotes)
    _scheduleBroadcastStorageFlush()
  } else if (message.type === 'blocked_update') {
    _broadcastStorageQueue.set('blocked_emotes', message.blocked)
    _scheduleBroadcastStorageFlush()
  }

  // Broadcast to streaming tabs only (filtered query instead of all-tabs scan)
  try {
    const tabs = await getMatchingTabs()
    for (const tab of tabs) {
      browser.tabs.sendMessage(tab.id, message).catch(() => {})
    }
  } catch (e) {
    console.error('[HS] broadcastToTabs error:', e)
  }
}

// =============================================================================
// BULLETPROOF WEBSOCKET CONNECTION
// =============================================================================
// Features:
// - Message queue for when socket isn't ready
// - Connection state machine
// - Automatic retry with exponential backoff
// - Flush queued messages on connect

const WS_STATE = {
  DISCONNECTED: 0,
  CONNECTING: 1,
  CONNECTED: 2,
  AUTHENTICATED: 3
};

let wsState = WS_STATE.DISCONNECTED;
let isAuthenticated = false;
let socketAuthToken = null;
let reconnectAttempts = 0;
let heartbeatInterval = null; // Keep connection alive
let reconnectTimer = null;
let messageQueue = []; // Queue messages when socket not ready
let connectionPromise = null; // Track ongoing connection attempt
let lastWsDataReceived = 0; // Timestamp of last received WS message (zombie detection)

function isSocketOpen() {
  return socket && socket.readyState === WebSocket.OPEN;
}

const MESSAGE_QUEUE_TTL = 60000; // 60 seconds — matches max reconnect backoff + jitter

// Flush queued messages when socket becomes ready
function flushMessageQueue() {
  if (!isSocketOpen()) return;

  const now = Date.now();
  // Drop messages older than TTL before counting
  while (messageQueue.length > 0 && now - messageQueue[0]._queuedAt > MESSAGE_QUEUE_TTL) {
    log(` 🗑 Dropping stale queued message: ${messageQueue[0].type}`);
    messageQueue.shift();
  }

  const queued = messageQueue.length;
  if (queued > 0) {
    log(` 📤 Flushing ${queued} queued messages`);
  }

  while (messageQueue.length > 0 && isSocketOpen()) {
    const msg = messageQueue.shift();
    if (now - msg._queuedAt > MESSAGE_QUEUE_TTL) {
      log(` 🗑 Dropping stale queued message: ${msg.type}`);
      continue;
    }
    try {
      socket.send(JSON.stringify(msg));
      log(` 📤 Sent queued: ${msg.type}`);
    } catch (err) {
      messageQueue.unshift(msg); // Put it back
      break;
    }
  }
}

async function connectWebSocket() {
  // If already connecting, wait for that attempt
  if (wsState === WS_STATE.CONNECTING && connectionPromise) {
    log(' Connection in progress, waiting...');
    return connectionPromise;
  }

  // If already connected with SAME token, skip
  if (isSocketOpen() && socketAuthToken === authToken && wsState >= WS_STATE.CONNECTED) {
    log(' Already connected with same token');
    return Promise.resolve();
  }

  // If connected with DIFFERENT token, disconnect first
  if (isSocketOpen() && socketAuthToken !== authToken) {
    log(' 🔄 Token changed, reconnecting...');
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    socket.onclose = null; // prevent scheduleReconnect on intentional close
    socket.onmessage = null;
    socket.onopen = null;
    socket.onerror = null;
    socket.close();
    wsState = WS_STATE.DISCONNECTED;
    isAuthenticated = false;
  }

  // Claim CONNECTING state BEFORE any await to block concurrent callers
  wsState = WS_STATE.CONNECTING;
  connectionPromise = new Promise((resolve, reject) => {
    // Run async work inside the promise executor so the lock is held before any yield
    ;(async () => {
      // Load auth token if needed (async — but lock is already held above)
      if (!authToken) {
        log(' Loading auth token before connecting...');
        await getAuthCookie();
      }

      socketAuthToken = authToken;

      const wsEndpoint = `${WS_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/ws`;
      log(' 🔌 Connecting to WebSocket:', wsEndpoint, 'with auth:', !!authToken);

      // Defensive: detach handlers from any prior closed/closing socket before reassigning
      if (socket) {
        try {
          socket.onopen = null
          socket.onmessage = null
          socket.onerror = null
          socket.onclose = null
          if (socket.readyState !== WebSocket.CLOSED) socket.close()
        } catch {}
        socket = null
      }

      try {
        socket = new WebSocket(wsEndpoint);
      } catch (err) {
        wsState = WS_STATE.DISCONNECTED;
        connectionPromise = null;
        scheduleReconnect();
        reject(err);
        return;
      }

      // Connection timeout (10 seconds)
      const connectTimeout = setTimeout(() => {
        if (wsState === WS_STATE.CONNECTING) {
          socket.close();
          wsState = WS_STATE.DISCONNECTED;
          connectionPromise = null;
          scheduleReconnect();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      socket.onopen = () => {
        clearTimeout(connectTimeout);
        log(' ✅ WebSocket connected');
        // Clear "down" banner once we reconnect
        if (reconnectAttempts >= 3) {
          broadcastToTabs({ type: 'api_status', source: 'heatsync', state: 'up' })
        }
        reconnectAttempts = 0;
        wsState = WS_STATE.CONNECTED;
        // Reset zombie-detection timestamp; otherwise a stale lastWsDataReceived
        // from before the disconnect makes the first heartbeat (90s later) trip
        // the 2min idle threshold and immediately kill the fresh socket.
        lastWsDataReceived = Date.now();

        // Start heartbeat to keep connection alive (server has 2min idle timeout)
        if (heartbeatInterval) untrackInterval(heartbeatInterval)
        heartbeatInterval = trackInterval(setInterval(() => {
          if (isSocketOpen()) {
            // Zombie detection: if no data received in 2min, connection is silently dead
            if (lastWsDataReceived && Date.now() - lastWsDataReceived > 120000) {
              log('WS zombie detected, reconnecting')
              socket.close()
              return
            }
            try {
              socket.send(JSON.stringify({ type: 'presence:heartbeat' }));
            } catch (err) {
              log(' Heartbeat send failed:', err?.message);
            }
          }
        }, 90000)) // Every 90 seconds (well within 2min server timeout)

        // Rejoin all tracked tab channels
        const rejoinedChannels = new Set()
        for (const entry of tabChannels.values()) {
          if (entry.channel && !rejoinedChannels.has(entry.channel)) {
            const [platform, channel] = entry.channel.split('/')
            log(' 📺 Rejoining channel:', { platform, channel })
            wsSendDirect({ type: 'channel:join', platform, channel })
            rejoinedChannels.add(entry.channel)
          }
        }
        // Replay multichat-added channels (kick chats added via ws_send)
        for (const key of joinedExtraChannels) {
          if (rejoinedChannels.has(key)) continue
          const [platform, channel] = key.split('/')
          if (!platform || !channel) continue
          log(' 📺 Rejoining extra channel:', { platform, channel })
          wsSendDirect({ type: 'channel:join', platform, channel })
          rejoinedChannels.add(key)
        }

        // Authenticate if we have a token
        if (authToken) {
          log(' 🔐 Authenticating...');
          wsSendDirect({ type: 'authenticate', token: authToken });
        } else {
          log(' ℹ️ No auth token - viewer mode');
          // Flush queue even without auth (for channel joins etc)
          flushMessageQueue();
        }

        // Re-subscribe to YouTube channels (global + per-channel)
        log('[hs-bg] WS connected, re-subscribing YouTube channels...')
        browser.storage.local.get(['youtube_url']).then(data => {
          log('[hs-bg] stored youtube data:', JSON.stringify(data))
          // Global YouTube (live tab)
          if (data.youtube_url) {
            const vidMatch = data.youtube_url.match(/[?&]v=([^&]+)/) || data.youtube_url.match(/\/live\/([^?&\/]+)/) || data.youtube_url.match(/youtu\.be\/([^?&]+)/)
            if (vidMatch) setYtVideoChannel(vidMatch[1], 'global')
            wsSend({ type: 'youtube:subscribe', url: data.youtube_url })
          }
          // Per-channel YouTube URLs from in-memory map
          for (const [channelId, url] of Object.entries(youtubeChannelUrls)) {
            const vidMatch = url.match(/[?&]v=([^&]+)/) || url.match(/\/live\/([^?&\/]+)/) || url.match(/youtu\.be\/([^?&]+)/)
            if (vidMatch) setYtVideoChannel(vidMatch[1], channelId)
            wsSend({ type: 'youtube:subscribe', url, channelId })
          }
        }).catch(() => {})

        connectionPromise = null;
        resolve();
      };

      socket.onmessage = (event) => {
        lastWsDataReceived = Date.now();
        try {
          const msg = JSON.parse(event.data);
          handleWSMessage(msg);
        } catch (err) {
          log(' WS message parse error:', err?.message);
        }
      };

      socket.onclose = (event) => {
        clearTimeout(connectTimeout);
        if (heartbeatInterval) {
          untrackInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        log(' ⚠️ WebSocket disconnected:', event.code, event.reason);
        // Detach handlers from the closing socket so its closure releases
        const closing = event?.target;
        if (closing) {
          try { closing.onopen = null; closing.onmessage = null; closing.onerror = null; closing.onclose = null } catch {}
        }
        wsState = WS_STATE.DISCONNECTED;
        isAuthenticated = false;
        connectionPromise = null;
        scheduleReconnect();
      };

      socket.onerror = (err) => {
        log(' WebSocket error:', err?.message || 'unknown')
      };
    })().catch(err => {
      wsState = WS_STATE.DISCONNECTED;
      connectionPromise = null;
      scheduleReconnect();
      reject(err);
    });
  });

  return connectionPromise;
}

// Direct send (bypasses queue) - used internally
function wsSendDirect(msg) {
  if (!isSocketOpen()) {
    log(' Cannot send direct - socket not open');
    return false;
  }
  try {
    socket.send(JSON.stringify(msg));
    return true;
  } catch (err) {
    return false;
  }
}

// Send JSON message over WebSocket (queues if not ready)
function wsSend(msg) {
  // If socket is open and ready, send immediately
  if (isSocketOpen()) {
    try {
      socket.send(JSON.stringify(msg));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Queue the message and ensure we're connecting
  log(` 📥 Queueing message: ${msg.type}`);
  msg._queuedAt = Date.now();
  messageQueue.push(msg);

  // Limit queue size to prevent memory issues
  if (messageQueue.length > 50) {
    messageQueue.shift(); // Remove oldest
  }

  // Trigger connection if not already connecting
  if (wsState === WS_STATE.DISCONNECTED) {
    connectWebSocket().catch(err => log(' WS connect failed:', err?.message));
  }

  return false;
}

// Handle incoming WebSocket messages
function handleWSMessage(msg) {
  try {
  log(' 📨 WS message received:', msg.type, msg);

  switch (msg.type) {
    case 'authenticated':
      log(' ✅ Authenticated, userId:', msg.userId);
      isAuthenticated = true;
      wsState = WS_STATE.AUTHENTICATED;
      // Flush any queued messages now that we're authenticated
      flushMessageQueue();
      break;

    case 'authentication_failed':
      isAuthenticated = false;
      authToken = null;
      authFailedBlock = true;
      // Drop the stored token so the next reconnect (after a fresh login)
      // doesn't keep replaying the dead one and looping us back to here.
      browser.storage.local.remove(['auth_token_encrypted', 'auth_token']).catch(() => {})
      if (socket) { socket.close(); }
      // Tell content scripts so the multichat panel can prompt the user to
      // log in — without this signal YT chat (which depends on the server
      // scraping for us) silently produces zero messages.
      broadcastToTabs({ type: 'auth_changed', loggedIn: false, reason: 'authentication_failed' })
      break;

    case 'emote:broadcast':
      if (msg.emoteData?.url) {
        msg.emoteData.url = absUrl(msg.emoteData.url)
        if (!/^https:\/\//.test(msg.emoteData.url)) break
      }
      if (msg.emoteName) msg.emoteName = String(msg.emoteName).slice(0, 100)
      log(' 📢 EMOTE BROADCAST RECEIVED:', {
        username: msg.username,
        emoteName: msg.emoteName,
        emoteUrl: msg.emoteData?.url
      })
      broadcastToTabs({
        type: 'emote_broadcast',
        username: msg.username,
        emoteName: msg.emoteName,
        emoteData: msg.emoteData
      });
      break;

    case 'emote:removed':
      // Could be broadcast (other users) OR personal inventory removal
      if (msg.slot !== undefined) {
        // Personal inventory removal (has slot number)
        log(' 🗑️ EMOTE REMOVED FROM YOUR INVENTORY:', msg.name, 'slot:', msg.slot)
        scheduleInventoryRefresh()
      } else if (msg.username) {
        // Broadcast from other user
        log(' 🗑️ EMOTE REMOVED BROADCAST:', msg);
        broadcastToTabs({
          type: 'emote_removed_broadcast',
          username: msg.username,
          emoteName: msg.emoteName
        });
      }
      break;

    case 'emote:added':
      // Server notifies when emote is added to YOUR inventory (e.g., uploaded on website)
      log(' ✅ EMOTE ADDED TO INVENTORY:', msg.name, 'slot:', msg.slot)
      // Refresh inventory to get the new emote (debounced)
      scheduleInventoryRefresh()
      break

    case 'emote:blocked':
      // Skip if user just unblocked locally — late WS echo would otherwise re-add.
      if (recentBlockToggleState(msg.hash) === 'unblocked') break;
      if (msg.hash && !blockedEmotes.has(msg.hash)) {
        blockedEmotes.add(msg.hash)
        browser.storage.local.set({ blocked_emotes: Array.from(blockedEmotes) }).catch(() => {})
        const blockedEmote = emoteInventory.find(e => e.hash === msg.hash)
        if (blockedEmote) {
          emoteInventory = emoteInventory.filter(e => e.hash !== msg.hash)
          broadcastToTabs({ type: 'inventory_update', emotes: emoteInventory })
        }
        broadcastToTabs({ type: 'blocked_update', blocked: [...blockedEmotes, ...localBlockedEmotes] })
        broadcastToTabs({ type: 'emote_blocked', hash: msg.hash })
      }
      break

    case 'emote:unblocked':
      // Skip if user just blocked locally — late WS echo would otherwise re-remove.
      if (recentBlockToggleState(msg.hash) === 'blocked') break;
      if (msg.hash && blockedEmotes.has(msg.hash)) {
        blockedEmotes.delete(msg.hash)
        browser.storage.local.set({ blocked_emotes: Array.from(blockedEmotes) }).catch(() => {})
        // Refresh inventory in case the unblocked emote should be restored
        scheduleInventoryRefresh()
        broadcastToTabs({ type: 'blocked_update', blocked: [...blockedEmotes, ...localBlockedEmotes] })
        broadcastToTabs({ type: 'emote_unblocked', hash: msg.hash })
      }
      break

    case 'multichat:config':
      // Cross-device sync: server sent updated multichat config
      if (Array.isArray(msg.channels)) {
        // Validate channel objects — reject malformed data to prevent CRLF injection in IRC.
        // twitch is sent to IRC so it must be username-shaped. kick allows hyphens.
        // youtube is a full https URL we resolve later; reject anything else.
        const validChannels = msg.channels.filter(ch => {
          if (!ch || typeof ch !== 'object') return false
          if (ch.twitch && (typeof ch.twitch !== 'string' || !/^[a-zA-Z0-9_]{1,25}$/.test(ch.twitch))) return false
          if (ch.kick && (typeof ch.kick !== 'string' || !/^[a-zA-Z0-9_-]{1,25}$/.test(ch.kick))) return false
          if (ch.youtube && (typeof ch.youtube !== 'string' || !/^https:\/\/(www\.)?youtube\.com\//i.test(ch.youtube) || /[\r\n]/.test(ch.youtube))) return false
          return true
        })
        log(' 📋 Multichat config sync received:', validChannels.length, 'channels')
        browser.storage.local.get(['heatsync_multichat']).then(data => {
          const current = data.heatsync_multichat || { channels: [], enabled: true }
          const currentJson = JSON.stringify(current.channels)
          const newJson = JSON.stringify(validChannels)
          if (currentJson !== newJson) {
            browser.storage.local.set({ heatsync_multichat: { ...current, channels: validChannels } })
          }
        }).catch(() => {})
      }
      break

    case 'new-message':
      log(' New message received:', msg);
      // Only show posts from followed users, exclude anonymous
      const msgUser = (msg.username || '').toLowerCase()
      if (msg.username === 'Anonymous') {
        log(' Skipping feed post — anonymous');
        break;
      }
      if (currentUsername && msgUser === currentUsername.toLowerCase()) {
        // Always show own posts
      } else if (!followedUsers.some(u => u.toLowerCase() === msgUser)) {
        log(' Skipping feed post — not followed');
        break;
      }
      broadcastToTabs({
        type: 'new-message',
        data: msg
      });
      break;

    case 'message-updated':
      broadcastToTabs({ type: 'message-updated', data: msg });
      break;

    case 'message-edited':
      broadcastToTabs({ type: 'message-edited', data: msg });
      break;

    case 'message-deleted':
      broadcastToTabs({ type: 'message-deleted', data: msg });
      break;

    case 'notification:new':
      log(' Notification received:', msg);
      unreadNotifCount++;
      updateExtensionBadge();
      broadcastToTabs({
        type: 'notification:new',
        data: msg.data
      });
      break;

    case 'youtube:chat':
      // Relay YouTube chat messages to all Twitch/Kick tabs
      if (msg.messages && Array.isArray(msg.messages) && msg.messages.length > 0) {
        // Use server-echoed channelId, fall back to local map.
        // Same pending-subscribe fallback as youtube:status — covers the case
        // where the first chat batch races ahead of the status event.
        let channelId = msg.channelId || ytVideoToChannel.get(msg.videoId)
        // Pending-subscribe attribution is ambiguous when multiple subscribes are
        // in flight (server may resolve them in any order). Only attribute when
        // exactly one is pending — otherwise fall through to 'global' and let
        // the eventual youtube:status event correct the mapping. This trades a
        // brief routing miss for the much worse cross-channel chat leak that
        // happens when LIFO pop guesses wrong.
        if (!channelId && msg.videoId && pendingYtSubscribes.length === 1) {
          const pend = pendingYtSubscribes.shift()
          channelId = pend.channelId
          setYtVideoChannel(msg.videoId, channelId)
        }
        if (!channelId) channelId = 'global'
        // Update local map if server provided channelId
        if (msg.channelId && msg.videoId) setYtVideoChannel(msg.videoId, msg.channelId)

        // Use real ytMsg.timestamp for both replay and live. Mellen's
        // god-tier rule: every msg lands at its true chronological position
        // via fairMerge's full sort. live YT msgs may appear slightly above
        // the most-recent twitch msg if YT's timestamp is older — that's
        // chronologically correct, not a bug. Backfill ensures hard-refresh
        // accuracy: msgs from 30 min ago slot into the chat at 30 min ago.
        const sorted = msg.messages.slice().sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        const isReplay = !!msg.replay
        const buildPayload = (ytMsg) => ({
          type: 'youtube_chat_message',
          videoId: msg.videoId,
          channelId,
          user: ytMsg.user,
          text: ytMsg.text,
          color: ytMsg.color || '#ff0000',
          time: ytMsg.timestamp || Date.now(),
          platform: 'youtube',
          emotes: ytMsg.emotes || [],
          msgType: ytMsg.type,
          amount: ytMsg.amount || '',
          scColor: ytMsg.scColor || '',
          sticker: ytMsg.sticker || null,
          avatar: ytMsg.avatar || undefined,
          badges: ytMsg.badges || undefined,
          systemMsg: ytMsg.systemMsg || undefined,
          source: 'server',
          replay: isReplay,
        })
        // Bulk dispatch. content-script's social.js routes:
        //   replay → ingestReplayYtMsg (bulk-buffer + 1 microtask render)
        //   live   → enqueueYtForPacing (per-channel 60-400ms cadence)
        for (const ytMsg of sorted) broadcastToTabs(buildPayload(ytMsg))
      }
      break

    case 'youtube:status': {
      // Resolve channelId BEFORE potentially deleting the videoId mapping —
      // otherwise an `ended` event broadcasts with channelId='global' and the
      // multichat panel can't update the right channel tab.
      // Fallback: server may not echo channelId for @user/live subscribes,
      // so attribute via pending-subscribe LIFO when status carries a fresh
      // videoId we haven't seen yet.
      let resolvedChannelId = msg.channelId || ytVideoToChannel.get(msg.videoId)
      // Same ambiguity as youtube:chat — only fall back when exactly one pending.
      if (!resolvedChannelId && msg.status === 'connected' && msg.videoId && pendingYtSubscribes.length === 1) {
        const pend = pendingYtSubscribes.shift()
        resolvedChannelId = pend.channelId
        setYtVideoChannel(msg.videoId, resolvedChannelId)
      }
      if (!resolvedChannelId) resolvedChannelId = 'global'
      if (msg.status === 'connected') {
        activeYoutubeVideoId = msg.videoId
        if (msg.videoId) setYtVideoChannel(msg.videoId, resolvedChannelId)
      } else if (msg.status === 'ended') {
        if (activeYoutubeVideoId === msg.videoId) activeYoutubeVideoId = null
        deleteYtVideoChannel(msg.videoId)
      } else if (msg.status === 'error') {
        // Transient errors (rate limit, single failed fetch) shouldn't kill routing —
        // the poller usually recovers and resumes broadcasting. Keeping the mapping
        // means resumed chat lands on the right tab instead of falling to 'global'.
        if (activeYoutubeVideoId === msg.videoId) activeYoutubeVideoId = null
      }
      broadcastToTabs({
        type: 'youtube_status',
        videoId: msg.videoId,
        channelId: resolvedChannelId,
        status: msg.status,
        channelName: msg.channelName || '',
        title: msg.title || '',
        error: msg.error || '',
      })
      break
    }

    case 'dm:new':
      broadcastToTabs({
        type: 'dm_new',
        data: msg
      })
      break

    case 'kick-chat-message':
      // Relay Kick chat messages (via server webhook) to content scripts
      broadcastToTabs({
        type: 'kick_chat_message',
        data: msg.data
      })
      break

    case 'kick-sub-event':
      // Relay Kick subscription events to content scripts
      broadcastToTabs({
        type: 'kick_sub_event',
        channel: msg.channel,
        eventType: msg.eventType,
        username: msg.username,
        months: msg.months,
        gifter: msg.gifter,
        giftees: msg.giftees,
        message: msg.message
      })
      break

    case 'kick-kicks-event':
      // Relay KICKs gifted events to content scripts
      broadcastToTabs({
        type: 'kick_kicks_event',
        channel: msg.channel,
        username: msg.username,
        amount: msg.amount,
        giftName: msg.giftName,
        message: msg.message
      })
      break

    case 'stream:update':
    case 'stream:online':
    case 'stream:offline': {
      // Dedup: same channel+event within 60s (prevents dupes from stream:* and follow:stream:*)
      const streamKey = `${msg.channel}:${msg.type}:${msg.game || ''}`
      const streamNow = Date.now()
      if (wsStreamEventDedup.has(streamKey) && streamNow - wsStreamEventDedup.get(streamKey) < 60000) break
      wsStreamEventDedup.set(streamKey, streamNow)
      if (wsStreamEventDedup.size > 100) {
        for (const [k, t] of wsStreamEventDedup) { if (streamNow - t > 60000) wsStreamEventDedup.delete(k) }
      }
      broadcastToTabs({
        type: 'stream_event',
        eventType: msg.type,
        platform: msg.platform,
        channel: msg.channel,
        game: msg.game || '',
        title: msg.title || '',
        prevGame: msg.prevGame || '',
        prevTitle: msg.prevTitle || '',
        isLive: msg.isLive
      })
      break
    }

    case 'stream:redeem':
      broadcastToTabs({
        type: 'stream_event',
        eventType: 'stream:redeem',
        platform: msg.platform,
        channel: msg.channel,
        user: msg.user || '',
        title: msg.title || '',
        cost: msg.cost || 0
      })
      break

    case 'stream:raid':
      broadcastToTabs({
        type: 'stream_event',
        eventType: 'stream:raid',
        platform: msg.platform,
        channel: msg.channel,
        target: msg.target || '',
        viewers: msg.viewers || 0
      })
      break

    case 'stream:hype-start':
    case 'stream:hype-end':
      broadcastToTabs({
        type: 'stream_event',
        eventType: msg.type,
        platform: msg.platform,
        channel: msg.channel,
        level: msg.level || 0
      })
      break

    case 'stream:sub-gift':
      broadcastToTabs({
        type: 'stream_event',
        eventType: 'stream:sub-gift',
        platform: msg.platform,
        channel: msg.channel,
        user: msg.user || '',
        count: msg.count || 0
      })
      break

    case 'follow:stream:update':
    case 'follow:stream:online':
    case 'follow:stream:offline': {
      // Dedup: same channel+event within 60s (shared map with stream:*)
      const fStreamKey = `${msg.channel}:${msg.type.replace('follow:', '')}:${msg.game || ''}`
      const fStreamNow = Date.now()
      if (wsStreamEventDedup.has(fStreamKey) && fStreamNow - wsStreamEventDedup.get(fStreamKey) < 60000) break
      wsStreamEventDedup.set(fStreamKey, fStreamNow)
      if (wsStreamEventDedup.size > 100) {
        for (const [k, t] of wsStreamEventDedup) { if (fStreamNow - t > 60000) wsStreamEventDedup.delete(k) }
      }

      // Append to cached history so content scripts get it on refresh
      if (!cachedFollowHistory) cachedFollowHistory = []
      cachedFollowHistory.push({
        type: msg.type,
        platform: msg.platform,
        channel: msg.channel,
        game: msg.game || '',
        title: msg.title || '',
        prevGame: msg.prevGame || '',
        prevTitle: msg.prevTitle || '',
        color: msg.color || '',
        time: fStreamNow
      })
      // Keep capped at 200
      if (cachedFollowHistory.length > 200) cachedFollowHistory.splice(0, cachedFollowHistory.length - 200)
      broadcastToTabs({
        type: 'follow_stream_event',
        eventType: msg.type.replace('follow:', ''),
        platform: msg.platform,
        channel: msg.channel,
        game: msg.game || '',
        title: msg.title || '',
        prevGame: msg.prevGame || '',
        prevTitle: msg.prevTitle || '',
        color: msg.color || '',
      })
      break
    }

    case 'follow:colors':
      cachedFollowColors = msg.colors || {}
      broadcastToTabs({
        type: 'follow_colors',
        colors: cachedFollowColors
      })
      break

    case 'follow:history':
      cachedFollowHistory = msg.events || []
      broadcastToTabs({
        type: 'follow_history',
        events: cachedFollowHistory
      })
      break

    case 'user:muted': {
      // Server confirmed mute — update local state and broadcast to all tabs
      const muteUser = msg.username?.toLowerCase()
      if (muteUser) {
        const rawExp = msg.expiresAt || msg.expires_at
        const expiresAt = rawExp ? new Date(rawExp).getTime() : null
        mutedUsers.set(muteUser, expiresAt)
        persistMutedUsers()
        broadcastToTabs({ type: 'user_muted', username: muteUser, expiresAt })
        log(' Server muted user:', muteUser, expiresAt ? `(expires ${new Date(expiresAt).toISOString()})` : '(permanent)')
      }
      break
    }

    case 'user:unmuted': {
      const unmuteUser = msg.username?.toLowerCase()
      if (unmuteUser) {
        mutedUsers.delete(unmuteUser)
        persistMutedUsers()
        broadcastToTabs({ type: 'user_unmuted', username: unmuteUser })
        log(' Server unmuted user:', unmuteUser)
      }
      break
    }

    case 'error':
      break;

    default:
      log(' Unknown message type:', msg.type);
  }
  } catch (err) {
    console.error('[HS] handleWSMessage error:', err.message, 'type:', msg?.type);
  }
}

// Reconnect with exponential backoff
function scheduleReconnect() {
  if (authFailedBlock) return; // Auth failed — don't loop
  if (reconnectTimer) return; // Already scheduled

  const jitter = Math.random() * 1000;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000) + jitter; // Max 30s + jitter
  reconnectAttempts++;
  log(` Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`);

  // After 3 consecutive failures, surface a "down" banner to UIs.
  // Cleared in socket.onopen when we reconnect.
  if (reconnectAttempts === 3) {
    broadcastToTabs({ type: 'api_status', source: 'heatsync', state: 'down' })
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket();
  }, delay);
}

// Join channel room for emote broadcasting
async function joinChannel(platform, channelName, channelId = null, senderTabId = null) {
  const channelKey = `${platform}/${channelName}`
  if (senderTabId) {
    tabChannels.set(senderTabId, { channel: channelKey, channelOwner: null })
    saveTabChannels()
  }
  log(' 🚪 Setting channel:', channelKey, 'id:', channelId, 'tab:', senderTabId)

  // Fetch channel owner's emotes (7TV EventAPI subscription happens inside)
  fetchChannelOwnerEmotes(channelName, channelId, platform).catch(() => {})

  // Ensure we're connected first
  if (!isSocketOpen()) {
    await connectWebSocket()
  }

  // Always send channel:join (wsSend queues if not ready)
  wsSend({ type: 'channel:join', platform, channel: channelName })
  log(' 🚪 Joined channel:', channelKey)
}

// Broadcast emote usage - returns success status
function broadcastEmoteUsage(emoteName, emoteHash, senderTabId = null) {
  const senderChannel = senderTabId ? getTabChannel(senderTabId) : null
  const channelStr = senderChannel || null
  if (!channelStr) return { success: false, reason: 'no_channel' }
  if (!isSocketOpen() || !isAuthenticated) {
    log(' ⚠️ Cannot broadcast emote - socket open:', isSocketOpen(), 'authenticated:', isAuthenticated, 'channel:', channelStr)
    return { success: false, reason: 'not_ready', socketOpen: isSocketOpen(), authenticated: isAuthenticated, channel: channelStr }
  }

  // Parse platform and channel from combined format
  const [platform, channel] = channelStr.split('/')

  log(' 📤 BROADCASTING EMOTE USAGE:', {
    emoteName,
    platform,
    channel
  });

  wsSend({
    type: 'emote:used',
    platform,
    channel,
    emoteName,
    emoteHash
  });

  return { success: true };
}

// Add emote to your set (for global emotes clicked in chat) - returns success/failure
async function addToInventory(emoteName, emoteHash, emoteUrl) {
  try {
    const authToken = await getAuthCookie();
    if (!authToken) {
      broadcastToTabs({
        type: 'emote_add_failed',
        emoteName,
        error: 'Not logged in - visit heatsync.org to log in'
      });
      return { success: false, error: 'Not logged in' };
    }

    log(' Adding to your set via API:', emoteName);

    // Call server API to add emote
    const response = await fetchWithTimeout(`${API_URL}/api/user/emotes`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        emoteUrl,
        emoteName,
        customName: emoteName,
        source: 'extension',
        sourceId: emoteHash
      })
    });

    const data = await response.json().catch(() => ({ error: 'Invalid response' }));

    if (!response.ok) {
      broadcastToTabs({
        type: 'emote_add_failed',
        emoteName,
        error: data.error || `Server error (${response.status})`
      });
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    log(' ✅ Added to server inventory:', data);

    // Update local inventory immediately
    const newEmote = {
      name: emoteName,
      hash: data.hash || emoteHash,
      url: emoteUrl,
      slot: data.slot
    };

    // Check if already in your set (by hash) to avoid duplicates
    // Use snapshot to prevent race with concurrent filter/reassign
    const currentInventory = [...emoteInventory]
    if (!currentInventory.some(e => e.hash === newEmote.hash)) {
      currentInventory.push(newEmote)
      emoteInventory = currentInventory
    }

    // Broadcast success to tabs
    broadcastToTabs({
      type: 'emote_added',
      emoteName: emoteName,
      hash: data.hash || emoteHash,
      url: emoteUrl,
      slot: data.slot,
      alreadyExists: data.alreadyExists
    });

    // Also update storage for persistence
    await browser.storage.local.set({ emote_inventory: emoteInventory });

    return { success: true, slot: data.slot, hash: data.hash || emoteHash, alreadyExists: data.alreadyExists };
  } catch (error) {
    broadcastToTabs({
      type: 'emote_add_failed',
      emoteName,
      error: error.message || 'Network error'
    });
    return { success: false, error: error.message || 'Network error' };
  }
}

// Coalesce concurrent removes for the same emote — without this, two tabs
// firing the same delete pick different slots from a mid-mutation inventory
// snapshot and the wrong emote gets deleted server-side.
const _removeInFlight = new Map() // hash → Promise

// Remove emote from your set - returns success/failure
async function removeFromInventory(emoteHash, emoteName) {
  const flightKey = emoteHash || emoteName
  if (flightKey && _removeInFlight.has(flightKey)) {
    return _removeInFlight.get(flightKey)
  }
  const p = _removeFromInventoryImpl(emoteHash, emoteName)
  if (flightKey) {
    _removeInFlight.set(flightKey, p)
    p.finally(() => _removeInFlight.delete(flightKey))
  }
  return p
}

async function _removeFromInventoryImpl(emoteHash, emoteName) {
  try {
    const authToken = await getAuthCookie();
    if (!authToken) {
      broadcastToTabs({
        type: 'emote_remove_failed',
        emoteName,
        error: 'Not logged in'
      });
      return { success: false, error: 'Not logged in' };
    }

    log(' Removing from your set via API:', emoteName, 'hash:', emoteHash?.substring(0, 8));

    // Tell content scripts early so they suppress this emote in new messages immediately
    // This must happen BEFORE any fetchEmoteInventory() which would broadcast inventory_update
    broadcastToTabs({ type: 'emote_removing', emoteName });

    // Find slot number by hash or name
    let emote = emoteInventory.find(e => e.hash === emoteHash || e.name === emoteName);
    if (!emote) {
      // Refetch in case local state is stale, then retry
      log(' Emote not in local inventory, refetching...', emoteName, emoteHash?.substring(0, 8));
      await fetchEmoteInventory();
      emote = emoteInventory.find(e => e.hash === emoteHash || e.name === emoteName);
      if (!emote) {
        broadcastToTabs({ type: 'emote_removing_cancel', emoteName });
        broadcastToTabs({
          type: 'emote_remove_failed',
          emoteName,
          error: 'Emote not found in your set'
        });
        return { success: false, error: 'Emote not found in your set' };
      }
    }

    if (emote.slot == null) {
      // Refetch to get correct slot numbers
      await fetchEmoteInventory();
      // Try again after refetch
      const refreshedEmote = emoteInventory.find(e => e.hash === emoteHash || e.name === emoteName);
      if (refreshedEmote?.slot == null) {
        broadcastToTabs({ type: 'emote_removing_cancel', emoteName });
        broadcastToTabs({
          type: 'emote_remove_failed',
          emoteName,
          error: 'Could not determine emote slot'
        });
        return { success: false, error: 'Could not determine emote slot' };
      }
      emote.slot = refreshedEmote.slot;
    }

    // Call server API to remove emote
    const response = await fetchWithTimeout(`${API_URL}/api/user/emotes/${emote.slot}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });

    const data = await response.json().catch(() => ({ error: 'Invalid response' }));

    if (!response.ok) {
      broadcastToTabs({ type: 'emote_removing_cancel', emoteName });
      broadcastToTabs({
        type: 'emote_remove_failed',
        emoteName,
        error: data.error || `Server error (${response.status})`
      });
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    log(' ✅ Removed from server inventory:', data);

    // Update local inventory
    emoteInventory = emoteInventory.filter(e => emoteHash ? e.hash !== emoteHash : e.name !== emoteName);
    await browser.storage.local.set({ emote_inventory: emoteInventory });

    // Broadcast success to tabs
    broadcastToTabs({
      type: 'emote_removed',
      emoteName,
      hash: emoteHash,
      slot: emote.slot
    });

    // Broadcast removal to other clients so they clear pending broadcasts
    // Send to all active channels
    const sentChannels = new Set()
    for (const entry of tabChannels.values()) {
      if (entry.channel && isSocketOpen() && !sentChannels.has(entry.channel)) {
        const [platform, channel] = entry.channel.split('/')
        wsSend({
          type: 'emote:removed',
          platform,
          channel,
          emoteName: emoteName
        })
        sentChannels.add(entry.channel)
      }
    }
    if (sentChannels.size > 0) {
      log(' 📤 Broadcasted emote removal:', emoteName)
    }

    return { success: true, slot: emote.slot };
  } catch (error) {
    broadcastToTabs({ type: 'emote_removing_cancel', emoteName });
    broadcastToTabs({
      type: 'emote_remove_failed',
      emoteName,
      error: error.message || 'Network error'
    });
    return { success: false, error: error.message || 'Network error' };
  }
}

// ========== COSMETICS ==========

// Handle messages from content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderUrl = sender?.tab?.url || sender?.url || ''
  const isFromPopup = !sender?.tab // popup/options pages have no tab
  // Reject messages from other extensions — must originate from this extension's
  // content scripts (sender.id matches) or our own popup/options (no tab).
  const isOwnExtension = !sender?.id || sender.id === browser.runtime.id
  const isValidOrigin = isFromPopup || /^https:\/\/([a-z0-9-]+\.)*(twitch\.tv|kick\.com|heatsync\.org|youtube\.com)(\/|$)/.test(senderUrl)
  const isValidSender = isOwnExtension && isValidOrigin

  if (!isValidSender) {
    sendResponse({ ok: false, error: 'unauthorized sender' })
    return true
  }

  // Health check ping from content scripts
  if (message.type === 'ping') {
    sendResponse({ ok: true })
    return true
  }

  // Crash telemetry from content scripts (no auth needed — best-effort logging)
  if (message.type === 'crash_report') {
    recordCrash(message.source || 'content', message.message, message.stack, message.url || senderUrl)
    sendResponse({ ok: true })
    return true
  }

  // Read crash log (for options page)
  if (message.type === 'get_crash_log') {
    browser.storage.local.get(CRASH_LOG_KEY).then(stored => {
      sendResponse({ ok: true, log: stored[CRASH_LOG_KEY] || [] })
    }).catch(() => sendResponse({ ok: false, log: [] }))
    return true
  }

  // Clear crash log
  if (message.type === 'clear_crash_log') {
    browser.storage.local.remove(CRASH_LOG_KEY).then(() => sendResponse({ ok: true }))
    return true
  }

  // Ensure in-memory state is populated before any handler reads it (MV3 SW restart race)
  ;(async () => {
    if (initPromise) await initPromise
    handleMessage(message, sender, sendResponse)
  })()
  return true
})

async function handleMessage(message, sender, sendResponse) {
  // Clear all heatsync message history and stream events
  if (message.type === 'clear_history') {
    browser.storage.local.get(null).then(all => {
      const keys = Object.keys(all).filter(k => k === 'hs_stream_events' || k.startsWith('hs_irc_'))
      if (keys.length > 0) {
        browser.storage.local.remove(keys).then(() => {
          log('Cleared', keys.length, 'history keys')
          sendResponse({ ok: true, cleared: keys.length })
        }).catch(e => sendResponse({ ok: false, error: e.message }))
      } else {
        sendResponse({ ok: true, cleared: 0 })
      }
    }).catch(e => sendResponse({ ok: false, error: e.message }))
    return true
  }

  // YouTube chat relay — forward to Twitch/Kick tabs only.
  // youtube-content.js scrapes the YT live_chat iframe and sends `channelId: videoId`.
  // Remap to the real extension channelId so the receiving tab can route — otherwise
  // messages bucket under a videoId key that no tab is listening on.
  if (message.type === 'youtube_chat_message' && !message.source) {
    const vId = message.videoId
    const mapped = ytVideoToChannel.get(vId)
      || (vId && vId === activeYoutubeVideoId ? '__live_yt_auto__' : null)
    const relay = mapped && mapped !== message.channelId
      ? { ...message, channelId: mapped }
      : message
    browser.tabs.query({ url: ['*://*.twitch.tv/*', '*://*.kick.com/*'] }).then(tabs => {
      for (const tab of tabs) {
        browser.tabs.sendMessage(tab.id, relay).catch(() => {})
      }
    }).catch(() => {})
    sendResponse({ ok: true })
    return true
  }

  // YouTube moderator deletion — relay to all extension tabs so they can dim
  if (message.type === 'youtube_msg_deleted') {
    const channelId = ytVideoToChannel.get(message.videoId) || 'global'
    broadcastToTabs({
      type: 'youtube_msg_deleted',
      videoId: message.videoId,
      channelId,
      user: message.user,
      reason: message.reason || ''
    })
    sendResponse({ ok: true })
    return true
  }

  // Link preview — proxy through heatsync.org server (avoids CORS)
  if (message.type === 'fetch_link_preview') {
    const url = message.url
    if (!url || !/^https?:\/\//i.test(url)) { sendResponse(null); return true }
    // Block internal/private URLs from being proxied through the server
    try {
      const parsed = new URL(url)
      if (/^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(parsed.hostname) ||
          parsed.hostname === '0.0.0.0' || parsed.hostname === '::1') {
        sendResponse(null); return true
      }
    } catch { sendResponse(null); return true }
    fetch(`${LINK_PREVIEW_API}?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.json() : null)
      .then(data => sendResponse(data))
      .catch(() => sendResponse(null))
    return true
  }

  // Query all open Twitch/Kick tabs to find channels the user is watching
  if (message.type === 'get_watching_channels') {
    const skip = new Set(['directory', 'settings', 'videos', 'moderator', 'subscriptions', 'downloads', 'search', 'categories', 'following'])
    browser.tabs.query({ url: ['*://*.twitch.tv/*', '*://kick.com/*', '*://*.kick.com/*', '*://*.youtube.com/*'] }).then(async tabs => {
      const channels = []
      const seen = new Set()
      const ytPending = [] // {idx, videoId} — needs oEmbed lookup to resolve handle
      for (const tab of tabs) {
        try {
          const url = new URL(tab.url)
          let match
          if (url.hostname.includes('twitch.tv')) {
            match = url.pathname.match(/^\/(?:popout\/)?([a-zA-Z0-9_]+)/)
          } else if (url.hostname.includes('kick.com')) {
            match = url.pathname.match(/^\/(popout|embed)\/([a-zA-Z0-9_-]+)/)
            if (match) match = [null, match[2]] // normalize to [_, channel]
            else match = url.pathname.match(/^\/([a-zA-Z0-9_-]+)/)
          } else if (url.hostname.includes('youtube.com')) {
            // Only count tabs on a live stream URL — handle, /live/<id>, or /watch?v=<id>.
            const v = url.searchParams.get('v')
            const liveHandleMatch = url.pathname.match(/^\/@([^/]+)\/live/)
            const liveIdMatch = url.pathname.match(/^\/live\/([^/?]+)/)
            if (liveHandleMatch) {
              const handle = liveHandleMatch[1]
              const key = 'yt:' + handle.toLowerCase()
              if (!seen.has(key)) {
                seen.add(key)
                channels.push({ name: handle, platform: 'youtube', youtubeUrl: `https://www.youtube.com/@${handle}/live` })
              }
            } else if (liveIdMatch || (v && url.pathname === '/watch')) {
              const videoId = liveIdMatch ? liveIdMatch[1] : v
              const ytUrl = liveIdMatch ? `https://www.youtube.com/live/${videoId}` : `https://www.youtube.com/watch?v=${videoId}`
              const idx = channels.length
              // Placeholder — name will be resolved to channel handle via oEmbed below.
              channels.push({ name: videoId, platform: 'youtube', youtubeUrl: ytUrl, _videoId: videoId })
              ytPending.push({ idx, videoId })
            }
            continue
          }
          if (match?.[1]) {
            const ch = match[1].toLowerCase()
            if (!skip.has(ch) && ch !== 'popout' && ch !== 'embed' && !seen.has(ch)) {
              seen.add(ch)
              channels.push({ name: ch, platform: url.hostname.includes('kick') ? 'kick' : 'twitch' })
            }
          }
        } catch (e) {}
      }

      // Resolve YT handles via oEmbed — public, no auth, CORS-friendly.
      if (ytPending.length) {
        await Promise.all(ytPending.map(async p => {
          const handle = await getYtChannelHandle(p.videoId)
          if (!handle) return
          const key = 'yt:' + handle.toLowerCase()
          if (seen.has(key)) {
            channels[p.idx] = null // duplicate — prefer the existing entry
          } else {
            seen.add(key)
            channels[p.idx].name = handle
            delete channels[p.idx]._videoId
          }
        }))
        for (let i = channels.length - 1; i >= 0; i--) {
          if (channels[i] === null) channels.splice(i, 1)
        }
      }

      sendResponse({ channels })
    }).catch(() => sendResponse({ channels: [] }))
    return true
  }

  // Proxy fetch for live status (avoids CORS in content script)
  if (message.type === 'fetch_live_status') {
    const channels = message.channels || []
    const kickChannels = message.kickChannels || []
    if (!channels.length && !kickChannels.length) { sendResponse(null); return true }
    const params = []
    if (channels.length) params.push(`channels=${encodeURIComponent(channels.join(','))}`)
    if (kickChannels.length) params.push(`kick_channels=${encodeURIComponent(kickChannels.join(','))}`)
    fetch(`https://heatsync.org/api/platform/live-status?${params.join('&')}`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.ok ? r.json() : null)
      .then(data => sendResponse(data))
      .catch(() => sendResponse(null))
    return true // async sendResponse
  }

  // Auth state probe — multichat content script asks for current state on init
  // so it can show the login banner immediately on a tab opened after the
  // auth_changed broadcast already fired.
  if (message.type === 'get_auth_state') {
    // Lazy-fetch the auth cookie if memory cache is empty.
    // cookies.onChanged only fires on cookie mutations — if the user logged in
    // before the extension started watching, the listener never ran and
    // chrome.storage.local stays empty until any feature calls getAuthCookie().
    // Multichat content scripts ask for auth state at startup; honor that by
    // proactively reading the cookie here and storing the token.
    if (!authToken && !authFailedBlock) {
      getAuthCookie().then(t => {
        sendResponse({ loggedIn: !!t && !authFailedBlock })
      }).catch(() => sendResponse({ loggedIn: false }))
      return true
    }
    sendResponse({ loggedIn: !!authToken && !authFailedBlock })
    return true
  }

  // YouTube subscribe via WS server — from multichat content script
  if (message.type === 'youtube_ws_subscribe') {
    const url = message.url
    const channelId = message.channelId || 'global'
    log('[hs-bg] youtube_ws_subscribe received:', { url, channelId, socketOpen: isSocketOpen() })
    if (url && /^https:\/\/(www\.)?youtube\.com\//i.test(url)) {
      // Extract videoId from URL for routing (always, even if socket is down)
      const vidMatch = url.match(/[?&]v=([^&]+)/) || url.match(/\/live\/([^?&\/]+)/) || url.match(/youtu\.be\/([^?&]+)/)
      if (vidMatch) setYtVideoChannel(vidMatch[1], channelId)
      else {
        // No videoId in URL — server resolves it. Track for status-fallback attribution.
        pendingYtSubscribes.push({ channelId, url, ts: Date.now() })
        if (pendingYtSubscribes.length > 20) pendingYtSubscribes.shift()
      }
      // wsSend handles both immediate send and queue-on-reconnect; previous
      // gating let subscribes silently drop when the socket was closing.
      log('[hs-bg] youtube:subscribe (open?', isSocketOpen(), '):', { url, channelId })
      wsSend({ type: 'youtube:subscribe', url, channelId })
      // Always persist for reconnect (even if socket is currently down)
      if (channelId === 'global') {
        browser.storage.local.set({ youtube_url: url })
      } else {
        youtubeChannelUrls[channelId] = url
        const ytUrlKeys = Object.keys(youtubeChannelUrls)
        if (ytUrlKeys.length > 50) {
          delete youtubeChannelUrls[ytUrlKeys[0]]
        }
        browser.storage.local.set({ youtube_channel_urls: { ...youtubeChannelUrls } })
      }
      log(' YouTube subscribe:', url, 'channel:', channelId, isSocketOpen() ? '' : '(queued for reconnect)')
    }
    sendResponse({ ok: true })
    return
  }

  // YouTube unsubscribe
  if (message.type === 'youtube_ws_unsubscribe') {
    const channelId = message.channelId || 'global'
    // Try videoId from message first, then extract from stored URL
    let videoId = message.videoId
    if (!videoId && message.url) {
      const vidMatch = message.url.match(/[?&]v=([^&]+)/) || message.url.match(/\/live\/([^?&\/]+)/) || message.url.match(/youtu\.be\/([^?&]+)/)
      if (vidMatch) videoId = vidMatch[1]
    }
    if (videoId && isSocketOpen()) {
      wsSend({ type: 'youtube:unsubscribe', videoId })
    }
    if (videoId) {
      deleteYtVideoChannel(videoId)
      if (activeYoutubeVideoId === videoId) activeYoutubeVideoId = null
    }
    // Clean up storage
    if (channelId === 'global') {
      browser.storage.local.remove(['youtube_url'])
    } else {
      delete youtubeChannelUrls[channelId]
      browser.storage.local.set({ youtube_channel_urls: { ...youtubeChannelUrls } })
    }
    log(' YouTube unsubscribe:', videoId || '(no videoId)', 'channel:', channelId)
    sendResponse({ ok: true })
    return
  }

  // Forward WS message from content scripts (used by multichat kick channels)
  if (message.type === 'ws_send') {
    const allowedWsTypes = ['channel:join', 'channel:leave', 'emote:used', 'youtube:subscribe', 'youtube:unsubscribe', 'multichat:sync', 'user:mute']
    if (message.data && allowedWsTypes.includes(message.data.type)) {
      // Track multichat-added channel joins so we can replay on WS reconnect
      // (server restarts, network blips, SW resume — any of these orphan the join).
      if (message.data.type === 'channel:join' && message.data.platform && message.data.channel) {
        const key = `${message.data.platform}/${message.data.channel.toLowerCase()}`
        if (!joinedExtraChannels.has(key)) {
          joinedExtraChannels.add(key)
          saveJoinedExtraChannels()
        }
      } else if (message.data.type === 'channel:leave' && message.data.platform && message.data.channel) {
        const key = `${message.data.platform}/${message.data.channel.toLowerCase()}`
        if (joinedExtraChannels.delete(key)) saveJoinedExtraChannels()
      }
      wsSend(message.data)
    }
    sendResponse({ ok: true })
    return
  }

  if (message.type === 'set_auth_token') {
    authToken = message.token;
    authFailedBlock = false;
    log(' Received auth token from content script');
    // Clear old cached inventory before setting new token (prevents wrong user's emotes)
    emoteInventory = [];
    blockedEmotes = new Set();
    followedUsers = [];
    browser.storage.local.remove(['emote_inventory', 'blocked_emotes']);
    // Persist new token to encrypted storage
    storeToken(message.token).catch(() => {});
    // Fetch inventory now that we have token
    fetchEmoteInventory().catch(() => {});
    fetchBlockedEmotes().catch(() => {});
    fetchFollowedUsers().catch(() => {});
    // IMPORTANT: Reconnect WebSocket with new token (fixes stale auth after login switch)
    log(' 🔄 Reconnecting WebSocket with new auth token...');
    connectWebSocket().catch(() => {});
    sendResponse({ ok: true });
  } else if (message.type === 'block_emote') {
    // Async - send response when done
    blockEmote(message.hash).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'unblock_emote') {
    // Async - send response when done
    unblockEmote(message.hash).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'add_to_inventory') {
    // Async - send response when done
    addToInventory(message.emoteName, message.emoteHash, message.emoteUrl).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'remove_from_inventory') {
    // Async - send response when done
    removeFromInventory(message.emoteHash, message.emoteName).then(result => {
      sendResponse(result);
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'mute_user') {
    const expiresAt = message.expiresAt || null;
    mutedUsers.set(message.username, expiresAt);
    persistMutedUsers();
    broadcastToTabs({ type: 'user_muted', username: message.username, expiresAt });
    // Sync to server for cross-device muting
    const duration = expiresAt ? expiresAt - Date.now() : null;
    if (duration && duration > 0) wsSend({ type: 'user:mute', username: message.username, duration });
    log(' Muted user:', message.username, expiresAt ? `(expires ${new Date(expiresAt).toISOString()})` : '(permanent)');
    sendResponse({ ok: true });
  } else if (message.type === 'unmute_user') {
    mutedUsers.delete(message.username);
    persistMutedUsers();
    broadcastToTabs({ type: 'user_unmuted', username: message.username });
    // Sync to server for cross-device unmuting
    wsSend({ type: 'user:unmute', username: message.username });
    log(' Unmuted user:', message.username);
    sendResponse({ ok: true });
  } else if (message.type === 'get_muted_users') {
    sendResponse({ users: Array.from(mutedUsers.keys()) });
  } else if (message.type === 'block_user') {
    blockedUsers.add(message.username);
    browser.storage.local.set({ blocked_users: Array.from(blockedUsers) });
    broadcastToTabs({ type: 'user_blocked', username: message.username });
    log(' Blocked user:', message.username);
    sendResponse({ ok: true });
  } else if (message.type === 'unblock_user') {
    blockedUsers.delete(message.username);
    browser.storage.local.set({ blocked_users: Array.from(blockedUsers) });
    broadcastToTabs({ type: 'user_unblocked', username: message.username });
    log(' Unblocked user:', message.username);
    sendResponse({ ok: true });
  } else if (message.type === 'get_blocked_users') {
    sendResponse({ users: Array.from(blockedUsers) });
  } else if (message.type === 'get_twitch_auth_token') {
    // Cross-domain Twitch cookie access (for sending from Kick/YouTube pages)
    Promise.all([
      browser.cookies.get({ url: 'https://www.twitch.tv', name: 'auth-token' }),
      browser.cookies.get({ url: 'https://www.twitch.tv', name: 'name' })
    ]).then(([tokenCookie, nameCookie]) => {
      sendResponse({
        token: tokenCookie?.value || null,
        username: nameCookie?.value ? decodeURIComponent(nameCookie.value).toLowerCase() : (userInfo?.twitch_username || null)
      });
    }).catch(() => sendResponse({ token: null, username: null }));
    return true;
  } else if (message.type === 'get_inventory') {
    // Async - wait for init to complete first
    (async () => {
      if (initPromise) {
        await initPromise;
      }
      log(' Background: get_inventory request - responding with', emoteInventory.length, 'personal,', globalEmotes.length, 'global');
      sendResponse({
        emotes: emoteInventory,
        globalEmotes: globalEmotes,
        blocked: Array.from(blockedEmotes)
      });
    })();
    return true; // Keep channel open for async response
  } else if (message.type === 'get_followed_users') {
    sendResponse({
      users: followedUsers
    });
    return true;
  } else if (message.type === 'get_live_followed') {
    // Cached snapshot from background poll — popup/content can read instantly
    sendResponse({
      snapshot: _liveFollowedSnapshot,
      count: _liveFollowedCount,
    });
    return true;
  } else if (message.type === 'refresh_followed_users') {
    // Triggered after a follow/unfollow action elsewhere — re-fetches the
    // canonical list from server and re-runs live poll so badge/notifications
    // reflect the change immediately.
    fetchFollowedUsers().catch(() => {})
    sendResponse({ ok: true })
    return true;
  } else if (message.type === 'refresh_live_followed') {
    // Force a fresh poll (e.g., user manually pulls to refresh)
    if (typeof pollFollowedLive === 'function') {
      pollFollowedLive().then(() => {
        sendResponse({ snapshot: _liveFollowedSnapshot, count: _liveFollowedCount })
      }).catch(() => sendResponse({ snapshot: [], count: 0 }))
    } else {
      sendResponse({ snapshot: [], count: 0 })
    }
    return true;
  } else if (message.type === 'join_channel') {
    // Content script detected channel change — wait for init so cached channel emotes are available
    log(' 📺 Content script requesting channel join:', message.platform, '/', message.channel, 'id:', message.channelId)
    ;(async () => {
      if (initPromise) await initPromise;
      joinChannel(message.platform, message.channel, message.channelId, sender.tab?.id)
      sendResponse({ received: true })
    })();
    return true; // Keep channel open for async response
  } else if (message.type === 'update_channel_id') {
    // Content script late-discovered the Twitch channel ID via early-inject MAIN-world.
    // Cache it so subsequent fetches skip the GQL roundtrip; if current fetch is in flight
    // without an ID, it stays in flight (we don't abort) but emote map will refresh on next nav.
    if (message.channel && message.channelId) {
      const ch = message.channel.toLowerCase()
      twitchIdCache.set(ch, String(message.channelId))
      log(' 📺 Late channel ID cached:', ch, '→', message.channelId)
    }
    sendResponse({ ok: true })
    return true
  } else if (message.type === 'emote_sent') {
    // Content script detected user sent emote
    log(' 💬 Content script detected emote sent:', message.emoteName);
    const result = broadcastEmoteUsage(message.emoteName, message.emoteHash, sender.tab?.id)
    log(' 📤 Broadcast result:', result)
    sendResponse(result || { success: false, reason: 'unknown' })
    return true; // Keep channel open for response
  } else if (message.type === 'get_channel_emotes') {
    // Multichat/content requesting channel emotes (may have missed the broadcast)
    const totalEmotes = Object.values(channelEmotesMap).reduce((sum, e) => sum + (Array.isArray(e) ? e.length : 0), 0);
    if (totalEmotes > 0) {
      browser.storage.local.set({ channel_emotes_map: getStorableChannelEmotes(), channel_emotes_fetched_at: channelEmotesFetchedAt });
      for (const [ch, emotes] of Object.entries(channelEmotesMap)) {
        if (Array.isArray(emotes)) broadcastToTabs({ type: 'channel_emotes_update', emotes, channelOwner: ch });
      }
    }
    sendResponse({ count: totalEmotes });
  } else if (message.type === 'get_picker_emotes') {
    // heatsync-button emote picker requests all emote data from background cache
    // avoids duplicate API fetches — background already has everything loaded
    ;(async () => {
      if (initPromise) await initPromise
      const channel = message.channel?.toLowerCase()
      let chEmotes = channel && Array.isArray(channelEmotesMap[channel]) ? channelEmotesMap[channel] : null
      // if channel emotes not yet cached, trigger fetch and wait (up to 8s)
      if (channel && !chEmotes && channelEmotesMap[channel] !== 'loading') {
        fetchChannelOwnerEmotes(channel, null, message.platform || (sender?.url?.includes('kick.com') ? 'kick' : 'twitch'))
      }
      if (channel && !chEmotes) {
        // wait for the sentinel to resolve (loading → array)
        const deadline = Date.now() + 8000
        await new Promise(resolve => {
          const poll = trackInterval(setInterval(() => {
            if (Array.isArray(channelEmotesMap[channel]) || Date.now() > deadline) {
              clearInterval(poll)
              untrackInterval(poll)
              resolve()
            }
          }, 100))
        })
        chEmotes = Array.isArray(channelEmotesMap[channel]) ? channelEmotesMap[channel] : []
      }
      sendResponse({
        channelEmotes: chEmotes || [],
        globalEmotes: globalEmotes,
        inventoryEmotes: emoteInventory,
        blocked: Array.from(blockedEmotes)
      })
    })()
    return true
  } else if (message.type === 'refresh_all') {
    // Refresh all emotes (called from popup)
    (async () => {
      await Promise.all([
        fetchGlobalEmotes(),
        fetchEmoteInventory(),
        fetchBlockedEmotes(),
        fetchUserInfo()
      ]);
      sendResponse({ success: true });
    })();
    return true;
  } else if (message.type === 'clear_blocked') {
    // Clear all blocked emotes (both server-synced and local)
    blockedEmotes.clear()
    localBlockedEmotes.clear()
    browser.storage.local.set({ blocked_emotes: [], local_blocked_emotes: [] })
    broadcastToTabs({ type: 'blocked_update', blocked: [] })
    ;(async () => {
      const token = await getAuthCookie()
      if (token) {
        fetchWithTimeout(`${API_URL}/api/user/emotes/blocks/clear`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.body?.cancel()).catch(err => log(' Clear blocked emotes failed:', err?.message))
      }
      sendResponse({ success: true })
    })()
    return true
  } else if (message.type === 'notifs_viewed') {
    unreadNotifCount = 0;
    updateExtensionBadge();
  } else if (message.type === 'get_follow_history') {
    // Content scripts request cached follow history (handles race condition on load)
    sendResponse({
      history: cachedFollowHistory,
      colors: cachedFollowColors
    });
    return true; // Required for Firefox — sendResponse ignored without this
  } else if (message.type === 'kick_resolve_channel') {
    // Resolve Kick channel slug → numeric channelId
    (async () => {
      try {
        const slug = message.slug?.toLowerCase()
        if (!slug) { sendResponse({ ok: false, error: 'no slug' }); return }
        const cached = kickChannelIdCache.get(slug)
        if (cached) { sendResponse({ channelId: cached }); return }
        const resp = await fetchWithTimeout(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`)
        if (!resp.ok) { sendResponse({ ok: false, error: `kick api ${resp.status}` }); return }
        const data = await resp.json()
        const channelId = data?.id
        if (!channelId) { sendResponse({ ok: false, error: 'no channel id' }); return }
        // LRU cache (cap 100)
        if (kickChannelIdCache.size >= 100) {
          const oldest = kickChannelIdCache.keys().next().value
          kickChannelIdCache.delete(oldest)
        }
        kickChannelIdCache.set(slug, channelId)
        sendResponse({ channelId })
      } catch (e) {
        sendResponse({ ok: false, error: e.message })
      }
    })()
    return true

  } else if (message.type === 'kick_send_message') {
    // Route Kick chat send through a kick.com tab (same-origin cookies)
    (async () => {
      try {
        const { channelId, content } = message
        if (!channelId || !content) { sendResponse({ ok: false, error: 'missing params' }); return }
        // Get XSRF token from Kick cookies
        const cookie = await browser.cookies.get({ url: 'https://kick.com', name: 'XSRF-TOKEN' })
        if (!cookie?.value) { sendResponse({ ok: false, error: 'kick_not_logged_in' }); return }
        // Find a kick.com tab to relay through
        const tabs = await browser.tabs.query({ url: '*://*.kick.com/*' })
        if (!tabs || tabs.length === 0) { sendResponse({ ok: false, error: 'no_kick_tab' }); return }
        // Relay to first kick.com tab
        const result = await browser.tabs.sendMessage(tabs[0].id, {
          type: 'kick_send_relay',
          channelId,
          content,
          xsrfToken: cookie.value
        })
        sendResponse(result || { ok: false, error: 'no response from tab' })
      } catch (e) {
        log('kick_send_message error:', e.message)
        sendResponse({ ok: false, error: e.message })
      }
    })()
    return true

  } else if (message.type === 'youtube_send_message') {
    (async () => {
      try {
        const { text } = message
        if (!text) { sendResponse({ ok: false, error: 'missing params' }); return }
        // Prefer the sender's own tab — multichat usually lives on the same
        // YouTube tab whose iframe owns the live_chat. Falls back to the
        // active YouTube tab in the focused window, then any YouTube tab.
        const senderTabId = sender?.tab?.id
        let targetTabId = null
        if (senderTabId) {
          const t = await browser.tabs.get(senderTabId).catch(() => null)
          if (t && /youtube\.com/.test(t.url || '')) targetTabId = senderTabId
        }
        if (!targetTabId) {
          const active = await browser.tabs.query({ active: true, currentWindow: true, url: '*://www.youtube.com/*' }).catch(() => [])
          if (active && active.length > 0) targetTabId = active[0].id
        }
        if (!targetTabId) {
          const tabs = await browser.tabs.query({ url: '*://www.youtube.com/*' })
          if (!tabs || tabs.length === 0) { sendResponse({ ok: false, error: 'no_youtube_tab' }); return }
          targetTabId = tabs[0].id
        }
        const result = await browser.tabs.sendMessage(targetTabId, {
          type: 'youtube_send_relay',
          text
        })
        sendResponse(result || { ok: false, error: 'no response from tab' })
      } catch (e) {
        log('youtube_send_message error:', e.message)
        sendResponse({ ok: false, error: e.message })
      }
    })()
    return true

  } else if (message.type === 'api_fetch') {
    // Generic API proxy — content scripts route through here to bypass CORS
    // Strict path validation: catch literal `..` AND URL-encoded variants
    // (%2e%2e, %2E, etc) by decoding before the check
    let _decodedPath
    try { _decodedPath = decodeURIComponent(message.path || '') } catch { _decodedPath = '' }
    if (!message.path || !message.path.startsWith('/api/') || /\.\./.test(_decodedPath)) {
      sendResponse({ ok: false, error: 'invalid path' });
      return true;
    }
    const ALLOWED_METHODS = new Set(['GET','POST','PUT','PATCH','DELETE'])
    const reqMethod = String(message.method || 'GET').toUpperCase()
    if (!ALLOWED_METHODS.has(reqMethod)) {
      sendResponse({ ok: false, error: 'invalid method' })
      return true
    }
    ;(async () => {
      const doFetch = async (token) => {
        const opts = { method: reqMethod, headers: {} }
        if (message.auth && token) opts.headers['Authorization'] = `Bearer ${token}`
        if (message.body) {
          opts.headers['Content-Type'] = 'application/json'
          opts.body = JSON.stringify(message.body)
        }
        const resp = await fetchWithTimeout(`${API_URL}${message.path}`, opts)
        const data = await resp.json().catch(() => null)
        return { resp, data }
      }
      try {
        let token = message.auth ? (authToken || await getAuthCookie()) : null
        let { resp, data } = await doFetch(token)
        // Self-heal: on 401 with auth, the in-memory/encrypted token may be
        // stale (e.g. JWT issued before user linked Twitch). Re-read directly
        // from the heatsync auth cookie (which the website refreshes on every
        // login), refresh storage, and retry once.
        if (message.auth && resp.status === 401) {
          try {
            const cookie = await browser.cookies.get({ url: 'https://heatsync.org', name: 'auth' })
            if (cookie?.value && cookie.value !== token) {
              log(' [api_fetch] 401 — refreshing token from cookie and retrying')
              authToken = cookie.value
              await storeToken(cookie.value)
              ;({ resp, data } = await doFetch(cookie.value))
            }
          } catch (err) {
            log(' [api_fetch] cookie refresh failed:', err?.message)
          }
        }
        if (!resp.ok) {
          sendResponse({ ok: false, status: resp.status, error: data?.error || `${resp.status}` })
          return
        }
        sendResponse(data?.ok !== undefined ? data : { ok: true, data })
      } catch (err) {
        sendResponse({ ok: false, error: err.message })
      }
    })()
    return true
  } else if (message.type === 'register_self_twitch_id') {
    // Content script discovered the user's own twitch ID. Subscribe to 7TV
    // EventAPI so badge/paint changes push in real-time (no polling needed).
    if (message.twitchId && /^\d+$/.test(String(message.twitchId))) {
      ensureSelfCosmeticSub(String(message.twitchId))
    }
    sendResponse({ ok: true })
    return false
  } else if (message.type === 'get_user_cosmetics') {
    const ids = (message.twitchIds || []).slice(0, 25)
    ;(async () => {
      const result = {}
      const toFetch = []
      for (const id of ids) {
        const cached = userCosmeticsCache.get(id)
        // Negative cache (no paint AND no badge) gets a shorter TTL so newly-added
        // 7TV badges/paints show up within 5 min instead of waiting 30 min.
        const isNegative = cached && !cached.paint && !cached.badge
        const ttl = isNegative ? COSMETICS_NEGATIVE_TTL : USER_COSMETICS_TTL
        if (cached && Date.now() - cached.fetchedAt < ttl) {
          result[id] = { paint: cached.paint, badge: cached.badge }
        } else {
          toFetch.push(id)
        }
      }
      await Promise.all(toFetch.map(async (id) => {
        try {
          const resp = await fetchWithTimeout(`https://7tv.io/v3/users/twitch/${id}`)
          if (!resp.ok) { setUserCosmetic(id, null); result[id] = null; return }
          const data = await resp.json()
          const ids7tv = extract7TVCosmeticIds(data)
          const cosmetic = await resolve7TVCosmeticIds(ids7tv)
          setUserCosmetic(id, cosmetic)
          result[id] = cosmetic
        } catch (e) { setUserCosmetic(id, null); result[id] = null }
      }))
      sendResponse({ cosmetics: result })
    })()
    return true
  } else if (message.type === 'get_kick_user_cosmetics') {
    const usernames = (message.kickUsernames || []).slice(0, 10)
    ;(async () => {
      const result = {}
      await Promise.all(usernames.map(async (username) => {
        const cacheKey = `kick:${username}`
        const cached = userCosmeticsCache.get(cacheKey)
        const isNegative = cached && !cached.paint && !cached.badge
        const ttl = isNegative ? COSMETICS_NEGATIVE_TTL : USER_COSMETICS_TTL
        if (cached && Date.now() - cached.fetchedAt < ttl) {
          result[username] = { paint: cached.paint, badge: cached.badge, twitchId: cached.twitchId || null }
          return
        }
        try {
          const resp = await fetchWithTimeout(`https://7tv.io/v3/users/kick/${username}`)
          if (!resp.ok) { setUserCosmetic(cacheKey, null); result[username] = null; return }
          const data = await resp.json()
          const ids7tv = extract7TVCosmeticIds(data)
          const cosmetic = await resolve7TVCosmeticIds(ids7tv)
          const twitchConn = data?.user?.connections?.find(c => c.platform === 'TWITCH')
          const twitchId = twitchConn?.id || null
          const full = cosmetic ? { ...cosmetic, twitchId } : { paint: null, badge: null, twitchId }
          setUserCosmetic(cacheKey, full)
          result[username] = full
        } catch (e) { setUserCosmetic(cacheKey, null); result[username] = null }
      }))
      sendResponse({ cosmetics: result })
    })()
    return true
  } else if (message.type === 'get_sender_emotes') {
    // Per-sender 7TV + BTTV personal-set fetch. Used by content script to lazy-resolve
    // each unseen sender's emotes once and cache write-once-per-(sender, name) forever.
    // Input:  senderKeys: ["twitch:12345", "kick:somebody", "yt:abcd", ...]
    // Output: { emotes: { "twitch:12345": { "67": {url, source, zeroWidth, hash}, ... }, ... } }
    // Empty inner object = sender has no personal set (caller still caches the miss to avoid refetch).
    const senderKeys = (message.senderKeys || []).slice(0, 30)
    ;(async () => {
      const result = {}
      // Cache hits inside this background instance (cross-tab dedupe). 6h TTL.
      // Per-name perma is enforced on the content side via mergeSenderEmotes.
      if (!globalThis.__senderEmoteCache) globalThis.__senderEmoteCache = new Map()
      const cache = globalThis.__senderEmoteCache
      const SENDER_EMOTE_CACHE_TTL = 21600000 // 6h
      await Promise.all(senderKeys.map(async (key) => {
        const hit = cache.get(key)
        if (hit && Date.now() - hit.ts < SENDER_EMOTE_CACHE_TTL) {
          result[key] = hit.emotes
          return
        }
        const colon = key.indexOf(':')
        if (colon < 0) { result[key] = {}; return }
        const platform = key.slice(0, colon)
        const id = key.slice(colon + 1)
        if (!id) { result[key] = {}; return }
        const collected = {}
        // 7TV — twitch + kick supported by /users/{platform}/{id}; "yt" key falls
        // back to twitch-id which arrives once ytNameToTwitchId resolves.
        const sevenTvPath = platform === 'kick' ? `kick/${encodeURIComponent(id)}` : `twitch/${encodeURIComponent(id)}`
        const fetches = [
          fetchWithTimeout(`https://7tv.io/v3/users/${sevenTvPath}`).then(r => r.ok ? r.json() : null).catch(() => null)
        ]
        // BTTV — only twitch-id endpoint. Skip for kick/yt.
        if (platform === 'twitch' && /^\d+$/.test(id)) {
          fetches.push(
            fetchWithTimeout(`https://api.betterttv.net/3/cached/users/twitch/${id}`).then(r => r.ok ? r.json() : null).catch(() => null)
          )
        }
        const [stv, bttv] = await Promise.all(fetches)
        // 7TV personal emote_set
        const stvEmotes = stv?.emote_set?.emotes || []
        for (const e of stvEmotes) {
          if (!e?.name || !e?.id) continue
          const flags = (e.flags || 0) | (e.data?.flags || 0)
          collected[e.name] = {
            url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
            source: '7tv',
            state: 'global',
            zeroWidth: !!(flags & 257),
            hash: e.id
          }
        }
        // BTTV personal — channelEmotes + sharedEmotes
        if (bttv) {
          const all = [...(bttv.channelEmotes || []), ...(bttv.sharedEmotes || [])]
          for (const e of all) {
            if (!e?.code || !e?.id) continue
            if (collected[e.code]) continue // 7TV wins on collision
            collected[e.code] = {
              url: `https://cdn.betterttv.net/emote/${e.id}/1x.webp`,
              source: 'bttv',
              state: 'global',
              zeroWidth: false,
              hash: e.id
            }
          }
        }
        cache.set(key, { emotes: collected, ts: Date.now() })
        // LRU evict: keep most-recent 5000
        if (cache.size > 5000) cache.delete(cache.keys().next().value)
        result[key] = collected
      }))
      sendResponse({ emotes: result })
    })()
    return true
  } else if (message.type === 'get_bulk_badges') {
    const bttvObj = {}
    for (const [k, v] of bttvBadgeMap) bttvObj[k] = v
    const ffzObj = {}
    for (const [k, v] of ffzBadgeMap) ffzObj[k] = v
    const chatterinoObj = {}
    for (const [k, v] of chatterinoBadgeMap) chatterinoObj[k] = v
    sendResponse({ bttvBadges: bttvObj, ffzBadges: ffzObj, chatterinoBadges: chatterinoObj })
    return
  } else if (message.type === 'mention_detected') {
    // Fire a browser notification if the user has hs_notifications enabled
    browser.storage.local.get('hs_notifications').then(data => {
      if (!data.hs_notifications) return
      if (!browser.notifications) return
      const notifId = 'hs-mention-' + Date.now()
      browser.notifications.create(notifId, {
        type: 'basic',
        iconUrl: browser.runtime.getURL('icon-128.png'),
        title: message.username || 'mention',
        message: message.text || ''
      }).catch(() => {})
    }).catch(() => {})
    sendResponse({ ok: true })
    return
  }
}

// Initialize on startup
async function initialize() {
  log(' 🚀 Starting background script...');

  // Run auth load + storage batch reads + session restore in PARALLEL — all independent.
  // Saves ~60-90ms of serial waits vs. awaiting them sequentially.
  const tokenP = getAuthCookie().catch(err => { log(' Could not load auth token:', err.message); return null })
  const storedP = browser.storage.local.get([
    'user_info', 'channel_emotes_fetched_at', 'channel_emotes_map', 'seventv_emote_set_ids',
    'muted_users', 'blocked_users', 'global_emotes', 'emote_inventory', 'blocked_emotes',
    'local_blocked_emotes', 'youtube_channel_urls', 'yt_video_to_channel', 'joined_extra_channels', 'heatsync_multichat', 'badges_fetched_at',
    'bttv_badge_map', 'ffz_badge_map', 'chatterino_badge_map', 'user_cosmetics_cache'
  ]).catch(err => { log(' Storage restore failed:', err.message); return {} })
  const sessionP = (browser.storage.session?.get(['tab_channels', 'joined_extra_channels']) ?? Promise.resolve(null))
    .catch(e => { console.warn('session storage restore failed:', e); return null })

  // Kick off WebSocket connect AS SOON AS auth resolves — don't wait for storage to finish.
  // If no auth token, surface that to content scripts so the multichat panel can prompt
  // the user. cookies.onChanged will broadcast loggedIn:true once they sign in.
  tokenP.then(t => {
    if (!t) broadcastToTabs({ type: 'auth_changed', loggedIn: false, reason: 'no_token' })
    return connectWebSocket()
  }).catch(() => {})

  // Batch-load all cached state from storage in ONE read
  try {
    const stored = await storedP;

    if (stored.user_info?.username) {
      currentUsername = stored.user_info.username;
      log(' ✓ Restored username:', currentUsername);
    }
    if (stored.channel_emotes_fetched_at && typeof stored.channel_emotes_fetched_at === 'object') {
      channelEmotesFetchedAt = stored.channel_emotes_fetched_at;
      log(' ✓ Restored channelEmotesFetchedAt for', Object.keys(channelEmotesFetchedAt).length, 'channels');
    }
    if (stored.channel_emotes_map && typeof stored.channel_emotes_map === 'object') {
      Object.assign(channelEmotesMap, stored.channel_emotes_map);
      updateEmoteUrlMap();
      log(' ✓ Restored channelEmotesMap for', Object.keys(stored.channel_emotes_map).length, 'channels');
    }
    if (stored.seventv_emote_set_ids && typeof stored.seventv_emote_set_ids === 'object') {
      for (const [ch, id] of Object.entries(stored.seventv_emote_set_ids)) {
        seventvEmoteSetIds.set(ch, id);
      }
      if (seventvEmoteSetIds.size > 0) {
        log(' ✓ Restored seventvEmoteSetIds for', seventvEmoteSetIds.size, 'channels');
        start7TVPolling();
        for (const setId of seventvEmoteSetIds.values()) subscribe7TVEmoteSet(setId);
      }
    }
    if (stored.muted_users && Array.isArray(stored.muted_users)) {
      mutedUsers = new Map();
      for (const entry of stored.muted_users) {
        if (typeof entry === 'string') mutedUsers.set(entry, null);
        else if (entry?.username) mutedUsers.set(entry.username, entry.expiresAt || null);
      }
      if (stored.muted_users.length > 0 && typeof stored.muted_users[0] === 'string') persistMutedUsers();
      pruneExpiredMutes();
      log(' ✓ Loaded', mutedUsers.size, 'muted users');
    }
    if (stored.blocked_users && Array.isArray(stored.blocked_users)) {
      blockedUsers = new Set(stored.blocked_users);
      log(' ✓ Loaded', blockedUsers.size, 'blocked users');
    }
    // Warm emote arrays from storage cache (instant availability while API fetches run)
    if (stored.global_emotes?.length) {
      globalEmotes = stored.global_emotes;
      log(' ✓ Warm cache:', globalEmotes.length, 'global emotes from storage');
    }
    if (stored.emote_inventory?.length) {
      emoteInventory = stored.emote_inventory;
      log(' ✓ Warm cache:', emoteInventory.length, 'inventory emotes from storage');
    }
    if (stored.blocked_emotes?.length) {
      blockedEmotes = new Set(stored.blocked_emotes);
      log(' ✓ Warm cache:', blockedEmotes.size, 'blocked emotes from storage');
    }
    if (stored.local_blocked_emotes && Array.isArray(stored.local_blocked_emotes)) {
      localBlockedEmotes = new Set(stored.local_blocked_emotes);
      log(' ✓ Warm cache:', localBlockedEmotes.size, 'local blocked emotes from storage');
    }
    if (stored.youtube_channel_urls && typeof stored.youtube_channel_urls === 'object') {
      Object.assign(youtubeChannelUrls, stored.youtube_channel_urls);
      log(' ✓ Restored youtubeChannelUrls for', Object.keys(youtubeChannelUrls).length, 'channels');
    }
    if (stored.yt_video_to_channel && typeof stored.yt_video_to_channel === 'object') {
      // Restore videoId→channelId routing so chat msgs from existing pollers
      // (server already broadcasting) land on the right tab even when the
      // server doesn't re-echo youtube:status connected on SW wake.
      for (const [vid, cid] of Object.entries(stored.yt_video_to_channel)) ytVideoToChannel.set(vid, cid);
      log(' ✓ Restored ytVideoToChannel for', ytVideoToChannel.size, 'videos');
    }
    if (Array.isArray(stored.joined_extra_channels)) {
      // Restore Kick channel joins so the WS-connect handler replays them.
      // Survives extension reload (session storage didn't), so re-subscribes
      // fire automatically without waiting for a content-script re-init.
      for (const key of stored.joined_extra_channels) joinedExtraChannels.add(key)
      log(' ✓ Restored', joinedExtraChannels.size, 'extra channel joins from local storage')
      // Replay joins on the WS now — connectWebSocket() was kicked off at the
      // start of init, so by the time storage restore finishes, the WS connect
      // handler may have ALREADY iterated an empty joinedExtraChannels Set.
      // wsSend queues if socket isn't open yet, sends immediately if it is —
      // either way, server gets the rejoin without waiting for content-script
      // multichat re-init.
      for (const key of joinedExtraChannels) {
        const [platform, channel] = key.split('/')
        if (platform && channel) wsSend({ type: 'channel:join', platform, channel })
      }
    }
    // Also seed joinedExtraChannels from the user's multichat config — covers
    // the very first launch after install (or storage wipe) before any content
    // script has fired kickChat.join. Without this, kick subs only start
    // working AFTER the user opens a streaming tab, not at SW boot.
    if (stored.heatsync_multichat?.channels) {
      const cfg = stored.heatsync_multichat.channels
      for (const ch of cfg) {
        if (typeof ch === 'string') continue
        if (ch.kick && typeof ch.kick === 'string') {
          const key = `kick/${ch.kick.toLowerCase()}`
          if (!joinedExtraChannels.has(key)) {
            joinedExtraChannels.add(key)
            wsSend({ type: 'channel:join', platform: 'kick', channel: ch.kick.toLowerCase() })
          }
        }
      }
      saveJoinedExtraChannels()
    }
    if (stored.badges_fetched_at && typeof stored.badges_fetched_at === 'number') {
      badgesFetchedAt = stored.badges_fetched_at;
      log(' ✓ Restored badgesFetchedAt:', new Date(badgesFetchedAt).toISOString());
    }
    if (stored.user_cosmetics_cache && Array.isArray(stored.user_cosmetics_cache)) {
      const now = Date.now()
      let restored = 0
      for (const [key, val] of stored.user_cosmetics_cache) {
        if (!val?.fetchedAt) continue
        // Negative entries (no paint AND no badge) get the shorter TTL on
        // restore too — otherwise a stale null badge cache would suppress a
        // newly-granted 7TV badge for up to 30 min after extension reload.
        const isNegative = !val.paint && !val.badge
        const ttl = isNegative ? COSMETICS_NEGATIVE_TTL : USER_COSMETICS_TTL
        if (now - val.fetchedAt < ttl) {
          userCosmeticsCache.set(key, val)
          restored++
        }
      }
      if (restored > 0) log(' ✓ Warm cache:', restored, 'user cosmetics from storage')
    }
    // Warm-cache 3rd-party badge maps so badges render immediately on cold start
    if (stored.bttv_badge_map && typeof stored.bttv_badge_map === 'object') {
      bttvBadgeMap = new Map(Object.entries(stored.bttv_badge_map))
      log(' ✓ Warm cache:', bttvBadgeMap.size, 'BTTV badge entries from storage')
    }
    if (stored.ffz_badge_map && typeof stored.ffz_badge_map === 'object') {
      ffzBadgeMap = new Map(Object.entries(stored.ffz_badge_map))
      log(' ✓ Warm cache:', ffzBadgeMap.size, 'FFZ badge entries from storage')
    }
    if (stored.chatterino_badge_map && typeof stored.chatterino_badge_map === 'object') {
      chatterinoBadgeMap = new Map(Object.entries(stored.chatterino_badge_map))
      log(' ✓ Warm cache:', chatterinoBadgeMap.size, 'Chatterino badge entries from storage')
    }
  } catch (err) {
    log(' Storage restore failed:', err.message);
  }

  // Restore tabChannels from session storage (survives worker restarts) — already in flight from initialize()
  try {
    const session = await sessionP
    if (session?.tab_channels) {
      // Validate restored tab IDs still exist
      const allTabs = await browser.tabs.query({ url: ['*://*.twitch.tv/*', '*://*.kick.com/*', '*://*.youtube.com/*'] })
      const validIds = new Set(allTabs.map(t => t.id))
      for (const [tabId, entry] of Object.entries(session.tab_channels)) {
        const id = Number(tabId)
        if (validIds.has(id)) tabChannels.set(id, entry)
      }
      log(' ✓ Restored', tabChannels.size, 'tab channels from session storage')
    }
    if (Array.isArray(session?.joined_extra_channels)) {
      // Migration path — old code persisted to session. Pull anything still
      // there and bake it into the local-storage-backed Set on next save.
      for (const key of session.joined_extra_channels) joinedExtraChannels.add(key)
    }
  } catch (e) {
    console.warn('session storage restore failed:', e)
  }

  // Broadcast warm-cached badges immediately (before fresh fetch)
  if (bttvBadgeMap.size > 0 || ffzBadgeMap.size > 0 || chatterinoBadgeMap.size > 0) {
    broadcastBadgeMaps()
  }

  // Start WebSocket immediately (don't wait for API fetches)
  connectWebSocket().catch(() => {});

  broadcastToTabs({ type: 'loading_status', text: 'loading emotes...' });

  // Fetch fresh data in parallel (updates warm cache)
  Promise.all([
    fetchGlobalEmotes(),
    fetchBulkBadges(),
    fetchEmoteInventory(),
    fetchBlockedEmotes(),
    fetchFollowedUsers(),
    fetchUserInfo()
  ]).then(() => {
    log(' ✓ All fetches complete - global:', globalEmotes.length, 'personal:', emoteInventory.length);
    broadcastToTabs({ type: 'loading_status', done: true });
    // Persist fresh data — single batched write (fire-and-forget, don't await)
    const persist = {
      global_emotes: globalEmotes,
      emote_inventory: emoteInventory,
      blocked_emotes: Array.from(blockedEmotes)
    }
    if (pendingUserInfoToPersist) {
      persist.user_info = pendingUserInfoToPersist
      pendingUserInfoToPersist = null
    }
    browser.storage.local.set(persist).catch(() => {});
  }).catch(err => log(' Fetch error:', err.message));

  // Re-register push subscription after MV3 service worker restart.
  // The cookie-onChanged path only fires on login/logout; on cold SW wake
  // with an existing valid token, push must be re-confirmed against the server
  // so the endpoint stays active.
  if (authToken) {
    subscribeToPush(authToken).catch(err => log(' subscribeToPush retry failed:', err?.message))
  }

  // Inventory refresh driven by chrome.alarms 'refresh-emote-inventory' (MV3 setInterval dies with SW)

  // Global emotes refresh handled by chrome.alarms (MV3 setInterval unreliable for long durations)

}

log(' 🚀 Calling initialize()...');
initPromise = initialize().catch(err => {
  console.error('[heatsync] Initialize failed:', err);
  recordCrash('bg', err?.message || String(err), err?.stack || '', 'initialize')
});

// ============================================
// CRASH TELEMETRY (opt-in)
// ============================================
// Captures unhandled errors to chrome.storage.local, capped at 50.
// User views/copies via options page. Upload to server requires explicit opt-in
// via ui_settings.shareCrashReports — endpoint stubbed for future use.
const CRASH_LOG_KEY = 'hs_crash_log'
const CRASH_LOG_MAX = 50

async function recordCrash(source, message, stack, url) {
  try {
    if (!message) return
    const entry = {
      ts: Date.now(),
      source,
      message: String(message).slice(0, 500),
      stack: String(stack || '').slice(0, 2000),
      url: String(url || '').slice(0, 200)
    }
    const stored = await browser.storage.local.get(CRASH_LOG_KEY)
    const log = Array.isArray(stored[CRASH_LOG_KEY]) ? stored[CRASH_LOG_KEY] : []
    // Dedup consecutive identical messages (don't spam log when one bug fires repeatedly)
    if (log.length > 0 && log[log.length - 1].message === entry.message) {
      log[log.length - 1].ts = entry.ts
      log[log.length - 1].count = (log[log.length - 1].count || 1) + 1
    } else {
      log.push(entry)
    }
    while (log.length > CRASH_LOG_MAX) log.shift()
    await browser.storage.local.set({ [CRASH_LOG_KEY]: log })
  } catch (e) { /* swallow — telemetry must never crash the SW */ }
}

// ============================================
// WEB PUSH SUBSCRIPTION
// ============================================
// MV3: service workers support PushManager via self.registration.pushManager.
// Firefox MV2 background pages also support PushManager (FF 109+).
// Notification.permission check is skipped — extensions have implicit grant
// via the 'notifications' manifest permission.

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const out = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i)
  return out
}

async function subscribeToPush(token) {
  try {
    if (!self.registration?.pushManager) {
      log(' PushManager not available — skipping push subscription')
      return
    }
    const existing = await self.registration.pushManager.getSubscription()
    if (existing) {
      log(' Push already subscribed:', existing.endpoint.slice(0, 40) + '...')
      return
    }
    const keyRes = await fetchWithTimeout(`${API_URL}/api/push/vapid-key`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!keyRes.ok) {
      log(' VAPID key fetch failed:', keyRes.status)
      return
    }
    const keyData = await keyRes.json()
    const vapidKey = keyData.key
    if (!vapidKey) {
      log(' VAPID key missing in response')
      return
    }
    const sub = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(vapidKey)
    })
    const subJson = sub.toJSON()
    const subRes = await fetchWithTimeout(`${API_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: subJson.endpoint,
        keys: { p256dh: subJson.keys.p256dh, auth: subJson.keys.auth }
      })
    })
    if (!subRes.ok) {
      log(' Push subscribe POST failed:', subRes.status)
      return
    }
    log(' Push subscription registered')
  } catch (err) {
    log(' subscribeToPush error:', err?.message)
  }
}

async function unsubscribeFromPush(token) {
  try {
    if (!self.registration?.pushManager) return
    const sub = await self.registration.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    if (token) {
      await fetchWithTimeout(`${API_URL}/api/push/unsubscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ endpoint })
      }).catch(err => log(' push unsubscribe POST failed:', err?.message))
    }
    log(' Push subscription removed')
  } catch (err) {
    log(' unsubscribeFromPush error:', err?.message)
  }
}

// Receive a push message and show a notification
self.addEventListener('push', (ev) => {
  let title = 'HeatSync'
  let body = ''
  // Use runtime.getURL so the icon resolves inside the extension package
  let icon = browser.runtime.getURL('icon-48.png')
  let data = {}
  try {
    if (ev.data) {
      const payload = ev.data.json()
      title = payload.title || title
      body = payload.body || body
      // Don't accept payload.icon — would let server set arbitrary URLs
      data = payload.data || {}
    }
  } catch (e) {
    body = ev.data?.text() || ''
  }
  ev.waitUntil(
    self.registration.showNotification(title, { body, icon, data })
  )
})

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close()
  const url = ev.notification.data?.url
  // Only open URLs on our own origin — server payloads are untrusted
  if (typeof url === 'string' && url.startsWith('https://heatsync.org/')) {
    ev.waitUntil(clients.openWindow(url))
  }
})

self.addEventListener('error', (ev) => {
  recordCrash('bg', ev.message, ev.error?.stack, ev.filename)
})
self.addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason
  recordCrash('bg', r?.message || String(r), r?.stack, '')
})
