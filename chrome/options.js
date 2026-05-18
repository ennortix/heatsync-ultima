// HeatSync Options Page
(function() {
  'use strict'

  // Apply RTL/LTR early — re-applied after locale override resolves
  try { document.documentElement.dir = chrome.i18n.getMessage('@@bidi_dir') || 'ltr' } catch {}
  if (window.hsI18n) {
    window.hsI18n.init().then(() => {
      try { document.documentElement.dir = window.hsI18n.bidiDir() } catch {}
    })
  }

  // Storage hygiene — sanitize ui_settings on read/write to drop indexed-key
  // bloat and oversized values. See src/lib/utils.js for the canonical impl.
  const UI_SYNC_BLOCKLIST = new Set(['platformFilters', 'keywordHighlights'])
  function sanitizeUiSettings(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out = {}
    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
      if (/^\d+$/.test(key)) continue
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      if (key.length === 0 || key.length > 64) continue
      if (UI_SYNC_BLOCKLIST.has(key)) continue
      const v = obj[key]
      const t = typeof v
      if (t === 'function' || t === 'symbol') continue
      if (t === 'string' && v.length > 4096) continue
      if (t === 'object' && v !== null) {
        try { if (JSON.stringify(v).length > 6144) continue } catch { continue }
      }
      out[key] = v
    }
    return out
  }

  const DEFAULTS = {
    emoteWysiwyg: true,
    emoteSpaceAfter: true,
    emotePlaceholderMode: false,
    hideChatHeader: true,
    compactChatInput: true,
    highlightMentions: true,
    showPlatformBadges: true,
    showCosmetics: true,
    viMode: false,
    hideStreamTitle: false,
    hideViewerCount: false,
    debugLogging: false,
    crashTelemetry: false,
    automodAllCaps: false,
    automodRegex: '',
    emoteModifiers: true,
    emoteRightClickMenu: true,
    userColors: true,
    showClearedMessages: false,
    showPredictionsChip: true,
    anonChat: false
  }

  let settings = { ...DEFAULTS }

  async function load() {
    const stored = await chrome.storage.sync.get('ui_settings')
    if (stored.ui_settings) {
      const cleaned = sanitizeUiSettings(stored.ui_settings)
      settings = { ...DEFAULTS, ...cleaned }
      // showCosmetics: absent = true
      if (cleaned.showCosmetics === undefined) {
        settings.showCosmetics = true
      }
    }
    await loadStorageKeyToggles()
    render()
  }

  // Load toggles whose state lives in chrome.storage.local under their own key
  // (e.g. hs_notifications, used by background.js for desktop notif gating)
  async function loadStorageKeyToggles() {
    const keys = [...document.querySelectorAll('.toggle[data-storage-key]')].map(t => t.dataset.storageKey)
    // Also load size-btn groups (hs_emote_size default 1, hs_emoji_size default 2)
    const sizeGroups = [...document.querySelectorAll('.size-btns[data-storage-key]')]
    const sizeKeys = sizeGroups.map(g => g.dataset.storageKey)
    const allKeys = [...keys, ...sizeKeys]
    if (!allKeys.length) return
    const stored = await chrome.storage.local.get(allKeys)
    for (const toggle of document.querySelectorAll('.toggle[data-storage-key]')) {
      const k = toggle.dataset.storageKey
      const on = !!stored[k]
      toggle.classList.toggle('active', on)
      toggle.setAttribute('aria-checked', on ? 'true' : 'false')
    }
    for (const group of sizeGroups) {
      const k = group.dataset.storageKey
      const defaultSize = k === 'hs_emoji_size' ? 2 : 1
      const current = stored[k] === 1 || stored[k] === 2 || stored[k] === 4 ? stored[k] : defaultSize
      group.querySelectorAll('.size-btn[data-size]').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.size) === current)
      })
    }
  }

  function render() {
    for (const toggle of document.querySelectorAll('.toggle[data-setting]')) {
      const key = toggle.dataset.setting
      const on = !!settings[key]
      toggle.classList.toggle('active', on)
      toggle.setAttribute('aria-checked', on ? 'true' : 'false')
    }
    // Crash log section visibility tracks the toggle
    const crashRow = document.getElementById('crash-log-row')
    if (crashRow) crashRow.style.display = settings.crashTelemetry ? 'flex' : 'none'
    if (settings.crashTelemetry) renderCrashLog()

    // Font settings
    const fontSelect = document.getElementById('ext-font-family')
    const fontSizeSelect = document.getElementById('ext-font-size')
    const customFontInput = document.getElementById('ext-custom-font')
    const customFontRow = document.getElementById('ext-custom-font-row')

    if (fontSelect) {
      fontSelect.value = settings.fontFamily || 'CozetteVector'
      if (customFontRow) customFontRow.style.display = fontSelect.value === 'custom' ? '' : 'none'
    }
    if (fontSizeSelect) fontSizeSelect.value = settings.fontSize || '13'
    if (customFontInput) customFontInput.value = settings.customFontName || ''
    updateFontPreview()

    const automodRegex = document.getElementById('automod-regex')
    if (automodRegex) automodRegex.value = settings.automodRegex || ''

    const keywordHl = document.getElementById('keyword-highlights')
    if (keywordHl && !keywordHl.dataset.loaded) {
      keywordHl.dataset.loaded = '1'
      chrome.storage.local.get('keyword_highlights').then(d => {
        keywordHl.value = typeof d.keyword_highlights === 'string' ? d.keyword_highlights : ''
      }).catch(() => {})
    }
  }

  async function save() {
    await chrome.storage.sync.set({ ui_settings: sanitizeUiSettings(settings) })
  }

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.toggle[data-setting]')
    if (!toggle) return
    const key = toggle.dataset.setting
    settings[key] = !settings[key]
    toggle.classList.toggle('active', settings[key])
    toggle.setAttribute('aria-checked', settings[key] ? 'true' : 'false')
    save()
  })

  // chrome.storage.local toggles (e.g. hs_notifications)
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.toggle[data-storage-key]')
    if (!toggle) return
    const key = toggle.dataset.storageKey
    const next = !toggle.classList.contains('active')
    toggle.classList.toggle('active', next)
    toggle.setAttribute('aria-checked', next ? 'true' : 'false')
    chrome.storage.local.set({ [key]: next })
    if (next && key === 'hs_notifications' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  })

  // chrome.storage.local size-btn groups (hs_emote_size, hs_emoji_size)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.size-btn[data-size]')
    if (!btn) return
    const group = btn.closest('.size-btns[data-storage-key]')
    if (!group) return
    const key = group.dataset.storageKey
    const size = parseInt(btn.dataset.size, 10)
    if (size !== 1 && size !== 2 && size !== 4) return
    group.querySelectorAll('.size-btn[data-size]').forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.size, 10) === size)
    })
    chrome.storage.local.set({ [key]: size })
  })

  // Font selector handlers
  document.addEventListener('change', (e) => {
    if (e.target.id === 'ext-font-family') {
      settings.fontFamily = e.target.value
      const customRow = document.getElementById('ext-custom-font-row')
      if (customRow) customRow.style.display = e.target.value === 'custom' ? '' : 'none'
      // Auto-switch to native size for bundled bitmap fonts (mirrors heatsync.org)
      const nativeSize = e.target.value === 'GohuFont' ? '14' : e.target.value === 'CozetteVector' ? '13' : null
      if (nativeSize) {
        settings.fontSize = nativeSize
        const sizeSel = document.getElementById('ext-font-size')
        if (sizeSel) sizeSel.value = nativeSize
      }
      updateFontPreview()
      save()
    }
    if (e.target.id === 'ext-font-size') {
      settings.fontSize = e.target.value
      updateFontPreview()
      save()
    }
    if (e.target.id === 'ext-custom-font') {
      settings.customFontName = e.target.value.trim()
      updateFontPreview()
      save()
    }
  })

  // Update the font preview swatch using the same resolution as multichat.
  function resolveFontStack(family, customName) {
    if (family === 'GohuFont') return "'GohuFont', 'Courier New', monospace"
    if (family === 'monospace') return "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    if (family === 'custom') {
      const name = (customName || '').trim()
      if (name) return `'${name.replace(/'/g, '')}', 'Courier New', monospace`
    }
    return "'CozetteVector', 'Courier New', monospace"
  }
  function updateFontPreview() {
    const el = document.getElementById('ext-font-preview')
    if (!el) return
    el.style.fontFamily = resolveFontStack(settings.fontFamily, settings.customFontName)
    const size = parseInt(settings.fontSize || '13', 10)
    el.style.fontSize = (size >= 10 && size <= 22 ? size : 13) + 'px'
  }
  // Also live-preview on raw input (debounced via change handler ↑ for save)
  document.addEventListener('input', (e) => {
    if (e.target.id === 'ext-custom-font') {
      settings.customFontName = e.target.value.trim()
      updateFontPreview()
    }
  })

  // Live-save automod regex on input (debounced)
  let _automodSaveTimer = null
  let _kwSaveTimer = null
  document.addEventListener('input', (e) => {
    if (e.target.id === 'automod-regex') {
      clearTimeout(_automodSaveTimer)
      _automodSaveTimer = setTimeout(() => {
        settings.automodRegex = e.target.value
        save()
      }, 400)
      return
    }
    if (e.target.id === 'keyword-highlights') {
      clearTimeout(_kwSaveTimer)
      _kwSaveTimer = setTimeout(() => {
        chrome.storage.local.set({ keyword_highlights: e.target.value })
      }, 400)
    }
  })

  function fmtTs(ts) {
    const d = new Date(ts)
    return d.toISOString().replace('T', ' ').slice(0, 19)
  }

  async function renderCrashLog() {
    const pre = document.getElementById('crash-log')
    if (!pre) return
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'get_crash_log' })
      const log = resp?.log || []
      if (log.length === 0) { pre.textContent = '(no errors recorded)'; return }
      pre.textContent = log.slice().reverse().map(e => {
        const cnt = e.count > 1 ? ` ×${e.count}` : ''
        return `[${fmtTs(e.ts)}] ${e.source}${cnt}: ${e.message}\n${e.stack || ''}\n`
      }).join('\n')
    } catch (e) {
      pre.textContent = '(unable to read log)'
    }
  }

  document.addEventListener('click', async (e) => {
    if (e.target.id === 'crash-copy') {
      const pre = document.getElementById('crash-log')
      if (pre?.textContent) {
        try { await navigator.clipboard.writeText(pre.textContent) } catch {}
        e.target.textContent = 'copied'
        setTimeout(() => { e.target.textContent = 'copy' }, 1500)
      }
    }
    if (e.target.id === 'crash-clear') {
      try { await chrome.runtime.sendMessage({ type: 'clear_crash_log' }) } catch {}
      renderCrashLog()
    }
  })

  // --- server content filters ---

  let serverSettings = null

  function setServerStatus(msg, cls) {
    const el = document.getElementById('server-settings-status')
    if (!el) return
    el.textContent = msg
    el.className = cls || ''
  }

  function renderServerToggles(data) {
    for (const btn of document.querySelectorAll('.toggle[data-server-setting]')) {
      const key = btn.dataset.serverSetting
      const on = !!data[key]
      btn.classList.toggle('active', on)
      btn.setAttribute('aria-checked', on ? 'true' : 'false')
      btn.disabled = false
    }
  }

  async function loadServerSettings() {
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: '/api/user/settings',
        method: 'GET',
        auth: true
      })
      if (!resp || !resp.ok) {
        const status = resp?.status
        if (status === 401 || status === 403) {
          setServerStatus('not logged in — sign in at heatsync.org to sync', '')
        } else {
          setServerStatus('failed to load: ' + (resp?.error || 'unknown'), 'err')
        }
        return
      }
      serverSettings = resp.data?.settings || resp.settings || null
      if (!serverSettings) {
        setServerStatus('no settings data returned', 'err')
        return
      }
      renderServerToggles(serverSettings)
      setServerStatus('', '')
    } catch (e) {
      setServerStatus('not logged in — sign in at heatsync.org to sync', '')
    }
  }

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.toggle[data-server-setting]')
    if (!btn || btn.disabled) return
    const key = btn.dataset.serverSetting
    if (!serverSettings) return
    const next = !serverSettings[key]
    serverSettings[key] = next
    btn.classList.toggle('active', next)
    btn.setAttribute('aria-checked', next ? 'true' : 'false')
    btn.disabled = true
    setServerStatus('saving…', '')
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: '/api/user/settings',
        method: 'PATCH',
        auth: true,
        body: { [key]: next }
      })
      if (!resp || !resp.ok) {
        // revert
        serverSettings[key] = !next
        btn.classList.toggle('active', !next)
        btn.setAttribute('aria-checked', (!next) ? 'true' : 'false')
        setServerStatus('save failed: ' + (resp?.error || 'unknown'), 'err')
      } else {
        setServerStatus('saved', 'ok')
        setTimeout(() => setServerStatus('', ''), 1500)
      }
    } catch (err) {
      serverSettings[key] = !next
      btn.classList.toggle('active', !next)
      btn.setAttribute('aria-checked', (!next) ? 'true' : 'false')
      setServerStatus('save failed: ' + err.message, 'err')
    } finally {
      btn.disabled = false
    }
  })

  load()
  loadServerSettings()

  // Locale picker — populates dropdown, applies override on change
  ;(async () => {
    const sel = document.getElementById('locale-picker')
    const note = document.getElementById('locale-note')
    if (!sel || !window.hsI18n) return
    await window.hsI18n.init()
    const current = window.hsI18n.getLocale()
    for (const code of window.hsI18n.listLocales()) {
      const opt = document.createElement('option')
      opt.value = code
      opt.textContent = window.hsI18n.localeName(code)
      if (code === current) opt.selected = true
      sel.appendChild(opt)
    }
    sel.addEventListener('change', async () => {
      await window.hsI18n.setLocale(sel.value)
      if (note) {
        note.classList.add('show')
        setTimeout(() => note.classList.remove('show'), 6000)
      }
      // reload twitch/kick/youtube tabs so the multichat overlay picks up new locale
      try {
        chrome.tabs.query({ url: ['https://*.twitch.tv/*', 'https://kick.com/*', 'https://*.kick.com/*', 'https://www.youtube.com/*'] }, (tabs) => {
          for (const t of tabs || []) {
            try { chrome.tabs.reload(t.id) } catch {}
          }
        })
      } catch {}
      // reload this options page itself so labels reflect the new locale
      setTimeout(() => location.reload(), 300)
    })
  })()
})()
