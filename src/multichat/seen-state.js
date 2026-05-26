// Seen-state — bulletproof unread indicators for mentions/whispers/home.
//
// Source of truth for "when did the user last view this tab" lives on the
// heatsync server (users.{mentions,whispers,home}_seen_at). On boot we GET
// /api/user/seen-state once, on tab-view we POST + the server fans the new
// timestamp out over WS to every other connected client (other tabs, ext on
// Twitch/Kick/YT). Clearing on one surface clears everywhere instantly.
//
// Local "latestAt" (the most recent event we've seen for each surface) lives
// in chrome.storage.local so a hard-refresh / reboot still shows the dot
// until the user views the tab. Cross-browser switch loses latestAt cache
// but new live events repopulate it; the cleared/uncleared state itself is
// always correct because that's server-backed.

// Surface names are server-canonical: the DB columns are
// {mentions,whispers,live}_seen_at and the web chat-tile uses the same set.
// The feed tab's surface is 'live' (NOT 'home') — using 'home' here makes
// the server reject the POST (zod 400) and drop the WS seen:update, so the
// feed dot never clears across a reload.
const SEEN_SURFACES = ['mentions', 'whispers', 'live']
const SEEN_STORAGE_KEY = 'hs_mc_seen_state_v1'

// Server-authoritative "last viewed at" for each surface (ms epoch).
const seenAt = { mentions: 0, whispers: 0, live: 0 }
// Local "latest event at" for each surface (ms epoch). Persisted.
const latestAt = { mentions: 0, whispers: 0, live: 0 }

let _seenLoaded = false
let _seenSaveTimer = null

function _saveSeenLocal() {
  if (_seenSaveTimer) cleanup.clearTimeout(_seenSaveTimer)
  _seenSaveTimer = cleanup.setTimeout(() => {
    try { chrome.storage.local.set({ [SEEN_STORAGE_KEY]: { latestAt: { ...latestAt } } }) }
    catch (e) { warn('seen-state save failed:', e?.message) }
  }, 500)
}

async function loadSeenState() {
  // Local cache first — instant red-dot accuracy on boot before the
  // /api/user/seen-state round-trip lands.
  try {
    const cached = await chrome.storage.local.get(SEEN_STORAGE_KEY)
    const data = cached?.[SEEN_STORAGE_KEY]
    if (data?.latestAt) {
      for (const k of SEEN_SURFACES) {
        if (typeof data.latestAt[k] === 'number') latestAt[k] = data.latestAt[k]
      }
    }
  } catch (e) { warn('seen-state local load failed:', e?.message) }

  // Anonymous users have no server state — local-only is fine.
  if (typeof hsAuthToken !== 'undefined' && !hsAuthToken) {
    _seenLoaded = true
    refreshSeenBadges()
    return
  }

  try {
    const resp = await apiFetch('/api/user/seen-state')
    if (resp?.ok && resp.data) {
      for (const k of SEEN_SURFACES) {
        if (typeof resp.data[k] === 'number') seenAt[k] = resp.data[k]
      }
    }
  } catch (e) { warn('seen-state GET failed:', e?.message) }
  _seenLoaded = true
  refreshSeenBadges()
}

// Push the new "last viewed" up to the server. Optimistic — local state
// updates immediately so the red dot disappears even if the network is slow.
async function bumpSeen(surface, at) {
  if (!SEEN_SURFACES.includes(surface)) return
  const ts = typeof at === 'number' ? at : Date.now()
  // Monotonic locally too — never undo a clear that landed via WS.
  if (ts > seenAt[surface]) seenAt[surface] = ts
  refreshSeenBadges()
  if (typeof hsAuthToken !== 'undefined' && !hsAuthToken) return
  try {
    const resp = await apiFetch('/api/user/seen-state', {
      method: 'POST',
      body: { surface, at: ts }
    })
    if (resp?.ok && typeof resp.data?.at === 'number') {
      // Server may clamp to GREATEST() — accept its value.
      if (resp.data.at > seenAt[surface]) seenAt[surface] = resp.data.at
      refreshSeenBadges()
    }
  } catch (e) { warn('seen-state POST failed:', e?.message) }
}

// Apply a WS-pushed seen:update from another client.
function applySeenUpdate(surface, at) {
  if (!SEEN_SURFACES.includes(surface)) return
  if (typeof at !== 'number') return
  if (at > seenAt[surface]) {
    seenAt[surface] = at
    refreshSeenBadges()
  }
}

// Register the seen:update WS listener at module load — NOT gated behind
// social tab init like before. Cross-device clears (user clears mentions on
// the website while the ext is open in another tab) used to land before
// listenForSocialEvents() ran and got silently dropped, so the red dot
// stayed lit until the next event landed. seen-state.js is loaded before
// social.js in the build concat, so module-level registration here is the
// earliest possible point.
if (!window._hsMcSeenUpdateListener) {
  window._hsMcSeenUpdateListener = true
  try {
    cleanup.addListener(chrome.runtime?.onMessage, (msg) => {
      if (msg?.type === 'seen_update') applySeenUpdate(msg.surface, msg.at)
    })
  } catch {}
}

// Note that a new event happened on a surface (incoming whisper, mention,
// feed post). Bumps the local latest-at so the red dot persists across a
// hard refresh until the user views the tab.
function noteSeenEvent(surface, at) {
  if (!SEEN_SURFACES.includes(surface)) return
  const ts = typeof at === 'number' ? at : Date.now()
  if (ts > latestAt[surface]) {
    latestAt[surface] = ts
    _saveSeenLocal()
    refreshSeenBadges()
  }
}

function hasUnseen(surface) {
  return latestAt[surface] > seenAt[surface]
}

// Repaint every surface's tab indicator. Called whenever any of the
// timestamps change.
function refreshSeenBadges() {
  if (!tabBarElement) return
  const map = {
    mentions: { selector: '[data-tab="mentions"]', cls: 'has-mentions' },
    whispers: { selector: '[data-tab="whispers"]', cls: 'has-new' },
    live:     { selector: '[data-tab="feed"]',     cls: 'has-new' },
  }
  for (const surface of SEEN_SURFACES) {
    const { selector, cls } = map[surface]
    const tab = tabBarElement.querySelector(selector)
    if (!tab) continue
    // Suppress while user is actually on that tab — match existing UX.
    const tabId = tab.dataset.tab
    if (currentTab === tabId) {
      tab.classList.remove(cls)
      continue
    }
    tab.classList.toggle(cls, hasUnseen(surface))
  }
}
