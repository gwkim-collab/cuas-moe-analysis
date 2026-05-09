import type { CUASTelemetry } from '../types'

interface Props { tel: CUASTelemetry }

export default function ThreatCard({ tel }: Props) {
  const trackId = tel.kill_chain.target_track_id
  const track = trackId ? tel.tracks[trackId] : null
  const phase = tel.kill_chain.phase

  if (!track) {
    return (
      <div className="panel-section">
        <div className="panel-label">THREAT</div>
        <div className="card empty">
          <span className="empty-text">NO ACTIVE TRACKS</span>
        </div>
      </div>
    )
  }

  const isHostile = track.classification === 'hostile_fpv'
  const headerColor = isHostile ? 'var(--red)' : 'var(--amber)'

  // Range escalation · further = neutral, closing = amber, < 1km = red.
  const rangeKm = track.range_m / 1000
  const rangeClass = rangeKm < 1 ? 'red' : rangeKm < 2 ? 'amber' : ''

  return (
    <div className="panel-section">
      <div className="panel-label" style={{ color: headerColor }}>
        THREAT · {track.track_id}
      </div>
      <div className={`card threat ${isHostile ? 'hostile' : 'unknown'}`}>
        <div className="row">
          <span className="lbl">CLASS</span>
          <span className="val" style={{ color: headerColor }}>
            {isHostile ? 'HOSTILE FPV' : 'UNKNOWN UAS'}
          </span>
        </div>
        <div className="row">
          <span className="lbl">CONFIDENCE</span>
          <span className="val">{(track.confidence * 100).toFixed(0)}%</span>
        </div>
        <div className="row">
          <span className="lbl">BEARING</span>
          <span className="val">{track.bearing_deg.toFixed(0)}°</span>
        </div>
        <div className="row">
          <span className="lbl">RANGE</span>
          <span className={`val ${rangeClass}`}>{rangeKm.toFixed(2)} km</span>
        </div>
        <div className="row">
          <span className="lbl">SPEED</span>
          <span className="val">{(track.ground_speed_m_s * 3.6).toFixed(0)} km/h</span>
        </div>
        <div className="row">
          <span className="lbl">ALTITUDE</span>
          <span className="val">{track.alt_m_agl} m AGL</span>
        </div>
        {phase !== 'detect' && (
          <>
            <div className="row">
              <span className="lbl">TYPE</span>
              <span className="val">{track.type_hint}</span>
            </div>
            <div className="row">
              <span className="lbl">RF STATUS</span>
              <span className="val red">RF-DARK</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
