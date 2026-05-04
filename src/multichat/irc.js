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
          threadId: tags['reply-thread-parent-msg-id'] || tags['reply-parent-msg-id'] || ''
        } : null
      }
      // Parse Twitch IRC emote positions → { name: url } map for rendering
      // Format: emoteId:start-end,start-end/emoteId:start-end
      if (tags.emotes) {
        const twitchEmotes = {}
        for (const part of tags.emotes.split('/')) {
          const [emoteId, posStr] = part.split(':')
          if (!emoteId || !posStr) continue
          const firstPos = posStr.split(',')[0]
          const [start, end] = firstPos.split('-').map(Number)
          if (isNaN(start) || isNaN(end)) continue
          const name = text.slice(start, end + 1)
          if (name && !twitchEmotes[name]) {
            twitchEmotes[name] = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`
          }
        }
        if (Object.keys(twitchEmotes).length > 0) msg.twitchEmotes = twitchEmotes
      }
      if (isAction) msg.isAction = true
      const bits = parseInt(tags.bits) || 0
      if (bits > 0) msg.bits = bits
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
      return {
        user: displayName,
        text: usernotice[2] || '',
        systemMsg: decodeURIComponent((tags['system-msg'] || '').replace(/\\s/g, ' ')),
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || usernotice[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        type: 'usernotice',
        msgId: tags['msg-id'] || '',
        subTier: tier,
        subMonths: months,
        giftCount,
        recipient,
        raidViewers,
        raidFrom,
        announceColor,
        bitsTier,
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
  constructor() {
    this.ws = null;
    this.channels = new Map();
    this.handlers = new Map();
    this.partial = '';
    this.nick = `justinfan${Math.floor(Math.random() * 99999)}`;
    this._destroyed = false;
    this._lastData = 0;
    this._heartbeatTimer = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    // Per-channel watchdog: catches the silently-dropped-channel case where
    // the ws stays alive (PINGs answered, other channels' PRIVMSGs keep
    // _lastData fresh) but Twitch quietly stops delivering one channel's
    // messages. The global zombie detector misses it; this catches it.
    this._chanLastSeen = new Map();      // ch -> ms (any line for this channel)
    this._chanRejoinAttempts = new Map(); // ch -> count (cleared on healthy traffic)
    this._ac = new AbortController();
    // Reconnect when tab becomes visible after silence
    document.addEventListener('visibilitychange', () => {
      if (this._destroyed) return;
      if (document.visibilityState === 'visible' && this.channels.size > 0) {
        const silence = Date.now() - this._lastData;
        // Tighter than before (was 60s) — visible-tab silence > 30s while
        // chat is supposedly live is already suspicious.
        if (silence > 30000 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          log('Tab visible after', Math.round(silence / 1000), 's silence, reconnecting');
          this._forceReconnect();
          // Reload history to fill gap from sleep
          for (const ch of this.channels.keys()) {
            this.loadHistory(ch);
          }
        }
      }
    }, { signal: this._ac.signal });
    // Network transitions — react immediately instead of waiting for
    // backoff timers. Online == kick a fresh connect, offline == stop
    // burning retries against a dead network.
    window.addEventListener('online', () => {
      if (this._destroyed) return;
      log('Network online — force reconnect');
      this._reconnectAttempts = 0;
      this._forceReconnect();
    }, { signal: this._ac.signal });
    window.addEventListener('offline', () => {
      if (this._destroyed) return;
      log('Network offline — pausing reconnect');
      cleanup.clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
      this._stopHeartbeat();
    }, { signal: this._ac.signal });
  }

  // Mark a channel as healthy whenever we see any traffic for it (PRIVMSG,
  // USERNOTICE, NOTICE, ROOMSTATE, USERSTATE, CLEARCHAT, CLEARMSG, JOIN echo).
  // Disarms the per-channel watchdog and clears any in-flight rejoin attempts.
  _touchChannel(ch) {
    if (!ch) return;
    this._chanLastSeen.set(ch, Date.now());
    if (this._chanRejoinAttempts.size) this._chanRejoinAttempts.delete(ch);
  }

  connect() {
    if (this._destroyed) return;
    this._stopHeartbeat();
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.partial = '';

    const connectTimeout = setTimeout(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) {
        log('IRC connect timeout');
        try { this.ws.close(); } catch {}
      }
    }, 10000);

    this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    this.ws.onopen = () => {
      clearTimeout(connectTimeout);
      log('IRC connected');
      this._reconnectAttempts = 0;
      this._lastData = Date.now();
      // Fresh grace for every channel — none have spoken on this socket yet,
      // so the watchdog must wait the full silence threshold before tripping.
      // Also clear any stale rejoin counters from the previous socket.
      const now = Date.now();
      for (const ch of this.channels.keys()) this._chanLastSeen.set(ch, now);
      this._chanRejoinAttempts.clear();
      this.ws.send(`NICK ${this.nick}\r\n`);
      this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      for (const ch of this.channels.keys()) {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(`JOIN #${ch}\r\n`);
      }
      this._startHeartbeat();
      fetchGlobalBadges();
      const currentCh = getCurrentChannel();
      if (currentCh) fetchChannelBadges(currentCh);
    };
    this.ws.onmessage = (e) => this.parse(e.data);
    this.ws.onerror = () => { clearTimeout(connectTimeout); };
    this.ws.onclose = () => {
      clearTimeout(connectTimeout);
      this._stopHeartbeat();
      if (this._destroyed) return;
      this._scheduleReconnect();
    };
  }

  destroy() {
    this._destroyed = true;
    this._ac?.abort();
    this._stopHeartbeat();
    cleanup.clearTimeout(this._reconnectTimer);
    for (const id of Object.values(this._persistTimers)) cleanup.clearTimeout(id);
    this._persistTimers = {};
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = cleanup.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this._stopHeartbeat();
        if (!this._destroyed) this._scheduleReconnect();
        return;
      }
      const now = Date.now();
      const silence = now - this._lastData;
      if (silence > 90000) {
        log('Zombie detected —', Math.round(silence / 1000), 's silence');
        this._forceReconnect();
        return;
      }
      try { this.ws.send('PING :heatsync\r\n'); } catch {
        this._forceReconnect();
        return;
      }

      // Per-channel watchdog. The global zombie detector above misses the
      // case where Twitch silently stops delivering for ONE channel — other
      // channels keep refreshing _lastData. PART+JOIN forces a fresh sub
      // and Twitch responds with ROOMSTATE within seconds, which touches
      // _chanLastSeen via parse(). Two failed rejoins → full reconnect.
      for (const ch of this.channels.keys()) {
        const last = this._chanLastSeen.get(ch) || 0;
        if (!last) continue;
        const chSilence = now - last;
        // 2-min threshold. Heartbeat fires every 30s, so worst-case dead
        // window is 150s before we re-JOIN. Trades a tiny re-sub churn
        // on quiet channels (mostly stream-offline chats) for fast
        // recovery on busy ones — busy channels never trip this anyway.
        if (chSilence < 120000) continue;

        const attempts = this._chanRejoinAttempts.get(ch) || 0;
        if (attempts >= 2) {
          log('Channel', ch, 'unresponsive after', attempts, 're-JOINs — full reconnect');
          this._chanRejoinAttempts.clear();
          this._forceReconnect();
          return;
        }
        log('Channel', ch, 'silent for', Math.round(chSilence / 1000), 's — PART+JOIN to re-subscribe');
        try {
          this.ws.send(`PART #${ch}\r\n`);
          this.ws.send(`JOIN #${ch}\r\n`);
          // Disarm for one cycle; ROOMSTATE on the JOIN will re-touch us.
          this._chanLastSeen.set(ch, now);
          this._chanRejoinAttempts.set(ch, attempts + 1);
        } catch {
          this._forceReconnect();
          return;
        }
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      cleanup.clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _forceReconnect() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    // Don't reset attempts here — visibilitychange while the network is
    // still flapping would defeat backoff and slam the server every 2 s.
    // Only the onopen handler resets to 0.
    if (!this._destroyed) this.connect();
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    // If we know we're offline, don't burn retries — the online listener
    // will fire a fresh _forceReconnect when the network comes back.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      log('Skipping reconnect — navigator.onLine is false');
      return;
    }
    cleanup.clearTimeout(this._reconnectTimer);
    // Cap at 15s (was 30s) — a long-running stream can't tolerate half-minute
    // gaps when recovering from a transient network blip.
    const delay = Math.min(2000 * Math.pow(2, this._reconnectAttempts), 15000);
    this._reconnectAttempts++;
    log('Reconnecting in', delay, 'ms (attempt', this._reconnectAttempts, ')');
    // Surface persistent failure to DevTools — silent infinite retry leaves
    // users wondering why chat is dead.
    if (this._reconnectAttempts === 3) {
      console.warn('[heatsync-irc] connection failing — 3 retries, will keep trying with backoff');
    }
    this._reconnectTimer = cleanup.setTimeout(() => {
      if (!this._destroyed) this.connect();
    }, delay);
  }

  parse(data) {
    this._lastData = Date.now();
    this.partial += data;
    // Cap partial buffer to prevent unbounded growth on malformed data
    if (this.partial.length > 65536) this.partial = ''
    const lines = this.partial.split('\r\n');
    this.partial = lines.pop();
    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('PING')) {
        try { this.ws.send('PONG :tmi.twitch.tv\r\n'); } catch {}
        continue;
      }
      if (line.startsWith(':tmi.twitch.tv PONG') || line.startsWith('PONG')) continue;
      if (line.includes('RECONNECT')) {
        log('Server requested RECONNECT');
        this._forceReconnect();
        return;
      }
      const msg = parseIrcLine(line);
      // Touch the per-channel watchdog for ANY parsed line that names a
      // channel — PRIVMSG, USERNOTICE, NOTICE, ROOMSTATE, USERSTATE,
      // CLEARCHAT, CLEARMSG, JOIN echo all qualify. This is the single
      // source of truth for "this channel is still alive on this socket".
      if (msg?.channel) this._touchChannel(msg.channel);
      if (msg && !msg.type) {
        // PRIVMSG
        const ch = msg.channel;
        if (msg.user) {
          usernameCache.add(msg.user);
          setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId);
        }
        if (usernameCache.size > 500) {
          const evicted = usernameCache.values().next().value;
          usernameCache.delete(evicted);
          knownColors.delete(evicted.toLowerCase());
        }
        fetchChannelBadges(ch);

        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.persistBuffer(ch);
          this.emit('message', msg);
        }
      } else if (msg && (msg.type === 'usernotice' || msg.type === 'notice')) {
        const ch = msg.channel;
        if (msg.user !== 'system') {
          if (msg.user) {
            usernameCache.add(msg.user)
            setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
          }
        }
        fetchChannelBadges(ch);
        // CLEARCHAT (ban/timeout) — flag the target's recent messages as cleared
        // so they render dimmed/struck-through (Twitch native behavior).
        if (msg.noticeType === 'ban_success' || msg.noticeType === 'timeout_success') {
          const targetLc = (msg.targetUser || '').toLowerCase()
          if (targetLc && this.channels.has(ch)) {
            const buffer = this.channels.get(ch)
            const all = buffer.getAll()
            for (const m of all) {
              if (m.user && m.user.toLowerCase() === targetLc && !m.cleared) {
                m.cleared = true
                m.clearedReason = msg.banDuration ? `timed out (${msg.banDuration}s)` : 'banned'
              }
            }
          }
        }
        // CLEARMSG — flag the single targeted message
        if (msg.noticeType === 'delete_message_success' && msg.targetMsgId) {
          const id = msg.targetMsgId
          if (this.channels.has(ch)) {
            const buffer = this.channels.get(ch)
            const all = buffer.getAll()
            for (const m of all) {
              if (m.id === id) { m.cleared = true; m.clearedReason = 'deleted'; break }
            }
          }
        }
        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.persistBuffer(ch);
          this.emit('message', msg);
        }
      } else if (msg && msg.type === 'roomstate') {
        // Diff against last-seen state to only emit on actual changes (skip the
        // initial JOIN dump which carries the full state).
        const ch = msg.channel
        if (!this._roomstates) this._roomstates = new Map()
        const prev = this._roomstates.get(ch) || {}
        const changes = []
        // null = field not present in this packet (only changed fields are sent)
        if (msg.slow != null && msg.slow !== prev.slow) {
          changes.push(msg.slow > 0 ? `slow mode on (${msg.slow}s)` : 'slow mode off')
        }
        if (msg.subsOnly != null && msg.subsOnly !== prev.subsOnly) {
          changes.push(msg.subsOnly ? 'sub-only mode on' : 'sub-only mode off')
        }
        if (msg.emoteOnly != null && msg.emoteOnly !== prev.emoteOnly) {
          changes.push(msg.emoteOnly ? 'emote-only mode on' : 'emote-only mode off')
        }
        if (msg.followersOnly != null && msg.followersOnly !== prev.followersOnly) {
          if (msg.followersOnly === -1) changes.push('follower-only mode off')
          else if (msg.followersOnly === 0) changes.push('follower-only mode on')
          else changes.push(`follower-only mode on (${msg.followersOnly}m)`)
        }
        if (msg.r9k != null && msg.r9k !== prev.r9k) {
          changes.push(msg.r9k ? 'unique-chat mode on' : 'unique-chat mode off')
        }
        // Update cached state with whatever fields were present
        const newState = { ...prev }
        for (const k of ['slow', 'subsOnly', 'emoteOnly', 'followersOnly', 'r9k']) {
          if (msg[k] != null) newState[k] = msg[k]
        }
        this._roomstates.set(ch, newState)
        // Only emit if there were diffs AND we already had a baseline (skip first JOIN dump)
        if (changes.length && Object.keys(prev).length) {
          for (const text of changes) {
            const evt = {
              type: 'notice',
              noticeType: 'mode_change',
              user: 'system',
              text,
              color: '#808080',
              badges: '',
              channel: ch,
              time: Date.now(),
              id: `mode-${ch}-${Date.now()}-${text.slice(0, 16)}`,
              systemMsg: text
            }
            if (this.channels.has(ch)) {
              this.channels.get(ch).push(evt)
              this.persistBuffer(ch)
              this.emit('message', evt)
            }
          }
        }
      }
    }
  }

  join(ch) {
    ch = ch.toLowerCase();
    if (this.channels.has(ch)) return;
    this.channels.set(ch, new CircularBuffer(1500));
    // Seed watchdog clock — gives this channel the full silence threshold
    // before the watchdog can trip, even if no messages arrive yet.
    this._chanLastSeen.set(ch, Date.now());
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`JOIN #${ch}\r\n`);
    }
    log('Joined', ch);
    // Load message history
    this.loadHistory(ch);
  }

  // Persist buffers to chrome.storage.local (debounced)
  _persistTimers = {}
  _PERSIST_MAX = 200
  _historyInFlight = new Set()

  persistBuffer(ch) {
    if (this._persistTimers[ch]) return
    this._persistTimers[ch] = cleanup.setTimeout(() => {
      try {
        delete this._persistTimers[ch]
        if (!chrome?.runtime?.id) return
        const buffer = this.channels.get(ch)
        if (!buffer) return
        const msgs = buffer.getAll().slice(-this._PERSIST_MAX).map(m => ({
          user: m.user, userId: m.userId, text: m.text, color: m.color,
          badges: m.badges, channel: m.channel, time: m.time, id: m.id,
          isAction: m.isAction || undefined, replyTo: m.replyTo || undefined,
          subMonths: m.subMonths || undefined, twitchEmotes: m.twitchEmotes || undefined,
          type: m.type || undefined, eventClass: m.eventClass || undefined,
          noticeType: m.noticeType || undefined, msgId: m.msgId || undefined,
          subTier: m.subTier || undefined, giftCount: m.giftCount || undefined,
          recipient: m.recipient || undefined, raidViewers: m.raidViewers || undefined,
          raidFrom: m.raidFrom || undefined, systemMsg: m.systemMsg || undefined,
          isFirstMsg: m.isFirstMsg || undefined, isHighlighted: m.isHighlighted || undefined,
          redeemed: m.redeemed || undefined, rewardId: m.rewardId || undefined,
          actor: m.actor || undefined,
          cleared: m.cleared || undefined, clearedReason: m.clearedReason || undefined,
          targetUser: m.targetUser || undefined, targetMsgId: m.targetMsgId || undefined,
          banDuration: m.banDuration || undefined
        }))
        const p = chrome.storage.local.set({ [`hs_irc_${ch}`]: { msgs, ts: Date.now() } })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }, 5000)
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch);
    if (!buffer) return;

    const cacheKey = `hs_chat_history_${ch}`;
    const storageKey = `hs_irc_${ch}`

    // 1. Try chrome.storage.local (own persisted messages — survives refresh reliably)
    try {
      const stored = await chrome.storage.local.get(storageKey)
      const data = stored[storageKey]
      if (data?.msgs?.length > 0 && Date.now() - data.ts < 86400000) {
        // Filter out 7TV emote change system messages that leaked into buffers
        // Normalize + dedup stream events that were saved multiple times
        const seenEventTexts = new Set()
        const filtered = data.msgs.filter(m => {
          const t = m.text || m.systemMsg || ''
          if (t.includes('removed from channel') || t.includes('added to channel') ||
              t.includes('removed 7TV emote') || t.includes('added 7TV emote')) return false
          // Normalize + dedup stream events by text
          // Detect stream events by type OR by text pattern (old persisted events may lack type)
          const isStreamEvent = m.type === 'stream-event' || (m.text && m.text.includes('\u25C6') && !m.user)
          if (isStreamEvent && m.text) {
            // Restore type if missing (old persisted events)
            if (!m.type) m.type = 'stream-event'
            // Normalize old "channel ◆" format to "[channel] ◆"
            if (!m.text.startsWith('[')) {
              const em = m.text.match(/^([a-zA-Z0-9_]+) \u25C6/)
              if (em) m.text = `[${em[1]}]` + m.text.slice(em[1].length)
            }
            if (seenEventTexts.has(m.text)) return false
            seenEventTexts.add(m.text)
          }
          return true
        })
        log('Storage hit:', filtered.length, 'msgs for', ch)
        for (const msg of filtered) {
          msg.isHistory = true
          if (msg.user) {
            usernameCache.add(msg.user)
            setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
          }
          if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths)
          buffer.push(msg)
        }
        if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
          renderMessages(currentTab)
        }
        // Refresh in background (robotty may have newer messages)
        this._fetchHistory(ch, buffer, cacheKey)
        return
      }
    } catch {}

    // 2. Try localStorage cache (robotty data from previous session)
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { messages, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 3600000 && messages?.length > 0) {
          log('Cache hit:', messages.length, 'msgs for', ch);
          for (const msg of messages) {
            if (msg.user) {

              usernameCache.add(msg.user)

              setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)

            }
            if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths);
            buffer.push(msg);
          }
          if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
            renderMessages(currentTab);
          }
          // Refresh in background
          this._fetchHistory(ch, buffer, cacheKey);
          return;
        }
      }
    } catch {}

    // 3. No valid cache — fetch synchronously from robotty
    await this._fetchHistory(ch, buffer, cacheKey);
  }

  async _fetchHistory(ch, buffer, cacheKey, attempt = 0) {
    if (attempt === 0) {
      if (this._historyInFlight.has(ch)) return
      this._historyInFlight.add(ch)
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      log('Fetching history for', ch, attempt > 0 ? `(retry ${attempt})` : '');
      const resp = await fetch(
        `https://recent-messages.robotty.de/api/v2/recent-messages/${ch}?limit=800&hide_moderation_messages=false&hide_moderated_messages=false&clearchatToNotice=true`,
        { signal: ctrl.signal, credentials: 'omit' }
      );
      if (!resp.ok) {
        log('History fetch failed:', resp.status);
        if (attempt < 2) {
          clearTimeout(timer);
          await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
          return this._fetchHistory(ch, buffer, cacheKey, attempt + 1);
        }
        return;
      }
      const data = await resp.json();
      if (!data.messages?.length) return;

      await fetchChannelBadges(ch);

      // Dedup only against live messages (not cached history we're replacing)
      const liveMessages = buffer.getAll().filter(m => !m.isHistory);
      const liveIds = new Set();
      for (const m of liveMessages) {
        if (m.id) liveIds.add(m.id);
      }

      const parsed = [];
      for (const line of data.messages) {
        const msg = parseIrcLine(line, ch);
        if (!msg) continue;
        msg.isHistory = true;
        if (msg.id && liveIds.has(msg.id)) continue;
        if (msg.user) {
          usernameCache.add(msg.user)
          setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
        }
        if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths);
        parsed.push(msg);
      }

      // Merge strategy: on background refresh, only ADD newer messages — never clear
      // On initial load (empty buffer), replace entirely
      const existingAll = buffer.getAll();
      if (existingAll.length === 0) {
        // Initial load — just fill the buffer
        for (const msg of parsed) buffer.push(msg);
        log('Loaded history for', ch, '- parsed:', parsed.length);
      } else {
        // Background refresh — only add messages newer than what we have
        const latestTime = Math.max(...existingAll.map(m => m.time || 0))
        const newer = parsed.filter(m => m.time > latestTime)
        const existingIds = new Set(existingAll.filter(m => m.id).map(m => m.id))
        const dedupedNewer = newer.filter(m => !m.id || !existingIds.has(m.id))
        if (dedupedNewer.length > 0) {
          for (const msg of dedupedNewer) buffer.push(msg)
          log('Background refresh for', ch, '- added', dedupedNewer.length, 'newer messages, total:', buffer.getAll().length)
        } else {
          log('Background refresh for', ch, '- no new messages from robotty')
        }
      }

      // Persist to chrome.storage.local for reliable refresh
      this.persistBuffer(ch);

      // Cache for next time
      try {
        localStorage.setItem(cacheKey, JSON.stringify({
          messages: parsed,
          timestamp: Date.now()
        }));
      } catch {}

      if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
        renderMessages(currentTab);
      }
    } catch (e) {
      log('Failed to load history for', ch, e.message);
      clearTimeout(timer);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        return this._fetchHistory(ch, buffer, cacheKey, attempt + 1);
      }
    } finally {
      clearTimeout(timer);
      this._historyInFlight.delete(ch)
    }
  }

  part(ch) {
    ch = ch.toLowerCase();
    if (!this.channels.has(ch)) return;
    this.channels.delete(ch);
    this._chanLastSeen.delete(ch);
    this._chanRejoinAttempts.delete(ch);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`PART #${ch}\r\n`);
    }
    log('Parted', ch);
  }

  getMessages(ch) {
    return this.channels.get(ch?.toLowerCase())?.getAll() || [];
  }

  on(e, fn) {
    if (!this.handlers.has(e)) this.handlers.set(e, new Set());
    this.handlers.get(e).add(fn);
  }

  emit(e, d) {
    this.handlers.get(e)?.forEach(fn => fn(d));
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
    this._PERSIST_MAX = 200
    // Per-channel watchdog. Kick traffic flows BG → runtime.sendMessage →
    // this._listener; if anything between us and the heatsync server drops
    // a sub silently (BG WS reconnected before our ws_send made it through,
    // server lost the join state, etc.) we'd never know. Watchdog re-asserts
    // channel:join when a channel goes too quiet.
    this._chanLastSeen = new Map()
    this._chanRejoinAttempts = new Map() // ch -> escalation count
    this._watchdogTimer = null
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
      if (message.type === 'kick_chat_message' && message.data) {
        const d = message.data
        const channel = d.channel?.toLowerCase()
        this._touchChannel(channel)
        if (!channel || !this.channels.has(channel)) return
        // Convert Kick badge objects [{name,version}] to Twitch-style "name/version" string
        const badgeStr = Array.isArray(d.badges)
          ? d.badges.map(b => `${b.name || 'badge'}/${b.version || '1'}`).join(',')
          : ''
        const msg = {
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
          usernameCache.add(msg.user)
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
    if (this._persistTimers[ch]) return
    this._persistTimers[ch] = cleanup.setTimeout(() => {
      try {
        delete this._persistTimers[ch]
        if (!chrome?.runtime?.id) return
        const buffer = this.channels.get(ch)
        if (!buffer) return
        const msgs = buffer.getAll().slice(-this._PERSIST_MAX).map(m => ({
          user: m.user, text: m.text, color: m.color, badges: m.badges,
          channel: m.channel, time: m.time, platform: 'kick',
          type: m.type || undefined, systemMsg: m.systemMsg || undefined,
          replyTo: m.replyTo || undefined, kicksEvent: m.kicksEvent || undefined
        }))
        const p = chrome.storage.local.set({ [`hs_kick_${ch}`]: { msgs, ts: Date.now() } })
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {}
    }, 5000)
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch)
    if (!buffer) return
    const storageKey = `hs_kick_${ch}`
    try {
      const stored = await chrome.storage.local.get(storageKey)
      const data = stored[storageKey]
      if (data?.msgs?.length > 0 && Date.now() - data.ts < 86400000) {
        // Filter out 7TV emote change system messages and dedup stream events
        const seenEventTexts = new Set()
        const filtered = data.msgs.filter(m => {
          const t = m.text || m.systemMsg || ''
          if (t.includes('removed from channel') || t.includes('added to channel') ||
              t.includes('removed 7TV emote') || t.includes('added 7TV emote')) return false
          const isStreamEvent = m.type === 'stream-event' || (m.text && m.text.includes('\u25C6') && !m.user)
          if (isStreamEvent && m.text) {
            if (!m.type) m.type = 'stream-event'
            if (!m.text.startsWith('[')) {
              const em = m.text.match(/^([a-zA-Z0-9_]+) \u25C6/)
              if (em) m.text = `[${em[1]}]` + m.text.slice(em[1].length)
            }
            if (seenEventTexts.has(m.text)) return false
            seenEventTexts.add(m.text)
          }
          return true
        })
        log('Kick storage hit:', filtered.length, 'msgs for', ch, data.msgs.length !== filtered.length ? `(pruned ${data.msgs.length - filtered.length} spam/dupes)` : '')
        for (const msg of filtered) {
          msg.isHistory = true
          if (msg.user) {
            usernameCache.add(msg.user)
            setKnownColor(msg.user.toLowerCase(), msg.color, msg.userId)
          }
          buffer.push(msg)
        }
        if (currentTab === ch || (currentTab === 'live' && getLiveChannel() === ch)) {
          renderMessages(currentTab)
        }
      }
    } catch {}
  }

  destroy() {
    this._destroyed = true
    this._stopWatchdog()
    if (this._listener) {
      chrome.runtime?.onMessage?.removeListener(this._listener)
      this._listener = null
    }
    for (const id of Object.values(this._persistTimers)) cleanup.clearTimeout(id);
    this._persistTimers = {};
    // Leave all channels
    for (const username of this.channels.keys()) {
      safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: username } })
    }
    this.channels.clear()
    this._chanLastSeen.clear()
  }

  async join(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (this.channels.has(kickUsername)) return
    this.channels.set(kickUsername, new CircularBuffer(1500))
    // Seed watchdog clock — full grace period before re-asserting.
    this._chanLastSeen.set(kickUsername, Date.now())
    // Load persisted history before joining (so messages appear instantly)
    await this.loadHistory(kickUsername)
    // Tell background to join kick channel via HeatSync WS
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:join', platform: 'kick', channel: kickUsername } })
    log('Kick joined', kickUsername, '(webhook mode)')
  }

  part(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (!this.channels.has(kickUsername)) return
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: kickUsername } })
    this.channels.delete(kickUsername)
    this._chanLastSeen.delete(kickUsername)
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
    this.handlers.get(e)?.forEach(fn => fn(d))
  }
}
