// Mentions/notifications - keyword detection, browser notifications, scan existing chat

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Aliases — kick + youtube usernames in addition to currentUsername (twitch).
// Populated by loadHsUsername() in social.js from user_info.kick_username etc.
let mentionAliases = new Set()
let _mentionReList = null
let _mentionReKey = ''

function getMentionTargets() {
  const out = []
  if (currentUsername) out.push(currentUsername)
  for (const a of mentionAliases) {
    if (a && a !== currentUsername) out.push(a)
  }
  return out
}

function isMention(msg) {
  const targets = getMentionTargets()
  if (!targets.length) return false
  const sender = msg.user?.toLowerCase()
  if (sender && targets.includes(sender)) return false
  const text = msg.text.toLowerCase()
  for (const t of targets) {
    if (text.includes('@' + t)) return true
  }
  const key = targets.join('|')
  if (_mentionReKey !== key) {
    _mentionReList = targets.map(t => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i'))
    _mentionReKey = key
  }
  for (const re of _mentionReList) {
    if (re.test(text)) return true
  }
  return false
}

// Browser notifications (gated by hs_notifications setting)
let notificationsEnabled = false
let notificationPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied'
api.storage.local.get('hs_notifications').then(data => {
  notificationsEnabled = data.hs_notifications === true
  // Request permission on Firefox (Chrome extensions get it automatically)
  if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
    Notification.requestPermission().then(p => { notificationPermission = p })
  }
})
if (!window._hsMcNotifStorageListener) {
  window._hsMcNotifStorageListener = true
  api.storage.onChanged.addListener((changes) => {
    if (changes.hs_notifications) {
      notificationsEnabled = changes.hs_notifications.newValue === true
      if (notificationsEnabled && notificationPermission === 'default' && typeof Notification !== 'undefined') {
        Notification.requestPermission().then(p => { notificationPermission = p })
      }
    }
  })
}

function fireNotification(title, body, tag) {
  if (!notificationsEnabled) return
  if (notificationPermission === 'denied') return
  try {
    const iconUrl = api.runtime.getURL('icon-48.png')
    const n = new Notification(title, { body, icon: iconUrl, tag, silent: false })
    n.onclick = () => { window.focus(); n.close() }
    cleanup.setTimeout(() => n.close(), 8000)
  } catch {}
}

function notifyMention(msg) {
  if (!notificationsEnabled) return
  if (document.hasFocus()) return
  const channel = msg.channel ? ` in #${msg.channel}` : ''
  const title = `${msg.user}${channel}`
  const body = msg.text.length > 200 ? msg.text.slice(0, 200) + '...' : msg.text
  fireNotification(title, body, 'hs-mention-' + Date.now())
}

function notifyStreamEvent(channel, eventType, game) {
  if (!notificationsEnabled) return
  if (document.hasFocus()) return
  let title, body
  if (eventType === 'stream:online') {
    title = `${channel} went live`
    body = game || ''
  } else if (eventType === 'stream:update') {
    title = `${channel} switched game`
    body = game || ''
  } else {
    return
  }
  fireNotification(title, body, `hs-stream-${channel}-${Date.now()}`)
}

/**
 * Scan existing chat messages in DOM for mentions (on load)
 */
function scanExistingMentions() {
  const targets = getMentionTargets()
  if (!targets.length) {
    log('Cannot scan mentions - no username');
    return;
  }

  // Twitch + Kick message selectors
  const messages = document.querySelectorAll('[data-a-target="chat-line-message"], #chatroom-messages [data-index]');
  log('Scanning', messages.length, 'existing messages for mentions of', targets.join(','));

  let found = 0;
  const mentionRes = targets.map(t => new RegExp(`\\b${escapeRegex(t)}\\b`, 'i'))
  messages.forEach(msgEl => {
    // Only check message text, not the full element (which includes sender name)
    const messageEl = msgEl.querySelector('[data-a-target="chat-message-text"], span.font-normal');
    const text = messageEl?.textContent || '';
    const textLower = text.toLowerCase();
    let matched = false
    for (const t of targets) {
      if (textLower.includes('@' + t)) { matched = true; break }
    }
    if (!matched) {
      for (const re of mentionRes) {
        if (re.test(textLower)) { matched = true; break }
      }
    }
    if (matched) {
      const usernameEl = msgEl.querySelector('[data-a-target="chat-message-username"], button.inline.font-bold');
      const username = usernameEl?.textContent || 'unknown';
      // Skip own messages
      if (targets.includes(username.toLowerCase())) return;

      mentionsBuffer.push({
        user: username,
        text: text,
        color: '#fff',
        channel: getCurrentChannel() || 'live',
        time: Date.now() - (messages.length - found) * 1000 // Approximate time
      });
      if (mentionsBuffer.length > MAX_BUFFER) mentionsBuffer.splice(0, mentionsBuffer.length - MAX_BUFFER);
      found++;
    }
  });

  if (found > 0) {
    log('Found', found, 'existing mentions');
    updateTabIndicator('mentions');
  }
}
