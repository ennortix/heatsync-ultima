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
    const stored = await chrome.storage.local.get('ui_settings')
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
  }

  async function save() {
    await chrome.storage.local.set({ ui_settings: settings })
  }

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.toggle[data-setting]')
    if (!toggle) return
    const key = toggle.dataset.setting
    settings[key] = !settings[key]
    toggle.classList.toggle('active', settings[key])
    save()
  })

  load()
})()
