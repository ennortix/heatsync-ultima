// Bootstrap - lifecycle controller, cleanup utilities, debug log

const MC_DEBUG = false
function log(...args) {
  if (MC_DEBUG) console.log(LOG_PREFIX, ...args)
}

// Re-injection guard. background.js re-executes multichat.js on extension
// update/reload — without this, OLD + NEW both run: doubled observers, doubled
// IRC connections, doubled DOM nodes. Heavy CPU/memory load = Chrome crash.
try {
  if (typeof window.__heatsyncMcLifecycle?.abort === 'function') {
    window.__heatsyncMcLifecycle.abort()
  }
} catch (_) {}

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

// Export abort handle so a future re-injection of this script can tear us down.
// _hsMcTakenOver flips iff someone outside this closure called our abort —
// i.e. a NEW multichat.js instance took over. Internal aborts skip the flag.
let _hsMcTakenOver = false
window.__heatsyncMcLifecycle = {
  abort: () => { _hsMcTakenOver = true; try { lifecycle.abort() } catch (_) {} }
}

// Fast context-death detector. chrome.runtime.id becomes undefined sync on
// extension reload. Tear down lifecycle immediately, then defer reload to
// visibility — active tab reloads in 1–5s, background tabs wait until user
// focuses them. Avoids the N-tab thundering React mount herd that crashes
// Chrome. content.js sets __heatsyncReloadScheduled — dedupe across scripts.
const _hsMcCtxDeathTimer = setInterval(() => {
  if (chrome.runtime?.id) return
  clearInterval(_hsMcCtxDeathTimer)
  try { lifecycle.abort() } catch (_) {}
  if (window.__heatsyncReloadScheduled) return
  window.__heatsyncReloadScheduled = true
  const doReload = () => { if (_hsMcTakenOver) return; try { location.reload() } catch (_) {} }
  if (document.visibilityState === 'visible') {
    setTimeout(doReload, 1000 + Math.random() * 4000)
  } else {
    document.addEventListener('visibilitychange', function once() {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', once)
      setTimeout(doReload, 500 + Math.random() * 2000)
    })
  }
}, 2000)
_timers.intervals.push(_hsMcCtxDeathTimer)

// Optional perf tracer. window.__hsPerfTrace = true at runtime to log
// callbacks exceeding 50ms into window.__hsPerfLog. Source captured at
// registration so anonymous arrows still get a stable identifier.
function _hsPerfWrap(fn, ms, kind) {
  let src = ''
  try {
    const stack = (new Error()).stack || ''
    const lines = stack.split('\n')
    for (const line of lines) {
      if (!line || line.includes('bootstrap.js') || line.includes('_hsPerfWrap')) continue
      src = line.trim().slice(0, 160); break
    }
  } catch {}
  return function() {
    if (!window.__hsPerfTrace) return fn.apply(this, arguments)
    const t = performance.now()
    try { return fn.apply(this, arguments) }
    finally {
      const d = performance.now() - t
      if (d > 50) {
        (window.__hsPerfLog ||= []).push({ side: 'mc', kind, ms, dur: Math.round(d), at: Math.round(t), src })
        if (window.__hsPerfLog.length > 300) window.__hsPerfLog.shift()
      }
    }
  }
}

const cleanup = {
  setInterval(fn, ms) { const id = setInterval(_hsPerfWrap(fn, ms, 'interval'), ms); _timers.intervals.push(id); return id },
  setIntervalIfVisible(fn, ms) { const w = _hsPerfWrap(fn, ms, 'intervalIfVisible'); const id = setInterval(() => { if (!document.hidden) w() }, ms); _timers.intervals.push(id); return id },
  clearInterval(id) { clearInterval(id); const i = _timers.intervals.indexOf(id); if (i !== -1) _timers.intervals.splice(i, 1) },
  setTimeout(fn, ms) {
    const w = _hsPerfWrap(fn, ms, 'timeout')
    const id = setTimeout(() => {
      const idx = _timers.timeouts.indexOf(id)
      if (idx !== -1) _timers.timeouts.splice(idx, 1)
      w()
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
    const w = _hsPerfWrap(fn, 0, 'raf')
    id = requestAnimationFrame(() => { _pendingRafs.delete(id); w() })
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
