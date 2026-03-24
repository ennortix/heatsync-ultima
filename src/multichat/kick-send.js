// Kick chat sending — routes through background.js → kick.com tab content script

const kickChannelIdCache = new Map()

async function resolveKickChannelId(slug) {
  if (kickChannelIdCache.has(slug)) return kickChannelIdCache.get(slug)
  const resp = await safeSendMessage({ type: 'kick_resolve_channel', slug })
  if (resp?.channelId) {
    kickChannelIdCache.set(slug, resp.channelId)
    return resp.channelId
  }
  return null
}

async function sendKickMessage(kickSlug, text) {
  const channelId = await resolveKickChannelId(kickSlug)
  if (!channelId) return 'no_channel'
  try {
    const resp = await safeSendMessage({ type: 'kick_send_message', channelId, content: text })
    if (resp?.ok) return true
    return resp?.error || 'send_failed'
  } catch (e) {
    log('Kick send error:', e.message)
    return 'send_failed'
  }
}
