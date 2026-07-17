import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPTICS,
  pixelsOnTarget,
  johnsonProb,
  recognitionProb,
  recognitionRangeForProb,
  focalLengthMm,
  hfovDegFromFocal,
} from '../index'

const O = { ...DEFAULT_OPTICS }

describe('pixels on target', () => {
  it('scales inversely with range and directly with size/resolution', () => {
    const near = pixelsOnTarget(O, 0.35, 500)
    const far = pixelsOnTarget(O, 0.35, 2000)
    expect(near).toBeCloseTo(far * 4, 5) // 4× closer → 4× pixels

    const big = pixelsOnTarget({ ...O, h_resolution_px: O.h_resolution_px * 2 }, 0.35, 1000)
    const base = pixelsOnTarget(O, 0.35, 1000)
    expect(big).toBeCloseTo(base * 2, 5)
  })

  it('narrower FOV yields more pixels on target', () => {
    const wide = pixelsOnTarget({ ...O, hfov_deg: 20 }, 0.35, 1500)
    const narrow = pixelsOnTarget({ ...O, hfov_deg: 2 }, 0.35, 1500)
    expect(narrow).toBeGreaterThan(wide)
  })
})

describe('johnson probability', () => {
  it('is 0.5 at n=1 and monotone increasing', () => {
    expect(johnsonProb(1)).toBeCloseTo(0.5, 6)
    expect(johnsonProb(0)).toBe(0)
    let prev = -1
    for (let n = 0; n <= 4; n += 0.25) {
      const p = johnsonProb(n)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })
})

describe('recognition probability', () => {
  it('decreases as range increases', () => {
    const near = recognitionProb(O, 0.35, 800)
    const far = recognitionProb(O, 0.35, 4000)
    expect(near).toBeGreaterThan(far)
  })

  it('recognitionRangeForProb inverts to ~0.5 probability at that range', () => {
    const r50 = recognitionRangeForProb(O, 0.35, 0.5)
    expect(recognitionProb(O, 0.35, r50)).toBeCloseTo(0.5, 2)
  })
})

describe('focal length ↔ FOV', () => {
  it('round-trips', () => {
    const f = focalLengthMm(O)
    const hfov = hfovDegFromFocal(f, O.sensor_width_mm)
    expect(hfov).toBeCloseTo(O.hfov_deg, 4)
  })
})
