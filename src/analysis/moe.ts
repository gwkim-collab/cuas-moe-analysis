// ────────────────────────────────────────────────────────────
// Analysis core · Measure-of-Effectiveness composition.
//
// The kill chain is a series of gates; the overall probability of
// negating the threat is the product of the per-stage probabilities:
//
//   P_negate = P_detect · P_classify · P_decision · P_reach · P_kill
//
//   P_detect   — cumulative radar detection over the inbound track
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

import type { Scenario } from './model'
import { computeDetection, type DetectionResult } from './detection'
import { reachSolution, type ReachSolution } from './kinematics'
import { effectorKillProbability, singleShotPk } from './engagement'
import { pixelsOnTarget, recognitionProb, recognitionRangeForProb, acquisitionProb, pointingSigmaDeg, atmosphericTransmission } from './optics'
import { clamp, slantRange } from './geometry'

export interface MoeBreakdown {
  p_detect: number
  p_classify: number
  p_decision: number
  p_reach: number
  p_kill: number
}

/** EO/IR optical recognition sub-result (drives P_classify). */
export interface OpticsBreakdown {
  /** Range at which classification concludes (m). */
  classify_range_m: number
  /** Pixels on the target's critical dimension at the classify range. */
  pixels_on_target: number
  /** Recognition probability from the Johnson curve (0..1). */
  recognition_prob: number
  /** Range (m) at which recognition would be 50% for this target. */
  recognition_range_50_m: number
  /** Combined 1σ pointing error (deg) driving acquisition. */
  pointing_sigma_deg: number
  /** Probability the target is inside the fixed (gimbal-less) FOV (0..1). */
  acquisition_prob: number
  /** Atmospheric transmission at the classify range (0..1). */
  atmospheric_transmission: number
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
  /** EO/IR recognition sub-result. */
  optics: OpticsBreakdown
  /** Kinematics sub-result (timeline + intercept geometry + feasibility). */
  reach: ReachSolution
  /** Single-shot kill probability used (payload dependent). */
  single_shot_pk: number
  /** Whether the engagement geometry is feasible at all. */
  feasible: boolean
}

/**
 * Compute the analytical MOE for a single deterministic scenario.
 * Pure — no side effects, no RNG.
 */
export function computeMoe(s: Scenario): MoeResult {
  const detection = computeDetection(s.sensor, s.threat, s.site.keep_out_radius_m)
  const reach = reachSolution(s, detection.detect_at_range_m)

  // EO/IR recognition · classification concludes classify_time after the
  // radar detection, by which point the threat has closed. Recognition is
  // evaluated at that (closer) range — more pixels on target = easier. The EO
  // sees the slant (LOS) range, so optics use √(horizontal² + altitude²).
  const classify_h_m = Math.max(
    1,
    detection.detect_at_range_m - s.threat.speed_m_s * s.sensor.classify_time_s,
  )
  const classify_range_m = slantRange(classify_h_m, s.threat.altitude_m_agl)
  const size = s.threat.characteristic_size_m
  const recognition_prob = recognitionProb(s.optics, size, classify_range_m)
  const acquisition_prob = acquisitionProb(s.optics)
  const atmospheric_transmission = atmosphericTransmission(s.optics, classify_range_m)
  const optics = {
    classify_range_m,
    pixels_on_target: pixelsOnTarget(s.optics, size, classify_range_m),
    recognition_prob,
    recognition_range_50_m: recognitionRangeForProb(s.optics, size, 0.5),
    pointing_sigma_deg: pointingSigmaDeg(s.optics),
    acquisition_prob,
    atmospheric_transmission,
  }

  const p_detect = clamp(detection.cumulative_pd, 0, 1)
  // P_classify = acquisition (target in the fixed FOV) × optical recognition
  // × atmospheric transmission (contrast loss) × classifier ceiling. Acquisition
  // is what makes a too-narrow FOV hurt on a gimbal-less system.
  const p_classify = clamp(
    acquisition_prob * recognition_prob * atmospheric_transmission * s.sensor.classify_prob,
    0,
    1,
  )
  // Operator decision, optionally coupled to EO recognition confidence: a
  // marginal image both fails the classifier (P_classify) AND makes the human
  // approval less reliable. coupling=0 recovers the independent gate.
  const decision_coupling = clamp(s.c2.decision_recognition_coupling, 0, 1)
  const p_decision = clamp(
    s.c2.decision_reliability * (1 - decision_coupling * (1 - recognition_prob)),
    0,
    1,
  )
  // Continuous reach (softened by margin σ, 0 if geometry hard-fails). Kill is
  // the effector's own cumulative Pk; the product handles the soft gating.
  const p_reach = clamp(reach.reach_probability, 0, 1)
  const p_kill = effectorKillProbability(s.effector)

  const p_negate = clamp(
    p_detect * p_classify * p_decision * p_reach * p_kill,
    0,
    1,
  )

  return {
    p_negate,
    leakage: clamp(1 - p_negate, 0, 1),
    breakdown: { p_detect, p_classify, p_decision, p_reach, p_kill },
    detection,
    optics,
    reach,
    single_shot_pk: singleShotPk(s.effector),
    feasible: reach.feasible,
  }
}
