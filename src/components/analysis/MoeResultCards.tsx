import type { MoeResult } from '../../analysis'

interface Props {
  result: MoeResult
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

// Gate bar — one stage of the kill chain as a labelled proportion bar.
function GateBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="an-gate">
      <div className="an-gate-head">
        <span className="an-gate-label">{label}</span>
        <span className="an-gate-val">{pct(value)}</span>
      </div>
      <div className="an-gate-track">
        <div className="an-gate-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
    </div>
  )
}

export default function MoeResultCards({ result }: Props) {
  const { p_negate, leakage, breakdown, detection, optics, reach, single_shot_pk, feasible } = result

  return (
    <div className="an-results">
      {/* Headline · probability of negation */}
      <div className={`an-headline ${feasible ? '' : 'is-infeasible'}`}>
        <div className="an-headline-main">
          <div className="ab-spec">P_NEGATE · 무력화 확률</div>
          <div className="an-headline-value">{pct(p_negate)}</div>
        </div>
        <div className="an-headline-side">
          <div className="an-leak">
            <div className="ab-spec">LEAKAGE · 누수</div>
            <div className="an-leak-value">{pct(leakage)}</div>
          </div>
          <div className={`an-feasible-badge ${feasible ? 'ok' : 'bad'}`}>
            {feasible ? '✓ 교전 성립' : '✕ 교전 불성립'}
          </div>
        </div>
      </div>

      {!feasible && reach.reason && (
        <div className="an-reason">불성립 사유: {reach.reason}</div>
      )}

      {/* Kill-chain gate breakdown */}
      <div className="an-card">
        <div className="ab-label">KILL-CHAIN 단계별 확률</div>
        <div className="an-gate-note ab-small">P_negate = 각 단계의 곱</div>
        <GateBar label="P_detect · 탐지" value={breakdown.p_detect} />
        <GateBar label="P_classify · 분류" value={breakdown.p_classify} />
        <GateBar label="P_decision · 결심" value={breakdown.p_decision} />
        <GateBar label="P_reach · 도달(기하)" value={breakdown.p_reach} />
        <GateBar label="P_kill · 살상" value={breakdown.p_kill} />
      </div>

      {/* EO/IR optical recognition readout */}
      <div className="an-card">
        <div className="ab-label">EO/IR 인식 · 광학</div>
        <div className="an-gate-note ab-small">
          P_classify = 획득 P_acq × Johnson 인식확률 × 분류기 상한 (짐벌 없음 · 고정 FOV)
        </div>
        <dl className="an-readout">
          <div><dt>분류 완료 거리</dt><dd>{optics.classify_range_m.toFixed(0)} m</dd></div>
          <div className={optics.pixels_on_target >= 1 ? '' : 'bad'}>
            <dt>표적 픽셀 수</dt><dd>{optics.pixels_on_target.toFixed(1)} px</dd>
          </div>
          <div><dt>인식 확률</dt><dd>{pct(optics.recognition_prob)}</dd></div>
          <div><dt>50% 인식 거리</dt><dd>{optics.recognition_range_50_m.toFixed(0)} m</dd></div>
          <div><dt>지향 오차 σ (큐⊕지향)</dt><dd>{optics.pointing_sigma_deg.toFixed(2)}°</dd></div>
          <div className={optics.acquisition_prob >= 0.5 ? '' : 'bad'}>
            <dt>획득 확률 P_acq</dt><dd>{pct(optics.acquisition_prob)}</dd>
          </div>
        </dl>
      </div>

      {/* Kinematics / geometry readout */}
      <div className="an-card">
        <div className="ab-label">교전 기하 · 타임라인</div>
        <dl className="an-readout">
          <div><dt>탐지 거리 (nominal)</dt><dd>{detection.nominal_range_m.toFixed(0)} m</dd></div>
          <div><dt>탐지 시점 거리</dt><dd>{detection.detect_at_range_m.toFixed(0)} m</dd></div>
          <div><dt>반응 예산 (분류+결심+발사)</dt><dd>{reach.budget.react_total_s.toFixed(1)} s</dd></div>
          <div><dt>발사 시 위협 거리</dt><dd>{reach.threat_range_at_launch_m.toFixed(0)} m</dd></div>
          <div><dt>요격까지 시간</dt><dd>{reach.time_to_meet_s.toFixed(1)} s</dd></div>
          <div><dt>요격 거리 (자산 기준)</dt><dd>{reach.intercept_range_m.toFixed(0)} m</dd></div>
          <div className={reach.margin_m >= 0 ? 'ok' : 'bad'}>
            <dt>Keep-out 여유</dt>
            <dd>{reach.margin_m.toFixed(0)} m · {reach.margin_s.toFixed(1)} s</dd>
          </div>
          <div><dt>단발 살상확률 (payload)</dt><dd>{pct(single_shot_pk)}</dd></div>
        </dl>
      </div>
    </div>
  )
}
