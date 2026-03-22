// Input - chat input, autocomplete, send message, reply state

// Autocomplete state (Tab-only cycling, no dropdown)
let acState = {
matches: [],
index: 0,
active: false,  // true when cycling through matches
wordStart: 0,   // Position where the completion word starts
afterText: ''   // Text after the completion
};
function rebuildInput() {
  const bar = document.getElementById('hs-mc-inputbar');
  if (!bar) return;

  // Save current text
  const oldInput = document.getElementById('hs-mc-input');
  const savedText = oldInput ? getInputText() : pendingMessage;

  // Remove old input
  if (oldInput) oldInput.remove();

  // Create new input element
  const emoteBtn = bar.querySelector('#hs-mc-emote-btn');
  if (wysiwygEnabled) {
    const div = document.createElement('div');
    div.id = 'hs-mc-input';
    div.contentEditable = 'true';
    div.setAttribute('data-placeholder', 'send a message...');
    div.spellcheck = false;
    if (emoteBtn) bar.insertBefore(div, emoteBtn);
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'hs-mc-input';
    input.placeholder = 'send a message...';
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
    ? `<div id="hs-mc-input" contenteditable="true" data-placeholder="send a message..." spellcheck="false"></div>`
    : `<input type="text" id="hs-mc-input" placeholder="send a message..." autocomplete="off" spellcheck="false">`;

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
  // Sync highlight overlay scroll with input scroll
  input.addEventListener('scroll', () => {
    const hl = document.getElementById('hs-mc-input-highlight');
    if (hl) hl.scrollLeft = input.scrollLeft;
  });
  input.addEventListener('input', () => {
    const hasText = (input.value || input.textContent || '').trim().length > 0
    if (hasText) showInputBar()
    else hideInputBar()
  });
  input.addEventListener('blur', () => {
    setTimeout(hideAutocomplete, 150)
    // Hide input bar after blur if empty (delay to allow click-to-emote-picker)
    // Skip if window lost focus — prevents hiding when switching apps
    setTimeout(() => { if (document.hasFocus()) hideInputBar() }, 200)
  });
  sendBtn?.addEventListener('click', sendMessage);

  // WYSIWYG: handle paste to strip formatting
  if (wysiwygEnabled) {
    input.addEventListener('paste', (e) => {
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

  // Global Tab key to focus input from anywhere
  if (!window._hsMcTabHandler) {
    window._hsMcTabHandler = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      if (currentTab === 'add') return;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;

      // If not already in our input, reveal bar and focus it
      if (document.activeElement !== input) {
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
      if (currentTab === 'add') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal focus from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      // Only printable chars — skip modifiers, nav, function keys
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (e.key.length !== 1) return
      showInputBar()
      input.focus()
      // Character will flow into the now-focused input naturally
    }, { signal: mcSignal })

    // Catch paste when input bar is hidden — reveal bar and insert text
    document.addEventListener('paste', (e) => {
      if (inputBarVisible) return
      if (currentTab === 'add') return
      const input = document.getElementById('hs-mc-input')
      if (!input) return
      // Don't steal paste from other inputs
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
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

      if (state === 'blocked') {
        // Blocked → unblock + yellow flash
        unblockEmote(emoteName);
      } else if (state === 'owned') {
        // Owned → remove from inventory + white flash
        removeEmoteFromInventory(emoteName, e.target);
      } else {
        // Global or unadded → block + red flash
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
          for (const name of names) pasteEmoteToInput(name);
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
        // Blocked → unblock + yellow flash
        unblockEmote(emoteName);
      } else if (state === 'owned' || state === 'global' || state === 'channel') {
        // Owned, global, or channel → paste to input + white flash
        pasteEmoteToInput(emoteName);
        flashAllEmotes(emoteName, 'hs-flash-paste');
      } else if (state === 'unadded') {
        // Unadded → add to inventory + green flash
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

  // Right-click on message → mute/unmute user
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
      } else {
        mutedUsers.add(username);
        showToast(`muted ${username}`);
      }
      chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] });
      applyMcMutes();
    }, { signal: mcSignal });
  }
}
function applyMcMutes() {
  document.querySelectorAll('.hs-mc-msg').forEach(msg => {
    const userEl = msg.querySelector('.hs-mc-user');
    const username = userEl?.textContent?.trim()?.toLowerCase();
    if (username && mutedUsers.has(username)) {
      msg.classList.add('hs-mc-muted');
    } else {
      msg.classList.remove('hs-mc-muted');
    }
  });
}

function updateInputPlaceholder() {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  let placeholder;
  if (currentTab === 'feed') {
    placeholder = 'post to heatsync...';
  } else if (currentTab === 'live') {
    const channel = getLiveChannel();
    placeholder = channel ? `send to #${channel}` : 'send a message...';
  } else if (currentTab === 'mentions') {
    const channel = getCurrentChannel();
    placeholder = channel ? `send to #${channel}` : 'send a message...';
  } else if (currentTab === 'whispers') {
    const lastUser = lastWhisperKey ? whisperUsers.get(lastWhisperKey) : null
    placeholder = lastUser ? `/r to reply to ${lastUser.displayName}` : '/w user msg · /dm user msg'
  } else if (currentTab === 'add') {
    placeholder = '';
  } else {
    // Channel tab — resolve twitch name for placeholder
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab);
    const twitchName = typeof ch === 'string' ? ch : ch?.twitch;
    placeholder = twitchName ? `send to #${twitchName}` : `send to #${currentTab}`;
  }

  if (wysiwygEnabled) {
    input.dataset.placeholder = placeholder;
  } else {
    input.placeholder = placeholder;
  }
}
function handleInputKeydown(e) {
  const input = e.target;

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

function findEmoteMatches(search) {
  const matches = [];

  // Check if searching for username (starts with @)
  const isUserSearch = search.startsWith('@');
  const searchTerm = isUserSearch ? search.slice(1) : search;
  const searchLower = searchTerm.toLowerCase();

  // Search usernames if @ prefix or if it could be a username
  if (isUserSearch || searchTerm.length >= 2) {
    for (const username of usernameCache) {
      const userLower = username.toLowerCase();
      if (userLower.startsWith(searchLower)) {
        matches.push({ name: '@' + username, url: null, priority: isUserSearch ? 0 : 2, type: 'user' });
      } else if (!isUserSearch && userLower.includes(searchLower)) {
        matches.push({ name: '@' + username, url: null, priority: 3, type: 'user' });
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

  // Sort: prefix matches first, then alphabetical
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
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

// WYSIWYG emote insertion
function insertCompletionWysiwyg(match) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  // Check if we're replacing an existing cycling element (emote img or text span)
  const existingEmote = input.querySelector('img.hs-cycling-emote');
  const existingText = input.querySelector('span.hs-cycling-text');
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
    } else {
      const textNode = document.createTextNode(match.name + ' ')
      existingText.replaceWith(textNode)
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
  }
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
  label.textContent = `↩ Replying to @${state.user}`
  const cancel = document.createElement('button')
  cancel.id = 'hs-mc-reply-cancel'
  cancel.textContent = '✕'
  cancel.title = 'Cancel reply'
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
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
}

async function handleSlashCommand(text, input) {
  const parts = text.match(/^\/(\w+)\s*(.*)$/)
  if (!parts) return false
  const [, cmd, rest] = parts

  if (cmd === 'op') {
    if (!rest.trim()) { showToast('usage: /op message'); return true }
    await postFeedMessage(rest.trim(), { topLevel: true })
    return true
  }

  if (cmd === 'w' || cmd === 'whisper') {
    const match = rest.match(/^(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /w username message'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('twitch', username, msg, input)
    return true
  }

  if (cmd === 'dm') {
    const match = rest.match(/^(\S+)\s+(.+)$/)
    if (!match) { showToast('usage: /dm username message'); return true }
    const [, username, msg] = match
    await sendSlashWhisper('heatsync', username, msg, input)
    return true
  }

  if (cmd === 'r' || cmd === 'reply') {
    if (!rest.trim()) { showToast('usage: /r message'); return true }
    if (!lastWhisperKey) { showToast('no one to reply to'); return true }
    if (currentTab !== 'whispers') switchTab('whispers')
    await sendWhisperMessage(lastWhisperKey, rest.trim())
    clearInput(input)
    return true
  }

  return false
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
          showToast(`twitch user "${username}" not found`)
          return
        }
        whisperUsers.set(key, { platform: 'twitch', userId: body, displayName: username, color: '#fff' })
      } catch (e) {
        showToast('failed to resolve twitch user')
        return
      }
    }
  } else {
    // HeatSync DM — resolve username → user_id via profile API
    const profileResp = await apiFetch(`/api/profile/${encodeURIComponent(lowerUser)}`)
    if (!profileResp.ok || !profileResp.data?.profile?.user_id) {
      showToast(`heatsync user "${username}" not found`)
      return
    }
    const userId = profileResp.data.profile.user_id
    key = `hs:${userId}`
    whisperUsers.set(key, {
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

  const text = convertEmojiShortcodes(getInputText().trim());
  if (!text) { console.warn('[HS] SEND BAIL: empty text'); return; }

  // Slash commands — work from any tab
  if (text.startsWith('/')) {
    const handled = await handleSlashCommand(text, input)
    if (handled) return
  }

  // Whispers tab → plain text acts as /r (reply to last)
  if (currentTab === 'whispers') {
    if (!lastWhisperKey) { showToast('no one to reply to — use /w or /dm first'); return }
    sendWhisperMessage(lastWhisperKey, text)
    clearInput(input)
    return
  }

  // Feed/notifs tab → post to heatsync API
  if (currentTab === 'feed') {
    postFeedMessage(text);
    return;
  }

  // Determine target channel
  let targetChannel;
  if (currentTab === 'live') {
    targetChannel = getLiveChannel();
  } else if (currentTab === 'mentions') {
    targetChannel = getCurrentChannel();
  } else if (currentTab === 'add') {
    if (MC_DEBUG) console.warn('[HS] SEND BAIL: on add tab');
    return;
  } else {
    // Resolve twitch name from channel config (object or legacy string)
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab);
    targetChannel = typeof ch === 'string' ? ch : ch?.twitch || currentTab;
  }

  if (!targetChannel) {
    console.warn('[HS] SEND BAIL: no target channel, currentTab=' + currentTab);
    return;
  }

  // Get auth token
  const token = getTwitchAuthToken();
  if (!token) {
    console.warn('[HS] SEND BAIL: no auth token (cookie missing)');
    if (wysiwygEnabled) {
      input.dataset.placeholder = 'not logged in';
    } else {
      input.placeholder = 'not logged in';
    }
    setTimeout(() => updateInputPlaceholder(), 2000);
    return;
  }

  // Capture reply parent before clearing
  const replyParentId = replyState?.msgId || null
  clearReplyState()

  // Send via IRC (fast async)
  const wsState = authState.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][authState.ws.readyState] : 'null';
  log(`IRC SEND → #${targetChannel} ws=${wsState} ready=${authState.ready} queue=${authState.sendQueue.length}`);
  sendIrcMessage(targetChannel, text, token, replyParentId).then(result => {
    if (result === true) {
      // If ws wasn't OPEN when we sent, message was likely queued — show yellow indicator
      if (wsState !== 'OPEN') {
        input.style.borderColor = '#ff0';
        setTimeout(() => { input.style.borderColor = ''; }, 1500);
      }
      if (wysiwygEnabled) {
        input.textContent = '';
      } else {
        input.value = '';
      }
      pendingMessage = '';
      updateCharCount();
      hideInputBar();
    } else {
      // Show specific error feedback
      input.style.borderColor = '#f44';
      const msg = result === 'no_user' ? 'no username detected'
        : result === 'auth_failed' ? 'auth failed — re-login to twitch'
        : result === 'connect_failed' ? 'connection failed — try again'
        : 'send failed — try again';
      if (wysiwygEnabled) {
        input.dataset.placeholder = msg;
      } else {
        input.placeholder = msg;
      }
      setTimeout(() => {
        input.style.borderColor = '';
        updateInputPlaceholder();
      }, 2500);
    }
  });
}
