import { PARAM_INFO, type Scenario } from '../../analysis'

interface Props {
  scenario: Scenario
}

// Section display order.
const SECTIONS = ['위협', '레이더', 'EO/IR', '이팩터', 'C2', '사이트']

function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000 || Number.isInteger(v)) return v.toFixed(v >= 1000 ? 0 : 0)
  return v.toFixed(Math.abs(v) < 1 ? 3 : 2)
}

/**
 * Parameter reference · what each parameter means and where its value /
 * formula basis comes from. Data-driven from PARAM_INFO (the same registry
 * that powers tooltips and CSV export).
 */
export default function ReferenceView({ scenario }: Props) {
  return (
    <div className="an-results">
      <div className="an-card">
        <div className="ab-label">파라미터 설명 · 의미와 출처</div>
        <div className="an-gate-note ab-small">
          ⚠ 값은 대부분 공개 문헌·목업 기반 편집 가능 플레이스홀더이며 확정 성능치가 아닙니다(SME 검증 필요).
          현재 시나리오 값을 함께 표시합니다.
        </div>
        <div className="an-ref-scroll">
          <table className="an-ref-table">
            <thead>
              <tr>
                <th>파라미터</th>
                <th>현재값</th>
                <th>단위</th>
                <th>의미</th>
                <th>출처 / 근거</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.flatMap((section) => {
                const rows = PARAM_INFO.filter((p) => p.section === section)
                if (rows.length === 0) return []
                return [
                  <tr key={`h-${section}`} className="an-ref-section">
                    <td colSpan={5}>{section}</td>
                  </tr>,
                  ...rows.map((p) => (
                    <tr key={p.key}>
                      <td className="an-ref-name">
                        {p.label}
                        <span className="an-ref-key">{p.key}</span>
                      </td>
                      <td className="an-ref-val">{fmtVal(p.get(scenario))}</td>
                      <td className="an-ref-unit">{p.unit ?? ''}</td>
                      <td className="an-ref-desc">{p.description}</td>
                      <td className="an-ref-src">{p.source}</td>
                    </tr>
                  )),
                ]
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
