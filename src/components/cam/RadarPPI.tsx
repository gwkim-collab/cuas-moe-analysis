import { useMemo } from 'react'
import type { CUASTelemetry } from '../../types'

interface Props { tel: CUASTelemetry }

/**
 * Plan Position Indicator (PPI) — classic radar scope display.
 *
 * Concentric range rings (1km/2km/5km), bearing crosshairs, animated sweep,
 * and live track dots. Track positions come from tel.tracks (range_m +
 * bearing_deg from VIP).
 */
export default function RadarPPI({ tel }: Props) {
  // viewBox 0..300 · center 150,150 · 5km = radius 140
  const VB = 300
  const CX = 150
  const CY = 150
  const R_MAX = 140
  const PX_PER_M = R_MAX / 5000

  const tracks = useMemo(() => Object.values(tel.tracks), [tel.tracks])

  return (
    <svg className="ppi-svg" viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="xMidYMid meet">
      {/* background grid */}
      <defs>
        <radialGradient id="ppiBg" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#0a1928" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#050a14" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="rgba(59,142,255,0.6)" />
          <stop offset="80%" stopColor="rgba(59,142,255,0.05)" />
          <stop offset="100%" stopColor="rgba(59,142,255,0)" />
        </radialGradient>
      </defs>

      {/* clipping circle so sweep stays inside the scope */}
      <clipPath id="ppiClip">
        <circle cx={CX} cy={CY} r={R_MAX} />
      </clipPath>

      <circle cx={CX} cy={CY} r={R_MAX} fill="url(#ppiBg)" />

      {/* range rings */}
      {[0.2, 0.4, 0.6, 0.8, 1.0].map((f, i) => (
        <circle
          key={i}
          cx={CX}
          cy={CY}
          r={R_MAX * f}
          fill="none"
          stroke="rgba(59,142,255,0.18)"
          strokeWidth="0.6"
          strokeDasharray={i % 2 === 0 ? '2 3' : undefined}
        />
      ))}

      {/* bearing crosshairs */}
      <line x1={CX - R_MAX} y1={CY} x2={CX + R_MAX} y2={CY}
            stroke="rgba(59,142,255,0.18)" strokeWidth="0.6" />
      <line x1={CX} y1={CY - R_MAX} x2={CX} y2={CY + R_MAX}
            stroke="rgba(59,142,255,0.18)" strokeWidth="0.6" />

      {/* range labels */}
      {[1, 2, 5].map((km) => {
        const r = (km / 5) * R_MAX
        return (
          <text key={km} x={CX + r + 2} y={CY - 2}
                fontFamily="var(--mono)" fontSize="6"
                fill="rgba(59,142,255,0.5)">{km}km</text>
        )
      })}

      {/* compass labels */}
      <text x={CX} y={CY - R_MAX - 2} textAnchor="middle"
            fontFamily="var(--mono)" fontSize="7" fill="rgba(59,142,255,0.6)">N</text>
      <text x={CX + R_MAX + 6} y={CY + 2} textAnchor="middle"
            fontFamily="var(--mono)" fontSize="7" fill="rgba(59,142,255,0.45)">E</text>
      <text x={CX} y={CY + R_MAX + 8} textAnchor="middle"
            fontFamily="var(--mono)" fontSize="7" fill="rgba(59,142,255,0.45)">S</text>
      <text x={CX - R_MAX - 6} y={CY + 2} textAnchor="middle"
            fontFamily="var(--mono)" fontSize="7" fill="rgba(59,142,255,0.45)">W</text>

      {/* rotating sweep — wrapped in a g with CSS animation */}
      <g clipPath="url(#ppiClip)" className="ppi-sweep">
        <path
          d={`M ${CX} ${CY} L ${CX + R_MAX} ${CY} A ${R_MAX} ${R_MAX} 0 0 1 ${CX + R_MAX * Math.cos(Math.PI / 6)} ${CY - R_MAX * Math.sin(Math.PI / 6)} Z`}
          fill="url(#sweepGrad)"
          opacity="0.7"
        />
      </g>

      {/* tracks */}
      {tracks.map((t) => {
        const r = Math.min(R_MAX, t.range_m * PX_PER_M)
        const rad = (t.bearing_deg * Math.PI) / 180
        const x = CX + r * Math.sin(rad)
        const y = CY - r * Math.cos(rad)
        const isHostile = t.classification === 'hostile_fpv'
        const isDowned = t.ground_speed_m_s === 0
        const color = isDowned ? '#7a8a9e' : isHostile ? '#ff3d55' : '#ffb020'

        return (
          <g key={t.track_id}>
            {/* persistence (afterglow) */}
            {!isDowned && (
              <circle cx={x} cy={y} r={6} fill={color} opacity="0.18" />
            )}
            {/* track diamond */}
            <g transform={`translate(${x} ${y}) rotate(45)`}>
              <rect x={-3.5} y={-3.5} width={7} height={7}
                    fill={isDowned ? 'transparent' : color}
                    stroke={color} strokeWidth="1" />
            </g>
            {/* label */}
            <text x={x + 8} y={y - 4}
                  fontFamily="var(--mono)" fontSize="5.5"
                  fill={color}>
              {t.track_id}
            </text>
            <text x={x + 8} y={y + 3}
                  fontFamily="var(--mono)" fontSize="5"
                  fill={color} opacity="0.7">
              {(t.range_m / 1000).toFixed(2)}km · {t.bearing_deg.toFixed(0)}°
            </text>
          </g>
        )
      })}

      {/* center pip — VIP / radar origin */}
      <circle cx={CX} cy={CY} r="2" fill="#00e87a" />
    </svg>
  )
}
