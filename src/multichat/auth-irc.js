// Auth IRC - authenticated Twitch IRC connection for sending messages

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

function authIrcAlive() {
  return authState.ws?.readyState === WebSocket.OPEN && authState.ready
}

function cleanupAuthIrc(destroy = false) {
  if (destroy) authState.destroyed = true;
  if (authState.keepaliveTimer) { cleanup.clearInterval(authState.keepaliveTimer); authState.keepaliveTimer = null; }
  if (authState.reconnectTimer) { cleanup.clearTimeout(authState.reconnectTimer); authState.reconnectTimer = null; }
  const prevJoined = [...authState.joined];
  if (authState.ws) {
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
    if (line.includes('NOTICE') && MC_DEBUG) console.warn('[HS] Auth IRC NOTICE:', line.slice(0, 200));
    if (line.includes('RECONNECT')) {
      log('Auth IRC: Twitch sent RECONNECT');
      const prev = cleanupAuthIrc();
      scheduleReconnect(prev);
      return;
    }
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
  log(`Auth IRC reconnect in ${delay}ms...`);
  authState.reconnectTimer = setTimeout(async () => {
    authState.reconnectTimer = null;
    if (authState.destroyed || authIrcAlive()) return;
    const ok = await connectAuthIrc(authState.token, authState.nick);
    if (ok === true) {
      for (const ch of (prevChannels || [])) await joinChannel(ch);
      drainSendQueue();
      log('Auth IRC reconnected, rejoined:', (prevChannels || []).join(', ') || '(none)');
    } else if (ok !== 'auth_failed') {
      scheduleReconnect(prevChannels);
    }
  }, delay);
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
      const timeout = setTimeout(() => reject(new Error('timeout')), 8000);
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
          clearTimeout(timeout);
          resolve();
        }
        if (event.data.includes('Login authentication failed') || event.data.includes('Login unsuccessful')) {
          clearTimeout(timeout);
          reject(new Error('auth_failed'));
        }
        for (const l of event.data.split('\r\n')) {
          if (l.startsWith('PING')) try { ws.send(l.replace('PING', 'PONG') + '\r\n'); } catch {}
        }
      };
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('ws_error')); };
      ws.onclose = () => { clearTimeout(timeout); reject(new Error('ws_closed')); };
    });
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
    const timer = setTimeout(() => {
      authState.joinWaiters.delete(channel);
      authState.joined.add(channel);
      resolve(true);
    }, 500);
    authState.joinWaiters.set(channel, { resolve, timer });
  });
}

function drainSendQueue() {
  while (authState.sendQueue.length && authIrcAlive()) {
    const { channel, text } = authState.sendQueue.shift();
    try {
      authState.ws.send(`PRIVMSG #${channel} :${text}\r\n`);
      log('Drained queued msg to #' + channel);
    } catch {
      authState.sendQueue.unshift({ channel, text });
      break;
    }
  }
}

async function sendIrcMessage(channel, text, token, replyParentId) {
  const nick = currentUsername || getCurrentUsername();
  if (!nick) { console.warn('[HS] SEND FAIL: no username'); return 'no_user'; }
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
          return true;
        }
      }
      if (!authState.joined.has(channel)) await joinChannel(channel);
      if (!authIrcAlive()) {
        if (attempt < 2) { cleanupAuthIrc(); continue; }
        if (authState.sendQueue.length < MAX_SEND_QUEUE) authState.sendQueue.push({ channel, text });
        scheduleReconnect([channel]);
        return true;
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
        return true;
      }
    }
  }
  return 'send_error';
}
