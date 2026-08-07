// ────────────────────────────────────────────────────────────
// Live per-parameter diagrams. Each renders the *actual* model curve
// for the current scenario (imports the same functions the analysis
// core uses), so the picture always matches the numbers.
//
// Registry DIAGRAMS[id] is looked up by ParamExplain.diagram.
// ────────────────────────────────────────────────────────────
import type { FC } from 'react'
import {
  type Scenario,
  type DiagramId,
  detectionRangeForRcs,
  pdAtRange,
  recognitionProb,
  recognitionRangeForProb,
  activeN50,
  acquisitionProb,
  singleShotPk,
  computeDetection,
  reachSolution,
} from '../../analysis'

interface DiagramProps {
  scenario: Scenario
  /** The parameter key the explainer was opened from (some diagrams specialise on it). */
  paramKey?: string
}

// ── shared frame + helpers ────────────────────────────────────
const W = 360
const H = 200
const L = 46 // left pad (y axis)
const R = 16
const T = 14
const B = 34
const PW = W - L - R
const PH = H - T - B

const AXIS = 'rgba(159,180,173,0.35)'
const GRID = 'rgba(159,180,173,0.12)'
const CURVE = '#31d0aa'
const MARK = '#e8fff8'
const BAND = 'rgba(49,208,170,0.14)'
const TXT = 'rgba(210,224,220,0.9)'
const TXT_DIM = 'rgba(159,180,173,0.7)'
const WARN = '#ff6b6b'
const ACCENT = '#ffb020' // doctrinal markers (commit range) — same amber as the coverage rings

const fmt = (v: number, d = 0): string => {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1000) return v.toFixed(0)
  if (Math.abs(v) >= 10) return v.toFixed(d)
  return v.toFixed(Math.max(d, Math.abs(v) < 1 ? 2 : 1))
}

// linear scale factory
const scale = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? r0 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)

function Frame({
  children,
  xLabel,
  yLabel,
}: {
  children: React.ReactNode
  xLabel: string
  yLabel: string
}) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an-diagram" role="img">
      {/* axes */}
      <line x1={L} y1={T} x2={L} y2={T + PH} stroke={AXIS} strokeWidth={1} />
      <line x1={L} y1={T + PH} x2={L + PW} y2={T + PH} stroke={AXIS} strokeWidth={1} />
      {children}
      <text x={L + PW} y={H - 8} fill={TXT_DIM} fontSize={11} textAnchor="end">
        {xLabel}
      </text>
      <text x={12} y={T + 4} fill={TXT_DIM} fontSize={11} transform={`rotate(-90 12 ${T + PH / 2})`} textAnchor="middle">
        {yLabel}
      </text>
    </svg>
  )
}

// probability y-axis gridlines at 0 / .5 / 1
function ProbGrid({ sy }: { sy: (v: number) => number }) {
  return (
    <>
      {[0, 0.5, 1].map((p) => (
        <g key={p}>
          <line x1={L} y1={sy(p)} x2={L + PW} y2={sy(p)} stroke={GRID} strokeWidth={1} />
          <text x={L - 6} y={sy(p) + 3} fill={TXT_DIM} fontSize={10} textAnchor="end">
            {p}
          </text>
        </g>
      ))}
    </>
  )
}

function polyline(points: Array<[number, number]>, sx: (v: number) => number, sy: (v: number) => number): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ')
}

// ── 1) RCS → detection range (quarter-power) ──────────────────
const RcsScaling: FC<DiagramProps> = ({ scenario }) => {
  const s = scenario.sensor
  const cur = Math.max(scenario.threat.rcs_m2, 1e-6)
  const ref = Math.max(s.ref_rcs_m2, 1e-6)
  const lo = Math.max(Math.min(cur, ref) / 5, 1e-4)
  const hi = Math.min(Math.max(cur, ref) * 5, 10)
  const lx = (v: number) => Math.log10(v)
  const sx = scale(lx(lo), lx(hi), L, L + PW)
  const yMax = detectionRangeForRcs(s, hi) * 1.05
  const sy = scale(0, yMax, T + PH, T)
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= 80; i++) {
    const rcs = Math.pow(10, lx(lo) + ((lx(hi) - lx(lo)) * i) / 80)
    pts.push([lx(rcs), detectionRangeForRcs(s, rcs)])
  }
  const curX = sx(lx(cur))
  const curY = sy(detectionRangeForRcs(s, cur))
  const refX = sx(lx(ref))
  const refY = sy(detectionRangeForRcs(s, ref))
  return (
    <Frame xLabel="RCS (m², 로그)" yLabel="탐지거리 (m)">
      {[0, yMax / 2, yMax].map((v) => (
        <line key={v} x1={L} y1={sy(v)} x2={L + PW} y2={sy(v)} stroke={GRID} />
      ))}
      <path d={polyline(pts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={CURVE} strokeWidth={2} />
      {/* reference point */}
      <circle cx={refX} cy={refY} r={3} fill="none" stroke={TXT_DIM} />
      <text x={refX} y={refY - 6} fill={TXT_DIM} fontSize={10} textAnchor="middle">기준</text>
      {/* current */}
      <line x1={curX} y1={T} x2={curX} y2={T + PH} stroke={MARK} strokeDasharray="3 3" opacity={0.6} />
      <circle cx={curX} cy={curY} r={4} fill={MARK} />
      <text x={curX + 6} y={curY - 6} fill={TXT} fontSize={11}>
        {fmt(cur, 3)} m² → {fmt(detectionRangeForRcs(s, cur))} m
      </text>
    </Frame>
  )
}

// ── 2) Pd(range) logistic ─────────────────────────────────────
const PdLogistic: FC<DiagramProps> = ({ scenario }) => {
  const s = scenario.sensor
  const rcs = scenario.threat.rcs_m2
  const rDet = detectionRangeForRcs(s, rcs)
  const w = Math.max(s.pd_transition_width_m, 1)
  const xMax = Math.max(scenario.threat.ingress_range_m, rDet * 1.6, rDet + 3 * w)
  const sx = scale(0, xMax, L, L + PW)
  const sy = scale(0, 1, T + PH, T)
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= 100; i++) {
    const r = (xMax * i) / 100
    pts.push([r, pdAtRange(s, rcs, r)])
  }
  return (
    <Frame xLabel="거리 r (m)" yLabel="단일 스캔 P_d">
      <ProbGrid sy={sy} />
      {/* ±w transition band */}
      <rect x={sx(Math.max(0, rDet - w))} y={T} width={Math.max(0, sx(rDet + w) - sx(Math.max(0, rDet - w)))} height={PH} fill={BAND} />
      {/* pd_max ceiling */}
      <line x1={L} y1={sy(s.pd_max)} x2={L + PW} y2={sy(s.pd_max)} stroke={TXT_DIM} strokeDasharray="4 3" opacity={0.7} />
      <text x={L + PW} y={sy(s.pd_max) - 4} fill={TXT_DIM} fontSize={10} textAnchor="end">P_max {fmt(s.pd_max, 2)}</text>
      {/* R_det line */}
      <line x1={sx(rDet)} y1={T} x2={sx(rDet)} y2={T + PH} stroke={MARK} strokeDasharray="3 3" opacity={0.7} />
      <text x={sx(rDet)} y={T + PH + 14} fill={TXT} fontSize={10} textAnchor="middle">R_det {fmt(rDet)}</text>
      {/* curve */}
      <path d={polyline(pts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={CURVE} strokeWidth={2} />
      {/* half point */}
      <circle cx={sx(rDet)} cy={sy(s.pd_max / 2)} r={3.5} fill={MARK} />
      <text x={L + PW} y={T + 12} fill={TXT} fontSize={11} textAnchor="end">전이 폭 w = {fmt(w)} m</text>
    </Frame>
  )
}

// ── 3) cumulative Pd over the inbound track ───────────────────
const CumulativePd: FC<DiagramProps> = ({ scenario }) => {
  const s = scenario.sensor
  const t = scenario.threat
  const keepOut = scenario.site.keep_out_radius_m
  const step = Math.max(1, t.speed_m_s * s.revisit_time_s)
  const start = Math.max(t.ingress_range_m, keepOut + step)
  const timelyCutoff = Math.max(
    keepOut,
    scenario.effector.commit_range_m +
      t.speed_m_s * (scenario.c2.decision_latency_s + scenario.effector.launch_delay_s),
  )
  const pts: Array<[number, number]> = []
  const dots: Array<[number, number]> = []
  let miss = 1
  let n = 0
  let timely = 0
  for (let r = start; r >= keepOut; r -= step) {
    miss *= 1 - pdAtRange(s, t.rcs_m2, Math.hypot(r, t.altitude_m_agl))
    const cum = 1 - miss
    if (r >= timelyCutoff) timely = cum
    pts.push([r, cum])
    if (n % Math.ceil((start - keepOut) / step / 24 + 1) === 0) dots.push([r, cum])
    n++
  }
  // x: far (ingress) on left → near (keep-out) on right
  const sx = scale(start, keepOut, L, L + PW)
  const sy = scale(0, 1, T + PH, T)
  const final = pts.length ? pts[pts.length - 1][1] : 0
  const cutoffX = sx(Math.min(start, timelyCutoff))
  return (
    <Frame xLabel="거리 r (m) · 접근→" yLabel="누적 P_det">
      <ProbGrid sy={sy} />
      <path d={polyline(pts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={CURVE} strokeWidth={2} />
      <line x1={cutoffX} y1={T} x2={cutoffX} y2={T + PH} stroke={MARK} strokeDasharray="3 3" />
      <text x={cutoffX} y={T + PH + 14} fill={MARK} fontSize={9.5} textAnchor="middle">적시 마감 {fmt(timelyCutoff)}</text>
      {dots.map(([x, y], i) => (
        <circle key={i} cx={sx(x)} cy={sy(y)} r={2} fill={CURVE} />
      ))}
      <text x={L + PW} y={T + 12} fill={TXT} fontSize={11} textAnchor="end">Δr = {fmt(step)} m/스캔</text>
      <text x={L + PW - 2} y={T + 26} fill={TXT} fontSize={10.5} textAnchor="end">
        적시 {(timely * 100).toFixed(5)}% · 전체 {(final * 100).toFixed(3)}%
      </text>
    </Frame>
  )
}

// ── 4) Johnson selected D/R/I task probability vs range ──────
const JohnsonN50: FC<DiagramProps> = ({ scenario, paramKey }) => {
  const level = paramKey === 'optics.n50_detection'
    ? 'detection'
    : paramKey === 'optics.n50_identification'
      ? 'identification'
      : 'recognition'
  const taskName = level === 'detection' ? '탐지' : level === 'identification' ? '식별' : '인식'
  const o = { ...scenario.optics, required_discrimination: level } as Scenario['optics']
  const size = scenario.threat.characteristic_size_m
  const r50 = recognitionRangeForProb(o, size, 0.5)
  const xMax = Number.isFinite(r50) && r50 > 0 ? r50 * 1.9 : 5000
  const sx = scale(0, xMax, L, L + PW)
  const sy = scale(0, 1, T + PH, T)
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= 100; i++) {
    const r = (xMax * i) / 100
    const p = recognitionProb(o, size, r)
    // r→0 makes pixels-on-target diverge (Johnson → NaN); the target then
    // fills the frame, i.e. task probability ≈ 1.
    pts.push([r, Number.isFinite(p) ? p : 1])
  }
  return (
    <Frame xLabel="거리 r (m)" yLabel={`${taskName}확률 P`}>
      <ProbGrid sy={sy} />
      {Number.isFinite(r50) && (
        <>
          <line x1={sx(r50)} y1={T} x2={sx(r50)} y2={T + PH} stroke={MARK} strokeDasharray="3 3" opacity={0.7} />
          <text x={sx(r50)} y={T + PH + 14} fill={TXT} fontSize={10} textAnchor="middle">50% 거리 {fmt(r50)}</text>
        </>
      )}
      <path d={polyline(pts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={CURVE} strokeWidth={2} />
      <text x={L + PW} y={T + 12} fill={TXT} fontSize={11} textAnchor="end">{taskName} N50 = {fmt(activeN50(o) ?? 0)} px</text>
    </Frame>
  )
}

// ── 5) cumulative Pk vs shot count (bars) ─────────────────────
const PkCumulative: FC<DiagramProps> = ({ scenario, paramKey }) => {
  const e = scenario.effector
  // Show the curve for the specific weapon whose ⓘ was opened; for the
  // shot-count parameter, use the active payload.
  const p =
    paramKey === 'effector.single_shot_pk_net'
      ? Math.min(1, Math.max(0, e.single_shot_pk_net))
      : paramKey === 'effector.single_shot_pk_shotgun'
        ? Math.min(1, Math.max(0, e.single_shot_pk_shotgun))
        : singleShotPk(e)
  const weapon =
    paramKey === 'effector.single_shot_pk_net' ? 'NET GUN'
    : paramKey === 'effector.single_shot_pk_shotgun' ? 'SHOTGUN'
    : e.payload === 'net_gun' ? 'NET GUN (활성)' : 'SHOTGUN (활성)'
  const cur = Math.max(1, Math.floor(e.shot_opportunities))
  const nMax = Math.max(6, cur + 2)
  const sy = scale(0, 1, T + PH, T)
  const bw = PW / nMax
  return (
    <Frame xLabel="사격 기회 n" yLabel="누적 P_k">
      <ProbGrid sy={sy} />
      {Array.from({ length: nMax }, (_, i) => {
        const n = i + 1
        const pk = 1 - Math.pow(1 - p, n)
        const x = L + i * bw + bw * 0.18
        const y = sy(pk)
        const isCur = n === cur
        return (
          <g key={n}>
            <rect x={x} y={y} width={bw * 0.64} height={T + PH - y} fill={isCur ? CURVE : 'rgba(49,208,170,0.4)'} />
            {isCur && (
              <text x={x + bw * 0.32} y={y - 4} fill={TXT} fontSize={10} textAnchor="middle">
                {(pk * 100).toFixed(0)}%
              </text>
            )}
            <text x={x + bw * 0.32} y={T + PH + 14} fill={TXT_DIM} fontSize={10} textAnchor="middle">{n}</text>
          </g>
        )
      })}
      <text x={L + PW} y={T + 12} fill={TXT} fontSize={11} textAnchor="end">{weapon} · 단발 p = {fmt(p, 2)}</text>
    </Frame>
  )
}

// ── 6) closing geometry (radial schematic) ────────────────────
const ClosingGeometry: FC<DiagramProps> = ({ scenario }) => {
  const keepOut = scenario.site.keep_out_radius_m
  const det = computeDetection(scenario.sensor, scenario.threat, keepOut)
  const reach = reachSolution(scenario, det.detect_at_range_m)
  const maxReach = scenario.effector.max_engagement_range_m
  const rPad = scenario.effector.launch_pad_range_from_asset_m
  const xMax =
    Math.max(
      scenario.threat.ingress_range_m,
      det.detect_at_range_m,
      reach.required_detection_range_m,
      reach.commit_range_m,
      maxReach,
      keepOut,
    ) * 1.08
  // asset at right (range 0), range grows leftwards
  const sx = scale(0, xMax, L + PW, L)
  const y0 = T + PH * 0.55
  const tick = (r: number, label: string, color: string, up: boolean) => (
    <g key={label}>
      <line x1={sx(r)} y1={y0 - 6} x2={sx(r)} y2={y0 + 6} stroke={color} strokeWidth={1.5} />
      <text x={sx(r)} y={up ? y0 - 10 : y0 + 18} fill={color} fontSize={9.5} textAnchor="middle">{label}</text>
    </g>
  )
  const feas = reach.feasible
  return (
    <Frame xLabel="자산으로부터 거리 (m) →0" yLabel="">
      {/* baseline */}
      <line x1={L} y1={y0} x2={L + PW} y2={y0} stroke={AXIS} strokeWidth={1} />
      {/* asset */}
      <circle cx={sx(0)} cy={y0} r={4} fill={MARK} />
      <text x={sx(0)} y={y0 + 18} fill={TXT} fontSize={9.5} textAnchor="middle">자산</text>
      {/* keep-out ring */}
      <rect x={sx(keepOut)} y={T} width={Math.max(0, sx(0) - sx(keepOut))} height={PH} fill="rgba(255,107,107,0.10)" />
      {tick(keepOut, `keep-out ${fmt(keepOut)}`, WARN, false)}
      {/* max reach */}
      {tick(maxReach, `도달반경 ${fmt(maxReach)}`, TXT_DIM, true)}
      {rPad > 0 && tick(rPad, `발사대 ${fmt(rPad)}`, TXT_DIM, false)}
      {tick(det.detect_at_range_m, `탐지 ${fmt(det.detect_at_range_m)}`, TXT, true)}
      {/* doctrinal commit range + the detection range it demands */}
      {tick(reach.commit_range_m, `발사개시 ${fmt(reach.commit_range_m)}`, ACCENT, false)}
      {tick(
        reach.required_detection_range_m,
        `필요탐지 ${fmt(reach.required_detection_range_m)}`,
        reach.detection_limited ? WARN : TXT_DIM,
        true,
      )}
      {/* threat inbound arrow */}
      <line x1={sx(det.detect_at_range_m)} y1={y0 - 22} x2={sx(Math.max(keepOut, reach.intercept_range_m))} y2={y0 - 22} stroke={CURVE} strokeWidth={1.5} markerEnd="url(#arrow)" />
      <text x={sx(det.detect_at_range_m)} y={y0 - 26} fill={CURVE} fontSize={9.5}>위협 v_t={fmt(scenario.threat.speed_m_s)}</text>
      {/* intercept point */}
      {reach.intercept_range_m > 0 && (
        <>
          <line x1={sx(reach.intercept_range_m)} y1={T} x2={sx(reach.intercept_range_m)} y2={T + PH} stroke={feas ? CURVE : WARN} strokeDasharray="3 3" />
          <circle cx={sx(reach.intercept_range_m)} cy={y0} r={5} fill={feas ? CURVE : WARN} />
          <text x={sx(reach.intercept_range_m)} y={T + 10} fill={feas ? CURVE : WARN} fontSize={10} textAnchor="middle">
            요격 {fmt(reach.intercept_range_m)}
          </text>
        </>
      )}
      <text x={L} y={H - 4} fill={feas ? CURVE : WARN} fontSize={10}>
        {feas ? `✓ 교전 성립 · 여유 ${fmt(reach.margin_m)} m` : `✗ ${reach.reason}`}
        {reach.detection_limited
          ? ` · ⚠ 탐지 제약(${fmt(reach.detection_margin_m)} m 부족)`
          : ` · 탐지 여유 ${fmt(reach.detection_margin_m)} m`}
      </text>
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={CURVE} />
        </marker>
      </defs>
    </Frame>
  )
}

// ── 7) FOV trade-off: acquisition × recognition vs HFOV ───────
const REC = '#7db8ff'
const ACQ = '#ffcf6b'
const FovAcquisition: FC<DiagramProps> = ({ scenario }) => {
  const o = scenario.optics
  const size = scenario.threat.characteristic_size_m
  // Onboard EO is evaluated at the configured camera↔target relative LOS
  // completion separation, not an asset-relative pre-launch range.
  const terminalRange = o.terminal_recognition_range_m
  const lo = 0.3
  const hi = 40
  const lx = (v: number) => Math.log10(v)
  const sx = scale(lx(lo), lx(hi), L, L + PW)
  const sy = scale(0, 1, T + PH, T)
  const acqPts: Array<[number, number]> = []
  const recPts: Array<[number, number]> = []
  const prodPts: Array<[number, number]> = []
  let best = { h: o.hfov_deg, p: -1 }
  for (let i = 0; i <= 100; i++) {
    const h = Math.pow(10, lx(lo) + ((lx(hi) - lx(lo)) * i) / 100)
    const oo = { ...o, hfov_deg: h }
    const acq = acquisitionProb(oo)
    const rec = recognitionProb(oo, size, terminalRange)
    const prod = acq * rec
    acqPts.push([lx(h), acq])
    recPts.push([lx(h), rec])
    prodPts.push([lx(h), prod])
    if (prod > best.p) best = { h, p: prod }
  }
  const curX = sx(lx(o.hfov_deg))
  const optX = sx(lx(best.h))
  return (
    <Frame xLabel="화각 HFOV (°, 로그)" yLabel="확률">
      <ProbGrid sy={sy} />
      <path d={polyline(acqPts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={ACQ} strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={polyline(recPts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={REC} strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={polyline(prodPts, (x) => sx(x), (y) => sy(y))} fill="none" stroke={CURVE} strokeWidth={2.5} />
      {/* optimum */}
      <line x1={optX} y1={T} x2={optX} y2={T + PH} stroke={CURVE} strokeDasharray="2 3" opacity={0.7} />
      <text x={optX} y={T + PH + 14} fill={CURVE} fontSize={10} textAnchor="middle">최적 {fmt(best.h, 1)}°</text>
      {/* current */}
      <line x1={curX} y1={T} x2={curX} y2={T + PH} stroke={MARK} strokeDasharray="3 3" opacity={0.6} />
      <text x={curX} y={T + 10} fill={MARK} fontSize={10} textAnchor="middle">현재 {fmt(o.hfov_deg, 1)}°</text>
      {/* legend */}
      <text x={L + 4} y={T + 12} fill={ACQ} fontSize={10}>─ P_acq(획득)</text>
      <text x={L + 4} y={T + 25} fill={REC} fontSize={10}>─ 인식</text>
      <text x={L + 4} y={T + 38} fill={CURVE} fontSize={10}>━ 곱(P_acq·인식)</text>
    </Frame>
  )
}

export const DIAGRAMS: Record<DiagramId, FC<DiagramProps>> = {
  'rcs-scaling': RcsScaling,
  'pd-logistic': PdLogistic,
  'cumulative-pd': CumulativePd,
  'johnson-n50': JohnsonN50,
  'pk-cumulative': PkCumulative,
  'closing-geometry': ClosingGeometry,
  'fov-acquisition': FovAcquisition,
}
