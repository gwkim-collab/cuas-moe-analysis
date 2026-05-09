import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Entity,
  useCesium,
  BillboardGraphics,
  BoxGraphics,
  PolylineGraphics,
  LabelGraphics,
  EllipseGraphics,
  EllipsoidGraphics,
  ModelGraphics,
} from 'resium'
import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  ColorMaterialProperty,
  HeadingPitchRoll,
  HeightReference,
  Ion,
  LabelStyle,
  Math as CesiumMath,
  PolylineDashMaterialProperty,
  Transforms,
  VerticalOrigin,
  type Property,
} from 'cesium'

import { initialState, INCHEON } from './mockData'
import { TelRefContext } from './telRefContext'
import { PHASE_SCHEDULE, SCENARIO_TOTAL_MS, tick } from './scenario'
import { launchPathBezier3D, u10HeadingDeg, u10Position3D } from './u10Trajectory'
import type { CUASTelemetry, KillChainPhase, PayloadMode } from './types'
import {
  CAPTURE_ICON,
  FPV_ICON,
  RADAR_ICON,
  U10_ICON,
} from './icons'

// HUD components reused from the 2D mockup
import TopBar from './components/TopBar'
import BottomBar from './components/BottomBar'
import CameraStack from './components/CameraStack'
import RightPanel from './components/RightPanel'
import DebriefModal from './components/DebriefModal'
import PhaseFlash from './components/PhaseFlash'
import StandbyHint from './components/StandbyHint'
import HotkeyHint from './components/HotkeyHint'
import CesiumScaleBar from './components/CesiumScaleBar'
import RadarScanPulse from './components/RadarScanPulse'

import './App.css'

const TOKEN = import.meta.env.VITE_CESIUM_TOKEN as string | undefined
if (TOKEN) Ion.defaultAccessToken = TOKEN

// 250ms · 4 Hz scenario tick.
// We tried 100ms briefly but the more frequent setState made React
// re-render churn worse on busy devices. Position smoothness is now
// going to come from a CallbackProperty (next step), not from a
// faster tick — keeping this conservative for now.
const TICK_MS = 250

// ── Camera preset ────────────────────────────────────────────
// Single TACTICAL view — operational top-down. North-up, -75° pitch
// (high-oblique not strict nadir, so altitude leaders still read).
// VIP centered exactly: camera position is groundD = alt/tan(|pitch|)
// meters away along the back-bearing.
const M_PER_DEG_LAT_VIEW = 111_320
function vipCenteredDestination(headingDeg: number, pitchDeg: number, altMeters: number) {
  const groundD = altMeters / Math.tan((Math.abs(pitchDeg) * Math.PI) / 180)
  const backBearingRad = ((headingDeg + 180) * Math.PI) / 180
  const dy_m = Math.cos(backBearingRad) * groundD
  const dx_m = Math.sin(backBearingRad) * groundD
  const dLat = dy_m / M_PER_DEG_LAT_VIEW
  const dLon =
    dx_m / (M_PER_DEG_LAT_VIEW * Math.cos((INCHEON.vip_lat * Math.PI) / 180))
  return Cartesian3.fromDegrees(
    INCHEON.vip_lon + dLon,
    INCHEON.vip_lat + dLat,
    altMeters,
  )
}

const TACTICAL_HEADING_DEG = 0
const TACTICAL_PITCH_DEG = -75
// Bumped from 5km → 7km so the full ingress corridor + Yeouido context
// + spawn annulus all fit at default zoom. User can still mouse-zoom in.
const TACTICAL_ALT_M = 7000

const TACTICAL_PRESET = {
  destination: vipCenteredDestination(
    TACTICAL_HEADING_DEG,
    TACTICAL_PITCH_DEG,
    TACTICAL_ALT_M,
  ),
  orientation: {
    heading: CesiumMath.toRadians(TACTICAL_HEADING_DEG),
    pitch: CesiumMath.toRadians(TACTICAL_PITCH_DEG),
    roll: 0,
  },
}

// ── Resium <Viewer> contextOptions · MUST be a stable reference ─
// Resium treats `contextOptions` as a read-only prop — every reference
// change causes the entire Cesium viewer to be destroyed and recreated.
// As an inline object literal in JSX it was getting a fresh reference
// on every App re-render, which (a) restarted imagery streaming on
// every tick (no tiles ever finished loading → black map cell with
// camera at 2600m) and (b) was the source of the dev-console warning
// "Viewer is recreated because contextOptions has been updated".
// Hoisting to module scope freezes the reference so the viewer is
// constructed exactly once.
const VIEWER_CONTEXT_OPTIONS = {
  webgl: {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance' as const,
    preserveDrawingBuffer: false,
  },
}

function SceneInit({ onReady }: { onReady: () => void }) {
  const { viewer } = useCesium()
  useEffect(() => {
    if (!viewer) return
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none')

    // ── Performance · cap render resolution ─────────────────
    viewer.useBrowserRecommendedResolution = false
    viewer.resolutionScale = 0.5

    // ── Performance · disable expensive scene features ──────
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.showWaterEffect = false
    viewer.scene.fog.enabled = false
    if (viewer.scene.postProcessStages?.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = false
    }
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false

    // Tone the satellite imagery LAYER (not the canvas filter), so the
    // map fades to a dim console backdrop while entities/markers stay
    // full-saturation.
    const tone = () => {
      for (let i = 0; i < viewer.imageryLayers.length; i++) {
        const layer = viewer.imageryLayers.get(i)
        layer.brightness = 0.55
        layer.saturation = 0.40
        layer.contrast = 1.15
        layer.gamma = 1.05
      }
    }
    tone()
    const onAdd = viewer.imageryLayers.layerAdded.addEventListener(tone)

    onReady()
    return () => {
      onAdd()
    }
  }, [viewer, onReady])
  return null
}

// CompassWidget · north-keyed compass that rotates inversely to the
// camera heading, so the north arrow always points to true north on
// screen. Reads viewer.camera.heading every frame via postRender.
function CompassWidget() {
  const { viewer } = useCesium()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!viewer) return
    const update = () => {
      if (!ref.current) return
      // viewer.camera.heading is in radians, clockwise from north.
      // We rotate the widget by the negative so north stays pinned up.
      const headingDeg = CesiumMath.toDegrees(viewer.camera.heading)
      ref.current.style.transform = `rotate(${-headingDeg}deg)`
    }
    update()
    const handle = viewer.scene.postRender.addEventListener(update)
    return () => { handle() }
  }, [viewer])
  return (
    <div className="compass-widget" ref={ref} aria-hidden>
      <svg viewBox="-32 -32 64 64" width="56" height="56">
        {/* Outer ring */}
        <circle cx="0" cy="0" r="28" fill="rgba(7,9,13,0.55)" stroke="#00FFBC" strokeWidth="1.2" />
        {/* Cardinal ticks */}
        <line x1="0" y1="-28" x2="0" y2="-22" stroke="#00FFBC" strokeWidth="1.5" />
        <line x1="28" y1="0" x2="22" y2="0" stroke="#00FFBC" strokeWidth="1" opacity="0.55" />
        <line x1="0" y1="28" x2="0" y2="22" stroke="#00FFBC" strokeWidth="1" opacity="0.55" />
        <line x1="-28" y1="0" x2="-22" y2="0" stroke="#00FFBC" strokeWidth="1" opacity="0.55" />
        {/* North needle (filled triangle) */}
        <polygon points="0,-18 -5,4 5,4" fill="#00FFBC" />
        <polygon points="0,18 -4,-2 4,-2" fill="#00FFBC" opacity="0.35" />
        {/* Cardinal labels */}
        <text x="0" y="-9" fill="#0a0d12" fontSize="9" fontFamily="monospace" fontWeight="700" textAnchor="middle">N</text>
        <text x="17" y="3" fill="#00FFBC" fontSize="7" fontFamily="monospace" textAnchor="middle">E</text>
        <text x="0" y="14" fill="#00FFBC" fontSize="7" fontFamily="monospace" textAnchor="middle">S</text>
        <text x="-17" y="3" fill="#00FFBC" fontSize="7" fontFamily="monospace" textAnchor="middle">W</text>
      </svg>
    </div>
  )
}

// CameraController · drives the TACTICAL preset on first mount and
// resets to it on flyKey++ (F-key / FLY TO VIP button).
function CameraController({ flyKey }: { flyKey: number }) {
  const { viewer } = useCesium()
  const initRef = useRef(false)
  const prevFlyKeyRef = useRef(flyKey)

  useEffect(() => {
    if (!viewer) return
    if (!initRef.current) {
      viewer.camera.setView(TACTICAL_PRESET)
      viewer.scene.requestRender()
      initRef.current = true
      prevFlyKeyRef.current = flyKey
      return
    }
    if (prevFlyKeyRef.current !== flyKey) {
      viewer.camera.setView(TACTICAL_PRESET)
      viewer.scene.requestRender()
      prevFlyKeyRef.current = flyKey
    }
  }, [viewer, flyKey])

  return null
}

export default function App() {
  // ── state ──────────────────────────────────────────────────
  const [tel, setTel] = useState<CUASTelemetry>(() => initialState('net_gun'))
  const [running, setRunning] = useState(false)
  const [flashPhase, setFlashPhase] = useState<KillChainPhase | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [ready, setReady] = useState(false)
  const [flyKey, setFlyKey] = useState(0)
  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2 | 4>(1)
  const lastTickRef = useRef(performance.now())
  const prevPhaseRef = useRef<KillChainPhase>(tel.kill_chain.phase)
  const recordingRef = useRef(false)

  // ── scenario tick ──────────────────────────────────────────
  useEffect(() => {
    if (!running) return
    lastTickRef.current = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = now - lastTickRef.current
      lastTickRef.current = now
      // 2× speed compresses time without changing render rate — we
      // multiply dt rather than the interval frequency so React's tick
      // (and HUD update cadence) stays at 4Hz regardless of mode.
      setTel((prev) => tick(prev, dt * speedMultiplier, true))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running, speedMultiplier])

  // (fit-to-viewport scale removed · the layout is now fluid: .app-canvas
  // is 100vw × 100vh and the Cesium center cell takes whatever's left
  // after the fixed-width side rails.)

  // SceneInit's useEffect must NOT re-run every App re-render — that's
  // what was making the camera reset every 250ms tick (globe-view stuck +
  // the "1-second judder" both came from this single bug).
  const onSceneReady = useCallback(() => setReady(true), [])

  // ── controls ───────────────────────────────────────────────
  const onStart = useCallback(() => setRunning(true), [])
  const onPause = useCallback(() => setRunning(false), [])
  const onReset = useCallback(() => {
    setRunning(false)
    setTel((t) => initialState(t.payload_mode))
  }, [])
  const onPayloadMode = useCallback((p: PayloadMode) => {
    setTel((t) => ({ ...t, payload_mode: p }))
  }, [])
  const onFlyTo = useCallback(() => setFlyKey((k) => k + 1), [])
  // Speed cycles 1× → 2× → 4× → 1×. Single key/button for all three.
  const onCycleSpeed = useCallback(
    () => setSpeedMultiplier((s) => (s === 1 ? 2 : s === 2 ? 4 : 1)),
    [],
  )

  const onRecord = useCallback(async () => {
    if (recordingRef.current) return
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('이 브라우저는 화면 녹화를 지원하지 않습니다.')
      return
    }
    let stream: MediaStream
    try {
      // Bumped to 60fps so the recording captures the full smoothness
      // of the mockup (was 30 → IR videos looked half-stutter).
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 60 }, audio: false })
    } catch {
      return
    }
    recordingRef.current = true
    setIsRecording(true)
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      a.download = `cuas-cesium-${stamp}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      stream.getTracks().forEach((t) => t.stop())
      recordingRef.current = false
      setIsRecording(false)
    }
    stream.getVideoTracks()[0].onended = () => {
      if (recorder.state === 'recording') recorder.stop()
    }
    recorder.start()
    setTel((t) => initialState(t.payload_mode))
    setRunning(false)
    window.setTimeout(() => setRunning(true), 600)
    window.setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, SCENARIO_TOTAL_MS + 4_000)
  }, [])

  // ── phase transition flash ─────────────────────────────────
  useEffect(() => {
    const phase = tel.kill_chain.phase
    if (prevPhaseRef.current !== phase) {
      if (phase === 'detect' || phase === 'capture' || phase === 'report') {
        setFlashPhase(phase)
        const id = window.setTimeout(() => setFlashPhase(null), 700)
        prevPhaseRef.current = phase
        return () => window.clearTimeout(id)
      }
      prevPhaseRef.current = phase
    }
  }, [tel.kill_chain.phase])

  // ── keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      switch (e.code) {
        case 'Space': e.preventDefault(); running ? onPause() : onStart(); break
        case 'KeyR': onReset(); break
        case 'KeyN': setTel((t) => ({ ...t, payload_mode: 'net_gun' })); break
        case 'KeyS': setTel((t) => ({ ...t, payload_mode: 'shotgun' })); break
        case 'KeyG': onRecord(); break
        case 'KeyF': onFlyTo(); break
        case 'KeyD': onCycleSpeed(); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, onStart, onPause, onReset, onRecord, onFlyTo, onCycleSpeed])

  // ── derived positions ──────────────────────────────────────
  const phase = tel.kill_chain.phase
  const sol = tel.intercept_solution
  const trackId = tel.kill_chain.target_track_id
  const track = trackId ? tel.tracks[trackId] : null

  // ── Entity properties via CallbackProperty ─────────────────
  //
  // The big perf trick: we keep `tel` in a ref so Cesium can read the
  // latest scenario state every frame WITHOUT triggering a React
  // re-render. Position/orientation/path entities then use
  // CallbackProperty to compute their value live at Cesium's render
  // rate (60fps), rather than React's tick rate (4Hz).
  //
  // Net effect: React re-renders 4× per second for the HUD; Cesium
  // updates positions 60× per second smoothly. The two are decoupled.
  const telRef = useRef(tel)
  useEffect(() => { telRef.current = tel }, [tel])

  // Static fallbacks for the brief moment before tel is populated
  // (and so pre-mounted hidden entities have a valid position). Using
  // VIP coords — entity is hidden when these are read, so the value
  // just needs to be a valid Cartesian3.
  const PLACEHOLDER_POS = useMemo(
    () => Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 85),
    [],
  )
  const PLACEHOLDER_CAPTURE = useMemo(
    () => Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 0),
    [],
  )
  const PLACEHOLDER_TRAIL = useMemo(
    () => [
      Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 85),
      Cartesian3.fromDegrees(INCHEON.vip_lon + 0.0001, INCHEON.vip_lat, 85),
    ],
    [],
  )

  // AB-U10 live position (every Cesium frame · 60fps).
  // Must be CallbackPositionProperty (not generic CallbackProperty) — Entity.position
  // requires a PositionProperty so it knows which reference frame the coordinates
  // are in (FIXED = ECEF). Without this Cesium silently fails to draw the entity.
  const u10PositionProperty = useMemo(
    () =>
      new CallbackPositionProperty(() => {
        const lla = u10Position3D(telRef.current)
        return Cartesian3.fromDegrees(lla[1], lla[0], lla[2])
      }, false),
    [],
  )

  // AB-U10 orientation (heading derived from bezier tangent · -90° model offset)
  const u10OrientationProperty = useMemo(
    () =>
      new CallbackProperty(() => {
        const t = telRef.current
        const lla = u10Position3D(t)
        const pos = Cartesian3.fromDegrees(lla[1], lla[0], lla[2])
        const headingDeg = u10HeadingDeg(t)
        return Transforms.headingPitchRollQuaternion(
          pos,
          new HeadingPitchRoll(CesiumMath.toRadians(headingDeg - 90), 0, 0),
        )
      }, false),
    [],
  )

  // Hostile FPV position (or placeholder when no track) — same PositionProperty rule
  const threatPositionProperty = useMemo(
    () =>
      new CallbackPositionProperty(() => {
        const t = telRef.current
        const trackId = t.kill_chain.target_track_id
        const trk = trackId ? t.tracks[trackId] : null
        if (!trk) return PLACEHOLDER_POS
        return Cartesian3.fromDegrees(trk.lon_deg, trk.lat_deg, trk.alt_m_agl)
      }, false),
    [PLACEHOLDER_POS],
  )

  // Threat ingress trail polyline (origin → current track position).
  // Origin is the per-scenario randomized spawn point so the trail
  // matches the actual approach vector (not the canonical center).
  const threatTrailProperty = useMemo(
    () =>
      new CallbackProperty(() => {
        const t = telRef.current
        const trackId = t.kill_chain.target_track_id
        const trk = trackId ? t.tracks[trackId] : null
        if (!trk) return PLACEHOLDER_TRAIL
        return [
          Cartesian3.fromDegrees(t.threat_origin.lon, t.threat_origin.lat, 85),
          Cartesian3.fromDegrees(trk.lon_deg, trk.lat_deg, trk.alt_m_agl),
        ]
      }, false),
    [PLACEHOLDER_TRAIL],
  )

  // AB-U10 intercept path (bezier curve · launch only)
  // The capture point doesn't change during a scenario, so we compute
  // the 32-point curve ONCE and cache it. Without this, the callback
  // allocates 32 fresh Cartesian3 every frame (~2000 GC objects/sec).
  const interceptPathProperty = useMemo(() => {
    let cachedPath: Cartesian3[] | null = null
    let cachedKey = ''
    return new CallbackProperty(() => {
      const t = telRef.current
      const s = t.intercept_solution
      if (!s || t.kill_chain.phase !== 'launch') return PLACEHOLDER_TRAIL
      // Cache key includes threat_origin since the swing endpoint is
      // 6 o'clock behind the threat at tail-entry time, which depends
      // on threat origin (not just capture point).
      const key = `${t.threat_origin.lat},${t.threat_origin.lon},${s.capture_lat_deg},${s.capture_lon_deg}`
      if (key !== cachedKey || !cachedPath) {
        cachedPath = launchPathBezier3D(t, 32).map(([la, lo, al]) =>
          Cartesian3.fromDegrees(lo, la, al),
        )
        cachedKey = key
      }
      return cachedPath
    }, false)
  }, [PLACEHOLDER_TRAIL])

  // ── Engagement effect (capture phase) ─────────────────────────
  // Visible for 1.5s after capture phase begins. Net gun: tighter, slower
  // expanding amber ring (the "net" is small, ground-footprint-y). Shotgun:
  // wider, faster expanding orange ring (explosion). Both fade out at 1.5s.
  const ENGAGEMENT_DURATION_MS = 1500
  const NET_COLOR = '#ffb020'
  const SHOT_COLOR = '#ff7a3d'

  const engagementRadius = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        if (tt.kill_chain.phase !== 'capture') return 0.001
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        if (captureT <= 0 || captureT > ENGAGEMENT_DURATION_MS) return 0.001
        // NET: peaks ~25m ground footprint. SHOT: peaks ~70m blast radius.
        const peak = tt.payload_mode === 'net_gun' ? 25 : 70
        const u = captureT / ENGAGEMENT_DURATION_MS
        // ease-out · radius grows fast then settles
        return Math.max(0.001, peak * (1 - Math.pow(1 - u, 3)))
      }, false),
    [],
  )

  const engagementMaterial = useMemo(
    () =>
      new ColorMaterialProperty(
        new CallbackProperty(() => {
          const tt = telRef.current
          const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
          const opacity = Math.max(0, 1 - captureT / ENGAGEMENT_DURATION_MS)
          const color = tt.payload_mode === 'net_gun' ? NET_COLOR : SHOT_COLOR
          // SHOT has a brighter fill (explosion); NET is more transparent (mesh).
          const fillScale = tt.payload_mode === 'net_gun' ? 0.22 : 0.45
          return Color.fromCssColorString(color).withAlpha(opacity * fillScale)
        }, false),
      ),
    [],
  )

  const engagementOutlineColor = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        const opacity = Math.max(0, 1 - captureT / ENGAGEMENT_DURATION_MS)
        const color = tt.payload_mode === 'net_gun' ? NET_COLOR : SHOT_COLOR
        return Color.fromCssColorString(color).withAlpha(opacity)
      }, false),
    [],
  )

  // ── Threat-attached effects (NET wireframe / SHOTGUN explosion) ────
  // These ride the threat entity's position so they fall with it.
  // NET: a 6×6×6m wireframe box surrounding the drone (the deployed mesh).
  // SHOTGUN: an expanding ellipsoid blast and a brief HOSTILE billboard fade.
  const NET_BOX_SIDE_M = 6
  const netBoxDimensions = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        if (tt.kill_chain.phase !== 'capture') return new Cartesian3(0.001, 0.001, 0.001)
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        // Net deploys 0 → full size in 0.4s, then stays.
        const u = Math.min(1, captureT / 400)
        const side = Math.max(0.001, NET_BOX_SIDE_M * u)
        return new Cartesian3(side, side, side)
      }, false),
    [],
  )

  const blastRadii = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        if (tt.kill_chain.phase !== 'capture') return new Cartesian3(0.001, 0.001, 0.001)
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        const u = Math.min(1, captureT / ENGAGEMENT_DURATION_MS)
        // SHOTGUN blast sphere: 0 → 18m radius
        const r = Math.max(0.001, 18 * (1 - Math.pow(1 - u, 2)))
        return new Cartesian3(r, r, r)
      }, false),
    [],
  )

  const blastFillMaterial = useMemo(
    () =>
      new ColorMaterialProperty(
        new CallbackProperty(() => {
          const tt = telRef.current
          const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
          const opacity = Math.max(0, 1 - captureT / ENGAGEMENT_DURATION_MS) * 0.55
          return Color.fromCssColorString(SHOT_COLOR).withAlpha(opacity)
        }, false),
      ),
    [],
  )

  // HOSTILE billboard color · SHOTGUN fades the drone out after the flash;
  // NET keeps it visible (caught, not destroyed).
  const hostileBillboardColor = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        const phase = tt.kill_chain.phase
        if (phase !== 'capture' && phase !== 'report') return Color.WHITE
        if (tt.payload_mode === 'net_gun') return Color.WHITE.withAlpha(0.95)
        // SHOTGUN: rapid fade starting 0.3s in
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        const u = Math.min(1, Math.max(0, (captureT - 300) / 700))
        return Color.WHITE.withAlpha(Math.max(0.05, 1 - u))
      }, false),
    [],
  )

  // ── Altitude leader lines ─────────────────────────────────────
  // Vertical dashed line from each airborne entity straight down to the
  // ground. Without these, a top-down view collapses every "in flight"
  // marker onto its ground footprint and the altitude separation becomes
  // invisible. With them, the eye reads "object floating at altitude" the
  // same way a tactical map does — height pole + ground tick.
  const u10LeaderProperty = useMemo(
    () =>
      new CallbackProperty(() => {
        const lla = u10Position3D(telRef.current)
        return [
          Cartesian3.fromDegrees(lla[1], lla[0], lla[2]),
          Cartesian3.fromDegrees(lla[1], lla[0], 0),
        ]
      }, false),
    [],
  )

  const threatLeaderProperty = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        const trkId = tt.kill_chain.target_track_id
        const trk = trkId ? tt.tracks[trkId] : null
        if (!trk) return PLACEHOLDER_TRAIL
        return [
          Cartesian3.fromDegrees(trk.lon_deg, trk.lat_deg, trk.alt_m_agl),
          Cartesian3.fromDegrees(trk.lon_deg, trk.lat_deg, 0),
        ]
      }, false),
    [PLACEHOLDER_TRAIL],
  )

  // Dashed materials · pre-built once. Color is mode-agnostic (matches the
  // entity's own colour family) so the leader reads as a quiet attribute
  // of the entity, not a separate flag.
  const u10LeaderMaterial = useMemo(
    () =>
      new PolylineDashMaterialProperty({
        color: Color.fromCssColorString('#00FFBC').withAlpha(0.55),
        dashLength: 12,
      }),
    [],
  )
  const threatLeaderMaterial = useMemo(
    () =>
      new PolylineDashMaterialProperty({
        color: Color.fromCssColorString('#ff3d55').withAlpha(0.55),
        dashLength: 12,
      }),
    [],
  )
  // Ground tick (small ring at the foot of the leader) — gives the eye
  // a "this is the ground point under the airborne object" anchor.
  const u10GroundTickPosition = useMemo(
    () =>
      new CallbackPositionProperty(() => {
        const lla = u10Position3D(telRef.current)
        return Cartesian3.fromDegrees(lla[1], lla[0], 0)
      }, false),
    [],
  )
  const threatGroundTickPosition = useMemo(
    () =>
      new CallbackPositionProperty(() => {
        const tt = telRef.current
        const trkId = tt.kill_chain.target_track_id
        const trk = trkId ? tt.tracks[trkId] : null
        if (!trk) return PLACEHOLDER_POS
        return Cartesian3.fromDegrees(trk.lon_deg, trk.lat_deg, 0)
      }, false),
    [PLACEHOLDER_POS],
  )

  // ── Ground impact ring · brief "dust cloud" when the drone hits ──
  // The fall takes ~2s (alt 85 → 0 ease-in). Ring fires once alt drops
  // below ~5m and expands 0 → 25m over 1s, then fades.
  const IMPACT_DELAY_MS = 1800
  const IMPACT_DURATION_MS = 1000

  const groundImpactRadius = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        const phase = tt.kill_chain.phase
        if (phase !== 'capture' && phase !== 'report') return 0.001
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        const sinceImpact = captureT - IMPACT_DELAY_MS
        if (sinceImpact <= 0) return 0.001
        const u = Math.min(1, sinceImpact / IMPACT_DURATION_MS)
        return Math.max(0.001, 25 * (1 - Math.pow(1 - u, 2)))
      }, false),
    [],
  )

  const groundImpactMaterial = useMemo(
    () =>
      new ColorMaterialProperty(
        new CallbackProperty(() => {
          const tt = telRef.current
          const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
          const sinceImpact = Math.max(0, captureT - IMPACT_DELAY_MS)
          const opacity = Math.max(0, 1 - sinceImpact / IMPACT_DURATION_MS) * 0.45
          return Color.fromCssColorString('#7a8a9e').withAlpha(opacity)
        }, false),
      ),
    [],
  )

  const groundImpactOutline = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        const captureT = tt.scenario_clock_ms - PHASE_SCHEDULE.capture
        const sinceImpact = Math.max(0, captureT - IMPACT_DELAY_MS)
        const opacity = Math.max(0, 1 - sinceImpact / IMPACT_DURATION_MS)
        return Color.fromCssColorString('#7a8a9e').withAlpha(opacity)
      }, false),
    [],
  )

  // ── Pre-fire trail ────────────────────────────────────────────
  // Brief polyline AB-U10 → threat during the engagement instant
  // (last ~0.5s of launch + first ~0.5s of capture). Reads as the
  // payload's flight path between the two airframes.
  const fireTrailProperty = useMemo(
    () =>
      new CallbackProperty(() => {
        const tt = telRef.current
        const phase = tt.kill_chain.phase
        const ms = tt.scenario_clock_ms
        const inWindow =
          (phase === 'launch' && ms >= PHASE_SCHEDULE.capture - 500) ||
          (phase === 'capture' && ms <= PHASE_SCHEDULE.capture + 500)
        if (!inWindow) return PLACEHOLDER_TRAIL
        const trkId = tt.kill_chain.target_track_id
        const trk = trkId ? tt.tracks[trkId] : null
        if (!trk) return PLACEHOLDER_TRAIL
        const lla = u10Position3D(tt)
        return [
          Cartesian3.fromDegrees(lla[1], lla[0], lla[2]),
          Cartesian3.fromDegrees(trk.lon_deg, trk.lat_deg, trk.alt_m_agl),
        ]
      }, false),
    [PLACEHOLDER_TRAIL],
  )

  const fireTrailMaterial = useMemo(
    () =>
      new ColorMaterialProperty(
        new CallbackProperty(() => {
          const tt = telRef.current
          const color = tt.payload_mode === 'net_gun' ? NET_COLOR : SHOT_COLOR
          return Color.fromCssColorString(color).withAlpha(0.95)
        }, false),
      ),
    [],
  )

  // Display values for HUD labels — derived at React tick rate (fine)
  const u10AltDisplay = u10Position3D(tel)[2]

  return (
    <TelRefContext.Provider value={telRef}>
    <div className="app-canvas">
      <TopBar tel={tel} running={running} />

      <main className="main-grid">
        <CameraStack tel={tel} />

        {/* Cesium center · the map cell */}
        <div className="map-panel">
          <Viewer
            full
            animation={false}
            timeline={false}
            baseLayerPicker={false}
            navigationHelpButton={false}
            sceneModePicker={false}
            homeButton={false}
            geocoder={false}
            fullscreenButton={false}
            infoBox={false}
            selectionIndicator={false}
            // Performance: opaque canvas, no antialias, force discrete GPU.
            // Reference must be stable — see VIEWER_CONTEXT_OPTIONS comment.
            contextOptions={VIEWER_CONTEXT_OPTIONS}
          >
            <SceneInit onReady={onSceneReady} />
            <CameraController flyKey={flyKey} />
            <CompassWidget />
            <CesiumScaleBar />
            <RadarScanPulse />

            {/* All static markers below use the new vertical-stack icons:
                ground footprint at the bottom of the SVG, dashed leader,
                main marker at the top. Combined with verticalOrigin BOTTOM,
                the marker reads as suspended above its ground point. Labels
                are pushed further out so they don't crowd the marker. */}

            {/* GCS + RADAR · co-located on the same operating site as
                AB-U10 standby pad but offset ~100m east so labels and
                markers don't stack on top of each other. Same pole +
                label-on-top idiom as VIP. Radar pulse animation still
                emanates from this position via <RadarScanPulse>. */}
            {(() => {
              const radarLon = INCHEON.u10_lon + 0.00115  // ~100m E of standby pad
              const radarLat = INCHEON.u10_lat
              return (
                <>
                  <Entity name="GCS-RADAR-ring" position={Cartesian3.fromDegrees(radarLon, radarLat, 0)}>
                    <EllipseGraphics
                      semiMajorAxis={28}
                      semiMinorAxis={28}
                      height={1}
                      material={Color.fromCssColorString('#5fb6ff').withAlpha(0.18)}
                      outline
                      outlineColor={Color.fromCssColorString('#5fb6ff').withAlpha(0.9)}
                      outlineWidth={2}
                    />
                  </Entity>
                  <Entity name="GCS-RADAR-dot" position={Cartesian3.fromDegrees(radarLon, radarLat, 0)}>
                    <EllipseGraphics
                      semiMajorAxis={4}
                      semiMinorAxis={4}
                      height={1}
                      material={Color.fromCssColorString('#5fb6ff')}
                    />
                  </Entity>
                  <Entity
                    name="GCS-RADAR-icon"
                    position={Cartesian3.fromDegrees(radarLon, radarLat, 0)}
                  >
                    <BillboardGraphics
                      image={RADAR_ICON}
                      width={56}
                      height={82}
                      verticalOrigin={VerticalOrigin.BOTTOM}
                      heightReference={HeightReference.CLAMP_TO_GROUND}
                    />
                  </Entity>
                  <Entity name="GCS-RADAR-pole">
                    <PolylineGraphics
                      positions={[
                        Cartesian3.fromDegrees(radarLon, radarLat, 0),
                        Cartesian3.fromDegrees(radarLon, radarLat, 100),
                      ]}
                      width={2.5}
                      material={Color.fromCssColorString('#5fb6ff').withAlpha(0.85)}
                    />
                  </Entity>
                  <Entity
                    name="GCS-RADAR-label"
                    position={Cartesian3.fromDegrees(radarLon, radarLat, 100)}
                  >
                    <LabelGraphics
                      text="GCS · RADAR"
                      font='bold 13px "Montserrat"'
                      fillColor={Color.fromCssColorString('#5fb6ff')}
                      outlineColor={Color.BLACK}
                      outlineWidth={3}
                      style={LabelStyle.FILL_AND_OUTLINE}
                      pixelOffset={new Cartesian2(0, -14)}
                      showBackground
                      backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.9)')}
                    />
                  </Entity>
                </>
              )
            })()}

            {/* VIP · ground ring + dot + vertical pole + label-on-top.
                The pole gives the eye a clear "this point belongs to
                this label" connection — same idiom as a flag pole on
                a protected asset. */}
            <Entity name="VIP-ring" position={Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 0)}>
              <EllipseGraphics
                semiMajorAxis={32}
                semiMinorAxis={32}
                height={1}
                material={Color.fromCssColorString('#00FFBC').withAlpha(0.20)}
                outline
                outlineColor={Color.fromCssColorString('#00FFBC').withAlpha(0.95)}
                outlineWidth={2}
              />
            </Entity>
            <Entity name="VIP-dot" position={Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 0)}>
              <EllipseGraphics
                semiMajorAxis={5}
                semiMinorAxis={5}
                height={1}
                material={Color.fromCssColorString('#00FFBC')}
              />
            </Entity>
            <Entity name="VIP-pole">
              <PolylineGraphics
                positions={[
                  Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 0),
                  Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 100),
                ]}
                width={2.5}
                material={Color.fromCssColorString('#00FFBC').withAlpha(0.85)}
              />
            </Entity>
            <Entity
              name="VIP-label"
              position={Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 100)}
            >
              <LabelGraphics
                text="VIP · PROTECTED"
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#00FFBC')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(0, -14)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.9)')}
              />
            </Entity>

            {/* AB-U10 altitude leader · dashed pole from airframe to ground +
                ring tick at the ground point. Hidden while idle on the pad. */}
            <Entity
              name="AB-U10-leader"
              show={phase === 'launch' || phase === 'capture' || phase === 'report'}
            >
              <PolylineGraphics
                positions={u10LeaderProperty as unknown as Cartesian3[]}
                width={1.5}
                material={u10LeaderMaterial}
              />
            </Entity>
            <Entity
              name="AB-U10-ground-tick"
              position={u10GroundTickPosition as unknown as Cartesian3}
              show={phase === 'launch' || phase === 'capture' || phase === 'report'}
            >
              <EllipseGraphics
                semiMajorAxis={6}
                semiMinorAxis={6}
                height={1}
                material={Color.fromCssColorString('#00FFBC').withAlpha(0.18)}
                outline
                outlineColor={Color.fromCssColorString('#00FFBC').withAlpha(0.7)}
                outlineWidth={1}
              />
            </Entity>

            {/* AB-U10 · 3D GLB model + label · live position via CallbackProperty
                so Cesium updates 60fps regardless of React tick rate. */}
            <Entity
              name="AB-U10"
              position={u10PositionProperty as unknown as Cartesian3}
              orientation={u10OrientationProperty as unknown as Property}
            >
              <ModelGraphics
                uri="/models/AB-U10.glb"
                minimumPixelSize={115}
                maximumScale={720}
                scale={3}
                runAnimations={false}
                heightReference={HeightReference.RELATIVE_TO_GROUND}
                silhouetteColor={Color.fromCssColorString('#00FFBC')}
                silhouetteSize={1.5}
              />
              <LabelGraphics
                text={`AB-U10 · ${u10AltDisplay.toFixed(0)}m`}
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#00FFBC')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(0, -50)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.9)')}
              />
            </Entity>

            {/* Keep U10_ICON billboard import alive (not rendered while model is in use) */}
            {false && <BillboardGraphics image={U10_ICON} />}

            {/* Hostile altitude leader · dashed pole + ground tick. Same
                visual grammar as AB-U10's so the eye can compare altitudes
                across the engagement (drone falls → its pole shrinks). */}
            <Entity name="HOSTILE-leader" show={!!track}>
              <PolylineGraphics
                positions={threatLeaderProperty as unknown as Cartesian3[]}
                width={1.5}
                material={threatLeaderMaterial}
              />
            </Entity>
            <Entity
              name="HOSTILE-ground-tick"
              position={threatGroundTickPosition as unknown as Cartesian3}
              show={!!track}
            >
              <EllipseGraphics
                semiMajorAxis={6}
                semiMinorAxis={6}
                height={1}
                material={Color.fromCssColorString('#ff3d55').withAlpha(0.18)}
                outline
                outlineColor={Color.fromCssColorString('#ff3d55').withAlpha(0.7)}
                outlineWidth={1}
              />
            </Entity>

            {/* Hostile FPV — pre-mounted; show toggles on track presence.
                Billboard color is dynamic so SHOTGUN can fade it out post-blast. */}
            <Entity
              name="HOSTILE"
              position={threatPositionProperty as unknown as Cartesian3}
              show={!!track}
            >
              <BillboardGraphics
                image={FPV_ICON}
                width={64}
                height={93}
                verticalOrigin={VerticalOrigin.CENTER}
                heightReference={HeightReference.RELATIVE_TO_GROUND}
                color={hostileBillboardColor as unknown as Color}
              />
              <LabelGraphics
                text={
                  track
                    ? `${track.classification === 'hostile_fpv' ? '⚠ HOSTILE FPV' : '? UNKNOWN UAS'} · ${track.alt_m_agl.toFixed(0)}m`
                    : 'HOSTILE'
                }
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#ff3d55')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(0, -56)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.92)')}
              />
            </Entity>

            {/* Threat-attached engagement effect · rides the threat as it falls.
                NET GUN  : 6×6×6m wireframe box (the deployed mesh) around drone
                SHOTGUN  : expanding blast ellipsoid + threat fade (above) */}
            <Entity
              name="threat-engagement"
              position={threatPositionProperty as unknown as Cartesian3}
              show={!!track && phase === 'capture' && tel.payload_mode === 'net_gun'}
            >
              <BoxGraphics
                dimensions={netBoxDimensions as unknown as Cartesian3}
                fill={false}
                outline
                outlineColor={engagementOutlineColor as unknown as Color}
                outlineWidth={2.5}
              />
            </Entity>
            <Entity
              name="threat-blast"
              position={threatPositionProperty as unknown as Cartesian3}
              show={!!track && phase === 'capture' && tel.payload_mode === 'shotgun'}
            >
              <EllipsoidGraphics
                radii={blastRadii as unknown as Cartesian3}
                material={blastFillMaterial}
                outline
                outlineColor={engagementOutlineColor as unknown as Color}
                outlineWidth={2.5}
              />
            </Entity>

            {/* Threat ingress trail — pre-mounted */}
            <Entity name="threat-trail" show={!!track}>
              <PolylineGraphics
                positions={threatTrailProperty as unknown as Cartesian3[]}
                width={3}
                material={Color.fromCssColorString('#ff3d55').withAlpha(0.8)}
              />
            </Entity>

            {/* Predicted impact zones · ground-level rings — pre-mounted */}
            {/* Outer drift zone (~250m) */}
            <Entity
              name="drift-zone"
              position={
                sol
                  ? Cartesian3.fromDegrees(sol.capture_lon_deg, sol.capture_lat_deg, 0)
                  : PLACEHOLDER_CAPTURE
              }
              show={!!sol && (phase === 'approve' || phase === 'launch')}
            >
              <EllipseGraphics
                semiMajorAxis={250}
                semiMinorAxis={250}
                height={1}
                material={Color.fromCssColorString('#7a8a9e').withAlpha(0.10)}
                outline
                outlineColor={Color.fromCssColorString('#7a8a9e').withAlpha(0.7)}
                outlineWidth={1.5}
              />
            </Entity>
            {/* Inner capture zone (~120m) */}
            <Entity
              name="capture-zone"
              position={
                sol
                  ? Cartesian3.fromDegrees(sol.capture_lon_deg, sol.capture_lat_deg, 0)
                  : PLACEHOLDER_CAPTURE
              }
              show={!!sol && (phase === 'approve' || phase === 'launch')}
            >
              <EllipseGraphics
                semiMajorAxis={120}
                semiMinorAxis={120}
                height={1}
                material={Color.fromCssColorString(
                  tel.payload_mode === 'net_gun' ? '#ffb020' : '#ff7a3d',
                ).withAlpha(0.18)}
                outline
                outlineColor={Color.fromCssColorString(
                  tel.payload_mode === 'net_gun' ? '#ffb020' : '#ff7a3d',
                )}
                outlineWidth={2.5}
              />
            </Entity>
            {/* Capture-zone label */}
            <Entity
              name="capture-zone-label"
              position={
                sol
                  ? Cartesian3.fromDegrees(sol.capture_lon_deg, sol.capture_lat_deg, 110)
                  : PLACEHOLDER_CAPTURE
              }
              show={!!sol && (phase === 'approve' || phase === 'launch')}
            >
              <LabelGraphics
                text={`예상 격추 ZONE · ${tel.payload_mode === 'net_gun' ? 'NET' : 'SHOT'}\n${tel.capture_point.name} · MIN COLLATERAL (${tel.capture_point.type.toUpperCase()})`}
                font='10px "Montserrat"'
                fillColor={Color.fromCssColorString(
                  tel.payload_mode === 'net_gun' ? '#ffb020' : '#ff7a3d',
                )}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(0, 0)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(7,9,13,0.85)')}
              />
            </Entity>

            {/* Engagement effect · NET / SHOTGUN expanding ring centered
                on the threat's CURRENT 3D position — falls with the drone
                so the net mesh / explosion stays attached to the airframe
                instead of looking like it's fired down at the ground.
                  - net_gun  : amber (#ffb020), tighter (~25m peak)
                  - shotgun  : orange (#ff7a3d), wider (~70m peak) */}
            <Entity
              name="engagement-effect-air"
              position={threatPositionProperty as unknown as Cartesian3}
              show={!!sol && phase === 'capture'}
            >
              <EllipseGraphics
                semiMajorAxis={engagementRadius as unknown as number}
                semiMinorAxis={engagementRadius as unknown as number}
                material={engagementMaterial}
                outline
                outlineColor={engagementOutlineColor as unknown as Color}
                outlineWidth={tel.payload_mode === 'net_gun' ? 2 : 4}
              />
            </Entity>

            {/* Pre-fire trail · short polyline AB-U10 → threat, last 0.5s of
                launch + first 0.5s of capture. Reads as the payload in flight. */}
            <Entity name="fire-trail" show={phase === 'launch' || phase === 'capture'}>
              <PolylineGraphics
                positions={fireTrailProperty as unknown as Cartesian3[]}
                width={tel.payload_mode === 'net_gun' ? 2.5 : 4}
                material={fireTrailMaterial}
              />
            </Entity>

            {/* Post-capture · debris drop zone — pre-mounted */}
            <Entity
              name="debris-zone"
              position={
                sol
                  ? Cartesian3.fromDegrees(sol.capture_lon_deg, sol.capture_lat_deg, 0)
                  : PLACEHOLDER_CAPTURE
              }
              show={!!sol && (phase === 'capture' || phase === 'report')}
            >
              <EllipseGraphics
                semiMajorAxis={80}
                semiMinorAxis={80}
                height={1}
                material={Color.fromCssColorString('#7a8a9e').withAlpha(0.18)}
                outline
                outlineColor={Color.fromCssColorString('#7a8a9e')}
                outlineWidth={1.5}
              />
            </Entity>

            {/* Intercept path · launch only — pre-mounted */}
            <Entity name="intercept-path" show={phase === 'launch' && !!sol}>
              <PolylineGraphics
                positions={interceptPathProperty as unknown as Cartesian3[]}
                width={3.5}
                material={Color.fromCssColorString('#00e87a').withAlpha(0.85)}
              />
            </Entity>

            {/* Ground impact ring · expanding dust ring at the moment the
                drone hits ground. Riding the threat's ground projection so
                it lands exactly under wherever the drone fell. */}
            <Entity
              name="ground-impact"
              position={threatGroundTickPosition as unknown as Cartesian3}
              show={!!track && (phase === 'capture' || phase === 'report')}
            >
              <EllipseGraphics
                semiMajorAxis={groundImpactRadius as unknown as number}
                semiMinorAxis={groundImpactRadius as unknown as number}
                material={groundImpactMaterial}
                height={1}
                outline
                outlineColor={groundImpactOutline as unknown as Color}
                outlineWidth={1.5}
              />
            </Entity>

            {/* Capture marker · NEUTRALIZED label sits at the threat's
                ground projection (= where the drone actually came to rest)
                rather than the predicted capture point's air altitude. */}
            <Entity
              name="CAPTURE-PT"
              position={threatGroundTickPosition as unknown as Cartesian3}
              show={!!track && (phase === 'capture' || phase === 'report')}
            >
              <BillboardGraphics
                image={CAPTURE_ICON}
                width={42}
                height={42}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
              <LabelGraphics
                text={phase === 'report' ? '✕ DEBRIS · DOWNED' : '✓ NEUTRALIZED'}
                font='11px "Montserrat"'
                fillColor={Color.fromCssColorString('#00e87a')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(0, -30)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(7,9,13,0.7)')}
              />
            </Entity>
          </Viewer>

          {/* Loading splash inside the map cell */}
          {!ready && (
            <div className="cesium-loading">
              <div className="cesium-loading-text">⏳ LOADING TERRAIN · YEOUIDO</div>
            </div>
          )}

          {/* Speed cycle button (left of fly button) — 1× / 2× / 4× */}
          <button
            type="button"
            className={`cesium-speed-btn ${speedMultiplier !== 1 ? 'is-active' : ''}`}
            onClick={onCycleSpeed}
            title="시뮬레이션 속도 토글 1× → 2× → 4× (D)"
          >
            {speedMultiplier}× SPEED
          </button>

          {/* Fly-to-VIP button (bottom-right of map cell) */}
          <button className="cesium-fly-btn" onClick={onFlyTo} title="여의도 카메라 fly-in 재실행 (F)">
            ↻ FLY TO VIP
          </button>

          {!TOKEN && (
            <div className="cesium-token-warn">⚠ VITE_CESIUM_TOKEN missing</div>
          )}
        </div>

        <RightPanel
          tel={tel}
          running={running}
          isRecording={isRecording}
          onPayloadMode={onPayloadMode}
          onStart={onStart}
          onPause={onPause}
          onReset={onReset}
          onRecord={onRecord}
        />
      </main>

      <BottomBar tel={tel} />

      {/* Standby hint · only on first load */}
      {!running && phase === 'standby' && tel.scenario_clock_ms === 0 && <StandbyHint />}

      {/* Hotkey reference */}
      <HotkeyHint />

      {/* Phase flash */}
      {flashPhase && <PhaseFlash phase={flashPhase} />}

      {/* Debrief modal */}
      {phase === 'report' && <DebriefModal tel={tel} onReset={onReset} />}
    </div>
    </TelRefContext.Provider>
  )
}
