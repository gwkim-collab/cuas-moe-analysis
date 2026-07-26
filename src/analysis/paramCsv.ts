// ────────────────────────────────────────────────────────────
// Analysis core · scenario ⇄ CSV (Excel-openable).
//
// The exported CSV doubles as documentation: each row carries the
// parameter's meaning and source alongside its value. Import reads
// back only the `key` → `값(value)` columns, so a user can open the
// file in Excel, edit the value column, save as CSV, and reload.
//
// Column order: 구분, 파라미터, key, 값, 단위, 의미, 출처
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'
import { PARAM_INFO, paramInfo } from './params'
import { paramExplain } from './paramExplain'

// Column order: identity/value first (key=idx2, 값=idx3 — the importer reads
// only those), then the full basis so the exported file documents the model
// exactly like the in-app explainer. New columns are appended at the END so
// import stays position-stable.
const HEADER = ['구분', '파라미터', 'key', '값', '단위', '의미', '값 출처', '수식', '이론 근거', '모델 가정']
const PAYLOAD_KEY = 'effector.payload'
const DISC_KEY = 'optics.required_discrimination'

// Flatten multi-line formula/theory to a single cell (Excel-friendly).
function flat(s?: string): string {
  return (s ?? '').replace(/\s*\n\s*/g, ' / ')
}

// ── minimal RFC4180 CSV ───────────────────────────────────────
function csvEscape(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

function toRow(cells: (string | number)[]): string {
  return cells.map((c) => csvEscape(String(c))).join(',')
}

/** Parse CSV text into an array of records (each an array of field strings). */
export function parseCsv(text: string): string[][] {
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  // Strip a leading BOM if present.
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      record.push(field)
      field = ''
    } else if (c === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else if (c === '\r') {
      // handle CRLF and lone CR
      record.push(field)
      records.push(record)
      record = []
      field = ''
      if (t[i + 1] === '\n') i++
    } else {
      field += c
    }
  }
  // trailing field/record (no final newline)
  if (field.length > 0 || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records
}

// ── Export ────────────────────────────────────────────────────
export function scenarioToCsv(scenario: Scenario): string {
  const lines: string[] = [toRow(HEADER)]
  for (const p of PARAM_INFO) {
    const ex = paramExplain(p.key)
    lines.push(
      toRow([
        p.section, p.label, p.key, p.get(scenario), p.unit ?? '', p.description, p.source,
        flat(ex?.formula), flat(ex?.theory), flat(ex?.assumption),
      ]),
    )
  }
  // payload (enum) as a text row so it round-trips.
  lines.push(
    toRow([
      '이팩터',
      '페이로드',
      PAYLOAD_KEY,
      scenario.effector.payload,
      '',
      "요격 페이로드 모드('net_gun' 또는 'shotgun'). 사용되는 단발 Pk를 선택.",
      '운용 설정값',
      '', '', '',
    ]),
  )
  // required discrimination level (enum) as a text row so it round-trips.
  lines.push(
    toRow([
      'EO/IR',
      '요구 판별 수준',
      DISC_KEY,
      scenario.optics.required_discrimination,
      '',
      "교전 승인 요구 판별 수준('detection'/'recognition'/'identification'). 해당 N50이 P_classify에 사용.",
      '운용 설정값',
      '', '', '',
    ]),
  )
  return lines.join('\r\n')
}

// UTF-8 BOM. Excel needs it to read the Korean columns without mojibake;
// the importer (parseCsv) strips a leading BOM, so files stay round-trippable.
export const CSV_BOM = '﻿'

/**
 * CSV for file download / Excel: `scenarioToCsv` with a UTF-8 BOM and a
 * leading `sep=,` hint. The hint forces Excel to split on commas regardless
 * of the OS list-separator locale (which otherwise shifts columns). parseCsv
 * yields a 2-field `["sep=",""]` record for that line, which applyCsv skips
 * (needs ≥4 fields), so files stay round-trippable.
 */
export function scenarioToCsvFile(scenario: Scenario): string {
  return CSV_BOM + 'sep=,\r\n' + scenarioToCsv(scenario)
}

// ── Import ────────────────────────────────────────────────────
export interface CsvImportResult {
  scenario: Scenario
  applied: number
  unknownKeys: string[]
}

/**
 * Apply a CSV (as produced by scenarioToCsv, possibly edited in Excel)
 * onto a base scenario. Only the `key` and `값` columns are read; rows
 * with unknown keys or non-numeric values are skipped and reported.
 */
export function applyCsv(base: Scenario, text: string): CsvImportResult {
  const records = parseCsv(text)
  let scenario = base
  let applied = 0
  const unknownKeys: string[] = []

  for (const rec of records) {
    if (rec.length < 4) continue
    const key = rec[2]?.trim()
    const rawVal = rec[3]?.trim()
    if (!key || key === 'key' || rawVal == null || rawVal === '') continue

    if (key === PAYLOAD_KEY) {
      if (rawVal === 'net_gun' || rawVal === 'shotgun') {
        scenario = { ...scenario, effector: { ...scenario.effector, payload: rawVal } }
        applied++
      }
      continue
    }

    if (key === DISC_KEY) {
      if (rawVal === 'detection' || rawVal === 'recognition' || rawVal === 'identification') {
        scenario = { ...scenario, optics: { ...scenario.optics, required_discrimination: rawVal } }
        applied++
      }
      continue
    }

    const info = paramInfo(key)
    if (!info) {
      unknownKeys.push(key)
      continue
    }
    const v = parseFloat(rawVal)
    if (Number.isFinite(v)) {
      scenario = info.set(scenario, v)
      applied++
    }
  }

  return { scenario, applied, unknownKeys }
}
