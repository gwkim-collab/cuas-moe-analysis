import type { CUASTelemetry } from '../../types'
import { PHASE_SCHEDULE } from '../../scenario'

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

  // ── Launch progress (0..1) drives the camera dynamics ────────
  // Used for pitch, roll (banking), and the AI box trajectory across
  // the field of view as AB-U10 swings around behind the threat.
  const launchProgress =
    phase === 'launch'
      ? Math.min(1, Math.max(0, (tel.scenario_clock_ms - 24_000) / 11_000))
      : phase === 'capture' || phase === 'report'
        ? 1
        : 0

  // Pitch: VTOL nose-up at takeoff (first 25%), gradual nose-down to
  // level for cruise. Matches the staged altitude profile in u10Trajectory.
  const pitchDeg =
    phase === 'launch'
      ? launchProgress < 0.25
        ? 18 * (launchProgress / 0.25)             // 0 → 18° during VTOL
        : launchProgress < 0.55
          ? 18 - 18 * ((launchProgress - 0.25) / 0.30)  // 18° → 0° climb-out
          : 0                                       // level cruise + turn
      : 0

  // Roll (banking): mostly flat during VTOL/climb-out (no horizontal
  // motion to bank into), then a held coordinated bank during the level
  // turn into 6-o'clock. Bank-in starts at ~55%, peaks at -22°, holds,
  // bank-out at ~95%.
  const rollDeg =
    phase === 'launch'
      ? launchProgress < 0.55
        ? 0
        : launchProgress < 0.65
          ? -22 * ((launchProgress - 0.55) / 0.10)             // bank-in
          : launchProgress < 0.92
            ? -22                                              // hold turn
            : -22 * (1 - (launchProgress - 0.92) / 0.08)       // bank-out
      : 0

  // ── AI tracker box dynamics ──────────────────────────────────
  // Behavioral approximation (not full 3D math): the threat ingresses
  // from NW relative to AB-U10's standby pad. As AB-U10 launches and
  // swings into the 6 o'clock approach, the target appears in the
  // upper-right of the camera frame and migrates toward center as the
  // AI lock tightens. Captured (and centered) at engagement.
  const t = tel.scenario_clock_ms / 1000

  // ── Range-based acquire ramp ────────────────────────────────
  // The lock is driven by SLANT RANGE, not launch progress, so the
  // tracker's behavior matches what an AI would actually do:
  //   range > 1500m  : SEARCHING — no box (sensor noise only)
  //   1500..900m     : ACQUIRING — flickering, sub-stable box
  //   900..400m      : TRACKING  — solid lock building
  //   < 400m         : LOCK      — full confidence
  const rangeM = track?.range_m ?? Infinity
  const acquireBase =
    rangeM > 1500
      ? 0
      : rangeM > 900
        ? 0.15 + 0.15 * ((1500 - rangeM) / 600)        // 0.15 → 0.30
        : rangeM > 400
          ? 0.30 + 0.65 * ((900 - rangeM) / 500)       // 0.30 → 0.95
          : 1.0
  // Flicker during ACQUIRING — random-ish dropouts simulate the AI
  // re-acquiring as the target moves through clutter. Smooth from a
  // pair of sines so it stays deterministic.
  const flickerActive = rangeM <= 1500 && rangeM > 900
  const flicker = flickerActive
    ? 0.5 + 0.5 * Math.sin(t * 9.3) * Math.cos(t * 4.1)
    : 1
  const acquireRamp =
    phase === 'launch'
      ? acquireBase * flicker
      : phase === 'capture' || phase === 'report'
        ? 1
        : 0

  // Lateral drift across the FOV.
  // u=0 (launch start) : AB-U10 forward bearing ~282° (NW), threat bearing ~274° (W)
  //                      → threat sits 8° LEFT of AB-U10's forward → upper-LEFT of FOV
  // u=1 (capture)      : AB-U10 closing on threat 6 o'clock, both heading SE
  //                      → threat dead center (locked from behind)
  const easeOut = (x: number) => 1 - Math.pow(1 - x, 2)
  const driftU = easeOut(launchProgress)
  const driftX = (1 - driftU) * -95   // negative · upper-LEFT start (was +95, wrong side)
  const driftY = (1 - driftU) * -55

  // Hand-tracking jitter — bigger early when the lock is loose, settles
  // as we close in. Adds a little realism vs a perfectly centered box.
  const jitterAmp = 6 * (1 - acquireRamp * 0.6)
  const jitterX = Math.sin(t * 1.3) * jitterAmp + Math.sin(t * 4.2) * 1.5
  const jitterY = Math.cos(t * 0.9) * (jitterAmp * 0.6) + Math.cos(t * 3.7) * 1.0

  const boxX = VB_W / 2 + driftX + jitterX
  const boxY = VB_H / 2 + driftY + jitterY - 8

  // Apparent angular size grows as 1/range. Clamped.
  const range = track?.range_m ?? 0
  const baseBoxSize = showLockOn ? Math.min(110, 4500 / Math.max(50, range)) : 0
  // Scale the visible box by the acquire ramp so it fades in cleanly.
  const boxSize = baseBoxSize * acquireRamp
  const boxOpacity = acquireRamp

  // Tracker label · driven by range, matching the acquire ramp's bands.
  const aiState =
    phase === 'launch'
      ? rangeM > 1500
        ? 'AI · SEARCH'
        : rangeM > 900
          ? 'AI · ACQUIRING'
          : rangeM > 400
            ? 'AI · TRACKING'
            : 'AI · LOCK'
      : phase === 'capture'
        ? 'AI · LOCK'
        : 'STANDBY'

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

  return (
    <div className={`u10-cam-wrap ${shakeClass}`}>
      <svg className="u10-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice">
        {/* sky / ground gradient — pitch-shifted so horizon moves */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#0c1828" />
            <stop offset="55%" stopColor="#1a2a44" />
            <stop offset="55.1%" stopColor="#0d1610" />
            <stop offset="100%" stopColor="#050a08" />
          </linearGradient>
        </defs>

        {/* Horizon + pitch ladder are wrapped in a group that rotates with
            the airframe roll (banking) and translates with pitch. The
            reticle and AI box stay screen-fixed (rendered outside this g). */}
        <g transform={`rotate(${rollDeg} ${VB_W / 2} ${VB_H * 0.55}) translate(0 ${pitchDeg * 4})`}>
          <rect x={-VB_W} y={-VB_H} width={VB_W * 3} height={VB_H * 3} fill="url(#skyGrad)" />
          {/* (the u10_action.jpg horizon-blend image was removed — it read as
              a stray helicopter behind the synthetic horizon and broke the
              "EO sensor feed" mental model. The cleaner SVG-only horizon plus
              the engagement-instant overlays below make the moment more
              legible than the photo blend ever did.) */}
          {/* horizon line */}
          <line x1={-VB_W} y1={VB_H * 0.55} x2={VB_W * 2} y2={VB_H * 0.55}
                stroke="rgba(122,138,158,0.4)" strokeWidth="0.6" />

          {/* pitch ladder · simple 3-line ladder · banks with roll */}
          {[-10, -5, 5, 10].map((p) => {
            const y = VB_H * 0.55 + (-p) * 4
            return (
              <g key={p} stroke="rgba(122,138,158,0.45)" strokeWidth="0.6">
                <line x1={VB_W / 2 - 30} y1={y} x2={VB_W / 2 - 12} y2={y} />
                <line x1={VB_W / 2 + 12} y1={y} x2={VB_W / 2 + 30} y2={y} />
                <text x={VB_W / 2 - 36} y={y + 2}
                      fontFamily="var(--mono)" fontSize="5"
                      fill="rgba(122,138,158,0.6)" textAnchor="end">{p}°</text>
                <text x={VB_W / 2 + 36} y={y + 2}
                      fontFamily="var(--mono)" fontSize="5"
                      fill="rgba(122,138,158,0.6)">{p}°</text>
              </g>
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

        {/* AI tracker box on hostile FPV */}
        {showLockOn && (
          <g opacity={boxOpacity}>
            {/* outer · pulsing */}
            <rect
              x={boxX - boxSize / 2}
              y={boxY - boxSize / 2}
              width={boxSize}
              height={boxSize}
              fill="none"
              stroke="#ff3d55"
              strokeWidth="1.2"
              className="u10-track-box"
            />
            {/* corner brackets */}
            {[
              [boxX - boxSize / 2, boxY - boxSize / 2, 1, 1],
              [boxX + boxSize / 2, boxY - boxSize / 2, -1, 1],
              [boxX - boxSize / 2, boxY + boxSize / 2, 1, -1],
              [boxX + boxSize / 2, boxY + boxSize / 2, -1, -1],
            ].map(([x, y, sx, sy], i) => (
              <g key={i} stroke="#ff3d55" strokeWidth="2">
                <line x1={x} y1={y} x2={(x as number) + (sx as number) * 8} y2={y} />
                <line x1={x} y1={y} x2={x} y2={(y as number) + (sy as number) * 8} />
              </g>
            ))}
            {/* label above box */}
            <text x={boxX - boxSize / 2} y={boxY - boxSize / 2 - 4}
                  fontFamily="var(--mono)" fontSize="6"
                  fill="#ff3d55">
              TGT · {trackId} · {(range / 1000).toFixed(2)}km
            </text>
            {/* small dot inside, simulating the drone's silhouette */}
            <circle cx={boxX} cy={boxY} r={Math.max(2, boxSize * 0.05)}
                    fill="#ff3d55" opacity="0.7" />
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
            <div>RNG <span className="hud-val red">{(range / 1000).toFixed(2)}</span> km</div>
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
