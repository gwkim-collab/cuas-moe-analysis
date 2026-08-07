import {
  focalLengthMm,
  paramExplain,
  paramInfo,
  pdHalfPointRange,
  validateScenario,
  autoFixScenario,
  type Scenario,
  type DiscriminationLevel,
} from '../../analysis'
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
  if (!info) return undefined
  const ex = paramExplain(key)
  return [
    `[의미·동작] ${info.description}`,
    ex?.theory ? `[이론 근거] ${ex.theory}` : undefined,
    ex?.assumption ? `[모델 가정] ${ex.assumption}` : undefined,
    `[값 출처] ${info.source}`,
    'ⓘ 버튼에서 수식·상세 설명을 확인할 수 있습니다.',
  ].filter(Boolean).join('\n\n')
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
  active,
  dim,
}: {
  label: string
  unit?: string
  value: number
  step?: number
  paramKey: string
  onExplain?: (key: string) => void
  onChange: (v: number) => void
  /** Mark as the currently-selected option (accent + 활성 badge). */
  active?: boolean
  /** Mark as an independent-but-inactive option (dimmed). */
  dim?: boolean
}) {
  const hint = hintFor(paramKey)
  const info = paramInfo(paramKey)
  // Out-of-range is flagged, never silently corrected: clamping mid-typing
  // fights the user, and a wrong value the model quietly absorbs is worse
  // than a visible red field. The banner below the group lists every issue.
  const bad =
    info != null &&
    (!Number.isFinite(value) ||
      value < info.range.min ||
      value > info.range.max ||
      (info.integer === true && !Number.isInteger(value)))
  return (
    <label
      className={`an-field ${active ? 'is-active-opt' : ''} ${dim ? 'is-dim-opt' : ''} ${bad ? 'is-invalid' : ''}`}
      title={hint}
    >
      <span className="an-field-label">
        {label}
        {unit ? <em className="an-field-unit"> · {unit}</em> : null}
        {active ? <span className="an-opt-badge">활성</span> : null}
        {bad ? <span className="an-bad-badge" title={`유효 범위 ${info.range.min} ~ ${info.range.max}`}>범위 밖</span> : null}
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
        step={step ?? (info?.integer ? 1 : 'any')}
        min={info?.range.min}
        max={info?.range.max}
        aria-invalid={bad || undefined}
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

      {(() => {
        const issues = validateScenario(scenario)
        if (issues.length === 0) return null
        const errors = issues.filter((i) => i.severity === 'error')
        return (
          <div className={`an-validation ${errors.length > 0 ? 'is-error' : 'is-warn'}`}>
            <div className="an-validation-head">
              <span className="an-validation-tag">{errors.length > 0 ? '✕ 입력 오류' : '⚠ 입력 경고'}</span>
              <span className="ab-small">
                {errors.length > 0
                  ? `${errors.length}개 — 결과가 무의미할 수 있습니다`
                  : `${issues.length}개 — 계산은 되지만 의도와 다를 수 있습니다`}
              </span>
              {errors.length > 0 && (
                <button type="button" className="an-btn-ghost" onClick={() => onChange(autoFixScenario(scenario))}>
                  ↺ 범위로 자동 수정
                </button>
              )}
            </div>
            <ul className="an-validation-list">
              {issues.map((i) => (
                <li key={`${i.key}:${i.message}`} className={i.severity === 'error' ? 'is-error' : 'is-warn'}>
                  <b>{i.label}</b> — {i.message}
                </li>
              ))}
            </ul>
          </div>
        )
      })()}

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
        <NumField label="기준거리 단일스캔 Pd" value={s.pd_at_ref} step={0.01} paramKey="sensor.pd_at_ref" onExplain={onExplain} onChange={(v) => setSensor({ pd_at_ref: v })} />
        <p className="an-field-note ab-small" style={{ opacity: 0.7 }}>
          위 두 값이 레이더 정의: <b>"{s.ref_rcs_m2} m²를 {(s.ref_detection_range_m / 1000).toFixed(1)} km에서 Pd {s.pd_at_ref}로 탐지"</b>.
          내부 곡선 중심(Pd 50%)은 {pdHalfPointRange(s).toFixed(0)} m로 역산됩니다.
        </p>
        <NumField label="재방문 주기" unit="s" value={s.revisit_time_s} step={0.1} paramKey="sensor.revisit_time_s" onExplain={onExplain} onChange={(v) => setSensor({ revisit_time_s: v })} />
        <NumField label="레이더 트랙 유효 신뢰도" value={s.radar_track_confidence} step={0.01} paramKey="sensor.radar_track_confidence" onExplain={onExplain} onChange={(v) => setSensor({ radar_track_confidence: v })} />
        <details className="an-advanced">
          <summary className="ab-small">고급 · Pd 곡선 형태 (보통 만지지 않음)</summary>
          <NumField label="최대 Pd" value={s.pd_max} step={0.01} paramKey="sensor.pd_max" onExplain={onExplain} onChange={(v) => setSensor({ pd_max: v })} />
          <NumField label="전이 폭" unit="m" value={s.pd_transition_width_m} paramKey="sensor.pd_transition_width_m" onExplain={onExplain} onChange={(v) => setSensor({ pd_transition_width_m: v })} />
        </details>
      </fieldset>

      <fieldset className="an-group">
        <legend>EO/IR 광학 · 종말 D/R/I</legend>
        <NumField label="화각 HFOV" unit="°" value={o.hfov_deg} step={0.1} paramKey="optics.hfov_deg" onExplain={onExplain} onChange={(v) => setOptics({ hfov_deg: v })} />
        <NumField label="가로 해상도" unit="px" value={o.h_resolution_px} step={10} paramKey="optics.h_resolution_px" onExplain={onExplain} onChange={(v) => setOptics({ h_resolution_px: v })} />
        <NumField label="센서 폭" unit="mm" value={o.sensor_width_mm} step={0.1} paramKey="optics.sensor_width_mm" onExplain={onExplain} onChange={(v) => setOptics({ sensor_width_mm: v })} />
        <NumField label="EO 과업 완료 상대거리" unit="m" value={o.terminal_recognition_range_m} step={50} paramKey="optics.terminal_recognition_range_m" onExplain={onExplain} onChange={(v) => setOptics({ terminal_recognition_range_m: v })} />
        <NumField label="EO 처리 시간" unit="s" value={s.classify_time_s} step={0.5} paramKey="sensor.classify_time_s" onExplain={onExplain} onChange={(v) => setSensor({ classify_time_s: v })} />
        <NumField label="EO 과업 신뢰도 상한" value={s.classify_prob} step={0.01} paramKey="sensor.classify_prob" onExplain={onExplain} onChange={(v) => setSensor({ classify_prob: v })} />
        <label className="an-field" title={'[정의] 레이더 추적만은 EO를 사용하지 않습니다. EO 탐지는 물체 존재, EO 인식은 표적 클래스(드론/조류·위협 유형), EO 식별은 특정 기종/모델 확인입니다.\n\n[동작] EO D/R/I는 모두 발사 후 시간선·획득·Johnson N50·대기투과 게이트를 적용합니다.\n\n[근거] Johnson D/R/I 50% 기준 · SAND2015-6368\n\n[값 출처] 운용 규칙/종말 확인 정책 입력값'}>
          <span className="an-field-label">종말 확인 정책</span>
          <select
            value={o.required_discrimination}
            onChange={(ev) => setOptics({ required_discrimination: ev.target.value as DiscriminationLevel })}
          >
            <option value="radar_only">EO 미적용 (레이더 추적만)</option>
            <option value="detection">EO 탐지 (물체 존재)</option>
            <option value="recognition">EO 인식 (표적 클래스)</option>
            <option value="identification">EO 식별 (특정 기종/모델)</option>
          </select>
        </label>
        <NumField label="EO 탐지 N50" unit="px" value={o.n50_detection} step={0.1} paramKey="optics.n50_detection" onExplain={onExplain} onChange={(v) => setOptics({ n50_detection: v })} />
        <NumField label="EO 인식 N50" unit="px" value={o.n50_recognition} step={0.1} paramKey="optics.n50_recognition" onExplain={onExplain} onChange={(v) => setOptics({ n50_recognition: v })} />
        <NumField label="EO 식별 N50" unit="px" value={o.n50_identification} step={0.1} paramKey="optics.n50_identification" onExplain={onExplain} onChange={(v) => setOptics({ n50_identification: v })} />
        <NumField label="레이더 큐 오차" unit="°" value={o.cue_error_deg} step={0.1} paramKey="optics.cue_error_deg" onExplain={onExplain} onChange={(v) => setOptics({ cue_error_deg: v })} />
        <NumField label="요격기 지향 오차" unit="°" value={o.pointing_error_deg} step={0.1} paramKey="optics.pointing_error_deg" onExplain={onExplain} onChange={(v) => setOptics({ pointing_error_deg: v })} />
        <NumField label="대기 시정" unit="km" value={o.visibility_km} step={0.5} paramKey="optics.visibility_km" onExplain={onExplain} onChange={(v) => setOptics({ visibility_km: v })} />
        <p className="an-field-note ab-small">
          ≈ 초점거리 {focalLengthMm(o).toFixed(0)} mm (센서폭 {o.sensor_width_mm} mm 기준)
        </p>
        <p className="an-field-note ab-small" style={{ opacity: 0.7 }}>
          상대거리는 발사 후 요격기 EO↔표적 LOS. 해상도·표적크기↑, N50↓는 유리합니다. 화각은 픽셀과 획득확률이 반대로 변해 최적점이 있습니다.
        </p>
      </fieldset>

      <fieldset className="an-group">
        <legend>이팩터 · EFFECTOR</legend>
        <label className="an-field" title={'[의미·동작] 선택한 페이로드의 단발 Pk만 누적 P_kill 계산에 사용합니다. 비선택 Pk는 보존되지만 결과에는 미사용입니다.\n\n[이론 근거] 독립 사격 누적 P_kill = 1−(1−p)^n\n\n[값 출처] 체계 구성 시나리오 입력값'}>
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
        <NumField label="발사 개시 거리 (교리)" unit="m" value={e.commit_range_m} paramKey="effector.commit_range_m" onExplain={onExplain} onChange={(v) => setEffector({ commit_range_m: v })} />
        <p className="an-field-note ab-small" style={{ opacity: 0.7 }}>
          이 거리에서 발사합니다. 일찍 탐지해도 결정론적 발사 시점은 앞당기지 않지만, 적시 누적 탐지확률은 포화 전까지 높아질 수 있습니다.
        </p>
        <NumField label="요격기 도달 반경" unit="m" value={e.max_engagement_range_m} paramKey="effector.max_engagement_range_m" onExplain={onExplain} onChange={(v) => setEffector({ max_engagement_range_m: v })} />
        <NumField label="발사대 거리" unit="m" value={e.launch_pad_range_from_asset_m} paramKey="effector.launch_pad_range_from_asset_m" onExplain={onExplain} onChange={(v) => setEffector({ launch_pad_range_from_asset_m: v })} />
        <NumField label="단발 Pk · net" value={e.single_shot_pk_net} step={0.01} paramKey="effector.single_shot_pk_net" onExplain={onExplain} onChange={(v) => setEffector({ single_shot_pk_net: v })} active={e.payload === 'net_gun'} dim={e.payload !== 'net_gun'} />
        <NumField label="단발 Pk · shotgun" value={e.single_shot_pk_shotgun} step={0.01} paramKey="effector.single_shot_pk_shotgun" onExplain={onExplain} onChange={(v) => setEffector({ single_shot_pk_shotgun: v })} active={e.payload === 'shotgun'} dim={e.payload !== 'shotgun'} />
        <p className="an-field-note ab-small" style={{ opacity: 0.7 }}>
          넷건·샷건 Pk는 독립 입력값입니다. 위 <b>페이로드</b>가 선택한 쪽(활성)만 P_kill에 사용됩니다.
        </p>
        <NumField label="사격 기회 수" value={e.shot_opportunities} step={1} paramKey="effector.shot_opportunities" onExplain={onExplain} onChange={(v) => setEffector({ shot_opportunities: v })} />
        <NumField label="체공 시간" unit="s" value={e.endurance_s} step={30} paramKey="effector.endurance_s" onExplain={onExplain} onChange={(v) => setEffector({ endurance_s: v })} />
        <NumField label="여유 σ" unit="m" value={e.reach_margin_sigma_m} step={10} paramKey="effector.reach_margin_sigma_m" onExplain={onExplain} onChange={(v) => setEffector({ reach_margin_sigma_m: v })} />
      </fieldset>

      <fieldset className="an-group">
        <legend>C2 · 결심</legend>
        <NumField label="결심 지연" unit="s" value={c.decision_latency_s} step={0.5} paramKey="c2.decision_latency_s" onExplain={onExplain} onChange={(v) => setC2({ decision_latency_s: v })} />
        <NumField label="결심 신뢰도" value={c.decision_reliability} step={0.01} paramKey="c2.decision_reliability" onExplain={onExplain} onChange={(v) => setC2({ decision_reliability: v })} />
        <label className="an-field" title={'[의미·동작] 비위협 유입률×현재 판별수준의 오통과율로 오교전 위험을 별도 계산합니다. 실제 위협 P_negate에는 영향이 없습니다.\n\n[모델 가정] 오통과율은 EO/N50에서 유도되지 않는 독립 조건부 확률입니다.\n\n[값 출처] 분석 옵션 입력값'}>
          <span className="an-field-label">오교전 위험 모델</span>
          <select
            value={c.false_engagement_enabled ? 'on' : 'off'}
            onChange={(ev) => setC2({ false_engagement_enabled: ev.target.value === 'on' })}
          >
            <option value="off">끔 (기본)</option>
            <option value="on">켬</option>
          </select>
        </label>
        {c.false_engagement_enabled ? (
          <>
            <NumField label="비위협 유입률" value={c.non_threat_rate} step={0.05} paramKey="c2.non_threat_rate" onExplain={onExplain} onChange={(v) => setC2({ non_threat_rate: v })} />
            <NumField label="비위협 오통과·탐지" value={c.false_pass_detection} step={0.05} paramKey="c2.false_pass_detection" onExplain={onExplain} onChange={(v) => setC2({ false_pass_detection: v })} />
            <NumField label="비위협 오통과·인식" value={c.false_pass_recognition} step={0.05} paramKey="c2.false_pass_recognition" onExplain={onExplain} onChange={(v) => setC2({ false_pass_recognition: v })} />
            <NumField label="비위협 오통과·식별" value={c.false_pass_identification} step={0.01} paramKey="c2.false_pass_identification" onExplain={onExplain} onChange={(v) => setC2({ false_pass_identification: v })} />
          </>
        ) : null}
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
