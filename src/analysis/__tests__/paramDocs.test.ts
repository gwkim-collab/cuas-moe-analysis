import { describe, expect, it } from 'vitest'
import { PARAM_INFO } from '../params'
import { paramExplain } from '../paramExplain'

describe('parameter help registry', () => {
  it('documents every editable scalar with meaning, value source, theory, formula, and detail', () => {
    expect(PARAM_INFO).toHaveLength(44)

    for (const info of PARAM_INFO) {
      const explanation = paramExplain(info.key)
      expect(info.description.trim(), `${info.key} description`).not.toBe('')
      expect(info.source.trim(), `${info.key} value source`).not.toBe('')
      expect(explanation, `${info.key} explanation`).toBeDefined()
      expect(explanation?.theory?.trim(), `${info.key} theory`).toBeTruthy()
      expect(explanation?.formula?.trim(), `${info.key} formula`).toBeTruthy()
      expect(explanation?.detail?.trim(), `${info.key} detail`).toBeTruthy()
    }
  })

  it('keeps labels and guidance aligned with non-monotonic or scoped model behaviour', () => {
    const byKey = new Map(PARAM_INFO.map((info) => [info.key, info]))

    expect(byKey.get('sensor.pd_at_ref')?.label).toBe('기준거리 단일스캔 Pd')
    expect(byKey.get('sensor.pd_at_ref')?.description).toContain('높을수록 좋은')
    expect(byKey.get('sensor.radar_track_confidence')?.description).toContain('P_detect와 다른')
    expect(byKey.get('sensor.classify_prob')?.description).toContain('EO 미적용에서는 사용하지 않음')
    expect(byKey.get('optics.hfov_deg')?.description).toContain('최적점')
    expect(byKey.get('optics.n50_detection')?.description).toContain('물체의 존재')
    expect(byKey.get('optics.n50_recognition')?.description).toContain('표적 클래스')
    expect(byKey.get('optics.n50_identification')?.description).toContain('특정 기종')
    for (const key of ['optics.n50_detection', 'optics.n50_recognition', 'optics.n50_identification']) {
      expect(paramExplain(key)?.references?.[0]?.url).toContain('osti.gov/biblio/1222446')
    }
    expect(byKey.get('threat.approach_bearing_deg')?.description).toContain('P_negate 값에는 영향 없음')
    expect(byKey.get('effector.max_engagement_range_m')?.description).toContain('자산 중심')
  })
})
