// dedupeBulkTargets — pure dedup step for bulk-ban/timeout (mod-toolbar.js).
// Bulk-select lets a mod pick N chat ROWS, but a raider's spam is many rows
// from the SAME user — dispatchModAction (the vetted twitch+kick fan-out
// path) must fire exactly ONCE per unique (platform, channel, login), never
// once per selected row. Extracts the real function by name and evals it in
// isolation, same pattern as tests/kick-native-tap.test.js.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'mod-toolbar.js'), 'utf8')

function extractFn(name) {
  const marker = `function ${name}(`
  const start = SRC.indexOf(marker)
  if (start === -1) throw new Error(`extractFn: "${name}" not found — source drifted, update this test`)
  const end = SRC.indexOf('\n}', start)
  if (end === -1) throw new Error(`extractFn: "${name}" has no closing brace`)
  return SRC.slice(start, end + 2)
}

const { dedupeBulkTargets } = new Function(`${extractFn('dedupeBulkTargets')}\nreturn { dedupeBulkTargets }`)()

describe('dedupeBulkTargets', () => {
  test('collapses the same user selected across multiple spam rows to one target', () => {
    const rows = [
      { platform: 'twitch', channel: 'somechannel', login: 'spammer1' },
      { platform: 'twitch', channel: 'somechannel', login: 'spammer1' },
      { platform: 'twitch', channel: 'somechannel', login: 'spammer1' },
    ]
    expect(dedupeBulkTargets(rows)).toEqual([{ platform: 'twitch', channel: 'somechannel', login: 'spammer1' }])
  })

  test('keeps distinct users as separate targets', () => {
    const rows = [
      { platform: 'twitch', channel: 'somechannel', login: 'alice' },
      { platform: 'twitch', channel: 'somechannel', login: 'bob' },
    ]
    expect(dedupeBulkTargets(rows)).toEqual([
      { platform: 'twitch', channel: 'somechannel', login: 'alice' },
      { platform: 'twitch', channel: 'somechannel', login: 'bob' },
    ])
  })

  test('is case-insensitive on login for dedup purposes', () => {
    const rows = [
      { platform: 'kick', channel: 'someslug', login: 'Spammer1' },
      { platform: 'kick', channel: 'someslug', login: 'spammer1' },
    ]
    expect(dedupeBulkTargets(rows)).toEqual([{ platform: 'kick', channel: 'someslug', login: 'spammer1' }])
  })

  test('the same login on two different channels is two targets, not one', () => {
    const rows = [
      { platform: 'twitch', channel: 'chanA', login: 'roamer' },
      { platform: 'twitch', channel: 'chanB', login: 'roamer' },
    ]
    expect(dedupeBulkTargets(rows)).toEqual([
      { platform: 'twitch', channel: 'chanA', login: 'roamer' },
      { platform: 'twitch', channel: 'chanB', login: 'roamer' },
    ])
  })

  test('the same login on twitch vs kick is two targets, not one', () => {
    const rows = [
      { platform: 'twitch', channel: 'somechannel', login: 'crossposter' },
      { platform: 'kick', channel: 'somechannel', login: 'crossposter' },
    ]
    expect(dedupeBulkTargets(rows)).toEqual([
      { platform: 'twitch', channel: 'somechannel', login: 'crossposter' },
      { platform: 'kick', channel: 'somechannel', login: 'crossposter' },
    ])
  })

  test('rows missing a login or channel are dropped, not crashed on', () => {
    const rows = [
      { platform: 'twitch', channel: 'somechannel', login: '' },
      { platform: 'twitch', channel: '', login: 'ghost' },
      { platform: 'twitch', channel: 'somechannel', login: 'real' },
    ]
    expect(dedupeBulkTargets(rows)).toEqual([{ platform: 'twitch', channel: 'somechannel', login: 'real' }])
  })

  test('empty input is an empty target list', () => {
    expect(dedupeBulkTargets([])).toEqual([])
    expect(dedupeBulkTargets(undefined)).toEqual([])
  })

  test('a leading @ on login is stripped', () => {
    expect(dedupeBulkTargets([{ platform: 'twitch', channel: 'somechannel', login: '@atname' }])).toEqual([
      { platform: 'twitch', channel: 'somechannel', login: 'atname' },
    ])
  })

  test('missing platform defaults to twitch', () => {
    expect(dedupeBulkTargets([{ channel: 'somechannel', login: 'noplat' }])).toEqual([
      { platform: 'twitch', channel: 'somechannel', login: 'noplat' },
    ])
  })
})
