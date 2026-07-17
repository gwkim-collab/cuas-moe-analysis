import { useMemo } from 'react'
import { computeCoverage, type Scenario } from '../../analysis'
import CoverageMap from './CoverageMap'

interface Props {
  scenario: Scenario
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

/**
 * Coverage view · Phase 2.
 * Sweeps the threat approach bearing 360° and shows the defended
 * footprint on a top-down Cesium map plus summary metrics.
 */
export default function CoverageView({ scenario }: Props) {
  const coverage = useMemo(
    () => computeCoverage(scenario, { bearings: 72, threshold: 0.7 }),
    [scenario],
  )

  return (
    <div className="an-coverage">
      <div className="an-coverage-summary">
        <div className="an-cov-metric">
          <div className="ab-spec">평균 P_NEGATE</div>
          <div className="an-cov-value">{pct(coverage.mean_p_negate)}</div>
        </div>
        <div className="an-cov-metric">
          <div className="ab-spec">방어 커버리지 (≥{pct(coverage.threshold)})</div>
          <div className="an-cov-value">{pct(coverage.defended_fraction)}</div>
          <div className="ab-small an-cov-sub">방위 {coverage.samples.length}개 스윕</div>
        </div>
        <div className="an-cov-legend">
          <span><i className="an-dot" style={{ background: '#ff3d55' }} /> keep-out {coverage.keep_out_radius_m.toFixed(0)}m</span>
          <span><i className="an-dot" style={{ background: '#ffb020' }} /> 최대교전 {coverage.max_engagement_range_m.toFixed(0)}m</span>
          <span><i className="an-dot" style={{ background: '#5fb6ff' }} /> 탐지 {coverage.nominal_detection_range_m.toFixed(0)}m</span>
          <span><i className="an-dot" style={{ background: '#00FFBC' }} /> 방어 footprint</span>
        </div>
      </div>
      <CoverageMap coverage={coverage} />
    </div>
  )
}
