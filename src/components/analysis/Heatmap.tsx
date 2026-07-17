import type { Sweep2DResult, ParamDef } from '../../analysis'

interface Props {
  grid: Sweep2DResult
  xParam: ParamDef
  yParam: ParamDef
}

const W = 340
const H = 220
const PAD_L = 40
const PAD_B = 30
const PAD_T = 10
const PAD_R = 12

function fmt(v: number): string {
  return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(2)
}

// SVG heatmap of a 2-parameter P_negate sweep. Cell intensity = P_negate
// (Olo accent alpha), so brighter = better negation.
export default function Heatmap({ grid, xParam, yParam }: Props) {
  const plotW = W - PAD_L - PAD_R
  const plotH = H - PAD_T - PAD_B
  const nx = grid.xs.length
  const ny = grid.ys.length
  const cw = plotW / nx
  const ch = plotH / ny

  return (
    <svg className="an-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="2D 파라미터 히트맵" preserveAspectRatio="xMidYMid meet">
      {grid.z.map((row, j) =>
        row.map((v, i) => {
          // y axis increases upward → row 0 (min y) at the bottom.
          const x = PAD_L + i * cw
          const y = PAD_T + (ny - 1 - j) * ch
          const alpha = 0.1 + 0.9 * v // P_negate already 0..1
          return (
            <rect
              key={`${i}-${j}`}
              x={x}
              y={y}
              width={cw + 0.5}
              height={ch + 0.5}
              fill="#00FFBC"
              opacity={alpha}
            />
          )
        }),
      )}
      {/* axis frame */}
      <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} className="an-chart-frame" fill="none" />
      {/* x labels */}
      <text x={PAD_L} y={H - 14} className="an-chart-xlabel" textAnchor="start">{fmt(grid.xs[0])}</text>
      <text x={PAD_L + plotW} y={H - 14} className="an-chart-xlabel" textAnchor="end">{fmt(grid.xs[nx - 1])}</text>
      <text x={PAD_L + plotW / 2} y={H - 2} className="an-chart-axistitle" textAnchor="middle">{xParam.label}{xParam.unit ? ` (${xParam.unit})` : ''}</text>
      {/* y labels */}
      <text x={PAD_L - 4} y={PAD_T + plotH} className="an-chart-ylabel" textAnchor="end">{fmt(grid.ys[0])}</text>
      <text x={PAD_L - 4} y={PAD_T + 8} className="an-chart-ylabel" textAnchor="end">{fmt(grid.ys[ny - 1])}</text>
      <text x={10} y={PAD_T + plotH / 2} className="an-chart-axistitle" textAnchor="middle" transform={`rotate(-90 10 ${PAD_T + plotH / 2})`}>{yParam.label}</text>
    </svg>
  )
}
