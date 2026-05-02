// ────────────────────────────────────────────────────────────
// Scenario engine.
//
// Drives the 6-stage kill chain on a wall-clock timeline.
// AUTO mode: phases advance automatically per the schedule below.
// MANUAL mode: phases up to APPROVE advance automatically; LAUNCH
// then waits for the operator to click [ LAUNCH ] (or [ DISMISS ]).
//
// This file is the single place where "what happens at T+Xs" is
// defined. Components read kill_chain.phase + scenario_clock_ms
// and render accordingly.
// ────────────────────────────────────────────────────────────

import type {
  CUASTelemetry,
  InterceptSolution,
  KillChainPhase,
  StatusTextMessage,
  TrackedTarget,
} from './types'
import { INCHEON } from './mockData'

// Phase schedule — when each phase BEGINS (in ms from scenario t0).
// AUTO progresses through all phases. MANUAL stops at APPROVE.
//
// Sized so that the FPV ground speed (32.8 m/s · 118 km/h) is consistent
// with ingress (2km) → capture point (VIP+1km, ~30s of motion). Plenty of
// dwell time on each phase for an IR demo.
export const PHASE_SCHEDULE: Record<KillChainPhase, number> = {
  standby: 0,
  detect: 3_000,        // T+3s  · range ~1.95km
  confirm: 10_000,      // T+10s · range ~1.72km · multi-sensor confirms
  approve: 18_000,      // T+18s · range ~1.46km · operator decision window
  launch: 24_000,       // T+24s · range ~1.27km · AB-U10 spinning up
  capture: 35_000,      // T+35s · range  1.00km · intercept @ capture point
  report: 42_000,       // T+42s · debrief screen
}

// Total scenario length when AUTO runs to completion (REPORT stays visible).
export const SCENARIO_TOTAL_MS = 50_000

const HOSTILE_TRACK_ID = 'TRK-001'

// ── Tick · advance state by `dt_ms` ───────────────────────────
//
// Returns a new CUASTelemetry. Does not mutate the input.
export function tick(prev: CUASTelemetry, dt_ms: number, running: boolean): CUASTelemetry {
  if (!running) return prev

  const t = prev.scenario_clock_ms + dt_ms

  // Determine the phase that should be active at time `t`.
  // In MANUAL mode we hold at APPROVE until the operator decides.
  const intendedPhase = phaseAtTime(t)
  let nextPhase: KillChainPhase = intendedPhase
  if (prev.scenario_mode === 'manual') {
    // If the operator hasn't approved yet, hold at APPROVE.
    // The approve / dismiss handlers in App.tsx push the phase forward.
    if (
      (intendedPhase === 'launch' || intendedPhase === 'capture' || intendedPhase === 'report') &&
      prev.kill_chain.phase === 'approve'
    ) {
      nextPhase = 'approve'
    }
  }

  // Phase change event → log status text + side-effects.
  const phaseChanged = nextPhase !== prev.kill_chain.phase
  const status_texts = phaseChanged
    ? [...prev.status_texts.slice(-19), phaseChangeMessage(nextPhase, t)]
    : prev.status_texts

  // Update threat track + intercept solution + AB-U10 state per phase.
  const tracks = updateTracks(prev.tracks, nextPhase, t)
  const intercept_solution = updateInterceptSolution(prev.intercept_solution, nextPhase, prev.payload_mode, t)
  const vehicles = updateVehicles(prev.vehicles, nextPhase, t)

  return {
    ...prev,
    scenario_clock_ms: Math.min(t, SCENARIO_TOTAL_MS + 5_000),
    kill_chain: {
      phase: nextPhase,
      phase_t0_ms: phaseChanged ? t : prev.kill_chain.phase_t0_ms,
      scenario_t0_ms: prev.kill_chain.scenario_t0_ms,
      target_track_id: nextPhase === 'standby' ? null : HOSTILE_TRACK_ID,
    },
    tracks,
    intercept_solution,
    vehicles,
    status_texts,
  }
}

// ── Operator commands (MANUAL mode) ───────────────────────────

export function operatorApprove(prev: CUASTelemetry): CUASTelemetry {
  if (prev.kill_chain.phase !== 'approve') return prev
  return {
    ...prev,
    kill_chain: { ...prev.kill_chain, phase: 'launch', phase_t0_ms: prev.scenario_clock_ms },
    status_texts: [
      ...prev.status_texts.slice(-19),
      msg('CRITICAL', '✓ OPERATOR APPROVED · AB-U10 LAUNCHING', prev.scenario_clock_ms),
    ],
  }
}

export function operatorDismiss(prev: CUASTelemetry): CUASTelemetry {
  return {
    ...prev,
    kill_chain: { phase: 'standby', phase_t0_ms: 0, scenario_t0_ms: 0, target_track_id: null },
    scenario_clock_ms: 0,
    tracks: {},
    intercept_solution: null,
    status_texts: [
      ...prev.status_texts.slice(-19),
      msg('NOTICE', '✕ DISMISSED · TRACK MARKED AS NON-HOSTILE', prev.scenario_clock_ms),
    ],
  }
}

// ── Helpers ───────────────────────────────────────────────────

function phaseAtTime(t_ms: number): KillChainPhase {
  if (t_ms < PHASE_SCHEDULE.detect) return 'standby'
  if (t_ms < PHASE_SCHEDULE.confirm) return 'detect'
  if (t_ms < PHASE_SCHEDULE.approve) return 'confirm'
  if (t_ms < PHASE_SCHEDULE.launch) return 'approve'
  if (t_ms < PHASE_SCHEDULE.capture) return 'launch'
  if (t_ms < PHASE_SCHEDULE.report) return 'capture'
  return 'report'
}

function phaseChangeMessage(phase: KillChainPhase, t_ms: number): StatusTextMessage {
  const msgs: Record<KillChainPhase, [StatusTextMessage['severity'], string]> = {
    standby: ['INFO', 'standby · monitoring'],
    detect: ['WARNING', '⚠ TRACK DETECTED · NW 320° · range 4.1km · classifying'],
    confirm: ['CRITICAL', '⚠⚠ HOSTILE FPV CONFIRMED · fiber optic · RF-DARK'],
    approve: ['CRITICAL', '⚠ APPROVAL REQUIRED · intercept solution ready'],
    launch: ['CRITICAL', '✓ AB-U10 LAUNCHED · vertical climb · transit'],
    capture: ['ALERT', '⚡ ENGAGEMENT WINDOW · AB-U10 closing on target'],
    report: ['INFO', '✓✓ TARGET NEUTRALIZED · debrief in progress'],
  }
  const [sev, text] = msgs[phase]
  return msg(sev, text, t_ms)
}

function msg(severity: StatusTextMessage['severity'], text: string, t_ms: number): StatusTextMessage {
  return { received_ms: t_ms, system_id: 1, component_id: 1, severity, text }
}

// Capture point — where AB-U10 intercepts the hostile drone.
// Set ~1km W of VIP (out of reach of conventional multicopter + net-gun
// teams; this is AB-U10's differentiator). The InterceptSolution.range_from_vip_m
// below is held to the same number so THREAT and INTERCEPT cards agree.
const CAPTURE_LAT = INCHEON.vip_lat + 0.0010   // slight N offset (intercept geometry)
const CAPTURE_LON = INCHEON.vip_lon - 0.0117   // ~1.0km W of VIP

// ── Track lifecycle ──
//
// DETECT/CONFIRM/APPROVE/LAUNCH: hostile drone moves linearly from ingress
//   origin → CAPTURE point at its real ground speed (32.8 m/s · 118 km/h).
// CAPTURE: track frozen at capture point (intercept happens here).
// REPORT:  track stays frozen at capture point with NEUTRALIZED label.
function updateTracks(
  prevTracks: Record<string, TrackedTarget>,
  phase: KillChainPhase,
  t_ms: number,
): Record<string, TrackedTarget> {
  if (phase === 'standby') return {}

  // Once captured, freeze the track at the capture point. Drone is downed.
  if (phase === 'capture' || phase === 'report') {
    const range_m = haversine(CAPTURE_LAT, CAPTURE_LON, INCHEON.vip_lat, INCHEON.vip_lon)
    const bearing_deg = bearing(INCHEON.vip_lat, INCHEON.vip_lon, CAPTURE_LAT, CAPTURE_LON)
    const prev = prevTracks[HOSTILE_TRACK_ID]
    const frozen: TrackedTarget = {
      track_id: HOSTILE_TRACK_ID,
      classification: 'hostile_fpv',
      confidence: 0.99,
      first_seen_ms: prev?.first_seen_ms ?? PHASE_SCHEDULE.detect,
      last_seen_ms: t_ms,
      lat_deg: CAPTURE_LAT,
      lon_deg: CAPTURE_LON,
      alt_m_agl: phase === 'report' ? 0 : 85, // crashed
      bearing_deg,
      range_m,
      ground_speed_m_s: 0,                    // stopped · intercept successful
      course_deg: 130,
      rf_status: 'rf_dark',
      link_type: 'fiber_optic',
      type_hint: phase === 'report' ? 'NEUTRALIZED · DOWNED' : 'ENGAGEMENT',
    }
    return { [HOSTILE_TRACK_ID]: frozen }
  }

  // Linear approach from ingress origin → CAPTURE point, normalized over
  // detect → capture window (so velocity stays realistic).
  const tStart = PHASE_SCHEDULE.detect
  const tEnd = PHASE_SCHEDULE.capture
  const u = Math.min(1, Math.max(0, (t_ms - tStart) / (tEnd - tStart)))

  const lat = lerp(INCHEON.threat_ingress_lat, CAPTURE_LAT, u)
  const lon = lerp(INCHEON.threat_ingress_lon, CAPTURE_LON, u)
  const range_m = haversine(lat, lon, INCHEON.vip_lat, INCHEON.vip_lon)
  const bearing_deg = bearing(INCHEON.vip_lat, INCHEON.vip_lon, lat, lon)

  const classification: TrackedTarget['classification'] =
    phase === 'detect' ? 'unknown' : 'hostile_fpv'
  const confidence = phase === 'detect' ? 0.62 : phase === 'confirm' ? 0.94 : 0.99

  const track: TrackedTarget = {
    track_id: HOSTILE_TRACK_ID,
    classification,
    confidence,
    first_seen_ms: PHASE_SCHEDULE.detect,
    last_seen_ms: t_ms,
    lat_deg: lat,
    lon_deg: lon,
    alt_m_agl: 85,
    bearing_deg,
    range_m,
    ground_speed_m_s: 32.8, // ~118 km/h
    course_deg: 130,
    rf_status: phase === 'detect' ? 'unknown' : 'rf_dark',
    link_type: phase === 'detect' ? 'unknown' : 'fiber_optic',
    type_hint: phase === 'detect' ? 'small UAS · sub-3kg' : 'FPV · FIBER OPTIC',
  }
  return { [HOSTILE_TRACK_ID]: track }
}

// ── Intercept solution: appears at CONFIRM, refines through CAPTURE ──
function updateInterceptSolution(
  prev: InterceptSolution | null,
  phase: KillChainPhase,
  payload_mode: CUASTelemetry['payload_mode'],
  _t_ms: number,
): InterceptSolution | null {
  if (phase === 'standby' || phase === 'detect') return null
  if (phase === 'report') return prev // freeze last solution for debrief

  // Capture point: ~640m from VIP on the threat's bearing line.
  const eta_to_capture_s = Math.max(
    1,
    Math.round((PHASE_SCHEDULE.report - 5_000 - _t_ms) / 1000),
  )

  return {
    target_track_id: HOSTILE_TRACK_ID,
    capture_lat_deg: CAPTURE_LAT,
    capture_lon_deg: CAPTURE_LON,
    capture_alt_m_agl: 95,
    range_from_vip_m: 1000,                       // matches CAPTURE_LON offset
    eta_to_capture_s,
    probability: phase === 'confirm' ? 'medium' : 'high',
    payload_mode,
    preferred_zone: payload_mode === 'net_gun' ? 'B' : 'A',
    civilian_avoidance_active: true,
  }
}

// ── Vehicle dynamics — keep telemetry alive each tick ──
function updateVehicles(
  prevVehicles: CUASTelemetry['vehicles'],
  phase: KillChainPhase,
  t_ms: number,
): CUASTelemetry['vehicles'] {
  const next = { ...prevVehicles }

  // AB-U10 — system_status changes through the phases.
  const u10 = next[10]
  if (u10) {
    const u10Status =
      phase === 'launch'
        ? 'AIRBORNE · CLIMB'
        : phase === 'capture'
          ? 'AIRBORNE · INTERCEPT'
          : phase === 'report'
            ? 'RTB'
            : phase === 'approve' || phase === 'confirm'
              ? 'ARMED · STANDBY'
              : 'STANDBY'

    // Approximate altitude & airspeed by phase.
    // LAUNCH (T+24s) → CAPTURE (T+35s) is 11s — AB-U10 vertical climb then
    // accelerates west toward capture point (~1.5km transit at ~50 m/s peak).
    let alt = 12, airspeed = 0, throttle = 0, climb = 0
    if (phase === 'launch') {
      const u = Math.min(1, (t_ms - PHASE_SCHEDULE.launch) / 11_000)
      alt = 12 + 83 * u                    // 12m → 95m
      airspeed = 50 * u                    // 0 → 50 m/s (180 km/h)
      throttle = 95
      climb = u < 0.4 ? 7 : 2              // strong climb, then level
    } else if (phase === 'capture') {
      alt = 95
      airspeed = 44                        // ~160 km/h
      throttle = 88
      climb = 0
    } else if (phase === 'report') {
      alt = 80
      airspeed = 30
      throttle = 60
      climb = -2
    }

    next[10] = {
      ...u10,
      heartbeat: u10.heartbeat
        ? { ...u10.heartbeat, last_seen_ms: t_ms, system_status: `MAV_STATE_${u10Status}` }
        : null,
      vfr_hud: u10.vfr_hud
        ? {
            ...u10.vfr_hud,
            last_seen_ms: t_ms,
            airspeed_m_s: airspeed,
            groundspeed_m_s: airspeed * 0.95,
            throttle_pct: throttle,
            alt_m: alt,
            climb_m_s: climb,
          }
        : null,
      battery: u10.battery
        ? {
            ...u10.battery,
            last_seen_ms: t_ms,
            // gentle drain during flight
            remaining_pct: Math.max(60, (u10.battery.remaining_pct ?? 98) - (phase === 'launch' || phase === 'capture' ? 0.02 : 0)),
          }
        : null,
    }
  }

  // MC-01 — slow orbit; bump last_seen so freshness badges stay green.
  const mc = next[20]
  if (mc) {
    next[20] = {
      ...mc,
      heartbeat: mc.heartbeat ? { ...mc.heartbeat, last_seen_ms: t_ms } : null,
      position: mc.position ? { ...mc.position, last_seen_ms: t_ms } : null,
    }
  }
  const radar = next[30]
  if (radar) {
    next[30] = { ...radar, heartbeat: radar.heartbeat ? { ...radar.heartbeat, last_seen_ms: t_ms } : null }
  }

  return next
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3
  const toRad = (d: number) => (d * Math.PI) / 180
  const p1 = toRad(lat1), p2 = toRad(lat2)
  const dp = toRad(lat2 - lat1), dl = toRad(lon2 - lon1)
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dl = toRad(lon2 - lon1)
  const y = Math.sin(dl) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dl)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}
