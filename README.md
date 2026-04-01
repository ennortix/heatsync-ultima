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
- **multichat** — multiple channels in one panel with tabs, mentions, and IRC
- **emote blocking** — right-click any emote to hide it, syncs across devices
- **user muting** — temporarily or permanently hide users from chat
- **vi-mode** — vim keybindings for chat input
- **real-time sync** — websocket broadcasts emotes per channel instantly

## install

### chrome / edge

1. clone this repo
2. `bun run build.js chrome`
3. open `chrome://extensions`, enable developer mode
4. load unpacked → select `dist/chrome/`

### firefox

1. clone this repo
2. `bun run build.js firefox`
3. open `about:debugging#/runtime/this-firefox`
4. load temporary add-on → select `dist/firefox/manifest.json`

## how it works

### architecture

```
background.js (service worker)
  ├── fetches emotes from heatsync.org API
  ├── manages websocket connection (real-time broadcasts per channel)
  ├── fetches 7tv/ffz/bttv emotes and cosmetics
  └── broadcasts updates to all twitch/kick/youtube tabs

content.js (injected per tab)
  ├── MutationObserver watches for new chat messages
  ├── processes each message: finds emote names, replaces with images
  ├── renders 7tv paint gradients and ffz/bttv badges
  └── communicates with background via chrome.runtime.sendMessage

multichat.js (built from src/multichat/)
  ├── multi-channel chat panel with tabbed interface
  ├── read-only + authenticated twitch IRC clients
  ├── mention tracking and notification counts
  └── youtube live chat integration per channel
```

### react hooking (ffz-style)

the extension works **with** react, not around it. this is the same approach [FrankerFaceZ](https://github.com/FrankerFaceZ/FrankerFaceZ) uses — the only way to reliably modify twitch's UI without constant breakage.

**fiber walking** — every react-rendered DOM element has a `__reactFiber$` property pointing into react's internal fiber tree. the extension grabs this entry point, then walks up the `.return` chain to find the component that owns the element. this gives direct access to component props, state, and methods.

```js
function getFiber(el) {
  if (!el) return null
  const key = Object.keys(el).find(k =>
    k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
  )
  return key ? el[key] : null
}

function findComponent(startEl, predicate, maxDepth = 50) {
  let fiber = getFiber(startEl)
  let depth = 0
  while (fiber && depth < maxDepth) {
    try {
      const inst = fiber.stateNode
      if (inst && predicate(inst, fiber)) {
        return { instance: inst, fiber }
      }
    } catch (e) {}
    fiber = fiber.return
    depth++
  }
  return null
}
```

**render patching** — once you have the component, wrap its `render()` method. call the original, inspect the react element tree it returns, modify or inject elements before react commits them to the DOM. the component doesn't know anything changed.

**why not just modify the DOM?** react owns the DOM. `appendChild` gets removed on re-render. modified text nodes get overwritten. fiber hooking makes changes survive because they're part of the render output.

**re-hooking** — twitch's SPA navigation unmounts and remounts components constantly. a MutationObserver watches for chat container elements with a polling fallback. when the container reappears, the extension re-walks the fiber tree and re-patches.

**CSS order injection** — for elements that need specific positions in flex containers (badges before usernames), the extension uses CSS `order` properties instead of `insertBefore` calls that break when react reconciles.

**early injection** — `early-inject-main.js` runs at `document_start` in the MAIN world (page context, not extension sandbox). this executes before twitch's scripts load, allowing interception of internals before react mounts.

### message processing

1. content script starts MutationObserver on chat container
2. new message appears → observer fires → `processMessage()`
3. walks the message DOM, finds text nodes containing emote names
4. replaces text nodes with `<img>` elements pointing to CDN URLs
5. applies cosmetics: paint gradients on usernames, badges injected before them
6. target: <5ms per message

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

reads source from `chrome/`, bundles shared modules from `src/lib/` into content scripts (wrapped in IIFE), outputs to `dist/{chrome,firefox}/`. multichat is assembled from `src/multichat/` modules. firefox gets a converted mv2 manifest with gecko ID.

## project structure

```
chrome/                      ← source (edit here)
  background.js              ← service worker: API, websocket, cosmetics
  content.js                 ← chat injection: DOM mutation, emote replacement
  multichat.js               ← built output (source in src/multichat/)
  youtube-content.js         ← youtube live chat support
  heatsync-button.js         ← emote picker in chat input
  autocomplete-hook.js       ← twitch tab completion
  kick-autocomplete-hook.js  ← kick tab completion
  autocomplete-loader.js     ← autocomplete initialization
  chat-injector.js           ← message interception layer
  platform-detector.js       ← twitch vs kick vs youtube detection
  shared-utils.js            ← getFiber, findComponent, react helpers
  early-inject-main.js       ← document_start MAIN world injection
  emoji-data.js              ← native emoji dataset
  vi-mode.js                 ← vim keybindings for chat input
  injected-message.css       ← styles for injected chat elements
  popup.html/js              ← toolbar popup
  options.html/js            ← settings page
  welcome.html               ← first install page

src/
  lib/
    browser-api.js           ← chrome.* vs browser.* compat
    utils.js                 ← escapeHtml, debounce, throttle, waitForElement
  manifests/
    chrome.json              ← mv3 manifest
    firefox.json             ← mv2 manifest
  multichat/                 ← multichat source modules
    main.js                  ← UI, tabs, channel management
    irc.js                   ← read-only twitch IRC client
    auth-irc.js              ← authenticated IRC for sending messages
    emotes.js                ← emote rendering in multichat
    input.js                 ← chat input handling
    social.js                ← follows, social features
    tooltips.js              ← user info tooltips
    twitch-api.js            ← twitch API interactions
    whispers.js              ← DM handling
    kick-send.js             ← kick message sending
    bootstrap.js             ← init and cleanup

dist/                        ← build output (gitignored)
```

## performance

built for 8+ hour streaming sessions. every resource is tracked and cleaned up.

- message processing stays under 5ms per message
- memory growth stays under 50MB over 8 hours
- all intervals, timeouts, and observers are tracked for teardown
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

## license

[MIT](LICENSE)
