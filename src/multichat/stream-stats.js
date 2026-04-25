// Stream stats - per-channel message/mention/chatter/emote counters + summary card

// Stream stats (per channel, lowercase). Reset on stream:online; rendered on stream:offline.
// { msgCount, mentionCount, startedAt, chatters: Map<user,count>, emotes: Map<name,count> }
const streamStats = new Map()
const STREAM_STATS_TOP_N = 5
function getStats(channel) {
  if (!channel) return null
  const key = channel.toLowerCase()
  let s = streamStats.get(key)
  if (!s) {
    s = { msgCount: 0, mentionCount: 0, startedAt: Date.now(), chatters: new Map(), emotes: new Map() }
    streamStats.set(key, s)
    if (streamStats.size > 50) streamStats.delete(streamStats.keys().next().value)
  }
  return s
}
function bumpStreamStats(channel, msg, isMent) {
  const s = getStats(channel)
  if (!s || !msg) return
  s.msgCount++
  if (isMent) s.mentionCount++
  if (msg.user) {
    const u = msg.user
    s.chatters.set(u, (s.chatters.get(u) || 0) + 1)
    if (s.chatters.size > 5000) {
      // Keep top by trimming smallest
      const arr = [...s.chatters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1000)
      s.chatters = new Map(arr)
    }
  }
  const text = msg.text || ''
  if (text && typeof emoteCache !== 'undefined') {
    // count emote name occurrences via word scan
    for (const word of text.split(/\s+/)) {
      if (!word) continue
      if (emoteCache.has(word)) {
        s.emotes.set(word, (s.emotes.get(word) || 0) + 1)
      }
    }
    if (s.emotes.size > 2000) {
      const arr = [...s.emotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 500)
      s.emotes = new Map(arr)
    }
  }
}
function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
}
function fmtDuration(ms) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}
function renderStreamSummary(channel) {
  const key = (channel || '').toLowerCase()
  const s = streamStats.get(key)
  if (!s || s.msgCount === 0) return
  const container = document.getElementById('hs-mc-container')
  if (!container) return
  const id = 'hs-mc-summary-' + key.replace(/[^a-z0-9]/gi, '')
  if (document.getElementById(id)) return
  const card = document.createElement('div')
  card.id = id
  card.className = 'hs-mc-stream-summary'
  card.style.cssText = 'background:#0a0a0a;color:#fff;border:1px solid #ff8700;font:11px/1.5 monospace;padding:10px 12px;margin:6px;display:flex;flex-direction:column;gap:6px;'
  const title = document.createElement('div')
  title.style.cssText = 'display:flex;justify-content:space-between;align-items:center;color:#ff8700;font-weight:700'
  const titleText = document.createElement('span')
  titleText.textContent = `${key} stream summary`
  const dismiss = document.createElement('span')
  dismiss.textContent = '×'
  dismiss.style.cssText = 'cursor:pointer;color:#808080;font-weight:700'
  dismiss.addEventListener('click', () => card.remove())
  title.append(titleText, dismiss)
  const stats = document.createElement('div')
  stats.style.color = '#c0c0c0'
  stats.textContent = `${s.msgCount} messages · ${s.chatters.size} chatters · ${s.mentionCount} mentions · ${fmtDuration(Date.now() - s.startedAt)}`
  card.append(title, stats)
  const top = (label, items) => {
    if (items.length === 0) return null
    const row = document.createElement('div')
    row.style.color = '#c0c0c0'
    const lbl = document.createElement('span')
    lbl.style.color = '#808080'
    lbl.textContent = label + ' '
    const list = document.createElement('span')
    list.textContent = items.map(([k, v]) => `${k} (${v})`).join(' · ')
    row.append(lbl, list)
    return row
  }
  const te = top('top emotes:', topN(s.emotes, STREAM_STATS_TOP_N))
  const tc = top('top chatters:', topN(s.chatters, STREAM_STATS_TOP_N))
  if (te) card.append(te)
  if (tc) card.append(tc)
  container.insertBefore(card, container.firstChild)
  // Keep stats around for 1h after offline so user can review on toggle/scroll
  cleanup.setTimeout(() => streamStats.delete(key), 60 * 60 * 1000)
}
