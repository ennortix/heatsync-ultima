// Whispers — unified chronological timeline of all whispers + DMs

const whisperTimeline = [] // { user, text, color, time, self, platform, key, status?, id? }
const whisperUsers = new Map() // key → { platform, userId, displayName, color }
const WHISPER_USERS_MAX = 200
const WHISPER_TIMELINE_MAX_READ = 500 // hard cap on READ messages
const WHISPER_TIMELINE_MAX_UNREAD = 500 // hard cap on UNREAD messages
// O(1) dedup. Composite key = id when present, else user|time|text-prefix so IRC↔EventSub
// dual delivery still collapses even when one side lacks an ID.
const _whisperSeen = new Set()
const _WHISPER_SEEN_MAX = 2000
// Hash full whisper text (djb2). 64-char-prefix dedup collided on long
// whispers sharing an intro — one of the two silently dropped, no unread
// badge for the dropped one. Full-text hash is stable, 32-bit, fits the key.
function _hashText(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return h
}
function _whisperDedupKey(platform, id, user, time, text) {
  if (id) return `${platform}:${id}`
  return `${platform}|${(user || '').toLowerCase()}|${time || 0}|${_hashText(text || '')}`
}
function _whisperMarkSeen(key) {
  if (_whisperSeen.has(key)) return true
  _whisperSeen.add(key)
  if (_whisperSeen.size > _WHISPER_SEEN_MAX) {
    // Drop the oldest insertion (Set preserves insertion order)
    const it = _whisperSeen.values().next()
    if (!it.done) _whisperSeen.delete(it.value)
  }
  return false
}

// Trim oldest READ messages once read-count exceeds cap, and oldest UNREAD
// messages once unread-count exceeds its own cap. Self-sent messages count
// as read (we wrote them).
function trimWhisperTimeline() {
  const lastViewed = seenAt.whispers
  // --- read eviction ---
  let readCount = 0
  for (const m of whisperTimeline) {
    if (m.self || m.time <= lastViewed) readCount++
  }
  let toRemove = readCount - WHISPER_TIMELINE_MAX_READ
  if (toRemove > 0) {
    for (let i = 0; i < whisperTimeline.length && toRemove > 0; ) {
      const m = whisperTimeline[i]
      if (m.self || m.time <= lastViewed) {
        whisperTimeline.splice(i, 1)
        toRemove--
      } else {
        i++
      }
    }
  }
  // --- unread eviction ---
  let unreadCount = 0
  for (const m of whisperTimeline) {
    if (!m.self && m.time > lastViewed) unreadCount++
  }
  let toRemoveUnread = unreadCount - WHISPER_TIMELINE_MAX_UNREAD
  if (toRemoveUnread <= 0) return
  for (let i = 0; i < whisperTimeline.length && toRemoveUnread > 0; ) {
    const m = whisperTimeline[i]
    if (!m.self && m.time > lastViewed) {
      whisperTimeline.splice(i, 1)
      toRemoveUnread--
    } else {
      i++
    }
  }
}
function whisperUsersSet(key, value) {
  whisperUsers.set(key, value)
  if (whisperUsers.size > WHISPER_USERS_MAX) {
    whisperUsers.delete(whisperUsers.keys().next().value)
  }
}
let lastWhisperKey = null // for /r — last person involved in a whisper
let whisperDmsLoaded = false
let selfWhisperColor = null // current user's Twitch color

// Resolve own color from IRC buffers, chat DOM, or Twitch cookie color
function resolveSelfColor() {
  if (selfWhisperColor) return
  const me = (currentUsername || '').toLowerCase()
  if (!me) return
  // Check IRC message buffers for our own messages (they contain our color)
  if (typeof irc !== 'undefined' && irc?.channels) {
    for (const [, buf] of irc.channels) {
      const msgs = buf.getAll ? buf.getAll() : []
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].user?.toLowerCase() === me && msgs[i].color) {
          selfWhisperColor = msgs[i].color
          return
        }
      }
    }
  }
  // Check DOM for our username color
  try {
    const el = document.querySelector(`.chat-author__display-name[data-a-user="${me}"]`)
    if (el) {
      selfWhisperColor = el.style.color || getComputedStyle(el).color
      return
    }
  } catch (e) {
    warn('selfWhisperColor DOM probe failed:', e?.message)
  }
}

let _whisperSaveTimer = null
function whisperSaveDebounced() {
  if (_whisperSaveTimer) cleanup.clearTimeout(_whisperSaveTimer)
  _whisperSaveTimer = cleanup.setTimeout(saveWhispers, 500)
}

function saveWhispers() {
  const users = {}
  for (const [key, u] of whisperUsers) users[key] = u
  try {
    trimWhisperTimeline()
    chrome.storage.local
      .set({
        hs_whispers_v2: {
          timeline: whisperTimeline.slice(),
          users,
          lastKey: lastWhisperKey,
        },
      })
      .catch((e) => warn('whispers save failed:', e?.message))
  } catch (e) {
    warn('whispers save failed:', e?.message)
  }
}

function loadWhispers() {
  try {
    chrome.storage.local
      .get(['hs_whispers_v2', 'hs_whispers'])
      .then((stored) => {
        // Load v2 format (timeline)
        const data = stored.hs_whispers_v2
        if (data) {
          if (Array.isArray(data.timeline)) {
            for (const msg of data.timeline) {
              if (!whisperTimeline.some((m) => m.time === msg.time && m.text === msg.text)) {
                whisperTimeline.push(msg)
              }
            }
          }
          if (data.users) {
            for (const [key, u] of Object.entries(data.users)) {
              if (!whisperUsers.has(key)) whisperUsers.set(key, u)
            }
          }
          if (data.lastKey) lastWhisperKey = data.lastKey
        }

        // Migrate v1 format (per-conversation) into timeline
        const v1 = stored.hs_whispers
        if (v1 && typeof v1 === 'object' && !v1.timeline) {
          for (const [key, conv] of Object.entries(v1)) {
            if (!conv || !conv.msgs) continue
            whisperUsersSet(key, {
              platform: conv.platform || (key.startsWith('hs:') ? 'heatsync' : 'twitch'),
              userId: conv.userId,
              displayName: conv.displayName,
              color: conv.color || '#fff',
            })
            for (const m of conv.msgs) {
              if (whisperTimeline.some((e) => e.time === m.time && e.text === m.text)) continue
              whisperTimeline.push({
                user: m.self ? 'you' : m.user,
                text: m.text,
                color: m.color || '#fff',
                time: m.time,
                self: !!m.self,
                platform: conv.platform || (key.startsWith('hs:') ? 'heatsync' : 'twitch'),
                key,
              })
            }
          }
          whisperTimeline.sort((a, b) => a.time - b.time)
          trimWhisperTimeline()
          // Clean up v1
          try {
            chrome.storage.local.remove('hs_whispers')
          } catch {}
          whisperSaveDebounced()
        }

        // Re-derive latestAt from any unread on disk so red-dot survives boot.
        const newest = whisperTimeline.reduce((mx, m) => (!m.self && m.time > mx ? m.time : mx), 0)
        if (newest > 0) noteSeenEvent('whispers', newest)
        refreshSeenBadges()
      })
      .catch((e) => warn('whispers load (storage.get) failed:', e?.message))
  } catch (e) {
    warn('whispers load failed:', e?.message)
  }
}

function handleIncomingWhisper(msg) {
  // Blocked users can't reach you via Twitch whisper — no timeline entry, no
  // red-dot/badge, no popup. (These arrive straight from Twitch EventSub/IRC,
  // so there's no server-side gate like HeatSync DMs have.) Checked BEFORE the
  // dedup mark so unblocking mid-session lets a later re-delivery surface.
  if (typeof isUserBlocked === 'function' && isUserBlocked(msg.user, 'twitch')) return
  // O(1) dedup that also collapses dual IRC↔EventSub delivery when ID is missing
  if (_whisperMarkSeen(_whisperDedupKey('twitch', msg.id, msg.user, msg.time, msg.text))) return

  const key = `twitch:${msg.user.toLowerCase()}`
  whisperUsersSet(key, {
    platform: 'twitch',
    userId: msg.userId,
    displayName: msg.user,
    color: msg.color,
  })

  whisperTimeline.push({
    user: msg.user,
    text: msg.text,
    color: msg.color,
    time: msg.time,
    self: false,
    platform: 'twitch',
    key,
    id: msg.id || '',
  })
  trimWhisperTimeline()
  lastWhisperKey = key

  noteSeenEvent('whispers', msg.time || Date.now())
  if (currentTab === 'whispers') {
    bumpSeen('whispers')
    renderWhispersTab()
  } else {
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: msg.user,
      userId: msg.userId,
      text: msg.text,
      color: msg.color,
      time: msg.time,
      platform: 'twitch',
    })
  }
  whisperSaveDebounced()
}

function handleIncomingDm(data) {
  const time = data.created_at ? new Date(data.created_at).getTime() : Date.now()
  if (_whisperMarkSeen(_whisperDedupKey('heatsync', data.id, data.from_display_name, time, data.content))) return
  const key = `hs:${data.from_user_id}`
  whisperUsersSet(key, {
    platform: 'heatsync',
    userId: data.from_user_id,
    displayName: data.from_display_name,
    color: data.from_color || '#ff8700',
  })

  whisperTimeline.push({
    user: data.from_display_name,
    text: data.content,
    color: data.from_color || '#ff8700',
    time,
    self: false,
    platform: 'heatsync',
    key,
    id: data.id || '',
  })
  trimWhisperTimeline()
  lastWhisperKey = key

  noteSeenEvent('whispers', time)
  if (currentTab === 'whispers') {
    bumpSeen('whispers')
    renderWhispersTab()
  } else {
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: data.from_display_name,
      text: data.content,
      color: data.from_color || '#ff8700',
      time,
      platform: 'heatsync',
    })
  }
  whisperSaveDebounced()
}

// Direct whisper using the page's twitch.tv session. Sends from whichever
// Twitch acct is logged in on twitch.tv, independent of any HS JWT.
//
// Must ride Twitch's OWN Apollo client (MAIN-world apolloMutate). A direct
// gql.twitch.tv POST — even with a freshly-minted Client-Integrity JWT — gets
// rejected as "failed integrity check"; the token only validates when attached
// via Apollo's link chain (fingerprint + session correlation). The SendWhisper
// Document is loaded from Twitch's webpack by searchTerm. Mirrors _followMutation.
async function sendTwitchWhisperDirect(toUserId, message) {
  const { token } = await getTwitchAuthTokenAsync()
  if (!token) return { ok: false, noToken: true }
  const nonce = crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  const variables = { input: { recipientUserID: String(toUserId), message: String(message), nonce } }
  const result = await apolloMutate({ searchTerm: 'SendWhisper', variables, resultField: 'sendWhisper' })
  if (result?.ok) return { ok: true }
  const errMsg = String(result?.error || 'whisper failed')
  return { ok: false, error: errMsg, integrity: /integrity/i.test(errMsg) }
}

// Whisper send: heatsync server proxy (Helix /helix/whispers with the user's
// stored Twitch OAuth + user:manage:whispers scope) is the primary path —
// ToS-clean and works from any origin since it doesn't need Client-Integrity.
//
// Direct GQL fallback only runs on twitch.tv pages where the MAIN-world proxy
// can mint a Client-Integrity JWT. Off twitch.tv (kick.com, youtube.com) the
// integrity service rejects mutations as "failed integrity check" no matter
// what, so the fallback is structurally dead and we short-circuit it to
// surface the real proxy error (usually "log in to heatsync" / "link twitch")
// instead of a misleading integrity message.
//
// On-twitch fallback still covers: (1) heatsync server unreachable, (2) the
// user's heatsync-linked Twitch account differs from the active twitch.tv
// session and they want to whisper-from the active session.
async function sendTwitchWhisper(toUserId, message) {
  const onTwitch = _isOnTwitchPage()

  let serverResp = null
  let serverThrew = false
  try {
    serverResp = await apiFetch('/api/twitch/whisper', {
      method: 'POST',
      body: { toUserId, message },
    })
    if (serverResp?.ok) return { ok: true }
  } catch (e) {
    serverThrew = true
  }

  const respStatus = Number(serverResp?.status) || 0
  const respError = String(serverResp?.error || '')
  const isAuthFail = respStatus === 401 && /no twitch token|not authenticated|re-login/i.test(respError)

  // Off twitch.tv: direct GQL can't get integrity, so don't pretend to retry.
  // Surface the real proxy error — actionable for the user.
  if (!onTwitch) {
    if (isAuthFail) {
      showToast(t('mc_whisper_login'), 'error')
      return { ok: false, error: 'log in to heatsync.org to send whispers', errorKind: 'auth' }
    }
    if (serverThrew || respStatus >= 500 || !serverResp) {
      const msg = 'heatsync server unreachable'
      showToast('whisper failed: ' + msg, 'error')
      return { ok: false, error: msg, errorKind: 'server' }
    }
    const errText = respError || `twitch error ${respStatus}`
    showToast('whisper failed: ' + errText, 'error')
    return { ok: false, error: errText }
  }

  // On twitch.tv: direct GQL fallback. Integrity mintable here.
  try {
    const direct = await sendTwitchWhisperDirect(toUserId, message)
    if (direct.ok) return { ok: true }
    if (direct.noToken) {
      showToast(t('mc_whisper_login'), 'error')
      return { ok: false, error: 'no twitch session', errorKind: 'auth' }
    }
    showToast('whisper failed: ' + (direct.error || 'unknown'), 'error')
    return { ok: false, error: direct.error || 'unknown' }
  } catch (e) {
    showToast('whisper failed: ' + e.message, 'error')
    return { ok: false, error: e.message }
  }
}

async function sendWhisperMessage(key, text) {
  const userInfo = whisperUsers.get(key)
  if (!userInfo) {
    showToast('unknown user — whisper someone first', 'error')
    return
  }

  // Optimistic: show message with pending status. Reference kept so we can
  // flip status to 'sent' or 'failed' once the network resolves.
  const sendId = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const msg = {
    user: 'you',
    text,
    color: '#808080',
    time: Date.now(),
    self: true,
    platform: userInfo.platform,
    key,
    status: 'pending',
    sendId,
  }
  whisperTimeline.push(msg)
  trimWhisperTimeline()
  lastWhisperKey = key

  if (currentTab === 'whispers') renderWhispersTab()
  whisperSaveDebounced()

  let ok = false
  let errMsg = ''
  let errorKind = ''
  try {
    if (key.startsWith('twitch:')) {
      const resp = await sendTwitchWhisper(userInfo.userId, text)
      ok = !!resp.ok
      errMsg = resp.error || ''
      errorKind = resp.errorKind || ''
    } else if (key.startsWith('hs:')) {
      const toUserId = key.slice(3)
      const resp = await apiFetch('/api/dm', { method: 'POST', body: { toUserId, content: text } })
      ok = !!resp.ok
      errMsg = resp.error || (ok ? '' : 'unknown error')
      if (!ok && resp?.status === 401) errorKind = 'auth'
    }
  } catch (e) {
    ok = false
    errMsg = e.message
  }

  // Mutate the original push (still referenced by sendId) so re-renders pick up state.
  msg.status = ok ? 'sent' : 'failed'
  if (!ok) {
    msg.error = errMsg
    if (errorKind) msg.errorKind = errorKind
  }
  if (currentTab === 'whispers') renderWhispersTab()
  whisperSaveDebounced()
}

// Auto-retry queued auth-failed whispers when auth comes back online.
// Bound to storage.onChanged on first call; safe to call repeatedly.
function retryAuthFailedWhispers() {
  const failed = whisperTimeline.filter((m) => m.status === 'failed' && m.errorKind === 'auth' && m.sendId)
  if (!failed.length) return
  log(`[whispers] auth restored — retrying ${failed.length} queued send(s)`)
  // Stagger retries so we don't burst the helix endpoint.
  failed.forEach((m, i) => {
    cleanup.setTimeout(() => retryWhisperSend(m.sendId), i * 250)
  })
}

async function retryWhisperSend(sendId) {
  const idx = whisperTimeline.findIndex((m) => m.sendId === sendId)
  if (idx < 0) return
  const old = whisperTimeline[idx]
  if (old.status !== 'failed') return
  // Remove the failed entry — sendWhisperMessage will push a fresh pending one.
  whisperTimeline.splice(idx, 1)
  await sendWhisperMessage(old.key, old.text)
}

function renderWhispersTab() {
  if (typeof activeProfileCard !== 'undefined' && activeProfileCard) return
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl) return
  resolveSelfColor()

  // Fetch HS DMs on first render to backfill timeline
  if (!whisperDmsLoaded && hsAuthToken) {
    whisperDmsLoaded = true
    apiFetch('/api/dm')
      .then((resp) => {
        if (!resp.ok || !Array.isArray(resp.data)) return
        for (const dm of resp.data) {
          const key = `hs:${dm.other_user_id}`
          whisperUsersSet(key, {
            platform: 'heatsync',
            userId: dm.other_user_id,
            displayName: dm.other_display_name,
            color: dm.other_color || '#ff8700',
          })
          // Fetch recent messages for each conversation
          apiFetch(`/api/dm/${dm.other_user_id}`)
            .then((resp2) => {
              if (!resp2.ok || !Array.isArray(resp2.data)) return
              let added = false
              for (const m of resp2.data) {
                const t = new Date(m.created_at).getTime()
                if (_whisperMarkSeen(_whisperDedupKey('heatsync', m.id, m.from_display_name, t, m.content))) continue
                const isSelf = m.from_user_id !== dm.other_user_id
                whisperTimeline.push({
                  user: isSelf ? 'you' : dm.other_display_name,
                  text: m.content,
                  color: isSelf ? '#808080' : dm.other_color || '#ff8700',
                  time: t,
                  self: isSelf,
                  platform: 'heatsync',
                  key,
                  id: m.id || '',
                })
                added = true
              }
              if (added) {
                whisperTimeline.sort((a, b) => a.time - b.time)
                trimWhisperTimeline()
                if (currentTab === 'whispers') renderWhispersTab()
                whisperSaveDebounced()
              }
            })
            .catch((e) => log('[whispers] dm history fetch failed:', e?.message || e))
        }
      })
      .catch((e) => {
        whisperDmsLoaded = false
        log('[whispers] dm list fetch failed:', e?.message || e)
      })
  }

  // Mark as read — server-backed, fans out to other clients via WS.
  bumpSeen('whispers')
  whisperSaveDebounced()

  if (whisperTimeline.length === 0) {
    msgsEl.replaceChildren()
    const emptyDiv = document.createElement('div')
    emptyDiv.className = 'hs-mc-empty'
    // Skeleton while the DM history fetch is in flight — prevents the empty
    // hint from flashing for a beat before the actual conversations render.
    // Only relevant on first whispers-tab open with auth + no cached timeline.
    if (whisperDmsLoaded && hsAuthToken) {
      emptyDiv.textContent = t('common_loading') || 'loading…'
    } else {
      emptyDiv.textContent = t('mc_whisper_hint')
    }
    msgsEl.appendChild(emptyDiv)
    return
  }

  msgsEl.replaceChildren()
  const frag = document.createDocumentFragment()
  const toRender = whisperTimeline.slice(-150)
  let zebraCount = 0

  for (const m of toRender) {
    const div = document.createElement('div')
    let cls = m.self ? 'hs-mc-msg hs-whisper-self' : 'hs-mc-msg'
    if (m.status === 'pending') cls += ' hs-whisper-pending'
    else if (m.status === 'failed') cls += ' hs-whisper-failed'
    div.className = cls
    if (m.sendId) div.dataset.sendId = m.sendId
    if (zebraEnabled && ++zebraCount % 2 === 0) div.classList.add('hs-mc-zebra')

    const ts = formatTimeFromTs(m.time)
    const tsHtml = ts ? `<span class="hs-mc-ts">${ts}</span>` : ''
    const platColor = m.platform === 'twitch' ? '#9146ff' : '#ff8700'
    const platTag = m.platform === 'twitch' ? 'T' : 'HS'
    const arrow = m.self ? '\u2192' : '\u2190'

    // Show sender -> recipient for both directions
    const target = whisperUsers.get(m.key)
    const me = currentUsername || 'you'
    const myColor = sanitizeColor(selfWhisperColor || '#fff')
    const them = target?.displayName || m.user || m.key
    const theirColor = target ? sanitizeColor(target.color) : sanitizeColor(m.color)
    const theirUsername = (target?.displayName || m.user || '').toLowerCase()

    // Build username links with hs-mc-user class for tooltip + click.
    // Paint the name with the user's 7TV cosmetic when known (Twitch only —
    // heatsync ids aren't 7TV-keyed); falls back to their plain color.
    function userLink(name, color, username, uid) {
      const safe = escapeHtml(name)
      const lower = username.toLowerCase()
      const safeUser = escapeHtml(lower)
      const href =
        m.platform === 'heatsync'
          ? `https://heatsync.org/user/${encodeURIComponent(username)}`
          : `https://heatsync.org/twitch/${encodeURIComponent(username)}`
      const paint = m.platform === 'heatsync' ? '' : userPaintStyle(uid, lower)
      const style = paint || `color:${color};font-weight:600`
      return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="hs-mc-user" data-username="${safeUser}" style="${style}">${safe}</a>`
    }

    const themUid = target?.userId || ''
    const senderLink = m.self ? userLink(me, myColor, me, '') : userLink(them, theirColor, theirUsername, themUid)
    const recipientLink = m.self ? userLink(them, theirColor, theirUsername, themUid) : userLink(me, myColor, me, '')

    let statusHtml = ''
    if (m.status === 'pending') {
      statusHtml = ` <span class="hs-whisper-status" title="sending">…</span>`
    } else if (m.status === 'failed') {
      const errSafe = escapeHtml(m.error || 'failed')
      const idSafe = escapeHtml(m.sendId || '')
      if (m.errorKind === 'auth') {
        statusHtml = ` <a href="https://heatsync.org/api/auth/login?return_to=%2Fhome%2Fhot" target="_blank" rel="noopener noreferrer" class="hs-whisper-status hs-whisper-relogin" title="${errSafe} — click to log in on heatsync">⚠ log in on heatsync to send</a>`
      } else {
        statusHtml = ` <span class="hs-whisper-status hs-whisper-retry" title="click to retry" data-retry="${idSafe}">⚠ ${errSafe} — retry</span>`
      }
    }

    // All dynamic values pass through escapeHtml/sanitizeColor — safe innerHTML (all values escaped above)
    div.innerHTML = `${tsHtml}<span style="color:${platColor};font-size:13px;font-weight:700">[${platTag}]</span> ${senderLink} <span style="color:#808080">-&gt;</span> ${recipientLink}: ${highlightHashtagsInHtml(processEmotes(escapeHtml(m.text), null))}${statusHtml}`
    frag.appendChild(div)
  }

  msgsEl.appendChild(frag)
  msgsEl.scrollTop = msgsEl.scrollHeight

  msgsEl.querySelectorAll('.hs-whisper-retry').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const id = el.getAttribute('data-retry')
      if (id) retryWhisperSend(id)
    })
  })
}
