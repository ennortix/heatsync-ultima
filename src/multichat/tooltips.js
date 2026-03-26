// Tooltips - toast, emote tooltip, user profile card, link preview
// Note: all innerHTML usage passes content through escapeHtml() first (see src/lib/utils.js)

  function showToast(msg) {
    const existing = document.getElementById('hs-mc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'hs-mc-toast';
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      bottom: 70px;
      right: 20px;
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      padding: 6px 14px;
      border-radius: 0;
      font: bold 12px monospace;
      z-index: 5000;
      pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1500);
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
      document.body.appendChild(emoteTooltip);
    }
    return emoteTooltip;
  }

  function showEmoteTooltip(e, emoteName, emoteUrl, state, source, hoveredImg) {
    const tooltip = ensureEmoteTooltip();
    const img = tooltip.querySelector('img');
    const nameEl = tooltip.querySelector('.tooltip-name');
    const stateEl = tooltip.querySelector('.tooltip-source');

    // Show 1x immediately (no stale image), upgrade to hi-res in background
    const w4 = (hoveredImg?.offsetWidth || 28) * 4;
    const h4 = (hoveredImg?.offsetHeight || 28) * 4;
    img.style.width = w4 + 'px';
    img.style.height = h4 + 'px';
    img.src = emoteUrl;
    img.alt = emoteName;
    // Try loading hi-res - swap in if it works, keep 1x if it fails
    const hiResUrl = getHighResUrl(emoteUrl);
    if (hiResUrl !== emoteUrl) {
      const hiRes = new Image();
      hiRes.onload = () => { if (img.alt === emoteName) img.src = hiResUrl; };
      hiRes.src = hiResUrl;
    }
    nameEl.textContent = emoteName;

    // Show state with source for globals
    let label;
    if (state === 'owned') {
      label = 'in your set';
    } else if (state === 'unadded') {
      label = 'click to add';
    } else if (state === 'blocked') {
      label = 'blocked (click to unblock)';
    } else {
      // Global or channel - show source
      const sourceLabels = {
        '7tv': '7TV',
        'bttv': 'BTTV',
        'ffz': 'FFZ',
        'twitch': 'Twitch',
        'kick': 'Kick',
        'heatsync': 'Heatsync'
      };
      const sourceName = sourceLabels[source] || source || 'unknown';
      const scope = state === 'channel' ? 'channel' : 'global';
      label = `${scope} (${sourceName})`;
    }
    stateEl.textContent = label;
    stateEl.className = 'tooltip-source ' + (state || 'global');

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

    stateEl.textContent = 'emoji'
    stateEl.className = 'tooltip-source'

    tooltip.style.left = '-9999px'
    tooltip.style.top = '-9999px'
    tooltip.classList.add('visible')
    positionTooltipAtElement(tooltip, targetEl)
    requestAnimationFrame(() => positionTooltipAtElement(tooltip, targetEl))
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

      showEmoteTooltip(e, emoteName, emoteUrl, state, source, img);

      // Cross-highlight: add highlight to all wrappers with same emote name
      queryEmoteWrappers(emoteName).forEach(w => {
        w.classList.add('hs-emote-highlight');
      });
    }, 'mc-emote-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const target = e.target;
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

  // User hover tooltip (profile preview)
  let userTooltip = null;
  const _profileCache = new Map(); // username -> { profile, ts }
  const PROFILE_CACHE_TTL = 60000; // 60s
  let _profileGen = 0; // generation counter to prevent stale renders

  function ensureUserTooltip() {
    if (!userTooltip || !document.contains(userTooltip)) {
      userTooltip = document.createElement('div');
      userTooltip.id = 'hs-user-tooltip';
      document.body.appendChild(userTooltip);
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
      if (p.twitch_verified) ttv += ' ✓';
      if (p.twitch_is_live) {
        const vc = p.twitch_viewer_count || 0;
        ttv += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + formatCompact(vc) : ''}</span>`;
      }
      platforms += ttv;
    }
    if (p.kick_username) {
      let kk = `<span class="hs-pc-platform kick">kick:${escapeHtml(p.kick_username)}</span>`;
      if (p.kick_verified) kk += ' ✓';
      if (p.kick_is_live) {
        const vc = p.kick_viewer_count || 0;
        kk += ` <span style="color:#f00">🔴${vc > 0 ? ' ' + formatCompact(vc) : ''}</span>`;
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

    // Bio
    const bio = p.bio ? `<div class="hs-pc-bio">${escapeHtml(p.bio)}</div>` : '';

    // Stats
    const stats = p.stats || {};
    const heat = stats.total_heat || 0;
    const op = stats.op_count || p.opCount || 0;
    const mop = stats.mop_count || p.mopCount || 0;
    const re = stats.re_count || p.reCount || 0;
    const followers = Math.max(stats.followers || 0, p.twitch_followers || 0, p.kick_followers || 0);
    const following = Math.max(stats.following || 0, p.twitch_following_count || 0, p.kick_following_count || 0);

    const statBadges = [];
    const hd = getHeatDisplay(heat)
    const heatColor = hd ? hd.color : '#808080'
    const heatEmoji = hd ? hd.emoji : ''
    const heatGlow = hd?.glow ? ';text-shadow:0 0 6px rgba(255,135,0,0.8)' : ''
    statBadges.push(`<span class="hs-pc-stat heat" style="color:${heatColor};border-color:${heatColor};font-weight:700${heatGlow}">${heatEmoji}<span class="hs-pc-num">${formatCompact(heat)}</span>°</span>`);
    if (op > 0) statBadges.push(`<span class="hs-pc-stat op"><span class="hs-pc-num">${formatCompact(op)}</span> [OP]</span>`);
    if (mop > 0) statBadges.push(`<span class="hs-pc-stat mop"><span class="hs-pc-num">${formatCompact(mop)}</span> <span style="color:#ff00ff">[OP]</span></span>`);
    if (re > 0) statBadges.push(`<span class="hs-pc-stat re"><span class="hs-pc-num">${formatCompact(re)}</span> [RE]</span>`);
    if (followers > 0) statBadges.push(`<span class="hs-pc-stat"><span class="hs-pc-num">${formatCompact(followers)}</span> followers</span>`);
    if (following > 0) statBadges.push(`<span class="hs-pc-stat">following <span class="hs-pc-num">${formatCompact(following)}</span></span>`);

    // Relationship
    const rel = p.relationship || {};
    const relBadges = [];
    const followsYou = rel.profileFollowsViewerOnTwitch || rel.profileFollowsViewerOnKick || rel.followsYou;
    if (followsYou) {
      const since = rel.profileFollowsViewerOnTwitchSince || rel.followsYouSince;
      relBadges.push(`<span class="hs-pc-rel-badge mutual">follows you${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    if (rel.profileSubbedToViewerOnTwitch || rel.subscribesToYou) {
      const since = rel.profileTwitchSubSince || rel.subscribesToYouSince;
      relBadges.push(`<span class="hs-pc-rel-badge supporter">subs to you${since ? ' ' + getCompactRelTime(since) : ''}</span>`);
    }
    // Viewer follows profile
    if (rel.isFollowing || rel.followsOnTwitch) {
      const since = rel.followsOnTwitchSince || rel.followedAt;
      relBadges.push(`<span class="hs-pc-rel-badge following">following${since ? ' · ' + getCompactRelTime(since).replace(' ago', '') : ''}</span>`);
    }
    // Viewer subbed to profile
    if (rel.isSubscribed || rel.subscribedOnTwitch) {
      const tier = rel.twitchSubTier || rel.subTier || 1;
      const since = rel.twitchSubSince || rel.subscribedAt;
      relBadges.push(`<span class="hs-pc-rel-badge subbed">you sub${tier > 1 ? ' T' + tier : ''}${since ? ' ' + getCompactRelTime(since) : ''}</span>`);
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
  function getTooltipChannelContext() {
    if (!location.hostname.includes('twitch.tv')) return null
    // Live tab → current channel from URL or override
    if (currentTab === 'live') return getLiveChannel()
    // Channel tab → look up twitch name from config
    const ch = config.channels.find(c => (typeof c === 'string' ? c : c.id) === currentTab)
    if (ch) return typeof ch === 'string' ? ch : ch.twitch
    return getLiveChannel()
  }

  // NOTE: innerHTML usage is XSS-safe — all user content goes through escapeHtml() in renderProfileCard
  // (escapeHtml converts &, <, >, ", ' to HTML entities before any innerHTML assignment)
  async function showUserTooltip(targetEl, username, color) {
    const tooltip = ensureUserTooltip();
    const gen = ++_profileGen;

    // Show loading state immediately (username is escaped via escapeHtml)
    tooltip.innerHTML = `<div class="hs-pc-loading" style="color:${color || '#fff'}">${escapeHtml(username)}...</div>`;
    tooltip.classList.add('visible');
    positionTooltipAtElement(tooltip, targetEl);

    // Check cache
    const cached = _profileCache.get(username.toLowerCase());
    if (cached && Date.now() - cached.ts < PROFILE_CACHE_TTL) {
      if (gen !== _profileGen) return;
      tooltip.innerHTML = renderProfileCard(cached.profile);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen);
      return;
    }

    // Fetch profile
    const resp = await apiFetch(`/api/profile/${encodeURIComponent(username)}`);
    if (gen !== _profileGen) return; // user moved away

    if (resp?.ok && resp.data?.profile) {
      const profile = resp.data.profile;
      _profileCache.set(username.toLowerCase(), { profile, ts: Date.now() });
      // Prune cache
      if (_profileCache.size > 100) {
        const oldest = [..._profileCache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 50);
        for (const [k] of oldest) _profileCache.delete(k);
      }
      tooltip.innerHTML = renderProfileCard(profile);
      positionTooltipAtElement(tooltip, targetEl);
      fetchAndShowFollowage(tooltip, username, gen);
    } else {
      // Fallback — show basic info (username sanitized via escapeHtml)
      tooltip.innerHTML = `<div class="hs-pc-info"><div class="hs-pc-header"><span class="hs-pc-name">${escapeHtml(username)}</span></div></div>`;
      fetchAndShowFollowage(tooltip, username, gen);
    }
  }

  // Async followage fetch — appends to tooltip after profile renders (DOM methods, no innerHTML)
  async function fetchAndShowFollowage(tooltip, username, gen) {
    const channelLogin = getTooltipChannelContext()
    if (!channelLogin) return
    if (typeof lookupFollowage !== 'function') return
    const followedAt = await lookupFollowage(username, channelLogin)
    if (gen !== _profileGen) return
    const header = tooltip.querySelector('.hs-pc-header')
    if (!header) return
    const existing = header.querySelector('.hs-pc-followage')
    if (existing) existing.remove()
    const badge = document.createElement('span')
    if (followedAt) {
      badge.className = 'hs-pc-followage'
      badge.textContent = 'following ' + getCompactRelTime(followedAt).replace(' ago', '')
    } else {
      badge.className = 'hs-pc-followage hs-pc-nofollow'
      badge.textContent = 'not following'
    }
    header.appendChild(badge)
  }

  function positionTooltipAtElement(tooltip, targetEl) {
    // Anchor to element like website hover cards — centered above
    const elRect = targetEl.getBoundingClientRect();
    const tipRect = tooltip.getBoundingClientRect();

    // Position directly above if room, otherwise below (no gap, like website)
    let y;
    if (elRect.top - tipRect.height > 0) {
      y = elRect.top - tipRect.height;
    } else {
      y = elRect.bottom;
    }

    // Center horizontally over element, clamp to viewport
    let x = elRect.left + (elRect.width / 2) - (tipRect.width / 2);
    x = Math.min(x, window.innerWidth - tipRect.width - 10);

    tooltip.style.left = Math.max(5, x) + 'px';
    tooltip.style.top = Math.max(5, y) + 'px';
  }

  function hideUserTooltip() {
    _profileGen++;
    if (userTooltip) {
      userTooltip.classList.remove('visible');
    }
  }

  function setupUserTooltipHandlers() {
    if (window._hsUserTooltipSetup) return;
    window._hsUserTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const target = e.target.closest('.hs-mc-user');
      if (target) {
        const username = target.dataset.username || target.textContent.replace(/^@/, '');
        const color = target.style.color;
        showUserTooltip(target, username, color);

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

  // Link preview tooltip (Chatterino-style)
  let linkTooltip = null;
  const _linkPreviewCache = new Map(); // url -> { title, description, image } | null
  let _linkHoverUrl = null;

  function ensureLinkTooltip() {
    if (linkTooltip) return linkTooltip;
    linkTooltip = document.createElement('div');
    linkTooltip.id = 'hs-link-tooltip';
    document.body.appendChild(linkTooltip);
    return linkTooltip;
  }

  let _linkTargetEl = null;

  function showLinkTooltip(e, url) {
    if (!linksEnabled || !url) return;
    _linkHoverUrl = url;
    _linkTargetEl = e.target.closest('.hs-mc-link') || e.target;
    const tip = ensureLinkTooltip();
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    // Show loading state immediately
    const loadWrap = document.createElement('div');
    loadWrap.className = 'link-text';
    const loadSpan = document.createElement('span');
    loadSpan.className = 'link-loading';
    loadSpan.textContent = 'loading...';
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
    safeSendMessage({ type: 'fetch_link_preview', url }).then(data => {
      _linkPreviewCache.set(url, data);
      if (_linkHoverUrl === url && tip.classList.contains('visible')) {
        renderLinkPreview(tip, data, url);
      }
    });
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

  function setupLinkTooltipHandlers() {
    if (window._hsLinkTooltipSetup) return;
    window._hsLinkTooltipSetup = true;

    cleanup.addEventListener(document, 'mouseover', (e) => {
      const link = e.target.closest('.hs-mc-link');
      if (link) showLinkTooltip(e, link.href);
    }, 'mc-link-tooltip-mouseover');

    cleanup.addEventListener(document, 'mouseout', (e) => {
      const link = e.target.closest('.hs-mc-link');
      if (link) hideLinkTooltip();
    }, 'mc-link-tooltip-mouseout');
  }
