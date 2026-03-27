// YouTube Live Chat content script — message extraction with full metadata
// Sends chat messages to background for multichat relay
(function() {
  'use strict'

  const DEBUG = false
  const log = DEBUG ? console.log.bind(console, '[hs-youtube]') : () => {}

  const ac = new AbortController()

  // Extract videoId from URL (?v= param or /live_chat?v=)
  const videoId = new URLSearchParams(window.location.search).get('v') || ''

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

  // Extract author color from computed style (mods=blue, owner=gold, members=green, regular=white)
  function extractColor(authorEl) {
    if (!authorEl) return '#ffffff'
    const computed = window.getComputedStyle(authorEl)
    const color = computed.color
    if (!color || color === 'rgba(0, 0, 0, 0)') return '#ffffff'
    // Convert rgb/rgba to hex
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (!m) return '#ffffff'
    const r = parseInt(m[1]), g = parseInt(m[2]), b = parseInt(m[3])
    // Skip near-white/transparent (regular users) — use YouTube red for identity
    if (r > 200 && g > 200 && b > 200) return '#ff0000'
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)
  }

  // Extract avatar URL from author photo
  function extractAvatar(el) {
    const img = el.querySelector('#author-photo img')
    return img?.src || ''
  }

  // Extract badges (member badge, mod wrench, etc.)
  function extractBadges(el) {
    const authorType = el.getAttribute('author-type') || ''
    const badges = []

    // Author-type badge (mod/owner)
    if (authorType === 'owner') badges.push({ type: 'owner', label: 'Owner' })
    else if (authorType === 'moderator') badges.push({ type: 'moderator', label: 'Mod' })

    // Member badge images from #author-badges
    const badgeContainer = el.querySelector('#author-badges')
    if (badgeContainer) {
      const badgeRenderers = badgeContainer.querySelectorAll('yt-live-chat-author-badge-renderer')
      for (const br of badgeRenderers) {
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
    const messageEl = el.querySelector('#message')
    if (!authorEl || !messageEl) return null

    const user = authorEl.textContent.trim()
    if (!user) return null

    const color = extractColor(authorEl)
    const avatar = extractAvatar(el)
    const badges = extractBadges(el)

    // Build text from child nodes — text nodes + img alt for emoji
    // Also collect emoji image URLs for rendering in multichat
    let text = ''
    const emotes = []
    const seenAlts = new Set()
    for (const node of messageEl.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent
      } else if (node.nodeName === 'IMG') {
        const alt = node.alt || ''
        text += alt
        // Collect unique emoji images for multichat rendering
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
      case 'YT-LIVE-CHAT-PAID-STICKER-RENDERER': return 'sticker'
      case 'YT-LIVE-CHAT-MEMBERSHIP-ITEM-RENDERER': return 'membership'
      default: return 'text'
    }
  }

  function extractSuperchatData(el) {
    const amountEl = el.querySelector('#purchase-amount, #purchase-amount-chip')
    const amount = amountEl?.textContent?.trim() || ''
    // Superchat header color from inline style
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

    const payload = {
      type: 'youtube_chat_message',
      videoId,
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
    } else if (msgType === 'sticker') {
      const st = extractStickerData(node)
      payload.amount = st.amount
      payload.sticker = st.sticker
    } else if (msgType === 'membership') {
      // Membership events — extract the header text as system message
      const headerEl = node.querySelector('#header-subtext, #header-primary-text')
      if (headerEl) payload.systemMsg = headerEl.textContent.trim()
    }

    log('yt msg:', msgType, msg.user, msg.text)
    chrome.runtime.sendMessage(payload).catch(() => {})
  }

  async function init() {
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
      ac.signal.addEventListener('abort', () => observer.disconnect())

      log('observer active, videoId:', videoId)
    } catch (err) {
      log('init failed:', err.message)
    }
  }

  init()
})()
