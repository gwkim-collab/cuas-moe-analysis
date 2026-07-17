// ────────────────────────────────────────────────────────────
// Analysis core · per-parameter teaching content (formula + prose
// + which dynamic diagram best explains it).
//
// Kept separate from params.ts (the value/get/set registry) so the
// SSOT stays lean and CSV export is unaffected. Pure data — no React.
// The diagram id maps to a live SVG in components/analysis/diagrams.
//
// Keyed by ParamInfo.key. Not every parameter needs a diagram; those
// that are self-evident from a formula carry only `formula`/`detail`.
// ────────────────────────────────────────────────────────────

export type DiagramId =
  | 'rcs-scaling'
  | 'pd-logistic'
  | 'cumulative-pd'
  | 'johnson-n50'
  | 'pk-cumulative'
  | 'closing-geometry'

export interface ParamExplain {
  /** One or more formula lines (unicode math; rendered in a mono block). */
  formula?: string
  /** Longer plain-language explanation, beyond the one-line `description`. */
  detail?: string
  /** Which live diagram illustrates this parameter, if any. */
  diagram?: DiagramId
}

export const PARAM_EXPLAIN: Record<string, ParamExplain> = {
  // ── 위협 ────────────────────────────────────────────────
  'threat.rcs_m2': {
    formula: 'R_det ∝ (RCS / RCS₀)^¼ · R₀',
    detail:
      '레이더 방정식상 탐지거리는 RCS의 4제곱근에 비례합니다. 그래서 RCS가 10배 커져도 탐지거리는 ⁴√10 ≈ 1.78배만 늘어납니다 — 스텔스(작은 RCS)가 왜 효과적인지, 반대로 RCS를 키워도 탐지거리 이득이 왜 완만한지를 보여줍니다.',
    diagram: 'rcs-scaling',
  },
  'threat.speed_m_s': {
    formula: 'closing = v_i + v_t\n반응 중 접근거리 = v_t · t_react',
    detail:
      '위협이 빠를수록 (1) 반응하는 동안 더 많이 접근하고 (2) 요격기와의 접근속도(closing)가 커져 더 빨리 만납니다. 교전 성립 여유에 직접 영향.',
    diagram: 'closing-geometry',
  },
  'threat.altitude_m_agl': {
    formula: '(현재 모델: 수평 반경 기하 — 고도 미반영)',
    detail:
      '현재 해석 모델은 수평 거리 기반이라 고도는 계산에 들어가지 않고 정보 표기용입니다. 3D 경사거리(slant range)로 확장하면 이 값이 탐지·교전 기하에 들어갑니다.',
  },
  'threat.ingress_range_m': {
    formula: '누적 Pd 스윕 시작점 R₀\n트랙: R₀ → keep-out (Δr = v_t·t_revisit 간격)',
    detail:
      'run이 시작되는 자산으로부터의 거리. 누적 탐지확률은 이 지점부터 안쪽으로 스캔을 쌓아 계산합니다.',
    diagram: 'cumulative-pd',
  },
  'threat.approach_bearing_deg': {
    formula: '0° = 북(N), 시계방향 (90°=E, 180°=S, 270°=W)',
    detail:
      '자산에서 본 진입 원점의 방위. 단일 시나리오의 기하 기준이자, 방어 커버리지 탭에서 360° 스윕의 한 방향입니다.',
  },
  'threat.characteristic_size_m': {
    formula: 'N_px = size · H_px / (range · HFOV_rad)',
    detail:
      'EO/IR이 인식에 쓰는 표적의 임계 치수(로터/윙 스팬 등). 표적 픽셀 수의 분자라서, 클수록 같은 거리에서 더 많은 픽셀에 걸쳐 인식이 쉬워집니다.',
    diagram: 'johnson-n50',
  },

  // ── 레이더 ──────────────────────────────────────────────
  'sensor.ref_rcs_m2': {
    formula: 'R_det(RCS) = R₀ · (RCS / RCS₀)^¼',
    detail:
      '탐지거리가 정의되는 기준점의 RCS(RCS₀). 임의 RCS의 탐지거리를 이 기준에서 4제곱근으로 환산합니다.',
    diagram: 'rcs-scaling',
  },
  'sensor.ref_detection_range_m': {
    formula: 'R₀ = 기준 RCS₀ 표적의 탐지거리\nP_d(R₀ 기준거리)에서 곡선 중심',
    detail:
      '곡선의 위치를 정하는 값. 이 거리에서 단일 스캔 탐지확률이 최대치의 절반(P_max/2)이 되고, 안쪽은 P_max로 포화, 바깥은 0으로 떨어집니다.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_max': {
    formula: 'P_d(r ≪ R_det) → P_max',
    detail:
      '표적이 충분히 가까울 때의 단일 스캔 탐지확률 상한. 로지스틱 곡선의 천장 높이입니다.',
    diagram: 'pd-logistic',
  },
  'sensor.pd_transition_width_m': {
    formula: 'P_d(r) = P_max / (1 + e^((r − R_det)/w))\nw = 전이 폭',
    detail:
      '탐지거리 경계에서 확률이 떨어지는 "부드러움"의 폭입니다. w가 작으면 R_det에서 낭떠러지처럼 뚝 끊기고(경계가 뚜렷), w가 크면 완만하게 서서히 감소합니다. r = R_det±w 지점에서 P_d는 최대치의 약 27% / 73%가 됩니다. 아래 곡선에서 회색 띠가 ±w 구간입니다 — 값을 바꿔 폭이 넓어지고 좁아지는 걸 확인하세요.',
    diagram: 'pd-logistic',
  },
  'sensor.revisit_time_s': {
    formula: 'P_det = 1 − Π(1 − p_d,i)\n샘플 간격 Δr = v_t · t_revisit',
    detail:
      '스캔이 접근 트랙을 얼마나 촘촘히 훑는지. 재방문이 빠를수록(작은 값) 같은 구간에서 더 많은 독립 스캔이 쌓여 누적 탐지확률이 빨리 1에 수렴합니다.',
    diagram: 'cumulative-pd',
  },
  'sensor.classify_time_s': {
    formula: 't_react = t_classify + t_decision + t_launch',
    detail:
      '최초 탐지 후 적대 여부를 분류/확인하는 데 걸리는 시간. 반응 예산의 일부라, 이 시간만큼 위협이 더 접근한 뒤에야 발사가 시작됩니다.',
    diagram: 'closing-geometry',
  },
  'sensor.classify_prob': {
    formula: 'P_classify = 인식확률(EO/IR) × 분류기 상한',
    detail:
      '픽셀이 충분해 인식확률이 1에 가까워져도, 분류기/운용자 정확도의 한계로 P_classify가 이 값을 넘지 못합니다(상한).',
  },

  // ── EO/IR ───────────────────────────────────────────────
  'optics.hfov_deg': {
    formula: 'IFOV = HFOV_rad / H_px\nN_px = size / (range · IFOV)',
    detail:
      '수평 화각이 좁을수록 한 픽셀이 담는 각도(IFOV)가 작아져 같은 거리에서 표적 픽셀 수가 늘어나 인식거리가 길어집니다. 단, 탐색 범위는 좁아집니다(줌↔시야 트레이드오프).',
    diagram: 'johnson-n50',
  },
  'optics.h_resolution_px': {
    formula: 'IFOV = HFOV_rad / H_px\nN_px = size / (range · IFOV)',
    detail:
      '가로 픽셀 수가 많을수록 IFOV가 작아져 표적 픽셀 수가 늘고 인식거리가 길어집니다.',
    diagram: 'johnson-n50',
  },
  'optics.sensor_width_mm': {
    formula: 'HFOV = 2 · atan(sensor_w / (2 · f))',
    detail:
      '센서 물리 폭. 초점거리 f ↔ 화각 환산을 표시하는 용도이며, 인식 픽셀 계산 자체에는 직접 쓰이지 않습니다.',
  },
  'optics.n50_recognition': {
    formula: 'P = nᴱ / (1 + nᴱ),  n = N_px / N50,  E = 2.7 + 0.7·n',
    detail:
      'Johnson/NVESD 표적획득 기준의 난이도 문턱. "50% 인식에 필요한 픽셀 수"라서, N50이 클수록(어려운 과제) 같은 거리에서 인식확률이 낮아집니다. 곡선은 픽셀이 N50에 도달하는 지점에서 급격히 상승합니다.',
    diagram: 'johnson-n50',
  },

  // ── 이팩터 ──────────────────────────────────────────────
  'effector.launch_delay_s': {
    formula: 't_react = t_classify + t_decision + t_launch',
    detail: '승인 후 요격기가 공중에 뜨기까지(스핀업+발사)의 지연. 반응 예산에 포함됩니다.',
    diagram: 'closing-geometry',
  },
  'effector.cruise_speed_m_s': {
    formula: 't_meet = gap / (v_i + v_t)\nR_int = R_pad + v_i · t_meet',
    detail:
      '요격기가 빠를수록 접근속도(v_i+v_t)가 커져 더 먼 거리(자산에서 바깥쪽)에서 위협을 만납니다 → 요격 거리 여유↑.',
    diagram: 'closing-geometry',
  },
  'effector.max_engagement_range_m': {
    formula: '교전 성립 ⟺ keep-out < R_int ≤ 최대교전거리',
    detail: '발사대에서 요격기가 유효 도달 가능한 최대 거리. 요격 지점이 이보다 멀면 교전 불성립.',
    diagram: 'closing-geometry',
  },
  'effector.launch_pad_range_from_asset_m': {
    formula: 'R_int = R_pad + v_i · t_meet',
    detail: '보호 자산에서 발사대까지 거리(0=동일 위치). 요격 기하의 출발점입니다.',
    diagram: 'closing-geometry',
  },
  'effector.single_shot_pk_net': {
    formula: 'P_k = 1 − (1 − p)ⁿ',
    detail:
      '넷건 단발 살상확률 p. 사격 기회 n번이 독립이라고 보면 누적 살상확률은 1−(1−p)ⁿ로 빠르게 1에 접근합니다.',
    diagram: 'pk-cumulative',
  },
  'effector.single_shot_pk_shotgun': {
    formula: 'P_k = 1 − (1 − p)ⁿ',
    detail: '샷건 단발 살상확률 p (payload=shotgun일 때 사용). 누적식은 넷건과 동일.',
    diagram: 'pk-cumulative',
  },
  'effector.shot_opportunities': {
    formula: 'P_k = 1 − (1 − p)ⁿ',
    detail:
      '교전창 안에서 시도 가능한 사격/패스 횟수 n. n이 늘수록 누적 살상확률이 오르지만 한계효용은 체감합니다.',
    diagram: 'pk-cumulative',
  },

  // ── C2 ──────────────────────────────────────────────────
  'c2.decision_latency_s': {
    formula: 't_react = t_classify + t_decision + t_launch',
    detail:
      'CONFIRM→APPROVE 운용자 결심 시간. 반응 예산에서 큰 비중을 차지해, 교전 성립 여부에 특히 민감합니다.',
    diagram: 'closing-geometry',
  },
  'c2.decision_reliability': {
    formula: 'P_negate = P_detect · P_classify · P_decision · P_reach · P_kill',
    detail:
      '창 안에서 운용자가 올바르게 교전 승인할 확률(P_decision 게이트). 킬체인은 단계 확률의 곱이라, 한 단계라도 낮으면 전체가 눌립니다.',
  },

  // ── 사이트 ──────────────────────────────────────────────
  'site.keep_out_radius_m': {
    formula: '교전 성립 ⟺ R_int > keep-out',
    detail:
      '이 반경 밖에서 반드시 무력화해야 하는 방어 경계. 요격 지점이 이 안쪽으로 들어오면(너무 늦게 만나면) 교전 불성립으로 판정합니다.',
    diagram: 'closing-geometry',
  },
  'site.asset.lat': {
    formula: '(지도·커버리지 footprint 기준점)',
    detail: '보호 자산의 위도. 계산 자체보다 지도 표시와 커버리지 중심에 쓰입니다.',
  },
  'site.asset.lon': {
    formula: '(지도·커버리지 footprint 기준점)',
    detail: '보호 자산의 경도. 지도 표시와 커버리지 중심 기준점.',
  },
}

/** Lookup helper. */
export function paramExplain(key: string): ParamExplain | undefined {
  return PARAM_EXPLAIN[key]
}
