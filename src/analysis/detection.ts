// ────────────────────────────────────────────────────────────
// Analysis core · sensor detection model.
//
// Radar-range scaling: the classic radar equation gives maximum
// detection range R_max ∝ (RCS)^(1/4) for a fixed detection
// threshold. So a target with RCS different from the sensor's
// quoted reference scales its detection range by (rcs/ref)^0.25.
//
// Single-look detection probability is modelled as a logistic that
// is ~pd_max well inside range and rolls off through 0.5·pd_max at
// the nominal detection range. Cumulative detection over the inbound
// track combines independent looks at the scan revisit rate:
//   P_det = 1 − Π(1 − pd_i).
//
// These are open-literature approximations, not a calibrated radar
// model. See model.ts SME-VERIFY tags.
// ────────────────────────────────────────────────────────────

import type { SensorSpec, ThreatSpec } from './model'
import { clamp, slantRange } from './geometry'

/** Nominal detection range (m) for a target of the given RCS. */
export function detectionRangeForRcs(sensor: SensorSpec, rcs_m2: number): number {
  const ratio = rcs_m2 / sensor.ref_rcs_m2
  return sensor.ref_detection_range_m * Math.pow(Math.max(ratio, 1e-9), 0.25)
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
  /** Nominal detection range for the threat RCS (m). */
  nominal_range_m: number
  /** Cumulative probability of detection over the whole inbound track (0..1). */
  cumulative_pd: number
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
): DetectionResult {
  const nominal = detectionRangeForRcs(sensor, threat.rcs_m2)
  const step_m = Math.max(1, threat.speed_m_s * sensor.revisit_time_s)

  let survivalMiss = 1 // Π(1 − pd_i)
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
    survivalMiss *= 1 - pd
    if (!foundDetect && pd >= 0.5) {
      detectAt = range
      foundDetect = true
    }
  }

  return {
    nominal_range_m: nominal,
    cumulative_pd: clamp(1 - survivalMiss, 0, 1),
    detect_at_range_m: detectAt,
  }
}
