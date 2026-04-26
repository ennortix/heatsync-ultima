/**
 * Kick emoji + heatsync emote autocomplete
 *
 * Lightweight hook for Kick's contenteditable div.editor-input.
 * emoji-data.js must be loaded before this script.
 *
 * Two modes:
 *   emoji   — triggered by :prefix (existing behaviour)
 *   emote   — triggered by bare word >= 2 chars (heatsync/BTTV/FFZ/7TV)
 */
;(function() {
  'use strict'

  const DEBUG = false
  const log = DEBUG ? console.log.bind(console, '[hs-kick-ac]') : () => {}

  // Kill previous instance on extension reload
  if (window.__heatsyncKickAcLifecycle) {
    try { window.__heatsyncKickAcLifecycle.abort() } catch (_) {}
  }

  const lifecycle = new AbortController()
  window.__heatsyncKickAcLifecycle = lifecycle
  const sig = lifecycle.signal
  window.addEventListener('pagehide', () => lifecycle.abort())
  sig.addEventListener('abort', () => {
    clearTimeout(emoteDebounceTimer)
    if (dropdown) { try { dropdown.remove() } catch (_) {} dropdown = null }
    if (emoteDropdown) { try { emoteDropdown.remove() } catch (_) {} emoteDropdown = null }
    hsEmoteList = []
  })

  // Build emoji map from emoji-data.js
  const EMOJI_MAP = {}
  const EMOJI_ENTRIES = []
  if (typeof EMOJI_DATA !== 'undefined') {
    for (const e of EMOJI_DATA) {
      EMOJI_MAP[e.name] = e.emoji
      EMOJI_ENTRIES.push(e)
    }
  }

  if (!EMOJI_ENTRIES.length) {
    log('no emoji data, bailing')
    return
  }

  // ---- heatsync emote cache ----
  // Flat array of { name, url } — refreshed on channel detect or on demand
  let hsEmoteList = []
  let hsEmotesLastFetch = 0
  const HS_EMOTE_TTL = 60000 // 1 min

  function getCurrentChannel() {
    // kick.com/channelname or kick.com/channelname/...
    const m = location.pathname.match(/^\/([^/?#]+)/)
    return m ? m[1].toLowerCase() : null
  }

  function buildEmoteList(data) {
    const blocked = new Set(data.blocked || [])
    const seen = new Set()
    const list = []
    const sources = [
      ...(data.inventoryEmotes || []),
      ...(data.channelEmotes || []),
      ...(data.globalEmotes || []),
    ]
    for (const e of sources) {
      if (!e || !e.name) continue
      if (blocked.has(e.hash)) continue
      if (seen.has(e.name)) continue
      seen.add(e.name)
      list.push({ name: e.name, url: e.url || e.cdnUrl || '' })
    }
    return list
  }

  function refreshEmotes(channel) {
    const now = Date.now()
    if (now - hsEmotesLastFetch < HS_EMOTE_TTL) return
    hsEmotesLastFetch = now
    try {
      chrome.runtime.sendMessage(
        { type: 'get_picker_emotes', channel: channel || getCurrentChannel(), platform: 'kick' },
        (data) => {
          if (chrome.runtime.lastError || !data) return
          hsEmoteList = buildEmoteList(data)
          log('emote list refreshed:', hsEmoteList.length)
        }
      )
    } catch (_) {}
  }

  function searchEmotes(query) {
    if (!query || query.length < 2) return []
    const q = query.toLowerCase()
    const exact = [], prefix = [], contains = []
    for (const e of hsEmoteList) {
      const n = e.name.toLowerCase()
      if (n === q) { exact.push(e); continue }
      if (n.startsWith(q)) { prefix.push(e); continue }
      if (n.includes(q)) contains.push(e)
    }
    return [...exact, ...prefix, ...contains].slice(0, MAX_RESULTS)
  }

  // ---- shared state ----
  const DROPDOWN_ID = 'hs-kick-emoji-dropdown'
  const EMOTE_DROPDOWN_ID = 'hs-kick-emote-dropdown'
  const MAX_RESULTS = 8
  let dropdown = null
  let emoteDropdown = null
  let selectedIdx = 0
  let matches = []
  // 'emoji' | 'emote' | null
  let activeMode = null
  let activeInput = null

  // debounce timer for emote input
  let emoteDebounceTimer = null

  function injectStyles() {
    if (document.getElementById('heatsync-kick-ac-styles')) return
    const style = document.createElement('style')
    style.id = 'heatsync-kick-ac-styles'
    style.textContent = `
      #${DROPDOWN_ID},
      #${EMOTE_DROPDOWN_ID} {
        position: fixed;
        z-index: 99999;
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 6px;
        padding: 4px 0;
        max-height: 280px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: none;
      }
      #${DROPDOWN_ID} .hs-ac-item,
      #${EMOTE_DROPDOWN_ID} .hs-ac-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        cursor: pointer;
        color: #fff;
      }
      #${DROPDOWN_ID} .hs-ac-item.selected,
      #${DROPDOWN_ID} .hs-ac-item:hover,
      #${EMOTE_DROPDOWN_ID} .hs-ac-item.selected,
      #${EMOTE_DROPDOWN_ID} .hs-ac-item:hover {
        background: #ff870033;
        color: #fff;
      }
      #${DROPDOWN_ID} .hs-ac-emoji {
        font-size: 18px;
        width: 24px;
        text-align: center;
      }
      #${DROPDOWN_ID} .hs-ac-name,
      #${EMOTE_DROPDOWN_ID} .hs-ac-name {
        color: #ccc;
        flex: 1;
      }
      #${EMOTE_DROPDOWN_ID} .hs-ac-item.selected .hs-ac-name,
      #${EMOTE_DROPDOWN_ID} .hs-ac-item:hover .hs-ac-name {
        color: #ff8700;
      }
      #${EMOTE_DROPDOWN_ID} .hs-ac-img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        flex-shrink: 0;
      }
      #${EMOTE_DROPDOWN_ID} .hs-ac-placeholder {
        width: 28px;
        height: 28px;
        background: #333;
        border-radius: 3px;
        flex-shrink: 0;
      }
    `
    document.head.appendChild(style)
  }

  function createDropdown() {
    if (dropdown) return dropdown
    dropdown = document.createElement('div')
    dropdown.id = DROPDOWN_ID
    document.body.appendChild(dropdown)
    return dropdown
  }

  function createEmoteDropdown() {
    if (emoteDropdown) return emoteDropdown
    emoteDropdown = document.createElement('div')
    emoteDropdown.id = EMOTE_DROPDOWN_ID
    document.body.appendChild(emoteDropdown)
    return emoteDropdown
  }

  function hideDropdown() {
    if (dropdown) dropdown.style.display = 'none'
    if (activeMode === 'emoji') {
      matches = []
      selectedIdx = 0
      activeMode = null
    }
  }

  function hideEmoteDropdown() {
    if (emoteDropdown) emoteDropdown.style.display = 'none'
    if (activeMode === 'emote') {
      matches = []
      selectedIdx = 0
      activeMode = null
    }
  }

  function hideAll() {
    if (dropdown) dropdown.style.display = 'none'
    if (emoteDropdown) emoteDropdown.style.display = 'none'
    matches = []
    selectedIdx = 0
    activeMode = null
  }

  function renderDropdownItems(container, results) {
    container.textContent = ''
    results.forEach((r, i) => {
      const item = document.createElement('div')
      item.className = 'hs-ac-item' + (i === 0 ? ' selected' : '')
      item.dataset.idx = i

      const emojiSpan = document.createElement('span')
      emojiSpan.className = 'hs-ac-emoji'
      emojiSpan.textContent = r.emoji

      const nameSpan = document.createElement('span')
      nameSpan.className = 'hs-ac-name'
      nameSpan.textContent = ':' + r.name + ':'

      item.appendChild(emojiSpan)
      item.appendChild(nameSpan)

      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        insertEmoji(activeInput, results[i])
      })

      container.appendChild(item)
    })
  }

  function renderEmoteItems(container, results) {
    container.textContent = ''
    results.forEach((r, i) => {
      const item = document.createElement('div')
      item.className = 'hs-ac-item' + (i === 0 ? ' selected' : '')
      item.dataset.idx = i

      if (r.url) {
        const img = document.createElement('img')
        img.className = 'hs-ac-img'
        img.src = r.url
        img.alt = r.name
        img.loading = 'lazy'
        item.appendChild(img)
      } else {
        const ph = document.createElement('span')
        ph.className = 'hs-ac-placeholder'
        item.appendChild(ph)
      }

      const nameSpan = document.createElement('span')
      nameSpan.className = 'hs-ac-name'
      // escapeHtml equivalent — textContent is safe
      nameSpan.textContent = r.name

      item.appendChild(nameSpan)

      item.addEventListener('mousedown', (e) => {
        e.preventDefault()
        insertEmote(activeInput, results[i])
      })

      container.appendChild(item)
    })
  }

  function positionAboveInput(el, input) {
    const rect = input.getBoundingClientRect()
    el.style.left = rect.left + 'px'
    el.style.bottom = (window.innerHeight - rect.top + 4) + 'px'
    el.style.top = 'auto'
    el.style.minWidth = Math.min(rect.width, 280) + 'px'
  }

  function showDropdown(input, results) {
    if (!results.length) { hideDropdown(); return }
    if (emoteDropdown) emoteDropdown.style.display = 'none'
    createDropdown()
    matches = results
    selectedIdx = 0
    activeMode = 'emoji'

    renderDropdownItems(dropdown, results)
    positionAboveInput(dropdown, input)
    dropdown.style.display = 'block'
  }

  function showEmoteDropdown(input, results) {
    if (!results.length) { hideEmoteDropdown(); return }
    if (dropdown) dropdown.style.display = 'none'
    createEmoteDropdown()
    matches = results
    selectedIdx = 0
    activeMode = 'emote'

    renderEmoteItems(emoteDropdown, results)
    positionAboveInput(emoteDropdown, input)
    emoteDropdown.style.display = 'block'
  }

  function updateSelection() {
    const container = activeMode === 'emote' ? emoteDropdown : dropdown
    if (!container) return
    container.querySelectorAll('.hs-ac-item').forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIdx)
    })
    const sel = container.querySelector('.selected')
    if (sel) sel.scrollIntoView({ block: 'nearest' })
  }

  // Get text before cursor in contenteditable
  function getTextBeforeCursor(el) {
    const selection = window.getSelection()
    if (!selection.rangeCount) return ''
    const range = selection.getRangeAt(0)
    if (!el.contains(range.startContainer)) return ''
    const preRange = document.createRange()
    preRange.selectNodeContents(el)
    preRange.setEnd(range.startContainer, range.startOffset)
    return preRange.toString()
  }

  // Replace :prefix back to opening colon and insert emoji
  function insertEmoji(input, match) {
    const text = getTextBeforeCursor(input)
    const colonMatch = text.match(/:([a-z0-9_+-]*)$/)
    if (!colonMatch) { hideDropdown(); return }

    const deleteCount = colonMatch[0].length // :prefix
    input.focus()
    const sel = window.getSelection()
    if (!sel.rangeCount) return

    // Select backwards to delete the :prefix
    for (let i = 0; i < deleteCount; i++) {
      sel.modify('extend', 'backward', 'character')
    }
    document.execCommand('insertText', false, match.emoji + ' ')
    hideDropdown()
    log('inserted', match.name, match.emoji)
  }

  // Replace bare word prefix and insert heatsync emote name
  function insertEmote(input, match) {
    const text = getTextBeforeCursor(input)
    // Match the current word (non-space, non-colon sequence) at end of text
    const wordMatch = text.match(/(\S+)$/)
    if (!wordMatch) { hideEmoteDropdown(); return }

    const deleteCount = wordMatch[0].length
    input.focus()
    const sel = window.getSelection()
    if (!sel.rangeCount) return

    for (let i = 0; i < deleteCount; i++) {
      sel.modify('extend', 'backward', 'character')
    }
    // textContent-safe: emote names are alphanumeric + limited punctuation
    document.execCommand('insertText', false, match.name + ' ')
    hideEmoteDropdown()
    log('inserted emote', match.name)
  }

  // Search emoji by prefix
  function searchEmoji(query) {
    if (!query) return []
    const q = query.toLowerCase()
    const exact = []
    const prefix = []
    const contains = []
    for (const e of EMOJI_ENTRIES) {
      if (e.name === q) { exact.push(e); continue }
      if (e.name.startsWith(q)) { prefix.push(e); continue }
      if (e.name.includes(q)) contains.push(e)
    }
    return [...exact, ...prefix, ...contains].slice(0, MAX_RESULTS)
  }

  function handleInput(e) {
    const input = e.target.closest('div.editor-input')
    if (!input) return
    activeInput = input

    const text = getTextBeforeCursor(input)

    // Check for closing colon — auto-convert :shortcode:
    const closingMatch = text.match(/:([a-z0-9_+-]+):$/)
    if (closingMatch) {
      const emoji = EMOJI_MAP[closingMatch[1]]
      if (emoji) {
        const deleteCount = closingMatch[0].length // :name:
        const sel = window.getSelection()
        if (sel.rangeCount) {
          for (let i = 0; i < deleteCount; i++) {
            sel.modify('extend', 'backward', 'character')
          }
          document.execCommand('insertText', false, emoji + ' ')
          log('auto-converted :' + closingMatch[1] + ': →', emoji)
          hideAll()
          return
        }
      }
    }

    // Check for :prefix (no closing colon) — show emoji dropdown
    // Colon-triggered completions stay in emoji mode; heatsync does NOT intercept these
    const colonMatch = text.match(/:([a-z0-9_+-]{1,})$/)
    if (colonMatch) {
      const results = searchEmoji(colonMatch[1])
      showDropdown(input, results)
      if (emoteDropdown) emoteDropdown.style.display = 'none'
      return
    }

    hideDropdown()

    // Bare-word emote completion — debounced 60ms
    // Only trigger if word >= 2 chars and not preceded by colon
    clearTimeout(emoteDebounceTimer)
    const wordMatch = text.match(/(?:^|[ \t])([^\s:]{2,})$/)
    if (wordMatch) {
      const query = wordMatch[1]
      emoteDebounceTimer = setTimeout(() => {
        if (sig.aborted) return
        refreshEmotes(getCurrentChannel())
        const results = searchEmotes(query)
        if (activeInput) showEmoteDropdown(activeInput, results)
      }, 60)
    } else {
      hideEmoteDropdown()
    }
  }

  function handleKeydown(e) {
    const anyOpen = (
      (dropdown && dropdown.style.display !== 'none' && activeMode === 'emoji') ||
      (emoteDropdown && emoteDropdown.style.display !== 'none' && activeMode === 'emote')
    )
    if (!anyOpen || !matches.length) return

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (activeMode === 'emote') {
        insertEmote(activeInput, matches[selectedIdx])
      } else {
        insertEmoji(activeInput, matches[selectedIdx])
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIdx = (selectedIdx - 1 + matches.length) % matches.length
      updateSelection()
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIdx = (selectedIdx + 1) % matches.length
      updateSelection()
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      hideAll()
    }
  }

  function findAndHook() {
    const input = document.querySelector('div.editor-input')
    if (!input) return false

    if (input._hsEmojiHooked) return true
    input._hsEmojiHooked = true

    input.addEventListener('input', handleInput, { signal: sig })
    input.addEventListener('keydown', handleKeydown, { capture: true, signal: sig })
    input.addEventListener('blur', () => {
      setTimeout(() => hideAll(), 150)
    }, { signal: sig })

    // Trigger initial emote fetch for the current channel
    refreshEmotes(getCurrentChannel())

    log('hooked Kick chat input')
    return true
  }

  // Init
  injectStyles()

  let attempts = 0
  function tryInit() {
    if (sig?.aborted) return
    attempts++
    if (findAndHook()) {
      log('ready')
      return
    }
    if (attempts < 20) {
      if (sig?.aborted) return
      const _t = setTimeout(tryInit, 1000)
      sig?.addEventListener('abort', () => clearTimeout(_t), { once: true })
    }
  }

  // Retry on navigation (Kick is an SPA)
  let lastUrl = location.href
  const urlCheckInterval = setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      const _nt = setTimeout(() => {
        if (sig?.aborted) return
        const input = document.querySelector('div.editor-input')
        if (input && !input._hsEmojiHooked) findAndHook()
      }, 1500)
      sig?.addEventListener('abort', () => clearTimeout(_nt), { once: true })
    }
  }, 2000)
  sig.addEventListener('abort', () => clearInterval(urlCheckInterval))

  const _initT = setTimeout(tryInit, 500)
  sig?.addEventListener('abort', () => clearTimeout(_initT), { once: true })
})()
