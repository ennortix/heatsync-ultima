function t(k) {
  if (window.hsI18n) return window.hsI18n.t(k)
  try {
    return chrome.i18n.getMessage(k) || k
  } catch {
    return k
  }
}
;(async () => {
  if (window.hsI18n) await window.hsI18n.init()
  document.documentElement.dir = window.hsI18n ? window.hsI18n.bidiDir() : t('@@bidi_dir')
  if (window.hsI18n) {
    window.hsI18n.hydrate(document)
  } else {
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n) || el.textContent
  }
  document.title = t('welcome_title')
})()

// Deep-link the CTA to the hottest live twitch/kick channel instead of the
// twitch front page — click → busy chat → emotes render → wow, no browsing
// step in between. Fail path: /api/live/top failing or coming back empty
// used to silently keep the default href (twitch.tv's front page) while the
// copy still implied a specific stream was picked — reinstating the exact
// "browse for a stream" step this CTA exists to remove. Swap to honest copy
// instead so the CTA never over-promises.
;(async () => {
  const cta = document.querySelector('.cta[data-when="out"]')
  try {
    const res = await fetch('https://heatsync.org/api/live/top?limit=50')
    if (!res.ok) throw new Error('live/top not ok')
    const { streams } = await res.json()
    const usable = (streams || []).filter(
      (x) => (x?.platform === 'twitch' || x?.platform === 'kick') && /^[a-zA-Z0-9_]{2,32}$/.test(x?.username || ''),
    )
    // Prefer a simulcaster (≥2 platforms) so the first click demos the
    // multichat weave, not just emotes; hottest single-platform otherwise.
    const s = usable.find((x) => Object.keys(x?.platformUsernames || {}).length >= 2) || usable[0]
    if (!s) throw new Error('no live streams')
    if (!cta) return
    cta.href = s.platform === 'kick' ? `https://kick.com/${s.username}` : `https://www.twitch.tv/${s.username}`
    const label = t('welcome_cta_live')
    cta.textContent = `${label === 'welcome_cta_live' ? 'watch live' : label} → ${s.username}`
  } catch {
    if (cta) cta.textContent = t('welcome_cta_fallback')
  }
})()

// Live success state: the moment oauth completes (in the tab we open), the
// background script writes auth_token_encrypted to storage.local. Swap the
// sign-in elements for the "you're in + next action" block so this tab closes
// the loop instead of sitting stale. Fail-safe: if storage is unavailable we
// never hide the CTA, so the logged-out path always works.
;(() => {
  const KEY = 'auth_token_encrypted'
  const api = typeof browser !== 'undefined' && browser.storage ? browser : chrome
  if (!api?.storage?.local) return
  const render = (loggedIn) => {
    for (const el of document.querySelectorAll('[data-when]')) el.hidden = (el.dataset.when === 'in') !== !!loggedIn
  }
  api.storage.local
    .get(KEY)
    .then((o) => render(!!o[KEY]))
    .catch(() => {})
  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && KEY in changes) render(!!changes[KEY].newValue)
  })
})()
