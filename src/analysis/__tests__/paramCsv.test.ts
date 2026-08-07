import { describe, it, expect } from 'vitest'
import {
  defaultScenario,
  scenarioToCsv,
  applyCsv,
  parseCsv,
  PARAM_INFO,
  PARAMS,
  computeMoe,
} from '../index'

describe('param registry', () => {
  it('every sweepable PARAM_INFO entry appears in trade PARAMS', () => {
    const sweepable = PARAM_INFO.filter((p) => p.sweep).map((p) => p.key).sort()
    const params = PARAMS.map((p) => p.key).sort()
    expect(params).toEqual(sweepable)
  })

  it('all get/set round-trip', () => {
    const s = defaultScenario()
    for (const p of PARAM_INFO) {
      const s2 = p.set(s, 1.23)
      expect(p.get(s2)).toBeCloseTo(1.23, 9)
    }
  })
})

describe('CSV round-trip', () => {
  it('export → import reproduces the scenario numerically', () => {
    const s = defaultScenario()
    s.threat.speed_m_s = 44
    s.optics.hfov_deg = 3.3
    s.optics.required_discrimination = 'detection'
    s.effector.payload = 'shotgun'
    const csv = scenarioToCsv(s)
    const { scenario: back, applied, unknownKeys } = applyCsv(defaultScenario(), csv)
    expect(unknownKeys).toHaveLength(0)
    expect(applied).toBeGreaterThan(10)
    expect(back.threat.speed_m_s).toBeCloseTo(44, 9)
    expect(back.optics.hfov_deg).toBeCloseTo(3.3, 9)
    expect(back.optics.required_discrimination).toBe('detection')
    expect(back.effector.payload).toBe('shotgun')
    // The full MOE should match after the round-trip.
    expect(computeMoe(back).p_negate).toBeCloseTo(computeMoe(s).p_negate, 9)
  })

  it('parses quoted fields containing commas', () => {
    const recs = parseCsv('a,"b,c",d\r\n1,"x ""q""",3')
    expect(recs[0]).toEqual(['a', 'b,c', 'd'])
    expect(recs[1]).toEqual(['1', 'x "q"', '3'])
  })

  it('ignores unknown keys and reports them', () => {
    const csv = '구분,파라미터,key,값\nX,Y,not.a.real.key,5'
    const { applied, unknownKeys } = applyCsv(defaultScenario(), csv)
    expect(applied).toBe(0)
    expect(unknownKeys).toContain('not.a.real.key')
  })
})
