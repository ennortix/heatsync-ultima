// Runs at document_start, BEFORE Twitch/Kick scripts register their click handlers.
// Intercepts username clicks in our multichat (.hs-mc-user) and dispatches a custom event
// that the multichat content script picks up to open our btop profile card.
// This is the only reliable way to prevent the platform's native user-card popup,
// since registration order matters in capture phase and we must beat React.
(function() {
  'use strict'

  if (window.__heatsyncPCardEarly) return
  window.__heatsyncPCardEarly = true

  function shouldIntercept(e) {
    if (e.button !== undefined && e.button !== 0) return null
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return null
    const target = e.target
    if (!target?.closest) return null
    const userEl = target.closest('.hs-mc-user')
    if (!userEl) return null
    if (target.closest('[data-pcard-pill]')) return null
    if (userEl.classList.contains('hs-mc-reply-user')) return null
    return userEl
  }

  function block(e) {
    if (shouldIntercept(e)) {
      e.stopPropagation()
      e.stopImmediatePropagation()
    }
  }

  document.addEventListener('mousedown', block, { capture: true })
  document.addEventListener('mouseup', block, { capture: true })
  document.addEventListener('pointerdown', block, { capture: true })
  document.addEventListener('pointerup', block, { capture: true })
  document.addEventListener('auxclick', block, { capture: true })

  document.addEventListener('click', (e) => {
    const userEl = shouldIntercept(e)
    if (!userEl) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    const username = (userEl.dataset.username || userEl.textContent.replace(/^@/, '')).trim()
    const platform = userEl.dataset.platform || null
    document.dispatchEvent(new CustomEvent('hs-pcard-open', {
      detail: { username, platform },
      bubbles: false
    }))
  }, { capture: true })
})()
