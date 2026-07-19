// ────────────────────────────────────────────────────────────
// Analysis core · time budget + engagement kinematics.
//
// Scalar radial model: the threat flies straight in toward the
// asset along one bearing; the interceptor launches from a pad
// near the asset and flies outbound along the same radial. Both
// travel at constant speed. This is a first-order geometry — good
// enough to answer "does the interceptor reach the threat outside
// the keep-out ring, in time?" and to expose the timeline budget.
//
//   t=0 (detect): threat at R_det, closing at v_t.
//   react window: classify + operator decision + launch delay.
//   at launch: threat at R_launch = R_det − v_t·t_react.
//   interceptor from pad (R_pad) flies out at v_i; threat flies in
//   at v_t → they close the gap (R_launch − R_pad) at (v_i + v_t).
//   intercept range from asset R_int = R_pad + v_i·t_meet.
//
// Feasible iff the intercept happens before the threat crosses the
// keep-out ring, within the interceptor's max reach, and the threat
// hasn't already passed the launch point at approval time.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'

export interface TimeBudget {
  classify_s: number
  decision_s: number
  launch_delay_s: number
  react_total_s: number
}

export interface ReachSolution {
  detect_at_range_m: number
  budget: TimeBudget
  /** Threat range from asset at the moment the interceptor launches (m). */
  threat_range_at_launch_m: number
  /** Time from launch to intercept (s). */
  time_to_meet_s: number
  /** Range from asset where intercept occurs (m). */
  intercept_range_m: number
  /** True if the engagement geometry closes outside keep-out and within reach. */
  feasible: boolean
  /** Reason for infeasibility (empty when feasible). */
  reason: string
  /** Standoff margin beyond keep-out (m); negative = intercept inside keep-out. */
  margin_m: number
  /** Time margin: seconds the threat is from the keep-out ring at intercept. */
  margin_s: number
  /**
   * Continuous reach probability (0..1): Φ(margin/σ) softened by margin
   * uncertainty, and 0 if the geometry hard-fails (can't launch, or intercept
   * beyond usable reach). σ→0 recovers the hard 0/1 gate.
   */
  reach_probability: number
}

// Standard-normal CDF via an erf approximation (Abramowitz-Stegun 7.1.26).
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/** Reach probability from the standoff margin and its 1σ uncertainty. */
function reachProbability(margin_m: number, sigma_m: number): number {
  if (sigma_m <= 0) return margin_m > 0 ? 1 : 0
  return Math.min(1, Math.max(0, normCdf(margin_m / sigma_m)))
}

export function timeBudget(s: Scenario): TimeBudget {
  const classify_s = s.sensor.classify_time_s
  const decision_s = s.c2.decision_latency_s
  const launch_delay_s = s.effector.launch_delay_s
  return {
    classify_s,
    decision_s,
    launch_delay_s,
    react_total_s: classify_s + decision_s + launch_delay_s,
  }
}

export function reachSolution(s: Scenario, detect_at_range_m: number): ReachSolution {
  const budget = timeBudget(s)
  const vT = s.threat.speed_m_s
  const vI = s.effector.cruise_speed_m_s
  const rPad = s.effector.launch_pad_range_from_asset_m
  const keepOut = s.site.keep_out_radius_m
  // Usable reach is the lesser of the quoted max range and how far the
  // interceptor can actually fly on its endurance (v_i · endurance).
  const enduranceReach = vI * s.effector.endurance_s
  const maxReach = Math.min(s.effector.max_engagement_range_m, enduranceReach)

  const threat_range_at_launch_m = detect_at_range_m - vT * budget.react_total_s

  const base: Omit<ReachSolution, 'feasible' | 'reason' | 'margin_m' | 'margin_s' | 'reach_probability'> = {
    detect_at_range_m,
    budget,
    threat_range_at_launch_m,
    time_to_meet_s: 0,
    intercept_range_m: 0,
  }

  // Threat already inside keep-out (or past the pad) before we can launch.
  if (threat_range_at_launch_m <= Math.max(keepOut, rPad)) {
    return {
      ...base,
      feasible: false,
      reason: 'threat crosses keep-out before launch',
      margin_m: threat_range_at_launch_m - keepOut,
      margin_s: (threat_range_at_launch_m - keepOut) / vT,
      reach_probability: 0, // cannot even launch in time
    }
  }

  const gap = threat_range_at_launch_m - rPad
  const closingSpeed = vI + vT
  const time_to_meet_s = gap / closingSpeed
  const intercept_range_m = rPad + vI * time_to_meet_s

  const margin_m = intercept_range_m - keepOut
  const margin_s = margin_m / vT

  let feasible = true
  let reason = ''
  if (intercept_range_m <= keepOut) {
    feasible = false
    reason = 'intercept inside keep-out ring'
  } else if (intercept_range_m > maxReach) {
    feasible = false
    reason = 'intercept beyond interceptor max range'
  }

  // Beyond usable reach → cannot reach at all; otherwise soften by margin σ.
  const reach_probability =
    intercept_range_m > maxReach ? 0 : reachProbability(margin_m, s.effector.reach_margin_sigma_m)

  return { ...base, time_to_meet_s, intercept_range_m, feasible, reason, margin_m, margin_s, reach_probability }
}
