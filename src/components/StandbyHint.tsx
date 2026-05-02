/**
 * Big start-screen hint shown only on first load (before any scenario
 * has run). Disappears as soon as ▶ START is pressed.
 */
export default function StandbyHint() {
  return (
    <div className="standby-hint">
      <div className="sh-card">
        <div className="sh-eyebrow">AB-U10 C-UAS GCS · MOCKUP</div>
        <div className="sh-title">시나리오 시연 준비 완료</div>
        <div className="sh-body">
          우측 패널 <span className="kbd">▶ START</span> 또는 <span className="kbd">Space</span> 키로 시작.
          <br />
          AUTO · 50초 자동 시연 / MANUAL · 운용자 결정 (Enter 키로 LAUNCH)
        </div>
        <div className="sh-icons">
          <div className="sh-icon">📡 RADAR</div>
          <div className="sh-sep">→</div>
          <div className="sh-icon">🎯 CONFIRM</div>
          <div className="sh-sep">→</div>
          <div className="sh-icon">✓ APPROVE</div>
          <div className="sh-sep">→</div>
          <div className="sh-icon">⬆ LAUNCH</div>
          <div className="sh-sep">→</div>
          <div className="sh-icon">⚡ CAPTURE</div>
          <div className="sh-sep">→</div>
          <div className="sh-icon">📄 REPORT</div>
        </div>
      </div>
    </div>
  )
}
