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
  detect: '적시 탐지 (P_detect)',
  classify: '종말 EO (P_classify)',
  decision: '결심 (P_decision)',
  reach: '도달 (P_reach)',
  kill: '살상 (P_kill)',
}

const RECO: Record<StageKey, string> = {
  detect: '필요 탐지거리 전에 확보되는 스캔 수를 보세요 — 기준 탐지거리·Pd·RCS·재방문 주기를 함께 개선해야 합니다.',
  classify: '발사 후 종말 EO가 병목 — 아래 하위 요인부터 개선하세요.',
  decision: '결심 지연을 줄이고 결심 신뢰도를 높이세요(반응 예산 여유 확보).',
  reach: '순항속도↑·반응예산↓·요격기 도달 반경/발사대 배치 조정, keep-out 여유 확보.',
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
    if (!r.optics.eo_gate_applied) {
      recommendation = 'EO 미적용(레이더 추적만) 모드입니다. 레이더 트랙 유효 신뢰도와 교전 규칙을 검증하세요.'
    } else {
      const taskName = r.optics.discrimination_level === 'detection'
        ? '탐지'
        : r.optics.discrimination_level === 'identification'
          ? '식별'
          : '인식'
      const subs = [
        { label: '획득 P_acq (화각·지향오차)', value: r.optics.acquisition_prob },
        { label: `${taskName} (해상도·표적크기·N50)`, value: r.optics.recognition_prob },
        { label: '대기 투과 (시정)', value: r.optics.atmospheric_transmission },
      ]
      subFactor = subs.reduce((a, c) => (c.value < a.value ? c : a))
      const lever: Record<string, string> = {
        '획득 P_acq (화각·지향오차)': '화각을 최적점으로 조정하고 레이더 큐/비행 유도 지향 오차를 줄이세요.',
        [`${taskName} (해상도·표적크기·N50)`]: '해상도↑·화각을 최적점으로 조정하거나 시험으로 보정된 N50을 사용하세요.',
        '대기 투과 (시정)': '저시정이 지배 — 교전거리를 당기거나 IR/근접 대안 검토.',
      }
      recommendation = `분류 병목의 최약 요인: ${subFactor.label}. ${lever[subFactor.label]}`
    }
  }

  // Detection can bind WITHOUT being the lowest gate: if it arrives too late for
  // the commit range, the engagement is dragged inward and every downstream
  // stage is solved off the wrong launch point. That outranks the gate minimum.
  if (r.reach.detection_limited) {
    recommendation =
      `⚠ 탐지 제약: 필요 탐지거리 ${r.reach.required_detection_range_m.toFixed(0)} m에 ` +
      `${Math.abs(r.reach.detection_margin_m).toFixed(0)} m 모자라 교리상 발사 개시 거리` +
      `(${r.reach.commit_range_m.toFixed(0)} m)를 지키지 못합니다. 탐지거리를 늘리거나, ` +
      `발사 전 반응 예산(결심·발사 지연)을 줄이거나, 발사 개시 거리를 낮추세요. ` +
      `그 다음 병목 — ${recommendation}`
  }

  return { stage: min.key, label: STAGE_LABEL[min.key], value: min.v, subFactor, recommendation }
}
