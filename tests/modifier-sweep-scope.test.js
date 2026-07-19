/**
 * Tab modifier-sweep scope (src/multichat/input.js scanAndApplyModifiersInInput).
 *
 * Regression anchor: "type Z between two emotes, Tab-complete the second —
 * does nothing but erase the Z." Bare letters prefix-resolve to modifier
 * tokens (Z → z! zeroWidth via hsModResolvePrefix's unique-prefix rule), and
 * the sweep ran over the WHOLE input with allowPrefix on every token — so a
 * letter typed as content, sitting after an emote chip, was consumed as a
 * modifier on an unrelated Tab press, and the sweep's early-return meant the
 * completion never ran.
 *
 * Now: bare-letter prefix forms only classify for the token the caret is in
 * or just left (the deliberate "Kappa w → Tab" gesture); distant tokens must
 * be unambiguous (w!, z!, chains, c!hex). Additionally the Tab handler skips
 * the sweep entirely when the caret sits on a completable (>=2 char) word.
 *
 * The sweep is carved from the content-script source and driven with a
 * minimal fake DOM (same carve rationale as tab-complete-order.test.js).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hsModClassify } from '../src/lib/modifiers.js'

const INPUT_SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'input.js'), 'utf8')
const start = INPUT_SRC.indexOf('function scanAndApplyModifiersInInput(')
const end = INPUT_SRC.indexOf('// Shared tab-complete comparator')
if (start === -1 || end === -1 || end <= start) throw new Error('scanAndApplyModifiersInInput carve markers not found')
const SWEEP_SRC = INPUT_SRC.slice(start, end)

// --- minimal fake DOM ---
const NodeStub = { ELEMENT_NODE: 1, TEXT_NODE: 3 }
const chip = () => ({
  nodeType: 1,
  tagName: 'IMG',
  classList: { contains: (c) => c === 'hs-input-emote' },
})
const text = (s) => ({ nodeType: 3, textContent: s })

// Harness: build the sweep with stubbed collaborators. `applied` collects the
// modifier words consumed so tests can assert exactly what got eaten.
function makeSweep({ caretNode = null, caretOffset = -1 } = {}) {
  const applied = []
  const windowStub = {
    getSelection: () => ({
      rangeCount: caretNode ? 1 : 0,
      getRangeAt: () => ({ collapsed: true, startContainer: caretNode, startOffset: caretOffset }),
    }),
  }
  const sweep = new Function(
    'Node',
    'window',
    'hsModClassify',
    'hsModAnchorEl',
    'hsModApplyToImg',
    `${SWEEP_SRC}; return scanAndApplyModifiersInInput`,
  )(
    NodeStub,
    windowStub,
    hsModClassify,
    (el) => el, // anchor resolves to the chip itself
    (_img, _mods, _hue, words) => applied.push(...(words || [])),
  )
  return { sweep, applied }
}

const makeInput = (children) => ({
  childNodes: children,
  contains: () => true,
})

describe('modifier sweep — bare letters only consume at the caret', () => {
  test('literal "Z" after a chip, caret on a different word → survives (the bug)', () => {
    const zNode = text(' Z emopl')
    const input = makeInput([chip(), zNode])
    // caret at the end of "emopl"
    const { sweep, applied } = makeSweep({ caretNode: zNode, caretOffset: zNode.textContent.length })
    // caret token is "emopl" (plain) — "Z" must not prefix-resolve
    expect(sweep(input)).toBe(false)
    expect(applied).toEqual([])
    expect(zNode.textContent).toBe(' Z emopl')
  })

  test('"Kappa w" gesture — caret right after the w → consumed (feature intact)', () => {
    const wNode = text(' w')
    const input = makeInput([chip(), wNode])
    const { sweep, applied } = makeSweep({ caretNode: wNode, caretOffset: 2 })
    expect(sweep(input)).toBe(true)
    expect(applied).toEqual(['w!'])
  })

  test('gesture with a trailing space ("w ") still consumes', () => {
    const wNode = text(' w ')
    const input = makeInput([chip(), wNode])
    const { sweep, applied } = makeSweep({ caretNode: wNode, caretOffset: 3 })
    expect(sweep(input)).toBe(true)
    expect(applied).toEqual(['w!'])
  })

  test('bare letter with the caret in a DIFFERENT node → survives', () => {
    const zNode = text(' z')
    const otherNode = text(' hello')
    const input = makeInput([chip(), zNode, chip(), otherNode])
    const { sweep, applied } = makeSweep({ caretNode: otherNode, caretOffset: 6 })
    expect(sweep(input)).toBe(false)
    expect(applied).toEqual([])
    expect(zNode.textContent).toBe(' z')
  })

  test('unambiguous bang form ("z!") consumes anywhere, caret elsewhere', () => {
    const zNode = text(' z!')
    const otherNode = text(' typing')
    const input = makeInput([chip(), zNode, chip(), otherNode])
    const { sweep, applied } = makeSweep({ caretNode: otherNode, caretOffset: 7 })
    expect(sweep(input)).toBe(true)
    expect(applied).toEqual(['z!'])
  })

  test('no selection at all → only unambiguous forms consume', () => {
    const node = text(' w z! ')
    const input = makeInput([chip(), node])
    const { sweep, applied } = makeSweep({})
    expect(sweep(input)).toBe(true)
    expect(applied).toEqual(['z!'])
    expect(node.textContent).toContain('w')
  })
})

describe('hsModClassify contract the sweep relies on', () => {
  test('bare Z prefix-resolves to z! only with allowPrefix', () => {
    expect(hsModClassify('Z', { allowPrefix: true }).kind).toBe('modifier')
    expect(hsModClassify('Z').kind).toBe('plain')
    expect(hsModClassify('Z', { allowPrefix: false }).kind).toBe('plain')
  })

  test('bang forms are modifiers without allowPrefix', () => {
    expect(hsModClassify('z!').kind).toBe('modifier')
    expect(hsModClassify('w!').kind).toBe('modifier')
  })
})
