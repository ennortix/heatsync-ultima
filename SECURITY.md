# security

## reporting a vulnerability

email **mellen@heatsync.org** with:

- a clear description of the issue
- steps to reproduce
- potential impact
- your preferred contact for follow-up

please don't open a public GitHub issue for security bugs. we'll acknowledge within 48 hours and aim to ship a fix within 7 days for critical issues.

## known design trade-offs

**MAIN world script** — `early-inject-main.js` runs at `document_start` in the page's JavaScript context (not the extension's isolated context) on twitch.tv. this is required to intercept twitch internals before react mounts. it means the script shares the page's JS scope and has no isolation from page scripts. we treat it as a known, intentional trade-off.

because a nonce cannot be kept secret in a realm shared with the page, the privileged proxies this script exposes (twitch Helix + Apollo GraphQL — used for chat color, chat modes, clip creation, and a fixed set of chat mutations) are each constrained by an **explicit endpoint+method / mutation-name allowlist plus a rate limit**. a message forged by a co-resident page script can therefore only replay the extension's own operations with the user's token — it cannot reach arbitrary Helix endpoints (ban / delete / channel-update). the Helix proxy allowlist lives in `chrome/early-inject-main.js`.

## scope

extension-side processing happens locally in the browser tab. the extension communicates with heatsync.org for emote sync, and with 7TV/FFZ/BTTV/decapi.me for cosmetics — see [docs/PRIVACY.md](docs/PRIVACY.md) for the full data flow.

## permissions — and what we deliberately don't request

every permission maps to a specific feature; we request the minimum for a
cross-platform chat extension and nothing speculative.

| permission | why |
|---|---|
| `storage`, `unlimitedStorage` | store settings, emote inventory, and blocked-emote list locally (inventory can exceed the sync-storage per-item quota) |
| `cookies` | read your *own* httpOnly auth token on heatsync.org / twitch / kick to act on your behalf (send chat, follow, set color); content scripts cannot read httpOnly cookies, so this is the only mechanism |
| `tabs` | coordinate the multichat websocket across your open tabs and open notification links |
| `alarms` | keep the background service worker's periodic tasks (emote refresh, live polling) alive after the SW is evicted |
| `notifications` | live-stream alerts you opt into |
| host permissions | inject the chat UI and fetch emote/cosmetic data on the platforms this extension is built for (twitch, kick, youtube, 7tv, ffz, bttv, heatsync.org) |

**we deliberately do NOT request:**

- `<all_urls>` — host access is an explicit allowlist, never "every site"
- `scripting` — no programmatic code injection; every content script is statically declared in the manifest and auditable
- `webRequest` — we never intercept, read, or modify your network traffic
- `management` — we cannot see or disable your other extensions
- `history`, `bookmarks`, `geolocation`, `clipboardRead` — none requested

## content-script defenses

- **`escapeHtml()`** wraps every user-supplied value (chat text, display names, emote names, profile fields, feed metadata) before it can reach `innerHTML` or `insertAdjacentHTML`. enforced in `src/lib/utils.js`. exception: feed post body text is HTML-escaped server-side before storage and is rendered as-is — re-escaping would double-encode entities.
- **`safeUrl()`** validates urls before assigning them to `href` / `src`; only `http(s):` schemes pass.
- **`sanitizeColor()`** restricts user-supplied colors to `#rrggbb` / `#rgb` hex.
- **CSP**: extension pages declare `script-src 'self'; object-src 'none'` in both MV3 (`extension_pages`) and MV2 manifests — no inline eval, no remote scripts.
- **trusted origins** allowlist in `src/lib/utils.js` gates any url passed to background.

## build pipeline guards

- post-build `node --check` over every output bundle (catches template-literal termination bugs before zip).
- explicit backtick-count assertion on `src/multichat/styles.js` (its giant CSS template literal is a known foot-gun).
- minification runs `esbuild` with `keepNames: true` so stack traces in the wild are still legible.
