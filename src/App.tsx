import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Viewer,
  Entity,
  useCesium,
  BillboardGraphics,
  PolylineGraphics,
  LabelGraphics,
  EllipseGraphics,
  ModelGraphics,
} from 'resium'
import {
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Color,
  HeadingPitchRoll,
  HeightReference,
  Ion,
  LabelStyle,
  Math as CesiumMath,
  Transforms,
  VerticalOrigin,
  type Property,
} from 'cesium'

import { initialState, INCHEON } from './mockData'
import { operatorApprove, operatorDismiss, SCENARIO_TOTAL_MS, tick } from './scenario'
import { launchPathBezier3D, u10HeadingDeg, u10Position3D } from './u10Trajectory'
import type { CUASTelemetry, KillChainPhase, PayloadMode, ScenarioMode } from './types'
import {
  CAPTURE_ICON,
  FPV_ICON,
  GCS_ICON,
  MC_ICON,
  RADAR_ICON,
  U10_ICON,
  VIP_ICON,
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

// ── Camera fly-in target ─────────────────────────────────────
// Wider establishing shot: VIP centered with the full ingress corridor
// visible — adversary spawn point (~2.5km W of VIP, near Yanghwa Bridge)
// fits comfortably in the upper-left, capture point in the middle, GCS
// pad on the right. Operator sees the threat coming the moment the
// scenario starts.
const CAMERA_DEST = Cartesian3.fromDegrees(
  INCHEON.vip_lon + 0.014,         // ~1.2km E
  INCHEON.vip_lat - 0.024,         // ~2.7km S
  2600,                             // 2.6km alt
)
const CAMERA_HEADING = CesiumMath.toRadians(-28)  // NNW · faces VIP and the corridor
const CAMERA_PITCH = CesiumMath.toRadians(-40)

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

function SceneInit({ onReady, flyKey }: { onReady: () => void; flyKey: number }) {
  const { viewer } = useCesium()
  useEffect(() => {
    if (!viewer) return
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none')

    // ── Camera fly-in ────────────────────────────────────────
    viewer.camera.setView({
      destination: CAMERA_DEST,
      orientation: { heading: CAMERA_HEADING, pitch: CAMERA_PITCH, roll: 0 },
    })
    viewer.scene.requestRender()

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

    // ── FPS diagnostic overlay (top-left of the canvas) ─────
    viewer.scene.debugShowFramesPerSecond = true

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
  }, [viewer, onReady, flyKey])
  return null
}

export default function App() {
  // ── state ──────────────────────────────────────────────────
  const [tel, setTel] = useState<CUASTelemetry>(() => initialState('auto', 'net_gun'))
  const [running, setRunning] = useState(false)
  const [flashPhase, setFlashPhase] = useState<KillChainPhase | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [ready, setReady] = useState(false)
  const [flyKey, setFlyKey] = useState(0)
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
      setTel((prev) => tick(prev, dt, true))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [running])

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
    setTel((t) => initialState(t.scenario_mode, t.payload_mode))
  }, [])
  const onScenarioMode = useCallback((m: ScenarioMode) => {
    setTel((t) => ({ ...t, scenario_mode: m }))
  }, [])
  const onPayloadMode = useCallback((p: PayloadMode) => {
    setTel((t) => ({ ...t, payload_mode: p }))
  }, [])
  const onApprove = useCallback(() => setTel((t) => operatorApprove(t)), [])
  const onDismiss = useCallback(() => {
    setTel((t) => operatorDismiss(t))
    setRunning(false)
  }, [])
  const onFlyTo = useCallback(() => setFlyKey((k) => k + 1), [])

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
    setTel((t) => initialState(t.scenario_mode, t.payload_mode))
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
        case 'KeyA': setTel((t) => ({ ...t, scenario_mode: t.scenario_mode === 'auto' ? 'manual' : 'auto' })); break
        case 'KeyN': setTel((t) => ({ ...t, payload_mode: 'net_gun' })); break
        case 'KeyS': setTel((t) => ({ ...t, payload_mode: 'shotgun' })); break
        case 'KeyG': onRecord(); break
        case 'KeyF': onFlyTo(); break
        case 'Enter':
          if (tel.scenario_mode === 'manual' && tel.kill_chain.phase === 'approve') onApprove()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [running, tel.scenario_mode, tel.kill_chain.phase, onStart, onPause, onReset, onApprove, onRecord, onFlyTo])

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
  // (and so pre-mounted hidden entities have a valid position).
  const PLACEHOLDER_POS = useMemo(
    () => Cartesian3.fromDegrees(INCHEON.threat_ingress_lon, INCHEON.threat_ingress_lat, 85),
    [],
  )
  const PLACEHOLDER_CAPTURE = useMemo(
    () => Cartesian3.fromDegrees(INCHEON.vip_lon - 0.0117, INCHEON.vip_lat + 0.001, 0),
    [],
  )
  const PLACEHOLDER_TRAIL = useMemo(
    () => [
      Cartesian3.fromDegrees(INCHEON.threat_ingress_lon, INCHEON.threat_ingress_lat, 85),
      Cartesian3.fromDegrees(INCHEON.threat_ingress_lon + 0.0001, INCHEON.threat_ingress_lat, 85),
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

  // Threat ingress trail polyline (origin → current track position)
  const threatTrailProperty = useMemo(
    () =>
      new CallbackProperty(() => {
        const t = telRef.current
        const trackId = t.kill_chain.target_track_id
        const trk = trackId ? t.tracks[trackId] : null
        if (!trk) return PLACEHOLDER_TRAIL
        return [
          Cartesian3.fromDegrees(INCHEON.threat_ingress_lon, INCHEON.threat_ingress_lat, 85),
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
      const key = `${s.capture_lat_deg},${s.capture_lon_deg}`
      if (key !== cachedKey || !cachedPath) {
        cachedPath = launchPathBezier3D([s.capture_lat_deg, s.capture_lon_deg], 32).map(([la, lo, al]) =>
          Cartesian3.fromDegrees(lo, la, al),
        )
        cachedKey = key
      }
      return cachedPath
    }, false)
  }, [PLACEHOLDER_TRAIL])

  // capture point only changes per-scenario (when sol becomes available)
  const capturePos = useMemo(() => {
    if (!sol) return null
    return Cartesian3.fromDegrees(sol.capture_lon_deg, sol.capture_lat_deg, sol.capture_alt_m_agl)
  }, [sol?.capture_lon_deg, sol?.capture_lat_deg, sol?.capture_alt_m_agl])

  // Display values for HUD labels — derived at React tick rate (fine)
  const u10AltDisplay = u10Position3D(tel)[2]

  return (
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
            <SceneInit onReady={onSceneReady} flyKey={flyKey} />
            <CesiumScaleBar />
            <RadarScanPulse />

            {/* All static markers below use the new vertical-stack icons:
                ground footprint at the bottom of the SVG, dashed leader,
                main marker at the top. Combined with verticalOrigin BOTTOM,
                the marker reads as suspended above its ground point. Labels
                are pushed further out so they don't crowd the marker. */}

            {/* GCS · ground control station = AB-U10 base */}
            <Entity name="GCS" position={Cartesian3.fromDegrees(INCHEON.u10_lon, INCHEON.u10_lat, 0)}>
              <BillboardGraphics
                image={GCS_ICON}
                width={64}
                height={93}
                verticalOrigin={VerticalOrigin.BOTTOM}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
              <LabelGraphics
                text="GCS · BASE"
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#5fb6ff')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(72, -90)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.85)')}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
            </Entity>

            {/* VIP */}
            <Entity name="VIP" position={Cartesian3.fromDegrees(INCHEON.vip_lon, INCHEON.vip_lat, 0)}>
              <BillboardGraphics
                image={VIP_ICON}
                width={72}
                height={104}
                verticalOrigin={VerticalOrigin.BOTTOM}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
              <LabelGraphics
                text="VIP · PROTECTED"
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#00FFBC')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(-78, -100)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.85)')}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
            </Entity>

            {/* Radar — collocated with GCS base */}
            <Entity
              name="RADAR"
              position={Cartesian3.fromDegrees(INCHEON.u10_lon - 0.0003, INCHEON.u10_lat + 0.0002, 0)}
            >
              <BillboardGraphics
                image={RADAR_ICON}
                width={56}
                height={81}
                verticalOrigin={VerticalOrigin.BOTTOM}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
              <LabelGraphics
                text="RADAR"
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#5fb6ff')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(70, -50)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.85)')}
                heightReference={HeightReference.CLAMP_TO_GROUND}
              />
            </Entity>

            {/* MC-01 · multicopter overwatch */}
            <Entity name="MC-01" position={Cartesian3.fromDegrees(INCHEON.vip_lon - 0.0006, INCHEON.vip_lat + 0.0008, 45)}>
              <BillboardGraphics
                image={MC_ICON}
                width={56}
                height={81}
                verticalOrigin={VerticalOrigin.BOTTOM}
                heightReference={HeightReference.RELATIVE_TO_GROUND}
              />
              <LabelGraphics
                text="MC-01 · 45m"
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#9b6bff')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(80, -56)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.85)')}
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
                pixelOffset={new Cartesian2(78, -38)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.9)')}
              />
            </Entity>

            {/* Keep U10_ICON billboard import alive (not rendered while model is in use) */}
            {false && <BillboardGraphics image={U10_ICON} />}

            {/* Hostile FPV — pre-mounted; show toggles on track presence */}
            <Entity
              name="HOSTILE"
              position={threatPositionProperty as unknown as Cartesian3}
              show={!!track}
            >
              <BillboardGraphics
                image={FPV_ICON}
                width={64}
                height={93}
                verticalOrigin={VerticalOrigin.BOTTOM}
                heightReference={HeightReference.RELATIVE_TO_GROUND}
              />
              <LabelGraphics
                text={
                  track
                    ? `${track.classification === 'hostile_fpv' ? '⚠ HOSTILE FPV' : '? UNKNOWN UAS'} · ${track.alt_m_agl}m`
                    : 'HOSTILE'
                }
                font='bold 13px "Montserrat"'
                fillColor={Color.fromCssColorString('#ff3d55')}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(86, -64)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(0,0,0,0.92)')}
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
                height={0}
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
                height={0}
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
                text={`예상 격추 ZONE · ${tel.payload_mode === 'net_gun' ? 'NET' : 'SHOT'}`}
                font='10px "Montserrat"'
                fillColor={Color.fromCssColorString(
                  tel.payload_mode === 'net_gun' ? '#ffb020' : '#ff7a3d',
                )}
                outlineColor={Color.BLACK}
                outlineWidth={3}
                style={LabelStyle.FILL_AND_OUTLINE}
                pixelOffset={new Cartesian2(0, 0)}
                showBackground
                backgroundColor={Color.fromCssColorString('rgba(7,9,13,0.8)')}
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
                height={0}
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

            {/* Capture marker — pre-mounted */}
            <Entity
              name="CAPTURE-PT"
              position={capturePos ?? PLACEHOLDER_CAPTURE}
              show={!!capturePos && (phase === 'capture' || phase === 'report')}
            >
              <BillboardGraphics
                image={CAPTURE_ICON}
                width={42}
                height={42}
                heightReference={HeightReference.RELATIVE_TO_GROUND}
              />
              <LabelGraphics
                text="✓ NEUTRALIZED"
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
          onScenarioMode={onScenarioMode}
          onPayloadMode={onPayloadMode}
          onStart={onStart}
          onPause={onPause}
          onReset={onReset}
          onApprove={onApprove}
          onDismiss={onDismiss}
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
  )
}
