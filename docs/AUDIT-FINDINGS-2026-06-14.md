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

## verified real — needs a tested follow-up (do NOT rush)

- **CRITICAL — channelEmotesMap platform collision.** `fetchChannelOwnerEmotes(channelName, channelId, platform)` (background.js:2254) keys `channelEmotesMap[channelName]` by **bare** name despite having `platform`. Same username on twitch+kick (simulcaster, both tabs open) → second platform overwrites the first's emotes. Fix: key `${platform}/${channelName}` across all ~15 sites (2256/2272/2349/2354-2357/2396/2922/2953/2992/3112/3135/5806/6630) **and** the broadcast `channelOwner` payload + the content-script matcher. Cross-cutting → needs real twitch+kick simulcast testing.
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
