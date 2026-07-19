import { describe, it, expect } from 'vitest'
import {
  defaultScenario,
  computeMoe,
  detectionRangeForRcs,
  pdAtRange,
  cumulativePk,
  reachSolution,
  computeDetection,
  type Scenario,
} from '../index'

// Helper: deep-clone the default scenario so each test mutates freely.
function scn(): Scenario {
  return defaultScenario()
}

describe('detection model', () => {
  it('scales detection range with RCS^(1/4)', () => {
    const s = scn().sensor
    // 16× the reference RCS → 2× the range (16^0.25 = 2).
    const r = detectionRangeForRcs(s, s.ref_rcs_m2 * 16)
    expect(r).toBeCloseTo(s.ref_detection_range_m * 2, 5)
  })

  it('pd is pd_max/2 at the nominal detection range and higher when closer', () => {
    const s = scn().sensor
    const rDet = detectionRangeForRcs(s, s.ref_rcs_m2)
    const pdAtEdge = pdAtRange(s, s.ref_rcs_m2, rDet)
    const pdClose = pdAtRange(s, s.ref_rcs_m2, rDet * 0.3)
    expect(pdAtEdge).toBeCloseTo(s.pd_max / 2, 2)
    expect(pdClose).toBeGreaterThan(pdAtEdge)
  })

  it('smaller RCS lowers cumulative detection probability', () => {
    const big = scn()
    const small = scn()
    small.threat.rcs_m2 = big.threat.rcs_m2 / 100
    const pBig = computeDetection(big.sensor, big.threat, big.site.keep_out_radius_m).cumulative_pd
    const pSmall = computeDetection(small.sensor, small.threat, small.site.keep_out_radius_m).cumulative_pd
    expect(pSmall).toBeLessThan(pBig)
  })
})

describe('engagement kill probability', () => {
  it('cumulative Pk grows with shot opportunities and matches 1-(1-p)^n', () => {
    expect(cumulativePk(0.5, 1)).toBeCloseTo(0.5, 6)
    expect(cumulativePk(0.5, 2)).toBeCloseTo(0.75, 6)
    expect(cumulativePk(0.5, 3)).toBeCloseTo(0.875, 6)
  })

  it('is clamped to [0,1]', () => {
    expect(cumulativePk(1.5, 2)).toBe(1)
    expect(cumulativePk(-0.2, 2)).toBe(0)
  })
})

describe('reach kinematics monotonicity', () => {
  it('faster threat reduces the standoff margin', () => {
    const slow = scn()
    const fast = scn()
    fast.threat.speed_m_s = slow.threat.speed_m_s * 2
    const dSlow = computeDetection(slow.sensor, slow.threat, slow.site.keep_out_radius_m)
    const dFast = computeDetection(fast.sensor, fast.threat, fast.site.keep_out_radius_m)
    const mSlow = reachSolution(slow, dSlow.detect_at_range_m).margin_m
    const mFast = reachSolution(fast, dFast.detect_at_range_m).margin_m
    expect(mFast).toBeLessThan(mSlow)
  })

  it('a large enough decision latency makes the engagement infeasible', () => {
    const s = scn()
    s.c2.decision_latency_s = 120 // threat crosses keep-out long before launch
    const d = computeDetection(s.sensor, s.threat, s.site.keep_out_radius_m)
    const r = reachSolution(s, d.detect_at_range_m)
    expect(r.feasible).toBe(false)
  })

  it('short endurance caps usable reach and can make intercept infeasible', () => {
    const s = scn()
    s.effector.endurance_s = 10 // v_i·10 = 500 m ≪ intercept range
    const d = computeDetection(s.sensor, s.threat, s.site.keep_out_radius_m)
    const r = reachSolution(s, d.detect_at_range_m)
    expect(r.feasible).toBe(false)
    expect(r.reach_probability).toBe(0)
  })

  it('reach probability is continuous: larger margin σ softens toward 0.5 near the edge', () => {
    const s = scn()
    const d = computeDetection(s.sensor, s.threat, s.site.keep_out_radius_m)
    // small σ → near-certain when margin is comfortably positive
    s.effector.reach_margin_sigma_m = 1
    expect(reachSolution(s, d.detect_at_range_m).reach_probability).toBeGreaterThan(0.99)
    // huge σ → margin uncertainty dominates, pulls toward 0.5
    s.effector.reach_margin_sigma_m = 100000
    expect(reachSolution(s, d.detect_at_range_m).reach_probability).toBeLessThan(0.9)
  })
})

describe('computeMoe composition', () => {
  it('returns a probability in [0,1] with leakage = 1 - p_negate', () => {
    const r = computeMoe(scn())
    expect(r.p_negate).toBeGreaterThanOrEqual(0)
    expect(r.p_negate).toBeLessThanOrEqual(1)
    expect(r.leakage).toBeCloseTo(1 - r.p_negate, 10)
  })

  it('default scenario is feasible and negates the threat with meaningful probability', () => {
    const r = computeMoe(scn())
    expect(r.feasible).toBe(true)
    expect(r.p_negate).toBeGreaterThan(0.3)
  })

  it('infeasible geometry drives p_reach and p_negate to zero', () => {
    const s = scn()
    s.c2.decision_latency_s = 120
    const r = computeMoe(s)
    expect(r.breakdown.p_reach).toBe(0)
    expect(r.p_negate).toBe(0)
    expect(r.leakage).toBe(1)
  })

  it('p_negate never exceeds any single gate probability', () => {
    const r = computeMoe(scn())
    const { p_detect, p_classify, p_decision, p_reach, p_kill } = r.breakdown
    for (const gate of [p_detect, p_classify, p_decision, p_reach, p_kill]) {
      expect(r.p_negate).toBeLessThanOrEqual(gate + 1e-9)
    }
  })
})
