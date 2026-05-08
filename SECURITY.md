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

user-supplied content (chat messages, emote names) is passed through `escapeHtml()` before any `innerHTML` assignment. urls are validated via `safeUrl()` which allows `http` and `https` schemes only.
