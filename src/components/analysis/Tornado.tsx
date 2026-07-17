import type { SensitivityRow } from '../../analysis'

interface Props {
  rows: SensitivityRow[]
}

function pctpt(x: number): string {
  const v = x * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`
}

// Horizontal tornado: each parameter's bar spans [low_metric, high_metric]
// across the 0..100% P_negate axis, with a tick at the baseline metric.
export default function Tornado({ rows }: Props) {
  return (
    <div className="an-tornado">
      {rows.map((r) => {
        const lo = Math.min(r.low_metric, r.high_metric)
        const hi = Math.max(r.low_metric, r.high_metric)
        const left = lo * 100
        const width = Math.max(0.5, (hi - lo) * 100)
        const basePos = r.base_metric * 100
        return (
          <div className="an-torn-row" key={r.key}>
            <div className="an-torn-label" title={r.key}>{r.label}</div>
            <div className="an-torn-track">
              <div className="an-torn-bar" style={{ left: `${left}%`, width: `${width}%` }} />
              <div className="an-torn-base" style={{ left: `${basePos}%` }} />
            </div>
            <div className="an-torn-impact">{pctpt(r.impact)}</div>
          </div>
        )
      })}
      <div className="an-torn-axis">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  )
}
