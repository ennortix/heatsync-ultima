// Notifs — central notification system for multichat.
//
// Single source of truth for every popup/toast/callout/banner in multichat.
// Adding a new notif type is a single registerType call. Layer positioning is
// computed in ONE place (HsNotifs.updateLayout) instead of scattered CSS-var
// spew across main.js + styles.js.
//
// THREE ABSTRACTIONS
//
//   1. Layer  — positioned region of the page (toast-stack, chat-docked-bottom,
//               chat-docked-top, modal, …). Owns its container element + a
//               geometry function that returns top/left/right/bottom from the
//               current overlay/inputbar/tabbar rects. The manager publishes
//               those values as --hs-layer-{name}-{prop} CSS vars; CSS in
//               styles.js positions the layer container off them.
//
//   2. Type   — declarative notif spec: which layer, render fn, dedupe key,
//               timeout, action buttons (primary/dismiss/secondary). Each
//               type is independent; deleting the registerType call removes
//               the notif from the system entirely.
//
//   3. Source — adapter that feeds notifs in. Three flavors:
//                 direct       HsNotifs.emit('toast', { text, level })
//                 dom-observer registerType handles its own observer in onInit
//                 irc-events   subscribe to irc.on('message'), emit on match
//
// HOW TO ADD A NEW TYPE (worked example)
//
//     HsNotifs.registerType('twitch-raid', {
//       layer: 'chat-docked-top',
//       dedupeKey: ({ raidFrom }) => `raid:${raidFrom}`,
//       timeout: 30000,
//       render: ({ data }) => {
//         const el = document.createElement('span')
//         el.textContent = `${data.raidFrom} raided with ${data.viewers}!`
//         return el
//       },
//       actions: { dismiss: { label: '✕' } },
//     })
//     // Then anywhere:
//     HsNotifs.emit('twitch-raid', { raidFrom: 'someone', viewers: 50 })
//
// HOW TO REMOVE — delete the registerType call. Done.
//
// LAYER GEOMETRY — main.js's _updateMcLayout calls HsNotifs.updateLayout(ctx)
// once per layout change. The manager iterates layers and re-publishes their
// CSS vars. Animations are CSS, not JS.

const HsNotifs = (() => {
  const layers = new Map()  // name -> { def, current: [], _container }
  const types = new Map()   // name -> def
  let _idCounter = 0

  function registerLayer(name, def) {
    if (layers.has(name)) return
    layers.set(name, { def: def || {}, current: [], _container: null })
  }

  function registerType(name, def) {
    if (!def?.layer) { console.warn('[notifs] type', name, 'missing layer'); return }
    if (!layers.has(def.layer)) { console.warn('[notifs] type', name, 'unknown layer', def.layer); return }
    types.set(name, def)
  }

  function emit(typeName, data) {
    const t = types.get(typeName)
    if (!t) { console.warn('[notifs] unknown type', typeName); return null }
    const l = layers.get(t.layer)

    const key = t.dedupeKey?.(data)
    if (key) {
      const existing = l.current.find(n => n.key === key)
      if (existing) {
        if (t.dedupePolicy === 'replace') {
          existing.data = data
          if (existing.el) _renderInto(existing)
          return existing.id
        }
        return existing.id
      }
    }

    if (l.def.stack === 'replace' && l.current.length > 0) {
      for (const old of [...l.current]) dismiss(old.id)
    }
    if (l.def.maxVisible && l.current.length >= l.def.maxVisible) {
      dismiss(l.current[0].id)
    }

    const id = `hs-notif-${typeName}-${++_idCounter}`
    const notif = { id, typeName, type: t, data, key, el: null, _timer: null }
    _mount(notif, l)
    return id
  }

  function dismiss(id) {
    for (const l of layers.values()) {
      const idx = l.current.findIndex(n => n.id === id)
      if (idx >= 0) {
        const n = l.current[idx]
        l.current.splice(idx, 1)
        if (n._timer) { clearTimeout(n._timer); n._timer = null }
        try { n.type.onDismiss?.(n.data) } catch (_) {}
        // Exit animation — flag wrapper for CSS to fade/slide out, then
        // remove on animation end. Falls back to immediate remove if the
        // animation event never fires (detached, reduced-motion, etc.).
        const el = n.el
        if (el && el.isConnected) {
          el.classList.add('hs-notif-exiting')
          let removed = false
          const cleanup = () => { if (removed) return; removed = true; try { el.remove() } catch (_) {} }
          el.addEventListener('animationend', cleanup, { once: true })
          setTimeout(cleanup, 220)
        } else {
          try { el?.remove() } catch (_) {}
        }
        return true
      }
    }
    return false
  }

  function dismissByKey(typeName, key) {
    const t = types.get(typeName)
    if (!t) return false
    const l = layers.get(t.layer)
    const found = l.current.find(n => n.typeName === typeName && n.key === key)
    return found ? dismiss(found.id) : false
  }

  function _mount(notif, l) {
    const container = _ensureContainer(notif.type.layer, l)
    if (!container) return
    const wrapper = document.createElement('div')
    wrapper.className = `hs-notif hs-notif-${notif.typeName}`
    wrapper.dataset.notifId = notif.id
    wrapper.setAttribute('role', notif.data?.level === 'error' ? 'alert' : 'status')
    notif.el = wrapper
    _renderInto(notif)
    container.appendChild(wrapper)
    l.current.push(notif)
    // clickToDismiss: any click anywhere on the wrapper dismisses. Inner
    // action buttons stopPropagation in _renderInto so they still fire
    // their own onClick before the dismiss bubbles. Without this, toast
    // pointer-events:none made the wrapper unclickable — see registerType
    // 'toast' below.
    if (notif.type.clickToDismiss) {
      wrapper.addEventListener('click', () => dismiss(notif.id))
    }
    // Right-click dismiss — global UX convention: every popup/indicator
    // accepts right-click to clear without firing any action.
    wrapper.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation()
      dismiss(notif.id)
    })
    try { notif.type.onMount?.(notif.data, () => dismiss(notif.id), wrapper) } catch (_) {}
    if (notif.type.timeout) {
      // Pause-on-hover. Errors are easy to miss if they vanish mid-read.
      let remaining = notif.type.timeout
      let startedAt = Date.now()
      notif._timer = setTimeout(() => dismiss(notif.id), remaining)
      wrapper.addEventListener('mouseenter', () => {
        if (notif._timer) {
          clearTimeout(notif._timer); notif._timer = null
          remaining = Math.max(0, remaining - (Date.now() - startedAt))
        }
      })
      wrapper.addEventListener('mouseleave', () => {
        if (!notif._timer && remaining > 0) {
          startedAt = Date.now()
          notif._timer = setTimeout(() => dismiss(notif.id), remaining)
        }
      })
    }
  }

  function _renderInto(notif) {
    const wrapper = notif.el
    if (!wrapper) return
    wrapper.textContent = ''
    const dismissFn = () => dismiss(notif.id)
    let body
    try { body = notif.type.render({ data: notif.data, dismiss: dismissFn }) }
    catch (e) { console.warn('[notifs] render threw for', notif.typeName, e); body = '' }
    // Always render a body wrapper. If render returned nothing usable, fall
    // back to a placeholder so a notif can never be a blank rectangle.
    const bodyEl = document.createElement('span')
    bodyEl.className = 'hs-notif-body'
    if (typeof body === 'string' && body.length > 0) {
      bodyEl.textContent = body
    } else if (body instanceof Node) {
      bodyEl.appendChild(body)
    } else {
      bodyEl.textContent = `[${notif.typeName}]`
      bodyEl.classList.add('hs-notif-body-fallback')
    }
    wrapper.appendChild(bodyEl)
    if (notif.type.actions) {
      const actionsEl = document.createElement('span')
      actionsEl.className = 'hs-notif-actions'
      for (const [kind, def] of Object.entries(notif.type.actions)) {
        if (!def) continue
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = `hs-notif-action hs-notif-action-${kind}`
        btn.textContent = def.label || kind
        if (def.title) btn.title = def.title
        btn.addEventListener('click', (e) => {
          e.stopPropagation(); e.preventDefault()
          let result
          try { result = def.onClick?.(notif.data, dismissFn) } catch (_) {}
          if (kind === 'dismiss' || result === true) dismissFn()
        })
        actionsEl.appendChild(btn)
      }
      wrapper.appendChild(actionsEl)
    }
  }

  function _ensureContainer(name, l) {
    if (l._container && document.body.contains(l._container)) return l._container
    let el = document.getElementById(`hs-notif-layer-${name}`)
    if (!el) {
      el = document.createElement('div')
      el.id = `hs-notif-layer-${name}`
      el.className = `hs-notif-layer hs-notif-layer-${name}`
      document.body.appendChild(el)
    }
    l._container = el
    return el
  }

  // Recompute every layer's geometry. Called from main.js's _updateMcLayout.
  // ctx: { overlayElement, inputBarElement, tabBarElement, containerElement, tabPosition }
  function updateLayout(ctx) {
    const root = document.documentElement
    for (const [name, l] of layers) {
      _ensureContainer(name, l)
      let geom = null
      try { geom = l.def.geometry?.(ctx || {}) } catch (_) {}
      if (geom) {
        for (const [k, v] of Object.entries(geom)) {
          const cssName = `--hs-layer-${name}-${k}`
          if (v == null) root.style.removeProperty(cssName)
          else root.style.setProperty(cssName, typeof v === 'number' ? v + 'px' : v)
        }
      }
    }
  }

  // === STANDARD LAYERS ===

  // Toast stack — bottom-right corner, max 3 visible at once.
  registerLayer('toast-stack', {
    stack: 'queue',
    maxVisible: 3,
    geometry: () => ({ bottom: 70, right: 20 }),
  })

  // Chat-docked-bottom — full-width band above the inputbar (and tabbar in
  // bottom-tabs mode). Spans the chat content area horizontally; right edge
  // ends at the vertical tab strip's left edge when tabs are left/right.
  // Used by twitch-resub-share, twitch-watchstreak-share, sub-anniversary,
  // viewer-milestone callouts. Stacks vertically (newer on top) so multiple
  // celebration opportunities can coexist — user picks which to share first.
  registerLayer('chat-docked-bottom', {
    stack: 'queue',
    maxVisible: 3,
    geometry: ({ overlayElement, inputBarElement, tabBarElement, tabPosition }) => {
      if (!overlayElement && !inputBarElement) return null
      const ibVisible = inputBarElement && !inputBarElement.classList.contains('hs-hidden')
      const tbVisible = tabBarElement && !tabBarElement.classList.contains('hs-hidden')
      const ibRect = ibVisible ? inputBarElement.getBoundingClientRect() : null
      const tbRect = tbVisible ? tabBarElement.getBoundingClientRect() : null
      const ovRect = overlayElement ? overlayElement.getBoundingClientRect() : null
      let bottomY = null
      if (ibRect && ibRect.height > 0) bottomY = ibRect.top
      if (tabPosition === 'bottom' && tbRect && tbRect.height > 0) {
        bottomY = bottomY !== null ? Math.min(bottomY, tbRect.top) : tbRect.top
      }
      const horRect = (ovRect && ovRect.width > 0) ? ovRect : ibRect
      if (!horRect || bottomY === null) return null
      return {
        bottom: window.innerHeight - bottomY,
        left: horRect.left,
        right: window.innerWidth - (horRect.left + horRect.width),
      }
    },
  })

  // Chat-docked-top — top of overlay (or below tabbar in top-tabs mode).
  // For raid alerts, "stream went live" inline notifications, etc.
  registerLayer('chat-docked-top', {
    stack: 'queue',
    maxVisible: 1,
    geometry: ({ overlayElement, tabBarElement, tabPosition }) => {
      if (!overlayElement) return null
      const ovRect = overlayElement.getBoundingClientRect()
      const tbVisible = tabBarElement && !tabBarElement.classList.contains('hs-hidden')
      const tbRect = tbVisible ? tabBarElement.getBoundingClientRect() : null
      const topY = (tabPosition === 'top' && tbRect && tbRect.height > 0)
        ? tbRect.bottom : ovRect.top
      return {
        top: topY,
        left: ovRect.left,
        right: window.innerWidth - (ovRect.left + ovRect.width),
      }
    },
  })

  // === STANDARD TYPES ===

  // Toast — short status message, color-coded by level. Click anywhere on
  // the toast to dismiss (clickToDismiss → _mount wires the click handler).
  // 4s default (was 1.5s — too fast to read for errors). Empty/whitespace
  // text falls back to "[level]" so an error toast can never render as an
  // empty black-box-with-red-outline (the old bug where any showToast call
  // with an undefined/missing error code produced an unclickable square).
  registerType('toast', {
    layer: 'toast-stack',
    timeout: 4000,
    clickToDismiss: true,
    render: ({ data }) => {
      const level = data.level || 'info'
      const text = (typeof data.text === 'string' ? data.text : '').trim() || `[${level}]`
      const el = document.createElement('span')
      el.textContent = text
      el.className = `hs-notif-toast-text hs-notif-toast-${level}`
      return el
    },
  })

  // Twitch resub-share — user's own resub callout. Surfaces above input,
  // shows month count + Share button (clicks the native Twitch share so the
  // existing _enterResubShareMode flow runs) and X to dismiss. Native DOM is
  // hidden via CSS; we render our own controlled version.
  registerType('twitch-resub-share', {
    layer: 'chat-docked-bottom',
    dedupeKey: ({ months, channel }) => `resub:${channel}:${months}`,
    render: ({ data }) => {
      const months = data.months | 0
      const el = document.createElement('span')
      el.className = 'hs-notif-resub-body'
      const icon = document.createElement('span')
      icon.className = 'hs-notif-resub-icon'
      icon.textContent = '★'
      // Text broken into parts so container queries can progressively shorten:
      //   wide   "Celebrating 104 months as a subscriber"
      //   < 280  "104 months as a subscriber"
      //   < 220  "104 months"
      //   < 140  "104mo"
      // Button always remains visible — message gives up space, not the action.
      const text = document.createElement('span')
      text.className = 'hs-notif-resub-text'
      const parts = [
        ['hs-rt-prefix', 'Celebrating '],
        ['hs-rt-num',    String(months)],
        ['hs-rt-mo',     'mo'],
        ['hs-rt-months', ' months'],
        ['hs-rt-suffix', ' as a subscriber'],
      ]
      for (const [cls, t] of parts) {
        const s = document.createElement('span')
        s.className = cls
        s.textContent = t
        text.appendChild(s)
      }
      el.appendChild(icon)
      el.appendChild(text)
      return el
    },
    actions: {
      primary: {
        label: 'Share',
        onClick: (data) => {
          // Bypass the native Twitch share button — its native onClick auto-
          // sends a default "<user> is celebrating Nmo as a subscriber!"
          // message to chat, robbing the user of the custom-message window.
          // Call _enterResubShareMode directly via the exposed API instead.
          try {
            window.__hsResubShare?.enter?.(data.months, data.user, data.channel)
          } catch (_) {}
          return false  // resub-share mode controls dismissal
        },
      },
      dismiss: { label: '✕' },
    },
  })

  // Twitch watch-streak share — user's own daily watch-streak callout.
  // Mirrors resub-share UI but uses 🔥 + orange tone. Once-per-day rate-limit
  // is enforced upstream in main.js's surface() via localStorage.
  registerType('twitch-watchstreak-share', {
    layer: 'chat-docked-bottom',
    dedupeKey: ({ streakCount, channel }) => `watchstreak:${channel}:${streakCount}`,
    render: ({ data }) => {
      const n = data.streakCount | 0
      const el = document.createElement('span')
      el.className = 'hs-notif-watchstreak-body'
      const icon = document.createElement('span')
      icon.className = 'hs-notif-watchstreak-icon'
      icon.textContent = '🔥'
      const text = document.createElement('span')
      text.className = 'hs-notif-watchstreak-text'
      const parts = [
        ['hs-wt-prefix', 'On a '],
        ['hs-wt-num',    String(n)],
        ['hs-wt-stream', ' stream'],
        ['hs-wt-suffix', ' watch streak'],
      ]
      for (const [cls, t] of parts) {
        const s = document.createElement('span')
        s.className = cls
        s.textContent = t
        text.appendChild(s)
      }
      el.appendChild(icon)
      el.appendChild(text)
      return el
    },
    actions: {
      primary: {
        label: 'Share',
        onClick: (data) => {
          try {
            window.__hsWatchstreakShare?.enter?.(data.streakCount, data.user, data.channel)
          } catch (_) {}
          return false
        },
      },
      dismiss: { label: '✕' },
    },
  })

  // Twitch raid (worked example — not yet emitted; ready when needed).
  registerType('twitch-raid', {
    layer: 'chat-docked-top',
    dedupeKey: ({ raidFrom }) => `raid:${raidFrom}`,
    timeout: 30000,
    render: ({ data }) => {
      const el = document.createElement('span')
      el.textContent = `${data.raidFrom} raided with ${data.viewers || 0}!`
      return el
    },
    actions: { dismiss: { label: '✕' } },
  })

  // Server-driven "please update" prompt — fires when the version-floor in
  // /api/extension/health is above current manifest version. dedupeKey keeps
  // it to one prompt per (current, min) pair so re-fetching health doesn't
  // re-stack toasts. No auto-timeout: it stays until dismissed or update.
  registerType('hs-update-required', {
    layer: 'toast-stack',
    dedupeKey: ({ current, min }) => `upd:${current}:${min}`,
    render: ({ data }) => {
      const el = document.createElement('span')
      el.className = 'hs-notif-toast-text hs-notif-toast-warn'
      const body = data.msg
        ? String(data.msg).slice(0, 200)
        : `Update available — running ${data.current}, latest is ${data.min}+`
      el.textContent = body
      return el
    },
    actions: { dismiss: { label: '✕' } },
  })

  // Server-evaluated mention rule match — heatsync.org evaluated the user's
  // saved mention rules on the server and found a match in a channel message.
  // Shows as a toast; tap/click to dismiss. Deduplicated per channel+snippet
  // to avoid repeat fires from the same message being re-evaluated.
  registerType('server-mention-rule', {
    layer: 'toast-stack',
    timeout: 8000,
    dedupeKey: ({ channel, snippet }) => `smr:${channel}:${snippet}`,
    render: ({ data }) => {
      const el = document.createElement('span')
      const who = data.username ? `${data.username}: ` : ''
      const ch = data.channel ? `[${data.channel}] ` : ''
      el.textContent = `${ch}${who}${data.snippet}`
      el.className = 'hs-notif-toast-text hs-notif-toast-mention'
      return el
    },
    actions: { dismiss: { label: '✕' } },
  })

  return {
    registerLayer, registerType, emit, dismiss, dismissByKey, updateLayout,
    _layers: layers, _types: types,
  }
})()

// Expose for devtools / cross-script debug. Same singleton; mutating it from
// the page will affect all multichat notifs, so use only for inspection.
try { window.HsNotifs = HsNotifs } catch (_) {}
