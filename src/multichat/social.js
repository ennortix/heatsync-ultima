// Social - feed, notifications, activity, heatsync API
let _autoYtVideoId = null  // videoId for this tab's __live_yt_auto__ subscription (cross-tab filter)

// Heat tier display — big scaling numbers + color glow + row effects, no emoji
// Matches website colors.js: #444 → #888 → #cc6600 → #ff8700 → #ffaa33 → #fff
function formatHeat(heat) {
  if (heat >= 1000) {
    const k = heat / 1000
    const f = k.toFixed(1)
    return f.endsWith('.0') ? f.slice(0, -2) + 'k' : f + 'k'
  }
  return String(heat)
}

function getHeatNumberStyle(heat, isReply) {
  let fontSize, color, textShadow, animation
  if (isReply) {
    if (heat > 500) fontSize = 20
    else if (heat > 100) fontSize = 18
    else if (heat > 50) fontSize = 16
    else if (heat > 10) fontSize = 14
    else fontSize = 12
  } else {
    if (heat > 500) fontSize = 32
    else if (heat > 100) fontSize = 26
    else if (heat > 50) fontSize = 22
    else if (heat > 10) fontSize = 18
    else fontSize = 14
  }
  if (heat > 500) {
    color = '#fff'
    textShadow = '0 0 6px rgba(255,255,255,1),0 0 15px rgba(255,200,100,1),0 0 30px rgba(255,135,0,0.9),0 0 50px rgba(255,80,0,0.6)'
    animation = 'hs-heat-breathe 2s ease-in-out infinite'
  } else if (heat > 100) {
    color = '#ffaa33'
    textShadow = '0 0 6px rgba(255,170,50,0.9),0 0 16px rgba(255,135,0,0.6),0 0 30px rgba(255,80,0,0.3)'
  } else if (heat > 50) {
    color = '#ff8700'
    textShadow = '0 0 6px rgba(255,135,0,0.7),0 0 14px rgba(255,135,0,0.3)'
  } else if (heat > 10) {
    color = heat > 30 ? '#cc6600' : '#888'
    textShadow = heat > 30 ? '0 0 4px rgba(204,102,0,0.3)' : undefined
  } else {
    color = '#444'
    textShadow = undefined
  }
  let style = `font-size:${fontSize}px;color:${color};font-weight:900;line-height:1;`
  if (textShadow) style += `text-shadow:${textShadow};`
  if (animation) style += `animation:${animation};`
  return style
}

function getHeatDisplay(heat) {
  if (!heat || heat <= 0) return null
  let border = '#444', borderWidth = 2, bg = ''
  if (heat >= 500) {
    border = '#fff'; borderWidth = 4
    bg = 'rgba(60,20,0,0.15)'
  } else if (heat >= 100) {
    border = '#ffaa33'; borderWidth = 3
    bg = 'rgba(50,15,0,0.10)'
  } else if (heat >= 25) {
    border = '#ff8700'; borderWidth = 3
    bg = 'rgba(40,12,0,0.07)'
  } else if (heat >= 10) {
    border = '#ff8700'; borderWidth = 2
  } else {
    border = '#444'; borderWidth = 2
  }
  const suffix = heat >= 10 ? '°' : ''
  const breathe = heat >= 500
  return { suffix, border, borderWidth, bg, breathe }
}

// Feed & notifications state
let feedMessages = [];
let feedLoaded = false;
let feedLoading = false;
let feedPage = 1;
let feedHasMore = true;
let feedLastFetch = 0; // Timestamp of last feed fetch
const FEED_STALE_MS = 120000; // 2 minutes

// Engagement state — optimistic local cache
const feedLiked = new Set()     // base36_ids the user has liked
const feedBookmarked = new Set() // base36_ids the user has bookmarked
const feedReactionsCache = new Map() // base36_id → [{ emote_id, emote_url, emote_name, count, user_reacted }]
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
let hsCurrentUsername = null; // Heatsync username (loaded from storage user_info)

// Load + watch heatsync username for own-post detection (edit/delete UI)
async function loadHsUsername() {
  try {
    const data = await api.storage.local.get('user_info')
    hsCurrentUsername = data?.user_info?.username?.toLowerCase() || null
  } catch (e) { hsCurrentUsername = null }
}
function isOwnFeedPost(m) {
  return !!(hsCurrentUsername && m?.username && m.username.toLowerCase() === hsCurrentUsername)
}

const EDIT_WINDOW_MS = 10 * 60 * 1000 // 10 min — server enforces

// Inline edit UI for own feed posts
function showFeedEditUI(div, msg) {
  if (div.querySelector('.hs-feed-edit-form')) return
  const body = div.querySelector('.hs-feed-body')
  if (!body) return
  const original = msg.content || ''
  const form = document.createElement('div')
  form.className = 'hs-feed-edit-form'
  form.style.cssText = 'display:flex;gap:4px;align-items:flex-start;margin-top:4px;'
  const ta = document.createElement('textarea')
  ta.value = original
  ta.maxLength = 500
  ta.rows = 2
  ta.style.cssText = 'flex:1;background:#000;color:#fff;border:1px solid #808080;padding:4px;font-family:inherit;font-size:13px;resize:vertical;'
  const saveBtn = document.createElement('button')
  saveBtn.textContent = 'save'
  saveBtn.style.cssText = 'background:#ff8700;color:#000;border:none;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer;'
  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'cancel'
  cancelBtn.style.cssText = 'background:#000;color:#fff;border:1px solid #808080;padding:4px 8px;font-family:inherit;font-size:12px;cursor:pointer;'
  const errEl = document.createElement('div')
  errEl.style.cssText = 'font-size:11px;color:#ff4444;margin-top:2px;'
  form.append(ta, saveBtn, cancelBtn)
  body.style.display = 'none'
  body.parentNode.insertBefore(form, body.nextSibling)
  body.parentNode.insertBefore(errEl, form.nextSibling)
  ta.focus()
  ta.select()

  const close = () => {
    body.style.display = ''
    form.remove()
    errEl.remove()
  }
  cancelBtn.addEventListener('click', close)
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveBtn.click() }
  })
  saveBtn.addEventListener('click', async () => {
    const newContent = ta.value.trim()
    if (!newContent) { errEl.textContent = 'content cannot be empty'; return }
    if (newContent === original) { close(); return }
    saveBtn.disabled = true
    saveBtn.textContent = 'saving...'
    errEl.textContent = ''
    const resp = await apiFetch(`/api/messages/${encodeURIComponent(msg.base36_id)}`, {
      method: 'PATCH',
      body: { content: newContent }
    })
    if (resp?.ok && resp.data?.success) {
      msg.content = resp.data.message?.content || newContent
      msg.edited_at = resp.data.message?.edited_at
      msg.edit_count = resp.data.message?.edit_count
      close()
      // Re-render entire feed to pick up sanitized content + emote refs
      if (typeof renderFeed === 'function') renderFeed()
    } else {
      errEl.textContent = resp?.data?.error || resp?.error || 'edit failed'
      saveBtn.disabled = false
      saveBtn.textContent = 'save'
    }
  })
}

async function deleteFeedPost(msg) {
  if (!confirm('delete this post?')) return
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msg.base36_id)}`, {
    method: 'DELETE'
  })
  if (resp?.ok) {
    const div = document.querySelector(`.hs-feed-msg[data-msg-id="${CSS.escape(msg.base36_id)}"]`)
    if (div) div.remove()
    const idx = feedMessages.findIndex(m => m.base36_id === msg.base36_id)
    if (idx >= 0) feedMessages.splice(idx, 1)
  }
}

function showFeedPostContextMenu(e, div, msg) {
  e.preventDefault()
  e.stopPropagation()
  document.getElementById('hs-mc-ctx-menu')?.remove()
  const menu = document.createElement('div')
  menu.id = 'hs-mc-ctx-menu'
  menu.style.cssText = 'position:fixed;z-index:99999;background:#000;border:1px solid #808080;border-radius:0;padding:4px 0;min-width:120px;font-size:12px;font-family:inherit;'

  const createdAt = new Date(msg.created_at).getTime()
  const elapsed = Date.now() - createdAt
  const remaining = EDIT_WINDOW_MS - elapsed
  const canEdit = remaining > 0

  const mkItem = (label, color, fn, disabled) => {
    const item = document.createElement('div')
    item.textContent = label
    item.style.cssText = `padding:6px 12px;cursor:${disabled ? 'not-allowed' : 'pointer'};color:${color};opacity:${disabled ? 0.5 : 1};`
    if (!disabled) {
      item.addEventListener('mouseenter', () => item.style.background = 'rgba(255,255,255,0.06)')
      item.addEventListener('mouseleave', () => item.style.background = '')
      item.addEventListener('click', () => { menu.remove(); fn() })
    }
    menu.appendChild(item)
  }

  if (canEdit) {
    const mins = Math.floor(remaining / 60000)
    const secs = Math.floor((remaining % 60000) / 1000)
    mkItem(`edit (${mins}:${String(secs).padStart(2, '0')} left)`, '#fff', () => showFeedEditUI(div, msg))
  } else {
    mkItem('edit (window expired)', '#fff', () => {}, true)
  }
  mkItem('delete', '#ff4444', () => deleteFeedPost(msg))

  document.body.appendChild(menu)
  const mw = menu.offsetWidth, mh = menu.offsetHeight
  menu.style.left = Math.min(e.clientX, window.innerWidth - mw - 4) + 'px'
  menu.style.top = Math.min(e.clientY, window.innerHeight - mh - 4) + 'px'
  const dismiss = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', dismiss) } }
  setTimeout(() => document.addEventListener('click', dismiss, { signal: mcSignal }), 0)
}

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
  loadHsUsername()

  // Watch for auth changes (login/logout on heatsync.org)
  if (!window._hsMcAuthWatcher) {
    window._hsMcAuthWatcher = true;
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.user_info) {
        hsCurrentUsername = changes.user_info.newValue?.username?.toLowerCase() || null
      }
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
    if (msg.type === 'message-edited' && msg.data) {
      const d = msg.data.message_id ? msg.data : msg.data.data
      const id = d?.message_id
      if (!id) return
      // Update feedMessages buffer
      const found = feedMessages.find(m => m.base36_id === id)
      if (found) {
        found.content = d.content
        found.subject = d.subject
        found.edited_at = d.edited_at
        found.edit_count = d.edit_count
      }
      // Update active thread if applicable
      if (activeThread) {
        if (activeThread.op?.base36_id === id) {
          activeThread.op.content = d.content
          activeThread.op.subject = d.subject
          activeThread.op.edited_at = d.edited_at
        }
        const reply = activeThread.replies?.find(r => r.base36_id === id)
        if (reply) {
          reply.content = d.content
          reply.edited_at = d.edited_at
        }
      }
      if (currentTab === 'feed') renderFeed()
    }
    if (msg.type === 'message-deleted' && msg.data) {
      const d = msg.data.message_id ? msg.data : msg.data.data
      const id = d?.message_id
      if (!id) return
      const idx = feedMessages.findIndex(m => m.base36_id === id)
      if (idx >= 0) feedMessages.splice(idx, 1)
      if (activeThread) {
        if (activeThread.op?.base36_id === id) {
          activeThread = null
        } else if (activeThread.replies) {
          const ri = activeThread.replies.findIndex(r => r.base36_id === id)
          if (ri >= 0) activeThread.replies.splice(ri, 1)
        }
      }
      if (currentTab === 'feed') renderFeed()
    }
    if (msg.type === 'youtube_chat_message') {
      const targetChannelId = msg.channelId
      // Filter __live_yt_auto__ messages: only accept if videoId matches this tab's subscription
      // (prevents cross-tab leaking — e.g., lofigirl YouTube showing on a Twitch tab)
      if (targetChannelId === '__live_yt_auto__') {
        if (!_autoYtVideoId) return  // no confirmed subscription yet — reject
        if (msg.videoId && msg.videoId !== _autoYtVideoId) return  // wrong video
      }
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
        // Auto-YouTube for live tab
        if (targetChannelId === '__live_yt_auto__') {
          if (!channelYtMessages.has(targetChannelId)) channelYtMessages.set(targetChannelId, [])
          const buf = channelYtMessages.get(targetChannelId)
          buf.push(ytMsg)
          if (buf.length > MAX_BUFFER + 50) buf.splice(0, buf.length - MAX_BUFFER)
          if (currentTab === 'live') {
            appendMessage(ytMsg, 'live') || renderMessages('live')
          } else {
            updateTabIndicator('live')
          }
        } else {
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
    }
    if (msg.type === 'youtube_status') {
      const targetChannelId = msg.channelId
      // Track auto-YouTube videoId for cross-tab filtering
      if (targetChannelId === '__live_yt_auto__' && msg.status === 'connected' && msg.videoId) {
        _autoYtVideoId = msg.videoId
        log('Auto YouTube videoId:', msg.videoId)
      }
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
  const tab = tabBarElement.querySelector('[data-tab="activity"]')
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
        msgsEl.innerHTML = `<div class="hs-mc-empty">${resp.status === 401 ? t('mc_social_failed_feed_auth') : t('mc_social_failed_feed')}</div>`;
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
  // Async: check bookmark state for loaded messages (non-blocking)
  const ids = msgs.map(msg => msg.base36_id).filter(Boolean)
  checkFeedBookmarks(ids)
}

function renderFeed() {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Update feed tab button text
  const feedTabBtn = tabBarElement?.querySelector('[data-tab="feed"]');
  if (feedTabBtn) feedTabBtn.textContent = activeThread ? t('mc_social_back') : t('mc_tab_feed');

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
    loading.textContent = t('mc_social_loading_feed');
    msgsEl.appendChild(loading);
    fetchFeed();
    return;
  }

  if (feedMessages.length === 0) {
    msgsEl.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = t('mc_social_no_posts');
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
    loader.textContent = t('mc_social_scroll_more');
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
    }, { signal: mcSignal, passive: true });
  }
}

// ---- ENGAGEMENT: heat, bookmark, reactions ----

// Batch-check bookmark status for a list of ids after feed loads
async function checkFeedBookmarks(ids) {
  if (!ids.length || !hsAuthToken) return
  try {
    const resp = await apiFetch('/api/bookmarks/check', { method: 'POST', auth: true, body: { messageIds: ids } })
    if (!resp.ok) return
    const list = resp.data?.bookmarked || resp.bookmarked || []
    feedBookmarked.clear()
    for (const id of list) feedBookmarked.add(id)
    for (const id of ids) {
      const btn = document.querySelector(`.hs-feed-bm-btn[data-id="${CSS.escape(id)}"]`)
      if (btn) _applyBookmarkState(btn, feedBookmarked.has(id))
    }
  } catch (e) { /* silent */ }
}

function _makeSvg(pathD, filled, size) {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size || 13))
  svg.setAttribute('height', String(size || 13))
  svg.setAttribute('class', 'hs-fe-icon')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', pathD)
  path.setAttribute('fill', filled ? '#ff8700' : 'none')
  path.setAttribute('stroke', filled ? '#ff8700' : '#808080')
  path.setAttribute('stroke-width', '2')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

function _applyBookmarkState(btn, active) {
  btn.classList.toggle('active', active)
  btn.title = active ? 'remove bookmark' : 'bookmark'
  const path = btn.querySelector('path')
  if (path) {
    path.setAttribute('fill', active ? '#ff8700' : 'none')
    path.setAttribute('stroke', active ? '#ff8700' : '#808080')
  }
}

function _applyHeatState(btn, active, count) {
  btn.classList.toggle('active', active)
  const path = btn.querySelector('path')
  if (path) {
    path.setAttribute('fill', active ? '#ff8700' : 'none')
    path.setAttribute('stroke', active ? '#ff8700' : '#808080')
  }
  const countEl = btn.querySelector('.hs-fe-count')
  if (countEl) countEl.textContent = count > 0 ? String(count) : ''
}

async function toggleHeat(msgId, btn, m) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  const wasLiked = feedLiked.has(msgId)
  const newLiked = !wasLiked
  const delta = newLiked ? 1 : -1
  if (newLiked) feedLiked.add(msgId); else feedLiked.delete(msgId)
  m.heat = (m.heat || 0) + delta
  _applyHeatState(btn, newLiked, m.heat)
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/like`, { method: 'POST', auth: true })
  if (!resp.ok) {
    if (newLiked) feedLiked.delete(msgId); else feedLiked.add(msgId)
    m.heat = (m.heat || 0) - delta
    _applyHeatState(btn, wasLiked, m.heat)
  }
}

async function toggleBookmark(msgId, btn) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  const wasBookmarked = feedBookmarked.has(msgId)
  const newState = !wasBookmarked
  if (newState) feedBookmarked.add(msgId); else feedBookmarked.delete(msgId)
  _applyBookmarkState(btn, newState)
  const method = newState ? 'POST' : 'DELETE'
  const resp = await apiFetch(`/api/bookmarks/${encodeURIComponent(msgId)}`, { method, auth: true })
  if (!resp.ok) {
    if (newState) feedBookmarked.delete(msgId); else feedBookmarked.add(msgId)
    _applyBookmarkState(btn, wasBookmarked)
  }
}

async function loadReactions(msgId, engageEl) {
  const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/reactions`, { auth: true })
  if (!resp.ok) return
  const reactions = resp.data?.reactions || resp.reactions || []
  feedReactionsCache.set(msgId, reactions)
  _renderReactionsIntoRow(engageEl, msgId, reactions)
}

function _makeReactChip(r, msgId, engageEl) {
  const chip = document.createElement('button')
  chip.className = 'hs-feed-react-chip' + (r.user_reacted ? ' active' : '')
  chip.title = r.emote_name || ''
  chip.dataset.emoteId = String(r.emote_id)
  const img = document.createElement('img')
  img.src = r.emote_url || ''
  img.alt = r.emote_name || ''
  img.className = 'hs-feed-react-img'
  const cnt = document.createElement('span')
  cnt.className = 'hs-fe-count'
  cnt.textContent = String(r.count)
  chip.appendChild(img)
  chip.appendChild(cnt)
  chip.addEventListener('click', (e) => {
    e.stopPropagation()
    const row = chip.closest('.hs-feed-react-row')
    handleReactionChip(msgId, r, chip, row, engageEl)
  })
  return chip
}

function _renderReactionsIntoRow(engageEl, msgId, reactions) {
  let row = engageEl.querySelector('.hs-feed-react-row')
  if (!row) return
  // Remove old chips (keep the "+" add button at end)
  const addBtn = row.querySelector('.hs-feed-react-add')
  row.textContent = ''
  for (const r of reactions) row.appendChild(_makeReactChip(r, msgId, engageEl))
  if (addBtn) row.appendChild(addBtn)
}

async function handleReactionChip(msgId, reaction, chip, row, engageEl) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  const wasReacted = reaction.user_reacted
  reaction.user_reacted = !wasReacted
  reaction.count = (reaction.count || 1) + (wasReacted ? -1 : 1)
  chip.classList.toggle('active', reaction.user_reacted)
  const countEl = chip.querySelector('.hs-fe-count')
  if (countEl) countEl.textContent = String(reaction.count)
  if (reaction.count <= 0) chip.remove()
  const method = wasReacted ? 'DELETE' : 'POST'
  const path = wasReacted
    ? `/api/messages/${encodeURIComponent(msgId)}/react/${encodeURIComponent(reaction.emote_id)}`
    : `/api/messages/${encodeURIComponent(msgId)}/react`
  const body = wasReacted ? undefined : { emote_id: reaction.emote_id }
  const resp = await apiFetch(path, { method, auth: true, body })
  if (!resp.ok) {
    reaction.user_reacted = wasReacted
    reaction.count = (reaction.count || 1) + (wasReacted ? 1 : -1)
    _renderReactionsIntoRow(engageEl, msgId, feedReactionsCache.get(msgId) || [])
  }
}

function openReactionPicker(e, msgId, engageEl) {
  if (!hsAuthToken) { showToast(t('mc_social_log_in_first')); return }
  document.getElementById('hs-mc-react-picker')?.remove()
  const emotes = []
  if (typeof emoteCache !== 'undefined') {
    for (const [name, data] of emoteCache) {
      if (data.url && data.source === 'heatsync') emotes.push({ name, url: data.url, id: data.id || name })
    }
  }
  if (!emotes.length) { showToast('no emotes available'); return }

  const picker = document.createElement('div')
  picker.id = 'hs-mc-react-picker'
  picker.className = 'hs-mc-react-picker'

  const searchEl = document.createElement('input')
  searchEl.type = 'text'
  searchEl.className = 'hs-mc-react-search'
  searchEl.placeholder = 'search emotes'
  const grid = document.createElement('div')
  grid.className = 'hs-mc-react-grid'
  picker.appendChild(searchEl)
  picker.appendChild(grid)

  function fillGrid(filter) {
    grid.textContent = ''
    const q = filter.toLowerCase()
    const shown = q ? emotes.filter(em => em.name.toLowerCase().includes(q)).slice(0, 40) : emotes.slice(0, 40)
    for (const em of shown) {
      const btn = document.createElement('button')
      btn.className = 'hs-mc-react-emote'
      btn.title = em.name
      const img = document.createElement('img')
      img.src = em.url
      img.alt = em.name
      img.loading = 'lazy'
      btn.appendChild(img)
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation()
        picker.remove()
        if (!hsAuthToken) return
        const cached = feedReactionsCache.get(msgId) || []
        const existing = cached.find(r => String(r.emote_id) === String(em.id))
        if (existing) {
          const chip = engageEl.querySelector(`.hs-feed-react-chip[data-emote-id="${CSS.escape(String(em.id))}"]`)
          const row = engageEl.querySelector('.hs-feed-react-row')
          if (chip && row) handleReactionChip(msgId, existing, chip, row, engageEl)
          return
        }
        const resp = await apiFetch(`/api/messages/${encodeURIComponent(msgId)}/react`, {
          method: 'POST', auth: true, body: { emote_id: em.id }
        })
        if (resp.ok) await loadReactions(msgId, engageEl)
      })
      grid.appendChild(btn)
    }
  }
  fillGrid('')
  searchEl.addEventListener('input', () => fillGrid(searchEl.value))

  document.body.appendChild(picker)
  const rect = e.target.getBoundingClientRect()
  const pw = picker.offsetWidth || 200
  const ph = picker.offsetHeight || 220
  picker.style.left = Math.min(rect.left, window.innerWidth - pw - 4) + 'px'
  picker.style.top = Math.max(rect.top - ph - 4, 4) + 'px'

  setTimeout(() => {
    const dismiss = (ev) => {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', dismiss) }
    }
    document.addEventListener('click', dismiss, { signal: mcSignal })
  }, 0)
  searchEl.focus()
}

function buildEngagementBar(m) {
  const bar = document.createElement('div')
  bar.className = 'hs-feed-engage'

  const liked = feedLiked.has(m.base36_id) || !!m.user_liked
  const heatCount = m.heat || 0

  // Heat/like button — flame SVG
  const heatBtn = document.createElement('button')
  heatBtn.className = 'hs-feed-heat-btn' + (liked ? ' active' : '')
  heatBtn.title = liked ? 'unlike' : 'heat'
  heatBtn.dataset.id = m.base36_id
  heatBtn.appendChild(_makeSvg('M12 2C9 7 5 9 5 14a7 7 0 0014 0c0-5-4-7-7-12z', liked))
  const heatCount2 = document.createElement('span')
  heatCount2.className = 'hs-fe-count'
  heatCount2.textContent = heatCount > 0 ? String(heatCount) : ''
  heatBtn.appendChild(heatCount2)

  // Bookmark button — ribbon SVG
  const bookmarked = feedBookmarked.has(m.base36_id)
  const bmBtn = document.createElement('button')
  bmBtn.className = 'hs-feed-bm-btn' + (bookmarked ? ' active' : '')
  bmBtn.title = bookmarked ? 'remove bookmark' : 'bookmark'
  bmBtn.dataset.id = m.base36_id
  bmBtn.appendChild(_makeSvg('M5 2h14a1 1 0 011 1v18l-8-5-8 5V3a1 1 0 011-1z', bookmarked))

  bar.appendChild(heatBtn)
  bar.appendChild(bmBtn)

  // Reactions row
  const reactRow = document.createElement('div')
  reactRow.className = 'hs-feed-react-row'
  const cached = feedReactionsCache.get(m.base36_id)
  if (cached?.length) {
    for (const r of cached) reactRow.appendChild(_makeReactChip(r, m.base36_id, bar))
  }
  const addReactBtn = document.createElement('button')
  addReactBtn.className = 'hs-feed-react-add'
  addReactBtn.title = 'react'
  addReactBtn.textContent = '+'
  reactRow.appendChild(addReactBtn)
  bar.appendChild(reactRow)

  return bar
}

function attachEngagementHandlers(div, m) {
  const bar = div.querySelector('.hs-feed-engage')
  if (!bar) return
  if (m.user_liked) feedLiked.add(m.base36_id)

  const heatBtn = bar.querySelector('.hs-feed-heat-btn')
  if (heatBtn) heatBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleHeat(m.base36_id, heatBtn, m) })

  const bmBtn = bar.querySelector('.hs-feed-bm-btn')
  if (bmBtn) bmBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmark(m.base36_id, bmBtn) })

  const addReactBtn = bar.querySelector('.hs-feed-react-add')
  if (addReactBtn) addReactBtn.addEventListener('click', (e) => { e.stopPropagation(); openReactionPicker(e, m.base36_id, bar) })
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
  const isReply = !!m.reply_to
  const heatStyle = hd ? getHeatNumberStyle(heat, isReply) : ''
  const heatSpan = hd ? `<span class="hs-feed-stat hs-feed-heat" style="${heatStyle}">${formatHeat(heat)}${hd.suffix}</span>` : ''
  const repliesSpan = replies > 0 ? `<span class="hs-feed-stat hs-feed-replies" title="replies">💬${replies}</span>` : '';
  const stats = [heatSpan, repliesSpan].filter(Boolean).join(' ')
  const statsHtml = stats ? ` ${stats}` : ''

  const anonAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="https://heatsync.org/anon.webp" alt="" loading="lazy">` : '';
  const userAvatar = avatarsEnabled ? `<img class="hs-feed-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
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

  // Right-click own posts → edit/delete menu
  if (isOwnFeedPost(m)) {
    div.classList.add('hs-feed-own')
    div.addEventListener('contextmenu', (e) => {
      // Only handle right-click directly on the post (not on links/quotes inside)
      if (e.target.closest('a, .hs-feed-thread-link, .hs-quote-insert, .hs-post-link')) return
      showFeedPostContextMenu(e, div, m)
    })
  }
  // Show edited badge if message was edited
  if (m.edited_at && !div.querySelector('.hs-feed-edited')) {
    const body = div.querySelector('.hs-feed-body')
    if (body) {
      const badge = document.createElement('span')
      badge.className = 'hs-feed-edited'
      badge.textContent = ' (edited)'
      badge.style.cssText = 'color:#888;font-size:11px;font-style:italic;margin-left:4px;'
      body.appendChild(badge)
    }
  }

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

  // Engagement bar: heat, bookmark, reactions
  const engageBar = buildEngagementBar(m);
  div.appendChild(engageBar);
  attachEngagementHandlers(div, m);

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

const _feedEmoteRegexCache = new Map()
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
      part = part.replace(/(https?:\/\/[^\s<"]+)/gi, (match) => {
        const escaped = escapeHtml(match)
        return `<a href="${escaped}" target="_blank" rel="noopener" class="hs-mc-link">${escaped}</a>`
      })
      part = part.replace(/(?<!\/\/)([a-z0-9-]+(?:\.[a-z0-9-]+)+\/[^\s<"]*)/gi, (m) => {
        const escaped = escapeHtml(m)
        return `<a href="https://${escaped}" target="_blank" rel="noopener" class="hs-mc-link">${escaped}</a>`
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
      if (!url || !/^https:\/\//.test(url)) continue
      const escaped = escapeHtml(name);
      const safeUrl = escapeHtml(url);
      const cacheKey = escaped
      let re = _feedEmoteRegexCache.get(cacheKey)
      if (!re) {
        re = new RegExp(`\\b${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
        _feedEmoteRegexCache.set(cacheKey, re)
        if (_feedEmoteRegexCache.size > 500) _feedEmoteRegexCache.delete(_feedEmoteRegexCache.keys().next().value)
      }
      html = html.replace(re, `<img class="hs-mc-emote" src="${safeUrl}" alt="${escaped}" title="${escaped}" loading="lazy">`);
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
    empty.textContent = t('mc_social_no_replies');
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
      input.dataset.placeholder = t('mc_social_login_first');
    } else {
      input.placeholder = t('mc_social_login_first');
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
    const errMsg = resp.status === 401 ? t('mc_social_log_in_first')
      : resp.status === 429 ? t('mc_social_slow_down')
      : resp.status === 409 ? t('mc_social_duplicate')
      : t('mc_social_failed_post');
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
      if (notifMessages.length > 500) notifMessages = notifMessages.slice(-500);
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
    msgsEl.innerHTML = `<div class="hs-mc-empty">${t('mc_social_login_activity')}</div>`;
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
    msgsEl.innerHTML = `<div class="hs-mc-empty">${t('mc_no_activity')}</div>`;
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
      evtHtml = evtHtml.replace(/(switched to |went live \u2014 )(.+)$/, (_, prefix, game) => {
        return `${prefix}<span style="color:#fff">${game}</span>`
      })
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
  // Fallback to processEmotes (local cache) when emote_refs is absent
  const rawContent = m.content || m.text || '';
  const hasEmoteRefs = m.emote_refs && typeof m.emote_refs === 'object' && Object.keys(m.emote_refs).length > 0;
  const content = hasEmoteRefs
    ? renderFeedContent(rawContent, m.emote_refs)
    : processEmotes(escapeHtml(rawContent), null);

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

// ============================================
// DISCOVER TAB (trending tags + profiles)
// ============================================

let discoverLoaded = false;
let discoverLoading = false;
let discoverTags = [];
let discoverProfiles = [];

function _discoverSetLoading(msgsEl) {
  msgsEl.textContent = '';
  const el = document.createElement('div');
  el.className = 'hs-mc-empty';
  el.textContent = 'loading...';
  msgsEl.appendChild(el);
}

async function fetchDiscover() {
  if (discoverLoading) return;
  discoverLoading = true;

  const msgsEl = document.getElementById('hs-mc-messages');
  if (msgsEl && currentTab === 'discover') _discoverSetLoading(msgsEl);

  try {
    const [tagsResp, profilesResp] = await Promise.all([
      apiFetch('/api/discover/trending-tags'),
      apiFetch('/api/profiles/trending'),
    ]);

    discoverTags = tagsResp.ok ? (tagsResp.data || tagsResp.tags || []) : [];
    discoverProfiles = profilesResp.ok ? (profilesResp.data || profilesResp.profiles || []) : [];
    discoverLoaded = true;
  } catch (e) {
    discoverTags = [];
    discoverProfiles = [];
    discoverLoaded = true;
  } finally {
    discoverLoading = false;
    if (currentTab === 'discover') renderDiscoverTab();
  }
}

function renderDiscoverTab() {
  const msgsEl = document.getElementById('hs-mc-messages');
  if (!msgsEl) return;

  // Insert refresh bar above message area once
  if (!document.getElementById('hs-discover-refresh-bar')) {
    const bar = document.createElement('div');
    bar.id = 'hs-discover-refresh-bar';
    bar.className = 'hs-discover-refresh-bar';
    const btn = document.createElement('button');
    btn.className = 'hs-discover-refresh-btn';
    btn.textContent = 'refresh';
    btn.addEventListener('click', () => {
      discoverLoaded = false;
      fetchDiscover();
    });
    bar.appendChild(btn);
    msgsEl.parentNode?.insertBefore(bar, msgsEl);
  }

  if (!discoverLoaded && !discoverLoading) {
    fetchDiscover();
    return;
  }
  if (discoverLoading) {
    _discoverSetLoading(msgsEl);
    return;
  }

  msgsEl.textContent = '';
  const frag = document.createDocumentFragment();

  // Tags section
  if (discoverTags.length > 0) {
    const section = document.createElement('div');
    section.className = 'hs-discover-section';
    const heading = document.createElement('div');
    heading.className = 'hs-discover-heading';
    heading.textContent = 'trending tags';
    section.appendChild(heading);

    const chips = document.createElement('div');
    chips.className = 'hs-discover-chips';
    for (const tag of discoverTags) {
      const name = typeof tag === 'string' ? tag : (tag.name || tag.tag || '');
      if (!name) continue;
      const chip = document.createElement('a');
      chip.className = 'hs-discover-chip';
      chip.href = `https://heatsync.org/tags/${encodeURIComponent(name)}`;
      chip.target = '_blank';
      chip.rel = 'noopener noreferrer';
      chip.textContent = escapeHtml(name);
      chips.appendChild(chip);
    }
    section.appendChild(chips);
    frag.appendChild(section);
  }

  // Profiles section
  if (discoverProfiles.length > 0) {
    const section = document.createElement('div');
    section.className = 'hs-discover-section';
    const heading = document.createElement('div');
    heading.className = 'hs-discover-heading';
    heading.textContent = 'trending profiles';
    section.appendChild(heading);

    for (const profile of discoverProfiles) {
      const username = profile.username || profile.name || '';
      if (!username) continue;
      const row = document.createElement('a');
      row.className = 'hs-discover-profile-row';
      row.href = `https://heatsync.org/@${encodeURIComponent(username)}`;
      row.target = '_blank';
      row.rel = 'noopener noreferrer';

      const avatarUrl = safeUrl(profile.avatar_url || profile.avatar || '');
      if (avatarUrl) {
        const img = document.createElement('img');
        img.className = 'hs-feed-avatar hs-discover-avatar';
        img.src = avatarUrl;
        img.alt = '';
        img.loading = 'lazy';
        img.onerror = function() { this.style.display = 'none'; };
        row.appendChild(img);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'hs-discover-profile-name';
      nameSpan.textContent = escapeHtml(username);
      row.appendChild(nameSpan);

      const heat = profile.heat_count ?? profile.heat ?? profile.score ?? null;
      if (heat != null) {
        const heatSpan = document.createElement('span');
        heatSpan.className = 'hs-discover-heat';
        heatSpan.textContent = `${Number(heat).toLocaleString()} heat`;
        row.appendChild(heatSpan);
      }

      section.appendChild(row);
    }
    frag.appendChild(section);
  }

  if (discoverTags.length === 0 && discoverProfiles.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hs-mc-empty';
    empty.textContent = 'nothing to show';
    frag.appendChild(empty);
  }

  msgsEl.appendChild(frag);
}

