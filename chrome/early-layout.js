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
(function () {
  'use strict'
  if (window.__heatsyncEarlyLayout) return
  window.__heatsyncEarlyLayout = true

  // Platform detection from URL (sync, no waiting)
  const host = location.hostname
  let platform
  if (host.includes('youtube.com')) platform = 'yt'
  else if (host.includes('kick.com')) platform = 'kick'
  else if (host.includes('twitch.tv')) platform = 'twitch'
  else return  // not a host we inject into

  // Pull layout state from localStorage (mirrored by main.js saveUiSetting +
  // saveChatWidth + saveChatHeight). All keys optional; fall back to defaults.
  function readLS(key, def) {
    try {
      const v = localStorage.getItem('hs_layout_' + key)
      if (v == null) return def
      try { return JSON.parse(v) } catch { return v }
    } catch { return def }
  }
  const tabPosition = readLS('tabPosition', 'top')
  const chatPosition = readLS('chatPosition', 'right')
  const chatWidth = parseInt(readLS('chatWidth', '340'), 10) || 340
  const chatHeight = parseInt(readLS('chatHeight', ''), 10) || null

  const isPopout = platform === 'twitch' && /^\/(popout|embed)\/[a-zA-Z0-9_]+\/chat/.test(location.pathname)

  // Mark documentElement so the pseudo-element rule applies. <html> always
  // exists at document_start so this paints before anything else.
  document.documentElement.classList.add('hs-prepaint-active')

  // Pre-paint via pseudo-element on <html>: paints from the moment this
  // <style> hits the DOM, no DOM-mount gap. The overlay will cross-fade
  // with this pseudo (overlay opacity 0→1, prepaint opacity 1→0) so the
  // transition is invisible.
  let prepaintRect
  if (chatPosition === 'left') {
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
${platform === 'twitch' && (chatPosition === 'right' || chatPosition === 'left') ? `
:root.hs-prepaint-active .right-column [class*="chat-room__content"],
:root.hs-prepaint-active .right-column [data-a-target="chat-room-component"],
:root.hs-prepaint-active .right-column [class*="stream-chat"] [class*="chat-room__content"] {
  visibility: hidden !important;
}
` : ''}
${platform === 'kick' && (chatPosition === 'right' || chatPosition === 'left') ? `
:root.hs-prepaint-active #channel-chatroom > *:not(#hs-mc-container) {
  visibility: hidden !important;
}
` : ''}
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
