// Inject autocomplete-hook.js into MAIN world via early-inject-main.js
// "world": "MAIN" in manifest doesn't work reliably, so we use postMessage
// to early-inject-main.js (confirmed MAIN world) which creates the <script> tag.
(function() {
  'use strict'
  const url = chrome.runtime.getURL('autocomplete-hook.js')
  window.postMessage({ type: 'heatsync-inject-script', url }, location.origin)
})()
