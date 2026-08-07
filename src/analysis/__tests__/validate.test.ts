import { describe, it, expect } from 'vitest'
import {
  defaultScenario,
  validateScenario,
  validateRanges,
  isScenarioValid,
  autoFixScenario,
  applyCsv,
  scenarioToCsv,
  PARAM_INFO,
  runMonteCarlo,
  type Scenario,
} from '../index'

const scn = (): Scenario => defaultScenario()

describe('parameter range metadata', () => {
  it('every parameter declares a valid range, and the default sits inside it', () => {
    const s = scn()
    for (const p of PARAM_INFO) {
      expect(p.range, `${p.key} has no range`).toBeDefined()
      expect(p.range.min).toBeLessThan(p.range.max)
      const v = p.get(s)
      expect(v, `${p.key} default ${v} outside ${p.range.min}..${p.range.max}`).toBeGreaterThanOrEqual(p.range.min)
      expect(v).toBeLessThanOrEqual(p.range.max)
    }
  })

  it('sweep windows never exceed the validity range', () => {
    for (const p of PARAM_INFO) {
      if (!p.sweep) continue
      expect(p.sweep.min, `${p.key} sweep.min < range.min`).toBeGreaterThanOrEqual(p.range.min)
      expect(p.sweep.max, `${p.key} sweep.max > range.max`).toBeLessThanOrEqual(p.range.max)
    }
  })

  it('the default scenario is clean', () => {
    expect(validateScenario(scn())).toEqual([])
    expect(isScenarioValid(scn())).toBe(true)
  })
})

describe('range validation', () => {
  it('rejects a probability above 1 and hints at the percent mistake', () => {
    const s = scn()
    s.sensor.classify_prob = 95 // typed as a percent
    const issues = validateRanges(s)
    const hit = issues.find((i) => i.key === 'sensor.classify_prob')
    expect(hit?.severity).toBe('error')
    expect(hit?.message).toContain('0~1')
    expect(hit?.message).toContain('퍼센트')
    expect(isScenarioValid(s)).toBe(false)
  })

  it('rejects negative values', () => {
    const s = scn()
    s.optics.pointing_error_deg = -0.3
    expect(validateRanges(s).some((i) => i.key === 'optics.pointing_error_deg')).toBe(true)
  })

  it('rejects NaN and non-integers where integers are required', () => {
    const nan = scn(); nan.threat.speed_m_s = Number.NaN
    expect(validateRanges(nan).some((i) => i.key === 'threat.speed_m_s')).toBe(true)

    const frac = scn(); frac.effector.shot_opportunities = 2.5
    const hit = validateRanges(frac).find((i) => i.key === 'effector.shot_opportunities')
    expect(hit?.message).toContain('정수')
    expect(hit?.suggestion).toBe(3)
  })

  it('autoFix brings an out-of-range scenario back into the valid domain', () => {
    const s = scn()
    s.sensor.classify_prob = 95
    s.c2.decision_reliability = -1
    s.effector.shot_opportunities = 2.5
    const fixed = autoFixScenario(s)
    expect(validateRanges(fixed)).toEqual([])
    expect(fixed.sensor.classify_prob).toBe(1)
    expect(fixed.c2.decision_reliability).toBe(0)
    expect(fixed.effector.shot_opportunities).toBe(3)
  })
})

describe('cross-parameter validation', () => {
  it('flags a quoted Pd at or above the curve ceiling', () => {
    const s = scn()
    s.sensor.pd_at_ref = 0.99 // >= pd_max 0.98
    const hit = validateScenario(s).find((i) => i.key === 'sensor.pd_at_ref')
    expect(hit?.severity).toBe('error')
    expect(hit?.suggestion).toBeLessThan(s.sensor.pd_max)
  })

  it('flags a commit range inside the keep-out ring', () => {
    const s = scn()
    s.effector.commit_range_m = 400 // keep-out is 500
    const hit = validateScenario(s).find((i) => i.key === 'effector.commit_range_m')
    expect(hit?.severity).toBe('error')
    expect(hit?.suggestion).toBeGreaterThan(s.site.keep_out_radius_m)
  })

  it('warns when the analysis window starts inside the required detection range', () => {
    const s = scn()
    s.threat.ingress_range_m = 2000 // required is ~3656
    const hit = validateScenario(s).find((i) => i.key === 'threat.ingress_range_m')
    expect(hit?.severity).toBe('warn')
    expect(isScenarioValid(s)).toBe(true) // a warning must not block the run
  })

  it('warns when recognition N50 exceeds identification N50', () => {
    const s = scn()
    s.optics.n50_recognition = 20
    s.optics.n50_identification = 10
    expect(validateScenario(s).some((i) => i.key === 'optics.n50_recognition')).toBe(true)
  })

  it('warns when EO detection N50 exceeds recognition N50', () => {
    const s = scn()
    s.optics.n50_detection = 12
    s.optics.n50_recognition = 8
    expect(validateScenario(s).some((i) => i.key === 'optics.n50_detection')).toBe(true)
  })

  it('rejects an EO completion separation that would require processing before launch', () => {
    const s = scn()
    s.optics.terminal_recognition_range_m = 2800
    const hit = validateScenario(s).find((i) => i.key === 'optics.terminal_recognition_range_m')
    expect(hit?.severity).toBe('error')
    expect(hit?.suggestion).toBeLessThan(2800)
  })

  it('does not apply the onboard EO timing constraint in radar-only mode', () => {
    const s = scn()
    s.optics.required_discrimination = 'radar_only'
    s.optics.terminal_recognition_range_m = 40000
    expect(validateScenario(s).some((i) => i.key === 'optics.terminal_recognition_range_m')).toBe(false)
  })

  it('errors sort ahead of warnings', () => {
    const s = scn()
    s.threat.ingress_range_m = 2000 // warn
    s.sensor.classify_prob = 95 // error
    const sev = validateScenario(s).map((i) => i.severity)
    expect(sev[0]).toBe('error')
    expect(sev[sev.length - 1]).toBe('warn')
  })
})

describe('CSV import validation', () => {
  it('round-trips the default scenario with nothing out of range', () => {
    const res = applyCsv(defaultScenario(), scenarioToCsv(defaultScenario()))
    expect(res.outOfRange).toEqual([])
  })

  it('reports out-of-range values but still applies them', () => {
    // The classic Excel mistake: a probability written as a percentage.
    const csv = scenarioToCsv(defaultScenario()).replace(
      /(sensor\.classify_prob,)0\.95/,
      '$195',
    )
    const res = applyCsv(defaultScenario(), csv)
    expect(res.outOfRange).toHaveLength(1)
    expect(res.outOfRange[0].key).toBe('sensor.classify_prob')
    expect(res.outOfRange[0].value).toBe(95)
    expect(res.scenario.sensor.classify_prob).toBe(95) // applied, so the user sees it
  })
})

describe('Monte Carlo sampling bounds', () => {
  it('never samples zero shot opportunities (would force P_kill = 0)', () => {
    const s = scn()
    s.effector.shot_opportunities = 1 // worst case: mean 1, sd 0.7 → round() would hit 0 often
    // With a 0-shot sample, P_kill = 1−(1−p)^0 = 0, so the kill gate would fail
    // outright. Compare against a run where kill cannot be the culprit.
    const r = runMonteCarlo(s, { trials: 4000, seed: 7 })
    const analyticKillMin = 1 - Math.pow(1 - s.effector.single_shot_pk_net, 1)
    // Kill-gate first-failures must not exceed what a floor-of-1 model allows.
    const killFrac = r.gate_failure_counts.kill / r.trials
    expect(killFrac).toBeLessThanOrEqual(1 - analyticKillMin + 0.02)
  })

  it('first-failure counts plus negated trials equal the trial count', () => {
    const r = runMonteCarlo(scn(), { trials: 2000, seed: 11 })
    const failures = Object.values(r.gate_failure_counts).reduce((a, b) => a + b, 0)
    expect(failures + Math.round(r.negated_fraction * r.trials)).toBe(r.trials)
  })

  it('timely detection can appear as the first failure under sampled uncertainty', () => {
    const r = runMonteCarlo(scn(), { trials: 2000, seed: 3 })
    expect(r.gate_failure_counts.detect).toBeGreaterThan(0)
    expect(r.gate_failure_counts.detect).toBeLessThan(r.trials)
  })

  it('outcome-based negation tracks the analytic mean', () => {
    const r = runMonteCarlo(scn(), { trials: 5000, seed: 99 })
    expect(Math.abs(r.negated_fraction - r.p_negate_mean)).toBeLessThan(0.03)
    expect(r.ci95[0]).toBeLessThanOrEqual(r.negated_fraction)
    expect(r.ci95[1]).toBeGreaterThanOrEqual(r.negated_fraction)
  })
})
