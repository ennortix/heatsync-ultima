# heatsync

custom emotes for twitch, kick, and youtube chat.

upload any image to [heatsync.org](https://heatsync.org), install the extension, and your emotes work in live chat — no approval queue, no slot limits. other heatsync users see them in real time.

## what makes it different

- **unlimited emotes, instant upload** — no approval, no waiting, no slot caps
- **one emote set, three platforms** — same emotes on twitch, kick, and youtube
- **multichat** — multiple channels in one panel with tabs, mentions, whispers, social feed, IRC, and youtube live chat
- **full third-party support** — bttv, ffz, 7tv emotes + cosmetics (paints, badges) load automatically
- **zero-width stacking, tab completion, emote picker, vi-mode, user muting, emote blocking**

## install

### chrome / edge

1. clone → `bun run build.js chrome`
2. `chrome://extensions` → developer mode → load unpacked → `dist/chrome/`

### firefox

1. clone → `bun run build.js firefox`
2. `about:debugging#/runtime/this-firefox` → load temporary add-on → `dist/firefox/manifest.json`

## build

```bash
bun run build.js           # both browsers
bun run build.js chrome    # chrome only
bun run build.js firefox   # firefox only
bun run build.js --package # build + zip
bun run build.js --deploy  # build + zip + rsync to server
```

## license

[MIT](LICENSE)
