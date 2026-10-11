# 📜 TAPWAR (탭워) 공식 게임 설정 및 룰북 (System Design Manifesto)

> **버전:** v2026.10.11-SeoulEdition  
> **장르:** 실시간 행정구역 전선 전략 시뮬레이션 (Real-Time Administrative Front-Line Strategy)  
> **비주얼 톤앤매너:** 미니 메트로(Mini Metro) 스타일 미니멀 라이트 디자인 (웜 크림 모눈종이 그리드 + 깔끔한 일러스트 지도)

---

## 🗺️ 1. 전장 시스템 (Battlefield Stages)

| 전장 이름 | 행정 단위 | 구역 수 | 특징 |
| :--- | :--- | :---: | :--- |
| **전국 전선** | 시·군 | 164개 | 한반도 전역을 무대로 하는 대규모 총력전 |
| **서울 특별전** | 자치구 | 25개 | 네이버 블로그 일러스트 스타일 맵 + **한강 자연 수로(Han River)** 기본 탑재 |
| **경기도 전선** | 시·군 | 31개 | 수도권 외곽을 둘러싼 치열한 국지전 (수원, 성남, 고양, 용인 등) |

- **시작 방식:**
  1. 게임 진입 시 3개 전장 중 1곳을 선택.
  2. 원하는 시작 거점 1곳을 클릭(탭)하여 아군 본진 확보 ➔ 즉시 작전 개시.
  3. 적군(AI)도 1:1 대등한 조건으로 먼 거리 거점 1곳을 확보하고 시작.

---

## ⚔️ 2. 병력 생산 및 기본 이동 규칙

1. **자동 생산 주기:**
   - **기본 생성 속도:** **1.0초마다 1발** 자동 생산.
   - **완전점령 보너스:** 완전점령(🛡️) 거점 1개당 생성 간격 **-0.1초 단축** (아무리 완전점령이 많아도 **최대 속도 한계는 0.5초 / 500ms**).
2. **단일 클릭 규칙:**
   - 일반 1회 클릭(탭)을 연타한다고 해서 구슬이 추가로 사출되지 않음 (매크로/연타 방지, 자동 생산 주기 유지).
3. **진격 및 타겟팅:**
   - **자동 진격:** 따로 지정하지 않으면 맞닿아 있는 **적군 전선 ➔ 중립 미점령 구역** 순으로 최단거리 자동 사출.
   - **드래그 수동 지정:** 아군 거점을 꾹 누르고 원하는 목표 거점으로 드래그하면, 기존 인접 공격을 멈추고 **지정한 목표지로 전 병력 집중 진격**.

---

## 🛡️ 3. 점령 및 '완전 점령(철벽 기지)' 규칙

1. **체력 (HP / Garrison):**
   - 모든 구역의 기본 체력은 **`0/50`** (체력이 50에 도달하면 즉시 점령 완료).
   - 점령 완료 시 초기 주둔군 `50/50`으로 채워짐.
2. **완전 점령 (Shield 🛡️):**
   - **조건:** 해당 구역과 **맞닿은 모든 이웃 구역이 전부 같은 진영**일 때 자동 판정.
   - **효과 (철벽 방어):**
     - 일반 구슬 공격에 대해 **절대 무적(면역)** 상태.
     - 더 이상 적과 맞닿아 있지 않으므로 불필요한 구슬 생성을 중단(자원 낭비 방지).
     - 아군의 총 생성 속도를 가속(-0.1초, 최대 0.5초 한계)시키는 배후 보급기지 역할.
     - 특수기술을 발동하기 위한 핵심 충전소 역할.

---

## 🎯 4. 집중 포격 (Focus Fire / 더블탭)

- **조작:** 공격하고 싶은 적 또는 중립 구역을 **더블클릭 / 더블탭**.
- **쿨타임:** **0초 (쿨타임 없음, 즉시 연속 발동 가능)**.
- **발동 효과:**
  - 완전점령(배후) 기지를 제외한 **모든 전선의 아군 기지**가 목표 구역을 향해 일제히 **3~4발의 구슬을 쾌속 연발 사출**.
  - 목표가 점령 완료되거나 철벽 상태로 전환되면 즉시 원래 전선으로 자동 복귀.

---

## 💥 5. 특수 기술 (Special Tactical Skill)

- **발동 조건:** 아군 **완전 점령 구역이 3개 이상** 확보되었을 때 버튼 활성화.
- **쿨타임:** **10초 (글로벌 쿨타임)**.
- **사용 효과:**
  - 적군 점령지 중 **무작위 3곳의 피(HP)를 각각 -10씩 즉시 깎음**.
  - 피가 깎인 적 구역은 점령 요건이 부족해져 인근 적군이 방어 구슬을 다시 채워 넣어야 하는 혼란 유발.
  - 전선이 교착되었을 때 적진의 방어선을 일거에 무너뜨리는 필살기.

---

## 🏆 6. 승리 요건 및 작전 기록계

1. **승리 조건:**
   - **오직 적 거점 0곳 전멸(섬멸 완료)**로만 승리 (15분 타임아웃/시간제한 승패 판정 없음).
2. **패배 조건:**
   - 아군의 모든 거점이 함락되었을 때.
3. **작전 기록 (스톱워치 기록계):**
   - 상단 HUD에 `00:00` 스톱워치 실시간 카운트 (배속 연동).
   - 클리어 시 소요 시간이 브라우저 영구 저장소(`localStorage`)에 보존되며, **전장별 최고 기록(Best Time) 및 누적 평정 횟수** 뱃지가 메인 화면에 갱신 표시.

---

## 🕹️ 7. 모바일 조작 및 편의 기능

- **화면 배속:** `1x`, `2x`, `4x`, `10x` 실시간 배속 전환 지원.
- **모바일 제스처:**
  - **한 손가락 드래그:** 거점 연결 및 맵 이동.
  - **두 손가락 핀치(Pinch):** 확대 / 축소 (Zoom In/Out).
  - **더블탭:** 해당 구역 일제 집중 포격 (3~4발 연발 사출).
- **시각 편의:**
  - 복잡한 거미줄 네트워크 연결선(회색 선) 숨김 처리.
  - 단일 폰트 체력 표기(`0/50`)로 잔상 제거.

---

## 🛠️ 맵 데이터 정리 (모든 맵 필수)

새 맵을 추가하거나 기존 맵 데이터를 바꾸면 **반드시** 아래 도구를 실행하세요.

```bash
pip install "shapely>=2.1"
python tools/build_map.py assets/새맵.json
```

이 도구가 보장하는 것:
- 한 행정구역이 여러 조각이면 **하나의 덩어리**로 병합 (구분선 없음, 섬은 별도 유지)
- 이웃 구역 사이 **틈·겹침 제거**, 이웃끼리 **완전히 같은 경계선 꼭짓점 공유** → 화면에서 경계선이 어긋나지 않음
- 구역 이름·구슬 출발점을 구역의 **시각적 중앙**(가장 안쪽 지점)에 배치
- 인접 관계(links)에 실제로 맞닿은 구역 추가 (기존 연결은 유지)

### 맵 구역 단위 원칙
- 기본은 **행정구역(시·군·구)** 단위로 나눕니다.
- **광역시**(`--level metro`): 구는 구 단위, 구가 없는 군은 읍·면 단위 (부산·대구·인천·울산)
- **도**(`--level split --target 25`): 시·군에서 시작해 가장 넓은 시·군을 읍·면·동 경계로 둘로 나누기를 25곳이 될 때까지 반복, 이름은 원래 시·군 중심 기준 8방위("충주시 북서부")
- 구가 너무 적은 곳(대전·세종·제주, `--level dong`)은 **행정동** 단위
- 시·도 맵 만들기 (2026-07-01 행정구역 기준, 16개 시·도):
  ```bash
  python tools/make_region_map.py HangJeongDong.geojson "부산광역시" "부산광역시 전선" assets/busan_zones.json
  python tools/add_water.py assets/busan_zones.json && python tools/build_map.py assets/busan_zones.json && python tools/add_water.py --carve assets/busan_zones.json
  ```
  먼 섬은 `tools/adjust_islands.py`로 제외(drop)하거나 본토 가까이 옮김(shift).
- 행정동 맵 만들기:
  ```bash
  curl -L -o HangJeongDong.geojson \
    https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson
  python tools/make_dong_map.py HangJeongDong.geojson "경기도 수원시" "수원시 44개 행정동 전선" assets/suwon_exact_zones.json
  python tools/build_map.py assets/suwon_exact_zones.json
  ```
  그다음 `game.js`의 `MAP_CONFIGS`에 전장을 추가하고(`bounds`는 생성된 JSON의 `meta.bounds`), `index.html`에 카드(`modal-map-<키>`)와 버튼(`map-btn-<키>`)을 추가합니다.

### 지도 데이터 출처 (앱 화면에 표시 필수)
- 통계청 SGIS 행정구역·행정동 경계 (공공누리 제1유형: 출처 표시 시 상업적 이용 가능)
- vuski/admdongkor 행정동 경계 가공본 (CC BY 4.0) — https://github.com/vuski/admdongkor
- southkorea/seoul-maps 서울 자치구 경계 (KOSTAT 2013)
- Natural Earth 110m 육지(시작 연출용 세계 지도, 퍼블릭 도메인) — `assets/world_land.json`

---

## 📱 iOS 앱 빌드 (Capacitor)

웹 게임(`index.html`, `game.js`, `assets/`)을 Capacitor로 감싼 네이티브 iOS 프로젝트가 `ios/`에 있습니다.

### 준비물 (Mac)
- Xcode 최신 버전 (App Store)
- Node.js 20 이상
- Apple 개발자 계정 (실기기 테스트는 무료 Apple ID로도 가능, App Store 출시는 연 $99)

### 실행 순서
```bash
git pull
npm install
npm run ios:sync      # 웹 파일을 www/로 복사하고 iOS 프로젝트에 반영
npm run ios:open      # Xcode 열기
```
Xcode에서:
1. 왼쪽 `App` 프로젝트 → **Signing & Capabilities** → Team에 본인 Apple ID 선택
2. **Bundle Identifier**를 고유한 값으로 변경 (예: `com.본인이름.tapwar`) — `capacitor.config.json`의 `appId`도 같은 값으로
3. 아이폰을 USB로 연결하고 상단에서 기기 선택 → ▶ 실행
   (처음 실행 시 아이폰 설정 → 일반 → VPN 및 기기 관리에서 개발자 앱 신뢰 필요)

### 게임 코드를 수정한 뒤
`npm run ios:sync` 를 다시 실행하면 앱에 반영됩니다.

### 설정
- 세로 화면 고정, 앱 이름 `TAPWAR`
- 앱 아이콘: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024×1024)
- 스플래시: `ios/App/App/Assets.xcassets/Splash.imageset/`

### 큰 물(강·호수) 지정
외부 데이터 없이 `tools/water_spec.json`에 우리가 직접 정합니다.
- **호수·하구**: 기준점(`point`+`radius`) 또는 대략 그린 범위(`rough`) 안의 빈 공간(어느 구역에도 속하지 않는 곳)을 물로 채움 → 해안선·경계와 정확히 맞음
- **강**: `tools/korea_rivers_ne10m.json`(Natural Earth 10m 중심선)을 맵별 폭(`riverWidth`)으로 그림
- **물 건너 연결 보정**: 자동 판정이 틀리면 `maps[파일].waterLinksAdd / waterLinksRemove`에 구역 이름 쌍으로 지정
```bash
python tools/add_water.py assets/*_exact_zones.json          # 호수·강(근사) 추가
python tools/build_map.py assets/*_exact_zones.json          # 물 건너 연결 계산
python tools/add_water.py --carve assets/*_exact_zones.json  # 강을 실제 경계선을 따라 다시 그리고 양쪽 구역을 깎아 틈 제거
```
- 강은 최종적으로 **강을 사이에 둔 두 구역의 공유 경계선**을 따라 맵별 폭(`carveWidth`)으로 그려지고, 그만큼 구역이 깎여서 강과 구역 사이에 틈이 생기지 않습니다.

## 나라별 글로벌 순위 (Apple 게임 센터)

나라의 모든 맵을 클리어하면 **총 시간**(맵별 최고 기록의 합)이 그 나라 순위표에 제출됩니다. 낮을수록 높은 순위.

- 코드: `ios/App/App/GameCenterPlugin.swift`(게임 센터 연결), `ios/App/App/MainViewController.swift`(플러그인 등록), `game.js`의 `LEADERBOARDS`
- 설정 순서
  1. Xcode → App 타깃 → **Signing & Capabilities** → `+ Capability` → **Game Center** 추가
  2. App Store Connect → 앱 → **서비스(Services) → Game Center** → 순위표 추가
     - 유형: 클래식, 점수 형식: **경과 시간(초 단위)**, 정렬: **낮은 점수 우선**
     - 순위표 ID 예: `tapwar.leaderboard.kr.totaltime`
  3. 맵별 순위표도 같은 방식으로 추가: ID는 나라 ID의 `totaltime` 자리에 맵 키 소문자 (예: `tapwar.leaderboard.kr.ulsan`, `...kr.busan`, … `...kr.korea`)
  4. 만든 ID를 `game.js`의 `LEADERBOARDS.KR`에 넣기 (다른 나라는 `JP`, `CN` … 키로 추가)
- 웹 미리보기에서는 게임 센터가 없으므로 '순위 보기'가 안내 창만 띄웁니다.
