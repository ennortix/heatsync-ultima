// Error reporter — capture uncaught errors + unhandledrejection + console.error
// into a ring buffer in chrome.storage.local. Popup exposes "copy errors" so
// the user can paste a real repro context (stack + ver + platform + url) when
// reporting a bug, instead of trying to describe it from memory.
//
// Ring-buffer keyed `hs_errors`, cap 50. Writes debounced 500ms.
// Bundled into every content script; install-gated via window.__hsErrorReporter.
// Service worker has its own inline install in background.js (no window).

;(function() {
  'use strict'

  if (typeof window === 'undefined' || window.__hsErrorReporter) return

  const MAX = 50
  const STORAGE_KEY = 'hs_errors'
  const MSG_CAP = 500
  const STACK_CAP = 2000
  const WRITE_DEBOUNCE_MS = 500

  let _ver = 'unknown'
  try { _ver = chrome?.runtime?.getManifest?.()?.version || _ver } catch (_) {}

  const _host = (typeof location !== 'undefined' && location.hostname) || ''
  const _plat = _host.includes('kick.com') ? 'kick'
    : _host.includes('youtube.com') ? 'yt'
    : _host.includes('twitch.tv') ? 'twitch'
    : 'other'

  let _reentry = false
  let _pending = []
  let _writeTimer = null

  function _truncate(s, n) {
    if (typeof s !== 'string') { try { s = String(s) } catch { return '' } }
    return s.length > n ? s.slice(0, n) : s
  }

  function _fmtErr(e) {
    if (e == null) return { msg: '' }
    if (e instanceof Error || (typeof e === 'object' && e && 'stack' in e)) {
      let msg = ''
      let stack = ''
      try { msg = String(e.message || '') } catch (_) {}
      try { stack = String(e.stack || '') } catch (_) {}
      if (!msg) {
        try { msg = String(e) } catch (_) { msg = '[unreadable]' }
        if (msg === '[object Object]') msg = ''
      }
      return { msg: _truncate(msg, MSG_CAP), stack: _truncate(stack, STACK_CAP) }
    }
    if (typeof e === 'object') {
      try {
        const s = JSON.stringify(e)
        if (s && s !== '{}' && s !== '[]') return { msg: _truncate(s, MSG_CAP) }
      } catch (_) {}
      try { return { msg: _truncate(String(e), MSG_CAP) } } catch { return { msg: '[unserializable]' } }
    }
    return { msg: _truncate(String(e), MSG_CAP) }
  }

  // Synthesize a stack at the call-site so console-wrapped + reasonless rejection
  // entries still point somewhere useful. Two leading frames trimmed: this fn +
  // the caller wrapper.
  function _synthStack(skip) {
    try {
      const s = String(new Error().stack || '')
      const lines = s.split('\n')
      return lines.slice((skip || 0) + 1).join('\n')
    } catch (_) { return '' }
  }

  function _capture(rec) {
    if (_reentry) return
    // Drop entries with no useful payload — empty msg AND empty stack.
    // Keeps "Script error." cross-origin sanitization noise out of the buffer
    // and stops reasonless rejections from displacing real errors.
    if (!rec.msg && !rec.stack) return
    if (rec.msg === 'Script error.' && !rec.stack) return
    _reentry = true
    try {
      _pending.push(rec)
      if (_pending.length > MAX) _pending.splice(0, _pending.length - MAX)
      _scheduleWrite()
    } catch (_) {} finally { _reentry = false }
  }

  function _scheduleWrite() {
    if (_writeTimer) return
    _writeTimer = setTimeout(_flush, WRITE_DEBOUNCE_MS)
  }

  function _flush() {
    _writeTimer = null
    if (_pending.length === 0) return
    const batch = _pending.splice(0, _pending.length)
    try {
      const storage = chrome?.storage?.local
      if (!storage) return
      storage.get(STORAGE_KEY, (cur) => {
        try {
          if (chrome?.runtime?.lastError) return
          const existing = Array.isArray(cur?.[STORAGE_KEY]) ? cur[STORAGE_KEY] : []
          const next = existing.concat(batch).slice(-MAX)
          storage.set({ [STORAGE_KEY]: next }, () => { void chrome?.runtime?.lastError })
        } catch (_) {}
      })
    } catch (_) {}
  }

  function _onError(e) {
    try {
      const f = _fmtErr(e.error != null ? e.error : e.message)
      _capture({
        ts: Date.now(), type: 'error', plat: _plat, ver: _ver,
        url: _truncate(location.href, 200),
        msg: f.msg, stack: f.stack,
        file: _truncate(e.filename || '', 200),
        line: e.lineno || 0,
      })
    } catch (_) {}
  }

  function _onRejection(e) {
    try {
      const f = _fmtErr(e.reason)
      const stack = f.stack || _synthStack(2)
      _capture({
        ts: Date.now(), type: 'rejection', plat: _plat, ver: _ver,
        url: _truncate(location.href, 200),
        msg: f.msg || '(promise rejection with no reason)',
        stack,
      })
    } catch (_) {}
  }

  try { window.addEventListener('error', _onError, true) } catch (_) {}
  try { window.addEventListener('unhandledrejection', _onRejection, true) } catch (_) {}

  // Wrap console.error so explicit error logs land in the buffer too.
  // Skip console.warn/log — far too noisy. Pass-through to native so devtools
  // output is unchanged.
  try {
    const origErr = console.error
    if (origErr && !origErr.__hsWrapped) {
      const wrapped = function(...args) {
        try {
          let derivedStack = ''
          const parts = args.map(a => {
            if (a instanceof Error || (typeof a === 'object' && a && 'stack' in a)) {
              if (!derivedStack && a.stack) { try { derivedStack = String(a.stack) } catch (_) {} }
              try { return String(a.message || a) } catch (_) { return '[unreadable]' }
            }
            if (typeof a === 'string') return a
            try {
              const s = JSON.stringify(a)
              return s && s !== '{}' ? s : String(a)
            } catch { return String(a) }
          })
          const msg = parts.filter(p => p && p !== '[object Object]').join(' ')
          if (!derivedStack) derivedStack = _synthStack(2)
          _capture({
            ts: Date.now(), type: 'console', plat: _plat, ver: _ver,
            url: _truncate(location.href, 200),
            msg: _truncate(msg, MSG_CAP),
            stack: _truncate(derivedStack, STACK_CAP),
          })
        } catch (_) {}
        return origErr.apply(this, args)
      }
      wrapped.__hsWrapped = true
      console.error = wrapped
    }
  } catch (_) {}

  window.__hsErrorReporter = {
    capture: _capture,
    flush: _flush,
    ver: _ver,
    plat: _plat,
  }
})()
