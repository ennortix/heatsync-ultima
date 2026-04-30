function t(k) { try { return chrome.i18n.getMessage(k) || k } catch { return k } }
document.documentElement.dir = t('@@bidi_dir')
for (const el of document.querySelectorAll('[data-i18n]'))
  el.textContent = t(el.dataset.i18n) || el.textContent
document.title = t('welcome_title')
