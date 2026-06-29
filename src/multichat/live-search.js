// Live chat search — builds a per-query matcher compiled ONCE, not per message.
// Three modes: /regex/[i] | @username prefix | bare substring. ReDoS-guarded.

// Private copies of the ReDoS heuristics (mirrors automod.js — kept local so
// this file is importable by tests without dragging in the whole bundle).
function _lsIsDangerous(p) {
  if (/\([^)]*[+*][^)]*\)\s*[*+]/.test(p)) return true
  if (/\([^)]*\|[^)]*\)\s*[*+]/.test(p)) return true
  if (/\{\s*\d{4,}/.test(p)) return true
  return false
}

function _lsEscapeLiteral(p) {
  return p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a matcher for rawQuery (trimmed, case preserved).
// Returns { test(m) } where m has .user / .display_name / .text fields.
function buildLiveSearchMatcher(rawQuery) {
  if (!rawQuery) return { test: () => true }

  // ── Regex mode: /pattern/ or /pattern/i ─────────────────────────────────────
  // The trailing delimiter must follow the closing slash with no intervening
  // non-flag characters, so `/foo/i` is regex but `/foo/bar` is literal text.
  const reSlash = /^\/(.+)\/(i?)$/.exec(rawQuery)
  if (reSlash) {
    const src = reSlash[1]
    const flags = reSlash[2]
    // ReDoS guard — dangerous pattern degrades to literal substring so it can
    // never trigger catastrophic backtracking regardless of message content.
    const safeSrc = _lsIsDangerous(src) ? _lsEscapeLiteral(src) : src
    let re
    try {
      re = new RegExp(safeSrc, flags)
    } catch {
      // Invalid regex (e.g. `/[/` mid-typing) — fall back to literal.
      try {
        re = new RegExp(_lsEscapeLiteral(src), flags)
      } catch {
        // Pathological: literal form still invalid (shouldn't happen). Fall
        // through to bare-substring on the full rawQuery.
        re = null
      }
    }
    if (re) {
      return {
        test(m) {
          return re.test(String(m.user || m.display_name || '')) || re.test(String(m.text || ''))
        },
      }
    }
  }

  // ── @name prefix — scopes to one sender ─────────────────────────────────────
  const q = rawQuery.toLowerCase()
  if (q[0] === '@') {
    const prefix = q.slice(1)
    return {
      test(m) {
        return String(m.user || m.display_name || '')
          .toLowerCase()
          .startsWith(prefix)
      },
    }
  }

  // ── Bare substring — matches username OR message body ────────────────────────
  return {
    test(m) {
      const user = String(m.user || m.display_name || '').toLowerCase()
      return (
        user.includes(q) ||
        String(m.text || '')
          .toLowerCase()
          .includes(q)
      )
    },
  }
}

export { buildLiveSearchMatcher }
