# privacy policy

> **Canonical version:** https://heatsync.org/legal/privacy
> This file is a repo snapshot for offline review. The live version on
> heatsync.org is authoritative if the two ever differ.

**version 1.5 — may 2026**

## what we collect

the heatsync extension collects the following data:

- **authentication:** your heatsync account token (encrypted in browser storage)
- **user profile:** display name, user ID, multichat configuration
- **emotes:** your personal emote inventory and list of emotes you've blocked
- **channels:** names of Twitch, Kick, and YouTube channels you add to multichat
- **youtube video ids:** IDs of YouTube streams you join for real-time chat sync
- **ui preferences:** chat collapse state, tab order, visual settings
- **cosmetics:** cache of 7TV paints, FFZ/BTTV badges, and badge assignments for display purposes

**we do not collect:** chat message content, browsing history, clickstream data, device identifiers, analytics, or telemetry.

## how it's used

- **emote sync:** your token is sent to heatsync.org to fetch your emotes and sync blocks across devices
- **cosmetics:** emote names and user IDs are sent to 7TV, FFZ, and BTTV to fetch visual styles and badges
- **username resolution:** channel or streamer names are sent to decapi.me (Twitch public API wrapper) to resolve usernames to numeric IDs for cosmetic lookups
- **real-time chat:** channel names are sent to the heatsync WebSocket to enable live emote broadcasts
- **multichat routing:** YouTube video IDs help route live chat messages to the correct channel in your multichat panel

the extension acts on a third-party platform only when *you* explicitly initiate it — sending a chat message, setting your username color, creating a clip, following a channel, or (if you are a moderator) moderation actions like timeouts. it never acts autonomously or in the background, and never changes account settings you did not trigger.

## where it's stored

- **browser storage:** encrypted token, emote inventory, blocked emotes, channel names, video IDs, preferences — all stored in your browser's local extension storage using `browser.storage.local`
- **heatsync.org:** your account profile, emote inventory, and blocked emotes list (encrypted at rest)
- **7tv.io, frankerfacez.com, betterttv.net:** no storage — their APIs return cosmetics on-demand only
- **decapi.me:** no storage — stateless username→ID lookup
- **twitch, kick:** no data collected — the extension reads Twitch/Kick's public chat DOM only
- **www.youtube.com:** YouTube channel handles and video IDs are sent only to fetch live-page metadata (oembed) so live-chat messages route to the correct multichat tab — no message content or viewer data is collected

## third-party services

the extension communicates with the following services. **no personal data is sold or shared.**

| service | data sent | purpose |
|---------|-----------|---------|
| heatsync.org | auth token, emote names, blocked IDs | fetch and sync your emotes |
| heatsync.org | channel names | real-time emote broadcasts via WebSocket |
| heatsync.org | chat/feed link URLs you hover or that appear in feed posts | proxy link previews and embed metadata so the request isn't made from your IP |
| 7tv.io | twitch/kick user IDs, emote names | fetch paint gradients and badges |
| api.7tv.app | search query string | resolve unknown emote names typed in tab-complete |
| frankerfacez.com (FFZ) | emote names (batch query) | fetch badge metadata |
| betterttv.net (BTTV) | emote names (batch query) | fetch badge metadata |
| decapi.me | channel names (streamer usernames) | resolve to Twitch ID for cosmetics lookups |
| recent-messages.robotty.de | channel names | fetch recent Twitch chat history on join |
| logs.ivr.fi, logs.spanix.team, logs.zonian.dev | channel names + usernames | fetch extended Twitch chat history and per-user log search on join |
| api.chatterino.com | none (public GET, no personal data) | fetch Chatterino contributor badges |
| twitch.tv, kick.com | none — extension reads DOM only | display overlays in chat |
| www.youtube.com | YouTube channel handles + video IDs | fetch live-page metadata (oembed) to resolve channels and route live-chat messages |

## what we don't collect

we **explicitly do not** collect:

- chat message text or user messages
- your browsing history or URLs visited
- analytics, user behavior tracking, or telemetry
- third-party tracking pixels or cookies
- device hardware specs, OS info, or system details
- Twitch, Kick, or YouTube account credentials
- other extension usage data

## user rights

**login/logout:** sign in to heatsync.org via the extension popup. signing out clears your token and disables emote sync.

**data export:** visit heatsync.org to export your account data (GDPR Article 20 right to portability).

**delete account:** visit heatsync.org account settings to request permanent deletion of your profile, emotes, and blocks.

**right to object:** you can block individual emotes per-channel or globally via the extension UI.

## data retention

- **token:** stored until you sign out; deleted automatically when extension is uninstalled
- **emote cache:** refreshed every 60 seconds; not persisted between browser sessions beyond what extension storage retains
- **cosmetics cache:** global cosmetics refreshed every 24 hours; channel cosmetics refreshed on-demand
- **chat history:** multichat messages are cached in memory only during your session; not written to disk
- **server-side:** heatsync.org retains account data until you delete your account; see heatsync.org privacy policy for server retention details

## contact

**questions or concerns?** email **mellen@heatsync.org** or open a GitHub issue at [github.com/mellen9999/heatsync-extension](https://github.com/mellen9999/heatsync-extension/issues).

**report a privacy issue?** see [SECURITY.md](../SECURITY.md) for responsible disclosure.

## changes

we may update this policy. changes take effect immediately upon publication. continued use of the extension after changes means you accept the updated policy.
