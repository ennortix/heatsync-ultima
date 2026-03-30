// Social - feed, notifications, activity, heatsync API

// Heat tier display — number + color glow + row effects, no emoji
function getHeatDisplay(heat) {
  if (!heat || heat <= 0) return null
  let color, glow = false, border = '#555', borderWidth = 2, bg = ''
  if (heat >= 5000) {
    color = '#fff'; glow = true; border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'; // + breathing animation applied separately
  } else if (heat >= 500) {
    color = '#fff'; glow = true; border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'
  } else if (heat >= 100) {
    color = '#ffaa00'; border = '#ffaa00'; borderWidth = 3
    bg = 'rgba(50,15,0,0.10)'
  } else if (heat >= 25) {
    color = '#ff8700'; border = '#ff8700'; borderWidth = 3
    bg = 'rgba(40,12,0,0.07)'
  } else if (heat >= 10) {
    color = '#ff8700'; border = '#ff8700'; borderWidth = 2
  } else if (heat >= 1) {
    color = '#666'; border = '#555'; borderWidth = 2
  } else {
    color = '#444'
  }
  const suffix = heat >= 10 ? '°' : ''
  const breathe = heat >= 500
  return { color, glow, suffix, border, borderWidth, bg, breathe }
}

// Feed & notifications state
let feedMessages = [];
let feedLoaded = false;
let feedLoading = false;
let feedPage = 1;
let feedHasMore = true;
let feedLastFetch = 0; // Timestamp of last feed fetch
const FEED_STALE_MS = 120000; // 2 minutes
let notifications = { mentions: 0, op_replies: 0, re_replies: 0, total: 0 };
let notifMessages = []; // Actual notification messages for display
let notifLoaded = false;
let unreadNotifCount = 0;
const activityEvents = []; // Stream events for activity tab
const ACTIVITY_EVENTS_MAX = 500;
function pushActivityEvent(evt) {
  if (activityEvents.some(m => m.text === evt.text)) return
  activityEvents.push(evt)
  if (activityEvents.length > ACTIVITY_EVENTS_MAX) activityEvents.splice(0, activityEvents.length - ACTIVITY_EVENTS_MAX)
}
let activeThread = null // { id, op, replies[] } — when set, feed shows thread view
let replyState = null; // { msgId, user, channel } when replying to a message
let hsAuthToken = null; // Heatsync auth state (loaded from storage)

// ============================================
// SOCIAL TABS (FEED & NOTIFICATIONS)
// ============================================

// API proxy — routes through background.js to bypass CORS + attach auth
async function apiFetch(path, opts = {}) {
  try {
    const resp = await api.runtime.sendMessage({
      type: 'api_fetch',
      path,
      method: opts.method || 'GET',
      auth: opts.auth !== false,
      body: opts.body
    })
    return resp || { ok: false, error: 'no response' }
  } catch (e) {
    return { ok: false, error: 'context invalidated' }
  }
}

// Load heatsync auth state from storage
async function loadHsAuth() {
  try {
    const data = await api.storage.local.get(['auth_token_encrypted', 'auth_token']);
    hsAuthToken = !!(data.auth_token_encrypted || data.auth_token);
    log('Heatsync auth:', hsAuthToken ? 'logged in' : 'anonymous');
  } catch (e) {
    hsAuthToken = false;
  }

  // Watch for auth changes (login/logout on heatsync.org)
  if (!window._hsMcAuthWatcher) {
    window._hsMcAuthWatcher = true;
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.auth_token_encrypted || changes.auth_token) {
        const wasAuthed = hsAuthToken;
        hsAuthToken = !!(
          changes.auth_token_encrypted?.newValue ||
          changes.auth_token?.newValue
        );
        if (wasAuthed !== hsAuthToken) {
          log('Auth state changed:', hsAuthToken ? 'logged in' : 'logged out');
          // Reset feed/notif data on auth change
          feedLoaded = false;
          feedMessages = [];
          notifLoaded = false;
          notifMessages = [];
          unreadNotifCount = 0;
          updateNotifBadge();
          if (currentTab === 'feed') {
            renderMessages(currentTab);
          }
        }
      }
    });
  }
}

// Listen for social events from background (new messages, notifications)
function listenForSocialEvents() {
  // Guard: only register once (survives SPA reinit via chrome listener persistence)
  if (window._hsMcSocialListener) return;
  window._hsMcSocialListener = true;

  chrome.runtime?.onMessage?.addListener((msg) => {
    if (msg.type === 'new-message' && msg.data) {
      if (!feedLoaded) return;
      // Dedup: skip if already in feed
      const id = msg.data.base36_id;
      if (id && feedMessages.some(m => m.base36_id === id)) return;

      if (msg.data.username === 'Anonymous') return
      feedMessages.unshift(msg.data);
      if (feedMessages.length > 150) feedMessages.pop();

      // Real-time thread update: if reply to the active thread, append it
      const replyTo = msg.data.reply_to;
      if (replyTo && activeThread && activeThread.id === replyTo) {
        if (!activeThread.replies.some(r => r.base36_id === id)) {
          activeThread.replies.push(msg.data);
          if (activeThread.op) activeThread.op.reply_count = (activeThread.op.reply_count || 0) + 1;
        }
      }
      // Update OP reply count in feed data
      if (replyTo) {
        const parent = feedMessages.find(m => m.base36_id === replyTo);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
      }

      if (currentTab === 'feed') {
        renderFeed();
      } else {
        updateTabIndicator('feed');
        // Inline notification in chat (routed through toggle system)
        const f = msg.data;
        const t = new Date(f.created_at).getTime();
        if (!isNaN(t)) {
          const notifType = f.is_thread_op ? 'mop' : (f.is_op != null ? !!f.is_op : !f.reply_to) ? 'op' : 're'
          injectInlineNotif(notifType, {
            type: 'feed-post',
            base36_id: f.base36_id,
            feedUser: f.username || f.display_name || 'anon',
            text: f.content || '',
            color: f.user_color || '#fff',
            time: t,
            heat: f.heat || 0,
            reply_to: f.reply_to,
            emote_refs: f.emote_refs,
            is_op: f.is_op,
            is_thread_op: f.is_thread_op
          })
        }
      }
    }
    if (msg.type === 'dm_new' && msg.data) {
      handleIncomingDm(msg.data)
    }
    if (msg.type === 'youtube_chat_message') {
      const targetChannelId = msg.channelId
      // Dedup against message buffer (survives WS reconnects unlike 5s hash)
      if (targetChannelId && isYtDuplicate(msg.user, msg.text, targetChannelId)) return

      const ytMsg = {
        user: msg.user,
        text: msg.text,
        color: msg.color || '#ff0000',
        channel: 'youtube',
        time: msg.time,
        platform: 'youtube',
        emotes: msg.emotes || [],
        msgType: msg.msgType || 'text',
        amount: msg.amount || '',
        scColor: msg.scColor || '',
        sticker: msg.sticker || null,
        avatar: msg.avatar || undefined,
        badges: msg.badges || undefined,
        systemMsg: msg.systemMsg || undefined,
      }

      if (targetChannelId && targetChannelId !== 'global') {
        // Per-channel YouTube → route to that channel tab
        if (!channelYtMessages.has(targetChannelId)) channelYtMessages.set(targetChannelId, [])
        const buf = channelYtMessages.get(targetChannelId)
        buf.push(ytMsg)
        if (buf.length > MAX_BUFFER + 50) buf.splice(0, buf.length - MAX_BUFFER)
        if (currentTab === targetChannelId) {
          appendMessage(ytMsg, targetChannelId) || renderMessages(currentTab)
        } else {
          updateTabIndicator(targetChannelId)
        }
      }
    }
    if (msg.type === 'youtube_status') {
      const targetChannelId = msg.channelId
      if (targetChannelId && targetChannelId !== 'global') {
        // Per-channel YouTube status
        const link = youtubeLinks.get(targetChannelId) || { url: '', videoId: '', channelName: '' }
        if (msg.status === 'connected') {
          link.videoId = msg.videoId || ''
          link.channelName = msg.channelName || ''
          youtubeLinks.set(targetChannelId, link)
          log('YouTube connected for channel', targetChannelId, ':', link.channelName)
        }
        // Show status in channel tab if viewing it
        if (currentTab === targetChannelId) {
          const msgsEl = document.getElementById('hs-mc-messages')
          if (msgsEl && msg.status === 'connected' && !(channelYtMessages.get(targetChannelId)?.length)) {
            const el = document.createElement('div')
            el.className = 'hs-mc-empty'
            el.textContent = 'youtube connected: ' + (link.channelName || msg.videoId) + ' — waiting for messages...'
            msgsEl.appendChild(el)
            trimChildren(msgsEl, 150)
          } else if (msgsEl && (msg.status === 'ended' || msg.status === 'error')) {
            const el = document.createElement('div')
            el.className = 'hs-mc-empty'
            el.textContent = msg.status === 'ended' ? 'youtube stream ended' : (msg.error || 'youtube connection error')
            el.style.color = '#ff4444'
            msgsEl.appendChild(el)
            trimChildren(msgsEl, 150)
          }
        }
      }
    }
    if (msg.type === 'message-updated' && msg.data) {
      const uid = msg.data.base36_id;
      const idx = feedMessages.findIndex(m => m.base36_id === uid);
      if (idx >= 0) Object.assign(feedMessages[idx], msg.data);
      if (activeThread && activeThread.op && activeThread.op.base36_id === uid) {
        Object.assign(activeThread.op, msg.data);
      }
    }
    if (msg.type === 'notification:new') {
      unreadNotifCount++;
      updateNotifBadge();
    }
  });
}

// Update notif tab badge (reuse existing element to avoid DOM churn)
function updateNotifBadge() {
  if (!tabBarElement) return
  const tab = tabBarElement.querySelector('[data-tab="mentions"]')
  if (!tab) return
  // Remove any legacy badge element
  const badge = tab.querySelector('.hs-badge')
  if (badge) badge.remove()
  // Just use color indicator — no counter
  tab.classList.toggle('has-new', unreadNotifCount > 0)
}

// ---- FEED ----

async function fetchFeed(append = false) {
  if (feedLoading) return;
  feedLoading = true;
  const page = append ? feedPage + 1 : 1;
  const resp = await apiFetch(`/api/messages?sort=time&limit=30&page=${page}&following=true`, { auth: true });
  feedLoading = false;
  if (!resp.ok) {
    console.error('[heatsync-mc] Feed fetch failed — full resp:', JSON.stringify(resp));
    if (currentTab === 'feed') {
      const msgsEl = document.getElementById('hs-mc-messages');
      if (msgsEl && feedMessages.length === 0) {
        msgsEl.innerHTML = `<div class="hs-mc-empty">failed to load feed${resp.status === 401 ? ' — log in at heatsync.org' : ''}</div>`;
      }
    }
    return;
  }
  const msgs = (resp.data?.messages || []).filter(m => m.username !== 'Anonymous')
  if (append) {
    feedMessages.push(...msgs);
    feedPage = page;
  } else {
    feedMessages = msgs;
    feedPage = 1;
  }
  feedHasMore = resp.data?.pagination?.hasMore ?? msgs.length >= 30;
  feedLoaded = true;
  feedLastFetch = Date.now();
  if (currentTab === 'feed') renderFeed();
}

function renderFeed() {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Update feed tab button text
  const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
  if (feedTabBtn) feedTabBtn.textContent = activeThread ? '<- back' : 'feed';

  // Thread view — show OP + replies
  if (activeThread) {
    renderThreadView(msgsEl);
    return;
  }

  // Feed list view
  const isStale = feedLoaded && (Date.now() - feedLastFetch > FEED_STALE_MS);
  if ((!feedLoaded || isStale) && !feedLoading) {
    msgsEl.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = 'loading following feed...';
    msgsEl.appendChild(loading);
    fetchFeed();
    return;
  }

  if (feedMessages.length === 0) {
    msgsEl.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'no posts yet';
    msgsEl.appendChild(empty);
    return;
  }

  isProgrammaticScroll = true;
  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();
  const feedToRender = feedMessages.slice(-150);
  let zebraCount = 0;
  for (const m of feedToRender) {
    const msgDiv = buildFeedMessageDiv(m);
    if (zebraEnabled && ++zebraCount % 2 === 0) msgDiv.classList.add('hs-mc-zebra');
    frag.appendChild(msgDiv);
  }
  if (feedHasMore) {
    const loader = document.createElement('div');
    loader.className = 'hs-mc-empty hs-feed-loader';
    loader.textContent = 'scroll for more...';
    frag.appendChild(loader);
  }
  msgsEl.appendChild(frag);

  isProgrammaticScroll = true;
  msgsEl.scrollTop = 0;
  requestAnimationFrame(() => { isProgrammaticScroll = false; });

  // Setup infinite scroll
  if (!msgsEl._hsFeedScroll) {
    msgsEl._hsFeedScroll = true;
    let feedScrollTimer = null
    msgsEl.addEventListener('scroll', () => {
      if (mcSignal?.aborted) return;
      if (currentTab !== 'feed' || feedLoading || !feedHasMore) return;
      if (feedScrollTimer) return // Throttle: one check per 200ms
      feedScrollTimer = cleanup.setTimeout(() => {
        feedScrollTimer = null
        const { scrollTop, scrollHeight, clientHeight } = msgsEl;
        if (scrollHeight - scrollTop - clientHeight < 100) {
          fetchFeed(true);
        }
      }, 200)
    });
  }
}

function buildFeedMessageDiv(m, opUsername) {
  const div = document.createElement('div');
  div.className = 'hs-feed-msg';
  div.dataset.msgId = m.base36_id;

  const time = formatRelativeTime(m.created_at);
  const avatarUrl = `https://heatsync.org/api/avatar/${encodeURIComponent(m.username)}`;
  const heat = m.heat || 0;
  const replies = m.reply_count || 0;
  // renderFeedContent sanitizes via escapeHtml + emote ref escaping
  const content = renderFeedContent(m.content, m.emote_refs);

  // Thread link: >>id — always expands thread inline (never navigates away)
  const shortId = (m.base36_id || '').replace(/^0+/, '') || '0';
  const inThread = !!opUsername;
  const threadLink = inThread
    ? `<span class="hs-feed-thread-link hs-quote-insert" data-quote-id="${escapeHtml(shortId)}" style="color:#ffff00;cursor:pointer">${escapeHtml(shortId)}</span>`
    : `<span class="hs-feed-thread-link hs-thread-toggle" style="cursor:pointer">&gt;&gt;${escapeHtml(shortId)}</span>`;

  // Post type tag: [OP] red = original post, [OP] magenta = OP replying in own thread, [RE] = reply
  const isOp = m.is_op != null ? !!m.is_op : (!m.reply_to || m.reply_to === '');
  const isThreadOp = m.is_thread_op != null ? !!m.is_thread_op
    : (opUsername && m.reply_to && m.username?.toLowerCase() === opUsername.toLowerCase());
  const typeTag = isThreadOp
    ? '<span class="hs-feed-tag hs-feed-tag-mop">[OP]</span>'
    : isOp
      ? '<span class="hs-feed-tag hs-feed-tag-op">[OP]</span>'
      : '<span class="hs-feed-tag hs-feed-tag-re">[RE]</span>';

  const isAnon = !m.platform || m.username === 'Anonymous';

  // Platform badge: [T]/[K]/[YT] (hidden for anonymous)
  const platLabel = m.platform === 'kick' ? '[K]' : m.platform === 'youtube' ? '[YT]' : m.platform === 'twitch' ? '[T]' : '';
  const platColors = { twitch: '#9146ff', kick: '#53fc18', youtube: '#ff0000' };
  const platBadge = platLabel ? `<span class="hs-feed-tag" style="color:${platColors[m.platform]}">${platLabel}</span>` : '';

  const timeHtml = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(time)}</span>` : '';

  // All dynamic values sanitized: avatarUrl via encodeURIComponent,
  // username/time via escapeHtml, color via sanitizeColor, content via renderFeedContent
  const hd = getHeatDisplay(heat)
  if (hd) {
    let rowStyle = `border-left:${hd.borderWidth}px solid ${hd.border};`
    if (hd.bg) rowStyle += `background:${hd.bg};`
    if (hd.breathe) div.className += ' hs-feed-heat-breathe'
    div.setAttribute('style', rowStyle)
  }
  const heatSpan = hd ? `<span class="hs-feed-stat hs-feed-heat" style="font-weight:700;color:${hd.color}${hd.glow ? ';text-shadow:0 0 8px #ff8700,0 0 16px rgba(255,135,0,0.6)' : ''}">${heat}${hd.suffix}</span>` : ''
  const repliesSpan = replies > 0 ? `<span class="hs-feed-stat hs-feed-replies" title="replies">💬${replies}</span>` : '';
  const stats = [heatSpan, repliesSpan].filter(Boolean).join(' ')
  const statsHtml = stats ? ` ${stats}` : ''

  const anonAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="https://heatsync.org/anon.webp" alt="" loading="lazy">` : '';
  const userAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="${avatarUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  const userHtml = isAnon
    ? `${anonAvatar}<span class="hs-feed-user" style="color:#808080">Anonymous</span>`
    : `${userAvatar}<a href="https://heatsync.org/user/${encodeURIComponent(m.username)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml((m.username || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.user_color || '#fff')}">${escapeHtml(m.username || 'anon')}</a>`;

  div.innerHTML = `${timeHtml}${threadLink}${typeTag}${platBadge}${userHtml}${statsHtml}: <span class="hs-feed-body">${content}</span>`;

  // Click >>id to expand/collapse thread inline — never leaves the stream
  // If this post is a reply, open the parent thread and highlight this post
  const threadLinkEl = div.querySelector('.hs-thread-toggle');
  if (threadLinkEl) {
    threadLinkEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const threadId = m.reply_to || m.base36_id;
      const highlightId = m.reply_to ? m.base36_id : null;
      toggleThread(threadId, highlightId);
    });
  }
  const repliesEl = div.querySelector('.hs-feed-replies');
  if (repliesEl && replies > 0) {
    repliesEl.style.cursor = 'pointer';
    repliesEl.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleThread(m.reply_to || m.base36_id);
    });
  }

  // Click >>id post-links in message content
  div.querySelectorAll('.hs-post-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const targetId = link.dataset.id;
      if (!targetId) return;
      // Find the target in feedMessages to determine its thread
      const target = feedMessages.find(f => f.base36_id === targetId);
      const threadId = target ? (target.reply_to || target.base36_id) : targetId;
      openThread(threadId, targetId);
    });
  });

  // Click post ID in thread view → insert >>id into input
  const quoteEl = div.querySelector('.hs-quote-insert');
  if (quoteEl) {
    quoteEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const qid = quoteEl.dataset.quoteId;
      if (!qid) return;
      const input = document.getElementById('hs-mc-input');
      if (!input) return;
      const quote = `>>${qid} `;
      if (wysiwygEnabled) {
        input.focus();
        document.execCommand('insertText', false, quote);
      } else {
        const pos = input.selectionStart || input.value.length;
        input.value = input.value.slice(0, pos) + quote + input.value.slice(pos);
        input.focus();
        input.selectionStart = input.selectionEnd = pos + quote.length;
      }
    });
  }

  return div;
}

// Format text with markdown-style syntax (matches heatsync.org rendering)
// Must be called AFTER escapeHtml — operates on escaped HTML strings
function formatText(html) {
  // Greentext: >text< (escaped as &gt;text&lt;)
  html = html.replace(/(&gt;)([^<>&]+)(&lt;)/g, '<span class="hs-greentext">&gt;$2&lt;</span>')
  // Inline code: `text`
  html = html.replace(/`([^`]+)`/g, '<code class="hs-inline-code">$1</code>')
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')
  // Italic: *text* or _text_ (not if part of bold)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>')
  // Strikethrough: ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  // Spoilers: ||text||
  html = html.replace(/\|\|(.+?)\|\|/g, '<span class="hs-spoiler">$1</span>')
  return html
}

function renderFeedContent(content, emoteRefs) {
  if (!content) return '';
  let html = escapeHtml(String(content));
  // Text formatting (bold, italic, spoilers, etc.)
  html = formatText(html)
  // Linkify URLs BEFORE emote replacement (avoids corrupting img src attributes)
  // Split by HTML tags to only linkify text segments (like heatsync.org does)
  if (linksEnabled) {
    const parts = html.split(/(<[^>]+>)/)
    html = parts.map((part, i) => {
      if (i % 2 === 1) return part // skip HTML tags
      part = part.replace(/(https?:\/\/[^\s<"]+)/gi, '<a href="$1" target="_blank" rel="noopener" class="hs-mc-link">$1</a>')
      part = part.replace(/(?<!\/\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<"]*)/gi, (m) => {
        return `<a href="https://${m}" target="_blank" rel="noopener" class="hs-mc-link">${m}</a>`
      })
      return part
    }).join('')
  }
  // Parse >>id post-links (like website does)
  html = html.replace(/(?:&gt;&gt;|>>)(\w{1,6})/g, (match, id) => {
    const paddedId = id.padStart(6, '0');
    const displayId = id.replace(/^0+/, '') || '0';
    return `<span class="hs-post-link" data-id="${paddedId}" style="cursor:pointer">&gt;&gt;${displayId}</span>`;
  });

  // Render emote refs as inline images (AFTER linkification so img tags aren't corrupted)
  // emote_refs can be { name: url } or { name: { url, hash, name, provider } }
  if (emoteRefs && typeof emoteRefs === 'object') {
    for (const [name, val] of Object.entries(emoteRefs)) {
      const url = typeof val === 'string' ? val : val?.url
      if (!url) continue
      const escaped = escapeHtml(name);
      const safeUrl = escapeHtml(url);
      html = html.replace(
        new RegExp(`\\b${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
        `<img class="hs-mc-emote" src="${safeUrl}" alt="${escaped}" title="${escaped}" loading="lazy">`
      );
    }
  }
  return html;
}

function formatRelativeTime(isoDate) {
  if (!isoDate) return '';
  return formatRelativeMs(Date.now() - new Date(isoDate).getTime());
}

function formatRelativeMs(diff) {
  if (diff < 0) return 'now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatTimeFromTs(ts) {
  if (!ts) return '';
  return formatRelativeMs(Date.now() - ts);
}

// Refresh timestamps every 30s — lightweight DOM-only update, no rebuild
cleanup.setInterval(() => {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;
  const now = Date.now();
  for (const el of msgsEl.querySelectorAll('.hs-mc-ts[data-ts]')) {
    const ts = parseInt(el.dataset.ts);
    if (ts) {
      const newText = formatRelativeMs(now - ts);
      if (el.textContent !== newText) el.textContent = newText;
    }
  }
}, 30000);

// Open thread view — replaces feed with OP + replies + reply input
async function openThread(msgId, highlightId) {
  // Find OP in feed or fetch it
  let op = feedMessages.find(m => m.base36_id === msgId);
  activeThread = { id: msgId, op: op || null, replies: [], loading: true, highlightId: highlightId || null };
  renderFeed();

  const resp = await apiFetch(`/api/messages/${msgId}/replies`);
  if (resp.ok) {
    activeThread.replies = resp.data?.replies || [];
  }
  activeThread.loading = false;
  renderFeed();

  // Scroll to and highlight the target post
  if (highlightId) {
    const msgsEl = document.getElementById('hs-mc-messages');
    const target = msgsEl?.querySelector(`[data-msg-id="${highlightId}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'center' });
      target.classList.add('hs-post-highlight');
      setTimeout(() => target.classList.remove('hs-post-highlight'), 1000);
    }
  }
}

function closeThread() {
  activeThread = null;
  renderFeed();
}

function toggleThread(msgId, highlightId) {
  if (activeThread && activeThread.id === msgId && !highlightId) {
    closeThread();
  } else {
    openThread(msgId, highlightId);
  }
}

// Render the thread view (OP + replies + back button)
function renderThreadView(msgsEl) {
  const t = activeThread;
  isProgrammaticScroll = true;
  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  // OP message
  if (t.op) {
    const opDiv = buildFeedMessageDiv(t.op, t.op?.username);
    opDiv.classList.add('hs-thread-op');
    frag.appendChild(opDiv);
  }

  // Thread container with replies
  const container = document.createElement('div');
  container.className = 'hs-thread-container';
  container.dataset.thread = t.id;

  if (t.loading) {
    const loading = document.createElement('div');
    loading.className = 'hs-mc-empty';
    loading.textContent = 'loading...';
    loading.style.fontSize = '11px';
    container.appendChild(loading);
  } else if (t.replies.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'no replies yet';
    empty.style.fontSize = '11px';
    container.appendChild(empty);
  } else {
    for (const r of t.replies) {
      const replyDiv = buildFeedMessageDiv(r, t.op?.username);
      replyDiv.classList.add('hs-thread-reply');
      if (r.is_thread_op) replyDiv.classList.add('is-thread-op');
      container.appendChild(replyDiv);
    }
  }
  frag.appendChild(container);
  msgsEl.appendChild(frag);

  isProgrammaticScroll = true;
  msgsEl.scrollTop = 0;
  requestAnimationFrame(() => { isProgrammaticScroll = false; });
}

async function postFeedMessage(text, { topLevel = false } = {}) {
  const input = document.getElementById('hs-mc-input');
  if (!input) return;

  if (!hsAuthToken) {
    if (wysiwygEnabled) {
      input.dataset.placeholder = 'log in at heatsync.org first';
    } else {
      input.placeholder = 'log in at heatsync.org first';
    }
    setTimeout(() => updateInputPlaceholder(), 2000);
    return;
  }

  const body = { content: text };
  // In thread view, global input posts as a reply to the active thread
  if (activeThread) {
    body.reply_to = activeThread.id;
  }

  const resp = await apiFetch('/api/messages', { method: 'POST', auth: true, body });
  if (resp.ok) {
    if (wysiwygEnabled) {
      input.innerHTML = '';
    } else {
      input.value = '';
    }
    pendingMessage = '';
    updateCharCount();
    hideInputBar();
    // Insert own post immediately from response (fetchFeed unreliable — service worker gets killed)
    const posted = resp.data?.message
    if (posted) {
      if (!feedMessages.some(f => f.base36_id === posted.base36_id)) {
        feedMessages.unshift(posted)
        if (feedMessages.length > 150) feedMessages.pop()
      }
      // If in thread view, append reply to the thread
      if (activeThread && activeThread.id === posted.reply_to) {
        if (!activeThread.replies.some(r => r.base36_id === posted.base36_id)) {
          activeThread.replies.push(posted)
        }
        // Update OP reply count
        if (activeThread.op) activeThread.op.reply_count = (activeThread.op.reply_count || 0) + 1;
        const parent = feedMessages.find(m => m.base36_id === activeThread.id);
        if (parent) parent.reply_count = (parent.reply_count || 0) + 1;
      }
    }
    if (currentTab === 'feed') renderFeed()
  } else {
    input.style.borderColor = '#f44';
    const errMsg = resp.status === 401 ? 'log in first'
      : resp.status === 429 ? 'slow down'
      : resp.status === 409 ? 'duplicate message'
      : 'failed to post';
    showToast(errMsg);
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    log('Post failed:', resp.status || resp.error);
  }
}

// ---- NOTIFICATIONS ----

async function fetchNotifications() {
  try {
    const resp = await apiFetch('/api/notifications');
    if (resp.ok) {
      notifications = resp.data || { mentions: 0, op_replies: 0, re_replies: 0, total: 0 };
      unreadNotifCount = notifications.total || 0;
      updateNotifBadge();
    } else if (resp.status === 401) {
      notifLoaded = true;
      return; // Not logged in
    }
    // Fetch actual notification messages (mentions, op replies, re replies)
    const msgResp = await apiFetch('/api/messages?filter_type=mentions&limit=20');
    if (msgResp.ok) {
      notifMessages = msgResp.data?.messages || [];
    }
  } catch (e) {
    log('Notification fetch error:', e);
  }
  notifLoaded = true;
}

function renderActivity() {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Hide resume button on initial render (shown only when new content arrives while scrolled)
  if (!isScrolledUp) {
    const newBtn = document.getElementById('hs-mc-new-msgs');
    if (newBtn) newBtn.style.display = 'none';
  }

  if (!hsAuthToken && activityEvents.length === 0) {
    msgsEl.innerHTML = '<div class="hs-mc-empty">log in at <a href="https://heatsync.org" target="_blank" style="color:#ff6b35">heatsync.org</a> to see activity</div>';
    return;
  }

  if (hsAuthToken && !notifLoaded) {
    msgsEl.innerHTML = '<div class="hs-mc-empty">loading...</div>';
    fetchNotifications().then(() => {
      if (currentTab === 'activity') renderActivity();
    });
    return;
  }

  // Mark notifs as read when viewing
  if (unreadNotifCount > 0) {
    apiFetch('/api/notifications/mark-read', { method: 'POST', body: { type: 'all' } });
    unreadNotifCount = 0;
    updateNotifBadge();
    try { chrome.runtime.sendMessage({ type: 'notifs_viewed' }); } catch (e) {}
  }

  // Merge notifMessages + activityEvents, sort descending by time
  const normalized = [
    ...notifMessages.map(m => ({ ...m, _time: new Date(m.created_at).getTime(), _src: 'notif' })),
    ...activityEvents.map(m => ({ ...m, _time: m.time, _src: 'event' }))
  ];
  normalized.sort((a, b) => b._time - a._time);
  const merged = normalized.slice(0, 150);

  if (merged.length === 0) {
    msgsEl.innerHTML = '<div class="hs-mc-empty">no activity yet</div>';
    return;
  }

  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  // Summary header (notifs only)
  if (notifications.total > 0) {
    const header = document.createElement('div');
    header.className = 'hs-notif-header';
    const parts = [];
    if (notifications.mentions > 0) parts.push(`${notifications.mentions} mention${notifications.mentions > 1 ? 's' : ''}`);
    if (notifications.op_replies > 0) parts.push(`${notifications.op_replies} OP repl${notifications.op_replies > 1 ? 'ies' : 'y'}`);
    if (notifications.re_replies > 0) parts.push(`${notifications.re_replies} RE repl${notifications.re_replies > 1 ? 'ies' : 'y'}`);
    header.textContent = parts.join(', ');
    frag.appendChild(header);
  }

  for (const m of merged) {
    if (m._src === 'event') {
      const div = document.createElement('div');
      div.className = `hs-mc-stream-event ${m.eventClass || ''}`;
      const ts = formatRelativeMs(Date.now() - m.time);
      const tsSpan = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(ts)}</span>` : '';
      // Show channel name in magenta for activity context
      // Strip [channel] prefix from follow events (we add our own #channel)
      let evtText = m.text
      if (m.channel) evtText = evtText.replace(new RegExp(`^\\[${m.channel}\\]\\s*`), '')
      const chanColor = _profileCache.get(m.channel?.toLowerCase())?.profile?.twitch_color || '#fff';
      const chanLabel = m.channel ? `<a href="https://heatsync.org/twitch/${encodeURIComponent(m.channel)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml(m.channel.toLowerCase())}" style="color:${sanitizeColor(chanColor)};font-weight:bold">${escapeHtml(m.channel)}</a> ` : '';
      let evtHtml = escapeHtml(evtText)
      evtHtml = evtHtml.replace(/(switched to |went live \u2014 )(.+)$/, '$1<span style="color:#fff">$2</span>')
      div.innerHTML = `${tsSpan}${chanLabel}${evtHtml}`;
      frag.appendChild(div);
    } else {
      frag.appendChild(buildNotifDiv(m));
    }
  }
  msgsEl.appendChild(frag);
}

function buildNotifDiv(m) {
  const div = document.createElement('div');
  div.className = 'hs-notif';
  const time = formatRelativeTime(m.created_at);
  // Safe: renderFeedContent escapes via escapeHtml first, then adds safe formatting tags
  const content = renderFeedContent(m.content, m.emote_refs);

  // Safe: username through escapeHtml+encodeURIComponent, time through escapeHtml, content through renderFeedContent (which escapes via escapeHtml then adds safe formatting)
  const tsHtml = window._hsTimestampsEnabled !== false ? `<span class="hs-feed-time">${escapeHtml(time)}</span>` : '';
  div.innerHTML = `${tsHtml}<a href="https://heatsync.org/user/${encodeURIComponent(m.username)}" target="_blank" class="hs-feed-user hs-mc-user" data-username="${escapeHtml((m.username || 'anon').toLowerCase())}" style="color:${sanitizeColor(m.user_color || '#fff')}">${escapeHtml(m.username || 'anon')}</a>: <span class="hs-feed-body">${content}</span>`;

  // Click to switch to feed and show this thread (but not if clicking interactive content)
  div.addEventListener('click', (e) => {
    const spoiler = e.target.closest('.hs-spoiler')
    if (spoiler) { spoiler.classList.toggle('revealed'); return }
    if (e.target.closest('a, .hs-mc-emote, .hs-mc-link')) return
    const threadId = m.reply_to || m.base36_id;
    switchTab('feed');
    openThread(threadId);
  });

  return div;
}

