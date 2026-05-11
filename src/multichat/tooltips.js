// Tooltips - toast, emote tooltip, user profile card, link preview
// Note: all innerHTML usage passes content through escapeHtml() first (see src/lib/utils.js)

  function showToast(msg, type) {
    // Routed through HsNotifs (notifs.js) — single source of truth for layers,
    // dedup, lifecycle. Adding/removing notif types happens there.
    try {
      HsNotifs.emit('toast', { text: msg, level: type })
    } catch (_) {
      // Fallback if manager somehow unavailable (shouldn't happen — same IIFE)
      console.warn('[heatsync-mc]', type || 'info', msg)
    }
  }

  // Badge hover tooltip (4x preview with name)
  let badgeTooltip = null

  function ensureBadgeTooltip() {
    if (!badgeTooltip || !document.contains(badgeTooltip)) {
      badgeTooltip = document.createElement('div')
      badgeTooltip.id = 'hs-badge-tooltip'
      const img = document.createElement('img')
      const name = document.createElement('span')
      name.className = 'tooltip-name'
      const source = document.createElement('span')
      source.className = 'tooltip-source'
      badgeTooltip.appendChild(img)
      badgeTooltip.appendChild(name)
      badgeTooltip.appendChild(source)
      document.body.appendChild(cleanup.trackNode(badgeTooltip))
    }
    return badgeTooltip
  }

  function showBadgeTooltip(badgeImg, badgeName) {
    const tooltip = ensureBadgeTooltip()
    document.body.appendChild(cleanup.trackNode(tooltip))
    const img = tooltip.querySelector('img')
    img.src = badgeImg.src
    img.alt = badgeName
    img.style.width = '72px'
    img.style.height = '72px'
    tooltip.querySelector('.tooltip-name').textContent = badgeName
    // Detect source from URL
    const src = badgeImg.src
    const sourceLabel = src.includes('betterttv') ? 'BTTV'
      : src.includes('frankerfacez') ? 'FFZ'
      : src.includes('7tv') ? '7TV'
      : src.includes('jtvnw.net') ? 'Twitch'
      : src.includes('kick') ? 'Kick'
      : (src.includes('googleusercontent') || src.includes('ggpht')) ? 'YouTube'
      : ''
    const sourceEl = tooltip.querySelector('.tooltip-source')
    sourceEl.textContent = sourceLabel
    sourceEl.className = 'tooltip-source'

    tooltip.style.left = '-9999px'
    tooltip.style.top = '-9999px'
    tooltip.classList.add('visible')
    positionTooltipAtElement(tooltip, badgeImg)
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, badgeImg))
  }

  function hideBadgeTooltip() {
    if (badgeTooltip) badgeTooltip.classList.remove('visible')
  }

  // Emote hover tooltip (4x preview with source color)
  let emoteTooltip = null;

  function ensureEmoteTooltip() {
    if (!emoteTooltip || !document.contains(emoteTooltip)) {
      emoteTooltip = document.createElement('div');
      emoteTooltip.id = 'hs-emote-tooltip';
      emoteTooltip.innerHTML = `
        <img src="" alt="">
        <span class="tooltip-name"></span>
        <span class="tooltip-source"></span>
      `;
      document.body.appendChild(cleanup.trackNode(emoteTooltip));
    }
    return emoteTooltip;
  }

  // Set of hi-res URLs we've successfully preloaded. Once an emote is in here,
  // skip the 1x→4x swap entirely on next hover (no flicker, no re-fetch).
  const _hiResLoaded = new Set();

  function showEmoteTooltip(e, emoteName, emoteUrl, state, source, hoveredImg, owner) {
    const tooltip = ensureEmoteTooltip();
    // Re-append to body so DOM order tiebreaks above other max-int siblings
    // (reply-stack overlay sits at the same z-index).
    document.body.appendChild(cleanup.trackNode(tooltip));
    const img = tooltip.querySelector('img');
    const nameEl = tooltip.querySelector('.tooltip-name');
    const stateEl = tooltip.querySelector('.tooltip-source');

    const w4 = (hoveredImg?.offsetWidth || 28) * 4;
    const h4 = (hoveredImg?.offsetHeight || 28) * 4;
    img.style.width = w4 + 'px';
    img.style.height = h4 + 'px';
    img.alt = emoteName;
    const hiResUrl = getHighResUrl(emoteUrl);
    if (hiResUrl !== emoteUrl && _hiResLoaded.has(hiResUrl)) {
      // Already preloaded — go straight to hi-res, no swap-flicker.
      img.src = hiResUrl;
    } else {
      // First time: show 1x immediately, upgrade in background. The hi-res URL
      // is cached after first load so subsequent hovers are flicker-free.
      img.src = emoteUrl;
      if (hiResUrl !== emoteUrl) {
        const hiRes = new Image();
        hiRes.onload = () => {
          _hiResLoaded.add(hiResUrl);
          if (_hiResLoaded.size > 2000) _hiResLoaded.delete(_hiResLoaded.values().next().value);
          if (img.alt === emoteName) img.src = hiResUrl;
        };
        hiRes.src = hiResUrl;
      }
    }
    nameEl.textContent = emoteName;

    // Show state with source for globals
    let label;
    if (state === 'owned') {
      label = t('mc_emote_in_set');
    } else if (state === 'unadded') {
      label = t('mc_emote_click_add');
    } else if (state === 'blocked') {
      label = t('mc_emote_blocked');
    } else {
      // Global / channel / sub - show source with appropriate scope
      const sourceLabels = {
        '7tv': '7TV',
        'bttv': 'BTTV',
        'ffz': 'FFZ',
        'twitch': 'Twitch',
        'kick': 'Kick',
        'heatsync': 'Heatsync'
      };
      const sourceName = sourceLabels[source] || source || 'unknown';
      if (state === 'sub') {
        // Twitch sub emote — show broadcaster as scope so it's specific
        label = owner ? `${owner} sub (${sourceName})` : sourceName;
      } else {
        label = sourceName;
      }
    }
    stateEl.textContent = label;
    const srcClass = (state === 'global' || state === 'channel' || state === 'sub') && source ? ' src-' + source.toLowerCase().replace(/[^a-z0-9]/g, '') : ''
    stateEl.className = 'tooltip-source ' + (state || 'global') + srcClass;

    // Position: anchor above the emote element
    const anchorEl = hoveredImg || e.target;
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    tooltip.classList.add('visible');
    // Double-position: first pass gets approximate, rAF gets exact after layout
    positionTooltipAtElement(tooltip, anchorEl);
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, anchorEl));
  }

  function showEmojiTooltip(targetEl, emoji, name) {
    const tooltip = ensureEmoteTooltip()
    document.body.appendChild(cleanup.trackNode(tooltip))
    const img = tooltip.querySelector('img')
    const nameEl = tooltip.querySelector('.tooltip-name')
    const stateEl = tooltip.querySelector('.tooltip-source')

    // Hide the image, show emoji character at 4x instead
    img.style.display = 'none'

    // Build emoji preview using safe DOM methods
    nameEl.textContent = ''
    const emojiChar = document.createElement('span')
    Object.assign(emojiChar.style, { fontSize: '64px', lineHeight: '1', fontVariantEmoji: 'emoji', display: 'block', textAlign: 'center' })
    emojiChar.textContent = emoji
    const label = document.createElement('span')
    Object.assign(label.style, { display: 'block', marginTop: '4px' })
    label.textContent = ':' + name + ':'
    nameEl.appendChild(emojiChar)
    nameEl.appendChild(label)

    stateEl.textContent = t('mc_tip_emoji')
    stateEl.className = 'tooltip-source'

    tooltip.style.left = '-9999px'
    tooltip.style.top = '-9999px'
    tooltip.classList.add('visible')
    positionTooltipAtElement(tooltip, targetEl)
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, targetEl))
  }

  // Refresh tooltip text/color if it's currently showing the given emote
  function refreshEmoteTooltip(emoteName, newState) {
    if (!emoteTooltip || !emoteTooltip.classList.contains('visible')) return;
    const nameEl = emoteTooltip.querySelector('.tooltip-name');
    if (nameEl?.textContent !== emoteName) return;
    const stateEl = emoteTooltip.querySelector('.tooltip-source');
    if (!stateEl) return;
    const labels = { owned: t('mc_emote_in_set'), unadded: t('mc_emote_click_add'), blocked: t('mc_emote_blocked') };
    stateEl.textContent = labels[newState] || newState;
    stateEl.className = 'tooltip-source ' + (newState || 'global');
  }

  function hideEmoteTooltip() {
    if (emoteTooltip) {
      emoteTooltip.classList.remove('visible');
      // Reset img display for next emote hover
      const img = emoteTooltip.querySelector('img')
      if (img) img.style.display = ''
    }
  }

  function setupEmoteTooltipHandlers() {
    if (window._hsEmoteTooltipSetup) return;
    window._hsEmoteTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const target = e.target;

      // Badge hover: show 4x preview with name
      const badgeImg = target.tagName === 'IMG' && target.classList.contains('hs-mc-badge-img') ? target : null
      if (badgeImg) {
        const badgeName = badgeImg.title || badgeImg.alt || ''
        if (badgeName) {
          showBadgeTooltip(badgeImg, badgeName)
        }
        return
      }

      // Emoji hover: show 4x preview
      const emojiSpan = target.closest('.hs-mc-emoji');
      if (emojiSpan) {
        const name = emojiSpan.dataset.emojiName || emojiSpan.title?.replace(/:/g, '') || '';
        showEmojiTooltip(emojiSpan, emojiSpan.textContent, name);
        return;
      }

      // Check wrapper first, then IMG
      const wrapper = target.closest('.hs-mc-emote-wrapper');
      const img = wrapper ? wrapper.querySelector('img') : (
        target.tagName === 'IMG' && (target.classList.contains('hs-mc-emote') || target.classList.contains('hs-mc-picker-emote')) ? target : null
      );
      if (!img && !wrapper) return;

      const emoteName = wrapper?.dataset.emoteName || img?.alt || img?.dataset.emoteName || img?.title?.split(' ')[0];
      if (!emoteName) return;

      const emoteUrl = wrapper?.dataset.emoteUrl || img?.src;
      const state = wrapper?.dataset.state || img?.dataset.state || 'global';
      const source = wrapper?.dataset.source || img?.dataset.source || detectEmoteSource(emoteUrl);
      const owner = wrapper?.dataset.owner || img?.dataset.owner || '';

      showEmoteTooltip(e, emoteName, emoteUrl, state, source, img, owner);

      // Cross-highlight: add highlight to all wrappers with same emote name.
      // For wrappers in collapsed stacks, derive color from the stack's worst
      // state (blocked > unadded > normal) so the same nest always shows the
      // same hover color regardless of which emote inside you happen to land on.
      const stack = wrapper?.closest?.('.hs-mc-emote-stack:not(.expanded)')
      let effectiveState = state
      if (stack) {
        if (stack.querySelector('.hs-mc-emote-wrapper.hs-state-blocked')) effectiveState = 'blocked'
        else if (stack.querySelector('.hs-mc-emote-wrapper.hs-state-unadded')) effectiveState = 'unadded'
        else effectiveState = 'normal'
      }
      const sourceColor = effectiveState === 'blocked' ? '#ff0000'
        : effectiveState === 'unadded' ? '#ff8700'
        : '#00ff00'
      document.body.style.setProperty('--hs-highlight-color', sourceColor)
      queryEmoteWrappers(emoteName).forEach(w => {
        w.classList.add('hs-emote-highlight');
      });
    }, 'mc-emote-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const target = e.target;

      // Badge mouseout
      if (target.tagName === 'IMG' && target.classList.contains('hs-mc-badge-img')) {
        hideBadgeTooltip()
        return
      }

      const wrapper = target.closest('.hs-mc-emote-wrapper');
      const img = wrapper ? wrapper.querySelector('img') : (
        target.tagName === 'IMG' && (target.classList.contains('hs-mc-emote') || target.classList.contains('hs-mc-picker-emote')) ? target : null
      );
      if (!img && !wrapper) return;

      hideEmoteTooltip();

      // Remove cross-highlight from all wrappers
      const emoteName = wrapper?.dataset.emoteName || img?.alt || img?.dataset.emoteName;
      if (emoteName) {
        queryEmoteWrappers(emoteName).forEach(w => {
          w.classList.remove('hs-emote-highlight');
        });
      }
    }, 'mc-emote-tooltip-mouseout');

    // Hide tooltip+highlight on any scroll (wheel/trackpad/drag — mouseout doesn't fire when elements scroll away)
    let _dismissRafPending = false
    function dismissAllTooltips() {
      if (_dismissRafPending) return
      _dismissRafPending = true
      requestAnimationFrame(() => {
        _dismissRafPending = false
        if (emoteTooltip?.classList.contains('visible')) {
          hideEmoteTooltip()
          document.querySelectorAll('.hs-emote-highlight').forEach(w => w.classList.remove('hs-emote-highlight'))
        }
        hideBadgeTooltip()
        // Skip link tooltip — mouse is still on the link, scroll-driven hides
        // would race with the og fetch and leave the user with nothing.
        if (linkTooltip?.classList.contains('visible') && !_linkHoverUrl) hideLinkTooltip()
        if (userTooltip?.classList.contains('visible')) hideUserTooltip()
      })
    }
    cleanup.addEventListener(document, 'wheel', dismissAllTooltips, { passive: true })
    // scroll doesn't bubble — capture phase catches scroll on any child container
    document.addEventListener('scroll', dismissAllTooltips, { capture: true, passive: true, signal: mcSignal })

    let _tooltipRafPending = false
    cleanup.addEventListener(document, 'mousemove', (e) => {
      // RAF-batch tooltip position updates to avoid per-mousemove style writes
      if (_tooltipRafPending) return
      _tooltipRafPending = true
      const target = e.target
      requestAnimationFrame(() => {
        _tooltipRafPending = false
        const onEmote = target?.closest?.('.hs-mc-emote-wrapper') ||
          (target?.tagName === 'IMG' && (target.classList?.contains('hs-mc-emote') || target.classList?.contains('hs-mc-picker-emote')))
        const onUser = target?.closest?.('.hs-mc-user')
        const onBadge = target?.tagName === 'IMG' && target.classList?.contains('hs-mc-badge-img')

        // Kill badge tooltip if not on a badge
        if (badgeTooltip?.classList.contains('visible') && !onBadge) {
          hideBadgeTooltip()
        }

        // Kill emote tooltip instantly if not on an emote
        if (emoteTooltip?.classList.contains('visible')) {
          if (!onEmote) {
            hideEmoteTooltip()
            document.querySelectorAll('.hs-emote-highlight').forEach(w => w.classList.remove('hs-emote-highlight'))
          }
          // Don't reposition — stays anchored to element
        }

        // Kill user tooltip instantly if not on a username
        if (userTooltip?.classList.contains('visible')) {
          if (!onUser && !target?.closest?.('#hs-user-tooltip')) {
            hideUserTooltip()
          }
          // Don't reposition — stays anchored to element like website
        }

        // Kill link tooltip if not on a link
        const onLink = target?.closest?.('.hs-mc-link')
        if (linkTooltip?.classList.contains('visible')) {
          if (!onLink) {
            hideLinkTooltip()
          }
          // Don't reposition — stays anchored to element
        }
      })
    }, 'mc-tooltip-mousemove');
  }

  // Sub tenure tracking — populated from IRC badge-info (subscriber/N = cumulative months)
  const subTenureMap = new Map() // channel -> Map<usernameLC, months>
  function trackSubTenure(channel, username, months) {
    if (!channel || !username || !months) return
    let channelMap = subTenureMap.get(channel)
    if (!channelMap) {
      channelMap = new Map()
      subTenureMap.set(channel, channelMap)
    }
    channelMap.set(username.toLowerCase(), months)
    while (channelMap.size > 500) channelMap.delete(channelMap.keys().next().value)
  }
  function formatSubTenure(months) {
    // Concise: drop months when years resolve. Matches content.js + formatAge.
    if (months >= 12) return `${Math.floor(months / 12)}y`
    return `${months}mo`
  }

  // User hover tooltip (profile preview)
  let userTooltip = null;
  const _profileCache = new Map(); // platform:username -> { profile, ts }
  const PROFILE_CACHE_TTL = 60000; // 60s
  let _profileGen = 0; // generation counter to prevent stale renders

  // Centralized cross-platform identity resolver. ALL identity lookups should go
  // through this. Wraps _profileCache + /api/profile, returns a unified shape.
  // Used by: pcAddAsChannel, renderAddChannelForm autofill, auto-multichat banner,
  // any future awareness feature.
  function shapeIdentity(profile) {
    if (!profile) return { ok: false };
    const identity = {
      heatsync: profile.username || null,
      twitch: profile.twitch_username || null,
      kick: profile.kick_username || null,
      youtube: profile.youtube_username || profile.youtube_channel_id || null,
    };
    const linked = [identity.twitch, identity.kick, identity.youtube].filter(Boolean);
    const liveOn = [];
    if (profile.twitch_is_live) liveOn.push('twitch');
    if (profile.kick_is_live) liveOn.push('kick');
    return {
      ok: true,
      profile,
      identity,
      linkedCount: linked.length,
      isLinked: linked.length >= 2,
      liveOn,
    };
  }

  async function resolveIdentity(name, opts = {}) {
    if (!name) return { ok: false, error: 'no name' };
    const platform = opts.platform || null;
    const cacheKey = `${platform || 'unknown'}:${String(name).toLowerCase()}`;
    if (!opts.bust) {
      const cached = _profileCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
        return shapeIdentity(cached.profile);
      }
    }
    try {
      const platParam = platform ? `?platform=${encodeURIComponent(platform)}` : '';
      const resp = await apiFetch(`/api/profile/${encodeURIComponent(name)}${platParam}`);
      if (!resp?.ok || !resp.data?.profile) {
        return { ok: false, error: resp?.error || 'not found', notFound: true };
      }
      const profile = resp.data.profile;
      _profileCache.set(cacheKey, { profile, ts: Date.now() });
      if (_profileCache.size > 100) {
        const oldest = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) _profileCache.delete(k);
      }
      return shapeIdentity(profile);
    } catch (e) {
      return { ok: false, error: e.message || 'fetch failed' };
    }
  }

  let _userTooltipTarget = null;
  let _userTooltipResizeObs = null;

  function ensureUserTooltip() {
    if (!userTooltip || !document.contains(userTooltip)) {
      userTooltip = document.createElement('div');
      userTooltip.id = 'hs-user-tooltip';
      document.body.appendChild(cleanup.trackNode(userTooltip));
      // Keep tooltip away from the hovered username even as content fills in async
      // (followage badge, sub tenure badge, lazy-loaded data — all change height)
      if (typeof ResizeObserver !== 'undefined') {
        _userTooltipResizeObs = new ResizeObserver(() => {
          if (_userTooltipTarget && userTooltip.classList.contains('visible') && document.contains(_userTooltipTarget)) {
            positionTooltipAtElement(userTooltip, _userTooltipTarget);
          }
        });
        cleanup.trackObserver(_userTooltipResizeObs);
        _userTooltipResizeObs.observe(userTooltip);
      }
    }
    return userTooltip;
  }

  function getHeatColor() {
    return '#ff8700';
  }

  function formatCompact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function getAccountAge(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    const y = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    const days = now.getDate() - d.getDate();
    if (y > 0) return y + 'y';
    if (m > 0) return m + 'm';
    return Math.max(0, days) + 'd';
  }

  function getCompactRelTime(dateStr) {
    if (!dateStr) return '';
    const ms = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(ms / 86400000);
    if (d > 365) return Math.floor(d / 365) + 'y ago';
    if (d > 30) return Math.floor(d / 30) + 'mo ago';
    if (d > 0) return d + 'd ago';
    const h = Math.floor(ms / 3600000);
    if (h > 0) return h + 'h ago';
    return 'just now';
  }

  function renderProfileCard(p) {
    const pfp = p.twitch_profile_pic || p.kick_profile_pic || p.profile_image_url || 'https://heatsync.org/anon.webp';
    const displayName = p.display_name || p.username || 'unknown';

    // Platform badges
    let platforms = '';
    if (p.twitch_username) {
      let ttv = `<span class="hs-pc-platform twitch">ttv:${escapeHtml(p.twitch_username)}</span>`;
      if (p.twitch_verified) ttv += ' <span class="hs-pc-verified" title="Twitch Verified"><svg viewBox="0 0 16 16" fill="none" width="12" height="12" style="vertical-align:middle"><path d="M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z" fill="#9146ff"/><path d="M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z" fill="#fff"/></svg></span>';
      if (p.twitch_is_live) {
        const vc = Number(p.twitch_viewer_count) || 0;
        ttv += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + escapeHtml(formatCompact(vc)) : ''}</span>`;
      }
      platforms += ttv;
    }
    if (p.kick_username) {
      let kk = `<span class="hs-pc-platform kick">kick:${escapeHtml(p.kick_username)}</span>`;
      if (p.kick_verified) kk += ' <span class="hs-pc-verified" title="Kick Verified"><svg viewBox="0 0 16 16" fill="none" width="12" height="12" style="vertical-align:middle"><path d="M14.54 6.29L13.09 4.63l.26-2.17-2.13-.49L10.09.24 8 1.14 5.91.24 4.78 1.97l-2.13.49.26 2.17L1.46 6.29 2.72 8 1.46 9.71l1.45 1.66-.26 2.17 2.13.49L5.91 15.76 8 14.86l2.09.9 1.13-1.73 2.13-.49-.26-2.17 1.45-1.66L13.28 8l1.26-1.71z" fill="#53fc18"/><path d="M6.5 11.17L3.83 8.5l1.18-1.17L6.5 8.83l4.49-4.5L12.17 5.5 6.5 11.17z" fill="#000"/></svg></span>';
      if (p.kick_is_live) {
        const vc = Number(p.kick_viewer_count) || 0;
        kk += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + escapeHtml(formatCompact(vc)) : ''}</span>`;
      }
      platforms += kk;
    }
    if (!platforms) {
      platforms = `<span class="hs-pc-name">${escapeHtml(displayName)}</span>`;
    }

    // Role badge
    let role = '';
    const bt = p.twitch_broadcaster_type;
    if (bt === 'partner') role = '<span class="hs-pc-role partner">partner</span>';
    else if (bt === 'affiliate') role = '<span class="hs-pc-role affiliate">affiliate</span>';
    else if (p.role === 'admin') role = '<span class="hs-pc-role admin">admin</span>';
    else if (p.role === 'staff') role = '<span class="hs-pc-role staff">staff</span>';

    // Account age
    const dates = [p.twitch_created_at, p.kick_created_at].filter(Boolean);
    const oldest = dates.length ? dates.reduce((a, b) => new Date(b) < new Date(a) ? b : a) : null;
    const age = getAccountAge(oldest);
    const ageHtml = age ? `<span class="hs-pc-age">${age}</span>` : '';

    // Bio with @mention/#tag autolinks
    const bioHtml = p.bio ? String(p.bio).split(/(@[A-Za-z0-9_]{3,25}|#[A-Za-z0-9]{1,30})/g).map(s => {
      if (!s) return '';
      if (s[0] === '@' && s.length >= 4) return `<span class="hs-mc-user hs-pc-bio-mention" data-username="${escapeHtml(s.slice(1))}">@${escapeHtml(s.slice(1))}</span>`;
      if (s[0] === '#' && s.length >= 2) return `<a class="hs-pc-bio-tag" href="https://heatsync.org/tags/${encodeURIComponent(s.slice(1).toLowerCase())}" target="_blank" rel="noopener noreferrer">#${escapeHtml(s.slice(1))}</a>`;
      return escapeHtml(s);
    }).join('') : '';
    const bio = bioHtml ? `<div class="hs-pc-bio">${bioHtml}</div>` : '';

    // Stats
    const stats = p.stats || {};
    const heat = stats.total_heat || 0;
    const op = stats.op_count || p.opCount || 0;
    const mop = stats.mop_count || p.mopCount || 0;
    const re = stats.re_count || p.reCount || 0;
    const followers = Math.max(stats.followers || 0, p.twitch_followers || 0, p.kick_followers || 0);

    const statBadges = [];
    const heatHtml = heatSpanHtml(heat);
    if (heatHtml) statBadges.push(`<span class="hs-pc-stat hs-pc-stat-heat">${heatHtml}</span>`);
    if (op > 0) statBadges.push(`<span class="hs-pc-stat op"><span class="hs-pc-num">${formatCompact(op)}</span>[OP]</span>`);
    if (mop > 0) statBadges.push(`<span class="hs-pc-stat mop"><span class="hs-pc-num">${formatCompact(mop)}</span>[OP]</span>`);
    if (re > 0) statBadges.push(`<span class="hs-pc-stat re"><span class="hs-pc-num">${formatCompact(re)}</span>[RE]</span>`);
    if (followers > 0) statBadges.push(`<span class="hs-pc-stat hs-pc-stat-followers">${t('mc_tip_followers', [formatCompact(followers)])}</span>`);

    // Relationship — covers all four angles across Twitch and Kick.
    // Timestamps: platform-verified only (Twitch helix followed_at / sub started_at,
    // Kick equivalents). Heatsync's own DB carries created_at sync timestamps that
    // do NOT reflect the actual platform relationship date — they read as the
    // signup/sync date for every profile (e.g. "5mo" everywhere) and lie about
    // multi-year Twitch follows. Show bare label when no platform date exists.
    const rel = p.relationship || {};
    const relBadges = [];
    // They → you (follow) — platform-verified flag only; heatsync DB rows can
    // be stale and don't reflect actual Twitch/Kick state for arbitrary streamers.
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick;
    if (followsYou) {
      const since = rel.profileFollowsViewerOnTwitchSince || rel.profileFollowsViewerOnKickSince;
      const ageStr = since ? ' ' + getCompactRelTime(since).replace(' ago', '') : '';
      relBadges.push(`<span class="hs-pc-rel-badge mutual">follows you${ageStr}</span>`);
    }
    // They → you (sub) — platform-verified flag only
    const subsYou = rel.profileSubbedToViewerOnTwitch || rel.profileSubbedToViewerOnKick;
    if (subsYou) {
      const since = rel.profileTwitchSubSince || rel.profileKickSubSince;
      const rawTier = rel.profileTwitchSubTier || rel.profileKickSubTier;
      const tierNum = typeof rawTier === 'string' ? Math.round(Number(rawTier) / 1000) : rawTier;
      const tierStr = tierNum && tierNum > 1 ? ' T' + tierNum : '';
      const ageStr = since ? ' ' + getCompactRelTime(since).replace(' ago', '') : '';
      relBadges.push(`<span class="hs-pc-rel-badge supporter">subs to you${tierStr}${ageStr}</span>`);
    }
    // You → them (follow) — ?? respects explicit false from canonical youFollow
    const youFollow = rel.youFollow ?? rel.isFollowing ?? rel.followsOnTwitch ?? rel.followsOnKick;
    if (youFollow) {
      const since = rel.followsOnTwitchSince || rel.followsOnKickSince;
      const ageStr = since ? ' ' + getCompactRelTime(since).replace(' ago', '') : '';
      relBadges.push(`<span class="hs-pc-rel-badge following">you follow${ageStr}</span>`);
    }
    // You → them (sub) — normalize tier
    const youSub = rel.youSub ?? rel.isSubscribed ?? rel.subscribedOnTwitch ?? rel.subscribedOnKick;
    if (youSub) {
      const rawTier = rel.twitchSubTier || rel.kickSubTier || rel.subTier;
      const tierNum = typeof rawTier === 'string' ? Math.round(Number(rawTier) / 1000) : rawTier;
      const tier = tierNum || 1;
      const since = rel.twitchSubSince || rel.kickSubSince;
      const ageStr = since ? ' ' + getCompactRelTime(since).replace(' ago', '') : '';
      relBadges.push(`<span class="hs-pc-rel-badge subbed">you sub${tier > 1 ? ' T' + tier : ''}${ageStr}</span>`);
    }
    // Mutual indicators when both directions present
    if (followsYou && youFollow) {
      relBadges.push(`<span class="hs-pc-rel-badge mutual-follow">mutual</span>`);
    }
    if (subsYou && youSub) {
      relBadges.push(`<span class="hs-pc-rel-badge mutual-sub">mutual sub</span>`);
    }

    return `
      ${pfp ? `<img class="hs-pc-avatar" src="${escapeHtml(pfp)}" alt="${escapeHtml(displayName)}">` : ''}
      <div class="hs-pc-info">
        <div class="hs-pc-header">${platforms} ${role} ${ageHtml}</div>
        ${bio}
        ${statBadges.length ? `<div class="hs-pc-stats">${statBadges.join('')}</div>` : ''}
        ${relBadges.length ? `<div class="hs-pc-rel">${relBadges.join(' ')}</div>` : ''}
      </div>`;
  }

  // Determine Twitch channel context for followage lookups
  // userPlatform: the platform of the user being looked up (from data-platform)
  function getTooltipChannelContext(userPlatform) {
    // If looking up a Twitch user, always resolve to the Twitch channel name
    const wantTwitch = !userPlatform || userPlatform === 'twitch'
    // Live tab → current channel from URL or override
    if (currentTab === 'live') {
      if (wantTwitch && location.hostname.includes('kick.com')) {
        // On Kick live tab but need Twitch channel — find from config
        const liveCh = getLiveChannel()
        const ch = config.channels.find(c => c.kick === liveCh || c.id === liveCh)
        if (ch && ch.twitch) return ch.twitch
      }
      return getLiveChannel()
    }
    // Channel tab → look up from config
    const ch = config.channels.find(c => c.id === currentTab)
    if (ch) {
      // For Twitch users, always return Twitch channel; for Kick users, Kick channel
      if (wantTwitch) return ch.twitch || ch.kick
      return ch.kick || ch.twitch
    }
    return getLiveChannel()
  }

  // NOTE: innerHTML usage is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
  // (escapeHtml converts &, <, >, ", ' to HTML entities before any innerHTML assignment)
  async function showUserTooltip(targetEl, username, color, platform) {
    const tooltip = ensureUserTooltip();
    // Re-append to body so DOM order tiebreaks above other max-int siblings
    // (reply-stack overlay sits at the same z-index).
    document.body.appendChild(cleanup.trackNode(tooltip));
    const gen = ++_profileGen;
    _userTooltipTarget = targetEl;

    // Get channel from the message element for sub tenure lookup
    const msgChannel = targetEl.closest?.('.hs-mc-msg')?.dataset?.msgChannel

    // Show loading state immediately (username is escaped via escapeHtml)
    tooltip.innerHTML = `<div class="hs-pc-loading" style="color:${color || '#fff'}">${escapeHtml(username)}...</div>`;
    tooltip.classList.add('visible');
    positionTooltipAtElement(tooltip, targetEl);

    // Check cache (keyed by platform:username to avoid cross-platform collisions)
    const cacheKey = `${platform || 'unknown'}:${username.toLowerCase()}`
    const cached = _profileCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
      if (gen !== _profileGen) return;
      // NOTE: innerHTML is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
      tooltip.innerHTML = renderProfileCard(cached.profile);
      appendSubTenureBadge(tooltip, username, msgChannel);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen, platform);
      return;
    }

    // Fetch profile — pass platform so server can disambiguate same-name users across platforms
    const platParam = platform ? `?platform=${encodeURIComponent(platform)}` : ''
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}${platParam}`);
    if (gen !== _profileGen) return; // user moved away

    if (resp?.ok && resp.data?.profile) {
      const profile = resp.data.profile;
      _profileCache.set(cacheKey, { profile, ts: Date.now() });
      // Prune cache
      if (_profileCache.size > 100) {
        const oldest = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) _profileCache.delete(k);
      }
      // NOTE: innerHTML is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
      tooltip.innerHTML = renderProfileCard(profile);
      appendSubTenureBadge(tooltip, username, msgChannel);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen, platform);
    } else {
      // Fallback — show basic info (username sanitized via escapeHtml)
      tooltip.innerHTML = `<div class="hs-pc-info"><div class="hs-pc-header"><span class="hs-pc-name">${escapeHtml(username)}</span></div></div>`;
      appendSubTenureBadge(tooltip, username, msgChannel);
      fetchAndShowFollowage(tooltip, username, gen, platform);
    }
  }

  // Append sub tenure badge from local IRC data (sync, no fetch)
  function appendSubTenureBadge(tooltip, username, msgChannel) {
    // Try message's channel first, fall back to tooltip channel context
    const channelLogin = msgChannel || getTooltipChannelContext()
    if (!channelLogin) return
    const channelMap = subTenureMap.get(channelLogin)
    if (!channelMap) return
    const months = channelMap.get(username.toLowerCase())
    if (!months) return
    const header = tooltip.querySelector('.hs-pc-header')
    if (!header) return
    const badge = document.createElement('span')
    badge.className = 'hs-pc-sub-tenure'
    // When the channel context is the viewer themselves, "subbed mellen 5y" reads
    // confusingly self-referential — phrase it as "subbed to you" instead.
    const isSelfChannel = (typeof currentUsername === 'string' && currentUsername) &&
      channelLogin.toLowerCase() === currentUsername.toLowerCase()
    badge.textContent = isSelfChannel
      ? `subbed to you ${formatSubTenure(months)}`
      : t('mc_tip_subbed', [channelLogin, formatSubTenure(months)])
    header.appendChild(badge)
  }

  // Async followage fetch — appends to tooltip after profile renders (DOM methods, no innerHTML)
  async function fetchAndShowFollowage(tooltip, username, gen, userPlatform) {
    // Only show followage for Twitch users (followage API is Twitch-only)
    if (userPlatform && userPlatform !== 'twitch') return
    const channelLogin = getTooltipChannelContext(userPlatform)
    if (!channelLogin) return
    if (typeof lookupFollowage !== 'function') return
    const result = await lookupFollowage(username, channelLogin)
    if (gen !== _profileGen || !result) return
    const header = tooltip.querySelector('.hs-pc-header')
    if (!header) return
    // When the channel context IS the viewer (e.g. you're hovering a chatter
    // in your own channel tab), the followage badges duplicate the heatsync
    // rel-badges ("follows you" / nothing). Skip the literal Twitch-followage
    // badge entirely — the rel-badge is the single source of truth for the
    // "they → you" direction. Still process channelFollowedAt below for the
    // "you follow Xy" age-correction path.
    const isSelfChannel = (typeof currentUsername === 'string' && currentUsername) &&
      channelLogin.toLowerCase() === currentUsername.toLowerCase()
    const existing = header.querySelector('.hs-pc-followage')
    if (existing) existing.remove()
    if (!isSelfChannel) {
      const badge = document.createElement('span')
      if (result.followedAt) {
        badge.className = 'hs-pc-followage'
        const age = getCompactRelTime(result.followedAt).replace(' ago', '')
        badge.textContent = t('mc_tip_following', [channelLogin, age])
      } else {
        badge.className = 'hs-pc-followage hs-pc-nofollow'
        badge.textContent = t('mc_tip_not_following', [channelLogin])
      }
      header.appendChild(badge)
    }
    // "followed by {channel}" badge — streamer follows this user.
    // Skip when channel === viewer; the rel-badge already says "you follow".
    if (result.channelFollowedAt && !isSelfChannel) {
      const cfBadge = document.createElement('span')
      cfBadge.className = 'hs-pc-channel-follows'
      cfBadge.textContent = t('mc_tip_followed_by', [channelLogin])
      header.appendChild(cfBadge)
    }
    // When channel === viewer, channelFollowedAt is the viewer's authoritative
    // Twitch follow date. Use it to fill in (or override) the rel-badge time.
    if (isSelfChannel && result.channelFollowedAt) {
      const relRow = tooltip.querySelector('.hs-pc-rel')
      const youFollowBadge = relRow?.querySelector('.hs-pc-rel-badge.following')
      const ageStr = ' ' + getCompactRelTime(result.channelFollowedAt).replace(' ago', '')
      if (youFollowBadge) {
        youFollowBadge.textContent = `you follow${ageStr}`
      } else if (relRow) {
        const b = document.createElement('span')
        b.className = 'hs-pc-rel-badge following'
        b.textContent = `you follow${ageStr}`
        relRow.appendChild(b)
      }
    }
    // Update follower count from live data
    const statsEl = tooltip.querySelector('.hs-pc-stats')
    if (statsEl && result.followerCount != null) {
      // Update followers with live data
      const followerStat = statsEl.querySelector('.hs-pc-stat-followers')
      if (followerStat) {
        followerStat.textContent = t('mc_tip_followers', [formatCompact(result.followerCount)])
      } else {
        const el = document.createElement('span')
        el.className = 'hs-pc-stat hs-pc-stat-followers'
        el.textContent = t('mc_tip_followers', [formatCompact(result.followerCount)])
        statsEl.appendChild(el)
      }
    }
  }

  function positionTooltipAtElement(tooltip, targetEl) {
    const elRect = targetEl.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;       // visible separation so the hovered username is never touched
    const margin = 5;    // viewport edge margin

    const spaceTop = elRect.top - margin;
    const spaceBottom = vh - elRect.bottom - margin;
    const spaceLeft = elRect.left - margin;
    const spaceRight = vw - elRect.right - margin;
    const needV = tipRect.height + gap;
    const needH = tipRect.width + gap;

    let x, y, side;
    if (spaceTop >= needV) {
      side = 'top';
      y = elRect.top - tipRect.height - gap;
      x = elRect.left + elRect.width / 2 - tipRect.width / 2;
    } else if (spaceBottom >= needV) {
      side = 'bottom';
      y = elRect.bottom + gap;
      x = elRect.left + elRect.width / 2 - tipRect.width / 2;
    } else if (spaceRight >= needH) {
      side = 'right';
      x = elRect.right + gap;
      y = elRect.top + elRect.height / 2 - tipRect.height / 2;
    } else if (spaceLeft >= needH) {
      side = 'left';
      x = elRect.left - tipRect.width - gap;
      y = elRect.top + elRect.height / 2 - tipRect.height / 2;
    } else {
      // No side has full room — pick the largest and clamp; still nudge off the element
      const maxV = Math.max(spaceTop, spaceBottom);
      const maxH = Math.max(spaceLeft, spaceRight);
      if (maxV >= maxH) {
        side = spaceTop >= spaceBottom ? 'top' : 'bottom';
        y = side === 'top' ? margin : elRect.bottom + gap;
        x = elRect.left + elRect.width / 2 - tipRect.width / 2;
      } else {
        side = spaceRight >= spaceLeft ? 'right' : 'left';
        x = side === 'right' ? elRect.right + gap : Math.max(margin, elRect.left - tipRect.width - gap);
        y = elRect.top + elRect.height / 2 - tipRect.height / 2;
      }
    }

    // Clamp to viewport — but on the "long" axis only, so we don't push the tip back over the element
    if (side === 'top' || side === 'bottom') {
      x = Math.max(margin, Math.min(x, vw - tipRect.width - margin));
    } else {
      y = Math.max(margin, Math.min(y, vh - tipRect.height - margin));
    }

    tooltip.style.left = Math.round(x) + 'px';
    tooltip.style.top = Math.round(y) + 'px';
  }

  function hideUserTooltip() {
    _profileGen++;
    _userTooltipTarget = null;
    if (userTooltip) {
      userTooltip.classList.remove('visible');
    }
  }

  function setupUserTooltipHandlers() {
    if (window._hsUserTooltipSetup) return;
    window._hsUserTooltipSetup = true;

    // 120ms hover-intent debounce: scrolling chat passes the cursor across
    // 10+ usernames in a single scroll-tick. Without debounce every one
    // fires apiFetch immediately. Cache hits already render instantly so
    // those bypass the debounce; only cold lookups wait.
    let _userHoverTimer = null
    let _userHoverTarget = null
    function clearUserHoverTimer() {
      if (_userHoverTimer) { clearTimeout(_userHoverTimer); _userHoverTimer = null }
      _userHoverTarget = null
    }

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const target = e.target.closest('.hs-mc-user');
      if (target) {
        const username = target.dataset.username || target.textContent.replace(/^@/, '');
        const color = target.style.color;
        const platform = target.dataset.platform || null;
        const cacheKey = `${platform || 'unknown'}:${username.toLowerCase()}`
        const cached = _profileCache.get(cacheKey)
        if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
          // Cache hit: render synchronously, no debounce needed.
          clearUserHoverTimer()
          showUserTooltip(target, username, color, platform);
        } else {
          // Cold lookup: debounce + show skeleton immediately so the user
          // sees acknowledgement of the hover even while the fetch runs.
          clearUserHoverTimer()
          _userHoverTarget = target
          showUserSkeleton(target, username, color)
          _userHoverTimer = setTimeout(() => {
            _userHoverTimer = null
            if (_userHoverTarget !== target || !document.contains(target)) return
            showUserTooltip(target, username, color, platform);
          }, 120)
        }

        // Highlight all matching usernames
        const name = target.dataset.username;
        if (name) {
          const overlay = document.getElementById('hs-mc-overlay');
          if (overlay) {
            overlay.querySelectorAll(`.hs-mc-user[data-username="${CSS.escape(name)}"]`).forEach(el => {
              el.classList.add('hs-user-highlight');
            });
          }
        }
      }
    }, 'mc-user-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const target = e.target.closest('.hs-mc-user');
      if (target) {
        clearUserHoverTimer()
        hideUserTooltip();

        // Remove all username highlights
        const overlay = document.getElementById('hs-mc-overlay');
        if (overlay) {
          overlay.querySelectorAll('.hs-user-highlight').forEach(el => {
            el.classList.remove('hs-user-highlight');
          });
        }
      }
    }, 'mc-user-tooltip-mouseout');
  }

  // Synchronous skeleton — username + color, no fetch. Replaced by full
  // card when the apiFetch resolves (showUserTooltip post-debounce).
  // Uses textContent (no innerHTML) so the username string is never parsed as HTML.
  function showUserSkeleton(targetEl, username, color) {
    const tooltip = ensureUserTooltip();
    document.body.appendChild(cleanup.trackNode(tooltip));
    _userTooltipTarget = targetEl;
    while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
    const loading = document.createElement('div');
    loading.className = 'hs-pc-loading';
    if (color) loading.style.color = color;
    else loading.style.color = '#fff';
    loading.textContent = username + '…';
    tooltip.appendChild(loading);
    tooltip.classList.add('visible');
    positionTooltipAtElement(tooltip, targetEl);
  }

  // Link preview tooltip (Chatterino-style)
  let linkTooltip = null;
  const _linkPreviewCache = new Map(); // url -> { title, description, image } | null
  let _linkHoverUrl = null;
  let _linkFetchInFlight = null;

  function ensureLinkTooltip() {
    if (linkTooltip) return linkTooltip;
    linkTooltip = document.createElement('div');
    linkTooltip.id = 'hs-link-tooltip';
    document.body.appendChild(cleanup.trackNode(linkTooltip));
    return linkTooltip;
  }

  let _linkTargetEl = null;

  function showLinkTooltip(e, url) {
    if (!linksEnabled || !linkPreviewsEnabled || !url) return;
    _linkHoverUrl = url;
    _linkTargetEl = e.target.closest('.hs-mc-link') || e.target;
    const tip = ensureLinkTooltip();
    document.body.appendChild(cleanup.trackNode(tip));
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    // Show loading state immediately
    const loadWrap = document.createElement('div');
    loadWrap.className = 'link-text';
    const loadSpan = document.createElement('span');
    loadSpan.className = 'link-loading';
    loadSpan.textContent = t('common_loading');
    const domainSpan = document.createElement('span');
    domainSpan.className = 'link-domain';
    domainSpan.textContent = hostname;
    loadWrap.appendChild(loadSpan);
    loadWrap.appendChild(domainSpan);
    tip.replaceChildren(loadWrap);
    tip.classList.add('visible');
    positionTooltipAtElement(tip, _linkTargetEl);

    // Check cache
    if (_linkPreviewCache.has(url)) {
      const cached = _linkPreviewCache.get(url);
      if (_linkHoverUrl === url) renderLinkPreview(tip, cached, url);
      return;
    }

    // Fetch from background
    _linkFetchInFlight = url
    safeSendMessage({ type: 'fetch_link_preview', url }).then(data => {
      _linkPreviewCache.set(url, data);
      while (_linkPreviewCache.size > 500) _linkPreviewCache.delete(_linkPreviewCache.keys().next().value);
      if (_linkFetchInFlight === url) _linkFetchInFlight = null
      if (_linkHoverUrl === url && tip.classList.contains('visible')) {
        renderLinkPreview(tip, data, url);
      }
    });
  }

  // Background-prefetch link preview without showing the tooltip — fired on
  // mousedown (click-intent) so the og fetch lands before the user releases.
  // No-op when cache already has it. Used by mousedown handler in setupLinkTooltipHandlers.
  function prefetchLinkPreview(url) {
    if (!url || _linkPreviewCache.has(url)) return;
    safeSendMessage({ type: 'fetch_link_preview', url }).then(data => {
      _linkPreviewCache.set(url, data);
      while (_linkPreviewCache.size > 500) _linkPreviewCache.delete(_linkPreviewCache.keys().next().value);
    }).catch(() => {});
  }

  function renderLinkPreview(tip, data, url) {
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { hostname = url; }
    tip.replaceChildren(); // clear
    let hasContent = false;
    const textWrap = document.createElement('div');
    textWrap.className = 'link-text';
    if (data) {
      if (data.image && /^https?:\/\//i.test(data.image)) {
        const img = document.createElement('img');
        img.src = data.image;
        img.alt = '';
        img.loading = 'lazy';
        tip.appendChild(img);
        hasContent = true;
      }
      if (data.title) {
        const t = document.createElement('span');
        t.className = 'link-title';
        t.textContent = data.title;
        textWrap.appendChild(t);
        hasContent = true;
      }
      if (data.description) {
        const d = document.createElement('span');
        d.className = 'link-desc';
        d.textContent = data.description;
        textWrap.appendChild(d);
        hasContent = true;
      }
    }
    // If no og data at all, show full URL instead of just domain
    const dom = document.createElement('span');
    dom.className = 'link-domain';
    dom.textContent = hasContent ? hostname : url;
    textWrap.appendChild(dom);
    tip.appendChild(textWrap);
    // Reposition after content changed size
    if (_linkTargetEl) positionTooltipAtElement(tip, _linkTargetEl);
  }

  function hideLinkTooltip() {
    _linkHoverUrl = null;
    if (linkTooltip) linkTooltip.classList.remove('visible');
  }

  let _linkHideTimer = null;
  function cancelLinkHide() {
    if (_linkHideTimer) { clearTimeout(_linkHideTimer); _linkHideTimer = null; }
  }
  function scheduleLinkHide(delay = 250) {
    cancelLinkHide();
    // If a fetch is in flight, wait for it so the user gets to see the result
    // even if chat scroll dragged the link out from under their cursor.
    const wait = _linkFetchInFlight ? Math.max(delay, 1500) : delay;
    _linkHideTimer = setTimeout(() => { _linkHideTimer = null; hideLinkTooltip(); }, wait);
  }

  function setupLinkTooltipHandlers() {
    if (window._hsLinkTooltipSetup) return;
    window._hsLinkTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const link = e.target.closest('.hs-mc-link');
      if (link) { cancelLinkHide(); showLinkTooltip(e, link.href); return; }
      // Hovering the tooltip itself keeps it open (lets user read/click image).
      if (e.target.closest?.('#hs-link-tooltip')) cancelLinkHide();
    }, 'mc-link-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const link = e.target.closest('.hs-mc-link');
      if (link) scheduleLinkHide();
      else if (e.target.closest?.('#hs-link-tooltip')) scheduleLinkHide();
    }, 'mc-link-tooltip-mouseout');

    // Click-intent prefetch: mousedown fires ~150ms before click. Warm the
    // og cache so users who click without hovering long enough don't wait.
    cleanup.addEventListener(document, 'mousedown', (e) => {
      const link = e.target.closest?.('.hs-mc-link')
      if (link?.href) prefetchLinkPreview(link.href)
    }, 'mc-link-prefetch-mousedown');
  }
