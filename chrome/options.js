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
    hideViewerCount: false
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
      toggle.classList.toggle('active', !!settings[key])
    }

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

  load()
})()
