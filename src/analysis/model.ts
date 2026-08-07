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

/**
 * Terminal confirmation policy. `radar_only` explicitly means the onboard EO
 * gate is disabled. The remaining three values are Johnson EO/IR tasks, ordered
 * by required resolvable detail: detection < recognition < identification.
 */
export type DiscriminationLevel = 'radar_only' | 'detection' | 'recognition' | 'identification'

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
  /**
   * INTUITIVE INPUT ①: "이 거리에서 탐지한다" (m), for a target of `ref_rcs_m2`.
   * Paired with `pd_at_ref` — the quoted range means nothing without the
   * probability it is quoted AT. The internal logistic centre is DERIVED from
   * the pair (see detection.pdHalfPointRange), it is NOT this value. SME-VERIFY
   */
  ref_detection_range_m: number
  /**
   * INTUITIVE INPUT ②: single-look detection probability AT `ref_detection_range_m`
   * (0..1). Radar specs quote detection range at a stated Pd (commonly 0.8-0.9 at
   * Pfa 1e-6), so this is the number a datasheet actually gives you. Must be
   * < `pd_max`. SME-VERIFY
   */
  pd_at_ref: number
  /**
   * ADVANCED (curve shape): peak single-look detection probability well inside
   * range (0..1) — the logistic ceiling. Not a spec number; leave at default
   * unless modelling a sensor with a known sub-unity ceiling. SME-VERIFY
   */
  pd_max: number
  /** ADVANCED (curve shape): logistic transition width (m) — larger = softer edge. */
  pd_transition_width_m: number
  /** Scan revisit interval (s) — how often a fresh detection opportunity occurs. SME-VERIFY */
  revisit_time_s: number
  /**
   * Conditional probability that an already-detected radar track is stable and
   * accurate enough to support the engagement declaration (0..1). This is not
   * P_detect: P_detect answers whether a timely track was obtained at all.
   * SME-VERIFY
   */
  radar_track_confidence: number
  /**
   * EO/IR processing time from onboard acquisition start to terminal
   * detection/recognition/identification completion (s). This occurs AFTER interceptor
   * launch and therefore does not belong to the pre-launch radar/C2 reaction
   * budget. SME-VERIFY
   */
  classify_time_s: number
  /**
   * EO task reliability ceiling conditional on acquisition, resolvable detail,
   * and atmospheric transmission (0..1). It represents residual
   * algorithm/operator loss and is not the radar-track confidence. SME-VERIFY
   */
  classify_prob: number
}

// ── EO/IR optical sensor (terminal D/R/I payload) ─────────────
export interface OpticalSensorSpec {
  /** Horizontal resolution (pixels across the image). SME-VERIFY */
  h_resolution_px: number
  /** Horizontal field of view (deg). Narrow = more pixels on target, less search. SME-VERIFY */
  hfov_deg: number
  /** Sensor width (mm) — used only for the focal-length ↔ FOV conversion display. */
  sensor_width_mm: number
  /**
   * Interceptor-camera ↔ target relative LOS range (m) where the terminal EO
   * selected detection/recognition/identification task completes. This is NOT asset↔target range.
   * EO processing starts farther out by (v_i+v_t)·classify_time_s. SME-VERIFY
   */
  terminal_recognition_range_m: number
  /**
   * Johnson N50 (pixels across the target critical dimension for 50% observer
   * task probability). Literature values are cycles on target: detection≈1.0,
   * recognition≈4.0, identification≈6.4. This model stores their nominal
   * digital-image equivalents in pixels (≈2 pixels/cycle): 2, 8, 12.8 px.
   * These are baseline criteria, not calibrated drone-classifier ROC values.
   */
  n50_detection: number
  n50_recognition: number
  n50_identification: number
  /**
   * Post-launch terminal confirmation requirement:
   * radar_only=no EO gate; detection/recognition/identification=onboard EO task.
   */
  required_discrimination: DiscriminationLevel
  /**
   * Radar-cue angular error, 1σ (deg). This is a GIMBAL-LESS system: the
   * camera is coarse-pointed by the radar cue, so cue bearing error is one
   * component of whether the target lands inside the fixed FOV. SME-VERIFY
   */
  cue_error_deg: number
  /**
   * Interceptor forward-camera pointing error, 1σ (deg). The EO is body-fixed
   * (no gimbal) and aimed by flying the interceptor, so guidance/LOS error is
   * the other component of acquisition. Combined σ = √(cue² + pointing²) drives
   * P_acq = probability the target is within ±HFOV/2. SME-VERIFY
   */
  pointing_error_deg: number
  /**
   * Atmospheric visibility (km). Drives EO/IR contrast loss with range via
   * Koschmieder (β = 3.912/V) + Beer-Lambert transmission T = exp(−β·R).
   * Clear day ≈ 20-40 km, haze ≈ 5-10 km, fog ≪ 1 km. SME-VERIFY
   */
  visibility_km: number
}

// ── Effector (interceptor: AB-U10 net-gun / shotgun) ──────────
export interface EffectorSpec {
  payload: PayloadMode
  /** Spin-up + launch delay from approval to airborne (s). SME-VERIFY */
  launch_delay_s: number
  /** Interceptor outbound cruise speed (m/s). ~50 m/s matches the mockup. SME-VERIFY */
  cruise_speed_m_s: number
  /**
   * DOCTRINE — commit (launch) range: the threat range from the asset at which
   * we intend to launch. Engagement is doctrine-driven, not detection-driven:
   * detecting earlier does NOT mean shooting earlier, it only buys margin.
   * Actual launch = min(commit_range, detect_at − v_t·t_react), so detection
   * matters only when it is too LATE to honour the doctrine. SME-VERIFY
   */
  commit_range_m: number
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
  /**
   * Interceptor endurance (s). Caps the usable reach to cruise_speed·endurance,
   * so a slow/short-legged interceptor can't reach a far intercept even if the
   * quoted max range allows it. Effective reach = min(max_range, v_i·endurance).
   * SME-VERIFY
   */
  endurance_s: number
  /**
   * 1σ uncertainty (m) on the keep-out standoff margin, used to soften the
   * analytical P_reach from a hard 0/1 gate into Φ(margin/σ). Captures timing /
   * speed / geometry jitter without a full Monte Carlo. SME-VERIFY
   */
  reach_margin_sigma_m: number
}

// ── C2 (decision layer) ───────────────────────────────────────
export interface C2Spec {
  /** Pre-launch operator decision (approval) latency from radar track to APPROVE (s). SME-VERIFY */
  decision_latency_s: number
  /** Probability the operator correctly approves launch in the pre-launch window (0..1). SME-VERIFY */
  decision_reliability: number
  /**
   * Legacy compatibility field. Onboard EO now occurs after launch, therefore
   * it cannot couple back into the pre-launch approval probability and this
   * value is not used by the analytical model.
   */
  decision_recognition_coupling: number
  /**
   * OPTION — model wrong-engagement (non-threat) risk. When false, it is not
   * computed and not shown. This is a SEPARATE risk metric, not part of P_negate.
   */
  false_engagement_enabled: boolean
  /** Fraction of engageable tracks that are actually non-threats (bird/friendly/clutter), 0..1. */
  non_threat_rate: number
  /** Probability a non-threat is wrongly passed to engagement under each ROE
   * (looser ROE → higher). P_false_engage = non_threat_rate × false_pass[ROE]. SME-VERIFY */
  false_pass_detection: number
  false_pass_recognition: number
  false_pass_identification: number
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
  // Analysis window start. Must sit comfortably OUTSIDE the required detection
  // range (commit + v_t·(decision+launch) ≈ 3.46 km at defaults), otherwise the track
  // begins inside the radar's reach and the detection margin cannot be shown.
  ingress_range_m: 6000,
  approach_bearing_deg: 315,
  characteristic_size_m: 0.35,
}

export const DEFAULT_SENSOR: SensorSpec = {
  ref_rcs_m2: 0.01,
  ref_detection_range_m: 3000,
  pd_at_ref: 0.9, // "0.01 m²를 3 km에서 Pd 0.9로 탐지" — 데이터시트가 실제로 주는 형태
  pd_max: 0.98,
  pd_transition_width_m: 300,
  revisit_time_s: 1.0,
  radar_track_confidence: 0.95, // P(valid fire-control track | timely detection)
  classify_time_s: 6.0,
  classify_prob: 0.95, // EO algorithm/operator ceiling given the other EO gates
}

export const DEFAULT_OPTICS: OpticalSensorSpec = {
  h_resolution_px: 1920,
  hfov_deg: 1.5, // narrow terminal EO (NO gimbal — see cue/pointing error)
  sensor_width_mm: 6.4,
  terminal_recognition_range_m: 500, // onboard EO↔target relative LOS distance at selected task completion
  // Nominal 50% Johnson criteria converted at ≈2 pixels per resolved cycle.
  // Replace with task-specific test/ROC calibration when available.
  n50_detection: 2,
  n50_recognition: 8,
  n50_identification: 12.8,
  required_discrimination: 'recognition',
  // NOTE: a gimbal-less D/R/I-at-range concept only closes if the TOTAL
  // pointing error stays sub-degree (√(cue²+point²) ≲ 0.5°); larger errors make
  // P_acq collapse for any FOV narrow enough to recognise the target. These are
  // aggressive design-target placeholders, NOT measured values — SME-VERIFY.
  cue_error_deg: 0.3, // radar cue bearing accuracy, 1σ
  pointing_error_deg: 0.4, // body-fixed camera pointing error, 1σ
  visibility_km: 40, // atmospheric visibility (clear day baseline) — SME-VERIFY
}

export const DEFAULT_EFFECTOR: EffectorSpec = {
  payload: 'net_gun',
  launch_delay_s: 4.0,
  cruise_speed_m_s: 50,
  commit_range_m: 3000, // 발사 개시 거리(교리) — 운용 요구값
  max_engagement_range_m: 2500,
  launch_pad_range_from_asset_m: 0,
  single_shot_pk_net: 0.7,
  single_shot_pk_shotgun: 0.6,
  shot_opportunities: 2,
  endurance_s: 1200, // ~20 min — v_i·endurance ≫ max_range at defaults (non-binding) — SME-VERIFY
  reach_margin_sigma_m: 200, // standoff margin 1σ — SME-VERIFY
}

export const DEFAULT_C2: C2Spec = {
  decision_latency_s: 10,
  decision_reliability: 0.98,
  decision_recognition_coupling: 0, // legacy field; post-launch EO cannot affect pre-launch approval
  false_engagement_enabled: false, // OPTION off by default — enable to model 오교전 risk
  non_threat_rate: 0.2, // 비위협 유입률 — SME-VERIFY
  false_pass_detection: 0.8, // EO 미적용/EO 탐지는 비위협 오통과가 높다고 가정 — SME-VERIFY
  false_pass_recognition: 0.2, // EO 인식이 비위협 대부분 기각 — SME-VERIFY
  false_pass_identification: 0.05, // 식별은 거의 다 기각 — SME-VERIFY
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
