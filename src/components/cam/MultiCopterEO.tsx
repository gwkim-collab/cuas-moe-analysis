import type { CUASTelemetry } from '../../types'
import { INCHEON } from '../../mockData'
import { u10Position } from '../../u10Trajectory'

interface Props { tel: CUASTelemetry }

/**
 * MC-01's downward-pointing EO/IR camera (gimbal nadir).
 *
 * Top-down view from 45m AGL. Field of view ~120° = covers about 2km
 * across the ground. Renders the protected zone with all entities
 * positioned by their lat/lon offset from the multicopter.
 */
export default function MultiCopterEO({ tel }: Props) {
  const VB = 300
  const CX = 150
  const CY = 150

  const mc = tel.vehicles[20]
  if (!mc?.position) return <svg className="mc-svg" viewBox={`0 0 ${VB} ${VB}`} />

  const mcLat = mc.position.lat_deg
  const mcLon = mc.position.lon_deg

  // FOV: 1.6km across the SVG width (a bit zoomed in vs PPI's 10km).
  // 1° lat ≈ 111km · 1° lon at 37.5° ≈ 88km
  const FOV_M = 1600
  const PX_PER_M_LAT = VB / FOV_M
  const M_PER_DEG_LAT = 111_000
  const M_PER_DEG_LON = 88_000

  function project(lat: number, lon: number): [number, number] {
    const dLat = (lat - mcLat) * M_PER_DEG_LAT
    const dLon = (lon - mcLon) * M_PER_DEG_LON
    return [CX + dLon * PX_PER_M_LAT, CY - dLat * PX_PER_M_LAT]
  }

  const trackId = tel.kill_chain.target_track_id
  const track = trackId ? tel.tracks[trackId] : null
  const phase = tel.kill_chain.phase

  // VIP
  const [vipX, vipY] = project(INCHEON.vip_lat, INCHEON.vip_lon)
  // AB-U10 — shared trajectory model
  const u10Pos = u10Position(tel)
  const [u10X, u10Y] = project(u10Pos[0], u10Pos[1])
  // Hostile
  const trackProj = track ? project(track.lat_deg, track.lon_deg) : null

  return (
    <svg className="mc-svg" viewBox={`0 0 ${VB} ${VB}`} preserveAspectRatio="xMidYMid slice">
      {/* IR/EO false-color background gradient (warmer near MC = downwash signature) */}
      <defs>
        <radialGradient id="mcBg" cx="50%" cy="50%" r="60%">
          <stop offset="0%"  stopColor="#1a2438" stopOpacity="1" />
          <stop offset="60%" stopColor="#0a1322" stopOpacity="1" />
          <stop offset="100%" stopColor="#040810" stopOpacity="1" />
        </radialGradient>
        {/* darkening vignette toward edges — feels more like a real camera */}
        <radialGradient id="mcVignette" cx="50%" cy="50%" r="60%">
          <stop offset="60%"  stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.85)" />
        </radialGradient>
        {/* IR thermal hot-spot (rendered around the hostile drone) */}
        <radialGradient id="thermalHot" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,200,80,0.85)" />
          <stop offset="40%"  stopColor="rgba(255,90,30,0.45)" />
          <stop offset="100%" stopColor="rgba(255,90,30,0)" />
        </radialGradient>
        {/* scanline / grain texture */}
        <pattern id="mcScanlines" width="2" height="3" patternUnits="userSpaceOnUse">
          <rect width="2" height="3" fill="rgba(255,255,255,0.018)" />
          <line x1="0" y1="0" x2="2" y2="0" stroke="rgba(255,255,255,0.06)" strokeWidth="0.3" />
        </pattern>
        {/* subtle noise speckle */}
        <pattern id="mcNoise" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="rgba(255,255,255,0)" />
          {Array.from({ length: 12 }).map((_, i) => {
            const x = (i * 17) % 40
            const y = (i * 29) % 40
            const o = 0.03 + (i % 3) * 0.02
            return <rect key={i} x={x} y={y} width="0.6" height="0.6" fill={`rgba(255,255,255,${o})`} />
          })}
        </pattern>
      </defs>

      {/* Real mission scene background (Airbility AB-U60 disaster mission render).
          Adds visceral "this is a real EO/IR feed" quality vs synthetic gradient. */}
      <image
        href="/brand/mc_scene.jpg"
        x="0"
        y="0"
        width={VB}
        height={VB}
        preserveAspectRatio="xMidYMid slice"
      />
      {/* Cool tint over the photo so it reads as IR/EO sensor + matches the dark UI */}
      <rect x="0" y="0" width={VB} height={VB} fill="url(#mcBg)" opacity="0.55" />
      <rect x="0" y="0" width={VB} height={VB} fill="url(#mcNoise)" />
      <rect x="0" y="0" width={VB} height={VB} fill="url(#mcScanlines)" />

      {/* compass rose · north-up */}
      <line x1={CX} y1={8} x2={CX} y2={20} stroke="rgba(155,107,255,0.4)" strokeWidth="0.8" />
      <text x={CX} y={28} textAnchor="middle"
            fontFamily="var(--mono)" fontSize="7" fill="rgba(155,107,255,0.6)">N</text>

      {/* VIP marker */}
      <g transform={`translate(${vipX} ${vipY})`}>
        <circle r={10} fill="none" stroke="rgba(0,232,122,0.4)" strokeWidth="0.8" />
        <circle r={4}  fill="#00e87a" />
        <text y={-12} textAnchor="middle"
              fontFamily="var(--mono)" fontSize="5.5" fill="#00e87a">VIP</text>
      </g>

      {/* AB-U10 marker */}
      <g transform={`translate(${u10X} ${u10Y})`}>
        <rect x={-4} y={-4} width={8} height={8} fill="#00e87a" />
        <text y={-7} textAnchor="middle"
              fontFamily="var(--mono)" fontSize="5.5" fill="#00e87a">U10</text>
      </g>

      {/* Hostile track — IR thermal hot-spot + sensor ring */}
      {track && trackProj && (
        <g transform={`translate(${trackProj[0]} ${trackProj[1]})`}>
          {/* Thermal glow (IR signature) — only while hot (still flying) */}
          {track.ground_speed_m_s > 0 && (
            <circle r={20} fill="url(#thermalHot)" />
          )}
          <circle r={9} fill="none"
                  stroke={track.ground_speed_m_s === 0 ? 'rgba(122,138,158,0.5)' : 'rgba(255,61,85,0.55)'}
                  strokeWidth="0.8"
                  className={track.ground_speed_m_s > 0 ? 'mc-target-pulse' : ''} />
          <circle r={3.5} fill={track.ground_speed_m_s === 0 ? '#7a8a9e' : '#ff3d55'} />
          <text y={-12} textAnchor="middle"
                fontFamily="var(--mono)" fontSize="5.5"
                fill={track.ground_speed_m_s === 0 ? '#7a8a9e' : '#ff3d55'}>
            {track.ground_speed_m_s === 0 ? 'DOWNED' : 'HOSTILE'}
          </text>
        </g>
      )}

      {/* center reticle (gimbal lookpoint) */}
      <g stroke="rgba(155,107,255,0.55)" strokeWidth="0.7" fill="none">
        <line x1={CX - 12} y1={CY} x2={CX - 4} y2={CY} />
        <line x1={CX + 12} y1={CY} x2={CX + 4} y2={CY} />
        <line x1={CX} y1={CY - 12} x2={CX} y2={CY - 4} />
        <line x1={CX} y1={CY + 12} x2={CX} y2={CY + 4} />
        <circle cx={CX} cy={CY} r={1.5} fill="rgba(155,107,255,0.7)" />
      </g>

      {/* corner brackets */}
      {[
        [10, 10, 'tl'], [VB - 10, 10, 'tr'],
        [10, VB - 10, 'bl'], [VB - 10, VB - 10, 'br'],
      ].map(([x, y, k]) => (
        <CornerBracket key={k as string} x={x as number} y={y as number} k={k as string} />
      ))}

      {/* phase-tagged annotation in upper-left */}
      <text x={8} y={42} fontFamily="var(--mono)" fontSize="6" fill="rgba(155,107,255,0.55)">
        EO · 3.2× · GIMBAL NADIR
      </text>
      <text x={8} y={50} fontFamily="var(--mono)" fontSize="5.5" fill="rgba(155,107,255,0.4)">
        ALT 45m · {mcLat.toFixed(4)}°N
      </text>

      {/* REC indicator */}
      <g transform={`translate(${VB - 28} ${28})`}>
        <circle cx={0} cy={0} r={2.5} fill="#ff3d55" className="rec-pulse" />
        <text x={5} y={2.5} fontFamily="var(--mono)" fontSize="6" fill="#ff3d55">REC</text>
      </g>

      {/* phase indicator bottom-center */}
      <text x={CX} y={VB - 8} textAnchor="middle"
            fontFamily="var(--mono)" fontSize="5.5"
            fill="rgba(155,107,255,0.5)">
        {phase.toUpperCase()} · TRACKING {track ? '1' : '0'} OBJ
      </text>

      {/* vignette · drawn last so it's on top */}
      <rect x="0" y="0" width={VB} height={VB} fill="url(#mcVignette)" pointerEvents="none" />
    </svg>
  )
}

function CornerBracket({ x, y, k }: { x: number; y: number; k: string }) {
  const len = 8
  const sx = k === 'tl' || k === 'bl' ? 1 : -1
  const sy = k === 'tl' || k === 'tr' ? 1 : -1
  return (
    <g stroke="rgba(155,107,255,0.5)" strokeWidth="0.8">
      <line x1={x} y1={y} x2={x + sx * len} y2={y} />
      <line x1={x} y1={y} x2={x} y2={y + sy * len} />
    </g>
  )
}

