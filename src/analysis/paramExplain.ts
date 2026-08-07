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
  /** Authoritative/public source links shown in the in-app manual. */
  references?: Array<{ label: string; url: string }>
}

// Common references, cited once.
const REF_RADAR = 'Skolnik, Introduction to Radar Systems (3rd ed.) — 레이더 거리 방정식'
const REF_JOHNSON = 'Johnson, “Analysis of Image Forming Systems”(1958) · NVESD 표적획득 모델(TTP/N50)'
const REF_JOHNSON_REVIEW = 'Sjaardema·Smith·Birch, History and Evolution of the Johnson Criteria, SAND2015-6368 (2015)'
const REF_CEP = '원형 가우시안 지향오차 → 반경오차 Rayleigh 분포(CEP 계열)'
const REF_KINE = '1차 등속·직선 반경(radial) 운동학'
const REF_SERIES = '독립 시행 결합 확률(직렬 게이트/이항)'

export const PARAM_EXPLAIN: Record<string, ParamExplain> = {
  // ── 위협 ────────────────────────────────────────────────
  'threat.rcs_m2': {
    theory: `${REF_RADAR}: 고정 탐지 문턱에서 탐지거리 ∝ RCS^¼. 이 도구는 그 관계를 Pd 곡선 중심에 적용.`,
    assumption: 'RCS가 바뀌면 로지스틱 Pd 50% 중심 R_half만 4제곱근 비율로 이동하고 전이 폭 w는 고정.',
    formula: 'R_half(RCS) = R_half,0 · (RCS / RCS₀)^¼',
    detail:
      'RCS가 10배 커지면 곡선 중심은 ⁴√10≈1.78배 멀어집니다. 작은 RCS는 위협의 피탐성을 낮추므로 위협에는 유리하지만 방어 레이더에는 불리합니다. 전이 폭을 고정하므로 임의 Pd에서의 인용거리가 정확히 같은 비율로 변하는 것은 아닙니다.',
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
    assumption: '지상 레이더 탐지에만 경사거리 반영. 발사 후 EO는 카메라↔표적 상대 LOS 입력을 직접 사용하고 상대 고도차는 별도 모델링하지 않음.',
    formula: 'r_radar,slant = √(수평² + 고도²)\nEO 광학거리 = 카메라↔표적 상대 LOS 입력',
    detail:
      '같은 지상거리라도 고도가 높으면 레이더 LOS가 길어져 탐지가 어려워집니다. 탑재 EO는 자산 기준 고도를 다시 합성하지 않고 입력한 카메라↔표적 상대거리를 사용합니다.',
  },
  'threat.ingress_range_m': {
    theory: `${REF_SERIES}: 누적 탐지 P_det = 1 − Π(1 − p_i).`,
    assumption: '스캔 간 독립. P_detect 성공 게이트는 이 거리부터 필요 탐지거리까지의 스캔만 누적.',
    formula: '누적 스윕 시작점 R₀ (Δr = v_t·t_revisit 간격)',
    detail: 'run이 시작되는 자산으로부터의 거리. P_detect는 이 지점부터 교리상 적시 탐지 마감선까지의 스캔을 누적하며, 이후 keep-out까지의 누적은 참고값으로만 표시합니다.',
    diagram: 'cumulative-pd',
  },
  'threat.approach_bearing_deg': {
    theory: '방위 정의(항법): 0°=N, 시계방향.',
    assumption: '현재 효과도 운동학은 1차원 축대칭. 방위별 센서/지형/배치 성능 차이는 모델링하지 않음.',
    formula: '0°=N · 90°=E · 180°=S · 270°=W',
    detail: '자산에서 본 진입 원점의 방향입니다. 지도와 커버리지 footprint를 회전시키지만 현재 축대칭 단일 시나리오의 P_negate에는 영향을 주지 않습니다.',
  },
  'threat.characteristic_size_m': {
    theory: '기하광학: 표적 각크기 → 픽셀 수. (인식은 Johnson/NVESD)',
    formula: 'N_px = size · H_px / (range · HFOV_rad)',
    detail: 'EO/IR이 인식에 쓰는 표적 임계 치수(로터/윙 스팬 등). 표적 픽셀 수의 분자라 클수록 인식이 쉬워집니다.',
    diagram: 'johnson-n50',
  },

  // ── 레이더 ──────────────────────────────────────────────
  'sensor.ref_rcs_m2': {
    theory: `${REF_RADAR}: 고정 탐지 문턱에서 탐지거리 ∝ RCS^¼.`,
    assumption: '임의 RCS에서는 Pd 곡선의 중심 R_half만 이동하고 로지스틱 전이 폭 w는 고정.',
    formula: 'R_half(RCS) = R_half,0 · (RCS / RCS₀)^¼',
    detail: '레이더 성능이 인용된 표적의 기준 RCS입니다. 위협 RCS와 비교해 곡선 중심을 이동합니다. 전이 폭이 고정되므로 임의 Pd에서의 인용거리가 정확히 4제곱근 비율로 변하는 것은 아닙니다.',
    diagram: 'rcs-scaling',
  },
  'sensor.ref_detection_range_m': {
    theory: `${REF_RADAR}: 기준 RCS₀에서의 탐지거리(곡선 위치).`,
    assumption:
      '직관 입력값 — "이 거리에서 Pd 얼마로 탐지"의 거리 쪽. 내부 로지스틱 중심 R_half는 이 값이 아니라 아래 식으로 역산됩니다.',
    formula: 'R_half = R_q − w · ln(P_max/p_q − 1)\n(R_q = 기준 탐지거리, p_q = 기준거리 단일스캔 Pd)',
    detail:
      '데이터시트가 주는 형태 그대로 넣는 값입니다. ⚠ 이 값은 Pd 50% 지점이 아닙니다 — "Pd 0.9 @ 3 km"라면 곡선 중심은 3 km가 아니라 3.7 km(기본값 기준)로 역산됩니다. 예전처럼 인용 거리를 곡선 중심으로 쓰면 실제보다 나쁜 레이더를 모델링하게 됩니다.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_at_ref': {
    theory: `${REF_RADAR}: 사양서의 탐지거리는 항상 특정 Pd·Pfa 조건에서 인용됨(관례 Pd 0.8~0.9 @ Pfa 1e-6).`,
    assumption: '단일 스캔 기준(누적 아님). P_max보다 작아야 하며 초과 시 P_max 바로 아래로 클램프.',
    formula: 'p_q = P_max / (1 + e^((R_q − R_half)/w))\n⇒ R_half = R_q − w · ln(P_max/p_q − 1)',
    detail:
      '"탐지거리"는 그 거리의 단일스캔 탐지확률과 함께 정의해야 합니다. 기준거리와 다른 조건을 고정하면 이 값이 높을수록 같은 거리에서 더 높은 Pd를 달성하므로 더 좋은 레이더이고, 역산된 곡선 중심도 더 멀어집니다. 이 값은 누적 탐지확률이 아닙니다.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_max': {
    theory: '탐지확률은 SNR의 함수(Marcum Q). 근거리 SNR 충분 시 상한.',
    assumption: '거리 롤오프를 로지스틱으로 근사(실제 ROC 아님). 사양값이 아닌 곡선 형태 가정.',
    formula: 'P_d(r ≪ R_half) → P_max',
    detail:
      '[고급·곡선 형태] 근거리 단일스캔 Pd의 로지스틱 천장입니다. 기준거리와 그 지점의 Pd는 그대로 맞추도록 R_half가 함께 재보정되므로, P_max를 단독으로 높이는 것을 곧바로 센서 성능 향상으로 해석하면 안 됩니다. 실제 ROC 보정값이 있을 때만 조정하세요.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_transition_width_m': {
    theory: '탐지확률의 거리 경계 롤오프.',
    assumption:
      '로지스틱(시그모이드) 근사 — 실제로는 SNR–거리 ROC로 산출해야 함. RCS 스케일 시 곡선은 평행이동만 하고 w는 고정(형태 보존 가정).',
    formula: 'P_d(r) = P_max / (1 + e^((r − R_half)/w))\nw = 전이 폭',
    detail:
      '[고급·곡선 형태] 확률이 떨어지는 "부드러움"의 폭입니다. w가 작으면 낭떠러지처럼 뚝 끊기고, 크면 완만하게 감소합니다. r = R_half±w에서 P_d는 최대치의 약 27%/73%. 기준 탐지거리·Pd에서 중심을 역산할 때도 이 폭이 쓰이므로, w를 바꾸면 곡선 중심도 함께 이동합니다.',
    diagram: 'pd-logistic',
  },
  'sensor.revisit_time_s': {
    theory: `${REF_SERIES}: 접근 트랙의 독립 스캔 누적.`,
    assumption: '스캔 간 탐지 독립.',
    formula: 'P_det = 1 − Π(1 − p_d,i)\n샘플 간격 Δr = v_t · t_revisit',
    detail: '재방문이 빠를수록(작은 값) 진입거리부터 적시 탐지 마감선까지 더 많은 독립 스캔이 쌓여 P_detect가 올라갑니다. 마감선 뒤의 스캔은 교리상 발사에 늦으므로 P_detect에 넣지 않습니다.',
    diagram: 'cumulative-pd',
  },
  'sensor.radar_track_confidence': {
    theory: `${REF_SERIES}: 적시 탐지 발생과 탐지 후 트랙 유효성을 서로 다른 조건부 게이트로 분리.`,
    assumption: '레이더 추적/사격통제 시험값이 없으면 독립 조건부 확률로 근사. P_detect와 같은 자료에서 산출했다면 중복 감점이므로 1로 두거나 조건부 시험값으로 교체.',
    formula: 'P_terminal,radar = P(valid fire-control track | timely detection)\nP_chain ∝ P_detect × P_terminal,radar',
    detail: 'P_detect는 마감선 전에 트랙을 얻었는지를 나타냅니다. 이 값은 이미 얻은 트랙이 끊기지 않고 위치·속도 품질을 유지해 교전 선언과 사격 지원에 쓸 수 있는지를 나타냅니다. 두 확률을 같은 시험 지표에서 가져오면 이중 계산이 되므로 반드시 출처를 구분하세요.',
  },
  'sensor.classify_time_s': {
    theory: `${REF_KINE}: 발사 후 요격기↔표적 상대거리 감소 구간에 적용.`,
    assumption: '요격기와 표적이 같은 방사선·고도에서 정면 접근하고 EO 처리는 연속 수행된다고 근사.',
    formula:
      'D_EO,start = D_EO,complete + (v_i+v_t)·t_EO\nt_react,prelaunch = t_decision + t_launch',
    detail:
      'AB-U10이 발사된 뒤 탑재 EO가 선택한 탐지/인식/식별 과업을 완료하는 데 걸리는 시간입니다. EO 게이트가 활성일 때 처리 시작거리를 이동시키고, 확보 시간이 부족하면 성립성을 실패시킵니다. 시간이 충분한 구간 안에서는 처리시간 자체로 P_classify를 연속 감점하지 않으며, EO 미적용(레이더 추적만) 모드에서는 비활성입니다.',
    diagram: 'closing-geometry',
  },
  'sensor.classify_prob': {
    theory: `${REF_SERIES}: EO 과업은 획득·선택한 Johnson 탐지/인식/식별·대기투과·판별 신뢰도의 직렬 게이트.`,
    assumption: 'EO D/R/I 사용 시 각 게이트를 독립 곱으로 근사. 실제 영상시험으로 N50/ROC를 통합 보정했다면 이 상한 또는 대기항과 손실이 중복될 수 있으므로 보정 정의에 맞춰 1로 두거나 재추정.',
    formula: 'EO D/R/I: P_terminal EO = P_acq × P_Johnson,task × T_atmosphere × P_EO,ceiling\nEO 미적용: 사용하지 않음',
    detail: '픽셀이 충분해도 알고리즘/운용자, 배경 클러터 등 Johnson 픽셀 기준에 포함되지 않은 잔여 요인 때문에 실패할 조건부 상한입니다. 레이더 트랙 신뢰도와는 별도 입력이며 EO 미적용 정책에서는 결과에 사용하지 않습니다.',
  },

  // ── EO/IR ───────────────────────────────────────────────
  'optics.hfov_deg': {
    theory: `기하광학(픽셀 각크기) + ${REF_CEP}(획득). 두 효과가 반대.`,
    assumption: '수직 화각 입력이 없어 HFOV 반각을 원형 FOV 반경으로 사용. 실제 사각 프레임·종횡비에 대한 오차 방향은 보장되지 않으며 넓은 화면에서는 낙관적일 수 있음.',
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
  'optics.terminal_recognition_range_m': {
    theory: `${REF_KINE}: 발사 후 요격기와 위협의 상대거리는 closing 속도(v_i+v_t)로 감소.`,
    assumption: '요격기와 표적이 같은 방사선·고도에서 정면 접근하는 1차 근사. 상대 고도차는 미반영.',
    formula:
      'D_EO,start = D_EO,complete + (v_i+v_t)·t_EO\nt_complete = (D_launch − D_EO,complete)/(v_i+v_t)',
    detail:
      '요격기 탑재 EO 카메라와 표적 사이에서 선택한 탐지/인식/식별 과업이 완료되는 상대 LOS 거리입니다. 자산에서 표적까지의 거리가 아닙니다. 발사 거리는 이 값으로 역산하지 않고 발사 개시 거리 교리를 그대로 사용합니다.',
    diagram: 'closing-geometry',
  },
  'optics.n50_detection': {
    theory: `${REF_JOHNSON}; ${REF_JOHNSON_REVIEW}: 탐지 50% 기준 ≈1.0±0.25 cycle/표적 임계치수.`,
    assumption: '디지털 표본화의 최소 환산으로 1 resolved cycle≈2px를 적용해 기본 2px. 실제 자동탐지기는 ROC/시험자료로 보정 필요.',
    formula: 'P_task = nᴱ / (1 + nᴱ),  n = N_px / N50_탐지\nN50_탐지 = 1.0 cycle × 2 ≈ 2 px',
    detail: 'EO 탐지는 프레임 안에 관심 물체가 존재함을 발견하는 과업입니다. 레이더가 이미 트랙을 만들었다는 뜻과 구분됩니다. 물체 종류가 드론인지, 위협인지까지 판단하지 않습니다.',
    diagram: 'johnson-n50',
    references: [{ label: 'Sandia SAND2015-6368 · History and Evolution of the Johnson Criteria', url: 'https://www.osti.gov/biblio/1222446' }],
  },
  'optics.n50_recognition': {
    theory: `${REF_JOHNSON}: 인식급 ≈4.0 cycle. 판별수준별 N50 상이(탐지<인식<식별).`,
    assumption: '사용자 입력 단위는 px이며 1 cycle≈2px로 환산. 문헌 4.0cycle의 기본 환산값은 8px. 실제 드론/조류 과업은 시험자료로 보정 필요.',
    formula: 'P = nᴱ / (1 + nᴱ),  n = N_px / N50_인식,  E = 2.7 + 0.7·n',
    detail: 'EO 인식은 발견한 물체를 표적 클래스 수준으로 구분하는 과업입니다. 이 시나리오에서는 드론/조류 또는 위협 유형 구분으로 정의합니다. 특정 기종까지 확인하는 식별과는 다릅니다.',
    diagram: 'johnson-n50',
    references: [{ label: 'Sandia SAND2015-6368 · History and Evolution of the Johnson Criteria', url: 'https://www.osti.gov/biblio/1222446' }],
  },
  'optics.n50_identification': {
    theory: `${REF_JOHNSON}: 식별급 ≈6.4 cycle. 판별수준별 N50 상이(탐지<인식<식별).`,
    assumption: '사용자 입력 단위는 px이며 1 cycle≈2px로 환산. 문헌 6.4cycle의 기본 환산값은 12.8px. 실제 기종 식별 과업은 시험자료로 보정 필요.',
    formula: 'P = nᴱ / (1 + nᴱ),  n = N_px / N50_식별',
    detail: 'EO 식별은 인식한 클래스 안에서 특정 기종·모델 또는 개체군을 구분하는 가장 어려운 과업입니다. 이미 발사된 뒤 종말 EO 성공에 이 수준을 요구할 때 적용합니다.',
    diagram: 'johnson-n50',
    references: [{ label: 'Sandia SAND2015-6368 · History and Evolution of the Johnson Criteria', url: 'https://www.osti.gov/biblio/1222446' }],
  },
  'optics.cue_error_deg': {
    theory: `${REF_CEP}. 짐벌 없는 고정 FOV → 획득이 별도 관문.`,
    assumption: '입력값을 수평·수직 각축에 동일하게 적용되는 등방성 2D 가우시안의 축별 1σ로 취급. 큐·지향 오차는 독립이라 분산 가산.',
    formula: 'σ = √(cue² + point²)\nP_acq = 1 − exp(−(HFOV/2)² / (2σ²))',
    detail:
      '레이더가 카메라에 넘기는 큐의 각도 오차입니다. 단순 방위 1차원 오차가 아니라 2차원 각평면의 축별 1σ로 모델링합니다. 값이 크면 같은 화각에서 P_acq가 낮아집니다.',
    diagram: 'fov-acquisition',
  },
  'optics.pointing_error_deg': {
    theory: `${REF_CEP}. 요격기 LOS 지향(유도) 오차.`,
    assumption: '입력값을 등방성 2D 각오차의 축별 1σ로 취급. 큐·지향 오차는 독립이라 분산 가산.',
    formula: 'σ = √(cue² + point²)\nP_acq = 1 − exp(−(HFOV/2)² / (2σ²))',
    detail:
      '전방 고정 카메라를 비행(유도)으로 조준할 때의 LOS 지향 오차(1σ). 짐벌이 없으므로 이 오차가 커질수록 좁은 화각에서 표적을 프레임에 유지하기 어려워 P_acq가 급감합니다.',
    diagram: 'fov-acquisition',
  },
  'optics.visibility_km': {
    theory: 'Koschmieder(β=3.912/V, 2% 대비) + Beer-Lambert 투과 T=exp(−βR).',
    assumption: '균질 대기·수평 경로·대비 손실만 반영. 가시광 Koschmieder 관계를 EO/IR에 공통 적용한 근사이며 실제 IR 파장대의 흡수·산란은 다를 수 있음.',
    formula: 'β = 3.912 / V(km)\nT(R) = exp(−β · R)\nP_classify ∝ … × T',
    detail:
      '시정이 낮을수록 대기 투과가 지수적으로 떨어져 원거리 인식·분류확률이 급감합니다. 안개(≪1km)에선 사실상 원거리 교전이 불가. P_classify에 곱해집니다.',
  },

  // ── 이팩터 ──────────────────────────────────────────────
  'effector.launch_delay_s': {
    theory: `${REF_KINE}: 반응 예산 구성요소.`,
    formula: 't_react,prelaunch = t_decision + t_launch',
    detail: '승인 후 요격기가 공중에 뜨기까지(스핀업+발사)의 지연. 반응 예산에 포함됩니다.',
    diagram: 'closing-geometry',
  },
  'effector.cruise_speed_m_s': {
    theory: `${REF_KINE}: 접근속도 v_i+v_t, 회합 시각으로 요격거리 산출.`,
    formula: 't_meet = gap / (v_i + v_t)\nR_int = R_pad + v_i · t_meet',
    detail: '요격기가 빠를수록 접근속도가 커져 더 먼(자산 바깥) 거리에서 위협을 만납니다 → 요격 거리 여유↑.',
    diagram: 'closing-geometry',
  },
  'effector.commit_range_m': {
    theory: `${REF_KINE}: 교전은 교리(대응 거리)로 개시되며 탐지 시점으로 개시되지 않음.`,
    assumption:
      '위협이 이 거리에 도달하면 발사. 탐지가 늦어 결심+발사 지연이 안 들어가면 그때만 "가능한 즉시" 발사로 후퇴. EO는 발사 후 별도 상대거리 시간선으로 계산.',
    formula:
      'R_launch = min(R_commit, R_detect − v_t · (t_decision+t_launch))\n필요 탐지거리 = R_commit + v_t · (t_decision+t_launch)\nD_EO,complete = 카메라↔표적 상대거리 입력',
    detail:
      '체계가 AB-U10 발사를 개시하는 교리 거리입니다. 탐지가 적시에 끝나면 더 일찍 탐지해도 결정론적 발사 시점과 EO 완료 상대거리는 바뀌지 않습니다. 다만 적시 마감선 전 누적 스캔 성공확률 P_detect는 센서 성능에 따라 포화 전까지 더 높아질 수 있습니다. 이 값을 키우면 요격 지점은 바깥으로 이동하고 발사 후 EO 시간은 늘어납니다.',
    diagram: 'closing-geometry',
  },
  'effector.max_engagement_range_m': {
    theory: `${REF_KINE}: 현재 구현의 요격지점 반경 상한.`,
    assumption: '1차원 자산 중심 radial 모델이 R_int를 직접 상한과 비교. 발사대에서 실제로 비행한 경로 길이 상한으로 계산하지 않음. 종말 근접·발사는 P_kill에 암묵 포함.',
    formula: '요격 성립 ⟺ keep-out < R_int ≤ 도달 반경',
    detail: '현재 모델에서는 보호 자산으로부터 요격지점까지의 반경 R_int가 이 값을 넘으면 도달 불가로 판정합니다. 발사대 출발 실제 비행거리 상한과는 기준점이 다를 수 있는 1차 근사입니다. 넷건 종말 사거리는 별도이며 현재 P_kill에 포함합니다.',
    diagram: 'closing-geometry',
  },
  'effector.launch_pad_range_from_asset_m': {
    theory: `${REF_KINE}: 요격 기하의 출발점.`,
    formula: 'R_int = R_pad + v_i · t_meet',
    assumption: '발사대가 위협 진입 방향과 같은 방사선 위 자산 바깥쪽에 있다고 가정하는 1차원 기하. 임의 지도 방위의 직선거리만으로는 표현하지 못함.',
    detail: '보호 자산에서 발사대까지의 반경(0=동일 위치)입니다. 현재 식에서는 요격기가 이 반경에서 바깥 방향으로 출발합니다.',
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
    theory: '1차 근사 유효 반경은 스펙 상한과 속도×시간 상한 중 작은 값.',
    assumption: 'v_i·체공시간을 자산 중심 radial R_int 상한으로 적용. 실제 발사대 출발 경로 길이·가감속·복귀 여유는 미반영.',
    formula: '유효 반경 = min(요격기 도달 반경, v_i · 체공시간)',
    detail:
      '체공이 짧으면 속도×시간 상한이 작아져 먼 요격을 제한합니다. 현재 구현은 이 상한을 자산 중심 R_int와 비교하므로 발사대가 자산에서 떨어져 있을 때 실제 비행거리 해석과 차이가 날 수 있습니다.',
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
    formula: 't_react,prelaunch = t_decision + t_launch',
    detail: '레이더 트랙을 바탕으로 AB-U10 발사를 승인하는 시간. EO 처리는 발사 후이므로 이 시간 뒤에 별도 계산됩니다.',
    diagram: 'closing-geometry',
  },
  'c2.decision_reliability': {
    theory: `${REF_SERIES}: 킬체인은 단계 확률의 곱.`,
    assumption: '단계 독립.',
    formula: 'P_negate = P_detect · P_classify · P_decision · P_reach · P_kill',
    detail: '창 안에서 운용자가 올바르게 교전 승인할 확률(P_decision). 한 단계라도 낮으면 전체가 눌립니다.',
  },

  'c2.non_threat_rate': {
    theory: '오교전 위험(옵션) = 비위협 유입률 × ROE별 오통과율. P_negate와 별개 지표.',
    assumption: '옵션 OFF면 미계산. 비위협 신호모델은 단순 비율 가정.',
    formula: 'P_오교전 = 비위협 유입률 × 비위협 오통과율(현 교전기준)',
    detail: '제시되는 트랙 중 실제 비위협(새·아군·클러터) 비율. 이게 오교전(비위협 격추) 위험의 밑재료입니다. 실제 위협 무력화(P_negate)와는 무관.',
  },
  'c2.false_pass_detection': {
    theory: '레이더 추적만 또는 EO 탐지처럼 낮은 판별 수준일수록 비위협이 걸러지지 않고 통과할 가능성이 큼.',
    formula: 'P_오교전 = 비위협 유입률 × 이 값 (교전기준=탐지일 때)',
    assumption: '광학 성능·N50·시정에서 유도하지 않는 독립 조건부 확률 입력. EO 파라미터를 바꿔도 자동 변경되지 않음.',
    detail: '레이더 추적만 또는 EO 탐지 수준에서 비위협이 오통과할 조건부 확률입니다. 두 모드가 현재 같은 입력을 공유하는 단순화이며, 기본값은 ROC/시험자료로 교체해야 합니다.',
  },
  'c2.false_pass_recognition': {
    theory: 'EO 인식이 비위협(새 등)을 위협 드론으로 오인할 확률은 낮음.',
    formula: 'P_오교전 = 비위협 유입률 × 이 값 (교전기준=인식일 때)',
    assumption: '광학 성능·N50·시정에서 유도하지 않는 독립 조건부 확률 입력. EO 파라미터를 바꿔도 자동 변경되지 않음.',
    detail: '인식 기준에서 비위협이 위협으로 오인돼 종말 무력화까지 계속될 확률입니다. 기본값은 가정일 뿐이며 분류기 ROC/시험자료로 교체해야 합니다.',
  },
  'c2.false_pass_identification': {
    theory: '식별은 기종까지 확인 → 비위협 오통과 거의 없음.',
    formula: 'P_오교전 = 비위협 유입률 × 이 값 (교전기준=식별일 때)',
    assumption: '광학 성능·N50·시정에서 유도하지 않는 독립 조건부 확률 입력. EO 파라미터를 바꿔도 자동 변경되지 않음.',
    detail: '식별 기준에서 비위협이 특정 위협 기종으로 오식별될 확률입니다. 기본값은 가정일 뿐이며 분류기 ROC/시험자료로 교체해야 합니다.',
  },

  // ── 사이트 ──────────────────────────────────────────────
  'site.keep_out_radius_m': {
    theory: `${REF_KINE}: 요격 성립·여유 판정 경계.`,
    formula: '교전 성립 ⟺ R_int > keep-out',
    assumption: '최종 feasible은 R_int가 경계 밖인지 하드 판정. 별도의 P_reach는 여유 σ가 0보다 크면 경계 부근 불확실성을 정규 CDF로 연속화.',
    detail: '이 반경 밖에서 반드시 무력화해야 하는 방어 경계입니다. R_int≤keep-out이면 최종 성립성은 실패합니다. 다만 결과 카드의 P_reach는 불확실성 σ 때문에 경계 근처에서 0이 아닌 참고 확률을 보일 수 있으므로 두 값을 혼동하면 안 됩니다.',
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
