// ────────────────────────────────────────────────────────────
// Named scenario persistence (browser localStorage).
//
// Kept out of the framework-agnostic analysis core because it touches
// localStorage. Stores a { name → Scenario } map as JSON. Values are
// whatever the user has dialled in — the analysis core stays the SSOT
// for shape, so unknown/legacy fields are tolerated on load.
// ────────────────────────────────────────────────────────────

import { defaultScenario, type Scenario } from '../../analysis'

const KEY = 'airlock.moe.scenarios.v1'
const SCHEMA_VERSION = 2

type StoredScenario = Scenario & { _schema_version?: number }
type Store = Record<string, StoredScenario>

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Store) : {}
  } catch {
    return {}
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // storage full / unavailable — non-fatal
  }
}

/** Saved scenario names, alphabetically. */
export function listSavedScenarios(): string[] {
  return Object.keys(read()).sort((a, b) => a.localeCompare(b))
}

export function saveScenario(name: string, scenario: Scenario): void {
  const store = read()
  store[name] = { ...scenario, _schema_version: SCHEMA_VERSION }
  write(store)
}

export function loadScenario(name: string): Scenario | undefined {
  const saved = read()[name]
  if (!saved) return undefined
  const defaults = defaultScenario()
  const { _schema_version: schemaVersion = 1, ...savedScenario } = saved
  const savedOptics = savedScenario.optics as Partial<Scenario['optics']> | undefined
  // v1 used `detection` to mean "radar only / no EO" and had no EO detection
  // N50 field. Version 2 explicitly separates radar_only from EO detection.
  // Keep the field-presence guard for scenarios saved by an early development
  // build that already wrote n50_detection but did not yet write a version.
  const migratedDiscrimination =
    schemaVersion < SCHEMA_VERSION &&
    savedOptics?.required_discrimination === 'detection' &&
    savedOptics.n50_detection == null
      ? 'radar_only'
      : savedOptics?.required_discrimination
  return {
    ...defaults,
    ...savedScenario,
    threat: { ...defaults.threat, ...savedScenario.threat },
    sensor: { ...defaults.sensor, ...savedScenario.sensor },
    optics: {
      ...defaults.optics,
      ...savedOptics,
      ...(migratedDiscrimination ? { required_discrimination: migratedDiscrimination } : {}),
    },
    effector: { ...defaults.effector, ...savedScenario.effector },
    c2: { ...defaults.c2, ...savedScenario.c2 },
    site: { ...defaults.site, ...savedScenario.site, asset: { ...defaults.site.asset, ...savedScenario.site?.asset } },
  }
}

export function deleteScenario(name: string): void {
  const store = read()
  delete store[name]
  write(store)
}
