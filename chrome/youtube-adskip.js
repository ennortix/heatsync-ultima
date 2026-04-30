/**
 * YouTube ad-skip
 *
 * Auto-clicks "Skip Ad", fast-forwards unskippable ads, dismisses overlay banners.
 * Runs on watch / live / shorts pages — skips embeds and the live_chat iframe.
 */
;(function() {
  'use strict'

  if (window.top !== window) return
  if (location.pathname.startsWith('/embed/')) return
  if (location.pathname.startsWith('/live_chat')) return

  const DEBUG = false
  const log = DEBUG ? console.log.bind(console, '[hs-yt-ad]') : () => {}

  const lifecycle = new AbortController()
  const { signal } = lifecycle
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true })

  const SKIP_SELECTORS = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-container button',
    '.ytp-skip-ad button',
    '.videoAdUiSkipButton',
  ]

  const CLOSE_SELECTORS = [
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-overlay-close-container button',
    '.ytp-ad-survey-question-container .ytp-ad-survey-skip-button',
    '.ytp-ad-feedback-dialog-close-button',
  ]

  function getPlayer() {
    return document.querySelector('#movie_player') || document.querySelector('.html5-video-player')
  }

  function clickAll(root, selectors) {
    let clicked = false
    for (const sel of selectors) {
      for (const el of root.querySelectorAll(sel)) {
        if (!el || el.disabled) continue
        if (el.offsetParent === null && el.getClientRects().length === 0) continue
        try { el.click(); clicked = true; log('click', sel) } catch (_) {}
      }
    }
    return clicked
  }

  function fastForwardAd(player) {
    const video = player.querySelector('video')
    if (!video) return false
    const dur = Number(video.duration)
    if (Number.isFinite(dur) && dur > 0) {
      try {
        video.currentTime = Math.max(0, dur - 0.05)
        video.playbackRate = 16
        if (!video.muted) { video.dataset._hsAdMuted = '1'; video.muted = true }
        log('ff to', dur)
        return true
      } catch (_) {}
    } else {
      try { video.playbackRate = 16 } catch (_) {}
    }
    return false
  }

  function unmuteIfWeMuted(player) {
    const video = player.querySelector('video')
    if (video && video.dataset._hsAdMuted === '1') {
      try { video.muted = false; video.playbackRate = 1 } catch (_) {}
      delete video.dataset._hsAdMuted
    }
  }

  function tickAdSkip() {
    const player = getPlayer()
    if (!player) return
    const adShowing = player.classList.contains('ad-showing') ||
                      player.classList.contains('ad-interrupting')
    if (clickAll(player, SKIP_SELECTORS)) return
    clickAll(player, CLOSE_SELECTORS)
    if (adShowing) fastForwardAd(player)
    else unmuteIfWeMuted(player)
  }

  function watchPlayer() {
    const obs = new MutationObserver(tickAdSkip)
    function attach() {
      const player = getPlayer()
      if (!player) return false
      obs.observe(player, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true })
      tickAdSkip()
      return true
    }
    if (!attach()) {
      const wait = new MutationObserver(() => { if (attach()) wait.disconnect() })
      wait.observe(document.documentElement, { childList: true, subtree: true })
      signal.addEventListener('abort', () => wait.disconnect())
    }
    signal.addEventListener('abort', () => obs.disconnect())
  }

  // Backup poll — catches late-binding skip buttons that don't trigger mutations
  function pollAdSkip() {
    const id = setInterval(tickAdSkip, 250)
    signal.addEventListener('abort', () => clearInterval(id))
  }

  function shouldRun() {
    return /^\/(watch|live|shorts)/.test(location.pathname)
  }

  function init() {
    if (!shouldRun()) return
    watchPlayer()
    pollAdSkip()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true, signal })
  } else {
    init()
  }
})()
