// YouTube Live Chat content script — message extraction, emote overlay, autocomplete, send relay
// Runs in the live_chat iframe. Lib-bundled at build time (CONFIG, cleanup, utils, browser-api available).
(function() {
  'use strict'

  const DEBUG = false
  const log = DEBUG ? console.log.bind(console, '[hs-youtube]') : () => {}

  const ac = new AbortController()
  const signal = ac.signal

  // Skip chat replays (VODs) — only process live chat
  if (window.location.pathname.includes('live_chat_replay')) return

  // Extract videoId from URL (?v= param or /live_chat?v=)
  const videoId = new URLSearchParams(window.location.search).get('v') || ''

  // Context validity tracking
  let extensionContextValid = true
  async function safeSendMessage(message) {
    if (!extensionContextValid) return null
    try {
      return await chrome.runtime.sendMessage(message)
    } catch (err) {
      if (err.message?.includes('context invalidated')) extensionContextValid = false
      return null
    }
  }

  // ─── Emote Inventory ─────────────────────────────────────────────────────────

  let emoteMap = new Map()          // name → { name, url, hash, ... }
  let blockedEmotes = new Set()
  let inventoryLoaded = false

  let channelEmotesByOwner = {} // { ownerName: emote[] } — populated from background broadcasts

  function rebuildEmoteMap(inventory, globals) {
    const map = new Map()
    // Globals first (lower priority)
    if (globals) {
      for (const e of globals) {
        if (e?.name && !blockedEmotes.has(e.hash || e.name)) map.set(e.name, e)
      }
    }
    // Channel emotes (BTTV/FFZ/7TV/Twitch sub) — between globals and inventory
    for (const ownerEmotes of Object.values(channelEmotesByOwner)) {
      if (!Array.isArray(ownerEmotes)) continue
      for (const e of ownerEmotes) {
        if (e?.name && !blockedEmotes.has(e.hash || e.name)) map.set(e.name, e)
      }
    }
    // Inventory overrides everything
    if (inventory) {
      for (const e of inventory) {
        if (e?.name && !blockedEmotes.has(e.hash || e.name)) map.set(e.name, e)
      }
    }
    emoteMap = map
    log('emote map rebuilt:', map.size, 'emotes')
  }

  async function loadEmoteInventory() {
    try {
      // Fast path: storage
      const stored = await chrome.storage.local.get(['emote_inventory', 'global_emotes', 'blocked_emotes', 'channel_emotes_map'])
      if (stored.blocked_emotes) blockedEmotes = new Set(stored.blocked_emotes)
      if (stored.channel_emotes_map && typeof stored.channel_emotes_map === 'object') {
        channelEmotesByOwner = stored.channel_emotes_map
      }
      if (stored.emote_inventory || stored.global_emotes) {
        rebuildEmoteMap(stored.emote_inventory || [], stored.global_emotes || [])
        inventoryLoaded = true
      }
      // Background fallback
      if (!inventoryLoaded) {
        const resp = await safeSendMessage({ type: 'get_inventory' })
        if (resp?.emotes) {
          rebuildEmoteMap(resp.emotes, stored.global_emotes || [])
          inventoryLoaded = true
        }
      }
    } catch (e) {
      log('emote load failed:', e.message)
    }
  }

  // Listen for inventory updates from background
  const ytInventoryListener = (msg, _sender, sendResponse) => {
    if (msg.type === 'inventory_update' && msg.emotes) {
      rebuildEmoteMap(msg.emotes, Array.from(emoteMap.values()))
    } else if (msg.type === 'global_emotes_update' && msg.emotes) {
      chrome.storage.local.get(['emote_inventory']).then(stored => {
        rebuildEmoteMap(stored.emote_inventory || [], msg.emotes)
      })
    } else if (msg.type === 'blocked_update' && Array.isArray(msg.blocked)) {
      blockedEmotes = new Set(msg.blocked)
      chrome.storage.local.get(['emote_inventory', 'global_emotes']).then(stored => {
        rebuildEmoteMap(stored.emote_inventory || [], stored.global_emotes || [])
      })
    } else if (msg.type === 'channel_emotes_update' && Array.isArray(msg.emotes) && msg.channelOwner) {
      channelEmotesByOwner[msg.channelOwner] = msg.emotes
      // Cap to most-recent 20 owners — long sessions with many channel switches
      // would otherwise grow this object forever.
      const keys = Object.keys(channelEmotesByOwner)
      if (keys.length > 20) {
        for (let i = 0; i < keys.length - 20; i++) delete channelEmotesByOwner[keys[i]]
      }
      chrome.storage.local.get(['emote_inventory', 'global_emotes']).then(stored => {
        rebuildEmoteMap(stored.emote_inventory || [], stored.global_emotes || [])
      })
    } else if (msg.type === 'youtube_send_relay') {
      handleSendRelay(msg)
      sendResponse({ ok: true })
      return true
    } else if (msg.type === 'youtube_insert_emote') {
      handleInsertEmote(msg.emoteName)
      sendResponse({ ok: true })
      return true
    }
  }
  chrome.runtime.onMessage.addListener(ytInventoryListener)
  window.addEventListener('pagehide', () => {
    try { chrome.runtime.onMessage.removeListener(ytInventoryListener) } catch {}
  }, { once: true })

  // ─── Emote Replacement ────────────────────────────────────────────────────────

  function isZeroWidth(emote) {
    if (!emote) return false
    if (emote.zeroWidth === true) return true
    if (typeof emote.flags === 'number' && (emote.flags & 257)) return true
    return false
  }

  function replaceEmotesInElement(messageEl) {
    if (!messageEl || emoteMap.size === 0) return

    const walker = document.createTreeWalker(messageEl, NodeFilter.SHOW_TEXT)
    const textNodes = []
    while (walker.nextNode()) textNodes.push(walker.currentNode)

    for (const textNode of textNodes) {
      const text = textNode.textContent
      if (!text?.trim()) continue

      const words = text.split(/(\s+)/)
      let hasEmote = false
      for (const w of words) {
        if (emoteMap.has(w)) { hasEmote = true; break }
      }
      if (!hasEmote) continue

      const frag = document.createDocumentFragment()
      let currentStack = null   // active <span class="heatsync-emote-stack"> or null

      for (const word of words) {
        const emote = emoteMap.get(word)
        if (emote) {
          const img = document.createElement('img')
          img.src = emote.url
          img.alt = emote.name
          img.title = emote.name
          img.className = 'heatsync-emote-yt'
          img.loading = 'lazy'

          if (isZeroWidth(emote) && currentStack) {
            // Stack onto the previous non-zero-width emote
            currentStack.appendChild(img)
          } else {
            // Non-zero-width emote: start a new potential stack anchor
            currentStack = document.createElement('span')
            currentStack.className = 'heatsync-emote-stack'
            currentStack.appendChild(img)
            frag.appendChild(currentStack)
          }
        } else {
          // Any non-emote token breaks the stacking chain
          currentStack = null
          frag.appendChild(document.createTextNode(word))
        }
      }
      textNode.parentNode.replaceChild(frag, textNode)
    }
  }

  // ─── 7TV Cosmetics (via heatsync profile linkage) ────────────────────────────

  const YT_COSMETICS_TTL = 30 * 60 * 1000  // 30 minutes
  const YT_COSMETICS_MAX = 500
  const YT_COSMETICS_PENDING_MAX = 8

  // username → { paint, badge, fetchedAt } | null (null = no profile/no cosmetics)
  const ytCosmeticsCache = new Map()
  const ytCosmeticsPending = new Set()
  let ytCosmeticsBatchTimer = null

  function get7TVBadgeUrl(badge) {
    if (!badge?.host) return ''
    const files = badge.host.files || []
    const file = files.find(f => f.name?.endsWith('.webp')) ||
                 files.find(f => f.name?.endsWith('.avif')) || files[0]
    if (!file) return ''
    const base = badge.host.url || ''
    const fullBase = base.startsWith('//') ? 'https:' + base : base
    return (fullBase.endsWith('/') ? fullBase : fullBase + '/') + file.name
  }

  function applyPaintToElement(el, paint) {
    if (!paint) return
    const fn = (paint.function || '').toLowerCase()
    if (fn === 'url' && paint.image_url) {
      if (!/^https:\/\//.test(paint.image_url)) return
      const safeCssUrl = paint.image_url.replace(/[()'"\\]/g, encodeURIComponent)
      el.style.backgroundImage = `url(${safeCssUrl})`
      el.style.backgroundSize = 'cover'
    } else if ((fn === 'linear-gradient' || fn === 'radial-gradient') && paint.stops?.length) {
      const stops = paint.stops.map(s => {
        const r = (s.color >>> 24) & 0xff
        const g = (s.color >>> 16) & 0xff
        const b = (s.color >>> 8) & 0xff
        const a = (s.color & 0xff) / 255
        return `rgba(${r},${g},${b},${a.toFixed(2)}) ${Math.round(s.at * 100)}%`
      }).join(', ')
      const safeAngle = Number.isFinite(Number(paint.angle)) ? Number(paint.angle) : 0
      const safeShape = /^(circle|ellipse)$/.test(paint.shape) ? paint.shape : 'circle'
      if (fn === 'linear-gradient') {
        el.style.backgroundImage = `linear-gradient(${safeAngle}deg, ${stops})`
      } else {
        el.style.backgroundImage = `radial-gradient(${safeShape}, ${stops})`
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
        return `drop-shadow(${Number(s.x_offset) || 0}px ${Number(s.y_offset) || 0}px ${Number(s.radius) || 0}px rgba(${r},${g},${b},${a.toFixed(2)}))`
      }).join(' ')
    }
    el.dataset.hsPaintApplied = '1'
  }

  function applyYtCosmeticsToMessage(node, username) {
    // Guard: this is called after async cosmetics fetch (~1-2s); the message
    // node may have been recycled by YouTube's chat virtualizer or the page
    // may have torn down. Avoid mutating detached DOM.
    if (!node || !node.isConnected) return
    const cosmetic = ytCosmeticsCache.get(username)
    if (!cosmetic) return

    const nameEl = node.querySelector('#author-name')
    if (!nameEl) return

    // Badge — insert before author name element
    if (cosmetic.badge && !node.dataset.hs7tvYtBadgeDone) {
      const url = get7TVBadgeUrl(cosmetic.badge)
      if (url && /^https:\/\//.test(url)) {
        const img = document.createElement('img')
        img.className = 'hs-7tv-badge hs-yt-cosmetic-badge'
        img.src = url
        const title = cosmetic.badge.tooltip || cosmetic.badge.name || '7TV'
        img.title = title
        img.alt = title
        nameEl.parentNode.insertBefore(img, nameEl)
        node.dataset.hs7tvYtBadgeDone = '1'
      }
    }

    // Paint — gradient/color on author name text
    if (cosmetic.paint && !nameEl.dataset.hsPaintApplied) {
      applyPaintToElement(nameEl, cosmetic.paint)
    }
  }

  function queueYtCosmeticsLookup(username) {
    if (!username) return
    const cached = ytCosmeticsCache.get(username)
    if (cached !== undefined && Date.now() - (cached?.fetchedAt ?? 0) < YT_COSMETICS_TTL) return
    if (ytCosmeticsPending.has(username)) return
    ytCosmeticsPending.add(username)
    if (ytCosmeticsPending.size >= YT_COSMETICS_PENDING_MAX) {
      if (ytCosmeticsBatchTimer) { clearTimeout(ytCosmeticsBatchTimer); ytCosmeticsBatchTimer = null }
      flushYtCosmeticsBatch()
      return
    }
    if (!ytCosmeticsBatchTimer) {
      if (signal.aborted) return
      ytCosmeticsBatchTimer = cleanup.setTimeout(() => {
        ytCosmeticsBatchTimer = null
        if (signal.aborted) return
        flushYtCosmeticsBatch()
      }, 600)
    }
  }
  signal.addEventListener('abort', () => {
    if (ytCosmeticsBatchTimer) { cleanup.clearTimeout(ytCosmeticsBatchTimer); ytCosmeticsBatchTimer = null }
    if (_setupAutocompleteRetryTimer) { cleanup.clearTimeout(_setupAutocompleteRetryTimer); _setupAutocompleteRetryTimer = null }
    // Clear cosmetics caches so cross-video bleed can't happen on next mount
    ytCosmeticsCache.clear()
    ytCosmeticsPending.clear()
  }, { once: true })

  async function flushYtCosmeticsBatch() {
    if (ytCosmeticsPending.size === 0) return
    const batch = [...ytCosmeticsPending].slice(0, YT_COSMETICS_PENDING_MAX)
    batch.forEach(u => ytCosmeticsPending.delete(u))

    const now = Date.now()

    await Promise.all(batch.map(async (username) => {
      try {
        // Step 1: resolve heatsync profile → twitch_id
        const profileResp = await safeSendMessage({
          type: 'api_fetch',
          path: `/api/profile/${encodeURIComponent(username)}`,
          method: 'GET'
        })
        const twitchId = profileResp?.data?.twitch_id || profileResp?.twitch_id || null
        if (!twitchId) {
          // Cache null so we don't refetch for 30min
          evictYtCache()
          ytCosmeticsCache.set(username, { paint: null, badge: null, fetchedAt: now })
          return
        }

        // Step 2: fetch 7TV cosmetics via existing background handler
        const cosmeticResp = await safeSendMessage({
          type: 'get_user_cosmetics',
          twitchIds: [twitchId]
        })
        const cosmetic = cosmeticResp?.cosmetics?.[twitchId] || null
        evictYtCache()
        ytCosmeticsCache.set(username, {
          paint: cosmetic?.paint || null,
          badge: cosmetic?.badge || null,
          fetchedAt: now
        })
      } catch (e) {
        log('yt cosmetics fetch failed for', username, e?.message)
        evictYtCache()
        ytCosmeticsCache.set(username, { paint: null, badge: null, fetchedAt: now })
      }
    }))

    // Apply to any already-rendered messages waiting on cosmetics
    applyPendingYtCosmetics(batch)

    // Drain remainder if any
    if (ytCosmeticsPending.size > 0 && !ytCosmeticsBatchTimer) {
      if (signal.aborted) return
      ytCosmeticsBatchTimer = cleanup.setTimeout(() => {
        ytCosmeticsBatchTimer = null
        if (signal.aborted) return
        flushYtCosmeticsBatch()
      }, 2000)
    }
  }

  function evictYtCache() {
    if (ytCosmeticsCache.size >= YT_COSMETICS_MAX) {
      ytCosmeticsCache.delete(ytCosmeticsCache.keys().next().value)
    }
  }

  function applyPendingYtCosmetics(usernames) {
    const container = document.querySelector('yt-live-chat-item-list-renderer #items')
    if (!container) return
    const userSet = new Set(usernames)
    container.querySelectorAll('[data-hs-yt-user]').forEach(node => {
      if (node.dataset.hs7tvYtDone === '1') return
      const username = node.dataset.hsYtUser
      if (userSet.has(username)) {
        applyYtCosmeticsToMessage(node, username)
        if (ytCosmeticsCache.get(username)?.paint || ytCosmeticsCache.get(username)?.badge) {
          node.dataset.hs7tvYtDone = '1'
        }
      }
    })
  }

  // ─── CSS Injection ────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('heatsync-yt-styles')) return
    const style = document.createElement('style')
    style.id = 'heatsync-yt-styles'
    style.textContent = `
      .heatsync-emote-yt {
        height: 28px;
        vertical-align: middle;
        margin: -2px 1px;
        display: inline;
      }
      .hs-yt-cosmetic-badge {
        height: 18px;
        width: auto;
        vertical-align: middle;
        margin-right: 3px;
        display: inline-block;
        cursor: default;
      }
      .hs-yt-autocomplete {
        position: absolute;
        bottom: 100%;
        left: 0;
        right: 0;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 10000;
        display: none;
      }
      .hs-yt-autocomplete.active { display: block; }
      .hs-yt-ac-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 13px;
        color: #ddd;
      }
      .hs-yt-ac-item:hover, .hs-yt-ac-item.selected {
        background: #333;
      }
      .hs-yt-ac-item img {
        height: 24px;
        width: auto;
      }
      .hs-yt-toast {
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(30,30,30,0.92);
        color: #eee;
        font-size: 12px;
        padding: 5px 10px;
        border-radius: 4px;
        pointer-events: none;
        z-index: 99999;
        opacity: 1;
        transition: opacity 0.3s;
      }
      .hs-yt-toast.fade { opacity: 0; }
    `
    document.head.appendChild(style)
  }

  // ─── Message Extraction (existing logic) ──────────────────────────────────────

  function waitForContainer() {
    return new Promise((resolve, reject) => {
      let elapsed = 0
      const check = () => {
        if (signal.aborted) return reject(new Error('aborted'))
        const el = document.querySelector('yt-live-chat-item-list-renderer #items')
        if (el) return resolve(el)
        if (elapsed >= 15000) return reject(new Error('YouTube chat container not found'))
        elapsed += 500
        cleanup.setTimeout(check, 500)
      }
      check()
    })
  }

  function extractColor(authorEl) {
    if (!authorEl) return '#ffffff'
    const computed = window.getComputedStyle(authorEl)
    const color = computed.color
    if (!color || color === 'rgba(0, 0, 0, 0)') return '#ffffff'
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return '#ffffff'
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
    if (r > 200 && g > 200 && b > 200) return '#ffffff'
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }

  function extractAvatar(el) {
    const img = el.querySelector('#author-photo img')
    if (!img?.src) return ''
    return img.src.replace(/=s\d+[^=]*$/, '=s64-k-c0x00ffffff-no-rj')
  }

  function extractBadges(el) {
    const authorType = el.getAttribute('author-type') || ''
    const badges = []
    if (authorType === 'owner') badges.push({ type: 'owner', label: 'Owner' })
    else if (authorType === 'moderator') badges.push({ type: 'moderator', label: 'Mod' })

    const badgeContainer = el.querySelector('#author-badges')
    if (badgeContainer) {
      for (const br of badgeContainer.querySelectorAll('yt-live-chat-author-badge-renderer')) {
        const img = br.querySelector('img')
        if (img?.src) {
          const tooltip = br.getAttribute('aria-label') || br.getAttribute('shared-tooltip-text') ||
                          img.alt || img.getAttribute('shared-tooltip-text') || 'Member'
          badges.push({ type: 'member', label: tooltip, url: img.src })
        }
      }
    }
    return badges.length > 0 ? badges : undefined
  }

  function extractMessage(el) {
    const authorEl = el.querySelector('#author-name')
    // Fall through selectors and prefer the first one with non-whitespace
    // content — gift renderers often have an empty #message but populated
    // #header-primary-text, so static-priority lookup misses them.
    let messageEl = null
    for (const sel of ['#message', '#header-subtext', '#header-primary-text', '#primary-text']) {
      const e = el.querySelector(sel)
      if (e && e.textContent && e.textContent.trim()) { messageEl = e; break }
    }
    if (!messageEl) messageEl = el.querySelector('#message') || el.querySelector('#header-subtext') || el.querySelector('#header-primary-text')
    if (!authorEl || !messageEl) return null

    const user = authorEl.textContent.trim()
    if (!user) return null

    const color = extractColor(authorEl)
    const avatar = extractAvatar(el)
    const badges = extractBadges(el)

    let text = ''
    const emotes = []
    const seenAlts = new Set()
    for (const node of messageEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent
      } else if (node.nodeName === 'IMG') {
        const alt = node.alt || ''
        text += alt
        if (alt && node.src && !seenAlts.has(alt)) {
          seenAlts.add(alt)
          emotes.push({ alt, url: node.src })
        }
      } else if (node.textContent) {
        text += node.textContent
      }
    }
    text = text.trim()
    if (!text) return null

    return { user, text, emotes, color, avatar, badges }
  }

  const SUPPORTED_RENDERERS = new Set([
    'YT-LIVE-CHAT-TEXT-MESSAGE-RENDERER',
    'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER',
    'YT-LIVE-CHAT-PAID-STICKER-RENDERER',
    'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER',
    'YT-LIVE-CHAT-SPONSORSHIPS-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER',
    'YT-LIVE-CHAT-SPONSORSHIPS-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER',
    'YT-LIVE-CHAT-SPONSORSHIPS-HEADER-RENDERER'
  ])

  function getMsgType(tagName) {
    switch (tagName) {
      case 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER': return 'superchat'
      case 'YT-LIVE-CHAT-PAID-STICKER-RENDERER': return 'supersticker'
      case 'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER': return 'membership'
      case 'YT-LIVE-CHAT-SPONSORSHIPS-GIFT-PURCHASE-ANNOUNCEMENT-RENDERER': return 'giftpurchase'
      case 'YT-LIVE-CHAT-SPONSORSHIPS-GIFT-REDEMPTION-ANNOUNCEMENT-RENDERER': return 'giftredemption'
      case 'YT-LIVE-CHAT-SPONSORSHIPS-HEADER-RENDERER': return 'giftheader'
      default: return 'text'
    }
  }

  function extractSuperchatData(el) {
    const amountEl = el.querySelector('#purchase-amount, #purchase-amount-chip')
    const amount = amountEl?.textContent?.trim() || ''
    const header = el.querySelector('#header, #card')
    const bg = header?.style?.backgroundColor || ''
    return { amount, scColor: bg }
  }

  function extractStickerData(el) {
    const amountEl = el.querySelector('#purchase-amount-chip')
    const amount = amountEl?.textContent?.trim() || ''
    const stickerEl = el.querySelector('#sticker img')
    const url = stickerEl?.src || ''
    const alt = stickerEl?.alt || 'sticker'
    return { amount, sticker: { url, alt } }
  }

  function processNode(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    if (!SUPPORTED_RENDERERS.has(node.tagName)) return
    if (node.dataset.hsYtProcessed) return
    node.dataset.hsYtProcessed = '1'

    const msg = extractMessage(node)
    if (!msg) return

    const msgType = getMsgType(node.tagName)

    // Emote overlay — replace emote text with images in the message element
    const messageEl = node.querySelector('#message')
    if (messageEl && emoteMap.size > 0) {
      replaceEmotesInElement(messageEl)
    }

    // 7TV cosmetics via heatsync profile linkage
    if (msg.user) {
      node.dataset.hsYtUser = msg.user
      const cached = ytCosmeticsCache.get(msg.user)
      if (cached !== undefined) {
        // Already resolved — apply immediately if there's something to show
        if (cached.paint || cached.badge) applyYtCosmeticsToMessage(node, msg.user)
      } else {
        // Queue a profile lookup (deduped, batched)
        queueYtCosmeticsLookup(msg.user)
      }
    }

    const payload = {
      type: 'youtube_chat_message',
      videoId,
      channelId: videoId,
      user: msg.user,
      text: msg.text,
      msgType,
      color: msg.color,
      time: Date.now(),
      platform: 'youtube',
      emotes: msg.emotes.length > 0 ? msg.emotes : undefined,
      avatar: msg.avatar || undefined,
      badges: msg.badges
    }

    if (msgType === 'superchat') {
      const sc = extractSuperchatData(node)
      payload.amount = sc.amount
      payload.scColor = sc.scColor
    } else if (msgType === 'supersticker') {
      const st = extractStickerData(node)
      payload.amount = st.amount
      payload.sticker = st.sticker
    } else if (msgType === 'membership' || msgType === 'giftpurchase' || msgType === 'giftredemption' || msgType === 'giftheader') {
      // Pull the system text from whichever header slot YouTube populated for
      // this renderer variant — gift announcements tend to use #header-primary-text,
      // memberships use #header-subtext, but selectors overlap so we accept any.
      const headerEl = node.querySelector('#header-subtext, #header-primary-text, #primary-text')
      if (headerEl) payload.systemMsg = headerEl.textContent.trim()
    }

    log('yt msg:', msgType, msg.user, msg.text)
    safeSendMessage(payload)
  }

  // ─── Autocomplete ─────────────────────────────────────────────────────────────

  let autocompleteEl = null
  let acItems = []
  let acSelectedIndex = -1
  let acVisible = false

  let _setupAutocompleteRetryTimer = null
  function setupAutocomplete() {
    if (signal.aborted) return
    const inputRenderer = document.querySelector('yt-live-chat-text-input-field-renderer')
    if (!inputRenderer) {
      if (_setupAutocompleteRetryTimer) cleanup.clearTimeout(_setupAutocompleteRetryTimer)
      if (signal.aborted) return
      _setupAutocompleteRetryTimer = cleanup.setTimeout(setupAutocomplete, 1000)
      return
    }

    const input = inputRenderer.querySelector('div#input[contenteditable]')
    if (!input) {
      if (_setupAutocompleteRetryTimer) cleanup.clearTimeout(_setupAutocompleteRetryTimer)
      if (signal.aborted) return
      _setupAutocompleteRetryTimer = cleanup.setTimeout(setupAutocomplete, 1000)
      return
    }
    // Found — clear any pending retry
    if (_setupAutocompleteRetryTimer) { cleanup.clearTimeout(_setupAutocompleteRetryTimer); _setupAutocompleteRetryTimer = null }

    // Create autocomplete dropdown
    autocompleteEl = document.createElement('div')
    autocompleteEl.className = 'hs-yt-autocomplete'
    inputRenderer.style.position = 'relative'
    inputRenderer.appendChild(autocompleteEl)

    input.addEventListener('input', () => {
      const word = getWordAtCaret(input)
      if (word && word.length >= 2 && emoteMap.size > 0) {
        const matches = findEmoteMatches(word, 8)
        if (matches.length > 0) {
          showAutocomplete(matches, input)
          return
        }
      }
      hideAutocomplete()
    }, { signal })

    input.addEventListener('keydown', (e) => {
      if (!acVisible) return
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const selected = acItems[acSelectedIndex >= 0 ? acSelectedIndex : 0]
        if (selected) completeEmote(input, selected.name)
        hideAutocomplete()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        acSelectedIndex = Math.min(acSelectedIndex + 1, acItems.length - 1)
        updateAcSelection()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        acSelectedIndex = Math.max(acSelectedIndex - 1, 0)
        updateAcSelection()
      } else if (e.key === 'Escape') {
        hideAutocomplete()
      }
    }, { capture: true, signal })

    log('autocomplete ready')
  }

  function getWordAtCaret(el) {
    const sel = window.getSelection()
    if (!sel.rangeCount) return ''
    const range = sel.getRangeAt(0)
    if (!el.contains(range.startContainer)) return ''

    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return ''
    const text = node.textContent.substring(0, range.startOffset)
    const match = text.match(/(\S+)$/)
    return match ? match[1] : ''
  }

  function findEmoteMatches(prefix, limit) {
    const lower = prefix.toLowerCase()
    const results = []
    for (const [name, emote] of emoteMap) {
      if (name.toLowerCase().startsWith(lower)) {
        results.push(emote)
        if (results.length >= limit) break
      }
    }
    if (results.length < limit) {
      for (const [name, emote] of emoteMap) {
        if (!name.toLowerCase().startsWith(lower) && name.toLowerCase().includes(lower)) {
          results.push(emote)
          if (results.length >= limit) break
        }
      }
    }
    return results
  }

  function showAutocomplete(matches, input) {
    acItems = matches
    acSelectedIndex = 0
    acVisible = true

    // Build items using safe DOM methods
    autocompleteEl.textContent = ''
    matches.forEach((emote, i) => {
      const item = document.createElement('div')
      item.className = 'hs-yt-ac-item' + (i === 0 ? ' selected' : '')
      item.dataset.index = String(i)

      const img = document.createElement('img')
      img.src = emote.url
      img.alt = emote.name
      img.loading = 'lazy'
      item.appendChild(img)

      const span = document.createElement('span')
      span.textContent = emote.name
      item.appendChild(span)

      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault()
        completeEmote(input, emote.name)
        hideAutocomplete()
      })

      autocompleteEl.appendChild(item)
    })

    autocompleteEl.classList.add('active')
  }

  function hideAutocomplete() {
    if (!autocompleteEl) return
    acVisible = false
    acSelectedIndex = -1
    acItems = []
    autocompleteEl.classList.remove('active')
    autocompleteEl.textContent = ''
  }

  function updateAcSelection() {
    const items = autocompleteEl.querySelectorAll('.hs-yt-ac-item')
    items.forEach((el, i) => el.classList.toggle('selected', i === acSelectedIndex))
  }

  function completeEmote(input, emoteName) {
    const sel = window.getSelection()
    if (!sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node.nodeType !== Node.TEXT_NODE) return

    const text = node.textContent
    const offset = range.startOffset
    let wordStart = offset
    while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) wordStart--

    const before = text.substring(0, wordStart)
    const after = text.substring(offset)
    node.textContent = before + emoteName + ' ' + after

    const newOffset = wordStart + emoteName.length + 1
    range.setStart(node, newOffset)
    range.setEnd(node, newOffset)
    sel.removeAllRanges()
    sel.addRange(range)

    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // ─── Toast ────────────────────────────────────────────────────────────────────

  function showYtToast(text) {
    const el = document.createElement('div')
    el.className = 'hs-yt-toast'
    el.textContent = text
    document.body.appendChild(el)
    const timer = setTimeout(() => {
      el.classList.add('fade')
      const rmTimer = setTimeout(() => el.remove(), 350)
      signal.addEventListener('abort', () => { clearTimeout(rmTimer); el.remove() }, { once: true })
    }, 1800)
    signal.addEventListener('abort', () => { clearTimeout(timer); el.remove() }, { once: true })
  }

  // ─── Right-click block on YT emotes ───────────────────────────────────────────

  document.addEventListener('contextmenu', (e) => {
    const img = e.target
    if (!img || img.nodeName !== 'IMG' || !img.classList.contains('heatsync-emote-yt')) return
    e.preventDefault()
    e.stopImmediatePropagation()
    const emoteName = img.alt || img.title || ''
    if (!emoteName) return
    const emote = emoteMap.get(emoteName)
    if (!emote?.hash) return
    blockedEmotes.add(emote.hash)
    img.style.opacity = '0.3'
    safeSendMessage({ type: 'block_emote', emoteHash: emote.hash, emoteName: emote.name }).then(result => {
      if (result?.success === false) {
        blockedEmotes.delete(emote.hash)
        img.style.opacity = ''
        showYtToast('Block failed')
      } else {
        showYtToast('Blocked: ' + escapeHtml(emote.name))
      }
    })
  }, { capture: true, signal })

  // ─── Insert emote from picker ─────────────────────────────────────────────────

  function handleInsertEmote(emoteName) {
    if (!emoteName) return
    const input = document.querySelector('yt-live-chat-text-input-field-renderer div#input[contenteditable]')
    if (!input) return
    input.focus()

    const sel = window.getSelection()
    if (!sel) return

    // Use existing caret if inside input, else place at end
    let range
    if (sel.rangeCount && input.contains(sel.getRangeAt(0).startContainer)) {
      range = sel.getRangeAt(0)
    } else {
      range = document.createRange()
      range.selectNodeContents(input)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    const textNode = document.createTextNode(emoteName + ' ')
    range.deleteContents()
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    sel.removeAllRanges()
    sel.addRange(range)

    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: emoteName + ' ', inputType: 'insertText' }))
  }

  // ─── Send Relay ───────────────────────────────────────────────────────────────

  function handleSendRelay(msg) {
    const input = document.querySelector('yt-live-chat-text-input-field-renderer div#input[contenteditable]')
    if (!input) return

    input.focus()
    input.textContent = ''

    // Set caret at end, then insert text via Selection/Range (execCommand is deprecated)
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    const textNode = document.createTextNode(msg.text)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.setEndAfter(textNode)
    sel.removeAllRanges()
    sel.addRange(range)

    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: msg.text, inputType: 'insertText' }))

    // Click send button after a brief delay for YouTube to process
    setTimeout(() => {
      const sendBtn = document.querySelector('#send-button button') ||
                      document.querySelector('yt-button-shape button[aria-label]')
      if (sendBtn && !sendBtn.disabled) {
        sendBtn.click()
      }
    }, 100)
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    injectStyles()

    // Load emotes first, then start processing
    await loadEmoteInventory()

    try {
      const container = await waitForContainer()
      log('found chat container')

      // Process existing messages
      for (const child of container.children) {
        cleanup.raf(() => processNode(child))
      }

      // Watch for new messages
      const observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            cleanup.raf(() => processNode(node))
          }
        }
      })

      cleanup.trackObserver(observer)
      observer.observe(container, { childList: true })
      window.addEventListener('pagehide', () => ac.abort(), { signal })

      log('observer active, videoId:', videoId)

      // Setup autocomplete after a short delay (input may not be ready yet)
      if (!signal.aborted) cleanup.setTimeout(setupAutocomplete, 500)

    } catch (err) {
      log('init failed:', err.message)
    }
  }

  init()
})()
