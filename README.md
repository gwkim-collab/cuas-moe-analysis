# cuas-gcs-mockup-cesium

> AB-U10 C-UAS GCS — **3D 변형판** (Cesium · Yeouido 시나리오)
>
> 기존 `cuas_gcs_mockup/` 의 2D Leaflet 버전을 Cesium 3D 지형으로 옮긴 트랙.
> 단계: 우선 3D 지형 + 마커 → 마커 곡선 궤적 → 좌측 카메라 뷰들 + 우측 패널 포팅.

## 시작하기

```powershell
cd "C:\Users\ather\Downloads\Simulator Project\cuas_gcs_mockup_cesium"
pnpm dev
```

→ http://localhost:5174 열기.

첫 로드 시 5-10초 정도 Cesium ion world terrain 다운로드 + 카메라 fly-in.

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
