// Styles - all CSS for multichat panel, tabs, messages, modals

// ============================================
// STYLES (injected once)
// ============================================

function injectStyles() {
  if (document.getElementById('hs-mc-styles')) return;

  const style = document.createElement('style');
  style.id = 'hs-mc-styles';
  const css = `
    /* Resize-bar tokens — one source of truth for every orange drag-bar.
       4px visible line; ::before extends the grab zone by --hs-resize-grab
       per side. Mirrors heatsync.org's --resize-thickness / --resize-grab. */
    :root {
      --hs-resize-thickness: 4px;
      --hs-resize-grab: 4px;
    }
    /* Bundled bitmap fonts — URLs replaced via chrome.runtime.getURL after
       template evaluation (woff2 lives in chrome/fonts/, exposed via
       web_accessible_resources). font-display:block prevents FOUT flash.
       Explicit weight/style + font-synthesis:none (in .hs-font-bitmap rule
       below) prevent the browser from faux-bolding when CSS asks for 600+. */
    @font-face {
      font-family: 'CozetteVector';
      src: url('__HS_FONT_COZETTE__') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }
    @font-face {
      font-family: 'GohuFont';
      src: url('__HS_FONT_GOHU__') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }

    /* Bitmap-font mode — mirrors heatsync.org's base.css crisp-pixel block.
       Toggled by applyFontSettings when CozetteVector or GohuFont is active.
       The hidden killer was font-kerning + OpenType feature settings:
       kern/liga/clig/calt subpixel-position glyphs by fractional amounts
       based on adjacent character pairs, smearing bitmap text even when
       smoothing is off. font-optical-sizing handles variable-font axes
       that warp glyph metrics. Every property below MUST be set together —
       missing any one re-introduces blur on a subset of glyph pairs. */
    body.hs-font-bitmap,
    body.hs-font-bitmap *,
    body.hs-font-bitmap *::before,
    body.hs-font-bitmap *::after {
      -webkit-font-smoothing: none !important;
      -moz-osx-font-smoothing: unset !important;
      font-smooth: never !important;
      text-rendering: optimizeSpeed !important;
      font-synthesis: none !important;
      font-optical-sizing: none !important;
      font-kerning: none !important;
      font-variant-ligatures: none !important;
      font-variant-position: normal !important;
      font-feature-settings: "kern" 0, "liga" 0, "clig" 0, "calt" 0 !important;
      /* Fractional tracking (eg letter-spacing:0.3px) pushes bitmap glyphs off
         the integer pixel grid -- the same smear as kerning. Zero it globally;
         the AA counter-rule below restores normal tracking for vector surfaces. */
      letter-spacing: 0 !important;
    }
    /* Counter-rule: a handful of surfaces explicitly use NON-bitmap fonts
       (system sans, Inter, ui-monospace) where the user expects AA + kern.
       Order matters — these rules must come after the bitmap rule. */
    body.hs-font-bitmap .hs-pcard,
    body.hs-font-bitmap .hs-pcard *,
    body.hs-font-bitmap .hs-notif,
    body.hs-font-bitmap .hs-notif *,
    body.hs-font-bitmap .hs-mc-pred-result-amount,
    body.hs-font-bitmap .hs-heat-num {
      -webkit-font-smoothing: subpixel-antialiased !important;
      -moz-osx-font-smoothing: auto !important;
      font-smooth: auto !important;
      font-synthesis: weight style !important;
      text-rendering: auto !important;
      font-optical-sizing: auto !important;
      font-kerning: auto !important;
      font-variant-ligatures: normal !important;
      font-feature-settings: normal !important;
      letter-spacing: normal !important;
    }
    /* Counter-counter: badges inside the system-sans surfaces (pcard, notifs)
       must still render bitmap. .hs-mc-badge is fixed at 13px CozetteVector
       (single font setting — see badge font spec); without this, AA + kern
       from the surface rule above smears the bitmap glyphs. */
    body.hs-font-bitmap .hs-pcard .hs-mc-badge,
    body.hs-font-bitmap .hs-notif .hs-mc-badge {
      -webkit-font-smoothing: none !important;
      -moz-osx-font-smoothing: unset !important;
      font-smooth: never !important;
      text-rendering: optimizeSpeed !important;
      font-synthesis: none !important;
      font-optical-sizing: none !important;
      font-kerning: none !important;
      font-variant-ligatures: none !important;
      font-feature-settings: "kern" 0, "liga" 0, "clig" 0, "calt" 0 !important;
      letter-spacing: 0 !important;
    }
    /* Tab bar - positioned at top of chat via render injection.
       Three flex sections (no-wrap outer): channel tabs fill left, platfilter
       sits center, util buttons pinned right. Channel-tabs section wraps
       INTERNALLY when overflowing — no orphan util-only row, no right-side
       gap. align-items:flex-start so right cluster sticks to first tab row
       when channels wrap to multiple rows. */
    #hs-mc-tabbar {
      display: flex;
      flex-wrap: nowrap;
      gap: 0;
      padding: 0;
      background: #000;
      border-bottom: 1px solid #808080;
      flex-shrink: 0;
      order: -1;
      z-index: 10;
      align-items: flex-start;
      box-sizing: border-box;
    }

    /* Chatterino-style composable tab states: idle → has-new → active.
       Channel tabs default to fluid (flex:1 1 auto) — adjacent tabs share
       row width so wrap-rows have no useless trailing gap. min-width keeps
       the channel label readable, max-width caps absurd growth. Util / pf
       buttons override below to flex:0 0 (fixed 18×18). margin pulls
       adjacent tabs into a shared 1px border (visual grid). padding-right
       reserves space for the live dot so it never overlaps text. */
    .hs-mc-tab {
      padding: 2px 10px !important;
      margin: 0 -1px -1px 0 !important;
      background: #000 !important;
      color: #808080 !important;
      border: 1px solid #808080 !important;
      border-radius: 0 !important;
      cursor: pointer !important;
      font-family: inherit;
      font-size: 13px !important;
      line-height: 1 !important;
      font-weight: 400 !important;
      white-space: nowrap !important;
      transition: none;
      /* flex-start, not center: centering a variable-width text run inside
         a fixed-width container produces a fractional X origin half the
         time, and Chrome with -webkit-font-smoothing:none does NOT snap the
         text run to integer pixels — so every glyph renders at a sub-pixel
         X and the bitmap font smears. Util buttons override this back to
         center (their single-glyph squares have integer math). */
      text-align: left;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      flex: 0 0 auto !important; /* content-sized — username width + padding, no grow */
      min-width: 0;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Idle hover — subtle brighten */
    .hs-mc-tab:not(.active):not(.has-new):hover {
      background: #fff !important;
      color: #000 !important;
    }
    /* New messages — activity indicator */
    .hs-mc-tab.has-new {
      background: #000 !important;
      color: #fff !important;
      border-color: #808080 !important;
    }
    /* Has-new hover */
    .hs-mc-tab.has-new:not(.active):hover {
      background: #fff !important;
      color: #000 !important;
    }
    /* Mentions — red when unseen */
    .hs-mc-tab.has-mentions {
      color: #ff0000 !important;
    }
    .hs-mc-tab.has-mentions:not(.active):hover {
      background: #fff !important;
      color: #ff0000 !important;
    }
    /* Active — focused tab. Weight stays at 400: Cozette ships only the
       regular face, and font-synthesis:none in the bitmap block tells the
       browser not to fake-bold — but requesting 600 against a single-weight
       bitmap font still nudges Chrome's text path off the crisp bitmap
       route in practice. White-on-black background already conveys focus. */
    .hs-mc-tab.active {
      background: #fff !important;
      color: #000 !important;
      border-color: #fff !important;
      font-weight: 400 !important;
    }
    /* Active ignores hover */
    .hs-mc-tab.active:hover {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-tab.has-new.active {
      color: #000 !important;
    }
    /* Stream event — yellow tab text (game switch) */
    .hs-mc-tab.has-stream-event {
      background: #000 !important;
      color: #ffff00 !important;
      border-color: #808080 !important;
    }
    .hs-mc-tab.has-stream-event:not(.active):hover {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-tab.has-stream-event.active {
      color: #000 !important;
    }
    /* "live" tab stays muted grey by default — never the white *active*
       highlight (so it never looks like the selected content tab). But it
       DOES take the normal white-bg/black-text on hover like every other
       tab/button (per request). #id prefix wins over all .class rules, so
       the grey default also holds through .active. */
    #hs-mc-tabbar .hs-mc-tab[data-tab="live"] {
      background: #000 !important;
      color: #808080 !important;
      border-color: #808080 !important;
      font-weight: 400 !important;
    }
    #hs-mc-tabbar .hs-mc-tab[data-tab="live"]:hover {
      background: #fff !important;
      color: #000 !important;
    }
    /* Horizontal mode: 3 real flex sections at the top level of #hs-mc-tabbar.
       Section sizes to its content (flex 0 1 auto) so pf+util pack tight to
       the last channel tab — no gap when few tabs. Section can shrink + tabs
       wrap when channels overflow available width. Vertical mode (.hs-tabs-
       left/right) overrides below to a column. */
    .hs-mc-tabs-scroll {
      display: flex;
      flex-wrap: wrap;
      flex: 0 1 auto;
      min-width: 0;
      gap: 0;
      align-content: flex-start;
      align-items: stretch;
    }
    .hs-mc-util-row {
      display: flex;
      flex: 0 0 auto;
      gap: 0;
      align-items: stretch;
    }
    /* Right-side cluster — wraps util-row + platfilter into a column.
       Horizontal mode: util on top, pf below (under util). Pinned to right
       of channel tabs. Vertical mode (left/right) override below. */
    .hs-mc-right-cluster {
      display: flex;
      flex-direction: column;
      flex: 0 0 auto;
      align-items: stretch;
      margin-left: -1px; /* collapse double border with adjacent tabs section */
    }
    /* Horizontal tabs (top/bottom): dissolve the section/cluster wrappers
       so all 14+ buttons (channel tabs + util + pf) flow as one wrapping
       stream and pack into the minimum number of rows. With the outer
       tabbar set to flex-wrap:wrap and the four wrappers (.hs-mc-tabs-
       scroll, .hs-mc-right-cluster, .hs-mc-util-row, #hs-mc-platfilter)
       on display:contents, every button becomes a direct flex child of
       #hs-mc-tabbar in DOM order. No more orphan empty space next to
       channel-tab rows that wrapped past the right cluster's height —
       util/pf squares slot into trailing space of the last channel-tab
       row before wrapping. Vertical mode (left/right) keeps its column
       structure (overrides further down). */
    body.hs-tabs-top #hs-mc-tabbar,
    body.hs-tabs-bottom #hs-mc-tabbar {
      flex-wrap: wrap;
    }
    body.hs-tabs-top .hs-mc-tabs-scroll,
    body.hs-tabs-bottom .hs-mc-tabs-scroll,
    body.hs-tabs-top .hs-mc-right-cluster,
    body.hs-tabs-bottom .hs-mc-right-cluster,
    body.hs-tabs-top .hs-mc-util-row,
    body.hs-tabs-bottom .hs-mc-util-row,
    body.hs-tabs-top #hs-mc-platfilter,
    body.hs-tabs-bottom #hs-mc-platfilter {
      display: contents;
    }
    /* Once dissolved, pf buttons are inline siblings of channel tabs +
       util buttons. Default flex:1 1 0 (sized within the pf cluster)
       would let them grow absurdly here, so pin to fixed 18px squares
       like every other util button. */
    body.hs-tabs-top #hs-mc-platfilter .hs-mc-pf-btn,
    body.hs-tabs-bottom #hs-mc-platfilter .hs-mc-pf-btn {
      flex: 0 0 18px !important;
      width: 18px !important;
      max-width: 18px !important;
    }
    /* Vertical mode: util-row becomes a real wrapping row of squares pinned
       to the bottom of the column, just below the platfilter — no vertical
       stacking, takes only the height it needs. */
    .hs-tabs-left .hs-mc-util-row,
    .hs-tabs-right .hs-mc-util-row {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      gap: 1px !important;
      width: 100% !important;
      box-sizing: border-box !important;
      justify-content: center !important;
      flex: 0 0 auto !important;
    }
    /* Util buttons (C, T, F-, F+, ⚙) AND platfilter buttons (T, K, Y) —
       btop-style packed squares: 18×18, tight border, share borders with the
       -1px right margin so the strip reads as a single segmented control. */
    .hs-mc-util-btn,
    .hs-mc-pf-btn {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      padding: 0 !important;
      margin: 0 -1px 0 0 !important;
      flex: 0 0 18px !important;
      box-sizing: border-box !important;
      font-size: 13px !important;
      /* line-height = box height keeps the glyph baseline on an integer
         pixel inside the 18px box. flex align-items:center placed the
         13px glyph at (18-13)/2 = 2.5px → half-pixel offset → Cozette
         bitmap glyphs rendered blurry. */
      line-height: 18px !important;
      letter-spacing: 0 !important;
      /* inline-block (not inline-flex) so the line-height anchors text
         baseline-aligned, not flex-centered. */
      display: inline-block !important;
      text-align: center !important;
      vertical-align: top !important;
      border-width: 1px !important;
      font-family: inherit !important;
      /* Cozette bitmap font needs the full crisp render block — without
         these, the browser anti-aliases the glyph and the buttons read
         as blurry-soft. mirrors heatsync.org base.css text rules. */
      -webkit-font-smoothing: none !important;
      font-smooth: never !important;
      text-rendering: optimizeSpeed !important;
      font-kerning: normal !important;
      font-feature-settings: "kern" 1, "liga" 1, "calt" 1 !important;
    }
    /* Last button in each cluster keeps its own right border (no overlap target) */
    .hs-mc-util-btn:last-child,
    .hs-mc-pf-btn:last-child {
      margin-right: 0 !important;
    }
    .hs-mc-util-btn {
      color: #808080 !important;
      border: 1px solid #808080 !important;
      font-weight: 400 !important;
      background: transparent !important;
    }
    .hs-mc-util-btn:hover {
      background: #fff !important;
      color: #000 !important;
      border-color: #fff !important;
    }
    /* Whisper conversation list */
    .hs-whisper-conv {
      padding: 6px 8px;
      cursor: pointer;
      border-bottom: 1px solid #000;
    }
    .hs-whisper-conv:hover {
      background: #fff;
      color: #000;
    }
    .hs-whisper-conv:hover .hs-whisper-preview,
    .hs-whisper-conv:hover .hs-whisper-time {
      color: #000;
    }
    .hs-whisper-preview {
      color: #808080;
      font-size: 13px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
    .hs-whisper-time {
      color: #808080;
      font-size: 13px;
      float: right;
    }
    .hs-whisper-unread {
      background: #ff8700;
      color: #000;
      font-size: 13px;
      font-weight: 700;
      padding: 0 4px;
      border-radius: 0;
      margin-left: 4px;
    }
    .hs-whisper-header {
      padding: 6px 8px;
      border-bottom: 1px solid #808080;
      font-size: 13px;
      position: sticky;
      top: 0;
      background: #000;
      z-index: 1;
    }
    .hs-whisper-back {
      cursor: pointer;
      margin-right: 6px;
      font-size: 14px;
    }
    .hs-whisper-back:hover {
      color: #ff8700;
    }
    .hs-whisper-self {
      opacity: 0.7;
    }
    .hs-whisper-pending {
      opacity: 0.45;
    }
    .hs-whisper-pending .hs-whisper-status {
      color: #ffaf00;
    }
    .hs-whisper-failed {
      background: rgba(255, 0, 0, 0.10);
    }
    .hs-whisper-failed .hs-whisper-status {
      color: #ff5555;
      font-weight: 700;
    }
    .hs-whisper-retry {
      cursor: pointer;
      text-decoration: underline;
    }
    .hs-whisper-retry:hover {
      color: #ff8700;
    }
    .hs-whisper-relogin {
      display: inline-block;
      padding: 1px 6px;
      margin-left: 4px;
      background: #ff8700;
      color: #fff !important;
      border-radius: 0;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
    .hs-whisper-relogin:hover {
      background: #fff;
      color: #000 !important;
    }
    .hs-mc-bits-badge {
      display: inline-block;
      padding: 0 4px;
      margin-right: 3px;
      background: #9146ff;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      vertical-align: middle;
    }
    #hs-mc-multistream-banner {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      background: #1a1a1a;
      border-bottom: 1px solid #ff8700;
      font-size: 13px;
      color: #fff;
    }
    #hs-mc-multistream-banner[hidden] {
      display: none;
    }
    .hs-mc-multi-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hs-mc-multi-link {
      background: #ff8700;
      color: #fff;
      border: 0;
      padding: 2px 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
    }
    .hs-mc-multi-link:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-multi-dismiss {
      background: transparent;
      color: #888;
      border: 0;
      padding: 0 4px;
      font-size: 16px;
      cursor: pointer;
    }
    .hs-mc-multi-dismiss:hover {
      color: #fff;
    }
    /* Inline stream event notifications. Single --evt custom prop per type drives
       left-stripe color, tinted-near-black bg, and text color. Replaces the old
       global rgba(128,128,0,0.25) olive wash which (a) composited muddy against
       zebra-striped chat rows and (b) clashed with per-type text colors (purple
       raid on yellow bg, green sub on yellow bg, etc.). 7% color-mix keeps bg
       visually "near-black with a hue suggestion" so saturated event text reads
       at full contrast while the 3px stripe carries type identification. */
    .hs-mc-stream-event {
      --evt: #ffff00;
      padding: 2px 4px 2px 8px;
      font-size: 13px;
      line-height: 18px;
      font-style: italic;
      border-left: 3px solid var(--evt);
      border-bottom: 1px solid #000;
      background: color-mix(in srgb, var(--evt) 7%, #000);
      color: var(--evt);
    }
    .hs-mc-stream-event .hs-mc-user { text-decoration: none; font-weight: bold; }
    .hs-mc-stream-event .hs-mc-user:hover { text-decoration: underline; }
    .hs-mc-stream-event .hs-evt-game { color: #fff; font-style: normal; }
    .hs-mc-stream-event.event-update  { --evt: #ffff00; }
    .hs-mc-stream-event.event-online  { --evt: #ff4444; }
    .hs-mc-stream-event.event-online .hs-evt-game { color: #fff; }
    .hs-mc-stream-event.event-offline { --evt: #888888; }
    .hs-mc-stream-event.event-raid    { --evt: #9146ff; }
    .hs-mc-stream-event.event-hype    { --evt: #00ffff; }
    .hs-mc-stream-event.event-sub     { --evt: #00ff7f; }
    .hs-mc-stream-event.event-redeem  { --evt: #00bfff; }
    .hs-mc-stream-event.event-emote   { --evt: #29d391; }
    .hs-mc-stream-event.event-pred    { --evt: #ffaa00; }
    .hs-mc-stream-event.event-follow  { opacity: 0.8; }
    /* Inline feed posts in chat timeline */
    .hs-mc-feed-inline {
      padding: 2px 8px;
      font-size: 13px;
      border-left: 3px solid #ff0000;
      border-bottom: 1px solid #000;
      color: #fff;
    }
    .hs-mc-feed-inline .hs-mc-ts { margin-right: 4px; }
    .hs-mc-feed-inline .hs-feed-body { color: #fff; }
    .hs-mc-feed-inline .hs-feed-thread-link {
      color: #ffff00; text-decoration: none; font-size: 13px; margin-right: 4px;
    }
    .hs-mc-feed-inline .hs-feed-thread-link:hover { text-decoration: underline; }
    .hs-mc-dm-inline {
      border-left-color: #ffff00;
    }
    /* Live dot — red indicator, composes with any state. Inset 3px from edge
       so it never lands on or past the border during bold-active layout
       shifts. No box-shadow so overflow:hidden ancestors can't clip it. */
    .hs-mc-tab {
      position: relative !important;
    }
    .hs-mc-tab[data-live="true"]::after {
      content: '';
      position: absolute;
      top: 3px;
      right: 3px;
      width: 6px;
      height: 6px;
      background: #f00;
      border-radius: 50%;
      pointer-events: none;
      z-index: 1;
    }
    .hs-mc-tab.active[data-live="true"]::after {
      background: #cc0000;
    }
    /* YT: position:fixed children already stop at clientWidth (left edge of
       the body scrollbar), so no extra gutter is needed — keep tabs flush to
       the scrollbar edge to match Twitch/Kick. */
    body.hs-platform-yt.hs-tabs-right.hs-chat-right #hs-mc-overlay,
    body.hs-platform-yt.hs-tabs-right.hs-chat-top #hs-mc-overlay,
    body.hs-platform-yt.hs-tabs-right.hs-chat-bottom #hs-mc-overlay,
    body.hs-platform-yt.hs-tabs-right.hs-chat-right #hs-mc-inputbar,
    body.hs-platform-yt.hs-tabs-right.hs-chat-top #hs-mc-inputbar,
    body.hs-platform-yt.hs-tabs-right.hs-chat-bottom #hs-mc-inputbar,
    body.hs-platform-yt.hs-tabs-right.hs-chat-right #hs-mc-emote-picker,
    body.hs-platform-yt.hs-tabs-right.hs-chat-top #hs-mc-emote-picker,
    body.hs-platform-yt.hs-tabs-right.hs-chat-bottom #hs-mc-emote-picker {
      right: 90px !important;
    }

    /* Overlay - fills chat container (below tab bar, above input bar) */
    #hs-mc-overlay {
      position: absolute;
      top: 38px; /* Default; dynamically adjusted by ResizeObserver */
      left: 0;
      right: 0;
      bottom: 52px; /* Leave room for input bar */
      background: #000;
      z-index: 1000;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    #hs-mc-overlay.visible {
      display: flex;
    }

    /* Unified resize-bar styling — 2px visible #ff8700 line + invisible
       ::before grab-zone (--hs-resize-grab per side). Mirrors heatsync.org's
       .hs-resizer. Each id below sets only position/size/cursor/z-index. */
    #hs-mc-resize-handle,
    #hs-yt-resize-handle,
    #hs-kick-resize-handle,
    #hs-c-resize-handle {
      background: #ff8700;
      opacity: 0.55;
      transition: opacity 0.12s;
    }
    #hs-mc-resize-handle::before,
    #hs-yt-resize-handle::before,
    #hs-kick-resize-handle::before,
    #hs-c-resize-handle::before {
      content: '';
      position: absolute;
      inset: calc(-1 * var(--hs-resize-grab));
    }
    #hs-mc-resize-handle:hover, #hs-mc-resize-handle:active,
    #hs-yt-resize-handle:hover, #hs-yt-resize-handle:active,
    #hs-kick-resize-handle:hover, #hs-kick-resize-handle:active,
    body:has(#hs-resize-overlay) #hs-kick-resize-handle {
      opacity: 1;
    }
    #hs-mc-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--hs-resize-thickness);
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
    }
    /* YouTube resize handle — left edge of #secondary sidebar */
    #hs-yt-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--hs-resize-thickness);
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
    }

    #hs-mc-messages {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      /* Bottom gets extra room so the last message clears the inputbar's top
         border and message descenders aren't clipped against it. */
      padding: 8px 8px 12px 8px;
      font-size: var(--hs-chat-font, 13px) !important;
      line-height: 18px !important;
      word-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
      box-sizing: border-box;
      /* Isolate paint/layout from the host Twitch column. Without this,
         every panel mutation forced a style recalc walk up through the
         2500-node React layout tree. paint clips repaints to this box,
         style blocks inherited cascade leakage, layout blocks the host
         from re-flowing through us. */
      contain: layout style paint;
    }
    /* Per-message rows: cheap containment + content-visibility:auto so the
       browser can skip layout/paint for rows that aren't in (or near) the
       viewport. The intrinsic-size keeps the scrollbar honest while rows
       are skipped. ~22-26px tall typical; 32px is conservative so we
       don't undercount and snap on scroll. */
    #hs-mc-messages > .hs-mc-msg {
      contain: layout style paint;
      content-visibility: auto;
      contain-intrinsic-size: auto 32px;
    }

    /* Chat overlay banners (predictions + polls at top of messages) */
    .hs-mc-chat-banner {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: -8px -8px 6px -8px;
      padding: 0;
    }
    .hs-mc-chat-banner-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      font-size: 13px;
      font-weight: 600;
      transition: background 0.15s;
    }
    .hs-mc-chat-banner-item:hover {
      filter: brightness(1.2);
    }
    .hs-mc-chat-banner-pred {
      background: linear-gradient(90deg, rgba(56,122,255,0.2), rgba(245,0,155,0.15));
      border-bottom: 1px solid rgba(56,122,255,0.3);
      color: #a8c8ff;
    }
    .hs-mc-chat-banner-poll {
      background: linear-gradient(90deg, rgba(0,200,100,0.15), rgba(0,188,212,0.1));
      border-bottom: 1px solid rgba(0,200,100,0.25);
      color: #80e0a0;
    }
    .hs-mc-chat-banner-pin {
      background: linear-gradient(90deg, rgba(191,148,255,0.12), rgba(145,70,255,0.08));
      border-bottom: 1px solid rgba(191,148,255,0.2);
      color: #d4bfff;
    }
    .hs-mc-chat-banner-hype {
      background: linear-gradient(90deg, rgba(255,135,0,0.15), rgba(255,60,60,0.1));
      border-bottom: 1px solid rgba(255,135,0,0.3);
      color: #ffb060;
    }
    .hs-mc-chat-banner-icon {
      font-size: 14px;
      flex-shrink: 0;
    }
    .hs-mc-chat-banner-title {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #fff;
    }
    .hs-mc-chat-banner-timer {
      font-family: 'SF Mono', 'Consolas', monospace;
      font-size: 13px;
      font-weight: 700;
      color: #ff8700;
      background: rgba(0,0,0,0.4);
      padding: 1px 5px;
      border-radius: 0;
      flex-shrink: 0;
    }
    .hs-mc-chat-banner-badge {
      font-size: 13px;
      font-weight: 700;
      color: #ff5050;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      flex-shrink: 0;
    }

    /* New messages button - floats above messages */
    #hs-mc-new-msgs {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      display: none;
      align-items: center;
      gap: 4px;
      background: #ff0;
      color: #000;
      border: none;
      border-radius: 0;
      padding: 4px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      z-index: 1005;
      transition: none;
    }
    #hs-mc-new-msgs:hover {
      background: #fff;
      color: #000;
    }
    .hs-arrow-down {
      font-size: 13px;
      line-height: 0;
      position: relative;
      top: -1px;
    }

    /* UNIFIED INPUT BAR - always visible at bottom */
    #hs-mc-inputbar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px;
      background: #000;
      border-top: 1px solid #808080;
      z-index: 1002;
      box-sizing: border-box;
    }

    /* NUKE native Twitch chat when our overlay is active (FFZ-style class toggle) */
    /* Hide native chat messages container */
    .hs-native-hidden [class*="chat-scrollable-area__message-container"],
    .hs-native-hidden [class*="chat-list--default"],
    .hs-native-hidden [class*="chat-list--other"],
    .hs-native-hidden [data-a-target="chat-scroller"] {
      display: none !important;
    }
    /* Hide native chat input area.
       Exception: keep the .chat-input wrapper visible when it contains the
       resub-share / sub-anniversary callout queue, so our floating-banner CSS
       below can surface it. */
    .hs-native-hidden [class*="chat-input-container"]:not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)),
    .hs-native-hidden [data-a-target="chat-input"]:not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)) {
      display: none !important;
    }
    /* Hide native chat header/room content — our elements are in #hs-mc-container (sibling) */
    .hs-native-hidden [class*="chat-room__content"] > *:not(.hs-pc-panel):not(.hs-profile-card):not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)) {
      display: none !important;
    }
    /* Collapse the native chat container itself so #hs-mc-container gets flex space.
       Exception: when the resub-share callout queue is present, keep this
       container in flow (zero box) so the fixed-positioned callout can render
       — position:fixed descendants still don't render under display:none. */
    [class*="chat-room__content"].hs-native-hidden:not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)) {
      display: none !important;
    }
    [class*="chat-room__content"].hs-native-hidden:has([data-test-selector="chat-private-callout-queue__callout-container"] *) {
      display: block !important;
      position: absolute !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      pointer-events: none !important;
    }
    /* HeatSync container — sibling of React's chat-room__content, outside React's tree.
       font-family + size driven by ui_settings.fontFamily / ui_settings.fontSize
       via CSS vars set on the container element in applyFontSettings() (main.js).
       Defaults: CozetteVector @ 13px to match heatsync.org's bitmap aesthetic. */
    #hs-mc-container {
      position: relative;
      display: flex;
      flex-direction: column;
      flex: 1;
      width: 100%;
      min-height: 0;
      overflow: hidden;
      background: #000;
      /* 'Noto Color Emoji' belongs in the body stack so color-emoji codepoints
         resolve to a known font with stable metrics — matching heatsync.org's
         --font-family-mono. Without it the browser picks an unpredictable
         system emoji font and the per-glyph advance can be fractional. */
      font-family: var(--hs-mc-font, 'CozetteVector'), 'Courier New', monospace, 'Noto Color Emoji';
      font-size: var(--hs-mc-base-size, 13px);
      /* Integer line-height (mirrors heatsync.org body 17px). Unitless lh
         multiplied by 13px = 18.2px = fractional baseline = bitmap blur on
         every line. Anything that inherits this stays on the pixel grid. */
      line-height: 17px;
      /* Cross-fade with the document_start prepaint pseudo-element. Container
         starts invisible; main.js sets opacity:1 after the overlay mounts +
         renders, so prepaint (fading out) and container (fading in) overlap
         and the user never sees a black gap or a tab-bar pop. */
      opacity: 0;
      transition: opacity 200ms ease-out;
    }
    #hs-mc-container.hs-mc-shown {
      opacity: 1;
    }

    /* CHAT HIDDEN STATE — chatPosition='hidden' collapses overlay; edge-pill restores */
    body.hs-chat-hidden #hs-mc-container { display: none !important; }
    body.hs-chat-hidden #hs-c-resize-handle,
    body.hs-chat-hidden #hs-mc-resize-handle,
    body.hs-chat-hidden #hs-kick-resize-handle,
    body.hs-chat-hidden #hs-yt-resize-handle { display: none !important; }
    body.hs-chat-hidden .chat-shell.hs-native-hidden,
    body.hs-chat-hidden [class*="chat-shell"].hs-native-hidden { display: none !important; }
    #hs-chat-restore-pill {
      position: fixed !important;
      background: #ff8700 !important;
      z-index: 2147483647 !important;
      cursor: pointer !important;
      transition: opacity 120ms ease-out !important;
      opacity: 0.85 !important;
      box-shadow: 0 0 4px rgba(255,135,0,0.5) !important;
    }
    #hs-chat-restore-pill:hover { opacity: 1 !important; }
    #hs-chat-restore-pill[data-edge="right"] { top: 25% !important; right: 0 !important; width: 6px !important; height: 50% !important; }
    #hs-chat-restore-pill[data-edge="left"] { top: 25% !important; left: 0 !important; width: 6px !important; height: 50% !important; }
    #hs-chat-restore-pill[data-edge="top"] { top: 0 !important; left: 25% !important; height: 6px !important; width: 50% !important; }
    #hs-chat-restore-pill[data-edge="bottom"] { bottom: 0 !important; left: 25% !important; height: 6px !important; width: 50% !important; }

    /* Vertical tabs: container gets row direction */
    .hs-tabs-left #hs-mc-container,
    .hs-tabs-right #hs-mc-container {
      flex-direction: row;
    }
    /* Keep chat-shell visible (our #hs-mc-container lives inside it) but hide native children */
    .chat-shell.hs-native-hidden,
    [class*="chat-shell"].hs-native-hidden {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
      min-width: 0 !important;
      background: #000 !important;
    }
    .chat-shell.hs-native-hidden > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card):not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)),
    [class*="chat-shell"].hs-native-hidden > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card):not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)) {
      display: none !important;
    }
    /* When the callout queue is present, the wrapper holding it (a Twitch
       Layout-sc-* div between chat-shell and chat-room__content) is excluded
       from the hide rule above and naturally expands to fill all flex space —
       starving #hs-mc-container down to h:0 so the overlay disappears. Collapse
       the wrapper to absolute 0×0; the callout is position:fixed so it still
       renders, and hs-mc-container reclaims its flex:1 height. */
    .chat-shell.hs-native-hidden > *:has([data-test-selector="chat-private-callout-queue__callout-container"] *):not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card),
    [class*="chat-shell"].hs-native-hidden > *:has([data-test-selector="chat-private-callout-queue__callout-container"] *):not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card) {
      display: block !important;
      position: absolute !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      pointer-events: none !important;
    }
    /* Ensure stream-chat ancestor also stays sized */
    [class*="stream-chat"].hs-native-hidden {
      display: flex !important;
      flex-direction: column !important;
      height: 100% !important;
    }
    .hs-native-hidden {
      background: #000 !important;
    }

    /* === NOTIF LAYERS (HsNotifs) ===
       Layer containers are positioned via CSS vars set by HsNotifs.updateLayout.
       Adding a new layer = registerLayer(name, ...) + matching CSS rule below.
       Empty layers collapse to 0×0 (overflow:hidden + no children) so they
       never leave a stray rectangle on the page. */
    .hs-notif-layer {
      position: fixed;
      z-index: 100000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow: visible;
      min-width: 0;
    }
    .hs-notif-layer:empty { display: none; }
    .hs-notif-layer > .hs-notif {
      pointer-events: auto;
      box-sizing: border-box;
      max-width: 100%;
      min-width: 0;
    }
    .hs-notif-layer-toast-stack {
      top: var(--hs-layer-toast-stack-top, 12px);
      right: var(--hs-layer-toast-stack-right, 20px);
      bottom: auto;
      align-items: flex-end;
      max-width: min(380px, calc(100vw - 40px));
    }
    .hs-notif-layer-chat-docked-bottom {
      bottom: var(--hs-layer-chat-docked-bottom-bottom, 0px);
      left: var(--hs-layer-chat-docked-bottom-left, 0px);
      right: var(--hs-layer-chat-docked-bottom-right, 0px);
    }
    .hs-notif-layer-chat-docked-top {
      top: var(--hs-layer-chat-docked-top-top, 0px);
      left: var(--hs-layer-chat-docked-top-left, 0px);
      right: var(--hs-layer-chat-docked-top-right, 0px);
    }

    /* Animations — slide in from the layer's edge, fade out on dismiss. */
    @keyframes hs-notif-slide-in-right {
      from { transform: translateX(calc(100% + 12px)); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    @keyframes hs-notif-slide-in-up {
      from { transform: translateY(calc(100% + 12px)); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    @keyframes hs-notif-slide-in-down {
      from { transform: translateY(calc(-100% - 12px)); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    @keyframes hs-notif-fade-out {
      from { transform: translateX(0); opacity: 1; }
      to   { transform: translateX(24%); opacity: 0; }
    }

    /* Base notif — flex row, accent strip on the left edge (set per level
       via --hs-notif-accent), tight padding, mono font for info-per-pixel
       density. container-type makes the notif queryable so internal types
       (resub-share, raid) can progressively collapse based on their own
       rendered width rather than the viewport. */
    .hs-notif {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 0;
      padding: 0;
      background: #0a0a0d;
      color: #efeff1;
      font: 12px/1.35 ui-monospace, 'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
      container-type: inline-size;
      border: 1px solid #2a2a2e;
      border-left: 3px solid var(--hs-notif-accent, #555);
      box-shadow: 0 6px 16px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset;
      animation: hs-notif-slide-in-right 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
      transform-origin: right center;
      will-change: transform, opacity;
    }
    /* Docked-bottom uses opacity-only fade-in so transform never offsets the
       flex child relative to its natural stacking position. The slide-in-up
       keyframe was getting stuck in its translateY pre-start state on
       simultaneous double-emit, visually pushing both banners below the input
       bar. Plain opacity fade always lands in the right spot. */
    .hs-notif-layer-chat-docked-bottom .hs-notif {
      animation-name: hs-notif-fade-in;
      transform-origin: bottom center;
    }
    @keyframes hs-notif-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .hs-notif-layer-chat-docked-top    .hs-notif { animation-name: hs-notif-slide-in-down; transform-origin: top center; }
    .hs-notif-exiting { animation: hs-notif-fade-out 160ms ease-in forwards !important; pointer-events: none; }
    @media (prefers-reduced-motion: reduce) {
      .hs-notif, .hs-notif-exiting { animation: none !important; }
    }

    /* Body — sole shrinkable child. flex-basis:0 lets actions render at
       their natural width first; body absorbs the rest, wrapping if long
       (not ellipsifying — chat status messages are short, error reasons
       can be long, both benefit from full readability). */
    .hs-notif-body {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      word-break: break-word;
    }
    .hs-notif-body-fallback { opacity: 0.55; font-style: italic; }
    .hs-notif-actions {
      display: inline-flex;
      gap: 0;
      flex: 0 0 auto;
      align-items: stretch;
      margin-left: auto;
    }
    .hs-notif-action {
      background: transparent;
      color: #efeff1;
      border: none;
      border-left: 1px solid #2a2a2e;
      padding: 0 12px;
      font: 600 11px/1 inherit;
      cursor: pointer;
      border-radius: 0;
      white-space: nowrap;
      transition: background 80ms linear, color 80ms linear;
    }
    .hs-notif-action:hover { background: #fff; color: #000; }
    .hs-notif-action:focus-visible { outline: 1px solid #ff8700; outline-offset: -2px; }
    .hs-notif-action-primary { color: #ff8700; font-weight: 700; }
    .hs-notif-action-primary:hover { background: #ff8700; color: #000; }
    .hs-notif-action-dismiss { padding: 0 10px; font-size: 14px; color: #848494; }
    .hs-notif-action-dismiss:hover { background: #ff4040; color: #000; }

    /* Toast-stack — every notif on this layer gets the toast aesthetic:
       icon prefix, level accent, click-to-dismiss cursor. Applies to the
       'toast' type AND any other type that opts in to the layer (e.g.
       server-mention-rule). */
    .hs-notif-layer-toast-stack > .hs-notif {
      min-width: 180px;
      max-width: 100%;
      cursor: pointer;
    }
    .hs-notif-toast-text { color: #efeff1; display: inline; }
    .hs-notif-toast-text::before {
      content: var(--hs-notif-icon, '·');
      color: var(--hs-notif-accent, #888);
      display: inline-block;
      width: 14px;
      margin-right: 8px;
      font-weight: 700;
      text-align: center;
      flex: 0 0 auto;
    }
    .hs-notif-toast-text.hs-notif-toast-success { --hs-notif-icon: '✓'; --hs-notif-accent: #00d65a; color: #c0f5d4; }
    .hs-notif-toast-text.hs-notif-toast-error   { --hs-notif-icon: '✕'; --hs-notif-accent: #ff4f4d; color: #ffd0cf; }
    .hs-notif-toast-text.hs-notif-toast-warn    { --hs-notif-icon: '!'; --hs-notif-accent: #ffff00; color: #ffffb8; }
    .hs-notif-toast-text.hs-notif-toast-info    { --hs-notif-icon: 'i'; --hs-notif-accent: #6aa0ff; color: #d0ddff; }
    .hs-notif-toast-text.hs-notif-toast-mention { --hs-notif-icon: '@'; --hs-notif-accent: #ff00ff; color: #ffd0ff; }
    /* Wrapper accent strip mirrors the text level (CSS custom property
       cascades from the inner span up via :has). */
    .hs-notif:has(.hs-notif-toast-success) { --hs-notif-accent: #00d65a; }
    .hs-notif:has(.hs-notif-toast-error)   { --hs-notif-accent: #ff4f4d; }
    .hs-notif:has(.hs-notif-toast-warn)    { --hs-notif-accent: #ffff00; }
    .hs-notif:has(.hs-notif-toast-info)    { --hs-notif-accent: #6aa0ff; }
    .hs-notif:has(.hs-notif-toast-mention) { --hs-notif-accent: #ff00ff; }
    .hs-notif-layer-toast-stack > .hs-notif:hover { background: #fff; }
    .hs-notif-layer-toast-stack > .hs-notif:hover .hs-notif-toast-text,
    .hs-notif-layer-toast-stack > .hs-notif:hover .hs-notif-toast-text::before {
      color: #000 !important;
    }

    /* === Statusbar — thin always-present strip at the top of the overlay.
       Holds the whole-chat collapse button + the inline toast status line, so
       status messages stop covering the read zone. ~20px, btop/dwl density. */
    #hs-mc-statusbar {
      flex: 0 0 auto;
      display: flex;
      align-items: stretch;
      height: 20px;
      min-height: 20px;
      background: #0a0a0d;
      border-bottom: 1px solid #2a2a2e;
      overflow: hidden;
    }
    #hs-mc-collapse-btn {
      flex: 0 0 auto;
      width: 26px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.06);
      color: #fff;
      border: none;
      border-right: 1px solid #2a2a2e;
      border-radius: 0;
      cursor: pointer;
      font: 700 16px/1 ui-monospace, 'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace;
      transition: background 80ms linear, color 80ms linear;
    }
    /* Arrow points toward the dock edge it collapses to (chat docks right by
       default → '>'). Position-aware so it always reads as "push away". */
    #hs-mc-collapse-btn::before { content: '>'; }
    body.hs-chat-left   #hs-mc-collapse-btn::before { content: '<'; }
    body.hs-chat-top    #hs-mc-collapse-btn::before { content: '\\2303'; }
    body.hs-chat-bottom #hs-mc-collapse-btn::before { content: '\\2304'; }
    /* Hover convention: invert to white bg / black text. */
    #hs-mc-collapse-btn:hover { background: #fff; color: #000; }
    #hs-mc-collapse-btn:focus-visible { outline: 1px solid #ff8700; outline-offset: -2px; }

    /* The toast slot lives in the bar's normal flex flow (not fixed). Override
       the floating-layer base so notifs render inline, single-line, no box. */
    .hs-notif-layer-statusbar {
      position: static;
      z-index: auto;
      flex: 1 1 0;
      min-width: 0;
      flex-direction: row;
      align-items: center;
      gap: 0;
      overflow: hidden;
      pointer-events: auto;
    }
    .hs-notif-layer-statusbar:empty { display: flex; } /* keep slot occupying bar width */
    .hs-notif-layer-statusbar > .hs-notif {
      flex: 1 1 0;
      min-width: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      animation: hs-notif-fade-in 140ms ease both;
      transform-origin: center;
      cursor: pointer;
    }
    .hs-notif-layer-statusbar .hs-notif-body {
      display: block;
      padding: 0 8px;
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-notif-layer-statusbar .hs-notif-toast-text { display: inline; white-space: nowrap; }
    .hs-notif-layer-statusbar > .hs-notif:hover .hs-notif-toast-text,
    .hs-notif-layer-statusbar > .hs-notif:hover .hs-notif-toast-text::before { color: #fff; }
    .hs-notif-layer-statusbar .hs-notif-exiting {
      animation: hs-notif-fade-out 120ms ease-in forwards !important;
    }
    /* Error/warn briefly flash the whole bar so a status-line error still
       grabs the eye despite being inline. */
    #hs-mc-statusbar:has(.hs-notif-toast-error) { animation: hs-statusbar-flash-err 700ms ease-out; }
    #hs-mc-statusbar:has(.hs-notif-toast-warn)  { animation: hs-statusbar-flash-warn 700ms ease-out; }
    @keyframes hs-statusbar-flash-err  { 0% { background: #3a0f0f; } 100% { background: #0a0a0d; } }
    @keyframes hs-statusbar-flash-warn { 0% { background: #38330d; } 100% { background: #0a0a0d; } }
    @media (prefers-reduced-motion: reduce) {
      #hs-mc-statusbar { animation: none !important; }
    }
    /* Channel-scope filter — HsNotifs flags any per-channel notif (e.g.
       twitch-resub-share, twitch-watchstreak-share) with this class when the
       active multichat tab doesn't match the notif's data.channel. Toggled
       on/off without remounting so re-entry to the matching tab restores
       the same notif instance with its timer + dismiss handlers intact. */
    .hs-notif.hs-notif-out-of-scope {
      display: none !important;
    }

    /* Chat-docked-bottom callouts (resub-share, sub-anniversary, raid alert)
       use a full-width band — reset the toast accent strip and edge borders
       in favor of an orange top edge that visually anchors the bar to the
       inputbar below. */
    .hs-notif-layer-chat-docked-bottom > .hs-notif {
      border: none;
      border-top: 1px solid #ff8700;
      border-bottom: 1px solid #808080;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.5);
      background: #0a0a0d;
    }
    .hs-notif-resub-body {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
    }
    .hs-notif-resub-icon {
      flex: 0 0 auto;
      font-size: 14px;
      color: #ff8700;
    }
    .hs-notif-resub-text {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    /* Progressive shortening — fires off .hs-notif's own width. The Share +
       ✕ buttons are ALWAYS visible; the message gives up parts of itself
       (prefix → suffix → " months" abbreviation → icon) to make room.
       Worst case: just "104mo" + buttons. Never just buttons-only.   */
    .hs-rt-mo { display: none; }
    @container (max-width: 280px) {
      .hs-notif-resub-body { font-size: 13px; }
      .hs-notif-action { padding: 2px 6px; font-size: 13px; }
      .hs-rt-prefix { display: none; }
    }
    @container (max-width: 220px) {
      .hs-rt-suffix { display: none; }
    }
    @container (max-width: 180px) {
      .hs-notif-resub-icon { display: none; }
    }
    @container (max-width: 140px) {
      .hs-rt-months { display: none; }
      .hs-rt-mo { display: inline; }
    }
    /* Watch-streak notif — same skeleton as resub, orange-themed, shorter text. */
    .hs-notif-watchstreak-body {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
    }
    .hs-notif-watchstreak-icon {
      flex: 0 0 auto;
      font-size: 14px;
    }
    .hs-notif-watchstreak-text {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #ffa040;
      font-weight: 600;
    }
    @container (max-width: 240px) {
      .hs-wt-prefix { display: none; }
    }
    @container (max-width: 180px) {
      .hs-wt-suffix { display: none; }
    }
    @container (max-width: 140px) {
      .hs-wt-stream { display: none; }
      .hs-notif-watchstreak-icon { display: none; }
    }
    /* Hide native Twitch resub-share callout queue — HsNotifs renders our own
       version in the chat-docked-bottom layer with controlled actions. */
    [data-test-selector="chat-private-callout-queue__callout-container"] {
      display: none !important;
    }

    /* Twitch private-callout queue (resub-share / sub-anniversary "Share" +
       "Pin to chat" prompt) lives inside .chat-input, which our overlay nukes.
       The :not(:has(...)) exclusions on the hide rules above keep the callout
       path visible. Dock the queue as a full-width bar locked directly above
       #hs-mc-inputbar — when the reply-indicator is added inside the inputbar
       it grows in height, the ResizeObserver in main.js fires _updateMcLayout,
       and the callout naturally floats above BOTH the reply-chip and input. */
    [data-test-selector="chat-private-callout-queue__callout-container"]:has(*) {
      /* Native callout stays hidden — our HsNotifs version (twitch-resub-share)
         renders the controlled UI from extracted data. The position-fixed bits
         below are inert as long as display:none from the base rule stands; kept
         as a safety net in case the base rule is overridden upstream. */
      position: fixed !important;
      top: auto !important;
      bottom: var(--hs-layer-chat-docked-bottom-bottom, 0px) !important;
      left: var(--hs-layer-chat-docked-bottom-left, 0px) !important;
      right: var(--hs-layer-chat-docked-bottom-right, 0px) !important;
      width: auto !important;
      max-width: 100vw !important;
      overflow: hidden !important;
      z-index: 100000 !important;
      pointer-events: auto !important;
      background: #18181b !important;
      border: none !important;
      border-top: 1px solid #ff8700 !important;
      border-bottom: 1px solid #808080 !important;
      border-radius: 0 !important;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.5) !important;
      box-sizing: border-box !important;
    }
    /* Hide Twitch's native Pin toggle on the callout — it pins the resub to
       the hidden native chat, which looks like the callout just disappeared.
       Our injected .hs-mc-callout-close X button replaces it. */
    [data-test-selector="chat-private-callout-queue__callout-container"] button[aria-label="pinned"] {
      display: none !important;
    }
    /* Flatten the callout to a single tight row — minimal vertical footprint.
       container-type makes .pinned-callout queryable so we can drop the icon /
       hide text entirely when chat gets too thin to fit the celebration line. */
    [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 4px 8px !important;
      min-height: 0 !important;
      line-height: 15px !important;
      min-width: 0 !important;
      max-width: 100% !important;
      overflow: hidden !important;
      container-type: inline-size !important;
    }
    [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout > * {
      margin: 0 !important;
      min-width: 0 !important;
    }
    /* Inline so multiple text spans concatenate; the wrapper handles ellipsis. */
    [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout :is(div, span, p):not(:has(button)) {
      display: inline !important;
      font-size: 13px !important;
      line-height: 15px !important;
    }
    /* Text wrapper — single block that ellipsifies when chat narrows.
       flex: 1 1 0 + min-width: 0 lets it shrink past content width, which is
       required for text-overflow:ellipsis inside a flex parent. */
    [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout > div:has(div, span, p) {
      display: block !important;
      flex: 1 1 0 !important;
      min-width: 0 !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    /* Icon — fixed small size, drop when chat is too thin. */
    [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout__icon {
      flex: 0 0 auto !important;
      width: 16px !important;
      height: 16px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
    }
    [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout__icon * {
      width: 16px !important;
      height: 16px !important;
      font-size: 14px !important;
    }
    /* Share button — shrinkable, with internal ellipsis. flex:0 1 auto +
       min-width:0 lets it compress instead of overflowing when chat narrows. */
    [data-test-selector="chat-private-callout-queue__callout-container"] [data-a-target="chat-private-callout__primary-button"] {
      padding: 2px 10px !important;
      font-size: 13px !important;
      min-height: 0 !important;
      height: auto !important;
      line-height: 18px !important;
      flex: 0 1 auto !important;
      min-width: 0 !important;
      max-width: 100% !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
    }
    /* Progressive shrink as the chat panel narrows. Container queries fire
       against .pinned-callout's own width — independent of viewport, so it
       degrades correctly for narrow chat in any tab-position layout. */
    @container (max-width: 280px) {
      [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout :is(div, span, p):not(:has(button)) {
        font-size: 13px !important;
      }
      [data-test-selector="chat-private-callout-queue__callout-container"] [data-a-target="chat-private-callout__primary-button"] {
        padding: 2px 6px !important;
        font-size: 13px !important;
      }
    }
    @container (max-width: 220px) {
      [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout__icon {
        display: none !important;
      }
    }
    @container (max-width: 160px) {
      [data-test-selector="chat-private-callout-queue__callout-container"] .pinned-callout > div:has(div, span, p) {
        display: none !important;
      }
    }
    .hs-mc-callout-close {
      background: transparent;
      border: none;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      padding: 2px 6px;
      margin-left: 0;
      line-height: 1;
      border-radius: 2px;
      flex: 0 0 auto;
    }
    .hs-mc-callout-close:hover {
      background: #fff;
      color: #000;
    }

    /* Permanent black backdrop on every Twitch/Kick chat-region ancestor.
       Twitch's right-column wrappers paint rgb(14,14,16) and rgb(24,24,27)
       (their dark-grey theme) — when chat-shell dimensions blip during SPA
       nav reflow, the grey bleeds through as a visible flash. Painting all
       ancestors solid black makes every blip imperceptible: black-on-black
       reveals nothing. Always-on, not gated to nav, since the user already
       sees pure-black chat in steady state. */
    .channel-root__right-column,
    .channel-root__right-column--expanded,
    aside#live-page-chat,
    .right-column .chat-shell,
    .right-column [class*="chat-shell"],
    .right-column [class*="stream-chat"] {
      background: #000 !important;
    }
    /* Twitch sets transition:all on chat-shell + its Layout-sc wrappers.
       During SPA nav these animate width/height changes, dragging the dark-
       grey theme through frames as the new chat-shell snaps in. Killing the
       transition removes the motion blur entirely — content swaps instantly
       behind our overlay instead of crossfading the grey through. Scoped to
       chat-region only so we don't disrupt Twitch's other animations. */
    .right-column .chat-shell,
    .right-column [class*="chat-shell"],
    .right-column [class*="stream-chat"],
    .channel-root__right-column,
    .channel-root__right-column > *,
    aside#live-page-chat,
    aside#live-page-chat > * {
      transition: none !important;
    }

    /* SPA-nav transition guard. While body.hs-mc-navigating is set we paint
       black on every chat-shell variant and force-hide all of its children
       except our overlay + profile card. Held from soft-nav entry until the
       new chat-shell is settled (≈300ms after reparent — enough to absorb
       Twitch's full render cycle, not so long that user notices a stall). */
    body.hs-mc-navigating .chat-shell,
    body.hs-mc-navigating [class*="chat-shell"],
    body.hs-mc-navigating [class*="stream-chat"],
    body.hs-mc-navigating #channel-chatroom,
    body.hs-mc-navigating .channel-root__right-column,
    body.hs-mc-navigating aside#live-page-chat {
      background: #000 !important;
    }
    body.hs-mc-navigating .chat-shell > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card),
    body.hs-mc-navigating [class*="chat-shell"] > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card),
    body.hs-mc-navigating [class*="stream-chat"] > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card),
    body.hs-mc-navigating #channel-chatroom > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card) {
      visibility: hidden !important;
    }

    /* During SPA nav on Kick, the panel pre-migrates to <body> so React's
       teardown of chat-layout doesn't take it down. Pin it in the eventual
       chat-layout slot via fixed positioning so it doesn't reflow into a
       weird body-default position mid-transition (visible quick flash).
       The post-reparent CSS in chat-layout swaps back to flex-relative. */
    body.hs-mc-navigating.hs-platform-kick.hs-chat-right > #hs-mc-container {
      position: fixed !important;
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: auto !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: 100vh !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }
    body.hs-mc-navigating.hs-platform-kick.hs-chat-left > #hs-mc-container {
      position: fixed !important;
      top: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      right: auto !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: 100vh !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }
    body.hs-mc-navigating.hs-platform-kick.hs-chat-top > #hs-mc-container {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: auto !important;
      width: 100vw !important;
      height: var(--hs-kick-chat-height, 35vh) !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }
    body.hs-mc-navigating.hs-platform-kick.hs-chat-bottom > #hs-mc-container {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      top: auto !important;
      width: 100vw !important;
      height: var(--hs-kick-chat-height, 35vh) !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }

    /* Twitch mirror: panel pinned fixed-overlay across the entire SPA-nav
       window. Covers the gap between .channel-root mounting (which strips
       hs-twitch-no-channel) and .chat-shell mounting (which gives the panel
       its real flex slot). Without this, mid-transition the body-mounted
       container has no positioning rules and collapses to default block flow
       — orange bar stays anchored, chat disappears until reparent finishes
       (the miniplayer→fullscreen bug). */
    body.hs-mc-navigating.hs-platform-twitch.hs-chat-right > #hs-mc-container {
      position: fixed !important;
      top: var(--hs-twitch-topnav-h, 50px) !important;
      bottom: 0 !important;
      right: 0 !important;
      left: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: auto !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }
    body.hs-mc-navigating.hs-platform-twitch.hs-chat-left > #hs-mc-container {
      position: fixed !important;
      top: var(--hs-twitch-topnav-h, 50px) !important;
      bottom: 0 !important;
      left: 0 !important;
      right: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: auto !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }
    body.hs-mc-navigating.hs-platform-twitch.hs-chat-top > #hs-mc-container {
      position: fixed !important;
      top: var(--hs-twitch-topnav-h, 50px) !important;
      left: 0 !important;
      right: 0 !important;
      bottom: auto !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }
    body.hs-mc-navigating.hs-platform-twitch.hs-chat-bottom > #hs-mc-container {
      position: fixed !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      top: auto !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
      z-index: 9999 !important;
      margin: 0 !important;
    }

    /* We provide our own collapse control (the '>' button in #hs-mc-statusbar),
       so Twitch's native collapse/expand arrow is redundant — hide it bulletproof.
       Pure CSS survives React re-renders (a one-shot JS removal wouldn't), and
       display:none !important beats Twitch's inline non-important display. Restore
       when hidden is handled by our orange #hs-chat-restore-pill + the \ key. */
    body.hs-platform-twitch .right-column__toggle-visibility { display: none !important; }
    /* If the right column still ends up collapsed (Twitch auto-collapses on
       narrow viewports), keep our container hidden and zero the column width.
       Arrow no longer needs to overflow out, so clip cleanly. */
    .right-column--collapsed #hs-mc-container { display: none !important; }
    .right-column--collapsed,
    .right-column--collapsed > *,
    div:has(> .right-column--collapsed) {
      width: 0px !important;
      min-width: 0px !important;
      overflow: hidden !important;
    }

    /* Ensure our elements are visible */
    #hs-mc-tabbar {
      display: flex !important;
    }
    #hs-mc-inputbar {
      display: flex !important;
    }
    #hs-mc-inputbar.hs-hidden {
      display: none !important;
    }

    .hs-mc-ts {
      color: #808080;
      font-size: 13px;
      margin-right: 4px;
      font-variant-numeric: tabular-nums;
    }
    .hs-mc-avatar {
      width: 18px;
      height: 18px;
      border-radius: 0;
      vertical-align: middle;
      margin-right: 3px;
      object-fit: cover;
    }
    span.hs-mc-avatar.hs-mc-avatar-fallback {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1;
      user-select: none;
    }
    .hs-mc-msg {
      padding: 2px 4px;
      border-radius: 0;
      font-size: var(--hs-chat-font, 13px) !important;
      /* 18px integer (mirrors heatsync.org main.css:629) — keep baseline on
         the pixel grid. 1.4 × 13px = 18.2px fractional half-leading makes
         every bitmap glyph render off-grid. */
      line-height: 18px !important;
      word-wrap: break-word;
      word-break: break-word;
      overflow-wrap: anywhere;
      overflow: hidden;
      max-width: 100%;
      box-sizing: border-box;
      color: #ffffff;
      content-visibility: auto;
      contain-intrinsic-size: auto 28px;
      unicode-bidi: plaintext;
    }
    .hs-feed-msg, .hs-mc-search-content, .hs-mc-post-body {
      unicode-bidi: plaintext;
    }
    .hs-mc-msg.hs-mc-zebra, .hs-feed-msg.hs-mc-zebra {
      background: #1f1f1f;
    }
    /* Hovered-row tint while the reply stack is shown — same dark olive as stack rows.
       Critical: ONLY change the background. Changing padding/line-height shrinks the
       row, which triggers chat auto-scroll-to-bottom adjustment AFTER showStack has
       already anchored the overlay → 8-15px visible gap. Pure visual change only. */
    .hs-mc-msg.hs-mc-reply-stack-active {
      background: #2e2e08 !important;
    }
    /* Dark olive bg lets full-color inline usernames through. Row base color is
       white for non-colored text (timestamps, plain message body) — inline
       user colors override naturally. No star-cascade so colored names breathe. */
    .hs-mc-msg.hs-mc-reply-stack-active,
    #hs-mc-reply-stack .hs-mc-reply-stack-row,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row {
      color: #fff;
    }
    /* Reply-chain stack overlay — viewport-bounded vertical stack of parent messages.
       Bottom edge butts directly against the hovered row (no border, no shadow below). */
    #hs-mc-reply-stack {
      box-sizing: border-box;
      background: #000;
      border: 1px solid #808000;
      border-bottom: none;
      z-index: 2147483647;
      pointer-events: auto;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      /* Overlay lives on <body>, outside #hs-mc-container — pull font from
         :root vars so rows render in Cozette at the panel size, not the
         host page's font (Inter/Roobert on Twitch). */
      font-family: var(--hs-mc-font, 'CozetteVector', 'Courier New', monospace);
      font-size: var(--hs-mc-base-size, 13px);
    }
    /* Down overlay — descendants stacked BELOW the hovered row. No top border so
       it butts snug against the row (top edge meets row's content bottom). */
    #hs-mc-reply-stack-down {
      box-sizing: border-box;
      background: #000;
      border: 1px solid #808000;
      border-top: none;
      z-index: 2147483647;
      pointer-events: auto;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      font-family: var(--hs-mc-font, 'CozetteVector', 'Courier New', monospace);
      font-size: var(--hs-mc-base-size, 13px);
    }
    /* Overlay rows must match native .hs-mc-msg height EXACTLY — same padding,
       same line-height. Mismatched heights make the olive stack look like a
       broken copy of the active row sitting above/below it. */
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row,
    #hs-mc-reply-stack .hs-mc-reply-stack-row {
      background: #2e2e08 !important;
      box-shadow: none !important;
      margin: 0 !important;
      /* override .hs-mc-msg's content-visibility:auto — we render at hover time
         and rows must paint immediately, not be replaced by a 28px placeholder */
      content-visibility: visible !important;
      contain-intrinsic-size: auto !important;
      /* The olive overlays sit above the active row in fixed position. Letting
         text selection span overlay→chat created a two-plane multi-range
         clipboard mess ("copies both planes"). Right-click → copy thread is
         the canonical path now; selection on overlay rows is disabled so a
         chat-row drag-select stays clean even when the cursor crosses the
         overlay region. */
      user-select: none;
      -webkit-user-select: none;
      cursor: default;
    }
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row .hs-mc-reply-btn,
    #hs-mc-reply-stack .hs-mc-reply-stack-row .hs-mc-reply-btn {
      display: none !important;
    }
    /* Zebra striping across the entire reply chain. Anchored to the active row
       (always #2e2e08): up-stack rows count from BOTTOM, down-stack rows count
       from TOP. Banded muted rows amplify the timeout/cleared opacity effect
       — visually rich rather than a wall of olive. */
    #hs-mc-reply-stack .hs-mc-reply-stack-row:nth-last-child(odd),
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row:nth-child(odd) {
      background: #1a1a04 !important;
    }
    /* Reply-context chip on dark olive rows — dim gray reads as skip-me
       metadata against the dark bg (was black against bright olive). */
    .hs-mc-msg.hs-mc-reply-stack-active .hs-mc-reply-ctx,
    .hs-mc-msg.hs-mc-reply-stack-active .hs-mc-reply-ctx *,
    #hs-mc-reply-stack .hs-mc-reply-stack-row .hs-mc-reply-ctx,
    #hs-mc-reply-stack .hs-mc-reply-stack-row .hs-mc-reply-ctx *,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row .hs-mc-reply-ctx,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row .hs-mc-reply-ctx * {
      color: #999 !important;
      -webkit-text-fill-color: #999 !important;
      border-left-color: #999 !important;
    }
    .hs-mc-reply-stack-chip {
      flex: 0 0 auto;
      padding: 2px 6px;
      font-size: 13px;
      font-weight: 700;
      color: #fff;
      background: #000;
      border-bottom: 1px solid #808000;
      cursor: pointer;
      text-align: center;
      user-select: none;
    }
    .hs-mc-reply-stack-chip:hover {
      color: #000;
      background: #fff;
    }
    /* Feed post-link hover preview stack */
    #hs-feed-postlink-preview {
      position: fixed;
      z-index: 2147483647;
      background: #000;
      border: 1px solid #808000;
      border-bottom: none;
      box-sizing: border-box;
      max-width: 600px;
      min-width: 280px;
      overflow: hidden;
      display: none;
      pointer-events: auto;
      font-family: var(--hs-mc-font, 'CozetteVector', 'Courier New', monospace);
      font-size: var(--hs-mc-base-size, 13px);
    }
    .hs-feed-postlink-preview-row {
      background: #2e2e08 !important;
      box-shadow: none !important;
      margin: 0 !important;
      border-bottom: 1px solid #555500;
      color: #fff;
    }
    .hs-feed-postlink-preview-row:last-child {
      border-bottom: none;
    }
    .hs-feed-postlink-preview-row:nth-child(even) {
      background: #1a1a04 !important;
    }
    /* Two classes (row + linked) to out-specify the :nth-child(even) zebra rule
       so the referenced post keeps its brighter highlight instead of blending
       into a zebra band. */
    .hs-feed-postlink-preview-row.hs-feed-postlink-preview-linked {
      background: #3a3a00 !important;
      border-left: 2px solid #ffff00 !important;
    }
    /* Brief flash on the message that the overflow chip scrolled to */
    .hs-mc-msg.hs-mc-thread-flash {
      animation: hs-mc-thread-flash 1.2s ease-out;
    }
    @keyframes hs-mc-thread-flash {
      0% { background: #2e2e08; }
      100% { background: transparent; }
    }
    .hs-mc-feed-inline, .hs-mc-stream-event {
      content-visibility: auto;
      contain-intrinsic-size: auto 32px;
    }
    .hs-mc-msg[data-msg-id] {
      position: relative;
    }
    .hs-mc-reply-btn {
      display: none;
      position: absolute;
      top: 1px;
      right: 2px;
      background: #000;
      border: 1px solid #808080;
      color: #fff;
      font-size: 13px;
      padding: 0 4px;
      cursor: pointer;
      line-height: 18px;
      z-index: 10;
    }
    .hs-mc-reply-btn:hover {
      color: #000;
      background: #fff;
    }
    .hs-mc-msg[data-msg-id]:hover .hs-mc-reply-btn {
      display: block;
    }
    /* Mod toolbar — singleton bar inserted into the hovered row as a sibling
       of .hs-mc-reply-btn. Pure CSS positioning: absolute, flush against the
       left edge of the reply button. Shared 1px #808080 dividers between
       buttons; last button's right border drops out to merge with the reply
       button's left border. Matches heatsync.org spec exactly. */
    .hs-mc-msg[data-msg-id] {
      position: relative;
    }
    .hs-mod-toolbar {
      position: absolute;
      top: 1px;
      right: 22px;
      z-index: 11;
      display: inline-flex;
      align-items: stretch;
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      border-right: 0;
      font: 13px/18px 'CozetteVector', monospace;
      user-select: none;
      height: 20px;
    }
    .hs-mod-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      padding: 0 5px;
      background: #000;
      color: #fff;
      border: 0;
      border-right: 1px solid #808080;
      font: inherit;
      cursor: pointer;
      line-height: 1;
    }
    .hs-mod-btn:last-child { border-right: 0; }
    .hs-mod-btn:hover { background: #fff; color: #000; }
    #hs-mc-reply-indicator {
      flex: 1 0 100%;
      order: -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #000;
      padding: 2px 6px;
      font-size: 13px;
      color: #fff;
      box-sizing: border-box;
    }
    #hs-mc-reply-indicator span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #hs-mc-reply-cancel {
      background: none;
      border: none;
      color: #808080;
      cursor: pointer;
      font-size: 13px;
      padding: 0 2px;
      line-height: 1;
    }
    #hs-mc-reply-cancel:hover {
      color: #000;
      background: #fff;
    }
    .hs-mc-muted {
      user-select: none;
    }
    .hs-mc-muted .hs-mc-user {
      color: #808080 !important;
      animation: none !important;
      background: none !important;
      -webkit-text-fill-color: #808080 !important;
    }
    .hs-mc-muted > :not(.hs-mc-user):not(.hs-mc-badge-img):not(.hs-mc-timestamp) {
      display: none !important;
    }
    .hs-mc-msg.hs-mc-system {
      border-left: 3px solid #9147ff;
      padding-left: 8px;
      background: rgba(145, 71, 255, 0.08);
    }
    .hs-mc-msg.hs-mc-kicks {
      border-left: 3px solid #ffd600;
      padding-left: 8px;
      background: rgba(255, 214, 0, 0.1);
    }
    .hs-mc-kicks .hs-mc-system-text {
      color: #ffd600;
      font-weight: 700;
    }
    .hs-mc-system-text {
      color: #b0b0b0;
      font-size: 13px;
      font-style: italic;
      display: block;
    }
    /* ANSI 0-15 semantic palette:
       red(9)=ban/blocked/error, green(10)=owned/untimeout/safe,
       yellow(11)=first-seen/announcement/bits/DM/kw-match/warn (attention),
       magenta(13)=raid/gift/mention/first-msg-ever (special event),
       cyan(14)=unadded/stream-hype/milestone (action-needed).
       #ff8700 reserved for brand chrome only (buttons, frames, drag bars). */
    .hs-mc-msg.hs-mc-notice-ban       { border-left-color: #ff0000 !important; background: rgba(255, 0, 0, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-ban       .hs-mc-system-text { color: #ff4040; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-timeout   { border-left-color: #008000 !important; background: rgba(0, 128, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-timeout   .hs-mc-system-text { color: #00cc44; }
    .hs-mc-msg.hs-mc-notice-unban     { border-left-color: #00ff00 !important; background: rgba(0, 255, 0, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-unban     .hs-mc-system-text { color: #00ff00; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-untimeout { border-left-color: #008000 !important; background: rgba(0, 128, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-untimeout .hs-mc-system-text { color: #00cc44; }
    /* Role grants (blue mod / pink VIP) */
    .hs-mc-msg.hs-mc-notice-mod-add     { border-left-color: #4080ff !important; background: rgba(64, 128, 255, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-mod-add     .hs-mc-system-text { color: #4080ff; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-mod-remove  { border-left-color: #c0c0c0 !important; background: rgba(192, 192, 192, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-mod-remove  .hs-mc-system-text { color: #c0c0c0; }
    .hs-mc-msg.hs-mc-notice-vip-add     { border-left-color: #ff00ff !important; background: rgba(255, 0, 255, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-vip-add     .hs-mc-system-text { color: #ff44ff; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-vip-remove  { border-left-color: #c0c0c0 !important; background: rgba(192, 192, 192, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-vip-remove  .hs-mc-system-text { color: #c0c0c0; }
    /* Single message delete = dark red (less severe than ban) */
    .hs-mc-msg.hs-mc-notice-delete    { border-left-color: #800000 !important; background: rgba(128, 0, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-delete    .hs-mc-system-text { color: #ff8080; }
    /* Room mode change = aqua */
    .hs-mc-msg.hs-mc-notice-mode      { border-left-color: #00ffff !important; background: rgba(0, 255, 255, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-mode      .hs-mc-system-text { color: #00ffff; font-weight: 600; }
    /* Sub events (Twitch convention = purple, gifts = brighter magenta variant) */
    .hs-mc-msg.hs-mc-notice-sub       { border-left-color: #9146ff !important; background: rgba(145, 70, 255, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-sub       .hs-mc-system-text { color: #b87aff; font-weight: 600; }
    .hs-mc-msg.hs-mc-notice-gift      { border-left-color: #cc44ff !important; background: rgba(204, 68, 255, 0.16) !important; }
    .hs-mc-msg.hs-mc-notice-gift      .hs-mc-system-text { color: #cc44ff; font-weight: 600; }
    /* Raid = magenta (ANSI 13) — special event family */
    .hs-mc-msg.hs-mc-notice-raid      { border-left-color: #ff00ff !important; background: rgba(255, 0, 255, 0.14) !important; }
    .hs-mc-msg.hs-mc-notice-raid      .hs-mc-system-text { color: #ff00ff; font-weight: 700; }
    /* Announcement = pure yellow (broadcaster speaking) */
    .hs-mc-msg.hs-mc-notice-announce  { border-left-color: #ffff00 !important; background: rgba(255, 255, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-announce  .hs-mc-system-text { color: #ffff00; font-weight: 600; }
    /* Bits = gold/amber (distinct from raid orange and announce yellow) */
    .hs-mc-msg.hs-mc-notice-bits      { border-left-color: #ffaa00 !important; background: rgba(255, 170, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-bits      .hs-mc-system-text { color: #ffd700; font-weight: 600; }
    /* viewermilestone (sub anniversary, etc.) = teal */
    .hs-mc-msg.hs-mc-notice-milestone { border-left-color: #008080 !important; background: rgba(0, 128, 128, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-milestone .hs-mc-system-text { color: #00ffff; font-weight: 600; }
    /* Watch-streak = brand orange — engagement heat, distinct from raid magenta */
    .hs-mc-msg.hs-mc-notice-watchstreak { border-left-color: #ff7f00 !important; background: rgba(255, 127, 0, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-watchstreak .hs-mc-system-text { color: #ffa040; font-weight: 600; }
    /* Errors / rejections = dim maroon */
    .hs-mc-msg.hs-mc-notice-error     { border-left-color: #800000 !important; background: rgba(128, 0, 0, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-error     .hs-mc-system-text { color: #ff8080; }
    /* First-time chatter (Twitch first-msg=1) = Twitch magenta-purple */
    .hs-mc-msg.hs-mc-first-msg { border-left: 3px solid #bd5fff; padding-left: 8px; background: rgba(189, 95, 255, 0.12); }
    .hs-mc-first-tag { display: inline-block; font-size: 13px; font-weight: 700; color: #fff; background: #bd5fff; padding: 0 4px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
    /* Cleared (timed out / banned / msg deleted) — Twitch-native dim + strikethrough.
       Username and badges stay visible so the reader can see who got hit; the body
       text and emotes get faded with a strikethrough. */
    .hs-mc-msg.hs-mc-msg-cleared { opacity: 0.45; }
    .hs-mc-msg.hs-mc-msg-cleared .hs-mc-emote,
    .hs-mc-msg.hs-mc-msg-cleared .hs-mc-emote-wrapper > img,
    .hs-mc-msg.hs-mc-msg-cleared .hs-mc-emote-stack img { filter: grayscale(1) brightness(0.7); }
    /* Strikethrough only the message body, not the user/badges/timestamp */
    .hs-mc-msg.hs-mc-msg-cleared > *:not(.hs-mc-ts):not(.hs-mc-user):not(.hs-mc-badge-img):not(.hs-mc-badge):not(.hs-mc-channel):not(.hs-mc-platform-badge):not(.hs-mc-reply-btn):not(.hs-mc-reply-ctx) { text-decoration: line-through; }
    .hs-mc-msg.hs-mc-redeemed {
      background: rgba(145, 71, 255, 0.15);
      border-left: 3px solid #9147ff;
      padding-left: 8px;
    }
    .hs-mc-msg.hs-mc-highlighted {
      background: rgba(255, 215, 0, 0.1);
      border-left: 3px solid #ffd700;
      padding-left: 8px;
    }
    .hs-mc-redeem-label {
      color: #9147ff;
      font-size: 13px;
      font-style: normal;
      font-weight: 600;
    }
    .hs-mc-highlight-label {
      color: #ffd700;
      font-size: 13px;
      font-style: normal;
      font-weight: 600;
    }
    .hs-mc-reply-ctx {
      font-size: 13px;
      color: #808080;
      padding: 1px 0 1px 8px;
      border-left: 2px solid #808080;
      margin-bottom: 1px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-mc-reply-user {
      color: #808080;
      font-weight: 600;
    }
    /* Dark blood-red — saturated enough to read as "you got mentioned" but
       dark enough to let full-color Twitch usernames render on top without
       the bg drowning them. Mirrors heatsync.org messages.css. */
    .hs-mc-msg.mention {
      background: #330808;
    }
    /* Zebra striping for consecutive mentions — leverages the existing
       neighbor-flip .hs-mc-zebra cadence so adjacent mention rows alternate
       without looking like a wall of identical red. Darker red maintains
       the mention semantic while distinguishing rows. */
    .hs-mc-msg.mention.hs-mc-zebra {
      background: #1a0404;
    }
    /* Row base color white for non-colored text (gray timestamps, plain
       message body) — inline user colors override naturally. No star-cascade
       so colored names breathe. */
    .hs-mc-msg.mention {
      color: #fff;
    }
    /* Channel tag — dim gray reads as skip-me metadata against the dark bg. */
    .hs-mc-msg.mention .hs-mc-channel,
    .hs-mc-msg.mention .hs-mc-channel * {
      color: #999 !important;
      -webkit-text-fill-color: #999 !important;
    }
    .hs-mc-msg.hs-first-msg {
      box-shadow: inset 2px 0 0 #ffff00;
    }
    .hs-mc-msg.hs-kw-match {
      background: rgba(255, 255, 0, 0.14);
      box-shadow: inset 0 0 0 1px #ffff00;
    }
    .hs-mc-msg.tweet {
      background: rgba(212, 73, 73, 0.3);
    }
    .hs-mc-user {
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
    }
    .hs-mc-link {
      color: #8080ff;
      text-decoration: none;
      word-break: break-all;
      position: relative;
    }
    .hs-mc-link:hover {
      text-decoration: underline;
    }
    .hs-mc-user.hs-user-highlight {
      background: #fff !important;
      color: #000 !important;
      -webkit-text-fill-color: #000 !important;
      border-radius: 0;
    }
    .hs-mc-platform-badge {
      /* Text badges follow the single font setting (family + size), not the
         emote-size scale — one appearance control drives every badge glyph.
         Crispness on Cozette/Gohu comes from the .hs-font-bitmap block. */
      font-family: var(--hs-mc-font, 'CozetteVector', 'Courier New', monospace);
      font-size: 13px;
      margin-right: 3px;
      font-weight: 700;
      vertical-align: middle;
    }
    .hs-mc-platform-badge.hs-mc-pb-twitch { color: #9146ff; }
    .hs-mc-platform-badge.hs-mc-pb-kick { color: #53fc18; }
    .hs-mc-platform-badge.hs-mc-pb-yt { color: #ff0000; }
    .hs-mc-badge {
      display: inline-block;
      /* Single font setting drives family + size (see .hs-mc-platform-badge). */
      font-family: var(--hs-mc-font, 'CozetteVector', 'Courier New', monospace);
      font-size: 13px;
      padding: 0 3px;
      border-radius: 0;
      margin-right: 2px;
      font-weight: 700;
      vertical-align: middle;
      line-height: var(--hs-stat-badge-line, 16px);
      letter-spacing: 0.3px;
      cursor: default;
    }
    .hs-mc-badge-img {
      display: inline !important;
      width: var(--hs-badge-img, 18px);
      height: var(--hs-badge-img, 18px);
      vertical-align: middle;
      margin-right: 2px;
      cursor: default;
    }

    /* Username hover tooltip - profile preview */
    /* Body-appended popovers — pull font from :root vars so they render in
       Cozette/user-chosen face instead of inheriting Twitch's Inter. .hs-pcard
       and .hs-notif set their own font-family intentionally (system sans /
       ui-monospace) — leave those alone. */
    #hs-user-tooltip,
    #hs-badge-tooltip,
    #hs-emote-tooltip,
    #hs-link-tooltip,
    #hs-mc-msg-ctx,
    .hs-mc-ctx {
      font-family: var(--hs-mc-font, 'CozetteVector', 'Courier New', monospace);
      font-size: var(--hs-mc-base-size, 13px);
    }

    /* Right-click emote action menu (multichat panel) */
    .hs-mc-ctx {
      position: fixed;
      /* Match max-int + !important so the menu sits above the orange resize
         bar (#hs-c-resize-handle, also max-int). Menu is created on right-
         click after the bar exists, so later DOM order tie-breaks above. */
      z-index: 2147483647 !important;
      background: #000; color: #fff;
      border: 1px solid #ff8700;
      padding: 0; min-width: 220px; max-width: 280px;
      box-shadow: 0 6px 32px rgba(0,0,0,0.75);
      animation: hs-mc-em-in 80ms ease-out;
      transform-origin: top left;
      user-select: none;
    }
    @keyframes hs-mc-em-in {
      from { opacity: 0; transform: scale(0.96); }
      to   { opacity: 1; transform: scale(1); }
    }
    .hs-mc-ctx.hs-mc-em-flip-x { transform-origin: top right; }
    .hs-mc-ctx.hs-mc-em-flip-y { transform-origin: bottom left; }
    .hs-mc-ctx.hs-mc-em-flip-x.hs-mc-em-flip-y { transform-origin: bottom right; }
    .hs-mc-ctx .hs-mc-em-header {
      padding: 4px 10px; font-size: 10px; color: #666;
      text-transform: uppercase; letter-spacing: 0.5px;
      background: #050505;
    }
    .hs-mc-ctx .hs-mc-em-item {
      padding: 6px 10px; cursor: pointer;
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px;
    }
    .hs-mc-ctx .hs-mc-em-item:hover { background: #fff; color: #000; }
    .hs-mc-ctx .hs-mc-em-item:hover .hs-mc-em-kbd { background: #000; color: #fff; border-color: #000; }
    .hs-mc-ctx .hs-mc-em-item.hs-mc-em-danger { color: #ff5959; }
    .hs-mc-ctx .hs-mc-em-item.hs-mc-em-danger:hover { background: #ff2020; color: #fff; }
    .hs-mc-ctx .hs-mc-em-item.hs-mc-em-good { color: #59ff8a; }
    .hs-mc-ctx .hs-mc-em-item.hs-mc-em-good:hover { background: #1faf48; color: #fff; }
    .hs-mc-ctx .hs-mc-em-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .hs-mc-ctx .hs-mc-em-kbd {
      display: inline-block; min-width: 14px; padding: 0 4px;
      border: 1px solid #333; background: #0a0a0a; color: #888;
      font-size: 10px; line-height: 14px; text-align: center;
    }
    .hs-mc-ctx .hs-mc-em-item.hs-mc-em-disabled { opacity: 0.4; cursor: not-allowed; }
    .hs-mc-ctx .hs-mc-em-item.hs-mc-em-disabled:hover { background: none; color: inherit; }
    .hs-mc-ctx .hs-mc-em-sep { height: 1px; background: #1a1a1a; margin: 2px 0; }
    #hs-user-tooltip {
      position: fixed;
      /* Must beat the unified resize bar (#hs-c-resize-handle uses max int).
         Equal z-index with later DOM order wins — tooltip is appended on
         first hover, after the resize handle is created at init. */
      z-index: 2147483647 !important;
      pointer-events: none;
      background: #000;
      border: 1px solid #2a2a2a;
      border-radius: 0;
      padding: 0;
      display: none;
      min-width: 240px;
      max-width: 400px;
      overflow: hidden;
      isolation: isolate;
      --hs-pc-accent: #ff8700;
    }
    #hs-user-tooltip.visible {
      display: block;
    }
    /* Hero band — wide channel banner image up top, accent-tinted gradient
       placeholder until the GQL response lands. Image is decoded off-DOM
       (Image() probe) and committed in one go so there's no flash. */
    #hs-user-tooltip .hs-pc-hero {
      position: relative;
      height: 56px;
      background: linear-gradient(135deg, var(--hs-pc-accent, #1a1a1a) 0%, #0a0a0a 90%);
      border-bottom: 1px solid var(--hs-pc-accent, #2a2a2a);
      overflow: hidden;
    }
    #hs-user-tooltip .hs-pc-hero-img {
      position: absolute; inset: 0;
      background-position: center; background-size: cover; background-repeat: no-repeat;
      opacity: 0; transition: opacity 240ms ease-out, transform 600ms ease-out;
      transform: scale(1.06);
      filter: saturate(1.1);
    }
    #hs-user-tooltip .hs-pc-hero.hs-pc-hero-loaded .hs-pc-hero-img {
      opacity: 0.85; transform: scale(1);
    }
    /* Scrim — bottom-weighted dark gradient so name/badges below the hero
       remain crisp regardless of banner color. */
    #hs-user-tooltip .hs-pc-hero-scrim {
      position: absolute; inset: 0;
      background: linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.92) 100%);
      pointer-events: none;
    }
    /* Body wraps everything below the banner; padding lives here now so the
       hero can run flush to the tooltip edge. */
    #hs-user-tooltip .hs-pc-body {
      display: flex;
      padding: 8px;
    }
    #hs-user-tooltip .hs-pc-avatar {
      width: 48px;
      height: 48px;
      min-width: 48px;
      border: 2px solid var(--hs-pc-accent, #2a2a2a);
      object-fit: cover;
      flex-shrink: 0;
      align-self: flex-start;
      /* Lifts avatar so it bridges the hero banner and the body, the same
         move every modern social profile uses to anchor identity. Margin-top
         is negative to overlap the hero by ~half the avatar height. */
      margin-top: -32px;
      margin-right: 10px;
      box-shadow:
        0 0 0 1px #000,
        0 0 12px rgba(0, 0, 0, 0.6),
        0 0 18px color-mix(in srgb, var(--hs-pc-accent, transparent) 25%, transparent);
      background: #000;
      position: relative;
      z-index: 1;
    }
    #hs-user-tooltip .hs-pc-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-left: 8px;
    }
    #hs-user-tooltip .hs-pc-header {
      display: flex;
      align-items: center;
      column-gap: 4px;
      row-gap: 6px;
      flex-wrap: wrap;
      line-height: 15px;
    }
    /* Broad reset — content.js injects ~12 bare-class .hs-pc-* rules with
       font-size: 10px !important + padding: 2px 4px !important + letter-
       spacing: 0.3px !important for the native chat-tile profile card. At
       the !important tier those bare-class rules beat tooltip-scoped rules
       on specificity tie. This one selector normalizes every .hs-pc-* badge
       inside the tooltip to consistent 13px / padding / line-height so
       badges share an identical baseline (mismatched heights produced
       fractional vertical centers in the flex row → bitmap glyphs smeared
       on the off-baseline rows, which read as "blurry"). */
    #hs-user-tooltip [class*="hs-pc-"] {
      font-size: 13px !important;
      padding: 1px 2px !important;
      line-height: 16px !important;
      letter-spacing: 0 !important;
    }
    #hs-user-tooltip .hs-pc-platform {
      font-size: 13px !important;
      padding: 1px 2px !important;
      font-weight: 900 !important;
      border: 1px solid #000 !important;
      white-space: nowrap !important;
      letter-spacing: 0.2px !important;
      line-height: 16px !important;
    }
    #hs-user-tooltip .hs-pc-platform.twitch {
      background: #9146ff;
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-platform.kick {
      background: #53fc18;
      color: #000;
    }
    #hs-user-tooltip .hs-pc-name {
      font-size: 15px;
      font-weight: 700;
      white-space: nowrap;
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-role {
      padding: 2px 3px;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
      border: 1px solid #000;
      letter-spacing: 0.3px;
    }
    #hs-user-tooltip .hs-pc-role.admin { background: #ff0000; color: #fff; }
    #hs-user-tooltip .hs-pc-role.staff { background: #ff8800; color: #000; }
    #hs-user-tooltip .hs-pc-role.partner { background: #ffaa00; color: #000; }
    #hs-user-tooltip .hs-pc-role.affiliate { background: transparent; color: #fff; }
    #hs-user-tooltip .hs-pc-age {
      padding: 2px 4px;
      font-size: 13px;
      font-weight: 900;
      border: 1px solid #000;
      background: #ffff00;
      color: #000;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    #hs-user-tooltip .hs-pc-bio {
      font-size: 13px;
      color: #fff;
      line-height: 17px;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    #hs-user-tooltip .hs-pc-bio-mention { color: #ff8700; cursor: pointer; }
    #hs-user-tooltip .hs-pc-bio-mention:hover { text-decoration: underline; }
    #hs-user-tooltip .hs-pc-bio-tag { color: #ff00ff; text-decoration: none; }
    #hs-user-tooltip .hs-pc-bio-tag:hover { text-decoration: underline; }
    #hs-user-tooltip .hs-pc-stats {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      font-size: 13px;
      color: #fff;
      line-height: 17px;
    }
    #hs-user-tooltip .hs-pc-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 20px;
      padding: 0 6px;
      font-size: 13px;
      font-weight: 500;
      color: #fff;
      border: 1px solid #fff;
      background: transparent;
      white-space: nowrap;
      box-sizing: border-box;
    }
    #hs-user-tooltip .hs-pc-sep { display: none; }
    #hs-user-tooltip .hs-pc-stat.op { border-color: #ff0000; color: #ff0000; }
    #hs-user-tooltip .hs-pc-stat.op .hs-pc-num { color: #fff; }
    #hs-user-tooltip .hs-pc-stat.mop { border-color: #ff00ff; color: #ff00ff; }
    #hs-user-tooltip .hs-pc-stat.mop .hs-pc-num { color: #fff; }
    #hs-user-tooltip .hs-pc-stat.re { border-color: #00ffff; color: #00ffff; }
    #hs-user-tooltip .hs-pc-stat.re .hs-pc-num { color: #fff; }
    #hs-user-tooltip .hs-pc-stat-heat { border-color: #ff8700; }
    #hs-user-tooltip .hs-pc-stat-heat .hs-heat-num { font-size: 13px; font-weight: 700; }
    #hs-user-tooltip .hs-pc-rel {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      font-size: 13px;
      line-height: 15px;
    }
    #hs-user-tooltip .hs-pc-rel-badge {
      padding: 2px 3px;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    #hs-user-tooltip .hs-pc-rel-badge.mutual { background: #00aaaa; color: #fff; }
    #hs-user-tooltip .hs-pc-rel-badge.supporter { background: #ff8700; color: #000; }
    #hs-user-tooltip .hs-pc-rel-badge.following { background: #0099ff; color: #fff; }
    #hs-user-tooltip .hs-pc-rel-badge.subbed { background: #9146ff; color: #fff; }
    #hs-user-tooltip .hs-pc-rel-badge.mutual-follow { background: #000; color: #fff; border: 1px solid #00aaaa; }
    #hs-user-tooltip .hs-pc-rel-badge.mutual-sub { background: #000; color: #fff; border: 1px solid #ff8700; }
    /* Property sheet — mirrors .hs-pcard-sheet. Tooltip already inherits
       CozetteVector bitmap rendering from body.hs-font-bitmap, so no
       counter-counter block needed here (unlike the pcard sheet which
       sits inside a system-sans counter-rule). */
    #hs-user-tooltip .hs-pc-sheet {
      display: grid; grid-template-columns: max-content 1fr;
      column-gap: 12px; row-gap: 0;
      font-size: 13px; line-height: 18px;
      margin: 4px 0 0 0;
    }
    #hs-user-tooltip .hs-pc-sheet dt,
    #hs-user-tooltip .hs-pc-sheet dd {
      padding: 1px 6px; margin: 0;
    }
    #hs-user-tooltip .hs-pc-sheet dt { color: #888; font-weight: 400; }
    #hs-user-tooltip .hs-pc-sheet dd { color: #fff; font-weight: 700; }
    #hs-user-tooltip .hs-pc-sheet dt:nth-of-type(even),
    #hs-user-tooltip .hs-pc-sheet dd:nth-of-type(even) { background: #1f1f1f; }
    /* Mirror of .hs-pcard-sheet ANSI semantic palette — see comment in
       the pcard sheet block for the full reasoning. */
    #hs-user-tooltip .hs-pc-sheet .val-age { color: #ffff00; }
    #hs-user-tooltip .hs-pc-sheet .val-partner { color: #ffaf00; }
    #hs-user-tooltip .hs-pc-sheet .val-affiliate { color: #bcbcbc; }
    #hs-user-tooltip .hs-pc-sheet .val-ttv { color: #9146ff; }
    #hs-user-tooltip .hs-pc-sheet .val-kick { color: #53fc18; }
    #hs-user-tooltip .hs-pc-sheet .val-yt { color: #ff0000; }
    #hs-user-tooltip .hs-pc-sheet .val-admin { color: #ff0000; }
    #hs-user-tooltip .hs-pc-sheet .val-staff { color: #ff8700; }
    #hs-user-tooltip .hs-pc-sheet .val-heat { color: #ff0000; }
    #hs-user-tooltip .hs-pc-sheet .val-followers { color: #0087ff; }
    #hs-user-tooltip .hs-pc-sheet .val-you-follow { color: #00ffff; }
    #hs-user-tooltip .hs-pc-sheet .val-you-sub { color: #875fff; }
    #hs-user-tooltip .hs-pc-sheet .val-they-follow { color: #ff00ff; }
    #hs-user-tooltip .hs-pc-sheet .val-they-sub { color: #ff5fff; }
    #hs-user-tooltip .hs-pc-sheet .val-mutual { color: #00ff00; }
    #hs-user-tooltip .hs-pc-sheet .val-mutual-sub { color: #ffd700; }
    #hs-user-tooltip .hs-pc-sheet .val-ch { color: #ff8700; }
    #hs-user-tooltip .hs-pc-sheet .hs-pc-live { color: #ff0000; font-weight: 700; }
    /* Heat number inside the sheet: digits inherit Cozette (already crisp
       on this tooltip surface), ° gets vector fallback for a clean glyph. */
    #hs-user-tooltip .hs-pc-sheet .hs-heat-n { font-family: inherit; }
    #hs-user-tooltip .hs-pc-sheet .hs-heat-deg {
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    #hs-user-tooltip .hs-pc-followage {
      padding: 2px 3px;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.3px;
      background: #00aa00;
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-followage.hs-pc-nofollow {
      background: transparent;
      color: #808080;
      border: 1px solid #808080;
    }
    #hs-user-tooltip .hs-pc-channel-follows {
      padding: 2px 3px;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.3px;
      background: #daa520;
      color: #000;
    }
    #hs-user-tooltip .hs-pc-sub-tenure {
      padding: 2px 3px;
      font-size: 13px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.3px;
      background: #e91e8c;
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-loading {
      color: #fff;
      font-size: 13px;
    }
    .hs-mc-channel {
      color: #808080;
      font-size: 13px;
      margin-left: 4px;
    }
    .hs-mc-time {
      color: #808080;
      font-size: var(--hs-time-font, 10px);
      margin-right: 4px;
    }
    .hs-mc-empty {
      color: #808080;
      padding: 20px;
      text-align: center;
    }
    .hs-mc-empty-card {
      padding: 24px 16px;
      max-width: 360px;
      margin: 16px auto;
      text-align: center;
      color: #ddd;
      border: 1px solid #1a1a1a;
      background: #000;
    }
    .hs-mc-empty-title {
      font-size: 14px;
      color: #ff8700;
      margin-bottom: 6px;
      text-transform: lowercase;
    }
    .hs-mc-empty-sub {
      font-size: 13px;
      color: #a0a0a0;
      margin-bottom: 14px;
      line-height: 18px;
    }
    .hs-mc-empty-actions {
      display: flex;
      flex-direction: column;
      gap: 6px;
      align-items: stretch;
    }
    .hs-mc-empty-btn {
      display: block;
      padding: 7px 10px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      color: #ddd;
      font-family: inherit;
      font-size: 13px;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      box-sizing: border-box;
    }
    .hs-mc-empty-btn:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    .hs-mc-empty-btn.primary {
      background: #ff8700;
      color: #000;
      border-color: #ff8700;
    }
    .hs-mc-empty-btn.primary:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    .hs-mc-empty-btn:disabled {
      opacity: 0.6;
      cursor: default;
    }
    .hs-mc-empty-note {
      font-size: 13px;
      color: #555;
      margin-top: 12px;
      line-height: 18px;
    }
    .hs-mc-emote {
      width: auto;
      height: auto;
      max-height: var(--hs-emote-size, 32px);
      vertical-align: middle;
      margin: 0;
      padding: 2px;
      border-radius: 0;
      transition: none;
      cursor: pointer;
      box-sizing: content-box;
    }
    /* Feed content is rendered in CozetteVector (a pixel font). A bare inline
       emote with vertical-align:middle recenters the line box and lands adjacent
       text on a half-pixel Y, blurring the glyphs. bottom keeps text on an
       integer baseline. Chat uses .hs-mc-emote-wrapper, so this is feed-only. */
    .hs-feed-body .hs-mc-emote { vertical-align: bottom; }
    /* Tighten gap between consecutive emotes so "eel1 eel2 eel3"
       reads as one continuous run instead of three spaced-out images.
       Negative margin pulls the second wrapper over the whitespace
       text node that separates them in the DOM. */
    .hs-mc-emote-wrapper + .hs-mc-emote-wrapper,
    .hs-mc-emote-wrapper + .hs-mc-emote-stack,
    .hs-mc-emote-stack + .hs-mc-emote-wrapper,
    .hs-mc-emote-stack + .hs-mc-emote-stack {
      margin-left: -4px;
    }
    .hs-mc-picker-emote {
      height: auto;
      max-height: 32px;
      max-width: 96px;
      width: auto;
      vertical-align: middle;
      margin: 0;
      padding: 4px;
      border-radius: 0;
      transition: none;
      cursor: pointer;
      box-sizing: content-box;
      object-fit: contain;
    }
    /* Picker emote wrap — three hover states:
       - default (owned/global/channel) → green rectangle on hover
       - .unadded → orange rectangle on hover (click adds to set)
       - .blocked → persistent 2px dashed grey rectangle (no hover color)
       Rectangle paints via ::before on the wrap (not the img) so visibility:
       hidden on the img during hover/blocked keeps the slot's layout intact. */
    .hs-mc-picker-emote-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
    }
    .hs-mc-picker-emote-wrap::before {
      content: '';
      position: absolute;
      /* Match img content-box, not its padding-box. .hs-mc-picker-emote
         carries padding:4px, so the wrap is 8px wider/taller than the
         visible emote — inset:0 here would paint orange/green 4px past
         the emote on every side ("rect bigger than emote" / "two stacked
         rects" perception). Inset by the picker-emote padding so the
         hover rect tracks the visible image instead. box-sizing keeps the
         dashed border (blocked state) from inflating the rect. */
      inset: 4px;
      box-sizing: border-box;
      opacity: 0;
      pointer-events: none;
      z-index: 1;
      background: #00ff00;
    }
    .hs-mc-picker-emote-wrap.unadded::before {
      background: #ff8700;
    }
    .hs-mc-picker-emote-wrap:not(.blocked):hover::before {
      opacity: 1;
    }
    .hs-mc-picker-emote-wrap:not(.blocked):hover > img {
      visibility: hidden !important;
    }
    /* Blocked: persistent dashed rect via ::before (not outline on the
       wrap) so it tracks emote content size like the green/orange hover
       does, instead of sitting 4px outside on the wrap's padding-box. */
    .hs-mc-picker-emote-wrap.blocked::before {
      opacity: 1;
      background: none;
      border: 2px dashed #808080;
    }
    .hs-mc-picker-emote-wrap.blocked img {
      visibility: hidden !important;
    }

    /* Emojis — scale driven by --hs-emoji-scale (1|2|4). Default 2x.
       line-height MUST match the parent message's integer line-height
       (18px) so a tall color-emoji glyph does NOT grow the inline line-box.
       If the line-box grows from emoji metrics, half-leading for 13px text
       becomes fractional and every character that follows the emoji on
       the same row renders at a sub-integer baseline (= bitmap smear).
       Emoji visual overflows the 18px box vertically — intentional. */
    .hs-mc-emoji {
      font-size: calc(1em * var(--hs-emoji-scale, 2));
      /* line-height matches --hs-emote-size so the inline-block reports the
         same height as emote imgs. line-height: 1 (= font-size = ~26px) left
         the glyph filling the box edge-to-edge; some emoji glyphs (Noto)
         bleed 1-2px past their em-box → clipped by .hs-mc-msg's
         overflow:hidden. Pinning to emote size gives ~3px headroom above
         and below the glyph, matches emote-row visual height, keeps mixed
         emoji+text rows visually consistent with emote+text rows. */
      line-height: var(--hs-emote-size, 32px);
      vertical-align: middle;
      display: inline-block;
    }
    /* 7TV ZERO-WIDTH OVERLAY EMOTE STACKING */
    .hs-mc-emote-stack {
      display: inline-flex;
      align-items: center;
      position: relative;
      vertical-align: middle;
      /* Lock height so collapsed↔expanded toggle doesn't shift line height
         (expanded adds 2px vertical padding via pseudo-element). */
      height: 36px;
      box-sizing: border-box;
    }
    .hs-mc-emote-stack-emotes {
      display: inline-grid;
      place-items: center;
      position: relative;
    }
    .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper,
    .hs-mc-emote-stack-emotes > .hs-mc-emoji {
      grid-area: 1 / 1;
    }
    .hs-mc-emote-stack-emotes > :first-child {
      z-index: 1;
    }
    .hs-mc-emote-stack-emotes > :not(:first-child) {
      z-index: 2;
      pointer-events: auto;
    }
    /* Overlay emote at native size, not constrained to base */
    .hs-mc-overlay-emote {
      height: auto !important;
      margin: 0 !important;
      pointer-events: auto;
    }

    /* EMOTE STACK EXPAND/COLLAPSE */
    .hs-mc-stack-collapse,
    .hs-mc-stack-block-all {
      display: none;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      padding: 0 2px;
      user-select: none;
    }
    .hs-mc-emote-stack.expanded {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      /* Drop the collapsed 36px lock so a multi-row wrap can grow vertically. */
      height: auto;
    }
    /* Expanded inner: gray bg via pseudo-element bleeding outward so the box
       layout doesn't grow vs collapsed (no line-height shift, no off-center).
       wrap + non-shrinking children so a 50-emote nest reflows onto multiple
       rows at native size instead of squishing to a 4px-wide single line. */
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes {
      border-radius: 0;
      display: inline-flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
    }
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper,
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes > .hs-mc-emoji {
      flex: 0 0 auto;
    }
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes::after {
      content: '';
      position: absolute;
      inset: -2px -6px;
      background: #808080;
      z-index: -1;
      pointer-events: none;
    }
    .hs-mc-emote-stack.expanded > .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper {
      grid-area: auto;
    }
    .hs-mc-emote-stack.expanded .hs-mc-stack-collapse,
    .hs-mc-emote-stack.expanded .hs-mc-stack-block-all {
      display: inline-block;
    }
    .hs-mc-stack-collapse:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-stack-block-all:hover {
      background: #fff;
      color: #000;
    }

    /* STATE-BASED EMOTE COLORS (website parity) */
    /* Wrapper spans for solid color hover rectangles */
    .hs-mc-emote-wrapper {
      display: inline-block;
      position: relative;
      vertical-align: middle;
      cursor: pointer;
      line-height: 0;
      font-size: 0;
    }
    .hs-mc-emote-wrapper > img {
      display: block;
    }
    .hs-mc-emote-wrapper::before {
      content: '';
      position: absolute;
      inset: 4px;
      border-radius: 0;
      opacity: 0;
      /* Opacity stays untransitioned (kept snappy on cross-highlight class
         toggles); background-color fades 0.25s so block↔unblock during
         hover smoothly cross-fades between legend colors instead of snapping. */
      transition: background-color 0.25s ease-out;
      z-index: 1;
      pointer-events: none;
    }
    /* Hover: show solid color rect, hide image. Color from --hs-highlight-color
       (set by hover source) so cross-highlighted instances all match.
       transition:none snaps to the highlight color on class-apply — without
       it, moving between sibling instances briefly removes+re-adds the class
       and the base 0.25s background-color transition flashes the sibling's
       state color (e.g. green) before settling back to highlight orange. */
    .hs-mc-emote-wrapper.hs-emote-highlight::before {
      opacity: 1;
      background: var(--hs-highlight-color, #00ff00) !important;
      transition: none;
    }
    .hs-mc-emote-wrapper.hs-emote-highlight > img {
      visibility: hidden;
    }
    /* Tab cycling: suppress emote hover highlight while user is cycling Tab
       matches in chat input. Mouse stuck over an emote keeps the green rect
       lit otherwise. Cleared on the next mousemove. */
    body.hs-tab-cycling .hs-mc-emote-wrapper.hs-emote-highlight::before {
      opacity: 0 !important;
    }
    body.hs-tab-cycling .hs-mc-emote-wrapper.hs-emote-highlight > img {
      visibility: visible !important;
    }
    body.hs-tab-cycling .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight)::before {
      opacity: 0 !important;
    }

    /* State colors via ::before — match heatsync.org + native chat convention:
       owned/global/channel = green, unadded = orange (#ff8700), blocked = red. */
    .hs-mc-emote-wrapper.hs-state-global::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-owned::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-unadded::before { background: #ff8700; }
    .hs-mc-emote-wrapper.hs-state-channel::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-blocked::before { background: #ff0000; }

    /* v1.6 NSFW — 2px dashed teal (#008080, xterm-256 #30) border on
       flagged emotes in DECISION surfaces (picker, input chip). Chat
       rows do NOT paint a border — when a viewer opts in to see flagged
       content, the cyan-on-every-flagged-emote was visual noise. The
       wrapper still carries hs-state-nsfw class for tooltip hooks
       ("·NSFW" suffix still works on hover) — just no painted border
       on the chat side. */
    .hs-mc-picker-emote-wrap.hs-state-nsfw > img,
    img.hs-input-emote.hs-state-nsfw {
      border: 2px dashed #008080 !important;
      box-sizing: border-box !important;
    }

    /* Stale ghost: emote was in the channel set when the message posted but
       has since been removed. Dim + desaturate the cached IMG; muted-orange
       marker distinguishes from active orange unadded state. */
    .hs-mc-emote-wrapper.hs-state-stale > img {
      opacity: 0.55;
      filter: saturate(0.45);
      transition: opacity 0.2s ease-out, filter 0.2s ease-out;
    }
    .hs-mc-emote-wrapper.hs-state-stale:hover > img {
      opacity: 1;
      filter: none;
    }
    .hs-mc-emote-wrapper.hs-state-stale::before {
      background: #7a4400;
    }

    /* Blocked emotes: hide img (keeps natural dimensions), dashed line via ::before */
    .hs-mc-emote-wrapper.hs-state-blocked > img {
      visibility: hidden;
    }
    .hs-mc-emote-wrapper.hs-state-blocked::before {
      opacity: 1;
      background: none;
      border: 2px dashed #808080;
    }
    .hs-mc-emote-stack.expanded .hs-mc-emote-wrapper.hs-state-blocked::before {
      border-color: #fff;
    }
    .hs-mc-emote-wrapper.hs-state-blocked.hs-emote-highlight::before {
      background: #ff0000;
      border: none;
    }

    /* Collapsed stack: unified hover ::before on the stack itself.
       Per-wrapper hover (cross-highlight) is suppressed — stack-level ::before
       paints one solid rectangle. Persistent blocked-dash per emote is kept
       as-is so users can see which specific emotes in the nest are blocked. */
    /* When the stack is hovered, hide ALL per-wrapper ::before indicators
       (incl. persistent blocked-dash on emotes that aren't the cross-highlight
       target) so only the unified stack rect shows. */
    .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight) .hs-mc-emote-wrapper::before {
      display: none !important;
    }
    .hs-mc-emote-stack:not(.expanded)::before {
      content: '';
      position: absolute;
      inset: 4px;
      opacity: 0;
      pointer-events: none;
      z-index: 3;
    }
    .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight)::before {
      opacity: 1;
      background: var(--hs-highlight-color, #00ff00);
      border: none;
    }
    .hs-mc-emote-stack:not(.expanded):has(.hs-mc-emote-wrapper.hs-emote-highlight) > .hs-mc-emote-stack-emotes > .hs-mc-emote-wrapper > img {
      visibility: hidden;
    }

    /* Flash animations */
    @keyframes hs-flash-paste { 0% { box-shadow: 0 0 12px 4px #fff; } 100% { box-shadow: none; } }
    @keyframes hs-flash-add { 0% { box-shadow: 0 0 12px 4px #00ff00; } 100% { box-shadow: none; } }
    @keyframes hs-flash-block { 0% { box-shadow: 0 0 12px 4px #ff0000; } 100% { box-shadow: none; } }
    @keyframes hs-flash-unblock { 0% { box-shadow: 0 0 12px 4px #ffff00; } 100% { box-shadow: none; } }
    @keyframes hs-flash-remove { 0% { box-shadow: 0 0 12px 4px #fff; } 100% { box-shadow: none; } }
    .hs-flash-paste { animation: hs-flash-paste 0.4s ease-out; }
    .hs-flash-add { animation: hs-flash-add 0.4s ease-out; }
    .hs-flash-block { animation: hs-flash-block 0.4s ease-out; }
    .hs-flash-unblock { animation: hs-flash-unblock 0.4s ease-out; }
    .hs-flash-remove { animation: hs-flash-remove 0.4s ease-out; }

    /* Legacy img classes (for picker, tooltips) */
    .hs-mc-emote, .hs-mc-picker-emote {
      position: relative;
    }

    /* Badge hover tooltip - 4x preview */
    /* Max z-index so it beats the reply-stack overlay (also at max int);
       showBadgeTooltip re-appends to body so DOM order tiebreaks in our favor. */
    #hs-badge-tooltip {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      border: 1px solid #333;
    }
    #hs-badge-tooltip.visible {
      display: flex;
    }
    #hs-badge-tooltip img {
      object-fit: contain;
      image-rendering: pixelated;
      image-rendering: -moz-crisp-edges;
    }
    #hs-badge-tooltip .tooltip-name {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    #hs-badge-tooltip .tooltip-source {
      font-size: 13px;
      padding: 2px 6px;
      margin: 2px -8px -8px;
      border-radius: 0;
      color: #fff;
      width: calc(100% + 16px);
      text-align: center;
      background: #808080;
    }

    /* Emote hover tooltip - 4x preview */
    /* Max z-index so it beats the reply-stack overlay (also at max int);
       showEmoteTooltip re-appends to body so DOM order tiebreaks in our favor. */
    #hs-emote-tooltip {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      border: 1px solid #333;
    }
    #hs-emote-tooltip.visible {
      display: flex;
    }
    #hs-emote-tooltip img {
      object-fit: contain;
      image-rendering: pixelated;
    }
    /* Emote-nest composite preview: sized box, scaled stack pinned top-left */
    #hs-emote-tooltip .tooltip-stack {
      display: none;
      position: relative;
      overflow: visible;
    }
    #hs-emote-tooltip .tooltip-stack .hs-mc-emote-stack-emotes::before { content: none !important; }
    #hs-emote-tooltip .tooltip-name {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    #hs-emote-tooltip .tooltip-source {
      font-size: 13px;
      padding: 2px 6px;
      margin: 2px -8px -8px;
      border-radius: 0;
      color: #fff;
      width: calc(100% + 16px);
      text-align: center;
    }
    #hs-emote-tooltip .tooltip-source.owned { background: #00ff00; color: #000; }
    #hs-emote-tooltip .tooltip-source.unadded { background: #ff8700; color: #000; }
    #hs-emote-tooltip .tooltip-source.global { background: #00ff00; color: #000; }
    #hs-emote-tooltip .tooltip-source.channel { background: #00ff00; color: #000; }
    #hs-emote-tooltip .tooltip-source.sub { background: #9146ff; color: #fff; }
    #hs-emote-tooltip .tooltip-source.blocked { background: #ff0000; color: #fff; }
    /* Per-provider source label colors (override .global/.channel) */
    #hs-emote-tooltip .tooltip-source.src-7tv { background: #29d8f6; color: #000; }
    #hs-emote-tooltip .tooltip-source.src-bttv { background: #d50014; color: #fff; }
    #hs-emote-tooltip .tooltip-source.src-ffz { background: #0086c8; color: #fff; }
    #hs-emote-tooltip .tooltip-source.src-twitch { background: #9146ff; color: #fff; }
    #hs-emote-tooltip .tooltip-source.src-kick { background: #53fc18; color: #000; }
    #hs-emote-tooltip .tooltip-source.src-heatsync { background: #ff8700; color: #000; }

    /* Max z-index + showLinkTooltip re-appends to body — beats reply-stack overlay. */
    #hs-link-tooltip {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: row;
      gap: 8px;
      max-width: 350px;
      border: 1px solid #333;
    }
    #hs-link-tooltip.visible { display: flex; }
    #hs-link-tooltip img {
      width: 80px;
      height: 80px;
      object-fit: cover;
      border-radius: 0;
      flex-shrink: 0;
    }
    #hs-link-tooltip .link-text {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      justify-content: center;
    }
    #hs-link-tooltip .link-title {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    #hs-link-tooltip .link-desc {
      color: #fff;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    #hs-link-tooltip .link-domain {
      color: #8080ff;
      font-size: 13px;
    }
    #hs-link-tooltip .link-loading {
      color: #808080;
      font-size: 13px;
    }

    /* Input styles (used in #hs-mc-inputbar) */
    #hs-mc-input {
      flex: 1;
      /* Explicit floor + box model: without these the empty contenteditable
         collapses on hosts that lack a universal box-sizing reset (YouTube),
         dropping the box to padding+border height so the absolutely-placed
         placeholder spilled below the white area. Kick/Twitch only looked
         right because Tailwind's *{box-sizing:border-box} happened to bleed
         in. Pin both so all platforms render one full line. */
      box-sizing: border-box;
      min-height: 35px;
      padding: 8px 12px;
      background: #fff;
      color: #000;
      border: 1px solid #808080;
      border-radius: 0;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      position: relative;
      /* pre-wrap preserves trailing whitespace (the auto-space after Tab
         completion stays visible + backspace-able) AND wraps long lines so
         text doesn't escape the inputbar into the tab area. */
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    #hs-mc-input:focus {
      border-color: #9147ff;
    }
    #hs-mc-input::placeholder {
      color: #808080;
    }
    /* Resub-share mode — purple border on the whole inputbar so the user
       knows their next message becomes the resub celebration body. */
    #hs-mc-inputbar.hs-mc-resub-share {
      box-shadow: 0 0 0 2px #9147ff inset, 0 0 8px rgba(145,71,255,0.4);
      background: rgba(145,71,255,0.08);
    }
    #hs-mc-input.hs-mc-resub-share,
    #hs-mc-input.hs-mc-resub-share:focus {
      border-color: #9147ff !important;
      background: #faf5ff !important;
    }
    #hs-mc-input.hs-mc-resub-share::placeholder,
    #hs-mc-input.hs-mc-resub-share[contenteditable]:empty::before,
    #hs-mc-input.hs-mc-resub-share[contenteditable]:has(br:only-child)::before {
      color: #9147ff !important;
      font-weight: 600 !important;
    }
    /* Watch-streak share mode — orange glow signals heat/streak, distinct
       from resub purple. Same input mechanism, different brand color. */
    #hs-mc-inputbar.hs-mc-watchstreak-share {
      box-shadow: 0 0 0 2px #ff7f00 inset, 0 0 8px rgba(255,127,0,0.4);
      background: rgba(255,127,0,0.08);
    }
    #hs-mc-input.hs-mc-watchstreak-share,
    #hs-mc-input.hs-mc-watchstreak-share:focus {
      border-color: #ff7f00 !important;
      background: #fff5ea !important;
    }
    #hs-mc-input.hs-mc-watchstreak-share::placeholder,
    #hs-mc-input.hs-mc-watchstreak-share[contenteditable]:empty::before,
    #hs-mc-input.hs-mc-watchstreak-share[contenteditable]:has(br:only-child)::before {
      color: #ff7f00 !important;
      font-weight: 600 !important;
    }
    /* Contenteditable placeholder. Browsers leave a stray BR after focus/blur
       cycles which breaks :empty — match BR-only-child too so the placeholder
       still paints in that state. */
    #hs-mc-input[contenteditable]:empty::before,
    #hs-mc-input[contenteditable]:has(br:only-child)::before {
      content: attr(data-placeholder);
      color: #808080;
      pointer-events: none;
      position: absolute;
      left: 12px;
      top: 8px;
      /* Single line — long placeholders (resub-share mode) were wrapping
         below the input box because absolute placement leaves the text
         unconstrained. Clip with ellipsis if it overflows. */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: calc(100% - 24px);
    }
    /* WYSIWYG emote images in input — height clamped, width auto so wide
       emotes (catKISS, peepoArrive, etc.) render at natural aspect.
       max-width caps absurdly wide ones so a single emote can't blow out the
       inputbar layout. cursor:pointer overrides the contenteditable's text
       caret so every state reads as interactive (right-click blocks, blocked
       left-click unblocks). The chrome content.js hover-overlay paints the
       state-coloured rect over the IMG on hover. */
    #hs-mc-input .hs-input-emote {
      /* Kick's Tailwind preflight sets img{display:block} globally — without an
         explicit inline-block the bare chip breaks onto its own line and the
         input balloons. Twitch has no such reset, so this was Kick-only. */
      display: inline-block;
      height: var(--hs-emote-size, 32px);
      width: auto;
      max-width: 192px;
      vertical-align: middle;
      margin: 0 2px;
      object-fit: contain;
      cursor: pointer;
    }
    /* WYSIWYG zero-width / overlay emote stacking in input.
       Fixed height keeps line layout stable when overlays render larger than
       the base; overflow:visible lets tall overlays bleed above/below the
       baseline (same effect as .hs-mc-emote-stack in chat messages). */
    #hs-mc-input .hs-input-stack {
      display: inline-grid;
      place-items: center;
      vertical-align: middle;
      margin: 0 2px;
      height: var(--hs-emote-size, 32px);
      box-sizing: border-box;
      position: relative;
      overflow: visible;
    }
    #hs-mc-input .hs-input-stack > img {
      grid-area: 1 / 1;
      margin: 0;
      max-width: 192px;
    }
    /* Overlay child renders at native size for chat parity (chat uses the
       same trick via .hs-mc-overlay-emote). The base img keeps its clamped
       height so the stack stays anchored to the line. */
    #hs-mc-input .hs-input-stack > .hs-input-overlay {
      height: auto !important;
      max-height: none;
      margin: 0 !important;
    }
    #hs-mc-input .hs-input-stack > img:first-child { z-index: 1; }
    #hs-mc-input .hs-input-stack > img:not(:first-child) { z-index: 2; }
    /* Emoji base of an input stack (overlay emote stacked onto an emoji) —
       co-locate at the grid cell so the overlay img lands on top of it. */
    #hs-mc-input .hs-input-stack > .hs-mc-emoji {
      grid-area: 1 / 1;
      margin: 0;
      z-index: 1;
    }
    /* Emoji acting as the OVERLAY (stacked on top of the left base) sits above. */
    #hs-mc-input .hs-input-stack > .hs-mc-emoji:not(:first-child) { z-index: 2; }
    /* Blocked emote in input — parity with chat/picker: dashed gray border,
       image hidden. Image content is masked to a 1×1 transparent placeholder
       (src swap in applyInputEmoteBlockState) so outline still renders (a
       visibility:hidden / opacity:0 approach also hides the outline). Width
       collapses to a fixed square so dashed box is always visible. Cursor
       hints clickability (chrome content.js hover-overlay paints the red
       rect over the dashed box on hover, matching chat-wrapper behaviour). */
    #hs-mc-input .hs-input-emote.hs-state-blocked {
      outline: 2px dashed #808080;
      outline-offset: -2px;
      width: var(--hs-emote-size, 32px);
      min-width: var(--hs-emote-size, 32px);
      cursor: pointer;
    }
    .hs-mc-emoji {
      font-variant-emoji: emoji;
    }
    /* Emoji autocomplete dropdown */
    #hs-mc-emoji-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 8px;
      right: 8px;
      background: #000;
      border: 1px solid #808080;
      z-index: 1004;
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 2px;
    }
    .hs-mc-emoji-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      cursor: pointer;
      font-size: 13px;
      color: #fff;
    }
    .hs-mc-emoji-row:hover,
    .hs-mc-emoji-row.selected {
      background: #fff;
      color: #000;
    }
    .hs-mc-emoji-preview {
      font-size: 18px;
      width: 24px;
      text-align: center;
      font-variant-emoji: emoji;
    }
    .hs-mc-emoji-name {
      color: #808080;
      font-size: 13px;
    }
    .hs-mc-emoji-row.selected .hs-mc-emoji-name,
    .hs-mc-emoji-row:hover .hs-mc-emoji-name {
      color: #fff;
    }
    #hs-mc-slash-dropdown {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 8px;
      right: 8px;
      background: #000;
      border: 1px solid #808080;
      z-index: 1004;
      max-height: 280px;
      overflow-y: auto;
      margin-bottom: 2px;
    }
    .hs-mc-slash-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 5px 10px;
      cursor: pointer;
      font-size: 13px;
      color: #fff;
    }
    .hs-mc-slash-row:hover,
    .hs-mc-slash-row.selected {
      background: #fff;
      color: #000;
    }
    .hs-mc-slash-name { color: #ff8700; font-weight: 700; }
    .hs-mc-slash-args { color: #aaa; flex-shrink: 0; }
    .hs-mc-slash-desc { color: #808080; font-size: 13px; margin-left: auto; }
    .hs-mc-slash-row:hover .hs-mc-slash-args,
    .hs-mc-slash-row.selected .hs-mc-slash-args,
    .hs-mc-slash-row:hover .hs-mc-slash-desc,
    .hs-mc-slash-row.selected .hs-mc-slash-desc { color: #000; }
    .hs-mc-slash-row:hover .hs-mc-slash-name,
    .hs-mc-slash-row.selected .hs-mc-slash-name { color: #000; }
    /* Toggle button */
    .hs-mc-toggle-btn {
      padding: 4px 10px;
      background: #000;
      color: #808080;
      border: none;
      border-radius: 0;
      font-size: 13px;
      cursor: pointer;
      transition: none;
    }
    .hs-mc-toggle-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-toggle-btn.active {
      background: #9147ff;
      color: #fff;
    }
    #hs-mc-input.over-limit {
      /* text color handled by highlight overlay */
    }
    /* Wrapper to position overlay over the input */
    #hs-mc-input-wrap {
      position: relative;
      flex: 1;
      display: flex;
    }
    #hs-mc-input-wrap #hs-mc-input { flex: 1; }
    /* Overlay that mirrors input text with overflow highlighting */
    #hs-mc-input-highlight {
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      padding: 8px 12px;
      font-size: 13px;
      font-family: inherit;
      white-space: pre;
      overflow: hidden;
      pointer-events: none;
      border: 1px solid transparent;
    }
    #hs-mc-input-highlight .hl-safe { color: #000; }
    #hs-mc-input-highlight .hl-over { color: #ff4444; }
    #hs-mc-send {
      padding: 8px 12px;
      background: #9147ff;
      color: #fff;
      border: none;
      border-radius: 0;
      cursor: pointer;
      font-size: 14px;
    }
    #hs-mc-send:hover {
      background: #fff;
      color: #000;
    }

    /* Heatsync button */
    #hs-mc-emote-btn {
      padding: 4px;
      background: #000;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: none;
    }
    #hs-mc-emote-btn img {
      width: 24px;
      height: 24px;
      display: block;
    }
    #hs-mc-emote-btn:hover {
      background: #fff;
    }

    /* ── Twitch tab sub-tabs (square icon row at top) ─────────────────────── */
    .hs-mc-tw-subtabs {
      display: flex;
      gap: 4px;
      padding: 6px 8px 4px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      flex-shrink: 0;
    }
    .hs-mc-tw-subtab {
      width: 36px;
      height: 36px;
      padding: 0;
      background: #000;
      color: #fff;
      border: 1px solid rgba(255,255,255,0.3);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: none;
    }
    .hs-mc-tw-subtab:hover,
    .hs-mc-tw-subtab:focus-visible {
      background: rgba(255,255,255,0.12);
      border-color: #fff;
      outline: none;
    }
    .hs-mc-tw-subtab.active {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    .hs-mc-tw-subtab svg { display: block; }
    .hs-mc-tw-content {
      flex: 1;
      overflow-y: auto;
      padding: 4px 0;
    }
    .hs-mc-cheer-inline {
      margin: 6px 8px;
    }

    /* ── Cheer panel — inline bits purchase in the picker's twitch tab ────── */
    .hs-mc-cheer-panel {
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      padding: 10px;
      margin: 6px 8px 10px 8px;
      font: inherit;
      font-size: 13px;
      line-height: 1.3;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255,255,255,0.25);
    }
    .hs-mc-cheer-panel .hs-mc-cheer-title {
      font-weight: 600;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-balance {
      font-variant-numeric: tabular-nums;
      opacity: 0.85;
      flex-shrink: 0;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-preview {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 28px;
      padding: 4px 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.18);
    }
    .hs-mc-cheer-panel .hs-mc-cheer-preview-img {
      width: 28px;
      height: 28px;
      object-fit: contain;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-preview-label {
      font-variant-numeric: tabular-nums;
      flex: 1;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-amounts {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-amt {
      flex: 1 0 auto;
      min-width: 48px;
      padding: 6px 10px;
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      cursor: pointer;
      font: inherit;
      font-variant-numeric: tabular-nums;
      transition: none;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-amt:hover,
    .hs-mc-cheer-panel .hs-mc-cheer-amt:focus-visible {
      background: #fff;
      color: #000;
      outline: none;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-amt.active {
      background: #fff;
      color: #000;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-custom {
      flex: 1 0 80px;
      min-width: 80px;
      padding: 6px 10px;
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      font: inherit;
      font-variant-numeric: tabular-nums;
      -moz-appearance: textfield;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-custom::-webkit-outer-spin-button,
    .hs-mc-cheer-panel .hs-mc-cheer-custom::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-msg {
      padding: 6px 10px;
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      font: inherit;
      width: 100%;
      box-sizing: border-box;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-msg::placeholder,
    .hs-mc-cheer-panel .hs-mc-cheer-custom::placeholder {
      color: rgba(255,255,255,0.45);
    }
    .hs-mc-cheer-panel .hs-mc-cheer-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-cancel,
    .hs-mc-cheer-panel .hs-mc-cheer-send {
      padding: 6px 14px;
      background: #000;
      color: #fff;
      border: 1px solid #fff;
      cursor: pointer;
      font: inherit;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-cancel:hover,
    .hs-mc-cheer-panel .hs-mc-cheer-send:hover:not(:disabled) {
      background: #fff;
      color: #000;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-send:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-launch {
      width: 100%;
      padding: 12px;
      font-size: 1.05em;
      font-weight: 700;
    }
    .hs-mc-cheer-panel .hs-mc-cheer-note {
      font-size: 0.85em;
      opacity: 0.7;
      padding: 4px 2px;
      line-height: 1.4;
    }

    /* Cheermote rendering inside chat messages — universal Cheer tier image
       (animated) + colored amount. Triggered by msg.bits > 0 in the renderer. */
    .hs-mc-cheermote {
      height: 24px;
      width: auto;
      vertical-align: middle;
      display: inline-block;
      margin: -2px 2px 0 0;
    }
    .hs-mc-cheer-amt {
      font-weight: 700;
      margin-right: 2px;
      font-variant-numeric: tabular-nums;
      font-size: 1.05em;
    }

    /* === Profile card — system sans, no chrome, badges-first === */
    .hs-pcard {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif;
      padding: 10px;
      color: #fff;
      background: #000;
      font-size: 13px;
      line-height: 18px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 7px;
      height: 100%;
      overflow-y: auto;
      position: relative;
      /* Accent CSS var — defaults to heatsync orange, overridden per-streamer
         when the GQL response carries a primaryColorHex. Drives the hero
         border, avatar ring, and accent-tinted divider glow below. */
      --hs-pcard-accent: #ff8700;
    }
    /* Hero banner — compact strip, image lives behind the avatar/name. Shorter
       than the original 140px so identity + actions fit in the first viewport. */
    .hs-pcard-hero {
      position: relative;
      height: 76px;
      margin: -10px -10px 0 -10px;
      background: linear-gradient(135deg, var(--hs-pcard-accent, #1a1a1a) 0%, #0a0a0a 70%, #000 100%);
      overflow: hidden;
      border-bottom: 1px solid var(--hs-pcard-accent, #2a2a2a);
    }
    .hs-pcard-hero-img {
      position: absolute; inset: 0;
      background-position: center; background-size: cover; background-repeat: no-repeat;
      opacity: 0;
      transform: scale(1.04);
      transition: opacity 320ms ease-out, transform 1200ms ease-out;
      filter: saturate(1.1) contrast(1.04);
    }
    .hs-pcard-hero.hs-pcard-hero-loaded .hs-pcard-hero-img {
      opacity: 0.9;
      transform: scale(1);
    }
    .hs-pcard-hero-scrim {
      position: absolute; inset: 0;
      background:
        linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0.95) 100%),
        linear-gradient(90deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.35) 100%);
      pointer-events: none;
    }
    /* Identity row sits flush below the hero; only the avatar lifts upward
       to overlap the seam. Discord/Twitter idiom — banner + half-overlapping
       pfp + name below, with the rest of the column flowing normally. */
    .hs-pcard-id .hs-pcard-id-row {
      position: relative;
      z-index: 1;
      margin-top: 4px;
    }
    /* Sticky close — pinned to card top-right, stays visible while scrolling.
       Negative bottom margin lets it overlay the id-row without taking column
       space; id-row gets right padding so display name never slides under it. */
    .hs-pcard-close {
      position: absolute; top: 8px; right: 8px;
      margin: 0;
      width: 30px; height: 30px;
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; line-height: 1; font-weight: 400;
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.25);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
      cursor: pointer; padding: 0;
      z-index: 10;
      transition: background 80ms, color 80ms, border-color 80ms, transform 80ms;
    }
    .hs-pcard-close:hover { background: #fff; color: #000; border-color: #fff; transform: scale(1.08); }
    .hs-pcard-close:active { transform: scale(0.96); }
    .hs-pcard-close:focus-visible { outline: 1px solid #ff8700; outline-offset: 1px; }
    /* Close button overlays the hero — no need to reserve right space on the id row.
       Kept rule absent so the row sits flush; the absolute-positioned close has its own footprint. */
    /* Sections are pure spacing — drop chrome borders + label-on-top */
    .hs-pcard-section {
      border: 0; padding: 0; margin: 0; position: static; background: transparent;
    }
    .hs-pcard-section-title { display: none; }
    /* Section dividers — accent-tinted at low opacity so each card adopts
       the streamer's identity color, without the divider screaming for
       attention. Falls back to #1a1a1a when accent is unset. */
    .hs-pcard-section + .hs-pcard-section {
      border-top: 1px solid color-mix(in srgb, var(--hs-pcard-accent, #1a1a1a) 18%, #0a0a0a);
      padding-top: 7px;
    }

    .hs-pcard-id-row { display: flex; gap: 10px; align-items: flex-start; }
    .hs-pcard-avatar {
      width: 56px; height: 56px; border-radius: 0; object-fit: cover;
      flex-shrink: 0;
      border: 2px solid var(--hs-pcard-accent, #fff);
      background: #000;
      /* Lifts avatar so it half-overlaps the shorter (76px) hero strip. */
      margin-top: -32px;
      position: relative;
      z-index: 2;
      box-shadow:
        0 0 0 2px #000,
        0 6px 16px rgba(0, 0, 0, 0.7),
        0 0 18px color-mix(in srgb, var(--hs-pcard-accent, transparent) 35%, transparent);
    }
    .hs-pcard-id-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    /* Identity chip row — pills + native badges + age/role/verified all flow
       as flex-wrap siblings; no forced line breaks between groups. */
    .hs-pcard-id-chips {
      display: flex; flex-wrap: wrap; gap: 3px; align-items: center;
      font-size: 13px; line-height: 18px;
    }
    .hs-pcard-id-chips img.hs-mc-badge-img { width: 18px; height: 18px; }
    .hs-pcard-name {
      font-size: 16px; font-weight: 700; color: #fff;
      display: flex; align-items: center; gap: 6px; line-height: 18px;
    }
    .hs-pcard-livedot { color: #ff5050; font-size: 9px; animation: hs-pcard-pulse 1.5s infinite; }
    @keyframes hs-pcard-pulse { 50% { opacity: 0.4; } }
    /* Filled-style platform pills — mirror #hs-user-tooltip .hs-pc-platform
       so the click-card identity row looks identical to the hover tooltip. */
    .hs-pcard-pill {
      padding: 1px 2px; border: 1px solid #000; text-decoration: none;
      font-weight: 900; letter-spacing: 0.2px; white-space: nowrap;
      display: inline-flex; align-items: center; gap: 3px;
      line-height: 16px;
    }
    .hs-pcard-pill:hover { background: #fff !important; color: #000 !important; border-color: #000; }
    .hs-pcard-pill-twitch { background: #9146ff; color: #fff; }
    .hs-pcard-pill-kick { background: #53fc18; color: #000; }
    .hs-pcard-pill-youtube { background: #ff0000; color: #fff; }
    .hs-pcard-pill-live { color: #ff5050; }
    .hs-pcard-bio {
      color: #aaa; font-size: 13px; line-height: 18px;
      white-space: pre-wrap; word-break: break-word;
      border-left: 2px solid #1a1a1a; padding: 0 0 0 8px;
    }
    .hs-pcard-bio-mention { color: #ff8700; cursor: pointer; }
    .hs-pcard-bio-mention:hover { text-decoration: underline; }
    .hs-pcard-bio-tag { color: #ff00ff; text-decoration: none; }
    .hs-pcard-bio-tag:hover { text-decoration: underline; }
    /* Property sheet — 2-col zebra list. The pcard surface uses system-sans
       by default (see body.hs-font-bitmap .hs-pcard counter-rule near top
       of styles.js), so the sheet must opt back into 13px CozetteVector +
       bitmap render block for crispness. dt/dd cells must NEVER have
       fractional metrics (no kerning, ligatures, letter-spacing) or the
       bitmap glyphs smear — same root cause as the tooltip badge fix. */
    .hs-pcard-sheet {
      display: grid; grid-template-columns: max-content 1fr;
      column-gap: 12px; row-gap: 0;
      font-family: 'CozetteVector', 'Courier New', monospace;
      font-size: 13px; line-height: 18px;
      margin: 0;
    }
    .hs-pcard-sheet dt, .hs-pcard-sheet dd {
      padding: 1px 6px; margin: 0;
    }
    .hs-pcard-sheet dt { color: #888; font-weight: 400; }
    .hs-pcard-sheet dd { color: #fff; font-weight: 700; }
    /* Zebra cadence — alt rows use the same #1f1f1f as chat zebra. */
    .hs-pcard-sheet dt:nth-of-type(even),
    .hs-pcard-sheet dd:nth-of-type(even) { background: #1f1f1f; }
    /* Semantic color on values — only fields with state earn a color. */
    /* ANSI 256-mapped semantic colors. Each row's value carries meaning via hue:
       identity = brand, time = yellow, tier = amber/silver, power = red,
       relationship direction = cool (outflow) / warm (inflow) / saturated (mutual). */
    .hs-pcard-sheet .val-age { color: #ffff00; }       /* xterm 226 — time */
    .hs-pcard-sheet .val-partner { color: #ffaf00; }    /* xterm 214 — premium */
    .hs-pcard-sheet .val-affiliate { color: #bcbcbc; }  /* xterm 250 — entry */
    .hs-pcard-sheet .val-ttv { color: #9146ff; }        /* twitch brand */
    .hs-pcard-sheet .val-kick { color: #53fc18; }       /* kick brand */
    .hs-pcard-sheet .val-yt { color: #ff0000; }         /* xterm 196 — yt brand */
    .hs-pcard-sheet .val-admin { color: #ff0000; }      /* xterm 196 — power */
    .hs-pcard-sheet .val-staff { color: #ff8700; }      /* xterm 208 — hs orange */
    .hs-pcard-sheet .val-heat { color: #ff0000; }       /* xterm 196 — fire */
    .hs-pcard-sheet .val-followers { color: #0087ff; }  /* xterm 33 — popularity */
    .hs-pcard-sheet .val-you-follow { color: #00ffff; } /* xterm 51 — outflow */
    .hs-pcard-sheet .val-you-sub { color: #875fff; }    /* xterm 99 — paid outflow */
    .hs-pcard-sheet .val-they-follow { color: #ff00ff; }/* xterm 201 — inflow */
    .hs-pcard-sheet .val-they-sub { color: #ff5fff; }   /* xterm 207 — paid inflow */
    .hs-pcard-sheet .val-mutual { color: #00ff00; }     /* xterm 46 — handshake */
    .hs-pcard-sheet .val-mutual-sub { color: #ffd700; } /* xterm 220 — premium handshake */
    .hs-pcard-sheet .val-ch { color: #ff8700; }         /* xterm 208 — channel context */
    .hs-pcard-sheet .hs-pc-live { color: #ff0000; font-weight: 700; }
    /* Inside the sheet: digits inherit cozette from the sheet (bitmap-crisp),
       degree symbol falls back to ui-monospace (vector AA, has clean °). */
    .hs-pcard-sheet .hs-heat-num { font-family: inherit; }
    .hs-pcard-sheet .hs-heat-n { font-family: inherit; }
    .hs-pcard-sheet .hs-heat-deg { font-family: ui-monospace, SFMono-Regular, monospace; }
    .hs-pcard-sheet .val-rel { color: #ff8700; }
    /* Counter-counter: re-apply bitmap render block to the sheet so cozette
       renders crisp inside the .hs-pcard system-sans bubble. */
    body.hs-font-bitmap .hs-pcard .hs-pcard-sheet,
    body.hs-font-bitmap .hs-pcard .hs-pcard-sheet * {
      -webkit-font-smoothing: none !important;
      -moz-osx-font-smoothing: unset !important;
      font-smooth: never !important;
      text-rendering: optimizeSpeed !important;
      font-synthesis: none !important;
      font-optical-sizing: none !important;
      font-kerning: none !important;
      font-variant-ligatures: none !important;
      font-feature-settings: "kern" 0, "liga" 0, "clig" 0, "calt" 0 !important;
      letter-spacing: 0 !important;
    }
    /* Counter-counter-counter: the ° span inside the sheet wants AA back —
       cozette's degree glyph (if it exists) renders thin/uneven, vector AA °
       looks cleaner. Listed AFTER the sheet bitmap block so it wins. */
    body.hs-font-bitmap .hs-pcard .hs-pcard-sheet .hs-heat-deg {
      -webkit-font-smoothing: subpixel-antialiased !important;
      -moz-osx-font-smoothing: auto !important;
      font-smooth: auto !important;
      text-rendering: auto !important;
      font-kerning: auto !important;
      font-feature-settings: normal !important;
      letter-spacing: normal !important;
    }
    .hs-pcard-link { color: #ff8700; text-decoration: none; font-weight: 600; }
    .hs-pcard-link:hover { text-decoration: underline; }
    .hs-pcard-msg {
      display: flex; gap: 6px; padding: 2px 0;
      font-size: 13px; align-items: baseline;
    }
    .hs-pcard-msg-ts { color: #555; flex-shrink: 0; font-size: 13px; min-width: 38px; }
    .hs-pcard-msg-plat {
      flex-shrink: 0; font-size: 13px; padding: 0 3px;
      font-weight: 600; line-height: 19px; color: #888;
    }
    /* Recent-message platform letter — text-only override, no bg. The
       identity-row pills above share .hs-pcard-pill-* classes for color but
       want the filled tooltip look; the inline message-history badge stays
       plain so 12 stacked rows don't read as a wall of purple. */
    .hs-pcard-msg-plat.hs-pcard-pill-twitch { background: transparent; color: #9146ff; border: none; }
    .hs-pcard-msg-plat.hs-pcard-pill-kick { background: transparent; color: #53fc18; border: none; }
    .hs-pcard-msg-plat.hs-pcard-pill-youtube { background: transparent; color: #ff5050; border: none; }
    .hs-pcard-msg-text {
      color: #fff; word-break: break-word; overflow-wrap: anywhere; flex: 1;
    }
    .hs-pcard-action-grid {
      display: flex; flex-wrap: wrap; gap: 3px;
    }
    .hs-pcard-action {
      background: transparent; color: #fff; border: 1px solid #333;
      padding: 4px 10px; cursor: pointer; font-family: inherit; font-size: 13px;
      text-align: center; box-sizing: border-box; line-height: 18px;
    }
    .hs-pcard-action:hover:not(:disabled) { background: #fff; color: #000; border-color: #fff; }
    .hs-pcard-action:disabled { opacity: 0.4; cursor: not-allowed; }

    /* Mod actions row — compact toolbar at the top of the card when you mod
       a channel this user has chatted in. Channel label + del/timeout/ban
       buttons sit on a single line per channel. Buttons share borders so the
       group reads as one unit, mirroring the inline hover toolbar style. */
    .hs-pcard-mod {
      background: color-mix(in srgb, var(--hs-pcard-accent, #ff8700) 10%, #000);
      border-left: 2px solid var(--hs-pcard-accent, #ff8700);
      padding: 5px 8px;
      margin: -2px 0;
    }
    .hs-pcard-mod-row {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 13px; line-height: 18px;
    }
    .hs-pcard-mod-row + .hs-pcard-mod-row { margin-top: 4px; }
    .hs-pcard-mod-ch {
      color: var(--hs-pcard-accent, #ff8700);
      font-weight: 700; font-size: 13px;
      min-width: 0; flex-shrink: 0; margin-right: 2px;
    }
    .hs-pcard-mod-btn {
      background: transparent; color: #fff;
      border: 1px solid #555; border-right-width: 0;
      padding: 2px 7px; cursor: pointer; font-family: inherit;
      font-size: 13px; line-height: 16px; box-sizing: border-box;
    }
    .hs-pcard-mod-btn:last-child { border-right-width: 1px; }
    .hs-pcard-mod-btn:hover:not(:disabled) { background: #fff; color: #000; border-color: #fff; }
    .hs-pcard-mod-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .hs-pcard-mod-btn-danger { color: #ff5050; border-color: #5a1414; }
    .hs-pcard-mod-btn-danger:hover:not(:disabled) { background: #ff5050; color: #000; border-color: #ff5050; }

    /* Per-tab platform filter toggles (T/K/Y). Sits AFTER the util cluster
       (DOM order). Horizontal mode: tight content-sized strip on far right.
       Vertical mode: full column width row below util. */
    #hs-mc-platfilter {
      display: flex;
      flex: 0 0 auto;
      gap: 0;
      align-items: stretch;
      margin-left: -1px;
    }
    #hs-mc-platfilter:empty { display: none; margin: 0; }
    /* Inside platfilter: T/K/Y buttons each share the cluster width */
    #hs-mc-platfilter .hs-mc-pf-btn {
      flex: 1 1 0 !important;
      width: auto !important;
      min-width: 18px !important;
      max-width: none !important;
    }
    /* Vertical mode: platfilter spans full column width, buttons share row */
    .hs-tabs-right #hs-mc-platfilter,
    .hs-tabs-left #hs-mc-platfilter {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 0;
      width: 100%;
      box-sizing: border-box;
      margin-left: 0;
      flex: 0 0 auto;
    }
    .hs-tabs-right #hs-mc-platfilter .hs-mc-pf-btn,
    .hs-tabs-left #hs-mc-platfilter .hs-mc-pf-btn {
      flex: 1 1 0 !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 22px !important;
      font-size: 13px !important;
    }
    .hs-mc-pf-btn {
      background: transparent;
      border: 1px solid;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
      line-height: 1;
      box-sizing: border-box;
      min-width: 0;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    /* ON state — saturated platform color, matches platform identity */
    .hs-mc-pf-btn.hs-mc-pf-twitch { border-color: #9146ff !important; background: #9146ff !important; color: #fff !important; }
    .hs-mc-pf-btn.hs-mc-pf-kick { border-color: #53fc18 !important; background: #53fc18 !important; color: #000 !important; }
    .hs-mc-pf-btn.hs-mc-pf-youtube {
      border-color: #ff0000 !important;
      background: #ff0000 !important;
      color: #fff !important;
    }
    /* OFF state — black bg with white text + dim border. The disabled
       cue is the loss of the saturated brand bg (purple/green/red),
       not text dimming — keeping the letter at #fff makes it readable
       against any dark backdrop bleeding through. */
    .hs-mc-pf-btn.off {
      background: #000 !important;
      color: #fff !important;
      border-color: #333 !important;
    }
    .hs-mc-pf-btn:hover { background: #fff !important; color: #000 !important; border-color: #fff !important; }
    .hs-mc-pf-btn.off:hover {
      background: #fff !important;
      color: #000 !important;
      border-color: #fff !important;
    }

    /* Emote picker panel — full-width section above inputbar */
    #hs-mc-emote-picker {
      display: none;
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: min(400px, 60vh);
      background: #000;
      border-top: 1px solid #808080;
      z-index: 1003;
      overflow: hidden;
      flex-direction: column;
      font-family: inherit;
      box-sizing: border-box;
    }
    #hs-mc-emote-picker.visible {
      display: flex;
    }

    /* Picker tabs — pinned to bottom */
    #hs-mc-emote-picker .hs-mc-picker-tabs {
      display: flex !important;
      border-top: 1px solid #808080;
      flex-shrink: 0 !important;
      min-height: 0 !important;
      margin-top: auto !important;
      visibility: visible !important;
      opacity: 1 !important;
      background: #000 !important;
    }
    #hs-mc-emote-picker .hs-mc-picker-tab {
      flex: 1 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 5px !important;
      padding: 6px 4px !important;
      background: transparent !important;
      color: #808080 !important;
      border: none !important;
      cursor: pointer;
      font-size: 13px !important;
      font-weight: 600 !important;
      line-height: 1 !important;
      text-align: center;
      visibility: visible !important;
      opacity: 1 !important;
      height: auto !important;
      width: auto !important;
      overflow: visible !important;
      position: relative !important;
      transition: none;
    }
    #hs-mc-emote-picker .hs-mc-picker-tab:hover {
      background: #fff !important;
      color: #000 !important;
    }
    #hs-mc-emote-picker .hs-mc-picker-tab.active {
      color: #ff6b35 !important;
      background: transparent !important;
    }
    #hs-mc-emote-picker .hs-mc-picker-tab.active:hover {
      background: #fff !important;
      color: #000 !important;
    }
    #hs-mc-emote-picker .hs-mc-picker-tab.active::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: #ff6b35;
    }
    .hs-mc-tab-content {
      flex: 1 1 0 !important;
      min-height: 0 !important;
      overflow-y: auto !important;
    }
    /* Custom scrollbar — Chrome + Firefox */
    .hs-mc-tab-content,
    .hs-mc-picker-scroll {
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.12) transparent;
    }
    .hs-mc-tab-content::-webkit-scrollbar,
    .hs-mc-picker-scroll::-webkit-scrollbar {
      width: 4px;
    }
    .hs-mc-tab-content::-webkit-scrollbar-track,
    .hs-mc-picker-scroll::-webkit-scrollbar-track {
      background: transparent;
    }
    .hs-mc-tab-content::-webkit-scrollbar-thumb,
    .hs-mc-picker-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.12);
      border-radius: 0;
    }
    .hs-mc-tab-content::-webkit-scrollbar-thumb:hover,
    .hs-mc-picker-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.2);
    }
    .hs-mc-picker-scroll {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }
    .hs-mc-picker-section-header {
      display: none;
    }
    .hs-mc-picker-section-count {
      color: #808080;
      font-size: 13px;
      background: rgba(255,255,255,0.06);
      padding: 1px 5px;
      border-radius: 0;
    }
    .hs-mc-picker-section-grid {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px;
      padding: 6px;
    }
    .hs-mc-picker-header {
      padding: 8px !important;
      border-bottom: 1px solid rgba(255,255,255,0.08) !important;
      display: block !important;
      visibility: visible !important;
      background: #000 !important;
    }
    /* Search-wrap hosts BOTH the input (flex:1) and the chip bar (right
       edge), so providers chips visibly anchor to the search input — not
       to the emote grid below. Z-index 2 on the icon keeps it above the
       input's white bg without intercepting clicks. */
    .hs-mc-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hs-mc-search-icon {
      position: absolute;
      left: 10px;
      pointer-events: none;
      opacity: 0.4;
      z-index: 2;
    }
    #hs-mc-emote-search {
      flex: 1;
      min-width: 0;
      width: auto;
      padding: 4px 8px 4px 28px;
      background: #fff;
      color: #000;
      border: 1px solid #808080;
      border-radius: 0;
      font-size: 13px;
      outline: none;
      box-sizing: border-box;
      transition: none;
    }
    #hs-mc-emote-search:focus {
      border-color: #ff6b35;
    }
    .hs-mc-src-chips {
      display: flex;
      align-items: center;
      gap: 3px;
      flex-shrink: 0;
    }
    /* Provider chips wear each network's brand color (7TV cyan, BTTV red,
       FFZ blue) — matches src-* tooltip colors and keeps orange reserved
       for HeatSync brand chrome. Inactive = ghost (brand text, half-strength
       border, no fill); active = full brand fill with contrasting text;
       hover = white (snappy override across both states). */
    .hs-mc-src-chip {
      background: transparent;
      border: 1px solid;
      font-size: 13px;
      font-weight: 700;
      padding: 3px 7px;
      cursor: pointer;
      font-family: inherit;
      border-radius: 0;
      line-height: 15px;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: background 60ms, color 60ms, border-color 60ms;
    }
    .hs-mc-src-chip[data-src="7tv"]  { color: #29d8f6; border-color: rgba(41,216,246,0.5); }
    .hs-mc-src-chip[data-src="bttv"] { color: #d50014; border-color: rgba(213,0,20,0.5); }
    .hs-mc-src-chip[data-src="ffz"]  { color: #0086c8; border-color: rgba(0,134,200,0.5); }
    .hs-mc-src-chip.active[data-src="7tv"]  { background: #29d8f6; color: #000; border-color: #29d8f6; }
    .hs-mc-src-chip.active[data-src="bttv"] { background: #d50014; color: #fff; border-color: #d50014; }
    .hs-mc-src-chip.active[data-src="ffz"]  { background: #0086c8; color: #fff; border-color: #0086c8; }
    .hs-mc-src-chip:hover { background: #fff !important; color: #000 !important; border-color: #fff !important; }
    #hs-mc-emote-search::placeholder {
      color: #808080;
    }
    .hs-mc-picker-emote {
      width: auto !important;
      height: auto !important;
      min-width: 28px !important;
      min-height: 28px !important;
      max-width: 96px !important;
      max-height: 32px !important;
      object-fit: contain !important;
      cursor: pointer !important;
      border-radius: 0 !important;
      padding: 4px !important;
      transition: none;
      display: inline-block !important;
      visibility: visible !important;
    }
    /* Hover state lives on the wrap (.hs-mc-picker-emote-wrap ::before) —
       solid green/orange/dashed-grey rects there. Old img-level translucent
       bg-fills (green for owned, cyan for unadded, red for blocked) were
       fighting the new wrap rect: img sat on top of ::before in the stacking
       order, so the user saw green/cyan rect-with-orange-outline instead of
       a clean orange rect. Removed; wrap ::before is now the single source. */
    .hs-mc-picker-empty {
      padding: 32px !important;
      text-align: center !important;
      color: #808080 !important;
      font-size: 13px !important;
      visibility: visible !important;
    }
    .hs-mc-picker-divider {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 4px 0;
    }

    /* Emote sizing default */
    :root {
      --hs-emote-size: 32px;
    }

    /* ═══ Twitch menu ═══ */
    .hs-mc-menu-item {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
      padding: 10px 14px !important;
      cursor: pointer !important;
      color: #fff !important;
      transition: none;
      visibility: visible !important;
      border-left: 3px solid transparent;
      margin: 0 6px;
    }
    .hs-mc-menu-item:hover {
      background: #fff !important;
      border-left-color: #000;
    }
    .hs-mc-menu-item:active {
      background: #fff !important;
    }
    .hs-mc-menu-icon {
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,107,53,0.12);
      background: color-mix(in srgb, var(--menu-accent, #ff6b35) 12%, transparent);
      color: var(--menu-accent, #ff6b35);
      flex-shrink: 0;
      transition: none;
    }
    .hs-mc-menu-item:hover .hs-mc-menu-icon {
      background: #000;
      color: #fff;
      transform: scale(1.08);
    }
    .hs-mc-menu-text {
      flex: 1;
      min-width: 0;
    }
    .hs-mc-menu-title {
      font-size: 13px;
      font-weight: 500;
      color: #fff;
      line-height: 17px;
    }
    .hs-mc-menu-desc {
      font-size: 13px;
      color: #808080;
      line-height: 17px;
      margin-top: 1px;
    }
    .hs-mc-menu-item:hover .hs-mc-menu-title {
      color: #000;
    }
    .hs-mc-menu-item:hover .hs-mc-menu-desc {
      color: #000;
    }
    .hs-mc-menu-arrow {
      color: #808080;
      flex-shrink: 0;
      transition: none;
    }
    .hs-mc-menu-item:hover .hs-mc-menu-arrow {
      color: #000;
      transform: translateX(2px);
    }
    .hs-mc-menu-divider {
      height: 1px;
      background: rgba(255,255,255,0.06);
      margin: 4px 20px;
    }

    /* ═══ Predictions ═══ */
    .hs-mc-pred-loading {
      padding: 20px;
      text-align: center;
      color: #808080;
      font-size: 13px;
    }
    .hs-mc-pred-empty {
      padding: 20px;
      text-align: center;
    }
    .hs-mc-pred-empty-text {
      color: #808080;
      font-size: 13px;
    }
    .hs-mc-prediction {
      padding: 10px 12px;
    }
    .hs-mc-pred-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .hs-mc-pred-title {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      line-height: 17px;
      flex: 1;
    }
    .hs-mc-pred-title img,
    .hs-mc-pred-outcome-title img {
      height: 1.2em;
      vertical-align: -0.2em;
      margin: 0 1px;
    }
    .hs-mc-pred-locked {
      font-size: 13px;
      padding: 2px 6px;
      border-radius: 0;
      background: rgba(255,255,255,0.1);
      color: #808080;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .hs-mc-pred-timer {
      font-size: 13px;
      color: #ff6b35;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .hs-mc-pred-balance {
      font-size: 13px;
      color: #808080;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .hs-mc-pred-outcomes {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .hs-mc-pred-outcome {
      background: rgba(255,255,255,0.04);
      border-radius: 0;
      padding: 8px 10px;
      border-left: 3px solid var(--oc, #387aff);
    }
    .hs-mc-pred-outcome-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }
    .hs-mc-pred-outcome-title {
      font-size: 13px;
      color: #fff;
      font-weight: 500;
    }
    .hs-mc-pred-outcome-pct {
      font-size: 13px;
      font-weight: 700;
      color: var(--oc, #387aff);
      font-variant-numeric: tabular-nums;
    }
    .hs-mc-pred-bar-track {
      height: 4px;
      background: rgba(255,255,255,0.08);
      border-radius: 0;
      overflow: hidden;
      margin-bottom: 4px;
    }
    .hs-mc-pred-bar-fill {
      height: 100%;
      background: var(--oc, #387aff);
      border-radius: 0;
    }
    .hs-mc-pred-outcome-stats {
      font-size: 13px;
      color: #808080;
      margin-bottom: 6px;
    }
    .hs-mc-pred-bet-row {
      display: flex;
      gap: 4px;
      align-items: center;
      flex-wrap: wrap;
    }
    .hs-mc-pred-bet-btn {
      background: rgba(0,0,0,0.7);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      font-size: 13px;
      padding: 3px 8px;
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-bet-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-bet-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-pred-bet-btn:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-pred-bet-custom {
      width: 52px;
      background: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      color: #000;
      font-size: 13px;
      padding: 2px 6px;
      outline: none;
      font-family: inherit;
    }
    .hs-mc-pred-bet-custom:focus {
      border-color: #ff8700;
    }
    .hs-mc-pred-bet-custom:disabled {
      background: rgba(255,255,255,0.08);
      color: #808080;
      opacity: 0.3;
    }
    .hs-mc-pred-bet-custom::-webkit-inner-spin-button,
    .hs-mc-pred-bet-custom::-webkit-outer-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .hs-mc-pred-bet-go {
      background: rgba(0,0,0,0.7);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 3px 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-bet-go:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-bet-go:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-pred-bet-go:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-pred-bet-max {
      font-weight: 600;
      color: #ff8700;
    }
    .hs-mc-pred-bet-max:hover {
      background: #fff;
      color: #000;
    }

    /* Prediction states */
    .hs-mc-pred-status {
      font-size: 13px;
      padding: 2px 6px;
      white-space: nowrap;
      flex-shrink: 0;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-mc-pred-status-resolved {
      background: rgba(0,200,100,0.15);
      color: #00c864;
    }
    .hs-mc-pred-status-canceled {
      background: rgba(255,255,255,0.08);
      color: #808080;
    }

    /* Result banners */
    .hs-mc-pred-result {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      padding: 8px 12px;
      margin-bottom: 8px;
      border-radius: 0;
      text-align: center;
    }
    .hs-mc-pred-result-amount {
      font-size: 18px;
      font-weight: 900;
      font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
      letter-spacing: -0.5px;
    }
    .hs-mc-pred-result-label {
      font-size: 13px;
      font-weight: 600;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-left: 4px;
    }
    .hs-mc-pred-result-won {
      background: rgba(0,200,100,0.12);
      color: #00e070;
      border: 1px solid rgba(0,200,100,0.3);
    }
    .hs-mc-pred-result-lost {
      background: rgba(255,60,60,0.08);
      color: #ff5050;
      border: 1px solid rgba(255,60,60,0.2);
    }
    .hs-mc-pred-result-refund {
      background: rgba(255,135,0,0.1);
      color: #ff8700;
      border: 1px solid rgba(255,135,0,0.25);
    }
    .hs-mc-pred-result-neutral {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255,255,255,0.5);
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
    }

    /* Outcome states */
    .hs-mc-pred-outcome-won {
      border-left-color: #00c864;
      background: rgba(0,200,100,0.08);
    }
    .hs-mc-pred-outcome-lost {
      opacity: 0.45;
    }
    .hs-mc-pred-outcome-yours {
      box-shadow: inset 0 0 0 1px rgba(255,135,0,0.3);
    }
    .hs-mc-pred-winner-badge {
      font-size: 9px;
      padding: 1px 5px;
      background: #00c864;
      color: #000;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      vertical-align: middle;
      margin-left: 4px;
    }

    /* ═══ Mod controls ═══ */
    .hs-mc-pred-mod-notice {
      font-size: 13px;
      color: #ff8700;
      background: rgba(255,135,0,0.08);
      border: 1px solid rgba(255,135,0,0.2);
      border-radius: 0;
      padding: 5px 8px;
      margin-top: 6px;
      text-align: center;
    }
    .hs-mc-pred-resolve-yours {
      border-color: #ff8700 !important;
      color: #ff8700 !important;
    }
    .hs-mc-pred-resolve-yours:hover {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-pred-mod-row {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .hs-mc-pred-mod-btn {
      font-size: 13px;
      padding: 4px 10px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-mod-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-mod-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-pred-mod-btn:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-pred-lock-btn:hover,
    .hs-mc-pred-cancel-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-resolve-btn {
      margin-top: 6px;
      width: 100%;
      color: var(--oc);
      border-color: var(--oc);
    }
    .hs-mc-pred-resolve-btn:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }

    /* ═══ Create prediction form ═══ */
    .hs-mc-pred-create {
      margin-top: 10px;
    }
    .hs-mc-pred-create-toggle {
      width: 100%;
      text-align: center;
    }
    .hs-mc-pred-create-form {
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .hs-mc-pred-create-input {
      font-size: 13px;
      padding: 2px 8px;
      background: #fff;
      color: #000;
      border: none;
      font-family: inherit;
      outline: none;
    }
    .hs-mc-pred-create-input:focus {
      outline: 1px solid #ff8700;
    }
    .hs-mc-pred-create-dur-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .hs-mc-pred-create-dur-label {
      font-size: 13px;
      color: #808080;
      margin-right: 2px;
    }
    .hs-mc-pred-create-dur {
      font-size: 13px;
      padding: 2px 6px;
      background: rgba(0,0,0,0.7);
      color: #aaa;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-pred-create-dur:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-pred-create-dur-active {
      background: #ff8700;
      color: #000;
      border-color: #ff8700;
    }
    .hs-mc-pred-create-submit {
      background: rgba(0,0,0,0.7);
      color: #ff8700;
      border-color: #ff8700;
      font-weight: 600;
    }
    .hs-mc-pred-create-submit:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }

    /* ═══ Polls ═══ */
    .hs-mc-poll {
      padding: 10px 12px;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .hs-mc-poll-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .hs-mc-poll-title {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      line-height: 17px;
      flex: 1;
    }
    .hs-mc-poll-status {
      font-size: 13px;
      padding: 2px 6px;
      white-space: nowrap;
      flex-shrink: 0;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-mc-poll-status-ended {
      background: rgba(255,255,255,0.08);
      color: #808080;
    }
    .hs-mc-poll-timer {
      font-size: 13px;
      color: #ff8700;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .hs-mc-poll-meta {
      font-size: 13px;
      color: #808080;
      margin-bottom: 8px;
    }
    .hs-mc-poll-choices {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .hs-mc-poll-choice {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .hs-mc-poll-choice-track {
      flex: 1;
      height: 28px;
      background: rgba(255,255,255,0.06);
      position: relative;
      overflow: hidden;
    }
    .hs-mc-poll-choice-fill {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: rgba(145,71,255,0.35);
    }
    .hs-mc-poll-choice-top .hs-mc-poll-choice-fill {
      background: rgba(145,71,255,0.6);
    }
    .hs-mc-poll-choice-voted .hs-mc-poll-choice-track {
      box-shadow: inset 0 0 0 1px rgba(255,135,0,0.3);
    }
    .hs-mc-poll-choice-label {
      position: relative;
      z-index: 1;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 8px;
      height: 28px;
    }
    .hs-mc-poll-choice-name {
      font-size: 13px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-mc-poll-choice-pct {
      font-size: 13px;
      font-weight: 700;
      color: #9147ff;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      margin-left: 8px;
    }
    .hs-mc-poll-choice-top .hs-mc-poll-choice-pct {
      color: #bf8fff;
    }
    .hs-mc-poll-voted-check {
      color: #ff8700;
      font-weight: 700;
    }
    .hs-mc-poll-vote-btn {
      background: rgba(145,71,255,0.3);
      border: none;
      color: #bf8fff;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 10px;
      cursor: pointer;
      white-space: nowrap;
      font-family: inherit;
    }
    .hs-mc-poll-vote-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-poll-vote-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-poll-mod-row {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .hs-mc-poll-mod-btn {
      font-size: 13px;
      padding: 4px 10px;
      background: rgba(0,0,0,0.7);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-poll-mod-btn:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-poll-mod-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }
    .hs-mc-poll-mod-btn:disabled:hover {
      background: rgba(0,0,0,0.7);
      color: #fff;
    }
    .hs-mc-poll-empty {
      padding: 0 12px;
    }
    .hs-mc-poll-create {
      border-top: 1px solid rgba(255,255,255,0.06);
      padding-top: 8px;
      margin-top: 4px;
    }
    .hs-mc-poll-create-toggle {
      width: 100%;
      text-align: center;
    }
    .hs-mc-poll-create-form {
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }
    .hs-mc-poll-create-input {
      font-size: 13px;
      padding: 2px 8px;
      background: #fff;
      color: #000;
      border: none;
      font-family: inherit;
      outline: none;
    }
    .hs-mc-poll-create-input:focus {
      outline: 1px solid #ff8700;
    }
    .hs-mc-poll-create-dur-row {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .hs-mc-poll-create-dur-label {
      font-size: 13px;
      color: #808080;
      margin-right: 2px;
    }
    .hs-mc-poll-create-dur {
      font-size: 13px;
      padding: 2px 6px;
      background: rgba(0,0,0,0.7);
      color: #808080;
      border: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      font-family: inherit;
    }
    .hs-mc-poll-create-dur:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-poll-create-dur-active {
      background: #ff8700;
      color: #000;
      border-color: #ff8700;
    }
    .hs-mc-poll-create-submit {
      width: 100%;
      text-align: center;
      background: rgba(0,0,0,0.7);
      color: #ff8700;
      border-color: #ff8700;
      font-weight: 600;
    }
    .hs-mc-poll-create-submit:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }

    .hs-mc-pred-links {
      border-top: 1px solid rgba(255,255,255,0.06);
      margin-top: 8px;
      padding-top: 4px;
    }
    .hs-mc-pred-links .hs-mc-menu-item {
      padding: 6px 14px !important;
    }
    .hs-mc-pred-links .hs-mc-menu-icon {
      width: 28px;
      height: 28px;
    }
    .hs-mc-pred-links .hs-mc-quicklink-section {
      padding: 10px 14px 4px;
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-mc-pred-links .hs-mc-quicklink-section:first-child {
      padding-top: 4px;
    }

    /* ═══ /status panel ═══
       All text 13px CozetteVector — anything else looks jank in Chrome's
       renderer (see memory: feedback_browser_text_cozette_13). The crisp
       block on body.hs-font-bitmap covers descendants so we don't repeat
       it here; just lock the family + size. */
    .hs-mc-status-overlay {
      position: fixed; bottom: 60px; right: 20px; z-index: 99999;
      background: #000; border: 2px solid #ff8700;
      padding: 12px 16px; min-width: 280px; max-width: 420px;
      font: 13px/1.4 'CozetteVector', 'Courier New', monospace;
      color: #fff;
      box-shadow: 0 0 12px rgba(255,135,0,0.5);
      cursor: pointer;
    }
    .hs-mc-status-loading { font-size: 13px; color: #999; }
    .hs-mc-status-title { font-size: 13px; font-weight: 600; color: #ff8700; }
    .hs-mc-status-sub { font-size: 13px; margin-top: 2px; }
    .hs-mc-status-sub.live { color: #59ff8a; }
    .hs-mc-status-sub.off  { color: #999; }
    .hs-mc-status-streamtitle { font-size: 13px; color: #fff; margin-top: 6px; }
    .hs-mc-status-meta { font-size: 13px; color: #999; margin-top: 2px; }
    .hs-mc-status-section {
      margin-top: 10px; padding-bottom: 4px;
      font-size: 13px; color: #666;
      text-transform: uppercase;
      border-bottom: 1px solid #222;
    }
    .hs-mc-status-modes { margin-top: 4px; }
    .hs-mc-status-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 13px; }
    .hs-mc-status-key { color: #ccc; }
    .hs-mc-status-val.on  { color: #59ff8a; }
    .hs-mc-status-val.off { color: #666; }
    .hs-mc-status-note { font-size: 13px; color: #555; margin-top: 4px; }

    /* ═══ Rewards ═══ */
    .hs-mc-rewards {
      border-top: 1px solid rgba(255,255,255,0.06);
      margin-top: 8px;
      padding-top: 8px;
    }
    .hs-mc-rewards-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 14px 6px;
    }
    .hs-mc-rewards-label {
      font-size: 13px;
      font-weight: 600;
      color: #808080;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-mc-rewards-balance {
      font-size: 13px;
      color: #808080;
    }
    .hs-mc-rewards-empty {
      font-size: 13px;
      color: #808080;
      padding: 8px 14px;
    }
    .hs-mc-rewards-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 0 14px;
    }
    .hs-mc-reward-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: rgba(255,255,255,0.04);
      border-left: 2px solid var(--rc, #9147ff);
      cursor: pointer;
      transition: none;
    }
    .hs-mc-reward-card:not(.hs-mc-reward-unavailable):hover {
      background: #fff;
    }
    .hs-mc-reward-card:not(.hs-mc-reward-unavailable):hover .hs-mc-reward-title,
    .hs-mc-reward-card:not(.hs-mc-reward-unavailable):hover .hs-mc-reward-cost,
    .hs-mc-reward-card:not(.hs-mc-reward-unavailable):hover .hs-mc-reward-reason {
      color: #000;
    }
    .hs-mc-reward-unavailable {
      opacity: 0.4;
      cursor: default;
    }
    .hs-mc-reward-unavailable:hover {
      background: rgba(255,255,255,0.04);
    }
    .hs-mc-reward-img {
      flex-shrink: 0;
      object-fit: contain;
    }
    .hs-mc-reward-info {
      min-width: 0;
      overflow: hidden;
    }
    .hs-mc-reward-title {
      font-size: 13px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-mc-reward-cost {
      font-size: 13px;
      color: #808080;
    }
    .hs-mc-reward-reason {
      font-size: 9px;
      color: #f5009b;
      margin-top: 1px;
    }
    .hs-mc-reward-input-row {
      grid-column: 1 / -1;
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }
    .hs-mc-reward-input {
      flex: 1;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      color: #fff;
      font-size: 13px;
      padding: 4px 6px;
      border-radius: 0;
      outline: none;
    }
    .hs-mc-reward-input:focus {
      border-color: #9147ff;
    }
    .hs-mc-reward-submit {
      background: #9147ff;
      border: none;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 0;
      cursor: pointer;
      transition: none;
    }
    .hs-mc-reward-submit:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-reward-submit:disabled {
      opacity: 0.5;
      cursor: default;
    }

    /* ═══ Chat Color Picker ═══ */
    .hs-mc-color-picker {
      margin-top: 4px;
    }
    .hs-mc-color-current {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 2px;
      vertical-align: -2px;
      margin-left: 6px;
      border: 1px solid rgba(255,255,255,0.2);
    }
    .hs-mc-color-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      padding: 4px 14px;
    }
    .hs-mc-color-swatch {
      width: 20px;
      height: 20px;
      border-radius: 2px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: none;
    }
    .hs-mc-color-swatch:hover {
      border-color: #fff;
      transform: scale(1.2);
    }
    .hs-mc-color-custom {
      display: flex;
      gap: 4px;
      padding: 4px 14px;
    }
    .hs-mc-color-hex {
      flex: 1;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      color: #fff;
      font-size: 13px;
      padding: 3px 6px;
      font-family: inherit;
      border-radius: 0;
    }
    .hs-mc-color-hex:focus {
      border-color: #9147ff;
      outline: none;
    }
    .hs-mc-color-apply {
      background: #9147ff;
      border: none;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding: 3px 10px;
      cursor: pointer;
    }
    .hs-mc-color-apply:hover {
      background: #fff;
      color: #000;
    }

    /* ═══ Chat Modes ═══ */
    .hs-mc-chat-modes {
      margin-top: 4px;
    }
    .hs-mc-modes-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px 14px;
    }
    .hs-mc-mode-btn {
      font-size: 13px;
      padding: 3px 8px;
      background: rgba(255,255,255,0.06);
      color: #808080;
      cursor: pointer;
      border: 1px solid rgba(255,255,255,0.08);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .hs-mc-mode-btn:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    .hs-mc-mode-btn.active {
      background: rgba(0,200,175,0.15);
      color: #00c8af;
      border-color: rgba(0,200,175,0.3);
    }

    /* ═══ Settings tab ═══ */
    .hs-mc-settings-group {
      padding: 4px 0;
    }
    .hs-mc-settings-group + .hs-mc-settings-group {
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .hs-mc-settings-group-title {
      font-size: 13px;
      font-weight: 600;
      color: #808080;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 10px 14px 4px;
    }
    .hs-mc-setting-row {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 6px 14px !important;
      font-size: 13px !important;
      color: #fff !important;
      visibility: visible !important;
    }
    .hs-mc-setting-row.hs-mc-setting-row-split {
      justify-content: space-between !important;
    }
    .hs-mc-setting-row:nth-child(even) {
      background: #1a1a1a;
    }
    .hs-mc-setting-row:hover {
      background: #2a2a2a;
    }
    .hs-mc-setting-label {
      color: #fff !important;
      font-size: 13px !important;
      cursor: help;
      border-bottom: 1px dotted #808080;
    }
    #hs-settings-tip {
      position: fixed;
      z-index: 99999;
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      padding: 6px 8px;
      font-size: 13px;
      line-height: 18px;
      max-width: 260px;
      pointer-events: none;
      display: none;
      font-family: 'Liberation Mono', monospace;
    }
    #hs-settings-tip.visible { display: block; }
    .hs-mc-setting-row.hs-mc-setting-row-block {
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
    }
    .hs-mc-setting-textarea {
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      font-family: 'Liberation Mono', monospace;
      font-size: 13px;
      padding: 4px 6px;
      resize: vertical;
      min-height: 48px;
      width: 100%;
      box-sizing: border-box;
    }
    .hs-mc-setting-textarea:focus {
      outline: none;
      border-color: #ff8700;
    }
    .hs-mc-locale-select {
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      font-family: 'Liberation Mono', monospace;
      font-size: 13px;
      padding: 3px 6px;
      cursor: pointer;
      flex-shrink: 0;
      max-width: 60%;
    }
    .hs-mc-locale-select:hover, .hs-mc-locale-select:focus {
      background: #fff;
      color: #000;
      outline: none;
      border-color: #fff;
    }
    .hs-mc-setting-row .hs-mc-toggle-pill,
    .hs-mc-setting-row .hs-mc-size-btns {
      flex-shrink: 0;
    }
    .hs-mc-size-btns {
      display: flex;
      gap: 2px;
      background: #000;
      padding: 2px;
    }
    .hs-mc-size-btn {
      padding: 4px 10px !important;
      background: transparent !important;
      color: #808080 !important;
      border: none !important;
      border-radius: 0 !important;
      font-size: 13px !important;
      cursor: pointer !important;
      display: inline-block !important;
      visibility: visible !important;
      transition: none;
    }
    .hs-mc-size-btn:hover {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-size-btn.active {
      background: #ff6b35 !important;
      color: #fff !important;
    }
    .hs-mc-size-btn.active:hover {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-toggle-pill {
      width: 16px;
      height: 16px;
      background: #cc0000;
      border: none;
      border-radius: 0;
      cursor: pointer;
      padding: 0;
      transition: none;
      flex-shrink: 0;
    }
    .hs-mc-toggle-pill.active {
      background: #00dd00;
    }
    .hs-mc-toggle-knob {
      display: none;
    }

    /* == Settings sub-tab bar =============================================== */
    .hs-mc-set-subtabs {
      display: flex;
      gap: 4px;
      padding: 6px 8px 4px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      flex-shrink: 0;
      overflow-x: auto;
      position: sticky;
      top: 0;
      background: #000;
      z-index: 2;
    }
    .hs-mc-set-subtab {
      width: 34px;
      height: 34px;
      padding: 0;
      background: #000;
      color: #fff;
      border: 1px solid rgba(255,255,255,0.3);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: none;
    }
    .hs-mc-set-subtab:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
      outline: none;
    }
    .hs-mc-set-subtab.active {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    .hs-mc-set-subtab svg { display: block; }
    .hs-mc-set-subtab-body {
      flex: 1;
      overflow-y: auto;
    }
    /* Settings text inputs (custom font name, etc.) */
    .hs-mc-set-text-input {
      background: #000;
      color: #fff;
      border: 1px solid #808080;
      font-family: "Liberation Mono", monospace;
      font-size: 13px;
      padding: 3px 6px;
      flex-shrink: 0;
    }
    .hs-mc-set-text-input:focus {
      outline: none;
      border-color: #ff8700;
    }
    /* Server filter status line */
    .hs-mc-set-status {
      font-size: 11px;
      color: #808080;
      min-height: 14px;
      padding: 2px 14px;
    }
    .hs-mc-set-status.ok { color: #4caf50; }
    .hs-mc-set-status.err { color: #f44336; }
    /* Crash log pre block */
    .hs-mc-set-crash-pre {
      background: #0a0a0a;
      color: #c0c0c0;
      border: 1px solid #333;
      padding: 6px 8px;
      font-size: 10px;
      max-height: 180px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
      font-family: "Liberation Mono", monospace;
    }

    /* Ensure parent has relative positioning for overlay */
    .chat-scrollable-area__message-container {
      position: relative !important;
    }

    /* Parent of scrollable area needs proper sizing for absolute overlay */
    [class*="chat-room"] [class*="scrollable-area"] {
      position: relative !important;
    }

    /* Hide Twitch's native tab arrows when our tabs are present */
    #hs-mc-tabbar ~ [class*="tabs-buttons"],
    [class*="chat-header__tabs-buttons"],
    [class*="tabs__scroll-button"],
    .chat-room__content [class*="scroll-button"] {
      display: none !important;
    }

    /* Hide leaderboard carousel arrows */
    [aria-label="Previous leaderboard set"],
    [aria-label="Next leaderboard set"],
    .channel-leaderboard-header-rotating__users ~ button,
    [class*="channel-leaderboard"] button[aria-label*="leaderboard"] {
      display: none !important;
    }

    /* Rotation button — inherits from .hs-mc-util-btn */

    /* When input bar is hidden, overlay fills the gap */
    .hs-tabs-top:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay,
    .hs-tabs-right:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay,
    .hs-tabs-left:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay {
      bottom: 0 !important;
    }
    .hs-tabs-top:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker,
    .hs-tabs-right:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker,
    .hs-tabs-left:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker {
      bottom: 0 !important;
    }

    /* RIGHT SIDE TABS LAYOUT - absolute position at right edge */
    .hs-tabs-right #hs-mc-tabbar {
      position: absolute !important;
      left: auto !important;
      right: 0 !important;
      top: 0 !important;
      bottom: 0 !important;
      width: 90px;
      flex-direction: column;
      flex-shrink: 0;
      padding: 0;
      gap: 0;
      border-bottom: none;
      border-left: 1px solid #fff;
      border-radius: 0;
      background: #000;
      overflow-y: auto;
      overflow-x: visible;
      scrollbar-width: none;
      z-index: 1001;
    }
    .hs-tabs-right #hs-mc-tabbar::-webkit-scrollbar { display: none; }
    .hs-tabs-right .hs-mc-tab,
    .hs-tabs-left .hs-mc-tab {
      padding: 4px 14px 4px 6px !important;
      font-size: 13px !important;
      min-width: 0 !important;
      max-width: none !important;
      width: 100% !important;
      /* Left-align (not center) — see .hs-mc-tab base for the bitmap-snap
         reasoning. Util buttons override this back to center below. */
      text-align: left !important;
      box-sizing: border-box !important;
      flex: 0 0 auto !important;
      margin: 0 0 -1px 0 !important;
    }
    /* Util buttons (C/T/F-/F+/⚙) — single-glyph 18×18 squares — keep
       centered. Their text origin math always lands on an integer pixel
       because both inner width and glyph width are even. */
    .hs-tabs-right .hs-mc-util-btn,
    .hs-tabs-right .hs-mc-pf-btn,
    .hs-tabs-left .hs-mc-util-btn,
    .hs-tabs-left .hs-mc-pf-btn {
      text-align: center !important;
    }
    /* Vertical-tabs override for util buttons (C/T/F-/F+/⚙): the .hs-tabs-
       right/.hs-tabs-left .hs-mc-tab rule above forces width:100% on every
       tab, stretching util-btns to 90px and stacking them. Grow each button
       to fill its share of the 90px tabbar row so the strip reaches the far
       right edge (no 18px gap from fixed-size squares + left-aligned row). */
    .hs-tabs-right .hs-mc-util-btn,
    .hs-tabs-left .hs-mc-util-btn {
      /* Fixed 14px (12px content after 1px borders) -- even content width
         integer-centers CozetteVector's 6px glyph advance for both 1-glyph
         (C/T) and 2-glyph (F-/F+) labels. Growing to fill (flex:1) produced
         odd 15px widths, landing glyphs on a half-pixel and smearing the
         bitmap. 6x14=84 fits the 90px column without wrapping. */
      width: 14px !important;
      min-width: 14px !important;
      max-width: 14px !important;
      padding: 0 !important;
      flex: 0 0 14px !important;
      margin: 0 -1px 0 0 !important;
    }
    /* Right-cluster (util-row + platfilter) wraps both rows. In vertical mode
       the tabbar's align-items:flex-start collapses it to content width, so
       force full tabbar width so the rows themselves can stretch to the edge. */
    .hs-tabs-right .hs-mc-right-cluster,
    .hs-tabs-left .hs-mc-right-cluster {
      width: 100% !important;
      align-self: stretch !important;
    }
    /* Platfilter (T/K/Y) in vertical mode: stretch each button to fill its
       row (3 buttons share the 90px column width). */
    .hs-tabs-right .hs-mc-pf-btn,
    .hs-tabs-left .hs-mc-pf-btn {
      flex: 1 1 0 !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      padding: 0 !important;
      margin: 0 -1px 0 0 !important;
    }
    .hs-tabs-right #hs-mc-platfilter,
    .hs-tabs-left #hs-mc-platfilter {
      display: flex !important;
      flex-direction: row !important;
      width: 100% !important;
      flex: 0 0 auto !important;
    }
    .hs-tabs-right .hs-mc-tabs-scroll {
      display: flex;
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
      /* min-width: 0 + max-width: 100% + box-sizing: border-box keep this
         column constrained to the tabbar's 82px content area. without these,
         a long tab name (e.g. "asmongold247") forces flex's stretch to
         max(parent, min-content) which overflows the tabbar by ~15px,
         pushing live-dot ::after past the viewport edge on twitch's
         right-pinned column. */
      min-width: 0;
      max-width: 100%;
      width: 100%;
      box-sizing: border-box;
      scrollbar-width: none;
    }
    .hs-tabs-right .hs-mc-tabs-scroll::-webkit-scrollbar { display: none; }
    .hs-tabs-right #hs-mc-overlay {
      top: 0;
      left: 0;
      right: 90px;
      bottom: 52px;
    }
    .hs-tabs-right #hs-mc-inputbar {
      left: 0;
      right: 90px;
      z-index: 1002;
    }
    .hs-tabs-right #hs-mc-emote-picker {
      left: 0;
      right: 90px;
    }

    /* BOTTOM TABS LAYOUT */
    .hs-tabs-bottom #hs-mc-tabbar {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 44px;
      top: auto;
      padding: 0;
      border-top: 1px solid #fff;
      border-bottom: none;
      z-index: 1001;
    }
    .hs-tabs-bottom #hs-mc-inputbar {
      padding: 4px 8px;
    }
    .hs-tabs-bottom #hs-mc-overlay {
      top: 0;
      bottom: 75px; /* tab bar + input bar */
    }
    .hs-tabs-bottom #hs-mc-emote-picker {
      bottom: 75px; /* tab bar + input bar */
    }
    /* When inputbar is hidden, tabs flush to bottom */
    .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-tabbar {
      bottom: 0;
    }
    .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-overlay {
      bottom: 31px !important; /* tab bar only — override generic rule */
    }
    .hs-tabs-bottom:has(#hs-mc-inputbar.hs-hidden) #hs-mc-emote-picker {
      bottom: 31px !important;
    }

    /* LEFT SIDE TABS LAYOUT - absolute position at left edge (matches right) */
    .hs-tabs-left #hs-mc-tabbar {
      position: absolute !important;
      left: 0 !important;
      right: auto !important;
      top: 0 !important;
      bottom: 0 !important;
      width: 90px;
      flex-direction: column;
      flex-shrink: 0;
      padding: 0;
      gap: 0;
      border-bottom: none;
      border-right: 1px solid #fff;
      border-radius: 0;
      background: #000;
      overflow-y: auto;
      overflow-x: visible;
      scrollbar-width: none;
      z-index: 1001;
    }
    .hs-tabs-left #hs-mc-tabbar::-webkit-scrollbar { display: none; }
    .hs-tabs-left .hs-mc-tabs-scroll {
      display: flex;
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
      scrollbar-width: none;
    }
    .hs-tabs-left .hs-mc-tabs-scroll::-webkit-scrollbar { display: none; }
    .hs-tabs-left .hs-mc-rotate {
      margin-left: 0;
      margin-top: auto;
    }
    .hs-tabs-left #hs-mc-overlay {
      top: 0;
      left: 90px;
      right: 0;
      bottom: 52px;
    }
    .hs-tabs-left #hs-mc-inputbar {
      left: 90px;
      right: 0;
      z-index: 1002;
    }
    .hs-tabs-left #hs-mc-emote-picker {
      left: 90px;
      right: 0;
    }

    /* Popout mode - full width (respects tab bar position) */
    .hs-popout #hs-mc-overlay {
      left: 0 !important;
      right: 0 !important;
      width: auto !important;
    }
    .hs-popout #hs-mc-inputbar {
      left: 0 !important;
      right: 0 !important;
      width: auto !important;
    }
    .hs-popout #hs-mc-resize-handle {
      display: none !important;
    }
    /* Popout chat = full window, no video. Rotating the panel into a
       quadrant only leaves a blank area where the player would be. */
    .hs-popout .hs-mc-rotate-chat {
      display: none !important;
    }
    /* Popout chat fills the window — there's no host video next to it to
       reclaim space from. The orange resize handles just shrink the chat
       and leave dead space. Hide them; the user resizes via OS window
       edges. (#hs-c-resize-handle is the chat-container handle that
       actually renders in popout; the others belong to in-page layouts.) */
    .hs-popout #hs-mc-resize-handle,
    .hs-popout #hs-c-resize-handle,
    .hs-popout #hs-yt-resize-handle,
    .hs-popout #hs-kick-resize-handle {
      display: none !important;
    }
    /* Vertical tab modes (left/right) — stretch util buttons (C T F- F+ ⚙ ⛶)
       to fill the column width as a unified segmented control matching the
       channel-tab strip above. Without this, 5-6 buttons × 18px in a wider
       column leaves a visible gap on the right; popout mode (where C is
       hidden) showed this most clearly. Same rule covers in-page overlay
       and popout window. */
    .hs-tabs-right .hs-mc-util-row .hs-mc-util-btn,
    .hs-tabs-left .hs-mc-util-row .hs-mc-util-btn {
      flex: 1 1 0 !important;
      width: auto !important;
      max-width: none !important;
      min-width: 0 !important;
    }
    .hs-popout #hs-mc-emote-picker {
      left: 0 !important;
      right: 0 !important;
    }
    /* Popout with tabs on right - adjust for tab bar */
    .hs-popout.hs-tabs-right #hs-mc-overlay {
      right: 90px !important;
    }
    .hs-popout.hs-tabs-right #hs-mc-inputbar {
      right: 90px !important;
    }
    .hs-popout.hs-tabs-right #hs-mc-emote-picker {
      right: 90px !important;
    }
    /* Popout with tabs on left */
    .hs-popout.hs-tabs-left #hs-mc-overlay {
      left: 90px !important;
    }
    .hs-popout.hs-tabs-left #hs-mc-inputbar {
      left: 90px !important;
    }
    .hs-popout.hs-tabs-left #hs-mc-emote-picker {
      left: 90px !important;
    }
    /* Popout chat has no .chat-shell — container body-mounts and collapses to
       0 height because its only child is position:absolute. Pin it to fill
       the popout window so the overlay/input bar have real dimensions. */
    body.hs-popout #hs-mc-container {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: auto !important;
      height: auto !important;
      z-index: 9999 !important;
      background: #000 !important;
    }

    /* ---- FEED MESSAGE CARDS ---- */
    .hs-feed-msg {
      position: relative;
      padding: 1px 6px;
      line-height: 18px;
      font-size: 13px;
      word-wrap: break-word;
      word-break: break-word;
    }
    .hs-feed-avatar {
      width: 16px;
      height: 16px;
      vertical-align: middle;
      margin-right: 3px;
    }
    .hs-feed-user {
      font-weight: 600;
      font-size: 13px;
      color: #fff;
      text-decoration: none;
    }
    .hs-feed-user:hover {
      background: #fff;
      color: #000 !important;
      text-decoration: none;
    }
    .hs-feed-time {
      font-size: 13px;
      color: #808080;
      margin: 0 3px;
    }
    .hs-feed-body {
      color: #fff;
    }
    .hs-feed-stat {
      font-size: 13px;
      margin: 0 2px;
      cursor: default;
    }
    .hs-feed-replies {
      cursor: pointer !important;
    }
    .hs-feed-thread-link {
      color: #ff0;
      font-size: 13px;
      font-weight: 700;
      margin-right: 3px;
      text-decoration: none;
    }
    .hs-feed-thread-link:hover {
      background: #fff;
      color: #000;
      text-decoration: none;
    }
    .hs-feed-replies:hover {
      background: #fff;
      color: #000 !important;
    }
    .hs-feed-tag {
      font-size: 13px;
      font-weight: 700;
      margin-right: 3px;
      vertical-align: middle;
    }
    .hs-feed-tag-op {
      color: #ff0000;
    }
    .hs-feed-tag-mop {
      color: #ff00ff;
    }
    .hs-feed-tag-re {
      color: #00ffff;
    }
    .hs-mc-feed-reply-chip {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 100%;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      background: #000;
      border-top: 1px solid #1a1a1a;
      border-bottom: 1px solid #1a1a1a;
      font-size: 13px;
      line-height: 18px;
      box-sizing: border-box;
      z-index: 1002;
    }
    .hs-mc-feed-reply-ref {
      color: #a0a0a0;
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hs-mc-feed-reply-cancel {
      background: none;
      border: none;
      color: #808080;
      cursor: pointer;
      font-size: 13px;
      padding: 0 4px;
      font-family: inherit;
      flex-shrink: 0;
    }
    .hs-mc-feed-reply-cancel:hover {
      background: #fff;
      color: #000;
    }
    /* Canonical heat number — used everywhere via heatSpanHtml/heatSpanEl. Tier color/glow is set inline.
       Structure: <span.hs-heat-num><span.hs-heat-n>{digits}</span><span.hs-heat-deg>°</span></span>
       The two sub-spans let surfaces using a bitmap font keep the digits crisp
       while the degree symbol falls back to a vector font that has a clean glyph. */
    .hs-heat-num {
      font-variant-numeric: tabular-nums;
      font-weight: 900;
      line-height: 1;
    }
    .hs-heat-n {
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-heat-deg {
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-feed-heat-breathe {
      animation: hs-feed-heat-breathe 2.5s ease-in-out infinite;
    }
    @keyframes hs-feed-heat-breathe {
      0%, 100% { background: rgba(60,20,0,0.15); }
      50% { background: rgba(80,25,0,0.25); }
    }
    @keyframes hs-heat-breathe {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.04); opacity: 0.9; }
    }
    /* Pause our infinite animations inside the multichat panel when the
       host page is hidden. Scoped to specific animated elements rather
       than universal selectors — those caused selector-match thrash on
       every state change in heatsync.org. */
    body.hs-ext-hidden .hs-pcard-livedot,
    body.hs-ext-hidden [style*="hs-heat-breathe"],
    body.hs-ext-hidden [style*="hs-feed-heat-breathe"] {
      animation-play-state: paused !important;
    }
    .hs-post-link {
      color: #ffff00;
      font-weight: 700;
      cursor: pointer;
    }
    .hs-post-link:hover {
      text-decoration: underline;
    }
    @keyframes hs-post-highlight-pulse {
      0%   { outline-color: rgba(255, 255, 0, 1); background-color: rgba(255, 255, 0, 0.15); }
      100% { outline-color: rgba(255, 255, 0, 0); background-color: transparent; }
    }
    .hs-post-highlight {
      outline: 2px solid #ffff00;
      outline-offset: -2px;
      animation: hs-post-highlight-pulse 1s ease-out forwards;
    }
    .hs-thread-op {
      border-bottom: 1px solid #ff8700;
      padding-bottom: 4px;
      margin-bottom: 4px;
    }
    .hs-thread-container {
      margin-left: 12px;
      border-left: 2px solid #ff8700;
      padding-left: 8px;
      margin-bottom: 4px;
    }
    .hs-thread-reply {
      padding: 1px 4px;
      line-height: 17px;
      font-size: 13px;
    }
    .hs-thread-reply.is-thread-op {
      border-left: 2px solid #ff00ff;
      margin-left: -2px;
      padding-left: 10px;
    }
    .hs-feed-loader {
      cursor: default;
      font-size: 13px;
    }

    /* ---- MEDIA / EMBEDS ---- */
    .hs-feed-media {
      margin: 4px 0 2px;
      max-width: 100%;
    }
    .hs-feed-media img,
    .hs-feed-media video,
    .hs-feed-media-direct img,
    .hs-feed-media-direct video {
      max-width: 100%;
      max-height: 320px;
      display: block;
      border-radius: 0;
      cursor: pointer;
      background: #000;
    }
    .hs-feed-media-multi {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 3px;
    }
    .hs-feed-media-multi .hs-feed-media-item {
      max-height: 180px;
      width: 100%;
      object-fit: cover;
      border-radius: 0;
      background: #000;
    }
    .hs-feed-embed-container {
      position: relative;
      width: 100%;
      max-width: 480px;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 0;
      overflow: hidden;
    }
    .hs-feed-embed-container iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .hs-feed-embed-spotify {
      aspect-ratio: auto;
      height: 152px;
    }
    .hs-feed-embed-soundcloud {
      aspect-ratio: auto;
      height: 166px;
    }
    .hs-feed-embed-twitter {
      aspect-ratio: auto;
      height: 380px;
      max-width: 480px;
      background: transparent;
    }
    .hs-feed-embed-imgur {
      aspect-ratio: auto;
      max-width: 480px;
      background: transparent;
    }
    .hs-feed-embed-tiktok {
      aspect-ratio: 9 / 16;
      max-width: 320px;
    }
    .hs-feed-embed-yt-thumb {
      position: relative;
      display: block;
      width: 100%;
      max-width: 480px;
      aspect-ratio: 16 / 9;
      background: #000;
      overflow: hidden;
      cursor: pointer;
    }
    .hs-feed-embed-yt-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .hs-feed-embed-yt-play {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 28px;
      text-shadow: 0 0 6px rgba(0,0,0,0.8);
      background: rgba(0,0,0,0.25);
      transition: background 0.15s;
    }
    .hs-feed-embed-yt-thumb:hover .hs-feed-embed-yt-play {
      background: #fff;
      color: #000;
      text-shadow: none;
    }
    .hs-feed-link-card {
      margin: 4px 0 2px;
      padding: 4px 6px;
      background: rgba(255,255,255,0.04);
      border: 1px solid #333;
      border-radius: 0;
      max-width: 480px;
    }
    .hs-feed-link-card-link {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ff8700;
      text-decoration: none;
      font-size: 13px;
    }
    .hs-feed-link-card-link:hover {
      text-decoration: underline;
    }
    .hs-feed-link-card-icon {
      color: #888;
      font-size: 13px;
      flex-shrink: 0;
    }
    .hs-feed-link-card-url {
      color: #aaa;
      word-break: break-all;
    }
    .hs-feed-media-deleted {
      padding: 6px 8px;
      background: #1a1a1a;
      border: 1px solid #444;
      color: #888;
      font-size: 13px;
      border-radius: 0;
      max-width: 480px;
    }
    /* ---- SERVER-RESOLVED EMBEDS (reddit, etc) ---- */
    .hs-feed-embed-pending {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 60px;
      padding: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid #333;
      max-width: 480px;
      margin: 4px 0 2px;
    }
    .hs-feed-embed-pending-label {
      color: #888;
      font-size: 13px;
      opacity: 0.7;
    }
    .hs-feed-embed-rich-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      background: rgba(255,255,255,0.04);
      border: 1px solid #333;
      max-width: 480px;
      margin: 4px 0 2px;
      text-decoration: none;
      color: #ddd;
      white-space: normal;
    }
    .hs-feed-embed-rich-card * { white-space: normal; }
    .hs-feed-embed-rich-card:hover { border-color: #555; }
    .hs-feed-embed-rich-thumb,
    .hs-feed-embed-rich-thumb-placeholder {
      width: 64px;
      height: 64px;
      flex-shrink: 0;
      object-fit: cover;
      background: rgba(255,255,255,0.05);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #888;
      font-size: 13px;
    }
    .hs-feed-embed-rich-meta {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .hs-feed-embed-rich-platform {
      font-size: 13px;
      text-transform: uppercase;
      color: #888;
      letter-spacing: 0.5px;
    }
    .hs-feed-embed-rich-title {
      font-size: 13px;
      font-weight: 600;
      color: #ddd;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
    .hs-feed-embed-rich-author {
      font-size: 13px;
      color: #aaa;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-feed-embed-rich-image {
      max-width: 480px;
      max-height: 480px;
      width: auto;
      height: auto;
      display: block;
      margin: 4px 0 2px;
    }
    .hs-feed-embed-rich-video {
      max-width: 480px;
      width: 100%;
      height: auto;
      display: block;
      margin: 4px 0 2px;
      background: #000;
    }
    .hs-feed-embed-rich-imglink { display: block; line-height: 0; }

    /* ---- TEXT FORMATTING ---- */
    .hs-spoiler {
      background: #808080;
      color: transparent;
      cursor: pointer;
      border-radius: 2px;
      padding: 0 2px;
      transition: none;
    }
    .hs-spoiler.revealed {
      background: transparent;
      color: inherit;
    }
    .hs-greentext {
      color: #789922;
    }
    .hs-inline-code {
      background: #000;
      padding: 1px 4px;
      border-radius: 2px;
      font-family: monospace;
      font-size: 13px;
    }
    .hs-mention {
      color: #8080ff;
      text-decoration: none;
      cursor: pointer;
    }
    .hs-mention:hover {
      text-decoration: underline;
    }
    .hs-mention.self {
      background: #800000;
      color: #fff;
      padding: 0 2px;
      border-radius: 2px;
    }
    .hs-hashtag {
      color: #ff00ff;
      text-decoration: none;
      cursor: pointer;
    }
    .hs-hashtag:hover {
      box-shadow: inset 0 0 0 100px #fff;
      color: #000;
    }
    .hs-tripcode {
      color: #117743;
      font-weight: normal;
      margin-left: 4px;
      font-size: 13px;
    }

    /* ---- TAB BADGE ---- */
    .hs-mc-tab .hs-badge {
      background: #ff6b35;
      color: #fff;
      border-radius: 2px;
      font-size: 13px;
      min-width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 4px;
      padding: 0 3px;
    }

    /* ---- KICK NATIVE CHAT HIDING ---- */
    /* Twitch's .chat-input wrapper also matches [class*="chat-input"]. Exclude
       it when it carries the resub-share callout queue so the banner surfaces. */
    .hs-native-hidden #chatroom-messages,
    .hs-native-hidden [class*="chatroom-footer"],
    .hs-native-hidden [class*="chat-input"]:not(:has([data-test-selector="chat-private-callout-queue__callout-container"] *)),
    .hs-native-hidden div.editor-input {
      display: none !important;
    }
    .hs-native-hidden#channel-chatroom > * {
      display: none !important;
    }
    /* Force Kick chatroom hidden — container (sibling) becomes the panel */
    .hs-native-hidden#channel-chatroom {
      display: none !important;
    }
    /* Container becomes the fixed side panel when native is hidden */
    .hs-native-hidden#channel-chatroom ~ #hs-mc-container {
      position: fixed !important;
      right: 0 !important;
      top: 0 !important;
      bottom: 0 !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: 100vh !important;
      z-index: 9999 !important;
      display: flex !important;
      background: #000 !important;
      transition: none !important;
    }
    /* Collapsed (\\ / > button): the kick side-panel rule above is (2,1,0) and
       outranks the generic body.hs-chat-hidden hide at (1,1,1). Re-hide the
       container with a higher-specificity rule so collapse works on Kick too. */
    body.hs-chat-hidden .hs-native-hidden#channel-chatroom ~ #hs-mc-container {
      display: none !important;
    }
    /* Shrink Kick's main content to make room for HeatSync panel.
       Gate to chat-right (or default — no hs-chat-* class). For
       hs-chat-left/top/bottom, the position-specific padding rules
       elsewhere in this file handle the offset; applying margin-right
       here too would carve 340px off the wrong side and shrink main
       (e.g., chat-left → empty right gutter, video clipped). */
    body:has(.hs-native-hidden#channel-chatroom):not(.hs-chat-left):not(.hs-chat-top):not(.hs-chat-bottom):not(.hs-chat-hidden) main {
      margin-right: var(--hs-kick-chat-width, 340px) !important;
      transition: none !important;
    }
    /* On live tab (native chat showing), hide overlay + input but keep tabs visible */
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-overlay,
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-emote-picker,
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > .hs-mc-inputbar {
      display: none !important;
    }
    /* Keep tabbar visible over native chat — fixed panel, respects tab position */
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      position: fixed !important;
      z-index: 10000 !important;
      background: transparent !important;
      pointer-events: none;
      overflow: visible !important;
    }
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      pointer-events: auto;
      background: var(--hs-bg, #000) !important;
      position: relative !important;
    }
    #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-kick-resize-handle {
      pointer-events: auto;
    }
    /* Top tabs (default) — horizontal bar at top of chat */
    .hs-tabs-top #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      top: 0 !important; right: 0 !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: auto !important;
      flex-direction: column !important;
    }
    .hs-tabs-top #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      width: 100% !important;
    }
    /* Bottom tabs — horizontal bar at bottom of chat */
    .hs-tabs-bottom #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      bottom: 0 !important; right: 0 !important;
      width: var(--hs-kick-chat-width, 340px) !important;
      height: auto !important;
      flex-direction: column-reverse !important;
    }
    .hs-tabs-bottom #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      width: 100% !important;
    }
    /* Right tabs — vertical bar on right edge */
    .hs-tabs-right #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      top: 0 !important; right: 0 !important; bottom: 0 !important;
      width: auto !important;
      height: 100% !important;
      flex-direction: row !important;
    }
    .hs-tabs-right #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: column !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      width: 90px !important;
      height: 100% !important;
      max-height: none !important;
      border-left: 1px solid #fff;
    }
    /* Left tabs — vertical bar on left edge of chat area */
    .hs-tabs-left #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container {
      top: 0 !important; right: auto !important; bottom: 0 !important;
      left: calc(100vw - var(--hs-kick-chat-width, 340px)) !important;
      width: auto !important;
      height: 100% !important;
      flex-direction: row-reverse !important;
    }
    .hs-tabs-left #channel-chatroom:not(.hs-native-hidden) ~ #hs-mc-container > #hs-mc-tabbar {
      flex-direction: column !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      width: 90px !important;
      height: 100% !important;
      max-height: none !important;
      border-right: 1px solid #fff;
    }

    /* Kick resize handle — always visible. Visual/hover/grab shared above. */
    #hs-kick-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: var(--hs-resize-thickness);
      height: 100%;
      cursor: col-resize;
      z-index: 10000;
      pointer-events: auto;
    }

    /* Boost Kick's popover/tooltip z-index above our panels */
    .z-popover, .z-tooltip, .z-modal, .z-dropdown,
    [data-radix-popper-content-wrapper] {
      z-index: 100000 !important;
    }

    /* Prevent channel accent color bleed on offline/home pages */
    .channel-root--home {
      background-color: #000 !important;
    }
    .root-scrollable__content {
      background: #000;
    }
    /* Collapsed chat rules moved to injectStyles() so they're always active */

    /* Mentions search bar */
    #hs-mc-search-bar {
      display: none;
      flex-shrink: 0;
      padding: 4px 6px;
      border-bottom: 1px solid #333;
      background: #000;
    }
    #hs-mc-search-bar.visible {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #hs-mc-search-input {
      flex: 1;
      padding: 5px 10px;
      background: #fff;
      color: #000;
      border: 1px solid #808080;
      border-radius: 0;
      font-size: 13px;
      font-family: inherit;
      outline: none;
    }
    #hs-mc-search-input:focus {
      border-color: #ff8700;
    }
    #hs-mc-search-input::placeholder {
      color: #808080;
    }
    #hs-mc-search-spinner {
      display: none;
      width: 14px;
      height: 14px;
      border: 2px solid #333;
      border-top-color: #ff8700;
      border-radius: 50%;
      animation: hs-spin 0.6s linear infinite;
      flex-shrink: 0;
    }
    #hs-mc-search-spinner.visible {
      display: block;
    }
    @keyframes hs-spin {
      to { transform: rotate(360deg); }
    }
    .hs-mc-search-result {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 5px 8px;
      border-bottom: 1px solid #1a1a1a;
      cursor: pointer;
      font-size: 13px;
    }
    .hs-mc-search-result:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-search-result:last-child {
      border-bottom: none;
    }
    .hs-mc-search-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #666;
      font-size: 13px;
    }
    .hs-mc-search-user {
      font-weight: bold;
      color: #ff8700;
    }
    .hs-mc-search-content {
      color: #ccc;
      word-break: break-word;
    }
    .hs-mc-search-empty {
      padding: 16px;
      text-align: center;
      color: #808080;
      font-size: 13px;
    }
    /* btop-style discover: bordered widgets, distinct accents per section */
    .hs-discover-root {
      container-type: inline-size;
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: -8px;
      padding: 6px;
    }
    .hs-discover-row1 {
      display: grid;
      grid-template-columns: 1fr;
      gap: 6px;
    }
    @container (min-width: 460px) {
      .hs-discover-row1 {
        grid-template-columns: 1fr 1fr;
      }
    }
    .hs-discover-section {
      padding: 0;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,0,0,0.18);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .hs-discover-section + .hs-discover-section { margin-top: 0; }
    .hs-discover-heading {
      font-size: 13px;
      color: #ff8700;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin: 0;
      padding: 4px 8px;
      background: rgba(255,135,0,0.08);
      border-bottom: 1px solid rgba(255,135,0,0.2);
      line-height: 17px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 6px;
    }
    .hs-discover-heading-title {
      flex-shrink: 0;
    }
    .hs-discover-section-body {
      padding: 1px 0;
    }
    .hs-discover-section-empty {
      padding: 8px;
      color: #555;
      font-size: 13px;
    }
    .hs-discover-meta {
      color: #aaa;
      font-size: 13px;
      font-weight: 600;
      text-transform: none;
      letter-spacing: 0;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .hs-discover-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      padding: 3px 8px;
      margin: 0;
    }
    .hs-discover-chip {
      display: inline-block;
      padding: 1px 7px;
      background: transparent;
      border: 1px solid #ff00ff;
      color: #ff00ff;
      font-size: 13px;
      text-decoration: none;
      cursor: pointer;
      border-radius: 0;
      line-height: 19px;
      white-space: nowrap;
    }
    .hs-discover-chip:hover { background: #fff; color: #000; border-color: #fff; }
    .hs-discover-profile-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      text-decoration: none;
      cursor: pointer;
      line-height: 17px;
      font-size: 13px;
      border-left: 2px solid transparent;
    }
    .hs-discover-profile-row:hover { background: #fff; color: #000; }
    .hs-discover-profile-row:hover * { color: #000 !important; }
    .hs-discover-profile-row.hs-discover-row-live { border-left-color: #ff3030; }
    .hs-discover-rank {
      color: #666;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      width: 18px;
      text-align: right;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-discover-row-live .hs-discover-rank { color: #aaa; }
    .hs-discover-live-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #ff3030;
      flex-shrink: 0;
    }
    .hs-discover-live-spacer { width: 7px; flex-shrink: 0; }
    .hs-discover-avatar {
      width: 18px; height: 18px;
      flex-shrink: 0;
      border-radius: 0;
      object-fit: cover;
      background: #1a1a1a;
    }
    .hs-discover-avatar-empty { display: inline-block; }
    .hs-discover-profile-name {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 130px;
      flex-shrink: 1;
    }
    .hs-discover-platforms {
      display: inline-flex;
      gap: 2px;
      flex-shrink: 0;
    }
    .hs-discover-platforms .hs-plat {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 13px;
      font-weight: 700;
      padding: 0 3px;
      line-height: 15px;
      text-decoration: none;
    }
    .hs-discover-platforms .hs-plat:hover { background: #fff !important; color: #000 !important; }
    .hs-discover-platforms .hs-plat-live { font-weight: 900; }
    .hs-discover-platforms .hs-plat-t { color: #9146ff; }
    .hs-discover-platforms .hs-plat-k { color: #53fc18; }
    .hs-discover-platforms .hs-plat-yt { color: #ff0000; }
    .hs-discover-platforms .hs-plat-h { color: #ff8700; }
    /* Post platform letters use same colors */
    .hs-discover-post-plat.hs-plat-t { color: #9146ff; }
    .hs-discover-post-plat.hs-plat-k { color: #53fc18; }
    .hs-discover-post-plat.hs-plat-yt { color: #ff0000; }
    .hs-discover-post-plat.hs-plat-h { color: #ff8700; }
    .hs-discover-bar {
      flex: 1;
      min-width: 28px;
      max-width: 90px;
      height: 5px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
      border-radius: 1px;
    }
    .hs-discover-bar > i {
      display: block;
      height: 100%;
      background: #ff8700;
    }
    .hs-discover-row-live .hs-discover-bar > i {
      background: #ff3030;
    }
    /* Heat number — color/glow comes from inline style via discoverHeatStyle (canonical tiers) */
    .hs-discover-heat {
      display: inline-block;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
      line-height: 1;
    }
    .hs-discover-viewers {
      font-size: 13px;
      color: #ff5050;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }

    /* Filter chips bar */
    .hs-discover-chips-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 5px;
      padding: 5px 8px;
      background: rgba(0,0,0,0.25);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-discover-chips-label {
      color: #666;
      font-size: 13px;
      font-weight: 700;
      margin-right: -2px;
    }
    .hs-discover-chip-btn {
      padding: 2px 8px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      color: #aaa;
      cursor: pointer;
      font-size: 13px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-weight: 600;
      border-radius: 0;
      line-height: 18px;
    }
    .hs-discover-chip-btn.hs-active {
      background: #ff8700;
      border-color: #ff8700;
      color: #000;
    }
    .hs-discover-chip-btn.hs-chip-plat-t.hs-active {
      background: #9146ff;
      border-color: #9146ff;
      color: #fff;
    }
    .hs-discover-chip-btn.hs-chip-plat-k.hs-active {
      background: #53fc18;
      border-color: #53fc18;
      color: #000;
    }
    .hs-discover-chip-btn.hs-chip-plat-yt.hs-active {
      background: #ff0000;
      border-color: #ff0000;
      color: #fff;
    }
    .hs-discover-chip-btn:hover,
    .hs-discover-chip-btn.hs-active:hover,
    .hs-discover-chip-btn.hs-chip-plat-t.hs-active:hover,
    .hs-discover-chip-btn.hs-chip-plat-k.hs-active:hover,
    .hs-discover-chip-btn.hs-chip-plat-yt.hs-active:hover {
      background: #fff;
      color: #000;
      border-color: #fff;
    }

    /* Section colour variants — distinct accent borders + headers per widget */
    .hs-discover-section-live {
      border-color: rgba(255,48,48,0.35);
    }
    .hs-discover-section-live > .hs-discover-heading {
      background: rgba(255,48,48,0.10);
      border-bottom-color: rgba(255,48,48,0.35);
      color: #ff5050;
    }
    .hs-discover-section-posts {
      border-color: rgba(255,135,0,0.3);
    }
    .hs-discover-section-posts > .hs-discover-heading {
      background: rgba(255,135,0,0.10);
      color: #ffaa44;
    }
    .hs-discover-section-trending {
      border-color: rgba(255,255,255,0.15);
    }
    .hs-discover-section-trending > .hs-discover-heading {
      background: rgba(255,255,255,0.04);
      color: #fff;
      border-bottom-color: rgba(255,255,255,0.15);
    }
    .hs-discover-section-tags {
      border-color: rgba(255,0,255,0.35);
    }
    .hs-discover-section-tags > .hs-discover-heading {
      background: rgba(255,0,255,0.08);
      color: #ff00ff;
      border-bottom-color: rgba(255,0,255,0.35);
    }

    /* Leaderboard multi-column when wide — fewer scrolls */
    .hs-discover-leaderboard-body .hs-discover-profile-row {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    @container (min-width: 520px) {
      .hs-discover-leaderboard-body {
        columns: 2;
        column-gap: 0;
        column-rule: 1px solid rgba(255,255,255,0.05);
      }
    }
    @container (min-width: 800px) {
      .hs-discover-leaderboard-body {
        columns: 3;
      }
    }

    /* Post rows — 2-line: meta line + content snippet */
    .hs-discover-post-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 5px 8px;
      text-decoration: none;
      cursor: pointer;
      line-height: 17px;
      border-left: 2px solid transparent;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .hs-discover-post-row:last-child { border-bottom: none; }
    .hs-discover-post-row:hover {
      background: #fff;
      color: #000;
      border-left-color: #fff;
    }
    .hs-discover-post-row:hover * { color: #000 !important; }
    .hs-discover-post-meta {
      display: flex;
      align-items: baseline;
      gap: 5px;
      font-size: 13px;
    }
    .hs-discover-post-spacer { flex: 1; }
    .hs-discover-post-time {
      color: #666;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }
    .hs-discover-post-plat {
      flex-shrink: 0;
    }
    .hs-discover-post-user {
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 1;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-discover-post-text {
      color: #c8c8c8;
      font-size: 13px;
      line-height: 18px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      word-wrap: break-word;
      word-break: break-word;
    }
    .hs-discover-post-row:hover .hs-discover-post-text { color: #fff; }
    .hs-discover-post-heat {
      flex-shrink: 0;
    }
    .hs-discover-post-replies {
      font-size: 13px;
      color: #808080;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }

    /* Tag chips with optional inline count */
    .hs-discover-chip-count {
      margin-left: 5px;
      color: rgba(255,0,255,0.6);
      font-variant-numeric: tabular-nums;
      font-size: 13px;
    }
    .hs-discover-chip:hover .hs-discover-chip-count { color: #000; }

    .hs-pinned-row {
      display: block;
      padding: 2px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      text-decoration: none;
      cursor: pointer;
      line-height: 18px;
    }
    .hs-pinned-row:hover { background: rgba(255,135,0,0.07); }
    .hs-pinned-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      margin: 0;
    }
    .hs-pinned-channel { font-size: 13px; color: #ff8700; font-weight: 600; }
    .hs-pinned-user { font-size: 13px; color: #bbb; }
    .hs-pinned-time { font-size: 13px; color: #808080; margin-left: auto; }
    .hs-pinned-body {
      font-size: 13px;
      color: #ddd;
      word-break: break-word;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-pinned-row:hover .hs-pinned-body { color: #fff; }

    /* ---- YOUTUBE NATIVE CHAT HIDING ----
       Inline display:none on the iframe gets blown away when YT recreates
       <ytd-live-chat-frame> during ad transitions. CSS rule keyed off our
       container survives the swap.

       #chat-container is killed too: on narrow / single-column viewports
       (player column < YT's ~1016px two-column breakpoint — which our 340px
       panel trips at almost every window size) YT relocates the live/replay
       chat OUT of #secondary and into #primary > #below as a top-pinned
       #chat-container, which lies ON TOP of the player and eats every hover
       so the scrubber/volume/pause controls never appear. We body-mount our
       own panel (never inside #chat-container), so nuking native chat
       wherever YT parks it is always safe. */
    body:has(#hs-mc-container) ytd-live-chat-frame#chat,
    body:has(#hs-mc-container) ytd-live-chat-frame,
    body:has(#hs-mc-container) ytd-watch-flexy #chat-container {
      display: none !important;
    }

    /* ============================================
       UNIVERSAL HOVER — every interactive element inside the extension
       inverts to white-bg/black-text on hover and keyboard focus.
       Single rule, no per-class allowlist, descendants inherit.
       Same primitive as heatsync.org, scoped to .hs-mc-container so the
       host site's own buttons aren't touched.
       ============================================ */
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):hover,
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):focus-visible {
      background: #fff !important;
      color: #000 !important;
    }
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):hover *,
    .hs-mc-container :where(button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [onclick]):not(:disabled):not([aria-disabled="true"]):focus-visible * {
      color: #000 !important;
      fill: #000 !important;
      stroke: #000 !important;
      border-color: #000 !important;
    }

    /* ============================================
       C BUTTON — chat panel position around the player.
       Default 'right' = no override (existing native layout).
       For left/top/bottom: fixed-position #hs-mc-container at the chosen
       viewport edge, collapse the native chat sidebar's layout claim so
       the player can fill the freed space, and push the platform's content
       root with element-level padding (NOT body — body padding breaks
       sticky nav / fullscreen / scroll on every platform).

       Single source of truth: body classes drive everything.
         hs-platform-{twitch,kick,yt}
         hs-mode-{normal,theatre}
         hs-chat-{right,left,top,bottom}
       JS sets --hs-chat-w / --hs-chat-h CSS vars from settings.
       ============================================ */

    /* --- chat container: fixed-position at chosen edge.
       chat-right also uses position:fixed (instead of YT's natural flex
       layout) so small-viewport responsive breakpoints don't push chat
       below the player. Chat is always at the viewport edge. --- */
    body.hs-platform-yt.hs-chat-right #hs-mc-container,
    body.hs-chat-left #hs-mc-container,
    body.hs-chat-top #hs-mc-container,
    body.hs-chat-bottom #hs-mc-container {
      position: fixed !important;
      z-index: 9999 !important;
      background: #000 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
    }
    body.hs-platform-yt.hs-chat-right #hs-mc-container {
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: 100vh !important;
    }
    body.hs-chat-left #hs-mc-container {
      top: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      right: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: 100vh !important;
    }
    body.hs-chat-top #hs-mc-container {
      top: 0 !important;
      bottom: auto !important;
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-chat-bottom #hs-mc-container {
      top: auto !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
    }

    /* --- TWITCH non-channel pages (/directory, /settings, /videos, …):
       no .chat-shell to mount in, so we body-mount as a position:fixed
       overlay and squeeze twitch's content with a body width/height
       constraint. --hs-twitch-topnav-h tracks the live nav height so the
       panel slots beneath it (and reclaims the space in theatre / immersive
       modes that hide the nav). --- */
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-right #hs-mc-container {
      position: fixed !important;
      z-index: 9999 !important;
      background: #000 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      top: var(--hs-twitch-topnav-h, 50px) !important;
      bottom: 0 !important;
      right: 0 !important;
      left: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: auto !important;
    }
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-right {
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      overflow-x: hidden !important;
    }
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-left {
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      margin-left: var(--hs-chat-w, 340px) !important;
      overflow-x: hidden !important;
    }
    /* chat-top: panel slots under top-nav at y=navH and extends chatH down.
       Body must clear (navH + chatH) AND shrink to fit the remaining viewport,
       otherwise twitch content overflows into the area covered by the panel. */
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-top {
      margin-top: calc(var(--hs-twitch-topnav-h, 50px) + var(--hs-chat-h, 35vh)) !important;
      height: calc(100vh - var(--hs-twitch-topnav-h, 50px) - var(--hs-chat-h, 35vh)) !important;
      overflow-y: hidden !important;
    }
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-bottom {
      height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      overflow-y: hidden !important;
    }
    /* Twitch creator dashboard (dashboard.twitch.tv) renders into
       .sunlight-root, pinned to 100vw x 100vh — it ignores the body shrink
       above, so dashboard content (and its right-edge buttons) renders under
       the fixed panel. Force the root + its content child back to 100% so it
       reflows inside the squeezed body. Mirror of the kick w-xvw rule below. */
    body.hs-platform-twitch.hs-twitch-no-channel .sunlight-root,
    body.hs-platform-twitch.hs-twitch-no-channel .sunlight-root > div {
      width: 100% !important;
      max-width: 100% !important;
    }
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-top .sunlight-root,
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-bottom .sunlight-root,
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-top .sunlight-root > div,
    body.hs-platform-twitch.hs-twitch-no-channel.hs-chat-bottom .sunlight-root > div {
      height: 100% !important;
      max-height: 100% !important;
    }

    /* --- KICK non-channel pages (/browse, /categories, /following,
       /search, /settings, …): #channel-chatroom doesn't exist, so we
       body-mount as a position:fixed overlay and squeeze kick's <main>
       so its content doesn't underlap the panel. Mirror of the twitch
       no-channel rules above. --- */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right #hs-mc-container,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left #hs-mc-container,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top #hs-mc-container,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom #hs-mc-container {
      position: fixed !important;
      z-index: 9999 !important;
      background: #000 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
    }
    /* Kick's nav is position:fixed 60px tall full viewport width. With chat-right/
       left docked to top:0 the panel covers the right ~340px of the nav including
       the login/search/profile icons. Offset down by nav height so those stay
       reachable; mirrors --hs-twitch-topnav-h pattern. */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right #hs-mc-container {
      top: var(--hs-kick-topnav-h, 60px) !important;
      bottom: 0 !important;
      right: 0 !important;
      left: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: auto !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left #hs-mc-container {
      top: var(--hs-kick-topnav-h, 60px) !important;
      bottom: 0 !important;
      left: 0 !important;
      right: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: auto !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top #hs-mc-container {
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: auto !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom #hs-mc-container {
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      top: auto !important;
      width: 100vw !important;
      height: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right {
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      overflow-x: hidden !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left {
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      margin-left: var(--hs-chat-w, 340px) !important;
      overflow-x: hidden !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top {
      margin-top: var(--hs-chat-h, 35vh) !important;
      height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      overflow-y: hidden !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom {
      height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      overflow-y: hidden !important;
    }
    /* On no-channel pages, the existing kick.hs-chat-left main padding rule
       (padding-left: var(--hs-chat-w)) is wrong — there's no #channel-
       chatroom to anchor against and we already shifted body via
       margin-left. Cancel the horizontal padding so main flows naturally
       inside the shrunken body. */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom main {
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-bottom: 0 !important;
      overflow-x: hidden !important;
    }
    /* Kick's homepage grids use shrink-0 cards which overflow the parent
       at our shrunken viewport width — cards push past body width and end
       up under the chat panel. Clip the overflow at the app-shell wrapper
       and the group/main wrapper too. Vertical scroll preserved. */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left .group\/main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right .group\/main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top .group\/main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom .group\/main {
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
    /* Kick's stream-card / category grids have grid-cols-N classes but at
       narrow viewports the parent flips them to display:flex with shrink-0
       cards — so they overflow horizontally past body width and underlap
       the chat panel. Force display:grid + auto-fill so cards wrap into
       rows that fill the available body width regardless of viewport
       breakpoint. min-width:0 + width:auto on items lets the grid actually
       shrink the cards into slots (otherwise the w-full + shrink-0 combo
       keeps them at their intrinsic 268px). */
    body.hs-platform-kick.hs-kick-no-channel main section[class*="grid-cols"],
    body.hs-platform-kick.hs-kick-no-channel main div[class*="grid-cols"] {
      display: grid !important;
      /* min(170px, 100%) — when body is narrower than 170 (very small window
         with wide chat), slots collapse to 1 column at body width instead of
         overflowing. Above 170 it stays at the readable 170 floor. */
      grid-template-columns: repeat(auto-fill, minmax(min(170px, 100%), 1fr)) !important;
      grid-auto-flow: row !important;
    }
    body.hs-platform-kick.hs-kick-no-channel main section[class*="grid-cols"] > *,
    body.hs-platform-kick.hs-kick-no-channel main div[class*="grid-cols"] > * {
      min-width: 0 !important;
      max-width: 100% !important;
      flex-shrink: 1 !important;
    }
    /* Push content below Kick's fixed 60px nav so the first row of video
       thumbnails isn't half-hidden under it. chat-top covers the nav (own
       body margin-top handles it); chat-right/left/bottom all leave the
       nav visible and need this offset. */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom main {
      padding-top: var(--hs-kick-topnav-h, 60px) !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top main {
      padding-top: 0 !important;
    }
    /* Kick fullscreen modals (login, 2FA, captcha) render a fixed full-viewport-
       width dialog centered via transform translate(-50%, -50%) — with our
       squeezed body the right ~340px of the modal content (incl. the 2FA code
       input) ends up under the chat panel.
       Shrink the dialog to body width and shift the centering anchor so it
       lives inside the visible body area; also shrink the dimming backdrop so
       the chat panel stays interactive alongside. role=dialog + data-state are
       Kick-specific (HeatSync never uses either), so this can't self-trigger. */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right .z-dialog[data-state="open"] {
      right: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left .z-dialog[data-state="open"] {
      left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right [role="dialog"][data-state="open"] {
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      max-width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      left: calc(50% - var(--hs-chat-w, 340px) / 2) !important;
      right: auto !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left [role="dialog"][data-state="open"] {
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      max-width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      left: calc(50% + var(--hs-chat-w, 340px) / 2) !important;
      right: auto !important;
    }
    /* Kick wraps content in a flex container with w-xvw (= 100vw)
       which ignores the body width shrink — main ends up overflowing
       behind our panel. Force every viewport-sized wrapper inside the
       shrunken body back down to 100% so the grid reflows live as the
       resize handle drags. h-xvh is the vertical equivalent for chat-top/
       chat-bottom. */
    body.hs-platform-kick.hs-kick-no-channel [class*="w-xvw"],
    body.hs-platform-kick.hs-kick-no-channel main,
    body.hs-platform-kick.hs-kick-no-channel #main-container {
      width: 100% !important;
      max-width: 100% !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top [class*="h-xvh"],
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom [class*="h-xvh"] {
      height: 100% !important;
      max-height: 100% !important;
    }

    /* Auth/API status banner — pinned to top edge of the chat panel as a
       thin horizontal strip, regardless of the container's flex direction
       (column for chat-right, row for tabs-left/right). Without this the
       banner stretches to the cross-axis full size in flex-row layouts and
       fills the panel as a giant orange column. Container reserves 28px
       border-top so abs-positioned children (tabbar/messages/inputbar) shift
       down and don't sit under the banner. The banner itself uses top:-28px
       to land in the border zone (= container's outer top edge). */
    #hs-mc-container:has(> .hs-mc-auth-banner),
    #hs-mc-container:has(> .hs-mc-api-banner),
    #hs-mc-container:has(> [class*="hs-mc-api-banner-"]) {
      border-top: 28px solid transparent !important;
    }
    .hs-mc-auth-banner,
    .hs-mc-api-banner,
    [class*="hs-mc-api-banner-"] {
      position: absolute !important;
      top: -28px !important;
      left: 0 !important;
      right: 0 !important;
      height: 28px !important;
      width: auto !important;
      z-index: 50 !important;
      box-sizing: border-box !important;
    }

    /* Resize bar reservation (dwl tile rule) — chat content reserves border
       on the player-facing edge so the orange resize bar never overlays the
       tabbar, input bar, T/K/Y filter buttons, or any other panel content.
       Border (not padding) shrinks the padding box, which is the containing
       block for abs-positioned children — without this the inputbar/tabbar/
       overlay (all position:absolute; bottom:Npx) snap to the outer edge
       and sit under the bar. With box-sizing: border-box the container's
       outer dim is unchanged. Every bar is --hs-resize-thickness, so the
       reservation tracks the same token. */
    body.hs-chat-right #hs-mc-container { border-left: var(--hs-resize-thickness) solid transparent !important; }
    body.hs-chat-left #hs-mc-container { border-right: var(--hs-resize-thickness) solid transparent !important; }
    body.hs-chat-top #hs-mc-container { border-bottom: var(--hs-resize-thickness) solid transparent !important; }
    body.hs-chat-bottom #hs-mc-container { border-top: var(--hs-resize-thickness) solid transparent !important; }

    /* --- YT narrow viewport rescue ---
       At narrow viewports YT collapses ytd-watch-flexy into a single-column
       layout: #primary spans the full viewport, #secondary stacks below.
       Constraining the player's wrapper width isn't enough — the player
       sits centered inside the still-full-width #primary, so its right
       edge slides under our chat overlay.
       Cap #primary itself with max-width so YT's responsive flex respects
       the chat strip in BOTH single-column and two-column modes. The
       wrapper inline-sizing in applyPlatformPositionOverrides is a
       complementary belt-and-suspenders. */
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary {
      max-width: calc(100% - var(--hs-chat-w, 340px)) !important;
      width: calc(100% - var(--hs-chat-w, 340px)) !important;
    }
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #primary,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #primary {
      max-width: calc(100% - var(--hs-chat-w, 340px)) !important;
      width: calc(100% - var(--hs-chat-w, 340px)) !important;
      margin-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #primary,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #primary {
      margin-top: var(--hs-chat-h, 35vh) !important;
      max-height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
    }
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #primary,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #primary {
      max-height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
    }
    /* YT's masthead is position:fixed with width:100% (viewport-anchored).
       Setting right alone without overriding width:100% makes the
       browser compute left = -chatW — pushing burger + YT logo off the
       LEFT edge of the screen. Anchor BOTH sides (left + right) and let
       width auto-fit, so the masthead shrinks INTO the visible strip.
       Applies to every YT page: home, search, channel, VOD, live —
       the multichat panel is always there, masthead must always make room. */
    body.hs-platform-yt.hs-chat-right #masthead-container,
    body.hs-platform-yt.hs-chat-right ytd-masthead {
      left: 0 !important;
      right: calc(var(--hs-chat-w, 340px) + 5px) !important;
      width: auto !important;
    }
    body.hs-platform-yt.hs-chat-left #masthead-container,
    body.hs-platform-yt.hs-chat-left ytd-masthead {
      left: calc(var(--hs-chat-w, 340px) + 5px) !important;
      right: 0 !important;
      width: auto !important;
    }
    body.hs-platform-yt.hs-chat-top #masthead-container,
    body.hs-platform-yt.hs-chat-top ytd-masthead {
      top: calc(var(--hs-chat-h, 35vh) + 5px) !important;
    }
    /* YT's responsive @media rules use viewport width, but our masthead
       is narrower (chat panel eats real estate). At our reduced widths
       YT doesn't auto-collapse, so we drive it: hide the voice-search
       and ai-companion buttons (non-essential, eat 40px each), then let
       #center flex-shrink so the search input keeps a usable width. The
       burger + logo (#start) and sign-in icons (#end) stay full-size. */
    body.hs-platform-yt.hs-chat-right ytd-masthead #voice-search-button,
    body.hs-platform-yt.hs-chat-right ytd-masthead #ai-companion-button,
    body.hs-platform-yt.hs-chat-left ytd-masthead #voice-search-button,
    body.hs-platform-yt.hs-chat-left ytd-masthead #ai-companion-button {
      display: none !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-masthead #center,
    body.hs-platform-yt.hs-chat-left ytd-masthead #center {
      flex: 1 1 auto !important;
      min-width: 0 !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-masthead ytd-searchbox,
    body.hs-platform-yt.hs-chat-right ytd-masthead yt-searchbox,
    body.hs-platform-yt.hs-chat-left ytd-masthead ytd-searchbox,
    body.hs-platform-yt.hs-chat-left ytd-masthead yt-searchbox {
      width: 100% !important;
      min-width: 0 !important;
      flex: 1 1 auto !important;
      margin-left: 0 !important;
      box-sizing: border-box !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-masthead #search-form,
    body.hs-platform-yt.hs-chat-left ytd-masthead #search-form {
      min-width: 0 !important;
      flex: 1 1 auto !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-masthead #start,
    body.hs-platform-yt.hs-chat-right ytd-masthead #end,
    body.hs-platform-yt.hs-chat-left ytd-masthead #start,
    body.hs-platform-yt.hs-chat-left ytd-masthead #end {
      flex: 0 0 auto !important;
    }

    /* Reflow ALL YT content (every page type) into the viewport area NOT
       covered by the multichat panel. ytd-app is the React root; capping
       its viewport-width forces YT's responsive layout to honor the chat
       strip. Single-column pages (home grid, search results, channel)
       reflow naturally; watch pages let YT's own breakpoints handle the
       primary/secondary column collapse when space gets tight. */
    /* Cap ytd-app ONLY (not page-manager too — page-manager nests inside
       ytd-app, so its 100% resolves against ytd-app's already-capped
       width and would subtract the chat strip a second time, leaving the
       grid renderered at half-width with a giant empty gutter).
       100% (not 100vw) — vw includes the page scrollbar (~15px); the
       chat panel is position:fixed and respects the inner viewport that
       excludes the scrollbar, so 100vw caps were 15px too wide.
       The chat-side padding is the orange resize bar's gutter. */
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-right ytd-app {
      width: calc(100% - var(--hs-chat-w, 340px)) !important;
      max-width: calc(100% - var(--hs-chat-w, 340px)) !important;
      padding-right: var(--hs-resize-thickness) !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
    }
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-left ytd-app {
      width: calc(100% - var(--hs-chat-w, 340px)) !important;
      max-width: calc(100% - var(--hs-chat-w, 340px)) !important;
      margin-left: var(--hs-chat-w, 340px) !important;
      padding-left: 5px !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
    }
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-top ytd-app {
      height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      max-height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      margin-top: var(--hs-chat-h, 35vh) !important;
      padding-top: 5px !important;
      box-sizing: border-box !important;
      overflow-y: auto !important;
    }
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-bottom ytd-app {
      height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      max-height: calc(100vh - var(--hs-chat-h, 35vh)) !important;
      padding-bottom: 5px !important;
      box-sizing: border-box !important;
      overflow-y: auto !important;
    }
    /* Lift YT's own width clamps on the grid chain — without these,
       div#primary inside ytd-two-column-browse-results-renderer stays
       stuck at the previous page's --ytd-rich-grid-width value after
       SPA nav, and ytd-rich-grid-renderer/#contents inherit that. Force
       every level to 100% of parent so our auto-fill grid uses the full
       page-manager width. */
    body.hs-platform-yt #page-manager ytd-two-column-browse-results-renderer > #primary,
    body.hs-platform-yt #page-manager ytd-two-column-browse-results-renderer > ytd-rich-grid-renderer,
    body.hs-platform-yt #page-manager ytd-rich-grid-renderer,
    body.hs-platform-yt #page-manager ytd-rich-grid-renderer > #contents {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    /* YT computes ytd-rich-grid-renderer items-per-row off VIEWPORT width
       (not container) and bakes it into [items-per-row="N"] attribute
       selectors — overriding the CSS var alone doesn't change the grid.
       Bypass the whole system: replace #contents with an auto-fill grid
       so it wraps fluidly at any width. ytd-rich-grid-row (when present
       in older YT structures) gets display:contents so its children
       participate in the parent grid as direct cells. Result: tiles
       always fit whole, density adapts to chat-panel width. */
    body.hs-platform-yt #page-manager ytd-rich-grid-renderer > #contents,
    body.hs-platform-yt #page-manager ytd-rich-grid-row > #contents {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)) !important;
      gap: 16px !important;
    }
    body.hs-platform-yt #page-manager ytd-rich-grid-row {
      display: contents !important;
    }
    /* Defense-in-depth: every level inside the grid cell must respect
       parent width. YT inline-styles widths on ytd-rich-grid-media (and
       sometimes on the thumbnail anchor) using its own items-per-row
       math that ignores our chat strip — without forcing each level to
       100%, the rightmost tile overflows the cell and gets clipped by
       overflow-x:clip on ytd-app, which is what shows up as a half-cut
       thumbnail. #page-manager ID prefix bumps specificity above YT's
       attribute-keyed width rules on ytd-rich-grid-media which would
       otherwise win on attribute-selector count. */
    body.hs-platform-yt #page-manager ytd-rich-item-renderer,
    body.hs-platform-yt #page-manager ytd-rich-item-renderer > #content,
    body.hs-platform-yt #page-manager ytd-rich-grid-media,
    body.hs-platform-yt #page-manager ytd-rich-grid-media > #thumbnail,
    body.hs-platform-yt #page-manager ytd-rich-grid-media a#thumbnail,
    body.hs-platform-yt #page-manager ytd-rich-grid-media yt-image,
    body.hs-platform-yt #page-manager ytd-rich-grid-media yt-image img,
    body.hs-platform-yt #page-manager ytd-rich-item-renderer ytd-thumbnail {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
    }
    /* Older grid (subscriptions/library still use it on some accounts). */
    body.hs-platform-yt ytd-grid-renderer > #items {
      display: grid !important;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
      gap: 16px !important;
    }
    body.hs-platform-yt ytd-grid-video-renderer {
      width: 100% !important;
      max-width: 100% !important;
      margin: 0 !important;
    }

    /* Shorts: out across the board. Aspect ratio breaks grid uniformity,
       vertical-only feed doesn't fit the streamer-centric HeatSync UX. */
    body.hs-platform-yt ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
    body.hs-platform-yt ytd-rich-section-renderer:has([is-shorts]),
    body.hs-platform-yt ytd-rich-section-renderer:has(grid-shelf-view-model),
    body.hs-platform-yt ytd-rich-shelf-renderer[is-shorts],
    body.hs-platform-yt ytd-reel-shelf-renderer,
    body.hs-platform-yt grid-shelf-view-model,
    body.hs-platform-yt ytd-rich-item-renderer:has(ytd-shorts),
    body.hs-platform-yt ytd-mini-guide-entry-renderer[aria-label="Shorts"],
    body.hs-platform-yt ytd-guide-entry-renderer:has(a[title="Shorts"]),
    body.hs-platform-yt ytd-pivot-bar-item-renderer:has(a[title="Shorts"]),
    body.hs-platform-yt a[href="/shorts"],
    body.hs-platform-yt a[href^="/shorts/"][role="tab"] {
      display: none !important;
    }

    /* --- TWITCH: collapse .right-column to give the player back its space.
       width:0 + overflow:visible (not display:none) so #hs-mc-container
       inside chat-shell stays render-tree visible while the parent's
       layout box claims zero width. --- */
    body.hs-platform-twitch.hs-chat-left .right-column,
    body.hs-platform-twitch.hs-chat-top .right-column,
    body.hs-platform-twitch.hs-chat-bottom .right-column {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      flex: 0 0 0 !important;
      overflow: visible !important;
    }
    body.hs-platform-twitch.hs-chat-left .chat-shell,
    body.hs-platform-twitch.hs-chat-top .chat-shell,
    body.hs-platform-twitch.hs-chat-bottom .chat-shell,
    body.hs-platform-twitch.hs-chat-left [class*="chat-shell"],
    body.hs-platform-twitch.hs-chat-top [class*="chat-shell"],
    body.hs-platform-twitch.hs-chat-bottom [class*="chat-shell"] {
      overflow: visible !important;
    }
    body.hs-platform-twitch.hs-chat-left .channel-root {
      /* .channel-root sits at viewport-x = side-nav (50px collapsed, ~240px
         expanded on wide viewports — Twitch flips it at ~1200px). Subtract
         the live nav width so content lands flush with the HS panel's right
         edge instead of leaving a gap. JS keeps --hs-twitch-sidenav-w in
         sync via ResizeObserver on .side-nav. */
      padding-left: calc(var(--hs-chat-w, 340px) - var(--hs-twitch-sidenav-w, 50px)) !important;
    }
    body.hs-platform-twitch.hs-chat-top .channel-root {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-twitch.hs-chat-bottom .channel-root {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
    }
    /* Twitch theatre: persistent-player fills viewport via position:fixed —
       padding on .channel-root won't reach it. Inset the player itself. */
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-left .persistent-player,
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-left .video-player--theatre {
      left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-top .persistent-player,
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-top .video-player--theatre {
      top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-bottom .persistent-player,
    body.hs-platform-twitch.hs-mode-theatre.hs-chat-bottom .video-player--theatre {
      bottom: var(--hs-chat-h, 35vh) !important;
    }

    /* Twitch sizes .persistent-player by writing explicit pixel width/height
       inline via React. With position:absolute and our inline insets set
       !important, an explicit width/height over-constrains the layout —
       the spec drops the opposing inset, so chat-bottom's bottom: H becomes
       a no-op and chat just overlays the player instead of pushing it.
       Worst during mid-roll ads, when Twitch re-locks the player's pixel
       size for the ad video and drag-end resize stops moving it.
       Inline setProperty(...,important) gets wiped by Twitch's later
       el.style.height = X write (that strips priority). A stylesheet rule
       with !important sits in a separate cascade origin and beats those
       non-important inline writes. */
    body.hs-platform-twitch.hs-chat-top .persistent-player,
    body.hs-platform-twitch.hs-chat-bottom .persistent-player,
    body.hs-platform-twitch.hs-chat-left .persistent-player {
      width: auto !important;
      height: auto !important;
      max-width: none !important;
      max-height: none !important;
    }
    /* For chat-left, Twitch's React writes el.style.left = X based on its
       own internal width tracking — that wipes any inline !important we
       set in applyChatPosition. CSS rule with !important survives those
       inline writes. Subtract the live side-nav width (50 collapsed,
       ~240 expanded); .persistent-player's containing block starts after
       the nav, so left: chatWidth would double-count it and leave a gap
       between HS panel and video. JS pushes --hs-twitch-sidenav-w via
       a ResizeObserver on .side-nav. */
    body.hs-platform-twitch.hs-chat-left .persistent-player {
      left: calc(var(--hs-chat-w, 340px) - var(--hs-twitch-sidenav-w, 50px)) !important;
      inset-inline-start: calc(var(--hs-chat-w, 340px) - var(--hs-twitch-sidenav-w, 50px)) !important;
      /* width:auto !important (above) needs both insets to size; Twitch only
         sets right:0 inline on some states, so the player collapses to 0
         when its React effect skips the write. Assert right:0 so the
         player always fills the area between HS panel and viewport edge. */
      right: 0 !important;
      inset-inline-end: 0 !important;
    }
    /* The 16:9 aspect-ratio wrapper inside .persistent-player uses the
       padding-bottom hack: child .ScAspectSpacer sets padding-bottom to
       56.25% of width (e.g. 561px for a 998px-wide player). When chat is
       on top/bottom and the player is shorter than 16:9-of-its-width, the
       aspect wrapper is taller than the player, so .persistent-player's
       overflow:hidden clips the video bottom — making it look like chat
       is overlaying the video. Force the wrapper to fill the player's
       actual height; the inner <video> uses object-fit so it letterboxes
       to whatever aspect we end up at. */
    body.hs-platform-twitch.hs-chat-top .persistent-player .tw-aspect,
    body.hs-platform-twitch.hs-chat-bottom .persistent-player .tw-aspect {
      height: 100% !important;
    }
    body.hs-platform-twitch.hs-chat-top .persistent-player .tw-aspect > div:first-child,
    body.hs-platform-twitch.hs-chat-bottom .persistent-player .tw-aspect > div:first-child {
      padding-bottom: 0 !important;
      height: 100% !important;
    }
    body.hs-platform-twitch.hs-chat-top .persistent-player video,
    body.hs-platform-twitch.hs-chat-bottom .persistent-player video {
      object-fit: contain !important;
    }

    /* Twitch reserves ~618px of margin-top on .channel-root__info--with-chat
       to clear its absolutely-positioned .persistent-player. That number is
       sized for the default chat-right player width — when chat docks LEFT
       the player gets narrower (16:9 → shorter), so the reserved space is
       way bigger than the player needs. Channel info (pfp, name, desc, sub
       buttons) hangs ~232px below the video bottom on a 1148px viewport.
       Recompute margin-top from the actual player width — sideNav is
       visually hidden behind the HS panel, so player width is exactly
       100vw - chatWidth, projected through 16:9 for the height. */
    body.hs-platform-twitch.hs-chat-left .channel-root__info--with-chat {
      margin-top: calc((100vw - var(--hs-chat-w, 340px)) * 0.5625) !important;
    }

    /* --- KICK: #channel-chatroom IS the native chat shell (sibling of
       our #hs-mc-container). When chat moves, hide the shell entirely
       so it gives up its 320px sidebar width back to <main>. --- */
    body.hs-platform-kick.hs-chat-left #channel-chatroom,
    body.hs-platform-kick.hs-chat-top #channel-chatroom,
    body.hs-platform-kick.hs-chat-bottom #channel-chatroom {
      display: none !important;
    }
    body.hs-platform-kick.hs-chat-left main {
      /* main itself starts after Kick's collapsed left sidebar (when present),
         but our HS panel is fixed at viewport-x=0 and covers that sidebar.
         Padding-left needs to be (chat width - effective-sidebar) so the
         video starts exactly where the HS panel ends. JS sets
         --hs-kick-sidebar-w to 56px when the sidebar is in the DOM and 0px
         when Kick collapses it at narrow viewports — without that, the panel
         overlaps the video by 56px on narrow widths where Kick has already
         dropped the sidebar. */
      padding-left: calc(var(--hs-chat-w, 340px) - var(--hs-kick-sidebar-w, 0px)) !important;
    }
    body.hs-platform-kick.hs-chat-top main {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-kick.hs-chat-bottom main {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
    }
    /* Kick wraps the player in a fixed-width div (w-xvw) inside <main>'s
       flex-col. With chat hidden it leaves blank space on the right; center
       the wrapper horizontally. */
    body.hs-platform-kick.hs-chat-bottom main > div:has(#injected-channel-player) {
      align-self: center !important;
    }
    /* Kick theatre: main has data-theatre="true"; player fills viewport.
       Inset main directly so the chat strip doesn't overlay the video. */
    body.hs-platform-kick.hs-mode-theatre.hs-chat-top main {
      margin-top: var(--hs-chat-h, 35vh) !important;
      padding-top: 0 !important;
    }
    body.hs-platform-kick.hs-mode-theatre.hs-chat-bottom main {
      margin-bottom: var(--hs-chat-h, 35vh) !important;
      padding-bottom: 0 !important;
    }
    body.hs-platform-kick.hs-mode-theatre.hs-chat-left main {
      margin-left: var(--hs-chat-w, 340px) !important;
      padding-left: 0 !important;
    }

    /* --- YOUTUBE: collapse #secondary; pad #primary ---
       Gated on  — on VODs (non-live), keep YT's native
       sidebar so recommended/related videos remain visible to the viewer. */
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #secondary,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #secondary,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #secondary,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #secondary {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      flex: 0 0 0 !important;
      overflow: hidden !important;
    }
    /* Nuke the entire suggested-videos sidebar tree on LIVE only.
       overflow:hidden on #secondary doesn't clip because YT renders these
       via children that escape the secondary box (rendered at x>=1017
       absolutely). display:none kills them outright. #chat-container is
       hidden separately by the native-chat-hiding block above (it's body-
       mounted now, not nested in #chat-container), so it's swept up here
       too. */
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #secondary-inner > *,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #secondary-inner > *,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #secondary-inner > *,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #secondary-inner > * {
      display: none !important;
    }
    /* Default 'right' position — give up on YT's flex layout entirely
       and pin primary-inner to viewport-left with explicit width. Sibling
       battles with #secondary flex were giving primary negative x.
       Live-only — VODs keep YT's native two-column flex. */
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary {
      margin: 0 !important;
      flex: 0 0 0 !important;
      width: 0 !important;
      overflow: visible !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary-inner {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: var(--hs-chat-w, 340px) !important;
      width: auto !important;
      height: 100vh !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy {
      --ytd-watch-flexy-side-menu-margin: 0 !important;
      --ytd-watch-flexy-non-player-width: var(--hs-chat-w, 340px) !important;
    }
    /* Force the player containers to fill #primary's inner width — kills
       the YT-side-menu-margin gap (right) AND the YT-non-player-width gap
       (left). For top/bottom the JS-driven inline width owns sizing. */
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #player-container,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #player-container-outer,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #player-container-inner,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy ytd-player,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #player,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #player-container,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #player-container-outer,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #player-container-inner,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy ytd-player,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #player {
      width: 100% !important;
    }
    /* chat-left: same gutter-kill as chat-right so YT computes the player
       width as primary's full width (708px) instead of vw - 450 (= 598). */
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy {
      --ytd-watch-flexy-side-menu-margin: 0 !important;
      --ytd-watch-flexy-non-player-width: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #primary {
      margin: 0 !important;
      flex: 0 0 0 !important;
      width: 0 !important;
      overflow: visible !important;
    }
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #primary-inner {
      position: fixed !important;
      top: 0 !important;
      left: var(--hs-chat-w, 340px) !important;
      right: 0 !important;
      width: auto !important;
      height: 100vh !important;
    }
    /* Kill the secondary's residual 16px (its own padding/margin still
       takes layout space even with width:0). Live-only. */
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #secondary,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #secondary,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #secondary {
      padding: 0 !important;
      margin: 0 !important;
    }
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #primary {
      margin-top: var(--hs-chat-h, 35vh) !important;
      padding-top: 0 !important;
    }
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #primary {
      margin-bottom: var(--hs-chat-h, 35vh) !important;
      padding-top: 0 !important;
    }
    /* Kill the masthead reservation — chat clutter is hidden, no need to
       reserve top-bar space below it. Applies to ALL chat positions on YT
       so the player floats flush in every layout. Live-only. */
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-top #page-manager,
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-bottom #page-manager,
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-left #page-manager,
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-right #page-manager {
      margin-top: 0 !important;
    }
    /* primary clips to viewport height; primary-inner scrolls so video info
       below the player is reachable. Live-only. */
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow: hidden !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary-inner {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow-y: auto !important;
    }
    /* Chat panel fills viewport height when on right — overrides the
       mount-time inline height cached from the original live-chat-frame
       (~500-600px). #secondary-inner extends so the freed sidebar slot
       doesn't cap height. (#chat-container is display:none now.) */
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #secondary-inner {
      height: 100vh !important;
      max-height: 100vh !important;
    }
    body.hs-platform-yt.hs-chat-right #hs-mc-container {
      height: 100vh !important;
    }
    /* primary-inner is YT-default flex-column align-items:center. Both
       children (#player and #below) inherit flex-shrink:1, so a tall
       player + non-shrinkable metadata min-height fight: #below has its
       own min-content (pfp + title + subscribe + viewer count) that
       won't shrink past, so it pins itself onscreen and visually overlaps
       the player. Disable flex-shrink on both children so the player
       keeps its full 16:9 height and the metadata block sits BELOW it,
       scrolling out of view via primary-inner's overflow-y:auto when the
       total exceeds 100vh. Live-only (chat-right + chat-left). */
    body.hs-platform-yt:not(.hs-offline).hs-chat-right ytd-watch-flexy #primary-inner > #player,
    body.hs-platform-yt:not(.hs-offline).hs-chat-right ytd-watch-flexy #primary-inner > #below,
    body.hs-platform-yt:not(.hs-offline).hs-chat-left ytd-watch-flexy #primary-inner > #player,
    body.hs-platform-yt:not(.hs-offline).hs-chat-left ytd-watch-flexy #primary-inner > #below {
      flex-shrink: 0 !important;
      flex-basis: auto !important;
    }

    /* Inputbar layout — input-wrap shrinks (flex:1), emote-picker button
       stays fixed-size on the right (flex:0). #hs-mc-input-wrap is the
       direct flex child (input itself is buried inside). */
    #hs-mc-inputbar {
      display: flex !important;
      align-items: center !important;
      box-sizing: border-box !important;
    }
    #hs-mc-input-wrap {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      overflow: hidden !important;
    }
    #hs-mc-input {
      min-width: 0 !important;
      width: 100% !important;
    }
    #hs-mc-emote-btn {
      flex: 0 0 auto !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #primary-inner {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    /* Tell YT how much vertical space is NOT available for the player so
       its own layout JS shrinks the player to fit. YT computes player
       height = viewport - --ytd-watch-flexy-non-player-height. Bumping
       that var by chat-strip height makes YT shrink the player itself,
       which keeps the 16:9 aspect ratio (no distortion, no clipping).
       Live-only — VOD viewers expect full-height YT layout. */
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy {
      --ytd-watch-flexy-non-player-height: calc(56px + 12px + 92px + var(--hs-chat-h, 35vh)) !important;
      --ytd-watch-flexy-min-player-height: 200px !important;
    }
    /* Belt-and-braces: cap player container too, in case YT's JS doesn't
       re-read the var on every chat-height change. */
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #player-container,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #player-container-outer,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #player-container,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #player-container-outer {
      max-height: calc(100vh - var(--hs-chat-h, 35vh) - 60px) !important;
    }
    /* Show video info below player (title, channel, description) like Twitch/Kick.
       Hide only comments — noisy, not the focus. #below gets width:100% so it
       fills primary-inner even when align-items:center is in effect.
       Live-only — VOD viewers want comments and native description sizing. */
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy ytd-comments,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy ytd-comments,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy ytd-comments,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy ytd-comments {
      display: none !important;
    }
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #below,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #below,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #below,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #below {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
    /* Top/bottom: player is sized inline to fill availH, just need
       horizontal centering. Don't add min-height — primary has margin-top
       for chat-top, so 100vh would push content off the bottom. */
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #primary-inner,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #primary-inner {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #primary {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow: hidden !important;
    }
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #primary-inner {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow-y: auto !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #player,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #player,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #player {
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* ============================================
       SINGLE-COLUMN RESCUE
       Below YT's ~1016px two-column breakpoint (which our 340px panel trips
       at almost every window size) ytd-watch-flexy flips to is-single-column:
       it pulls the player OUT of #primary-inner into #full-bleed-container (a
       direct child of ytd-watch-flexy, anchored at 0,0) and leaves #primary-
       inner holding only an empty 0×0 #player slot plus the #below metadata.
       Our two-column rules pin #primary-inner position:fixed top:0 left:0 —
       which then lies ON TOP of the full-bleed player and drops #below over
       it, killing every hover (no scrubber/volume/pause). The [is-single-
       column] attribute out-specifies the two-column rules above.

       Fix: let #primary-inner fall back to normal document flow so #columns/
       #primary stacks BELOW #full-bleed-container (its previous sibling), and
       inset the full-bleed player away from the panel edge per position. The
       player wrapper is already aspect-sized to innerWidth-chatWidth by
       applyPlatformPositionOverrides, so right needs no inset at all. */
    body.hs-platform-yt:has(#hs-mc-container) ytd-watch-flexy[is-single-column] #primary-inner {
      position: static !important;
      top: auto !important;
      left: auto !important;
      right: auto !important;
      width: auto !important;
      height: auto !important;
      max-height: none !important;
    }
    body.hs-platform-yt:has(#hs-mc-container) ytd-watch-flexy[is-single-column] #primary {
      width: auto !important;
      max-width: none !important;
      flex: 1 1 auto !important;
      margin: 0 !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
    /* Inset the full-bleed player away from the panel edge. Margin on the
       full-bleed wrappers (not padding on flexy) so the masthead reservation
       isn't double-counted, mirroring the player-sizing JS which already
       shrinks the wrapper to innerWidth-chatWidth / innerHeight-chatHeight.
       Right needs no inset (panel is on the right, player anchored at 0,0). */
    body.hs-platform-yt.hs-chat-left:has(#hs-mc-container) ytd-watch-flexy[is-single-column] #full-bleed-container,
    body.hs-platform-yt.hs-chat-left:has(#hs-mc-container) ytd-watch-flexy[is-single-column] #player-full-bleed-container {
      margin-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-chat-top:has(#hs-mc-container) ytd-watch-flexy[is-single-column] #full-bleed-container,
    body.hs-platform-yt.hs-chat-top:has(#hs-mc-container) ytd-watch-flexy[is-single-column] #player-full-bleed-container {
      margin-top: var(--hs-chat-h, 35vh) !important;
    }
    /* bottom: player stays anchored at the top; reserve bottom space so the
       metadata stacked below it never scrolls under the panel. */
    body.hs-platform-yt.hs-chat-bottom:has(#hs-mc-container) ytd-watch-flexy[is-single-column] {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
      box-sizing: border-box !important;
    }
    /* Live streams render via #full-bleed-container > #player-container
       (position:absolute, left:0). Centering #primary-inner doesn't reach
       this path, so explicitly center the player-container inside its
       full-bleed parent when chat is at the bottom.
       Skip theatre/fullscreen/miniplayer — YT animates transform on
       #player-container during those transitions, and our !important
       transform overrides their animation, causing visual offset/flicker. */
    body.hs-platform-yt.hs-chat-bottom:not(.hs-mode-theatre) ytd-watch-flexy:not([theater]):not([fullscreen]):not([is-miniplayer]) #player-container {
      left: 50% !important;
      transform: translateX(-50%) !important;
    }
    /* YouTube theatre: ytd-watch-flexy[theater] makes the player full-row.
       The #full-bleed-container is what owns the player. Inset it.
       Live-only — VOD theatre keeps native YT layout. */
    body.hs-platform-yt.hs-mode-theatre.hs-chat-left ytd-watch-flexy[theater] #full-bleed-container,
    body.hs-platform-yt.hs-mode-theatre.hs-chat-left ytd-watch-flexy[theater] #player-full-bleed-container {
      padding-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-mode-theatre.hs-chat-top ytd-watch-flexy[theater] #full-bleed-container,
    body.hs-platform-yt.hs-mode-theatre.hs-chat-top ytd-watch-flexy[theater] #player-full-bleed-container {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-yt.hs-mode-theatre.hs-chat-bottom ytd-watch-flexy[theater] #full-bleed-container,
    body.hs-platform-yt.hs-mode-theatre.hs-chat-bottom ytd-watch-flexy[theater] #player-full-bleed-container {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
    }

    /* === Chat-log viewer (chat-logs.js) === */
    /* All children inherit 13px var(--hs-mc-font) to match the rest of the
       overlay — Cozette is a bitmap font keyed to 13px; smaller sizes look
       blurry. Explicit overrides only where information density demands a
       lighter weight (timestamp on its own line vs inline). */
    .hs-cl-wrap {
      display: flex; flex-direction: column;
      height: 100%; width: 100%;
      background: #000; color: #fff;
      font-family: var(--hs-mc-font);
      font-size: 13px; line-height: 17px;
      box-sizing: border-box;
    }
    .hs-cl-hdr {
      display: flex; align-items: center; justify-content: space-between;
      padding: 4px 6px;
      background: #0a0a0a;
      border-bottom: 1px solid #222;
      flex-shrink: 0;
      gap: 6px;
    }
    .hs-cl-title { display: flex; align-items: baseline; gap: 6px; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .hs-cl-title-name { font-weight: 700; color: #fff; }
    .hs-cl-title-sub { color: #999; overflow: hidden; text-overflow: ellipsis; }
    .hs-cl-close {
      width: 22px; height: 22px; padding: 0;
      background: transparent; color: #999;
      border: 1px solid #333; cursor: pointer;
      font-family: inherit; font-size: 13px; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
    }
    .hs-cl-close:hover { background: #fff; color: #000; border-color: #fff; }
    .hs-cl-ctrls {
      display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 6px;
      background: #0a0a0a;
      border-bottom: 1px solid #222;
      flex-shrink: 0;
      align-items: center;
    }
    .hs-cl-search {
      flex: 1 1 100px; min-width: 80px;
      background: #000; color: #fff;
      border: 1px solid #333; padding: 2px 6px;
      font-family: inherit; font-size: 13px; line-height: 17px;
      outline: none; height: 22px;
      box-sizing: border-box;
    }
    .hs-cl-search:focus { border-color: #ff8700; }
    .hs-cl-scope, .hs-cl-export {
      background: #111; color: #ccc;
      border: 1px solid #333; padding: 1px 6px;
      cursor: pointer; font-family: inherit; font-size: 13px;
      height: 22px; line-height: 18px;
      box-sizing: border-box;
      flex-shrink: 0;
    }
    .hs-cl-scope:hover, .hs-cl-export:hover {
      background: #fff; color: #000; border-color: #fff;
    }
    .hs-cl-list {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 4px 8px;
    }
    .hs-cl-row {
      padding: 1px 0;
      display: flex; flex-wrap: wrap; align-items: baseline;
      gap: 6px;
      border-bottom: 1px solid #0a0a0a;
    }
    .hs-cl-row.hs-cl-deleted {
      opacity: 0.5;
      text-decoration: line-through;
    }
    .hs-cl-ts {
      color: #555;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .hs-cl-ch {
      color: #ff8700; flex-shrink: 0;
    }
    .hs-cl-user {
      color: #fff; font-weight: 700; flex-shrink: 0;
    }
    .hs-cl-body { color: #ddd; min-width: 0; word-break: break-word; }
    .hs-cl-emote {
      height: 18px; width: auto; vertical-align: middle;
      display: inline-block;
    }
    .hs-cl-empty {
      color: #666; text-align: center; padding: 40px 8px;
    }
    .hs-cl-loader {
      color: #555; text-align: center; padding: 12px 8px;
    }

  `;
  const cozetteUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL('fonts/CozetteVector.woff2') : ''
  const gohuUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL)
    ? chrome.runtime.getURL('fonts/GohuFont-14.woff2') : ''
  style.textContent = css
    .replace(/__HS_FONT_COZETTE__/g, cozetteUrl)
    .replace(/__HS_FONT_GOHU__/g, gohuUrl);
  document.head.appendChild(cleanup.trackNode(style));
  // Default to bitmap-mode on style inject — Cozette is the default font.
  // applyFontSettings() flips this off if the user picked a non-bitmap font.
  // Set here so tabs render crisp even before the async settings load fires
  // (loadFontSettings races with container mount; bare default prevents
  // the brief AA-on flash).
  document.body.classList.add('hs-font-bitmap');
  document.documentElement.classList.add('hs-font-bitmap');
}
