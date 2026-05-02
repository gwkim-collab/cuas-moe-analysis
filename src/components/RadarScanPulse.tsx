import { useEffect, useRef } from 'react'
import { useCesium } from 'resium'
import { Cartesian3 } from 'cesium'
import { INCHEON } from '../mockData'

/**
 * Three staggered Olo rings emanating from the RADAR ground entity.
 *
 * Two things stay anchored every frame:
 *   1. Position — projected from RADAR's world coords to canvas pixels.
 *   2. Maximum ring size — set so the ring's outermost edge represents
 *      a real 3km ground sweep (matches AB-U10's nominal acquire range
 *      and the 1/2/3km reference rings the operator sees on the PPI).
 *      As the camera zooms in/out, the rings grow/shrink with the map.
 *
 * Animation is computed in JS each render rather than via CSS keyframes
 * because the maximum size is dynamic. DOM is updated through refs to
 * skip React re-renders.
 */
const SWEEP_RADIUS_M = 3000      // ← 3km, the AB-U10 nominal acquire range
const CYCLE_MS = 3600            // single ring expansion duration
const RING_DELAY_MS = 1200       // stagger between the 3 rings
const MIN_PX = 24

export default function RadarScanPulse() {
  const { viewer } = useCesium()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ringRefs = useRef<HTMLSpanElement[]>([])
  const startMsRef = useRef(performance.now())

  useEffect(() => {
    if (!viewer) return
    const radarPos = Cartesian3.fromDegrees(
      INCHEON.u10_lon - 0.0003,
      INCHEON.u10_lat + 0.0002,
      30,
    )

    // RADAR-LOCAL ground-distance reference (so the ppm reflects what
    // pixels-per-meter looks like AT the radar, not at the screen center).
    const radarSidePos = Cartesian3.fromDegrees(
      INCHEON.u10_lon - 0.0003 + 0.005,   // ~440m E of radar at this lat
      INCHEON.u10_lat + 0.0002,
      30,
    )
    const radarSideGroundM = 0.005 * 111_000 * Math.cos((INCHEON.u10_lat * Math.PI) / 180)

    let lastTickMs = 0

    const update = () => {
      // Throttle to ~30 fps · pulse stays smooth, GPU+DOM work halved
      const tickNow = performance.now()
      if (tickNow - lastTickMs < 33) return
      lastTickMs = tickNow

      const scene = viewer.scene
      const screen = scene.cartesianToCanvasCoordinates(radarPos)
      if (!screen || !wrapperRef.current) return

      // anchor wrapper to the radar's screen position
      wrapperRef.current.style.left = `${screen.x}px`
      wrapperRef.current.style.top = `${screen.y}px`

      // pixels-per-meter measured AT the radar entity (handles camera
      // pitch/perspective correctly).
      const sidePx = scene.cartesianToCanvasCoordinates(radarSidePos)
      if (!sidePx) return
      const ppm = Math.hypot(sidePx.x - screen.x, sidePx.y - screen.y) / radarSideGroundM
      if (ppm <= 0) return

      // Ring radius caps at the smaller of (3km, screen-half-width) so it
      // always fits inside the visible map area at any zoom.
      const screenW = scene.canvas.clientWidth
      const screenH = scene.canvas.clientHeight
      const fitRadiusM = Math.min(screenW, screenH) * 0.45 / ppm
      const targetRadiusM = Math.min(SWEEP_RADIUS_M, fitRadiusM)
      const maxPx = targetRadiusM * 2 * ppm   // diameter
      const now = performance.now() - startMsRef.current

      ringRefs.current.forEach((ring, i) => {
        if (!ring) return
        const delay = i * RING_DELAY_MS
        if (now < delay) {
          ring.style.opacity = '0'
          return
        }
        const u = ((now - delay) % CYCLE_MS) / CYCLE_MS  // 0..1
        // Ease-out so growth feels like a radar pulse decelerating
        const ease = 1 - Math.pow(1 - u, 2)
        const sizePx = MIN_PX + ease * (maxPx - MIN_PX)
        // Fade in fast then fade out
        const opacity =
          u < 0.06
            ? (u / 0.06) * 0.85
            : Math.max(0, 0.85 * (1 - (u - 0.06) / 0.94))
        ring.style.width = `${sizePx}px`
        ring.style.height = `${sizePx}px`
        ring.style.opacity = String(opacity)
        ring.style.borderWidth = `${Math.max(0.5, 2 - u * 1.6)}px`
      })
    }

    update()
    const handle = viewer.scene.postRender.addEventListener(update)
    return () => handle()
  }, [viewer])

  return (
    <div className="cesium-scan-pulse" ref={wrapperRef} aria-hidden>
      <span className="scan-ring" ref={(el) => { if (el) ringRefs.current[0] = el }} />
      <span className="scan-ring" ref={(el) => { if (el) ringRefs.current[1] = el }} />
      <span className="scan-ring" ref={(el) => { if (el) ringRefs.current[2] = el }} />
    </div>
  )
}
