import type { CUASTelemetry } from '../types'
import { PHASE_SCHEDULE } from '../scenario'

interface Props {
  tel: CUASTelemetry
  onApprove: () => void
  onDismiss: () => void
}

export default function ActionButtons({ tel, onApprove, onDismiss }: Props) {
  const phase = tel.kill_chain.phase
  const isManual = tel.scenario_mode === 'manual'

  // APPROVE button is "live" only when MANUAL + APPROVE phase.
  const approveActive = isManual && phase === 'approve'

  // DISMISS available whenever there's an active track that's not yet captured.
  const dismissActive = phase !== 'standby' && phase !== 'capture' && phase !== 'report'

  // ETA to APPROVE phase — shown during DETECT/CONFIRM in MANUAL mode so the
  // operator knows how many seconds until they can act.
  const etaToApprove = Math.max(
    0,
    Math.ceil((PHASE_SCHEDULE.approve - tel.scenario_clock_ms) / 1000),
  )

  let launchText: string
  let launchSub: string | null = null
  if (phase === 'standby') {
    launchText = 'STANDBY · NO TARGET'
  } else if (phase === 'detect') {
    launchText = 'CLASSIFYING TARGET'
    launchSub = isManual ? `APPROVE 활성까지 T+${etaToApprove}s` : null
  } else if (phase === 'confirm') {
    launchText = 'MULTI-SENSOR CONFIRM'
    launchSub = isManual ? `APPROVE 활성까지 T+${etaToApprove}s` : null
  } else if (phase === 'approve') {
    launchText = isManual ? '✓ APPROVE · LAUNCH AB-U10' : 'AWAITING APPROVAL (AUTO)'
  } else if (phase === 'launch') {
    launchText = '⬆ AB-U10 AIRBORNE'
  } else if (phase === 'capture') {
    launchText = '⚡ ENGAGING TARGET'
  } else {
    launchText = '✓ TARGET NEUTRALIZED'
  }

  return (
    <div className="panel-section action-area" style={{ borderBottom: 'none' }}>
      <button
        className={`btn-launch ${approveActive ? 'live' : 'disabled'}`}
        onClick={approveActive ? onApprove : undefined}
        disabled={!approveActive}
      >
        {launchText}
      </button>
      {launchSub && (
        <div className="btn-sub">{launchSub}</div>
      )}
      <button
        className={`btn-dismiss ${dismissActive ? 'live' : 'disabled'}`}
        onClick={dismissActive ? onDismiss : undefined}
        disabled={!dismissActive}
      >
        ✕ DISMISS · MARK NON-HOSTILE
      </button>
    </div>
  )
}
