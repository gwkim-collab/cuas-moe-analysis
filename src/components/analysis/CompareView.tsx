import { useMemo, useState } from 'react'
import { computeMoe, PRESETS, presetById, type Scenario } from '../../analysis'
import { listSavedScenarios, loadScenario } from './scenarioStore'

interface Props {
  /** Scenario A — the currently edited scenario. */
  scenario: Scenario
}

const PRESET_PREFIX = 'preset:'
const SAVED_PREFIX = 'saved:'

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—'
}
function pctDetect(x: number): string {
  return Number.isFinite(x) && x > 0.999 && x < 1 ? `${(x * 100).toFixed(5)}%` : pct(x)
}
function m(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(0)} m` : '—'
}

interface Row {
  label: string
  a: number
  b: number
  /** format + whether higher is better (for delta colour) */
  fmt: (x: number) => string
  higherBetter: boolean
}

/**
 * A/B comparison: the current scenario (A) vs a chosen preset / saved
 * scenario (B). Shows the kill-chain and key sub-metrics side by side with
 * the B−A delta, coloured by whether the change helps or hurts.
 */
export default function CompareView({ scenario }: Props) {
  const [sel, setSel] = useState(`${PRESET_PREFIX}${PRESETS[1]?.id ?? PRESETS[0].id}`)
  const saved = useMemo(() => listSavedScenarios(), [])

  const bScenario = useMemo<Scenario>(() => {
    if (sel.startsWith(PRESET_PREFIX)) return (presetById(sel.slice(PRESET_PREFIX.length)) ?? PRESETS[0]).build()
    if (sel.startsWith(SAVED_PREFIX)) return loadScenario(sel.slice(SAVED_PREFIX.length)) ?? scenario
    return scenario
  }, [sel, scenario])

  const bLabel = useMemo(() => {
    if (sel.startsWith(PRESET_PREFIX)) return presetById(sel.slice(PRESET_PREFIX.length))?.label ?? 'B'
    if (sel.startsWith(SAVED_PREFIX)) return sel.slice(SAVED_PREFIX.length)
    return 'B'
  }, [sel])

  const a = useMemo(() => computeMoe(scenario), [scenario])
  const b = useMemo(() => computeMoe(bScenario), [bScenario])

  const rows: Row[] = [
    { label: 'P_negate · 무력화', a: a.p_negate, b: b.p_negate, fmt: pct, higherBetter: true },
    { label: 'P_detect · 적시 탐지', a: a.breakdown.p_detect, b: b.breakdown.p_detect, fmt: pctDetect, higherBetter: true },
    { label: 'P_terminal · 종말 확인', a: a.breakdown.p_classify, b: b.breakdown.p_classify, fmt: pct, higherBetter: true },
    { label: 'P_decision · 결심', a: a.breakdown.p_decision, b: b.breakdown.p_decision, fmt: pct, higherBetter: true },
    { label: 'P_reach · 도달', a: a.breakdown.p_reach, b: b.breakdown.p_reach, fmt: pct, higherBetter: true },
    { label: 'P_kill · 살상', a: a.breakdown.p_kill, b: b.breakdown.p_kill, fmt: pct, higherBetter: true },
    { label: '획득 P_acq', a: a.optics.acquisition_prob, b: b.optics.acquisition_prob, fmt: pct, higherBetter: true },
    { label: 'Johnson 선택 과업 확률', a: a.optics.recognition_prob, b: b.optics.recognition_prob, fmt: pct, higherBetter: true },
    { label: 'EO 완료 상대거리', a: a.optics.classify_range_m, b: b.optics.classify_range_m, fmt: m, higherBetter: false },
    { label: '요격 거리', a: a.reach.intercept_range_m, b: b.reach.intercept_range_m, fmt: m, higherBetter: true },
    { label: 'Keep-out 여유', a: a.reach.margin_m, b: b.reach.margin_m, fmt: m, higherBetter: true },
  ]

  return (
    <div className="an-results">
      <div className="an-card">
        <div className="an-cmp-head">
          <div className="ab-label">시나리오 비교 · A / B</div>
          <select className="an-scn-select an-cmp-select" value={sel} onChange={(e) => setSel(e.target.value)}>
            <optgroup label="프리셋">
              {PRESETS.map((p) => (
                <option key={p.id} value={`${PRESET_PREFIX}${p.id}`}>{p.label}</option>
              ))}
            </optgroup>
            {saved.length > 0 && (
              <optgroup label="저장됨">
                {saved.map((n) => (
                  <option key={n} value={`${SAVED_PREFIX}${n}`}>{n}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div className="an-gate-note ab-small">
          A = 현재 편집 중인 시나리오 · B = 선택한 프리셋/저장본 · Δ = B − A
        </div>

        <table className="an-cmp-table">
          <thead>
            <tr>
              <th>지표</th>
              <th>A · 현재</th>
              <th>B · {bLabel}</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.b - r.a
              const helps = r.higherBetter ? d > 0 : d < 0
              const cls = Math.abs(d) < 1e-9 ? '' : helps ? 'up' : 'down'
              const sign = d > 0 ? '+' : ''
              return (
                <tr key={r.label} className={r.label.startsWith('P_negate') ? 'an-cmp-key' : ''}>
                  <td>{r.label}</td>
                  <td>{r.fmt(r.a)}</td>
                  <td>{r.fmt(r.b)}</td>
                  <td className={`an-cmp-delta ${cls}`}>
                    {Math.abs(d) < 1e-9 ? '·' : `${sign}${r.fmt(d)}`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="an-cmp-feas ab-small">
          교전 성립 — A: {a.feasible ? '✓' : '✕'} · B: {b.feasible ? '✓' : '✕'}
          {!b.feasible && b.reach.reason ? ` (B 불성립: ${b.reach.reason})` : ''}
        </div>
      </div>
    </div>
  )
}
