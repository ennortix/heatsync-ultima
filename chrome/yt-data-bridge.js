// yt-data-bridge — MAIN world, live_chat frames only.
//
// YouTube's live-chat renderer elements bind the raw innertube JSON to a
// Polymer `.data` property. That is a page-world JS property: the ISOLATED
// world (youtube-content.js) gets its own wrapper and reads `el.data` as
// undefined — which silently killed everything keyed off the author's UC id
// (HeatSync native paints, google-id 7TV cosmetics, deletion author swap).
// This bridge runs in the page world and mirrors just the author channel id
// onto a DOM attribute, which DOES cross worlds.
//
// Polymer may bind `.data` after the node is inserted, so a missing read
// retries once shortly after.
;(() => {
  if (window.__hsYtDataBridge) return
  window.__hsYtDataBridge = 1

  const SEL = [
    'yt-live-chat-text-message-renderer',
    'yt-live-chat-paid-message-renderer',
    'yt-live-chat-paid-sticker-renderer',
    'yt-live-chat-membership-item-renderer',
    'yt-live-chat-sponsorships-gift-purchase-announcement-renderer',
  ].join(',')

  const stamp = (el, retried) => {
    try {
      if (el.hasAttribute('data-hs-author-id')) return
      const id = el.data?.authorExternalChannelId
      if (typeof id === 'string' && /^UC[\w-]{20,}$/i.test(id)) {
        el.setAttribute('data-hs-author-id', id)
      } else if (!retried) {
        setTimeout(() => stamp(el, true), 80)
      }
    } catch {}
  }

  const scan = (root) => {
    if (root.querySelectorAll) for (const el of root.querySelectorAll(SEL)) stamp(el)
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue
        if (n.matches && n.matches(SEL)) stamp(n)
        else scan(n)
      }
    }
  })

  const arm = () => {
    mo.observe(document.documentElement, { childList: true, subtree: true })
    scan(document)
  }
  if (document.documentElement) arm()
  else addEventListener('DOMContentLoaded', arm, { once: true })
})()
