import type { HistBin } from '../../analysis'

interface Props {
  bins: HistBin[]
  /** Optional vertical marker (e.g. the mean), in the same 0..1 x-domain. */
  markerX?: number
  markerLabel?: string
}

// Compact responsive SVG histogram over the [0,1] P_negate domain.
// Styling stays inside the Airbility token palette (Olo accent + ink).
const W = 320
const H = 150
const PAD_L = 30
const PAD_B = 22
const PAD_T = 10
const PAD_R = 8

export default function Histogram({ bins, markerX, markerLabel }: Props) {
  const maxCount = Math.max(1, ...bins.map((b) => b.count))
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const x0 = PAD_L
  const y0 = PAD_T + plotH

  const barW = plotW / bins.length

  return (
    <svg
      className="an-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="P_negate 분포 히스토그램"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* y gridlines + labels (0, 50%, 100% of maxCount) */}
      {[0, 0.5, 1].map((f) => {
        const y = y0 - f * plotH
        return (
          <g key={f}>
            <line x1={x0} y1={y} x2={x0 + plotW} y2={y} className="an-chart-grid" />
            <text x={x0 - 4} y={y + 3} className="an-chart-ylabel" textAnchor="end">
              {Math.round(f * maxCount)}
            </text>
          </g>
        )
      })}

      {/* bars */}
      {bins.map((b, i) => {
        const h = (b.count / maxCount) * plotH
        return (
          <rect
            key={i}
            x={x0 + i * barW + 0.5}
            y={y0 - h}
            width={Math.max(0.5, barW - 1)}
            height={h}
            className="an-chart-bar"
          />
        )
      })}

      {/* x axis */}
      <line x1={x0} y1={y0} x2={x0 + plotW} y2={y0} className="an-chart-axis" />
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={x0 + f * plotW} y={H - 6} className="an-chart-xlabel" textAnchor="middle">
          {Math.round(f * 100)}%
        </text>
      ))}

      {/* mean / marker line */}
      {markerX != null && (
        <g>
          <line
            x1={x0 + markerX * plotW}
            y1={PAD_T}
            x2={x0 + markerX * plotW}
            y2={y0}
            className="an-chart-marker"
          />
          {markerLabel && (
            <text
              x={x0 + markerX * plotW}
              y={PAD_T + 8}
              className="an-chart-marker-label"
              textAnchor="middle"
            >
              {markerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  )
}
