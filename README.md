# heatsync

custom emotes for twitch, kick, and youtube chat.

upload any image to [heatsync.org](https://heatsync.org), install the extension, and your emotes work in live chat — no approval queue, no slot limits. other heatsync users see them in real time.

## features

- **unlimited emote slots** — upload as many as you want, use them immediately
- **cross-platform** — same emotes work in twitch, kick, and youtube live chat (youtube via multichat panel)
- **tab completion** — start typing an emote name, press tab, pick from the dropdown. supports WYSIWYG mode (emotes render as images in the input)
- **emote picker** — button in chat input to browse, search, and insert emotes
- **third-party emotes** — bttv, ffz, and 7tv emotes load automatically
- **zero-width stacking** — layer emotes on top of each other
- **multichat** — multiple channels in one panel with tabs, mentions, whispers, social feed, and IRC
- **cosmetics** — 7tv paints + badges, ffz badges, bttv badges, chatterino badges on twitch chat
- **heat borders** — colored message borders based on heatsync heat tier, with glow and breathing animations at high tiers
- **emote blocking** — right-click emotes to hide them, syncs across devices for logged-in users
- **user muting** — temporarily or permanently hide users from chat
- **op injection** — posts from followed heatsync users appear inline in twitch/kick chat
- **vi-mode** — vim keybindings for chat input (twitch, kick, and multichat)
- **real-time sync** — websocket broadcasts emotes, stream events, mutes, and config across devices

## why heatsync

other emote extensions gate uploads behind approval queues, limit your slots, and keep emote sets separate per platform. heatsync gives you unlimited emotes with one upload — same set works on twitch, kick, and youtube.

| | platforms | emote upload | cross-platform | multichat | cosmetics | third-party emotes |
|---|---|---|---|---|---|---|
| **heatsync** | twitch, kick, youtube | instant, unlimited, no approval | one set everywhere | tabs, IRC, mentions, whispers, youtube | bttv/ffz/7tv/chatterino badges + 7tv paints | bttv/ffz/7tv automatic |
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
| **heatsync** | `escapeHtml()` + `textContent` round-trip | `safeUrl()` https/http only | validated (`location.origin` + `event.source`) |
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
  ├── fetches emotes from heatsync.org API (inventory, globals, channel, twitch native)
  ├── manages heatsync websocket (emotes, stream events, DMs, youtube relay, kick relay, mutes, config sync)
  ├── manages 7tv EventAPI websocket (real-time emote set updates + polling fallback)
  ├── fetches 7tv/ffz/bttv/chatterino emotes + cosmetics (badges, paints)
  ├── auth token encryption at rest (AES-GCM + PBKDF2)
  └── broadcasts updates to all twitch/kick/youtube/heatsync.org tabs

content.js (injected per tab)
  ├── MutationObserver watches for new chat messages
  ├── processes each message: finds emote names, replaces with images
  ├── applies cosmetics (badges + paints) to chat messages
  ├── communicates with background via chrome.runtime.sendMessage
  └── communicates with MAIN world via window.postMessage

early-inject-main.js (MAIN world, document_start)
  ├── intercepts twitch websocket (hermes event bus)
  ├── intercepts fetch (captures GQL hashes, auth tokens, integrity tokens)
  ├── hooks history.pushState/replaceState for SPA navigation
  ├── intercepts image src/srcset setters + Image constructor + createElement
  └── iterates webpack chunks for apollo mutation documents

multichat.js (built from src/multichat/)
  ├── multi-channel chat panel with tabbed interface
  ├── read-only twitch IRC + kick chat receive + authenticated IRC for sending
  ├── mention tracking, whispers, social feed, and notification counts
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

**DOM injection** — the primary injection mechanism. MutationObserver detects new chat messages, then the extension queries specific span elements (`.text-fragment`, `span.font-normal`), tokenizes text on whitespace, looks up each word in the emote map, and rebuilds the node content with emote wrapper elements via `replaceChildren()`. visual updates are batched through `requestAnimationFrame`.

**why not just modify the DOM?** react owns the DOM. `appendChild` gets removed on re-render. modified text nodes get overwritten. the MutationObserver fires on every react update, so injected elements are always restored.

**re-hooking** — twitch's SPA navigation unmounts and remounts components constantly. `early-inject-main.js` hooks `history.pushState` and `replaceState` at `document_start` and relays navigation events via `postMessage`. content.js also has a 5-second polling fallback for firefox edge cases. a separate interval watches for chat container replacement by comparing the current container against the last observed one.

**CSS order injection** — for elements that need specific positions in flex containers (badges before usernames), the extension uses CSS `order` properties instead of `insertBefore` calls that break when react reconciles.

**early injection** — `early-inject-main.js` runs at `document_start` in the MAIN world (page context, not extension sandbox). this executes before twitch's scripts load, allowing interception of browser APIs (WebSocket, fetch, history, Image constructor) before twitch initializes. the fetch hook captures GQL persisted query hashes, auth tokens, and integrity tokens from twitch's own requests.

### message processing

1. content script starts MutationObserver on chat container
2. new message appears → observer fires → node queued via `requestAnimationFrame` + `setTimeout`
3. `processMessage()` queries `.text-fragment` and `span.font-normal` elements
4. tokenizes text on whitespace, looks up each word in the emote map, rebuilds with emote wrapper spans containing `<img>` elements
5. cosmetics applied: badges inserted before username, 7tv paints set as inline styles (gradients, image URLs, or solid colors)
6. target: <5ms per message

### state

| store | refresh | scope |
|-------|---------|-------|
| `emoteInventory` | 60s polling + WS-triggered 2s debounce | user's heatsync emotes |
| `globalEmotes` | 1h (chrome.alarms) | bttv/ffz/7tv/twitch globals |
| `channelEmotesMap` | per-channel (30min TTL, 5min if empty) | channel-specific emotes (background) |
| `blockedEmotes` | event-driven (auth change, WS reconnect, block/unblock) | server-synced blocks |
| `localBlockedEmotes` | on change | local-only blocks for anonymous users |
| `mutedUsers` | on change | Map in background (username → expiry), Set in content |
| `blockedUsers` | on change | Set in both background and content |
| `bttvBadgeMap` / `ffzBadgeMap` / `chatterinoBadgeMap` | 24h | bulk badge lookups by twitch user ID |
| `userCosmeticsCache` | 30min TTL | 7tv per-user paints + badges (LRU, 500 cap) |

## build

```bash
bun run build.js           # both browsers
bun run build.js chrome    # chrome only
bun run build.js firefox   # firefox only
bun run build.js --package # build + zip for store submission
bun run build.js --deploy  # build + zip + rsync to server
```

reads source from `chrome/`, bundles shared modules from `src/lib/` (config, cleanup, utils, browser-api) into content scripts (wrapped in IIFE), outputs to `dist/{chrome,firefox}/`. multichat is assembled from `src/multichat/` modules. firefox uses a separate pre-authored mv2 manifest with gecko ID.

## project structure

```
chrome/                      ← source (edit here)
  manifest.json              ← deployed chrome mv3 manifest
  background.js              ← service worker: API, websocket, emote + cosmetic fetching
  content.js                 ← chat injection: DOM mutation, emote replacement, cosmetics
  multichat.js               ← built output (source in src/multichat/)
  youtube-content.js         ← youtube live chat support
  heatsync-button.js         ← emote picker panel (browse, search, import, settings)
  autocomplete-hook.js       ← twitch tab completion + emoji :shortcode: (MAIN world)
  kick-autocomplete-hook.js  ← kick tab completion + emoji :shortcode:
  autocomplete-loader.js     ← postMessage bridge to inject autocomplete into MAIN world
  chat-injector.js           ← injects heatsync posts from followed users into twitch/kick chat
  platform-detector.js       ← twitch vs kick vs youtube detection
  shared-utils.js            ← getFiber, findComponent, createLifecycle, window.HS
  early-inject-main.js       ← document_start MAIN world: websocket/fetch/history/image interception
  emoji-data.js              ← native emoji dataset
  vi-mode.js                 ← vim keybindings for chat input
  injected-message.css       ← styles for injected chat elements
  popup.html/js              ← toolbar popup
  options.html/js            ← settings page
  welcome.html               ← first install page
  _locales/                  ← i18n strings (11 languages)

src/
  lib/
    config.js                ← API URLs, timing constants, limits, selectors, CSS classes, z-index
    cleanup.js               ← tracked intervals/timeouts/observers/listeners for teardown
    utils.js                 ← escapeHtml, createElement, $/$$ selectors, getFiber, findComponent, logging
    browser-api.js           ← chrome.* vs browser.* compat
  manifests/
    chrome.json              ← mv3 manifest template
    firefox.json             ← mv2 manifest (separate file, not converted from chrome)
  multichat/                 ← multichat source modules
    main.js                  ← UI, tabs, channel management, youtube routing, mentions
    irc.js                   ← read-only twitch IRC client + kick chat receive (KickChat class)
    auth-irc.js              ← authenticated IRC for sending messages + whisper receive
    emotes.js                ← emote cache, lookup, processing, picker, block/inventory
    input.js                 ← chat input, autocomplete, send, reply state
    social.js                ← apiFetch client, feed, notifications, activity, heat tiers
    tooltips.js              ← toasts, emote tooltips, user profile cards, link previews
    twitch-api.js            ← twitch GQL proxy, badges, predictions, polls, rewards
    whispers.js              ← unified whisper + DM timeline
    kick-send.js             ← kick message sending via background relay
    bootstrap.js             ← lifecycle controller, cleanup utilities, debug log

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
| web requests | n/a (MV3 dropped blocking webRequest) | `webRequest` + `webRequestBlocking` |
| CSP format | `{ "extension_pages": "..." }` object | plain string |
| web_accessible_resources | array of `{ resources, matches }` | flat array of filenames |
| MAIN world | `"world": "MAIN"` | `"world": "MAIN"` (`strict_min_version: 128.0`) |

## license

[MIT](LICENSE)
