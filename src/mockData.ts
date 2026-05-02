// ────────────────────────────────────────────────────────────
// Mock telemetry generator.
//
// Plays the role that mock-vehicle.exe plays for airbility-gcs:
// it emits a realistic CUASTelemetry blob on a tick, simulating
// the C-UAS scenario at Incheon Airport.
//
// Replaces a real Go backend until the ICD is ratified and the
// new MAVLink messages are decoded by airbility-gcs/internal/.
// ────────────────────────────────────────────────────────────

import type {
  CUASTelemetry,
  KillChainPhase,
  PayloadMode,
  ScenarioMode,
} from './types'

// Yeouido · National Assembly area as the protected asset.
// 37.5311° N, 126.9170° E (approx).
const VIP_LAT = 37.5311
const VIP_LON = 126.9170

// AB-U10 standby pad — ~500m east of VIP (Yeouido park area).
const U10_LAT = 37.5311
const U10_LON = 126.9229

// Hostile drone ingress origin — ~2.5km W/NW of VIP, ingress from
// Yanghwa Bridge / Mapo direction across the Han River. Distance is
// consistent with the FPV ground speed (32.8 m/s · 118 km/h) and the
// scenario timeline below: ~2km ingress → 1km capture point in ~30s.
const THREAT_INGRESS_LAT = 37.5341
const THREAT_INGRESS_LON = 126.8880

export function initialState(mode: ScenarioMode = 'auto', payload: PayloadMode = 'net_gun'): CUASTelemetry {
  return {
    scenario_clock_ms: 0,
    scenario_mode: mode,
    payload_mode: payload,
    kill_chain: {
      phase: 'standby',
      phase_t0_ms: 0,
      scenario_t0_ms: 0,
      target_track_id: null,
    },
    vehicles: {
      // AB-U10 (interceptor)
      10: {
        sysid: 10,
        callsign: 'AB-U10',
        role: 'interceptor',
        heartbeat: hb(10, 'MAV_TYPE_VTOL_QUADROTOR', 'AB-U10 standing by'),
        position: pos(U10_LAT, U10_LON, 12, 0, 0, 0, null),
        attitude: att(0, 0, 90),
        vfr_hud: hud(0, 0, 90, 0, 12, 0),
        battery: bat(98, 25.1),
        gps: gps('GPS_FIX_TYPE_RTK_FIXED', 18, 0.6),
      },
      // Multicopter overwatch (EO/IR)
      20: {
        sysid: 20,
        callsign: 'MC-01',
        role: 'overwatch',
        heartbeat: hb(20, 'MAV_TYPE_QUADROTOR', 'orbiting'),
        position: pos(VIP_LAT + 0.0008, VIP_LON - 0.0006, 45, 4.5, -3.2, 0, null),
        attitude: att(2, -1, 270),
        vfr_hud: hud(5.5, 5.5, 270, 35, 45, 0),
        battery: bat(72, 22.4),
        gps: gps('GPS_FIX_TYPE_3D_FIX', 14, 1.1),
      },
      // Ground radar
      30: {
        sysid: 30,
        callsign: 'FORTEM-R30',
        role: 'radar',
        heartbeat: hb(30, 'MAV_TYPE_GENERIC', 'scanning 360° · 5km'),
        position: pos(VIP_LAT - 0.0010, VIP_LON + 0.0005, 0, 0, 0, 0, null),
        attitude: null,
        vfr_hud: null,
        battery: null,
        gps: null,
      },
    },
    tracks: {},
    protected_asset: {
      callsign: 'VIP',
      lat_deg: VIP_LAT,
      lon_deg: VIP_LON,
      description: 'YEOUIDO · 주요시설',
    },
    intercept_solution: null,
    status_texts: [
      msg('INFO', 'GCS v0.0.1 — C-UAS mode online', 0),
      msg('INFO', 'Fortem R30 scanning · 360° / 5km', 0),
      msg('NOTICE', 'AB-U10 armed · NET GUN payload', 0),
    ],
    gcs_version: 'cuas-mockup 0.0.1',
  }
}

// ────────────────────────────────────────────────────────────
// Helpers (slice constructors)
// ────────────────────────────────────────────────────────────

function hb(sysid: number, type: string, _statustext_hint: string) {
  return {
    last_seen_ms: 0,
    system_id: sysid,
    component_id: 1,
    type,
    autopilot: 'MAV_AUTOPILOT_PX4',
    system_status: 'MAV_STATE_STANDBY',
    mavlink_version: 2,
    flight_mode: 'STABILIZED',
    base_mode: 0x80, // armed
    custom_mode: 0,
  }
}

function pos(
  lat: number,
  lon: number,
  alt: number,
  vx: number,
  vy: number,
  vz: number,
  heading: number | null,
) {
  return {
    last_seen_ms: 0,
    system_id: 0,
    component_id: 1,
    lat_deg: lat,
    lon_deg: lon,
    alt_m: alt,
    relative_alt_m: alt,
    heading_deg: heading,
    vx_m_s: vx,
    vy_m_s: vy,
    vz_m_s: vz,
  }
}

function att(roll: number, pitch: number, yaw: number) {
  return {
    last_seen_ms: 0,
    system_id: 0,
    component_id: 1,
    roll_deg: roll,
    pitch_deg: pitch,
    yaw_deg: yaw,
    rollspeed_deg_s: 0,
    pitchspeed_deg_s: 0,
    yawspeed_deg_s: 0,
  }
}

function hud(
  airspeed: number,
  groundspeed: number,
  heading: number,
  throttle: number,
  alt: number,
  climb: number,
) {
  return {
    last_seen_ms: 0,
    system_id: 0,
    component_id: 1,
    airspeed_m_s: airspeed,
    groundspeed_m_s: groundspeed,
    heading_deg: heading,
    throttle_pct: throttle,
    alt_m: alt,
    climb_m_s: climb,
  }
}

function bat(remaining_pct: number, voltage: number) {
  return {
    last_seen_ms: 0,
    system_id: 0,
    component_id: 1,
    battery_id: 0,
    total_voltage_v: voltage,
    current_a: 12.5,
    remaining_pct,
    temperature_c: 28,
  }
}

function gps(fix_type: string, sats: number, hdop: number) {
  return {
    last_seen_ms: 0,
    system_id: 0,
    component_id: 1,
    fix_type,
    satellites_visible: sats,
    hdop,
  }
}

function msg(severity: any, text: string, t_ms: number) {
  return {
    received_ms: t_ms,
    system_id: 1,
    component_id: 1,
    severity,
    text,
  }
}

// Phase order — used by kill chain UI and by future scenario tick.
export const KILL_CHAIN_ORDER: KillChainPhase[] = [
  'standby',
  'detect',
  'confirm',
  'approve',
  'launch',
  'capture',
  'report',
]

export const KILL_CHAIN_LABELS: Record<KillChainPhase, string> = {
  standby: 'STANDBY',
  detect: 'DETECT',
  confirm: 'CONFIRM',
  approve: 'APPROVE',
  launch: 'LAUNCH',
  capture: 'CAPTURE',
  report: 'REPORT',
}

// Scenario constants — shared across mockData + components.
// Variable name kept as INCHEON for backwards-compat with existing imports;
// coordinates now point at Yeouido. (TODO · rename to SITE or LOCATION.)
export const INCHEON = {
  vip_lat: VIP_LAT,
  vip_lon: VIP_LON,
  u10_lat: U10_LAT,
  u10_lon: U10_LON,
  threat_ingress_lat: THREAT_INGRESS_LAT,
  threat_ingress_lon: THREAT_INGRESS_LON,
}
