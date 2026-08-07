// ────────────────────────────────────────────────────────────
// Analysis core · report builder + serializers.
//
// Gathers the scenario, its analytical engagement MOE, and the
// 360° coverage summary into one structured report object, then
// serializes to JSON or Markdown for download. Pure — the caller
// passes the timestamp so this stays testable/deterministic.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'
import { computeMoe, type MoeResult } from './moe'
import { computeCoverage, type CoverageResult } from './coverage'
import { PARAM_INFO } from './params'
import { paramExplain } from './paramExplain'

export interface AnalysisReport {
  generated_at: string
  scenario: Scenario
  engagement: MoeResult
  coverage: Pick<
    CoverageResult,
    'mean_p_negate' | 'defended_fraction' | 'threshold' | 'keep_out_radius_m' | 'nominal_detection_range_m' | 'max_engagement_range_m'
  >
  disclaimer: string
}

const DISCLAIMER =
  '본 리포트의 수치는 공개 문헌 기반 근사 모델과 편집 가능한 플레이스홀더 파라미터로 산출된 것으로, ' +
  '확정 성능치가 아니며 도메인 전문가(SME) 검증이 필요합니다.'

export function buildReport(scenario: Scenario, generatedAtISO: string): AnalysisReport {
  const engagement = computeMoe(scenario)
  const cov = computeCoverage(scenario, { bearings: 72, threshold: 0.7 })
  return {
    generated_at: generatedAtISO,
    scenario,
    engagement,
    coverage: {
      mean_p_negate: cov.mean_p_negate,
      defended_fraction: cov.defended_fraction,
      threshold: cov.threshold,
      keep_out_radius_m: cov.keep_out_radius_m,
      nominal_detection_range_m: cov.nominal_detection_range_m,
      max_engagement_range_m: cov.max_engagement_range_m,
    },
    disclaimer: DISCLAIMER,
  }
}

export function reportToJson(report: AnalysisReport): string {
  return JSON.stringify(report, null, 2)
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function pctPrecise(x: number): string {
  if ((x > 0 && x < 0.001) || (x > 0.999 && x < 1)) return `${(x * 100).toFixed(5)}%`
  return pct(x)
}

export function reportToMarkdown(report: AnalysisReport): string {
  const { scenario: s, engagement: e, coverage: c } = report
  const b = e.breakdown
  const eoTaskName = e.optics.discrimination_level === 'detection' || e.optics.discrimination_level === 'radar_only'
    ? '탐지'
    : e.optics.discrimination_level === 'identification'
      ? '식별'
      : '인식'
  const lines: string[] = []
  lines.push('# AIRLOCK 효과도 분석 리포트')
  lines.push('')
  lines.push(`- 생성 시각: ${report.generated_at}`)
  lines.push(`- 보호 자산: ${s.site.asset.label} (${s.site.asset.lat.toFixed(4)}, ${s.site.asset.lon.toFixed(4)})`)
  lines.push('')
  lines.push('## 1. 교전 효과도 (해석식)')
  lines.push('')
  lines.push('| 지표 | 값 |')
  lines.push('|---|---|')
  lines.push(`| **P_negate (무력화 확률)** | **${pct(e.p_negate)}** |`)
  lines.push(`| Leakage (누수) | ${pct(e.leakage)} |`)
  const infeasibleReason = !e.reach.feasible ? e.reach.reason : e.terminal_eo.reason
  lines.push(`| 교전 성립 | ${e.feasible ? '성립' : '불성립'}${e.feasible ? '' : ` (${infeasibleReason})`} |`)
  lines.push(`| P_detect · 적시 탐지 | ${pctPrecise(b.p_detect)} |`)
  lines.push(`| ${e.optics.eo_gate_applied ? `P_terminal EO · EO ${eoTaskName}` : 'P_terminal · 레이더 트랙 유효 신뢰도'} | ${pct(b.p_classify)} |`)
  lines.push(`| P_decision · 결심 | ${pct(b.p_decision)} |`)
  lines.push(`| P_reach · 도달 | ${pct(b.p_reach)} |`)
  lines.push(`| P_kill · 살상 | ${pct(b.p_kill)} |`)
  lines.push(`| 발사 개시 거리 (교리) | ${e.reach.commit_range_m.toFixed(0)} m |`)
  lines.push(`| 발사 시 위협 거리 | ${e.reach.threat_range_at_launch_m.toFixed(0)} m |`)
  lines.push(`| 요격 거리 (자산 기준) | ${e.reach.intercept_range_m.toFixed(0)} m |`)
  lines.push(`| Keep-out 여유 | ${e.reach.margin_m.toFixed(0)} m · ${e.reach.margin_s.toFixed(1)} s |`)
  lines.push('')
  lines.push('### 1-1. 탐지 요구 충족 여부')
  lines.push('')
  lines.push(
    '> P_detect는 keep-out 전 언젠가 탐지할 확률이 아니라, 결심+발사 지연을 남겨 두고 교리상 발사거리를 지킬 수 있는 ' +
      '**필요 탐지거리까지의 누적 탐지확률**입니다.',
  )
  lines.push('')
  lines.push('| 지표 | 값 |')
  lines.push('|---|---|')
  lines.push(`| P_detect · 적시 누적 | ${pctPrecise(e.detection.cumulative_pd_in_time)} |`)
  lines.push(`| 적시 미탐지 위험 | ${pctPrecise(1 - e.detection.cumulative_pd_in_time)} |`)
  lines.push(`| 적시 탐지 마감선 | ${e.detection.timely_cutoff_range_m.toFixed(0)} m |`)
  lines.push(`| 적시 / 전체 독립 스캔 | ${e.detection.looks_in_time} / ${e.detection.looks_before_keep_out} 회 |`)
  lines.push(`| Keep-out 전 누적 탐지 (참고) | ${pctPrecise(e.detection.cumulative_pd_before_keep_out)} |`)
  lines.push(`| 탐지 시점 거리 | ${e.reach.detect_at_range_m.toFixed(0)} m |`)
  lines.push(
    `| 필요 탐지거리 (= 발사개시 + v_t·반응예산) | ${e.reach.required_detection_range_m.toFixed(0)} m |`,
  )
  lines.push(`| 발사 전 반응 예산 (= 결심+발사) | ${e.reach.budget.react_total_s.toFixed(1)} s |`)
  lines.push(
    `| 탐지 여유 | ${e.reach.detection_margin_m.toFixed(0)} m · ${e.reach.detection_margin_s.toFixed(1)} s |`,
  )
  lines.push(
    `| 판정 | ${e.reach.detection_limited ? '⚠ **탐지 제약** — 교리상 발사 개시 거리를 지키지 못함' : '✓ 교리 지배 — 탐지 충분'} |`,
  )
  lines.push('')
  lines.push(`## 2. ${e.optics.eo_gate_applied ? `발사 후 EO/IR ${eoTaskName} · 획득` : 'EO 미적용 · 광학 참고값'}`)
  lines.push('')
  lines.push(e.optics.eo_gate_applied
    ? '> AB-U10을 발사한 뒤 탑재 카메라와 표적의 상대 LOS 거리로 계산합니다. 자산↔표적 거리가 아닙니다.'
    : '> 종말 확인 정책이 EO 미적용(레이더 추적만)입니다. 아래 광학 수치는 참고값이며 P_terminal에 사용하지 않습니다.')
  lines.push(e.optics.eo_gate_applied
    ? `> P_terminal EO = 획득 P_acq × Johnson ${eoTaskName}확률 × 대기투과 × EO 과업 신뢰도 상한 (짐벌 없음 · 고정 FOV)`
    : '> P_terminal = P(교전 유효 트랙 | 적시 탐지) · 레이더 트랙 유효 신뢰도')
  lines.push('')
  lines.push('| 지표 | 값 |')
  lines.push('|---|---|')
  lines.push(`| 발사 시 EO–표적 상대거리 | ${e.terminal_eo.separation_at_launch_m.toFixed(0)} m |`)
  lines.push(`| EO 처리 시작 상대거리 | ${e.terminal_eo.processing_start_separation_m.toFixed(0)} m |`)
  lines.push(`| EO ${eoTaskName} 완료 상대거리 | ${e.optics.classify_range_m.toFixed(0)} m |`)
  lines.push(`| EO 처리 시간 | ${s.sensor.classify_time_s.toFixed(1)} s |`)
  lines.push(`| EO 시작/완료 (발사 후) | T+${e.terminal_eo.processing_start_after_launch_s.toFixed(1)} s / T+${e.terminal_eo.recognition_after_launch_s.toFixed(1)} s |`)
  lines.push(`| 완료 시 자산 기준 위치 | 표적 ${e.terminal_eo.target_range_at_recognition_m.toFixed(0)} m · U10 ${e.terminal_eo.interceptor_range_at_recognition_m.toFixed(0)} m |`)
  lines.push(`| EO 완료→요격 여유 | ${e.terminal_eo.time_remaining_to_intercept_s.toFixed(1)} s |`)
  lines.push(`| 표적 픽셀 수 | ${e.optics.pixels_on_target.toFixed(1)} px |`)
  lines.push(`| ${eoTaskName} 확률 (Johnson) | ${pct(e.optics.recognition_prob)} |`)
  lines.push(`| 획득 확률 P_acq | ${pct(e.optics.acquisition_prob)} |`)
  lines.push(`| 지향 오차 σ (큐⊕지향) | ${e.optics.pointing_sigma_deg.toFixed(2)}° |`)
  lines.push(`| 대기 투과 (시정) | ${pct(e.optics.atmospheric_transmission)} |`)
  lines.push(`| 50% ${eoTaskName} 거리 | ${e.optics.recognition_range_50_m.toFixed(0)} m |`)
  lines.push('')
  lines.push('## 3. 방어 커버리지 (360° 스윕)')
  lines.push('')
  lines.push('| 지표 | 값 |')
  lines.push('|---|---|')
  lines.push(`| 평균 P_negate | ${pct(c.mean_p_negate)} |`)
  lines.push(`| 방어 커버리지 (≥${pct(c.threshold)}) | ${pct(c.defended_fraction)} |`)
  lines.push(`| 탐지 반경 | ${c.nominal_detection_range_m.toFixed(0)} m |`)
  lines.push(`| 요격기 도달 반경 | ${c.max_engagement_range_m.toFixed(0)} m |`)
  lines.push(`| Keep-out 반경 | ${c.keep_out_radius_m.toFixed(0)} m |`)
  lines.push('')
  lines.push('## 4. 입력 파라미터')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(s, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('## 5. 파라미터 근거 (이론 · 값 출처)')
  lines.push('')
  lines.push('| 파라미터 | 현재값 | 의미 | 이론 근거 | 값 출처 |')
  lines.push('|---|---|---|---|---|')
  const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  for (const p of PARAM_INFO) {
    const ex = paramExplain(p.key)
    const val = p.get(s)
    lines.push(
      `| ${p.label}${p.unit ? ` (${p.unit})` : ''} | ${val} | ${esc(p.description)} | ${esc(ex?.theory ?? '—')} | ${esc(p.source)} |`,
    )
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`> ⚠ ${report.disclaimer}`)
  lines.push('')
  return lines.join('\n')
}
