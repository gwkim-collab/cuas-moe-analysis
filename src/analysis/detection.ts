// ────────────────────────────────────────────────────────────
// Analysis core · sensor detection model.
//
// Radar-range scaling: the classic radar equation gives maximum
// detection range R_max ∝ (RCS)^(1/4) for a fixed detection
// threshold. So a target with RCS different from the sensor's
// quoted reference shifts the logistic Pd curve centre by
// (rcs/ref)^0.25. The transition width remains fixed, so a range quoted
// at an arbitrary Pd does not necessarily scale by exactly that factor.
//
// Single-look detection probability is modelled as a logistic that
// is ~pd_max well inside range and rolls off through 0.5·pd_max at
// the curve's CENTRE. Cumulative detection over the inbound track
// combines independent looks at the scan revisit rate:
//   P_det = 1 − Π(1 − pd_i).
//
// INTUITIVE INPUT ⇄ INTERNAL PARAMETER
// The user states the pair a datasheet actually gives — "RCS₀ 표적을
// R_q에서 Pd = p_q로 탐지" — and the logistic centre is inverted out
// of it (pdHalfPointRange). The centre is NOT the quoted range: the
// quoted range is where Pd = p_q, the centre is where Pd = pd_max/2.
// Feeding a quoted "Pd 0.9 @ 3 km" straight in as the centre would
// silently model a much worse radar (Pd 0.49 at 3 km).
//
// These are open-literature approximations, not a calibrated radar
// model. See model.ts SME-VERIFY tags.
// ────────────────────────────────────────────────────────────

import type { SensorSpec, ThreatSpec } from './model'
import { clamp, slantRange } from './geometry'

/**
 * Logistic centre (m) for the REFERENCE RCS — the range where a single look
 * gives pd_max/2 — inverted from the intuitive pair (quoted range, Pd there):
 *
 *   p_q = pd_max / (1 + exp((R_q − R_half)/w))
 *   ⇒ R_half = R_q + w · ln(pd_max/p_q − 1)⁻¹ = R_q − w · ln(pd_max/p_q − 1)
 *
 * p_q is clamped below pd_max (the ceiling is unreachable by construction).
 */
export function pdHalfPointRange(sensor: SensorSpec): number {
  const ceiling = clamp(sensor.pd_max, 1e-6, 1)
  const pq = clamp(sensor.pd_at_ref, 1e-6, ceiling * 0.999)
  return sensor.ref_detection_range_m - sensor.pd_transition_width_m * Math.log(ceiling / pq - 1)
}

/**
 * Logistic centre (m) for an arbitrary RCS. The radar equation scales the
 * centre by (rcs/ref)^¼; the transition width `w` is held fixed, so the curve
 * translates without scaling its width — a modelling simplification.
 */
export function detectionRangeForRcs(sensor: SensorSpec, rcs_m2: number): number {
  const ratio = rcs_m2 / sensor.ref_rcs_m2
  return pdHalfPointRange(sensor) * Math.pow(Math.max(ratio, 1e-9), 0.25)
}

/**
 * Range (m) at which a single look on the given RCS reaches probability `p` —
 * the inverse of `pdAtRange`, and the exact inverse of `pdHalfPointRange`:
 *   p = P_max/(1 + e^((R − R_half)/w))  ⇒  R = R_half + w·ln(P_max/p − 1)
 * So rangeForPd(sensor, ref_rcs, pd_at_ref) === ref_detection_range_m.
 */
export function rangeForPd(sensor: SensorSpec, rcs_m2: number, p: number): number {
  const ceiling = clamp(sensor.pd_max, 1e-6, 1)
  const target = clamp(p, 1e-6, ceiling * 0.999)
  return detectionRangeForRcs(sensor, rcs_m2) + sensor.pd_transition_width_m * Math.log(ceiling / target - 1)
}

/** Single-look detection probability at a given range for the given RCS. */
export function pdAtRange(
  sensor: SensorSpec,
  rcs_m2: number,
  range_m: number,
): number {
  const rDet = detectionRangeForRcs(sensor, rcs_m2)
  // Logistic: at range=rDet → pd_max/2; range≪rDet → pd_max; range≫rDet → 0.
  const z = (range_m - rDet) / sensor.pd_transition_width_m
  const logistic = 1 / (1 + Math.exp(z))
  return clamp(sensor.pd_max * logistic, 0, 1)
}

export interface DetectionResult {
  /** Logistic centre for the threat RCS (m) — where a single look gives pd_max/2. */
  nominal_range_m: number
  /**
   * The intuitive detection range for the threat RCS (m): where a single look
   * reaches `sensor.pd_at_ref`. Equals `ref_detection_range_m` when the threat
   * RCS equals the reference RCS. This is the number to quote to a human.
   */
  quoted_range_m: number
  /**
   * Probability of at least one detection before the last range that still
   * allows the doctrinal launch timeline (0..1). This is the P_detect gate.
   */
  cumulative_pd_in_time: number
  /** Probability of at least one detection anywhere before keep-out (reference only). */
  cumulative_pd_before_keep_out: number
  /** Success deadline used for cumulative_pd_in_time (asset-relative ground range, m). */
  timely_cutoff_range_m: number
  /** Number of independent scheduled looks at or outside the success deadline. */
  looks_in_time: number
  /** Number of independent scheduled looks over the full ingress→keep-out track. */
  looks_before_keep_out: number
  /**
   * Range from asset (m) at which the track is effectively "detected" for the
   * timeline — the first inbound range whose single-look pd ≥ 0.5. Used as the
   * kill-chain t0 for the kinematics budget. Falls back to nominal range.
   */
  detect_at_range_m: number
}

/**
 * Sweep the inbound track from ingress range down to the keep-out radius at the
 * scan revisit spacing, combining independent looks into a cumulative Pd, and
 * find the range where detection first becomes likely (pd ≥ 0.5).
 */
export function computeDetection(
  sensor: SensorSpec,
  threat: ThreatSpec,
  keep_out_radius_m: number,
  timely_cutoff_range_m = keep_out_radius_m,
): DetectionResult {
  const nominal = detectionRangeForRcs(sensor, threat.rcs_m2)
  const step_m = Math.max(1, threat.speed_m_s * sensor.revisit_time_s)
  const cutoff = Math.max(keep_out_radius_m, timely_cutoff_range_m)

  let survivalMissInTime = 1 // Π(1 − pd_i), only while launch doctrine is still attainable
  let survivalMissBeforeKeepOut = 1 // Π(1 − pd_i), full track reference
  let looksInTime = 0
  let looksBeforeKeepOut = 0
  let detectAt = nominal
  let foundDetect = false

  // `range` is the horizontal (ground) range; the radar sees the slant range
  // √(range² + altitude²). detectAt is reported as the horizontal range (the
  // kinematics timeline is horizontal-radial), but Pd is evaluated on slant.
  for (
    let range = threat.ingress_range_m;
    range >= keep_out_radius_m;
    range -= step_m
  ) {
    const slant = slantRange(range, threat.altitude_m_agl)
    const pd = pdAtRange(sensor, threat.rcs_m2, slant)
    survivalMissBeforeKeepOut *= 1 - pd
    looksBeforeKeepOut += 1
    if (range >= cutoff) {
      survivalMissInTime *= 1 - pd
      looksInTime += 1
    }
    if (!foundDetect && pd >= 0.5) {
      detectAt = range
      foundDetect = true
    }
  }

  return {
    nominal_range_m: nominal,
    quoted_range_m: rangeForPd(sensor, threat.rcs_m2, sensor.pd_at_ref),
    cumulative_pd_in_time: clamp(1 - survivalMissInTime, 0, 1),
    cumulative_pd_before_keep_out: clamp(1 - survivalMissBeforeKeepOut, 0, 1),
    timely_cutoff_range_m: cutoff,
    looks_in_time: looksInTime,
    looks_before_keep_out: looksBeforeKeepOut,
    detect_at_range_m: detectAt,
  }
}
