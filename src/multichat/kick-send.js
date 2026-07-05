// Kick chat sending — routes through background.js → kick.com tab content script

const kickChannelIdCache = new Map()
const KICK_CHANNEL_ID_CACHE_MAX = 200

// Failures we never retry — they're user-actionable, not transient.
const KICK_FATAL_SEND_ERRORS = new Set(['no_channel', 'no_kick_tab', 'kick_not_logged_in', 'missing params'])

const KICK_SEND_TIMEOUT_MS = 5000
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
