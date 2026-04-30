/**
 * Heatsync MultiChat - FFZ-style React-aware implementation
 *
 * KEY PRINCIPLE: Work WITHIN React, not around it.
 * - Never manipulate DOM after React renders
 * - Hook into React components and modify render output
 * - Use forceUpdate() to trigger re-renders
 * - Inject UI as React children, not DOM insertions
 */

(function() {
  'use strict';

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

  // Safe runtime.sendMessage wrapper (context invalidation guard, Firefox-compatible).
  // Retries once on cold SW wake — MV3 service workers sleep after ~30s idle and the
  // first message after sleep can fail with "Could not establish connection" before
  // the SW finishes waking. Without this retry, the first user action after idle
  // (channel switch, send message, mute) silently no-ops.
  function safeSendMessage(message) {
    return _trySendMessageOnce(message, 0)
  }
  async function _trySendMessageOnce(message, attempt) {
    try {
      return await api.runtime.sendMessage(message)
    } catch (e) {
      const err = e?.message || ''
      // Context invalidated = extension reloaded. The 30s health-ping at
      // ~line 7289 will trigger location.reload() on next tick; just bail.
      if (err.includes('Extension context invalidated')) {
        return { ok: false, error: 'context invalidated' }
      }
      // Cold-wake retry: SW was asleep, port not yet attached on first try.
      if (attempt === 0 && (err.includes('Could not establish connection') || err.includes('Receiving end does not exist'))) {
        await new Promise(r => setTimeout(r, 80))
        return _trySendMessageOnce(message, 1)
      }
      log('sendMessage failed:', err)
      return { ok: false, error: err }
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

  // Third-party cosmetics state (BTTV/FFZ/Chatterino badges, 7TV paints+badges)
  let mcBttvBadgeMap = new Map()
  let mcFfzBadgeMap = new Map()
  let mcChatterinoBadgeMap = new Map()
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

  // ═══ Sender-perma emote queue ═══
  // Lazy-fetch each unseen sender's 7TV/BTTV personal set ONCE, cache write-once-per-(sender, name) forever.
  // Survives hard refresh because emotes.js loadSenderEmoteSets() runs at boot before render.
  const senderEmotePending = new Set()
  let senderEmoteTimer = null
  const SENDER_EMOTE_BATCH = 15

  function resolveSenderEmoteKey(m) {
    if (!m) return null
    if (m.platform === 'kick') {
      const id = m.userId || (m.user && m.user.toLowerCase())
      return id ? `kick:${id}` : null
    }
    if (m.platform === 'youtube') {
      // For YT, prefer resolved twitch_id (lets us reuse the twitch 7tv set) but
      // fall back to YT user key when twitch resolution hasn't completed yet.
      if (m.userId) return `twitch:${m.userId}`
      const ytKey = (m.user || '').toLowerCase().replace(/^@/, '')
      return ytKey ? `yt:${ytKey}` : null
    }
    // Default: twitch
    return m.userId ? `twitch:${m.userId}` : null
  }

  function queueSenderEmoteFetch(senderKey, m) {
    if (!senderKey) return
    if (senderEmotePending.has(senderKey)) return
    if (typeof senderEmoteSets !== 'undefined' && senderEmoteSets.has(senderKey)) return
    senderEmotePending.add(senderKey)
    if (senderEmotePending.size >= SENDER_EMOTE_BATCH) {
      if (senderEmoteTimer) { cleanup.clearTimeout(senderEmoteTimer); senderEmoteTimer = null }
      flushSenderEmoteBatch()
      return
    }
    if (!senderEmoteTimer) {
      senderEmoteTimer = cleanup.setTimeout(() => {
        senderEmoteTimer = null
        flushSenderEmoteBatch()
      }, 250)
    }
  }

  function flushSenderEmoteBatch() {
    if (!senderEmotePending.size) return
    const batch = [...senderEmotePending].slice(0, SENDER_EMOTE_BATCH)
    batch.forEach(k => senderEmotePending.delete(k))
    safeSendMessage({ type: 'get_sender_emotes', senderKeys: batch }).then(resp => {
      const emotes = resp?.emotes || {}
      const changedKeys = []
      // Seed sentinel for EVERY batch key. Keys missing from resp.emotes
      // (sender has no personal set, backend doesn't recognize them) get an
      // empty Map — without this, every render re-queues them and we loop
      // render→fetch→re-render forever on busy chats with 50+ unique senders.
      for (const key of batch) {
        const added = mergeSenderEmotes(key, emotes[key] || {})
        if (added) changedKeys.push(key)
      }
      if (changedKeys.length) upgradeMessagesForSenders(changedKeys)
    }).catch(() => {
      // Network/IPC failure — still seed empty sentinel for each key so the
      // next render doesn't re-queue them and trigger the same loop.
      for (const key of batch) mergeSenderEmotes(key, {})
    })
    if (senderEmotePending.size > 0) {
      senderEmoteTimer = cleanup.setTimeout(() => { senderEmoteTimer = null; flushSenderEmoteBatch() }, 500)
    }
  }

  // After a sender's personal set arrives, invalidate cached _renderedHtml on
  // their buffered messages, then debounced-trigger a re-render of the active
  // tab so already-visible rows pick up the new resolution.
  // Debounce: fires once 600ms after the LAST sender resolves. During cold
  // boot ~50+ senders resolve in tight bursts — one renderMessages per batch
  // caused visible flicker, scroll-handler races (yellow "new msgs" button
  // showing on fresh load), and stale-state flashes. One coalesced re-render
  // at the tail of the boot burst replaces all of that.
  let _upgradeRenderTimer = null
  const _pendingUpgradeKeys = new Set()
  function upgradeMessagesForSenders(senderKeys) {
    if (!senderKeys?.length) return
    for (const k of senderKeys) _pendingUpgradeKeys.add(k)

    const keySet = _pendingUpgradeKeys
    const matches = (m) => {
      if (!m) return false
      const k = resolveSenderEmoteKey(m)
      return k && keySet.has(k)
    }
    const patchBuf = (buf) => {
      if (!buf || typeof buf[Symbol.iterator] !== 'function') return
      for (const m of buf) {
        if (matches(m)) m._renderedHtml = null
      }
    }
    // Invalidate cached HTML immediately — the next render (debounced or
    // user-triggered by tab switch / new message) picks up the new emotes.
    if (typeof irc !== 'undefined' && irc?.channels) {
      for (const ch of irc.channels.keys()) patchBuf(irc.getMessages(ch))
    }
    if (typeof kickChat !== 'undefined' && kickChat?.channels) {
      for (const ch of kickChat.channels.keys()) patchBuf(kickChat.getMessages(ch))
    }
    if (typeof channelYtMessages !== 'undefined') channelYtMessages.forEach(patchBuf)
    if (typeof mentionsBuffer !== 'undefined') patchBuf(mentionsBuffer)

    // Debounced re-render of active tab. Reset timer on every new batch so
    // the eventual render sees the FINAL invalidation set, not a partial mid-
    // boot snapshot. 600ms is long enough to coalesce a typical boot burst
    // (~300ms across multiple safeSendMessage round-trips) but short enough
    // that emote upgrades feel near-instant once chat settles.
    if (_upgradeRenderTimer) cleanup.clearTimeout(_upgradeRenderTimer)
    _upgradeRenderTimer = cleanup.setTimeout(() => {
      _upgradeRenderTimer = null
      _pendingUpgradeKeys.clear()
      // Skip re-render entirely if user has scrolled up — they're reading
      // older messages and don't want their viewport snapping. The emotes
      // upgrade lazily on next scroll-to-bottom or tab switch.
      if (isScrolledUp) return
      if (typeof renderMessages === 'function' && typeof currentTab !== 'undefined') {
        try { renderMessages(currentTab) } catch {}
      }
    }, 600)
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

  // One-time migration: copy ui_settings from storage.local to storage.sync.
  // Reuses the in-flight cachedUiSettings() to avoid a second sync IPC.
  async function migrateSettingsToSync() {
    try {
      const [syncData, localData] = await Promise.all([
        cachedUiSettings(),
        chrome.storage.local.get(['ui_settings']),
      ])
      if (!syncData.ui_settings && localData.ui_settings) {
        await chrome.storage.sync.set({ ui_settings: localData.ui_settings })
        invalidateUiSettingsCache()
        log('Migrated ui_settings from local to sync')
      }
    } catch (e) {
      log('Settings migration error:', e)
    }
  }

  // Init-time storage cache — load* functions all read the SAME `ui_settings`
  // key. Without this, init() fires 17+ separate sync IPCs to chrome.storage.
  // One `cachedUiSettings()` call boots a single in-flight Promise that every
  // loader awaits. Cleared at end of init so post-load changes go to disk.
  let _uiSettingsCachePromise = null
  function cachedUiSettings() {
    if (!_uiSettingsCachePromise) {
      _uiSettingsCachePromise = chrome.storage.sync.get(['ui_settings'])
    }
    return _uiSettingsCachePromise
  }
  function invalidateUiSettingsCache() { _uiSettingsCachePromise = null }

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
      invalidateUiSettingsCache()
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

        // Check for chat-related props (direct key probe — JSON.stringify per
        // fiber level was burning ~30× on every retry)
        const props = inst.props
        if (props) {
          for (const k in props) {
            if (k === 'channel' || k === 'room' || k.startsWith('channel') || k.startsWith('room')) return true
          }
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
      // Acknowledge unread indicators on click — guarantees clearing even on
      // paths that don't run switchTab (live picker), and survives any new
      // mention that lands in the same frame between click and render.
      tab.classList.remove('has-mentions', 'has-new', 'has-stream-event');
      if (tabId === 'mentions') mentionsSeenCount = mentionsBuffer.length;
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

  // Util row collapsed — hides C/T/F-/F+/⚙ for clean single-line tabs

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
  // Twitch: when .channel-root__main shrinks below this, Twitch flips to its
  // narrow-stack layout — .persistent-player gets re-positioned absolute at
  // the bottom of the about section (y > 2000px), so the video falls below
  // the fold and the empty player slot at the top shows the "?" placeholder.
  // Cap chat-col width so main stays above this threshold.
  const TWITCH_MIN_MAIN_WIDTH = 600;
  const TWITCH_SIDE_NAV_WIDTH = 50; // left rail when collapsed; conservative

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

  // Twitch: max chat width that keeps .channel-root__main >= TWITCH_MIN_MAIN_WIDTH.
  // Vertical tab strip eats +90 from the right-column total, so subtract it
  // from the chat budget too. The 600 min only matters for chat-right —
  // there the right-column is part of Twitch's flex layout, and pushing
  // .channel-root__main below 600 trips Twitch's narrow-layout breakpoint
  // and teleports the persistent-player off-screen. For chat-left our panel
  // is a fixed-position overlay; it doesn't shrink channel-root, so the
  // breakpoint doesn't fire — applying 600 there just collapses the resize
  // range to a few px on narrow viewports. Use a much smaller player floor
  // (300) to keep a usable video area without crippling drag.
  function getTwitchMaxChatWidth() {
    if (hostPlatform !== 'twitch') return MAX_CHAT_WIDTH
    const vw = window.innerWidth || document.documentElement.clientWidth || 1280
    const tabStrip = (tabPosition === 'left' || tabPosition === 'right') ? 90 : 0
    const floor = (chatPosition && chatPosition !== 'right') ? 300 : TWITCH_MIN_MAIN_WIDTH
    const navW = (typeof _twitchSideNavW === 'number' && _twitchSideNavW > 0) ? _twitchSideNavW : TWITCH_SIDE_NAV_WIDTH
    const max = vw - navW - floor - tabStrip
    return Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, max))
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

      // Bulletproof scroll-pause: ANY upward movement pauses chat sticky.
      // Resumes ONLY when user lands within 2px of true bottom OR clicks "new" button.
      // Prior 50px slop let small wheels/drags re-trigger auto-scroll, breaking pause.
      const ATBOTTOM_PX = 2
      const setPaused = (paused) => {
        if (paused) {
          if (!isScrolledUp) {
            isScrolledUp = true
            newBtn.innerHTML = newMessageCount > 0
              ? `<span class="hs-arrow-down">▼</span> ${t('mc_new_messages', [String(newMessageCount)])}`
              : `<span class="hs-arrow-down">▼</span> ${t('mc_resume')}`
            newBtn.style.display = 'flex'
          }
        } else {
          if (isScrolledUp) {
            isScrolledUp = false
            newMessageCount = 0
            newBtn.style.display = 'none'
          }
        }
      }

      // BULLETPROOF AUTO-SCROLL RULE:
      // isScrolledUp is set TRUE only by explicit user input — wheel-up,
      // touchmove going up, PageUp/Home/ArrowUp keys, mousedown on scrollbar
      // thumb. NEVER by passive scroll events from DOM mutation, render
      // churn, image-load layout shift, or programmatic scrollMsgsToBottom.
      // Resume (FALSE) only when scroll events confirm we're back at bottom
      // AFTER a user-driven scroll, OR via the new-msgs button click, OR
      // explicit programmatic resume on tab switch.
      let _scrollFrame = null
      let _userInputScroll = false  // set by wheel/touch/key, cleared after scroll settles
      mcSignal.addEventListener('abort', () => {
        if (_scrollFrame) { cancelAnimationFrame(_scrollFrame); _scrollFrame = null }
      })

      const checkAtBottom = () => {
        if (isStaticTab()) return msgsEl.scrollTop <= ATBOTTOM_PX
        return (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight) <= ATBOTTOM_PX
      }

      // Scroll/scrollend handler: ONLY resumes (sets isScrolledUp=false when
      // user-driven scroll lands at bottom). Never pauses — passive scroll
      // events caused by DOM mutation during boot would otherwise flip
      // isScrolledUp=true mid-build, then yellow "N new" accumulates without
      // ever auto-scrolling.
      const onScrollMaybeResume = () => {
        if (isProgrammaticScroll) return
        if (!_userInputScroll) return
        if (!isScrolledUp) return
        if (checkAtBottom()) {
          isScrolledUp = false
          newMessageCount = 0
          newBtn.style.display = 'none'
        }
      }

      msgsEl.addEventListener('scroll', () => {
        if (_scrollFrame) return
        _scrollFrame = requestAnimationFrame(() => {
          _scrollFrame = null
          onScrollMaybeResume()
        })
      }, { passive: true, signal: mcSignal })

      msgsEl.addEventListener('scrollend', () => {
        if (_scrollFrame) { cancelAnimationFrame(_scrollFrame); _scrollFrame = null }
        onScrollMaybeResume()
        // touch-end / wheel-coast finished — clear input flag so subsequent
        // passive scroll events don't accidentally count as user-driven.
        _userInputScroll = false
      }, { signal: mcSignal })

      // Wheel-up: pause INSTANTLY (before any scroll event fires).
      msgsEl.addEventListener('wheel', (e) => {
        if (isStaticTab()) return
        _userInputScroll = true
        if (e.deltaY < 0) setPaused(true)
      }, { passive: true, signal: mcSignal })

      // Touch: track touchmove direction. Drag DOWN (page scrolls UP visually
      // — finger moves down means content moves down, we see earlier msgs)
      // pauses chat. mark _userInputScroll on any touch interaction.
      let _touchStartY = 0
      msgsEl.addEventListener('touchstart', (e) => {
        _touchStartY = e.touches[0]?.clientY || 0
        _userInputScroll = true
      }, { passive: true, signal: mcSignal })
      msgsEl.addEventListener('touchmove', (e) => {
        if (isStaticTab()) return
        const y = e.touches[0]?.clientY || 0
        if (y > _touchStartY + 4) setPaused(true)
        _touchStartY = y
      }, { passive: true, signal: mcSignal })

      // Keys that scroll up — pause.
      msgsEl.addEventListener('keydown', (e) => {
        if (isStaticTab()) return
        if (e.key === 'PageUp' || e.key === 'Home' || e.key === 'ArrowUp') {
          _userInputScroll = true
          setPaused(true)
        } else if (e.key === 'PageDown' || e.key === 'End' || e.key === 'ArrowDown' || e.key === ' ') {
          _userInputScroll = true
        }
      }, { signal: mcSignal })

      // Mousedown on scrollbar thumb (target === msgsEl, click outside content)
      // — flag user input so subsequent scroll counts as user-driven.
      msgsEl.addEventListener('mousedown', (e) => {
        if (e.target === msgsEl) _userInputScroll = true
      }, { passive: true, signal: mcSignal })

      newBtn.addEventListener('click', () => {
        isScrolledUp = false;
        newMessageCount = 0;
        newBtn.style.display = 'none';
        if (isStaticTab()) {
          // Static tabs: re-render then scroll to top (newest content)
          renderMessages(currentTab);
          msgsEl.scrollTop = 0;
        } else {
          // Chat tabs: re-render then teleport to bottom. The new render
          // diff only auto-pins if user was AT bottom; here the user was
          // scrolled UP and clicked to come back, so force the scroll.
          renderMessages(currentTab);
          scrollMsgsToBottom(msgsEl);
        }
      }, { signal: mcSignal });

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
      const max = Math.min(MAX_CHAT_WIDTH, getTwitchMaxChatWidth())
      pendingWidth = Math.min(max, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
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
      // Force Twitch's player + ad layer (.video-ad-display, IMA iframe) to
      // re-measure. Without this, ad video keeps its pre-resize dimensions.
      try { window.dispatchEvent(new Event('resize')) } catch (_) {}
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

    // Clamp against viewport-aware max so a too-wide saved value (or the
    // user dragging on a wider window then resizing it down) can't push
    // .channel-root__main below Twitch's narrow-layout threshold and
    // teleport the persistent-player off-screen.
    const tMax = getTwitchMaxChatWidth()
    if (chatWidth > tMax) chatWidth = tMax
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
  function getMaxChatHeight() { return Math.max(MIN_CHAT_HEIGHT, Math.round(window.innerHeight * 0.7)); }
  // Clamp to MIN so a tiny window at module-load doesn't trap the user with
  // a default below the legal range.
  let chatHeight = Math.max(MIN_CHAT_HEIGHT, Math.round(window.innerHeight * 0.35));
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
      if (data.hs_chat_height) {
        chatHeight = Math.max(MIN_CHAT_HEIGHT, Math.min(getMaxChatHeight(), data.hs_chat_height));
        // Mirror loadChatWidth: push CSS var + reposition the unified handle so
        // the panel + orange bar render at the saved height on first paint.
        document.documentElement.style.setProperty('--hs-chat-h', chatHeight + 'px');
        try { positionChatResizeHandle() } catch {}
      }
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
  let _suppressYtResizeDispatch = false;
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

    // Live drag: chat + player resize on every pointermove (rAF-throttled).
    // We suppress the YT window-resize dispatch during drag so IMA SDK / html5
    // player don't re-decode the video on every frame. CSS handles smooth
    // visual scaling; one final resize event fires on pointerup so the player
    // re-measures cleanly (and ad <video> elements snap to final dimensions).
    let startX = 0, startY = 0, startW = 0, startH = 0, axis = 'x', activePid = -1;
    let pendingW = 0, pendingH = 0, overlay = null;
    let liveRaf = 0;
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
      // Use the same per-platform max as the platform handles so the unified
      // bar can't drag past where a YT video column would get crushed.
      const maxW = hostPlatform === 'yt'
        ? Math.min(MAX_CHAT_WIDTH, getYtMaxChatWidth())
        : (hostPlatform === 'twitch' ? Math.min(MAX_CHAT_WIDTH, getTwitchMaxChatWidth()) : MAX_CHAT_WIDTH);
      if (chatPosition === 'right') {
        pendingW = Math.max(MIN_CHAT_WIDTH, Math.min(maxW, startW + (startX - e.clientX)));
        // -3 matches positionChatResizeHandle's init position so the bar
        // doesn't snap 3px under the cursor on the very first pointermove.
        handle.style.right = (pendingW - 3) + 'px';
      } else if (chatPosition === 'left') {
        pendingW = Math.max(MIN_CHAT_WIDTH, Math.min(maxW, startW + (e.clientX - startX)));
        handle.style.left = (pendingW - 3) + 'px';
      } else if (chatPosition === 'top') {
        pendingH = Math.max(MIN_CHAT_HEIGHT, Math.min(getMaxChatHeight(), startH + (e.clientY - startY)));
        handle.style.top = (pendingH - 3) + 'px';
      } else if (chatPosition === 'bottom') {
        pendingH = Math.max(MIN_CHAT_HEIGHT, Math.min(getMaxChatHeight(), startH + (startY - e.clientY)));
        handle.style.bottom = (pendingH - 3) + 'px';
      }
      // Live commit — chat panel + player + tabbar reflow on every frame.
      // rAF-throttled so layout work happens at most once per paint regardless
      // of pointermove rate (browsers fire 120-1000Hz on high-refresh mice).
      if (!liveRaf) {
        liveRaf = requestAnimationFrame(() => {
          liveRaf = 0;
          if (axis === 'x') chatWidth = pendingW;
          else chatHeight = pendingH;
          _suppressYtResizeDispatch = true;
          try { applyChatPosition() } finally { _suppressYtResizeDispatch = false }
          if (hostPlatform === 'yt') {
            try { applyYouTubeChatWidth() } catch (_) {}
          }
        });
      }
    });
    const endDrag = (e) => {
      if (!_isResizingC || (e && e.pointerId !== activePid)) return;
      _isResizingC = false;
      activePid = -1;
      if (liveRaf) { cancelAnimationFrame(liveRaf); liveRaf = 0; }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      handle.style.opacity = '0.55';
      if (overlay) { overlay.remove(); overlay = null; }
      // Final settle — applyChatPosition with resize-event dispatch enabled
      // so YT's IMA SDK / html5 player re-measure to the committed dimensions.
      if (axis === 'x') chatWidth = pendingW;
      else chatHeight = pendingH;
      applyChatPosition();
      // applyChatPosition strips inline width on #secondary for YT chat-right
      // and relies on "next reflow" to repopulate it — but nothing guarantees
      // that fires promptly, so the chat panel visually lags behind the
      // committed chatWidth (the "snap on release" the user perceives).
      if (hostPlatform === 'yt') {
        try { applyYouTubeChatWidth() } catch {}
      }
      // Force every platform's player (including ad layers — Twitch
      // .video-ad-display, YT IMA SDK, Kick video.js) to re-measure. Without
      // this, ad <video> elements with explicit inline dimensions keep their
      // pre-resize size and overlap the chat or leave black bars until refresh.
      try { window.dispatchEvent(new Event('resize')) } catch (_) {}
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
    // YouTube: only show the handle on watch pages (where ytd-watch-flexy
    // and the chat panel exist). Home/search/channel pages have no chat
    // to resize — the orange bar would just float over empty space.
    if (hostPlatform === 'yt' && !document.querySelector('ytd-watch-flexy')) {
      handle.style.display = 'none';
      return;
    }
    // For YT, chat-right is now position:fixed so the unified handle
    // owns ALL four positions. For Twitch/Kick, chat-right uses the
    // existing per-platform handles (which have ghost-preview perf
    // optimisations worth keeping).
    if ((chatPosition === 'right' || !chatPosition) && hostPlatform !== 'yt') {
      handle.style.display = 'none';
      return;
    }
    handle.style.display = 'block';
    if (chatPosition === 'right') {
      handle.style.top = '0';
      handle.style.bottom = '0';
      handle.style.right = (chatWidth - 3) + 'px';
      handle.style.width = '6px';
      handle.style.cursor = 'col-resize';
    } else if (chatPosition === 'left') {
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
        // Sync the CSS var driving every chat-position rule + reposition the
        // unified resize handle. Without this, the panel renders at the default
        // 340px until the first applyChatPosition fires (theatre toggle, drag
        // end, etc) — at which point the panel + bar visibly jump to the saved
        // width. That's the "first-load teleport" the user reports.
        document.documentElement.style.setProperty('--hs-chat-w', chatWidth + 'px');
        applyChatWidth();
        try { positionChatResizeHandle() } catch {}
        log('Loaded chat width:', chatWidth);
      }
    } catch (e) {
      log('Error loading chat width:', e);
    }
  }

  /**
   * Detect Kick's left sidebar at the current viewport width. Kick drops the
   * sidebar from the DOM at narrow widths (~< ~1000px). The padding-left we
   * apply to <main> needs to subtract the sidebar's effective width so the
   * video starts where our fixed panel ends — without leaving a gap when the
   * sidebar is present, and without overlapping the video when it isn't.
   */
  function getKickSidebarWidth() {
    const el = document.querySelector('[class*="sidebar-collapsed-width"]')
    if (!el) return 0
    const w = el.offsetWidth
    return w > 0 ? w : 0
  }

  function syncKickSidebarVar() {
    document.documentElement.style.setProperty('--hs-kick-sidebar-w', getKickSidebarWidth() + 'px')
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
    syncKickSidebarVar()
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
      // Force Kick's video.js player + any preroll/midroll ad layer to
      // re-measure so the ad video stops overlapping chat.
      try { window.dispatchEvent(new Event('resize')) } catch (_) {}
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
    // Note: NOT setting handle.style.display — the unified resize handle
    // (#hs-c-resize-handle) owns ALL chat positions on YT, so the platform
    // handle stays hidden by hidePlatformResizeHandles. Clearing display
    // here would un-hide it and render two orange bars.
    const ytMax = getYtMaxChatWidth()
    chatWidth = Math.min(ytMax, Math.max(MIN_CHAT_WIDTH, chatWidth))
    secondary.style.setProperty('width', chatWidth + 'px', 'important')
    secondary.style.setProperty('min-width', chatWidth + 'px', 'important')
    secondary.style.setProperty('max-width', chatWidth + 'px', 'important')
    secondary.style.setProperty('flex', 'none', 'important')
    // Note: NOT setting width on #hs-mc-container — chat-right now uses
    // position:fixed via CSS (body.hs-platform-yt.hs-chat-right #hs-mc-container)
    // so the container's width is owned by var(--hs-chat-w). Setting inline
    // width here would beat that CSS and stretch chat across full viewport.
    const container = document.getElementById('hs-mc-container')
    if (container) container.style.removeProperty('width')
  }

  // Twitch: .persistent-player mounts asynchronously after our initial
  // applyChatPosition runs. Without this, our top:0 fix never applies on
  // first load. Also: on certain SPA flows (channel→home→channel) Twitch's
  // React resets persistent-player's inline top to "", letting it fall to
  // its natural-flow position at the bottom of root-scrollable__wrapper
  // (y > 2000px), which pushes the video off-screen below the about
  // section. Watch for the mount + style resets and re-pin top:0 left:0
  // when we're in chat-right normal mode.
  let _ttvPpObserver = null
  let _ttvPpStyleObserver = null
  let _ttvPpLastSeen = null
  function pinTwitchPersistentPlayer() {
    if (hostPlatform !== 'twitch' || isKick) return
    const pp = document.querySelector('.persistent-player')
    if (!pp) return
    // For non-right chatPosition, the player must inset around the chat
    // strip. applyChatPosition's first call fires before .persistent-player
    // mounts on SPA nav (channel→channel), so our inline top/bottom/left/
    // right are never applied. Re-apply ONCE on mount. We deliberately do
    // NOT observe style mutations on pp here — applyPlatformPositionOverrides
    // itself writes inline styles, which would self-trigger the observer
    // and loop the page to a freeze. Twitch rarely resets our !important
    // inline overrides; the rotateChatPosition path re-applies if needed.
    if (chatPosition !== 'right' && !theatreMode) {
      const tag = `${chatPosition}:${chatWidth}:${chatHeight}:${pp === _ttvPpLastSeen}`
      if (pp._hsTwPosTag === tag) return
      pp._hsTwPosTag = tag
      _ttvPpLastSeen = pp
      try { applyPlatformPositionOverrides() } catch (_) {}
      return
    }
    if (theatreMode) return
    // chatPosition === 'right' default path — pin top:0 when Twitch's React
    // forgets to set it (player falls to natural-flow position y > 2000px).
    const cur = pp.style.top
    const resolved = parseFloat(getComputedStyle(pp).top) || 0
    if (cur === '0px' && resolved < 100) return // already pinned
    pp.style.setProperty('top', '0', 'important')
    pp.style.setProperty('left', '0', 'important')
    if (_ttvPpLastSeen !== pp) {
      _ttvPpLastSeen = pp
      if (_ttvPpStyleObserver) { try { _ttvPpStyleObserver.disconnect() } catch (_) {} _ttvPpStyleObserver = null }
      _ttvPpStyleObserver = new MutationObserver(() => {
        if (chatPosition !== 'right' || theatreMode) return
        const r = parseFloat(getComputedStyle(pp).top) || 0
        if (r > 200) {
          pp.style.setProperty('top', '0', 'important')
          pp.style.setProperty('left', '0', 'important')
        }
      })
      _ttvPpStyleObserver.observe(pp, { attributes: true, attributeFilter: ['style'] })
      cleanup.trackObserver(_ttvPpStyleObserver)
    }
  }
  function watchTwitchPersistentPlayer() {
    if (hostPlatform !== 'twitch' || isKick) return
    pinTwitchPersistentPlayer() // immediate, in case it's already mounted
    if (_ttvPpObserver) return
    let _ttvPpRaf = 0
    _ttvPpObserver = new MutationObserver(() => {
      // Player already tracked and still attached? _ttvPpStyleObserver handles
      // any inline-style resets on it — skip walking body subtree.
      if (_ttvPpLastSeen && document.body.contains(_ttvPpLastSeen)) return
      if (_ttvPpRaf) return
      _ttvPpRaf = requestAnimationFrame(() => {
        _ttvPpRaf = 0
        pinTwitchPersistentPlayer()
      })
    })
    _ttvPpObserver.observe(document.body, { childList: true, subtree: true })
    cleanup.trackObserver(_ttvPpObserver)
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

  // Re-run applyChatPosition when ytd-watch-flexy mounts on an SPA nav from
  // a non-watch page (home/search/channel) → a watch page. Without this,
  // the first applyChatPosition call ran with isYtNonWatch=true and never
  // re-added hs-chat-right to <body>, so the position:fixed CSS for
  // #hs-mc-container stayed inactive even after flexy mounted.
  let _ytFlexyMountObs = null
  function watchYtFlexyMount() {
    // Idempotent: callable from init AND from applyChatPosition when it
    // detects isYtNonWatch on a watch URL (cold-load before flexy mounts).
    // Without re-arming on every nav, the body class hs-chat-* stays stripped
    // when flexy unmounts during /watch → /watch SPA transitions and the
    // observer was already torn down.
    if (hostPlatform !== 'yt') return
    if (_ytFlexyMountObs) return
    if (document.querySelector('ytd-watch-flexy')) return // already there
    _ytFlexyMountObs = new MutationObserver(() => {
      if (!document.querySelector('ytd-watch-flexy')) return
      _ytFlexyMountObs.disconnect()
      _ytFlexyMountObs = null
      try { applyChatPosition() } catch {}
      try { applyYouTubeChatWidth() } catch {}
    })
    _ytFlexyMountObs.observe(document.body, { childList: true, subtree: true })
    cleanup.trackObserver(_ytFlexyMountObs)
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

  // Kick: re-apply player sizing on window resize AND on player mount.
  // applyPlatformPositionOverrides runs early in init — usually before Kick
  // mounts #injected-channel-player — and never re-ran, so overrides never
  // landed. Always re-apply once the player is present, plus on every resize.
  let _kickViewportClampTimer = null
  let _kickPlayerMountObs = null
  function watchKickViewportClamp() {
    if (!isKick) return
    const onResize = () => {
      if (_kickViewportClampTimer) cleanup.clearTimeout(_kickViewportClampTimer)
      _kickViewportClampTimer = cleanup.setTimeout(() => {
        _kickViewportClampTimer = null
        applyPlatformPositionOverrides()
      }, 80)
    }
    window.addEventListener('resize', onResize, { signal: mcSignal })

    if (document.querySelector('#injected-channel-player')) {
      // Player already mounted — apply now (early init call missed it).
      applyPlatformPositionOverrides()
    } else if (!_kickPlayerMountObs) {
      _kickPlayerMountObs = new MutationObserver(() => {
        if (document.querySelector('#injected-channel-player')) {
          _kickPlayerMountObs.disconnect()
          _kickPlayerMountObs = null
          applyPlatformPositionOverrides()
        }
      })
      _kickPlayerMountObs.observe(document.body, { childList: true, subtree: true })
      cleanup.trackObserver(_kickPlayerMountObs)
    }
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
    // YT now uses the unified #hs-c-resize-handle for ALL chat positions
    // (because chat-right is position:fixed, not in YT's flex tree). Hide
    // this platform handle on creation so we don't render two orange bars.
    handle.dataset._hsCHidden = '1'
    handle.style.setProperty('display', 'none', 'important')
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
      // Force YT's IMA SDK + html5 player to re-measure so a mid-ad resize
      // doesn't leave the ad video at its pre-drag dimensions.
      try { window.dispatchEvent(new Event('resize')) } catch (_) {}
      saveChatWidth()
    }
    handle.addEventListener('pointerup', endDrag)
    handle.addEventListener('pointercancel', endDrag)

    loadChatWidth().then(() => { applyYouTubeChatWidth() })
    loadChatHeight()
    watchYtViewportClamp()
    watchYtLayoutAttrs()
    watchYtFlexyMount()
  }

  // Emote size functions
  function setEmoteSize(size) {
    if ([1, 2, 4].includes(size)) {
      emoteSize = size;
      saveEmoteSize();
      applyEmoteSize();
      // URLs encode size — picker DOM is now stale.
      markPickerDirty();
      prebuildPickerIdle();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
      if (stored.ui_settings?.smartCompletion !== undefined) smartCompletion = !!stored.ui_settings.smartCompletion;
    } catch {}
  }
  function toggleSmartCompletion() {
    smartCompletion = !smartCompletion;
    saveUiSetting('smartCompletion', smartCompletion);
  }

  async function loadFirstChatterGlowSetting() {
    try {
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
      // Hide native YouTube chat iframe wherever it is in the tree.
      const ytChatFrame = document.querySelector('ytd-live-chat-frame#chat')
      const prevDisplay = ytChatFrame?.style.display ?? ''
      if (ytChatFrame) {
        const frameHeight = ytChatFrame.offsetHeight || 500
        ytChatFrame.style.display = 'none'
        container.style.cssText = `height:${frameHeight}px;overflow:hidden;`
        window._hsYtChatFrameHeight = frameHeight
      }
      // Append to <body> instead of nesting inside #chat-container. On
      // narrow / single-column viewports YT collapses the right sidebar and
      // moves #chat-container into #below, which YT (and our own CSS at
      // body.hs-platform-yt #below) sets to display:none — taking our
      // position:fixed panel down with it. Body is the only stable parent.
      parent = document.body
      parent.appendChild(container)
      // Teardown: restore native iframe display and remove our body-appended
      // container so disabling/reloading the extension doesn't leave the YT
      // chat permanently hidden. mcSignal aborts on pagehide and on full
      // lifecycle teardown.
      mcSignal.addEventListener('abort', () => {
        if (ytChatFrame && ytChatFrame.isConnected) {
          ytChatFrame.style.display = prevDisplay
        }
        if (container && container.parentElement === document.body) {
          container.remove()
        }
      }, { once: true })
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
      watchKickViewportClamp()
    } else {
      setupResizeHandle()
      watchTwitchPersistentPlayer()
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

    // Channel/tab switch flips which channel-emote cache the picker reads —
    // mark cache dirty + queue idle prebuild for the new context.
    markPickerDirty();
    prebuildPickerIdle();

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
      // Sender-perma emote resolution: pick the right per-sender map.
      // - Viewer's own outgoing → viewerPersonalEmotes (their heatsync inventory wins)
      // - Other senders → senderEmoteSets["plat:uid"] (lazy-fetched 7TV/BTTV personal set, perma cached)
      let senderEmotes = null
      const senderKey = resolveSenderEmoteKey(m)
      const isOwn = m.user && currentUsername && m.user.toLowerCase() === currentUsername.toLowerCase()
      if (isOwn) {
        senderEmotes = viewerPersonalEmotes
      } else if (senderKey) {
        senderEmotes = getSenderEmotes(senderKey)
        if (!senderEmotes) queueSenderEmoteFetch(senderKey, m)
      }
      processedText = processEmotes(escapeHtml(m.text), m.channel, twitchExtra, senderEmotes)
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
    // Stable hash-based zebra (matches renderMessages' zebraOf): per-msg
    // deterministic so flicker-free across rebuilds.
    if (zebraEnabled && msg.type !== 'stream-event' && msg.type !== 'feed-post' && msg.type !== 'inline-dm') {
      const s = msg.id || msg.base36_id || `${msg.user || ''}:${msg.time || ''}`
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
      if ((h & 1) === 0) div.classList.add('hs-mc-zebra')
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

    // FULL chronological sort by time. Per-source slicing above already caps
    // each platform's contribution (perSource = 500/N), so a high-volume
    // twitch chat can't wash out kick/yt in the merged result. Sorting the
    // full merged list by msg.time gives "perfectly timestamp scattered"
    // accuracy — stream events (game change, went live, etc.), YT backfill,
    // and IRC msgs all interleave at their real times. Stable Array.sort
    // preserves relative order within identical-time clusters.
    merged.sort((a, b) => (a.time || 0) - (b.time || 0))
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

    // Merge follow stream events into every tab (went live, switched game,
    // went offline). fairMerge's full sort below puts everything at its
    // correct chronological position regardless of insertion order, so we
    // just append missing events here and let the sort handle placement.
    if (activityEvents.length > 0 && msgs.length > 0) {
      const existingTexts = new Set(msgs.filter(m => m.type === 'stream-event').map(m => m.text))
      const missing = activityEvents.filter(e =>
        e.eventClass?.includes('event-follow') && !existingTexts.has(e.text)
      )
      if (missing.length > 0) {
        msgs.push(...missing)
        msgs.sort((a, b) => (a.time || 0) - (b.time || 0))
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

    // GOD-TIER STABLE-ORDER RENDER:
    // mellen's bulletproof rules: (1) once a msg is in DOM, it never changes
    // position; (2) order is correct BEFORE showing; (3) zebra never flickers.
    //
    // strategy: insert-only diff.
    //   - PASS A: remove DOM children whose msgKey is no longer in `toRender`
    //     (msg trimmed off the buffer cap or filter-toggled out).
    //   - PASS B: walk `toRender` in order. for each msg, if DOM[domIdx] has
    //     the same msgKey, advance both. otherwise the desired msg is new —
    //     insertBefore DOM[domIdx] (or append if at end).
    //
    // existing DOM nodes stay put. new msgs slot in at chronologically
    // correct positions (because `toRender` is already chrono-sorted by
    // fairMerge below). no shuffling. no rebuild-from-prefix flash.
    const msgKey = (m) =>
      `${_renderEpoch}:${m.id || m.base36_id || `${m.user || ''}:${m.time || ''}:${(m.text || '').slice(0, 32)}`}`
    const desiredKeys = toRender.map(msgKey)
    const desiredSet = new Set(desiredKeys)

    // Hash-based stable zebra: each msg's stripe is determined ONCE by its id
    // and never recomputed. inserts in the middle no longer flip every msg's
    // zebra state on each render (mellen's "stripes alternating quickly while
    // scrolled up" complaint). pattern won't strictly alternate but it'll be
    // stable across renders.
    const zebraOf = (m) => {
      if (!zebraEnabled) return false
      if (m.type === 'stream-event' || m.type === 'feed-post' || m.type === 'inline-dm') return false
      const s = m.id || m.base36_id || `${m.user || ''}:${m.time || ''}`
      let h = 0
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
      return (h & 1) === 0
    }

    // PASS 0: capture expanded emote stacks (mostly relevant for full rebuilds
    // when _renderEpoch increments — stacks would otherwise reset to collapsed).
    const expandedStacks = []
    for (const msgDiv of msgsEl.children) {
      const mid = msgDiv.dataset?.msgId
      if (!mid) continue
      const stacks = msgDiv.querySelectorAll('.hs-mc-emote-stack')
      for (let s = 0; s < stacks.length; s++) {
        if (stacks[s].classList.contains('expanded')) expandedStacks.push([mid, s])
      }
    }

    // PASS A: drop DOM children no longer wanted (yt-status notices for THIS
    // tab survive at bottom; for other tabs they get dropped). Track yt-status
    // notices to re-pin at end.
    const detachedExtras = []
    let i = 0
    while (i < msgsEl.children.length) {
      const c = msgsEl.children[i]
      const k = c.dataset?.msgKey
      if (k && desiredSet.has(k)) { i++; continue }
      // Not a wanted msg — yt-status for this tab gets re-pinned, others removed.
      if (c.dataset?.hsYtStatus && c.dataset?.hsYtStatusTab === String(id)) {
        detachedExtras.push(c)
      }
      c.remove()
    }

    // Snapshot "was at bottom?" BEFORE inserts so we know whether to re-pin.
    const wasAtBottom = (msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight) <= 4
    const insertedAtTail = []  // track tail-end inserts for scroll-pin decision

    // PASS B: walk desired list, insert missing msgs at correct positions.
    let domIdx = 0
    for (let j = 0; j < toRender.length; j++) {
      const key = desiredKeys[j]
      const cur = msgsEl.children[domIdx]
      if (cur && cur.dataset.msgKey === key) {
        domIdx++
        continue
      }
      // Build new msg div at correct position.
      const m = toRender[j]
      const div = buildMessageDiv(m, id)
      if (!div) continue
      div.dataset.msgKey = key
      if (zebraOf(m)) div.classList.add('hs-mc-zebra')
      msgsEl.insertBefore(div, cur || null)
      domIdx++
      // Tail insert = index reached the end of pre-existing DOM.
      if (!cur) insertedAtTail.push(div)
    }

    // Re-pin yt-status notices to the very end.
    for (const ex of detachedExtras) msgsEl.appendChild(ex)

    // Re-apply expanded stacks (only relevant when full rebuild fired).
    for (const [mid, idx] of expandedStacks) {
      const m = msgsEl.querySelector(`.hs-mc-msg[data-msg-id="${CSS.escape(mid)}"]`)
      if (!m) continue
      const stacks = m.querySelectorAll('.hs-mc-emote-stack')
      if (stacks[idx]) stacks[idx].classList.add('expanded')
    }

    applyMcMutes()

    // Scroll behavior: if user was at bottom AND not in scrolled-up state,
    // re-pin to bottom — covers both tail appends (new live msg) and mid-
    // list inserts (backfill above existing live msgs would otherwise leave
    // user 100px+ above the latest twitch msg). mellen's rule: scrollbar
    // locked at bottom unless user explicitly scrolls up.
    cleanup.raf(() => { isProgrammaticScroll = false })
    if (wasAtBottom && !isScrolledUp) {
      scrollMsgsToBottom(msgsEl)
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
      const stored = await cachedUiSettings();
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
      const stored = await cachedUiSettings();
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
  let _twitchSideNavObs = null;
  let _twitchSideNavWinHooked = false;
  let _twitchSideNavW = TWITCH_SIDE_NAV_WIDTH;

  // Twitch's left side-nav is 50px when collapsed, ~240px when expanded.
  // It auto-expands on wide viewports (>~1200px), and the user can also
  // toggle it. chat-left layout subtracts this width from chatWidth to land
  // the player flush with the HS panel — so the live value must be tracked,
  // not assumed. Pushes --hs-twitch-sidenav-w for the CSS rules to consume,
  // and re-runs applyPlatformPositionOverrides so JS-side arithmetic
  // (persistent-player inset, channel-root padding) updates too.
  function updateTwitchSideNavWidth() {
    if (hostPlatform !== 'twitch') return;
    const nav = document.querySelector('.side-nav');
    const w = nav?.getBoundingClientRect?.().width;
    const next = (w && w > 0) ? Math.round(w) : TWITCH_SIDE_NAV_WIDTH;
    if (next === _twitchSideNavW) return;
    _twitchSideNavW = next;
    document.documentElement.style.setProperty('--hs-twitch-sidenav-w', next + 'px');
    if (chatPosition === 'left') {
      try { applyPlatformPositionOverrides() } catch (_) {}
    }
  }

  function setupTwitchSideNavObserver() {
    if (hostPlatform !== 'twitch') return;
    document.documentElement.style.setProperty('--hs-twitch-sidenav-w', _twitchSideNavW + 'px');
    if (_twitchSideNavObs) { try { _twitchSideNavObs.disconnect() } catch (_) {} _twitchSideNavObs = null; }
    const nav = document.querySelector('.side-nav');
    if (nav && typeof ResizeObserver !== 'undefined') {
      _twitchSideNavObs = new ResizeObserver(() => updateTwitchSideNavWidth());
      _twitchSideNavObs.observe(nav);
      cleanup.trackObserver(_twitchSideNavObs);
    }
    if (!_twitchSideNavWinHooked) {
      _twitchSideNavWinHooked = true;
      window.addEventListener('resize', () => updateTwitchSideNavWidth(), { passive: true, signal: mcSignal });
    }
    updateTwitchSideNavWidth();
  }

  async function loadChatPosition() {
    try {
      const stored = await cachedUiSettings();
      if (stored.ui_settings?.chatPosition !== undefined) {
        chatPosition = stored.ui_settings.chatPosition;
      }
      // Load saved width + height BEFORE first applyChatPosition. Without this,
      // applyChatPosition runs with default chatHeight (35% innerHeight) and
      // positions the orange handle there. loadChatHeight then updates the
      // variable but not the handle's screen position, so first click captures
      // the saved value and the bar instantly snaps to it — looks like a
      // mouse teleport from the user's POV.
      await Promise.all([loadChatWidth(), loadChatHeight()]);
      // Stamp the platform class once — never changes per-page
      const platformClass = `hs-platform-${hostPlatform === 'yt' ? 'yt' : (isKick ? 'kick' : 'twitch')}`;
      document.body.classList.add(platformClass);
      detectTheatreMode();
      setupTheatreObserver();
      setupTwitchSideNavObserver();
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
    // Body-subtree observation fires on every React class flip (chat-line
    // animations, hover toggles, ad layer churn) — ~100+ callbacks/sec.
    // Cheap pre-filter: skip mutations whose target class doesn't contain
    // a theatre token. Saves the querySelector inside detectTheatreMode().
    _theatreObserver = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.attributeName !== 'class') { detectTheatreMode(); return }
        const c = m.target && m.target.className
        const s = typeof c === 'string' ? c : (c && c.baseVal) || ''
        if (s.indexOf('theat') !== -1 || s.indexOf('fullscreen') !== -1) {
          detectTheatreMode()
          return
        }
      }
    });
    for (const t of targets) {
      _theatreObserver.observe(t, { attributes: true, attributeFilter: ['class', 'data-theatre', 'theater', 'fullscreen'], subtree: true });
    }
    cleanup.trackObserver(_theatreObserver);
  }

  function applyChatPosition() {
    // Sanitize — only ever 4 valid positions. If chatPosition somehow
    // drifted (stale storage from old build, manual edit), force to 'right'.
    const VALID_POSITIONS = ['right', 'bottom', 'left', 'top'];
    if (!VALID_POSITIONS.includes(chatPosition)) {
      log('[c-button] sanitizing invalid chatPosition:', chatPosition, '→ right');
      chatPosition = 'right';
    }
    // YouTube: only apply layout overrides on watch pages. Home, search,
    // channel pages don't have ytd-watch-flexy / #primary / #player so
    // our rules just left the page broken (blank top, floating handle).
    // BUT: don't strip hs-platform-yt itself — it's set unconditionally in
    // loadChatPosition and survives across SPA navs. Stripping it caused the
    // CSS rule for `body.hs-platform-yt.hs-chat-right #hs-mc-container`
    // to stop matching when applyChatPosition fired before ytd-watch-flexy
    // had mounted on a watch-page navigation, leaving the chat panel in
    // position:relative and the resize handle visibly snapping on commit.
    const isYtNonWatch = hostPlatform === 'yt' && !document.querySelector('ytd-watch-flexy');
    document.body.classList.remove('hs-chat-top', 'hs-chat-right', 'hs-chat-bottom', 'hs-chat-left');
    document.body.classList.toggle('hs-platform-yt', hostPlatform === 'yt');
    document.body.classList.toggle('hs-platform-twitch', hostPlatform !== 'yt' && !isKick);
    document.body.classList.toggle('hs-platform-kick', !!isKick);
    if (!isYtNonWatch) {
      document.body.classList.add(`hs-chat-${chatPosition}`);
    } else if (location.pathname === '/watch') {
      // We're on a watch URL but flexy hasn't mounted yet (SPA cold-load,
      // /watch → /watch transition where React unmounted then remounts).
      // Re-arm the flexy-mount observer so applyChatPosition fires again
      // once it's there. Without this, hs-chat-{position} stays missing
      // and CSS rules for non-right positions never match.
      try { watchYtFlexyMount() } catch (_) {}
    }
    document.body.classList.toggle('hs-mode-theatre', theatreMode);
    document.body.classList.toggle('hs-mode-normal', !theatreMode);
    // Push the chatWidth css var down so the per-position CSS can build offsets
    // off it (rather than chasing platform-specific selectors twice).
    document.documentElement.style.setProperty('--hs-chat-w', chatWidth + 'px');
    document.documentElement.style.setProperty('--hs-chat-h', chatHeight + 'px');
    // Refresh Twitch side-nav width — it can flip 50↔240 across a chat
    // toggle (user F11s, viewport crosses Twitch's expand breakpoint, etc).
    if (hostPlatform === 'twitch') updateTwitchSideNavWidth();
    // Apply inline-style overrides on platform-native elements that set
    // width/height with inline !important (CSS alone can't beat that).
    applyPlatformPositionOverrides();
    // Bulletproof orange resize handle — covers all 4 chat positions.
    positionChatResizeHandle();
    // Hide platform handles when chat is non-right OR when on YT (where
    // unified handle now owns chat-right too since YT uses position:fixed).
    hidePlatformResizeHandles(chatPosition !== 'right' || hostPlatform === 'yt');
    log('Chat position:', chatPosition, 'theatre:', theatreMode);
    // Reflow the multichat layout so input/overlay/picker re-anchor.
    try { _updateMcLayout?.() } catch (_) {}
    // YT computes player size in JS asynchronously and caches it; nudge it
    // to re-read CSS vars (margin, non-player-{width,height}) by dispatching
    // resize events at multiple timing points. The player init is async and
    // can complete after our applyChatPosition runs on initial load — without
    // multiple nudges, YT's own resize observer doesn't fire until ~10s.
    if (hostPlatform === 'yt' && !_suppressYtResizeDispatch) {
      const fire = () => { try { window.dispatchEvent(new Event('resize')) } catch (_) {} };
      fire();
      setTimeout(fire, 100);
      setTimeout(fire, 500);
      setTimeout(fire, 1500);
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
          container.style.removeProperty('overflow');
          // YT chat-right is now position:fixed via CSS rule — don't set
          // any inline geometry, let the stylesheet own it (works on
          // initial load without waiting for a C-cycle).
          if (isKick) {
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
      if (chatPosition === 'top' || chatPosition === 'bottom' || chatPosition === 'left' || chatPosition === 'right') {
        // Compute aspect-preserved player size for the freed area.
        // top/bottom: chat eats height, player fills the rest (full width).
        // left/right: chat eats width, player fills the rest (full height).
        let availH, availW;
        if (chatPosition === 'left' || chatPosition === 'right') {
          availW = Math.max(200, innerWidth - chatWidth);
          availH = innerHeight;
        } else {
          availH = Math.max(200, innerHeight - chatHeight);
          availW = innerWidth - 32;
        }
        const aspectW = availH * 16 / 9;
        const aspectH = availW * 9 / 16;
        // Pick the dimension that hits its limit first (16:9 fits inside both)
        let finalW, finalH;
        if (aspectW <= availW) { finalW = aspectW; finalH = availH; }
        else                   { finalW = availW; finalH = aspectH; }
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
      // Keep --hs-kick-sidebar-w in sync — Kick drops the sidebar from the
      // DOM at narrow widths, and main's padding-left depends on this value.
      syncKickSidebarVar()
      // Kick's player chain uses Tailwind `aspect-video w-full` which locks
      // height = width × 9/16 — it ignores the freed area when chat eats
      // top/bottom. Force aspect-preserved width + height inline on the
      // player wrapper + injected container. Don't touch <main> — that's
      // the entire content column.
      const injected = document.querySelector('#injected-channel-player')
      const playerWrap = injected?.parentElement   // div.bg-black, immediate player box
      const kickPlayerEls = [playerWrap, injected].filter(Boolean)
      const KICK_PLAYER_GEOM = ['width', 'height', 'max-width', 'max-height', 'min-height', 'aspect-ratio']
      // Strip stale overrides from any element no longer in our target list.
      // First buggy version of this branch targeted <main> by mistake, so
      // clean up any leftover marker so legacy inline styles don't pin main's
      // size after a fresh load.
      const targetSet = new Set(kickPlayerEls)
      for (const stale of document.querySelectorAll('[data-_hs-c-kick-sized]')) {
        if (targetSet.has(stale)) continue
        delete stale.dataset._hsCKickSized
        KICK_PLAYER_GEOM.forEach(p => stale.style.removeProperty(p))
      }
      if (chatPosition === 'top' || chatPosition === 'bottom' || chatPosition === 'left' || chatPosition === 'right') {
        const navEl = document.querySelector('nav, [class*="navbar"]')
        const navH = navEl ? Math.round(navEl.getBoundingClientRect().height) : 60
        // Kick reserves space for its left sidebar (~56px) inside main's flex
        // parent — when the sidebar is present, the freed video area is
        // innerWidth - chatWidth - sidebar. Use the live measurement (not a
        // CSS var) because Kick drops the sidebar from the DOM at narrow
        // viewports, where subtracting 56 would shrink the player needlessly.
        const sidebarW = getKickSidebarWidth()
        let availH, availW
        if (chatPosition === 'right') {
          availW = Math.max(200, innerWidth - chatWidth - sidebarW)
          availH = Math.max(200, innerHeight - navH)
        } else if (chatPosition === 'left') {
          // chat panel is fixed at left:0 width:chatW — it covers the sidebar.
          // Subtracting sidebar again leaves a useless gap on the right edge
          // of the video.
          availW = Math.max(200, innerWidth - chatWidth)
          availH = Math.max(200, innerHeight - navH)
        } else {
          availH = Math.max(200, innerHeight - chatHeight - navH)
          availW = Math.max(200, innerWidth - sidebarW)
        }
        const aspectW = availH * 16 / 9
        const aspectH = availW * 9 / 16
        let finalW, finalH
        if (aspectW <= availW) { finalW = aspectW; finalH = availH }
        else                   { finalW = availW; finalH = aspectH }
        const wPx = Math.round(finalW) + 'px'
        const hPx = Math.round(finalH) + 'px'
        for (const el of kickPlayerEls) {
          el.dataset._hsCKickSized = '1'
          el.style.setProperty('width', wPx, 'important')
          el.style.setProperty('height', hPx, 'important')
          el.style.setProperty('max-width', wPx, 'important')
          el.style.setProperty('max-height', hPx, 'important')
          el.style.setProperty('aspect-ratio', 'auto', 'important')
        }
        // Kick re-asserts inline `height: unset` on the wrapper post-render.
        // Re-apply on the next frame so our values stick.
        requestAnimationFrame(() => {
          for (const el of kickPlayerEls) {
            if (!el.dataset._hsCKickSized) continue
            el.style.setProperty('width', wPx, 'important')
            el.style.setProperty('height', hPx, 'important')
            el.style.setProperty('max-width', wPx, 'important')
            el.style.setProperty('max-height', hPx, 'important')
          }
        })
      } else {
        // chat-right: clear our overrides — Kick's native layout owns sizing.
        for (const el of kickPlayerEls) {
          if (el?.dataset._hsCKickSized === '1') {
            delete el.dataset._hsCKickSized
            KICK_PLAYER_GEOM.forEach(p => el.style.removeProperty(p))
          }
        }
      }
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
          // Twitch's persistent-player has position:absolute with no CSS
          // rule setting `top`. The previous code removed inline top expecting
          // Twitch's React effect to re-apply it — but on certain layouts
          // (narrow window / chat resize / cold load) Twitch never sets it,
          // so the element falls to its natural-flow position at the bottom
          // of root-scrollable__wrapper (y ≈ 2000+px), pushing the video
          // off-screen below the about section. Pin it explicitly to top:0
          // (within root-scrollable__wrapper, that's the player slot).
          pp.style.setProperty('top', '0', 'important');
          pp.style.setProperty('left', '0', 'important');
          pp.style.removeProperty('bottom');
          pp.style.removeProperty('right');
          pp.style.removeProperty('max-height');
          pp.style.removeProperty('height');
          pp.style.removeProperty('width');
        } else if (chatPosition === 'left') {
          // chat-left: only shift the player horizontally. Don't touch
          // top/bottom/right/width/height — Twitch's natural 16:9 sizing
          // already gives the right height (and leaves room for the
          // channel-info bar below the player). Forcing bottom:0 here
          // would stretch the player to full viewport height and overlap
          // the follow/sub/gift buttons. Width/height CSS rule below is
          // also gated to chat-top/bottom only.
          // Note: w above is a CSS string ("Npx"); for arithmetic use
          // the raw chatWidth number.
          // Containing block (.root-scrollable__wrapper) starts AFTER
          // Twitch's side-nav (50px collapsed, ~240px expanded on wide
          // viewports), which our HS panel covers, so subtract the live
          // nav width to avoid double-counting.
          const leftInsetPx = Math.max(0, chatWidth - _twitchSideNavW) + 'px';
          pp.style.setProperty('left', leftInsetPx, 'important');
          pp.style.setProperty('inset-inline-start', leftInsetPx, 'important');
        } else {
          // chat-top / chat-bottom: full overhaul. Width/height are
          // handled by the .hs-chat-* CSS rules (width:auto !important /
          // height:auto !important). We can't do it here via inline
          // setProperty('important') because Twitch's React effect later
          // does `el.style.height = 'X'` which wipes the inline priority
          // — only a stylesheet rule survives that.
          pp.style.removeProperty('width');
          pp.style.removeProperty('height');
          pp.style.removeProperty('max-height');
          pp.style.setProperty('top', chatPosition === 'top' ? h : '0', 'important');
          pp.style.setProperty('bottom', chatPosition === 'bottom' ? h : '0', 'important');
          pp.style.setProperty('left', '0', 'important');
          pp.style.setProperty('right', '0', 'important');
          pp.style.setProperty('inset-inline-start', '0', 'important');
          pp.style.setProperty('inset-inline-end', '0', 'important');
        }
      }
    }

    // If the platform re-asserts its inline width/height (e.g. Twitch's
    // own chat-width JS on resize), we re-apply on the same hooks the
    // platform uses: window.resize + chat-width persistence. No observer
    // here — observers on style attrs loop on our own writes.
  }

  function rotateChatPosition() {
    // Strict 4-state cycle: right → bottom → left → top → right.
    // No 'hidden' state — chat panel always visible so the C button stays
    // clickable. If chatPosition is invalid, normalize first then advance.
    const positions = ['right', 'bottom', 'left', 'top'];
    let idx = positions.indexOf(chatPosition);
    if (idx === -1) idx = 0; // invalid state → start from 'right' before advancing
    const prev = chatPosition;
    chatPosition = positions[(idx + 1) % positions.length];
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

  // Auth banner: shown when bg signals loggedIn=false AND the user has at least
  // one channel with a youtube URL — YT chat needs server-side scraping, which
  // requires auth, so without it the user sees zero YT messages and no clue why.
  function showAuthLoginBanner(loggedIn) {
    const container = document.getElementById('hs-mc-container')
    if (!container) return
    const id = 'hs-mc-auth-banner'
    const existing = document.getElementById(id)
    if (loggedIn) { existing?.remove(); return }
    const hasYt = Array.isArray(config?.channels) && config.channels.some(c => typeof c !== 'string' && c.youtube)
    if (!hasYt) { existing?.remove(); return }
    if (existing) return
    const banner = document.createElement('div')
    banner.id = id
    banner.className = 'hs-mc-auth-banner'
    banner.style.cssText = 'background:#ff8700;color:#000;font:600 11px/1.4 monospace;padding:6px 10px;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px;'
    const text = document.createElement('span')
    text.textContent = 'youtube chat needs heatsync login —'
    const link = document.createElement('a')
    link.href = 'https://heatsync.org/settings/account'
    link.target = '_blank'
    link.rel = 'noopener'
    link.textContent = 'sign in'
    link.style.cssText = 'color:#000;text-decoration:underline;font-weight:700;'
    const dismiss = document.createElement('span')
    dismiss.textContent = '×'
    dismiss.style.cssText = 'cursor:pointer;font-weight:700;padding:0 4px;margin-left:4px;'
    dismiss.addEventListener('click', () => banner.remove())
    banner.append(text, link, dismiss)
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
      if (msg.type === 'auth_changed') {
        try { showAuthLoginBanner(!!msg.loggedIn) } catch (e) {}
      }
      if (msg.type === 'cosmetics_update') {
        mcBttvBadgeMap = new Map(Object.entries(msg.bttvBadges || {}))
        mcFfzBadgeMap = new Map(Object.entries(msg.ffzBadges || {}))
        mcChatterinoBadgeMap = new Map(Object.entries(msg.chatterinoBadges || {}))
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
        // Inventory just changed emoteCache contents — picker is stale.
        markPickerDirty();
        prebuildPickerIdle();
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

    // ── PHASE 0: synchronous prep (no awaits) ─────────────────────────────
    // Inject CSS NOW so the panel paints with correct styles the moment it
    // mounts. injectStyles has zero settings deps — moving it before any
    // await shaves ~10-15ms off the cold visual path.
    injectStyles();
    detectOfflineState();
    if (isPopout) document.body.classList.add('hs-popout');
    currentUsername = getCurrentUsername();

    // ── PHASE 1: warm caches in parallel ──────────────────────────────────
    // Prime ui_settings cache so the 18+ load* functions all pull from one
    // in-flight Promise. Also fan out independent storage.local reads.
    const _uiPrime = cachedUiSettings()
    const _localPrime = chrome.storage.local.get([STORAGE_KEY, 'user_info', 'muted_users'])
    await loadConfig();
    if (!config.enabled) return;
    log('Initializing...');

    // ── PHASE 2: hydrate username + muted users from prefetched local ─────
    try {
      const local = await _localPrime
      if (!currentUsername && local.user_info?.username) {
        currentUsername = local.user_info.username.toLowerCase()
      }
      if (Array.isArray(local.muted_users)) {
        const now = Date.now()
        for (const entry of local.muted_users) {
          const u = (typeof entry === 'string' ? entry : entry.username)?.toLowerCase()
          const exp = typeof entry === 'string' ? null : entry.expiresAt
          if (u && (!exp || exp > now)) mutedUsers.add(u)
        }
      }
    } catch {}
    log('Username:', currentUsername);

    // ── PHASE 3: settings hydration + emote load (all in parallel) ────────
    // migrateSettingsToSync, all 23 load* funcs, blocked-emotes, and emotes
    // all share the cached ui_settings or hit independent local keys; they
    // can run concurrently. Previously this was 3 sequential await steps.
    await Promise.all([
      _uiPrime,  // already in flight; just await here to ensure it landed
      migrateSettingsToSync(),
      loadActiveTab(),
      loadTabsPosition(),
      loadChatPosition(),
      loadLivePlatformMap(),
      loadEmoteSize(),
      loadWysiwygSetting(),
      loadLinksSetting(),
      loadViModeSetting(),
      loadInlineNotifSettings(),
      loadHermesSettings(),
      loadAutomodSettings(),
      loadPlatformBadgesSetting(),
      loadZebraSetting(),
      loadPlatformFilters(),
      loadAutoHideSetting(),
      loadTimestampsSetting(),
      loadAvatarsSetting(),
      loadAutoClaimSetting(),
      loadDimTimeoutsSetting(),
      loadReadableNamesSetting(),
      loadSmartCompletionSetting(),
      loadFirstChatterGlowSetting(),
      loadKeywordHighlightsSetting(),
      loadOfflineEventsSetting(),
      loadBlockedEmotes(),
      loadEmotes(),
      loadSenderEmoteSets(),
    ]);
    // Init done — drop the cache so subsequent reads see fresh data.
    invalidateUiSettingsCache()

    // Request background to re-send channel emotes (may have been fetched before we loaded)
    try {
      chrome.runtime.sendMessage({ type: 'get_channel_emotes' });
    } catch (e) { /* context invalidated */ }

    setupEmoteTooltipHandlers();
    setupUserTooltipHandlers();
    setupLinkTooltipHandlers();
    setupProfileCardHandlers();
    listenForSettingsChanges();

    // Request initial BTTV/FFZ/Chatterino badge maps from background
    safeSendMessage({ type: 'get_bulk_badges' }).then(resp => {
      if (resp?.bttvBadges) mcBttvBadgeMap = new Map(Object.entries(resp.bttvBadges))
      if (resp?.ffzBadges) mcFfzBadgeMap = new Map(Object.entries(resp.ffzBadges))
      if (resp?.chatterinoBadges) mcChatterinoBadgeMap = new Map(Object.entries(resp.chatterinoBadges))
    }).catch(() => {})

    // Load heatsync auth state
    loadHsAuth();

    // Probe bg for auth state so the login banner can show on tabs that opened
    // after the initial auth_changed broadcast already fired (cookies.onChanged
    // and the no_token boot signal are both one-shot).
    try {
      chrome.runtime.sendMessage({ type: 'get_auth_state' }, (resp) => {
        if (chrome.runtime.lastError || !resp) return
        try { showAuthLoginBanner(!!resp.loggedIn) } catch {}
      })
    } catch {}

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

      // Subscribe YouTube. On a YT watch/live URL getCurrentChannel returns the
      // 11-char videoId — feeding that to `@${id}/live` produces a bogus
      // @<videoId>/live URL that the server can't resolve. Use the actual
      // /watch?v=<id> form whenever we're on a YT video page so the server has
      // something concrete to bind to. The previous `length > 20` check never
      // matched (videoIds are 11), so YT-tab subs were silently broken.
      const onYtVideoPage = hostPlatform === 'yt' && /\/watch|\/live\//.test(location.pathname + location.search)
      const autoYtUrl = onYtVideoPage
        ? `https://youtube.com/watch?v=${currentChannel}`
        : ytUrl
      chrome.runtime.sendMessage({
        type: 'youtube_ws_subscribe', url: autoYtUrl, channelId: '__live_yt_auto__'
      }).catch(() => {})
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

    // MutationObserver-based mount waiter: fires the moment `find()` returns
    // truthy, then disconnects. Beats the old 500ms polling (avg ~250ms
    // perceived load lag) — content scripts run at document_idle, and the
    // chat container often mounts within 50-150ms of that. 15s safety
    // fallback timer in case the observer never fires (SPA bug, slow page).
    const waitForMount = (find, label) => {
      if (mcSignal?.aborted) return;
      const inject = () => {
        if (mcSignal?.aborted) return;
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
      };
      if (find()) { inject(); return; }
      let done = false;
      const obs = new MutationObserver(() => {
        if (done || !find()) return;
        done = true;
        obs.disconnect();
        inject();
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      cleanup.trackObserver(obs);
      cleanup.setTimeout(() => {
        if (done) return;
        done = true;
        obs.disconnect();
        if (!find()) log('Failed to find', label, 'after 15s');
        else inject();
      }, 15000);
    };
    if (hostPlatform === 'yt') {
      waitForMount(
        () => document.getElementById('chat-container') ||
              document.querySelector('ytd-live-chat-frame#chat')?.parentElement,
        'YouTube chat container'
      );
    } else if (isKick) {
      waitForMount(
        () => document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]'),
        'Kick chatroom'
      );
    } else {
      // Twitch: try to hook into React, fall back to MutationObserver
      tryHookReact();
    }
  }

  /**
   * Attempt to hook React components, with fallback.
   * Fires the moment the chat-room appears via MutationObserver — the old
   * 500ms poll meant up to 500ms of perceived lag after Twitch's React
   * actually mounted. Now: usually <1 frame.
   */
  function tryHookReact() {
    let done = false;
    const tryHook = () => {
      if (done || mcSignal?.aborted) return false;
      const chatRoom = findChatRoomComponent();
      if (chatRoom) {
        done = true;
        log('Found chat room component');
        patchChatRoomRender(chatRoom);
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
        return true;
      }
      const chatContainer = document.querySelector('[class*="chat-room__content"]') ||
                           document.querySelector('[data-a-target="chat-room-component"]') ||
                           document.querySelector('.chat-shell') ||
                           document.querySelector('[class*="stream-chat"]') ||
                           document.querySelector('.chat-room');
      if (chatContainer) {
        done = true;
        log('Using fallback DOM injection');
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
        return true;
      }
      return false;
    };

    if (tryHook()) return;
    const obs = new MutationObserver(() => { if (tryHook()) obs.disconnect() });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    cleanup.trackObserver(obs);
    // Safety net: a slow tab might mount after observer-window misses; bail
    // after 15s to free the observer.
    cleanup.setTimeout(() => {
      if (done) return;
      done = true;
      obs.disconnect();
      log('Failed to find chat components after 15s');
    }, 15000);
  }

  /**
   * Watch for layout changes and re-inject elements if needed
   * This handles theatre mode, popouts, SPA navigation
   */
  let _layoutWatcherStarted = false
  function startLayoutWatcher() {
    if (_layoutWatcherStarted) return
    _layoutWatcherStarted = true

    const reinject = () => {
      if (spaReinitializing) return;
      if (document.getElementById('hs-mc-container')) return;
      log('Container missing, re-injecting...');
      tabBarElement = null;
      overlayElement = null;
      inputBarElement = null;
      resizeObserver = null;
      ensureUIElements();
      updateTabBar();
      renderMessages(currentTab);
    }

    // Faster safety-net (was 5000ms — caused a 2-5s panel-gone window on Kick
    // after the fast mount started landing during React's first reconciliation
    // pass).
    cleanup.setInterval(() => reinject(), 500, 'layout-check');

    // Wide-scope MutationObserver: watches documentElement subtree so
    // ANY removal of #hs-mc-container is caught — including when our
    // container's React-owned parent is itself replaced (which would
    // detach a parent-scoped observer and leave us blind).
    let _checkScheduled = false
    cleanup.trackObserver(new MutationObserver(() => {
      if (spaReinitializing || _checkScheduled) return;
      if (document.getElementById('hs-mc-container')) return;
      _checkScheduled = true
      // Coalesce per-frame: many React mutations fire in one tick; we only
      // need to react once.
      cleanup.raf(() => { _checkScheduled = false; reinject() })
    }), 'layout-observer').observe(
      document.documentElement,
      { childList: true, subtree: true }
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
    // Fallback rotate paths — heatsync-button.js settings panel posts these
    // so the user always has a way to rotate even if the chat tabbar is
    // somehow not clickable (e.g. extreme drag, weird layout state).
    if (event.data?.type === 'heatsync-rotate-tabs') {
      try { rotateTabPosition() } catch (e) { log('rotate-tabs message handler:', e) }
    }
    if (event.data?.type === 'heatsync-rotate-chat') {
      try { rotateChatPosition() } catch (e) { log('rotate-chat message handler:', e) }
    }
  }, { signal: mcSignal })

  // YouTube SPA navigation
  if (hostPlatform === 'yt') {
    document.addEventListener('yt-navigate-finish', () => handleMcNav(), { signal: mcSignal })
  }

  // Fallback: polling in case MAIN world script didn't load
  cleanup.setInterval(() => handleMcNav(), 5000, 'spa-nav-fallback');

})();
