/**
 * Small hotkey reference, top-right. Always visible (low opacity until hover).
 */
export default function HotkeyHint() {
  return (
    <div className="hotkey-hint">
      <div className="hk-row"><span className="kbd">Space</span> play/pause</div>
      <div className="hk-row"><span className="kbd">R</span> reset</div>
      <div className="hk-row"><span className="kbd">A</span> auto/manual</div>
      <div className="hk-row"><span className="kbd">N</span> / <span className="kbd">S</span> payload</div>
      <div className="hk-row"><span className="kbd">Enter</span> approve (manual)</div>
      <div className="hk-row"><span className="kbd">G</span> record demo</div>
    </div>
  )
}
