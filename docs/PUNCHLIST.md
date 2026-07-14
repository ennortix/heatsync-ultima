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

- **multichat scroll overlap** — FIX SHIPPED 07-14 (68a4d3b), awaiting
  mellen's visual confirm in the yt popout. root cause: content-visibility:auto
  chat rows (v1.3.0 "virtual scrolling") + a recent chrome update = stale-paint
  smears on skipped→rendered flips; heals on hover (repaint) — layout was
  always correct (rig rect-sweeps clean, 4000+ frames). cv dropped, contain
  kept; site already dropped cv 07-12 independently. don't re-add cv to any
  chat-row surface.
- ~~**composer loses focus after send**~~ — CLOSED 07-14 (f423389 + e984a37):
  two-layer thief — sendMessage's own hideInputBar, then clearReplyState also
  hiding the bar (focus() can't land in a hidden bar). hide now only on
  explicit cancel (× / escape); rig-verified with auto-hide ON.
- ~~**tab-complete eats typed word**~~ — CLOSED 07-14 (8023281): root cause was
  a composer-rebuild race class (wysiwyg restore no-op, listener-attach gap,
  unguarded async remote insert); trusted-CDP rig verified 12/12 restores,
  0/70 fuzz eats.
- ~~**yt live-chat send e2e**~~ — VERIFIED 07-14: composer → bg relay →
  native yt chat delivery confirmed live (lofigirl X4V, @mellenpvp). bonus
  fix dd935e8: restricted chats (subscribers-only etc.) now toast yt's real
  reason instead of generic failure. still open (narrower): pure yt-only
  persona send — needs a test account with no twitch link.
- **opera gx cluster (wollip)** — 07-14: platform gap REFUTED (linux GX 133 +
  uBlock defaults: SW+MAIN+overlay all alive in local rig); hide-btn + restore
  pill already shipped and rig-verified. remaining = wollip-side bisect: GX
  built-in adblock → uBlock custom lists → reinstall ext. send him the steps.
- **kripp-mission leaked secret** — VERIFIED NOT ROTATED 07-14 (prod .env
  hash-identical to leaked value). mellen-gated: google cloud console rotation
  + update /opt/heatsync/app/.env + restart. local transcript copies redacted.

## P1 — product gaps (in-hand, no design questions)

- ~~**i18n label backfill**~~ — DONE 07-14 (b2b7c54): 334 en keys, settings
  labels/tips/placeholders + all toast strings through t(); verified live.
  deferred remainder (named): 79 section-heading strings + ~30 trivial
  single-word option captions — separate pass, low value.
- ~~**plus e2e payment test**~~ — CLEARED 07-14 by mellen's own sub: trial
  07-04 → paid renewal 07-08 (webhook + plus_events + expiry 08-11 all
  db-verified), portal opens live stripe session, checkout 409s double-subs.
  bonus: /plus now shows "plus active" + manage-first for subscribers
  (site 05e35b9d). untested (named): cancellation flow — same webhook pipe,
  stripe-side; verify whenever mellen actually cancels.
- **archive erasure follow-ups** — self-serve /erase SHIPPED 07-14 (fbe077ae:
  oauth-proof without an account, prod-verified e2e). remaining: capture
  posture (opt-out-by-default) — mellen design call. decision brief:
  - state: capture any channel a HS user watches; mitigations live = policy
    §1a disclosure, /erase (no account needed), owner delist, durable ledger
    + nightly cold scrub, 24h cache ceiling.
  - A) keep opt-out default — max archive/SEO moat; OverRustle-class risk now
    heavily mitigated (their fatal gap was NO recourse; ours is 1-click).
  - B) owner opt-IN for archiving — near-zero legal surface, kills the logs
    moat + seo loop.
  - C) hybrid — capture all, public log pages only for channels over a size
    threshold; long tail stays dark. complexity tax, fuzzy line.
  - rec: A, plus a tripwire — watch /erase usage + takedown-mail rate monthly;
    if a real streamer-community backlash forms, drop to C. revisit only on
    signal, not fear.
- ~~**landing monochrome redesign**~~ — stale entry: shipped 07-06 (a05ed639),
  prod-verified 07-14 (zero yellow; only semantic youtube-red remains).

## P2 — deferred tech debt (queued with reasons, don't rush)

- ~~**omegaverify 79-confirmed queue**~~ — DRAINED 07-14: re-verified the open
  tail against current code; 6/7 were already fixed by prior sessions, last
  real one (stale persisted kick/yt buffers never purged) fixed in 8a10828.
  yt own-echo swallow closed same pass (f728a39). remaining named deferrals
  stay deferred: kick self-mod double-notice, native-yt cross-platform emote
  merge, hidden-tab DOM shed (all fragile-surface, need their own sessions).
- **yt-bridge design cluster** — deferred from 07-10 token burn; needs its own
  design session.
- **@-mention native-hook port** — dropdown shipped on ext surfaces; native
  twitch input hook deferred.
- **gql-data nonce gap** — MAIN→ISOLATED push carries no nonce; low-sev,
  documented, deferred.
- **moment detector CF exemption** — pending cloudflare rule.
- **heat anti-abuse** — P1 badges, P2 bot-score (grid P0 shipped).
- **ops/engagement** — W2/W3 pending (W1 deployed).
- ~~**strip dev probes before release**~~ — CONFIRMED 07-14: all hs-dbg-*
  listeners sit behind `__HS_DEV_BUILD__` (esbuild DCE in packaged builds) and
  build.js refuses to ship if the identifier survives minify. structural, no
  per-release action needed.

## P3 — architecture (explicit sign-off before starting)

- **tier-2 refactor + god-file splits** — main.js split, safe leaves first
  (roadmap in ARCHITECTURE-REFACTOR-2026-06.md).
- **@heatsync/chat-core subtree** — kill the ext↔site drift-bug class;
  CHAT-CORE-EXTRACTION-PLAN.md.

---

## north star — design supremacy (IN PROGRESS 07-14)

beat X + reddit + 4chan combined on the social surfaces within the locked
aesthetic (btop density, square everything, ANSI-256, white-bg+black-text
hover/active, zero trendy motion, ≥13px cozette). out-platform, don't
out-emote.

07-14 opening moves:
- law audit across /, /live/hot, /chatter, /logs: HELD (0 motion, 0 rounded,
  paints-gradients legit). one violation: `chat-tile-group-label` @12px.
- **ssr vim keynav SHIPPED (site 3930a067)** — logs day pages, user log
  pages, /chatter now drive like the spa hot view: j/k/g/G, o open, y yank ¶,
  [/] pages, / search, ? help. clean-browser verified (white-invert select).
  the seo landing surfaces are now the only keyboard-first chat logs on the
  internet.
- deferred (named): logs index + channel-listing + /archive search keynav —
  their shared shells have no csp nonce plumbing (inline scripts would be
  blocked); plumb nonce through logsPageShell next pass. 12px label bump.
- note: mellen's browser has a dark-reader-class ext whose user-origin css
  eats background overrides — test visuals in a clean profile.

## recommended sequence

1. P0 threads — cheap closes, they're all "verify + fix small".
2. P1 plus-payment + i18n — ship-complete debts.
3. north-star design track once the runway is clear.
