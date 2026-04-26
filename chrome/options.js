// HeatSync Options Page
(function() {
  'use strict'

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
    render()
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

  load()
})()
