import { describe, it, expect } from 'vitest'
import {
  defaultScenario,
  computeMoe,
  detectionRangeForRcs,
  pdAtRange,
  cumulativePk,
  reachSolution,
  computeDetection,
  diagnoseBottleneck,
  pdHalfPointRange,
  rangeForPd,
  type Scenario,
} from '../index'

// Helper: deep-clone the default scenario so each test mutates freely.
function scn(): Scenario {
  return defaultScenario()
}

describe('detection model', () => {
  it('scales detection range with RCS^(1/4)', () => {
    const s = scn().sensor
    // 16× the reference RCS → 2× the range (16^0.25 = 2). The scaled quantity is
    // the logistic centre, which is derived from (quoted range, Pd there).
    const r = detectionRangeForRcs(s, s.ref_rcs_m2 * 16)
    expect(r).toBeCloseTo(pdHalfPointRange(s) * 2, 5)
  })

  it('intuitive input round-trips: quoted range is exactly where pd = pd_at_ref', () => {
    const s = scn().sensor
    // The user says "RCS₀ at R_q with Pd = p_q"; the model must reproduce it.
    expect(pdAtRange(s, s.ref_rcs_m2, s.ref_detection_range_m)).toBeCloseTo(s.pd_at_ref, 9)
    expect(rangeForPd(s, s.ref_rcs_m2, s.pd_at_ref)).toBeCloseTo(s.ref_detection_range_m, 6)
  })

  it('logistic centre sits BEYOND the quoted range when the quoted Pd > pd_max/2', () => {
    const s = scn().sensor
    // Feeding "Pd 0.9 @ 3 km" straight in as the centre would model a worse radar.
    expect(s.pd_at_ref).toBeGreaterThan(s.pd_max / 2)
    expect(pdHalfPointRange(s)).toBeGreaterThan(s.ref_detection_range_m)
  })

  it('a HIGHER quoted Pd at the same quoted range means a better radar', () => {
    const strict = scn().sensor // "Pd 0.9 @ 3 km"
    const loose = { ...strict, pd_at_ref: 0.5 } // only "Pd 0.5 @ 3 km"
    // Holding 0.9 out at 3 km takes a curve pushed farther out than one that
    // only manages 0.5 there — so the whole detection envelope is longer.
    expect(pdHalfPointRange(strict)).toBeGreaterThan(pdHalfPointRange(loose))
    expect(pdAtRange(strict, strict.ref_rcs_m2, 4000)).toBeGreaterThan(
      pdAtRange(loose, loose.ref_rcs_m2, 4000),
    )
  })

  it('pd is pd_max/2 at the nominal detection range and higher when closer', () => {
    const s = scn().sensor
    const rDet = detectionRangeForRcs(s, s.ref_rcs_m2)
    const pdAtEdge = pdAtRange(s, s.ref_rcs_m2, rDet)
    const pdClose = pdAtRange(s, s.ref_rcs_m2, rDet * 0.3)
    expect(pdAtEdge).toBeCloseTo(s.pd_max / 2, 2)
    expect(pdClose).toBeGreaterThan(pdAtEdge)
  })

  it('asset-relative target altitude does not leak into the camera↔target EO range', () => {
    const low = scn(); low.threat.altitude_m_agl = 85
    const high = scn(); high.threat.altitude_m_agl = 3000
    const rLow = computeMoe(low)
    const rHigh = computeMoe(high)
    expect(rHigh.optics.classify_range_m).toBeCloseTo(rLow.optics.classify_range_m, 9)
    expect(rHigh.optics.recognition_prob).toBeCloseTo(rLow.optics.recognition_prob, 9)
  })

  it('smaller RCS lowers timely cumulative detection probability', () => {
    const big = scn()
    const small = scn()
    small.threat.rcs_m2 = big.threat.rcs_m2 / 100
    const pBig = computeMoe(big).breakdown.p_detect
    const pSmall = computeMoe(small).breakdown.p_detect
    expect(pSmall).toBeLessThan(pBig)
  })

  it('uses detection accumulated only until the doctrinal launch deadline', () => {
    const s = scn()
    const r = computeMoe(s)
    expect(r.detection.timely_cutoff_range_m).toBeCloseTo(r.reach.required_detection_range_m, 6)
    expect(r.breakdown.p_detect).toBeCloseTo(r.detection.cumulative_pd_in_time, 12)
    expect(r.detection.cumulative_pd_in_time).toBeLessThan(1)
    expect(r.detection.cumulative_pd_before_keep_out).toBeGreaterThanOrEqual(
      r.detection.cumulative_pd_in_time,
    )
    expect(r.detection.looks_in_time).toBeLessThan(r.detection.looks_before_keep_out)
  })

  it('does not credit a radar that only becomes reliable after the launch deadline', () => {
    const s = scn()
    s.sensor.ref_detection_range_m = 1000
    const r = computeMoe(s)
    expect(r.detection.cumulative_pd_before_keep_out).toBeCloseTo(1, 12)
    expect(r.breakdown.p_detect).toBeCloseTo(0.02737, 4)
    expect(r.breakdown.p_detect).toBeLessThan(0.05)
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

describe('doctrine-driven engagement (commit range)', () => {
  // Helper: solve the full chain for a scenario.
  const solve = (s: Scenario) => {
    const d = computeDetection(s.sensor, s.threat, s.site.keep_out_radius_m)
    return reachSolution(s, d.detect_at_range_m)
  }

  it('required detection range = commit + v_t · t_react', () => {
    const s = scn()
    const r = solve(s)
    const tReact = s.c2.decision_latency_s + s.effector.launch_delay_s
    expect(r.required_detection_range_m).toBeCloseTo(
      s.effector.commit_range_m + s.threat.speed_m_s * tReact,
      6,
    )
  })

  it('launches AT the commit range when detection is adequate, not earlier', () => {
    const s = scn()
    s.sensor.ref_detection_range_m = 6000 // far more detection than required
    const r = solve(s)
    expect(r.detection_limited).toBe(false)
    expect(r.threat_range_at_launch_m).toBeCloseTo(s.effector.commit_range_m, 6)
    expect(r.detection_margin_m).toBeGreaterThan(0)
  })

  it('detection beyond the requirement buys margin but changes nothing else', () => {
    const near = scn(); near.sensor.ref_detection_range_m = 3200
    const far = scn(); far.sensor.ref_detection_range_m = 6000
    const rNear = computeMoe(near), rFar = computeMoe(far)
    expect(rNear.reach.detection_limited).toBe(false)
    expect(rFar.reach.detection_limited).toBe(false)
    // The whole point: better detection must NOT move the engagement.
    expect(rFar.reach.threat_range_at_launch_m).toBeCloseTo(rNear.reach.threat_range_at_launch_m, 6)
    expect(rFar.optics.classify_range_m).toBeCloseTo(rNear.optics.classify_range_m, 6)
    expect(rFar.p_negate).toBeCloseTo(rNear.p_negate, 9)
    // ...it only widens the detection margin.
    expect(rFar.reach.detection_margin_m).toBeGreaterThan(rNear.reach.detection_margin_m)
  })

  it('changing the Pd curve ceiling only changes the timely-detection gate', () => {
    const base = computeMoe(scn())
    for (const pd_max of [0.92, 0.95, 0.98, 0.99]) {
      const s = scn(); s.sensor.pd_max = pd_max
      const r = computeMoe(s)
      expect(r.reach.threat_range_at_launch_m).toBeCloseTo(base.reach.threat_range_at_launch_m, 9)
      expect(r.optics.classify_range_m).toBeCloseTo(base.optics.classify_range_m, 9)
      expect(r.p_negate / r.breakdown.p_detect).toBeCloseTo(
        base.p_negate / base.breakdown.p_detect,
        9,
      )
    }
  })

  it('falls back to "launch as soon as possible" when detection is too late', () => {
    const s = scn()
    s.sensor.ref_detection_range_m = 1500 // well inside the required ~3.46 km
    const r = solve(s)
    const tReact = r.budget.react_total_s
    expect(r.detection_limited).toBe(true)
    expect(r.detection_margin_m).toBeLessThan(0)
    expect(r.threat_range_at_launch_m).toBeCloseTo(r.detect_at_range_m - s.threat.speed_m_s * tReact, 6)
    expect(r.threat_range_at_launch_m).toBeLessThan(s.effector.commit_range_m)
  })

  it('solves EO processing only after launch in camera↔target relative range', () => {
    const s = scn()
    const r = computeMoe(s)
    const closing = s.effector.cruise_speed_m_s + s.threat.speed_m_s
    expect(r.terminal_eo.processing_start_separation_m).toBeCloseTo(
      s.optics.terminal_recognition_range_m + closing * s.sensor.classify_time_s,
      6,
    )
    expect(r.terminal_eo.processing_start_after_launch_s).toBeGreaterThanOrEqual(0)
    expect(r.terminal_eo.recognition_after_launch_s).toBeCloseTo(
      r.terminal_eo.processing_start_after_launch_s + s.sensor.classify_time_s,
      6,
    )
  })

  it('bottleneck flags a late radar as an explicit timely-detection shortfall', () => {
    const s = scn()
    s.sensor.ref_detection_range_m = 1500
    const r = computeMoe(s)
    expect(r.reach.detection_limited).toBe(true)
    expect(r.breakdown.p_detect).toBeLessThan(r.breakdown.p_classify)
    expect(diagnoseBottleneck(r).recommendation).toContain('탐지 제약')
  })

  it('a longer commit range buys standoff without changing the EO completion separation', () => {
    const near = scn(); near.effector.commit_range_m = 1500
    const far = scn(); far.effector.commit_range_m = 3000
    const rNear = computeMoe(near), rFar = computeMoe(far)
    expect(rFar.optics.classify_range_m).toBeCloseTo(rNear.optics.classify_range_m, 9)
    expect(rFar.optics.recognition_prob).toBeCloseTo(rNear.optics.recognition_prob, 9)
    expect(rFar.reach.required_detection_range_m).toBeGreaterThan(rNear.reach.required_detection_range_m)
    // ...and buys standoff: the intercept happens farther from the asset.
    expect(rFar.reach.intercept_range_m).toBeGreaterThan(rNear.reach.intercept_range_m)
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
    // Launch occurs at 3 km; onboard EO then completes at its own 500 m
    // camera↔target separation before intercept.
    const r = computeMoe(scn())
    expect(r.feasible).toBe(true)
    expect(r.p_negate).toBeGreaterThan(0.2)
  })

  it('infeasible geometry drives p_reach and p_negate to zero', () => {
    const s = scn()
    s.c2.decision_latency_s = 120
    const r = computeMoe(s)
    expect(r.breakdown.p_reach).toBe(0)
    expect(r.p_negate).toBe(0)
    expect(r.leakage).toBe(1)
  })

  it('bottleneck diagnosis picks the lowest gate and gives a recommendation', () => {
    const r = computeMoe(scn())
    const d = diagnoseBottleneck(r)
    const gates = Object.values(r.breakdown)
    expect(d.value).toBeCloseTo(Math.min(...gates), 9)
    expect(d.recommendation.length).toBeGreaterThan(0)
  })

  it('bottleneck flags classify sub-factor when classify is limiting', () => {
    const s = scn()
    s.optics.visibility_km = 0.8 // fog → transmission dominates the classify loss
    const d = diagnoseBottleneck(computeMoe(s))
    expect(d.stage).toBe('classify')
    expect(d.subFactor?.label).toContain('대기 투과')
  })

  it('pre-launch P_decision is independent of the EO image produced after launch', () => {
    const s = scn()
    s.c2.decision_recognition_coupling = 1 // legacy saved-scenario field
    s.threat.characteristic_size_m = 0.15
    expect(computeMoe(s).breakdown.p_decision).toBeCloseTo(s.c2.decision_reliability, 9)
  })

  it('engagement ROE (required_discrimination) restructures the kill chain', () => {
    const radar = scn(); radar.optics.required_discrimination = 'radar_only'
    const det = scn(); det.optics.required_discrimination = 'detection'
    const rec = scn(); rec.optics.required_discrimination = 'recognition'
    const id = scn(); id.optics.required_discrimination = 'identification'
    const rRadar = computeMoe(radar), rDet = computeMoe(det), rRec = computeMoe(rec), rId = computeMoe(id)
    expect(rRadar.optics.eo_gate_applied).toBe(false)
    expect(rDet.optics.eo_gate_applied).toBe(true)
    expect(rRec.optics.eo_gate_applied).toBe(true)
    expect(rRadar.p_negate).toBeGreaterThan(rDet.p_negate) // no EO gate is easiest
    expect(rDet.p_negate).toBeGreaterThan(rRec.p_negate) // EO detection is easier than recognition
    expect(rRec.p_negate).toBeGreaterThan(rId.p_negate) // identification is stricter
  })

  it('radar-only P_negate is independent of EO pointing error', () => {
    const a = scn(); a.optics.required_discrimination = 'radar_only'; a.optics.pointing_error_deg = 0.4
    const b = scn(); b.optics.required_discrimination = 'radar_only'; b.optics.pointing_error_deg = 3.0
    expect(computeMoe(a).p_negate).toBeCloseTo(computeMoe(b).p_negate, 9)
  })

  it('separates radar-track confidence from the EO task ceiling', () => {
    const radarA = scn(); radarA.optics.required_discrimination = 'radar_only'; radarA.sensor.classify_prob = 0.2
    const radarB = scn(); radarB.optics.required_discrimination = 'radar_only'; radarB.sensor.classify_prob = 0.9
    expect(computeMoe(radarA).p_negate).toBeCloseTo(computeMoe(radarB).p_negate, 9)

    const radarWeak = scn(); radarWeak.optics.required_discrimination = 'radar_only'; radarWeak.sensor.radar_track_confidence = 0.5
    expect(computeMoe(radarWeak).p_negate).toBeLessThan(computeMoe(radarA).p_negate)

    const eoA = scn(); eoA.optics.required_discrimination = 'recognition'; eoA.sensor.radar_track_confidence = 0.2
    const eoB = scn(); eoB.optics.required_discrimination = 'recognition'; eoB.sensor.radar_track_confidence = 0.9
    expect(computeMoe(eoA).p_negate).toBeCloseTo(computeMoe(eoB).p_negate, 9)
  })

  it('false-engagement option: null when off; computed & looser-ROE-worse when on', () => {
    expect(computeMoe(scn()).false_engagement).toBeNull() // off by default

    const det = scn(); det.c2.false_engagement_enabled = true; det.optics.required_discrimination = 'radar_only'
    const id = scn(); id.c2.false_engagement_enabled = true; id.optics.required_discrimination = 'identification'
    const fDet = computeMoe(det).false_engagement!
    const fId = computeMoe(id).false_engagement!
    expect(fDet).toBeCloseTo(det.c2.non_threat_rate * det.c2.false_pass_detection, 9)
    expect(fDet).toBeGreaterThan(fId) // radar-only ROE → more wrong engagements

    // enabling the option does not change p_negate (it is a separate metric)
    const detOff = scn(); detOff.optics.required_discrimination = 'radar_only'
    expect(computeMoe(det).p_negate).toBeCloseTo(computeMoe(detOff).p_negate, 9)
  })

  it('p_negate never exceeds any single gate probability', () => {
    const r = computeMoe(scn())
    const { p_detect, p_classify, p_decision, p_reach, p_kill } = r.breakdown
    for (const gate of [p_detect, p_classify, p_decision, p_reach, p_kill]) {
      expect(r.p_negate).toBeLessThanOrEqual(gate + 1e-9)
    }
  })
})
