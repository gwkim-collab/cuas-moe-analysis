import type { KillChainPhase } from '../types'

interface Props { phase: KillChainPhase }

/**
 * Full-screen flash overlay shown briefly when entering certain phases.
 * - DETECT  → red alarm flash
 * - CAPTURE → white "neutralized" flash (kinetic event cue)
 * - REPORT  → soft green wash
 */
export default function PhaseFlash({ phase }: Props) {
  const cls =
    phase === 'detect'  ? 'flash-detect'
  : phase === 'capture' ? 'flash-capture'
  : phase === 'report'  ? 'flash-report'
  : ''
  if (!cls) return null
  return <div className={`phase-flash ${cls}`} />
}
