/**
 * Cleanup/lifecycle module — memory leak prevention for long streaming sessions.
 * Tracks intervals, timeouts, MutationObservers, and event listeners for bulk teardown.
 *
 * Usage:
 *   cleanup.setInterval(fn, ms)         → tracked interval id
 *   cleanup.clearInterval(id)           → clear + untrack
 *   cleanup.setTimeout(fn, ms)          → tracked timeout id (auto-untracked on fire)
 *   cleanup.clearTimeout(id)            → clear + untrack
 *   cleanup.trackObserver(obs)          → obs (disconnect on destroyAll)
 *   cleanup.untrackObserver(obs)        → disconnect + untrack
 *   cleanup.trackListener(t, ev, fn, opts?) → untrack on destroyAll
 *   cleanup.untrackListener(t, ev, fn) → removeEventListener + untrack
 *   cleanup.destroyAll()                → tear everything down (safe to call repeatedly)
 */

;(function() {
  'use strict'

  if (window.heatsyncCleanup) return

  // --- internal state ---
  const _intervals = new Set()
  const _timeouts = new Set()
  const _observers = new Set()
  // listeners: Array<{ target, event, handler, options }>
  const _listeners = []

  // --- intervals ---

  function _setInterval(fn, ms) {
    const id = setInterval(fn, ms)
    _intervals.add(id)
    return id
  }

  function _clearInterval(id) {
    clearInterval(id)
    _intervals.delete(id)
  }

  // --- timeouts ---

  function _setTimeout(fn, ms) {
    let id
    id = setTimeout(() => {
      _timeouts.delete(id)
      fn()
    }, ms)
    _timeouts.add(id)
    return id
  }

  function _clearTimeout(id) {
    clearTimeout(id)
    _timeouts.delete(id)
  }

  // --- observers ---

  function _trackObserver(observer) {
    _observers.add(observer)
    return observer
  }

  function _untrackObserver(observer) {
    if (!observer) return
    try { observer.disconnect() } catch (e) {}
    _observers.delete(observer)
  }

  // --- listeners ---

  function _trackListener(target, event, handler, options) {
    if (!target || !event || !handler) return
    target.addEventListener(event, handler, options)
    _listeners.push({ target, event, handler, options })
  }

  function _untrackListener(target, event, handler) {
    if (!target || !event || !handler) return
    target.removeEventListener(event, handler)
    // remove all matching entries (same target + event + handler reference)
    for (let i = _listeners.length - 1; i >= 0; i--) {
      const l = _listeners[i]
      if (l.target === target && l.event === event && l.handler === handler) {
        _listeners.splice(i, 1)
      }
    }
  }

  // --- nuclear ---

  function _destroyAll() {
    _intervals.forEach(id => clearInterval(id))
    _intervals.clear()

    _timeouts.forEach(id => clearTimeout(id))
    _timeouts.clear()

    _observers.forEach(obs => {
      try { obs.disconnect() } catch (e) {}
    })
    _observers.clear()

    for (let i = _listeners.length - 1; i >= 0; i--) {
      const l = _listeners[i]
      try { l.target.removeEventListener(l.event, l.handler, l.options) } catch (e) {}
    }
    _listeners.length = 0
  }

  window.heatsyncCleanup = {
    setInterval: _setInterval,
    clearInterval: _clearInterval,
    setTimeout: _setTimeout,
    clearTimeout: _clearTimeout,
    trackObserver: _trackObserver,
    untrackObserver: _untrackObserver,
    trackListener: _trackListener,
    untrackListener: _untrackListener,
    destroyAll: _destroyAll,
  }
})()
