# reddit launch — posts + sequence (jun 2026)

positioning: lead with **viewer emote sovereignty** — your free 5000-slot inventory renders in any twitch/kick/youtube chat, in any channel. cross-platform multichat (no account needed to watch) is the share-hook for /m/ permalinks + the multi-stream crowd, not the lead for the store listing. (reddit drafts below can stay multichat-led — r/Twitch is the multi-stream audience — but the store/manifest/README lead with the wedge.)

## go/no-go gates
- **first-contact reliability** — GREEN (multichat/irc/emote rendering/8h memory all intact). one live smoke test before posting.
- **positioning / right-crowd** — applied to repo (store listing, README, this file). still must publish the updated CWS listing in the dev dashboard.
- **frictionless first 60s** — empty-state CTA wired; welcome.html CTA-demotion + auto-seed still pending.
- **survives a spike** — low risk by design (extension talks to twitch/kick IRC directly; a spike of installs that don't sign in never touches heatsync.org).

## launch sequence
1. **dry-run first** — post the build-story in a smaller, tooling-friendly sub (r/Twitch_Startup ~120k, or r/streaming) to test the message + catch any bug. one day.
2. **check the rules** — read r/Twitch/about/rules + r/kick/about/rules (self-promo allowed standalone vs weekly thread? karma/age gate?). comment genuinely on a few threads in each first (9:1 value rule).
3. **r/Twitch** (~1.8M, high removal risk) — post tue–thu ~9-11am or 6-9pm ET. **store link in your first comment, NOT the body.** be online to reply the first 1-2 hours.
4. **r/kick** — at least a few hours later (ideally next day), fresh title, never the same hour as r/Twitch (spam filter flags coordinated same-domain posts).
5. **second wave (only if wave 1 lands)** — r/Twitch_Startup, r/TwitchPromote (engage with others first), r/streaming. fresh title per sub.
6. **watch:** install delta per post · install-to-signin ratio (most installs NOT signing in and sticking = the no-account path working) · grafana for auth/emote-API errors · comments for "how do I see multichat?" confusion.

---

## DRAFT 1 — r/Twitch

**title:** i was sick of juggling 4 tabs to watch multiple streams, so i built a free cross-platform multichat (twitch + kick + youtube in one panel)

been a multi-stream watcher for years — main stream up, a couple others i half-follow, chat moving in all of them. the problem was never one platform, it was that they don't talk to each other. chatterino handles twitch beautifully but stops at the twitch border, and the second a creator i follow goes live on kick or does a youtube stream, i'm back to tab-roulette.

so i built the thing i wanted: one tabbed panel that pulls twitch, kick, and youtube chat together. you read and send in all of them from one place, your mentions surface across platforms (plus a twitch whispers tab), and 7tv / bttv / ffz emotes render everywhere (no account needed for that part).

honest disclaimers up front:
- i'm a solo dev, this is a passion project, not a company
- it's free, no ads, no account required to use the multichat
- source is open (MIT), so you can read exactly what it touches before installing
- it's brand new and i have ~zero users yet — i'd rather get real feedback from people who actually run multiple streams than launch quietly to nobody

what i'd genuinely like to know from this sub:
- if you watch/mod multiple streams, what's the part of multi-tab life that annoys you most? (that's what i want to fix next)
- what does chatterino do that you'd refuse to give up?

not trying to spam a link in the body — happy to drop it in a comment if a mod's cool with it / if people ask. mostly want to know if this solves a real pain for the multi-stream crowd or if i built something only i wanted.

**[first comment, post yourself right after]:** for anyone who wants to poke at it: it's a browser extension called heatsync — store link + open source on github. dropping links here rather than the body to stay on the right side of the rules.

---

## DRAFT 2 — r/kick

**title:** made a free tool that puts kick chat in the same panel as twitch + youtube — so you stop alt-tabbing when your streamers are live on different sites

one thing about following kick streamers: half the people i watch are split across kick and twitch, and i was constantly bouncing tabs to keep up with chat in both. native tools are all single-platform — chatterino is twitch-only, and nothing treats kick as a first-class citizen alongside the others.

so i built a multichat overlay that does: kick + twitch + youtube live chat in ONE tabbed panel. read and send in any of them without leaving the page, mentions surface across platforms (with a twitch whispers tab), and it renders 7tv / bttv / ffz emotes too (no account needed).

straight up:
- solo dev, free, no ads
- no account required to use the multichat
- open source (MIT) — you can read the whole thing before installing
- it's a browser extension; it overlays on the sites you already use, doesn't replace them
- it's brand new with basically no users yet, so i'm here for honest feedback more than downloads

kick-specific question for you all: what does kick chat do (or not do) that you wish a tool like this handled? kick's chat behaves differently from twitch's and i want to make sure it feels native here, not bolted on.

link: it's called heatsync — chrome web store + github (open source). [paste store url in-body if r/kick rules allow links; else move to a first comment.]

tear it apart — i'd rather hear it's missing something than hear nothing.
