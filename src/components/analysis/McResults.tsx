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

  const totalFailures = Math.max(
    1,
    (Object.values(gate_failure_counts) as number[]).reduce((a, b) => a + b, 0),
  )

  return (
    <div className="an-results">
      {/* Headline · outcome-based negation probability */}
      <div className="an-headline">
        <div className="an-headline-main">
          <div className="ab-spec">P_NEGATE · 몬테카를로 추정</div>
          <div className="an-headline-value">{pct(negated_fraction)}</div>
          <div className="ab-small an-mc-ci">
            95% CI [{pct(ci95[0])} – {pct(ci95[1])}] · {trials.toLocaleString()} trials · seed {seed}
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
        <div className="an-gate-note ab-small">누수 시행 중 처음으로 실패한 킬체인 단계의 비율</div>
        {(Object.keys(GATE_LABELS) as GateName[]).map((g) => {
          const c = gate_failure_counts[g]
          const frac = c / totalFailures
          return (
            <div className="an-gate" key={g}>
              <div className="an-gate-head">
                <span className="an-gate-label">{GATE_LABELS[g]}</span>
                <span className="an-gate-val">{c} · {pct(frac)}</span>
              </div>
              <div className="an-gate-track">
                <div className="an-gate-fill is-fail" style={{ width: `${frac * 100}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
