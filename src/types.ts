// ────────────────────────────────────────────────────────────
// Data model.
//
// The first block ("Telemetry / *Slice") mirrors the shapes that
// airbility-gcs/web/src/App.tsx already consumes from
// `GET /api/telemetry`. We keep field names identical so that
// when this mockup graduates to the real GCS, the same JSON
// blob drives both UIs.
//
// The second block ("C-UAS extensions") defines the NEW shapes
// this scenario needs (radar tracks, intercept solution, kill
// chain phase, payload mode, …). These will need an ADR + new
// MAVLink/proto messages before they go into the real ICD.
// ────────────────────────────────────────────────────────────

// ── Block 1 · existing GCS Telemetry slices (verbatim) ────────

export interface HeartbeatSlice {
  last_seen_ms: number
  system_id: number
  component_id: number
  type: string
  autopilot: string
  system_status: string
  mavlink_version: number
  flight_mode: string
  base_mode: number
  custom_mode: number
}

export interface PositionSlice {
  last_seen_ms: number
  system_id: number
  component_id: number
  lat_deg: number
  lon_deg: number
  alt_m: number
  relative_alt_m: number
  heading_deg: number | null
  vx_m_s: number
  vy_m_s: number
  vz_m_s: number
}

export interface AttitudeSlice {
  last_seen_ms: number
  system_id: number
  component_id: number
  roll_deg: number
  pitch_deg: number
  yaw_deg: number
  rollspeed_deg_s: number
  pitchspeed_deg_s: number
  yawspeed_deg_s: number
}

export interface VfrHudSlice {
  last_seen_ms: number
  system_id: number
  component_id: number
  airspeed_m_s: number
  groundspeed_m_s: number
  heading_deg: number
  throttle_pct: number
  alt_m: number
  climb_m_s: number
}

export interface BatterySlice {
  last_seen_ms: number
  system_id: number
  component_id: number
  battery_id: number
  total_voltage_v: number
  current_a: number | null
  remaining_pct: number | null
  temperature_c: number | null
}

export interface GpsSlice {
  last_seen_ms: number
  system_id: number
  component_id: number
  fix_type: string
  satellites_visible: number | null
  hdop: number | null
}

export interface StatusTextMessage {
  received_ms: number
  system_id: number
  component_id: number
  severity: 'EMERGENCY' | 'ALERT' | 'CRITICAL' | 'ERROR' | 'WARNING' | 'NOTICE' | 'INFO' | 'DEBUG'
  text: string
}

// One vehicle's complete state, indexed by sysid.
// In airbility-gcs it's a single record; for C-UAS we track multiple.
export interface VehicleSlice {
  sysid: number
  callsign: string                         // 'AB-U10', 'MC-01', …
  role: VehicleRole
  heartbeat: HeartbeatSlice | null
  position: PositionSlice | null
  attitude: AttitudeSlice | null
  vfr_hud: VfrHudSlice | null
  battery: BatterySlice | null
  gps: GpsSlice | null
}

export type VehicleRole =
  | 'interceptor'      // AB-U10
  | 'overwatch'        // multicopter w/ EO/IR
  | 'radar'            // ground radar (Fortem etc.)
  | 'gcs'              // GCS itself (heartbeat only)

// ── Block 2 · C-UAS extensions (new — need ADR for ICD) ──────

/**
 * Tracked target from radar + sensor fusion.
 * Likely future MAVLink: AIRBILITY_TRACK_REPORT (TBD ID).
 */
export interface TrackedTarget {
  track_id: string
  classification: 'unknown' | 'hostile_fpv' | 'commercial' | 'friendly' | 'bird'
  confidence: number                 // 0..1
  first_seen_ms: number
  last_seen_ms: number
  // ENU-relative to radar origin OR WGS-84
  lat_deg: number
  lon_deg: number
  alt_m_agl: number
  // motion
  bearing_deg: number                // from GCS, 0=N
  range_m: number                    // from GCS
  ground_speed_m_s: number
  course_deg: number
  // RF / link characteristics
  rf_status: 'unknown' | 'rf_dark' | 'commercial_2_4' | 'commercial_5_8' | 'analog'
  link_type: 'unknown' | 'fiber_optic' | 'rf' | 'autonomous'
  // ID hints
  type_hint: string                  // 'FPV · FIBER OPTIC' freeform
}

export type KillChainPhase =
  | 'standby'         // no track
  | 'detect'          // radar return, classification pending
  | 'confirm'         // multi-sensor confirm hostile
  | 'approve'         // operator decision pending
  | 'launch'          // AB-U10 spinning up / airborne
  | 'capture'         // intercept in progress
  | 'report'          // post-engagement debrief

export interface KillChainState {
  phase: KillChainPhase
  phase_t0_ms: number                // when phase started
  scenario_t0_ms: number             // overall scenario clock
  target_track_id: string | null
}

export type PayloadMode = 'net_gun' | 'shotgun'

export interface InterceptSolution {
  target_track_id: string
  capture_lat_deg: number
  capture_lon_deg: number
  capture_alt_m_agl: number
  range_from_vip_m: number           // distance from protected asset
  eta_to_capture_s: number
  probability: 'low' | 'medium' | 'high'
  payload_mode: PayloadMode
  // env_diagram zones — visual hint for operator
  preferred_zone: 'A' | 'B' | 'C'
  // future: civilian-avoidance polygon. for now visualization only.
  civilian_avoidance_active: boolean
}

export interface ProtectedAsset {
  callsign: string
  lat_deg: number
  lon_deg: number
  description: string                // 'INCHEON AIRPORT · TERMINAL 1'
}

// ── Top-level state object the UI consumes ───────────────────

export interface CUASTelemetry {
  // scenario chrome
  scenario_clock_ms: number
  payload_mode: PayloadMode
  kill_chain: KillChainState

  // entities (multi-vehicle)
  vehicles: Record<number, VehicleSlice>     // by sysid
  tracks: Record<string, TrackedTarget>      // by track_id
  protected_asset: ProtectedAsset

  // intercept
  intercept_solution: InterceptSolution | null

  // alerts
  status_texts: StatusTextMessage[]

  // misc
  gcs_version: string

  // Per-scenario randomized hostile spawn origin (in a 360° annulus
  // around VIP). Set once at initialState and frozen for the run; reset
  // re-rolls a new origin so each playthrough has a different approach
  // vector.
  threat_origin: { lat: number; lon: number }

  // Capture (intercept) point — chosen at scenario start from a
  // pre-defined list of low-collateral zones (river / park / bridge),
  // picking the one best aligned with the threat approach vector.
  // Stored alongside threat_origin so all consumers (track lerp,
  // intercept solution, AB-U10 trajectory, capture markers) agree.
  capture_point: {
    lat: number
    lon: number
    name: string
    type: 'river' | 'park' | 'bridge'
  }
}
