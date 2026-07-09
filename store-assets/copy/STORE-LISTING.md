# heatsync — Store Listing Copy

---

## Name

heatsync

---

## Short Description

<!-- Must stay ≤ 132 characters. -->

twitch + kick + youtube chat in one panel. follow every stream from one place. your emotes work everywhere. open source.

---

## Detailed Description

watching more than one stream — or one streamer who simulcasts to twitch, kick, and youtube? heatsync pulls all of it into a single tabbed chat panel so you stop juggling browser windows. no account needed for the multichat — sign in only to save your own emotes.

multichat
- one panel for Twitch + Kick + YouTube live chat, side by side.
- per-channel tabs, per-platform filters, a mentions tab, and whispers in the same place.
- read and send to any platform without leaving the page.
- filter the live feed to a word — or to a single chatter — instantly, straight from the keyboard.
- profile cards on any username: recent messages, follow, whisper, mute, block, add channel, and a searchable chat-log archive.
- mute or block someone once and it applies across Twitch and Kick; client-side automod hides what you'd rather not see.
- streamer/mod tools from the input — one-click Twitch clip, /ban /timeout /unban /delete.
- optional vim-style keyboard control and emote tab-complete on every input.
- built for long sessions: stays light over 8+ hour streams.

works with what you already run
- renders 7TV, BTTV, and FFZ emotes, paints, and badges automatically — no account needed for that part.
- coexists cleanly with those extensions, so you don't have to choose. keep 7TV, add heatsync for the cross-platform chat and portable emotes it doesn't do.

light on your machine
- vanilla JavaScript, zero runtime dependencies — nothing heavy added to the page.
- chat history is capped in memory and on screen, so an all-day session holds steady instead of piling up.
- background tasks clean themselves up as they finish — no slow creep when a tab stays open for hours.
- a one-click low-RAM preset trims the heaviest features for weak or passively-cooled hardware.

emotes, everywhere (optional, free account)
- use any 7TV, BTTV or FFZ emote in every chat — native in Twitch, plus Kick and YouTube via the multichat overlay — whether or not the streamer enabled anything. up to 5000 in your personal set, free.
- tab-complete a name or paste any emote, hit enter — it lands in your set silently (oldest auto-collected one recycles at the cap, so you never run out).
- one-click import pulls every emote from any Twitch or Kick channel into your set.
- per-emote block list, synced server-side.

privacy + open source
- no analytics, no tracking, no data sold.
- open source: github.com/mellen9999/heatsync-extension
- privacy: heatsync.org/legal/privacy
- contact: mellen@heatsync.org

getting started
1. install, then open Twitch, Kick, or a YouTube live stream — the panel is there.
2. add channels across platforms; they all land in one place.
3. (optional) sign in at heatsync.org to upload emotes or import them from a channel.

---

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Save settings, emote inventory, and per-channel state |
| `unlimitedStorage` | Cache emote sets (7TV/BTTV/FFZ) without hitting the default 5 MB storage quota |
| `tabs` | Read the active tab URL to detect which platform and channel is open |
| `cookies` | Read platform auth tokens (Twitch, Kick) for IRC connection and API calls, and the heatsync.org account auth token for emote sync — same-site only, never exfiltrated |
| `alarms` | Schedule periodic background tasks (feed polling, token refresh) |
| `notifications` | Deliver browser notifications for chat mentions |
| `webRequest` + `webRequestBlocking` *(Firefox only)* | Required in Manifest V2 to attach auth headers to Twitch API requests |

---

## Host Permissions

These are every host the extension contacts. The list is derived directly from `src/manifests/chrome.json` (host_permissions) and `src/manifests/firefox.json` (permissions).

| Host | Purpose |
|---|---|
| `https://*.twitch.tv/*` | Run content scripts on Twitch; access native chat DOM |
| `https://api.twitch.tv/*` | Helix API — channel info, clips, user lookup, follow status |
| `https://static-cdn.jtvnw.net/*` | Twitch CDN — subscriber badges, channel avatars |
| `https://kick.com/*`, `https://*.kick.com/*` | Run content scripts on Kick; access chat and channel info |
| `https://www.youtube.com/*` | Run content scripts on YouTube Live |
| `https://heatsync.org/*` | heatsync API — account, emote inventory, feed, cosmetics |
| `https://api.betterttv.net/*` | BTTV emote data |
| `https://cdn.betterttv.net/*` | BTTV emote images |
| `https://api.frankerfacez.com/*` | FFZ emote data |
| `https://7tv.io/*` | 7TV API — emote data and EventSub |
| `https://events.7tv.io/*` | 7TV real-time emote set updates |
| `https://cdn.7tv.app/*` | 7TV emote images |
| `https://api.7tv.app/*` | 7TV v4 GraphQL — emote search on tab-complete fallback |
| `https://recent-messages.robotty.de/api/v2/recent-messages/*` | Load chat backlog on join |
| `https://logs.ivr.fi/*` | Optional: channel log search |
| `https://logs.spanix.team/*` | Optional: channel log search (fallback) |
| `https://logs.zonian.dev/*` | Optional: channel log search (fallback) |
| `https://decapi.me/*` | Optional: channel utility lookups (uptime, game) |
| `https://api.chatterino.com/badges` | Chatterino user badges |

---

## Categories

- Social & Communication
- Productivity

---

## Tags / Keywords

twitch, kick, youtube, chat, emotes, 7tv, bttv, ffz, overlay, multichat, whispers, streaming
