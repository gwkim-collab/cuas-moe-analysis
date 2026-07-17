import { useEffect, useMemo } from 'react'
import { Viewer, Entity, EllipseGraphics, PolygonGraphics, useCesium } from 'resium'
import {
  Cartesian3,
  Color,
  Math as CesiumMath,
  PolygonHierarchy,
} from 'cesium'
import type { CoverageResult } from '../../analysis'

// Stable contextOptions ref (see App.tsx note — a fresh reference each
// render tears down and rebuilds the whole Cesium viewer).
const VIEWER_CONTEXT_OPTIONS = {
  webgl: {
    alpha: false,
    antialias: false,
    powerPreference: 'high-performance' as const,
    preserveDrawingBuffer: false,
  },
}

// Top-down camera framed on the asset so the full detection ring fits.
function TopDownCamera({ lat, lon, fitRadiusM }: { lat: number; lon: number; fitRadiusM: number }) {
  const { viewer } = useCesium()
  useEffect(() => {
    if (!viewer) return
    viewer.scene.globe.depthTestAgainstTerrain = false
    viewer.cesiumWidget.creditContainer.setAttribute('style', 'display:none')
    viewer.scene.skyAtmosphere && (viewer.scene.skyAtmosphere.show = false)
    viewer.scene.fog.enabled = false
    // Altitude to fit ~fitRadiusM at the default fov (straight-down view).
    const alt = Math.max(1500, fitRadiusM * 2.4)
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(lon, lat, alt),
      orientation: {
        heading: 0,
        pitch: CesiumMath.toRadians(-90),
        roll: 0,
      },
    })
    viewer.scene.requestRender()
  }, [viewer, lat, lon, fitRadiusM])
  return null
}

function ring(
  name: string,
  lat: number,
  lon: number,
  radius: number,
  css: string,
  alpha: number,
) {
  return (
    <Entity name={name} position={Cartesian3.fromDegrees(lon, lat, 1)}>
      <EllipseGraphics
        semiMajorAxis={radius}
        semiMinorAxis={radius}
        height={1}
        material={Color.fromCssColorString(css).withAlpha(alpha * 0.12)}
        outline
        outlineColor={Color.fromCssColorString(css).withAlpha(alpha)}
        outlineWidth={2}
      />
    </Entity>
  )
}

interface Props {
  coverage: CoverageResult
}

export default function CoverageMap({ coverage }: Props) {
  const { asset } = coverage

  // Defended-footprint polygon vertices (flat [lon,lat,...] for Cesium).
  const footprintHierarchy = useMemo(() => {
    const flat: number[] = []
    for (const s of coverage.samples) {
      flat.push(s.point.lon, s.point.lat)
    }
    return new PolygonHierarchy(Cartesian3.fromDegreesArray(flat))
  }, [coverage.samples])

  const fitRadius = Math.max(
    coverage.nominal_detection_range_m,
    coverage.max_engagement_range_m,
  )

  return (
    <div className="an-map">
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
        contextOptions={VIEWER_CONTEXT_OPTIONS}
      >
        <TopDownCamera lat={asset.lat} lon={asset.lon} fitRadiusM={fitRadius} />

        {/* Range rings */}
        {ring('detection-ring', asset.lat, asset.lon, coverage.nominal_detection_range_m, '#5fb6ff', 0.7)}
        {ring('max-engagement-ring', asset.lat, asset.lon, coverage.max_engagement_range_m, '#ffb020', 0.7)}
        {ring('keepout-ring', asset.lat, asset.lon, coverage.keep_out_radius_m, '#ff3d55', 0.9)}

        {/* Defended footprint polygon (green = reach outside keep-out) */}
        <Entity name="defended-footprint">
          <PolygonGraphics
            hierarchy={footprintHierarchy}
            height={2}
            material={Color.fromCssColorString('#00FFBC').withAlpha(0.22)}
            outline
            outlineColor={Color.fromCssColorString('#00FFBC').withAlpha(0.9)}
          />
        </Entity>

        {/* Per-bearing sample markers · green if defended, red if not */}
        {coverage.samples.map((s, i) => (
          <Entity
            key={i}
            name={`sample-${i}`}
            position={Cartesian3.fromDegrees(s.point.lon, s.point.lat, 3)}
          >
            <EllipseGraphics
              semiMajorAxis={45}
              semiMinorAxis={45}
              height={3}
              material={Color.fromCssColorString(
                s.p_negate >= coverage.threshold ? '#00FFBC' : '#ff3d55',
              ).withAlpha(0.95)}
            />
          </Entity>
        ))}

        {/* Protected asset marker */}
        <Entity name="asset" position={Cartesian3.fromDegrees(asset.lon, asset.lat, 3)}>
          <EllipseGraphics
            semiMajorAxis={70}
            semiMinorAxis={70}
            height={3}
            material={Color.WHITE.withAlpha(0.95)}
          />
        </Entity>
      </Viewer>
    </div>
  )
}
