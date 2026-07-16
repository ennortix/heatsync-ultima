// Styles - all CSS for multichat panel, tabs, messages, modals

// ============================================
// STYLES (injected once)
// ============================================

function injectStyles() {
  if (document.getElementById('hs-mc-styles')) return

  const style = document.createElement('style')
  style.id = 'hs-mc-styles'
  const css = '__HS_STYLES_BUNDLE__'
  const cozetteUrl =
    typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('fonts/CozetteVector.woff2') : ''
  style.textContent = css.replace(/__HS_FONT_COZETTE__/g, cozetteUrl)
  document.head.appendChild(cleanup.trackNode(style))
  // Default to bitmap-mode on style inject — Cozette is the default font.
  // applyFontSettings() flips this off if the user picked a non-bitmap font.
  // Set here so tabs render crisp even before the async settings load fires
  // (settings hydration races with container mount; bare default prevents
  // the brief AA-on flash).
  document.body.classList.add('hs-font-bitmap')
  document.documentElement.classList.add('hs-font-bitmap')
}
