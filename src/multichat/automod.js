// Automod - client-side filter applied before pushing to buffers

let automodAllCaps = false
let automodCompiled = null

function compileAutomod(rawSettings) {
  automodAllCaps = !!rawSettings?.automodAllCaps
  const raw = (rawSettings?.automodRegex || '').trim()
  if (!raw) { automodCompiled = null; return }
  const patterns = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (patterns.length === 0) { automodCompiled = null; return }
  try {
    automodCompiled = new RegExp(patterns.join('|'), 'i')
  } catch (e) {
    const esc = patterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    try { automodCompiled = new RegExp(esc, 'i') } catch { automodCompiled = null }
  }
}

async function loadAutomodSettings() {
  try {
    const stored = await chrome.storage.sync.get(['ui_settings'])
    compileAutomod(stored.ui_settings || {})
  } catch {}
}

function shouldAutomod(text) {
  if (!text) return false
  if (automodCompiled && automodCompiled.test(text)) return true
  if (automodAllCaps && text.length > 10) {
    const letters = text.replace(/[^A-Za-z]/g, '')
    if (letters.length >= 8) {
      const upper = letters.replace(/[^A-Z]/g, '').length
      if (upper / letters.length > 0.7) return true
    }
  }
  return false
}
