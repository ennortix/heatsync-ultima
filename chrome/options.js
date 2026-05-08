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

  const DEFAULTS = {
    emoteWysiwyg: true,
    emoteSpaceAfter: true,
    emotePlaceholderMode: false,
    hideChatHeader: true,
    compactChatInput: true,
    highlightMentions: true,
    showPlatformBadges: true,
    showCosmetics: true,
    bigEmoji: false,
    viMode: false,
    hideStreamTitle: false,
    hideViewerCount: false,
    debugLogging: false,
    crashTelemetry: false,
    automodAllCaps: false,
    automodRegex: ''
  }

  let settings = { ...DEFAULTS }

  async function load() {
    const stored = await chrome.storage.sync.get('ui_settings')
    if (stored.ui_settings) {
      settings = { ...DEFAULTS, ...stored.ui_settings }
      // showCosmetics: absent = true
      if (stored.ui_settings.showCosmetics === undefined) {
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
    if (!keys.length) return
    const stored = await chrome.storage.local.get(keys)
    for (const toggle of document.querySelectorAll('.toggle[data-storage-key]')) {
      const k = toggle.dataset.storageKey
      const on = !!stored[k]
      toggle.classList.toggle('active', on)
      toggle.setAttribute('aria-checked', on ? 'true' : 'false')
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

    const automodRegex = document.getElementById('automod-regex')
    if (automodRegex) automodRegex.value = settings.automodRegex || ''
  }

  async function save() {
    await chrome.storage.sync.set({ ui_settings: settings })
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

  // Font selector handlers
  document.addEventListener('change', (e) => {
    if (e.target.id === 'ext-font-family') {
      settings.fontFamily = e.target.value
      const customRow = document.getElementById('ext-custom-font-row')
      if (customRow) customRow.style.display = e.target.value === 'custom' ? '' : 'none'
      save()
    }
    if (e.target.id === 'ext-font-size') {
      settings.fontSize = e.target.value
      save()
    }
    if (e.target.id === 'ext-custom-font') {
      settings.customFontName = e.target.value.trim()
      save()
    }
  })

  // Live-save automod regex on input (debounced)
  let _automodSaveTimer = null
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'automod-regex') return
    clearTimeout(_automodSaveTimer)
    _automodSaveTimer = setTimeout(() => {
      settings.automodRegex = e.target.value
      save()
    }, 400)
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
