import type { McResult, GateName } from '../../analysis'
import Histogram from './Histogram'

interface Props {
  result: McResult
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

const GATE_LABELS: Record<GateName, string> = {
  detect: '탐지',
  classify: '분류',
  decision: '결심',
  reach: '도달',
  kill: '살상',
}

export default function McResults({ result }: Props) {
  const { negated_fraction, leakage_fraction, ci95, p_negate_mean, trials, seed, histogram, gate_failure_counts } =
    result

  const failureTotal = (Object.values(gate_failure_counts) as number[]).reduce((a, b) => a + b, 0)
  const totalFailures = Math.max(1, failureTotal)

  return (
    <div className="an-results">
      {/* Headline · outcome-based negation probability */}
      <div className="an-headline">
        <div className="an-headline-main">
          <div className="ab-spec">P_NEGATE · 몬테카를로 추정</div>
          <div className="an-headline-value">{pct(negated_fraction)}</div>
          <div className="ab-small an-mc-ci">
            95% CI [{pct(ci95[0])} – {pct(ci95[1])}] · ±{((ci95[1] - ci95[0]) * 50).toFixed(2)}%p ·{' '}
            {trials.toLocaleString()} trials · seed {seed}
          </div>
          {/* Sampling noise wider than ~1%p swamps the few-%p differences this
              tool is used to compare, so say so rather than let it pass. */}
          {(ci95[1] - ci95[0]) * 50 > 1 && (
            <div className="ab-small an-mc-ci" style={{ color: '#ffb020' }}>
              ⚠ 샘플링 오차가 ±1%p보다 큽니다 — 시나리오 간 작은 차이를 비교하려면 시행수를 늘리세요
              (CI 폭은 1/√n로 줄어듭니다).
            </div>
          )}
          <div className="ab-small an-mc-ci" style={{ opacity: 0.65 }}>
            이 CI는 <b>샘플링 오차만</b> 나타냅니다. 입력값 대부분이 가정·플레이스홀더이므로 실제 불확실성은
            이보다 훨씬 큽니다 — 시행수를 늘려도 그 부분은 줄지 않습니다.
          </div>
        </div>
        <div className="an-headline-side">
          <div className="an-leak">
            <div className="ab-spec">LEAKAGE · 누수</div>
            <div className="an-leak-value">{pct(leakage_fraction)}</div>
          </div>
        </div>
      </div>

      {/* Distribution of the per-trial analytic P_negate */}
      <div className="an-card">
        <div className="ab-label">P_NEGATE 분포 (해석식, 시행별)</div>
        <div className="an-gate-note ab-small">
          입력 불확실성(속도·RCS·지연)을 반영한 시행별 분포 · 세로선 = 평균 {pct(p_negate_mean)}
        </div>
        <Histogram bins={histogram} markerX={p_negate_mean} markerLabel={`μ ${pct(p_negate_mean)}`} />
      </div>

      {/* Which gate fails when the threat leaks */}
      <div className="an-card">
        <div className="ab-label">누수 원인 · 첫 실패 단계</div>
        <div className="an-gate-note ab-small">
          킬체인 순서(탐지→분류→결심→도달→살상)대로 판정해, <b>처음 실패한 단계</b>만 1회 집계합니다.
          막대·백분율의 분모는 <b>누수 시행 {failureTotal.toLocaleString()}회</b>(전체 {trials.toLocaleString()}회 중)입니다.
          앞 단계에서 이미 걸러진 시행은 뒤 단계에 도달하지 못하므로, <b>0은 "그 단계가 첫 실패인 적이 없다"</b>는 뜻이지
          그 단계의 확률이 0이라는 뜻이 아닙니다 — 예: P_detect가 100%면 탐지는 항상 0입니다.
        </div>
        {(Object.keys(GATE_LABELS) as GateName[]).map((g) => {
          const c = gate_failure_counts[g]
          const frac = c / totalFailures
          return (
            <div className="an-gate" key={g}>
              <div className="an-gate-head">
                <span className="an-gate-label">{GATE_LABELS[g]}</span>
                <span className="an-gate-val">
                  {c.toLocaleString()}회 · 누수의 {pct(frac)} · 전체의 {pct(c / trials)}
                </span>
              </div>
              <div className="an-gate-track">
                <div className="an-gate-fill is-fail" style={{ width: `${frac * 100}%` }} />
              </div>
            </div>
          )
        })}
        <div className="an-gate-note ab-small" style={{ marginTop: 'var(--s-2)' }}>
          합계 {failureTotal.toLocaleString()}회 누수 + {(trials - failureTotal).toLocaleString()}회 무력화 = {trials.toLocaleString()}회
        </div>
      </div>
    </div>
  )
}
