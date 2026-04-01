# heatsync

custom emotes for twitch, kick, and youtube chat.

upload any image to [heatsync.org](https://heatsync.org), install the extension, and your emotes work in live chat — no approval queue, no slot limits. other heatsync users see them in real time.

## features

- **unlimited emote slots** — upload as many as you want, use them immediately
- **cross-platform** — same emotes work in twitch, kick, and youtube live chat
- **tab completion** — start typing an emote name, press tab, pick from the dropdown
- **emote picker** — button in chat input to browse and insert emotes
- **third-party emotes** — bttv, ffz, and 7tv emotes load automatically
- **7tv cosmetics** — paints (username gradients) and badges render natively
- **zero-width stacking** — layer emotes on top of each other
- **multichat** — view multiple channels in one panel with tabs, mentions, and IRC
- **emote blocking** — right-click any emote to hide it, syncs across devices
- **user muting** — temporarily or permanently hide users from chat
- **vi-mode** — vim keybindings for chat input
- **real-time sync** — websocket connection broadcasts emotes per channel instantly

## install

### chrome

**from source:**
1. clone this repo
2. `bun run build.js chrome`
3. open `chrome://extensions`, enable developer mode
4. load unpacked → select `dist/chrome/`

### firefox

**from source:**
1. clone this repo
2. `bun run build.js firefox`
3. open `about:debugging#/runtime/this-firefox`
4. load temporary add-on → select `dist/firefox/manifest.json`

### edge

use the chrome build.

## how it works

### architecture

```
background.js (service worker)
  ├── fetches emotes from heatsync.org API
  ├── manages websocket connection (real-time emote broadcasts per channel)
  ├── fetches 7tv/ffz/bttv cosmetics (paints, badges)
  └── broadcasts to all twitch/kick/youtube tabs

content.js (injected per tab)
  ├── MutationObserver watches for new chat messages
  ├── processes each message: finds emote names, replaces with images
  ├── renders cosmetics: 7tv paint gradients, ffz/bttv badges
  └── communicates with background via chrome.runtime.sendMessage

multichat.js
  ├── multi-channel chat panel with tabbed interface
  ├── IRC client for direct twitch chat
  ├── mention tracking and notification counts
  └── youtube live chat integration per channel
```

### react hooking (ffz-style)

the extension works **with** react, not around it. this is the same approach FrankerFaceZ uses, and it's the only way to reliably modify twitch's UI without constant breakage.

**fiber walking** — every react-rendered DOM element has a `__reactFiber$` property pointing to its fiber node. `getFiber(element)` grabs this, then walks the `.return` chain to find the component instance that owns the element. this gives direct access to component props, state, and methods.

```js
// walk up the fiber tree to find a specific component
function findComponent(fiber, predicate) {
  let current = fiber
  while (current) {
    if (current.stateNode && predicate(current.stateNode)) {
      return current.stateNode
    }
    current = current.return
  }
  return null
}
```

**render patching** — once you have the component, you can wrap its `render()` method. call the original, inspect the react element tree it returns, and modify or inject elements before react commits them to the DOM. the component doesn't know anything changed.

**why not just modify the DOM?** because react owns the DOM. if you insert an element with `appendChild`, react will remove it on the next render. if you modify a text node, react will overwrite it. fiber hooking means your changes survive re-renders because they're part of the render output.

**re-hooking** — twitch's SPA navigation unmounts and remounts components. the extension uses a MutationObserver watching for chat container elements, with a polling fallback. when the container reappears, it re-walks the fiber tree and re-patches.

**DOM injection with CSS order** — for elements that need to appear in specific positions within flex containers (like badges before usernames), the extension inserts the element and uses CSS `order` properties instead of fragile `insertBefore` calls that break when react reconciles.

### message flow

1. page loads → content script starts MutationObserver on chat container
2. new chat message appears → observer fires
3. `processMessage()` walks the message DOM, finds text nodes containing emote names
4. text nodes are replaced with `<img>` elements pointing to emote CDN URLs
5. cosmetics are applied: paint gradients on usernames, badges before usernames
6. total processing time target: <5ms per message

### early injection

`early-inject-main.js` runs at `document_start` in the MAIN world (page context, not extension context). this executes before twitch's own scripts load, allowing interception of twitch internals before react mounts.

### state

| store | refresh | scope |
|-------|---------|-------|
| `emoteInventory` | 60s | user's heatsync emotes |
| `globalEmotes` | 24h | bttv/ffz/7tv globals |
| `channelEmotesMap` | per-channel | channel-specific emotes |
| `blockedEmotes` | on change | server-synced blocks |
| `mutedUsers` | on change | username → expiry map |

## build

```bash
bun run build.js           # both browsers
bun run build.js chrome    # chrome only
bun run build.js firefox   # firefox only
bun run build.js --package # build + zip for store submission
```

the build script reads source from `chrome/`, bundles shared modules from `src/lib/` into content scripts (wrapped in IIFE with `'use strict'`), and outputs to `dist/{chrome,firefox}/`. firefox gets a converted manifest (mv2 with gecko ID).

## file layout

```
chrome/                    ← source (edit here)
  background.js            ← service worker: emote fetching, websocket, cosmetics
  content.js               ← injected into twitch/kick: DOM mutation, emote replacement
  multichat.js             ← multi-channel chat panel
  youtube-content.js       ← youtube live chat support
  heatsync-button.js       ← emote picker in chat input
  autocomplete-hook.js     ← tab completion for emote names
  chat-injector.js         ← chat message interception
  platform-detector.js     ← twitch vs kick vs youtube detection
  shared-utils.js          ← fiber walking, react helpers
  early-inject-main.js     ← document_start injection (MAIN world)
  vi-mode.js               ← vim keybindings for chat input
  popup.html/js            ← toolbar popup
  options.html/js          ← settings page
  welcome.html             ← first install page

src/
  lib/                     ← shared modules (bundled at build time)
    browser-api.js         ← chrome.* vs browser.* compat
    utils.js               ← escapeHtml, debounce, throttle, waitForElement
  manifests/
    chrome.json            ← mv3 manifest
    firefox.json           ← mv2 manifest
  multichat/               ← multichat module source

dist/                      ← build output (gitignored)
```

## performance

built for 8+ hour streaming sessions. every resource is tracked and cleaned up.

- message processing must stay under 5ms per message
- memory growth must stay under 50MB over 8 hours
- all intervals, timeouts, and observers go through the cleanup system (`src/lib/cleanup.js`) for tracked teardown
- DOM selectors are cached, mutations are batched
- visual updates use `requestAnimationFrame`
- scroll and resize handlers are debounced

## manifest differences

| | chrome (mv3) | firefox (mv2) |
|--|-------------|---------------|
| background | `service_worker` | `scripts: [...]` |
| permissions | `host_permissions` separate | all in `permissions` |
| action | `action` | `browser_action` |
| MAIN world | `"world": "MAIN"` | supported since ff 109 |

## external APIs

| provider | endpoint | purpose |
|----------|----------|---------|
| heatsync | `GET /api/user/emotes` | user's emote inventory |
| heatsync | `wss://heatsync.org` | real-time emote broadcasts |
| 7tv | `POST https://7tv.io/v3/gql` | cosmetics (paints + badges) |
| ffz | `GET https://api.frankerfacez.com/v1/badges/ids` | badges |
| bttv | `GET https://api.betterttv.net/3/cached/badges` | badges |

## license

MIT
