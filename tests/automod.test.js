import { beforeEach, expect, test } from 'bun:test'
import {
  compileAutomod,
  isDangerousRegexSource,
  shouldAutomod,
  tripsCatastrophicBacktracking,
} from '../src/multichat/automod.js'

beforeEach(() => {
  compileAutomod({})
})

// ── isDangerousRegexSource ─────────────────────────────────────────────────────

test('guard: bare nested quantifier (a+)+ flagged', () => {
  expect(isDangerousRegexSource('(a+)+')).toBe(true)
})

test('guard: brace-quantified nested quantifier (a+){30} flagged', () => {
  expect(isDangerousRegexSource('(a+){30}')).toBe(true)
})

test('guard: brace-quantified nested quantifier (a+){2,} flagged', () => {
  expect(isDangerousRegexSource('(a+){2,}')).toBe(true)
})

test('guard: alternation blowup (a|a)+ flagged', () => {
  expect(isDangerousRegexSource('(a|a)+')).toBe(true)
})

test('guard: alternation with brace (a|a){20} flagged', () => {
  expect(isDangerousRegexSource('(a|a){20}')).toBe(true)
})

test('guard: source length > 512 flagged', () => {
  expect(isDangerousRegexSource('a'.repeat(513))).toBe(true)
})

test('guard: safe literal pattern not flagged', () => {
  expect(isDangerousRegexSource('hello')).toBe(false)
})

test('guard: safe grouped pattern without inner quantifier not flagged', () => {
  expect(isDangerousRegexSource('(abc)+')).toBe(false)
})

// ── shouldAutomod input length cap ────────────────────────────────────────────

test('shouldAutomod: completes quickly on long input with backtracking pattern', () => {
  // (a+){30} without the input cap would hang for ~33s; with cap completes instantly
  compileAutomod({ automodRegex: '(a+){30}' })
  const start = Date.now()
  const result = shouldAutomod('a'.repeat(500) + '!')
  expect(Date.now() - start).toBeLessThan(2000)
  expect(typeof result).toBe('boolean')
})

test('shouldAutomod: matches on short text still works after cap change', () => {
  compileAutomod({ automodRegex: 'badword' })
  expect(shouldAutomod('this is a badword here')).toBe(true)
  expect(shouldAutomod('clean message')).toBe(false)
})

// ── tripsCatastrophicBacktracking (empirical backstop) ────────────────────────

test('backstop: flags a known catastrophic regex', () => {
  expect(tripsCatastrophicBacktracking(/(a+)+$/i)).toBe(true)
})

test('backstop: passes a safe regex', () => {
  expect(tripsCatastrophicBacktracking(/hello|world|badword/i)).toBe(false)
})

test('backstop: catches a catastrophic pattern that slips the static heuristic', () => {
  // ((a+))+$ is double-nested: the denylist does not flag it, but it is exponential.
  expect(isDangerousRegexSource('((a+))+$')).toBe(false)
  expect(tripsCatastrophicBacktracking(/((a+))+$/i)).toBe(true)
})

test('backstop: compileAutomod degrades a heuristic-evading pattern to literal', () => {
  // Without the backstop this compiles as live regex and would hang on a crafted msg.
  compileAutomod({ automodRegex: '((a+))+$' })
  const start = Date.now()
  shouldAutomod('a'.repeat(200) + '!')
  expect(Date.now() - start).toBeLessThan(2000)
  // Degraded to a literal: it now matches the literal source text, not exponentially.
  expect(shouldAutomod('see ((a+))+$ here')).toBe(true)
})
