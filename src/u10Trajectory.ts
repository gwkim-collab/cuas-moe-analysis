// ────────────────────────────────────────────────────────────
// AB-U10 trajectory model.
//
// Pulls the geographic AB-U10 position out of MapPanel/MultiCopterEO so
// they share one source of truth.
//
// Physics it simulates (visually, not really):
//  - LAUNCH (T+24..35s): quadratic-Bezier curve from the standby pad,
//    arcing NW past the capture point. The arc sets up a 6-o'clock
//    (rear) approach on the hostile FPV: threat course is ~130° (SE),
//    so its 6-o'clock vector is 310° (NW). The Bezier control point
//    sits NW of the capture point so AB-U10 swings past the threat
//    track, then runs it down from behind.
//  - CAPTURE..REPORT (T+35..50s): straight RTB back to the standby pad.
// ────────────────────────────────────────────────────────────

import type { CUASTelemetry } from './types'
import { INCHEON } from './mockData'

export type LL = [number, number]

const LAUNCH_T0_MS = 24_000
const CAPTURE_T0_MS = 35_000
const RTB_DURATION_MS = 15_000  // capture (7s) + report (8s)
const LAUNCH_DURATION_MS = CAPTURE_T0_MS - LAUNCH_T0_MS

// Swing point relative to the capture point — drives the curvature.
// 0.0032° lat ≈ 360m N · 0.0038° lon ≈ 340m W → bearing ~310° (NW).
const SWING_OFFSET_LAT = 0.0032
const SWING_OFFSET_LON = -0.0038

function swingPoint(capture: LL): LL {
  return [capture[0] + SWING_OFFSET_LAT, capture[1] + SWING_OFFSET_LON]
}

// 6 o'clock approach offset — AB-U10 ends launch ~50m NW (drone's 6 o'clock,
// since threat course is ~130° SE so its 6 vector is ~310° NW). This way
// AB-U10 sits behind the drone at engagement instead of co-located with it,
// so the main-map view reads as "tail chase + shot" rather than "stack on top."
// 0.00045° lat ≈ 50m N · 0.00045° lon ≈ 40m W → bearing ~322° (close enough to 310°).
const APPROACH_OFFSET_LAT = 0.00045
const APPROACH_OFFSET_LON = -0.00045

function approachPoint(capture: LL): LL {
  return [capture[0] + APPROACH_OFFSET_LAT, capture[1] + APPROACH_OFFSET_LON]
}

// During CAPTURE phase, AB-U10 holds at the 6-o'clock approach point for a
// short engagement window (firing the payload, neutralization moment) before
// starting RTB. This is what makes the kill visible in the main-map view.
const CAPTURE_HOLD_MS = 2_000

function bezier2(p0: LL, p1: LL, p2: LL, t: number): LL {
  const a = (1 - t) * (1 - t)
  const b = 2 * (1 - t) * t
  const c = t * t
  return [
    a * p0[0] + b * p1[0] + c * p2[0],
    a * p0[1] + b * p1[1] + c * p2[1],
  ]
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

  const capture: LL = [sol.capture_lat_deg, sol.capture_lon_deg]
  const approach = approachPoint(capture)

  if (phase === 'launch') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - LAUNCH_T0_MS) / LAUNCH_DURATION_MS))
    // VTOL phase · stay over the pad while ducts rotate and the airframe climbs.
    // Only after the climb is committed does horizontal motion begin.
    if (u < LAUNCH_HOLD_AT_PAD) return standby
    // Remap remaining progress to the bezier (standby → swing → approach).
    // Endpoint is the 6-o'clock approach point, NOT the capture (drone's)
    // point — at launch end AB-U10 sits ~50m behind the threat, looking
    // down its tail.
    const v = (u - LAUNCH_HOLD_AT_PAD) / (1 - LAUNCH_HOLD_AT_PAD)
    return bezier2(standby, swingPoint(capture), approach, v)
  }

  // capture: hold at the 6 o'clock for the engagement window (CAPTURE_HOLD_MS),
  //          then start RTB toward the standby pad.
  // report:  continue RTB from wherever we were when capture ended.
  const captureT = tel.scenario_clock_ms - CAPTURE_T0_MS
  if (captureT < CAPTURE_HOLD_MS) return approach
  const u = Math.min(
    1,
    Math.max(0, (captureT - CAPTURE_HOLD_MS) / (RTB_DURATION_MS - CAPTURE_HOLD_MS)),
  )
  return [
    approach[0] + (standby[0] - approach[0]) * u,
    approach[1] + (standby[1] - approach[1]) * u,
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
  const capture: LL = [sol.capture_lat_deg, sol.capture_lon_deg]
  const approach = approachPoint(capture)
  const swing = swingPoint(capture)

  let dLat: number, dLon: number
  if (phase === 'launch') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - LAUNCH_T0_MS) / LAUNCH_DURATION_MS))
    if (u < LAUNCH_HOLD_AT_PAD) {
      // VTOL · point the nose toward the swing bearing so the airframe
      // is already oriented for forward flight when the ducts rotate.
      dLat = swing[0] - standby[0]
      dLon = swing[1] - standby[1]
    } else {
      // bezier'(v) tangent on the remapped progress
      const v = (u - LAUNCH_HOLD_AT_PAD) / (1 - LAUNCH_HOLD_AT_PAD)
      const a = 2 * (1 - v)
      const b = 2 * v
      dLat = a * (swing[0] - standby[0]) + b * (approach[0] - swing[0])
      dLon = a * (swing[1] - standby[1]) + b * (approach[1] - swing[1])
    }
  } else if (phase === 'capture') {
    const captureT = tel.scenario_clock_ms - CAPTURE_T0_MS
    if (captureT < CAPTURE_HOLD_MS) {
      // engagement hold — face the threat (drone is at capture point,
      // we're at approach 6-o'clock, so heading is approach → capture, ~SE).
      dLat = capture[0] - approach[0]
      dLon = capture[1] - approach[1]
    } else {
      dLat = standby[0] - approach[0]
      dLon = standby[1] - approach[1]
    }
  } else {
    // report — continue RTB from approach point back to standby
    dLat = standby[0] - approach[0]
    dLon = standby[1] - approach[1]
  }
  const bearing = (Math.atan2(dLon, dLat) * 180) / Math.PI
  return (bearing + 360) % 360
}

/**
 * Polyline of points along the launch Bezier curve — for rendering the
 * full intercept path on the map (vs three-point straight segments).
 */
export function launchPathBezier(capture: LL, steps = 32): LL[] {
  const standby: LL = [INCHEON.u10_lat, INCHEON.u10_lon]
  const swing = swingPoint(capture)
  const approach = approachPoint(capture)
  const pts: LL[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push(bezier2(standby, swing, approach, i / steps))
  }
  return pts
}

// ── 3D extensions (lat, lon, altitude_m_agl) ──────────────────
// Used by the Cesium variant. AB-U10 is a tilt-duct VTOL — the flight
// profile reflects that:
//   STANDBY/DETECT/CONFIRM/APPROVE  → 12m  (pad height, ducts down)
//   LAUNCH (4 stages over 11s):
//     0–25%  · vertical takeoff 12 → 60m, ducts rotating fwd
//     25–55% · climb-out 60 → 95m, level acceleration begins
//     55–85% · level cruise at 95m, transit to swing point
//     85–100%· level turn into the threat's 6-o'clock (no altitude change)
//   CAPTURE                         → 95m (level engagement window)
//   REPORT                          → 95 → 12m, ease-in descent (RTB)
export type LLA = [number, number, number]
const STANDBY_ALT = 12
const CRUISE_ALT = 95
const VTOL_TOP = 60                      // alt at end of vertical climb stage

const LAUNCH_VTOL_END = 0.25            // u of launch progress
const LAUNCH_CLIMBOUT_END = 0.55
const LAUNCH_CRUISE_END = 0.85          // (level turn after this)
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
 * (12m → 95m climb across the launch window).
 */
export function launchPathBezier3D(capture: LL, steps = 32): LLA[] {
  const ll = launchPathBezier(capture, steps)
  return ll.map(([lat, lon], i) => {
    const t = i / steps
    const alt = STANDBY_ALT + (CAPTURE_ALT - STANDBY_ALT) * t
    return [lat, lon, alt] as LLA
  })
}
