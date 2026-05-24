// Emotes - cache, lookup, processing, picker, block/inventory

  // Multichat picker provider toggles \u2014 three filter chips that only show
  // when the user focuses the search input. Local matches are always
  // included; the chips control which provider APIs contribute.
  let mcPickerSources = (() => {
    try {
      const raw = localStorage.getItem('hs-mc-picker-sources')
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr) && arr.length) {
          // Migrate old 'here' entries \u2014 local matches are now implicit.
          return new Set(arr.filter(s => s !== 'here'))
        }
      }
    } catch (_) {}
    return new Set(['7tv', 'bttv', 'ffz'])
  })()
  function mcSaveSources() {
    try { localStorage.setItem('hs-mc-picker-sources', JSON.stringify([...mcPickerSources])) } catch (_) {}
  }
  function mcHasExternalSource() {
    return mcPickerSources.has('7tv') || mcPickerSources.has('bttv') || mcPickerSources.has('ffz')
  }

  // Per-provider result caches keyed per-query. AbortController cancels stale
  // in-flight requests on each keystroke.
  let mcProviderResults = { '7tv': [], 'bttv': [], 'ffz': [] }
  let mcProviderLastQuery = { '7tv': '', 'bttv': '', 'ffz': '' }
  let mcProviderInFlight = { '7tv': false, 'bttv': false, 'ffz': false }
  let _mcProviderAborts = { '7tv': null, 'bttv': null, 'ffz': null }
  let mcCurrentQuery = ''
  // Map<name, {url, provider, id}> — populated by rerenderSearch with remote
  // provider results so the click handler can fire add-to-inventory before
  // pasting. Bounded by # of unique provider-search names per session.
  const mcRemoteEmoteIndex = new Map()

  // Module-scope re-render so the async event listener can drive it.
  function mcRerenderSearch(query) {
    const grid = document.getElementById('hs-mc-emote-grid')
    if (!grid) return
    mcRemoteEmoteIndex.clear()
    if (!query) {
      const allMap = new Map()
      for (const [k, v] of viewerPersonalEmotes) allMap.set(k, v)
      const cc = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()]
      if (cc) for (const [k, v] of cc) if (!allMap.has(k)) allMap.set(k, v)
      for (const [k, v] of emoteCache) if (!allMap.has(k)) allMap.set(k, v)
      grid.innerHTML = renderEmoteSections(groupEmotes(allMap))
      attachChunkObserver(grid)
      markPickerDirty()
      return
    }
    const filtered = new Map()
    // Local matches (channel + global + your set) always included.
    {
      const pool = new Map()
      for (const [k, v] of viewerPersonalEmotes) pool.set(k, v)
      const sc = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()]
      if (sc) for (const [k, v] of sc) if (!pool.has(k)) pool.set(k, v)
      for (const [k, v] of emoteCache) if (!pool.has(k)) pool.set(k, v)
      for (const [name, emote] of pool) {
        if (name.toLowerCase().includes(query)) filtered.set(name, emote)
      }
    }
    for (const p of ['7tv', 'bttv', 'ffz']) {
      if (!mcPickerSources.has(p)) continue
      if (mcProviderLastQuery[p] !== query) continue
      for (const r of mcProviderResults[p]) {
        if (!r.name || filtered.has(r.name)) continue
        // state='unadded' aligns with the existing emote-click handler
        // (input.js:740) which knows that branch — 'remote' fell through
        // every branch, leaving stopPropagation alive and the click dead.
        filtered.set(r.name, { source: p, state: 'unadded', url: r.url, provider: r.provider })
        mcRemoteEmoteIndex.set(r.name, { url: r.url, provider: r.provider, id: r.id })
      }
    }
    // One unified flat feed — no section headers, no visual distinction
    // between owned and remote results. Click handler still routes remote
    // emotes through add-to-inventory transparently.
    const flatEntries = [...filtered.entries()]
    const flatSection = [{ key: 'search', label: '', emotes: flatEntries }]
    grid.innerHTML = renderEmoteSections(flatSection, t('common_no_matches'), { noHeaders: true })
    attachChunkObserver(grid)
    markPickerDirty()
  }

  // 7TV v4 GraphQL \u2014 TOP_ALL_TIME popularity. perPage 200 captures substring
  // matches that 7TV's prefix-ranked algorithm pushes deep in the result list.
  const MC_SEVEN_TV_V4_GQL = `query SearchEmotes($query: String!, $page: Int!, $perPage: Int!) {
    emotes {
      search(query: $query, sort: { sortBy: TOP_ALL_TIME, order: DESCENDING }, page: $page, perPage: $perPage) {
        totalCount
        items { id defaultName flags { animated defaultZeroWidth } }
      }
    }
  }`

  async function mcSearch7tvApi(q, signal) {
    const resp = await fetch('https://api.7tv.app/v4/gql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        operationName: 'SearchEmotes',
        query: MC_SEVEN_TV_V4_GQL,
        variables: { query: q, page: 1, perPage: 200 }
      })
    })
    if (!resp.ok) throw new Error(`7tv ${resp.status}`)
    const data = await resp.json()
    const items = (data && data.data && data.data.emotes && data.data.emotes.search && data.data.emotes.search.items) || []
    return items.map(e => ({
      name: e.defaultName,
      url: `https://cdn.7tv.app/emote/${e.id}/1x.webp`,
      provider: '7tv',
      id: e.id,
      animated: !!(e.flags && e.flags.animated),
      zeroWidth: !!(e.flags && e.flags.defaultZeroWidth),
    }))
  }

  async function mcSearchBttvApi(q, signal) {
    const r = await fetch(`https://api.betterttv.net/3/emotes/shared/search?query=${encodeURIComponent(q)}&offset=0&limit=100`, { signal })
    if (!r.ok) throw new Error(`bttv ${r.status}`)
    const items = await r.json()
    if (!Array.isArray(items)) return []
    return items.map(e => ({
      name: e.code,
      url: `https://cdn.betterttv.net/emote/${e.id}/1x.${e.imageType || 'webp'}`,
      provider: 'bttv',
      id: e.id,
      animated: !!e.animated,
    }))
  }

  async function mcSearchFfzApi(q, signal) {
    const r = await fetch(`https://api.frankerfacez.com/v1/emotes?q=${encodeURIComponent(q)}&sort=count-desc&per_page=200`, { signal })
    if (!r.ok) throw new Error(`ffz ${r.status}`)
    const data = await r.json()
    const items = Array.isArray(data?.emoticons) ? data.emoticons : []
    return items.map(e => {
      const u = e.urls || {}
      return {
        name: e.name,
        url: u['1'] || u['2'] || u['4'] || '',
        provider: 'ffz',
        id: String(e.id),
        animated: !!e.animated,
        uses: Number(e.usage_count || 0),
      }
    })
  }

  function mcTriggerProviderSearches(q) {
    for (const p of ['7tv', 'bttv', 'ffz']) {
      if (_mcProviderAborts[p]) { try { _mcProviderAborts[p].abort() } catch (_) {} }
      if (!q) {
        mcProviderResults[p] = []
        mcProviderLastQuery[p] = ''
        mcProviderInFlight[p] = false
        continue
      }
      if (!mcPickerSources.has(p)) { mcProviderInFlight[p] = false; continue }
      if (mcProviderLastQuery[p] === q && mcProviderResults[p].length > 0) { mcProviderInFlight[p] = false; continue }
      const ac = new AbortController()
      _mcProviderAborts[p] = ac
      mcProviderInFlight[p] = true
      const fn = p === '7tv' ? mcSearch7tvApi : p === 'bttv' ? mcSearchBttvApi : mcSearchFfzApi
      fn(q, ac.signal).then(items => {
        if (ac.signal.aborted) return
        mcProviderResults[p] = items
        mcProviderLastQuery[p] = q
        mcProviderInFlight[p] = false
        if (mcCurrentQuery === q) {
          // Re-render the picker grid with merged results.
          const ev = new CustomEvent('hs-mc-search-results-ready', { detail: { query: q, provider: p } })
          document.dispatchEvent(ev)
        }
      }).catch(err => {
        if (ac.signal.aborted || err?.name === 'AbortError') return
        mcProviderInFlight[p] = false
        mcProviderResults[p] = []
        if (mcCurrentQuery === q) {
          const ev = new CustomEvent('hs-mc-search-results-ready', { detail: { query: q, provider: p } })
          document.dispatchEvent(ev)
        }
      })
    }
  }

  const UNICODE_EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]+$/u;
  const WS_RE = /^\s+$/
  const LINK_RE = /^(https?:\/\/\S+|[a-z0-9-]+(\.[a-z0-9-]+)+\/\S*)/i

  // Emote size (1, 2, or 4)
  let emoteSize = 1;

  // Upgrade emote URL to match current emote size setting.
  // Memoized: input URLs are bounded by emote count (~few thousand). Cache
  // resets when emoteSize changes — same input → same output otherwise.
  let _resCacheSize = 1
  const _resCache = new Map()
  function getChatResUrl(url) {
    if (!url) return url;
    if (_resCacheSize !== emoteSize) { _resCache.clear(); _resCacheSize = emoteSize }
    const hit = _resCache.get(url)
    if (hit !== undefined) return hit
    let out = url
    if (emoteSize === 1) {
      // True native: downgrade Twitch native (IRC fetches at /2.0) and 3rd-party CDNs to 1x.
      if (url.includes('static-cdn.jtvnw.net')) out = url.replace(/\/[23]\.0/, '/1.0');
      else if (url.includes('cdn.7tv.app')) out = url.replace(/\/[234]x/, '/1x');
      else if (url.includes('cdn.betterttv.net')) out = url.replace(/\/[23]x/, '/1x');
      else if (url.includes('cdn.frankerfacez.com')) out = url.replace(/\/[24](?=\.|$)/, '/1');
    } else if (emoteSize === 2) {
      if (url.includes('cdn.7tv.app')) out = url.replace('/1x', '/2x');
      else if (url.includes('cdn.betterttv.net')) out = url.replace('/1x', '/2x');
      else if (url.includes('cdn.frankerfacez.com')) out = url.replace(/\/1(?=\.|$)/, '/2');
      else if (url.includes('static-cdn.jtvnw.net')) out = url.replace('/1.0', '/2.0');
    } else if (emoteSize === 4) {
      if (url.includes('cdn.7tv.app')) out = url.replace('/1x', '/4x').replace('/2x', '/4x');
      else if (url.includes('cdn.betterttv.net')) out = url.replace('/1x', '/3x').replace('/2x', '/3x');
      else if (url.includes('cdn.frankerfacez.com')) out = url.replace(/\/[12](?=\.|$)/, '/4');
      else if (url.includes('static-cdn.jtvnw.net')) out = url.replace(/\/[12]\.0/, '/3.0');
    }
    _resCache.set(url, out)
    return out;
  }

  // Upgrade emote URL to highest resolution for tooltip
  function getHighResUrl(url) {
    if (!url) return url;
    // 7TV: /1x → /4x
    if (url.includes('cdn.7tv.app')) {
      return url.replace('/1x', '/4x').replace('/2x', '/4x').replace('/3x', '/4x');
    }
    // BTTV: /1x → /3x (max)
    if (url.includes('cdn.betterttv.net')) {
      return url.replace('/1x', '/3x').replace('/2x', '/3x');
    }
    // FFZ: /1 → /4
    if (url.includes('cdn.frankerfacez.com')) {
      return url.replace(/\/1(?=\.|$)/, '/4').replace(/\/2(?=\.|$)/, '/4');
    }
    // Twitch: /1.0 → /3.0 (max)
    if (url.includes('static-cdn.jtvnw.net')) {
      return url.replace('/1.0', '/3.0').replace('/2.0', '/3.0');
    }
    return url;
  }

  /**
   * Group emotes by state+source into ordered sections
   */
  // 'set' = anything the user owns (state==='owned'), regardless of original
  // provider. Without this branch a 7tv emote in the user's heatsync set
  // would bucket into '7tv' and the user's 982-emote set would scatter
  // across every section instead of sitting in one.
  const SECTION_ORDER = ['set', '7tv', 'bttv', 'ffz', 'twitch', 'kick', 'heatsync']
  const SECTION_LABELS = {
    set: 'Set',
    '7tv': '7TV', bttv: 'BTTV', ffz: 'FFZ',
    twitch: 'Twitch', kick: 'Kick', heatsync: 'Heatsync'
  }

  // Recently-used emotes — a local MRU list (most-recent first), captured on
  // every insert via the picker or tab-complete (see recordRecentEmote). There
  // is no server-side personal usage signal in the picker (the `uses` field on
  // search results is FFZ global popularity, not per-user), so this starts
  // empty on a fresh device and fills as the user inserts emotes. Rendered as
  // the first picker section; omitted entirely while empty (no dead header).
  const RECENT_KEY = 'hs-mc-recent-emotes'
  const RECENT_CAP = 24

  function loadRecentEmotes() {
    try {
      const r = JSON.parse(localStorage.getItem(RECENT_KEY))
      return Array.isArray(r) ? r : []
    } catch (_) { return [] }
  }

  function recordRecentEmote(name) {
    if (!name) return
    let list = loadRecentEmotes().filter(n => n !== name)
    list.unshift(name)
    if (list.length > RECENT_CAP) list = list.slice(0, RECENT_CAP)
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch (_) {}
    // The cache key doesn't track the MRU list, so force a rebuild on next
    // open (idle prebuild repopulates before reopen → still instant).
    markPickerDirty()
  }

  // Resolve MRU names to live emote pairs, dropping any no longer available
  // (blocked, removed, or not loaded for this channel). A recent emote also
  // appears in its source section below — intended, mirrors Discord.
  function buildRecentSection(allEmotes) {
    const out = []
    for (const name of loadRecentEmotes()) {
      const e = allEmotes.get(name)
      if (e) out.push([name, e])
      if (out.length >= RECENT_CAP) break
    }
    return out.length ? { key: 'recent', label: 'Recent', emotes: out } : null
  }

  function groupEmotes(allEmotes) {
    const groups = {}
    for (const [name, emote] of allEmotes) {
      const key = emote.state === 'owned' ? 'set' : emote.source
      if (!groups[key]) groups[key] = []
      groups[key].push([name, emote])
    }
    const sections = SECTION_ORDER
      .filter(k => groups[k]?.length)
      .map(k => ({ key: k, label: SECTION_LABELS[k] || k, emotes: groups[k] }))
    const recent = buildRecentSection(allEmotes)
    if (recent) sections.unshift(recent)
    return sections
  }

  // Chunked lazy render: with 2k+ emotes, building all <img> up-front blocks
  // the main thread for hundreds of ms. Split each section into chunks of
  // CHUNK_SIZE; render placeholder divs with estimated min-heights so the
  // scrollbar is correct, then populate each chunk via IntersectionObserver
  // as it nears the viewport. All emote name/url/source strings remain
  // escapeHtml'd inside emoteImgHtml() at populate time.
  const CHUNK_SIZE = 96
  const _chunkStore = new Map()
  let _chunkObserver = null

  function clearChunkStore() {
    _chunkStore.clear()
    if (_chunkObserver) { _chunkObserver.disconnect(); _chunkObserver = null }
  }

  function ensureChunkObserver(scrollRoot) {
    if (_chunkObserver) return _chunkObserver
    _chunkObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const el = e.target
        const key = el.dataset.chunkKey
        const data = _chunkStore.get(key)
        if (!data) { _chunkObserver.unobserve(el); continue }
        el.innerHTML = data.map(emoteImgHtml).join('')
        el.style.minHeight = ''
        el.classList.add('hs-mc-chunk-ready')
        _chunkStore.delete(key)
        _chunkObserver.unobserve(el)
      }
    }, { root: scrollRoot, rootMargin: '300px 0px', threshold: 0 })
    cleanup.trackObserver(_chunkObserver)
    return _chunkObserver
  }

  function attachChunkObserver(scope) {
    const scrollRoot = scope.querySelector('.hs-mc-picker-scroll') || scope
    const obs = ensureChunkObserver(scrollRoot)
    scope.querySelectorAll('.hs-mc-picker-chunk:not(.hs-mc-chunk-ready)').forEach(el => obs.observe(el))
  }

  function estimateChunkHeight(count) {
    const perRow = 7
    const rowHeight = 36
    return Math.ceil(count / perRow) * rowHeight
  }

  function renderEmoteSections(sections, emptyMsg = t('mc_emote_no_loaded'), opts) {
    clearChunkStore()
    if (!sections.length) return `<div class="hs-mc-picker-empty">${escapeHtml(emptyMsg)}</div>`
    const noHeaders = !!(opts && opts.noHeaders)
    return sections.map((s, si) => {
      const chunks = []
      for (let i = 0; i < s.emotes.length; i += CHUNK_SIZE) {
        chunks.push(s.emotes.slice(i, i + CHUNK_SIZE))
      }
      const chunksHtml = chunks.map((c, ci) => {
        const key = si + '-' + ci
        _chunkStore.set(key, c)
        const h = estimateChunkHeight(c.length)
        return '<div class="hs-mc-picker-section-grid hs-mc-picker-chunk" data-chunk-key="' + key + '" style="min-height:' + h + 'px"></div>'
      }).join('')
      const header = noHeaders ? '' : `<div class="hs-mc-picker-section-header">${escapeHtml(s.label)} <span class="hs-mc-picker-section-count">${s.emotes.length}</span></div>`
      return `
      <div class="hs-mc-picker-section" data-section-key="${escapeHtml(s.key)}">
        ${header}
        ${chunksHtml}
      </div>`
    }).join('')
  }

  function emoteImgHtml([name, emote]) {
    const isBlocked = blockedEmoteNames.has(name)
    // state must reflect 'blocked' on the img too — findEmoteTarget reads
    // img.dataset.state; without this update right-click on a blocked picker
    // emote returns state='global' and re-blocks instead of unblocking.
    const state = isBlocked ? 'blocked' : (emote.state || 'global')
    const wrapCls = isBlocked
      ? 'hs-mc-picker-emote-wrap blocked'
      : (state === 'unadded' ? 'hs-mc-picker-emote-wrap unadded' : 'hs-mc-picker-emote-wrap')
    const safeName = escapeHtml(name)
    return `<span class="${wrapCls}" data-name="${safeName}"><img src="${escapeHtml(emote.url)}" alt="${safeName}" title="${safeName} (${escapeHtml(emote.source)})" class="hs-mc-picker-emote hs-emote-${escapeHtml(emote.source)}" data-name="${safeName}" data-source="${escapeHtml(emote.source)}" data-state="${state}" loading="lazy"></span>`
  }

  /**
   * Emote picker — DOM is built once and cached; subsequent opens just toggle
   * `.visible` (no innerHTML reparse). Idle prebuild after loadEmotes() makes
   * even the very first click open instantly. Cache invalidates on channel
   * switch, emote-size change, or any emote-cache reload via markPickerDirty().
   */
  let pickerTab = 'emotes'; // 'emotes' or 'twitch'
  let _pickerCloseHandler = null;
  let _pickerBuiltKey = null;
  let _pickerPrebuildScheduled = false;

  function pickerCacheKey() {
    // pickerTab is intentionally NOT in the key — switching the active tab
    // (emotes ↔ twitch) just toggles display, no rebuild needed.
    const ch = currentTab || getCurrentChannel() || '_';
    const chSize = channelEmoteCaches[ch]?.size || channelEmoteCaches[getCurrentChannel()]?.size || 0;
    return `${ch}|${emoteSize}|${emoteCache.size}|${chSize}`;
  }

  function markPickerDirty() {
    _pickerBuiltKey = null;
  }

  function prebuildPickerIdle() {
    if (_pickerPrebuildScheduled) return;
    _pickerPrebuildScheduled = true;
    // Firefox requires requestIdleCallback to be called with `this === window`;
    // a bare reference loses the binding and throws "called on an object that
    // does not implement interface Window". Bind explicitly, fall back to setTimeout.
    const idle = window.requestIdleCallback ? window.requestIdleCallback.bind(window) : ((cb) => setTimeout(cb, 250));
    idle(() => {
      _pickerPrebuildScheduled = false;
      if (typeof mcSignal !== 'undefined' && mcSignal.aborted) return;
      const picker = document.getElementById('hs-mc-emote-picker');
      if (!picker) return;
      // Don't rebuild while the user is actively inside the picker — the
      // innerHTML swap destroys the search input element + its typed value,
      // which manifests as "I clicked an emote and the picker reset to no
      // search". Cache key stays stale; next close+reopen rebuilds fresh.
      if (picker.classList.contains('visible')) return;
      if (pickerCacheKey() !== _pickerBuiltKey) showEmotePicker('__prebuild');
    }, { timeout: 1500 });
  }

  function syncPickerTabDisplay(picker) {
    const emTab = picker.querySelector('#hs-mc-tab-emotes');
    const twTab = picker.querySelector('#hs-mc-tab-twitch');
    if (emTab) emTab.style.display = pickerTab === 'emotes' ? 'flex' : 'none';
    if (twTab) twTab.style.display = pickerTab === 'twitch' ? 'flex' : 'none';
    picker.querySelectorAll('.hs-mc-picker-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === pickerTab);
    });
  }

  function showEmotePicker(tab = null) {
    const picker = document.getElementById('hs-mc-emote-picker');
    if (!picker) return;

    // Sentinel: prebuild path — populate DOM but do NOT toggle visible.
    const isPrebuild = tab === '__prebuild';
    if (isPrebuild) {
      // Skip if already built for the current state
      if (pickerCacheKey() === _pickerBuiltKey) return;
      // Fall through to build path; visible class is left untouched at end.
    } else if (tab) {
      pickerTab = tab;
    } else if (picker.classList.contains('visible')) {
      picker.classList.remove('visible');
      adjustOverlayForPicker(false);
      hideInputBar();
      return;
    }

    // Twitch features tab (predictions/polls/rewards/clip/popout/mod) needs the
    // twitch.tv page context for auth + GQL proxy. Hide it on YT/Kick host.
    const showTwitchTab = hostPlatform === 'twitch';
    if (!showTwitchTab && pickerTab === 'twitch') pickerTab = 'emotes';

    // Cache hit → no rebuild, just sync which tab content is shown.
    if (!isPrebuild && pickerCacheKey() === _pickerBuiltKey && picker.firstChild) {
      syncPickerTabDisplay(picker);
      picker.classList.add('visible');
      const bar = document.getElementById('hs-mc-inputbar');
      const barHeight = (bar && inputBarVisible) ? bar.offsetHeight : 0;
      picker.style.bottom = barHeight + 'px';
      adjustOverlayForPicker(true);
      if (pickerTab === 'twitch') renderTwitchTab();
      attachPickerCloseHandler(picker);
      return;
    }

    // Cache miss → build full DOM synchronously (no chunks, no popping).
    // Merge channel emotes first (keeps 'channel' state), then globals.
    // All names/urls are pre-sanitized via escapeHtml in render helpers.
    const allEmotes = new Map();
    // Picker priority: viewer's personal inventory FIRST so 'owned' state shows on top
    for (const [k, v] of viewerPersonalEmotes) allEmotes.set(k, v);
    const chCache = channelEmoteCaches[currentTab] || channelEmoteCaches[getCurrentChannel()];
    if (chCache) for (const [k, v] of chCache) if (!allEmotes.has(k)) allEmotes.set(k, v);
    for (const [k, v] of emoteCache) if (!allEmotes.has(k)) allEmotes.set(k, v);
    const sections = groupEmotes(allEmotes);
    picker.innerHTML = `
      <div class="hs-mc-tab-content" id="hs-mc-tab-emotes" style="display: ${pickerTab === 'emotes' ? 'flex' : 'none'}; flex-direction: column;">
        <div class="hs-mc-picker-header">
          <div class="hs-mc-search-wrap">
            <svg class="hs-mc-search-icon" width="14" height="14" viewBox="0 0 20 20"><path fill="#000" d="M13.74 12.33l4.04 4.04a1 1 0 01-1.42 1.42l-4.04-4.04a7 7 0 111.42-1.42zM9 14A5 5 0 109 4a5 5 0 000 10z"/></svg>
            <input type="text" id="hs-mc-emote-search" placeholder="${t('mc_emote_search_placeholder')}" autocomplete="off">
          </div>
        </div>
        <div class="hs-mc-picker-scroll" id="hs-mc-emote-grid">
          ${renderEmoteSections(sections)}
        </div>
      </div>
      ${showTwitchTab ? `<div class="hs-mc-tab-content" id="hs-mc-tab-twitch" style="display: ${pickerTab === 'twitch' ? 'flex' : 'none'}; flex-direction: column; padding: 8px 0;">
        <div class="hs-mc-pred-loading">${t('common_loading')}</div>
      </div>
      <div class="hs-mc-picker-tabs">
        <button class="hs-mc-picker-tab ${pickerTab === 'emotes' ? 'active' : ''}" data-tab="emotes">emotes</button>
        <button class="hs-mc-picker-tab ${pickerTab === 'twitch' ? 'active' : ''}" data-tab="twitch">twitch</button>
      </div>` : ''}
    `;

    // Inject provider filter chips INSIDE the search wrap (not as a sibling
    // below it) so they sit on the right edge of the search input. Single
    // bordered row makes it unambiguous that these chips filter the search
    // input, not the emote grid below. Always visible on the emotes tab.
    const searchWrap = picker.querySelector('.hs-mc-search-wrap');
    if (searchWrap && !searchWrap.querySelector('.hs-mc-src-chips')) {
      const chipBar = document.createElement('div');
      chipBar.className = 'hs-mc-src-chips visible';
      chipBar.title = 'toggle which providers to search';
      for (const src of ['7tv', 'bttv', 'ffz']) {
        const btn = document.createElement('button');
        btn.className = 'hs-mc-src-chip' + (mcPickerSources.has(src) ? ' active' : '');
        btn.dataset.src = src;
        btn.textContent = src;
        btn.type = 'button';
        chipBar.appendChild(btn);
      }
      // Clicking a chip blurs the search input; preventDefault keeps focus.
      chipBar.addEventListener('mousedown', (e) => {
        if (e.target.closest('.hs-mc-src-chip')) e.preventDefault();
      });
      searchWrap.appendChild(chipBar);
    }

    // Source chip click handler — toggle, persist, re-search.
    picker.querySelectorAll('.hs-mc-src-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const src = chip.dataset.src;
        if (mcPickerSources.has(src)) mcPickerSources.delete(src);
        else mcPickerSources.add(src);
        chip.classList.toggle('active', mcPickerSources.has(src));
        mcSaveSources();
        const q = (document.getElementById('hs-mc-emote-search')?.value || '').toLowerCase().trim();
        if (!q) return;
        if (mcHasExternalSource()) mcTriggerProviderSearches(q);
        rerenderSearch(q);
      });
    });

    // Search functionality (debounced). When external chips are on the query
    // fires the provider APIs (7TV v4 / BTTV / FFZ) in parallel. Local-only
    // mode keeps the original instant filter behaviour.
    let _searchTimer = null;
    const searchInput = document.getElementById('hs-mc-emote-search');
    searchInput?.addEventListener('input', (e) => {
      cleanup.clearTimeout(_searchTimer);
      _searchTimer = cleanup.setTimeout(() => {
        const query = e.target.value.toLowerCase().trim();
        mcCurrentQuery = query;
        if (query && mcHasExternalSource()) {
          mcTriggerProviderSearches(query);
        } else {
          mcTriggerProviderSearches('');
        }
        rerenderSearch(query);
      }, 200);
    });

    // rerenderSearch is now module-scope (mcRerenderSearch) so async provider
    // result callbacks can call it directly.
    const rerenderSearch = mcRerenderSearch;

    // Emote size controls
    picker.querySelectorAll('.hs-mc-size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = parseInt(btn.dataset.size, 10);
        setEmoteSize(size);
        // Update active state
        picker.querySelectorAll('.hs-mc-size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Tab switching
    picker.querySelectorAll('.hs-mc-picker-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        const newTab = tabBtn.dataset.tab;
        const oldTab = pickerTab;
        pickerTab = newTab;
        picker.querySelectorAll('.hs-mc-picker-tab').forEach(t => t.classList.remove('active'));
        tabBtn.classList.add('active');
        picker.querySelectorAll('.hs-mc-tab-content').forEach(c => c.style.display = 'none');
        const display = (newTab === 'emotes' || newTab === 'settings' || newTab === 'twitch') ? 'flex' : 'block';
        document.getElementById(`hs-mc-tab-${newTab}`).style.display = display;
        if (newTab === 'twitch') renderTwitchTab();
        if (oldTab === 'twitch' && newTab !== 'twitch') stopPredictionPoll();
      });
    });

    // Event delegation for emote clicks (single handler, works for chunked rendering).
    // Bumped to v2 — the old `_hsDelegated` boolean property survives extension
    // reload (page owns the DOM), but the listener it tracked is destroyed with
    // the previous content-script context. Versioning forces re-attach when this
    // bundle's flag is missing.
    if (picker.dataset.hsClickVersion !== '2') {
      picker.dataset.hsClickVersion = '2';
      picker.addEventListener('click', (e) => {
        const img = e.target.closest('.hs-mc-picker-emote');
        if (!img) return;
        const name = img.dataset.name;
        const input = document.getElementById('hs-mc-input');
        if (!input || !name) return;

        // Remote (provider search) result — not yet in user's local emotes.
        // Optimistically register the emote in viewerPersonalEmotes so
        // pasteEmoteToInput resolves immediately (avoid the dead-click feel
        // from awaiting a network round-trip). The server-side add fires in
        // the background; on success the state is reconciled, on failure the
        // user still sees the emote (server sync re-evaluates next load).
        if (img.dataset.state === 'remote') {
          const remote = mcRemoteEmoteIndex.get(name);
          if (remote) {
            if (!viewerPersonalEmotes.has(name)) {
              viewerPersonalEmotes.set(name, {
                url: remote.url,
                source: remote.provider || '7tv',
                state: 'owned',
              });
            }
            addEmoteToInventory(name, remote.url, remote.provider, img).catch(() => {});
          }
        }

        if (wysiwygEnabled || !('value' in input)) {
          pasteEmoteToInput(name)
        } else {
          recordRecentEmote(name);
          const pos = input.selectionStart || input.value.length;
          const before = input.value.slice(0, pos);
          const after = input.value.slice(pos);
          const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
          input.value = before + space + name + ' ' + after;
          pendingMessage = input.value;
        }
        input.focus();
        picker.classList.remove('visible');
        adjustOverlayForPicker(false);
      });

      // Provider search results land asynchronously — re-render when each one
      // arrives so the user sees the picture filling out instead of waiting
      // for the slowest provider.
      cleanup.addEventListener(document, 'hs-mc-search-results-ready', (ev) => {
        if (ev.detail?.query !== mcCurrentQuery) return;
        mcRerenderSearch(mcCurrentQuery);
      }, 'mc-search-results-ready');
    }

    attachChunkObserver(picker);

    _pickerBuiltKey = pickerCacheKey();

    // Prebuild path stops here — DOM is ready, picker stays hidden.
    if (isPrebuild) return;

    picker.classList.add('visible');
    // Position picker flush above input bar (or at bottom if hidden)
    const bar = document.getElementById('hs-mc-inputbar');
    const barHeight = (bar && inputBarVisible) ? bar.offsetHeight : 0;
    picker.style.bottom = barHeight + 'px';
    adjustOverlayForPicker(true);

    if (pickerTab === 'twitch') renderTwitchTab();

    attachPickerCloseHandler(picker);
  }

  function attachPickerCloseHandler(picker) {
    if (_pickerCloseHandler) document.removeEventListener('click', _pickerCloseHandler);
    cleanup.setTimeout(() => {
      _pickerCloseHandler = (e) => {
        if (mcSignal?.aborted) { document.removeEventListener('click', _pickerCloseHandler); _pickerCloseHandler = null; return; }
        if (!picker.contains(e.target) && !e.target.closest('#hs-mc-emote-btn')) {
          picker.classList.remove('visible');
          adjustOverlayForPicker(false);
          hideInputBar();
          stopPredictionPoll();
          document.removeEventListener('click', _pickerCloseHandler);
          _pickerCloseHandler = null;
        }
      };
      cleanup.addEventListener(document, 'click', _pickerCloseHandler, 'mc-picker-close');
    }, 0);
  }

  /** Adjust overlay bottom to make room for picker panel */
  function adjustOverlayForPicker(open) {
    const overlay = document.getElementById('hs-mc-overlay');
    if (!overlay) return;
    // For vertical tabs (left/right), CSS handles overlay positioning — don't override
    if (tabPosition === 'left' || tabPosition === 'right') return;
    const hasBottomTabs = tabPosition === 'bottom';
    // Always reserve input bar space to prevent layout shift when it shows/hides
    const barBase = hasBottomTabs ? 90 : 52;
    const pickerEl = document.getElementById('hs-mc-emote-picker');
    const pickerHeight = open && pickerEl ? pickerEl.offsetHeight : 0;
    overlay.style.bottom = (barBase + pickerHeight) + 'px';
  }

  // Blocked emotes: stored by HASH (matches background.js/server)
  // blockedEmoteHashes = Set of hashes from storage
  // blockedEmoteNames = Set of names (derived via hashToName lookup, for processEmotes)
  let blockedEmoteHashes = new Set();
  let blockedEmoteNames = new Set();

  function rebuildBlockedNames() {
    blockedEmoteNames.clear();
    for (const hash of blockedEmoteHashes) {
      const name = hashToName.get(hash);
      if (name) blockedEmoteNames.add(name);
    }
    // Names persisted at block time — survive refresh even when hashToName can't
    // map the hash (blocked emote removed from set / not in any loaded cache).
    for (const name of blockedEmoteFallback.keys()) blockedEmoteNames.add(name);
    log('Blocked names rebuilt:', blockedEmoteNames.size, 'from', blockedEmoteHashes.size, 'hashes +', blockedEmoteFallback.size, 'fallback');
  }

  async function loadBlockedEmotes() {
    try {
      const data = await chrome.storage.local.get(['blocked_emotes']);
      blockedEmoteHashes = new Set(data.blocked_emotes || []);
      rebuildBlockedNames();
      log('Loaded', blockedEmoteHashes.size, 'blocked emote hashes');
    } catch (e) {
      log('Error loading blocked emotes:', e);
    }
  }

  // Diff-apply blocked changes from storage WITHOUT re-rendering the whole tab.
  // The full-rerender path in the storage onChanged listener was the source of
  // the right-click flicker (only at scroll-bottom, since renderMessages was
  // gated on !isScrolledUp) and could revert a fresh optimistic toggle if
  // storage hadn't caught up yet. This applies only the actual hash deltas.
  function applyBlockedHashDelta(newHashesArr) {
    const newSet = new Set(newHashesArr || []);
    const toBlock = [];
    for (const h of newSet) if (!blockedEmoteHashes.has(h)) toBlock.push(h);
    const toUnblock = [];
    for (const h of blockedEmoteHashes) if (!newSet.has(h)) toUnblock.push(h);
    if (toBlock.length === 0 && toUnblock.length === 0) return;
    const changedNames = [];

    for (const hash of toBlock) {
      const name = hashToName.get(hash);
      blockedEmoteHashes.add(hash);
      if (!name) continue;
      blockedEmoteNames.add(name);
      changedNames.push(name);
      queryEmoteWrappers(name).forEach(w => {
        if (w.classList.contains('hs-state-blocked')) return;
        w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded', 'hs-emote-highlight');
        w.classList.add('hs-state-blocked');
        w.dataset.state = 'blocked';
        const img = w.querySelector('img');
        if (img) {
          img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded');
          img.classList.add('hs-emote-blocked');
          img.dataset.state = 'blocked';
        }
      });
      applyInputEmoteBlockState(name, true);
    }

    for (const hash of toUnblock) {
      const name = hashToName.get(hash);
      blockedEmoteHashes.delete(hash);
      if (!name) continue;
      blockedEmoteNames.delete(name);
      changedNames.push(name);
      const emote = lookupEmote(name);
      const realUrl = emote?.url || '';
      // Mirror unblockEmote: block dropped this from the set, so restore to the
      // not-in-set tier (orange/unadded for heatsync) — never owned/green.
      const src = emote?.source || 'heatsync';
      const isThirdParty = ['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(src);
      if (!isThirdParty) inventoryEmotes.delete(name);
      const newState = isThirdParty ? getEmoteState(name, src) : 'unadded';
      queryEmoteWrappers(name).forEach(w => {
        if (w.classList.contains(`hs-state-${newState}`)) return;
        w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded', 'hs-emote-highlight');
        w.classList.add(`hs-state-${newState}`);
        w.dataset.state = newState;
        w.style.outline = '';
        const img = w.querySelector('img');
        if (img && realUrl) {
          img.src = realUrl;
          img.style.width = '';
          img.style.height = '';
          img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-blocked', 'hs-emote-unadded');
          img.classList.add(`hs-emote-${newState}`);
          img.dataset.state = newState;
        }
      });
      applyInputEmoteBlockState(name, false);
    }

    // Cached _renderedHtml on buffered messages bakes in `hs-state-blocked` from
    // the moment the message was first processed. Without invalidation, any later
    // re-render (clicking "new messages", tab switch, scroll resume) replays the
    // stale state for non-heatsync emotes — the post-render correction loop only
    // touches data-source="heatsync" wrappers. Invalidate ONLY the messages that
    // reference the changed emotes (no global epoch bump → no whole-chat rebuild
    // flash); live DOM was already corrected in-place above.
    if (typeof invalidateRenderedForEmotes === 'function') invalidateRenderedForEmotes(changedNames);
  }

  // Flash all wrappers for a given emote name. Also touches multichat input
  // chips (.hs-input-emote IMGs) so the user gets the same red/green ring
  // feedback on the emote they just blocked/unblocked from the input.
  function flashAllEmotes(emoteName, flashClass) {
    const wrappers = queryEmoteWrappers(emoteName)
    const inputImgs = []
    for (const img of document.querySelectorAll('img.hs-input-emote')) {
      if (img.alt === emoteName || img.dataset.emoteName === emoteName) inputImgs.push(img)
    }
    const targets = wrappers.length === 0 ? inputImgs : [...wrappers, ...inputImgs]
    if (targets.length === 0) return
    // Batch read/write to avoid per-element reflow
    for (const t of targets) {
      t.classList.remove('hs-flash-paste', 'hs-flash-add', 'hs-flash-block', 'hs-flash-unblock', 'hs-flash-remove');
    }
    // Single reflow trigger for all elements
    void document.body.offsetWidth
    for (const t of targets) {
      t.classList.add(flashClass);
      const clear = () => t.classList.remove(flashClass);
      t.addEventListener('animationend', clear, { once: true });
      // animationend never fires if the tab is backgrounded / the animation is
      // throttled mid-run, leaving a stuck glow that reads as jitter. Force-clear
      // just past the 0.4s animation window so the flash can never persist.
      cleanup.setTimeout(clear, 600);
    }
  }

  // Create emote <img> for WYSIWYG input. Resolves zero-width + "name0"
  // overlay convention so img.src points at the actual emote (TriHard) while
  // alt/dataset preserves the typed name (TriHard0) for round-trip on send.
  function createInputEmoteImg(emoteName) {
    const resolved = lookupEmoteWithOverlay(emoteName)
    if (!resolved) return null
    const { emote, isOverlay } = resolved
    const img = document.createElement('img')
    img.className = 'hs-input-emote'
    img.src = getChatResUrl(emote.url)
    img.alt = emoteName
    img.dataset.emoteName = emoteName
    img.draggable = false
    if (isOverlay) img.dataset.zeroWidth = '1'
    // Broken-image recovery — shared helper in input.js (cache-bust retry then
    // text fallback). Defined later in the bundle but function declarations
    // hoist to IIFE scope so it's available when this runs.
    if (typeof attachInputEmoteErrorRecovery === 'function') attachInputEmoteErrorRecovery(img)
    // If the emote was already blocked before this paste, apply the dashed
    // state from creation so the user never sees the live image flash.
    if (blockedEmoteNames.has(emoteName)) markInputEmoteBlocked(img, true)
    return img
  }

  // 1×1 transparent gif — swap src to this so the IMG box stays paintable
  // (visibility:hidden / opacity:0 would also drop the outline).
  const HS_TRANSPARENT_PX = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

  function markInputEmoteBlocked(img, blocked) {
    if (!img) return
    if (blocked) {
      if (img.dataset.hsInputBlocked === '1') return
      img.dataset.hsInputBlocked = '1'
      if (img.src && !img.src.startsWith('data:')) img.dataset.hsOrigSrc = img.src
      img.src = HS_TRANSPARENT_PX
      img.classList.add('hs-state-blocked')
      // dataset.state lets findEmoteTarget (input.js) and the chrome content.js
      // hover-overlay color picker route through the blocked branch even when
      // src is the transparent placeholder.
      img.dataset.state = 'blocked'
    } else {
      if (img.dataset.hsInputBlocked !== '1') return
      const orig = img.dataset.hsOrigSrc
      if (orig) img.src = orig
      delete img.dataset.hsInputBlocked
      delete img.dataset.hsOrigSrc
      img.classList.remove('hs-state-blocked')
      delete img.dataset.state
    }
  }

  // Update every .hs-input-emote IMG matching the name across both the
  // multichat input and any cycling/preview imgs that share the class. Match
  // by alt + dataset.emoteName (both set at creation; alt may be the typed
  // overlay name like "TriHard0" while dataset is identical).
  function applyInputEmoteBlockState(emoteName, blocked) {
    if (!emoteName) return
    const inputs = document.querySelectorAll('img.hs-input-emote')
    for (const img of inputs) {
      if (img.alt !== emoteName && img.dataset.emoteName !== emoteName) continue
      // Render the dashed box in place — same as chat/picker. The chip keeps its
      // alt/dataset.emoteName so getInputText still serializes the name on send
      // (recipient renders the emote unless they too blocked it). Removing the
      // chip instead left the contenteditable with a stale caret/draft, which
      // showed up as doubled overlapping text.
      markInputEmoteBlocked(img, blocked)
    }
  }

  // Stack a zero-width emote onto a base emote/stack in the input.
  // Tags the new overlay child with hs-input-overlay so CSS can render it at
  // native size (chat parity) while the base stays clamped to emote-size.
  function stackInputEmote(baseEl, overlayImg) {
    overlayImg.classList.add('hs-input-overlay')
    if (baseEl.classList.contains('hs-input-stack')) {
      baseEl.appendChild(overlayImg)
      return baseEl
    }
    const stack = document.createElement('span')
    stack.className = 'hs-input-stack'
    // Atomic inline unit — cursor can't enter, typed text stays on the
    // outside line instead of getting trapped as a child grid cell.
    stack.setAttribute('contenteditable', 'false')
    baseEl.parentNode.insertBefore(stack, baseEl)
    stack.appendChild(baseEl)
    stack.appendChild(overlayImg)
    return stack
  }

  // Find last emote element (img or stack) walking backwards, skipping whitespace
  function findLastInputEmote(input) {
    let node = input.lastChild
    while (node) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === '') {
        node = node.previousSibling
        continue
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && node.classList.contains('hs-input-emote')) return node
        if (node.classList?.contains('hs-input-stack')) return node
        // Emoji span is a valid overlay base (chat stacks overlays onto emoji).
        if (node.classList?.contains('hs-mc-emoji')) return node
      }
      break
    }
    return null
  }

  // Move cursor to end of input
  function cursorToEnd(input) {
    const range = document.createRange()
    range.selectNodeContents(input)
    range.collapse(false)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Paste emote name to input
  function pasteEmoteToInput(emoteName) {
    const input = document.getElementById('hs-mc-input');
    if (!input) return;
    recordRecentEmote(emoteName);
    if (wysiwygEnabled || !('value' in input)) {
      const img = createInputEmoteImg(emoteName)
      if (img) {
        // createInputEmoteImg already resolved overlay status (zeroWidth flag
        // OR "name0" convention) and tagged the img — reuse it for parity with
        // the typed live-replace path.
        const isZeroWidth = img.dataset.zeroWidth === '1'

        if (isZeroWidth) {
          const target = findLastInputEmote(input)
          if (target) {
            // Remove trailing whitespace between target and end
            let next = target.nextSibling
            while (next) {
              if (next.nodeType === Node.TEXT_NODE && next.textContent.trim() === '') {
                const rm = next
                next = next.nextSibling
                rm.remove()
              } else break
            }
            stackInputEmote(target, img)
            input.appendChild(document.createTextNode('\u00A0'))
            cursorToEnd(input)
            pendingMessage = getInputText()
            input.focus()
            return
          }
        }

        // Regular emote: append img + space
        input.appendChild(img)
        input.appendChild(document.createTextNode('\u00A0'))
        cursorToEnd(input)
      } else {
        // Fallback: emote not in cache, insert as text
        const text = input.textContent || ''
        const space = text.length > 0 && !text.endsWith(' ') ? ' ' : ''
        input.textContent = text + space + emoteName + ' '
        cursorToEnd(input)
      }
      pendingMessage = getInputText()
    } else {
      const pos = input.selectionStart || input.value.length;
      const before = input.value.slice(0, pos);
      const after = input.value.slice(pos);
      const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
      input.value = before + space + emoteName + ' ' + after;
      pendingMessage = input.value;
      input.selectionStart = input.selectionEnd = pos + space.length + emoteName.length + 1;
    }
    input.focus();
  }

  // Remove emote from inventory via background.js
  async function removeEmoteFromInventory(emoteName, targetEl) {
    if (!emoteName) return;
    pendingEmoteOps.add(emoteName);
    try { await _removeEmoteFromInventory(emoteName, targetEl) }
    finally { pendingEmoteOps.delete(emoteName) }
  }
  async function _removeEmoteFromInventory(emoteName, targetEl) {
    // Try inventoryHashes first, then wrapper's data-emote-hash, then emoteHashes, then lookup
    const wrapper = targetEl?.closest?.('.hs-mc-emote-wrapper') || targetEl;
    const emoteHash = inventoryHashes.get(emoteName)
      || wrapper?.dataset?.emoteHash
      || emoteHashes.get(emoteName)
      || lookupEmote(emoteName)?.hash
      || emoteName;
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'remove_from_inventory',
          emoteHash,
          emoteName
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      });
      if (response?.success) handleRemoveSuccess(emoteName, targetEl);
      else showToast(response?.error || `failed to remove: ${emoteName}`, 'error');
    } catch (e) {
      showToast(`error removing: ${emoteName}`, 'error');
    }
  }

  function handleRemoveSuccess(emoteName, targetEl) {
    inventoryEmotes.delete(emoteName);
    inventoryHashes.delete(emoteName);
    viewerPersonalEmotes.delete(emoteName);
    // Drop from the tab-complete auto-add registry — otherwise posting an emote you
    // just removed re-adds it on send (autoAddInputEmotes), fighting the removal and
    // leaving it in a half-owned/pending flux that errors on interaction until the
    // async re-add settles.
    if (typeof recentRemoteCompletions !== 'undefined') recentRemoteCompletions.delete(emoteName);
    // After viewerPersonalEmotes.delete above, lookupEmote falls back to
    // channelEmoteCaches / emoteCache / fallbacks. Old code split on source:
    // third-party (7tv/bttv/ffz) kept caches and re-stated to 'global'; heatsync
    // cleared everything and stated 'unadded'. The third-party branch was a trap
    // when stale channel cache entries existed — remove would silently flip to
    // 'global' (green) instead of 'unadded' (orange). Unify: clear all caches
    // and remember the removed entry. If a legit channel emote exists, the next
    // channel_emotes_update broadcast restores it; the gap is short and the
    // user actually gets the orange-unadded state they expect.
    const cachedEmote = lookupEmote(emoteName);
    if (cachedEmote) {
      cachedEmote.state = 'unadded';
      rememberRemovedEmote(emoteName, cachedEmote.url, cachedEmote.source, cachedEmote.zeroWidth);
    }
    emoteCache.delete(emoteName);
    for (const cache of Object.values(channelEmoteCaches)) {
      cache.delete(emoteName);
    }
    // Update all existing wrappers in DOM. If a lower-tier variant (channel/global)
    // exists with a different URL, swap img.src so the chat shows the fallback emote
    // (e.g. 7TV channel Pog) instead of leaving the heatsync image with a new class.
    const newState = 'unadded';
    const fallbackUrl = cachedEmote?.url;
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
      if (fallbackUrl) {
        const img = w.querySelector('img');
        if (img && img.src !== fallbackUrl) {
          img.src = fallbackUrl;
          img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-blocked', 'hs-emote-unadded');
          img.classList.add(`hs-emote-${newState}`);
          img.dataset.state = newState;
        }
        w.dataset.emoteUrl = fallbackUrl;
      }
    });
    // Refresh tooltip if visible (state text needs to update instantly)
    refreshEmoteTooltip(emoteName, newState);
    showToast(`removed: ${emoteName}`, 'success');
    flashAllEmotes(emoteName, 'hs-flash-remove');
  }

  function blockAllEmotesInStack(stack) {
    const wrappers = stack.querySelectorAll('.hs-mc-emote-wrapper');
    let count = 0;
    wrappers.forEach(w => {
      const name = w.dataset.emoteName;
      if (name && w.dataset.state !== 'blocked') {
        blockEmote(name, w.dataset.emoteUrl || w.querySelector('img')?.src, w.dataset.source);
        count++;
      }
    });
    if (count > 0) showToast(`blocked ${count} emotes`, 'success');
    stack.classList.remove('expanded');
    stack.setAttribute('title', 'expand');
  }

  function blockEmote(emoteName, clickedUrl, clickedSource) {
    if (!emoteName) return;

    // Capture url/source BEFORE the deletes below strip the emote from caches —
    // persists the name so the dashed box renders after refresh, and the url so
    // unblock + re-add can restore the real image. Prefer a cache hit, then the
    // url of the element that was clicked to block (a visible emote always has a
    // real url) — without this, blocking an emote that lookupEmote can't resolve
    // stored no url, leaving it un-re-addable (renders blank on re-add).
    const _be = lookupEmote(emoteName);
    const _httpOk = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
    const capturedUrl = _httpOk(_be?.url) ? _be.url : (_httpOk(clickedUrl) ? clickedUrl : '');
    rememberBlockedEmote(emoteName, capturedUrl, _be?.source || clickedSource, _be?.zeroWidth);

    // Blocking and owning are mutually exclusive
    inventoryEmotes.delete(emoteName);
    inventoryHashes.delete(emoteName);
    viewerPersonalEmotes.delete(emoteName);

    // Update local name-based tracking
    blockedEmoteNames.add(emoteName);

    // Get hash for API - prefer known hash, then url-derived (capturedUrl covers
    // the case lookupEmote misses), last resort the name.
    const hash = emoteHashes.get(emoteName) ||
      (capturedUrl ? btoa(capturedUrl).slice(0, 32) : emoteName);
    blockedEmoteHashes.add(hash);

    // Sync to heatsync.org API via background.js (it handles storage)
    syncBlockToAPI(emoteName, true);

    // Instant DOM update - CSS visibility:hidden hides the img, no src swap needed
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded', 'hs-emote-highlight');
      w.classList.add('hs-state-blocked');
      w.dataset.state = 'blocked';
      const img = w.querySelector('img');
      if (img) {
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded');
        img.classList.add('hs-emote-blocked');
        img.dataset.state = 'blocked';
      }
    });

    // Update any picker thumbnails for this emote (the existing wrapper update
    // path only touches chat messages, not the picker grid). Toggling state on
    // the img too so the global right-click handler reads it as 'blocked' and
    // routes to unblockEmote on the next right-click.
    try {
      document.querySelectorAll(`.hs-mc-picker-emote-wrap[data-name="${CSS.escape(emoteName)}"]`).forEach(w => {
        w.classList.add('blocked')
        const img = w.querySelector('img')
        if (img) img.dataset.state = 'blocked'
      })
    } catch {}

    applyInputEmoteBlockState(emoteName, true);

    refreshEmoteTooltip(emoteName, 'blocked');
    showToast(`blocked: ${emoteName}`, 'success');
    flashAllEmotes(emoteName, 'hs-flash-block');
    // Surgical: only re-key messages that reference this emote (no epoch bump →
    // no whole-chat rebuild flash). Live DOM already updated in-place above.
    if (typeof invalidateRenderedForEmotes === 'function') invalidateRenderedForEmotes(emoteName);
  }

  // Re-apply current state to all rendered wrappers for `emoteName`. Use after
  // inventory changes so already-posted messages flip the green 'owned' marker
  // to the orange 'unadded' marker (or back) without a full re-render. Never
  // overrides hs-state-blocked — that branch is owned by block/unblock.
  function refreshEmoteWrappersState(emoteName) {
    if (!emoteName) return
    const emote = lookupEmote(emoteName)
    const newState = emote ? getEmoteState(emoteName, emote.source) : 'unadded'
    queryEmoteWrappers(emoteName).forEach(w => {
      if (w.classList.contains('hs-state-blocked')) return
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-unadded')
      w.classList.add(`hs-state-${newState}`)
      w.dataset.state = newState
      const img = w.querySelector('img')
      if (img) {
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-unadded')
        img.classList.add(`hs-emote-${newState}`)
        img.dataset.state = newState
      }
    })
  }

  function unblockEmote(emoteName) {
    if (!emoteName) return;

    // Update local tracking
    blockedEmoteNames.delete(emoteName);
    const hash = emoteHashes.get(emoteName) ||
      (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
    blockedEmoteHashes.delete(hash);
    // Drop the persisted block fallback so it can't re-seed blockedEmoteNames on
    // the next refresh (which would re-hide an emote the user just unblocked).
    const _bfEmote = blockedEmoteFallback.get(emoteName);
    if (blockedEmoteFallback.delete(emoteName)) persistBlockedFallback();

    // Sync to heatsync.org API via background.js
    syncBlockToAPI(emoteName, false);

    // Instant DOM update - restore images. After refresh the emote is in no live
    // cache, so lookupEmote misses — fall back to the persisted block url.
    const emote = lookupEmote(emoteName);
    const realUrl = emote?.url || _bfEmote?.url || '';
    // Blocking removes the emote from the set (server-side too — background.js
    // drops it from emoteInventory on block). So unblock must land on the
    // "available, not in set" tier — orange/unadded — never straight
    // back to owned/green. Ladder is bidirectional:
    //   owned ⇄ (remove/add) ⇄ unadded ⇄ (block/unblock) ⇄ blocked
    // Force out of inventory so a stale membership flag can't snap green back.
    // Applies to BOTH heatsync and third-party sources — earlier code
    // special-cased third-party to getEmoteState (which returns 'global' for
    // 7tv/bttv/ffz with empty inventory). That made unblock → 'global' → next
    // right-click → block (else branch), trapping the user in green↔red with
    // no orange middle state.
    inventoryEmotes.delete(emoteName);
    const newState = 'unadded';
    queryEmoteWrappers(emoteName).forEach(w => {
      w.classList.remove('hs-state-global', 'hs-state-channel', 'hs-state-owned', 'hs-state-blocked', 'hs-state-unadded', 'hs-emote-highlight');
      w.classList.add(`hs-state-${newState}`);
      w.dataset.state = newState;
      w.style.outline = '';
      const img = w.querySelector('img');
      if (img && realUrl) {
        img.src = realUrl;
        img.style.width = '';
        img.style.height = '';
        img.classList.remove('hs-emote-global', 'hs-emote-channel', 'hs-emote-owned', 'hs-emote-blocked', 'hs-emote-unadded');
        img.classList.add(`hs-emote-${newState}`);
        img.dataset.state = newState;
      }
    });

    // Also drop the dashed outline on any picker thumbnails for this emote and
    // restore the img's state so future right-clicks route through the normal
    // (non-blocked) branch (which is no-op since picker emotes don't own state).
    try {
      document.querySelectorAll(`.hs-mc-picker-emote-wrap[data-name="${CSS.escape(emoteName)}"]`).forEach(w => {
        w.classList.remove('blocked')
        const img = w.querySelector('img')
        if (img) img.dataset.state = newState
      })
    } catch {}

    applyInputEmoteBlockState(emoteName, false);

    refreshEmoteTooltip(emoteName, newState);
    showToast(`unblocked: ${emoteName}`, 'success');
    flashAllEmotes(emoteName, 'hs-flash-unblock');
    if (typeof invalidateRenderedForEmotes === 'function') invalidateRenderedForEmotes(emoteName);
  }

  // Add emote to inventory (click-to-add for unadded emotes)
  async function addEmoteToInventory(emoteName, emoteUrl, emoteSource, targetEl) {
    if (!emoteName) return;
    // Guard: never persist a placeholder/data URI. A blocked emote renders with
    // a transparent px, and the click-to-readd path can hand us that src — adding
    // it would store a blank emote that renders empty forever (and the server
    // rejects non-https anyway). Reject early with a clear toast.
    if (!emoteUrl || !/^https?:\/\//i.test(emoteUrl)) {
      showToast(`can't add ${emoteName} — image unavailable`, 'error');
      return;
    }
    pendingEmoteOps.add(emoteName);
    try {
      // Generate a hash from the URL for the API
      const emoteHash = emoteUrl ? btoa(emoteUrl).slice(0, 32) : emoteName;

      // Send to background script for API call with auth
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'add_to_inventory',
          emoteName: emoteName,
          emoteHash: emoteHash,
          emoteUrl: emoteUrl
        }, resolve);
      });

      if (response?.success) {
        // Update local cache - change from unadded to owned
        // Adding and blocking are mutually exclusive
        blockedEmoteNames.delete(emoteName);
        // No longer "removed" or blocked — drop the stale render fallback entries.
        if (removedEmoteFallback.delete(emoteName)) persistRemovedFallback();
        if (blockedEmoteFallback.delete(emoteName)) persistBlockedFallback();
        const serverHash = response.hash || emoteHash;
        inventoryEmotes.add(emoteName);
        inventoryHashes.set(emoteName, serverHash);
        viewerPersonalEmotes.set(emoteName, { url: emoteUrl, source: emoteSource || 'heatsync', state: 'owned', hash: serverHash, slot: response.slot });
        if (emoteCache.has(emoteName)) {
          const cached = emoteCache.get(emoteName);
          cached.state = 'owned';
          if (!cached.hash) cached.hash = serverHash;
        }
        // Update hash lookup maps (bounded to emoteCache size)
        emoteHashes.set(emoteName, serverHash);
        hashToName.set(serverHash, emoteName);
        while (emoteHashes.size > 2000) { emoteHashes.delete(emoteHashes.keys().next().value) }
        while (hashToName.size > 2000) { hashToName.delete(hashToName.keys().next().value) }

        // Update all wrappers in DOM (no full re-render)
        queryEmoteWrappers(emoteName).forEach(w => {
          w.classList.remove('hs-state-global', 'hs-state-unadded', 'hs-state-blocked');
          w.classList.add('hs-state-owned');
          w.dataset.state = 'owned';
        });

        refreshEmoteTooltip(emoteName, 'owned');
        showToast(`added: ${emoteName}`, 'success');
        flashAllEmotes(emoteName, 'hs-flash-add');
      } else {
        showToast(response?.error || `failed to add: ${emoteName}`, 'error');
      }
    } catch (e) {
      log('Add emote error:', e);
      showToast(`error adding: ${emoteName}`, 'error');
    } finally {
      pendingEmoteOps.delete(emoteName);
    }
  }

  // Sync block/unblock to heatsync.org API via background script
  async function syncBlockToAPI(emoteName, block) {
    try {
      // Background script expects message.hash - use emoteHashes (most complete mapping)
      const hash = emoteHashes.get(emoteName) ||
        (lookupEmote(emoteName)?.url ? btoa(lookupEmote(emoteName).url).slice(0, 32) : emoteName);
      chrome.runtime.sendMessage({
        type: block ? 'block_emote' : 'unblock_emote',
        hash: hash,
        emoteName: emoteName
      }).catch(() => {});
      log('Synced', block ? 'block' : 'unblock', emoteName, '(hash:', hash.substring(0, 8) + '...) to API');
    } catch (e) {
      log('API sync error:', e);
    }
  }

  // Emote cache (loaded from storage)
  // Format: Map<name, {url, source, state}>
  // States: 'owned' (in inventory), 'global' (third-party), 'unadded' (heatsync, not owned)
  let emoteCache = new Map(); // Globals only — heatsync globals + 7TV globals + native Twitch (NO viewer inventory, NO channel)
  let channelEmoteCaches = {}; // Per-channel emotes: { channelName: Map<name, emoteData> }
  let inventoryEmotes = new Set(); // Names of emotes in user's inventory
  // Viewer's personal set — separated from emoteCache so it does NOT bleed into
  // OTHER users' rendered messages. Used as senderEmotes only when sender == viewer.
  let viewerPersonalEmotes = new Map(); // Map<name, emoteData>
  // Render fallback for emotes the viewer REMOVED from their set. Removing purges
  // the emote from inventory/caches, so after a refresh the viewer's own past
  // messages that used it would resolve to nothing and render as raw text. This
  // bounded, persisted map keeps the URL resolvable so those messages still draw
  // the image (as unadded/orange — not owned). Gated to the viewer's own messages
  // in processEmotes so it never bleeds into other senders' rendering.
  let removedEmoteFallback = new Map(); // Map<name, {url, source, zeroWidth}>
  const REMOVED_FALLBACK_CAP = 1000;
  let _removedFallbackPersistTimer = null;
  function persistRemovedFallback() {
    if (_removedFallbackPersistTimer) return;
    _removedFallbackPersistTimer = cleanup.setTimeout(() => {
      _removedFallbackPersistTimer = null;
      const obj = {};
      for (const [name, e] of removedEmoteFallback) obj[name] = e;
      try { chrome.storage.local.set({ hs_removed_emote_fallback: obj }); } catch {}
    }, 1000);
  }
  function rememberRemovedEmote(name, url, source, zeroWidth) {
    if (!name || !url) return;
    removedEmoteFallback.delete(name); // re-insert to refresh LRU position
    // removedAt: gate processEmotes so the fallback only fills in messages
    // that pre-date the removal (preserves past-history rendering, per intent).
    // Newly-sent own messages stay raw — removing means "I don't want this in
    // chat anymore", so a re-post shouldn't silently re-render the image.
    removedEmoteFallback.set(name, { url, source: source || 'heatsync', zeroWidth: !!zeroWidth, state: 'unadded', removedAt: Date.now() });
    while (removedEmoteFallback.size > REMOVED_FALLBACK_CAP) {
      removedEmoteFallback.delete(removedEmoteFallback.keys().next().value);
    }
    persistRemovedFallback();
  }

  // Block-state render fallback. Blocking strips the emote from inventory/caches,
  // and blockedEmoteNames is otherwise reconstructed from blockedEmoteHashes via
  // hashToName — which can't recover a name after refresh when the emote is in no
  // loaded cache (removed from set, foreign channel). The name is then unknown, so
  // the blocked-box render branch never fires and the token leaks as raw text. This
  // bounded, persisted map keeps the NAME (and url/source, for inline unblock-restore)
  // so the 2px dashed box survives refresh. Mirror of removedEmoteFallback.
  let blockedEmoteFallback = new Map(); // Map<name, {url, source, zeroWidth}>
  const BLOCKED_FALLBACK_CAP = 1000;
  let _blockedFallbackPersistTimer = null;
  function persistBlockedFallback() {
    if (_blockedFallbackPersistTimer) return;
    _blockedFallbackPersistTimer = cleanup.setTimeout(() => {
      _blockedFallbackPersistTimer = null;
      const obj = {};
      for (const [name, e] of blockedEmoteFallback) obj[name] = e;
      try { chrome.storage.local.set({ hs_blocked_emote_fallback: obj }); } catch {}
    }, 1000);
  }
  function rememberBlockedEmote(name, url, source, zeroWidth) {
    if (!name) return; // url optional — a name with no resolvable url still needs the box
    blockedEmoteFallback.delete(name); // re-insert to refresh LRU position
    blockedEmoteFallback.set(name, { url: url || '', source: source || 'heatsync', zeroWidth: !!zeroWidth });
    while (blockedEmoteFallback.size > BLOCKED_FALLBACK_CAP) {
      blockedEmoteFallback.delete(blockedEmoteFallback.keys().next().value);
    }
    persistBlockedFallback();
  }
  // Viewer's per-channel Twitch IRC badges. Populated from USERSTATE messages
  // (sent on JOIN + after every viewer PRIVMSG). Used to gate Twitch native
  // sub-emote clicks: no `subscriber`/`founder` badge → render as locked.
  // Map<channel, Set<badgeName>>.
  let viewerBadgesPerChannel = new Map();
  // Per-sender fetched 7TV/BTTV personal sets — write-once-per-(key, name), persistent across sessions.
  // Map<"platform:platform_user_id", Map<name, emoteData>>. Empty inner Map = sender has no personal set (cached miss).
  // Platform prefixes: "twitch:", "kick:", "yt:" (yt uses resolved twitch_id when available).
  // Loaded fully at boot from chrome.storage.local["sender_emote_sets"] BEFORE first render → survives hard refresh.
  const senderEmoteSets = new Map();
  const SENDER_EMOTE_LRU_MAX = 5000;
  let _senderEmotePersistTimer = null;
  let _senderEmoteDirty = false;

  function _scheduleSenderEmotePersist() {
    if (_senderEmotePersistTimer || !_senderEmoteDirty) return;
    _senderEmotePersistTimer = cleanup.setTimeout(() => {
      _senderEmotePersistTimer = null;
      if (!_senderEmoteDirty) return;
      _senderEmoteDirty = false;
      const out = {};
      for (const [k, m] of senderEmoteSets) {
        out[k] = Object.fromEntries(m);
      }
      try { chrome.storage.local.set({ sender_emote_sets: out }) } catch {}
    }, 500);
  }

  // Merge a sender's fetched set, UPDATING entries whose url/state/source changed
  // (a re-fetch picks up emotes the sender added AND state/label corrections). Names
  // absent from a fetch are kept — an empty/partial fetch never wipes known emotes.
  // The set keeps rendering throughout; only changed names trigger a re-render.
  function mergeSenderEmotes(senderKey, nameToEmote) {
    if (!senderKey) return false;
    let inner = senderEmoteSets.get(senderKey);
    if (!inner) {
      inner = new Map();
      senderEmoteSets.set(senderKey, inner);
      // LRU evict oldest senders if over cap (preserves all names per kept sender)
      if (senderEmoteSets.size > SENDER_EMOTE_LRU_MAX) {
        senderEmoteSets.delete(senderEmoteSets.keys().next().value);
      }
    } else {
      // Re-insert to bump LRU recency
      senderEmoteSets.delete(senderKey);
      senderEmoteSets.set(senderKey, inner);
    }
    let changed = false;
    if (nameToEmote) {
      for (const [name, data] of Object.entries(nameToEmote)) {
        const prev = inner.get(name);
        if (!prev || prev.url !== data.url || prev.state !== data.state || prev.source !== data.source) {
          inner.set(name, data); changed = true;
        }
      }
    }
    if (changed) { _senderEmoteDirty = true; _scheduleSenderEmotePersist(); }
    return changed;
  }

  function getSenderEmotes(senderKey) {
    return senderKey ? senderEmoteSets.get(senderKey) : undefined;
  }

  // Drop an emote NAME from every cached sender set. Called when a WS
  // emote:removed broadcast arrives — the actor's user_emote_set on the server
  // dropped the name, but cached entries here would otherwise render the name
  // as an image for up to a session (LRU lifetime). Match by name is fine: a
  // sender can only have one emote per name, so dropping by name targets the
  // right entry without needing the actor's twitch ID.
  function dropEmoteFromAllSenders(emoteName) {
    if (!emoteName) return false
    let changed = false
    for (const [, set] of senderEmoteSets) {
      if (set?.delete?.(emoteName)) changed = true
    }
    if (changed) { _senderEmoteDirty = true; _scheduleSenderEmotePersist() }
    return changed
  }

  // Replace a sender's set with an AUTHORITATIVE fresh fetch — drops any
  // cached names absent from the new data. Use ONLY when the response is
  // known good (HTTP 200, not a transient error). mergeSenderEmotes is the
  // additive sibling for cases where we don't trust empty responses.
  // Returns true if anything changed.
  function replaceSenderEmotes(senderKey, nameToEmote) {
    if (!senderKey) return false
    const fresh = nameToEmote || {}
    let inner = senderEmoteSets.get(senderKey)
    if (!inner) {
      // First time we see this sender — same path as merge, but tracked.
      inner = new Map()
      senderEmoteSets.set(senderKey, inner)
      if (senderEmoteSets.size > SENDER_EMOTE_LRU_MAX) {
        senderEmoteSets.delete(senderEmoteSets.keys().next().value)
      }
    } else {
      senderEmoteSets.delete(senderKey)
      senderEmoteSets.set(senderKey, inner)
    }
    let changed = false
    // Drop stale names
    for (const name of [...inner.keys()]) {
      if (!(name in fresh)) { inner.delete(name); changed = true }
    }
    // Add/update fresh names
    for (const [name, data] of Object.entries(fresh)) {
      const prev = inner.get(name)
      if (!prev || prev.url !== data.url || prev.state !== data.state || prev.source !== data.source) {
        inner.set(name, data); changed = true
      }
    }
    if (changed) { _senderEmoteDirty = true; _scheduleSenderEmotePersist() }
    return changed
  }

  async function loadSenderEmoteSets() {
    try {
      const stored = await chrome.storage.local.get(['sender_emote_sets']);
      senderEmoteSets.clear();
      // Load the persisted cache so senders render IMMEDIATELY on boot. Staleness
      // is handled non-destructively: the in-memory freshness map is empty after a
      // reload, so every sender is re-fetched once this session, and mergeSenderEmotes
      // UPDATES changed entries in place (no discard → no text gap while refreshing).
      const obj = stored.sender_emote_sets || {};
      for (const [k, names] of Object.entries(obj)) {
        if (!names || typeof names !== 'object') continue;
        senderEmoteSets.set(k, new Map(Object.entries(names)));
      }
      log('Loaded sender_emote_sets:', senderEmoteSets.size, 'senders');
    } catch (e) {
      log('Error loading sender_emote_sets:', e);
    }
  }

  // Look up emote — viewer-perspective fallback chain (used by picker, hover preview, etc.)
  function lookupEmote(name) {
    // removed/blocked fallbacks last: keep a removed-or-blocked emote's URL
    // resolvable so unblock + re-add (and re-renders) draw the real image and
    // never re-add the transparent placeholder a blocked render shows.
    return viewerPersonalEmotes.get(name) || emoteCache.get(name) || channelEmoteCaches[currentTab]?.get(name) || channelEmoteCaches[getLiveChannel()]?.get(name) || channelEmoteCaches[getCurrentChannel()]?.get(name) || removedEmoteFallback.get(name) || blockedEmoteFallback.get(name);
  }
  // In-set lookup: only emotes the viewer actually owns (heatsync inventory +
  // their native Twitch subs). Excludes channel/global/3rd-party pools — those
  // are words a viewer never deliberately added (e.g. a channel's lowercase
  // "what" 7TV emote), so silently imagifying them mid-sentence is hostile.
  function lookupOwnedEmote(name) {
    return viewerPersonalEmotes.get(name)
  }
  // True if ANY cache knows this emote name is 7TV zero-width. The owned set
  // (viewerPersonalEmotes) and the heatsync server cache don't carry 7TV's
  // zeroWidth flag, and viewerPersonalEmotes is resolved FIRST — so an overlay
  // emote you OWN (e.g. "Wave") otherwise resolves zeroWidth:false and renders
  // inline. The channel/global caches fetch the flag straight from 7TV, so
  // consult them to recover it.
  function zeroWidthFromAnyCache(name) {
    if (emoteCache.get(name)?.zeroWidth) return true
    for (const m of Object.values(channelEmoteCaches)) {
      if (m && typeof m.get === 'function' && m.get(name)?.zeroWidth) return true
    }
    return false
  }
  // Resolve a typed emote name to {emote, isOverlay, displayName}.
  // Handles zeroWidth flag AND the 7TV-style "name0" overlay convention
  // ("TriHard0" → looks up "TriHard" and treats as overlay) so the input
  // preview matches how the chat renderer resolves the same word.
  // ownedOnly restricts resolution to the viewer's own set — used by the LIVE
  // type-word-then-space auto-convert so only your emotes imagify as you type.
  // Channel/global emotes still render via Tab-complete (which omits the flag).
  function lookupEmoteWithOverlay(name, { ownedOnly = false } = {}) {
    const resolve = ownedOnly ? lookupOwnedEmote : lookupEmote
    const endsWithZero = name.length > 1 && name.endsWith('0')
    let emote = resolve(name)
    // Mirror processEmotes (chat render): a direct hit ending in "0" is an
    // overlay even without the zeroWidth flag (7TV "name0" convention). Without
    // this, an emote literally named "fog0" rendered inline in the input box
    // while chat stacked it.
    let isOverlay = !!emote?.zeroWidth || (!!emote && endsWithZero)
    // Owned/personal cache shadows the flagged channel/global copy without the
    // 7TV zeroWidth flag — recover it so an overlay emote you own still stacks.
    if (emote && !isOverlay && zeroWidthFromAnyCache(name)) isOverlay = true
    if (!emote && endsWithZero) {
      const baseName = name.slice(0, -1)
      const baseEmote = resolve(baseName)
      if (baseEmote) {
        emote = baseEmote
        isOverlay = true
      }
    }
    return emote ? { emote, isOverlay, displayName: name } : null
  }
  let inventoryHashes = new Map(); // name → hash for remove_from_inventory
  let emoteHashes = new Map(); // name → hash for ALL emotes (block/unblock API)
  let hashToName = new Map(); // hash → name (reverse lookup for loading blocked from storage)

  // Detect emote source from URL
  function detectEmoteSource(url, hint = null) {
    if (!url) return hint || 'unknown';
    if (url.includes('cdn.7tv.app')) return '7tv';
    if (url.includes('cdn.betterttv.net')) return 'bttv';
    if (url.includes('cdn.frankerfacez.com')) return 'ffz';
    if (url.includes('static-cdn.jtvnw.net')) return 'twitch';
    if (url.includes('kick.com') || url.includes('kick-static')) return 'kick';
    if (url.includes('heatsync.org')) return 'heatsync';
    return hint || 'unknown';
  }

  // Determine emote state: owned > global > unadded
  function getEmoteState(name, source) {
    if (inventoryEmotes.has(name)) return 'owned';
    // Third-party emotes are always "global" (can't add to heatsync inventory)
    if (['7tv', 'bttv', 'ffz', 'twitch', 'kick'].includes(source)) return 'global';
    // Heatsync emotes not in inventory are "unadded"
    return 'unadded';
  }

  // Build a single channel's emote cache from a flat emotes array. Shared
  // between loadEmotes (cold-start from storage) and the live broadcast handler
  // in main.js so a channel_emotes_update lands directly in channelEmoteCaches
  // — no waiting on the BG storage.set, no race where a partial broadcast
  // triggers loadEmotes against still-stale storage.
  function _buildChannelEmoteCache(ch, emotes) {
    if (!ch || !Array.isArray(emotes)) return
    const chCache = new Map()
    for (const e of emotes) {
      if (!e.name || !e.url) continue
      if (e.source === 'twitch' && (e.tier || e.emote_type === 'subscriptions' || e.emote_type === 'follower' || e.emote_type === 'bitstier')) continue
      const source = e.source || detectEmoteSource(e.url, '7tv')
      const state = inventoryEmotes.has(e.name) ? 'owned' : 'channel'
      chCache.set(e.name, { url: e.url, source, state, zeroWidth: !!e.zeroWidth })
      if (e.hash) {
        emoteHashes.set(e.name, e.hash)
        hashToName.set(e.hash, e.name)
      }
    }
    channelEmoteCaches[ch] = chCache
    const keys = Object.keys(channelEmoteCaches)
    if (keys.length > 20) {
      for (const old of keys.slice(0, keys.length - 20)) {
        if (old !== ch) delete channelEmoteCaches[old]
      }
    }
  }

  async function loadEmotes() {
    try {
      const stored = await chrome.storage.local.get(['global_emotes', 'emote_inventory', 'channel_emotes_map', 'native_twitch_emotes', 'hs_removed_emote_fallback', 'hs_blocked_emote_fallback']);
      // Restore removed-emote render fallback (persists across refresh).
      removedEmoteFallback.clear();
      const rf = stored.hs_removed_emote_fallback;
      if (rf && typeof rf === 'object') {
        for (const [name, e] of Object.entries(rf)) {
          if (e && e.url) removedEmoteFallback.set(name, { url: e.url, source: e.source || 'heatsync', zeroWidth: !!e.zeroWidth, state: 'unadded', removedAt: Number(e.removedAt) || 0 });
        }
      }
      // Restore block-state render fallback so the dashed box survives refresh
      // (rebuildBlockedNames at the tail of this fn seeds blockedEmoteNames from it).
      blockedEmoteFallback.clear();
      const bf = stored.hs_blocked_emote_fallback;
      if (bf && typeof bf === 'object') {
        for (const [name, e] of Object.entries(bf)) {
          if (e) blockedEmoteFallback.set(name, { url: e.url || '', source: e.source || 'heatsync', zeroWidth: !!e.zeroWidth });
        }
      }
      emoteCache.clear();
      // Don't wipe channelEmoteCaches — live broadcasts may have direct-
      // populated a channel that storage hasn't persisted yet (BG writes
      // storage AFTER the final broadcast). Wiping would clobber it; the
      // loop below refreshes each channel that storage knows about.
      // Preserve in-flight optimistic preregister entries (autoAddInputEmotes
      // sets viewerPersonalEmotes BEFORE the server add resolves so the IRC
      // echo of "wavE" renders the image, not the bare word). Without this
      // snapshot, an unrelated storage change (channel emote refresh, global
      // update) racing the add wipes the optimistic entry before the echo
      // arrives → message renders as plain text. pendingEmoteOps tracks names
      // whose addEmoteToInventory is still in flight; restored at the bottom.
      const _inflight = new Map()
      for (const name of pendingEmoteOps) {
        const e = viewerPersonalEmotes.get(name)
        if (e) _inflight.set(name, e)
      }
      inventoryEmotes.clear();
      viewerPersonalEmotes.clear();
      inventoryHashes.clear();
      emoteHashes.clear();
      hashToName.clear();

      // Helper to register hash<->name mapping
      const registerHash = (name, hash) => {
        if (name && hash) {
          emoteHashes.set(name, hash);
          hashToName.set(hash, name);
        }
      };

      // First, build inventory set (emotes user owns)
      (stored.emote_inventory || []).forEach(e => {
        if (e.name) {
          inventoryEmotes.add(e.name);
          if (e.hash) {
            inventoryHashes.set(e.name, e.hash);
            registerHash(e.name, e.hash);
          }
        }
      });

      // Add global emotes (heatsync globals - may or may not be in inventory)
      (stored.global_emotes || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || detectEmoteSource(e.url, 'heatsync');
          const state = getEmoteState(e.name, source);
          emoteCache.set(e.name, { url: e.url, source, state, zeroWidth: !!e.zeroWidth });
          while (emoteCache.size > 2000) { emoteCache.delete(emoteCache.keys().next().value) }
          if (e.hash) registerHash(e.name, e.hash);
        }
      });

      // Add inventory emotes (definitely owned) → viewerPersonalEmotes ONLY.
      // Keeping these out of emoteCache (the global fallback) is what prevents
      // viewer's personal '67' from bleeding into other users' messages.
      // Render path passes viewerPersonalEmotes as senderEmotes for own outgoing,
      // and lookupEmote() composes both for picker/hover/UI use cases.
      (stored.emote_inventory || []).forEach(e => {
        if (e.name && e.url) {
          const source = e.source || 'heatsync';
          viewerPersonalEmotes.set(e.name, { url: e.url, source, state: 'owned', zeroWidth: !!e.zeroWidth, subscription: !!e.subscription, slot: e.slot });
        }
      });

      // Load per-channel emotes into separate caches (prevents cross-channel leaking)
      const map = stored.channel_emotes_map || {};
      for (const [ch, emotes] of Object.entries(map)) {
        if (!Array.isArray(emotes)) continue; // skip 'loading' sentinels
        _buildChannelEmoteCache(ch, emotes)
      }

      // Native Twitch emotes — sub emotes carry e.owner (broadcaster login),
      // true Twitch globals do not. Globals → emoteCache (everyone can render them).
      // Subs → viewerPersonalEmotes: same gate as heatsync inventory — surfaced
      // for picker/autocomplete/own outgoing, kept out of the global render
      // fallback so they don't bleed into other senders' messages.
      (stored.native_twitch_emotes || []).forEach(e => {
        if (!e.name || !e.url) return;
        const isSub = !!e.owner
        if (isSub) {
          if (!viewerPersonalEmotes.has(e.name)) {
            viewerPersonalEmotes.set(e.name, {
              url: e.url, source: 'twitch', state: 'owned', subscription: true, owner: e.owner
            })
            if (e.hash) registerHash(e.name, e.hash);
          }
          return
        }
        if (emoteCache.has(e.name)) return
        emoteCache.set(e.name, { url: e.url, source: 'twitch', state: 'global' });
        while (emoteCache.size > 2000) { emoteCache.delete(emoteCache.keys().next().value) }
        if (e.hash) registerHash(e.name, e.hash);
      });

      // Restore in-flight optimistic preregister entries that the clear()
      // above wiped — server hasn't confirmed yet, so they're not in stored.
      // Without this, the IRC echo of an auto-add emote misses the lookup
      // and the message renders as plain text instead of the image.
      for (const [name, e] of _inflight) {
        if (!viewerPersonalEmotes.has(name)) viewerPersonalEmotes.set(name, e)
      }

      // Rebuild blockedEmoteNames from loaded hashes
      rebuildBlockedNames();

      log('Loaded', emoteCache.size, 'emotes (inventory:', inventoryEmotes.size, ', hashes:', emoteHashes.size, ')');
    } catch (e) {
      log('Error loading emotes:', e);
    }

    // Also scan DOM for third-party emotes (BTTV, FFZ, 7TV)
    scanDomForEmotes();

    // Picker DOM is now stale — schedule an idle prebuild so the very first
    // click after page load opens the picker instantly (no parse on click).
    markPickerDirty();
    prebuildPickerIdle();
  }

  // Scan DOM for emotes rendered in chat — route to the current channel's cache, not global
  function scanDomForEmotes() {
    const ch = getCurrentChannel();
    if (!ch) return;

    // Ensure channel cache exists
    if (!channelEmoteCaches[ch]) channelEmoteCaches[ch] = new Map();
    // Evict oldest if exceeds 20
    const chKeys = Object.keys(channelEmoteCaches);
    if (chKeys.length > 20) {
      delete channelEmoteCaches[chKeys[0]];
    }
    const cache = channelEmoteCaches[ch];

    // Cap per-channel to prevent unbounded growth
    if (cache.size >= 5000) return;

    // Single combined selector — one DOM scan instead of 7 separate querySelectorAll calls
    const combinedSelector = '.chat-line__message img[alt], [class*="chat-line"] img[alt], .seventv-emote, .bttv-emote, .ffz-emote, img.emote, img[data-a-target="emote-name"]';

    let found = 0;
    for (const img of document.querySelectorAll(combinedSelector)) {
      if (cache.size >= 5000) break;
      const name = img.alt || img.getAttribute('data-emote-name');
      const url = img.src;
      if (name && url && !cache.has(name) && !emoteCache.has(name)) {
        const source = detectEmoteSource(url);
        // Twitch native emotes are entitlement-gated server-side and arrive
        // per-message via the IRC emotes= tag (twitchExtra). Skipping them
        // here prevents non-entitled senders' text from re-imagifying via
        // this fallback cache.
        if (source === 'twitch') continue;
        // 7TV/BTTV/FFZ channel emotes are authoritatively fetched by the
        // background's fetchChannelOwnerEmotes. The DOM scan would otherwise
        // capture other browser extensions' renders of personal emotes (e.g.
        // 7TV browser ext rendering the viewer's own posted emote) and stamp
        // them into channelEmoteCaches as if they were channel-wide. That
        // leaks the viewer's set into every sender's message in this channel.
        if (source === '7tv' || source === 'bttv' || source === 'ffz') continue;
        cache.set(name, { url, source, state: getEmoteState(name, source), zeroWidth: false });
        found++;
      }
    }

    if (found > 0) {
      log('Scanned', found, 'emotes from DOM ->', ch, ', total:', cache.size);
      // Channel cache grew → picker is stale; queue an idle rebuild so the
      // next open already reflects the new emotes.
      markPickerDirty();
      prebuildPickerIdle();
    }
  }

  // Periodically scan for new emotes
  cleanup.setIntervalIfVisible(scanDomForEmotes, 10000);

  // Process text and replace emote codes with images.
  // Supports 7TV zero-width (overlay) emotes that stack on base emotes.
  // Resolution priority (perma sender model): senderEmotes > channel > extraCache (native twitch IRC) > emoteCache (globals)
  // - extraCache: optional Map<name, emoteData> for per-message Twitch IRC tag emotes
  // - senderEmotes: optional Map<name, emoteData> — sender's personal set frozen at first sight.
  //   For viewer's own outgoing messages, caller passes viewerPersonalEmotes here.
  //   For others' messages, caller passes their fetched 7TV/BTTV personal set (or empty Map if not yet known).
  // FFZ/BTTV-style modifier helpers — bridged to lib/modifiers.js
  // (HS_MOD_TOKENS, hsModClassify, hsModBuildStyleAttr, hsModInjectWrapperStyle,
  // hsModComposeFilter, hsModHexToHue) are bundled by build.js.
  const HS_MC_MODS = HS_MOD_TOKENS
  const HS_MC_C_RE = HS_MOD_C_HEX_RE
  function _hsMcHexToHue(h) { return hsModHexToHue(h) }
  function _hsMcApplyMods(html, mods, hue) {
    if ((!mods || !mods.length) && hue == null) return html
    const imgFilter = hsModComposeFilter(mods, hue)
    const hasImg = /<img(\s|>)/.test(html)
    // Emoji spans have no <img> — fold the filter into the wrapper span style
    // (transform + margins always go on the wrapper anyway).
    const wrapperStyle = hsModBuildStyleAttr(mods, null) +
      (!hasImg && imgFilter ? `filter:${imgFilter} !important;` : '')
    let out = html
    if (wrapperStyle) out = hsModInjectWrapperStyle(out, wrapperStyle)
    if (imgFilter && hasImg) {
      out = out.replace(/<img(\s)/, `<img style="filter:${imgFilter} !important;"$1`)
    }
    return out
  }

  function processEmotes(text, channel, extraCache, senderEmotes, msgTime) {
    if (emoteCache.size === 0 && !channelEmoteCaches[channel] && !extraCache?.size && !senderEmotes?.size) return text;
    // Removed-emote render fallback applies ONLY to the viewer's own messages
    // (main.js passes viewerPersonalEmotes by reference for isOwn). Keeps removed
    // heatsync emotes drawing in the viewer's history without leaking into others.
    // Gated additionally by msgTime: fallback applies only to messages that
    // pre-date the removal — newly-sent posts after remove stay raw.
    const _rf = senderEmotes === viewerPersonalEmotes ? removedEmoteFallback : null;
    const _rfGate = (entry) => {
      if (!entry) return null;
      if (typeof msgTime !== 'number' || !entry.removedAt) return entry; // unknown time → preserve old behavior
      return msgTime < entry.removedAt ? entry : null;
    };

    // Kick emote splits gated by indexOf — Kick text is <5% of overall msg volume;
    // skipping 3 replaces on Twitch/YT messages saves allocations per message.
    // Unicode emoji split always applies: separate emoji from adjacent non-emoji.
    // Multi-codepoint sequences (skin tone, ZWJ, VS16) stay intact.
    let pre = text
    if (pre.indexOf('[emote:') !== -1) {
      pre = pre
        .replace(/\]\[emote:/g, '] [emote:')
        .replace(/([^\s\[])\[emote:/g, '$1 [emote:')
        .replace(/\]([^\s\]])/g, '] $1')
    }
    // ASCII fast-path: skip the two Unicode-property emoji-split regexes when
    // the message has no high-byte characters. Pure-ASCII messages are the
    // overwhelming majority of Twitch/Kick traffic; the /gu lookbehind regex
    // is the single most expensive per-message operation otherwise.
    let words
    let asciiOnly = true
    for (let i = 0; i < pre.length; i++) {
      if (pre.charCodeAt(i) > 127) { asciiOnly = false; break }
    }
    if (asciiOnly) {
      words = pre.split(/(\s+)/)
    } else {
      words = pre
        .replace(/([\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F])(?=[^\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D])/gu, '$1 ')
        .replace(/([^\s\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D])(?=\p{Extended_Pictographic})/gu, '$1 ')
        .split(/(\s+)/);
    }
    const result = [];
    // pendingStack tracks an items list. Each item (base OR overlay) has its
    // OWN mods/hue. Modifier tokens attach to the LAST item — so
    // "Kappa RainTime w!" makes RainTime wide, not Kappa.
    let pendingStack = null; // { items: [{ kind, raw, mods, hue }] }
    let pendingWhitespace = '';
    let pendingMods = [];
    let pendingHue = null

    const _lastItem = () => (pendingStack && pendingStack.items.length) ? pendingStack.items[pendingStack.items.length - 1] : null

    const _flushStackToResult = () => {
      if (!pendingStack || !pendingStack.items.length) { pendingStack = null; return }
      const items = pendingStack.items
      const baseHtml = _hsMcApplyMods(items[0].raw, items[0].mods, items[0].hue)
      const overlays = items.slice(1).map(it => _hsMcApplyMods(it.raw, it.mods, it.hue))
      result.push(renderEmoteStack({ base: baseHtml, overlays }))
      pendingStack = null
    }

    for (let _wIdx = 0; _wIdx < words.length; _wIdx++) {
      const word = words[_wIdx]
      // Whitespace - accumulate, don't flush yet (overlays are space-separated)
      if (WS_RE.test(word)) {
        pendingWhitespace += word;
        continue;
      }

      // FFZ semantic: modifier attaches to the IMMEDIATELY PRECEDING emote.
      // Kappa RainTime w! → wide RainTime (not Kappa).
      const modKind = HS_MC_MODS[word]
      if (modKind) {
        const last = _lastItem()
        if (last) last.mods.push(modKind)
        else pendingMods.push(modKind)
        pendingWhitespace = ''
        continue
      }
      const cMatchTok = word.match(HS_MC_C_RE)
      if (cMatchTok) {
        const hue = _hsMcHexToHue(cMatchTok[1])
        const last = _lastItem()
        if (last) last.hue = hue
        else pendingHue = hue
        pendingWhitespace = ''
        continue
      }
      // Peel chained modifier word (e.g. "w!h!ffzX" or "w!c!#ff8700h!")
      const _hsPeel = (() => {
        if (!word) return null
        const sortedKeys = Object.keys(HS_MC_MODS).sort((a, b) => b.length - a.length)
        const mods = []
        let hue = null
        let rem = word
        while (rem.length > 0) {
          let matched = false
          for (const k of sortedKeys) {
            if (rem.startsWith(k)) { mods.push(HS_MC_MODS[k]); rem = rem.slice(k.length); matched = true; break }
          }
          if (matched) continue
          const cm = rem.match(/^c!#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/)
          if (cm) { hue = _hsMcHexToHue(cm[1]); rem = rem.slice(cm[0].length); continue }
          return null
        }
        return (mods.length || hue != null) ? { mods, hue } : null
      })()
      if (_hsPeel) {
        const last = _lastItem()
        if (last) {
          for (const m of _hsPeel.mods) last.mods.push(m)
          if (_hsPeel.hue != null) last.hue = _hsPeel.hue
        } else {
          for (const m of _hsPeel.mods) pendingMods.push(m)
          if (_hsPeel.hue != null) pendingHue = _hsPeel.hue
        }
        pendingWhitespace = ''
        continue
      }

      // Kick emote format: [emote:ID:NAME] -> render as image from Kick CDN
      const kickEmoteMatch = word.match(/^\[emote:(\d+):([^\]]+)\]$/)
      if (kickEmoteMatch) {
        const [, emoteId, emoteName] = kickEmoteMatch
        const kickUrl = `https://files.kick.com/emotes/${emoteId}/fullsize`
        const safeKickUrl = escapeHtml(kickUrl)
        const safeName = escapeHtml(emoteName)
        // Cross-reference caches to find real provider (7tv/bttv/ffz), fall back to kick
        const cached = emoteCache.get(emoteName) || (channel && channelEmoteCaches[channel]?.get(emoteName))
        const provider = cached?.source || 'kick'
        const imgHtmlRaw = `<span class="hs-mc-emote-wrapper hs-state-channel" data-emote-name="${safeName}" data-emote-url="${safeKickUrl}" data-state="channel" data-source="${escapeHtml(provider)}"><img src="${safeKickUrl}" alt="${safeName}" title="${safeName} (${escapeHtml(provider)} via kick)" class="hs-mc-emote hs-emote-channel" data-emote-name="${safeName}" data-state="channel" data-source="${escapeHtml(provider)}" loading="lazy" decoding="async"></span>`
        _flushStackToResult()
        if (pendingWhitespace) { result.push(pendingWhitespace); pendingWhitespace = '' }
        pendingStack = { items: [{ kind: 'base', raw: imgHtmlRaw, mods: pendingMods.slice(), hue: pendingHue }] }
        pendingMods = []; pendingHue = null
        continue
      }

      // Try name0 overlay convention: "fire0" -> look up "fire" as overlay
      // Priority: senderEmotes > channel > extraCache (twitch IRC native) > emoteCache (globals)
      let emote = null
      let isOverlayEmote = false
      const endsWithZero = word.endsWith('0') && word.length > 1
      if (endsWithZero) {
        const baseName = word.slice(0, -1)
        emote = senderEmotes?.get(baseName) || (channel && channelEmoteCaches[channel]?.get(baseName)) || extraCache?.get(baseName) || emoteCache.get(baseName) || _rfGate(_rf?.get(baseName))
        if (emote) isOverlayEmote = true
      }
      if (!emote) {
        emote = senderEmotes?.get(word) || (channel && channelEmoteCaches[channel]?.get(word)) || extraCache?.get(word) || emoteCache.get(word) || _rfGate(_rf?.get(word))
        // blockedEmoteFallback last + ungated (block is viewer-wide, all senders):
        // resolves a blocked emote to its real url+dims so it renders the dashed box
        // at the emote's true rectangle via the normal path, instead of the square
        // 1×1-placeholder branch below. Only when a real url is stored (url-less
        // blocks — name-as-hash — still fall through to the square box).
        if (!emote) { const _bf = blockedEmoteFallback.get(word); if (_bf?.url) emote = _bf }
        // Honor zero-width flag, OR fall back to the "name0" naming convention
        // when an uploader didn't set the flag despite naming the emote for overlay use.
        if (emote) isOverlayEmote = !!emote.zeroWidth || endsWithZero
        // Own outgoing messages resolve via senderEmotes (viewerPersonalEmotes),
        // which lacks the 7TV zeroWidth flag — recover it from channel/global
        // caches so an overlay emote you own stacks in rendered chat too.
        if (emote && !isOverlayEmote && zeroWidthFromAnyCache(word)) isOverlayEmote = true
      }
      // FFZ-style fallback: token like "Kappaw!" or "KappaffzX" — when the
      // upstream send pipeline strips the space between emote and modifier,
      // try peeling a known modifier suffix and re-resolving the base name.
      // Only consider modifier suffixes (not random emote-name endings).
      let _hsInlineModSuffix = null
      if (!emote && word.length > 2) {
        const suffixCandidates = ['ffzCursed', 'ffzWide', 'ffzTall', 'ffzX', 'ffzY', 'w!', 'h!', 'v!', 'l!', 'c!', 'z!', 'x!', 'y!']
        for (const suf of suffixCandidates) {
          if (word.endsWith(suf) && word.length > suf.length + 1) {
            const baseGuess = word.slice(0, word.length - suf.length)
            const candidate = senderEmotes?.get(baseGuess) || (channel && channelEmoteCaches[channel]?.get(baseGuess)) || extraCache?.get(baseGuess) || emoteCache.get(baseGuess)
            if (candidate) {
              emote = candidate
              isOverlayEmote = !!candidate.zeroWidth
              _hsInlineModSuffix = HS_MC_MODS[suf] || null
              break
            }
          }
        }
        // c!#hex inline (KappaC!#ff8700 — also try)
        if (!emote) {
          const inlineColor = word.match(/^(.+?)(c!#?[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)$/)
          if (inlineColor) {
            const baseGuess = inlineColor[1]
            const candidate = senderEmotes?.get(baseGuess) || (channel && channelEmoteCaches[channel]?.get(baseGuess)) || extraCache?.get(baseGuess) || emoteCache.get(baseGuess)
            if (candidate) {
              emote = candidate
              isOverlayEmote = !!candidate.zeroWidth
              const m = inlineColor[2].match(HS_MC_C_RE)
              if (m) _hsInlineModSuffix = { hue: _hsMcHexToHue(m[1]) }
            }
          }
        }
      }
      if (emote) {
        const isBlocked = blockedEmoteNames.has(word);
        let state = isBlocked ? 'blocked' : (emote.state || 'global');
        // A sender's shared (or a removed) emote arrives as 'unadded'; if the
        // viewer actually owns it, show owned (green) instead of the orange
        // click-to-add affordance.
        if (state === 'unadded' && inventoryEmotes.has(word)) state = 'owned';
        const source = escapeHtml(emote.source || 'unknown');
        const imgSrc = escapeHtml(getChatResUrl(emote.url));
        const safeHash = emote.hash ? escapeHtml(emote.hash) : '';
        const displayName = escapeHtml(word)
        const ownerAttr = emote.ownerDisplay ? ` data-owner="${escapeHtml(emote.ownerDisplay)}"` : ''
        // Stale-emote ghost: if any channel's stale registry has this name, mark
        // the wrapper so dim/desaturate CSS applies. Iterating all channels is
        // O(small) and avoids passing channel context through the render path.
        let staleClass = '', staleAttr = ''
        try {
          const reg = window._hsStaleEmotes
          if (reg) {
            for (const m of reg.values()) {
              if (m.has(word)) {
                const meta = m.get(word)
                staleClass = ' hs-state-stale'
                if (meta?.actor) staleAttr += ` data-stale-actor="${escapeHtml(meta.actor)}"`
                if (meta?.at) staleAttr += ` data-stale-at="${meta.at}"`
                break
              }
            }
          }
        } catch (e) {}
        const imgHtmlRaw = `<span class="hs-mc-emote-wrapper hs-state-${state}${staleClass}" data-emote-name="${displayName}" data-emote-url="${imgSrc}" data-state="${state}" data-source="${source}"${ownerAttr}${safeHash ? ` data-emote-hash="${safeHash}"` : ''}${staleAttr}><img src="${imgSrc}" alt="${displayName}" title="${displayName}" class="hs-mc-emote hs-emote-${state}" data-emote-name="${displayName}" data-state="${state}" data-source="${source}"${ownerAttr} loading="lazy" decoding="async"></span>`;

        // Build the new item — inline-glued suffix mod attaches to THIS emote
        // (e.g. "RainTimew!" → wide RainTime, not wide whatever-was-base).
        const itemMods = []
        let itemHue = null
        if (_hsInlineModSuffix) {
          if (typeof _hsInlineModSuffix === 'string') itemMods.push(_hsInlineModSuffix)
          else if (_hsInlineModSuffix.hue != null) itemHue = _hsInlineModSuffix.hue
        }
        if (isOverlayEmote && pendingStack) {
          // Append as overlay item in the current group; floating mods (none yet
          // typically) drain onto this overlay
          for (const m of pendingMods) itemMods.push(m)
          if (pendingHue != null && itemHue == null) itemHue = pendingHue
          pendingMods = []; pendingHue = null
          pendingStack.items.push({ kind: 'overlay', raw: imgHtmlRaw, mods: itemMods, hue: itemHue })
          pendingWhitespace = ''
        } else {
          // New group — base (or overlay-without-base which becomes promoted base)
          _flushStackToResult()
          if (pendingWhitespace) { result.push(pendingWhitespace); pendingWhitespace = '' }
          for (const m of pendingMods) itemMods.push(m)
          if (pendingHue != null && itemHue == null) itemHue = pendingHue
          pendingMods = []; pendingHue = null
          pendingStack = { items: [{ kind: 'base', raw: imgHtmlRaw, mods: itemMods, hue: itemHue }] }
        }
      } else {
        // Emoji :shortcode: — stackable base, OR ":shortcode:0" overlay marker.
        // Mirrors the emote "name0" convention: a trailing 0 makes the emoji an
        // overlay that sits ON TOP of the previous token instead of beside it.
        if (typeof EMOJI_BY_NAME !== 'undefined' && word.startsWith(':') && word.length > 2) {
          const emojiOverlay = word.endsWith(':0') && word.length > 3
          const core = emojiOverlay ? word.slice(0, -1) : word // ":smile:0" -> ":smile:"
          if (core.endsWith(':') && core.length > 2) {
            const emojiName = core.slice(1, -1)
            const emojiEntry = EMOJI_BY_NAME.get(emojiName)
            if (emojiEntry) {
              const emojiHtmlRaw = `<span class="hs-mc-emoji" title=":${escapeHtml(emojiName)}:">${emojiEntry.emoji}</span>`
              if (emojiOverlay && pendingStack) {
                const itemMods = pendingMods.slice()
                const itemHue = pendingHue
                pendingMods = []; pendingHue = null
                pendingStack.items.push({ kind: 'overlay', raw: emojiHtmlRaw, mods: itemMods, hue: itemHue })
                pendingWhitespace = ''
                continue
              }
              _flushStackToResult()
              if (pendingWhitespace) { result.push(pendingWhitespace); pendingWhitespace = '' }
              const startMods = pendingMods.slice()
              const startHue = pendingHue
              pendingMods = []; pendingHue = null
              pendingStack = { items: [{ kind: 'base', raw: emojiHtmlRaw, mods: startMods, hue: startHue }] }
              continue
            }
          }
        }
        // Check for Unicode emoji — treat as stackable base
        if (UNICODE_EMOJI_RE.test(word)) {
          _flushStackToResult()
          if (pendingWhitespace) { result.push(pendingWhitespace); pendingWhitespace = '' }
          const emojiHtmlRaw = `<span class="hs-mc-emoji">${escapeHtml(word)}</span>`
          const startMods = pendingMods.slice()
          const startHue = pendingHue
          pendingMods = []; pendingHue = null
          pendingStack = { items: [{ kind: 'base', raw: emojiHtmlRaw, mods: startMods, hue: startHue }] }
          continue
        }
        // Blocked emote whose URL didn't resolve in this context (removed from set,
        // wrong channel, foreign personal emote, etc.) — still render the blocked
        // box (2px dashed outline) instead of leaking the raw name as text. Matches
        // by exact name, so only emotes the user actually blocked are boxed.
        if (blockedEmoteNames.has(word)) {
          _flushStackToResult()
          pendingMods = []; pendingHue = null
          if (pendingWhitespace) { result.push(pendingWhitespace); pendingWhitespace = '' }
          const dn = escapeHtml(word)
          result.push(`<span class="hs-mc-emote-wrapper hs-state-blocked" data-emote-name="${dn}" data-state="blocked" data-source="heatsync"><img src="${HS_TRANSPARENT_PX}" alt="${dn}" title="${dn}" class="hs-mc-emote hs-emote-blocked" style="width:var(--hs-emote-size,32px);height:var(--hs-emote-size,32px)" data-emote-name="${dn}" data-state="blocked" data-source="heatsync"></span>`)
          continue
        }
        // Text - flush stack and add text. Drop any pending mods/hue (they had no anchor).
        _flushStackToResult()
        pendingMods = []; pendingHue = null
        if (pendingWhitespace) {
          result.push(pendingWhitespace);
          pendingWhitespace = '';
        }
        // Color @mentions — always hoverable for profile cards
        if (word.startsWith('@') && word.length > 1) {
          const name = word.slice(1).replace(/[,.:!?]+$/, '').toLowerCase();
          const color = knownColors.get(name) || '#fff';
          result.push(`<a href="https://heatsync.org/user/${encodeURIComponent(name)}" target="_blank" class="hs-mc-user" data-username="${name}" style="color:${sanitizeColor(color)};font-weight:bold">${word}</a>`);
        } else if (linksEnabled && LINK_RE.test(word)) {
          // Validate URL protocol before creating link (block javascript:, data:, etc.)
          const hasProtocol = /^https?:\/\//i.test(word);
          const fullUrl = hasProtocol ? word : `https://${word}`;
          if (/^https?:\/\//i.test(fullUrl)) {
            result.push(`<a href="${escapeHtml(fullUrl)}" target="_blank" rel="noopener noreferrer" class="hs-mc-link">${escapeHtml(word)}</a>`);
          } else {
            result.push(escapeHtml(word));
          }
        } else {
          result.push(word);
        }
      }
    }

    // Flush any remaining stack
    _flushStackToResult()
    if (pendingWhitespace) {
      result.push(pendingWhitespace);
    }

    return result.join('');
  }

  // Render an emote stack (base + overlays)
  function renderEmoteStack(stack) {
    if (stack.overlays.length === 0) {
      return stack.base;
    }
    const overlayHtml = stack.overlays.map(o =>
      o.replace('class="hs-mc-emote ', 'class="hs-mc-emote hs-mc-overlay-emote ')
    ).join('');
    const count = stack.overlays.length + 1;
    return `<span class="hs-mc-emote-stack" data-stack-count="${count}" title="expand"><span class="hs-mc-emote-stack-emotes">${stack.base}${overlayHtml}</span><span class="hs-mc-stack-collapse" title="collapse">\u00d7</span><span class="hs-mc-stack-block-all" title="block all">\u2298</span></span>`;
  }
