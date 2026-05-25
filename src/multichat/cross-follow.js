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
    const stored = await new Promise(r => api.storage.local.get(['ui_settings'], r))
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
    const stored = await new Promise(r => api.storage.local.get([HS_PENDING_KEY], r))
    const arr = Array.isArray(stored?.[HS_PENDING_KEY]) ? stored[HS_PENDING_KEY] : []
    // Drop stale + cap at HS_PENDING_MAX (oldest first)
    const cutoff = Date.now() - HS_PENDING_MAX_AGE_MS
    const fresh = arr.filter(x => x && typeof x.ts === 'number' && x.ts >= cutoff)
    return fresh.slice(-HS_PENDING_MAX)
  } catch {
    return []
  }
}

async function _writeQueue(arr) {
  try {
    await new Promise(r => api.storage.local.set({ [HS_PENDING_KEY]: arr }, r))
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
  for (const item of mine) {
    let result = { error: 'unknown platform' }
    if (platform === 'twitch') {
      result = await (typeof followTwitchUserById === 'function'
        ? followTwitchUserById(item.target, item.action === 'follow', item.disableNotifications)
        : { error: 'no helper' })
    } else if (platform === 'kick') {
      result = await _kickFollow(item.target, item.action === 'follow')
    }
    if (result?.ok) { drained++; await _dequeueMatching(platform, item.target) }
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
// Preferred path: SW direct fetch with twitch auth cookie + minted integrity
// JWT. Works from ANY tab (kick.com, youtube, heatsync.org, etc.) — no
// twitch.tv tab required. SW reads twitch auth cookies, mints integrity via
// /integrity, fires the FollowButton GQL with the seeded persisted-query hash.
//
// Fallback: on-twitch in-page apolloMutate (when user IS on twitch.tv, the
// MAIN-world integrity is fresh + locally-minted device-id matches), then
// twitch_relay to any open twitch.tv tab.
//
// Queue: integrity_check_failed / twitch_not_logged_in / no_twitch_tab all
// get queued for a later retry when the user opens a twitch.tv tab (drain
// triggers via tabs.onUpdated).
async function _twitchFollow(targetID, follow, disableNotifications) {
  if (!targetID) return { error: 'no target id' }

  // Try SW-direct first — fastest, works from any context.
  try {
    const swResp = await safeSendMessage({
      type: 'twitch_follow_direct',
      targetID,
      follow: !!follow,
      disableNotifications: !!disableNotifications,
    })
    if (swResp?.ok) return { ok: true, idempotent: !!swResp.idempotent }
    // twitch_not_logged_in is terminal — user needs to log in to twitch.
    if (swResp?.error === 'twitch_not_logged_in') return { error: 'twitch_not_logged_in', queueable: true }
    // 2fa_required is terminal — user has 2FA on state changes.
    if (swResp?.error === '2fa_required') return { error: '2fa_required' }
    // integrity_check_failed → fall through to in-page / relay path which has
    // a better device-id match.
  } catch (e) {
    // Network or SW error → fall through
  }

  // In-page / relay path (uses MAIN-world integrity, more reliable).
  if (typeof followTwitchUserById === 'function') {
    const r = await followTwitchUserById(targetID, follow, disableNotifications)
    if (r?.ok) return r
    return r || { error: 'twitch follow failed', queueable: true }
  }
  return { error: 'twitch helper missing', queueable: true }
}

// ─── Main entry: called from pcToggleFollow + pcToggleBlock ─────────────────
//
// target shape: { twitch_id, twitch_username, kick_username, youtube_channel_id, youtube_username }
// follow=true → propagate follow; follow=false → propagate unfollow.
// Returns: { twitch: {...}, kick: {...} } — caller can surface diagnostics
// in dev mode but the default UX is silent best-effort.
async function propagateFollow(follow, target) {
  console.warn('[hs-xf] ENTRY follow=', follow, 'target=', target)
  if (!target) return { twitch: { skipped: 'no target' }, kick: { skipped: 'no target' } }
  const settings = await _crossFollowSettings()
  console.warn('[hs-xf] settings=', settings)
  const tasks = []
  const out = { twitch: { skipped: 'no twitch id' }, kick: { skipped: 'no kick username' } }

  if (settings.twitch && target.twitch_id) {
    tasks.push((async () => {
      const r = await _twitchFollow(target.twitch_id, follow, !settings.twitchNotifyTarget)
      if (r?.ok) {
        out.twitch = { ok: true, idempotent: !!r.idempotent }
        await _dequeueMatching('twitch', String(target.twitch_id))
      } else {
        out.twitch = { error: r?.error || 'twitch follow failed' }
        if (r?.queueable) {
          await _enqueue({
            platform: 'twitch',
            target: String(target.twitch_id),
            action: follow ? 'follow' : 'unfollow',
            disableNotifications: !settings.twitchNotifyTarget,
            username: target.twitch_username || null
          })
        }
      }
    })())
  }

  if (settings.kick && target.kick_username) {
    tasks.push((async () => {
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
      }
    })())
  }

  if (tasks.length) await Promise.allSettled(tasks)
  try { console.warn('[hs-xfollow]', follow ? 'follow' : 'unfollow', target?.twitch_username || target?.kick_username || '?', out) } catch {}
  return out
}
