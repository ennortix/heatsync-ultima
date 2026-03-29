(function() {
  'use strict'

  const DEFAULTS = {
    hs_emote_size: 'medium',
    hs_notifications: false,
    hs_auto_claim_points: true
  }

  const toast = document.getElementById('toast')
  let toastTimer

  function flashSaved() {
    toast.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1200)
  }

  function save(key, value) {
    chrome.storage.local.set({ [key]: value }).catch(err => {
      console.error('[heatsync] options save failed:', err)
      toast.textContent = 'save failed'
      toast.classList.add('show')
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => { toast.classList.remove('show'); toast.textContent = 'settings saved' }, 2000)
    })
    flashSaved()
  }

  function bindRadio(groupId, storageKey, value) {
    const safeValue = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '')
    const radio = safeValue ? document.querySelector(
      `#${groupId} input[value="${safeValue}"]`
    ) : null
    if (radio) radio.checked = true

    document.getElementById(groupId).addEventListener('change', (e) => {
      if (e.target.type === 'radio') save(storageKey, e.target.value)
    })
  }

  function bindToggle(elementId, storageKey, value) {
    const el = document.getElementById(elementId)
    el.checked = value
    el.addEventListener('change', () => save(storageKey, el.checked))
  }

  async function init() {
    const data = await chrome.storage.local.get(Object.keys(DEFAULTS))
    const s = { ...DEFAULTS, ...data }

    bindRadio('emote-size', 'hs_emote_size', s.hs_emote_size)
    bindToggle('auto-claim-points', 'hs_auto_claim_points', s.hs_auto_claim_points)
    bindToggle('notifications', 'hs_notifications', s.hs_notifications)
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(e => console.error('options init failed:', e))
  })
})()
