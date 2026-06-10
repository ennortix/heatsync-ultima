# heatsync

Personal emote inventory + multichat overlay for Twitch, Kick, and YouTube.

- **5000-slot personal emote inventory** — upload at [heatsync.org](https://heatsync.org), use them in Twitch native chat and the multichat overlay (Kick + YouTube via the overlay)
- **auto-fill on send** — tab-complete a 7TV name or paste any chat emote, hit enter; the slot lands silently
- **cross-user rendering** — other heatsync users see your emotes in their chat on Twitch + via the multichat overlay
- **multichat** — Twitch + Kick + YouTube in one tabbed panel: live chat, mentions, whispers, social feed
- **7TV, BTTV, FFZ** — emotes, paints, badges render automatically; no account required
- tab completion, emote picker with recent row, zero-width overlay (type `emote0` → tab), user muting, emote blocking, profile cards, unified right-click menu, Twitch clip creation

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
