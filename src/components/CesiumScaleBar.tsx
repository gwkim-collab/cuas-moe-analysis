import { useEffect, useRef } from 'react'
import { useCesium } from 'resium'
import { Cartesian2, Cartesian3, Cartographic, Math as CesiumMath } from 'cesium'

/**
 * Dynamic distance scale, drawn in DOM over the Cesium canvas.
 *
 * Reads two ground points on the map (the camera sub-point and a
 * point ~1km east of it) every render, projects both to canvas
 * pixels, and uses pixels-per-meter to size the scale bar so it
 * always represents a round number (50m / 100m / 200m / … / 5km).
 *
 * Updates the DOM directly via refs to avoid a React re-render
 * every Cesium frame.
 */
export default function CesiumScaleBar() {
  const { viewer } = useCesium()
  const barRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewer) return

    let lastTickMs = 0

    const update = () => {
      // Throttle to ~5 Hz — scale bar doesn't need every frame
      const now = performance.now()
      if (now - lastTickMs < 200) return
      lastTickMs = now

      const scene = viewer.scene
      const camera = viewer.camera
      const canvas = scene.canvas

      // Use the ground intersection at SCREEN CENTER (not the camera's
      // sub-point) so the ppm reflects what the operator is actually
      // looking at — important when camera pitch ≠ 90° (it almost never is).
      const screenCenter = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
      const ray = camera.getPickRay(screenCenter)
      if (!ray) return
      const groundCenter = scene.globe.pick(ray, scene)
      if (!groundCenter) return
      const carto = Cartographic.fromCartesian(groundCenter)
      if (!carto) return
      const lat = CesiumMath.toDegrees(carto.latitude)
      const lon = CesiumMath.toDegrees(carto.longitude)

      // Sample two ground points at the screen-center latitude.
      const dLonDeg = 0.005
      const groundDistM = dLonDeg * 111_000 * Math.cos(carto.latitude)
      const p1 = Cartesian3.fromDegrees(lon, lat, 0)
      const p2 = Cartesian3.fromDegrees(lon + dLonDeg, lat, 0)
      const c1 = scene.cartesianToCanvasCoordinates(p1)
      const c2 = scene.cartesianToCanvasCoordinates(p2)
      if (!c1 || !c2) return
      const pxDist = Math.hypot(c2.x - c1.x, c2.y - c1.y)
      if (pxDist <= 0) return

      const ppm = pxDist / groundDistM
      const screenW = canvas.clientWidth
      // Aim for ~1/5 of the canvas width
      const targetMeters = screenW / 5 / ppm
      const rounded = roundDistance(targetMeters)
      const widthPx = rounded * ppm

      if (barRef.current) barRef.current.style.width = `${widthPx}px`
      if (labelRef.current) labelRef.current.textContent = formatDist(rounded)
    }

    update()
    const handle = viewer.scene.postRender.addEventListener(update)
    return () => handle()
  }, [viewer])

  return (
    <div className="cesium-scale-bar" aria-label="Distance scale">
      <div className="csb-bar" ref={barRef} />
      <div className="csb-label" ref={labelRef}>—</div>
    </div>
  )
}

const ROUND_M = [50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000]

function roundDistance(m: number): number {
  for (const c of ROUND_M) {
    if (c >= m) return c
  }
  return 50_000
}

function formatDist(m: number): string {
  if (m >= 1000) {
    const km = m / 1000
    return Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`
  }
  return `${m} m`
}
