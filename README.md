# heatsync

emotes + multichat for twitch, kick, and youtube.

- **custom emotes** — upload at [heatsync.org](https://heatsync.org), use them in any twitch/kick/youtube chat. real-time sync, no channel approval
- **multichat** — twitch, kick, and youtube in one tabbed panel: live chat, mentions, whispers, social feed
- **7tv, bttv, ffz** — emotes, paints, badges render automatically. works without an account
- tab completion, emote picker, zero-width stacking, user muting, emote blocking

## install

```bash
bun run build.js chrome    # → dist/chrome/
bun run build.js firefox   # → dist/firefox/
bun run build.js --package # both + zip
```

- chrome: `chrome://extensions` → developer mode → load unpacked → `dist/chrome/`
- firefox: `about:debugging` → load temporary add-on → `dist/firefox/manifest.json`

## license

[MIT](LICENSE)
