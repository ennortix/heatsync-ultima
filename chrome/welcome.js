function t(k) {
  if (window.hsI18n) return window.hsI18n.t(k)
  try { return chrome.i18n.getMessage(k) || k } catch { return k }
}
;(async () => {
  if (window.hsI18n) await window.hsI18n.init()
  document.documentElement.dir = (window.hsI18n ? window.hsI18n.bidiDir() : t('@@bidi_dir'))
  if (window.hsI18n) {
    window.hsI18n.hydrate(document)
  } else {
    for (const el of document.querySelectorAll('[data-i18n]'))
      el.textContent = t(el.dataset.i18n) || el.textContent
  }
  document.title = t('welcome_title')
})()
