/**
 * Vi mode for chat input
 *
 * Vim-like single-line editing for Twitch/Kick/multichat chat inputs.
 * Matches cmdchamp's vi mode: motions, operators, counts, f/F/t/T, undo, yank/paste.
 * Default off — toggled via heatsync settings panel.
 */
;(function() {
  'use strict'

  const DEBUG = false
  const log = DEBUG ? console.log.bind(console, '[hs-vi]') : () => {}

  // Chat input selectors
  const INPUT_SELECTORS = [
    '[data-a-target="chat-input"]',        // Twitch (contenteditable)
    'textarea[placeholder*="message"]',     // Kick
    'textarea[placeholder*="chat"]',        // Kick alt
    '.chat-input textarea',                 // Kick fallback
    '#hs-mc-input',                         // Multichat
  ]

  // --- State ---
  let enabled = false
  let mode = 'insert'
  let cursor = 0
  let count = ''
  let operator = null       // pending: 'd', 'c', 'y'
  let pendingCmd = null     // pending: 'f', 'F', 't', 'T', 'r', 'g'
  let lastFind = null       // { type, char }
  let register = ''
  let undoStack = []
  let activeEl = null
  let indicatorEl = null

  // --- DOM helpers ---

  function isCE(el) {
    return el && (el.isContentEditable || el.getAttribute('contenteditable') === 'true')
  }

  function getTextNodes(el) {
    const nodes = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node
    while (node = walker.nextNode()) nodes.push(node)
    return nodes
  }

  function findNodeAt(nodes, pos) {
    let remaining = pos
    for (const node of nodes) {
      if (remaining <= node.length) return { node, offset: remaining }
      remaining -= node.length
    }
    const last = nodes[nodes.length - 1]
    return last ? { node: last, offset: last.length } : null
  }

  // --- Adapter functions ---

  function getText(el) {
    if (!el) return ''
    return isCE(el) ? (el.textContent || '') : (el.value || '')
  }

  function getLen(el) { return getText(el).length }

  function getCursorPos(el) {
    if (!el) return 0
    if (isCE(el)) {
      const sel = window.getSelection()
      if (!sel.rangeCount) return 0
      const range = sel.getRangeAt(0)
      const nodes = getTextNodes(el)
      let offset = 0
      for (const node of nodes) {
        if (node === range.startContainer) return offset + range.startOffset
        offset += node.length
      }
      return offset
    }
    return el.selectionStart || 0
  }

  function setCursorPos(el, pos) {
    if (!el) return
    pos = Math.max(0, Math.min(pos, getLen(el)))
    if (isCE(el)) {
      const nodes = getTextNodes(el)
      if (!nodes.length) return
      const loc = findNodeAt(nodes, pos)
      if (!loc) return
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(loc.node, loc.offset)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      el.setSelectionRange(pos, pos)
    }
  }

  function selectRange(el, start, end) {
    if (!el) return
    const len = getLen(el)
    start = Math.max(0, Math.min(start, len))
    end = Math.max(0, Math.min(end, len))
    if (isCE(el)) {
      const nodes = getTextNodes(el)
      if (!nodes.length) return
      const s = findNodeAt(nodes, start)
      const e = findNodeAt(nodes, end)
      if (!s || !e) return
      const sel = window.getSelection()
      const range = document.createRange()
      range.setStart(s.node, s.offset)
      range.setEnd(e.node, e.offset)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      el.setSelectionRange(start, end)
    }
  }

  function deleteText(el, start, end) {
    if (!el || start >= end) return
    if (isCE(el)) {
      selectRange(el, start, end)
      document.execCommand('delete', false)
    } else {
      const v = el.value
      el.value = v.slice(0, start) + v.slice(end)
      el.setSelectionRange(start, start)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  function insertText(el, pos, text) {
    if (!el || !text) return
    setCursorPos(el, pos)
    if (isCE(el)) {
      document.execCommand('insertText', false, text)
    } else {
      const v = el.value
      el.value = v.slice(0, pos) + text + v.slice(pos)
      el.setSelectionRange(pos + text.length, pos + text.length)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  function replaceAll(el, text) {
    if (!el) return
    if (isCE(el)) {
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
      if (text) document.execCommand('insertText', false, text)
      else document.execCommand('delete', false)
    } else {
      el.value = text
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  // --- Undo ---

  function pushUndo(el) {
    undoStack.push({ text: getText(el), cursor })
    if (undoStack.length > 100) undoStack.shift()
  }

  function popUndo(el) {
    if (!undoStack.length) return
    const s = undoStack.pop()
    replaceAll(el, s.text)
    cursor = s.cursor
    syncCursor(el)
  }

  // --- Word motions ---

  function charClass(ch) {
    if (!ch) return -1
    if (/\s/.test(ch)) return 0
    if (/\w/.test(ch)) return 1
    return 2
  }

  function moveW(text, pos, n) {
    for (let i = 0; i < n; i++) {
      if (pos >= text.length) break
      const cc = charClass(text[pos])
      while (pos < text.length && charClass(text[pos]) === cc) pos++
      while (pos < text.length && charClass(text[pos]) === 0) pos++
    }
    return pos
  }

  function moveB(text, pos, n) {
    for (let i = 0; i < n; i++) {
      if (pos <= 0) break
      pos--
      while (pos > 0 && charClass(text[pos]) === 0) pos--
      const cc = charClass(text[pos])
      while (pos > 0 && charClass(text[pos - 1]) === cc) pos--
    }
    return pos
  }

  function moveE(text, pos, n) {
    for (let i = 0; i < n; i++) {
      if (pos >= text.length - 1) break
      pos++
      while (pos < text.length - 1 && charClass(text[pos]) === 0) pos++
      const cc = charClass(text[pos])
      while (pos < text.length - 1 && charClass(text[pos + 1]) === cc) pos++
    }
    return pos
  }

  // --- Find char motions ---

  function findCharMotion(text, pos, char, dir, before, n) {
    let p = pos
    for (let i = 0; i < n; i++) {
      let found = -1
      if (dir > 0) {
        for (let j = p + 1; j < text.length; j++) {
          if (text[j] === char) { found = j; break }
        }
      } else {
        for (let j = p - 1; j >= 0; j--) {
          if (text[j] === char) { found = j; break }
        }
      }
      if (found === -1) return pos
      p = found
    }
    if (before) p -= dir
    return p
  }

  // --- Resolve motion ---

  function resolveMotion(text, pos, key, n, char) {
    switch (key) {
      case 'h': return Math.max(0, pos - n)
      case 'l': return Math.min(Math.max(0, text.length - 1), pos + n)
      case 'w': return moveW(text, pos, n)
      case 'b': return moveB(text, pos, n)
      case 'e': return moveE(text, pos, n)
      case '0': return 0
      case '$': return Math.max(0, text.length - 1)
      case '^': {
        const m = text.match(/^\s*/)
        return m ? m[0].length : 0
      }
      case 'f': return findCharMotion(text, pos, char, 1, false, n)
      case 'F': return findCharMotion(text, pos, char, -1, false, n)
      case 't': return findCharMotion(text, pos, char, 1, true, n)
      case 'T': return findCharMotion(text, pos, char, -1, true, n)
      default: return pos
    }
  }

  // --- Cursor sync ---

  function syncCursor(el) {
    if (!el) return
    const len = getLen(el)
    if (mode === 'normal') {
      cursor = Math.max(0, Math.min(cursor, Math.max(0, len - 1)))
      // Block cursor: select 1 char at cursor position
      if (len > 0) selectRange(el, cursor, cursor + 1)
      else setCursorPos(el, 0)
    } else {
      cursor = Math.max(0, Math.min(cursor, len))
      setCursorPos(el, cursor)
    }
    updateIndicator()
  }

  // --- Mode indicator ---

  function createIndicator() {
    if (indicatorEl) return
    indicatorEl = document.createElement('span')
    indicatorEl.id = 'hs-vi-indicator'
    Object.assign(indicatorEl.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      transform: 'translateY(-100%)',
      fontFamily: 'monospace',
      fontSize: '11px',
      fontWeight: 'bold',
      pointerEvents: 'none',
      userSelect: 'none',
      lineHeight: '1',
      padding: '1px 4px',
      zIndex: '100',
      whiteSpace: 'nowrap',
    })
  }

  function updateIndicator() {
    if (!indicatorEl) return
    if (!enabled) {
      indicatorEl.style.display = 'none'
      return
    }
    indicatorEl.style.display = ''
    if (mode === 'normal') {
      indicatorEl.textContent = '$'
      indicatorEl.style.color = '#ff3333'
    } else {
      indicatorEl.textContent = '$'
      indicatorEl.style.color = '#ffffff'
    }
  }

  function attachIndicator(el) {
    if (!el) return
    createIndicator()
    if (!enabled) {
      indicatorEl.style.display = 'none'
      return
    }

    // Find parent that can be position:relative anchor
    // Go up from the input until we find something suitable
    let container = el.parentElement
    if (container && !container.contains(indicatorEl)) {
      const cs = getComputedStyle(container)
      if (cs.position === 'static') container.style.position = 'relative'
      container.appendChild(indicatorEl)
    }
    updateIndicator()
  }

  function detachIndicator() {
    if (indicatorEl?.parentElement) indicatorEl.remove()
  }

  // --- Mode transitions ---

  function enterNormal(el) {
    mode = 'normal'
    count = ''
    operator = null
    pendingCmd = null
    const len = getLen(el)
    if (cursor > 0 && cursor >= len) cursor = len - 1
    cursor = Math.max(0, cursor)
    syncCursor(el)
    log('→ NORMAL, cursor:', cursor)
  }

  function enterInsert(el, pos) {
    mode = 'insert'
    count = ''
    operator = null
    pendingCmd = null
    if (pos !== undefined) cursor = pos
    syncCursor(el)
    log('→ INSERT, cursor:', cursor)
  }

  // --- Get accumulated count ---

  function getCount() {
    const n = count ? parseInt(count, 10) : 1
    count = ''
    return Math.max(1, Math.min(n, 9999))
  }

  // --- Execute operator on motion range ---

  function executeOperator(el, text, from, to, motionKey) {
    const op = operator
    operator = null

    let start, end
    if (to >= from) {
      start = from
      // Inclusive end for: e $ l f F t T
      end = 'e$lftTF'.includes(motionKey) ? to + 1 : to
    } else {
      start = to
      end = from
    }

    if (start >= end) return

    const deleted = text.slice(start, end)
    register = deleted

    switch (op) {
      case 'd':
        pushUndo(el)
        deleteText(el, start, end)
        cursor = start
        const newLen = getLen(el)
        if (cursor >= newLen && newLen > 0) cursor = newLen - 1
        if (newLen === 0) cursor = 0
        syncCursor(el)
        break
      case 'c':
        pushUndo(el)
        deleteText(el, start, end)
        cursor = start
        enterInsert(el, start)
        break
      case 'y':
        // Just yank
        break
    }
  }

  // --- Keydown handler ---

  function handleKeyDown(e) {
    if (!enabled || !activeEl) return
    // Don't intercept modifier combos (Ctrl, Alt, Meta)
    if (e.ctrlKey || e.metaKey || e.altKey) return

    if (mode === 'normal') {
      handleNormalMode(e)
    } else {
      handleInsertMode(e)
    }
  }

  function handleInsertMode(e) {
    // Only intercept Escape in insert mode
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopImmediatePropagation()
      // Read current cursor position from DOM
      cursor = getCursorPos(activeEl)
      if (cursor > 0) cursor-- // vim: back one on escape
      enterNormal(activeEl)
    }
    // Everything else passes through (Tab, Enter, typing, etc.)
  }

  function blockEvent(e) {
    e.preventDefault()
    e.stopImmediatePropagation()
  }

  function handleNormalMode(e) {
    const el = activeEl
    const text = getText(el)
    const len = text.length
    const key = e.key

    // Let Enter through for chat submission
    if (key === 'Enter') {
      // Switch to insert mode after send
      mode = 'insert'
      updateIndicator()
      return
    }

    // Block everything else from reaching other handlers
    blockEvent(e)

    // --- Pending char commands (f/F/t/T/r after operator or standalone) ---
    if (pendingCmd) {
      const cmd = pendingCmd
      pendingCmd = null

      if (key === 'Escape') return

      // g prefix: only gg is valid
      if (cmd === 'g') {
        if (key === 'g') {
          if (operator) {
            executeOperator(el, text, cursor, 0, '0')
          } else {
            cursor = 0
            syncCursor(el)
          }
        }
        return
      }

      if (key.length !== 1) return

      // r: replace char
      if (cmd === 'r') {
        if (cursor < len) {
          pushUndo(el)
          selectRange(el, cursor, cursor + 1)
          if (isCE(el)) {
            document.execCommand('insertText', false, key)
          } else {
            el.value = text.slice(0, cursor) + key + text.slice(cursor + 1)
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
          syncCursor(el)
        }
        return
      }

      // f/F/t/T char motion
      const n = getCount()
      lastFind = { type: cmd, char: key }
      const newPos = resolveMotion(text, cursor, cmd, n, key)

      if (operator) {
        executeOperator(el, text, cursor, newPos, cmd)
      } else {
        cursor = newPos
        syncCursor(el)
      }
      return
    }

    // --- Count prefix ---
    if ((key >= '1' && key <= '9') || (key === '0' && count.length > 0)) {
      count += key
      return
    }

    const n = getCount()

    // --- Operator pending: waiting for motion ---
    if (operator) {
      // dd, cc, yy: whole line
      if (key === operator) {
        switch (operator) {
          case 'd':
            pushUndo(el)
            register = text
            replaceAll(el, '')
            cursor = 0
            syncCursor(el)
            break
          case 'c':
            pushUndo(el)
            register = text
            replaceAll(el, '')
            cursor = 0
            enterInsert(el, 0)
            break
          case 'y':
            register = text
            break
        }
        operator = null
        return
      }

      // Motion after operator
      if ('hlwbe0$^'.includes(key)) {
        const newPos = resolveMotion(text, cursor, key, n)
        executeOperator(el, text, cursor, newPos, key)
        return
      }
      if ('fFtT'.includes(key)) {
        pendingCmd = key
        return
      }
      if (key === 'g') {
        pendingCmd = 'g'
        return
      }

      // Invalid motion: cancel operator
      operator = null
      return
    }

    // --- Mode switches ---
    switch (key) {
      case 'i': enterInsert(el, cursor); return
      case 'a': enterInsert(el, Math.min(cursor + 1, len)); return
      case 'I': enterInsert(el, 0); return
      case 'A': enterInsert(el, len); return
      case 's':
        pushUndo(el)
        if (cursor < len) {
          const dc = Math.min(n, len - cursor)
          register = text.slice(cursor, cursor + dc)
          deleteText(el, cursor, cursor + dc)
        }
        enterInsert(el, cursor)
        return
      case 'S':
        pushUndo(el)
        register = text
        replaceAll(el, '')
        enterInsert(el, 0)
        return
      case 'C':
        pushUndo(el)
        if (cursor < len) {
          register = text.slice(cursor)
          deleteText(el, cursor, len)
        }
        enterInsert(el, cursor)
        return
    }

    // --- Motions ---
    if ('hlwbe0$^'.includes(key)) {
      cursor = resolveMotion(text, cursor, key, n)
      syncCursor(el)
      return
    }

    // Find motions
    if ('fFtT'.includes(key)) {
      pendingCmd = key
      return
    }

    // Repeat find
    if (key === ';' && lastFind) {
      cursor = resolveMotion(text, cursor, lastFind.type, n, lastFind.char)
      syncCursor(el)
      return
    }
    if (key === ',' && lastFind) {
      const reversed = { f: 'F', F: 'f', t: 'T', T: 't' }[lastFind.type]
      cursor = resolveMotion(text, cursor, reversed, n, lastFind.char)
      syncCursor(el)
      return
    }

    // g prefix (gg)
    if (key === 'g') {
      pendingCmd = 'g'
      return
    }

    // G: end of line
    if (key === 'G') {
      cursor = Math.max(0, len - 1)
      syncCursor(el)
      return
    }

    // --- Operators ---
    if ('dcy'.includes(key)) {
      operator = key
      return
    }

    // --- Edit commands ---
    switch (key) {
      case 'x': {
        if (cursor < len) {
          pushUndo(el)
          const dc = Math.min(n, len - cursor)
          register = text.slice(cursor, cursor + dc)
          deleteText(el, cursor, cursor + dc)
          const nl = getLen(el)
          if (cursor >= nl && nl > 0) cursor = nl - 1
          if (nl === 0) cursor = 0
          syncCursor(el)
        }
        return
      }
      case 'X': {
        if (cursor > 0) {
          pushUndo(el)
          const dc = Math.min(n, cursor)
          register = text.slice(cursor - dc, cursor)
          deleteText(el, cursor - dc, cursor)
          cursor -= dc
          syncCursor(el)
        }
        return
      }
      case 'D': {
        if (cursor < len) {
          pushUndo(el)
          register = text.slice(cursor)
          deleteText(el, cursor, len)
          const nl = getLen(el)
          if (cursor >= nl && nl > 0) cursor = nl - 1
          if (nl === 0) cursor = 0
          syncCursor(el)
        }
        return
      }
      case 'r': {
        pendingCmd = 'r'
        return
      }
      case '~': {
        if (cursor < len) {
          pushUndo(el)
          const end = Math.min(cursor + n, len)
          let toggled = ''
          for (let i = cursor; i < end; i++) {
            const ch = text[i]
            toggled += ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase()
          }
          selectRange(el, cursor, end)
          if (isCE(el)) {
            document.execCommand('insertText', false, toggled)
          } else {
            el.value = text.slice(0, cursor) + toggled + text.slice(end)
            el.dispatchEvent(new Event('input', { bubbles: true }))
          }
          cursor = Math.min(end, Math.max(0, getLen(el) - 1))
          syncCursor(el)
        }
        return
      }
      case 'p': {
        if (register) {
          pushUndo(el)
          const pos = Math.min(cursor + 1, len)
          let content = ''
          for (let i = 0; i < n; i++) content += register
          insertText(el, pos, content)
          cursor = pos + content.length - 1
          syncCursor(el)
        }
        return
      }
      case 'P': {
        if (register) {
          pushUndo(el)
          let content = ''
          for (let i = 0; i < n; i++) content += register
          insertText(el, cursor, content)
          cursor = cursor + content.length - 1
          syncCursor(el)
        }
        return
      }
      case 'u': {
        popUndo(el)
        return
      }
    }

    // Arrow keys
    if (key === 'ArrowLeft') {
      cursor = Math.max(0, cursor - n)
      syncCursor(el)
      return
    }
    if (key === 'ArrowRight') {
      cursor = Math.min(Math.max(0, len - 1), cursor + n)
      syncCursor(el)
      return
    }
    // ArrowUp/Down: let through for chat history
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      // Don't block — let platform handle history navigation
      // Re-dispatch since we already blocked it
      return
    }
  }

  // --- Settings ---

  function loadSettings() {
    // Try chrome.storage first (async), fallback to localStorage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('ui_settings', (result) => {
        if (result?.ui_settings) {
          const wasEnabled = enabled
          enabled = !!result.ui_settings.viMode
          if (enabled && !wasEnabled) onEnable()
          else if (!enabled && wasEnabled) onDisable()
          log('Settings loaded from storage, viMode:', enabled)
        }
      })
    }
    // Also check localStorage (sync fallback)
    try {
      const stored = localStorage.getItem('heatsync-extension-settings')
      if (stored) {
        const settings = JSON.parse(stored)
        enabled = !!settings.viMode
      }
    } catch (_) {}
  }

  function onEnable() {
    if (activeEl) {
      attachIndicator(activeEl)
      updateIndicator()
    }
  }

  function onDisable() {
    mode = 'insert'
    count = ''
    operator = null
    pendingCmd = null
    detachIndicator()
  }

  // Listen for settings changes via postMessage (from heatsync-button.js)
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'heatsync-settings-changed' && e.data.settings) {
      const wasEnabled = enabled
      enabled = !!e.data.settings.viMode
      if (enabled && !wasEnabled) onEnable()
      else if (!enabled && wasEnabled) onDisable()
    }
  })

  // Listen for chrome.storage changes
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.ui_settings?.newValue) {
        const wasEnabled = enabled
        enabled = !!changes.ui_settings.newValue.viMode
        if (enabled && !wasEnabled) onEnable()
        else if (!enabled && wasEnabled) onDisable()
      }
    })
  }

  // --- Input tracking ---

  function matchesInput(el) {
    if (!el) return false
    return INPUT_SELECTORS.some(sel => {
      try { return el.matches(sel) } catch (_) { return false }
    })
  }

  function attach(el) {
    if (activeEl === el) return
    activeEl = el
    cursor = getCursorPos(el)
    mode = 'insert'
    undoStack = []
    count = ''
    operator = null
    pendingCmd = null
    if (enabled) attachIndicator(el)
    log('Attached to', el.tagName, el.id || el.className)
  }

  function detach() {
    activeEl = null
    mode = 'insert'
    count = ''
    operator = null
    pendingCmd = null
    detachIndicator()
  }

  // --- Initialization ---

  function init() {
    loadSettings()

    // Keydown at capture phase on window — fires before all other handlers
    window.addEventListener('keydown', handleKeyDown, { capture: true })

    // Track focus
    document.addEventListener('focusin', (e) => {
      if (matchesInput(e.target)) attach(e.target)
    })

    document.addEventListener('focusout', (e) => {
      if (e.target === activeEl) {
        setTimeout(() => {
          if (document.activeElement !== activeEl) detach()
        }, 150)
      }
    })

    // Try to find existing input
    for (const sel of INPUT_SELECTORS) {
      const el = document.querySelector(sel)
      if (el && document.activeElement === el) {
        attach(el)
        break
      }
    }

    // Watch for dynamically added inputs
    const observer = new MutationObserver(() => {
      if (activeEl) return
      for (const sel of INPUT_SELECTORS) {
        const el = document.querySelector(sel)
        if (el && document.activeElement === el) {
          attach(el)
          break
        }
      }
    })
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    })

    log('vi-mode initialized, enabled:', enabled)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
