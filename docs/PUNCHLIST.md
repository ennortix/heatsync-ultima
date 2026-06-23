# heatsync punch list — 2026-06-22

single prioritized backlog. consolidates: docs/multichat-audit-jun2026.md,
docs/AUDIT-FINDINGS-2026-06-14.md, docs/ARCHITECTURE-REFACTOR-2026-06.md,
BACKEND-ASKS.md, and standing memory PENDINGs. ordered by ROI against the
4 pillars (timeless · minimal · godtier · bulletproof) + the 0→10k growth gate.

state: ext v1.7.5. branch 8 commits ahead of main (perf/refactor/sanitization).
clean tree. zero code TODOs.

---

## ✅ verified status — 2026-06-22 session

> the lists below this header were the INITIAL plan. on execution, re-verifying
> each item against current code showed the codebase is well ahead of its audit
> docs — most "open" bugs were already fixed. what actually shipped/remains:

**shipped to heatsync.org (live):** dense heat-graded hot-feed rows + subject
lead · keyboard row-nav (j/k/↵/g/G) · subject-field XSS escape · defense-in-depth
attr escaping on media + profile sinks (two adversarial XSS sweeps found NO
exploitable bug; these were single-guard hardenings).

**committed to the ext (landed this session):** #7 kick live-status in the 90s
poll · #2 yt-watchdog disarm on stream-end (was looping force-reconnects of the
shared WS) · #9 channel-add url-parse + charset validation · oembed null-cache ·
self-heal timer leak → cleanup.setTimeout · add-form aria-labels · hermes
postMessage e.source guard.

**already-fixed (verified, do NOT re-chase):** soft-nav freeze (#1), channel-hop
leak (#3), hyphenated kick slug (#8), bfcache (#4), kick null-container self-heal
(#5), yt video→video nav (#6), eswCleanup on abort (#11), title-flash leak (#12),
join-timeout retry (#14), poll7TV kick-id, cleanup option-merge (QW1), dead
kickChat.ws guard (QW4), zero-channels empty state (QW6). greentext, >>hover-
preview, [OP]/[RE] badge all already shipped on the site.

**deliberately deferred (with reason — not rushed):**
- feed-list unification (`/live/new`+`/following` → dense) — careful core-renderer
  refactor (pagination + live-update + thread-shared); own focused build.
- #9 existence-check — needs a twitch/kick existence oracle; the heatsync resolver
  flags non-heatsync streamers as "not found" (wrong oracle, would block real adds).
- BG-initPromise — the "gap" isn't reachable (SW evals the full script before
  dispatching any event); moving the assignment only risks a TDZ crash.
- logout-stale guard — the audit itself says it's protective.
- P1/P2/P3 perf (buffer Map index, emote-map incremental, per-keystroke scan) —
  marginal gains on non-hot paths; incremental-vs-rebuild is an equivalence trap
  (a #13-style "optimization" was written then REVERTED after a 5000-case test
  proved it altered feed output).
- mod-notice permaban leak — lives in the prod EventSub chat-relay (heatsync-ash),
  not this repo; needs careful prod verification.

**highest-leverage next move:** cold-start (twitch follow import, BACKEND-ASKS #2)
— a best-in-class board needs users in it. server + ext, its own build.

---

## north star — design supremacy

beat X + reddit + 4chan **combined** on the social surfaces: elegant, simple,
dense — within the locked aesthetic (btop/dwl info-per-pixel, square everything,
ANSI-256, dark brand, white-bg+black-text on hover/active, zero trendy motion,
text ≥13px Cozette). out-platform, don't out-emote. this is the headline track —
every other tier exists to clear the runway for it (a daily-driver that never
needs a refresh is the precondition for people to *see* the design).

→ broken down in **P3-design** below. needs a current-state audit of the
heatsync.org social shell (feed / threads / compose) before execution.

---

## P0 — retention bugs (ext): "never needs a refresh"

the multichat audit verdict: this cluster is THE daily-driver killer — every one
surfaces as the "is it broken or just empty?" confusion. all verified in source.
one focused session, mostly S/M. fold the nav ones into a single authoritative
`navigateToLiveChannel(newCh)` transition (part old → join new → render).

1. **[critical] soft-nav freeze** — softTwitchNav/softKickNav drop the live cache
   but never re-join or re-render → panel freezes on previous channel until a
   refresh (zero recovery on a quiet/offline target). main.js:13152/13246.
2. **[high] YT watchdog never clears `ytChanLastSeen`** — ended/removed streams
   re-subscribe forever → `ws_force_reconnect` nukes the shared WS every channel
   rides. main.js:12847; social.js:773; removeChannel/rename/soft-nav all miss the delete.
3. **[high] channel-hop leak** — irc.part only fires from removeChannel → 8h of
   hopping leaks a 3000-msg buffer + zombie BG socket per channel. main.js:13152.
4. **[high] bfcache dead panel** — pagehide aborts unconditionally, no pageshow
   re-init → Back restores an orphaned dead panel. bootstrap.js:58; content.js:83.
5. **[high] Kick back-nav null container** — pre-emptive migrate is click-only;
   popstate/programmatic nav → container null → panel lost forever. main.js:13447.
6. **[high] YT video→video nav skipped** — handleMcNav gates on pathname; YT id is
   `?v=` so /watch→/watch is missed → wrong video's chat persists. main.js:13304.
7. **[high] Kick live poll never queries Kick** — 90s poll sends only twitch names
   → Kick dots stale/wrong unless heatsync-followed. main.js:9566.
8. **[high] hyphenated Kick slug truncated** — `[a-zA-Z0-9_]+` drops the hyphen →
   whole class of Kick channels route to nonexistent slugs. main.js:9695/10164/11788.
9. **[high] no channel-validation on add** — typos/pasted URLs create permanent
   silent dead tabs; resolver result is advisory, never gates submit. main.js:9001.

---

## P1a — ship what's already built (no new ext code)

- **moments feed website band** — browser-verify + deploy (server SHIPPED, ext DONE).
- **feed engagement removed → mirror to site feed.**
- **tile-inline chat moments** (post mirrors) — after main moments deployed.
- **AMO links swap** — external gate; on approval swap 4 files + 1 test, one commit.

## P1b — server unblocks (heatsync-ash) — gate social graph + cold-start

- **twitch follow import** (BACKEND-ASKS #2) — the cold-start killer; client written.
  most direct growth lever in the list.
- **hs block endpoint** (#1) — client written; completes social graph + moderation.
- **mod-notice EventSub duration leak** — server drops timeout duration → bogus
  permaban surfaces. correctness/bulletproof.
- **Kick user_id `k_` prefix migration** — blocks Kick shadow-follow (ensureKickShadowUser).
- **user_emotes.user_id VARCHAR migration** — int↔varchar inconsistency; shadow ids crash.

---

## P2 — correctness / perf follow-ups (verified real, do NOT rush)

**background.js HIGH (confirmed still present 2026-06-22):**
- logout leaves stale inventory — `if (stored.x?.length)` skips assignment on `[]`
  → SW restart keeps prior session emotes/blocks. drop guard, always `?? []`.
- poll7TVEmoteSet passes kick username not numeric id → drift poll 404s.
- cold-SW null initPromise window — `let initPromise = null` (705); message in the
  gap runs against empty maps. assign `= initialize()` at declaration.

**main.js (in-flight when audited — re-verify):** STORAGE_KEY spread on null →
all tabs vanish; missing `.catch` on loadEmotes/streamEvents/follow_history;
mentionsBuffer 550-live vs 200-persist asymmetry; sync sendMessage throws.

**multichat leaks/perf:** eswCleanup not called on abort (#11); title-flash
listeners leak per re-inject (#12); full-buffer sort thrash 60×/s on multi-platform
tabs (#13); join-timeout strands a queued send (#14).

**hot-path:** getBoundingClientRect in coloring rAF; querySelector churn per msg;
irc buf.getAll() O(n) per mod NOTICE.

---

## P3-design — design supremacy track (the north star)

execution-blocked on a current-state audit of heatsync.org social shell. targets:
- **feed** — out-scan reddit: square cards, ANSI heat tiers, zero useless gaps,
  glanceable hierarchy, no infinite-scroll dark patterns.
- **threads/comments** — beat 4chan+reddit trees: collapse, keyboard nav, stable
  permalinks (¶ in archives only), readable density.
- **compose** — frictionless, keyboard-first, no modal friction.
- **shell** — one consistent dense terminal aesthetic end-to-end.
- **keyboard-first everywhere** — vim nav across feed/threads/compose.

## P3-quick — ext ergonomics (cheap, high-feel)

- **keyboard tab nav** alt+1..9 / alt+[ ] (keyboard-first directive; biggest ergo
  miss vs chatterino).
- **numeric per-tab unread + mention counts** (not just a dot).
- **chat-mode strip** (followers-only/slow/sub-only/emote-only) above input.
- zero-channels empty state copy; aria-labels on add-form inputs.

---

## P4 — architecture debt (sign-off)

- **`@heatsync/chat-core` git-subtree** — zero code shared ext↔site today; surfaces
  already drifted. pure-logic slice (~600-800 lines) kills the cross-repo drift-bug
  *class*. highest strategic leverage. ARCHITECTURE-REFACTOR §9.
- **god-file splits** — main.js 14k → ~6.5k; safe leaves first (resize/mod-toolbar/cosmetics).
- **selector centralization** — config.js fallback arrays + qsArray helper.
- **transport ConnectionManager registry** (F6).

---

## recommended sequence

1. **P0 nav cluster** — one session, makes the product a daily driver (precondition
   for anyone to judge the design). highest ROI, all verified, mostly S/M.
2. **P1a ship-built + P1b twitch-follow-import** — deploy in-hand value; import is
   the cold-start growth lever.
3. **P3-design** — the north star, once the runway is clear.
4. P2 correctness pass folded in opportunistically; P4 on explicit sign-off.
