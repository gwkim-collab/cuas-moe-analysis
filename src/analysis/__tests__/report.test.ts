import { describe, it, expect } from 'vitest'
import { buildReport, reportToJson, reportToMarkdown, defaultScenario } from '../index'

describe('report', () => {
  const report = buildReport(defaultScenario(), '2026-07-16T00:00:00Z')

  it('builds a structured report with engagement + coverage', () => {
    expect(report.generated_at).toBe('2026-07-16T00:00:00Z')
    expect(report.engagement.p_negate).toBeGreaterThan(0)
    expect(report.coverage.defended_fraction).toBeGreaterThanOrEqual(0)
    expect(report.disclaimer).toContain('SME')
  })

  it('serializes to valid round-trippable JSON', () => {
    const json = reportToJson(report)
    const parsed = JSON.parse(json)
    expect(parsed.engagement.p_negate).toBeCloseTo(report.engagement.p_negate, 10)
  })

  it('serializes to Markdown with the headline metric and disclaimer', () => {
    const md = reportToMarkdown(report)
    expect(md).toContain('# AIRLOCK 효과도 분석 리포트')
    expect(md).toContain('P_negate')
    expect(md).toContain('⚠')
  })
})
