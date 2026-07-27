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
  lines.push('## 2. EO/IR 인식 · 획득 (P_classify 구성)')
  lines.push('')
  lines.push('> P_classify = 획득 P_acq × Johnson 인식확률 × 대기투과 × 분류기 상한 (짐벌 없음 · 고정 FOV)')
  lines.push('')
  lines.push('| 지표 | 값 |')
  lines.push('|---|---|')
  lines.push(`| 분류 완료 거리 (LOS 경사거리) | ${e.optics.classify_range_m.toFixed(0)} m |`)
  lines.push(`| 표적 픽셀 수 | ${e.optics.pixels_on_target.toFixed(1)} px |`)
  lines.push(`| 인식 확률 (Johnson) | ${pct(e.optics.recognition_prob)} |`)
  lines.push(`| 획득 확률 P_acq | ${pct(e.optics.acquisition_prob)} |`)
  lines.push(`| 지향 오차 σ (큐⊕지향) | ${e.optics.pointing_sigma_deg.toFixed(2)}° |`)
  lines.push(`| 대기 투과 (시정) | ${pct(e.optics.atmospheric_transmission)} |`)
  lines.push(`| 50% 인식 거리 | ${e.optics.recognition_range_50_m.toFixed(0)} m |`)
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
