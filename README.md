# heatsync

custom emotes for twitch, kick, and youtube chat.

upload any image to [heatsync.org](https://heatsync.org), install the extension, and your emotes work in live chat — no approval queue, no slot limits. other heatsync users see them in real time.

## features

- **unlimited emote slots** — upload as many as you want, use them immediately
- **cross-platform** — same emotes work in twitch, kick, and youtube live chat
- **tab completion** — start typing an emote name, press tab, pick from the dropdown
- **emote picker** — button in chat input to browse and insert emotes
- **third-party emotes** — bttv, ffz, and 7tv emotes load automatically
- **zero-width stacking** — layer emotes on top of each other
- **multichat** — multiple channels in one panel with tabs, mentions, and IRC
- **emote blocking** — right-click any emote to hide it, syncs across devices
- **user muting** — temporarily or permanently hide users from chat
- **vi-mode** — vim keybindings for chat input
- **real-time sync** — websocket broadcasts emotes per channel instantly

## why heatsync

other emote extensions gate uploads behind approval queues, limit your slots, and keep emote sets separate per platform. heatsync gives you unlimited emotes with one upload — same set works on twitch, kick, and youtube.

| | **heatsync** | **ffz** | **7tv** | **bttv** |
|---|---|---|---|---|
| **platforms** | twitch, kick, youtube | twitch | twitch, kick, youtube | twitch, youtube (beta) |
| **emote upload** | instant, unlimited, no approval | 25 free slots, up to 500 paid, manual approval | instant, 1000 free slots | 15 free slots, up to 200 paid, auto-approved |
| **cross-platform emotes** | yes — one set everywhere | no | no — separate sets per platform | no — separate sets per platform |
| **multichat** | built-in (tabs, IRC, mentions, youtube) | no | no | no |
| **cosmetics** | ffz badges (multichat) | own badges, custom mod/VIP badges | own paints + badges | own badges |
| **third-party emotes** | loads bttv/ffz/7tv automatically | own only (bttv/7tv via opt-in add-ons) | loads bttv/ffz natively | own emotes only |

### technical comparison

every twitch emote extension uses react fiber walking — it's the only reliable way to modify twitch's react-owned DOM. the difference is how deep each one goes.

| | **heatsync** | **ffz** | **7tv** | **bttv** |
|---|---|---|---|---|
| **approach** | fiber walking + DOM injection (ffz-style) | deep react prototype patching | react vnode interception | DOM-first, react for data |
| **fiber walking** | `getFiber()` + `.return` chain | `Fine.getReactInstance()` | `getVNodeFromDOM()` | reads fiber, rarely writes |
| **render patching** | wraps `render()`, injects via DOM | systematic class prototype patching (core arch) | patches `render`, lifecycle, props interception | minimal — reads props, rarely patches |
| **MutationObserver** | chat container + polling fallback | component discovery + 500ms poll | `awaitComponents()` | **primary** mechanism (`DOMObserver` class) |
| **MAIN world injection** | yes — `document_start` before react mounts | no | no | no |
| **SPA nav handling** | hooks `history.pushState` at `document_start` (before twitch) | hooks react router fiber directly | hooks `RouterComponent.componentDidUpdate` | monkey-patches `window.history.pushState` |
| **own UI framework** | vanilla JS | custom module system | vue 3 (full SPA) | preact |
| **webpack hooking** | minimal — apollo mutations | yes — deep (`webpackChunktwitch_twilight`) | indirect via fiber | minimal — TMI constants only |
| **shadow DOM** | no | no | no | no |
| **HTML sanitization** | `escapeHtml()` on all user content | DOM `textContent` round-trip | vue template auto-escaping | `textContent`/`innerText` only, no innerHTML |
| **URL sanitization** | `safeUrl()` (https/http only) + CDN allowlist | none | coerced to `https://` via `new URL()` | CDN-only URLs, regex-strict |
| **postMessage origin** | validated (`location.origin` check) | **not validated** | not used | not used |

**heatsync's MAIN world injection is unique** — none of the others run at `document_start` in page context. this allows intercepting twitch internals before react mounts, which is impossible from a content script.

**bttv is the outlier** — it treats the DOM as its primary API and only dips into react to read data. ffz and 7tv patch react's render pipeline deeply, modifying component output directly. heatsync hooks render for injection points but primarily injects via DOM.

**security note** — all four extensions handle HTML escaping correctly (different techniques, same result). the key differentiator is URL sanitization: heatsync explicitly validates URL schemes and restricts emote CDN origins. ffz has no URL sanitizer and doesn't validate postMessage origins, meaning any cross-origin frame could manipulate user settings via its bridge API.

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
  ├── fetches 7tv/ffz/bttv emotes
  └── broadcasts updates to all twitch/kick/youtube tabs

content.js (injected per tab)
  ├── MutationObserver watches for new chat messages
  ├── processes each message: finds emote names, replaces with images
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

**render patching** — once you have the component, wrap its `render()` method. call the original, then use the render cycle as an injection point to attach UI elements via DOM. the hook ensures the extension re-injects whenever react re-renders the component.

**why not just modify the DOM?** react owns the DOM. `appendChild` gets removed on re-render. modified text nodes get overwritten. hooking render guarantees the extension gets a callback every time react updates, so injected elements are always restored.

**re-hooking** — twitch's SPA navigation unmounts and remounts components constantly. polling watches `location.href` for navigation changes, and a MutationObserver detects when react replaces the chat container. when either fires, the extension re-walks the fiber tree and re-patches.

**CSS order injection** — for elements that need specific positions in flex containers (badges before usernames), the extension uses CSS `order` properties instead of `insertBefore` calls that break when react reconciles.

**early injection** — `early-inject-main.js` runs at `document_start` in the MAIN world (page context, not extension sandbox). this executes before twitch's scripts load, allowing interception of internals before react mounts.

### message processing

1. content script starts MutationObserver on chat container
2. new message appears → observer fires → `processMessage()`
3. walks the message DOM, finds text nodes containing emote names
4. replaces text nodes with `<img>` elements pointing to CDN URLs
5. target: <5ms per message

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
  background.js              ← service worker: API, websocket, emote fetching
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

built for 24/7 continuous operation. every resource is tracked and cleaned up.

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
