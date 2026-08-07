// ────────────────────────────────────────────────────────────
// Analysis core · Measure-of-Effectiveness composition.
//
// The kill chain is a series of gates; the overall probability of
// negating the threat is the product of the per-stage probabilities:
//
//   P_negate = P_detect · P_classify · P_decision · P_reach · P_kill
//
//   P_detect   — cumulative radar detection before the last range that still
//                permits the doctrinal launch timeline
//   P_classify — track correctly identified as hostile
//   P_decision — operator approves engagement (in the window)
//   P_reach    — interceptor closes on the threat outside keep-out,
//                within range, before it reaches the asset
//                (analytical mode: 0 or 1, from the geometry)
//   P_kill     — cumulative kill probability of the effector
//
// leakage = 1 − P_negate (probability the threat is NOT negated).
//
// This analytical form is a deterministic point estimate. Monte
// Carlo (Phase 3) will randomise the inputs and turn the 0/1 gates
// (P_reach especially) into fractions with confidence intervals.
// ────────────────────────────────────────────────────────────

import type { Scenario, DiscriminationLevel } from './model'
import { computeDetection, type DetectionResult } from './detection'
import { reachSolution, terminalEoSolution, timeBudget, type ReachSolution, type TerminalEoSolution } from './kinematics'
import { effectorKillProbability, singleShotPk } from './engagement'
import { pixelsOnTarget, recognitionProb, recognitionRangeForProb, acquisitionProb, pointingSigmaDeg, atmosphericTransmission } from './optics'
import { clamp } from './geometry'

export interface MoeBreakdown {
  p_detect: number
  p_classify: number
  p_decision: number
  p_reach: number
  p_kill: number
}

/** EO/IR optical D/R/I sub-result (drives P_classify). */
export interface OpticsBreakdown {
  /** Interceptor-camera ↔ target relative LOS range where EO classification concludes (m). */
  classify_range_m: number
  /** Pixels on the target's critical dimension at the classify range. */
  pixels_on_target: number
  /** Selected EO D/R/I task probability from the Johnson curve (0..1). */
  recognition_prob: number
  /** Range (m) at which the selected Johnson task would be 50% for this target. */
  recognition_range_50_m: number
  /** Combined 1σ pointing error (deg) driving acquisition. */
  pointing_sigma_deg: number
  /** Probability the target is inside the fixed (gimbal-less) FOV (0..1). */
  acquisition_prob: number
  /** Atmospheric transmission at the classify range (0..1). */
  atmospheric_transmission: number
  /** Whether the EO gate is applied to P_classify (false only for radar_only). */
  eo_gate_applied: boolean
  /** The ROE / discrimination level driving classification. */
  discrimination_level: DiscriminationLevel
}

export interface MoeResult {
  /** Overall probability of negating the threat (0..1). */
  p_negate: number
  /** Probability the threat is NOT negated (leakage) = 1 − p_negate. */
  leakage: number
  /** Per-stage kill-chain probabilities. */
  breakdown: MoeBreakdown
  /** Detection sub-result (ranges + cumulative Pd). */
  detection: DetectionResult
  /** EO/IR D/R/I sub-result. */
  optics: OpticsBreakdown
  /** Kinematics sub-result (timeline + intercept geometry + feasibility). */
  reach: ReachSolution
  /** Post-launch onboard EO relative-range timeline. */
  terminal_eo: TerminalEoSolution
  /** Single-shot kill probability used (payload dependent). */
  single_shot_pk: number
  /** Whether the engagement geometry is feasible at all. */
  feasible: boolean
  /**
   * OPTION — probability of a wrong engagement against a non-threat, given the
   * current ROE. null when the option is disabled. SEPARATE from p_negate.
   */
  false_engagement: number | null
}

/**
 * Compute the analytical MOE for a single deterministic scenario.
 * Pure — no side effects, no RNG.
 */
export function computeMoe(s: Scenario): MoeResult {
  const prelaunch = timeBudget(s)
  const timelyDetectionCutoff =
    s.effector.commit_range_m + s.threat.speed_m_s * prelaunch.react_total_s
  const detection = computeDetection(
    s.sensor,
    s.threat,
    s.site.keep_out_radius_m,
    timelyDetectionCutoff,
  )
  const reach = reachSolution(s, detection.detect_at_range_m)
  const terminal_eo = terminalEoSolution(s, reach)

  // EO/IR D/R/I is an ONBOARD, POST-LAUNCH terminal gate. Its range is
  // interceptor-camera ↔ target relative LOS separation, not asset↔target range.
  // terminalEoSolution maps that separation back to both vehicles' asset ranges.
  const classify_range_m = terminal_eo.recognition_separation_m
  const size = s.threat.characteristic_size_m
  const recognition_prob = recognitionProb(s.optics, size, classify_range_m)
  const acquisition_prob = acquisitionProb(s.optics)
  const atmospheric_transmission = atmosphericTransmission(s.optics, classify_range_m)
  // Terminal confirmation requirement: radar_only skips the onboard EO gate;
  // EO detection/recognition/identification all require the post-launch result.
  const eo_gate_applied = s.optics.required_discrimination !== 'radar_only'
  const optics = {
    classify_range_m,
    pixels_on_target: pixelsOnTarget(s.optics, size, classify_range_m),
    recognition_prob,
    recognition_range_50_m: recognitionRangeForProb(s.optics, size, 0.5),
    pointing_sigma_deg: pointingSigmaDeg(s.optics),
    acquisition_prob,
    atmospheric_transmission,
    eo_gate_applied,
    discrimination_level: s.optics.required_discrimination,
  }

  const p_detect = clamp(detection.cumulative_pd_in_time, 0, 1)

  // Terminal discrimination requirement:
  //  · 'radar_only' — launch and continue on the radar track; no EO success gate.
  //  · EO D/R/I — the interceptor must finish the selected onboard task after
  //    launch and before intercept.
  const p_classify_optical = clamp(
    eo_gate_applied
      ? acquisition_prob * recognition_prob * atmospheric_transmission * s.sensor.classify_prob
      : s.sensor.radar_track_confidence,
    0,
    1,
  )
  // A requested EO completion point that would require processing before launch
  // cannot contribute a plausible terminal-confirmation probability.
  const p_classify = eo_gate_applied && !terminal_eo.timing_feasible ? 0 : p_classify_optical
  // Launch approval occurs before the interceptor's EO task, so it cannot be
  // degraded by an image that is produced later in the flight.
  const p_decision = clamp(s.c2.decision_reliability, 0, 1)
  // Continuous reach (softened by margin σ, 0 if geometry hard-fails). Kill is
  // the effector's own cumulative Pk; the product handles the soft gating.
  const p_reach = clamp(reach.reach_probability, 0, 1)
  const p_kill = effectorKillProbability(s.effector)

  const p_negate = clamp(
    p_detect * p_classify * p_decision * p_reach * p_kill,
    0,
    1,
  )

  // OPTION — wrong-engagement risk (separate from p_negate). A non-threat is
  // engaged if it enters the track pool AND passes the current ROE gate; looser
  // ROE (radar-only / detection) lets more non-threats through.
  const false_pass = {
    radar_only: s.c2.false_pass_detection,
    detection: s.c2.false_pass_detection,
    recognition: s.c2.false_pass_recognition,
    identification: s.c2.false_pass_identification,
  }[s.optics.required_discrimination]
  const false_engagement = s.c2.false_engagement_enabled
    ? clamp(s.c2.non_threat_rate * false_pass, 0, 1)
    : null

  return {
    p_negate,
    leakage: clamp(1 - p_negate, 0, 1),
    breakdown: { p_detect, p_classify, p_decision, p_reach, p_kill },
    detection,
    optics,
    reach,
    terminal_eo,
    single_shot_pk: singleShotPk(s.effector),
    feasible: reach.feasible && (!eo_gate_applied || terminal_eo.timing_feasible),
    false_engagement,
  }
}
