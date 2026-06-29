// Chat filter/highlight rule engine — per-rule hide or highlight for incoming messages.
// Compiles once on settings change; evaluates cheaply per message.
// Self-contained — no imports. Mirrors automod.js shape (compileX / evaluateX).

// ── ReDoS guard (same heuristic as automod.js) ────────────────────────────────
// Inlined so this module is testable without the bundle scope.
function _frIsDangerous(p) {
  if (/\([^)]*[+*][^)]*\)\s*[*+]/.test(p)) return true
  if (/\([^)]*\|[^)]*\)\s*[*+]/.test(p)) return true
  if (/\{\s*\d{4,}/.test(p)) return true
  return false
}
function _frEscapeLiteral(p) {
  return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
function _frSafeRegex(src, flags) {
  const safe = _frIsDangerous(src) ? _frEscapeLiteral(src) : src
  try {
    return new RegExp(safe, flags)
  } catch {
    try {
      return new RegExp(_frEscapeLiteral(src), flags)
    } catch {
      return null
    }
  }
}

// ── module state ──────────────────────────────────────────────────────────────
// Two buckets: all-scope rules run on every message; per-channel rules run only
// when channelKey matches. Compiled once → evaluated with no allocation per call.
let _frAllRules = [] // compiled rules with scope 'all'
let _frByChannel = new Map() // compiled rules keyed by channel tab id

// ── compile helpers ───────────────────────────────────────────────────────────
function _frCompileOne(rule) {
  if (!rule || typeof rule !== 'object') return null
  if (!rule.id || !rule.enabled) return null
  const m = rule.match
  if (!m || typeof m.type !== 'string' || typeof m.value !== 'string') return null
  const val = m.value.trim()
  if (!val) return null
  const action = rule.action === 'hide' ? 'hide' : rule.action === 'highlight' ? 'highlight' : null
  if (!action) return null
  const scope = rule.scope === 'all' || !rule.scope ? 'all' : String(rule.scope)
  const cs = !!m.caseSensitive
  const flags = cs ? '' : 'i'

  const c = {
    id: String(rule.id),
    action,
    color: action === 'highlight' && rule.color && /^#[0-9a-f]{3,8}$/i.test(rule.color) ? rule.color : null,
    scope,
    matchType: m.type,
    caseSensitive: cs,
    value: '',
    re: null,
  }

  switch (m.type) {
    case 'keyword': {
      // Word-boundary–ish: allow leading/trailing whitespace or line boundary,
      // but don't require \b so emoji/Unicode words also match. Case-insensitive
      // by default. RegExp compiled once; never touches user-supplied raw regex.
      const esc = _frEscapeLiteral(val)
      try {
        c.re = new RegExp('(?:^|[\\s,!?.:;\'"])' + esc + '(?=$|[\\s,!?.:;\'"])', flags)
      } catch {
        c.re = null
      }
      break
    }
    case 'regex':
      // User-supplied pattern — guard against ReDoS, then compile.
      c.re = _frSafeRegex(val, flags)
      break
    case 'user':
      c.value = cs ? val : val.toLowerCase()
      break
    case 'badge':
      c.value = val.toLowerCase()
      break
    case 'msgtype':
      c.value = val.toLowerCase()
      break
    default:
      return null // unknown match type — skip
  }

  return c
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Validate + pre-compile an array of raw rule objects into module state.
 * Must be called once on load and again whenever chatFilterRules changes.
 * Safe to call with null / undefined / non-array (treated as empty).
 * @param {Array} rules  raw chatFilterRules array
 */
function compileFilterRules(rules) {
  _frAllRules = []
  _frByChannel = new Map()
  if (!Array.isArray(rules)) return
  for (const rule of rules) {
    const c = _frCompileOne(rule)
    if (!c) continue
    if (c.scope === 'all') {
      _frAllRules.push(c)
    } else {
      let bucket = _frByChannel.get(c.scope)
      if (!bucket) {
        bucket = []
        _frByChannel.set(c.scope, bucket)
      }
      bucket.push(c)
    }
  }
}

/**
 * Evaluate applicable compiled rules against an incoming message.
 * Hot path — no per-call allocation when there are no rules for this scope.
 * @param {object} m           message object (text, user, badges, isFirstMsg, isAction, bits, replyTo)
 * @param {string|null} channelKey  channel tab id (ch.id) or null
 * @returns {{ hide: boolean, highlight: string|null }}
 */
function evaluateFilterRules(m, channelKey) {
  const hasChannel = channelKey && _frByChannel.has(channelKey)
  if (!_frAllRules.length && !hasChannel) return { hide: false, highlight: null }

  const rules = hasChannel ? _frAllRules.concat(_frByChannel.get(channelKey)) : _frAllRules

  let highlight = null
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (!_frTest(rule, m)) continue
    if (rule.action === 'hide') return { hide: true, highlight: null }
    if (rule.action === 'highlight' && highlight === null) highlight = rule.color
  }
  return { hide: false, highlight }
}

function _frTest(rule, m) {
  switch (rule.matchType) {
    case 'keyword':
    case 'regex':
      return !!rule.re && typeof m.text === 'string' && rule.re.test(m.text)
    case 'user': {
      if (!m.user) return false
      const u = rule.caseSensitive ? String(m.user) : String(m.user).toLowerCase()
      return u === rule.value
    }
    case 'badge': {
      if (!m.badges || typeof m.badges !== 'string') return false
      const badges = m.badges.split(',')
      for (let i = 0; i < badges.length; i++) {
        if (badges[i].split('/')[0].toLowerCase() === rule.value) return true
      }
      return false
    }
    case 'msgtype': {
      const mt = rule.value
      if (mt === 'first-message') return !!m.isFirstMsg
      if (mt === 'action') return !!m.isAction
      if (mt === 'reply') return !!(m.replyTo && m.replyTo.user)
      if (mt === 'cheer') return !!(m.bits && Number(m.bits) > 0)
      return false
    }
    default:
      return false
  }
}

export { compileFilterRules, evaluateFilterRules }
