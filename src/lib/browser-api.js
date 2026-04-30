/**
 * Unified browser API wrapper for Chrome/Firefox compatibility.
 * Handles chrome.* vs browser.* API differences.
 *
 * Usage:
 *   import { api } from './lib/browser-api.js'
 *
 *   // Storage
 *   await api.storage.local.get('key')
 *   await api.storage.local.set({ key: value })
 *
 *   // Runtime messaging
 *   api.runtime.sendMessage({ type: 'foo' })
 *   api.runtime.onMessage.addListener(handler)
 */

// Detect browser environment
const isFirefox = typeof browser !== 'undefined'
const isChrome = typeof chrome !== 'undefined' && !isFirefox

// Get the raw API object
const rawApi = isFirefox ? browser : (typeof chrome !== 'undefined' ? chrome : null)

let _ctxInvalidatedLogged = false

/**
 * Promisify Chrome callback-based APIs
 * Firefox's browser.* APIs are already Promise-based
 */
function promisify(fn) {
  if (isFirefox) return fn // Already returns promises

  return function(...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (result) => {
        if (rawApi?.runtime?.lastError) {
          reject(new Error(rawApi.runtime.lastError.message))
        } else {
          resolve(result)
        }
      })
    })
  }
}

/**
 * Storage API wrapper
 */
const storage = {
  local: {
    get: async (keys) => {
      if (!rawApi?.storage?.local) {
        console.warn('[heatsync] Storage API not available')
        return {}
      }
      if (isFirefox) {
        return rawApi.storage.local.get(keys)
      }
      return promisify(rawApi.storage.local.get.bind(rawApi.storage.local))(keys)
    },
    set: async (items) => {
      if (!rawApi?.storage?.local) {
        console.warn('[heatsync] Storage API not available')
        return
      }
      if (isFirefox) {
        return rawApi.storage.local.set(items)
      }
      return promisify(rawApi.storage.local.set.bind(rawApi.storage.local))(items)
    },
    remove: async (keys) => {
      if (!rawApi?.storage?.local) return
      if (isFirefox) {
        return rawApi.storage.local.remove(keys)
      }
      return promisify(rawApi.storage.local.remove.bind(rawApi.storage.local))(keys)
    },
    clear: async () => {
      if (!rawApi?.storage?.local) return
      if (isFirefox) {
        return rawApi.storage.local.clear()
      }
      return promisify(rawApi.storage.local.clear.bind(rawApi.storage.local))()
    }
  },
  sync: {
    get: async (keys) => {
      if (!rawApi?.storage?.sync) return {}
      if (isFirefox) {
        return rawApi.storage.sync.get(keys)
      }
      return promisify(rawApi.storage.sync.get.bind(rawApi.storage.sync))(keys)
    },
    set: async (items) => {
      if (!rawApi?.storage?.sync) return
      if (isFirefox) {
        return rawApi.storage.sync.set(items)
      }
      return promisify(rawApi.storage.sync.set.bind(rawApi.storage.sync))(items)
    }
  },
  onChanged: {
    addListener: (callback) => {
      if (rawApi?.storage?.onChanged) {
        rawApi.storage.onChanged.addListener(callback)
      }
    },
    removeListener: (callback) => {
      if (rawApi?.storage?.onChanged) {
        rawApi.storage.onChanged.removeListener(callback)
      }
    }
  }
}

/**
 * Runtime API wrapper
 */
const runtime = {
  sendMessage: async (message) => {
    if (!rawApi?.runtime?.sendMessage) {
      console.warn('[heatsync] Runtime API not available')
      return null
    }
    try {
      if (isFirefox) {
        return await rawApi.runtime.sendMessage(message)
      }
      return promisify(rawApi.runtime.sendMessage.bind(rawApi.runtime))(message)
    } catch (err) {
      // Extension context invalidated (common during updates) — log once per session
      if (err.message?.includes('Extension context invalidated')) {
        if (!_ctxInvalidatedLogged) {
          _ctxInvalidatedLogged = true
          console.warn('[heatsync] Extension context invalidated')
        }
        return null
      }
      throw err
    }
  },
  onMessage: {
    addListener: (callback) => {
      if (rawApi?.runtime?.onMessage) {
        rawApi.runtime.onMessage.addListener(callback)
      }
    },
    removeListener: (callback) => {
      if (rawApi?.runtime?.onMessage) {
        rawApi.runtime.onMessage.removeListener(callback)
      }
    }
  },
  getURL: (path) => {
    if (rawApi?.runtime?.getURL) {
      return rawApi.runtime.getURL(path)
    }
    return path
  },
  get id() {
    return rawApi?.runtime?.id || 'heatsync-extension'
  },
  get lastError() {
    return rawApi?.runtime?.lastError
  }
}

/**
 * Tabs API wrapper (for background scripts)
 */
const tabs = {
  query: async (queryInfo) => {
    if (!rawApi?.tabs?.query) return []
    if (isFirefox) {
      return rawApi.tabs.query(queryInfo)
    }
    return promisify(rawApi.tabs.query.bind(rawApi.tabs))(queryInfo)
  },
  sendMessage: async (tabId, message) => {
    if (!rawApi?.tabs?.sendMessage) return null
    try {
      if (isFirefox) {
        return await rawApi.tabs.sendMessage(tabId, message)
      }
      return promisify(rawApi.tabs.sendMessage.bind(rawApi.tabs))(tabId, message)
    } catch (err) {
      // Tab may have closed
      return null
    }
  },
  create: async (createProperties) => {
    if (!rawApi?.tabs?.create) return null
    if (isFirefox) {
      return rawApi.tabs.create(createProperties)
    }
    return promisify(rawApi.tabs.create.bind(rawApi.tabs))(createProperties)
  }
}

/**
 * Check if extension context is valid
 */
function isContextValid() {
  try {
    return !!rawApi?.runtime?.id
  } catch (e) {
    return false
  }
}

/**
 * Get platform info
 */
const platform = {
  isFirefox,
  isChrome,
  manifestVersion: isFirefox ? 2 : 3,
  name: isFirefox ? 'firefox' : 'chrome'
}

// Export unified API
const api = {
  storage,
  runtime,
  tabs,
  platform,
  isContextValid,
  raw: rawApi
}

/**
 * i18n helper — wraps chrome.i18n.getMessage with optional manual locale override.
 * Override is read from storage key 'hs_ui_locale'; matching locale's messages.json
 * is fetched from the extension's _locales/ at boot. Until the fetch resolves,
 * t() falls back to the browser's default locale via chrome.i18n.
 */
const I18N_STORAGE_KEY = 'hs_ui_locale'
let _i18nOverride = null
let _i18nOverrideLocale = ''
let _i18nInitPromise = null

function _i18nApplyPlaceholders(messageObj, substitutions) {
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
  const ESC = ''
  message = message.split('$$').join(ESC)
  message = message.replace(/\$([A-Za-z0-9_@]+)\$/g, (match, name) => {
    const content = phLookup[name.toLowerCase()]
    if (content === undefined) return match
    return content.replace(/\$(\d+)/g, (_, n) => subsArr[parseInt(n, 10) - 1] ?? '')
  })
  message = message.replace(/\$(\d+)/g, (_, n) => subsArr[parseInt(n, 10) - 1] ?? '')
  message = message.split(ESC).join('$')
  return message
}

function t(key, substitutions) {
  if (!key) return ''
  if (key.startsWith('@@')) {
    try { return rawApi?.i18n?.getMessage(key, substitutions) || key } catch { return key }
  }
  if (_i18nOverride && _i18nOverride[key]) {
    const out = _i18nApplyPlaceholders(_i18nOverride[key], substitutions)
    if (out) return out
  }
  try { return rawApi?.i18n?.getMessage(key, substitutions) || key } catch { return key }
}

async function initI18n() {
  if (_i18nInitPromise) return _i18nInitPromise
  _i18nInitPromise = (async () => {
    try {
      const data = await storage.local.get(I18N_STORAGE_KEY)
      const loc = data?.[I18N_STORAGE_KEY]
      if (!loc) return
      const url = rawApi?.runtime?.getURL?.(`_locales/${loc}/messages.json`)
      if (!url) return
      const res = await fetch(url)
      if (!res.ok) return
      _i18nOverride = await res.json()
      _i18nOverrideLocale = loc
    } catch {}
  })()
  return _i18nInitPromise
}

function getI18nLocale() { return _i18nOverrideLocale }

const I18N_LOCALE_NAMES = {
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
  zh_TW: '繁體中文'
}

async function setI18nLocale(loc) {
  await storage.local.set({ [I18N_STORAGE_KEY]: loc || '' })
  _i18nOverride = null
  _i18nOverrideLocale = ''
  _i18nInitPromise = null
  await initI18n()
}
function bidiDir() {
  if (_i18nOverrideLocale) {
    const rtl = ['ar', 'he', 'fa', 'ur']
    return rtl.includes(_i18nOverrideLocale.toLowerCase().split('_')[0]) ? 'rtl' : 'ltr'
  }
  try { return rawApi?.i18n?.getMessage('@@bidi_dir') || 'ltr' } catch { return 'ltr' }
}

// Kick off override load eagerly so content scripts pick it up before panel renders
try { initI18n() } catch {}

function hydrateI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]'))
    el.textContent = t(el.dataset.i18n) || el.textContent
  for (const el of root.querySelectorAll('[data-i18n-placeholder]'))
    el.placeholder = t(el.dataset.i18nPlaceholder) || el.placeholder
  for (const el of root.querySelectorAll('[data-i18n-title]'))
    el.title = t(el.dataset.i18nTitle) || el.title
}

// Global export for non-module scripts
if (typeof window !== 'undefined') {
  window.heatsyncApi = api
}

export { api, storage, runtime, tabs, platform, isContextValid, t, hydrateI18n, initI18n, getI18nLocale, setI18nLocale, bidiDir, I18N_LOCALE_NAMES }
export default api
