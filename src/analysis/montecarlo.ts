// ────────────────────────────────────────────────────────────
// Analysis core · Monte Carlo runner.
//
// The analytical MOE (moe.ts) is a deterministic point estimate.
// Monte Carlo turns the inputs into distributions and the kill-chain
// gates into Bernoulli outcomes, so we get:
//   • an outcome-based negation probability + 95% confidence interval
//   • the spread of the per-trial analytic P_negate (a histogram)
//   • which gate is responsible when the threat leaks through
//
// Deterministic given a seed (mulberry32 RNG) so runs are reproducible
// — important since the rest of the app uses Math.random() freely.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'
import { computeMoe } from './moe'
import { clamp } from './geometry'

// ── Seedable RNG (mulberry32) ─────────────────────────────────
export interface Rng {
  next: () => number // uniform [0,1)
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return {
    next() {
      a |= 0
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

/** Standard-normal sample via Box-Muller. */
function normal(rng: Rng): number {
  let u = 0
  let v = 0
  while (u === 0) u = rng.next()
  while (v === 0) v = rng.next()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// ── Input uncertainty ─────────────────────────────────────────
export interface McUncertainty {
  /** Coefficient of variation on threat speed (multiplicative normal). */
  speed_cv: number
  /** Log-normal sigma on RCS (multiplicative). */
  rcs_sigma: number
  /** Std-dev (s) added to classify time. */
  classify_time_sd_s: number
  /** Std-dev (s) added to operator decision latency. */
  decision_latency_sd_s: number
  /** Std-dev (s) added to launch delay. */
  launch_delay_sd_s: number
  /** Std-dev (deg) added to the interceptor pointing error (acquisition jitter). */
  pointing_error_sd_deg: number
  /** Coefficient of variation on atmospheric visibility (multiplicative). */
  visibility_cv: number
  /** Std-dev (m) added to threat altitude (→ slant range). */
  altitude_sd_m: number
  /** Coefficient of variation on the target characteristic size (which airframe). */
  size_cv: number
  /** Std-dev (deg) added to the radar cue error. */
  cue_error_sd_deg: number
  /** Coefficient of variation on interceptor cruise speed. */
  cruise_speed_cv: number
  /** Std-dev (count) on shot opportunities (engagement-window jitter, rounded). */
  shot_opportunities_sd: number
  /** Randomise the approach bearing uniformly over 0..360°. */
  bearing_uniform: boolean
}

export const DEFAULT_UNCERTAINTY: McUncertainty = {
  speed_cv: 0.15,
  rcs_sigma: 0.4,
  classify_time_sd_s: 2,
  decision_latency_sd_s: 4,
  launch_delay_sd_s: 1,
  pointing_error_sd_deg: 0.15,
  visibility_cv: 0.25,
  altitude_sd_m: 40, // 위협 고도 변동 → 경사거리 — SME-VERIFY
  size_cv: 0.2, // 기종 다양성(임계치수) — SME-VERIFY
  cue_error_sd_deg: 0.1, // 레이더 큐 지터 — SME-VERIFY
  cruise_speed_cv: 0.05, // 요격기 속도 변동(비교적 일정) — SME-VERIFY
  shot_opportunities_sd: 0.7, // 교전창 사격 기회 변동 — SME-VERIFY
  bearing_uniform: true,
}

export interface McOptions {
  trials: number
  seed: number
  uncertainty?: Partial<McUncertainty>
}

export type GateName = 'detect' | 'classify' | 'decision' | 'reach' | 'kill'
const GATE_ORDER: GateName[] = ['detect', 'classify', 'decision', 'reach', 'kill']

export interface HistBin {
  lo: number
  hi: number
  count: number
}

export interface McResult {
  trials: number
  seed: number
  /** Mean of the per-trial analytic P_negate (0..1). */
  p_negate_mean: number
  /** Outcome-based negation probability (fraction of trials negated). */
  negated_fraction: number
  /** 95% CI for negated_fraction (normal approximation). */
  ci95: [number, number]
  /** Leakage fraction = 1 − negated_fraction. */
  leakage_fraction: number
  /** Histogram of per-trial analytic P_negate over [0,1]. */
  histogram: HistBin[]
  /** Among leaked trials, count of which gate failed first. */
  gate_failure_counts: Record<GateName, number>
}

function sampleScenario(base: Scenario, u: McUncertainty, rng: Rng): Scenario {
  const speed = Math.max(1, base.threat.speed_m_s * (1 + u.speed_cv * normal(rng)))
  const rcs = Math.max(1e-6, base.threat.rcs_m2 * Math.exp(u.rcs_sigma * normal(rng)))
  const bearing = u.bearing_uniform
    ? rng.next() * 360
    : base.threat.approach_bearing_deg

  const pointing = Math.max(0, base.optics.pointing_error_deg + u.pointing_error_sd_deg * normal(rng))
  const visibility = Math.max(0.05, base.optics.visibility_km * (1 + u.visibility_cv * normal(rng)))
  const altitude = Math.max(0, base.threat.altitude_m_agl + u.altitude_sd_m * normal(rng))
  const size = Math.max(0.01, base.threat.characteristic_size_m * (1 + u.size_cv * normal(rng)))
  const cue = Math.max(0, base.optics.cue_error_deg + u.cue_error_sd_deg * normal(rng))
  const cruise = Math.max(1, base.effector.cruise_speed_m_s * (1 + u.cruise_speed_cv * normal(rng)))
  // Floor at 1, not 0: this branch only runs for trials that reached the kill
  // gate, i.e. the interceptor arrived. "Arrived and fired zero times" is not a
  // physical outcome — a 0 here silently forced P_kill = 0 on ~1.6% of trials
  // at the default (mean 2, sd 0.7), inflating kill-gate failures.
  const shots = Math.max(1, Math.round(base.effector.shot_opportunities + u.shot_opportunities_sd * normal(rng)))

  return {
    ...base,
    threat: {
      ...base.threat,
      speed_m_s: speed,
      rcs_m2: rcs,
      approach_bearing_deg: bearing,
      altitude_m_agl: altitude,
      characteristic_size_m: size,
    },
    optics: {
      ...base.optics,
      pointing_error_deg: pointing,
      visibility_km: visibility,
      cue_error_deg: cue,
    },
    sensor: {
      ...base.sensor,
      classify_time_s: Math.max(0, base.sensor.classify_time_s + u.classify_time_sd_s * normal(rng)),
    },
    c2: {
      ...base.c2,
      decision_latency_s: Math.max(0, base.c2.decision_latency_s + u.decision_latency_sd_s * normal(rng)),
    },
    effector: {
      ...base.effector,
      launch_delay_s: Math.max(0, base.effector.launch_delay_s + u.launch_delay_sd_s * normal(rng)),
      cruise_speed_m_s: cruise,
      shot_opportunities: shots,
    },
  }
}

export function runMonteCarlo(base: Scenario, opts: McOptions): McResult {
  const trials = Math.max(1, Math.floor(opts.trials))
  const u: McUncertainty = { ...DEFAULT_UNCERTAINTY, ...opts.uncertainty }
  const rng = mulberry32(opts.seed)

  const NBINS = 20
  const histogram: HistBin[] = Array.from({ length: NBINS }, (_, i) => ({
    lo: i / NBINS,
    hi: (i + 1) / NBINS,
    count: 0,
  }))
  const gate_failure_counts: Record<GateName, number> = {
    detect: 0,
    classify: 0,
    decision: 0,
    reach: 0,
    kill: 0,
  }

  let pSum = 0
  let negated = 0

  for (let i = 0; i < trials; i++) {
    const scn = sampleScenario(base, u, rng)
    const r = computeMoe(scn)
    pSum += r.p_negate

    // Histogram of the analytic P_negate.
    const bin = Math.min(NBINS - 1, Math.floor(r.p_negate * NBINS))
    histogram[bin].count++

    // Bernoulli outcome per gate, in kill-chain order; record first failure.
    const probs: Record<GateName, number> = {
      detect: r.breakdown.p_detect,
      classify: r.breakdown.p_classify,
      decision: r.breakdown.p_decision,
      reach: r.breakdown.p_reach,
      kill: r.breakdown.p_kill,
    }
    let survived = true
    let firstFail: GateName | null = null
    for (const g of GATE_ORDER) {
      const pass = rng.next() < probs[g]
      if (!pass) {
        firstFail = g
        survived = false
        break
      }
    }
    if (survived) negated++
    else if (firstFail) gate_failure_counts[firstFail]++
  }

  const negated_fraction = negated / trials
  const se = Math.sqrt((negated_fraction * (1 - negated_fraction)) / trials)
  const half = 1.96 * se
  const ci95: [number, number] = [
    clamp(negated_fraction - half, 0, 1),
    clamp(negated_fraction + half, 0, 1),
  ]

  return {
    trials,
    seed: opts.seed,
    p_negate_mean: pSum / trials,
    negated_fraction,
    ci95,
    leakage_fraction: 1 - negated_fraction,
    histogram,
    gate_failure_counts,
  }
}
