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
} from './types'

// Yeouido · National Assembly area as the protected asset.
// 37.5311° N, 126.9170° E (approx).
const VIP_LAT = 37.5311
const VIP_LON = 126.9170

// AB-U10 standby pad — ~500m east of VIP (Yeouido park area).
const U10_LAT = 37.5311
const U10_LON = 126.9229

// Hostile drone ingress — randomized per scenario in a 360° ring around
// VIP. ~3km gives the kill chain enough margin: detect → confirm →
// approve → launch → intercept all play out at realistic 32.8 m/s without
// feeling rushed. PHASE_SCHEDULE in scenario.ts is sized to match.
export const THREAT_SPAWN_RADIUS_MIN_M = 2500
export const THREAT_SPAWN_RADIUS_MAX_M = 3500

const M_PER_DEG_LAT = 111_320

function metersToDeg(latRef: number, dx_m: number, dy_m: number): { dLat: number; dLon: number } {
  const dLat = dy_m / M_PER_DEG_LAT
  const dLon = dx_m / (M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180))
  return { dLat, dLon }
}

function randomThreatOrigin(): { lat: number; lon: number } {
  // Uniform on a 360° annulus around VIP. sqrt-of-uniform over the
  // r² range keeps area-density uniform inside the ring (otherwise
  // points cluster on the inner edge).
  const angle = Math.random() * 2 * Math.PI
  const r2 =
    THREAT_SPAWN_RADIUS_MIN_M * THREAT_SPAWN_RADIUS_MIN_M +
    Math.random() *
      (THREAT_SPAWN_RADIUS_MAX_M * THREAT_SPAWN_RADIUS_MAX_M -
        THREAT_SPAWN_RADIUS_MIN_M * THREAT_SPAWN_RADIUS_MIN_M)
  const r = Math.sqrt(r2)
  const { dLat, dLon } = metersToDeg(VIP_LAT, r * Math.cos(angle), r * Math.sin(angle))
  return {
    lat: VIP_LAT + dLat,
    lon: VIP_LON + dLon,
  }
}

// Pre-defined low-collateral engagement zones · regions where debris
// can fall safely (water, open park, contained bridge deck). Each zone
// is a polygon (highlighted on the map) plus a center point (where the
// engagement circle is drawn once chosen). The picker scores zones by
// approach-vector alignment + safety preference (river > park > bridge).
//
// Coordinates are approximate Yeouido geography — refine against
// satellite imagery before flight ops.
export type CaptureZoneType = 'river' | 'park' | 'bridge'

export interface CaptureZone {
  id: string
  name: string
  type: CaptureZoneType
  centerLat: number
  centerLon: number
  // Polygon vertices as a flat [lon, lat, lon, lat, ...] array, the
  // form Cesium's Cartesian3.fromDegreesArray expects.
  polygon: number[]
}

export const CAPTURE_ZONES: CaptureZone[] = [
  // ── 한강 수역 (4 directional river zones around Yeouido) ───────
  {
    id: 'river_n',
    name: '한강 · N 수역',
    type: 'river',
    centerLat: 37.5390, centerLon: 126.9170,
    polygon: [
      126.9100, 37.5360,
      126.9280, 37.5360,
      126.9280, 37.5440,
      126.9100, 37.5440,
    ],
  },
  {
    id: 'river_s',
    name: '한강 · S 수역',
    type: 'river',
    centerLat: 37.5230, centerLon: 126.9170,
    polygon: [
      126.9100, 37.5170,
      126.9280, 37.5170,
      126.9280, 37.5260,
      126.9100, 37.5260,
    ],
  },
  {
    id: 'river_e',
    name: '한강 · E 수역',
    type: 'river',
    centerLat: 37.5290, centerLon: 126.9360,
    polygon: [
      126.9300, 37.5230,
      126.9450, 37.5230,
      126.9450, 37.5340,
      126.9300, 37.5340,
    ],
  },
  {
    id: 'river_w',
    name: '한강 · W 수역',
    type: 'river',
    centerLat: 37.5310, centerLon: 126.9050,
    polygon: [
      126.8950, 37.5260,
      126.9100, 37.5260,
      126.9100, 37.5360,
      126.8950, 37.5360,
    ],
  },
  // ── 공원 zones ────────────────────────────────────────────────
  {
    id: 'yeouido_park',
    name: '여의도공원',
    type: 'park',
    centerLat: 37.5263, centerLon: 126.9180,
    polygon: [
      126.9160, 37.5240,
      126.9210, 37.5240,
      126.9210, 37.5290,
      126.9160, 37.5290,
    ],
  },
  {
    id: 'hangang_park_n',
    name: '한강시민공원',
    type: 'park',
    centerLat: 37.5347, centerLon: 126.9170,
    polygon: [
      126.9110, 37.5335,
      126.9280, 37.5335,
      126.9280, 37.5360,
      126.9110, 37.5360,
    ],
  },
  // ── 다리 zones (격리된 도로 데크) ─────────────────────────────
  {
    id: 'mapo_bridge',
    name: '마포대교',
    type: 'bridge',
    centerLat: 37.5400, centerLon: 126.9215,
    polygon: [
      126.9205, 37.5345,
      126.9225, 37.5345,
      126.9225, 37.5455,
      126.9205, 37.5455,
    ],
  },
  {
    id: 'seogang_bridge',
    name: '서강대교',
    type: 'bridge',
    centerLat: 37.5400, centerLon: 126.9100,
    polygon: [
      126.9090, 37.5345,
      126.9110, 37.5345,
      126.9110, 37.5455,
      126.9090, 37.5455,
    ],
  },
]

const TYPE_PREFERENCE: Record<CaptureZoneType, number> = {
  river: 18,   // strong preference · water absorbs debris, no people
  park: 9,     // open ground, low density
  bridge: 0,   // contained but vehicular traffic
}

function bearingDeg(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const φ1 = (fromLat * Math.PI) / 180
  const φ2 = (toLat * Math.PI) / 180
  const Δλ = ((toLon - fromLon) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function angularDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

// Choose the engagement zone most aligned with the threat approach
// vector (VIP → origin). Type bonus lets a river slightly off-axis
// beat a closer bridge.
export function pickCaptureZone(origin: { lat: number; lon: number }): CaptureZone {
  const approach = bearingDeg(VIP_LAT, VIP_LON, origin.lat, origin.lon)
  let best = CAPTURE_ZONES[0]
  let bestScore = -Infinity
  for (const z of CAPTURE_ZONES) {
    const zBearing = bearingDeg(VIP_LAT, VIP_LON, z.centerLat, z.centerLon)
    const dBearing = angularDeltaDeg(zBearing, approach)
    const score = -dBearing + TYPE_PREFERENCE[z.type]
    if (score > bestScore) {
      bestScore = score
      best = z
    }
  }
  return best
}

export function initialState(payload: PayloadMode = 'net_gun'): CUASTelemetry {
  const threat_origin = randomThreatOrigin()
  const zone = pickCaptureZone(threat_origin)
  // Place the capture point exactly on the VIP→origin ray, at the
  // chosen zone's distance from VIP. Keeps the threat trajectory
  // visually aligned ("approaching VIP") regardless of zone polygon
  // geography. The zone NAME and TYPE still describe the engagement
  // (e.g. "한강 N 수역 · RIVER") — only the position is snapped to
  // the corridor line for cleaner visuals.
  const cosLat = Math.cos((VIP_LAT * Math.PI) / 180)
  const dy_zone_m = (zone.centerLat - VIP_LAT) * M_PER_DEG_LAT
  const dx_zone_m = (zone.centerLon - VIP_LON) * M_PER_DEG_LAT * cosLat
  const zoneDistFromVIP = Math.sqrt(dx_zone_m * dx_zone_m + dy_zone_m * dy_zone_m)
  const dy_origin_m = (threat_origin.lat - VIP_LAT) * M_PER_DEG_LAT
  const dx_origin_m = (threat_origin.lon - VIP_LON) * M_PER_DEG_LAT * cosLat
  const originDist = Math.sqrt(dx_origin_m * dx_origin_m + dy_origin_m * dy_origin_m) || 1
  const ux = dx_origin_m / originDist
  const uy = dy_origin_m / originDist
  const capture_point = {
    lat: VIP_LAT + (uy * zoneDistFromVIP) / M_PER_DEG_LAT,
    lon: VIP_LON + (ux * zoneDistFromVIP) / (M_PER_DEG_LAT * cosLat),
    name: zone.name,
    type: zone.type,
  }
  return {
    scenario_clock_ms: 0,
    threat_origin,
    capture_point,
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
        position: pos(U10_LAT, U10_LON, 0, 0, 0, 0, null),
        attitude: att(0, 0, 90),
        vfr_hud: hud(0, 0, 90, 0, 0, 0),
        battery: bat(98, 25.1),
        gps: gps('GPS_FIX_TYPE_RTK_FIXED', 18, 0.6),
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
}
