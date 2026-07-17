import { useEffect } from 'react'
import { paramInfo, paramExplain, type Scenario } from '../../analysis'
import { DIAGRAMS } from './ParamDiagrams'

interface Props {
  paramKey: string | null
  scenario: Scenario
  onClose: () => void
}

/**
 * Per-parameter explainer. Opened by clicking the ⓘ on a field (or the
 * "설명" button in the reference table). Shows the parameter's meaning,
 * a formula, a live diagram (rendered for the current scenario), and the
 * value's provenance. Content comes from the doc registry (params) plus
 * the teaching registry (paramExplain).
 */
export default function ParamExplainModal({ paramKey, scenario, onClose }: Props) {
  useEffect(() => {
    if (!paramKey) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paramKey, onClose])

  if (!paramKey) return null
  const info = paramInfo(paramKey)
  if (!info) return null
  const ex = paramExplain(paramKey)
  const Diagram = ex?.diagram ? DIAGRAMS[ex.diagram] : null
  const value = info.get(scenario)

  return (
    <div className="an-modal-backdrop" onClick={onClose}>
      <div className="an-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <header className="an-modal-head">
          <div>
            <span className="an-modal-title">{info.label}</span>
            {info.unit ? <span className="an-modal-unit"> · {info.unit}</span> : null}
            <span className="an-modal-key">{info.key}</span>
          </div>
          <button type="button" className="an-modal-x" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </header>

        <div className="an-modal-body">
          <div className="an-modal-cur">
            현재값 <b>{Number.isFinite(value) ? value : '—'}</b>
            {info.unit ? ` ${info.unit}` : ''}
          </div>

          <p className="an-modal-desc">{info.description}</p>

          {ex?.formula ? <pre className="an-formula">{ex.formula}</pre> : null}

          {ex?.detail ? <p className="an-modal-detail">{ex.detail}</p> : null}

          {Diagram ? (
            <div className="an-modal-diagram">
              <Diagram scenario={scenario} />
              <div className="ab-small an-modal-diagram-note">
                현재 시나리오 값으로 그린 실제 모델 곡선입니다. 파라미터를 바꾸면 곡선도 바뀝니다.
              </div>
            </div>
          ) : null}

          <div className="an-modal-src">
            <span className="an-modal-src-label">출처 / 근거</span>
            {info.source}
          </div>
        </div>
      </div>
    </div>
  )
}
