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
  /** Study range: what the trade/spec tabs sweep over. NOT a validity bound. */
  sweep?: { min: number; max: number }
  /**
   * HARD validity bound — values outside this are physically meaningless
   * (a probability of 1.4, a negative range) and the model's internal clamps
   * would silently absorb them into nonsense. Enforced by validateScenario()
   * and by the input fields. Distinct from `sweep`, which is only a study
   * window: sweep ⊆ range always.
   */
  range: { min: number; max: number }
  /** Value must be a whole number (e.g. shot count). */
  integer?: boolean
}

/** Probability-valued parameter: the single most-violated bound. */
const PROB = { min: 0, max: 1 }

// One-level section setter.
const S =
  <K extends keyof Scenario>(section: K, field: keyof Scenario[K]) =>
  (s: Scenario, v: number): Scenario => ({
    ...s,
    [section]: { ...s[section], [field]: v },
  })

// Value provenance marker: this number is NOT measured/verified. The MODEL
// basis (theory·assumption) lives in paramExplain.ts; this field is only the
// value's source. For a notional (not-yet-built) system these are ASSUMPTIONS,
// not measurements — labelled as such, editable, and replaced with real data
// only if/when it exists. Never a guess dressed up as measured.
const PLACEHOLDER = '가정·입력값(미확정, 편집 가능) · 실측 시 교체'

export const PARAM_INFO: ParamInfo[] = [
  // ── 위협 ────────────────────────────────────────────────
  {
    key: 'threat.rcs_m2', section: '위협', label: 'RCS', unit: 'm²',
    description: '레이더 반사 단면적. 내부 Pd 곡선의 50% 중심거리(R_half)를 RCS^¼로 이동시킴. 작을수록 위협에는 유리하고 방어 레이더에는 불리.',
    source: `참고: 소형 FPV≈0.01㎡(−20dBsm, 공개문헌) · ${PLACEHOLDER}`,
    get: (s) => s.threat.rcs_m2, set: S('threat', 'rcs_m2'), sweep: { min: 0.001, max: 1 },
    range: { min: 1e-6, max: 100 },
  },
  {
    key: 'threat.speed_m_s', section: '위협', label: '속도', unit: 'm/s',
    description: '위협 접근 속도. 소요시간 예산과 교전 기하(closing)에 직접 사용.',
    source: `참고: FPV≈118km/h(목업) · ${PLACEHOLDER}`,
    get: (s) => s.threat.speed_m_s, set: S('threat', 'speed_m_s'), sweep: { min: 10, max: 120 },
    range: { min: 0.1, max: 340 },
  },
  {
    key: 'threat.altitude_m_agl', section: '위협', label: '고도 AGL', unit: 'm',
    description: '진입 고도 AGL. 지상 레이더 LOS 경사거리 √(수평²+고도²)에 반영. 발사 후 EO는 별도 카메라↔표적 상대거리 입력을 사용.',
    source: `참고: 목업 기준 · ${PLACEHOLDER}`,
    get: (s) => s.threat.altitude_m_agl, set: S('threat', 'altitude_m_agl'),
    range: { min: 0, max: 20000 },
  },
  {
    key: 'threat.ingress_range_m', section: '위협', label: '진입 거리', unit: 'm',
    description: 'run 시작 시 자산으로부터의 거리. P_detect는 여기서 적시 탐지 마감선(필요 탐지거리)까지의 독립 스캔을 누적.',
    source: `시나리오 설정값 · ${PLACEHOLDER}`,
    get: (s) => s.threat.ingress_range_m, set: S('threat', 'ingress_range_m'), sweep: { min: 1000, max: 8000 },
    range: { min: 100, max: 50000 },
  },
  {
    key: 'threat.approach_bearing_deg', section: '위협', label: '진입 방위', unit: '°',
    description: '자산→진입원점 방위(0=N). 현재 축대칭 MOE에서는 지도·커버리지 방향만 바꾸며 P_negate 값에는 영향 없음.',
    source: `시나리오 설정값`,
    get: (s) => s.threat.approach_bearing_deg, set: S('threat', 'approach_bearing_deg'),
    range: { min: 0, max: 360 },
  },
  {
    key: 'threat.characteristic_size_m', section: '위협', label: '표적 크기', unit: 'm',
    description: '인식 가능한 임계 치수(로터/윙 스팬 등). EO/IR 표적 픽셀 수 계산의 분자.',
    source: `향후 결정(미정 · 대상 기종 미정) · 참고: 소형 FPV≈0.35m`,
    get: (s) => s.threat.characteristic_size_m, set: S('threat', 'characteristic_size_m'), sweep: { min: 0.05, max: 3 },
    range: { min: 0.01, max: 50 },
  },

  // ── 레이더 ──────────────────────────────────────────────
  {
    key: 'sensor.ref_rcs_m2', section: '레이더', label: '기준 RCS', unit: 'm²',
    description: '레이더 정의값 ①. "이 RCS를 아래 기준 탐지거리에서 탐지"라는 한 쌍의 기준. 임의 RCS에서는 Pd 50% 중심거리만 RCS^¼로 이동하고 전이 폭은 고정.',
    source: `레이더 정의(가정): RCS·거리 한 쌍으로 규정 — 가상 체계, 실측 불필요`,
    get: (s) => s.sensor.ref_rcs_m2, set: S('sensor', 'ref_rcs_m2'),
    range: { min: 1e-6, max: 100 },
  },
  {
    key: 'sensor.ref_detection_range_m', section: '레이더', label: '기준 탐지거리', unit: 'm',
    description: '레이더 정의값 ②. 기준 RCS 표적을 이 거리에서 아래 "기준거리 단일스캔 Pd"로 탐지. 내부 로지스틱 중심(Pd 50% 거리)은 이 값이 아니라 두 값에서 역산됨.',
    source: `레이더 정의(가정): "RCS X를 Y km에서 Pd Z로 탐지" — 데이터시트가 주는 형태 그대로`,
    get: (s) => s.sensor.ref_detection_range_m, set: S('sensor', 'ref_detection_range_m'), sweep: { min: 500, max: 8000 },
    range: { min: 10, max: 100000 },
  },
  {
    key: 'sensor.pd_at_ref', section: '레이더', label: '기준거리 단일스캔 Pd',
    description: '레이더 정의값 ③. 위 기준 탐지거리에서 한 번 스캔했을 때의 탐지확률. 같은 거리·다른 조건이 같다면 높을수록 좋은 레이더이며 P_max보다 작아야 함.',
    source: `참고: 레이더 사양 관례 Pd 0.8~0.9 @ Pfa 1e-6(Skolnik/Barton 계열) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.pd_at_ref, set: S('sensor', 'pd_at_ref'), sweep: { min: 0.1, max: 0.97 },
    range: PROB,
  },
  {
    key: 'sensor.pd_max', section: '레이더(고급)', label: '최대 Pd',
    description: '[곡선 형태] 근거리 단일스캔 Pd의 로지스틱 천장. 기준거리·Pd를 유지하도록 중심이 함께 재보정되므로 이 값만 높인다고 항상 성능이 좋아지지는 않음.',
    source: `가정: 곡선 상한(공개문헌 근사) · 편집 가능`,
    get: (s) => s.sensor.pd_max, set: S('sensor', 'pd_max'),
    range: PROB,
  },
  {
    key: 'sensor.pd_transition_width_m', section: '레이더(고급)', label: 'Pd 전이 폭', unit: 'm',
    description: '[곡선 형태] Pd가 거리에 따라 떨어지는 로지스틱 폭. 기준 탐지거리·Pd에서 곡선 중심을 역산할 때도 쓰임 — 보통 만지지 않음.',
    source: `가정: 경계 완만도 모델값 · 편집 가능`,
    get: (s) => s.sensor.pd_transition_width_m, set: S('sensor', 'pd_transition_width_m'),
    range: { min: 1, max: 10000 },
  },
  {
    key: 'sensor.revisit_time_s', section: '레이더', label: '재방문 주기', unit: 's',
    description: '스캔 재방문 간격. 진입거리→필요 탐지거리 구간을 이 간격으로 샘플해 적시 누적 Pd=1−Π(1−pd) 계산.',
    source: `가정: 스캔율 모델값 · 편집 가능`,
    get: (s) => s.sensor.revisit_time_s, set: S('sensor', 'revisit_time_s'),
    range: { min: 0.01, max: 600 },
  },
  {
    key: 'sensor.radar_track_confidence', section: '레이더', label: '레이더 트랙 유효 신뢰도',
    description: '적시 탐지에 성공했다는 조건에서 해당 트랙이 교전 선언·사격 지원에 충분히 안정적일 확률. P_detect와 다른 조건부 품질 게이트이며 EO 미적용 정책에서만 P_terminal로 사용.',
    source: `추적/사격통제 시험값(입력) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.radar_track_confidence, set: S('sensor', 'radar_track_confidence'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'sensor.classify_time_s', section: 'EO/IR', label: 'EO 처리 시간', unit: 's',
    description: '발사 후 탑재 EO가 획득을 시작해 인식/식별을 완료하는 시간. EO 게이트가 활성일 때만 시간 성립성을 판정하며, 성립 구간 안에서는 광학확률을 연속 감점하지 않음.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.sensor.classify_time_s, set: S('sensor', 'classify_time_s'), sweep: { min: 0, max: 30 },
    range: { min: 0, max: 600 },
  },
  {
    key: 'sensor.classify_prob', section: 'EO/IR', label: 'EO 과업 신뢰도 상한',
    description: 'EO D/R/I 사용 시 P_terminal EO = 획득×Johnson 과업확률×대기투과×이 조건부 상한. 픽셀·획득·대기 이외의 알고리즘/운용자 잔여 손실이며 EO 미적용에서는 사용하지 않음.',
    source: `분류기/운용자 정확도(입력) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.classify_prob, set: S('sensor', 'classify_prob'), sweep: { min: 0, max: 1 },
    range: PROB,
  },

  // ── EO/IR 광학 ──────────────────────────────────────────
  {
    key: 'optics.h_resolution_px', section: 'EO/IR', label: '가로 해상도', unit: 'px',
    description: '이미지 가로 픽셀 수. 표적 픽셀 수 N = 크기·H/(거리·HFOV_rad)의 분자. ↑성능.',
    source: `카메라 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.optics.h_resolution_px, set: S('optics', 'h_resolution_px'), sweep: { min: 640, max: 7680 },
    range: { min: 64, max: 32768 }, integer: true,
  },
  {
    key: 'optics.hfov_deg', section: 'EO/IR', label: '화각 HFOV', unit: '°',
    description: '수평 화각. 좁히면 표적 픽셀은 늘지만 고정 카메라 획득확률은 낮아짐. 두 효과의 곱이므로 무조건 좁을수록 좋은 것이 아니라 최적점이 존재.',
    source: `카메라/렌즈 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.optics.hfov_deg, set: S('optics', 'hfov_deg'), sweep: { min: 0.3, max: 40 },
    range: { min: 0.01, max: 180 },
  },
  {
    key: 'optics.sensor_width_mm', section: 'EO/IR', label: '센서 폭', unit: 'mm',
    description: '이미지 센서 물리 폭. 초점거리↔화각 환산 표시용(인식 계산에는 직접 미사용).',
    source: `센서 스펙(입력)`,
    get: (s) => s.optics.sensor_width_mm, set: S('optics', 'sensor_width_mm'),
    range: { min: 0.1, max: 200 },
  },
  {
    key: 'optics.terminal_recognition_range_m', section: 'EO/IR', label: 'EO 과업 완료 상대거리', unit: 'm',
    description: '발사 후 요격기 카메라↔표적의 상대 LOS 거리가 이 값일 때 선택한 EO 탐지/인식/식별 과업을 완료. 자산↔표적 거리가 아님.',
    source: `종말 EO 운용 요구값(입력) · ${PLACEHOLDER}`,
    get: (s) => s.optics.terminal_recognition_range_m,
    set: S('optics', 'terminal_recognition_range_m'),
    sweep: { min: 100, max: 2500 },
    range: { min: 1, max: 50000 },
  },
  {
    key: 'optics.n50_detection', section: 'EO/IR', label: 'EO 탐지 N50', unit: 'px',
    description: 'EO 화면에서 관심 물체의 존재를 50% 확률로 발견하는 픽셀 문턱. Johnson 1.0cycle을 디지털 영상의 약 2px로 환산.',
    source: `Johnson D/R/I 기준: SAND2015-6368 · 기본 2px(1.0cycle×2) · 실제 체계 시험 시 교체`,
    get: (s) => s.optics.n50_detection, set: S('optics', 'n50_detection'), sweep: { min: 0.5, max: 10 },
    range: { min: 0.1, max: 200 },
  },
  {
    key: 'optics.n50_recognition', section: 'EO/IR', label: 'EO 인식 N50', unit: 'px',
    description: '발견한 물체를 드론/조류 또는 위협 유형 같은 표적 클래스로 50% 확률로 구분하는 픽셀 문턱. Johnson 4.0cycle≈8px.',
    source: `Johnson D/R/I 기준: SAND2015-6368 · 기본 8px(4.0cycle×2) · 드론 과업 시험 시 교체`,
    get: (s) => s.optics.n50_recognition, set: S('optics', 'n50_recognition'), sweep: { min: 2, max: 20 },
    range: { min: 0.1, max: 200 },
  },
  {
    key: 'optics.n50_identification', section: 'EO/IR', label: 'EO 식별 N50', unit: 'px',
    description: '인식한 표적의 특정 기종·모델/개체군을 50% 확률로 구분하는 픽셀 문턱. Johnson 6.4cycle≈12.8px.',
    source: `Johnson D/R/I 기준: SAND2015-6368 · 기본 12.8px(6.4cycle×2) · 기종별 시험 시 교체`,
    get: (s) => s.optics.n50_identification, set: S('optics', 'n50_identification'), sweep: { min: 4, max: 30 },
    range: { min: 0.1, max: 200 },
  },
  {
    key: 'optics.cue_error_deg', section: 'EO/IR', label: '레이더 큐 오차', unit: '°',
    description: '레이더가 카메라에 넘기는 각도 오차. 모델에서는 수평·수직 각축의 동일한 1σ를 갖는 등방성 2D 가우시안으로 근사해 획득확률에 반영.',
    source: `추천 기본값 0.3°(sub-degree 설계목표) · 실측/스펙 입력 필요(SME)`,
    get: (s) => s.optics.cue_error_deg, set: S('optics', 'cue_error_deg'), sweep: { min: 0, max: 10 },
    range: { min: 0, max: 180 },
  },
  {
    key: 'optics.pointing_error_deg', section: 'EO/IR', label: '요격기 지향 오차', unit: '°',
    description: '전방 고정 카메라를 비행으로 조준할 때의 LOS 오차. 등방성 2D 각오차의 축별 1σ로 근사하며 큐 오차와 분산을 합쳐 P_acq를 계산.',
    source: `추천 기본값 0.4°(sub-degree 설계목표) · 짐벌 미도입 확정 → 큐+유도로만 확보 · 실측/스펙 입력 필요`,
    get: (s) => s.optics.pointing_error_deg, set: S('optics', 'pointing_error_deg'), sweep: { min: 0, max: 10 },
    range: { min: 0, max: 180 },
  },
  {
    key: 'optics.visibility_km', section: 'EO/IR', label: '대기 시정', unit: 'km',
    description: 'Koschmieder 시정으로 대기 투과를 근사. 낮을수록 원거리 판별확률이 감소. 현재는 가시광 식을 EO/IR에 공통 적용하는 단순화로 실제 IR 대역 감쇠와 다를 수 있음.',
    source: `기상/환경 입력 · ${PLACEHOLDER}`,
    get: (s) => s.optics.visibility_km, set: S('optics', 'visibility_km'), sweep: { min: 0.5, max: 40 },
    range: { min: 0.01, max: 200 },
  },

  // ── 이팩터 ──────────────────────────────────────────────
  {
    key: 'effector.launch_delay_s', section: '이팩터', label: '발사 지연', unit: 's',
    description: '승인→공중(스핀업+발사)까지 지연. 반응 예산에 포함.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.launch_delay_s, set: S('effector', 'launch_delay_s'), sweep: { min: 0, max: 30 },
    range: { min: 0, max: 3600 },
  },
  {
    key: 'effector.cruise_speed_m_s', section: '이팩터', label: '요격 속도', unit: 'm/s',
    description: '요격기 외향 순항 속도. 위협과의 closing 속도(v_i+v_t)에 사용.',
    source: `참고: AB-U10≈50m/s(목업) · ${PLACEHOLDER}`,
    get: (s) => s.effector.cruise_speed_m_s, set: S('effector', 'cruise_speed_m_s'), sweep: { min: 15, max: 150 },
    range: { min: 0.1, max: 340 },
  },
  {
    key: 'effector.commit_range_m', section: '이팩터', label: '발사 개시 거리', unit: 'm',
    description: '교리상 이 거리에서 발사. 일찍 탐지해도 결정론적 발사 시점은 앞당기지 않지만, 적시 누적 P_detect는 포화 전까지 높아질 수 있음. 탐지가 늦으면 가능한 즉시 발사.',
    source: `운용 교리(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.commit_range_m, set: S('effector', 'commit_range_m'), sweep: { min: 500, max: 6000 },
    range: { min: 1, max: 50000 },
  },
  {
    key: 'effector.max_engagement_range_m', section: '이팩터', label: '요격기 도달 반경', unit: 'm',
    description: '현재 1차원 모델에서 자산 중심 요격지점 반경 R_int의 상한. 발사대 실제 비행거리 상한이 아닌 구현상 반경 제한이며, 넷건 종말 사거리와도 별개.',
    source: `이팩터 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.max_engagement_range_m, set: S('effector', 'max_engagement_range_m'), sweep: { min: 500, max: 6000 },
    range: { min: 1, max: 50000 },
  },
  {
    key: 'effector.launch_pad_range_from_asset_m', section: '이팩터', label: '발사대 거리', unit: 'm',
    description: '보호 자산으로부터 발사대까지의 반경. 현재 1차원 모델은 발사대가 위협 진입 방향과 같은 방사선의 자산 바깥쪽에 있다고 가정.',
    source: `배치 설정값`,
    get: (s) => s.effector.launch_pad_range_from_asset_m, set: S('effector', 'launch_pad_range_from_asset_m'),
    range: { min: 0, max: 50000 },
  },
  {
    key: 'effector.single_shot_pk_net', section: '이팩터', label: '단발 Pk · net',
    description: '넷건 단발 살상확률(0..1). 누적 Pk=1−(1−p)^n의 p.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.single_shot_pk_net, set: S('effector', 'single_shot_pk_net'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'effector.single_shot_pk_shotgun', section: '이팩터', label: '단발 Pk · shotgun',
    description: '샷건 단발 살상확률(0..1). payload=shotgun일 때 사용.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.single_shot_pk_shotgun, set: S('effector', 'single_shot_pk_shotgun'),
    range: PROB,
  },
  {
    key: 'effector.shot_opportunities', section: '이팩터', label: '사격 기회 수',
    description: '교전창 내 사격/패스 횟수 n. 누적 Pk=1−(1−p)^n.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.effector.shot_opportunities, set: S('effector', 'shot_opportunities'), sweep: { min: 1, max: 8 },
    range: { min: 1, max: 100 }, integer: true,
  },
  {
    key: 'effector.endurance_s', section: '이팩터', label: '체공 시간', unit: 's',
    description: '유효 반경 상한을 min(도달 반경, 순항속도×체공시간)으로 제한. 현재 구현은 이 값을 자산 중심 R_int 상한으로 사용하며 실제 발사대 출발 비행거리와는 다를 수 있음.',
    source: `이팩터 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.endurance_s, set: S('effector', 'endurance_s'), sweep: { min: 60, max: 3600 },
    range: { min: 1, max: 86400 },
  },
  {
    key: 'effector.reach_margin_sigma_m', section: '이팩터', label: '여유 σ', unit: 'm',
    description: 'Keep-out 여유의 1σ 불확실성. P_reach를 0/1 대신 Φ(여유/σ)로 연속화(0=하드 게이트).',
    source: `모델 파라미터(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.reach_margin_sigma_m, set: S('effector', 'reach_margin_sigma_m'), sweep: { min: 0, max: 800 },
    range: { min: 0, max: 10000 },
  },

  // ── C2 ──────────────────────────────────────────────────
  {
    key: 'c2.decision_latency_s', section: 'C2', label: '결심 지연', unit: 's',
    description: 'CONFIRM→APPROVE 운용자 결심 소요. 반응 예산에 포함(교전 성립에 큰 영향).',
    source: `${PLACEHOLDER}`,
    get: (s) => s.c2.decision_latency_s, set: S('c2', 'decision_latency_s'), sweep: { min: 0, max: 60 },
    range: { min: 0, max: 3600 },
  },
  {
    key: 'c2.decision_reliability', section: 'C2', label: '결심 신뢰도',
    description: '창 안에서 운용자가 올바르게 교전 승인할 확률(0..1). P_decision 게이트.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.c2.decision_reliability, set: S('c2', 'decision_reliability'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'c2.non_threat_rate', section: 'C2', label: '비위협 유입률', unit: '',
    description: '[오교전 옵션] 제시 트랙 중 실제 비위협(새·아군·클러터) 비율. 오교전 확률 = 이 값 × ROE별 오통과율.',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.non_threat_rate, set: S('c2', 'non_threat_rate'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'c2.false_pass_detection', section: 'C2', label: '비위협 오통과 · 탐지', unit: '',
    description: '[오교전 옵션] 레이더 추적만 또는 EO 탐지 수준에서 비위협이 오통과할 조건부 확률. 광학/N50에서 계산되지 않는 독립 입력값.',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.false_pass_detection, set: S('c2', 'false_pass_detection'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'c2.false_pass_recognition', section: 'C2', label: '비위협 오통과 · 인식', unit: '',
    description: '[오교전 옵션] 교전 기준=인식일 때 비위협 오통과 조건부 확률. 광학/N50에서 계산되지 않는 독립 입력값.',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.false_pass_recognition, set: S('c2', 'false_pass_recognition'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'c2.false_pass_identification', section: 'C2', label: '비위협 오통과 · 식별', unit: '',
    description: '[오교전 옵션] 교전 기준=식별일 때 비위협 오통과 조건부 확률. 광학/N50에서 계산되지 않는 독립 입력값.',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.false_pass_identification, set: S('c2', 'false_pass_identification'), sweep: { min: 0, max: 1 },
    range: PROB,
  },

  // ── 사이트 ──────────────────────────────────────────────
  {
    key: 'site.keep_out_radius_m', section: '사이트', label: 'Keep-out 반경', unit: 'm',
    description: '이 반경 밖에서 무력화해야 하는 방어 경계. R_int≤경계면 feasible은 하드 실패지만, P_reach는 입력 σ에 따라 경계 부근을 연속 확률로 표시할 수 있음.',
    source: `교전 규칙/배치(입력) · ${PLACEHOLDER}`,
    get: (s) => s.site.keep_out_radius_m, set: S('site', 'keep_out_radius_m'), sweep: { min: 100, max: 3000 },
    range: { min: 0, max: 50000 },
  },
  {
    key: 'site.asset.lat', section: '사이트', label: '자산 위도', unit: '°',
    description: '보호 자산 위도(지도 표시·커버리지 footprint 기준점).',
    source: `배치 설정값(여의도 기본)`,
    get: (s) => s.site.asset.lat,
    set: (s, v) => ({ ...s, site: { ...s.site, asset: { ...s.site.asset, lat: v } } }),
    range: { min: -90, max: 90 },
  },
  {
    key: 'site.asset.lon', section: '사이트', label: '자산 경도', unit: '°',
    description: '보호 자산 경도(지도 표시·커버리지 footprint 기준점).',
    source: `배치 설정값(여의도 기본)`,
    get: (s) => s.site.asset.lon,
    set: (s, v) => ({ ...s, site: { ...s.site, asset: { ...s.site.asset, lon: v } } }),
    range: { min: -180, max: 180 },
  },
]

const BY_KEY = new Map(PARAM_INFO.map((p) => [p.key, p]))
export function paramInfo(key: string): ParamInfo | undefined {
  return BY_KEY.get(key)
}
