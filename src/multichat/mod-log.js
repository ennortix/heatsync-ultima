// Mod-action log — pure helpers for the streamer/mod popout view (drag to a
// stream monitor / capture in OBS). Self-contained: no DOM or bundle-closure
// deps, so it's unit-testable outside the bundle. Mirrors filter-rules.js — the
// source `export`s for tests; the build strips exports to bundle-globals that
// main.js calls directly.

// Notice types that represent a mod action worth logging.
const MOD_NOTICE_TYPES = new Set([
  'ban_success',
  'timeout_success',
  'unban_success',
  'untimeout_success',
  'delete_message_success',
])

const MOD_ACTION_MAP = {
  ban_success: 'ban',
  timeout_success: 'timeout',
  unban_success: 'unban',
  untimeout_success: 'untimeout',
  delete_message_success: 'delete',
}

// Is this message a mod-action notice we log?
function isModNotice(msg) {
  return !!msg && msg.type === 'notice' && MOD_NOTICE_TYPES.has(msg.noticeType)
}

// Build a structured, render-ready log entry from a mod-action notice. Returns
// null for non-mod messages. Pure: no Date.now() fallback (stays deterministic
// for tests) — callers pass notices that already carry msg.time.
function modLogEntryFromNotice(msg) {
  if (!isModNotice(msg)) return null
  const target = (msg.targetUser || '').toLowerCase()
  const channel = (msg.channel || '').toLowerCase()
  const id = msg.id || `${msg.noticeType}:${channel}:${target}:${msg.time || 0}`
  return {
    id,
    action: MOD_ACTION_MAP[msg.noticeType] || msg.noticeType,
    target,
    durationSec: msg.banDuration || 0,
    channel,
    platform: msg.platform || 'twitch',
    text: msg.systemMsg || msg.text || '',
    time: msg.time || 0,
  }
}

// Append an entry to a capped log, deduped by id (cheap last-id short-circuit,
// then a reverse scan for the recent-dup common case). Mutates + returns the
// log. `max` caps retained entries (oldest trimmed first).
function pushModLogEntry(log, entry, max = 300) {
  if (!entry) return log
  const n = log.length
  if (n && log[n - 1].id === entry.id) return log
  for (let i = n - 1; i >= 0; i--) if (log[i].id === entry.id) return log
  log.push(entry)
  if (log.length > max) log.splice(0, log.length - max)
  return log
}

// Compact human duration for a timeout (e.g. 600 → "10m"). '' for 0/none.
function formatDuration(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  if (s === 0) return ''
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

// One-line human summary of a log entry, for the popout row.
function modLogLine(entry) {
  if (!entry) return ''
  const t = entry.target || 'someone'
  if (entry.action === 'ban') return `banned ${t}`
  if (entry.action === 'timeout') {
    const d = formatDuration(entry.durationSec)
    return d ? `timed out ${t} (${d})` : `timed out ${t}`
  }
  if (entry.action === 'unban') return `unbanned ${t}`
  if (entry.action === 'untimeout') return `untimed-out ${t}`
  if (entry.action === 'delete') return entry.target ? `deleted ${t}'s message` : 'deleted a message'
  return entry.text || entry.action || ''
}

// Filter a log by action type and/or a free-text query (matches target/channel).
// Pure — drives the popout's filter controls.
function filterModLog(log, opts = {}) {
  const action = opts.action || ''
  const q = (opts.query || '').trim().toLowerCase()
  return log.filter((e) => {
    if (action && e.action !== action) return false
    if (q && !((e.target || '').includes(q) || (e.channel || '').includes(q))) return false
    return true
  })
}

export {
  filterModLog,
  formatDuration,
  isModNotice,
  MOD_NOTICE_TYPES,
  modLogEntryFromNotice,
  modLogLine,
  pushModLogEntry,
}
