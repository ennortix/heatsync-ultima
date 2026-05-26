# changelog

## [1.5.3] — 2026-05-26

### changed
- welcome page rebuilt as a 3-step visual onboarding focused on the personal-emote-set wedge (replaces the prior 4-line landing). uses Cozette + i18n step keys; mobile-collapsing grid.
- copy reframe across acquisition surfaces (welcome page, README hero, store listing, reviewer notes): leads with "5000-slot personal emote set, no streamer approval, no subscription" and explicitly surfaces the left-click-to-add mechanic that was already in the code but never documented in user-facing copy. multichat reframed as supporting feature.
- welcome page wedge-critical strings (tagline, step 2 desc, step 3 title + desc) are hardcoded inline rather than pulled from `messages.json` — the new wedge framing renders for all locales without waiting on a 34-locale `messages.json` translation pass. `messages.json` keeps its prior strings for future i18n alignment.

### fixed
- **half emotes missing after ext reload** — `onInstalled` was wiping `channel_emotes_map` on every reload (incl. `reason='update'`). channel emotes (BTTV + FFZ + 7TV channel sets, heatsync per-channel sets) only refilled when the user clicked each multichat tab. cache now only nukes on first install; the existing 30-min TTL + per-fetch failure backdating already cover staleness.
- **twitch sends silently dropped with no feedback** — auth IRC was discarding `NOTICE` lines (msg-id=msg_followersonly/msg_subsonly/msg_slowmode/msg_duplicate/msg_banned/msg_rejected/etc). twitch sends these to the auth socket only — the bg anonymous socket never sees them — so the input would clear with no echo and no toast. now parses msg-id and shows a specific toast ("followers-only mode — follow the channel to chat", etc).
- **own messages not appearing until refresh** — `bg_irc_join` was using raw `chrome.runtime.sendMessage` (no cold-SW-wake retry). on SW eviction the join request silently dropped, BG never joined the channel, the auth socket's PRIVMSG echo never reached the multichat panel. now routes through `safeSendMessage` which retries on cold wake.
- **permanent silent send-drop after slow first join** — `joinChannel()` faked success on its 500ms timeout (`authState.joined.add(channel)`) without an actual JOIN ack. subsequent PRIVMSGs went to a never-joined channel and were dropped silently for the full WS lifetime. timeout now 2000ms (matches actual twitch JOIN ack distribution); on timeout we leave `joined` empty so the caller retries / queues / toasts.
- **cross-device seen-state didn't sync** — the `seen_update` WS forward (BG → tab) was handled inside `listenForSocialEvents()`, which only ran AFTER social/feed init. clears made on the website didn't reach the ext until the next event landed. registration moved to `seen-state.js` module load — fires before social init.
- **feed red dot blind on boot after sleep** — `latestAt.live` was bumped only on WS `new-message` events. opening the ext after hours of sleep with 12 unread feed posts produced no red dot until the 13th event arrived. now seeded from the newest post in the feed GET response when the feed loads.
- **anonymous-user seen-state erased on reload** — `bumpSeen` skips POST for anonymous users (no server) and `_saveSeenLocal` only persisted `latestAt`, so anon users' clears reverted to `seenAt=0` on every reload — red dot reappeared even after they'd cleared. local persist now includes `seenAt` too.
- **YouTube sends reported success even when rejected** — `youtube_send_relay` was dispatched without `awaitConfirm:true`, so the BG returned `ok:true` as soon as the click animation ran, even if YT rate-limited / slow-moded / disabled the button. now waits for the 2.5s observer race in youtube-content.js to actually confirm the message landed.
- **whisper dedup collisions on long messages** — `_whisperDedupKey` hashed only the first 64 chars of text for whispers without a Twitch id (Kick/heatsync DMs). long whispers sharing an intro collided, one silently dropped, no unread badge. now hashes the full text via djb2.
- **bumpSeen network failure regressed clears** — POST was fire-and-forget; on a network blip the local clear stuck for the session but the server timestamp lagged, so the red dot reappeared on next reload (server-authoritative path). now: failed bumps stash to an in-memory pending map and replay on the next `visibilitychange → visible` event.
- **channel emotes stayed empty on cold-cache page-load** — `loadInventory` in content.js short-circuited the storage path when globals were warm; even if `channel_emotes_map` had no entry for the current channel, no explicit refetch fired. join_channel-driven refetch could race the live paint of existing DOM messages. now: if `myChannel && channelEmotes.length === 0`, fire a `get_picker_emotes` refetch from the storage path.
- **multichat extra channels rendered raw text until clicked** — on SW boot the restore path replayed `channel:join` over the WS for every channel in `joinedExtraChannels`, but never called `fetchChannelOwnerEmotes` for those channels. only the page channel's emotes refetched. now: each restored channel gets a 50ms-staggered `fetchChannelOwnerEmotes` so every multichat tab has emotes ready when first opened.
- **emoji-only chat rows clipped emoji at the top** — `.hs-mc-emoji` had `font-size: calc(1em * 2)` (~26px in chat context) but `line-height: 18px` hardcoded, so the inline-block reported itself as 18px tall, the 26px glyph centered and extended 4px above the line box, and `.hs-mc-msg`'s `overflow: hidden` clipped that overflow. emote-bearing rows survived because the 32px emote img forced the line box larger. fix: `line-height: var(--hs-emote-size, 32px)` so the emoji span height matches emote-img height — gives ~3px headroom above and below the 26px glyph (accommodates Noto Color Emoji 1-2px bleed), and makes emoji+text rows visually consistent with emote+text rows.
- **vertical-mode util row had empty side gap** — `.hs-mc-util-btn` was pinned to 18px in `hs-tabs-right`/`hs-tabs-left`, leaving leftover column space (visible most in popout where C is hidden, but present in in-page overlay too with 5-6 buttons). now flex:1 each so the row stretches to fill the column as one segmented control matching the channel tabs above.
- **"went live" 5-burst on ext reload** — the connect-snapshot grace was 30s, but SW WS auth + snapshot burst can take 20-60s on slow connects or cold SW boot. all 5+ currently-live channels would burst as fresh transitions past the 30s window. grace bumped to 90s; covers the slow path comfortably. genuine off→on transitions during a long grace are rare and still resurface on the next offline/online cycle.
- store listing now discloses that personal emote set, feed, and whispers require a heatsync.org login (free); third-party emote and cosmetic rendering works without an account. previous copy could leave a reader thinking nothing required auth.
- twitch chat backfill paths (persisted-buffer restore, robotty backfill, justlog backfill) now skip `roomstate`/`userstate`/`whisper` types. those non-renderable types were filling the 500-msg render ring with null divs and presenting as empty chat on restored channels.

### error-log noise (from production error-reporter)
- `[heatsync] fetchEmoteInventory failed: signal is aborted without reason` was logged as console.error on every SW reinit / extension reload. expected behavior (AbortController cancels in-flight fetch on teardown), not a real failure. now suppressed when `error.name === 'AbortError'` or the message includes 'aborted'.
- `[heatsync-mc] Feed fetch failed — full resp: {...429}` spammed on the rate-limit response when the user has multichat open across many tabs racing /api/messages. 429 is expected throttling, not a server fault — logged via debug `log()` instead of console.error. 5xx / 401 still console.error.
- `Cannot read properties of null (reading 'querySelectorAll')` in `reapplyBadgesToExistingMessages` — twitch SPA-nav can reparent the chat tree between `findChatContainer()` returning and the next sync tick, leaving a stale reference. added a defensive `typeof container.querySelectorAll === 'function'` guard before iterating.
- `ResizeObserver loop completed with undelivered notifications` — chrome-internal warning, every SPA with observers raises this. added an `_isNoise` filter in `lib/error-reporter.js` so it never enters the buffer.
- `Document is not focused` (Clipboard API) — fires when user copies via the multichat context menu while the page tab is unfocused. four `navigator.clipboard.writeText` calls in `input.js` used sync `try {...} catch {}` which doesn't catch promise rejections; now properly chain `.catch(() => {})`. also filtered in `_isNoise` as a safety net.
- `Connection timeout` from `background.js:3368` — fires when the bg WS handshake times out; the same handler already calls `scheduleReconnect()` which recovers. now filtered in `_isNoise` so the recovery path stays quiet.
- general: the error reporter now silences a small set of known-noise patterns (ResizeObserver, AbortError, ext context invalidated, cold-SW retry, doc-not-focused, WS connection timeout) at capture time so the user-facing "errors (N)" counter reflects actionable failures only.

### removed
- options page (`options.html`) deleted; `options_ui` removed from both manifests; "settings" link removed from the popup. settings now live solely inside the in-chat ⚙ button. previous options page was a one-paragraph stub that just told you to open chat — redundant surface.

### internal
- added `hs-dbg-render-deep` and `hs-dbg-emotes` event listeners in multichat bootstrap for inspecting render-merge state and emote-cache state during debug sessions.
- removed three unguarded `console.log` breadcrumbs in `src/multichat/main.js` (resub-share fired ok, watchstreak-share fiber, watchstreak-share DOM click). these fired on every share user action and leaked to production console; now routed through `MC_DEBUG`-gated `log()`.

### permissions / privacy disclosure
- added `https://api.7tv.app/*` to chrome and firefox host_permissions. the 7TV v4 GraphQL search endpoint was being fetched from three content-script sites (heatsync-button.js, autocomplete-hook.js, src/multichat/emotes.js) without an explicit declaration. it worked today because 7TV serves permissive CORS, but the host should be declared for store review and reliability.
- added `youtube-keyboard-guard.js` to the firefox manifest content_scripts (MAIN world, document_start, www.youtube.com). previously chrome-only; firefox YT users were missing the YT hotkey isolation that lets multichat input swallow keystrokes intended for it instead of triggering YT's page-level shortcuts.
- privacy policy: docs/PRIVACY.md updated to disclose `api.7tv.app` (emote search), `logs.zonian.dev` (already declared but undocumented), and corrected the YouTube row from "DOM only" to call out the oembed and live-page metadata fetches that route chat messages. store-assets/copy/PRIVACY.md re-synced from the canonical so the version pasted into store consoles matches.
- store listing host table now lists `api.7tv.app` and `logs.zonian.dev`.

## [1.5.2] — 2026-05-22

### added
- FFZ-style modifiers (`w!` `h!` `l!` `c!`) now apply to emoji too, not just emotes — the modifier folds into the emoji span

### fixed
- live type-and-space auto-convert only imagifies emotes you own (heatsync inventory + native subs); channel/global/3rd-party words like a lowercase "what" emote stay plain text until Tab
- input box no longer collapses on youtube — pinned `box-sizing` + `min-height` so the placeholder stays inside the white box
- emote picker no longer shows a blank strip above the input on kick/youtube — dropped the hardcoded `max-height` that subtracted a tabs-bar height only present on twitch

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
