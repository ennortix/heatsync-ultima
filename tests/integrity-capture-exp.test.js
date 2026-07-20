/**
 * Captured Client-Integrity tokens MUST carry an expiry.
 *
 * Twitch's own gql requests carry a Kasada/proof-of-work-backed integrity token
 * — the only kind gql accepts for mutations. early-inject-main.js captures it,
 * but if it doesn't stamp gql.integrityExp, fetchIntegrity treats the capture as
 * stale and mints its own token via a plain /integrity POST (no KPSDK headers),
 * which twitch rejects → "failed integrity check" on /announce, /highlight, and
 * every mutation. This guards both capture sites against regressing to the
 * exp-less form.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(import.meta.dir, '..', 'chrome', 'early-inject-main.js'), 'utf8')

describe('integrity capture stamps an expiry', () => {
  test('header-capture (Client-Integrity) sets gql.integrityExp', () => {
    // The block guarded by `if (integ) {` must assign integrityExp.
    const i = SRC.indexOf("const integ = get('Client-Integrity')")
    expect(i).toBeGreaterThanOrEqual(0)
    const block = SRC.slice(i, i + 1000)
    expect(block).toContain('gql.integrity = integ')
    expect(block).toContain('gql.integrityExp =')
  })

  test('/integrity response capture sets gql.integrityExp from expiration', () => {
    const i = SRC.indexOf('if (data.token) {')
    expect(i).toBeGreaterThanOrEqual(0)
    const block = SRC.slice(i, i + 600)
    expect(block).toContain('gql.integrity = data.token')
    expect(block).toContain('gql.integrityExp =')
    expect(block).toContain('data.expiration')
  })

  test('fetchIntegrity still gates on integrityExp (prefers a stamped token)', () => {
    // The freshness check that our stamp satisfies must remain.
    expect(SRC).toContain('gql.integrityExp && Date.now() < gql.integrityExp')
  })
})
