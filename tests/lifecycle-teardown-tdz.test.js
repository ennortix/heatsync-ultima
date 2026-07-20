/**
 * Lifecycle teardown must survive an abort fired MID-EVALUATION
 * (src/multichat/bootstrap.js).
 *
 * Regression anchor (2026-07-20): the abort handler read `irc` / `kickChat`
 * bare. Those are declared in main.js, which the build flattens BELOW
 * bootstrap.js into one shared scope, so while the bundle is still evaluating
 * they sit in their temporal dead zone. Both context-death detectors call
 * lifecycle.abort(), and the connect() port disconnects synchronously when the
 * extension context is already invalid — exactly what an ext reload or store
 * auto-update does to a live tab. The bare read then threw "Cannot access
 * 'irc' before initialization", which killed the rest of the handler (leaking
 * the auth-irc + whisper sockets it exists to close) and aborted the whole
 * bundle evaluation, leaving the tab with NO multichat until it was reopened.
 *
 * The shipped guard is `typeof x !== 'undefined' && x` wrapped in try/catch.
 * The try/catch is load-bearing and NOT redundant: typeof throws on a TDZ
 * binding too, so the guard alone does not save the handler — which is exactly
 * what the first test here pins.
 *
 * Carved out of the non-module content-script bundle and evaluated standalone
 * (same rationale as tab-cycle-pagination.test.js).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BOOT_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'bootstrap.js'), 'utf8')
const start = BOOT_SRC.indexOf('const lifecycle = new AbortController()')
const end = BOOT_SRC.indexOf("window.addEventListener('pagehide'")
if (start === -1 || end === -1 || end <= start) throw new Error('lifecycle carve markers not found')
const LIFECYCLE_SRC = BOOT_SRC.slice(start, end)

// Evaluate the carved lifecycle block, then abort at a chosen point, with the
// late bindings declared AFTER the abort — reproducing the real bundle layout.
function runWithAbort({ declareLate }) {
  const calls = { authIrc: 0, esw: 0, sweep: 0 }
  const body = declareLate
    ? // `let irc` below the abort call = irc is in TDZ when teardown runs,
      // precisely the mid-evaluation ext-reload case.
      `${LIFECYCLE_SRC}\n;lifecycle.abort();\nlet irc = null; let kickChat = null;\nreturn calls`
    : `${LIFECYCLE_SRC}\n;lifecycle.abort();\nreturn calls`
  const fn = new Function(
    'cleanupAuthIrc',
    'eswCleanup',
    '_hsSweepInstallOnceFlags',
    'cancelAnimationFrame',
    'calls',
    body,
  )
  return () =>
    fn(
      () => {
        calls.authIrc++
      },
      () => {
        calls.esw++
      },
      () => {
        calls.sweep++
      },
      () => {},
      calls,
    )
}

describe('abort fired while the bundle is still evaluating', () => {
  test('does not throw when irc/kickChat are in their temporal dead zone', () => {
    // The crash: teardown reached a `let` declared further down the bundle.
    expect(runWithAbort({ declareLate: true })).not.toThrow()
  })

  test('teardown still completes past the TDZ read — sockets get closed', () => {
    // The subtler half: a throw mid-handler skipped cleanupAuthIrc/eswCleanup,
    // leaking the auth-irc and whisper sockets on every reload cycle.
    const calls = runWithAbort({ declareLate: true })()
    expect(calls.authIrc).toBe(1)
    expect(calls.esw).toBe(1)
    expect(calls.sweep).toBe(1)
  })

  test('also survives when the bindings never exist at all', () => {
    const run = runWithAbort({ declareLate: false })
    expect(run).not.toThrow()
    expect(run().sweep).toBeGreaterThan(0)
  })
})

describe('source invariant', () => {
  const handlerStart = BOOT_SRC.indexOf("mcSignal.addEventListener('abort'")
  const handlerEnd = BOOT_SRC.indexOf('\n})', handlerStart)
  const handler = BOOT_SRC.slice(handlerStart, handlerEnd)

  test('every late-binding read is typeof-guarded AND wrapped in try/catch', () => {
    for (const name of ['irc', 'kickChat']) {
      const read = new RegExp(`typeof ${name} !== 'undefined' && ${name}`)
      expect(handler).toMatch(read)
    }
    // typeof alone throws on TDZ — the try/catch is what actually saves it.
    expect(handler).toMatch(/try \{\s*\n\s*if \(typeof irc !== 'undefined'/)
    expect(handler).toMatch(/try \{\s*\n\s*if \(typeof kickChat !== 'undefined'/)
  })

  test('the socket cleanups run after the guarded reads, not before', () => {
    // Ordering matters only because a pre-fix throw skipped them entirely;
    // keep them downstream so the guards protect them.
    expect(handler.indexOf('cleanupAuthIrc(true)')).toBeGreaterThan(handler.indexOf('typeof kickChat'))
  })
})
