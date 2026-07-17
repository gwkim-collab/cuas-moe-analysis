// ────────────────────────────────────────────────────────────
// Analysis core · trade study + sensitivity + spec inversion.
//
//  • sweep1D / sweep2D — how the metric moves as one/two parameters
//    vary across a range (line / heatmap).
//  • tornado — one-at-a-time sensitivity: which parameter moves the
//    metric most when nudged ±.
//  • solveForTarget — spec inversion: what parameter value is needed
//    to reach a target metric (e.g. min sensor range for P_negate≥0.9).
//
// The metric defaults to the engagement P_negate (computeMoe), but any
// scalar Scenario→number function can be passed in.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'
import { computeMoe } from './moe'
import { clamp } from './geometry'
import { PARAM_INFO } from './params'

export type Metric = (s: Scenario) => number

/** Default metric: probability of negating the threat. */
export const pNegateMetric: Metric = (s) => computeMoe(s).p_negate

// ── Tunable parameter registry ────────────────────────────────
// Each parameter is addressed by a get/set pair so callers never touch
// stringly-typed nested paths. `min`/`max` are sensible sweep bounds.
export interface ParamDef {
  key: string
  label: string
  unit?: string
  min: number
  max: number
  get: (s: Scenario) => number
  set: (s: Scenario, v: number) => Scenario
}

// The sweepable parameters, derived from the documentation registry
// (PARAM_INFO). Any entry with a `sweep` range is tunable in the
// trade-study / spec-inversion tools.
export const PARAMS: ParamDef[] = PARAM_INFO.filter((p) => p.sweep).map((p) => ({
  key: p.key,
  label: p.label,
  unit: p.unit,
  min: p.sweep!.min,
  max: p.sweep!.max,
  get: p.get,
  set: p.set,
}))

export function getParam(key: string): ParamDef | undefined {
  return PARAMS.find((p) => p.key === key)
}

// ── 1-D sweep ─────────────────────────────────────────────────
export interface SweepPoint {
  x: number
  y: number
}

export function sweep1D(
  base: Scenario,
  param: ParamDef,
  opts: { min?: number; max?: number; steps?: number } = {},
  metric: Metric = pNegateMetric,
): SweepPoint[] {
  const min = opts.min ?? param.min
  const max = opts.max ?? param.max
  const steps = Math.max(2, Math.floor(opts.steps ?? 40))
  const out: SweepPoint[] = []
  for (let i = 0; i < steps; i++) {
    const x = min + ((max - min) * i) / (steps - 1)
    out.push({ x, y: metric(param.set(base, x)) })
  }
  return out
}

// ── 2-D sweep (heatmap grid) ──────────────────────────────────
export interface Sweep2DResult {
  xs: number[]
  ys: number[]
  /** z[yi][xi] = metric. Row-major by y then x. */
  z: number[][]
  zmin: number
  zmax: number
}

export function sweep2D(
  base: Scenario,
  xParam: ParamDef,
  yParam: ParamDef,
  opts: { xSteps?: number; ySteps?: number } = {},
  metric: Metric = pNegateMetric,
): Sweep2DResult {
  const xSteps = Math.max(2, Math.floor(opts.xSteps ?? 24))
  const ySteps = Math.max(2, Math.floor(opts.ySteps ?? 24))
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i < xSteps; i++) xs.push(xParam.min + ((xParam.max - xParam.min) * i) / (xSteps - 1))
  for (let j = 0; j < ySteps; j++) ys.push(yParam.min + ((yParam.max - yParam.min) * j) / (ySteps - 1))

  let zmin = Infinity
  let zmax = -Infinity
  const z: number[][] = ys.map((yv) =>
    xs.map((xv) => {
      const scn = yParam.set(xParam.set(base, xv), yv)
      const m = metric(scn)
      if (m < zmin) zmin = m
      if (m > zmax) zmax = m
      return m
    }),
  )
  return { xs, ys, z, zmin, zmax }
}

// ── Tornado sensitivity (one-at-a-time) ───────────────────────
export interface SensitivityRow {
  key: string
  label: string
  base_value: number
  low_value: number
  high_value: number
  low_metric: number
  high_metric: number
  base_metric: number
  /** Signed swing = high_metric − low_metric. */
  impact: number
}

/**
 * Perturb each parameter by ±`fraction` of its current value (clamped to
 * its range) and measure the metric swing. Sorted by |impact| desc.
 */
export function tornado(
  base: Scenario,
  fraction = 0.2,
  params: ParamDef[] = PARAMS,
  metric: Metric = pNegateMetric,
): SensitivityRow[] {
  const base_metric = metric(base)
  const rows = params.map((p) => {
    const v = p.get(base)
    const lowV = clamp(v * (1 - fraction), p.min, p.max)
    const highV = clamp(v * (1 + fraction), p.min, p.max)
    const low_metric = metric(p.set(base, lowV))
    const high_metric = metric(p.set(base, highV))
    return {
      key: p.key,
      label: p.label,
      base_value: v,
      low_value: lowV,
      high_value: highV,
      low_metric,
      high_metric,
      base_metric,
      impact: high_metric - low_metric,
    }
  })
  return rows.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))
}

// ── Spec inversion (solve for target) ─────────────────────────
export interface InversionResult {
  key: string
  label: string
  unit?: string
  target: number
  base_value: number
  base_metric: number
  /** True if some value in range meets the target. */
  found: boolean
  /** Boundary value where metric crosses the target (interpolated). */
  threshold_value: number | null
  /** Which side of the threshold satisfies the target. */
  satisfy_side: 'gte' | 'lte' | 'none'
  direction: 'increasing' | 'decreasing' | 'flat'
  curve: SweepPoint[]
}

/**
 * Spec inversion: scan the parameter across its range and find the value
 * at which `metric` crosses `target`. Handles monotone-increasing and
 * monotone-decreasing relationships (detected from the endpoints) and
 * reports which side of the boundary satisfies the target.
 */
export function solveForTarget(
  base: Scenario,
  param: ParamDef,
  target: number,
  opts: { min?: number; max?: number; steps?: number } = {},
  metric: Metric = pNegateMetric,
): InversionResult {
  const steps = Math.max(3, Math.floor(opts.steps ?? 101))
  const curve = sweep1D(base, param, { min: opts.min, max: opts.max, steps }, metric)

  const base_value = param.get(base)
  const base_metric = metric(base)

  const first = curve[0].y
  const last = curve[curve.length - 1].y
  const direction: InversionResult['direction'] =
    Math.abs(last - first) < 1e-9 ? 'flat' : last > first ? 'increasing' : 'decreasing'

  const anyMeets = curve.some((p) => p.y >= target)
  const satisfy_side: InversionResult['satisfy_side'] =
    !anyMeets ? 'none' : direction === 'decreasing' ? 'lte' : 'gte'

  // Find first sign change of (metric − target) → linear-interpolate the crossing.
  let threshold_value: number | null = null
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1].y - target
    const b = curve[i].y - target
    if (a === 0) {
      threshold_value = curve[i - 1].x
      break
    }
    if (a < 0 !== b < 0) {
      const t = a / (a - b)
      threshold_value = curve[i - 1].x + t * (curve[i].x - curve[i - 1].x)
      break
    }
  }

  return {
    key: param.key,
    label: param.label,
    unit: param.unit,
    target,
    base_value,
    base_metric,
    found: anyMeets,
    threshold_value,
    satisfy_side,
    direction,
    curve,
  }
}
