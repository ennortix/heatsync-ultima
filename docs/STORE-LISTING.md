# Store listing — source of truth (CWS + AMO)

Paste-ready copy + the per-store gotchas. Keep in sync with `chrome/_locales/en/messages.json`
(`manifest_name`, `manifest_description`) and the live dashboards. See
[AMO-REVIEW-NOTES.md](./AMO-REVIEW-NOTES.md) for reviewer notes + permission justifications.
Competitive claims (slots, size, platform gaps vs 7tv/bttv/ffz) come from
[POSITIONING.md](./POSITIONING.md) — verified facts only, recheck externals before use.

## Name (localized — `manifest_name`)
```
heatsync — your emotes in every chat
```

## Short description (localized — `manifest_description`, 118 chars)
Used as the Chrome Web Store short description (CWS limit 132 — this fits) and the
Firefox add-on manifest description. **Current en value, leave it:**
```
your emotes in any twitch, kick or youtube chat — free, up to 5000 slots. plus 7tv/bttv/ffz + cross-platform multichat
```
> Note: "in any twitch, kick or youtube chat" — native emote rendering is twitch+kick;
> youtube emotes render in the overlay tab. Defensible, and 1.6.8 shipped similar copy
> past AMO review. Leave as-is.

## AMO Summary (dashboard, ≤250 — refined 2026-07-11, paste-ready)
Leads with the wedge (viewer-owned emotes, no sub / no streamer setup — the thing every
competitor gates or charges for), then the two supports: multichat + trust.
```
your emotes in any twitch, kick or youtube chat — no sub, no streamer setup. 5,000 free slots, one-click 7tv/bttv/ffz import, cross-platform multichat in one panel. open source, no trackers.
```

## AMO / CWS Description (long — timeless; identical for both stores. refined 2026-07-11, paste-ready)
No versions, sizes, or dates in copy — only claims that hold across releases
(5,000 comes from `src/lib/config.js`, stable). Verified against POSITIONING.md.
```
your own emotes in any twitch or kick chat — no sub, no streamer setup. a personal 5,000-slot inventory that follows you into every channel, plus twitch, kick + youtube live chat in one panel. free.

• emote sovereignty — upload or import any emote (7tv, bttv, ffz, or your own) into a free 5,000-slot inventory. tab-complete a name and send — it renders in twitch + kick native chat and the overlay, any channel. one click imports a whole channel's emotes.

• cross-platform multichat — twitch, kick + youtube live chat in one tabbed panel: per-channel tabs, mentions, twitch whispers, resizable + dockable to any edge. no account needed to read.

• 7tv / bttv / ffz — emotes, paints + badges render automatically, channel and global. runs alongside those extensions — this adds the portable emotes and cross-platform chat they don't do.

• keyboard-first — vim keybindings on twitch, kick + the panel, wysiwyg emote composer, message history, reply threading, instant filter of the live buffer by text or user.

• moderation + profiles — hover mod toolbar (ban/timeout/unban/delete), client-side automod, mute or block that carries a user across twitch and kick, profile cards with a searchable chat-log archive, one-click twitch clips.

• light + private — vanilla js, zero runtime deps, capped buffers hold memory steady over 8-hour sessions. no trackers, no analytics, no third-party telemetry; emotes + settings sync through heatsync's own servers only.

free · open source (MIT) · your emotes stay yours
```

## Tags / categories
- Category: Social & Communication
- **Tags — add `kick`, `emotes`, `7tv` (kick is a core platform but is currently missing):**
```
chat, streaming, twitch, kick, youtube, emotes, 7tv
```

## Known issues / decisions
- **AMO listing APPROVED + live (2026-07-11):** `addons.mozilla.org/.../heatsync-chat/` returns 200.
  Listed version still 1.6.8 — upload 1.7.21 as a *listed* version. Live AMO tags are
  `chat, streaming, twitch, youtube` — add `kick` + `emotes` (+ `7tv` if the picker allows).
  Live AMO description predates the refined copy above — paste it in.
- **Locale drift (RESOLVED 2026-06-23):** all 33 non-en `manifest_description` strings
  realigned to the wedge-first (emote-first) framing, matching en. Each verified ≤132 chars,
  valid JSON, brand tokens present (Twitch/Kick/YouTube/7TV/BTTV/FFZ/5000), build passes.
  Machine-authored from each locale's existing vocabulary — a native spot-check on the
  non-Latin scripts (ar, he, hi, th) before the tag is prudent but not blocking.
  `manifest_name` is intentionally bare "heatsync" in non-en (toolbar name) — left as-is.
- AMO listed version is behind: submit **current release** (1.7.21 as of 2026-07-11; listing was on 1.6.8).

## Pre-release / pre-submit checklist
- [ ] `bun run build.js --package` green (build + node --check + zips + source zip + tests) — verified 1.7.5: 552 tests pass.
- [ ] CWS: short description auto-from manifest (118 chars, OK); paste long description above; set tags.
- [ ] AMO: submit 1.7.5; attach `dist/heatsync-source-1.7.5.zip`; paste AMO-REVIEW-NOTES "Notes for Reviewers"; add `kick`/`emotes`/`7tv` tags; data form must MATCH the manifest `data_collection_permissions` (declares `authenticationInfo`) — declare **authentication info collected + transmitted** to first-party heatsync.org for emote/account sync; plus the synced account data (emote inventory, blocked emotes, channel names, ui prefs). NOT "no data collected" — that contradicts the manifest + PRIVACY.md (server-side retention). no third-party sharing, no analytics/telemetry. twitch/kick cookies are read locally and never sent to us.
