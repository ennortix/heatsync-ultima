# security

## reporting a vulnerability

email **mellen@heatsync.org** with:

- a clear description of the issue
- steps to reproduce
- potential impact
- your preferred contact for follow-up

please don't open a public GitHub issue for security bugs. we'll acknowledge within 48 hours and aim to ship a fix within 7 days for critical issues.

## known design trade-offs

**MAIN world script** — `early-inject-main.js` runs at `document_start` in the page's JavaScript context (not the extension's isolated context) on twitch.tv. this is required to intercept twitch internals before react mounts. it means the script shares the page's JS scope and has no isolation from page scripts. we treat it as a known, intentional trade-off. the script is minimal and read-only — it does not exfiltrate data or modify auth state.

## scope

extension-side processing happens locally in the browser tab. the extension communicates with heatsync.org for emote sync, and with 7TV/FFZ/BTTV/decapi.me for cosmetics — see [docs/PRIVACY.md](docs/PRIVACY.md) for the full data flow.

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
