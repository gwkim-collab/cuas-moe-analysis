import { useState } from 'react'
import { PRESETS, presetById, type Scenario } from '../../analysis'
import { listSavedScenarios, saveScenario, loadScenario, deleteScenario } from './scenarioStore'

interface Props {
  scenario: Scenario
  onLoad: (s: Scenario) => void
}

const SAVED_PREFIX = 'saved:'
const PRESET_PREFIX = 'preset:'

/**
 * Scenario management bar: apply a threat-archetype preset, or save / load /
 * delete named scenarios (localStorage). Sits above the parameter panel.
 */
export default function ScenarioBar({ scenario, onLoad }: Props) {
  const [saved, setSaved] = useState<string[]>(() => listSavedScenarios())
  const [sel, setSel] = useState('')

  const refresh = () => setSaved(listSavedScenarios())

  const onSelect = (value: string) => {
    setSel(value)
    if (value.startsWith(PRESET_PREFIX)) {
      const p = presetById(value.slice(PRESET_PREFIX.length))
      if (p) onLoad(p.build())
    } else if (value.startsWith(SAVED_PREFIX)) {
      const s = loadScenario(value.slice(SAVED_PREFIX.length))
      if (s) onLoad(s)
    }
  }

  const onSave = () => {
    // eslint-disable-next-line no-alert
    const name = window.prompt('시나리오 이름을 입력하세요')?.trim()
    if (!name) return
    saveScenario(name, scenario)
    refresh()
    setSel(`${SAVED_PREFIX}${name}`)
  }

  const onDelete = () => {
    if (!sel.startsWith(SAVED_PREFIX)) return
    const name = sel.slice(SAVED_PREFIX.length)
    // eslint-disable-next-line no-alert
    if (!window.confirm(`"${name}" 시나리오를 삭제할까요?`)) return
    deleteScenario(name)
    refresh()
    setSel('')
  }

  const isSavedSelected = sel.startsWith(SAVED_PREFIX)

  return (
    <div className="an-scn-bar">
      <select
        className="an-scn-select"
        value={sel}
        onChange={(e) => onSelect(e.target.value)}
        title="프리셋 또는 저장된 시나리오 불러오기"
      >
        <option value="">시나리오 선택…</option>
        <optgroup label="프리셋 · 위협 유형">
          {PRESETS.map((p) => (
            <option key={p.id} value={`${PRESET_PREFIX}${p.id}`} title={p.note}>
              {p.label}
            </option>
          ))}
        </optgroup>
        {saved.length > 0 && (
          <optgroup label="저장됨">
            {saved.map((n) => (
              <option key={n} value={`${SAVED_PREFIX}${n}`}>
                {n}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <button type="button" className="an-btn-ghost an-btn-mini" onClick={onSave} title="현재 값을 이름 붙여 저장">
        저장
      </button>
      <button
        type="button"
        className="an-btn-ghost an-btn-mini"
        onClick={onDelete}
        disabled={!isSavedSelected}
        title="선택한 저장 시나리오 삭제"
      >
        삭제
      </button>
    </div>
  )
}
