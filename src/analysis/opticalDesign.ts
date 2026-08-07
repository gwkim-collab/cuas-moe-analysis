// ────────────────────────────────────────────────────────────
// Analysis core · onboard EO/IR reverse sizing.
//
// Answers: "At camera↔target relative LOS range R, how much HFOV/focal length
// gives N pixels, and can the interceptor finish that EO task after launch but
// before intercept?"
//
// Launch remains governed by the scenario's effector.commit_range_m. This
// module NEVER derives or overwrites launch range from EO recognition range.
// ────────────────────────────────────────────────────────────

import type { DiscriminationLevel, OpticalSensorSpec, Scenario } from './model'
import { computeMoe, type MoeResult } from './moe'
import {
  acquisitionProb,
  atmosphericTransmission,
  focalLengthMm,
  pixelsOnTarget,
  recognitionProb,
} from './optics'

const RAD2DEG = 180 / Math.PI

export type EoDiscriminationLevel = Exclude<DiscriminationLevel, 'radar_only'>

export interface OpticalDesignInput {
  /** Interceptor-camera ↔ target relative LOS range at EO task completion (m). */
  recognition_range_m: number
  /** Desired pixels across the target critical dimension at that range. */
  target_pixels: number
  /** EO task used for terminal confirmation. */
  discrimination_level: EoDiscriminationLevel
}

export interface OpticalDesignResult {
  input: OpticalDesignInput
  /** Camera↔target relative LOS range used by the optical model (m). */
  camera_target_range_m: number
  required_hfov_deg: number
  required_ifov_urad: number
  focal_length_mm: number
  scene_width_m: number
  optics: OpticalSensorSpec
  pixels_on_target: number
  recognition_probability: number
  acquisition_probability: number
  atmospheric_transmission: number
  classification_probability: number
  /** Scenario with optical design + terminal range applied; launch doctrine unchanged. */
  scenario: Scenario
  moe: MoeResult
  timeline_feasible: boolean
  limitation: string
}

/**
 * HFOV needed to place `target_pixels` across `size_m` at `range_m`.
 * This intentionally inverts optics.pixelsOnTarget exactly:
 *   N = size · Hpx / (range · HFOV_rad)
 */
export function requiredHfovDeg(
  size_m: number,
  range_m: number,
  target_pixels: number,
  horizontal_resolution_px: number,
): number {
  if (size_m <= 0 || range_m <= 0 || target_pixels <= 0 || horizontal_resolution_px <= 0) return NaN
  return (size_m * horizontal_resolution_px * RAD2DEG) / (range_m * target_pixels)
}

/** Reverse-size the onboard camera and evaluate the full post-launch EO chain. */
export function analyzeOpticalDesign(s: Scenario, input: OpticalDesignInput): OpticalDesignResult {
  const camera_target_range_m = Math.max(1, input.recognition_range_m)
  const target_pixels = Math.max(0.01, input.target_pixels)
  const normalizedInput = { ...input, recognition_range_m: camera_target_range_m, target_pixels }
  const required_hfov_deg = requiredHfovDeg(
    s.threat.characteristic_size_m,
    camera_target_range_m,
    target_pixels,
    s.optics.h_resolution_px,
  )
  const optics: OpticalSensorSpec = {
    ...s.optics,
    hfov_deg: required_hfov_deg,
    terminal_recognition_range_m: camera_target_range_m,
    required_discrimination: input.discrimination_level,
  }
  const scenario: Scenario = { ...s, optics }

  const required_ifov_urad =
    (s.threat.characteristic_size_m / (camera_target_range_m * target_pixels)) * 1e6
  const scene_width_m =
    2 * camera_target_range_m * Math.tan((required_hfov_deg * Math.PI) / 360)
  const recognition_probability = recognitionProb(
    optics,
    s.threat.characteristic_size_m,
    camera_target_range_m,
  )
  const acquisition_probability = acquisitionProb(optics)
  const transmission = atmosphericTransmission(optics, camera_target_range_m)
  const classification_probability =
    acquisition_probability * recognition_probability * transmission * s.sensor.classify_prob
  const moe = computeMoe(scenario)
  const timeline_feasible = moe.reach.feasible && moe.terminal_eo.timing_feasible
  const limitation = !moe.reach.feasible
    ? moe.reach.reason
    : !moe.terminal_eo.timing_feasible
      ? moe.terminal_eo.reason
      : ''

  return {
    input: normalizedInput,
    camera_target_range_m,
    required_hfov_deg,
    required_ifov_urad,
    focal_length_mm: focalLengthMm(optics),
    scene_width_m,
    optics,
    pixels_on_target: pixelsOnTarget(
      optics,
      s.threat.characteristic_size_m,
      camera_target_range_m,
    ),
    recognition_probability,
    acquisition_probability,
    atmospheric_transmission: transmission,
    classification_probability,
    scenario,
    moe,
    timeline_feasible,
    limitation,
  }
}
