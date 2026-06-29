#!/usr/bin/env bun
// version sync check — run as a script (not a test) so it works in CI
import chromeBuilt from '../chrome/manifest.json' with { type: 'json' }
import pkg from '../package.json' with { type: 'json' }
import chrome from '../src/manifests/chrome.json' with { type: 'json' }
import firefox from '../src/manifests/firefox.json' with { type: 'json' }

const { version } = pkg

console.log(`package.json: ${version}`)
console.log(`chrome manifest (src): ${chrome.version}`)
console.log(`chrome manifest (built): ${chromeBuilt.version}`)
console.log(`firefox manifest: ${firefox.version}`)

if (chrome.version !== version || firefox.version !== version || chromeBuilt.version !== version) {
  console.error(`version mismatch! expected ${version}`)
  process.exit(1)
}

console.log('versions in sync')
