// Input - chat input, autocomplete, send message, reply state

// Message history — up/down arrow recalls previously sent messages
const mcMessageHistory = []
const MC_HISTORY_MAX = 50
let mcHistoryIndex = -1
let mcHistoryDraft = ''

// Broken-image recovery for input-area emote imgs. Browser negatively caches
// failed image responses (proxy hiccup, CDN blip); without this hook the typed
// word renders forever as a broken-image placeholder in the composer.
// Strategy: retry once with a cache-bust to defeat the negative cache, then
// fall back to the alt text so the message still ships as plain text.
function attachInputEmoteErrorRecovery(img) {
  img.addEventListener('error', () => {
    if (img.dataset.hsRetried) {
      const t = document.createTextNode(img.alt || '')
      img.replaceWith(t)
      return
    }
    img.dataset.hsRetried = '1'
    img.src = img.src + (img.src.includes('?') ? '&' : '?') + 'r=' + Date.now()
  })
}

// Brief red flash on input to indicate message can't be sent from this tab
function flashInputError(input) {
  if (!input) return
  input.style.background = '#400000'
  input.style.borderColor = '#ff0000'
  setTimeout(() => {
    input.style.background = ''
    input.style.borderColor = ''
  }, 600)
}

// Per-emote operation lock to prevent race conditions from rapid clicking
const pendingEmoteOps = new Set()

// Cache own badge string from IRC messages for optimistic display.
// Per-channel: sub badge tier differs by streamer, so a single global ref
// stamped the wrong channel's sub badge onto synthetic celebrations.
let _ownBadges = ''
const _ownBadgesByChannel = new Map() // channelLower -> badges string
function ownBadgesFor(channel) {
  if (!channel) return _ownBadges
  return _ownBadgesByChannel.get(String(channel).toLowerCase()) || _ownBadges
}

// Echo dedup — suppress own message echoes from IRC/KickChat relay
// Uses a Set of {text, time} to handle rapid sends without overwriting
let _recentSentMessages = []
const SENT_DEDUP_WINDOW = 10000 // 10s — used by isSentEcho to suppress dual-send duplicates only
const SENT_HOST_WINDOW = 24 * 60 * 60 * 1000 // 24h — peekSentHost needs longer so badge survives refresh
const RECENT_SENT_KEY = 'hs_recent_sent'

function _pruneRecent(arr) {
  // Prune to the LONGER window so peekSentHost can attribute badges across
  // refreshes. isSentEcho applies its own tighter cutoff at lookup time.
  const cutoff = Date.now() - SENT_HOST_WINDOW
  return arr.filter((e) => e && e.time >= cutoff)
}

function trackSentMessage(text, hostOverride, synthId, echoes) {
  _recentSentMessages.push({ text, time: Date.now(), host: hostOverride || hostPlatform, synthId, echoes: echoes || 1 })
  _recentSentMessages = _pruneRecent(_recentSentMessages)
  // Cross-tab sync: kick.com tab and twitch.tv tab live in different
  // content-script contexts, so they each have their own array. Storage
  // mirrors the entry to every tab via onChanged so peekSentHost on the
  // OTHER host tagged the IRC echo with the correct origin host. ~50ms
  // sync latency easily wins the race against the ~100-300ms platform
  // chat round-trip.
  try {
    chrome.storage.local.set({ [RECENT_SENT_KEY]: _recentSentMessages })
  } catch (_) {}
}

// Hydrate from storage on load + listen for cross-tab updates.
// Listener is tracked via cleanup so SPA reinit doesn't stack copies.
// recentSentHydrated Promise lets BG-history loaders await this before
// stamping platform badges — otherwise the storage-hydration race lets the
// echo render as the IRC echo's actual origin (twitch) instead of the
// sending host (kick).
let _recentSentHydrated = null
{
  let _hydrateResolve = null
  _recentSentHydrated = new Promise((r) => {
    _hydrateResolve = r
  })
  try {
    chrome.storage.local
      .get(RECENT_SENT_KEY)
      .then((data) => {
        const incoming = data?.[RECENT_SENT_KEY]
        if (Array.isArray(incoming)) _recentSentMessages = _pruneRecent(incoming)
      })
      .catch(() => {})
      .finally(() => {
        try {
          _hydrateResolve()
        } catch {}
      })
  } catch (_) {
    _hydrateResolve()
  }
}
try {
  if (!window._hsMcInputStorageListener) {
    const _inputStorageHandler = (changes, area) => {
      if (area !== 'local' || !changes[RECENT_SENT_KEY]) return
      const incoming = changes[RECENT_SENT_KEY].newValue
      if (!Array.isArray(incoming)) return
      // Merge our local writes with the incoming snapshot — last-write-wins
      // by (text, second-bucketed time). Survives the rare two-tab-send race.
      const merged = new Map()
      for (const e of [..._recentSentMessages, ...incoming]) {
        if (!e || !e.text) continue
        const k = `${e.text}:${Math.floor((e.time || 0) / 1000)}`
        const existing = merged.get(k)
        if (!existing || (existing.time || 0) < (e.time || 0)) merged.set(k, e)
      }
      _recentSentMessages = _pruneRecent([...merged.values()].sort((a, b) => a.time - b.time))
    }
    cleanup.addListener(chrome.storage.onChanged, _inputStorageHandler)
    window._hsMcInputStorageListener = true
  }
} catch (_) {}

function isSentEcho(msgText, _msgPlatform) {
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  for (let i = _recentSentMessages.length - 1; i >= 0; i--) {
    const entry = _recentSentMessages[i]
    // continue (not break): a cross-tab merge can briefly leave the array out
    // of time order, so an old entry early doesn't mean all earlier are old.
    if (entry.time < cutoff) continue
    if (entry.text === msgText) {
      // First echo displays; second (dual-send duplicate) is suppressed.
      // Host-platform badge attribution happens separately via peekSentHost,
      // so we don't suppress on host mismatch — that would drop the only
      // echo when sending from one platform to a single-platform channel
      // on a different host (e.g. kick.com → twitch-only mellen).
      entry.suppressed = (entry.suppressed || 0) + 1
      if (entry.suppressed >= 2) {
        // Suppress every echo after the first. Remove the entry only once all
        // expected echoes have arrived (one per target platform) — a triple
        // send (twitch+kick+youtube) produces 3 echoes; removing after the 2nd
        // let the 3rd render as a duplicate of the user's own message.
        if (entry.suppressed >= (entry.echoes || 2)) _recentSentMessages.splice(i, 1)
        return true
      }
      return false
    }
  }
  return false
}

// Peek a recent-sent entry by text WITHOUT consuming it. Used by the IRC/kick
// handlers to attribute the badge platform on the displayed echo. Returns the
// host platform string ('twitch' | 'kick' | 'yt') or null if no tracked send
// matches — letting echoes from elsewhere (e.g. heatsync.org website sends)
// keep whatever platform tag the server attached.
function peekSentHost(msgText) {
  // Use the longer SENT_HOST_WINDOW (24h) — badge attribution must survive
  // page refresh, BG buffer replay, and channel-switch hydration. The dedup
  // path (isSentEcho) uses the tighter 10s window separately.
  const cutoff = Date.now() - SENT_HOST_WINDOW
  for (let i = _recentSentMessages.length - 1; i >= 0; i--) {
    const entry = _recentSentMessages[i]
    // continue (not break): cross-tab storage merges can leave entries out of
    // time order, so a stale entry early in the reverse scan must not abort the
    // search before a valid newer match (mirrors isSentEcho). Array is capped.
    if (entry.time < cutoff) continue
    if (entry.text === msgText) return entry.host || null
  }
  return null
}

// ============================================
// PENDING-SEND TRACKER — round-trip confirmation
// ============================================
// Every send registers an entry keyed by synthId with a per-platform awaiting
// set. Echo arrival via the IRC/Kick read socket calls confirmPending(id,
// platform) which removes that platform from awaiting; the entry is only
// dismissed when the set drains. If the 7s timeout fires with anything still
// awaiting, the user sees a persistent notif with a one-click [retry].
//
// Per-platform tracking matters for dual-send: if twitch echoes but kick
// silently drops (or vice versa), the legacy "any echo = all good" logic
// would mask the dropped platform and the user would never know. The
// tracker exists precisely to catch silent drops — shadow-mute, integrity
// fails, mid-rejoin races leave no NOTICE, no error, just gone — and that
// guarantee only holds if we wait for every platform we sent to.
const pendingSends = new Map()
// 20s: 12s was firing false positives when SW briefly suspended/restarted
// during the echo window. Real BG-restart cycles can take 5-15s before the
// anon socket rejoins and starts receiving PRIVMSGs again. 20s catches those
// while still flagging genuine silent drops (shadow-mute, AutoMod). Worst-
// case the user sees the toast 8s later than before — but doesn't see false
// alarms when their message actually went through.
const PENDING_ECHO_TIMEOUT_MS = 20000
// Expose for devtools
try {
  globalThis.__hsPendingSends = pendingSends
} catch (_) {}

function makeSynthId() {
  return `hs-pend-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`
}

// Twitch/Kick chat commands the platform executes and acks via a NOTICE — they
// never echo back as a PRIVMSG, so the round-trip tracker must not await one or
// it fires a false "did not confirm" 20s after the command actually ran. These
// fall through handleSlashCommand (unwired) and get sent raw; the NOTICE is the
// real ack (success or rejection, surfaced by auth-irc). /me is NOT here — it
// echoes as a CTCP ACTION.
const NON_ECHOING_CHAT_COMMANDS = new Set([
  'followers',
  'followersoff',
  'emoteonly',
  'emoteonlyoff',
  'subscribers',
  'subscribersoff',
  'slow',
  'slowoff',
  'uniquechat',
  'uniquechatoff',
  'r9kbeta',
  'r9kbetaoff',
  'clear',
  'color',
  'mod',
  'unmod',
  'vip',
  'unvip',
  'untimeout',
  'unban',
  'raid',
  'unraid',
  'commercial',
  'marker',
  'announce',
  'announceblue',
  'announcegreen',
  'announceorange',
  'announcepurple',
])
function isNonEchoingCommand(text) {
  if (typeof text !== 'string' || text[0] !== '/') return false
  const m = text.match(/^\/(\w+)/)
  return !!m && NON_ECHOING_CHAT_COMMANDS.has(m[1].toLowerCase())
}

function registerPendingSend({ text, channel, platforms, replyParentId, noEcho }) {
  const synthId = makeSynthId()
  const entry = {
    synthId,
    text,
    channel,
    platforms,
    // Per-platform confirmation gate. Drains as echoes arrive; entry is only
    // dismissed when empty. Catches dual-send silent-drop of one platform.
    awaiting: new Set(platforms),
    replyParentId,
    sentAt: Date.now(),
    state: 'pending',
    noEcho: !!noEcho,
    timer: null,
  }
  entry.timer = cleanup.setTimeout(() => {
    const e = pendingSends.get(synthId)
    if (e?.state !== 'pending') return
    // Non-echoing platform commands get no PRIVMSG echo — the write already
    // succeeded, so retire silently rather than firing a false no_echo. Genuine
    // write failures still surface via the explicit markPendingFailed calls in
    // the send paths (auth_failed/send_failed).
    if (e.noEcho) {
      pendingSends.delete(synthId)
      return
    }
    markPendingFailed(synthId, 'no_echo')
  }, PENDING_ECHO_TIMEOUT_MS)
  pendingSends.set(synthId, entry)
  if (MC_DEBUG)
    try {
      console.log(
        '[heatsync-ext] pending registered:',
        JSON.stringify({
          text,
          channel,
          platforms,
          len: text.length,
          codes: [...text].slice(0, 30).map((c) => c.charCodeAt(0)),
        }),
      )
    } catch (_) {}
  return synthId
}

function confirmPending(synthId, platform) {
  const entry = pendingSends.get(synthId)
  if (!entry) return false
  if (platform) entry.awaiting.delete(platform)
  // Only dismiss once every awaited platform has echoed. Calls without a
  // platform arg (legacy/manual confirm paths) collapse the gate immediately.
  if (platform && entry.awaiting.size > 0) return true
  if (entry.timer) cleanup.clearTimeout(entry.timer)
  pendingSends.delete(synthId)
  try {
    HsNotifs.dismissByKey('send-pending', synthId)
  } catch (_) {}
  return true
}

// Find a pending entry matching this echo text. Called from main.js's
// own-echo handlers. Tries exact match first; falls back to whitespace-
// normalized match (collapses NBSP/tabs/runs of spaces) which catches cases
// where the input serializer added/stripped a space the echo didn't, e.g.
// wysiwyg-chip + trailing text-node combinations.
function findPendingByEchoText(text) {
  if (!text || !pendingSends.size) return null
  for (const [id, entry] of pendingSends) {
    if (entry.state !== 'pending') continue
    if (entry.text === text) return id
  }
  const norm = (s) =>
    String(s)
      .replace(/[ \s]+/g, ' ')
      .trim()
  const wantN = norm(text)
  if (!wantN) return null
  for (const [id, entry] of pendingSends) {
    if (entry.state !== 'pending') continue
    if (norm(entry.text) === wantN) return id
  }
  if (MC_DEBUG)
    try {
      const dump = []
      for (const [, entry] of pendingSends) {
        if (entry.state !== 'pending') continue
        dump.push({
          pendingText: entry.text,
          pendingLen: entry.text.length,
          pendingCodes: [...entry.text].slice(0, 30).map((c) => c.charCodeAt(0)),
          pendingChannel: entry.channel,
        })
      }
      console.log(
        '[heatsync-ext] echo text-miss:',
        JSON.stringify({
          echoText: text,
          echoLen: text.length,
          echoCodes: [...text].slice(0, 30).map((c) => c.charCodeAt(0)),
          pending: dump,
        }),
      )
    } catch (_) {}
  return null
}

// Channel+username fallback. Called when text-match misses. Drains the
// oldest pending send for the given channel — Twitch echoes own PRIVMSGs
// back via the BG anon socket as broadcast-to-all, so a PRIVMSG with our
// own display-name arriving for a channel we have pending sends to means
// SOMETHING posted. Resolves the dominant false-positive class where text
// shape diverged between registration and echo (NBSP/serializer ordering).
function findPendingByChannelFifo(channel) {
  if (!channel || !pendingSends.size) return null
  const target = String(channel).toLowerCase().replace(/^#/, '')
  let bestId = null
  let bestSentAt = Infinity
  for (const [id, entry] of pendingSends) {
    if (entry.state !== 'pending') continue
    if (String(entry.channel).toLowerCase() !== target) continue
    if (entry.sentAt < bestSentAt) {
      bestId = id
      bestSentAt = entry.sentAt
    }
  }
  return bestId
}
try {
  globalThis.__hsFindPendingByChannelFifo = findPendingByChannelFifo
} catch (_) {}

function markPendingFailed(synthId, reason) {
  const entry = pendingSends.get(synthId)
  if (!entry) return
  if (entry.timer) cleanup.clearTimeout(entry.timer)
  entry.state = 'failed'
  entry.reason = reason
  if (reason === 'no_echo' && MC_DEBUG) {
    console.warn('[heatsync-ext] send no_echo:', {
      text: entry.text,
      channel: entry.channel,
      awaiting: [...entry.awaiting],
      elapsed: Date.now() - entry.sentAt,
    })
  }
  // Surface the persistent retry notif. dedupeKey=synthId so retry-then-fail-
  // again replaces in place rather than stacking.
  try {
    HsNotifs.emit('send-pending', {
      synthId,
      text: entry.text,
      channel: entry.channel,
      reason,
    })
  } catch (_) {}
}

// Clear pending sends to a channel WITHOUT firing the no_echo toast — used
// when auth-irc's NOTICE handler already showed a specific rejection toast
// (followers-only/slow-mode/banned/etc). Without this, the user got two toasts
// for the same failure: the specific reason immediately, then "no echo from
// platform" 12-20s later. Now the rejection toast is the only signal.
function clearPendingByChannel(channel) {
  if (!channel) return 0
  const target = String(channel).toLowerCase().replace(/^#/, '')
  let cleared = 0
  for (const [id, entry] of pendingSends) {
    if (entry.state !== 'pending') continue
    if (String(entry.channel).toLowerCase() === target) {
      if (entry.timer) cleanup.clearTimeout(entry.timer)
      pendingSends.delete(id)
      try {
        HsNotifs.dismissByKey('send-pending', id)
      } catch (_) {}
      cleared++
    }
  }
  return cleared
}
try {
  globalThis.__hsClearPendingByChannel = clearPendingByChannel
} catch (_) {}

function retryPendingSend(synthId) {
  const entry = pendingSends.get(synthId)
  if (!entry) return
  // Drop the failed entry; sendMessage will register a fresh one.
  pendingSends.delete(synthId)
  try {
    HsNotifs.dismissByKey('send-pending', synthId)
  } catch (_) {}
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  // Restore text into input. wysiwygEnabled is the same flag sendMessage uses.
  if (wysiwygEnabled) restoreWysiwygText(input, entry.text)
  else input.value = entry.text
  // Restore reply state if the original was a reply
  if (entry.replyParentId) {
    try {
      replyState = { msgId: entry.replyParentId }
    } catch (_) {}
  }
  sendMessage()
}

// Expose for the notif action handler
try {
  globalThis.__hsRetryPendingSend = retryPendingSend
} catch (_) {}

// Autocomplete state (Tab-only cycling, no dropdown)
const acState = {
  matches: [],
  index: 0,
  active: false, // true when cycling through matches
  wordStart: 0, // Position where the completion word starts
  afterText: '', // Text after the completion
  search: '', // search term that produced these matches (remote-fetch guard)
  remoteDone: false, // 7tv fallback already merged for this search
  remotePending: false, // a lazy remote fetch is in flight for this search
}

// Emotes surfaced via remote (7TV/BTTV/FFZ) Tab-search this session: name → {url,
// source}. On send, any of these present in the outgoing message that aren't yet
// in the viewer's set get auto-added — so a remote emote you searched and sent
// becomes yours and renders next time. Bounded; explicit tracking beats sniffing
// chips so it works in plain-text mode too.
const recentRemoteCompletions = new Map()
const REMOTE_COMPLETION_CAP = 300

// Register a Tab-completed emote for auto-add-on-send. Covers the LOCAL-match
// path that fetchRemoteEmoteMatches misses: an aliased channel/global 7TV/BTTV/FFZ
// emote tab-completes as a local hit, never enters the registry, and so renders
// live (channel context) but vanishes after refresh because it was never added
// to the viewer's heatsync set. Gated to third-party providers with a URL —
// owned/blocked/pending are filtered later in autoAddInputEmotes.
function trackCompletionForAutoAdd(match) {
  if (!match || match.type !== 'emote' || !match.name || !match.url) return
  const src = match.source
  if (src !== '7tv' && src !== 'bttv' && src !== 'ffz') return
  recentRemoteCompletions.delete(match.name)
  // Carry zeroWidth so optimistic viewerPersonalEmotes.set and the server add
  // both inherit the overlay flag — without it, a tab-completed 7TV overlay
  // emote (CarrotTime, wavE) renders as a standalone base after auto-add.
  recentRemoteCompletions.set(match.name, { url: match.url, source: src, zeroWidth: !!match.zeroWidth })
  while (recentRemoteCompletions.size > REMOTE_COMPLETION_CAP) {
    recentRemoteCompletions.delete(recentRemoteCompletions.keys().next().value)
  }
}

// Infinite Tab-cycle: once local matches run out, pull more from the cross-provider
// search APIs and append. Aborts stale fetches so rapid re-triggering never
// merges results from an old search term.
//
// Provider quality for prefix expansion (verified empirically on 'sad'):
//  - FFZ: prefix-relevance search, sorted by usage_count. Best signal.
//  - BTTV: prefix-relevance, ordered by internal popularity. Solid.
//  - 7TV: exact-text-match flood — `query:"sad"` returns 150 emotes literally
//    named "sad" from different creators. Useless for prefix expansion of
//    common stems; kept for unique uploads on less common terms.
// Quality order at merge: FFZ → BTTV → 7TV.
// Prefix-only on purpose: catalog substring hits (NotSad, KekSadge) are noise.
// Local substring matches still surface via findEmoteMatches.
let _acRemoteAbort = null
let _acRemoteToken = 0
async function fetchRemoteEmoteMatches(search) {
  // Emote-only: skip @user, :emoji, modifier tokens, and short fragments.
  if (!search || search.length < 2) return
  if (search.startsWith('@') || search.startsWith(':')) return
  if (hsModClassify(search, { allowPrefix: false }).kind === 'modifier') return
  const token = ++_acRemoteToken
  acState.remotePending = true
  if (_acRemoteAbort) {
    try {
      _acRemoteAbort.abort()
    } catch (_) {}
  }
  const ac = new AbortController()
  _acRemoteAbort = ac
  const calls = []
  if (typeof mcSearchFfzApi === 'function') calls.push(mcSearchFfzApi(search, ac.signal))
  else calls.push(Promise.resolve([]))
  if (typeof mcSearchBttvApi === 'function') calls.push(mcSearchBttvApi(search, ac.signal))
  else calls.push(Promise.resolve([]))
  if (typeof mcSearch7tvApi === 'function') calls.push(mcSearch7tvApi(search, ac.signal, { perPage: 60 }))
  else calls.push(Promise.resolve([]))
  const settled = await Promise.allSettled(calls)
  // Clear the in-flight flag on every exit path so a bailed fetch can't leave
  // "searching 7tv…" stuck on — but only if a newer fetch hasn't taken over
  // (token bumped), in which case that fetch now owns the flag.
  if (token === _acRemoteToken) acState.remotePending = false
  if (ac.signal.aborted || token !== _acRemoteToken) return
  // Cycling must still be on the same search the fetch was issued for.
  if (!acState.active || acState.search !== search) return
  acState.remoteDone = true
  const rf = settled[0]?.status === 'fulfilled' && Array.isArray(settled[0].value) ? settled[0].value : []
  const rb = settled[1]?.status === 'fulfilled' && Array.isArray(settled[1].value) ? settled[1].value : []
  const r7 = settled[2]?.status === 'fulfilled' && Array.isArray(settled[2].value) ? settled[2].value : []
  // FFZ's `uses` is real popularity — sort descending so the merged stream
  // leads with highest-use FFZ emotes first.
  rf.sort((a, b) => (b.uses || 0) - (a.uses || 0))
  const items = [...rf, ...rb, ...r7]
  // Lowercase dedupe (collapses 10x "Sadge" uploads to one — emote names are
  // case-insensitive in practice; first-seen wins so FFZ's top result holds).
  // Also dedupes against existing locals (already lowercased below).
  const have = new Set(acState.matches.map((m) => (m.name || '').toLowerCase()))
  const searchLower = search.toLowerCase()
  const add = []
  for (const it of items) {
    if (!it.name) continue
    const lower = it.name.toLowerCase()
    if (have.has(lower)) continue
    // Prefix-only: catalog substring matches are noise.
    if (!lower.startsWith(searchLower)) continue
    have.add(lower)
    const src = it.provider || '7tv'
    add.push({
      name: it.name,
      url: it.url,
      source: src,
      priority: 0,
      type: 'emote',
      remote: true,
      zeroWidth: !!it.zeroWidth,
      _ai: add.length,
    })
    // Remember for auto-add-on-send (only matters if the user actually sends it).
    recentRemoteCompletions.delete(it.name)
    recentRemoteCompletions.set(it.name, { url: it.url, source: src, zeroWidth: !!it.zeroWidth })
    while (recentRemoteCompletions.size > REMOTE_COMPLETION_CAP) {
      recentRemoteCompletions.delete(recentRemoteCompletions.keys().next().value)
    }
  }
  if (!add.length) return
  const wasEmpty = acState.matches.length === 0
  const prev = acState.matches[acState.index]
  acState.matches.push(...add.slice(0, 80))
  // Merged sort. Remote items keep their pre-merge order via `_ai`
  // (FFZ-by-uses → BTTV → 7TV), so cycling through remotes hits the highest
  // quality first regardless of provider.
  // Order:
  //   1. local > remote                       (channel / own set / globals beat catalog)
  //   2. local tier (channel > own > global)
  //   3. exact full-name match                (within tier)
  //   4. prefix > substring
  //   5. sub > non-sub
  //   6. MRU recent > never-used
  //   7. remote: _ai order (FFZ-by-uses → BTTV → 7TV)
  //   8. shorter prefix-match wins
  //   9. alpha
  // Tier outranks exact-match (user call) — a channel emote beats a coincidental
  // exact-cased global ("hug" → peepoHug, not "HuG"). Exact still wins within a tier.
  const _recentList = typeof loadRecentEmotes === 'function' ? loadRecentEmotes() : []
  const _recentRank = new Map()
  for (let i = 0; i < _recentList.length; i++) _recentRank.set(_recentList[i], i)
  acState.matches.sort((a, b) => {
    const al = a.remote ? 1 : 0,
      bl = b.remote ? 1 : 0
    if (al !== bl) return al - bl
    if (!a.remote && !b.remote) {
      const at = a.tier ?? 9,
        bt = b.tier ?? 9
      if (at !== bt) return at - bt
    }
    const ae = a.name.toLowerCase() === searchLower ? 0 : 1
    const be = b.name.toLowerCase() === searchLower ? 0 : 1
    if (ae !== be) return ae - be
    if (a.priority !== b.priority) return a.priority - b.priority
    if (!!a.sub !== !!b.sub) return a.sub ? -1 : 1
    const ar = _recentRank.get(a.name) ?? Infinity
    const br = _recentRank.get(b.name) ?? Infinity
    if (ar !== br) return ar - br
    if (a.remote && b.remote) return (a._ai || 0) - (b._ai || 0)
    if (a.priority === 0 && a.name.length !== b.name.length) return a.name.length - b.name.length
    return (a.name || '').localeCompare(b.name || '')
  })
  // Two cases land here:
  //   • wasEmpty — no local match existed when Tab was pressed, so this remote
  //     fetch fired immediately; insert the first remote hit now.
  //   • lazy — local matches existed and the user cycled to the end, triggering
  //     this fetch; keep their committed chip pinned and only re-point the index.
  //     Never async-swap a chip the user already cycled to (see
  //     heatsync_tabcomplete_exact_locality: async re-insert sent the wrong emote).
  if (wasEmpty && acState.matches.length > 0) {
    acState.index = 0
    insertCompletionKeepOpen(acState.matches[0])
  } else if (prev) {
    const ni = acState.matches.indexOf(prev)
    if (ni >= 0) acState.index = ni
  }
  showCycleTooltip() // refresh the N/M denominator
}

// Emoji dropdown autocomplete state
const emojiAcState = {
  active: false,
  matches: [],
  index: 0,
  query: '',
  colonPos: -1, // position of the triggering ':'
}
let _emojiAcDebounce = null

// Slash command autocomplete dropdown — shows command list when input begins
// with /<word>. Heatsync-owned + common pass-through Twitch/Kick mod commands.
const SLASH_COMMANDS = [
  { cmd: 'op', args: '<text>', desc: 'post to home feed' },
  { cmd: 'w', args: '<user> <msg>', desc: 'twitch whisper' },
  { cmd: 'dm', args: '<user> <msg>', desc: 'heatsync DM' },
  { cmd: 'r', args: '<msg>', desc: 'reply to last whisper' },
  { cmd: 'follow', args: '<user>', desc: 'follow on heatsync (+ twitch/kick mirror)' },
  { cmd: 'unfollow', args: '<user>', desc: 'unfollow on heatsync (+ twitch/kick mirror)' },
  { cmd: 'mute', args: '<user>', desc: 'local mute 24h' },
  { cmd: 'unmute', args: '<user>', desc: 'local unmute' },
  { cmd: 'shrug', args: '[text]', desc: 'append ¯\\_(ツ)_/¯' },
  { cmd: 'tableflip', args: '[text]', desc: 'append (╯°□°)╯︵ ┻━┻' },
  { cmd: 'unflip', args: '[text]', desc: 'append ┬─┬ノ( ゜-゜ノ)' },
  { cmd: 'lclear', args: '', desc: 'clear current tab locally' },
  { cmd: 'status', args: '[channel]', desc: 'show chat modes + stream info' },
  { cmd: 'help', args: '', desc: 'list commands' },
  { cmd: 'me', args: '<action>', desc: 'twitch/kick action message' },
  { cmd: 'ban', args: '<user>', desc: 'twitch/kick ban (mod)' },
  { cmd: 'timeout', args: '<user> [secs]', desc: 'twitch/kick timeout (mod)' },
  { cmd: 'unban', args: '<user>', desc: 'twitch/kick unban (mod)' },
  { cmd: 'untimeout', args: '<user>', desc: 'twitch/kick untimeout (mod)' },
  { cmd: 'color', args: '<hex|name>', desc: 'twitch chat color' },
  { cmd: 'mod', args: '<user>', desc: 'promote mod (broadcaster)' },
  { cmd: 'vip', args: '<user>', desc: 'add vip (broadcaster)' },
  { cmd: 'raid', args: '<channel>', desc: 'twitch raid (broadcaster)' },
  { cmd: 'slow', args: '[secs|off]', desc: 'slow mode (twitch mod)' },
  { cmd: 'clear', args: '', desc: 'clear chat (mod)' },
  { cmd: 'followers', args: '[mins|off]', desc: 'followers-only (twitch mod)' },
  { cmd: 'emoteonly', args: '[off]', desc: 'emote-only mode (twitch mod)' },
  { cmd: 'subscribers', args: '[off]', desc: 'subs-only mode (twitch mod)' },
  { cmd: 'unique', args: '[off]', desc: 'unique-chat/r9k (twitch mod)' },
]
const slashAcState = { active: false, matches: [], index: 0 }
function rebuildInput() {
  const bar = document.getElementById('hs-mc-inputbar')
  if (!bar) return

  // Save current text
  const oldInput = document.getElementById('hs-mc-input')
  const savedText = oldInput ? getInputText() : pendingMessage

  // Remove old input and its wrap/highlight overlay (created by updateCharCount for plain <input>)
  const oldWrap = document.getElementById('hs-mc-input-wrap')
  if (oldWrap) oldWrap.remove()
  const oldHighlight = document.getElementById('hs-mc-input-highlight')
  if (oldHighlight) oldHighlight.remove()
  if (oldInput) oldInput.remove()

  // Create new input element
  const emoteBtn = bar.querySelector('#hs-mc-emote-btn')
  if (wysiwygEnabled) {
    const div = document.createElement('div')
    div.id = 'hs-mc-input'
    div.contentEditable = 'true'
    div.setAttribute('data-placeholder', t('mc_input_send_message'))
    div.spellcheck = false
    if (emoteBtn) bar.insertBefore(div, emoteBtn)
  } else {
    const input = document.createElement('input')
    input.type = 'text'
    input.id = 'hs-mc-input'
    input.placeholder = t('mc_input_send_message')
    input.autocomplete = 'off'
    input.spellcheck = false
    if (emoteBtn) bar.insertBefore(input, emoteBtn)
  }

  // Restore text and reinit
  const newInput = document.getElementById('hs-mc-input')
  if (newInput && savedText) {
    if (wysiwygEnabled) {
      newInput.textContent = savedText
    } else {
      newInput.value = savedText
    }
  }
  initInput()
  updateCharCount()
}

/**
 * Create unified input bar - ALWAYS visible, text persists across tabs
 */
function createInputBar() {
  const bar = document.createElement('div')
  bar.id = 'hs-mc-inputbar'
  const iconUrl = chrome.runtime.getURL('icon-48.png')
  const iconBlackUrl = chrome.runtime.getURL('icon-48-black.png')

  const inputHtml = wysiwygEnabled
    ? `<div id="hs-mc-input" contenteditable="true" data-placeholder="${t('mc_input_send_message')}" spellcheck="false"></div>`
    : `<input type="text" id="hs-mc-input" placeholder="${t('mc_input_send_message')}" autocomplete="off" spellcheck="false">`

  bar.innerHTML = `
    ${inputHtml}
    <button id="hs-mc-emote-btn"><img src="${iconUrl}" data-src="${iconUrl}" data-src-black="${iconBlackUrl}" alt="hs"></button>
  `

  // Initialize input after DOM insertion
  setTimeout(() => {
    initInput()
    const btn = bar.querySelector('#hs-mc-emote-btn')
    const img = btn?.querySelector('img')
    if (btn && img) {
      btn.addEventListener('mouseenter', () => {
        img.src = img.dataset.srcBlack
      })
      btn.addEventListener('mouseleave', () => {
        img.src = img.dataset.src
      })
    }
  }, 0)
  return bar
}

// Get text from input (handles both input and contenteditable)
function getInputText() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return ''
  if (wysiwygEnabled) {
    // Convert emote images, stacks, and cycling spans back to text.
    // Modifiers stored in dataset.hsWords (canonical, set by hsModApplyToImg)
    // appended after the emote so recipients see "Kappa w! h!" not "Kappa".
    let text = ''
    // Adjacency-safe serialization: chips (emote img / stack / emoji span /
    // mention) must stay whitespace-bounded on the wire — `parseEmotes` and
    // peer renderers tokenize on /\s+/, so two adjacent chips that serialize
    // as `KEKWPogChamp` resolve to nothing.
    let _lastWasChip = false
    const sepBefore = () => {
      if (text && !/\s$/.test(text)) text += ' '
    }
    const appendImg = (img) => {
      text += img.dataset.emoteName || img.alt || ''
      const modWords = img.dataset.hsWords || img.dataset.hsModWords // back-compat
      if (modWords) {
        for (const w of modWords.split(/\s+/).filter(Boolean)) text += ' ' + w
      }
    }
    const extractNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || ''
        if (_lastWasChip && t && !/^\s/.test(t) && text && !/\s$/.test(text)) text += ' '
        text += t
        if (t.length > 0) _lastWasChip = false
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
        sepBefore()
        appendImg(node)
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-input-stack')) {
        sepBefore()
        let _firstStackChild = true
        for (const child of node.children) {
          if (child.tagName === 'IMG') {
            if (text && !text.endsWith(' ')) text += ' '
            appendImg(child) // emote overlays already carry "name0" in dataset.emoteName
          } else if (child.classList?.contains('hs-mc-emoji')) {
            if (text && !text.endsWith(' ')) text += ' '
            const ename = child.dataset.emojiName || child.getAttribute('data-emoji-name')
            if (!_firstStackChild && ename) {
              // Overlay emoji — emit ":name:0" so peer renderers stack it on top
              // (the unicode-char form would render beside, not over, the base).
              text += ':' + ename + ':0'
            } else {
              // Base emoji — unicode char (renderer treats a bare emoji as base).
              text += child.textContent || ''
            }
            const emjMods = child.dataset.hsWords
            if (emjMods) for (const w of emjMods.split(/\s+/).filter(Boolean)) text += ' ' + w
          }
          _firstStackChild = false
        }
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-mc-user')) {
        sepBefore()
        // Bare-username Tab completion → serialize as @user so recipients
        // render it as a colored mention chip (processEmotes only colors @-prefixed).
        const u = node.dataset.username || node.textContent || ''
        text += node.dataset.completionType === 'user-bare' ? '@' + u : u
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-mc-emoji')) {
        sepBefore()
        text += node.textContent || ''
        const emjMods = node.dataset.hsWords
        if (emjMods) for (const w of emjMods.split(/\s+/).filter(Boolean)) text += ' ' + w
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += node.textContent || ''
      }
    }
    for (const node of input.childNodes) extractNode(node)
    return text.replace(/\u00A0/g, ' ')
  }
  return input.value || ''
}
function initInput() {
  const input = document.getElementById('hs-mc-input')
  const sendBtn = document.getElementById('hs-mc-send')
  log('🎯 initInput called, input found:', !!input)
  if (!input) {
    log('❌ Input not found in DOM yet, retrying...')
    setTimeout(initInput, 100)
    return
  }
  // Mark input as initialized to avoid duplicate handlers
  if (input._hsInitialized) {
    log('⚠️ Input already initialized')
    return
  }
  input._hsInitialized = true
  log('✅ Initializing input handlers, WYSIWYG:', wysiwygEnabled)

  // Restore pending message
  if (pendingMessage) {
    if (wysiwygEnabled) {
      input.textContent = pendingMessage
    } else {
      input.value = pendingMessage
    }
  }

  input.addEventListener('keydown', handleInputKeydown)
  input.addEventListener('input', handleInputChange)
  input.addEventListener('input', updateCharCount)
  // Unified undo/redo — same module as the website. installUndoManager
  // attaches a manager to input._undoManager and wires Ctrl+Z hotkeys
  // (capture phase) + auto-capture on input events. Per-keystroke for
  // typing, one step per structural op (Tab autocomplete, smart unwrap, etc.).
  try {
    installUndoManager(input, { max: 100 })
  } catch (_) {}
  // Tab clears emote :hover highlight in chat — mouse stuck over an emote
  // would otherwise hold the green rect lit while the user cycles autocomplete.
  // Body class restored on mousemove. Single global install via window flag.
  if (!window._hsMcTabHoverInstalled) {
    window._hsMcTabHoverInstalled = true
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Tab') return
        const ae = document.activeElement
        if (ae?.id !== 'hs-mc-input') return
        document.body.classList.add('hs-tab-cycling')
      },
      { signal: mcSignal },
    )
    document.addEventListener(
      'mousemove',
      () => {
        if (document.body.classList.contains('hs-tab-cycling')) {
          document.body.classList.remove('hs-tab-cycling')
        }
      },
      { passive: true, signal: mcSignal },
    )
  }
  // Sync highlight overlay scroll with input scroll (RAF-throttled)
  let _inputScrollRaf = null
  input.addEventListener(
    'scroll',
    () => {
      if (_inputScrollRaf) return
      _inputScrollRaf = requestAnimationFrame(() => {
        _inputScrollRaf = null
        const hl = document.getElementById('hs-mc-input-highlight')
        if (hl) hl.scrollLeft = input.scrollLeft
      })
    },
    { passive: true },
  )
  input.addEventListener('input', () => {
    const hasText = (input.value || input.textContent || '').trim().length > 0
    if (hasText) showInputBar()
    else hideInputBar()
  })
  input.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 150)
    setTimeout(hideEmojiDropdown, 150)
    setTimeout(hideSlashDropdown, 150)
    // Hide input bar after blur if empty (delay to allow click-to-emote-picker)
    // Skip if window lost focus — prevents hiding when switching apps
    setTimeout(() => {
      if (document.hasFocus()) hideInputBar()
    }, 200)
  })
  sendBtn?.addEventListener('click', sendMessage)

  // Set up drag-drop handlers for media upload
  setupMediaDropHandlers()

  // Pasted image handler — applies in BOTH wysiwyg and plain modes
  input.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          handleMediaUpload(file)
          return
        }
      }
    }
  })

  // WYSIWYG: handle paste to strip formatting
  if (wysiwygEnabled) {
    input.addEventListener('paste', (e) => {
      // If a previous handler already prevented default (image upload), skip
      if (e.defaultPrevented) return
      e.preventDefault()
      const text = e.clipboardData.getData('text/plain')
      if (!text) return
      if (!document.execCommand('insertText', false, text)) {
        // Fallback: insert via Selection/Range API
        const sel = window.getSelection()
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0)
          range.deleteContents()
          range.insertNode(document.createTextNode(text))
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    })
  }

  // Initialize character counter
  updateCharCount()

  // Emote picker button (includes twitch features in tabs)
  const emoteBtn = document.getElementById('hs-mc-emote-btn')
  if (emoteBtn && !emoteBtn._hsInitialized) {
    emoteBtn._hsInitialized = true
    emoteBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const picker = document.getElementById('hs-mc-emote-picker')
      if (picker?.classList.contains('visible')) {
        picker.classList.remove('visible')
        adjustOverlayForPicker(false)
        hideInputBar()
        if (_pickerCloseHandler) {
          document.removeEventListener('click', _pickerCloseHandler)
          _pickerCloseHandler = null
        }
      } else {
        showEmotePicker()
      }
    })
  }

  // Update placeholder based on current tab
  updateInputPlaceholder()

  // Global Tab key to focus input — only when multichat panel is active
  if (!window._hsMcTabHandler) {
    window._hsMcTabHandler = true
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== 'Tab') return
        if (currentTab === 'add' || currentTab === 'settings') return
        const active = document.activeElement
        const input = document.getElementById('hs-mc-input')
        if (!input) return
        // Don't steal Tab from other inputs (except Twitch's chat input)
        if (
          active &&
          active !== document.body &&
          active.tagName === 'INPUT' &&
          active.id !== 'hs-mc-input' &&
          !active.dataset?.aTarget
        )
          return
        if (active && active !== document.body && active.tagName === 'TEXTAREA' && active.id !== 'hs-mc-input') return

        // If not already in our input, reveal bar and focus it
        if (active !== input) {
          e.preventDefault()
          showInputBar()
          input.focus()
        }
      },
      { capture: true, signal: mcSignal },
    )
  }

  // Global `\` toggle → hide/show chat. Mirrors heatsync.org keyboard shortcut.
  // Skip when input is focused so users can type `\` into chat normally.
  if (!window._hsMcChatToggleHandler) {
    window._hsMcChatToggleHandler = true
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key !== '\\') return
        if (e.ctrlKey || e.altKey || e.metaKey) return
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
        e.preventDefault()
        e.stopImmediatePropagation()
        try {
          toggleChatHidden()
        } catch (err) {
          log('chat-toggle keydown:', err)
        }
      },
      { capture: true, signal: mcSignal },
    )
  }

  // Auto-reveal input bar when user starts typing anywhere
  if (!window._hsMcTypeRevealHandler) {
    window._hsMcTypeRevealHandler = true
    document.addEventListener(
      'keydown',
      (e) => {
        if (inputBarVisible) return
        if (currentTab === 'add' || currentTab === 'settings') return
        const input = document.getElementById('hs-mc-input')
        if (!input) return
        // Don't steal focus from other inputs
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
        // Only printable chars — skip modifiers, nav, function keys
        if (e.ctrlKey || e.altKey || e.metaKey) return
        if (e.key.length !== 1) return
        // Prevent platform shortcuts (Kick fullscreen "f", theater "t", etc.)
        e.preventDefault()
        e.stopImmediatePropagation()
        showInputBar()
        input.focus()
        // Manually insert the character since we prevented default
        if (input.isContentEditable) {
          document.execCommand('insertText', false, e.key)
        } else {
          input.value += e.key
          input.dispatchEvent(new Event('input', { bubbles: true }))
        }
      },
      { capture: true, signal: mcSignal },
    )

    // Catch paste when input bar is hidden — reveal bar and insert text
    document.addEventListener(
      'paste',
      (e) => {
        if (inputBarVisible) return
        if (currentTab === 'add') return
        const input = document.getElementById('hs-mc-input')
        if (!input) return
        // Don't steal paste from other inputs
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
        // Check for pasted image first
        const items = e.clipboardData?.items
        if (items) {
          for (const item of items) {
            if (item.kind === 'file' && item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (file) {
                e.preventDefault()
                handleMediaUpload(file)
                return
              }
            }
          }
        }
        const text = e.clipboardData?.getData('text/plain')
        if (!text) return
        e.preventDefault()
        showInputBar()
        input.focus()
        // Insert pasted text into the input
        if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
          input.value = text
          input.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          document.execCommand('insertText', false, text)
        }
      },
      { signal: mcSignal },
    )
  }

  // Helper: find emote wrapper or img from event target
  function findEmoteTarget(target) {
    // Check wrapper first (our emotes)
    const wrapper = target.closest('.hs-mc-emote-wrapper')
    if (wrapper) {
      const wImg = wrapper.querySelector('img')
      return {
        wrapper,
        emoteName: wrapper.dataset.emoteName || wImg?.alt || 'emote',
        state: wrapper.dataset.state || 'global',
        emoteUrl: wrapper.dataset.emoteUrl || wImg?.src || '',
        source: wrapper.dataset.source || 'unknown',
        modWords: wImg?.dataset?.hsWords || wrapper.dataset?.hsWords || '',
      }
    }
    // Picker emote wrap — when blocked, the inner img is visibility:hidden so
    // right-clicks land on the wrap span, not the img. Without this branch
    // findEmoteTarget returned null and unblock-on-right-click silently failed.
    const pickerWrap = target.closest('.hs-mc-picker-emote-wrap')
    if (pickerWrap) {
      const img = pickerWrap.querySelector('img')
      return {
        wrapper: null,
        emoteName: pickerWrap.dataset.name || img?.alt || 'emote',
        state: img?.dataset.state || (pickerWrap.classList.contains('blocked') ? 'blocked' : 'global'),
        emoteUrl: img?.src || '',
        source: img?.dataset.source || 'unknown',
      }
    }
    // Fallback: direct IMG (Twitch/7TV/BTTV native emotes, picker emotes,
    // and multichat WYSIWYG input chips — class match catches blocked input
    // emotes whose src has been swapped to a transparent placeholder).
    if (
      target.tagName === 'IMG' &&
      !target.classList.contains('hs-mc-badge-img') &&
      (target.classList.contains('hs-mc-emote') ||
        target.classList.contains('hs-mc-picker-emote') ||
        target.classList.contains('hs-input-emote') ||
        target.classList.contains('chat-line__message--emote') ||
        target.classList.contains('chat-image') ||
        target.src?.includes('7tv.app') ||
        target.src?.includes('betterttv.net') ||
        (target.src?.includes('frankerfacez') && !target.src?.includes('room-badge/')) ||
        target.src?.includes('static-cdn.jtvnw.net/emoticons'))
    ) {
      const isBlocked = target.classList.contains('hs-state-blocked') || target.dataset.state === 'blocked'
      return {
        wrapper: null,
        emoteName: target.alt || target.dataset.emoteName || target.title?.split(' ')[0] || 'emote',
        state: isBlocked ? 'blocked' : target.dataset.state || 'global',
        emoteUrl: target.dataset.hsOrigSrc || target.src || '',
        source: target.dataset.source || 'unknown',
      }
    }
    return null
  }

  function openEmoteCtxMenu(x, y, { emoteName, emoteUrl }) {
    const hi = getHighResUrl(emoteUrl)
    const items = []
    let m
    if ((m = emoteUrl.match(/cdn\.7tv\.app\/emote\/([^/]+)/))) {
      items.push({
        label: 'open on 7TV',
        fn: () => window.open(`https://7tv.app/emotes/${m[1]}`, '_blank', 'noopener,noreferrer'),
      })
    } else if ((m = emoteUrl.match(/cdn\.betterttv\.net\/emote\/([^/]+)/))) {
      items.push({
        label: 'open on BTTV',
        fn: () => window.open(`https://betterttv.com/emotes/${m[1]}`, '_blank', 'noopener,noreferrer'),
      })
    } else if ((m = emoteUrl.match(/cdn\.frankerfacez\.com\/emote\/(\d+)/))) {
      items.push({
        label: 'open on FFZ',
        fn: () => window.open(`https://www.frankerfacez.com/emoticon/${m[1]}`, '_blank', 'noopener,noreferrer'),
      })
    }
    items.push(
      { label: 'view image', fn: () => window.open(hi, '_blank', 'noopener,noreferrer') },
      'sep',
      {
        label: 'copy :name:',
        fn: () => {
          try {
            navigator.clipboard
              .writeText(`:${emoteName}:`)
              .then(() => showToast('name copied', 'success'))
              .catch(() => {})
          } catch {}
        },
      },
      {
        label: 'copy image url',
        fn: () => {
          try {
            navigator.clipboard
              .writeText(hi)
              .then(() => showToast('url copied', 'success'))
              .catch(() => {})
          } catch {}
        },
      },
    )
    showHsCtxMenu(x, y, `:${emoteName}:`, items)
  }

  // Right-click menu for emoji. Emoji aren't blockable (unicode glyphs, not
  // provider images — no name/hash/url to key the block registry on), so the
  // menu is copy-only: the :shortcode: when known, plus the raw glyph. Chat
  // emoji carry the shortcode in title=":name:"; input chips in data-emoji-name;
  // raw unicode has neither (copy-glyph only).
  function openEmojiCtxMenu(x, y, span) {
    const title = span.getAttribute('title') || ''
    const m = title.match(/^:([a-z0-9_+-]+):$/i)
    const name = span.dataset?.emojiName || (m ? m[1] : '')
    const char = (span.textContent || '').trim()
    const items = []
    if (name)
      items.push({
        label: 'copy :name:',
        fn: () => {
          try {
            navigator.clipboard
              .writeText(`:${name}:`)
              .then(() => showToast('name copied', 'success'))
              .catch(() => {})
          } catch {}
        },
      })
    if (char)
      items.push({
        label: 'copy emoji',
        fn: () => {
          try {
            navigator.clipboard
              .writeText(char)
              .then(() => showToast('emoji copied', 'success'))
              .catch(() => {})
          } catch {}
        },
      })
    if (!items.length) return
    showHsCtxMenu(x, y, name ? `:${name}:` : char, items)
  }

  // Global right-click handler for ALL emotes
  if (!window._hsMcEmoteContextHandler) {
    window._hsMcEmoteContextHandler = true
    document.addEventListener(
      'contextmenu',
      (e) => {
        // Stack expand on right-click (plain, no modifier — shift falls through
        // to the per-emote menu on whichever stack child the cursor's on).
        const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)')
        if (collapsedStack && !e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          collapsedStack.classList.add('expanded')
          collapsedStack.removeAttribute('title')
          return
        }

        // Emoji: copy-only menu (not blockable — see openEmojiCtxMenu). Checked
        // before findEmoteTarget, which doesn't match emoji spans.
        const emojiSpan = e.target.closest('.hs-mc-emoji')
        if (emojiSpan) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          openEmojiCtxMenu(e.clientX, e.clientY, emojiSpan)
          return
        }

        const emoteInfo = findEmoteTarget(e.target)
        if (!emoteInfo) return
        log('Emote right-click:', emoteInfo.emoteName, emoteInfo.state)

        e.preventDefault()
        e.stopPropagation()

        if (e.shiftKey) {
          openEmoteCtxMenu(e.clientX, e.clientY, emoteInfo)
          return
        }

        const { emoteName, state, emoteUrl, source } = emoteInfo

        // Race-guard against rapid clicking
        if (pendingEmoteOps.has(emoteName)) return

        // 3-state right-click: blocked → unblock; owned (your HS inventory) →
        // remove from set; everything else → block. Remove is gated to genuine
        // inventory emotes (state==='owned' AND inventoryEmotes.has) so Twitch
        // subs, channel emotes, follower/bits and third-party copies can NEVER be
        // removed from a chat-flow right-click — only blocked. Removal is reversible
        // (30-day recovery) and the name falls back to the next emote of that name
        // (channel/global) or plain text, mirroring heatsync.org.
        if (state === 'blocked') {
          unblockEmote(emoteName)
        } else if (state === 'owned' && inventoryEmotes.has(emoteName)) {
          removeEmoteFromInventory(emoteName, e.target)
        } else {
          blockEmote(emoteName, emoteUrl, source)
        }
      },
      { capture: true, signal: mcSignal },
    )
  }

  // Global left-click handler for ALL emotes
  if (!window._hsMcEmoteClickHandler) {
    window._hsMcEmoteClickHandler = true
    document.addEventListener(
      'click',
      (e) => {
        // Stack collapse button
        if (e.target.closest('.hs-mc-stack-collapse')) {
          e.preventDefault()
          e.stopPropagation()
          const stack = e.target.closest('.hs-mc-emote-stack')
          if (stack) {
            stack.classList.remove('expanded')
            stack.setAttribute('title', 'expand')
          }
          return
        }
        // Stack block-all button
        if (e.target.closest('.hs-mc-stack-block-all')) {
          e.preventDefault()
          e.stopPropagation()
          const stack = e.target.closest('.hs-mc-emote-stack')
          if (stack) blockAllEmotesInStack(stack)
          return
        }
        // Collapsed stack left-click → add unowned emotes to inventory, then
        // paste every postable item (emotes + emojis) to input in DOM order.
        // Emojis in the nest are treated as first-class stack members so a
        // composite like "emote + :smile:0 overlay" round-trips into the input
        // intact instead of dropping the emoji.
        // (skip locked/blocked emotes — viewer can't post them)
        const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)')
        if (collapsedStack) {
          e.preventDefault()
          e.stopPropagation()
          const stackInner = collapsedStack.querySelector('.hs-mc-emote-stack-emotes')
          const stackChildren = stackInner ? [...stackInner.children] : []
          const items = []
          let hadUnpostableEmote = false
          for (const c of stackChildren) {
            if (c.classList?.contains('hs-mc-emote-wrapper') && c.dataset.emoteName) {
              const s = c.dataset.state
              if (s === 'locked' || s === 'blocked') {
                hadUnpostableEmote = true
                continue
              }
              items.push({ kind: 'emote', el: c })
            } else if (c.classList?.contains('hs-mc-emoji')) {
              items.push({ kind: 'emoji', el: c })
            }
          }
          if (items.length === 0) {
            if (hadUnpostableEmote) showToast(`nothing postable in stack`, 'error')
            return
          }
          // Fire add-to-inventory for each unowned emote (don't block paste on the
          // server roundtrip; state flips green when each resolves).
          for (const it of items) {
            if (it.kind !== 'emote') continue
            const w = it.el
            if (w.dataset.state === 'unadded') {
              const name = w.dataset.emoteName
              if (!name || pendingEmoteOps.has(name)) continue
              const url = w.dataset.emoteUrl || w.querySelector('img')?.src || ''
              const source = w.dataset.source || 'heatsync'
              addEmoteToInventory(name, url, source, w)
            }
          }
          showInputBar()
          for (let i = 0; i < items.length; i++) {
            const it = items[i]
            if (it.kind === 'emote') {
              const w = it.el
              const name = w.dataset.emoteName
              if (!name) continue
              // Wire words are stashed on the wrapper at render time by
              // _hsMcApplyMods so paste preserves w!/h!/c! per emote, letting
              // user click-paste-enter and reproduce the nest's exact dimensions.
              const wImg = w.querySelector('img')
              const modWords = wImg?.dataset?.hsWords || w.dataset?.hsWords || ''
              pasteEmoteToInput(name, modWords)
            } else {
              // Non-first item is an overlay — stack onto the previous chip so
              // getInputText emits ":name:0" (or unicode-stacked) on the wire.
              pasteEmojiSpanFromNestToInput(it.el, i > 0)
            }
          }
          const input = document.getElementById('hs-mc-input')
          if (input) input.focus()
          const firstEmote = items.find((it) => it.kind === 'emote')
          if (firstEmote) flashAllEmotes(firstEmote.el.dataset.emoteName, 'hs-flash-paste')
          return
        }

        const emoteInfo = findEmoteTarget(e.target)
        if (!emoteInfo) return

        // Multichat input WYSIWYG chip — only intercept clicks for the blocked
        // state (left-click unblocks). For any other state we let the
        // contenteditable handle the click so the caret lands at the click
        // position; intercepting would silently re-paste the same emote on
        // every cursor placement, which is hostile.
        if (e.target.closest('#hs-mc-input') && emoteInfo.state !== 'blocked') return

        e.preventDefault()
        e.stopPropagation()

        const { emoteName, state, emoteUrl, source, modWords } = emoteInfo

        if (state === 'blocked') {
          // 2-state model: left-click on a blocked emote unblocks it (returns
          // straight to whatever its natural state is — owned if still in your
          // inventory, channel/global otherwise). Mirrors right-click on blocked.
          if (pendingEmoteOps.has(emoteName)) return
          unblockEmote(emoteName)
          return
        }
        if (state === 'locked') {
          // Foreign Twitch sub emote — viewer not subbed to this channel, can't
          // post it. Toast instead of paste (matches website post-b6f23bc8:
          // visually identical to other emotes, only click is gated).
          showToast(`${emoteName} — not subbed to this channel`, 'error')
          return
        }
        if (state === 'owned' || state === 'global' || state === 'channel' || state === 'unadded') {
          // 2-state model: every non-blocked, non-remote picker emote is equally
          // pasteable. The old "first click adds, second click pastes" anti-misfire
          // was an artefact of the orange `unadded` tier — without that tier there's
          // no slot to "burn" prematurely, since auto-add-on-send commits the slot
          // only at the moment the user actually sends a message containing the
          // emote. Picker click = paste; if you send it, it lands in your set
          // automatically. Optimistically populate viewerPersonalEmotes so the
          // own-message echo can render the image before the server add resolves
          // (emote name in raw text has no <img> wrapper for a late add to fill in).
          // Seed viewerPersonalEmotes when the clicked emote can't currently be
          // resolved by lookupEmote — covers the 'unadded' slot (optimistic add so
          // the own-message echo renders before the server add lands) AND the case
          // where the picker outlived its live resolver cache: 7TV channel/owned
          // emotes are still shown in the cached picker DOM during the post-load
          // sub-ack window (~15s) and after a channel re-key, but
          // lookupEmoteWithOverlay returns null for them, so createInputEmoteImg
          // builds no chip and the click silently pastes nothing. The clicked
          // element carries the real url+source, so seed from it (state preserved;
          // 'unadded' normalizes to 'owned'). Guard on a real http(s) url so a
          // blocked emote's transparent px never seeds garbage.
          if (
            !viewerPersonalEmotes.has(emoteName) &&
            emoteUrl &&
            /^https?:/i.test(emoteUrl) &&
            (typeof lookupEmoteWithOverlay !== 'function' || !lookupEmoteWithOverlay(emoteName))
          ) {
            viewerPersonalEmotes.set(emoteName, {
              url: emoteUrl,
              source: source || 'heatsync',
              state: state === 'unadded' ? 'owned' : state,
            })
          }
          showInputBar()
          pasteEmoteToInput(emoteName, modWords)
          const input = document.getElementById('hs-mc-input')
          if (input) input.focus()
          flashAllEmotes(emoteName, 'hs-flash-paste')
          return
        }
      },
      { capture: true, signal: mcSignal },
    )
  }

  // Spoiler click → toggle revealed
  if (!window._hsMcSpoilerHandler) {
    window._hsMcSpoilerHandler = true
    document.addEventListener(
      'click',
      (e) => {
        const spoiler = e.target.closest('.hs-spoiler')
        if (!spoiler) return
        e.stopPropagation()
        spoiler.classList.toggle('revealed')
      },
      { signal: mcSignal },
    )
  }

  // Reply button click → set reply state and focus input
  if (!window._hsMcReplyHandler) {
    window._hsMcReplyHandler = true
    document.addEventListener(
      'click',
      (e) => {
        const btn = e.target.closest('.hs-mc-reply-btn')
        if (!btn) return
        const msg = btn.closest('.hs-mc-msg')
        if (!msg?.dataset.msgId) return
        setReplyState({
          msgId: msg.dataset.msgId,
          user: msg.dataset.msgUser,
          channel: msg.dataset.msgChannel,
        })
      },
      { signal: mcSignal },
    )
  }

  // Universal right-click → user/post action menu. Fires on ANY username
  // (.hs-mc-user), chat message (.hs-mc-msg), or feed post (.hs-feed-msg)
  // anywhere in the panel. follow=1, block=2 are always the top two items.
  // The emote menu (capture handler above) owns emote right-clicks; real
  // links/media fall through to the native menu so "copy link" still works.
  if (!window._hsMcMsgContextHandler) {
    window._hsMcMsgContextHandler = true
    document.addEventListener(
      'contextmenu',
      (e) => {
        // Emote AND emoji right-clicks own their own menus (emote block / emoji
        // copy) in the handler above — bail so the user/message menu doesn't
        // also fire on the same event and overwrite them (both are capture-phase
        // document listeners, so stopPropagation alone wouldn't stop this one).
        if (findEmoteTarget(e.target) || e.target.closest('.hs-mc-emoji')) return
        const userEl = e.target.closest('.hs-mc-user:not(.hs-mc-reply-user)')
        const feedDiv = e.target.closest('.hs-feed-msg')
        const msg = e.target.closest('.hs-mc-msg')
        if (!userEl && !feedDiv && !msg) return
        // Right-clicking a real link/embed (not a username) → keep native menu.
        if (
          !userEl &&
          e.target.closest(
            'a, img, video, iframe, .hs-feed-thread-link, .hs-quote-insert, .hs-post-link, .hs-feed-embed',
          )
        )
          return
        const norm = (el) => (el.dataset.username || el.textContent || '').replace(/^@/, '').trim().toLowerCase()
        let username = null,
          platform = null,
          feedMsg = null
        if (userEl) {
          username = norm(userEl)
          platform = userEl.dataset.platform || null
        } else if (feedDiv) {
          const a = feedDiv.querySelector('.hs-mc-user')
          username = a ? norm(a) : null
          platform = a?.dataset.platform || null
          feedMsg = feedDiv._hsFeedMsg || null
        } else {
          const a = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
          username = a ? norm(a) : null
          platform = a?.dataset.platform || null
        }
        if (!username || username === 'anonymous') return
        e.preventDefault()
        e.stopPropagation()
        openUserCtxMenu(e.clientX, e.clientY, username, platform, {
          msg: msg || null,
          feedDiv: feedDiv || null,
          feedMsg,
        })
      },
      { capture: true, signal: mcSignal },
    )
  }
}

// Resolve a username's heatsync profile (id + relationship) via the shared
// identity resolver — cache-first, so a prior hover/tooltip makes this instant.
function hsRelPeek(username, platform) {
  if (typeof _profileCache === 'undefined') return null
  const u = String(username).toLowerCase()
  let c = _profileCache.get(`${platform || 'unknown'}:${u}`)
  if (!c) {
    for (const [k, v] of _profileCache) {
      if (k.endsWith(':' + u)) {
        c = v
        break
      }
    }
  }
  return c?.profile || null
}

async function hsFollowFromMenu(username, platform) {
  if (typeof resolveIdentity !== 'function') return
  const ri = await resolveIdentity(username, { platform })
  const p = ri?.profile
  const id = p?.id || p?.userId
  if (!id) {
    const msg = ri?.transient
      ? ri.status === 429
        ? `rate limited — try in a sec`
        : `couldn't reach server (${ri.status || 'net'})`
      : `${username} isn't on heatsync`
    showToast(msg, 'error')
    return
  }
  pcToggleFollow(id, username, !!(p.relationship?.youFollow || p.relationship?.isFollowing))
}

async function hsBlockFromMenu(username, platform) {
  let p = null
  if (typeof resolveIdentity === 'function') p = (await resolveIdentity(username, { platform }))?.profile || null
  const id = p?.id || p?.userId
  // Registered → real account-level block (persists, auto-unfollows). Otherwise
  // fall back to a local session hide so block still works on non-heatsync users.
  if (id) pcToggleBlock(id, username, !!(p.relationship?.youBlock || p.relationship?.isBlocked))
  else _toggleMcBlock(username, platform)
}

// Build the universal action menu. follow=1, block=2 always lead; whisper/
// mention/profile/copy follow; own feed posts append edit/delete.
// Right-click mod action — single platform (the clicked message's), targeting
// the login. Delete gets a bespoke toast; the rest use the shared combined one.
async function _ctxMod(action, channel, platform, target, msgId, durationSec, label) {
  const r = await dispatchModAction({ channel, platform, action, target, durationSec, msgId })
  if (action === 'delete') {
    showToast(
      r?.anyOk ? 'deleted message' : `delete failed: ${(r?.tResp || r?.kResp)?.error || 'unknown'}`,
      r?.anyOk ? 'success' : 'error',
    )
  } else {
    showModResultToast(label, target, r)
  }
}

function openUserCtxMenu(x, y, username, platform, ctx = {}) {
  const { msg, feedDiv, feedMsg } = ctx
  const rel = hsRelPeek(username, platform)?.relationship || null
  const youFollow = !!(rel?.youFollow || rel?.isFollowing)
  const youBlock =
    !!(rel?.youBlock || rel?.isBlocked) ||
    (typeof isUserBlocked === 'function'
      ? isUserBlocked(username, platform)
      : blockedUsers.has(String(username).toLowerCase()))
  const isMuted = typeof isUserMuted === 'function' ? isUserMuted(username, platform) : mutedUsers.has(username)
  const items = [
    { key: 'follow', label: youFollow ? 'unfollow' : 'follow', fn: () => hsFollowFromMenu(username, platform) },
    {
      key: 'block',
      label: youBlock ? 'unblock' : 'block',
      danger: !youBlock,
      fn: () => hsBlockFromMenu(username, platform),
    },
    { label: isMuted ? 'unmute' : 'mute (24h)', danger: !isMuted, fn: () => _toggleMcMute(username, platform) },
    'sep',
  ]
  // ─── Mod actions ─── gated on, and acting on, the CLICKED message's platform
  // (single — no cross-platform noise; a twitch chatter ≠ the same-named kick
  // user). Twitch gates on GQL mod-state, Kick on kick_mod_status. Targets the
  // LOGIN (display-name ≠ login for non-Latin users → ban would miss).
  if (msg && (typeof isModForSync === 'function' || typeof isKickModForSync === 'function')) {
    const msgCh = msg.dataset?.msgChannel || ''
    const msgPlat = msg.dataset?.msgPlatform || 'twitch'
    const msgLogin = (msg.dataset?.msgLogin || msg.dataset?.msgUser || username || '').toLowerCase()
    const msgId = msg.dataset?.msgId || ''
    const lookup = typeof getChannelLookup === 'function' ? getChannelLookup() : null
    const entry =
      lookup && msgCh
        ? (msgPlat === 'kick' ? lookup.kick.get(msgCh) : lookup.twitch.get(msgCh)) || lookup.byId.get(msgCh)
        : null
    const isKick = msgPlat === 'kick'
    // The channel key for the action + gate: kick slug for kick rows, twitch login otherwise.
    const modCh = isKick ? entry?.kick || msgCh : entry?.twitch || msgCh
    // currentUsername is a display name; compare against BOTH the login and the
    // display name so a non-Latin-named mod can't be shown self-mod actions.
    const _selfRef = typeof currentUsername !== 'undefined' && currentUsername ? currentUsername.toLowerCase() : null
    const notSelf = !_selfRef || (msgLogin !== _selfRef && (msg.dataset?.msgUser || '').toLowerCase() !== _selfRef)
    const amMod = isKick
      ? typeof isKickModForSync === 'function' && isKickModForSync(modCh)
      : typeof isModForSync === 'function' && isModForSync(modCh)
    if (modCh && notSelf) {
      if (amMod) {
        const mod = []
        if (msgId)
          mod.push({
            label: 'delete msg',
            danger: true,
            fn: () => _ctxMod('delete', msgCh, msgPlat, msgLogin, msgId, 0, 'deleted'),
          })
        mod.push(
          {
            label: 'timeout 10m',
            fn: () => _ctxMod('timeout', msgCh, msgPlat, msgLogin, msgId, 600, 'timed out 600s'),
          },
          { label: 'ban', danger: true, fn: () => _ctxMod('ban', msgCh, msgPlat, msgLogin, msgId, 0, 'banned') },
          { label: 'unban', fn: () => _ctxMod('unban', msgCh, msgPlat, msgLogin, msgId, 0, 'unbanned') },
          'sep',
        )
        items.push(...mod)
      } else {
        // Warm the right cache so the next right-click surfaces actions.
        if (isKick) {
          if (typeof prefetchKickModFor === 'function') prefetchKickModFor(modCh)
        } else if (typeof prefetchModFor === 'function') prefetchModFor(modCh)
      }
    }
  }
  // Reply — only when right-clicked on a real chat message with an id (Twitch
  // IRC msg-id or Kick msg id). The same setReplyState the reply-button uses.
  if (msg?.dataset?.msgId) {
    items.push({
      label: 'reply',
      fn: () =>
        setReplyState({
          msgId: msg.dataset.msgId,
          user: msg.dataset.msgUser || username,
          channel: msg.dataset.msgChannel || '',
        }),
    })
  }
  items.push(
    { label: 'whisper', fn: () => _openWhisperFor(username, platform) },
    { label: 'dm', fn: () => _openDmFor(username, platform) },
    { label: 'mention', fn: () => _mentionInMcInput(username) },
    { label: 'view profile', fn: () => openProfileCard(username, platform) },
  )
  // Filter the live buffer to just this user — sets the search bar to @name.
  // Only on a live/channel tab (where local filtering applies) and a real row.
  if (msg && typeof isLiveSearchTab === 'function' && isLiveSearchTab(currentTab)) {
    items.push({
      label: `filter to ${username}`,
      fn: () => {
        const input = document.getElementById('hs-mc-search-input')
        if (!input) return
        input.value = '@' + String(username).toLowerCase()
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.focus()
      },
    })
  }
  // Chat-log items — twitch + kick (yt has no relay)
  const logPlatform = platform || 'twitch'
  if (logPlatform === 'twitch' || logPlatform === 'kick') {
    const msgChannel = msg?.dataset?.msgChannel || (typeof getLiveChannel === 'function' ? getLiveChannel() : null)
    if (msgChannel) {
      items.push({
        label: `chat logs in #${msgChannel}`,
        fn: () => openChatLogsView(username, { platform: logPlatform, channel: msgChannel }),
      })
    }
    items.push({ label: 'chat logs (all channels)', fn: () => openChatLogsView(username, { platform: logPlatform }) })
  }
  items.push('sep', {
    label: 'copy name',
    fn: () => {
      try {
        navigator.clipboard.writeText(username).catch(() => {})
      } catch {}
    },
  })
  if (msg)
    items.push({
      label: 'copy message',
      fn: () => {
        try {
          navigator.clipboard.writeText(_extractMcMsgText(msg)).catch(() => {})
        } catch {}
      },
    })
  if (feedDiv && typeof getActiveThreadCopyText === 'function') {
    const threadTxt = getActiveThreadCopyText()
    if (threadTxt)
      items.push({
        label: 'copy thread',
        fn: () => {
          try {
            navigator.clipboard
              .writeText(threadTxt)
              .then(() => showToast('thread copied', 'success'))
              .catch(() => {})
          } catch {}
        },
      })
  }
  if (msg) {
    const chainTxt = _extractMcChainText(msg)
    if (chainTxt)
      items.push({
        label: 'copy thread',
        fn: () => {
          try {
            navigator.clipboard
              .writeText(chainTxt)
              .then(() => showToast('thread copied', 'success'))
              .catch(() => {})
          } catch {}
        },
      })
  }
  if (feedMsg && typeof isOwnFeedPost === 'function' && isOwnFeedPost(feedMsg)) {
    items.push('sep')
    const remaining =
      (typeof EDIT_WINDOW_MS !== 'undefined' ? EDIT_WINDOW_MS : 0) -
      (Date.now() - new Date(feedMsg.created_at).getTime())
    if (remaining > 0) {
      const mins = Math.floor(remaining / 60000),
        secs = Math.floor((remaining % 60000) / 1000)
      items.push({
        label: `edit (${mins}:${String(secs).padStart(2, '0')})`,
        fn: () => {
          if (feedDiv && typeof showFeedEditUI === 'function') showFeedEditUI(feedDiv, feedMsg)
        },
      })
    } else {
      items.push({ label: 'edit (expired)', disabled: true })
    }
    items.push({
      label: 'delete',
      danger: true,
      fn: () => {
        if (typeof deleteFeedPost === 'function') deleteFeedPost(feedMsg)
      },
    })
  }
  showHsCtxMenu(x, y, username, items)
  // Async warm-up: cache miss or stale → fetch fresh and patch the menu's
  // follow/block labels in place. Survives the typical case where the user's
  // first interaction with a sender is a right-click (no hover-warmed cache).
  if (typeof resolveIdentity === 'function') {
    resolveIdentity(username, { platform })
      .then((ri) => {
        const r = ri?.profile?.relationship
        if (!r) return
        const menu = document.getElementById('hs-mc-msg-ctx')
        if (!menu) return
        const yf = !!(r.youFollow || r.isFollowing)
        const yb =
          !!(r.youBlock || r.isBlocked) ||
          (typeof isUserBlocked === 'function'
            ? isUserBlocked(username, platform)
            : blockedUsers.has(String(username).toLowerCase()))
        const followEl = menu.querySelector('[data-hs-key="follow"] .hs-mc-em-label')
        if (followEl) followEl.textContent = yf ? 'unfollow' : 'follow'
        const blockEl = menu.querySelector('[data-hs-key="block"] .hs-mc-em-label')
        if (blockEl) {
          blockEl.textContent = yb ? 'unblock' : 'block'
          blockEl.parentElement.classList.toggle('hs-mc-em-danger', !yb)
        }
      })
      .catch(() => {})
  }
}

// Expand a username/platform pair into ALL known cross-platform aliases.
// Combines local synchronous getUserAliases (7TV-derived kick→twitch from
// cosmetics flow) with heatsync /api/profile (canonical source for users on
// the platform: returns twitch_username + kick_username regardless of which
// direction you queried). Async because profile is one network round-trip.
async function expandUserAliases(username, platform) {
  const seen = new Set()
  const out = []
  const push = (v) => {
    if (!v) return
    const k = String(v).toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  // Sync local aliases first — kick→twitch from 7TV cosmetics, etc.
  const local =
    typeof getUserAliases === 'function' ? getUserAliases(username, platform) : [String(username || '').toLowerCase()]
  for (const a of local) push(a)
  // Heatsync profile lookup — registered users return both twitch_username
  // and kick_username. Non-registered users return error: we silently fall
  // back to local-only aliases.
  if (typeof resolveIdentity === 'function') {
    try {
      const ri = await resolveIdentity(username, { platform })
      const p = ri?.profile
      if (p) {
        if (p.twitch_username) push(p.twitch_username)
        if (p.kick_username) push(p.kick_username)
        if (p.youtube_username) push(p.youtube_username)
      }
    } catch {}
  }
  return out
}

// Namespaced-key variant of expandUserAliases (base + sync local links + async
// heatsync-profile links), each scoped to its platform. Mute/block ACTIONS use
// this so the write covers every linked identity with no bare-name collision.
async function expandUserAliasKeys(username, platform) {
  const seen = new Set()
  const out = []
  const push = (name, plat) => {
    const k = typeof userKey === 'function' ? userKey(name, plat) : String(name || '').toLowerCase()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(k)
  }
  push(username, platform)
  // sync local links (kick→twitch, yt→twitch) — already namespaced
  if (typeof getUserAliasKeys === 'function') {
    for (const k of getUserAliasKeys(username, platform)) {
      if (!seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
    }
  }
  // async heatsync-profile links — registered users expose linked handles,
  // each on its own platform
  if (typeof resolveIdentity === 'function') {
    try {
      const ri = await resolveIdentity(username, { platform })
      const p = ri?.profile
      if (p) {
        push(p.twitch_username, 'twitch')
        push(p.kick_username, 'kick')
        push(p.youtube_username, 'youtube')
      }
    } catch {}
  }
  return out
}

async function _toggleMcMute(username, platform) {
  const aliases = await expandUserAliases(username, platform)
  // Namespaced keys for the mute set + cross-tab messages — covers every linked
  // identity (async profile resolution) with no bare-name collision between
  // unrelated twitch:alice / kick:alice accounts. Bare `aliases` stays for the
  // toast note + restoreMcUnmutedDom (which match bare display names).
  const aliasKeys = await expandUserAliasKeys(username, platform)
  const primary = aliases[0] || String(username).toLowerCase()
  const wasMuted = typeof isUserMuted === 'function' ? isUserMuted(username, platform) : mutedUsers.has(primary)
  const wasUnmute = wasMuted
  if (wasMuted) {
    for (const k of aliasKeys) mutedUsers.delete(k)
    showToast(`unmuted ${username}`, 'success')
    for (const k of aliasKeys) safeSendMessage({ type: 'unmute_user', username: k })
  } else {
    for (const k of aliasKeys) mutedUsers.add(k)
    const otherAlias = aliases.slice(1).filter((a) => a !== primary)
    const aliasNote = otherAlias.length ? ` (+linked @${otherAlias.join(' @')})` : ''
    showToast(`muted ${username}${aliasNote} (24h)`, 'success')
    const exp = Date.now() + 86400000
    for (const k of aliasKeys) safeSendMessage({ type: 'mute_user', username: k, expiresAt: exp })
  }
  chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
  if (wasUnmute) {
    // restoreMcUnmutedDom matches by bare DOM text — use bare aliases here.
    for (const a of aliases) restoreMcUnmutedDom(a)
  }
  renderMessages(currentTab)
}

async function _toggleMcBlock(username, platform) {
  const aliases = await expandUserAliases(username, platform)
  const wasBlocked =
    typeof isUserBlocked === 'function' ? isUserBlocked(username, platform) : blockedUsers.has(aliases[0])
  if (wasBlocked) {
    for (const a of aliases) blockedUsers.delete(a)
    showToast(`unblocked ${username}`, 'success')
    for (const a of aliases) safeSendMessage({ type: 'unblock_user', username: a })
  } else {
    for (const a of aliases) blockedUsers.add(a)
    const primary = aliases[0] || String(username).toLowerCase()
    const other = aliases.slice(1).filter((a) => a !== primary)
    const aliasNote = other.length ? ` (+linked @${other.join(' @')})` : ''
    showToast(`blocked ${username}${aliasNote}`, 'success')
    for (const a of aliases) safeSendMessage({ type: 'block_user', username: a })
  }
  // buildMessageDiv filters blocked users, so a full re-render hides/restores them.
  renderMessages(currentTab)
}

// Build the plain-text dump of a chat reply chain (ancestors + this + descendants)
// using the channel buffer walkers exposed by main.js. Returns null when the
// row isn't part of a multi-message thread, so the menu item only appears
// where it would do something.
function _extractMcChainText(msg) {
  if (!msg) return null
  const lookup = window.__hsMcLookupMsg
  const walk = window.__hsMcWalkThread
  if (typeof lookup !== 'function' || typeof walk !== 'function') return null
  const channel = msg.dataset.msgChannel || ''
  const platform = msg.dataset.msgPlatform || ''
  const ownId = msg.dataset.msgId || ''
  if (!ownId) return null
  const own = lookup(channel, platform, ownId)
  if (!own) return null
  const { ancestors, descendants } = walk(channel, platform, own, 128) || { ancestors: [], descendants: [] }
  const chain = [...ancestors, own, ...descendants]
  if (chain.length < 2) return null
  return chain.map(_formatMcChainLine).join('\n')
}

function _formatMcChainLine(m) {
  const user = m.displayName || m.user || m.username || 'anon'
  const text = (m.text || m.message || m.body || '').replace(/\s+/g, ' ').trim()
  return `${user}: ${text}`
}

function _extractMcMsgText(msg) {
  // Walk siblings after the username link, gathering text nodes + emote alts.
  // textContent on the whole row leaks badge/timestamp/username junk; this
  // gives the readable body a user would expect "copy message" to produce.
  const userEl = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
  if (!userEl) return (msg.textContent || '').trim()
  const parts = []
  // Recursive walk: a node may interleave emotes and text (e.g.
  // "<emote> Kripp, when...") inside .hs-mc-text. querySelectorAll grabbed
  // only the emotes and dropped every text node between/after them, so a
  // message that started with an emote copied as just the emote name. Walk
  // every child in DOM order, emitting text nodes AND emote alts.
  const walk = (node) => {
    if (node.nodeType === 3) {
      parts.push(node.textContent)
      return
    }
    if (node.nodeType !== 1) return
    const cls = node.classList
    if (
      cls?.contains('hs-mc-platform-badge') ||
      cls?.contains('hs-mc-badge') ||
      cls?.contains('hs-mc-time') ||
      cls?.contains('hs-mc-reply-ctx') ||
      cls?.contains('hs-mc-reply-btn') ||
      cls?.contains('hs-mod-toolbar') ||
      cls?.contains('hs-mc-stack-collapse') ||
      cls?.contains('hs-mc-stack-block-all')
    )
      return
    if (node.tagName === 'IMG') {
      if (node.alt) parts.push(node.alt)
      return
    }
    if (cls?.contains('hs-mc-emoji')) {
      parts.push(node.textContent || '')
      return
    }
    for (const child of node.childNodes) walk(child)
  }
  let node = userEl.nextSibling
  while (node) {
    walk(node)
    node = node.nextSibling
  }
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*:\s*/, '')
    .trim()
}

function _prefillMcInput(text) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    input.value = text
    input.focus()
    try {
      input.setSelectionRange(text.length, text.length)
    } catch {}
  } else {
    input.textContent = text
    input.focus()
  }
}

// Cross-platform whisper open: when the target is a kick/yt user, resolve to
// their linked twitch handle via /api/profile?platform= so the typed /w lands
// on the right twitch acct (decapi only knows twitch). If they have no linked
// twitch, bail with a clear "try /dm" hint instead of letting /w 404.
async function _openWhisperFor(username, platform) {
  if (typeof switchTab === 'function') switchTab('whispers')
  let whisperName = username
  if (platform && platform !== 'twitch') {
    try {
      const resp = await apiFetch(
        `/api/profile/${encodeURIComponent(username.toLowerCase())}?platform=${encodeURIComponent(platform)}`,
      )
      const tw = resp?.data?.profile?.twitch_username || resp?.data?.profile?._linked_twitch_username
      if (tw) {
        whisperName = tw
      } else {
        showToast(`${username} has no twitch — try /dm instead`, 'error')
        return
      }
    } catch {
      // network failed — fall back to raw name, let /w try decapi
    }
  }
  _prefillMcInput(`/w ${whisperName} `)
}

// Cross-platform DM open: resolve username with the chat's platform hint so
// kick/yt-only handles map to their heatsync username. Without the hint the
// server only matches by users.username — fails when handles differ.
async function _openDmFor(username, platform) {
  if (typeof switchTab === 'function') switchTab('whispers')
  let hsName = username
  if (platform && platform !== 'heatsync') {
    try {
      const resp = await apiFetch(
        `/api/profile/${encodeURIComponent(username.toLowerCase())}?platform=${encodeURIComponent(platform)}`,
      )
      const u = resp?.data?.profile?.username
      if (u) {
        hsName = u
      } else {
        showToast(`${username} isn't on heatsync`, 'error')
        return
      }
    } catch {
      // network failed — fall back to raw name, let /dm try server-side
    }
  }
  _prefillMcInput(`/dm ${hsName} `)
}

function _mentionInMcInput(username) {
  showInputBar()
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  const mention = `@${username} `
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    const cur = input.value
    input.value = (cur && !cur.endsWith(' ') ? cur + ' ' : cur) + mention
    input.focus()
    try {
      input.setSelectionRange(input.value.length, input.value.length)
    } catch {}
  } else {
    // Append WITHOUT clobbering existing emote chips: reading/writing
    // textContent on a contenteditable strips every <img> chip the user already
    // typed. Insert a trailing text node (leading space when needed) and move
    // the caret to the end, preserving the composed message.
    input.focus()
    const last = input.lastChild
    const needsSpace = !!last && !(last.nodeType === Node.TEXT_NODE && /\s$/.test(last.textContent || ''))
    input.appendChild(document.createTextNode((needsSpace ? ' ' : '') + mention))
    try {
      const sel = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(input)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {}
    pendingMessage = getInputText()
  }
}

// Generic numbered/keyboard context menu. `items` is an array of either the
// string 'sep' or { label, fn, danger, good, disabled }. Actionable items are
// numbered 1..9 top-down for keyboard select. Used by every right-click surface.
function showHsCtxMenu(x, y, header, items) {
  document.getElementById('hs-mc-msg-ctx')?.remove()
  const menu = document.createElement('div')
  menu.id = 'hs-mc-msg-ctx'
  menu.className = 'hs-mc-ctx'
  menu.tabIndex = -1
  menu.addEventListener('contextmenu', (e) => e.preventDefault())

  const kbdHandlers = {}
  const kbdItems = [] // {el, fn} in DOM order; numbered 1..9 from the top
  if (header) {
    const h = document.createElement('div')
    h.className = 'hs-mc-em-header'
    h.textContent = header
    menu.appendChild(h)
  }
  for (const spec of items) {
    if (spec === 'sep') {
      const s = document.createElement('div')
      s.className = 'hs-mc-em-sep'
      menu.appendChild(s)
      continue
    }
    const it = document.createElement('div')
    it.className =
      'hs-mc-em-item' +
      (spec.danger ? ' hs-mc-em-danger' : '') +
      (spec.good ? ' hs-mc-em-good' : '') +
      (spec.disabled ? ' hs-mc-em-disabled' : '')
    if (spec.key) it.dataset.hsKey = spec.key
    const lab = document.createElement('span')
    lab.className = 'hs-mc-em-label'
    lab.textContent = spec.label
    it.appendChild(lab)
    if (!spec.disabled && spec.fn) {
      kbdItems.push({ el: it, fn: spec.fn })
      it.addEventListener('click', () => {
        dismiss()
        try {
          spec.fn()
        } catch {}
      })
    }
    menu.appendChild(it)
  }
  // Number top-down (key 1 is the first item, ascending downward).
  for (let i = 0; i < kbdItems.length && i < 9; i++) {
    const { el, fn } = kbdItems[i]
    const n = i + 1
    const k = document.createElement('span')
    k.className = 'hs-mc-em-kbd'
    k.textContent = String(n)
    el.appendChild(k)
    kbdHandlers[String(n)] = fn
  }

  document.body.appendChild(menu)
  menu.style.visibility = 'hidden'
  menu.style.left = '0px'
  menu.style.top = '0px'
  const mw = menu.offsetWidth,
    mh = menu.offsetHeight
  const vw = window.innerWidth,
    vh = window.innerHeight
  const flipX = x + mw + 8 > vw
  const flipY = y + mh + 8 > vh
  menu.style.left = (flipX ? Math.max(4, x - mw) : Math.min(x, vw - mw - 4)) + 'px'
  menu.style.top = (flipY ? Math.max(4, y - mh) : Math.min(y, vh - mh - 4)) + 'px'
  if (flipX) menu.classList.add('hs-mc-em-flip-x')
  if (flipY) menu.classList.add('hs-mc-em-flip-y')
  menu.style.visibility = ''
  try {
    menu.focus({ preventScroll: true })
  } catch {}

  function dismiss() {
    menu.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', keyHandler, true)
    document.removeEventListener('contextmenu', outside, true)
  }
  function outside(ev) {
    if (!menu.contains(ev.target)) dismiss()
  }
  function keyHandler(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      dismiss()
      return
    }
    const fn = kbdHandlers[ev.key]
    if (fn) {
      ev.preventDefault()
      dismiss()
      try {
        fn()
      } catch {}
    }
  }
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true)
    document.addEventListener('keydown', keyHandler, true)
    document.addEventListener('contextmenu', outside, true)
  }, 0)
}
function applyMcMutes() {
  document.querySelectorAll('.hs-mc-msg').forEach((msg) => {
    const userEl = msg.querySelector('.hs-mc-user')
    const username = userEl?.textContent?.trim()?.toLowerCase()
    const platform = userEl?.dataset?.platform
    const muted =
      username && (typeof isUserMuted === 'function' ? isUserMuted(username, platform) : mutedUsers.has(username))
    if (muted) {
      stripMcMutedMessage(msg)
    } else {
      msg.classList.remove('hs-mc-muted')
    }
  })
}
function restoreMcUnmutedDom(username) {
  // stripMcMutedMessage destroys content irreversibly. Remove those rows so the
  // next renderMessages() call rebuilds them from the buffer's _renderedHtml cache.
  const target = username?.toLowerCase()
  document.querySelectorAll('.hs-mc-msg.hs-mc-muted').forEach((msg) => {
    const userEl = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
    const u = userEl?.textContent?.trim()?.toLowerCase()
    if (!target || u === target) msg.remove()
  })
}
function stripMcMutedMessage(msg) {
  msg.classList.add('hs-mc-muted')
  // Message content is raw text nodes on the div — CSS can't hide those
  ;[...msg.childNodes].forEach((node) => {
    if (node.nodeType === 3) node.textContent = ''
  })
  // Mention links share .hs-mc-user (so they get color/hover) but live inside
  // the message body — strip them or they leak through the muted CSS.
  msg.querySelectorAll('.hs-mc-mention, .hs-mc-reply-ctx').forEach((el) => el.remove())
  // Remove emote images and other content (not user/badge/timestamp/platform)
  msg.querySelectorAll('img:not(.hs-mc-badge-img), .heatsync-emote-wrapper, .hs-mc-emote').forEach((el) => {
    if (
      !el.closest('.hs-mc-user') &&
      !el.classList.contains('hs-mc-badge-img') &&
      !el.classList.contains('hs-mc-platform-badge')
    ) {
      el.remove()
    }
  })
}

function updateInputPlaceholder() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  let placeholder
  if (currentTab === 'feed') {
    placeholder = t('mc_input_post_heatsync')
  } else if (currentTab === 'live') {
    const channel = getLiveChannel()
    placeholder = channel ? t('mc_input_send_channel', [channel]) : t('mc_input_send_message')
  } else if (currentTab === 'mentions') {
    const channel = getCurrentChannel()
    placeholder = channel ? t('mc_input_send_channel', [channel]) : t('mc_input_send_message')
  } else if (currentTab === 'whispers') {
    const lastUser = lastWhisperKey ? whisperUsers.get(lastWhisperKey) : null
    placeholder = lastUser ? `/r to reply to ${lastUser.displayName}` : t('mc_whisper_hint')
  } else if (currentTab === 'add') {
    placeholder = ''
  } else {
    // Channel tab — resolve display name for placeholder
    const ch = config.channels.find((c) => c.id === currentTab)
    const chanName =
      ch?.twitch ||
      ch?.kick ||
      ch?.youtube?.replace(/^https?:\/\/(www\.)?youtube\.com\/@?/, '').replace(/\/.*/, '') ||
      ch?.id
    placeholder = t('mc_input_send_channel', [chanName])
  }

  if (wysiwygEnabled) {
    input.dataset.placeholder = placeholder
  } else {
    input.placeholder = placeholder
  }
}
function handleInputKeydown(e) {
  const input = e.target

  // Stop propagation so platform shortcuts (Kick theater "t", etc.) don't fire
  e.stopPropagation()

  // Slash dropdown navigation — intercept before emoji/tab/enter
  if (slashAcState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashAcState.index = (slashAcState.index + 1) % slashAcState.matches.length
      showSlashDropdown(slashAcState.matches, slashAcState.index)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashAcState.index = (slashAcState.index - 1 + slashAcState.matches.length) % slashAcState.matches.length
      showSlashDropdown(slashAcState.matches, slashAcState.index)
      return
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const sel = slashAcState.matches[slashAcState.index]
      if (sel) insertSlashCommand(sel)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideSlashDropdown()
      return
    }
  }

  // Emoji dropdown navigation — intercept before other handlers
  if (emojiAcState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      emojiAcState.index = (emojiAcState.index + 1) % emojiAcState.matches.length
      showEmojiDropdown(emojiAcState.matches, emojiAcState.index)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      emojiAcState.index = (emojiAcState.index - 1 + emojiAcState.matches.length) % emojiAcState.matches.length
      showEmojiDropdown(emojiAcState.matches, emojiAcState.index)
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const emojiMatch = emojiAcState.matches[emojiAcState.index]
      // Build full match list for Tab cycling (emotes + emojis matching the query)
      const allMatches = findEmoteMatches(':' + emojiAcState.query)
      insertEmojiFromDropdown(emojiMatch)
      // Set up acState so subsequent Tabs cycle through all matches
      if (e.key === 'Tab' && allMatches.length > 1) {
        acState.matches = allMatches
        // Find the inserted emoji's index in the full match list
        acState.index = allMatches.findIndex((m) => m.type === 'emoji' && m.emoji === emojiMatch.emoji)
        if (acState.index === -1) acState.index = 0
        acState.active = true
        // For plain text input, set wordStart/afterText so cycling works
        if (!wysiwygEnabled && input.value !== undefined) {
          const val = input.value
          const cursor = input.selectionStart
          // The emoji was just inserted — find where it starts
          acState.wordStart = cursor - emojiMatch.emoji.length
          // afterText is everything after cursor
          acState.afterText = val.slice(cursor)
        }
        // For WYSIWYG, mark the inserted emoji span as cycling element.
        // insertEmojiFromDropdown wraps the emoji in span.hs-mc-emoji — find
        // the most-recently inserted one and tag it for cycling.
        if (wysiwygEnabled) {
          const inputEl = document.getElementById('hs-mc-input')
          const spans = inputEl?.querySelectorAll('span.hs-mc-emoji[data-emoji-name="' + emojiMatch.name + '"]')
          const span = spans?.[spans.length - 1]
          if (span) {
            span.classList.add('hs-cycling-text')
            span.dataset.completionName = emojiMatch.name
          }
        }
        showCycleTooltip()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideEmojiDropdown()
      return
    }
  }

  // Message history navigation (ArrowUp/ArrowDown)
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && mcMessageHistory.length > 0) {
    const currentText = getInputText().trim()
    if (
      mcHistoryIndex >= 0 ||
      (e.key === 'ArrowUp' && currentText.length === 0) ||
      (e.key === 'ArrowUp' && mcMessageHistory.includes(currentText))
    ) {
      e.preventDefault()
      if (e.key === 'ArrowUp') {
        if (mcHistoryIndex < 0) mcHistoryDraft = currentText
        mcHistoryIndex = Math.min(mcHistoryIndex + 1, mcMessageHistory.length - 1)
      } else {
        mcHistoryIndex--
      }
      const text = mcHistoryIndex < 0 ? mcHistoryDraft : mcMessageHistory[mcHistoryIndex]
      if (wysiwygEnabled) {
        restoreWysiwygText(input, text)
      } else {
        input.value = text
      }
      mcHistoryIndex = Math.max(mcHistoryIndex, -1)
      return
    }
  }

  // Backspace at the boundary of an input emote / stack — delete the whole
  // unit instead of letting contenteditable nibble at child overlays one at
  // a time. "input emote unit" = .hs-input-emote IMG or .hs-input-stack span.
  if (e.key === 'Backspace' && wysiwygEnabled && input?.isContentEditable) {
    const sel = window.getSelection()
    if (sel?.rangeCount && sel.isCollapsed) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      const offset = range.startOffset
      const isInputEmoteUnit = (el) =>
        el?.nodeType === Node.ELEMENT_NODE &&
        ((el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) || el.classList?.contains('hs-input-stack'))
      let target = null
      if (node.nodeType === Node.TEXT_NODE) {
        // At start of text node → previous sibling
        if (offset === 0 && isInputEmoteUnit(node.previousSibling)) {
          target = node.previousSibling
        }
        // After a single leading space following an emote → consume the space
        // first, then on the next backspace the unit deletes (no double-jump).
        else if (
          offset === 1 &&
          (node.textContent[0] === ' ' || node.textContent[0] === ' ') &&
          isInputEmoteUnit(node.previousSibling)
        ) {
          // Consume the auto-space on this Backspace; the next press will
          // land at offset 0 and pop the chip. Two presses total — matches
          // typed-space semantics so a Tab-inserted unit deletes as if the
          // user had typed "Kappa" + space themselves.
          e.preventDefault()
          node.textContent = node.textContent.slice(1)
          const r = document.createRange()
          r.setStart(node, 0)
          r.collapse(true)
          sel.removeAllRanges()
          sel.addRange(r)
          pendingMessage = getInputText()
          return
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
        // Cursor between element children: previous child
        const prev = node.childNodes[offset - 1]
        if (isInputEmoteUnit(prev)) target = prev
      }
      if (target) {
        // Just delete the one chip — never auto-merge adjacent chips back
        // to text. The "merge intent" path was destroying valid WYSIWYG
        // state on every backspace.
        e.preventDefault()
        target.remove()
        pendingMessage = getInputText()
        updateCharCount()
        return
      }
    }
  }

  // Tab - cycle through emote completions OR apply FFZ modifier to prev emote
  if (e.key === 'Tab') {
    e.preventDefault()

    // FFZ-style modifier on Tab — scans ENTIRE input (not just cursor) for any
    // modifier shorthand adjacent to an emote, applies them all in one shot.
    // Type `Kappa w` then Tab from any cursor position → wide Kappa.
    if (!acState.active) {
      if (scanAndApplyModifiersInInput(input)) return
      // Tab also commits a pending "<emote>0" / "<emoji>0" overlay (parity with
      // the live typing path) — overlay onto the left, drop the trailing 0.
      if (wysiwygEnabled && input?.isContentEditable && tryOverlayOnZero(input)) return
    }

    if (acState.active && acState.matches.length > 0) {
      // Already cycling - next (Tab) or previous (Shift+Tab)
      const len = acState.matches.length
      acState.index = (acState.index + (e.shiftKey ? len - 1 : 1)) % len
      insertCompletionKeepOpen(acState.matches[acState.index])
      // Lazy 7TV/BTTV/FFZ search: when you LAND on the last local match (cycling
      // either direction — forward-Tab through, or Shift+Tab back to it), pull the
      // catalog so the next forward Tab keeps cycling into remote hits. The common
      // case (your channel/own/global emote is right there) never touches the
      // network. Fires once per search. Triggered before the tooltip so it can show
      // the live "searching 7tv…" state immediately.
      if (!acState.remoteDone && !acState.remotePending && acState.index === len - 1 && acState.search) {
        fetchRemoteEmoteMatches(acState.search)
      }
      showCycleTooltip()
    } else {
      // First Tab - find matches. WYSIWYG: if the typed word touches a preceding
      // emote chip (auto-space backspaced, then chars typed), unwrap+merge first
      // so re-completion searches the full word (SupHomie + 3 → SupHomie3).
      if (wysiwygEnabled) mergeChipIntoWordForRecompletion(input)
      const word = getCurrentWord(input)
      if (word.length >= 2) {
        const matches = findEmoteMatches(word)
        // Set up cycling state even with zero local matches — the cross-provider
        // remote search (7TV/BTTV/FFZ) may still populate it (e.g. an emote that
        // isn't in the channel's loaded set), and it auto-inserts on arrival.
        acState.matches = matches
        acState.index = 0
        acState.active = true
        acState.search = word
        acState.remoteDone = false
        acState.remotePending = false

        if (!wysiwygEnabled && input.value !== undefined) {
          // Calculate positions for text input cycling (textarea only)
          const text = input.value
          const pos = input.selectionStart
          const before = text.slice(0, pos)
          const wordStart = before.search(/\S+$/)
          acState.wordStart = wordStart >= 0 ? wordStart : pos
          // Skip past rest of word after cursor
          let wordEnd = pos
          while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++
          acState.afterText = text.slice(wordEnd)
        }

        if (matches.length > 0) {
          insertCompletionKeepOpen(matches[0])
          showCycleTooltip()
          // Local matches satisfy the common case — do NOT hit 7TV/BTTV/FFZ yet.
          // The catalog search fires lazily, only once you cycle past the last
          // local match (see Tab-cycle branch above).
        } else {
          // No local hit at all — the cross-provider catalog search is the only
          // way to complete this word, so fire it now; it inserts the first
          // remote hit when the fetch resolves.
          fetchRemoteEmoteMatches(word)
        }
      }
    }
    return
  }

  // Any other key resets autocomplete cycling (ignore modifier keys)
  if (acState.active && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
    hideAutocomplete()
  }

  // Enter - send message
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
    return
  }

  // Escape - cancel reply state and hide autocomplete
  if (e.key === 'Escape') {
    if (replyState) clearReplyState()
    hideAutocomplete()
    return
  }
}

// Inline chips = atomic input pieces (emote IMG, stack, mention, emoji span).
function isInlineChip(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false
  return (
    (el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) ||
    el.classList?.contains('hs-input-stack') ||
    el.classList?.contains('hs-mc-user') ||
    el.classList?.contains('hs-mc-emoji')
  )
}

// Source-text representation of a chip (so unwrapping preserves what the
// user originally typed and lets them re-trigger conversion after fixing
// the missing space).
function chipToText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null
  if (el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) {
    let txt = el.dataset.emoteName || el.alt || ''
    const mods = el.dataset.hsWords || el.dataset.hsModWords
    if (mods) {
      for (const w of mods.split(/\s+/).filter(Boolean)) txt += ' ' + w
      // Trailing space keeps modifier tokens parseable when merged into adjacent
      // text — "Kappa w!" + "4He" must become "Kappa w! 4He", not "Kappa w!4He".
      txt += ' '
    }
    return txt
  }
  if (el.classList?.contains('hs-input-stack')) {
    const parts = []
    for (const child of el.children) {
      if (child.classList?.contains('hs-mc-emoji')) {
        const name = child.dataset.emojiName || child.getAttribute('data-emoji-name')
        parts.push(name ? ':' + name + ':' : child.textContent || '')
        continue
      }
      if (child.tagName !== 'IMG') continue
      let txt = child.dataset.emoteName || child.alt || ''
      const mods = child.dataset.hsWords || child.dataset.hsModWords
      if (mods) {
        for (const w of mods.split(/\s+/).filter(Boolean)) txt += ' ' + w
        txt += ' '
      }
      parts.push(txt)
    }
    return parts.join(' ')
  }
  if (el.classList?.contains('hs-mc-user')) {
    const u = el.dataset.username || el.textContent || ''
    return el.dataset.completionType === 'user-bare' ? '@' + u : u
  }
  if (el.classList?.contains('hs-mc-emoji')) {
    const name = el.dataset.emojiName || el.getAttribute('data-emoji-name')
    return name ? ':' + name + ':' : el.textContent || ''
  }
  return null
}

// Peel a trailing unicode emoji grapheme off a string. Used to stack an
// overlay emote onto a raw-typed/pasted emoji that was never converted to a
// .hs-mc-emoji span (only :shortcode: gets live-converted). Returns
// { emoji, rest } or null. Grapheme segmentation keeps ZWJ sequences, skin
// tones, and VS16 emoji intact.
function peelTrailingEmoji(s) {
  if (!s) return null
  let segmenter
  try {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  } catch (_) {
    return null
  }
  const graphemes = [...segmenter.segment(s)].map((g) => g.segment)
  if (!graphemes.length) return null
  const last = graphemes[graphemes.length - 1]
  if (typeof UNICODE_EMOJI_RE === 'undefined' || !UNICODE_EMOJI_RE.test(last)) return null
  return { emoji: last, rest: graphemes.slice(0, -1).join('') }
}

// If the word being auto-converted starts at offset 0 of its text node and
// the previous sibling is a chip with no whitespace separator, unwrap that
// chip back to plain text and signal the caller to skip the conversion.
// Both the chip and the word stay as plain text so the user can see the
// missing space and add it.
function deflectAdjacentChip(node, wordStart) {
  if (wordStart !== 0) return false
  const prev = node.previousSibling
  if (!isInlineChip(prev)) return false
  const chipText = chipToText(prev)
  if (chipText == null) return false
  prev.parentNode.replaceChild(document.createTextNode(chipText), prev)
  pendingMessage = getInputText()
  return true
}

// Scan for any two adjacent chips with no real content between them and
// unwrap both back to plain text in place. `acceptWhitespace` widens the
// definition of "no content" to include whitespace-only nodes — used on
// deletion events so a single backspace can collapse a 2-char nbsp+space
// gap (which Tab insertion + user-typed space leaves between chips).
function buildInputEmoteImg(emote) {
  const img = document.createElement('img')
  img.src = emote.url
  img.alt = emote.name
  img.dataset.emoteName = emote.name
  img.className = 'hs-input-emote'
  img.draggable = false
  if (typeof attachInputEmoteErrorRecovery === 'function') attachInputEmoteErrorRecovery(img)
  return img
}

function imagifyValidWordsInTextNode(textNode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false
  if (typeof lookupEmoteWithOverlay !== 'function') return false
  const text = textNode.textContent
  if (!text.trim()) return false
  const parts = text.split(/(\s+)/)
  const replacements = []
  let didChange = false
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (/^\s+$/.test(part)) {
      replacements.push(document.createTextNode(part))
      continue
    }
    const hasLeftWs = i === 0 || (parts[i - 1] && /^\s+$/.test(parts[i - 1]))
    const hasRightWs = i === parts.length - 1 || (parts[i + 1] && /^\s+$/.test(parts[i + 1]))
    if (!hasLeftWs || !hasRightWs) {
      replacements.push(document.createTextNode(part))
      continue
    }
    // Blocked emotes must stay plain text here too — buildInputEmoteImg (below)
    // skips the blockedEmoteNames check that createInputEmoteImg applies, so
    // without this a blocked emote reaching a text node (paste/undo/unwrap)
    // would silently render as a live chip, defeating the block.
    if (typeof blockedEmoteNames !== 'undefined' && blockedEmoteNames.has(part)) {
      replacements.push(document.createTextNode(part))
      continue
    }
    let resolved = null
    try {
      resolved = lookupEmoteWithOverlay(part)
    } catch (_) {}
    if (!resolved?.emote) {
      replacements.push(document.createTextNode(part))
      continue
    }
    replacements.push(buildInputEmoteImg(resolved.emote))
    didChange = true
  }
  if (!didChange) return false
  const frag = document.createDocumentFragment()
  for (const n of replacements) frag.appendChild(n)
  textNode.parentNode.replaceChild(frag, textNode)
  return true
}

// Restore a plain wire-text string into the WYSIWYG composer AS chips. History
// recall and pending-send retry store the serialized plain form (e.g.
// "KEKW hello"); writing it straight to textContent shows raw emote names, so
// re-imagify each resulting text node and drop the caret at the end.
function restoreWysiwygText(input, text) {
  if (!input) return
  input.textContent = text
  for (const child of [...input.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) imagifyValidWordsInTextNode(child)
  }
  try {
    const sel = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {}
}

function unwrapStuckChips(inputEl, acceptWhitespace) {
  if (!inputEl) return false
  let changed = false
  let cursorTarget = null
  let cursorOffset = 0
  // Bounded loop so a malformed DOM can't spin forever.
  for (let pass = 0; pass < 50; pass++) {
    const allChips = inputEl.querySelectorAll('img.hs-input-emote, .hs-input-stack, .hs-mc-user, .hs-mc-emoji')
    // Skip imgs nested inside a stack — overlay children are LEGITIMATELY
    // touching (that's the whole point of stacking). Without this filter,
    // every stacked emote collapses to "KappaWave" text on the next input.
    const chips = [...allChips].filter(
      (c) =>
        !(
          c.parentElement?.classList?.contains('hs-input-stack') &&
          (c.tagName === 'IMG' || c.classList?.contains('hs-mc-emoji'))
        ),
    )
    let pair = null
    for (let i = 0; i < chips.length - 1; i++) {
      const a = chips[i]
      const b = chips[i + 1]
      if (a.parentNode !== b.parentNode) continue
      let n = a.nextSibling
      let blocked = false
      const between = []
      while (n && n !== b) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.length > 0) {
          if (acceptWhitespace && /^\s+$/.test(n.textContent)) {
            between.push(n)
            n = n.nextSibling
            continue
          }
          blocked = true
          break
        }
        between.push(n)
        n = n.nextSibling
      }
      if (!blocked) {
        pair = { a, b, between }
        break
      }
    }
    if (!pair) break
    const aText = chipToText(pair.a)
    const bText = chipToText(pair.b)
    if (aText == null || bText == null) break
    // Two adjacent valid chips (paste of an emote name right after an
    // existing chip is the common case) — insert a single space between them
    // instead of collapsing both into "WaVeWaVe" plain text. Wire payload
    // becomes `WaVe WaVe` which parses correctly on the receiver. The
    // original unwrap-to-text path destroyed both chips on every paste.
    const isValidChip = (el) =>
      (el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) ||
      el.classList?.contains('hs-input-stack') ||
      el.classList?.contains('hs-mc-emoji') ||
      el.classList?.contains('hs-mc-user')
    if (isValidChip(pair.a) && isValidChip(pair.b)) {
      for (const m of pair.between) m.remove()
      const space = document.createTextNode(' ')
      pair.a.parentNode.insertBefore(space, pair.b)
      cursorTarget = space
      cursorOffset = 1
      changed = true
      continue
    }
    const merged = aText + bText
    const parent = pair.a.parentNode
    const textNode = document.createTextNode(merged)
    for (const m of pair.between) m.remove()
    pair.b.remove()
    parent.replaceChild(textNode, pair.a)
    cursorTarget = textNode
    cursorOffset = aText.length
    changed = true
  }
  // After merging, re-imagify whitespace-separated valid emote names in the
  // resulting text so only the touching boundary stays as text. Matches
  // what the chat-side parseEmotes will render from the wire.
  if (changed) {
    for (const child of [...inputEl.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) imagifyValidWordsInTextNode(child)
    }
  }
  if (changed && cursorTarget && cursorTarget.parentNode) {
    const sel = window.getSelection()
    if (sel) {
      const r = document.createRange()
      r.setStart(cursorTarget, Math.min(cursorOffset, cursorTarget.textContent.length))
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
    pendingMessage = getInputText()
  }
  return changed
}

function handleInputChange(e) {
  // Defensive: pull any stray text nodes out of .hs-input-stack spans.
  // Stacks are inline-grid with overlay imgs at grid-area 1/1; a text node
  // inside auto-places in a new row and renders BELOW the emote. If the
  // cursor was inside the stack when the user typed (e.g. clicked an emote
  // in the stack, or a path that left selection inside), text gets trapped.
  // Also retro-fits contenteditable=false on legacy stacks built before
  // this fix so the cursor can't re-enter.
  const inputEl = document.getElementById('hs-mc-input')
  if (inputEl) {
    for (const stack of inputEl.querySelectorAll('.hs-input-stack')) {
      if (stack.getAttribute('contenteditable') !== 'false') {
        stack.setAttribute('contenteditable', 'false')
      }
      let n = stack.firstChild
      while (n) {
        const next = n.nextSibling
        // Keep IMG (emote base/overlay) AND .hs-mc-emoji (emoji base/overlay) —
        // both are legitimate stack children. Evict only trapped text/other nodes.
        if (
          n.nodeType === Node.TEXT_NODE ||
          (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'IMG' && !n.classList?.contains('hs-mc-emoji'))
        ) {
          stack.parentNode.insertBefore(n, stack.nextSibling)
        }
        n = next
      }
    }
    // Standalone emoji spans must be atomic too. Without contenteditable=false
    // the caret enters the span when the user backspaces the trailing space, so
    // the next typed char (e.g. the "0" of an emoji overlay) lands INSIDE the
    // span — where it inherits the 2x emoji font-size (huge) and never reaches
    // overlay detection. Retrofit cE=false and evict any non-emoji text to a
    // sibling right after the span, moving the caret there so tryOverlayOnZero
    // sees it as the next word.
    for (const em of inputEl.querySelectorAll('.hs-mc-emoji')) {
      if (em.closest('.hs-input-stack')) continue
      if (em.getAttribute('contenteditable') !== 'false') em.setAttribute('contenteditable', 'false')
      const name = em.dataset.emojiName || em.getAttribute('data-emoji-name')
      const want = name && typeof _emojiMap !== 'undefined' ? _emojiMap.get(name) : null
      const full = em.textContent || ''
      if (want && full !== want && full.startsWith(want)) {
        const extra = full.slice(want.length)
        em.textContent = want
        if (extra) {
          const t = document.createTextNode(extra)
          em.parentNode.insertBefore(t, em.nextSibling)
          const sel = window.getSelection()
          if (sel) {
            const r = document.createRange()
            r.setStart(t, t.textContent.length)
            r.collapse(true)
            sel.removeAllRanges()
            sel.addRange(r)
          }
        }
      }
    }
  }

  // Two chips with LITERALLY no content between them are unrecoverable
  // (wire payload reads as `KEKWPogChamp`) — unwrap as a paste/bug safety
  // net only. Never collapse on whitespace-between: that was eating WYSIWYG
  // state on every backspace ("turns to text").
  if (inputEl) unwrapStuckChips(inputEl, false)

  // Save pending message (persists across tab switches)
  pendingMessage = getInputText()

  // Slash command autocomplete — synchronous, only matches "/word" at start
  checkSlashAutocomplete()

  // Debounced emoji dropdown autocomplete
  if (_emojiAcDebounce) cleanup.clearTimeout(_emojiAcDebounce)
  _emojiAcDebounce = cleanup.setTimeout(checkEmojiAutocomplete, 80)

  // Reset autocomplete cycling on any text change
  if (acState.active) {
    hideAutocomplete()
  }

  // Live emoji conversion in contenteditable: :shortcode: → emoji span
  if (wysiwygEnabled && _emojiMap.size > 0) {
    const input = document.getElementById('hs-mc-input')
    if (input?.isContentEditable) {
      const sel = window.getSelection()
      if (!sel?.rangeCount) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node?.nodeType !== Node.TEXT_NODE) return
      const text = node.textContent
      const cursorOffset = range.startOffset
      // Look for :shortcode: ending at cursor
      const before = text.slice(0, cursorOffset)
      const match = before.match(/:([a-z0-9_]+):$/)
      if (match) {
        const emoji = _emojiMap.get(match[1])
        if (emoji) {
          const start = cursorOffset - match[0].length
          if (deflectAdjacentChip(node, start)) return
          // Replace the :shortcode: text with emoji span
          const span = document.createElement('span')
          span.className = 'hs-mc-emoji'
          span.textContent = emoji
          span.title = ':' + match[1] + ':'
          span.setAttribute('data-emoji-name', match[1])
          span.setAttribute('contenteditable', 'false') // atomic — caret can't enter
          const tail = text.slice(cursorOffset)
          const head = text.slice(0, start)
          // Trailing space prevents fused tokens on the wire.
          const trailing = !/^\s/.test(tail) ? ' ' : ''
          // Leading space when the new emoji lands right after an existing
          // chip — without it the chip-merge safeguard collapses both back
          // to plain text.
          let leading = ''
          if (!head) {
            const prev = node.previousSibling
            const prevIsChip =
              prev?.nodeType === Node.ELEMENT_NODE &&
              ((prev.tagName === 'IMG' && (prev.classList?.contains('hs-input-emote') || prev.dataset?.emoteName)) ||
                prev.classList?.contains('hs-input-stack') ||
                prev.classList?.contains('hs-mc-emoji') ||
                prev.classList?.contains('hs-mc-user'))
            if (prevIsChip) leading = ' '
          }
          const beforeNode = document.createTextNode(leading + head)
          const afterNode = document.createTextNode(trailing + tail)
          const parent = node.parentNode
          parent.insertBefore(beforeNode, node)
          parent.insertBefore(span, node)
          parent.insertBefore(afterNode, node)
          parent.removeChild(node)
          // Place cursor after emoji + space
          const newRange = document.createRange()
          newRange.setStart(afterNode, Math.min(trailing.length, afterNode.textContent.length))
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          pendingMessage = getInputText()
          return
        }
      }
    }
  }

  // Note: "<emote>0" / "<emoji>0" overlays are committed on Tab (see the Tab
  // branch in handleInputKeydown), NOT live on the "0" keystroke — typing the 0
  // leaves it as plain text so the user can see it before confirming with Tab.

  // Live emote replacement: "emoteName " → <img> (triggered on space after emote name)
  if (wysiwygEnabled) {
    const input = document.getElementById('hs-mc-input')
    if (input?.isContentEditable) {
      const sel = window.getSelection()
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node?.nodeType === Node.TEXT_NODE) {
          const text = node.textContent
          const cursor = range.startOffset
          const before = text.slice(0, cursor)
          const match = before.match(/(\S+)\s$/)
          if (match) {
            const word = match[1]
            // FFZ-style modifier token / chain — apply to the previous emote
            // (don't insert as BTTV emote even if "w!" is a real emote name).
            // Live-replace modifier path — delegate to shared lib + apply.
            const cls = hsModClassify(word, { allowPrefix: false })
            if (cls.kind === 'modifier') {
              let prev = node.previousSibling
              while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                prev = prev.previousSibling
              }
              const targetImg = hsModAnchorEl(prev)
              if (targetImg) {
                {
                  hsModApplyToImg(targetImg, cls.mods, cls.hue, cls.words)
                  const wordStart = cursor - match[0].length
                  node.textContent = text.slice(0, wordStart) + (text.slice(cursor) || ' ')
                  const nr = document.createRange()
                  nr.setStart(node, wordStart)
                  nr.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(nr)
                  pendingMessage = getInputText()
                  return
                }
              }
              // Modifier without an anchor — keep as plain text, don't insert as BTTV emote
              return
            }
            // Live auto-convert: in-set emotes only. Channel/global emotes
            // (incl. lowercase word collisions like "what") stay text until Tab.
            let resolved = lookupEmoteWithOverlay(word, { ownedOnly: true })
            // Exception: a zero-width OVERLAY emote (e.g. "Wave") auto-stacks
            // onto a preceding emote even when it's only a channel/global emote
            // (not in your set). Overlays read as nonsense inline so there's no
            // "what"-style word-collision risk, and this mirrors how chat stacks
            // them without a space. Gated on an actual preceding base so a lone
            // overlay name typed as prose stays text until Tab.
            if (!resolved) {
              const ov = lookupEmoteWithOverlay(word)
              if (ov && ov.isOverlay) {
                const bt = text.slice(0, cursor - match[0].length)
                let stackable = false
                if (bt.trim() === '') {
                  let p = node.previousSibling
                  while (p && p.nodeType === Node.TEXT_NODE && p.textContent.trim() === '') p = p.previousSibling
                  stackable = !!(
                    p &&
                    ((p.tagName === 'IMG' && p.classList.contains('hs-input-emote')) ||
                      p.classList?.contains('hs-input-stack') ||
                      p.classList?.contains('hs-mc-emoji'))
                  )
                } else {
                  stackable = !!peelTrailingEmoji(bt.replace(/\s+$/, ''))
                }
                if (stackable) resolved = ov
              }
            }
            // Blocked emotes never auto-render in the composer. A common word
            // that collides with a blocked owned emote name (e.g. "emote")
            // must stay plain text, not convert to the blocked-placeholder
            // chip (1×1 gif + dashed rect that reads as a broken emote).
            if (resolved && blockedEmoteNames.has(word)) resolved = null
            if (resolved) {
              const wordStart = cursor - match[0].length
              if (deflectAdjacentChip(node, wordStart)) return
              const img = createInputEmoteImg(word)
              if (img) {
                const beforeText = text.slice(0, wordStart)
                const afterText = text.slice(cursor)
                const parent = node.parentNode
                const isZeroWidth = resolved.isOverlay

                // Zero-width: stack onto previous emote if possible
                if (isZeroWidth && beforeText.trim() === '') {
                  // Look for emote element before this text node
                  let prev = node.previousSibling
                  while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                    prev = prev.previousSibling
                  }
                  if (
                    prev &&
                    ((prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
                      prev.classList?.contains('hs-input-stack') ||
                      prev.classList?.contains('hs-mc-emoji'))
                  ) {
                    // Remove whitespace text nodes between prev and current
                    let ws = prev.nextSibling
                    while (ws && ws !== node) {
                      const rm = ws
                      ws = ws.nextSibling
                      rm.remove()
                    }
                    stackInputEmote(prev, img)
                    node.textContent = afterText || ' '
                    const newRange = document.createRange()
                    newRange.setStart(node, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    pendingMessage = getInputText()
                    return
                  }
                }

                // Zero-width onto a raw unicode emoji typed/pasted as plain
                // text (never converted to a .hs-mc-emoji span). Peel the
                // trailing emoji, wrap it as a span, and stack onto it — parity
                // with chat's processEmotes, which treats emoji as a base.
                if (isZeroWidth) {
                  const peeled = peelTrailingEmoji(beforeText.replace(/\s+$/, ''))
                  if (peeled) {
                    const restNode = peeled.rest ? document.createTextNode(peeled.rest) : null
                    const emojiSpan = document.createElement('span')
                    emojiSpan.className = 'hs-mc-emoji'
                    emojiSpan.textContent = peeled.emoji
                    if (restNode) parent.insertBefore(restNode, node)
                    parent.insertBefore(emojiSpan, node)
                    stackInputEmote(emojiSpan, img)
                    node.textContent = afterText || ' '
                    const newRange = document.createRange()
                    newRange.setStart(node, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    pendingMessage = getInputText()
                    return
                  }
                }

                // Regular emote: replace text with img
                const beforeNode = beforeText ? document.createTextNode(beforeText) : null
                const afterNode = document.createTextNode(afterText || ' ')
                if (beforeNode) parent.insertBefore(beforeNode, node)
                parent.insertBefore(img, node)
                parent.insertBefore(afterNode, node)
                parent.removeChild(node)
                const newRange = document.createRange()
                newRange.setStart(afterNode, 0)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                // Cascade: if afterNode begins with another emote name (the
                // "user just re-spaced two stuck names" pattern), imagify
                // those too, separated by nbsp. Stops as soon as the next
                // word isn't an emote, or has whitespace before it (the
                // user explicitly separated them). Skip overlay/zero-width
                // emotes \u2014 those need stack handling we don't replicate here.
                while (true) {
                  const cm = afterNode.textContent.match(/^(\S+)(\s|$)/)
                  if (!cm) break
                  const cName = cm[1]
                  const cResolved = lookupEmoteWithOverlay(cName, { ownedOnly: true })
                  if (!cResolved || cResolved.isOverlay || blockedEmoteNames.has(cName)) break
                  const cImg = createInputEmoteImg(cName)
                  if (!cImg) break
                  parent.insertBefore(document.createTextNode('\u00A0'), afterNode)
                  parent.insertBefore(cImg, afterNode)
                  // Keep the leading whitespace from after the consumed name
                  // \u2014 it acts as the user's explicit separator and also
                  // prevents the next iteration from cascading further.
                  const remaining = afterNode.textContent.slice(cName.length)
                  afterNode.textContent = remaining || ' '
                  newRange.setStart(afterNode, remaining ? 0 : 1)
                  newRange.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(newRange)
                  if (!remaining) break
                }
                pendingMessage = getInputText()
              }
            }
          }
        }
      }
    }
  }
}

// Commit an overlay-on-zero: when the word ending at the cursor is "<emote>0" or
// "<:emoji:>0" (the overlay convention), convert it to an overlay chip and stack
// it onto the emote/stack/emoji to its left, then leave a trailing space the user
// can backspace. Invoked on Tab (NOT live on the "0" keystroke). Entry shapes:
//   (1) "0" after an emote chip — chip name merged → "centipede0" overlay
//   (2) "0" after an emoji chip — that emoji span relocated as the overlay
//   (3) typed-out "centipede0" text word → emote overlay
//   (4) typed-out ":smile:0" text word → emoji overlay (if it never span-converted)
// Returns true if it consumed the word.
function tryOverlayOnZero(input) {
  const sel = window.getSelection()
  if (!sel?.rangeCount || !sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  let node = range.startContainer
  let cursor = range.startOffset
  if (node.nodeType === Node.ELEMENT_NODE && cursor > 0) {
    const child = node.childNodes[cursor - 1]
    if (child?.nodeType === Node.TEXT_NODE) {
      node = child
      cursor = child.textContent.length
    }
  }
  if (node.nodeType !== Node.TEXT_NODE) return false
  const text = node.textContent
  const before = text.slice(0, cursor)
  const wm = before.match(/(\S+)$/)
  if (!wm) return false
  const nodeWord = wm[1]
  // Only fire once the word actually carries a trailing 0.
  if (!nodeWord.endsWith('0')) return false

  const touchesPrev = before.length === nodeWord.length
  const prevSib = touchesPrev ? node.previousSibling : null

  // Decide the overlay element: an emote img (created/merged), an existing emoji
  // span to relocate, or a freshly built emoji span.
  let overlayEl = null
  let mergedChip = null
  let relocateSpan = null
  let word = nodeWord

  if (
    prevSib?.nodeType === Node.ELEMENT_NODE &&
    prevSib.tagName === 'IMG' &&
    prevSib.classList?.contains('hs-input-emote')
  ) {
    // (1) emote chip + typed "0" → merge the chip's name into the word.
    const ct = chipToText(prevSib)
    const clean = ct ? ct.trim() : ''
    if (clean && !/\s/.test(clean)) {
      word = clean + nodeWord
      mergedChip = prevSib
    }
  } else if (prevSib?.classList?.contains('hs-mc-emoji') && nodeWord === '0') {
    // (2) emoji chip + typed "0" → relocate that emoji span as the overlay.
    relocateSpan = prevSib
  }

  if (relocateSpan) {
    overlayEl = relocateSpan
  } else {
    const resolved = typeof lookupEmoteWithOverlay === 'function' ? lookupEmoteWithOverlay(word) : null
    if (resolved?.isOverlay) {
      // (1)/(3) emote overlay
      overlayEl = typeof createInputEmoteImg === 'function' ? createInputEmoteImg(word) : null
    } else if (word.startsWith(':') && word.endsWith(':0') && word.length > 3 && typeof _emojiMap !== 'undefined') {
      // (4) literal ":smile:0" that never span-converted → build emoji overlay
      const ename = word.slice(1, -2)
      const echar = _emojiMap.get(ename)
      if (echar) {
        const span = document.createElement('span')
        span.className = 'hs-mc-emoji'
        span.textContent = echar
        span.title = ':' + ename + ':'
        span.setAttribute('data-emoji-name', ename)
        span.setAttribute('contenteditable', 'false')
        overlayEl = span
      }
    }
  }
  if (!overlayEl) return false

  if (mergedChip) mergedChip.remove()
  const wordStartInNode = cursor - nodeWord.length
  const beforeText = text.slice(0, wordStartInNode)
  const afterText = text.slice(cursor)
  const parent = node.parentNode
  // Where to start scanning left for a base: before the relocated emoji span
  // (case 2) or before this text node (all other cases).
  const searchStart = relocateSpan ? relocateSpan.previousSibling : node.previousSibling

  // Stack onto a preceding emote/stack/emoji. For a relocated emoji the word is
  // just "0" so beforeText is empty; for typed words require empty beforeText.
  if (relocateSpan || beforeText.trim() === '') {
    let prev = searchStart
    while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
      const rm = prev
      prev = prev.previousSibling
      rm.remove()
    }
    if (
      prev &&
      prev !== overlayEl &&
      prev.nodeType === Node.ELEMENT_NODE &&
      ((prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
        prev.classList?.contains('hs-input-stack') ||
        prev.classList?.contains('hs-mc-emoji'))
    ) {
      const stopAt = relocateSpan || node
      let ws = prev.nextSibling
      while (ws && ws !== stopAt) {
        const rm = ws
        ws = ws.nextSibling
        rm.remove()
      }
      stackInputEmote(prev, overlayEl) // appendChild moves overlayEl out of its old spot
      // Leave a trailing space the user can backspace; caret sits after it.
      const tail = afterText || ''
      node.textContent = (tail.startsWith(' ') ? '' : ' ') + tail
      const nr = document.createRange()
      nr.setStart(node, 1)
      nr.collapse(true)
      sel.removeAllRanges()
      sel.addRange(nr)
      pendingMessage = getInputText()
      return true
    }
    // Overlay onto a raw unicode emoji typed as plain text before the word
    // (only for non-relocate cases — relocate already has its element).
    if (!relocateSpan && typeof peelTrailingEmoji === 'function') {
      const peeled = peelTrailingEmoji(beforeText.replace(/\s+$/, ''))
      if (peeled) {
        const restNode = peeled.rest ? document.createTextNode(peeled.rest) : null
        const emojiSpan = document.createElement('span')
        emojiSpan.className = 'hs-mc-emoji'
        emojiSpan.textContent = peeled.emoji
        if (restNode) parent.insertBefore(restNode, node)
        parent.insertBefore(emojiSpan, node)
        stackInputEmote(emojiSpan, overlayEl)
        const tail = afterText || ''
        node.textContent = (tail.startsWith(' ') ? '' : ' ') + tail
        const nr = document.createRange()
        nr.setStart(node, 1)
        nr.collapse(true)
        sel.removeAllRanges()
        sel.addRange(nr)
        pendingMessage = getInputText()
        return true
      }
    }
  }

  // A relocated emoji with no base to sit on stays put — leave the "0" as text.
  if (relocateSpan) return false

  // No left base to overlay — drop in a standalone overlay chip + trailing space.
  const tail = afterText || ''
  const beforeNode = beforeText ? document.createTextNode(beforeText) : null
  const afterNode = document.createTextNode((tail.startsWith(' ') ? '' : ' ') + tail)
  if (beforeNode) parent.insertBefore(beforeNode, node)
  parent.insertBefore(overlayEl, node)
  parent.insertBefore(afterNode, node)
  parent.removeChild(node)
  const nr = document.createRange()
  nr.setStart(afterNode, 1)
  nr.collapse(true)
  sel.removeAllRanges()
  sel.addRange(nr)
  pendingMessage = getInputText()
  return true
}

function updateCharCount() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  const text = getInputText()
  const len = text.length
  const over = len > 500
  input.classList.toggle('over-limit', over)

  // Highlight overflow chars for plain <input> using overlay div
  if (input.tagName === 'INPUT') {
    let wrap = document.getElementById('hs-mc-input-wrap')
    // Wrap input in container on first use
    if (!wrap && input.parentElement) {
      wrap = document.createElement('div')
      wrap.id = 'hs-mc-input-wrap'
      input.parentElement.insertBefore(wrap, input)
      wrap.appendChild(input)
    }
    let hl = document.getElementById('hs-mc-input-highlight')
    if (over) {
      if (!hl && wrap) {
        hl = document.createElement('div')
        hl.id = 'hs-mc-input-highlight'
        wrap.appendChild(hl)
      }
      if (hl) {
        // Build overlay using safe DOM methods
        hl.textContent = ''
        const safeSpan = document.createElement('span')
        safeSpan.className = 'hl-safe'
        safeSpan.textContent = text.slice(0, 500)
        const overSpan = document.createElement('span')
        overSpan.className = 'hl-over'
        overSpan.textContent = text.slice(500)
        hl.appendChild(safeSpan)
        hl.appendChild(overSpan)
        hl.scrollLeft = input.scrollLeft
        hl.style.display = ''
      }
      // Make real input text transparent so overlay shows through
      input.style.color = 'transparent'
      input.style.caretColor = '#000'
    } else {
      if (hl) hl.style.display = 'none'
      input.style.color = ''
      input.style.caretColor = ''
    }
  }
}

function getCurrentWord(input) {
  if (!input) return ''
  if (input.contentEditable === 'true') {
    const sel = window.getSelection()
    if (!sel.rangeCount) return ''
    const range = sel.getRangeAt(0)
    let container = range.startContainer
    let offset = range.startOffset
    if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const child = container.childNodes[offset - 1]
      if (child?.nodeType === Node.TEXT_NODE) {
        container = child
        offset = child.textContent.length
      }
    }
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent
      const before = text.slice(0, offset)
      const after = text.slice(offset)
      const beforeMatch = before.match(/(\S+)$/)
      const afterMatch = after.match(/^(\S+)/)
      if (beforeMatch) return beforeMatch[1] + (afterMatch ? afterMatch[1] : '')
    }
    return ''
  }
  const text = input.value
  const pos = input.selectionStart
  const before = text.slice(0, pos)
  const after = text.slice(pos)
  const beforeMatch = before.match(/(\S+)$/)
  const afterMatch = after.match(/^(\S+)/)
  if (beforeMatch) return beforeMatch[1] + (afterMatch ? afterMatch[1] : '')
  return ''
}

// WYSIWYG re-completion across a chip boundary. After Tab completes an emote it
// becomes an atomic <img> chip; if the user backspaces the auto-space and types
// more (e.g. SupHomie + "3"), the typed text is a separate node and getCurrentWord
// would only see "3". When the caret's typed word DIRECTLY touches a preceding
// single-token chip (no whitespace between), unwrap that chip back to its source
// text and merge it into the word so the next Tab re-searches "SupHomie3".
// Returns true if it merged. Skips modified/stacked chips (their text contains
// spaces — merging "Kappa w!" + "3" is nonsense).
function mergeChipIntoWordForRecompletion(input) {
  if (!input?.isContentEditable) return false
  const sel = window.getSelection()
  if (!sel?.rangeCount || !sel.isCollapsed) return false
  const range = sel.getRangeAt(0)
  let node = range.startContainer
  let offset = range.startOffset
  if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const child = node.childNodes[offset - 1]
    if (child?.nodeType === Node.TEXT_NODE) {
      node = child
      offset = child.textContent.length
    }
  }
  if (node.nodeType !== Node.TEXT_NODE) return false
  const text = node.textContent
  const before = text.slice(0, offset)
  // Typed word must reach the very start of this text node, so it touches prev.
  const wm = before.match(/(\S+)$/)
  if (!wm || wm[1].length !== before.length) return false
  const prev = node.previousSibling
  const isChip =
    prev?.nodeType === Node.ELEMENT_NODE &&
    ((prev.tagName === 'IMG' && prev.classList?.contains('hs-input-emote')) ||
      prev.classList?.contains('hs-mc-user') ||
      prev.classList?.contains('hs-mc-emoji'))
  if (!isChip) return false
  const chipText = chipToText(prev)
  if (!chipText) return false
  const clean = chipText.trim()
  if (!clean || /\s/.test(clean)) return false // modified/stacked chip — skip
  prev.remove()
  node.textContent = clean + text
  const r = document.createRange()
  r.setStart(node, clean.length + offset)
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
  pendingMessage = getInputText()
  return true
}

// "Recently active" = talked within RECENCY_WINDOW_MS, capped at RECENCY_MAX
// unique users. A count-only cap ages people out in seconds on ultra-fast chats
// (xQc churns 50 unique users in a blink), so a chatter you just saw talk would
// vanish from tab-complete; the time window keeps "recent" matching what a human
// sees, the count cap bounds walk cost + how aggressively chatters beat emotes.
const RECENCY_MAX = 150
const RECENCY_WINDOW_MS = 10 * 60 * 1000
function getRecencyMap() {
  // Returns Map<usernameLower, recencyRank> from current tab's chat buffer.
  // Lower rank = more recent. Merges Twitch/Kick irc buffer + YouTube buffer
  // (channelYtMessages) so YT-only chatters tab-complete on YT-only channels.
  const out = new Map()
  let ch = currentTab
  if (currentTab === 'live' && typeof getLiveChannel === 'function') ch = getLiveChannel()
  const ircMsgs = (ch && typeof irc !== 'undefined' && irc?.channels?.get(ch.toLowerCase())?.getAll?.()) || []
  const ytMsgs = (typeof channelYtMessages !== 'undefined' && channelYtMessages.get(currentTab)) || []
  // Absolute floor: chatters active in the last 10 REAL minutes. tmi-sent-ts is
  // Twitch server time (≈ real time), so a quiet/just-opened channel correctly
  // surfaces nobody instead of leading with whoever talked before it went quiet.
  const floor = Date.now() - RECENCY_WINDOW_MS
  // Walk both buffers from newest tail, picking whichever has the later time.
  let i = ircMsgs.length - 1
  let j = ytMsgs.length - 1
  let rank = 0
  while (rank < RECENCY_MAX && (i >= 0 || j >= 0)) {
    const a = i >= 0 ? ircMsgs[i]?.time || 0 : -1
    const b = j >= 0 ? ytMsgs[j]?.time || 0 : -1
    const pickIrc = a >= b
    const t = pickIrc ? a : b
    if (t > 0 && t < floor) break
    const msg = pickIrc ? ircMsgs[i--] : ytMsgs[j--]
    const u = (msg?.user || '').toLowerCase()
    if (!u || out.has(u)) continue
    // Blocked users never tab-complete — drop them at this one chokepoint so
    // both the recent-chatter and @-mention recency paths stay clean.
    if (typeof isUserBlocked === 'function' && isUserBlocked(u)) continue
    out.set(u, rank++)
  }
  return out
}

// Resolve the element a modifier should attach to. Valid anchors: an emote
// IMG, the last unit (img OR emoji span) of a stack, or a standalone emoji
// span — so "😀 w!" widens the emoji just like "Kappa w!" widens the emote.
function hsModAnchorEl(prev) {
  if (!prev || prev.nodeType !== Node.ELEMENT_NODE) return null
  if (prev.tagName === 'IMG' && (prev.classList.contains('hs-input-emote') || prev.dataset?.emoteName)) return prev
  if (prev.classList.contains('hs-mc-emoji')) return prev
  if (prev.classList.contains('hs-input-stack')) {
    const units = [...prev.children].filter((c) => c.tagName === 'IMG' || c.classList?.contains('hs-mc-emoji'))
    return units.length ? units[units.length - 1] : null
  }
  return null
}

// Scan input for modifier shorthands adjacent to emotes; apply via lib helper.
// Cursor-position-agnostic. Returns true if any modifier was applied.
// Only mutates a text node if it consumed at least one token from it — leaves
// non-modifier text alone so emote autocomplete can still find words.
function scanAndApplyModifiersInInput(input) {
  if (!input) return false
  let appliedAny = false
  let prevEmote = null
  for (const child of [...input.childNodes]) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const isAnchor =
        child.classList?.contains('hs-input-emote') ||
        child.classList?.contains('hs-input-stack') ||
        child.classList?.contains('hs-mc-emoji')
      if (isAnchor) prevEmote = child
      else if (child.tagName !== 'BR') prevEmote = null
      continue
    }
    if (child.nodeType !== Node.TEXT_NODE || !prevEmote) continue
    const tokens = child.textContent.split(/(\s+)/)
    const remaining = []
    let consumedHere = false
    for (const tok of tokens) {
      if (!tok || /^\s*$/.test(tok)) {
        remaining.push(tok)
        continue
      }
      const cls = hsModClassify(tok, { allowPrefix: true })
      if (cls.kind !== 'modifier') {
        remaining.push(tok)
        continue
      }
      const targetImg = hsModAnchorEl(prevEmote)
      if (!targetImg) {
        remaining.push(tok)
        continue
      }
      hsModApplyToImg(targetImg, cls.mods, cls.hue, cls.words)
      appliedAny = true
      consumedHere = true
    }
    if (consumedHere) {
      child.textContent = remaining.join('').replace(/\s+/g, ' ') || ' '
    }
  }
  if (appliedAny && typeof pendingMessage !== 'undefined') pendingMessage = getInputText()
  return appliedAny
}

function findEmoteMatches(search) {
  const matches = []

  // FFZ-style modifier tokens MUST NOT autocomplete — even if BTTV has an emote
  // literally named "w!". Use shared classifier; if it's a modifier, return [].
  if (hsModClassify(search, { allowPrefix: false }).kind === 'modifier') {
    return matches
  }

  // Check if searching for username (starts with @)
  const isUserSearch = search.startsWith('@')
  const searchTerm = isUserSearch ? search.slice(1) : search
  const searchLower = searchTerm.toLowerCase()

  // Username completion ONLY when explicit @prefix. Bare words never surface
  // usernames — they pollute emote results and the @ form is the supported way
  // to mention someone. Recency map / color prefetch only run on @search.
  if (isUserSearch) {
    const recency = getRecencyMap()
    const _hsPrefetchList = []
    for (const username of usernameCache) {
      if (!username) continue
      const userLower = username.toLowerCase()
      // Blocked users never surface as an @-completion suggestion (and don't
      // trigger a color prefetch for them).
      if (typeof isUserBlocked === 'function' && isUserBlocked(userLower)) continue
      let color = (typeof knownColors !== 'undefined' && knownColors.get(userLower)) || null
      if (!color && _hsUserColorCache.has(userLower)) color = _hsUserColorCache.get(userLower) || null
      if (!color) _hsPrefetchList.push(userLower)
      const recencyRank = recency.get(userLower)
      if (userLower.startsWith(searchLower)) {
        matches.push({ name: '@' + username, url: null, priority: 0, type: 'user', recencyRank })
      }
    }
    if (_hsPrefetchList.length) {
      try {
        hsPrefetchUserColors(_hsPrefetchList.slice(0, 30))
      } catch {}
    }
  }

  // Search emote cache (unless explicitly searching users with @).
  // Three tiers, in order: 0 = current channel BTTV/FFZ/7TV, 1 = viewer's own set
  // (heatsync inventory + native sub emotes), 2 = globals. Tier rides on each
  // pushed match so the sort can rank "channel > own > global" without
  // re-walking the source maps.
  // Channel emotes are written into the merge map LAST so a name you own AND that
  // the channel also defines (e.g. nl_kripp's BTTV "SoupTime") resolves to the
  // CHANNEL image — that's what actually renders in this channel. Channel-first is
  // the user-chosen order (reverses the older own-first call).
  if (!isUserSearch) {
    const tierByName = new Map()
    const acEmotes = new Map()
    for (const [k, v] of emoteCache) {
      acEmotes.set(k, v)
      tierByName.set(k, 2)
    }
    for (const [k, v] of viewerPersonalEmotes) {
      acEmotes.set(k, v)
      tierByName.set(k, 1)
    }
    const acChCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()]
    if (acChCache)
      for (const [k, v] of acChCache) {
        acEmotes.set(k, v)
        tierByName.set(k, 0)
      }
    for (const [name, emote] of acEmotes) {
      // Only tab-complete heatsync emotes you own (can't send emotes not in your set)
      if (emote.source === 'heatsync' && emote.state !== 'owned') continue
      const sub = !!emote.subscription
      const tier = tierByName.get(name) ?? 2
      if (name.toLowerCase().startsWith(searchLower)) {
        matches.push({ name, url: emote.url, source: emote.source, priority: 0, tier, type: 'emote', sub })
      } else if (name.toLowerCase().includes(searchLower)) {
        matches.push({ name, url: emote.url, source: emote.source, priority: 1, tier, type: 'emote', sub })
      }
    }
    // 7TV "name0" overlay convention: a trailing "0" turns an emote into a
    // zero-width overlay (e.g. "centipede0"). The literal "centipede0" matches
    // no emote name, so synthesize an overlay match from the base name. Without
    // this, re-completing a "name0" word (complete emote → backspace auto-space
    // → type 0 → Tab) finds nothing and the chip collapses back to plain text.
    // The insert path resolves the overlay flag via lookupEmoteWithOverlay and
    // stacks it onto the preceding emote.
    // Skip synthesis entirely when the literal "name0" is itself a real emote —
    // a channel emote actually named "lerolero0" is standalone and already
    // surfaced as a direct hit above; the strip-0 overlay must not shadow it
    // (and the prefix branch below would otherwise emit bogus "name00" doubles).
    const _literalIsReal = matches.some((m) => m.type === 'emote' && m.name.toLowerCase() === searchLower)
    if (!_literalIsReal && searchLower.length > 2 && searchLower.endsWith('0')) {
      const baseLower = searchLower.slice(0, -1)
      const seen = new Set(matches.filter((m) => m.type === 'emote').map((m) => m.name.toLowerCase()))
      for (const [name, emote] of acEmotes) {
        if (emote.source === 'heatsync' && emote.state !== 'owned') continue
        const nl = name.toLowerCase()
        const overlayName = name + '0'
        if (seen.has(overlayName.toLowerCase())) continue
        const tier = tierByName.get(name) ?? 2
        if (nl === baseLower) {
          matches.push({
            name: overlayName,
            url: emote.url,
            source: emote.source,
            priority: 0,
            tier,
            type: 'emote',
            sub: !!emote.subscription,
          })
        } else if (nl.startsWith(baseLower)) {
          matches.push({
            name: overlayName,
            url: emote.url,
            source: emote.source,
            priority: 1,
            tier,
            type: 'emote',
            sub: !!emote.subscription,
          })
        }
      }
    }
  }

  // Recent-chatter completion — bare word (no @ / :): a chatter who JUST talked
  // and whose name PREFIX-matches outranks every emote. Typing a name prefix is
  // almost always addressing that person, so these jump above emotes (e.g.
  // "ashr" → ashrubberyboi over HahaShrugLeft), most-recent-first. Inserted as
  // the PLAIN name (no @) — respect what the user typed; they didn't type @, so
  // don't force a mention/ping (the @-search path keeps the @ the user typed).
  // Collected separately and prepended after the emote sort so emote ordering
  // stays untouched.
  const recentChatters = []
  if (!isUserSearch && !search.startsWith(':') && searchLower.length > 0 && typeof getRecencyMap === 'function') {
    const _ucDisplay = new Map()
    if (typeof usernameCache !== 'undefined') for (const u of usernameCache) if (u) _ucDisplay.set(u.toLowerCase(), u)
    for (const [userLower, rank] of getRecencyMap()) {
      if (!userLower.startsWith(searchLower)) continue
      recentChatters.push({
        name: _ucDisplay.get(userLower) || userLower,
        url: null,
        priority: 0,
        type: 'user',
        recencyRank: rank,
      })
    }
    recentChatters.sort((a, b) => a.recencyRank - b.recencyRank)
  }
  const _recentSeen = new Set(recentChatters.map((m) => m.name.toLowerCase()))

  // Bare-word username fallback — when nothing emote-y matched, scan
  // usernameCache for everyone NOT already surfaced as a recent chatter. Only
  // kicks in for searches that didn't start with @ / : so the explicit-@ path
  // keeps its dedicated behavior (recency + color prefetch). Inserted WITHOUT
  // the @ prefix so the user gets the same bare-name they typed (e.g. typing
  // "lichen" + Tab → "licheness").
  if (!isUserSearch && !search.startsWith(':') && matches.length === 0 && typeof usernameCache !== 'undefined') {
    for (const username of usernameCache) {
      if (!username) continue
      const userLower = username.toLowerCase()
      if (_recentSeen.has(userLower)) continue
      if (typeof isUserBlocked === 'function' && isUserBlocked(userLower)) continue
      if (userLower.startsWith(searchLower)) {
        matches.push({ name: username, url: null, priority: 0, type: 'user' })
      } else if (userLower.includes(searchLower)) {
        matches.push({ name: username, url: null, priority: 1, type: 'user' })
      }
    }
  }

  // Emoji shortcodes when typing :prefix
  if (search.startsWith(':') && typeof EMOJI_DATA !== 'undefined') {
    const emojiPrefix = search.slice(1).toLowerCase()
    if (emojiPrefix.length > 0) {
      for (const entry of EMOJI_DATA) {
        if (matches.length >= 50) break
        const emojiMatch = {
          name: `:${entry.name}:`,
          url: null,
          priority: entry.name.startsWith(emojiPrefix) ? 0 : 1,
          type: 'emoji',
          emoji: entry.emoji,
        }
        if (entry.name.startsWith(emojiPrefix)) {
          matches.push(emojiMatch)
        } else if (entry.name.includes(emojiPrefix)) {
          emojiMatch.priority = 1
          matches.push(emojiMatch)
        }
      }
    }
  }

  // Sort order (most-correct first):
  //   1. channel > own set > globals         (tier; emoji/non-emote have no tier)
  //   2. exact full-name match               (within tier)
  //   3. prefix > substring                  (priority)
  //   4. sub emote > non-sub                 (entitlement-scarce)
  //   5. recently-used > never-used          (local MRU, fills as you insert)
  //   6. shorter prefix-match > longer       (Kap → Kappa before KappaPride)
  //   7. alpha
  // Tier outranks exact-match (user call): typing "hug" surfaces the channel's
  // peepoHug over a coincidental global "HuG" (whose name only case-matches
  // "hug"). Exact-name still wins WITHIN a tier (own "Birdge" over own "BirdgeHmm").
  const _recentList = typeof loadRecentEmotes === 'function' ? loadRecentEmotes() : []
  const _recentRank = new Map()
  for (let i = 0; i < _recentList.length; i++) _recentRank.set(_recentList[i], i)
  matches.sort((a, b) => {
    const at = a.tier ?? 9,
      bt = b.tier ?? 9
    if (at !== bt) return at - bt
    const ae = (a.name || '').toLowerCase() === searchLower ? 0 : 1
    const be = (b.name || '').toLowerCase() === searchLower ? 0 : 1
    if (ae !== be) return ae - be
    if (a.priority !== b.priority) return a.priority - b.priority
    if (!!a.sub !== !!b.sub) return a.sub ? -1 : 1
    const ar = _recentRank.get(a.name) ?? Infinity
    const br = _recentRank.get(b.name) ?? Infinity
    if (ar !== br) return ar - br
    if (a.priority === 0 && a.name.length !== b.name.length) return a.name.length - b.name.length
    return a.name.localeCompare(b.name)
  })

  // Recent chatters (prefix, most-recent-first) lead the cycle, above all
  // emotes — see comment at recentChatters above.
  return recentChatters.length ? recentChatters.concat(matches) : matches
}

// Insert completion and keep cycling state
function insertCompletionKeepOpen(match) {
  const input = document.getElementById('hs-mc-input')
  if (!input || !match) return

  trackCompletionForAutoAdd(match)
  if (match.type === 'emote' && match.name && typeof recordRecentEmote === 'function') recordRecentEmote(match.name)

  if (wysiwygEnabled) {
    insertCompletionWysiwyg(match)
    return
  }

  // Use saved positions from acState for consistent cycling
  const beforeWord = input.value.slice(0, acState.wordStart)
  const insertText = match.type === 'emoji' ? match.emoji : match.name
  const newValue = beforeWord + insertText + ' ' + acState.afterText

  input.value = newValue
  pendingMessage = input.value

  // Position cursor after the inserted word
  const newPos = beforeWord.length + insertText.length + 1
  input.selectionStart = input.selectionEnd = newPos
  input.focus()

  updateCharCount()
}

// Build a styled mention chip span for bare-username completion.
// Resolves color synchronously from caches FIRST (no white flash for known
// users), then async-fetches only if still unknown.
function createUserMentionSpan(username, color) {
  const span = document.createElement('span')
  span.className = 'hs-mc-user hs-cycling-user'
  const lower = username.toLowerCase()
  span.dataset.username = lower
  span.dataset.completionType = 'user-bare'
  span.textContent = username
  const sanitize = (c) => (typeof sanitizeColor === 'function' ? sanitizeColor(c || '#fff') : c || '#fff')

  // Sync cache resolution — instant for anyone we've already seen this session
  let finalColor = color && color !== '#fff' ? color : null
  if (!finalColor && _hsUserColorCache.has(lower)) finalColor = _hsUserColorCache.get(lower) || null
  if (!finalColor && typeof knownColors !== 'undefined') {
    const k = knownColors.get(lower)
    if (k && k !== '#fff') finalColor = k
  }

  span.style.color = sanitize(finalColor || '#fff')
  span.style.fontWeight = 'bold'
  span.style.cursor = 'pointer'
  span.contentEditable = 'false'
  span.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(`https://heatsync.org/user/${encodeURIComponent(lower)}`, '_blank', 'noopener,noreferrer')
  })
  // Only async-fetch when truly unknown
  if (!finalColor) hsFetchUserColorAndApply(lower, span)
  return span
}

// Cache: username (lower) → color hex (or null for "fetched but no color")
const _hsUserColorCache = new Map()
const _hsUserColorInflight = new Map()

// Persist cache across page reloads — colors don't change often. Loads at startup.
try {
  ;(typeof api !== 'undefined' ? api : chrome).storage.local
    .get('hs_user_color_cache')
    .then((d) => {
      const obj = d?.hs_user_color_cache
      if (obj && typeof obj === 'object') {
        for (const k in obj) _hsUserColorCache.set(k, obj[k])
        while (_hsUserColorCache.size > 5000) _hsUserColorCache.delete(_hsUserColorCache.keys().next().value)
      }
    })
    .catch(() => {})
} catch {}

let _hsUserColorCacheSaveTimer = null
function _hsPersistUserColorCache() {
  if (_hsUserColorCacheSaveTimer) return
  _hsUserColorCacheSaveTimer = setTimeout(() => {
    _hsUserColorCacheSaveTimer = null
    const obj = {}
    for (const [k, v] of _hsUserColorCache) if (v) obj[k] = v // skip nulls
    try {
      ;(typeof api !== 'undefined' ? api : chrome).storage.local.set({ hs_user_color_cache: obj })
    } catch {}
  }, 2000)
}

// Prefetch colors for a list of usernames in the background. Deduped + batched
// via GQL so 10 names = 1 round-trip. Populates _hsUserColorCache for later
// instant lookup in createUserMentionSpan.
function hsPrefetchUserColors(usernames) {
  const needed = []
  for (const u of usernames || []) {
    const lower = String(u || '').toLowerCase()
    if (!lower) continue
    if (_hsUserColorCache.has(lower)) continue
    if (_hsUserColorInflight.has(lower)) continue
    // Don't re-fetch if knownColors already has them
    if (typeof knownColors !== 'undefined' && knownColors.get(lower)) continue
    needed.push(lower)
  }
  if (!needed.length) return
  // Mark inflight
  const batchPromise = (async () => {
    try {
      // Build batched GQL with aliases — single request for all users
      const aliases = needed.map((u, i) => `u${i}: user(login: "${u.replace(/"/g, '')}") { chatColor }`).join(' ')
      const resp = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
        body: JSON.stringify({ query: `{ ${aliases} }` }),
      })
      if (!resp.ok) return
      const j = await resp.json()
      const data = j?.data || {}
      for (let i = 0; i < needed.length; i++) {
        const u = needed[i]
        const c = data[`u${i}`]?.chatColor || null
        _hsUserColorCache.set(u, c)
        if (_hsUserColorCache.size > 5000) _hsUserColorCache.delete(_hsUserColorCache.keys().next().value)
        if (c) {
          try {
            setKnownColor(u, c)
          } catch {}
        }
      }
      _hsPersistUserColorCache()
    } catch {}
  })()
  for (const u of needed) _hsUserColorInflight.set(u, batchPromise)
  batchPromise.finally(() => {
    for (const u of needed) _hsUserColorInflight.delete(u)
  })
}
// Resolve a username's chat color, caching the result. Resolution order:
//   1. heatsync custom color (set on heatsync.org)
//   2. twitch chat color via unauthed GQL (no scope needed)
//   3. twitch's 15 auto-assigned colors (deterministic hash of username)
// So every user resolves to SOME color — never flat white — matching twitch.
// Deduped via _hsUserColorInflight; persisted via _hsUserColorCache. Shared by
// input chips (hsFetchUserColorAndApply) and message @mentions/reply links.
function hsResolveUserColor(lower) {
  if (_hsUserColorCache.has(lower)) return Promise.resolve(_hsUserColorCache.get(lower) || null)
  let p = _hsUserColorInflight.get(lower)
  if (!p) {
    p = (async () => {
      try {
        if (typeof apiFetch !== 'function') return null
        const resp = await apiFetch(`/api/profile/${encodeURIComponent(lower)}`)
        const profile = resp?.data?.profile
        // 1. heatsync custom color (set on heatsync.org)
        let c = profile?.color || profile?.user_color || profile?.userColor || null
        // 2. fallback: fetch Twitch chat color via unauthed GQL (no scope needed)
        if (!c && profile?.twitch_username) {
          try {
            const gqlResp = await fetch('https://gql.twitch.tv/gql', {
              method: 'POST',
              credentials: 'omit',
              headers: {
                'Content-Type': 'application/json',
                'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko',
              },
              body: JSON.stringify({
                query: 'query($login:String!){user(login:$login){chatColor}}',
                variables: { login: profile.twitch_username },
              }),
            })
            if (gqlResp.ok) {
              const j = await gqlResp.json()
              c = j?.data?.user?.chatColor || null
            }
          } catch {}
        }
        // 3. fallback: Twitch's 15 auto-assigned colors (hash of username)
        if (!c) {
          const palette = [
            '#FF0000',
            '#0000FF',
            '#008000',
            '#B22222',
            '#FF7F50',
            '#9ACD32',
            '#FF4500',
            '#2E8B57',
            '#DAA520',
            '#D2691E',
            '#5F9EA0',
            '#1E90FF',
            '#FF69B4',
            '#8A2BE2',
            '#00FF7F',
          ]
          let h = 0
          for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) | 0
          c = palette[Math.abs(h) % palette.length]
        }
        _hsUserColorCache.set(lower, c || null)
        if (_hsUserColorCache.size > 5000) _hsUserColorCache.delete(_hsUserColorCache.keys().next().value)
        _hsPersistUserColorCache()
        if (c) {
          try {
            setKnownColor(lower, c)
          } catch {}
        }
        return c
      } catch {
        return null
      }
    })()
    _hsUserColorInflight.set(lower, p)
    p.finally(() => _hsUserColorInflight.delete(lower))
  }
  return p
}

function hsFetchUserColorAndApply(lower, span) {
  hsResolveUserColor(lower).then((c) => {
    if (c && span.isConnected) {
      span.style.color = typeof sanitizeColor === 'function' ? sanitizeColor(c) : c
    }
  })
}

// WYSIWYG emote insertion
function insertCompletionWysiwyg(match) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  // Reflect block state on the inserted/cycled emote chip: a blocked emote must
  // show the 2px dashed outline, not the image. Clears any prior block state
  // first (the chip's src was just set to the new match) so a stale blocked src
  // can't leak across Tab-cycle steps, then re-marks if this match is blocked.
  const _applyInputBlock = (img) => {
    if (!img) return
    delete img.dataset.hsInputBlocked
    delete img.dataset.hsOrigSrc
    img.classList.remove('hs-state-blocked')
    delete img.dataset.state
    if (
      match.name &&
      typeof blockedEmoteNames !== 'undefined' &&
      blockedEmoteNames.has(match.name) &&
      typeof markInputEmoteBlocked === 'function'
    ) {
      markInputEmoteBlocked(img, true)
    }
  }

  // Check if we're replacing an existing cycling element (emote img, text span, or user span)
  const existingEmote = input.querySelector('img.hs-cycling-emote')
  const existingText = input.querySelector('span.hs-cycling-text')
  const existingUser = input.querySelector('span.hs-cycling-user')
  if (existingEmote) {
    if (match.url) {
      // Re-check overlay state: cycling through Tab matches can move between
      // overlay and non-overlay alternatives. Without this, the FIRST insert's
      // overlay state sticks — every cycle stays inside the stack span and
      // non-overlay matches appear to stack onto whatever's before them.
      const resolved = typeof lookupEmoteWithOverlay === 'function' ? lookupEmoteWithOverlay(match.name) : null
      // Remote-only emotes (7TV cross-provider search hits) aren't in any local
      // cache, so lookupEmoteWithOverlay can't resolve their zero-width flag —
      // fall back to the flag carried on the match from the search result.
      const wantsOverlay = !!resolved?.isOverlay || !!match.zeroWidth
      const stack = existingEmote.parentElement?.classList?.contains('hs-input-stack')
        ? existingEmote.parentElement
        : null
      if (stack && !wantsOverlay) {
        // Pull the cycling img out of the stack and place it after the stack
        // as a standalone unit. Strip the overlay class so its native sizing
        // returns. If the stack ends up with one child, unwrap it back to a
        // bare emote img.
        existingEmote.classList.remove('hs-input-overlay')
        stack.parentNode.insertBefore(existingEmote, stack.nextSibling)
        // Insert a separator space so following typed text gets a word break
        if (!existingEmote.nextSibling || existingEmote.nextSibling.textContent !== ' ') {
          existingEmote.parentNode.insertBefore(document.createTextNode(' '), existingEmote.nextSibling)
        }
        if (stack.children.length === 1) {
          const base = stack.firstElementChild
          stack.parentNode.insertBefore(base, stack)
          stack.remove()
        } else if (stack.children.length === 0) {
          stack.remove()
        }
      } else if (!stack && wantsOverlay) {
        // Cycle landed on an overlay match while the cycling img is standalone.
        // Find a preceding emote/stack and move the img into a stack on top.
        let prev = existingEmote.previousSibling
        while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
          const rm = prev
          prev = prev.previousSibling
          rm.remove()
        }
        if (
          prev &&
          prev.nodeType === Node.ELEMENT_NODE &&
          ((prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
            prev.classList?.contains('hs-input-stack') ||
            prev.classList?.contains('hs-mc-emoji'))
        ) {
          stackInputEmote(prev, existingEmote)
        }
      }
      existingEmote.src = match.url
      existingEmote.alt = match.name
      existingEmote.dataset.emoteName = match.name
      _applyInputBlock(existingEmote)
    } else if (match.type === 'emoji') {
      // Replace emote img with emoji span
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.emoji
      span.dataset.completionName = match.name
      existingEmote.replaceWith(span)
      // Place caret after the span's trailing space
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else if (match.type === 'user-bare') {
      const userSpan = createUserMentionSpan(match.name, match.color)
      existingEmote.replaceWith(userSpan)
      const space = userSpan.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(userSpan)
    } else if (match.type === 'user') {
      // @user cycle marker — generic cycling-text span (matches emoji's pattern,
      // unwraps to plain text on cycle-end via hideAutocomplete).
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.name
      span.dataset.completionName = match.name
      existingEmote.replaceWith(span)
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingEmote.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }
  if (existingText) {
    if (match.url) {
      // Replace text span with emote img
      const img = document.createElement('img')
      img.src = match.url
      img.alt = match.name
      img.dataset.emoteName = match.name
      img.className = 'hs-input-emote hs-cycling-emote'
      img.draggable = false
      attachInputEmoteErrorRecovery(img)
      _applyInputBlock(img)
      existingText.replaceWith(img)
      const space = img.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(img)
    } else if (match.type === 'emoji') {
      existingText.textContent = match.emoji
      existingText.dataset.completionName = match.name
      const space = existingText.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingText)
    } else if (match.type === 'user-bare') {
      const userSpan = createUserMentionSpan(match.name, match.color)
      existingText.replaceWith(userSpan)
      const space = userSpan.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(userSpan)
    } else if (match.type === 'user') {
      // @user cycle — update span text in place (same shape emoji uses)
      existingText.textContent = match.name
      existingText.dataset.completionName = match.name
      const space = existingText.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingText)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingText.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }
  if (existingUser) {
    if (match.url) {
      // Replace user span with emote img
      const img = document.createElement('img')
      img.src = match.url
      img.alt = match.name
      img.dataset.emoteName = match.name
      img.className = 'hs-input-emote hs-cycling-emote'
      img.draggable = false
      attachInputEmoteErrorRecovery(img)
      _applyInputBlock(img)
      existingUser.replaceWith(img)
      const space = img.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(img)
    } else if (match.type === 'emoji') {
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.emoji
      span.dataset.completionName = match.name
      existingUser.replaceWith(span)
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else if (match.type === 'user-bare') {
      // Update existing user span in place
      existingUser.textContent = match.name
      existingUser.dataset.username = match.name.toLowerCase()
      const safeColor =
        typeof sanitizeColor === 'function' ? sanitizeColor(match.color || '#fff') : match.color || '#fff'
      existingUser.style.color = safeColor
      const space = existingUser.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingUser)
    } else if (match.type === 'user') {
      // Cycling from a bare-mention chip onto an @user — swap chip for cycling-text
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.name
      span.dataset.completionName = match.name
      existingUser.replaceWith(span)
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingUser.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }

  // First Tab: replace word with emote image
  const sel = window.getSelection()
  if (!sel.rangeCount) return

  const range = sel.getRangeAt(0)
  let container = range.startContainer
  let rangeOffset = range.startOffset
  // Resolve element boundary to preceding text node
  if (container.nodeType === Node.ELEMENT_NODE && rangeOffset > 0) {
    const child = container.childNodes[rangeOffset - 1]
    if (child?.nodeType === Node.TEXT_NODE) {
      container = child
      rangeOffset = child.textContent.length
    }
  }
  if (container.nodeType !== Node.TEXT_NODE) return

  const textNode = container
  const offset = rangeOffset
  const text = textNode.textContent

  // Find word start
  let wordStart = offset
  while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) wordStart--

  // Find word end (skip past rest of word after cursor)
  let wordEnd = offset
  while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++

  // Split text: before | word | after
  const before = text.slice(0, wordStart)
  const after = text.slice(wordEnd)

  // Save afterText for cycling
  acState.afterText = after

  // Helper: insert element after textNode with before/after text
  const insertElement = (el) => {
    // Defensive leading separator: if the typed word started at textNode
    // offset 0 (so `before` is empty) and the previous sibling is a chip,
    // splice an nbsp into `before` so the new chip doesn't touch the prior
    // chip \u2014 otherwise unwrapStuckChips collapses both back to plain text.
    let leadBefore = before
    if (!leadBefore) {
      const prev = textNode.previousSibling
      const prevIsChip =
        prev?.nodeType === Node.ELEMENT_NODE &&
        ((prev.tagName === 'IMG' && (prev.classList?.contains('hs-input-emote') || prev.dataset?.emoteName)) ||
          prev.classList?.contains('hs-input-stack') ||
          prev.classList?.contains('hs-mc-emoji') ||
          prev.classList?.contains('hs-mc-user') ||
          prev.classList?.contains('hs-cycling-emote') ||
          prev.classList?.contains('hs-cycling-text'))
      if (prevIsChip) leadBefore = '\u00A0'
    }
    textNode.textContent = leadBefore
    // Auto-space after Tab uses nbsp \u2014 at end of contenteditable, regular
    // trailing spaces collapse to 0 width and look invisible. Backspace
    // handler still consumes this in one keystroke, so it behaves like a
    // typed space (1st press eats it, 2nd press deletes the chip).
    const space = document.createTextNode(' ' + after)
    const parent = textNode.parentNode
    const nextSibling = textNode.nextSibling
    if (nextSibling) {
      parent.insertBefore(el, nextSibling)
      parent.insertBefore(space, nextSibling)
    } else {
      parent.appendChild(el)
      parent.appendChild(space)
    }
    placeCaretAfter(space, 1)
  }

  if (match.url) {
    // Create emote image
    const img = document.createElement('img')
    img.src = match.url
    img.alt = match.name
    img.dataset.emoteName = match.name
    img.className = 'hs-input-emote hs-cycling-emote'
    img.draggable = false
    attachInputEmoteErrorRecovery(img)
    _applyInputBlock(img)
    // Zero-width / overlay: stack onto preceding emote so the input preview
    // matches how chat will render the same word sequence.
    const resolved = typeof lookupEmoteWithOverlay === 'function' ? lookupEmoteWithOverlay(match.name) : null
    // Remote-only emotes aren't in any local cache (lookup returns null), so
    // fall back to the zero-width flag the 7TV search carried on the match.
    const wantsOverlay = !!resolved?.isOverlay || !!match.zeroWidth
    if (wantsOverlay && before.trim() === '') {
      let prev = textNode.previousSibling
      while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
        prev = prev.previousSibling
      }
      if (
        prev &&
        prev.nodeType === Node.ELEMENT_NODE &&
        ((prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
          prev.classList?.contains('hs-input-stack') ||
          prev.classList?.contains('hs-mc-emoji'))
      ) {
        // Drop whitespace nodes between prev base and current text node
        let ws = prev.nextSibling
        while (ws && ws !== textNode) {
          const rm = ws
          ws = ws.nextSibling
          rm.remove()
        }
        stackInputEmote(prev, img)
        textNode.textContent = after || ' '
        placeCaretAfter(textNode, 1)
        pendingMessage = getInputText()
        updateCharCount()
        input.focus()
        return
      }
    }
    // Overlay onto a raw unicode emoji typed/pasted as plain text in `before`
    // (parity with the typed live-replace path and chat render).
    if (wantsOverlay && typeof peelTrailingEmoji === 'function') {
      const peeled = peelTrailingEmoji(before.replace(/\s+$/, ''))
      if (peeled) {
        const parent = textNode.parentNode
        const restNode = peeled.rest ? document.createTextNode(peeled.rest) : null
        const emojiSpan = document.createElement('span')
        emojiSpan.className = 'hs-mc-emoji'
        emojiSpan.textContent = peeled.emoji
        if (restNode) parent.insertBefore(restNode, textNode)
        parent.insertBefore(emojiSpan, textNode)
        stackInputEmote(emojiSpan, img)
        textNode.textContent = after || ' '
        placeCaretAfter(textNode, 1)
        pendingMessage = getInputText()
        updateCharCount()
        input.focus()
        return
      }
    }
    insertElement(img)
  } else if (match.type === 'emoji') {
    // Create emoji tracking span
    const span = document.createElement('span')
    span.className = 'hs-cycling-text'
    span.textContent = match.emoji
    span.dataset.completionName = match.name
    insertElement(span)
  } else if (match.type === 'user-bare') {
    // Bare-name mention chip: colored, hoverable, clickable
    const userSpan = createUserMentionSpan(match.name, match.color)
    insertElement(userSpan)
  } else if (match.type === 'user') {
    // @user — wrap in cycling-text span so subsequent Tabs replace this chip
    // (without a marker, the cycle would append a second @user onto the line).
    const span = document.createElement('span')
    span.className = 'hs-cycling-text'
    span.textContent = match.name
    span.dataset.completionName = match.name
    insertElement(span)
  } else {
    // Plain text completion (fallback)
    const newText = before + match.name + ' ' + after
    textNode.textContent = newText
    const newPos = before.length + match.name.length + 1
    range.setStart(textNode, newPos)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  pendingMessage = getInputText()
  updateCharCount()
  input.focus()
}

function placeCaretAfter(node, offset = 0) {
  const sel = window.getSelection()
  const range = document.createRange()
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(offset, node.length))
  } else {
    range.setStartAfter(node)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

// Cycle-depth + visibility readout for the current Tab match. "cat" tells you
// WHERE in the cycle you are (channel → your set → global → 7tv search, getting
// rarer as you go); "vis" tells you WHO actually sees the image if you send it:
//   everyone   — text/unicode or native Twitch emotes, no extension needed
//   {prov} users — bttv/ffz/7tv emote active in this channel/globally: anyone
//                  running that provider's extension sees it (heatsync too)
//   heatsync only — your personal set + 7tv catalog-search hits: only viewers
//                   running heatsync render these; everyone else sees plain text
// Colors form a breadth gradient: green (all) → yellow (needs an ext) → orange
// (heatsync only), so you can feel how deep / how niche the current pick is.
function emoteCycleMeta(m) {
  if (!m) return { cat: '', vis: null }
  if (m.type === 'user' || m.type === 'user-bare') return { cat: 'chatter', vis: { t: 'everyone', c: '#5fd75f' } }
  if (m.type === 'emoji') return { cat: 'emoji', vis: { t: 'everyone', c: '#5fd75f' } }
  if (m.remote) return { cat: '7tv search', vis: { t: 'heatsync only', c: '#ff8700' } }
  const tier = m.tier ?? 2
  const cat = tier === 0 ? 'channel' : tier === 1 ? 'your set' : 'global'
  if (m.source === 'twitch') return { cat, vis: { t: 'all twitch', c: '#5fd75f' } }
  // Your personal set (tier 1) or a heatsync-hosted emote: others only see it via
  // heatsync's sender-set merge — non-heatsync viewers get plain text.
  if (tier === 1 || m.source === 'heatsync') return { cat, vis: { t: 'heatsync only', c: '#ff8700' } }
  // Third-party emote active in the channel/global set — provider-ext users see it.
  return { cat, vis: { t: `${m.source || 'ext'} users`, c: '#ffd75f' } }
}

function showCycleTooltip() {
  let tt = document.getElementById('hs-mc-cycle-tooltip')
  if (!tt) {
    tt = document.createElement('div')
    tt.id = 'hs-mc-cycle-tooltip'
    tt.style.cssText =
      'position:absolute;bottom:100%;left:8px;background:#000;color:#fff;padding:4px 8px;font-size:13px;border-radius:0;z-index:1003;margin-bottom:4px;white-space:nowrap;'
    document.getElementById('hs-mc-inputbar')?.appendChild(tt)
  }
  const m = acState.matches[acState.index]
  if (!m) {
    tt.style.display = 'none'
    return
  }
  const meta = emoteCycleMeta(m)
  const mkSpan = (text, css) => {
    const s = document.createElement('span')
    s.textContent = text
    if (css) s.style.cssText = css
    return s
  }
  const dot = () => mkSpan(' · ', 'color:#555;')
  tt.replaceChildren()
  tt.appendChild(mkSpan(`${acState.index + 1}/${acState.matches.length}`, 'color:#888;'))
  tt.appendChild(mkSpan(' ' + (m.type === 'emoji' ? `${m.emoji} ${m.name}` : m.name), 'color:#fff;'))
  if (meta.cat) {
    tt.appendChild(dot())
    tt.appendChild(mkSpan(meta.cat, 'color:#9e9e9e;'))
  }
  if (meta.vis) {
    tt.appendChild(dot())
    tt.appendChild(mkSpan(meta.vis.t, `color:${meta.vis.c};`))
  }
  // Surface the live catalog fetch so you know when a 7tv search is firing.
  if (acState.remotePending) {
    tt.appendChild(dot())
    tt.appendChild(mkSpan('searching 7tv…', 'color:#ffd75f;'))
  }
  tt.style.display = 'block'
}

function hideCycleTooltip() {
  const tt = document.getElementById('hs-mc-cycle-tooltip')
  if (tt) tt.style.display = 'none'
}

function hideAutocomplete() {
  acState.active = false
  acState.matches = []
  acState.index = 0
  acState.wordStart = 0
  acState.afterText = ''
  acState.search = ''
  acState.remoteDone = false
  acState.remotePending = false
  _acRemoteToken++ // invalidate any in-flight 7TV fetch
  if (_acRemoteAbort) {
    try {
      _acRemoteAbort.abort()
    } catch (_) {}
  }
  hideCycleTooltip()

  // WYSIWYG: finalize cycling elements (remove cycling class so they're permanent)
  if (wysiwygEnabled) {
    const input = document.getElementById('hs-mc-input')
    const cyclingEmote = input?.querySelector('.hs-cycling-emote')
    if (cyclingEmote) {
      cyclingEmote.classList.remove('hs-cycling-emote')
    }
    const cyclingText = input?.querySelector('.hs-cycling-text')
    if (cyclingText) {
      // Emoji spans must stay wrapped (caret would otherwise snap mid-grapheme
      // around the U+FE0F variation selector). For non-emoji cycling text,
      // unwrap to a plain text node so it merges naturally with surrounding text.
      if (cyclingText.classList.contains('hs-mc-emoji')) {
        cyclingText.classList.remove('hs-cycling-text')
        delete cyclingText.dataset.completionName
      } else {
        const textNode = document.createTextNode(cyclingText.textContent)
        cyclingText.replaceWith(textNode)
      }
    }
    const cyclingUser = input?.querySelector('.hs-cycling-user')
    if (cyclingUser) {
      // Keep the styled mention span — just clear the cycling marker
      cyclingUser.classList.remove('hs-cycling-user')
    }
  }
}

// --- Emoji dropdown autocomplete ---

function getEmojiColonContext(input) {
  // Returns { query, colonPos } if user is typing :shortcode, else null
  if (wysiwygEnabled) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return null
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node?.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent
    const cursor = range.startOffset
    const before = text.slice(0, cursor)
    // Find last unmatched ':' — must not contain spaces or a closing ':'
    const match = before.match(/:([a-z0-9_]{2,})$/)
    if (!match) return null
    // Make sure this ':' isn't part of a completed :shortcode:
    const colonIdx = before.lastIndexOf(':')
    return { query: match[1], colonPos: colonIdx, textNode: node }
  }
  // Standard input
  const text = input.value
  const cursor = input.selectionStart
  const before = text.slice(0, cursor)
  const match = before.match(/:([a-z0-9_]{2,})$/)
  if (!match) return null
  const colonIdx = before.lastIndexOf(':')
  return { query: match[1], colonPos: colonIdx, textNode: null }
}

function filterEmoji(query) {
  if (_emojiMap.size === 0) return []
  const results = []
  const q = query.toLowerCase()
  for (const entry of EMOJI_DATA) {
    if (results.length >= 8) break
    if (entry.name.startsWith(q)) {
      results.push(entry)
    }
  }
  // If we have room, add substring matches
  if (results.length < 8) {
    for (const entry of EMOJI_DATA) {
      if (results.length >= 8) break
      if (!entry.name.startsWith(q) && entry.name.includes(q)) {
        results.push(entry)
      }
    }
  }
  return results
}

function showEmojiDropdown(matches, selectedIndex) {
  let dd = document.getElementById('hs-mc-emoji-dropdown')
  if (!dd) {
    dd = document.createElement('div')
    dd.id = 'hs-mc-emoji-dropdown'
    document.getElementById('hs-mc-inputbar')?.appendChild(dd)
  }
  dd.textContent = ''
  matches.forEach((entry, i) => {
    const row = document.createElement('div')
    row.className = 'hs-mc-emoji-row' + (i === selectedIndex ? ' selected' : '')
    row.dataset.index = i

    const emojiSpan = document.createElement('span')
    emojiSpan.className = 'hs-mc-emoji-preview'
    emojiSpan.textContent = entry.emoji

    const nameSpan = document.createElement('span')
    nameSpan.className = 'hs-mc-emoji-name'
    nameSpan.textContent = ':' + entry.name + ':'

    row.appendChild(emojiSpan)
    row.appendChild(nameSpan)

    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertEmojiFromDropdown(entry)
    })

    dd.appendChild(row)
  })
  dd.style.display = 'block'
}

function hideEmojiDropdown() {
  emojiAcState.active = false
  emojiAcState.matches = []
  emojiAcState.index = 0
  emojiAcState.query = ''
  emojiAcState.colonPos = -1
  const dd = document.getElementById('hs-mc-emoji-dropdown')
  if (dd) dd.style.display = 'none'
}

function insertEmojiFromDropdown(entry) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  if (wysiwygEnabled) {
    // Find the text node with the :query and replace it
    const sel = window.getSelection()
    if (!sel?.rangeCount) {
      hideEmojiDropdown()
      return
    }
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node?.nodeType !== Node.TEXT_NODE) {
      hideEmojiDropdown()
      return
    }
    const text = node.textContent
    const cursor = range.startOffset
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) {
      hideEmojiDropdown()
      return
    }

    // Wrap emoji in a span so the caret has an unambiguous boundary. Setting
    // a caret offset past a U+FE0F variation selector inside a plain text
    // node confuses Chrome's keyboard handler — the next typed char snaps to
    // *before* the grapheme.
    const span = document.createElement('span')
    span.className = 'hs-mc-emoji'
    span.textContent = entry.emoji
    span.title = ':' + entry.name + ':'
    span.setAttribute('data-emoji-name', entry.name)
    span.setAttribute('contenteditable', 'false') // atomic — caret can't enter
    const tail = text.slice(cursor)
    const head = text.slice(0, colonIdx)
    // Trailing space keeps emote-name boundaries intact downstream.
    const trailing = !/^\s/.test(tail) ? ' ' : ''
    // Leading space when this emoji lands right after an existing chip (no
    // plain-text gap). Without it the input event triggers chip-merge
    // safeguards that collapse adjacent chips back to plain text.
    let leading = ''
    if (!head) {
      const prev = node.previousSibling
      const prevIsChip =
        prev?.nodeType === Node.ELEMENT_NODE &&
        ((prev.tagName === 'IMG' && (prev.classList?.contains('hs-input-emote') || prev.dataset?.emoteName)) ||
          prev.classList?.contains('hs-input-stack') ||
          prev.classList?.contains('hs-mc-emoji') ||
          prev.classList?.contains('hs-mc-user'))
      if (prevIsChip) leading = ' '
    }
    const beforeNode = document.createTextNode(leading + head)
    const afterNode = document.createTextNode(trailing + tail)
    const parent = node.parentNode
    parent.insertBefore(beforeNode, node)
    parent.insertBefore(span, node)
    parent.insertBefore(afterNode, node)
    parent.removeChild(node)
    const newRange = document.createRange()
    newRange.setStart(afterNode, Math.min(trailing.length, afterNode.textContent.length))
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  } else {
    const text = input.value
    const cursor = input.selectionStart
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) {
      hideEmojiDropdown()
      return
    }
    const tail = text.slice(cursor)
    const space = !/^\s/.test(tail) ? ' ' : ''
    input.value = text.slice(0, colonIdx) + entry.emoji + space + tail
    const newPos = colonIdx + entry.emoji.length + space.length
    input.selectionStart = input.selectionEnd = newPos
  }

  pendingMessage = getInputText()
  updateCharCount()
  hideEmojiDropdown()
  input.focus()
}

function checkEmojiAutocomplete() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  const ctx = getEmojiColonContext(input)
  if (!ctx) {
    if (emojiAcState.active) hideEmojiDropdown()
    return
  }

  const matches = filterEmoji(ctx.query)
  if (matches.length === 0) {
    if (emojiAcState.active) hideEmojiDropdown()
    return
  }

  emojiAcState.active = true
  emojiAcState.matches = matches
  emojiAcState.query = ctx.query
  emojiAcState.colonPos = ctx.colonPos
  emojiAcState.index = 0
  showEmojiDropdown(matches, 0)
}

// Reply state management
function setReplyState(state) {
  replyState = state
  showInputBar()
  const bar = document.getElementById('hs-mc-inputbar')
  if (!bar) return
  // Remove existing indicator
  document.getElementById('hs-mc-reply-indicator')?.remove()
  const indicator = document.createElement('div')
  indicator.id = 'hs-mc-reply-indicator'
  const label = document.createElement('span')
  label.textContent = '\u21a9 ' + t('mc_input_replying_to', [state.user])
  const cancel = document.createElement('button')
  cancel.id = 'hs-mc-reply-cancel'
  cancel.textContent = '✕'
  cancel.title = t('mc_input_cancel_reply')
  cancel.addEventListener('click', clearReplyState)
  indicator.appendChild(label)
  indicator.appendChild(cancel)
  bar.insertBefore(indicator, bar.firstChild)
  document.getElementById('hs-mc-input')?.focus()
}

function clearReplyState() {
  replyState = null
  document.getElementById('hs-mc-reply-indicator')?.remove()
  hideInputBar()
}

// Get Twitch auth token from cookie
function getTwitchAuthToken() {
  const cookies = document.cookie.split(';')
  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf('=')
    if (eqIdx === -1) continue
    const key = cookie.slice(0, eqIdx).trim()
    const value = cookie.slice(eqIdx + 1).trim()
    if (key === 'auth-token' && value) {
      return decodeURIComponent(value)
    }
  }
  return null
}

// Async version — returns { token, username } for cross-platform Twitch posting
// Tries document.cookie first, falls back to background.js cookies API
async function getTwitchAuthTokenAsync() {
  const localToken = getTwitchAuthToken()
  if (localToken) return { token: localToken, username: null }
  // Cross-domain: ask background.js to read Twitch cookies
  try {
    const resp = await safeSendMessage({ type: 'get_twitch_auth_token' })
    return { token: resp?.token || null, username: resp?.username || null }
  } catch {}
  return { token: null, username: null }
}

// Send message to current tab's channel
// Build emoji lookup map (once)
const _emojiMap = new Map()
if (typeof EMOJI_DATA !== 'undefined') {
  for (const e of EMOJI_DATA) _emojiMap.set(e.name, e.emoji)
}

// Replace :shortcode: patterns with emoji characters
function convertEmojiShortcodes(text) {
  if (_emojiMap.size === 0) return text
  return text.replace(/:([a-z0-9_]+):/g, (match, name) => _emojiMap.get(name) || match)
}

function clearInput(input) {
  hideEmojiDropdown()
  hideSlashDropdown()
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
}

function checkSlashAutocomplete() {
  const text = (typeof getInputText === 'function' ? getInputText() : '') || ''
  const m = text.match(/^\/([a-z?]*)$/i)
  if (!m) {
    hideSlashDropdown()
    return
  }
  const q = m[1].toLowerCase()
  const matches = SLASH_COMMANDS.filter((c) => c.cmd.startsWith(q)).slice(0, 8)
  if (matches.length === 0) {
    hideSlashDropdown()
    return
  }
  if (!slashAcState.active || slashAcState.index >= matches.length) slashAcState.index = 0
  slashAcState.active = true
  slashAcState.matches = matches
  showSlashDropdown(matches, slashAcState.index)
}

function showSlashDropdown(matches, idx) {
  let dd = document.getElementById('hs-mc-slash-dropdown')
  if (!dd) {
    dd = document.createElement('div')
    dd.id = 'hs-mc-slash-dropdown'
    document.getElementById('hs-mc-inputbar')?.appendChild(dd)
  }
  dd.textContent = ''
  matches.forEach((c, i) => {
    const row = document.createElement('div')
    row.className = 'hs-mc-slash-row' + (i === idx ? ' selected' : '')
    row.dataset.index = i
    const name = document.createElement('span')
    name.className = 'hs-mc-slash-name'
    name.textContent = '/' + c.cmd
    const args = document.createElement('span')
    args.className = 'hs-mc-slash-args'
    args.textContent = c.args ? ' ' + c.args : ''
    const desc = document.createElement('span')
    desc.className = 'hs-mc-slash-desc'
    desc.textContent = c.desc
    row.appendChild(name)
    row.appendChild(args)
    row.appendChild(desc)
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertSlashCommand(c)
    })
    dd.appendChild(row)
  })
  dd.style.display = 'block'
}

function hideSlashDropdown() {
  slashAcState.active = false
  slashAcState.matches = []
  slashAcState.index = 0
  const dd = document.getElementById('hs-mc-slash-dropdown')
  if (dd) dd.style.display = 'none'
}

function insertSlashCommand(c) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  const inserted = '/' + c.cmd + (c.args ? ' ' : '')
  if (wysiwygEnabled) {
    input.textContent = inserted
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
  } else {
    input.value = inserted
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(inserted.length, inserted.length)
    }
  }
  hideSlashDropdown()
  pendingMessage = inserted
  if (typeof updateCharCount === 'function') updateCharCount()
  input.focus()
}

// Slash commands we own. Anything not in here falls through to the platform
// (Twitch IRC / Kick) so /ban /timeout /mod /vip /raid /clear /slow /me etc
// just work for users with mod perms.
//
// Handler return contract:
//   true     -> consumed, do nothing else
//   string   -> rewrite the outgoing text to this and continue normal send
//   anything else -> not a slash command we handle, pass through unchanged
const SLASH_ALIASES = {
  post: 'op',
  whisper: 'w',
  re: 'r',
  reply: 'r',
  // /ban /unban /timeout /to /b /untimeout /delete — handled below via GQL,
  // not passthrough. Twitch deprecated these as IRC chat commands in Feb 2023;
  // sending them as text now silently no-ops, which is what caused multichat's
  // pre-fix /unban to do nothing. Aliases map all common shorthands to the
  // canonical command.
  b: 'ban',
  to: 'timeout',
  untimeout: 'unban',
  unto: 'unban',
  del: 'delete',
  lc: 'lclear',
  '?': 'help',
  // chat-mode aliases → canonical mode command (see CHAT_MODES)
  followersonly: 'followers',
  followeronly: 'followers',
  slowmode: 'slow',
  emote: 'emoteonly',
  emoteonlymode: 'emoteonly',
  subonly: 'subscribers',
  subsonly: 'subscribers',
  subscribersonly: 'subscribers',
  subs: 'subscribers',
  uniquechat: 'unique',
  r9k: 'unique',
  r9kbeta: 'unique',
}

// Twitch chat modes — set via Helix /chat/settings (setTwitchChatMode). Each maps
// to the Helix boolean field; `dur` modes also take a duration arg. follower
// duration is MINUTES (0–129600), slow is SECONDS (3–120). Kick has no chat-mode
// write API wired yet, so these are twitch-only (clear message below).
const CHAT_MODES = {
  followers: { field: 'follower_mode', dur: 'follower_mode_duration', unit: 'min', label: 'followers-only' },
  slow: { field: 'slow_mode', dur: 'slow_mode_wait_time', unit: 'sec', label: 'slow mode' },
  emoteonly: { field: 'emote_mode', label: 'emote-only' },
  subscribers: { field: 'subscriber_mode', label: 'subscribers-only' },
  unique: { field: 'unique_chat_mode', label: 'unique-chat' },
}

// Parse a chat-mode duration arg into the unit Twitch expects.
// minutes: bare number = minutes; m/h/d/w suffixes; s rounds up to a minute.
// seconds: bare number = seconds. Returns null on malformed input.
function _parseModeDuration(arg, unit) {
  const m = arg.match(/^(\d+)\s*([smhdw]?)$/)
  if (!m) return null
  let n = parseInt(m[1], 10)
  const suf = m[2]
  if (unit === 'sec') {
    if (suf === 'm') n *= 60
    else if (suf === 'h') n *= 3600
    return Math.min(86400, Math.max(0, n))
  }
  // minutes
  if (suf === 'h') n *= 60
  else if (suf === 'd') n *= 1440
  else if (suf === 'w') n *= 10080
  else if (suf === 's') n = Math.ceil(n / 60)
  return Math.min(129600, Math.max(0, n))
}

async function handleSlashCommand(text, input) {
  const parts = text.match(/^\/(\w+|\?)\s*(.*)$/)
  if (!parts) return false
  let [, cmd, rest] = parts
  cmd = cmd.toLowerCase()
  if (SLASH_ALIASES[cmd] === null) return false // explicit pass-through
  if (typeof SLASH_ALIASES[cmd] === 'string') cmd = SLASH_ALIASES[cmd]

  if (cmd === 'op') {
    if (!rest.trim()) {
      showToast('usage: /op <text>')
      return true
    }
    if (!hsAuthToken) {
      showToast('log in at heatsync.org first to /op', 'error')
      return true
    }
    const ok = await postFeedMessage(rest.trim(), { topLevel: true })
    showToast(ok ? 'success' : 'post failed', ok ? 'success' : 'error')
    clearInput(input)
    return true
  }

  if (cmd === 'w') {
    const match = rest.match(/^@?(\S+)\s+(.+)$/)
    if (!match) {
      showToast('usage: /w <user> <message>')
      return true
    }
    const [, username, msg] = match
    await sendSlashWhisper('twitch', username, msg, input)
    return true
  }

  if (cmd === 'dm') {
    const match = rest.match(/^@?(\S+)\s+(.+)$/)
    if (!match) {
      showToast('usage: /dm <user> <message>')
      return true
    }
    const [, username, msg] = match
    await sendSlashWhisper('heatsync', username, msg, input)
    return true
  }

  if (cmd === 'r') {
    if (!rest.trim()) {
      showToast('usage: /r <message>')
      return true
    }
    if (!lastWhisperKey) {
      showToast('no one to reply to', 'error')
      return true
    }
    if (currentTab !== 'whispers') switchTab('whispers')
    await sendWhisperMessage(lastWhisperKey, rest.trim())
    clearInput(input)
    return true
  }

  if (cmd === 'follow' || cmd === 'unfollow') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) {
      showToast('usage: /' + cmd + ' <user>')
      return true
    }
    if (typeof resolveIdentity !== 'function') {
      showToast('not ready', 'error')
      return true
    }
    const ri = await resolveIdentity(u, {})
    const p = ri?.profile
    const id = p?.id || p?.userId
    if (!id) {
      if (ri?.transient) {
        showToast(
          ri.status === 429 ? 'rate limited — try in a sec' : `couldn't reach server (${ri.status || 'net'})`,
          'error',
        )
      } else {
        showToast(u + " isn't on heatsync", 'error')
      }
      return true
    }
    const yf = !!(p.relationship?.youFollow || p.relationship?.isFollowing)
    const wantFollow = cmd === 'follow'
    if (wantFollow && yf) {
      showToast('already following ' + u)
      return true
    }
    if (!wantFollow && !yf) {
      showToast('not following ' + u)
      return true
    }
    // pcToggleFollow flips the current state — pass `yf` as currentlyFollowing
    pcToggleFollow(id, u, yf)
    return true
  }

  if (cmd === 'mute') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) {
      showToast('usage: /mute <user>')
      return true
    }
    // platform unknown from slash command — null platform → userKey returns bare
    // key, so /mute stays global (correct: no platform context from bare name).
    const aliasKeys = typeof getUserAliasKeys === 'function' ? getUserAliasKeys(u, null) : [u]
    const already = typeof isUserMuted === 'function' ? isUserMuted(u, null) : mutedUsers.has(u)
    if (already) {
      showToast(`${u} already muted`)
      return true
    }
    for (const k of aliasKeys) mutedUsers.add(k)
    chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] }).catch((e) => log('mute persist failed:', e))
    const exp = Date.now() + 86400000
    for (const k of aliasKeys) safeSendMessage({ type: 'mute_user', username: k, expiresAt: exp })
    const aliasNote = aliasKeys.length > 1 ? ` (+@${aliasKeys[1]})` : ''
    showToast(`muted ${u}${aliasNote} (24h)`, 'success')
    renderMessages(currentTab)
    return true
  }

  if (cmd === 'unmute') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) {
      showToast('usage: /unmute <user>')
      return true
    }
    const aliasKeys = typeof getUserAliasKeys === 'function' ? getUserAliasKeys(u, null) : [u]
    const wasMuted = typeof isUserMuted === 'function' ? isUserMuted(u, null) : mutedUsers.has(u)
    if (!wasMuted) {
      showToast(`${u} not muted`)
      return true
    }
    for (const k of aliasKeys) mutedUsers.delete(k)
    chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
    for (const k of aliasKeys) safeSendMessage({ type: 'unmute_user', username: k })
    showToast(`unmuted ${u}`, 'success')
    renderMessages(currentTab)
    return true
  }

  if (cmd === 'shrug') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '¯\\_(ツ)_/¯'
  }

  if (cmd === 'tableflip') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '(╯°□°)╯︵ ┻━┻'
  }

  if (cmd === 'unflip') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '┬─┬ノ( ゜-゜ノ)'
  }

  if (cmd === 'lclear') {
    let cleared = 0
    if (irc?.channels?.has(currentTab)) {
      irc.channels.get(currentTab).clear?.()
      cleared++
    }
    if (kickChat?.channels?.has(currentTab)) {
      kickChat.channels.get(currentTab).clear?.()
      cleared++
    }
    renderMessages(currentTab)
    showToast(cleared ? 'local buffer cleared' : 'nothing to clear here', cleared ? 'success' : undefined)
    clearInput(input)
    return true
  }

  if (cmd === 'help') {
    showSlashHelp()
    clearInput(input)
    return true
  }

  // /status [channel] — show current chat modes + stream info for a twitch
  // channel. Defaults to the current channel tab. Mod-only fields (chat
  // delay) light up automatically when the viewer mods the channel.
  if (cmd === 'status' || cmd === 'modes') {
    const arg = rest.trim().toLowerCase().replace(/^#/, '')
    const ch =
      arg && /^[a-z0-9_]{2,40}$/.test(arg)
        ? arg
        : typeof currentTab === 'string' && /^[a-z0-9_]{2,40}$/.test(currentTab)
          ? currentTab
          : null
    if (!ch) {
      showToast('/status needs a channel tab (or /status <name>)', 'error')
      return true
    }
    clearInput(input)
    showChatStatusPanel(ch)
    return true
  }

  // ─── Mod actions ─── Twitch via GQL, Kick via tab-relay API.
  // On a Twitch+Kick dual-link tab, dispatch to BOTH and surface a combined toast
  // so a mod can sanction a user everywhere with one command.
  // currentTab = channel login when on a per-channel tab; on aggregate tabs we
  // can't pick a single channel, so refuse with a useful toast.
  const modChannel = typeof currentTab === 'string' && /^[a-z0-9_]{2,40}$/i.test(currentTab) ? currentTab : null
  const _modCh = modChannel ? config.channels.find((c) => c.id === modChannel) : null
  const _twitchModName = _modCh?.twitch || (modChannel && !_modCh ? modChannel : null)
  const _kickModSlug = _modCh?.kick || null
  // Dual-platform dispatch + per-platform notice injection + combined toast all
  // live in the shared backbone (main.js dispatchModAction / showModResultToast).

  if (cmd === 'ban' || cmd === 'timeout' || cmd === 'unban') {
    if (!modChannel) {
      showToast(`/${cmd} needs a channel tab (not live/mentions/posts)`, 'error')
      return true
    }
    if (!_twitchModName && !_kickModSlug) {
      showToast(`/${cmd} needs a twitch or kick channel`, 'error')
      return true
    }
    if (cmd === 'ban') {
      const m = rest.match(/^@?(\S+)(?:\s+(.+))?$/)
      if (!m) {
        showToast('usage: /ban <user> [reason]', 'error')
        return true
      }
      const [, target, reason] = m
      const r = await dispatchModAction({ channel: modChannel, action: 'ban', target, reason, fanout: true })
      showModResultToast('banned', target, r)
      if (r?.anyOk) clearInput(input)
      return true
    }
    if (cmd === 'timeout') {
      const m = rest.match(/^@?(\S+)(?:\s+(\d+))?(?:\s+(.+))?$/)
      if (!m) {
        showToast('usage: /timeout <user> [seconds] [reason]', 'error')
        return true
      }
      const [, target, secStr, reason] = m
      const sec = secStr ? Math.max(1, parseInt(secStr)) : 600
      const r = await dispatchModAction({
        channel: modChannel,
        action: 'timeout',
        target,
        durationSec: sec,
        reason,
        fanout: true,
      })
      showModResultToast(`timed out ${sec}s`, target, r)
      if (r?.anyOk) clearInput(input)
      return true
    }
    if (cmd === 'unban') {
      const target = rest.trim().replace(/^@/, '')
      if (!target) {
        showToast('usage: /unban <user>', 'error')
        return true
      }
      const r = await dispatchModAction({ channel: modChannel, action: 'unban', target, fanout: true })
      showModResultToast('unbanned', target, r)
      if (r?.anyOk) clearInput(input)
      return true
    }
  }

  if (cmd === 'delete') {
    if (!modChannel) {
      showToast('/delete needs a channel tab', 'error')
      return true
    }
    const messageID = rest.trim()
    if (!messageID) {
      showToast('usage: /delete <message-id> (right-click a message)', 'error')
      return true
    }
    if (!_twitchModName && !_kickModSlug) {
      showToast('/delete needs a twitch or kick channel', 'error')
      return true
    }
    // Raw id → platform unknown; dispatcher tries Twitch first, then Kick.
    const r = await dispatchModAction({ channel: modChannel, action: 'delete', msgId: messageID })
    const err = (r?.tResp || r?.kResp)?.error || 'unknown'
    showToast(r?.anyOk ? 'deleted' : `delete failed: ${err}`, r?.anyOk ? 'success' : 'error')
    if (r?.anyOk) clearInput(input)
    return true
  }

  // /nuke <term> [seconds] — bulk-delete recent messages whose text contains
  // <term> (case-insensitive substring; NOT regex, so no ReDoS surface) within
  // the last [seconds] (default 30, capped). Reads the local buffers and issues
  // one delete per match via the same single-delete path /delete uses. Guarded:
  // min 2-char term, hard match cap, and a confirm modal before anything fires.
  if (cmd === 'nuke') {
    if (!modChannel) {
      showToast('/nuke needs a channel tab', 'error')
      return true
    }
    if (!_twitchModName && !_kickModSlug) {
      showToast('/nuke needs a twitch or kick channel', 'error')
      return true
    }
    const NUKE_MAX = 100 // never delete more than this in one invocation
    const NUKE_MAX_WINDOW = 300 // seconds — furthest lookback allowed
    const nm = rest.trim().match(/^(.+?)(?:\s+(\d+))?$/)
    const term = nm ? nm[1].trim() : ''
    if (term.length < 2) {
      showToast('usage: /nuke <term> [seconds] — term must be 2+ chars', 'error')
      return true
    }
    const windowSec = Math.min(NUKE_MAX_WINDOW, nm && nm[2] ? Math.max(1, parseInt(nm[2])) : 30)
    const since = Date.now() - windowSec * 1000
    const needle = term.toLowerCase()
    // Collect deletable matches from both platform buffers, newest dropped first
    // if over the cap (keep the oldest so a raid's leading edge is cleared).
    const seenIds = new Set()
    const targets = []
    for (const buf of [irc?.channels?.get(modChannel), kickChat?.channels?.get(modChannel)]) {
      if (!buf?.getAll) continue
      for (const m of buf.getAll()) {
        if (!m?.id || typeof m.text !== 'string') continue
        if ((m.time || 0) < since) continue
        if (!m.text.toLowerCase().includes(needle)) continue
        if (seenIds.has(m.id)) continue
        seenIds.add(m.id)
        targets.push({ msgId: m.id, platform: m.platform })
      }
    }
    if (targets.length === 0) {
      showToast(`/nuke: no messages matching "${term}" in the last ${windowSec}s`, 'error')
      return true
    }
    const capped = targets.length > NUKE_MAX
    const batch = capped ? targets.slice(0, NUKE_MAX) : targets
    const { ok } = await hsConfirm(
      `nuke ${batch.length}${capped ? `+ (capped from ${targets.length})` : ''} message${batch.length === 1 ? '' : 's'} matching "${term}" in #${modChannel}?`,
      'nuke',
    )
    if (!ok) return true
    const results = await Promise.allSettled(
      batch.map((t) =>
        dispatchModAction({ channel: modChannel, platform: t.platform, action: 'delete', msgId: t.msgId }),
      ),
    )
    const okCount = results.filter((r) => r.status === 'fulfilled' && r.value?.anyOk).length
    showToast(`nuked ${okCount}/${batch.length} matching "${term}"`, okCount ? 'success' : 'error')
    if (okCount) clearInput(input)
    return true
  }

  // ─── Chat modes (mod) ─── followers/slow/emoteonly/subscribers/unique.
  // Twitch via Helix /chat/settings (setTwitchChatMode). `/<mode> off` disables;
  // duration modes take an optional arg (/followers 30, /slow 10). Kick has no
  // chat-mode write API wired yet → clear message, never a silent no-op.
  if (CHAT_MODES[cmd]) {
    // Only followers-only is wired (twitch GQL SetFollowersOnlyModeSetting). The
    // other modes (slow/emote/subs/unique) need their own captured GQL mutations
    // — Helix /chat/settings 404s for the web client, so don't pretend they work.
    if (cmd !== 'followers') {
      showToast(`/${cmd} isn't wired yet — only /followers works for now`, 'error')
      return true
    }
    // Target the twitch channel you're moderating: a real channel tab's twitch
    // login, else the twitch channel you're currently viewing (so it works from
    // the live/aggregate tab too, where currentTab='live' is not a channel).
    const twitchTarget =
      _modCh?.twitch || (hostPlatform === 'twitch' ? (getCurrentChannel() || '').toLowerCase().replace(/^#/, '') : null)
    if (!twitchTarget) {
      showToast('/followers is twitch-only — open a twitch channel', 'error')
      return true
    }
    const arg = rest.trim().toLowerCase()
    const off = arg === 'off'
    let minutes
    if (off) minutes = -1
    else if (!arg)
      minutes = 0 // any follower
    else {
      minutes = _parseModeDuration(arg, 'min')
      if (minutes == null) {
        showToast('usage: /followers [mins] | off', 'error')
        return true
      }
    }
    const resp = await setTwitchFollowersMode(twitchTarget, minutes)
    if (resp.ok) {
      showToast(
        off ? 'followers-only off' : minutes ? `followers-only on (${minutes}m)` : 'followers-only on',
        'success',
      )
      clearInput(input)
    } else {
      showToast(`/followers failed: ${resp.error}`, 'error')
    }
    return true
  }

  return false
}

const SLASH_HELP_LINES = [
  '/op <text>             — post to home',
  '/w <user> <msg>        — twitch whisper',
  '/dm <user> <msg>       — heatsync DM',
  '/r <msg>               — reply to last whisper',
  '/mute <user>           — local mute (24h)',
  '/unmute <user>         — local unmute',
  '/shrug [text]          — append ¯\\_(ツ)_/¯',
  '/tableflip [text]      — append (╯°□°)╯︵ ┻━┻',
  '/unflip [text]         — append ┬─┬ノ( ゜-゜ノ)',
  '/lclear                — clear current tab locally',
  '/status [channel]      — show chat modes + stream info',
  '/help                  — this list',
  '',
  'mod (need a channel tab — fires both twitch+kick if linked):',
  '/ban <user> [reason]   — perma ban',
  '/timeout <user> [s] [r]— timeout, default 600s',
  '/unban <user>          — unban or end timeout',
  '/delete <msg-id>       — delete one message',
  '/nuke <term> [secs]    — delete recent msgs matching term (default 30s)',
  '',
  'chat modes (twitch, mod):',
  '/followers [mins]      — followers-only ("/followers off")',
  '/slow [secs]           — slow mode, default 30s ("/slow off")',
  '/emoteonly             — emote-only ("/emoteonly off")',
  '/subscribers           — subs-only ("/subscribers off")',
  '/unique                — unique-chat/r9k ("/unique off")',
  '',
  '/me /color and chat pass through to twitch & kick.',
  '/mod /vip /raid /clear /announce are not yet wired —',
  'use twitch native chat or mod panel.',
]

function showSlashHelp() {
  // Reuse toast for short feedback — but the help list is multi-line, so build a
  // lightweight inline overlay instead.
  let panel = document.getElementById('hs-mc-slash-help')
  if (panel) {
    panel.remove()
    return
  }
  panel = document.createElement('div')
  panel.id = 'hs-mc-slash-help'
  panel.style.cssText =
    "position:fixed;bottom:60px;right:20px;z-index:99999;background:#000;border:2px solid #ff8700;padding:10px 14px;font:13px/1.4 'CozetteVector','Courier New',monospace;color:#fff;white-space:pre;max-width:420px;box-shadow:0 0 12px rgba(255,135,0,0.5)"
  panel.textContent = SLASH_HELP_LINES.join('\n')
  panel.addEventListener('click', () => panel.remove())
  document.body.appendChild(panel)
  setTimeout(() => panel?.remove(), 12000)
}

// Mounts the status panel built by buildChatStatusPanel into a fixed
// overlay anchored bottom-right (matches /help). Click panel or wait 20s
// to dismiss. Re-invoking /status replaces the existing panel.
async function showChatStatusPanel(channel) {
  document.getElementById('hs-mc-status-overlay')?.remove()
  const wrap = document.createElement('div')
  wrap.id = 'hs-mc-status-overlay'
  wrap.className = 'hs-mc-status-overlay'
  const loading = document.createElement('div')
  loading.className = 'hs-mc-status-loading'
  loading.textContent = 'fetching #' + channel + '…'
  wrap.appendChild(loading)
  wrap.addEventListener('click', () => wrap.remove())
  document.body.appendChild(wrap)
  let panel
  try {
    panel = await buildChatStatusPanel(channel)
  } catch (e) {
    panel = null
  }
  if (!document.body.contains(wrap)) return
  if (!panel) {
    loading.textContent = 'could not fetch #' + channel + ' (offline or not on twitch?)'
    setTimeout(() => wrap?.remove(), 5000)
    return
  }
  loading.remove()
  wrap.appendChild(panel)
  setTimeout(() => wrap?.remove(), 20000)
}

async function sendSlashWhisper(platform, username, text, input) {
  const lowerUser = username.toLowerCase()
  let key

  if (platform === 'twitch') {
    key = `twitch:${lowerUser}`
    if (!whisperUsers.has(key)) {
      // Resolve username → Twitch ID via the canonical first-party resolver
      // (Twitch GQL; decapi.me only as its own internal last-resort fallback).
      let body
      try {
        body = await resolveTwitchChannelId(lowerUser)
      } catch (e) {
        showToast(t('mc_whisper_resolve_failed'), 'error')
        return
      }
      if (!body) {
        showToast(t('mc_whisper_user_not_found', [username]), 'error')
        return
      }
      whisperUsersSet(key, { platform: 'twitch', userId: body, displayName: username, color: '#fff' })
    }
  } else {
    // HeatSync DM — resolve username → user_id via profile API
    const profileResp = await apiFetch(`/api/profile/${encodeURIComponent(lowerUser)}`)
    if (!profileResp.ok || !profileResp.data?.profile?.user_id) {
      showToast(t('mc_whisper_hs_not_found', [username]), 'error')
      return
    }
    const userId = profileResp.data.profile.user_id
    key = `hs:${userId}`
    whisperUsersSet(key, {
      platform: 'heatsync',
      userId,
      displayName: profileResp.data.profile.display_name || username,
      color: profileResp.data.profile.user_color || '#fff',
    })
  }

  if (currentTab !== 'whispers') switchTab('whispers')
  await sendWhisperMessage(key, text)
  clearInput(input)
}

// Auto-add to the viewer's set any remote-searched (7TV/BTTV/FFZ) emote that's in
// the outgoing message but not yet owned — so an emote you Tab-searched and sent
// becomes yours and renders next time, instead of going out as bare text. Only
// names tracked in recentRemoteCompletions qualify, so channel/global/owned
// emotes (which already render) never burn slots. Fire-and-forget.
function autoAddInputEmotes(text) {
  if (!text || !recentRemoteCompletions.size) return
  const seen = new Set()
  for (const word of text.split(/\s+/)) {
    if (!word || seen.has(word)) continue
    seen.add(word)
    const rec = recentRemoteCompletions.get(word)
    if (!rec) continue
    if (typeof blockedEmoteNames !== 'undefined' && blockedEmoteNames.has(word)) continue
    if (typeof inventoryEmotes !== 'undefined' && inventoryEmotes.has(word)) continue
    if (typeof pendingEmoteOps !== 'undefined' && pendingEmoteOps.has(word)) continue
    // Skip heatsync curated globals — server rejects with "global emotes cannot
    // be added to personal inventory" and they already render for everyone, so
    // the POST is wasted and the failure toast misleads ("failed to add Wave"
    // when in fact Wave was never meant to be added).
    if (typeof emoteCache !== 'undefined') {
      const cached = emoteCache.get(word)
      if (cached?.state === 'global') continue
    }
    // Optimistically register locally so the own-message echo (arrives in ~ms,
    // before the server add resolves) renders the emote image instead of raw
    // text — text has no wrapper, so a late add can't retro-fix it. Mirrors the
    // picker's optimistic add (emotes.js). addEmoteToInventory then persists it.
    if (typeof viewerPersonalEmotes !== 'undefined' && !viewerPersonalEmotes.has(word)) {
      viewerPersonalEmotes.set(word, { url: rec.url, source: rec.source, state: 'owned', zeroWidth: !!rec.zeroWidth })
    }
    if (typeof addEmoteToInventory === 'function')
      addEmoteToInventory(word, rec.url, rec.source, undefined, !!rec.zeroWidth, /* silent */ true)
  }
}

async function sendMessage() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  let text = convertEmojiShortcodes(getInputText().trim())
  if (!text) return

  // Remote-searched emotes in the outgoing message get added to the set on send.
  autoAddInputEmotes(text)

  // Resub-share mode — typed text becomes the celebration BODY via Twitch's
  // Chat_ShareResub_UseResubToken GQL mutation. consume() fires that mutation
  // and injects a local synthetic for instant visual feedback. Returns true
  // when the text was consumed AS the celebration body (don't send again as
  // plain PRIVMSG — would duplicate); returns false in the no-token fallback
  // path so the typed text still lands as a normal chat message.
  if (window.__hsResubShare?.active?.()) {
    try {
      if (window.__hsResubShare.consume(text) === true) {
        clearInput(document.getElementById('hs-mc-input'))
        return
      }
    } catch (_) {}
  }
  // Watch-streak share mode — same contract as resub-share. consume() fires
  // the native broadcast + injects a local synth, then we fall through so the
  // user's typed body also lands as a normal PRIVMSG (visible to everyone).
  if (window.__hsWatchstreakShare?.active?.()) {
    try {
      window.__hsWatchstreakShare.consume(text)
    } catch (_) {}
  }

  // Slash commands — work from any tab. Handler may return:
  //   true   -> consumed, exit
  //   string -> rewrite outgoing text and continue normal send
  //   else   -> not ours, pass raw text through to platform
  if (text.startsWith('/')) {
    const result = await handleSlashCommand(text, input)
    if (result === true) return
    if (typeof result === 'string') text = result
  }

  // Feed tab: plain text + media paste posts directly to home feed.
  // Slash commands are still respected (e.g. /op explicit, /w whisper).
  if (currentTab === 'feed') {
    await postFeedMessage(text, { topLevel: true })
    return
  }

  // Whispers/mentions: still require slash commands
  if (currentTab === 'whispers' || currentTab === 'mentions') {
    flashInputError(input)
    return
  }

  // Determine target channel + platform
  let targetChannel
  let ch = null
  if (currentTab === 'live') {
    targetChannel = getLiveChannel()
    // Live tab itself isn't a config entry. Resolve the linked channel pair
    // by matching the live channel name to either twitch or kick slug so a
    // dual-link channel fans out to BOTH platforms on Live tab, not just the
    // host. Without this, sending from Live on twitch.tv to a twitch+kick
    // dual-link channel skipped Kick (kickSlug undefined → sendToKick=false).
    if (targetChannel) {
      const lower = targetChannel.toLowerCase()
      ch = config.channels.find((c) => c.twitch?.toLowerCase() === lower || c.kick?.toLowerCase() === lower) || null
    }
  } else if (currentTab === 'add' || currentTab === 'settings') {
    flashInputError(input)
    return
  } else {
    ch = config.channels.find((c) => c.id === currentTab)
    targetChannel = ch?.twitch || ch?.kick || currentTab
  }

  if (!targetChannel) {
    flashInputError(input)
    return
  }

  // Resolve platform targets. Anonymous-live (no ch match) falls back to the
  // host platform only. Configured channels (with ch) fan out to every linked
  // platform regardless of the host.
  const kickSlug = ch?.kick
  const twitchName = ch?.twitch
  const anonLive = currentTab === 'live' && !ch

  const sendToKick = !!kickSlug || (anonLive && hostPlatform === 'kick')
  const sendToTwitch = !!twitchName || (anonLive && hostPlatform === 'twitch')

  const ytUrl = ch?.youtube
  const isLiveYt = currentTab === 'live' && hostPlatform === 'yt'
  const sendToYoutube = !!ytUrl || isLiveYt
  const isDualSend = sendToKick && sendToTwitch

  // /me action — give each platform the right wire form for an action message.
  // Twitch IRC carries actions as a CTCP ACTION (\x01ACTION text\x01) — the same
  // primitive Twitch echoes back and irc.js already parses — so we send that
  // directly instead of relying on Twitch's "/me" chat-command parser (which is
  // a deprecation-exempt special case we'd rather not depend on). Kick and
  // YouTube send over REST, which has no action concept: a "/me ..." literal
  // would post verbatim on Kick and is dropped on YouTube, so they get the bare
  // body. A bare "/me" with no body falls through as ordinary text.
  const meMatch = text.match(/^\/me\s+(\S[\s\S]*)$/i)
  const restText = meMatch ? meMatch[1].trim() : text
  const twitchText = meMatch ? `\x01ACTION ${restText}\x01` : text

  // Register pending-send tracker — echo confirmation is our ground truth
  // for "did the platform deliver?", separate from sendIrc/Kick's "did we
  // write to the socket?" return value. See pendingSends in this file.
  const _pendingPlatforms = []
  if (sendToTwitch) _pendingPlatforms.push('twitch')
  if (sendToKick) _pendingPlatforms.push('kick')
  // YT echoes don't loop back through chat-message handlers — only the
  // pure-YT send path explicitly confirms via confirmPending(id, 'yt').
  // For dual/triple sends including YT, YT side-fires as best-effort and
  // we don't await its echo (tracking would always fire no_echo on YT).
  if (sendToYoutube && !sendToKick && !sendToTwitch) _pendingPlatforms.push('yt')
  // Track by restText, not text: for a /me action every platform's echo carries
  // the bare body (Twitch strips the CTCP wrapper, Kick/YT never saw the /me),
  // so the pending tracker and peekSentHost/isSentEcho must key on the body or
  // the echo never matches — firing a false "did not confirm" warning and
  // losing badge attribution + dual-send dedup. Identical to text when not /me.
  const _synthId = registerPendingSend({
    text: restText,
    channel: targetChannel,
    platforms: _pendingPlatforms,
    replyParentId: replyState?.msgId || null,
    noEcho: isNonEchoingCommand(text),
  })

  // Track every send (not just dual-send). The host platform stored on each
  // entry powers two things: (1) dedup of dual-send second echoes, (2) badge
  // attribution via peekSentHost so own messages render with the platform
  // the user is viewing FROM (extension input on kick.com → [K]) regardless
  // of which relay platform actually echoed back.
  // echoes = one per platform whose chat stream loops the message back, so the
  // dedup entry survives until the last echo (twitch + kick + youtube triple).
  const _echoCount = (sendToTwitch ? 1 : 0) + (sendToKick ? 1 : 0) + (sendToYoutube ? 1 : 0)
  trackSentMessage(restText, undefined, _synthId, _echoCount || 1)

  // Push to message history (dedup consecutive, cap at max)
  if (mcMessageHistory[0] !== text) {
    mcMessageHistory.unshift(text)
    if (mcMessageHistory.length > MC_HISTORY_MAX) mcMessageHistory.length = MC_HISTORY_MAX
  }
  mcHistoryIndex = -1

  const replyParentId = replyState?.msgId || null
  clearReplyState()

  // Clear input immediately
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
  hideInputBar()

  // --- Kick send path (single, dual, or triple including YT) ---
  if (sendToKick) {
    const slug = kickSlug || targetChannel
    const kickPromise = sendKickMessage(slug, restText)
    const twitchPromise = sendToTwitch
      ? getTwitchAuthTokenAsync().then(({ token: tok, username: twitchNick }) =>
          sendIrcMessage(twitchName, twitchText, tok, replyParentId, twitchNick),
        )
      : Promise.resolve(null)

    // Best-effort YouTube — fire alongside Kick/Twitch so a triple-link
    // channel (twitch+kick+youtube) actually mirrors to all three.
    if (sendToYoutube) {
      sendYoutubeMessage(restText)
        .then((result) => {
          if (result !== true && result !== 'no_youtube_tab') {
            showToast('youtube send failed', 'error')
          }
        })
        .catch(() => showToast('youtube send failed', 'error'))
    }

    Promise.all([kickPromise, twitchPromise])
      .then(([kickResult, twitchResult]) => {
        const kickOk = kickResult === true
        const twitchOk = twitchResult === true || twitchResult === null
        // 'queued' = IRC was offline, message stuffed in send-queue for next
        // reconnect (could be never). Treat as a visible yellow cue, not silent
        // success — without this the input clears and the user thinks the
        // message went through.
        const twitchQueued = twitchResult === 'queued'
        if (twitchQueued && !kickOk) {
          // Most common: not logged into Twitch IRC (no auth-token cookie) AND
          // not on Kick. Persistent notif (markPendingFailed) replaces the
          // 2.5s placeholder flash users physically couldn't read in time.
          input.style.borderColor = '#f44'
          setTimeout(() => {
            input.style.borderColor = ''
            updateInputPlaceholder()
          }, 1500)
          markPendingFailed(_synthId, 'auth_failed')
          try {
            HsNotifs.emit('twitch-auth-required', { text: t('mc_input_auth_failed') || 'log into twitch.tv to chat' })
          } catch (_) {}
          return
        }

        if (kickOk || twitchOk) {
          // Dual-send partial success: at least one platform delivered. Drain
          // the failed platform from the pending tracker's awaiting set so the
          // no_echo toast doesn't fire 20s later for the side that locally
          // failed (no echo can ever arrive — the send never made it out).
          // Silent: no partial-failure toast — the user got the message into
          // the channel they're viewing, that's what matters for the dominant
          // use-case (one platform open at a time, kick/yt mirror as bonus).
          if (isDualSend && !twitchOk) {
            try {
              confirmPending(_synthId, 'twitch')
            } catch (_) {}
          }
          if (isDualSend && !kickOk) {
            try {
              confirmPending(_synthId, 'kick')
            } catch (_) {}
          }
        } else {
          // Both failed (or single Kick failed). Surface via persistent notif —
          // input.placeholder flash was too fast to read. Reason carries the
          // dominant platform's error so the retry notif tells the user what
          // actually went wrong (auth/connect/queue/kick-login).
          input.style.borderColor = '#f44'
          setTimeout(() => {
            input.style.borderColor = ''
            updateInputPlaceholder()
          }, 1500)
          let reason
          if (sendToTwitch && twitchResult && twitchResult !== true && twitchResult !== null) {
            reason = twitchResult
          } else {
            reason = kickResult || 'send_failed'
          }
          markPendingFailed(_synthId, reason)
          if (reason === 'auth_failed' || reason === 'no_user') {
            try {
              HsNotifs.emit('twitch-auth-required', { text: t('mc_input_auth_failed') || 'log into twitch.tv to chat' })
            } catch (_) {}
          }
        }
      })
      .catch((err) => {
        // A leg rejected (context invalidation, throw) rather than returning an
        // error string — without this the pending '•' hangs forever.
        log('dual-send rejected: ' + ((err && err.message) || err))
        input.style.borderColor = '#f44'
        setTimeout(() => {
          input.style.borderColor = ''
          updateInputPlaceholder()
        }, 1500)
        markPendingFailed(_synthId, 'send_failed')
      })
    return
  }

  // --- YouTube-only send path (no Twitch, no Kick) ---
  if (sendToYoutube && !sendToKick && !sendToTwitch) {
    sendYoutubeMessage(restText)
      .then((result) => {
        if (result === true) {
          // YT echoes don't loop back through our IRC handlers, so the timer
          // would always fire "no_echo" for pure-YT sends. Confirm here, with
          // explicit 'yt' platform so the per-platform awaiting set drains.
          confirmPending(_synthId, 'yt')
        } else {
          const reason = result === 'no_youtube_tab' ? 'no_youtube_tab' : 'send_failed'
          markPendingFailed(_synthId, reason)
        }
      })
      .catch((err) => {
        log('yt-only send rejected: ' + ((err && err.message) || err))
        markPendingFailed(_synthId, 'send_failed')
      })
    return
  }
  // Twitch + YouTube (and no Kick) — fire YouTube as best-effort alongside Twitch send below
  if (sendToYoutube && sendToTwitch && !sendToKick) {
    sendYoutubeMessage(restText)
      .then((result) => {
        if (result !== true && result !== 'no_youtube_tab') {
          showToast('youtube send failed', 'error')
        }
      })
      .catch(() => showToast('youtube send failed', 'error'))
    // fall through to Twitch path
  }

  // --- Twitch-only send path (existing behavior) ---
  const { token, username: twitchNick } = await getTwitchAuthTokenAsync()
  if (!token) {
    markPendingFailed(_synthId, 'auth_failed')
    try {
      HsNotifs.emit('twitch-auth-required', { text: t('mc_input_not_logged_in') || 'log into twitch.tv to chat' })
    } catch (_) {}
    return
  }

  const wsState = authState.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][authState.ws.readyState] : 'null'
  log(`IRC SEND → #${targetChannel} ws=${wsState} ready=${authState.ready} queue=${authState.sendQueue.length}`)
  sendIrcMessage(targetChannel, twitchText, token, replyParentId, twitchNick)
    .then((result) => {
      if (result === true) {
        if (wsState !== 'OPEN') {
          input.style.borderColor = '#ff0'
          setTimeout(() => {
            input.style.borderColor = ''
          }, 1500)
        }
        // success-from-socket only; echo confirmation handled by pending tracker
      } else {
        input.style.borderColor = '#f44'
        setTimeout(() => {
          input.style.borderColor = ''
          updateInputPlaceholder()
        }, 1500)
        markPendingFailed(_synthId, result || 'send_failed')
        if (result === 'auth_failed' || result === 'no_user') {
          try {
            HsNotifs.emit('twitch-auth-required', { text: t('mc_input_auth_failed') || 'log into twitch.tv to chat' })
          } catch (_) {}
        }
      }
    })
    .catch((err) => {
      log('twitch send rejected: ' + ((err && err.message) || err))
      input.style.borderColor = '#f44'
      setTimeout(() => {
        input.style.borderColor = ''
        updateInputPlaceholder()
      }, 1500)
      markPendingFailed(_synthId, 'send_failed')
    })
}

async function sendYoutubeMessage(text) {
  try {
    const resp = await safeSendMessage({ type: 'youtube_send_message', text })
    if (resp?.ok) return true
    return resp?.error || 'send_failed'
  } catch (e) {
    log('YouTube send error:', e.message)
    return 'send_failed'
  }
}

// ============================================
// MEDIA UPLOAD — paste image, drag-drop file
// ============================================

const MC_UPLOAD_MAX_IMG = 5 * 1024 * 1024 // 5MB
const MC_UPLOAD_MAX_VID = 50 * 1024 * 1024 // 50MB
let _mcUploading = false

function showUploadStatus(msg, isError) {
  const bar = document.getElementById('hs-mc-upload-status')
  if (msg) {
    if (bar) {
      bar.textContent = msg
      bar.style.color = isError ? '#ff4444' : '#ff8700'
      bar.style.display = 'block'
      return
    }
    const inputbar = document.getElementById('hs-mc-inputbar')
    if (!inputbar) return
    const el = document.createElement('div')
    el.id = 'hs-mc-upload-status'
    el.style.cssText = 'padding:2px 8px;font-size:13px;color:#ff8700;background:#000;border-top:1px solid #808080;'
    el.textContent = msg
    inputbar.insertBefore(el, inputbar.firstChild)
  } else if (bar) {
    bar.remove()
  }
}

async function uploadMediaFile(file) {
  if (_mcUploading) {
    showUploadStatus('upload in progress...', true)
    return null
  }
  if (!file) return null
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) {
    showUploadStatus('only images/videos allowed', true)
    setTimeout(() => showUploadStatus(null), 2500)
    return null
  }
  const maxSize = isImage ? MC_UPLOAD_MAX_IMG : MC_UPLOAD_MAX_VID
  if (file.size > maxSize) {
    showUploadStatus(`file too large (max ${maxSize / 1048576}MB)`, true)
    setTimeout(() => showUploadStatus(null), 2500)
    return null
  }
  _mcUploading = true
  showUploadStatus('uploading 0%...')
  try {
    const formData = new FormData()
    formData.append('file', file)
    const url = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          showUploadStatus(`uploading ${pct}%...`)
        }
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.success && data.url) resolve(data.url)
            else reject(new Error(data.error || 'upload failed'))
          } catch {
            reject(new Error('bad response'))
          }
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.error || `http ${xhr.status}`))
          } catch {
            reject(new Error(`http ${xhr.status}`))
          }
        }
      })
      xhr.addEventListener('error', () => reject(new Error('network error')))
      xhr.addEventListener('abort', () => reject(new Error('cancelled')))
      xhr.open('POST', `${CONFIG.API_URL}/api/upload`)
      xhr.withCredentials = true
      xhr.send(formData)
    })
    showUploadStatus('upload done')
    setTimeout(() => showUploadStatus(null), 1500)
    return url
  } catch (e) {
    showUploadStatus(`upload failed: ${e.message}`, true)
    setTimeout(() => showUploadStatus(null), 3500)
    return null
  } finally {
    _mcUploading = false
  }
}

async function handleMediaUpload(file) {
  const url = await uploadMediaFile(file)
  if (!url) return
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  showInputBar()
  input.focus()
  if (input.isContentEditable) {
    if (!document.execCommand('insertText', false, url + ' ')) {
      input.textContent = (input.textContent || '') + url + ' '
    }
  } else {
    input.value = (input.value || '') + url + ' '
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

let _mcDropHandlersInstalled = false
function setupMediaDropHandlers() {
  if (_mcDropHandlersInstalled) return
  _mcDropHandlersInstalled = true
  const overlay = document.getElementById('hs-mc-overlay')
  if (!overlay) return

  let dragCounter = 0
  const showDropZone = () => {
    let dz = document.getElementById('hs-mc-drop-zone')
    if (!dz) {
      dz = document.createElement('div')
      dz.id = 'hs-mc-drop-zone'
      dz.style.cssText =
        'position:absolute;inset:0;background:rgba(255,135,0,0.15);border:2px dashed #ff8700;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;z-index:99998;pointer-events:none;'
      dz.textContent = 'drop image/video to upload'
      overlay.appendChild(dz)
    }
  }
  const hideDropZone = () => {
    document.getElementById('hs-mc-drop-zone')?.remove()
    dragCounter = 0
  }

  overlay.addEventListener(
    'dragenter',
    (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
      dragCounter++
      showDropZone()
    },
    { signal: mcSignal },
  )
  overlay.addEventListener(
    'dragover',
    (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    { signal: mcSignal },
  )
  overlay.addEventListener(
    'dragleave',
    (e) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      dragCounter--
      if (dragCounter <= 0) hideDropZone()
    },
    { signal: mcSignal },
  )
  overlay.addEventListener(
    'drop',
    (e) => {
      if (!e.dataTransfer?.files?.length) return
      e.preventDefault()
      hideDropZone()
      const file = e.dataTransfer.files[0]
      handleMediaUpload(file)
    },
    { signal: mcSignal },
  )
}
