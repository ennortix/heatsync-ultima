// HeatSync-native name paints — batch fetch + single injected stylesheet.
//
// Mirrors the site's client/chat/paint-cosmetics.js pipeline, adapted for the
// multichat overlay's IIFE/global-scope bundling (no ES module imports at
// runtime — see build.js's readMultichatModules, which embeds lib/paint-spec.js
// right before this file so compilePaintCss/hashPaintSpec/paintNeedsLetterSplit
// are already free variables in this scope by the time these functions run).
//
// ID-SPACE SAFETY (read before touching call sites): paints are keyed by
// HEATSYNC-side TWITCH user ids. Kick and YouTube have their own numeric/string
// id spaces that COLLIDE with twitch ids (a kick numeric id can equal an
// unrelated twitch numeric id — see heatsync_userid_collision_kick_twitch in
// project memory). There is no way to tell twitch-space and kick-space apart
// from the id VALUE alone, so the guard here is structural, not a value check:
// queuePaintLookup is ONLY ever called from queueMcCosmeticsLookup (main.js),
// the exact same choke point already used for 7TV cosmetics — which has the
// identical collision risk and is already correct: kick/YouTube chatters only
// ever reach that function with a RESOLVED twitch id (see flushKickNameLookups /
// flushYtNameLookups in main.js, which set m.userId to the linked twitch id
// returned by the 7TV kick/youtube lookup — never the bare kick/yt id). Twitch
// chatters reach it with their native twitch id directly (also safe — that IS
// twitch-id-space). Do not add a second call site that queues a paint lookup
// directly from a raw platform-native id.
//
// Pipeline:
//   1. queuePaintLookup(uid) batches ids (debounced, <=50/batch) and asks the
//      BG service worker (fetch_paints) — content scripts never fetch
//      heatsync.org directly (Cloudflare edge 503s those; see fetch_recent_messages
//      in chrome/background.js for the exact reasoning).
//   2. compilePaintCss() once per distinct spec hash, appended to a single
//      <style id="hs-mc-paints"> sheet (never re-injected for a hash already
//      present — many users can and will share identical specs).
//   3. hsPaintRender(uid, rawText) is the single render-time helper every
//      username surface uses: returns null when no HS paint is cached (caller
//      keeps its existing 7TV/plain-color rendering), or { cls, html, splitAttr }
//      when one is — callers add `cls` to the element's class list and skip
//      any competing inline color/7TV-paint style (heatsync paint wins).

const HS_PAINT_CACHE_MAX = 500
const HS_PAINT_BATCH_SIZE = 50
const HS_PAINT_BATCH_DELAY = 100
// Mirrors MC_COSMETICS_PENDING_MAX (main.js) — a very busy/firehose channel
// can queue unique uids faster than the batch drain rate; cap so the pending
// Set can't grow unbounded between flushes.
const HS_PAINT_PENDING_MAX = 3000

const hsPaintCache = new Map() // uid -> { spec: object|null, hash: string|null }
const hsPaintInjectedHashes = new Set()
const hsPaintPending = new Set()
let hsPaintBatchTimer = null
let hsPaintSheetEl = null

// ── pure helpers (unit-testable without DOM/network) ────────────────────────

/**
 * Evict the oldest entry from `map` if it is at/over `max` capacity.
 * Map iteration order is insertion order, so `.keys().next()` is oldest.
 */
function evictOldestPaintEntry(map, max) {
  if (map.size >= max) {
    const oldest = map.keys().next().value
    if (oldest !== undefined) map.delete(oldest)
  }
}

/**
 * Split `queue` (a Set/iterable of ids) into the next batch (<=batchSize,
 * newest-queued first — the user is looking at the bottom of the buffer, so
 * the visible viewport resolves before off-screen/scrolled-away chatters,
 * mirroring flushMcCosmeticsBatch's drain order) and the remainder. Pure —
 * does not mutate the input.
 */
function partitionPaintBatch(queue, batchSize) {
  const all = [...queue]
  return { batch: all.slice(-batchSize), rest: all.slice(0, Math.max(0, all.length - batchSize)) }
}

/** Per-letter span data for a username: `{ mid, letters: [{ch, i}] }`. Matches
 * the site's splitter exactly — mid = (length-1)/2, i = index. */
function computeHsLetterSpans(text) {
  const chars = [...String(text ?? '')]
  return {
    mid: (chars.length - 1) / 2,
    letters: chars.map((ch, i) => ({ ch, i })),
  }
}

/** Build the innerHTML for a letter-split username: one <span> per glyph with
 * --i/--mid custom properties. Takes raw (unescaped) text — each glyph is
 * escaped individually, so this is safe to call on el.textContent directly. */
function splitHsLettersHtml(rawText) {
  const { mid, letters } = computeHsLetterSpans(rawText)
  return letters.map(({ ch, i }) => `<span style="--i:${i};--mid:${mid}">${escapeHtml(ch)}</span>`).join('')
}

// ── settings gate (guarded — this module is imported standalone in tests) ───

function hsPaintsEnabled() {
  if (typeof getSetting !== 'function') return true
  return getSetting('showNamePaints') !== false
}

// ── stylesheet management ────────────────────────────────────────────────────

function ensureHsPaintSheet() {
  if (hsPaintSheetEl && hsPaintSheetEl.isConnected) return hsPaintSheetEl
  hsPaintSheetEl = document.getElementById('hs-mc-paints')
  if (!hsPaintSheetEl) {
    hsPaintSheetEl = document.createElement('style')
    hsPaintSheetEl.id = 'hs-mc-paints'
    // Single kill-switch: every hsp_* animation pauses under reduced motion,
    // regardless of how many per-hash rules get appended after this.
    hsPaintSheetEl.textContent =
      '@media (prefers-reduced-motion: reduce){[class*="hsp-"],[class*="hsp-"] *{animation-play-state:paused !important;}}'
    const tracked =
      typeof cleanup !== 'undefined' && cleanup.trackNode ? cleanup.trackNode(hsPaintSheetEl) : hsPaintSheetEl
    document.head.appendChild(tracked)
  }
  return hsPaintSheetEl
}

/** Compile + append the CSS for `hash` if not already present. Idempotent. */
function ensureHsPaintRule(spec, hash) {
  if (hsPaintInjectedHashes.has(hash)) return
  const sheet = ensureHsPaintSheet()
  const css = compilePaintCss(spec, `.hsp-${hash}`, { hash })
  if (!css) return
  sheet.textContent += css
  hsPaintInjectedHashes.add(hash)
}

/** Toggle-off hygiene: drop the injected sheet + hash tracking so a later
 * toggle-on recompiles clean rather than leaving stale/duplicate CSS. Cache
 * entries (spec/hash per uid) are kept — no need to re-fetch, only re-inject. */
function clearHsPaintSheet() {
  if (hsPaintSheetEl?.parentNode) hsPaintSheetEl.parentNode.removeChild(hsPaintSheetEl)
  hsPaintSheetEl = null
  hsPaintInjectedHashes.clear()
}

// ── public cache API ─────────────────────────────────────────────────────────

/** @returns {string} the `hsp-<hash>` class to add to the element, or '' if none. */
function getHsPaintClass(userId) {
  if (!hsPaintsEnabled()) return ''
  const entry = hsPaintCache.get(userId)
  if (!entry || !entry.hash) return ''
  return `hsp-${entry.hash}`
}

/** @returns {object|null} the raw validated spec (for paintNeedsLetterSplit checks). */
function getHsPaintSpec(userId) {
  if (!hsPaintsEnabled()) return null
  return hsPaintCache.get(userId)?.spec ?? null
}

/** True if `userId` has a resolved (non-null) HeatSync paint right now. Used
 * by the 7TV cosmetics path to yield precedence — a HeatSync paint is the
 * user's own choice on our platform and always wins over their 7TV paint. */
function hasResolvedHsPaint(userId) {
  return !!getHsPaintSpec(userId)
}

function setHsPaintEntry(userId, spec) {
  if (!spec) {
    if (!hsPaintCache.has(userId)) evictOldestPaintEntry(hsPaintCache, HS_PAINT_CACHE_MAX)
    hsPaintCache.set(userId, { spec: null, hash: null })
    return
  }
  const hash = hashPaintSpec(spec)
  ensureHsPaintRule(spec, hash)
  if (!hsPaintCache.has(userId)) evictOldestPaintEntry(hsPaintCache, HS_PAINT_CACHE_MAX)
  hsPaintCache.set(userId, { spec, hash })
}

/**
 * Queue a resolved-twitch-space uid for a paint lookup. Debounced + batched.
 * See the ID-SPACE SAFETY note at the top of this file — never call this with
 * a raw kick/YouTube id.
 */
function queuePaintLookup(userId) {
  if (!userId) return
  if (hsPaintCache.has(userId)) return
  if (!hsPaintsEnabled()) return
  if (hsPaintPending.size >= HS_PAINT_PENDING_MAX) return
  hsPaintPending.add(userId)
  if (!hsPaintBatchTimer) hsPaintBatchTimer = cleanup.setTimeout(flushHsPaintBatch, HS_PAINT_BATCH_DELAY)
}

async function flushHsPaintBatch() {
  hsPaintBatchTimer = null
  if (!hsPaintPending.size) return
  const { batch, rest } = partitionPaintBatch(hsPaintPending, HS_PAINT_BATCH_SIZE)
  hsPaintPending.clear()
  for (const id of rest) hsPaintPending.add(id)

  let paints = null
  try {
    const resp = await safeSendMessage({ type: 'fetch_paints', userIds: batch })
    if (resp && resp.paints && typeof resp.paints === 'object') paints = resp.paints
  } catch (e) {
    paints = null
  }

  if (paints) {
    // BG only includes a key for ids it has a CONFIRMED answer for (positive
    // spec, or a confirmed negative) — see the fetch_paints handler in
    // chrome/background.js. An id absent from `paints` means BG couldn't
    // resolve it this round (transient failure); requeue it instead of
    // caching a false negative that would mask a real paint until reload.
    const changed = []
    for (const id of batch) {
      if (Object.hasOwn(paints, id)) {
        setHsPaintEntry(id, paints[id])
        if (paints[id]) changed.push(id)
      } else {
        hsPaintPending.add(id)
      }
    }
    if (changed.length && typeof updateHsPaintsInPlace === 'function') updateHsPaintsInPlace(changed)
  } else {
    // BG unreachable entirely — put the whole batch back so the next flush
    // retries instead of silently caching everyone in it as "no paint".
    for (const id of batch) hsPaintPending.add(id)
  }

  if (hsPaintPending.size > 0 && !hsPaintBatchTimer) {
    hsPaintBatchTimer = cleanup.setTimeout(flushHsPaintBatch, HS_PAINT_BATCH_DELAY * 5)
  }
}

/**
 * Single render-time helper every username surface (sender row, inline
 * @mention, reply-context bar) calls. Returns null when no HeatSync paint is
 * cached for `userId` — the caller falls back to its existing 7TV/plain-color
 * rendering unchanged. Returns `{ cls, html, splitAttr }` when one is active:
 * `cls` goes on the element's class list, `html` replaces the escaped-name
 * text (already letter-split + escaped when the spec needs it), `splitAttr`
 * is a ready-to-splice ` data-hs-paint-split="1"` marker so a later in-place
 * repaint (updateHsPaintsInPlace) doesn't re-split already-split text.
 */
function hsPaintRender(userId, rawText) {
  if (!userId) return null
  const cls = getHsPaintClass(userId)
  if (!cls) return null
  const spec = getHsPaintSpec(userId)
  const needsSplit = paintNeedsLetterSplit(spec)
  return {
    cls,
    html: needsSplit ? splitHsLettersHtml(rawText) : escapeHtml(rawText),
    splitAttr: needsSplit ? ' data-hs-paint-split="1"' : '',
  }
}

/** In-place DOM application shared by updateHsPaintsInPlace (main.js) — adds
 * the hsp-<hash> class (dropping any stale one), clears the element's inline
 * style attribute (precedence: a HeatSync paint always wins over whatever
 * 7TV inline style/plain color a prior render or cosmetics batch set — an
 * inline style has higher specificity than any class rule, so it MUST be
 * cleared or the class-based paint would silently lose), and letter-splits
 * the text once if the spec needs it and it hasn't been split yet. */
function applyHsPaintToElement(el, userId) {
  if (!el) return
  const cls = getHsPaintClass(userId)
  const spec = getHsPaintSpec(userId)
  if (!cls || !spec) return
  if (!el.classList.contains(cls)) {
    for (const c of [...el.classList]) {
      if (c.startsWith('hsp-')) el.classList.remove(c)
    }
    el.classList.add(cls)
  }
  if (el.hasAttribute('style')) el.removeAttribute('style')
  if (paintNeedsLetterSplit(spec) && !el.dataset.hsPaintSplit) {
    el.innerHTML = splitHsLettersHtml(el.textContent)
    el.dataset.hsPaintSplit = '1'
  }
}

export {
  applyHsPaintToElement,
  clearHsPaintSheet,
  computeHsLetterSpans,
  evictOldestPaintEntry,
  getHsPaintClass,
  getHsPaintSpec,
  hasResolvedHsPaint,
  hsPaintRender,
  partitionPaintBatch,
  queuePaintLookup,
  splitHsLettersHtml,
}
