// Whispers - DM/whisper conversations, rendering, send

const whisperConversations = new Map() // key → { msgs, platform, userId, displayName, color, lastTime, unread }
let activeWhisperUser = null // key into map, null = conversation list
let whisperTotalUnread = 0
let whisperDmsLoaded = false // whether HeatSync DM list has been fetched

let _whisperSaveTimer = null
function whisperSaveDebounced() {
  if (_whisperSaveTimer) clearTimeout(_whisperSaveTimer)
  _whisperSaveTimer = setTimeout(saveWhispers, 500)
}

function saveWhispers() {
  const data = {}
  let count = 0
  for (const [key, conv] of whisperConversations) {
    if (count >= 30) break
    data[key] = {
      platform: conv.platform,
      userId: conv.userId,
      displayName: conv.displayName,
      color: conv.color,
      lastTime: conv.lastTime,
      unread: conv.unread,
      msgs: conv.msgs.slice(-50)
    }
    count++
  }
  try { chrome.storage.local.set({ hs_whispers: data }) } catch {}
}

function loadWhispers() {
  try {
    chrome.storage.local.get(['hs_whispers']).then(stored => {
      const data = stored.hs_whispers
      if (!data) return
      for (const [key, conv] of Object.entries(data)) {
        if (!whisperConversations.has(key)) {
          whisperConversations.set(key, {
            msgs: conv.msgs || [],
            platform: conv.platform,
            userId: conv.userId,
            displayName: conv.displayName,
            color: conv.color || '#fff',
            lastTime: conv.lastTime || 0,
            unread: conv.unread || 0
          })
        }
      }
      whisperTotalUnread = 0
      for (const conv of whisperConversations.values()) whisperTotalUnread += conv.unread
      updateWhisperBadge()
    }).catch(() => {})
  } catch {}
}

function getOrCreateConversation(key, platform, userId, displayName, color) {
  if (!whisperConversations.has(key)) {
    whisperConversations.set(key, {
      msgs: [],
      platform,
      userId,
      displayName,
      color: color || '#fff',
      lastTime: 0,
      unread: 0
    })
  }
  return whisperConversations.get(key)
}

function handleIncomingWhisper(msg) {
  const key = `twitch:${msg.user.toLowerCase()}`
  const conv = getOrCreateConversation(key, 'twitch', msg.userId, msg.user, msg.color)
  conv.msgs.push({
    user: msg.user,
    text: msg.text,
    color: msg.color,
    time: msg.time,
    self: false
  })
  if (conv.msgs.length > 200) conv.msgs.splice(0, conv.msgs.length - 200)
  conv.lastTime = msg.time
  conv.displayName = msg.user
  conv.color = msg.color

  if (currentTab === 'whispers' && activeWhisperUser === key) {
    renderWhispersTab()
  } else {
    conv.unread++
    whisperTotalUnread++
    updateWhisperBadge()
    // Inline DM notification in chat
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: msg.user,
      text: msg.text,
      color: msg.color,
      time: msg.time,
      platform: 'twitch'
    })
  }
  whisperSaveDebounced()
}

function handleIncomingDm(data) {
  const key = `hs:${data.from_user_id}`
  const conv = getOrCreateConversation(key, 'heatsync', data.from_user_id, data.from_display_name, data.from_color)
  conv.msgs.push({
    user: data.from_display_name,
    text: data.content,
    color: data.from_color || '#ff8700',
    time: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
    self: false
  })
  if (conv.msgs.length > 200) conv.msgs.splice(0, conv.msgs.length - 200)
  conv.lastTime = Date.now()
  conv.displayName = data.from_display_name
  conv.color = data.from_color || '#ff8700'

  if (currentTab === 'whispers' && activeWhisperUser === key) {
    renderWhispersTab()
  } else {
    conv.unread++
    whisperTotalUnread++
    updateWhisperBadge()
    // Inline DM notification in chat
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: data.from_display_name,
      text: data.content,
      color: data.from_color || '#ff8700',
      time: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
      platform: 'heatsync'
    })
  }
  whisperSaveDebounced()
}

function updateWhisperBadge() {
  if (!tabBarElement) return
  const tab = tabBarElement.querySelector('[data-tab="whispers"]')
  if (tab) {
    tab.classList.toggle('has-new', whisperTotalUnread > 0)
  }
}

async function sendWhisperMessage(key, text) {
  const conv = whisperConversations.get(key)
  if (!conv) return

  // Add message optimistically so it shows immediately
  const msg = { user: 'you', text, color: '#aaa', time: Date.now(), self: true }
  conv.msgs.push(msg)
  if (conv.msgs.length > 200) conv.msgs.splice(0, conv.msgs.length - 200)
  conv.lastTime = Date.now()

  if (currentTab === 'whispers' && activeWhisperUser === key) {
    renderWhispersTab()
  }
  whisperSaveDebounced()

  if (key.startsWith('twitch:')) {
    try {
      await gqlProxy('SendWhisper', {
        input: {
          recipientID: conv.userId,
          message: text,
          nonce: Math.random().toString(36).slice(2)
        }
      }, { rawQuery: 'mutation SendWhisper($input: SendWhisperInput!) { sendWhisper(input: $input) { error { code } } }' })
    } catch (e) {
      log('Whisper send failed:', e.message)
      showToast('whisper failed: ' + e.message)
    }
  } else if (key.startsWith('hs:')) {
    const toUserId = key.slice(3)
    const resp = await apiFetch('/api/dm', {
      method: 'POST',
      body: { toUserId, content: text }
    })
    if (!resp.ok) {
      log('DM send failed:', resp.error)
      showToast('dm failed: ' + (resp.error || 'unknown error'))
    }
  }
}

function renderWhispersTab() {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl) return

  if (!activeWhisperUser) {
    // Conversation list mode
    if (!whisperDmsLoaded && hsAuthToken) {
      whisperDmsLoaded = true
      apiFetch('/api/dm').then(resp => {
        if (resp.ok && resp.data && Array.isArray(resp.data)) {
          for (const dm of resp.data) {
            const key = `hs:${dm.other_user_id}`
            const conv = getOrCreateConversation(key, 'heatsync', dm.other_user_id, dm.other_display_name, dm.other_color)
            if (dm.last_message) {
              conv.lastTime = Math.max(conv.lastTime, new Date(dm.last_message.created_at).getTime())
            }
            conv.displayName = dm.other_display_name
            conv.color = dm.other_color || '#ff8700'
          }
          if (currentTab === 'whispers' && !activeWhisperUser) renderWhispersTab()
        }
      })
    }

    const sorted = [...whisperConversations.entries()]
      .sort((a, b) => b[1].lastTime - a[1].lastTime)

    if (sorted.length === 0) {
      msgsEl.innerHTML = '<div class="hs-mc-empty">no whispers yet</div>'
      return
    }

    msgsEl.textContent = ''
    const frag = document.createDocumentFragment()
    for (const [key, conv] of sorted) {
      const row = document.createElement('div')
      row.className = 'hs-whisper-conv'
      row.dataset.whisperKey = key

      const platBadge = conv.platform === 'twitch' ? '[T]' : '[HS]'
      const platColor = conv.platform === 'twitch' ? '#9146ff' : '#ff8700'
      const lastMsg = conv.msgs.length > 0 ? conv.msgs[conv.msgs.length - 1] : null
      const preview = lastMsg ? escapeHtml(lastMsg.text.length > 50 ? lastMsg.text.slice(0, 50) + '...' : lastMsg.text) : ''
      const ago = conv.lastTime ? formatWhisperTime(conv.lastTime) : ''
      const unreadBadge = conv.unread > 0 ? `<span class="hs-whisper-unread">${conv.unread}</span>` : ''

      // All dynamic values pass through escapeHtml/sanitizeColor — safe innerHTML
      row.innerHTML = `<span style="color:${platColor};font-size:10px;font-weight:700;margin-right:4px">${platBadge}</span><span style="color:${sanitizeColor(conv.color)};font-weight:600">${escapeHtml(conv.displayName)}</span> ${unreadBadge}<span class="hs-whisper-time">${ago}</span><div class="hs-whisper-preview">${preview}</div>`

      row.addEventListener('click', () => {
        activeWhisperUser = key
        const c = whisperConversations.get(key)
        if (c) {
          whisperTotalUnread -= c.unread
          c.unread = 0
          updateWhisperBadge()
        }
        renderWhispersTab()
        updateInputPlaceholder()
        if (inputBarElement) {
          inputBarElement.classList.remove('hs-hidden')
          inputBarVisible = true
        }
      })
      frag.appendChild(row)
    }
    msgsEl.appendChild(frag)
    return
  }

  // Active conversation mode
  const conv = whisperConversations.get(activeWhisperUser)
  if (!conv) {
    activeWhisperUser = null
    renderWhispersTab()
    return
  }

  // Lazy-load HeatSync DM history
  if (activeWhisperUser.startsWith('hs:') && conv.msgs.length <= 1) {
    const userId = activeWhisperUser.slice(3)
    apiFetch(`/api/dm/${userId}`).then(resp => {
      if (resp.ok && resp.data && Array.isArray(resp.data)) {
        const existing = new Set(conv.msgs.map(m => m.time))
        for (const dm of resp.data) {
          const t = new Date(dm.created_at).getTime()
          if (existing.has(t)) continue
          conv.msgs.push({
            user: dm.from_display_name || dm.from_user_id,
            text: dm.content,
            color: dm.from_color || '#ff8700',
            time: t,
            self: dm.from_user_id !== userId
          })
        }
        conv.msgs.sort((a, b) => a.time - b.time)
        if (conv.msgs.length > 200) conv.msgs.splice(0, conv.msgs.length - 200)
        if (currentTab === 'whispers' && activeWhisperUser === `hs:${userId}`) renderWhispersTab()
      }
    })
  }

  msgsEl.textContent = ''
  const frag = document.createDocumentFragment()

  // Back button + header
  const header = document.createElement('div')
  header.className = 'hs-whisper-header'
  // sanitizeColor + escapeHtml guard all dynamic values
  header.innerHTML = `<span class="hs-whisper-back">\u2190</span> <span style="color:${sanitizeColor(conv.color)};font-weight:600">${escapeHtml(conv.displayName)}</span>`
  header.querySelector('.hs-whisper-back').addEventListener('click', () => {
    activeWhisperUser = null
    renderWhispersTab()
    updateInputPlaceholder()
  })
  frag.appendChild(header)

  // Messages
  let zebraCount = 0
  for (const m of conv.msgs) {
    const div = document.createElement('div')
    div.className = m.self ? 'hs-mc-msg hs-whisper-self' : 'hs-mc-msg'
    zebraCount++
    if (zebraEnabled && zebraCount % 2 === 0) div.classList.add('hs-mc-zebra')

    const ts = formatTimeFromTs(m.time)
    const tsHtml = ts ? `<span class="hs-mc-ts" data-ts="${m.time}">${ts}</span>` : ''
    const userColor = m.self ? '#aaa' : sanitizeColor(m.color || conv.color)
    const userName = m.self ? 'you' : escapeHtml(m.user)
    // All dynamic values sanitized — safe innerHTML (matches buildMessageDiv pattern)
    div.innerHTML = `${tsHtml}<span style="color:${userColor};font-weight:600">${userName}</span>: ${processEmotes(escapeHtml(m.text), null)}`
    frag.appendChild(div)
  }

  msgsEl.appendChild(frag)
  msgsEl.scrollTop = msgsEl.scrollHeight
}

function formatWhisperTime(ts) {
  const diff = Date.now() - ts
  if (diff < 60000) return 'now'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h'
  return Math.floor(diff / 86400000) + 'd'
}
