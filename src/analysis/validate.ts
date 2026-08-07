// ────────────────────────────────────────────────────────────
// Analysis core · scenario input validation.
//
// The model clamps aggressively (clamp(x, 0, 1) on every gate), which
// keeps it from producing NaN — but that also means a nonsense input
// like "분류기 상한 = 1.4" or "지향 오차 = −0.3°" is silently absorbed
// and the result looks plausible while resting on a value that cannot
// exist. Validation surfaces those before they reach the maths.
//
// Two kinds of check:
//   • RANGE  — per-parameter hard bounds from params.ts `range`.
//   • CROSS  — relations BETWEEN parameters that no single bound can
//              express (pd_at_ref < pd_max, keep-out < commit range, …).
//
// Severity:
//   • 'error' — physically impossible / the result would be meaningless.
//   • 'warn'  — legal but self-defeating; the model runs and the number
//               is real, but the scenario probably isn't what was meant.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'
import { PARAM_INFO } from './params'
import { computeDetection } from './detection'

export type IssueSeverity = 'error' | 'warn'

export interface ValidationIssue {
  /** Parameter key this attaches to (for field highlighting); '' for cross-checks with no single owner. */
  key: string
  /** Human label of the offending parameter. */
  label: string
  severity: IssueSeverity
  /** What is wrong, in one line. */
  message: string
  /** The offending value, when there is a single one. */
  value?: number
  /** A value that would satisfy the constraint (used by "자동 수정"). */
  suggestion?: number
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.001)) return v.toExponential(2)
  return String(Math.round(v * 1e6) / 1e6)
}

/** Range/type checks driven by the parameter registry. */
export function validateRanges(s: Scenario): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  for (const p of PARAM_INFO) {
    const v = p.get(s)
    const unit = p.unit ? ` ${p.unit}` : ''

    if (!Number.isFinite(v)) {
      issues.push({
        key: p.key,
        label: p.label,
        severity: 'error',
        message: `숫자가 아닙니다 (${v}). 유효 범위 ${fmt(p.range.min)}~${fmt(p.range.max)}${unit}.`,
        value: v,
        suggestion: p.range.min,
      })
      continue
    }
    if (v < p.range.min || v > p.range.max) {
      const suggestion = Math.min(p.range.max, Math.max(p.range.min, v))
      const isProb = p.range.min === 0 && p.range.max === 1
      issues.push({
        key: p.key,
        label: p.label,
        severity: 'error',
        message: isProb
          ? `확률은 0~1 이어야 합니다. 현재 ${fmt(v)}${v > 1 ? ' — 퍼센트(%)를 그대로 넣지 않았는지 확인하세요.' : ''}`
          : `유효 범위 ${fmt(p.range.min)}~${fmt(p.range.max)}${unit}를 벗어났습니다. 현재 ${fmt(v)}${unit}.`,
        value: v,
        suggestion,
      })
      continue
    }
    if (p.integer && !Number.isInteger(v)) {
      issues.push({
        key: p.key,
        label: p.label,
        severity: 'error',
        message: `정수여야 합니다. 현재 ${fmt(v)}.`,
        value: v,
        suggestion: Math.max(p.range.min, Math.round(v)),
      })
    }
  }
  return issues
}

/** Relations between parameters that a single bound cannot express. */
export function validateCross(s: Scenario): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const tReact = s.c2.decision_latency_s + s.effector.launch_delay_s
  const required = s.effector.commit_range_m + s.threat.speed_m_s * tReact

  // The quoted Pd must be reachable under the curve ceiling, or the inversion
  // clamps and silently produces a far longer detection envelope than intended.
  if (s.sensor.pd_at_ref >= s.sensor.pd_max) {
    issues.push({
      key: 'sensor.pd_at_ref',
      label: '기준거리 단일스캔 Pd',
      severity: 'error',
      message:
        `기준거리 단일스캔 Pd(${fmt(s.sensor.pd_at_ref)})가 최대 Pd(${fmt(s.sensor.pd_max)}) 이상입니다 — ` +
        `곡선 천장보다 높은 확률은 어떤 거리에서도 나올 수 없어, 역산이 클램프되어 실제보다 훨씬 좋은 레이더가 됩니다.`,
      value: s.sensor.pd_at_ref,
      suggestion: Math.max(0, s.sensor.pd_max - 0.05),
    })
  }

  // The analysis window has to start outside the detection requirement, or the
  // track begins already inside the radar's reach and no margin can be shown.
  if (s.threat.ingress_range_m < required) {
    issues.push({
      key: 'threat.ingress_range_m',
      label: '진입 거리',
      severity: 'warn',
      message:
        `진입 거리(${fmt(s.threat.ingress_range_m)} m)가 필요 탐지거리(${fmt(required)} m)보다 짧습니다 — ` +
        `트랙이 이미 안쪽에서 시작해 항상 "탐지 제약"으로 판정됩니다. 레이더가 아니라 분석 창이 제약일 수 있습니다.`,
      value: s.threat.ingress_range_m,
      suggestion: Math.ceil((required * 1.3) / 100) * 100,
    })
  }

  // Launching inside the keep-out ring can never satisfy the ROE.
  if (s.effector.commit_range_m <= s.site.keep_out_radius_m) {
    issues.push({
      key: 'effector.commit_range_m',
      label: '발사 개시 거리',
      severity: 'error',
      message:
        `발사 개시 거리(${fmt(s.effector.commit_range_m)} m)가 keep-out 반경(${fmt(s.site.keep_out_radius_m)} m) 이내입니다 — ` +
        `방어 경계 안에서 교전을 시작한다는 뜻이라 요격이 성립할 수 없습니다.`,
      value: s.effector.commit_range_m,
      suggestion: Math.max(s.site.keep_out_radius_m * 2, s.site.keep_out_radius_m + 500),
    })
  }

  // The pad must sit inside the commit range or the interceptor starts behind the threat.
  if (s.effector.launch_pad_range_from_asset_m >= s.effector.commit_range_m) {
    issues.push({
      key: 'effector.launch_pad_range_from_asset_m',
      label: '발사대 거리',
      severity: 'error',
      message:
        `발사대 거리(${fmt(s.effector.launch_pad_range_from_asset_m)} m)가 발사 개시 거리 이상입니다 — ` +
        `요격기가 위협보다 바깥에서 출발하게 되어 기하가 성립하지 않습니다.`,
      value: s.effector.launch_pad_range_from_asset_m,
      suggestion: 0,
    })
  }

  // Onboard EO processing starts after launch. A requested completion
  // separation farther than the remaining launch gap minus the processing
  // closure would require the camera to start before the interceptor exists.
  const closingSpeed = s.effector.cruise_speed_m_s + s.threat.speed_m_s
  const detectedAt = computeDetection(s.sensor, s.threat, s.site.keep_out_radius_m).detect_at_range_m
  const actualLaunchRange = Math.min(
    s.effector.commit_range_m,
    detectedAt - s.threat.speed_m_s * tReact,
  )
  const launchGap = actualLaunchRange - s.effector.launch_pad_range_from_asset_m
  const maxPostLaunchCompletionRange = launchGap - closingSpeed * s.sensor.classify_time_s
  if (
    s.optics.required_discrimination !== 'radar_only' &&
    s.optics.terminal_recognition_range_m > maxPostLaunchCompletionRange
  ) {
    issues.push({
      key: 'optics.terminal_recognition_range_m',
      label: 'EO 과업 완료 상대거리',
      severity: 'error',
      message:
        `요청 상대거리(${fmt(s.optics.terminal_recognition_range_m)} m)에서 완료하려면 EO 처리가 발사 전에 시작돼야 합니다 — ` +
        `현재 발사거리·속도·처리시간에서 발사 후 가능한 최대 완료 상대거리는 ${fmt(Math.max(0, maxPostLaunchCompletionRange))} m입니다.`,
      value: s.optics.terminal_recognition_range_m,
      suggestion: Math.max(1, Math.floor(Math.max(1, maxPostLaunchCompletionRange))),
    })
  }

  // Endurance that cannot even cover the quoted reach makes max_engagement_range a lie.
  const enduranceReach = s.effector.cruise_speed_m_s * s.effector.endurance_s
  if (enduranceReach < s.site.keep_out_radius_m) {
    issues.push({
      key: 'effector.endurance_s',
      label: '체공 시간',
      severity: 'warn',
      message:
        `순항속도×체공(${fmt(enduranceReach)} m)이 keep-out 반경에도 못 미칩니다 — 요격기가 방어 경계까지 나가지 못해 P_reach가 항상 0입니다.`,
      value: s.effector.endurance_s,
      // Enough endurance to fly out to the keep-out ring and back, with margin.
      suggestion: Math.ceil((s.site.keep_out_radius_m / Math.max(0.1, s.effector.cruise_speed_m_s)) * 4),
    })
  }

  // Johnson task difficulty must stay ordered: detection < recognition < identification.
  if (s.optics.n50_detection > s.optics.n50_recognition) {
    issues.push({
      key: 'optics.n50_detection',
      label: 'EO 탐지 N50',
      severity: 'warn',
      message:
        `EO 탐지 N50(${fmt(s.optics.n50_detection)})이 인식 N50(${fmt(s.optics.n50_recognition)})보다 큽니다 — ` +
        `Johnson 기준에서 탐지는 인식보다 쉬워야 하므로 순서가 뒤집혔습니다.`,
      value: s.optics.n50_detection,
      suggestion: Math.max(0.1, s.optics.n50_recognition * 0.25),
    })
  }

  if (s.optics.n50_recognition > s.optics.n50_identification) {
    issues.push({
      key: 'optics.n50_recognition',
      label: '인식 N50',
      severity: 'warn',
      message:
        `인식 N50(${fmt(s.optics.n50_recognition)})이 식별 N50(${fmt(s.optics.n50_identification)})보다 큽니다 — ` +
        `Johnson 기준에서 인식은 식별보다 쉬워야 하므로 순서가 뒤집혔습니다.`,
      value: s.optics.n50_recognition,
      suggestion: Math.max(0.1, s.optics.n50_identification * 0.6),
    })
  }

  // Zero pointing uncertainty makes P_acq degenerate (always 1) — legal but hides the gate.
  const sigma = Math.hypot(s.optics.cue_error_deg, s.optics.pointing_error_deg)
  if (sigma === 0) {
    issues.push({
      key: 'optics.pointing_error_deg',
      label: '요격기 지향 오차',
      severity: 'warn',
      message: '큐·지향 오차가 모두 0이라 획득 확률 P_acq가 항상 100%가 됩니다 — 짐벌 없는 고정 FOV 전제와 맞지 않습니다.',
      value: s.optics.pointing_error_deg,
      suggestion: 0.4,
    })
  }

  return issues
}

/** All input problems, errors first. */
export function validateScenario(s: Scenario): ValidationIssue[] {
  const all = [...validateRanges(s), ...validateCross(s)]
  return all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1))
}

/** True when nothing is physically impossible (warnings are allowed). */
export function isScenarioValid(s: Scenario): boolean {
  return !validateScenario(s).some((i) => i.severity === 'error')
}

/** Apply every issue's `suggestion`, producing a scenario that passes the range checks. */
export function autoFixScenario(s: Scenario): Scenario {
  let next = s
  for (const issue of validateRanges(s)) {
    if (issue.suggestion == null) continue
    const p = PARAM_INFO.find((x) => x.key === issue.key)
    if (p) next = p.set(next, issue.suggestion)
  }
  return next
}
