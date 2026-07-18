import { describe, it, expect } from 'vitest'
import {
  defaultScenario,
  PARAMS,
  getParam,
  sweep1D,
  sweep2D,
  tornado,
  solveForTarget,
  computeMoe,
} from '../index'

describe('parameter registry', () => {
  it('get/set round-trips without mutating the original', () => {
    const s = defaultScenario()
    const p = getParam('effector.cruise_speed_m_s')!
    const s2 = p.set(s, 99)
    expect(p.get(s2)).toBe(99)
    expect(p.get(s)).toBe(defaultScenario().effector.cruise_speed_m_s) // original untouched
  })
})

describe('sweep1D', () => {
  it('returns the requested number of points spanning the range', () => {
    const p = getParam('sensor.ref_detection_range_m')!
    const pts = sweep1D(defaultScenario(), p, { min: 1000, max: 5000, steps: 9 })
    expect(pts).toHaveLength(9)
    expect(pts[0].x).toBe(1000)
    expect(pts[8].x).toBe(5000)
    for (const pt of pts) {
      expect(pt.y).toBeGreaterThanOrEqual(0)
      expect(pt.y).toBeLessThanOrEqual(1)
    }
  })

  it('P_negate is non-decreasing as camera resolution grows', () => {
    // Resolution cleanly increases pixels-on-target → recognition → P_classify,
    // with no competing effect, so P_negate is monotone non-decreasing.
    const p = getParam('optics.h_resolution_px')!
    const pts = sweep1D(defaultScenario(), p, { min: 640, max: 7680, steps: 20 })
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].y).toBeGreaterThanOrEqual(pts[i - 1].y - 1e-9)
    }
  })
})

describe('sweep2D', () => {
  it('produces a grid with matching dimensions and bounded z', () => {
    const x = getParam('threat.speed_m_s')!
    const y = getParam('c2.decision_latency_s')!
    const g = sweep2D(defaultScenario(), x, y, { xSteps: 6, ySteps: 5 })
    expect(g.xs).toHaveLength(6)
    expect(g.ys).toHaveLength(5)
    expect(g.z).toHaveLength(5)
    expect(g.z[0]).toHaveLength(6)
    expect(g.zmin).toBeGreaterThanOrEqual(0)
    expect(g.zmax).toBeLessThanOrEqual(1)
  })
})

describe('tornado sensitivity', () => {
  it('ranks parameters by absolute impact and covers all params', () => {
    const rows = tornado(defaultScenario(), 0.2)
    expect(rows).toHaveLength(PARAMS.length)
    for (let i = 1; i < rows.length; i++) {
      expect(Math.abs(rows[i - 1].impact)).toBeGreaterThanOrEqual(Math.abs(rows[i].impact) - 1e-12)
    }
  })
})

describe('solveForTarget (spec inversion)', () => {
  it('finds the minimum camera resolution for a target P_negate (increasing)', () => {
    // Target 0.4: reachable via resolution alone. (With the gimbal-less
    // acquisition term now capping P_classify, higher targets like 0.6 are
    // unreachable by resolution alone — recognition saturates but P_acq caps it.)
    const p = getParam('optics.h_resolution_px')!
    const res = solveForTarget(defaultScenario(), p, 0.4, { min: 320, max: 12000, steps: 201 })
    expect(res.direction).toBe('increasing')
    expect(res.satisfy_side).toBe('gte')
    expect(res.found).toBe(true)
    expect(res.threshold_value).not.toBeNull()
    // Boundary property: below the solved resolution the target fails, above it meets.
    const below = computeMoe(p.set(defaultScenario(), res.threshold_value! * 0.6)).p_negate
    const above = computeMoe(p.set(defaultScenario(), res.threshold_value! * 1.6)).p_negate
    expect(below).toBeLessThan(0.4 + 1e-6)
    expect(above).toBeGreaterThanOrEqual(0.4 - 1e-6)
  })

  it('detects a decreasing relationship for decision latency', () => {
    const p = getParam('c2.decision_latency_s')!
    const res = solveForTarget(defaultScenario(), p, 0.5, { min: 0, max: 60, steps: 121 })
    expect(res.direction).toBe('decreasing')
    if (res.found && res.threshold_value != null) {
      expect(res.satisfy_side).toBe('lte')
    }
  })
})
