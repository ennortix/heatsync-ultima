// IRC - read-only IRC client, message parsing, CircularBuffer

function parseTags(tagStr) {
  const tags = {}
  for (const part of tagStr.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) { tags[part] = ''; continue }
    tags[part.slice(0, eq)] = part.slice(eq + 1) || ''
  }
  return tags
}

// Parse the IRC `emotes=` tag (emoteId:start-end,start-end/...) into a
// { name: cdnUrl } map keyed off positions in the message text. Shared by
// PRIVMSG and USERNOTICE — the latter's user-typed portion (e.g. a watchstreak
// share message) carries the same tag and follower/sub emotes only render
// when this map is populated.
function parseTwitchEmotesTag(emotesTag, text) {
  if (!emotesTag) return null
  const out = {}
  for (const part of emotesTag.split('/')) {
    const [emoteId, posStr] = part.split(':')
    if (!emoteId || !posStr) continue
    const firstPos = posStr.split(',')[0]
    const [start, end] = firstPos.split('-').map(Number)
    if (isNaN(start) || isNaN(end)) continue
    const name = text.slice(start, end + 1)
    if (name && !out[name]) {
      out[name] = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

function parseIrcLine(raw, channel) {
  try {
    const tagsMatch = raw.match(/^@([^ ]+)/)
    if (!tagsMatch) return null
    const tags = parseTags(tagsMatch[1])

    // PRIVMSG: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    const privmsg = raw.match(/PRIVMSG #([^ ]+) :(.+)$/)
    if (privmsg) {
      const displayName = tags['display-name'] || 'anonymous'
      // /me sends as \x01ACTION text\x01
      let text = privmsg[2]
      let isAction = false
      if (text.charCodeAt(0) === 1 && text.startsWith('\x01ACTION ')) {
        text = text.slice(8, text.endsWith('\x01') ? -1 : undefined)
        isAction = true
      }
      const msg = {
        user: displayName,
        userId: tags['user-id'] || '',
        text: text,
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || privmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || '',
        replyTo: tags['reply-parent-display-name'] ? {
          user: decodeURIComponent(tags['reply-parent-display-name']),
          text: tags['reply-parent-msg-body'] ? decodeURIComponent(tags['reply-parent-msg-body'].replace(/\\s/g, ' ')) : '',
          id: tags['reply-parent-msg-id'] || '',
          userId: tags['reply-parent-user-id'] || '',
          threadId: tags['reply-thread-parent-msg-id'] || tags['reply-parent-msg-id'] || ''
        } : null
      }
      const twitchEmotes = parseTwitchEmotesTag(tags.emotes, text)
      if (twitchEmotes) msg.twitchEmotes = twitchEmotes
      if (isAction) msg.isAction = true
      const bits = parseInt(tags.bits) || 0
      if (bits > 0) msg.bits = bits
      // No own-cheer fallbacks — the renderer is bulletproof-strict: only
      // server-confirmed `bits=N` tags from twitch's IRC count. If the user
      // sent a cheer and bits weren't credited, no cheermote shows (which is
      // honest — the bit didn't deduct). The send-side wiring (native lexical
      // chat input → twitch GQL sendChatMessage) is what credits bits; if it
      // fails, that's the bug to fix, not the renderer.
      if (tags['custom-reward-id']) {
        msg.redeemed = true
        msg.rewardId = tags['custom-reward-id']
      }
      if (tags['msg-id'] === 'highlighted-message') msg.isHighlighted = true
      if (tags['first-msg'] === '1') msg.isFirstMsg = true
      // Extract sub tenure from badge-info (subscriber/N = cumulative months)
      const badgeInfo = tags['badge-info']
      if (badgeInfo) {
        const subMatch = badgeInfo.match(/subscriber\/(\d+)/)
        if (subMatch) msg.subMonths = parseInt(subMatch[1])
      }
      return msg
    }

    // USERNOTICE: @tags :tmi.twitch.tv USERNOTICE #channel :optional message
    const usernotice = raw.match(/USERNOTICE #([^ ]+)(?: :(.+))?$/)
    if (usernotice) {
      const displayName = tags['display-name'] || 'system'
      const subPlan = tags['msg-param-sub-plan'] || ''
      const tier = subPlan === '2000' ? '2' : subPlan === '3000' ? '3' : (subPlan === 'Prime' ? 'prime' : (subPlan ? '1' : ''))
      const months = parseInt(tags['msg-param-cumulative-months']) || parseInt(tags['msg-param-months']) || 0
      const giftCount = parseInt(tags['msg-param-mass-gift-count']) || 0
      const recipient = tags['msg-param-recipient-display-name'] ? decodeURIComponent(tags['msg-param-recipient-display-name'].replace(/\\s/g, ' ')) : ''
      const raidViewers = parseInt(tags['msg-param-viewerCount']) || 0
      const raidFrom = tags['msg-param-displayName'] ? decodeURIComponent(tags['msg-param-displayName'].replace(/\\s/g, ' ')) : ''
      const announceColor = tags['msg-param-color'] || ''
      const bitsTier = parseInt(tags['msg-param-threshold']) || 0
      const category = tags['msg-param-category'] || ''
      const rawMsgId = tags['msg-id'] || ''
      // Watch-streak: Twitch ships it under viewermilestone w/ category=watch-streak.
      // Promote to its own msgId so renderers + dedupe can distinguish.
      const msgId = (rawMsgId === 'viewermilestone' && category === 'watch-streak')
        ? 'watchstreak' : rawMsgId
      const streakCount = (msgId === 'watchstreak')
        ? (parseInt(tags['msg-param-value'], 10) || 0) : 0
      const userText = usernotice[2] || ''
      const twitchEmotes = parseTwitchEmotesTag(tags.emotes, userText)
      return {
        user: displayName,
        text: userText,
        systemMsg: decodeURIComponent((tags['system-msg'] || '').replace(/\\s/g, ' ')),
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || usernotice[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        type: 'usernotice',
        msgId,
        subTier: tier,
        subMonths: months,
        giftCount,
        recipient,
        raidViewers,
        raidFrom,
        announceColor,
        bitsTier,
        streakCount,
        twitchEmotes: twitchEmotes || undefined,
        id: tags.id || ''
      }
    }

    // NOTICE: @tags :tmi.twitch.tv NOTICE #channel :message
    // (also used by clearchatToNotice=true from recent-messages API)
    const notice = raw.match(/NOTICE #([^ ]+) :(.+)$/)
    if (notice) {
      const ch = channel || notice[1].toLowerCase()
      const time = parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now()
      const noticeType = tags['msg-id'] || ''
      // Deterministic ID when server doesn't provide one — same notice from live IRC
      // and robotty history dedupes correctly (both share tmi-sent-ts).
      const detId = `notice-${ch}-${time}-${notice[2].slice(0, 64)}`
      return {
        type: 'notice',
        noticeType,
        user: 'system',
        text: notice[2],
        color: '#808080',
        badges: '',
        channel: ch,
        time,
        id: tags.id || detId,
        systemMsg: notice[2]
      }
    }

    // ROOMSTATE: @tags :tmi.twitch.tv ROOMSTATE #channel
    // (slow/subs-only/emote-only/followers-only/r9k mode toggles + initial state on JOIN)
    const roomstate = raw.match(/ROOMSTATE #([^ ]+)/)
    if (roomstate) {
      const ch = channel || roomstate[1].toLowerCase()
      return {
        type: 'roomstate',
        channel: ch,
        time: Date.now(),
        slow: tags['slow'] != null ? parseInt(tags['slow']) : null,
        subsOnly: tags['subs-only'] != null ? tags['subs-only'] === '1' : null,
        emoteOnly: tags['emote-only'] != null ? tags['emote-only'] === '1' : null,
        followersOnly: tags['followers-only'] != null ? parseInt(tags['followers-only']) : null,
        r9k: tags['r9k'] != null ? tags['r9k'] === '1' : null
      }
    }

    // USERSTATE: @badges=...;color=...;display-name=... :tmi.twitch.tv USERSTATE #channel
    // Sent on JOIN + after every viewer PRIVMSG. Tells us the viewer's own
    // per-channel badges — used to detect entitlement for this channel's
    // sub emotes (subscriber/N or founder/N badge).
    const userstate = raw.match(/USERSTATE #([^ ]+)/)
    if (userstate) {
      const ch = channel || userstate[1].toLowerCase()
      const badgeNames = new Set()
      for (const part of (tags.badges || '').split(',')) {
        const name = part.split('/')[0]
        if (name) badgeNames.add(name)
      }
      return { type: 'userstate', channel: ch, badges: badgeNames, time: Date.now() }
    }

    // CLEARCHAT: @tags :tmi.twitch.tv CLEARCHAT #channel :username
    // (timeout/ban of a user)
    const clearchat = raw.match(/CLEARCHAT #([^ ]+)(?: :(.+))?$/)
    if (clearchat) {
      const target = clearchat[2] || ''
      const duration = tags['ban-duration']
      const text = target
        ? (duration ? `${target} timed out for ${duration}s` : `${target} was permanently banned`)
        : t('mc_irc_chat_cleared')
      const ch = channel || clearchat[1].toLowerCase()
      const time = parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now()
      // Deterministic ID — dedupes live CLEARCHAT vs robotty NOTICE replay of same event.
      const detId = `clearchat-${ch}-${target}-${duration || 'perma'}-${time}`
      return {
        type: 'notice',
        noticeType: duration ? 'timeout_success' : 'ban_success',
        user: 'system',
        text,
        color: '#808080',
        badges: '',
        channel: ch,
        time,
        id: tags.id || detId,
        systemMsg: text,
        targetUser: target,
        targetUserId: tags['target-user-id'] || '',
        banDuration: duration ? parseInt(duration) : 0
      }
    }

    // CLEARMSG: @tags :tmi.twitch.tv CLEARMSG #channel :deleted message text
    // (single message deletion)
    const clearmsg = raw.match(/CLEARMSG #([^ ]+) :(.+)$/)
    if (clearmsg) {
      const targetMsgId = tags['target-msg-id']
      return {
        type: 'notice',
        noticeType: 'delete_message_success',
        user: 'system',
        text: t('mc_irc_msg_deleted', [tags.login || 'unknown']),
        color: '#808080',
        badges: '',
        channel: channel || clearmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: targetMsgId || `clearmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: t('mc_irc_msg_deleted', [tags.login || 'unknown']),
        targetUser: tags.login || '',
        targetMsgId: targetMsgId || ''
      }
    }

    // WHISPER: @tags :user!user@user.tmi.twitch.tv WHISPER yourname :message
    const whisper = raw.match(/WHISPER \S+ :(.+)$/)
    if (whisper) {
      return {
        type: 'whisper',
        user: tags['display-name'] || 'anonymous',
        userId: tags['user-id'],
        text: whisper[1],
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags['message-id'] || ''
      }
    }

    return null
  } catch (e) {
    return null
  }
}

// ============================================
// CIRCULAR BUFFER FOR CHANNEL MESSAGES
// ============================================
class CircularBuffer {
  constructor(cap = 1500) {
    this.buf = new Array(cap);
    this.cap = cap;
    this.head = 0;
    this.size = 0;
  }
  push(item) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }
  getAll() {
    if (this.size === 0) return [];
    if (this.size < this.cap) return this.buf.slice(0, this.size);
    // Concat instead of spread — avoids 2 temporary arrays
    return this.buf.slice(this.head).concat(this.buf.slice(0, this.head));
  }
  clear() {
    this.buf = new Array(this.cap);
    this.head = 0;
    this.size = 0;
  }
}

// ============================================
// TWITCH IRC CLIENT (READ-ONLY)
// ============================================
class IRC {
  // SW-owned mode: BG SW owns the WebSocket. This class is a thin client —
  // it joins/parts via runtime messages, mirrors per-channel buffers locally
  // so existing main.js code can keep using `irc.channels.get(ch).getAll()`
  // synchronously, and forwards live events from BG to local listeners.
  // Authenticated send still flows through auth-irc.js (per-tab, OAuth).
  constructor() {
    // Message-id dedupe — live messages can now arrive from BOTH the BG IRC
    // relay and the native-chat tap; history merges seed it so replays never
    // double-render. FIFO-capped.
    this._seenIds = new Set()
    this._seenIdOrder = []
    this.channels = new Map()  // ch -> CircularBuffer (local mirror)
    this.handlers = new Map()
    this._destroyed = false
    this._listener = (message) => {
      if (this._destroyed || !message || typeof message !== 'object') return
      if (message.type === 'bg_irc_msg') {
        this._handleMsg(message.msg)
      } else if (message.type === 'bg_irc_history_merged') {
        this._refreshFromBg(message.channel)
      }
    }
    cleanup.addListener(chrome.runtime?.onMessage, this._listener)
    // Global twitch badges (mod sword, vip diamond, subscriber/0 star, etc.)
    // were previously fetched in irc.ws.onopen — removed when WebSocket moved
    // to BG. Without this, mod/sub fall back to TEXT badges instead of images.
    try { fetchGlobalBadges() } catch {}
  }

  _seenId(id) {
    if (!id) return false
    if (this._seenIds.has(id)) return true
    this._seenIds.add(id)
    this._seenIdOrder.push(id)
    if (this._seenIdOrder.length > 6000) {
      for (let i = 0; i < 1000; i++) this._seenIds.delete(this._seenIdOrder[i])
      this._seenIdOrder.splice(0, 1000)
    }
    return false
  }

  _handleMsg(msg) {
    if (!msg) return
    // dedupe plain chat by (channel, id) — same id is legit across channels
    // in shared-chat sessions; BG IRC vs native tap is the real dupe source
    if (!msg.type && msg.id && this._seenId(`${msg.channel}:${msg.id}`)) return
    // USERSTATE: viewer's per-channel badges (used to gate sub-emote rendering)
    if (msg.type === 'userstate') {
      if (typeof viewerBadgesPerChannel !== 'undefined') {
        const badges = msg.badges instanceof Set ? msg.badges : new Set(Array.isArray(msg.badges) ? msg.badges : [])
        viewerBadgesPerChannel.set(msg.channel, badges)
      }
      // rawBadges carries the full tag string with tier suffixes — feed it
      // into the per-channel own-badges cache so synthetic resub/watchstreak
      // celebrations render with the right sub tier on first-render (before
      // the user has sent a PRIVMSG on this channel).
      if (typeof _ownBadgesByChannel !== 'undefined' && msg.rawBadges) {
        _ownBadgesByChannel.set(String(msg.channel).toLowerCase(), msg.rawBadges)
      }
      return
    }
    if (msg.type === 'whisper') return  // whispers come via EventSub now
    if (msg.type === 'roomstate') return  // BG already converted to mode_change notice
    const ch = msg.channel
    if (!ch || !this.channels.has(ch)) return
    if (msg.user) {
      try { addUsername(msg.user) } catch {}
      try { setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId) } catch {}
    }
    if (msg.subMonths) { try { trackSubTenure(ch, msg.user, msg.subMonths) } catch {} }
    try { fetchChannelBadges(ch) } catch {}
    if (!msg.type || msg.type === 'usernotice' || msg.type === 'notice') {
      const buf = this.channels.get(ch)
      // Twitch sends BOTH a CLEARCHAT (everyone) and a timeout_success/ban_success
      // NOTICE (mod-only feedback) for the same event. CLEARCHAT path produces a
      // canonical notice with targetUser+banDuration; the mod-feedback NOTICE is
      // redundant. Dedup by (noticeType, target, time window).
      if (msg.type === 'notice' && !msg.targetUser &&
          (msg.noticeType === 'timeout_success' || msg.noticeType === 'ban_success')) {
        const tm = (msg.text || '').match(/^(\S+) has been/)
        const targetLc = tm ? tm[1].toLowerCase() : ''
        if (targetLc) {
          for (const existing of buf.getAll()) {
            if (existing.type !== 'notice') continue
            if (existing.noticeType !== msg.noticeType) continue
            if (!existing.targetUser) continue
            if (existing.targetUser.toLowerCase() !== targetLc) continue
            if (Math.abs((existing.time || 0) - (msg.time || 0)) > 10000) continue
            return
          }
        }
      }
      buf.push(msg)
      // Relay PRIVMSGs to server archive (ON CONFLICT DO NOTHING dedupes across
      // multiple viewers). Skip replays from BG history merge.
      if (!msg.type && !msg.isHistory && msg.user && msg.text && msg.id) {
        try {
          chrome.runtime.sendMessage({
            type: 'ws_send',
            data: {
              type: 'twitch:chat:relay',
              channel: ch,
              username: msg.login || String(msg.user).toLowerCase(),
              display_name: msg.user,
              message: msg.text,
              message_id: msg.id,
              timestamp: msg.time || Date.now(),
              emote_refs: msg.twitchEmotes ? { twitch: msg.twitchEmotes } : null,
              reply_to_id: msg.replyTo?.id || null,
            }
          }).catch(() => {})
        } catch {}
      }
      if (msg.type === 'notice') {
        if (msg.noticeType === 'ban_success' || msg.noticeType === 'timeout_success') {
          const targetLc = (msg.targetUser || '').toLowerCase()
          if (targetLc) {
            for (const m of buf.getAll()) {
              if (m.user && m.user.toLowerCase() === targetLc && !m.cleared) {
                m.cleared = true
                m.clearedReason = msg.banDuration ? `timed out (${msg.banDuration}s)` : 'banned'
              }
            }
          }
        }
        if (msg.noticeType === 'delete_message_success' && msg.targetMsgId) {
          const id = msg.targetMsgId
          for (const m of buf.getAll()) {
            if (m.id === id) { m.cleared = true; m.clearedReason = 'deleted'; break }
          }
        }
      }
      this.emit('message', msg)
    }
  }

  // BG performed a robotty merge — reflect the updated buffer locally.
  async _refreshFromBg(ch) {
    if (!this.channels.has(ch)) return
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'bg_irc_history', channel: ch })
      if (!resp?.ok) return
      const buf = this.channels.get(ch)
      const wasSize = buf.size
      // Snapshot live messages before clearing — any non-history message that
      // arrived during the sendMessage await above would otherwise be buried
      // behind history after the replay loop below.
      const liveSnap = buf.getAll().filter(m => !m.isHistory)
      buf.clear()
      try { if (typeof _recentSentHydrated !== 'undefined') await _recentSentHydrated } catch {}
      for (const m of resp.msgs || []) {
        if (m?.type === 'roomstate' || m?.type === 'userstate' || m?.type === 'whisper') continue
        m.isHistory = true
        if (m.user) {
          try { addUsername(m.user) } catch {}
          try { setKnownColor(m.user.toLowerCase(), m.color, m.userId) } catch {}
        }
        if (m.subMonths) { try { trackSubTenure(ch, m.user, m.subMonths) } catch {} }
        try {
          const sentHost = peekSentHost(m.text)
          if (sentHost) { m.badgePlatform = 'twitch'; m.platform = sentHost === 'yt' ? 'youtube' : sentHost }
        } catch {}
        if (m.id) this._seenId(`${ch}:${m.id}`)
        buf.push(m)
      }
      // Re-append live messages after history so they appear newest (correct order).
      for (const m of liveSnap) buf.push(m)
      try { _dropAllTabCaches() } catch {}
      // Rebuild when empty OR when a real backfill landed (delta ≥ 5). Small
      // incremental merges skip to avoid streamer-switch flash; large history
      // hydrations always rebuild so the DOM matches the buffer.
      const isCurrent = (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch))
      const delta = buf.size - wasSize
      if (isCurrent && (isMsgsElEmpty() || delta >= 5)) {
        renderMessages(currentTab)
      }
    } catch (e) { log('BG history refresh failed:', e?.message) }
  }

  connect() { /* BG owns the WebSocket */ }

  async join(ch) {
    ch = ch.toLowerCase()
    if (this.channels.has(ch)) return
    this.channels.set(ch, new CircularBuffer(3000))
    log('Joined', ch)
    // Pre-warm channel badges (sub tiers, FFZ custom mod/vip overrides) so
    // restored history from BG renders with proper images on first paint.
    try { fetchChannelBadges(ch) } catch {}
    // Route through safeSendMessage so cold-SW wake retries — direct sendMessage
    // here silently lost the join on SW eviction, BG never joined the channel,
    // own PRIVMSG echoes never returned, user had to refresh to recover.
    try { safeSendMessage({ type: 'bg_irc_join', channel: ch }).catch(() => {}) } catch {}
    // Pull initial buffer from BG (in-memory; instant on warm SW). Await the
    // sent-message storage hydration first so own-message [K]/[H]/[Y] badges
    // survive page refresh — otherwise peekSentHost can race with this load
    // and miss the host override, reverting the badge to the echo's actual
    // origin (twitch).
    try { if (typeof _recentSentHydrated !== 'undefined') await _recentSentHydrated } catch {}
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'bg_irc_history', channel: ch })
      if (resp?.ok && Array.isArray(resp.msgs) && resp.msgs.length > 0) {
        const buf = this.channels.get(ch)
        for (const m of resp.msgs) {
          if (m?.type === 'roomstate' || m?.type === 'userstate' || m?.type === 'whisper') continue
          m.isHistory = true
          if (m.user) {
            try { addUsername(m.user) } catch {}
            try { setKnownColor(m.user.toLowerCase(), m.color, m.userId) } catch {}
          }
          if (m.subMonths) { try { trackSubTenure(ch, m.user, m.subMonths) } catch {} }
          // Host attribution override — IRC echo arrives as platform='twitch';
          // if we tracked this exact text as a kick/yt/heatsync send, retag.
          try {
            const sentHost = peekSentHost(m.text)
            if (sentHost) { m.badgePlatform = 'twitch'; m.platform = sentHost === 'yt' ? 'youtube' : sentHost }
          } catch {}
          buf.push(m)
        }
        log('BG history hydrated:', resp.msgs.length, 'msgs for', ch)
        try { _dropAllTabCaches() } catch {}
        // Always render if we just hydrated any history and panel is current —
        // a few live msgs may have painted before this resolved, but the buf
        // now has more (history below them) and must be reflected in DOM.
        const isCurrent = (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch))
        if (isCurrent && resp.msgs.length > 0) {
          renderMessages(currentTab)
        }
      }
    } catch (e) { log('BG history fetch failed:', e?.message) }
    // Self-healing: if BG returned 0 msgs (cold SW / robotty still in flight)
    // OR broadcast was lost, re-pull at 3s + 8s + 20s. Cheap (single message,
    // no fetch) and idempotent — _refreshFromBg only mutates when SW has data.
    for (const delay of [3000, 8000, 20000]) {
      setTimeout(() => {
        if (this._destroyed || !this.channels.has(ch)) return
        if ((this.channels.get(ch)?.size || 0) >= 200) return
        this._refreshFromBg(ch)
      }, delay)
    }
  }

  part(ch) {
    ch = ch.toLowerCase()
    if (!this.channels.has(ch)) return
    this.channels.delete(ch)
    log('Parted', ch)
    try { chrome.runtime.sendMessage({ type: 'bg_irc_part', channel: ch }).catch(() => {}) } catch {}
  }

  getMessages(ch) {
    return this.channels.get(ch?.toLowerCase())?.getAll() || []
  }

  on(e, fn) {
    if (!this.handlers.has(e)) this.handlers.set(e, new Set())
    this.handlers.get(e).add(fn)
  }

  emit(e, d) {
    this.handlers.get(e)?.forEach(fn => {
      try { fn(d) } catch (err) { console.error('[heatsync-irc] handler err:', err) }
    })
  }

  destroy() {
    this._destroyed = true
    if (this._listener) {
      try { chrome.runtime?.onMessage?.removeListener(this._listener) } catch {}
      this._listener = null
    }
  }
}

// ============================================
// KICK CHAT CLIENT (VIA HEATSYNC WEBHOOK)
// ============================================
class KickChat {
  constructor() {
    this.channels = new Map() // kickUsername → CircularBuffer
    this.handlers = new Map()
    this._destroyed = false
    this._listener = null
    this._persistTimers = {}
    this._PERSIST_MAX = 1500
    this._PERSIST_DEBOUNCE_MS = 1500
    this._SYNC_BACKUP_MAX = 200
    this._pendingChannels = new Set()
    this._recentLiveIds = new Set() // Kick message-id dedup across server-relay + Pusher-tap sources
    // Per-channel watchdog. Kick traffic flows BG → runtime.sendMessage →
    // this._listener; if anything between us and the heatsync server drops
    // a sub silently (BG WS reconnected before our ws_send made it through,
    // server lost the join state, etc.) we'd never know. Watchdog re-asserts
    // channel:join when a channel goes too quiet.
    this._chanLastSeen = new Map()
    this._chanRejoinAttempts = new Map() // ch -> escalation count
    this._watchdogTimer = null
    // Synchronous flush of pending channel buffers on tear-down — closes the
    // chrome.storage.local debounce gap that was eating ~5s of pre-reload chat.
    this._pagehideHandler = () => this._flushPendingSync()
    window.addEventListener('pagehide', this._pagehideHandler)
  }

  _serializeMsg(m) {
    return {
      user: m.user, text: m.text, color: m.color, badges: m.badges,
      channel: m.channel, time: m.time, platform: 'kick',
      type: m.type || undefined, systemMsg: m.systemMsg || undefined,
      replyTo: m.replyTo || undefined, kicksEvent: m.kicksEvent || undefined
    }
  }

  _flushPendingSync() {
    for (const ch of this._pendingChannels) {
      try {
        const buffer = this.channels.get(ch)
        if (!buffer) continue
        const msgs = buffer.getAll().slice(-this._SYNC_BACKUP_MAX).map(m => this._serializeMsg(m))
        localStorage.setItem(`hs_kick_sync_${ch}`, JSON.stringify({ msgs, ts: Date.now() }))
      } catch {}
    }
  }

  _touchChannel(ch) {
    if (!ch) return
    this._chanLastSeen.set(ch, Date.now())
    if (this._chanRejoinAttempts.size) this._chanRejoinAttempts.delete(ch)
  }

  _startWatchdog() {
    if (this._watchdogTimer) return
    this._watchdogTimer = cleanup.setInterval(() => {
      if (this._destroyed) return
      const now = Date.now()
      for (const ch of this.channels.keys()) {
        const last = this._chanLastSeen.get(ch) || 0
        if (!last) continue
        // Escalate the response when a Kick channel keeps coming up silent.
        // Each rung is more invasive but recovers a different failure class:
        //   1) re-assert join — server forgot us, idempotent on Kick
        //   2) leave+join — server thinks we're already subbed; force fresh
        //   3) BG WS force-reconnect — BG itself is in zombie state
        // Tick is 30s, so worst-case dead window before rung 1 is 120s.
        if (now - last <= 90000) continue
        const attempts = this._chanRejoinAttempts.get(ch) || 0
        const silenceS = Math.round((now - last) / 1000)
        if (attempts === 0) {
          log('Kick channel', ch, 'silent', silenceS, 's — re-asserting channel:join')
          safeSendMessage({ type: 'ws_send', data: { type: 'channel:join', platform: 'kick', channel: ch } })
        } else if (attempts === 1) {
          log('Kick channel', ch, 'still silent', silenceS, 's after re-join — leave+join to force fresh sub')
          safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: ch } })
          safeSendMessage({ type: 'ws_send', data: { type: 'channel:join', platform: 'kick', channel: ch } })
        } else {
          log('Kick channel', ch, 'unresponsive', silenceS, 's after', attempts, 'attempts — asking BG to reconnect WS')
          safeSendMessage({ type: 'ws_force_reconnect', source: 'kick_watchdog', channel: ch })
          // After this we let the BG cycle do its thing; reset attempt counter
          // so the next watchdog tick doesn't immediately escalate again
          // (BG reconnect takes ~1-3s, fresh traffic should disarm us).
          this._chanRejoinAttempts.set(ch, 0)
          this._chanLastSeen.set(ch, now)
          continue
        }
        this._chanRejoinAttempts.set(ch, attempts + 1)
        // Disarm one cycle; real traffic resumes _chanLastSeen via the listener.
        this._chanLastSeen.set(ch, now)
      }
    }, 30000)
  }

  _stopWatchdog() {
    if (this._watchdogTimer) {
      cleanup.clearInterval(this._watchdogTimer)
      this._watchdogTimer = null
    }
  }

  connect() {
    if (this._destroyed) return
    if (this._listener) return

    // Listen for kick chat messages relayed from background.js
    this._listener = (message) => {
      // BG ingested a server-side backfill batch — refresh our local mirror
      // from BG so the DOM reflects the newly merged history.
      if (message.type === 'bg_kick_history_merged' && message.channel) {
        this._refreshFromBg(message.channel)
        return
      }
      if (message.type === 'kick_chat_message' && message.data) {
        const d = message.data
        const channel = d.channel?.toLowerCase()
        this._touchChannel(channel)
        if (!channel || !this.channels.has(channel)) return
        // Dedup by Kick message id — the same message can arrive from BOTH the
        // server webhook relay and the client-side Pusher tap; keep only the
        // first. (touchChannel above still ran so the watchdog sees liveness.)
        if (d.id) {
          if (this._recentLiveIds.has(d.id)) return
          this._recentLiveIds.add(d.id)
          if (this._recentLiveIds.size > 800) this._recentLiveIds.delete(this._recentLiveIds.values().next().value)
        }
        // Convert Kick badge objects to Twitch-style "name/version" string.
        // Kick WS payload uses {type, text, count} per badge; some pass-through
        // paths re-shape to {name, version}. Accept BOTH so type-shape payloads
        // don't collapse to 'badge/1' (which has no BADGE_STYLES entry → blank).
        const badgeStr = Array.isArray(d.badges)
          ? d.badges.map(b => `${b.type || b.name || 'badge'}/${b.version || b.count || '1'}`).join(',')
          : ''
        const msg = {
          id: d.id || '',
          user: d.username || 'unknown',
          text: d.content || '',
          color: d.color || '#53fc18',
          badges: badgeStr,
          channel,
          time: d.timestamp || Date.now(),
          platform: 'kick',
          replyTo: d.replyTo ? {
            user: d.replyTo.username || 'unknown',
            text: d.replyTo.content || '',
            id: d.replyTo.id || d.replyTo.message_id || '',
            threadId: d.replyTo.thread_id || d.replyTo.id || d.replyTo.message_id || ''
          } : null
        }
        this.channels.get(channel).push(msg)
        if (msg.user) {
          addUsername(msg.user)
          setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
        }
        this.persistBuffer(channel)
        this.emit('message', msg)
      }

      // KICKs gifted events (Kick's equivalent of Twitch Bits)
      if (message.type === 'kick_kicks_event') {
        const channel = message.channel?.toLowerCase()
        this._touchChannel(channel)
        if (!channel || !this.channels.has(channel)) return
        const msg = {
          user: message.username || 'anonymous',
          text: message.message || '',
          systemMsg: `${message.username || 'Anonymous'} gifted ${message.amount} KICKs${message.giftName ? ' (' + message.giftName + ')' : ''}!`,
          color: '#ffd600',
          badges: '',
          channel,
          time: Date.now(),
          type: 'usernotice',
          msgId: 'kicks_gifted',
          platform: 'kick',
          kicksEvent: true,
          id: ''
        }
        this.channels.get(channel).push(msg)
        this.persistBuffer(channel)
        this.emit('message', msg)
      }

      // Kick subscription events (new sub, resub, gift subs)
      if (message.type === 'kick_sub_event') {
        const channel = message.channel?.toLowerCase()
        this._touchChannel(channel)
        if (!channel || !this.channels.has(channel)) return
        const msg = {
          user: message.username || 'system',
          text: '',
          systemMsg: message.message || '',
          color: '#53fc18',
          badges: '',
          channel,
          time: Date.now(),
          type: 'usernotice',
          msgId: message.eventType || '',
          platform: 'kick',
          id: ''
        }
        this.channels.get(channel).push(msg)
        this.persistBuffer(channel)
        this.emit('message', msg)
      }
    }
    chrome.runtime?.onMessage?.addListener(this._listener)
    this._startWatchdog()
    log('Kick chat listener registered (webhook mode)')
  }

  persistBuffer(ch) {
    this._pendingChannels.add(ch)
    if (this._persistTimers[ch]) return
    this._persistTimers[ch] = cleanup.setTimeout(() => {
      try {
        delete this._persistTimers[ch]
        this._pendingChannels.delete(ch)
        if (!chrome?.runtime?.id) return
        const buffer = this.channels.get(ch)
        if (!buffer) return
        const msgs = buffer.getAll().slice(-this._PERSIST_MAX).map(m => this._serializeMsg(m))
        const p = chrome.storage.local.set({ [`hs_kick_${ch}`]: { msgs, ts: Date.now() } })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }, this._PERSIST_DEBOUNCE_MS)
  }

  // BG merged a server-side backfill — re-pull merged buffer into local
  // mirror. Mirrors IRC._refreshFromBg semantics: render when empty OR when
  // the buffer grew meaningfully (real backfill).
  async _refreshFromBg(ch) {
    ch = ch.toLowerCase()
    if (!this.channels.has(ch)) return
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'bg_kick_history', channel: ch })
      if (!resp?.ok || !Array.isArray(resp.msgs)) return
      const buf = this.channels.get(ch)
      const wasSize = buf.size
      // Snapshot live messages before clearing — mirrors IRC._refreshFromBg.
      const liveSnap = buf.getAll().filter(m => !m.isHistory)
      buf.clear()
      try { if (typeof _recentSentHydrated !== 'undefined') await _recentSentHydrated } catch {}
      for (const m of resp.msgs) {
        m.isHistory = true
        if (m.user) {
          try { addUsername(m.user) } catch {}
          try { setKnownColor(m.user.toLowerCase(), m.color, m.userId) } catch {}
        }
        try {
          const sentHost = peekSentHost(m.text)
          if (sentHost) { m.badgePlatform = 'kick'; m.platform = sentHost === 'yt' ? 'youtube' : sentHost }
        } catch {}
        buf.push(m)
      }
      // Re-append live messages after history so they appear newest (correct order).
      for (const m of liveSnap) buf.push(m)
      try { _dropAllTabCaches() } catch {}
      const isCurrent = (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch))
      const delta = buf.size - wasSize
      if (isCurrent && (isMsgsElEmpty() || delta >= 5)) {
        renderMessages(currentTab)
      }
    } catch (e) { log('Kick BG refresh failed:', e?.message) }
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch)
    if (!buffer) return
    const storageKey = `hs_kick_${ch}`
    const syncKey = `hs_kick_sync_${ch}`

    let chromeMsgs = null, syncMsgs = null
    try {
      const stored = await chrome.storage.local.get(storageKey)
      const data = stored[storageKey]
      if (data?.msgs?.length > 0 && Date.now() - data.ts < 86400000) chromeMsgs = data.msgs
    } catch {}
    try {
      const raw = localStorage.getItem(syncKey)
      if (raw) {
        const data = JSON.parse(raw)
        if (data?.msgs?.length > 0 && Date.now() - data.ts < 86400000) syncMsgs = data.msgs
      }
    } catch {}

    if (!chromeMsgs && !syncMsgs) return

    // Kick messages have no global id; merge by user+time+text fingerprint.
    const seen = new Set()
    const all = []
    const fp = (m) => `${m.user||''}|${m.time||0}|${(m.text||'').slice(0,80)}`
    const ingest = (arr) => {
      if (!arr) return
      for (const m of arr) {
        const k = fp(m)
        if (seen.has(k)) continue
        seen.add(k)
        all.push(m)
      }
    }
    ingest(chromeMsgs)
    ingest(syncMsgs)
    all.sort((a, b) => (a.time || 0) - (b.time || 0))

    // Filter out 7TV emote change system messages and dedup stream events
    const seenEventTexts = new Set()
    const filtered = all.filter(m => {
      const t = m.text || m.systemMsg || ''
      if (t.includes('removed from channel') || t.includes('added to channel') ||
          t.includes('removed 7TV emote') || t.includes('added 7TV emote')) return false
      const isStreamEvent = m.type === 'stream-event' || (m.text && m.text.includes('◆') && !m.user)
      if (isStreamEvent && m.text) {
        if (!m.type) m.type = 'stream-event'
        if (!m.text.startsWith('[')) {
          const em = m.text.match(/^([a-zA-Z0-9_]+) ◆/)
          if (em) m.text = `[${em[1]}]` + m.text.slice(em[1].length)
        }
        if (seenEventTexts.has(m.text)) return false
        seenEventTexts.add(m.text)
      }
      return true
    })
    log('Kick storage hit:', filtered.length, 'msgs for', ch,
      'chrome:' + (chromeMsgs?.length || 0),
      'sync:' + (syncMsgs?.length || 0))
    for (const msg of filtered) {
      msg.isHistory = true
      if (msg.user) {
        addUsername(msg.user)
        setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
      }
      buffer.push(msg)
    }
    // Always render when history hydrates and panel is current — even if a
    // couple live msgs already painted, the buffer just grew and the DOM
    // must reflect it.
    const isCurrent = (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch))
    if (isCurrent && filtered.length > 0) {
      renderMessages(currentTab)
    }
  }

  destroy() {
    this._destroyed = true
    this._stopWatchdog()
    if (this._listener) {
      chrome.runtime?.onMessage?.removeListener(this._listener)
      this._listener = null
    }
    if (this._pagehideHandler) {
      window.removeEventListener('pagehide', this._pagehideHandler)
      this._pagehideHandler = null
    }
    for (const id of Object.values(this._persistTimers)) cleanup.clearTimeout(id);
    this._persistTimers = {};
    // Leave all channels
    for (const username of this.channels.keys()) {
      safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: username } })
    }
    this.channels.clear()
    this._chanLastSeen.clear()
    this._chanRejoinAttempts.clear()
  }

  async join(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (this.channels.has(kickUsername)) return
    this.channels.set(kickUsername, new CircularBuffer(3000))
    // Seed watchdog clock — full grace period before re-asserting.
    this._chanLastSeen.set(kickUsername, Date.now())
    // Pre-warm Kick subscriber badges (defer past init so any panel mount
    // races finish before the populate). No render side-effects in the
    // helper — natural re-render picks up the new entries.
    setTimeout(() => { try { fetchKickChannelBadges(kickUsername) } catch {} }, 1500)
    // ask BG for in-memory buffer first (always fresher than the
    // chrome.storage.local debounced write). Fall back to local persisted
    // history if BG is cold.
    let hydrated = false
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'bg_kick_history', channel: kickUsername })
      if (resp?.ok && Array.isArray(resp.msgs) && resp.msgs.length > 0) {
        const buf = this.channels.get(kickUsername)
        try { if (typeof _recentSentHydrated !== 'undefined') await _recentSentHydrated } catch {}
        for (const m of resp.msgs) {
          m.isHistory = true
          if (m.user) {
            try { addUsername(m.user) } catch {}
            try { setKnownColor(m.user.toLowerCase(), m.color, m.userId) } catch {}
          }
          try {
            const sentHost = peekSentHost(m.text)
            if (sentHost) { m.badgePlatform = 'kick'; m.platform = sentHost === 'yt' ? 'youtube' : sentHost }
          } catch {}
          buf.push(m)
        }
        hydrated = true
        log('Kick BG history hydrated:', resp.msgs.length, 'msgs for', kickUsername)
        try { _dropAllTabCaches() } catch {}
        const isCurrent = (currentTab === kickUsername || (currentTab === 'live' && getLiveChannel() === kickUsername))
        if (isCurrent && resp.msgs.length > 0) {
          renderMessages(currentTab)
        }
      }
    } catch (e) { log('Kick BG history fetch failed:', e?.message) }
    if (!hydrated) await this.loadHistory(kickUsername)
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:join', platform: 'kick', channel: kickUsername } })
    log('Kick joined', kickUsername, '(webhook mode)')
    for (const delay of [3000, 8000, 20000]) {
      setTimeout(() => {
        if (this._destroyed || !this.channels.has(kickUsername)) return
        if ((this.channels.get(kickUsername)?.size || 0) >= 200) return
        this._refreshFromBg(kickUsername)
      }, delay)
    }
  }

  part(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (!this.channels.has(kickUsername)) return
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: kickUsername } })
    this.channels.delete(kickUsername)
    this._chanLastSeen.delete(kickUsername)
    this._chanRejoinAttempts.delete(kickUsername)
    log('Kick parted', kickUsername)
  }

  getMessages(kickUsername) {
    return this.channels.get(kickUsername?.toLowerCase())?.getAll() || []
  }

  on(e, fn) {
    if (!this.handlers.has(e)) this.handlers.set(e, new Set())
    this.handlers.get(e).add(fn)
  }

  emit(e, d) {
    this.handlers.get(e)?.forEach(fn => {
      try { fn(d) } catch (err) { console.error('[heatsync-kick] handler err:', err) }
    })
  }
}
