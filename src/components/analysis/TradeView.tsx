import { useMemo, useState } from 'react'
import {
  PARAMS,
  getParam,
  sweep1D,
  sweep2D,
  tornado,
  type Scenario,
} from '../../analysis'
import LineChart from './LineChart'
import Heatmap from './Heatmap'
import Tornado from './Tornado'

interface Props {
  scenario: Scenario
}

function ParamSelect({
  value,
  onChange,
  exclude,
}: {
  value: string
  onChange: (k: string) => void
  exclude?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {PARAMS.filter((p) => p.key !== exclude).map((p) => (
        <option key={p.key} value={p.key}>
          {p.label}
          {p.unit ? ` (${p.unit})` : ''}
        </option>
      ))}
    </select>
  )
}

export default function TradeView({ scenario }: Props) {
  const [xKey, setXKey] = useState('sensor.ref_detection_range_m')
  const [yKey, setYKey] = useState('c2.decision_latency_s')
  const [is2D, setIs2D] = useState(false)
  const [fraction, setFraction] = useState(0.2)

  const xParam = getParam(xKey)!
  const yParam = getParam(yKey)!

  const sweep = useMemo(
    () => sweep1D(scenario, xParam, { steps: 60 }),
    [scenario, xParam],
  )
  const grid = useMemo(
    () => (is2D ? sweep2D(scenario, xParam, yParam, { xSteps: 26, ySteps: 26 }) : null),
    [scenario, xParam, yParam, is2D],
  )
  const torn = useMemo(() => tornado(scenario, fraction), [scenario, fraction])

  return (
    <div className="an-results">
      <div className="an-card">
        <div className="an-trade-controls">
          <label>
            X 파라미터
            <ParamSelect value={xKey} onChange={setXKey} exclude={is2D ? yKey : undefined} />
          </label>
          <label className="an-check">
            <input type="checkbox" checked={is2D} onChange={(e) => setIs2D(e.target.checked)} />
            2D 히트맵
          </label>
          {is2D && (
            <label>
              Y 파라미터
              <ParamSelect value={yKey} onChange={setYKey} exclude={xKey} />
            </label>
          )}
        </div>
        <div className="ab-label">
          {is2D ? '2D 스윕 · P_NEGATE' : 'P_NEGATE vs ' + xParam.label}
        </div>
        {is2D && grid ? (
          <Heatmap grid={grid} xParam={xParam} yParam={yParam} />
        ) : (
          <LineChart
            points={sweep}
            xLabel={`${xParam.label}${xParam.unit ? ` (${xParam.unit})` : ''}`}
          />
        )}
      </div>

      <div className="an-card">
        <div className="an-trade-controls">
          <div className="ab-label">민감도 · 토네이도</div>
          <label>
            섭동 ±
            <input
              type="number"
              min={0.05}
              max={0.9}
              step={0.05}
              value={fraction}
              onChange={(e) => setFraction(Math.max(0.01, parseFloat(e.target.value) || 0.2))}
            />
          </label>
        </div>
        <div className="an-gate-note ab-small">
          각 파라미터를 현재값 ±{(fraction * 100).toFixed(0)}%로 흔들었을 때 P_negate 변동폭 (큰 순)
        </div>
        <Tornado rows={torn} />
      </div>
    </div>
  )
}
