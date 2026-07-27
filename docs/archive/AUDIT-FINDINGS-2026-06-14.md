# reliability / perf / correctness audit — 2026-06-14

Multi-lens bug hunt (memory leaks, silent failures, correctness/security, perf).
Every finding below was re-verified against real code (the hunt over-reported;
false positives are listed at the bottom so they don't get re-flagged).

## fixed this pass

| area | file | commit |
|------|------|--------|
| send paths had no `.catch` → pending '•' stuck forever | input.js (5 sites) | 97c7345 |
| whisper `storage.local.set` async reject uncaught → silent DM loss | whispers.js:119 | 97c7345 |
| 7tv id maps unbounded (8h leak) | background.js twitchToSeventvId/seventvToTwitchId/_stvSetFetchAt | ce98dd0 |
| banner url css-injection via `url("…")` | profile-card.js, tooltips.js | 71b1c7b |
| **channel-emote twitch/kick collision** (CRITICAL) | background.js + content.js + emotes.js | cbdaeb2 |
| **kick 7tv emote-drift poll used slug not numeric id** (404 every cycle) | background.js poll7TVEmoteSet | 6251852 |

## verified NON-ACTIONABLE on review (2026-06-15) — do NOT re-chase

The perf "hot-path" findings and the logout-stale finding were re-read against
real code and are false positives / already-optimal — fixing them would add risk
or bloat for no/negative gain:
- content.js `querySelector('img')` per fragment — NOT always-null on twitch (native twitch emotes ARE inline imgs); it's the load-bearing mixed-leaf discriminator. Branching on platform would route img-bearing twitch msgs through the text-clobber path.
- content.js `.hs-username-colored` per-fragment probe — scoped to a tiny span (cheap); a dataset flag desyncs on React re-wrap (double-coloring). Marginal gain, real risk.
- content.js `getBoundingClientRect` in the coloring rAF — already batched reads-then-writes = ONE layout flush per frame, not per message. Correct as-is.
- background.js logout warm-cache `if (stored.x?.length)` — runs at SW init with fresh-empty in-memory (empty stays empty = correct). The guard is protective against clobbering fresh memory with a transient `[]`. Not a bug.

## verified real — needs a tested follow-up (do NOT rush)

- **✅ FIXED 2026-06-15 (cbdaeb2)** — channel-emote platform collision. Keyed `platform/channel` via `chKey()` across background.js (4 maps + storage + split broadcasts) + content.js (platform filter + composite storage read) + emotes.js (strip prefix). Native overlay + background fully per-platform. **Residual ✅ also fixed (1d36352):** the multichat PANEL now merges both platforms' channel emotes under the bare key via `_buildChannelEmoteCache` platform-tagging (replace-only-this-platform, keep the other) instead of last-wins. Chose merge-with-tag over strict per-platform deliberately — strict would force composite keys through the picker/autocomplete/render consumers (hot path, every user) to fix a vanishingly-rare edge; merge is zero-risk to the common path and never loses an emote. Collision fully closed.
- **CRITICAL — channel-emote platform collision** (deep-dived 2026-06-14).
  `fetchChannelOwnerEmotes(channelName, channelId, platform)` (background.js:2254) keys `channelEmotesMap[channelName]` by **bare** name despite having `platform`. Same username on twitch+kick (simulcaster, both tabs open) → second platform overwrites the first's emotes. Real, but rare + cosmetic (wrong emotes render; no crash/data-loss).
  **Why it's not a mechanical re-key** — bare-keying is load-bearing across THREE consumers, each with its own small LRU that assumes few channels:
  1. background.js `channelEmotesMap` + `seventvEmoteSetIds` (both bare; ~25 sites: 2256/2272/2349/2354-2357/2385-2397/2904/2922/2953/2992/3071-3102/3135/5806/6640/6646) — **and these persist to storage**, so the in-memory key must survive SW-restart restore (storage can't stay bare or restore loses the platform).
  2. content.js native overlay — storage cold-read 3229 (bare) + broadcast consumer 3564 (bare `channelOwner`).
  3. multichat panel `emotes.js channelEmoteCaches` (1455, bare; LRU ~2-3 channels at 1795/1953) — lookups at 1698/2151/2197/2214 by bare channel.
  **Open DESIGN question (must resolve first):** in multichat a "channel" is one config entry spanning `{twitch,kick,youtube}`. For a same-name simulcast, should the panel MERGE both platforms' channel emotes or keep them per-platform-pane? The answer decides whether the fix is platform-keyed everywhere or just in the native-overlay path.
  **Safe fix path (one focused, tested session):** platform-key `channelEmotesMap`+`seventvEmoteSetIds`+storage in background.js via a `chKey(platform,ch)` helper (grep-auditable: no bare `channelEmotesMap[` may remain) → update the 2 storage readers (content.js:3229, emotes.js:1891 — both editable, NOT in-flight) → platform-TARGET the `channel_emotes_update` broadcasts so live consumers (main.js:11368, content.js:3564) stay unchanged. CAVEAT: broadcast-targeting interacts with heatsync.org tabs + multichat panels that legitimately show BOTH platforms — verify they aren't starved. Test: single-platform twitch + single-platform kick must still render (regression), then a real same-name simulcaster on both (the actual bug).
  Rushing this at 2am risks breaking channel emotes for EVERYONE (broad blast radius) to fix a rare cosmetic edge — bad trade. Deferred on purpose.
- **HIGH — logout leaves stale inventory.** background.js:~6660 `if (stored.x?.length) globalEmotes = …` skips assignment when storage is `[]` (logged out), so a SW restart keeps the prior session's in-memory emotes/blocks until the 60s fetch. Fix: drop the `?.length` guard, always assign `?? []`. Trace init order first (don't clobber a fresh fetch).
- **HIGH — poll7TVEmoteSet passes kick username, not numeric id.** background.js:~3076 — kick emote-drift polls 404, so mid-stream add/remove never updates. Fix: read `kickUsernameToIdCache` (populated by the initial fetch) before building the poll url. Verify the cache name/contents first.
- **HIGH — cold-SW null initPromise window.** background.js: `let initPromise = null` (649), assigned at ~6885; a message arriving in the gap runs `handleMessage` against empty maps. Fix: assign `initPromise = initialize()` at declaration.

## in-flight files (main.js / social.js are mid-edit — owner merges these)

- main.js:~10320 `…s[STORAGE_KEY]` spread throws on null → swallowed → all channel tabs vanish. Fix: `…(s[STORAGE_KEY] ?? {})`.
- main.js:~11382, ~12412, ~13126 `loadEmotes()/loadStreamEvents()/get_follow_history` `.then()` with no `.catch` → stale emotes / missing stream events / wrong follow colors on reject.
- main.js:~13156 (+13714/13762/13774/11842/11868) `chrome.runtime.sendMessage` throws **synchronously** after context invalidation — `.catch` alone doesn't cover it; wrap in try/catch (pattern already at 13193).
- main.js:718 vs 12548 mentionsBuffer trim asymmetry (live 550 vs persist 200) → 350 mentions lost on reload. Unify the cap.
- social.js:1340 feed body trusts server-escaped content with no client backstop — add a defensive `escapeHtml` + targeted `>>id` unescape.

## performance — hot-path follow-up (measure first; some are marginal)

- content.js:~9303 `getBoundingClientRect()` in the rAF coloring loop forces a layout flush per new message — replace the visibility gate with IntersectionObserver or drop it.
- content.js per-message `querySelector` churn: 5406 `querySelector('img')` always-null on twitch (branch on isKick), 4862 `.hs-username-colored` probe (use a dataset flag), 9128 `getElementById` per mutation batch (cache flag), 8541 full-container cosmetics scan (index by userId).
- irc.js:392/432 `buf.getAll()` O(n) full-buffer scan per mod NOTICE/ban — add a `Map<user, msgs>` index.
- background.js `updateEmoteUrlMap()` full rebuild per 7tv EventAPI frame; badge maps serialized 3× per fetch/broadcast/request — serialize once, reuse.
- input.js:2353 two `querySelectorAll` over the contenteditable per keystroke — set `contenteditable=false` at chip insert; guard the scans.

## false positives — ruled out (do not re-flag)

- content.js:4929 lockStack MutationObserver — **already** disconnected in unlockStack (4944), bounded to 0-2 stacks. Not a leak.
- content.js:4585 heat `parseInt(hex)`×3 per message — microseconds, dwarfed by the `drop-shadow` GPU blur on the same line. Not worth touching.
- input.js:205/255 console.log — both `MC_DEBUG`-guarded, not shipping.
- seventvPersonalSets — already LRU-capped at 2000 (background.js:2856).
