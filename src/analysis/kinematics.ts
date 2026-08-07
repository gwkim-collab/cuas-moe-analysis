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
// ENGAGEMENT IS DOCTRINE-DRIVEN, NOT DETECTION-DRIVEN.
// The system has a commit (launch) range it engages at. Detecting
// earlier does not make it shoot earlier — it only buys margin.
// Detection binds only when it is too LATE to honour the doctrine:
//
//   R_launch = min(R_commit, R_detect − v_t·t_react)
//   R_required_detection = R_commit + v_t·t_react
//
//   pre-launch react window: operator decision + launch delay.
//   interceptor from pad (R_pad) flies out at v_i; threat flies in
//   at v_t → they close the gap (R_launch − R_pad) at (v_i + v_t).
//   intercept range from asset R_int = R_pad + v_i·t_meet.
//
// EO/IR terminal D/R/I is performed by the interceptor AFTER launch.
// Its camera↔target relative-range timeline is solved separately by
// terminalEoSolution(); it is not part of the pre-launch detection budget.
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
  /** Doctrinal commit (launch) range (m) — where the system intends to launch. */
  commit_range_m: number
  /**
   * Detection range (m) needed to honour the commit range:
   * R_commit + v_t·t_react. Detection beyond this buys margin but no performance.
   */
  required_detection_range_m: number
  /** Detection margin (m): detect_at − required. Negative = detection-limited. */
  detection_margin_m: number
  /** The same margin expressed as threat flight time (s). */
  detection_margin_s: number
  /** True when detection was too late to launch at the commit range. */
  detection_limited: boolean
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

export interface TerminalEoSolution {
  /** Camera↔target separation when the interceptor launches (m). */
  separation_at_launch_m: number
  /** Separation where onboard EO processing must begin (m). */
  processing_start_separation_m: number
  /** Requested separation where recognition/identification completes (m). */
  recognition_separation_m: number
  processing_start_after_launch_s: number
  recognition_after_launch_s: number
  /** Target and interceptor asset-relative ranges at processing start. */
  target_range_at_start_m: number
  interceptor_range_at_start_m: number
  /** Target and interceptor asset-relative ranges at recognition completion. */
  target_range_at_recognition_m: number
  interceptor_range_at_recognition_m: number
  /** Time remaining from EO completion to kinematic intercept. */
  time_remaining_to_intercept_s: number
  timing_feasible: boolean
  reason: string
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
    // EO classification is an onboard, post-launch activity. Radar detection
    // only needs to leave room for launch approval and spin-up.
    react_total_s: decision_s + launch_delay_s,
  }
}

/**
 * Solve the onboard EO timeline in interceptor↔target relative range.
 * First-order assumption: both vehicles are on the same radial/altitude during
 * terminal closure, so LOS separation closes at v_i+v_t.
 */
export function terminalEoSolution(s: Scenario, reach: ReachSolution): TerminalEoSolution {
  const vT = s.threat.speed_m_s
  const vI = s.effector.cruise_speed_m_s
  const closingSpeed = vI + vT
  const rPad = s.effector.launch_pad_range_from_asset_m
  const separation_at_launch_m = Math.max(0, reach.threat_range_at_launch_m - rPad)
  const recognition_separation_m = Math.max(1, s.optics.terminal_recognition_range_m)
  const processing_start_separation_m =
    recognition_separation_m + closingSpeed * s.sensor.classify_time_s

  const processing_start_after_launch_s =
    (separation_at_launch_m - processing_start_separation_m) / Math.max(1e-9, closingSpeed)
  const recognition_after_launch_s =
    (separation_at_launch_m - recognition_separation_m) / Math.max(1e-9, closingSpeed)

  const target_range_at_start_m =
    reach.threat_range_at_launch_m - vT * processing_start_after_launch_s
  const interceptor_range_at_start_m = rPad + vI * processing_start_after_launch_s
  const target_range_at_recognition_m =
    reach.threat_range_at_launch_m - vT * recognition_after_launch_s
  const interceptor_range_at_recognition_m = rPad + vI * recognition_after_launch_s
  const time_remaining_to_intercept_s = recognition_separation_m / Math.max(1e-9, closingSpeed)

  let timing_feasible = true
  let reason = ''
  if (closingSpeed <= 0) {
    timing_feasible = false
    reason = 'interceptor and threat do not close'
  } else if (processing_start_after_launch_s < 0) {
    timing_feasible = false
    reason = 'EO processing would have to start before interceptor launch'
  } else if (recognition_after_launch_s > reach.time_to_meet_s) {
    timing_feasible = false
    reason = '선택한 EO 탐지/인식/식별 과업이 요격 이후에 완료됩니다.'
  } else if (!reach.feasible) {
    timing_feasible = false
    reason = reach.reason
  }

  return {
    separation_at_launch_m,
    processing_start_separation_m,
    recognition_separation_m,
    processing_start_after_launch_s,
    recognition_after_launch_s,
    target_range_at_start_m,
    interceptor_range_at_start_m,
    target_range_at_recognition_m,
    interceptor_range_at_recognition_m,
    time_remaining_to_intercept_s,
    timing_feasible,
    reason,
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

  // Doctrine: launch at the commit range. Detection only binds when it is too
  // late for the reaction budget to fit before that range.
  const commit_range_m = s.effector.commit_range_m
  const required_detection_range_m = commit_range_m + vT * budget.react_total_s
  const detection_margin_m = detect_at_range_m - required_detection_range_m
  const earliest_launch_m = detect_at_range_m - vT * budget.react_total_s
  const detection_limited = earliest_launch_m < commit_range_m
  const threat_range_at_launch_m = Math.min(commit_range_m, earliest_launch_m)

  const base: Omit<ReachSolution, 'feasible' | 'reason' | 'margin_m' | 'margin_s' | 'reach_probability'> = {
    detect_at_range_m,
    budget,
    commit_range_m,
    required_detection_range_m,
    detection_margin_m,
    detection_margin_s: detection_margin_m / vT,
    detection_limited,
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
