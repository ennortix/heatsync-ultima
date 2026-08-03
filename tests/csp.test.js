import { expect, test } from 'bun:test'
import chrome from '../src/manifests/chrome.json' with { type: 'json' }
import firefox from '../src/manifests/firefox.json' with { type: 'json' }

// Lock the hardened Content-Security-Policy so it can never silently weaken
// again (cf. the default-src-dropped incident + the WebSocket-override break).
// We assert security INVARIANTS, not an exact golden string, so adding a
// legitimate connect/img host doesn't fail CI — but dropping default-src,
// adding unsafe-inline/eval to scripts, or allowing plaintext http does.

const chromeCsp = chrome.content_security_policy.extension_pages
const firefoxCsp = firefox.content_security_policy

// Parse "directive a b c; directive2 x y" → { directive: [a,b,c], ... }
function parseCsp(csp) {
  const out = {}
  for (const part of csp.split(';')) {
    const toks = part.trim().split(/\s+/).filter(Boolean)
    if (!toks.length) continue
    out[toks[0]] = toks.slice(1)
  }
  return out
}

for (const [name, csp] of [
  ['chrome', chromeCsp],
  ['firefox', firefoxCsp],
]) {
  const d = parseCsp(csp)

  test(`${name}: default-src is 'self' (deny-by-default)`, () => {
    expect(d['default-src']).toEqual(["'self'"])
  })

  test(`${name}: script-src is exactly 'self' — no unsafe-inline/eval/remote`, () => {
    expect(d['script-src']).toEqual(["'self'"])
  })

  test(`${name}: object-src is 'none'`, () => {
    expect(d['object-src']).toEqual(["'none'"])
  })

  test(`${name}: no 'unsafe-eval' anywhere`, () => {
    expect(csp.includes("'unsafe-eval'")).toBe(false)
  })

  test(`${name}: 'unsafe-inline' only ever appears under style-src (never script)`, () => {
    for (const [dir, vals] of Object.entries(d)) {
      if (dir === 'style-src') continue
      expect(vals.includes("'unsafe-inline'")).toBe(false)
    }
  })

  test(`${name}: connect-src/img-src use no plaintext http: and no lone wildcard`, () => {
    for (const dir of ['connect-src', 'img-src']) {
      for (const v of d[dir] || []) {
        expect(v.startsWith('http://')).toBe(false)
        expect(v.startsWith('ws://')).toBe(false)
        expect(v).not.toBe('*')
      }
    }
  })
}

test('connect-src allows data: — notification icons load through SW fetch', () => {
  // chrome.notifications downloads iconUrl via the service worker's fetch,
  // which is subject to connect-src. toNotifIconDataUrl inlines pfps as
  // data: URIs, so dropping data: here silently kills every pfp toast
  // ("Unable to download all specified images"). data: is inert — it can't
  // exfiltrate — so allowing it does not weaken the policy.
  for (const csp of [chromeCsp, firefoxCsp]) {
    expect(parseCsp(csp)['connect-src']).toContain('data:')
  }
})

test('chrome: enforces Trusted Types for scripts', () => {
  expect(parseCsp(chromeCsp)['require-trusted-types-for']).toEqual(["'script'"])
})

test('chrome and firefox connect-src host sets stay in parity', () => {
  const c = new Set(parseCsp(chromeCsp)['connect-src'])
  const f = new Set(parseCsp(firefoxCsp)['connect-src'])
  const onlyChrome = [...c].filter((h) => !f.has(h))
  const onlyFirefox = [...f].filter((h) => !c.has(h))
  expect(onlyChrome).toEqual([])
  expect(onlyFirefox).toEqual([])
})
