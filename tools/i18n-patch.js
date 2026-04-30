#!/usr/bin/env bun
// patch a locale messages.json with given key→message map
// preserves placeholders from en/messages.json
// usage: bun tools/i18n-patch.js <locale> <patches.json>

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'

const ROOT = join(import.meta.dir, '..')
const SRC = join(ROOT, 'src/_locales')

const [, , locale, patchPath] = process.argv
if (!locale || !patchPath) {
  console.error('usage: bun tools/i18n-patch.js <locale> <patches.json>')
  process.exit(1)
}

const en = JSON.parse(readFileSync(join(SRC, 'en/messages.json'), 'utf8'))
const patches = JSON.parse(readFileSync(patchPath, 'utf8'))
const target = join(SRC, locale, 'messages.json')

if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true })

const cur = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {}
const out = {}

for (const [k, ev] of Object.entries(en)) {
  const msg = patches[k] !== undefined ? patches[k] : (cur[k]?.message ?? ev.message)
  out[k] = ev.placeholders ? { message: msg, placeholders: ev.placeholders } : { message: msg }
}

writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${target} (${Object.keys(out).length} keys, ${Object.keys(patches).length} patched)`)
