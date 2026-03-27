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
        text: text,
        color: sanitizeColor(tags.color || '#fff'),
        badges: tags.badges || '',
        channel: channel || privmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || '',
        replyTo: tags['reply-parent-display-name'] ? {
          user: decodeURIComponent(tags['reply-parent-display-name']),
          text: tags['reply-parent-msg-body'] ? decodeURIComponent(tags['reply-parent-msg-body'].replace(/\\s/g, ' ')) : ''
        } : null
      }
      if (isAction) msg.isAction = true
      if (tags['custom-reward-id']) msg.redeemed = true
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
        id: tags.id || ''
      }
    }

    // NOTICE: @tags :tmi.twitch.tv NOTICE #channel :message
    // (also used by clearchatToNotice=true from recent-messages API)
    const notice = raw.match(/NOTICE #([^ ]+) :(.+)$/)
    if (notice) {
      return {
        type: 'notice',
        user: 'system',
        text: notice[2],
        color: '#999',
        badges: '',
        channel: channel || notice[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: notice[2]
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
        : 'Chat was cleared'
      return {
        type: 'notice',
        user: 'system',
        text,
        color: '#999',
        badges: '',
        channel: channel || clearchat[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: tags.id || `clearchat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: text
      }
    }

    // CLEARMSG: @tags :tmi.twitch.tv CLEARMSG #channel :deleted message text
    // (single message deletion)
    const clearmsg = raw.match(/CLEARMSG #([^ ]+) :(.+)$/)
    if (clearmsg) {
      const targetMsgId = tags['target-msg-id']
      return {
        type: 'notice',
        user: 'system',
        text: `Message from ${tags.login || 'unknown'} deleted`,
        color: '#999',
        badges: '',
        channel: channel || clearmsg[1].toLowerCase(),
        time: parseInt(tags['tmi-sent-ts']) || parseInt(tags['rm-received-ts']) || Date.now(),
        id: targetMsgId || `clearmsg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        systemMsg: `Message from ${tags.login || 'unknown'} deleted`
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
    this._ac = new AbortController();
    // Reconnect when tab becomes visible after silence
    document.addEventListener('visibilitychange', () => {
      if (this._destroyed) return;
      if (document.visibilityState === 'visible' && this.channels.size > 0) {
        const silence = Date.now() - this._lastData;
        if (silence > 60000 || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
          log('Tab visible after', Math.round(silence / 1000), 's silence, reconnecting');
          this._forceReconnect();
          // Reload history to fill gap from sleep
          for (const ch of this.channels.keys()) {
            this.loadHistory(ch);
          }
        }
      }
    }, { signal: this._ac.signal });
  }

  connect() {
    if (this._destroyed) return;
    this._stopHeartbeat();
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      try { this.ws.onclose = null; this.ws.close(); } catch {}
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
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this._stopHeartbeat();
        if (!this._destroyed) this._scheduleReconnect();
        return;
      }
      const silence = Date.now() - this._lastData;
      if (silence > 90000) {
        log('Zombie detected —', Math.round(silence / 1000), 's silence');
        this._forceReconnect();
        return;
      }
      try { this.ws.send('PING :heatsync\r\n'); } catch {
        this._forceReconnect();
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
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
    this._reconnectAttempts = 0;
    if (!this._destroyed) this.connect();
  }

  _scheduleReconnect() {
    if (this._destroyed) return;
    clearTimeout(this._reconnectTimer);
    const delay = Math.min(2000 * Math.pow(2, this._reconnectAttempts), 30000);
    this._reconnectAttempts++;
    log('Reconnecting in', delay, 'ms (attempt', this._reconnectAttempts, ')');
    this._reconnectTimer = setTimeout(() => {
      if (!this._destroyed) this.connect();
    }, delay);
  }

  parse(data) {
    this._lastData = Date.now();
    this.partial += data;
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
      if (msg && !msg.type) {
        // PRIVMSG
        const ch = msg.channel;
        usernameCache.add(msg.user);
        knownColors.set(msg.user.toLowerCase(), msg.color);
        if (usernameCache.size > 500) {
          usernameCache.delete(usernameCache.values().next().value);
          const oldest = knownColors.keys().next().value;
          knownColors.delete(oldest);
        }
        fetchChannelBadges(ch);

        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.emit('message', msg);
        }
      } else if (msg && (msg.type === 'usernotice' || msg.type === 'notice')) {
        const ch = msg.channel;
        if (msg.user !== 'system') {
          usernameCache.add(msg.user);
          knownColors.set(msg.user.toLowerCase(), msg.color);
        }
        fetchChannelBadges(ch);
        if (this.channels.has(ch)) {
          this.channels.get(ch).push(msg);
          this.emit('message', msg);
        }
      }
    }
  }

  join(ch) {
    ch = ch.toLowerCase();
    if (this.channels.has(ch)) return;
    this.channels.set(ch, new CircularBuffer(1500));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(`JOIN #${ch}\r\n`);
    }
    log('Joined', ch);
    // Load message history
    this.loadHistory(ch);
  }

  async loadHistory(ch) {
    const buffer = this.channels.get(ch);
    if (!buffer) return;

    const cacheKey = `hs_chat_history_${ch}`;
    const CACHE_TTL = 300000; // 5 min

    // 1. Try localStorage cache for instant render
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { messages, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL && messages?.length > 0) {
          log('Cache hit:', messages.length, 'msgs for', ch);
          for (const msg of messages) {
            usernameCache.add(msg.user);
            knownColors.set(msg.user.toLowerCase(), msg.color);
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

    // 2. No valid cache — fetch synchronously
    await this._fetchHistory(ch, buffer, cacheKey);
  }

  async _fetchHistory(ch, buffer, cacheKey, attempt = 0) {
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
        usernameCache.add(msg.user);
        knownColors.set(msg.user.toLowerCase(), msg.color);
        if (msg.subMonths) trackSubTenure(ch, msg.user, msg.subMonths);
        parsed.push(msg);
      }

      // Merge: clear buffer, add history first, then any live messages on top
      buffer.clear();
      for (const msg of parsed) buffer.push(msg);
      for (const msg of liveMessages) buffer.push(msg);

      log('Loaded history for', ch, '- parsed:', parsed.length, 'total:', buffer.getAll().length);

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
    }
  }

  part(ch) {
    ch = ch.toLowerCase();
    if (!this.channels.has(ch)) return;
    this.channels.delete(ch);
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
  }

  connect() {
    if (this._destroyed) return
    if (this._listener) return

    // Listen for kick chat messages relayed from background.js
    this._listener = (message) => {
      if (message.type === 'kick_chat_message' && message.data) {
        const d = message.data
        const channel = d.channel?.toLowerCase()
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
            user: d.replyTo.username,
            text: d.replyTo.content || ''
          } : null
        }
        this.channels.get(channel).push(msg)
        this.emit('message', msg)
      }

      // KICKs gifted events (Kick's equivalent of Twitch Bits)
      if (message.type === 'kick_kicks_event') {
        const channel = message.channel?.toLowerCase()
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
        this.emit('message', msg)
      }

      // Kick subscription events (new sub, resub, gift subs)
      if (message.type === 'kick_sub_event') {
        const channel = message.channel?.toLowerCase()
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
        this.emit('message', msg)
      }
    }
    chrome.runtime?.onMessage?.addListener(this._listener)
    log('Kick chat listener registered (webhook mode)')
  }

  destroy() {
    this._destroyed = true
    if (this._listener) {
      chrome.runtime?.onMessage?.removeListener(this._listener)
      this._listener = null
    }
    // Leave all channels
    for (const username of this.channels.keys()) {
      safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: username } })
    }
    this.channels.clear()
  }

  async join(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (this.channels.has(kickUsername)) return
    this.channels.set(kickUsername, new CircularBuffer(1500))
    // Tell background to join kick channel via HeatSync WS
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:join', platform: 'kick', channel: kickUsername } })
    log('Kick joined', kickUsername, '(webhook mode)')
  }

  part(kickUsername) {
    kickUsername = kickUsername.toLowerCase()
    if (!this.channels.has(kickUsername)) return
    safeSendMessage({ type: 'ws_send', data: { type: 'channel:leave', platform: 'kick', channel: kickUsername } })
    this.channels.delete(kickUsername)
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
