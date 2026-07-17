import { describe, it, expect } from 'vitest'
import { runMonteCarlo, mulberry32, defaultScenario } from '../index'

describe('mulberry32 rng', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 5; i++) expect(a.next()).toBe(b.next())
  })
  it('produces values in [0,1)', () => {
    const r = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('runMonteCarlo', () => {
  it('is reproducible with the same seed', () => {
    const s = defaultScenario()
    const a = runMonteCarlo(s, { trials: 2000, seed: 123 })
    const b = runMonteCarlo(s, { trials: 2000, seed: 123 })
    expect(a.negated_fraction).toBe(b.negated_fraction)
    expect(a.p_negate_mean).toBe(b.p_negate_mean)
  })

  it('returns fractions in [0,1] with a valid CI bracketing the estimate', () => {
    const r = runMonteCarlo(defaultScenario(), { trials: 3000, seed: 1 })
    expect(r.negated_fraction).toBeGreaterThanOrEqual(0)
    expect(r.negated_fraction).toBeLessThanOrEqual(1)
    expect(r.leakage_fraction).toBeCloseTo(1 - r.negated_fraction, 10)
    expect(r.ci95[0]).toBeLessThanOrEqual(r.negated_fraction)
    expect(r.ci95[1]).toBeGreaterThanOrEqual(r.negated_fraction)
  })

  it('histogram counts sum to the trial count', () => {
    const trials = 1500
    const r = runMonteCarlo(defaultScenario(), { trials, seed: 9 })
    const total = r.histogram.reduce((acc, b) => acc + b.count, 0)
    expect(total).toBe(trials)
  })

  it('MC outcome estimate tracks the analytic mean within a few percent', () => {
    // With bearing_uniform off, the sampled scenario stays near the
    // (radial-symmetric) default so the outcome frequency should sit
    // close to the analytic P_negate mean.
    const r = runMonteCarlo(defaultScenario(), {
      trials: 8000,
      seed: 2024,
      uncertainty: { bearing_uniform: false },
    })
    expect(Math.abs(r.negated_fraction - r.p_negate_mean)).toBeLessThan(0.03)
  })

  it('high uncertainty in decision latency pushes leakage up', () => {
    const base = defaultScenario()
    const calm = runMonteCarlo(base, {
      trials: 4000,
      seed: 5,
      uncertainty: { decision_latency_sd_s: 0.1, bearing_uniform: false },
    })
    const jittery = runMonteCarlo(base, {
      trials: 4000,
      seed: 5,
      uncertainty: { decision_latency_sd_s: 30, bearing_uniform: false },
    })
    expect(jittery.leakage_fraction).toBeGreaterThan(calm.leakage_fraction)
  })
})
