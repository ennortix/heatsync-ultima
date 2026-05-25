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

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync, execFileSync } from 'child_process'
import { transformSync } from 'esbuild'

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
  'options.html',
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
const ASSETS = [
  'icon-16.png',
  'icon-48.png',
  'icon-96.png',
  'icon-128.png',
  'icon-48-black.png',
  'COGGERS-1x.webp',
]

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
  const files = ['error-reporter.js', 'config.js', 'cleanup.js', 'utils.js', 'browser-api.js', 'modifiers.js', 'undo-manager.js']
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
    const content = readFileSync(filePath, 'utf8')
    // styles.js wraps CSS in one template literal — stray backticks
    // (even in CSS comments) terminate it early. Sister files like
    // chrome/content.js have the same shape; comprehensive syntax check
    // runs over every output bundle in syntaxCheck() below.
    if (file === 'styles.js') {
      const tickCount = (content.match(/`/g) || []).length
      if (tickCount !== 2) {
        throw new Error(`build: styles.js must have exactly 2 backticks (template-literal delimiters); found ${tickCount}. CSS comments cannot contain backticks.`)
      }
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
    const srcPath = file === 'multichat.js'
      ? join(SRC_DIR, 'multichat', 'main.js')
      : join(chromeDir, file)
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
  console.log(`  Copied ${COPY_FILES.filter(f => existsSync(join(chromeDir, f))).length} files`)

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
  const files = readdirSync(outDir).filter(f => f.endsWith('.js'))
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
    'chrome', 'src', 'build.js', 'bun.lock', 'package.json',
    'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'LICENSE',
    'SECURITY.md', 'TESTER-GUIDE.md', 'BACKEND-ASKS.md',
  ].filter(p => existsSync(join(__dirname, p)))

  const excludes = [
    'chrome/multichat.js',
    'dist/*', 'node_modules/*', '.git/*', '*/.DS_Store',
  ]
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
  const zips = readdirSync(distDir).filter(f => f.startsWith('heatsync-') && f.endsWith('.zip')).map(f => join(distDir, f))
  if (zips.length === 0) {
    console.error('  no zips to deploy')
    return
  }
  execFileSync('rsync', ['-avz', '--chmod=F644,D755', ...zips, 'heatsync:/opt/heatsync/dist/downloads/'], { stdio: 'inherit' })
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
  const targets = [...CONTENT_SCRIPTS, ...COPY_FILES.filter(f => f.endsWith('.js'))]
  let bytesBefore = 0, bytesAfter = 0
  for (const f of targets) {
    const p = join(outDir, f)
    if (!existsSync(p)) continue
    bytesBefore += readFileSync(p).length
    minifyDistFile(outDir, f)
    bytesAfter += readFileSync(p).length
  }
  if (bytesBefore > 0) {
    const pct = ((1 - bytesAfter / bytesBefore) * 100).toFixed(1)
    console.log(`  Minified ${targets.length} files: ${(bytesBefore/1024).toFixed(0)}KB → ${(bytesAfter/1024).toFixed(0)}KB (${pct}% smaller)`)
  }
}

// Main
const args = process.argv.slice(2)
const flags = new Set(args.filter(a => a.startsWith('--')))
const targets = args.filter(a => !a.startsWith('--'))
const target = targets[0] || null
const shouldPackage = flags.has('--package') || flags.has('--deploy')
const shouldDeploy = flags.has('--deploy')
const shouldMinify = flags.has('--minify') || shouldPackage || shouldDeploy
const shouldSource = flags.has('--source') || shouldPackage

console.log('Building heatsync extension...\n')

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

if (shouldDeploy) deploy()

console.log('\nDone!')
