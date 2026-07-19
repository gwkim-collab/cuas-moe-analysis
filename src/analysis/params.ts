// ────────────────────────────────────────────────────────────
// Analysis core · parameter documentation registry (SSOT).
//
// One entry per editable scalar in a Scenario, carrying:
//   • get/set        — how to read/write it on a Scenario
//   • label/unit      — display
//   • section         — grouping (위협 / 레이더 / EO-IR / 이팩터 / C2 / 사이트)
//   • description     — what it means, and how it enters the model
//   • source          — provenance of the value / formula basis
//   • sweep {min,max} — present ⇒ tunable in trade-study / spec-inversion
//
// This registry is the single source for: the in-app "파라미터 설명"
// table, the parameter tooltips, the CSV export/import, and the
// trade-study/spec parameter list (tradeStudy.PARAMS derives from it).
//
// ⚠ 값 대부분은 공개 문헌·목업 기반의 편집 가능한 플레이스홀더이며 확정
//   성능치가 아닙니다. `source`에 표기된 근거를 SME가 검증해야 합니다.
// ────────────────────────────────────────────────────────────

import type { Scenario } from './model'

export interface ParamInfo {
  key: string
  section: string
  label: string
  unit?: string
  description: string
  source: string
  get: (s: Scenario) => number
  set: (s: Scenario, v: number) => Scenario
  sweep?: { min: number; max: number }
}

// One-level section setter.
const S =
  <K extends keyof Scenario>(section: K, field: keyof Scenario[K]) =>
  (s: Scenario, v: number): Scenario => ({
    ...s,
    [section]: { ...s[section], [field]: v },
  })

// Value provenance marker: this number is NOT measured/verified. The MODEL
// basis (theory·assumption) lives in paramExplain.ts; this field is only the
// value's source. Unmeasured values say "입력 필요" — never a guess dressed up.
const PLACEHOLDER = '값 입력 필요 · 측정/스펙 미검증(SME)'

export const PARAM_INFO: ParamInfo[] = [
  // ── 위협 ────────────────────────────────────────────────
  {
    key: 'threat.rcs_m2', section: '위협', label: 'RCS', unit: 'm²',
    description: '레이더 반사 단면적. 레이더 탐지거리를 R∝RCS^¼로 스케일하는 입력.',
    source: `참고: 소형 FPV≈0.01㎡(−20dBsm, 공개문헌) · ${PLACEHOLDER}`,
    get: (s) => s.threat.rcs_m2, set: S('threat', 'rcs_m2'), sweep: { min: 0.001, max: 1 },
  },
  {
    key: 'threat.speed_m_s', section: '위협', label: '속도', unit: 'm/s',
    description: '위협 접근 속도. 소요시간 예산과 교전 기하(closing)에 직접 사용.',
    source: `참고: FPV≈118km/h(목업) · ${PLACEHOLDER}`,
    get: (s) => s.threat.speed_m_s, set: S('threat', 'speed_m_s'), sweep: { min: 10, max: 120 },
  },
  {
    key: 'threat.altitude_m_agl', section: '위협', label: '고도 AGL', unit: 'm',
    description: '진입 고도 AGL. 지상 센서 LOS 경사거리 √(수평²+고도²)로 탐지·EO 인식·대기투과에 반영(교전 기하는 수평).',
    source: `참고: 목업 기준 · ${PLACEHOLDER}`,
    get: (s) => s.threat.altitude_m_agl, set: S('threat', 'altitude_m_agl'),
  },
  {
    key: 'threat.ingress_range_m', section: '위협', label: '진입 거리', unit: 'm',
    description: 'run 시작 시 자산으로부터의 거리. 누적 탐지확률 스윕의 시작점.',
    source: `시나리오 설정값 · ${PLACEHOLDER}`,
    get: (s) => s.threat.ingress_range_m, set: S('threat', 'ingress_range_m'), sweep: { min: 1000, max: 8000 },
  },
  {
    key: 'threat.approach_bearing_deg', section: '위협', label: '진입 방위', unit: '°',
    description: '자산→진입원점 방위(0=N). 단일 시나리오/커버리지 스윕 기준.',
    source: `시나리오 설정값`,
    get: (s) => s.threat.approach_bearing_deg, set: S('threat', 'approach_bearing_deg'),
  },
  {
    key: 'threat.characteristic_size_m', section: '위협', label: '표적 크기', unit: 'm',
    description: '인식 가능한 임계 치수(로터/윙 스팬 등). EO/IR 표적 픽셀 수 계산의 분자.',
    source: `참고: 소형 FPV≈0.35m · ${PLACEHOLDER}`,
    get: (s) => s.threat.characteristic_size_m, set: S('threat', 'characteristic_size_m'), sweep: { min: 0.05, max: 3 },
  },

  // ── 레이더 ──────────────────────────────────────────────
  {
    key: 'sensor.ref_rcs_m2', section: '레이더', label: '기준 RCS', unit: 'm²',
    description: '기준 탐지거리가 정의되는 기준 표적 RCS. R∝(RCS/기준RCS)^¼ 스케일 기준점.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.sensor.ref_rcs_m2, set: S('sensor', 'ref_rcs_m2'),
  },
  {
    key: 'sensor.ref_detection_range_m', section: '레이더', label: '기준 탐지거리', unit: 'm',
    description: '기준 RCS 표적의 탐지거리. 여기서 임의 RCS의 탐지거리를 4제곱근으로 환산.',
    source: `센서 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.ref_detection_range_m, set: S('sensor', 'ref_detection_range_m'), sweep: { min: 500, max: 8000 },
  },
  {
    key: 'sensor.pd_max', section: '레이더', label: '최대 Pd',
    description: '거리 충분히 가까울 때의 단일 스캔 탐지확률 상한(0..1).',
    source: `${PLACEHOLDER}`,
    get: (s) => s.sensor.pd_max, set: S('sensor', 'pd_max'),
  },
  {
    key: 'sensor.pd_transition_width_m', section: '레이더', label: 'Pd 전이 폭', unit: 'm',
    description: '탐지거리 경계에서 Pd가 떨어지는 로지스틱 폭(클수록 완만한 경계).',
    source: `${PLACEHOLDER}`,
    get: (s) => s.sensor.pd_transition_width_m, set: S('sensor', 'pd_transition_width_m'),
  },
  {
    key: 'sensor.revisit_time_s', section: '레이더', label: '재방문 주기', unit: 's',
    description: '스캔 재방문 간격. 접근 트랙을 이 간격으로 샘플해 누적 Pd=1−Π(1−pd) 계산.',
    source: `센서 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.revisit_time_s, set: S('sensor', 'revisit_time_s'),
  },
  {
    key: 'sensor.classify_time_s', section: '레이더', label: '분류 시간', unit: 's',
    description: '최초 탐지 후 적대 분류/확인까지 소요 시간. 분류 완료 거리를 결정(접근분).',
    source: `${PLACEHOLDER}`,
    get: (s) => s.sensor.classify_time_s, set: S('sensor', 'classify_time_s'), sweep: { min: 0, max: 30 },
  },
  {
    key: 'sensor.classify_prob', section: '레이더', label: '분류기 상한',
    description: '픽셀이 충분할 때의 분류 정확도 상한. P_classify = EO/IR 인식확률 × 이 값.',
    source: `분류기/운용자 정확도(입력) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.classify_prob, set: S('sensor', 'classify_prob'), sweep: { min: 0, max: 1 },
  },

  // ── EO/IR 광학 ──────────────────────────────────────────
  {
    key: 'optics.h_resolution_px', section: 'EO/IR', label: '가로 해상도', unit: 'px',
    description: '이미지 가로 픽셀 수. 표적 픽셀 수 N = 크기·H/(거리·HFOV_rad)의 분자. ↑성능.',
    source: `카메라 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.optics.h_resolution_px, set: S('optics', 'h_resolution_px'), sweep: { min: 640, max: 7680 },
  },
  {
    key: 'optics.hfov_deg', section: 'EO/IR', label: '화각 HFOV', unit: '°',
    description: '수평 화각. 좁을수록 표적 픽셀 수↑(인식거리↑)·탐색범위↓. ↓값=성능↑.',
    source: `카메라/렌즈 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.optics.hfov_deg, set: S('optics', 'hfov_deg'), sweep: { min: 0.3, max: 40 },
  },
  {
    key: 'optics.sensor_width_mm', section: 'EO/IR', label: '센서 폭', unit: 'mm',
    description: '이미지 센서 물리 폭. 초점거리↔화각 환산 표시용(인식 계산에는 직접 미사용).',
    source: `센서 스펙(입력)`,
    get: (s) => s.optics.sensor_width_mm, set: S('optics', 'sensor_width_mm'),
  },
  {
    key: 'optics.n50_recognition', section: 'EO/IR', label: '인식 요구픽셀 N50', unit: 'px',
    description: '50% 인식에 필요한 표적 픽셀 수(난이도 문턱). Johnson 확률 P=f(N/N50). ↑값=난이도↑=성능↓.',
    source: `참고: NVESD 표적획득 N50 통상범위 · ${PLACEHOLDER}`,
    get: (s) => s.optics.n50_recognition, set: S('optics', 'n50_recognition'), sweep: { min: 2, max: 20 },
  },
  {
    key: 'optics.cue_error_deg', section: 'EO/IR', label: '레이더 큐 오차', unit: '°',
    description: '레이더가 카메라에 넘기는 방위 큐의 각도 오차(1σ). 짐벌 없는 고정 카메라라, 표적이 FOV 안에 드는 획득확률 P_acq의 한 성분.',
    source: `추천 기본값 0.3°(sub-degree 설계목표) · 실측/스펙 입력 필요(SME)`,
    get: (s) => s.optics.cue_error_deg, set: S('optics', 'cue_error_deg'), sweep: { min: 0, max: 10 },
  },
  {
    key: 'optics.pointing_error_deg', section: 'EO/IR', label: '요격기 지향 오차', unit: '°',
    description: '전방 고정 카메라를 비행으로 조준할 때의 LOS 지향 오차(1σ). 큐 오차와 제곱합 √(cue²+point²)으로 P_acq = 1−exp(−(HFOV/2)²/(2σ²))를 결정.',
    source: `추천 기본값 0.4°(sub-degree 설계목표) · 실측/스펙 입력 필요(SME)`,
    get: (s) => s.optics.pointing_error_deg, set: S('optics', 'pointing_error_deg'), sweep: { min: 0, max: 10 },
  },
  {
    key: 'optics.visibility_km', section: 'EO/IR', label: '대기 시정', unit: 'km',
    description: '대기 투과(대비 손실)를 정하는 시정. 낮을수록 원거리 인식·분류확률이 지수적으로 감소.',
    source: `기상/환경 입력 · ${PLACEHOLDER}`,
    get: (s) => s.optics.visibility_km, set: S('optics', 'visibility_km'), sweep: { min: 0.5, max: 40 },
  },

  // ── 이팩터 ──────────────────────────────────────────────
  {
    key: 'effector.launch_delay_s', section: '이팩터', label: '발사 지연', unit: 's',
    description: '승인→공중(스핀업+발사)까지 지연. 반응 예산에 포함.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.launch_delay_s, set: S('effector', 'launch_delay_s'), sweep: { min: 0, max: 30 },
  },
  {
    key: 'effector.cruise_speed_m_s', section: '이팩터', label: '요격 속도', unit: 'm/s',
    description: '요격기 외향 순항 속도. 위협과의 closing 속도(v_i+v_t)에 사용.',
    source: `참고: AB-U10≈50m/s(목업) · ${PLACEHOLDER}`,
    get: (s) => s.effector.cruise_speed_m_s, set: S('effector', 'cruise_speed_m_s'), sweep: { min: 15, max: 150 },
  },
  {
    key: 'effector.max_engagement_range_m', section: '이팩터', label: '최대 교전거리', unit: 'm',
    description: '발사대에서 요격기가 유효하게 도달 가능한 최대 거리. 교전 성립 상한.',
    source: `이팩터 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.max_engagement_range_m, set: S('effector', 'max_engagement_range_m'), sweep: { min: 500, max: 6000 },
  },
  {
    key: 'effector.launch_pad_range_from_asset_m', section: '이팩터', label: '발사대 거리', unit: 'm',
    description: '보호 자산으로부터 발사대까지 거리(0=동일 위치). 요격 기하의 시작점.',
    source: `배치 설정값`,
    get: (s) => s.effector.launch_pad_range_from_asset_m, set: S('effector', 'launch_pad_range_from_asset_m'),
  },
  {
    key: 'effector.single_shot_pk_net', section: '이팩터', label: '단발 Pk · net',
    description: '넷건 단발 살상확률(0..1). 누적 Pk=1−(1−p)^n의 p.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.single_shot_pk_net, set: S('effector', 'single_shot_pk_net'), sweep: { min: 0, max: 1 },
  },
  {
    key: 'effector.single_shot_pk_shotgun', section: '이팩터', label: '단발 Pk · shotgun',
    description: '샷건 단발 살상확률(0..1). payload=shotgun일 때 사용.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.single_shot_pk_shotgun, set: S('effector', 'single_shot_pk_shotgun'),
  },
  {
    key: 'effector.shot_opportunities', section: '이팩터', label: '사격 기회 수',
    description: '교전창 내 사격/패스 횟수 n. 누적 Pk=1−(1−p)^n.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.shot_opportunities, set: S('effector', 'shot_opportunities'), sweep: { min: 1, max: 8 },
  },
  {
    key: 'effector.endurance_s', section: '이팩터', label: '체공 시간', unit: 's',
    description: '요격기 체공 한계. 유효 반경을 순항속도×체공시간으로 제한(최대교전거리와 함께 min).',
    source: `이팩터 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.endurance_s, set: S('effector', 'endurance_s'), sweep: { min: 60, max: 3600 },
  },
  {
    key: 'effector.reach_margin_sigma_m', section: '이팩터', label: '여유 σ', unit: 'm',
    description: 'Keep-out 여유의 1σ 불확실성. P_reach를 0/1 대신 Φ(여유/σ)로 연속화(0=하드 게이트).',
    source: `모델 파라미터(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.reach_margin_sigma_m, set: S('effector', 'reach_margin_sigma_m'), sweep: { min: 0, max: 800 },
  },

  // ── C2 ──────────────────────────────────────────────────
  {
    key: 'c2.decision_latency_s', section: 'C2', label: '결심 지연', unit: 's',
    description: 'CONFIRM→APPROVE 운용자 결심 소요. 반응 예산에 포함(교전 성립에 큰 영향).',
    source: `${PLACEHOLDER}`,
    get: (s) => s.c2.decision_latency_s, set: S('c2', 'decision_latency_s'), sweep: { min: 0, max: 60 },
  },
  {
    key: 'c2.decision_reliability', section: 'C2', label: '결심 신뢰도',
    description: '창 안에서 운용자가 올바르게 교전 승인할 확률(0..1). P_decision 게이트.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.c2.decision_reliability, set: S('c2', 'decision_reliability'), sweep: { min: 0, max: 1 },
  },

  // ── 사이트 ──────────────────────────────────────────────
  {
    key: 'site.keep_out_radius_m', section: '사이트', label: 'Keep-out 반경', unit: 'm',
    description: '이 반경 밖에서 반드시 무력화해야 하는 방어 경계. 요격 성립·여유 판정 기준.',
    source: `교전 규칙/배치(입력) · ${PLACEHOLDER}`,
    get: (s) => s.site.keep_out_radius_m, set: S('site', 'keep_out_radius_m'), sweep: { min: 100, max: 3000 },
  },
  {
    key: 'site.asset.lat', section: '사이트', label: '자산 위도', unit: '°',
    description: '보호 자산 위도(지도 표시·커버리지 footprint 기준점).',
    source: `배치 설정값(여의도 기본)`,
    get: (s) => s.site.asset.lat,
    set: (s, v) => ({ ...s, site: { ...s.site, asset: { ...s.site.asset, lat: v } } }),
  },
  {
    key: 'site.asset.lon', section: '사이트', label: '자산 경도', unit: '°',
    description: '보호 자산 경도(지도 표시·커버리지 footprint 기준점).',
    source: `배치 설정값(여의도 기본)`,
    get: (s) => s.site.asset.lon,
    set: (s, v) => ({ ...s, site: { ...s.site, asset: { ...s.site.asset, lon: v } } }),
  },
]

const BY_KEY = new Map(PARAM_INFO.map((p) => [p.key, p]))
export function paramInfo(key: string): ParamInfo | undefined {
  return BY_KEY.get(key)
}
