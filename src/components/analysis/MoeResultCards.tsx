import { diagnoseBottleneck, type MoeResult } from '../../analysis'

interface Props {
  result: MoeResult
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function pctPrecise(x: number): string {
  if (x > 0 && x < 0.001) return `${(x * 100).toFixed(5)}%`
  if (x > 0.999 && x < 1) return `${(x * 100).toFixed(5)}%`
  return pct(x)
}

// Gate bar — one stage of the kill chain as a labelled proportion bar.
function GateBar({ label, value, displayValue }: { label: string; value: number; displayValue?: string }) {
  return (
    <div className="an-gate">
      <div className="an-gate-head">
        <span className="an-gate-label">{label}</span>
        <span className="an-gate-val">{displayValue ?? pct(value)}</span>
      </div>
      <div className="an-gate-track">
        <div className="an-gate-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      </div>
    </div>
  )
}

export default function MoeResultCards({ result }: Props) {
  const {
    p_negate,
    leakage,
    breakdown,
    detection,
    optics,
    reach,
    terminal_eo,
    single_shot_pk,
    feasible,
    false_engagement,
  } = result
  const eo = optics.eo_gate_applied
  const taskName = optics.discrimination_level === 'detection' || optics.discrimination_level === 'radar_only'
    ? '탐지'
    : optics.discrimination_level === 'identification'
      ? '식별'
      : '인식'

  return (
    <div className="an-results">
      {/* Headline · probability of negation */}
      <div className={`an-headline ${feasible ? '' : 'is-infeasible'}`}>
        <div className="an-headline-main">
          <div className="ab-spec">P_NEGATE · 무력화 확률</div>
          <div className="an-headline-value">{pct(p_negate)}</div>
        </div>
        <div className="an-headline-side">
          <div className="an-leak">
            <div className="ab-spec">LEAKAGE · 누수</div>
            <div className="an-leak-value">{pct(leakage)}</div>
          </div>
          <div className={`an-feasible-badge ${feasible ? 'ok' : 'bad'}`}>
            {feasible ? '✓ 교전 성립' : '✕ 교전 불성립'}
          </div>
        </div>
      </div>

      {!feasible && (
        <div className="an-reason">
          불성립 사유: {!reach.feasible ? reach.reason : terminal_eo.reason}
        </div>
      )}

      {false_engagement != null && (
        <div className="an-false-eng">
          <span className="an-fe-tag">오교전 위험</span>
          <span className="an-fe-val">{pct(false_engagement)}</span>
          <span className="an-fe-note ab-small">비위협(새·아군·클러터) 격추 확률 · P_negate와 별개 · 현 교전 기준 기준</span>
        </div>
      )}

      {/* Bottleneck diagnosis — the limiting kill-chain stage + what to fix */}
      {(() => {
        const d = diagnoseBottleneck(result)
        return (
          <div className="an-bottleneck">
            <div className="an-bn-head">
              <span className="an-bn-tag">제약 단계</span>
              <span className="an-bn-stage">{d.label}</span>
              <span className="an-bn-val">{pct(d.value)}</span>
              {d.subFactor ? <span className="an-bn-sub">· 최약: {d.subFactor.label} {pct(d.subFactor.value)}</span> : null}
            </div>
            <div className="an-bn-reco">→ {d.recommendation}</div>
          </div>
        )
      })()}

      {/* Kill-chain gate breakdown */}
      <div className="an-card">
        <div className="ab-label">KILL-CHAIN 단계별 확률</div>
        <div className="an-gate-note ab-small">P_negate = 각 단계의 곱</div>
        <GateBar label="P_detect · 적시 탐지" value={breakdown.p_detect} displayValue={pctPrecise(breakdown.p_detect)} />
        <GateBar label={eo ? `P_terminal EO · EO ${taskName}` : 'P_terminal · 레이더 트랙 유효 신뢰도'} value={breakdown.p_classify} />
        <GateBar label="P_decision · 결심" value={breakdown.p_decision} />
        <GateBar label="P_reach · 도달(기하)" value={breakdown.p_reach} />
        <GateBar label="P_kill · 살상" value={breakdown.p_kill} />
      </div>

      {/* EO/IR optical D/R/I readout */}
      <div className="an-card">
        <div className="ab-label">EO/IR 탐지·인식·식별 · 광학</div>
        <div className="an-gate-note ab-small">
          {optics.eo_gate_applied
            ? `AB-U10 발사 후 탑재 EO 수행 · P_terminal EO = 획득 × Johnson ${taskName} × 대기투과 × EO 과업 신뢰도 상한`
            : 'EO 미적용 — 적시 탐지 후 레이더 트랙 유효 신뢰도만 사용합니다. 아래 광학 값은 결과에 사용하지 않습니다.'}
        </div>
        <dl className="an-readout">
          <div><dt>EO–표적 완료 상대거리</dt><dd>{eo ? `${optics.classify_range_m.toFixed(0)} m` : '—'}</dd></div>
          <div><dt>EO 처리 시작 상대거리</dt><dd>{eo ? `${terminal_eo.processing_start_separation_m.toFixed(0)} m` : '—'}</dd></div>
          <div className={eo && optics.pixels_on_target < 1 ? 'bad' : ''}>
            <dt>표적 픽셀 수</dt><dd>{eo ? `${optics.pixels_on_target.toFixed(1)} px` : '—'}</dd>
          </div>
          <div><dt>{taskName} 확률</dt><dd>{eo ? pct(optics.recognition_prob) : '—'}</dd></div>
          <div><dt>50% {taskName} 거리</dt><dd>{eo ? `${optics.recognition_range_50_m.toFixed(0)} m` : '—'}</dd></div>
          <div><dt>지향 오차 σ (큐⊕지향)</dt><dd>{eo ? `${optics.pointing_sigma_deg.toFixed(2)}°` : '—'}</dd></div>
          <div className={eo && optics.acquisition_prob < 0.5 ? 'bad' : ''}>
            <dt>획득 확률 P_acq</dt><dd>{eo ? pct(optics.acquisition_prob) : '—'}</dd>
          </div>
          <div className={eo && optics.atmospheric_transmission < 0.5 ? 'bad' : ''}>
            <dt>대기 투과 (시정)</dt><dd>{eo ? pct(optics.atmospheric_transmission) : '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Kinematics / geometry readout */}
      <div className="an-card">
        <div className="ab-label">교전 기하 · 타임라인</div>
        <div className="an-gate-note ab-small">
          {reach.detection_limited
            ? '⚠ 탐지 제약 — 탐지가 늦어 교리상 발사 개시 거리를 지키지 못하고 "가능한 즉시" 발사로 후퇴.'
            : '교리 지배 — 발사 개시 거리에서 정상 교전. 더 먼 탐지는 발사 시점을 앞당기지 않지만 적시 P_detect는 포화 전까지 높일 수 있음.'}
        </div>
        <dl className="an-readout">
          <div><dt>P_detect · 적시 누적</dt><dd>{pctPrecise(detection.cumulative_pd_in_time)}</dd></div>
          <div><dt>적시 미탐지 위험</dt><dd>{pctPrecise(1 - detection.cumulative_pd_in_time)}</dd></div>
          <div><dt>적시 / 전체 독립 스캔</dt><dd>{detection.looks_in_time} / {detection.looks_before_keep_out} 회</dd></div>
          <div><dt>Keep-out 전 누적 탐지 (참고)</dt><dd>{pctPrecise(detection.cumulative_pd_before_keep_out)}</dd></div>
          <div><dt>탐지 거리 (사양 Pd 기준)</dt><dd>{detection.quoted_range_m.toFixed(0)} m</dd></div>
          <div><dt>Pd 50% 거리 (곡선 중심)</dt><dd>{detection.nominal_range_m.toFixed(0)} m</dd></div>
          <div><dt>탐지 시점 거리</dt><dd>{detection.detect_at_range_m.toFixed(0)} m</dd></div>
          <div><dt>적시 탐지 마감선 (교리 충족)</dt><dd>{reach.required_detection_range_m.toFixed(0)} m</dd></div>
          <div className={reach.detection_limited ? 'bad' : 'ok'}>
            <dt>탐지 여유</dt>
            <dd>{reach.detection_margin_m.toFixed(0)} m · {reach.detection_margin_s.toFixed(1)} s</dd>
          </div>
          <div><dt>발사 전 반응 예산 (결심+발사)</dt><dd>{reach.budget.react_total_s.toFixed(1)} s</dd></div>
          <div><dt>발사 개시 거리 (교리)</dt><dd>{reach.commit_range_m.toFixed(0)} m</dd></div>
          <div><dt>발사 시 위협 거리</dt><dd>{reach.threat_range_at_launch_m.toFixed(0)} m</dd></div>
          {eo ? (
            <>
              <div className={terminal_eo.processing_start_after_launch_s >= 0 ? 'ok' : 'bad'}>
                <dt>EO 시작 (발사 후)</dt>
                <dd>T+{terminal_eo.processing_start_after_launch_s.toFixed(1)} s · 상대 {terminal_eo.processing_start_separation_m.toFixed(0)} m</dd>
              </div>
              <div className={terminal_eo.timing_feasible ? 'ok' : 'bad'}>
                <dt>{taskName} 완료 (발사 후)</dt>
                <dd>T+{terminal_eo.recognition_after_launch_s.toFixed(1)} s · 상대 {terminal_eo.recognition_separation_m.toFixed(0)} m</dd>
              </div>
              <div>
                <dt>완료 시 자산 기준 위치</dt>
                <dd>표적 {terminal_eo.target_range_at_recognition_m.toFixed(0)} m · U10 {terminal_eo.interceptor_range_at_recognition_m.toFixed(0)} m</dd>
              </div>
              <div><dt>EO 완료→요격 여유</dt><dd>{terminal_eo.time_remaining_to_intercept_s.toFixed(1)} s</dd></div>
            </>
          ) : null}
          <div><dt>요격까지 시간</dt><dd>{reach.time_to_meet_s.toFixed(1)} s</dd></div>
          <div><dt>요격 거리 (자산 기준)</dt><dd>{reach.intercept_range_m.toFixed(0)} m</dd></div>
          <div className={reach.margin_m >= 0 ? 'ok' : 'bad'}>
            <dt>Keep-out 여유</dt>
            <dd>{reach.margin_m.toFixed(0)} m · {reach.margin_s.toFixed(1)} s</dd>
          </div>
          <div><dt>단발 살상확률 (payload)</dt><dd>{pct(single_shot_pk)}</dd></div>
        </dl>
      </div>
    </div>
  )
}
