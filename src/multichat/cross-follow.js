// Cross-platform follow propagation
//
// When the user follows another user on heatsync, also follow them on Twitch
// and Kick if they have linked accounts there. Twitch's public follow REST
// API was killed Aug 2023; we use the same private GraphQL mutation
// (FollowButton_FollowUser) that Twitch's own UI fires, through the existing
// integrity/relay plumbing in twitch-api.js. Kick has no public follow
// endpoint at all; we POST /api/v2/channels/{slug}/follow with the user's
// own session cookie + XSRF token (same surface as our chat-send relay).
//
// YouTube is intentionally NOT propagated — the Innertube subscribe path
// requires SAPISIDHASH minting in a youtube.com tab, has the highest ToS
// risk of the three, and youtube tabs are rare for HeatSync's user base.
//
// Failure handling: heatsync follow is the source of truth. Platform follows
// are best-effort. If we can't reach a platform right now (no twitch.tv tab
// open + integrity unavailable, kick not logged in, etc.), the action is
// queued to chrome.storage.local.hs_pending_follows and drained on next
// platform tab navigation. The queue collapses follow/unfollow pairs (last
// write wins), caps at 100 entries, and drops items older than 7 days.

const HS_PENDING_KEY = 'hs_pending_follows'
const HS_PENDING_MAX = 100
const HS_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

// Per-platform user preference. Defaults all on. Read from ui_settings on
// each call so toggling in settings UI applies without a reload.
async function _crossFollowSettings() {
  try {
    // api.storage.local.get returns a Promise directly — don't wrap it with a
    // callback shim or it hangs forever. (Earlier version wrapped it; the
    // callback never fired because api.storage's get is promise-based.)
    const stored = await api.storage.local.get(['ui_settings'])
    const ui = stored?.ui_settings || {}
    return {
      twitch: ui.crossFollowTwitch !== false,
      kick: ui.crossFollowKick !== false,
      twitchNotifyTarget: ui.crossFollowTwitchNotify !== false
    }
  } catch {
    return { twitch: true, kick: true, twitchNotifyTarget: true }
  }
}

// ─── Queue helpers ──────────────────────────────────────────────────────────

async function _readQueue() {
  try {
    const stored = await api.storage.local.get([HS_PENDING_KEY])
    const arr = Array.isArray(stored?.[HS_PENDING_KEY]) ? stored[HS_PENDING_KEY] : []
    const cutoff = Date.now() - HS_PENDING_MAX_AGE_MS
    const fresh = arr.filter(x => x && typeof x.ts === 'number' && x.ts >= cutoff)
    return fresh.slice(-HS_PENDING_MAX)
  } catch {
    return []
  }
}

async function _writeQueue(arr) {
  try {
    await api.storage.local.set({ [HS_PENDING_KEY]: arr })
  } catch {}
}

// Insert / replace. If a previous entry for the same {platform, target}
// exists, the newer one supersedes it — last write wins, so follow/unfollow
// rapid toggles collapse rather than queueing both.
async function _enqueue(item) {
  if (!item?.platform || !item?.target) return
  const q = await _readQueue()
  const filtered = q.filter(x => !(x.platform === item.platform && x.target === item.target))
  filtered.push({ ...item, ts: Date.now() })
  await _writeQueue(filtered.slice(-HS_PENDING_MAX))
}

async function _dequeueMatching(platform, target) {
  const q = await _readQueue()
  const filtered = q.filter(x => !(x.platform === platform && x.target === target))
  if (filtered.length !== q.length) await _writeQueue(filtered)
}

// Drain all pending items for a platform. Called from background SW after it
// detects the user navigated to twitch.com / kick.com (or by hand via a
// debug command). Each item gets one retry; if it fails again, stays queued.
async function drainPendingFollows(platform) {
  if (!platform) return { ok: false, drained: 0 }
  const q = await _readQueue()
  const mine = q.filter(x => x.platform === platform)
  if (!mine.length) return { ok: true, drained: 0 }
  let drained = 0
  const drainedItems = []
  for (const item of mine) {
    let result = { error: 'unknown platform' }
    if (platform === 'twitch') {
      // Use _twitchFollow (full chain incl. DOM-click) when slug available,
      // otherwise fall back to id-only path which only attempts the GQL routes.
      if (item.username) {
        result = await _twitchFollow(item.target, item.action === 'follow', item.disableNotifications, item.username)
      } else {
        result = await (typeof followTwitchUserById === 'function'
          ? followTwitchUserById(item.target, item.action === 'follow', item.disableNotifications)
          : { error: 'no helper' })
      }
    } else if (platform === 'kick') {
      result = await _kickFollow(item.target, item.action === 'follow')
    }
    if (result?.ok) {
      drained++
      drainedItems.push(item)
      await _dequeueMatching(platform, item.target)
    }
  }
  // Log drain attempt outcome — useful to see in console why a pending follow
  // didn't sync (e.g. apollo path failed silently). One line per drain cycle.
  try {
    if (mine.length) console.warn('[heatsync] drained', platform, drained, 'of', mine.length, 'pending')
  } catch {}
  // Soft success toast so the user knows their queued follows just synced.
  if (drained > 0 && typeof showToast === 'function') {
    const sample = drainedItems[0]?.username || drainedItems[0]?.target || ''
    const verb = drainedItems[0]?.action === 'unfollow' ? 'unfollowed' : 'followed'
    if (drained === 1 && sample) {
      showToast(`${verb} ${sample} on ${platform}`, 'success')
    } else {
      showToast(`synced ${drained} pending ${platform} follow(s)`, 'success')
    }
  }
  return { ok: true, drained }
}

// Expose for background SW: a content-script listener that drains on demand.
if (typeof api !== 'undefined' && api?.runtime?.onMessage) {
  api.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'cross_follow_drain' && typeof msg.platform === 'string') {
      drainPendingFollows(msg.platform).then(sendResponse).catch(e => sendResponse({ ok: false, error: e?.message }))
      return true
    }
    return false
  })
}

// ─── Kick follow ────────────────────────────────────────────────────────────
//
// SW direct fetch with credentials:include + XSRF cookie. No relay needed
// since the extension has host_permissions for kick.com/* and the user's
// own session cookie travels naturally. If XSRF missing → kick not logged
// in → queue.

async function _kickFollow(slug, follow) {
  if (!slug) return { error: 'no slug' }
  const safeSlug = String(slug).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 64)
  if (!safeSlug) return { error: 'invalid slug' }
  try {
    const resp = await safeSendMessage({
      type: 'kick_follow',
      slug: safeSlug,
      follow: !!follow
    })
    if (resp?.ok) return { ok: true, idempotent: !!resp.idempotent }
    if (resp?.error === 'kick_not_logged_in') return { error: 'kick_not_logged_in', queueable: true }
    return { error: resp?.error || 'kick follow failed', queueable: true }
  } catch (e) {
    return { error: e?.message || 'kick follow throw', queueable: true }
  }
}

// ─── Twitch follow ──────────────────────────────────────────────────────────
//
// Twitch's anti-bot blocks ALL programmatic follow paths:
//   - GQL with captured / minted integrity → "failed integrity check"
//   - Apollo client finder → broken on current Twitch (bundle refactored)
//   - Synthetic button click → React ignores (isTrusted check)
//   - Fiber onClick invocation → renderer hangs
// Per empirical testing (2026-05). Twitch wants real user gestures on their
// channel page. We provide an "open twitch page" link in the profile card
// instead so the user can click follow there themselves — see profile-card.js.
//
// This stub returns silently — heatsync follow is the source of truth; the
// twitch side is opt-in manual via the profile card link.
async function _twitchFollow(_targetID, _follow, _disableNotifications, _targetSlug) {
  return { skipped: 'manual_follow_only' }
}

// ─── Main entry: called from pcToggleFollow + pcToggleBlock ─────────────────
//
// target shape: { twitch_id, twitch_username, kick_username, youtube_channel_id, youtube_username }
// follow=true → propagate follow; follow=false → propagate unfollow.
// Returns: { twitch: {...}, kick: {...} } — caller can surface diagnostics
// in dev mode but the default UX is silent best-effort.
async function propagateFollow(follow, target) {
  if (!target) return { kick: { skipped: 'no target' } }
  const settings = await _crossFollowSettings()
  const out = { kick: { skipped: 'no kick username' } }

  // Twitch propagation is no longer programmatic — anti-bot blocks every
  // viable path. Users follow on twitch via the profile card's "open on
  // twitch" link, which navigates to the channel page where they can click
  // the native follow button themselves. Heatsync follow remains the source
  // of truth regardless.

  if (settings.kick && target.kick_username) {
    const verb = follow ? 'follow' : 'unfollow'
    const r = await _kickFollow(target.kick_username, follow)
    if (r?.ok) {
      out.kick = { ok: true, idempotent: !!r.idempotent }
      await _dequeueMatching('kick', String(target.kick_username).toLowerCase())
    } else {
      out.kick = { error: r?.error || 'kick follow failed' }
      if (r?.queueable) {
        await _enqueue({
          platform: 'kick',
          target: String(target.kick_username).toLowerCase(),
          action: follow ? 'follow' : 'unfollow'
        })
      }
      // Surface only login-needed; treat other transient kick errors as silent
      // (heatsync follow already toasted; we don't want noise on each follow).
      if (r?.error === 'kick_not_logged_in' && typeof showToast === 'function') {
        showToast(`kick ${verb} queued — will sync when you log in to kick.com`, 'info')
      }
    }
  }
  return out
}
