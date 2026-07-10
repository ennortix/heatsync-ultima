// send-targets.js — pure helpers deciding which linked platforms a chat
// message should be sent to for a given multichat channel config.
//
// No import/export: this file is concatenated (not module-loaded) into the
// multichat-<platform>.js bundle alongside input.js/main.js/channel-mgmt.js
// (see build.js MULTICHAT_MODULES) — plain top-level function declarations
// are shared globals across the whole bundle.

/**
 * @param {{twitch?: boolean, kick?: boolean, youtube?: boolean}|null|undefined} sendTargets
 *   Per-channel override, as persisted on config.channels[].sendTargets. A
 *   platform key that is absent/undefined defaults to ON — a channel with no
 *   sendTargets config behaves identically to before this feature existed.
 * @param {{twitch?: boolean, kick?: boolean, youtube?: boolean}} linkedPlatforms
 *   Which platforms are actually linked to this channel (sendTargets can't
 *   turn on a platform that isn't linked).
 * @returns {{twitch: boolean, kick: boolean, youtube: boolean}}
 */
function resolveSendTargets(sendTargets, linkedPlatforms) {
  const linked = ['twitch', 'kick', 'youtube'].filter((p) => !!linkedPlatforms?.[p])
  const out = { twitch: false, kick: false, youtube: false }
  for (const p of linked) {
    out[p] = !sendTargets || sendTargets[p] !== false
  }
  // Bulletproof: a corrupted/emptied config can't silently swallow every
  // send — fall back to "all linked" rather than a message that goes nowhere.
  if (linked.length && !linked.some((p) => out[p])) {
    for (const p of linked) out[p] = true
  }
  return out
}

/**
 * Compute the next sendTargets object after toggling one platform on/off.
 * Seeds from "all currently linked platforms" the first time a channel's
 * sendTargets is touched, so flipping one platform never implicitly turns
 * off a platform the user hasn't interacted with (including one linked
 * later). Refuses to produce a config that disables every linked platform —
 * returns null in that case, which callers must treat as a no-op.
 * @param {{twitch?: boolean, kick?: boolean, youtube?: boolean}|null|undefined} currentSendTargets
 * @param {{twitch?: boolean, kick?: boolean, youtube?: boolean}} linkedPlatforms
 * @param {'twitch'|'kick'|'youtube'} platform
 * @param {boolean} enabled
 * @returns {{twitch?: boolean, kick?: boolean, youtube?: boolean}|null}
 */
function nextSendTargets(currentSendTargets, linkedPlatforms, platform, enabled) {
  if (!linkedPlatforms?.[platform]) return currentSendTargets || null
  const seeded = currentSendTargets
    ? { ...currentSendTargets }
    : Object.fromEntries(['twitch', 'kick', 'youtube'].filter((p) => linkedPlatforms[p]).map((p) => [p, true]))
  const next = { ...seeded, [platform]: enabled }
  const anyOn = ['twitch', 'kick', 'youtube'].some((p) => linkedPlatforms[p] && next[p] !== false)
  return anyOn ? next : null
}

/**
 * Pull the 11-char YouTube video id out of a watch / live / youtu.be url.
 * Returns '' for a bare channel url (/@handle, /channel/UC…, /@handle/live) —
 * those have NO fixed video id, and we must never hand background a guessed id
 * that could open (and send to) the wrong stream's chat. Only a concrete video
 * id ever comes back.
 * @param {string} url
 * @returns {string}
 */
function extractYoutubeVideoId(url) {
  const m = String(url || '').match(/(?:[?&]v=|\/live\/|\/shorts\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})(?![a-zA-Z0-9_-])/)
  return m ? m[1] : ''
}

/**
 * Map a YouTube send-relay error code → a short, lowercase, actionable line.
 * YouTube has no send API usable at scale (Data API ≈ 50 msgs/day per project),
 * so every send drives a real logged-in youtube.com tab; each failure is about
 * that tab — missing, logged-out, still loading, or YT refusing the message.
 * @param {string} err
 * @returns {string}
 */
function youtubeSendErrorMessage(err) {
  switch (err) {
    case 'no_youtube_tab':
    case 'no_video':
      return 'open the youtube stream to send'
    case 'chat_disabled':
      return 'log into youtube to send'
    case 'no_input':
      return 'youtube chat still loading — try again'
    case 'send_disabled':
      return 'youtube blocked the send (slow mode?)'
    case 'send_not_confirmed':
      return 'youtube didn’t confirm the send'
    case 'bridge_timeout':
      return 'couldn’t reach youtube chat — try again'
    default:
      return 'youtube send failed'
  }
}
