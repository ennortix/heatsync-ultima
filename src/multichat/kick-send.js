// Kick chat sending — routes through background.js → kick.com tab content script

const kickChannelIdCache = new Map()
const KICK_CHANNEL_ID_CACHE_MAX = 200

// Failures we never retry — they're user-actionable, not transient.
const KICK_FATAL_SEND_ERRORS = new Set(['no_channel', 'no_kick_tab', 'kick_not_logged_in', 'missing params'])

// Exceeds the relay POST's own AbortSignal.timeout (10s in content.js
// kick_send_relay) so a timeout here means the POST is done waiting too.
//
// It does NOT mean the send didn't happen. Aborting only stops the client
// listening for the response — if kick already accepted the POST and the
// reply was merely slow, the message IS in chat. Kick's send API has no
// idempotency key, so there is no way to retry without risking a double
// post. This used to auto-retry on the claim that outwaiting the abort made
// the first attempt "dead"; it doesn't, and the guarantee was fiction. A
// timeout now returns unconfirmed and stops, and the user decides.
const KICK_SEND_TIMEOUT_MS = 11000
const KICK_SEND_RETRY_BACKOFF_MS = [750, 1500]

async function resolveKickChannelId(slug) {
  if (kickChannelIdCache.has(slug)) return kickChannelIdCache.get(slug)
  const resp = await safeSendMessage({ type: 'kick_resolve_channel', slug })
  if (resp?.channelId) {
    if (kickChannelIdCache.size >= KICK_CHANNEL_ID_CACHE_MAX) {
      kickChannelIdCache.delete(kickChannelIdCache.keys().next().value)
    }
    kickChannelIdCache.set(slug, resp.channelId)
    return resp.channelId
  }
  return null
}

function _kickSendOnce(channelId, text, reply = null) {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ok: false, error: 'timeout' })
    }, KICK_SEND_TIMEOUT_MS)
    safeSendMessage({ type: 'kick_send_message', channelId, content: text, reply })
      .then((resp) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(resp || { ok: false, error: 'no_response' })
      })
      .catch((e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve({ ok: false, error: e?.message || 'send_failed' })
      })
  })
}

async function sendKickMessage(kickSlug, text, reply = null) {
  const channelId = await resolveKickChannelId(kickSlug)
  if (!channelId) return 'no_channel'
  let lastErr = 'send_failed'
  let replyRef = reply
  for (let attempt = 0; attempt <= KICK_SEND_RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const resp = await _kickSendOnce(channelId, text, replyRef)
      if (resp?.ok) return true
      const err = resp?.error || 'send_failed'
      lastErr = err
      // Reply-shaped send rejected by kick (4xx) → the message itself is fine,
      // only the threading ref was refused. Deliver flat rather than fail.
      if (replyRef && /^4\d\d:/.test(err)) {
        replyRef = null
        attempt-- // the flat resend shouldn't consume a retry slot
        continue
      }
      // Unresolved, not failed — see KICK_SEND_TIMEOUT_MS. Never auto-retried.
      if (err === 'timeout') return 'kick_unconfirmed'
      if (KICK_FATAL_SEND_ERRORS.has(err)) return err
      if (attempt < KICK_SEND_RETRY_BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, KICK_SEND_RETRY_BACKOFF_MS[attempt]))
        continue
      }
      return err
    } catch (e) {
      lastErr = e?.message || 'send_failed'
      if (attempt < KICK_SEND_RETRY_BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, KICK_SEND_RETRY_BACKOFF_MS[attempt]))
        continue
      }
      log('Kick send error after retries:', lastErr)
      return 'send_failed'
    }
  }
  return lastErr
}

// ─── Kick chat modes ────────────────────────────────────────────────────────
// PUT /api/v1/chatrooms/<chatroomId>, relayed through a kick.com tab (kick's
// mutations need that tab's cookies + XSRF + bearer). Both halves were found
// read-only on 2026-07-21: a GET on the route answers 405 "Supported methods:
// PUT", and GET /api/v2/channels/<slug>/chatroom returns the live mode state.
//
// The body mirrors that read shape (laravel resource symmetry). Since a wrong
// shape could be accepted-and-ignored, every set is CONFIRMED by reading the
// chatroom back — we only report success when kick actually changed. Same
// contract as twitch's setTwitchChatMode.
const KICK_CHAT_MODE_KEYS = {
  slow: 'slow_mode',
  followers: 'followers_mode',
  subscribers: 'subscribers_mode',
  emoteonly: 'emotes_mode',
}

// mode → the body kick expects. slow carries seconds, followers minutes.
function kickChatModeBody(mode, value) {
  const key = KICK_CHAT_MODE_KEYS[mode]
  if (!key) return null
  if (mode === 'slow') {
    const secs = Math.max(0, Number(value) || 0)
    return { [key]: secs > 0 ? { enabled: true, message_interval: secs } : { enabled: false, message_interval: 0 } }
  }
  if (mode === 'followers') {
    // twitch encodes "off" as -1; kick wants enabled:false. 0 minutes = on with
    // no age gate, which kick expresses as enabled:true + min_duration 0.
    const mins = Number(value)
    return {
      [key]: mins < 0 ? { enabled: false, min_duration: 0 } : { enabled: true, min_duration: Math.max(0, mins) },
    }
  }
  return { [key]: { enabled: !!value } }
}

// Read the live modes back. Public endpoint, no auth — the confirmation oracle.
async function readKickChatModes(slug) {
  try {
    const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/chatroom`, {
      headers: { accept: 'application/json' },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

function kickChatModeMatches(mode, value, state) {
  const key = KICK_CHAT_MODE_KEYS[mode]
  const node = state?.[key]
  if (!node || typeof node !== 'object') return false
  if (mode === 'slow') {
    const secs = Math.max(0, Number(value) || 0)
    return secs > 0 ? !!node.enabled && Number(node.message_interval) === secs : !node.enabled
  }
  if (mode === 'followers') {
    const mins = Number(value)
    return mins < 0 ? !node.enabled : !!node.enabled && Number(node.min_duration) === Math.max(0, mins)
  }
  return !!node.enabled === !!value
}

async function setKickChatMode(slug, mode, value) {
  const body = kickChatModeBody(mode, value)
  if (!body) return { ok: false, error: 'kick has no such chat mode' }
  // BG resolves + caches the chatroom id (kick_chatroom_id); the public
  // chatroom read is the fallback so a cold SW can't block a mod action.
  let chatroomId = null
  try {
    chatroomId = (await safeSendMessage({ type: 'kick_chatroom_id', slug }))?.id || null
  } catch {}
  if (!chatroomId) chatroomId = (await readKickChatModes(slug))?.id || null
  if (!chatroomId) return { ok: false, error: 'kick chatroom not found' }
  const resp = await safeSendMessage({ type: 'kick_set_chat_mode', chatroomId, body })
  if (!resp?.ok) return { ok: false, error: resp?.error || 'kick_set_failed' }
  // Confirm — a PUT kick accepted but ignored must never read as success.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 400))
    const state = await readKickChatModes(slug)
    if (!state) continue
    if (kickChatModeMatches(mode, value, state)) return { ok: true }
  }
  return { ok: false, error: 'kick did not apply it (mod rights?)' }
}
