// ────────────────────────────────────────────────────────────
// Generate the sample scenario CSV from the SSOT (analysis/params).
//
//   pnpm gen:sample
//
// Output is byte-identical to what the in-app "CSV 저장" button
// produces for the default scenario (scenarioToCsv, CRLF, no BOM).
// Regenerate whenever params.ts changes so the sample never drifts.
// ────────────────────────────────────────────────────────────
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defaultScenario, scenarioToCsvFile } from '../src/analysis/index'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'public', 'samples')
const outFile = join(outDir, 'scenario-default.csv')

mkdirSync(outDir, { recursive: true })
writeFileSync(outFile, scenarioToCsvFile(defaultScenario()), 'utf8')

console.log(`wrote ${outFile}`)
