// Mini Cesium scene rendered behind the AB-U10 EO FWD overlay.
//
// Replaces the synthetic sky/ground gradient with the actual 3D terrain
// rendered from the U10's perspective — same satellite imagery as the
// main map, just framed from the airframe instead of overhead. Looks
// like a real EO gimbal feed.
//
// Performance · we run this at 0.4× resolution and disable atmosphere /
// fog / lighting so the second viewer doesn't double the GPU bill.
// The camera is updated every frame via scene.preRender, reading the
// shared telRef (60fps), so motion stays smooth even though the React
// HUD around it ticks at 4Hz.

import { useContext, useEffect } from 'react'
import { Viewer, useCesium } from 'resium'
import { Cartesian3, Color, Math as CesiumMath } from 'cesium'
import { TelRefContext } from '../../telRefContext'
import { u10Position, u10Altitude, u10HeadingDeg } from '../../u10Trajectory'

// Camera tilt below horizon when looking forward — small enough that the
// horizon stays visible (real EO gimbals usually look slightly down so
// targets ahead/below are framed).
const FORWARD_PITCH_DEG = -8

function MiniSceneController() {
  const { viewer } = useCesium()
  const telRef = useContext(TelRefContext)

  useEffect(() => {
    if (!viewer || !telRef) return

    // Sky · atmospheric scattering on (blue gradient + horizon haze
    // — much more "real EO feed" than a black void).
    viewer.useBrowserRecommendedResolution = false
    viewer.resolutionScale = 0.4
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true
    viewer.scene.fog.enabled = true
    viewer.scene.fog.density = 0.0001
    viewer.scene.globe.enableLighting = false
    viewer.scene.globe.showWaterEffect = false
    if (viewer.scene.postProcessStages?.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = false
    }
    // Soft daytime backdrop so any pixels not covered by atmosphere /
    // terrain (rare edge cases) read as sky, not black void.
    viewer.scene.backgroundColor = Color.fromCssColorString('#7BB7E8')
    viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none')

    // Disable user camera controls — this view is fully driven by the
    // U10's pose, the viewer shouldn't pan/zoom on its own.
    viewer.scene.screenSpaceCameraController.enableRotate = false
    viewer.scene.screenSpaceCameraController.enableTranslate = false
    viewer.scene.screenSpaceCameraController.enableZoom = false
    viewer.scene.screenSpaceCameraController.enableTilt = false
    viewer.scene.screenSpaceCameraController.enableLook = false

    const update = () => {
      const tel = telRef.current
      const ll = u10Position(tel)
      // Use a small floor so the camera doesn't sit literally on the
      // ground when U10 is on the pad (would clip into terrain).
      const alt = Math.max(u10Altitude(tel), 12)
      const heading = u10HeadingDeg(tel)
      viewer.camera.setView({
        destination: Cartesian3.fromDegrees(ll[1], ll[0], alt),
        orientation: {
          heading: CesiumMath.toRadians(heading),
          pitch: CesiumMath.toRadians(FORWARD_PITCH_DEG),
          roll: 0,
        },
      })
    }
    update()
    const handle = viewer.scene.preRender.addEventListener(update)
    return () => {
      handle()
    }
  }, [viewer, telRef])

  return null
}

const VIEWER_CONTEXT_OPTIONS = {
  webgl: {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance' as const,
    preserveDrawingBuffer: false,
  },
}

export default function MiniSceneView() {
  return (
    <div className="u10-mini-scene">
      <Viewer
        full={false}
        animation={false}
        baseLayerPicker={false}
        fullscreenButton={false}
        geocoder={false}
        homeButton={false}
        infoBox={false}
        navigationHelpButton={false}
        sceneModePicker={false}
        selectionIndicator={false}
        timeline={false}
        navigationInstructionsInitiallyVisible={false}
        contextOptions={VIEWER_CONTEXT_OPTIONS}
        style={{ width: '100%', height: '100%' }}
      >
        <MiniSceneController />
      </Viewer>
    </div>
  )
}
