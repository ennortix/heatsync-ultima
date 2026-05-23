// Full-panel btop-style profile card
// Triggered by clicking any username anywhere in the extension.
// Replaces #hs-mc-messages content. ESC, tab switch, or close button restores chat.

let activeProfileCard = null  // { username, platform, data, ts }

// In-page LRU for fetched banners — survives card open/close within a session.
// Background SW caches authoritatively (12h); this layer just avoids the SW
// round-trip for repeat hovers/opens. Keyed `${platform}:${login}` so the
// same name on different platforms never collides.
const _bannerCache = new Map()
const BANNER_LOCAL_TTL = 10 * 60 * 1000

// Resolve a single platform banner via SW. Returns the banner record or null.
async function fetchChannelBanner(platform, login) {
  if (!platform || !login) return null
  const key = `${platform}:${String(login).toLowerCase()}`
  const hit = _bannerCache.get(key)
  if (hit && Date.now() - hit.ts < BANNER_LOCAL_TTL) return hit.data
  try {
    const data = await safeSendMessage({ type: 'fetch_channel_banner', platform, username: login })
    _bannerCache.set(key, { data: data || null, ts: Date.now() })
    if (_bannerCache.size > 300) _bannerCache.delete(_bannerCache.keys().next().value)
    return data || null
  } catch {
    return null
  }
}

// Build the platform-preference chain for a profile + context. The context
// platform always wins — a user's identity belongs to the platform you were
// viewing them on. Cross-platform accent inheritance (a kick green ring on
// a twitch user just because they also have a kick account) is wrong: it
// reads as "this person is on kick" when chat says otherwise.
//
// Resolution order:
//   1) Explicit contextPlatform passed by the caller (data-platform on the
//      hovered chat message).
//   2) Hostname inference — multichat overlay runs on twitch.tv / kick.com /
//      youtube.com so the host is a natural fallback when no data-platform
//      attribute is present (mentions in feed posts, etc.).
//   3) Only when neither yields a platform: walk linked accounts on the
//      profile (twitch > kick > youtube).
function pickBannerChain(data, contextPlatform, username) {
  // Hostname fallback when caller didn't pass an explicit platform
  if (!contextPlatform && typeof location !== 'undefined') {
    const h = String(location.hostname || '')
    if (h.includes('twitch.tv')) contextPlatform = 'twitch'
    else if (h.includes('kick.com')) contextPlatform = 'kick'
    else if (h.includes('youtube.com')) contextPlatform = 'youtube'
  }

  const out = []
  const seen = new Set()
  const add = (p, l) => {
    if (!p || !l) return
    const k = `${p}:${String(l).toLowerCase()}`
    if (seen.has(k)) return
    seen.add(k); out.push({ platform: p, login: l })
  }

  // Step 1: the context platform — usually the only entry in the chain.
  if (contextPlatform === 'twitch') add('twitch', data?.twitch_username || username)
  else if (contextPlatform === 'kick') add('kick', data?.kick_username || username)
  else if (contextPlatform === 'youtube' || contextPlatform === 'yt') {
    add('youtube', data?.youtube_channel_id || data?.youtube_username || username)
  }

  // Step 2: only if no context resolved anything — walk linked accounts in
  // the profile-data fallback order. Keeps cross-platform users (e.g. a YT
  // chatter mentioned in a heatsync feed post with no platform context) able
  // to show *some* banner instead of nothing.
  if (!out.length) {
    add('twitch', data?.twitch_username)
    add('kick', data?.kick_username)
    add('youtube', data?.youtube_channel_id || data?.youtube_username)
  }

  // Step 3: last-ditch — raw username, guessing platform from shape.
  if (!out.length && username) {
    if (/^uc[a-z0-9_-]{20,}$/i.test(username)) add('youtube', username)
    else add('twitch', username)
  }
  return out
}

// Walk the chain until one platform returns a usable banner. "Usable" = a real
// bannerUrl/offlineUrl; an empty record is treated as continue. Returns the
// first hit or null after the chain exhausts.
async function fetchBannerChain(chain) {
  // Pass 1 — first real banner image wins, any platform in the chain.
  for (const c of chain) {
    const data = await fetchChannelBanner(c.platform, c.login)
    if (data && (data.bannerUrl || data.offlineUrl)) return data
  }
  // Pass 2 — accent-only fallback is restricted to the FIRST chain entry
  // (the context platform when available). This prevents a Kick brand-green
  // accent from leaking onto a Twitch user just because Twitch's GQL call
  // returned no banner image. Cross-platform accent inheritance is wrong:
  // a user's identity color belongs to the platform they were viewed on.
  if (chain.length) {
    const first = chain[0]
    const data = await fetchChannelBanner(first.platform, first.login)
    if (data && (data.accent || data.profileUrl)) return data
  }
  return null
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
  const label = plat === 'twitch' ? 'ttv' : plat === 'kick' ? 'kick' : plat === 'youtube' ? 'yt' : 'hs'
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

// Top-of-card mod actions — left-click username on a chatter in a channel you
// mod surfaces delete/timeout/ban right at the top, replacing the bulky inline
// hover toolbar on every row. Returns null when not applicable so callers can
// skip the section entirely. Twitch-only (Kick/YT mod GQL not wired).
function pcBuildModActions(username) {
  if (typeof isModForSync !== 'function') return null
  if (typeof getRecentMessagesFromUser !== 'function') return null
  if (!username) return null
  // Don't surface mod actions on your own profile — self-mod buttons are nonsense.
  if (typeof currentUsername !== 'undefined' && currentUsername &&
      username.toLowerCase() === currentUsername.toLowerCase()) return null
  const recent = getRecentMessagesFromUser(username)
  if (!recent.length) return null
  // Group by twitch channel — find most recent msgId per channel where I mod.
  const byChannel = new Map()
  for (const m of recent) {
    if ((m.platform || 'twitch') !== 'twitch') continue
    const ch = (m.channel || '').toLowerCase()
    if (!ch) continue
    if (!isModForSync(ch)) {
      if (typeof prefetchModFor === 'function') prefetchModFor(ch)
      continue
    }
    if (!byChannel.has(ch)) byChannel.set(ch, { channel: ch, msgId: m.id || null })
  }
  if (!byChannel.size) return null
  const sec = document.createElement('div')
  sec.className = 'hs-pcard-section hs-pcard-mod'
  for (const { channel, msgId } of byChannel.values()) {
    const row = document.createElement('div')
    row.className = 'hs-pcard-mod-row'
    const chLabel = document.createElement('span')
    chLabel.className = 'hs-pcard-mod-ch'
    chLabel.textContent = '#' + channel
    row.appendChild(chLabel)
    const actions = [
      { label: 'del msg', title: 'delete this user\'s latest message', need: 'msg', fn: () => deleteTwitchMessage(channel, msgId), verb: 'deleted' },
      { label: '1m',  title: 'timeout 1 minute',   fn: () => timeoutTwitchUser(channel, username, 60, ''),     verb: `timed out ${username} 60s` },
      { label: '10m', title: 'timeout 10 minutes', fn: () => timeoutTwitchUser(channel, username, 600, ''),    verb: `timed out ${username} 600s` },
      { label: '1h',  title: 'timeout 1 hour',     fn: () => timeoutTwitchUser(channel, username, 3600, ''),   verb: `timed out ${username} 1h` },
      { label: '24h', title: 'timeout 24 hours',   fn: () => timeoutTwitchUser(channel, username, 86400, ''),  verb: `timed out ${username} 24h` },
      { label: 'ban', title: 'permanent ban',      fn: () => banTwitchUser(channel, username, ''),             verb: `banned ${username}`, danger: true },
      { label: 'unban', title: 'unban user',       fn: () => unbanTwitchUser(channel, username),               verb: `unbanned ${username}` },
    ]
    for (const a of actions) {
      const b = document.createElement('button')
      b.className = 'hs-pcard-mod-btn' + (a.danger ? ' hs-pcard-mod-btn-danger' : '')
      b.type = 'button'
      b.textContent = a.label
      b.title = a.title
      if (a.need === 'msg' && !msgId) b.disabled = true
      b.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation()
        b.disabled = true
        const orig = b.textContent
        b.textContent = '…'
        let resp
        try { resp = await a.fn() } catch (err) { resp = { error: err?.message || 'error' } }
        b.textContent = orig
        if (resp?.ok) {
          if (typeof showToast === 'function') showToast(a.verb, 'success')
        } else {
          if (typeof showToast === 'function') showToast(`${a.label} failed: ${resp?.error || 'unknown'}`, 'error')
        }
        b.disabled = a.need === 'msg' && !msgId
      })
      row.appendChild(b)
    }
    sec.appendChild(row)
  }
  return sec
}

function renderProfileCardView() {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl || !activeProfileCard) return
  msgsEl.textContent = ''

  const { username, data } = activeProfileCard
  const card = document.createElement('div')
  card.className = 'hs-pcard'

  // Sticky close — pinned top-right, stays in place while card scrolls.
  // Redundant with ESC + actions-grid close, but discoverability is king.
  const closeBtn = document.createElement('button')
  closeBtn.className = 'hs-pcard-close'
  closeBtn.type = 'button'
  closeBtn.title = 'close (Esc)'
  closeBtn.setAttribute('aria-label', 'close profile')
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', closeProfileCard)
  card.appendChild(closeBtn)

  // === Identity section ===
  const idSec = pcMakeSection(data?.display_name || username)
  idSec.classList.add('hs-pcard-id')

  // Hero banner — wide channel banner image as background, with a gradient
  // scrim so text/avatar always read clearly. Filled async by pcApplyBanner
  // when the Twitch GQL response lands. Stays empty (CSS gradient placeholder)
  // until then so layout doesn't jump.
  const heroBanner = document.createElement('div')
  heroBanner.className = 'hs-pcard-hero'
  // dataset target so async banner fetch can find it without storing a closure
  heroBanner.dataset.heroFor = username
  const heroImg = document.createElement('div')
  heroImg.className = 'hs-pcard-hero-img'
  const heroScrim = document.createElement('div')
  heroScrim.className = 'hs-pcard-hero-scrim'
  heroBanner.appendChild(heroImg)
  heroBanner.appendChild(heroScrim)
  idSec.appendChild(heroBanner)

  const idRow = document.createElement('div')
  idRow.className = 'hs-pcard-id-row'

  const avatar = document.createElement('img')
  avatar.className = 'hs-pcard-avatar'
  // For YT users with no heatsync profile, the heatsync API has no avatar,
  // so fall back to the avatar pulled off any recent YT message they sent.
  let ytAvatar = null
  if (!data?.twitch_profile_pic && !data?.kick_profile_pic && !data?.profile_image_url) {
    try {
      const recent = getRecentMessagesFromUser(username)
      const withAv = recent.find(m => m.avatar)
      if (withAv) ytAvatar = withAv.avatar
    } catch {}
  }
  avatar.src = data?.twitch_profile_pic || data?.kick_profile_pic || data?.profile_image_url || ytAvatar || 'https://heatsync.org/anon.webp'
  avatar.alt = ''
  avatar.referrerPolicy = 'no-referrer'
  idRow.appendChild(avatar)

  const idText = document.createElement('div')
  idText.className = 'hs-pcard-id-text'

  // Chip row holds ONLY native chat badge images (sub/mod/vip + 7TV/FFZ/BTTV/
  // Chatterino) — these are visual identity tokens that can't fit a text sheet.
  // Platform usernames, age, role, verified, heat, posts, followers, rel are
  // all rendered as text rows in the property sheet below.
  const chips = document.createElement('div')
  chips.className = 'hs-pcard-id-chips'
  try {
    const userId = data?.twitch_user_id || data?.twitch_id || null
    const recent = (typeof getRecentMessagesFromUser === 'function') ? getRecentMessagesFromUser(username) : []
    const recentTwitch = recent.find(m => (m.platform || 'twitch') === 'twitch' && m.badges)
    let html = ''
    if (recentTwitch && typeof renderBadges === 'function') {
      html += renderBadges(recentTwitch.badges, recentTwitch.channel)
    }
    if (userId && typeof renderThirdPartyBadges === 'function') {
      html += renderThirdPartyBadges(String(userId))
    }
    if (html) {
      const range = document.createRange()
      range.selectNodeContents(chips)
      chips.appendChild(range.createContextualFragment(html))
    }
  } catch {}

  if (chips.children.length) idText.appendChild(chips)

  if (data?.bio) {
    const bio = document.createElement('div')
    bio.className = 'hs-pcard-bio'
    pcAppendBioWithAutolinks(bio, data.bio)
    idText.appendChild(bio)
  }

  idRow.appendChild(idText)
  idSec.appendChild(idRow)
  card.appendChild(idSec)

  // === Mod actions === — top priority when you mod a channel this user is in
  const modSec = pcBuildModActions(username)
  if (modSec) card.appendChild(modSec)

  // === Actions section === — main interactions (follow/whisper/etc) sit above
  // stats now so the useful buttons land in the first viewport, not below the
  // recent-messages scroll.
  {
    const asec = pcMakeSection('actions')
    asec.classList.add('hs-pcard-actions')
    const grid = document.createElement('div')
    grid.className = 'hs-pcard-action-grid'

    const isMuted = mutedUsers.has(username)
    const inChannels = config.channels.some(c => {
      const id = c.id?.toLowerCase()
      const tw = c.twitch?.toLowerCase()
      const ki = c.kick?.toLowerCase()
      return id === username || tw === username || ki === username
    })

    const youFollow = !!(data?.relationship?.youFollow ?? data?.relationship?.isFollowing)
    const youBlock = !!(data?.relationship?.youBlock ?? data?.relationship?.isBlocked)
    const profileId = data?.id || data?.userId || null

    const actions = [
      { label: youFollow ? 'unfollow' : 'follow', fn: () => pcToggleFollow(profileId, username, youFollow), disabled: !profileId },
      { label: 'whisper', fn: () => pcDoWhisper(username) },
      { label: 'dm', fn: () => pcDoDm(username) },
      { label: 'mention', fn: () => pcMention(data?.display_name || username) },
      { label: isMuted ? 'unmute' : 'mute', fn: () => pcToggleMute(username) },
      { label: youBlock ? 'unblock' : 'block', fn: () => pcToggleBlock(profileId, username, youBlock), disabled: !profileId },
    ]
    if (!inChannels) actions.push({ label: 'add channel', fn: () => pcAddAsChannel(username) })

    for (const a of actions) {
      const btn = document.createElement('button')
      btn.className = 'hs-pcard-action'
      if (a.disabled) btn.disabled = true
      btn.textContent = a.label
      btn.addEventListener('click', a.fn)
      grid.appendChild(btn)
    }
    asec.appendChild(grid)
    card.appendChild(asec)
  }

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
    // Platform-verified only — heatsync-DB-only flags can be stale for streamers
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick
    const youSub = rel.youSub ?? rel.isSubscribed ?? rel.subscribedOnTwitch ?? rel.subscribedOnKick
    const subsYou = rel.profileSubbedToViewerOnTwitch || rel.profileSubbedToViewerOnKick

    // Property sheet — 2-col zebra list. Label = dim gray, value = bold white
    // except semantic-state values (age, role, verified, heat, rel) which
    // carry their own brand/state color. 13px Cozette + bitmap render block
    // for crispness; matches house "color when it earns it" rule.
    const sheet = document.createElement('dl')
    sheet.className = 'hs-pcard-sheet'
    const addRow = (label, value, valueClass) => {
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      if (valueClass) dd.className = valueClass
      if (value instanceof Node) dd.appendChild(value)
      else dd.textContent = value
      sheet.appendChild(dt)
      sheet.appendChild(dd)
    }

    // Platform usernames — value text is brand-colored. Live indicator (🔴 +
    // viewer count) appended inline when broadcasting.
    const liveDot = (vc) => {
      const live = document.createElement('span')
      live.className = 'hs-pc-live'
      live.textContent = vc ? ' 🔴 ' + pcFmt(vc) : ' 🔴'
      return live
    }
    if (data.twitch_username) {
      const v = document.createElement('span')
      v.textContent = data.twitch_username
      if (data.twitch_is_live) v.appendChild(liveDot(data.twitch_viewer_count || 0))
      addRow('ttv', v, 'val-ttv')
    }
    if (data.kick_username) {
      const v = document.createElement('span')
      v.textContent = data.kick_username
      if (data.kick_is_live) v.appendChild(liveDot(data.kick_viewer_count || 0))
      addRow('kick', v, 'val-kick')
    }
    if (data.youtube_username || data.youtube_channel_id) {
      const v = document.createElement('span')
      v.textContent = data.youtube_username || username
      if (data.youtube_is_live) v.appendChild(liveDot(data.youtube_viewer_count || 0))
      addRow('yt', v, 'val-yt')
    } else if (activeProfileCard.platform === 'yt' || activeProfileCard.platform === 'youtube') {
      addRow('yt', username, 'val-yt')
    }

    // acctage
    const dates = [data.twitch_created_at, data.kick_created_at]
      .filter(Boolean)
      .filter(d => !isNaN(new Date(d).getTime()))
    const oldest = dates.length ? dates.reduce((a, b) => new Date(b) < new Date(a) ? b : a) : null
    const age = (typeof getAccountAge === 'function') ? getAccountAge(oldest) : null
    if (age) addRow('acctage', age, 'val-age')

    // type (broadcaster status)
    const bt = data.twitch_broadcaster_type
    if (bt === 'partner') addRow('type', 'partner', 'val-partner')
    else if (bt === 'affiliate') addRow('type', 'affiliate', 'val-affiliate')

    // verified
    if (data.twitch_verified) addRow('verified', '✓ twitch', 'val-ttv')
    if (data.kick_verified) addRow('verified', '✓ kick', 'val-kick')

    // heat (keep heatSpanEl for tier glow + degree symbol)
    if (heat) addRow('heat', heatSpanEl(heat), 'val-heat')

    // counts — posts neutral, followers blue (popularity scalar)
    if (posts) addRow('posts', pcFmt(posts))
    if (followers) addRow('followers', pcFmt(followers), 'val-followers')

    // Relationship — direction-coded colors. Outflow (you→them) cool side
    // of the wheel (cyan/violet); inflow (them→you) warm side (magenta/pink);
    // mutual gets a saturated handshake color (lime/gold).
    if (youFollow && followsYou) addRow('rel', 'mutual follow', 'val-mutual')
    else if (youFollow) addRow('you', 'follow', 'val-you-follow')
    else if (followsYou) addRow('they', 'follow you', 'val-they-follow')
    if (youSub && subsYou) addRow('rel', 'mutual sub', 'val-mutual-sub')
    else if (youSub) addRow('you', 'sub', 'val-you-sub')
    else if (subsYou) addRow('they', 'sub to you', 'val-they-sub')

    if (sheet.children.length) statsSec.appendChild(sheet)
    else statsSec.appendChild(document.createTextNode('no stats yet'))
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

  msgsEl.appendChild(card)

  // Hero banner — kick off async fetch using the multi-platform chain. The
  // hero element is already in the DOM with a gradient placeholder; the
  // applier mutates .hs-pcard-hero-img once a banner resolves.
  const chain = pickBannerChain(data, activeProfileCard.platform, username)
  if (chain.length) pcApplyBanner(card, chain)
}

// Async banner application — walks the platform chain and applies the first
// real banner. No-op when the card was closed/re-rendered while in-flight
// (we re-resolve the element off the live messages root each call).
async function pcApplyBanner(card, chain) {
  const banner = await fetchBannerChain(chain)
  if (!banner) return
  const root = document.getElementById('hs-mc-messages')?.querySelector('.hs-pcard') || card
  const hero = root.querySelector('.hs-pcard-hero')
  if (!hero) return
  const heroImg = hero.querySelector('.hs-pcard-hero-img')
  if (!heroImg) return
  const url = banner.bannerUrl || banner.offlineUrl
  if (url) {
    // Preload, then commit — so the fade-in starts on a decoded image,
    // not on a flash of nothing → cached image.
    const probe = new Image()
    probe.onload = () => {
      heroImg.style.backgroundImage = `url("${url}")`
      hero.classList.add('hs-pcard-hero-loaded')
    }
    probe.referrerPolicy = 'no-referrer'
    probe.src = url
  }
  if (banner.accent) {
    // Accent tints scrim + avatar ring + section divider so the whole card
    // adopts the streamer's identity color (Twitch primaryColorHex when
    // present, platform-brand fallbacks for Kick/YouTube).
    root.style.setProperty('--hs-pcard-accent', banner.accent)
    hero.classList.add('hs-pcard-hero-accent')
  }
  if (banner.sourcePlatform) {
    hero.dataset.source = banner.sourcePlatform
  }
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
    if (typeof showToast === 'function') showToast('not registered on heatsync', 'error')
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
        if (typeof showToast === 'function') showToast('follow failed: ' + (resp?.error || 'unknown'), 'error')
        return
      }
    }
    if (typeof showToast === 'function') showToast(targetFollowing ? `following ${username}` : `unfollowed ${username}`, 'success')
    // Tell background to refetch followedUsers — pollFollowedLive runs after,
    // so live notifications + badge include the new follow within ~60s.
    safeSendMessage({ type: 'refresh_followed_users' })
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youFollow = currentlyFollowing
      renderProfileCardView()
    }
    if (typeof showToast === 'function') showToast('follow failed: ' + (e?.message || 'unknown'), 'error')
  }
}

// Heatsync block/unblock — POST/DELETE /api/user/block/{userId}. Server's
// idempotent error responses ('User already blocked' / no record) are treated
// as success. After block, profile auto-unfollows server-side, so we mirror
// that in the relationship object.
async function pcToggleBlock(profileId, username, currentlyBlocked) {
  if (!profileId) {
    if (typeof showToast === 'function') showToast('not registered on heatsync', 'error')
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
        if (typeof showToast === 'function') showToast('block failed: ' + (resp?.error || 'unknown'), 'error')
        return
      }
    }
    if (typeof showToast === 'function') showToast(targetBlocked ? `blocked ${username}` : `unblocked ${username}`, 'success')
    // Block side-effects unfollow on server — re-fetch followedUsers in background
    safeSendMessage({ type: 'refresh_followed_users' })
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youBlock = currentlyBlocked
      activeProfileCard.data.relationship.isBlocked = currentlyBlocked
      renderProfileCardView()
    }
    if (typeof showToast === 'function') showToast('block failed: ' + (e?.message || 'unknown'), 'error')
  }
}

function pcDoWhisper(username) {
  closeProfileCard()
  switchTab('whispers')
  // Pre-fill input with /w <username> for quick start
  cleanup.setTimeout(() => {
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
  const isChatTab = currentTab === 'live' || (typeof config !== 'undefined' && config.channels?.some(c => c.id === currentTab))
  if (!isChatTab) switchTab('live')
  cleanup.setTimeout(() => {
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
  cleanup.setTimeout(() => {
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
    const cid = c.id?.toLowerCase()
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
