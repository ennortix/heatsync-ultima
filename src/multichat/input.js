// Input - chat input, autocomplete, send message, reply state

// Message history — up/down arrow recalls previously sent messages
const mcMessageHistory = []
const MC_HISTORY_MAX = 50
let mcHistoryIndex = -1
let mcHistoryDraft = ''

// Broken-image recovery for input-area emote imgs. Browser negatively caches
// failed image responses (proxy hiccup, CDN blip); without this hook the typed
// word renders forever as a broken-image placeholder in the composer.
// Strategy: retry once with a cache-bust to defeat the negative cache, then
// fall back to the alt text so the message still ships as plain text.
function attachInputEmoteErrorRecovery(img) {
  img.addEventListener('error', () => {
    if (img.dataset.hsRetried) {
      const t = document.createTextNode(img.alt || '')
      img.replaceWith(t)
      return
    }
    img.dataset.hsRetried = '1'
    img.src = img.src + (img.src.includes('?') ? '&' : '?') + 'r=' + Date.now()
  })
}

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

// Cache own badge string from IRC messages for optimistic display.
// Per-channel: sub badge tier differs by streamer, so a single global ref
// stamped the wrong channel's sub badge onto synthetic celebrations.
let _ownBadges = ''
const _ownBadgesByChannel = new Map()  // channelLower -> badges string
function ownBadgesFor(channel) {
  if (!channel) return _ownBadges
  return _ownBadgesByChannel.get(String(channel).toLowerCase()) || _ownBadges
}

// Echo dedup — suppress own message echoes from IRC/KickChat relay
// Uses a Set of {text, time} to handle rapid sends without overwriting
let _recentSentMessages = []
const SENT_DEDUP_WINDOW = 10000 // 10s
const RECENT_SENT_KEY = 'hs_recent_sent'

function _pruneRecent(arr) {
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  return arr.filter(e => e && e.time >= cutoff)
}

function trackSentMessage(text, hostOverride) {
  _recentSentMessages.push({ text, time: Date.now(), host: hostOverride || hostPlatform })
  _recentSentMessages = _pruneRecent(_recentSentMessages)
  // Cross-tab sync: kick.com tab and twitch.tv tab live in different
  // content-script contexts, so they each have their own array. Storage
  // mirrors the entry to every tab via onChanged so peekSentHost on the
  // OTHER host tagged the IRC echo with the correct origin host. ~50ms
  // sync latency easily wins the race against the ~100-300ms platform
  // chat round-trip.
  try { chrome.storage.local.set({ [RECENT_SENT_KEY]: _recentSentMessages }) } catch (_) {}
}

// Hydrate from storage on load + listen for cross-tab updates.
// Listener is tracked via cleanup so SPA reinit doesn't stack copies.
try {
  chrome.storage.local.get(RECENT_SENT_KEY).then((data) => {
    const incoming = data?.[RECENT_SENT_KEY]
    if (Array.isArray(incoming)) _recentSentMessages = _pruneRecent(incoming)
  }).catch(() => {})
  if (!window._hsMcInputStorageListener) {
    const _inputStorageHandler = (changes, area) => {
      if (area !== 'local' || !changes[RECENT_SENT_KEY]) return
      const incoming = changes[RECENT_SENT_KEY].newValue
      if (!Array.isArray(incoming)) return
      // Merge our local writes with the incoming snapshot — last-write-wins
      // by (text, second-bucketed time). Survives the rare two-tab-send race.
      const merged = new Map()
      for (const e of [..._recentSentMessages, ...incoming]) {
        if (!e || !e.text) continue
        const k = `${e.text}:${Math.floor((e.time || 0) / 1000)}`
        const existing = merged.get(k)
        if (!existing || (existing.time || 0) < (e.time || 0)) merged.set(k, e)
      }
      _recentSentMessages = _pruneRecent([...merged.values()].sort((a, b) => a.time - b.time))
    }
    cleanup.addListener(chrome.storage.onChanged, _inputStorageHandler)
    window._hsMcInputStorageListener = true
  }
} catch (_) {}

function isSentEcho(msgText, _msgPlatform) {
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  for (let i = _recentSentMessages.length - 1; i >= 0; i--) {
    const entry = _recentSentMessages[i]
    if (entry.time < cutoff) break
    if (entry.text === msgText) {
      // First echo displays; second (dual-send duplicate) is suppressed.
      // Host-platform badge attribution happens separately via peekSentHost,
      // so we don't suppress on host mismatch — that would drop the only
      // echo when sending from one platform to a single-platform channel
      // on a different host (e.g. kick.com → twitch-only mellen).
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

// Peek a recent-sent entry by text WITHOUT consuming it. Used by the IRC/kick
// handlers to attribute the badge platform on the displayed echo. Returns the
// host platform string ('twitch' | 'kick' | 'yt') or null if no tracked send
// matches — letting echoes from elsewhere (e.g. heatsync.org website sends)
// keep whatever platform tag the server attached.
function peekSentHost(msgText) {
  const cutoff = Date.now() - SENT_DEDUP_WINDOW
  for (let i = _recentSentMessages.length - 1; i >= 0; i--) {
    const entry = _recentSentMessages[i]
    if (entry.time < cutoff) break
    if (entry.text === msgText) return entry.host || null
  }
  return null
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

// Slash command autocomplete dropdown — shows command list when input begins
// with /<word>. Heatsync-owned + common pass-through Twitch/Kick mod commands.
const SLASH_COMMANDS = [
  { cmd: 'op',         args: '<text>',        desc: 'post to home feed' },
  { cmd: 'w',          args: '<user> <msg>',  desc: 'twitch whisper' },
  { cmd: 'dm',         args: '<user> <msg>',  desc: 'heatsync DM' },
  { cmd: 'r',          args: '<msg>',         desc: 'reply to last whisper' },
  { cmd: 'mute',       args: '<user>',        desc: 'local mute 24h' },
  { cmd: 'unmute',     args: '<user>',        desc: 'local unmute' },
  { cmd: 'shrug',      args: '[text]',        desc: 'append ¯\\_(ツ)_/¯' },
  { cmd: 'tableflip',  args: '[text]',        desc: 'append (╯°□°)╯︵ ┻━┻' },
  { cmd: 'unflip',     args: '[text]',        desc: 'append ┬─┬ノ( ゜-゜ノ)' },
  { cmd: 'lclear',     args: '',              desc: 'clear current tab locally' },
  { cmd: 'help',       args: '',              desc: 'list commands' },
  { cmd: 'me',         args: '<action>',      desc: 'twitch/kick action message' },
  { cmd: 'ban',        args: '<user>',        desc: 'twitch/kick ban (mod)' },
  { cmd: 'timeout',    args: '<user> [secs]', desc: 'twitch/kick timeout (mod)' },
  { cmd: 'unban',      args: '<user>',        desc: 'twitch/kick unban (mod)' },
  { cmd: 'untimeout',  args: '<user>',        desc: 'twitch/kick untimeout (mod)' },
  { cmd: 'color',      args: '<hex|name>',    desc: 'twitch chat color' },
  { cmd: 'mod',        args: '<user>',        desc: 'promote mod (broadcaster)' },
  { cmd: 'vip',        args: '<user>',        desc: 'add vip (broadcaster)' },
  { cmd: 'raid',       args: '<channel>',     desc: 'twitch raid (broadcaster)' },
  { cmd: 'slow',       args: '[secs]',        desc: 'slow mode (mod)' },
  { cmd: 'clear',      args: '',              desc: 'clear chat (mod)' },
  { cmd: 'followers',  args: '[mins]',        desc: 'followers-only (mod)' },
  { cmd: 'emoteonly',  args: '',              desc: 'emote-only mode (mod)' },
]
let slashAcState = { active: false, matches: [], index: 0 }
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
    // Convert emote images, stacks, and cycling spans back to text.
    // Modifiers stored in dataset.hsWords (canonical, set by hsModApplyToImg)
    // appended after the emote so recipients see "Kappa w! h!" not "Kappa".
    let text = '';
    // Adjacency-safe serialization: chips (emote img / stack / emoji span /
    // mention) must stay whitespace-bounded on the wire — `parseEmotes` and
    // peer renderers tokenize on /\s+/, so two adjacent chips that serialize
    // as `KEKWPogChamp` resolve to nothing.
    let _lastWasChip = false
    const sepBefore = () => {
      if (text && !/\s$/.test(text)) text += ' '
    }
    const appendImg = (img) => {
      text += img.dataset.emoteName || img.alt || ''
      const modWords = img.dataset.hsWords || img.dataset.hsModWords  // back-compat
      if (modWords) {
        for (const w of modWords.split(/\s+/).filter(Boolean)) text += ' ' + w
      }
    }
    const extractNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent || ''
        if (_lastWasChip && t && !/^\s/.test(t) && text && !/\s$/.test(text)) text += ' '
        text += t
        if (t.length > 0) _lastWasChip = false
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'IMG') {
        sepBefore()
        appendImg(node)
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-input-stack')) {
        sepBefore()
        for (const child of node.children) {
          if (child.tagName === 'IMG') {
            if (text && !text.endsWith(' ')) text += ' '
            appendImg(child)
          }
        }
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-mc-user')) {
        sepBefore()
        // Bare-username Tab completion → serialize as @user so recipients
        // render it as a colored mention chip (processEmotes only colors @-prefixed).
        const u = node.dataset.username || node.textContent || ''
        text += (node.dataset.completionType === 'user-bare') ? ('@' + u) : u
        _lastWasChip = true
      } else if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('hs-mc-emoji')) {
        sepBefore()
        text += node.textContent || ''
        _lastWasChip = true
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
  // Unified undo/redo — same module as the website. installUndoManager
  // attaches a manager to input._undoManager and wires Ctrl+Z hotkeys
  // (capture phase) + auto-capture on input events. Per-keystroke for
  // typing, one step per structural op (Tab autocomplete, smart unwrap, etc.).
  try { installUndoManager(input, { max: 100 }) } catch (_) {}
  // Tab clears emote :hover highlight in chat — mouse stuck over an emote
  // would otherwise hold the green rect lit while the user cycles autocomplete.
  // Body class restored on mousemove. Single global install via window flag.
  if (!window._hsMcTabHoverInstalled) {
    window._hsMcTabHoverInstalled = true
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return
      const ae = document.activeElement
      if (ae?.id !== 'hs-mc-input') return
      document.body.classList.add('hs-tab-cycling')
    }, { signal: mcSignal })
    document.addEventListener('mousemove', () => {
      if (document.body.classList.contains('hs-tab-cycling')) {
        document.body.classList.remove('hs-tab-cycling')
      }
    }, { passive: true, signal: mcSignal })
  }
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
    setTimeout(hideSlashDropdown, 150)
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

  // Global `\` toggle → hide/show chat. Mirrors heatsync.org keyboard shortcut.
  // Skip when input is focused so users can type `\` into chat normally.
  if (!window._hsMcChatToggleHandler) {
    window._hsMcChatToggleHandler = true
    document.addEventListener('keydown', (e) => {
      if (e.key !== '\\') return
      if (e.ctrlKey || e.altKey || e.metaKey) return
      const active = document.activeElement
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      try { toggleChatHidden() } catch (err) { log('chat-toggle keydown:', err) }
    }, { capture: true, signal: mcSignal })
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
    // Picker emote wrap — when blocked, the inner img is visibility:hidden so
    // right-clicks land on the wrap span, not the img. Without this branch
    // findEmoteTarget returned null and unblock-on-right-click silently failed.
    const pickerWrap = target.closest('.hs-mc-picker-emote-wrap');
    if (pickerWrap) {
      const img = pickerWrap.querySelector('img');
      return {
        wrapper: null,
        emoteName: pickerWrap.dataset.name || img?.alt || 'emote',
        state: img?.dataset.state || (pickerWrap.classList.contains('blocked') ? 'blocked' : 'global'),
        emoteUrl: img?.src || '',
        source: img?.dataset.source || 'unknown'
      };
    }
    // Fallback: direct IMG (Twitch/7TV/BTTV native emotes, picker emotes,
    // and multichat WYSIWYG input chips — class match catches blocked input
    // emotes whose src has been swapped to a transparent placeholder).
    if (target.tagName === 'IMG' && !target.classList.contains('hs-mc-badge-img') && (
      target.classList.contains('hs-mc-emote') ||
      target.classList.contains('hs-mc-picker-emote') ||
      target.classList.contains('hs-input-emote') ||
      target.classList.contains('chat-line__message--emote') ||
      target.classList.contains('chat-image') ||
      target.src?.includes('7tv.app') ||
      target.src?.includes('betterttv.net') ||
      (target.src?.includes('frankerfacez') && !target.src?.includes('room-badge/')) ||
      target.src?.includes('static-cdn.jtvnw.net/emoticons')
    )) {
      const isBlocked = target.classList.contains('hs-state-blocked') || target.dataset.state === 'blocked';
      return {
        wrapper: null,
        emoteName: target.alt || target.dataset.emoteName || target.title?.split(' ')[0] || 'emote',
        state: isBlocked ? 'blocked' : (target.dataset.state || 'global'),
        emoteUrl: target.dataset.hsOrigSrc || target.src || '',
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
        // Sub emotes have no slot — they can't be removed from inventory, only blocked.
        // The `subscription` flag isn't always set on twitch sub entries in
        // viewerPersonalEmotes (depends on backend payload), so fall back to
        // checking slot: anything without a slot can't be DELETEd via the
        // /api/user/emotes/:slot endpoint, treat as block-only.
        const cached = lookupEmote(emoteName);
        if (cached?.subscription || cached?.slot == null) {
          blockEmote(emoteName);
        } else {
          removeEmoteFromInventory(emoteName, e.target);
        }
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
      // Collapsed stack left-click → add unowned emotes to inventory, then
      // paste every postable emote to input in DOM order.
      // (skip locked/blocked emotes — viewer can't post them)
      const collapsedStack = e.target.closest('.hs-mc-emote-stack:not(.expanded)');
      if (collapsedStack) {
        e.preventDefault();
        e.stopPropagation();
        const wrappers = [...collapsedStack.querySelectorAll('.hs-mc-emote-wrapper[data-emote-name]')];
        const postable = wrappers.filter(w => {
          const s = w.dataset.state;
          return s !== 'locked' && s !== 'blocked';
        });
        if (wrappers.length > 0 && postable.length === 0) {
          showToast(`🔒 stack has nothing postable`, 'error');
          return;
        }
        if (postable.length > 0) {
          // Fire add-to-inventory for each unowned (don't block paste on the
          // server roundtrip; state flips green when each resolves).
          for (const w of postable) {
            if (w.dataset.state === 'unadded') {
              const name = w.dataset.emoteName;
              if (!name || pendingEmoteOps.has(name)) continue;
              const url = w.dataset.emoteUrl || w.querySelector('img')?.src || '';
              const source = w.dataset.source || 'heatsync';
              addEmoteToInventory(name, url, source, w);
            }
          }
          showInputBar();
          for (const w of postable) {
            const name = w.dataset.emoteName;
            if (name) pasteEmoteToInput(name);
          }
          const input = document.getElementById('hs-mc-input');
          if (input) input.focus();
          flashAllEmotes(postable[0].dataset.emoteName, 'hs-flash-paste');
        }
        return;
      }

      const emoteInfo = findEmoteTarget(e.target);
      if (!emoteInfo) return;

      // Multichat input WYSIWYG chip — only intercept clicks for the blocked
      // state (left-click unblocks). For any other state we let the
      // contenteditable handle the click so the caret lands at the click
      // position; intercepting would silently re-paste the same emote on
      // every cursor placement, which is hostile.
      if (e.target.closest('#hs-mc-input') && emoteInfo.state !== 'blocked') return;

      e.preventDefault();
      e.stopPropagation();

      const { emoteName, state, emoteUrl, source } = emoteInfo;

      if (state === 'blocked') {
        unblockEmote(emoteName);
        return;
      }
      if (state === 'locked') {
        // Foreign Twitch sub emote — viewer not subbed to this channel, can't
        // post it. Toast instead of paste (matches website post-b6f23bc8:
        // visually identical to other emotes, only click is gated).
        showToast(`🔒 ${emoteName} — you're not subbed to this channel`, 'error');
        return;
      }
      if (state === 'owned' || state === 'global' || state === 'channel') {
        // Paste to input (no lock needed — instant, no async)
        showInputBar();
        pasteEmoteToInput(emoteName);
        const input = document.getElementById('hs-mc-input');
        if (input) input.focus();
        flashAllEmotes(emoteName, 'hs-flash-paste');
        return;
      }
      if (state === 'unadded') {
        if (pendingEmoteOps.has(emoteName)) return;
        // Picker unadded → first click adds (orange→owned), second click pastes
        // via the owned/global/channel branch above. Splitting prevents a
        // mis-click from silently burning a slot in the user's 5000-cap set.
        const inPicker = !!e.target.closest('#hs-mc-emote-picker');
        if (inPicker) {
          if (!viewerPersonalEmotes.has(emoteName)) {
            viewerPersonalEmotes.set(emoteName, {
              url: emoteUrl,
              source: source || 'heatsync',
              state: 'owned',
            });
          }
          const pickerWrap = e.target.closest('.hs-mc-picker-emote-wrap');
          if (pickerWrap) {
            pickerWrap.classList.remove('unadded');
            const pImg = pickerWrap.querySelector('img');
            if (pImg) pImg.dataset.state = 'owned';
          }
          addEmoteToInventory(emoteName, emoteUrl, source, e.target);
          flashAllEmotes(emoteName, 'hs-flash-add');
          return;
        }
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

  // Right-click on message → context menu (mute, whisper, copy, profile, cancel).
  // Replaces the previous insta-mute behavior so accidental right-clicks don't
  // silently 24h-mute someone.
  if (!window._hsMcMsgContextHandler) {
    window._hsMcMsgContextHandler = true;
    document.addEventListener('contextmenu', (e) => {
      const msg = e.target.closest('.hs-mc-msg');
      if (!msg) return;
      if (findEmoteTarget(e.target)) return;
      const userEl = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)');
      const username = userEl?.textContent?.trim()?.replace(/^@/, '').toLowerCase();
      if (!username) return;
      e.preventDefault();
      showMcMsgContextMenu(e.clientX, e.clientY, msg, username);
    }, { signal: mcSignal });
  }
}

function _toggleMcMute(username) {
  let wasUnmute = false
  if (mutedUsers.has(username)) {
    mutedUsers.delete(username)
    wasUnmute = true
    showToast(`unmuted ${username}`, 'success')
    safeSendMessage({ type: 'unmute_user', username })
  } else {
    mutedUsers.add(username)
    showToast(`muted ${username} (24h)`, 'success')
    safeSendMessage({ type: 'mute_user', username, expiresAt: Date.now() + 86400000 })
  }
  chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
  if (wasUnmute) restoreMcUnmutedDom(username)
  renderMessages(currentTab)
}

function _extractMcMsgText(msg) {
  // Walk siblings after the username link, gathering text nodes + emote alts.
  // textContent on the whole row leaks badge/timestamp/username junk; this
  // gives the readable body a user would expect "copy message" to produce.
  const userEl = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
  if (!userEl) return (msg.textContent || '').trim()
  const parts = []
  let node = userEl.nextSibling
  while (node) {
    if (node.nodeType === 3) {
      parts.push(node.textContent)
    } else if (node.nodeType === 1) {
      const cls = node.classList
      if (cls?.contains('hs-mc-platform-badge') || cls?.contains('hs-mc-badge') || cls?.contains('hs-mc-time') || cls?.contains('hs-mc-reply-ctx')) {
        // skip
      } else if (node.tagName === 'IMG' && node.alt) {
        parts.push(node.alt)
      } else {
        const innerImg = node.querySelector?.('img[alt]')
        if (innerImg) parts.push(innerImg.alt)
        else parts.push(node.textContent || '')
      }
    }
    node = node.nextSibling
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function _openWhisperFor(username) {
  if (typeof switchTab === 'function') switchTab('whispers')
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  const prefill = `/w ${username} `
  if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
    input.value = prefill
    input.focus()
    try { input.setSelectionRange(prefill.length, prefill.length) } catch {}
  } else {
    input.textContent = prefill
    input.focus()
  }
}

function showMcMsgContextMenu(x, y, msg, username) {
  document.getElementById('hs-mc-msg-ctx')?.remove()
  const menu = document.createElement('div')
  menu.id = 'hs-mc-msg-ctx'
  menu.style.cssText = 'position:fixed;z-index:2147483646;background:#000;border:1px solid #808080;padding:4px 0;min-width:160px;font:13px/1.2 inherit;color:#fff;user-select:none;'
  const isMuted = mutedUsers.has(username)
  const items = [
    { label: isMuted ? `unmute ${username}` : `mute ${username} (24h)`, run: () => _toggleMcMute(username) },
    { label: `whisper ${username}`, run: () => _openWhisperFor(username) },
    { label: 'copy username', run: () => { try { navigator.clipboard.writeText(username) } catch {} } },
    { label: 'copy message', run: () => { try { navigator.clipboard.writeText(_extractMcMsgText(msg)) } catch {} } },
    { label: 'profile', run: () => window.open(`https://heatsync.org/user/${encodeURIComponent(username)}`, '_blank', 'noopener') },
    { label: 'cancel', run: () => {} },
  ]
  for (const it of items) {
    const row = document.createElement('div')
    row.textContent = it.label
    row.style.cssText = 'padding:6px 12px;cursor:pointer;color:#fff;background:#000;'
    row.addEventListener('mouseenter', () => { row.style.background = '#fff'; row.style.color = '#000' })
    row.addEventListener('mouseleave', () => { row.style.background = '#000'; row.style.color = '#fff' })
    row.addEventListener('click', () => { dismiss(); it.run() })
    menu.appendChild(row)
  }
  document.body.appendChild(menu)
  const mw = menu.offsetWidth, mh = menu.offsetHeight
  menu.style.left = Math.min(x, window.innerWidth - mw - 4) + 'px'
  menu.style.top = Math.min(y, window.innerHeight - mh - 4) + 'px'
  function dismiss() {
    menu.remove()
    document.removeEventListener('mousedown', outside, true)
    document.removeEventListener('keydown', esc, true)
    document.removeEventListener('contextmenu', outside, true)
  }
  function outside(ev) { if (!menu.contains(ev.target)) dismiss() }
  function esc(ev) { if (ev.key === 'Escape') { ev.preventDefault(); dismiss() } }
  setTimeout(() => {
    document.addEventListener('mousedown', outside, true)
    document.addEventListener('keydown', esc, true)
    document.addEventListener('contextmenu', outside, true)
  }, 0)
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
function restoreMcUnmutedDom(username) {
  // stripMcMutedMessage destroys content irreversibly. Remove those rows so the
  // next renderMessages() call rebuilds them from the buffer's _renderedHtml cache.
  const target = username?.toLowerCase()
  document.querySelectorAll('.hs-mc-msg.hs-mc-muted').forEach(msg => {
    const userEl = msg.querySelector('.hs-mc-user:not(.hs-mc-reply-user)')
    const u = userEl?.textContent?.trim()?.toLowerCase()
    if (!target || u === target) msg.remove()
  })
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
    const ch = config.channels.find(c => c.id === currentTab);
    const chanName = ch?.twitch || ch?.kick || ch?.youtube?.replace(/^https?:\/\/(www\.)?youtube\.com\/@?/, '').replace(/\/.*/, '') || ch?.id;
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

  // Slash dropdown navigation — intercept before emoji/tab/enter
  if (slashAcState.active) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      slashAcState.index = (slashAcState.index + 1) % slashAcState.matches.length
      showSlashDropdown(slashAcState.matches, slashAcState.index)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      slashAcState.index = (slashAcState.index - 1 + slashAcState.matches.length) % slashAcState.matches.length
      showSlashDropdown(slashAcState.matches, slashAcState.index)
      return
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault()
      const sel = slashAcState.matches[slashAcState.index]
      if (sel) insertSlashCommand(sel)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideSlashDropdown()
      return
    }
  }

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
        // For WYSIWYG, mark the inserted emoji span as cycling element.
        // insertEmojiFromDropdown wraps the emoji in span.hs-mc-emoji — find
        // the most-recently inserted one and tag it for cycling.
        if (wysiwygEnabled) {
          const inputEl = document.getElementById('hs-mc-input')
          const spans = inputEl?.querySelectorAll('span.hs-mc-emoji[data-emoji-name="' + emojiMatch.name + '"]')
          const span = spans?.[spans.length - 1]
          if (span) {
            span.classList.add('hs-cycling-text')
            span.dataset.completionName = emojiMatch.name
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

  // Backspace at the boundary of an input emote / stack — delete the whole
  // unit instead of letting contenteditable nibble at child overlays one at
  // a time. "input emote unit" = .hs-input-emote IMG or .hs-input-stack span.
  if (e.key === 'Backspace' && wysiwygEnabled && input?.isContentEditable) {
    const sel = window.getSelection()
    if (sel?.rangeCount && sel.isCollapsed) {
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      const offset = range.startOffset
      const isInputEmoteUnit = (el) =>
        el?.nodeType === Node.ELEMENT_NODE && (
          (el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) ||
          el.classList?.contains('hs-input-stack')
        )
      let target = null
      if (node.nodeType === Node.TEXT_NODE) {
        // At start of text node → previous sibling
        if (offset === 0 && isInputEmoteUnit(node.previousSibling)) {
          target = node.previousSibling
        }
        // After a single leading space following an emote → consume the space
        // first, then on the next backspace the unit deletes (no double-jump).
        else if (offset === 1 &&
                 (node.textContent[0] === ' ' || node.textContent[0] === ' ') &&
                 isInputEmoteUnit(node.previousSibling)) {
          // Consume the auto-space on this Backspace; the next press will
          // land at offset 0 and pop the chip. Two presses total — matches
          // typed-space semantics so a Tab-inserted unit deletes as if the
          // user had typed "Kappa" + space themselves.
          e.preventDefault()
          node.textContent = node.textContent.slice(1)
          const r = document.createRange()
          r.setStart(node, 0); r.collapse(true)
          sel.removeAllRanges(); sel.addRange(r)
          pendingMessage = getInputText()
          return
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
        // Cursor between element children: previous child
        const prev = node.childNodes[offset - 1]
        if (isInputEmoteUnit(prev)) target = prev
      }
      if (target) {
        // Just delete the one chip — never auto-merge adjacent chips back
        // to text. The "merge intent" path was destroying valid WYSIWYG
        // state on every backspace.
        e.preventDefault()
        target.remove()
        pendingMessage = getInputText()
        updateCharCount()
        return
      }
    }
  }

  // Tab - cycle through emote completions OR apply FFZ modifier to prev emote
  if (e.key === 'Tab') {
    e.preventDefault();

    // FFZ-style modifier on Tab — scans ENTIRE input (not just cursor) for any
    // modifier shorthand adjacent to an emote, applies them all in one shot.
    // Type `Kappa w` then Tab from any cursor position → wide Kappa.
    if (!acState.active) {
      if (scanAndApplyModifiersInInput(input)) return
    }

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

// Inline chips = atomic input pieces (emote IMG, stack, mention, emoji span).
function isInlineChip(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false
  return (el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) ||
         el.classList?.contains('hs-input-stack') ||
         el.classList?.contains('hs-mc-user') ||
         el.classList?.contains('hs-mc-emoji')
}

// Source-text representation of a chip (so unwrapping preserves what the
// user originally typed and lets them re-trigger conversion after fixing
// the missing space).
function chipToText(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return null
  if (el.tagName === 'IMG' && el.classList?.contains('hs-input-emote')) {
    let txt = el.dataset.emoteName || el.alt || ''
    const mods = el.dataset.hsWords || el.dataset.hsModWords
    if (mods) {
      for (const w of mods.split(/\s+/).filter(Boolean)) txt += ' ' + w
      // Trailing space keeps modifier tokens parseable when merged into adjacent
      // text — "Kappa w!" + "4He" must become "Kappa w! 4He", not "Kappa w!4He".
      txt += ' '
    }
    return txt
  }
  if (el.classList?.contains('hs-input-stack')) {
    const parts = []
    for (const child of el.children) {
      if (child.tagName !== 'IMG') continue
      let txt = child.dataset.emoteName || child.alt || ''
      const mods = child.dataset.hsWords || child.dataset.hsModWords
      if (mods) {
        for (const w of mods.split(/\s+/).filter(Boolean)) txt += ' ' + w
        txt += ' '
      }
      parts.push(txt)
    }
    return parts.join(' ')
  }
  if (el.classList?.contains('hs-mc-user')) {
    const u = el.dataset.username || el.textContent || ''
    return (el.dataset.completionType === 'user-bare') ? ('@' + u) : u
  }
  if (el.classList?.contains('hs-mc-emoji')) {
    const name = el.dataset.emojiName || el.getAttribute('data-emoji-name')
    return name ? ':' + name + ':' : (el.textContent || '')
  }
  return null
}

// If the word being auto-converted starts at offset 0 of its text node and
// the previous sibling is a chip with no whitespace separator, unwrap that
// chip back to plain text and signal the caller to skip the conversion.
// Both the chip and the word stay as plain text so the user can see the
// missing space and add it.
function deflectAdjacentChip(node, wordStart) {
  if (wordStart !== 0) return false
  const prev = node.previousSibling
  if (!isInlineChip(prev)) return false
  const chipText = chipToText(prev)
  if (chipText == null) return false
  prev.parentNode.replaceChild(document.createTextNode(chipText), prev)
  pendingMessage = getInputText()
  return true
}

// Scan for any two adjacent chips with no real content between them and
// unwrap both back to plain text in place. `acceptWhitespace` widens the
// definition of "no content" to include whitespace-only nodes — used on
// deletion events so a single backspace can collapse a 2-char nbsp+space
// gap (which Tab insertion + user-typed space leaves between chips).
function buildInputEmoteImg(emote, isOverlay) {
  const img = document.createElement('img')
  img.src = emote.url
  img.alt = emote.name
  img.dataset.emoteName = emote.name
  img.className = 'hs-input-emote' + (isOverlay ? ' input-emote-overlay' : '')
  img.draggable = false
  if (typeof attachInputEmoteErrorRecovery === 'function') attachInputEmoteErrorRecovery(img)
  return img
}

function imagifyValidWordsInTextNode(textNode) {
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false
  if (typeof lookupEmoteWithOverlay !== 'function') return false
  const text = textNode.textContent
  if (!text.trim()) return false
  const parts = text.split(/(\s+)/)
  const replacements = []
  let didChange = false
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue
    if (/^\s+$/.test(part)) {
      replacements.push(document.createTextNode(part))
      continue
    }
    const hasLeftWs = i === 0 || (parts[i - 1] && /^\s+$/.test(parts[i - 1]))
    const hasRightWs = i === parts.length - 1 || (parts[i + 1] && /^\s+$/.test(parts[i + 1]))
    if (!hasLeftWs || !hasRightWs) {
      replacements.push(document.createTextNode(part))
      continue
    }
    let resolved = null
    try { resolved = lookupEmoteWithOverlay(part) } catch (_) {}
    if (!resolved?.emote) {
      replacements.push(document.createTextNode(part))
      continue
    }
    replacements.push(buildInputEmoteImg(resolved.emote, !!resolved.isOverlay))
    didChange = true
  }
  if (!didChange) return false
  const frag = document.createDocumentFragment()
  for (const n of replacements) frag.appendChild(n)
  textNode.parentNode.replaceChild(frag, textNode)
  return true
}

function unwrapStuckChips(inputEl, acceptWhitespace) {
  if (!inputEl) return false
  let changed = false
  let cursorTarget = null
  let cursorOffset = 0
  // Bounded loop so a malformed DOM can't spin forever.
  for (let pass = 0; pass < 50; pass++) {
    const allChips = inputEl.querySelectorAll('img.hs-input-emote, .hs-input-stack, .hs-mc-user, .hs-mc-emoji')
    // Skip imgs nested inside a stack — overlay children are LEGITIMATELY
    // touching (that's the whole point of stacking). Without this filter,
    // every stacked emote collapses to "KappaWave" text on the next input.
    const chips = [...allChips].filter(c =>
      !(c.tagName === 'IMG' && c.parentElement?.classList?.contains('hs-input-stack'))
    )
    let pair = null
    for (let i = 0; i < chips.length - 1; i++) {
      const a = chips[i]
      const b = chips[i + 1]
      if (a.parentNode !== b.parentNode) continue
      let n = a.nextSibling
      let blocked = false
      const between = []
      while (n && n !== b) {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.length > 0) {
          if (acceptWhitespace && /^\s+$/.test(n.textContent)) {
            between.push(n); n = n.nextSibling; continue
          }
          blocked = true; break
        }
        between.push(n)
        n = n.nextSibling
      }
      if (!blocked) { pair = { a, b, between }; break }
    }
    if (!pair) break
    const aText = chipToText(pair.a)
    const bText = chipToText(pair.b)
    if (aText == null || bText == null) break
    const merged = aText + bText
    const parent = pair.a.parentNode
    const textNode = document.createTextNode(merged)
    for (const m of pair.between) m.remove()
    pair.b.remove()
    parent.replaceChild(textNode, pair.a)
    cursorTarget = textNode
    cursorOffset = aText.length
    changed = true
  }
  // After merging, re-imagify whitespace-separated valid emote names in the
  // resulting text so only the touching boundary stays as text. Matches
  // what the chat-side parseEmotes will render from the wire.
  if (changed) {
    for (const child of [...inputEl.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) imagifyValidWordsInTextNode(child)
    }
  }
  if (changed && cursorTarget && cursorTarget.parentNode) {
    const sel = window.getSelection()
    if (sel) {
      const r = document.createRange()
      r.setStart(cursorTarget, Math.min(cursorOffset, cursorTarget.textContent.length))
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
    pendingMessage = getInputText()
  }
  return changed
}

function handleInputChange(e) {
  // Defensive: pull any stray text nodes out of .hs-input-stack spans.
  // Stacks are inline-grid with overlay imgs at grid-area 1/1; a text node
  // inside auto-places in a new row and renders BELOW the emote. If the
  // cursor was inside the stack when the user typed (e.g. clicked an emote
  // in the stack, or a path that left selection inside), text gets trapped.
  // Also retro-fits contenteditable=false on legacy stacks built before
  // this fix so the cursor can't re-enter.
  const inputEl = document.getElementById('hs-mc-input')
  if (inputEl) {
    for (const stack of inputEl.querySelectorAll('.hs-input-stack')) {
      if (stack.getAttribute('contenteditable') !== 'false') {
        stack.setAttribute('contenteditable', 'false')
      }
      let n = stack.firstChild
      while (n) {
        const next = n.nextSibling
        if (n.nodeType === Node.TEXT_NODE ||
            (n.nodeType === Node.ELEMENT_NODE && n.tagName !== 'IMG')) {
          stack.parentNode.insertBefore(n, stack.nextSibling)
        }
        n = next
      }
    }
  }

  // Two chips with LITERALLY no content between them are unrecoverable
  // (wire payload reads as `KEKWPogChamp`) — unwrap as a paste/bug safety
  // net only. Never collapse on whitespace-between: that was eating WYSIWYG
  // state on every backspace ("turns to text").
  if (inputEl) unwrapStuckChips(inputEl, false)

  // Save pending message (persists across tab switches)
  pendingMessage = getInputText();

  // Slash command autocomplete — synchronous, only matches "/word" at start
  checkSlashAutocomplete()

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
          if (deflectAdjacentChip(node, start)) return
          // Replace the :shortcode: text with emoji span
          const span = document.createElement('span')
          span.className = 'hs-mc-emoji'
          span.textContent = emoji
          span.title = ':' + match[1] + ':'
          span.setAttribute('data-emoji-name', match[1])
          const tail = text.slice(cursorOffset)
          const head = text.slice(0, start)
          // Trailing space prevents fused tokens on the wire.
          const trailing = !/^\s/.test(tail) ? ' ' : ''
          // Leading space when the new emoji lands right after an existing
          // chip — without it the chip-merge safeguard collapses both back
          // to plain text.
          let leading = ''
          if (!head) {
            const prev = node.previousSibling
            const prevIsChip = prev?.nodeType === Node.ELEMENT_NODE && (
              (prev.tagName === 'IMG' && (prev.classList?.contains('hs-input-emote') || prev.dataset?.emoteName)) ||
              prev.classList?.contains('hs-input-stack') ||
              prev.classList?.contains('hs-mc-emoji') ||
              prev.classList?.contains('hs-mc-user')
            )
            if (prevIsChip) leading = ' '
          }
          const beforeNode = document.createTextNode(leading + head)
          const afterNode = document.createTextNode(trailing + tail)
          const parent = node.parentNode
          parent.insertBefore(beforeNode, node)
          parent.insertBefore(span, node)
          parent.insertBefore(afterNode, node)
          parent.removeChild(node)
          // Place cursor after emoji + space
          const newRange = document.createRange()
          newRange.setStart(afterNode, Math.min(trailing.length, afterNode.textContent.length))
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
            // FFZ-style modifier token / chain — apply to the previous emote
            // (don't insert as BTTV emote even if "w!" is a real emote name).
            // Live-replace modifier path — delegate to shared lib + apply.
            const cls = hsModClassify(word, { allowPrefix: false })
            if (cls.kind === 'modifier') {
              let prev = node.previousSibling
              while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
                prev = prev.previousSibling
              }
              if (prev && prev.nodeType === Node.ELEMENT_NODE &&
                  (prev.classList.contains('hs-input-emote') || prev.classList.contains('hs-input-stack'))) {
                const imgs = prev.tagName === 'IMG' ? [prev] : prev.querySelectorAll('img')
                const targetImg = imgs.length ? imgs[imgs.length - 1] : null
                if (targetImg) {
                  hsModApplyToImg(targetImg, cls.mods, cls.hue, cls.words)
                  const wordStart = cursor - match[0].length
                  node.textContent = text.slice(0, wordStart) + (text.slice(cursor) || ' ')
                  const nr = document.createRange()
                  nr.setStart(node, wordStart)
                  nr.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(nr)
                  pendingMessage = getInputText()
                  return
                }
              }
              // Modifier without an anchor — keep as plain text, don't insert as BTTV emote
              return
            }
            const resolved = lookupEmoteWithOverlay(word)
            if (resolved) {
              const wordStart = cursor - match[0].length
              if (deflectAdjacentChip(node, wordStart)) return
              const img = createInputEmoteImg(word)
              if (img) {
                const beforeText = text.slice(0, wordStart)
                const afterText = text.slice(cursor)
                const parent = node.parentNode
                const isZeroWidth = resolved.isOverlay

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
                    node.textContent = afterText || ' '
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
                const afterNode = document.createTextNode(afterText || ' ')
                if (beforeNode) parent.insertBefore(beforeNode, node)
                parent.insertBefore(img, node)
                parent.insertBefore(afterNode, node)
                parent.removeChild(node)
                const newRange = document.createRange()
                newRange.setStart(afterNode, 0)
                newRange.collapse(true)
                sel.removeAllRanges()
                sel.addRange(newRange)
                // Cascade: if afterNode begins with another emote name (the
                // "user just re-spaced two stuck names" pattern), imagify
                // those too, separated by nbsp. Stops as soon as the next
                // word isn't an emote, or has whitespace before it (the
                // user explicitly separated them). Skip overlay/zero-width
                // emotes \u2014 those need stack handling we don't replicate here.
                while (true) {
                  const cm = afterNode.textContent.match(/^(\S+)(\s|$)/)
                  if (!cm) break
                  const cName = cm[1]
                  const cResolved = lookupEmoteWithOverlay(cName)
                  if (!cResolved || cResolved.isOverlay) break
                  const cImg = createInputEmoteImg(cName)
                  if (!cImg) break
                  parent.insertBefore(document.createTextNode('\u00A0'), afterNode)
                  parent.insertBefore(cImg, afterNode)
                  // Keep the leading whitespace from after the consumed name
                  // \u2014 it acts as the user's explicit separator and also
                  // prevents the next iteration from cascading further.
                  const remaining = afterNode.textContent.slice(cName.length)
                  afterNode.textContent = remaining || ' '
                  newRange.setStart(afterNode, remaining ? 0 : 1)
                  newRange.collapse(true)
                  sel.removeAllRanges()
                  sel.addRange(newRange)
                  if (!remaining) break
                }
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
  // Merges Twitch/Kick irc buffer + YouTube buffer (channelYtMessages) so
  // YT-only chatters tab-complete on YT-only channels.
  const out = new Map()
  let ch = currentTab
  if (currentTab === 'live' && typeof getLiveChannel === 'function') ch = getLiveChannel()
  const ircMsgs = (ch && typeof irc !== 'undefined' && irc?.channels?.get(ch.toLowerCase())?.getAll?.()) || []
  const ytMsgs = (typeof channelYtMessages !== 'undefined' && channelYtMessages.get(currentTab)) || []
  // Walk both buffers from newest tail, picking whichever has the later time.
  let i = ircMsgs.length - 1
  let j = ytMsgs.length - 1
  let rank = 0
  while (rank < 50 && (i >= 0 || j >= 0)) {
    const a = i >= 0 ? (ircMsgs[i]?.time || 0) : -1
    const b = j >= 0 ? (ytMsgs[j]?.time || 0) : -1
    const pickIrc = a >= b
    const msg = pickIrc ? ircMsgs[i--] : ytMsgs[j--]
    const u = (msg?.user || '').toLowerCase()
    if (!u || out.has(u)) continue
    out.set(u, rank++)
  }
  return out
}

// Modifier constants/helpers live in src/lib/modifiers.js (bundled into IIFE
// scope by build.js). Aliases for backward-compat usage inside this file:
const HS_MODS_MAP = HS_MOD_TOKENS
const HS_C_HEX_RE = HS_MOD_C_HEX_RE
function peelModifierChain(w) { return hsModPeelChain(w) }
function resolveModifierPrefix(w) { return hsModResolvePrefix(w) }
function _hsHexToHueDeg(h) { return hsModHexToHue(h) }

// Scan input for modifier shorthands adjacent to emotes; apply via lib helper.
// Cursor-position-agnostic. Returns true if any modifier was applied.
// Only mutates a text node if it consumed at least one token from it — leaves
// non-modifier text alone so emote autocomplete can still find words.
function scanAndApplyModifiersInInput(input) {
  if (!input) return false
  let appliedAny = false
  let prevEmote = null
  for (const child of [...input.childNodes]) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const isEmote = child.classList?.contains('hs-input-emote') ||
                      child.classList?.contains('hs-input-stack')
      if (isEmote) prevEmote = child
      else if (child.tagName !== 'BR') prevEmote = null
      continue
    }
    if (child.nodeType !== Node.TEXT_NODE || !prevEmote) continue
    const tokens = child.textContent.split(/(\s+)/)
    const remaining = []
    let consumedHere = false
    for (const tok of tokens) {
      if (!tok || /^\s*$/.test(tok)) { remaining.push(tok); continue }
      const cls = hsModClassify(tok, { allowPrefix: true })
      if (cls.kind !== 'modifier') { remaining.push(tok); continue }
      const imgs = prevEmote.tagName === 'IMG' ? [prevEmote] : prevEmote.querySelectorAll('img')
      const targetImg = imgs.length ? imgs[imgs.length - 1] : null
      if (!targetImg) { remaining.push(tok); continue }
      hsModApplyToImg(targetImg, cls.mods, cls.hue, cls.words)
      appliedAny = true
      consumedHere = true
    }
    if (consumedHere) {
      child.textContent = remaining.join('').replace(/\s+/g, ' ') || ' '
    }
  }
  if (appliedAny && typeof pendingMessage !== 'undefined') pendingMessage = getInputText()
  return appliedAny
}

// Apply modifier word at cursor (Tab/space-trigger paths). Walks back from
// cursor's text node to find the previous emote element, applies via lib.
function applyModifierAtCursor(modWord, _ignoredModKey, _ignoredCMatch) {
  const cls = hsModClassify(modWord, { allowPrefix: true })
  if (cls.kind !== 'modifier') return false
  const input = document.getElementById('hs-mc-input')
  if (!input?.isContentEditable) return false
  const sel = window.getSelection()
  if (!sel?.rangeCount) return false
  const range = sel.getRangeAt(0)
  let textNode = range.startContainer
  let cursor = range.startOffset
  if (textNode.nodeType === Node.ELEMENT_NODE && cursor > 0) {
    const child = textNode.childNodes[cursor - 1]
    if (child?.nodeType === Node.TEXT_NODE) { textNode = child; cursor = child.textContent.length }
  }
  if (textNode.nodeType !== Node.TEXT_NODE) return false
  const text = textNode.textContent
  const before = text.slice(0, cursor)
  const after = text.slice(cursor)
  const bm = before.match(/(\s*)(\S+)$/)
  const am = after.match(/^(\S*)/)
  if (!bm) return false
  const fullWord = bm[2] + (am ? am[1] : '')
  // Accept exact match, OR a resolved-prefix match (typed "w", target "w!")
  const expected = cls.resolvedFrom || modWord
  if (fullWord !== expected && fullWord !== modWord) return false
  const wsStart = cursor - bm[0].length
  const wordEnd = cursor + (am ? am[1].length : 0)
  // Need previous text in this node to be only whitespace before the word
  if (text.slice(0, wsStart).trim().length > 0) return false
  let prev = textNode.previousSibling
  while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') prev = prev.previousSibling
  if (!prev || prev.nodeType !== Node.ELEMENT_NODE) return false
  if (!(prev.classList.contains('hs-input-emote') || prev.classList.contains('hs-input-stack'))) return false
  const imgs = prev.tagName === 'IMG' ? [prev] : prev.querySelectorAll('img')
  const targetImg = imgs.length ? imgs[imgs.length - 1] : null
  if (!targetImg) return false
  hsModApplyToImg(targetImg, cls.mods, cls.hue, cls.words)
  // Remove the modifier text + leading whitespace
  textNode.textContent = (text.slice(0, wsStart) + text.slice(wordEnd)) || ' '
  const nr = document.createRange()
  nr.setStart(textNode, Math.min(wsStart, textNode.textContent.length))
  nr.collapse(true)
  sel.removeAllRanges()
  sel.addRange(nr)
  if (typeof pendingMessage !== 'undefined') pendingMessage = getInputText()
  return true
}

// Replace the word at cursor in a contenteditable input with newWord. Used
// when Tab expands a modifier shorthand (typed "w" → replace with "w!").
function replaceWordAtCursor(input, oldWord, newWord) {
  const sel = window.getSelection()
  if (!sel?.rangeCount) return
  const range = sel.getRangeAt(0)
  let node = range.startContainer
  let offset = range.startOffset
  if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const child = node.childNodes[offset - 1]
    if (child?.nodeType === Node.TEXT_NODE) { node = child; offset = child.textContent.length }
  }
  if (node.nodeType !== Node.TEXT_NODE) return
  const text = node.textContent
  const before = text.slice(0, offset)
  const after = text.slice(offset)
  const m = before.match(/(\S+)$/)
  const am = after.match(/^(\S*)/)
  if (!m) return
  const fullCurrent = m[1] + (am ? am[1] : '')
  if (fullCurrent !== oldWord) return
  const wordStart = offset - m[1].length
  const wordEnd = offset + (am ? am[1].length : 0)
  node.textContent = text.slice(0, wordStart) + newWord + text.slice(wordEnd)
  const nr = document.createRange()
  nr.setStart(node, wordStart + newWord.length)
  nr.collapse(true)
  sel.removeAllRanges()
  sel.addRange(nr)
}


function findEmoteMatches(search) {
  const matches = [];

  // FFZ-style modifier tokens MUST NOT autocomplete — even if BTTV has an emote
  // literally named "w!". Use shared classifier; if it's a modifier, return [].
  if (hsModClassify(search, { allowPrefix: false }).kind === 'modifier') {
    return matches
  }

  // Check if searching for username (starts with @)
  const isUserSearch = search.startsWith('@');
  const searchTerm = isUserSearch ? search.slice(1) : search;
  const searchLower = searchTerm.toLowerCase();

  const recency = getRecencyMap()

  // Search usernames if @ prefix or if it could be a username
  const _hsPrefetchList = []
  if (isUserSearch || searchTerm.length >= 2) {
    for (const username of usernameCache) {
      if (!username) continue
      const userLower = username.toLowerCase();
      // Resolution priority: knownColors → _hsUserColorCache → fetch
      let color = (typeof knownColors !== 'undefined' && knownColors.get(userLower)) || null
      if (!color && _hsUserColorCache.has(userLower)) color = _hsUserColorCache.get(userLower) || null
      if (!color) _hsPrefetchList.push(userLower)
      color = color || '#fff'
      const recencyRank = recency.get(userLower)
      if (isUserSearch) {
        if (userLower.startsWith(searchLower)) {
          matches.push({ name: '@' + username, url: null, priority: 0, type: 'user', recencyRank });
        }
      } else {
        if (userLower.startsWith(searchLower)) {
          matches.push({ name: username, url: null, priority: 0, type: 'user-bare', color, recencyRank });
        } else if (userLower.includes(searchLower)) {
          matches.push({ name: username, url: null, priority: 2, type: 'user-bare', color, recencyRank });
        }
      }
    }
  }
  // Fire batched prefetch — by the time user hits Tab, colors are likely cached
  if (_hsPrefetchList.length) {
    try { hsPrefetchUserColors(_hsPrefetchList.slice(0, 30)) } catch {}
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

// Build a styled mention chip span for bare-username completion.
// Resolves color synchronously from caches FIRST (no white flash for known
// users), then async-fetches only if still unknown.
function createUserMentionSpan(username, color) {
  const span = document.createElement('span')
  span.className = 'hs-mc-user hs-cycling-user'
  const lower = username.toLowerCase()
  span.dataset.username = lower
  span.dataset.completionType = 'user-bare'
  span.textContent = username
  const sanitize = (c) => (typeof sanitizeColor === 'function' ? sanitizeColor(c || '#fff') : (c || '#fff'))

  // Sync cache resolution — instant for anyone we've already seen this session
  let finalColor = (color && color !== '#fff') ? color : null
  if (!finalColor && _hsUserColorCache.has(lower)) finalColor = _hsUserColorCache.get(lower) || null
  if (!finalColor && typeof knownColors !== 'undefined') {
    const k = knownColors.get(lower)
    if (k && k !== '#fff') finalColor = k
  }

  span.style.color = sanitize(finalColor || '#fff')
  span.style.fontWeight = 'bold'
  span.style.cursor = 'pointer'
  span.contentEditable = 'false'
  span.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    window.open(`https://heatsync.org/user/${encodeURIComponent(lower)}`, '_blank', 'noopener,noreferrer')
  })
  // Only async-fetch when truly unknown
  if (!finalColor) hsFetchUserColorAndApply(lower, span)
  return span
}

// Cache: username (lower) → color hex (or null for "fetched but no color")
const _hsUserColorCache = new Map()
const _hsUserColorInflight = new Map()

// Persist cache across page reloads — colors don't change often. Loads at startup.
try {
  (typeof api !== 'undefined' ? api : chrome).storage.local.get('hs_user_color_cache').then(d => {
    const obj = d?.hs_user_color_cache
    if (obj && typeof obj === 'object') {
      for (const k in obj) _hsUserColorCache.set(k, obj[k])
    }
  }).catch(() => {})
} catch {}

let _hsUserColorCacheSaveTimer = null
function _hsPersistUserColorCache() {
  if (_hsUserColorCacheSaveTimer) return
  _hsUserColorCacheSaveTimer = setTimeout(() => {
    _hsUserColorCacheSaveTimer = null
    const obj = {}
    for (const [k, v] of _hsUserColorCache) if (v) obj[k] = v  // skip nulls
    try { (typeof api !== 'undefined' ? api : chrome).storage.local.set({ hs_user_color_cache: obj }) } catch {}
  }, 2000)
}

// Prefetch colors for a list of usernames in the background. Deduped + batched
// via GQL so 10 names = 1 round-trip. Populates _hsUserColorCache for later
// instant lookup in createUserMentionSpan.
function hsPrefetchUserColors(usernames) {
  const needed = []
  for (const u of usernames || []) {
    const lower = String(u || '').toLowerCase()
    if (!lower) continue
    if (_hsUserColorCache.has(lower)) continue
    if (_hsUserColorInflight.has(lower)) continue
    // Don't re-fetch if knownColors already has them
    if (typeof knownColors !== 'undefined' && knownColors.get(lower)) continue
    needed.push(lower)
  }
  if (!needed.length) return
  // Mark inflight
  const batchPromise = (async () => {
    try {
      // Build batched GQL with aliases — single request for all users
      const aliases = needed.map((u, i) => `u${i}: user(login: "${u.replace(/"/g, '')}") { chatColor }`).join(' ')
      const resp = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
        body: JSON.stringify({ query: `{ ${aliases} }` })
      })
      if (!resp.ok) return
      const j = await resp.json()
      const data = j?.data || {}
      for (let i = 0; i < needed.length; i++) {
        const u = needed[i]
        const c = data[`u${i}`]?.chatColor || null
        _hsUserColorCache.set(u, c)
        if (c) { try { setKnownColor(u, c) } catch {} }
      }
      _hsPersistUserColorCache()
    } catch {}
  })()
  for (const u of needed) _hsUserColorInflight.set(u, batchPromise)
  batchPromise.finally(() => { for (const u of needed) _hsUserColorInflight.delete(u) })
}
function hsFetchUserColorAndApply(lower, span) {
  if (_hsUserColorCache.has(lower)) {
    const cached = _hsUserColorCache.get(lower)
    if (cached) {
      span.style.color = (typeof sanitizeColor === 'function' ? sanitizeColor(cached) : cached)
      try { setKnownColor(lower, cached) } catch {}
    }
    return
  }
  let p = _hsUserColorInflight.get(lower)
  if (!p) {
    p = (async () => {
      try {
        if (typeof apiFetch !== 'function') return null
        const resp = await apiFetch(`/api/profile/${encodeURIComponent(lower)}`)
        const profile = resp?.data?.profile
        // 1. heatsync custom color (set on heatsync.org)
        let c = profile?.color || profile?.user_color || profile?.userColor || null
        // 2. fallback: fetch Twitch chat color via unauthed GQL (no scope needed)
        if (!c && profile?.twitch_username) {
          try {
            const gqlResp = await fetch('https://gql.twitch.tv/gql', {
              method: 'POST',
              credentials: 'omit',
              headers: {
                'Content-Type': 'application/json',
                'Client-Id': 'kimne78kx3ncx6brgo4mv6wki5h1ko'
              },
              body: JSON.stringify({
                query: 'query($login:String!){user(login:$login){chatColor}}',
                variables: { login: profile.twitch_username }
              })
            })
            if (gqlResp.ok) {
              const j = await gqlResp.json()
              c = j?.data?.user?.chatColor || null
            }
          } catch {}
        }
        // 3. fallback: Twitch's 15 auto-assigned colors (hash of username)
        if (!c) {
          const palette = ['#FF0000','#0000FF','#008000','#B22222','#FF7F50','#9ACD32','#FF4500','#2E8B57','#DAA520','#D2691E','#5F9EA0','#1E90FF','#FF69B4','#8A2BE2','#00FF7F']
          let h = 0
          for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) | 0
          c = palette[Math.abs(h) % palette.length]
        }
        _hsUserColorCache.set(lower, c || null)
        if (c) { try { setKnownColor(lower, c) } catch {} }
        return c
      } catch { return null }
    })()
    _hsUserColorInflight.set(lower, p)
    p.finally(() => _hsUserColorInflight.delete(lower))
  }
  p.then(c => {
    if (c && span.isConnected) {
      span.style.color = (typeof sanitizeColor === 'function' ? sanitizeColor(c) : c)
    }
  })
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
      // Re-check overlay state: cycling through Tab matches can move between
      // overlay and non-overlay alternatives. Without this, the FIRST insert's
      // overlay state sticks — every cycle stays inside the stack span and
      // non-overlay matches appear to stack onto whatever's before them.
      const resolved = (typeof lookupEmoteWithOverlay === 'function') ? lookupEmoteWithOverlay(match.name) : null
      const wantsOverlay = !!resolved?.isOverlay
      const stack = existingEmote.parentElement?.classList?.contains('hs-input-stack')
        ? existingEmote.parentElement : null
      if (stack && !wantsOverlay) {
        // Pull the cycling img out of the stack and place it after the stack
        // as a standalone unit. Strip the overlay class so its native sizing
        // returns. If the stack ends up with one child, unwrap it back to a
        // bare emote img.
        existingEmote.classList.remove('hs-input-overlay')
        stack.parentNode.insertBefore(existingEmote, stack.nextSibling)
        // Insert a separator space so following typed text gets a word break
        if (!existingEmote.nextSibling || existingEmote.nextSibling.textContent !== ' ') {
          existingEmote.parentNode.insertBefore(document.createTextNode(' '), existingEmote.nextSibling)
        }
        if (stack.children.length === 1) {
          const base = stack.firstElementChild
          stack.parentNode.insertBefore(base, stack)
          stack.remove()
        } else if (stack.children.length === 0) {
          stack.remove()
        }
      } else if (!stack && wantsOverlay) {
        // Cycle landed on an overlay match while the cycling img is standalone.
        // Find a preceding emote/stack and move the img into a stack on top.
        let prev = existingEmote.previousSibling
        while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
          const rm = prev; prev = prev.previousSibling; rm.remove()
        }
        if (prev && prev.nodeType === Node.ELEMENT_NODE && (
          (prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
          prev.classList?.contains('hs-input-stack')
        )) {
          stackInputEmote(prev, existingEmote)
        }
      }
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
      attachInputEmoteErrorRecovery(img)
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
      attachInputEmoteErrorRecovery(img)
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
    // Defensive leading separator: if the typed word started at textNode
    // offset 0 (so `before` is empty) and the previous sibling is a chip,
    // splice an nbsp into `before` so the new chip doesn't touch the prior
    // chip \u2014 otherwise unwrapStuckChips collapses both back to plain text.
    let leadBefore = before;
    if (!leadBefore) {
      const prev = textNode.previousSibling;
      const prevIsChip = prev?.nodeType === Node.ELEMENT_NODE && (
        (prev.tagName === 'IMG' && (prev.classList?.contains('hs-input-emote') || prev.dataset?.emoteName)) ||
        prev.classList?.contains('hs-input-stack') ||
        prev.classList?.contains('hs-mc-emoji') ||
        prev.classList?.contains('hs-mc-user') ||
        prev.classList?.contains('hs-cycling-emote') ||
        prev.classList?.contains('hs-cycling-text')
      );
      if (prevIsChip) leadBefore = '\u00A0';
    }
    textNode.textContent = leadBefore;
    // Auto-space after Tab uses nbsp \u2014 at end of contenteditable, regular
    // trailing spaces collapse to 0 width and look invisible. Backspace
    // handler still consumes this in one keystroke, so it behaves like a
    // typed space (1st press eats it, 2nd press deletes the chip).
    const space = document.createTextNode(' ' + after);
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
    attachInputEmoteErrorRecovery(img);
    // Zero-width / overlay: stack onto preceding emote so the input preview
    // matches how chat will render the same word sequence.
    const resolved = (typeof lookupEmoteWithOverlay === 'function') ? lookupEmoteWithOverlay(match.name) : null;
    if (resolved?.isOverlay && before.trim() === '') {
      let prev = textNode.previousSibling;
      while (prev && prev.nodeType === Node.TEXT_NODE && prev.textContent.trim() === '') {
        prev = prev.previousSibling;
      }
      if (prev && prev.nodeType === Node.ELEMENT_NODE && (
        (prev.tagName === 'IMG' && prev.classList.contains('hs-input-emote')) ||
        prev.classList?.contains('hs-input-stack')
      )) {
        // Drop whitespace nodes between prev base and current text node
        let ws = prev.nextSibling;
        while (ws && ws !== textNode) {
          const rm = ws;
          ws = ws.nextSibling;
          rm.remove();
        }
        stackInputEmote(prev, img);
        textNode.textContent = after || ' ';
        placeCaretAfter(textNode, 1);
        pendingMessage = getInputText();
        updateCharCount();
        input.focus();
        return;
      }
    }
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
    tt.style.cssText = 'position:absolute;bottom:100%;left:8px;background:#000;color:#fff;padding:4px 8px;font-size:13px;border-radius: 0;z-index:1003;margin-bottom:4px;';
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
      // Emoji spans must stay wrapped (caret would otherwise snap mid-grapheme
      // around the U+FE0F variation selector). For non-emoji cycling text,
      // unwrap to a plain text node so it merges naturally with surrounding text.
      if (cyclingText.classList.contains('hs-mc-emoji')) {
        cyclingText.classList.remove('hs-cycling-text');
        delete cyclingText.dataset.completionName;
      } else {
        const textNode = document.createTextNode(cyclingText.textContent);
        cyclingText.replaceWith(textNode);
      }
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

    // Wrap emoji in a span so the caret has an unambiguous boundary. Setting
    // a caret offset past a U+FE0F variation selector inside a plain text
    // node confuses Chrome's keyboard handler — the next typed char snaps to
    // *before* the grapheme.
    const span = document.createElement('span')
    span.className = 'hs-mc-emoji'
    span.textContent = entry.emoji
    span.title = ':' + entry.name + ':'
    span.setAttribute('data-emoji-name', entry.name)
    const tail = text.slice(cursor)
    const head = text.slice(0, colonIdx)
    // Trailing space keeps emote-name boundaries intact downstream.
    const trailing = !/^\s/.test(tail) ? ' ' : ''
    // Leading space when this emoji lands right after an existing chip (no
    // plain-text gap). Without it the input event triggers chip-merge
    // safeguards that collapse adjacent chips back to plain text.
    let leading = ''
    if (!head) {
      const prev = node.previousSibling
      const prevIsChip = prev?.nodeType === Node.ELEMENT_NODE && (
        (prev.tagName === 'IMG' && (prev.classList?.contains('hs-input-emote') || prev.dataset?.emoteName)) ||
        prev.classList?.contains('hs-input-stack') ||
        prev.classList?.contains('hs-mc-emoji') ||
        prev.classList?.contains('hs-mc-user')
      )
      if (prevIsChip) leading = ' '
    }
    const beforeNode = document.createTextNode(leading + head)
    const afterNode = document.createTextNode(trailing + tail)
    const parent = node.parentNode
    parent.insertBefore(beforeNode, node)
    parent.insertBefore(span, node)
    parent.insertBefore(afterNode, node)
    parent.removeChild(node)
    const newRange = document.createRange()
    newRange.setStart(afterNode, Math.min(trailing.length, afterNode.textContent.length))
    newRange.collapse(true)
    sel.removeAllRanges()
    sel.addRange(newRange)
  } else {
    const text = input.value
    const cursor = input.selectionStart
    const before = text.slice(0, cursor)
    const colonIdx = before.lastIndexOf(':')
    if (colonIdx === -1) { hideEmojiDropdown(); return }
    const tail = text.slice(cursor)
    const space = !/^\s/.test(tail) ? ' ' : ''
    input.value = text.slice(0, colonIdx) + entry.emoji + space + tail
    const newPos = colonIdx + entry.emoji.length + space.length
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
  hideSlashDropdown()
  if (wysiwygEnabled) input.textContent = ''
  else input.value = ''
  pendingMessage = ''
  updateCharCount()
}

function checkSlashAutocomplete() {
  const text = (typeof getInputText === 'function' ? getInputText() : '') || ''
  const m = text.match(/^\/([a-z?]*)$/i)
  if (!m) { hideSlashDropdown(); return }
  const q = m[1].toLowerCase()
  const matches = SLASH_COMMANDS.filter(c => c.cmd.startsWith(q)).slice(0, 8)
  if (matches.length === 0) { hideSlashDropdown(); return }
  if (!slashAcState.active || slashAcState.index >= matches.length) slashAcState.index = 0
  slashAcState.active = true
  slashAcState.matches = matches
  showSlashDropdown(matches, slashAcState.index)
}

function showSlashDropdown(matches, idx) {
  let dd = document.getElementById('hs-mc-slash-dropdown')
  if (!dd) {
    dd = document.createElement('div')
    dd.id = 'hs-mc-slash-dropdown'
    document.getElementById('hs-mc-inputbar')?.appendChild(dd)
  }
  dd.textContent = ''
  matches.forEach((c, i) => {
    const row = document.createElement('div')
    row.className = 'hs-mc-slash-row' + (i === idx ? ' selected' : '')
    row.dataset.index = i
    const name = document.createElement('span')
    name.className = 'hs-mc-slash-name'
    name.textContent = '/' + c.cmd
    const args = document.createElement('span')
    args.className = 'hs-mc-slash-args'
    args.textContent = c.args ? ' ' + c.args : ''
    const desc = document.createElement('span')
    desc.className = 'hs-mc-slash-desc'
    desc.textContent = c.desc
    row.appendChild(name)
    row.appendChild(args)
    row.appendChild(desc)
    row.addEventListener('mousedown', (e) => {
      e.preventDefault()
      insertSlashCommand(c)
    })
    dd.appendChild(row)
  })
  dd.style.display = 'block'
}

function hideSlashDropdown() {
  slashAcState.active = false
  slashAcState.matches = []
  slashAcState.index = 0
  const dd = document.getElementById('hs-mc-slash-dropdown')
  if (dd) dd.style.display = 'none'
}

function insertSlashCommand(c) {
  const input = document.getElementById('hs-mc-input')
  if (!input) return
  const inserted = '/' + c.cmd + (c.args ? ' ' : '')
  if (wysiwygEnabled) {
    input.textContent = inserted
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    if (sel) { sel.removeAllRanges(); sel.addRange(range) }
  } else {
    input.value = inserted
    if (typeof input.setSelectionRange === 'function') {
      input.setSelectionRange(inserted.length, inserted.length)
    }
  }
  hideSlashDropdown()
  pendingMessage = inserted
  if (typeof updateCharCount === 'function') updateCharCount()
  input.focus()
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
  // /ban /unban /timeout /to /b /untimeout /delete — handled below via GQL,
  // not passthrough. Twitch deprecated these as IRC chat commands in Feb 2023;
  // sending them as text now silently no-ops, which is what caused multichat's
  // pre-fix /unban to do nothing. Aliases map all common shorthands to the
  // canonical command.
  b: 'ban',
  to: 'timeout',
  untimeout: 'unban',
  unto: 'unban',
  del: 'delete',
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
    if (!hsAuthToken) { showToast('log in at heatsync.org first to /op', 'error'); return true }
    const ok = await postFeedMessage(rest.trim(), { topLevel: true })
    showToast(ok ? 'success' : 'post failed', ok ? 'success' : 'error')
    clearInput(input)
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
    if (!lastWhisperKey) { showToast('no one to reply to', 'error'); return true }
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
    showToast(`muted ${u} (24h)`, 'success')
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
    showToast(`unmuted ${u}`, 'success')
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
    showToast(cleared ? 'local buffer cleared' : 'nothing to clear here', cleared ? 'success' : undefined)
    clearInput(input)
    return true
  }

  if (cmd === 'help') {
    showSlashHelp()
    clearInput(input)
    return true
  }

  // ─── Twitch mod actions (deprecated from IRC PRIVMSG in 2023; routed via GQL) ───
  // currentTab = channel login when on a per-channel tab; on aggregate tabs we
  // can't pick a single channel, so refuse with a useful toast.
  const modChannel = (typeof currentTab === 'string' && /^[a-z0-9_]{2,40}$/i.test(currentTab))
    ? currentTab : null

  if (cmd === 'ban' || cmd === 'timeout' || cmd === 'unban') {
    if (!modChannel) {
      showToast(`/${cmd} needs a channel tab (not live/mentions/posts)`, 'error')
      return true
    }
    if (cmd === 'ban') {
      const m = rest.match(/^@?(\S+)(?:\s+(.+))?$/)
      if (!m) { showToast('usage: /ban <user> [reason]', 'error'); return true }
      const [, target, reason] = m
      const resp = await banTwitchUser(modChannel, target, reason || '')
      showToast(resp.ok ? `banned ${target}` : `ban failed: ${resp.error || 'unknown'}`, resp.ok ? 'success' : 'error')
      if (resp.ok) clearInput(input)
      return true
    }
    if (cmd === 'timeout') {
      const m = rest.match(/^@?(\S+)(?:\s+(\d+))?(?:\s+(.+))?$/)
      if (!m) { showToast('usage: /timeout <user> [seconds] [reason]', 'error'); return true }
      const [, target, secStr, reason] = m
      const sec = secStr ? Math.max(1, parseInt(secStr)) : 600
      const resp = await timeoutTwitchUser(modChannel, target, sec, reason || '')
      showToast(resp.ok ? `timed out ${target} ${sec}s` : `timeout failed: ${resp.error || 'unknown'}`, resp.ok ? 'success' : 'error')
      if (resp.ok) clearInput(input)
      return true
    }
    if (cmd === 'unban') {
      const target = rest.trim().replace(/^@/, '')
      if (!target) { showToast('usage: /unban <user>', 'error'); return true }
      const resp = await unbanTwitchUser(modChannel, target)
      showToast(resp.ok ? `unbanned ${target}` : `unban failed: ${resp.error || 'unknown'}`, resp.ok ? 'success' : 'error')
      if (resp.ok) clearInput(input)
      return true
    }
  }

  if (cmd === 'delete') {
    if (!modChannel) { showToast('/delete needs a channel tab', 'error'); return true }
    const messageID = rest.trim()
    if (!messageID) { showToast('usage: /delete <message-id> (right-click a message)', 'error'); return true }
    const resp = await deleteTwitchMessage(modChannel, messageID)
    showToast(resp.ok ? 'deleted' : `delete failed: ${resp.error || 'unknown'}`, resp.ok ? 'success' : 'error')
    if (resp.ok) clearInput(input)
    return true
  }

  return false
}

const SLASH_HELP_LINES = [
  '/op <text>             — post to home',
  '/w <user> <msg>        — twitch whisper',
  '/dm <user> <msg>       — heatsync DM',
  '/r <msg>               — reply to last whisper',
  '/mute <user>           — local mute (24h)',
  '/unmute <user>         — local unmute',
  '/shrug [text]          — append ¯\\_(ツ)_/¯',
  '/tableflip [text]      — append (╯°□°)╯︵ ┻━┻',
  '/unflip [text]         — append ┬─┬ノ( ゜-゜ノ)',
  '/lclear                — clear current tab locally',
  '/help                  — this list',
  '',
  'twitch mod (routed via GQL, need a channel tab):',
  '/ban <user> [reason]   — perma ban',
  '/timeout <user> [s] [r]— timeout, default 600s',
  '/unban <user>          — unban or end timeout',
  '/delete <msg-id>       — delete one message',
  '',
  '/me /color and chat pass through to twitch & kick.',
  'other native commands (/mod /vip /raid /slow /clear /',
  'followers /emoteonly /announce) are not yet wired —',
  'use twitch native chat or mod panel.',
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
          showToast(t('mc_whisper_user_not_found', [username]), 'error')
          return
        }
        whisperUsersSet(key, { platform: 'twitch', userId: body, displayName: username, color: '#fff' })
      } catch (e) {
        showToast(t('mc_whisper_resolve_failed'), 'error')
        return
      }
    }
  } else {
    // HeatSync DM — resolve username → user_id via profile API
    const profileResp = await apiFetch(`/api/profile/${encodeURIComponent(lowerUser)}`)
    if (!profileResp.ok || !profileResp.data?.profile?.user_id) {
      showToast(t('mc_whisper_hs_not_found', [username]), 'error')
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
  if (!input) return;

  let text = convertEmojiShortcodes(getInputText().trim());
  if (!text) return;

  // Resub-share mode — typed text becomes the celebration BODY via Twitch's
  // Chat_ShareResub_UseResubToken GQL mutation. consume() fires that mutation
  // and injects a local synthetic for instant visual feedback. Returns true
  // when the text was consumed AS the celebration body (don't send again as
  // plain PRIVMSG — would duplicate); returns false in the no-token fallback
  // path so the typed text still lands as a normal chat message.
  if (window.__hsResubShare?.active?.()) {
    try {
      if (window.__hsResubShare.consume(text) === true) {
        clearInput(document.getElementById('hs-mc-input'))
        return
      }
    } catch (_) {}
  }
  // Watch-streak share mode — same contract as resub-share. consume() fires
  // the native broadcast + injects a local synth, then we fall through so the
  // user's typed body also lands as a normal PRIVMSG (visible to everyone).
  if (window.__hsWatchstreakShare?.active?.()) {
    try { window.__hsWatchstreakShare.consume(text) } catch (_) {}
  }

  // Slash commands — work from any tab. Handler may return:
  //   true   -> consumed, exit
  //   string -> rewrite outgoing text and continue normal send
  //   else   -> not ours, pass raw text through to platform
  if (text.startsWith('/')) {
    const result = await handleSlashCommand(text, input)
    if (result === true) return
    if (typeof result === 'string') text = result
  }

  // Feed tab: plain text + media paste posts directly to home feed.
  // Slash commands are still respected (e.g. /op explicit, /w whisper).
  if (currentTab === 'feed') {
    await postFeedMessage(text, { topLevel: true })
    return
  }

  // Whispers/mentions: still require slash commands
  if (currentTab === 'whispers' || currentTab === 'mentions') {
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
    ch = config.channels.find(c => c.id === currentTab)
    targetChannel = ch?.twitch || ch?.kick || currentTab
  }

  if (!targetChannel) {
    flashInputError(input)
    return
  }

  // Resolve platform targets
  const kickSlug = ch?.kick
  const twitchName = ch?.twitch
  const isLiveKick = currentTab === 'live' && hostPlatform === 'kick'

  const sendToKick = !!kickSlug || isLiveKick
  const sendToTwitch = !!twitchName && !isLiveKick

  const ytUrl = ch?.youtube
  const isLiveYt = currentTab === 'live' && hostPlatform === 'yt'
  const sendToYoutube = !!ytUrl || isLiveYt
  const isDualSend = sendToKick && sendToTwitch

  // Track every send (not just dual-send). The host platform stored on each
  // entry powers two things: (1) dedup of dual-send second echoes, (2) badge
  // attribution via peekSentHost so own messages render with the platform
  // the user is viewing FROM (extension input on kick.com → [K]) regardless
  // of which relay platform actually echoed back.
  trackSentMessage(text)

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

  // --- Kick send path (single, dual, or triple including YT) ---
  if (sendToKick) {
    const slug = kickSlug || targetChannel
    const kickPromise = sendKickMessage(slug, text)
    const twitchPromise = sendToTwitch
      ? getTwitchAuthTokenAsync().then(({ token: tok, username: twitchNick }) =>
          sendIrcMessage(twitchName, text, tok, replyParentId, twitchNick))
      : Promise.resolve(null)

    // Best-effort YouTube — fire alongside Kick/Twitch so a triple-link
    // channel (twitch+kick+youtube) actually mirrors to all three.
    if (sendToYoutube) {
      sendYoutubeMessage(text).then(result => {
        if (result !== true && result !== 'no_youtube_tab') {
          showToast('youtube send failed', 'error')
        }
      })
    }

    Promise.all([kickPromise, twitchPromise]).then(([kickResult, twitchResult]) => {
      const kickOk = kickResult === true
      const twitchOk = twitchResult === true || twitchResult === null

      if (kickOk || twitchOk) {
        // Partial failure toasts for dual-send
        if (isDualSend && !twitchOk) showToast('sent to kick only — twitch failed', 'error')
        if (isDualSend && !kickOk) showToast('sent to twitch only — kick failed', 'error')
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
        showToast(errorMsg, 'error')
      }
    })
    return
  }
  // Twitch + YouTube (and no Kick) — fire YouTube as best-effort alongside Twitch send below
  if (sendToYoutube && sendToTwitch && !sendToKick) {
    sendYoutubeMessage(text).then(result => {
      if (result !== true && result !== 'no_youtube_tab') {
        showToast('youtube send failed', 'error')
      }
    })
    // fall through to Twitch path
  }

  // --- Twitch-only send path (existing behavior) ---
  const { token, username: twitchNick } = await getTwitchAuthTokenAsync()
  if (!token) {
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
    el.style.cssText = 'padding:2px 8px;font-size:13px;color:#ff8700;background:#000;border-top:1px solid #808080;'
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
