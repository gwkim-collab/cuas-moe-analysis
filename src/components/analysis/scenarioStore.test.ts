import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultScenario } from '../../analysis'
import { loadScenario, saveScenario } from './scenarioStore'

const KEY = 'airlock.moe.scenarios.v1'
const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})

describe('saved scenario schema migration', () => {
  it('maps legacy detection-without-detection-N50 to radar_only', () => {
    const legacy = defaultScenario()
    legacy.optics.required_discrimination = 'detection'
    delete (legacy.optics as Partial<typeof legacy.optics>).n50_detection
    values.set(KEY, JSON.stringify({ legacy }))

    expect(loadScenario('legacy')?.optics.required_discrimination).toBe('radar_only')
  })

  it('versions new saves and preserves real EO detection', () => {
    const current = defaultScenario()
    current.optics.required_discrimination = 'detection'
    saveScenario('current', current)

    const stored = JSON.parse(values.get(KEY) ?? '{}') as Record<string, { _schema_version?: number }>
    expect(stored.current?._schema_version).toBe(2)
    expect(loadScenario('current')?.optics.required_discrimination).toBe('detection')
  })
})
