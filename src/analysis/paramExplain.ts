// ────────────────────────────────────────────────────────────
// Analysis core · per-parameter teaching + BASIS registry.
//
// Kept separate from params.ts (the value/get/set registry) so the
// SSOT stays lean and CSV export is unaffected. Pure data — no React.
//
// Every entry states its basis explicitly, split three ways so a
// firmly-established model is never confused with a guessed number:
//   • theory     — the established model/law it derives from, with a
//                  real reference (radar equation, Johnson/NVESD, …).
//   • assumption — the simplifying modelling assumptions made here.
//   • formula    — the equation (unicode; rendered in a mono block).
//   • detail     — plain-language explanation.
//   • diagram    — which live diagram illustrates it, if any.
// The VALUE provenance lives in params.ts `source` (kept honest:
// measured/spec values are marked "입력 필요", never invented here).
// ────────────────────────────────────────────────────────────

export type DiagramId =
  | 'rcs-scaling'
  | 'pd-logistic'
  | 'cumulative-pd'
  | 'johnson-n50'
  | 'pk-cumulative'
  | 'closing-geometry'
  | 'fov-acquisition'

export interface ParamExplain {
  /** Established model/law + real reference. */
  theory?: string
  /** Simplifying modelling assumptions applied here. */
  assumption?: string
  /** Formula line(s), unicode math. */
  formula?: string
  /** Plain-language explanation beyond the one-line `description`. */
  detail?: string
  /** Which live diagram illustrates this parameter, if any. */
  diagram?: DiagramId
}

// Common references, cited once.
const REF_RADAR = 'Skolnik, Introduction to Radar Systems — 레이더 거리 방정식'
const REF_JOHNSON = 'Johnson(1958) 기준 · NVESD 표적획득 모델(TTP/N50)'
const REF_CEP = '원형 가우시안 지향오차 → 반경오차 Rayleigh 분포(CEP 계열)'
const REF_KINE = '1차 등속·직선 반경(radial) 운동학'
const REF_SERIES = '독립 시행 결합 확률(직렬 게이트/이항)'

export const PARAM_EXPLAIN: Record<string, ParamExplain> = {
  // ── 위협 ────────────────────────────────────────────────
  'threat.rcs_m2': {
    theory: `${REF_RADAR}: 고정 탐지 문턱에서 최대탐지거리 ∝ RCS^¼.`,
    formula: 'R_det ∝ (RCS / RCS₀)^¼ · R₀',
    detail:
      '탐지거리는 RCS의 4제곱근에 비례합니다. RCS가 10배 커져도 탐지거리는 ⁴√10 ≈ 1.78배만 늘어납니다 — 작은 RCS가 왜 유리한지, RCS를 키워도 이득이 왜 완만한지를 보여줍니다.',
    diagram: 'rcs-scaling',
  },
  'threat.speed_m_s': {
    theory: `${REF_KINE}: 반응 중 접근 = v_t·t, 접근속도 = v_i + v_t.`,
    formula: 'closing = v_i + v_t\n반응 중 접근거리 = v_t · t_react',
    detail:
      '위협이 빠를수록 (1) 반응하는 동안 더 많이 접근하고 (2) 요격기와의 접근속도가 커져 더 빨리 만납니다. 교전 성립 여유에 직접 영향.',
    diagram: 'closing-geometry',
  },
  'threat.altitude_m_agl': {
    theory: '지상 센서 LOS = 경사거리 √(수평² + 고도²).',
    assumption: '탐지·EO 인식·대기투과에 경사거리 반영. 교전 기하(closing)는 수평 반경 유지(가정).',
    formula: 'r_slant = √(수평² + 고도²)\n탐지·인식은 r_slant로 평가',
    detail:
      '같은 지상거리라도 고도가 높으면 LOS 경사거리가 길어져 탐지·인식이 어려워집니다(고고도 표적 불리). 현재는 센싱에만 반영하고, 요격 closing 기하는 수평으로 둡니다.',
  },
  'threat.ingress_range_m': {
    theory: `${REF_SERIES}: 누적 탐지 P_det = 1 − Π(1 − p_i).`,
    assumption: '스캔 간 독립. 트랙은 이 거리에서 keep-out까지 등간격 샘플.',
    formula: '누적 스윕 시작점 R₀ (Δr = v_t·t_revisit 간격)',
    detail: 'run이 시작되는 자산으로부터의 거리. 누적 탐지확률은 이 지점부터 안쪽으로 스캔을 쌓아 계산합니다.',
    diagram: 'cumulative-pd',
  },
  'threat.approach_bearing_deg': {
    theory: '방위 정의(항법): 0°=N, 시계방향.',
    formula: '0°=N · 90°=E · 180°=S · 270°=W',
    detail: '자산에서 본 진입 원점의 방위. 단일 시나리오 기하 기준이자, 커버리지 탭 360° 스윕의 한 방향.',
  },
  'threat.characteristic_size_m': {
    theory: '기하광학: 표적 각크기 → 픽셀 수. (인식은 Johnson/NVESD)',
    formula: 'N_px = size · H_px / (range · HFOV_rad)',
    detail: 'EO/IR이 인식에 쓰는 표적 임계 치수(로터/윙 스팬 등). 표적 픽셀 수의 분자라 클수록 인식이 쉬워집니다.',
    diagram: 'johnson-n50',
  },

  // ── 레이더 ──────────────────────────────────────────────
  'sensor.ref_rcs_m2': {
    theory: `${REF_RADAR}: R_det(RCS) = R₀·(RCS/RCS₀)^¼.`,
    formula: 'R_det(RCS) = R₀ · (RCS / RCS₀)^¼',
    detail: '탐지거리가 정의되는 기준점의 RCS. 임의 RCS의 탐지거리를 이 기준에서 4제곱근으로 환산합니다.',
    diagram: 'rcs-scaling',
  },
  'sensor.ref_detection_range_m': {
    theory: `${REF_RADAR}: 기준 RCS₀에서의 탐지거리(곡선 위치).`,
    formula: 'R₀ = 기준 RCS₀ 표적의 탐지거리',
    detail: '이 거리에서 단일 스캔 탐지확률이 최대치의 절반(P_max/2)이 되고, 안쪽은 P_max로 포화, 바깥은 0으로 떨어집니다.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_max': {
    theory: '탐지확률은 SNR의 함수(Marcum Q). 근거리 SNR 충분 시 상한.',
    assumption: '거리 롤오프를 로지스틱으로 근사(실제 ROC 아님).',
    formula: 'P_d(r ≪ R_det) → P_max',
    detail: '표적이 충분히 가까울 때의 단일 스캔 탐지확률 상한. 로지스틱 곡선의 천장 높이입니다.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_transition_width_m': {
    theory: '탐지확률의 거리 경계 롤오프.',
    assumption: '로지스틱(시그모이드) 근사 — 실제로는 SNR–거리 ROC로 산출해야 함.',
    formula: 'P_d(r) = P_max / (1 + e^((r − R_det)/w))\nw = 전이 폭',
    detail:
      '탐지거리 경계에서 확률이 떨어지는 "부드러움"의 폭입니다. w가 작으면 R_det에서 낭떠러지처럼 뚝 끊기고, w가 크면 완만하게 감소합니다. r = R_det±w에서 P_d는 최대치의 약 27%/73%. 회색 띠가 ±w 구간입니다.',
    diagram: 'pd-logistic',
  },
  'sensor.revisit_time_s': {
    theory: `${REF_SERIES}: 접근 트랙의 독립 스캔 누적.`,
    assumption: '스캔 간 탐지 독립.',
    formula: 'P_det = 1 − Π(1 − p_d,i)\n샘플 간격 Δr = v_t · t_revisit',
    detail: '재방문이 빠를수록(작은 값) 같은 구간에서 더 많은 독립 스캔이 쌓여 누적 탐지확률이 빨리 1에 수렴합니다.',
    diagram: 'cumulative-pd',
  },
  'sensor.classify_time_s': {
    theory: `${REF_KINE}: 반응 예산에 합산 → 발사 시점 위협 거리 결정.`,
    formula: 't_react = t_classify + t_decision + t_launch',
    detail: '최초 탐지 후 적대 분류/확인 시간. 이 시간만큼 위협이 더 접근한 뒤 발사가 시작됩니다.',
    diagram: 'closing-geometry',
  },
  'sensor.classify_prob': {
    theory: `${REF_SERIES}: P_classify는 획득·인식·분류기 상한의 곱.`,
    formula: 'P_classify = P_acq × 인식(EO/IR) × 분류기 상한',
    detail: '픽셀이 충분해 인식확률이 1에 가까워져도, 분류기/운용자 정확도의 한계로 P_classify가 이 값을 넘지 못합니다(상한).',
  },

  // ── EO/IR ───────────────────────────────────────────────
  'optics.hfov_deg': {
    theory: `기하광학(픽셀 각크기) + ${REF_CEP}(획득). 두 효과가 반대.`,
    assumption: 'HFOV 반각을 원형 FOV 반각으로 근사(사각 프레임엔 보수적).',
    formula:
      'N_px = size / (range · HFOV_rad / H_px)      (인식↑ as HFOV↓)\nP_acq = 1 − exp(−(HFOV/2)² / (2σ²))          (획득↓ as HFOV↓)\nP_classify ∝ P_acq · 인식 → 최적 화각 존재',
    detail:
      '화각이 좁으면 표적 픽셀 수가 늘어 인식은 쉬워지지만(위로), 짐벌이 없는 고정 카메라라 표적이 좁은 시야 밖으로 벗어나기 쉬워 획득확률 P_acq가 떨어집니다(아래). 둘의 곱이 P_classify라 최적 화각이 생깁니다. 노란선(P_acq)·파란선(인식)·굵은선(곱)과 현재/최적 화각을 비교하세요.',
    diagram: 'fov-acquisition',
  },
  'optics.h_resolution_px': {
    theory: '기하광학: IFOV = HFOV_rad / H_px.',
    formula: 'IFOV = HFOV_rad / H_px\nN_px = size / (range · IFOV)',
    detail: '가로 픽셀 수가 많을수록 IFOV가 작아져 표적 픽셀 수가 늘고 인식거리가 길어집니다.',
    diagram: 'johnson-n50',
  },
  'optics.sensor_width_mm': {
    theory: '박막 렌즈 화각 관계.',
    formula: 'HFOV = 2 · atan(sensor_w / (2 · f))',
    detail: '센서 물리 폭. 초점거리 f ↔ 화각 환산 표시용이며 인식 픽셀 계산에는 직접 쓰이지 않습니다.',
  },
  'optics.n50_detection': {
    theory: `${REF_JOHNSON}: 탐지급 ≈1.0 cycle. 판별수준별 N50 상이(탐지<인식<식별).`,
    assumption: '⚠ 교전 기준="탐지"는 레이더 단독(EO 게이트 미적용)이라 이 값은 P_negate에 반영 안 됨(표시용). EO 기반(인식·식별)에서만 EO 게이트 적용.',
    formula: 'P = nᴱ / (1 + nᴱ),  n = N_px / N50_탐지',
    detail: 'EO 탐지급 문턱. 다만 현재 "탐지" 교전 기준은 레이더 탐지만으로 승인이라 EO가 안 쓰여 이 값은 결과에 영향 없음(참고용).',
    diagram: 'johnson-n50',
  },
  'optics.n50_recognition': {
    theory: `${REF_JOHNSON}: 인식급 ≈4.0 cycle. 판별수준별 N50 상이(탐지<인식<식별).`,
    assumption: 'N50 단위 px(≈2×cycle). 요구 판별수준="인식"일 때 사용(기본).',
    formula: 'P = nᴱ / (1 + nᴱ),  n = N_px / N50_인식,  E = 2.7 + 0.7·n',
    detail: '"드론/위협인가" 수준. N50이 클수록 같은 거리에서 인식확률이 낮아집니다. 요구 판별수준 기본값.',
    diagram: 'johnson-n50',
  },
  'optics.n50_identification': {
    theory: `${REF_JOHNSON}: 식별급 ≈6.4 cycle. 판별수준별 N50 상이(탐지<인식<식별).`,
    assumption: 'N50 단위 px(≈2×cycle). 요구 판별수준="식별"일 때만 P_classify에 사용.',
    formula: 'P = nᴱ / (1 + nᴱ),  n = N_px / N50_식별',
    detail: '"기종까지" 수준(가장 어려움). 교전 승인에 식별을 요구하면 훨씬 가까워야 통과 → P_classify·교전거리 크게 하락.',
    diagram: 'johnson-n50',
  },
  'optics.cue_error_deg': {
    theory: `${REF_CEP}. 짐벌 없는 고정 FOV → 획득이 별도 관문.`,
    assumption: '큐·지향 오차 독립 → 분산 가산 σ = √(cue²+point²).',
    formula: 'σ = √(cue² + point²)\nP_acq = 1 − exp(−(HFOV/2)² / (2σ²))',
    detail:
      '레이더가 카메라에 넘기는 방위 큐의 각도 오차(1σ). 짐벌이 없어 표적을 고정 FOV에 넣는 정확도의 한 성분입니다. 큐 오차가 크면 같은 화각에서 P_acq가 낮아져 P_classify가 떨어집니다.',
    diagram: 'fov-acquisition',
  },
  'optics.pointing_error_deg': {
    theory: `${REF_CEP}. 요격기 LOS 지향(유도) 오차.`,
    assumption: '큐·지향 오차 독립 → 분산 가산.',
    formula: 'σ = √(cue² + point²)\nP_acq = 1 − exp(−(HFOV/2)² / (2σ²))',
    detail:
      '전방 고정 카메라를 비행(유도)으로 조준할 때의 LOS 지향 오차(1σ). 짐벌이 없으므로 이 오차가 커질수록 좁은 화각에서 표적을 프레임에 유지하기 어려워 P_acq가 급감합니다.',
    diagram: 'fov-acquisition',
  },
  'optics.visibility_km': {
    theory: 'Koschmieder(β=3.912/V, 2% 대비) + Beer-Lambert 투과 T=exp(−βR).',
    assumption: '균질 대기·수평 경로 근사. 대비 손실만 반영(해상도 저하 별도).',
    formula: 'β = 3.912 / V(km)\nT(R) = exp(−β · R)\nP_classify ∝ … × T',
    detail:
      '시정이 낮을수록 대기 투과가 지수적으로 떨어져 원거리 인식·분류확률이 급감합니다. 안개(≪1km)에선 사실상 원거리 교전이 불가. P_classify에 곱해집니다.',
  },

  // ── 이팩터 ──────────────────────────────────────────────
  'effector.launch_delay_s': {
    theory: `${REF_KINE}: 반응 예산 구성요소.`,
    formula: 't_react = t_classify + t_decision + t_launch',
    detail: '승인 후 요격기가 공중에 뜨기까지(스핀업+발사)의 지연. 반응 예산에 포함됩니다.',
    diagram: 'closing-geometry',
  },
  'effector.cruise_speed_m_s': {
    theory: `${REF_KINE}: 접근속도 v_i+v_t, 회합 시각으로 요격거리 산출.`,
    formula: 't_meet = gap / (v_i + v_t)\nR_int = R_pad + v_i · t_meet',
    detail: '요격기가 빠를수록 접근속도가 커져 더 먼(자산 바깥) 거리에서 위협을 만납니다 → 요격 거리 여유↑.',
    diagram: 'closing-geometry',
  },
  'effector.max_engagement_range_m': {
    theory: `${REF_KINE}: 요격 드론 도달 반경 = 요격 성립 상한.`,
    assumption: '요격기(드론) 작전 반경. 넷건 사거리(~25m, 종말 발사 거리)와 별개 — 종말 근접·발사는 P_kill에 암묵 포함.',
    formula: '요격 성립 ⟺ keep-out < R_int ≤ 도달 반경',
    detail: '발사대에서 요격 드론(AB-U10)이 날아가 표적을 만날 수 있는 최대 거리(작전 반경). 요격 지점이 이보다 멀면 도달 불가. ⚠ 넷건 사거리(~25m)와 혼동 금지 — 그건 도달 후 표적에 바짝 붙어 넷을 쏘는 종말 거리이며 현재 P_kill에 뭉뚱그려져 있음.',
    diagram: 'closing-geometry',
  },
  'effector.launch_pad_range_from_asset_m': {
    theory: `${REF_KINE}: 요격 기하의 출발점.`,
    formula: 'R_int = R_pad + v_i · t_meet',
    detail: '보호 자산에서 발사대까지 거리(0=동일 위치).',
    diagram: 'closing-geometry',
  },
  'effector.single_shot_pk_net': {
    theory: `${REF_SERIES}: 독립 시행 이항 누적.`,
    assumption: '사격 간 독립.',
    formula: 'P_k = 1 − (1 − p)ⁿ',
    detail: '넷건 단발 살상확률 p. 사격 n번을 독립으로 보면 누적 살상확률은 1−(1−p)ⁿ.',
    diagram: 'pk-cumulative',
  },
  'effector.single_shot_pk_shotgun': {
    theory: `${REF_SERIES}: 독립 시행 이항 누적.`,
    assumption: '사격 간 독립.',
    formula: 'P_k = 1 − (1 − p)ⁿ',
    detail: '샷건 단발 살상확률 p (payload=shotgun일 때). 누적식은 넷건과 동일.',
    diagram: 'pk-cumulative',
  },
  'effector.shot_opportunities': {
    theory: `${REF_SERIES}: 독립 시행 횟수 n.`,
    assumption: '사격 간 독립 · 한계효용 체감.',
    formula: 'P_k = 1 − (1 − p)ⁿ',
    detail: '교전창 안 사격/패스 횟수 n. n↑이면 누적 살상확률↑이나 한계효용은 체감.',
    diagram: 'pk-cumulative',
  },
  'effector.endurance_s': {
    theory: '유효 반경은 물리 도달거리와 스펙 최대치 중 작은 값.',
    formula: '유효 반경 = min(요격기 도달 반경, v_i · 체공시간)',
    detail:
      '체공이 짧으면 순항속도로 갈 수 있는 거리가 도달 반경보다 작아져 먼 요격이 불가능해집니다. 기본값에선 v_i·체공 ≫ 도달 반경이라 구속되지 않습니다.',
    diagram: 'closing-geometry',
  },
  'effector.reach_margin_sigma_m': {
    theory: '여유 불확실성 가정 하 정규 CDF로 도달 확률화.',
    assumption: '여유 오차 정규분포. σ→0이면 하드 0/1 게이트로 수렴.',
    formula: 'P_reach = Φ(여유_m / σ)',
    detail:
      '타이밍·속도·기하 지터로 Keep-out 여유가 흔들릴 때, 0/1 대신 연속 확률로 P_reach를 계산합니다. σ가 클수록 경계 근처에서 완만해집니다. 도달 불가(발사 불가·유효반경 초과)면 0.',
    diagram: 'closing-geometry',
  },

  // ── C2 ──────────────────────────────────────────────────
  'c2.decision_latency_s': {
    theory: `${REF_KINE}: 반응 예산에서 큰 비중.`,
    formula: 't_react = t_classify + t_decision + t_launch',
    detail: 'CONFIRM→APPROVE 운용자 결심 시간. 교전 성립 여부에 특히 민감합니다.',
    diagram: 'closing-geometry',
  },
  'c2.decision_recognition_coupling': {
    theory: '인간 결심은 분류 신뢰도(이미지 명료도)에 의존 — 애매하면 오판·주저.',
    assumption: '선형 커플링. 인식은 이미 P_classify를 게이팅 → >0은 부분 이중계산(인간 판단 추가 민감도로 해석). 0=독립(종전).',
    formula: 'P_decision = 결심신뢰도 × (1 − 커플링 · (1 − 인식))',
    detail: '커플링=0이면 결심과 인식이 독립. 1이면 인식이 낮을 때 결심 신뢰도도 함께 떨어짐. 기본 0.5(중간 가정).',
  },
  'c2.decision_reliability': {
    theory: `${REF_SERIES}: 킬체인은 단계 확률의 곱.`,
    assumption: '단계 독립.',
    formula: 'P_negate = P_detect · P_classify · P_decision · P_reach · P_kill',
    detail: '창 안에서 운용자가 올바르게 교전 승인할 확률(P_decision). 한 단계라도 낮으면 전체가 눌립니다.',
  },

  // ── 사이트 ──────────────────────────────────────────────
  'site.keep_out_radius_m': {
    theory: `${REF_KINE}: 요격 성립·여유 판정 경계.`,
    formula: '교전 성립 ⟺ R_int > keep-out',
    detail: '이 반경 밖에서 반드시 무력화해야 하는 방어 경계. 요격 지점이 안쪽으로 들어오면 교전 불성립.',
    diagram: 'closing-geometry',
  },
  'site.asset.lat': {
    theory: '배치 기하 기준점(지도·커버리지 중심).',
    formula: '(계산 입력 아님 · 표시/커버리지 기준점)',
    detail: '보호 자산의 위도. 지도 표시와 커버리지 중심에 쓰입니다.',
  },
  'site.asset.lon': {
    theory: '배치 기하 기준점(지도·커버리지 중심).',
    formula: '(계산 입력 아님 · 표시/커버리지 기준점)',
    detail: '보호 자산의 경도. 지도 표시와 커버리지 중심 기준점.',
  },
}

/** Lookup helper. */
export function paramExplain(key: string): ParamExplain | undefined {
  return PARAM_EXPLAIN[key]
}
