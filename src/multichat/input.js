// Input - chat input, autocomplete, send message, reply state

// Message history — up/down arrow recalls previously sent messages
const mcMessageHistory = []
const MC_HISTORY_MAX = 50
let mcHistoryIndex = -1
let mcHistoryDraft = ''

// Brief red flash on input to indicate message can't be sent from this tab
function flashInputError(input) {
  if (!input) return
  input.style.background = '#400000'
  input.style.borderColor = '#ff0000'
  setTimeout(() => {
    input.style.background = ''
    input.style.borderColor = ''
  }, 600)
}

// Per-emote operation lock to prevent race conditions from rapid clicking
const pendingEmoteOps = new Set();

// Cache own badge string from IRC messages for optimistic display
let _ownBadges = ''

// Echo dedup — suppress own message echoes from IRC/KickChat relay
// Uses a Set of {text, time} to handle rapid sends without overwriting
const _recentSentMessages = []
const SENT_DEDUP_WINDOW = 10000 // 10s

function trackSentMessage(text) {
  _recentSentMessages.push({ text, time: Date.now() })
  // Prune old entries
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  while (_recentSentMessages.length > 0 && _recentSentMessages[0].time < cutoff) {
    _recentSentMessages.shift()
  }
}

function isSentEcho(msgText) {
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  for (let i = _recentSentMessages.length - 1; i >= 0; i--) {
    const entry = _recentSentMessages[i]
    if (entry.time < cutoff) break
    if (entry.text === msgText) {
      // Dual-send only: first echo displays, second is suppressed
      entry.suppressed = (entry.suppressed || 0) + 1
      if (entry.suppressed >= 2) {
        _recentSentMessages.splice(i, 1)
        return true
      }
      return false
    }
  }
  return false
}

// Autocomplete state (Tab-only cycling, no dropdown)
let acState = {
matches: [],
index: 0,
active: false,  // true when cycling through matches
wordStart: 0,   // Position where the completion word starts
afterText: ''   // Text after the completion
};

// Emoji dropdown autocomplete state
let emojiAcState = {
  active: false,
  matches: [],
  index: 0,
  query: '',
  colonPos: -1,    // position of the triggering ':'
}
let _emojiAcDebounce = null
function rebuildInput() {
  const bar = document.getElementById('hs-mc-inputbar');
  if (!bar) return;

  // Save current text
  const oldInput = document.getElementById('hs-mc-input');
  const savedText = oldInput ? getInputText() : pendingMessage;

  // Remove old input and its wrap/highlight overlay (created by updateCharCount for plain <input>)
  const oldWrap = document.getElementById('hs-mc-input-wrap');
  if (oldWrap) oldWrap.remove();
  const oldHighlight = document.getElementById('hs-mc-input-highlight');
  if (oldHighlight) oldHighlight.remove();
  if (oldInput) oldInput.remove();

  // Create new input element
  const emoteBtn = bar.querySelector('#hs-mc-emote-btn');
  if (wysiwygEnabled) {
    const div = document.createElement('div');
    div.id = 'hs-mc-input';
    div.contentEditable = 'true';
    div.setAttribute('data-placeholder', t('mc_input_send_message'));
    div.spellcheck = false;
    if (emoteBtn) bar.insertBefore(div, emoteBtn);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'hs-mc-input';
    input.placeholder = t('mc_input_send_message');
    input.autocomplete = 'off';
    input.spellcheck = false;
    if (emoteBtn) bar.insertBefore(input, emoteBtn);
  }

  // Restore text and reinit
  const newInput = document.getElementById('hs-mc-input');
  if (newInput && savedText) {
    if (wysiwygEnabled) {
      newInput.textContent = savedText;
    } else {
      newInput.value = savedText;
    }
  }
  initInput();
  updateCharCount();
}

/**
 * Create unified input bar - ALWAYS visible, text persists across tabs
 */
function createInputBar() {
  const bar = document.createElement('div');
  bar.id = 'hs-mc-inputbar';
  const iconUrl = chrome.runtime.getURL('icon-48.png');
  const iconBlackUrl = chrome.runtime.getURL('icon-48-black.png');

  const inputHtml = wysiwygEnabled
    ? `<div id="hs-mc-input" contenteditable="true" data-placeholder="${t('mc_input_send_message')}" spellcheck="false"></div>`
    : `<input type="text" id="hs-mc-input" placeholder="${t('mc_input_send_message')}" autocomplete="off" spellcheck="false">`;

  bar.innerHTML = `
    ${inputHtml}
    <button id="hs-mc-emote-btn"><img src="${iconUrl}" data-src="${iconUrl}" data-src-black="${iconBlackUrl}" alt="hs"></button>
  `;

  // Initialize input after DOM insertion
  setTimeout(() => {
    initInput();
    const btn = bar.querySelector('#hs-mc-emote-btn');
    const img = btn?.querySelector('img');
    if (btn && img) {
      btn.addEventListener('mouseenter', () => { img.src = img.dataset.srcBlack })
      btn.addEventListener('mouseleave', () => { img.src = img.dataset.src })
    }
  }, 0);
  return bar;
}
// Get text from input (handles both input and contenteditable)
function getInputText() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return '';
  if (wysiwygEnabled) {
    // Convert emote images, stacks, and cycling spans back to text
    let text = '';
    const extractNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
        text += node.dataset.emoteName || node.alt || ''
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-input-stack')) {
        // Stack: extract each child emote name, space-separated
        for (const child of node.children) {
          if (child.tagName === 'IMG') {
            if (text && !text.endsWith(' ')) text += ' '
            text += child.dataset.emoteName || child.alt || ''
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-mc-user')) {
        // Bare-username mention chip: send as raw username
        text += node.dataset.username || node.textContent || ''
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        text += node.textContent || ''
      }
    }
    for (const node of input.childNodes) extractNode(node)
    return text.replace(/\u00A0/g, ' ');
  }
  return input.value || '';
}
function initInput() {
  const input = document.getElementById('hs-mc-input');
  const sendBtn = document.getElementById('hs-mc-send');
  log('🎯 initInput called, input found:', !!input);
  if (!input) {
    log('❌ Input not found in DOM yet, retrying...');
    setTimeout(initInput, 100);
    return;
  }
  // Mark input as initialized to avoid duplicate handlers
  if (input._hsInitialized) {
    log('⚠️ Input already initialized');
    return;
  }
  input._hsInitialized = true;
  log('✅ Initializing input handlers, WYSIWYG:', wysiwygEnabled);

  // Restore pending message
  if (pendingMessage) {
    if (wysiwygEnabled) {
      input.textContent = pendingMessage;
    } else {
      input.value = pendingMessage;
    }
  }

  input.addEventListener('keydown', handleInputKeydown);
  input.addEventListener('input', handleInputChange);
  input.addEventListener('input', updateCharCount);
  // Sync highlight overlay scroll with input scroll (RAF-throttled)
  let _inputScrollRaf = null
  input.addEventListener('scroll', () => {
    if (_inputScrollRaf) return
    _inputScrollRaf = requestAnimationFrame(() => {
      _inputScrollRaf = null
      const hl = document.getElementById('hs-mc-input-highlight')
      if (hl) hl.scrollLeft = input.scrollLeft
    })
  }, { passive: true })
  input.addEventListener('input', () => {
    const hasText = (input.value || input.textContent || '').trim().length > 0
    if (hasText) showInputBar()
    else hideInputBar()
  });
  input.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 150)
    setTimeout(hideEmojiDropdown, 150)
    // Hide input bar after blur if empty (delay to allow click-to-emote-picker)
    // Skip if window lost focus — prevents hiding when switching apps
    setTimeout(() => { if (document.hasFocus()) hideInputBar() }, 200)
  });
  sendBtn?.addEventListener('click', sendMessage);

  // Set up drag-drop handlers for media upload
  setupMediaDropHandlers();

  // Pasted image handler — applies in BOTH wysiwyg and plain modes
  input.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleMediaUpload(file);
          return;
        }
      }
    }
  });

  // WYSIWYG: handle paste to strip formatting
  if (wysiwygEnabled) {
    input.addEventListener('paste', (e) => {
      // If a previous handler already prevented default (image upload), skip
      if (e.defaultPrevented) return;
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (!text) return;
      if (!document.execCommand('insertText', false, text)) {
        // Fallback: insert via Selection/Range API
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  }

  // Initialize character counter
  updateCharCount();

  // Emote picker button (includes twitch features in tabs)
  const emoteBtn = document.getElementById('hs-mc-emote-btn');
  if (emoteBtn && !emoteBtn._hsInitialized) {
    emoteBtn._hsInitialized = true;
    emoteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const picker = document.getElementById('hs-mc-emote-picker');
      if (picker?.classList.contains('visible')) {
        picker.classList.remove('visible');
        adjustOverlayForPicker(false);
        hideInputBar();
        if (_pickerCloseHandler) {
          document.removeEventListener('click', _pickerCloseHandler);
          _pickerCloseHandler = null;
        }
      } else {
        showEmotePicker();
      }
    });
  }

  // Update placeholder based on current tab
  updateInputPlaceholder();

  // Global Tab key to focus input — only when multichat panel is active
  if (!window._hsMcTabHandler) {
    window._hsMcTabHandler = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (currentTab === 'add' || currentTab === 'settings') return;
      const active = document.activeElement;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;
      // Don't steal Tab from other inputs (except Twitch's chat input)
      if (active && active !== document.body && active.tagName === 'INPUT' && active.id !== 'hs-mc-input' && !active.dataset?.aTarget) return;
      if (active && active !== document.body && active.tagName === 'TEXTAREA' && active.id !== 'hs-mc-input') return;

      // If not already in our input, reveal bar and focus it
      if (active !== input) {
        e.preventDefault();
        showInputBar();
        input.focus();
      }
    }, { capture: true, signal: mcSignal });
  }

  // Auto-reveal input bar when user starts typing anywhere
  if (!window._hsMcTypeRevealHandler) {
    window._hsMcTypeRevealHandler = true
    document.addEventListener('keydown', (e) => {
      if (inputBarVisible) return
      if (currentTab === 'add' || currentTab === 'settings') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal focus from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      // Only printable chars — skip modifiers, nav, function keys
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length !== 1) return
      // Prevent platform shortcuts (Kick fullscreen "f", theater "t", etc.)
      e.preventDefault()
      e.stopImmediatePropagation()
      showInputBar()
      input.focus()
      // Manually insert the character since we prevented default
      if (input.isContentEditable) {
        document.execCommand('insertText', false, e.key)
      } else {
        input.value += e.key
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }, { capture: true, signal: mcSignal })

    // Catch paste when input bar is hidden — reveal bar and insert text
    document.addEventListener('paste', (e) => {
      if (inputBarVisible) return
      if (currentTab === 'add') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal paste from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      // Check for pasted image first
      const items = e.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file) {
              e.preventDefault()
              handleMediaUpload(file)
              return
            }
          }
        }
      }
      const text = e.clipboardData?.getData('text/plain')
      if (!text) return
      e.preventDefault()
      showInputBar()
      input.focus()
      // Insert pasted text into the input
      if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
        input.value = text
        input.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        document.execCommand('insertText', false, text)
      }
    }, { signal: mcSignal })
  }

  // Helper: find emote wrapper or img from event target
  function findEmoteTarget(target) {
    // Check wrapper first (our emotes)
    const wrapper = target.closest('.hs-mc-emote-wrapper');
    if (wrapper) {
      return {
        wrapper,
        emoteName: wrapper.dataset.emoteName || wrapper.querySelector('img')?.alt || 'emote',
        state: wrapper.dataset.state || 'global',
        emoteUrl: wrapper.dataset.emoteUrl || wrapper.querySelector('img')?.src || '',
        source: wrapper.dataset.source || 'unknown'
      };
    }
    // Fallback: direct IMG (Twitch/7TV/BTTV native emotes, picker emotes)
    if (target.tagName === 'IMG' && !target.classList.contains('hs-mc-badge-img') && (
      target.classList.contains('hs-mc-emote') ||
      target.classList.contains('hs-mc-picker-emote') ||
      target.classList.contains('chat-line__message--emote') ||
      target.classList.contains('chat-image') ||
      target.src?.includes('7tv.app') ||
      target.src?.includes('betterttv.net') ||
      (target.src?.includes('frankerfacez') && !target.src?.includes('room-badge/')) ||
      target.src?.includes('static-cdn.jtvnw.net/emoticons')
    )) {
      return {
        wrapper: null,
        emoteName: target.alt || target.dataset.emoteName || target.title?.split(' ')[0] || 'emote',
        state: target.dataset.state || 'global',
        emoteUrl: target.src || '',
        source: target.dataset.source || 'unknown'
      };
    }
    return null;
  }

  // Global right-click handler for ALL emotes
  if (!window._hsMcEmoteContextHandler) {
    window._hsMcEmoteContextHandler = true;
    document.addEventListener('contextmenu', (e) => {
      // Stack expand on right-click
      const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)');
      if (collapsedStack) {
        e.preventDefault();
        e.stopPropagation();
        collapsedStack.classList.add('expanded');
        collapsedStack.removeAttribute('title');
        return;
      }

      const emoteInfo = findEmoteTarget(e.target);
      if (!emoteInfo) return;
      log('Emote right-click:', emoteInfo.emoteName, emoteInfo.state);

      e.preventDefault();
      e.stopPropagation();

      const { emoteName, state } = emoteInfo;

      // Prevent race conditions from rapid clicking
      if (pendingEmoteOps.has(emoteName)) return;

      if (state === 'blocked') {
        unblockEmote(emoteName);
      } else if (state === 'owned') {
        removeEmoteFromInventory(emoteName, e.target);
      } else {
        blockEmote(emoteName);
      }
    }, { capture: true, signal: mcSignal });
  }

  // Global left-click handler for ALL emotes
  if (!window._hsMcEmoteClickHandler) {
    window._hsMcEmoteClickHandler = true;
    document.addEventListener('click', (e) => {
      // Stack collapse button
      if (e.target.closest('.hs-mc-stack-collapse')) {
        e.preventDefault();
        e.stopPropagation();
        const stack = e.target.closest('.hs-mc-emote-stack');
        if (stack) {
          stack.classList.remove('expanded');
          stack.setAttribute('title', 'expand');
        }
        return;
      }
      // Stack block-all button
      if (e.target.closest('.hs-mc-stack-block-all')) {
        e.preventDefault();
        e.stopPropagation();
        const stack = e.target.closest('.hs-mc-emote-stack');
        if (stack) blockAllEmotesInStack(stack);
        return;
      }
      // Collapsed stack left-click → paste all emote names to input
      const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)');
      if (collapsedStack) {
        e.preventDefault();
        e.stopPropagation();
        const names = [...collapsedStack.querySelectorAll('.hs-mc-emote-wrapper[data-emote-name]')]
          .map(w => w.dataset.emoteName)
          .filter(Boolean);
        if (names.length > 0) {
          showInputBar();
          for (const name of names) pasteEmoteToInput(name);
          const input = document.getElementById('hs-mc-input');
          if (input) input.focus();
          flashAllEmotes(names[0], 'hs-flash-paste');
        }
        return;
      }

      const emoteInfo = findEmoteTarget(e.target);
      if (!emoteInfo) return;

      e.preventDefault();
      e.stopPropagation();

      const { emoteName, state, emoteUrl, source } = emoteInfo;

      if (state === 'blocked') {
        unblockEmote(emoteName);
      } else if (state === 'owned' || state === 'global' || state === 'channel') {
        // Paste to input (no lock needed — instant, no async)
        showInputBar();
        pasteEmoteToInput(emoteName);
        const input = document.getElementById('hs-mc-input');
        if (input) input.focus();
        flashAllEmotes(emoteName, 'hs-flash-paste');
      } else if (state === 'unadded') {
        if (pendingEmoteOps.has(emoteName)) return;
        addEmoteToInventory(emoteName, emoteUrl, source, e.target);
        flashAllEmotes(emoteName, 'hs-flash-add');
      }
    }, { capture: true, signal: mcSignal });
  }

  // Spoiler click → toggle revealed
  if (!window._hsMcSpoilerHandler) {
    window._hsMcSpoilerHandler = true
    document.addEventListener('click', (e) => {
      const spoiler = e.target.closest('.hs-spoiler')
      if (!spoiler) return
      e.stopPropagation()
      spoiler.classList.toggle('revealed')
    }, { signal: mcSignal })
  }

  // Reply button click → set reply state and focus input
  if (!window._hsMcReplyHandler) {
    window._hsMcReplyHandler = true
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.hs-mc-reply-btn')
      if (!btn) return
      const msg = btn.closest('.hs-mc-msg')
      if (!msg?.dataset.msgId) return
      setReplyState({
        msgId: msg.dataset.msgId,
        user: msg.dataset.msgUser,
        channel: msg.dataset.msgChannel
      })
    }, { signal: mcSignal })
  }

  // Right-click on message → mute/unmute user (synced across all tabs + devices via server WS)
  if (!window._hsMcMsgContextHandler) {
    window._hsMcMsgContextHandler = true;
    document.addEventListener('contextmenu', (e) => {
      const msg = e.target.closest('.hs-mc-msg');
      if (!msg) return;
      // Don't intercept if clicking an emote (let emote handler handle it)
      if (findEmoteTarget(e.target)) return;

      e.preventDefault();
      const userEl = msg.querySelector('.hs-mc-user');
      const username = userEl?.textContent?.trim()?.toLowerCase();
      if (!username) return;

      if (mutedUsers.has(username)) {
        mutedUsers.delete(username);
        showToast(`unmuted ${username}`);
        // Sync: tell background to unmute (broadcasts to all tabs — server mute expires naturally)
        safeSendMessage({ type: 'unmute_user', username });
      } else {
        mutedUsers.add(username);
        showToast(`muted ${username} (24h)`);
        // Sync: tell background to mute with 24h expiry (broadcasts to all tabs + server)
        const expiresAt = Date.now() + 86400000;
        safeSendMessage({ type: 'mute_user', username, expiresAt });
      }
      // Also persist locally for offline/fallback
      chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] });
      renderMessages(currentTab);
    }, { signal: mcSignal });
  }
}
function applyMcMutes() {
  document.querySelectorAll('.hs-mc-msg').forEach(msg => {
    const userEl = msg.querySelector('.hs-mc-user');
    const username = userEl?.textContent?.trim()?.toLowerCase();
    if (username && mutedUsers.has(username)) {
      stripMcMutedMessage(msg);
    } else {
      msg.classList.remove('hs-mc-muted');
    }
  });
}
function stripMcMutedMessage(msg) {
  msg.classList.add('hs-mc-muted');
  // Message content is raw text nodes on the div — CSS can't hide those
  [...msg.childNodes].forEach(node => {
    if (node.nodeType === 3) node.textContent = '';
  });
  // Mention links share .hs-mc-user (so they get color/hover) but live inside
  // the message body — strip them or they leak through the muted CSS.
  msg.querySelectorAll('.hs-mc-mention, .hs-mc-reply-ctx').forEach(el => el.remove());
  // Remove emote images and other content (not user/badge/timestamp/platform)
  msg.querySelectorAll('img:not(.hs-mc-badge-img), .heatsync-emote-wrapper, .hs-mc-emote').forEach(el => {
    if (!el.closest('.hs-mc-user') && !el.classList.contains('hs-mc-badge-img') && !el.classList.contains('hs-mc-platform-badge')) {
      el.remove();
    }
  });
}

function updateInputPlaceholder() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  let placeholder;
  if (currentTab === 'feed') {
    placeholder = t('mc_input_post_heatsync');
  } else if (currentTab === 'live') {
    const channel = getLiveChannel();
    placeholder = channel ? t('mc_input_send_channel', [channel]) : t('mc_input_send_message');
  } else if (currentTab === 'mentions') {
    const channel = getCurrentChannel();
    placeholder = channel ? t('mc_input_send_channel', [channel]) : t('mc_input_send_message');
  } else if (currentTab === 'whispers') {
    const lastUser = lastWhisperKey ? whisperUsers.get(lastWhisperKey) : null
    placeholder = lastUser ? `/r to reply to ${lastUser.displayName}` : t('mc_whisper_hint')
  } else if (currentTab === 'add') {
    placeholder = '';
  } else {
    // Channel tab — resolve display name for placeholder
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab);
    const chanName = typeof ch === 'string' ? ch : (ch?.twitch || ch?.kick || ch?.youtube?.replace(/^https?:\/\/(www\.)?youtube\.com\/@?/, '').replace(/\/.*/, '') || ch?.id);
    placeholder = t('mc_input_send_channel', [chanName]);
  }

  if (wysiwygEnabled) {
    input.dataset.placeholder = placeholder;
  } else {
    input.placeholder = placeholder;
  }
}
function handleInputKeydown(e) {
  const input = e.target;

  // Stop propagation so platform shortcuts (Kick theater "t", etc.) don't fire
  e.stopPropagation()

  // Emoji dropdown navigation — intercept before other handlers
  if (emojiAcState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      emojiAcState.index = (emojiAcState.index + 1) % emojiAcState.matches.length
      showEmojiDropdown(emojiAcState.matches, emojiAcState.index)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      emojiAcState.index = (emojiAcState.index - 1 + emojiAcState.matches.length) % emojiAcState.matches.length
      showEmojiDropdown(emojiAcState.matches, emojiAcState.index)
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const emojiMatch = emojiAcState.matches[emojiAcState.index]
      // Build full match list for Tab cycling (emotes + emojis matching the query)
      const allMatches = findEmoteMatches(':' + emojiAcState.query)
      insertEmojiFromDropdown(emojiMatch)
      // Set up acState so subsequent Tabs cycle through all matches
      if (e.key === 'Tab' && allMatches.length > 1) {
        acState.matches = allMatches
        // Find the inserted emoji's index in the full match list
        acState.index = allMatches.findIndex(m => m.type === 'emoji' && m.emoji === emojiMatch.emoji)
        if (acState.index === -1) acState.index = 0
        acState.active = true
        // For plain text input, set wordStart/afterText so cycling works
        if (!wysiwygEnabled && input.value !== undefined) {
          const val = input.value
          const cursor = input.selectionStart
          // The emoji was just inserted — find where it starts
          acState.wordStart = cursor - emojiMatch.emoji.length
          // afterText is everything after cursor
          acState.afterText = val.slice(cursor)
        }
        // For WYSIWYG, mark the inserted emoji span as cycling element
        if (wysiwygEnabled) {
          const input = document.getElementById('hs-mc-input')
          const sel = window.getSelection()
          if (sel?.rangeCount && input) {
            // Find the emoji text we just inserted and wrap it in cycling span
            const range = sel.getRangeAt(0)
            const node = range.startContainer
            if (node?.nodeType === Node.TEXT_NODE) {
              const text = node.textContent
              const emojiIdx = text.lastIndexOf(emojiMatch.emoji)
              if (emojiIdx >= 0) {
                const before = text.slice(0, emojiIdx)
                const after = text.slice(emojiIdx + emojiMatch.emoji.length)
                node.textContent = before
                const span = document.createElement('span')
                span.className = 'hs-cycling-text'
                span.textContent = emojiMatch.emoji
                span.dataset.completionName = emojiMatch.name
                const afterNode = document.createTextNode(after)
                const parent = node.parentNode
                const next = node.nextSibling
                if (next) {
                  parent.insertBefore(span, next)
                  parent.insertBefore(afterNode, next)
                } else {
                  parent.appendChild(span)
                  parent.appendChild(afterNode)
                }
                placeCaretAfter(afterNode.textContent ? afterNode : span)
              }
            }
          }
        }
        showCycleTooltip()
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideEmojiDropdown()
      return
    }
  }

  // Message history navigation (ArrowUp/ArrowDown)
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && !e.ctrlKey && mcMessageHistory.length > 0) {
    const currentText = getInputText().trim()
    if (mcHistoryIndex >= 0 || (e.key === 'ArrowUp' && currentText.length === 0) || (e.key === 'ArrowUp' && mcMessageHistory.includes(currentText))) {
      e.preventDefault()
      if (e.key === 'ArrowUp') {
        if (mcHistoryIndex < 0) mcHistoryDraft = currentText
        mcHistoryIndex = Math.min(mcHistoryIndex + 1, mcMessageHistory.length - 1)
      } else {
        mcHistoryIndex--
      }
      const text = mcHistoryIndex < 0 ? mcHistoryDraft : mcMessageHistory[mcHistoryIndex]
      if (wysiwygEnabled) {
        input.textContent = text
      } else {
        input.value = text
      }
      mcHistoryIndex = Math.max(mcHistoryIndex, -1)
      return
    }
  }

  // Tab - cycle through emote completions
  if (e.key === 'Tab') {
    e.preventDefault();

    if (acState.active && acState.matches.length > 0) {
      // Already cycling - next (Tab) or previous (Shift+Tab)
      const len = acState.matches.length;
      acState.index = (acState.index + (e.shiftKey ? len - 1 : 1)) % len;
      insertCompletionKeepOpen(acState.matches[acState.index]);
      showCycleTooltip();
    } else {
      // First Tab - find matches
      const word = getCurrentWord(input);
      if (word.length >= 2) {
        const matches = findEmoteMatches(word);
        if (matches.length > 0) {
          // Save state for cycling (WYSIWYG handles positions internally)
          acState.matches = matches;
          acState.index = 0;
          acState.active = true;

          if (!wysiwygEnabled && input.value !== undefined) {
            // Calculate positions for text input cycling (textarea only)
            const text = input.value;
            const pos = input.selectionStart;
            const before = text.slice(0, pos);
            const wordStart = before.search(/\S+$/);
            acState.wordStart = wordStart >= 0 ? wordStart : pos;
            // Skip past rest of word after cursor
            let wordEnd = pos;
            while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++;
            acState.afterText = text.slice(wordEnd);
          }

          insertCompletionKeepOpen(matches[0]);
          showCycleTooltip();
        }
      }
    }
    return;
  }

  // Any other key resets autocomplete cycling (ignore modifier keys)
  if (acState.active && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
    hideAutocomplete();
  }

  // Enter - send message
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
    return;
  }

  // Escape - cancel reply state and hide autocomplete
  if (e.key === 'Escape') {
    if (replyState) clearReplyState()
    hideAutocomplete();
    return;
  }
}

function handleInputChange(e) {
  // Save pending message (persists across tab switches)
  pendingMessage = getInputText();

  // Debounced emoji dropdown autocomplete
  if (_emojiAcDebounce) cleanup.clearTimeout(_emojiAcDebounce)
  _emojiAcDebounce = cleanup.setTimeout(checkEmojiAutocomplete, 80)

  // Reset autocomplete cycling on any text change
  if (acState.active) {
    hideAutocomplete();
  }

  // Live emoji conversion in contenteditable: :shortcode: → emoji span
  if (wysiwygEnabled && _emojiMap.size > 0) {
    const input = document.getElementById('hs-mc-input')
    if (input?.isContentEditable) {
      const sel = window.getSelection()
      if (!sel?.rangeCount) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node?.nodeType !== Node.TEXT_NODE) return
      const text = node.textContent
      const cursorOffset = range.startOffset
      // Look for :shortcode: ending at cursor
      const before = text.slice(0, cursorOffset)
      const match = before.match(/:([a-z0-9_]+):$/)
      if (match) {
        const emoji = _emojiMap.get(match[1])
        if (emoji) {
          const start = cursorOffset - match[0].length
          // Replace the :shortcode: text with emoji span
          const span = document.createElement('span')
          span.className = 'hs-mc-emoji'
          span.textContent = emoji
          span.title = ':' + match[1] + ':'
          span.setAttribute('data-emoji-name', match[1])
          const beforeNode = document.createTextNode(text.slice(0, start))
          const afterNode = document.createTextNode(text.slice(cursorOffset))
          const parent = node.parentNode
          parent.insertBefore(beforeNode, node)
          parent.insertBefore(span, node)
          parent.insertBefore(afterNode, node)
          parent.removeChild(node)
          // Place cursor after emoji
          const newRange = document.createRange()
          newRange.setStart(afterNode, 0)
          newRange.collapse(true)
          sel.removeAllRanges()
          sel.addRange(newRange)
          pendingMessage = getInputText()
          return
        }
      }
    }
  }

  // Live emote replacement: "emoteName " → <img> (triggered on space after emote name)
  if (wysiwygEnabled) {
    const input = document.getElementById('hs-mc-input')
    if (input?.isContentEditable) {
      const sel = window.getSelection()
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0)
        const node = range.startContainer
        if (node?.nodeType === Node.TEXT_NODE) {
          const text = node.textContent
          const cursor = range.startOffset
          const before = text.slice(0, cursor)
          const match = before.match(/(\S+)\s$/)
          if (match) {
            const word = match[1]
            const emote = lookupEmote(word)
            if (emote) {
              const img = createInputEmoteImg(word)
              if (img) {
                const wordStart = cursor - match[0].length
                const beforeText = text.slice(0, wordStart)
                const afterText = text.slice(cursor)
                const parent = node.parentNode
                const isZeroWidth = !!emote.zeroWidth

                // Zero-width: stack onto previous emote if possible
                if (isZeroWidth && beforeText.trim() === '') {
                  // Look for emote element before this text node
                  let prev = node.previousSibling
                  while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                    prev = prev.previousSibling
                  }
                  if (prev && (
                    (prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
                    prev.classList?.contains('hs-input-stack')
                  )) {
                    // Remove whitespace text nodes between prev and current
                    let ws = prev.nextSibling
                    while (ws && ws !== node) {
                      const rm = ws
                      ws = ws.nextSibling
                      rm.remove()
                    }
                    stackInputEmote(prev, img)
                    node.textContent = afterText || '\u00A0'
                    const newRange = document.createRange()
                    newRange.setStart(node, 0)
                    newRange.collapse(true)
                    sel.removeAllRanges()
                    sel.addRange(newRange)
                    pendingMessage = getInputText()
                    return
                  }
                }

                // Regular emote: replace text with img
                const beforeNode = beforeText ? document.createTextNode(beforeText) : null
                const afterNode = document.createTextNode(afterText || '\u00A0')
                if (beforeNode) parent.insertBefore(beforeNode, node)
                parent.insertBefore(img, node)
                parent.insertBefore(afterNode, node)
                parent.removeChild(node)
                const newRange = document.createRange()
                newRange.setStart(afterNode, 0)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                pendingMessage = getInputText()
              }
            }
          }
        }
      }
    }
  }
}

function updateCharCount() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;
  const text = getInputText();
  const len = text.length;
  const over = len > 500;
  input.classList.toggle('over-limit', over);

  // Highlight overflow chars for plain <input> using overlay div
  if (input.tagName === 'INPUT') {
    let wrap = document.getElementById('hs-mc-input-wrap');
    // Wrap input in container on first use
    if (!wrap && input.parentElement) {
      wrap = document.createElement('div');
      wrap.id = 'hs-mc-input-wrap';
      input.parentElement.insertBefore(wrap, input);
      wrap.appendChild(input);
    }
    let hl = document.getElementById('hs-mc-input-highlight');
    if (over) {
      if (!hl && wrap) {
        hl = document.createElement('div');
        hl.id = 'hs-mc-input-highlight';
        wrap.appendChild(hl);
      }
      if (hl) {
        // Build overlay using safe DOM methods
        hl.textContent = '';
        const safeSpan = document.createElement('span');
        safeSpan.className = 'hl-safe';
        safeSpan.textContent = text.slice(0, 500);
        const overSpan = document.createElement('span');
        overSpan.className = 'hl-over';
        overSpan.textContent = text.slice(500);
        hl.appendChild(safeSpan);
        hl.appendChild(overSpan);
        hl.scrollLeft = input.scrollLeft;
        hl.style.display = '';
      }
      // Make real input text transparent so overlay shows through
      input.style.color = 'transparent';
      input.style.caretColor = '#000';
    } else {
      if (hl) hl.style.display = 'none';
      input.style.color = '';
      input.style.caretColor = '';
    }
  }
}

function getCurrentWord(input) {
  if (!input) return ''
  if (input.contentEditable === 'true') {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const range = sel.getRangeAt(0);
    let container = range.startContainer;
    let offset = range.startOffset;
    if (container.nodeType === Node.ELEMENT_NODE && offset > 0) {
      const child = container.childNodes[offset - 1];
      if (child?.nodeType === Node.TEXT_NODE) {
        container = child;
        offset = child.textContent.length;
      }
    }
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent;
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      const beforeMatch = before.match(/(\S+)$/);
      const afterMatch = after.match(/^(\S+)/);
      if (beforeMatch) return beforeMatch[1] + (afterMatch ? afterMatch[1] : '');
    }
    return '';
  }
  const text = input.value;
  const pos = input.selectionStart;
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const beforeMatch = before.match(/(\S+)$/);
  const afterMatch = after.match(/^(\S+)/);
  if (beforeMatch) return beforeMatch[1] + (afterMatch ? afterMatch[1] : '');
  return '';
}

function getRecencyMap() {
  // Returns Map<usernameLower, recencyRank> from current tab's chat buffer.
  // Lower rank = more recent. Caps at 50 unique users for sub-ms cost.
  const out = new Map()
  if (typeof smartCompletion === 'undefined' || !smartCompletion) return out
  if (typeof irc === 'undefined' || !irc?.channels) return out
  let ch = currentTab
  if (currentTab === 'live' && typeof getLiveChannel === 'function') ch = getLiveChannel()
  if (!ch) return out
  const buffer = irc.channels.get(typeof ch === 'string' ? ch.toLowerCase() : ch)
  if (!buffer?.getAll) return out
  const msgs = buffer.getAll()
  let rank = 0
  for (let i = msgs.length - 1; i >= 0 && rank < 50; i--) {
    const u = (msgs[i]?.user || '').toLowerCase()
    if (!u || out.has(u)) continue
    out.set(u, rank++)
  }
  return out
}

function findEmoteMatches(search) {
  const matches = [];

  // Check if searching for username (starts with @)
  const isUserSearch = search.startsWith('@');
  const searchTerm = isUserSearch ? search.slice(1) : search;
  const searchLower = searchTerm.toLowerCase();

  const recency = getRecencyMap()

  // Search usernames if @ prefix or if it could be a username
  if (isUserSearch || searchTerm.length >= 2) {
    for (const username of usernameCache) {
      if (!username) continue
      const userLower = username.toLowerCase();
      const color = (typeof knownColors !== 'undefined' && knownColors.get(userLower)) || '#fff'
      const recencyRank = recency.get(userLower)
      if (isUserSearch) {
        if (userLower.startsWith(searchLower)) {
          matches.push({ name: '@' + username, url: null, priority: 0, type: 'user', recencyRank });
        }
      } else {
        // No @ prefix: bare-name completion that renders as a styled mention chip
        if (userLower.startsWith(searchLower)) {
          matches.push({ name: username, url: null, priority: 0, type: 'user-bare', color, recencyRank });
        } else if (userLower.includes(searchLower)) {
          matches.push({ name: username, url: null, priority: 2, type: 'user-bare', color, recencyRank });
        }
      }
    }
  }

  // Search emote cache (unless explicitly searching users with @)
  if (!isUserSearch) {
    // Search global + channel emotes for current tab
    const acEmotes = new Map(emoteCache);
    const acChCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
    if (acChCache) for (const [k, v] of acChCache) acEmotes.set(k, v);
    for (const [name, emote] of acEmotes) {
      // Only tab-complete heatsync emotes you own (can't send emotes not in your set)
      if (emote.source === 'heatsync' && emote.state !== 'owned') continue;
      if (name.toLowerCase().startsWith(searchLower)) {
        matches.push({ name, url: emote.url, source: emote.source, priority: 0, type: 'emote' });
      } else if (name.toLowerCase().includes(searchLower)) {
        matches.push({ name, url: emote.url, source: emote.source, priority: 1, type: 'emote' });
      }
    }
  }

  // Emoji shortcodes when typing :prefix
  if (search.startsWith(':') && typeof EMOJI_DATA !== 'undefined') {
    const emojiPrefix = search.slice(1).toLowerCase();
    if (emojiPrefix.length > 0) {
      for (const entry of EMOJI_DATA) {
        if (matches.length >= 50) break;
        const emojiMatch = { name: `:${entry.name}:`, url: null, priority: entry.name.startsWith(emojiPrefix) ? 1 : 2, type: 'emoji', emoji: entry.emoji };
        if (entry.name.startsWith(emojiPrefix)) {
          matches.push(emojiMatch);
        } else if (entry.name.includes(emojiPrefix)) {
          emojiMatch.priority = 2;
          matches.push(emojiMatch);
        }
      }
    }
  }

  // Sort: prefix matches first, then by recency for username matches, then alphabetical
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const ar = (a.recencyRank ?? Infinity)
    const br = (b.recencyRank ?? Infinity)
    if (ar !== br) return ar - br;
    return a.name.localeCompare(b.name);
  });

  return matches;
}

// Insert completion and keep cycling state
function insertCompletionKeepOpen(match) {
  const input = document.getElementById('hs-mc-input');
  if (!input || !match) return;

  if (wysiwygEnabled) {
    insertCompletionWysiwyg(match);
    return;
  }

  // Use saved positions from acState for consistent cycling
  const beforeWord = input.value.slice(0, acState.wordStart);
  const insertText = match.type === 'emoji' ? match.emoji : match.name;
  const newValue = beforeWord + insertText + ' ' + acState.afterText;

  input.value = newValue;
  pendingMessage = input.value;

  // Position cursor after the inserted word
  const newPos = beforeWord.length + insertText.length + 1;
  input.selectionStart = input.selectionEnd = newPos;
  input.focus();

  updateCharCount();
}

// Build a styled mention chip span for bare-username completion
function createUserMentionSpan(username, color) {
  const span = document.createElement('span')
  span.className = 'hs-mc-user hs-cycling-user'
  const lower = username.toLowerCase()
  span.dataset.username = lower
  span.dataset.completionType = 'user-bare'
  span.textContent = username
  const safeColor = (typeof sanitizeColor === 'function') ? sanitizeColor(color || '#fff') : (color || '#fff')
  span.style.color = safeColor
  span.style.fontWeight = 'bold'
  span.style.cursor = 'pointer'
  span.contentEditable = 'false'
  // Click opens user profile — contenteditable swallows anchor clicks, so use explicit handler
  span.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(`https://heatsync.org/user/${encodeURIComponent(lower)}`, '_blank', 'noopener,noreferrer')
  })
  return span
}

// WYSIWYG emote insertion
function insertCompletionWysiwyg(match) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  // Check if we're replacing an existing cycling element (emote img, text span, or user span)
  const existingEmote = input.querySelector('img.hs-cycling-emote');
  const existingText = input.querySelector('span.hs-cycling-text');
  const existingUser = input.querySelector('span.hs-cycling-user');
  if (existingEmote) {
    if (match.url) {
      existingEmote.src = match.url;
      existingEmote.alt = match.name;
      existingEmote.dataset.emoteName = match.name;
    } else if (match.type === 'emoji') {
      // Replace emote img with emoji span
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.emoji
      span.dataset.completionName = match.name
      existingEmote.replaceWith(span)
      // Place caret after the span's trailing space
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else if (match.type === 'user-bare') {
      const userSpan = createUserMentionSpan(match.name, match.color)
      existingEmote.replaceWith(userSpan)
      const space = userSpan.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(userSpan)
    } else {
      const textNode = document.createTextNode(match.name + ' ');
      existingEmote.replaceWith(textNode);
      placeCaretAfter(textNode);
    }
    pendingMessage = getInputText();
    updateCharCount();
    return;
  }
  if (existingText) {
    if (match.url) {
      // Replace text span with emote img
      const img = document.createElement('img')
      img.src = match.url
      img.alt = match.name
      img.dataset.emoteName = match.name
      img.className = 'hs-input-emote hs-cycling-emote'
      img.draggable = false
      existingText.replaceWith(img)
      const space = img.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(img)
    } else if (match.type === 'emoji') {
      existingText.textContent = match.emoji
      existingText.dataset.completionName = match.name
      const space = existingText.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingText)
    } else if (match.type === 'user-bare') {
      const userSpan = createUserMentionSpan(match.name, match.color)
      existingText.replaceWith(userSpan)
      const space = userSpan.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(userSpan)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingText.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }
  if (existingUser) {
    if (match.url) {
      // Replace user span with emote img
      const img = document.createElement('img')
      img.src = match.url
      img.alt = match.name
      img.dataset.emoteName = match.name
      img.className = 'hs-input-emote hs-cycling-emote'
      img.draggable = false
      existingUser.replaceWith(img)
      const space = img.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(img)
    } else if (match.type === 'emoji') {
      const span = document.createElement('span')
      span.className = 'hs-cycling-text'
      span.textContent = match.emoji
      span.dataset.completionName = match.name
      existingUser.replaceWith(span)
      const space = span.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(span)
    } else if (match.type === 'user-bare') {
      // Update existing user span in place
      existingUser.textContent = match.name
      existingUser.dataset.username = match.name.toLowerCase()
      const safeColor = (typeof sanitizeColor === 'function') ? sanitizeColor(match.color || '#fff') : (match.color || '#fff')
      existingUser.style.color = safeColor
      const space = existingUser.nextSibling
      if (space) placeCaretAfter(space, 1)
      else placeCaretAfter(existingUser)
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingUser.replaceWith(textNode)
      placeCaretAfter(textNode)
    }
    pendingMessage = getInputText()
    updateCharCount()
    return
  }

  // First Tab: replace word with emote image
  const sel = window.getSelection();
  if (!sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  let container = range.startContainer;
  let rangeOffset = range.startOffset;
  // Resolve element boundary to preceding text node
  if (container.nodeType === Node.ELEMENT_NODE && rangeOffset > 0) {
    const child = container.childNodes[rangeOffset - 1];
    if (child?.nodeType === Node.TEXT_NODE) {
      container = child;
      rangeOffset = child.textContent.length;
    }
  }
  if (container.nodeType !== Node.TEXT_NODE) return;

  const textNode = container;
  const offset = rangeOffset;
  const text = textNode.textContent;

  // Find word start
  let wordStart = offset;
  while (wordStart > 0 && !/\s/.test(text[wordStart - 1])) wordStart--;

  // Find word end (skip past rest of word after cursor)
  let wordEnd = offset;
  while (wordEnd < text.length && !/\s/.test(text[wordEnd])) wordEnd++;

  // Split text: before | word | after
  const before = text.slice(0, wordStart);
  const after = text.slice(wordEnd);

  // Save afterText for cycling
  acState.afterText = after;

  // Helper: insert element after textNode with before/after text
  const insertElement = (el) => {
    textNode.textContent = before;
    const space = document.createTextNode('\u00A0' + after);
    const parent = textNode.parentNode;
    const nextSibling = textNode.nextSibling;
    if (nextSibling) {
      parent.insertBefore(el, nextSibling);
      parent.insertBefore(space, nextSibling);
    } else {
      parent.appendChild(el);
      parent.appendChild(space);
    }
    placeCaretAfter(space, 1);
  }

  if (match.url) {
    // Create emote image
    const img = document.createElement('img');
    img.src = match.url;
    img.alt = match.name;
    img.dataset.emoteName = match.name;
    img.className = 'hs-input-emote hs-cycling-emote';
    img.draggable = false;
    insertElement(img);
  } else if (match.type === 'emoji') {
    // Create emoji tracking span
    const span = document.createElement('span')
    span.className = 'hs-cycling-text'
    span.textContent = match.emoji
    span.dataset.completionName = match.name
    insertElement(span)
  } else if (match.type === 'user-bare') {
    // Bare-name mention chip: colored, hoverable, clickable
    const userSpan = createUserMentionSpan(match.name, match.color)
    insertElement(userSpan)
  } else {
    // User/text completion - just insert text
    const newText = before + match.name + ' ' + after;
    textNode.textContent = newText;
    const newPos = before.length + match.name.length + 1;
    range.setStart(textNode, newPos);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  pendingMessage = getInputText();
  updateCharCount();
  input.focus();
}

function placeCaretAfter(node, offset = 0) {
  const sel = window.getSelection();
  const range = document.createRange();
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(offset, node.length));
  } else {
    range.setStartAfter(node);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}


function showCycleTooltip() {
  let tt = document.getElementById('hs-mc-cycle-tooltip');
  if (!tt) {
    tt = document.createElement('div');
    tt.id = 'hs-mc-cycle-tooltip';
    tt.style.cssText = 'position:absolute;bottom:100%;left:8px;background:#000;color:#fff;padding:4px 8px;font-size:12px;border-radius: 0;z-index:1003;margin-bottom:4px;';
    document.getElementById('hs-mc-inputbar')?.appendChild(tt);
  }
  const m = acState.matches[acState.index];
  const label = m.type === 'emoji' ? `${m.emoji} ${m.name}` : m.name;
  tt.textContent = `${acState.index + 1}/${acState.matches.length} ${label}`;
  tt.style.display = 'block';
}

function hideCycleTooltip() {
  const tt = document.getElementById('hs-mc-cycle-tooltip');
  if (tt) tt.style.display = 'none';
}

function hideAutocomplete() {
  acState.active = false;
  acState.matches = [];
  acState.index = 0;
  acState.wordStart = 0;
  acState.afterText = '';
  hideCycleTooltip();

  // WYSIWYG: finalize cycling elements (remove cycling class so they're permanent)
  if (wysiwygEnabled) {
    const input = document.getElementById('hs-mc-input');
    const cyclingEmote = input?.querySelector('.hs-cycling-emote');
    if (cyclingEmote) {
      cyclingEmote.classList.remove('hs-cycling-emote');
    }
    const cyclingText = input?.querySelector('.hs-cycling-text');
    if (cyclingText) {
      // Replace span with plain text node
      const textNode = document.createTextNode(cyclingText.textContent);
      cyclingText.replaceWith(textNode);
    }
    const cyclingUser = input?.querySelector('.hs-cycling-user');
    if (cyclingUser) {
      // Keep the styled mention span — just clear the cycling marker
      cyclingUser.classList.remove('hs-cycling-user');
    }
  }
}

// --- Emoji dropdown autocomplete ---

function getEmojiColonContext(input) {
  // Returns { query, colonPos } if user is typing :shortcode, else null
  if (wysiwygEnabled) {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return null
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node?.nodeType !== Node.TEXT_NODE) return null
    const text = node.textContent
    const cursor = range.startOffset
    const before = text.slice(0, cursor)
    // Find last unmatched ':' — must not contain spaces or a closing ':'
    const match = before.match(/:([a-z0-9_]{2,})$/)
    if (!match) return null
    // Make sure this ':' isn't part of a completed :shortcode:
    const colonIdx = before.lastIndexOf(':')
    return { query: match[1], colonPos: colonIdx, textNode: node }
  }
  // Standard input
  const text = input.value
  const cursor = input.selectionStart
  const before = text.slice(0, cursor)
  const match = before.match(/:([a-z0-9_]{2,})$/)
  if (!match) return null
  const colonIdx = before.lastIndexOf(':')
  return { query: match[1], colonPos: colonIdx, textNode: null }
}

function filterEmoji(query) {
  if (_emojiMap.size === 0) return []
  const results = []
  const q = query.toLowerCase()
  for (const entry of EMOJI_DATA) {
    if (results.length >= 8) break
    if (entry.name.startsWith(q)) {
      results.push(entry)
    }
  }
  // If we have room, add substring matches
  if (results.length < 8) {
    for (const entry of EMOJI_DATA) {
      if (results.length >= 8) break
      if (!entry.name.startsWith(q) && entry.name.includes(q)) {
        results.push(entry)
      }
    }
  }
  return results
}

function showEmojiDropdown(matches, selectedIndex) {
  let dd = document.getElementById('hs-mc-emoji-dropdown')
  if (!dd) {
    dd = document.createElement('div')
    dd.id = 'hs-mc-emoji-dropdown'
    document.getElementById('hs-mc-inputbar')?.appendChild(dd)
  }
  dd.textContent = ''
  matches.forEach((entry, i) => {
    const row = document.createElement('div')
    row.className = 'hs-mc-emoji-row' + (i === selectedIndex ? ' selected' : '')
    row.dataset.index = i

    const emojiSpan = document.createElement('span')
    emojiSpan.className = 'hs-mc-emoji-preview'
    emojiSpan.textContent = entry.emoji

    const nameSpan = document.createElement('span')
    nameSpan.className = 'hs-mc-emoji-name'
    nameSpan.textContent = ':' + entry.name + ':'

    row.appendChild(emojiSpan)
    row.appendChild(nameSpan)

    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertEmojiFromDropdown(entry)
    })

    dd.appendChild(row)
  })
  dd.style.display = 'block'
}

function hideEmojiDropdown() {
  emojiAcState.active = false
  emojiAcState.matches = []
  emojiAcState.index = 0
  emojiAcState.query = ''
  emojiAcState.colonPos = -1
  const dd = document.getElementById('hs-mc-emoji-dropdown')
  if (dd) dd.style.display = 'none'
}

function insertEmojiFromDropdown(entry) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return

  if (wysiwygEnabled) {
    // Find the text node with the :query and replace it
    const sel = window.getSelection()
    if (!sel?.rangeCount) { hideEmojiDropdown(); return }
    const range = sel.getRangeAt(0)
    const node = range.startContainer
    if (node?.nodeType !== Node.TEXT_NODE) { hideEmojiDropdown(); return }
    const text = node.textContent
    const cursor = range.startOffset
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) { hideEmojiDropdown(); return }

    // Replace :query with emoji
    const newText = text.slice(0, colonIdx) + entry.emoji + text.slice(cursor)
    node.textContent = newText
    const newPos = colonIdx + entry.emoji.length
    const newRange = document.createRange()
    newRange.setStart(node, Math.min(newPos, node.textContent.length))
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  } else {
    const text = input.value
    const cursor = input.selectionStart
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) { hideEmojiDropdown(); return }

    input.value = text.slice(0, colonIdx) + entry.emoji + text.slice(cursor)
    const newPos = colonIdx + entry.emoji.length
    input.selectionStart = input.selectionEnd = newPos
  }

  pendingMessage = getInputText()
  updateCharCount()
  hideEmojiDropdown()
  input.focus()
}

function checkEmojiAutocomplete() {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  if (typeof EMOJI_DATA === 'undefined') return

  const ctx = getEmojiColonContext(input)
  if (!ctx) {
    if (emojiAcState.active) hideEmojiDropdown()
    return
  }

  const matches = filterEmoji(ctx.query)
  if (matches.length === 0) {
    if (emojiAcState.active) hideEmojiDropdown()
    return
  }

  emojiAcState.active = true
  emojiAcState.matches = matches
  emojiAcState.query = ctx.query
  emojiAcState.colonPos = ctx.colonPos
  emojiAcState.index = 0
  showEmojiDropdown(matches, 0)
}

// Reply state management
function setReplyState(state) {
  replyState = state
  showInputBar()
  const bar = document.getElementById('hs-mc-inputbar')
  if (!bar) return
  // Remove existing indicator
  document.getElementById('hs-mc-reply-indicator')?.remove()
  const indicator = document.createElement('div')
  indicator.id = 'hs-mc-reply-indicator'
  const label = document.createElement('span')
  label.textContent = '\u21a9 ' + t('mc_input_replying_to', [state.user])
  const cancel = document.createElement('button')
  cancel.id = 'hs-mc-reply-cancel'
  cancel.textContent = '✕'
  cancel.title = t('mc_input_cancel_reply')
  cancel.addEventListener('click', clearReplyState)
  indicator.appendChild(label)
  indicator.appendChild(cancel)
  bar.insertBefore(indicator, bar.firstChild)
  document.getElementById('hs-mc-input')?.focus()
}

function clearReplyState() {
  replyState = null
  document.getElementById('hs-mc-reply-indicator')?.remove()
  hideInputBar()
}

// Get Twitch auth token from cookie
function getTwitchAuthToken() {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const eqIdx = cookie.indexOf('=');
    if (eqIdx === -1) continue;
    const key = cookie.slice(0, eqIdx).trim();
    const value = cookie.slice(eqIdx + 1).trim();
    if (key === 'auth-token' && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

// Async version — returns { token, username } for cross-platform Twitch posting
// Tries document.cookie first, falls back to background.js cookies API
async function getTwitchAuthTokenAsync() {
  const localToken = getTwitchAuthToken()
  if (localToken) return { token: localToken, username: null }
  // Cross-domain: ask background.js to read Twitch cookies
  try {
    const resp = await safeSendMessage({ type: 'get_twitch_auth_token' })
    return { token: resp?.token || null, username: resp?.username || null }
  } catch {}
  return { token: null, username: null }
}

// Send message to current tab's channel
// Build emoji lookup map (once)
const _emojiMap = new Map()
if (typeof EMOJI_DATA !== 'undefined') {
  for (const e of EMOJI_DATA) _emojiMap.set(e.name, e.emoji)
}

// Replace :shortcode: patterns with emoji characters
function convertEmojiShortcodes(text) {
  if (_emojiMap.size === 0) return text
  return text.replace(/:([a-z0-9_]+):/g, (match, name) => _emojiMap.get(name) || match)
}

function clearInput(input) {
  hideEmojiDropdown()
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
}

// Slash commands we own. Anything not in here falls through to the platform
// (Twitch IRC / Kick) so /ban /timeout /mod /vip /raid /clear /slow /me etc
// just work for users with mod perms.
//
// Handler return contract:
//   true     -> consumed, do nothing else
//   string   -> rewrite the outgoing text to this and continue normal send
//   anything else -> not a slash command we handle, pass through unchanged
const SLASH_ALIASES = {
  post: 'op',
  whisper: 'w',
  re: 'r',
  reply: 'r',
  unban: null,        // pass through to platform
  untimeout: null,    // pass through to platform
  lc: 'lclear',
  '?': 'help',
}

async function handleSlashCommand(text, input) {
  const parts = text.match(/^\/(\w+|\?)\s*(.*)$/)
  if (!parts) return false
  let [, cmd, rest] = parts
  cmd = cmd.toLowerCase()
  if (SLASH_ALIASES[cmd] === null) return false  // explicit pass-through
  if (typeof SLASH_ALIASES[cmd] === 'string') cmd = SLASH_ALIASES[cmd]

  if (cmd === 'op') {
    if (!rest.trim()) { showToast('usage: /op <text>'); return true }
    await postFeedMessage(rest.trim(), { topLevel: true })
    return true
  }

  if (cmd === 'w') {
    const match = rest.match(/^@?(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /w <user> <message>'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('twitch', username, msg, input)
    return true
  }

  if (cmd === 'dm') {
    const match = rest.match(/^@?(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /dm <user> <message>'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('heatsync', username, msg, input)
    return true
  }

  if (cmd === 'r') {
    if (!rest.trim()) { showToast('usage: /r <message>'); return true }
    if (!lastWhisperKey) { showToast('no one to reply to'); return true }
    if (currentTab !== 'whispers') switchTab('whispers')
    await sendWhisperMessage(lastWhisperKey, rest.trim())
    clearInput(input)
    return true
  }

  if (cmd === 'mute') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) { showToast('usage: /mute <user>'); return true }
    if (mutedUsers.has(u)) { showToast(`${u} already muted`); return true }
    mutedUsers.add(u)
    chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
    safeSendMessage({ type: 'mute_user', username: u, expiresAt: Date.now() + 86400000 })
    showToast(`muted ${u} (24h)`)
    renderMessages(currentTab)
    return true
  }

  if (cmd === 'unmute') {
    const u = rest.trim().replace(/^@/, '').toLowerCase()
    if (!u) { showToast('usage: /unmute <user>'); return true }
    if (!mutedUsers.has(u)) { showToast(`${u} not muted`); return true }
    mutedUsers.delete(u)
    chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
    safeSendMessage({ type: 'unmute_user', username: u })
    showToast(`unmuted ${u}`)
    renderMessages(currentTab)
    return true
  }

  if (cmd === 'shrug') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '¯\\_(ツ)_/¯'
  }

  if (cmd === 'tableflip') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '(╯°□°)╯︵ ┻━┻'
  }

  if (cmd === 'unflip') {
    return (rest.trim() ? rest.trim() + ' ' : '') + '┬─┬ノ( ゜-゜ノ)'
  }

  if (cmd === 'lclear') {
    let cleared = 0
    if (irc?.channels?.has(currentTab)) { irc.channels.get(currentTab).clear?.(); cleared++ }
    if (kickChat?.channels?.has(currentTab)) { kickChat.channels.get(currentTab).clear?.(); cleared++ }
    renderMessages(currentTab)
    showToast(cleared ? 'local buffer cleared' : 'nothing to clear here')
    clearInput(input)
    return true
  }

  if (cmd === 'help') {
    showSlashHelp()
    clearInput(input)
    return true
  }

  return false
}

const SLASH_HELP_LINES = [
  '/op <text>           — post to feed',
  '/w <user> <msg>      — twitch whisper',
  '/dm <user> <msg>     — heatsync DM',
  '/r <msg>             — reply to last whisper',
  '/mute <user>         — local mute (24h)',
  '/unmute <user>       — local unmute',
  '/shrug [text]        — append ¯\\_(ツ)_/¯',
  '/tableflip [text]    — append (╯°□°)╯︵ ┻━┻',
  '/unflip [text]       — append ┬─┬ノ( ゜-゜ノ)',
  '/lclear              — clear current tab locally',
  '/help                — this list',
  '',
  'mod commands (/ban /timeout /unban /mod /vip /raid',
  '/slow /clear /followers /emoteonly /color /me etc.)',
  'pass through to twitch & kick when you have permission.',
]

function showSlashHelp() {
  // Reuse toast for short feedback — but the help list is multi-line, so build a
  // lightweight inline overlay instead.
  let panel = document.getElementById('hs-mc-slash-help')
  if (panel) { panel.remove(); return }
  panel = document.createElement('div')
  panel.id = 'hs-mc-slash-help'
  panel.style.cssText = 'position:fixed;bottom:60px;right:20px;z-index:99999;background:#000;border:2px solid #ff8700;padding:10px 14px;font:12px/1.4 monospace;color:#fff;white-space:pre;max-width:420px;box-shadow:0 0 12px rgba(255,135,0,0.5)'
  panel.textContent = SLASH_HELP_LINES.join('\n')
  panel.addEventListener('click', () => panel.remove())
  document.body.appendChild(panel)
  setTimeout(() => panel?.remove(), 12000)
}

async function sendSlashWhisper(platform, username, text, input) {
  const lowerUser = username.toLowerCase()
  let key

  if (platform === 'twitch') {
    key = `twitch:${lowerUser}`
    if (!whisperUsers.has(key)) {
      // Resolve username → Twitch ID via decapi
      try {
        const resp = await fetch(`https://decapi.me/twitch/id/${encodeURIComponent(lowerUser)}`, { credentials: 'omit' })
        const body = (await resp.text()).trim()
        if (!resp.ok || !/^\d+$/.test(body)) {
          showToast(t('mc_whisper_user_not_found', [username]))
          return
        }
        whisperUsersSet(key, { platform: 'twitch', userId: body, displayName: username, color: '#fff' })
      } catch (e) {
        showToast(t('mc_whisper_resolve_failed'))
        return
      }
    }
  } else {
    // HeatSync DM — resolve username → user_id via profile API
    const profileResp = await apiFetch(`/api/profile/${encodeURIComponent(lowerUser)}`)
    if (!profileResp.ok || !profileResp.data?.profile?.user_id) {
      showToast(t('mc_whisper_hs_not_found', [username]))
      return
    }
    const userId = profileResp.data.profile.user_id
    key = `hs:${userId}`
    whisperUsersSet(key, {
      platform: 'heatsync',
      userId,
      displayName: profileResp.data.profile.display_name || username,
      color: profileResp.data.profile.user_color || '#fff'
    })
  }

  if (currentTab !== 'whispers') switchTab('whispers')
  await sendWhisperMessage(key, text)
  clearInput(input)
}

async function sendMessage() {
  const input = document.getElementById('hs-mc-input');
  if (!input) { console.warn('[HS] SEND BAIL: no input element'); return; }

  let text = convertEmojiShortcodes(getInputText().trim());
  if (!text) { console.warn('[HS] SEND BAIL: empty text'); return; }

  // Slash commands — work from any tab. Handler may return:
  //   true   -> consumed, exit
  //   string -> rewrite outgoing text and continue normal send
  //   else   -> not ours, pass raw text through to platform
  if (text.startsWith('/')) {
    const result = await handleSlashCommand(text, input)
    if (result === true) return
    if (typeof result === 'string') text = result
  }

  // Non-chat tabs — plain text not allowed, use slash commands
  if (currentTab === 'whispers' || currentTab === 'feed' || currentTab === 'mentions') {
    flashInputError(input)
    return
  }

  // Determine target channel + platform
  let targetChannel
  let ch = null
  if (currentTab === 'live') {
    targetChannel = getLiveChannel()
  } else if (currentTab === 'add' || currentTab === 'settings') {
    flashInputError(input)
    return
  } else {
    ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
    targetChannel = typeof ch === 'string' ? ch : ch?.twitch || ch?.kick || currentTab
  }

  if (!targetChannel) {
    flashInputError(input)
    return
  }

  // Resolve platform targets
  const kickSlug = typeof ch !== 'string' ? ch?.kick : null
  const twitchName = typeof ch === 'string' ? ch : ch?.twitch
  const isLiveKick = currentTab === 'live' && hostPlatform === 'kick'

  const sendToKick = !!kickSlug || isLiveKick
  const sendToTwitch = !!twitchName && !isLiveKick

  const ytUrl = typeof ch !== 'string' ? ch?.youtube : null
  const isLiveYt = currentTab === 'live' && hostPlatform === 'yt'
  const sendToYoutube = !!ytUrl || isLiveYt
  const isDualSend = sendToKick && sendToTwitch

  // Track for echo dedup (dual-send only — suppress second platform's duplicate)
  if (isDualSend) {
    trackSentMessage(text)
  }

  // Push to message history (dedup consecutive, cap at max)
  if (mcMessageHistory[0] !== text) {
    mcMessageHistory.unshift(text)
    if (mcMessageHistory.length > MC_HISTORY_MAX) mcMessageHistory.length = MC_HISTORY_MAX
  }
  mcHistoryIndex = -1

  const replyParentId = replyState?.msgId || null
  clearReplyState()

  // Clear input immediately
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
  hideInputBar()

  // --- Kick send path (single or dual) ---
  if (sendToKick) {
    const slug = kickSlug || targetChannel
    const kickPromise = sendKickMessage(slug, text)
    const twitchPromise = sendToTwitch
      ? getTwitchAuthTokenAsync().then(({ token: tok, username: twitchNick }) =>
          sendIrcMessage(twitchName, text, tok, replyParentId, twitchNick))
      : Promise.resolve(null)

    Promise.all([kickPromise, twitchPromise]).then(([kickResult, twitchResult]) => {
      const kickOk = kickResult === true
      const twitchOk = twitchResult === true || twitchResult === null

      if (kickOk || twitchOk) {
        // Partial failure toasts for dual-send
        if (isDualSend && !twitchOk) showToast('sent to kick only — twitch failed')
        if (isDualSend && !kickOk) showToast('sent to twitch only — kick failed')
      } else {
        // Both failed (or single Kick failed)
        input.style.borderColor = '#f44'
        const msg = kickResult === 'kick_not_logged_in' ? t('mc_input_login_kick')
          : kickResult === 'no_kick_tab' ? t('mc_input_open_kick')
          : kickResult === 'no_channel' ? t('mc_input_kick_not_found')
          : t('mc_input_send_failed')
        if (wysiwygEnabled) input.dataset.placeholder = msg
        else input.placeholder = msg
        setTimeout(() => { input.style.borderColor = ''; updateInputPlaceholder() }, 2500)
      }
    })
    return
  }

  // --- YouTube-only send path (no Twitch, no Kick) ---
  if (sendToYoutube && !sendToKick && !sendToTwitch) {
    sendYoutubeMessage(text).then(result => {
      if (result !== true) {
        const errorMsg = result === 'no_youtube_tab' ? 'open youtube live chat first'
          : 'youtube send failed'
        showToast(errorMsg)
      }
    })
    return
  }
  // Twitch + YouTube (and no Kick) — fire YouTube as best-effort alongside Twitch send below
  if (sendToYoutube && sendToTwitch && !sendToKick) {
    sendYoutubeMessage(text).then(result => {
      if (result !== true && result !== 'no_youtube_tab') {
        showToast('youtube send failed')
      }
    })
    // fall through to Twitch path
  }

  // --- Twitch-only send path (existing behavior) ---
  const { token, username: twitchNick } = await getTwitchAuthTokenAsync()
  if (!token) {
    console.warn('[HS] SEND BAIL: no auth token (cookie missing)')
    if (wysiwygEnabled) input.dataset.placeholder = t('mc_input_not_logged_in')
    else input.placeholder = t('mc_input_not_logged_in')
    setTimeout(() => updateInputPlaceholder(), 2000)
    return
  }

  const wsState = authState.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][authState.ws.readyState] : 'null'
  log(`IRC SEND → #${targetChannel} ws=${wsState} ready=${authState.ready} queue=${authState.sendQueue.length}`)
  sendIrcMessage(targetChannel, text, token, replyParentId, twitchNick).then(result => {
    if (result === true) {
      if (wsState !== 'OPEN') {
        input.style.borderColor = '#ff0'
        setTimeout(() => { input.style.borderColor = '' }, 1500)
      }
    } else {
      input.style.borderColor = '#f44'
      const msg = result === 'no_user' ? t('mc_input_no_username')
        : result === 'auth_failed' ? t('mc_input_auth_failed')
        : result === 'connect_failed' ? t('mc_input_connection_failed')
        : t('mc_input_send_failed_retry')
      if (wysiwygEnabled) input.dataset.placeholder = msg
      else input.placeholder = msg
      setTimeout(() => { input.style.borderColor = ''; updateInputPlaceholder() }, 2500)
    }
  })
}

async function sendYoutubeMessage(text) {
  try {
    const resp = await safeSendMessage({ type: 'youtube_send_message', text })
    if (resp?.ok) return true
    return resp?.error || 'send_failed'
  } catch (e) {
    log('YouTube send error:', e.message)
    return 'send_failed'
  }
}

// ============================================
// MEDIA UPLOAD — paste image, drag-drop file
// ============================================

const MC_UPLOAD_MAX_IMG = 5 * 1024 * 1024   // 5MB
const MC_UPLOAD_MAX_VID = 50 * 1024 * 1024  // 50MB
let _mcUploading = false

function showUploadStatus(msg, isError) {
  const bar = document.getElementById('hs-mc-upload-status')
  if (msg) {
    if (bar) {
      bar.textContent = msg
      bar.style.color = isError ? '#ff4444' : '#ff8700'
      bar.style.display = 'block'
      return
    }
    const inputbar = document.getElementById('hs-mc-inputbar')
    if (!inputbar) return
    const el = document.createElement('div')
    el.id = 'hs-mc-upload-status'
    el.style.cssText = 'padding:2px 8px;font-size:11px;color:#ff8700;background:#000;border-top:1px solid #808080;'
    el.textContent = msg
    inputbar.insertBefore(el, inputbar.firstChild)
  } else if (bar) {
    bar.remove()
  }
}

async function uploadMediaFile(file) {
  if (_mcUploading) {
    showUploadStatus('upload in progress...', true)
    return null
  }
  if (!file) return null
  const isImage = file.type.startsWith('image/')
  const isVideo = file.type.startsWith('video/')
  if (!isImage && !isVideo) {
    showUploadStatus('only images/videos allowed', true)
    setTimeout(() => showUploadStatus(null), 2500)
    return null
  }
  const maxSize = isImage ? MC_UPLOAD_MAX_IMG : MC_UPLOAD_MAX_VID
  if (file.size > maxSize) {
    showUploadStatus(`file too large (max ${maxSize / 1048576}MB)`, true)
    setTimeout(() => showUploadStatus(null), 2500)
    return null
  }
  _mcUploading = true
  showUploadStatus('uploading 0%...')
  try {
    const formData = new FormData()
    formData.append('file', file)
    const url = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          showUploadStatus(`uploading ${pct}%...`)
        }
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.success && data.url) resolve(data.url)
            else reject(new Error(data.error || 'upload failed'))
          } catch { reject(new Error('bad response')) }
        } else {
          try {
            const err = JSON.parse(xhr.responseText)
            reject(new Error(err.error || `http ${xhr.status}`))
          } catch { reject(new Error(`http ${xhr.status}`)) }
        }
      })
      xhr.addEventListener('error', () => reject(new Error('network error')))
      xhr.addEventListener('abort', () => reject(new Error('cancelled')))
      xhr.open('POST', `${CONFIG.API_URL}/api/upload`)
      xhr.withCredentials = true
      xhr.send(formData)
    })
    showUploadStatus('upload done')
    setTimeout(() => showUploadStatus(null), 1500)
    return url
  } catch (e) {
    showUploadStatus(`upload failed: ${e.message}`, true)
    setTimeout(() => showUploadStatus(null), 3500)
    return null
  } finally {
    _mcUploading = false
  }
}

async function handleMediaUpload(file) {
  const url = await uploadMediaFile(file)
  if (!url) return
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  showInputBar()
  input.focus()
  if (input.isContentEditable) {
    if (!document.execCommand('insertText', false, url + ' ')) {
      input.textContent = (input.textContent || '') + url + ' '
    }
  } else {
    input.value = (input.value || '') + url + ' '
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

let _mcDropHandlersInstalled = false
function setupMediaDropHandlers() {
  if (_mcDropHandlersInstalled) return
  _mcDropHandlersInstalled = true
  const overlay = document.getElementById('hs-mc-overlay')
  if (!overlay) return

  let dragCounter = 0
  const showDropZone = () => {
    let dz = document.getElementById('hs-mc-drop-zone')
    if (!dz) {
      dz = document.createElement('div')
      dz.id = 'hs-mc-drop-zone'
      dz.style.cssText = 'position:absolute;inset:0;background:rgba(255,135,0,0.15);border:2px dashed #ff8700;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;z-index:99998;pointer-events:none;'
      dz.textContent = 'drop image/video to upload'
      overlay.appendChild(dz)
    }
  }
  const hideDropZone = () => {
    document.getElementById('hs-mc-drop-zone')?.remove()
    dragCounter = 0
  }

  overlay.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragCounter++
    showDropZone()
  }, { signal: mcSignal })
  overlay.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, { signal: mcSignal })
  overlay.addEventListener('dragleave', (e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    dragCounter--
    if (dragCounter <= 0) hideDropZone()
  }, { signal: mcSignal })
  overlay.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return
    e.preventDefault()
    hideDropZone()
    const file = e.dataTransfer.files[0]
    handleMediaUpload(file)
  }, { signal: mcSignal })
}
