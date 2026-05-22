# changelog

## [1.5.1] — 2026-05-21

### fixed
- broken avatar images now hide via the delegated chat error handler instead of an inline `onerror` — the inline handler was silently stripped by Twitch/Kick/YouTube page CSP, leaving blank avatar boxes
- recent emotes row now records emotes inserted via tab-complete, not only picker clicks
- kick: chat-hidden collapse now reclaims video space (the side-panel rule outranked the generic hide); bare emote chips no longer break onto their own line on tab-complete
- youtube: stream no longer re-mutes after you manually unmute it

### removed
- default-mute streams (guard, observer, settings toggle) — out of scope for a chat extension and the source of the youtube re-mute loop

### internal
- search-result rows render via `textContent` instead of pre-escaped `innerHTML`
- auto-claim, resub/watchstreak share, and youtube resize timers are now lifecycle-tracked so they cancel on SPA-nav teardown

## [1.5.0] — 2026-05-21

### added
- recent emotes row at the top of the emote picker (local MRU, cap 24)
- emote/emoji overlay via name0 convention — appending `0` to an emote name or emoji stacks it zero-width onto the left; committed on Tab, not live; emoji spans marked contenteditable=false so overlay stacking survives caret moves
- `\` key toggles chat panel hide/show; edge-pill restores last edge
- statusbar — inline toast status line with collapse button (position-aware arrow); hides Twitch's native collapse button
- universal right-click menu for any user or feed post — follow, block, mute, whisper wired in order
- block/remove context menus on emotes with numbered keybinds (bottom-up); owned-emote tooltip goes green, unowned orange
- mod toolbar — hover row shows delete/timeout/ban per message; per-button settings, hotkeys, prefetched mod state; singleton with absolute positioning
- profile card: compact hero layout, lean mod toolbar integration, clip-URL copy
- twitch picker sub-tabs: events, bits, chat, links; cheer popup flow; toast dedup + repositioning
- channel-scoped callouts + custom-body resub share via GQL
- tab re-completion across emote chips; settings cheatsheet — emote colors, 0-overlay/modifier syntax, keybind reference, right-click guide
- infinite tab-cycle via 7tv search fallback when local set exhausted
- provider search in emote pickers + two-click add flow for unowned emotes
- tab-complete ranked by 7TV popularity (TOP_ALL_TIME), not alphabetical
- owned sub emotes reachable from tab completion
- cross-platform Twitch GQL wrapper + scheduler for emote actions

### changed
- tagline updated to "twitch + kick + youtube, one chat" across manifest and 34 locales; home tab renamed to feed across all locales
- welcome page reduced to minimal landing style; readme tagline updated
- emote size spec aligned to website: true /1.0 native at 1x, emoji 2x default, 1x/2x/4x widget variants
- bitmap font rendering fully landed: AA disabled, faux-bold/italic synthesis off, integer line-heights, emoji fallback, kerning + OT features, left-aligned channel tabs so text origin lands on integer X; matches heatsync.org base.css exactly
- font-size auto-switches to native (13/14px) when bitmap font is selected
- sender heatsync emote sets fetched in a single batched request, exempted from shared backoff, with credentials=omit for CORS; sets updated in place on source change rather than discarded and refetched
- emote auth: bearer-only on mutations (cookie was tripping server CSRF check)
- emote-picker stays open on context-menu clicks; blocked state visible in search results
- blocked emotes render dashed box at real emote dimensions (not a fixed square)
- blocked emote left-click: steps to unadded state first, not straight to owned; re-adding recovers real URL via emote lookup, never the broken src; re-added emotes no longer store a blank
- emote chip colors carry provider brand; YT keyboard guard rewritten
- picker hover rects: green for owned, orange for addable, dashed for blocked
- feed emotes wrapped in emote-wrapper so right-click block hides them live
- message right-click menu: copy=2, mute/unmute=1, numbered bottom-up
- resub-share broadcast: fiber onClick + stored-button + DOM-click fallbacks
- emote modifiers toggle relabeled as BTTV & FFZ (supports both)
- live tab pinned to #808080 at rest/active; white-bg hover like normal tabs
- util-btn font-weight set to 400 — bold was pushing Cozette off bitmap path
- dropped www.heatsync.org host permission (unused)

### fixed
- feed unread surface corrected from `home` to `live` (matches DB + server schema); default-mute all streams on first load
- 7TV cosmetics dropping on busy or restored channels (per-user cap now clears full ~2000-user buffer)
- broken 7TV badges on QUIC drop — retry with insert-before-src fallback instead of hiding
- badge tooltip loads real hi-res CDN variant (4x), not upscaled 18px
- panel init made resilient; badge fetch made synchronous
- cross-user heatsync emotes now render in native Twitch chat and in the multichat panel; newly-added emotes propagate on re-validation
- shared emotes show as addable (orange) with 'extension' label, not owned (green)
- tab-completed 3rd-party emotes and blocked names persist across refresh
- overlay emotes stack onto emoji in the input box
- emote hover-highlight color re-syncs on state change
- removing an emote drops it from the auto-add-on-send registry
- own-badge seeded per-channel from USERSTATE rawBadges on join
- full chat scrollback shown on reload — stale-guard narrowed to stream events only
- deep-history sources fired on restored channels, not only fresh joins
- no chat flash on block/unblock
- chat not flashing on block/unblock cycles
- Twitch dashboard reflows correctly under no-channel page squeeze
- live-tab hover CSS ported into src so rebuild no longer reverts it
- picker hover rect tracks emote bounds, not img padding-box
- feed post-link fixes + reply-thread hover stack
- mod toolbar: singleton enforcement + absolute positioning + hotkey wiring

### perf
- live chat DOM capped at 500 rendered rows, decoupled from 1500-row data buffer; measured −67% nodes, −134 MB
- memory + 100k-scale audit pass: allocations and lookup paths audited across cosmetics, emote render, and observer surfaces

## [1.4.1] — 2026-05-15

### fixed
- long input text wraps instead of overflowing into the tab area

## [1.4.0] — 2026-05-14

### added
- popout button in multichat tab bar — opens host platform's native chat in a clean window (Twitch /popout, Kick /chatroom, YouTube /live_chat) right of the settings cog
- unified UndoManager for multichat input — Ctrl+Z / Ctrl+Shift+Z across chip insertions, modifier chains, vi-mode edits with one stack
- server-controlled kill-switch + version-floor — ops can disable misbehaving features or force-update without a store push
- thread-walk replies — multi-hop conversation traversal in the multichat overlay
- tier-drop emote removal + multi-platform channel banners
- moderation commands wired through GQL: `/ban`, `/unban`, `/timeout`, `/delete` with dismissible toasts
- chat input tips group in settings (overlay-0, FFZ modifiers, Tab auto-space)

### changed
- centralized inline Twitch/Kick selectors into a single SELECTORS map (3 callsites → 1)
- multichat hides discover tab; tighter input-tip surface
- whitespace handling: real keyboard space after Tab; auto-space stays nbsp at chip boundaries to survive trailing-collapse
- smart unwrap preserves chips around the touching boundary; backspace deletes chip + auto-space atomically

### perf
- multichat scroll on Twitch — main-thread stalls cut by hoisting hot selector lookups
- dropped util-btn min-width 18→14px in vertical multichat mode

### fixed
- 3 untracked memory leaks now flow through the cleanup system
- robotty CLEARCHAT cross-references on backfill + SW-wake gap-fill alignment with reply-stack overlay
- error reporter noise: synthetic stacks + filtered transient errors; storage warn dedup; chat-injector non-channel skip; fetchUserInfo JSON safety
- maroon mention rows force white text + black channel-tag (was unreadable)
- stack-internal overlay imgs no longer unwrap on chip edits
- twitch right-column slot zeroed on no-channel pages
- popout button visible on live tab + whitelisted in updateTabBar selector
- live-imagify nbsp fallbacks → regular space for parity with website

## [1.3.9] — 2026-05-12

### fixed
- content.js failed to parse on load — a stray backtick inside a CSS comment terminated the `style.textContent` template literal, throwing SyntaxError. effect: emote replacement and cosmetics silently dead since 1.3.7. now caught by `node --check` over every built bundle during `bun run build.js`.

### changed
- build pipeline: post-build syntax check on every js output (chrome + firefox)
- build pipeline: `--source` flag (auto-enabled with `--package`) emits `heatsync-source-X.Y.Z.zip` for AMO review
- release workflow: `.github/workflows/release.yml` builds + packages + attaches versioned zips, source zip, and versionless `heatsync-chrome.zip` / `heatsync-firefox.xpi` aliases on every `v*` tag push

## [1.3.8] — 2026-05-12

### note
- shipped to chrome web store but never published — superseded by 1.3.9 before review cleared. firefox upload was rejected by amo validator (same parse error caught later).

## [1.3.7] — 2026-05-11

### added
- service-worker-owned twitch irc with cross-device unread sync and ui_state insta-sync
- wysiwyg modifier system: `w!`, `h!`, `ffzX`, `c!#hex` chains over emote stacks
- kick persistent overlay survives spa nav; profile card v2 with quick actions
- emote picker context-menu rename; stack-click adds unowned emotes; paste drops blocked
- yt user pool merges into @-completion; recency-weighted ordering
- keyword highlights, per-user colors, mod toggle; resub-share callout via HsNotifs

### changed
- multi-variant emote fallback; smooth block-state cross-fade across panel + picker
- whisper-send routes through gqlMutation with directly minted Client-Integrity
- server-side feature sync (mutes, settings, mention rules, eventsub) wired into ext

### perf
- emote picker decoupled, lazy-loaded, scroll-locked; 7tv assets static
- per-tab dom cache → flash-free tab switching
- three chat observers folded into one unified observer
- hot intervals gated; wide layout-observer dropped
- css animations paused on host hidden; selectors scoped
- orange c-handle uses ghost overlay during drag

### fixed
- twitch miniplayer-restore: chat off-screen + missing resize bar
- autocompleted emoji wrapped in span — stops caret snap on U+FE0F
- ghost-render for removed emotes via hs-state-stale
- reply-ctx stays black on olive reply-stack — no chat-jump
- channel badges retry on failure; fake "follows you 5mo" on streamers removed
- popout fills window; vertical-tab util row stretches; twitch quick-links restored

## [1.3.5] — 2026-05-08

### fixed
- feed YT embed: youtube.com self-embed Error 153 → thumbnail-card fallback
- feed Kick clip embed: X-Frame-Options:SAMEORIGIN blocked iframe → server-resolved rich card
- feed Reddit embed: VPS IP-block fallback uses slug-derived title/author when scraper returns nothing
- feed video card: m3u8 (kick clip) now renders as thumbnail-link (no hls.js bundled)

## [1.3.4] — 2026-05-08

### changed
- store-listing copy aligned to 5000-slot limit (was incorrectly "unlimited")
- privacy URL canonicalized to `heatsync.org/privacy` (no redirect)
- removed dead `scripting` permission row from store-listing permissions table

### perf
- multichat picker right-click block/unblock fixes
- 30k-user scale gating + jitter for backend stability
- WebSocket emote-broadcast and heat push at scale via heatsync cosmetics proxy

### fixed
- multichat picker pointer cursor on emote wrap
- right-click on blocked emote now unblocks
- right-click on twitch sub emote blocks instead of erroring
- vi-mode treats overlay-emote stacks as single atoms

## [1.3.1] — 2026-04-29

### changed
- multichat tabbar flattened — channel tabs, +, T/K/YT filters, C/T/F-/F+/⚙ all share a single wrapping row in horizontal mode; column-stack with scrollable channel area in vertical
- removed H util-toggle button (no longer needed — buttons just wrap inline)

### perf
- multichat near-instant cold-load boot

## [1.2.1] — 2026-04-01

### added
- github actions CI pipeline (`bun test`, build verification, version sync check)
- test suite: build output validation, manifest field checks, CSP presence, content script file existence
- unit tests for `escapeHtml` and fuzzy match scorer
- `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`

### fixed
- version sync now enforced in CI (package.json, chrome manifest, firefox manifest must match)

---

_earlier history not recorded — see git log_
