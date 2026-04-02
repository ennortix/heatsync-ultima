/**
 * Kick emoji autocomplete — :shortcode: auto-convert + dropdown
 *
 * Lightweight hook for Kick's contenteditable div.editor-input.
 * emoji-data.js must be loaded before this script.
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

  const DROPDOWN_ID = 'hs-kick-emoji-dropdown'
  const MAX_RESULTS = 8
  let dropdown = null
  let selectedIdx = 0
  let matches = []
  let activeInput = null

  function injectStyles() {
    if (document.getElementById('heatsync-kick-ac-styles')) return
    const style = document.createElement('style')
    style.id = 'heatsync-kick-ac-styles'
    style.textContent = `
      #${DROPDOWN_ID} {
        position: fixed;
        z-index: 99999;
        background: #000;
        border: 1px solid #000;
        border-radius: 6px;
        padding: 4px 0;
        max-height: 280px;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: none;
      }
      #${DROPDOWN_ID} .hs-ac-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        cursor: pointer;
        color: #fff;
      }
      #${DROPDOWN_ID} .hs-ac-item.selected,
      #${DROPDOWN_ID} .hs-ac-item:hover {
        background: #ff870033;
        color: #fff;
      }
      #${DROPDOWN_ID} .hs-ac-emoji {
        font-size: 18px;
        width: 24px;
        text-align: center;
      }
      #${DROPDOWN_ID} .hs-ac-name {
        color: #808080;
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

  function hideDropdown() {
    if (dropdown) dropdown.style.display = 'none'
    matches = []
    selectedIdx = 0
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

  function showDropdown(input, results) {
    if (!results.length) { hideDropdown(); return }
    createDropdown()
    matches = results
    selectedIdx = 0

    renderDropdownItems(dropdown, results)

    // Position above input
    const rect = input.getBoundingClientRect()
    dropdown.style.left = rect.left + 'px'
    dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px'
    dropdown.style.top = 'auto'
    dropdown.style.display = 'block'
    dropdown.style.minWidth = Math.min(rect.width, 250) + 'px'
  }

  function updateSelection() {
    if (!dropdown) return
    dropdown.querySelectorAll('.hs-ac-item').forEach((el, i) => {
      el.classList.toggle('selected', i === selectedIdx)
    })
    const sel = dropdown.querySelector('.selected')
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
          hideDropdown()
          return
        }
      }
    }

    // Check for :prefix (no closing colon) — show dropdown
    const colonMatch = text.match(/:([a-z0-9_+-]{1,})$/)
    if (colonMatch) {
      const results = searchEmoji(colonMatch[1])
      showDropdown(input, results)
    } else {
      hideDropdown()
    }
  }

  function handleKeydown(e) {
    if (!dropdown || dropdown.style.display === 'none' || !matches.length) return

    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      insertEmoji(activeInput, matches[selectedIdx])
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
      hideDropdown()
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
      setTimeout(() => hideDropdown(), 150)
    }, { signal: sig })

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
