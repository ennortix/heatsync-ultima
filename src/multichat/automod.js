// Automod - client-side filter applied before pushing to buffers

let automodAllCaps = false
let automodCompiled = null

// Heuristic ReDoS guard: user-supplied patterns are compiled into a live RegExp
// run against every incoming message. A catastrophic-backtracking pattern (e.g.
// `(a+)+`, `(.*)*`, `(a|a)+`, `x{9999}`) would freeze the user's own tab — and a
// shared/imported automod config could weaponise it. Patterns flagged dangerous
// fall back to a literal (escaped) match instead of a raw regex. No dependency.
function isDangerousRegexSource(p) {
  // a quantified group whose body also contains a quantifier → exponential
  if (/\([^)]*[+*][^)]*\)\s*[*+]/.test(p)) return true
  // unbounded repeat of an alternation group → (a|a)+ style blowup
  if (/\([^)]*\|[^)]*\)\s*[*+]/.test(p)) return true
  // absurd bounded repetition
  if (/\{\s*\d{4,}/.test(p)) return true
  return false
}

function escapeRegexLiteral(p) {
  return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileAutomod(rawSettings) {
  automodAllCaps = !!rawSettings?.automodAllCaps
  const raw = (rawSettings?.automodRegex || '').trim()
  if (!raw) {
    automodCompiled = null
    return
  }
  const patterns = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (patterns.length === 0) {
    automodCompiled = null
    return
  }
  // Safe patterns stay as regex; dangerous ones degrade to a literal match so
  // they can never trigger catastrophic backtracking.
  const safeParts = patterns.map((p) => (isDangerousRegexSource(p) ? escapeRegexLiteral(p) : p))
  try {
    automodCompiled = new RegExp(safeParts.join('|'), 'i')
  } catch (e) {
    // A surviving pattern is still invalid — escape everything to literal.
    const esc = patterns.map(escapeRegexLiteral).join('|')
    try {
      automodCompiled = new RegExp(esc, 'i')
    } catch {
      automodCompiled = null
    }
  }
}

function shouldAutomod(text) {
  if (!text) return false
  if (automodCompiled && automodCompiled.test(text)) return true
  if (automodAllCaps && text.length > 10) {
    const letters = text.replace(/[^A-Za-z]/g, '')
    if (letters.length >= 8) {
      const upper = letters.replace(/[^A-Z]/g, '').length
      if (upper / letters.length > 0.7) return true
    }
  }
  return false
}
