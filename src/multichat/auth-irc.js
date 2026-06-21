// Auth IRC - authenticated Twitch IRC connection for sending messages

// Twitch NOTICE msg-id → user-friendly toast. Without this, rejected PRIVMSGs
// (slowmode/followers-only/duplicate/banned/AutoMod/...) silently clear the
// input and never echo back through the BG anonymous socket — the dominant
// "I sent it but it didn't post" symptom. The auth socket is the only socket
// Twitch sends these NOTICEs to. Set from https://dev.twitch.tv/docs/irc/msg-id/.
const TWITCH_SEND_REJECT_NOTICES = new Map([
  ['msg_followersonly', 'followers-only mode — follow the channel to chat'],
  ['msg_followersonly_followed', 'follow the channel a bit longer to chat'],
  ['msg_followersonly_zero', 'followers-only — you need to follow first'],
  ['msg_subsonly', 'subscribers-only — sub to chat here'],
  ['msg_emoteonly', 'emote-only mode — message must be all emotes'],
  ['msg_slowmode', 'slow mode — please wait a moment'],
  ['msg_r9k', 'unique-chat mode — message must be unique'],
  ['msg_duplicate', 'duplicate message — twitch rejected it'],
  ['msg_banned', 'you are banned from this channel'],
  ['msg_timedout', 'you are timed out'],
  ['msg_rejected', 'AutoMod is checking your message'],
  ['msg_rejected_mandatory', 'AutoMod blocked your message'],
  ['msg_channel_suspended', 'channel is suspended'],
  ['msg_channel_blocked', 'channel is blocking messages'],
  ['msg_verified_email', 'channel requires a verified email to chat'],
  ['msg_requires_verified_phone_number', 'channel requires a verified phone to chat'],
  ['no_permission', 'no permission to do that here'],
  ['unrecognized_cmd', 'twitch did not recognize that command'],
  ['tos_ban', 'you are banned from twitch'],
])

function parseNoticeMsgId(line) {
  // Tags arrive before the colon: @msg-id=msg_followersonly;... :tmi.twitch.tv NOTICE ...
  if (!line.startsWith('@')) return null
  const tagsEnd = line.indexOf(' ')
  if (tagsEnd === -1) return null
  for (const kv of line.slice(1, tagsEnd).split(';')) {
    const eq = kv.indexOf('=')
    if (eq === -1) continue
    if (kv.slice(0, eq) === 'msg-id') return kv.slice(eq + 1)
  }
  return null
}

const authState = {
  ws: null,
  ready: false,
  connecting: false,
  destroyed: false,
  joined: new Set(),
  joinWaiters: new Map(),
  lastData: 0,
  pongPending: false,
  token: null,
  nick: null,
  keepaliveTimer: null,
  reconnectTimer: null,
  reconnectDelay: 1000,
  sendQueue: [], // Capped at 50 — drop oldest if full
}
const MAX_SEND_QUEUE = 50
// Expose for devtools inspection — useful when "send disappears with no error"
// is reported, lets you see if the WS is dead / token missing / queued forever.
try { globalThis.__hsAuthIrc = authState } catch {}

function authIrcAlive() {
  return authState.ws?.readyState === WebSocket.OPEN && authState.ready
}

function cleanupAuthIrc(destroy = false) {
  if (destroy) authState.destroyed = true;
  if (authState.keepaliveTimer) { cleanup.clearInterval(authState.keepaliveTimer); authState.keepaliveTimer = null; }
  if (authState.reconnectTimer) { cleanup.clearTimeout(authState.reconnectTimer); authState.reconnectTimer = null; }
  const prevJoined = [...authState.joined];
  if (authState.ws) {
    authState.ws.onopen = null;
    authState.ws.onclose = null;
    authState.ws.onerror = null;
    authState.ws.onmessage = null;
    try { authState.ws.close(); } catch {}
  }
  authState.ws = null;
  authState.ready = false;
  authState.connecting = false;
  authState.lastData = 0;
  authState.pongPending = false;
  authState.joined.clear();
  for (const [, w] of authState.joinWaiters) {
    clearTimeout(w.timer);
    w.resolve(false);
  }
  authState.joinWaiters.clear();
  return prevJoined;
}

function handleAuthIrcMessage(event) {
  authState.lastData = Date.now();
  for (const line of event.data.split('\r\n')) {
    if (!line) continue;
    if (line.startsWith('PING')) {
      try { authState.ws.send(line.replace('PING', 'PONG') + '\r\n'); } catch {}
      continue;
    }
    if (line.includes('PONG')) { authState.pongPending = false; continue; }

    const joinMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv JOIN #(\w+)/);
    if (joinMatch) {
      const ch = joinMatch[2].toLowerCase();
      authState.joined.add(ch);
      const w = authState.joinWaiters.get(ch);
      if (w) { clearTimeout(w.timer); w.resolve(true); authState.joinWaiters.delete(ch); }
      continue;
    }
    const partMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PART #(\w+)/);
    if (partMatch) { authState.joined.delete(partMatch[2].toLowerCase()); continue; }
    if (line.includes(' NOTICE ')) {
      const msgId = parseNoticeMsgId(line)
      if (msgId && TWITCH_SEND_REJECT_NOTICES.has(msgId)) {
        if (typeof showToast === 'function') showToast(TWITCH_SEND_REJECT_NOTICES.get(msgId), 'error')
        // Drop pending-send tracker entries for the rejected channel so the
        // user doesn't get a second "no echo from platform" toast 20s later
        // on top of the specific reason toast above.
        const chMatch = line.match(/ NOTICE #(\w+)/)
        if (chMatch) {
          try { globalThis.__hsClearPendingByChannel?.(chMatch[1]) } catch (_) {}
        }
      }
      if (MC_DEBUG) console.warn('[HS] Auth IRC NOTICE:', line.slice(0, 200))
      continue
    }
    if (line.includes('RECONNECT')) {
      log('Auth IRC: Twitch sent RECONNECT');
      const prev = cleanupAuthIrc();
      scheduleReconnect(prev);
      return;
    }
    // Whispers arrive via IRC WHISPER with twitch.tv/commands cap (same as Chatterino)
    if (line.includes('WHISPER')) {
      const msg = parseIrcLine(line)
      if (msg?.type === 'whisper') handleIncomingWhisper(msg)
      continue
    }
    if (line.includes(' 353 ') || line.includes(' 366 ') || line.includes('ROOMSTATE')) continue;
    if (MC_DEBUG) console.warn('[HS] IRC ←', line.slice(0, 200));
  }
}

function scheduleReconnect(prevChannels) {
  if (authState.destroyed || !authState.token || !authState.nick) return;
  if (authState.reconnectTimer) return;
  const delay = authState.reconnectDelay;
  authState.reconnectDelay = Math.min(delay * 2, 30000);
  const jitteredDelay = delay + Math.random() * 500;
  log(`Auth IRC reconnect in ${delay}ms...`);
  authState.reconnectTimer = cleanup.setTimeout(async () => {
    authState.reconnectTimer = null;
    if (authState.destroyed || authIrcAlive()) return;
    const ok = await connectAuthIrc(authState.token, authState.nick);
    if (ok === true) {
      for (const ch of (prevChannels || [])) await joinChannel(ch);
      await drainSendQueue();
      log('Auth IRC reconnected, rejoined:', (prevChannels || []).join(', ') || '(none)');
    } else if (ok !== 'auth_failed') {
      scheduleReconnect(prevChannels);
    }
  }, jitteredDelay);
}

async function connectAuthIrc(token, nick) {
  if (authState.connecting) {
    for (let i = 0; i < 80; i++) {
      await new Promise(r => setTimeout(r, 100));
      if (authIrcAlive()) return true;
      if (!authState.connecting) break;
    }
    return authIrcAlive();
  }
  cleanupAuthIrc();
  authState.connecting = true;
  authState.token = token;
  authState.nick = nick;
  authState.destroyed = false;
  try {
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    authState.ws = ws;
    await new Promise((resolve, reject) => {
      const timeout = cleanup.setTimeout(() => reject(new Error('timeout')), 8000);
      ws.onopen = () => {
        ws.send(`PASS oauth:${token}\r\n`);
        ws.send(`NICK ${nick}\r\n`);
        ws.send('CAP REQ :twitch.tv/commands twitch.tv/tags\r\n');
      };
      ws.onmessage = (event) => {
        if (event.data.includes(' 001 ')) {
          authState.ready = true;
          authState.lastData = Date.now();
          authState.reconnectDelay = 1000;
          cleanup.clearTimeout(timeout);
          resolve();
        }
        if (event.data.includes('Login authentication failed') || event.data.includes('Login unsuccessful')) {
          cleanup.clearTimeout(timeout);
          reject(new Error('auth_failed'));
        }
        for (const l of event.data.split('\r\n')) {
          if (l.startsWith('PING')) try { ws.send(l.replace('PING', 'PONG') + '\r\n'); } catch {}
        }
      };
      ws.onerror = () => { cleanup.clearTimeout(timeout); reject(new Error('ws_error')); };
      ws.onclose = () => { cleanup.clearTimeout(timeout); reject(new Error('ws_closed')); };
    });
    // Release handshake closures (timeout/resolve/reject) before reassigning
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.onmessage = handleAuthIrcMessage;
    ws.onclose = () => {
      log('Auth IRC disconnected');
      const prev = cleanupAuthIrc();
      scheduleReconnect(prev);
    };
    ws.onerror = () => {};
    // Keepalive PING every 30s — detect dead sockets fast
    authState.keepaliveTimer = cleanup.setInterval(() => {
      if (!authState.ws || authState.ws.readyState !== WebSocket.OPEN) return;
      if (authState.pongPending) {
        log('Auth IRC: PONG timeout, reconnecting');
        const prev = cleanupAuthIrc();
        scheduleReconnect(prev);
        return;
      }
      authState.pongPending = true;
      try { authState.ws.send('PING :hs\r\n'); } catch {}
    }, 30000);
    authState.connecting = false;
    // Pre-join current channel so first send is instant
    const ch = getCurrentChannel()?.toLowerCase();
    if (ch) joinChannel(ch);
    return true;
  } catch (e) {
    log('Auth IRC connect failed:', e.message);
    authState.connecting = false;
    cleanupAuthIrc();
    return e.message === 'auth_failed' ? 'auth_failed' : false;
  }
}

function joinChannel(channel) {
  channel = channel.toLowerCase();
  if (authState.joined.has(channel)) return Promise.resolve(true);
  if (!authIrcAlive()) return Promise.resolve(false);
  try { authState.ws.send(`JOIN #${channel}\r\n`); } catch { return Promise.resolve(false); }
  return new Promise(resolve => {
    // Twitch JOIN ack: usually <100ms, but slow network / mid-reconnect can
    // run to ~1.5s. Old 500ms timeout + faking joined=true silently broke
    // sends for the WS lifetime — every later PRIVMSG to that channel hit
    // tmi.twitch.tv as a never-joined client and dropped without a NOTICE.
    // Now: longer timeout, no fake-success; caller retries via sendIrcMessage.
    const timer = cleanup.setTimeout(() => {
      authState.joinWaiters.delete(channel);
      resolve(false);
    }, 2000);
    authState.joinWaiters.set(channel, { resolve, timer });
  });
}

async function drainSendQueue() {
  // Join-gate every drain. A PRIVMSG to a channel we never JOINed is silently
  // dropped by tmi.twitch.tv (no NOTICE). scheduleReconnect() can lose a queued
  // channel from its rejoin list — it early-returns when a reconnect is already
  // pending (authState.reconnectTimer), discarding the prevChannels passed in —
  // so the queued message would otherwise drain into an unjoined channel. This
  // is the authoritative guard regardless of what got rejoined.
  while (authState.sendQueue.length && authIrcAlive()) {
    const { channel, text } = authState.sendQueue[0]; // peek; shift only on success
    if (!authState.joined.has(channel)) {
      const joined = await joinChannel(channel);
      // joinChannel awaits the JOIN ack (or 2s timeout). Bail if the socket died
      // mid-join or the join didn't land — leave this + the rest queued for the
      // next drain (reconnect / tab-focus / keepalive) rather than drop them.
      if (!authIrcAlive() || !joined) break;
    }
    try {
      authState.ws.send(`PRIVMSG #${channel} :${text}\r\n`);
      authState.sendQueue.shift();
      log('Drained queued msg to #' + channel);
    } catch {
      break; // leave at queue head, retry next drain
    }
  }
}

async function sendIrcMessage(channel, text, token, replyParentId, overrideNick) {
  const nick = overrideNick || currentUsername || getCurrentUsername();
  if (!nick) return 'no_user';
  channel = channel.toLowerCase();
  const prefix = replyParentId ? `@reply-parent-msg-id=${replyParentId} ` : ''

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!authIrcAlive()) {
        const result = await connectAuthIrc(token, nick);
        if (result === 'auth_failed') return 'auth_failed';
        if (!result) {
          if (attempt < 2) continue;
          if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
          scheduleReconnect([channel]);
          log('Queued message for reconnect');
          // Return 'queued' so the caller can show a yellow "queued" cue
          // instead of treating it as a clean success — message will fire
          // when (if) the WS reconnects, not now.
          return 'queued';
        }
      }
      if (!authState.joined.has(channel)) {
        const joined = await joinChannel(channel)
        // joinChannel no longer fakes success on timeout; bail to retry rather
        // than PRIVMSG into a never-joined channel (twitch drops it silently).
        if (!joined) {
          if (attempt < 2) continue;
          if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
          if (typeof showToast === 'function') showToast(`couldn't join #${channel} chat — queued`, 'error')
          return 'queued';
        }
      }
      if (!authIrcAlive()) {
        if (attempt < 2) { cleanupAuthIrc(); continue; }
        if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
        scheduleReconnect([channel]);
        return 'queued';
      }
      authState.ws.send(`${prefix}PRIVMSG #${channel} :${text}\r\n`);
      if (MC_DEBUG) console.warn('[HS] IRC SEND →', `#${channel}`, `nick=${nick}`, replyParentId ? `reply=${replyParentId}` : '', text.slice(0, 40));
      return true;
    } catch (e) {
      log('Send error attempt', attempt, ':', e.message || e);
      cleanupAuthIrc();
      if (attempt === 2) {
        if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
        scheduleReconnect([channel]);
        return 'queued';
      }
    }
  }
  return 'send_error';
}
