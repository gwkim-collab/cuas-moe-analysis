import { useMemo, useState } from 'react'
import { PARAM_INFO, paramExplain, type Scenario } from '../../analysis'

interface Props {
  scenario: Scenario
  /** Open the formula/diagram explainer for a parameter key. */
  onExplain?: (key: string) => void
}

const SECTIONS = ['위협', '레이더', '레이더(고급)', 'EO/IR', '이팩터', 'C2', '사이트'] as const
type SectionFilter = '전체' | (typeof SECTIONS)[number]

function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000 || Number.isInteger(v)) return v.toFixed(0)
  return v.toFixed(Math.abs(v) < 1 ? 3 : 2)
}

function sectionId(section: string): string {
  return `help-${section.replace(/[^a-zA-Z0-9가-힣]/g, '-')}`
}

function policyLabel(level: Scenario['optics']['required_discrimination']): string {
  return {
    radar_only: 'EO 미적용 · 레이더 추적만',
    detection: 'EO 탐지 · 물체 존재',
    recognition: 'EO 인식 · 표적 클래스',
    identification: 'EO 식별 · 특정 기종/모델',
  }[level]
}

/** Searchable, data-driven manual backed by the same registries as field tooltips. */
export default function ReferenceView({ scenario, onExplain }: Props) {
  const [query, setQuery] = useState('')
  const [section, setSection] = useState<SectionFilter>('전체')

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ko')
    return PARAM_INFO.filter((info) => {
      if (section !== '전체' && info.section !== section) return false
      if (!needle) return true
      const ex = paramExplain(info.key)
      return [
        info.label,
        info.key,
        info.section,
        info.description,
        info.source,
        ex?.theory,
        ex?.assumption,
        ex?.formula,
        ex?.detail,
        ex?.references?.map((reference) => reference.label).join(' '),
      ].some((value) => value?.toLocaleLowerCase('ko').includes(needle))
    })
  }, [query, section])

  return (
    <div className="an-results an-help">
      <div className="an-card an-help-hero">
        <div>
          <div className="ab-label">도움말 · MOE 파라미터 매뉴얼</div>
          <h2>입력값의 의미, 실제 모델 동작, 수식과 출처</h2>
          <p className="ab-small">
            좌측 입력의 툴팁과 이 매뉴얼은 같은 설명 원본을 사용합니다. 값 출처와 이론 근거는 구분해 표시하며,
            가정값은 확정 성능치가 아니므로 시험·스펙·SME 검증값으로 교체해야 합니다.
          </p>
        </div>
        <div className="an-help-count"><b>{PARAM_INFO.length}</b><span>전체 항목</span></div>
      </div>

      <div className="an-help-guide">
        <div><b>1 · 레이더 적시 탐지</b><span>마감선 전 트랙 확보 P_detect와, 확보 후 교전 유효 트랙의 조건부 신뢰도를 구분합니다.</span></div>
        <div><b>2 · 발사 후 EO/IR</b><span>고정 카메라 획득 × 선택한 Johnson 탐지/인식/식별 × 대기투과 × EO 과업 신뢰도 상한을 계산합니다.</span></div>
        <div><b>3 · 교전 성립·무력화</b><span>결심, 도달, 사격 Pk를 직렬 게이트로 결합해 P_negate를 구합니다.</span></div>
      </div>

      <details className="an-card an-help-choices" open>
        <summary>선택형 설정 · 현재 시나리오</summary>
        <div>
          <p><b>종말 확인 정책 · {policyLabel(scenario.optics.required_discrimination)}</b><span>레이더 추적만은 EO를 생략합니다. EO 탐지·인식·식별은 각각 물체 존재·표적 클래스·특정 기종/모델 과업으로, 모두 발사 후 광학 게이트를 적용합니다.</span></p>
          <p><b>페이로드 · {scenario.effector.payload}</b><span>선택한 페이로드의 단발 Pk만 P_kill=1−(1−p)ⁿ에 사용합니다. 근거: 체계 구성 입력.</span></p>
          <p><b>오교전 위험 · {scenario.c2.false_engagement_enabled ? '켬' : '끔'}</b><span>비위협 유입률×독립 오통과율을 별도 지표로 계산하며 P_negate에는 영향이 없습니다. 근거: 분석 옵션/ROC 대체 입력.</span></p>
        </div>
      </details>

      <div className="an-card an-help-controls">
        <label className="an-help-search">
          <span>검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="예: 화각, Pd, 발사, 가정, Skolnik"
            aria-label="파라미터 매뉴얼 검색"
          />
        </label>
        <div className="an-help-filters" aria-label="파라미터 분야 필터">
          {(['전체', ...SECTIONS] as SectionFilter[]).map((name) => (
            <button
              key={name}
              type="button"
              className={`an-type-btn ${section === name ? 'is-active' : ''}`}
              onClick={() => setSection(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="ab-small an-help-found">검색 결과 {filtered.length}개</span>
      </div>

      {SECTIONS.map((sectionName) => {
        const rows = filtered.filter((info) => info.section === sectionName)
        if (rows.length === 0) return null
        return (
          <section className="an-help-section" id={sectionId(sectionName)} key={sectionName}>
            <div className="an-help-section-head">
              <h3>{sectionName}</h3>
              <span>{rows.length}개 항목</span>
            </div>
            <div className="an-help-grid">
              {rows.map((info) => {
                const ex = paramExplain(info.key)
                return (
                  <article className="an-help-param" key={info.key}>
                    <header>
                      <div>
                        <h4>{info.label}</h4>
                        <code>{info.key}</code>
                      </div>
                      <div className="an-help-current">
                        <span>현재값</span>
                        <b>{fmtVal(info.get(scenario))}{info.unit ? ` ${info.unit}` : ''}</b>
                      </div>
                    </header>

                    <p className="an-help-desc">{info.description}</p>

                    {ex?.formula ? (
                      <div className="an-help-block is-formula">
                        <span>계산식</span><pre>{ex.formula}</pre>
                      </div>
                    ) : null}
                    {ex?.detail ? (
                      <div className="an-help-block">
                        <span>해설</span><p>{ex.detail}</p>
                      </div>
                    ) : null}
                    {ex?.theory ? (
                      <div className="an-help-block is-theory">
                        <span>이론 근거</span><p>{ex.theory}</p>
                      </div>
                    ) : null}
                    {ex?.assumption ? (
                      <div className="an-help-block is-assumption">
                        <span>모델 가정·한계</span><p>{ex.assumption}</p>
                      </div>
                    ) : null}
                    {ex?.references?.length ? (
                      <div className="an-help-block is-reference">
                        <span>원문 출처</span>
                        <p>{ex.references.map((reference) => (
                          <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a>
                        ))}</p>
                      </div>
                    ) : null}
                    <div className="an-help-block is-source">
                      <span>값 출처</span><p>{info.source}</p>
                    </div>

                    {onExplain ? (
                      <button type="button" className="an-btn-ghost an-help-open" onClick={() => onExplain(info.key)}>
                        수식·현재 곡선 크게 보기
                      </button>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </section>
        )
      })}

      {filtered.length === 0 ? (
        <div className="an-card an-help-empty">일치하는 항목이 없습니다. 검색어 또는 분야 필터를 바꿔보세요.</div>
      ) : null}
    </div>
  )
}
