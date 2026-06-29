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

export { isModNotice, MOD_NOTICE_TYPES, modLogEntryFromNotice, pushModLogEntry }
