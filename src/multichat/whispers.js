// Whispers — unified chronological timeline of all whispers + DMs

const whisperTimeline = [] // { user, text, color, time, self, platform, key }
const whisperUsers = new Map() // key → { platform, userId, displayName, color }
let lastWhisperKey = null // for /r — last person involved in a whisper
let whisperTotalUnread = 0
let whisperLastViewedTime = 0
let whisperDmsLoaded = false

let _whisperSaveTimer = null
function whisperSaveDebounced() {
  if (_whisperSaveTimer) clearTimeout(_whisperSaveTimer)
  _whisperSaveTimer = setTimeout(saveWhispers, 500)
}

function saveWhispers() {
  const users = {}
  for (const [key, u] of whisperUsers) users[key] = u
  try {
    chrome.storage.local.set({
      hs_whispers_v2: {
        timeline: whisperTimeline.slice(-200),
        users,
        lastKey: lastWhisperKey,
        lastViewed: whisperLastViewedTime
      }
    })
  } catch {}
}

function loadWhispers() {
  try {
    chrome.storage.local.get(['hs_whispers_v2', 'hs_whispers']).then(stored => {
      // Load v2 format (timeline)
      const data = stored.hs_whispers_v2
      if (data) {
        if (Array.isArray(data.timeline)) {
          for (const msg of data.timeline) {
            if (!whisperTimeline.some(m => m.time === msg.time && m.text === msg.text)) {
              whisperTimeline.push(msg)
            }
          }
        }
        if (data.users) {
          for (const [key, u] of Object.entries(data.users)) {
            if (!whisperUsers.has(key)) whisperUsers.set(key, u)
          }
        }
        if (data.lastKey) lastWhisperKey = data.lastKey
        if (data.lastViewed) whisperLastViewedTime = data.lastViewed
      }

      // Migrate v1 format (per-conversation) into timeline
      const v1 = stored.hs_whispers
      if (v1 && typeof v1 === 'object' && !v1.timeline) {
        for (const [key, conv] of Object.entries(v1)) {
          if (!conv || !conv.msgs) continue
          whisperUsers.set(key, {
            platform: conv.platform || (key.startsWith('hs:') ? 'heatsync' : 'twitch'),
            userId: conv.userId,
            displayName: conv.displayName,
            color: conv.color || '#fff'
          })
          for (const m of conv.msgs) {
            if (whisperTimeline.some(e => e.time === m.time && e.text === m.text)) continue
            whisperTimeline.push({
              user: m.self ? 'you' : m.user,
              text: m.text,
              color: m.color || '#fff',
              time: m.time,
              self: !!m.self,
              platform: conv.platform || (key.startsWith('hs:') ? 'heatsync' : 'twitch'),
              key
            })
          }
        }
        whisperTimeline.sort((a, b) => a.time - b.time)
        if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
        // Clean up v1
        try { chrome.storage.local.remove('hs_whispers') } catch {}
        whisperSaveDebounced()
      }

      whisperTotalUnread = whisperTimeline.filter(m => !m.self && m.time > whisperLastViewedTime).length
      updateWhisperBadge()
    }).catch(() => {})
  } catch {}
}

function updateWhisperBadge() {
  if (!tabBarElement) return
  const tab = tabBarElement.querySelector('[data-tab="whispers"]')
  if (tab) tab.classList.toggle('has-new', whisperTotalUnread > 0)
}

function handleIncomingWhisper(msg) {
  const key = `twitch:${msg.user.toLowerCase()}`
  whisperUsers.set(key, {
    platform: 'twitch',
    userId: msg.userId,
    displayName: msg.user,
    color: msg.color
  })

  whisperTimeline.push({
    user: msg.user,
    text: msg.text,
    color: msg.color,
    time: msg.time,
    self: false,
    platform: 'twitch',
    key
  })
  if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
  lastWhisperKey = key

  if (currentTab === 'whispers') {
    whisperLastViewedTime = Date.now()
    renderWhispersTab()
  } else {
    whisperTotalUnread++
    updateWhisperBadge()
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
  whisperUsers.set(key, {
    platform: 'heatsync',
    userId: data.from_user_id,
    displayName: data.from_display_name,
    color: data.from_color || '#ff8700'
  })

  const time = data.created_at ? new Date(data.created_at).getTime() : Date.now()
  whisperTimeline.push({
    user: data.from_display_name,
    text: data.content,
    color: data.from_color || '#ff8700',
    time,
    self: false,
    platform: 'heatsync',
    key
  })
  if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
  lastWhisperKey = key

  if (currentTab === 'whispers') {
    whisperLastViewedTime = Date.now()
    renderWhispersTab()
  } else {
    whisperTotalUnread++
    updateWhisperBadge()
    injectInlineNotif('dm', {
      type: 'inline-dm',
      user: data.from_display_name,
      text: data.content,
      color: data.from_color || '#ff8700',
      time,
      platform: 'heatsync'
    })
  }
  whisperSaveDebounced()
}

// Send Twitch whisper via Helix API (MAIN world, bypasses integrity)
function sendTwitchWhisper(toUserId, message) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    const handler = (e) => {
      if (e.data?.type === 'heatsync-whisper-response' && e.data.id === id) {
        window.removeEventListener('message', handler)
        clearTimeout(timer)
        resolve(e.data)
      }
    }
    window.addEventListener('message', handler)
    window.postMessage({ type: 'heatsync-send-whisper', id, toUserId, message }, location.origin)
    const timer = setTimeout(() => {
      window.removeEventListener('message', handler)
      resolve({ error: 'whisper timeout — MAIN world not running, refresh the page' })
    }, 15000)
  })
}

async function sendWhisperMessage(key, text) {
  const userInfo = whisperUsers.get(key)
  if (!userInfo) { showToast('unknown user — whisper someone first'); return }

  // Optimistic: show message immediately
  whisperTimeline.push({
    user: 'you',
    text,
    color: '#aaa',
    time: Date.now(),
    self: true,
    platform: userInfo.platform,
    key
  })
  if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
  lastWhisperKey = key

  if (currentTab === 'whispers') renderWhispersTab()
  whisperSaveDebounced()

  if (key.startsWith('twitch:')) {
    try {
      const resp = await sendTwitchWhisper(userInfo.userId, text)
      if (!resp.ok) {
        log('Whisper send failed:', resp.error)
        showToast('whisper failed: ' + resp.error)
      }
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

  // Fetch HS DMs on first render to backfill timeline
  if (!whisperDmsLoaded && hsAuthToken) {
    whisperDmsLoaded = true
    apiFetch('/api/dm').then(resp => {
      if (!resp.ok || !Array.isArray(resp.data)) return
      for (const dm of resp.data) {
        const key = `hs:${dm.other_user_id}`
        whisperUsers.set(key, {
          platform: 'heatsync',
          userId: dm.other_user_id,
          displayName: dm.other_display_name,
          color: dm.other_color || '#ff8700'
        })
        // Fetch recent messages for each conversation
        apiFetch(`/api/dm/${dm.other_user_id}`).then(resp2 => {
          if (!resp2.ok || !Array.isArray(resp2.data)) return
          let added = false
          for (const m of resp2.data) {
            const t = new Date(m.created_at).getTime()
            if (whisperTimeline.some(e => Math.abs(e.time - t) < 1000 && e.text === m.content && e.platform === 'heatsync')) continue
            const isSelf = m.from_user_id !== dm.other_user_id
            whisperTimeline.push({
              user: isSelf ? 'you' : dm.other_display_name,
              text: m.content,
              color: isSelf ? '#aaa' : (dm.other_color || '#ff8700'),
              time: t,
              self: isSelf,
              platform: 'heatsync',
              key
            })
            added = true
          }
          if (added) {
            whisperTimeline.sort((a, b) => a.time - b.time)
            if (whisperTimeline.length > 500) whisperTimeline.splice(0, whisperTimeline.length - 500)
            if (currentTab === 'whispers') renderWhispersTab()
            whisperSaveDebounced()
          }
        })
      }
    })
  }

  // Mark as read
  whisperLastViewedTime = Date.now()
  whisperTotalUnread = 0
  updateWhisperBadge()

  if (whisperTimeline.length === 0) {
    // All dynamic values below are string literals — safe innerHTML
    msgsEl.innerHTML = '<div class="hs-mc-empty">/w user msg \u00b7 /dm user msg \u00b7 /r msg</div>'
    return
  }

  msgsEl.textContent = ''
  const frag = document.createDocumentFragment()
  const toRender = whisperTimeline.slice(-150)
  let zebraCount = 0

  for (const m of toRender) {
    const div = document.createElement('div')
    div.className = m.self ? 'hs-mc-msg hs-whisper-self' : 'hs-mc-msg'
    if (zebraEnabled && ++zebraCount % 2 === 0) div.classList.add('hs-mc-zebra')

    const ts = formatTimeFromTs(m.time)
    const tsHtml = ts ? `<span class="hs-mc-ts" data-ts="${m.time}">${ts}</span>` : ''
    const platColor = m.platform === 'twitch' ? '#9146ff' : '#ff8700'
    const platTag = m.platform === 'twitch' ? 'T' : 'HS'
    const arrow = m.self ? '\u2192' : '\u2190'

    // For outbound show recipient; for inbound show sender
    let userDisplay, userColor
    if (m.self) {
      const target = whisperUsers.get(m.key)
      userDisplay = target ? escapeHtml(target.displayName) : escapeHtml(m.key)
      userColor = target ? sanitizeColor(target.color) : '#fff'
    } else {
      userDisplay = escapeHtml(m.user)
      userColor = sanitizeColor(m.color)
    }

    // All dynamic values pass through escapeHtml/sanitizeColor — safe innerHTML
    div.innerHTML = `${tsHtml}<span style="color:${platColor};font-size:10px;font-weight:700">[${platTag}]</span> <span style="color:#666">${arrow}</span> <span style="color:${userColor};font-weight:600">${userDisplay}</span>: ${processEmotes(escapeHtml(m.text), null)}`
    frag.appendChild(div)
  }

  msgsEl.appendChild(frag)
  msgsEl.scrollTop = msgsEl.scrollHeight
}
