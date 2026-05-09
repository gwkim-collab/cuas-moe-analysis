import { useEffect, useRef } from 'react'
import type { CUASTelemetry, StatusTextMessage } from '../types'

interface Props { tel: CUASTelemetry }

const SEV_COLOR: Record<StatusTextMessage['severity'], string> = {
  EMERGENCY: 'var(--red)',
  ALERT: 'var(--red)',
  CRITICAL: 'var(--red)',
  ERROR: 'var(--red)',
  WARNING: 'var(--amber)',
  // NOTICE = "normal but significant" — progress events like APPROVED /
  // LAUNCHING / NEUTRALIZED. Green fits the "system OK / step done"
  // semantic better than blue.
  NOTICE: 'var(--green)',
  INFO: 'var(--text2)',
  DEBUG: 'var(--text3)',
}

export default function StatusLog({ tel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
  }, [tel.status_texts.length])

  const msgs = [...tel.status_texts].slice(-12)

  return (
    <div className="panel-section status-log-section">
      <div className="panel-label">EVENT LOG</div>
      <div ref={ref} className="status-log">
        {msgs.map((m, i) => (
          <div key={i} className="log-line">
            <span className="log-t">
              T+{(m.received_ms / 1000).toFixed(0).padStart(2, '0')}s
            </span>
            <span className="log-sev" style={{ color: SEV_COLOR[m.severity] }}>
              {m.severity.slice(0, 4)}
            </span>
            <span className="log-msg">{m.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
