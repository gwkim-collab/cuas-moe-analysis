import { describe, expect, it } from 'vitest'
import { analyzeOpticalDesign, defaultScenario, requiredHfovDeg } from '../index'

describe('EO/IR reverse sizing', () => {
  it('inverts the pixel geometry exactly', () => {
    const s = defaultScenario()
    const result = analyzeOpticalDesign(s, {
      recognition_range_m: 500,
      target_pixels: 20,
      discrimination_level: 'recognition',
    })

    // The 500 m input is already camera↔target LOS; asset altitude is unrelated.
    expect(result.camera_target_range_m).toBe(500)
    expect(result.required_hfov_deg).toBeCloseTo(3.85, 2)
    expect(result.pixels_on_target).toBeCloseTo(20, 9)
    expect(result.required_ifov_urad).toBeCloseTo(0.35 / 500 / 20 * 1e6, 9)
  })

  it('returns the familiar 3.85 degree result for a 0.35 m target at 500 m LOS', () => {
    expect(requiredHfovDeg(0.35, 500, 20, 1920)).toBeCloseTo(3.850, 2)
  })

  it('returns about 22 degrees for a 2 m target under the same conditions', () => {
    expect(requiredHfovDeg(2, 500, 20, 1920)).toBeCloseTo(22.00, 2)
  })
})

describe('radar → launch → onboard EO timeline', () => {
  it('keeps the 3 km launch doctrine and completes EO at 500 m relative separation', () => {
    const s = defaultScenario()
    const result = analyzeOpticalDesign(s, {
      recognition_range_m: 500,
      target_pixels: 20,
      discrimination_level: 'recognition',
    })

    const eo = result.moe.terminal_eo
    expect(result.scenario.effector.commit_range_m).toBe(3000)
    expect(result.moe.reach.threat_range_at_launch_m).toBeCloseTo(3000, 6)
    expect(eo.separation_at_launch_m).toBeCloseTo(3000, 6)
    expect(eo.processing_start_separation_m).toBeCloseTo(996.8, 6)
    expect(eo.recognition_separation_m).toBeCloseTo(500, 6)
    expect(eo.processing_start_after_launch_s).toBeCloseTo(24.193, 3)
    expect(eo.recognition_after_launch_s).toBeCloseTo(30.193, 3)
    expect(eo.target_range_at_recognition_m).toBeCloseTo(2009.66, 2)
    expect(eo.interceptor_range_at_recognition_m).toBeCloseTo(1509.66, 2)
    expect(eo.time_remaining_to_intercept_s).toBeCloseTo(6.039, 3)
    expect(result.timeline_feasible).toBe(true)
    expect(result.moe.p_negate).toBeGreaterThan(0)
  })

  it('rejects an EO completion point that would require processing before launch', () => {
    const s = defaultScenario()
    const result = analyzeOpticalDesign(s, {
      recognition_range_m: 2800,
      target_pixels: 20,
      discrimination_level: 'recognition',
    })

    expect(result.moe.terminal_eo.processing_start_after_launch_s).toBeLessThan(0)
    expect(result.timeline_feasible).toBe(false)
    expect(result.moe.breakdown.p_classify).toBe(0)
    expect(result.moe.p_negate).toBe(0)
    expect(result.limitation).toContain('before interceptor launch')
  })
})
