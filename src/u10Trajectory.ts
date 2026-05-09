// ────────────────────────────────────────────────────────────
// AB-U10 trajectory model.
//
// Pulls the geographic AB-U10 position out of MapPanel/MultiCopterEO so
// they share one source of truth.
//
// Engagement profile (dogfight-style):
//  - LAUNCH (T+launch..(capture - 1.5s)): bezier curve from the standby
//    pad, arcing into the threat's 6 o'clock — the curve endpoint is
//    where the threat WILL BE when the tail-chase begins, offset 60m
//    along the threat's reciprocal heading.
//  - LAUNCH (last 1.5s): tail chase. AB-U10 matches threat velocity at
//    a constant 60m 6-o'clock offset. This is the "dogfight lock" —
//    operator sees both vehicles flying parallel for a beat before the
//    weapon fires (high-Pk geometry).
//  - CAPTURE (~2s): engagement instant. Threat is frozen at the
//    capture_point and falling; U10 holds at the 6 o'clock behind it.
//  - CAPTURE..REPORT: straight RTB back to the standby pad.
//
// All 6-o'clock offsets are computed dynamically from the threat's
// actual heading (bearing from origin → capture_point), so the chase
// works regardless of which direction the threat is approaching from.
// ────────────────────────────────────────────────────────────

import type { CUASTelemetry } from './types'
import { INCHEON } from './mockData'
import { PHASE_SCHEDULE, SCENARIO_TOTAL_MS } from './scenario'

export type LL = [number, number]

// Pull launch/capture timings from the schedule so this file stays in
// sync if the scenario timeline is rescaled (e.g. when threat spawn
// distance changes).
const LAUNCH_T0_MS = PHASE_SCHEDULE.launch
const CAPTURE_T0_MS = PHASE_SCHEDULE.capture
const LAUNCH_DURATION_MS = CAPTURE_T0_MS - LAUNCH_T0_MS
const RTB_DURATION_MS = SCENARIO_TOTAL_MS - CAPTURE_T0_MS

// Tail-chase window at the end of LAUNCH — U10 follows threat in lock.
const TAIL_CHASE_DURATION_MS = 1_500
// 6-o'clock offset distance behind the threat. ~60m gives a clear
// "behind" read in cinematic + tactical without losing weapon range.
const TAIL_CHASE_OFFSET_M = 60

// During CAPTURE phase, AB-U10 holds at the 6-o'clock approach point for a
// short engagement window (firing the payload, neutralization moment) before
// starting RTB. This is what makes the kill visible in the main-map view.
const CAPTURE_HOLD_MS = 2_000

const M_PER_DEG_LAT = 111_320

// Cubic bezier · gives two control points (one near each endpoint), so
// we can independently fix the tangent (= heading direction) at start
// AND end. Used for the launch maneuver where we want the U10 to:
//   - leave the pad heading toward the engagement
//   - arrive at tail-entry already aligned with the threat's heading
// Quadratic bezier can't do both — its single control point couples
// the two tangents, which is what made the old turn snap into the
// tail chase.
function bezier3(p0: LL, p1: LL, p2: LL, p3: LL, t: number): LL {
  const omt = 1 - t
  const a = omt * omt * omt
  const b = 3 * omt * omt * t
  const c = 3 * omt * t * t
  const d = t * t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  ]
}

function bezier3Tangent(p0: LL, p1: LL, p2: LL, p3: LL, t: number): LL {
  const omt = 1 - t
  return [
    3 * omt * omt * (p1[0] - p0[0]) + 6 * omt * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * omt * omt * (p1[1] - p0[1]) + 6 * omt * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]),
  ]
}

// Bearing from (lat1, lon1) → (lat2, lon2) in degrees [0, 360).
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Shortest-path angular interpolation. e.g. lerp(350°, 10°, 0.5) → 0°
// (goes through 0, not the long way around).
function lerpAngleDeg(a: number, b: number, t: number): number {
  let diff = ((b - a) % 360 + 540) % 360 - 180
  return ((a + diff * t) % 360 + 360) % 360
}

// Smoothstep easing — 0 to 1 with ease-in / ease-out.
function smoothstep(x: number): number {
  return x * x * (3 - 2 * x)
}

// Threat heading — constant during ingress (linear path origin → capture).
function threatHeadingDeg(tel: CUASTelemetry): number {
  return bearingDeg(
    tel.threat_origin.lat,
    tel.threat_origin.lon,
    tel.capture_point.lat,
    tel.capture_point.lon,
  )
}

// Where the threat is at scenario time t_ms (linear ingress).
function threatPositionAt(tel: CUASTelemetry, t_ms: number): LL {
  const tStart = PHASE_SCHEDULE.detect
  const tEnd = PHASE_SCHEDULE.capture
  const u = Math.min(1, Math.max(0, (t_ms - tStart) / (tEnd - tStart)))
  const lat = tel.threat_origin.lat + (tel.capture_point.lat - tel.threat_origin.lat) * u
  const lon = tel.threat_origin.lon + (tel.capture_point.lon - tel.threat_origin.lon) * u
  return [lat, lon]
}

// Position `offsetMeters` behind a target on its 6 o'clock (along the
// reciprocal of `headingDeg`).
function tailPositionFromTarget(target: LL, headingDeg: number, offsetMeters: number): LL {
  const tailBearingRad = ((headingDeg + 180) * Math.PI) / 180
  const dy_m = Math.cos(tailBearingRad) * offsetMeters
  const dx_m = Math.sin(tailBearingRad) * offsetMeters
  const dLat = dy_m / M_PER_DEG_LAT
  const dLon = dx_m / (M_PER_DEG_LAT * Math.cos((target[0] * Math.PI) / 180))
  return [target[0] + dLat, target[1] + dLon]
}

// Compute the 4 cubic-bezier control points for the launch maneuver.
//
//   P0 (start)          standby pad
//   P1                  P0 + (1/3 of distance) along the initial heading
//                       (= bearing from standby toward tail-entry).
//                       Forces the bezier tangent at t=0 to point in
//                       that direction → U10 leaves the pad smoothly.
//   P2                  P3 - (1/3 of distance) along the threat heading.
//                       Forces the bezier tangent at t=1 to point in
//                       the threat heading → U10 arrives at tail-entry
//                       already aligned to chase.
//   P3 (end)            tail-entry position (60m behind threat at the
//                       moment tail-chase begins)
//
// Tangent matching at BOTH endpoints is the property a quadratic
// bezier can't give — it's why this curve transitions into the tail
// chase without a velocity discontinuity.
function launchControlPoints(tel: CUASTelemetry): { p0: LL; p1: LL; p2: LL; p3: LL } {
  const standby: LL = [INCHEON.u10_lat, INCHEON.u10_lon]
  const threatBearing = threatHeadingDeg(tel)
  const tailEntryT = LAUNCH_DURATION_MS - TAIL_CHASE_DURATION_MS
  const threatAtTailEntry = threatPositionAt(tel, LAUNCH_T0_MS + tailEntryT)
  const tailEntryPos = tailPositionFromTarget(threatAtTailEntry, threatBearing, TAIL_CHASE_OFFSET_M)

  // Distance standby → tail-entry sets the scale of control-point offsets
  const cosLat = Math.cos((standby[0] * Math.PI) / 180)
  const dy_m = (tailEntryPos[0] - standby[0]) * M_PER_DEG_LAT
  const dx_m = (tailEntryPos[1] - standby[1]) * M_PER_DEG_LAT * cosLat
  const dist = Math.sqrt(dy_m * dy_m + dx_m * dx_m)
  // 1/3 of the straight-line distance gives a balanced curve. Smaller
  // values tighten the turn; larger values widen it.
  const off = dist / 3

  // Initial heading: bearing from standby straight at the tail-entry.
  const initBearingRad = Math.atan2(dx_m, dy_m)
  const p1Lat = standby[0] + (Math.cos(initBearingRad) * off) / M_PER_DEG_LAT
  const p1Lon = standby[1] + (Math.sin(initBearingRad) * off) / (M_PER_DEG_LAT * cosLat)

  // Terminal control: 1/3 distance behind tail-entry along the
  // RECIPROCAL of threat heading, so P3 - P2 points in threat heading.
  const reciprocalRad = ((threatBearing + 180) * Math.PI) / 180
  const cosLatEnd = Math.cos((tailEntryPos[0] * Math.PI) / 180)
  const p2Lat = tailEntryPos[0] + (Math.cos(reciprocalRad) * off) / M_PER_DEG_LAT
  const p2Lon = tailEntryPos[1] + (Math.sin(reciprocalRad) * off) / (M_PER_DEG_LAT * cosLatEnd)

  return {
    p0: standby,
    p1: [p1Lat, p1Lon],
    p2: [p2Lat, p2Lon],
    p3: tailEntryPos,
  }
}

function angularDeltaSignedDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

/**
 * Turn-direction descriptor for the launch maneuver. Used by EO FWD
 * to bank the artificial horizon in the right direction.
 *   sign:      +1 for a right (CW) turn, -1 for a left (CCW) turn
 *   magnitude: 0..22° peak bank, scaled by total heading change
 */
export function launchTurnDescriptor(tel: CUASTelemetry): { sign: number; magnitudeDeg: number } {
  const standby: LL = [INCHEON.u10_lat, INCHEON.u10_lon]
  const threatBearing = threatHeadingDeg(tel)
  const tailEntryT = LAUNCH_DURATION_MS - TAIL_CHASE_DURATION_MS
  const threatAtTailEntry = threatPositionAt(tel, LAUNCH_T0_MS + tailEntryT)
  const tailEntryPos = tailPositionFromTarget(threatAtTailEntry, threatBearing, TAIL_CHASE_OFFSET_M)

  const initBearing = bearingDeg(standby[0], standby[1], tailEntryPos[0], tailEntryPos[1])
  const delta = angularDeltaSignedDeg(initBearing, threatBearing)
  const sign = delta >= 0 ? 1 : -1
  // Larger heading change → harder bank. Capped at 22° (mild
  // coordinated turn — keeps the artificial horizon readable).
  const magnitudeDeg = Math.min(22, Math.abs(delta) * 0.25)
  return { sign, magnitudeDeg }
}

/**
 * AB-U10's geographic position right now, given the scenario state.
 * Used by both MapPanel (Leaflet) and MultiCopterEO (the SVG cam).
 */
export function u10Position(tel: CUASTelemetry): LL {
  const phase = tel.kill_chain.phase
  const sol = tel.intercept_solution
  const standby: LL = [INCHEON.u10_lat, INCHEON.u10_lon]

  if (!sol || phase === 'standby' || phase === 'detect' || phase === 'confirm' || phase === 'approve') {
    return standby
  }

  const threatBearing = threatHeadingDeg(tel)
  const capture: LL = [sol.capture_lat_deg, sol.capture_lon_deg]
  // 6-o'clock behind the capture point — where U10 sits at engagement.
  const tailAtCapture = tailPositionFromTarget(capture, threatBearing, TAIL_CHASE_OFFSET_M)

  if (phase === 'launch') {
    const launchT = tel.scenario_clock_ms - LAUNCH_T0_MS
    const u = Math.min(1, Math.max(0, launchT / LAUNCH_DURATION_MS))
    // VTOL · stay over the pad while ducts rotate and the airframe climbs.
    if (u < LAUNCH_HOLD_AT_PAD) return standby

    const tailEntryT = LAUNCH_DURATION_MS - TAIL_CHASE_DURATION_MS

    if (launchT >= tailEntryT) {
      // ── TAIL CHASE ── follow threat live at 60m 6-o'clock for
      // the last TAIL_CHASE_DURATION_MS of LAUNCH. Both vehicles
      // run on parallel vectors — high-Pk geometry before the shot.
      const threatNow = threatPositionAt(tel, tel.scenario_clock_ms)
      return tailPositionFromTarget(threatNow, threatBearing, TAIL_CHASE_OFFSET_M)
    }

    // ── LEVEL TURN ── cubic bezier from standby pad to tail-entry,
    // with tangents matched at both endpoints (initial heading = aim
    // toward tail-entry, terminal heading = threat heading). Smooth
    // banked turn with no velocity discontinuity at tail-chase entry.
    const padHoldEnd = LAUNCH_HOLD_AT_PAD * LAUNCH_DURATION_MS
    const v = (launchT - padHoldEnd) / (tailEntryT - padHoldEnd)
    const cp = launchControlPoints(tel)
    return bezier3(cp.p0, cp.p1, cp.p2, cp.p3, v)
  }

  // capture: hold at the 6 o'clock behind the (now frozen) threat for
  //          the engagement window (CAPTURE_HOLD_MS), then start RTB.
  // report:  continue RTB from wherever we were when capture ended.
  const captureT = tel.scenario_clock_ms - CAPTURE_T0_MS
  if (captureT < CAPTURE_HOLD_MS) return tailAtCapture
  const u = Math.min(
    1,
    Math.max(0, (captureT - CAPTURE_HOLD_MS) / (RTB_DURATION_MS - CAPTURE_HOLD_MS)),
  )
  return [
    tailAtCapture[0] + (standby[0] - tailAtCapture[0]) * u,
    tailAtCapture[1] + (standby[1] - tailAtCapture[1]) * u,
  ]
}

/**
 * AB-U10 heading (bearing in degrees, 0 = north, 90 = east) — derived
 * from the bezier tangent during LAUNCH and from the RTB direction
 * during CAPTURE/REPORT. Used to orient the 3D model.
 */
export function u10HeadingDeg(tel: CUASTelemetry): number {
  const phase = tel.kill_chain.phase
  const sol = tel.intercept_solution
  const standby: LL = [INCHEON.u10_lat, INCHEON.u10_lon]

  if (!sol || phase === 'standby' || phase === 'detect' || phase === 'confirm' || phase === 'approve') {
    return 90 // sit facing east on the pad
  }

  const threatBearing = threatHeadingDeg(tel)
  const capture: LL = [sol.capture_lat_deg, sol.capture_lon_deg]
  const tailAtCapture = tailPositionFromTarget(capture, threatBearing, TAIL_CHASE_OFFSET_M)

  let dLat: number, dLon: number
  if (phase === 'launch') {
    const launchT = tel.scenario_clock_ms - LAUNCH_T0_MS
    const u = Math.min(1, Math.max(0, launchT / LAUNCH_DURATION_MS))
    const tailEntryT = LAUNCH_DURATION_MS - TAIL_CHASE_DURATION_MS

    if (launchT >= tailEntryT) {
      // Tail chase · nose pointed forward along threat's heading
      // (we're flying parallel to the threat, just behind it).
      return threatBearing
    }

    // Cubic-bezier tangent heading toward tail-entry endpoint
    const cp = launchControlPoints(tel)

    if (u < LAUNCH_HOLD_AT_PAD) {
      // VTOL · yaw smoothly on the pad from standby orientation
      // (90°, east) to the bezier's initial tangent direction. This
      // is the visual "rotating in place before liftoff" — operators
      // see the airframe yaw to face its egress vector before forward
      // flight begins, instead of snapping heading on phase change.
      const targetDLat = cp.p1[0] - cp.p0[0]
      const targetDLon = cp.p1[1] - cp.p0[1]
      const targetHeading =
        ((Math.atan2(targetDLon, targetDLat) * 180) / Math.PI + 360) % 360
      const STANDBY_HEADING = 90 // east — must match the standby return value above
      const yawProgress = u / LAUNCH_HOLD_AT_PAD // 0..1 across the pad-hold window
      return lerpAngleDeg(STANDBY_HEADING, targetHeading, smoothstep(yawProgress))
    } else {
      const padHoldEnd = LAUNCH_HOLD_AT_PAD * LAUNCH_DURATION_MS
      const v = (launchT - padHoldEnd) / (tailEntryT - padHoldEnd)
      const tangent = bezier3Tangent(cp.p0, cp.p1, cp.p2, cp.p3, v)
      dLat = tangent[0]
      dLon = tangent[1]
    }
  } else if (phase === 'capture') {
    const captureT = tel.scenario_clock_ms - CAPTURE_T0_MS
    if (captureT < CAPTURE_HOLD_MS) {
      // Engagement hold · face the threat from 6 o'clock
      // (heading from tail position toward capture point).
      dLat = capture[0] - tailAtCapture[0]
      dLon = capture[1] - tailAtCapture[1]
    } else {
      // RTB
      dLat = standby[0] - tailAtCapture[0]
      dLon = standby[1] - tailAtCapture[1]
    }
  } else {
    // report — continue RTB from tail-at-capture back to standby
    dLat = standby[0] - tailAtCapture[0]
    dLon = standby[1] - tailAtCapture[1]
  }
  const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI
  return (bearing + 360) % 360
}

/**
 * Polyline of points along the planned intercept path — cubic bezier
 * from standby to the 6-o'clock tail-entry point. Tangents match at
 * both endpoints (initial = aim at tail-entry, terminal = threat
 * heading) so the path renders as a smooth level turn instead of a
 * single-bend swing. Doesn't include the live tail-chase segment.
 */
export function launchPathBezier(tel: CUASTelemetry, steps = 32): LL[] {
  const cp = launchControlPoints(tel)
  const pts: LL[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push(bezier3(cp.p0, cp.p1, cp.p2, cp.p3, i / steps))
  }
  return pts
}

// ── 3D extensions (lat, lon, altitude_m_agl) ──────────────────
// Used by the Cesium variant. AB-U10 is a tilt-duct VTOL — the flight
// profile reflects that:
//   STANDBY/DETECT/CONFIRM/APPROVE  → 0m   (on the pad, ducts down)
//   LAUNCH (4 stages over 11s):
//     0–25%  · vertical takeoff 0 → 50m, ducts rotating fwd
//     25–55% · climb-out 50 → 85m, level acceleration begins
//     55–85% · level cruise at 85m, transit to swing point
//     85–100%· level turn into the threat's 6-o'clock (no altitude change)
//   CAPTURE                         → 85m (level engagement, MATCHES THREAT
//                                          ALT so 6-o'clock chase reads as
//                                          "same horizontal line, just behind")
//   REPORT                          → 85 → 0m, ease-in descent (RTB)
export type LLA = [number, number, number]
const STANDBY_ALT = 0
const CRUISE_ALT = 85
const VTOL_TOP = 50                      // alt at end of vertical climb stage

const LAUNCH_VTOL_END = 0.25            // u of launch progress
const LAUNCH_CLIMBOUT_END = 0.55
const LAUNCH_HOLD_AT_PAD = 0.20         // u of launch progress; horizontal stays at pad until here

function easeInOut(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
}
function easeIn(u: number): number {
  return u * u
}

export function u10Altitude(tel: CUASTelemetry): number {
  const phase = tel.kill_chain.phase
  if (phase === 'standby' || phase === 'detect' || phase === 'confirm' || phase === 'approve') {
    return STANDBY_ALT
  }
  if (phase === 'launch') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - LAUNCH_T0_MS) / LAUNCH_DURATION_MS))
    if (u < LAUNCH_VTOL_END) {
      // Stage 1 · vertical takeoff (ease-in-out so the climb feels weighty)
      const v = u / LAUNCH_VTOL_END
      return STANDBY_ALT + (VTOL_TOP - STANDBY_ALT) * easeInOut(v)
    }
    if (u < LAUNCH_CLIMBOUT_END) {
      // Stage 2 · climb-out to cruise altitude
      const v = (u - LAUNCH_VTOL_END) / (LAUNCH_CLIMBOUT_END - LAUNCH_VTOL_END)
      return VTOL_TOP + (CRUISE_ALT - VTOL_TOP) * easeInOut(v)
    }
    // Stage 3+4 · level cruise + level turn at engagement altitude
    return CRUISE_ALT
  }
  if (phase === 'capture') return CRUISE_ALT
  // REPORT — ease-in descent (stay high, then drop fast for the pad)
  if (phase === 'report') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - CAPTURE_T0_MS) / RTB_DURATION_MS))
    return CRUISE_ALT + (STANDBY_ALT - CRUISE_ALT) * easeIn(u)
  }
  return STANDBY_ALT
}

export function u10Position3D(tel: CUASTelemetry): LLA {
  const [lat, lon] = u10Position(tel)
  return [lat, lon, u10Altitude(tel)]
}

/**
 * 3D bezier path — same horizontal curve, plus altitude interpolation
 * (0m → 85m climb across the launch window).
 */
export function launchPathBezier3D(tel: CUASTelemetry, steps = 32): LLA[] {
  const ll = launchPathBezier(tel, steps)
  return ll.map(([lat, lon], i) => {
    const t = i / steps
    const alt = STANDBY_ALT + (CRUISE_ALT - STANDBY_ALT) * t
    return [lat, lon, alt] as LLA
  })
}
