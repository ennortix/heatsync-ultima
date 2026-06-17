# architecture refactor research — 2026-06-17

deep multi-agent audit of the heatsync extension architecture for efficiency, simplicity, durability.
measured against the 4 pillars: timeless · minimal · godtier · bulletproof.
findings are read-only analysis; execution flagged per item (safe-to-execute vs needs-sign-off).

baseline metrics:
- 124,923 JS LOC across src + chrome
- god-files: `src/multichat/main.js` 14,047 · `chrome/content.js` 10,432 · `chrome/background.js` 8,743 · `input.js` 5,244 · `twitch-api.js` 4,042
- 208 raw DOM-selector literals across 12 files (despite "one place" rule)
- escapeHtml/safeUrl redefined in 6 source files
- 602 raw setInterval/setTimeout vs 705 cleanup-tracked

---

## 1. cross-platform abstraction (twitch/kick/youtube)

no adapter pattern. 177 platform conditionals (`isKick`/`isYoutube`/`hostPlatform`/`platform ===`) across 10+ files; `main.js` alone has 142. `content.js` re-derives `isKick` from hostname at line 12 and ignores `platform-detector.js` entirely → two separate selector sources.

verdict: a full adapter rewrite is NOT justified (most 142 main.js branches are legit platform-specific layout/feature guards). three narrow wins instead:

| # | refactor | effort | risk | verdict |
|---|---|---|---|---|
| A | unify `IRC` + `KickChat` classes in irc.js behind shared `ChatClient` base (near-identical APIs; ~200 dup lines: buffer mgmt, _seenId dedup, on/emit, persist) | S | low | **safe** |
| B | single `getPageChannel()` (dup'd in content.js:2991, kick-autocomplete-hook.js:60, inline in main.js) → expose via window.heatsyncPlatform | S | v.low | **safe** |
| C | flatten `sendMessage()` 4 sequential if-branches (input.js:4779-5075) → platform-handler list + Promise.allSettled fan-out; 4th platform becomes one-liner | M | med | sign-off (critical send path; preserve per-platform error/retry) |

note: `content.js` `isKick` is binary not 3-way — if YT ever gets the content.js overlay treatment it must become a platform string.

---

## 2. build system + CSS pipeline

verdict: build is **fundamentally sound** — explicit ordered file arrays (no glob fragility), deterministic CSS concat via numeric-prefix sort, esbuild minify with `keepNames`+`es2020`, `node --check` on all outputs, correct order (build→minify→check). CSS-into-template-literal is the RIGHT call. don't change it. the `log` shadow (utils.js outer vs bootstrap.js inner block) is intentional + harmless.

gaps are all "silent-drift" guards missing. safe one-liner build hardening (IMPLEMENTED this session):

| # | add to build.js | catches |
|---|---|---|
| 1 | run existing `tests/check-versions.js` in build() | version drift shipping silently |
| 2 | manifest cross-diff (host perms + normalized content_scripts) | perm added to one manifest not other |
| 3 | scope-collision detector (lib outer-scope names vs inner-block decls; allowlist `log`) | future name clash → cryptic redeclare/silent shadow |
| 4 | wire `bun test` into build (`--no-test` to skip; forced on --package) | manifest/schema regressions undetected |

note: `chrome/multichat.js` is both source-tracked AND build-output (excluded from source zip) — intentional.

---

## 3. selector centralization

208 raw selectors across 11 files; `config.js` SELECTORS has 31 keys but most code ignores it. `platform-detector.js` keeps a whole parallel selector object that never reads config.js.

worst drift (latent bugs — same element, divergent selectors in 3 files each): kick chat container (3 forms in config.js/platform-detector.js/content.js); kick username (3 divergent forms).

fix: single source in config.js with **fallback arrays** + `qsArray`/`qsaArray` helper in utils.js (try each until match) → a twitch DOM break becomes a one-line edit. bulletproof goes fail→pass.

effort: L (~200 call-site swaps). safe tranche: add keys+helpers, migrate platform-detector.js / heatsync-button.js / autocomplete-hook.js. sign-off: content.js container cascade (4399-4404) + main.js chatRoom mount (7204-7208).

---

## 4. service worker + transport durability ★ highest-value bugs found

4 concurrent transports: heatsync WS + BG IRC (both in background.js SW), auth IRC send + EventSub whispers (per-content-tab). heatsync WS state machine is well-architected; the OTHER 3 transports are inconsistent.

**5 concrete bugs — 4 S-effort + SAFE (IMPLEMENTED this session):**

| # | sev | file:line | bug | fix |
|---|---|---|---|---|
| F5 | MED | background.js bg_irc_join | doesn't await `bgIrcRestoreFromStorage()` before `bgIrcEnsureChannel` → cold-wake race creates empty buffer, **loses persisted history** | await restore (mirror bg_irc_history) |
| F2 | MED | background.js bgIrcConnect | no CONNECTING-state guard → boot+auth-upgrade race tears down in-flight handshake | `if (ws.readyState===CONNECTING) return` |
| F4 | LOW | eventsub-whispers.js | no jitter → N tabs lockstep against rate-limit-sensitive EventSub → 429 storm | `+ Math.random()*delay*0.5` |
| F3 | LOW | auth-irc.js | no jitter → per-tab lockstep IRC reconnect | `+ Math.random()*500` |
| F1 | LOW | background.js ws_force_reconnect | doesn't clear heartbeatInterval before reconnect | clear explicitly |

note: O2 (SW unhandledrejection hook) was found ALREADY PRESENT.

**F6 (architectural, sign-off, L):** no transport registry — connection logic spread across 5 spots, watchdog alarm is manual switch/case. propose `ConnectionManager.register(id, connectFn, {watchdogInterval, maxBackoff, jitter})`. real debt, not urgent.

---

## 5. state management

verdict: **architecture is solid** — BG authoritative, tabs get push-broadcast copies; settings registry covers ~95% of prefs; clean split-by-scope; 3-bucket parallel hydration. don't over-engineer (no state lib). genuine issues:

| # | sev | issue | fix | exec |
|---|---|---|---|---|
| S1 | MED | **`ui_settings` RMW race** — 6 uncoordinated `get→merge→set` callers; two events same tick → last-writer-wins silently drops a change | serialize BG writes through a chained-promise mutex (IMPLEMENTED) | safe |
| S2 | LOW | `activeTab`/`liveChannel`/`chatPositionPrevious` ride sync blob w/o schema entry → invisible to reset/lint + unintended cross-device sync | add schema entries | annotate safe; scope migration sign-off |
| S3 | LOW | `customPresets` rides `ui_settings` 8KB sync quota | schema stub now / migrate later | annotate safe; migrate sign-off |
| S4 | LOW | CW `viewer_show_*` don't live-flip tab UI on cross-device `user_settings:update` | add local-branch handler | low-pri |

ad-hoc per-device keys (`hs_chat_width/height`...) correctly OUTSIDE registry — leave them.

---

## 6. memory leaks

verdict: cleanup system is **solid** — caps + tracked timers/observers nearly everywhere. 5 real leaks, ALL spa-nav driven. 4 S+safe (IMPLEMENTED this session; L3 was already guarded):

| # | sev | file:line | leak | fix |
|---|---|---|---|---|
| L1 | HIGH | input.js:3391 | `_hsUserColorCache` Map **NO cap** → ~1-5MB on partner streams (50k chatters) | evict-oldest >5000 after .set() |
| L2 | MED | bootstrap.js:148-492 | 13 `hs-dbg-*` listeners re-add every SPA nav, never removed | `{signal: mcSignal}` |
| L3 | MED | social.js mouseover | (already had signal — no change) | — |
| L4 | LOW | mentions.js:158-161 | window focus + visibilitychange re-add per nav | `{signal: mcSignal}` |
| L5 | MED | content.js (444,3381,3898,10363…) | chrome API listeners never removed → **duplicate msg processing after ext-reload** | sign-off (M, touches routing) |

verified NOT-leaks: lockStack observers (auto-disconnect on GC), early-inject polls, cosmetics/badge/avatar maps (LRU-capped), irc `_seenIds` (6000 cap), background uses chrome.alarms.

---

## 7. content.js hot path (per-message perf)

verdict: core is **already good** — emote lookup is O(1) Map, no reflow loops. real cost is work that fires on EVERY message regardless:

| # | sev | file:line | cost | fix | exec |
|---|---|---|---|---|---|
| P1 | HIGH | content.js:5945 | `_hsPeel` allocs closure+array+regex per non-emote word, returns null ~99% | guard `includes('!')` (IMPLEMENTED) | safe |
| P3 | MED | content.js:4913 | `colorUsernameMentions` split+replace+createElement per msg | skip if no known chatters (IMPLEMENTED) | safe |
| quick | S | 5256/5454 `document.contains`→`isConnected` (IMPLEMENTED); 9181 `ensureEmoteStyles` out of MO callback | micro but free | safe |
| P2 | MED | content.js:5264 | `cloneNode` per child — dim-timeouts default-on → 5-15 deep clones/msg | snapshot only if someone timed out | sign-off |
| P-hi | M | 5799 `applyModifiersAcrossMessage` TreeWalker; 5707 double query | | sign-off |

---

## 8. observability / error handling / tests (bulletproof axis)

error-reporter is **first-party safe** (50-entry ring in storage.local, no network, URL-truncated, no PII). but SW has a **copy-paste inline clone** (background.js:8-114) that drifts.

| # | sev | file:line | silent failure | fix | exec |
|---|---|---|---|---|---|
| O1 | HIGH | background.js:5198 | `handleMessage` IIFE not awaited / no `.catch` → throw hangs `sendResponse` ~30s + rejection invisible | `.catch` + `sendResponse({ok:false})` (IMPLEMENTED) | safe |
| O2 | HIGH | background.js | SW `unhandledrejection` hook | found ALREADY PRESENT | — |
| O3 | MED | main.js:1884 | `storage.sync.set` no `lastError` check → toggle silently unsaved under quota (data loss) | check lastError (IMPLEMENTED) | safe |
| O4 | MED | background.js:185,377 | `.catch(()=>{})` on emote/cosmetic fetches → zero log trail | log on catch (IMPLEMENTED) | safe |

tests: bun test covers escapeHtml (incl XSS), settings round-trips, manifest/CSP/parity, build artifacts. **backtick footgun IS caught** (build.js:135 + node --check, in CI). gaps: `safeUrl` untested (highest ROI — only SSRF/protocol gate), `sanitizeUiSettings`, `parseIrcLine`. **push-to-main has no gate** (deliberate solo-phase). drift fix: extract SW reporter to shared module (sign-off).

---

## 9. ext↔site cross-repo shared core ★ highest strategic leverage

**zero code shared** between extension and site — 100% manual mirroring, and surfaces have ALREADY drifted. ~1,900 lines of platform-agnostic logic hand-mirrored across 5 surfaces. the "all 5 surfaces" memory rule exists *because the compiler can't enforce it*.

**LIVE BUG found (FIXED this session):** tab-complete tier order DIVERGED — multichat panel + site are channel-first, but **Kick native (`content.js:9706`) was inventory-first** → Kick rendered a *different* emote than the panel/site on a name collision. + the file commented "ported to stay in sync" (`client/utils/hs-modifiers.js`) was 250 vs 227 lines drifted.

**proposal: `@heatsync/chat-core` — pure slice only (~600-800 lines), via git subtree:**
- **shared core (pure, no DOM/chrome/window):** `modifiers.js` · `emote-match.js` (tokenize+resolution-order → token list) · `tabcomplete.js` (tier+exact-locality+recency rank) · `sanitize-emote.js` (CDN allowlist) · `escape.js`. plain-data in, plain-data out. trivially unit-testable, zero deps.
- **stays per-surface:** the 3 renderers (DOM vs HTML-string vs Vue) — share the *brain*, keep 3 *hands*.
- **distribution: git subtree** (NOT submodule/npm) — vendored physically into both repos, no install step, public-repo-safe (core is already-public pure logic, MIT).
- **migration (incremental, each ships verified):** 1) modifiers (reconcile drift) → 2) escapeHtml/safeUrl/sanitizeEmote (collapse 6 copies) → **3) tabcomplete rank (FORCES convergence → kills the live drift bug — highest leverage)** → 4) emote-match tokenizer (largest, opportunistic).

→ single most durable refactor in the audit. **needs sign-off** (cross-repo, new repo).

---

## 10. security + permissions (gates store launch)

verdict: **posture solid, no critical injection bugs.** CSP tight (`script-src 'self'; object-src 'none'`, no eval/remote). all chrome perms used+necessary. no token ever hits DOM/page-world.

**4 fixes gate launch — all S, safe (IMPLEMENTED this session):**

| # | file:line | issue | fix |
|---|---|---|---|
| SEC1 | social.js:1403-1415 | `emoteRefs` URL → img/href attr behind only `^https://` check | wrap `safeUrl()`+`escapeHtml()` |
| SEC2 | autocomplete-hook.js:2227 | `emote.url` injected raw into CSS `url()`, MAIN world | quote-escape |
| SEC3 | vi-mode.js:1064 | postMessage handler missing `e.source !== window` guard | add guard |
| SEC4 | firefox.json:16 | unused `webRequestBlocking` → clean AMO review | drop it (DEFERRED — manifest agent's run was clobbered) |

**HIGH / sign-off (design, inherent):** early-inject-main.js:526 — MAIN-world nonce observable by page JS → twitch.tv XSS or rogue extension could forge GQL mutations as the user. inherent to MAIN-world GQL interception; full fix is L (WASM bridge). action: keep `_hsNonce` allowlist tight + disclose MAIN-world access in store privacy copy.

---

## 11. DRY / sanitizer duplication

**no live XSS** — all escapeHtml copies emit identical entities; divergence is maintenance risk only. one real (latent) security improvement:

- **`safeUrl` ×2: lib version was WEAKER than content.js copy.** content.js denies js/data/vbscript/blob/file/about; lib was weaker → **promoted content.js's stricter safeUrl into lib** (security ↑) (IMPLEMENTED).
- `escapeHtml` ×4 — minor guard diffs only; left copies in place with `// mirrors src/lib/utils.js` traceability comments (deleting risks redeclare; low value).
- `API_URL` ×3 — bg + shared-utils are COPY_FILE → can't collapse without build change. [sign-off, M]
- `getFiber` ×3 — **correct as-is** (MAIN-world needs inline).

**root cause (the drift trap):** build.js is string-concat with no ES import resolution. lib lands at outer IIFE scope, so local copies in `src/multichat/*` **silently shadow** lib — divergence is invisible. (same root as §9 + §2 scope-collision guard.)

---

## 12. god-file decomposition (main.js 14,047 lines)

**critical build fact:** all `src/multichat/*.js` + main.js concat into ONE shared block scope — **no imports/exports**. splitting main.js is **pure cut-and-paste into new files**. only constraint = declaration order (main.js concat'd LAST). `node --check` = fail-loud net.

**safe mechanical splits (~1,900 lines out, zero design decisions):**
| split | file | lines | from | effort |
|---|---|---|---|---|
| A | `resize.js` | ~1,036 | cluster 10 (3584-4620): ghost-resize, chat width/height, ttv player pin, yt layout | M — biggest safe win |
| B | `mod-toolbar.js` | ~225 | cluster 12 (4656-4880): mod actions/toolbar | S — trivial |
| C | `cosmetics.js` | ~650 | cluster 5 (827-1480): avatar/paint/badge fetch+render+caches | M — **browser-verify** |

**sign-off splits (state-heavy, one per session):** `settings-ui.js` (L, decide engine/UI boundary) · `channel-mgmt.js` (L, keep loadConfig/saveConfig in core; preserve YT-handle-bleed fix) · `spa-nav.js` (M, tight init coupling; do LAST).

**DO NOT split:** settings engine, render engine, tab-cache, message listeners, init, global state decls — they ARE the core.

net: 14,047 → ~6,500 across 7 files. verify per split: build + reload + test twitch/kick/yt.

---

# ★ executive priority — what to execute

## tier 1 — safe now (IMPLEMENTED this session — see "execution log" below)
durability/correctness/security/perf/leak wins, all S-effort, mechanically verifiable.

## tier 2 — high value, needs sign-off
- §9 `@heatsync/chat-core` git-subtree (steps 1-3) — **the durable keystone**; step 3 kills the drift-bug class permanently
- §12 leaf splits resize/mod-toolbar/cosmetics → then settings-ui/channel-mgmt/spa-nav
- F6 ConnectionManager registry · L5 content.js listener removal · P2 cloneNode dim-snapshot · §1-A/B/C platform consolidation

## tier 3 — opportunistic / debt
schema annotations (S2/S3) · customPresets migration · CW live-flip (S4) · stylelint · API_URL collapse · SW-reporter shared module · §3 selector centralization (L)

---

# execution log (2026-06-17)

tier-1 fixes implemented by disjoint-file agents. NOTE: a concurrent claude session sharing this checkout ran a git op mid-flight and reverted the uncommitted edits of 3 of 4 agents (background.js, src/multichat/*, build.js) — caught by post-build verification. re-applied sequentially with immediate commits. see git log for the atomic commits.
