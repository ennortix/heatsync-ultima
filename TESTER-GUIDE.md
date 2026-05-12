# heatsync extension beta test guide

thanks for helping test! here's what to do.

## install (manual, while store approvals are pending)

direct downloads from github releases — always grab the latest:

- chrome/edge/brave: https://github.com/mellen9999/heatsync-extension/releases/latest/download/heatsync-chrome.zip
- firefox: https://github.com/mellen9999/heatsync-extension/releases/latest/download/heatsync-firefox.xpi

### chrome / edge / brave / arc / opera
1. download `heatsync-chrome.zip` from the link above
2. unzip it (double-click the file)
3. paste `chrome://extensions` in the address bar
4. flip on **developer mode** (top-right toggle)
5. click **load unpacked** → pick the unzipped folder
6. you should see the heatsync icon in toolbar

### firefox
1. download `heatsync-firefox.xpi` from the link above
2. paste `about:debugging#/runtime/this-firefox` in the address bar
3. click **load temporary add-on…**
4. select the `.xpi` file (or its `manifest.json` if firefox blocks the xpi)
5. you should see the heatsync icon in toolbar

note: firefox unloads temporary add-ons on every restart — that's a firefox dev-mode limitation. once we're approved on addons.mozilla.org, it'll persist normally.

## building from source (reviewers)

reproducible build with bun (https://bun.sh):
```
bun install
bun run build.js --package
```
output: `dist/chrome/`, `dist/firefox/`, plus zips in `dist/`.

minification: esbuild minify runs automatically when `--package` (or `--deploy`) is passed; see build.js `minifyDistFile()`.

---

## setup

1. go to https://heatsync.org
2. login with twitch or kick
3. add some emotes to your set (or use the defaults)

---

## test checklist

open twitch.tv, kick.com, or a youtube live stream and try these:

### basic functionality
- [ ] emotes from your set appear in chat when you type them
- [ ] other heatsync users' emotes appear in chat
- [ ] emotes render as images (not just text)

### autocomplete
- [ ] start typing an emote name and press TAB
- [ ] dropdown should show matching emotes
- [ ] selecting one inserts it into chat

### blocking
- [ ] right-click any emote in chat
- [ ] click "block emote"
- [ ] that emote should disappear/stop rendering
- [ ] refresh page - emote should still be blocked

### cross-platform
- [ ] test on twitch.tv
- [ ] test on kick.com
- [ ] test on youtube live chat
- [ ] emotes work on all three

### multichat
- [ ] click the heatsync chat-toggle button — multichat panel opens
- [ ] add a second channel — tabs appear; switching between channels swaps message buffers
- [ ] mentions tab fills when you're tagged on any active channel
- [ ] whispers tab opens DMs from twitch users (right-click username → whisper)
- [ ] social feed tab loads posts; reactions, replies, bookmark all work
- [ ] popout button opens the panel in a standalone window

### performance
- [ ] open browser devtools (F12)
- [ ] go to Memory tab
- [ ] extension should use <50MB
- [ ] no lag when scrolling chat

---

## report issues

if something breaks:

1. open devtools (F12)
2. go to Console tab
3. screenshot any red errors
4. note what you were doing when it broke
5. send to mellen

format:
```
browser: chrome/firefox/edge
platform: twitch/kick
what happened: [describe]
expected: [what should happen]
screenshot: [attach if possible]
```

---

## known issues

- firefox: in dev mode, extension unloads on browser restart — that's a Firefox
  "temporary add-on" limitation, not a heatsync bug. Once installed from AMO
  it persists normally.
- youtube: only works in live chat (not regular comments). live_chat popout
  also supported.

---

## uninstall

### chrome
1. go to `chrome://extensions`
2. find heatsync
3. click Remove

### firefox
1. go to `about:addons`
2. find heatsync
3. click Remove

---

thanks again for testing!
