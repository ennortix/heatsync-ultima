// HeatSync standalone i18n override
// Loads a manually-picked locale on top of chrome.i18n, exposes window.hsI18n.
// Used by extension pages: popup, options, welcome.
// Content scripts use src/lib/browser-api.js which mirrors this.
;(() => {
  const STORAGE_KEY = 'hs_ui_locale'

  const LOCALE_NAMES = {
    '': 'Auto (browser language)',
    ar: 'العربية',
    bg: 'Български',
    cs: 'Čeština',
    da: 'Dansk',
    de: 'Deutsch',
    el: 'Ελληνικά',
    en: 'English',
    es: 'Español',
    fi: 'Suomi',
    fr: 'Français',
    he: 'עברית',
    hi: 'हिन्दी',
    hu: 'Magyar',
    id: 'Bahasa Indonesia',
    it: 'Italiano',
    ja: '日本語',
    ko: '한국어',
    ms: 'Bahasa Melayu',
    nl: 'Nederlands',
    no: 'Norsk',
    pl: 'Polski',
    pt_BR: 'Português (Brasil)',
    pt_PT: 'Português (Portugal)',
    ro: 'Română',
    ru: 'Русский',
    sk: 'Slovenčina',
    sv: 'Svenska',
    th: 'ไทย',
    tl: 'Filipino',
    tr: 'Türkçe',
    uk: 'Українська',
    vi: 'Tiếng Việt',
    zh_CN: '简体中文',
    zh_TW: '繁體中文',
  }

  let override = null
  let overrideLocale = ''
  let initPromise = null

  const api = (typeof chrome !== 'undefined' && chrome) || (typeof browser !== 'undefined' && browser) || null

  function getStoredLocale() {
    return new Promise((resolve) => {
      try {
        api.storage.local.get(STORAGE_KEY, (data) => {
          resolve(data?.[STORAGE_KEY] || '')
        })
      } catch {
        resolve('')
      }
    })
  }

  function setStoredLocale(loc) {
    return new Promise((resolve) => {
      try {
        api.storage.local.set({ [STORAGE_KEY]: loc || '' }, () => resolve())
      } catch {
        resolve()
      }
    })
  }

  async function fetchLocale(loc) {
    if (!loc) return null
    try {
      const url = api.runtime.getURL(`_locales/${loc}/messages.json`)
      const res = await fetch(url)
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null
    }
  }

  // Replicates chrome.i18n placeholder substitution: $NAME$ -> placeholders[name].content
  // with $1/$2/... within content replaced from substitutions array. $$ escapes to literal $.
  function applyPlaceholders(messageObj, substitutions) {
    if (!messageObj) return ''
    let message = String(messageObj.message ?? messageObj)
    const placeholders = messageObj.placeholders || {}

    const phLookup = {}
    for (const [name, def] of Object.entries(placeholders)) {
      phLookup[name.toLowerCase()] = (def && def.content) || ''
    }

    let subsArr = []
    if (substitutions != null) {
      subsArr = Array.isArray(substitutions) ? substitutions : [substitutions]
    }

    message = message.replace(/\$\$/g, '')
    message = message.replace(/\$([A-Za-z0-9_@]+)\$/g, (match, name) => {
      const content = phLookup[name.toLowerCase()]
      if (content === undefined) return match
      return content.replace(/\$(\d+)/g, (_, n) => subsArr[parseInt(n, 10) - 1] ?? '')
    })
    message = message.replace(/\$(\d+)/g, (_, n) => subsArr[parseInt(n, 10) - 1] ?? '')
    message = message.replace(//g, '$')

    return message
  }

  function tBrowser(key, subs) {
    try {
      return api?.i18n?.getMessage(key, subs) || key
    } catch {
      return key
    }
  }

  function t(key, subs) {
    if (!key) return ''
    // @@bidi_dir, @@ui_locale, etc. — chrome predefined messages, always browser
    if (key.startsWith('@@')) return tBrowser(key, subs)
    if (override && override[key]) {
      const out = applyPlaceholders(override[key], subs)
      if (out) return out
    }
    return tBrowser(key, subs)
  }

  function hydrate(root) {
    root = root || document
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n) || el.textContent
    for (const el of root.querySelectorAll('[data-i18n-placeholder]'))
      el.placeholder = t(el.dataset.i18nPlaceholder) || el.placeholder
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle) || el.title
  }

  function bidiDir() {
    // If override set, infer dir from the locale; else ask chrome
    if (overrideLocale) {
      const rtl = ['ar', 'he', 'fa', 'ur']
      return rtl.includes(overrideLocale.toLowerCase().split('_')[0]) ? 'rtl' : 'ltr'
    }
    return tBrowser('@@bidi_dir') || 'ltr'
  }

  async function init() {
    if (initPromise) return initPromise
    initPromise = (async () => {
      overrideLocale = await getStoredLocale()
      if (!overrideLocale) {
        // chrome reports Filipino as fil but the catalog ships as tl, so chrome.i18n never matches it
        let ui = ''
        try {
          ui = api?.i18n?.getUILanguage() || ''
        } catch {}
        override = /^fil([-_]|$)/.test(ui) ? await fetchLocale('tl') : null
        return
      }
      const data = await fetchLocale(overrideLocale)
      if (data) override = data
      else overrideLocale = ''
    })()
    return initPromise
  }

  async function setLocale(loc) {
    await setStoredLocale(loc)
    initPromise = null
    override = null
    overrideLocale = ''
    await init()
    try {
      document.documentElement.dir = bidiDir()
    } catch {}
    try {
      window.dispatchEvent(new CustomEvent('hs:i18n-changed', { detail: { locale: loc } }))
    } catch {}
  }

  function getLocale() {
    return overrideLocale
  }
  function listLocales() {
    return Object.keys(LOCALE_NAMES)
  }
  function localeName(loc) {
    return LOCALE_NAMES[loc] ?? loc
  }

  window.hsI18n = {
    t,
    hydrate,
    init,
    bidiDir,
    setLocale,
    getLocale,
    listLocales,
    localeName,
    LOCALE_NAMES,
  }
})()
