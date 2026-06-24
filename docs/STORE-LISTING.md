# Store listing — source of truth (CWS + AMO)

Paste-ready copy + the per-store gotchas. Keep in sync with `chrome/_locales/en/messages.json`
(`manifest_name`, `manifest_description`) and the live dashboards. See
[AMO-REVIEW-NOTES.md](./AMO-REVIEW-NOTES.md) for reviewer notes + permission justifications.

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

## AMO Summary (dashboard, ≤250 — currently ~233, leave it)
```
your emote inventory in any twitch, kick or youtube chat — free, up to 5000 slots, in any channel. one click imports a whole channel's 7tv/bttv/ffz emotes. plus a cross-platform multichat panel, no account needed to watch. open source.
```

## AMO / CWS Description (long — current AMO copy is timeless; reuse for CWS detailed description)
```
your own emotes, in every chat — twitch, kick + youtube. heatsync gives you a personal 5000-slot emote inventory that renders in any channel's chat, whether or not the streamer enabled anything. free.

• emote sovereignty — upload or import any emote (7tv, bttv, ffz, or your own) into a free 5000-slot inventory. tab-complete a name or paste a link, hit enter — it renders in twitch + kick native chat and across the overlay, in any channel. one click imports a whole channel's emotes.

• cross-platform multichat — twitch, kick + youtube live chat in one tabbed panel: per-channel tabs, per-platform filters, mentions, whispers, resizable + dockable. no account needed to watch.

• 7tv / bttv / ffz — emotes, paints + badges render automatically. coexists with those extensions.

• power-user input — vim keybindings on every chat input, wysiwyg emote composer, message history, reply threading, instant /-filter of the live buffer.

• moderation + profiles — hover mod toolbar, client-side automod, mute/block synced across twitch↔kick, profile cards with a chat-log archive + one-click clips.

• light on your machine — vanilla js, zero runtime deps, capped buffers hold memory steady over long sessions.

free · open source (MIT) · no trackers · your emotes stay yours
```

## Tags / categories
- Category: Social & Communication
- **Tags — add `kick`, `emotes`, `7tv` (kick is a core platform but is currently missing):**
```
chat, streaming, twitch, kick, youtube, emotes, 7tv
```

## Known issues / decisions
- **Locale drift (open):** `manifest_description` is wedge-first ("your emotes...") in **en only**.
  All ~32 other locales still carry the pre-1.7.5 multichat-first line
  ("[platform] chat in one panel. custom emotes, 7tv/bttv/ffz paints + badges built-in").
  Not wrong, but the 1.7.5 repositioning only landed for English. Decide: realign all
  locales to the emote-first framing, or leave non-en as-is. `manifest_name` may have the
  same split — check before realigning.
- AMO listed version is behind: submit **1.7.5** (listing was on 1.6.8).

## Pre-release / pre-submit checklist
- [ ] `bun run build.js --package` green (build + node --check + zips + source zip + tests) — verified 1.7.5: 552 tests pass.
- [ ] CWS: short description auto-from manifest (118 chars, OK); paste long description above; set tags.
- [ ] AMO: submit 1.7.5; attach `dist/heatsync-source-1.7.5.zip`; paste AMO-REVIEW-NOTES "Notes for Reviewers"; add `kick`/`emotes`/`7tv` tags; data form = "no data collected".
