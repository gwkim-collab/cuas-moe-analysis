interface Props {
  running: boolean
  isRecording: boolean
  scenarioClockMs: number
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onRecord: () => void
}

export default function ScenarioControls(p: Props) {
  const t = p.scenarioClockMs / 1000
  const mm = Math.floor(t / 60)
  const ss = Math.floor(t % 60)
  const clockStr = `T+${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`

  return (
    <div className="panel-section scenario-controls">
      <div className="sc-row">
        <span className="sc-clock">{clockStr}</span>
        <span className="sc-state">
          {p.isRecording ? (
            <>
              <span className="dot-rec" />
              <span style={{ color: 'var(--red)' }}>REC</span>
            </>
          ) : p.running ? (
            <>
              <span className="dot-live" />
              RUNNING
            </>
          ) : (
            'PAUSED'
          )}
        </span>
      </div>
      <div className="sc-buttons">
        {!p.running ? (
          <button className="sc-btn primary" onClick={p.onStart}>▶ START</button>
        ) : (
          <button className="sc-btn" onClick={p.onPause}>⏸ PAUSE</button>
        )}
        <button className="sc-btn" onClick={p.onReset}>↻ RESET</button>
      </div>
      <button
        className={`sc-btn record ${p.isRecording ? 'active' : ''}`}
        onClick={p.onRecord}
        disabled={p.isRecording}
        title="화면 녹화 → WebM 다운로드 (단축키 G)"
      >
        {p.isRecording ? '🔴 RECORDING…' : '📹 RECORD DEMO (WebM)'}
      </button>
    </div>
  )
}
