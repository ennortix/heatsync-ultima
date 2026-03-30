// Emotes - cache, lookup, processing, picker, block/inventory

  const UNICODE_EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]+$/u;

  // Emote size (1, 2, or 4)
  let emoteSize = 1;

  // Upgrade emote URL to match current emote size setting
  function getChatResUrl(url) {
    if (!url || emoteSize === 1) return url;
    if (emoteSize === 2) {
      if (url.includes('cdn.7tv.app')) return url.replace('/1x', '/2x');
      if (url.includes('cdn.betterttv.net')) return url.replace('/1x', '/2x');
      if (url.includes('cdn.frankerfacez.com')) return url.replace(/\/1(?=\.|$)/, '/2');
      if (url.includes('static-cdn.jtvnw.net')) return url.replace('/1.0', '/2.0');
    } else if (emoteSize === 4) {
      if (url.includes('cdn.7tv.app')) return url.replace('/1x', '/4x').replace('/2x', '/4x');
      if (url.includes('cdn.betterttv.net')) return url.replace('/1x', '/3x').replace('/2x', '/3x');
      if (url.includes('cdn.frankerfacez.com')) return url.replace(/\/[12](?=\.|$)/, '/4');
      if (url.includes('static-cdn.jtvnw.net')) return url.replace(/\/[12]\.0/, '/3.0');
    }
    return url;
  }

  // Upgrade emote URL to highest resolution for tooltip
  function getHighResUrl(url) {
    if (!url) return url;
    // 7TV: /1x → /4x
    if (url.includes('cdn.7tv.app')) {
      return url.replace('/1x', '/4x').replace('/2x', '/4x').replace('/3x', '/4x');
    }
    // BTTV: /1x → /3x (max)
    if (url.includes('cdn.betterttv.net')) {
      return url.replace('/1x', '/3x').replace('/2x', '/3x');
    }
    // FFZ: /1 → /4
    if (url.includes('cdn.frankerfacez.com')) {
      return url.replace(/\/1(?=\.|$)/, '/4').replace(/\/2(?=\.|$)/, '/4');
    }
    // Twitch: /1.0 → /3.0 (max)
    if (url.includes('static-cdn.jtvnw.net')) {
      return url.replace('/1.0', '/3.0').replace('/2.0', '/3.0');
    }
    return url;
  }

  /**
   * Group emotes by state+source into ordered sections
   */
  const SECTION_ORDER = [
    'channel-7tv', 'channel-bttv', 'channel-ffz', 'channel-twitch',
    '7tv', 'bttv', 'ffz', 'twitch', 'heatsync'
  ]
  const SECTION_LABELS = {
    'channel-7tv': 'channel 7tv', 'channel-bttv': 'channel bttv',
    'channel-ffz': 'channel ffz', 'channel-twitch': 'channel twitch',
    '7tv': '7tv global', 'bttv': 'bttv global', 'ffz': 'ffz global',
    'twitch': 'twitch global', 'heatsync': 'heatsync'
  }

  function groupEmotes(allEmotes) {
    const groups = {}
    for (const [name, emote] of allEmotes) {
      const key = emote.state === 'channel' ? `channel-${emote.source}` : emote.source
      if (!groups[key]) groups[key] = []
      groups[key].push([name, emote])
    }
    return SECTION_ORDER
      .filter(k => groups[k]?.length)
      .map(k => ({ key: k, label: SECTION_LABELS[k] || k, emotes: groups[k] }))
  }

  function renderEmoteSections(sections, emptyMsg = 'no emotes loaded') {
    if (!sections.length) return `<div class="hs-mc-picker-empty">${escapeHtml(emptyMsg)}</div>`
    // Only render section headers + first CHUNK_SIZE emotes per section for instant open
    // Rest gets appended via chunkedRenderRemaining()
    return sections.map(s => {
      const initial = s.emotes.slice(0, EMOTE_CHUNK_SIZE)
      return `
      <div class="hs-mc-picker-section" data-section-key="${escapeHtml(s.key)}">
        <div class="hs-mc-picker-section-header">${escapeHtml(s.label)} <span class="hs-mc-picker-section-count">${s.emotes.length}</span></div>
        <div class="hs-mc-picker-section-grid">${initial.map(emoteImgHtml).join('')}</div>
      </div>`
    }).join('')
  }

  const EMOTE_CHUNK_SIZE = 80
  let _chunkedRafId = null

  function emoteImgHtml([name, emote]) {
    return `<img src="${escapeHtml(emote.url)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)} (${escapeHtml(emote.source)})" class="hs-mc-picker-emote hs-emote-${escapeHtml(emote.source)}" data-name="${escapeHtml(name)}" data-source="${escapeHtml(emote.source)}" loading="lazy">`
  }

  /** Append remaining emotes in rAF chunks so the picker opens instantly */
  function chunkedRenderRemaining(sections, container) {
    if (_chunkedRafId) cancelAnimationFrame(_chunkedRafId)
    // Build queue of {gridEl, emotes} for sections with remaining emotes
    const queue = []
    for (const s of sections) {
      if (s.emotes.length <= EMOTE_CHUNK_SIZE) continue
      const gridEl = container.querySelector(`[data-section-key="${CSS.escape(s.key)}"] .hs-mc-picker-section-grid`)
      if (!gridEl) continue
      queue.push({ gridEl, emotes: s.emotes.slice(EMOTE_CHUNK_SIZE), offset: 0 })
    }
    function renderNext() {
      const item = queue[0]
      if (!item) return
      const chunk = item.emotes.slice(item.offset, item.offset + EMOTE_CHUNK_SIZE)
      if (!chunk.length) { queue.shift(); renderNext(); return }
      // Use DocumentFragment for minimal reflows
      const frag = document.createDocumentFragment()
      for (const entry of chunk) {
        const tmp = document.createElement('template')
        tmp.innerHTML = emoteImgHtml(entry)
        frag.appendChild(tmp.content)
      }
      item.gridEl.appendChild(frag)
      item.offset += EMOTE_CHUNK_SIZE
      if (item.offset >= item.emotes.length) queue.shift()
      if (queue.length) _chunkedRafId = requestAnimationFrame(renderNext)
    }
    _chunkedRafId = requestAnimationFrame(renderNext)
  }

  /**
   * Create emote picker popup
   */
  let pickerTab = 'emotes'; // 'emotes' or 'twitch'
  let _pickerCloseHandler = null; // Tracked to prevent duplicate close handlers

  function showEmotePicker(tab = null) {
    const picker = document.getElementById('hs-mc-emote-picker');
    if (!picker) return;

    // If tab specified, switch to it; otherwise toggle
    if (tab) {
      pickerTab = tab;
    } else if (picker.classList.contains('visible')) {
      picker.classList.remove('visible');
      adjustOverlayForPicker(false);
      hideInputBar();
      if (_chunkedRafId) { cancelAnimationFrame(_chunkedRafId); _chunkedRafId = null; }
      return;
    }

    // Build tabbed UI — merge channel emotes first (so they keep 'channel' state), then globals
    // Note: all emote names/urls are pre-sanitized via escapeHtml in render helpers
    const allEmotes = new Map();
    const chCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
    if (chCache) for (const [k, v] of chCache) allEmotes.set(k, v);
    for (const [k, v] of emoteCache) if (!allEmotes.has(k)) allEmotes.set(k, v);
    const sections = groupEmotes(allEmotes);
    picker.innerHTML = `
      <div class="hs-mc-tab-content" id="hs-mc-tab-emotes" style="display: ${pickerTab === 'emotes' ? 'flex' : 'none'}; flex-direction: column;">
        <div class="hs-mc-picker-header">
          <div class="hs-mc-search-wrap">
            <svg class="hs-mc-search-icon" width="14" height="14" viewBox="0 0 20 20"><path fill="#000" d="M13.74 12.33l4.04 4.04a1 1 0 01-1.42 1.42l-4.04-4.04a7 7 0 111.42-1.42zM9 14A5 5 0 109 4a5 5 0 000 10z"/></svg>
            <input type="text" id="hs-mc-emote-search" placeholder="search emotes..." autocomplete="off">
          </div>
        </div>
        <div class="hs-mc-picker-scroll" id="hs-mc-emote-grid">
          ${renderEmoteSections(sections)}
        </div>
      </div>
      <div class="hs-mc-tab-content" id="hs-mc-tab-twitch" style="display: ${pickerTab === 'twitch' ? 'flex' : 'none'}; flex-direction: column; padding: 8px 0;">
        <div class="hs-mc-pred-loading">loading...</div>
      </div>
      <div class="hs-mc-picker-tabs">
        <button class="hs-mc-picker-tab ${pickerTab === 'emotes' ? 'active' : ''}" data-tab="emotes">emotes</button>
        <button class="hs-mc-picker-tab ${pickerTab === 'twitch' ? 'active' : ''}" data-tab="twitch">twitch</button>
      </div>
    `;

    // Chunked render remaining emotes after initial paint
    const grid = document.getElementById('hs-mc-emote-grid');
    if (grid) chunkedRenderRemaining(sections, grid);

    // Search functionality (debounced)
    let _searchTimer = null;
    const searchInput = document.getElementById('hs-mc-emote-search');
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        const query = e.target.value.toLowerCase();
        const grid = document.getElementById('hs-mc-emote-grid');
        if (!grid) return;

        const searchEmotes = new Map();
        const searchChCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
        if (searchChCache) for (const [k, v] of searchChCache) searchEmotes.set(k, v);
        for (const [k, v] of emoteCache) if (!searchEmotes.has(k)) searchEmotes.set(k, v);
        const filtered = new Map();
        for (const [name, emote] of searchEmotes) {
          if (name.toLowerCase().includes(query)) filtered.set(name, emote);
        }
        const filteredSections = groupEmotes(filtered);
        grid.innerHTML = renderEmoteSections(filteredSections, 'no matches');
        chunkedRenderRemaining(filteredSections, grid);
      }, 150);
    });

    // Emote size controls
    picker.querySelectorAll('.hs-mc-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = parseInt(btn.dataset.size, 10);
        setEmoteSize(size);
        // Update active state
        picker.querySelectorAll('.hs-mc-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Tab switching
    picker.querySelectorAll('.hs-mc-picker-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const newTab = tabBtn.dataset.tab;
        const oldTab = pickerTab;
        pickerTab = newTab;
        picker.querySelectorAll('.hs-mc-picker-tab').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        picker.querySelectorAll('.hs-mc-tab-content').forEach(c => c.style.display = 'none');
        const display = (newTab === 'emotes' || newTab === 'settings' || newTab === 'twitch') ? 'flex' : 'block';
        document.getElementById(`hs-mc-tab-${newTab}`).style.display = display;
        if (newTab === 'twitch') renderTwitchTab();
        if (oldTab === 'twitch' && newTab !== 'twitch') stopPredictionPoll();
      });
    });

    // Event delegation for emote clicks (single handler, works for chunked rendering)
    if (!picker._hsDelegated) {
      picker._hsDelegated = true;
      picker.addEventListener('click', (e) => {
        const img = e.target.closest('.hs-mc-picker-emote');
        if (!img) return;
        const name = img.dataset.name;
        const input = document.getElementById('hs-mc-input');
        if (!input || !name) return;
        if (wysiwygEnabled || !('value' in input)) {
          // WYSIWYG: insert emote image (with zero-width stacking)
          pasteEmoteToInput(name)
        } else {
          const pos = input.selectionStart || input.value.length;
          const before = input.value.slice(0, pos);
          const after = input.value.slice(pos);
          const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
          input.value = before + space + name + ' ' + after;
          pendingMessage = input.value;
        }
        input.focus();
        picker.classList.remove('visible');
        adjustOverlayForPicker(false);
      });
    }

    picker.classList.add('visible');
    // Position picker flush above input bar (or at bottom if hidden)
    const bar = document.getElementById('hs-mc-inputbar');
    const barHeight = (bar && inputBarVisible) ? bar.offsetHeight : 0;
    picker.style.bottom = barHeight + 'px';
    adjustOverlayForPicker(true);

    if (pickerTab === 'twitch') renderTwitchTab();

    // Close when clicking outside (remove any previous handler first)
    if (_pickerCloseHandler) document.removeEventListener('click', _pickerCloseHandler);
    setTimeout(() => {
      _pickerCloseHandler = (e) => {
        if (mcSignal?.aborted) { document.removeEventListener('click', _pickerCloseHandler); _pickerCloseHandler = null; return; }
        if (!picker.contains(e.target) && !e.target.closest('#hs-mc-emote-btn')) {
          picker.classList.remove('visible');
          adjustOverlayForPicker(false);
          hideInputBar();
          stopPredictionPoll();
          document.removeEventListener('click', _pickerCloseHandler);
          _pickerCloseHandler = null;
        }
      };
      document.addEventListener('click', _pickerCloseHandler);
    }, 0);
  }

  /** Adjust overlay bottom to make room for picker panel */
  function adjustOverlayForPicker(open) {
    const overlay = document.getElementById('hs-mc-overlay');
    if (!overlay) return;
    // For vertical tabs (left/right), CSS handles overlay positioning — don't override
    if (tabPosition === 'left' || tabPosition === 'right') return;
    const hasBottomTabs = tabPosition === 'bottom';
    // Always reserve input bar space to prevent layout shift when it shows/hides
    const barBase = hasBottomTabs ? 90 : 52;
    const pickerEl = document.getElementById('hs-mc-emote-picker');
    const pickerHeight = open && pickerEl ? pickerEl.offsetHeight : 0;
    overlay.style.bottom = (barBase + pickerHeight) + 'px';
  }

  // Blocked emotes: stored by HASH (matches background.js/server)
  // blockedEmoteHashes = Set of hashes from storage
  // blockedEmoteNames = Set of names (derived via hashToName lookup, for processEmotes)
  let blockedEmoteHashes = new Set();
  let blockedEmoteNames = new Set();

  function rebuildBlockedNames() {
    blockedEmoteNames.clear();
    for (const hash of blockedEmoteHashes) {
      const name = hashToName.get(hash);
      if (name) blockedEmoteNames.add(name);
    }
    log('Blocked names rebuilt:', blockedEmoteNames.size, 'from', blockedEmoteHashes.size, 'hashes');
  }

  async function loadBlockedEmotes() {
    try {
      const data = await chrome.storage.local.get(['blocked_emotes']);
      blockedEmoteHashes = new Set(data.blocked_emotes || []);
      rebuildBlockedNames();
      log('Loaded', blockedEmoteHashes.size, 'blocked emote hashes');
    } catch (e) {
      log('Error loading blocked emotes:', e);
    }
  }

  // Flash all wrappers for a given emote name
  function flashAllEmotes(emoteName, flashClass) {
    const wrappers = queryEmoteWrappers(emoteName)
    if (wrappers.length === 0) return
    // Batch read/write to avoid per-element reflow
    for (const w of wrappers) {
      w.classList.remove('hs-flash-paste', 'hs-flash-add', 'hs-flash-block', 'hs-flash-unblock', 'hs-flash-remove');
    }
    // Single reflow trigger for all elements
    void document.body.offsetWidth
    for (const w of wrappers) {
      w.classList.add(flashClass);
      w.addEventListener('animationend', () => w.classList.remove(flashClass), { once: true });
    }
  }

  // Create emote <img> for WYSIWYG input
  function createInputEmoteImg(emoteName) {
    const emote = lookupEmote(emoteName)
    if (!emote) return null
    const img = document.createElement('img')
    img.className = 'hs-input-emote'
    img.src = getChatResUrl(emote.url)
    img.alt = emoteName
    img.dataset.emoteName = emoteName
    img.draggable = false
    if (emote.zeroWidth) img.dataset.zeroWidth = '1'
    return img
  }

  // Stack a zero-width emote onto a base emote/stack in the input
  function stackInputEmote(baseEl, overlayImg) {
    if (baseEl.classList.contains('hs-input-stack')) {
      baseEl.appendChild(overlayImg)
      return baseEl
    }
    const stack = document.createElement('span')
    stack.className = 'hs-input-stack'
    baseEl.parentNode.insertBefore(stack, baseEl)
    stack.appendChild(baseEl)
    stack.appendChild(overlayImg)
    return stack
  }

  // Find last emote element (img or stack) walking backwards, skipping whitespace
  function findLastInputEmote(input) {
    let node = input.lastChild
    while (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '') {
        node = node.previousSibling
        continue
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && node.classList.contains('hs-input-emote')) return node
        if (node.classList?.contains('hs-input-stack')) return node
      }
      break
    }
    return null
  }

  // Move cursor to end of input
  function cursorToEnd(input) {
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Paste emote name to input
  function pasteEmoteToInput(emoteName) {
    const input = document.getElementById('hs-mc-input');
    if (!input) return;
    if (wysiwygEnabled || !('value' in input)) {
      const img = createInputEmoteImg(emoteName)
      if (img) {
        const emote = lookupEmote(emoteName)
        const isZeroWidth = emote && !!emote.zeroWidth

        if (isZeroWidth) {
          const target = findLastInputEmote(input)
          if (target) {
            // Remove trailing whitespace between target and end
            let next = target.nextSibling
            while (next) {
              if (next.nodeType === Node.TEXT_NODE && next.textContent.trim() === '') {
                const rm = next
                next = next.nextSibling
                rm.remove()
              } else break
            }
            stackInputEmote(target, img)
            input.appendChild(document.createTextNode('\u00A0'))
            cursorToEnd(input)
            pendingMessage = getInputText()
            input.focus()
            return
          }
        }

        // Regular emote: append img + space
        input.appendChild(img)
        input.appendChild(document.createTextNode('\u00A0'))
        cursorToEnd(input)
      } else {
        // Fallback: emote not in cache, insert as text
        const text = input.textContent || ''
        const space = text.length > 0 && !text.endsWith(' ') ? ' ' : ''
        input.textContent = text + space + emoteName + ' '
        cursorToEnd(input)
      }
      pendingMessage = getInputText()
    } else {
      const pos = input.selectionStart || input.value.length;
      const before = input.value.slice(0, pos);
      const after = input.value.slice(pos);
      const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
      input.value = before + space + emoteName + ' ' + after;
      pendingMessage = input.value;
      input.selectionStart = input.selectionEnd = pos + space.length + emoteName.length + 1;
    }
    input.focus();
  }

  // Remove emote from inventory via background.js
  async function removeEmoteFromInventory(emoteName, targetEl) {
    if (!emoteName) return;
    pendingEmoteOps.add(emoteName);
    try { await _removeEmoteFromInventory(emoteName, targetEl) }
    finally { pendingEmoteOps.delete(emoteName) }
  }
  async function _removeEmoteFromInventory(emoteName, targetEl) {
    // Try inventoryHashes first, then wrapper's data-emote-hash, then emoteHashes, then lookup
    const wrapper = targetEl?.closest?.('.hs-mc-emote-wrapper') || targetEl;
    const emoteHash = inventoryHashes.get(emoteName)
      || wrapper?.dataset?.emoteHash
      || emoteHashes.get(emoteName)
      || lookupEmote(emoteName)?.hash
      || emoteName;
    document.body.dataset.hsDebugRemove = `removing: ${emoteName} hash=${emoteHash?.substring(0, 12)}`;
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'remove_from_inventory',
          emoteHash,
          emoteName
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      });
      document.body.dataset.hsDebugRemove = `response: ${JSON.stringify(response)}`;
      if (response?.success) handleRemoveSuccess(emoteName, targetEl);
      else showToast(response?.error || `failed to remove: ${emoteName}`);
    } catch (e) {
      document.body.dataset.hsDebugRemove = `error: ${e.message}`;
      showToast(`error removing: ${emoteName}`);
    }
  }

  function handleRemoveSuccess(emoteName, targetEl) {
    inventoryEmotes.delete(emoteName);
    inventoryHashes.delete(emoteName);
    const cachedEmote = lookupEmote(emoteName);
    if (cachedEmote) {
      const isThirdParty = ['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(cachedEmote.source);
      if (isThirdParty) {
        cachedEmote.state = 'global';
      } else {
        // HeatSync emote — mark unadded then remove from cache so it stops rendering in new messages
        cachedEmote.state = 'unadded';
        emoteCache.delete(emoteName);
        for (const cache of Object.values(channelEmoteCaches)) {
          cache.delete(emoteName);
        }
      }
    } else {
      // Not found via lookupEmote but might still be in caches
      emoteCache.delete(emoteName);
      for (const cache of Object.values(channelEmoteCaches)) {
        cache.delete(emoteName);
      }
    }
    // Update all existing wrappers in DOM
    const newState = cachedEmote?.state || 'unadded';
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
    });
    // Refresh tooltip if visible (state text needs to update instantly)
    refreshEmoteTooltip(emoteName, newState);
    showToast(`removed: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-remove');
  }

  function blockAllEmotesInStack(stack) {
    const wrappers = stack.querySelectorAll('.hs-mc-emote-wrapper');
    let count = 0;
    wrappers.forEach(w => {
      const name = w.dataset.emoteName;
      if (name && w.dataset.state !== 'blocked') {
        blockEmote(name);
        count++;
      }
    });
    if (count > 0) showToast(`blocked ${count} emotes`);
    stack.classList.remove('expanded');
    stack.setAttribute('title', 'expand');
  }

  function blockEmote(emoteName) {
    if (!emoteName) return;

    // Blocking and owning are mutually exclusive
    inventoryEmotes.delete(emoteName);
    inventoryHashes.delete(emoteName);

    // Update local name-based tracking
    blockedEmoteNames.add(emoteName);

    // Get hash for API - prefer known hash, fallback to URL-derived
    const hash = emoteHashes.get(emoteName) ||
      (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
    blockedEmoteHashes.add(hash);

    // Sync to heatsync.org API via background.js (it handles storage)
    syncBlockToAPI(emoteName, true);

    // Instant DOM update - CSS visibility:hidden hides the img, no src swap needed
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded');
      w.classList.add('hs-state-blocked');
      w.dataset.state = 'blocked';
      const img = w.querySelector('img');
      if (img) {
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded');
        img.classList.add('hs-emote-blocked');
        img.dataset.state = 'blocked';
      }
    });

    refreshEmoteTooltip(emoteName, 'blocked');
    showToast(`blocked: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-block');
  }

  function unblockEmote(emoteName) {
    if (!emoteName) return;

    // Update local tracking
    blockedEmoteNames.delete(emoteName);
    const hash = emoteHashes.get(emoteName) ||
      (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
    blockedEmoteHashes.delete(hash);

    // Sync to heatsync.org API via background.js
    syncBlockToAPI(emoteName, false);

    // Instant DOM update - restore images
    const emote = lookupEmote(emoteName);
    const realUrl = emote?.url || '';
    const newState = emote ? getEmoteState(emoteName, emote.source) : 'global';
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
      w.style.outline = '';
      const img = w.querySelector('img');
      if (img && realUrl) {
        img.src = realUrl;
        img.style.width = '';
        img.style.height = '';
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-blocked', 'hs-emote-unadded');
        img.classList.add(`hs-emote-${newState}`);
        img.dataset.state = newState;
      }
    });

    refreshEmoteTooltip(emoteName, newState);
    showToast(`unblocked: ${emoteName}`);
    flashAllEmotes(emoteName, 'hs-flash-unblock');
  }

  // Add emote to inventory (click-to-add for unadded emotes)
  async function addEmoteToInventory(emoteName, emoteUrl, emoteSource, targetEl) {
    if (!emoteName) return;
    pendingEmoteOps.add(emoteName);
    try {
      // Generate a hash from the URL for the API
      const emoteHash = emoteUrl ? btoa(emoteUrl).slice(0, 32) : emoteName;

      // Send to background script for API call with auth
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'add_to_inventory',
          emoteName: emoteName,
          emoteHash: emoteHash,
          emoteUrl: emoteUrl
        }, resolve);
      });

      if (response?.success) {
        // Update local cache - change from unadded to owned
        // Adding and blocking are mutually exclusive
        blockedEmoteNames.delete(emoteName);
        const serverHash = response.hash || emoteHash;
        inventoryEmotes.add(emoteName);
        inventoryHashes.set(emoteName, serverHash);
        if (emoteCache.has(emoteName)) {
          const cached = emoteCache.get(emoteName);
          cached.state = 'owned';
          if (!cached.hash) cached.hash = serverHash;
        } else {
          emoteCache.set(emoteName, { url: emoteUrl, source: emoteSource || 'heatsync', state: 'owned', hash: serverHash });
        }
        // Update hash lookup maps
        emoteHashes.set(emoteName, serverHash);
        hashToName.set(serverHash, emoteName);

        // Update all wrappers in DOM (no full re-render)
        queryEmoteWrappers(emoteName).forEach(w => {
          w.classList.remove('hs-state-global', 'hs-state-unadded', 'hs-state-blocked');
          w.classList.add('hs-state-owned');
          w.dataset.state = 'owned';
        });

        refreshEmoteTooltip(emoteName, 'owned');
        showToast(`added: ${emoteName}`);
        flashAllEmotes(emoteName, 'hs-flash-add');
      } else {
        showToast(response?.error || `failed to add: ${emoteName}`);
      }
    } catch (e) {
      log('Add emote error:', e);
      showToast(`error adding: ${emoteName}`);
    } finally {
      pendingEmoteOps.delete(emoteName);
    }
  }

  // Sync block/unblock to heatsync.org API via background script
  async function syncBlockToAPI(emoteName, block) {
    try {
      // Background script expects message.hash - use emoteHashes (most complete mapping)
      const hash = emoteHashes.get(emoteName) ||
        (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
      chrome.runtime.sendMessage({
        type: block ? 'block_emote' : 'unblock_emote',
        hash: hash,
        emoteName: emoteName
      });
      log('Synced', block ? 'block' : 'unblock', emoteName, '(hash:', hash.substring(0, 8) + '...) to API');
    } catch (e) {
      log('API sync error:', e);
    }
  }

  // Emote cache (loaded from storage)
  // Format: Map<name, {url, source, state}>
  // States: 'owned' (in inventory), 'global' (third-party), 'unadded' (heatsync, not owned)
  let emoteCache = new Map(); // Global + inventory emotes (no channel emotes!)
  let channelEmoteCaches = {}; // Per-channel emotes: { channelName: Map<name, emoteData> }
  let inventoryEmotes = new Set(); // Names of emotes in user's inventory

  // Look up emote from global cache + current channel cache
  function lookupEmote(name) {
    return emoteCache.get(name) || channelEmoteCaches[currentTab]?.get(name) || channelEmoteCaches[getLiveChannel()]?.get(name) || channelEmoteCaches[getCurrentChannel()]?.get(name);
  }
  let inventoryHashes = new Map(); // name → hash for remove_from_inventory
  let emoteHashes = new Map(); // name → hash for ALL emotes (block/unblock API)
  let hashToName = new Map(); // hash → name (reverse lookup for loading blocked from storage)

  // Detect emote source from URL
  function detectEmoteSource(url, hint = null) {
    if (!url) return hint || 'unknown';
    if (url.includes('cdn.7tv.app')) return '7tv';
    if (url.includes('cdn.betterttv.net')) return 'bttv';
    if (url.includes('cdn.frankerfacez.com')) return 'ffz';
    if (url.includes('static-cdn.jtvnw.net')) return 'twitch';
    if (url.includes('kick.com') || url.includes('kick-static')) return 'kick';
    if (url.includes('heatsync.org')) return 'heatsync';
    return hint || 'unknown';
  }

  // Determine emote state: owned > global > unadded
  function getEmoteState(name, source) {
    if (inventoryEmotes.has(name)) return 'owned';
    // Third-party emotes are always "global" (can't add to heatsync inventory)
    if (['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(source)) return 'global';
    // Heatsync emotes not in inventory are "unadded"
    return 'unadded';
  }

  async function loadEmotes() {
    try {
      const stored = await chrome.storage.local.get(['global_emotes', 'emote_inventory', 'channel_emotes_map', 'native_twitch_emotes']);
      emoteCache.clear();
      channelEmoteCaches = {};
      inventoryEmotes.clear();
      inventoryHashes.clear();
      emoteHashes.clear();
      hashToName.clear();

      // Helper to register hash<->name mapping
      const registerHash = (name, hash) => {
        if (name && hash) {
          emoteHashes.set(name, hash);
          hashToName.set(hash, name);
        }
      };

      // First, build inventory set (emotes user owns)
      (stored.emote_inventory || []).forEach(e => {
        if (e.name) {
          inventoryEmotes.add(e.name);
          if (e.hash) {
            inventoryHashes.set(e.name, e.hash);
            registerHash(e.name, e.hash);
          }
        }
      });

      // Add global emotes (heatsync globals - may or may not be in inventory)
      (stored.global_emotes || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || detectEmoteSource(e.url, 'heatsync');
          const state = getEmoteState(e.name, source);
          emoteCache.set(e.name, { url: e.url, source, state, zeroWidth: !!e.zeroWidth });
          if (e.hash) registerHash(e.name, e.hash);
        }
      });

      // Add inventory emotes (definitely owned)
      (stored.emote_inventory || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || 'heatsync';
          emoteCache.set(e.name, { url: e.url, source, state: 'owned', zeroWidth: !!e.zeroWidth });
        }
      });

      // Load per-channel emotes into separate caches (prevents cross-channel leaking)
      const map = stored.channel_emotes_map || {};
      log('loadEmotes channel_emotes_map:', Object.entries(map).map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : v}`).join(', ') || '(empty)');
      for (const [ch, emotes] of Object.entries(map)) {
        if (!Array.isArray(emotes)) continue; // skip 'loading' sentinels
        const chCache = new Map();
        emotes.forEach(e => {
          if (e.name && e.url) {
            const source = e.source || detectEmoteSource(e.url, '7tv');
            const state = getEmoteState(e.name, source);
            chCache.set(e.name, { url: e.url, source, state, zeroWidth: !!e.zeroWidth });
            if (e.hash) registerHash(e.name, e.hash);
          }
        });
        channelEmoteCaches[ch] = chCache;
        log('channel emote cache for', ch, ':', chCache.size, 'emotes, sample:', Array.from(chCache.keys()).slice(0, 5).join(', '));
      }
      // Evict oldest channel emote caches if exceeds 20
      const channelKeys = Object.keys(channelEmoteCaches);
      if (channelKeys.length > 20) {
        for (const old of channelKeys.slice(0, channelKeys.length - 20)) {
          delete channelEmoteCaches[old];
        }
      }
      log('Channel emote caches:', Object.entries(channelEmoteCaches).map(([c, m]) => `${c}: ${m.size}`).join(', '));

      // Native Twitch emotes (sub emotes) — available in ALL channels
      (stored.native_twitch_emotes || []).forEach(e => {
        if (e.name && e.url && !emoteCache.has(e.name)) {
          emoteCache.set(e.name, { url: e.url, source: 'twitch', state: 'global' });
          if (e.hash) registerHash(e.name, e.hash);
        }
      });

      // Rebuild blockedEmoteNames from loaded hashes
      rebuildBlockedNames();

      log('Loaded', emoteCache.size, 'emotes (inventory:', inventoryEmotes.size, ', hashes:', emoteHashes.size, ')');
    } catch (e) {
      log('Error loading emotes:', e);
    }

    // Also scan DOM for third-party emotes (BTTV, FFZ, 7TV)
    scanDomForEmotes();
  }

  // Scan DOM for emotes rendered in chat — route to the current channel's cache, not global
  function scanDomForEmotes() {
    const ch = getCurrentChannel();
    if (!ch) return;

    // Ensure channel cache exists
    if (!channelEmoteCaches[ch]) channelEmoteCaches[ch] = new Map();
    // Evict oldest if exceeds 20
    const chKeys = Object.keys(channelEmoteCaches);
    if (chKeys.length > 20) {
      delete channelEmoteCaches[chKeys[0]];
    }
    const cache = channelEmoteCaches[ch];

    // Cap per-channel to prevent unbounded growth
    if (cache.size >= 5000) return;

    // Single combined selector — one DOM scan instead of 7 separate querySelectorAll calls
    const combinedSelector = '.chat-line__message img[alt], [class*="chat-line"] img[alt], .seventv-emote, .bttv-emote, .ffz-emote, img.emote, img[data-a-target="emote-name"]';

    let found = 0;
    for (const img of document.querySelectorAll(combinedSelector)) {
      if (cache.size >= 5000) break;
      const name = img.alt || img.getAttribute('data-emote-name');
      const url = img.src;
      if (name && url && !cache.has(name) && !emoteCache.has(name)) {
        const source = detectEmoteSource(url);
        cache.set(name, { url, source, state: getEmoteState(name, source), zeroWidth: false });
        found++;
      }
    }

    if (found > 0) {
      log('Scanned', found, 'emotes from DOM ->', ch, ', total:', cache.size);
    }
  }

  // Periodically scan for new emotes
  cleanup.setInterval(scanDomForEmotes, 10000, 'emote-scan');

  // Process text and replace emote codes with images
  // Supports 7TV zero-width (overlay) emotes that stack on base emotes
  function processEmotes(text, channel) {
    if (emoteCache.size === 0 && !channelEmoteCaches[channel]) return escapeHtml(text);

    // Split adjacent Kick emotes and text touching emotes (e.g. "word[emote:id:name]")
    const words = text.replace(/\]\[emote:/g, '] [emote:').replace(/([^\s\[])\[emote:/g, '$1 [emote:').replace(/\]([^\s\]])/g, '] $1').split(/(\s+)/);
    const result = [];
    let pendingStack = null; // { base: html, overlays: [html...] }
    let pendingWhitespace = ''; // Accumulate whitespace - don't flush stack on spaces

    for (const word of words) {
      // Whitespace - accumulate, don't flush yet (overlays are space-separated)
      if (/^\s+$/.test(word)) {
        pendingWhitespace += word;
        continue;
      }

      // Kick emote format: [emote:ID:NAME] -> render as image from Kick CDN
      const kickEmoteMatch = word.match(/^\[emote:(\d+):([^\]]+)\]$/)
      if (kickEmoteMatch) {
        const [, emoteId, emoteName] = kickEmoteMatch
        const kickUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`
        const safeUrl = escapeHtml(kickUrl)
        const safeName = escapeHtml(emoteName)
        // Cross-reference caches to find real provider (7tv/bttv/ffz), fall back to kick
        const cached = emoteCache.get(emoteName) || (channel && channelEmoteCaches[channel]?.get(emoteName))
        const provider = cached?.source || 'kick'
        const imgHtml = `<span class="hs-mc-emote-wrapper hs-state-channel" data-emote-name="${safeName}" data-emote-url="${safeUrl}" data-state="channel" data-source="${escapeHtml(provider)}"><img src="${safeUrl}" alt="${safeName}" title="${safeName} (${escapeHtml(provider)} via kick)" class="hs-mc-emote hs-emote-channel" data-emote-name="${safeName}" data-state="channel" data-source="${escapeHtml(provider)}"></span>`
        if (pendingStack) {
          result.push(renderEmoteStack(pendingStack))
        }
        if (pendingWhitespace) {
          result.push(pendingWhitespace)
          pendingWhitespace = ''
        }
        pendingStack = { base: imgHtml, overlays: [] }
        continue
      }

      // Try name0 overlay convention: "fire0" -> look up "fire" as overlay
      let emote = null
      let isOverlayEmote = false
      const endsWithZero = word.endsWith('0') && word.length > 1
      if (endsWithZero) {
        const baseName = word.slice(0, -1)
        emote = emoteCache.get(baseName) || (channel && channelEmoteCaches[channel]?.get(baseName))
        if (emote) isOverlayEmote = true
      }
      if (!emote) {
        emote = emoteCache.get(word) || (channel && channelEmoteCaches[channel]?.get(word))
        if (emote) isOverlayEmote = !!emote.zeroWidth
      }
      if (emote) {
        const isBlocked = blockedEmoteNames.has(word);
        const state = isBlocked ? 'blocked' : (emote.state || 'global');
        const source = escapeHtml(emote.source || 'unknown');
        const imgSrc = escapeHtml(getChatResUrl(emote.url)); // Upgrade to 2x/4x based on emote size setting
        const safeHash = emote.hash ? escapeHtml(emote.hash) : '';
        const displayName = escapeHtml(word)
        const imgHtml = `<span class="hs-mc-emote-wrapper hs-state-${state}" data-emote-name="${displayName}" data-emote-url="${imgSrc}" data-state="${state}" data-source="${source}"${safeHash ? ` data-emote-hash="${safeHash}"` : ''}><img src="${imgSrc}" alt="${displayName}" title="${displayName}" class="hs-mc-emote hs-emote-${state}" data-emote-name="${displayName}" data-state="${state}" data-source="${source}"></span>`;

        if (isOverlayEmote) {
          // Overlay emote - stack on previous base (discard whitespace between)
          log('FOUND zeroWidth emote:', word, '| hasBase:', !!pendingStack);
          if (pendingStack) {
            pendingStack.overlays.push(imgHtml);
            pendingWhitespace = '';
          } else {
            // No base to stack on - render standalone
            if (pendingWhitespace) {
              result.push(pendingWhitespace);
              pendingWhitespace = '';
            }
            result.push(imgHtml);
          }
        } else {
          // Base emote - flush previous stack, start new one
          if (pendingStack) {
            result.push(renderEmoteStack(pendingStack));
          }
          if (pendingWhitespace) {
            result.push(pendingWhitespace);
            pendingWhitespace = '';
          }
          pendingStack = { base: imgHtml, overlays: [] };
        }
      } else {
        // Check for emoji :shortcode: — treat as stackable base
        if (typeof EMOJI_BY_NAME !== 'undefined' && word.startsWith(':') && word.endsWith(':') && word.length > 2) {
          const emojiName = word.slice(1, -1)
          const emojiEntry = EMOJI_BY_NAME.get(emojiName)
          if (emojiEntry) {
            if (pendingStack) {
              result.push(renderEmoteStack(pendingStack))
            }
            if (pendingWhitespace) {
              result.push(pendingWhitespace)
              pendingWhitespace = ''
            }
            const emojiHtml = `<span class="hs-mc-emoji" title=":${escapeHtml(emojiName)}:">${emojiEntry.emoji}</span>`
            pendingStack = { base: emojiHtml, overlays: [] }
            continue
          }
        }
        // Check for Unicode emoji — treat as stackable base
        if (UNICODE_EMOJI_RE.test(word)) {
          if (pendingStack) {
            result.push(renderEmoteStack(pendingStack))
          }
          if (pendingWhitespace) {
            result.push(pendingWhitespace)
            pendingWhitespace = ''
          }
          const emojiHtml = `<span class="hs-mc-emoji">${escapeHtml(word)}</span>`
          pendingStack = { base: emojiHtml, overlays: [] }
          continue
        }
        // Text - flush stack and add text
        if (pendingStack) {
          result.push(renderEmoteStack(pendingStack));
          pendingStack = null;
        }
        if (pendingWhitespace) {
          result.push(pendingWhitespace);
          pendingWhitespace = '';
        }
        // Color @mentions — always hoverable for profile cards
        if (word.startsWith('@') && word.length > 1) {
          const name = word.slice(1).replace(/[,.:!?]+$/, '').toLowerCase();
          const color = knownColors.get(name) || '#dedede';
          result.push(`<a href="https://heatsync.org/user/${encodeURIComponent(name)}" target="_blank" class="hs-mc-user" data-username="${escapeHtml(name)}" style="color:${sanitizeColor(color)};font-weight:bold">${escapeHtml(word)}</a>`);
        } else if (linksEnabled && /^(https?:\/\/\S+|[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*)/i.test(word)) {
          // Validate URL protocol before creating link (block javascript:, data:, etc.)
          const hasProtocol = /^https?:\/\//i.test(word);
          const fullUrl = hasProtocol ? word : `https://${word}`;
          if (/^https?:\/\//i.test(fullUrl)) {
            const safeUrl = escapeHtml(word);
            const safeHref = escapeHtml(fullUrl);
            result.push(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="hs-mc-link">${safeUrl}</a>`);
          } else {
            result.push(escapeHtml(word));
          }
        } else {
          result.push(escapeHtml(word));
        }
      }
    }

    // Flush any remaining stack
    if (pendingStack) {
      result.push(renderEmoteStack(pendingStack));
    }
    if (pendingWhitespace) {
      result.push(pendingWhitespace);
    }

    return result.join('');
  }

  // Render an emote stack (base + overlays)
  function renderEmoteStack(stack) {
    if (stack.overlays.length === 0) {
      return stack.base;
    }
    const overlayHtml = stack.overlays.map(o =>
      o.replace('class="hs-mc-emote ', 'class="hs-mc-emote hs-mc-overlay-emote ')
    ).join('');
    const count = stack.overlays.length + 1;
    return `<span class="hs-mc-emote-stack" data-stack-count="${count}" title="expand"><span class="hs-mc-emote-stack-emotes">${stack.base}${overlayHtml}</span><span class="hs-mc-stack-collapse" title="collapse">\u00d7</span><span class="hs-mc-stack-block-all" title="block all">\u2298</span></span>`;
  }
