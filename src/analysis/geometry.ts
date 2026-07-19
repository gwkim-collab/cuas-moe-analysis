// ────────────────────────────────────────────────────────────
// Analysis core · geometry helpers (framework-agnostic, pure).
//
// Self-contained on purpose: the operational demo (scenario.ts /
// mockData.ts) keeps its own copies of haversine/bearing so this
// analysis core can be developed and tested in isolation without
// touching — and risking a regression in — the cinematic scene.
// Deduplication into a single shared module is a later cleanup.
// ────────────────────────────────────────────────────────────

export const EARTH_RADIUS_M = 6_371_000
export const M_PER_DEG_LAT = 111_320

export interface LatLon {
  lat: number
  lon: number
}

/** Great-circle distance between two WGS-84 points, in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const p1 = toRad(a.lat)
  const p2 = toRad(b.lat)
  const dp = toRad(b.lat - a.lat)
  const dl = toRad(b.lon - a.lon)
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

/** Initial bearing from `a` to `b`, degrees clockwise from north (0..360). */
export function bearing(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const toDeg = (r: number) => (r * 180) / Math.PI
  const dl = toRad(b.lon - a.lon)
  const y = Math.sin(dl) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dl)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Offset a local metre delta (east, north) into a degree delta at `latRef`. */
export function metersToDeg(
  latRef: number,
  east_m: number,
  north_m: number,
): { dLat: number; dLon: number } {
  const dLat = north_m / M_PER_DEG_LAT
  const dLon = east_m / (M_PER_DEG_LAT * Math.cos((latRef * Math.PI) / 180))
  return { dLat, dLon }
}

/**
 * Project a point at `range_m` from `origin` along a compass `bearing_deg`.
 * Used to place a threat ingress origin / intercept point on the map from
 * the scalar radial model.
 */
export function pointAtRangeBearing(
  origin: LatLon,
  range_m: number,
  bearing_deg: number,
): LatLon {
  const br = (bearing_deg * Math.PI) / 180
  const east_m = Math.sin(br) * range_m
  const north_m = Math.cos(br) * range_m
  const { dLat, dLon } = metersToDeg(origin.lat, east_m, north_m)
  return { lat: origin.lat + dLat, lon: origin.lon + dLon }
}

/** Smallest absolute angular difference between two bearings, degrees (0..180). */
export function angularDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

/** Clamp helper. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

/**
 * Line-of-sight (slant) range from a ground sensor to a target at horizontal
 * range `horizontal_m` and altitude `altitude_m`: √(h² + alt²). This is what
 * the radar / EO actually sees, so detection and recognition use it — a target
 * at the same ground range but higher altitude is farther in LOS, hence harder.
 */
export function slantRange(horizontal_m: number, altitude_m: number): number {
  return Math.hypot(horizontal_m, altitude_m)
}
