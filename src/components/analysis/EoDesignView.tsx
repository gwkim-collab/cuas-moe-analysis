import { useMemo, useState } from 'react'
import {
  analyzeOpticalDesign,
  type EoDiscriminationLevel,
  type Scenario,
} from '../../analysis'

interface Props {
  scenario: Scenario
  onChange: (scenario: Scenario) => void
}

function pct(x: number): string {
  return Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : '—'
}

function pctDetect(x: number): string {
  if (!Number.isFinite(x)) return '—'
  return x > 0.999 && x < 1 ? `${(x * 100).toFixed(5)}%` : pct(x)
}

function m(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(0)} m` : '—'
}

function sec(x: number): string {
  return Number.isFinite(x) ? `${x.toFixed(1)} s` : '—'
}

function num(x: number, digits = 1): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '—'
}

export default function EoDesignView({ scenario, onChange }: Props) {
  const [targetPixels, setTargetPixels] = useState(20)
  const recognitionRange = scenario.optics.terminal_recognition_range_m
  const level: EoDiscriminationLevel =
    scenario.optics.required_discrimination === 'radar_only' ? 'recognition' : scenario.optics.required_discrimination

  const result = useMemo(
    () =>
      analyzeOpticalDesign(scenario, {
        recognition_range_m: recognitionRange,
        target_pixels: targetPixels,
        discrimination_level: level,
      }),
    [scenario, recognitionRange, targetPixels, level],
  )

  const opticsValid =
    Number.isFinite(result.required_hfov_deg) &&
    result.required_hfov_deg >= 0.05 &&
    result.required_hfov_deg <= 179
  const taskName = level === 'detection' ? '탐지' : level === 'identification' ? '식별' : '인식'
  const taskN50 = level === 'detection'
    ? scenario.optics.n50_detection
    : level === 'identification'
      ? scenario.optics.n50_identification
      : scenario.optics.n50_recognition
  const eo = result.moe.terminal_eo

  const setOptics = (patch: Partial<Scenario['optics']>) =>
    onChange({ ...scenario, optics: { ...scenario.optics, ...patch } })

  const applyOptics = () => {
    if (!opticsValid) return
    onChange(result.scenario)
  }

  return (
    <div className="an-results an-eo-design">
      <div className="an-card an-eo-intro">
        <div>
        <div className="ab-label">EO/IR 광학 설계 · 발사 후 종말 D/R/I</div>
          <div className="an-gate-note ab-small">
            왼쪽 교리 거리에서 먼저 발사한 뒤, 요격기 카메라↔표적 상대 LOS 거리에서 EO 처리를 완료합니다.
            목표 픽셀에 필요한 화각과 두 기체의 상대기하·무력화 확률을 함께 계산합니다.
          </div>
        </div>
        <div className="an-eo-actions">
          <button type="button" className="an-btn-exit" disabled={!opticsValid} onClick={applyOptics}>
            계산 화각 적용
          </button>
        </div>
      </div>

      <div className="an-eo-grid">
        <div className="an-card">
          <div className="ab-label">설계 목표</div>
          <div className="an-eo-form">
            <label>
              <span>EO–표적 {taskName} 완료 거리 <em>상대 LOS</em></span>
              <span>
                <input
                  type="number"
                  min={1}
                  max={50000}
                  step={50}
                  value={recognitionRange}
                  onChange={(e) => setOptics({ terminal_recognition_range_m: Math.max(1, Number(e.target.value) || 1) })}
                /> m
              </span>
            </label>
            <label>
              <span>목표 표적 픽셀 수</span>
              <span>
                <input
                  type="number"
                  min={0.1}
                  max={10000}
                  step={1}
                  value={targetPixels}
                  onChange={(e) => setTargetPixels(Math.max(0.1, Number(e.target.value) || 0.1))}
                /> px
              </span>
            </label>
            <label>
              <span>판별 수준</span>
              <select
                value={level}
                onChange={(e) => setOptics({ required_discrimination: e.target.value as EoDiscriminationLevel })}
              >
                <option value="detection">탐지 · 물체 존재</option>
                <option value="recognition">인식 · 표적 클래스</option>
                <option value="identification">식별 · 특정 기종/모델</option>
              </select>
            </label>
          </div>
          <div className="an-eo-context ab-small">
            현재 시나리오: 표적 {num(scenario.threat.characteristic_size_m, 2)} m · 영상 {scenario.optics.h_resolution_px.toFixed(0)} px ·
            발사 교리 {m(scenario.effector.commit_range_m)} · EO {taskName} N50 {taskN50} px
          </div>
        </div>

        <div className="an-card">
          <div className="ab-label">필요 광학 사양</div>
          {!opticsValid && <div className="an-reason">요구 화각이 카메라 모델의 유효 범위(0.05°~179°)를 벗어났습니다.</div>}
          <dl className="an-readout">
            <div><dt>EO–표적 상대 LOS</dt><dd>{m(result.camera_target_range_m)}</dd></div>
            <div className={opticsValid ? 'ok' : 'bad'}><dt>필요 수평 화각 HFOV</dt><dd>{num(result.required_hfov_deg, 2)}°</dd></div>
            <div><dt>필요 IFOV</dt><dd>{num(result.required_ifov_urad, 2)} µrad/px</dd></div>
            <div><dt>환산 초점거리</dt><dd>{num(result.focal_length_mm, 1)} mm</dd></div>
            <div><dt>목표거리 화면 폭</dt><dd>{num(result.scene_width_m, 1)} m</dd></div>
            <div><dt>역산 검산</dt><dd>{num(result.pixels_on_target, 1)} px</dd></div>
          </dl>
        </div>

        <div className="an-card">
          <div className="ab-label">종말 EO 판별 확률</div>
          <dl className="an-readout">
            <div><dt>Johnson {taskName} 확률</dt><dd>{pct(result.recognition_probability)}</dd></div>
            <div><dt>획득 확률 P_acq</dt><dd>{pct(result.acquisition_probability)}</dd></div>
            <div><dt>대기 투과</dt><dd>{pct(result.atmospheric_transmission)}</dd></div>
            <div className={result.classification_probability >= 0.5 ? 'ok' : 'bad'}><dt>종합 P_terminal EO</dt><dd>{pct(result.classification_probability)}</dd></div>
          </dl>
          <div className="an-eo-context ab-small">
            종말 EO = 획득 × Johnson {taskName} × 대기투과 × EO 과업 신뢰도 상한
          </div>
        </div>

        <div className={`an-card an-eo-moe ${result.timeline_feasible ? 'is-ok' : 'is-bad'}`}>
          <div className="ab-label">예상 무력화 확률</div>
          <div className="an-eo-pnegate">{pct(result.moe.p_negate)}</div>
          <div className={`an-feasible-badge ${result.timeline_feasible ? 'ok' : 'bad'}`}>
            {result.timeline_feasible ? '✓ 발사 후 EO 시간선 성립' : '✕ 시간선 불성립'}
          </div>
          <div className="an-eo-gates ab-small">
            P_detect(in time) {pctDetect(result.moe.breakdown.p_detect)} · P_terminal EO {pct(result.moe.breakdown.p_classify)} ·
            P_decision {pct(result.moe.breakdown.p_decision)} · P_reach {pct(result.moe.breakdown.p_reach)} · P_kill {pct(result.moe.breakdown.p_kill)}
          </div>
          {!result.timeline_feasible && <div className="an-reason">{result.limitation}</div>}
        </div>
      </div>

      <div className="an-card">
        <div className="ab-label">레이더→발사→EO→요격 시간선</div>
        <div className="an-eo-timeline">
          <div className={result.moe.reach.detection_margin_m >= 0 ? 'ok' : 'bad'}>
            <span>1 · 레이더 탐지</span>
            <b>{m(result.moe.detection.detect_at_range_m)}</b>
            <small>필요 {m(result.moe.reach.required_detection_range_m)}</small>
          </div>
          <div className={result.moe.reach.feasible ? 'ok' : 'bad'}>
            <span>2 · AB-U10 발사</span>
            <b>{m(result.moe.reach.threat_range_at_launch_m)}</b>
            <small>왼쪽 발사 교리 {m(scenario.effector.commit_range_m)} 유지</small>
          </div>
          <div className={eo.processing_start_after_launch_s >= 0 ? 'ok' : 'bad'}>
            <span>3 · EO 처리 시작</span>
            <b>상대 {m(eo.processing_start_separation_m)}</b>
            <small>표적 {m(eo.target_range_at_start_m)} · U10 {m(eo.interceptor_range_at_start_m)}</small>
          </div>
          <div className={eo.timing_feasible ? 'ok' : 'bad'}>
            <span>4 · {taskName} 완료</span>
            <b>상대 {m(eo.recognition_separation_m)}</b>
            <small>표적 {m(eo.target_range_at_recognition_m)} · U10 {m(eo.interceptor_range_at_recognition_m)}</small>
          </div>
          <div className={result.moe.reach.feasible ? 'ok' : 'bad'}>
            <span>5 · 예상 요격</span>
            <b>{m(result.moe.reach.intercept_range_m)}</b>
            <small>keep-out {m(scenario.site.keep_out_radius_m)}</small>
          </div>
        </div>
        <div className="an-eo-minimum">
          <div>
            <span className="ab-small">발사 후 상대기하</span>
            <b>EO 시작 T+{sec(eo.processing_start_after_launch_s)} · 완료 T+{sec(eo.recognition_after_launch_s)}</b>
            <small>인식 완료 후 요격까지 {sec(eo.time_remaining_to_intercept_s)} · 동일 방사선·고도 정면접근 근사</small>
          </div>
        </div>
      </div>
    </div>
  )
}
