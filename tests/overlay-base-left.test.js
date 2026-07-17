/**
 * resolveOverlayBaseLeft (src/multichat/input.js) — the shared "what do I
 * stack this zero-width completion onto" resolver.
 *
 * Regression anchor: "🥔 then micro→Tab didn't overlay in the input box."
 * Picker inserts and contenteditable splits routinely leave the emoji and the
 * typed word in SEPARATE text nodes; the old prev-sibling scan only accepted
 * element chips (it stopped dead on any non-whitespace text node) and the old
 * peel only read the SAME node's before-text — so the completion landed as a
 * standalone chip. The resolver now also peels a raw emoji off the END of a
 * preceding text node, wrapping it into an atomic .hs-mc-emoji span base.
 *
 * Carved with a minimal fake DOM (same rationale as modifier-sweep-scope).
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'

const SRC = readFileSync(join(import.meta.dir, '..', 'src', 'multichat', 'input.js'), 'utf8')
const start = SRC.indexOf('function peelTrailingEmoji(')
const end = SRC.indexOf('// If the word being auto-converted starts at offset 0')
if (start === -1 || end === -1 || end <= start) throw new Error('carve markers not found')
const CARVE = SRC.slice(start, end)

// --- minimal fake DOM (linked siblings + parent with insertBefore/remove) ---
const NodeStub = { ELEMENT_NODE: 1, TEXT_NODE: 3 }
const UNICODE_EMOJI_RE = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}️‍]+$/u

function makeParent(children) {
  const parent = {
    children,
    insertBefore(node, ref) {
      const i = ref ? children.indexOf(ref) : children.length
      children.splice(i === -1 ? children.length : i, 0, node)
      node.parentNode = parent
      relink()
    },
  }
  const relink = () => {
    children.forEach((c, i) => {
      c.parentNode = parent
      c.previousSibling = children[i - 1] || null
      c.nextSibling = children[i + 1] || null
      c.remove = () => {
        const j = children.indexOf(c)
        if (j !== -1) children.splice(j, 1)
        relink()
      }
    })
  }
  relink()
  return { parent, relink }
}

const el = (classes, tag = 'IMG') => ({
  nodeType: 1,
  tagName: tag,
  classList: { contains: (c) => classes.includes(c) },
})
const txt = (s) => ({ nodeType: 3, textContent: s })

const documentStub = {
  createElement: (tag) => {
    const classes = []
    return {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      _attrs: {},
      set className(v) {
        classes.length = 0
        classes.push(...v.split(' '))
      },
      get className() {
        return classes.join(' ')
      },
      classList: { contains: (c) => classes.includes(c) },
      textContent: '',
      setAttribute(k, v) {
        this._attrs[k] = v
      },
    }
  },
}

const resolveOverlayBaseLeft = new Function(
  'Node',
  'document',
  'UNICODE_EMOJI_RE',
  `${CARVE}; return resolveOverlayBaseLeft`,
)(NodeStub, documentStub, UNICODE_EMOJI_RE)

describe('resolveOverlayBaseLeft', () => {
  test('element chip base returned as-is', () => {
    const chip = el(['hs-input-emote'])
    const node = txt(' micro')
    makeParent([chip, node])
    expect(resolveOverlayBaseLeft(node)).toBe(chip)
  })

  test('SPLIT-NODE raw emoji: preceding text node ending in 🥔 → wrapped span base (the bug)', () => {
    const emojiNode = txt('🥔 ')
    const node = txt(' micro')
    const { parent } = makeParent([emojiNode, node])
    const base = resolveOverlayBaseLeft(node)
    expect(base).toBeTruthy()
    expect(base.className).toContain('hs-mc-emoji')
    expect(base.textContent).toBe('🥔')
    // emoji-only source node is removed; span sits where it was
    expect(parent.children).toContain(base)
    expect(parent.children).not.toContain(emojiNode)
  })

  test('text "hello 🥔" keeps the rest text and wraps only the emoji', () => {
    const mixed = txt('hello 🥔')
    const node = txt(' micro')
    const { parent } = makeParent([mixed, node])
    const base = resolveOverlayBaseLeft(node)
    expect(base.textContent).toBe('🥔')
    expect(mixed.textContent).toBe('hello ')
    expect(parent.children).toContain(mixed)
  })

  test('plain text before → null (no phantom base)', () => {
    const words = txt('just words')
    const node = txt(' micro')
    makeParent([words, node])
    expect(resolveOverlayBaseLeft(node)).toBe(null)
  })

  test('whitespace-only node skipped through to a chip', () => {
    const chip = el(['hs-input-stack'], 'SPAN')
    const ws = txt('   ')
    const node = txt(' micro')
    makeParent([chip, ws, node])
    expect(resolveOverlayBaseLeft(node)).toBe(chip)
  })

  test('nothing before → null', () => {
    const node = txt(' micro')
    makeParent([node])
    expect(resolveOverlayBaseLeft(node)).toBe(null)
  })

  test('non-chip element before → null', () => {
    const div = el(['some-random'], 'DIV')
    const node = txt(' micro')
    makeParent([div, node])
    expect(resolveOverlayBaseLeft(node)).toBe(null)
  })
})
