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

  function rebuildEmoteMap(inventory, globals) {
    const map = new Map()
    // Globals first (lower priority)
    if (globals) {
      for (const e of globals) {
        if (e?.name && !blockedEmotes.has(e.hash || e.name)) map.set(e.name, e)
      }
    }
    // Inventory overrides globals
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
      const stored = await chrome.storage.local.get(['emote_inventory', 'global_emotes', 'blocked_emotes'])
      if (stored.blocked_emotes) blockedEmotes = new Set(stored.blocked_emotes)
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
    } else if (msg.type === 'blocked_emotes_update' && msg.blockedEmotes) {
      blockedEmotes = new Set(msg.blockedEmotes)
      chrome.storage.local.get(['emote_inventory', 'global_emotes']).then(stored => {
        rebuildEmoteMap(stored.emote_inventory || [], stored.global_emotes || [])
      })
    } else if (msg.type === 'youtube_send_relay') {
      handleSendRelay(msg)
      sendResponse({ ok: true })
      return true
    }
  }
  chrome.runtime.onMessage.addListener(ytInventoryListener)
  window.addEventListener('pagehide', () => {
    try { chrome.runtime.onMessage.removeListener(ytInventoryListener) } catch {}
  }, { once: true })

  // ─── Emote Replacement ────────────────────────────────────────────────────────

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
      for (const word of words) {
        const emote = emoteMap.get(word)
        if (emote) {
          const img = document.createElement('img')
          img.src = emote.url
          img.alt = emote.name
          img.title = emote.name
          img.className = 'heatsync-emote-yt'
          img.loading = 'lazy'
          frag.appendChild(img)
        } else {
          frag.appendChild(document.createTextNode(word))
        }
      }
      textNode.parentNode.replaceChild(frag, textNode)
    }
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
    `
    document.head.appendChild(style)
  }

  // ─── Message Extraction (existing logic) ──────────────────────────────────────

  function waitForContainer() {
    return new Promise((resolve, reject) => {
      let elapsed = 0
      const check = () => {
        const el = document.querySelector('yt-live-chat-item-list-renderer #items')
        if (el) return resolve(el)
        if (elapsed >= 15000) return reject(new Error('YouTube chat container not found'))
        elapsed += 500
        setTimeout(check, 500)
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
    const messageEl = el.querySelector('#message') || el.querySelector('#header-subtext') || el.querySelector('#header-primary-text')
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
    'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER'
  ])

  function getMsgType(tagName) {
    switch (tagName) {
      case 'YT-LIVE-CHAT-PAID-MESSAGE-RENDERER': return 'superchat'
      case 'YT-LIVE-CHAT-PAID-STICKER-RENDERER': return 'supersticker'
      case 'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER': return 'membership'
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
    } else if (msgType === 'membership') {
      const headerEl = node.querySelector('#header-subtext, #header-primary-text')
      if (headerEl) payload.systemMsg = headerEl.textContent.trim()
    }

    log('yt msg:', msgType, msg.user, msg.text)
    chrome.runtime.sendMessage(payload).catch(() => {})
  }

  // ─── Autocomplete ─────────────────────────────────────────────────────────────

  let autocompleteEl = null
  let acItems = []
  let acSelectedIndex = -1
  let acVisible = false

  function setupAutocomplete() {
    if (signal.aborted) return
    const inputRenderer = document.querySelector('yt-live-chat-text-input-field-renderer')
    if (!inputRenderer) {
      setTimeout(setupAutocomplete, 1000)
      return
    }

    const input = inputRenderer.querySelector('div#input[contenteditable]')
    if (!input) {
      setTimeout(setupAutocomplete, 1000)
      return
    }

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

  // ─── Send Relay ───────────────────────────────────────────────────────────────

  function handleSendRelay(msg) {
    const input = document.querySelector('yt-live-chat-text-input-field-renderer div#input[contenteditable]')
    if (!input) return

    input.focus()
    input.textContent = ''
    document.execCommand('insertText', false, msg.text)
    input.dispatchEvent(new Event('input', { bubbles: true }))

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
        requestAnimationFrame(() => processNode(child))
      }

      // Watch for new messages
      const observer = new MutationObserver((mutations) => {
        for (const mut of mutations) {
          for (const node of mut.addedNodes) {
            requestAnimationFrame(() => processNode(node))
          }
        }
      })

      observer.observe(container, { childList: true })
      signal.addEventListener('abort', () => observer.disconnect())
      window.addEventListener('pagehide', () => ac.abort(), { signal })

      log('observer active, videoId:', videoId)

      // Setup autocomplete after a short delay (input may not be ready yet)
      setTimeout(setupAutocomplete, 500)

    } catch (err) {
      log('init failed:', err.message)
    }
  }

  init()
})()
