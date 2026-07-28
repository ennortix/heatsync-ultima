/**
 * amo-update-listing.js — push the current STORE-LISTING.md summary +
 * description to the live AMO listing (metadata PATCH, no version upload,
 * no review round-trip). Run after editing docs/STORE-LISTING.md so the
 * dashboard never drifts from the repo's source of truth again.
 *
 *   node scripts/amo-update-listing.js           # dry-run: show the diff
 *   node scripts/amo-update-listing.js --publish # PATCH the live listing
 *
 * CWS has no listing-text API — its long description stays a manual
 * dashboard paste (same copy, see STORE-LISTING.md).
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { homedir } from 'os'
import { createHmac } from 'crypto'

const AMO_SLUG = 'heatsync-chat'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const doc = readFileSync(join(root, 'docs/STORE-LISTING.md'), 'utf8')

// pull the fenced blocks that follow the AMO Summary / Description headings
const block = (heading) => {
  const re = new RegExp(`## ${heading}[^\\n]*\\n(?:[^\\n]*\\n)*?\`\`\`\\n([\\s\\S]*?)\`\`\``)
  const m = doc.match(re)
  if (!m) throw new Error(`heading not found in STORE-LISTING.md: ${heading}`)
  return m[1].trim()
}
const summary = block('AMO Summary')
const description = block('AMO / CWS Description')
if (summary.length > 250) throw new Error(`summary ${summary.length} chars > AMO 250 limit`)

const env = Object.fromEntries(
  readFileSync(join(homedir(), '.config/heatsync/publish.env'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const jwt = () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const payload = b64({ iss: env.AMO_JWT_ISSUER, jti: `${now}-${Math.random()}`, iat: now, exp: now + 300 })
  const sig = createHmac('sha256', env.AMO_JWT_SECRET).update(`${head}.${payload}`).digest('base64url')
  return `${head}.${payload}.${sig}`
}

const url = `https://addons.mozilla.org/api/v5/addons/addon/${AMO_SLUG}/`
const current = await fetch(url).then(r => r.json())
console.log('--- live summary (en-US):\n' + current.summary['en-US'])
console.log('--- new summary:\n' + summary)
console.log(`--- new description: ${description.length} chars (live: ${(current.description?.['en-US'] || '').length})`)

// non-en summaries: source each locale's already-translated shipped
// manifest_description (src/_locales) so AMO never drifts from the product.
// AMO locale tags (pt-BR) map to _locales dirs (pt_BR), falling back to the
// bare language (es-ES → es). locales with no source keep en-US fallback.
const summaries = { 'en-US': summary }
for (const amoLocale of Object.keys(current.summary || {})) {
  if (amoLocale === 'en-US') continue
  const candidates = [amoLocale.replace('-', '_'), amoLocale.split('-')[0]]
  for (const dir of candidates) {
    try {
      const msgs = JSON.parse(readFileSync(join(root, 'src/_locales', dir, 'messages.json'), 'utf8'))
      const text = msgs.manifest_description?.message
      if (text) { summaries[amoLocale] = text; break }
    } catch { /* no such locale dir — try next candidate */ }
  }
  if (!summaries[amoLocale]) console.log(`warn: no shipped translation for ${amoLocale} — clearing to en-US fallback`)
}
const stale = Object.keys(summaries).filter(l => l !== 'en-US' && current.summary[l] !== summaries[l])
console.log(`--- locale summaries to update: ${stale.length} (${stale.join(', ') || 'none'})`)

if (!process.argv.includes('--publish')) {
  console.log('\ndry-run — pass --publish to PATCH the live listing')
  process.exit(0)
}

const res = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: `JWT ${jwt()}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    summary: summaries,
    description: { 'en-US': description },
  }),
})
if (!res.ok) throw new Error(`PATCH failed ${res.status}: ${await res.text()}`)
console.log('listing updated — verify at https://addons.mozilla.org/firefox/addon/heatsync-chat/')
