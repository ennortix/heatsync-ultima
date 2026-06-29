// Buffer-vim for the overlay — the website's buffer-vim (client/vim/*) ported
// to the multichat overlay, adapted to its constraints:
//   • HOVER-scoped + cooperative — only acts while the overlay is hovered and
//     consumes only matched keys, so it never hijacks the host page (twitch
//     space=pause, f=fullscreen) or collides with input-vi (it bails on typing).
//   • SNAPSHOT-on-enter — the live chat churns (rows append / 500-cap evict), so
//     visual mode captures the row list once on `v`; indices can't drift mid-range.
//   • viModeEnabled-gated — only opted-in power users ever see it.
//
// Concatenated (no imports); main.js wires the keydown + injects operators.
// All names Hs-prefixed to stay clear of the shared bundle scope.

const HS_VIM_ALPHABET = 'fjdkslaghrueiwoqptyvncmxzb'

// ─── mode-line (btop-style, only while in a modal mode) ───────────────────────
class HsOverlayModeLine {
  constructor(root) { this.root = root; this.el = null }
  set(mode, extra) {
    if (mode === 'normal' || !mode) { this.el?.remove(); this.el = null; return }
    if (!this.el) {
      this.el = document.createElement('div')
      this.el.className = 'hs-vim-modeline'
      this.root.appendChild(this.el)
    }
    this.el.dataset.mode = mode
    this.el.textContent = `-- ${mode.toUpperCase()} --`
    if (extra) {
      const c = document.createElement('span')
      c.className = 'hs-vim-modeline-count'
      c.textContent = extra
      this.el.appendChild(c)
    }
  }
}

// ─── hint mode (vimium-style keyboard clicking) ───────────────────────────────
function hsVimMakeLabels(n) {
  const a = HS_VIM_ALPHABET.split('')
  if (n <= a.length) return a.slice(0, n)
  const out = []
  for (const x of a) for (const y of a) { out.push(x + y); if (out.length >= n) return out }
  return out
}

class HsOverlayHint {
  constructor({ root, modeLine, selector }) {
    this.root = root
    this.modeLine = modeLine
    this.selector = selector
    this.active = false
    this.typed = ''
    this.targets = []
    this.layer = null
  }
  _visible(el) {
    const r = el.getBoundingClientRect()
    if (r.width <= 1 || r.height <= 1) return false
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false
    return el.offsetParent !== null || getComputedStyle(el).position === 'fixed'
  }
  enter({ newTab = false } = {}) {
    if (this.active) this.exit()
    const els = Array.from(this.root.querySelectorAll(this.selector)).filter((e) => this._visible(e))
    const set = new Set(els)
    const leaves = els.filter((el) => !els.some((o) => o !== el && el.contains(o) && set.has(o)))
    if (!leaves.length) return false
    const labels = hsVimMakeLabels(leaves.length)
    this.active = true
    this.newTab = newTab
    this.typed = ''
    this.targets = leaves.map((el, i) => ({ el, label: labels[i] }))
    this.layer = document.createElement('div')
    this.layer.className = 'hs-vim-hint-layer'
    for (const t of this.targets) {
      const r = t.el.getBoundingClientRect()
      const chip = document.createElement('span')
      chip.className = 'hs-vim-hint'
      chip.textContent = t.label
      chip.style.left = `${Math.max(0, r.left)}px`
      chip.style.top = `${Math.max(0, r.top)}px`
      t.chip = chip
      this.layer.appendChild(chip)
    }
    document.body.appendChild(this.layer)
    this.modeLine?.set('hint')
    return true
  }
  handleKey(e) {
    if (!this.active) return false
    const k = e.key
    if (k === 'Escape') { this.exit(); return true }
    if (k === 'Backspace') { this.typed = this.typed.slice(0, -1); this._repaint(); return true }
    if (k.length !== 1 || !HS_VIM_ALPHABET.includes(k.toLowerCase())) { this.exit(); return true }
    this.typed += k.toLowerCase()
    const exact = this.targets.find((t) => t.label === this.typed)
    if (exact) { const el = exact.el; this.exit(); this._fire(el); return true }
    if (!this.targets.some((t) => t.label.startsWith(this.typed))) { this.exit(); return true }
    this._repaint()
    return true
  }
  _fire(el) {
    if (this.newTab) {
      const href = el.getAttribute?.('href') || el.closest?.('a[href]')?.getAttribute('href')
      if (href) { window.open(href, '_blank', 'noopener'); return }
    }
    el.click()
  }
  _repaint() {
    for (const t of this.targets) {
      if (!t.chip) continue
      const match = t.label.startsWith(this.typed)
      t.chip.classList.toggle('hs-vim-hint--inactive', !match)
      if (match && this.typed) {
        t.chip.textContent = ''
        const s = document.createElement('span')
        s.className = 'hs-vim-hint-typed'
        s.textContent = this.typed
        t.chip.appendChild(s)
        t.chip.appendChild(document.createTextNode(t.label.slice(this.typed.length)))
      }
    }
  }
  exit() {
    if (!this.active) return
    this.active = false
    this.layer?.remove()
    this.layer = null
    this.targets = []
    this.typed = ''
    this.modeLine?.set('normal')
  }
}

// ─── visual mode (range-select over a frozen snapshot of rows) ─────────────────
class HsOverlayVisual {
  constructor({ rowData, modeLine, notify, onQuote, onEnter, onExit }) {
    this.rowData = rowData
    this.modeLine = modeLine
    this.notify = notify || (() => {})
    this.onQuote = onQuote
    this.onEnter = onEnter
    this.onExit = onExit
    this.active = false
    this.rows = []
    this.anchor = 0
    this.cursor = 0
    this.count = ''
  }
  enter(rows) {
    if (!rows || !rows.length) { this.notify('no messages'); return false }
    this.active = true
    this.rows = rows               // snapshot — churn can't shift these
    this.anchor = rows.length - 1  // newest row (bottom)
    this.cursor = rows.length - 1
    this.count = ''
    this._render()                 // render first so the cursor shows on `v`
    try { this.onEnter?.() } catch (e) {} // best-effort side-effect, never blocks render
    return true
  }
  _range() { return [Math.min(this.anchor, this.cursor), Math.max(this.anchor, this.cursor)] }
  _selected() { const [a, b] = this._range(); return this.rows.slice(a, b + 1) }
  _takeCount() { const n = this.count ? parseInt(this.count, 10) : 1; this.count = ''; return Math.max(1, Math.min(n, 9999)) }
  handleKey(e) {
    if (!this.active) return false
    const k = e.key
    const last = this.rows.length - 1
    if (k === 'Escape' || k === 'v') { this.exit(); return true }
    if ((k >= '1' && k <= '9') || (k === '0' && this.count)) { this.count += k; return true }
    if (k === 'j' || k === 'ArrowDown') { this.cursor = Math.min(last, this.cursor + this._takeCount()); this._render(); return true }
    if (k === 'k' || k === 'ArrowUp') { this.cursor = Math.max(0, this.cursor - this._takeCount()); this._render(); return true }
    if (k === 'g') { this.cursor = 0; this._render(); return true }
    if (k === 'G') { this.cursor = last; this._render(); return true }
    if (k === 'o') { [this.anchor, this.cursor] = [this.cursor, this.anchor]; this._render(); return true }
    const sel = this._selected().map((el) => this.rowData(el))
    if (k === 'y') return this._copy(sel.map((s) => s.text).filter(Boolean).join('\n'), `copied ${sel.length}`)
    if (k === 'a') return this._copy(sel.map((s) => s.permalink).filter(Boolean).join('\n'), `copied ${sel.length} link${sel.length > 1 ? 's' : ''}`)
    if (k === 'q') { const f = sel[0]; if (f?.id) this.onQuote?.(f.id); this.exit(); return true }
    return true // swallow stray keys, stay in visual
  }
  _copy(text, msg) {
    if (text) { navigator.clipboard?.writeText(text); this.notify(msg) } else this.notify('nothing to copy')
    this.exit()
    return true
  }
  _render() {
    for (const r of this.rows) r.classList.remove('hs-vim-sel', 'hs-vim-cursor')
    const [a, b] = this._range()
    for (let i = a; i <= b && i < this.rows.length; i++) this.rows[i].classList.add('hs-vim-sel')
    const cur = this.rows[this.cursor]
    if (cur) { cur.classList.add('hs-vim-cursor'); cur.scrollIntoView?.({ block: 'nearest' }) }
    this.modeLine?.set('visual', `${b - a + 1} sel`)
  }
  exit() {
    if (!this.active) return
    this.active = false
    this.count = ''
    for (const r of this.rows) r.classList.remove('hs-vim-sel', 'hs-vim-cursor')
    this.rows = []
    this.modeLine?.set('normal')
    this.onExit?.()
  }
}
