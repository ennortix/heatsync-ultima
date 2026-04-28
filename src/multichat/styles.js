// Styles - all CSS for multichat panel, tabs, messages, modals

// ============================================
// STYLES (injected once)
// ============================================

function injectStyles() {
  if (document.getElementById('hs-mc-styles')) return;

  const style = document.createElement('style');
  style.id = 'hs-mc-styles';
  style.textContent = `
    /* Tab bar - positioned at top of chat via render injection */
    #hs-mc-tabbar {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      padding: 4px 6px;
      background: #000;
      border-bottom: 1px solid #808080;
      flex-shrink: 0;
      order: -1;
      z-index: 10;
      align-items: center;
      box-sizing: border-box;
    }

    /* Chatterino-style composable tab states: idle → has-new → active */
    .hs-mc-tab {
      padding: 2px 8px !important;
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
      /* Auto-size to label content; cap so a long YT @handle can't blow out
         the row — the tab bar wraps to a second line as needed. !important
         beats the legacy .hs-mc-tab flex:1 rule lower in this file. */
      flex: 0 0 auto !important;
      max-width: 140px;
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
    /* Utility button row (T, A, A, ⚙) */
    /* Wrapping section for channel tabs */
    .hs-mc-tabs-scroll {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      width: 100%;
      align-items: center;
    }
    /* Util row — always a single row of 4, fits container width */
    .hs-mc-util-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    .hs-mc-util-row .hs-mc-tab {
      min-width: 0 !important;
      padding: 2px 0 !important;
    }
    /* Util buttons — same size as tabs, flow inline and wrap naturally */
    .hs-mc-util-btn {
      font-weight: 700 !important;
    }
    /* Util row — gray frame for ui parity with heatsync.org chat-tile.
       Hover → white bg / black text per global hover rule. */
    .hs-mc-util-row .hs-mc-tab {
      color: #808080 !important;
      border-color: #808080 !important;
    }
    .hs-mc-util-row .hs-mc-tab:hover {
      background: #fff !important;
      color: #000 !important;
      border-color: #fff !important;
    }
    /* Settings ⚙ wraps to row 2; span full width so it doesn't sit as a
       lonely 1/4-cell square. */
    .hs-mc-util-row .hs-mc-tab[data-tab="settings"] {
      grid-column: 1 / -1;
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
      color: #808080;
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
      border-radius: 3px;
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
    /* Live dot — red indicator, composes with any state */
    .hs-mc-tab {
      position: relative !important;
    }
    .hs-mc-tab[data-live="true"]::after {
      content: '';
      position: absolute;
      top: 2px;
      right: 2px;
      width: 6px;
      height: 6px;
      background: #f00;
      border-radius: 50%;
      pointer-events: none;
    }
    .hs-mc-tab.active[data-live="true"]::after {
      background: #cc0000;
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

    /* Resize drag bar — convention: solid #ff8700, ≥6px, no labels.
       Always visible so user knows the edge is grab-able. */
    #hs-mc-resize-handle {
      position: absolute;
      top: 0;
      left: 0;
      width: 6px;
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
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
      width: 6px;
      height: 100%;
      cursor: ew-resize;
      z-index: 2000;
      background: #ff8700;
      opacity: 0.7;
      transition: opacity 0.12s, background 0.12s;
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
      padding: 8px;
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
      border-radius: 3px;
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
    /* Hide native chat input area */
    .hs-native-hidden [class*="chat-input-container"],
    .hs-native-hidden [data-a-target="chat-input"] {
      display: none !important;
    }
    /* Hide native chat header/room content — our elements are in #hs-mc-container (sibling) */
    .hs-native-hidden [class*="chat-room__content"] > *:not(.hs-pc-panel):not(.hs-profile-card) {
      display: none !important;
    }
    /* Collapse the native chat container itself so #hs-mc-container gets flex space */
    [class*="chat-room__content"].hs-native-hidden {
      display: none !important;
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
    .chat-shell.hs-native-hidden > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card),
    [class*="chat-shell"].hs-native-hidden > *:not(#hs-mc-container):not(.hs-pc-panel):not(.hs-profile-card) {
      display: none !important;
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
      border-radius: 3px;
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
    }
    .hs-mc-msg.hs-mc-zebra, .hs-feed-msg.hs-mc-zebra {
      background: rgba(255,255,255,0.04);
    }
    .hs-mc-msg:hover {
    }
    .hs-mc-msg.hs-mc-thread-highlight {
      background: #808000 !important;
      box-shadow: none !important;
      position: relative;
      z-index: 2;
    }
    /* Reply context text needs to be readable on the olive thread-highlight bg */
    .hs-mc-msg.hs-mc-thread-highlight .hs-mc-reply-ctx,
    .hs-mc-msg.hs-mc-thread-highlight .hs-mc-reply-user {
      color: #fff !important;
      border-left-color: #fff !important;
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #000;
      border-bottom: 1px solid #000;
      padding: 2px 6px;
      font-size: 11px;
      color: #fff;
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
    /* Event color palette — each notice class gets a distinct ANSI hue so the
       chat can be read at a glance. Using saturated 16-color anchors plus
       Twitch/HS conventions (purple = sub, orange = HS brand/raid). */
    /* Red is reserved for @-mentions. Ban keeps red (severe/permanent). Timeout =
       green (#008000) — visible mod-action marker so timeouts read at a glance
       (matches the heatsync site). Recovery (untimeout) keeps the same green. */
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
    /* First-time chatter (Twitch first-msg=1) = HS brand orange */
    .hs-mc-msg.hs-mc-first-msg { border-left: 3px solid #ff8700; padding-left: 8px; background: rgba(255, 135, 0, 0.08); }
    .hs-mc-first-tag { display: inline-block; font-size: 10px; font-weight: 700; color: #000; background: #ff8700; padding: 0 4px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
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
      border-radius: 2px;
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.8);
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
      z-index: 100000;
      pointer-events: none;
      background: #000;
      border: 2px solid #00ff00;
      border-radius: 0;
      padding: 10px 6px 6px 6px;
      display: none;
      min-width: 240px;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
    }
    #hs-user-tooltip.visible {
      display: flex;
    }
    #hs-user-tooltip .hs-pc-avatar {
      width: 32px;
      height: 32px;
      min-width: 32px;
      border: 1px solid #000;
      object-fit: cover;
      flex-shrink: 0;
      align-self: flex-start;
    }
    #hs-user-tooltip .hs-pc-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
      margin-left: 6px;
    }
    #hs-user-tooltip .hs-pc-header {
      display: flex;
      align-items: center;
      gap: 4px;
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
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      background: #fff;
      border: 1px solid #000;
      padding: 2px 3px;
      color: #000;
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
    #hs-user-tooltip .hs-pc-role.affiliate { background: #808080; color: #fff; }
    #hs-user-tooltip .hs-pc-age {
      padding: 2px 3px;
      font-size: 10px;
      font-weight: 900;
      border: 1px solid #ffff00;
      background: transparent;
      color: #ffff00;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    #hs-user-tooltip .hs-pc-bio {
      font-size: 12px;
      color: #fff;
      line-height: 1.3;
      margin: 2px 0;
      word-break: break-word;
    }
    #hs-user-tooltip .hs-pc-bio-mention { color: #ff8700; cursor: pointer; }
    #hs-user-tooltip .hs-pc-bio-mention:hover { text-decoration: underline; }
    #hs-user-tooltip .hs-pc-bio-tag { color: #fff; text-decoration: none; }
    #hs-user-tooltip .hs-pc-bio-tag:hover { text-decoration: underline; }
    #hs-user-tooltip .hs-pc-stats {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
      font-size: 10px;
      color: #fff;
      line-height: 1.2;
    }
    #hs-user-tooltip .hs-pc-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 500;
      border: 1px solid #fff;
      background: transparent;
      color: #fff;
      white-space: nowrap;
      letter-spacing: 0.3px;
    }
    #hs-user-tooltip .hs-pc-stat.op {
      color: #ff0000;
      font-weight: 700;
      border-color: #ff0000;
    }
    #hs-user-tooltip .hs-pc-stat.op .hs-pc-num {
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-stat.mop {
      color: #ff00ff;
      font-weight: 700;
      border-color: #ff00ff;
    }
    #hs-user-tooltip .hs-pc-stat.mop .hs-pc-num {
      color: #fff;
    }
    #hs-user-tooltip .hs-pc-stat.re {
      color: #00ffff;
      font-weight: 700;
      border-color: #00ffff;
    }
    #hs-user-tooltip .hs-pc-stat.re .hs-pc-num {
      color: #fff;
    }
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
      color: #808080;
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
    .hs-mc-emote {
      height: var(--hs-emote-size, 32px);
      width: auto;
      vertical-align: middle;
      margin: 0 2px;
      padding: 4px;
      border-radius: 0;
      transition: none;
      cursor: pointer;
      box-sizing: content-box;
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

    /* Emojis — double-size, stackable as overlay base */
    .hs-mc-emoji {
      font-size: 2em;
      line-height: 1;
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
      transition: none;
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

    /* State colors via ::before */
    .hs-mc-emote-wrapper.hs-state-global::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-owned::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-unadded::before { background: #ff8700; }
    .hs-mc-emote-wrapper.hs-state-channel::before { background: #00ff00; }
    .hs-mc-emote-wrapper.hs-state-blocked::before { background: #ff0000; }

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
    #hs-badge-tooltip {
      position: fixed;
      z-index: 100001;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
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
    #hs-emote-tooltip {
      position: fixed;
      z-index: 100001;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
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

    #hs-link-tooltip {
      position: fixed;
      z-index: 5000;
      pointer-events: none;
      background: #000;
      border: 2px solid #808080;
      border-radius: 0;
      padding: 8px;
      display: none;
      flex-direction: row;
      gap: 8px;
      max-width: 350px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.6);
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
    }
    #hs-mc-input:focus {
      border-color: #9147ff;
    }
    #hs-mc-input::placeholder {
      color: #808080;
    }
    /* Contenteditable placeholder */
    #hs-mc-input[contenteditable]:empty::before {
      content: attr(data-placeholder);
      color: #808080;
      pointer-events: none;
    }
    /* WYSIWYG emote images in input */
    #hs-mc-input .hs-input-emote {
      height: var(--hs-emote-size, 32px);
      vertical-align: middle;
      margin: 0 2px;
    }
    /* WYSIWYG zero-width emote stacking in input */
    #hs-mc-input .hs-input-stack {
      display: inline-grid;
      place-items: center;
      vertical-align: middle;
      margin: 0 2px;
    }
    #hs-mc-input .hs-input-stack > img {
      grid-area: 1 / 1;
      margin: 0;
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
      background: #808080;
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
      background: #808080;
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

    /* === Full-panel btop-style profile card === */
    .hs-pcard {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 14px 10px 8px 10px;
      color: #ddd;
      background: #000;
      font-size: 12px;
      line-height: 1.5;
      box-sizing: border-box;
    }
    .hs-pcard-section {
      border: 1px solid #555;
      margin-bottom: 10px;
      padding: 10px 10px 8px 10px;
      position: relative;
      box-sizing: border-box;
    }
    .hs-pcard-section-title {
      position: absolute;
      top: -8px;
      left: 8px;
      background: #000;
      padding: 0 6px;
      font-size: 10px;
      color: #aaa;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .hs-pcard-id { border-color: #ff8700; }
    .hs-pcard-id .hs-pcard-section-title { color: #ff8700; }
    .hs-pcard-stream { border-color: #f00; }
    .hs-pcard-stream .hs-pcard-section-title { color: #f00; }
    .hs-pcard-recent { border-color: #888; }
    .hs-pcard-actions { border-color: #444; }

    .hs-pcard-id-row { display: flex; gap: 12px; align-items: flex-start; }
    .hs-pcard-avatar {
      width: 56px; height: 56px; border-radius: 4px; object-fit: cover;
      border: 1px solid #444; flex-shrink: 0;
    }
    .hs-pcard-id-text { flex: 1; min-width: 0; }
    .hs-pcard-name { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px; }
    .hs-pcard-livedot { color: #f00; animation: hs-pcard-pulse 1.5s infinite; }
    @keyframes hs-pcard-pulse { 50% { opacity: 0.35; } }
    .hs-pcard-pills { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
    .hs-pcard-pill {
      padding: 2px 6px; border: 1px solid; text-decoration: none;
      font-weight: 600; display: inline-flex; align-items: center; gap: 3px;
    }
    .hs-pcard-pill:hover { filter: brightness(1.3); }
    .hs-pcard-pill-twitch { color: #9146ff; border-color: #9146ff; }
    .hs-pcard-pill-kick { color: #53fc18; border-color: #53fc18; }
    .hs-pcard-pill-youtube { color: #ff0000; border-color: #ff0000; }
    .hs-pcard-pill-heatsync { color: #ff8700; border-color: #ff8700; }
    .hs-pcard-pill-live { color: #f00; }
    .hs-pcard-bio {
      margin-top: 8px; padding: 4px 0; color: #aaa;
      font-style: italic; font-size: 11px; border-top: 1px dashed #333;
      white-space: pre-wrap; word-break: break-word;
    }
    .hs-pcard-bio-mention { color: #ff8700; cursor: pointer; font-style: normal; }
    .hs-pcard-bio-mention:hover { text-decoration: underline; }
    .hs-pcard-bio-tag { color: #fff; text-decoration: none; font-style: normal; }
    .hs-pcard-bio-tag:hover { text-decoration: underline; }
    .hs-pcard-meta {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
      margin-top: 4px; font-size: 10px; line-height: 1.4;
    }
    .hs-pcard-age { color: #808080; }
    .hs-pcard-role {
      padding: 0 4px; font-size: 9px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .hs-pcard-role.partner { background: #ffaa00; color: #000; }
    .hs-pcard-role.affiliate { background: #808080; color: #fff; }
    .hs-pcard-verified {
      display: inline-flex; align-items: center; justify-content: center;
      width: 12px; height: 12px; font-size: 9px; font-weight: 700;
    }
    .hs-pcard-verified.twitch { background: #9146ff; color: #fff; }
    .hs-pcard-verified.kick { background: #53fc18; color: #000; }
    .hs-pcard-rel { color: #ff8700; font-weight: 600; margin-top: 4px; }
    .hs-pcard-link { color: #ff8700; text-decoration: none; font-weight: 700; }
    .hs-pcard-link:hover { text-decoration: underline; }
    .hs-pcard-msg {
      display: flex; gap: 6px; padding: 1px 0;
      font-size: 11px; align-items: baseline;
    }
    .hs-pcard-msg-ts { color: #666; flex-shrink: 0; font-size: 10px; }
    .hs-pcard-msg-plat {
      flex-shrink: 0; font-size: 9px; padding: 0 3px; border: 1px solid;
      font-weight: 700; line-height: 1.4;
    }
    .hs-pcard-msg-text {
      color: #ddd; word-break: break-word; overflow-wrap: anywhere;
    }
    .hs-pcard-action-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 4px;
    }
    .hs-pcard-action {
      background: #0a0a0a; color: #ddd; border: 1px solid #444;
      padding: 6px 8px; cursor: pointer; font-family: inherit; font-size: 11px;
      text-align: left; box-sizing: border-box;
    }
    .hs-pcard-action:hover:not(:disabled) { background: #fff; color: #000; }
    .hs-pcard-action:hover:not(:disabled) .hs-pcard-kbd { color: #000; }
    .hs-pcard-action:disabled { opacity: 0.4; cursor: not-allowed; }
    .hs-pcard-kbd { color: #ff8700; font-weight: 700; }

    /* Per-tab platform filter toggles (T/K/YT) — sits above util-row in tab bar */
    #hs-mc-platfilter {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px;
      width: 100%;
      box-sizing: border-box;
    }
    #hs-mc-platfilter:empty { display: none; }
    .hs-mc-pf-btn {
      background: transparent;
      border: 1px solid;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 0;
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
    .hs-mc-pf-btn.hs-mc-pf-twitch { border-color: #9146ff; background: #9146ff; color: #fff; }
    .hs-mc-pf-btn.hs-mc-pf-kick { border-color: #53fc18; background: #53fc18; color: #000; }
    .hs-mc-pf-btn.hs-mc-pf-youtube { border-color: #ff0000; background: #ff0000; color: #fff; }
    .hs-mc-pf-btn.off {
      background: transparent !important;
      color: #555 !important;
      border-color: #333 !important;
    }
    .hs-mc-pf-btn:hover { filter: brightness(1.2); }
    .hs-mc-pf-btn.off:hover {
      background: rgba(255,255,255,0.06) !important;
      color: #aaa !important;
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
    .hs-mc-tab {
      flex: 1;
      padding: 12px;
      background: transparent;
      color: #808080;
      border: none;
      cursor: pointer;
      font-size: 15px;
      font-weight: 500;
      transition: none;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .hs-mc-tab:hover {
      background: #fff;
      color: #000;
    }
    .hs-mc-tab.active {
      color: #fff;
      background: #9147ff;
      border-bottom: 2px solid #9147ff;
      margin-bottom: -1px;
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
      transition: width 0.3s ease;
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
      background: #ff8700;
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
      border-radius: 4px;
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
      background: linear-gradient(135deg, rgba(0,200,100,0.15), rgba(255,135,0,0.1));
      color: #00e070;
      border: 1px solid rgba(0,200,100,0.3);
    }
    .hs-mc-pred-result-won .hs-mc-pred-result-amount {
      text-shadow: 0 0 12px rgba(0,224,112,0.4);
    }
    .hs-mc-pred-result-lost {
      background: rgba(255,60,60,0.08);
      color: #ff5050;
      border: 1px solid rgba(255,60,60,0.2);
    }
    .hs-mc-pred-result-refund {
      background: linear-gradient(135deg, rgba(255,135,0,0.1), rgba(255,191,0,0.08));
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
      border-radius: 3px;
      padding: 5px 8px;
      margin-top: 6px;
      text-align: center;
    }
    .hs-mc-pred-resolve-yours {
      border-color: #ff8700 !important;
      color: #ff8700 !important;
    }
    .hs-mc-pred-resolve-yours:hover {
      background: #ff8700 !important;
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
      background: var(--oc);
      color: #000;
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
      background: #ff8700;
      color: #000;
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
      transition: width 0.3s ease;
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
      background: #ff8700;
      color: #000;
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
    .hs-mc-reward-card:hover {
      background: rgba(255,255,255,0.08);
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
      background: rgba(255,255,255,0.12);
      color: #fff;
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
      background: rgba(255,255,255,0.03);
    }
    .hs-mc-setting-row:hover {
      background: rgba(255,255,255,0.06);
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
      padding: 4px;
      gap: 2px;
      border-bottom: none;
      border-left: 1px solid #fff;
      border-radius: 0;
      background: #000;
      overflow-y: auto;
      z-index: 1001;
    }
    .hs-tabs-right .hs-mc-tab {
      padding: 4px 6px;
      font-size: 11px;
      min-width: auto;
      width: 100%;
      text-align: center;
      box-sizing: border-box;
      flex: 0 0 auto;
    }
    .hs-tabs-right .hs-mc-tabs-scroll {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
    }
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
      padding: 3px 8px;
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
      padding: 4px;
      gap: 2px;
      border-bottom: none;
      border-right: 1px solid #fff;
      border-radius: 0;
      background: #000;
      overflow-y: auto;
      z-index: 1001;
    }
    .hs-tabs-left .hs-mc-tab {
      padding: 4px 6px;
      font-size: 11px;
      min-width: auto;
      width: 100%;
      text-align: center;
      box-sizing: border-box;
      flex: 0 0 auto;
    }
    .hs-tabs-left .hs-mc-tabs-scroll {
      flex-direction: column;
      flex-wrap: nowrap;
      align-items: stretch;
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      min-height: 0;
    }
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

    /* ---- FEED MESSAGE CARDS ---- */
    .hs-feed-msg {
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
      border-radius: 3px;
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
      border-radius: 3px;
      background: #000;
    }
    .hs-feed-embed-container {
      position: relative;
      width: 100%;
      max-width: 480px;
      aspect-ratio: 16 / 9;
      background: #000;
      border-radius: 3px;
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
    .hs-feed-link-card {
      margin: 4px 0 2px;
      padding: 4px 6px;
      background: rgba(255,255,255,0.04);
      border: 1px solid #333;
      border-radius: 3px;
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
      border-radius: 3px;
      max-width: 480px;
    }

    /* ---- ENGAGEMENT BAR ---- */
    .hs-feed-engage {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
      padding-left: 2px;
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
      color: #808080;
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
      color: #808080;
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
    .hs-native-hidden #chatroom-messages,
    .hs-native-hidden [class*="chatroom-footer"],
    .hs-native-hidden [class*="chat-input"],
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
    /* Shrink Kick's main content to make room for HeatSync panel */
    body:has(.hs-native-hidden#channel-chatroom) main {
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
      background: #111;
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
    .hs-discover-subtitle {
      font-size: 10px;
      color: #707070;
      padding: 2px 8px 3px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      font-style: italic;
      line-height: 1.2;
    }
    .hs-discover-section-body {
      padding: 1px 0;
    }
    .hs-discover-section-empty {
      padding: 8px;
      color: #555;
      font-size: 11px;
      font-style: italic;
      text-align: center;
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
    .hs-discover-live-count {
      color: #ff3030;
      font-weight: 700;
      animation: hs-pulse-live 1.6s ease-in-out infinite;
    }
    @keyframes hs-pulse-live {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.55; }
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
      background: rgba(255,135,0,0.12);
      border: 1px solid rgba(255,135,0,0.4);
      color: #ff8700;
      font-size: 12px;
      text-decoration: none;
      cursor: pointer;
      border-radius: 0;
      line-height: 1.5;
      white-space: nowrap;
    }
    .hs-discover-chip:hover { background: #fff; color: #000; }
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
    .hs-discover-profile-row:hover { background: rgba(255,135,0,0.07); }
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
      box-shadow: 0 0 5px #ff3030;
      animation: hs-pulse-live 1.6s ease-in-out infinite;
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
      opacity: 0.6;
      transition: opacity 0.1s;
    }
    .hs-discover-platforms .hs-plat:hover { opacity: 1; }
    .hs-discover-platforms .hs-plat-live { opacity: 1; text-shadow: 0 0 4px currentColor; }
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
      background: linear-gradient(90deg, #ff8700, #ffaa33);
    }
    .hs-discover-row-live .hs-discover-bar > i {
      background: linear-gradient(90deg, #ff3030, #ff8700);
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
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
      transition: color 0.1s, border-color 0.1s, background 0.1s;
    }
    .hs-discover-chip-btn:hover {
      color: #fff;
      border-color: #ff8700;
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

    /* Section colour variants — distinct accent borders + headers per widget */
    .hs-discover-section-live {
      border-color: rgba(255,48,48,0.35);
    }
    .hs-discover-section-live > .hs-discover-heading {
      background: rgba(255,48,48,0.10);
      border-bottom-color: rgba(255,48,48,0.35);
      color: #ff5050;
    }
    .hs-discover-section-live > .hs-discover-heading .hs-discover-heading-title::before {
      content: '';
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ff3030;
      box-shadow: 0 0 5px #ff3030;
      margin-right: 5px;
      vertical-align: middle;
      animation: hs-pulse-live 1.6s ease-in-out infinite;
    }
    .hs-discover-section-posts {
      border-color: rgba(255,135,0,0.3);
    }
    .hs-discover-section-posts > .hs-discover-heading {
      background: rgba(255,135,0,0.10);
      color: #ffaa44;
    }
    .hs-discover-section-trending {
      border-color: rgba(0,180,255,0.28);
    }
    .hs-discover-section-trending > .hs-discover-heading {
      background: rgba(0,180,255,0.08);
      color: #4dc6ff;
      border-bottom-color: rgba(0,180,255,0.3);
    }
    .hs-discover-section-tags {
      border-color: rgba(80,255,120,0.28);
    }
    .hs-discover-section-tags > .hs-discover-heading {
      background: rgba(80,255,120,0.08);
      color: #6dff8d;
      border-bottom-color: rgba(80,255,120,0.3);
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
      background: rgba(255,135,0,0.07);
      border-left-color: rgba(255,135,0,0.4);
    }
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
      color: rgba(255,135,0,0.6);
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

    /* --- chat container: fixed-position at chosen edge --- */
    body.hs-chat-left #hs-mc-container,
    body.hs-chat-top #hs-mc-container,
    body.hs-chat-bottom #hs-mc-container {
      position: fixed !important;
      z-index: 9999 !important;
      background: #000 !important;
      box-sizing: border-box !important;
      margin: 0 !important;
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
      padding-left: var(--hs-chat-w, 340px) !important;
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

    /* --- KICK: #channel-chatroom IS the native chat shell (sibling of
       our #hs-mc-container). When chat moves, hide the shell entirely
       so it gives up its 320px sidebar width back to <main>. --- */
    body.hs-platform-kick.hs-chat-left #channel-chatroom,
    body.hs-platform-kick.hs-chat-top #channel-chatroom,
    body.hs-platform-kick.hs-chat-bottom #channel-chatroom {
      display: none !important;
    }
    body.hs-platform-kick.hs-chat-left main {
      padding-left: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-kick.hs-chat-top main {
      padding-top: var(--hs-chat-h, 35vh) !important;
    }
    body.hs-platform-kick.hs-chat-bottom main {
      padding-bottom: var(--hs-chat-h, 35vh) !important;
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

    /* --- YOUTUBE: collapse #secondary; pad #primary --- */
    body.hs-platform-yt.hs-chat-left #secondary,
    body.hs-platform-yt.hs-chat-top #secondary,
    body.hs-platform-yt.hs-chat-bottom #secondary {
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      flex: 0 0 0 !important;
      overflow: hidden !important;
    }
    body.hs-platform-yt.hs-chat-left #chat-container,
    body.hs-platform-yt.hs-chat-top #chat-container,
    body.hs-platform-yt.hs-chat-bottom #chat-container {
      overflow: hidden !important;
    }
    /* Nuke the entire suggested-videos sidebar tree. overflow:hidden on
       #secondary doesn't clip because YT renders these via children that
       escape the secondary box (they're rendered at x>=1017 absolutely).
       display:none kills them outright. We keep #chat-container alive
       because hs-mc-container is mounted inside it. */
    body.hs-platform-yt.hs-chat-left #related,
    body.hs-platform-yt.hs-chat-top #related,
    body.hs-platform-yt.hs-chat-bottom #related,
    body.hs-platform-yt.hs-chat-right #related,
    body.hs-platform-yt.hs-chat-left ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-top ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-right ytd-watch-next-secondary-results-renderer,
    body.hs-platform-yt.hs-chat-left #secondary-inner > *:not(#chat-container),
    body.hs-platform-yt.hs-chat-top #secondary-inner > *:not(#chat-container),
    body.hs-platform-yt.hs-chat-bottom #secondary-inner > *:not(#chat-container),
    body.hs-platform-yt.hs-chat-right #secondary-inner > *:not(#chat-container) {
      display: none !important;
    }
    /* Default 'right' position — kill YT's gutters so the player sits flush
       against the orange resize handle. The 16px gap was YT subtracting
       --ytd-watch-flexy-side-menu-margin (22px = 16+6) from the primary
       width when sizing the player. Override:
         non-player-width = chat width only (no gutters)
         side-menu-margin = 0 */
    body.hs-platform-yt.hs-chat-right #primary {
      margin-right: 0 !important;
    }
    body.hs-platform-yt.hs-chat-right ytd-watch-flexy {
      --ytd-watch-flexy-side-menu-margin: 0 !important;
      --ytd-watch-flexy-non-player-width: var(--hs-chat-w, 340px) !important;
    }
    /* Force the player containers to fill #primary's inner width — kills
       the YT-side-menu-margin gap (right) AND the YT-non-player-width gap
       (left). For top/bottom the JS-driven inline width owns sizing. */
    body.hs-platform-yt.hs-chat-right #player-container,
    body.hs-platform-yt.hs-chat-right #player-container-outer,
    body.hs-platform-yt.hs-chat-right #player-container-inner,
    body.hs-platform-yt.hs-chat-right ytd-player,
    body.hs-platform-yt.hs-chat-right #player,
    body.hs-platform-yt.hs-chat-left #player-container,
    body.hs-platform-yt.hs-chat-left #player-container-outer,
    body.hs-platform-yt.hs-chat-left #player-container-inner,
    body.hs-platform-yt.hs-chat-left ytd-player,
    body.hs-platform-yt.hs-chat-left #player {
      width: 100% !important;
    }
    /* chat-left: same gutter-kill as chat-right so YT computes the player
       width as primary's full width (708px) instead of vw - 450 (= 598). */
    body.hs-platform-yt.hs-chat-left ytd-watch-flexy {
      --ytd-watch-flexy-side-menu-margin: 0 !important;
      --ytd-watch-flexy-non-player-width: var(--hs-chat-w, 340px) !important;
    }
    body.hs-platform-yt.hs-chat-left #primary {
      margin-left: var(--hs-chat-w, 340px) !important;
      margin-right: 0 !important;
      padding-top: 0 !important;
      width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      max-width: calc(100vw - var(--hs-chat-w, 340px)) !important;
      flex: 0 0 auto !important;
    }
    /* Kill the secondary's residual 16px (its own padding/margin still
       takes layout space even with width:0). */
    body.hs-platform-yt.hs-chat-left #secondary,
    body.hs-platform-yt.hs-chat-top #secondary,
    body.hs-platform-yt.hs-chat-bottom #secondary {
      padding: 0 !important;
      margin: 0 !important;
    }
    body.hs-platform-yt.hs-chat-top #primary {
      margin-top: var(--hs-chat-h, 35vh) !important;
      padding-top: 0 !important;
    }
    body.hs-platform-yt.hs-chat-bottom #primary {
      margin-bottom: var(--hs-chat-h, 35vh) !important;
      padding-top: 0 !important;
    }
    /* Kill the masthead reservation — chat clutter is hidden, no need to
       reserve top-bar space below it. Applies to ALL chat positions on YT
       so the player floats flush in every layout. */
    body.hs-platform-yt.hs-chat-top #page-manager,
    body.hs-platform-yt.hs-chat-bottom #page-manager,
    body.hs-platform-yt.hs-chat-left #page-manager,
    body.hs-platform-yt.hs-chat-right #page-manager {
      margin-top: 0 !important;
    }
    /* chat-right: same vertical-center treatment as chat-left so the
       player floats centered in the freed area (since #below clutter
       below the player is gone, primary collapses to player height). */
    body.hs-platform-yt.hs-chat-right #primary,
    body.hs-platform-yt.hs-chat-right #primary-inner {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow: hidden !important;
    }
    body.hs-platform-yt.hs-chat-right #primary-inner {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
    }
    /* Tell YT how much vertical space is NOT available for the player so
       its own layout JS shrinks the player to fit. YT computes player
       height = viewport - --ytd-watch-flexy-non-player-height. Bumping
       that var by chat-strip height makes YT shrink the player itself,
       which keeps the 16:9 aspect ratio (no distortion, no clipping). */
    body.hs-platform-yt.hs-chat-top ytd-watch-flexy,
    body.hs-platform-yt.hs-chat-bottom ytd-watch-flexy {
      --ytd-watch-flexy-non-player-height: calc(56px + 12px + 92px + var(--hs-chat-h, 35vh)) !important;
      --ytd-watch-flexy-min-player-height: 200px !important;
    }
    /* Belt-and-braces: cap player container too, in case YT's JS doesn't
       re-read the var on every chat-height change. */
    body.hs-platform-yt.hs-chat-top #player-container,
    body.hs-platform-yt.hs-chat-top #player-container-outer,
    body.hs-platform-yt.hs-chat-bottom #player-container,
    body.hs-platform-yt.hs-chat-bottom #player-container-outer {
      max-height: calc(100vh - var(--hs-chat-h, 35vh) - 60px) !important;
    }
    /* Hide YT's #below stack (suggested thumbnails / video info / comments)
       when chat takes the screen — chat is the focus, the noise goes away.
       Center the player horizontally so it doesn't hug the left edge once
       the surrounding content is gone. */
    body.hs-platform-yt.hs-chat-top #below,
    body.hs-platform-yt.hs-chat-bottom #below,
    body.hs-platform-yt.hs-chat-left #below,
    body.hs-platform-yt.hs-chat-right #below {
      display: none !important;
    }
    /* Top/bottom: player is sized inline to fill availH, just need
       horizontal centering. Don't add min-height — primary has margin-top
       for chat-top, so 100vh would push content off the bottom. */
    body.hs-platform-yt.hs-chat-top #primary-inner,
    body.hs-platform-yt.hs-chat-bottom #primary-inner {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: flex-start !important;
    }
    /* Left: chat fills viewport on left, player needs vertical centering
       in the freed right area. Constrain primary-inner to viewport height. */
    body.hs-platform-yt.hs-chat-left #primary,
    body.hs-platform-yt.hs-chat-left #primary-inner {
      height: 100vh !important;
      max-height: 100vh !important;
      overflow: hidden !important;
    }
    body.hs-platform-yt.hs-chat-left #primary-inner {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
    }
    body.hs-platform-yt.hs-chat-top #player,
    body.hs-platform-yt.hs-chat-bottom #player,
    body.hs-platform-yt.hs-chat-left #player {
      margin-left: auto !important;
      margin-right: auto !important;
    }
    /* YouTube theatre: ytd-watch-flexy[theater] makes the player full-row.
       The #full-bleed-container is what owns the player. Inset it. */
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
  document.head.appendChild(style);
}
