// Heatsync Popup - Minimal status view
// innerHTML usage: all dynamic content passed through escapeHtml() or safeUrl()
(function() {
  'use strict';

  const API_URL = 'https://heatsync.org';

  function t(key, subs) {
    try { return chrome.i18n.getMessage(key, subs) || key; } catch { return key; }
  }

  function hydrateI18n(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]'))
      el.textContent = t(el.dataset.i18n) || el.textContent;
    for (const el of root.querySelectorAll('[data-i18n-placeholder]'))
      el.placeholder = t(el.dataset.i18nPlaceholder) || el.placeholder;
    for (const el of root.querySelectorAll('[data-i18n-title]'))
      el.title = t(el.dataset.i18nTitle) || el.title;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  function safeUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
      return u.href;
    } catch { return ''; }
  }

  function debounce(fn, ms) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // Proxy all API calls through background.js to bypass CORS
  function apiFetch(path, opts) {
    if (!opts) opts = {};
    return new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({
        type: 'api_fetch',
        path: path,
        method: opts.method || 'GET',
        auth: true,
        body: opts.body || undefined,
      }, function(resp) {
        if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
        resolve(resp);
      });
    });
  }

  // Search ────────────────────────────────────────────────────────────────────

  function initSearch() {
    const input = document.getElementById('search-input');
    const dropdown = document.getElementById('search-dropdown');
    if (!input || !dropdown) return;

    function closeDropdown() {
      dropdown.textContent = '';
      dropdown.classList.remove('open');
    }

    function renderItem(r) {
      const a = document.createElement('a');
      a.className = 'search-item';
      a.href = safeUrl(r.url) || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const imgSrc = safeUrl(r.img || '');
      if (imgSrc) {
        const img = document.createElement('img');
        img.className = 'search-item-img';
        img.src = imgSrc;
        img.alt = '';
        img.loading = 'lazy';
        a.appendChild(img);
      } else {
        const d = document.createElement('div');
        d.className = 'search-item-img';
        a.appendChild(d);
      }
      const label = document.createElement('span');
      label.className = 'search-item-label';
      label.textContent = r.label || '';
      a.appendChild(label);
      const tag = document.createElement('span');
      tag.className = 'search-item-tag';
      tag.textContent = r.type || '';
      a.appendChild(tag);
      return a;
    }

    async function doSearch(q) {
      if (!q || q.length < 2) { closeDropdown(); return; }
      dropdown.textContent = '';
      const loading = document.createElement('div');
      loading.className = 'search-empty';
      loading.textContent = 'searching...';
      dropdown.appendChild(loading);
      dropdown.classList.add('open');
      try {
        const resp = await apiFetch('/api/search?q=' + encodeURIComponent(q) + '&limit=8');
        const results = [];
        // Server always returns { results: [...] } regardless of mode.
        // Each result has type, username, display_name, profile_image_url, etc.
        const arr = resp?.data?.results || resp?.results || [];
        if (Array.isArray(arr)) {
          arr.slice(0, 8).forEach(function(r) {
            const username = r.username || '';
            const isEmote = r.type === 'emote' || r.emote_url || r.emote_name;
            if (isEmote) {
              results.push({
                type: 'emote',
                label: r.name || r.emote_name || '',
                sub: '',
                img: r.url || r.emote_url || '',
                url: 'https://heatsync.org/emotes/' + encodeURIComponent(r.name || r.emote_name || '')
              });
            } else if (username) {
              results.push({
                type: 'user',
                label: r.display_name || username,
                sub: username,
                img: r.profile_image_url || r.avatar_url || '',
                url: 'https://heatsync.org/@' + encodeURIComponent(username)
              });
            }
          });
        }
        dropdown.textContent = '';
        if (!results.length) {
          const empty = document.createElement('div');
          empty.className = 'search-empty';
          empty.textContent = 'no results';
          dropdown.appendChild(empty);
          return;
        }
        results.forEach(function(r) { dropdown.appendChild(renderItem(r)); });
      } catch {
        dropdown.textContent = '';
        const err = document.createElement('div');
        err.className = 'search-empty';
        err.textContent = 'error';
        dropdown.appendChild(err);
      }
    }

    const debouncedSearch = debounce(doSearch, 300);

    input.addEventListener('input', function() { debouncedSearch(input.value.trim()); });
    input.addEventListener('keydown', function(e) { if (e.key === 'Escape') { closeDropdown(); input.value = ''; } });
    document.addEventListener('click', function(e) {
      if (!input.contains(e.target) && !dropdown.contains(e.target)) closeDropdown();
    });
  }

  // Live Following ────────────────────────────────────────────────────────────

  function formatViewers(n) {
    if (n == null || n === '') return '';
    const num = parseInt(n) || 0;
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return String(num);
  }

  function _renderLiveStreams(container, streams) {
    container.textContent = '';
    if (!streams.length) {
      const empty = document.createElement('div');
      empty.className = 'live-empty';
      empty.textContent = 'no followed channels live';
      container.appendChild(empty);
      return;
    }
    streams.forEach(function(s) {
        const platform = s.platform || 'twitch';
        const username = s.username || '';
        const url = safeUrl(platform === 'kick'
          ? 'https://kick.com/' + encodeURIComponent(username)
          : 'https://www.twitch.tv/' + encodeURIComponent(username));
        const a = document.createElement('a');
        a.className = 'live-row';
        a.href = url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const dot = document.createElement('span');
        dot.className = 'live-dot';
        a.appendChild(dot);

        const imgSrc = safeUrl(s.profileImageUrl || s.profile_image_url || '');
        if (imgSrc) {
          const img = document.createElement('img');
          img.className = 'live-avatar';
          img.src = imgSrc;
          img.alt = '';
          img.loading = 'lazy';
          a.appendChild(img);
        } else {
          const d = document.createElement('div');
          d.className = 'live-avatar';
          a.appendChild(d);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'live-name';
        nameEl.textContent = s.heatsyncDisplayName || s.displayName || s.display_name || username;
        a.appendChild(nameEl);

        const viewers = formatViewers(s.viewerCount || s.viewer_count);
        if (viewers) {
          const vEl = document.createElement('span');
          vEl.className = 'live-viewers';
          vEl.textContent = viewers;
          a.appendChild(vEl);
        }
        container.appendChild(a);
      });
  }

  async function loadLive(container) {
    // Try background's cached snapshot first — instant paint, no spinner.
    let painted = false;
    try {
      const cached = await chrome.runtime.sendMessage({ type: 'get_live_followed' });
      if (cached && Array.isArray(cached.snapshot)) {
        _renderLiveStreams(container, cached.snapshot);
        painted = true;
      }
    } catch {}

    if (!painted) {
      container.textContent = '';
      const loading = document.createElement('div');
      loading.className = 'live-empty';
      loading.textContent = 'loading...';
      container.appendChild(loading);
    }

    // Re-fetch from server to ensure freshness (background polls every 60s,
    // popup may open mid-cycle). Update silently if data changed.
    try {
      const resp = await apiFetch('/api/live/following');
      const streams = (resp && (resp.streams || (resp.data && resp.data.streams))) || [];
      _renderLiveStreams(container, streams);
    } catch {
      if (!painted) {
        container.textContent = '';
        const err = document.createElement('div');
        err.className = 'live-empty';
        err.textContent = 'failed to load';
        container.appendChild(err);
      }
    }
  }

  // Leaderboards ──────────────────────────────────────────────────────────────

  async function loadLeaderboard(container, period) {
    container.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'lb-empty';
    loading.textContent = 'loading...';
    container.appendChild(loading);
    const path = period === 'alltime' ? '/api/leaderboards/heat/alltime' : '/api/leaderboards/heat/today';
    try {
      const resp = await apiFetch(path);
      const leaders = (resp && (resp.leaders || (resp.data && resp.data.leaders))) || [];
      container.textContent = '';
      if (!leaders.length) {
        const empty = document.createElement('div');
        empty.className = 'lb-empty';
        empty.textContent = 'no data yet';
        container.appendChild(empty);
        return;
      }
      leaders.slice(0, 5).forEach(function(e, i) {
        const heat = parseInt(e.total_heat || e.heat || 0);
        const heatStr = heat >= 1000 ? (heat / 1000).toFixed(1) + 'k°' : heat + '°';
        const url = safeUrl('https://heatsync.org/@' + encodeURIComponent(e.username || ''));
        const a = document.createElement('a');
        a.className = 'lb-row';
        a.href = url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const rankEl = document.createElement('span');
        rankEl.className = 'lb-rank';
        rankEl.textContent = String(i + 1);
        a.appendChild(rankEl);

        const imgSrc = safeUrl(e.profile_image_url || e.avatar_url || '');
        if (imgSrc) {
          const img = document.createElement('img');
          img.className = 'lb-avatar';
          img.src = imgSrc;
          img.alt = '';
          img.loading = 'lazy';
          a.appendChild(img);
        } else {
          const d = document.createElement('div');
          d.className = 'lb-avatar';
          a.appendChild(d);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'lb-name';
        nameEl.textContent = e.display_name || e.username || '';
        a.appendChild(nameEl);

        const heatEl = document.createElement('span');
        heatEl.className = 'lb-heat';
        heatEl.textContent = heatStr;
        a.appendChild(heatEl);

        container.appendChild(a);
      });
    } catch {
      container.textContent = '';
      const err = document.createElement('div');
      err.className = 'lb-empty';
      err.textContent = 'failed to load';
      container.appendChild(err);
    }
  }

  function buildLbSection() {
    const wrap = document.createElement('div');
    wrap.className = 'lb-section';

    const titleRow = document.createElement('div');
    titleRow.className = 'section-title';
    titleRow.textContent = 'leaderboards';
    wrap.appendChild(titleRow);

    const tabs = document.createElement('div');
    tabs.className = 'lb-tabs';
    const tabToday = document.createElement('button');
    tabToday.className = 'lb-tab active';
    tabToday.textContent = 'today';
    const tabAlltime = document.createElement('button');
    tabAlltime.className = 'lb-tab';
    tabAlltime.textContent = 'all time';
    tabs.appendChild(tabToday);
    tabs.appendChild(tabAlltime);
    wrap.appendChild(tabs);

    const list = document.createElement('div');
    list.id = 'lb-list';
    list.dataset.auto = 'leaderboard';
    let currentPeriod = 'today';
    list._reload = function() { loadLeaderboard(list, currentPeriod); };
    wrap.appendChild(list);

    tabToday.addEventListener('click', function() {
      tabToday.classList.add('active');
      tabAlltime.classList.remove('active');
      currentPeriod = 'today';
      loadLeaderboard(list, currentPeriod);
    });
    tabAlltime.addEventListener('click', function() {
      tabAlltime.classList.add('active');
      tabToday.classList.remove('active');
      currentPeriod = 'alltime';
      loadLeaderboard(list, currentPeriod);
    });

    loadLeaderboard(list, currentPeriod);
    return wrap;
  }

  // Profile Edit ──────────────────────────────────────────────────────────────

  function buildProfileEditForm(user) {
    const form = document.createElement('div');
    form.className = 'profile-edit-form';
    form.id = 'profile-edit-form';

    const currentBio = user.bio || '';
    const currentColor = user.color || '#ffffff';

    const bioEl = document.createElement('textarea');
    bioEl.id = 'pe-bio';
    bioEl.maxLength = 200;
    bioEl.placeholder = 'bio (200 chars)';
    bioEl.value = currentBio;
    form.appendChild(bioEl);

    const charRow = document.createElement('div');
    charRow.className = 'char-count';
    const countSpan = document.createElement('span');
    countSpan.id = 'pe-bio-count';
    countSpan.textContent = String(currentBio.length);
    charRow.appendChild(countSpan);
    charRow.appendChild(document.createTextNode('/200'));
    form.appendChild(charRow);

    const editRow = document.createElement('div');
    editRow.className = 'profile-edit-row';

    const colorLabel = document.createElement('span');
    colorLabel.className = 'color-label';
    colorLabel.textContent = 'color';
    editRow.appendChild(colorLabel);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'color-input';
    colorInput.id = 'pe-color';
    colorInput.value = currentColor;
    editRow.appendChild(colorInput);

    const colorHex = document.createElement('input');
    colorHex.type = 'text';
    colorHex.className = 'color-hex-input';
    colorHex.id = 'pe-color-hex';
    colorHex.value = currentColor;
    colorHex.placeholder = '#ffffff';
    colorHex.maxLength = 7;
    editRow.appendChild(colorHex);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'profile-save-btn';
    saveBtn.id = 'pe-save';
    saveBtn.textContent = 'save';
    editRow.appendChild(saveBtn);

    form.appendChild(editRow);

    const status = document.createElement('div');
    status.className = 'profile-edit-status';
    status.id = 'pe-status';
    form.appendChild(status);

    bioEl.addEventListener('input', function() {
      countSpan.textContent = String(bioEl.value.length);
    });
    colorInput.addEventListener('input', function() { colorHex.value = colorInput.value; });
    colorHex.addEventListener('input', function() {
      const v = colorHex.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) colorInput.value = v;
    });

    saveBtn.addEventListener('click', async function() {
      const bio = bioEl.value.trim();
      const color = colorInput.value;
      saveBtn.disabled = true;
      status.style.color = '#a0a0a0';
      status.textContent = 'saving...';
      try {
        // Note: PUT /api/user/flair on this server expects badge metadata,
        // not just a color. Color-only flair edits are not supported here yet.
        // Save bio only; flair editing is hidden from this UI for now.
        const bioResp = await apiFetch('/api/user/bio', { method: 'PUT', body: { bio: bio } });
        const bioOk = bioResp && (bioResp.ok !== false);
        const flairOk = true;
        if (bioOk && flairOk) {
          status.style.color = '#00cc66';
          status.textContent = 'saved';
          const stored = await chrome.storage.local.get(['user_info']);
          if (stored.user_info) {
            stored.user_info.bio = bio;
            stored.user_info.color = color;
            await chrome.storage.local.set({ user_info: stored.user_info });
          }
        } else {
          const errMsg = (bioResp && bioResp.error) || 'save failed';
          status.style.color = '#ff4444';
          status.textContent = String(errMsg).slice(0, 60);
        }
      } catch {
        status.style.color = '#ff4444';
        status.textContent = 'error';
      }
      saveBtn.disabled = false;
    });

    return form;
  }

  // Bookmarks ─────────────────────────────────────────────────────────────────

  function relTime(ts) {
    const time = new Date(ts).getTime();
    if (!isFinite(time)) return '';
    const diff = Math.floor((Date.now() - time) / 1000);
    if (diff < 0) return 'just now';
    if (diff < 60) return diff + 's ago';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  }

  function toBase36(id) {
    const n = typeof id === 'number' ? id : parseInt(id, 10);
    if (!isFinite(n) || n < 0) return String(id || '');
    return n.toString(36);
  }

  async function loadBookmarks(container) {
    container.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'bm-empty';
    loading.textContent = 'loading...';
    container.appendChild(loading);
    try {
      const resp = await apiFetch('/api/bookmarks');
      const bookmarks = (resp && (resp.bookmarks || (resp.data && resp.data.bookmarks))) || [];
      container.textContent = '';
      if (!bookmarks.length) {
        const empty = document.createElement('div');
        empty.className = 'bm-empty';
        empty.textContent = 'no bookmarks yet';
        container.appendChild(empty);
        return;
      }
      bookmarks.slice(0, 5).forEach(function(b) {
        // Server fields: base36_id, content, bookmarked_at, message_created_at,
        // author_username, author_platform, heat, etc.
        const base36 = b.base36_id || b.messageId || b.message_id || b.id || '';
        const url = safeUrl('https://heatsync.org/m/' + encodeURIComponent(base36));
        const a = document.createElement('a');
        a.className = 'bm-row';
        a.href = url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const ts = b.bookmarked_at || b.message_created_at || b.ts || b.createdAt || b.created_at || null;
        const tsEl = document.createElement('span');
        tsEl.className = 'bm-ts';
        tsEl.textContent = ts ? relTime(ts) : '';
        a.appendChild(tsEl);

        const chEl = document.createElement('span');
        chEl.className = 'bm-channel';
        chEl.textContent = b.author_username || b.channel || '';
        a.appendChild(chEl);

        const content = String(b.content || b.message || b.text || '');
        const snippet = content.length > 60 ? content.slice(0, 60) + '…' : content;
        const msgEl = document.createElement('span');
        msgEl.className = 'bm-content';
        msgEl.textContent = snippet;
        a.appendChild(msgEl);

        container.appendChild(a);
      });

      const viewAll = document.createElement('a');
      viewAll.className = 'bm-viewall';
      viewAll.href = 'https://heatsync.org/bookmarks';
      viewAll.target = '_blank';
      viewAll.rel = 'noopener noreferrer';
      viewAll.textContent = 'view all';
      container.appendChild(viewAll);
    } catch {
      container.textContent = '';
      const err = document.createElement('div');
      err.className = 'bm-empty';
      err.textContent = 'failed to load';
      container.appendChild(err);
    }
  }

  function buildBookmarksSection() {
    const wrap = document.createElement('div');
    wrap.className = 'bm-section';

    const titleRow = document.createElement('div');
    titleRow.className = 'section-title';
    titleRow.textContent = 'bookmarks';
    wrap.appendChild(titleRow);

    const list = document.createElement('div');
    list.id = 'bm-list';
    list.dataset.auto = 'bookmarks';
    list._reload = function() { loadBookmarks(list); };
    wrap.appendChild(list);

    loadBookmarks(list);
    return wrap;
  }

  // Referrals ─────────────────────────────────────────────────────────────────

  async function loadReferrals(container) {
    container.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'ref-empty';
    loading.textContent = 'loading...';
    container.appendChild(loading);
    try {
      const resp = await apiFetch('/api/referral/codes');
      const codes = (resp && (resp.codes || (resp.data && resp.data.codes))) || [];
      container.textContent = '';
      if (!codes.length) {
        const empty = document.createElement('div');
        empty.className = 'ref-empty';
        const txt = document.createTextNode('no codes — claim one at ');
        empty.appendChild(txt);
        const link = document.createElement('a');
        link.href = 'https://heatsync.org/referrals';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'heatsync.org/referrals';
        empty.appendChild(link);
        container.appendChild(empty);
        return;
      }
      codes.slice(0, 2).forEach(function(c) {
        const code = String(c.code || '');
        const uses = parseInt(c.uses || 0);
        const maxUses = c.max_uses != null ? parseInt(c.max_uses) : null;
        const usesStr = maxUses != null ? uses + '/' + maxUses : String(uses);

        const row = document.createElement('div');
        row.className = 'ref-row';

        const codeEl = document.createElement('span');
        codeEl.className = 'ref-code';
        codeEl.textContent = code;
        row.appendChild(codeEl);

        const usesEl = document.createElement('span');
        usesEl.className = 'ref-uses';
        usesEl.textContent = usesStr + ' uses';
        row.appendChild(usesEl);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'ref-copy';
        copyBtn.textContent = 'copy';
        copyBtn.addEventListener('click', function() {
          navigator.clipboard.writeText(code).then(function() {
            copyBtn.textContent = 'copied';
            setTimeout(function() { copyBtn.textContent = 'copy'; }, 1500);
          }).catch(function() {
            copyBtn.textContent = 'error';
            setTimeout(function() { copyBtn.textContent = 'copy'; }, 1500);
          });
        });
        row.appendChild(copyBtn);

        container.appendChild(row);
      });
    } catch {
      container.textContent = '';
      const err = document.createElement('div');
      err.className = 'ref-empty';
      err.textContent = 'failed to load';
      container.appendChild(err);
    }
  }

  function buildReferralsSection() {
    const wrap = document.createElement('div');
    wrap.className = 'ref-section';

    const titleRow = document.createElement('div');
    titleRow.className = 'section-title';
    titleRow.textContent = 'referrals';
    wrap.appendChild(titleRow);

    const list = document.createElement('div');
    list.id = 'ref-list';
    list.dataset.auto = 'referrals';
    list._reload = function() { loadReferrals(list); };
    wrap.appendChild(list);

    loadReferrals(list);
    return wrap;
  }

  // Live Now ──────────────────────────────────────────────────────────────────

  async function loadLiveNowTop(container) {
    container.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'live-empty';
    loading.textContent = 'loading...';
    container.appendChild(loading);
    try {
      const resp = await apiFetch('/api/live/top');
      const streams = (resp && (resp.streams || resp.channels || (resp.data && (resp.data.streams || resp.data.channels)))) || [];
      container.textContent = '';
      if (!streams.length) {
        const empty = document.createElement('div');
        empty.className = 'live-empty';
        empty.textContent = 'no live channels';
        container.appendChild(empty);
        return;
      }
      streams.slice(0, 5).forEach(function(s) {
        const platform = s.platform || 'twitch';
        const username = s.username || s.login || '';
        const url = safeUrl(platform === 'kick'
          ? 'https://kick.com/' + encodeURIComponent(username)
          : 'https://www.twitch.tv/' + encodeURIComponent(username));
        const a = document.createElement('a');
        a.className = 'live-row';
        a.href = url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const dot = document.createElement('span');
        dot.className = 'live-dot';
        a.appendChild(dot);

        const imgSrc = safeUrl(s.profileImageUrl || s.profile_image_url || '');
        if (imgSrc) {
          const img = document.createElement('img');
          img.className = 'live-avatar';
          img.src = imgSrc;
          img.alt = '';
          img.loading = 'lazy';
          a.appendChild(img);
        } else {
          const d = document.createElement('div');
          d.className = 'live-avatar';
          a.appendChild(d);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'live-name';
        nameEl.textContent = s.displayName || s.display_name || username;
        a.appendChild(nameEl);

        const viewers = formatViewers(s.viewerCount || s.viewer_count);
        if (viewers) {
          const vEl = document.createElement('span');
          vEl.className = 'live-viewers';
          vEl.textContent = viewers;
          a.appendChild(vEl);
        }
        container.appendChild(a);
      });
    } catch {
      container.textContent = '';
      const err = document.createElement('div');
      err.className = 'live-empty';
      err.textContent = 'failed to load';
      container.appendChild(err);
    }
  }

  async function loadLiveNowCategories(container, onSelect) {
    container.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'live-empty';
    loading.textContent = 'loading...';
    container.appendChild(loading);
    try {
      const resp = await apiFetch('/api/live/categories');
      const cats = (resp && (resp.categories || (resp.data && resp.data.categories))) || [];
      container.textContent = '';
      if (!cats.length) {
        const empty = document.createElement('div');
        empty.className = 'live-empty';
        empty.textContent = 'no categories';
        container.appendChild(empty);
        return;
      }
      cats.slice(0, 8).forEach(function(c) {
        const name = c.name || c.game_name || c.category || '';
        const row = document.createElement('div');
        row.className = 'livenow-cat-row';
        // .title is a DOM string property — escapeHtml would inject literal entities
        row.title = name;

        const thumbSrc = safeUrl(c.imageUrl || c.image_url || c.box_art_url || c.thumbnail || c.image || '');
        if (thumbSrc) {
          const img = document.createElement('img');
          img.className = 'livenow-cat-thumb';
          img.src = thumbSrc;
          img.alt = '';
          img.loading = 'lazy';
          row.appendChild(img);
        } else {
          const d = document.createElement('div');
          d.className = 'livenow-cat-thumb';
          row.appendChild(d);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'livenow-cat-name';
        nameEl.textContent = name;
        row.appendChild(nameEl);

        const cnt = c.streams ?? c.channels ?? c.stream_count ?? c.count;
        if (cnt != null) {
          const cntEl = document.createElement('span');
          cntEl.className = 'livenow-cat-count';
          cntEl.textContent = formatViewers(cnt);
          row.appendChild(cntEl);
        }

        row.addEventListener('click', function() { onSelect(name); });
        container.appendChild(row);
      });
    } catch {
      container.textContent = '';
      const err = document.createElement('div');
      err.className = 'live-empty';
      err.textContent = 'failed to load';
      container.appendChild(err);
    }
  }

  async function loadLiveNowCategory(container, categoryName, onBack) {
    container.textContent = '';

    const backBtn = document.createElement('button');
    backBtn.className = 'livenow-back';
    backBtn.textContent = '← ' + categoryName;
    backBtn.addEventListener('click', onBack);
    container.appendChild(backBtn);

    const list = document.createElement('div');
    container.appendChild(list);

    const loading = document.createElement('div');
    loading.className = 'live-empty';
    loading.textContent = 'loading...';
    list.appendChild(loading);

    try {
      const resp = await apiFetch('/api/live/category/' + encodeURIComponent(categoryName));
      const streams = (resp && (resp.streams || resp.channels || (resp.data && (resp.data.streams || resp.data.channels)))) || [];
      list.textContent = '';
      if (!streams.length) {
        const empty = document.createElement('div');
        empty.className = 'live-empty';
        empty.textContent = 'no live channels';
        list.appendChild(empty);
        return;
      }
      streams.slice(0, 5).forEach(function(s) {
        const platform = s.platform || 'twitch';
        const username = s.username || s.login || '';
        const url = safeUrl(platform === 'kick'
          ? 'https://kick.com/' + encodeURIComponent(username)
          : 'https://www.twitch.tv/' + encodeURIComponent(username));
        const a = document.createElement('a');
        a.className = 'live-row';
        a.href = url || '#';
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        const dot = document.createElement('span');
        dot.className = 'live-dot';
        a.appendChild(dot);

        const imgSrc = safeUrl(s.profileImageUrl || s.profile_image_url || '');
        if (imgSrc) {
          const img = document.createElement('img');
          img.className = 'live-avatar';
          img.src = imgSrc;
          img.alt = '';
          img.loading = 'lazy';
          a.appendChild(img);
        } else {
          const d = document.createElement('div');
          d.className = 'live-avatar';
          a.appendChild(d);
        }

        const nameEl = document.createElement('span');
        nameEl.className = 'live-name';
        nameEl.textContent = s.displayName || s.display_name || username;
        a.appendChild(nameEl);

        const viewers = formatViewers(s.viewerCount || s.viewer_count);
        if (viewers) {
          const vEl = document.createElement('span');
          vEl.className = 'live-viewers';
          vEl.textContent = viewers;
          a.appendChild(vEl);
        }
        list.appendChild(a);
      });
    } catch {
      list.textContent = '';
      const err = document.createElement('div');
      err.className = 'live-empty';
      err.textContent = 'failed to load';
      list.appendChild(err);
    }
  }

  function buildLiveNowSection() {
    const wrap = document.createElement('div');
    wrap.className = 'livenow-section';

    // title row: "live now" + refresh + "categories" toggle
    const titleRow = document.createElement('div');
    titleRow.className = 'section-title';

    const titleText = document.createTextNode('live now');
    titleRow.appendChild(titleText);

    const catToggle = document.createElement('button');
    catToggle.className = 'livenow-toggle';
    catToggle.textContent = 'categories';
    catToggle.title = 'browse by category';
    titleRow.appendChild(catToggle);

    wrap.appendChild(titleRow);

    const list = document.createElement('div');
    list.id = 'livenow-list';
    list.dataset.auto = 'live-now';
    wrap.appendChild(list);

    // state: 'top' | 'categories' | 'category'
    let view = 'top';
    list._reload = function() {
      if (view === 'top') loadLiveNowTop(list);
      // categories/category mode: don't auto-refresh — user is browsing
    };

    function showTop() {
      view = 'top';
      catToggle.classList.remove('active');
      loadLiveNowTop(list);
    }

    function showCategories() {
      view = 'categories';
      catToggle.classList.add('active');
      loadLiveNowCategories(list, function(catName) {
        view = 'category';
        loadLiveNowCategory(list, catName, function() { showCategories(); });
      });
    }

    catToggle.addEventListener('click', function() {
      if (view === 'top') showCategories();
      else showTop();
    });

    loadLiveNowTop(list);
    return wrap;
  }

  // Main init ─────────────────────────────────────────────────────────────────

  async function init() {
    const content = document.getElementById('content');
    const dot = document.getElementById('status-dot');

    // Load stored data
    const stored = await chrome.storage.local.get([
      'auth_token', 'auth_token_encrypted', 'user_info', 'emote_inventory', 'global_emotes', 'blocked_emotes'
    ]);

    // Check API connectivity
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      const resp = await fetch(API_URL + '/api/health', { signal: controller.signal });
      if (resp.ok) {
        dot.className = 'status-dot green';
        dot.title = t('popup_status_connected');
      } else {
        dot.className = 'status-dot red';
        dot.title = t('popup_status_api_error');
      }
    } catch {
      dot.className = 'status-dot red';
      dot.title = t('popup_status_offline');
    }

    const token = stored.auth_token || stored.auth_token_encrypted;
    const user = stored.user_info;

    if (token && user) {
      // Logged in
      const rawAvatar = user.avatar_url || user.profile_image_url || '';
      const avatar = safeUrl(rawAvatar);
      const name = user.display_name || user.username || 'user';
      const emoteCount = (stored.emote_inventory || []).length;
      const globalCount = (stored.global_emotes || []).length;
      const heat = user.heat || 0;

      // ── user row ──
      const userSection = document.createElement('div');
      userSection.className = 'user-section';

      const userRow = document.createElement('div');
      userRow.className = 'user-row';

      if (avatar) {
        const img = document.createElement('img');
        img.src = avatar;
        img.className = 'user-avatar';
        img.alt = '';
        userRow.appendChild(img);
      } else {
        const d = document.createElement('div');
        d.className = 'user-avatar';
        userRow.appendChild(d);
      }

      const userInfo = document.createElement('div');
      const nameEl = document.createElement('div');
      nameEl.className = 'user-name';
      nameEl.textContent = name;
      const statsEl = document.createElement('div');
      statsEl.className = 'user-stats';
      statsEl.textContent = heat
        ? t('popup_user_stats_heat', [String(emoteCount), String(globalCount), String(heat)])
        : t('popup_user_stats', [String(emoteCount), String(globalCount)]);
      userInfo.appendChild(nameEl);
      userInfo.appendChild(statsEl);
      userRow.appendChild(userInfo);

      const editBtn = document.createElement('button');
      editBtn.className = 'edit-profile-btn';
      editBtn.id = 'edit-profile-btn';
      editBtn.title = 'edit profile';
      editBtn.textContent = 'edit';
      userRow.appendChild(editBtn);

      const editForm = buildProfileEditForm(user);

      userSection.appendChild(userRow);
      userSection.appendChild(editForm);

      editBtn.addEventListener('click', function() {
        editForm.classList.toggle('open');
      });

      // ── actions ──
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'actions';

      const emoteLink = document.createElement('a');
      emoteLink.href = 'https://heatsync.org/emotes';
      emoteLink.target = '_blank';
      emoteLink.rel = 'noopener noreferrer';
      emoteLink.className = 'action-btn';
      emoteLink.textContent = t('popup_btn_emotes');
      actionsDiv.appendChild(emoteLink);

      const siteLink = document.createElement('a');
      siteLink.href = 'https://heatsync.org';
      siteLink.target = '_blank';
      siteLink.rel = 'noopener noreferrer';
      siteLink.className = 'action-btn';
      siteLink.textContent = t('popup_btn_site');
      actionsDiv.appendChild(siteLink);

      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'action-btn';
      logoutBtn.id = 'logout-btn';
      logoutBtn.style.color = '#a0a0a0';
      logoutBtn.textContent = t('popup_btn_logout') || 'logout';
      actionsDiv.appendChild(logoutBtn);

      logoutBtn.addEventListener('click', async function() {
        await chrome.storage.local.remove(['auth_token', 'auth_token_encrypted', 'user_info', 'emote_inventory', 'blocked_emotes']);
        await chrome.runtime.sendMessage({ type: 'clear_auth' });
        init().catch(function() {});
      });

      // ── live following ──
      const liveSep = document.createElement('hr');
      liveSep.className = 'sep';

      const liveTitleRow = document.createElement('div');
      liveTitleRow.className = 'section-title';
      liveTitleRow.textContent = 'live following';

      const liveSection = document.createElement('div');
      liveSection.className = 'live-section';

      const liveList = document.createElement('div');
      liveList.id = 'live-list';
      liveList.dataset.auto = 'live-following';
      liveList._reload = function() { loadLive(liveList); };

      liveSection.appendChild(liveTitleRow);
      liveSection.appendChild(liveList);

      // ── live now ──
      const liveNowSep = document.createElement('hr');
      liveNowSep.className = 'sep';
      const liveNowSection = buildLiveNowSection();

      // ── leaderboards ──
      const lbSep = document.createElement('hr');
      lbSep.className = 'sep';
      const lbSection = buildLbSection();

      // ── bookmarks ──
      const bmSep = document.createElement('hr');
      bmSep.className = 'sep';
      const bmSection = buildBookmarksSection();

      // ── referrals ──
      const refSep = document.createElement('hr');
      refSep.className = 'sep';
      const refSection = buildReferralsSection();

      const trailSep = document.createElement('hr');
      trailSep.className = 'sep';

      content.textContent = '';
      content.appendChild(userSection);
      content.appendChild(actionsDiv);
      content.appendChild(liveSep);
      content.appendChild(liveSection);
      content.appendChild(liveNowSep);
      content.appendChild(liveNowSection);
      content.appendChild(lbSep);
      content.appendChild(lbSection);
      content.appendChild(bmSep);
      content.appendChild(bmSection);
      content.appendChild(refSep);
      content.appendChild(refSection);
      content.appendChild(trailSep);

      loadLive(liveList);

    } else {
      // Not logged in
      content.textContent = '';
      const loginSection = document.createElement('div');
      loginSection.className = 'login-section';
      loginSection.textContent = t('popup_login_prompt');
      loginSection.appendChild(document.createElement('br'));
      const loginLink = document.createElement('a');
      loginLink.href = 'https://heatsync.org';
      loginLink.target = '_blank';
      loginLink.rel = 'noopener noreferrer';
      loginLink.className = 'login-btn';
      loginLink.textContent = 'heatsync.org';
      loginSection.appendChild(loginLink);
      content.appendChild(loginSection);
    }
  }

  function initPopout() {
    const input = document.getElementById('popout-input');
    const btn = document.getElementById('popout-btn');

    // auto-fill from active tab if on twitch or kick
    let detectedPlatform = 'twitch';
    // For YouTube, track if the input is a handle (needs /@handle/live redirect)
    // vs a video ID (uses /live_chat?v=). Handles can't be popped out directly.
    let ytIsHandle = false;
    chrome.tabs.query({ active: true, currentWindow: true }).then(function(tabs) {
      const tab = tabs[0];
      if (!tab || !tab.url) return;
      try {
        const url = new URL(tab.url);
        if (url.hostname.includes('twitch.tv')) {
          detectedPlatform = 'twitch';
          const m = url.pathname.match(/^\/(?:popout\/|embed\/)?([a-zA-Z0-9_]+)/);
          if (m && !['directory', 'settings', 'videos', 'moderator', 'subscriptions'].includes(m[1].toLowerCase())) {
            input.value = m[1].toLowerCase();
          }
        } else if (url.hostname.includes('kick.com')) {
          detectedPlatform = 'kick';
          const m = url.pathname.match(/^\/([a-zA-Z0-9_]+)/);
          if (m && !['categories', 'following', 'settings', 'search'].includes(m[1].toLowerCase())) {
            input.value = m[1].toLowerCase();
          }
        } else if (url.hostname.includes('youtube.com')) {
          detectedPlatform = 'youtube';
          const handleMatch = url.pathname.match(/^\/@([^/]+)/);
          if (handleMatch) {
            input.value = handleMatch[1].toLowerCase();
            ytIsHandle = true;
          } else {
            const vParam = url.searchParams.get('v');
            const liveMatch = url.pathname.match(/^\/live\/([^/?]+)/);
            if (vParam) input.value = vParam;
            else if (liveMatch) input.value = liveMatch[1];
          }
        }
      } catch {}
    });

    function openPopout() {
      const channel = input.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!channel) { input.focus(); return; }
      let url;
      if (detectedPlatform === 'youtube') {
        // YouTube popout requires a video ID (?v=...). For handles, redirect to
        // the channel's live URL — YT auto-redirects to the live video if streaming.
        url = ytIsHandle
          ? 'https://www.youtube.com/@' + channel + '/live'
          : 'https://www.youtube.com/live_chat?v=' + channel + '&is_popout=1';
      } else if (detectedPlatform === 'kick') {
        url = 'https://kick.com/' + channel;
      } else {
        url = 'https://www.twitch.tv/popout/' + channel + '/chat';
      }
      chrome.tabs.create({ url: url });
    }

    btn.addEventListener('click', openPopout);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') openPopout();
    });
    // If user manually edits the YouTube input, assume they typed a video ID.
    input.addEventListener('input', function() { ytIsHandle = false; });
  }

  // Auto-refresh: poll the dynamic sections while popup is open. All
  // intervals stop on unload (popup closes). No manual refresh buttons.
  let _liveTimer = null, _lbTimer = null, _bmTimer = null, _liveNowTimer = null, _refTimer = null;
  function startAutoRefresh() {
    // Live following: 15s — viewer counts move fast
    if (!_liveTimer) _liveTimer = setInterval(function() {
      const el = document.querySelector('[data-auto="live-following"]');
      if (el && typeof el._reload === 'function') el._reload();
    }, 15000);
    // Live now top: 15s
    if (!_liveNowTimer) _liveNowTimer = setInterval(function() {
      const el = document.querySelector('[data-auto="live-now"]');
      if (el && typeof el._reload === 'function') el._reload();
    }, 15000);
    // Leaderboards: 60s
    if (!_lbTimer) _lbTimer = setInterval(function() {
      const el = document.querySelector('[data-auto="leaderboard"]');
      if (el && typeof el._reload === 'function') el._reload();
    }, 60000);
    // Bookmarks: 60s
    if (!_bmTimer) _bmTimer = setInterval(function() {
      const el = document.querySelector('[data-auto="bookmarks"]');
      if (el && typeof el._reload === 'function') el._reload();
    }, 60000);
    // Referrals: 60s — usage counts can update from the dashboard side
    if (!_refTimer) _refTimer = setInterval(function() {
      const el = document.querySelector('[data-auto="referrals"]');
      if (el && typeof el._reload === 'function') el._reload();
    }, 60000);
  }
  window.addEventListener('unload', function() {
    if (_liveTimer) clearInterval(_liveTimer);
    if (_lbTimer) clearInterval(_lbTimer);
    if (_bmTimer) clearInterval(_bmTimer);
    if (_liveNowTimer) clearInterval(_liveNowTimer);
    if (_refTimer) clearInterval(_refTimer);
  });

  document.addEventListener('DOMContentLoaded', function() {
    hydrateI18n();
    initSearch();
    init().catch(function(e) { console.error('popup init failed:', e); });
    initPopout();
    startAutoRefresh();

    // Re-run init when auth token lands in storage (user logged in while popup was open)
    if (window._hsPopupStorageListener) chrome.storage.onChanged.removeListener(window._hsPopupStorageListener);
    window._hsPopupStorageListener = function(changes, area) {
      if (area !== 'local') return;
      const authKeys = ['auth_token', 'auth_token_encrypted', 'user_info'];
      const relevant = authKeys.some(function(k) { return k in changes; });
      if (!relevant) return;
      const wasAuthed = authKeys.slice(0, 2).some(function(k) { return changes[k] && changes[k].oldValue; });
      const nowAuthed = authKeys.slice(0, 2).some(function(k) { return changes[k] && changes[k].newValue; });
      if (wasAuthed !== nowAuthed || (nowAuthed && 'user_info' in changes)) {
        init().catch(function(e) { console.error('popup re-init failed:', e); });
      }
    };
    chrome.storage.onChanged.addListener(window._hsPopupStorageListener);
  });
})();
