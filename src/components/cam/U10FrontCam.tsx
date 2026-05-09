import type { CUASTelemetry } from '../../types'
import { PHASE_SCHEDULE } from '../../scenario'
import { u10Position, u10HeadingDeg, u10Altitude } from '../../u10Trajectory'
import MiniSceneView from './MiniSceneView'

// Bearing from (lat1, lon1) to (lat2, lon2) in degrees [0, 360).
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Great-circle horizontal distance in meters.
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const dφ = ((lat2 - lat1) * Math.PI) / 180
  const dλ = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

interface Props { tel: CUASTelemetry }

/**
 * AB-U10's forward-facing EO camera with AI tracker.
 *
 * Renders an artificial horizon (pitch/roll-aware), a center reticle, and
 * an AI tracker bounding box on the hostile FPV target during LAUNCH/CAPTURE.
 * HUD overlays show airspeed/alt/range/ETA.
 */
export default function U10FrontCam({ tel }: Props) {
  const VB_W = 320
  const VB_H = 280

  const u10 = tel.vehicles[10]
  const phase = tel.kill_chain.phase
  const trackId = tel.kill_chain.target_track_id
  const track = trackId ? tel.tracks[trackId] : null
  const sol = tel.intercept_solution

  const isFlying = phase === 'launch' || phase === 'capture'
  const showLockOn = isFlying && track && track.ground_speed_m_s > 0
  const isAfterEngagement = phase === 'report'

  // ── AI tracker box dynamics ──────────────────────────────────
  // Pitch / roll / synthetic horizon are now handled by the Mini
  // Cesium scene rendered behind us — the U10's pose translates into
  // real camera motion against actual terrain. We only render the
  // SVG overlay (track box, reticle, HUD) on top.
  // Behavioral approximation (not full 3D math): the threat ingresses
  // from NW relative to AB-U10's standby pad. As AB-U10 launches and
  // swings into the 6 o'clock approach, the target appears in the
  // upper-right of the camera frame and migrates toward center as the
  // AI lock tightens. Captured (and centered) at engagement.
  const t = tel.scenario_clock_ms / 1000

  // ── True U10→threat geometry (slant range + bearing + elevation) ─
  // Box position, size, and AI lock state all derive from the actual
  // 3D vector from the AB-U10 to the target — not from VIP→threat
  // distance (which is what `track.range_m` is). This is what makes
  // the tracker feel like it's actually looking at the drone vs.
  // approximating its position.
  let angularOffsetDeg = 0
  let elevationDeg = 0
  let slantRangeM = Infinity
  if (track && (phase === 'launch' || phase === 'capture')) {
    const u10ll = u10Position(tel)
    const u10alt = u10Altitude(tel)
    const u10Heading = u10HeadingDeg(tel)
    const horizDist = haversineM(u10ll[0], u10ll[1], track.lat_deg, track.lon_deg)
    const altDiff = track.alt_m_agl - u10alt
    slantRangeM = Math.sqrt(horizDist * horizDist + altDiff * altDiff)
    const threatBearing = bearingDeg(u10ll[0], u10ll[1], track.lat_deg, track.lon_deg)
    // Normalize horizontal angle delta to [-180, 180]
    angularOffsetDeg = ((threatBearing - u10Heading + 540) % 360) - 180
    // Vertical angle: positive when threat is ABOVE U10 (atop the gimbal).
    elevationDeg = (Math.atan2(altDiff, Math.max(1, horizDist)) * 180) / Math.PI
  }

  // ── Range-based acquire ramp ────────────────────────────────
  // Driven by the true slant range so the band thresholds reflect the
  // actual sensor pickup distance.
  //   slant > 1500m : SEARCHING — no box
  //   1500..900m    : ACQUIRING — flickering, sub-stable box
  //   900..400m     : TRACKING  — solid lock building
  //   < 400m        : LOCK      — full confidence
  const acquireBase =
    slantRangeM > 1500
      ? 0
      : slantRangeM > 900
        ? 0.15 + 0.15 * ((1500 - slantRangeM) / 600)
        : slantRangeM > 400
          ? 0.30 + 0.65 * ((900 - slantRangeM) / 500)
          : 1.0
  // Flicker during ACQUIRING — random-ish dropouts simulate the AI
  // re-acquiring as the target moves through clutter. Smooth from a
  // pair of sines so it stays deterministic.
  const flickerActive = slantRangeM <= 1500 && slantRangeM > 900
  const flicker = flickerActive
    ? 0.5 + 0.5 * Math.sin(t * 9.3) * Math.cos(t * 4.1)
    : 1
  const acquireRamp =
    phase === 'launch'
      ? acquireBase * flicker
      : phase === 'capture' || phase === 'report'
        ? 1
        : 0

  // ── Project geometry onto screen ────────────────────────────
  // Horizontal: angular offset from U10 forward → screen X.
  // Vertical:   elevation angle → screen Y (negative = up on screen).
  // FOV split is a typical EO gimbal: ~100° horizontal × ~70° vertical.
  const FOV_HALF_H_DEG = 50
  const FOV_HALF_V_DEG = 35
  const driftXFromBearing = (angularOffsetDeg / FOV_HALF_H_DEG) * (VB_W / 2)
  const driftYFromElevation = -(elevationDeg / FOV_HALF_V_DEG) * (VB_H / 2)
  const driftX = Math.max(-VB_W * 0.45, Math.min(VB_W * 0.45, driftXFromBearing))
  const driftY = Math.max(-VB_H * 0.45, Math.min(VB_H * 0.45, driftYFromElevation))

  // ── Tracker jitter — minimal once locked ────────────────────
  // ACQUIRING jitter simulates a sensor still hunting; once the AI
  // settles into TRACKING/LOCK the box is rock-steady (matches real
  // EO/IR tracker footage).
  const jitterAmp =
    acquireRamp >= 0.95 ? 0.4 :
    acquireRamp >= 0.5  ? 1.2 :
                          2.5
  const jitterX = Math.sin(t * 1.3) * jitterAmp + Math.sin(t * 4.2) * (jitterAmp * 0.25)
  const jitterY = Math.cos(t * 0.9) * (jitterAmp * 0.6) + Math.cos(t * 3.7) * (jitterAmp * 0.2)

  const boxX = VB_W / 2 + driftX + jitterX
  const boxY = VB_H / 2 + driftY + jitterY

  // Apparent angular size grows as 1/range — using true slant range.
  const baseBoxSize = showLockOn ? Math.min(110, 5000 / Math.max(80, slantRangeM)) : 0
  const boxSize = baseBoxSize * acquireRamp
  const boxOpacity = acquireRamp

  // Tracker label · driven by range, matching the acquire ramp's bands.
  const aiState =
    phase === 'launch'
      ? slantRangeM > 1500
        ? 'AI · SEARCH'
        : slantRangeM > 900
          ? 'AI · ACQUIRING'
          : slantRangeM > 400
            ? 'AI · TRACKING'
            : 'AI · LOCK'
      : phase === 'capture'
        ? 'AI · LOCK'
        : 'STANDBY'

  // Lock-state visual — color, stroke style, and pulse intensity escalate
  // from acquiring (white dashed) → tracking (amber solid) → lock
  // (red bold + flash). Operator reads "is the AI ready to fire" at
  // a glance from the box itself, not just the text label.
  const isLockState =
    phase === 'capture' || (phase === 'launch' && slantRangeM <= 400)
  const isTrackingState = phase === 'launch' && slantRangeM > 400 && slantRangeM <= 900
  const isAcquiringState = phase === 'launch' && slantRangeM > 900 && slantRangeM <= 1500
  const boxColor = isLockState
    ? '#ff3d55'                      // red · LOCK
    : isTrackingState
      ? '#ffb020'                    // amber · TRACKING
      : isAcquiringState
        ? '#ffffff'                  // white · ACQUIRING
        : '#ffffff'                  // fallback
  const boxStrokeWidth = isLockState ? 1.8 : isTrackingState ? 1.4 : 1.0
  const boxDash = isAcquiringState ? '4 3' : undefined
  const boxClass = isLockState
    ? 'u10-track-box u10-track-box-lock'   // faster/stronger pulse
    : 'u10-track-box'

  // Airframe shake during launch (vibration cue).
  const shakeClass = phase === 'launch' ? 'u10-shake' : ''

  // ── Engagement instant · NET / EXPLOSION overlays ────────────
  // Both run for ~1.5s after capture begins. Net gun: a mesh square
  // expanding from 0 → 110px around the AI tracker box. Shotgun: a
  // bright flash + radial scatter centered on the box.
  const engageProgress =
    phase === 'capture'
      ? Math.min(1, Math.max(0, (tel.scenario_clock_ms - PHASE_SCHEDULE.capture) / 1500))
      : 0
  const showEngage = phase === 'capture' && engageProgress > 0 && engageProgress < 1

  // ease-out-cubic so the effect grows fast then settles
  const eU = 1 - Math.pow(1 - engageProgress, 3)
  // opacity: ramps in 0..0.15, holds, then fades out from 0.6..1.0
  const engageOpacity =
    engageProgress < 0.15
      ? engageProgress / 0.15
      : engageProgress > 0.6
        ? Math.max(0, 1 - (engageProgress - 0.6) / 0.4)
        : 1

  const isNet = tel.payload_mode === 'net_gun'
  const NET_PEAK_PX = 110
  const SHOT_PEAK_PX = 95
  const netHalf = (NET_PEAK_PX / 2) * eU
  const shotR = SHOT_PEAK_PX * eU

  // ── CV keypoint dots ─────────────────────────────────────────
  // Sparse green dots scattered across the frame, simulating feature
  // points from the on-board vision pipeline. Stable across frames
  // (no per-frame randomness) so the field doesn't shimmer; subtle
  // micro-motion from the t-driven phase keeps them feeling "live".
  const KEYPOINTS = [
    [0.12, 0.28], [0.18, 0.62], [0.07, 0.81], [0.31, 0.74], [0.42, 0.55],
    [0.58, 0.69], [0.66, 0.42], [0.74, 0.81], [0.83, 0.34], [0.91, 0.65],
    [0.22, 0.18], [0.49, 0.21], [0.78, 0.18], [0.94, 0.44], [0.05, 0.55],
  ] as const

  return (
    <div className={`u10-cam-wrap ${shakeClass}`}>
      {/* Live 3D Cesium scene from the U10's POV — sits behind everything */}
      <MiniSceneView />

      <svg className="u10-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
        {/* CV feature points — sparse green dots scattered across frame */}
        <g fill="rgba(0,232,122,0.6)">
          {KEYPOINTS.map(([fx, fy], i) => {
            // Tiny per-dot drift so they don't look painted on
            const dx = Math.sin(t * 0.7 + i * 1.3) * 0.4
            const dy = Math.cos(t * 0.5 + i * 0.9) * 0.4
            return (
              <circle
                key={i}
                cx={fx * VB_W + dx}
                cy={fy * VB_H + dy}
                r={0.9}
                opacity={0.5 + 0.3 * Math.sin(t * 1.1 + i)}
              />
            )
          })}
        </g>

        {/* center reticle */}
        <g stroke="rgba(0,232,122,0.7)" strokeWidth="0.9" fill="none">
          {/* crosshair */}
          <line x1={VB_W / 2 - 18} y1={VB_H / 2} x2={VB_W / 2 - 6} y2={VB_H / 2} />
          <line x1={VB_W / 2 + 18} y1={VB_H / 2} x2={VB_W / 2 + 6} y2={VB_H / 2} />
          <line x1={VB_W / 2} y1={VB_H / 2 - 18} x2={VB_W / 2} y2={VB_H / 2 - 6} />
          <line x1={VB_W / 2} y1={VB_H / 2 + 18} x2={VB_W / 2} y2={VB_H / 2 + 6} />
          <circle cx={VB_W / 2} cy={VB_H / 2} r={1.8} fill="rgba(0,232,122,0.85)" />
        </g>

        {/* AI tracker box on hostile FPV — color/style escalates with
            the lock state (white dashed → amber solid → red bold flash). */}
        {showLockOn && (
          <g opacity={boxOpacity}>
            {/* outer · pulsing */}
            <rect
              x={boxX - boxSize / 2}
              y={boxY - boxSize / 2}
              width={boxSize}
              height={boxSize}
              fill="none"
              stroke={boxColor}
              strokeWidth={boxStrokeWidth}
              strokeDasharray={boxDash}
              className={boxClass}
            />
            {/* corner brackets */}
            {[
              [boxX - boxSize / 2, boxY - boxSize / 2, 1, 1],
              [boxX + boxSize / 2, boxY - boxSize / 2, -1, 1],
              [boxX - boxSize / 2, boxY + boxSize / 2, 1, -1],
              [boxX + boxSize / 2, boxY + boxSize / 2, -1, -1],
            ].map(([x, y, sx, sy], i) => (
              <g key={i} stroke={boxColor} strokeWidth={isLockState ? 2.5 : 2}>
                <line x1={x} y1={y} x2={(x as number) + (sx as number) * 8} y2={y} />
                <line x1={x} y1={y} x2={x} y2={(y as number) + (sy as number) * 8} />
              </g>
            ))}
            {/* label above box */}
            <text x={boxX - boxSize / 2} y={boxY - boxSize / 2 - 4}
                  fontFamily="var(--mono)" fontSize="6"
                  fill={boxColor}
                  fontWeight={isLockState ? 700 : 400}>
              TGT · {trackId} · {(slantRangeM / 1000).toFixed(2)}km
            </text>
            {/* Threat silhouette inside box — simplified quadcopter
                from above (4 rotor disks on an X frame). Recognizable
                even at small sizes; scales with box size so the lock
                always frames the airframe sensibly. */}
            {(() => {
              const armR = Math.max(3, boxSize * 0.27)
              const rotorR = Math.max(1.2, boxSize * 0.10)
              const bodyR = Math.max(0.8, boxSize * 0.06)
              const stroke = Math.max(0.5, boxSize * 0.018)
              return (
                <g
                  transform={`translate(${boxX}, ${boxY})`}
                  stroke={boxColor}
                  fill="none"
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  opacity={0.95}
                >
                  {/* X-frame arms */}
                  <line x1={-armR} y1={-armR} x2={armR} y2={armR} />
                  <line x1={-armR} y1={armR} x2={armR} y2={-armR} />
                  {/* Rotor disks at arm ends */}
                  <circle cx={-armR} cy={-armR} r={rotorR} />
                  <circle cx={armR} cy={-armR} r={rotorR} />
                  <circle cx={-armR} cy={armR} r={rotorR} />
                  <circle cx={armR} cy={armR} r={rotorR} />
                  {/* Center body (filled) */}
                  <circle cx={0} cy={0} r={bodyR} fill={boxColor} stroke="none" />
                </g>
              )
            })()}
          </g>
        )}

        {/* ── Engagement instant · NET (mesh deploy) ───────────── */}
        {showEngage && isNet && (
          <g opacity={engageOpacity}>
            <defs>
              <pattern id="netMesh" x="0" y="0" width="7" height="7" patternUnits="userSpaceOnUse">
                <path d="M 7 0 L 0 0 0 7" fill="none"
                      stroke="#ffb020" strokeWidth="0.7" opacity="0.9" />
              </pattern>
            </defs>
            {/* mesh square deploying out from the AI box center */}
            <rect
              x={boxX - netHalf}
              y={boxY - netHalf}
              width={netHalf * 2}
              height={netHalf * 2}
              fill="url(#netMesh)"
              stroke="#ffb020"
              strokeWidth="1.4"
            />
            {/* corner cinches — the four weights at the net corners */}
            {[-1, 1].flatMap((sx) =>
              [-1, 1].map((sy) => (
                <circle
                  key={`${sx}${sy}`}
                  cx={boxX + sx * netHalf}
                  cy={boxY + sy * netHalf}
                  r={2.2}
                  fill="#ffb020"
                />
              )),
            )}
          </g>
        )}

        {/* ── Engagement instant · SHOT (explosion flash) ──────── */}
        {showEngage && !isNet && (
          <g opacity={engageOpacity}>
            {/* outer blast ring */}
            <circle
              cx={boxX} cy={boxY} r={shotR}
              fill="#ff7a3d" opacity="0.35"
            />
            {/* inner core */}
            <circle
              cx={boxX} cy={boxY} r={shotR * 0.45}
              fill="#ffeec0" opacity={Math.max(0, 1 - engageProgress * 1.6)}
            />
            {/* radial shrapnel lines */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
              const rad = (deg * Math.PI) / 180
              const inR = shotR * 0.5
              const outR = shotR * 1.05
              return (
                <line
                  key={i}
                  x1={boxX + Math.cos(rad) * inR}
                  y1={boxY + Math.sin(rad) * inR}
                  x2={boxX + Math.cos(rad) * outR}
                  y2={boxY + Math.sin(rad) * outR}
                  stroke="#ff7a3d"
                  strokeWidth="1.6"
                  opacity="0.85"
                />
              )
            })}
          </g>
        )}

        {/* corner brackets · viewfinder feel */}
        <g stroke="rgba(0,232,122,0.4)" strokeWidth="0.8">
          {[[8,8,1,1],[VB_W-8,8,-1,1],[8,VB_H-8,1,-1],[VB_W-8,VB_H-8,-1,-1]].map(([x,y,sx,sy],i)=>(
            <g key={i}>
              <line x1={x} y1={y} x2={(x as number)+(sx as number)*10} y2={y} />
              <line x1={x} y1={y} x2={x} y2={(y as number)+(sy as number)*10} />
            </g>
          ))}
        </g>
      </svg>

      {/* HUD overlays */}
      <div className="u10-hud-tl">
        <div>SPD <span className="hud-val">{u10?.vfr_hud?.airspeed_m_s?.toFixed(0) ?? 0}</span> m/s</div>
        <div>ALT <span className="hud-val">{u10?.vfr_hud?.alt_m?.toFixed(0) ?? 0}</span> m</div>
      </div>
      <div className="u10-hud-tr">
        {showLockOn && sol && (
          <>
            <div>RNG <span className="hud-val red">{(slantRangeM / 1000).toFixed(2)}</span> km</div>
            <div>ETA <span className="hud-val red">T+{sol.eta_to_capture_s}s</span></div>
          </>
        )}
        {!showLockOn && (
          <>
            <div>RNG <span className="hud-val dim">—</span></div>
            <div>ETA <span className="hud-val dim">—</span></div>
          </>
        )}
      </div>
      <div className="u10-hud-bl">
        EO · {phase === 'capture' ? 'AI LOCK · TRACKING' : phase === 'launch' ? aiState : isAfterEngagement ? 'POST-ENGAGE · RTB' : 'STANDBY'}
      </div>
      <div className="u10-hud-br">
        PAYLOAD · {tel.payload_mode === 'net_gun' ? 'NET' : 'SHOT'} · ARMED
      </div>

      {/* lock-on banner during capture */}
      {phase === 'capture' && (
        <div className="u10-lockon-banner">⚡ ENGAGEMENT WINDOW · LOCK</div>
      )}
      {phase === 'report' && (
        <div className="u10-lockon-banner success">✓ TARGET NEUTRALIZED</div>
      )}
    </div>
  )
}
