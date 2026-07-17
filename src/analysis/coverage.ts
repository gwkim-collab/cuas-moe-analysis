// ────────────────────────────────────────────────────────────
// Analysis core · defended-coverage sweep.
//
// Rotates the threat approach bearing through a full 360° and runs
// the engagement MOE at each bearing. Produces:
//   • a per-bearing sample (P_negate, feasibility, intercept range)
//   • summary metrics (mean P_negate, defended fraction)
//   • a defended-footprint polygon (lat/lon), where the radius at
//     each bearing is the range at which the threat is neutralised
//     (intercept range if feasible, else the keep-out radius — the
//     bearing is effectively undefended and the threat leaks in).
//
// Framework-agnostic: geometry comes out as {lat,lon} so the Cesium
// layer can turn it into Cartesian3 without this module importing
// any rendering code.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'
import { computeMoe } from './moe'
import { pointAtRangeBearing, type LatLon } from './geometry'

export interface CoverageSample {
  bearing_deg: number
  p_negate: number
  feasible: boolean
  /** Range from asset where neutralisation occurs (m); 0 if never detected/feasible. */
  intercept_range_m: number
  /** Footprint radius used for the polygon at this bearing (m). */
  footprint_radius_m: number
  /** Footprint vertex on the map. */
  point: LatLon
}

export interface CoverageResult {
  samples: CoverageSample[]
  /** Mean P_negate across all swept bearings (0..1). */
  mean_p_negate: number
  /** Fraction of bearings whose P_negate ≥ threshold (0..1). */
  defended_fraction: number
  threshold: number
  // Ring radii (shared across bearings — depend only on sensor/effector/site).
  keep_out_radius_m: number
  nominal_detection_range_m: number
  max_engagement_range_m: number
  asset: LatLon
}

export interface CoverageOptions {
  /** Number of bearings to sample around the circle (default 72 = every 5°). */
  bearings?: number
  /** P_negate threshold that counts a bearing as "defended" (default 0.7). */
  threshold?: number
}

export function computeCoverage(base: Scenario, opts: CoverageOptions = {}): CoverageResult {
  const n = Math.max(8, Math.floor(opts.bearings ?? 72))
  const threshold = opts.threshold ?? 0.7
  const asset: LatLon = { lat: base.site.asset.lat, lon: base.site.asset.lon }
  const keepOut = base.site.keep_out_radius_m

  const samples: CoverageSample[] = []
  let sum = 0
  let defended = 0
  let nominalDetection = 0

  for (let i = 0; i < n; i++) {
    const bearing_deg = (i * 360) / n
    const scn: Scenario = {
      ...base,
      threat: { ...base.threat, approach_bearing_deg: bearing_deg },
    }
    const r = computeMoe(scn)
    nominalDetection = r.detection.nominal_range_m // constant across bearings

    const intercept_range_m = r.feasible ? r.reach.intercept_range_m : 0
    // Footprint radius: how far out threats are stopped. Undefended bearings
    // collapse to the keep-out ring (threat penetrates to the protected zone).
    const footprint_radius_m = r.feasible ? r.reach.intercept_range_m : keepOut

    samples.push({
      bearing_deg,
      p_negate: r.p_negate,
      feasible: r.feasible,
      intercept_range_m,
      footprint_radius_m,
      point: pointAtRangeBearing(asset, footprint_radius_m, bearing_deg),
    })

    sum += r.p_negate
    if (r.p_negate >= threshold) defended++
  }

  return {
    samples,
    mean_p_negate: sum / n,
    defended_fraction: defended / n,
    threshold,
    keep_out_radius_m: keepOut,
    nominal_detection_range_m: nominalDetection,
    max_engagement_range_m: base.effector.max_engagement_range_m,
    asset,
  }
}
