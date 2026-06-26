#!/usr/bin/env bun

/**
 * Heatsync Extension Build Script
 *
 * Builds Chrome and Firefox versions from unified source.
 * - Bundles lib/ modules into content scripts
 * - Handles manifest differences (MV2 vs MV3)
 * - Copies assets
 *
 * Usage:
 *   bun run build.js                    # Build both
 *   bun run build.js chrome             # Chrome only
 *   bun run build.js --package          # Build + zip
 *   bun run build.js --deploy           # Build + zip + rsync to server
 */

import { execFileSync, execSync } from 'child_process'
import { transformSync } from 'esbuild'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// ── Pre-build guards ──────────────────────────────────────────────────────────
// All four checks run before any bundling and fail the build loudly on violation.

// Guard 1: version must match across package.json, chrome manifest, firefox manifest.
function checkVersionSync() {
  const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))
  const chrome = JSON.parse(readFileSync(join(__dirname, 'src', 'manifests', 'chrome.json'), 'utf8'))
  const firefox = JSON.parse(readFileSync(join(__dirname, 'src', 'manifests', 'firefox.json'), 'utf8'))
  const [pv, cv, fv] = [pkg.version, chrome.version, firefox.version]
  if (pv !== cv || pv !== fv) {
    throw new Error(`version mismatch: package.json=${pv} chrome=${cv} firefox=${fv}`)
  }
  console.log(`  Version sync: ${pv} ✓`)
}

// Guard 2: host permissions and content_scripts coverage must match between manifests.
// Intentional MV2/MV3 structural differences allowed: background service_worker vs scripts,
// action vs browser_action, web_accessible_resources format, and firefox-only
// webRequest/webRequestBlocking.
function checkManifestParity() {
  const chrome = JSON.parse(readFileSync(join(__dirname, 'src', 'manifests', 'chrome.json'), 'utf8'))
  const firefox = JSON.parse(readFileSync(join(__dirname, 'src', 'manifests', 'firefox.json'), 'utf8'))

  // --- host permissions ---
  // Chrome MV3: split into host_permissions[]. Firefox MV2: folded into permissions[].
  // Firefox-only non-host perms (webRequest/webRequestBlocking) are intentional — allow them.
  const FIREFOX_ONLY_PERMS = new Set(['webRequest', 'webRequestBlocking'])
  const URL_PATTERN = /^https?:\/\//

  const chromeHosts = new Set([
    ...(chrome.host_permissions || []),
    ...(chrome.permissions || []).filter((p) => URL_PATTERN.test(p)),
  ])
  const firefoxHosts = new Set(
    (firefox.permissions || []).filter((p) => URL_PATTERN.test(p) && !FIREFOX_ONLY_PERMS.has(p)),
  )

  const onlyInChrome = [...chromeHosts].filter((h) => !firefoxHosts.has(h))
  const onlyInFirefox = [...firefoxHosts].filter((h) => !chromeHosts.has(h))
  if (onlyInChrome.length || onlyInFirefox.length) {
    const lines = []
    if (onlyInChrome.length) lines.push(`  chrome-only: ${onlyInChrome.join(', ')}`)
    if (onlyInFirefox.length) lines.push(`  firefox-only: ${onlyInFirefox.join(', ')}`)
    throw new Error(`manifest host_permissions diverge:\n${lines.join('\n')}`)
  }

  // --- content_scripts coverage ---
  // Canonicalize: sort each entry by sorted(matches)+sorted(js) key, then compare.
  // Order-independent set comparison — only js+matches coverage matters, not ordering.
  function csKey(entry) {
    const matches = [...(entry.matches || [])].sort().join('|')
    const js = [...(entry.js || [])].sort().join('|')
    return `${matches}::${js}`
  }

  const chromeKeys = new Set((chrome.content_scripts || []).map(csKey))
  const firefoxKeys = new Set((firefox.content_scripts || []).map(csKey))

  const onlyInChromeCS = [...chromeKeys].filter((k) => !firefoxKeys.has(k))
  const onlyInFirefoxCS = [...firefoxKeys].filter((k) => !chromeKeys.has(k))
  if (onlyInChromeCS.length || onlyInFirefoxCS.length) {
    const lines = []
    if (onlyInChromeCS.length) lines.push(`  chrome-only entries:\n    ${onlyInChromeCS.join('\n    ')}`)
    if (onlyInFirefoxCS.length) lines.push(`  firefox-only entries:\n    ${onlyInFirefoxCS.join('\n    ')}`)
    throw new Error(`manifest content_scripts diverge:\n${lines.join('\n')}`)
  }

  console.log(`  Manifest parity: ${chromeHosts.size} host perms, ${chromeKeys.size} content_script entries ✓`)
}

// Guard 3: catch top-level name collisions between src/lib (outer IIFE scope)
// and src/multichat (nested block scope). const/let collisions are hard JS errors;
// function/var collisions shadow silently — warn loudly.
//
// NOTE: this is a regex-based parser. It only matches column-0 declarations so
// it works correctly for this codebase's flat style, but would miss declarations
// inside nested blocks, object literals, or continuation lines. It's a fast
// sanity check, not a full AST parse.
//
// Intentional shadows:
//   'log' — utils.js (lib, outer IIFE) declares `function log` for lib-internal use;
//            bootstrap.js (multichat, inner block) redeclares `function log` as the
//            multichat-specific logger. The inner block scope means no JS SyntaxError,
//            and the inner one takes precedence inside the block — intentional.
const SCOPE_COLLISION_ALLOWLIST = new Set(['log'])

function checkScopeCollisions() {
  const DECL_RE = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/
  const LIB_FILES = [
    'error-reporter.js',
    'config.js',
    'cleanup.js',
    'utils.js',
    'settings-schema.js',
    'browser-api.js',
    'modifiers.js',
    'undo-manager.js',
  ]
  const libDir = join(__dirname, 'src', 'lib')
  const mcDir = join(__dirname, 'src', 'multichat')

  // Map name → declaration kind ('const'|'let'|'var'|'function'|'class') for each layer
  function extractDecls(dir, files) {
    const map = new Map() // name → kind
    const KIND_RE = /^(?:export\s+)?(?:(async)\s+)?(function|const|let|var|class)\s+([A-Za-z0-9_$]+)/
    for (const file of files) {
      const p = join(dir, file)
      if (!existsSync(p)) continue
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = KIND_RE.exec(line)
        if (!m) continue
        const kind = m[1] === 'async' ? 'function' : m[2]
        const name = m[3]
        if (!map.has(name)) map.set(name, kind)
      }
    }
    return map
  }

  // multichat layer: all MULTICHAT_MODULES + main.js
  const mcFiles = [...MULTICHAT_MODULES, 'main.js']
  const libDecls = extractDecls(libDir, LIB_FILES)
  const mcDecls = extractDecls(mcDir, mcFiles)

  let hardErrors = 0
  for (const [name, mcKind] of mcDecls) {
    if (!libDecls.has(name)) continue
    if (SCOPE_COLLISION_ALLOWLIST.has(name)) continue
    const libKind = libDecls.get(name)
    const isHard = (mcKind === 'const' || mcKind === 'let') && (libKind === 'const' || libKind === 'let')
    if (isHard) {
      console.error(`  x scope collision (SyntaxError): '${name}' is ${libKind} in lib and ${mcKind} in multichat`)
      hardErrors++
    } else {
      console.warn(
        `  warn: scope shadow: '${name}' is ${libKind} in lib, ${mcKind} in multichat (function/var — JS allows, but check intent)`,
      )
    }
  }
  if (hardErrors > 0) {
    throw new Error(`checkScopeCollisions: ${hardErrors} const/let collision(s) would cause SyntaxError at runtime`)
  }
  console.log(`  Scope collisions: none (allowlist: ${[...SCOPE_COLLISION_ALLOWLIST].join(', ')}) ✓`)
}

// Guard 4: run the test suite before bundling.
// Skippable with --no-test for fast iterative rebuilds.
// Always forced on --package and --deploy.
//
// Pre-build gate: runs the unit suite (logic). tests/build.test.js validates
// dist OUTPUT and self-skips here (gated on HS_VERIFY_DIST) — it runs only in
// the post-build verification step below, against freshly built dist. That
// keeps this gate free of recursion and of stale-dist false failures.
function runTests(args) {
  const flags = new Set(args.filter((a) => a.startsWith('--')))
  const forceRun = flags.has('--package') || flags.has('--deploy')
  const skipTest = flags.has('--no-test') && !forceRun
  if (skipTest) {
    console.log('  Tests: skipped (--no-test)')
    return
  }
  console.log('  Running tests...')
  try {
    execFileSync('bun', ['test'], { stdio: 'inherit', cwd: __dirname })
  } catch (e) {
    throw new Error('runTests: test suite failed — fix before building')
  }
  console.log('  Tests: passed ✓')
}

// Guard 5: error reporter scrub-pattern parity.
// background.js inlines a copy of the scrub logic from src/lib/error-reporter.js
// (service workers can't import lib/ modules). This guard compares the two
// canonical patterns — SENSITIVE_PARAMS and TEXT_SCRUB — so a token-format
// change in error-reporter.js that isn't mirrored in background.js fails loud.
function checkErrorReporterParity() {
  const bgSrc = readFileSync(join(__dirname, 'chrome', 'background.js'), 'utf8')
  const erSrc = readFileSync(join(__dirname, 'src', 'lib', 'error-reporter.js'), 'utf8')

  // Extract the SENSITIVE_PARAMS regex body (between outer slashes, before /i)
  function sensitiveParams(src) {
    const m = src.match(/SENSITIVE_PARAMS\s*=\s*\n?\s*\/([\s\S]+?)\/i\b/)
    return m ? m[1] : null
  }

  // Extract TEXT_SCRUB array body with bracket-depth tracking so nested
  // character classes (e.g. [A-Za-z0-9_\-+/=]) don't prematurely end the match.
  function textScrubBody(src) {
    const idx = src.search(/TEXT_SCRUB\s*=\s*\[/)
    if (idx === -1) return null
    const open = src.indexOf('[', idx)
    let depth = 0
    for (let i = open; i < src.length; i++) {
      if (src[i] === '[') depth++
      else if (src[i] === ']') {
        depth--
        if (depth === 0) return src.slice(open + 1, i).replace(/\s+/g, ' ').trim()
      }
    }
    return null
  }

  const bgSP = sensitiveParams(bgSrc)
  const erSP = sensitiveParams(erSrc)
  const bgTS = textScrubBody(bgSrc)
  const erTS = textScrubBody(erSrc)

  if (!bgSP || !erSP)
    throw new Error(
      'checkErrorReporterParity: could not extract SENSITIVE_PARAMS from background.js or error-reporter.js',
    )
  if (!bgTS || !erTS)
    throw new Error(
      'checkErrorReporterParity: could not extract TEXT_SCRUB from background.js or error-reporter.js',
    )
  if (bgSP !== erSP)
    throw new Error(
      `checkErrorReporterParity: SENSITIVE_PARAMS drift detected\n  background.js: ${bgSP.slice(0, 80)}\n  error-reporter.js: ${erSP.slice(0, 80)}`,
    )
  if (bgTS !== erTS)
    throw new Error(
      `checkErrorReporterParity: TEXT_SCRUB drift detected\n  background.js: ${bgTS.slice(0, 120)}\n  error-reporter.js: ${erTS.slice(0, 120)}`,
    )

  console.log('  Error reporter parity: scrub patterns match ✓')
}

const __dirname = dirname(fileURLToPath(import.meta.url))

const SRC_DIR = join(__dirname, 'src')
const CHROME_OUT = join(__dirname, 'dist', 'chrome')
const FIREFOX_OUT = join(__dirname, 'dist', 'firefox')

// Files that need lib bundled in (content scripts)
const CONTENT_SCRIPTS = [
  'content.js',
  'multichat.js',
  'heatsync-button.js',
  'autocomplete-hook.js',
  'chat-injector.js',
  'youtube-content.js',
]

// Files to copy as-is (no lib bundling needed)
const COPY_FILES = [
  'background.js',
  'popup.js',
  'popup.html',
  'early-inject-main.js',
  'kick-nav-watcher.js',
  'youtube-keyboard-guard.js',
  'platform-detector.js',
  'shared-utils.js',
  'emoji-data.js',
  'welcome.html',
  'welcome.js',
  'injected-message.css',
  'vi-mode.js',
  'kick-autocomplete-hook.js',
  'pcard-early.js',
  'early-layout.js',
  'i18n-override.js',
]

// Assets (images, etc)
const ASSETS = ['icon-16.png', 'icon-48.png', 'icon-96.png', 'icon-128.png', 'icon-48-black.png', 'COGGERS-1x.webp']

// Strip ES module syntax from bundled files
function stripExports(content) {
  return content
    .replace(/^export\s+default\s+\w+\s*;?\s*$/gm, '')
    .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
    .replace(/^export\s+(const|let|var|function|class)\s+/gm, '$1 ')
}

// Read lib files
function readLib() {
  const libDir = join(SRC_DIR, 'lib')
  const files = [
    'error-reporter.js',
    'config.js',
    'cleanup.js',
    'utils.js',
    'settings-schema.js',
    'browser-api.js',
    'modifiers.js',
    'undo-manager.js',
  ]
  let combined = '// === HEATSYNC LIB (auto-bundled) ===\n'

  for (const file of files) {
    const content = readFileSync(join(libDir, file), 'utf8')
    combined += `\n// --- ${file} ---\n${stripExports(content)}\n`
  }

  combined += '// === END HEATSYNC LIB ===\n\n'
  return combined
}

// Read multichat module files (only bundled into multichat.js)
const MULTICHAT_MODULES = [
  'bootstrap.js',
  'notifs.js',
  'styles.js',
  'seen-state.js',
  'automod.js',
  'stream-stats.js',
  'mentions.js',
  'irc.js',
  'native-tap.js',
  'auth-irc.js',
  'kick-send.js',
  'emotes.js',
  'tooltips.js',
  'twitch-api.js',
  'feed-embed.js',
  'social.js',
  'whispers.js',
  'eventsub-whispers.js',
  'cross-follow.js',
  'input.js',
  'profile-card.js',
  'chat-logs.js',
]

function readMultichatModules() {
  const mcDir = join(SRC_DIR, 'multichat')
  const chromeDir = join(__dirname, 'chrome')
  let combined = '// === MULTICHAT MODULES (auto-bundled) ===\n'

  // Bundle emoji-data inside IIFE so it's always available regardless of content script load order
  const emojiDataPath = join(chromeDir, 'emoji-data.js')
  if (existsSync(emojiDataPath)) {
    combined += `\n// --- emoji-data.js ---\n${readFileSync(emojiDataPath, 'utf8')}\n`
  }

  for (const file of MULTICHAT_MODULES) {
    const filePath = join(mcDir, file)
    if (!existsSync(filePath)) continue
    let content = readFileSync(filePath, 'utf8')
    // styles.js holds no CSS — it's split into src/multichat/styles/*.css
    // fragments (so a stray backtick in a CSS comment can't silently terminate
    // the literal and break the bundle, as it killed v1.3.7). Concatenate the
    // fragments in filename order and re-embed as the css template literal here.
    if (file === 'styles.js') {
      const stylesDir = join(mcDir, 'styles')
      const cssFrags = readdirSync(stylesDir)
        .filter((f) => f.endsWith('.css'))
        .sort()
      if (!cssFrags.length) throw new Error('build: src/multichat/styles/ has no .css fragments')
      const cssBody = cssFrags.map((f) => readFileSync(join(stylesDir, f), 'utf8')).join('')
      if (cssBody.includes('`') || cssBody.includes('${')) {
        throw new Error(
          'build: a styles/*.css fragment contains a backtick or ${ — unsafe to embed in the css template literal',
        )
      }
      if (!content.includes("'__HS_STYLES_BUNDLE__'")) {
        throw new Error('build: styles.js missing __HS_STYLES_BUNDLE__ placeholder')
      }
      // function replacement avoids $-pattern interpretation in the CSS
      content = content.replace("'__HS_STYLES_BUNDLE__'", () => '`' + cssBody + '`')
    }
    combined += `\n// --- multichat/${file} ---\n${stripExports(content)}\n`
  }

  combined += '// === END MULTICHAT MODULES ===\n\n'
  return combined
}

// Inject lib at top of content script
// Lib goes at IIFE scope, original content gets a nested block scope
// so const/let declarations (DEBUG, cleanup, etc.) don't conflict
function bundleContentScript(srcPath, lib, mcModules) {
  let content = readFileSync(srcPath, 'utf8')

  // Check if already has lib bundled (from previous build of src file)
  if (content.includes('=== HEATSYNC LIB')) {
    content = content.replace(/\/\/ === HEATSYNC LIB[\s\S]*?\/\/ === END HEATSYNC LIB ===\n\n/, '')
  }
  if (content.includes('=== MULTICHAT MODULES')) {
    content = content.replace(/\/\/ === MULTICHAT MODULES[\s\S]*?\/\/ === END MULTICHAT MODULES ===\n\n/, '')
  }

  // Strip existing IIFE wrapper so we can rebuild cleanly
  // Strip leading block comments before checking for IIFE
  let body = content
  const stripped = content.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '').trim()
  if (stripped.startsWith('(function()') || stripped.startsWith('(() =>')) {
    // Remove opening: optional block comment + (function() { 'use strict';
    body = content.replace(/^[\s\S]*?\((?:function\s*\(\)|(?:\(\)\s*=>))\s*\{[\s\n]*(?:'use strict';?\s*)?/, '')
    // Remove closing: })();
    body = body.replace(/\}\s*\)\s*\(\s*\)\s*;?\s*$/, '')
  }

  // Build: IIFE > lib at outer scope > content in block scope
  // Multichat modules go before body: bootstrap.js declares cleanup/log first,
  // then modules declare their state + functions, then body has state + init()
  const modules = mcModules ? `${mcModules}\n` : ''
  // Cheer-popup short-circuit: if this window was opened by heatsync's cheer
  // launcher (via window.open with name 'hs-cheer-<channel>'), skip ALL
  // heatsync content scripts so the popup runs pure twitch — chat, gem icon,
  // cheer modal all work in their native UI without heatsync's overlay
  // covering anything. Cheermote echoes still arrive in the MAIN tab's
  // multichat through the IRC stream, so renderer still fires there.
  const cheerPopupGuard = `if (typeof window !== 'undefined' && typeof window.name === 'string' && window.name.indexOf('hs-cheer-') === 0) return;`
  return `(function() {\n'use strict';\n${cheerPopupGuard}\n\n${lib}\n{\n${modules}${body}\n}\n})();`
}

// Build for a specific browser
function build(browser) {
  const outDir = browser === 'chrome' ? CHROME_OUT : FIREFOX_OUT
  const manifestSrc = join(SRC_DIR, 'manifests', `${browser}.json`)

  // Clean and create output dir
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true })
  }
  mkdirSync(outDir, { recursive: true })

  // Use Chrome source as base (it has the latest fixes)
  const chromeDir = join(__dirname, 'chrome')

  // Read lib
  const lib = readLib()
  const mcModules = readMultichatModules()

  // Bundle content scripts
  for (const file of CONTENT_SCRIPTS) {
    // multichat.js source lives in src/multichat/main.js (chrome/multichat.js is build output)
    const srcPath = file === 'multichat.js' ? join(SRC_DIR, 'multichat', 'main.js') : join(chromeDir, file)
    if (!existsSync(srcPath)) {
      console.log(`  Skip ${file} (not found)`)
      continue
    }
    const modules = file === 'multichat.js' ? mcModules : null
    const bundled = bundleContentScript(srcPath, lib, modules)
    writeFileSync(join(outDir, file), bundled)
    // Also write to chrome/ so unpacked extension loads the bundled version
    if (file === 'multichat.js') {
      writeFileSync(join(chromeDir, file), bundled)
    }
    console.log(`  Bundled ${file}`)
  }

  // Copy other files
  for (const file of COPY_FILES) {
    const srcPath = join(chromeDir, file)
    if (!existsSync(srcPath)) continue
    cpSync(srcPath, join(outDir, file))
  }
  console.log(`  Copied ${COPY_FILES.filter((f) => existsSync(join(chromeDir, f))).length} files`)

  // Copy assets
  for (const file of ASSETS) {
    const srcPath = join(chromeDir, file)
    if (!existsSync(srcPath)) continue
    cpSync(srcPath, join(outDir, file))
  }
  console.log(`  Copied ${ASSETS.length} assets`)

  // Copy manifest
  cpSync(manifestSrc, join(outDir, 'manifest.json'))
  // Also write to chrome/ so unpacked extension loads the updated manifest
  if (browser === 'chrome') {
    cpSync(manifestSrc, join(__dirname, 'chrome', 'manifest.json'))
  }
  console.log(`  Copied manifest (${browser})`)

  // Copy _locales
  const localesDir = join(SRC_DIR, '_locales')
  if (existsSync(localesDir)) {
    cpSync(localesDir, join(outDir, '_locales'), { recursive: true })
    cpSync(localesDir, join(chromeDir, '_locales'), { recursive: true })
    console.log(`  Copied _locales`)
  }

  // Copy fonts (bundled bitmap fonts: CozetteVector, GohuFont-14)
  const fontsDir = join(chromeDir, 'fonts')
  if (existsSync(fontsDir)) {
    cpSync(fontsDir, join(outDir, 'fonts'), { recursive: true })
    console.log(`  Copied fonts`)
  }

  console.log(`✓ Built ${browser} → ${outDir}`)
}

// Read version from chrome manifest (single source of truth)
function getVersion() {
  const manifest = JSON.parse(readFileSync(join(SRC_DIR, 'manifests', 'chrome.json'), 'utf8'))
  return manifest.version
}

// Run `node --check` over every JS file in the built output. Catches
// template-literal termination bugs (a CSS comment with a stray backtick
// killed v1.3.7 content.js silently). Hard-fails the build on first error.
function syntaxCheck(outDir, browser) {
  const files = readdirSync(outDir).filter((f) => f.endsWith('.js'))
  let failed = 0
  for (const f of files) {
    const p = join(outDir, f)
    try {
      execFileSync('node', ['--check', p], { stdio: 'pipe' })
    } catch (e) {
      failed++
      const stderr = (e.stderr || '').toString().split('\n').slice(0, 4).join('\n')
      console.error(`  x ${browser}/${f} parse error:\n${stderr}`)
    }
  }
  if (failed > 0) {
    throw new Error(`syntaxCheck: ${failed} file(s) failed to parse in ${browser} build`)
  }
  console.log(`  Syntax check: ${files.length} files clean`)
}

// Build a source zip suitable for AMO source-code review:
// - everything needed to reproduce the build (chrome/, src/, build.js, lockfile, package.json)
// - reviewer-facing docs (README, CHANGELOG, LICENSE, TESTER-GUIDE, etc.)
// - excludes generated multichat.js (regenerated from src/multichat/), dist/, node_modules/, .git/
function buildSourceZip() {
  const version = getVersion()
  const zipName = `heatsync-source-${version}.zip`
  const zipPath = join(__dirname, 'dist', zipName)
  if (existsSync(zipPath)) rmSync(zipPath)

  const include = [
    'chrome',
    'src',
    'build.js',
    'bun.lock',
    'package.json',
    'README.md',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'LICENSE',
    'SECURITY.md',
    'TESTER-GUIDE.md',
    'BACKEND-ASKS.md',
  ].filter((p) => existsSync(join(__dirname, p)))

  const excludes = ['chrome/multichat.js', 'dist/*', 'node_modules/*', '.git/*', '*/.DS_Store']
  const args = ['-rq', zipPath, ...include]
  for (const ex of excludes) args.push('-x', ex)
  execFileSync('zip', args, { cwd: __dirname, stdio: 'inherit' })
  console.log(`  ${zipName}`)
  return zipPath
}

// Zip a built extension directory
function packageBrowser(browser) {
  const version = getVersion()
  const outDir = browser === 'chrome' ? CHROME_OUT : FIREFOX_OUT
  const zipName = `heatsync-${browser}-${version}.zip`
  const zipPath = join(__dirname, 'dist', zipName)

  if (!existsSync(outDir)) {
    console.error(`  ✗ ${outDir} not found — build first`)
    process.exit(1)
  }

  // Remove old zip if exists
  if (existsSync(zipPath)) rmSync(zipPath)

  // Zip from inside the build dir so paths are relative
  execFileSync('zip', ['-r', zipPath, '.'], { cwd: outDir, stdio: 'inherit' })
  console.log(`  ${zipName}`)
  return zipPath
}

// Deploy zips to production server
function deploy() {
  const distDir = join(__dirname, 'dist')
  console.log('\nDeploying to server...')
  const zips = readdirSync(distDir)
    .filter((f) => f.startsWith('heatsync-') && f.endsWith('.zip'))
    .map((f) => join(distDir, f))
  if (zips.length === 0) {
    console.error('  no zips to deploy')
    return
  }
  execFileSync('rsync', ['-avz', '--chmod=F644,D755', ...zips, 'heatsync:/opt/heatsync/dist/downloads/'], {
    stdio: 'inherit',
  })
  console.log('Deployed')
}

// Minify a content script in place inside its dist dir.
// Preserves the IIFE wrapper; safe-mode flags so we don't break runtime semantics.
function minifyDistFile(outDir, file) {
  const path = join(outDir, file)
  if (!existsSync(path)) return
  const src = readFileSync(path, 'utf8')
  try {
    const result = transformSync(src, {
      loader: 'js',
      minify: true,
      target: 'es2020',
      legalComments: 'none',
      keepNames: true, // helps stack traces in prod
    })
    writeFileSync(path, result.code)
  } catch (e) {
    console.warn(`  ⚠ minify ${file} skipped: ${e.message?.split('\n')[0]}`)
  }
}

function minifyDist(outDir) {
  const targets = [...CONTENT_SCRIPTS, ...COPY_FILES.filter((f) => f.endsWith('.js'))]
  let bytesBefore = 0,
    bytesAfter = 0
  for (const f of targets) {
    const p = join(outDir, f)
    if (!existsSync(p)) continue
    bytesBefore += readFileSync(p).length
    minifyDistFile(outDir, f)
    bytesAfter += readFileSync(p).length
  }
  if (bytesBefore > 0) {
    const pct = ((1 - bytesAfter / bytesBefore) * 100).toFixed(1)
    console.log(
      `  Minified ${targets.length} files: ${(bytesBefore / 1024).toFixed(0)}KB → ${(bytesAfter / 1024).toFixed(0)}KB (${pct}% smaller)`,
    )
  }
}

// Main
const args = process.argv.slice(2)
const flags = new Set(args.filter((a) => a.startsWith('--')))
const targets = args.filter((a) => !a.startsWith('--'))
const target = targets[0] || null
const shouldPackage = flags.has('--package') || flags.has('--deploy')
const shouldDeploy = flags.has('--deploy')
const shouldMinify = flags.has('--minify') || shouldPackage || shouldDeploy
const shouldSource = flags.has('--source') || shouldPackage

console.log('Building heatsync extension...\n')

// ── Pre-build gate ────────────────────────────────────────────────────────────
console.log('Pre-build checks:')
checkVersionSync()
checkManifestParity()
checkScopeCollisions()
checkErrorReporterParity()
runTests(args)
console.log()

// Settings-registry lint — duplicate keys, invalid defaults, sync-quota
// budget, UI_SYNC_BLOCKLIST mismatches. Hard-fails before any bundling.
{
  const { SETTINGS, lintSettings } = await import('./src/lib/settings-schema.js')
  const { UI_SYNC_BLOCKLIST } = await import('./src/lib/utils.js')
  const problems = lintSettings(UI_SYNC_BLOCKLIST)
  if (problems.length) {
    for (const p of problems) console.error(`  x settings-schema: ${p}`)
    throw new Error(`settings-schema lint: ${problems.length} problem(s)`)
  }
  console.log(`Settings registry: ${SETTINGS.length} entries clean`)
}

if (!target || target === 'chrome') {
  console.log('Chrome:')
  build('chrome')
  if (shouldMinify) minifyDist(CHROME_OUT)
  syntaxCheck(CHROME_OUT, 'chrome')
}

if (!target || target === 'firefox') {
  console.log('\nFirefox:')
  build('firefox')
  if (shouldMinify) minifyDist(FIREFOX_OUT)
  syntaxCheck(FIREFOX_OUT, 'firefox')
}

if (shouldPackage) {
  console.log('\nPackaging:')
  if (!target || target === 'chrome') packageBrowser('chrome')
  if (!target || target === 'firefox') packageBrowser('firefox')
}

if (shouldSource) {
  console.log('\nSource zip:')
  buildSourceZip()
}

// ── Post-build verification ────────────────────────────────────────────────
// Validate the freshly built dist/ (required files, manifest fields, version
// sync, CSP). Runs only on a full both-target build and when tests aren't
// skipped — single-target builds leave the other dist stale, which would fail
// the cross-target assertions. Gated env var ensures tests/build.test.js runs
// ONLY here, against fresh output (never recursive, never on stale dist).
if (!target && !(flags.has('--no-test') && !shouldPackage)) {
  console.log('\nPost-build verification:')
  try {
    execFileSync('bun', ['test', 'tests/build.test.js'], {
      stdio: 'inherit',
      cwd: __dirname,
      env: { ...process.env, HS_VERIFY_DIST: '1' },
    })
  } catch (e) {
    throw new Error('post-build verification failed — dist output invalid')
  }
}

if (shouldDeploy) deploy()

console.log('\nDone!')
