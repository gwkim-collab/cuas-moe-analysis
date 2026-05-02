import { useEffect, useState } from 'react'
import type { CUASTelemetry } from '../types'

interface Props {
  tel: CUASTelemetry
  running: boolean
}

export default function TopBar({ tel, running }: Props) {
  const [now, setNow] = useState<string>(() => new Date().toTimeString().slice(0, 8))
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date().toTimeString().slice(0, 8))
    }, 500)
    return () => window.clearInterval(id)
  }, [])

  const phase = tel.kill_chain.phase
  const threatActive = phase !== 'standby' && phase !== 'report'

  const radarOnline = tel.vehicles[30]?.heartbeat != null
  const u10Ready = tel.vehicles[10]?.heartbeat != null
  const mcOnline = tel.vehicles[20]?.heartbeat != null

  // Title text changes with phase.
  const titleText =
    phase === 'detect' || phase === 'confirm'
      ? '⚠ THREAT DETECTED · MULTI-SENSOR FUSION'
      : phase === 'approve'
        ? '⚠ AWAITING OPERATOR APPROVAL'
        : phase === 'launch' || phase === 'capture'
          ? '⚡ ENGAGEMENT IN PROGRESS'
          : phase === 'report'
            ? '✓ TARGET NEUTRALIZED · DEBRIEF'
            : 'AB-U10 C-UAS GCS · 여의도 · 주요시설 PROTECTION'

  const titleColor = threatActive
    ? phase === 'launch' || phase === 'capture'
      ? 'var(--amber)'
      : 'var(--red)'
    : phase === 'report'
      ? 'var(--green)'
      : 'var(--text2)'

  const topbarClass = `topbar ${threatActive ? 'threat' : ''} ${phase === 'report' ? 'success' : ''}`

  return (
    <div className={topbarClass}>
      <div className="tb-logo" style={{ color: threatActive ? 'var(--red)' : 'var(--green)' }}>
        AIRBILITY
      </div>
      <div className="tb-sep" />
      <div className="tb-title" style={{ color: titleColor }}>
        {phase === 'standby' ? 'AB-U10 C-UAS GCS · 여의도 · 주요시설 PROTECTION' : titleText}
      </div>
      <div className="tb-spacer" />
      <div className="tb-indicators">
        {running && (
          <div className="tb-ind">
            <div className="tb-dot dot-amber" />
            T+{(tel.scenario_clock_ms / 1000).toFixed(0)}s
          </div>
        )}
        <div className="tb-ind">
          <div className={`tb-dot ${radarOnline ? 'dot-green' : 'dot-red'}`} />
          RADAR
        </div>
        <div className="tb-ind">
          <div className={`tb-dot ${mcOnline ? 'dot-green' : 'dot-amber'}`} />
          OVERWATCH
        </div>
        <div className="tb-ind">
          <div className={`tb-dot ${u10Ready ? 'dot-green' : 'dot-amber'}`} />
          AB-U10
        </div>
        <div className="tb-ind">
          <div className="tb-dot dot-green" />
          GPS · RTK
        </div>
      </div>
      <div className="tb-sep" />
      <div className="tb-time">{now}</div>
    </div>
  )
}
