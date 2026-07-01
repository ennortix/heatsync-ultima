# operation zero — the roadmap

_generated 2026-07-01 from a 4-agent competitive + internal audit. source of truth = code, not stale planning docs._

## thesis (unchanged, now proven)

**out-platform, don't out-emote.** the 4-way audit confirms the wedge is defended by *architecture*, not effort:

- **FFZ** (53👍, open for years) and **Chatterino** (whole fork ecosystem) literally *cannot* do Kick — their cores are IRC-based, and Kick has no IRC. maintainers have declined it on record.
- **7TV** *can* go cross-platform and does — but ships it buggy: Kick VOD replay doesn't render emotes (#811), breaks on bare `kick.com` (#1204), chatterino7 Kick is "experimental."
- **BTTV** maintainers refuse platform expansion outright (#3176): "enough trouble keeping up with Twitch."

cross-platform done *well* is the moat. everything else clears runway for it.

## where we already win (do not rebuild)

the audit found HeatSync at or past parity on nearly every table-stake and most differentiators:

| capability | competitor best | heatsync | status |
|---|---|---|---|
| free personal emote slots | 7TV: 1000 | **5000 / 50k soft-cap** | **we win** |
| cross-platform (tw+kick+yt) | 7TV (buggy) | tw deep, kick mid, yt shallow | **we win, keep widening** |
| regex keyword highlights | all four | filter-rules.js (keyword/regex/user/badge/msgtype → hide/highlight, ReDoS-guarded, per-channel) | parity |
| cloud settings sync | 7TV, BTTV | WS sync + seen-state | **we win** (FFZ/Chatterino can't) |
| predictions/polls from client | Chatterino | full betting/voting UI | parity |
| first-chatter highlight | BTTV | firstChatterGlow + isFirstMsg filter | parity |
| OBS overlay | Chatterino | chat popout → OBS + mod-log popout | parity |
| zero-width / modifier emotes | all | full FFZ/BTTV modifier engine + stacking | parity |
| chat logs / history | all | justlog viewer + robotty recent + **SSR indexable /logs firehose** | **we win** |
| moderation | Chatterino deepest | ban/timeout/unban/delete/nuke × tw+kick, mod-log, client automod | parity |
| cosmetic badges + paints | 7TV | renders 7TV/BTTV/FFZ/Chatterino badges + 7TV paints | parity (render, not own) |

plus things **no competitor has at all**: SSR SEO firehose (`/logs`, `/moment`, `/u`, `/tags`, sitemaps over 31M rows), server-side heat + moment-detection acquisition loop, shareable multichat permalinks (`/m/`), cross-platform unified chat archive + identity graph, emote sets w/ perceptual-hash dedup.

## the real gaps — white space nobody occupies

ranked by (value × on-brand × buildability). "on-brand" = fits _out-platform_ thesis + 4 pillars + privacy-first.

### tier A — build now (self-contained, extension-side, testable, low-risk)

1. **cross-platform user notes** ⭐ _flagship_
   private notes you write about a chatter. Chatterino has this but **local + single-platform only**. we are the *only* product that can make a note on a Twitch user auto-surface on their Kick/YouTube identity — because we already have the identity graph (`expandUserAliases`) and cross-device sync. "first to get it, and structurally the only one who can."
   - ext: new `user-notes.js` module, alias-keyed, chrome.storage.local (sync-ready shape) → profile card section + ctx-menu item + a small `[note]` indicator on names that have one.
   - server follow-up (BACKEND-ASK): `/api/user/notes` for cross-device + team-shared mod notes (white-space #8 — nobody has team-shared cross-platform notes).

2. **accessibility pack** _cheap, on-brand (readable ≥13px is already law)_
   - emote **alt-text** (`alt`/`aria-label` = emote name) on every emote img — screen-reader chat is "tedious/DIY" everywhere; we make it free.
   - **minimum-contrast clamp** on username colors vs chat bg (FFZ's one a11y feature, we generalize it) — setting `hs_min_name_contrast`.
   - honor **prefers-reduced-motion** → freeze animated emotes to first frame unless user overrides.
   - colorblind-safe name palette option.

3. **filter DSL — boolean composition**
   Chatterino's filter language is the one power-user moat we don't match. our engine already types the vars (user/badge/msgtype/cheer/reply/first) — it just lacks `AND/OR/NOT` composition and numeric predicates (`bits > 100`). extend `filter-rules.js` (already unit-tested) with an optional boolean expression matcher; keep the simple per-rule form as the default UI. ship a **GUI builder** (white-space #9 — Chatterino gatekeeps behind syntax) so power stays but the cliff goes.

### tier B — design + stage (needs server/model; stub tonight, build after review)

4. **AI chat catch-up** — "what did I miss." Twitch is shipping this to streamer *backlash* (TwitchCon EU 2026) because it's forced + creepy. our angle: **opt-in, viewer-side, privacy-first**, fed by the heat/moments engine we already run. server summarizes the last N min of a channel (or the moments) on demand. nobody in the 4 has it.
5. **inline translation** — exists only as separate single-purpose extensions, never integrated. use **LibreTranslate** (FOSS, self-hostable — on-brand vs a SaaS). per-message "translate" affordance + optional auto-translate-incoming. global-audience unlock across all 3 platforms at once.
6. **VOD chat replay w/ emote rendering** — FFZ #1158 (11👍) open, 7TV's is broken. we already ingest + archive chat with origins + timestamps; render it synced to the VOD player timeline. first-class where everyone else bolts on.
7. **semantic emote search** — "find a laughing emote." all four do substring match only. proven for emoji; pair with our 5000-slot inventory + emote analytics.

### tier C — strategic / monetization (roadmap, not a quick win)

8. **cosmetic premium** — the one clear monetization gap vs 7TV/BTTV, and it's *0% built* despite a stale roadmap promising it. model per memory = **cosmetic-only, never tips/payouts**. HS-owned animated paints/badges/name effects, sold, cross-platform-rendered. this is the acquisition→revenue bridge. big; needs its own design pass.
9. **widen Kick + YouTube depth** — Kick to first-class (parity wedge), YT discovery is dormant (no API key). each notch of cross-platform depth *is* the moat widening.
10. **cross-platform simulcast send** — `registerPendingSend` already takes a `platforms[]` array; the plumbing exists. a guarded "type once → all my open channels" mode is white-space #4 (nobody unifies send). **bulletproof gate required** (wrong-channel/spam risk) before exposing.

### explicitly NOT doing (off-thesis or decided against)

- self-bot / auto-responder (BTTV shipped it) — bots are off-brand; we're a viewer/mod tool, not a bot host.
- `/song` AudD recognition — niche, external paid dep.
- Lua plugin system + marketplace — huge surface, security burden; revisit only if extensibility becomes a demanded moat.
- out-emoting 7TV — their community considers emotes "solved." pointless arms race.

## tonight's execution (autonomous, no deploy)

building tier-A to completion, tested, committed atomically on this branch. **not deploying** — public-facing, leaving prod for morning review.

- [ ] cross-platform user notes (flagship)
- [ ] accessibility pack
- [ ] filter DSL boolean + GUI builder (if the first two land clean)

server-dependent items (AI catch-up, translation, VOD replay, notes-sync, cosmetic store) → captured in BACKEND-ASKS.md as designed asks, not half-built tonight.
