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

export function reportToMarkdown(report: AnalysisReport): string {
  const { scenario: s, engagement: e, coverage: c } = report
  const b = e.breakdown
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
  lines.push(`| 교전 성립 | ${e.feasible ? '성립' : '불성립'}${e.feasible ? '' : ` (${e.reach.reason})`} |`)
  lines.push(`| P_detect · 탐지 | ${pct(b.p_detect)} |`)
  lines.push(`| P_classify · 분류 | ${pct(b.p_classify)} |`)
  lines.push(`| P_decision · 결심 | ${pct(b.p_decision)} |`)
  lines.push(`| P_reach · 도달 | ${pct(b.p_reach)} |`)
  lines.push(`| P_kill · 살상 | ${pct(b.p_kill)} |`)
  lines.push(`| 요격 거리 (자산 기준) | ${e.reach.intercept_range_m.toFixed(0)} m |`)
  lines.push(`| Keep-out 여유 | ${e.reach.margin_m.toFixed(0)} m · ${e.reach.margin_s.toFixed(1)} s |`)
  lines.push('')
  lines.push('## 2. 방어 커버리지 (360° 스윕)')
  lines.push('')
  lines.push('| 지표 | 값 |')
  lines.push('|---|---|')
  lines.push(`| 평균 P_negate | ${pct(c.mean_p_negate)} |`)
  lines.push(`| 방어 커버리지 (≥${pct(c.threshold)}) | ${pct(c.defended_fraction)} |`)
  lines.push(`| 탐지 반경 | ${c.nominal_detection_range_m.toFixed(0)} m |`)
  lines.push(`| 최대 교전 반경 | ${c.max_engagement_range_m.toFixed(0)} m |`)
  lines.push(`| Keep-out 반경 | ${c.keep_out_radius_m.toFixed(0)} m |`)
  lines.push('')
  lines.push('## 3. 입력 파라미터')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(s, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`> ⚠ ${report.disclaimer}`)
  lines.push('')
  return lines.join('\n')
}
