// chat-logs.js — chat archive viewer panel.
// Opens via right-click → "chat logs". Hijacks #hs-mc-messages (same pattern
// as profile-card.js). Infinite scroll up via cursor pagination against
// /api/archive/user/:platform/:username/messages?channel=...

let activeChatLogs = null
// Shape: {
//   username, platform, channel,        // channel = null → all-channels view
//   rows: [],                            // newest-first as returned
//   cursor: null,                        // next_cursor for older pagination
//   loading: false,
//   exhausted: false,
//   query: '',                           // search-within filter
//   scope: 'channel' | 'all'             // matches whether channel is set
// }

const HS_CL_PAGE = 100

async function openChatLogsView(username, opts = {}) {
  if (!username) return
  username = String(username).toLowerCase()
  const platform = (opts.platform || 'twitch').toLowerCase()
  const channel = opts.channel ? String(opts.channel).toLowerCase() : null

  // Hide inputbar — no message composition in log view
  const inputBar = document.getElementById('hs-mc-inputbar')
  if (inputBar) inputBar.classList.add('hs-hidden')

  activeChatLogs = {
    username, platform, channel,
    rows: [], cursor: null, loading: false, exhausted: false,
    query: '', scope: channel ? 'channel' : 'all',
  }
  renderChatLogsView()
  await fetchChatLogsPage()
}

function closeChatLogsView() {
  if (!activeChatLogs) return
  activeChatLogs = null
  const inputBar = document.getElementById('hs-mc-inputbar')
  if (inputBar) {
    const hideOnTabs = ['add', 'settings', 'discover', 'pinned']
    if (!hideOnTabs.includes(currentTab)) inputBar.classList.remove('hs-hidden')
  }
  if (typeof renderMessages === 'function') renderMessages(currentTab)
}

async function fetchChatLogsPage() {
  if (!activeChatLogs || activeChatLogs.loading || activeChatLogs.exhausted) return
  activeChatLogs.loading = true
  const state = activeChatLogs
  const params = new URLSearchParams()
  if (state.channel) params.set('channel', state.channel)
  params.set('limit', String(HS_CL_PAGE))
  if (state.cursor) params.set('cursor', state.cursor)
  const path = `/api/archive/user/${encodeURIComponent(state.platform)}/${encodeURIComponent(state.username)}/messages?${params.toString()}`
  let resp
  try { resp = await apiFetch(path) } catch { resp = { ok: false } }
  if (!activeChatLogs || activeChatLogs !== state) return
  state.loading = false
  if (!resp?.ok || !resp.data) {
    state.exhausted = true
    renderChatLogsView()
    return
  }
  const incoming = resp.data.results || []
  // results are newest-first; append to bottom of list since we're loading older
  state.rows.push(...incoming)
  state.cursor = resp.data.next_cursor || null
  if (!state.cursor || incoming.length === 0) state.exhausted = true
  // Server kicked off ivr.fi historical backfill — flag so the UI shows a
  // "fetching history" hint and the user knows to retry shortly.
  if (resp.data.backfill_pending) state.backfillPending = true
  renderChatLogsView()
}

async function refreshChatLogs() {
  if (!activeChatLogs) return
  activeChatLogs.rows = []
  activeChatLogs.cursor = null
  activeChatLogs.exhausted = false
  activeChatLogs.backfillPending = false
  renderChatLogsView()
  await fetchChatLogsPage()
}

async function searchChatLogs(query) {
  if (!activeChatLogs) return
  activeChatLogs.query = query
  if (!query) {
    // Reset to full timeline
    activeChatLogs.rows = []
    activeChatLogs.cursor = null
    activeChatLogs.exhausted = false
    renderChatLogsView()
    await fetchChatLogsPage()
    return
  }
  activeChatLogs.loading = true
  const state = activeChatLogs
  const params = new URLSearchParams()
  params.set('q', query)
  params.set('username', state.username)
  if (state.channel) params.set('channel', state.channel)
  params.set('limit', String(HS_CL_PAGE))
  const path = `/api/archive/search?${params.toString()}`
  let resp
  try { resp = await apiFetch(path) } catch { resp = { ok: false } }
  if (!activeChatLogs || activeChatLogs !== state) return
  state.loading = false
  if (!resp?.ok || !resp.data) { state.exhausted = true; renderChatLogsView(); return }
  state.rows = resp.data.results || []
  state.cursor = null
  state.exhausted = true
  renderChatLogsView()
}

function exportChatLogs(format) {
  if (!activeChatLogs || !activeChatLogs.rows.length) return
  const { username, channel, rows } = activeChatLogs
  let body, mime, ext
  if (format === 'json') {
    body = JSON.stringify(rows, null, 2)
    mime = 'application/json'
    ext = 'json'
  } else {
    body = rows.slice().reverse().map(r => {
      const ts = r.timestamp ? new Date(r.timestamp).toISOString().replace('T', ' ').slice(0, 19) : ''
      const ch = r.channel ? `#${r.channel}` : ''
      return `[${ts}] ${ch} <${r.display_name || r.username}> ${r.message}`
    }).join('\n')
    mime = 'text/plain'
    ext = 'txt'
  }
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chatlogs-${username}${channel ? '-' + channel : ''}.${ext}`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function renderChatLogsView() {
  const msgsEl = document.getElementById('hs-mc-messages')
  if (!msgsEl || !activeChatLogs) return
  msgsEl.textContent = ''

  const { username, channel, rows, loading, exhausted, query, scope } = activeChatLogs

  const wrap = document.createElement('div')
  wrap.className = 'hs-cl-wrap'

  // Header
  const hdr = document.createElement('div')
  hdr.className = 'hs-cl-hdr'

  const title = document.createElement('div')
  title.className = 'hs-cl-title'
  const tName = document.createElement('span')
  tName.className = 'hs-cl-title-name'
  tName.textContent = username
  const tSub = document.createElement('span')
  tSub.className = 'hs-cl-title-sub'
  tSub.textContent = channel ? `in #${channel}` : 'across all channels'
  title.appendChild(tName); title.appendChild(tSub)
  hdr.appendChild(title)

  const closeBtn = document.createElement('button')
  closeBtn.className = 'hs-cl-close'
  closeBtn.type = 'button'
  closeBtn.title = 'close (Esc)'
  closeBtn.textContent = '×'
  closeBtn.addEventListener('click', closeChatLogsView)
  hdr.appendChild(closeBtn)
  wrap.appendChild(hdr)

  // Controls
  const ctrls = document.createElement('div')
  ctrls.className = 'hs-cl-ctrls'

  const search = document.createElement('input')
  search.type = 'text'
  search.className = 'hs-cl-search'
  search.placeholder = `search ${username}'s messages…`
  search.value = query || ''
  let searchTimer = null
  search.addEventListener('input', () => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => searchChatLogs(search.value.trim()), 250)
  })
  ctrls.appendChild(search)

  // Scope toggle (channel ↔ all) only meaningful if we have a channel context
  if (channel) {
    const scopeBtn = document.createElement('button')
    scopeBtn.className = 'hs-cl-scope'
    scopeBtn.type = 'button'
    scopeBtn.textContent = scope === 'channel' ? `#${channel} only` : 'all channels'
    scopeBtn.title = 'toggle scope'
    scopeBtn.addEventListener('click', async () => {
      const newScope = scope === 'channel' ? 'all' : 'channel'
      activeChatLogs.scope = newScope
      activeChatLogs.channel = newScope === 'channel' ? channel : null
      activeChatLogs.rows = []
      activeChatLogs.cursor = null
      activeChatLogs.exhausted = false
      renderChatLogsView()
      await fetchChatLogsPage()
    })
    ctrls.appendChild(scopeBtn)
  }

  const refreshBtn = document.createElement('button')
  refreshBtn.className = 'hs-cl-export'
  refreshBtn.type = 'button'
  refreshBtn.textContent = '↻'
  refreshBtn.title = 'refresh'
  refreshBtn.addEventListener('click', () => refreshChatLogs())
  ctrls.appendChild(refreshBtn)

  const exportTxt = document.createElement('button')
  exportTxt.className = 'hs-cl-export'
  exportTxt.type = 'button'
  exportTxt.textContent = '.txt'
  exportTxt.title = 'export as .txt'
  exportTxt.addEventListener('click', () => exportChatLogs('txt'))
  ctrls.appendChild(exportTxt)

  const exportJson = document.createElement('button')
  exportJson.className = 'hs-cl-export'
  exportJson.type = 'button'
  exportJson.textContent = '.json'
  exportJson.title = 'export as .json'
  exportJson.addEventListener('click', () => exportChatLogs('json'))
  ctrls.appendChild(exportJson)

  wrap.appendChild(ctrls)

  // Body — message list
  const list = document.createElement('div')
  list.className = 'hs-cl-list'

  if (rows.length === 0 && !loading) {
    const empty = document.createElement('div')
    empty.className = 'hs-cl-empty'
    if (activeChatLogs.backfillPending) {
      empty.textContent = `fetching historical logs from logs.ivr.fi… try refresh in ~30s`
    } else {
      empty.textContent = query
        ? `no matches for "${query}"`
        : `no archived messages from ${username}${channel ? ' in #' + channel : ''} yet`
    }
    list.appendChild(empty)
  } else {
    // Render newest-at-top (matches Twitch viewer card mental model)
    for (const r of rows) list.appendChild(renderChatLogRow(r))
  }

  // Load-more sentinel at the bottom (scroll-down to load older)
  if (!exhausted) {
    const sentinel = document.createElement('div')
    sentinel.className = 'hs-cl-loader'
    sentinel.textContent = loading ? 'loading…' : 'scroll for older'
    list.appendChild(sentinel)
    // IntersectionObserver auto-fires when sentinel scrolls into view
    if (!loading && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) {
          io.disconnect()
          fetchChatLogsPage()
        }
      }, { root: list, rootMargin: '200px' })
      io.observe(sentinel)
    }
  }

  wrap.appendChild(list)
  msgsEl.appendChild(wrap)
}

function renderChatLogRow(r) {
  const row = document.createElement('div')
  row.className = 'hs-cl-row'
  if (r.deleted_at) row.classList.add('hs-cl-deleted')

  const ts = document.createElement('span')
  ts.className = 'hs-cl-ts'
  if (r.timestamp) {
    const d = new Date(r.timestamp)
    ts.textContent = d.toISOString().replace('T', ' ').slice(5, 16)
    ts.title = d.toLocaleString()
  }
  row.appendChild(ts)

  if (activeChatLogs && activeChatLogs.scope === 'all' && r.channel) {
    const ch = document.createElement('span')
    ch.className = 'hs-cl-ch'
    ch.textContent = `#${r.channel}`
    row.appendChild(ch)
  }

  const name = document.createElement('span')
  name.className = 'hs-cl-user'
  name.textContent = r.display_name || r.username || '?'
  // Color from heatsync color cache if present
  try {
    if (typeof getKnownColor === 'function') {
      const c = getKnownColor((r.username || '').toLowerCase())
      if (c) name.style.color = c
    }
  } catch {}
  row.appendChild(name)

  const body = document.createElement('span')
  body.className = 'hs-cl-body'
  appendChatLogBody(body, r)
  row.appendChild(body)

  return row
}

function appendChatLogBody(host, r) {
  const text = String(r.message || '')
  const twitchEmotes = r.emote_refs?.twitch || null
  if (!twitchEmotes) {
    host.textContent = text
    return
  }
  // Walk tokens, swap any token that exactly matches a twitch-emote name
  const parts = text.split(/(\s+)/)
  for (const part of parts) {
    if (twitchEmotes[part]) {
      const img = document.createElement('img')
      img.className = 'hs-cl-emote'
      img.src = twitchEmotes[part]
      img.alt = part
      img.loading = 'lazy'
      host.appendChild(img)
    } else {
      host.appendChild(document.createTextNode(part))
    }
  }
}

// ESC closes the panel (matches profile-card convention)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && activeChatLogs) {
    e.preventDefault()
    closeChatLogsView()
  }
}, true)
