import type { CUASTelemetry } from '../types'
import { KILL_CHAIN_LABELS, KILL_CHAIN_ORDER } from '../mockData'

interface Props { tel: CUASTelemetry }

/**
 * 6-stage kill chain: STANDBY → DETECT → CONFIRM → APPROVE → LAUNCH → CAPTURE → REPORT.
 * (STANDBY hidden as a step; counted as "before phase 0".)
 */
export default function KillChainTimeline({ tel }: Props) {
  const visibleSteps = KILL_CHAIN_ORDER.filter((p) => p !== 'standby')
  // indexOf returns -1 for 'standby' (which is filtered out) — that's the
  // intended "no step active" sentinel.
  const currentIdx = visibleSteps.indexOf(tel.kill_chain.phase as typeof visibleSteps[number])
  // currentIdx = -1 when phase is 'standby' (no step active yet).

  return (
    <div className="panel-section">
      <div className="panel-label">KILL CHAIN</div>
      <div className="kc-steps">
        {visibleSteps.map((phase, i) => {
          let cls = ''
          if (currentIdx > i) cls = 'done'
          else if (currentIdx === i) cls = 'current'
          return (
            <div key={phase} className="kc-step">
              <div className={`kc-dot ${cls}`} />
              <div className="kc-lbl">{KILL_CHAIN_LABELS[phase]}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
