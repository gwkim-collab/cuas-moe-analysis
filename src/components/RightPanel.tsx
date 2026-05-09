import type { CUASTelemetry, PayloadMode } from '../types'
import KillChainTimeline from './KillChainTimeline'
import StatusLog from './StatusLog'
import ThreatCard from './ThreatCard'
import InterceptCard from './InterceptCard'
import ScenarioControls from './ScenarioControls'

interface Props {
  tel: CUASTelemetry
  running: boolean
  isRecording: boolean
  onPayloadMode: (p: PayloadMode) => void
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onRecord: () => void
}

export default function RightPanel(p: Props) {
  const { tel, running } = p
  const u10 = tel.vehicles[10]
  const phase = tel.kill_chain.phase

  // Color cue for AB-U10 status badge based on phase.
  // Semantics: green = nominal / progress, amber = caution / decision,
  // red = engagement-active (only the actual KILL moment lights red).
  const u10StatusText =
    phase === 'launch'
      ? 'AIRBORNE'
      : phase === 'capture'
        ? 'INTERCEPTING'
        : phase === 'report'
          ? 'RTB'
          : phase === 'approve' || phase === 'confirm'
            ? 'ARMED · READY'
            : 'STANDBY'

  const u10StatusClass =
    phase === 'capture'
      ? 'red'                              // active engagement only
      : phase === 'approve'
        ? 'amber'                          // decision window
        : 'green'                          // standby / confirm / launch / report — nominal

  // Battery threshold coloring · ≤15% red, ≤30% amber, else green.
  const batteryPct = u10?.battery?.remaining_pct ?? null
  const batteryClass =
    batteryPct == null ? '' :
      batteryPct <= 15 ? 'red' :
        batteryPct <= 30 ? 'amber' :
          'green'

  return (
    <aside className="right-panel">
      <ScenarioControls
        running={running}
        isRecording={p.isRecording}
        scenarioClockMs={tel.scenario_clock_ms}
        onStart={p.onStart}
        onPause={p.onPause}
        onReset={p.onReset}
        onRecord={p.onRecord}
      />

      <div className="panel-section">
        <div className="panel-label">PAYLOAD</div>
        <div className="toggle-row">
          <button
            className={`toggle-btn ${tel.payload_mode === 'net_gun' ? 'active payload-net' : ''}`}
            onClick={() => p.onPayloadMode('net_gun')}
          >
            NET GUN
          </button>
          <button
            className={`toggle-btn ${tel.payload_mode === 'shotgun' ? 'active payload-shot' : ''}`}
            onClick={() => p.onPayloadMode('shotgun')}
          >
            SHOTGUN
          </button>
        </div>
        <div className="toggle-hint">
          {tel.payload_mode === 'net_gun'
            ? '민가/시설 위 · LCD 우선 · 그물로 추락'
            : '급박 · 격오지 · 즉시 무력화 우선'}
        </div>
      </div>

      <KillChainTimeline tel={tel} />

      {/* Interceptor */}
      <div className="panel-section">
        <div className="panel-label">INTERCEPTOR · AB-U10</div>
        <div className="card">
          <div className="row">
            <span className="lbl">STATUS</span>
            <span className={`val ${u10StatusClass}`}>{u10StatusText}</span>
          </div>
          <div className="row">
            <span className="lbl">PAYLOAD</span>
            <span className="val green">
              {tel.payload_mode === 'net_gun' ? 'NET GUN · ARMED' : 'SHOTGUN · ARMED'}
            </span>
          </div>
          <div className="row">
            <span className="lbl">BATTERY</span>
            <span className={`val ${batteryClass}`}>
              {batteryPct?.toFixed(1) ?? '—'}%
            </span>
          </div>
          <div className="row">
            <span className="lbl">AIRSPEED</span>
            <span className="val">{u10?.vfr_hud?.airspeed_m_s?.toFixed(0) ?? 0} m/s</span>
          </div>
          <div className="row">
            <span className="lbl">ALT (AGL)</span>
            <span className="val">{u10?.vfr_hud?.alt_m?.toFixed(0) ?? 0} m</span>
          </div>
        </div>
      </div>

      <ThreatCard tel={tel} />
      <InterceptCard tel={tel} />

      {/* Status log fills remaining vertical space */}
      <StatusLog tel={tel} />
    </aside>
  )
}
