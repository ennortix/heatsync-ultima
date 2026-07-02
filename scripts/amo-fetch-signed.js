// fetch an already-signed unlisted xpi from AMO by version.
// fallback for release.yml when web-ext sign 409s ("version already exists")
// after its own submission created the version — the file signs server-side;
// we just have to wait for it and download.
//
// usage: bun scripts/amo-fetch-signed.js <version> <out-path>
// env:   AMO_JWT_ISSUER, AMO_JWT_SECRET
import { createHmac } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const GUID = 'heatsync@heatsync.org'
const [version, outPath] = process.argv.slice(2)
const issuer = process.env.AMO_JWT_ISSUER
const secret = process.env.AMO_JWT_SECRET
if (!version || !outPath || !issuer || !secret) {
  console.error('usage: amo-fetch-signed.js <version> <out> (needs AMO_JWT_ISSUER/AMO_JWT_SECRET)')
  process.exit(2)
}

const b64u = (s) => Buffer.from(s).toString('base64url')
function jwt() {
  // AMO requires short-lived HS256 tokens (<=5 min)
  const now = Math.floor(Date.now() / 1000)
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64u(
    JSON.stringify({ iss: issuer, jti: `${now}-${Math.random()}`, iat: now, exp: now + 300 }),
  )
  const sig = createHmac('sha256', secret).update(`${head}.${payload}`).digest('base64url')
  return `${head}.${payload}.${sig}`
}

async function amoGet(url) {
  const res = await fetch(url, { headers: { Authorization: `JWT ${jwt()}` } })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res
}

const versionUrl = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(GUID)}/versions/${encodeURIComponent(version)}/`
const deadline = Date.now() + 15 * 60 * 1000
for (;;) {
  const info = await (await amoGet(versionUrl)).json()
  const file = info.file
  if (file && file.status === 'public' && file.url) {
    const bin = await amoGet(file.url)
    writeFileSync(outPath, Buffer.from(await bin.arrayBuffer()))
    console.log(`signed xpi for ${version} -> ${outPath} (${file.hash || 'no hash'})`)
    process.exit(0)
  }
  if (Date.now() > deadline) {
    console.error(`timed out waiting for signed file (status: ${file ? file.status : 'none'})`)
    process.exit(1)
  }
  console.log(`file status: ${file ? file.status : 'none'} — waiting…`)
  await new Promise((r) => setTimeout(r, 30_000))
}
