// ────────────────────────────────────────────────────────────
// Analysis core · threat-archetype presets.
//
// Each preset is a full Scenario built by overriding the documented
// defaults, so presets pick up any new parameter automatically. These
// are illustrative starting points (still SME-VERIFY placeholders), not
// validated threat libraries — they just seed a study quickly.
// ────────────────────────────────────────────────────────────

import { defaultScenario, type Scenario } from './model'

export interface ScenarioPreset {
  id: string
  label: string
  /** One-line rationale for what this archetype stresses. */
  note: string
  build: () => Scenario
}

// Shallow-merge helper: override specific sub-spec fields on a fresh default.
function withOverrides(o: {
  threat?: Partial<Scenario['threat']>
  sensor?: Partial<Scenario['sensor']>
  optics?: Partial<Scenario['optics']>
  effector?: Partial<Scenario['effector']>
  c2?: Partial<Scenario['c2']>
  site?: Partial<Scenario['site']>
}): Scenario {
  const s = defaultScenario()
  return {
    ...s,
    threat: { ...s.threat, ...o.threat },
    sensor: { ...s.sensor, ...o.sensor },
    optics: { ...s.optics, ...o.optics },
    effector: { ...s.effector, ...o.effector },
    c2: { ...s.c2, ...o.c2 },
    site: { ...s.site, ...o.site },
  }
}

export const PRESETS: ScenarioPreset[] = [
  {
    id: 'fpv-default',
    label: '소형 FPV (기본)',
    note: '기본 시나리오 — 소형 FPV, 저고도 접근.',
    build: () => defaultScenario(),
  },
  {
    id: 'fixed-wing-fast',
    label: '고속 고정익',
    note: '큰 RCS·큰 표적이나 고속 — 반응 예산이 빡빡.',
    build: () =>
      withOverrides({
        threat: { rcs_m2: 0.05, speed_m_s: 60, altitude_m_agl: 150, characteristic_size_m: 1.2, ingress_range_m: 4000 },
      }),
  },
  {
    id: 'low-observable',
    label: '저피탐 초소형',
    note: '아주 작은 RCS·표적 — 탐지·인식 모두 난이도↑.',
    build: () =>
      withOverrides({
        threat: { rcs_m2: 0.004, speed_m_s: 28, characteristic_size_m: 0.22 },
      }),
  },
  {
    id: 'pop-up-close',
    label: '근거리 급습',
    note: '짧은 진입거리·빠른 속도 — 교전 시간 창이 매우 좁음.',
    build: () =>
      withOverrides({
        threat: { ingress_range_m: 1500, speed_m_s: 40 },
      }),
  },
]

export function presetById(id: string): ScenarioPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}
