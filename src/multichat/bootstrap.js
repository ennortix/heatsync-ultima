// Bootstrap - lifecycle controller, cleanup utilities, debug log

const MC_DEBUG = false
function log(...args) {
  if (MC_DEBUG) console.log(LOG_PREFIX, ...args)
}

// Lifecycle controller — abort() tears down ALL listeners, timers, observers
const lifecycle = new AbortController()
const mcSignal = lifecycle.signal
const _timers = { intervals: [], timeouts: [], observers: [] }
const _pendingRafs = new Set()
mcSignal.addEventListener('abort', () => {
  _timers.intervals.forEach(clearInterval)
  _timers.timeouts.forEach(clearTimeout)
  _timers.observers.forEach(o => o.disconnect())
  _pendingRafs.forEach(cancelAnimationFrame); _pendingRafs.clear()
  if (irc) { irc.destroy(); }
  if (kickChat) { kickChat.destroy(); }
  cleanupAuthIrc(true)
  delete window._hsMcEmoteContextHandler
  delete window._hsMcEmoteClickHandler
  delete window._hsEmoteTooltipSetup
  delete window._hsMcSettingsListener
  delete window._hsMcTabHandler
  delete window._hsMcTypeRevealHandler
})
window.addEventListener('pagehide', () => lifecycle.abort())

const cleanup = {
  setInterval(fn, ms) { const id = setInterval(fn, ms); _timers.intervals.push(id); return id },
  clearInterval(id) { clearInterval(id); const i = _timers.intervals.indexOf(id); if (i !== -1) _timers.intervals.splice(i, 1) },
  setTimeout(fn, ms) {
    const id = setTimeout(() => {
      const idx = _timers.timeouts.indexOf(id)
      if (idx !== -1) _timers.timeouts.splice(idx, 1)
      fn()
    }, ms)
    _timers.timeouts.push(id)
    return id
  },
  clearTimeout(id) { clearTimeout(id); const i = _timers.timeouts.indexOf(id); if (i !== -1) _timers.timeouts.splice(i, 1) },
  addEventListener(target, event, handler) {
    target.addEventListener(event, handler, { signal: mcSignal })
  },
  trackObserver(obs) { _timers.observers.push(obs); return obs },
  raf(fn) {
    let id
    id = requestAnimationFrame(() => { _pendingRafs.delete(id); fn() })
    _pendingRafs.add(id)
    return id
  },
  cancelRaf(id) { cancelAnimationFrame(id); _pendingRafs.delete(id) },
}
