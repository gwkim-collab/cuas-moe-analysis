// ────────────────────────────────────────────────────────────
// Analysis core · kill-probability model.
//
// Independent shots: with a single-shot kill probability p and n
// shot opportunities, the cumulative kill probability is
//   Pk = 1 − (1 − p)^n.
// ────────────────────────────────────────────────────────────

import type { EffectorSpec } from './model'
import { clamp } from './geometry'

/** Single-shot kill probability for the effector's current payload. */
export function singleShotPk(effector: EffectorSpec): number {
  const p =
    effector.payload === 'net_gun'
      ? effector.single_shot_pk_net
      : effector.single_shot_pk_shotgun
  return clamp(p, 0, 1)
}

/** Cumulative kill probability over n independent shot opportunities. */
export function cumulativePk(singleShot: number, shots: number): number {
  const p = clamp(singleShot, 0, 1)
  const n = Math.max(0, Math.floor(shots))
  return clamp(1 - Math.pow(1 - p, n), 0, 1)
}

/** Convenience: kill probability for the effector spec as configured. */
export function effectorKillProbability(effector: EffectorSpec): number {
  return cumulativePk(singleShotPk(effector), effector.shot_opportunities)
}
