import { describe, it, expect } from 'vitest'
import { computeCoverage, defaultScenario, haversine } from '../index'

describe('coverage sweep', () => {
  it('produces one sample per bearing with values in range', () => {
    const cov = computeCoverage(defaultScenario(), { bearings: 36 })
    expect(cov.samples).toHaveLength(36)
    expect(cov.mean_p_negate).toBeGreaterThanOrEqual(0)
    expect(cov.mean_p_negate).toBeLessThanOrEqual(1)
    expect(cov.defended_fraction).toBeGreaterThanOrEqual(0)
    expect(cov.defended_fraction).toBeLessThanOrEqual(1)
    for (const s of cov.samples) {
      expect(s.p_negate).toBeGreaterThanOrEqual(0)
      expect(s.p_negate).toBeLessThanOrEqual(1)
    }
  })

  it('is rotationally symmetric for a radial-symmetric default (all bearings equal)', () => {
    const cov = computeCoverage(defaultScenario(), { bearings: 24 })
    const first = cov.samples[0].p_negate
    for (const s of cov.samples) {
      expect(s.p_negate).toBeCloseTo(first, 6)
    }
    // Radial symmetry ⇒ every bearing is on the same side of the threshold,
    // so the defended fraction is exactly 0 or 1.
    expect([0, 1]).toContain(cov.defended_fraction)
  })

  it('footprint points sit at the footprint radius from the asset', () => {
    const cov = computeCoverage(defaultScenario(), { bearings: 12 })
    for (const s of cov.samples) {
      const d = haversine(cov.asset, s.point)
      // Flat-earth projection vs great-circle differ by ~0.1% at these
      // ranges — fine for a map overlay. Assert within 0.5% relative.
      expect(Math.abs(d - s.footprint_radius_m) / s.footprint_radius_m).toBeLessThan(0.005)
    }
  })

  it('a huge decision latency makes every bearing undefended (footprint = keep-out)', () => {
    const s = defaultScenario()
    s.c2.decision_latency_s = 120
    const cov = computeCoverage(s, { bearings: 12 })
    expect(cov.defended_fraction).toBe(0)
    for (const smp of cov.samples) {
      expect(smp.feasible).toBe(false)
      expect(smp.footprint_radius_m).toBeCloseTo(cov.keep_out_radius_m, 6)
    }
  })
})
