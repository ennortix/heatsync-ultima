/**
 * Heatsync MultiChat - FFZ-style React-aware implementation
 *
 * KEY PRINCIPLE: Work WITHIN React, not around it.
 * - Never manipulate DOM after React renders
 * - Hook into React components and modify render output
 * - Use forceUpdate() to trigger re-renders
 * - Inject UI as React children, not DOM insertions
 */

(function() {
  'use strict';

  const STORAGE_KEY = 'heatsync_multichat';
  const LOG_PREFIX = '[heatsync-mc]';

  // Safe runtime.sendMessage wrapper (context invalidation guard, Firefox-compatible)
  function safeSendMessage(message) {
    try {
      return api.runtime.sendMessage(message).catch(e => {
        log('sendMessage failed:', e.message)
        return { ok: false, error: e.message }
      })
    } catch (e) {
      log('sendMessage failed:', e.message)
      return Promise.resolve({ ok: false, error: 'context invalidated' })
    }
  }

  // State
  let config = { channels: [], enabled: true };
  let currentTab = 'feed';
  let liveChannel = null;        // override channel for live tab (null = use URL channel)
  let liveChannelSet = new Set(); // channels currently live (lowercase twitch names)
  let irc = null;
  let kickChat = null;
  let currentUsername = null;
  let chatRoomComponent = null;
  let originalRender = null;
  let tabBarElement = null;
  let overlayElement = null;
  let inputBarElement = null;  // Separate input bar (always visible)
  let pendingMessage = '';     // Persists across tab switches
  let isHooked = false;
  let tabPosition = 'top'; // 'top', 'right', 'bottom', 'left'
  let resizeObserver = null; // Tracks overlay top sync observer

  // Muted users (right-click to hide) — loaded async from chrome.storage.local
  let mutedUsers = new Set();

  // Buffers
  const mentionsBuffer = [];
  const MAX_BUFFER = 500;

  let isKick = location.hostname.includes('kick.com');
  const hostPlatform = isKick ? 'kick' : location.hostname.includes('youtube.com') ? 'yt' : 'twitch';

  // Scoped emote wrapper query (avoids full-document scan)
  function queryEmoteWrappers(emoteName) {
    const scope = document.getElementById('hs-mc-overlay') || document
    return scope.querySelectorAll(`.hs-mc-emote-wrapper[data-emote-name="${CSS.escape(emoteName)}"]`)
  }

  // Batch-remove excess children using a Range (single reflow instead of N)
  function trimChildren(el, limit) {
    const excess = el.children.length - limit
    if (excess > 0) {
      const range = document.createRange()
      range.setStartBefore(el.firstChild)
      range.setEndBefore(el.children[excess])
      range.deleteContents()
    }
  }

  let mentionsSeenCount = 0; // Track how many mentions user has seen

  // Per-channel YouTube: messages and links
  const channelYtMessages = new Map();  // channelTabId → message[]
  const youtubeLinks = new Map();       // channelTabId → { url, videoId, channelName }

  // YouTube global state (per-channel only now — global removed)


  // Username cache for tab completion
  const usernameCache = new Set();
  // Username → color map for @mention coloring (LRU-bounded)
  const knownColors = new Map();
  // Avatar URL cache: username → CDN URL (fetched from decapi)
  const avatarCache = new Map()
  const avatarFetching = new Set() // prevent duplicate fetches
  function fetchAvatar(username) {
    const key = username.toLowerCase()
    if (avatarCache.has(key) || avatarFetching.has(key)) return
    avatarFetching.add(key)
    fetch(`https://decapi.me/twitch/avatar/${encodeURIComponent(key)}`, { credentials: 'omit' })
      .then(r => r.ok ? r.text() : null)
      .then(url => {
        avatarFetching.delete(key)
        if (!url || !url.startsWith('https://')) return
        avatarCache.set(key, url.trim())
        if (avatarCache.size > 500) {
          avatarCache.delete(avatarCache.keys().next().value)
        }
        // Update any visible avatar placeholders
        if (avatarsEnabled) {
          document.querySelectorAll(`.hs-mc-avatar[data-user="${CSS.escape(key)}"]`).forEach(img => {
            img.src = avatarCache.get(key)
          })
        }
      })
      .catch(() => avatarFetching.delete(key))
  }

  // Stream event user colors — login → color (populated from server on connect)
  const streamColorMap = new Map();


  // Stream events persistence — survives tab switches AND page refresh
  const STREAM_EVENTS_KEY = 'hs_stream_events';
  const STREAM_EVENTS_MAX = 200;
  let streamEventsLoaded = false;

  // Inject stream events into IRC buffers + activityEvents (deduped)
  // recentOnly: only inject events <15min old into chat buffers (on reload)
  function injectStreamEventsIntoBuffers(events, recentOnly = false) {
    const liveCh = getLiveChannel()
    const liveBuffer = liveCh ? irc?.channels?.get(liveCh) : null
    const chatCutoff = recentOnly ? Date.now() - 900000 : 0 // 15min
    let added = 0

    for (const evt of events) {
      const ch = evt.channel
      if (!ch) continue

      const injectToChat = !recentOnly || (evt.time && evt.time > chatCutoff)

      // Inject into live buffer only if recent enough
      if (injectToChat && liveBuffer) {
        const existing = liveBuffer.getAll()
        const isDupe = existing.some(m => m.type === 'stream-event' && m.text === evt.text)
        if (!isDupe) { liveBuffer.push(evt); added++ }
      }

      // Also inject into the matching channel buffer if different from live
      if (injectToChat && ch !== liveCh) {
        const buffer = irc?.channels?.get(ch)
        if (buffer) {
          const existing = buffer.getAll()
          const isDupe = existing.some(m => m.type === 'stream-event' && m.text === evt.text)
          if (!isDupe) buffer.push(evt)
        }
      }

      // Always push to activityEvents regardless of age
      pushActivityEvent(evt)
    }
    return added
  }

  async function loadStreamEvents() {
    try {
      const data = await api.storage.local.get(STREAM_EVENTS_KEY)
      const events = data[STREAM_EVENTS_KEY]
      if (!Array.isArray(events) || events.length === 0) return
      const cutoff = Date.now() - 86400000 // 24h expiry
      const valid = events.filter(e => e.time > cutoff)

      injectStreamEventsIntoBuffers(valid, true)

      // Prune expired from storage
      if (valid.length < events.length) {
        await api.storage.local.set({ [STREAM_EVENTS_KEY]: valid })
      }
      streamEventsLoaded = true
    } catch {}
  }

  // Queued storage writer — prevents concurrent read-modify-write races
  let saveQueue = Promise.resolve()

  async function saveStreamEvent(evt) {
    saveQueue = saveQueue.then(async () => {
      try {
        const data = await api.storage.local.get(STREAM_EVENTS_KEY)
        const events = data[STREAM_EVENTS_KEY] || []
        // Dedup by text before saving
        if (!events.some(e => e.text === evt.text)) {
          events.push(evt)
        }
        // Prune old events (keep last STREAM_EVENTS_MAX)
        if (events.length > STREAM_EVENTS_MAX) events.splice(0, events.length - STREAM_EVENTS_MAX)
        await api.storage.local.set({ [STREAM_EVENTS_KEY]: events })
      } catch {}
    })
    return saveQueue
  }

  async function saveStreamEventsBatch(evts) {
    saveQueue = saveQueue.then(async () => {
      try {
        const data = await api.storage.local.get(STREAM_EVENTS_KEY)
        const events = data[STREAM_EVENTS_KEY] || []
        const existingTexts = new Set(events.map(e => e.text))
        for (const evt of evts) {
          if (!existingTexts.has(evt.text)) {
            events.push(evt)
            existingTexts.add(evt.text)
          }
        }
        if (events.length > STREAM_EVENTS_MAX) events.splice(0, events.length - STREAM_EVENTS_MAX)
        await api.storage.local.set({ [STREAM_EVENTS_KEY]: events })
      } catch {}
    })
    return saveQueue
  }


  // Dedup: track recent server-sourced YouTube messages to skip content-script duplicates

  // Normalize YouTube URL — accepts full URLs or bare username
  const normalizeYtUrl = (raw) => {
    // Bare username (no slashes, no dots) → /@name/live
    if (/^@?[\w-]+$/.test(raw)) {
      const name = raw.startsWith('@') ? raw.slice(1) : raw
      return 'https://www.youtube.com/@' + name + '/live'
    }
    try {
      const u = new URL(raw)
      const v = u.searchParams.get('v')
      if (v) return 'https://www.youtube.com/watch?v=' + v
      const liveMatch = raw.match(/\/live\/([^?&\/]+)/)
      if (liveMatch) return 'https://www.youtube.com/live/' + liveMatch[1]
      const shortMatch = raw.match(/youtu\.be\/([^?&]+)/)
      if (shortMatch) return 'https://www.youtube.com/watch?v=' + shortMatch[1]
    } catch {}
    return raw
  }

  // ============================================
  // REACT UTILITIES (FFZ-STYLE)
  // ============================================

  /**
   * Find the chat room container component
   */
  function findChatRoomComponent() {
    // Try multiple starting points (including popout chat selectors)
    const selectors = [
      '[class*="chat-room"]',
      '[class*="stream-chat"]',
      '[data-test-selector="chat-room-component"]',
      '[data-a-target="chat-room-component"]',
      '[class*="chat-shell"]',
      '.chat-room'
    ];

    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;

      // Look for component with render method and chat-related props
      const result = findComponent(el, (inst, fiber) => {
        // Check if this is a class component with render
        if (typeof inst?.render !== 'function') return false;

        // Check fiber type name for chat-related components
        const typeName = fiber?.type?.displayName || fiber?.type?.name || '';
        if (typeName.toLowerCase().includes('chat')) return true;

        // Check for chat-related props
        if (inst.props) {
          const propStr = JSON.stringify(Object.keys(inst.props));
          if (propStr.includes('channel') || propStr.includes('room')) return true;
        }

        return false;
      }, 30);

      if (result) return result;
    }

    return null;
  }

  // ============================================
  // UI CREATION (React-compatible elements)
  // ============================================

  function createTabBar() {
    const container = document.createElement('div');
    container.id = 'hs-mc-tabbar';
    // Static hardcoded tab buttons — no user input, safe innerHTML
    container.innerHTML = `
      <button class="hs-mc-tab active" data-tab="feed">feed</button>
      <button class="hs-mc-tab" data-tab="whispers">whispers</button>
      <button class="hs-mc-tab" data-tab="mentions">mentions</button>
      <button class="hs-mc-tab" data-tab="live">live</button>
      <button class="hs-mc-tab" data-tab="add">+</button>
      <div class="hs-mc-tab-utils">
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-rotate" data-tab="rotate" title="rotate tabs (T)">T</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-font-btn" data-font-dir="-1" title="smaller text">A-</button>
        <button class="hs-mc-tab hs-mc-util-btn hs-mc-font-btn" data-font-dir="1" title="larger text">A+</button>
        <button class="hs-mc-tab hs-mc-util-btn" data-tab="settings" title="settings">\u2699</button>
      </div>
    `;

    // Event delegation for tab clicks
    container.addEventListener('click', (e) => {
      const tab = e.target.closest('.hs-mc-tab');
      if (!tab || tab.classList.contains('hs-mc-font-btn')) return;

      const tabId = tab.dataset.tab;
      log('Tab clicked:', tabId);
      if (tabId === 'add') {
        switchTab('add');
      } else if (tabId === 'rotate') {
        rotateTabPosition();
      } else if (tabId === 'live') {
        showLiveChannelPicker(tab);
      } else {
        switchTab(tabId);
      }
    });

    // Font size controls
    container.addEventListener('click', (e) => {
      const fontBtn = e.target.closest('.hs-mc-font-btn');
      if (!fontBtn) return;
      const dir = parseInt(fontBtn.dataset.fontDir);
      const msgsEl = document.getElementById('hs-mc-messages');
      if (!msgsEl) return;
      const current = parseInt(getComputedStyle(msgsEl).fontSize) || 13;
      const next = Math.max(10, Math.min(22, current + dir));
      msgsEl.style.setProperty('--hs-chat-font', next + 'px');
      localStorage.setItem('heatsync-chat-font-size', next);
    });

    // Right-click channel tabs → context menu (edit youtube / remove)
    container.addEventListener('contextmenu', (e) => {
      const tab = e.target.closest('.hs-mc-tab');
      if (!tab) return;
      const tabId = tab.dataset.tab;
      const reserved = ['live', 'feed', 'mentions', 'whispers', 'add', 'rotate', 'settings'];
      if (reserved.includes(tabId)) return;
      e.preventDefault();

      // Remove any existing context menu
      document.getElementById('hs-mc-ctx-menu')?.remove();

      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
      const menu = document.createElement('div');
      menu.id = 'hs-mc-ctx-menu';
      menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #444;border-radius:0;padding:4px 0;min-width:150px;font-size:12px;font-family:inherit;';

      const mkItem = (label, color, fn) => {
        const item = document.createElement('div');
        item.textContent = label;
        item.style.cssText = `padding:6px 12px;cursor:pointer;color:${color};`;
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        item.addEventListener('click', () => { menu.remove(); fn(); });
        menu.appendChild(item);
      };

      mkItem('edit', '#fff', () => showEditChannelForm(tabId));
      mkItem('remove', '#ff4444', () => removeChannel(tabId));

      // Append then clamp to viewport so it doesn't overflow off-screen
      document.body.appendChild(menu);
      const mw = menu.offsetWidth, mh = menu.offsetHeight;
      menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px';

      const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss); } };
      setTimeout(() => document.addEventListener('click', dismiss), 0);
    });

    return container;
  }


  // Edit form active — block renders while editing channel config
  let editingChannel = false;

  // Track scroll state for "new messages" button
  let isScrolledUp = false;
  let emoteReloadTimer = null;
  let newMessageCount = 0;
  let isProgrammaticScroll = false; // Flag to ignore programmatic scrolls

  // WYSIWYG mode (inline emote images in input)
  let wysiwygEnabled = false;

  // Clickable links in chat messages (default on)
  let linksEnabled = true;

  // Vi mode for chat input (default off)
  let viModeEnabled = false;

  // Platform badges [T]/[K]/[YT] on messages (default on)
  let platformBadgesEnabled = true;

  // Zebra striping — alternate row backgrounds (default on)
  let zebraEnabled = true;

  // Timestamps on messages (default off)
  let timestampsEnabled = false;
  window._hsTimestampsEnabled = false;
  let avatarsEnabled = false;

  // Show offline stream events (default off)
  let showOfflineEvents = true;

  // Input bar auto-hide — hidden when empty, shown on first keystroke
  let autoHideInput = true;
  let inputBarVisible = true;

  // ═══ Inline notification routing ═══
  // Modular registry: each type can be toggled independently
  // Colors match website conventions
  const INLINE_NOTIF_TYPES = {
    op:      { label: '[OP]',  color: '#ff0000', borderColor: '#ff0000', defaultOn: true,  desc: 'original posts' },
    mop:     { label: '[OP]',  color: '#ff00ff', borderColor: '#ff00ff', defaultOn: true,  desc: 'OP replies in own thread' },
    re:      { label: '[RE]',  color: '#00ffff', borderColor: '#00ffff', defaultOn: false, desc: 'replies' },
    dm:      { label: '[DM]',  color: '#ffff00', borderColor: '#ffff00', defaultOn: false, desc: 'whispers & DMs' },
  }
  // Runtime state: { op: true, re: false, dm: false, mention: true }
  const inlineNotifs = {}
  for (const [k, v] of Object.entries(INLINE_NOTIF_TYPES)) inlineNotifs[k] = v.defaultOn

  // Hermes event toggles (Twitch-native events: raids, hype trains, etc.)
  const HERMES_EVENT_TYPES = {
    raid:   { color: '#9146ff', defaultOn: true,  desc: 'raids' },
    hype:   { color: '#ff8700', defaultOn: true,  desc: 'hype trains' },
    sub:    { color: '#00ff7f', defaultOn: true,  desc: 'gift subs' },
    redeem: { color: '#00bfff', defaultOn: false, desc: 'channel point redeems' },
  }
  const hermesToggles = {}
  for (const [k, v] of Object.entries(HERMES_EVENT_TYPES)) hermesToggles[k] = v.defaultOn

  function showInputBar() {
    if (inputBarVisible) return
    inputBarVisible = true
    const bar = document.getElementById('hs-mc-inputbar')
    if (bar) bar.classList.remove('hs-hidden')
    const picker = document.getElementById('hs-mc-emote-picker')
    adjustOverlayForPicker(picker?.classList.contains('visible') || false)
  }

  function hideInputBar() {
    if (!autoHideInput) return
    if (!inputBarVisible) return
    const input = document.getElementById('hs-mc-input')
    const hasText = input ? (input.value || input.textContent || '').trim().length > 0 : false
    const hasContent = hasText || (input && input.querySelector('img, span.hs-mc-emoji'))
    if (hasContent) return
    // Don't hide while emote picker is open
    const picker = document.getElementById('hs-mc-emote-picker')
    if (picker?.classList.contains('visible')) return
    // Don't hide while reply is active
    if (replyState) return
    inputBarVisible = false
    const bar = document.getElementById('hs-mc-inputbar')
    if (bar) bar.classList.add('hs-hidden')
    const overlay = document.getElementById('hs-mc-overlay')
    // For horizontal tabs, extend overlay to fill input bar space
    // For vertical tabs, CSS :has() handles it — don't set inline bottom
    if (overlay && tabPosition !== 'left' && tabPosition !== 'right') {
      overlay.style.bottom = '0'
    }
  }

  // Chat width state
  let chatWidth = 340; // Default width
  const DEFAULT_CHAT_WIDTH = 340;
  const MIN_CHAT_WIDTH = 300;
  const MAX_CHAT_WIDTH = 800;

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'hs-mc-overlay';
    // Static hardcoded layout — no user input, safe innerHTML
    overlay.innerHTML = `
      <div id="hs-mc-messages">
        <div class="hs-mc-empty">no messages yet</div>
      </div>
      <button id="hs-mc-new-msgs" style="display:none"></button>
    `;

    // Apply saved font size
    const savedFontSize = localStorage.getItem('heatsync-chat-font-size');
    if (savedFontSize) {
      const msgsDiv = overlay.querySelector('#hs-mc-messages');
      if (msgsDiv) msgsDiv.style.setProperty('--hs-chat-font', savedFontSize + 'px');
    }

    // Setup scroll detection after DOM insertion
    cleanup.setTimeout(() => {
      const msgsEl = document.getElementById('hs-mc-messages');
      const newBtn = document.getElementById('hs-mc-new-msgs');
      if (!msgsEl || !newBtn) return;

      const isStaticTab = () => currentTab === 'feed' || currentTab === 'settings';

      // scroll event only used for scrollbar drag detection (not wheel — wheel has its own handler)
      msgsEl.addEventListener('scrollend', () => {
        if (isProgrammaticScroll) return;
        if (isStaticTab()) {
          // Static tabs: newest at top — "scrolled away" = scrollTop > 0
          isScrolledUp = msgsEl.scrollTop > 50;
          if (!isScrolledUp) { newBtn.style.display = 'none'; newMessageCount = 0; }
          return;
        }
        const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 50;
        if (atBottom) {
          isScrolledUp = false;
          newMessageCount = 0;
          newBtn.style.display = 'none';
        } else {
          isScrolledUp = true;
          newBtn.innerHTML = newMessageCount > 0 ? `<span class="hs-arrow-down">▼</span> ${newMessageCount} new` : '<span class="hs-arrow-down">▼</span> resume';
          newBtn.style.display = 'flex';
        }
      });

      // Use wheel event to detect intentional user scrolling
      msgsEl.addEventListener('wheel', (e) => {
        if (isStaticTab()) {
          // Static tabs: track scroll position but don't show button from scrolling alone
          setTimeout(() => { isScrolledUp = msgsEl.scrollTop > 50; }, 50);
          if (msgsEl.scrollTop <= 50) { newBtn.style.display = 'none'; newMessageCount = 0; }
          return;
        }
        if (e.deltaY < 0) {
          // Scrolling up with wheel = user intent
          isScrolledUp = true;
          newBtn.innerHTML = newMessageCount > 0 ? `<span class="hs-arrow-down">▼</span> ${newMessageCount} new` : '<span class="hs-arrow-down">▼</span> resume';
          newBtn.style.display = 'flex';
        } else if (e.deltaY > 0) {
          // Scrolling down - check if we're now at bottom to re-lock
          setTimeout(() => {
            const atBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 50;
            if (atBottom) {
              isScrolledUp = false;
              newMessageCount = 0;
              newBtn.style.display = 'none';
            }
          }, 50); // Small delay to let scroll finish
        }
      });

      newBtn.addEventListener('click', () => {
        isScrolledUp = false;
        newMessageCount = 0;
        newBtn.style.display = 'none';
        if (isStaticTab()) {
          // Static tabs: re-render then scroll to top (newest content)
          renderMessages(currentTab);
          msgsEl.scrollTop = 0;
        } else {
          // Chat tabs: re-render to catch up on skipped messages
          renderMessages(currentTab);
        }
      });
    }, 100);

    return overlay;
  }

  /**
   * Setup resize handle for dragging chat width
   */
  function setupResizeHandle() {
    // Create handle on the left edge of the right column
    const rightCol = document.querySelector('.right-column.right-column--beside')
    if (!rightCol || document.getElementById('hs-mc-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-mc-resize-handle'
    rightCol.insertBefore(handle, rightCol.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0

    handle.addEventListener('mousedown', (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = chatWidth
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    })

    cleanup.addEventListener(document, 'mousemove', (e) => {
      if (!isResizing) return
      // Dragging left = bigger chat, dragging right = smaller chat
      const delta = startX - e.clientX
      const newWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      chatWidth = newWidth
      applyChatWidth()
    })

    cleanup.addEventListener(document, 'mouseup', () => {
      if (isResizing) {
        isResizing = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        saveChatWidth()
      }
    })

    // Load saved width
    loadChatWidth()
  }

  function applyChatWidth() {
    const rightCol = document.querySelector('.right-column')
    if (!rightCol) return
    const collapsed = rightCol.classList.contains('right-column--collapsed')

    if (collapsed) {
      rightCol.style.removeProperty('width')
      rightCol.style.removeProperty('min-width')
      rightCol.style.removeProperty('flex-shrink')
      // Force parent wrapper (Twitch sets inline width: fit-content) to 0
      // overflow must be visible so the collapse/expand arrow can render
      const parent = rightCol.parentElement
      if (parent && parent !== document.body) {
        parent.style.setProperty('width', '0px', 'important')
        parent.style.setProperty('min-width', '0px', 'important')
        parent.style.setProperty('overflow', 'visible', 'important')
      }
      return
    }

    // Restore parent when expanded
    const parent = rightCol.parentElement
    if (parent && parent !== document.body) {
      parent.style.removeProperty('width')
      parent.style.removeProperty('min-width')
      parent.style.removeProperty('overflow')
    }

    const isVertical = tabPosition === 'left' || tabPosition === 'right'
    const colWidth = chatWidth + (isVertical ? 90 : 0)

    // Parent is display:block, so flex-basis alone won't work — need inline width.
    // Don't override display — Twitch's native display:block works correctly.
    // Setting display:flex breaks internal child layout (flex-direction:row default).
    // Player sizing fix is handled by CSS rule in injected-message.css.
    rightCol.style.setProperty('width', colWidth + 'px', 'important')
    rightCol.style.setProperty('min-width', colWidth + 'px', 'important')
    rightCol.style.setProperty('flex-shrink', '0', 'important')

    // Vertical tabs: widen the inner column chain so .stream-chat fills the
    // wider .right-column. The bottleneck is .channel-root__right-column
    // (position:absolute, Twitch sizes it to default chat width).
    const innerCol = rightCol.querySelector('.channel-root__right-column')
    if (innerCol) {
      // Always fill parent — Twitch leaves a scrollbar gap (right: 47px)
      // that's wasted space when native chat is hidden
      innerCol.style.setProperty('width', '100%', 'important')
    }
  }

  function saveChatWidth() {
    chrome.storage.local.set({ hs_chat_width: chatWidth });
    log('Saved chat width:', chatWidth);
  }

  async function loadChatWidth() {
    try {
      const data = await chrome.storage.local.get(['hs_chat_width']);
      if (data.hs_chat_width) {
        chatWidth = data.hs_chat_width;
        applyChatWidth();
        log('Loaded chat width:', chatWidth);
      }
    } catch (e) {
      log('Error loading chat width:', e);
    }
  }

  /**
   * Apply chat width to Kick's fixed #channel-chatroom panel
   */
  function applyKickChatWidth() {
    const chatroom = document.getElementById('channel-chatroom')
    if (!chatroom) return
    chatroom.style.setProperty('width', chatWidth + 'px', 'important')
    document.documentElement.style.setProperty('--hs-kick-chat-width', chatWidth + 'px')
  }

  /**
   * Setup resize handle for Kick — left edge of fixed #channel-chatroom panel
   * Uses rAF batching, iframe overlay, and kills Kick's native transitions
   */
  function setupKickResizeHandle() {
    const chatroom = document.getElementById('channel-chatroom')
    if (!chatroom || document.getElementById('hs-kick-resize-handle')) return

    const handle = document.createElement('div')
    handle.id = 'hs-kick-resize-handle'
    chatroom.insertBefore(handle, chatroom.firstChild)

    let isResizing = false
    let startX = 0
    let startWidth = 0
    let rafId = 0
    let pendingWidth = 0
    let overlay = null

    function applyResize() {
      rafId = 0
      chatWidth = pendingWidth
      chatroom.style.setProperty('width', chatWidth + 'px', 'important')
      document.documentElement.style.setProperty('--hs-kick-chat-width', chatWidth + 'px')
    }

    handle.addEventListener('mousedown', (e) => {
      isResizing = true
      startX = e.clientX
      startWidth = chatWidth
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      // Kill transitions during drag
      chatroom.style.setProperty('transition', 'none', 'important')
      const main = document.querySelector('main')
      if (main) main.style.setProperty('transition', 'none', 'important')
      // Transparent overlay catches mouse over iframes/video
      overlay = document.createElement('div')
      overlay.id = 'hs-resize-overlay'
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;cursor:col-resize'
      document.body.appendChild(overlay)
      e.preventDefault()
    })

    cleanup.addEventListener(document, 'mousemove', (e) => {
      if (!isResizing) return
      const delta = startX - e.clientX
      pendingWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta))
      if (!rafId) rafId = requestAnimationFrame(applyResize)
    })

    cleanup.addEventListener(document, 'mouseup', () => {
      if (!isResizing) return
      isResizing = false
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
      // Apply final width
      chatWidth = pendingWidth || chatWidth
      applyKickChatWidth()
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // Remove overlay
      if (overlay) { overlay.remove(); overlay = null }
      // Restore transitions
      chatroom.style.removeProperty('transition')
      const main = document.querySelector('main')
      if (main) main.style.removeProperty('transition')
      saveChatWidth()
    })

    loadChatWidth().then(() => { applyKickChatWidth() })
  }

  // Emote size functions
  function setEmoteSize(size) {
    if ([1, 2, 4].includes(size)) {
      emoteSize = size;
      saveEmoteSize();
      applyEmoteSize();
    }
  }

  function saveEmoteSize() {
    chrome.storage.local.set({ hs_emote_size: emoteSize });
  }

  async function loadEmoteSize() {
    try {
      const data = await chrome.storage.local.get(['hs_emote_size']);
      if (data.hs_emote_size) {
        emoteSize = data.hs_emote_size;
        applyEmoteSize();
      }
    } catch (e) {
      log('Error loading emote size:', e);
    }
  }

  function applyEmoteSize() {
    const targets = [document.documentElement, document.getElementById('hs-mc-messages')].filter(Boolean);
    const baseEmote = 32;
    // Only scale emote images and badges — font size stays independent (A-/A+ controls it)
    const vars = {
      '--hs-emote-size': (baseEmote * emoteSize) + 'px',
      '--hs-time-font': (10 * emoteSize) + 'px',
      '--hs-badge-size': (18 * emoteSize) + 'px',
      '--hs-badge-font': (10 * emoteSize) + 'px',
      '--hs-stat-badge-font': (9 * emoteSize) + 'px',
      '--hs-stat-badge-line': (16 * emoteSize) + 'px',
      '--hs-badge-img': (18 * emoteSize) + 'px',
    };
    for (const el of targets) {
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
    }
    renderMessages(currentTab);
  }


  // Inline notification settings
  async function loadInlineNotifSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const saved = stored.ui_settings?.inlineNotifs
      if (saved) {
        for (const k of Object.keys(INLINE_NOTIF_TYPES)) {
          if (saved[k] !== undefined) inlineNotifs[k] = saved[k]
        }
      }
    } catch {}
  }

  async function saveInlineNotifSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const settings = stored.ui_settings || {}
      settings.inlineNotifs = { ...inlineNotifs }
      await chrome.storage.local.set({ ui_settings: settings })
    } catch {}
  }

  async function loadHermesSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const saved = stored.ui_settings?.hermesEvents
      if (saved) {
        for (const k of Object.keys(HERMES_EVENT_TYPES)) {
          if (saved[k] !== undefined) hermesToggles[k] = saved[k]
        }
      }
    } catch {}
  }

  async function saveHermesSettings() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings'])
      const settings = stored.ui_settings || {}
      settings.hermesEvents = { ...hermesToggles }
      await chrome.storage.local.set({ ui_settings: settings })
    } catch {}
  }

  // Inject an inline notification into active chat tabs
  function injectInlineNotif(notifType, msg) {
    if (!inlineNotifs[notifType]) return
    const typeDef = INLINE_NOTIF_TYPES[notifType]
    if (!typeDef) return

    msg.inlineNotifType = notifType
    msg.inlineNotifColor = typeDef.color
    msg.inlineNotifBorderColor = typeDef.borderColor
    msg.inlineNotifLabel = typeDef.label

    // Persist into ALL channel buffers (IRC + Kick) so notification appears on every tab
    for (const ch of config.channels) {
      const twitchName = typeof ch === 'string' ? ch : ch?.twitch
      const kickName = typeof ch === 'string' ? null : ch?.kick
      const buffer = (twitchName && irc?.channels?.get(twitchName)) ||
                     (kickName && kickChat?.channels?.get(kickName))
      if (buffer) buffer.push(msg)
    }

    // Live-append to current tab if it's a chat tab
    const active = currentTab
    const isChatTab = active === 'live' || active === 'mentions' ||
      config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)
    if (isChatTab) appendMessage(msg, active)
  }

  // WYSIWYG setting
  async function loadWysiwygSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.wysiwygEnabled !== undefined) {
        wysiwygEnabled = stored.ui_settings.wysiwygEnabled;
      }
    } catch (e) {
      log('Error loading WYSIWYG setting:', e);
    }
  }

  async function saveWysiwygSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.wysiwygEnabled = wysiwygEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch (e) {
      log('Error saving WYSIWYG setting:', e);
    }
  }

  function toggleWysiwyg() {
    wysiwygEnabled = !wysiwygEnabled;
    saveWysiwygSetting();
    rebuildInput();
    log('WYSIWYG:', wysiwygEnabled ? 'enabled' : 'disabled');
  }

  // Clickable links setting
  async function loadLinksSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.linksEnabled !== undefined) {
        linksEnabled = stored.ui_settings.linksEnabled;
      }
    } catch (e) {
      log('Error loading links setting:', e);
    }
  }

  async function saveLinksSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.linksEnabled = linksEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch (e) {
      log('Error saving links setting:', e);
    }
  }

  function toggleLinks() {
    linksEnabled = !linksEnabled;
    saveLinksSetting();
    log('Links:', linksEnabled ? 'enabled' : 'disabled');
  }

  // Vi mode setting
  async function loadViModeSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.viMode !== undefined) {
        viModeEnabled = stored.ui_settings.viMode;
      }
    } catch (e) {
      log('Error loading vi mode setting:', e);
    }
  }

  async function saveViModeSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.viMode = viModeEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
      // Sync to localStorage for vi-mode.js
      try {
        const ls = JSON.parse(localStorage.getItem('heatsync-extension-settings') || '{}')
        ls.viMode = viModeEnabled
        localStorage.setItem('heatsync-extension-settings', JSON.stringify(ls))
      } catch (_) {}
      // Notify vi-mode.js
      window.postMessage({ type: 'heatsync-settings-changed', settings: { ...settings } }, location.origin);
    } catch (e) {
      log('Error saving vi mode setting:', e);
    }
  }

  function toggleViMode() {
    viModeEnabled = !viModeEnabled;
    saveViModeSetting();
    log('Vi mode:', viModeEnabled ? 'enabled' : 'disabled');
  }

  // Platform badges setting
  async function loadPlatformBadgesSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.showPlatformBadges !== undefined) {
        platformBadgesEnabled = stored.ui_settings.showPlatformBadges;
      }
    } catch (e) {
      log('Error loading platform badges setting:', e);
    }
  }


  // Zebra striping setting
  async function loadZebraSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.zebra !== undefined) {
        zebraEnabled = stored.ui_settings.zebra;
      }
    } catch {}
  }

  async function saveZebraSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.zebra = zebraEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleZebra() {
    zebraEnabled = !zebraEnabled;
    saveZebraSetting();
    // Re-render current tab to apply
    renderMessages(currentTab);
  }


  // Auto-hide input setting
  async function loadAutoHideSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.autoHideEmpty !== undefined) {
        autoHideInput = stored.ui_settings.autoHideEmpty;
      }
    } catch {}
  }

  async function saveAutoHideSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.autoHideEmpty = autoHideInput;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleAutoHide() {
    autoHideInput = !autoHideInput;
    saveAutoHideSetting();
    const bar = document.getElementById('hs-mc-inputbar');
    const picker = document.getElementById('hs-mc-emote-picker');
    const pickerOpen = picker?.classList.contains('visible') || false;
    if (autoHideInput) {
      // Force-hide bar (bypass picker check)
      if (bar) bar.classList.add('hs-hidden');
      inputBarVisible = false;
    } else {
      if (bar) bar.classList.remove('hs-hidden');
      inputBarVisible = true;
    }
    adjustOverlayForPicker(pickerOpen);
  }

  // Timestamps setting
  async function loadTimestampsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.timestamps !== undefined) {
        timestampsEnabled = stored.ui_settings.timestamps;
      }
      window._hsTimestampsEnabled = timestampsEnabled;
    } catch {}
  }

  async function saveTimestampsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.timestamps = timestampsEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleTimestamps() {
    timestampsEnabled = !timestampsEnabled;
    window._hsTimestampsEnabled = timestampsEnabled;
    saveTimestampsSetting();
    renderMessages(currentTab);
  }

  // Offline events setting
  async function loadOfflineEventsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.showOfflineEvents !== undefined) {
        showOfflineEvents = stored.ui_settings.showOfflineEvents;
      }
    } catch {}
  }

  async function saveOfflineEventsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.showOfflineEvents = showOfflineEvents;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleOfflineEvents() {
    showOfflineEvents = !showOfflineEvents;
    saveOfflineEventsSetting();
  }

  // Avatars setting
  async function loadAvatarsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      if (stored.ui_settings?.avatars !== undefined) {
        avatarsEnabled = stored.ui_settings.avatars;
      }
    } catch {}
  }

  async function saveAvatarsSetting() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.avatars = avatarsEnabled;
      await chrome.storage.local.set({ ui_settings: settings });
    } catch {}
  }

  function toggleAvatars() {
    avatarsEnabled = !avatarsEnabled;
    saveAvatarsSetting();
    renderMessages(currentTab);
  }

  function renderSettingsTab() {
    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;

    // Tooltip descriptions for settings — all static strings, no user input
    const settingTips = {
      emoteSize: 'Resolution multiplier for emotes in chat. 1x is crisp and compact, 2x is the sweet spot for most displays, 4x is for when you want to see every pixel of that emote art.',
      wysiwyg: 'Shows emotes as images directly in the input box as you type, instead of plain text names. What you see is what you send.',
      links: "Turns URLs in chat messages into clickable hyperlinks. Disable if you prefer to copy-paste or just don't trust strangers on the internet.",
      vi: 'Vim-style keybindings for chat navigation. j/k to scroll, g/G for top/bottom, / to search. For people who think mice are for casuals.',
      zebra: 'Alternating row shading on chat messages. Makes it easier to track long messages across the window, especially during fast chat.',
      autohide: "Hides the input bar when you're not actively composing a message. Click or start typing to bring it back. Maximizes chat viewing space.",
      timestamps: 'Shows the time each message was sent, right next to the username. Useful for catching up on what happened while you were AFK.',
      avatars: 'Displays profile pictures next to usernames in chat. Makes it easier to visually identify regulars at a glance, costs a bit of vertical space.',
    }
    const notifTips = {
      op: 'Notification in your active chat tab when someone creates a new original post on the feed. Keeps you in the loop without switching tabs.',
      mop: 'Notification when the original poster replies in their own thread. Useful for tracking when an OP responds to discussion.',
      re: 'Notification for every reply posted to any thread on the feed. Can get noisy during active discussions.',
      dm: 'Notification when you receive a whisper or DM. You probably want this on unless you are intentionally ignoring someone.',
    }

    // Static settings HTML — no user input, all tooltip values are hardcoded strings above
    msgsEl.innerHTML = `
      <div class="hs-mc-settings-panel">
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">display</div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.emoteSize}">emote size</span>
            <div class="hs-mc-size-btns">
              <button class="hs-mc-size-btn ${emoteSize === 1 ? 'active' : ''}" data-size="1">1x</button>
              <button class="hs-mc-size-btn ${emoteSize === 2 ? 'active' : ''}" data-size="2">2x</button>
              <button class="hs-mc-size-btn ${emoteSize === 4 ? 'active' : ''}" data-size="4">4x</button>
            </div>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.wysiwyg}">input preview</span>
            <button class="hs-mc-toggle-pill ${wysiwygEnabled ? 'active' : ''}" data-setting="wysiwyg"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.links}">clickable links</span>
            <button class="hs-mc-toggle-pill ${linksEnabled ? 'active' : ''}" data-setting="links"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.vi}">vi mode</span>
            <button class="hs-mc-toggle-pill ${viModeEnabled ? 'active' : ''}" data-setting="vi"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.zebra}">zebra striping</span>
            <button class="hs-mc-toggle-pill ${zebraEnabled ? 'active' : ''}" data-setting="zebra"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.autohide}">auto-hide input</span>
            <button class="hs-mc-toggle-pill ${autoHideInput ? 'active' : ''}" data-setting="autohide"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.timestamps}">timestamps</span>
            <button class="hs-mc-toggle-pill ${timestampsEnabled ? 'active' : ''}" data-setting="timestamps"><span class="hs-mc-toggle-knob"></span></button>
          </div>
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${settingTips.avatars}">avatars</span>
            <button class="hs-mc-toggle-pill ${avatarsEnabled ? 'active' : ''}" data-setting="avatars"><span class="hs-mc-toggle-knob"></span></button>
          </div>
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">inline notifications</div>
          ${Object.entries(INLINE_NOTIF_TYPES).map(([key, def]) => `
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${notifTips[key] || def.desc}"><span style="color:${def.color}">${def.label}</span> ${def.desc}</span>
            <button class="hs-mc-toggle-pill ${inlineNotifs[key] ? 'active' : ''}" data-setting="notif_${key}"><span class="hs-mc-toggle-knob"></span></button>
          </div>`).join('')}
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">twitch events</div>
          ${Object.entries(HERMES_EVENT_TYPES).map(([key, def]) => `
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" data-tip="${def.desc}"><span style="color:${def.color}">\u25C6</span> ${def.desc}</span>
            <button class="hs-mc-toggle-pill ${hermesToggles[key] ? 'active' : ''}" data-setting="hermes_${key}"><span class="hs-mc-toggle-knob"></span></button>
          </div>`).join('')}
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-settings-group-title">muted users</div>
          ${mutedUsers.size === 0
            ? `<div class="hs-mc-setting-row" style="color:#666;font-size:11px">no muted users</div>`
            : [...mutedUsers].sort().map(u => `
          <div class="hs-mc-setting-row">
            <span class="hs-mc-setting-label" style="font-size:11px">${u}</span>
            <button class="hs-mc-unmute-btn" data-username="${u}" style="background:none;border:1px solid #444;color:#999;font-size:11px;cursor:pointer;padding:1px 6px;line-height:1.4" title="unmute">&#x2715;</button>
          </div>`).join('')
          }
        </div>
        <div class="hs-mc-settings-group">
          <div class="hs-mc-setting-row" style="justify-content:flex-end">
            <button class="hs-mc-defaults-btn" style="background:#c0c0c0;border:2px outset #fff;padding:2px 10px;font-size:11px;font-weight:bold;cursor:pointer;font-family:'Liberation Mono',monospace;color:#000;box-shadow:1px 1px 0 #000">default</button>
          </div>
        </div>
      </div>
    `;

    // Wire up toggles via event delegation
    if (msgsEl._hsSettingsClick) msgsEl.removeEventListener('click', msgsEl._hsSettingsClick);
    msgsEl._hsSettingsClick = function settingsClick(e) {
      const toggle = e.target.closest('.hs-mc-toggle-pill[data-setting]');
      if (toggle) {
        const setting = toggle.dataset.setting;
        // Inline notification toggles (notif_op, notif_re, etc.)
        if (setting.startsWith('notif_')) {
          const notifKey = setting.slice(6)
          if (INLINE_NOTIF_TYPES[notifKey] !== undefined) {
            inlineNotifs[notifKey] = !inlineNotifs[notifKey]
            saveInlineNotifSettings()
            toggle.classList.toggle('active')
          }
          return
        }
        // Hermes event toggles (hermes_raid, hermes_hype, etc.)
        if (setting.startsWith('hermes_')) {
          const key = setting.slice(7)
          if (HERMES_EVENT_TYPES[key] !== undefined) {
            hermesToggles[key] = !hermesToggles[key]
            saveHermesSettings()
            toggle.classList.toggle('active')
          }
          return
        }
        const toggleMap = {
          wysiwyg: () => { wysiwygEnabled = !wysiwygEnabled; saveWysiwygSetting(); rebuildInput(); },
          links: () => { linksEnabled = !linksEnabled; saveLinksSetting(); },
          vi: () => { viModeEnabled = !viModeEnabled; saveViModeSetting(); },
          zebra: () => { toggleZebra(); },
          autohide: () => { toggleAutoHide(); },
          timestamps: () => { toggleTimestamps(); },
          avatars: () => { toggleAvatars(); },
        };
        if (toggleMap[setting]) {
          toggleMap[setting]();
          toggle.classList.toggle('active');
        }
        return;
      }

      const sizeBtn = e.target.closest('.hs-mc-size-btn[data-size]');
      if (sizeBtn) {
        const size = parseInt(sizeBtn.dataset.size);
        if (size) {
          setEmoteSize(size);
          msgsEl.querySelectorAll('.hs-mc-size-btn').forEach(b => b.classList.toggle('active', parseInt(b.dataset.size) === size));
        }
        return;
      }

      const unmuteBtn = e.target.closest('.hs-mc-unmute-btn[data-username]');
      if (unmuteBtn) {
        const username = unmuteBtn.dataset.username;
        if (username) {
          mutedUsers.delete(username);
          try { chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] }); } catch {}
          applyMcMutes();
          renderSettingsTab();
        }
        return;
      }

      const defaultsBtn = e.target.closest('.hs-mc-defaults-btn');
      if (defaultsBtn) {
        wysiwygEnabled = false;
        linksEnabled = true;
        viModeEnabled = false;
        zebraEnabled = true;
        autoHideInput = true;
        timestampsEnabled = false;
        avatarsEnabled = false;
        platformBadgesEnabled = true;
        showOfflineEvents = true;
        for (const [k, v] of Object.entries(INLINE_NOTIF_TYPES)) inlineNotifs[k] = v.defaultOn;
        for (const [k, v] of Object.entries(HERMES_EVENT_TYPES)) hermesToggles[k] = v.defaultOn;
        const settings = {
          wysiwygEnabled: false, linksEnabled: true, viMode: false,
          zebra: true, autoHideInput: true, timestamps: false,
          avatars: false, showPlatformBadges: true, showOfflineEvents: true,
          inlineNotifs: { ...inlineNotifs }, hermesEvents: { ...hermesToggles },
        };
        try { chrome.storage.local.get(['ui_settings']).then(s => chrome.storage.local.set({ ui_settings: { ...s.ui_settings, ...settings } })); } catch {}
        renderSettingsTab();
        return;
      }
    };
    msgsEl.addEventListener('click', msgsEl._hsSettingsClick);

    // Custom tooltip for settings labels (native title doesn't work in content scripts)
    let tip = document.getElementById('hs-settings-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'hs-settings-tip';
      document.body.appendChild(tip);
    }
    if (!msgsEl._hsSettingsTipBound) {
      msgsEl._hsSettingsTipBound = true;
      msgsEl.addEventListener('mouseenter', (e) => {
        const label = e.target.closest('.hs-mc-setting-label[data-tip]');
        if (!label) return;
        const t = document.getElementById('hs-settings-tip');
        if (!t) return;
        t.textContent = label.dataset.tip;
        const rect = label.getBoundingClientRect();
        t.style.left = rect.left + 'px';
        t.style.top = (rect.bottom + 4) + 'px';
        t.classList.add('visible');
      }, true);
      msgsEl.addEventListener('mouseleave', (e) => {
        const label = e.target.closest('.hs-mc-setting-label[data-tip]');
        if (label) { const t = document.getElementById('hs-settings-tip'); if (t) t.classList.remove('visible'); }
      }, true);
    }
  }









  function updateTabBar() {
    if (!tabBarElement) return;

    // Clear existing channel tabs (keep built-in tabs)
    const existingChannelTabs = tabBarElement.querySelectorAll('.hs-mc-tab[data-tab]:not([data-tab="live"]):not([data-tab="feed"]):not([data-tab="mentions"]):not([data-tab="whispers"]):not([data-tab="add"]):not([data-tab="rotate"]):not([data-tab="settings"])');
    existingChannelTabs.forEach(t => t.remove());

    // Add channel tabs before the + button (or append if no + button, e.g. Kick)
    const addBtn = tabBarElement.querySelector('[data-tab="add"]');
    const rotateBtn = tabBarElement.querySelector('[data-tab="rotate"]');
    const insertBefore = addBtn || rotateBtn;
    config.channels.forEach(ch => {
      const tab = document.createElement('button');
      tab.className = 'hs-mc-tab';
      const id = typeof ch === 'string' ? ch : ch.id;
      tab.dataset.tab = id;
      tab.textContent = id;
      if (insertBefore) insertBefore.before(tab);
      else tabBarElement.appendChild(tab);
    });

    // Update active state
    tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === currentTab);
    });
  }

  // ============================================
  // STYLES (injected once)
  // ============================================

  function injectStyles() {
    if (document.getElementById('hs-mc-styles')) return;

    const style = document.createElement('style');
    style.id = 'hs-mc-styles';
    style.textContent = `
      /* Tab bar - positioned at top of chat via render injection */
      #hs-mc-tabbar {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 6px 10px;
        background: #000;
        border-bottom: 1px solid #fff;
        flex-shrink: 0;
        order: -1;
        z-index: 10;
      }

      /* Chatterino-style composable tab states: idle → has-new → active */
      .hs-mc-tab {
        padding: 3px 8px !important;
        background: #000 !important;
        color: #808080 !important;
        border: 1px solid #808080 !important;
        border-radius: 0 !important;
        cursor: pointer !important;
        font-family: inherit;
        font-size: 12px !important;
        line-height: 1 !important;
        transition: none;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      /* Idle hover — subtle brighten */
      .hs-mc-tab:not(.active):not(.has-new):hover {
        background: #fff !important;
        color: #000 !important;
      }
      /* New messages — activity indicator */
      .hs-mc-tab.has-new {
        background: #000 !important;
        color: #fff !important;
        border-color: #808080 !important;
      }
      /* Has-new hover */
      .hs-mc-tab.has-new:not(.active):hover {
        background: #fff !important;
        color: #000 !important;
      }
      /* Mentions — red when unseen */
      .hs-mc-tab.has-mentions {
        color: #ff0000 !important;
      }
      .hs-mc-tab.has-mentions:not(.active):hover {
        background: #fff !important;
        color: #ff0000 !important;
      }
      /* Active — focused tab */
      .hs-mc-tab.active {
        background: #fff !important;
        color: #000 !important;
        border-color: #fff !important;
        font-weight: 600;
      }
      /* Active ignores hover */
      .hs-mc-tab.active:hover {
        background: #fff !important;
        color: #000 !important;
      }
      .hs-mc-tab.has-new.active {
        color: #000 !important;
      }
      /* Stream event — yellow tab text (game switch) */
      .hs-mc-tab.has-stream-event {
        background: #000 !important;
        color: #ffff00 !important;
        border-color: #808080 !important;
      }
      .hs-mc-tab.has-stream-event:not(.active):hover {
        background: #fff !important;
        color: #000 !important;
      }
      .hs-mc-tab.has-stream-event.active {
        color: #000 !important;
      }
      /* Utility button row (T, A, A, ⚙) */
      .hs-mc-tab-utils {
        display: flex;
        gap: 4px;
        width: 100%;
      }
      .hs-mc-util-btn {
        flex: 1 !important;
        min-width: 0 !important;
        padding: 4px 0 !important;
        font-size: 13px !important;
        font-weight: 700 !important;
      }
      /* Whisper conversation list */
      .hs-whisper-conv {
        padding: 6px 8px;
        cursor: pointer;
        border-bottom: 1px solid #222;
      }
      .hs-whisper-conv:hover {
        background: #fff;
        color: #000;
      }
      .hs-whisper-conv:hover .hs-whisper-preview,
      .hs-whisper-conv:hover .hs-whisper-time {
        color: #444;
      }
      .hs-whisper-preview {
        color: #808080;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
      }
      .hs-whisper-time {
        color: #808080;
        font-size: 10px;
        float: right;
      }
      .hs-whisper-unread {
        background: #ff8700;
        color: #000;
        font-size: 10px;
        font-weight: 700;
        padding: 0 4px;
        border-radius: 0;
        margin-left: 4px;
      }
      .hs-whisper-header {
        padding: 6px 8px;
        border-bottom: 1px solid #444;
        font-size: 13px;
        position: sticky;
        top: 0;
        background: #000;
        z-index: 1;
      }
      .hs-whisper-back {
        cursor: pointer;
        margin-right: 6px;
        font-size: 14px;
      }
      .hs-whisper-back:hover {
        color: #ff8700;
      }
      .hs-whisper-self {
        opacity: 0.7;
      }
      /* Inline stream event notifications */
      .hs-mc-stream-event {
        padding: 2px 4px;
        font-size: 13px;
        line-height: 1.4;
        font-style: italic;
        background: rgba(128, 128, 0, 0.25);
        border-bottom: 1px solid #333;
        color: #ffff00;
      }
      .hs-mc-stream-event .hs-mc-user { text-decoration: none; font-weight: bold; }
      .hs-mc-stream-event .hs-mc-user:hover { text-decoration: underline; }
      .hs-mc-stream-event .hs-evt-game { color: #fff; font-style: normal; }
      .hs-mc-stream-event.event-online { color: #f44; }
      .hs-mc-stream-event.event-online .hs-evt-game { color: #fff; }
      .hs-mc-stream-event.event-offline { color: #808080; opacity: 1; }
      .hs-mc-stream-event.event-raid { color: #9146ff; }
      .hs-mc-stream-event.event-hype { color: #ff8700; }
      .hs-mc-stream-event.event-sub { color: #00ff7f; }
      .hs-mc-stream-event.event-redeem { color: #00bfff; }
      /* Inline feed posts in chat timeline */
      .hs-mc-feed-inline {
        padding: 2px 8px;
        font-size: 13px;
        border-left: 3px solid #ff0000;
        border-bottom: 1px solid #333;
        color: #ccc;
      }
      .hs-mc-feed-inline .hs-mc-ts { margin-right: 4px; }
      .hs-mc-feed-inline .hs-feed-body { color: #ddd; }
      .hs-mc-feed-inline .hs-feed-thread-link {
        color: #ffff00; text-decoration: none; font-size: 10px; margin-right: 4px;
      }
      .hs-mc-feed-inline .hs-feed-thread-link:hover { text-decoration: underline; }
      .hs-mc-dm-inline {
        border-left-color: #ffff00;
      }
      /* Live dot — red indicator, composes with any state */
      .hs-mc-tab {
        position: relative !important;
      }
      .hs-mc-tab[data-live="true"]::after {
        content: '';
        position: absolute;
        top: 2px;
        right: 2px;
        width: 6px;
        height: 6px;
        background: #f00;
        border-radius: 50%;
        pointer-events: none;
      }
      .hs-mc-tab.active[data-live="true"]::after {
        background: #cc0000;
      }

      /* Overlay - fills chat container (below tab bar, above input bar) */
      #hs-mc-overlay {
        position: absolute;
        top: 38px; /* Default; dynamically adjusted by ResizeObserver */
        left: 0;
        right: 0;
        bottom: 52px; /* Leave room for input bar */
        background: #000;
        z-index: 1000;
        display: none;
        flex-direction: column;
        overflow: hidden;
      }
      #hs-mc-overlay.visible {
        display: flex;
      }

      /* Resize drag bar on left edge of chat column */
      #hs-mc-resize-handle {
        position: absolute;
        top: 0;
        left: 0;
        width: 5px;
        height: 100%;
        cursor: ew-resize;
        z-index: 2000;
        background: transparent;
        transition: none;
      }
      #hs-mc-resize-handle:hover,
      #hs-mc-resize-handle:active {
        background: #9147ff;
      }

      #hs-mc-messages {
        flex: 1;
        overflow-y: auto;
        overflow-x: hidden;
        padding: 8px;
        font-size: var(--hs-chat-font, 13px) !important;
        line-height: 1.4 !important;
        word-wrap: break-word;
        word-break: break-word;
        max-width: 100%;
        box-sizing: border-box;
      }

      /* New messages button - floats above messages */
      #hs-mc-new-msgs {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        display: none;
        align-items: center;
        gap: 4px;
        background: rgba(255, 255, 0, 0.95);
        color: #000;
        border: none;
        border-radius: 0;
        padding: 10px 18px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        z-index: 1005;
        box-shadow: 0 2px 12px rgba(0,0,0,0.6);
        backdrop-filter: blur(4px);
        transition: none;
      }
      #hs-mc-new-msgs:hover {
        background: #fff;
        color: #000;
      }
      .hs-arrow-down {
        font-size: 18px;
        line-height: 0;
        position: relative;
        top: -1px;
      }

      /* UNIFIED INPUT BAR - always visible at bottom */
      #hs-mc-inputbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        gap: 6px;
        padding: 8px;
        background: #000;
        border-top: 1px solid #808080;
        z-index: 1002;
        box-sizing: border-box;
      }

      /* NUKE native Twitch chat when our overlay is active (FFZ-style class toggle) */
      /* Hide native chat messages container */
      .hs-native-hidden [class*="chat-scrollable-area__message-container"],
      .hs-native-hidden [class*="chat-list--default"],
      .hs-native-hidden [class*="chat-list--other"],
      .hs-native-hidden [data-a-target="chat-scroller"] {
        display: none !important;
      }
      /* Hide native chat input area */
      .hs-native-hidden [class*="chat-input-container"],
      .hs-native-hidden [data-a-target="chat-input"] {
        display: none !important;
      }
      /* Hide native chat header/room content — our elements are in #hs-mc-container (sibling) */
      .hs-native-hidden [class*="chat-room__content"] > * {
        display: none !important;
      }
      /* Collapse the native chat container itself so #hs-mc-container gets flex space */
      [class*="chat-room__content"].hs-native-hidden {
        display: none !important;
      }
      /* HeatSync container — sibling of React's chat-room__content, outside React's tree */
      #hs-mc-container {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        min-height: 0;
        overflow: hidden;
        background: #000;
        font-family: 'Courier New', Courier, monospace;
      }

      /* Vertical tabs: container gets row direction */
      .hs-tabs-left #hs-mc-container,
      .hs-tabs-right #hs-mc-container {
        flex-direction: row;
      }
      /* Keep chat-shell visible (our #hs-mc-container lives inside it) but hide native children */
      .chat-shell.hs-native-hidden,
      [class*="chat-shell"].hs-native-hidden {
        display: flex !important;
        flex-direction: column !important;
        height: 100% !important;
        min-width: 0 !important;
        background: #000 !important;
      }
      .chat-shell.hs-native-hidden > *:not(#hs-mc-container),
      [class*="chat-shell"].hs-native-hidden > *:not(#hs-mc-container) {
        display: none !important;
      }
      /* Ensure stream-chat ancestor also stays sized */
      [class*="stream-chat"].hs-native-hidden {
        display: flex !important;
        flex-direction: column !important;
        height: 100% !important;
      }
      .hs-native-hidden {
        background: #000 !important;
      }

      /* Never hide Twitch's native collapse/expand arrows — user needs them.
         Hide HS UI when chat is collapsed so it doesn't interfere with layout. */
      .right-column--collapsed #hs-mc-container {
        display: none !important;
      }
      /* Collapsed chat: width 0 but overflow visible so the toggle arrow
         (which is a grandchild) can still render outside the box */
      .right-column--collapsed {
        width: 0px !important;
        min-width: 0px !important;
        overflow: visible !important;
      }
      .right-column--collapsed > *:not(:has(.right-column__toggle-visibility)) {
        overflow: hidden !important;
        width: 0px !important;
        min-width: 0px !important;
      }
      .right-column--collapsed > *:has(.right-column__toggle-visibility) {
        overflow: visible !important;
      }
      .right-column--collapsed .right-column__toggle-visibility {
        transform: none !important;
        left: -32px !important;
        z-index: 50 !important;
      }
      div:has(> .right-column--collapsed) {
        width: 0px !important;
        min-width: 0px !important;
        overflow: visible !important;
      }
      /* Force collapse/expand arrow to white — Twitch light theme leaks
         into the toggle wrapper, making it black on dark background */
      .right-column__toggle-visibility button {
        color: #fff !important;
      }
      .right-column__toggle-visibility svg {
        fill: #fff !important;
      }

      /* Ensure our elements are visible */
      #hs-mc-tabbar {
        display: flex !important;
      }
      #hs-mc-inputbar {
        display: flex !important;
      }
      #hs-mc-inputbar.hs-hidden {
        display: none !important;
      }

      .hs-mc-ts {
        color: #555;
        font-size: 10px;
        margin-right: 4px;
        font-variant-numeric: tabular-nums;
      }
      .hs-mc-avatar {
        width: 18px;
        height: 18px;
        border-radius: 3px;
        vertical-align: middle;
        margin-right: 3px;
        object-fit: cover;
      }
      .hs-mc-msg {
        padding: 2px 4px;
        border-radius: 0;
        font-size: var(--hs-chat-font, 13px) !important;
        line-height: 1.4 !important;
        word-wrap: break-word;
        word-break: break-word;
        overflow-wrap: anywhere;
        overflow: hidden;
        max-width: 100%;
        box-sizing: border-box;
        color: #ffffff;
      }
      .hs-mc-msg.hs-mc-zebra, .hs-feed-msg.hs-mc-zebra {
        background: #111;
      }
      .hs-mc-msg:hover {
      }
      .hs-mc-msg[data-msg-id] {
        position: relative;
      }
      .hs-mc-reply-btn {
        display: none;
        position: absolute;
        top: 1px;
        right: 2px;
        background: #222;
        border: 1px solid #444;
        color: #aaa;
        font-size: 11px;
        padding: 0 4px;
        cursor: pointer;
        line-height: 18px;
        z-index: 10;
      }
      .hs-mc-reply-btn:hover {
        color: #000;
        background: #fff;
      }
      .hs-mc-msg[data-msg-id]:hover .hs-mc-reply-btn {
        display: block;
      }
      #hs-mc-reply-indicator {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: #111;
        border-bottom: 1px solid #333;
        padding: 2px 6px;
        font-size: 11px;
        color: #aaa;
      }
      #hs-mc-reply-indicator span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #hs-mc-reply-cancel {
        background: none;
        border: none;
        color: #888;
        cursor: pointer;
        font-size: 13px;
        padding: 0 2px;
        line-height: 1;
      }
      #hs-mc-reply-cancel:hover {
        color: #000;
        background: #fff;
      }
      .hs-mc-muted {
        user-select: none;
      }
      .hs-mc-muted .hs-mc-user {
        color: #808080 !important;
        animation: none !important;
        background: none !important;
        -webkit-text-fill-color: #808080 !important;
      }
      .hs-mc-muted > :not(.hs-mc-user):not(.hs-mc-badge-img):not(.hs-mc-timestamp) {
        display: none !important;
      }
      .hs-mc-msg.hs-mc-system {
        border-left: 3px solid #9147ff;
        padding-left: 8px;
        background: rgba(145, 71, 255, 0.08);
      }
      .hs-mc-msg.hs-mc-kicks {
        border-left: 3px solid #ffd600;
        padding-left: 8px;
        background: rgba(255, 214, 0, 0.1);
      }
      .hs-mc-kicks .hs-mc-system-text {
        color: #ffd600;
        font-weight: 700;
      }
      .hs-mc-system-text {
        color: #b0b0b0;
        font-size: 12px;
        font-style: italic;
        display: block;
      }
      .hs-mc-msg.hs-mc-redeemed {
        background: rgba(145, 71, 255, 0.15);
        border-left: 3px solid #9147ff;
        padding-left: 8px;
      }
      .hs-mc-reply-ctx {
        font-size: 11px;
        color: #808080;
        padding: 1px 0 1px 8px;
        border-left: 2px solid #808080;
        margin-bottom: 1px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-mc-reply-user {
        color: #808080;
        font-weight: 600;
      }
      .hs-mc-msg.mention {
        background: #800000;
      }
      .hs-mc-msg.mention .hs-mc-reply-ctx,
      .hs-mc-msg.mention .hs-mc-reply-user {
        color: #ccc;
        border-left-color: #ccc;
      }
      .hs-mc-msg.tweet {
        background: rgba(212, 73, 73, 0.3);
      }
      .hs-mc-user {
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
      }
      .hs-mc-link {
        color: #8080ff;
        text-decoration: none;
        word-break: break-all;
        position: relative;
      }
      .hs-mc-link:hover {
        text-decoration: underline;
      }
      .hs-mc-user.hs-user-highlight {
        background: #fff !important;
        color: #000 !important;
        -webkit-text-fill-color: #000 !important;
        border-radius: 2px;
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
      }
      .hs-mc-platform-badge {
        font-size: var(--hs-badge-font, 10px);
        margin-right: 3px;
        font-weight: 700;
        vertical-align: middle;
      }
      .hs-mc-platform-badge.hs-mc-pb-twitch { color: #9146ff; }
      .hs-mc-platform-badge.hs-mc-pb-kick { color: #53fc18; }
      .hs-mc-platform-badge.hs-mc-pb-yt { color: #ff0000; }
      .hs-mc-badge {
        display: inline-block;
        font-size: var(--hs-stat-badge-font, 9px);
        padding: 0 3px;
        border-radius: 0;
        margin-right: 2px;
        font-weight: 700;
        vertical-align: middle;
        line-height: var(--hs-stat-badge-line, 16px);
        letter-spacing: 0.3px;
        cursor: default;
      }
      .hs-mc-badge-img {
        display: inline !important;
        width: var(--hs-badge-img, 18px);
        height: var(--hs-badge-img, 18px);
        vertical-align: middle;
        margin-right: 2px;
        cursor: default;
      }

      /* Username hover tooltip - profile preview */
      #hs-user-tooltip {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #00ff00;
        border-radius: 0;
        padding: 10px 6px 6px 6px;
        display: none;
        min-width: 240px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      }
      #hs-user-tooltip.visible {
        display: flex;
      }
      #hs-user-tooltip .hs-pc-avatar {
        width: 32px;
        height: 32px;
        min-width: 32px;
        border: 1px solid #000;
        object-fit: cover;
        flex-shrink: 0;
        align-self: flex-start;
      }
      #hs-user-tooltip .hs-pc-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        margin-left: 6px;
      }
      #hs-user-tooltip .hs-pc-header {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        line-height: 1.2;
      }
      #hs-user-tooltip .hs-pc-platform {
        font-size: 10px;
        padding: 1px 2px;
        font-weight: 900;
        border: 1px solid #000;
        white-space: nowrap;
        letter-spacing: 0.2px;
      }
      #hs-user-tooltip .hs-pc-platform.twitch {
        background: #9146ff;
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-platform.kick {
        background: #53fc18;
        color: #000;
      }
      #hs-user-tooltip .hs-pc-name {
        font-size: 14px;
        font-weight: 600;
        white-space: nowrap;
        background: #fff;
        border: 1px solid #000;
        padding: 2px 3px;
        color: #000;
      }
      #hs-user-tooltip .hs-pc-role {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        border: 1px solid #000;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-role.admin { background: #ff0000; color: #fff; }
      #hs-user-tooltip .hs-pc-role.staff { background: #ff8800; color: #000; }
      #hs-user-tooltip .hs-pc-role.partner { background: #ffaa00; color: #000; }
      #hs-user-tooltip .hs-pc-role.affiliate { background: #808080; color: #fff; }
      #hs-user-tooltip .hs-pc-age {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        border: 1px solid #ffff00;
        background: transparent;
        color: #ffff00;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-bio {
        font-size: 12px;
        color: #fff;
        line-height: 1.3;
        margin: 2px 0;
        word-break: break-word;
      }
      #hs-user-tooltip .hs-pc-stats {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 10px;
        color: #fff;
        line-height: 1.2;
      }
      #hs-user-tooltip .hs-pc-stat {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        font-size: 11px;
        font-weight: 500;
        border: 1px solid #fff;
        background: transparent;
        color: #fff;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-stat.heat {
        background: #000;
        border: 1px solid #ff8700;
        padding: 2px 8px;
        font-size: 12px;
      }
      #hs-user-tooltip .hs-pc-stat.heat .hs-pc-num {
        font-weight: 900;
        font-size: 13px;
      }
      #hs-user-tooltip .hs-pc-stat.op {
        color: #ff0000;
        font-weight: 700;
        border-color: #ff0000;
      }
      #hs-user-tooltip .hs-pc-stat.op .hs-pc-num {
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-stat.mop {
        color: #ff00ff;
        font-weight: 700;
        border-color: #ff00ff;
      }
      #hs-user-tooltip .hs-pc-stat.mop .hs-pc-num {
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-stat.re {
        color: #00ffff;
        font-weight: 700;
        border-color: #00ffff;
      }
      #hs-user-tooltip .hs-pc-stat.re .hs-pc-num {
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-rel {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        font-size: 10px;
        line-height: 1.2;
      }
      #hs-user-tooltip .hs-pc-rel-badge {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
      }
      #hs-user-tooltip .hs-pc-rel-badge.mutual { background: #00aaaa; color: #fff; }
      #hs-user-tooltip .hs-pc-rel-badge.supporter { background: #ff8700; color: #000; }
      #hs-user-tooltip .hs-pc-rel-badge.following { background: #0099ff; color: #fff; }
      #hs-user-tooltip .hs-pc-rel-badge.subbed { background: #9146ff; color: #fff; }
      #hs-user-tooltip .hs-pc-followage {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
        background: #00aa00;
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-followage.hs-pc-nofollow {
        background: transparent;
        color: #666;
        border: 1px solid #444;
      }
      #hs-user-tooltip .hs-pc-channel-follows {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
        background: #daa520;
        color: #000;
      }
      #hs-user-tooltip .hs-pc-sub-tenure {
        padding: 2px 3px;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
        letter-spacing: 0.3px;
        background: #e91e8c;
        color: #fff;
      }
      #hs-user-tooltip .hs-pc-loading {
        color: #808080;
        font-size: 11px;
      }
      .hs-mc-channel {
        color: #808080;
        font-size: 11px;
        margin-left: 4px;
      }
      .hs-mc-time {
        color: #808080;
        font-size: var(--hs-time-font, 10px);
        margin-right: 4px;
      }
      .hs-mc-empty {
        color: #808080;
        padding: 20px;
        text-align: center;
      }
      .hs-mc-emote {
        height: var(--hs-emote-size, 32px);
        width: auto;
        vertical-align: middle;
        margin: 0 2px;
        padding: 4px;
        border-radius: 0;
        transition: none;
        cursor: pointer;
        box-sizing: content-box;
      }
      .hs-mc-picker-emote {
        height: auto;
        max-height: 32px;
        max-width: 96px;
        width: auto;
        vertical-align: middle;
        margin: 0;
        padding: 4px;
        border-radius: 0;
        transition: none;
        cursor: pointer;
        box-sizing: content-box;
        object-fit: contain;
      }

      /* Emojis — double-size, stackable as overlay base */
      .hs-mc-emoji {
        font-size: 2em;
        line-height: 1;
        vertical-align: middle;
        display: inline-block;
      }

      /* 7TV ZERO-WIDTH OVERLAY EMOTE STACKING */
      .hs-mc-emote-stack {
        display: inline-block;
        position: relative;
        vertical-align: middle;
      }
      .hs-mc-emote-stack-emotes {
        display: inline-grid;
        place-items: center;
      }
      .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper,
      .hs-mc-emote-stack-emotes > .hs-mc-emoji {
        grid-area: 1 / 1;
      }
      .hs-mc-emote-stack-emotes > :first-child {
        z-index: 1;
      }
      .hs-mc-emote-stack-emotes > :not(:first-child) {
        z-index: 2;
        pointer-events: auto;
      }
      /* Overlay emote at native size, not constrained to base */
      .hs-mc-overlay-emote {
        height: auto !important;
        margin: 0 !important;
        pointer-events: auto;
      }

      /* EMOTE STACK EXPAND/COLLAPSE */
      .hs-mc-stack-collapse,
      .hs-mc-stack-block-all {
        display: none;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 0 2px;
        user-select: none;
      }
      .hs-mc-emote-stack.expanded {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes {
        background: #808080;
        border-radius: 0;
        padding: 2px 6px;
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .hs-mc-emote-stack.expanded > .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper {
        grid-area: auto;
      }
      .hs-mc-emote-stack.expanded .hs-mc-stack-collapse,
      .hs-mc-emote-stack.expanded .hs-mc-stack-block-all {
        display: inline-block;
      }
      .hs-mc-stack-collapse:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-stack-block-all:hover {
        background: #fff;
        color: #000;
      }

      /* STATE-BASED EMOTE COLORS (website parity) */
      /* Wrapper spans for solid color hover rectangles */
      .hs-mc-emote-wrapper {
        display: inline-block;
        position: relative;
        vertical-align: middle;
        cursor: pointer;
        line-height: 0;
        font-size: 0;
      }
      .hs-mc-emote-wrapper > img {
        display: block;
      }
      .hs-mc-emote-wrapper::before {
        content: '';
        position: absolute;
        inset: 4px;
        border-radius: 0;
        opacity: 0;
        transition: none;
        z-index: 1;
        pointer-events: none;
      }
      /* Hover: show solid color rect, hide image */
      .hs-mc-emote-wrapper.hs-emote-highlight::before {
        opacity: 1;
      }
      .hs-mc-emote-wrapper.hs-emote-highlight > img {
        visibility: hidden;
      }

      /* State colors via ::before */
      .hs-mc-emote-wrapper.hs-state-global::before { background: #00ff00; }
      .hs-mc-emote-wrapper.hs-state-owned::before { background: #00ff00; }
      .hs-mc-emote-wrapper.hs-state-unadded::before { background: #ff8700; }
      .hs-mc-emote-wrapper.hs-state-channel::before { background: #00ff00; }
      .hs-mc-emote-wrapper.hs-state-blocked::before { background: #ff0000; }

      /* Blocked emotes: hide img (keeps natural dimensions), dashed line via ::before */
      .hs-mc-emote-wrapper.hs-state-blocked > img {
        visibility: hidden;
      }
      .hs-mc-emote-wrapper.hs-state-blocked::before {
        opacity: 1;
        background: none;
        border: 2px dashed #808080;
      }
      .hs-mc-emote-stack.expanded .hs-mc-emote-wrapper.hs-state-blocked::before {
        border-color: #fff;
      }
      .hs-mc-emote-wrapper.hs-state-blocked.hs-emote-highlight::before {
        background: #ff0000;
        border: none;
      }

      /* Flash animations */
      @keyframes hs-flash-paste { 0% { box-shadow: 0 0 12px 4px #fff; } 100% { box-shadow: none; } }
      @keyframes hs-flash-add { 0% { box-shadow: 0 0 12px 4px #00ff00; } 100% { box-shadow: none; } }
      @keyframes hs-flash-block { 0% { box-shadow: 0 0 12px 4px #ff0000; } 100% { box-shadow: none; } }
      @keyframes hs-flash-unblock { 0% { box-shadow: 0 0 12px 4px #ffff00; } 100% { box-shadow: none; } }
      @keyframes hs-flash-remove { 0% { box-shadow: 0 0 12px 4px #fff; } 100% { box-shadow: none; } }
      .hs-flash-paste { animation: hs-flash-paste 0.4s ease-out; }
      .hs-flash-add { animation: hs-flash-add 0.4s ease-out; }
      .hs-flash-block { animation: hs-flash-block 0.4s ease-out; }
      .hs-flash-unblock { animation: hs-flash-unblock 0.4s ease-out; }
      .hs-flash-remove { animation: hs-flash-remove 0.4s ease-out; }

      /* Legacy img classes (for picker, tooltips) */
      .hs-mc-emote, .hs-mc-picker-emote {
        position: relative;
      }

      /* Emote hover tooltip - 4x preview */
      #hs-emote-tooltip {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #808080;
        border-radius: 0;
        padding: 8px;
        display: none;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      }
      #hs-emote-tooltip.visible {
        display: flex;
      }
      #hs-emote-tooltip img {
        object-fit: contain;
        image-rendering: pixelated;
      }
      #hs-emote-tooltip .tooltip-name {
        color: #fff;
        font-size: 13px;
        font-weight: 600;
      }
      #hs-emote-tooltip .tooltip-source {
        font-size: 11px;
        padding: 2px 6px;
        margin: 2px -8px -8px;
        border-radius: 0;
        color: #fff;
        width: calc(100% + 16px);
        text-align: center;
      }
      #hs-emote-tooltip .tooltip-source.owned { background: #00ff00; color: #000; }
      #hs-emote-tooltip .tooltip-source.unadded { background: #ff8700; color: #000; }
      #hs-emote-tooltip .tooltip-source.global { background: #00ff00; color: #000; }
      #hs-emote-tooltip .tooltip-source.channel { background: #00ff00; color: #000; }
      #hs-emote-tooltip .tooltip-source.blocked { background: #ff0000; color: #fff; }

      #hs-link-tooltip {
        position: fixed;
        z-index: 5000;
        pointer-events: none;
        background: #000;
        border: 2px solid #808080;
        border-radius: 0;
        padding: 8px;
        display: none;
        flex-direction: row;
        gap: 8px;
        max-width: 350px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.6);
      }
      #hs-link-tooltip.visible { display: flex; }
      #hs-link-tooltip img {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 0;
        flex-shrink: 0;
      }
      #hs-link-tooltip .link-text {
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-width: 0;
        justify-content: center;
      }
      #hs-link-tooltip .link-title {
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      #hs-link-tooltip .link-desc {
        color: #aaa;
        font-size: 11px;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      #hs-link-tooltip .link-domain {
        color: #8080ff;
        font-size: 10px;
      }
      #hs-link-tooltip .link-loading {
        color: #888;
        font-size: 11px;
      }

      /* Input styles (used in #hs-mc-inputbar) */
      #hs-mc-input {
        flex: 1;
        padding: 8px 12px;
        background: #fff;
        color: #000;
        border: 1px solid #808080;
        border-radius: 0;
        font-size: 13px;
        font-family: inherit;
        outline: none;
      }
      #hs-mc-input:focus {
        border-color: #9147ff;
      }
      #hs-mc-input::placeholder {
        color: #808080;
      }
      /* Contenteditable placeholder */
      #hs-mc-input[contenteditable]:empty::before {
        content: attr(data-placeholder);
        color: #808080;
        pointer-events: none;
      }
      /* WYSIWYG emote images in input */
      #hs-mc-input .hs-input-emote {
        height: var(--hs-emote-size, 32px);
        vertical-align: middle;
        margin: 0 2px;
      }
      /* WYSIWYG zero-width emote stacking in input */
      #hs-mc-input .hs-input-stack {
        display: inline-grid;
        place-items: center;
        vertical-align: middle;
        margin: 0 2px;
      }
      #hs-mc-input .hs-input-stack > img {
        grid-area: 1 / 1;
        margin: 0;
      }
      #hs-mc-input .hs-input-stack > img:first-child { z-index: 1; }
      #hs-mc-input .hs-input-stack > img:not(:first-child) { z-index: 2; }
      .hs-mc-emoji {
        font-variant-emoji: emoji;
      }
      /* Toggle button */
      .hs-mc-toggle-btn {
        padding: 4px 10px;
        background: #000;
        color: #808080;
        border: none;
        border-radius: 0;
        font-size: 11px;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-toggle-btn:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-toggle-btn.active {
        background: #9147ff;
        color: #fff;
      }
      #hs-mc-input.over-limit {
        /* text color handled by highlight overlay */
      }
      /* Wrapper to position overlay over the input */
      #hs-mc-input-wrap {
        position: relative;
        flex: 1;
        display: flex;
      }
      #hs-mc-input-wrap #hs-mc-input { flex: 1; }
      /* Overlay that mirrors input text with overflow highlighting */
      #hs-mc-input-highlight {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        padding: 8px 12px;
        font-size: 13px;
        font-family: inherit;
        white-space: pre;
        overflow: hidden;
        pointer-events: none;
        border: 1px solid transparent;
      }
      #hs-mc-input-highlight .hl-safe { color: #000; }
      #hs-mc-input-highlight .hl-over { color: #ff4444; }
      #hs-mc-send {
        padding: 8px 12px;
        background: #9147ff;
        color: #fff;
        border: none;
        border-radius: 0;
        cursor: pointer;
        font-size: 14px;
      }
      #hs-mc-send:hover {
        background: #fff;
        color: #000;
      }

      /* Heatsync button */
      #hs-mc-emote-btn {
        padding: 4px;
        background: #000;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: none;
      }
      #hs-mc-emote-btn img {
        width: 24px;
        height: 24px;
        display: block;
      }
      #hs-mc-emote-btn:hover {
        background: #fff;
      }

      /* Emote picker panel — full-width section above inputbar */
      #hs-mc-emote-picker {
        display: none;
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: min(400px, 60vh);
        background: #000;
        border-top: 1px solid #808080;
        z-index: 1003;
        overflow: hidden;
        flex-direction: column;
        font-family: inherit;
        box-sizing: border-box;
      }
      #hs-mc-emote-picker.visible {
        display: flex;
      }

      /* Picker tabs — pinned to bottom */
      #hs-mc-emote-picker .hs-mc-picker-tabs {
        display: flex !important;
        border-top: 1px solid #808080;
        flex-shrink: 0 !important;
        min-height: 0 !important;
        margin-top: auto !important;
        visibility: visible !important;
        opacity: 1 !important;
        background: #000 !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab {
        flex: 1 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 5px !important;
        padding: 6px 4px !important;
        background: transparent !important;
        color: #808080 !important;
        border: none !important;
        cursor: pointer;
        font-size: 12px !important;
        font-weight: 600 !important;
        line-height: 1 !important;
        text-align: center;
        visibility: visible !important;
        opacity: 1 !important;
        height: auto !important;
        width: auto !important;
        overflow: visible !important;
        position: relative !important;
        transition: none;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab:hover {
        background: #fff !important;
        color: #000 !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab.active {
        color: #ff6b35 !important;
        background: transparent !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab.active:hover {
        background: #fff !important;
        color: #000 !important;
      }
      #hs-mc-emote-picker .hs-mc-picker-tab.active::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: #ff6b35;
      }
      .hs-mc-tab {
        flex: 1;
        padding: 12px;
        background: transparent;
        color: #808080;
        border: none;
        cursor: pointer;
        font-size: 15px;
        font-weight: 500;
        transition: none;
        text-align: center;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .hs-mc-tab:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-tab.active {
        color: #fff;
        background: #9147ff;
        border-bottom: 2px solid #9147ff;
        margin-bottom: -1px;
      }
      .hs-mc-tab-content {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        max-height: calc(min(400px, 60vh) - 42px) !important;
        overflow-y: auto !important;
      }
      /* Custom scrollbar — Chrome + Firefox */
      .hs-mc-tab-content,
      .hs-mc-picker-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.12) transparent;
      }
      .hs-mc-tab-content::-webkit-scrollbar,
      .hs-mc-picker-scroll::-webkit-scrollbar {
        width: 4px;
      }
      .hs-mc-tab-content::-webkit-scrollbar-track,
      .hs-mc-picker-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .hs-mc-tab-content::-webkit-scrollbar-thumb,
      .hs-mc-picker-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 0;
      }
      .hs-mc-tab-content::-webkit-scrollbar-thumb:hover,
      .hs-mc-picker-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.2);
      }
      .hs-mc-picker-scroll {
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }
      .hs-mc-picker-section-header {
        display: none;
      }
      .hs-mc-picker-section-count {
        color: #808080;
        font-size: 10px;
        background: rgba(255,255,255,0.06);
        padding: 1px 5px;
        border-radius: 0;
      }
      .hs-mc-picker-section-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 2px;
        padding: 6px;
      }
      .hs-mc-picker-header {
        padding: 8px !important;
        border-bottom: 1px solid rgba(255,255,255,0.08) !important;
        display: block !important;
        visibility: visible !important;
        background: #000 !important;
      }
      .hs-mc-search-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .hs-mc-search-icon {
        position: absolute;
        left: 10px;
        pointer-events: none;
        opacity: 0.4;
      }
      #hs-mc-emote-search {
        width: 100%;
        padding: 4px 8px 4px 28px;
        background: #fff;
        color: #000;
        border: 1px solid #808080;
        border-radius: 0;
        font-size: 13px;
        outline: none;
        box-sizing: border-box;
        transition: none;
      }
      #hs-mc-emote-search:focus {
        border-color: #ff6b35;
      }
      #hs-mc-emote-search::placeholder {
        color: #808080;
      }
      .hs-mc-picker-emote {
        width: auto !important;
        height: auto !important;
        max-width: 96px !important;
        max-height: 32px !important;
        object-fit: contain !important;
        cursor: pointer !important;
        border-radius: 0 !important;
        padding: 4px !important;
        transition: none;
        display: inline-block !important;
        visibility: visible !important;
      }
      .hs-mc-picker-emote:hover {
      }
      .hs-mc-picker-empty {
        padding: 32px !important;
        text-align: center !important;
        color: #808080 !important;
        font-size: 13px !important;
        visibility: visible !important;
      }
      .hs-mc-picker-divider {
        height: 1px;
        background: rgba(255,255,255,0.06);
        margin: 4px 0;
      }

      /* Emote sizing default */
      :root {
        --hs-emote-size: 32px;
      }

      /* ═══ Twitch menu ═══ */
      .hs-mc-menu-item {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 10px 14px !important;
        cursor: pointer !important;
        color: #fff !important;
        transition: none;
        visibility: visible !important;
        border-left: 3px solid transparent;
        margin: 0 6px;
      }
      .hs-mc-menu-item:hover {
        background: #fff !important;
        border-left-color: #000;
      }
      .hs-mc-menu-item:active {
        background: #fff !important;
      }
      .hs-mc-menu-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,107,53,0.12);
        background: color-mix(in srgb, var(--menu-accent, #ff6b35) 12%, transparent);
        color: var(--menu-accent, #ff6b35);
        flex-shrink: 0;
        transition: none;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-icon {
        background: #000;
        color: #fff;
        transform: scale(1.08);
      }
      .hs-mc-menu-text {
        flex: 1;
        min-width: 0;
      }
      .hs-mc-menu-title {
        font-size: 13px;
        font-weight: 500;
        color: #fff;
        line-height: 1.3;
      }
      .hs-mc-menu-desc {
        font-size: 11px;
        color: #808080;
        line-height: 1.3;
        margin-top: 1px;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-title {
        color: #000;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-desc {
        color: #000;
      }
      .hs-mc-menu-arrow {
        color: #808080;
        flex-shrink: 0;
        transition: none;
      }
      .hs-mc-menu-item:hover .hs-mc-menu-arrow {
        color: #000;
        transform: translateX(2px);
      }
      .hs-mc-menu-divider {
        height: 1px;
        background: rgba(255,255,255,0.06);
        margin: 4px 20px;
      }

      /* ═══ Predictions ═══ */
      .hs-mc-pred-loading {
        padding: 20px;
        text-align: center;
        color: #808080;
        font-size: 13px;
      }
      .hs-mc-pred-empty {
        padding: 20px;
        text-align: center;
      }
      .hs-mc-pred-empty-text {
        color: #808080;
        font-size: 13px;
      }
      .hs-mc-prediction {
        padding: 10px 12px;
      }
      .hs-mc-pred-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      .hs-mc-pred-title {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        line-height: 1.3;
        flex: 1;
      }
      .hs-mc-pred-locked {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 0;
        background: rgba(255,255,255,0.1);
        color: #808080;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hs-mc-pred-timer {
        font-size: 12px;
        color: #ff6b35;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hs-mc-pred-balance {
        font-size: 12px;
        color: #808080;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .hs-mc-pred-outcomes {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .hs-mc-pred-outcome {
        background: rgba(255,255,255,0.04);
        border-radius: 0;
        padding: 8px 10px;
        border-left: 3px solid var(--oc, #387aff);
      }
      .hs-mc-pred-outcome-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      .hs-mc-pred-outcome-title {
        font-size: 12px;
        color: #fff;
        font-weight: 500;
      }
      .hs-mc-pred-outcome-pct {
        font-size: 13px;
        font-weight: 700;
        color: var(--oc, #387aff);
        font-variant-numeric: tabular-nums;
      }
      .hs-mc-pred-bar-track {
        height: 4px;
        background: rgba(255,255,255,0.08);
        border-radius: 0;
        overflow: hidden;
        margin-bottom: 4px;
      }
      .hs-mc-pred-bar-fill {
        height: 100%;
        background: var(--oc, #387aff);
        border-radius: 0;
        transition: width 0.3s ease;
      }
      .hs-mc-pred-outcome-stats {
        font-size: 10px;
        color: #808080;
        margin-bottom: 6px;
      }
      .hs-mc-pred-bet-row {
        display: flex;
        gap: 4px;
        align-items: center;
        flex-wrap: wrap;
      }
      .hs-mc-pred-bet-btn {
        background: rgba(255,255,255,0.08);
        border: none;
        color: #808080;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-pred-bet-btn:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-pred-bet-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .hs-mc-pred-bet-custom {
        width: 52px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #808080;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 0;
        outline: none;
      }
      .hs-mc-pred-bet-custom:focus {
        border-color: var(--oc, #387aff);
      }
      .hs-mc-pred-bet-custom::-webkit-inner-spin-button,
      .hs-mc-pred-bet-custom::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .hs-mc-pred-bet-go {
        background: var(--oc, #387aff);
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-pred-bet-go:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-pred-bet-go:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .hs-mc-pred-bet-max {
        font-weight: 600;
        color: #ff8700;
      }
      .hs-mc-pred-bet-max:hover {
        background: #ff8700;
        color: #000;
      }

      /* Prediction states */
      .hs-mc-pred-status {
        font-size: 10px;
        padding: 2px 6px;
        white-space: nowrap;
        flex-shrink: 0;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hs-mc-pred-status-resolved {
        background: rgba(0,200,100,0.15);
        color: #00c864;
      }
      .hs-mc-pred-status-canceled {
        background: rgba(255,255,255,0.08);
        color: #808080;
      }

      /* Result banners */
      .hs-mc-pred-result {
        font-size: 13px;
        font-weight: 700;
        padding: 6px 10px;
        margin-bottom: 8px;
        text-align: center;
      }
      .hs-mc-pred-result-won {
        background: rgba(0,200,100,0.12);
        color: #00c864;
        border-left: 3px solid #00c864;
      }
      .hs-mc-pred-result-lost {
        background: rgba(255,60,60,0.1);
        color: #ff3c3c;
        border-left: 3px solid #ff3c3c;
      }
      .hs-mc-pred-result-refund {
        background: rgba(255,255,255,0.06);
        color: #808080;
        border-left: 3px solid #808080;
      }

      /* Outcome states */
      .hs-mc-pred-outcome-won {
        border-left-color: #00c864;
        background: rgba(0,200,100,0.08);
      }
      .hs-mc-pred-outcome-lost {
        opacity: 0.45;
      }
      .hs-mc-pred-outcome-yours {
        box-shadow: inset 0 0 0 1px rgba(255,135,0,0.3);
      }
      .hs-mc-pred-winner-badge {
        font-size: 9px;
        padding: 1px 5px;
        background: #00c864;
        color: #000;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        vertical-align: middle;
        margin-left: 4px;
      }

      /* ═══ Polls ═══ */
      .hs-mc-poll {
        padding: 10px 12px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .hs-mc-poll-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 4px;
      }
      .hs-mc-poll-title {
        font-size: 13px;
        font-weight: 600;
        color: #fff;
        line-height: 1.3;
        flex: 1;
      }
      .hs-mc-poll-status {
        font-size: 10px;
        padding: 2px 6px;
        white-space: nowrap;
        flex-shrink: 0;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hs-mc-poll-status-ended {
        background: rgba(255,255,255,0.08);
        color: #808080;
      }
      .hs-mc-poll-timer {
        font-size: 12px;
        color: #ff6b35;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .hs-mc-poll-meta {
        font-size: 11px;
        color: #808080;
        margin-bottom: 8px;
      }
      .hs-mc-poll-choices {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .hs-mc-poll-choice {
        display: flex;
        gap: 6px;
        align-items: center;
      }
      .hs-mc-poll-choice-track {
        flex: 1;
        height: 28px;
        background: rgba(255,255,255,0.06);
        position: relative;
        overflow: hidden;
      }
      .hs-mc-poll-choice-fill {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: rgba(145,71,255,0.35);
        transition: width 0.3s ease;
      }
      .hs-mc-poll-choice-top .hs-mc-poll-choice-fill {
        background: rgba(145,71,255,0.6);
      }
      .hs-mc-poll-choice-voted .hs-mc-poll-choice-track {
        box-shadow: inset 0 0 0 1px rgba(255,135,0,0.3);
      }
      .hs-mc-poll-choice-label {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px;
        height: 28px;
      }
      .hs-mc-poll-choice-name {
        font-size: 12px;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-mc-poll-choice-pct {
        font-size: 12px;
        font-weight: 700;
        color: #9147ff;
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
        margin-left: 8px;
      }
      .hs-mc-poll-choice-top .hs-mc-poll-choice-pct {
        color: #bf8fff;
      }
      .hs-mc-poll-voted-check {
        color: #ff8700;
        font-weight: 700;
      }
      .hs-mc-poll-vote-btn {
        background: rgba(145,71,255,0.3);
        border: none;
        color: #bf8fff;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        cursor: pointer;
        white-space: nowrap;
        transition: none;
      }
      .hs-mc-poll-vote-btn:hover {
        background: #9147ff;
        color: #fff;
      }
      .hs-mc-poll-vote-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .hs-mc-pred-links {
        border-top: 1px solid rgba(255,255,255,0.06);
        margin-top: 8px;
        padding-top: 4px;
      }
      .hs-mc-pred-links .hs-mc-menu-item {
        padding: 6px 14px !important;
      }
      .hs-mc-pred-links .hs-mc-menu-icon {
        width: 28px;
        height: 28px;
      }

      /* ═══ Rewards ═══ */
      .hs-mc-rewards {
        border-top: 1px solid rgba(255,255,255,0.06);
        margin-top: 8px;
        padding-top: 8px;
      }
      .hs-mc-rewards-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 14px 6px;
      }
      .hs-mc-rewards-label {
        font-size: 10px;
        font-weight: 600;
        color: #808080;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .hs-mc-rewards-balance {
        font-size: 11px;
        color: #808080;
      }
      .hs-mc-rewards-empty {
        font-size: 11px;
        color: #555;
        padding: 8px 14px;
      }
      .hs-mc-rewards-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4px;
        padding: 0 14px;
      }
      .hs-mc-reward-card {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        background: rgba(255,255,255,0.04);
        border-left: 2px solid var(--rc, #9147ff);
        cursor: pointer;
        transition: none;
      }
      .hs-mc-reward-card:hover {
        background: rgba(255,255,255,0.08);
      }
      .hs-mc-reward-unavailable {
        opacity: 0.4;
        cursor: default;
      }
      .hs-mc-reward-unavailable:hover {
        background: rgba(255,255,255,0.04);
      }
      .hs-mc-reward-img {
        flex-shrink: 0;
        object-fit: contain;
      }
      .hs-mc-reward-info {
        min-width: 0;
        overflow: hidden;
      }
      .hs-mc-reward-title {
        font-size: 11px;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hs-mc-reward-cost {
        font-size: 10px;
        color: #808080;
      }
      .hs-mc-reward-reason {
        font-size: 9px;
        color: #f5009b;
        margin-top: 1px;
      }
      .hs-mc-reward-input-row {
        grid-column: 1 / -1;
        display: flex;
        gap: 4px;
        padding: 4px 0;
      }
      .hs-mc-reward-input {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #fff;
        font-size: 11px;
        padding: 4px 6px;
        border-radius: 0;
        outline: none;
      }
      .hs-mc-reward-input:focus {
        border-color: #9147ff;
      }
      .hs-mc-reward-submit {
        background: #9147ff;
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 0;
        cursor: pointer;
        transition: none;
      }
      .hs-mc-reward-submit:hover {
        background: #fff;
        color: #000;
      }
      .hs-mc-reward-submit:disabled {
        opacity: 0.5;
        cursor: default;
      }

      /* ═══ Chat Color Picker ═══ */
      .hs-mc-color-picker {
        margin-top: 4px;
      }
      .hs-mc-color-current {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 2px;
        vertical-align: -2px;
        margin-left: 6px;
        border: 1px solid rgba(255,255,255,0.2);
      }
      .hs-mc-color-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        padding: 4px 14px;
      }
      .hs-mc-color-swatch {
        width: 20px;
        height: 20px;
        border-radius: 2px;
        cursor: pointer;
        border: 1px solid transparent;
        transition: none;
      }
      .hs-mc-color-swatch:hover {
        border-color: #fff;
        transform: scale(1.2);
      }
      .hs-mc-color-custom {
        display: flex;
        gap: 4px;
        padding: 4px 14px;
      }
      .hs-mc-color-hex {
        flex: 1;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #fff;
        font-size: 11px;
        padding: 3px 6px;
        font-family: inherit;
        border-radius: 0;
      }
      .hs-mc-color-hex:focus {
        border-color: #9147ff;
        outline: none;
      }
      .hs-mc-color-apply {
        background: #9147ff;
        border: none;
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        padding: 3px 10px;
        cursor: pointer;
      }
      .hs-mc-color-apply:hover {
        background: #fff;
        color: #000;
      }

      /* ═══ Chat Modes ═══ */
      .hs-mc-chat-modes {
        margin-top: 4px;
      }
      .hs-mc-modes-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 14px;
      }
      .hs-mc-mode-btn {
        font-size: 10px;
        padding: 3px 8px;
        background: rgba(255,255,255,0.06);
        color: #808080;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,0.08);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .hs-mc-mode-btn:hover {
        background: rgba(255,255,255,0.12);
        color: #fff;
      }
      .hs-mc-mode-btn.active {
        background: rgba(0,200,175,0.15);
        color: #00c8af;
        border-color: rgba(0,200,175,0.3);
      }

      /* ═══ Settings tab ═══ */
      .hs-mc-settings-group {
        padding: 4px 0;
      }
      .hs-mc-settings-group + .hs-mc-settings-group {
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .hs-mc-settings-group-title {
        font-size: 10px;
        font-weight: 600;
        color: #808080;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        padding: 10px 14px 4px;
      }
      .hs-mc-setting-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        padding: 6px 14px !important;
        font-size: 12px !important;
        color: #fff !important;
        visibility: visible !important;
      }
      .hs-mc-setting-row:nth-child(even) {
        background: rgba(255,255,255,0.03);
      }
      .hs-mc-setting-row:hover {
        background: rgba(255,255,255,0.06);
      }
      .hs-mc-setting-label {
        color: #ccc !important;
        font-size: 13px !important;
        cursor: help;
        border-bottom: 1px dotted #666;
      }
      #hs-settings-tip {
        position: fixed;
        z-index: 99999;
        background: #1a1a1a;
        color: #ddd;
        border: 1px solid #555;
        padding: 6px 8px;
        font-size: 11px;
        line-height: 1.4;
        max-width: 260px;
        pointer-events: none;
        display: none;
        font-family: 'Liberation Mono', monospace;
      }
      #hs-settings-tip.visible { display: block; }
      .hs-mc-setting-row .hs-mc-toggle-pill,
      .hs-mc-setting-row .hs-mc-size-btns {
        flex-shrink: 0;
      }
      .hs-mc-size-btns {
        display: flex;
        gap: 2px;
        background: #000;
        padding: 2px;
      }
      .hs-mc-size-btn {
        padding: 4px 10px !important;
        background: transparent !important;
        color: #808080 !important;
        border: none !important;
        border-radius: 0 !important;
        font-size: 11px !important;
        cursor: pointer !important;
        display: inline-block !important;
        visibility: visible !important;
        transition: none;
      }
      .hs-mc-size-btn:hover {
        background: #fff !important;
        color: #000 !important;
      }
      .hs-mc-size-btn.active {
        background: #ff6b35 !important;
        color: #fff !important;
      }
      .hs-mc-toggle-pill {
        width: 16px;
        height: 16px;
        background: #f00;
        border: none;
        border-radius: 0;
        cursor: pointer;
        padding: 0;
        transition: none;
        flex-shrink: 0;
      }
      .hs-mc-toggle-pill.active {
        background: #0f0;
      }
      .hs-mc-toggle-knob {
        display: none;
      }


      /* Ensure parent has relative positioning for overlay */
      .chat-scrollable-area__message-container {
        position: relative !important;
      }

      /* Parent of scrollable area needs proper sizing for absolute overlay */
      [class*="chat-room"] [class*="scrollable-area"] {
        position: relative !important;
      }

      /* Hide Twitch's native tab arrows when our tabs are present */
      #hs-mc-tabbar ~ [class*="tabs-buttons"],
      [class*="chat-header__tabs-buttons"],
      [class*="tabs__scroll-button"],
      .chat-room__content [class*="scroll-button"] {
        display: none !important;
      }

      /* Hide leaderboard carousel arrows */
      [aria-label="Previous leaderboard set"],
      [aria-label="Next leaderboard set"],
      .channel-leaderboard-header-rotating__users ~ button,
      [class*="channel-leaderboard"] button[aria-label*="leaderboard"] {
        display: none !important;
      }

      /* Rotation button styling */
      .hs-mc-rotate {
        margin-left: auto;
        background: #000 !important;
        font-weight: bold;
      }
      .hs-mc-rotate:hover {
        background: #fff !important;
        color: #000 !important;
      }

      /* RIGHT SIDE TABS LAYOUT - absolute position at right edge */
      .hs-tabs-right #hs-mc-tabbar {
        position: absolute !important;
        left: auto !important;
        right: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: 90px;
        flex-direction: column;
        flex-shrink: 0;
        padding: 4px;
        gap: 2px;
        border-bottom: none;
        border-left: 1px solid #fff;
        border-radius: 0;
        background: #000;
        overflow-y: auto;
        z-index: 1001;
      }
      .hs-tabs-right .hs-mc-tab {
        padding: 4px 6px;
        font-size: 11px;
        min-width: auto;
        width: 100%;
        text-align: center;
        box-sizing: border-box;
        flex: 0 0 auto;
      }
      .hs-tabs-right .hs-mc-rotate {
        margin-left: 0;
        margin-top: auto;
      }
      .hs-tabs-right #hs-mc-overlay {
        top: 0;
        left: 0;
        right: 90px;
        bottom: 52px;
      }
      .hs-tabs-right #hs-mc-inputbar {
        left: 0;
        right: 90px;
        z-index: 1002;
      }
      .hs-tabs-right #hs-mc-emote-picker {
        left: 0;
        right: 90px;
      }

      /* BOTTOM TABS LAYOUT */
      .hs-tabs-bottom #hs-mc-tabbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 44px;
        top: auto;
        padding: 3px 8px;
        border-top: 1px solid #fff;
        border-bottom: none;
        z-index: 1001;
      }
      .hs-tabs-bottom #hs-mc-inputbar {
        padding: 4px 8px;
      }
      .hs-tabs-bottom #hs-mc-overlay {
        top: 0;
        bottom: 75px; /* tab bar + input bar */
      }
      .hs-tabs-bottom #hs-mc-emote-picker {
        bottom: 75px; /* tab bar + input bar */
      }
      /* When inputbar is hidden, tabs flush to bottom */
      .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-tabbar {
        bottom: 0;
      }
      .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay {
        bottom: 31px; /* tab bar only */
      }
      .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker {
        bottom: 31px;
      }

      /* LEFT SIDE TABS LAYOUT - flex child, no fixed positioning */
      .hs-tabs-left #hs-mc-tabbar {
        position: relative !important;
        left: auto !important;
        right: auto !important;
        top: auto !important;
        bottom: auto !important;
        width: 90px;
        flex-direction: column;
        flex-shrink: 0;
        order: -1;
        padding: 4px;
        gap: 2px;
        border-bottom: none;
        border-right: 1px solid #fff;
        border-radius: 0;
        background: #000;
        overflow-y: auto;
      }
      .hs-tabs-left .hs-mc-tab {
        padding: 4px 6px;
        font-size: 11px;
        min-width: auto;
        width: 100%;
        text-align: center;
        box-sizing: border-box;
        flex: 0 0 auto;
      }
      .hs-tabs-left .hs-mc-rotate {
        margin-left: 0;
        margin-top: auto;
      }
      .hs-tabs-left #hs-mc-overlay {
        top: 0;
        left: 90px;
        right: 0;
        bottom: 52px;
      }
      .hs-tabs-left #hs-mc-inputbar {
        left: 90px;
        right: 0;
        z-index: 1002;
      }
      .hs-tabs-left #hs-mc-emote-picker {
        left: 90px;
        right: 0;
      }

      /* Popout mode - full width (respects tab bar position) */
      .hs-popout #hs-mc-overlay {
        left: 0 !important;
        right: 0 !important;
        width: auto !important;
      }
      .hs-popout #hs-mc-inputbar {
        left: 0 !important;
        right: 0 !important;
        width: auto !important;
      }
      .hs-popout #hs-mc-resize-handle {
        display: none !important;
      }
      .hs-popout #hs-mc-emote-picker {
        left: 0 !important;
        right: 0 !important;
      }
      /* Popout with tabs on right - adjust for tab bar */
      .hs-popout.hs-tabs-right #hs-mc-overlay {
        right: 90px !important;
      }
      .hs-popout.hs-tabs-right #hs-mc-inputbar {
        right: 90px !important;
      }
      .hs-popout.hs-tabs-right #hs-mc-emote-picker {
        right: 90px !important;
      }
      /* Popout with tabs on left */
      .hs-popout.hs-tabs-left #hs-mc-overlay {
        left: 90px !important;
      }
      .hs-popout.hs-tabs-left #hs-mc-inputbar {
        left: 90px !important;
      }
      .hs-popout.hs-tabs-left #hs-mc-emote-picker {
        left: 90px !important;
      }

      /* ---- FEED MESSAGE CARDS ---- */
      .hs-feed-msg {
        padding: 2px 6px;
        line-height: 1.4;
        font-size: 13px;
        word-wrap: break-word;
        word-break: break-word;
      }
      .hs-feed-avatar {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        vertical-align: middle;
        margin-right: 3px;
      }
      .hs-feed-user {
        font-weight: 600;
        font-size: 13px;
        color: #fff;
        text-decoration: none;
      }
      .hs-feed-user:hover {
        background: #fff;
        color: #000 !important;
        text-decoration: none;
      }
      .hs-feed-time {
        font-size: 11px;
        color: #808080;
        margin: 0 3px;
      }
      .hs-feed-body {
        color: #fff;
      }
      .hs-feed-stat {
        font-size: 11px;
        margin: 0 2px;
        cursor: default;
      }
      .hs-feed-replies {
        cursor: pointer !important;
      }
      .hs-feed-thread-link {
        color: #ff0;
        font-size: 11px;
        font-weight: 700;
        margin-right: 3px;
        text-decoration: none;
      }
      .hs-feed-thread-link:hover {
        background: #fff;
        color: #000;
        text-decoration: none;
      }
      .hs-feed-replies:hover {
        background: #fff;
        color: #000 !important;
      }
      .hs-feed-tag {
        font-size: 10px;
        font-weight: 700;
        margin-right: 3px;
        vertical-align: middle;
      }
      .hs-feed-tag-op {
        color: #ff0000;
      }
      .hs-feed-tag-mop {
        color: #ff00ff;
      }
      .hs-feed-tag-re {
        color: #00ffff;
      }
      .hs-feed-heat-breathe {
        animation: hs-feed-heat-breathe 2.5s ease-in-out infinite;
      }
      @keyframes hs-feed-heat-breathe {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.8; }
      }
      .hs-post-link {
        color: #ffff00;
        font-weight: 700;
        cursor: pointer;
      }
      .hs-post-link:hover {
        text-decoration: underline;
      }
      @keyframes hs-post-highlight-pulse {
        0%   { outline-color: rgba(255, 255, 0, 1); background-color: rgba(255, 255, 0, 0.15); }
        100% { outline-color: rgba(255, 255, 0, 0); background-color: transparent; }
      }
      .hs-post-highlight {
        outline: 2px solid #ffff00;
        outline-offset: -2px;
        animation: hs-post-highlight-pulse 1s ease-out forwards;
      }
      .hs-thread-op {
        border-bottom: 1px solid #ff8700;
        padding-bottom: 4px;
        margin-bottom: 4px;
      }
      .hs-thread-container {
        margin-left: 12px;
        border-left: 2px solid #ff8700;
        padding-left: 8px;
        margin-bottom: 4px;
      }
      .hs-thread-reply {
        padding: 1px 4px;
        line-height: 1.3;
        font-size: 12px;
      }
      .hs-thread-reply.is-thread-op {
        border-left: 2px solid #ff00ff;
        margin-left: -2px;
        padding-left: 10px;
      }
      .hs-feed-loader {
        cursor: default;
        font-size: 12px;
      }

      /* ---- TEXT FORMATTING ---- */
      .hs-spoiler {
        background: #aaa;
        color: transparent;
        cursor: pointer;
        border-radius: 2px;
        padding: 0 2px;
        transition: none;
      }
      .hs-spoiler.revealed {
        background: transparent;
        color: inherit;
      }
      .hs-greentext {
        color: #789922;
      }
      .hs-inline-code {
        background: #2a2a2a;
        padding: 1px 4px;
        border-radius: 2px;
        font-family: monospace;
        font-size: 12px;
      }

      /* ---- NOTIFICATIONS ---- */
      .hs-notif {
        padding: 10px 12px;
        border-bottom: 1px solid #808080;
        cursor: pointer;
        transition: none;
      }
      .hs-notif:hover {
        background: #fff;
      }
      .hs-notif:hover,
      .hs-notif:hover *:not(.hs-spoiler:not(.revealed)) {
        color: #000 !important;
      }
      .hs-notif-header {
        padding: 8px 12px;
        font-size: 12px;
        color: #ff6b35;
        border-bottom: 1px solid #808080;
      }

      /* ---- TAB BADGE ---- */
      .hs-mc-tab .hs-badge {
        background: #ff6b35;
        color: #fff;
        border-radius: 50%;
        font-size: 10px;
        min-width: 14px;
        height: 14px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        padding: 0 3px;
      }

      /* ---- KICK NATIVE CHAT HIDING ---- */
      .hs-native-hidden #chatroom-messages,
      .hs-native-hidden [class*="chatroom-footer"],
      .hs-native-hidden [class*="chat-input"],
      .hs-native-hidden div.editor-input {
        display: none !important;
      }
      .hs-native-hidden#channel-chatroom > *:not(#hs-mc-container):not(#hs-kick-resize-handle) {
        display: none !important;
      }
      /* Force Kick chatroom into a fixed side panel — Kick stacks chat below video
         which collapses to ~0px. Override to fixed right panel like Twitch. */
      .hs-native-hidden#channel-chatroom {
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        bottom: 0 !important;
        width: var(--hs-kick-chat-width, 340px) !important;
        height: 100vh !important;
        z-index: 9999 !important;
        display: flex !important;
        flex-direction: column !important;
        background: #000 !important;
        transition: none !important;
      }
      /* Shrink Kick's main content to make room for HeatSync panel */
      body:has(.hs-native-hidden#channel-chatroom) main {
        margin-right: var(--hs-kick-chat-width, 340px) !important;
        transition: none !important;
      }
      /* On live tab (native chat showing), hide overlay + input but keep tabs visible */
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-overlay,
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-emote-picker,
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > .hs-mc-inputbar,
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-kick-resize-handle {
        display: none !important;
      }
      /* Keep tabbar visible over native chat — fixed panel, respects tab position */
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container {
        position: fixed !important;
        z-index: 10000 !important;
        background: transparent !important;
        pointer-events: none;
        overflow: visible !important;
      }
      #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-tabbar {
        pointer-events: auto;
        background: var(--hs-bg, #18181b) !important;
        position: relative !important;
      }
      /* Top tabs (default) — horizontal bar at top of chat */
      .hs-tabs-top #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container {
        top: 0 !important; right: 0 !important;
        width: var(--hs-kick-chat-width, 340px) !important;
        height: auto !important;
        flex-direction: column !important;
      }
      .hs-tabs-top #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-tabbar {
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        max-height: 32px !important;
        width: 100% !important;
      }
      /* Bottom tabs — horizontal bar at bottom of chat */
      .hs-tabs-bottom #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container {
        bottom: 0 !important; right: 0 !important;
        width: var(--hs-kick-chat-width, 340px) !important;
        height: auto !important;
        flex-direction: column-reverse !important;
      }
      .hs-tabs-bottom #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-tabbar {
        flex-direction: row !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        max-height: 32px !important;
        width: 100% !important;
      }
      /* Right tabs — vertical bar on right edge */
      .hs-tabs-right #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container {
        top: 0 !important; right: 0 !important; bottom: 0 !important;
        width: auto !important;
        height: 100% !important;
        flex-direction: row !important;
      }
      .hs-tabs-right #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-tabbar {
        flex-direction: column !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        width: 90px !important;
        height: 100% !important;
        max-height: none !important;
        border-left: 1px solid #fff;
      }
      /* Left tabs — vertical bar on left edge of chat area */
      .hs-tabs-left #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container {
        top: 0 !important; right: auto !important; bottom: 0 !important;
        left: calc(100vw - var(--hs-kick-chat-width, 340px)) !important;
        width: auto !important;
        height: 100% !important;
        flex-direction: row-reverse !important;
      }
      .hs-tabs-left #channel-chatroom:not(.hs-native-hidden) > #hs-mc-container > #hs-mc-tabbar {
        flex-direction: column !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        width: 90px !important;
        height: 100% !important;
        max-height: none !important;
        border-right: 1px solid #fff;
      }

      /* Kick resize handle — left edge of fixed chat panel
         8px hit zone, 2px visible bar on hover */
      #hs-kick-resize-handle {
        position: absolute;
        top: 0;
        left: -4px;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        z-index: 10000;
        background: transparent;
      }
      #hs-kick-resize-handle::after {
        content: '';
        position: absolute;
        top: 0;
        left: 3px;
        width: 2px;
        height: 100%;
        background: transparent;
        transition: background 0.15s;
      }
      #hs-kick-resize-handle:hover::after {
        background: #ff8700;
      }
      body:has(#hs-resize-overlay) #hs-kick-resize-handle::after {
        background: #ff8700;
      }

      /* Prevent channel accent color bleed on offline/home pages */
      .channel-root--home {
        background-color: #000 !important;
      }
      .root-scrollable__content {
        background: #000;
      }
      /* Collapsed chat rules moved to injectStyles() so they're always active */
    `;
    document.head.appendChild(style);
  }

  // ============================================
  // RENDER PATCHING (FFZ-STYLE CORE)
  // ============================================

  /**
   * Patch a component's render method to inject our UI
   * This is the FFZ approach - modify render output, don't manipulate DOM
   */
  function patchChatRoomRender(component) {
    if (!component?.instance?.render) {
      log('Cannot patch - no render method');
      return false;
    }

    const inst = component.instance;
    if (inst._hs_multichat_patched) {
      log('Already patched');
      return true;
    }

    originalRender = inst.render.bind(inst);

    inst.render = function() {
      const result = originalRender();

      // If result is null or not an object, return as-is
      if (!result || typeof result !== 'object') return result;

      // Clone the result to avoid mutating React's internals
      // We'll inject our tab bar at the top level
      // Elements are in #hs-mc-container (outside React's tree)
      // so no need to re-inject on every render

      return result;
    };

    inst._hs_multichat_patched = true;
    log('✅ Patched chat room render');

    // Force initial re-render
    if (typeof inst.forceUpdate === 'function') {
      inst.forceUpdate();
    }

    return true;
  }

  /**
   * FFZ-style: Fix chat column transform bug
   * Twitch applies translateX(-34rem) even when --expanded class is set
   * We fix this persistently via multiple layers
   */

  // Layer 1: CSS override (always active, catches most cases)
  function injectTransformOverrideCss() {
    if (document.getElementById('hs-chat-transform-fix')) return;
    const style = document.createElement('style');
    style.id = 'hs-chat-transform-fix';
    style.textContent = `
      /* Fix inner column transform — must be 'none', not translateX(0),
         because any transform value creates a containing block that breaks
         position:fixed on descendant elements (tab bar goes off-screen) */
      .channel-root__right-column--expanded {
        transform: none !important;
      }
      /* Fix collapse/expand arrow — Twitch applies translateX(-340px) to
         slide it with the chat panel animation, but our layout changes make
         the transform wrong. Kill both transform and its transition (the
         transition fights !important by interpolating from the old value). */
      .right-column__toggle-visibility {
        transform: none !important;
        transition: none !important;
      }
    `;
    document.head.appendChild(style);
    log('✅ Injected chat column CSS fixes');
  }

  // Fix inline transform that Twitch's CSS-in-JS sets on the inner column.
  // CSS rule handles the class-based override; this catches inline style overrides.
  function fixChatTransform() {
    const expanded = document.querySelector('.channel-root__right-column--expanded');
    if (!expanded) return false;

    const transform = expanded.style.transform || getComputedStyle(expanded).transform;
    if (transform && transform !== 'none') {
      expanded.style.setProperty('transform', 'none', 'important');
      return true;
    }
    return false;
  }

  // Layer 3: Watch for class/style changes on BOTH column elements
  let columnObserver = null;
  function startColumnClassWatcher() {
    if (columnObserver) return; // Already watching

    const inner = document.querySelector('.channel-root__right-column');
    const outer = document.querySelector('.right-column.right-column--beside');

    if (!inner && !outer) return;

    columnObserver = cleanup.trackObserver(new MutationObserver(() => {
      // When class/style changes, fix both elements
      cleanup.raf(() => {
        fixChatTransform();
        applyChatWidth()
        // Re-render after expand — container was display:none while collapsed
        const rightCol = document.querySelector('.right-column')
        if (rightCol && !rightCol.classList.contains('right-column--collapsed')) {
          ensureUIElements()
          renderMessages(currentTab)
        }
      }, 'column-transform-fix');
    }), 'column-class-watcher');

    const config = { attributes: true, attributeFilter: ['class', 'style'] };

    if (inner) columnObserver.observe(inner, config);
    if (outer) columnObserver.observe(outer, config);

    log('✅ Started column watchers (inner + outer)');
  }

  // Polling removed — CSS rule + MutationObserver handle all cases.
  // The 500ms polling was redundant and caused layout fighting.

  function ensureChatColumnVisible() {
    // CSS override + observer (no polling, no parent walking)
    injectTransformOverrideCss();
    startColumnClassWatcher();

    // One-time fix for current state
    fixChatTransform();

    // Return the chat column for injection purposes
    return document.querySelector('[data-a-target="right-column-chat-bar"]') ||
           document.querySelector('.channel-root__right-column');
  }

  /**
   * Alternative approach: Use MutationObserver + strategic element injection
   * This is more reliable than render patching for layout elements
   */
  /**
   * Get or create the HeatSync container OUTSIDE React's DOM tree.
   * Placed as a sibling of chatRoom so React can't destroy our elements.
   */
  function getOrCreateHsContainer(chatRoom) {
    let container = document.getElementById('hs-mc-container')
    if (container && document.contains(container)) return container
    container = document.createElement('div')
    container.id = 'hs-mc-container'
    // On Kick: append directly to #channel-chatroom (must be direct child for CSS rules)
    // On Twitch: insert into chat-shell (which has proper dimensions)
    const parent = isKick
      ? chatRoom
      : (document.querySelector('.chat-shell') || document.querySelector('[class*="chat-shell"]') || chatRoom.parentElement)
    parent.appendChild(container)
    log('Created #hs-mc-container in', parent.tagName + '.' + [...parent.classList].join('.'))
    return container
  }

  function ensureUIElements() {
    // Always watch for collapse/expand class changes so we can clean up
    // inline styles when the user clicks the expand arrow
    startColumnClassWatcher();

    // Don't fight Twitch when chat is collapsed — let the native expand arrow work
    const rightCol = document.querySelector('.right-column')
    const collapsed = rightCol && rightCol.classList.contains('right-column--collapsed')

    if (collapsed) return

    // Make sure chat column is visible (only when expanded)
    ensureChatColumnVisible();

    // Find the React-controlled chat room
    const chatRoom = isKick
      ? (document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]'))
      : (document.querySelector('[class*="chat-room__content"]') ||
         document.querySelector('[data-a-target="chat-room-component"]') ||
         document.querySelector('.chat-shell') ||
         document.querySelector('[class*="stream-chat"]') ||
         document.querySelector('.chat-room'));

    if (!chatRoom) return;

    // Transform fix handled by CSS (#hs-chat-transform-fix) + MutationObserver.
    // No parent tree walking — it displaced the collapse arrow.

    // Get our container outside React's tree
    const container = getOrCreateHsContainer(chatRoom)

    // Ensure tab bar exists
    if (!tabBarElement || !document.contains(tabBarElement)) {
      const existing = document.getElementById('hs-mc-tabbar');
      if (existing) {
        tabBarElement = existing;
        log('Reclaimed existing tab bar');
      } else {
        tabBarElement = createTabBar();
        updateTabBar();
        if (!liveStatusInterval) startLiveStatusPolling();
        log('Created tab bar');
      }
    }
    if (!container.contains(tabBarElement)) {
      container.insertBefore(tabBarElement, container.firstChild);
      log('Inserted tab bar into container');
    }

    // Ensure overlay exists
    if (!overlayElement || !document.contains(overlayElement)) {
      const existing = document.getElementById('hs-mc-overlay');
      if (existing) {
        overlayElement = existing;
        log('Reclaimed existing overlay');
      } else {
        overlayElement = createOverlay();
        log('Created overlay');
      }
    }
    if (!container.contains(overlayElement)) {
      container.appendChild(overlayElement);
      log('Injected overlay into container');
    }

    // Ensure emote picker panel exists (between overlay and inputbar)
    let pickerEl = document.getElementById('hs-mc-emote-picker');
    if (!pickerEl) {
      pickerEl = document.createElement('div');
      pickerEl.id = 'hs-mc-emote-picker';
    }
    if (!container.contains(pickerEl)) {
      container.appendChild(pickerEl);
    }

    // Ensure input bar exists
    if (!inputBarElement || !document.contains(inputBarElement)) {
      inputBarElement = createInputBar();
      // Start hidden — typing reveals it
      if (autoHideInput) {
        inputBarElement.classList.add('hs-hidden')
        inputBarVisible = false
      }
      log('Created input bar');
    }
    if (!container.contains(inputBarElement)) {
      container.appendChild(inputBarElement);
      log('Injected input bar into container');

      // Restore pending message if any
      const input = document.getElementById('hs-mc-input');
      if (input && pendingMessage) {
        input.value = pendingMessage;
      }
    }

    // Sync overlay top with tabbar height (handles wrapped tabs)
    // Skip for vertical tabs — CSS handles positioning
    if (tabBarElement && overlayElement && !resizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        if (!tabBarElement || !overlayElement) return
        if (tabPosition === 'left' || tabPosition === 'right') {
          // Clear any inline overrides — let CSS handle vertical tab layout
          overlayElement.style.removeProperty('top')
          overlayElement.style.removeProperty('bottom')
          return;
        }
        const h = tabBarElement.getBoundingClientRect().height;
        if (h > 0) overlayElement.style.top = h + 'px';
      });
      resizeObserver.observe(tabBarElement);
      cleanup.trackObserver(resizeObserver);
      if (tabPosition === 'left' || tabPosition === 'right') {
        overlayElement.style.removeProperty('top')
        overlayElement.style.removeProperty('bottom')
      } else {
        const h = tabBarElement.getBoundingClientRect().height;
        if (h > 0) overlayElement.style.top = h + 'px';
      }
    }

    // Auto-show overlay if not already visible
    if (overlayElement && !overlayElement.classList.contains('visible')) {
      overlayElement.classList.add('visible');
      if (!currentTab) {
        currentTab = 'live';
        if (tabBarElement) {
          tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === 'live');
          });
        }
      }
      renderMessages(currentTab);
      log('Auto-showed overlay on load');
    }

    // Ensure resize handle exists on left edge of chat panel
    if (isKick) {
      setupKickResizeHandle()
    } else {
      setupResizeHandle()
    }

    // Always ensure native chat is hidden when our UI is active
    if (!(isKick && currentTab === 'live')) {
      setNativeChatHidden(true);
    }
  }

  // ============================================
  // TAB/CHANNEL MANAGEMENT
  // ============================================

  function switchTab(id) {
    log('switchTab called:', id);
    editingChannel = false;

    // Clicking feed tab while in thread view → go back to feed, don't switch tabs
    if (id === 'feed' && currentTab === 'feed' && activeThread) {
      closeThread();
      return;
    }

    // Close thread view when leaving feed
    if (currentTab === 'feed' && id !== 'feed') {
      activeThread = null;
      const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
      if (feedTabBtn) feedTabBtn.textContent = 'feed';
    }
    currentTab = id;

    // Mark mentions as seen when switching to that tab
    if (id === 'mentions') {
      mentionsSeenCount = mentionsBuffer.length;
      updateTabBadges();
    }

    // Clear whisper unread when switching to whispers tab
    if (id === 'whispers') {
      whisperLastViewedTime = Date.now()
      whisperTotalUnread = 0
      updateWhisperBadge()
      whisperSaveDebounced()
    }

    // Persist active tab across refreshes/popouts (skip transient tabs)
    if (id !== 'add') {
      try {
        chrome.storage.local.get(['ui_settings']).then(stored => {
          try {
            const settings = stored.ui_settings || {};
            settings.activeTab = id;
            settings.liveChannel = liveChannel;
            chrome.storage.local.set({ ui_settings: settings });
          } catch (e) { /* context invalidated */ }
        }).catch(() => {});
      } catch (e) { /* context invalidated */ }
    }

    // Update tab bar active state
    if (tabBarElement) {
      const liveCh = getLiveChannel()?.toLowerCase()
      tabBarElement.querySelectorAll('.hs-mc-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === id);
        if (t.dataset.tab === id) {
          t.classList.remove('has-new');
          t.classList.remove('has-stream-event');
          t.classList.remove('has-mentions');
        }
        // Switching to live also clears the matching channel tab's indicators
        if (id === 'live' && liveCh && t.dataset.tab !== 'live') {
          const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === t.dataset.tab)
          if (ch) {
            const tw = (typeof ch === 'string' ? ch : ch.twitch)?.toLowerCase()
            const ki = (typeof ch === 'string' ? undefined : ch.kick)?.toLowerCase()
            if (tw === liveCh || ki === liveCh) {
              t.classList.remove('has-new', 'has-stream-event', 'has-mentions')
            }
          }
        }
        // Switching to a channel tab that matches live clears the live tab too
        if (id !== 'live' && liveCh && t.dataset.tab === 'live') {
          const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === id)
          if (ch) {
            const tw = (typeof ch === 'string' ? ch : ch.twitch)?.toLowerCase()
            const ki = (typeof ch === 'string' ? undefined : ch.kick)?.toLowerCase()
            if (tw === liveCh || ki === liveCh) {
              t.classList.remove('has-new', 'has-stream-event', 'has-mentions')
            }
          }
        }
      });
    }

    // Update live tab label when switching to it
    if (id === 'live') updateLiveTabLabel();

    // Reset scroll state BEFORE rendering - always start at bottom when switching tabs
    isScrolledUp = false;
    newMessageCount = 0;
    const newBtn = document.getElementById('hs-mc-new-msgs');
    if (newBtn) newBtn.style.display = 'none';

    // Kick live tab: show native chat only when viewing the page's own channel
    if (isKick && id === 'live' && (!liveChannel || liveChannel === getCurrentChannel()?.toLowerCase())) {
      setNativeChatHidden(false);
      if (overlayElement) overlayElement.classList.remove('visible');
      if (inputBarElement) inputBarElement.classList.add('hs-hidden');
      return;
    }

    // Hide input bar on add-channel form, or when auto-hide is on
    if (inputBarElement) {
      const pickerOpen = document.getElementById('hs-mc-emote-picker')?.classList.contains('visible');
      if (id === 'add') {
        inputBarElement.classList.add('hs-hidden');
        inputBarVisible = false;
      } else if (autoHideInput && !pickerOpen) {
        const input = document.getElementById('hs-mc-input')
        const hasContent = input && ((input.value || input.textContent || '').trim().length > 0 || input.querySelector('img, span.hs-mc-emoji'))
        if (hasContent) {
          inputBarElement.classList.remove('hs-hidden')
          inputBarVisible = true
        } else {
          inputBarElement.classList.add('hs-hidden')
          inputBarVisible = false
        }
      } else {
        inputBarElement.classList.remove('hs-hidden');
        inputBarVisible = true;
      }
    }

    if (overlayElement) {
      overlayElement.classList.add('visible');
      // Sync overlay bottom with input bar visibility
      if (!inputBarVisible) overlayElement.style.bottom = '0'
      renderMessages(id);
    } else {
      log('No overlay element to show!');
    }

    // Update input placeholder for new tab
    updateInputPlaceholder();

    // Hide native chat when our overlay is active
    setNativeChatHidden(true);
  }

  /**
   * Toggle native Twitch chat visibility (FFZ-style)
   * Adds class to parent container rather than relying on :has() selector
   */
  function setNativeChatHidden(hidden) {
    if (isKick) {
      // Kick selectors
      const chatroom = document.getElementById('channel-chatroom') ||
                       document.querySelector('[id*="chatroom"]');
      if (chatroom) chatroom.classList.toggle('hs-native-hidden', hidden);
      return;
    }

    // Twitch: Add class to chat-shell (outermost container)
    const chatShell = document.querySelector('.chat-shell') ||
                      document.querySelector('[class*="chat-shell"]');
    if (chatShell) {
      chatShell.classList.toggle('hs-native-hidden', hidden);
    }

    // Add class to chat-room__content (where our elements are injected)
    const chatRoom = document.querySelector('[class*="chat-room__content"]') ||
                     document.querySelector('[data-a-target="chat-room-component"]');
    if (chatRoom) {
      chatRoom.classList.toggle('hs-native-hidden', hidden);
    }

    // Also try stream-chat for popout mode
    const streamChat = document.querySelector('.stream-chat') ||
                       document.querySelector('[class*="stream-chat"]');
    if (streamChat) {
      streamChat.classList.toggle('hs-native-hidden', hidden);
    }
  }

  function updateTabBadges() {
    if (!tabBarElement) return;
    const mentionsTab = tabBarElement.querySelector('[data-tab="mentions"]');
    if (mentionsTab) {
      const unseenMentions = mentionsBuffer.length - mentionsSeenCount;
      mentionsTab.textContent = 'mentions';
      mentionsTab.classList.toggle('has-mentions', unseenMentions > 0);
    }
  }



  // Dedup helper: check against actual message buffers (survives WS reconnects)
  function isYtDuplicate(user, text, channelId) {
    const buf = channelYtMessages.get(channelId)
    if (!buf || buf.length === 0) return false
    // check last 200 messages in buffer (matches server recentMessages cap)
    const start = Math.max(0, buf.length - 200)
    const needle = `${user}:${text.slice(0, 50)}`
    for (let i = buf.length - 1; i >= start; i--) {
      const m = buf[i]
      if (`${m.user}:${m.text.slice(0, 50)}` === needle) return true
    }
    return false
  }

  // Build a message div element (shared by full rebuild and incremental append)
  // Note: innerHTML here is safe — badges/emotes are from extension data, user text
  // goes through escapeHtml() and processEmotes() which sanitize content
  function buildMessageDiv(m, tabId) {
    // Stream event — render as magenta inline notification
    if (m.type === 'stream-event') {
      const div = document.createElement('div')
      div.className = `hs-mc-stream-event ${m.eventClass || ''}`
      const tsVal = timestampsEnabled && m.time ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      const ch = m.channel || ''
      // Look up color: event data → color map → profile cache → IRC buffers → async fetch
      let userColor = m.color || ''
      if (!userColor) userColor = streamColorMap.get(ch) || ''
      if (!userColor) {
        const cached = _profileCache.get(ch)
        if (cached?.profile?.twitch_color) userColor = cached.profile.twitch_color
      }
      if (!userColor && ch && irc?.channels) {
        for (const [, buf] of irc.channels) {
          const msgs = buf.getAll()
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].user?.toLowerCase() === ch) {
              userColor = msgs[i].color || ''
              break
            }
          }
          if (userColor) break
        }
      }
      // Build structured HTML: [username] ◆ action game
      if (!userColor) userColor = '#fff'
      const colorStyle = `color:${sanitizeColor(userColor)}`
      const userLink = `<a href="https://twitch.tv/${encodeURIComponent(ch)}" target="_blank" class="hs-mc-user hs-evt-user" data-username="${escapeHtml(ch)}" style="${colorStyle}">${escapeHtml(ch)}</a>`
      const textAfterChannel = escapeHtml(m.text).replace(/^\[[^\]]+\]\s*/, '')
      const actionHtml = textAfterChannel.replace(/(switched to |now playing |went live \u2014 )(.+)$/, '$1<span class="hs-evt-game">$2</span>')
      div.innerHTML = `${tsSpan}${userLink} ${actionHtml}`
      // Async fetch color if not cached
      if (!userColor && ch) {
        apiFetch(`/api/profile/${encodeURIComponent(ch)}`).then(resp => {
          if (resp?.ok && resp.data?.profile) {
            const profile = resp.data.profile
            const color = profile.twitch_color
            if (color) {
              const el = div.querySelector('.hs-evt-user')
              if (el) el.style.color = sanitizeColor(color)
            }
            _profileCache.set(ch, { profile, ts: Date.now() })
          }
        })
      }
      return div
    }

    // Inline feed post — uses notification type colors from registry
    if (m.type === 'feed-post') {
      const div = document.createElement('div')
      div.className = 'hs-mc-feed-inline'
      div.dataset.msgId = m.base36_id || ''
      const isOp = m.is_op != null ? !!m.is_op : (!m.reply_to || m.reply_to === '')
      const isThreadOp = !!m.is_thread_op
      const notifType = isThreadOp ? 'mop' : isOp ? 'op' : 're'
      const typeDef = INLINE_NOTIF_TYPES[notifType]
      const borderColor = m.inlineNotifBorderColor || typeDef?.borderColor || '#ff8700'
      div.style.borderLeftColor = borderColor
      const tsVal = timestampsEnabled ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      const tagColor = typeDef?.color || '#ff0000'
      const tagLabel = isThreadOp || isOp ? '[OP]' : '[RE]'
      const typeTag = `<span class="hs-feed-tag" style="color:${tagColor};font-size:10px;margin-right:3px">${tagLabel}</span>`
      const shortId = (m.base36_id || '').replace(/^0+/, '') || '0'
      const threadLink = `<a href="https://heatsync.org/post/${encodeURIComponent(m.base36_id)}" target="_blank" class="hs-feed-thread-link">&gt;&gt;${escapeHtml(shortId)}</a>`
      const userLink = `<a href="https://heatsync.org/user/${encodeURIComponent(m.feedUser)}" target="_blank" class="hs-mc-user" data-username="${escapeHtml((m.feedUser || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.color || '#fff')}">${escapeHtml(m.feedUser || 'anon')}</a>`
      const content = renderFeedContent(m.text, m.emote_refs)
      const hd = getHeatDisplay(m.heat)
      const heatHtml = hd ? ` <span style="font-weight:700;color:${hd.color}${hd.glow ? ';text-shadow:0 0 6px rgba(255,135,0,0.8)' : ''}">${m.heat}</span>` : ''
      // All values sanitized — safe innerHTML (heat is numeric, emoji/color are hardcoded)
      div.innerHTML = `${tsSpan}${threadLink}${typeTag}${userLink}${heatHtml}: <span class="hs-feed-body">${content}</span>`
      div.addEventListener('click', (e) => {
        const spoiler = e.target.closest('.hs-spoiler')
        if (spoiler) { spoiler.classList.toggle('revealed'); return }
        if (e.target.closest('a, .hs-mc-emote, .hs-mc-link')) return
        switchTab('feed')
        openThread(m.reply_to || m.base36_id)
      })
      return div
    }

    // Inline DM/whisper notification
    if (m.type === 'inline-dm') {
      const div = document.createElement('div')
      div.className = 'hs-mc-feed-inline hs-mc-dm-inline'
      const borderColor = m.inlineNotifBorderColor || INLINE_NOTIF_TYPES.dm.borderColor
      div.style.borderLeftColor = borderColor
      const tsVal = timestampsEnabled ? formatTimeFromTs(m.time) : ''
      const tsSpan = tsVal ? `<span class="hs-mc-ts" data-ts="${m.time}">${tsVal}</span>` : ''
      const labelColor = m.inlineNotifColor || INLINE_NOTIF_TYPES.dm.color
      const label = `<span style="color:${labelColor};font-size:10px;font-weight:700;margin-right:3px">[DM]</span>`
      const platBadge = m.platform === 'twitch'
        ? '<span style="color:#9146ff;font-size:10px;font-weight:700;margin-right:3px">[T]</span>'
        : '<span style="color:#ff8700;font-size:10px;font-weight:700;margin-right:3px">[HS]</span>'
      const userName = `<span style="color:${sanitizeColor(m.color)};font-weight:600">${escapeHtml(m.user)}</span>`
      // All values sanitized — safe innerHTML
      if (m._renderedHtml == null) m._renderedHtml = processEmotes(escapeHtml(m.text), null)
      // All values already sanitized via escapeHtml/processEmotes — safe innerHTML (existing pattern)
      div.innerHTML = `${tsSpan}${label}${platBadge}${userName}: ${m._renderedHtml}`
      div.style.cursor = 'pointer'
      div.addEventListener('click', (e) => {
        if (e.target.closest('a, .hs-mc-emote')) return
        switchTab('whispers')
      })
      return div
    }

    const showChannel = tabId === 'mentions';
    const isSuperChat = m.platform === 'youtube' && (m.msgType === 'superchat' || m.msgType === 'supersticker')
    const isMembership = m.platform === 'youtube' && m.msgType === 'membership'
    const isKicksEvent = m.kicksEvent === true
    const cls = tabId === 'mentions' ? 'hs-mc-msg mention' :
isKicksEvent ? 'hs-mc-msg hs-mc-system hs-mc-kicks' :
isMembership ? 'hs-mc-msg hs-mc-system' :
m.type === 'usernotice' || m.type === 'notice' ? 'hs-mc-msg hs-mc-system' :
                m.redeemed ? 'hs-mc-msg hs-mc-redeemed' :
                isSuperChat ? 'hs-mc-msg hs-mc-superchat' :
                isMention(m) ? 'hs-mc-msg mention' : 'hs-mc-msg';
    const channelSpan = showChannel && m.channel ? `<span class="hs-mc-channel">${escapeHtml(m.channel)}</span>` : '';
    // Render badges — YouTube sends array of {type,label,url}, Twitch/Kick send IRC badge string
    let badges = ''
    if (m.platform === 'youtube' && Array.isArray(m.badges)) {
      badges = m.badges.map(b => {
        if (b.url) {
          return `<img class="hs-mc-badge-img" src="${escapeHtml(b.url)}" alt="${escapeHtml(b.label)}" title="${escapeHtml(b.label)}" style="width:18px;height:18px;">`
        }
        // Text fallback for owner/mod without image
        const ytBadgeStyles = { owner: { bg: '#ffd600', fg: '#000', label: '\u2606' }, moderator: { bg: '#5e84f1', fg: '#fff', label: '\u2694' } }
        const style = ytBadgeStyles[b.type]
        if (style) return `<span class="hs-mc-badge" style="background:${style.bg};color:${style.fg}" title="${escapeHtml(b.label)}">${style.label}</span>`
        return ''
      }).join('')
    } else {
      badges = renderBadges(m.badges, m.channel)
    }
    const plat = m.platform === 'youtube' ? 'yt' : m.platform === 'kick' ? 'kick' : 'twitch'
    const platLabel = plat === 'yt' ? '[YT]' : plat === 'kick' ? '[K]' : '[T]'
    const platColors = { twitch: '#9146ff', kick: '#53fc18', yt: '#ff0000' }
    const platformBadge = (platformBadgesEnabled || plat !== hostPlatform) ? `<span class="hs-mc-platform-badge hs-mc-pb-${plat}" style="font-size:10px;margin-right:3px;font-weight:700;vertical-align:middle;color:${platColors[plat]}">${platLabel}</span>` : ''
    const safeScColor = sanitizeColor(m.scColor || '#ffd600')
    const scBadge = isSuperChat && m.amount ? `<span class="hs-mc-sc-badge" style="background:${safeScColor};color:#000;padding:0 4px;border-radius:0;font-size:10px;font-weight:700;margin-right:3px;">${escapeHtml(m.amount)}</span>` : ''
    const userLink = `<a href="https://heatsync.org/${plat === 'yt' ? 'user' : plat}/${encodeURIComponent(m.user)}" target="_blank" class="hs-mc-user" data-username="${escapeHtml(m.user.toLowerCase())}" style="color:${sanitizeColor(m.color || '#fff')}">${escapeHtml(m.user)}</a>`;
    let avatarHtml = ''
    if (avatarsEnabled) {
      const userKey = m.user.toLowerCase()
      // YouTube messages carry avatar URL directly — cache it and skip decapi
      if (m.avatar && m.platform === 'youtube') {
        avatarCache.set(userKey, m.avatar)
      }
      const cachedUrl = avatarCache.get(userKey)
      if (cachedUrl) {
        avatarHtml = `<img class="hs-mc-avatar" src="${escapeHtml(cachedUrl)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
      } else if (m.platform !== 'youtube') {
        // Only fetch from decapi for Twitch users
        avatarHtml = `<img class="hs-mc-avatar" data-user="${escapeHtml(userKey)}" src="" alt="" style="display:none" loading="lazy" decoding="async">`
        fetchAvatar(userKey)
      }
    }

    // Process text: heatsync/7TV/BTTV/FFZ emotes first, then YouTube native emoji
    // Cache rendered HTML on message object so re-renders preserve emote state at post time
    let processedText
    if (m._renderedHtml != null) {
      processedText = m._renderedHtml
    } else {
      processedText = processEmotes(m.text, m.channel)
      if (m.emotes && m.emotes.length > 0) {
        processedText = processYtEmotes(processedText, m.emotes, true)
      }
      m._renderedHtml = processedText
    }

    // Sticker for super stickers
    let stickerHtml = ''
    if (m.sticker && m.sticker.url) {
      stickerHtml = ` <img src="${escapeHtml(m.sticker.url)}" alt="${escapeHtml(m.sticker.alt || 'sticker')}" style="height:48px;vertical-align:middle;" />`
    }

    const div = document.createElement('div');
    div.className = cls;
    if (isSuperChat && m.scColor) {
      const safeBg = sanitizeColor(m.scColor)
      div.style.background = safeBg + '22'
      div.style.borderLeft = `3px solid ${safeBg}`
      div.style.paddingLeft = '4px'
    }
    // Reply context bar (Chatterino-style) — all values escaped via escapeHtml
    const replyBar = m.replyTo ? `<div class="hs-mc-reply-ctx">&#8618; Replying to <a href="https://heatsync.org/user/${encodeURIComponent(m.replyTo.user)}" target="_blank" class="hs-mc-user hs-mc-reply-user" data-username="${escapeHtml(m.replyTo.user.toLowerCase())}">@${escapeHtml(m.replyTo.user)}</a>${m.replyTo.text ? ': ' + escapeHtml(m.replyTo.text.length > 80 ? m.replyTo.text.slice(0, 80) + '...' : m.replyTo.text) : ''}</div>` : ''
    // USERNOTICE system line (all values go through escapeHtml — same pattern as existing innerHTML above)
    const systemLine = m.systemMsg ? `<span class="hs-mc-system-text">${escapeHtml(m.systemMsg)}</span>` : ''
    const ts = formatTimeFromTs(m.time);
    const showTs = timestampsEnabled || tabId === 'mentions';
    const tsHtml = ts && showTs ? `<span class="hs-mc-ts" data-ts="${m.time}">${ts}</span>` : '';
    const msgBody = (m.type === 'usernotice' || m.type === 'notice') && !m.text
      ? `${tsHtml}${systemLine}`
      : m.type === 'notice'
      ? `${tsHtml}${processedText}`
      : m.isAction
      ? `${tsHtml}${systemLine}${platformBadge}${scBadge}${badges}${avatarHtml}${userLink}${channelSpan} <span style="color:${sanitizeColor(m.color || '#fff')};font-style:italic">${processedText}</span>${stickerHtml}`
      : `${tsHtml}${systemLine}${platformBadge}${scBadge}${badges}${avatarHtml}${userLink}${channelSpan}: ${processedText}${stickerHtml}`
    div.innerHTML = `${replyBar}${msgBody}`;
    // Correct emote states based on current inventory + blocked (cached HTML may have stale states)
    for (const w of div.querySelectorAll('.hs-mc-emote-wrapper[data-source="heatsync"]')) {
      const name = w.dataset.emoteName;
      const newState = blockedEmoteNames.has(name) ? 'blocked'
        : inventoryEmotes.has(name) ? 'owned'
        : 'unadded';
      if (w.dataset.state !== newState) {
        w.classList.remove('hs-state-owned', 'hs-state-unadded', 'hs-state-blocked', 'hs-state-global', 'hs-state-channel');
        w.classList.add(`hs-state-${newState}`);
        w.dataset.state = newState;
      }
    }
    // Reply button for threading (Twitch/Kick — needs valid msg id)
    if (m.id && m.platform !== 'youtube') {
      div.dataset.msgId = m.id
      div.dataset.msgUser = m.user
      div.dataset.msgChannel = m.channel || ''
      const replyBtn = document.createElement('button')
      replyBtn.className = 'hs-mc-reply-btn'
      replyBtn.textContent = '↩'
      replyBtn.title = 'Reply'
      div.appendChild(replyBtn)
    }
    return div;
  }

  // Process YouTube emotes (inline emoji images from innertube)
  // preEscaped=true when input is already HTML-escaped (chained after processEmotes)
  function processYtEmotes(text, emotes, preEscaped) {
    if (!emotes || emotes.length === 0) return preEscaped ? text : escapeHtml(text)

    // Build result by replacing emoji alt text with img tags
    let result = preEscaped ? text : escapeHtml(text)
    for (const emote of emotes) {
      const url = typeof emote.url === 'string' ? emote.url.trim() : ''
      const alt = typeof emote.alt === 'string' ? emote.alt : ''
      if (!alt || !url || !(url.startsWith('http') || url.startsWith('//'))) continue
      const escaped = escapeHtml(alt).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(escaped, 'g')
      result = result.replace(re, () => `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" class="hs-mc-emote" style="height:1.2em;vertical-align:middle;" />`)
    }
    return result
  }

  // Show "new" button for static tabs (activity/feed) — points up since newest is at top
  function showStaticNewButton() {
    const newBtn = document.getElementById('hs-mc-new-msgs');
    if (!newBtn) return;
    newMessageCount++;
    newBtn.innerHTML = `<span class="hs-arrow-down" style="transform:rotate(180deg)">▼</span> ${newMessageCount} new`;
    newBtn.style.display = 'flex';
  }

  // Scroll helper — reused by both renderMessages and appendMessage
  function scrollMsgsToBottom(msgsEl) {
    const scrollToBottom = () => {
      if (isScrolledUp) return;
      isProgrammaticScroll = true;
      msgsEl.scrollTop = msgsEl.scrollHeight + 10000;
      requestAnimationFrame(() => { isProgrammaticScroll = false; });
    };

    const newBtn = document.getElementById('hs-mc-new-msgs');
    newMessageCount = 0;
    if (newBtn) newBtn.style.display = 'none';

    scrollToBottom();
    requestAnimationFrame(() => {
      scrollToBottom();
      setTimeout(scrollToBottom, 50);
    });

    msgsEl.querySelectorAll('.hs-mc-emote').forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', scrollToBottom, { once: true });
      }
    });
  }

  // Incremental append for single messages on the active tab (hot path)
  // Returns true if handled, false if full rebuild needed
  function appendMessage(msg, tabId) {
    if (editingChannel) return false;
    if (isScrolledUp || currentTab !== tabId) return false;
    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return false;

    // Remove "no messages" placeholder
    const empty = msgsEl.querySelector('.hs-mc-empty');
    if (empty) empty.remove();

    const div = buildMessageDiv(msg, tabId);
    if (zebraEnabled && msg.type !== 'stream-event' && msg.type !== 'feed-post' && msg.type !== 'inline-dm') {
      if (!msgsEl._zebraCount) msgsEl._zebraCount = 0;
      msgsEl._zebraCount++;
      if (msgsEl._zebraCount % 2 === 0) div.classList.add('hs-mc-zebra');
    }
    msgsEl.appendChild(div);

    // Trim oldest messages beyond 150
    trimChildren(msgsEl, 150);

    // Apply mute to just this message — strip content for muted users
    const username = div.querySelector('.hs-mc-user')?.textContent?.trim()?.toLowerCase();
    if (username && mutedUsers.has(username)) {
      stripMcMutedMessage(div);
    }

    updateTabBadges();
    scrollMsgsToBottom(msgsEl);
    return true;
  }

  // Full rebuild — used for tab switches, scroll resume, and initial load
  // Invalidate cached rendered HTML on all messages (when emote data changes)
  function clearRenderedHtmlCache() {
    const clearBuf = (msgs) => { for (const m of msgs) delete m._renderedHtml };
    if (irc?.channels) for (const [, buf] of irc.channels) clearBuf(buf.getAll());
    if (kickChat?.channels) for (const [, buf] of kickChat.channels) clearBuf(buf.getAll());
    clearBuf(mentionsBuffer);
    for (const msgs of channelYtMessages.values()) clearBuf(msgs);
  }

  function renderMessages(id) {
    if (editingChannel) return;
    // Social tabs have their own renderers
    if (id === 'feed') { renderFeed(); return; }
    if (id === 'whispers') { renderWhispersTab(); return; }
    if (id === 'settings') { renderSettingsTab(); return; }

    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;

    const newBtn = document.getElementById('hs-mc-new-msgs');

    if (isScrolledUp) {
      newMessageCount++;
      if (newBtn) {
        newBtn.innerHTML = `<span class="hs-arrow-down">▼</span> ${newMessageCount} new`;
        newBtn.style.display = 'flex';
      }
      return;
    }

    let msgs = [];

    if (id === 'mentions') {
      msgs = mentionsBuffer;
    } else if (id === 'add') {
      renderAddChannelForm(msgsEl);
      return;
    } else if (id === 'live') {
      const curCh = getLiveChannel();
      // Ensure channel is joined + history loaded (handles picker overrides, SPA nav)
      if (curCh && irc && !irc.channels.has(curCh.toLowerCase())) irc.join(curCh);
      const ircMsgs = curCh ? (irc?.getMessages(curCh) || []) : [];
      // Kick messages for live tab: same channel name, or linked via config
      let kickMsgs = curCh ? (kickChat?.getMessages(curCh) || []) : [];
      if (!kickMsgs.length && curCh) {
        // Check if any config entry links current channel to a Kick channel
        const linked = config.channels.find(ch => typeof ch !== 'string' && ch.twitch === curCh && ch.kick);
        if (linked) kickMsgs = kickChat?.getMessages(linked.kick) || [];
      }
      if (kickMsgs.length > 0) {
        msgs = [...ircMsgs, ...kickMsgs].sort((a, b) => a.time - b.time);
      } else {
        msgs = ircMsgs;
      }
    } else {
      // Channel tab — merge IRC + Kick + per-channel YouTube messages
      const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === id);
      const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
      const kickName = typeof ch === 'string' ? null : ch?.kick;
      const ircMsgs = twitchName ? (irc?.getMessages(twitchName) || []) : [];
      const kickMsgs = kickName ? (kickChat?.getMessages(kickName) || []) : [];
      const ytMsgs = channelYtMessages.get(id) || [];
      const extraMsgs = [...kickMsgs, ...ytMsgs];
      if (extraMsgs.length > 0) {
        msgs = [...ircMsgs, ...extraMsgs].sort((a, b) => a.time - b.time);
      } else {
        msgs = ircMsgs;
      }
    }

    // Merge global stream events into every tab (game changes, online/offline)
    // Only include events within the time range of existing messages so old events
    // don't pile up as a wall before chat history starts
    if (activityEvents.length > 0 && msgs.length > 0) {
      const oldestMsg = msgs.reduce((min, m) => m.time < min ? m.time : min, msgs[0].time)
      const existingTexts = new Set(msgs.filter(m => m.type === 'stream-event').map(m => m.text))
      const missing = activityEvents.filter(e => !existingTexts.has(e.text) && e.time >= oldestMsg)
      if (missing.length > 0) {
        msgs = [...msgs, ...missing].sort((a, b) => a.time - b.time)
      }
    }

    updateTabBadges()

    if (msgs.length === 0) {
      msgsEl.textContent = ''
      const empty = document.createElement('div')
      empty.className = 'hs-mc-empty'
      empty.textContent = 'no messages yet'
      msgsEl.appendChild(empty)
      return
    }

    const toRender = msgs.slice(-150)
    isProgrammaticScroll = true;
    msgsEl.textContent = '';
    msgsEl._zebraCount = 0;
    const frag = document.createDocumentFragment();
    for (const m of toRender) {
      const div = buildMessageDiv(m, id);
      if (zebraEnabled && m.type !== 'stream-event' && m.type !== 'feed-post') {
        msgsEl._zebraCount++;
        if (msgsEl._zebraCount % 2 === 0) div.classList.add('hs-mc-zebra');
      }
      frag.appendChild(div);
    }
    msgsEl.appendChild(frag);
    applyMcMutes();

    requestAnimationFrame(() => { isProgrammaticScroll = false; });

    if (!isScrolledUp) {
      scrollMsgsToBottom(msgsEl);
    }
  }

  function sanitizeColor(color) {
    return /^#[0-9a-fA-F]{3,6}$/.test(color) ? color : '#ffffff';
  }





  function renderAddChannelForm(msgsEl) {
    msgsEl.textContent = ''
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#a8a8a8;font-size:13px;padding:20px;box-sizing:border-box;'

    const title = document.createElement('div')
    title.textContent = 'add channel'
    title.style.cssText = 'font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.5px;'
    wrapper.appendChild(title)

    const desc = document.createElement('div')
    desc.textContent = 'enter at least one platform'
    desc.style.cssText = 'font-size:13px;color:#626262;margin-bottom:2px;'
    wrapper.appendChild(desc)

    const makeRow = (label, placeholder) => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;max-width:300px;'
      const lbl = document.createElement('span')
      lbl.textContent = label
      lbl.style.cssText = 'font-size:13px;font-weight:600;min-width:56px;color:#949494;text-transform:lowercase;'
      const input = document.createElement('input')
      input.type = 'text'
      input.placeholder = placeholder
      input.style.cssText = 'flex:1;background:#ffffff;color:#000000;border:1px solid #808080;padding:6px 10px;border-radius:0;font-size:14px;outline:none;font-family:inherit;'
      row.appendChild(lbl)
      row.appendChild(input)
      return { row, input }
    }

    const twitch = makeRow('twitch', 'username')
    const kick = makeRow('kick', 'username')
    const yt = makeRow('youtube', 'username or url')

    wrapper.appendChild(twitch.row)
    wrapper.appendChild(kick.row)
    wrapper.appendChild(yt.row)

    // Error message (between inputs and buttons)
    const errEl = document.createElement('div')
    errEl.style.cssText = 'font-size:13px;color:#ff0000;display:none;'
    errEl.setAttribute('role', 'alert')
    wrapper.appendChild(errEl)

    const btnRow = document.createElement('div')
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;'

    const makeMcBtn = (text, primary) => {
      const btn = document.createElement('button')
      btn.textContent = text
      const base = primary
        ? 'background:transparent;color:#ffffff;border:1px solid #ffffff;'
        : 'background:transparent;color:#626262;border:1px solid #444444;'
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;'
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ffffff'; btn.style.color = '#000000'
      })
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent'
        btn.style.color = primary ? '#ffffff' : '#626262'
      })
      return btn
    }

    const addBtn = makeMcBtn('add', true)
    const cancelBtn = makeMcBtn('cancel', false)

    btnRow.appendChild(addBtn)
    btnRow.appendChild(cancelBtn)
    wrapper.appendChild(btnRow)

    msgsEl.appendChild(wrapper)

    cancelBtn.addEventListener('click', () => switchTab('live'))

    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; }

    const doAdd = () => {
      errEl.style.display = 'none'
      const twitchVal = twitch.input.value.trim().toLowerCase().replace(/^@/, '')
      const kickVal = kick.input.value.trim().toLowerCase().replace(/^@/, '')
      const ytVal = yt.input.value.trim() ? normalizeYtUrl(yt.input.value.trim()) : ''

      if (!twitchVal && !kickVal && !ytVal) {
        showErr('enter at least one platform')
        return
      }

      const id = twitchVal || kickVal || ('yt-' + Date.now())
      const reserved = ['live', 'feed', 'mentions', 'whispers', 'add', 'rotate', 'settings']
      if (reserved.includes(id)) {
        showErr('reserved name')
        return
      }
      if (config.channels.some(c => (typeof c === 'string' ? c : c.id) === id)) {
        showErr('channel already exists')
        return
      }
      // Check duplicate Twitch username across channels
      if (twitchVal && config.channels.some(c => (typeof c === 'string' ? c : c.twitch) === twitchVal)) {
        showErr('twitch channel already added')
        return
      }

      const channel = { id, twitch: twitchVal, kick: kickVal, youtube: ytVal }
      config.channels.push(channel)
      saveConfig()

      if (twitchVal) {
        irc?.join(twitchVal)
        try {
          chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchVal })
        } catch (e) { /* context invalidated */ }
      }
      if (kickVal) {
        kickChat?.join(kickVal)
      }
      if (ytVal) {
        youtubeLinks.set(id, { url: ytVal, videoId: '', channelName: '' })
        chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ytVal, channelId: id }).catch(() => {})
      }

      updateTabBar()
      switchTab(id)
    }

    addBtn.addEventListener('click', doAdd)
    // Tab cycles inputs, Enter submits, Escape cancels
    const inputs = [twitch.input, kick.input, yt.input]
    inputs.forEach((inp, i) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault()
          inputs[(i + (e.shiftKey ? inputs.length - 1 : 1)) % inputs.length].focus()
        }
        if (e.key === 'Enter') doAdd()
        if (e.key === 'Escape') switchTab('live')
      })
    })

    // Auto-focus twitch input
    requestAnimationFrame(() => twitch.input.focus())
  }

  function removeChannel(tabId) {
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
    config.channels = config.channels.filter(c => (typeof c === 'string' ? c : c.id) !== tabId);
    saveConfig();

    const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
    if (twitchName) irc?.part(twitchName);

    const kickName = typeof ch === 'string' ? null : ch?.kick;
    if (kickName) kickChat?.part(kickName);

    // Unsubscribe per-channel YouTube (pass URL as fallback if videoId not yet received)
    if (ch && typeof ch !== 'string' && ch.youtube) {
      const link = youtubeLinks.get(tabId);
      chrome.runtime.sendMessage({
        type: 'youtube_ws_unsubscribe',
        videoId: link?.videoId || '',
        url: ch.youtube,
        channelId: tabId,
      }).catch(() => {});
      youtubeLinks.delete(tabId);
      channelYtMessages.delete(tabId);
    }

    updateTabBar();
    if (currentTab === tabId) switchTab('live');
  }

  function showEditChannelForm(tabId) {
    let ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === tabId);
    if (!ch) return;
    editingChannel = true;
    // Normalize legacy string format
    if (typeof ch === 'string') {
      const idx = config.channels.indexOf(ch);
      ch = { id: ch, twitch: ch, kick: '', youtube: '' };
      config.channels[idx] = ch;
    }

    const msgsEl = document.getElementById('hs-mc-messages');
    if (!msgsEl) return;
    msgsEl.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:#a8a8a8;font-size:13px;padding:20px;box-sizing:border-box;';

    const title = document.createElement('div');
    title.textContent = 'edit ' + tabId;
    title.style.cssText = 'font-size:17px;font-weight:700;color:#ffffff;letter-spacing:.5px;';
    wrapper.appendChild(title);

    const makeRow = (label, placeholder, value) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;max-width:300px;';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      lbl.style.cssText = 'font-size:13px;font-weight:600;min-width:56px;color:#949494;text-transform:lowercase;';
      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = placeholder;
      input.value = value || '';
      input.style.cssText = 'flex:1;background:#ffffff;color:#000000;border:1px solid #808080;padding:6px 10px;border-radius:0;font-size:14px;outline:none;font-family:inherit;';
      row.appendChild(lbl);
      row.appendChild(input);
      return { row, input };
    };

    const twitch = makeRow('twitch', 'username', ch.twitch);
    const kick = makeRow('kick', 'username', ch.kick);
    const yt = makeRow('youtube', 'username or url', ch.youtube);
    wrapper.appendChild(twitch.row);
    wrapper.appendChild(kick.row);
    wrapper.appendChild(yt.row);

    const errEl = document.createElement('div');
    errEl.style.cssText = 'font-size:13px;color:#ff0000;display:none;';
    errEl.setAttribute('role', 'alert');
    wrapper.appendChild(errEl);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

    const makeMcBtn = (text, primary) => {
      const btn = document.createElement('button');
      btn.textContent = text;
      const base = primary
        ? 'background:transparent;color:#ffffff;border:1px solid #ffffff;'
        : 'background:transparent;color:#626262;border:1px solid #444444;';
      btn.style.cssText = base + 'padding:6px 22px;border-radius:0;cursor:pointer;font-weight:600;font-size:14px;font-family:inherit;min-width:80px;transition:all .15s;';
      btn.addEventListener('mouseenter', () => {
        btn.style.background = '#ffffff'; btn.style.color = '#000000';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
        btn.style.color = primary ? '#ffffff' : '#626262';
      });
      return btn;
    };

    const saveBtn = makeMcBtn('save', true);
    const cancelBtn = makeMcBtn('cancel', false);
    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    wrapper.appendChild(btnRow);
    msgsEl.appendChild(wrapper);

    cancelBtn.addEventListener('click', () => switchTab(tabId));
    const showErr = (msg) => { errEl.textContent = msg; errEl.style.display = 'block'; };

    const doSave = () => {
      errEl.style.display = 'none';
      const twitchVal = twitch.input.value.trim().toLowerCase().replace(/^@/, '');
      const kickVal = kick.input.value.trim().toLowerCase().replace(/^@/, '');
      const ytVal = yt.input.value.trim() ? normalizeYtUrl(yt.input.value.trim()) : '';

      if (!twitchVal && !kickVal && !ytVal) {
        showErr('enter at least one platform');
        return;
      }

      // Check duplicate twitch (excluding self)
      if (twitchVal && config.channels.some(c => c !== ch && (typeof c === 'string' ? c : c.twitch) === twitchVal)) {
        showErr('twitch channel already added');
        return;
      }

      // Part old channels if changed
      const oldTwitch = ch.twitch;
      const oldKick = ch.kick;
      const oldYt = ch.youtube;

      if (oldTwitch && oldTwitch !== twitchVal) irc?.part(oldTwitch);
      if (oldKick && oldKick !== kickVal) kickChat?.part(oldKick);

      // Unsubscribe old YouTube if changed
      if (oldYt && oldYt !== ytVal) {
        const oldLink = youtubeLinks.get(tabId);
        chrome.runtime.sendMessage({
          type: 'youtube_ws_unsubscribe',
          videoId: oldLink?.videoId || '',
          url: oldYt,
          channelId: tabId,
        }).catch(() => {});
        youtubeLinks.delete(tabId);
        channelYtMessages.delete(tabId);
      }

      // Update channel config
      ch.twitch = twitchVal;
      ch.kick = kickVal;
      ch.youtube = ytVal;

      // Update id to match primary platform
      const newId = twitchVal || kickVal || ch.id;
      if (newId !== ch.id) {
        // Migrate maps keyed by old id
        const ytData = youtubeLinks.get(tabId);
        const ytMsgs = channelYtMessages.get(tabId);
        if (ytData) { youtubeLinks.delete(tabId); youtubeLinks.set(newId, ytData); }
        if (ytMsgs) { channelYtMessages.delete(tabId); channelYtMessages.set(newId, ytMsgs); }
        ch.id = newId;
      }
      saveConfig();

      // Join new channels if changed
      if (twitchVal && twitchVal !== oldTwitch) {
        irc?.join(twitchVal);
        try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchVal }); } catch (e) {}
      }
      if (kickVal && kickVal !== oldKick) kickChat?.join(kickVal);
      if (ytVal && ytVal !== oldYt) {
        youtubeLinks.set(newId, { url: ytVal, videoId: '', channelName: '' });
        chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ytVal, channelId: newId }).catch(() => {});
      }

      updateTabBar();
      switchTab(newId);
    };

    saveBtn.addEventListener('click', doSave);
    const inputs = [twitch.input, kick.input, yt.input];
    inputs.forEach((inp, i) => {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          inputs[(i + (e.shiftKey ? inputs.length - 1 : 1)) % inputs.length].focus();
        }
        if (e.key === 'Enter') doSave();
        if (e.key === 'Escape') switchTab(tabId);
      });
    });
    requestAnimationFrame(() => twitch.input.focus());
  }

  function updateTabIndicator(tabId) {
    const tab = tabBarElement?.querySelector(`[data-tab="${tabId}"]`);
    if (!tab || currentTab === tabId) return;

    // Don't light up duplicate tabs showing the same channel
    // If on live, suppress channel tab indicator for the live channel
    // If on a channel tab, suppress live tab indicator for the same channel
    const liveCh = getLiveChannel()?.toLowerCase();
    if (liveCh) {
      if (currentTab === 'live' && tabId !== 'feed' && tabId !== 'mentions') {
        const chConfig = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === tabId);
        if (chConfig) {
          const tw = (typeof chConfig === 'string' ? chConfig : chConfig.twitch)?.toLowerCase();
          const ki = (typeof chConfig === 'string' ? undefined : chConfig.kick)?.toLowerCase();
          if (tw === liveCh || ki === liveCh) return;
        }
      }
      if (tabId === 'live') {
        const curConfig = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.id) === currentTab);
        if (curConfig) {
          const tw = (typeof curConfig === 'string' ? curConfig : curConfig.twitch)?.toLowerCase();
          const ki = (typeof curConfig === 'string' ? undefined : curConfig.kick)?.toLowerCase();
          if (tw === liveCh || ki === liveCh) return;
        }
      }
    }

    tab.classList.add('has-new');
    if (tabId === 'mentions') tab.classList.add('has-mentions');
  }

  function updateTabMentionIndicator(tabId) {
    const tab = tabBarElement?.querySelector(`[data-tab="${tabId}"]`)
    if (tab && currentTab !== tabId) {
      tab.classList.add('has-new', 'has-mentions')
    }
  }

  // ============================================
  // LIVE STATUS POLLING
  // ============================================

  let liveStatusInterval = null;

  function startLiveStatusPolling() {
    updateLiveStatus();
    liveStatusInterval = cleanup.setInterval(updateLiveStatus, 30000);
  }

  async function updateLiveStatus() {
    if (!tabBarElement) return;
    const channels = config.channels
      .map(ch => typeof ch === 'string' ? ch : ch.twitch || ch.id)
      .filter(Boolean);
    // Also check URL channel (for popout / non-config channels)
    const urlCh = getCurrentChannel();
    if (urlCh && !channels.some(c => c.toLowerCase() === urlCh.toLowerCase())) {
      channels.push(urlCh);
    }
    if (channels.length === 0) return;

    try {
      const data = await chrome.runtime.sendMessage({ type: 'fetch_live_status', channels });
      if (!data?.live) return;
      const liveSet = new Set(data.live.map(c => c.toLowerCase()));
      liveChannelSet = liveSet;

      config.channels.forEach(ch => {
        const id = typeof ch === 'string' ? ch : ch.id;
        const twitch = typeof ch === 'string' ? ch : ch.twitch || ch.id;
        const tab = tabBarElement?.querySelector(`[data-tab="${id}"]`);
        if (tab) tab.dataset.live = String(liveSet.has(twitch.toLowerCase()));
      });

      // Update live tab's own red dot based on selected channel
      const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
      const curLive = getLiveChannel()?.toLowerCase();
      if (liveTab) liveTab.dataset.live = String(curLive && liveSet.has(curLive));

      // If override channel went offline, fall back to URL channel or first live
      if (liveChannel && !liveSet.has(liveChannel)) {
        liveChannel = null;
        updateLiveTabLabel();
        if (currentTab === 'live') renderMessages('live');
      }

      // Auto-select if no override and URL channel isn't live but others are
      if (!liveChannel && urlCh && !liveSet.has(urlCh.toLowerCase()) && liveSet.size > 0) {
        // Don't auto-override — user can pick via the menu
      }
    } catch (e) { /* network error, skip */ }
  }

  // ============================================
  // USERNAME & MENTIONS
  // ============================================

  /**
   * Get current channel from URL
   */
  function getCurrentChannel() {
    // Match /username or /popout/username/chat or /embed/username/chat
    const match = location.pathname.match(/^\/(?:popout\/|embed\/)?([a-zA-Z0-9_]+)/);
    if (match && match[1]) {
      const channel = match[1].toLowerCase();
      // Skip non-channel pages
      if (['directory', 'settings', 'videos', 'moderator', 'subscriptions'].includes(channel)) {
        return null;
      }
      return channel;
    }
    return null;
  }

  /** Channel the live tab is currently showing (override or URL fallback) */
  function getLiveChannel() {
    return liveChannel || getCurrentChannel();
  }

  // Check if a message belongs to the live tab — direct match OR paired via config
  // e.g., on twitch.tv/asmongold with config {twitch:"zackrawrr", kick:"asmongold"}
  // → shows both zackrawrr Twitch messages AND asmongold Kick messages
  function isLiveChannelMessage(msg) {
    const curCh = getLiveChannel()?.toLowerCase()
    if (!curCh) return false
    const mc = msg.channel?.toLowerCase()
    if (mc === curCh) return true
    // Check configured channel pairs — either side can be the live channel
    return config.channels.some(ch => {
      if (typeof ch === 'string') return false
      const tw = ch.twitch?.toLowerCase()
      const ki = ch.kick?.toLowerCase()
      return (tw === curCh && ki === mc) || (ki === curCh && tw === mc)
    })
  }

  /** Update the live tab button label to show selected channel */
  function updateLiveTabLabel() {
    const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
    if (!liveTab) return;
    const ch = liveChannel;
    // Show channel name when overridden to a non-URL channel
    if (ch && ch !== getCurrentChannel()?.toLowerCase()) {
      liveTab.textContent = `live \u00b7 ${ch}`;
    } else {
      liveTab.textContent = 'live';
    }
  }

  /** Query background script for all channels the user has open tabs for */
  async function getWatchingChannels() {
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'get_watching_channels' });
      return resp?.channels || [];
    } catch (e) {
      return [];
    }
  }

  /** Show picker for choosing which live channel to view */
  async function showLiveChannelPicker(anchorEl) {
    document.getElementById('hs-mc-live-picker')?.remove();

    const urlCh = getCurrentChannel()?.toLowerCase();
    const watching = await getWatchingChannels();

    // Check which watching channels are actually live
    const watchNames = watching.map(w => w.name);
    if (urlCh && !watchNames.includes(urlCh)) watchNames.push(urlCh);
    let liveSet = liveChannelSet;
    if (watchNames.length > 0) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'fetch_live_status', channels: watchNames });
        if (resp?.live) liveSet = new Set(resp.live.map(c => c.toLowerCase()));
      } catch (e) { /* use cached liveChannelSet */ }
    }

    // Only show channels that are actually live
    const channels = [];
    const seen = new Set();
    for (const w of watching) {
      const ch = w.name.toLowerCase();
      if (seen.has(ch) || !liveSet.has(ch)) continue;
      seen.add(ch);
      channels.push({ name: ch, platform: w.platform, isCurrent: ch === urlCh });
    }

    if (channels.length <= 1) {
      // 0 or 1 live channel — just switch to live normally
      if (channels.length === 1 && document.body.classList.contains('hs-popout') && channels[0].name !== urlCh) {
        if (hostPlatform === 'twitch') location.href = `/popout/${channels[0].name}/chat?popout=`;
        else if (hostPlatform === 'kick') location.href = `/${channels[0].name}`;
        return;
      }
      switchTab('live');
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'hs-mc-live-picker';
    const rect = anchorEl.getBoundingClientRect();
    menu.style.cssText = `position:fixed;z-index:99999;background:#111;border:1px solid #444;padding:4px 0;min-width:130px;font-size:12px;font-family:inherit;left:${rect.left}px;top:${rect.bottom + 2}px;`;

    const curLive = getLiveChannel()?.toLowerCase();

    for (const ch of channels) {
      const item = document.createElement('div');
      const isActive = ch.name === curLive;

      // Red dot — all channels in picker are confirmed live
      const dot = document.createElement('span');
      dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;background:#f00;margin-right:6px;vertical-align:middle`;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(ch.name));

      item.style.cssText = `padding:6px 12px;cursor:pointer;color:${isActive ? '#ff8700' : '#fff'};white-space:nowrap;`;
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)');
      item.addEventListener('mouseleave', () => item.style.background = 'none');
      item.addEventListener('click', () => {
        menu.remove();
        // In popout mode, navigate to the channel's popout URL
        if (document.body.classList.contains('hs-popout')) {
          if (ch.platform === 'twitch' || hostPlatform === 'twitch') {
            location.href = `/popout/${ch.name}/chat?popout=`;
          } else if (ch.platform === 'kick' || hostPlatform === 'kick') {
            location.href = `/${ch.name}`;
          }
          return;
        }
        liveChannel = ch.name;
        updateLiveTabLabel();
        switchTab('live');
      });
      menu.appendChild(item);
    }

    document.body.appendChild(menu);

    // Clamp position so menu stays fully visible
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.right > window.innerWidth) {
      menu.style.left = Math.max(0, window.innerWidth - menuRect.width - 4) + 'px';
    }
    if (menuRect.bottom > window.innerHeight) {
      menu.style.top = Math.max(0, rect.top - menuRect.height - 2) + 'px';
    }

    // Dismiss on outside click
    const dismiss = (e) => {
      if (!menu.contains(e.target) && e.target !== anchorEl) {
        menu.remove();
        document.removeEventListener('click', dismiss, true);
      }
    };
    setTimeout(() => document.addEventListener('click', dismiss, true), 0);
  }

  function getCurrentUsername() {
    // Method 1: localStorage displayName
    try {
      const displayName = localStorage.getItem('twilight.user.displayName');
      if (displayName) {
        const name = displayName.replace(/"/g, '').trim();
        if (name && name.length > 0 && name.length < 30) {
          return name.toLowerCase();
        }
      }
    } catch (e) {}

    // Method 2: localStorage user object
    try {
      const twilight = localStorage.getItem('twilight.user');
      if (twilight) {
        const data = JSON.parse(twilight);
        if (data?.displayName) return data.displayName.toLowerCase();
      }
    } catch (e) {}

    // Method 3: Twitch 'name' cookie (works in popout chat)
    try {
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === 'name' && value) {
          const name = decodeURIComponent(value).toLowerCase();
          if (name.length > 0 && name.length < 30) {
            log('Found username from cookie:', name);
            return name;
          }
        }
      }
    } catch (e) {}

    // Kick methods
    if (hostPlatform === 'kick') {
      // Method K1: Kick profile link in sidebar/nav
      try {
        const profileLink = document.querySelector('a[href^="/profile"]');
        if (profileLink) {
          const match = profileLink.getAttribute('href')?.match(/\/profile\/([^/?]+)/);
          if (match?.[1]) return match[1].toLowerCase();
        }
      } catch (e) {}
      // Method K2: Kick sidebar username
      try {
        const userEl = document.querySelector('.sidebar-username, nav [class*="username"]');
        if (userEl?.textContent?.trim()) {
          const name = userEl.textContent.trim();
          if (name.length > 0 && name.length < 30 && /^[a-zA-Z0-9_]+$/.test(name)) return name.toLowerCase();
        }
      } catch (e) {}
    }

    return null;
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  let _mentionRe = null
  let _mentionReUser = null
  function isMention(msg) {
    if (!currentUsername) return false
    if (msg.user && msg.user.toLowerCase() === currentUsername) return false
    const text = msg.text.toLowerCase()
    if (text.includes('@' + currentUsername)) return true
    if (_mentionReUser !== currentUsername) {
      _mentionRe = new RegExp(`\\b${escapeRegex(currentUsername)}\\b`, 'i')
      _mentionReUser = currentUsername
    }
    return _mentionRe.test(text)
  }

  // Browser notifications (gated by hs_notifications setting)
  let notificationsEnabled = false
  let notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  api.storage.local.get('hs_notifications').then(data => {
    notificationsEnabled = data.hs_notifications === true
    // Request permission on Firefox (Chrome extensions get it automatically)
    if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
      Notification.requestPermission().then(p => { notificationPermission = p })
    }
  })
  api.storage.onChanged.addListener((changes) => {
    if (changes.hs_notifications) {
      notificationsEnabled = changes.hs_notifications.newValue === true
      if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
        Notification.requestPermission().then(p => { notificationPermission = p })
      }
    }
  })

  function fireNotification(title, body, tag) {
    if (!notificationsEnabled) return
    if (notificationPermission === 'denied') return
    try {
      const iconUrl = api.runtime.getURL('icon-48.png')
      const n = new Notification(title, { body, icon: iconUrl, tag, silent: false })
      n.onclick = () => { window.focus(); n.close() }
      setTimeout(() => n.close(), 8000)
    } catch {}
  }

  function notifyMention(msg) {
    if (!notificationsEnabled) return
    if (document.hasFocus()) return
    const channel = msg.channel ? ` in #${msg.channel}` : ''
    const title = `${msg.user}${channel}`
    const body = msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text
    fireNotification(title, body, 'hs-mention-' + Date.now())
  }

  function notifyStreamEvent(channel, eventType, game) {
    if (!notificationsEnabled) return
    if (document.hasFocus()) return
    let title, body
    if (eventType === 'stream:online') {
      title = `${channel} went live`
      body = game || ''
    } else if (eventType === 'stream:update') {
      title = `${channel} switched game`
      body = game || ''
    } else {
      return
    }
    fireNotification(title, body, `hs-stream-${channel}-${Date.now()}`)
  }

  /**
   * Scan existing chat messages in DOM for mentions (on load)
   */
  function scanExistingMentions() {
    if (!currentUsername) {
      log('Cannot scan mentions - no username');
      return;
    }

    // Twitch + Kick message selectors
    const messages = document.querySelectorAll('[data-a-target="chat-line-message"], #chatroom-messages [data-index]');
    log('Scanning', messages.length, 'existing messages for mentions of', currentUsername);

    let found = 0;
    const escaped = escapeRegex(currentUsername)
    const mentionRe = new RegExp(`\\b${escaped}\\b`, 'i')
    messages.forEach(msgEl => {
      // Only check message text, not the full element (which includes sender name)
      const messageEl = msgEl.querySelector('[data-a-target="chat-message-text"], span.font-normal');
      const text = messageEl?.textContent || '';
      const textLower = text.toLowerCase();
      if (textLower.includes('@' + currentUsername) || mentionRe.test(textLower)) {
        const usernameEl = msgEl.querySelector('[data-a-target="chat-message-username"], button.inline.font-bold');
        const username = usernameEl?.textContent || 'unknown';
        // Skip own messages
        if (username.toLowerCase() === currentUsername) return;

        mentionsBuffer.push({
          user: username,
          text: text,
          color: '#fff',
          channel: getCurrentChannel() || 'live',
          time: Date.now() - (messages.length - found) * 1000 // Approximate time
        });
        found++;
      }
    });

    if (found > 0) {
      log('Found', found, 'existing mentions');
      updateTabIndicator('mentions');
    }
  }

  // ============================================
  // STORAGE
  // ============================================

  async function loadConfig() {
    try {
      const s = await chrome.storage.local.get([STORAGE_KEY]);
      config = { channels: [], enabled: true, ...s[STORAGE_KEY] };
      // Migrate old string channels to object format
      let needsSave = false;
      if (config.channels.some(c => typeof c === 'string')) {
        config.channels = config.channels.map(ch =>
          typeof ch === 'string' ? { id: ch, twitch: ch, kick: '', youtube: '' } : ch
        );
        needsSave = true;
      }
      if (needsSave) saveConfig();
      // Subscribe per-channel YouTube links
      for (const ch of config.channels) {
        if (typeof ch !== 'string' && ch.youtube) {
          youtubeLinks.set(ch.id, { url: ch.youtube, videoId: '', channelName: '' });
          chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: ch.youtube, channelId: ch.id }).catch(() => {});
        }
      }
    } catch (e) {}
  }

  async function saveConfig() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: config });
    } catch (e) {}
  }

  // ============================================
  // TABS POSITION SETTING
  // ============================================

  async function loadTabsPosition() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      // Migration: tabsOnRight → tabPosition
      if (stored.ui_settings?.tabsOnRight !== undefined && stored.ui_settings?.tabPosition === undefined) {
        tabPosition = stored.ui_settings.tabsOnRight ? 'right' : 'top';
        stored.ui_settings.tabPosition = tabPosition;
        delete stored.ui_settings.tabsOnRight;
        await chrome.storage.local.set({ ui_settings: stored.ui_settings });
        log('Migrated tabsOnRight to tabPosition:', tabPosition);
      } else if (stored.ui_settings?.tabPosition !== undefined) {
        tabPosition = stored.ui_settings.tabPosition;
      }
      applyTabsPosition();
    } catch (e) {
      log('Error loading tabs position:', e);
    }
  }

  let _savedActiveTab = null;
  const BUILTIN_TABS = ['live', 'feed', 'mentions', 'add'];
  async function loadActiveTab() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const saved = stored.ui_settings?.activeTab || 'live';
      // Validate: must be a built-in tab or a configured channel (never restore 'add')
      const channelIds = config.channels.map(c => typeof c === 'string' ? c : c.id);
      _savedActiveTab = (saved !== 'add' && (BUILTIN_TABS.includes(saved) || channelIds.includes(saved)))
        ? saved : 'live';
      // Restore live channel override
      if (stored.ui_settings?.liveChannel) {
        liveChannel = stored.ui_settings.liveChannel;
      }
    } catch (e) {
      _savedActiveTab = 'live';
    }
  }

  let _applyingPosition = false
  function applyTabsPosition() {
    if (_applyingPosition) return
    _applyingPosition = true
    try { _applyTabsPositionInner() } finally { _applyingPosition = false }
  }
  function _applyTabsPositionInner() {
    document.body.classList.remove('hs-tabs-top', 'hs-tabs-right', 'hs-tabs-bottom', 'hs-tabs-left');
    if (tabPosition !== 'top') {
      document.body.classList.add(`hs-tabs-${tabPosition}`);
    }

    // Re-apply column width (accounts for vertical tab offset)
    applyChatWidth()

    log('Tabs position:', tabPosition);
  }

  function rotateTabPosition() {
    const positions = ['top', 'right', 'bottom', 'left'];
    const currentIndex = positions.indexOf(tabPosition);
    const prev = tabPosition
    tabPosition = positions[(currentIndex + 1) % positions.length];
    log('rotate:', prev, '→', tabPosition)

    applyTabsPosition();
    saveTabPosition();
    renderMessages(currentTab);
  }

  async function saveTabPosition() {
    try {
      const stored = await chrome.storage.local.get(['ui_settings']);
      const settings = stored.ui_settings || {};
      settings.tabPosition = tabPosition;
      delete settings.tabsOnRight; // Remove old setting
      await chrome.storage.local.set({ ui_settings: settings });
    } catch (e) {
      log('Error saving tab position:', e);
    }
  }

  function listenForSettingsChanges() {
    if (window._hsMcSettingsListener) return;
    window._hsMcSettingsListener = true;

    // Listen for messages from popup
    chrome.runtime?.onMessage?.addListener((msg) => {
      if (msg.type === 'ui_settings_changed' && msg.settings) {
        log('Settings changed via message:', msg.settings);
        if (msg.settings.tabPosition !== undefined && msg.settings.tabPosition !== tabPosition) {
          tabPosition = msg.settings.tabPosition;
          applyTabsPosition();
        }
      }
      if (msg.type === 'debug_log') console.log('[hs-bg]', msg.msg);
      // Listen for emote updates from background
      if (msg.type === 'global_emotes_update' || msg.type === 'channel_emotes_update') {
        log('received', msg.type, msg.channelOwner || '');
        clearTimeout(emoteReloadTimer);
        emoteReloadTimer = setTimeout(() => {
          loadEmotes().then(() => renderMessages(currentTab));
        }, 300);
      }
      // Inventory changes: update membership + ensure emotes are in cache for tab completion
      // Old messages keep their rendered emotes, new messages use updated inventory
      if (msg.type === 'inventory_update') {
        inventoryEmotes.clear();
        inventoryHashes.clear();
        (msg.emotes || []).forEach(e => {
          if (e.name) {
            inventoryEmotes.add(e.name);
            if (e.hash) inventoryHashes.set(e.name, e.hash);
            // Ensure emote is in cache for tab completion + rendering
            if (!emoteCache.has(e.name) && e.url) {
              emoteCache.set(e.name, { url: e.url, source: 'heatsync', state: 'owned', hash: e.hash });
            } else if (emoteCache.has(e.name)) {
              emoteCache.get(e.name).state = 'owned';
            }
          }
        });
        // Remove emotes no longer in inventory from cache (if heatsync source)
        for (const [name, emote] of emoteCache) {
          if (emote.source === 'heatsync' && !inventoryEmotes.has(name)) {
            emoteCache.delete(name);
          }
        }
        log('inventory_update:', inventoryEmotes.size, 'emotes');
      }

      // 7TV emote add/remove → persistent stream-event in chat
      if (msg.type === 'channel_emote_added' || msg.type === 'channel_emote_removed') {
        const text = msg.message;
        if (text) {
          const eventClass = msg.type === 'channel_emote_added' ? 'event-online' : 'event-offline';
          const evt = { type: 'stream-event', eventClass, text, channel: '7tv', time: Date.now() };

          const liveChannel = getLiveChannel();
          const liveBuffer = liveChannel ? irc?.channels?.get(liveChannel) : null;
          if (liveBuffer) {
            const existing = liveBuffer.getAll();
            if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
              liveBuffer.push(evt);
              saveStreamEvent(evt);
            }
          }
          if (irc?.channels) {
            for (const [ch, buf] of irc.channels) {
              if (ch === liveChannel) continue;
              const existing = buf.getAll();
              if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
                buf.push(evt);
              }
            }
          }
          renderMessages(currentTab);
        }
      }
    });

    // Also listen for storage changes (more reliable)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;

      // UI settings
      if (changes.ui_settings) {
        const newSettings = changes.ui_settings.newValue || {};
        log('Settings changed via storage:', newSettings);
        if (newSettings.tabPosition !== undefined && newSettings.tabPosition !== tabPosition) {
          tabPosition = newSettings.tabPosition;
          applyTabsPosition();
        }
        if (newSettings.showPlatformBadges !== undefined) {
          platformBadgesEnabled = newSettings.showPlatformBadges;
        }
      }

      // Emote updates - reload when storage changes (debounced to avoid spam)
      if (changes.global_emotes || changes.channel_emotes_map || changes.emote_inventory || changes.native_twitch_emotes) {
        log('storage changed:', changes.channel_emotes_map ? 'channel_emotes_map' : '', changes.global_emotes ? 'global_emotes' : '', changes.emote_inventory ? 'emote_inventory' : '', changes.native_twitch_emotes ? 'native_twitch_emotes' : '');
        // New emote data = invalidate render cache so messages re-process with new emotes
        if (changes.global_emotes || changes.channel_emotes_map || changes.native_twitch_emotes) {
          clearRenderedHtmlCache();
        }
        clearTimeout(emoteReloadTimer);
        emoteReloadTimer = setTimeout(() => {
          loadEmotes().then(() => {
            if (!isScrolledUp) renderMessages(currentTab);
          });
        }, 300);
      }

      // Blocked emotes
      if (changes.blocked_emotes) {
        loadBlockedEmotes().then(() => {
          if (!isScrolledUp) {
            renderMessages(currentTab);
          }
        });
      }
    });
  }

  // ============================================
  // OFFLINE DETECTION
  // ============================================

  function detectOfflineState() {
    if (isKick) return
    // Popout chat has no video — don't mark as offline
    if (location.pathname.match(/^\/(popout|embed)\//)) return

    let wasOffline = null

    function checkOffline() {
      const playerOffline = !!document.querySelector('.channel-root__player--offline')
      const isLive = !playerOffline && !!document.querySelector(
        '[class*="stream-type-indicator"], [data-a-target="player-overlay-click-handler"] video, .video-player video'
      )
      const isOffline = !isLive
      document.body.classList.toggle('hs-offline', isOffline)
      // On state change, recalculate player width
      if (wasOffline !== null && wasOffline !== isOffline) {
        applyChatWidth()
      }
      wasOffline = isOffline
    }

    // Immediate check
    checkOffline()

    // Fast polling for first 10s (covers React paint delay)
    let fastChecks = 0
    const fastId = cleanup.setInterval(() => {
      checkOffline()
      if (++fastChecks >= 10) cleanup.clearInterval(fastId)
    }, 1000)

    // Steady-state polling
    cleanup.setInterval(checkOffline, 5000)

    // MutationObserver for instant transitions
    const root = document.querySelector('[class*="channel-root"]') || document.body
    const observer = new MutationObserver(() => checkOffline())
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    cleanup.trackObserver(observer)
  }

  // ============================================
  // MAIN INITIALIZATION
  // ============================================

  let mcInitialized = false;
  async function init() {
    let isPopout = false;
    if (isKick) {
      // Kick: run on channel pages (/<channel>) or popout
      const isKickChannel = location.pathname.match(/^\/[a-zA-Z0-9_-]+\/?$/);
      if (!isKickChannel) return;
      const kickPath = location.pathname.replace(/\/$/, '').slice(1).toLowerCase();
      if (['categories', 'following', 'search', 'settings'].includes(kickPath)) return;
    } else {
      // Twitch: Run on channel pages AND popout chat
      const isChannelPage = location.pathname.match(/^\/[a-zA-Z0-9_]+\/?$/);
      isPopout = !!location.pathname.match(/^\/(popout|embed)\/[a-zA-Z0-9_]+\/chat/);
      if (!isChannelPage && !isPopout) return;
      const pathName = location.pathname.replace(/\/$/, '').slice(1).toLowerCase();
      if (['directory', 'settings', 'videos', 'moderator', 'subscriptions', 'downloads', 'search'].includes(pathName)) return;

    }
    if (mcInitialized) return;
    mcInitialized = true;

    await loadConfig();
    if (!config.enabled) return;

    log('Initializing...');

    // Add popout class to body for CSS targeting
    if (isPopout) {
      document.body.classList.add('hs-popout');
    }

    currentUsername = getCurrentUsername();
    // Fallback: get username from HeatSync user_info in storage
    if (!currentUsername) {
      try {
        const ui = await chrome.storage.local.get('user_info')
        if (ui.user_info?.username) currentUsername = ui.user_info.username.toLowerCase()
      } catch {}
    }
    log('Username:', currentUsername);

    // Load muted users from chrome.storage.local
    try {
      const stored = await chrome.storage.local.get(['heatsync_mc_muted']);
      if (stored.heatsync_mc_muted && Array.isArray(stored.heatsync_mc_muted)) {
        mutedUsers = new Set(stored.heatsync_mc_muted);
      }
    } catch (e) {
      log('Error loading muted users:', e);
    }

    injectStyles();
    detectOfflineState();
    await loadActiveTab();
    await loadTabsPosition();
    await loadEmoteSize();
    await loadWysiwygSetting();
    await loadLinksSetting();
    await loadViModeSetting();
    await loadInlineNotifSettings();
    await loadHermesSettings();
    await loadPlatformBadgesSetting();
    await loadZebraSetting();
    await loadAutoHideSetting();
    await loadTimestampsSetting();
    await loadAvatarsSetting();
    await loadOfflineEventsSetting();
    await loadBlockedEmotes();
    await loadEmotes();

    // Request background to re-send channel emotes (may have been fetched before we loaded)
    try {
      chrome.runtime.sendMessage({ type: 'get_channel_emotes' });
    } catch (e) { /* context invalidated */ }

    setupEmoteTooltipHandlers();
    setupUserTooltipHandlers();
    setupLinkTooltipHandlers();
    listenForSettingsChanges();

    // Load heatsync auth state
    loadHsAuth();

    // Listen for social tab events from background
    listenForSocialEvents();

    // Load whisper conversations from storage
    loadWhispers();

    // Initialize IRC (runs on both Twitch and Kick — cross-platform relay)
    irc = new IRC();
    irc.connect();

    // Connect auth IRC eagerly for whisper reception
    // Whispers arrive via IRC WHISPER command on authenticated connections
    // (twitch.tv/commands cap). Without this, auth IRC only connects on first send.
    if (hostPlatform === 'twitch') {
      const token = getTwitchAuthToken()
      const nick = currentUsername || getCurrentUsername()
      if (token && nick) {
        connectAuthIrc(token, nick).then(ok => {
          if (ok === true) log('Auth IRC ready (whispers enabled)')
        })
      }
    }

    // Initialize Kick chat (runs on both platforms — cross-platform relay)
    kickChat = new KickChat();
    kickChat.connect();

    // Auto-join current channel on native platform
    const currentChannel = getCurrentChannel();
    if (currentChannel) {
      if (hostPlatform === 'twitch') {
        irc.join(currentChannel);
        kickChat.join(currentChannel); // Join same-name Kick channel if it exists
      } else if (hostPlatform === 'kick') {
        kickChat.join(currentChannel);
      }
      log('Auto-joined current channel:', currentChannel);
    }

    // Ensure live channel override is also joined (may differ from URL channel)
    const liveCh = getLiveChannel();
    if (liveCh && liveCh !== currentChannel && hostPlatform === 'twitch') {
      irc.join(liveCh);
      log('Auto-joined live channel override:', liveCh);
    }

    config.channels.forEach(ch => {
      const twitchName = typeof ch === 'string' ? ch : ch.twitch;
      const kickName = typeof ch === 'string' ? null : ch.kick;
      if (twitchName) {
        irc.join(twitchName);
        try {
          log('sending join_channel for:', twitchName);
          chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: twitchName });
        } catch (e) { log('join_channel failed:', e.message); }
      }
      if (kickName) {
        kickChat.join(kickName);
      }
    });

    // Restore persisted stream events into buffers
    loadStreamEvents().then(() => {
      if (streamEventsLoaded) {
        const active = currentTab;
        if (active === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)) {
          renderMessages(active);
        }
      }
    });

    // Scan existing chat for mentions (before IRC catches new ones)
    cleanup.setTimeout(() => scanExistingMentions(), 2000);

    // Handle incoming IRC messages
    irc.on('message', (msg) => {
      // Track sub tenure from IRC badge-info
      if (msg.subMonths && msg.channel) {
        trackSubTenure(msg.channel, msg.user, msg.subMonths)
      }
      // Cache own badges for optimistic display
      if (msg.user?.toLowerCase() === currentUsername?.toLowerCase() && msg.badges) {
        _ownBadges = msg.badges
      }
      // Suppress echo of own sent messages (dedup dual-send)
      if (isSentEcho(msg.text)) return
      const isMent = isMention(msg)
      if (isMent) {
        mentionsBuffer.push(msg);
        if (mentionsBuffer.length > MAX_BUFFER + 50) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER);
        notifyMention(msg);

        if (currentTab === 'mentions') {
          mentionsSeenCount = mentionsBuffer.length;
          if (!appendMessage(msg, 'mentions')) renderMessages('mentions');
        } else {
          updateTabIndicator('mentions');
        }
      }

      // Channel tab routing
      const chTabId = config.channels.find(ch => (typeof ch === 'string' ? ch : ch.twitch) === msg.channel);
      const tabId = typeof chTabId === 'string' ? chTabId : chTabId?.id;
      if (tabId && currentTab === tabId) {
        if (!appendMessage(msg, tabId)) renderMessages(tabId);
      } else if (tabId) {
        updateTabIndicator(tabId);
        if (isMent) updateTabMentionIndicator(tabId)
      }

      // Live tab: show if this channel matches live OR is paired via config
      if (isLiveChannelMessage(msg)) {
        if (currentTab === 'live') {
          if (!appendMessage(msg, 'live')) renderMessages('live');
        } else {
          updateTabIndicator('live');
          if (isMent) updateTabMentionIndicator('live')
        }
      }
    });

    // Handle incoming Kick messages
    kickChat.on('message', (msg) => {
      // Suppress echo of own sent messages (dedup dual-send)
      if (isSentEcho(msg.text)) return
      const isMent = isMention(msg)
      if (isMent) {
        mentionsBuffer.push(msg);
        if (mentionsBuffer.length > MAX_BUFFER + 50) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER);
        notifyMention(msg);

        if (currentTab === 'mentions') {
          mentionsSeenCount = mentionsBuffer.length;
          if (!appendMessage(msg, 'mentions')) renderMessages('mentions');
        } else {
          updateTabIndicator('mentions');
        }
      }

      // Channel tab routing — find config entry where ch.kick matches
      const chConfig = config.channels.find(ch => typeof ch !== 'string' && ch.kick === msg.channel);
      const tabId = chConfig?.id;
      if (tabId && currentTab === tabId) {
        if (!appendMessage(msg, tabId)) renderMessages(tabId);
      } else if (tabId) {
        updateTabIndicator(tabId);
        if (isMent) updateTabMentionIndicator(tabId)
      }

      // Live tab: show if this channel matches live OR is paired via config
      if (isLiveChannelMessage(msg)) {
        if (currentTab === 'live') {
          if (!appendMessage(msg, 'live')) renderMessages('live');
        } else {
          updateTabIndicator('live');
          if (isMent) updateTabMentionIndicator('live')
        }
      }
    });

    // Handle stream events (game switch, online/offline) from HeatSync WS
    if (!window._hsMcStreamEventListener) {
      window._hsMcStreamEventListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'stream_event') return;
        const channel = msg.channel?.toLowerCase();
        if (!channel) return;

        // Build inline notification
        let text = '', eventClass = '';
        if (msg.eventType === 'stream:update' && msg.game && msg.prevGame !== msg.game) {
          text = msg.prevGame
            ? `[${channel}] \u25C6 switched to ${msg.game}`
            : `[${channel}] \u25C6 now playing ${msg.game}`;
          eventClass = 'event-update';
        } else if (msg.eventType === 'stream:online') {
          text = msg.game ? `[${channel}] \u25C6 went live \u2014 ${msg.game}` : `[${channel}] \u25C6 went live`;
          eventClass = 'event-online';
        } else if (msg.eventType === 'stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-offline';
        }
        if (!text) return;

        log('[Stream]', channel, text);
        notifyStreamEvent(channel, msg.eventType, msg.game);
        const evt = { type: 'stream-event', eventClass, text, channel, time: Date.now() };

        // Push into the live channel buffer (dedup by text to prevent doubles on reload)
        const liveChannel = getLiveChannel();
        const liveBuffer = liveChannel ? (irc?.channels?.get(liveChannel) || kickChat?.channels?.get(liveChannel)) : null;
        if (liveBuffer) {
          const existing = liveBuffer.getAll();
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            liveBuffer.push(evt);
            saveStreamEvent(evt);
          }
        }

        // Also push into the matching channel buffer if different from live
        if (channel !== liveChannel) {
          const chBuffer = irc?.channels?.get(channel) || kickChat?.channels?.get(channel);
          if (chBuffer) {
            const existing = chBuffer.getAll();
            if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
              chBuffer.push(evt);
              if (!liveBuffer) saveStreamEvent(evt);
            }
          }
        }
        pushActivityEvent(evt);

        // Yellow tab highlight only for game changes, and only when not viewing that channel
        // (live tab and its matching channel tab are equivalent — viewing either counts)
        if (msg.eventType === 'stream:update') {
          const viewingChannel = currentTab === 'live' || config.channels.some(ch => {
            const tw = (typeof ch === 'string' ? ch : ch.twitch)?.toLowerCase()
            const ki = (typeof ch !== 'string' ? ch.kick : null)?.toLowerCase()
            return currentTab === (typeof ch === 'string' ? ch : ch.id) && (tw === channel || ki === channel)
          })
          if (!viewingChannel) {
            // Only yellow the live tab if this event is for the live channel
            const isLiveEvent = isLiveChannelMessage({ channel })
            if (isLiveEvent) {
              const liveTab = tabBarElement?.querySelector('[data-tab="live"]');
              if (liveTab) liveTab.classList.add('has-stream-event');
            }
            // Yellow the matching channel tab
            for (const ch of config.channels) {
              const twName = typeof ch === 'string' ? ch : ch.twitch;
              const kickName = typeof ch !== 'string' ? ch.kick : null;
              const tabId = typeof ch === 'string' ? ch : ch.id;
              if ((twName === channel || kickName === channel) && currentTab !== tabId) {
                const tab = tabBarElement?.querySelector(`[data-tab="${tabId}"]`);
                if (tab) tab.classList.add('has-stream-event');
              }
            }
          }
        }

        // Render on whatever tab is active (game changes are always relevant)
        const activeTab = currentTab;
        if (activeTab === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)) {
          if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
        }
      });
    }

    // Handle Hermes events (raids, hype trains, redeems, sub gifts) from MAIN world
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'heatsync-hermes-event') return
      const { eventType, channel, data } = e.data
      if (!eventType || !channel) return

      // Map eventType to toggle key and eventClass
      let toggleKey, eventClass, text
      if (eventType === 'raid') {
        toggleKey = 'raid'
        eventClass = 'event-raid'
        text = `[${channel}] \u25C6 raided ${escapeHtml(data.target)} with ${data.viewers} viewers`
      } else if (eventType === 'hype-train-start') {
        toggleKey = 'hype'
        eventClass = 'event-hype'
        text = `[${channel}] \u25C6 hype train started`
      } else if (eventType === 'hype-train-end') {
        toggleKey = 'hype'
        eventClass = 'event-hype'
        text = `[${channel}] \u25C6 hype train ended at level ${data.level}`
      } else if (eventType === 'sub-gift') {
        toggleKey = 'sub'
        eventClass = 'event-sub'
        text = `[${channel}] \u25C6 ${escapeHtml(data.user)} gifted ${data.count} subs`
      } else if (eventType === 'redeem') {
        toggleKey = 'redeem'
        eventClass = 'event-redeem'
        text = `[${channel}] \u25C6 ${escapeHtml(data.user)} redeemed "${escapeHtml(data.title)}"`
      } else return

      if (!hermesToggles[toggleKey]) return

      const evt = { type: 'stream-event', eventClass, text, channel, time: Date.now() }

      // Push into relevant buffers (same pattern as stream_event handler)
      const liveChannel = getLiveChannel()
      const liveBuffer = liveChannel ? irc?.channels?.get(liveChannel) : null
      if (liveBuffer) {
        const existing = liveBuffer.getAll()
        if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
          liveBuffer.push(evt)
          saveStreamEvent(evt)
        }
      }
      if (channel !== liveChannel) {
        const chBuffer = irc?.channels?.get(channel)
        if (chBuffer) {
          const existing = chBuffer.getAll()
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            chBuffer.push(evt)
            if (!liveBuffer) saveStreamEvent(evt)
          }
        }
      }
      pushActivityEvent(evt)

      // Render
      const activeTab = currentTab
      if (activeTab === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)) {
        if (!appendMessage(evt, activeTab)) renderMessages(activeTab)
      }
    }, { signal: mcSignal })

    // Handle follow-driven stream events (from followed channels not currently viewed)
    if (!window._hsMcFollowStreamEventListener) {
      window._hsMcFollowStreamEventListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'follow_stream_event') return;
        const channel = msg.channel?.toLowerCase();
        if (!channel) return;

        // Skip channels already in config — they get stream_event, avoid duplicates
        if (config.channels.some(ch => {
          const id = (typeof ch === 'string' ? ch : ch.id)?.toLowerCase()
          const tw = (typeof ch === 'string' ? null : ch.twitch)?.toLowerCase()
          return id === channel || tw === channel
        })) return;

        // Build inline notification
        let text = '', eventClass = '';
        if (msg.eventType === 'stream:update' && msg.game && msg.prevGame !== msg.game) {
          text = msg.prevGame
            ? `[${channel}] \u25C6 switched to ${msg.game}`
            : `[${channel}] \u25C6 now playing ${msg.game}`;
          eventClass = 'event-follow event-update';
        } else if (msg.eventType === 'stream:online') {
          text = msg.game ? `[${channel}] \u25C6 went live \u2014 ${msg.game}` : `[${channel}] \u25C6 went live`;
          eventClass = 'event-follow event-online';
        } else if (msg.eventType === 'stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-follow event-offline';
        }
        if (!text) return;

        log('[FollowStream]', channel, text);
        notifyStreamEvent(channel, msg.eventType, msg.game);
        const evt = { type: 'stream-event', eventClass, text, channel, time: Date.now(), color: msg.color || '' };

        // Push into the live channel buffer (dedup by text)
        const liveChannel = getLiveChannel();
        const liveBuffer = liveChannel ? irc?.channels?.get(liveChannel) : null;
        if (liveBuffer) {
          const existing = liveBuffer.getAll();
          if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
            liveBuffer.push(evt);
            saveStreamEvent(evt);
          }
        }

        // Also push into matching channel buffer if different from live
        if (channel !== liveChannel) {
          const chBuffer = irc?.channels?.get(channel);
          if (chBuffer) {
            const existing = chBuffer.getAll();
            if (!existing.some(m => m.type === 'stream-event' && m.text === evt.text)) {
              chBuffer.push(evt);
              if (!liveBuffer) saveStreamEvent(evt);
            }
          }
        }
        pushActivityEvent(evt);

        // Yellow tab highlight only for game changes on the live channel, only when not viewing live
        if (msg.eventType === 'stream:update' && currentTab !== 'live' && isLiveChannelMessage({ channel })) {
          const tab = tabBarElement?.querySelector('[data-tab="live"]');
          if (tab) tab.classList.add('has-stream-event');
        }

        // Render on whatever tab is active
        const activeTab = currentTab;
        if (activeTab === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === activeTab)) {
          if (!appendMessage(evt, activeTab)) renderMessages(activeTab);
        }
      });
    }

    // Handle color map from server (for persisted stream event history)
    if (!window._hsMcFollowColorsListener) {
      window._hsMcFollowColorsListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'follow_colors') return;
        processFollowColors(msg.colors);
      });
    }

    // Process follow history events (shared by listener + on-demand request)
    function processFollowHistory(events) {
      if (!Array.isArray(events) || events.length === 0) return;

      const builtEvents = [];
      for (const e of events) {
        const channel = e.channel?.toLowerCase();
        if (!channel) continue;

        // Skip channels already in config — they get stream_event directly
        if (config.channels.some(ch => {
          const id = (typeof ch === 'string' ? ch : ch.id)?.toLowerCase()
          const tw = (typeof ch === 'string' ? null : ch.twitch)?.toLowerCase()
          return id === channel || tw === channel
        })) continue;

        let text = '', eventClass = '';
        if (e.type === 'follow:stream:update' && e.game) {
          text = e.prevGame
            ? `[${channel}] \u25C6 switched to ${e.game}`
            : `[${channel}] \u25C6 now playing ${e.game}`;
          eventClass = 'event-follow event-update';
        } else if (e.type === 'follow:stream:online') {
          text = e.game ? `[${channel}] \u25C6 went live \u2014 ${e.game}` : `[${channel}] \u25C6 went live`;
          eventClass = 'event-follow event-online';
        } else if (e.type === 'follow:stream:offline') {
          text = `[${channel}] \u25C6 went offline`;
          eventClass = 'event-follow event-offline';
        }
        if (!text) continue;

        const evt = { type: 'stream-event', eventClass, text, channel, time: e.time, color: e.color || '' };
        builtEvents.push(evt)
      }

      const added = injectStreamEventsIntoBuffers(builtEvents, true)
      if (builtEvents.length > 0) saveStreamEventsBatch(builtEvents)

      if (added > 0) {
        log('[FollowHistory]', added, 'events loaded');
        const active = currentTab;
        if (active === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)) {
          renderMessages(active);
        }
      }
    }

    // Process follow colors (shared by listener + on-demand request)
    function processFollowColors(colors) {
      if (!colors || typeof colors !== 'object') return;
      for (const [login, color] of Object.entries(colors)) {
        if (color) streamColorMap.set(login.toLowerCase(), color);
      }
      log('[FollowColors]', streamColorMap.size, 'colors received');
      const active = currentTab;
      if (active === 'live' || config.channels.some(ch => (typeof ch === 'string' ? ch : ch.id) === active)) {
        renderMessages(active);
      }
    }

    // Handle real-time follow_history from background broadcast
    if (!window._hsMcFollowHistoryListener) {
      window._hsMcFollowHistoryListener = true;
      chrome.runtime?.onMessage?.addListener((msg) => {
        if (msg.type !== 'follow_history') return;
        processFollowHistory(msg.events);
      });
    }

    // Request cached follow history from background (handles race condition on load)
    safeSendMessage({ type: 'get_follow_history' }).then(resp => {
      if (resp?.colors) processFollowColors(resp.colors);
      if (resp?.history) processFollowHistory(resp.history);
    });

    // === BULLETPROOF CONNECTION MAINTENANCE ===

    // 1. Detect extension context invalidation → auto-reload page
    // When Chrome restarts the service worker or updates the extension,
    // content scripts become orphaned. Detect and reload.
    cleanup.setInterval(() => {
      try {
        if (!chrome.runtime?.id) throw new Error('dead');
        // Ping background to verify it's alive
        chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {
          log('Background unreachable, reloading page...');
          location.reload();
        });
      } catch {
        log('Extension context invalidated, reloading page...');
        location.reload();
      }
    }, 30000, 'context-health');

    // 2. Reconnect auth IRC on tab focus (for sending messages)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (authState.ws && authState.ws.readyState === WebSocket.OPEN) return;
      // Auth IRC is dead — reconnect if we have credentials
      const token = getTwitchAuthToken();
      const nick = currentUsername || getCurrentUsername();
      if (token && nick && !authState.connecting) {
        log('Tab visible, auth IRC dead — reconnecting');
        const prev = [...authState.joined];
        connectAuthIrc(token, nick).then(ok => {
          if (ok === true) {
            for (const ch of prev) joinChannel(ch);
            drainSendQueue();
          }
        });
      }
    }, { signal: mcSignal });

    // 3. Reconnect Kick chat on tab focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (kickChat && (!kickChat.ws || kickChat.ws.readyState !== WebSocket.OPEN)) {
        log('Tab visible, Kick chat dead — reconnecting');
        kickChat.connect();
      }
    }, { signal: mcSignal });

    if (isKick) {
      // Kick: no React hook needed, just inject directly
      let kickAttempts = 0;
      const tryInjectKick = () => {
        kickAttempts++;
        const chatroom = document.getElementById('channel-chatroom') || document.querySelector('[id*="chatroom"]');
        if (chatroom) {
          ensureUIElements();
          switchTab(_savedActiveTab || 'live');
          startLayoutWatcher();
        } else if (kickAttempts < 30) {
          setTimeout(tryInjectKick, 500);
        } else {
          log('Failed to find Kick chatroom after 30 attempts');
        }
      };
      tryInjectKick();
    } else {
      // Twitch: try to hook into React, fall back to MutationObserver
      tryHookReact();
    }
  }

  /**
   * Attempt to hook React components, with fallback
   */
  function tryHookReact() {
    let attempts = 0;
    const maxAttempts = 30;

    const tryHook = () => {
      attempts++;

      // First, try to find and patch the chat room component
      const chatRoom = findChatRoomComponent();
      if (chatRoom) {
        log('Found chat room component');
        chatRoomComponent = chatRoom;
        patchChatRoomRender(chatRoom);
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
        return;
      }

      // Fallback: just inject elements directly (support popout chat)
      const chatContainer = document.querySelector('[class*="chat-room__content"]') ||
                           document.querySelector('[data-a-target="chat-room-component"]') ||
                           document.querySelector('.chat-shell') ||
                           document.querySelector('[class*="stream-chat"]') ||
                           document.querySelector('.chat-room');

      if (chatContainer) {
        log('Using fallback DOM injection');
        ensureUIElements();
        switchTab(_savedActiveTab || 'live');
        startLayoutWatcher();
        return;
      }

      if (attempts < maxAttempts) {
        setTimeout(tryHook, 500);
      } else {
        log('Failed to find chat components after', maxAttempts, 'attempts');
      }
    };

    tryHook();
  }

  /**
   * Watch for layout changes and re-inject elements if needed
   * This handles theatre mode, popouts, SPA navigation
   */
  function startLayoutWatcher() {
    // Periodic check — only needed for container removal (rare, SPA nav)
    cleanup.setInterval(() => {
      if (spaReinitializing) return;
      if (!document.getElementById('hs-mc-container')) {
        log('Container missing, re-injecting...');
        tabBarElement = null;
        overlayElement = null;
        inputBarElement = null;
        resizeObserver = null;
        ensureUIElements();
        updateTabBar();
        renderMessages(currentTab);
      }
    }, 1000, 'layout-check');

    // MutationObserver — only watch for container removal
    cleanup.trackObserver(new MutationObserver((mutations) => {
      if (spaReinitializing) return;
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node.id === 'hs-mc-container' && !document.contains(node)) {
            log('Container removed, re-injecting...');
            tabBarElement = null;
            overlayElement = null;
            inputBarElement = null;
            resizeObserver = null;
            cleanup.setTimeout(() => {
              ensureUIElements();
              updateTabBar();
              renderMessages(currentTab);
            }, 100, 'container-reinject');
            return;
          }
        }
      }
    }), 'layout-observer').observe(document.body, { childList: true, subtree: true });
  }

  // ============================================
  // STARTUP
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { signal: mcSignal });
  } else {
    init();
  }

  // SPA navigation handler
  let lastPath = location.pathname;
  let spaReinitializing = false;
  cleanup.setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      log('Navigation detected, reinitializing...');

      // Flag prevents layout watcher from re-injecting elements we're about to remove
      spaReinitializing = true;

      // Close old read-only IRC to prevent zombie WebSocket reconnect loops
      // NOTE: auth IRC (for sending) is NOT killed here — it survives SPA navigation
      if (irc?.ws) {
        irc.ws.onclose = null; // prevent auto-reconnect
        irc.ws.close();
      }
      irc = null;

      // Destroy old KickChat to prevent stale message listeners
      if (kickChat) {
        kickChat.destroy();
        kickChat = null;
      }

      // Clean up — remove entire container (our elements are inside it)
      document.getElementById('hs-mc-container')?.remove();
      tabBarElement = null;
      overlayElement = null;
      inputBarElement = null;
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      isHooked = false;
      mcInitialized = false; // Allow init() to run again

      // Reset social tab state (stale on nav)
      feedLoaded = false;
      feedLoading = false;
      feedMessages = [];
      feedPage = 1;
      feedHasMore = true;
      feedLastFetch = 0;
      notifLoaded = false;
      notifMessages = [];
      activeThread = null;
      // Reset feed scroll listener flag (new DOM element)
      const oldMsgs = document.getElementById('hs-mc-messages');
      if (oldMsgs) oldMsgs._hsFeedScroll = false;

      // Reinitialize after short delay
      cleanup.setTimeout(() => {
        spaReinitializing = false;
        init();
      }, 1000, 'spa-reinit');
    }
  }, 500, 'spa-nav-check');

})();
