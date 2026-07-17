// ────────────────────────────────────────────────────────────
// Analysis core · parameter model + documented default values.
//
// ⚠ IMPORTANT — the numbers below are PLACEHOLDER engineering
// defaults drawn from open-literature approximations and the
// existing cinematic mockup, NOT validated Airbility performance
// figures. Every field tagged `SME-VERIFY` must be reviewed by a
// domain expert before any result is treated as authoritative.
// The whole point of the tool is that these are editable inputs.
// ────────────────────────────────────────────────────────────

import type { PayloadMode } from '../types'

// ── Threat (incoming hostile UAS) ─────────────────────────────
export interface ThreatSpec {
  /** Radar cross-section (m²). Small FPV ≈ 0.01 m² (−20 dBsm). SME-VERIFY */
  rcs_m2: number
  /** Ground speed (m/s). 32.8 m/s ≈ 118 km/h — matches the mockup FPV. SME-VERIFY */
  speed_m_s: number
  /** Ingress altitude AGL (m). SME-VERIFY */
  altitude_m_agl: number
  /** Range from the protected asset where the run begins (m). */
  ingress_range_m: number
  /** Approach bearing FROM asset TO ingress origin (deg, 0=N). Single-scenario. */
  approach_bearing_deg: number
  /** Critical (recognisable) dimension of the target, m — e.g. rotor/wing span. SME-VERIFY */
  characteristic_size_m: number
}

// ── Sensor (ground radar) ─────────────────────────────────────
export interface SensorSpec {
  /** Reference RCS (m²) at which `ref_detection_range_m` is quoted. */
  ref_rcs_m2: number
  /** Detection range (m) for a target of `ref_rcs_m2`. SME-VERIFY */
  ref_detection_range_m: number
  /** Peak single-look detection probability well inside range (0..1). SME-VERIFY */
  pd_max: number
  /** Logistic transition width (m) around the max-range boundary — larger = softer edge. */
  pd_transition_width_m: number
  /** Scan revisit interval (s) — how often a fresh detection opportunity occurs. SME-VERIFY */
  revisit_time_s: number
  /** Time to classify/confirm a track as hostile after first detection (s). SME-VERIFY */
  classify_time_s: number
  /**
   * Classifier ceiling (0..1): probability the target is correctly declared
   * hostile GIVEN the EO/IR sensor resolves enough pixels on it. The final
   * P_classify = recognitionProb(optics) × classify_prob, so this caps the
   * algorithm/operator accuracy independent of optics. SME-VERIFY
   */
  classify_prob: number
}

// ── EO/IR optical sensor (recognition payload) ────────────────
export interface OpticalSensorSpec {
  /** Horizontal resolution (pixels across the image). SME-VERIFY */
  h_resolution_px: number
  /** Horizontal field of view (deg). Narrow = more pixels on target, less search. SME-VERIFY */
  hfov_deg: number
  /** Sensor width (mm) — used only for the focal-length ↔ FOV conversion display. */
  sensor_width_mm: number
  /** Pixels across the target for 50% recognition (Johnson N50). SME-VERIFY */
  n50_recognition: number
}

// ── Effector (interceptor: AB-U10 net-gun / shotgun) ──────────
export interface EffectorSpec {
  payload: PayloadMode
  /** Spin-up + launch delay from approval to airborne (s). SME-VERIFY */
  launch_delay_s: number
  /** Interceptor outbound cruise speed (m/s). ~50 m/s matches the mockup. SME-VERIFY */
  cruise_speed_m_s: number
  /** Max useful range from the launch pad the interceptor can reach (m). SME-VERIFY */
  max_engagement_range_m: number
  /** Launch pad distance from the protected asset (m). 0 = co-located. */
  launch_pad_range_from_asset_m: number
  /** Single-shot kill probability · net gun (0..1). SME-VERIFY */
  single_shot_pk_net: number
  /** Single-shot kill probability · shotgun (0..1). SME-VERIFY */
  single_shot_pk_shotgun: number
  /** Number of shot / pass opportunities in the engagement window. SME-VERIFY */
  shot_opportunities: number
}

// ── C2 (decision layer) ───────────────────────────────────────
export interface C2Spec {
  /** Operator decision (approval) latency from CONFIRM to APPROVE (s). SME-VERIFY */
  decision_latency_s: number
  /** Probability the operator correctly approves engagement in the window (0..1). SME-VERIFY */
  decision_reliability: number
}

// ── Site (protected asset + engagement constraints) ───────────
export interface SiteSpec {
  /** Protected asset location (defaults to the Yeouido VIP point). */
  asset: { lat: number; lon: number; label: string }
  /** Keep-out radius (m): the threat MUST be neutralised beyond this range. SME-VERIFY */
  keep_out_radius_m: number
}

export interface Scenario {
  threat: ThreatSpec
  sensor: SensorSpec
  optics: OpticalSensorSpec
  effector: EffectorSpec
  c2: C2Spec
  site: SiteSpec
}

// ── Documented defaults ───────────────────────────────────────
// Yeouido VIP point — same coords the operational scene uses (mockData.INCHEON).
export const DEFAULT_ASSET = { lat: 37.5311, lon: 126.917, label: 'YEOUIDO · VIP' }

export const DEFAULT_THREAT: ThreatSpec = {
  rcs_m2: 0.01,
  speed_m_s: 32.8,
  altitude_m_agl: 85,
  ingress_range_m: 3000,
  approach_bearing_deg: 315,
  characteristic_size_m: 0.35,
}

export const DEFAULT_SENSOR: SensorSpec = {
  ref_rcs_m2: 0.01,
  ref_detection_range_m: 3000,
  pd_max: 0.98,
  pd_transition_width_m: 300,
  revisit_time_s: 1.0,
  classify_time_s: 6.0,
  classify_prob: 0.95, // classifier ceiling given enough pixels
}

export const DEFAULT_OPTICS: OpticalSensorSpec = {
  h_resolution_px: 1920,
  hfov_deg: 1.5, // narrow gimbal EO for recognition at range
  sensor_width_mm: 6.4,
  n50_recognition: 6,
}

export const DEFAULT_EFFECTOR: EffectorSpec = {
  payload: 'net_gun',
  launch_delay_s: 4.0,
  cruise_speed_m_s: 50,
  max_engagement_range_m: 2500,
  launch_pad_range_from_asset_m: 0,
  single_shot_pk_net: 0.7,
  single_shot_pk_shotgun: 0.6,
  shot_opportunities: 2,
}

export const DEFAULT_C2: C2Spec = {
  decision_latency_s: 10,
  decision_reliability: 0.98,
}

export const DEFAULT_SITE: SiteSpec = {
  asset: DEFAULT_ASSET,
  keep_out_radius_m: 500,
}

export function defaultScenario(): Scenario {
  return {
    threat: { ...DEFAULT_THREAT },
    sensor: { ...DEFAULT_SENSOR },
    optics: { ...DEFAULT_OPTICS },
    effector: { ...DEFAULT_EFFECTOR },
    c2: { ...DEFAULT_C2 },
    site: { ...DEFAULT_SITE, asset: { ...DEFAULT_ASSET } },
  }
}
