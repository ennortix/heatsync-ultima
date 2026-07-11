# heatsync

your emotes in twitch and kick chat — any channel, no streamer approval, no sub. plus one multichat panel for twitch, kick + youtube.

**no trackers, no analytics, no third-party telemetry** — emotes and settings sync through heatsync's own servers, never to google, sentry, or any analytics company.

## features

- **emote sovereignty** — a free 5000-slot inventory ([one account](https://heatsync.org)) that follows you into twitch and kick native chat and the overlay — any channel, no streamer opt-in. tab-complete a 7TV emote and hit send; the slot fills silently. one click imports a channel's whole emote set.
- **multichat overlay** — twitch, kick, and youtube chat in one panel: per-channel tabs, per-platform filters, mentions, twitch whispers, resizable and dockable to any edge. no account needed to read.
- **7TV / BTTV / FFZ** — emotes, paints, and badges render automatically, channel and global. heatsync sits next to those extensions — keep them, and add the cross-platform chat and portable emotes they don't do.
- **keyboard-first input** — vim keybindings on the twitch, kick, and multichat inputs (normal/insert, motions, operators, `.` repeat), a wysiwyg emote composer, message history, reply threading, and an instant filter that narrows the live buffer by text or user.
- **moderation + profiles** — a hover mod toolbar (`/ban` `/timeout` `/unban` `/delete`), client-side automod, and mute-or-block that carries a user across twitch and kick. profile cards with socials, badges, and a paginated chat-log archive a click away. one-click twitch clips.
- **light on your machine** — vanilla js, zero runtime dependencies. a capped message buffer and dom render cap hold memory steady through long sessions. the render cap is adjustable down for weak or passively-cooled hardware.

## install

### chrome / edge / brave / arc / opera

**[install from the chrome web store](https://chromewebstore.google.com/detail/heatsync/afadollcanjpemaonbgnkhjddaebjeja)** — one click, auto-updates.

### firefox

**[install from firefox add-ons](https://addons.mozilla.org/firefox/addon/heatsync-chat/)** — one click, auto-updates.

alternative: download the AMO-signed **[heatsync-firefox.xpi](https://github.com/mellen9999/heatsync-extension/releases/latest/download/heatsync-firefox.xpi)** and open it with firefox — installs permanently.

## build from source

```bash
bun install
bun run build.js chrome    # → dist/chrome/
bun run build.js firefox   # → dist/firefox/
bun run build.js --package # both + signed zips + source zip
```

`--package` runs `node --check` on every output bundle, minifies, and emits `dist/heatsync-{chrome,firefox}-X.Y.Z.zip` plus `dist/heatsync-source-X.Y.Z.zip` for AMO review.

## release process

push a `v*` tag and `.github/workflows/release.yml` does the rest — build, package, attach versioned zips + versionless aliases + source zip to a new GitHub release. README install links resolve to the latest tag automatically.

## license

[MIT](LICENSE)
