import { focalLengthMm, paramInfo, type Scenario, type DiscriminationLevel } from '../../analysis'
import type { PayloadMode } from '../../types'
import ScenarioBar from './ScenarioBar'

interface Props {
  scenario: Scenario
  onChange: (next: Scenario) => void
  onReset: () => void
  /** Open the formula/diagram explainer for a parameter key. */
  onExplain?: (key: string) => void
}

// Meaning of a parameter (for the hover tooltip), from the doc registry.
function hintFor(key: string): string | undefined {
  const info = paramInfo(key)
  return info ? `${info.description}\n\n[출처] ${info.source}` : undefined
}

// Small labelled numeric input. Hover shows the meaning; the ⓘ button
// opens the formula/diagram explainer for `paramKey`.
function NumField({
  label,
  unit,
  value,
  step,
  paramKey,
  onExplain,
  onChange,
}: {
  label: string
  unit?: string
  value: number
  step?: number
  paramKey: string
  onExplain?: (key: string) => void
  onChange: (v: number) => void
}) {
  const hint = hintFor(paramKey)
  return (
    <label className="an-field" title={hint}>
      <span className="an-field-label">
        {label}
        {unit ? <em className="an-field-unit"> · {unit}</em> : null}
        {onExplain ? (
          <button
            type="button"
            className="an-field-info"
            title="수식·그림으로 설명 보기"
            onClick={(ev) => {
              ev.preventDefault()
              ev.stopPropagation()
              onExplain(paramKey)
            }}
          >
            ⓘ
          </button>
        ) : hint ? (
          <span className="an-field-info" aria-hidden>ⓘ</span>
        ) : null}
      </span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step ?? 'any'}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          onChange(Number.isFinite(v) ? v : 0)
        }}
      />
    </label>
  )
}

export default function AnalysisPanel({ scenario, onChange, onReset, onExplain }: Props) {
  const setThreat = (p: Partial<Scenario['threat']>) =>
    onChange({ ...scenario, threat: { ...scenario.threat, ...p } })
  const setSensor = (p: Partial<Scenario['sensor']>) =>
    onChange({ ...scenario, sensor: { ...scenario.sensor, ...p } })
  const setOptics = (p: Partial<Scenario['optics']>) =>
    onChange({ ...scenario, optics: { ...scenario.optics, ...p } })
  const setEffector = (p: Partial<Scenario['effector']>) =>
    onChange({ ...scenario, effector: { ...scenario.effector, ...p } })
  const setC2 = (p: Partial<Scenario['c2']>) =>
    onChange({ ...scenario, c2: { ...scenario.c2, ...p } })
  const setSite = (p: Partial<Scenario['site']>) =>
    onChange({ ...scenario, site: { ...scenario.site, ...p } })

  const t = scenario.threat
  const s = scenario.sensor
  const o = scenario.optics
  const e = scenario.effector
  const c = scenario.c2
  const si = scenario.site

  return (
    <div className="an-panel">
      <div className="an-panel-head">
        <div className="ab-label">시나리오 파라미터</div>
        <button type="button" className="an-btn-ghost" onClick={onReset}>
          ↺ 기본값
        </button>
      </div>

      <ScenarioBar scenario={scenario} onLoad={onChange} />


      <fieldset className="an-group">
        <legend>위협 · THREAT</legend>
        <NumField label="RCS" unit="m²" value={t.rcs_m2} step={0.001} paramKey="threat.rcs_m2" onExplain={onExplain} onChange={(v) => setThreat({ rcs_m2: v })} />
        <NumField label="속도" unit="m/s" value={t.speed_m_s} paramKey="threat.speed_m_s" onExplain={onExplain} onChange={(v) => setThreat({ speed_m_s: v })} />
        <NumField label="고도 AGL" unit="m" value={t.altitude_m_agl} paramKey="threat.altitude_m_agl" onExplain={onExplain} onChange={(v) => setThreat({ altitude_m_agl: v })} />
        <NumField label="진입 거리" unit="m" value={t.ingress_range_m} paramKey="threat.ingress_range_m" onExplain={onExplain} onChange={(v) => setThreat({ ingress_range_m: v })} />
        <NumField label="진입 방위" unit="°" value={t.approach_bearing_deg} paramKey="threat.approach_bearing_deg" onExplain={onExplain} onChange={(v) => setThreat({ approach_bearing_deg: v })} />
        <NumField label="표적 크기" unit="m" value={t.characteristic_size_m} step={0.05} paramKey="threat.characteristic_size_m" onExplain={onExplain} onChange={(v) => setThreat({ characteristic_size_m: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>레이더 · SENSOR</legend>
        <NumField label="기준 RCS" unit="m²" value={s.ref_rcs_m2} step={0.001} paramKey="sensor.ref_rcs_m2" onExplain={onExplain} onChange={(v) => setSensor({ ref_rcs_m2: v })} />
        <NumField label="기준 탐지거리" unit="m" value={s.ref_detection_range_m} paramKey="sensor.ref_detection_range_m" onExplain={onExplain} onChange={(v) => setSensor({ ref_detection_range_m: v })} />
        <NumField label="최대 Pd" value={s.pd_max} step={0.01} paramKey="sensor.pd_max" onExplain={onExplain} onChange={(v) => setSensor({ pd_max: v })} />
        <NumField label="전이 폭" unit="m" value={s.pd_transition_width_m} paramKey="sensor.pd_transition_width_m" onExplain={onExplain} onChange={(v) => setSensor({ pd_transition_width_m: v })} />
        <NumField label="재방문 주기" unit="s" value={s.revisit_time_s} step={0.1} paramKey="sensor.revisit_time_s" onExplain={onExplain} onChange={(v) => setSensor({ revisit_time_s: v })} />
        <NumField label="분류 시간" unit="s" value={s.classify_time_s} step={0.5} paramKey="sensor.classify_time_s" onExplain={onExplain} onChange={(v) => setSensor({ classify_time_s: v })} />
        <NumField label="분류기 상한" value={s.classify_prob} step={0.01} paramKey="sensor.classify_prob" onExplain={onExplain} onChange={(v) => setSensor({ classify_prob: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>EO/IR 광학 · 인식</legend>
        <NumField label="화각 HFOV" unit="°" value={o.hfov_deg} step={0.1} paramKey="optics.hfov_deg" onExplain={onExplain} onChange={(v) => setOptics({ hfov_deg: v })} />
        <NumField label="가로 해상도" unit="px" value={o.h_resolution_px} step={10} paramKey="optics.h_resolution_px" onExplain={onExplain} onChange={(v) => setOptics({ h_resolution_px: v })} />
        <NumField label="센서 폭" unit="mm" value={o.sensor_width_mm} step={0.1} paramKey="optics.sensor_width_mm" onExplain={onExplain} onChange={(v) => setOptics({ sensor_width_mm: v })} />
        <label className="an-field" title="교전 승인에 요구되는 Johnson 판별 수준 — 이 수준의 N50이 P_classify에 쓰임">
          <span className="an-field-label">요구 판별 수준</span>
          <select
            value={o.required_discrimination}
            onChange={(ev) => setOptics({ required_discrimination: ev.target.value as DiscriminationLevel })}
          >
            <option value="detection">탐지 (있다)</option>
            <option value="recognition">인식 (드론/위협)</option>
            <option value="identification">식별 (기종)</option>
          </select>
        </label>
        <NumField label="탐지 N50" unit="px" value={o.n50_detection} step={0.5} paramKey="optics.n50_detection" onExplain={onExplain} onChange={(v) => setOptics({ n50_detection: v })} />
        <NumField label="인식 N50" unit="px" value={o.n50_recognition} step={1} paramKey="optics.n50_recognition" onExplain={onExplain} onChange={(v) => setOptics({ n50_recognition: v })} />
        <NumField label="식별 N50" unit="px" value={o.n50_identification} step={1} paramKey="optics.n50_identification" onExplain={onExplain} onChange={(v) => setOptics({ n50_identification: v })} />
        <NumField label="레이더 큐 오차" unit="°" value={o.cue_error_deg} step={0.1} paramKey="optics.cue_error_deg" onExplain={onExplain} onChange={(v) => setOptics({ cue_error_deg: v })} />
        <NumField label="요격기 지향 오차" unit="°" value={o.pointing_error_deg} step={0.1} paramKey="optics.pointing_error_deg" onExplain={onExplain} onChange={(v) => setOptics({ pointing_error_deg: v })} />
        <NumField label="대기 시정" unit="km" value={o.visibility_km} step={0.5} paramKey="optics.visibility_km" onExplain={onExplain} onChange={(v) => setOptics({ visibility_km: v })} />
        <p className="an-field-note ab-small">
          ≈ 초점거리 {focalLengthMm(o).toFixed(0)} mm (센서폭 {o.sensor_width_mm} mm 기준)
        </p>
        <p className="an-field-note ab-small" style={{ opacity: 0.7 }}>
          ↑ 성능: 해상도·표적크기 · ↓ 성능(난이도↑): N50·화각. N50은 인식에 필요한 픽셀 수(문턱값).
        </p>
      </fieldset>

      <fieldset className="an-group">
        <legend>이팩터 · EFFECTOR</legend>
        <label className="an-field">
          <span className="an-field-label">페이로드</span>
          <select
            value={e.payload}
            onChange={(ev) => setEffector({ payload: ev.target.value as PayloadMode })}
          >
            <option value="net_gun">NET GUN</option>
            <option value="shotgun">SHOTGUN</option>
          </select>
        </label>
        <NumField label="발사 지연" unit="s" value={e.launch_delay_s} step={0.5} paramKey="effector.launch_delay_s" onExplain={onExplain} onChange={(v) => setEffector({ launch_delay_s: v })} />
        <NumField label="순항 속도" unit="m/s" value={e.cruise_speed_m_s} paramKey="effector.cruise_speed_m_s" onExplain={onExplain} onChange={(v) => setEffector({ cruise_speed_m_s: v })} />
        <NumField label="최대 교전거리" unit="m" value={e.max_engagement_range_m} paramKey="effector.max_engagement_range_m" onExplain={onExplain} onChange={(v) => setEffector({ max_engagement_range_m: v })} />
        <NumField label="발사대 거리" unit="m" value={e.launch_pad_range_from_asset_m} paramKey="effector.launch_pad_range_from_asset_m" onExplain={onExplain} onChange={(v) => setEffector({ launch_pad_range_from_asset_m: v })} />
        <NumField label="단발 Pk · net" value={e.single_shot_pk_net} step={0.01} paramKey="effector.single_shot_pk_net" onExplain={onExplain} onChange={(v) => setEffector({ single_shot_pk_net: v })} />
        <NumField label="단발 Pk · shotgun" value={e.single_shot_pk_shotgun} step={0.01} paramKey="effector.single_shot_pk_shotgun" onExplain={onExplain} onChange={(v) => setEffector({ single_shot_pk_shotgun: v })} />
        <NumField label="사격 기회 수" value={e.shot_opportunities} step={1} paramKey="effector.shot_opportunities" onExplain={onExplain} onChange={(v) => setEffector({ shot_opportunities: v })} />
        <NumField label="체공 시간" unit="s" value={e.endurance_s} step={30} paramKey="effector.endurance_s" onExplain={onExplain} onChange={(v) => setEffector({ endurance_s: v })} />
        <NumField label="여유 σ" unit="m" value={e.reach_margin_sigma_m} step={10} paramKey="effector.reach_margin_sigma_m" onExplain={onExplain} onChange={(v) => setEffector({ reach_margin_sigma_m: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>C2 · 결심</legend>
        <NumField label="결심 지연" unit="s" value={c.decision_latency_s} step={0.5} paramKey="c2.decision_latency_s" onExplain={onExplain} onChange={(v) => setC2({ decision_latency_s: v })} />
        <NumField label="결심 신뢰도" value={c.decision_reliability} step={0.01} paramKey="c2.decision_reliability" onExplain={onExplain} onChange={(v) => setC2({ decision_reliability: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>사이트 · SITE</legend>
        <NumField label="Keep-out 반경" unit="m" value={si.keep_out_radius_m} paramKey="site.keep_out_radius_m" onExplain={onExplain} onChange={(v) => setSite({ keep_out_radius_m: v })} />
      </fieldset>

      <p className="an-disclaimer ab-small">
        ⚠ 기본값은 공개 문헌·목업 기준의 <b>편집 가능한 플레이스홀더</b>이며 확정 성능치가
        아닙니다. 각 항목 <b>ⓘ</b>를 누르면 수식·그림 설명이, 마우스를 올리면 요약이 나옵니다.
      </p>
    </div>
  )
}
