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
  validateScenario,
  type Scenario,
} from '../../analysis'
import AnalysisPanel from './AnalysisPanel'
import MoeResultCards from './MoeResultCards'
import McResults from './McResults'
import CoverageView from './CoverageView'
import TradeView from './TradeView'
import SpecView from './SpecView'
import EoDesignView from './EoDesignView'
import ReferenceView from './ReferenceView'
import CompareView from './CompareView'
import ParamExplainModal from './ParamExplainModal'
import { downloadText, fileStamp } from './download'
import './analysis.css'

/**
 * Monte Carlo trial bounds. The run is synchronous inside a useMemo, so the
 * upper bound is a UI-responsiveness guard, not a modelling limit: ~20 µs per
 * trial ⇒ 200k ≈ 4 s of blocked render. Below MIN_TRIALS the CI is so wide the
 * answer says nothing.
 */
const MIN_TRIALS = 100
const MAX_TRIALS = 200000

interface Props {
  onExit: () => void
}

type AnalysisType = 'engagement' | 'eoDesign' | 'coverage' | 'trade' | 'spec' | 'compare' | 'reference'
type Fidelity = 'analytical' | 'montecarlo'

const TYPE_LABELS: Record<AnalysisType, string> = {
  engagement: '교전 효과도',
  eoDesign: 'EO/IR 설계',
  coverage: '방어 커버리지',
  trade: '트레이드 스터디',
  spec: '스펙 역산',
  compare: '시나리오 비교',
  reference: '도움말',
}

/**
 * Analysis mode.
 *  · engagement (Phase 1) — single-scenario Pk-chain MOE (analytical or MC).
 *  · eoDesign   — reverse-size optics and validate the radar→EO→launch timeline.
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
  // 10k trials ⇒ 95% CI ≈ ±0.8%p at ~200 ms, vs ±1.5%p at 3k. The tool is used
  // to compare scenarios that differ by a few %p, so 3k left real differences
  // buried in sampling noise. MAX_TRIALS exists because the run is synchronous
  // on the render thread — a mistyped 1e6 would freeze the UI for ~20 s.
  const [trials, setTrials] = useState(10000)
  const [seed, setSeed] = useState(2026)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [explainKey, setExplainKey] = useState<string | null>(null)

  const validationIssues = useMemo(() => validateScenario(scenario), [scenario])
  const validationErrors = useMemo(
    () => validationIssues.filter((issue) => issue.severity === 'error'),
    [validationIssues],
  )
  const isValid = validationErrors.length === 0

  // Fail closed: defensive clamps in the core must not turn impossible input
  // into a plausible-looking result at the UI boundary.
  const engagementResult = useMemo(
    () => (isValid ? computeMoe(scenario) : null),
    [scenario, isValid],
  )
  const mcResult = useMemo(
    () =>
      isValid && fidelity === 'montecarlo' && type === 'engagement'
        ? runMonteCarlo(scenario, { trials, seed, uncertainty: { bearing_uniform: false } })
        : null,
    [fidelity, type, scenario, trials, seed, isValid],
  )

  const exportReport = (fmt: 'json' | 'md') => {
    if (!isValid) return
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
    const notes: string[] = []
    if (res.unknownKeys.length > 0) {
      notes.push(`인식 못한 key ${res.unknownKeys.length}개: ${res.unknownKeys.slice(0, 5).join(', ')}`)
    }
    if (res.outOfRange.length > 0) {
      // Applied anyway so the panel shows the user their own file — but never silently.
      notes.push(
        `유효 범위를 벗어난 값 ${res.outOfRange.length}개 (적용은 되었으나 결과가 무의미할 수 있음):\n` +
          res.outOfRange
            .slice(0, 6)
            .map((o) => `  · ${o.label} = ${o.value} (허용 ${o.min}~${o.max})`)
            .join('\n'),
      )
    }
    if (notes.length > 0) {
      // eslint-disable-next-line no-alert
      alert(`불러오기 완료: ${res.applied}개 적용.\n\n${notes.join('\n\n')}`)
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
            <button
              type="button"
              className="an-btn-ghost"
              onClick={() => exportReport('json')}
              disabled={!isValid}
              title={!isValid ? '입력 오류를 수정한 뒤 리포트를 저장할 수 있습니다.' : undefined}
            >
              ↓ JSON
            </button>
            <button
              type="button"
              className="an-btn-ghost"
              onClick={() => exportReport('md')}
              disabled={!isValid}
              title={!isValid ? '입력 오류를 수정한 뒤 리포트를 저장할 수 있습니다.' : undefined}
            >
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
          onExplain={setExplainKey}
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
                  <label title={`${MIN_TRIALS}~${MAX_TRIALS.toLocaleString()} 회. 동기 실행이라 시행수가 클수록 화면이 잠깐 멈춥니다 (10,000회 ≈ 0.2초).`}>
                    시행수
                    <input
                      type="number"
                      min={MIN_TRIALS}
                      max={MAX_TRIALS}
                      step={1000}
                      value={trials}
                      onChange={(e) =>
                        setTrials(
                          Math.min(MAX_TRIALS, Math.max(MIN_TRIALS, parseInt(e.target.value) || MIN_TRIALS)),
                        )
                      }
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

          {/* Parameter documentation remains available so users can understand
              and repair an invalid field; every numerical analysis fails closed. */}
          {!isValid && type !== 'reference' ? (
            <div className="an-validation is-error">
              <div className="an-validation-head">
                <span className="an-validation-tag">✕ 입력 오류 {validationErrors.length}개 · 계산 중단</span>
                <span className="ab-small">
                  잘못된 값이 정상처럼 보이는 결과로 바뀌지 않도록 분석과 리포트 생성을 중단했습니다.
                  좌측 패널에서 먼저 수정하세요.
                </span>
              </div>
              <ul className="an-validation-list">
                {validationErrors.slice(0, 4).map((i) => (
                  <li key={`${i.key}:${i.message}`} className="is-error">
                    <b>{i.label}</b> — {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {type === 'engagement' && engagementResult &&
                (fidelity === 'analytical' || !mcResult ? (
                  <MoeResultCards result={engagementResult} />
                ) : (
                  <McResults result={mcResult} />
                ))}

              {type === 'coverage' && <CoverageView scenario={scenario} />}
              {type === 'eoDesign' && <EoDesignView scenario={scenario} onChange={setScenario} />}
              {type === 'trade' && <TradeView scenario={scenario} />}
              {type === 'spec' && <SpecView scenario={scenario} />}
              {type === 'compare' && <CompareView scenario={scenario} />}
            </>
          )}
          {type === 'reference' && <ReferenceView scenario={scenario} onExplain={setExplainKey} />}
        </div>
      </div>

      <ParamExplainModal paramKey={explainKey} scenario={scenario} onClose={() => setExplainKey(null)} />
    </div>
  )
}
