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

  if (phase === 'launch') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - LAUNCH_T0_MS) / LAUNCH_DURATION_MS))
    return bezier2(standby, swingPoint(capture), capture, u)
  }

  // capture/report — straight RTB
  const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - CAPTURE_T0_MS) / RTB_DURATION_MS))
  return [
    capture[0] + (standby[0] - capture[0]) * u,
    capture[1] + (standby[1] - capture[1]) * u,
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
  const swing = swingPoint(capture)

  let dLat: number, dLon: number
  if (phase === 'launch') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - LAUNCH_T0_MS) / LAUNCH_DURATION_MS))
    // bezier'(t) = 2(1-t)(P1-P0) + 2t(P2-P1)
    const a = 2 * (1 - u)
    const b = 2 * u
    dLat = a * (swing[0] - standby[0]) + b * (capture[0] - swing[0])
    dLon = a * (swing[1] - standby[1]) + b * (capture[1] - swing[1])
  } else {
    // capture / report — heading back to base (RTB)
    dLat = standby[0] - capture[0]
    dLon = standby[1] - capture[1]
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
  const pts: LL[] = []
  for (let i = 0; i <= steps; i++) {
    pts.push(bezier2(standby, swing, capture, i / steps))
  }
  return pts
}

// ── 3D extensions (lat, lon, altitude_m_agl) ──────────────────
// Used by the Cesium variant. Altitude profile:
//   STANDBY/DETECT/CONFIRM/APPROVE  → 12m (pad height)
//   LAUNCH                          → 12 → 95m climb (vertical takeoff)
//   CAPTURE                         → 95m (level)
//   REPORT                          → 95 → 12m descent (RTB approach)
export type LLA = [number, number, number]
const STANDBY_ALT = 12
const CAPTURE_ALT = 95

export function u10Altitude(tel: CUASTelemetry): number {
  const phase = tel.kill_chain.phase
  if (phase === 'standby' || phase === 'detect' || phase === 'confirm' || phase === 'approve') {
    return STANDBY_ALT
  }
  if (phase === 'launch') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - LAUNCH_T0_MS) / LAUNCH_DURATION_MS))
    return STANDBY_ALT + (CAPTURE_ALT - STANDBY_ALT) * u
  }
  if (phase === 'capture') return CAPTURE_ALT
  // REPORT — descend back to pad over the RTB window
  if (phase === 'report') {
    const u = Math.min(1, Math.max(0, (tel.scenario_clock_ms - CAPTURE_T0_MS) / RTB_DURATION_MS))
    return CAPTURE_ALT + (STANDBY_ALT - CAPTURE_ALT) * u
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
