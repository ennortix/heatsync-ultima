# Store Listings for heatsync extension

**Version:** 1.2.1
**Last Updated:** March 2026

## Firefox Add-ons (AMO)

**Name:** heatsync

**Summary (50 chars max):**
Custom emotes for Twitch, Kick, and YouTube chat

**Description:**
Use your heatsync emotes in Twitch, Kick, and YouTube live chat.

Upload any image to heatsync.org and this extension makes it work as an emote in chat. No slot limits, no approval queue. Other heatsync users see your emotes in real time.

What it does:
- Custom emotes in Twitch, Kick, and YouTube live chat
- Tab completion for emote names in chat input
- BTTV, FFZ, and 7TV emotes load automatically
- 7TV cosmetics: paint gradients and badges
- Zero-width emote stacking
- Multichat: multiple channels in one panel
- Click emotes to add them to your set
- Right-click any emote to block it (syncs across devices)
- Real-time sync via WebSocket

How to use:
1. Sign in at heatsync.org with Twitch or Kick
2. Upload emotes to your set
3. Install this extension
4. Open any Twitch, Kick, or YouTube live stream
5. Your emotes work in chat

No tracking, no ads, no data selling. Open source.

Source code: https://github.com/mellen9999/heatsync-extension

**Categories:**
- Social & Communication

**Tags:**
twitch, kick, youtube, emotes, chat, streaming, bttv, 7tv, ffz

**Support Email:**
mellen@heatsync.org

**Support URL:**
https://heatsync.org

**Privacy Policy URL:**
https://heatsync.org/privacy.html#extension

---

## Chrome Web Store

**Name:** heatsync

**Summary (132 chars max):**
Custom emotes for Twitch, Kick, and YouTube live chat. Unlimited slots, tab completion, multichat, BTTV/FFZ/7TV, real-time sync.

**Description:**
Use your heatsync emotes in Twitch, Kick, and YouTube live chat.

Upload any image to heatsync.org and this extension makes it work as an emote in chat. No slot limits, no approval queue. Other heatsync users see your emotes in real time.

What it does:
• Custom emotes in Twitch, Kick, and YouTube live chat
• Tab completion for emote names in chat input
• BTTV, FFZ, and 7TV emotes load automatically
• 7TV cosmetics: paint gradients and badges
• Zero-width emote stacking
• Multichat: multiple channels in one panel
• Click emotes to add them to your set
• Right-click any emote to block it (syncs across devices)
• Real-time sync via WebSocket

How to use:
1. Sign in at heatsync.org with Twitch or Kick
2. Upload emotes to your set
3. Install this extension
4. Open any Twitch, Kick, or YouTube live stream
5. Your emotes work in chat

No tracking, no ads, no data selling. Open source.

Source code: https://github.com/mellen9999/heatsync-extension

**Category:**
Social & Communication

**Language:**
English

**Privacy Policy URL:**
https://heatsync.org/privacy.html#extension

---

## Permission Justifications

**Chrome:**
- storage: Save emote set and encrypted auth token locally
- tabs: Send emote updates to all open Twitch/Kick/YouTube tabs
- Host permissions (twitch.tv, kick.com): Content scripts inject emotes into chat messages
- Host permissions (youtube.com): Content scripts inject emotes into YouTube live chat
- Host permissions (heatsync.org): Fetch emote set, authenticate, WebSocket sync
- Host permissions (betterttv, frankerfacez, 7tv): Load third-party emotes and cosmetics
- Host permissions (decapi.me): Resolve Twitch usernames to IDs for 7TV emote lookup

**Firefox (additional):**
- webRequest, webRequestBlocking: Intercept and redirect FFZ-style emote image URLs to correct CDN paths (scoped to static-cdn.jtvnw.net only)

---

## Screenshots Needed

1. Twitch chat with heatsync emotes visible
2. Kick chat with heatsync emotes visible
3. YouTube live chat with heatsync emotes visible
4. Tab completion dropdown
5. Emote picker panel
6. Right-click menu showing block option
7. Multichat panel with multiple channels

Screenshot size: 1280x800 or 640x400 minimum
