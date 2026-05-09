# cuas-gcs-mockup-cesium · 핸드오프 노트

> 에어빌리티 AB-U10 C-UAS GCS 모킹업 (Cesium 3D · 여의도 시나리오)
> baseline-v0.3 · 2026-05-03

## 어떻게 띄우나

```powershell
pnpm install
# .env.local 만들고 Cesium ion 토큰 넣기 — .env.example 참고
pnpm dev
```

→ http://localhost:5174

### Cesium ion 토큰

1. https://ion.cesium.com 가입 (무료)
2. **Access Tokens** → **Create token**
3. Scope: `assets:read` (terrain만 쓰면 충분)
4. `.env.local` 에 붙여넣기:
   ```
   VITE_CESIUM_TOKEN=eyJ...
   ```

## 빌드 / 배포

```powershell
pnpm build              # tsc + vite build → dist/
pnpm preview            # 로컬에서 production 빌드 확인
```

**Vercel 배포 (원본 프로젝트와 별개로 시도 시):**
```powershell
pnpm add -D vercel
npx vercel login        # 첫 1회
pnpm build
npx vercel deploy dist --prod --yes   # dist 폴더만 static으로 배포
```

원본 데모 URL (참고): https://cuas-mockup-demo-u10.vercel.app

## 폴더 구조

```
src/
  App.tsx              # 메인 — Cesium Viewer + 카메라 컨트롤러 + 모든 entity
  mockData.ts          # 시나리오 초기 상태 + 지오메트리 상수 + 격추 zone 후보
  scenario.ts          # 킬체인 phase 진행 + threat track + intercept solution
  u10Trajectory.ts     # AB-U10 비행 프로파일 (VTOL → bezier swing → tail chase)
  types.ts             # CUASTelemetry 등 타입
  icons.ts             # SVG 아이콘 (data URL)
  components/
    RightPanel.tsx     # 우측 사이드바 (control + cards + status log)
    BottomBar.tsx
    TopBar.tsx
    CameraStack.tsx    # 좌측 RADAR PPI + AB-U10 EO FWD
    cam/
      RadarPPI.tsx     # 레이더 PPI 시뮬
      U10FrontCam.tsx  # AB-U10 EO 전방 카메라 (AI lock box)
    ...                # KillChainTimeline, ThreatCard, InterceptCard, etc.
```

## 핵심 동작 요약

### 시나리오 (자동 진행 · ~90초)

1. STANDBY → DETECT → CONFIRM → APPROVE → LAUNCH → CAPTURE → REPORT
2. 매 reset마다 **적 진입 origin을 360° 랜덤** (VIP 기준 2.5–3.5km annulus)
3. 격추 zone은 **8개 후보 (한강 N/S/E/W 수역 + 여의도공원 + 한강시민공원 + 마포대교 + 서강대교)** 중 적 진입 방향 + 안전성(river > park > bridge) 기준 자동 선택
4. AB-U10 비행 프로파일:
   - VTOL 이륙 → climb-out → bezier swing
   - 마지막 1.5초: **dog-fight tail chase** (적 6시 60m 후방 평행 추적)
   - 격추 (NET / SHOTGUN) → RTB

### 카메라 모드

- **CINEMATIC** (-40° pitch, NNW heading, 2.6km alt) — 영상/마케팅 컷
- **TACTICAL** (-75° pitch, north-up, 5km alt) — 운용 GCS 시각 ID
- 토글: 우하단 버튼 / `V` 핫키 / 1.5s smooth flyTo

### 핫키

| 키 | 기능 |
|---|---|
| `Space` | 시작/일시정지 |
| `R` | 리셋 |
| `N` / `S` | 페이로드 NET / SHOTGUN |
| `G` | 화면 녹화 (webm) |
| `F` | 카메라 리셋 (현재 모드 preset으로) |
| `V` | TACTICAL ↔ CINEMATIC 토글 |
| `D` | 1× / 2× 속도 |

## 변경 이력 요약

- **baseline-v0.2** (이전): VTOL→cruise→level turn 비행 프로파일, EO FWD 락온, Yeouido fly-in, ground impact, leader line
- **baseline-v0.3** (현재):
  - 카메라 모드 토글 (TACTICAL/CINEMATIC) + 부드러운 전환
  - 컴퍼스 위젯 (정북 고정)
  - 2× 속도 토글
  - 360° 랜덤 적 진입 (annulus around VIP)
  - 8-zone 동적 격추 위치 선택
  - Dog-fight 6시 진입 + 1.5s tail chase
  - EO FWD AI box 실시간 bearing 기반 drift (랜덤 방향 적 대응)
  - PHASE_SCHEDULE 32.8 m/s 일관성 재조정 (capture@T+79s)
  - VIP 정중앙 카메라 preset 수학적 재계산
  - FPS 디버그 오버레이 제거
  - MC-01 (overwatch multicopter) 완전 제거 — 역할 없어 혼란만 줌
  - Manual scenario mode 제거 — AUTO만 유지 (시연 흐름 단순화)

## 다음 작업 후보

- Phase 1 시각 폴리시 (3D 모델 디테일, 시네마틱 컷, 시연 영상)
- 격추 zone polygon highlight (현재는 대략적 사각형이라 제거됨; OSM 한강 GeoJSON 통합 필요)
- 다중 위협 / 군집 시나리오
- Phase 2 운용 시뮬레이터 (조이스틱 입력, 결심 게이트)
- Phase 3 MATLAB UDP 브리지 (외부 비행 데이터 주입)
- MOSA 아키텍처 (sensor abstraction layer 도입)

## 알려진 한계

- Cesium ion 토큰이 dist 번들에 inline됨 (모킹업 단계 의도). 도메인 제한 기능 없으므로 quota 모니터링 필요.
- 격추 zone이 위성 지도와 정확히 align되지 않음 — 실제 운용용은 OSM GeoJSON 통합 필요.
- 폴리곤 highlight 미구현 (이전에 사각형으로 시도 후 제거).
- AB-U10 3D 모델은 임시 GLB (실제 모델로 교체 예정).

---

문의: 안민영 (myahn@airbility.co.kr)
