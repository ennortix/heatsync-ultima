// Toast UX contract — two regressions this file pins:
//
// 1. Body-click fires the primary action on toast-stack notifs. The layer's
//    CSS shows a pointer cursor on the whole toast; before a9b2bdb only the
//    small action segment was live, so relink/retry toasts read as dead UI.
//
// 2. `container-type` must NOT return to the generic .hs-notif rule. On the
//    shrink-to-fit toast-stack layer, inline-size containment zeroes the
//    content's width contribution and every toast collapses to its 180px
//    min-width as a char-wrapped tower. Containment lives only on the
//    statusbar layer (definite width, progressive-collapse queries need it).

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..', 'src', 'multichat')
const NOTIFS = readFileSync(join(ROOT, 'notifs.js'), 'utf8')
const LAYERS_CSS = readFileSync(join(ROOT, 'styles', '05-notif-layers.css'), 'utf8')
const STATUSBAR_CSS = readFileSync(join(ROOT, 'styles', '06-statusbar-callouts.css'), 'utf8')

describe('toast body click', () => {
  test('toast-stack wrapper click falls through to the primary action', () => {
    const gate = NOTIFS.indexOf("notif.type.layer === 'toast-stack'")
    expect(gate).toBeGreaterThan(-1)
    const branch = NOTIFS.slice(gate, gate + 900)
    expect(branch).toContain('actions?.primary')
    // no primary → the click still does something (dismiss), keeping the
    // pointer-cursor affordance honest for every toast-stack type
    expect(branch).toContain('if (!primary) return dismiss(notif.id)')
  })

  test('gate stays scoped — non-toast layers keep explicit-button-only clicks', () => {
    // the branch must be an else-if off clickToDismiss, not an unconditional
    // wrapper listener (statusbar callouts carry side-effectful primaries)
    expect(NOTIFS).toMatch(/} else if \(notif\.type\.layer === 'toast-stack'\) {/)
  })
})

describe('toast sizing containment', () => {
  test('generic .hs-notif rule carries no container-type', () => {
    const start = LAYERS_CSS.indexOf('.hs-notif {')
    expect(start).toBeGreaterThan(-1)
    const block = LAYERS_CSS.slice(start, LAYERS_CSS.indexOf('}', start))
    expect(block).not.toContain('container-type')
  })

  test('statusbar notifs keep containment for the collapse queries', () => {
    const start = STATUSBAR_CSS.indexOf('.hs-notif-layer-statusbar > .hs-notif {')
    expect(start).toBeGreaterThan(-1)
    const block = STATUSBAR_CSS.slice(start, STATUSBAR_CSS.indexOf('}', start))
    expect(block).toContain('container-type: inline-size')
  })
})
