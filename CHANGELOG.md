# changelog

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
