/**
 * Unit tests for the scroll-wheel volume math (src/lib/utils.js) — pure
 * step/clamp/unmute logic backing the BTTV-style wheel-over-player feature.
 */

import { describe, expect, test } from 'bun:test'
import { resolveVolumeWheelStep, stepVolume } from '../src/lib/utils.js'

describe('stepVolume', () => {
  test('scroll up (negative deltaY) increases volume by step', () => {
    expect(stepVolume(0.5, -100)).toBe(0.55)
  })

  test('scroll down (positive deltaY) decreases volume by step', () => {
    expect(stepVolume(0.5, 100)).toBe(0.45)
  })

  test('deltaY 0 is a no-op', () => {
    expect(stepVolume(0.5, 0)).toBe(0.5)
  })

  test('clamps at 1 (does not overshoot on a fast scroll-up)', () => {
    expect(stepVolume(0.98, -100)).toBe(1)
    expect(stepVolume(1, -100)).toBe(1)
  })

  test('clamps at 0 (does not go negative on a fast scroll-down)', () => {
    expect(stepVolume(0.02, 100)).toBe(0)
    expect(stepVolume(0, 100)).toBe(0)
  })

  test('repeated ticks stay on the 0.05 grid — no float drift', () => {
    let v = 0
    for (let i = 0; i < 20; i++) v = stepVolume(v, -100) // 20 ticks up: 0 -> 1.0
    expect(v).toBe(1)
    for (let i = 0; i < 20; i++) v = stepVolume(v, 100) // 20 ticks down: 1.0 -> 0
    expect(v).toBe(0)
  })

  test('custom step size', () => {
    expect(stepVolume(0.5, -100, 0.1)).toBe(0.6)
  })

  test('non-numeric/NaN volume treated as 0', () => {
    expect(stepVolume(undefined, -100)).toBe(0.05)
    expect(stepVolume(NaN, -100)).toBe(0.05)
  })
})

describe('resolveVolumeWheelStep', () => {
  test('scrolling up while muted unmutes AND applies the step', () => {
    const next = resolveVolumeWheelStep({ volume: 0.3, muted: true }, -100)
    expect(next).toEqual({ volume: 0.35, muted: false })
  })

  test('scrolling up while unmuted just steps, muted stays false', () => {
    const next = resolveVolumeWheelStep({ volume: 0.3, muted: false }, -100)
    expect(next).toEqual({ volume: 0.35, muted: false })
  })

  test('scrolling down never unmutes — muted stays true if it was', () => {
    const next = resolveVolumeWheelStep({ volume: 0.3, muted: true }, 100)
    expect(next).toEqual({ volume: 0.25, muted: true })
  })

  test('scrolling down while unmuted stays unmuted', () => {
    const next = resolveVolumeWheelStep({ volume: 0.3, muted: false }, 100)
    expect(next).toEqual({ volume: 0.25, muted: false })
  })

  test('missing/undefined state defaults volume to 0, muted to false', () => {
    expect(resolveVolumeWheelStep(undefined, -100)).toEqual({ volume: 0.05, muted: false })
  })
})
