import type { CUASTelemetry, PayloadMode, ScenarioMode } from '../types'
import KillChainTimeline from './KillChainTimeline'
import StatusLog from './StatusLog'
import ThreatCard from './ThreatCard'
import InterceptCard from './InterceptCard'
import ScenarioControls from './ScenarioControls'
import ActionButtons from './ActionButtons'

interface Props {
  tel: CUASTelemetry
  running: boolean
  isRecording: boolean
  onScenarioMode: (m: ScenarioMode) => void
  onPayloadMode: (p: PayloadMode) => void
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onApprove: () => void
  onDismiss: () => void
  onRecord: () => void
}

export default function RightPanel(p: Props) {
  const { tel, running } = p
  const u10 = tel.vehicles[10]
  const phase = tel.kill_chain.phase

  // Color cue for AB-U10 status badge based on phase.
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
    phase === 'launch' || phase === 'capture'
      ? 'red'
      : phase === 'approve' || phase === 'confirm'
        ? 'amber'
        : 'green'

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

      {/* Mode toggles */}
      <div className="panel-section">
        <div className="panel-label">SCENARIO MODE</div>
        <div className="toggle-row">
          <button
            className={`toggle-btn ${tel.scenario_mode === 'auto' ? 'active' : ''}`}
            onClick={() => p.onScenarioMode('auto')}
          >
            AUTO
          </button>
          <button
            className={`toggle-btn ${tel.scenario_mode === 'manual' ? 'active' : ''}`}
            onClick={() => p.onScenarioMode('manual')}
          >
            MANUAL
          </button>
        </div>
        <div className="toggle-hint">
          {tel.scenario_mode === 'auto'
            ? 'AUTO · 시나리오가 자동 진행됩니다 (시연용).'
            : 'MANUAL · APPROVE 단계에서 운용자 결정 대기.'}
        </div>
      </div>

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
            <span className="val green">
              {u10?.battery?.remaining_pct?.toFixed(1) ?? '—'}%
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

      {/* Action area pinned to bottom */}
      <ActionButtons
        tel={tel}
        onApprove={p.onApprove}
        onDismiss={p.onDismiss}
      />
    </aside>
  )
}
