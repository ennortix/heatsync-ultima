# strictly-better roadmap

what to adopt from the rivals (chatterino/bttv/ffz/7tv) + our own perf/security debt, to make heatsync strictly-better in every column. derived 2026-06-28 from the competitor recon ([[COMPETITOR-WATCH.md]]) + 6 verification agents against our own code. pairs with `docs/COMPETITOR-WATCH.md` (intel) — this is the action list.

each item is verified against our actual code (file:line). "skip" items = we already match or beat them; recorded so we don't re-litigate.

## ✅ shipped 2026-06-28 (build + 552 tests green; Chrome-verify pending on the visible ones)

- **#1 AVIF animated emotes** — 7 sites swapped `1x.webp`→`1x.avif` (6 in chrome/background.js + emotes.js:202); avif→webp onerror fallback wired into the existing emote-img error handler (main.js ~3663) so a rare missing-avif emote can't show a broken icon. measured **~10× smaller** on animated emotes (188KB→18KB). our manifest minimums (Chrome 116, FF 128) all decode animated avif, so no runtime feature-detect needed.
- **#2 automod regex ReDoS guard** — no-dep nested-quantifier heuristic in automod.js; dangerous patterns degrade to literal match, safe ones stay regex.
- **#5 checkOffline observer throttle** — rAF-coalesced to one check/frame.
- **#7 isMultiPlatformTab** — O(N) `.find` → O(1) `getChannelLookup()`.
- **#8 fairMerge** — skip `.slice()` on under-cap buffers.

remaining open: #3 whispers→BG SW, #4 active-tab ordering, #6 reprocess chunking, #9 native-badge in-place (all need multi-tab / cold-switch Chrome verify before shipping). #6 + #9 touch the render core — supervised verify per [[heatsync_channel_switch_jank_two_phase_render]].

## adopt — real wins

| # | win | source | effort | impact | where |
|---|---|---|---|---|---|
| 1 | **AVIF animated emotes** — feature-detect at boot, swap `1x.webp`→`1x.avif` for 7TV | 7tv | S | **HIGH** — 30-50% smaller animated payload (RAM+bandwidth) | ~7 sites: `background.js:2343,2902,3359,3435,3626,7467`, `emotes.js:202` |
| 2 | **automod regex ReDoS guard** — nested-quantifier heuristic before compile, fall to existing escape fallback. NO dep (keep zero-dep) | bttv+ffz | S | security — user can't freeze own tab; blocks malicious shared automod | `automod.js:21-22` |
| 3 | **EventSub whispers → background SW** — collapse N per-tab whisper subscriptions to 1; frees Twitch subscription quota | 7tv arch | S | efficiency — N→1 sessions across tabs | `eventsub-whispers.js:265`, boot `main.js:14721` |
| 4 | **active-tab load ordering** — sort `bgChannels`/`joinedExtraChannels` by `ui_settings.activeTab` match so the visible tab loads first | chatterino | S | low (slow connections only) | overlay boot `main.js:14781` |

## our own perf debt (own the perf column outright)

from the runtime perf audit — not competitor-derived, but required to be best-in-class.

| # | fix | effort | impact | where |
|---|---|---|---|---|
| 5 | **throttle `checkOffline` MutationObserver** — fires unthrottled on every Twitch React mutation; rAF-debounce | XS | **HIGH** — continuous CPU burn (fan-spin on passive-cooled) | `main.js:14396` |
| 6 | **chunk `reprocessEmoteTextInPlace`** — 500-row synchronous innerHTML loop = cold-load freeze; 50 rows/frame via rAF | S | **HIGH** — kills the ~5s-post-load freeze on weak hw | `main.js:9110` |
| 7 | `isMultiPlatformTab` O(N)→O(1) — use existing `getChannelLookup()` map | XS | low (GC/cpu) | `main.js:9946` |
| 8 | `fairMerge` skip `.slice()` on under-cap buffers | XS | negligible | `main.js:10207` |
| 9 | **native-badge in-place render** — `twitch-api.js` `fetchGlobalBadges`/`fetchChannelBadges` still `bumpRenderEpoch`→full rebuild on cold channel-switch (the last render-jank remnant; main.js paths already fixed) | M | medium — image-reload flash on cold switch | `twitch-api.js:2487,3569` ([[heatsync_channel_switch_jank_two_phase_render]]) |

## defer — real, but large

| win | source | effort | why defer |
|---|---|---|---|
| **closed shadow-DOM overlay isolation** — eliminates the entire CSS-bleed / React-strips-`!important` bug class (ghost-overlay + inline-!important hacks exist today because we mount in light DOM) | bttv | L | dedicated architecture sprint; global-class CSS doesn't port trivially; current approach works. right long-term direction. |
| **split the god-files** — main.js ~16k LOC (+ chrome/background.js, twitch-api.js) are what the competitor recon flags as our one perf/quality negative. the perf audit confirmed it's a **readability** cost, not a runtime one (no hot-path penalty from size alone). split into focused modules so size stops being a fair criticism. | self / recon | L | render-core is hot + intricate (memory repeatedly warns against rushing it); belongs in the architecture-refactor track, not a yolo pass. plan in `docs/ARCHITECTURE-REFACTOR-2026-06.md` ([[project_architecture_refactor_roadmap]]) — tier-1 shipped, this is tier-2+. do supervised, module-by-module, each behind build+test+Chrome verify. |

## open security gaps (from the security best-in-class audit)

| gap | effort | note |
|---|---|---|
| host-perms → `optional_host_permissions` (11 of 17 movable: bttv/ffz/7tv emote APIs, log providers, decapi, chatterino) requested on-demand | M | shrinks install-time prompt + attack surface; 7tv already does this for yt/kick |
| `.github/SECURITY.md` (copy of root) + `security@heatsync.org` alias + optional GPG key | XS | GitHub only shows the security tab for `.github/SECURITY.md`; 7tv has dedicated alias |
| release SHA-256 checksums in `release.yml` | XS | self-verify; chatterino GPG-signs |
| Trusted-Types policy chokepoint — `require-trusted-types-for` is declared but content-script innerHTML isn't governed by it; add a `heatsync#html` pass-through policy + `hsHtml()` chokepoint so raw innerHTML stands out | S | defense-in-depth + regression guard (all 66 sites already escapeHtml — no active vuln) |

## skip — already match or beat them (do not re-propose)

- **SharedWorker shared connection** (7tv) — our MV3 background SW already shares 4 of 6 sockets across all tabs; strictly-better than 7tv for reads. (the 2 per-tab sockets: auth-IRC send is deliberately per-tab for send→ack toasts; whispers = win #3.)
- **cross-channel emote dedup** (chatterino shared_ptr) — browser image cache dedups bitmaps by URL; our per-channel metadata is ~6 fields, negligible. per-channel maps are correct (same name = different emote per channel).
- **persistent emote cache** (7tv IndexedDB/Dexie) — we already persist via `chrome.storage.local` (`global_emotes`/`channel_emotes_map`/`emote_inventory`), read at every boot, 30-min TTL. functionally identical.
- **PKCE OAuth** (bttv) — we run no OAuth authorization-code flow; first-party cookie session + piggyback existing twitch/kick cookies. n/a.
- **plugin/addon system** (chatterino lua, ffz addons) — deliberately not built; it's their biggest attack surface (lua sandbox escaped 2×; ffz addons unsandboxed). settled.
- **telemetry/sentry** (bttv/ffz) — we ship zero third-party telemetry by design. it's our wedge, not a gap.

## suggested execution order

cheap+safe first, headline next, big refactors last:
1. batch the XS/S safe wins: #5 checkOffline throttle, #7 O(1) lookup, #8 slice guard, #2 automod ReDoS — pure logic, test-coverable.
2. #6 reprocess chunking + #1 AVIF — need Chrome verify (render correctness, AVIF decode + non-7TV fallback).
3. #3 whispers→BG SW, #9 native-badge in-place — need cold-channel-switch + multi-tab Chrome verify.
4. security gaps (host-perms optional-ization is the headline; rest are XS).
5. defer: shadow-DOM isolation sprint.
