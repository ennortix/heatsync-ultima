# heatsync punch list — 2026-07-18 (rev 3, post-1.7.29)

state: 1.7.29 on main, repo clean, all worktrees merged, tests green.
since rev 2: thread-view OP-fetch fix (the >>2a bug — /api/thread + media
absolutize + composer desync), lint gate cleared on touched files, automod
watches live (organic e2e pending), archive backfill + yt reply PROVEN.
rev 2's 1.7.27 gate is history — 1.7.29 shipped.

prod check tonight (20:xx): both workers up, redis healthy, disk fine.
BUT: active data loss (below). load 10 on 4 cores, 310Mi free.

---

## P0 — prod data integrity (FIXED same night — 359cca30, watches below)

- ~~archive ingest flush stall~~ — FIXED: root cause was max_wal_size=1GB
  → back-to-back checkpoints → FPW amplification → IO saturation → 1.2s
  inserts → one unbounded flush pass held flushRunning for hours. shipped:
  bounded drain (2000/pass) + crash requeue + prepare guard + 30min
  dead-man + regression test; pg tuned (wal 8GB, ckpt 15min, zstd).
  verified: 0 overflow warns, 18k inserts/min.
- ~~offload FAILED~~ — unit now 12h timeout + idle io; /usr/local/bin
  script was STALE (missing pgbouncer bypass) — synced. WATCH: 04:41 UTC
  run must complete the 78M-row w27 resume.
- **kick-reap 429 starvation** (carried) — pacer at 8000ms gaps, 10min
  backoff per channel; batch-cap fix known. likely feeds the load-10.
- **/heapstats refused** during check — verify route still up (admin/local?).
- NEW P1: bulk multi-row INSERT in flushRows (~100× flush headroom) —
  needs a real-db test harness first (tests mock sql).

## P0 — extension

- ~~render-storm "twitching"~~ — SHIPPED: scheduleRenderMessages()
  trailing debounce (80ms window, 400ms max-wait, channel/live-only
  fire guard); 5 irc.js hydration sites converted; chrome-verified,
  needs mellen's eyeball on next natural reload.
- ~~o7 emote-as-text~~ — root-caused + FIXED same night: collect POST
  failed silent (no emote_add_failed listener; auth empty right after
  ext reload) → toast wired; bare-word Enter now exact-match collects.
  deferred (named): retry-on-auth-restore queue. mellen: re-click o7 in
  picker while logged in — with the toast a failure is now visible.
- ~~bug-hunt pass, >>2a class~~ — DONE: 2-agent sweep found 7 siblings,
  all fixed + deployed (site 9c86aceb, ext 72f09c6): POST/WS media never
  absolutized (live images broken for every ext viewer) · /hot + /pinned
  media · ssr short >>refs dead text · bookmarked replies opened as
  orphan fake-OPs · bookmark linkify. plus the ~30min emote-refresh
  flash (TTL partial-broadcast race) — refreshes now broadcast once.
  WATCH: flash fix needs a 30min-open window to prove.

## watches (no code until they fire)

- automod organic e2e — 2 watches live (own channel + nl_kripp); next real
  hold completes it.
- scroll-smear recurrence — will-change fix holding; escalation ladder in
  rev 2 stands. never re-add content-visibility.
- prod 09:30/10:15 UTC jobs — verify both run clean 2 consecutive days.
- kick mode banner on a live mode flip.

## mellen-gated (blocked on human)

- **google oauth secret rotation** — STILL NOT ROTATED (leaked 07-05).
  cloud console + /opt/heatsync/app/.env + restart.
- kick picker channel-tab eyeball on a real kick page tab.
- chrome restart → verify hw video decode restored (chrome://gpu).
- play-approval execution on google email (playbook ready: banner,
  recruitment kit, 12×14d).

## P1 — product (in-hand)

- **plus discoverability** — no nav link to /plus anywhere; payment works,
  nobody can find it. ship BEFORE any growth push.
- capture-posture design call (opt-out default + erase-rate tripwire rec).
- native-tap resilience fallback kick/yt — #1 audit remainder, own session.
- cross-platform follow bugs (07-05, 3 named, unfixed).
- opera gx — send wollip the bisect steps.
- yt-only persona send e2e (needs unlinked test account).
- lint-debt sweep — daylight session, ~100 files, recipe in memory.

## growth track — world domination (GATED on prod green)

order matters: fix pipes → make findable → then shout.

1. prod stable 48h (archive lossless, offload clean, load sane).
2. plus nav link + archive SEO play #3 (per-channel best-of/leaderboard
   pages — programmatic, plays #1/#2 shipped). landing+/compare
   de-cringed 07-18: competitor table killed, real live panel — done.
3. **reddit/launch post** — NOT yet. posting while archive drops rows and
   load sits at 10/4-cores burns the one first impression. gate: prod
   green + plus findable. then it's time.
4. play store 12×14d on approval → production listing.
5. moments loop content cold-start needs real users — post drives this.

## P2 — deferred tech debt (carried from rev 2, unchanged)

- audit remainders ranked: bulk-ban multi-select · cross-channel search
  n/N · bot-command autocomplete · pronouns.
- perf quartet: eventsub whispers→SW · active-tab ordering ·
  reprocessEmoteTextInPlace freeze · native-badge epoch jank.
- twitch chat-mode GQL hashes (/slow /emoteonly /subscribers /unique).
- user_emotes.user_id VARCHAR migration.
- omegaverify P1 remainders: yt send any-tab fallback · cosmetics drift ·
  whisper echo-dedup · processEmotes double-escape.
- heat anti-abuse P1: badge-weighted heat · persist isFirstMsg · P2
  bot-score to retire ARCHIVE_SKIP_CHANNELS.
- W2/W3 megamission cluster · yt-bridge design · gql-data nonce ·
  moment CF exemption · stream-event flash probe (act on capture only).

## P3 — architecture (explicit sign-off before starting)

- tier-2 refactor + main.js god-split · @heatsync/chat-core subtree.

---

## recommended sequence

1. prod archive stall + dead offload (tonight — it's losing data).
2. render-storm debounce.
3. >>2a-class bug sweep.
4. plus nav link + lint sweep (daylight).
5. growth gate check → reddit post.
