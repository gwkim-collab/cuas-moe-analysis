import { useMemo, useState } from 'react'
import { PARAMS, getParam, solveForTarget, type Scenario } from '../../analysis'
import LineChart from './LineChart'

interface Props {
  scenario: Scenario
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function fmtVal(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)
}

export default function SpecView({ scenario }: Props) {
  const [key, setKey] = useState('sensor.ref_detection_range_m')
  const [target, setTarget] = useState(0.9)

  const param = getParam(key)!
  const res = useMemo(
    () => solveForTarget(scenario, param, target, { steps: 121 }),
    [scenario, param, target],
  )

  const sideText =
    res.satisfy_side === 'gte' ? '이상' : res.satisfy_side === 'lte' ? '이하' : '—'
  const dirText =
    res.direction === 'increasing' ? '↑ 증가' : res.direction === 'decreasing' ? '↓ 감소' : '→ 무변화'

  return (
    <div className="an-results">
      <div className="an-card">
        <div className="an-trade-controls">
          <label>
            해결 파라미터
            <select value={key} onChange={(e) => setKey(e.target.value)}>
              {PARAMS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}{p.unit ? ` (${p.unit})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            목표 P_negate
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={target}
              onChange={(e) => setTarget(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
            />
          </label>
        </div>

        {/* Result headline */}
        <div className={`an-spec-result ${res.found ? '' : 'is-infeasible'}`}>
          {res.found && res.threshold_value != null ? (
            <>
              <div className="ab-spec">필요 스펙 · {res.label}</div>
              <div className="an-spec-value">
                {fmtVal(res.threshold_value)} {param.unit ?? ''} {sideText}
              </div>
              <div className="ab-small an-spec-sub">
                목표 P_negate {pct(target)} 달성 경계 · 관계 {dirText} · 현재값 {fmtVal(res.base_value)}{param.unit ?? ''} → {pct(res.base_metric)}
              </div>
            </>
          ) : (
            <>
              <div className="ab-spec">달성 불가</div>
              <div className="an-spec-value is-bad">범위 내 불가</div>
              <div className="ab-small an-spec-sub">
                {param.label}를 [{fmtVal(param.min)}, {fmtVal(param.max)}] 범위에서 조정해도 P_negate {pct(target)}에 도달하지 못합니다. 다른 파라미터도 함께 개선 필요.
              </div>
            </>
          )}
        </div>
      </div>

      <div className="an-card">
        <div className="ab-label">P_NEGATE vs {param.label}</div>
        <div className="an-gate-note ab-small">가로선 = 목표 {pct(target)} · 세로선 = 필요 스펙 경계</div>
        <LineChart
          points={res.curve}
          xLabel={`${param.label}${param.unit ? ` (${param.unit})` : ''}`}
          targetY={target}
          markerX={res.threshold_value ?? undefined}
          markerLabel={res.threshold_value != null ? fmtVal(res.threshold_value) : undefined}
        />
      </div>
    </div>
  )
}
