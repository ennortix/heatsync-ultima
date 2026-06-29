# competitor watch

tracking the other twitch+ chat/emote projects so heatsync's read on each stays current.
**last full review: 2026-06-28.** re-run via the 5-agent recon (one per project) or refresh from the tracking feeds at the bottom.

scope: security posture + performance + what they're actively building. not feature parity (see KICK-PARITY.md / FEATURE-INVENTORY.md for that).

---

## tl;dr deltas vs heatsync

- **chatterino** — native c++/qt desktop client, not an extension. wins on raw resource use (no DOM/V8). lua plugin sandbox escaped twice (patched). stores oauth in plaintext json (keyring opt-in linux only). routes every clicked link through a third-party resolver (braize.pajlada.com). only one without a browser sandbox.
- **bttv** — 3M users, mv3, but the extension is a closed-source CDN-loaded blob (no manifest in repo, betterttv.js fetched live from cdn.betterttv.net → nightdev can change what runs on every twitch page with no store audit). ships sentry telemetry on by default, non-configurable. 2.5MB react+mantine+framer bundle. proxies ffz/7tv emotes through its own CDN. clean XSS hygiene (zero innerHTML).
- **ffz** — apache-2.0, mv3, twitch-only, no kick. biggest unmitigated surface = its addon system (third-party `<script>` tags injected unsandboxed from CDN, gated only by PR review). deep react-fiber wrapping + 500ms discovery poll = inherent overhead. self-hosted sentry. 576 open issues, low-cadence burst maintenance (effectively one dev, Trubbel).
- **7tv** — the main rival. multi-platform (twitch/kick/yt). vue3 mv3 ext + rust backend monorepo (replacing old go stack). **presence-tracks every channel switch** (POST /presences, no opt-out). emoji svg set via raw innerHTML, no DOMPurify anywhere. firefox AMO delisted (policy violation dec 2024, self-distributes now). open firefox memory leak (→100% RAM). channel-switch freeze matches the 13-18s we've seen. stable ext release cadence basically dead (last stable v3.1.6 = mar 2025); real dev is in the rust backend + chatterino7 fork.
- **heatsync** — vanilla, zero runtime deps (smallest supply chain), mv3, strictest CSP of the set (typed, no analytics, narrow connect-src), first-party-only network, error-scrubbing on crash reports, 66 innerHTML all escaped. only one with **zero third-party telemetry**. broadest host perms (cost of multi-platform). main.js is a 16k-LOC god-file (readability debt, not perf).

---

## security comparison

| dimension | chatterino | bttv | ffz | 7tv | heatsync |
|---|---|---|---|---|---|
| type | native c++/qt | browser ext (mv3) | browser ext (mv3) | browser ext (mv3) | browser ext (mv3/mv2) |
| sandbox | none (full native proc) | chrome ext sandbox | chrome ext sandbox | chrome ext sandbox | chrome ext sandbox |
| source openness | MIT, full source | **proprietary**, ext blob from CDN | Apache-2.0, full | mixed licenses, full | (own — full source) |
| code-load model | shipped binary | **live from cdn.betterttv.net** | bundled + CDN addons | bundled | bundled |
| innerHTML / XSS | n/a (qt painter, no HTML) | **0 innerHTML** (clean) | 12 (2 md-it sigificant), no DOMPurify | raw innerHTML on emoji svg, no DOMPurify | 66, **all escapeHtml** + safeUrl |
| plugin/addon surface | lua (sandbox escaped 2×, patched) | self-bot (new, jun 2026) | **unsandboxed `<script>` addons** | none in ext | none |
| auth/token storage | plaintext json (keyring opt-in linux) | own bttv oauth in localStorage | reads no twitch token | own token in IndexedDB | chrome.storage, error-scrubbed |
| third-party data routing | braize (links), robotty (history) | proxies ffz/7tv via own CDN | google fonts (opt-in) | **always fetches ffz+bttv**; presence POST | **first-party only** |
| telemetry | none | **sentry on by default** | self-hosted sentry | presence tracking, no opt-out | **none** |
| disclosure policy | none (no SECURITY.md) | none | none | SECURITY.md, security@7tv.app, 72h | (own) |

## performance comparison

| dimension | chatterino | bttv | ffz | 7tv | heatsync |
|---|---|---|---|---|---|
| render engine | native qt painter | decorate twitch react DOM | wrap 32 react components | patch react prototypes | own multichat DOM |
| resource profile | **lightest** (no DOM/V8) | 2.5MB bundle, react+mantine+framer | react-fiber + 500ms poll | react fiber prototype-patch | vanilla, 47k LOC, 0 deps |
| message buffer cap | 1000 (circular_buffer) | none (rides twitch virtualization) | 900 unpause trigger | **no cap visible** | 500 live / 1500 scrollback |
| emote cache | weak-ptr shared cache + disk | in-memory Map, refetch on reload | CDN, GIF cpu drain (#896) | IndexedDB/Dexie, WEBP+AVIF | per-size memoized + LRU cosmetics |
| known perf pain | link resolver latency, no dedup | observer stacking at high volume | chrome freeze (#825), gif cpu, mem leak | **firefox mem leak→100%**, channel-switch freeze, input lag | main.js readability only |
| real-time transport | irc tls + eventsub ws | wss sockets.betterttv.net | ffz pubsub cluster | eventapi ws (SharedWorker) | eventsub pool + pusher + relay ws |

---

## what each is actively building (as of 2026-06-28)

- **chatterino** v2.5.5 (mar 2026), daily commits — c++23 modernization, plugin system expansion (json/websocket/account APIs), qt 6.11 tracking, reverse message search, notification polish. has an AI-tools contribution policy doc.
- **bttv** v7.7.18 (jun 2026), releases every 2-4 days — self-bot feature (chat command-bot in your channel), emote menu channel filter, UI polish push (mantine), deeper 7tv interop. mv3 complete for chrome/edge.
- **ffz** 4.82.0 (jun 2026), burst cadence — converting twitch native events to ffz-rendered chat lines (i18n groundwork), mod-action fixes, mv3 complete. twitch-only, no kick. carried by Trubbel.
- **7tv** — stable ext frozen (v3.1.6, mar 2025); active work is the **rust backend monorepo** (v3/v4 rewrite replacing go) + chatterino7 (their most active repo, daily). june 2026 infra was shaky (multi-day outages jun 4-6, cdn jun 17). firefox still self-distributed (no AMO).

---

## tracking feeds (poll these to refresh)

prefer `commits.atom` for cadence, `releases/latest` API for version. 7tv's best signal is the backend/chatterino7 repos, NOT the extension.

| project | latest-release API | commits atom |
|---|---|---|
| chatterino | `https://api.github.com/repos/Chatterino/chatterino2/releases/latest` | `https://github.com/Chatterino/chatterino2/commits/master.atom` |
| bttv | `https://api.github.com/repos/night/BetterTTV/releases/latest` | `https://github.com/night/BetterTTV/commits/master.atom` |
| ffz | `https://api.github.com/repos/FrankerFaceZ/FrankerFaceZ/releases/latest` | `https://github.com/FrankerFaceZ/FrankerFaceZ/commits/master.atom` |
| 7tv ext | `https://api.github.com/repos/SevenTV/Extension/releases/latest` | `https://github.com/SevenTV/Extension/commits/master.atom` |
| 7tv backend | (no releases) | `https://github.com/SevenTV/SevenTV/commits/main.atom` |
| 7tv chatterino7 | `https://api.github.com/repos/SevenTV/chatterino7/releases/latest` | `https://github.com/SevenTV/chatterino7/commits/master.atom` |

extra signals: bttv live bundle `https://cdn.betterttv.net/betterttv.js` (always-latest prod), 7tv status `https://status.7tv.app/`, bttv store version lags source ~3 releases (watch the atom, not the store).

---

## refresh procedure

1. for a quick version/cadence check: hit the `releases/latest` APIs + `commits.atom` feeds above (cheap, no clone).
2. for a full re-review (quarterly or after a notable shift): re-run 5 parallel recon agents, one per project, each cloning the repo and reporting security + perf + recent-direction. update this doc's tables + dates.
3. bump **last full review** at top.
