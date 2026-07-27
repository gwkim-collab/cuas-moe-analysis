# cuas-gcs-mockup-cesium (AB-U10 C-UAS GCS · MOE 분석 도구)

> AB-U10 C-UAS GCS — Cesium 3D 운용 씬 + **효과도(MOE)·시스템 분석 도구**.
>
> 📊 **분석 도구 문서: [`docs/README.md`](./docs/README.md)** (사용법·모델·요구사항 도출·스터디 결과).
> 운용 화면에서 우상단 **"효과도 분석 ▸"** 버튼 또는 `A` 키로 분석 도구 진입.

## 시작하기 (저장소 루트에서)

```powershell
pnpm install   # 최초 1회 (의존성 설치)
pnpm start     # = vite --open — dev 서버 + 브라우저 자동
```

또는 루트의 **`run.cmd` 더블클릭**(의존성 자동 설치 후 실행). → http://localhost:5174 자동 오픈.

첫 로드 시 5-10초 정도 Cesium ion world terrain 다운로드 + 카메라 fly-in.

> ⚠ 아래 "현재 상태(v0)"·"다음 단계"는 초기 3D 포팅 시점 기록입니다. 이후 완전한 C-UAS GCS +
> MOE 분석 도구로 확장됐으니 최신 내용은 `docs/`를 참고하세요.

## 현재 상태 (v0)

- ✅ Cesium ion world terrain (실시간 3D 지형 스트리밍)
- ✅ 여의도 카메라 fly-in (SW → 1.8km 고도, 32° pitch)
- ✅ VIP / AB-U10 / HOSTILE / CAPTURE PT 마커 (3D 좌표 + 라벨)
- ✅ 다크 sky atmosphere + globe lighting
- ✅ 카메라 컨트롤 (스크롤=줌, 드래그=회전, ctrl+드래그=틸트)
- ⏳ 곡선 궤적 (bezier curve) — 다음 단계
- ⏳ TopBar / RightPanel / 카메라 뷰 — 다음 단계

## 폴더 구조 vs 2D 버전

| 항목 | 2D (`cuas_gcs_mockup/`) | 3D (`cuas_gcs_mockup_cesium/`) |
|---|---|---|
| 지도 라이브러리 | Leaflet (200KB) | Cesium ion + Resium (5MB) |
| 지형 | 2D OSM 다크 타일 | 3D world terrain · 실제 고도 |
| AB-U10 위치 | lat/lon 만 | lat/lon + altitude (12m → 95m) |
| 카메라 | 고정 top-down | 자유 3D 카메라 |
| 첫 로드 | <1초 | 5-10초 (terrain 스트리밍) |

## 환경 변수

`.env.local` (git-ignored) 에 Cesium ion 토큰:

```
VITE_CESIUM_TOKEN=eyJhbGc...
```

토큰 없으면 globe가 기본 회색으로 뜨고 좌하단에 경고 표시.

## 다음 단계

1. **곡선 궤적** — `src/u10Trajectory.ts` 포팅 + 3D bezier (alt 보간)
2. **시나리오 엔진** — 기존 `scenario.ts` 그대로 import
3. **HUD 오버레이** — TopBar / RightPanel / 카메라 stack 컴포넌트 가져오기
4. **AB-U10 3D 모델** — glTF 임포트 (Phase 1 UE5 작업과 같은 모델 재활용)
