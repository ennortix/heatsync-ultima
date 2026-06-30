import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Lock HeatSync's #1 differentiator: ZERO third-party telemetry/analytics in the
// shipped extension. If anyone ever imports Sentry/PostHog/GA/etc. or hits a
// known tracker endpoint, this fails loud. Privacy is the wedge — every rival
// phones home (bttv ships Sentry on-by-default, ffz self-hosted Sentry, 7tv
// presence-tracks every channel switch). We are the only one that doesn't.

// Precise third-party tracker signatures — specific enough not to match
// incidental words (e.g. 'amplitude.com' not bare 'amplitude', 'heap.io' not
// 'heap'). Keep these as exact SDK/endpoint fingerprints.
const TRACKER_PATTERNS = [
  /@sentry\b/i,
  /sentry\.io/i,
  /posthog/i,
  /mixpanel/i,
  /amplitude\.com/i,
  /google-analytics/i,
  /googletagmanager/i,
  /\bgtag\s*\(/i,
  /datadoghq/i,
  /fullstory/i,
  /hotjar/i,
  /heap\.io/i,
  /segment\.(com|io)/i,
  /\/collect\?/i,
  /\bga\s*\(\s*['"](create|send)\b/i,
]

// Source of truth for ext logic. chrome/*.js glue scripts are scanned explicitly
// (the built multichat-*.js bundles derive from src/, already covered).
const SRC_ROOT = 'src'
const CHROME_GLUE = ['chrome/content.js', 'chrome/background.js', 'chrome/early-inject-main.js']

function jsFiles(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...jsFiles(p))
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

const files = [...jsFiles(SRC_ROOT), ...CHROME_GLUE]

test('extension source ships zero third-party telemetry/analytics', () => {
  const offenders = []
  for (const f of files) {
    let src
    try {
      src = readFileSync(f, 'utf8')
    } catch {
      continue
    }
    for (const re of TRACKER_PATTERNS) {
      if (re.test(src)) offenders.push(`${f} :: matched ${re}`)
    }
  }
  expect(offenders).toEqual([])
})

// Guard against the glob silently going empty (e.g. a refactor moving src/),
// which would make the scan above vacuously pass and disable the privacy lock.
test('telemetry scan actually covered the source tree', () => {
  expect(files.length).toBeGreaterThan(20)
})
