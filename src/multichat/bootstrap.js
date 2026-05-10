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
// Singleton DOM nodes appended to <body> (tooltips, toasts, overlays). On
// SPA reinit / pagehide, lifecycle.abort() removes them so they don't pile up
// across reload cycles.
const _trackedNodes = []
// Listeners on APIs that don't honor AbortSignal (chrome.runtime.onMessage,
// chrome.storage.onChanged). We track {target, fn} pairs and call removeListener
// on abort so reinit (SPA nav, hot-reload) doesn't leave stale handlers behind.
const _trackedListeners = []
mcSignal.addEventListener('abort', () => {
  _timers.intervals.forEach(clearInterval)
  _timers.timeouts.forEach(clearTimeout)
  _timers.observers.forEach(o => o.disconnect())
  _pendingRafs.forEach(cancelAnimationFrame); _pendingRafs.clear()
  for (const { target, fn } of _trackedListeners) {
    try { target.removeListener(fn) } catch (e) {}
  }
  _trackedListeners.length = 0
  for (const n of _trackedNodes) {
    try { n.remove() } catch (e) {}
  }
  _trackedNodes.length = 0
  if (irc) { irc.destroy(); }
  if (kickChat) { kickChat.destroy(); }
  cleanupAuthIrc(true)
  // Wildcard reset of every _hsMc*/_hsEmote* install-once flag so reinit
  // (SPA nav, hot-reload) re-attaches handlers to the fresh IIFE state.
  // Without this, reinit gates re-bind on `!window._hsMcXxx` and silently
  // skips — old listeners stay attached and capture the now-dead old IIFE
  // closure, leaking it. Wildcard avoids the maintenance burden of listing
  // every flag (some are added in feature files I don't always edit here).
  for (const k of Object.keys(window)) {
    if (k.startsWith('_hsMc') || k.startsWith('_hsEmote')) {
      try { delete window[k] } catch {}
    }
  }
})
window.addEventListener('pagehide', () => lifecycle.abort())

const cleanup = {
  setInterval(fn, ms) { const id = setInterval(fn, ms); _timers.intervals.push(id); return id },
  setIntervalIfVisible(fn, ms) { const id = setInterval(() => { if (!document.hidden) fn() }, ms); _timers.intervals.push(id); return id },
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
  // For chrome.runtime.onMessage / chrome.storage.onChanged etc — APIs that
  // expose addListener/removeListener but ignore AbortSignal.
  addListener(target, fn) {
    if (!target?.addListener) return
    target.addListener(fn)
    _trackedListeners.push({ target, fn })
  },
  trackObserver(obs) { _timers.observers.push(obs); return obs },
  untrackObserver(obs) {
    if (!obs) return
    try { obs.disconnect() } catch (e) {}
    const i = _timers.observers.indexOf(obs)
    if (i !== -1) _timers.observers.splice(i, 1)
  },
  raf(fn) {
    let id
    id = requestAnimationFrame(() => { _pendingRafs.delete(id); fn() })
    _pendingRafs.add(id)
    return id
  },
  cancelRaf(id) { cancelAnimationFrame(id); _pendingRafs.delete(id) },
  // Track a singleton body-level node (tooltip, toast, overlay) so that
  // lifecycle.abort() removes it. Returns the node for chaining:
  //   document.body.appendChild(cleanup.trackNode(el))
  trackNode(node) {
    if (!node) return node
    _trackedNodes.push(node)
    return node
  },
}
