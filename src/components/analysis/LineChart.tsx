interface Point {
  x: number
  y: number
}

interface Props {
  points: Point[]
  /** Y domain (default [0,1] for probabilities). */
  yDomain?: [number, number]
  xLabel?: string
  /** Optional horizontal target line in y units. */
  targetY?: number
  /** Optional vertical marker in x units (e.g. a solved threshold). */
  markerX?: number
  markerLabel?: string
  /** Format an x tick value. */
  formatX?: (v: number) => string
}

const W = 340
const H = 180
const PAD_L = 34
const PAD_B = 26
const PAD_T = 12
const PAD_R = 12

export default function LineChart({
  points,
  yDomain = [0, 1],
  xLabel,
  targetY,
  markerX,
  markerLabel,
  formatX = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)),
}: Props) {
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const x0 = PAD_L
  const y0 = PAD_T + plotH

  const xs = points.map((p) => p.x)
  const xmin = Math.min(...xs)
  const xmax = Math.max(...xs)
  const [ymin, ymax] = yDomain
  const xSpan = xmax - xmin || 1
  const ySpan = ymax - ymin || 1

  const sx = (x: number) => x0 + ((x - xmin) / xSpan) * plotW
  const sy = (y: number) => y0 - ((y - ymin) / ySpan) * plotH

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')

  return (
    <svg
      className="an-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="파라미터 스윕 곡선"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* y gridlines + labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => {
        const yv = ymin + f * ySpan
        const y = sy(yv)
        return (
          <g key={f}>
            <line x1={x0} y1={y} x2={x0 + plotW} y2={y} className="an-chart-grid" />
            <text x={x0 - 4} y={y + 3} className="an-chart-ylabel" textAnchor="end">
              {Math.round(yv * 100)}%
            </text>
          </g>
        )
      })}

      {/* target line */}
      {targetY != null && (
        <line x1={x0} y1={sy(targetY)} x2={x0 + plotW} y2={sy(targetY)} className="an-chart-target" />
      )}

      {/* series */}
      <path d={path} className="an-chart-line" fill="none" />

      {/* marker */}
      {markerX != null && (
        <g>
          <line x1={sx(markerX)} y1={PAD_T} x2={sx(markerX)} y2={y0} className="an-chart-marker" />
          {markerLabel && (
            <text x={sx(markerX)} y={PAD_T + 8} className="an-chart-marker-label" textAnchor="middle">
              {markerLabel}
            </text>
          )}
        </g>
      )}

      {/* x axis + ticks */}
      <line x1={x0} y1={y0} x2={x0 + plotW} y2={y0} className="an-chart-axis" />
      {[0, 0.5, 1].map((f) => {
        const xv = xmin + f * xSpan
        return (
          <text key={f} x={sx(xv)} y={H - 10} className="an-chart-xlabel" textAnchor="middle">
            {formatX(xv)}
          </text>
        )
      })}
      {xLabel && (
        <text x={x0 + plotW / 2} y={H - 1} className="an-chart-axistitle" textAnchor="middle">
          {xLabel}
        </text>
      )}
    </svg>
  )
}
