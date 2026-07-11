# positioning — verified competitive claims (vs 7tv et al)

Source of truth for any public framing: store listings, reddit launch, replies, README.
Every claim here was verified 2026-07-11 (code, live CWS/AMO pages, 7tv.app). External
claims drift — **recheck anything marked ⏳ before publishing**, ours are stable per release.

## rules

- **facts only, never drama** — no 7tv ownership/finance/scandal talk anywhere public,
  ever. we win on product, not on kicking a competitor. positive-sum tone: "runs
  alongside", "adds what they don't do".
- never claim we "replace" 7tv — we *render* their ecosystem (emotes, paints, badges)
  and add a layer on top. their emote hosting + network is theirs.
- every number below is checkable by anyone; don't round up, don't embellish.

## verified claims — ours (v1.7.21)

| claim | value | proof |
|---|---|---|
| emote slots | 5000, free | `src/lib/config.js` MAX_EMOTES_PER_SOURCE, shipped copy since 1.6.8 |
| renders 7tv/bttv/ffz | emotes + paints + badges, native twitch+kick chat | `chrome/content.js` (processEmotes), `src/multichat/paints.js` |
| platforms | twitch + kick + youtube (yt = overlay + autocomplete + send) | manifests, `chrome/youtube-content.js` |
| multichat | cross-platform tabbed panel, no account to read | `src/multichat/main.js` |
| runtime deps | zero (vanilla js) | `package.json` — no dependencies key |
| package size | 1.68 MiB zipped | `dist/heatsync-chrome-1.7.21.zip` |
| tests | 1148 cases / 48 files | `bun test` |
| telemetry | none — no analytics, no third-party calls, local-only error buffer | grep clean; `src/lib/error-reporter.js` |
| permissions | 5 (storage, unlimitedStorage, cookies, alarms, notifications) + host allowlist | `chrome/manifest.json`; justifications in AMO-REVIEW-NOTES.md |
| locales | 34 | `src/_locales/` |
| license | MIT, open source | LICENSE |

## verified claims — 7tv (checked live 2026-07-11) ⏳

| claim | value | source |
|---|---|---|
| free slots | 1000 ("Everyone gets 1000 customizable channel emote slots, all for free.") | 7tv.app |
| platforms | twitch + kick only — youtube not mentioned | CWS listing (v3.1.23) |
| package size | 3.55 MiB | CWS listing |
| users | 2,000,000+ (CWS display tier), 4.5★ / 8.1K ratings | CWS listing |
| multichat | none in the extension (chatterino7 is a separate desktop app) | CWS listing + github.com/SevenTV |
| social layer | none — site is emote/cosmetic management | 7tv.app |
| subscription | €3.99/mo · €39.99/yr | 7tv.app/store (rendered in-browser, first-party) |
| personal emotes | subscriber perk, not free (benefits list: animated pfp, personal emotes, nametag paints, sub badge) | 7tv.app/store |

note: do NOT claim 7tv zero-width emotes are paid — not in their listed sub benefits,
unconfirmed. channel zero-width appears free. blogs saying otherwise were wrong.

## the pitch skeleton

wedge (lead with what only we do):
> your own emotes in any twitch or kick chat — 5000 free slots, no streamer setup
> needed. plus twitch, kick and youtube chat in one panel.

compatibility (disarm the "but i have 7tv" objection):
> 7tv, bttv and ffz emotes, paints and badges all render automatically — with or
> without those extensions installed. nothing to give up.

trust (checkable, not vibes):
> open source (MIT) · zero runtime deps · 1.7MB · no trackers or analytics · 5
> permissions, all documented

## reddit launch angles (pick one per post, don't stack)

1. **the multichat angle** — "i built a panel that puts twitch, kick and youtube live
   chat in one place" — leads with the thing no extension does; emotes are the bonus.
2. **the emote-sovereignty angle** — "your emotes in any channel, whether or not the
   streamer set anything up" — 5000 free slots vs the 1000 everyone knows.
3. **the lightweight angle** — "vanilla js, zero deps, no trackers, 1.7MB" — for
   r/privacy-adjacent or HN-flavored crowds.

never post a "heatsync vs 7tv" comparison thread ourselves. if commenters compare,
answer with facts from the tables above, friendly, and always include "it runs
alongside 7tv fine".
