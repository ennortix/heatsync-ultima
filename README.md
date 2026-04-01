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
- **cosmetics** — 7tv paints + badges, ffz badges, bttv badges on twitch chat
- **emote blocking** — right-click emotes to hide them, syncs across devices
- **user muting** — temporarily or permanently hide users from chat
- **vi-mode** — vim keybindings for chat input
- **real-time sync** — websocket broadcasts emotes per channel instantly

## why heatsync

other emote extensions gate uploads behind approval queues, limit your slots, and keep emote sets separate per platform. heatsync gives you unlimited emotes with one upload — same set works on twitch, kick, and youtube.

| | platforms | emote upload | cross-platform | multichat | cosmetics | third-party emotes |
|---|---|---|---|---|---|---|
| **heatsync** | twitch, kick, youtube | instant, unlimited, no approval | one set everywhere | tabs, IRC, mentions, youtube | bttv/ffz/7tv badges + 7tv paints | bttv/ffz/7tv automatic |
| **ffz** | twitch | 50 free, 500 paid, manual approval | no | no | own badges, custom mod/VIP | own only (bttv/7tv opt-in add-ons) |
| **7tv** | twitch, kick, youtube | instant, 1000 free slots | separate sets per platform | no | own paints + badges | loads ffz natively |
| **bttv** | twitch, youtube (beta) | 30 free, 200 paid, auto-approved | separate sets per platform | no | own badges | own only |

### technical comparison

every twitch emote extension uses react fiber walking — it's the only reliable way to modify twitch's react-owned DOM. the difference is how deep each one goes.

| | approach | MAIN world | SPA nav | UI framework | webpack |
|---|---|---|---|---|---|
| **heatsync** | fiber walking + DOM injection | yes — `document_start` | hooks `history.pushState` before twitch | vanilla JS | minimal — apollo mutations |
| **ffz** | deep react prototype patching | no | hooks react router fiber | custom module system | deep (`webpackChunktwitch_twilight`) |
| **7tv** | react vnode interception | no | hooks `RouterComponent` update | vue 3 (full SPA) | indirect via fiber |
| **bttv** | DOM-first, react for data | no | monkey-patches `history.pushState` | preact | minimal — TMI constants |

| | HTML sanitization | URL sanitization | postMessage origin |
|---|---|---|---|
| **heatsync** | `escapeHtml()` on all user content | `safeUrl()` https/http only + CDN allowlist | validated (`location.origin`) |
| **ffz** | DOM `textContent` round-trip | none | varies |
| **7tv** | vue template auto-escaping | coerced to `https://` via `new URL()` | not used |
| **bttv** | `textContent`/`innerText` only, no innerHTML | CDN-only URLs, regex-strict | not used |

**heatsync's MAIN world injection is unique** — none of the others run at `document_start` in page context. this allows intercepting browser APIs (websocket, fetch, history) before twitch's scripts load.

**bttv is the outlier** — it treats the DOM as its primary API and only dips into react to read data. ffz and 7tv patch react's render pipeline deeply, modifying component output directly. heatsync walks fibers for data access but primarily injects via DOM and MutationObserver.

**security note** — all four extensions handle HTML escaping correctly (different techniques, same result). heatsync explicitly validates URL schemes and restricts emote CDN origins via an allowlist. all postMessage handlers check `location.origin` before processing.

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
  ├── manages heatsync websocket (real-time broadcasts per channel)
  ├── manages 7tv EventAPI websocket (real-time emote updates)
  ├── fetches 7tv/ffz/bttv emotes + cosmetics (badges, paints)
  └── broadcasts updates to all twitch/kick/youtube tabs

content.js (injected per tab)
  ├── MutationObserver watches for new chat messages
  ├── processes each message: finds emote names, replaces with images
  ├── applies cosmetics (badges + paints) to chat messages
  ├── communicates with background via chrome.runtime.sendMessage
  └── communicates with MAIN world via window.postMessage

early-inject-main.js (MAIN world, document_start)
  ├── intercepts twitch websocket (hermes event bus)
  ├── hooks history.pushState/replaceState for SPA navigation
  ├── intercepts image src/srcset setters
  └── iterates webpack chunks for apollo mutation documents

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

**DOM injection** — the primary injection mechanism. MutationObserver detects new chat messages, then the extension queries specific span elements (`.text-fragment`, `span.font-normal`), splits text on emote names, and rebuilds the node content with emote wrapper elements via `replaceChildren()`. visual updates are batched through `requestAnimationFrame`.

**why not just modify the DOM?** react owns the DOM. `appendChild` gets removed on re-render. modified text nodes get overwritten. the MutationObserver fires on every react update, so injected elements are always restored.

**re-hooking** — twitch's SPA navigation unmounts and remounts components constantly. `early-inject-main.js` hooks `history.pushState` and `replaceState` at `document_start` and relays navigation events via `postMessage`. content.js also has a 5-second polling fallback for firefox edge cases. a separate interval watches for chat container replacement by comparing the current container against the last observed one.

**CSS order injection** — for elements that need specific positions in flex containers (badges before usernames), the extension uses CSS `order` properties instead of `insertBefore` calls that break when react reconciles.

**early injection** — `early-inject-main.js` runs at `document_start` in the MAIN world (page context, not extension sandbox). this executes before twitch's scripts load, allowing interception of browser APIs (websocket, fetch, history) before twitch initializes.

### message processing

1. content script starts MutationObserver on chat container
2. new message appears → observer fires → node queued via `requestAnimationFrame` + `setTimeout`
3. `processMessage()` queries `.text-fragment` and `span.font-normal` elements
4. splits text content on emote names, rebuilds with emote wrapper spans containing `<img>` elements
5. cosmetics applied: badges inserted before username, 7tv paints set as inline gradient styles
6. target: <5ms per message

### state

| store | refresh | scope |
|-------|---------|-------|
| `emoteInventory` | 60s | user's heatsync emotes |
| `globalEmotes` | 24h | bttv/ffz/7tv globals |
| `channelEmotesMap` | per-channel | channel-specific emotes (background) |
| `blockedEmotes` | 60s (with inventory) | server-synced blocks |
| `mutedUsers` | on change | Map in background (username → expiry), Set in content |
| `bttvBadgeMap` / `ffzBadgeMap` | 24h | bulk badge lookups by twitch user ID |
| `userCosmeticsCache` | 30min TTL | 7tv per-user paints + badges (LRU, 500 cap) |

## build

```bash
bun run build.js           # both browsers
bun run build.js chrome    # chrome only
bun run build.js firefox   # firefox only
bun run build.js --package # build + zip for store submission
bun run build.js --deploy  # build + zip + rsync to server
```

reads source from `chrome/`, bundles shared modules from `src/lib/` into content scripts (wrapped in IIFE), outputs to `dist/{chrome,firefox}/`. multichat is assembled from `src/multichat/` modules. firefox gets a converted mv2 manifest with gecko ID.

## project structure

```
chrome/                      ← source (edit here)
  manifest.json              ← deployed chrome mv3 manifest
  background.js              ← service worker: API, websocket, emote + cosmetic fetching
  content.js                 ← chat injection: DOM mutation, emote replacement, cosmetics
  multichat.js               ← built output (source in src/multichat/)
  youtube-content.js         ← youtube live chat support
  heatsync-button.js         ← emote picker in chat input
  autocomplete-hook.js       ← twitch tab completion (MAIN world, document_end)
  kick-autocomplete-hook.js  ← kick tab completion
  autocomplete-loader.js     ← postMessage bridge to inject autocomplete into MAIN world
  chat-injector.js           ← OP post injection from followed users
  platform-detector.js       ← twitch vs kick vs youtube detection
  shared-utils.js            ← getFiber, findComponent, createLifecycle, window.HS
  early-inject-main.js       ← document_start MAIN world: websocket/fetch/history interception
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
    chrome.json              ← mv3 manifest template
    firefox.json             ← mv2 manifest template
  multichat/                 ← multichat source modules
    main.js                  ← UI, tabs, channel management
    irc.js                   ← read-only twitch IRC client
    auth-irc.js              ← authenticated IRC for sending messages
    emotes.js                ← emote rendering in multichat
    input.js                 ← chat input handling
    social.js                ← heat tiers, social features
    tooltips.js              ← user info tooltips
    twitch-api.js            ← twitch API, GQL proxy, badges, predictions, polls
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
| MAIN world | `"world": "MAIN"` | `"world": "MAIN"` (requires ff 128+) |

## license

[MIT](LICENSE)
