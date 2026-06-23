# @heatsync/chat-core — extraction plan (sign-off gated, NOT yet implemented)

Goal: vendor the pure, DOM-independent chat/emote logic into ONE module shared by
the extension and the website (git-subtree), killing ext↔site drift. This is the
platform-independence keystone (the renderer becomes host-agnostic). Read-only
analysis — no code changed.

## Per-area findings

**1. FFZ/emote modifiers — cleanest, near-identical**
- ext `src/lib/modifiers.js` (already a standalone lib via build.js readLib)
- site `client/utils/hs-modifiers.js` ("Ported from heatsync-extension/src/lib/modifiers.js")
- Drift: site DROPPED the vertical-margin branch in `hsModApplyToImg` (ext computes `fy` + applies it). Ext is more correct.
- Purity: pure except `hsModApplyToImg`/`hsModRead` (DOM) → keep those in a host shim.

**2. Emote sanitization — REAL SECURITY GAP (ext-only)**
- ext `chrome/background.js:~1783` — `EMOTE_CDN_PATTERN` + `sanitizeEmote` + `sanitizeEmoteList` (scheme/domain guard).
- site: **NO equivalent** — trusts whatever URL the API returns. No scheme/domain check.
- This is the single highest-value correctness/security win. Pure (regex + length).
- **Actionable independent of the subtree**: the site should validate emote URLs (matches memory `heatsync_emote_cdn_pattern_cdn_subdomain` — must allow cdn.heatsync.org). Flag for a standalone site fix if the subtree slips.

**3. HTML escape — 8 copies, one hidden DOM dep**
- ext: `src/lib/utils.js:15` (null-safe regex, canonical), `chrome/chat-injector.js:428`, `chrome/heatsync-button.js:17` (NO null guard — can throw), `chrome/multichat.js:809`.
- site: `client/utils/helpers.js:128` (uses `div.textContent` — DOM-dependent, NOT portable), `client/utils/archive-render.js:20`, `client/message-edit.js:274`.
- Drift: `&#x27;` vs `&#39;` (equivalent, inconsistent). Canonical = ext `utils.js:15`.

**4. Tab-complete ranking — DRIFT BUG REFUTED (already fixed)**
- ext overlay `src/multichat/input.js:3198-3230`, ext Kick hook `chrome/kick-autocomplete-hook.js:76`, site `client/events/emote-events.js:716`.
- All three rank channel(0) > own(1) > global(2) TODAY. The historical inventory-first Kick path was reversed (matches memory 2026-06-13). Remaining divergence is structural (3 data structures), not behavioral.

**5. Emote lookup/match — genuinely different architectures**
- ext `src/multichat/emotes.js:1704/1723/1752` (3 variants) + 3 `findEmoteMatches` copies (multichat/content/youtube).
- site `client/utils/helpers.js:505` + `client/events/input-helpers.js:833` + async `fetchRemoteMatches`.
- NOT the same function (ext has blocked/removed fallback; site has server `emote_refs` ownership proof). Both read host state → not pure. Defer, maybe never.

## Ranked extraction order
1. **modifiers** — lowest risk (lib-vs-lib, near-identical), proves the subtree pipeline, fixes site's missing vertical-margin. Base: ext `modifiers.js` (+ fy fix). DOM appliers stay host-side.
2. **sanitization** — fixes the most actual RISK (site has no URL guard). Base: ext `background.js`. Signatures: `sanitizeEmote(e)→e|null`, `sanitizeEmoteList`, `EMOTE_CDN_PATTERN`.
3. **escapeHtml** — 8 copies → 1; kill the DOM impl (`helpers.js:128`). Base: ext `utils.js:15` (null-safe regex). Normalize on `&#39;`.
4. **tabcomplete rank** — deferred (bug already fixed; value is structural only). Define `rankEmotes(matches, query)` iface first.
5. **lookup/match** — deferred, maybe never (3 semantics, divergent).

## Risks
- `client/utils/helpers.js:128` escapeHtml uses `document.createElement` — looks swappable but is a hidden DOM dep; verify no caller relies on browser entity normalization.
- site `lookupEmote` `provider==='inventory'` skip is INTENTIONAL cross-user behavior — a caller relies on it; don't unify away.
- `hsModApplyToImg`/`hsModRead` touch DOM — host shim only.
- ext has 3 `findEmoteMatches` copies (multichat/content/youtube) that must converge before any match extraction.
- shared module must take maps as args, never reach into a global (`app.emotesMap`).

## Recommendation
Step 1 (modifiers) to de-risk subtree mechanics, step 2 (sanitization) immediately
after — that closes the site's emote-URL security gap. Steps 4–5 likely never needed.
