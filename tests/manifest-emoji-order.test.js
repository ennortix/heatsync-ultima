import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

// EMOJI_DATA load-order + world-dedupe invariants. The multichat bundle builds
// _emojiMap at eval time behind a typeof guard, so if the emoji data hasn't
// run in the same isolated world FIRST, every emoji surface (dropdown, :name
// tab-complete, :name: send-time conversion) dies silently — no error, just
// gone. Two failure modes are locked down here:
//  1. cross-block ordering at the same run_at is NOT guaranteed → the data
//     file must sit BEFORE the bundle in the SAME content_scripts entry.
//  2. Chrome injects a given FILE once per frame across worlds → an ISOLATED
//     entry must never reference plain emoji-data.js (twitch's MAIN-world
//     registration wins the dedupe and the isolated copy is silently skipped;
//     that is exactly how 43f297b broke twitch emoji autocomplete). ISOLATED
//     entries use the build-emitted byte-identical emoji-data.iso.js instead.
for (const name of ['chrome.json', 'firefox.json']) {
  test(`${name}: multichat entries carry emoji-data.iso.js before the bundle`, () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'src', 'manifests', name), 'utf8'))
    const bundleEntries = (m.content_scripts ?? []).filter((e) =>
      (e.js ?? []).some((f) => /^multichat-.*\.js$/.test(f)),
    )
    expect(bundleEntries.length).toBeGreaterThan(0)
    for (const entry of bundleEntries) {
      const emojiIdx = entry.js.indexOf('emoji-data.iso.js')
      const bundleIdx = entry.js.findIndex((f) => /^multichat-.*\.js$/.test(f))
      expect(emojiIdx).toBeGreaterThanOrEqual(0)
      expect(emojiIdx).toBeLessThan(bundleIdx)
    }
  })

  test(`${name}: kick-autocomplete-hook entry carries emoji-data.iso.js first`, () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'src', 'manifests', name), 'utf8'))
    const hookEntries = (m.content_scripts ?? []).filter((e) => (e.js ?? []).includes('kick-autocomplete-hook.js'))
    expect(hookEntries.length).toBeGreaterThan(0)
    for (const entry of hookEntries) {
      const emojiIdx = entry.js.indexOf('emoji-data.iso.js')
      expect(emojiIdx).toBeGreaterThanOrEqual(0)
      expect(emojiIdx).toBeLessThan(entry.js.indexOf('kick-autocomplete-hook.js'))
    }
  })

  test(`${name}: no ISOLATED entry references plain emoji-data.js`, () => {
    const m = JSON.parse(readFileSync(join(ROOT, 'src', 'manifests', name), 'utf8'))
    for (const entry of m.content_scripts ?? []) {
      if (entry.world === 'MAIN') continue
      expect(entry.js ?? []).not.toContain('emoji-data.js')
    }
  })
}
