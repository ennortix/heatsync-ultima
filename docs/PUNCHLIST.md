# heatsync punch list — 2026-07-14

single prioritized backlog, rebuilt from verified state. supersedes the
2026-06-22 list: its P0 nav cluster + P2 correctness items were closed by the
hydraaudit sweeps (5690a55 39 fixes 07-12, 82516e4 54 fixes 07-13) and releases
through v1.7.24 (all channels, cws+amo). old P1b server unblocks landed too:
twitch follow import (server/services/twitch-follow-sync.ts), kick_ id
migration (07-05), prefixed-id emote locks (f80944bc).

state: v1.7.24 published. tri-link (twitch+kick+yt on one account) e2e-verified
07-14. kick send/auth rework live (4650278). branch merged to main, clean tree.

---

## P0 — open verification threads (close before next release)

- **tab-complete eats typed word** — remote search intermittently swallows the
  composer text (no chip, empty input). unreproducible with synthetic events;
  needs a trusted-input repro session. the one live product bug.
- **yt live-chat send e2e** — untested (channel wasn't live). blocks calling
  yt-only persona first-class; retest next time a linked yt channel is live.
- **opera gx cluster (wollip)** — blank overlay + video shoved to page bottom +
  expand-chat btn gone (ISOLATED runs, MAIN/SW dead) + site popout login fails.
  rule out uBlock; verify cross-browser; add physical expand btn.
- **kripp-mission leaked secret** — memory flags ROTATE; verify rotation
  actually happened, close the thread.

## P1 — product gaps (in-hand, no design questions)

- **i18n label backfill** — deferred from hydraaudit r2; missing en keys render
  raw key strings.
- **plus e2e payment test** — page/checkout/portal/webhook all live; nobody has
  run a real payment through it.
- **archive erasure follow-ups** — non-registered self-serve erasure + capture
  posture (policy shipped acf9ee29, these two remain).
- **landing monochrome redesign** — drop white/yellow wordmark, monochrome +
  semantic-ANSI like the ext debrand; confirm accent with mellen first.

## P2 — deferred tech debt (queued with reasons, don't rush)

- **omegaverify 79-confirmed queue** — remaining audited findings from 07-06;
  work through in focused passes.
- **yt-bridge design cluster** — deferred from 07-10 token burn; needs its own
  design session.
- **@-mention native-hook port** — dropdown shipped on ext surfaces; native
  twitch input hook deferred.
- **gql-data nonce gap** — MAIN→ISOLATED push carries no nonce; low-sev,
  documented, deferred.
- **moment detector CF exemption** — pending cloudflare rule.
- **heat anti-abuse** — P1 badges, P2 bot-score (grid P0 shipped).
- **ops/engagement** — W2/W3 pending (W1 deployed).
- **strip dev probes before release** — hs-dbg-emotes (c734a78) +
  hs-dbg-kick-tap (6da261e) are dev-only; confirm gating at release time.

## P3 — architecture (explicit sign-off before starting)

- **tier-2 refactor + god-file splits** — main.js split, safe leaves first
  (roadmap in ARCHITECTURE-REFACTOR-2026-06.md).
- **@heatsync/chat-core subtree** — kill the ext↔site drift-bug class;
  CHAT-CORE-EXTRACTION-PLAN.md.

---

## north star — design supremacy (unchanged)

beat X + reddit + 4chan combined on the social surfaces within the locked
aesthetic (btop density, square everything, ANSI-256, white-bg+black-text
hover/active, zero trendy motion, ≥13px cozette). out-platform, don't
out-emote. every tier above exists to clear runway for it.

## recommended sequence

1. P0 threads — cheap closes, they're all "verify + fix small".
2. P1 plus-payment + i18n — ship-complete debts.
3. north-star design track once the runway is clear.
