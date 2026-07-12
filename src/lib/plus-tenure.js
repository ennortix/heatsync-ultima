/**
 * plus-tenure.js — the HeatSync Plus tenure token, ported for the extension.
 *
 * SYNCED COPY of the heatsync monorepo's client/utils/plus-tenure.js — keep
 * byte-close to the source of truth (see the cross-repo auto-apply rule in
 * project memory). A small text badge shown next to an ACTIVE Plus member's
 * name: the "+" Plus mark plus how long they've been subscribed ("+5mo",
 * "+3y"). Tenure rides the same warm ramp as heat (longer = warmer), which
 * also happens to be the Plus brand hue (orange); it stops below warn-yellow,
 * and only 5y+ legends reach medal gold.
 *
 * Data source: `plus_since` (an ISO timestamp), which the server exposes ONLY
 * while the user is currently entitled (GET /api/paints `plus` map — see
 * chrome/background.js fetch_paints). A null/undefined `since` means "not an
 * active Plus member" → no token. Inputs are date/number coerced, so the
 * output needs no escaping.
 *
 * Pure-data module (no DOM in the ratio helpers) — bundled into the
 * multichat overlay only, alongside lib/paint-spec.js (see build.js's
 * readMultichatModules).
 */

const MONTH_MS = 2629746000 // average gregorian month (365.2425/12 days)

/** Whole months a member has been on Plus, from their first-subscribed date. */
export function plusTenureMonths(since) {
  if (!since) return 0
  const t = since instanceof Date ? since.getTime() : Date.parse(since)
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / MONTH_MS))
}

/** Warm ramp; caps below warn-yellow, 5y+ earns medal gold. Mirrors the heat ramp. */
export function plusTenureColor(months) {
  const m = Number(months) || 0
  if (m >= 60) return '#ffd700' // 5y+  — medal gold
  if (m >= 36) return '#ffaf00' // 3y+  — amber
  if (m >= 12) return '#ff8700' // 1y+  — brand orange
  if (m >= 6) return '#ff5f00' // 6mo+ — ember
  return '#d75f00' // 1-5mo — dim ember
}

/** Compact duration; "5mo" / "3y". Empty under a month (the "+" mark stands alone). */
export function formatPlusTenure(months) {
  const m = Number(months) || 0
  if (m < 1) return ''
  return m < 12 ? `${m}mo` : `${Math.floor(m / 12)}y`
}

/** Hover text, no middot. "3 years on heatsync plus" / "heatsync plus member". */
export function plusTenureTitle(months) {
  const m = Number(months) || 0
  if (m < 1) return 'heatsync plus member'
  if (m < 12) return `${m} month${m === 1 ? '' : 's'} on heatsync plus`
  const y = Math.floor(m / 12)
  const r = m % 12
  const yr = `${y} year${y === 1 ? '' : 's'}`
  return r > 0 ? `${yr} ${r}mo on heatsync plus` : `${yr} on heatsync plus`
}

/**
 * The token, ready to drop beside a username. Empty string when `since` is
 * absent (not an active Plus member). The leading "+" is the Plus brand mark
 * so a bare number never reads as ambiguous. Injection-safe: only date/
 * number-derived text reaches the HTML.
 */
export function renderPlusTenureToken(since) {
  if (!since) return ''
  const m = plusTenureMonths(since)
  return `<span class="hs-plus-tenure" style="color:${plusTenureColor(m)}" title="${plusTenureTitle(m)}">+${formatPlusTenure(m)}</span>`
}

/**
 * Same token as an HTMLElement, built via safe DOM setters (textContent/style/
 * title — never innerHTML). Use for live DOM injection so no HTML-string sink
 * is involved at all. Returns null when `since` is absent. Browser-only (uses
 * document); the string form above covers initial-render/SSR-style embeds.
 */
export function buildPlusTenureToken(since) {
  if (!since) return null
  const m = plusTenureMonths(since)
  const el = document.createElement('span')
  el.className = 'hs-plus-tenure'
  el.style.color = plusTenureColor(m)
  el.title = plusTenureTitle(m)
  el.textContent = `+${formatPlusTenure(m)}`
  return el
}
