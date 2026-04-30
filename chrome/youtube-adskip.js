/**
 * YouTube ad-skip + player resize
 *
 * Auto-clicks "Skip Ad", fast-forwards unskippable ads, dismisses overlay banners.
 * Adds an orange resize handle on the player so the user can drag-shrink the
 * video (works during ads too).
 *
 * Runs on watch / live / shorts pages only — skips embeds and the live_chat iframe.
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

  // ─── Player resize handle (orange drag bar) ─────────────────────────────────

  const SCALE_KEY = 'hs-yt-player-scale'
  const MIN_SCALE = 0.18
  const MAX_SCALE = 1.0

  function loadScale() {
    try {
      const v = parseFloat(localStorage.getItem(SCALE_KEY) || '1')
      return Number.isFinite(v) && v >= MIN_SCALE && v <= MAX_SCALE ? v : 1
    } catch (_) { return 1 }
  }

  function saveScale(v) {
    try { localStorage.setItem(SCALE_KEY, String(v)) } catch (_) {}
  }

  let playerScale = loadScale()

  function applyScale() {
    const player = getPlayer()
    if (!player) return
    if (playerScale >= 0.999) {
      player.style.transform = ''
      player.style.transformOrigin = ''
    } else {
      player.style.transformOrigin = 'top left'
      player.style.transform = `scale(${playerScale})`
    }
    repositionHandle()
  }

  let resizeHandle = null

  function repositionHandle() {
    if (!resizeHandle) return
    const player = getPlayer()
    if (!player) { resizeHandle.style.display = 'none'; return }
    const r = player.getBoundingClientRect()
    if (r.width < 50 || r.height < 50) { resizeHandle.style.display = 'none'; return }
    resizeHandle.style.display = ''
    const visW = r.width * playerScale
    const visH = r.height * playerScale
    const size = 24
    resizeHandle.style.left = Math.round(r.left + visW - size) + 'px'
    resizeHandle.style.top = Math.round(r.top + visH - size) + 'px'
  }

  function ensureResizeHandle() {
    const player = getPlayer()
    if (!player) return
    if (resizeHandle && document.body.contains(resizeHandle)) { repositionHandle(); return }

    const handle = document.createElement('div')
    handle.id = 'hs-yt-player-resize'
    handle.title = 'HeatSync — drag to resize, double-click to reset'
    handle.style.cssText = [
      'position:fixed',
      'width:24px',
      'height:24px',
      'background:#ff8700',
      'cursor:nwse-resize',
      'z-index:2147483640',
      'opacity:0.85',
      'pointer-events:auto',
      'touch-action:none',
      'box-shadow:0 0 8px rgba(255,135,0,0.6), inset 0 0 0 1px rgba(0,0,0,0.4)',
      'border-top-left-radius:6px',
    ].join(';')

    document.body.appendChild(handle)
    resizeHandle = handle
    repositionHandle()

    let dragging = false
    let startX = 0, startY = 0
    let startScale = 1
    let startW = 0
    let pid = -1
    let overlay = null

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      dragging = true
      pid = e.pointerId
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      startX = e.clientX
      startY = e.clientY
      startScale = playerScale
      startW = player.getBoundingClientRect().width || 1
      document.body.style.cursor = 'nwse-resize'
      document.body.style.userSelect = 'none'
      overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:nwse-resize'
      document.body.appendChild(overlay)
      e.preventDefault()
      e.stopPropagation()
    }, { signal })

    handle.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== pid) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const delta = (dx + dy) / 2
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, startScale + delta / Math.max(1, startW)))
      playerScale = next
      applyScale()
      e.preventDefault()
    }, { signal })

    function endDrag(e) {
      if (!dragging || (e && e.pointerId !== pid)) return
      dragging = false
      pid = -1
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (overlay) { overlay.remove(); overlay = null }
      saveScale(playerScale)
    }
    handle.addEventListener('pointerup', endDrag, { signal })
    handle.addEventListener('pointercancel', endDrag, { signal })

    // Double-click → reset to full size
    handle.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      playerScale = 1
      saveScale(1)
      applyScale()
    }, { signal })

    applyScale()
  }

  function watchForResize() {
    const obs = new MutationObserver(() => {
      ensureResizeHandle()
      if (playerScale < 1) applyScale()
      else repositionHandle()
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
    signal.addEventListener('abort', () => obs.disconnect())

    const onView = () => repositionHandle()
    window.addEventListener('scroll', onView, { passive: true, signal })
    window.addEventListener('resize', onView, { signal })
    // rAF loop while handle exists — cheap (single rect read) and keeps the
    // handle pinned to the player's bottom-right during YT layout reflows
    let raf = 0
    function loop() {
      raf = requestAnimationFrame(loop)
      if (resizeHandle) repositionHandle()
    }
    raf = requestAnimationFrame(loop)
    signal.addEventListener('abort', () => cancelAnimationFrame(raf))

    ensureResizeHandle()
  }

  // ─── Init ────────────────────────────────────────────────────────────────────

  function shouldRun() {
    return /^\/(watch|live|shorts)/.test(location.pathname)
  }

  function init() {
    if (!shouldRun()) return
    watchPlayer()
    pollAdSkip()
    watchForResize()
  }

  // YouTube SPA navigation — re-init on URL change
  let lastPath = location.pathname
  const navPoll = setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname
      if (shouldRun()) {
        ensureResizeHandle()
        tickAdSkip()
      }
    }
  }, 500)
  signal.addEventListener('abort', () => clearInterval(navPoll))

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true, signal })
  } else {
    init()
  }
})()
