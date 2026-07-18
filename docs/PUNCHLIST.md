# heatsync punch list — 2026-07-17 (rev 2, post-incident)

07-18 overnight: prod death-spiral fixed (5 causes, server e6eb8e05+):
per-msg WAL fsync storm → batched tx+async commit; chatter-rollup at
02:30 UTC (US prime) orphan-stacking → lock+30min cap+09:30 UTC;
unbounded archiver buffer → hard 20k bound; cold /logs day pages
parsing whole bot-farm days per crawler hit → semaphore+16MB cap+async
zstd; channel-overlap same → lock+cap+10:15 UTC. cgroup window
narrowed (fast OOM-restart over 502-wedge). admin /api/dev/heapstats
born. verify 09:30/10:15 UTC jobs run clean.

single prioritized backlog, rebuilt from verified state. supersedes 07-14 list:
its P0 verification threads closed (composer focus, tab-eat, yt send e2e,
scroll smear root-caused to chrome paint bug — will-change fix bf43650), P1
i18n + plus payment cleared, omegaverify queue drained.

state: 1.7.25 CWS/self-dist + 1.7.26 AMO published 07-15. since then (all
merged to main, tests green): tri-platform god-tier sweep (kick native emote
pool, yt reply @mention, kick mode banners, kick/yt archive backfill +
id-dedup fix), automod hold-queue (server 57c48263 deployed + ext), kick
page-side fallback tap, reload-freeze chunked-replay fix (merged 6f4e05a),
scroll-wheel volume, emote provider priority, bare-word emote suggest popup.
rumble parked (intel saved); aggregator recon: nobody competes viewer-side.

---

## P0 — release 1.7.27 gate (human-in-loop checks, then ship)

all code is on main; these are eyes-and-hands verifications before tagging.

- **automod hold-queue live e2e** — 07-18: relink DONE (+ scope-drop auth
  bug fixed 228a3f71), own-channel sweep bug fixed (2c47155 — gql
  isModerator=false for broadcaster skipped own channel), watch + hold/update
  webhooks LIVE and twitch-verified. sweep CONFIRMED working from active
  tabs (2 watches: own channel + nl_kripp via mod status) — the next
  automod hold in kripp's chat completes the e2e organically. footnotes:
  eswFetchSelfUserId gets helix/users 404 (whispers bug, investigate);
  background-only tabs stall startNetwork mid-join and never reach
  automod init (minor).
- ~~archive backfill~~ — PROVEN 07-18 (DOM ids ∩ /api/recent/kick/xqc,
  0 dupes). ~~yt reply @mention~~ — VERIFIED 07-18 on lofigirl real send
  (+ @@ double-mention bug found+fixed dccfff0). still open: kick mode
  banner on a live mode flip.
- **render-storm "twitching"** — NEW 07-18: hydration/tab-switch fires
  consecutive full renderMessages rebuilds across frames (worse now that
  replay ingest is chunked); mellen sees jumbled fly-in. fix: trailing
  debounce collapsing consecutive full rebuilds into one paint. FIRST CODE
  ITEM next session — fort-knox ui bar.
- **ext handler-guard hardening** — SHIPPED 07-18 (56fdc47): 29 window
  guards → module scope; 3 raw storage listeners now lifecycle-tracked.
- **kick channel emotes** — 07-18 synthetic check: picker on a twitch-host
  kripp tab shows NO channel/kick section (7tv/bttv/ffz/hs only) — either
  gap or needs kick-host context. eyeball on a real kick page tab.
- **scroll-smear visual confirm** — will-change fix (bf43650) killed the
  stale-paint artifact; if it recurs: per-emote will-change, then
  emoteAnimationMode off. never re-add content-visibility.
- **chrome restart** → verify hw video decode restored (chrome://gpu shows
  hardware-accelerated, renderer CPU drops on streams). flags rewritten 07-17.
- **kripp-mission leaked google secret** — STILL NOT ROTATED (verified 07-14).
  mellen-gated: cloud console rotation + /opt/heatsync/app/.env + restart.

## P1 — product gaps (in-hand)

- **archive capture posture** — the one open design call from 07-14:
  A) keep opt-out default (rec, + monthly /erase-rate tripwire) B) owner
  opt-in C) hybrid size-threshold. decide on signal, not fear.
- **native-tap resilience fallback kick/yt** — ranked #1 audit remainder
  (twitch has irc+eventsub+fallback; kick/yt native taps have no equivalent).
  big lift, own session.
- **opera gx (wollip)** — send him the bisect steps (GX adblock → uBlock
  lists → reinstall); platform gap already refuted in local rig.
- **plus discoverability** — no nav link to /plus anywhere; payment pipeline
  fully verified, nobody can find it.
- **cross-platform follow bugs (07-05)** — right-click follow broken for
  unregistered kick/yt users + silent propagation no-op. 3 named bugs, unfixed.
- **play-approval execution** — on google approval email: tester banner,
  recruitment kit, 12×14d tracking (playbook memory). AMO link swaps on
  AMO approval.
- **yt-only persona send e2e** — needs a test account with no twitch link.

## P2 — deferred tech debt (queued with reasons)

- audit remainders (ranked): bulk-ban multi-select · cross-channel search
  n/N · bot-command autocomplete · pronouns.
- perf quartet (strictly-better): eventsub whispers→SW · active-tab
  ordering · reprocessEmoteTextInPlace freeze · native-badge epoch jank
  (last one is the remaining channel-switch reflow).
- twitch chat-mode GQL hashes — /slow /emoteonly /subscribers /unique
  (/followers shipped, pattern proven).
- user_emotes.user_id VARCHAR migration (INTEGER crashes on shadow ids).
- yt-bridge design cluster · @-mention native-hook port · gql-data nonce ·
  moment CF exemption · heat anti-abuse P1 badges/P2 bot-score · ops W2/W3.
- stream-event flash — probe armed, act only on capture.
- warden-collect sudo cadence ≥60s (other session's collector, 2s storm).

## P3 — architecture (explicit sign-off before starting)

- tier-2 refactor + main.js god-split (ARCHITECTURE-REFACTOR-2026-06.md).
- @heatsync/chat-core subtree (CHAT-CORE-EXTRACTION-PLAN.md).

---

## north star — design supremacy (unchanged)

out-platform, don't out-emote. locked aesthetic held at 07-14 law audit.
deferred: logs-index/channel-listing/archive-search keynav (needs csp nonce
plumbing in logsPageShell), 12px group-label bump.

## recommended sequence

1. P0 gate → tag 1.7.27 (one release, full matrix first).
2. capture-posture call (decision, not code).
3. native-tap fallback session.
4. north-star track.
