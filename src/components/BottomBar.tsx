import type { CUASTelemetry } from '../types'

interface Props { tel: CUASTelemetry }

export default function BottomBar({ tel }: Props) {
  const u10 = tel.vehicles[10]
  const mc = tel.vehicles[20]
  return (
    <div className="bottombar">
      <div className="bb-item">
        <span className="bb-label">AB-U10</span>
        <span className="bb-val-green">READY</span>
      </div>
      <div className="bb-item">
        <span className="bb-label">BATT</span>
        <span className="bb-val-green">{u10?.battery?.remaining_pct ?? '—'}%</span>
      </div>
      <div className="bb-item">
        <span className="bb-label">MC</span>
        <span className="bb-val-green">{mc?.position?.alt_m ?? '—'} m AGL</span>
      </div>
      <div className="bb-item">
        <span className="bb-label">RADAR</span>
        <span className="bb-val-green">SCANNING · 5km</span>
      </div>
      <div className="bb-item">
        <span className="bb-label">GPS</span>
        <span className="bb-val-green">{u10?.gps?.fix_type.replace('GPS_FIX_TYPE_', '')} · {u10?.gps?.satellites_visible} SAT</span>
      </div>
      <div className="bb-spacer" />
      <div className="bb-item">
        <span className="bb-label">LINK</span>
        <span className="bb-val-green">MAVLink · 18ms</span>
      </div>
      <div className="bb-item">
        <span className="bb-label">MODE</span>
        <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 10 }}>
          C-UAS · AUTO
        </span>
      </div>
      <div className="bb-item">
        <span className="bb-label">VER</span>
        <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 10 }}>
          {tel.gcs_version}
        </span>
      </div>
    </div>
  )
}
