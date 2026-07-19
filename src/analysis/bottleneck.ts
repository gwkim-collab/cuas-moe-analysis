// ────────────────────────────────────────────────────────────
// Analysis core · kill-chain bottleneck diagnosis.
//
// P_negate is the product of the stage gates, so the lowest gate is
// the limiting factor — improving anything else barely moves the
// result. This finds that stage (and, for classify, the weakest of
// its sub-factors) and returns a concrete "what to improve" pointer.
//
// Note: the current model is rotationally symmetric (bearing doesn't
// enter the kill chain), so this global diagnosis also applies to
// every coverage bearing.
// ────────────────────────────────────────────────────────────

import type { MoeResult } from './moe'

export type StageKey = 'detect' | 'classify' | 'decision' | 'reach' | 'kill'

export interface BottleneckDiagnosis {
  stage: StageKey
  label: string
  value: number
  /** For classify: the weakest sub-factor, else undefined. */
  subFactor?: { label: string; value: number }
  /** Concrete lever to improve the limiting stage. */
  recommendation: string
}

const STAGE_LABEL: Record<StageKey, string> = {
  detect: '탐지 (P_detect)',
  classify: '분류 (P_classify)',
  decision: '결심 (P_decision)',
  reach: '도달 (P_reach)',
  kill: '살상 (P_kill)',
}

const RECO: Record<StageKey, string> = {
  detect: '레이더 탐지거리·재방문 주기 개선, 표적 RCS 가정 재확인(고도가 높으면 경사거리 불리).',
  classify: '분류가 병목 — 아래 하위 요인부터 개선하세요.',
  decision: '결심 지연을 줄이고 결심 신뢰도를 높이세요(반응 예산 여유 확보).',
  reach: '순항속도↑·반응예산↓·최대교전거리/발사대 배치 조정, keep-out 여유 확보.',
  kill: '단발 Pk(페이로드)·사격 기회 수를 높이세요.',
}

export function diagnoseBottleneck(r: MoeResult): BottleneckDiagnosis {
  const b = r.breakdown
  const gates: Array<{ key: StageKey; v: number }> = [
    { key: 'detect', v: b.p_detect },
    { key: 'classify', v: b.p_classify },
    { key: 'decision', v: b.p_decision },
    { key: 'reach', v: b.p_reach },
    { key: 'kill', v: b.p_kill },
  ]
  const min = gates.reduce((a, c) => (c.v < a.v ? c : a))

  let subFactor: BottleneckDiagnosis['subFactor']
  let recommendation = RECO[min.key]
  if (min.key === 'classify') {
    const subs = [
      { label: '획득 P_acq (화각·지향오차)', value: r.optics.acquisition_prob },
      { label: '인식 (해상도·표적크기·N50)', value: r.optics.recognition_prob },
      { label: '대기 투과 (시정)', value: r.optics.atmospheric_transmission },
    ]
    subFactor = subs.reduce((a, c) => (c.value < a.value ? c : a))
    const lever: Record<string, string> = {
      '획득 P_acq (화각·지향오차)': '화각을 최적점으로 넓히거나 큐/지향 오차를 줄이세요(짐벌 검토).',
      '인식 (해상도·표적크기·N50)': '해상도↑·화각↓(픽셀↑) 또는 N50 낮은 분류기 사용.',
      '대기 투과 (시정)': '저시정이 지배 — 교전거리를 당기거나 IR/근접 대안 검토.',
    }
    recommendation = `분류 병목의 최약 요인: ${subFactor.label}. ${lever[subFactor.label]}`
  }

  return { stage: min.key, label: STAGE_LABEL[min.key], value: min.v, subFactor, recommendation }
}
