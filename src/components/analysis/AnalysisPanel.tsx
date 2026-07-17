import { focalLengthMm, paramInfo, type Scenario } from '../../analysis'
import type { PayloadMode } from '../../types'

interface Props {
  scenario: Scenario
  onChange: (next: Scenario) => void
  onReset: () => void
}

// Meaning of a parameter (for the hover tooltip), from the doc registry.
function hintFor(key: string): string | undefined {
  const info = paramInfo(key)
  return info ? `${info.description}\n\n[출처] ${info.source}` : undefined
}

// Small labelled numeric input. `hint` becomes a hover tooltip (title).
function NumField({
  label,
  unit,
  value,
  step,
  hint,
  onChange,
}: {
  label: string
  unit?: string
  value: number
  step?: number
  hint?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="an-field" title={hint}>
      <span className="an-field-label">
        {label}
        {unit ? <em className="an-field-unit"> · {unit}</em> : null}
        {hint ? <span className="an-field-info" aria-hidden>ⓘ</span> : null}
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

export default function AnalysisPanel({ scenario, onChange, onReset }: Props) {
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

      <fieldset className="an-group">
        <legend>위협 · THREAT</legend>
        <NumField label="RCS" unit="m²" value={t.rcs_m2} step={0.001} hint={hintFor('threat.rcs_m2')} onChange={(v) => setThreat({ rcs_m2: v })} />
        <NumField label="속도" unit="m/s" value={t.speed_m_s} hint={hintFor('threat.speed_m_s')} onChange={(v) => setThreat({ speed_m_s: v })} />
        <NumField label="고도 AGL" unit="m" value={t.altitude_m_agl} hint={hintFor('threat.altitude_m_agl')} onChange={(v) => setThreat({ altitude_m_agl: v })} />
        <NumField label="진입 거리" unit="m" value={t.ingress_range_m} hint={hintFor('threat.ingress_range_m')} onChange={(v) => setThreat({ ingress_range_m: v })} />
        <NumField label="진입 방위" unit="°" value={t.approach_bearing_deg} hint={hintFor('threat.approach_bearing_deg')} onChange={(v) => setThreat({ approach_bearing_deg: v })} />
        <NumField label="표적 크기" unit="m" value={t.characteristic_size_m} step={0.05} hint={hintFor('threat.characteristic_size_m')} onChange={(v) => setThreat({ characteristic_size_m: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>레이더 · SENSOR</legend>
        <NumField label="기준 RCS" unit="m²" value={s.ref_rcs_m2} step={0.001} hint={hintFor('sensor.ref_rcs_m2')} onChange={(v) => setSensor({ ref_rcs_m2: v })} />
        <NumField label="기준 탐지거리" unit="m" value={s.ref_detection_range_m} hint={hintFor('sensor.ref_detection_range_m')} onChange={(v) => setSensor({ ref_detection_range_m: v })} />
        <NumField label="최대 Pd" value={s.pd_max} step={0.01} hint={hintFor('sensor.pd_max')} onChange={(v) => setSensor({ pd_max: v })} />
        <NumField label="전이 폭" unit="m" value={s.pd_transition_width_m} hint={hintFor('sensor.pd_transition_width_m')} onChange={(v) => setSensor({ pd_transition_width_m: v })} />
        <NumField label="재방문 주기" unit="s" value={s.revisit_time_s} step={0.1} hint={hintFor('sensor.revisit_time_s')} onChange={(v) => setSensor({ revisit_time_s: v })} />
        <NumField label="분류 시간" unit="s" value={s.classify_time_s} step={0.5} hint={hintFor('sensor.classify_time_s')} onChange={(v) => setSensor({ classify_time_s: v })} />
        <NumField label="분류기 상한" value={s.classify_prob} step={0.01} hint={hintFor('sensor.classify_prob')} onChange={(v) => setSensor({ classify_prob: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>EO/IR 광학 · 인식</legend>
        <NumField label="화각 HFOV" unit="°" value={o.hfov_deg} step={0.1} hint={hintFor('optics.hfov_deg')} onChange={(v) => setOptics({ hfov_deg: v })} />
        <NumField label="가로 해상도" unit="px" value={o.h_resolution_px} step={10} hint={hintFor('optics.h_resolution_px')} onChange={(v) => setOptics({ h_resolution_px: v })} />
        <NumField label="센서 폭" unit="mm" value={o.sensor_width_mm} step={0.1} hint={hintFor('optics.sensor_width_mm')} onChange={(v) => setOptics({ sensor_width_mm: v })} />
        <NumField label="인식 요구픽셀 N50" unit="px" value={o.n50_recognition} step={1} hint={hintFor('optics.n50_recognition')} onChange={(v) => setOptics({ n50_recognition: v })} />
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
        <NumField label="발사 지연" unit="s" value={e.launch_delay_s} step={0.5} hint={hintFor('effector.launch_delay_s')} onChange={(v) => setEffector({ launch_delay_s: v })} />
        <NumField label="순항 속도" unit="m/s" value={e.cruise_speed_m_s} hint={hintFor('effector.cruise_speed_m_s')} onChange={(v) => setEffector({ cruise_speed_m_s: v })} />
        <NumField label="최대 교전거리" unit="m" value={e.max_engagement_range_m} hint={hintFor('effector.max_engagement_range_m')} onChange={(v) => setEffector({ max_engagement_range_m: v })} />
        <NumField label="발사대 거리" unit="m" value={e.launch_pad_range_from_asset_m} hint={hintFor('effector.launch_pad_range_from_asset_m')} onChange={(v) => setEffector({ launch_pad_range_from_asset_m: v })} />
        <NumField label="단발 Pk · net" value={e.single_shot_pk_net} step={0.01} hint={hintFor('effector.single_shot_pk_net')} onChange={(v) => setEffector({ single_shot_pk_net: v })} />
        <NumField label="단발 Pk · shotgun" value={e.single_shot_pk_shotgun} step={0.01} hint={hintFor('effector.single_shot_pk_shotgun')} onChange={(v) => setEffector({ single_shot_pk_shotgun: v })} />
        <NumField label="사격 기회 수" value={e.shot_opportunities} step={1} hint={hintFor('effector.shot_opportunities')} onChange={(v) => setEffector({ shot_opportunities: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>C2 · 결심</legend>
        <NumField label="결심 지연" unit="s" value={c.decision_latency_s} step={0.5} hint={hintFor('c2.decision_latency_s')} onChange={(v) => setC2({ decision_latency_s: v })} />
        <NumField label="결심 신뢰도" value={c.decision_reliability} step={0.01} hint={hintFor('c2.decision_reliability')} onChange={(v) => setC2({ decision_reliability: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>사이트 · SITE</legend>
        <NumField label="Keep-out 반경" unit="m" value={si.keep_out_radius_m} hint={hintFor('site.keep_out_radius_m')} onChange={(v) => setSite({ keep_out_radius_m: v })} />
      </fieldset>

      <p className="an-disclaimer ab-small">
        ⚠ 기본값은 공개 문헌·목업 기준의 <b>편집 가능한 플레이스홀더</b>이며 확정 성능치가
        아닙니다. 각 항목 의미·출처는 상단 <b>파라미터 설명</b> 탭 또는 필드에 마우스를 올리면 볼 수 있습니다.
      </p>
    </div>
  )
}
