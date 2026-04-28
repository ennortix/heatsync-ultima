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

// Tokenize bio text and append @mention/#tag/text nodes safely (no innerHTML).
// @mentions reuse `.hs-mc-user` so the existing capture-phase click handler
// opens the profile card. #tags link to heatsync.org/tags/<name> in a new tab.
function pcAppendBioWithAutolinks(parent, text) {
  const parts = String(text || '').split(/(@[A-Za-z0-9_]{3,25}|#[A-Za-z0-9]{1,30})/g)
  for (const p of parts) {
    if (!p) continue
    if (p[0] === '@' && p.length >= 4) {
      const name = p.slice(1)
      const span = document.createElement('span')
      span.className = 'hs-mc-user hs-pcard-bio-mention'
      span.dataset.username = name
      span.textContent = '@' + name
      parent.appendChild(span)
    } else if (p[0] === '#' && p.length >= 2) {
      const a = document.createElement('a')
      a.className = 'hs-pcard-bio-tag'
      a.href = 'https://heatsync.org/tags/' + encodeURIComponent(p.slice(1).toLowerCase())
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.textContent = '#' + p.slice(1)
      parent.appendChild(a)
    } else {
      parent.appendChild(document.createTextNode(p))
    }
  }
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
  const isLive = !!(data?.twitch_is_live || data?.kick_is_live || data?.youtube_is_live)
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
    pills.appendChild(pcMakePill('youtube', data.youtube_username || username, !!data.youtube_is_live))
  }
  pills.appendChild(pcMakePill('heatsync', username))
  idText.appendChild(pills)

  if (data?.bio) {
    const bio = document.createElement('div')
    bio.className = 'hs-pcard-bio'
    pcAppendBioWithAutolinks(bio, data.bio)
    idText.appendChild(bio)
  }

  // Account age + verification + broadcaster type
  if (data) {
    const meta = document.createElement('div')
    meta.className = 'hs-pcard-meta'
    const dates = [data.twitch_created_at, data.kick_created_at]
      .filter(Boolean)
      .filter(d => !isNaN(new Date(d).getTime()))
    const oldest = dates.length ? dates.reduce((a, b) => new Date(b) < new Date(a) ? b : a) : null
    const age = (typeof getAccountAge === 'function') ? getAccountAge(oldest) : null
    if (age) {
      const ageEl = document.createElement('span')
      ageEl.className = 'hs-pcard-age'
      ageEl.textContent = age + ' old'
      meta.appendChild(ageEl)
    }
    const bt = data.twitch_broadcaster_type
    if (bt === 'partner' || bt === 'affiliate') {
      const r = document.createElement('span')
      r.className = 'hs-pcard-role ' + bt
      r.textContent = bt
      meta.appendChild(r)
    }
    if (data.twitch_verified) {
      const v = document.createElement('span')
      v.className = 'hs-pcard-verified twitch'
      v.title = 'Twitch Verified'
      v.textContent = '✓'
      meta.appendChild(v)
    }
    if (data.kick_verified) {
      const v = document.createElement('span')
      v.className = 'hs-pcard-verified kick'
      v.title = 'Kick Verified'
      v.textContent = '✓'
      meta.appendChild(v)
    }
    if (meta.children.length) idText.appendChild(meta)
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

    const relParts = []
    if (youFollow && followsYou) relParts.push('mutual')
    else if (youFollow) relParts.push('you follow')
    else if (followsYou) relParts.push('follows you')
    if (youSub) relParts.push('you sub')
    if (subsYou) relParts.push('subs to you')

    // Stats line: heat uses canonical tier styling (formatHeat + ° + glow), others plain
    const heatNode = heat ? heatSpanEl(heat) : null
    const hasStats = heatNode || posts || followers
    if (hasStats) {
      const line = document.createElement('div')
      let needsSep = false
      if (heatNode) {
        line.appendChild(heatNode)
        line.appendChild(document.createTextNode(' heat'))
        needsSep = true
      }
      if (posts) {
        if (needsSep) line.appendChild(document.createTextNode(' · '))
        line.appendChild(document.createTextNode(`${pcFmt(posts)} posts`))
        needsSep = true
      }
      if (followers) {
        if (needsSep) line.appendChild(document.createTextNode(' · '))
        line.appendChild(document.createTextNode(`${pcFmt(followers)} followers`))
      }
      statsSec.appendChild(line)
    }
    if (relParts.length) {
      const rline = document.createElement('div')
      rline.className = 'hs-pcard-rel'
      rline.textContent = relParts.join(' · ')
      statsSec.appendChild(rline)
    }
    if (!hasStats && !relParts.length) {
      statsSec.appendChild(document.createTextNode('no stats yet'))
    }
  }
  card.appendChild(statsSec)

  // === Stream section (only when live) ===
  if (data && (data.twitch_is_live || data.kick_is_live || data.youtube_is_live)) {
    let plat, platName, vc, url
    if (data.twitch_is_live) {
      plat = 'twitch'
      platName = data.twitch_username
      vc = data.twitch_viewer_count || 0
      url = `https://twitch.tv/${platName}`
    } else if (data.kick_is_live) {
      plat = 'kick'
      platName = data.kick_username
      vc = data.kick_viewer_count || 0
      url = `https://kick.com/${platName}`
    } else {
      plat = 'youtube'
      platName = data.youtube_username || data.youtube_channel_id
      vc = data.youtube_viewer_count || 0
      url = data.youtube_username ? `https://youtube.com/@${data.youtube_username}/live`
        : data.youtube_channel_id ? `https://youtube.com/channel/${data.youtube_channel_id}/live`
        : 'https://youtube.com'
    }

    const ssec = pcMakeSection(plat + ' · live')
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

  const youFollow = !!(data?.relationship?.youFollow ?? data?.relationship?.isFollowing)
  const youBlock = !!(data?.relationship?.youBlock ?? data?.relationship?.isBlocked)
  const profileId = data?.id || data?.userId || null

  const actions = [
    { key: 't', label: 'twitch', fn: () => pcOpenExt('https://twitch.tv/' + (data?.twitch_username || username)) },
    { key: 'k', label: 'kick', fn: () => pcOpenExt('https://kick.com/' + (data?.kick_username || username)) },
    { key: 'y', label: 'youtube', fn: () => pcOpenExt('https://youtube.com/@' + (data?.youtube_username || username)) },
    { key: 'h', label: 'heatsync', fn: () => pcOpenExt('https://heatsync.org/user/' + username) },
    { key: 'f', label: youFollow ? 'unfollow' : 'follow', fn: () => pcToggleFollow(profileId, username, youFollow), disabled: !profileId },
    { key: 'w', label: 'whisper', fn: () => pcDoWhisper(username) },
    { key: 'd', label: 'dm', fn: () => pcDoDm(username) },
    { key: 'm', label: 'mention', fn: () => pcMention(data?.display_name || username) },
    { key: 'x', label: isMuted ? 'unmute' : 'mute', fn: () => pcToggleMute(username) },
    { key: 'b', label: youBlock ? 'unblock' : 'block', fn: () => pcToggleBlock(profileId, username, youBlock), disabled: !profileId },
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

// Heatsync follow/unfollow — POST/DELETE /api/follow/{userId}. Server returns
// 400 'Already following' / 'Not following' for no-op state which we treat as
// idempotent success. After success, ping background to refresh followedUsers
// so the new follow shows up in live notifications + badge immediately.
async function pcToggleFollow(profileId, username, currentlyFollowing) {
  if (!profileId) {
    if (typeof showToast === 'function') showToast('not registered on heatsync')
    return
  }
  const targetFollowing = !currentlyFollowing
  const method = targetFollowing ? 'POST' : 'DELETE'
  // Optimistic UI
  if (activeProfileCard?.data) {
    activeProfileCard.data.relationship = { ...(activeProfileCard.data.relationship || {}), youFollow: targetFollowing }
    renderProfileCardView()
  }
  try {
    const resp = await apiFetch(`/api/follow/${encodeURIComponent(profileId)}`, { method, auth: true })
    if (!resp?.ok) {
      const msg = String(resp?.error || '').toLowerCase()
      if (!msg.includes('already following') && !msg.includes('not following')) {
        // Real failure — revert optimistic state
        if (activeProfileCard?.data?.relationship) {
          activeProfileCard.data.relationship.youFollow = currentlyFollowing
          renderProfileCardView()
        }
        if (typeof showToast === 'function') showToast('follow failed: ' + (resp?.error || 'unknown'))
        return
      }
    }
    if (typeof showToast === 'function') showToast(targetFollowing ? `following ${username}` : `unfollowed ${username}`)
    // Tell background to refetch followedUsers — pollFollowedLive runs after,
    // so live notifications + badge include the new follow within ~60s.
    safeSendMessage({ type: 'refresh_followed_users' })
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youFollow = currentlyFollowing
      renderProfileCardView()
    }
    if (typeof showToast === 'function') showToast('follow failed: ' + (e?.message || 'unknown'))
  }
}

// Heatsync block/unblock — POST/DELETE /api/user/block/{userId}. Server's
// idempotent error responses ('User already blocked' / no record) are treated
// as success. After block, profile auto-unfollows server-side, so we mirror
// that in the relationship object.
async function pcToggleBlock(profileId, username, currentlyBlocked) {
  if (!profileId) {
    if (typeof showToast === 'function') showToast('not registered on heatsync')
    return
  }
  const targetBlocked = !currentlyBlocked
  // Optimistic UI
  if (activeProfileCard?.data) {
    const rel = { ...(activeProfileCard.data.relationship || {}) }
    rel.youBlock = targetBlocked
    rel.isBlocked = targetBlocked
    if (targetBlocked) {
      // Server auto-unfollows on block — mirror locally
      rel.youFollow = false
      rel.isFollowing = false
    }
    activeProfileCard.data.relationship = rel
    renderProfileCardView()
  }
  try {
    const path = `/api/user/block/${encodeURIComponent(profileId)}`
    const resp = targetBlocked
      ? await apiFetch(path, { method: 'POST', auth: true, body: {} })
      : await apiFetch(path + '?sync_twitch=0', { method: 'DELETE', auth: true })
    if (!resp?.ok) {
      const msg = String(resp?.error || '').toLowerCase()
      if (!msg.includes('already blocked') && !msg.includes('not blocked')) {
        // Real failure — revert optimistic state
        if (activeProfileCard?.data?.relationship) {
          activeProfileCard.data.relationship.youBlock = currentlyBlocked
          activeProfileCard.data.relationship.isBlocked = currentlyBlocked
          renderProfileCardView()
        }
        if (typeof showToast === 'function') showToast('block failed: ' + (resp?.error || 'unknown'))
        return
      }
    }
    if (typeof showToast === 'function') showToast(targetBlocked ? `blocked ${username}` : `unblocked ${username}`)
    // Block side-effects unfollow on server — re-fetch followedUsers in background
    safeSendMessage({ type: 'refresh_followed_users' })
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youBlock = currentlyBlocked
      activeProfileCard.data.relationship.isBlocked = currentlyBlocked
      renderProfileCardView()
    }
    if (typeof showToast === 'function') showToast('block failed: ' + (e?.message || 'unknown'))
  }
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

  // Primary path — pcard-early.js (document_start) intercepts the click before
  // Twitch/Kick can react and dispatches this event.
  cleanup.addEventListener(document, 'hs-pcard-open', (e) => {
    const { username, platform } = e.detail || {}
    if (username) openProfileCard(username, platform || null)
  }, { signal: mcSignal })

  // Channel list changed (right-click remove, add via pill, server sync, etc.) —
  // re-render the open card so the [+] action reflects the new in-channels state.
  cleanup.addEventListener(document, 'hs-channels-changed', () => {
    if (activeProfileCard) renderProfileCardView()
  }, { signal: mcSignal })

  // Username click → open card. Capture phase so we beat Twitch/Kick native user-card handlers.
  // Allow ctrl/meta/shift/middle/alt to fall through to the <a target="_blank"> default nav.
  cleanup.addEventListener(document, 'click', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const userEl = e.target.closest('.hs-mc-user')
    if (!userEl) return
    if (e.target.closest('[data-pcard-pill]')) return
    if (userEl.classList.contains('hs-mc-reply-user')) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    const username = (userEl.dataset.username || userEl.textContent.replace(/^@/, '')).trim()
    const platform = userEl.dataset.platform || null
    openProfileCard(username, platform)
  }, { capture: true, signal: mcSignal })

  // Twitch attaches mousedown handlers too — block those at capture so the native card never opens
  cleanup.addEventListener(document, 'mousedown', (e) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
    const userEl = e.target.closest('.hs-mc-user')
    if (!userEl) return
    if (e.target.closest('[data-pcard-pill]')) return
    if (userEl.classList.contains('hs-mc-reply-user')) return
    e.stopPropagation()
    e.stopImmediatePropagation()
  }, { capture: true, signal: mcSignal })

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
    const map = { t: 't', k: 'k', y: 'y', h: 'h', w: 'w', m: 'm', x: 'x', '+': '+', '=': '+', c: 'c' }
    const target = map[key]
    if (!target) return
    const btn = document.querySelector(`.hs-pcard-action[data-pc-key="${target}"]`)
    if (btn && !btn.disabled) {
      e.preventDefault()
      btn.click()
    }
  }, 'mc-pcard-keys')
}

function pcMention(name) {
  closeProfileCard()
  // If on a non-chat tab, switch to live first
  const isChatTab = currentTab === 'live' || (typeof config !== 'undefined' && config.channels?.some(c => (typeof c === 'string' ? c : c.id) === currentTab))
  if (!isChatTab) switchTab('live')
  setTimeout(() => {
    const inputBar = document.getElementById('hs-mc-inputbar')
    if (inputBar) inputBar.classList.remove('hs-hidden')
    const input = document.getElementById('hs-mc-input')
    if (!input) return
    const tag = '@' + name + ' '
    if (input.tagName === 'INPUT') {
      const cur = input.value || ''
      const sep = cur && !cur.endsWith(' ') ? ' ' : ''
      input.value = cur + sep + tag
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    } else {
      const cur = input.textContent || ''
      const sep = cur && !cur.endsWith(' ') ? ' ' : ''
      input.textContent = cur + sep + tag
      input.focus()
      // Place caret at end
      const range = document.createRange()
      range.selectNodeContents(input)
      range.collapse(false)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }, 60)
}

function pcDoDm(username) {
  closeProfileCard()
  switchTab('whispers')
  // Pre-fill input with /dm <username> for quick start (heatsync DM, not Twitch whisper)
  setTimeout(() => {
    const input = document.getElementById('hs-mc-input')
    if (input) {
      const cmd = `/dm ${username} `
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

async function pcAddAsChannel(username) {
  if (!config?.channels) return
  const id = username.toLowerCase()
  const exists = config.channels.some(c => {
    const cid = (typeof c === 'string' ? c : c.id)?.toLowerCase()
    return cid === id
  })
  if (exists) {
    closeProfileCard()
    switchTab(id)
    return
  }

  // Use cached profile on the active card if present (avoids round-trip).
  // Otherwise resolve via /api/profile so we populate ALL linked platforms.
  let res = null
  if (activeProfileCard?.data && !activeProfileCard.data.error) {
    res = shapeIdentity(activeProfileCard.data)
  } else if (typeof resolveIdentity === 'function') {
    res = await resolveIdentity(username)
  }

  // Fallback when no heatsync profile: assume the typed name is twitch (consistent
  // with prior behaviour when adding e.g. a Twitch-only channel from chat).
  const id2 = res?.identity?.heatsync?.toLowerCase() || id
  const channel = {
    id: id2,
    twitch: (res?.identity?.twitch || username).toLowerCase(),
    kick: (res?.identity?.kick || '').toLowerCase(),
    youtube: res?.identity?.youtube || '',
  }

  config.channels.push(channel)
  saveConfig()
  if (typeof updateTabBar === 'function') updateTabBar()
  if (channel.twitch) {
    irc?.join(channel.twitch)
    try { chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: channel.twitch }) } catch {}
  }
  if (channel.kick) kickChat?.join(channel.kick)
  if (channel.youtube) {
    youtubeLinks.set(channel.id, { url: channel.youtube, videoId: '', channelName: '' })
    try { chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: channel.youtube, channelId: channel.id }) } catch {}
  }
  closeProfileCard()
  switchTab(channel.id)
}
