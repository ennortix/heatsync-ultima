# Store Listing Copy: heatsync

Public store listings for Chrome Web Store and Firefox AMO.

---

## Name

**heatsync** (as specified in `src/manifests/chrome.json`)

---

## Short Description

### Option 1 (132 chars max)
Custom emotes for Twitch, Kick, and YouTube. 5000 slots, instant sync, tab completion, 7TV/BTTV/FFZ cosmetics, multichat.

### Option 2 (132 chars max)
5000 emote slots across Twitch, Kick, and YouTube. Instant sync, tab completion, multichat, 7TV/BTTV/FFZ cosmetics.

### Option 3 (132 chars max)
Your emotes on every stream. 5000 slots, instant sync. Twitch, Kick, YouTube. Multichat, badges, paints, real-time.

**Recommended:** Option 1 (most feature-dense, covers core value prop)

---

## Detailed Description (16,000 char limit)

### Opening Hook (2-3 sentences)
heatsync is a custom emote overlay for Twitch, Kick, and YouTube live chat. Upload images to heatsync.org (5000 slots per user) and they'll appear in chat across all platforms in real time — no approval queue. Built for streamers, mods, and chatters who want personality and control over their chat experience.

### Feature List (grouped by category)

#### Emotes
- **5000 slots, instant upload** — add any image, any format, any size. No approval queue, live within seconds.
- **Instant tab completion** — type emote names in chat to autocomplete and insert. Works on Twitch, Kick, and YouTube.
- **Emote sets** — group and save your emotes, apply entire sets with one click.
- **Undo/redo** — instantly revert chat message edits.
- **Restore removed emotes** — check your history tab to find and re-add deleted emotes.
- **Emote organization** — rename, move, and share emotes directly from the picker.
- **Import channel emotes** — one-click import of Twitch channel emotes into your set.

#### Social & Discovery
- **Multichat overlay** — combine Twitch, Kick, and YouTube into one tabbed panel. Separate tabs for live chat, mentions, whispers, trending, and a social feed.
- **Trending discovery** — see trending emotes, tags, and profiles in real time.
- **Social feed** — heat, bookmark, and react to posts from creators you follow.
- **Compose DMs** — send messages and replies directly from the extension popup.
- **Live channels** — see your followed channels and who's streaming in the popup.

#### User Tools & Profiles
- **User cards** — click any username to see profile, mod tools, followage, streaks, message history, and mod actions (timeout, ban, mod, vip, unmod).
- **Clip creation** — create Twitch clips directly from a user card.
- **Profile editing** — edit your heatsync profile (avatar, bio, social links) in the popup.
- **Bookmarks** — save creators and posts, access them anytime from the popup.
- **Referral codes** — generate and share your referral link to earn rewards.

#### Cosmetics & Style
- **7TV paints & badges** — load user styles (gradient paints, badges) automatically.
- **FFZ & BTTV badges** — support for all third-party badge sets.
- **Content safety filter sync** — automatically blocks NSFW and violence-tagged emotes if enabled.

#### Mod & Creator Tools
- **Emote blocking** — block specific emotes globally (server-synced for mods).
- **User muting** — temporarily or permanently mute users from any chat.
- **Channel-specific settings** — configure emotes, filters, and preferences per stream.
- **Leaderboards** — see top emote users and trending creators.

#### Cross-Platform Support
- **Twitch** — full support including clip creation, mod tools, and cosmetics.
- **Kick** — custom emotes, autocomplete, multichat, and mod tools.
- **YouTube** — live chat overlay with custom emotes and multichat tabs.

### Privacy & Open Source
- **No analytics, no tracking** — we don't collect or sell your data. Your emotes and activity stay between you and heatsync.org.
- **Open source** — full source code on GitHub (github.com/mellen9999/heatsync-extension). Audit the code yourself.
- **Privacy policy** — read our transparency statement at heatsync.org/legal/privacy.

### Getting Started
1. **Sign up** — go to heatsync.org, log in with Twitch or Kick.
2. **Upload emotes** — add images directly, or import from your channel.
3. **Use in chat** — click the heatsync button in any Twitch/Kick chat, or type emote names with tab completion on YouTube.
4. **Sync instantly** — your emotes appear for all heatsync users across Twitch, Kick, and YouTube in real time.

---

## Permissions Justification

### General Permissions

| Permission | Reason |
|-----------|--------|
| `storage` | Store user settings, emote lists, muted users, and preferences locally. |
| `unlimitedStorage` | Allow storage of large emote inventories without quota limits. |
| `tabs` | Query active tabs to detect which platform (Twitch/Kick/YouTube) is open. |
| `cookies` | Read Twitch/Kick authentication to verify user identity and channel context. |
| `alarms` | Schedule periodic tasks (emote sync every 60s, cosmetic refresh every 24h, WebSocket heartbeat). |
| `notifications` | Show push notifications for mentions, DMs, and trending emotes (with user permission). |

### Host Permissions

| Host | Reason |
|------|--------|
| `https://*.twitch.tv/*` | Inject emote replacement and cosmetics into Twitch chat. |
| `https://kick.com/*`, `https://*.kick.com/*` | Inject emote overlay and multichat on Kick live streams. |
| `https://www.youtube.com/*` | Inject emote picker and multichat into YouTube live chat. |
| `https://heatsync.org/*`, `https://www.heatsync.org/*` | Fetch user emote inventory, cosmetics, settings, and handle WebSocket connection. |
| `https://api.betterttv.net/*`, `https://cdn.betterttv.net/*` | Fetch BTTV emote and badge data. |
| `https://api.frankerfacez.com/*` | Fetch FFZ emote and badge data. |
| `https://7tv.io/*`, `https://events.7tv.io/*`, `https://cdn.7tv.app/*` | Fetch 7TV emotes, paints, badges, and live cosmetic updates. |
| `https://api.twitch.tv/*` | Query Twitch API for user IDs, channel info, and follow relationships. |
| `https://static-cdn.jtvnw.net/*` | Load Twitch user avatars and channel thumbnails. |
| `https://decapi.me/*` | Resolve Twitch usernames to user IDs (rate-limited, free service). |
| `https://api.chatterino.com/badges` | Fetch Chatterino badge data for community mods. |
| `https://recent-messages.robotty.de/api/v2/recent-messages/*` | Load recent chat history for context (justlog API). |

---

## Categories

### Chrome Web Store
- **Primary:** Productivity
- **Secondary:** Communication

### Firefox AMO
- **Category:** Social & Communication

---

## Tags / Keywords

heatsync, emote, twitch, kick, youtube, chat, overlay, multichat, custom emote, bttv, ffz, 7tv, cosmetic, badge, paint, streaming, mod tools, live chat, emote picker, tab completion, social feed

---

## Additional Notes

- **Target audience:** Twitch/Kick streamers, chatters, moderators, YouTube channel members with live streams.
- **Installation friction:** Users must sign up at heatsync.org (3 minutes), then extension auto-syncs emotes.
- **Privacy:** Extension is fully transparent. No tracking, ads, or third-party data sales. Open source for auditability.
- **Support:** heatsync.org has documentation, FAQ, and links to GitHub issues for bug reports and feature requests.
