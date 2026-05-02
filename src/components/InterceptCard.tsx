import type { CUASTelemetry } from '../types'

interface Props { tel: CUASTelemetry }

export default function InterceptCard({ tel }: Props) {
  const sol = tel.intercept_solution
  if (!sol) return null

  const probColor =
    sol.probability === 'high' ? 'green' : sol.probability === 'medium' ? 'amber' : 'red'

  return (
    <div className="panel-section">
      <div className="panel-label" style={{ color: 'var(--green)' }}>
        INTERCEPT SOLUTION
      </div>
      <div className="card intercept">
        <div className="row">
          <span className="lbl">CAPTURE PT</span>
          <span className="val green">VIP +{sol.range_from_vip_m}m</span>
        </div>
        <div className="row">
          <span className="lbl">ETA</span>
          <span className="val green">T+{sol.eta_to_capture_s}s</span>
        </div>
        <div className="row">
          <span className="lbl">PROBABILITY</span>
          <span className={`val ${probColor}`}>{sol.probability.toUpperCase()}</span>
        </div>
        <div className="row">
          <span className="lbl">ZONE</span>
          <span className="val">
            {sol.preferred_zone}{' '}
            <span style={{ color: 'var(--text3)' }}>
              ({sol.preferred_zone === 'A' ? '고확률' : sol.preferred_zone === 'B' ? '중간' : '저고도'})
            </span>
          </span>
        </div>
        <div className="row">
          <span className="lbl">CIVILIAN AVOID</span>
          <span className={`val ${sol.civilian_avoidance_active ? 'green' : 'red'}`}>
            {sol.civilian_avoidance_active ? 'ACTIVE' : 'OFF'}
          </span>
        </div>
        <div className="row">
          <span className="lbl">PAYLOAD</span>
          <span className="val">
            {sol.payload_mode === 'net_gun' ? 'NET GUN' : 'SHOTGUN'}
          </span>
        </div>
      </div>
    </div>
  )
}
