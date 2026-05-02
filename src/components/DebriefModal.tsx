import type { CUASTelemetry } from '../types'
import { PHASE_SCHEDULE } from '../scenario'

interface Props {
  tel: CUASTelemetry
  onReset: () => void
}

/**
 * Post-engagement debrief — shown overlaid on the tactical map when
 * kill_chain.phase === 'report'. Summarizes the engagement and offers
 * a "new scenario" reset.
 */
export default function DebriefModal({ tel, onReset }: Props) {
  const trackId = tel.kill_chain.target_track_id
  const track = trackId ? tel.tracks[trackId] : null
  const sol = tel.intercept_solution
  if (!track) return null

  // Engagement metrics
  const reactionMs = PHASE_SCHEDULE.capture - PHASE_SCHEDULE.detect
  const operatorDecisionMs = PHASE_SCHEDULE.launch - PHASE_SCHEDULE.approve
  const interceptorTransitMs = PHASE_SCHEDULE.capture - PHASE_SCHEDULE.launch

  return (
    <div className="debrief-overlay">
      <div className="debrief-card">
        <div className="dbf-header">
          <div>
            <div className="dbf-status">✓ TARGET NEUTRALIZED</div>
            <div className="dbf-sub">DEBRIEF · {track.track_id}</div>
          </div>
          <button className="dbf-close" onClick={onReset}>↻ NEW SCENARIO</button>
        </div>

        <div className="dbf-grid">
          {/* Engagement summary */}
          <div className="dbf-section">
            <div className="dbf-label">ENGAGEMENT SUMMARY</div>
            <div className="dbf-rows">
              <Row k="OUTCOME" v="NEUTRALIZED · INTACT" tone="green" />
              <Row k="PAYLOAD USED" v={tel.payload_mode === 'net_gun' ? 'NET GUN · 3×3m mesh' : 'SHOTGUN · spread'} />
              <Row k="CAPTURE LOCATION" v={`VIP +${(track.range_m).toFixed(0)}m W`} tone="green" />
              <Row k="CAPTURE COORDINATES" v={`${track.lat_deg.toFixed(5)}° N · ${track.lon_deg.toFixed(5)}° E`} mono />
              <Row k="CAPTURE ALT (AGL)" v="95 m" />
              <Row k="MODE" v={tel.scenario_mode.toUpperCase()} />
            </div>
          </div>

          {/* Hostile drone */}
          <div className="dbf-section">
            <div className="dbf-label">HOSTILE DRONE</div>
            <div className="dbf-rows">
              <Row k="CLASS" v="FPV · FIBER OPTIC" tone="red" />
              <Row k="GROUND SPEED" v="118 km/h (32.8 m/s)" />
              <Row k="ALTITUDE @ DETECT" v="85 m AGL" />
              <Row k="RF STATUS" v="RF-DARK · NO LINK CUT" tone="red" />
              <Row k="CONFIDENCE @ KILL" v={`${(track.confidence * 100).toFixed(0)}%`} tone="green" />
              <Row k="INGRESS BEARING" v="W (Han River 도하)" />
            </div>
          </div>

          {/* Timing */}
          <div className="dbf-section">
            <div className="dbf-label">REACTION TIMING</div>
            <div className="dbf-rows">
              <Row k="DETECT → CAPTURE" v={`${(reactionMs / 1000).toFixed(0)} s`} tone="green" />
              <Row k="OPERATOR DECISION" v={`${(operatorDecisionMs / 1000).toFixed(0)} s`} />
              <Row k="AB-U10 TRANSIT" v={`${(interceptorTransitMs / 1000).toFixed(0)} s`} />
              <Row k="VIP MARGIN" v={`${sol?.range_from_vip_m ?? '—'} m`} tone="green" />
            </div>
          </div>

          {/* AB-U10 state */}
          <div className="dbf-section">
            <div className="dbf-label">AB-U10 STATE</div>
            <div className="dbf-rows">
              <Row k="STATUS" v="RTB · INBOUND TO PAD" tone="green" />
              <Row k="BATTERY REMAINING" v={`${tel.vehicles[10]?.battery?.remaining_pct?.toFixed(1)}%`} tone="green" />
              <Row k="MAX SPEED REACHED" v="180 km/h" />
              <Row k="PAYLOAD STATUS" v={tel.payload_mode === 'net_gun' ? 'NET DEPLOYED · CONSUMED' : 'SHELLS EXPENDED'} />
            </div>
          </div>
        </div>

        {/* AB-U10 differentiator callout */}
        <div className="dbf-callout">
          ⚡ <strong>1.0 km from VIP</strong> · 일반 멀티콥터 + 그물포 운용 한계 (≤200m) 대비
          AB-U10는 <strong>5×</strong> 거리에서 격추 — 활주로 불요·VTOL·180 km/h
        </div>

        <div className="dbf-footer">
          <button className="dbf-btn-secondary" onClick={onReset}>↻ NEW SCENARIO</button>
          <button className="dbf-btn-primary" disabled>📄 EXPORT DEBRIEF (PDF)</button>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, tone, mono }: { k: string; v: string; tone?: 'green' | 'red' | 'amber'; mono?: boolean }) {
  return (
    <div className="dbf-row">
      <span className="dbf-k">{k}</span>
      <span className={`dbf-v ${tone ?? ''} ${mono ? 'mono' : ''}`}>{v}</span>
    </div>
  )
}
