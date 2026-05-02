import type { CUASTelemetry } from '../types'
import RadarPPI from './cam/RadarPPI'
import MultiCopterEO from './cam/MultiCopterEO'
import U10FrontCam from './cam/U10FrontCam'

interface Props { tel: CUASTelemetry }

/**
 * Left rail · 3 stacked sensor panes.
 *  1. RADAR PPI (Fortem R30)
 *  2. MC-01 EO/IR top-down
 *  3. AB-U10 forward EO
 */
export default function CameraStack({ tel }: Props) {
  const radarOnline = tel.vehicles[30]?.heartbeat != null
  const mcOnline = tel.vehicles[20]?.heartbeat != null
  const u10Ready = tel.vehicles[10]?.heartbeat != null
  const phase = tel.kill_chain.phase

  // U10 cam status varies with phase
  const u10CamStatus =
    phase === 'launch' || phase === 'capture'
      ? 'AI LOCK'
      : phase === 'report'
        ? 'RTB'
        : 'STANDBY'

  return (
    <div className="camera-stack">
      <CamPane title="RADAR · FORTEM R30" status="SCANNING" online={radarOnline}>
        <RadarPPI tel={tel} />
      </CamPane>

      <CamPane title="MC-01 · EO/IR (NADIR)" status="ORBITING · 45m" online={mcOnline}>
        <MultiCopterEO tel={tel} />
      </CamPane>

      <CamPane
        title="AB-U10 · EO FWD"
        status={u10CamStatus}
        statusKind={
          phase === 'launch' || phase === 'capture'
            ? 'amber'
            : phase === 'report'
              ? 'green'
              : 'green'
        }
        online={u10Ready}
      >
        <U10FrontCam tel={tel} />
      </CamPane>
    </div>
  )
}

function CamPane({
  title,
  status,
  online,
  statusKind = 'green',
  children,
}: {
  title: string
  status: string
  online: boolean
  statusKind?: 'green' | 'amber'
  children: React.ReactNode
}) {
  const cls = !online ? 'red' : statusKind
  return (
    <div className="cam-pane">
      <div className="cam-header">
        <span className="cam-title">{title}</span>
        <span className={`cam-status cs-${cls}`}>{online ? status : 'OFFLINE'}</span>
      </div>
      <div className="cam-body">{children}</div>
    </div>
  )
}
