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
  abort: () => { _hsMcTakenOver = true; try { lifecycle.abort() } catch (_) {} },
  // Diagnostic probe — exposes IRC/Kick/YT chat state. Callable both from
  // isolated-world content scripts (via window.__heatsyncMcLifecycle.dbg())
  // AND from page MAIN world via a CustomEvent bridge:
  //   document.dispatchEvent(new CustomEvent('hs-dbg-probe'))
  //   then read document.documentElement.dataset.hsDbg
  // The MAIN-world dispatch is what makes this usable from devtools console
  // (which defaults to MAIN unless context is switched).
  dbg: () => _hsBuildDbg(),
}
function _hsBuildDbg() {
  const safeChans = (chat) => {
    if (!chat?.channels) return null
    const out = {}
    try {
      for (const [ch, buf] of chat.channels) {
        out[ch] = { count: buf?.getAll?.()?.length ?? 0 }
      }
    } catch (e) { return 'err: ' + e?.message }
    return out
  }
  const kickResolvedSample = (() => {
    try {
      if (typeof kickNameResolved === 'undefined') return 'no kickNameResolved'
      const entries = [...kickNameResolved.entries()].slice(0, 20)
      const hits = entries.filter(([, v]) => v != null).length
      return { size: kickNameResolved.size, hits, sample: entries.slice(0, 10) }
    } catch (e) { return 'err: ' + e?.message }
  })()
  const kickPending = (() => {
    try {
      if (typeof kickNameLookupPending === 'undefined') return 'no kickNameLookupPending'
      return { pending: kickNameLookupPending.size, sample: [...kickNameLookupPending].slice(0, 10) }
    } catch (e) { return 'err: ' + e?.message }
  })()
  return {
    irc: typeof irc !== 'undefined' ? safeChans(irc) : 'no irc',
    kick: typeof kickChat !== 'undefined' ? safeChans(kickChat) : 'no kickChat',
    currentTab: typeof currentTab !== 'undefined' ? currentTab : null,
    channels: typeof config !== 'undefined' && Array.isArray(config?.channels)
      ? config.channels.map(c => ({ id: c.id, twitch: c.twitch, kick: c.kick, youtube: c.youtube }))
      : 'no config.channels',
    platformFilters: typeof platformFilters !== 'undefined' ? platformFilters : null,
    kickResolved: kickResolvedSample,
    kickPendingLookups: kickPending,
  }
}
// MAIN-world bridge: dispatchEvent('hs-dbg-probe') from page → content script
// writes JSON snapshot to documentElement.dataset.hsDbg → MAIN reads.
document.addEventListener('hs-dbg-probe', () => {
  try {
    document.documentElement.dataset.hsDbg = JSON.stringify(_hsBuildDbg())
  } catch (e) {
    document.documentElement.dataset.hsDbg = 'err:' + (e?.message || 'unknown')
  }
}, true)
// hs-dbg-alias-probe → returns getUserAliases() + mute/block state for a test
// user. Lets MAIN-world verify the cross-platform alias resolution end-to-end.
document.addEventListener('hs-dbg-alias-probe', (e) => {
  try {
    const username = e?.detail?.username || ''
    const platform = e?.detail?.platform || null
    const aliases = (typeof getUserAliases === 'function') ? getUserAliases(username, platform) : null
    const muted = (typeof isUserMuted === 'function') ? isUserMuted(username, platform) : null
    const blocked = (typeof isUserBlocked === 'function') ? isUserBlocked(username, platform) : null
    const mutedAll = (typeof mutedUsers !== 'undefined' && mutedUsers instanceof Set) ? [...mutedUsers] : null
    const blockedAll = (typeof blockedUsers !== 'undefined' && blockedUsers instanceof Set) ? [...blockedUsers] : null
    document.documentElement.dataset.hsDbgAlias = JSON.stringify({
      username, platform, aliases, muted, blocked,
      mutedCount: mutedAll?.length ?? null,
      blockedCount: blockedAll?.length ?? null,
      mutedAll: mutedAll?.slice(-20),
      blockedAll: blockedAll?.slice(-20),
    })
  } catch (err) {
    document.documentElement.dataset.hsDbgAlias = 'err:' + (err?.message || 'unknown')
  }
}, true)
document.addEventListener('hs-dbg-render-trace', (e) => {
  try {
    const id = (e?.detail?.id || '').toLowerCase()
    const ch = (typeof getChannelById === 'function') ? getChannelById(id) : null
    const tw = ch?.twitch
    const kk = ch?.kick
    const ircMsgs = tw && typeof irc !== 'undefined' ? (irc?.getMessages(tw) || []) : []
    const kickMsgs = kk && typeof kickChat !== 'undefined' ? (kickChat?.getMessages(kk) || []) : []
    const ytMsgs = (typeof channelYtMessages !== 'undefined') ? (channelYtMessages.get(id) || []) : []
    const filt = (typeof getPlatformFilter === 'function') ? getPlatformFilter(id) : null
    const out = {
      id, ch_twitch: tw, ch_kick: kk,
      ircMsgs_len: ircMsgs.length,
      kickMsgs_len: kickMsgs.length,
      ytMsgs_len: ytMsgs.length,
      filt,
      ircTimes: ircMsgs.slice(-3).map(m => ({u: m.user, t: m.time, txt: (m.text||'').slice(0,30)})),
      ytTimes: ytMsgs.slice(-3).map(m => ({u: m.user, t: m.time, txt: (m.text||'').slice(0,30)})),
      ircHidden: ircMsgs.filter(m => m?.hidden).length,
    }
    document.documentElement.dataset.hsDbg3 = JSON.stringify(out)
  } catch (err) {
    document.documentElement.dataset.hsDbg3 = 'err:' + (err?.message || 'unknown')
  }
}, true)
document.addEventListener('hs-dbg-twitch-sample', (e) => {
  try {
    const ch = (e?.detail?.ch || '').toLowerCase()
    const buf = (typeof irc !== 'undefined') ? irc?.channels?.get(ch) : null
    if (!buf) { document.documentElement.dataset.hsDbg2 = JSON.stringify({err: 'no buf'}); return }
    const all = buf.getAll()
    const times = all.map(m => m.time || 0).filter(t => t)
    const minT = times.length ? Math.min(...times) : 0
    const maxT = times.length ? Math.max(...times) : 0
    const sample = all.slice(-3).map(m => ({user: m.user, time: m.time, text: m.text?.slice(0,40), platform: m.platform, hidden: m.hidden, isHistory: m.isHistory, type: m.type}))
    document.documentElement.dataset.hsDbg2 = JSON.stringify({
      total: all.length,
      noTime: all.length - times.length,
      minT, maxT,
      minISO: minT ? new Date(minT).toISOString() : null,
      maxISO: maxT ? new Date(maxT).toISOString() : null,
      sample
    })
  } catch (err) {
    document.documentElement.dataset.hsDbg2 = 'err:' + (err?.message || 'unknown')
  }
}, true)

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

// hsSched — cooperative scheduler for boot-burst work in the multichat
// panel. Identical contract to content.js side: budget-yield chunking, pause
// while user is actively scrolling, scheduler.postTask priority. Keeps a
// 5-channel hydration from holding the main thread > ~4ms per slice.
const hsSched = (() => {
  let _scrollIdle = true
  let _scrollIdleTimer = null
  const markBusy = () => {
    _scrollIdle = false
    if (_scrollIdleTimer) clearTimeout(_scrollIdleTimer)
    _scrollIdleTimer = setTimeout(() => { _scrollIdle = true; _scrollIdleTimer = null }, 180)
  }
  for (const ev of ['scroll', 'wheel', 'touchmove', 'pointerdown']) {
    try { window.addEventListener(ev, markBusy, { passive: true, capture: true, signal: mcSignal }) } catch {}
  }
  const _yield = () => {
    if (typeof scheduler !== 'undefined' && typeof scheduler.yield === 'function') {
      return scheduler.yield()
    }
    return new Promise(r => setTimeout(r, 0))
  }
  const untilIdle = async () => {
    let waited = 0
    while (!_scrollIdle && waited < 2000) {
      await new Promise(r => setTimeout(r, 60))
      waited += 60
    }
  }
  const idle = (fn, { timeout = 2000, priority = 'background' } = {}) => {
    if (typeof scheduler !== 'undefined' && typeof scheduler.postTask === 'function') {
      return scheduler.postTask(fn, { priority })
    }
    if (typeof window.requestIdleCallback === 'function') {
      return new Promise(r => requestIdleCallback(() => { try { r(fn()) } catch (e) { r() } }, { timeout }))
    }
    return new Promise(r => setTimeout(() => { try { r(fn()) } catch (e) { r() } }, 0))
  }
  const chunk = async (items, fn, { budgetMs = 4, respectScroll = true } = {}) => {
    let t0 = performance.now()
    for (let i = 0; i < items.length; i++) {
      if (respectScroll && !_scrollIdle) await untilIdle()
      try { await fn(items[i], i) } catch (e) {}
      if (performance.now() - t0 > budgetMs) {
        await _yield()
        t0 = performance.now()
      }
    }
  }
  return { yield: _yield, idle, chunk, untilIdle, get scrollIdle() { return _scrollIdle } }
})()

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
