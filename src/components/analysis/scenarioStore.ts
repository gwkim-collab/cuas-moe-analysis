// ────────────────────────────────────────────────────────────
// Named scenario persistence (browser localStorage).
//
// Kept out of the framework-agnostic analysis core because it touches
// localStorage. Stores a { name → Scenario } map as JSON. Values are
// whatever the user has dialled in — the analysis core stays the SSOT
// for shape, so unknown/legacy fields are tolerated on load.
// ────────────────────────────────────────────────────────────

import type { Scenario } from '../../analysis'

const KEY = 'airlock.moe.scenarios.v1'

type Store = Record<string, Scenario>

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
  store[name] = scenario
  write(store)
}

export function loadScenario(name: string): Scenario | undefined {
  return read()[name]
}

export function deleteScenario(name: string): void {
  const store = read()
  delete store[name]
  write(store)
}
