/**
 * Small hotkey reference, top-right. Always visible (low opacity until hover).
 */
export default function HotkeyHint() {
  return (
    <div className="hotkey-hint">
      <div className="hk-row"><span className="kbd">Space</span> play/pause</div>
      <div className="hk-row"><span className="kbd">R</span> reset</div>
      <div className="hk-row"><span className="kbd">N</span> / <span className="kbd">S</span> payload</div>
      <div className="hk-row"><span className="kbd">G</span> record demo</div>
      <div className="hk-row"><span className="kbd">F</span> reset view</div>
      <div className="hk-row"><span className="kbd">D</span> 1×/2×/4× speed</div>
    </div>
  )
}
