// ────────────────────────────────────────────────────────────
// Analysis core · EO/IR optical recognition model.
//
// Links camera geometry to recognition probability so the classify
// stage (P_classify) becomes a physical function of target size,
// range, camera field-of-view and sensor resolution — the thing you
// actually trade when sizing an EO/IR recognition payload.
//
//   pixels on target   N = size_m / (range_m · IFOV)
//                        = size_m · H_px / (range_m · HFOV_rad)
//   recognition prob   Johnson/NVESD curve of n = N / N50:
//                        P = n^E / (1 + n^E),  E = 2.7 + 0.7·n
//
// FOV ↔ focal length:  HFOV = 2·atan(sensor_width / (2·focal_length))
//
// Open-literature target-acquisition approximation — N50 and the
// exponent are the standard NVESD Johnson form. SME-VERIFY the
// N50 value for the actual classifier/operator task.
// ────────────────────────────────────────────────────────────

import type { OpticalSensorSpec } from './model'
import { clamp } from './geometry'

const DEG2RAD = Math.PI / 180

export function hfovRad(o: OpticalSensorSpec): number {
  return o.hfov_deg * DEG2RAD
}

/** Instantaneous field of view per pixel (radians). */
export function ifovRad(o: OpticalSensorSpec): number {
  return hfovRad(o) / Math.max(1, o.h_resolution_px)
}

/** Pixels spanning the target's critical dimension at a given range. */
export function pixelsOnTarget(o: OpticalSensorSpec, size_m: number, range_m: number): number {
  if (range_m <= 0) return Infinity
  return size_m / (range_m * ifovRad(o))
}

/** Johnson/NVESD probability for a normalised resolution n = N/N50. */
export function johnsonProb(n: number): number {
  if (n <= 0) return 0
  const E = 2.7 + 0.7 * n
  const nE = Math.pow(n, E)
  return nE / (1 + nE)
}

/** Recognition probability for a target of `size_m` at `range_m`. */
export function recognitionProb(o: OpticalSensorSpec, size_m: number, range_m: number): number {
  const N = pixelsOnTarget(o, size_m, range_m)
  return clamp(johnsonProb(N / o.n50_recognition), 0, 1)
}

/**
 * Range (m) at which recognition probability equals `prob` for `size_m`.
 * Inverts the Johnson curve numerically (bisection on n), then converts
 * the required pixels-on-target back to range. Returns the max range at
 * which recognition ≥ prob (larger range = harder = fewer pixels).
 */
export function recognitionRangeForProb(o: OpticalSensorSpec, size_m: number, prob: number): number {
  const p = clamp(prob, 1e-4, 0.9999)
  // Find n such that johnsonProb(n) = p (monotone increasing in n).
  let lo = 0
  let hi = 100
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (johnsonProb(mid) < p) lo = mid
    else hi = mid
  }
  const n = (lo + hi) / 2
  const N = n * o.n50_recognition
  if (N <= 0) return Infinity
  // N = size / (range · IFOV) → range = size / (N · IFOV)
  return size_m / (N * ifovRad(o))
}

/** Focal length (mm) implied by the current HFOV and sensor width. */
export function focalLengthMm(o: OpticalSensorSpec): number {
  return o.sensor_width_mm / (2 * Math.tan(hfovRad(o) / 2))
}

/** HFOV (deg) for a given focal length and sensor width. */
export function hfovDegFromFocal(focal_mm: number, sensor_width_mm: number): number {
  return (2 * Math.atan(sensor_width_mm / (2 * focal_mm))) / DEG2RAD
}
