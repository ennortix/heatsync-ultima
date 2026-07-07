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
