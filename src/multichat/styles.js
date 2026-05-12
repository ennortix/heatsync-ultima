// Styles - all CSS for multichat panel, tabs, messages, modals

// ============================================
// STYLES (injected once)
// ============================================

function injectStyles() {
  if (document.getElementById('hs-mc-styles')) return;

  const style = document.createElement('style');
  style.id = 'hs-mc-styles';
  style.textContent = `
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
      font-size: 12px !important;
      line-height: 1 !important;
      font-weight: 400 !important;
      white-space: nowrap !important;
      transition: none;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
    /* Active — focused tab */
    .hs-mc-tab.active {
      background: #fff !important;
      color: #000 !important;
      border-color: #fff !important;
      font-weight: 600;
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
      font-size: 10px !important;
      line-height: 1 !important;
      letter-spacing: 0 !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-width: 1px !important;
      font-family: inherit !important;
    }
    /* Last button in each cluster keeps its own right border (no overlap target) */
    .hs-mc-util-btn:last-child,
    .hs-mc-pf-btn:last-child {
      margin-right: 0 !important;
    }
    .hs-mc-util-btn {
      color: #808080 !important;
      border: 1px solid #808080 !important;
      font-weight: 700 !important;
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
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
    .hs-whisper-time {
      color: #808080;
      font-size: 10px;
      float: right;
    }
    .hs-whisper-unread {
      background: #ff8700;
      color: #000;
      font-size: 10px;
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
      font-size: 10px;
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
      font-size: 12px;
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
      font-size: 11px;
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
    /* Inline stream event notifications */
    .hs-mc-stream-event {
      padding: 2px 4px;
      font-size: 13px;
      line-height: 1.4;
      font-style: italic;
      background: rgba(128, 128, 0, 0.25);
      border-bottom: 1px solid #000;
      color: #ffff00;
    }
    .hs-mc-stream-event .hs-mc-user { text-decoration: none; font-weight: bold; }
    .hs-mc-stream-event .hs-mc-user:hover { text-decoration: underline; }
    .hs-mc-stream-event .hs-evt-game { color: #fff; font-style: normal; }
    .hs-mc-stream-event.event-online { color: #f44; }
    .hs-mc-stream-event.event-online .hs-evt-game { color: #fff; }
    .hs-mc-stream-event.event-offline { color: #808080; opacity: 1; }
    .hs-mc-stream-event.event-raid { color: #9146ff; }
    .hs-mc-stream-event.event-hype { color: #ff8700; }
    .hs-mc-stream-event.event-sub { color: #00ff7f; }
    .hs-mc-stream-event.event-redeem { color: #00bfff; }
    .hs-mc-stream-event.event-emote { color: #29d391; }
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
      color: #ffff00; text-decoration: none; font-size: 10px; margin-right: 4px;
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

    /* Resize drag bar — 3px visible #ff8700, ::before extends hit zone to ~11px. */
    #hs-mc-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
    }
    #hs-mc-resize-handle::before {
      content: '';
      position: absolute;
      top: 0;
      left: -4px;
      right: -4px;
      bottom: 0;
    }
    #hs-mc-resize-handle:hover,
    #hs-mc-resize-handle:active {
      background: #ffaa33;
      opacity: 1;
    }

    /* YouTube resize handle — left edge of #secondary sidebar */
    #hs-yt-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
    }
    #hs-yt-resize-handle::before {
      content: '';
      position: absolute;
      top: 0;
      left: -4px;
      right: -4px;
      bottom: 0;
    }
    #hs-yt-resize-handle:hover,
    #hs-yt-resize-handle:active {
      background: #ffaa33;
      opacity: 1;
    }

    #hs-mc-messages {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      /* Bottom gets extra room so the last message clears the inputbar's top
         border and message descenders aren't clipped against it. */
      padding: 8px 8px 12px 8px;
      font-size: var(--hs-chat-font, 13px) !important;
      line-height: 1.4 !important;
      word-wrap: break-word;
      word-break: break-word;
      max-width: 100%;
      box-sizing: border-box;
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
      font-size: 12px;
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
      font-size: 11px;
      font-weight: 700;
      color: #ff8700;
      background: rgba(0,0,0,0.4);
      padding: 1px 5px;
      border-radius: 0;
      flex-shrink: 0;
    }
    .hs-mc-chat-banner-badge {
      font-size: 10px;
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
    /* HeatSync container — sibling of React's chat-room__content, outside React's tree */
    #hs-mc-container {
      position: relative;
      display: flex;
      flex-direction: column;
      flex: 1;
      width: 100%;
      min-height: 0;
      overflow: hidden;
      background: #000;
      font-family: 'Courier New', Courier, monospace;
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

    /* === GOD-TIER NOTIF LAYERS (HsNotifs) ===
       Layer containers are positioned via CSS vars set by HsNotifs.updateLayout.
       Adding a new layer = registerLayer(name, ...) + matching CSS rule below. */
    .hs-notif-layer {
      position: fixed;
      z-index: 100000;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow: hidden;
      min-width: 0;
    }
    .hs-notif-layer > .hs-notif {
      pointer-events: auto;
      box-sizing: border-box;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
    }
    .hs-notif-layer-toast-stack {
      bottom: var(--hs-layer-toast-stack-bottom, 70px);
      right: var(--hs-layer-toast-stack-right, 20px);
      align-items: flex-end;
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
    /* Default notif body — types override per className. container-type makes
       the notif queryable so progressive collapse rules fire on its own width
       (not viewport) — narrow chat → smaller font → hide icon → button-only. */
    .hs-notif {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: #18181b;
      color: #fff;
      font: 12px/1.2 'Courier New', Courier, monospace;
      container-type: inline-size;
    }
    /* Body wrapper — sole shrinkable child of .hs-notif. flex-basis:0 lets
       it ignore content width when computing layout, so the actions next to
       it always render at their natural content size first; body absorbs the
       rest, ellipsifying if needed. */
    .hs-notif-body {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      min-height: 0;
    }
    .hs-notif-actions {
      display: inline-flex;
      gap: 4px;
      flex: 0 0 auto;
      margin-left: auto;
    }
    .hs-notif-action {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .hs-notif-action {
      background: transparent;
      color: #fff;
      border: 1px solid #808080;
      padding: 2px 10px;
      font: 600 11px/1.4 inherit;
      cursor: pointer;
      border-radius: 0;
    }
    .hs-notif-action:hover {
      background: #fff;
      color: #000;
    }
    .hs-notif-action-primary {
      background: #ff8700;
      color: #000;
      border-color: #ff8700;
    }
    .hs-notif-action-primary:hover {
      background: #fff;
      color: #000;
    }
    .hs-notif-action-dismiss {
      border: none;
      padding: 2px 6px;
      font-size: 14px;
    }
    /* Toast type */
    .hs-notif-toast {
      background: #000;
      border: 1px solid #888;
      padding: 6px 14px;
      font: bold 12px monospace;
      pointer-events: none;
    }
    .hs-notif-toast-text { color: #888; }
    .hs-notif-toast-text.hs-notif-toast-success { color: #00d000; }
    .hs-notif-toast-text.hs-notif-toast-error   { color: #ff4040; }
    .hs-notif-toast:has(.hs-notif-toast-success) { border-color: #00d000; }
    .hs-notif-toast:has(.hs-notif-toast-error)   { border-color: #ff4040; }
    /* Resub-share type */
    .hs-notif-twitch-resub-share {
      border-top: 1px solid #ff8700;
      border-bottom: 1px solid #808080;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.5);
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
      .hs-notif-resub-body { font-size: 11px; }
      .hs-notif-action { padding: 2px 6px; font-size: 11px; }
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
      position: fixed !important;
      top: auto !important;
      bottom: var(--hs-callout-bottom, 0px) !important;
      left: var(--hs-callout-left, 0px) !important;
      right: var(--hs-callout-right, 0px) !important;
      width: auto !important;
      /* Hard ceiling on width — backstop in case position:fixed's containing
         block isn't the viewport (Twitch ancestor with transform/filter/will-
         change creates a new containing block). max-width is independent of
         positioning, so even if left/right drift the box can never exceed
         the chat content width. */
      max-width: var(--hs-callout-max-width, 100vw) !important;
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
      line-height: 1.2 !important;
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
      font-size: 12px !important;
      line-height: 1.2 !important;
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
      font-size: 12px !important;
      min-height: 0 !important;
      height: auto !important;
      line-height: 1.4 !important;
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
        font-size: 11px !important;
      }
      [data-test-selector="chat-private-callout-queue__callout-container"] [data-a-target="chat-private-callout__primary-button"] {
        padding: 2px 6px !important;
        font-size: 11px !important;
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
      font-size: 12px;
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

    /* Never hide Twitch's native collapse/expand arrows — user needs them.
       Hide HS UI when chat is collapsed so it doesn't interfere with layout. */
    .right-column--collapsed #hs-mc-container {
      display: none !important;
    }
    /* Collapsed chat: width 0 but overflow visible so the toggle arrow
       (which is a grandchild) can still render outside the box */
    .right-column--collapsed {
      width: 0px !important;
      min-width: 0px !important;
      overflow: visible !important;
    }
    .right-column--collapsed > *:not(:has(.right-column__toggle-visibility)) {
      overflow: hidden !important;
      width: 0px !important;
      min-width: 0px !important;
    }
    .right-column--collapsed > *:has(.right-column__toggle-visibility) {
      overflow: visible !important;
    }
    .right-column--collapsed .right-column__toggle-visibility {
      transform: none !important;
      left: -32px !important;
      z-index: 50 !important;
    }
    div:has(> .right-column--collapsed) {
      width: 0px !important;
      min-width: 0px !important;
      overflow: visible !important;
    }
    /* Force collapse/expand arrow to white — Twitch light theme leaks
       into the toggle wrapper, making it black on dark background */
    .right-column__toggle-visibility button {
      color: #fff !important;
    }
    .right-column__toggle-visibility svg {
      fill: #fff !important;
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
      font-size: 10px;
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
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      line-height: 1;
      user-select: none;
    }
    .hs-mc-msg {
      padding: 2px 4px;
      border-radius: 0;
      font-size: var(--hs-chat-font, 13px) !important;
      line-height: 1.4 !important;
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
    /* Hovered-row tint while the reply stack is shown — same olive as stack rows.
       Critical: ONLY change the background. Changing padding/line-height shrinks the
       row, which triggers chat auto-scroll-to-bottom adjustment AFTER showStack has
       already anchored the overlay → 8-15px visible gap. Pure visual change only. */
    .hs-mc-msg.hs-mc-reply-stack-active {
      background: #808000 !important;
    }
    /* High-contrast on olive: forces every text element (gray ts, inline-styled
       username, purple [T] / red [Y] / green [K] platform badges, links, emote alts)
       to white. Without this, a #808080 timestamp on #808000 vanishes entirely and
       saturated badges turn muddy. Scoped to all three olive rows: active hovered row,
       up-stack parents, down-stack descendants. */
    .hs-mc-msg.hs-mc-reply-stack-active,
    .hs-mc-msg.hs-mc-reply-stack-active *,
    #hs-mc-reply-stack .hs-mc-reply-stack-row,
    #hs-mc-reply-stack .hs-mc-reply-stack-row *,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row * {
      color: #fff !important;
      -webkit-text-fill-color: #fff !important;
      border-left-color: #fff !important;
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
    }
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row {
      background: #808000 !important;
      box-shadow: none !important;
      margin: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      content-visibility: visible !important;
      contain-intrinsic-size: auto !important;
    }
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row .hs-mc-reply-btn {
      display: none !important;
    }
    #hs-mc-reply-stack .hs-mc-reply-stack-row {
      background: #808000 !important;
      box-shadow: none !important;
      margin: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
      /* keep natural line-height (1.4) — tighter values clip the 18x18 badge images
         against .hs-mc-msg's overflow:hidden, making them look like text */
      /* override .hs-mc-msg's content-visibility:auto — we render at hover time and
         the rows must paint immediately, not be replaced by a 28px placeholder */
      content-visibility: visible !important;
      contain-intrinsic-size: auto !important;
    }
    /* Zebra striping across the entire reply chain. Anchored to the active row
       (always #808000) so alternation flows continuously: up-stack rows count
       from the BOTTOM (the row directly above active is dark), down-stack rows
       count from the TOP (the row directly below active is dark). Overflow chip
       sits at child[0] of the up-stack but doesn't affect nth-last-child parity.
       Darker shade also improves white-text contrast (~6.2 vs ~3.7 on plain
       olive) and dramatically amplifies the timeout/cleared opacity:0.45 effect
       — banded muted rows read as visually rich rather than a wall of olive. */
    #hs-mc-reply-stack .hs-mc-reply-stack-row:nth-last-child(odd),
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row:nth-child(odd) {
      background: #5c5c00 !important;
    }
    /* Reply-context chip stays visible on olive rows so the row height never
       changes on hover (no scrollTop compensation needed → zero chat-jump).
       Black against #808000 gives ~6.5:1 contrast — clearly readable yet
       visually distinct from the white message text, so the eye treats it as
       skip-me metadata while reading the thread. Must override the blanket
       white-text rule with the same !important. */
    .hs-mc-msg.hs-mc-reply-stack-active .hs-mc-reply-ctx,
    .hs-mc-msg.hs-mc-reply-stack-active .hs-mc-reply-ctx *,
    #hs-mc-reply-stack .hs-mc-reply-stack-row .hs-mc-reply-ctx,
    #hs-mc-reply-stack .hs-mc-reply-stack-row .hs-mc-reply-ctx *,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row .hs-mc-reply-ctx,
    #hs-mc-reply-stack-down .hs-mc-reply-stack-row .hs-mc-reply-ctx * {
      color: #000 !important;
      -webkit-text-fill-color: #000 !important;
      border-left-color: #000 !important;
    }
    #hs-mc-reply-stack .hs-mc-reply-stack-row .hs-mc-reply-btn {
      display: none !important;
    }
    .hs-mc-reply-stack-chip {
      flex: 0 0 auto;
      padding: 2px 6px;
      font-size: 11px;
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
    /* Brief flash on the message that the overflow chip scrolled to */
    .hs-mc-msg.hs-mc-thread-flash {
      animation: hs-mc-thread-flash 1.2s ease-out;
    }
    @keyframes hs-mc-thread-flash {
      0% { background: #808000; }
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
      font-size: 11px;
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
    #hs-mc-reply-indicator {
      flex: 1 0 100%;
      order: -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #000;
      padding: 2px 6px;
      font-size: 11px;
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
      font-size: 12px;
      font-style: italic;
      display: block;
    }
    /* purple=sub, orange=raid/HS, red=@-mention/ban, green=timeout/untimeout (matches site) */
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
    /* Raid = HS brand orange */
    .hs-mc-msg.hs-mc-notice-raid      { border-left-color: #ff8700 !important; background: rgba(255, 135, 0, 0.18) !important; }
    .hs-mc-msg.hs-mc-notice-raid      .hs-mc-system-text { color: #ff8700; font-weight: 700; }
    /* Announcement = pure yellow (broadcaster speaking) */
    .hs-mc-msg.hs-mc-notice-announce  { border-left-color: #ffff00 !important; background: rgba(255, 255, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-announce  .hs-mc-system-text { color: #ffff00; font-weight: 600; }
    /* Bits = gold/amber (distinct from raid orange and announce yellow) */
    .hs-mc-msg.hs-mc-notice-bits      { border-left-color: #ffaa00 !important; background: rgba(255, 170, 0, 0.10) !important; }
    .hs-mc-msg.hs-mc-notice-bits      .hs-mc-system-text { color: #ffd700; font-weight: 600; }
    /* Watch-streak milestone = teal (different from cyan mode change) */
    .hs-mc-msg.hs-mc-notice-milestone { border-left-color: #008080 !important; background: rgba(0, 128, 128, 0.12) !important; }
    .hs-mc-msg.hs-mc-notice-milestone .hs-mc-system-text { color: #00cccc; font-weight: 600; }
    /* Errors / rejections = dim maroon */
    .hs-mc-msg.hs-mc-notice-error     { border-left-color: #800000 !important; background: rgba(128, 0, 0, 0.06) !important; }
    .hs-mc-msg.hs-mc-notice-error     .hs-mc-system-text { color: #ff8080; }
    /* First-time chatter (Twitch first-msg=1) = Twitch magenta-purple */
    .hs-mc-msg.hs-mc-first-msg { border-left: 3px solid #bd5fff; padding-left: 8px; background: rgba(189, 95, 255, 0.12); }
    .hs-mc-first-tag { display: inline-block; font-size: 10px; font-weight: 700; color: #fff; background: #bd5fff; padding: 0 4px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
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
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
    }
    .hs-mc-highlight-label {
      color: #ffd700;
      font-size: 11px;
      font-style: normal;
      font-weight: 600;
    }
    .hs-mc-reply-ctx {
      font-size: 11px;
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
    .hs-mc-msg.mention {
      background: #800000;
    }
    .hs-mc-msg.mention .hs-mc-reply-ctx,
    .hs-mc-msg.mention .hs-mc-reply-user {
      color: #fff;
      border-left-color: #fff;
    }
    .hs-mc-msg.hs-first-msg {
      box-shadow: inset 2px 0 0 #ff8700;
    }
    .hs-mc-msg.hs-kw-match {
      background: rgba(255, 135, 0, 0.18);
      box-shadow: inset 0 0 0 1px #ff8700;
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
      font-size: var(--hs-badge-font, 10px);
      margin-right: 3px;
      font-weight: 700;
      vertical-align: middle;
    }
    .hs-mc-platform-badge.hs-mc-pb-twitch { color: #9146ff; }
    .hs-mc-platform-badge.hs-mc-pb-kick { color: #53fc18; }
    .hs-mc-platform-badge.hs-mc-pb-yt { color: #ff0000; }
    .hs-mc-badge {
      display: inline-block;
      font-size: var(--hs-stat-badge-font, 9px);
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
      padding: 8px;
      display: none;
      min-width: 240px;
      max-width: 400px;
    }
    #hs-user-tooltip.visible {
      display: flex;
    }
    #hs-user-tooltip .hs-pc-avatar {
      width: 40px;
      height: 40px;
      min-width: 40px;
      border: 1px solid #2a2a2a;
      object-fit: cover;
      flex-shrink: 0;
      align-self: flex-start;
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
      line-height: 1.2;
    }
    #hs-user-tooltip .hs-pc-platform {
      font-size: 10px;
      padding: 1px 2px;
      font-weight: 900;
      border: 1px solid #000;
      white-space: nowrap;
      letter-spacing: 0.2px;
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
      font-size: 10px;
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
      font-size: 11px;
      font-weight: 900;
      border: 1px solid #000;
      background: #ffff00;
      color: #000;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    #hs-user-tooltip .hs-pc-bio {
      font-size: 12px;
      color: #fff;
      line-height: 1.3;
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
      font-size: 11px;
      color: #fff;
      line-height: 1.3;
    }
    #hs-user-tooltip .hs-pc-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 20px;
      padding: 0 6px;
      font-size: 11px;
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
    #hs-user-tooltip .hs-pc-stat-heat .hs-heat-num { font-size: 11px; font-weight: 700; }
    #hs-user-tooltip .hs-pc-rel {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      font-size: 10px;
      line-height: 1.2;
    }
    #hs-user-tooltip .hs-pc-rel-badge {
      padding: 2px 3px;
      font-size: 10px;
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
    #hs-user-tooltip .hs-pc-followage {
      padding: 2px 3px;
      font-size: 10px;
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
      font-size: 10px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.3px;
      background: #daa520;
      color: #000;
    }
    #hs-user-tooltip .hs-pc-sub-tenure {
      padding: 2px 3px;
      font-size: 10px;
      font-weight: 900;
      white-space: nowrap;
      letter-spacing: 0.3px;
      background: #e91e8c;
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-loading {
      color: #fff;
      font-size: 11px;
    }
    .hs-mc-channel {
      color: #808080;
      font-size: 11px;
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
      font-size: 12px;
      color: #a0a0a0;
      margin-bottom: 14px;
      line-height: 1.4;
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
      font-size: 12px;
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
      font-size: 11px;
      color: #555;
      margin-top: 12px;
      line-height: 1.4;
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
    /* Picker emote wrap — blocked state draws a dashed grey outline on the
       wrap (not the img — opacity/visibility on the img kill its own outline)
       and hides the inner img while keeping the slot's layout intact. */
    .hs-mc-picker-emote-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .hs-mc-picker-emote-wrap.blocked {
      outline: 2px dashed #808080 !important;
      outline-offset: -2px !important;
    }
    .hs-mc-picker-emote-wrap.blocked img {
      visibility: hidden !important;
    }

    /* Emojis — native size by default, doubled when #hs-mc-container.hs-2x */
    .hs-mc-emoji {
      font-size: 1em;
      line-height: 1;
      vertical-align: middle;
      display: inline-block;
    }
    #hs-mc-container.hs-2x .hs-mc-emoji {
      font-size: 2em;
    }
    /* Small native Twitch emoticons (:), :(, <3 etc.) doubled when toggled on */
    #hs-mc-container.hs-2x img.hs-mc-emote[src*="static-cdn.jtvnw.net/emoticons"][src*="/1.0"] {
      width: 56px !important;
      height: 56px !important;
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
    }
    /* Expanded inner: gray bg via pseudo-element bleeding outward so the box
       layout doesn't grow vs collapsed (no line-height shift, no off-center). */
    .hs-mc-emote-stack.expanded .hs-mc-emote-stack-emotes {
      border-radius: 0;
      display: inline-flex;
      gap: 4px;
      align-items: center;
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
       (set by hover source) so cross-highlighted instances all match. */
    .hs-mc-emote-wrapper.hs-emote-highlight::before {
      opacity: 1;
      background: var(--hs-highlight-color, #00ff00) !important;
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

    /* State colors via ::before */
    .hs-mc-emote-wrapper.hs-state-global::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-owned::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-unadded::before { background: #ff8700; }
    .hs-mc-emote-wrapper.hs-state-channel::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-blocked::before { background: #ff0000; }

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
      font-size: 11px;
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
    #hs-emote-tooltip .tooltip-name {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
    }
    #hs-emote-tooltip .tooltip-source {
      font-size: 11px;
      padding: 2px 6px;
      margin: 2px -8px -8px;
      border-radius: 0;
      color: #fff;
      width: calc(100% + 16px);
      text-align: center;
    }
    #hs-emote-tooltip .tooltip-source.owned { background: #ff8700; color: #000; }
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
      font-size: 12px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    #hs-link-tooltip .link-desc {
      color: #fff;
      font-size: 11px;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    #hs-link-tooltip .link-domain {
      color: #8080ff;
      font-size: 10px;
    }
    #hs-link-tooltip .link-loading {
      color: #808080;
      font-size: 11px;
    }

    /* Input styles (used in #hs-mc-inputbar) */
    #hs-mc-input {
      flex: 1;
      padding: 8px 12px;
      background: #fff;
      color: #000;
      border: 1px solid #808080;
      border-radius: 0;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      position: relative;
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
    }
    /* WYSIWYG emote images in input — height clamped, width auto so wide
       emotes (catKISS, peepoArrive, etc.) render at natural aspect.
       max-width caps absurdly wide ones so a single emote can't blow out the
       inputbar layout. */
    #hs-mc-input .hs-input-emote {
      height: var(--hs-emote-size, 32px);
      width: auto;
      max-width: 192px;
      vertical-align: middle;
      margin: 0 2px;
      object-fit: contain;
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
      font-size: 12px;
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
      font-size: 12px;
      color: #fff;
    }
    .hs-mc-slash-row:hover,
    .hs-mc-slash-row.selected {
      background: #fff;
      color: #000;
    }
    .hs-mc-slash-name { color: #ff8700; font-weight: 700; }
    .hs-mc-slash-args { color: #aaa; flex-shrink: 0; }
    .hs-mc-slash-desc { color: #808080; font-size: 11px; margin-left: auto; }
    .hs-mc-slash-row:hover .hs-mc-slash-args,
    .hs-mc-slash-row.selected .hs-mc-slash-args,
    .hs-mc-slash-row:hover .hs-mc-slash-desc,
    .hs-mc-slash-row.selected .hs-mc-slash-desc { color: #fff; }
    .hs-mc-slash-row:hover .hs-mc-slash-name,
    .hs-mc-slash-row.selected .hs-mc-slash-name { color: #fff; }
    /* Toggle button */
    .hs-mc-toggle-btn {
      padding: 4px 10px;
      background: #000;
      color: #808080;
      border: none;
      border-radius: 0;
      font-size: 11px;
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

    /* === Profile card — system sans, no chrome, badges-first === */
    .hs-pcard {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Helvetica Neue", Arial, sans-serif;
      padding: 14px;
      color: #fff;
      background: #000;
      font-size: 13px;
      line-height: 1.4;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
      overflow-y: auto;
    }
    /* Sections are pure spacing — drop chrome borders + label-on-top */
    .hs-pcard-section {
      border: 0; padding: 0; margin: 0; position: static; background: transparent;
    }
    .hs-pcard-section-title { display: none; }
    /* Section dividers — single 1px line, near-invisible info delimiter */
    .hs-pcard-section + .hs-pcard-section {
      border-top: 1px solid #1a1a1a; padding-top: 10px;
    }

    .hs-pcard-id-row { display: flex; gap: 12px; align-items: flex-start; }
    .hs-pcard-avatar {
      width: 56px; height: 56px; border-radius: 0; object-fit: cover;
      flex-shrink: 0;
    }
    .hs-pcard-id-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .hs-pcard-name {
      font-size: 18px; font-weight: 700; color: #fff;
      display: flex; align-items: center; gap: 6px; line-height: 1.1;
    }
    .hs-pcard-livedot { color: #ff5050; font-size: 9px; animation: hs-pcard-pulse 1.5s infinite; }
    @keyframes hs-pcard-pulse { 50% { opacity: 0.4; } }
    .hs-pcard-badges {
      display: flex; gap: 3px; flex-wrap: wrap; align-items: center; min-height: 18px;
    }
    .hs-pcard-badges img.hs-mc-badge-img {
      width: 18px; height: 18px;
    }
    .hs-pcard-pills { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
    .hs-pcard-pill {
      padding: 2px 6px; border: 1px solid; text-decoration: none;
      font-weight: 600; display: inline-flex; align-items: center; gap: 3px;
    }
    .hs-pcard-pill:hover { background: #fff; color: #000; border-color: #fff; }
    .hs-pcard-pill-twitch { color: #9146ff; border-color: #9146ff; }
    .hs-pcard-pill-kick { color: #53fc18; border-color: #53fc18; }
    .hs-pcard-pill-youtube { color: #ff5050; border-color: #ff5050; }
    .hs-pcard-pill-heatsync { color: #ff8700; border-color: #ff8700; }
    .hs-pcard-pill-live { color: #ff5050; }
    .hs-pcard-bio {
      color: #aaa; font-size: 12px; line-height: 1.4;
      white-space: pre-wrap; word-break: break-word;
      border-left: 2px solid #1a1a1a; padding: 0 0 0 8px;
    }
    .hs-pcard-bio-mention { color: #ff8700; cursor: pointer; }
    .hs-pcard-bio-mention:hover { text-decoration: underline; }
    .hs-pcard-bio-tag { color: #ff00ff; text-decoration: none; }
    .hs-pcard-bio-tag:hover { text-decoration: underline; }
    .hs-pcard-meta {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      font-size: 11px; color: #888; line-height: 1.4;
    }
    .hs-pcard-age { color: #888; }
    .hs-pcard-role {
      padding: 0 5px; font-size: 10px; font-weight: 700; line-height: 1.6;
    }
    .hs-pcard-role.partner { background: #ffaa00; color: #000; }
    .hs-pcard-role.affiliate { background: #555; color: #fff; }
    .hs-pcard-verified {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; font-size: 10px; font-weight: 700;
    }
    .hs-pcard-verified.twitch { background: #9146ff; color: #fff; }
    .hs-pcard-verified.kick { background: #53fc18; color: #000; }
    .hs-pcard-rel { color: #ff8700; font-weight: 600; font-size: 12px; margin-top: 4px; }
    .hs-pcard-link { color: #ff8700; text-decoration: none; font-weight: 600; }
    .hs-pcard-link:hover { text-decoration: underline; }
    .hs-pcard-msg {
      display: flex; gap: 6px; padding: 2px 0;
      font-size: 13px; align-items: baseline;
    }
    .hs-pcard-msg-ts { color: #555; flex-shrink: 0; font-size: 11px; min-width: 38px; }
    .hs-pcard-msg-plat {
      flex-shrink: 0; font-size: 10px; padding: 0 3px;
      font-weight: 600; line-height: 1.5; color: #888;
    }
    .hs-pcard-msg-text {
      color: #fff; word-break: break-word; overflow-wrap: anywhere; flex: 1;
    }
    .hs-pcard-action-grid {
      display: flex; flex-wrap: wrap; gap: 4px;
    }
    .hs-pcard-action {
      background: transparent; color: #fff; border: 1px solid #333;
      padding: 6px 12px; cursor: pointer; font-family: inherit; font-size: 13px;
      text-align: center; box-sizing: border-box;
    }
    .hs-pcard-action:hover:not(:disabled) { background: #fff; color: #000; border-color: #fff; }
    .hs-pcard-action:disabled { opacity: 0.4; cursor: not-allowed; }

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
      font-size: 11px !important;
    }
    .hs-mc-pf-btn {
      background: transparent;
      border: 1px solid;
      color: #fff;
      font-size: 10px;
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
      font-size: 12px !important;
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
      max-height: calc(min(400px, 60vh) - 42px) !important;
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
      font-size: 10px;
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
    .hs-mc-search-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }
    .hs-mc-search-icon {
      position: absolute;
      left: 10px;
      pointer-events: none;
      opacity: 0.4;
    }
    #hs-mc-emote-search {
      width: 100%;
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
    .hs-mc-picker-emote:hover {
    }
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
      line-height: 1.3;
    }
    .hs-mc-menu-desc {
      font-size: 11px;
      color: #808080;
      line-height: 1.3;
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
      line-height: 1.3;
      flex: 1;
    }
    .hs-mc-pred-title img,
    .hs-mc-pred-outcome-title img {
      height: 1.2em;
      vertical-align: -0.2em;
      margin: 0 1px;
    }
    .hs-mc-pred-locked {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 0;
      background: rgba(255,255,255,0.1);
      color: #808080;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .hs-mc-pred-timer {
      font-size: 12px;
      color: #ff6b35;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .hs-mc-pred-balance {
      font-size: 12px;
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
      font-size: 12px;
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
      font-size: 10px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 10px;
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
      font-size: 12px;
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
      font-size: 12px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 12px;
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
      font-size: 11px;
      color: #808080;
      margin-right: 2px;
    }
    .hs-mc-pred-create-dur {
      font-size: 10px;
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
      line-height: 1.3;
      flex: 1;
    }
    .hs-mc-poll-status {
      font-size: 10px;
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
      font-size: 12px;
      color: #ff8700;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .hs-mc-poll-meta {
      font-size: 11px;
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
      font-size: 12px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-mc-poll-choice-pct {
      font-size: 12px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 12px;
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
      font-size: 11px;
      color: #808080;
      margin-right: 2px;
    }
    .hs-mc-poll-create-dur {
      font-size: 10px;
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
      font-size: 10px;
      font-weight: 600;
      color: #808080;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-mc-rewards-balance {
      font-size: 11px;
      color: #808080;
    }
    .hs-mc-rewards-empty {
      font-size: 11px;
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
      font-size: 11px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-mc-reward-cost {
      font-size: 10px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 10px;
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
      font-size: 10px;
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
      font-size: 12px !important;
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
      font-size: 11px;
      line-height: 1.4;
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
      font-size: 12px;
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
      font-size: 12px;
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
      font-size: 11px !important;
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
      font-size: 11px !important;
      min-width: 0 !important;
      max-width: none !important;
      width: 100% !important;
      text-align: center !important;
      box-sizing: border-box !important;
      flex: 0 0 auto !important;
      margin: 0 0 -1px 0 !important;
    }
    /* Vertical-tabs override for util buttons (C/T/F-/F+/⚙): the .hs-tabs-
       right/.hs-tabs-left .hs-mc-tab rule above forces width:100% on every
       tab, stretching util-btns to 90px and stacking them. Grow each button
       to fill its share of the 90px tabbar row so the strip reaches the far
       right edge (no 18px gap from fixed-size squares + left-aligned row). */
    .hs-tabs-right .hs-mc-util-btn,
    .hs-tabs-left .hs-mc-util-btn {
      width: auto !important;
      max-width: none !important;
      min-width: 18px !important;
      padding: 0 !important;
      flex: 1 1 0 !important;
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
      line-height: 1.4;
      font-size: 12px;
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
      font-size: 11px;
      color: #808080;
      margin: 0 3px;
    }
    .hs-feed-body {
      color: #fff;
    }
    .hs-feed-stat {
      font-size: 11px;
      margin: 0 2px;
      cursor: default;
    }
    .hs-feed-replies {
      cursor: pointer !important;
    }
    .hs-feed-thread-link {
      color: #ff0;
      font-size: 11px;
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
      font-size: 10px;
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
      font-size: 11px;
      line-height: 1.4;
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
      font-size: 12px;
      padding: 0 4px;
      font-family: inherit;
      flex-shrink: 0;
    }
    .hs-mc-feed-reply-cancel:hover {
      background: #fff;
      color: #000;
    }
    /* Canonical heat number — used everywhere via heatSpanHtml/heatSpanEl. Tier color/glow is set inline. */
    .hs-heat-num {
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-weight: 900;
      line-height: 1;
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
      line-height: 1.3;
      font-size: 12px;
    }
    .hs-thread-reply.is-thread-op {
      border-left: 2px solid #ff00ff;
      margin-left: -2px;
      padding-left: 10px;
    }
    .hs-feed-loader {
      cursor: default;
      font-size: 12px;
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
      font-size: 11px;
    }
    .hs-feed-link-card-link:hover {
      text-decoration: underline;
    }
    .hs-feed-link-card-icon {
      color: #888;
      font-size: 10px;
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
      font-size: 11px;
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
      font-size: 11px;
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
      font-size: 11px;
    }
    .hs-feed-embed-rich-meta {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .hs-feed-embed-rich-platform {
      font-size: 10px;
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
      font-size: 11px;
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

    /* ---- ENGAGEMENT BAR ---- */
    .hs-feed-engage {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
      padding-left: 2px;
    }
    .hs-feed-actions {
      display: none;
      position: absolute;
      top: 1px;
      right: 4px;
      align-items: center;
      gap: 2px;
      background: #000;
      border: 1px solid #808080;
      padding: 1px 3px;
      z-index: 10;
    }
    .hs-feed-msg:hover .hs-feed-actions {
      display: inline-flex;
    }
    .hs-feed-heat-btn,
    .hs-feed-bm-btn {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background: none;
      border: none;
      padding: 1px 3px;
      cursor: pointer;
      color: #fff;
      font-size: 11px;
      font-family: inherit;
      line-height: 1;
    }
    .hs-feed-heat-btn:hover .hs-fe-icon path,
    .hs-feed-bm-btn:hover .hs-fe-icon path {
      stroke: #ff8700;
    }
    .hs-feed-heat-btn.active .hs-fe-count {
      color: #ff8700;
    }
    .hs-fe-count {
      font-size: 10px;
      color: #808080;
      min-width: 0;
    }
    .hs-fe-icon {
      display: block;
      flex-shrink: 0;
    }
    .hs-feed-react-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 2px;
    }
    .hs-feed-react-chip {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background: rgba(255,255,255,0.05);
      border: 1px solid #444;
      padding: 1px 3px;
      cursor: pointer;
      font-size: 10px;
      color: #808080;
      font-family: inherit;
      line-height: 1;
    }
    .hs-feed-react-chip.active {
      border-color: #ff8700;
      color: #ff8700;
    }
    .hs-feed-react-chip:hover {
      border-color: #808080;
    }
    .hs-feed-react-img {
      width: 14px;
      height: 14px;
      vertical-align: middle;
    }
    .hs-feed-react-add {
      background: none;
      border: 1px solid #444;
      color: #fff;
      padding: 1px 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: inherit;
      line-height: 1;
    }
    .hs-feed-react-add:hover {
      border-color: #ff8700;
      color: #ff8700;
    }
    .hs-mc-react-picker {
      position: fixed;
      z-index: 99999;
      background: #111;
      border: 1px solid #808080;
      padding: 6px;
      width: 200px;
      max-height: 220px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .hs-mc-react-search {
      width: 100%;
      box-sizing: border-box;
      background: #000;
      border: 1px solid #808080;
      color: #fff;
      padding: 3px 5px;
      font-family: inherit;
      font-size: 11px;
    }
    .hs-mc-react-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      overflow-y: auto;
      max-height: 160px;
    }
    .hs-mc-react-emote {
      background: none;
      border: 1px solid transparent;
      padding: 2px;
      cursor: pointer;
    }
    .hs-mc-react-emote:hover {
      border-color: #ff8700;
    }
    .hs-mc-react-emote img {
      width: 28px;
      height: 28px;
      display: block;
    }

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
      font-size: 12px;
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
      font-size: 11px;
    }

    /* ---- TAB BADGE ---- */
    .hs-mc-tab .hs-badge {
      background: #ff6b35;
      color: #fff;
      border-radius: 2px;
      font-size: 10px;
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
    /* Shrink Kick's main content to make room for HeatSync panel.
       Gate to chat-right (or default — no hs-chat-* class). For
       hs-chat-left/top/bottom, the position-specific padding rules
       elsewhere in this file handle the offset; applying margin-right
       here too would carve 340px off the wrong side and shrink main
       (e.g., chat-left → empty right gutter, video clipped). */
    body:has(.hs-native-hidden#channel-chatroom):not(.hs-chat-left):not(.hs-chat-top):not(.hs-chat-bottom) main {
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

    /* Kick resize handle — convention: solid #ff8700, always visible. */
    #hs-kick-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 6px;
      height: 100%;
      cursor: col-resize;
      z-index: 10000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
      pointer-events: auto;
    }
    #hs-kick-resize-handle:hover,
    body:has(#hs-resize-overlay) #hs-kick-resize-handle {
      background: #ffaa33;
      opacity: 1;
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
      font-size: 12px;
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
      font-size: 12px;
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
      font-size: 11px;
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
      font-size: 12px;
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
      font-size: 12px;
      color: #ff8700;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin: 0;
      padding: 4px 8px;
      background: rgba(255,135,0,0.08);
      border-bottom: 1px solid rgba(255,135,0,0.2);
      line-height: 1.3;
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
      font-size: 11px;
    }
    .hs-discover-meta {
      color: #aaa;
      font-size: 11px;
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
      line-height: 1.5;
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
      line-height: 1.3;
      font-size: 13px;
      border-left: 2px solid transparent;
    }
    .hs-discover-profile-row:hover { background: #fff; color: #000; }
    .hs-discover-profile-row:hover * { color: #000 !important; }
    .hs-discover-profile-row.hs-discover-row-live { border-left-color: #ff3030; }
    .hs-discover-rank {
      color: #666;
      font-size: 11px;
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
      font-size: 11px;
      font-weight: 700;
      padding: 0 3px;
      line-height: 1.2;
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
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, monospace;
      line-height: 1;
    }
    .hs-discover-viewers {
      font-size: 11px;
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
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
    }
    .hs-discover-chips-label {
      color: #666;
      font-size: 11px;
      font-weight: 700;
      margin-right: -2px;
    }
    .hs-discover-chip-btn {
      padding: 2px 8px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      color: #aaa;
      cursor: pointer;
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-weight: 600;
      border-radius: 0;
      line-height: 1.4;
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
      line-height: 1.35;
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
      font-size: 11px;
    }
    .hs-discover-post-spacer { flex: 1; }
    .hs-discover-post-time {
      color: #666;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, monospace;
      flex-shrink: 0;
    }
    .hs-discover-post-plat {
      flex-shrink: 0;
    }
    .hs-discover-post-user {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 1;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hs-discover-post-text {
      color: #c8c8c8;
      font-size: 12px;
      line-height: 1.4;
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
      font-size: 11px;
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
      font-size: 11px;
    }
    .hs-discover-chip:hover .hs-discover-chip-count { color: #000; }

    .hs-pinned-row {
      display: block;
      padding: 2px 8px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      text-decoration: none;
      cursor: pointer;
      line-height: 1.4;
    }
    .hs-pinned-row:hover { background: rgba(255,135,0,0.07); }
    .hs-pinned-meta {
      display: flex;
      align-items: center;
      gap: 5px;
      margin: 0;
    }
    .hs-pinned-channel { font-size: 10px; color: #ff8700; font-weight: 600; }
    .hs-pinned-user { font-size: 10px; color: #bbb; }
    .hs-pinned-time { font-size: 10px; color: #808080; margin-left: auto; }
    .hs-pinned-body {
      font-size: 11px;
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
       container survives the swap. */
    body:has(#hs-mc-container) ytd-live-chat-frame#chat,
    body:has(#hs-mc-container) ytd-live-chat-frame {
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
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right #hs-mc-container {
      top: 0 !important;
      bottom: 0 !important;
      right: 0 !important;
      left: auto !important;
      width: var(--hs-chat-w, 340px) !important;
      height: auto !important;
    }
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left #hs-mc-container {
      top: 0 !important;
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
       margin-left. Cancel the padding so main flows naturally inside the
       shrunken body. */
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-left main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-right main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-top main,
    body.hs-platform-kick.hs-kick-no-channel.hs-chat-bottom main {
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-top: 0 !important;
      padding-bottom: 0 !important;
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
       outer dim is unchanged. Bar widths: unified #hs-c-resize-handle 5px,
       platform handles 6px — reserve 6px to fit either case. */
    body.hs-chat-right #hs-mc-container { border-left: 6px solid transparent !important; }
    body.hs-chat-left #hs-mc-container { border-right: 6px solid transparent !important; }
    body.hs-chat-top #hs-mc-container { border-bottom: 6px solid transparent !important; }
    body.hs-chat-bottom #hs-mc-container { border-top: 6px solid transparent !important; }

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
       The 5px padding on the chat-side is the orange resize bar's gutter. */
    body.hs-platform-yt:not(.hs-yt-watch).hs-chat-right ytd-app {
      width: calc(100% - var(--hs-chat-w, 340px)) !important;
      max-width: calc(100% - var(--hs-chat-w, 340px)) !important;
      padding-right: 5px !important;
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
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #chat-container,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #chat-container,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #chat-container {
      overflow: hidden !important;
    }
    /* Nuke the entire suggested-videos sidebar tree on LIVE only.
       overflow:hidden on #secondary doesn't clip because YT renders these
       via children that escape the secondary box (rendered at x>=1017
       absolutely). display:none kills them outright. We keep #chat-container
       alive because hs-mc-container is mounted inside it. */
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #related,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy #secondary-inner > *:not(#chat-container),
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy #secondary-inner > *:not(#chat-container),
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy #secondary-inner > *:not(#chat-container),
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #secondary-inner > *:not(#chat-container) {
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
       (~500-600px). #secondary-inner and #chat-container also need to
       extend so our container can fill them. */
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #secondary-inner,
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy #chat-container {
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

  `;
  document.head.appendChild(cleanup.trackNode(style));
}
