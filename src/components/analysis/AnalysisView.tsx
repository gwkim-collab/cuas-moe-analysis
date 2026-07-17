import { useMemo, useRef, useState } from 'react'
import {
  computeMoe,
  defaultScenario,
  runMonteCarlo,
  buildReport,
  reportToJson,
  reportToMarkdown,
  scenarioToCsvFile,
  applyCsv,
  type Scenario,
} from '../../analysis'
import AnalysisPanel from './AnalysisPanel'
import MoeResultCards from './MoeResultCards'
import McResults from './McResults'
import CoverageView from './CoverageView'
import TradeView from './TradeView'
import SpecView from './SpecView'
import ReferenceView from './ReferenceView'
import { downloadText, fileStamp } from './download'
import './analysis.css'

interface Props {
  onExit: () => void
}

type AnalysisType = 'engagement' | 'coverage' | 'trade' | 'spec' | 'reference'
type Fidelity = 'analytical' | 'montecarlo'

const TYPE_LABELS: Record<AnalysisType, string> = {
  engagement: '교전 효과도',
  coverage: '방어 커버리지',
  trade: '트레이드 스터디',
  spec: '스펙 역산',
  reference: '파라미터 설명',
}

/**
 * Analysis mode.
 *  · engagement (Phase 1) — single-scenario Pk-chain MOE (analytical or MC).
 *  · coverage   (Phase 2) — 360° defended-footprint sweep on a 3D map.
 *  · trade      (Phase 4) — 1D/2D parameter sweep + tornado sensitivity.
 *  · spec       (Phase 4) — inverse solve: parameter needed for a target MOE.
 * Plus JSON/Markdown report export.
 *
 * One editable Scenario is shared across analysis types; results
 * recompute live (the analysis core is pure).
 */
export default function AnalysisView({ onExit }: Props) {
  const [scenario, setScenario] = useState<Scenario>(() => defaultScenario())
  const [type, setType] = useState<AnalysisType>('engagement')
  const [fidelity, setFidelity] = useState<Fidelity>('analytical')
  const [trials, setTrials] = useState(3000)
  const [seed, setSeed] = useState(2026)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const engagementResult = useMemo(() => computeMoe(scenario), [scenario])
  const mcResult = useMemo(
    () =>
      fidelity === 'montecarlo' && type === 'engagement'
        ? runMonteCarlo(scenario, { trials, seed, uncertainty: { bearing_uniform: false } })
        : null,
    [fidelity, type, scenario, trials, seed],
  )

  const exportReport = (fmt: 'json' | 'md') => {
    const report = buildReport(scenario, new Date().toISOString())
    const stamp = fileStamp(new Date())
    if (fmt === 'json') {
      downloadText(`airlock-moe-${stamp}.json`, reportToJson(report), 'application/json')
    } else {
      downloadText(`airlock-moe-${stamp}.md`, reportToMarkdown(report), 'text/markdown')
    }
  }

  const exportCsv = () => {
    // scenarioToCsvFile carries a UTF-8 BOM so Excel reads the Korean columns.
    downloadText(`airlock-params-${fileStamp(new Date())}.csv`, scenarioToCsvFile(scenario), 'text/csv')
  }

  // Static default-scenario sample (public/samples), generated from the param
  // registry via `pnpm gen:sample`. Lets a user grab the exact CSV format —
  // and see every parameter's 의미/출처 — without launching a run first.
  const sampleCsvHref = `${import.meta.env.BASE_URL}samples/scenario-default.csv`

  const onImportFile = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const res = applyCsv(defaultScenario(), text)
    setScenario(res.scenario)
    if (res.unknownKeys.length > 0) {
      // eslint-disable-next-line no-alert
      alert(`불러오기 완료: ${res.applied}개 적용.\n인식 못한 key ${res.unknownKeys.length}개: ${res.unknownKeys.slice(0, 5).join(', ')}`)
    }
    ev.target.value = '' // allow re-importing the same file
  }

  return (
    <div className="an-view">
      <header className="an-topbar">
        <div className="an-topbar-left">
          <span className="an-logo">AIRBILITY</span>
          <span className="an-topbar-sep" />
          <span className="an-topbar-title">효과도 분석 · MOE ANALYSIS</span>
          <div className="an-type-switch">
            {(Object.keys(TYPE_LABELS) as AnalysisType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`an-type-btn ${type === t ? 'is-active' : ''}`}
                onClick={() => setType(t)}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="an-topbar-right">
          <span className="an-tb-group">
            <button type="button" className="an-btn-ghost" onClick={() => fileInputRef.current?.click()}>
              ↑ CSV 불러오기
            </button>
            <button type="button" className="an-btn-ghost" onClick={exportCsv}>
              ↓ CSV 저장
            </button>
            <a className="an-btn-ghost" href={sampleCsvHref} download="airlock-params-sample.csv" title="기본 시나리오 샘플 CSV (변수별 의미·출처 포함)">
              ⤓ 샘플
            </a>
          </span>
          <span className="an-tb-group">
            <button type="button" className="an-btn-ghost" onClick={() => exportReport('json')}>
              ↓ JSON
            </button>
            <button type="button" className="an-btn-ghost" onClick={() => exportReport('md')}>
              ↓ 리포트(MD)
            </button>
          </span>
          <button type="button" className="an-btn-exit" onClick={onExit}>
            ← 운용 화면 (O)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={onImportFile}
          />
        </div>
      </header>

      <div className="an-body">
        <AnalysisPanel
          scenario={scenario}
          onChange={setScenario}
          onReset={() => setScenario(defaultScenario())}
        />

        <div className="an-content">
          {type === 'engagement' && (
            <div className="an-fidelity">
              <div className="an-type-switch">
                <button
                  type="button"
                  className={`an-type-btn ${fidelity === 'analytical' ? 'is-active' : ''}`}
                  onClick={() => setFidelity('analytical')}
                >
                  해석식
                </button>
                <button
                  type="button"
                  className={`an-type-btn ${fidelity === 'montecarlo' ? 'is-active' : ''}`}
                  onClick={() => setFidelity('montecarlo')}
                >
                  몬테카를로
                </button>
              </div>
              {fidelity === 'montecarlo' && (
                <div className="an-mc-controls">
                  <label>
                    시행수
                    <input
                      type="number"
                      min={100}
                      step={500}
                      value={trials}
                      onChange={(e) => setTrials(Math.max(100, parseInt(e.target.value) || 100))}
                    />
                  </label>
                  <label>
                    seed
                    <input
                      type="number"
                      value={seed}
                      onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {type === 'engagement' &&
            (fidelity === 'analytical' || !mcResult ? (
              <MoeResultCards result={engagementResult} />
            ) : (
              <McResults result={mcResult} />
            ))}

          {type === 'coverage' && <CoverageView scenario={scenario} />}
          {type === 'trade' && <TradeView scenario={scenario} />}
          {type === 'spec' && <SpecView scenario={scenario} />}
          {type === 'reference' && <ReferenceView scenario={scenario} />}
        </div>
      </div>
    </div>
  )
}
