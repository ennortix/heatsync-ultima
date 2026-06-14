# heatsync

Cross-platform multichat overlay for Twitch, Kick, and YouTube — every stream's chat in one panel.

- **multichat** — Twitch + Kick + YouTube live chat in one tabbed panel: per-channel tabs, per-platform filters, mentions, whispers. **no account required.**
- **7TV, BTTV, FFZ** — emotes, paints, badges render automatically; no account required
- **5000-slot personal emote inventory** — optional, free: upload at [heatsync.org](https://heatsync.org) and your emotes render in twitch + kick native chat and across the overlay, in any channel
- **auto-fill on send** — tab-complete a 7TV name or paste any chat emote, hit enter; the slot lands silently
- **one-click channel import** — pull every emote from any Twitch/Kick channel into your set
- profile cards, user muting, emote blocking, unified right-click menu, Twitch clip + mod commands from the input
- **light on your machine** — vanilla JS, zero runtime deps; capped chat buffer + DOM render cap hold memory steady across 8+ hour sessions. one-click low-RAM preset for weak or passively-cooled hardware

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
