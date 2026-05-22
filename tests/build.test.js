import { test, expect, beforeAll } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const DIST_CHROME = join(ROOT, 'dist', 'chrome')
const DIST_FIREFOX = join(ROOT, 'dist', 'firefox')

// ensure build ran before suite
beforeAll(async () => {
  if (!existsSync(join(DIST_CHROME, 'manifest.json'))) {
    const proc = Bun.spawn(['bun', 'run', 'build.js'], { cwd: ROOT })
    await proc.exited
  }
})

// ── output files ─────────────────────────────────────────────────────────────

const coreFiles = [
  'manifest.json',
  'background.js',
  'content.js',
  'multichat.js',
  'heatsync-button.js',
  'shared-utils.js',
  'popup.html',
  'popup.js',
  'options.html',
  'injected-message.css',
]

for (const file of coreFiles) {
  test(`chrome dist has ${file}`, () => {
    expect(existsSync(join(DIST_CHROME, file))).toBe(true)
  })

  test(`firefox dist has ${file}`, () => {
    expect(existsSync(join(DIST_FIREFOX, file))).toBe(true)
  })
}

// ── manifest parsing ──────────────────────────────────────────────────────────

function readManifest(distDir) {
  return JSON.parse(readFileSync(join(distDir, 'manifest.json'), 'utf8'))
}

test('chrome manifest is valid json with required fields', () => {
  const m = readManifest(DIST_CHROME)
  expect(m.manifest_version).toBe(3)
  expect(typeof m.name).toBe('string')
  expect(typeof m.version).toBe('string')
  expect(typeof m.description).toBe('string')
  expect(Array.isArray(m.content_scripts)).toBe(true)
  expect(m.background?.service_worker).toBeTruthy()
})

test('firefox manifest is valid json with required fields', () => {
  const m = readManifest(DIST_FIREFOX)
  expect(m.manifest_version).toBe(2)
  expect(typeof m.name).toBe('string')
  expect(typeof m.version).toBe('string')
  expect(typeof m.description).toBe('string')
  expect(Array.isArray(m.content_scripts)).toBe(true)
  expect(Array.isArray(m.background?.scripts)).toBe(true)
})

// ── version sync ──────────────────────────────────────────────────────────────

test('versions match across package.json and both manifests', async () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const chrome = readManifest(DIST_CHROME)
  const firefox = readManifest(DIST_FIREFOX)
  expect(chrome.version).toBe(pkg.version)
  expect(firefox.version).toBe(pkg.version)
})

// ── CSP ───────────────────────────────────────────────────────────────────────

test('chrome manifest has CSP', () => {
  const m = readManifest(DIST_CHROME)
  expect(m.content_security_policy).toBeTruthy()
})

test('firefox manifest has CSP', () => {
  const m = readManifest(DIST_FIREFOX)
  expect(typeof m.content_security_policy).toBe('string')
  expect(m.content_security_policy.length).toBeGreaterThan(0)
})

// ── content script files exist in dist ───────────────────────────────────────

function collectScripts(manifest) {
  const scripts = new Set()
  for (const entry of manifest.content_scripts ?? []) {
    for (const file of entry.js ?? []) scripts.add(file)
  }
  return scripts
}

test('all chrome content script files exist in dist', () => {
  const m = readManifest(DIST_CHROME)
  for (const file of collectScripts(m)) {
    expect(existsSync(join(DIST_CHROME, file))).toBe(true)
  }
})

test('all firefox content script files exist in dist', () => {
  const m = readManifest(DIST_FIREFOX)
  for (const file of collectScripts(m)) {
    expect(existsSync(join(DIST_FIREFOX, file))).toBe(true)
  }
})
