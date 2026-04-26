# privacy policy

**version 1.0 — april 2026**

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

all processing is read-only. the extension does not modify your accounts or settings on any third-party platform.

## where it's stored

- **browser storage:** encrypted token, emote inventory, blocked emotes, channel names, video IDs, preferences — all stored in your browser's local extension storage using `browser.storage.local`
- **heatsync.org:** your account profile, emote inventory, and blocked emotes list (encrypted at rest)
- **7tv.io, frankerfacez.com, betterttv.net:** no storage — their APIs return cosmetics on-demand only
- **decapi.me:** no storage — stateless username→ID lookup
- **twitch, kick, youtube:** no data collected — the extension reads Twitch/Kick/YouTube's public chat DOM only

## third-party services

the extension communicates with the following services. **no personal data is sold or shared.**

| service | data sent | purpose |
|---------|-----------|---------|
| heatsync.org | auth token, emote names, blocked IDs | fetch and sync your emotes |
| heatsync.org | channel names | real-time emote broadcasts via WebSocket |
| 7tv.io | twitch user IDs, emote names | fetch paint gradients and badges |
| frankerfacez.com (FFZ) | emote names (batch query) | fetch badge metadata |
| betterttv.net (BTTV) | emote names (batch query) | fetch badge metadata |
| decapi.me | channel names (streamer usernames) | resolve to Twitch ID for cosmetics lookups |
| twitch.tv, kick.com, youtube.com | none — extension reads DOM only | display overlays in chat |

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

**questions or concerns?** email **mellen@heatsync.org** or open a GitHub issue at [github.com/heatsync/extension](https://github.com/heatsync/extension/issues).

**report a privacy issue?** see [SECURITY.md](../SECURITY.md) for responsible disclosure.

## changes

we may update this policy. changes take effect immediately upon publication. continued use of the extension after changes means you accept the updated policy.
