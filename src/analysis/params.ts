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
    description: '레이더 반사 단면적. 레이더 탐지거리를 R∝RCS^¼로 스케일하는 입력.',
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
    description: '진입 고도 AGL. 지상 센서 LOS 경사거리 √(수평²+고도²)로 탐지·EO 인식·대기투과에 반영(교전 기하는 수평).',
    source: `참고: 목업 기준 · ${PLACEHOLDER}`,
    get: (s) => s.threat.altitude_m_agl, set: S('threat', 'altitude_m_agl'),
    range: { min: 0, max: 20000 },
  },
  {
    key: 'threat.ingress_range_m', section: '위협', label: '진입 거리', unit: 'm',
    description: 'run 시작 시 자산으로부터의 거리. 누적 탐지확률 스윕의 시작점.',
    source: `시나리오 설정값 · ${PLACEHOLDER}`,
    get: (s) => s.threat.ingress_range_m, set: S('threat', 'ingress_range_m'), sweep: { min: 1000, max: 8000 },
    range: { min: 100, max: 50000 },
  },
  {
    key: 'threat.approach_bearing_deg', section: '위협', label: '진입 방위', unit: '°',
    description: '자산→진입원점 방위(0=N). 단일 시나리오/커버리지 스윕 기준.',
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
    description: '레이더 정의값 ①. "이 RCS를 아래 기준 탐지거리에서 탐지"라는 한 쌍이 레이더를 규정. 임의 RCS는 R∝RCS^¼로 환산.',
    source: `레이더 정의(가정): RCS·거리 한 쌍으로 규정 — 가상 체계, 실측 불필요`,
    get: (s) => s.sensor.ref_rcs_m2, set: S('sensor', 'ref_rcs_m2'),
    range: { min: 1e-6, max: 100 },
  },
  {
    key: 'sensor.ref_detection_range_m', section: '레이더', label: '기준 탐지거리', unit: 'm',
    description: '레이더 정의값 ②. 기준 RCS 표적을 이 거리에서 아래 "탐지거리 Pd"로 탐지. 내부 로지스틱 중심(Pd 50% 거리)은 이 값이 아니라 두 값에서 역산됨.',
    source: `레이더 정의(가정): "RCS X를 Y km에서 Pd Z로 탐지" — 데이터시트가 주는 형태 그대로`,
    get: (s) => s.sensor.ref_detection_range_m, set: S('sensor', 'ref_detection_range_m'), sweep: { min: 500, max: 8000 },
    range: { min: 10, max: 100000 },
  },
  {
    key: 'sensor.pd_at_ref', section: '레이더', label: '탐지거리 Pd',
    description: '레이더 정의값 ③. 위 기준 탐지거리에서의 단일 스캔 탐지확률(0..1). 사양서가 탐지거리를 인용할 때 함께 쓰는 값(통상 0.8~0.9).',
    source: `참고: 레이더 사양 관례 Pd 0.8~0.9 @ Pfa 1e-6(Skolnik/Barton 계열) · ${PLACEHOLDER}`,
    get: (s) => s.sensor.pd_at_ref, set: S('sensor', 'pd_at_ref'), sweep: { min: 0.1, max: 0.97 },
    range: PROB,
  },
  {
    key: 'sensor.pd_max', section: '레이더(고급)', label: '최대 Pd',
    description: '[곡선 형태] 거리 충분히 가까울 때의 단일 스캔 탐지확률 상한(0..1) = 로지스틱 천장. 사양값이 아니라 곡선 가정 — 보통 만지지 않음.',
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
    description: '스캔 재방문 간격. 접근 트랙을 이 간격으로 샘플해 누적 Pd=1−Π(1−pd) 계산. 스캔율 가정값.',
    source: `가정: 스캔율 모델값 · 편집 가능`,
    get: (s) => s.sensor.revisit_time_s, set: S('sensor', 'revisit_time_s'),
    range: { min: 0.01, max: 600 },
  },
  {
    key: 'sensor.classify_time_s', section: '레이더', label: '분류 시간', unit: 's',
    description: '최초 탐지 후 적대 분류/확인까지 최소 소요 시간. 필요 탐지거리(=발사 개시 거리+속도×반응예산)를 밀어올림. 분류 완료 거리는 발사 시점에서 역산되므로, 탐지가 충분하면 이 값이 분류 거리를 직접 정하지는 않음.',
    source: `${PLACEHOLDER}`,
    get: (s) => s.sensor.classify_time_s, set: S('sensor', 'classify_time_s'), sweep: { min: 0, max: 30 },
    range: { min: 0, max: 600 },
  },
  {
    key: 'sensor.classify_prob', section: '레이더', label: '분류기 상한',
    description: '픽셀이 충분할 때의 분류 정확도 상한. P_classify = EO/IR 인식확률 × 이 값.',
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
    description: '수평 화각. 좁을수록 표적 픽셀 수↑(인식거리↑)·탐색범위↓. ↓값=성능↑.',
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
    key: 'optics.n50_recognition', section: 'EO/IR', label: '인식 N50', unit: 'px',
    description: 'Johnson 인식급 문턱(≈4.0 cycle). "드론/위협인가" 판별. 요구 판별수준=인식일 때 사용.',
    source: `참고: Johnson 인식 ≈4.0cyc · ${PLACEHOLDER}`,
    get: (s) => s.optics.n50_recognition, set: S('optics', 'n50_recognition'), sweep: { min: 2, max: 20 },
    range: { min: 0.1, max: 200 },
  },
  {
    key: 'optics.n50_identification', section: 'EO/IR', label: '식별 N50', unit: 'px',
    description: 'Johnson 식별급 문턱(≈6.4 cycle). "기종까지" 판별. 요구 판별수준=식별일 때 사용.',
    source: `참고: Johnson 식별 ≈6.4cyc · ${PLACEHOLDER}`,
    get: (s) => s.optics.n50_identification, set: S('optics', 'n50_identification'), sweep: { min: 4, max: 30 },
    range: { min: 0.1, max: 200 },
  },
  {
    key: 'optics.cue_error_deg', section: 'EO/IR', label: '레이더 큐 오차', unit: '°',
    description: '레이더가 카메라에 넘기는 방위 큐의 각도 오차(1σ). 짐벌 없는 고정 카메라라, 표적이 FOV 안에 드는 획득확률 P_acq의 한 성분.',
    source: `추천 기본값 0.3°(sub-degree 설계목표) · 실측/스펙 입력 필요(SME)`,
    get: (s) => s.optics.cue_error_deg, set: S('optics', 'cue_error_deg'), sweep: { min: 0, max: 10 },
    range: { min: 0, max: 180 },
  },
  {
    key: 'optics.pointing_error_deg', section: 'EO/IR', label: '요격기 지향 오차', unit: '°',
    description: '전방 고정 카메라를 비행으로 조준할 때의 LOS 지향 오차(1σ). 큐 오차와 제곱합 √(cue²+point²)으로 P_acq = 1−exp(−(HFOV/2)²/(2σ²))를 결정.',
    source: `추천 기본값 0.4°(sub-degree 설계목표) · 짐벌 미도입 확정 → 큐+유도로만 확보 · 실측/스펙 입력 필요`,
    get: (s) => s.optics.pointing_error_deg, set: S('optics', 'pointing_error_deg'), sweep: { min: 0, max: 10 },
    range: { min: 0, max: 180 },
  },
  {
    key: 'optics.visibility_km', section: 'EO/IR', label: '대기 시정', unit: 'km',
    description: '대기 투과(대비 손실)를 정하는 시정. 낮을수록 원거리 인식·분류확률이 지수적으로 감소.',
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
    description: '교리상 이 거리에서 발사한다(대응 거리). 실제 발사 = min(이 값, 탐지시점−속도×반응예산) — 일찍 탐지해도 더 일찍 쏘지 않고, 탐지가 늦을 때만 구속됨. 필요 탐지거리 = 이 값 + 속도×반응예산.',
    source: `운용 교리(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.commit_range_m, set: S('effector', 'commit_range_m'), sweep: { min: 500, max: 6000 },
    range: { min: 1, max: 50000 },
  },
  {
    key: 'effector.max_engagement_range_m', section: '이팩터', label: '요격기 도달 반경', unit: 'm',
    description: '발사대에서 요격 드론(AB-U10)이 날아가 도달 가능한 최대 거리(작전 반경). 요격 성립 상한. ※ 넷건 사거리(~25m)와 무관 — 그건 도달 후 종말 발사 거리(별개).',
    source: `이팩터 스펙(입력) · ${PLACEHOLDER}`,
    get: (s) => s.effector.max_engagement_range_m, set: S('effector', 'max_engagement_range_m'), sweep: { min: 500, max: 6000 },
    range: { min: 1, max: 50000 },
  },
  {
    key: 'effector.launch_pad_range_from_asset_m', section: '이팩터', label: '발사대 거리', unit: 'm',
    description: '보호 자산으로부터 발사대까지 거리(0=동일 위치). 요격 기하의 시작점.',
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
    description: '요격기 체공 한계. 유효 반경을 순항속도×체공시간으로 제한(요격기 도달 반경과 함께 min).',
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
    key: 'c2.decision_recognition_coupling', section: 'C2', label: '결심-인식 커플링',
    description: '인식이 애매할수록 결심 신뢰도를 깎는 정도(0=독립, 1=완전 연동). P_decision=신뢰도×(1−커플링·(1−인식)).',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.decision_recognition_coupling, set: S('c2', 'decision_recognition_coupling'), sweep: { min: 0, max: 1 },
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
    description: '[오교전 옵션] 교전 기준=탐지(레이더 단독)일 때 비위협이 오통과할 확률(느슨 → 높음).',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.false_pass_detection, set: S('c2', 'false_pass_detection'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'c2.false_pass_recognition', section: 'C2', label: '비위협 오통과 · 인식', unit: '',
    description: '[오교전 옵션] 교전 기준=인식일 때 비위협 오통과 확률(EO 인식이 대부분 기각).',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.false_pass_recognition, set: S('c2', 'false_pass_recognition'), sweep: { min: 0, max: 1 },
    range: PROB,
  },
  {
    key: 'c2.false_pass_identification', section: 'C2', label: '비위협 오통과 · 식별', unit: '',
    description: '[오교전 옵션] 교전 기준=식별일 때 비위협 오통과 확률(식별은 거의 다 기각).',
    source: `가정(모델 파라미터) · 편집 가능`,
    get: (s) => s.c2.false_pass_identification, set: S('c2', 'false_pass_identification'), sweep: { min: 0, max: 1 },
    range: PROB,
  },

  // ── 사이트 ──────────────────────────────────────────────
  {
    key: 'site.keep_out_radius_m', section: '사이트', label: 'Keep-out 반경', unit: 'm',
    description: '이 반경 밖에서 반드시 무력화해야 하는 방어 경계. 요격 성립·여유 판정 기준.',
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
