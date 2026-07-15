// Runs at document_start, BEFORE the host page paints. Eliminates the
// cold-boot flash on hard refresh by:
//   1. Reading layout state from localStorage (mirrored from chrome.storage
//      on every save by main.js — chrome.storage isn't sync-readable)
//   2. Injecting a <style> tag with the layout CSS vars + a :root::before
//      pseudo-element that pre-paints the overlay area before any host
//      element gets to render
//   3. Pre-applying body classes once <body> exists
// Without this script the user sees Twitch's natural full-width chat for
// 100-500ms before our overlay mounts and shoves it.
;(() => {
  if (window.__heatsyncEarlyLayout) return
  window.__heatsyncEarlyLayout = true

  // Platform detection from URL (sync, no waiting)
  const host = location.hostname
  let platform
  if (host.includes('youtube.com')) platform = 'yt'
  else if (host.includes('kick.com')) platform = 'kick'
  else if (host.includes('twitch.tv')) platform = 'twitch'
  else return // not a host we inject into

  // Pull layout state from localStorage (mirrored by main.js saveUiSetting +
  // saveChatWidth + saveChatHeight). All keys optional; fall back to defaults.
  function readLS(key, def) {
    try {
      const v = localStorage.getItem('hs_layout_' + key)
      if (v == null) return def
      try {
        return JSON.parse(v)
      } catch {
        return v
      }
    } catch {
      return def
    }
  }
  const tabPosition = readLS('tabPosition', 'top')
  const chatPosition = readLS('chatPosition', 'right')
  const chatWidth = parseInt(readLS('chatWidth', '340'), 10) || 340
  const chatHeight = parseInt(readLS('chatHeight', ''), 10) || null
  // YT chat-on-all-pages (ytChatOnNonLive, default ON). String() — readLS
  // JSON-parses, so '1' comes back as the number 1.
  const ytNonLive = platform === 'yt' && String(readLS('ytNonLiveChat', '1')) === '1'

  // #hs-bridge = BG send-bridge tab: the multichat never boots there, so a
  // popout prepaint would be a permanent black screen over the native chat.
  const isPopout =
    (platform === 'twitch' && /^\/(popout|embed)\/[a-zA-Z0-9_]+\/chat/.test(location.pathname)) ||
    // /live_chat only — NOT /live_chat_replay (yt's native VOD-chat popout;
    // the panel never takes it over, so a full-window prepaint there is a
    // pure black flash on top of the replay)
    (platform === 'yt' &&
      location.pathname.startsWith('/live_chat') &&
      !location.pathname.startsWith('/live_chat_replay') &&
      !location.hash.includes('hs-bridge'))

  // Only prepaint where chat will actually mount — otherwise the black bar
  // shows for up to 4s on home/directory/browse/search/shorts/etc. while the
  // user is just browsing (no chat to smooth in). Pathname-only (document_start),
  // single-segment channel paths minus the known non-channel roots. A miss here
  // costs at most a brief cold-boot flash on a real channel page (the thing
  // prepaint prevents) — never breakage — so err toward NOT painting.
  function isChatPage() {
    const p = location.pathname
    if (platform === 'twitch') {
      if (isPopout) return true
      const m = p.match(/^\/([a-zA-Z0-9_]{1,40})\/?$/)
      if (!m) return false
      return ![
        'directory',
        'following',
        'videos',
        'settings',
        'search',
        'wallet',
        'subscriptions',
        'friends',
        'drops',
        'downloads',
        'turbo',
        'prime',
        'store',
        'jobs',
        'clips',
        'collections',
        'about',
        'schedule',
        'team',
        'teams',
        'u',
        'popout',
        'embed',
        'moderator',
      ].includes(m[1].toLowerCase())
    }
    if (platform === 'kick') {
      const m = p.match(/^\/([a-zA-Z0-9_-]{1,40})\/?$/)
      if (!m) return false
      return ![
        'browse',
        'following',
        'categories',
        'category',
        'search',
        'messages',
        'settings',
        'clips',
        'subscriptions',
        'help',
        'about',
      ].includes(m[1].toLowerCase())
    }
    if (platform === 'yt') {
      // The /live_chat pop-out IS the chat surface — a dedicated window the
      // overlay fills edge-to-edge. Prepaint it (full-window black, below) so
      // there's no flash of native YT chat before our overlay mounts.
      if (isPopout) return true
      // Chat-on-all-pages (ytChatOnNonLive, default ON, mirrored by its apply
      // fn): the panel mounts on every YT page, so prepaint every page.
      // Opted out ('0'): panel only appears on confirmed livestreams, which
      // can't be told from a VOD at document_start — no prepaint, the overlay
      // docks into #secondary post-mount like before.
      return ytNonLive
    }
    return false
  }
  const doPrepaint = isChatPage()

  // Mark documentElement so the pseudo-element rule applies — ONLY on chat
  // pages. <html> always exists at document_start so this paints before
  // anything else. Body classes below still apply on every page (the
  // body-mounted launcher on non-channel pages needs them).
  if (doPrepaint) document.documentElement.classList.add('hs-prepaint-active')

  // Pre-paint via pseudo-element on <html>: paints from the moment this
  // <style> hits the DOM, no DOM-mount gap. The overlay will cross-fade
  // with this pseudo (overlay opacity 0→1, prepaint opacity 1→0) so the
  // transition is invisible.
  let prepaintRect
  if (isPopout) {
    // Pop-out window: the overlay fills the whole window (see the
    // body.hs-popout fill rule in styles). Prepaint the full window black so
    // there's no docked-bar flash before the bundle mounts.
    prepaintRect = `top:0; left:0; right:0; bottom:0;`
  } else if (chatPosition === 'left') {
    prepaintRect = `top:0; left:0; bottom:0; width:${chatWidth}px;`
  } else if (chatPosition === 'top') {
    prepaintRect = `top:0; left:0; right:0; height:${chatHeight || 280}px;`
  } else if (chatPosition === 'bottom') {
    prepaintRect = `bottom:0; left:0; right:0; height:${chatHeight || 280}px;`
  } else {
    prepaintRect = `top:0; right:0; bottom:0; width:${chatWidth}px;`
  }

  const css = `
:root {
  --hs-chat-w: ${chatWidth}px;
  ${chatHeight ? `--hs-chat-h: ${chatHeight}px;` : ''}
}
:root.hs-prepaint-active::before {
  content: '';
  position: fixed;
  ${prepaintRect}
  background: #000;
  z-index: 2147483646;
  pointer-events: none;
  transition: opacity 200ms ease-out;
}
:root.hs-prepaint-fade::before {
  opacity: 0;
}
/* Hide native chat children during prepaint so they don't paint behind the
   pseudo (and then peek out during the cross-fade). Target the React content
   roots specifically — NOT chat-shell itself, since our #hs-mc-container is
   a child of chat-shell and must stay visible for its own opacity-fade.
   visibility (vs display:none) keeps host layout stable. */
${
  platform === 'twitch' && (chatPosition === 'right' || chatPosition === 'left')
    ? `
:root.hs-prepaint-active .right-column [class*="chat-room__content"],
:root.hs-prepaint-active .right-column [data-a-target="chat-room-component"],
:root.hs-prepaint-active .right-column [class*="stream-chat"] [class*="chat-room__content"] {
  visibility: hidden !important;
}
`
    : ''
}
${
  platform === 'kick' && (chatPosition === 'right' || chatPosition === 'left')
    ? `
:root.hs-prepaint-active #channel-chatroom > *:not(#hs-mc-container) {
  visibility: hidden !important;
}
`
    : ''
}
`
  const style = document.createElement('style')
  style.id = 'hs-early-layout'
  style.textContent = css
  // documentElement is always present at document_start; head/body may not be.
  ;(document.head || document.documentElement).appendChild(style)

  // Apply body classes as soon as <body> exists so styles.js's body-scoped
  // rules are correct from the first frame.
  function applyBodyClasses() {
    const body = document.body
    if (!body) return false
    body.classList.add('hs-platform-' + platform)
    body.classList.add('hs-tabs-' + tabPosition)
    body.classList.add('hs-chat-' + chatPosition)
    if (isPopout) body.classList.add('hs-popout')
    // YT boot state must be RIGHT from the first frame: the layout CSS
    // reserves the panel column via :not(.hs-offline), and YT measures its
    // grid exactly once per resize — booting in the wrong state and flipping
    // after checkYtLive runs strands a squeezed grid with a dead column
    // (live-reported: 3-col home grid on a 1920px window). Panel-on-all-pages
    // users get the reserve + nonlive class now; opted-out users get
    // hs-offline now (no reserve anywhere until a livestream is confirmed).
    // checkYtLive re-toggles both from real signals, and dispatches a
    // synthetic resize on any later flip.
    if (platform === 'yt' && !isPopout) {
      // live_chat_replay = yt's own VOD-chat popout, never panel territory
      if (ytNonLive && !location.pathname.startsWith('/live_chat_replay')) {
        body.classList.add('hs-yt-nonlive-chat')
      } else {
        body.classList.add('hs-offline')
      }
    }
    // Twitch: pre-arm the native-chat takeover before Twitch mounts chat, so
    // the history backlog never renders into the hidden column (it was the
    // last untrimmed native DOM left after the takeover shipped). Consent is
    // the localStorage mirror native-tap.js writes on every suppress decision
    // — only pages where the overlay actually took over last time pre-arm.
    // Bulletproof: the beat set here is a one-shot; if the overlay fails to
    // boot and take ownership, the 45s dead-man TTL lapses and Twitch renders
    // normally. Overlay-disabled users have the mirror at '0'.
    // Retry budget on top of that: main.js resets takeoverArms to 0 the
    // moment an overlay mount pass actually completes (see _markOverlayRenderOk
    // in main.js). If it's still >0 next load, the previous boot never
    // confirmed success — 2 unconfirmed pre-arms in a row means something is
    // reliably breaking (not a one-off timing blip), so stop re-arming and
    // let native chat show from frame one until a boot succeeds again.
    if (platform === 'twitch' && readLS('nativeTakeover', '0') === '1') {
      const arms = parseInt(readLS('takeoverArms', '0'), 10) || 0
      if (arms < 2) {
        body.dataset.hsSuppressNative = '1'
        body.dataset.hsSuppressBeat = String(Date.now())
        try {
          localStorage.setItem('hs_layout_takeoverArms', String(arms + 1))
        } catch (_) {}
      }
    }
    return true
  }

  if (!applyBodyClasses()) {
    const obs = new MutationObserver(() => {
      if (applyBodyClasses()) obs.disconnect()
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
    setTimeout(() => obs.disconnect(), 5000)
  }

  // Self-destruct safety: if main.js never tears down (extension disabled
  // mid-load, content script error, network kill), drop everything after 4s
  // so the user isn't stuck staring at a black bar hiding their chat.
  setTimeout(() => {
    document.documentElement.classList.remove('hs-prepaint-active')
    document.documentElement.classList.remove('hs-prepaint-fade')
    document.getElementById('hs-early-layout')?.remove()
  }, 4000)
})()
