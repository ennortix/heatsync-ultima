# heatsync

your emote set in any chat. no streamer approval, no subscription.

- **5000 personal emote slots, free** — upload at [heatsync.org](https://heatsync.org), use them in any twitch/kick/youtube chat. real-time sync, no channel approval queue
- **others see your emotes too** — other heatsync users render your set in their chat automatically; no copy-paste, no "subscribe to use"
- **multichat** — twitch, kick, and youtube in one tabbed panel: live chat, mentions, whispers, social feed
- **7tv, bttv, ffz** — emotes, paints, badges render automatically. works without an account
- tab completion, emote picker with recent row, zero-width overlay (type `emote0` → tab), user muting, emote blocking, profile cards, unified right-click menu, twitch clip creation

## install

> chrome web store + firefox add-ons listings are in review — install manually below in 60 seconds

### chrome / edge / brave / arc / opera

1. download **[heatsync-chrome.zip](https://github.com/mellen9999/heatsync-extension/releases/latest/download/heatsync-chrome.zip)**
2. unzip it (double-click the file)
3. paste `chrome://extensions` into the address bar
4. flip on **developer mode** (top-right toggle)
5. click **load unpacked** → pick the unzipped folder
6. open twitch, kick, or a youtube live stream — done

### firefox

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
