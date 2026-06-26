// Full-panel btop-style profile card
// Triggered by clicking any username anywhere in the extension.
// Replaces #hs-mc-messages content. ESC, tab switch, or close button restores chat.

let activeProfileCard = null // { username, platform, data, ts }

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
    seen.add(k)
    out.push({ platform: p, login: l })
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
  const ttl = typeof PROFILE_CACHE_TTL !== 'undefined' ? PROFILE_CACHE_TTL : 300000
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
    // Fire kick enrichment in parallel for kick-platform users — Kick API is
    // public/CORS-friendly and adds bio + socials + pfp + linked twitch even
    // when the user has no heatsync profile.
    const kickEnrichP = platform === 'kick' ? pcFetchKickEnrich(username).catch(() => null) : Promise.resolve(null)
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}${platParam}`)
    if (!activeProfileCard || activeProfileCard.username !== username) return
    let profile = resp?.ok && resp.data?.profile ? resp.data.profile : null
    // Cross-platform probe — kick chatters often share their handle on twitch;
    // a same-name twitch hit lands a full profile when the kick lookup misses.
    if (!profile && platform === 'kick') {
      const twResp = await apiFetch(`/api/profile/${encodeURIComponent(username)}?platform=twitch`)
      if (!activeProfileCard || activeProfileCard.username !== username) return
      if (twResp?.ok && twResp.data?.profile) profile = twResp.data.profile
    }
    const kickEnrich = await kickEnrichP
    if (!activeProfileCard || activeProfileCard.username !== username) return
    if (profile) {
      if (kickEnrich) pcMergeKickEnrich(profile, kickEnrich)
      activeProfileCard.data = profile
      if (typeof _profileCache !== 'undefined') {
        _profileCache.set(cacheKey, { profile, ts: Date.now() })
      }
    } else if (kickEnrich) {
      // Build a synthetic profile from Kick data so the card has something useful
      // instead of "no profile" — bio, socials, pfp, cross-link to twitch.
      activeProfileCard.data = pcSynthFromKickEnrich(username, kickEnrich)
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

// Fetch kick.com/api/v1/users/{name} → bio, twitter, facebook, instagram,
// youtube, discord, tiktok, profilepic. Also captures linked twitch username
// via getKickLinkedTwitch (populated by the 7TV-via-kick cosmetics path).
async function pcFetchKickEnrich(username) {
  if (!username) return null
  const u = String(username).toLowerCase()
  try {
    // Fetch user record + channel record in parallel — most Kick users have
    // both (their channel slug == username). Channel returns follower_count,
    // recent_categories, livestream state. User has bio + socials. Combined
    // gives an S-tier profile-card.
    const [userRes, chanRes] = await Promise.allSettled([
      fetch(`https://kick.com/api/v1/users/${encodeURIComponent(u)}`, { credentials: 'omit' }),
      fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(u)}`, { credentials: 'omit' }),
    ])
    const data =
      userRes.status === 'fulfilled' && userRes.value.ok ? await userRes.value.json().catch(() => null) : null
    const chan =
      chanRes.status === 'fulfilled' && chanRes.value.ok ? await chanRes.value.json().catch(() => null) : null
    if (!data?.id && !chan?.id) return null
    return {
      kick_user_id: data?.id || chan?.user_id || null,
      kick_username: data?.username || chan?.slug || u,
      kick_profile_pic: data?.profilepic || chan?.user?.profile_pic || null,
      kick_bio: data?.bio || chan?.user?.bio || null,
      kick_socials: {
        twitter: data?.twitter || chan?.user?.twitter || null,
        facebook: data?.facebook || chan?.user?.facebook || null,
        instagram: data?.instagram || chan?.user?.instagram || null,
        youtube: data?.youtube || chan?.user?.youtube || null,
        discord: data?.discord || chan?.user?.discord || null,
        tiktok: data?.tiktok || chan?.user?.tiktok || null,
      },
      kick_followers: chan?.followers_count || null,
      kick_is_live: !!chan?.livestream,
      kick_live_viewers: chan?.livestream?.viewer_count || null,
      kick_live_title: chan?.livestream?.session_title || null,
      kick_recent_categories: Array.isArray(chan?.recent_categories)
        ? chan.recent_categories.slice(0, 3).map((c) => ({ name: c.name, slug: c.slug }))
        : null,
      kick_verified: !!chan?.verified,
      linked_twitch_username: typeof getKickLinkedTwitch === 'function' ? getKickLinkedTwitch(u) : null,
    }
  } catch {
    return null
  }
}

function pcMergeKickEnrich(profile, kickEnrich) {
  if (!profile.bio && kickEnrich.kick_bio) profile.bio = kickEnrich.kick_bio
  if (!profile.kick_profile_pic && kickEnrich.kick_profile_pic) profile.kick_profile_pic = kickEnrich.kick_profile_pic
  if (!profile.kick_username && kickEnrich.kick_username) profile.kick_username = kickEnrich.kick_username
  // Merge to canonical Kick fields so the existing stats render picks them up
  if (kickEnrich.kick_followers && !profile.kick_followers) profile.kick_followers = kickEnrich.kick_followers
  if (typeof kickEnrich.kick_is_live === 'boolean' && profile.kick_is_live == null)
    profile.kick_is_live = kickEnrich.kick_is_live
  if (kickEnrich.kick_live_viewers && !profile.kick_viewer_count)
    profile.kick_viewer_count = kickEnrich.kick_live_viewers
  if (kickEnrich.kick_verified && !profile.kick_verified) profile.kick_verified = true
  profile._kick_socials = kickEnrich.kick_socials
  profile._kick_live_title = kickEnrich.kick_live_title
  profile._kick_recent_categories = kickEnrich.kick_recent_categories
  profile._linked_twitch_username = kickEnrich.linked_twitch_username || profile.twitch_username || null
}

function pcSynthFromKickEnrich(username, kickEnrich) {
  return {
    display_name: kickEnrich.kick_username || username,
    kick_username: kickEnrich.kick_username || username,
    kick_profile_pic: kickEnrich.kick_profile_pic || null,
    bio: kickEnrich.kick_bio || null,
    kick_followers: kickEnrich.kick_followers || null,
    kick_is_live: kickEnrich.kick_is_live,
    kick_viewer_count: kickEnrich.kick_live_viewers || null,
    kick_verified: kickEnrich.kick_verified || false,
    _kick_socials: kickEnrich.kick_socials,
    _kick_live_title: kickEnrich.kick_live_title,
    _kick_recent_categories: kickEnrich.kick_recent_categories,
    _linked_twitch_username: kickEnrich.linked_twitch_username,
    _synth_kick_only: true,
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
  // Hotkey: t/k/y/h jumps to the matching platform pill. Click() opens the
  // href in a new tab (target=_blank). Set as .hs-pcard-action so the
  // shared keydown handler at the bottom of this file picks it up.
  const keyMap = { twitch: 't', kick: 'k', youtube: 'y', heatsync: 'h' }
  if (keyMap[plat]) {
    pill.classList.add('hs-pcard-action')
    pill.dataset.pcKey = keyMap[plat]
  }
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
  if (
    typeof currentUsername !== 'undefined' &&
    currentUsername &&
    username.toLowerCase() === currentUsername.toLowerCase()
  )
    return null
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
      {
        label: 'del msg',
        title: "delete this user's latest message",
        need: 'msg',
        fn: () => deleteTwitchMessage(channel, msgId),
        verb: 'deleted',
        action: 'delete',
      },
      {
        label: '1m',
        title: 'timeout 1 minute',
        fn: () => timeoutTwitchUser(channel, username, 60, ''),
        verb: `timed out ${username} 60s`,
        action: 'timeout',
        durationSec: 60,
      },
      {
        label: '10m',
        title: 'timeout 10 minutes',
        fn: () => timeoutTwitchUser(channel, username, 600, ''),
        verb: `timed out ${username} 600s`,
        action: 'timeout',
        durationSec: 600,
      },
      {
        label: '1h',
        title: 'timeout 1 hour',
        fn: () => timeoutTwitchUser(channel, username, 3600, ''),
        verb: `timed out ${username} 1h`,
        action: 'timeout',
        durationSec: 3600,
      },
      {
        label: '24h',
        title: 'timeout 24 hours',
        fn: () => timeoutTwitchUser(channel, username, 86400, ''),
        verb: `timed out ${username} 24h`,
        action: 'timeout',
        durationSec: 86400,
      },
      {
        label: 'ban',
        title: 'permanent ban',
        fn: () => banTwitchUser(channel, username, ''),
        verb: `banned ${username}`,
        danger: true,
        action: 'ban',
      },
      {
        label: 'unban',
        title: 'unban user',
        fn: () => unbanTwitchUser(channel, username),
        verb: `unbanned ${username}`,
        action: 'unban',
      },
    ]
    for (const a of actions) {
      const b = document.createElement('button')
      b.className = 'hs-pcard-mod-btn' + (a.danger ? ' hs-pcard-mod-btn-danger' : '')
      b.type = 'button'
      b.textContent = a.label
      b.title = a.title
      if (a.need === 'msg' && !msgId) b.disabled = true
      b.addEventListener('click', async (e) => {
        e.preventDefault()
        e.stopPropagation()
        b.disabled = true
        const orig = b.textContent
        b.textContent = '…'
        let resp
        try {
          resp = await a.fn()
        } catch (err) {
          resp = { error: err?.message || 'error' }
        }
        b.textContent = orig
        if (resp?.ok) {
          globalThis.__hsInjectModNotice?.({ channel, action: a.action, target: username, durationSec: a.durationSec, msgId })
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
  // Paint the identity title with the user's 7TV cosmetic when known.
  const idPaint = userPaintStyle(String(data?.twitch_user_id || data?.twitch_id || ''), (username || '').toLowerCase())
  if (idPaint) {
    const titleEl = idSec.querySelector('.hs-pcard-section-title')
    if (titleEl) titleEl.style.cssText += ';' + idPaint
  }

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
      const withAv = recent.find((m) => m.avatar)
      if (withAv) ytAvatar = withAv.avatar
    } catch {}
  }
  avatar.src =
    data?.twitch_profile_pic ||
    data?.kick_profile_pic ||
    data?.profile_image_url ||
    ytAvatar ||
    'https://heatsync.org/anon.webp'
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
    const recent = typeof getRecentMessagesFromUser === 'function' ? getRecentMessagesFromUser(username) : []
    const recentTwitch = recent.find((m) => (m.platform || 'twitch') === 'twitch' && m.badges)
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

  // Cross-platform link — "also @xqc on twitch" for Kick chatters whose 7TV
  // account links a Twitch handle. Surfaces the unified identity.
  const linkedTwitch = data?._linked_twitch_username || data?.twitch_username
  if (linkedTwitch && activeProfileCard.platform === 'kick') {
    const xref = document.createElement('div')
    xref.className = 'hs-pcard-xref'
    xref.style.cssText = 'font-size:13px;color:#999;margin-top:2px;'
    xref.appendChild(document.createTextNode('also '))
    const a = document.createElement('a')
    a.href = `https://twitch.tv/${encodeURIComponent(linkedTwitch)}`
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.cssText = 'color:#9146ff;font-weight:700;text-decoration:none;'
    a.textContent = '@' + linkedTwitch
    xref.appendChild(a)
    xref.appendChild(document.createTextNode(' on twitch'))
    idText.appendChild(xref)
  }

  // Kick socials row — twitter, instagram, youtube, tiktok, discord, facebook.
  // Compact icon-ish text links, only rendered when populated. Pure visibility
  // win for Kick-only users who'd otherwise see a near-empty card.
  const kickSocials = data?._kick_socials
  if (kickSocials) {
    const socEntries = []
    if (kickSocials.twitter) socEntries.push(['twitter', `https://twitter.com/${kickSocials.twitter}`])
    if (kickSocials.instagram) socEntries.push(['instagram', `https://instagram.com/${kickSocials.instagram}`])
    if (kickSocials.youtube)
      socEntries.push([
        'youtube',
        kickSocials.youtube.startsWith('http') ? kickSocials.youtube : `https://youtube.com/${kickSocials.youtube}`,
      ])
    if (kickSocials.tiktok) socEntries.push(['tiktok', `https://tiktok.com/@${kickSocials.tiktok}`])
    if (kickSocials.facebook)
      socEntries.push([
        'facebook',
        kickSocials.facebook.startsWith('http') ? kickSocials.facebook : `https://facebook.com/${kickSocials.facebook}`,
      ])
    if (kickSocials.discord) socEntries.push(['discord', kickSocials.discord])
    if (socEntries.length) {
      const soc = document.createElement('div')
      soc.className = 'hs-pcard-socials'
      soc.style.cssText = 'font-size:13px;margin-top:3px;display:flex;flex-wrap:wrap;gap:6px;'
      for (const [label, href] of socEntries) {
        if (!/^https?:\/\//i.test(href)) {
          const span = document.createElement('span')
          span.style.cssText = 'color:#999;'
          span.textContent = `${label}: ${href}`
          soc.appendChild(span)
        } else {
          const a = document.createElement('a')
          a.href = href
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          a.style.cssText = 'color:#53fc18;text-decoration:none;'
          a.textContent = label
          soc.appendChild(a)
        }
      }
      idText.appendChild(soc)
    }
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

    const isMuted =
      typeof isUserMuted === 'function' ? isUserMuted(username, activeProfileCard.platform) : mutedUsers.has(username)
    const inChannels = config.channels.some((c) => {
      const id = c.id?.toLowerCase()
      const tw = c.twitch?.toLowerCase()
      const ki = c.kick?.toLowerCase()
      return id === username || tw === username || ki === username
    })

    const youFollow = !!(data?.relationship?.youFollow ?? data?.relationship?.isFollowing)
    const youBlock = !!(data?.relationship?.youBlock ?? data?.relationship?.isBlocked)
    const profileId = data?.id || data?.userId || null

    // hotkeys: f follow / w whisper / d dm / @ mention / m mute / b block /
    // + add channel. Letter shown as a leading [k] indicator. Platform
    // pills get t/k/y/h on the pcMakePill side.
    const actions = [
      {
        label: youFollow ? 'unfollow' : 'follow',
        key: 'f',
        fn: () => pcToggleFollow(profileId, username, youFollow),
        disabled: !profileId,
      },
      { label: 'whisper', key: 'w', fn: () => pcDoWhisper(username, activeProfileCard?.platform) },
      { label: 'dm', key: 'd', fn: () => pcDoDm(username, activeProfileCard?.platform) },
      { label: 'mention', key: '@', fn: () => pcMention(data?.display_name || username) },
      { label: isMuted ? 'unmute' : 'mute', key: 'm', fn: () => pcToggleMute(username) },
      {
        label: youBlock ? 'unblock' : 'block',
        key: 'b',
        fn: () => pcToggleBlock(profileId, username, youBlock),
        disabled: !profileId,
      },
    ]
    if (!inChannels) actions.push({ label: 'add channel', key: '+', fn: () => pcAddAsChannel(username) })

    for (const a of actions) {
      const btn = document.createElement('button')
      btn.className = 'hs-pcard-action'
      if (a.disabled) btn.disabled = true
      btn.textContent = a.label
      if (a.key) btn.dataset.pcKey = a.key
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
    // No heatsync profile — still surface the platform identity row so the
    // card has at least one useful link (channel url) instead of a dead end.
    const plat = activeProfileCard.platform
    const sheet = document.createElement('dl')
    sheet.className = 'hs-pcard-sheet'
    const addRow = (label, value, valueClass) => {
      const dt = document.createElement('dt')
      dt.textContent = label
      const dd = document.createElement('dd')
      if (valueClass) dd.className = valueClass
      dd.textContent = value
      sheet.appendChild(dt)
      sheet.appendChild(dd)
    }
    if (plat === 'kick') addRow('kick', username, 'val-kick')
    else if (plat === 'youtube' || plat === 'yt') addRow('yt', username, 'val-yt')
    else addRow('ttv', username, 'val-ttv')
    statsSec.appendChild(sheet)
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
    // Platform usernames render as clickable links to the channel page —
    // same tab navigation (no _blank) per "go to page" UX. Useful for
    // actually following on a platform: heatsync follow is the source of
    // truth, but if the user wants to follow on twitch/kick natively
    // (e.g. to get their notification, or because twitch's anti-bot
    // blocks programmatic propagation), they click here to open the
    // channel page and click the native follow button.
    const mkLink = (href, label, liveVc) => {
      const a = document.createElement('a')
      a.href = href
      a.textContent = label
      a.dataset.pcardPill = '1' // bypasses overlay click interception
      if (typeof liveVc === 'number') a.appendChild(liveDot(liveVc))
      return a
    }
    if (data.twitch_username) {
      addRow(
        'ttv',
        mkLink(
          'https://twitch.tv/' + encodeURIComponent(data.twitch_username),
          data.twitch_username,
          data.twitch_is_live ? data.twitch_viewer_count || 0 : undefined,
        ),
        'val-ttv',
      )
    }
    if (data.kick_username) {
      addRow(
        'kick',
        mkLink(
          'https://kick.com/' + encodeURIComponent(data.kick_username),
          data.kick_username,
          data.kick_is_live ? data.kick_viewer_count || 0 : undefined,
        ),
        'val-kick',
      )
    }
    if (data.youtube_username || data.youtube_channel_id) {
      const ytName = data.youtube_username || username
      const ytHref = data.youtube_username
        ? 'https://youtube.com/@' + encodeURIComponent(data.youtube_username)
        : 'https://youtube.com/channel/' + encodeURIComponent(data.youtube_channel_id)
      addRow('yt', mkLink(ytHref, ytName, data.youtube_is_live ? data.youtube_viewer_count || 0 : undefined), 'val-yt')
    } else if (activeProfileCard.platform === 'yt' || activeProfileCard.platform === 'youtube') {
      addRow('yt', mkLink('https://youtube.com/@' + encodeURIComponent(username), username), 'val-yt')
    }

    // acctage
    const dates = [data.twitch_created_at, data.kick_created_at]
      .filter(Boolean)
      .filter((d) => !isNaN(new Date(d).getTime()))
    const oldest = dates.length ? dates.reduce((a, b) => (new Date(b) < new Date(a) ? b : a)) : null
    const age = typeof getAccountAge === 'function' ? getAccountAge(oldest) : null
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
    // Kick channel-specific stats from /api/v2/channels — only when no
    // heatsync-tracked twitch followers (would be redundant) or when the
    // profile is Kick-only (synth).
    if (data._kick_recent_categories && data._kick_recent_categories.length) {
      const cat = data._kick_recent_categories[0]
      if (cat?.name) addRow('playing', cat.name, 'val-kick')
    }
    if (data.kick_is_live && data._kick_live_title) {
      addRow('stream', data._kick_live_title.slice(0, 60))
    }

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
      url = data.youtube_username
        ? `https://youtube.com/@${data.youtube_username}/live`
        : data.youtube_channel_id
          ? `https://youtube.com/channel/${data.youtube_channel_id}/live`
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
  // safeUrl gates protocol (http/https only); escape quote+backslash so a
  // crafted banner URL (kick/yt-sourced) can't break out of url("…") and
  // inject CSS.
  const safe = safeUrl(banner.bannerUrl || banner.offlineUrl)
  if (safe) {
    // Preload, then commit — so the fade-in starts on a decoded image,
    // not on a flash of nothing → cached image.
    const probe = new Image()
    probe.onload = () => {
      heroImg.style.backgroundImage = `url("${safe.replace(/\\/g, '%5C').replace(/"/g, '%22')}")`
      hero.classList.add('hs-pcard-hero-loaded')
    }
    probe.referrerPolicy = 'no-referrer'
    probe.src = safe
  }
  // Fill avatar from banner fetch's profile_pic when the card landed on the
  // anon placeholder (no heatsync profile pic). Kick API returns profile_pic
  // alongside the banner so unregistered kick chatters get a real face.
  if (banner.profileUrl) {
    const avatar = root.querySelector('.hs-pcard-avatar')
    if (avatar && (avatar.src || '').includes('anon.webp')) {
      avatar.src = banner.profileUrl
    }
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

async function pcToggleMute(username) {
  username = username.toLowerCase()
  const platform = activeProfileCard?.platform
  const aliases =
    typeof expandUserAliases === 'function'
      ? await expandUserAliases(username, platform)
      : typeof getUserAliases === 'function'
        ? getUserAliases(username, platform)
        : [username]
  const wasMuted = typeof isUserMuted === 'function' ? isUserMuted(username, platform) : mutedUsers.has(username)
  if (wasMuted) {
    for (const a of aliases) mutedUsers.delete(a)
    for (const a of aliases) safeSendMessage({ type: 'unmute_user', username: a })
  } else {
    for (const a of aliases) mutedUsers.add(a)
    const exp = Date.now() + 86400000
    for (const a of aliases) safeSendMessage({ type: 'mute_user', username: a, expiresAt: exp })
  }
  chrome.storage.local.set({ heatsync_mc_muted: [...mutedUsers] })
  renderProfileCardView()
}

// Heatsync follow/unfollow — POST/DELETE /api/follow/{userId}. Server returns
// 400 'Already following' / 'Not following' for no-op state which we treat as
// idempotent success. After success, ping background to refresh followedUsers
// so the new follow shows up in live notifications + badge immediately.
// Mutate every _profileCache entry for this user so subsequent reads (ctx
// menu's hsRelPeek, tooltip rehover, profile card reopen) see fresh state.
// Without this, after pcToggleFollow the cached profile keeps the pre-toggle
// youFollow and the next right-click still says "follow".
function _patchProfileCacheRel(username, patch) {
  if (typeof _profileCache === 'undefined' || !_profileCache) return
  const u = String(username).toLowerCase()
  for (const [k, v] of _profileCache) {
    if (!k.endsWith(':' + u)) continue
    const prof = v?.profile
    if (!prof) continue
    prof.relationship = { ...(prof.relationship || {}), ...patch }
  }
}

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
  _patchProfileCacheRel(username, { youFollow: targetFollowing, isFollowing: targetFollowing })
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
        _patchProfileCacheRel(username, { youFollow: currentlyFollowing, isFollowing: currentlyFollowing })
        if (typeof showToast === 'function') showToast('follow failed: ' + (resp?.error || 'unknown'), 'error')
        return
      }
    }
    if (typeof showToast === 'function')
      showToast(targetFollowing ? `following ${username}` : `unfollowed ${username}`, 'success')
    // Tell background to refetch followedUsers — pollFollowedLive runs after,
    // so live notifications + badge include the new follow within ~60s.
    safeSendMessage({ type: 'refresh_followed_users' })
    // Cross-platform propagation — server returns target.{twitch_id, kick_username}
    // on success. Fire and forget; failures queue locally for next platform tab.
    const tgt = resp?.data?.target || resp?.target || null
    if (tgt && typeof propagateFollow === 'function') {
      propagateFollow(targetFollowing, tgt).catch(() => {})
    }
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youFollow = currentlyFollowing
      renderProfileCardView()
    }
    _patchProfileCacheRel(username, { youFollow: currentlyFollowing, isFollowing: currentlyFollowing })
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
  _patchProfileCacheRel(
    username,
    targetBlocked
      ? { youBlock: true, isBlocked: true, youFollow: false, isFollowing: false }
      : { youBlock: false, isBlocked: false },
  )
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
        _patchProfileCacheRel(username, { youBlock: currentlyBlocked, isBlocked: currentlyBlocked })
        if (typeof showToast === 'function') showToast('block failed: ' + (resp?.error || 'unknown'), 'error')
        return
      }
    }
    if (typeof showToast === 'function')
      showToast(targetBlocked ? `blocked ${username}` : `unblocked ${username}`, 'success')
    // Hide/restore the user's live messages immediately. block_user → bg →
    // user_blocked broadcast → main.js updates blockedUsers + re-renders. Mirrors
    // the chat right-click path; without it a profile-card block only took
    // effect on next reload. Fans out across linked twitch/kick aliases.
    try {
      const platform = activeProfileCard?.platform
      const aliases =
        typeof expandUserAliases === 'function'
          ? await expandUserAliases(String(username).toLowerCase(), platform)
          : [String(username).toLowerCase()]
      const blockMsg = targetBlocked ? 'block_user' : 'unblock_user'
      for (const a of aliases) safeSendMessage({ type: blockMsg, username: a })
    } catch (_) {
      /* best-effort live hide */
    }
    // Block side-effects unfollow on server — re-fetch followedUsers in background
    safeSendMessage({ type: 'refresh_followed_users' })
    // Block always implies platform-unfollow (server auto-unfollowed heatsync).
    // Mirror on twitch/kick so the relationship stays consistent across surfaces.
    // No corresponding "block on twitch/kick" — those are separate user actions
    // intentionally not auto-propagated (block is a user-level decision).
    if (targetBlocked) {
      const tgt = resp?.data?.target || resp?.target || null
      if (tgt && typeof propagateFollow === 'function') {
        propagateFollow(false, tgt).catch(() => {})
      }
    }
  } catch (e) {
    if (activeProfileCard?.data?.relationship) {
      activeProfileCard.data.relationship.youBlock = currentlyBlocked
      activeProfileCard.data.relationship.isBlocked = currentlyBlocked
      renderProfileCardView()
    }
    _patchProfileCacheRel(username, { youBlock: currentlyBlocked, isBlocked: currentlyBlocked })
    if (typeof showToast === 'function') showToast('block failed: ' + (e?.message || 'unknown'), 'error')
  }
}

function pcDoWhisper(username, platform) {
  closeProfileCard()
  // _openWhisperFor handles platform-aware twitch-handle resolution + tab switch + prefill.
  cleanup.setTimeout(() => _openWhisperFor(username, platform), 50)
}

function setupProfileCardHandlers() {
  if (window._hsProfileCardSetup) return
  window._hsProfileCardSetup = true

  // Primary path — pcard-early.js (document_start) intercepts the click before
  // Twitch/Kick can react and dispatches this event.
  cleanup.addEventListener(
    document,
    'hs-pcard-open',
    (e) => {
      const { username, platform } = e.detail || {}
      if (username) openProfileCard(username, platform || null)
    },
    { signal: mcSignal },
  )

  // Channel list changed (right-click remove, add via pill, server sync, etc.) —
  // re-render the open card so the [+] action reflects the new in-channels state.
  cleanup.addEventListener(
    document,
    'hs-channels-changed',
    () => {
      if (activeProfileCard) renderProfileCardView()
    },
    { signal: mcSignal },
  )

  // Username click → open card. Capture phase so we beat Twitch/Kick native user-card handlers.
  // Allow ctrl/meta/shift/middle/alt to fall through to the <a target="_blank"> default nav.
  cleanup.addEventListener(
    document,
    'click',
    (e) => {
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
    },
    { capture: true, signal: mcSignal },
  )

  // Twitch attaches mousedown handlers too — block those at capture so the native card never opens
  cleanup.addEventListener(
    document,
    'mousedown',
    (e) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
      const userEl = e.target.closest('.hs-mc-user')
      if (!userEl) return
      if (e.target.closest('[data-pcard-pill]')) return
      if (userEl.classList.contains('hs-mc-reply-user')) return
      e.stopPropagation()
      e.stopImmediatePropagation()
    },
    { capture: true, signal: mcSignal },
  )

  // ESC closes the card; single-letter hotkeys trigger actions while open
  cleanup.addEventListener(
    document,
    'keydown',
    (e) => {
      if (!activeProfileCard) return
      // Ignore keys while typing in inputs/textareas
      const t = e.target
      const inEditable = t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable
      if (inEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          closeProfileCard()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        closeProfileCard()
        return
      }
      // Keymap: t/k/y/h jump to platform pills (twitch/kick/youtube/heatsync),
      // f follow, w whisper, d dm, @ mention, m mute, b block, + add channel.
      // '=' aliases '+' (shifted on US keyboards) for one-handed access.
      const key = e.key.toLowerCase()
      const allowed = new Set(['t', 'k', 'y', 'h', 'f', 'w', 'd', '@', 'm', 'b', '+', '='])
      if (!allowed.has(key)) return
      const target = key === '=' ? '+' : key
      const btn = document.querySelector(`.hs-pcard-action[data-pc-key="${target}"]`)
      if (btn && !btn.disabled) {
        e.preventDefault()
        btn.click()
      }
    },
    'mc-pcard-keys',
  )
}

function pcMention(name) {
  closeProfileCard()
  // If on a non-chat tab, switch to live first
  const isChatTab =
    currentTab === 'live' || (typeof config !== 'undefined' && config.channels?.some((c) => c.id === currentTab))
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

function pcDoDm(username, platform) {
  closeProfileCard()
  // _openDmFor handles platform-aware heatsync-handle resolution + tab switch + prefill.
  cleanup.setTimeout(() => _openDmFor(username, platform), 50)
}

async function pcAddAsChannel(username) {
  if (!config?.channels) return
  const id = username.toLowerCase()
  const exists = config.channels.some((c) => {
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
    try {
      chrome.runtime.sendMessage({ type: 'join_channel', platform: 'twitch', channel: channel.twitch })
    } catch {}
  }
  if (channel.kick) kickChat?.join(channel.kick)
  if (channel.youtube) {
    youtubeLinks.set(channel.id, { url: channel.youtube, videoId: '', channelName: '' })
    try {
      chrome.runtime.sendMessage({ type: 'youtube_ws_subscribe', url: channel.youtube, channelId: channel.id })
    } catch {}
  }
  closeProfileCard()
  switchTab(channel.id)
}
