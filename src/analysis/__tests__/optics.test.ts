import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OPTICS,
  pixelsOnTarget,
  johnsonProb,
  recognitionProb,
  recognitionRangeForProb,
  acquisitionProb,
  pointingSigmaDeg,
  atmosphericTransmission,
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

describe('acquisition (gimbal-less FOV coverage)', () => {
  it('combines cue and pointing error in quadrature', () => {
    expect(pointingSigmaDeg({ ...O, cue_error_deg: 0.3, pointing_error_deg: 0.4 })).toBeCloseTo(0.5, 6)
  })

  it('a wider FOV raises acquisition probability', () => {
    const narrow = acquisitionProb({ ...O, hfov_deg: 1 })
    const wide = acquisitionProb({ ...O, hfov_deg: 4 })
    expect(wide).toBeGreaterThan(narrow)
  })

  it('a larger pointing error lowers acquisition probability', () => {
    const tight = acquisitionProb({ ...O, cue_error_deg: 0.2, pointing_error_deg: 0.2 })
    const loose = acquisitionProb({ ...O, cue_error_deg: 2, pointing_error_deg: 3 })
    expect(loose).toBeLessThan(tight)
  })

  it('→ 1 as pointing error → 0 (perfect pointing / effective gimbal)', () => {
    expect(acquisitionProb({ ...O, cue_error_deg: 1e-6, pointing_error_deg: 1e-6 })).toBeCloseTo(1, 6)
  })

  it('matches the Rayleigh form 1 − exp(−(a²)/(2σ²))', () => {
    const o = { ...O, hfov_deg: 1.5, cue_error_deg: 0.3, pointing_error_deg: 0.4 }
    const a = o.hfov_deg / 2
    const sigma = Math.hypot(o.cue_error_deg, o.pointing_error_deg)
    expect(acquisitionProb(o)).toBeCloseTo(1 - Math.exp(-(a * a) / (2 * sigma * sigma)), 9)
  })
})

describe('atmospheric transmission (Koschmieder / Beer-Lambert)', () => {
  it('→ 1 at zero range, decreases with range', () => {
    expect(atmosphericTransmission(O, 0)).toBeCloseTo(1, 6)
    expect(atmosphericTransmission(O, 3000)).toBeLessThan(atmosphericTransmission(O, 1000))
  })

  it('lower visibility lowers transmission at the same range', () => {
    const clear = atmosphericTransmission({ ...O, visibility_km: 40 }, 2000)
    const haze = atmosphericTransmission({ ...O, visibility_km: 5 }, 2000)
    expect(haze).toBeLessThan(clear)
  })

  it('matches T = exp(-(3.912/V)·R_km)', () => {
    const V = 15
    const R = 2500
    expect(atmosphericTransmission({ ...O, visibility_km: V }, R)).toBeCloseTo(Math.exp(-(3.912 / V) * (R / 1000)), 9)
  })
})

describe('focal length ↔ FOV', () => {
  it('round-trips', () => {
    const f = focalLengthMm(O)
    const hfov = hfovDegFromFocal(f, O.sensor_width_mm)
    expect(hfov).toBeCloseTo(O.hfov_deg, 4)
  })
})
