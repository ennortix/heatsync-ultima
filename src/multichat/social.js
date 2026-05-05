// Social - feed, notifications, activity, heatsync API
let _autoYtVideoId = null  // videoId for this tab's __live_yt_auto__ subscription (cross-tab filter)

// YT POLL SMOOTHING: server polls YouTube every ~5s and dispatches the whole
// batch back-to-back over WS. Without smoothing, 10 msgs land in one rAF
// frame and the chat flashes them all at once. We drip them per-channel using
// the REAL inter-message timestamp deltas (msg.time from YouTube), so two
// msgs posted 1.8s apart show up 1.8s apart visually — natural human pacing.
// Floor and cap keep things perceptible without dragging.
const YT_PACE_MIN_MS = 60      // floor — never emit faster than this
const YT_PACE_MAX_MS = 400     // cap — never delay a single msg longer than this
const YT_PACE_BURST_MAX = 1500 // total projected backlog cap; overflow flushes synchronously
const _ytPaceQueue = new Map()  // channelId → ytMsg[] (in real-time order)
const _ytPaceTimer = new Map()  // channelId → timer handle
const _ytPaceLastEmit = new Map()  // channelId → { time: ms, msgTime: real msg.time }

// Heat tier display — big scaling numbers + color glow + row effects, no emoji
// Matches website colors.js: #444 → #888 → #cc6600 → #ff8700 → #ffaa33 → #fff
function formatHeat(heat) {
  if (heat >= 1000) {
    const k = heat / 1000
    const f = k.toFixed(1)
    return f.endsWith('.0') ? f.slice(0, -2) + 'k' : f + 'k'
  }
  return String(heat)
}

function getHeatNumberStyle(heat, isReply) {
  let fontSize, color, textShadow, animation
  if (isReply) {
    if (heat > 500) fontSize = 20
    else if (heat > 100) fontSize = 18
    else if (heat > 50) fontSize = 16
    else if (heat > 10) fontSize = 14
    else fontSize = 12
  } else {
    if (heat > 500) fontSize = 32
    else if (heat > 100) fontSize = 26
    else if (heat > 50) fontSize = 22
    else if (heat > 10) fontSize = 18
    else fontSize = 14
  }
  if (heat > 500) {
    color = '#fff'
    textShadow = '0 0 6px rgba(255,255,255,1),0 0 15px rgba(255,200,100,1),0 0 30px rgba(255,135,0,0.9),0 0 50px rgba(255,80,0,0.6)'
    animation = 'hs-heat-breathe 2s ease-in-out infinite'
  } else if (heat > 100) {
    color = '#ffaa33'
    textShadow = '0 0 6px rgba(255,170,50,0.9),0 0 16px rgba(255,135,0,0.6),0 0 30px rgba(255,80,0,0.3)'
  } else if (heat > 50) {
    color = '#ff8700'
    textShadow = '0 0 6px rgba(255,135,0,0.7),0 0 14px rgba(255,135,0,0.3)'
  } else if (heat > 10) {
    color = heat > 30 ? '#cc6600' : '#888'
    textShadow = heat > 30 ? '0 0 4px rgba(204,102,0,0.3)' : undefined
  } else {
    color = '#444'
    textShadow = undefined
  }
  let style = `font-size:${fontSize}px;color:${color};font-weight:900;line-height:1;`
  if (textShadow) style += `text-shadow:${textShadow};`
  if (animation) style += `animation:${animation};`
  return style
}

function getHeatDisplay(heat) {
  if (!heat || heat <= 0) return null
  let border = '#444', borderWidth = 2, bg = ''
  if (heat >= 500) {
    border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'
  } else if (heat >= 100) {
    border = '#ffaa33'; borderWidth = 3
    bg = 'rgba(50,15,0,0.10)'
  } else if (heat >= 25) {
    border = '#ff8700'; borderWidth = 3
    bg = 'rgba(40,12,0,0.07)'
  } else if (heat >= 10) {
    border = '#ff8700'; borderWidth = 2
  } else {
    border = '#444'; borderWidth = 2
  }
  const suffix = heat >= 10 ? '°' : ''
  const breathe = heat >= 500
  return { suffix, border, borderWidth, bg, breathe }
}

// Feed & notifications state
let feedMessages = [];
let feedLoaded = false;
let feedLoading = false;
let feedPage = 1;
let feedHasMore = true;
let feedLastFetch = 0; // Timestamp of last feed fetch
const FEED_STALE_MS = 120000; // 2 minutes

// Feed scroll state — handler ref for teardown only, infinite-scroll trigger
let _feedVirtualScrollHandler = null

// Engagement state — optimistic local cache
const feedLiked = new Set()     // base36_ids the user has liked
const feedBookmarked = new Set() // base36_ids the user has bookmarked
const feedReactionsCache = new Map() // base36_id → [{ emote_id, emote_url, emote_name, count, user_reacted }]
// Cap to prevent long-session unbounded growth; evict oldest insert when full.
const FEED_ENGAGE_CAP = 2000
function _capFeedEngage() {
  while (feedLiked.size > FEED_ENGAGE_CAP) feedLiked.delete(feedLiked.values().next().value)
  while (feedBookmarked.size > FEED_ENGAGE_CAP) feedBookmarked.delete(feedBookmarked.values().next().value)
  while (feedReactionsCache.size > FEED_ENGAGE_CAP) feedReactionsCache.delete(feedReactionsCache.keys().next().value)
}
// Stream events injected inline into per-channel buffers (no dedicated tab)
const activityEvents = [];
const ACTIVITY_EVENTS_MAX = 500;
function pushActivityEvent(evt) {
  if (activityEvents.some(m => m.text === evt.text)) return
  activityEvents.push(evt)
  if (activityEvents.length > ACTIVITY_EVENTS_MAX) activityEvents.splice(0, activityEvents.length - ACTIVITY_EVENTS_MAX)
}
let activeThread = null // { id, op, replies[] } — when set, feed shows thread view
let replyState = null; // { msgId, user, channel } when replying to a message
let hsAuthToken = null; // Heatsync auth state (loaded from storage)
let hsCurrentUsername = null; // Heatsync username (loaded from storage user_info)
let hsCurrentUserId = null; // Heatsync numeric user id (for reaction matching)

// Load + watch heatsync username for own-post detection (edit/delete UI)
async function loadHsUsername() {
  try {
    const data = await api.storage.local.get('user_info')
    const ui = data?.user_info
    hsCurrentUsername = ui?.username?.toLowerCase() || null
    hsCurrentUserId = ui?.id ? String(ui.id) : null
    // Cross-platform mention aliases: any name across Twitch/Kick/YT counts as
    // a mention of the user, even if the chat is on a different platform.
    mentionAliases = new Set()
    if (ui?.kick_username) mentionAliases.add(ui.kick_username.toLowerCase())
    if (ui?.youtube_username) mentionAliases.add(ui.youtube_username.toLowerCase())
    if (ui?.twitch_username) mentionAliases.add(ui.twitch_username.toLowerCase())
  } catch (e) { hsCurrentUsername = null; hsCurrentUserId = null }
}
function isOwnFeedPost(m) {
  return !!(hsCurrentUsername && m?.username && m.username.toLowerCase() === hsCurrentUsername)
}

const EDIT_WINDOW_MS = 10 * 60 * 1000 // 10 min — server enforces

// Inline edit UI for own feed posts
function showFeedEditUI(div, msg) {
  if (div.querySelector('.hs-feed-edit-form')) return
  const body = div.querySelector('.hs-feed-body')
  if (!body) return
  const original = msg.content || ''
  const form = document.createElement('div')
  form.className = 'hs-feed-edit-form'
  form.style.cssText = 'display:flex;gap:4px;align-items:flex-start;margin-top:4px;'
  const ta = document.createElement('textarea')
  ta.value = original
  ta.maxLength = 500
  ta.rows = 2
  ta.style.cssText = 'flex:1;background:#000;color:#fff;border:1px solid #808080;padding:4px;font-family:inherit;font-size:13px;resize:vertical;'
  const saveBtn = document.createElement('button')
  saveBtn.textContent = 'save'
  saveBtn.style.cssText = 'background:#ff8700;color:#000;border:none;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer;'
  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'cancel'
  cancelBtn.style.cssText = 'background:#000;color:#fff;border:1px solid #808080;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer;'
  const errEl = document.createElement('div')
  errEl.style.cssText = 'font-size:11px;color:#ff4444;margin-top:2px;'
  form.append(ta, saveBtn, cancelBtn)
  body.style.display = 'none'
  body.parentNode.insertBefore(form, body.nextSibling)
  body.parentNode.insertBefore(errEl, form.nextSibling)
  ta.focus()
  ta.select()

  const close = () => {
    body.style.display = ''
    form.remove()
    errEl.remove()
  }
  cancelBtn.addEventListener('click', close)
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveBtn.click() }
  })
  saveBtn.addEventListener('click', async () => {
    const newContent = ta.value.trim()
    if (!newContent) { errEl.textContent = 'content cannot be empty'; return }
    if (newContent === original) { close(); return }
    saveBtn.disabled = true
    saveBtn.textContent = 'saving...'
    errEl.textContent = ''
    const resp = await apiFetch(`/api/messages/${encodeURIComponent(msg.base36_id)}`, {
      method: 'PATCH',
      body: { content: newContent }
    })
    if (resp?.ok && resp.data?.success) {
      msg.content = resp.data.message?.content || newContent
      msg.edited_at = resp.data.message?.edited_at
      msg.edit_count = resp.data.message?.edit_count
      close()
      // Re-render entire feed to pick up sanitized content + emote refs
      if (typeof renderFeed === 'function') renderFeed()
    } else {
      errEl.textContent = resp?.data?.error || resp?.error || 'edit failed'
      saveBtn.disabled = false
      saveBtn.textContent = 'save'
    }
  })
}

async function deleteFeedPost(msg) {
  if (!confirm('delete this post?')) return
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msg.base36_id)}`, {
    method: 'DELETE'
  })
  if (resp?.ok) {
    const div = document.querySelector(`.hs-feed-msg[data-msg-id="${CSS.escape(msg.base36_id)}"]`)
    if (div) div.remove()
    const idx = feedMessages.findIndex(m => m.base36_id === msg.base36_id)
    if (idx >= 0) feedMessages.splice(idx, 1)
  }
}

function showFeedPostContextMenu(e, div, msg) {
  e.preventDefault()
  e.stopPropagation()
  document.getElementById('hs-mc-ctx-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'hs-mc-ctx-menu'
  menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #808080;border-radius:0;padding:4px 0;min-width:120px;font-size:12px;font-family:inherit;'

  const createdAt = new Date(msg.created_at).getTime()
  const elapsed = Date.now() - createdAt
  const remaining = EDIT_WINDOW_MS - elapsed
  const canEdit = remaining > 0

  const mkItem = (label, color, fn, disabled) => {
    const item = document.createElement('div')
    item.textContent = label
    item.style.cssText = `padding:6px 12px;cursor:${disabled ? 'not-allowed' : 'pointer'};color:${color};opacity:${disabled ? 0.5 : 1};`
    if (!disabled) {
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)')
      item.addEventListener('mouseleave', () => item.style.background = '')
      item.addEventListener('click', () => { menu.remove(); fn() })
    }
    menu.appendChild(item)
  }

  if (canEdit) {
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    mkItem(`edit (${mins}:${String(secs).padStart(2, '0')} left)`, '#fff', () => showFeedEditUI(div, msg))
  } else {
    mkItem('edit (window expired)', '#fff', () => {}, true)
  }
  mkItem('delete', '#ff4444', () => deleteFeedPost(msg))

  document.body.appendChild(menu)
  const mw = menu.offsetWidth, mh = menu.offsetHeight
  menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px'
  menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px'
  const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss) } }
  setTimeout(() => document.addEventListener('click', dismiss, { signal: mcSignal }), 0)
}

// ============================================
// SOCIAL TABS (FEED & NOTIFICATIONS)
// ============================================

// API proxy — routes through background.js to bypass CORS + attach auth
async function apiFetch(path, opts = {}) {
  try {
    const resp = await api.runtime.sendMessage({
      type: 'api_fetch',
      path,
      method: opts.method || 'GET',
      auth: opts.auth !== false,
      body: opts.body
    })
    return resp || { ok: false, error: 'no response' }
  } catch (e) {
    return { ok: false, error: 'context invalidated' }
  }
}

// Load heatsync auth state from storage
async function loadHsAuth() {
  try {
    const data = await api.storage.local.get(['auth_token_encrypted', 'auth_token']);
    hsAuthToken = !!(data.auth_token_encrypted || data.auth_token);
    log('Heatsync auth:', hsAuthToken ? 'logged in' : 'anonymous');
  } catch (e) {
    hsAuthToken = false;
  }
  loadHsUsername()

  // Watch for auth changes (login/logout on heatsync.org)
  if (!window._hsMcAuthWatcher) {
    window._hsMcAuthWatcher = true;
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.user_info) {
        const ui = changes.user_info.newValue
        hsCurrentUsername = ui?.username?.toLowerCase() || null
        hsCurrentUserId = ui?.id ? String(ui.id) : null
        mentionAliases = new Set()
        if (ui?.kick_username) mentionAliases.add(ui.kick_username.toLowerCase())
        if (ui?.youtube_username) mentionAliases.add(ui.youtube_username.toLowerCase())
        if (ui?.twitch_username) mentionAliases.add(ui.twitch_username.toLowerCase())
      }
      if (changes.auth_token_encrypted || changes.auth_token) {
        const wasAuthed = hsAuthToken;
        hsAuthToken = !!(
          changes.auth_token_encrypted?.newValue ||
          changes.auth_token?.newValue
        );
        if (wasAuthed !== hsAuthToken) {
          log('Auth state changed:', hsAuthToken ? 'logged in' : 'logged out');
          // On login, replay any whispers that failed with auth errors so the
          // user doesn't have to manually retry each one.
          if (!wasAuthed && hsAuthToken && typeof retryAuthFailedWhispers === 'function') {
            retryAuthFailedWhispers();
          }
          // Reset feed/discover/pinned data on auth change so the next
          // tab open re-fetches with new auth.
          feedLoaded = false;
          feedMessages = [];
          discoverLoaded = false;
          discoverLoading = false;
          discoverTags = [];
          discoverProfiles = [];
          pinnedLoaded = false;
          pinnedLoading = false;
          pinnedMessages = [];
          feedLiked.clear();
          feedBookmarked.clear();
          feedReactionsCache.clear();
          if (currentTab === 'feed') {
            renderMessages(currentTab);
          }
        }
      }
    });
  }
}

// Replay (backfill) handler — push to buffer, coalesce render across the
// burst with a microtask debounce. fairMerge sorts by msg.time so each
// replay msg lands at its real chronological position; we just need ONE
// final render after the burst settles. Tab indicator only updates if user
// isn't viewing this tab.
const _replayRenderPending = new Set()  // tabIds awaiting coalesced render
function ingestReplayYtMsg(targetChannelId, ytMsg) {
  if (!channelYtMessages.has(targetChannelId)) channelYtMessages.set(targetChannelId, [])
  const buf = channelYtMessages.get(targetChannelId)
  // Dedup against existing buffer (refresh resends backfill we may already
  // have). Same key as isYtDuplicate — user+text+time-bucketed.
  const dupKey = `${ytMsg.user}|${(ytMsg.text || '').slice(0, 50)}|${Math.floor((ytMsg.time || 0) / 1000)}`
  if (buf.some(m => `${m.user}|${(m.text || '').slice(0, 50)}|${Math.floor((m.time || 0) / 1000)}` === dupKey)) return
  buf.push(ytMsg)
  if (buf.length > MAX_BUFFER + 50) {
    // Sort by time before truncating so we keep the most recent across
    // backfill + live, not just newest-arrived.
    buf.sort((a, b) => (a.time || 0) - (b.time || 0))
    buf.splice(0, buf.length - MAX_BUFFER)
  }
  const tabId = targetChannelId === '__live_yt_auto__' ? 'live' : targetChannelId
  if (currentTab !== tabId) {
    updateTabIndicator(tabId)
    return
  }
  // Coalesce many replay msgs into a single renderMessages call per tab.
  if (_replayRenderPending.has(tabId)) return
  _replayRenderPending.add(tabId)
  queueMicrotask(() => {
    _replayRenderPending.delete(tabId)
    if (currentTab === tabId) renderMessages(tabId)
  })
}

// Buffer-push + visible render for ONE paced (live) YT message. Critical:
// overwrite ytMsg.time = Date.now() AT THE MOMENT OF EMIT (not at WS arrival).
// Without this, every msg in a 5-sec poll batch shares the same arrival ms
// and the full chronological sort lumps them adjacent, then the next twitch
// msg slots in below — visible as a YT clump in the bottom of chat.
// With per-emit Date.now(), each YT msg's time naturally interleaves with
// the live twitch ms-arrivals that happen between pacer drains.
function commitPacedYtMsg(targetChannelId, ytMsg) {
  // Monotonic per-channel commit clock — two msgs draining in the same ms
  // would otherwise share (user, time, text-prefix) and produce identical
  // stableMsgIds, which the render-diff treats as one key and the dup-set
  // dedup throws away the second display. +1 each collision keeps the key
  // unique while still slotting close to real-time in the chrono sort.
  const lastEmit = _ytPaceLastEmit.get(targetChannelId)
  const now = Date.now()
  ytMsg.time = lastEmit?.time && now <= lastEmit.time ? lastEmit.time + 1 : now
  if (!channelYtMessages.has(targetChannelId)) channelYtMessages.set(targetChannelId, [])
  const buf = channelYtMessages.get(targetChannelId)
  buf.push(ytMsg)
  if (buf.length > MAX_BUFFER + 50) buf.splice(0, buf.length - MAX_BUFFER)
  const tabId = targetChannelId === '__live_yt_auto__' ? 'live' : targetChannelId
  if (currentTab === tabId) {
    if (!appendMessage(ytMsg, tabId)) renderMessages(tabId)
  } else {
    updateTabIndicator(tabId)
  }
}

// Compute the visual delay until the next paced msg should emit. Uses the
// real-time delta between THIS msg and the PREVIOUS emitted msg, so two
// msgs posted 1.8s apart on YouTube show up 1.8s apart in the panel.
// Clamped to [MIN, MAX] so a 30s gap doesn't stall the panel and a same-
// millisecond burst still drips perceptibly.
function paceDelayFor(channelId, nextMsg) {
  const last = _ytPaceLastEmit.get(channelId)
  if (!last || !last.msgTime || !nextMsg?.time) return YT_PACE_MIN_MS
  const realDelta = nextMsg.time - last.msgTime
  if (realDelta <= 0) return YT_PACE_MIN_MS
  return Math.max(YT_PACE_MIN_MS, Math.min(YT_PACE_MAX_MS, realDelta))
}

// Drain ONE message from the pace queue, schedule next based on the real
// timestamp delta to the message after that.
function drainYtPaceQueue(targetChannelId) {
  _ytPaceTimer.delete(targetChannelId)
  const q = _ytPaceQueue.get(targetChannelId)
  if (!q || !q.length) return
  const ytMsg = q.shift()
  // Snapshot original YT timestamp BEFORE commit overwrites it. Used as
  // the msgTime delta basis for the next drain so paceDelayFor sees the
  // real chat cadence between consecutive msgs, not the rewritten
  // commit-time Date.now()s.
  const realPostMs = ytMsg.time
  commitPacedYtMsg(targetChannelId, ytMsg)
  _ytPaceLastEmit.set(targetChannelId, { time: Date.now(), msgTime: realPostMs })
  if (q.length > 0) {
    const due = paceDelayFor(targetChannelId, q[0])
    const handle = setTimeout(() => drainYtPaceQueue(targetChannelId), due)
    _ytPaceTimer.set(targetChannelId, handle)
  } else {
    _ytPaceQueue.delete(targetChannelId)
  }
}

// Queue a YT message for paced delivery. Idle channel (queue empty AND
// >MAX_MS since last emit) → commit immediately, no artificial delay on the
// first msg of a quiet stream. Bursts get the real-delta pacing.
// Catastrophic backlogs (>YT_PACE_BURST_MAX projected at MIN cadence) flush
// overflow synchronously so msgs never feel stale.
function enqueueYtForPacing(targetChannelId, ytMsg) {
  const now = Date.now()
  const last = _ytPaceLastEmit.get(targetChannelId)
  const idleSince = last ? (now - last.time) : Infinity
  const queued = _ytPaceQueue.get(targetChannelId)
  // Idle channel + cooldown elapsed → emit immediately.
  if ((!queued || queued.length === 0) && idleSince >= YT_PACE_MAX_MS) {
    const realPostMs = ytMsg.time
    commitPacedYtMsg(targetChannelId, ytMsg)
    _ytPaceLastEmit.set(targetChannelId, { time: now, msgTime: realPostMs })
    return
  }
  // Queue the msg.
  if (!queued) _ytPaceQueue.set(targetChannelId, [])
  const q = _ytPaceQueue.get(targetChannelId)
  q.push(ytMsg)
  // Synchronously flush overflow if min-cadence projection exceeds burst-max.
  const minProjected = q.length * YT_PACE_MIN_MS
  if (minProjected > YT_PACE_BURST_MAX) {
    const keep = Math.ceil(YT_PACE_BURST_MAX / YT_PACE_MIN_MS)
    while (q.length > keep) commitPacedYtMsg(targetChannelId, q.shift())
  }
  // Schedule drainer if not already scheduled.
  if (!_ytPaceTimer.has(targetChannelId)) {
    const due = Math.max(paceDelayFor(targetChannelId, q[0]) - idleSince, 0)
    const handle = setTimeout(() => drainYtPaceQueue(targetChannelId), due)
    _ytPaceTimer.set(targetChannelId, handle)
  }
}

// Listen for social events from background (new messages, notifications)
function listenForSocialEvents() {
  // Guard: only register once (survives SPA reinit via chrome listener persistence)
  if (window._hsMcSocialListener) return;
  window._hsMcSocialListener = true;

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg.type === 'chat_origin_broadcast' && msg.text) {
      // Heatsync.org chat-tile sent a chat — record the origin so the
      // upcoming platform echo gets tagged [H] via peekSentHost. Same
      // 10s dedup window as locally-tracked sends; chrome.storage sync
      // fans this out to other extension tabs automatically.
      try { trackSentMessage(msg.text, 'heatsync') } catch (_) {}
      return
    }
    if (msg.type === 'new-message' && msg.data) {
      if (!feedLoaded) return;
      // Dedup: skip if already in feed
      const id = msg.data.base36_id;
      if (id && feedMessages.some(m => m.base36_id === id)) return;

      if (msg.data.username === 'Anonymous') return
      feedMessages.unshift(msg.data);
      if (feedMessages.length > 150) feedMessages.pop();

      // Real-time thread update: if reply to the active thread, append it
      const replyTo = msg.data.reply_to;
      if (replyTo && activeThread && activeThread.id === replyTo) {
        if (!activeThread.replies.some(r => r.base36_id === id)) {
          activeThread.replies.push(msg.data);
          if (activeThread.op) activeThread.op.reply_count = (activeThread.op.reply_count || 0) + 1;
        }
      }
      // Update OP reply count in feed data
      if (replyTo) {
        const parent = feedMessages.find(m => m.base36_id === replyTo);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
      }

      if (currentTab === 'feed') {
        renderFeed();
      } else {
        updateTabIndicator('feed');
        // Inline notification in chat (routed through toggle system)
        const f = msg.data;
        const t = new Date(f.created_at).getTime();
        if (!isNaN(t)) {
          const notifType = f.is_thread_op ? 'mop' : (f.is_op != null ? !!f.is_op : !f.reply_to) ? 'op' : 're'
          injectInlineNotif(notifType, {
            type: 'feed-post',
            base36_id: f.base36_id,
            feedUser: f.username || f.display_name || 'anon',
            text: f.content || '',
            color: f.user_color || '#fff',
            time: t,
            heat: f.heat || 0,
            reply_to: f.reply_to,
            emote_refs: f.emote_refs,
            is_op: f.is_op,
            is_thread_op: f.is_thread_op
          })
        }
      }
    }
    if (msg.type === 'dm_new' && msg.data) {
      // Server-pushed Twitch whispers must route through handleIncomingWhisper
      // so the dedup key (whisper_id) matches the EventSub path. Using
      // handleIncomingDm here would produce a second timeline entry because
      // its dedup checks data.id (hs db row) != eventsub entry's id (whisper_id).
      if (msg.data.platform === 'twitch') {
        handleIncomingWhisper({
          user: msg.data.from_display_name || msg.data.from_twitch_login || 'unknown',
          userId: msg.data.from_twitch_id,
          text: msg.data.content,
          color: msg.data.from_color || '#fff',
          time: msg.data.created_at ? new Date(msg.data.created_at).getTime() : Date.now(),
          id: msg.data.external_message_id || msg.data.id || '',
        })
      } else {
        handleIncomingDm(msg.data)
      }
    }
    if (msg.type === 'message-edited' && msg.data) {
      const d = msg.data.message_id ? msg.data : msg.data.data
      const id = d?.message_id
      if (!id) return
      // Update feedMessages buffer
      const found = feedMessages.find(m => m.base36_id === id)
      if (found) {
        found.content = d.content
        found.subject = d.subject
        found.edited_at = d.edited_at
        found.edit_count = d.edit_count
      }
      // Update active thread if applicable
      if (activeThread) {
        if (activeThread.op?.base36_id === id) {
          activeThread.op.content = d.content
          activeThread.op.subject = d.subject
          activeThread.op.edited_at = d.edited_at
        }
        const reply = activeThread.replies?.find(r => r.base36_id === id)
        if (reply) {
          reply.content = d.content
          reply.edited_at = d.edited_at
        }
      }
      if (currentTab === 'feed') renderFeed()
    }
    if (msg.type === 'message-deleted' && msg.data) {
      const d = msg.data.message_id ? msg.data : msg.data.data
      const id = d?.message_id
      if (!id) return
      const idx = feedMessages.findIndex(m => m.base36_id === id)
      if (idx >= 0) feedMessages.splice(idx, 1)
      if (activeThread) {
        if (activeThread.op?.base36_id === id) {
          activeThread = null
        } else if (activeThread.replies) {
          const ri = activeThread.replies.findIndex(r => r.base36_id === id)
          if (ri >= 0) activeThread.replies.splice(ri, 1)
        }
      }
      if (currentTab === 'feed') renderFeed()
    }
    if (msg.type === 'youtube_chat_message') {
      const targetChannelId = msg.channelId
      // Touch the YT watchdog clock on every chat message regardless of
      // dedup/filter outcome — even rejected msgs prove the BG-server pipe
      // is alive for this channel, which is the only thing the watchdog
      // cares about.
      try { touchYtChannel(targetChannelId) } catch {}
      // Filter __live_yt_auto__ messages: only accept if videoId matches this tab's subscription
      // (prevents cross-tab leaking — e.g., lofigirl YouTube showing on a Twitch tab)
      if (targetChannelId === '__live_yt_auto__') {
        if (!_autoYtVideoId) return  // no confirmed subscription yet — reject
        if (msg.videoId && msg.videoId !== _autoYtVideoId) return  // wrong video
      }
      // Dedup against message buffer (survives WS reconnects unlike 5s hash)
      if (targetChannelId && isYtDuplicate(msg.user, msg.text, targetChannelId)) return

      // Resolve a Twitch-channel name for emote lookup. YT-relayed messages
      // belong to a streamer who likely also has Twitch/Kick channel emotes
      // (BTTV/FFZ/7TV) configured under their Twitch handle. Without this
      // hint, processEmotes only sees globals + the user's heatsync inventory,
      // missing per-channel emotes for the linked streamer.
      let ytChannelHint = null
      if (targetChannelId && targetChannelId !== '__live_yt_auto__') {
        const linkedCh = config.channels.find(c => typeof c !== 'string' && c.id === targetChannelId)
        if (linkedCh) ytChannelHint = linkedCh.twitch || linkedCh.kick || null
      }

      const ytMsg = {
        user: msg.user,
        text: msg.text,
        color: msg.color || '#ff0000',
        channel: ytChannelHint || 'youtube',
        time: msg.time,
        platform: 'youtube',
        emotes: msg.emotes || [],
        msgType: msg.msgType || 'text',
        amount: msg.amount || '',
        scColor: msg.scColor || '',
        sticker: msg.sticker || null,
        avatar: msg.avatar || undefined,
        badges: msg.badges || undefined,
        systemMsg: msg.systemMsg || undefined,
      }

      // Echo dedup + host-platform badge attribution (matches IRC/kick
      // handlers). Without this, a triple-target send would render TWO
      // copies of the user's own message — the dedup'd twitch/kick echo
      // PLUS the unfiltered YT echo. peekSentHost ensures the badge
      // reflects where the user actually typed FROM.
      if (isSentEcho(ytMsg.text, 'youtube')) return
      if (ytMsg.user?.toLowerCase() === currentUsername?.toLowerCase()) {
        const sentHost = peekSentHost(ytMsg.text)
        if (sentHost) ytMsg.platform = sentHost === 'yt' ? 'youtube' : sentHost
      }

      // Same pipeline as Twitch/Kick handlers: automod → mention → stats
      if (ytMsg.user?.toLowerCase() !== currentUsername?.toLowerCase() && shouldAutomod(ytMsg.text)) return
      const isMent = isMention(ytMsg)
      bumpStreamStats(ytMsg.channel, ytMsg, isMent)
      if (isMent) {
        mentionsBuffer.push(ytMsg)
        if (mentionsBuffer.length > MAX_BUFFER + 50) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER)
        notifyMention(ytMsg)
        if (currentTab === 'mentions') {
          mentionsSeenCount = mentionsBuffer.length
          if (!appendMessage(ytMsg, 'mentions')) renderMessages('mentions')
        } else {
          updateTabIndicator('mentions')
        }
      }

      if (targetChannelId && targetChannelId !== 'global') {
        // Instant-live signal for YT-only tabs (no Twitch handle = no helix
        // truth available, so first chat msg is our best signal). Tabs with
        // a Twitch or Kick handle defer to the live-status poll — otherwise
        // a YT replay/buffered msg would override the offline-Twitch truth.
        if (targetChannelId !== '__live_yt_auto__') {
          try {
            const ch = config.channels.find(c => typeof c !== 'string' && c.id === targetChannelId)
            const isYtOnly = ch && !ch.twitch && !ch.kick && ch.youtube
            if (isYtOnly) {
              const tabEl = document.querySelector(`#hs-mc-tabbar .hs-mc-tab[data-tab="${CSS.escape(targetChannelId)}"]`)
              if (tabEl && tabEl.dataset.live !== 'true') tabEl.dataset.live = 'true'
            }
          } catch {}
        }
        // Backfill replay: bypass per-channel pacing entirely. Each msg has
        // its real YT timestamp, so fairMerge places it at the correct
        // chronological position scattered through the existing twitch/kick
        // history — no "all at once" flash because they're not appearing
        // at the bottom; they slot in at their real-time positions. Pacing
        // here would just delay the correct render.
        if (msg.replay) {
          ingestReplayYtMsg(targetChannelId, ytMsg)
        } else {
          enqueueYtForPacing(targetChannelId, ytMsg)
        }
      } else if (targetChannelId === 'global') {
        // Surface unresolved-routing drops so future regressions don't go silent.
        // Real cause is on background side: videoId→channelId map missed an entry.
        console.warn('[heatsync-ext] yt msg dropped — channelId=global, videoId=', msg.videoId, 'user=', msg.user)
      }
    }
    if (msg.type === 'youtube_msg_deleted') {
      // Mark all rendered messages from this user (for the matching channel)
      // as cleared so they get the dim+strikethrough treatment that Twitch/Kick
      // moderator deletions already get.
      const u = (msg.user || '').toLowerCase()
      if (!u) return
      const msgsEl = document.getElementById('hs-mc-messages')
      if (msgsEl) {
        msgsEl.querySelectorAll('.hs-mc-msg[data-platform="yt"], .hs-mc-msg[data-platform="youtube"]').forEach(div => {
          const a = div.querySelector('.hs-mc-user')
          if (a && a.dataset.username === u) div.classList.add('hs-mc-msg-cleared')
        })
      }
      // Also flag in buffers so re-renders preserve the dim state
      const flagBuf = (buf) => {
        if (!Array.isArray(buf)) return
        for (let i = buf.length - 1; i >= 0; i--) {
          const m = buf[i]
          if (m.platform === 'youtube' && m.user?.toLowerCase() === u) {
            m.cleared = true
            m._renderedHtml = null  // force re-render with cleared class next time
          }
        }
      }
      channelYtMessages.forEach(buf => flagBuf(buf))
      flagBuf(mentionsBuffer)
    }
    if (msg.type === 'youtube_status') {
      const targetChannelId = msg.channelId
      // Connected status touches the watchdog — server confirmed our sub,
      // so the channel is healthy even if no chat messages arrive yet.
      if (msg.status === 'connected') {
        try { touchYtChannel(targetChannelId) } catch {}
      }
      // Track auto-YouTube videoId for cross-tab filtering
      if (targetChannelId === '__live_yt_auto__' && msg.status === 'connected' && msg.videoId) {
        _autoYtVideoId = msg.videoId
        log('Auto YouTube videoId:', msg.videoId)
      }
      if (targetChannelId && targetChannelId !== 'global') {
        // Per-channel YouTube status
        const link = youtubeLinks.get(targetChannelId) || { url: '', videoId: '', channelName: '' }
        if (msg.status === 'connected') {
          link.videoId = msg.videoId || ''
          link.channelName = msg.channelName || ''
          youtubeLinks.set(targetChannelId, link)
          log('YouTube connected for channel', targetChannelId, ':', link.channelName)
        }
        // Reflect status onto the channel tab button so YT-only channels get a
        // live dot and a human-readable label (otherwise YT-only tabs sit dark
        // forever and show the auto-generated yt-<timestamp> id). Twitch/Kick-
        // having tabs defer to the live-status poll for the dot — letting YT
        // override would falsely show a Twitch streamer as live just because
        // their YT mirror is live (or replaying buffered chat).
        if (targetChannelId !== '__live_yt_auto__') {
          const tabEl = document.querySelector(`#hs-mc-tabbar .hs-mc-tab[data-tab="${CSS.escape(targetChannelId)}"]`)
          if (tabEl) {
            const ch = config.channels.find(c => typeof c !== 'string' && c.id === targetChannelId)
            const isYtOnly = ch && !ch.twitch && !ch.kick && ch.youtube
            if (msg.status === 'connected') {
              if (isYtOnly) {
                tabEl.dataset.live = 'true'
                if (link.channelName && tabEl.textContent !== link.channelName) {
                  tabEl.textContent = link.channelName
                }
              }
            } else if (msg.status === 'ended' || msg.status === 'error') {
              if (isYtOnly) tabEl.dataset.live = 'false'
            }
          }
        }
        // Show status in channel tab if viewing it. Dedup on a stable marker so
        // repeated youtube_status events (every WS reconnect, every retry) don't
        // append a fresh notice each time — that's what made the panel flicker:
        // notice appears, real messages push it out via trimChildren cap, next
        // event re-appends, cycle repeats.
        // Show the connect/end notice on the right tab — both per-channel
        // tabs AND the live tab (when this is the auto subscription).
        const isAutoForLive = targetChannelId === '__live_yt_auto__' && currentTab === 'live'
        if (currentTab === targetChannelId || isAutoForLive) {
          const msgsEl = document.getElementById('hs-mc-messages')
          const upsertNotice = (text, color) => {
            if (!msgsEl) return
            // Remove any existing yt-status notice — there should be at most one,
            // showing the latest state.
            for (const el of msgsEl.querySelectorAll('.hs-mc-empty[data-hs-yt-status]')) el.remove()
            const el = document.createElement('div')
            el.className = 'hs-mc-empty'
            el.dataset.hsYtStatus = '1'
            // Tag with the tab id this notice belongs to so renderMessages can
            // drop it on tab switch (otherwise the YT-offline notice from one
            // channel follows the user to other tabs and looks like a bug:
            // "stream is live, why does it say not live?").
            el.dataset.hsYtStatusTab = String(targetChannelId)
            el.textContent = text
            if (color) el.style.color = color
            msgsEl.appendChild(el)
            trimChildren(msgsEl, 150)
          }
          if (msg.status === 'connected') {
            // Drop any stale ended/error notice now that we're live. No
            // "waiting for messages" placeholder — the live-dot on the tab
            // (data-live="true") already signals YT is connected, and the
            // placeholder lingers awkwardly on slow chats. End/error notices
            // below stay because they're actionable.
            if (msgsEl) {
              for (const el of msgsEl.querySelectorAll('.hs-mc-empty[data-hs-yt-status]')) el.remove()
            }
          } else if (msg.status === 'ended' || msg.status === 'error') {
            // Drop noise: rate-limit, "not currently live / chat disabled",
            // AND "could not resolve youtube url" (the expected outcome when
            // a tab's YT URL is auto-guessed from the twitch handle but the
            // streamer doesn't have a matching YT — actionable to nobody).
            const errText = msg.error || ''
            const isNoise = msg.status === 'error' && (
              /too many requests/i.test(errText) ||
              /not currently live/i.test(errText) ||
              /chat is disabled/i.test(errText) ||
              /could not resolve youtube url/i.test(errText) ||
              /invalid url/i.test(errText)
            )
            if (!isNoise) {
              // Always prefix with "youtube:" — without it, error text looks
              // like it's about whatever stream the user is watching, not
              // the YouTube subscription that actually failed.
              upsertNotice(
                msg.status === 'ended' ? 'youtube: stream ended' : `youtube: ${errText || 'connection error'}`,
                '#ff4444'
              )
            }
          }
        }
      }
    }
    if (msg.type === 'message-updated' && msg.data) {
      const uid = msg.data.base36_id;
      const idx = feedMessages.findIndex(m => m.base36_id === uid);
      if (idx >= 0) Object.assign(feedMessages[idx], msg.data);
      if (activeThread && activeThread.op && activeThread.op.base36_id === uid) {
        Object.assign(activeThread.op, msg.data);
      }
    }
  });
}

// ---- FEED ----

async function fetchFeed(append = false) {
  if (feedLoading) return;
  feedLoading = true;
  const page = append ? feedPage + 1 : 1;
  const resp = await apiFetch(`/api/messages?sort=time&limit=30&page=${page}&following=true`, { auth: true });
  feedLoading = false;
  if (!resp.ok) {
    console.error('[heatsync-mc] Feed fetch failed — full resp:', JSON.stringify(resp));
    if (currentTab === 'feed') {
      const msgsEl = document.getElementById('hs-mc-messages');
      if (msgsEl && feedMessages.length === 0) {
        msgsEl.innerHTML = `<div class="hs-mc-empty">${resp.status === 401 ? t('mc_social_failed_feed_auth') : t('mc_social_failed_feed')}</div>`;
      }
    }
    return;
  }
  const msgs = (resp.data?.messages || []).filter(m => m.username !== 'Anonymous')
  if (append) {
    feedMessages.push(...msgs);
    feedPage = page;
  } else {
    feedMessages = msgs;
    feedPage = 1;
  }
  feedHasMore = resp.data?.pagination?.hasMore ?? msgs.length >= 30;
  feedLoaded = true;
  feedLastFetch = Date.now();
  if (currentTab === 'feed') renderFeed();
  // Async: check bookmark state for loaded messages (non-blocking)
  const ids = msgs.map(msg => msg.base36_id).filter(Boolean)
  checkFeedBookmarks(ids)
}

// Onboarding card shown when feed has no posts. Replaces the bare
// "no posts yet" sentinel that produced an immediate uninstall cliff.
// Variants: anonymous (login CTA) vs authed (import-twitch + discover + post).
function _renderFeedEmptyCard() {
  const card = document.createElement('div');
  card.className = 'hs-mc-empty-card';

  const title = document.createElement('div');
  title.className = 'hs-mc-empty-title';
  const sub = document.createElement('div');
  sub.className = 'hs-mc-empty-sub';
  const actions = document.createElement('div');
  actions.className = 'hs-mc-empty-actions';

  if (!hsAuthToken) {
    title.textContent = 'log in to see your home';
    sub.textContent = 'follow people, post, share — alongside multichat';

    const loginBtn = document.createElement('a');
    loginBtn.className = 'hs-mc-empty-btn primary';
    loginBtn.textContent = 'log in at heatsync.org';
    loginBtn.href = 'https://heatsync.org/login';
    loginBtn.target = '_blank';
    loginBtn.rel = 'noopener noreferrer';
    actions.appendChild(loginBtn);

    const note = document.createElement('div');
    note.className = 'hs-mc-empty-note';
    note.textContent = 'no account needed for multichat — pick a channel tab above';

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(actions);
    card.appendChild(note);
    return card;
  }

  title.textContent = 'your home is quiet';
  sub.textContent = 'follow people to see their posts here, or share something yourself';

  const importBtn = document.createElement('button');
  importBtn.className = 'hs-mc-empty-btn primary';
  importBtn.textContent = 'import follows from twitch';
  importBtn.addEventListener('click', async () => {
    if (importBtn.disabled) return;
    importBtn.disabled = true;
    importBtn.textContent = 'syncing…';
    try {
      const r = await apiFetch('/api/sync-twitch-follows', { method: 'POST', auth: true });
      if (r?.ok && r?.data?.success) {
        importBtn.textContent = `synced ${r.data.synced || 0} ✓`;
        try { chrome.runtime.sendMessage({ type: 'refresh_followed_users' }); } catch {}
        setTimeout(() => { feedLoaded = false; if (currentTab === 'feed') renderFeed(); }, 1200);
      } else {
        importBtn.disabled = false;
        importBtn.textContent = (r?.error || r?.data?.error || 'try again').slice(0, 40);
      }
    } catch (e) {
      importBtn.disabled = false;
      importBtn.textContent = 'try again';
    }
  });
  actions.appendChild(importBtn);

  const discoverBtn = document.createElement('button');
  discoverBtn.className = 'hs-mc-empty-btn';
  discoverBtn.textContent = 'discover people →';
  discoverBtn.addEventListener('click', () => {
    const tabBtn = tabBarElement?.querySelector('[data-tab="discover"]');
    if (tabBtn) tabBtn.click();
  });
  actions.appendChild(discoverBtn);

  const postBtn = document.createElement('button');
  postBtn.className = 'hs-mc-empty-btn';
  postBtn.textContent = 'post something';
  postBtn.addEventListener('click', () => {
    if (typeof showInputBar === 'function') showInputBar();
    const inp = document.getElementById('hs-mc-input');
    if (inp) inp.focus();
  });
  actions.appendChild(postBtn);

  card.appendChild(title);
  card.appendChild(sub);
  card.appendChild(actions);
  return card;
}

// Tear down virtual scroll state (called before re-setup or when leaving feed)
function _feedVirtualTeardown(msgsEl) {
  if (_feedVirtualScrollHandler && msgsEl) {
    msgsEl.removeEventListener('scroll', _feedVirtualScrollHandler)
  }
  _feedVirtualScrollHandler = null
}

function renderFeed() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return;
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Update feed tab button text
  const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
  if (feedTabBtn) feedTabBtn.textContent = activeThread ? t('mc_social_back') : t('mc_tab_feed');

  // Thread view — show OP + replies, tear down virtual scroll
  if (activeThread) {
    _feedVirtualTeardown(msgsEl)
    renderThreadView(msgsEl);
    return;
  }

  // Feed list view
  const isStale = feedLoaded && (Date.now() - feedLastFetch > FEED_STALE_MS);
  if ((!feedLoaded || isStale) && !feedLoading) {
    _feedVirtualTeardown(msgsEl)
    msgsEl.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = t('mc_social_loading_feed');
    msgsEl.appendChild(loading);
    fetchFeed();
    return;
  }

  if (feedMessages.length === 0) {
    _feedVirtualTeardown(msgsEl)
    msgsEl.textContent = '';
    msgsEl.appendChild(_renderFeedEmptyCard());
    return;
  }

  // Render all feed posts in natural document flow. Virtualization removed —
  // posts have wildly mixed heights (32px text vs 327px media embeds) and a
  // uniform-height virtual scroller produced massive overlap. If post counts
  // grow large enough to hurt scroll perf, re-add virtualization with proper
  // per-item height measurement (cumulative offsets, not i*h).
  _feedVirtualTeardown(msgsEl)

  const items = feedMessages
  isProgrammaticScroll = true
  msgsEl.textContent = ''
  msgsEl.style.position = ''

  const frag = document.createDocumentFragment()
  let zebraCount = 0
  for (let i = 0; i < items.length; i++) {
    const div = buildFeedMessageDiv(items[i])
    if (zebraEnabled && ++zebraCount % 2 === 0) div.classList.add('hs-mc-zebra')
    frag.appendChild(div)
  }
  msgsEl.appendChild(frag)

  if (feedHasMore) {
    const loader = document.createElement('div')
    loader.className = 'hs-mc-empty hs-feed-loader'
    loader.textContent = t('mc_social_scroll_more')
    msgsEl.appendChild(loader)
  }

  msgsEl.scrollTop = 0
  requestAnimationFrame(() => { isProgrammaticScroll = false; })

  // Reddit (and any future server-resolved embeds): replace pending placeholders
  // with rich cards via heatsync.org/api/embed/resolve. Mirrors website.
  if (typeof resolvePendingFeedEmbeds === 'function') resolvePendingFeedEmbeds(msgsEl)

  // Infinite scroll: trigger fetch near bottom
  let _feedInfiniteTimer = null
  _feedVirtualScrollHandler = () => {
    if (mcSignal?.aborted) return
    if (currentTab !== 'feed' || feedLoading || !feedHasMore) return
    if (_feedInfiniteTimer) return
    _feedInfiniteTimer = cleanup.setTimeout(() => {
      _feedInfiniteTimer = null
      const { scrollTop, scrollHeight, clientHeight } = msgsEl
      if (scrollHeight - scrollTop - clientHeight < 100) fetchFeed(true)
    }, 200)
  }
  msgsEl.addEventListener('scroll', _feedVirtualScrollHandler, { signal: mcSignal, passive: true })
}

// ---- ENGAGEMENT: heat, bookmark, reactions ----

// Batch-check bookmark status for a list of ids after feed loads
async function checkFeedBookmarks(ids) {
  if (!ids.length || !hsAuthToken) return
  try {
    const resp = await apiFetch('/api/bookmarks/check', { method: 'POST', auth: true, body: { message_ids: ids } })
    if (!resp.ok) return
    // Server returns { bookmarked: { id1: true/false, id2: ... } } — an object map.
    const map = resp.data?.bookmarked || resp.bookmarked || {}
    feedBookmarked.clear()
    if (Array.isArray(map)) {
      for (const id of map) feedBookmarked.add(id)
    } else {
      for (const [id, isBookmarked] of Object.entries(map)) {
        if (isBookmarked) feedBookmarked.add(id)
      }
    }
    for (const id of ids) {
      const btn = document.querySelector(`.hs-feed-bm-btn[data-id="${CSS.escape(id)}"]`)
      if (btn) _applyBookmarkState(btn, feedBookmarked.has(id))
    }
  } catch (e) { /* silent */ }
}

function _makeSvg(pathD, filled, size) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size || 13))
  svg.setAttribute('height', String(size || 13))
  svg.setAttribute('class', 'hs-fe-icon')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', pathD)
  path.setAttribute('fill', filled ? '#ff8700' : 'none')
  path.setAttribute('stroke', filled ? '#ff8700' : '#808080')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

function _applyBookmarkState(btn, active) {
  btn.classList.toggle('active', active)
  btn.title = active ? 'remove bookmark' : 'bookmark'
  const path = btn.querySelector('path')
  if (path) {
    path.setAttribute('fill', active ? '#ff8700' : 'none')
    path.setAttribute('stroke', active ? '#ff8700' : '#808080')
  }
}

function _applyHeatState(btn, active, count) {
  btn.classList.toggle('active', active)
  const countEl = btn.querySelector('.hs-fe-count')
  if (countEl) countEl.textContent = count > 0 ? formatHeat(count) + '°' : '+'
}

async function toggleHeat(msgId, btn, m) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first'), 'error'); return }
  // Server-side /api/messages/:id/like is one-way (no unlike route exists).
  if (feedLiked.has(msgId)) return
  const prevHeat = m.heat || 0
  feedLiked.add(msgId)
  m.heat = prevHeat + 1
  _applyHeatState(btn, true, m.heat)
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/like`, { method: 'POST', auth: true })
  if (!resp.ok) {
    feedLiked.delete(msgId)
    m.heat = prevHeat
    _applyHeatState(btn, false, m.heat)
  }
}

async function toggleBookmark(msgId, btn) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first'), 'error'); return }
  const wasBookmarked = feedBookmarked.has(msgId)
  const newState = !wasBookmarked
  if (newState) feedBookmarked.add(msgId); else feedBookmarked.delete(msgId)
  _applyBookmarkState(btn, newState)
  const method = newState ? 'POST' : 'DELETE'
  const resp = await apiFetch(`/api/bookmarks/${encodeURIComponent(msgId)}`, { method, auth: true })
  if (!resp.ok) {
    if (newState) feedBookmarked.delete(msgId); else feedBookmarked.add(msgId)
    if (btn.isConnected) _applyBookmarkState(btn, wasBookmarked)
  }
}

async function loadReactions(msgId, engageEl) {
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/reactions`, { auth: true })
  if (!resp.ok) return
  const raw = resp.data?.reactions || resp.reactions || []
  // Server returns user_ids array; derive user_reacted client-side so chip "active" state works
  const reactions = raw.map(r => ({
    ...r,
    user_reacted: !!(r.user_reacted ?? (hsCurrentUserId && Array.isArray(r.user_ids) && r.user_ids.map(String).includes(hsCurrentUserId)))
  }))
  feedReactionsCache.set(msgId, reactions)
  _capFeedEngage()
  _renderReactionsIntoRow(engageEl, msgId, reactions)
}

function _makeReactChip(r, msgId, engageEl) {
  const chip = document.createElement('button')
  chip.className = 'hs-feed-react-chip' + (r.user_reacted ? ' active' : '')
  chip.title = r.emote_name || ''
  chip.dataset.emoteId = String(r.emote_id)
  const img = document.createElement('img')
  // Validate URL before assigning to img.src
  const rawUrl = r.emote_url || ''
  const validUrl = /^https:\/\//.test(rawUrl) ? rawUrl : ''
  img.src = validUrl
  img.alt = r.emote_name || ''
  img.className = 'hs-feed-react-img'
  const cnt = document.createElement('span')
  cnt.className = 'hs-fe-count'
  cnt.textContent = String(r.count)
  chip.appendChild(img)
  chip.appendChild(cnt)
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const row = chip.closest('.hs-feed-react-row')
    handleReactionChip(msgId, r, chip, row, engageEl)
  })
  return chip
}

function _renderReactionsIntoRow(engageEl, msgId, reactions) {
  let row = engageEl.querySelector('.hs-feed-react-row')
  if (!row) return
  // Remove old chips (keep the "+" add button at end)
  const addBtn = row.querySelector('.hs-feed-react-add')
  row.textContent = ''
  for (const r of reactions) row.appendChild(_makeReactChip(r, msgId, engageEl))
  if (addBtn) row.appendChild(addBtn)
}

async function handleReactionChip(msgId, reaction, chip, row, engageEl) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first'), 'error'); return }
  // Snapshot pre-mutation values so rollback can restore exactly, no off-by-one drift
  const prevReacted = reaction.user_reacted
  const prevCount = reaction.count
  const wasReacted = prevReacted
  reaction.user_reacted = !wasReacted
  reaction.count = Math.max(0, (prevCount || 0) + (wasReacted ? -1 : 1))
  chip.classList.toggle('active', reaction.user_reacted)
  const countEl = chip.querySelector('.hs-fe-count')
  if (countEl) countEl.textContent = String(reaction.count)
  if (reaction.count <= 0) chip.remove()
  const method = wasReacted ? 'DELETE' : 'POST'
  const path = wasReacted
    ? `/api/messages/${encodeURIComponent(msgId)}/react/${encodeURIComponent(reaction.emote_id)}`
    : `/api/messages/${encodeURIComponent(msgId)}/react`
  const body = wasReacted ? undefined : { emote_id: reaction.emote_id }
  const resp = await apiFetch(path, { method, auth: true, body })
  if (!resp.ok) {
    reaction.user_reacted = prevReacted
    reaction.count = prevCount
    _renderReactionsIntoRow(engageEl, msgId, feedReactionsCache.get(msgId) || [])
  }
}

function openReactionPicker(e, msgId, engageEl) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first'), 'error'); return }
  document.getElementById('hs-mc-react-picker')?.remove()
  const emotes = []
  if (typeof emoteCache !== 'undefined') {
    for (const [name, data] of emoteCache) {
      if (data.url && data.source === 'heatsync') emotes.push({ name, url: data.url, id: data.id || name })
    }
  }
  if (!emotes.length) { showToast('no emotes available', 'error'); return }

  const picker = document.createElement('div')
  picker.id = 'hs-mc-react-picker'
  picker.className = 'hs-mc-react-picker'

  const searchEl = document.createElement('input')
  searchEl.type = 'text'
  searchEl.className = 'hs-mc-react-search'
  searchEl.placeholder = 'search emotes'
  const grid = document.createElement('div')
  grid.className = 'hs-mc-react-grid'
  picker.appendChild(searchEl)
  picker.appendChild(grid)

  function fillGrid(filter) {
    grid.textContent = ''
    const q = filter.toLowerCase()
    const shown = q ? emotes.filter(em => em.name.toLowerCase().includes(q)).slice(0, 40) : emotes.slice(0, 40)
    for (const em of shown) {
      const btn = document.createElement('button')
      btn.className = 'hs-mc-react-emote'
      btn.title = em.name
      const img = document.createElement('img')
      img.src = em.url
      img.alt = em.name
      img.loading = 'lazy'
      btn.appendChild(img)
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation()
        picker.remove()
        if (!hsAuthToken) return
        const cached = feedReactionsCache.get(msgId) || []
        const existing = cached.find(r => String(r.emote_id) === String(em.id))
        if (existing) {
          const chip = engageEl.querySelector(`.hs-feed-react-chip[data-emote-id="${CSS.escape(String(em.id))}"]`)
          const row = engageEl.querySelector('.hs-feed-react-row')
          if (chip && row) handleReactionChip(msgId, existing, chip, row, engageEl)
          return
        }
        const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/react`, {
          method: 'POST', auth: true, body: { emote_id: em.id }
        })
        if (resp.ok) await loadReactions(msgId, engageEl)
      })
      grid.appendChild(btn)
    }
  }
  fillGrid('')
  searchEl.addEventListener('input', () => fillGrid(searchEl.value))

  document.body.appendChild(picker)
  const rect = e.target.getBoundingClientRect()
  const pw = picker.offsetWidth || 200
  const ph = picker.offsetHeight || 220
  picker.style.left = Math.min(rect.left, window.innerWidth - pw - 4) + 'px'
  picker.style.top = Math.max(rect.top - ph - 4, 4) + 'px'

  setTimeout(() => {
    const dismiss = (ev) => {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', dismiss) }
    }
    document.addEventListener('click', dismiss, { signal: mcSignal })
  }, 0)
  searchEl.focus()
}

function buildEngagementBar(m) {
  const bar = document.createElement('div')
  bar.className = 'hs-feed-engage'

  // Server returns user_heat (the heat the current user has given this msg);
  // any value > 0 means they've liked. user_liked may also be set by older
  // server versions.
  const liked = feedLiked.has(m.base36_id) || !!m.user_liked || (m.user_heat || 0) > 0
  const heatCount = m.heat || 0

  // Heat/like button — text-only to match heatsync.org (no fire emoji)
  const heatBtn = document.createElement('button')
  heatBtn.className = 'hs-feed-heat-btn' + (liked ? ' active' : '')
  heatBtn.title = liked ? 'already heated' : 'heat'
  heatBtn.dataset.id = m.base36_id
  const heatCount2 = document.createElement('span')
  heatCount2.className = 'hs-fe-count'
  heatCount2.textContent = heatCount > 0 ? formatHeat(heatCount) + '°' : '+'
  heatBtn.appendChild(heatCount2)

  // Bookmark button — ribbon SVG
  const bookmarked = feedBookmarked.has(m.base36_id)
  const bmBtn = document.createElement('button')
  bmBtn.className = 'hs-feed-bm-btn' + (bookmarked ? ' active' : '')
  bmBtn.title = bookmarked ? 'remove bookmark' : 'bookmark'
  bmBtn.dataset.id = m.base36_id
  bmBtn.appendChild(_makeSvg('M5 2h14a1 1 0 011 1v18l-8-5-8 5V3a1 1 0 011-1z', bookmarked))

  // Action buttons overlay — absolute top-right, hover-only (matches .hs-mc-reply-btn pattern)
  const actions = document.createElement('div')
  actions.className = 'hs-feed-actions'
  actions.appendChild(heatBtn)
  actions.appendChild(bmBtn)
  const addReactBtn = document.createElement('button')
  addReactBtn.className = 'hs-feed-react-add'
  addReactBtn.title = 'react'
  addReactBtn.textContent = '+'
  actions.appendChild(addReactBtn)
  bar.appendChild(actions)

  // Reactions row — always visible in flow (existing chips are data)
  const reactRow = document.createElement('div')
  reactRow.className = 'hs-feed-react-row'
  const cached = feedReactionsCache.get(m.base36_id)
  if (cached?.length) {
    for (const r of cached) reactRow.appendChild(_makeReactChip(r, m.base36_id, bar))
  }
  bar.appendChild(reactRow)

  return bar
}

function attachEngagementHandlers(div, m) {
  const bar = div.querySelector('.hs-feed-engage')
  if (!bar) return
  if (m.user_liked || (m.user_heat || 0) > 0) feedLiked.add(m.base36_id)

  const heatBtn = bar.querySelector('.hs-feed-heat-btn')
  if (heatBtn) heatBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHeat(m.base36_id, heatBtn, m) })

  const bmBtn = bar.querySelector('.hs-feed-bm-btn')
  if (bmBtn) bmBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmark(m.base36_id, bmBtn) })

  const addReactBtn = bar.querySelector('.hs-feed-react-add')
  if (addReactBtn) addReactBtn.addEventListener('click', (e) => { e.stopPropagation(); openReactionPicker(e, m.base36_id, bar) })
}

function buildFeedMessageDiv(m, opUsername) {
  const div = document.createElement('div');
  div.className = 'hs-feed-msg';
  div.dataset.msgId = m.base36_id;

  const time = formatRelativeTime(m.created_at);
  const avatarUrl = `https://heatsync.org/api/avatar/${encodeURIComponent(m.username)}`;
  const heat = m.heat || 0;
  const replies = m.reply_count || 0;
  // renderFeedContent sanitizes via escapeHtml + emote ref escaping
  const content = renderFeedContent(m.content, m.emote_refs);

  // Thread link: >>id — always expands thread inline (never navigates away)
  const shortId = (m.base36_id || '').replace(/^0+/, '') || '0';
  const inThread = !!opUsername;
  const threadLink = inThread
    ? `<span class="hs-feed-thread-link hs-quote-insert" data-quote-id="${escapeHtml(shortId)}" style="color:#ffff00;cursor:pointer">${escapeHtml(shortId)}</span>`
    : `<span class="hs-feed-thread-link hs-thread-toggle" style="cursor:pointer">&gt;&gt;${escapeHtml(shortId)}</span>`;

  // Post type tag: [OP] red = original post, [OP] magenta = OP replying in own thread, [RE] = reply
  const isOp = m.is_op != null ? !!m.is_op : (!m.reply_to || m.reply_to === '');
  const isThreadOp = m.is_thread_op != null ? !!m.is_thread_op
    : (opUsername && m.reply_to && m.username?.toLowerCase() === opUsername.toLowerCase());
  const typeTag = isThreadOp
    ? '<span class="hs-feed-tag hs-feed-tag-mop">[OP]</span>'
    : isOp
      ? '<span class="hs-feed-tag hs-feed-tag-op">[OP]</span>'
      : '<span class="hs-feed-tag hs-feed-tag-re">[RE]</span>';

  const isAnon = !m.platform || m.username === 'Anonymous';

  // Platform badge: [T]/[K]/[YT] (hidden for anonymous)
  const platLabel = m.platform === 'kick' ? '[K]' : m.platform === 'youtube' ? '[YT]' : m.platform === 'twitch' ? '[T]' : '';
  const platColors = { twitch: '#9146ff', kick: '#53fc18', youtube: '#ff0000' };
  const platBadge = platLabel ? `<span class="hs-feed-tag" style="color:${platColors[m.platform]}">${platLabel}</span>` : '';

  const timeHtml = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(time)}</span>` : '';

  // All dynamic values sanitized: avatarUrl via encodeURIComponent,
  // username/time via escapeHtml, color via sanitizeColor, content via renderFeedContent
  const hd = getHeatDisplay(heat)
  if (hd) {
    let rowStyle = `border-left:${hd.borderWidth}px solid ${hd.border};`
    if (hd.bg) rowStyle += `background:${hd.bg};`
    if (hd.breathe) div.className += ' hs-feed-heat-breathe'
    div.setAttribute('style', rowStyle)
  }
  const isReply = !!m.reply_to
  const heatStyle = hd ? getHeatNumberStyle(heat, isReply) : ''
  const heatSpan = hd ? `<span class="hs-feed-stat hs-feed-heat" style="${heatStyle}">${formatHeat(heat)}${hd.suffix}</span>` : ''
  const repliesSpan = replies > 0 ? `<span class="hs-feed-stat hs-feed-replies" title="replies">💬${replies}</span>` : '';
  const stats = [heatSpan, repliesSpan].filter(Boolean).join(' ')
  const statsHtml = stats ? ` ${stats}` : ''

  const anonAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="https://heatsync.org/anon.webp" alt="" loading="lazy">` : '';
  const userAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const tripcodeHtml = m.tripcode ? `<span class="hs-tripcode">${escapeHtml(m.tripcode)}</span>` : '';
  const userHtml = isAnon
    ? `${anonAvatar}<span class="hs-feed-user" style="color:#808080">Anonymous</span>${tripcodeHtml}`
    : `${userAvatar}<a href="https://heatsync.org/user/${encodeURIComponent(m.username)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml((m.username || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.user_color || '#fff')}">${escapeHtml(m.username || 'anon')}</a>${tripcodeHtml}`;

  // Media/embeds (img, video, iframe) — values inside are pre-sanitized via escapeHtml/safeUrl/sanitizeEmbedId
  const mediaHtml = buildFeedMediaHtml(m);
  div.innerHTML = `${timeHtml}${threadLink}${typeTag}${platBadge}${userHtml}${statsHtml}: <span class="hs-feed-body">${content}</span>${mediaHtml}`;

  // Click >>id to expand/collapse thread inline — never leaves the stream
  // If this post is a reply, open the parent thread and highlight this post
  const threadLinkEl = div.querySelector('.hs-thread-toggle');
  if (threadLinkEl) {
    threadLinkEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const threadId = m.reply_to || m.base36_id;
      const highlightId = m.reply_to ? m.base36_id : null;
      toggleThread(threadId, highlightId);
    });
  }
  const repliesEl = div.querySelector('.hs-feed-replies');
  if (repliesEl && replies > 0) {
    repliesEl.style.cursor = 'pointer';
    repliesEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThread(m.reply_to || m.base36_id);
    });
  }

  // Click >>id post-links in message content
  div.querySelectorAll('.hs-post-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = link.dataset.id;
      if (!targetId) return;
      // Find the target in feedMessages to determine its thread
      const target = feedMessages.find(f => f.base36_id === targetId);
      const threadId = target ? (target.reply_to || target.base36_id) : targetId;
      openThread(threadId, targetId);
    });
  });

  // Right-click own posts → edit/delete menu
  if (isOwnFeedPost(m)) {
    div.classList.add('hs-feed-own')
    div.addEventListener('contextmenu', (e) => {
      // Only handle right-click directly on the post (not on links/quotes inside)
      if (e.target.closest('a, .hs-feed-thread-link, .hs-quote-insert, .hs-post-link')) return
      showFeedPostContextMenu(e, div, m)
    })
  }
  // Show edited badge if message was edited
  if (m.edited_at && !div.querySelector('.hs-feed-edited')) {
    const body = div.querySelector('.hs-feed-body')
    if (body) {
      const badge = document.createElement('span')
      badge.className = 'hs-feed-edited'
      badge.textContent = ' (edited)'
      badge.style.cssText = 'color:#888;font-size:11px;font-style:italic;margin-left:4px;'
      body.appendChild(badge)
    }
  }

  // Click post ID in thread view → insert >>id into input
  const quoteEl = div.querySelector('.hs-quote-insert');
  if (quoteEl) {
    quoteEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const qid = quoteEl.dataset.quoteId;
      if (!qid) return;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;
      const quote = `>>${qid} `;
      if (wysiwygEnabled) {
        input.focus();
        document.execCommand('insertText', false, quote);
      } else {
        const pos = input.selectionStart || input.value.length;
        input.value = input.value.slice(0, pos) + quote + input.value.slice(pos);
        input.focus();
        input.selectionStart = input.selectionEnd = pos + quote.length;
      }
    });
  }

  // Engagement bar: heat, bookmark, reactions
  const engageBar = buildEngagementBar(m);
  div.appendChild(engageBar);
  attachEngagementHandlers(div, m);

  return div;
}

// Format text with markdown-style syntax (matches heatsync.org rendering)
// Must be called AFTER escapeHtml — operates on escaped HTML strings
function formatText(html) {
  // Greentext: >text< (escaped as &gt;text&lt;)
  html = html.replace(/(&gt;)([^<>&]+)(&lt;)/g, '<span class="hs-greentext">&gt;$2&lt;</span>')
  // Inline code: `text`
  html = html.replace(/`([^`]+)`/g, '<code class="hs-inline-code">$1</code>')
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  // Italic: *text* or _text_ (not if part of bold)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Spoilers: ||text||
  html = html.replace(/\|\|(.+?)\|\|/g, '<span class="hs-spoiler">$1</span>')
  return html
}

const _feedEmoteRegexCache = new Map()
function renderFeedContent(content, emoteRefs) {
  if (!content) return '';
  let html = escapeHtml(String(content));
  // Linkify URLs FIRST so text-formatting can't split them on '_' or eat path chars.
  // Single regex pass with alternation: full https:// URLs OR bare domains.
  // (?<![\/\w.]) on the bare-domain branch prevents matching inside an already-linkified URL path.
  if (linksEnabled) {
    html = html.replace(
      /(https?:\/\/[^\s<"]+|(?<![\/\w.])[a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<"]*)/gi,
      (match) => {
        const url = /^https?:\/\//i.test(match) ? match : 'https://' + match
        const text = escapeHtml(match)
        const href = escapeHtml(url)
        return `<a href="${href}" target="_blank" rel="noopener" class="hs-mc-link">${text}</a>`
      }
    )
  }
  // Text formatting (bold, italic, spoilers, etc.) — skip <a>...</a> blocks so URL underscores aren't italicized.
  {
    const parts = html.split(/(<a\s[^>]*>[^<]*<\/a>)/i)
    html = parts.map((part, i) => i % 2 === 1 ? part : formatText(part)).join('')
  }
  // Parse >>id post-links (like website does)
  html = html.replace(/(?:&gt;&gt;|>>)(\w{1,6})/g, (match, id) => {
    const paddedId = id.padStart(6, '0');
    const displayId = id.replace(/^0+/, '') || '0';
    return `<span class="hs-post-link" data-id="${paddedId}" style="cursor:pointer">&gt;&gt;${displayId}</span>`;
  });

  // Parse @mentions — must skip inside HTML tags (already-built anchors, post-links, etc.)
  // Match site's pattern: @username with 1-25 word chars
  {
    const parts = html.split(/(<[^>]+>)/);
    html = parts.map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/@([\w]{1,25})\b/g, (m, name) => {
        const lower = name.toLowerCase();
        const isSelf = hsCurrentUsername === lower;
        const cls = isSelf ? 'hs-mention self' : 'hs-mention';
        return `<a href="https://heatsync.org/user/${encodeURIComponent(name)}" target="_blank" rel="noopener" class="${cls}" data-username="${escapeHtml(lower)}">@${escapeHtml(name)}</a>`;
      });
    }).join('');
  }

  // Parse #hashtags — site pattern: leading letter, 2-30 chars total
  {
    const parts = html.split(/(<[^>]+>)/);
    html = parts.map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/#([a-zA-Z][a-zA-Z0-9_]{1,29})\b/g, (m, tag) => {
        return `<a href="https://heatsync.org/tag/${encodeURIComponent(tag)}" target="_blank" rel="noopener" class="hs-hashtag" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)}</a>`;
      });
    }).join('');
  }

  // Render emote refs as inline images (AFTER linkification so img tags aren't corrupted)
  // emote_refs can be { name: url } or { name: { url, hash, name, provider } }
  if (emoteRefs && typeof emoteRefs === 'object') {
    for (const [name, val] of Object.entries(emoteRefs)) {
      const url = typeof val === 'string' ? val : val?.url
      if (!url || !/^https:\/\//.test(url)) continue
      const escaped = escapeHtml(name);
      const safeUrl = escapeHtml(url);
      const cacheKey = escaped
      let re = _feedEmoteRegexCache.get(cacheKey)
      if (!re) {
        re = new RegExp(`\\b${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
        _feedEmoteRegexCache.set(cacheKey, re)
        if (_feedEmoteRegexCache.size > 500) _feedEmoteRegexCache.delete(_feedEmoteRegexCache.keys().next().value)
      }
      html = html.replace(re, `<img class="hs-mc-emote" src="${safeUrl}" alt="${escaped}" title="${escaped}" loading="lazy">`);
    }
  }
  return html;
}

function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  return formatRelativeMs(Date.now() - new Date(isoDate).getTime());
}

function formatRelativeMs(diff) {
  if (diff < 0) return 'now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTimeFromTs(ts) {
  if (!ts) return '';
  return formatRelativeMs(Date.now() - ts);
}

// Refresh timestamps every 30s — lightweight DOM-only update, no rebuild
cleanup.setInterval(() => {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;
  const now = Date.now();
  for (const el of msgsEl.querySelectorAll('.hs-mc-ts[data-ts]')) {
    const ts = parseInt(el.dataset.ts);
    if (ts) {
      const newText = formatRelativeMs(now - ts);
      if (el.textContent !== newText) el.textContent = newText;
    }
  }
}, 30000);

// Open thread view — replaces feed with OP + replies + reply input
async function openThread(msgId, highlightId) {
  // Find OP in feed or fetch it
  let op = feedMessages.find(m => m.base36_id === msgId);
  activeThread = { id: msgId, op: op || null, replies: [], loading: true, highlightId: highlightId || null };
  renderFeed();
  _renderFeedReplyChip(activeThread);
  if (typeof showInputBar === 'function') showInputBar();

  const resp = await apiFetch(`/api/messages/${msgId}/replies`);
  if (resp.ok) {
    activeThread.replies = resp.data?.replies || [];
  }
  activeThread.loading = false;

  // Pre-fetch reactions for OP + replies so chips render with the thread.
  // Without this, buildEngagementBar reads an empty feedReactionsCache and
  // shows zero reactions even when the server has them.
  const reactIds = [activeThread.op?.base36_id, ...activeThread.replies.map(r => r.base36_id)].filter(Boolean);
  await Promise.all(reactIds.map(id =>
    apiFetch(`/api/messages/${encodeURIComponent(id)}/reactions`, { auth: true }).then(r => {
      if (!r?.ok) return;
      const raw = r.data?.reactions || r.reactions || [];
      const reactions = raw.map(rx => ({
        ...rx,
        user_reacted: !!(rx.user_reacted ?? (hsCurrentUserId && Array.isArray(rx.user_ids) && rx.user_ids.map(String).includes(hsCurrentUserId)))
      }));
      feedReactionsCache.set(id, reactions);
    }).catch(() => {})
  ));
  _capFeedEngage();

  renderFeed();

  // Scroll to and highlight the target post
  if (highlightId) {
    const msgsEl = document.getElementById('hs-mc-messages');
    const target = msgsEl?.querySelector(`[data-msg-id="${highlightId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'center' });
      target.classList.add('hs-post-highlight');
      setTimeout(() => target.classList.remove('hs-post-highlight'), 1000);
    }
  }
}

function closeThread() {
  activeThread = null;
  _clearFeedReplyChip();
  renderFeed();
}

// Reply-state chip shown above input bar when in thread view.
// [OP] magenta if you are the thread OP, [RE] cyan otherwise.
// Mirrors the [OP]/[RE] tag system from feed posts so click-to-reply
// has the same visual language as the rendered output.
function _renderFeedReplyChip(thread) {
  document.getElementById('hs-mc-feed-reply-chip')?.remove();
  if (!thread || !thread.id) return;
  const bar = document.getElementById('hs-mc-inputbar');
  if (!bar) return;

  const chip = document.createElement('div');
  chip.id = 'hs-mc-feed-reply-chip';
  chip.className = 'hs-mc-feed-reply-chip';

  const opUser = thread.op?.username?.toLowerCase() || '';
  const isOwnOp = !!(hsCurrentUsername && opUser && hsCurrentUsername.toLowerCase() === opUser);

  const tag = document.createElement('span');
  tag.className = isOwnOp
    ? 'hs-feed-tag hs-feed-tag-mop'
    : 'hs-feed-tag hs-feed-tag-re';
  tag.textContent = isOwnOp ? '[OP]' : '[RE]';
  chip.appendChild(tag);

  const ref = document.createElement('span');
  ref.className = 'hs-mc-feed-reply-ref';
  const rawId = thread.op?.base36_id || thread.id || '';
  const displayId = String(rawId).replace(/^0+/, '') || '0';
  ref.textContent = ` replying to >>${displayId}`;
  chip.appendChild(ref);

  const cancel = document.createElement('button');
  cancel.className = 'hs-mc-feed-reply-cancel';
  cancel.textContent = '✕';
  cancel.title = 'leave thread';
  cancel.addEventListener('click', (e) => {
    e.preventDefault();
    closeThread();
  });
  chip.appendChild(cancel);

  bar.insertBefore(chip, bar.firstChild);
}

function _clearFeedReplyChip() {
  document.getElementById('hs-mc-feed-reply-chip')?.remove();
}

function toggleThread(msgId, highlightId) {
  if (activeThread && activeThread.id === msgId && !highlightId) {
    closeThread();
  } else {
    openThread(msgId, highlightId);
  }
}

// Render the thread view (OP + replies + back button)
function renderThreadView(msgsEl) {
  const at = activeThread;
  isProgrammaticScroll = true;
  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  if (at.op) {
    const opDiv = buildFeedMessageDiv(at.op, at.op?.username);
    opDiv.classList.add('hs-thread-op');
    frag.appendChild(opDiv);
  }

  const container = document.createElement('div');
  container.className = 'hs-thread-container';
  container.dataset.thread = at.id;

  if (at.loading) {
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = 'loading...';
    loading.style.fontSize = '11px';
    container.appendChild(loading);
  } else if (at.replies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = t('mc_social_no_replies');
    empty.style.fontSize = '11px';
    container.appendChild(empty);
  } else {
    for (const r of at.replies) {
      const replyDiv = buildFeedMessageDiv(r, at.op?.username);
      replyDiv.classList.add('hs-thread-reply');
      if (r.is_thread_op) replyDiv.classList.add('is-thread-op');
      container.appendChild(replyDiv);
    }
  }
  frag.appendChild(container);
  msgsEl.appendChild(frag);

  isProgrammaticScroll = true;
  msgsEl.scrollTop = 0;
  requestAnimationFrame(() => { isProgrammaticScroll = false; });

  if (typeof resolvePendingFeedEmbeds === 'function') resolvePendingFeedEmbeds(msgsEl)
}

async function postFeedMessage(text, { topLevel = false } = {}) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return false;

  if (!hsAuthToken) {
    if (wysiwygEnabled) {
      input.dataset.placeholder = t('mc_social_login_first');
    } else {
      input.placeholder = t('mc_social_login_first');
    }
    setTimeout(() => updateInputPlaceholder(), 2000);
    return false;
  }

  // Extract pasted/uploaded media URL from content. The chat-tile flow
  // inserts /uploads/<file> as text into the input; the home-feed renderer
  // expects media_url as a separate field. Pull the first match out so it
  // renders as inline media on heatsync.org.
  let mediaUrl = null;
  let mediaType = null;
  const mediaMatch = text.match(/(?:https?:\/\/[^\s]*)?\/uploads\/([\w.-]+\.(jpg|jpeg|png|gif|webp|avif|mp4|webm|mov))(?:\?[^\s]*)?/i);
  if (mediaMatch) {
    mediaUrl = mediaMatch[0].startsWith('/') ? mediaMatch[0] : new URL(mediaMatch[0]).pathname;
    const ext = mediaMatch[2].toLowerCase();
    mediaType = /^(mp4|webm|mov)$/.test(ext) ? 'video' : 'image';
    text = text.replace(mediaMatch[0], '').replace(/\s+/g, ' ').trim();
  }

  const body = { content: text };
  if (mediaUrl) {
    body.media_url = mediaUrl;
    body.media_type = mediaType;
  }
  // In thread view, global input posts as a reply to the active thread
  if (activeThread) {
    body.reply_to = activeThread.id;
  }

  const resp = await apiFetch('/api/messages', { method: 'POST', auth: true, body });
  if (resp.ok) {
    if (wysiwygEnabled) {
      input.innerHTML = '';
    } else {
      input.value = '';
    }
    pendingMessage = '';
    updateCharCount();
    hideInputBar();
    // Insert own post immediately from response (fetchFeed unreliable — service worker gets killed)
    const posted = resp.data?.message
    if (posted) {
      if (!feedMessages.some(f => f.base36_id === posted.base36_id)) {
        feedMessages.unshift(posted)
        if (feedMessages.length > 150) feedMessages.pop()
      }
      // If in thread view, append reply to the thread
      if (activeThread && activeThread.id === posted.reply_to) {
        if (!activeThread.replies.some(r => r.base36_id === posted.base36_id)) {
          activeThread.replies.push(posted)
        }
        // Update OP reply count
        if (activeThread.op) activeThread.op.reply_count = (activeThread.op.reply_count || 0) + 1;
        const parent = feedMessages.find(m => m.base36_id === activeThread.id);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
      }
    }
    if (currentTab === 'feed') renderFeed()
    return true
  } else {
    input.style.borderColor = '#f44';
    const errMsg = resp.status === 401 ? t('mc_social_log_in_first')
      : resp.status === 429 ? t('mc_social_slow_down')
      : resp.status === 409 ? t('mc_social_duplicate')
      : t('mc_social_failed_post');
    showToast(errMsg, 'error');
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    log('Post failed:', resp.status || resp.error);
    return false
  }
}


// ============================================
// DISCOVER TAB (trending tags + profiles)
// ============================================

let discoverLoaded = false;
let discoverLoading = false;
let discoverPollTimer = null;
function startDiscoverPolling() {
  if (discoverPollTimer) return;
  // Auto-refresh while user is viewing the discover tab
  discoverPollTimer = cleanup.setInterval(() => {
    if (currentTab === 'discover' && !discoverLoading) {
      discoverLoaded = false;
      fetchDiscover();
    } else if (currentTab !== 'discover') {
      cleanup.clearInterval(discoverPollTimer);
      discoverPollTimer = null;
    }
  }, 20000);
}
let discoverTags = [];
let discoverProfiles = [];
let discoverPosts = [];
let discoverPlatformFilter = 'all';   // 'all' | 't' | 'k' | 'yt'

function _discoverSetLoading(msgsEl) {
  msgsEl.textContent = '';
  const el = document.createElement('div');
  el.className = 'hs-mc-empty';
  el.textContent = 'loading...';
  msgsEl.appendChild(el);
}

async function fetchDiscover() {
  if (discoverLoading) return;
  discoverLoading = true;

  const msgsEl = document.getElementById('hs-mc-messages');
  if (msgsEl && currentTab === 'discover') _discoverSetLoading(msgsEl);

  // Snapshot the tab user was on when fetch started — if they switched away and
  // back during the await, the .finally still re-renders correctly. If they
  // switched away and stayed, render is skipped (no clobbering other tab DOM).
  const tabAtFetch = currentTab;
  try {
    const [tagsResp, profilesResp, postsResp] = await Promise.all([
      apiFetch('/api/discover/trending-tags'),
      apiFetch('/api/profiles/trending'),
      apiFetch('/api/messages?sort=time&limit=40').catch(() => null),
    ]);

    // Server shape: { tags: [...] } and { profiles: [...] }.
    // api_fetch proxy wraps as { ok: true, data: {...} }, so unwrap one more level.
    const tagsData = tagsResp.ok ? (tagsResp.data || tagsResp) : {};
    const profilesData = profilesResp.ok ? (profilesResp.data || profilesResp) : {};
    discoverTags = Array.isArray(tagsData) ? tagsData : (tagsData.tags || []);
    discoverProfiles = Array.isArray(profilesData) ? profilesData : (profilesData.profiles || []);

    // Posts: pull recent feed, client-sort by heat, take top by heat>0
    const rawPosts = postsResp?.ok ? (postsResp.data?.messages || []) : [];
    discoverPosts = rawPosts
      .filter(m => m && m.username && m.username !== 'Anonymous' && (m.heat || 0) > 0)
      .sort((a, b) => (b.heat || 0) - (a.heat || 0))
      .slice(0, 8);

    discoverLoaded = true;
  } catch (e) {
    discoverTags = [];
    discoverProfiles = [];
    discoverPosts = [];
    discoverLoaded = true;
  } finally {
    discoverLoading = false;
    if (currentTab === 'discover') renderDiscoverTab();
    void tabAtFetch;
  }
}

// Compact number: 12345 -> "12.3k", 1200000 -> "1.2m"
function formatDiscoverCount(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// Compact heat tier styling — matches site canonical color tiers from getHeatNumberStyle,
// but with fixed (small) size so discover rows stay dense.
// Tiers: 0 → #444, 1-10 → #888, 10-30 → #888, 30-50 → #cc6600, 50-100 → #ff8700,
//        100-500 → #ffaa33, 500+ → #fff with breathe animation
function discoverHeatStyle(heat) {
  let color = '#444', textShadow = '', animation = '';
  if (heat > 500) {
    color = '#fff';
    textShadow = '0 0 4px rgba(255,255,255,1),0 0 10px rgba(255,200,100,0.9),0 0 18px rgba(255,135,0,0.6)';
    animation = 'hs-heat-breathe 2s ease-in-out infinite';
  } else if (heat > 100) {
    color = '#ffaa33';
    textShadow = '0 0 4px rgba(255,170,50,0.85),0 0 10px rgba(255,135,0,0.4)';
  } else if (heat > 50) {
    color = '#ff8700';
    textShadow = '0 0 3px rgba(255,135,0,0.55)';
  } else if (heat > 30) {
    color = '#cc6600';
  } else if (heat > 10) {
    color = '#888';
  }
  let style = `color:${color};font-weight:900;font-variant-numeric:tabular-nums;`;
  if (textShadow) style += `text-shadow:${textShadow};`;
  if (animation) style += `animation:${animation};`;
  return style;
}

// Apply canonical row-level heat effects (border, bg tint, breathe class)
function applyDiscoverHeatRowEffects(row, heat) {
  const hd = getHeatDisplay(heat);
  if (!hd) return;
  row.style.borderLeftColor = hd.border;
  row.style.borderLeftWidth = hd.borderWidth + 'px';
  if (hd.bg) row.style.background = hd.bg;
  if (hd.breathe) row.classList.add('hs-feed-heat-breathe');
}

// Canonical heat number — formatHeat + ° suffix at ≥ 10 + tier color/glow/breathe inline style.
// HTML-string variant for innerHTML callers (heat numeric + internally-built style is safe).
function heatSpanHtml(heat) {
  const h = Number(heat) || 0;
  if (h <= 0) return '';
  const style = discoverHeatStyle(h);
  const suffix = h >= 10 ? '°' : '';
  return `<span class="hs-heat-num" style="${style}">${formatHeat(h)}${suffix}</span>`;
}

// Same, returned as a DOM node for createElement callers.
function heatSpanEl(heat) {
  const h = Number(heat) || 0;
  if (h <= 0) return null;
  const span = document.createElement('span');
  span.className = 'hs-heat-num';
  span.setAttribute('style', discoverHeatStyle(h));
  const suffix = h >= 10 ? '°' : '';
  span.textContent = formatHeat(h) + suffix;
  return span;
}

function renderDiscoverProfileRow(profile, username, rank, maxHeat, showRank = true) {
  const row = document.createElement('a');
  row.className = 'hs-discover-profile-row';
  row.href = `https://heatsync.org/user/${encodeURIComponent(username)}`;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';

  const isLive = !!(profile.twitch_is_live || profile.kick_is_live);
  if (isLive) row.classList.add('hs-discover-row-live');

  if (showRank) {
    const rankEl = document.createElement('span');
    rankEl.className = 'hs-discover-rank';
    rankEl.textContent = String(rank).padStart(2, '0');
    row.appendChild(rankEl);
  }

  const dot = document.createElement('span');
  dot.className = isLive ? 'hs-discover-live-dot' : 'hs-discover-live-spacer';
  if (isLive) {
    const v = (profile.twitch_viewer_count || 0) + (profile.kick_viewer_count || 0);
    dot.title = v > 0 ? `live · ${v.toLocaleString()} viewer${v === 1 ? '' : 's'}` : 'live';
  }
  row.appendChild(dot);

  const avatarUrl = safeUrl(profile.avatarUrl || profile.avatar_url || profile.twitch_profile_pic || profile.kick_profile_pic || '');
  if (avatarUrl) {
    const img = document.createElement('img');
    img.className = 'hs-discover-avatar';
    img.src = avatarUrl;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() { this.style.visibility = 'hidden'; };
    row.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'hs-discover-avatar hs-discover-avatar-empty';
    row.appendChild(ph);
  }

  const nameEl = document.createElement('span');
  nameEl.className = 'hs-discover-profile-name';
  nameEl.style.color = sanitizeColor(profile.userColor || profile.user_color || '#fff');
  nameEl.textContent = profile.displayName || profile.display_name || username;
  row.appendChild(nameEl);

  const plats = document.createElement('span');
  plats.className = 'hs-discover-platforms';
  if (profile.twitch_username) {
    const t = document.createElement('a');
    t.className = 'hs-plat hs-plat-t';
    t.textContent = 't';
    t.href = `https://www.twitch.tv/${encodeURIComponent(profile.twitch_username)}`;
    t.target = '_blank';
    t.rel = 'noopener noreferrer';
    t.title = `twitch · @${profile.twitch_username}${profile.twitch_is_live ? ' · live' : ''}`;
    if (profile.twitch_is_live) t.classList.add('hs-plat-live');
    t.addEventListener('click', e => e.stopPropagation());
    plats.appendChild(t);
  }
  if (profile.kick_username) {
    const k = document.createElement('a');
    k.className = 'hs-plat hs-plat-k';
    k.textContent = 'k';
    k.href = `https://kick.com/${encodeURIComponent(profile.kick_username)}`;
    k.target = '_blank';
    k.rel = 'noopener noreferrer';
    k.title = `kick · @${profile.kick_username}${profile.kick_is_live ? ' · live' : ''}`;
    if (profile.kick_is_live) k.classList.add('hs-plat-live');
    k.addEventListener('click', e => e.stopPropagation());
    plats.appendChild(k);
  }
  if (plats.childNodes.length) row.appendChild(plats);

  const heat = Number(profile.stats?.total_heat ?? profile.heat ?? 0);
  const bar = document.createElement('span');
  bar.className = 'hs-discover-bar';
  const fill = document.createElement('i');
  const pct = maxHeat > 0 ? Math.max(2, Math.round((heat / maxHeat) * 100)) : 2;
  fill.style.width = pct + '%';
  bar.appendChild(fill);
  row.appendChild(bar);

  // Canonical heat number — matches website / feed posts (formatHeat + ° suffix, tiered glow)
  const heatEl = document.createElement('span');
  heatEl.className = 'hs-discover-heat';
  heatEl.title = `${heat.toLocaleString()} heat`;
  heatEl.setAttribute('style', discoverHeatStyle(heat));
  const suffix = heat >= 10 ? '°' : '';
  heatEl.textContent = formatHeat(heat) + suffix;
  row.appendChild(heatEl);

  // Apply row-level heat tier effects ONLY when not live (live row has red border)
  if (!isLive) applyDiscoverHeatRowEffects(row, heat);

  if (isLive) {
    const v = (profile.twitch_viewer_count || 0) + (profile.kick_viewer_count || 0);
    if (v > 0) {
      const vEl = document.createElement('span');
      vEl.className = 'hs-discover-viewers';
      vEl.textContent = formatDiscoverCount(v);
      vEl.title = `${v.toLocaleString()} viewers`;
      row.appendChild(vEl);
    }
  }

  return row;
}

// Platform filter bar — click rerenders
function renderDiscoverChipsBar() {
  const bar = document.createElement('div');
  bar.className = 'hs-discover-chips-bar';

  function makeChip(label, value, currentValue, setter, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hs-discover-chip-btn' + (extraClass ? ' ' + extraClass : '');
    if (value === currentValue) btn.classList.add('hs-active');
    btn.textContent = label;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      setter(value);
      renderDiscoverTab();
    });
    return btn;
  }

  function makeLabel(text) {
    const l = document.createElement('span');
    l.className = 'hs-discover-chips-label';
    l.textContent = text;
    return l;
  }

  bar.appendChild(makeLabel('platform'));
  bar.appendChild(makeChip('all', 'all', discoverPlatformFilter, v => { discoverPlatformFilter = v; }));
  bar.appendChild(makeChip('t', 't', discoverPlatformFilter, v => { discoverPlatformFilter = v; }, 'hs-chip-plat-t'));
  bar.appendChild(makeChip('k', 'k', discoverPlatformFilter, v => { discoverPlatformFilter = v; }, 'hs-chip-plat-k'));
  bar.appendChild(makeChip('yt', 'yt', discoverPlatformFilter, v => { discoverPlatformFilter = v; }, 'hs-chip-plat-yt'));
  return bar;
}

function profileMatchesPlatformFilter(p) {
  if (discoverPlatformFilter === 'all') return true;
  if (discoverPlatformFilter === 't') return !!p.twitch_username;
  if (discoverPlatformFilter === 'k') return !!p.kick_username;
  if (discoverPlatformFilter === 'yt') return !!(p.youtube_username || p.youtube_channel_id);
  return true;
}

function postMatchesPlatformFilter(m) {
  if (discoverPlatformFilter === 'all') return true;
  if (discoverPlatformFilter === 't') return m.platform === 'twitch';
  if (discoverPlatformFilter === 'k') return m.platform === 'kick';
  if (discoverPlatformFilter === 'yt') return m.platform === 'youtube';
  return true;
}

function sortProfilesByHeat(a, b) {
  return (b.stats?.total_heat || 0) - (a.stats?.total_heat || 0);
}

function renderDiscoverPostRow(m) {
  const row = document.createElement('a');
  row.className = 'hs-discover-post-row';
  row.href = `https://heatsync.org/m/${encodeURIComponent(m.base36_id)}`;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';

  // Meta line: time · plat · user · spacer · heat · replies
  const meta = document.createElement('div');
  meta.className = 'hs-discover-post-meta';

  const time = document.createElement('span');
  time.className = 'hs-discover-post-time';
  time.textContent = formatRelativeTime(m.created_at);
  time.title = new Date(m.created_at).toLocaleString();
  meta.appendChild(time);

  if (m.platform) {
    const plat = document.createElement('span');
    const code = m.platform === 'twitch' ? 't' : m.platform === 'kick' ? 'k' : m.platform === 'youtube' ? 'yt' : 'h';
    plat.className = `hs-plat hs-plat-${code} hs-discover-post-plat`;
    plat.textContent = code;
    meta.appendChild(plat);
  }

  const user = document.createElement('span');
  user.className = 'hs-discover-post-user';
  user.style.color = sanitizeColor(m.user_color || '#fff');
  user.textContent = m.username;
  meta.appendChild(user);

  const spacer = document.createElement('span');
  spacer.className = 'hs-discover-post-spacer';
  meta.appendChild(spacer);

  const heat = Number(m.heat || 0);
  const heatEl = document.createElement('span');
  heatEl.className = 'hs-discover-heat hs-discover-post-heat';
  heatEl.title = `${heat.toLocaleString()} heat`;
  heatEl.setAttribute('style', discoverHeatStyle(heat));
  const suffix = heat >= 10 ? '°' : '';
  heatEl.textContent = formatHeat(heat) + suffix;
  meta.appendChild(heatEl);

  if ((m.reply_count || 0) > 0) {
    const rep = document.createElement('span');
    rep.className = 'hs-discover-post-replies';
    rep.title = `${m.reply_count} repl${m.reply_count === 1 ? 'y' : 'ies'}`;
    rep.textContent = `${m.reply_count}r`;
    meta.appendChild(rep);
  }

  row.appendChild(meta);

  // Content line: post body, full width, max 2 lines via line-clamp
  const txt = document.createElement('div');
  txt.className = 'hs-discover-post-text';
  const snippet = String(m.content || '').replace(/\s+/g, ' ').trim();
  txt.textContent = snippet || '(no text)';
  row.appendChild(txt);

  // Canonical row-level heat tier effects (border tier, bg, breathe at 500+)
  applyDiscoverHeatRowEffects(row, heat);

  return row;
}

function makeDiscoverSection(titleText, subtitleText, metaText, extraClass) {
  const section = document.createElement('section');
  section.className = 'hs-discover-section' + (extraClass ? ' ' + extraClass : '');
  const heading = document.createElement('div');
  heading.className = 'hs-discover-heading';

  const titleWrap = document.createElement('span');
  titleWrap.className = 'hs-discover-heading-title';
  titleWrap.textContent = titleText;
  heading.appendChild(titleWrap);

  if (metaText) {
    const meta = document.createElement('span');
    meta.className = 'hs-discover-meta';
    meta.textContent = metaText;
    heading.appendChild(meta);
  }
  section.appendChild(heading);

  if (subtitleText) {
    const sub = document.createElement('div');
    sub.className = 'hs-discover-subtitle';
    sub.textContent = subtitleText;
    section.appendChild(sub);
  }

  const body = document.createElement('div');
  body.className = 'hs-discover-section-body';
  section.appendChild(body);
  return { section, body };
}

function renderDiscoverTab() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return;
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  startDiscoverPolling();

  if (!discoverLoaded && !discoverLoading) {
    fetchDiscover();
    return;
  }
  if (discoverLoading) {
    _discoverSetLoading(msgsEl);
    return;
  }

  msgsEl.textContent = '';

  // Container query root — gives us responsive layout based on panel width, not viewport
  const root = document.createElement('div');
  root.className = 'hs-discover-root';

  const filteredProfiles = discoverProfiles.filter(profileMatchesPlatformFilter);
  const filteredPosts = discoverPosts.filter(postMatchesPlatformFilter);

  const liveProfiles = filteredProfiles
    .filter(p => p.twitch_is_live || p.kick_is_live)
    .sort((a, b) => {
      const av = (a.twitch_viewer_count || 0) + (a.kick_viewer_count || 0);
      const bv = (b.twitch_viewer_count || 0) + (b.kick_viewer_count || 0);
      if (av !== bv) return bv - av;
      return (b.stats?.total_heat || 0) - (a.stats?.total_heat || 0);
    });
  const restProfiles = filteredProfiles
    .filter(p => !p.twitch_is_live && !p.kick_is_live)
    .sort(sortProfilesByHeat);
  const maxHeat = Math.max(
    ...filteredProfiles.map(p => p.stats?.total_heat ?? p.heat ?? 0),
    1
  );

  // Filter chips
  root.appendChild(renderDiscoverChipsBar());

  // Top row — LIVE NOW + HOT POSTS side by side when wide
  const topRow = document.createElement('div');
  topRow.className = 'hs-discover-row1';

  // ● LIVE NOW
  {
    const { section, body } = makeDiscoverSection(
      'live now',
      null,
      liveProfiles.length > 0 ? `${liveProfiles.length}` : '0',
      'hs-discover-section-live'
    );
    if (liveProfiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no streams live right now';
      body.appendChild(empty);
      // Contextual nudge — if the user follows few/no people on heatsync, the
      // section will always look empty. Surface twitch import right at the
      // point of pain. safeSendMessage→get_followed_users to gate the prompt.
      try {
        chrome.runtime.sendMessage({ type: 'get_followed_users' }).then(resp => {
          if ((resp?.users?.length || 0) >= 5) return;
          if (!body.isConnected) return;
          const nudge = document.createElement('div');
          nudge.className = 'hs-discover-section-empty hs-discover-import-nudge';
          const a = document.createElement('a');
          a.href = '#';
          a.textContent = 'import follows from twitch';
          a.style.color = '#ff8700';
          a.style.textDecoration = 'none';
          a.addEventListener('click', async (e) => {
            e.preventDefault();
            a.textContent = 'syncing…';
            try {
              const r = await apiFetch('/api/sync-twitch-follows', { method: 'POST', auth: true });
              if (r?.ok && r?.data?.success) {
                a.textContent = `synced ${r.data.synced} ✓`;
                try { chrome.runtime.sendMessage({ type: 'refresh_followed_users' }); } catch {}
                setTimeout(() => renderDiscoverTab(), 1500);
              } else {
                a.textContent = (r?.error || r?.data?.error || 'failed').slice(0, 30);
              }
            } catch (err) {
              a.textContent = 'failed';
            }
          });
          nudge.appendChild(a);
          body.appendChild(nudge);
        }).catch(() => {});
      } catch {}
    } else {
      for (const profile of liveProfiles) {
        const username = profile.username || profile.name || '';
        if (!username) continue;
        const row = renderDiscoverProfileRow(profile, username, 0, maxHeat, false);
        if (row) body.appendChild(row);
      }
    }
    topRow.appendChild(section);
  }

  // HOT POSTS
  {
    const { section, body } = makeDiscoverSection(
      'hot posts',
      null,
      null,
      'hs-discover-section-posts'
    );
    if (filteredPosts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no posts match filter';
      body.appendChild(empty);
    } else {
      for (const m of filteredPosts) {
        const row = renderDiscoverPostRow(m);
        if (row) body.appendChild(row);
      }
    }
    topRow.appendChild(section);
  }

  root.appendChild(topRow);

  // TAGS — always render, above the long leaderboard
  {
    const { section, body } = makeDiscoverSection(
      'tags',
      null,
      null,
      'hs-discover-section-tags'
    );
    if (discoverTags.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'none right now';
      body.appendChild(empty);
    } else {
      const chips = document.createElement('div');
      chips.className = 'hs-discover-chips';
      for (const tag of discoverTags) {
        const name = typeof tag === 'string' ? tag : (tag.name || tag.tag || '');
        if (!name) continue;
        const chip = document.createElement('a');
        chip.className = 'hs-discover-chip';
        chip.href = `https://heatsync.org/tags/${encodeURIComponent(name)}`;
        chip.target = '_blank';
        chip.rel = 'noopener noreferrer';
        chip.textContent = name;
        const count = typeof tag === 'object' ? (tag.count || tag.usage || 0) : 0;
        if (count > 0) {
          const c = document.createElement('span');
          c.className = 'hs-discover-chip-count';
          c.textContent = formatDiscoverCount(count);
          chip.appendChild(c);
        }
        chips.appendChild(chip);
      }
      body.appendChild(chips);
    }
    root.appendChild(section);
  }

  // LEADERBOARD — non-live profiles, multi-column when wide
  {
    const { section, body } = makeDiscoverSection(
      'leaderboard',
      null,
      null,
      'hs-discover-section-trending'
    );
    body.classList.add('hs-discover-leaderboard-body');
    if (restProfiles.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'hs-discover-section-empty';
      empty.textContent = 'no profiles match this filter';
      body.appendChild(empty);
    } else {
      let rank = 1;
      for (const profile of restProfiles) {
        const username = profile.username || profile.name || '';
        if (!username) continue;
        const row = renderDiscoverProfileRow(profile, username, rank++, maxHeat);
        if (row) body.appendChild(row);
      }
    }
    root.appendChild(section);
  }

  msgsEl.appendChild(root);
}

// Pinned messages tab
let pinnedLoaded = false;
let pinnedLoading = false;
let pinnedPollTimer = null;
function startPinnedPolling() {
  if (pinnedPollTimer) return;
  pinnedPollTimer = cleanup.setInterval(() => {
    if (currentTab === 'pinned' && !pinnedLoading) {
      pinnedLoaded = false;
      fetchPinned();
    } else if (currentTab !== 'pinned') {
      cleanup.clearInterval(pinnedPollTimer);
      pinnedPollTimer = null;
    }
  }, 20000);
}
let pinnedMessages = [];

function _pinnedSetLoading(msgsEl) {
  msgsEl.textContent = '';
  const el = document.createElement('div');
  el.className = 'hs-mc-empty';
  el.textContent = 'loading...';
  msgsEl.appendChild(el);
}

async function fetchPinned() {
  if (pinnedLoading) return;
  pinnedLoading = true;

  const msgsEl = document.getElementById('hs-mc-messages');
  if (msgsEl && currentTab === 'pinned') _pinnedSetLoading(msgsEl);

  try {
    const resp = await apiFetch('/api/messages/pinned');
    // Server returns { messages: [...] }; api_fetch proxy wraps as { ok, data: { messages } }
    const data = resp.ok ? (resp.data || resp) : {};
    pinnedMessages = Array.isArray(data) ? data : (data.messages || []);
    pinnedLoaded = true;
  } catch (e) {
    pinnedMessages = [];
    pinnedLoaded = true;
  } finally {
    pinnedLoading = false;
    if (currentTab === 'pinned') renderPinnedTab();
  }
}

function renderPinnedTab() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return;
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Auto-refresh while viewing — no manual refresh button.
  startPinnedPolling();

  if (!pinnedLoaded && !pinnedLoading) {
    fetchPinned();
    return;
  }
  if (pinnedLoading) {
    _pinnedSetLoading(msgsEl);
    return;
  }

  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  if (pinnedMessages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'no pinned messages';
    frag.appendChild(empty);
    msgsEl.appendChild(frag);
    return;
  }

  for (const m of pinnedMessages) {
    const id = m.base36_id || m.id || '';
    const channel = escapeHtml(m.channel || '');
    const user = escapeHtml(m.user || m.username || m.display_name || '');
    const content = escapeHtml(m.content || m.text || '');
    const ts = m.ts || m.created_at || m.timestamp || '';
    const timeStr = ts ? escapeHtml(new Date(ts).toLocaleString()) : '';

    const row = document.createElement('a');
    row.className = 'hs-pinned-row';
    if (id) {
      const url = safeUrl(`https://heatsync.org/m/${encodeURIComponent(id)}`);
      if (url) {
        row.href = url;
        row.target = '_blank';
        row.rel = 'noopener noreferrer';
      }
    }

    const meta = document.createElement('div');
    meta.className = 'hs-pinned-meta';
    if (channel) {
      const channelSpan = document.createElement('span');
      channelSpan.className = 'hs-pinned-channel';
      channelSpan.textContent = channel;
      meta.appendChild(channelSpan);
    }
    if (user) {
      const userSpan = document.createElement('span');
      userSpan.className = 'hs-pinned-user';
      userSpan.textContent = user;
      meta.appendChild(userSpan);
    }
    if (timeStr) {
      const timeSpan = document.createElement('span');
      timeSpan.className = 'hs-pinned-time';
      timeSpan.textContent = timeStr;
      meta.appendChild(timeSpan);
    }
    row.appendChild(meta);

    const body = document.createElement('div');
    body.className = 'hs-pinned-body';
    body.textContent = content;
    row.appendChild(body);

    frag.appendChild(row);
  }

  msgsEl.appendChild(frag);
}
