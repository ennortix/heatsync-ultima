// Full-panel btop-style profile card
// Triggered by clicking any username anywhere in the extension.
// Replaces #hs-mc-messages content. ESC, tab switch, or close button restores chat.

let activeProfileCard = null  // { username, platform, data, ts }

function isProfileCardOpen() {
  return !!activeProfileCard
}

async function openProfileCard(username, platform) {
  if (!username) return
  username = String(username).toLowerCase()

  // Hide input bar — typing makes no sense in card view
  const inputBar = document.getElementById('hs-mc-inputbar')
  if (inputBar) inputBar.classList.add('hs-hidden')

  activeProfileCard = { username, platform: platform || null, data: null, ts: Date.now() }
  renderProfileCardView()

  // Try cache first (shared with tooltip via _profileCache)
  const cacheKey = `${platform || 'unknown'}:${username}`
  const ttl = (typeof PROFILE_CACHE_TTL !== 'undefined') ? PROFILE_CACHE_TTL : 300000
  if (typeof _profileCache !== 'undefined') {
    const cached = _profileCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < ttl) {
      activeProfileCard.data = cached.profile
      renderProfileCardView()
      return
    }
  }

  try {
    const platParam = platform ? `?platform=${encodeURIComponent(platform)}` : ''
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}${platParam}`)
    if (!activeProfileCard || activeProfileCard.username !== username) return
    if (resp?.ok && resp.data?.profile) {
      activeProfileCard.data = resp.data.profile
      if (typeof _profileCache !== 'undefined') {
        _profileCache.set(cacheKey, { profile: resp.data.profile, ts: Date.now() })
      }
    } else {
      activeProfileCard.data = { error: true, username }
    }
    renderProfileCardView()
  } catch {
    if (!activeProfileCard) return
    activeProfileCard.data = { error: true, username }
    renderProfileCardView()
  }
}

function closeProfileCard() {
  if (!activeProfileCard) return
  activeProfileCard = null
  // renderMessages will redo input visibility logic via switchTab? No, switchTab not called here.
  // Restore input bar visibility based on currentTab
  const inputBar = document.getElementById('hs-mc-inputbar')
  if (inputBar) {
    const hideOnTabs = ['add', 'settings', 'discover', 'pinned']
    if (!hideOnTabs.includes(currentTab)) inputBar.classList.remove('hs-hidden')
  }
  renderMessages(currentTab)
}

function getRecentMessagesFromUser(username) {
  const lower = username.toLowerCase()
  const out = []
  try {
    if (typeof irc !== 'undefined' && irc?.channels) {
      for (const [, buf] of irc.channels) {
        for (const m of buf.getAll()) {
          if (m.user?.toLowerCase() === lower && m.text) out.push(m)
        }
      }
    }
    if (typeof kickChat !== 'undefined' && kickChat?.channels) {
      for (const [, buf] of kickChat.channels) {
        for (const m of buf.getAll()) {
          if (m.user?.toLowerCase() === lower && m.text) out.push(m)
        }
      }
    }
    if (typeof channelYtMessages !== 'undefined' && channelYtMessages) {
      for (const [, buf] of channelYtMessages) {
        for (const m of buf) {
          if (m.user?.toLowerCase() === lower && m.text) out.push(m)
        }
      }
    }
  } catch {}
  return out.sort((a, b) => (b.time || 0) - (a.time || 0)).slice(0, 12)
}

function pcFmt(n) {
  n = Number(n) || 0
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'm'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}

function pcMakeSection(title) {
  const sec = document.createElement('div')
  sec.className = 'hs-pcard-section'
  const t = document.createElement('div')
  t.className = 'hs-pcard-section-title'
  t.textContent = title
  sec.appendChild(t)
  return sec
}

function pcMakePill(plat, name, isLive) {
  const pill = document.createElement('a')
  pill.className = 'hs-pcard-pill hs-pcard-pill-' + plat
  pill.target = '_blank'
  pill.rel = 'noopener noreferrer'
  if (plat === 'twitch') pill.href = 'https://twitch.tv/' + encodeURIComponent(name)
  else if (plat === 'kick') pill.href = 'https://kick.com/' + encodeURIComponent(name)
  else if (plat === 'youtube') pill.href = 'https://youtube.com/@' + encodeURIComponent(name)
  else if (plat === 'heatsync') pill.href = 'https://heatsync.org/user/' + encodeURIComponent(name)
  const label = plat === 'twitch' ? 't' : plat === 'kick' ? 'k' : plat === 'youtube' ? 'y' : 'h'
  pill.textContent = `${label}:${name}`
  if (isLive) {
    const dot = document.createElement('span')
    dot.className = 'hs-pcard-pill-live'
    dot.textContent = '●'
    pill.prepend(dot)
  }
  // Don't intercept these clicks — they should follow the link in a new tab
  pill.dataset.pcardPill = '1'
  return pill
}

function renderProfileCardView() {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl || !activeProfileCard) return
  msgsEl.textContent = ''

  const { username, data } = activeProfileCard
  const card = document.createElement('div')
  card.className = 'hs-pcard'

  // === Identity section ===
  const idSec = pcMakeSection(data?.display_name || username)
  idSec.classList.add('hs-pcard-id')

  const idRow = document.createElement('div')
  idRow.className = 'hs-pcard-id-row'

  const avatar = document.createElement('img')
  avatar.className = 'hs-pcard-avatar'
  avatar.src = data?.twitch_profile_pic || data?.kick_profile_pic || data?.profile_image_url || 'https://heatsync.org/anon.webp'
  avatar.alt = ''
  avatar.referrerPolicy = 'no-referrer'
  idRow.appendChild(avatar)

  const idText = document.createElement('div')
  idText.className = 'hs-pcard-id-text'

  const nameLine = document.createElement('div')
  nameLine.className = 'hs-pcard-name'
  const isLive = !!(data?.twitch_is_live || data?.kick_is_live)
  if (isLive) {
    const dot = document.createElement('span')
    dot.className = 'hs-pcard-livedot'
    dot.textContent = '●'
    nameLine.appendChild(dot)
  }
  nameLine.appendChild(document.createTextNode(' ' + (data?.display_name || username)))
  idText.appendChild(nameLine)

  // Platform pills
  const pills = document.createElement('div')
  pills.className = 'hs-pcard-pills'
  if (data?.twitch_username) pills.appendChild(pcMakePill('twitch', data.twitch_username, data.twitch_is_live))
  if (data?.kick_username) pills.appendChild(pcMakePill('kick', data.kick_username, data.kick_is_live))
  if (data?.youtube_username || data?.youtube_channel_id) {
    pills.appendChild(pcMakePill('youtube', data.youtube_username || username))
  }
  pills.appendChild(pcMakePill('heatsync', username))
  idText.appendChild(pills)

  if (data?.bio) {
    const bio = document.createElement('div')
    bio.className = 'hs-pcard-bio'
    bio.textContent = data.bio
    idText.appendChild(bio)
  }

  idRow.appendChild(idText)
  idSec.appendChild(idRow)
  card.appendChild(idSec)

  // === Stats section ===
  const statsSec = pcMakeSection('stats')
  if (!data) {
    statsSec.appendChild(document.createTextNode('loading…'))
  } else if (data.error) {
    statsSec.appendChild(document.createTextNode('not registered on heatsync'))
  } else {
    const stats = data.stats || {}
    const heat = stats.total_heat || 0
    const posts = (stats.op_count || 0) + (stats.mop_count || 0) + (stats.re_count || 0)
    const followers = Math.max(stats.followers || 0, data.twitch_followers || 0, data.kick_followers || 0)

    const rel = data.relationship || {}
    const youFollow = rel.youFollow ?? rel.isFollowing ?? rel.followsOnTwitch ?? rel.followsOnKick
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick || rel.followsYou
    const youSub = rel.youSub ?? rel.isSubscribed ?? rel.subscribedOnTwitch ?? rel.subscribedOnKick
    const subsYou = rel.profileSubbedToViewerOnTwitch || rel.profileSubbedToViewerOnKick || rel.subscribesToYou

    const parts = []
    if (heat) parts.push(`${pcFmt(heat)}° heat`)
    if (posts) parts.push(`${pcFmt(posts)} posts`)
    if (followers) parts.push(`${pcFmt(followers)} followers`)

    const relParts = []
    if (youFollow && followsYou) relParts.push('mutual')
    else if (youFollow) relParts.push('you follow')
    else if (followsYou) relParts.push('follows you')
    if (youSub) relParts.push('you sub')
    if (subsYou) relParts.push('subs to you')

    if (parts.length) {
      const line = document.createElement('div')
      line.textContent = parts.join(' · ')
      statsSec.appendChild(line)
    }
    if (relParts.length) {
      const rline = document.createElement('div')
      rline.className = 'hs-pcard-rel'
      rline.textContent = relParts.join(' · ')
      statsSec.appendChild(rline)
    }
    if (!parts.length && !relParts.length) {
      statsSec.appendChild(document.createTextNode('no stats yet'))
    }
  }
  card.appendChild(statsSec)

  // === Stream section (only when live) ===
  if (data && (data.twitch_is_live || data.kick_is_live)) {
    const onTwitch = !!data.twitch_is_live
    const platName = onTwitch ? data.twitch_username : data.kick_username
    const vc = onTwitch ? (data.twitch_viewer_count || 0) : (data.kick_viewer_count || 0)
    const url = onTwitch ? `https://twitch.tv/${platName}` : `https://kick.com/${platName}`

    const ssec = pcMakeSection(onTwitch ? 'twitch · live' : 'kick · live')
    ssec.classList.add('hs-pcard-stream')
    const line = document.createElement('div')
    if (vc) line.appendChild(document.createTextNode(`${pcFmt(vc)} viewers — `))
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = 'watch stream →'
    link.className = 'hs-pcard-link'
    link.dataset.pcardPill = '1'
    line.appendChild(link)
    ssec.appendChild(line)
    card.appendChild(ssec)
  }

  // === Recent messages section ===
  const recent = getRecentMessagesFromUser(username)
  if (recent.length > 0) {
    const rsec = pcMakeSection(`recent · ${recent.length} msg${recent.length === 1 ? '' : 's'}`)
    rsec.classList.add('hs-pcard-recent')
    for (const m of recent) {
      const row = document.createElement('div')
      row.className = 'hs-pcard-msg'
      const ts = m.time ? new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
      const tsEl = document.createElement('span')
      tsEl.className = 'hs-pcard-msg-ts'
      tsEl.textContent = ts
      const platEl = document.createElement('span')
      const plat = m.platform || 'twitch'
      platEl.className = 'hs-pcard-msg-plat hs-pcard-pill-' + plat
      platEl.textContent = plat === 'kick' ? 'k' : plat === 'youtube' ? 'y' : 't'
      const textEl = document.createElement('span')
      textEl.className = 'hs-pcard-msg-text'
      textEl.textContent = m.text.length > 240 ? m.text.slice(0, 240) + '…' : m.text
      row.appendChild(tsEl)
      row.appendChild(platEl)
      row.appendChild(textEl)
      rsec.appendChild(row)
    }
    card.appendChild(rsec)
  }

  // === Actions section ===
  const asec = pcMakeSection('actions')
  asec.classList.add('hs-pcard-actions')
  const grid = document.createElement('div')
  grid.className = 'hs-pcard-action-grid'

  const isMuted = mutedUsers.has(username)
  const inChannels = config.channels.some(c => {
    const id = (typeof c === 'string' ? c : c.id)?.toLowerCase()
    const tw = (typeof c === 'string' ? c : c.twitch)?.toLowerCase()
    const ki = typeof c === 'string' ? null : c.kick?.toLowerCase()
    return id === username || tw === username || ki === username
  })

  const actions = [
    { key: 't', label: 'twitch', fn: () => pcOpenExt('https://twitch.tv/' + (data?.twitch_username || username)) },
    { key: 'k', label: 'kick', fn: () => pcOpenExt('https://kick.com/' + (data?.kick_username || username)) },
    { key: 'y', label: 'youtube', fn: () => pcOpenExt('https://youtube.com/@' + (data?.youtube_username || username)) },
    { key: 'h', label: 'heatsync', fn: () => pcOpenExt('https://heatsync.org/user/' + username) },
    { key: 'w', label: 'whisper', fn: () => pcDoWhisper(username) },
    { key: 'm', label: isMuted ? 'unmute' : 'mute', fn: () => pcToggleMute(username) },
    { key: '+', label: inChannels ? 'in channels' : 'add channel', fn: () => pcAddAsChannel(username), disabled: inChannels },
    { key: 'esc', label: 'close', fn: closeProfileCard },
  ]

  for (const a of actions) {
    const btn = document.createElement('button')
    btn.className = 'hs-pcard-action'
    if (a.disabled) btn.disabled = true
    btn.dataset.pcKey = a.key
    const kbd = document.createElement('span')
    kbd.className = 'hs-pcard-kbd'
    kbd.textContent = `[${a.key}]`
    const lab = document.createElement('span')
    lab.className = 'hs-pcard-actlabel'
    lab.textContent = ' ' + a.label
    btn.appendChild(kbd)
    btn.appendChild(lab)
    btn.addEventListener('click', a.fn)
    grid.appendChild(btn)
  }
  asec.appendChild(grid)
  card.appendChild(asec)

  msgsEl.appendChild(card)
}

function pcOpenExt(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function pcToggleMute(username) {
  username = username.toLowerCase()
  if (mutedUsers.has(username)) {
    mutedUsers.delete(username)
    safeSendMessage({ type: 'unmute_user', username })
  } else {
    mutedUsers.add(username)
    safeSendMessage({ type: 'mute_user', username, expiresAt: Date.now() + 86400000 })
  }
  chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
  renderProfileCardView()
}

function pcDoWhisper(username) {
  closeProfileCard()
  switchTab('whispers')
  // Pre-fill input with /w <username> for quick start
  setTimeout(() => {
    const input = document.getElementById('hs-mc-input')
    if (input) {
      const cmd = `/w ${username} `
      if (input.tagName === 'INPUT') {
        input.value = cmd
        input.focus()
        input.setSelectionRange(cmd.length, cmd.length)
      } else {
        input.textContent = cmd
        input.focus()
      }
    }
  }, 50)
}

function setupProfileCardHandlers() {
  if (window._hsProfileCardSetup) return
  window._hsProfileCardSetup = true

  // Username click → open card. Allow ctrl/meta/shift/middle to fall through to <a>.
  cleanup.addEventListener(document, 'click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const userEl = e.target.closest('.hs-mc-user')
    if (!userEl) return
    // Skip platform pills inside the card itself — they should follow their hrefs
    if (e.target.closest('[data-pcard-pill]')) return
    // Skip reply target links — those navigate within the message context
    if (userEl.classList.contains('hs-mc-reply-user')) return
    e.preventDefault()
    e.stopPropagation()
    const username = (userEl.dataset.username || userEl.textContent.replace(/^@/, '')).trim()
    const platform = userEl.dataset.platform || null
    openProfileCard(username, platform)
  }, 'mc-pcard-user-click')

  // ESC closes the card; single-letter hotkeys trigger actions while open
  cleanup.addEventListener(document, 'keydown', (e) => {
    if (!activeProfileCard) return
    // Ignore keys while typing in inputs/textareas
    const t = e.target
    const inEditable = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable
    if (inEditable) {
      if (e.key === 'Escape') { e.preventDefault(); closeProfileCard() }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); closeProfileCard(); return }
    const key = e.key.toLowerCase()
    const map = { t: 't', k: 'k', y: 'y', h: 'h', w: 'w', m: 'm', '+': '+', '=': '+' }
    const target = map[key]
    if (!target) return
    const btn = document.querySelector(`.hs-pcard-action[data-pc-key="${target}"]`)
    if (btn && !btn.disabled) {
      e.preventDefault()
      btn.click()
    }
  }, 'mc-pcard-keys')
}

function pcAddAsChannel(username) {
  if (!config?.channels) return
  const exists = config.channels.some(c => {
    const id = (typeof c === 'string' ? c : c.id)?.toLowerCase()
    return id === username.toLowerCase()
  })
  if (!exists) {
    config.channels.push({ id: username.toLowerCase(), twitch: username.toLowerCase(), kick: '', youtube: '' })
    saveConfig()
    if (typeof updateTabBar === 'function') updateTabBar()
  }
  closeProfileCard()
  switchTab(username.toLowerCase())
}
