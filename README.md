# heatsync

your own emotes on every twitch, kick + youtube chat — no streamer approval, no sub. plus a multichat panel for all three.

## features

- **emote sovereignty** — a free 5000-slot inventory (one free account at [heatsync.org](https://heatsync.org)) renders in twitch + kick native chat and across the overlay, in any channel — whether or not the streamer enabled anything. tab-complete a 7TV name or paste any emote, hit enter; the slot lands silently. one click imports every emote from a channel.
- **multichat overlay** — twitch + kick + youtube live chat in one tabbed panel: per-channel tabs, per-platform filters, mentions, whispers, resizable + dockable to any edge. no account required to watch.
- **7TV / BTTV / FFZ** — emotes, paints, and badges render automatically. coexists with those extensions — keep 7TV, add heatsync for the cross-platform chat and portable emotes it doesn't do.
- **power-user input** — vim keybindings on every chat input (normal/insert, motions, operators, `.` repeat), wysiwyg emote composer, message history, reply threading, and instant `/`-filter of the live buffer by text or user.
- **moderation + profiles** — hover mod toolbar (`/ban` `/timeout` `/unban` `/delete`), client-side automod, user mute/block synced across twitch↔kick, btop-style profile cards with a paginated chat-log archive, one-click twitch clips.
- **light on your machine** — vanilla js, zero runtime deps; capped chat buffer + dom render cap hold memory steady across 8+ hour sessions. one-click low-RAM preset for weak or passively-cooled hardware.

## install

### chrome / edge / brave / arc / opera

**[install from the chrome web store](https://chromewebstore.google.com/detail/heatsync/afadollcanjpemaonbgnkhjddaebjeja)** — one click, auto-updates.

### firefox

firefox add-ons listing is in review — install manually in 60 seconds:

1. download **[heatsync-firefox.xpi](https://github.com/mellen9999/heatsync-extension/releases/latest/download/heatsync-firefox.xpi)**
2. paste `about:debugging#/runtime/this-firefox` into the address bar
3. click **load temporary add-on…** → pick the `.xpi` file
4. open twitch, kick, or a youtube live stream — done

firefox unloads temporary add-ons on restart — will become one-click once approved on addons.mozilla.org

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
